/*
 * Mimas runtime, v0.7: the party, Pokémon-style menus and battles, shops, saving.
 *
 * Included into main.cpp's anonymous namespace after the field code (it uses the world, the bag, gold, switches,
 * the fades). The numbers come from game/include/mimas_game.h (tools/gba_game.py), worked out by the editor with
 * the game's own rules, so the ROM fights like the playtest:
 *
 *   attack      the weapon's damage (or bare hands') x its class x (1 + (Strength - 10) / 50)
 *   a move      attack x the Addition's strikes added up x 1.1 (every strike lands), +-10%, x1.5 on a critical,
 *               x 50 / (defence + 50), x the Database's party damage
 *   spells      their power x (1 + (Magic - 10) / 50) against magic defence; they cost MP (moves don't)
 *   health      the Database's base + 2 for each point of Endurance over 10; each level adds the hero's growth
 *
 * Menus are drawn on one background made at run time (ui::), with the pixel font's letters as sprites.
 */

// ------------------------------------------------------------------------------------------------ the party

// Sounds: the baked chip sounds (game/audio), by their index in mimas::sounds (-1: none).
void sfx(int k)
{
    if(k >= 0 && k < mimas::sound_count && mimas::sounds[k])
    {
        mimas::sounds[k]->play();
    }
}

constexpr int MAX_PARTY = 6;
constexpr int MAX_KNOWN = mimas::max_additions + mimas::max_spells;

// Update 14: stats come from classes (everyone starts at 10; tenths keep the per-level fractions), health and magic
// grow by dice rolls, skill trees add stats and teach moves, and every move known stays (no four-move limit).
struct member
{
    int8_t hero;
    uint8_t level;
    int32_t xp;
    int16_t hp;
    int16_t mp;
    int16_t tenths[7];                    // their own stats x10 (before skills and gear)
    int16_t hp_roll;                      // health and magic their level ups rolled
    int16_t mp_roll;
    int8_t cls;                           // their class (-1 none)
    uint32_t classes;                     // classes unlocked (bits)
    uint32_t joined;                      // classes they've been (each gave its one-time boost)
    int8_t learned[MAX_KNOWN];            // every move, in the order learned: an Addition (k), or a spell (-(k + 1))
    uint8_t learned_count;
    uint8_t spells[mimas::max_spells];   // rank known (0: not)
    int16_t equip[4];                     // item, or -1
    uint8_t nodes[mimas::max_nodes];     // skill-tree ranks taken
    int16_t points;                       // skill points to spend
    uint8_t move_at;                      // where the battle list's cursor was
};

member party[MAX_PARTY];
int party_count = 0;
bn::random rng;
uint32_t play_frames = 0;
bn::sprite_text_generator* G = nullptr;   // the dark text for the white windows

// ------------------------------------------------------------------------------------------------ the game's lines

// Fill-ins for a line: tv().N("Jordan").M("Quick Strike") and so on.
struct tv
{
    const char* name = "";
    const char* foe = "";
    const char* target = "";
    const char* move = "";
    const char* item = "";
    const char* cls = "";
    int n = 0;
    int level = 0;

    tv& N(const char* v) { name = v; return *this; }
    tv& F(const char* v) { foe = v; return *this; }
    tv& T(const char* v) { target = v; return *this; }
    tv& M(const char* v) { move = v; return *this; }
    tv& I(const char* v) { item = v; return *this; }
    tv& C(const char* v) { cls = v; return *this; }
    tv& num(int v) { n = v; return *this; }
    tv& lv(int v) { level = v; return *this; }
};

[[nodiscard]] bool vowel(char c)
{
    return c == 'A' || c == 'E' || c == 'I' || c == 'O' || c == 'U' || c == 'a' || c == 'e' || c == 'i' || c == 'o' || c == 'u';
}

// A line in the game's own words (Database > Text & dialog, mimas::text_lines): one of its versions at random,
// filled in. "A {foe}" becomes "An ..." before a vowel, as in the playtest.
[[nodiscard]] bn::string<160> txt(int id, const tv& v = tv())
{
    const mimas::text_line& l = mimas::text_lines[id];
    const char* s = l.versions[l.count > 1 ? rng.get_int(l.count) : 0];
    bn::string<160> out;

    while(*s)
    {
        if(*s == '{')
        {
            const char* e = s + 1;
            while(*e && *e != '}') { ++e; }

            if(*e == '}')
            {
                bn::string_view k(s + 1, int(e - s - 1));
                bn::string<12> num;
                const char* val = nullptr;

                if(k == "name") { val = v.name; }
                else if(k == "foe") { val = v.foe; }
                else if(k == "target") { val = v.target; }
                else if(k == "move") { val = v.move; }
                else if(k == "item") { val = v.item; }
                else if(k == "class") { val = v.cls; }
                else if(k == "n") { num = bn::to_string<12>(v.n); }
                else if(k == "level") { num = bn::to_string<12>(v.level); }
                else { k = bn::string_view(); }

                if(! k.empty())
                {
                    bn::string_view w = val ? bn::string_view(val) : bn::string_view(num);
                    int z = out.size();

                    if(z >= 2 && out[z - 1] == ' ' && (out[z - 2] == 'A' || out[z - 2] == 'a') && (z == 2 || out[z - 3] == ' ') &&
                       ! w.empty() && vowel(w[0]) && z < out.max_size())
                    {
                        out[z - 1] = 'n';
                        out.push_back(' ');
                    }

                    for(char c : w)
                    {
                        if(out.size() < out.max_size()) { out.push_back(c); }
                    }

                    s = e + 1;
                    continue;
                }
            }
        }

        if(out.size() < out.max_size()) { out.push_back(*s); }
        ++s;
    }

    return out;
}

struct totals
{
    int attrs[7];
    int armour;
    int magic_armour;
    int crit;
};

[[nodiscard]] int stat_of(const member& m, int k)
{
    return bn::max(1, bn::min(100, m.tenths[k] / 10));
}

// How their class handles an item: 0 trained, 1 untrained (weaker), 2 can't use.
[[nodiscard]] int gear_skill(const member& m, int item)
{
    if(item < 0 || m.cls < 0 || mimas::class_count == 0) { return 0; }
    int k = mimas::items[item].gear_kind;
    return k >= 0 && k < mimas::gear_kind_count ? mimas::classes[m.cls].gear[k] : 0;
}

[[nodiscard]] totals totals_of(const member& m)
{
    totals t;
    int crit = 0;
    t.armour = t.magic_armour = 0;

    for(int k = 0; k < 7; ++k)
    {
        t.attrs[k] = stat_of(m, k);
    }

    // Skill-tree skills: their stats for each rank taken.
    for(int n = 0; n < mimas::node_count; ++n)
    {
        if(m.nodes[n])
        {
            for(int k = 0; k < 7; ++k) { t.attrs[k] += mimas::nodes[n].stats[k] * m.nodes[n]; }
        }
    }

    for(int s = 0; s < 4; ++s)
    {
        if(m.equip[s] < 0)
        {
            continue;
        }

        const mimas::item_def& it = mimas::items[m.equip[s]];

        for(int k = 0; k < 7; ++k)
        {
            t.attrs[k] += it.bonus[k];
        }

        // Untrained armor costs its type's stats.
        if(s == mimas::ARMOR && gear_skill(m, m.equip[s]) == 1)
        {
            for(int k = 0; k < 7; ++k) { t.attrs[k] += mimas::gear_kinds[it.gear_kind].untrained[k]; }
        }

        crit += it.crit;

        if(s != mimas::WEAPON)
        {
            t.armour += it.defense;
            t.magic_armour += it.magic_defense;
        }
    }

    for(int k = 0; k < 7; ++k)
    {
        t.attrs[k] = bn::max(1, bn::min(100, t.attrs[k]));
    }

    t.armour += t.attrs[mimas::DEF] - 10;
    t.magic_armour += t.attrs[mimas::MDF] - 10;
    t.crit = bn::max(0, bn::min(100, 5 + crit + (t.attrs[mimas::DEX] - 10) / 4));
    return t;
}

[[nodiscard]] int max_hp(const member& m)
{
    return bn::max(1, mimas::base_hp + (totals_of(m).attrs[mimas::END] - 10) * 2 + m.hp_roll);
}

[[nodiscard]] int max_mp(const member& m)
{
    return bn::max(0, mimas::base_mp + m.mp_roll);
}

// x100 (an untrained weapon hits for three quarters)
[[nodiscard]] int attack_of(const member& m)
{
    int w = m.equip[mimas::WEAPON];
    int base = w >= 0 ? mimas::items[w].attack : mimas::unarmed_attack;
    int a = base * (40 + totals_of(m).attrs[mimas::STR]) / 50;
    return gear_skill(m, w) == 1 ? a * 3 / 4 : a;
}

[[nodiscard]] int xp_to_next(int level)
{
    return level >= mimas::max_level ? 0 : mimas::xp_table[level - 1];
}

[[nodiscard]] const char* name_of(const member& m)
{
    return mimas::heroes[m.hero].name;
}

[[nodiscard]] const char* class_name(const member& m)
{
    return m.cls >= 0 && m.cls < mimas::class_count ? mimas::classes[m.cls].name : "-";
}

// A move: an Addition (a >= 0) or a spell (-(spell + 1)).
[[nodiscard]] const char* move_name(int mv)
{
    return mv >= 0 ? mimas::additions[mv].name : mimas::spells[-mv - 1].name;
}

[[nodiscard]] bool knows(const member& m, int mv)
{
    for(int k = 0; k < m.learned_count; ++k)
    {
        if(m.learned[k] == mv) { return true; }
    }

    return false;
}

// Learn a move (nothing is ever forgotten): false if they knew it.
bool add_move(member& m, int mv)
{
    if(knows(m, mv) || m.learned_count >= MAX_KNOWN)
    {
        return false;
    }

    m.learned[m.learned_count++] = int8_t(mv);
    if(mv < 0 && m.spells[-mv - 1] == 0) { m.spells[-mv - 1] = 1; }
    return true;
}

// The move list, as battles show it: Additions weakest first (their power; ties in the order learned), then
// spells cheapest first (MP; ties in the order learned). Returns how many; *spells_at: where the spells start.
int move_list(const member& m, int8_t* out, int* spells_at)
{
    int n = 0;

    for(int k = 0; k < m.learned_count; ++k)
    {
        if(m.learned[k] >= 0) { out[n++] = m.learned[k]; }
    }

    // Insertion sorts keep the order learned for ties.
    for(int i = 1; i < n; ++i)
    {
        int8_t v = out[i];
        int j = i;
        while(j > 0 && mimas::additions[out[j - 1]].power > mimas::additions[v].power) { out[j] = out[j - 1]; --j; }
        out[j] = v;
    }

    *spells_at = n;
    auto cost = [&m](int mv) { int s = -mv - 1; return int(mimas::spells[s].ranks[bn::max(1, int(m.spells[s])) - 1].mp); };

    for(int k = 0; k < m.learned_count; ++k)
    {
        if(m.learned[k] < 0) { out[n++] = m.learned[k]; }
    }

    for(int i = *spells_at + 1; i < n; ++i)
    {
        int8_t v = out[i];
        int j = i;
        while(j > *spells_at && cost(out[j - 1]) > cost(v)) { out[j] = out[j - 1]; --j; }
        out[j] = v;
    }

    return n;
}

// The class's growth for one level: its stat bonuses (tenths), a health roll, a magic roll, skill points.
void grow_level(member& m)
{
    int hp_die = 8, mp_die = 6;

    if(m.cls >= 0 && m.cls < mimas::class_count)
    {
        const mimas::class_def& c = mimas::classes[m.cls];
        for(int k = 0; k < 7; ++k) { m.tenths[k] = int16_t(bn::min(1000, m.tenths[k] + c.per_level[k])); }
        hp_die = c.hp_die;
        mp_die = c.mp_die;
    }

    m.hp_roll = int16_t(m.hp_roll + 1 + rng.get_int(bn::max(1, hp_die)));
    m.mp_roll = int16_t(m.mp_roll + 1 + rng.get_int(bn::max(1, mp_die)));
    m.points = int16_t(m.points + mimas::points_per_level);
}

// Join a class: its one-time boost the first time ever. The new class's numbers count from the next level.
void join_class(member& m, int cls)
{
    if(cls < 0 || cls >= mimas::class_count)
    {
        return;
    }

    m.cls = int8_t(cls);
    m.classes |= 1u << cls;

    if(! ((m.joined >> cls) & 1))
    {
        m.joined |= 1u << cls;
        for(int k = 0; k < 7; ++k) { m.tenths[k] = int16_t(bn::max(10, bn::min(1000, m.tenths[k] + mimas::classes[cls].bonus[k] * 10))); }
    }
}

// A hero joining at this level: 10 in every stat, their starting class (its boost, and level - 1 levels of its
// growth), their moves, spells and gear.
[[nodiscard]] member new_member(int hero, int level)
{
    const mimas::hero_def& h = mimas::heroes[hero];
    member m = {};
    m.hero = int8_t(hero);
    m.level = uint8_t(bn::max(1, bn::min(mimas::max_level, level)));
    m.cls = -1;
    m.points = int16_t(mimas::start_points);

    for(int k = 0; k < 7; ++k)
    {
        m.tenths[k] = 100;
    }

    join_class(m, h.cls);

    for(int l = 1; l < m.level; ++l)
    {
        grow_level(m);
    }

    for(int k = 0; k < mimas::max_spells; ++k)
    {
        m.spells[k] = h.spells[k];
    }

    for(int k = 0; k < h.move_count; ++k)
    {
        add_move(m, h.moves[k]);
    }

    for(int s = 0; s < 4; ++s)
    {
        m.equip[s] = h.gear[s];
    }

    m.hp = int16_t(max_hp(m));
    m.mp = int16_t(max_mp(m));
    return m;
}

void heal_all()
{
    for(int i = 0; i < party_count; ++i)
    {
        party[i].hp = int16_t(max_hp(party[i]));
        party[i].mp = int16_t(max_mp(party[i]));
    }
}

void new_party()
{
    party_count = 0;

    for(int h = 0; h < mimas::hero_count && party_count < MAX_PARTY; ++h)
    {
        if(h == 0 || mimas::heroes[h].starts)
        {
            party[party_count++] = new_member(h, bn::max(1, int(mimas::heroes[h].join_level)));
        }
    }
}

// EXP: the levels gained (each grows them by their class; health and magic grow with their maximums).
int gain_xp(member& m, int xp)
{
    int before = max_hp(m), before_mp = max_mp(m);
    int ups = 0;
    m.xp += xp;

    while(m.level < mimas::max_level && m.xp >= xp_to_next(m.level))
    {
        m.xp -= xp_to_next(m.level);
        ++m.level;
        ++ups;
        grow_level(m);
    }

    if(m.level >= mimas::max_level)
    {
        m.xp = 0;
    }

    if(m.hp > 0)
    {
        m.hp = int16_t(bn::min(max_hp(m), m.hp + bn::max(0, max_hp(m) - before)));
    }

    m.mp = int16_t(bn::min(max_mp(m), m.mp + bn::max(0, max_mp(m) - before_mp)));
    return ups;
}

[[nodiscard]] int first_standing()
{
    for(int i = 0; i < party_count; ++i)
    {
        if(party[i].hp > 0)
        {
            return i;
        }
    }

    return -1;
}

// ------------------------------------------------------------------------------------------------ text

// Words wrapped to lines no wider than `width` pixels (\n between lines).
[[nodiscard]] bn::string<320> wrap(const bn::string_view& in, int width)
{
    bn::string<320> out;
    bn::string<64> line;
    bn::string<64> word;
    int at = 0;
    int n = in.size();

    auto flush_word = [&]()
    {
        if(word.empty())
        {
            return;
        }

        bn::string<64> test = line;

        if(! test.empty())
        {
            test.push_back(' ');
        }

        test += word;

        if(! line.empty() && G->width(test) > width)
        {
            out += line;
            out.push_back('\n');
            line = word;
        }
        else
        {
            line = test;
        }

        word.clear();
    };

    while(at <= n)
    {
        char c = at < n ? in[at] : '\0';

        if(c == ' ' || c == '\n' || c == '\0')
        {
            flush_word();

            if(c == '\n' || c == '\0')
            {
                out += line;

                if(c == '\n')
                {
                    out.push_back('\n');
                }

                line.clear();
            }
        }
        else if(word.size() < 60)
        {
            word.push_back(c);
        }

        ++at;
    }

    return out;
}

// ------------------------------------------------------------------------------------------------ the window layer

namespace ui
{
    constexpr int T_WHITE = 1;
    constexpr int T_FRAME = 2;    // 2-9: top-left, top, top-right, left, right, bottom-left, bottom, bottom-right
    constexpr int T_BAR = 10;     // + colour * 9 + pixels (0-8)
    constexpr int T_BAR_L = 37;
    constexpr int T_BAR_R = 38;
    constexpr int T_XBAR = 40;    // + pixels (0-8): the EXP bar
    constexpr int T_XBAR_L = 49;
    constexpr int T_XBAR_R = 50;

    alignas(int) bn::regular_bg_map_cell cells[32 * 32];
    bn::optional<bn::regular_bg_map_item> map_item;
    bn::optional<bn::regular_bg_ptr> bg;
    int users = 0;

    void open()
    {
        if(users++ == 0)
        {
            bn::memory::clear(cells);
            map_item.emplace(cells[0], bn::size(32, 32));
            bn::bg_tiles::set_allow_offset(false);
            bn::regular_bg_item item(bn::regular_bg_tiles_items::ui_tiles, bn::bg_palette_items::ui_palette, *map_item);
            bg = item.create_bg(8, 48);   // its top-left corner on the screen's
            bn::bg_tiles::set_allow_offset(true);
            bg->set_priority(0);
        }
    }

    void close()
    {
        if(users > 0 && --users == 0)
        {
            bg.reset();
        }
    }

    void commit()
    {
        if(bg)
        {
            bn::regular_bg_map_ptr map = bg->map();
            map.reload_cells_ref();
        }
    }

    void set(int x, int y, int tile)
    {
        if(x < 0 || y < 0 || x >= 32 || y >= 32)
        {
            return;
        }

        bn::regular_bg_map_cell_info info(cells[y * 32 + x]);
        info.set_tile_index(tile);
        info.set_palette_id(0);
        cells[y * 32 + x] = info.cell();
    }

    // A white window with a blue frame, in tiles (8 x 8 pixels).
    void box(int x, int y, int w, int h)
    {
        for(int j = 0; j < h; ++j)
        {
            for(int i = 0; i < w; ++i)
            {
                bool top = j == 0, bottom = j == h - 1, left = i == 0, right = i == w - 1;
                int t = T_WHITE;

                if(top) { t = left ? T_FRAME : right ? T_FRAME + 2 : T_FRAME + 1; }
                else if(bottom) { t = left ? T_FRAME + 5 : right ? T_FRAME + 7 : T_FRAME + 6; }
                else if(left) { t = T_FRAME + 3; }
                else if(right) { t = T_FRAME + 4; }

                set(x + i, y + j, t);
            }
        }

        commit();
    }

    void clear(int x, int y, int w, int h)
    {
        for(int j = 0; j < h; ++j)
        {
            for(int i = 0; i < w; ++i)
            {
                set(x + i, y + j, 0);
            }
        }

        commit();
    }

    void clear_all()
    {
        clear(0, 0, 32, 32);
    }

    // A health bar 6 tiles long (48 pixels) at tile (x, y), `have` of `max` full.
    void bar(int x, int y, int have, int max, bool draw = true)
    {
        int px = max > 0 ? bn::max(have > 0 ? 1 : 0, have * 48 / max) : 0;
        int colour = px > 24 ? 0 : px > 9 ? 1 : 2;
        set(x - 1, y, T_BAR_L);
        set(x + 6, y, T_BAR_R);

        for(int i = 0; i < 6; ++i)
        {
            set(x + i, y, T_BAR + colour * 9 + bn::max(0, bn::min(8, px - i * 8)));
        }

        if(draw)
        {
            commit();
        }
    }

    // The EXP bar: `n` tiles wide, blue.
    void xbar(int x, int y, int have, int max, int n, bool draw = true)
    {
        int px = max > 0 ? bn::max(0, bn::min(n * 8, have * n * 8 / max)) : 0;
        set(x - 1, y, T_XBAR_L);
        set(x + n, y, T_XBAR_R);

        for(int i = 0; i < n; ++i)
        {
            set(x + i, y, T_XBAR + bn::max(0, bn::min(8, px - i * 8)));
        }

        if(draw)
        {
            commit();
        }
    }

    // Text at a screen point (its top-left; lines are 16 pixels tall).
    void text(int px, int py, const bn::string_view& s, bn::ivector<bn::sprite_ptr>& out)
    {
        if(! s.empty())
        {
            G->generate(px - HALF_W, py + 8 - HALF_H, s, out);
        }
    }

    void text_right(int px, int py, const bn::string_view& s, bn::ivector<bn::sprite_ptr>& out)
    {
        text(px - G->width(s), py, s, out);
    }

    // The text box (bottom of the screen) page by page, two lines a page; A or B for the next.
    // `hold`: the last page stays up (a question comes next). `x`, `w`: a narrower box (battles).
    bn::vector<bn::sprite_ptr, 40> said;

    void unsay(int x = 0, int w = 30)
    {
        said.clear();
        clear(x, 14, w, 6);
    }

    void say(const bn::string_view& text_in, bool hold = false, int x = 0, int w = 30)
    {
        open();
        box(x, 14, w, 6);
        bn::string<320> t = wrap(text_in, w * 8 - 24);
        const char* p = t.c_str();

        while(true)
        {
            said.clear();

            for(int line = 0; line < 2 && *p; ++line)
            {
                const char* end = p;

                while(*end && *end != '\n')
                {
                    ++end;
                }

                text(x * 8 + 12, 118 + line * 16, bn::string_view(p, end - p), said);
                p = *end ? end + 1 : end;
            }

            if(! *p && hold)
            {
                close();
                return;
            }

            wait_for_button();

            if(! *p)
            {
                break;
            }
        }

        unsay(x, w);
        bn::core::update();
        close();
    }
}

// ------------------------------------------------------------------------------------------------ lists

struct row
{
    char label[24];
    char right[14];
    char sub[14];      // (the FIGHT box: a move's type)
    int16_t icon;      // an item's icon (k), -100 - h a hero's face, -1 none
    int16_t bar;       // health bar: have (bar_max > 0)
    int16_t bar_max;
    bool off;
    bool divider;      // a heading inside the list ("[ Spells ]"): the cursor passes over it
};

void set_row(row& r, const char* label, const char* right = "", int icon = -1, bool off = false)
{
    r = row{};
    bn::string_view l(label), rt(right);
    int n = bn::min(l.size(), 23), m = bn::min(rt.size(), 13);

    for(int k = 0; k < n; ++k) { r.label[k] = l[k]; }
    for(int k = 0; k < m; ++k) { r.right[k] = rt[k]; }

    r.icon = int16_t(icon);
    r.off = off;
}

struct list_spec
{
    int x = 0, y = 0, w = 10;       // tiles
    int visible = 6;                 // lines shown
    int row_h = 16;                  // pixels (16, or 24 with a health bar)
    const char* title = nullptr;
    const char* (*detail)(int) = nullptr;   // a description box at the bottom for the chosen line
    bool sides = false;              // left / right return -2 / -3 (the bag's pockets)
    bool cancel = true;
};

// A list in a window: up / down, A chooses (its index), B -1. The window is cleared when it returns.
int pick(const row* rows, int n, const list_spec& s, int start = 0)
{
    ui::open();
    int title_h = s.title ? 16 : 0;
    int vis = bn::max(1, bn::min(s.visible, n));
    bool scrolls = n > vis;
    int h_tiles = (title_h + vis * s.row_h + 8 + (scrolls ? 8 : 0) + 7) / 8;
    int at = bn::max(0, bn::min(n - 1, start)), top = 0;
    bn::vector<bn::sprite_ptr, 64> sprites;
    bn::vector<bn::sprite_ptr, 6> icons;
    bn::vector<bn::sprite_ptr, 24> detail;
    bn::sprite_ptr cursor = bn::sprite_items::cursor.create_sprite(0, 0);
    cursor.set_bg_priority(0);
    int result = -1;
    bool redraw = true;
    int shown_detail = -1;

    while(true)
    {
        if(at < top) { top = at; redraw = true; }
        if(at >= top + vis) { top = at - vis + 1; redraw = true; }

        if(redraw)
        {
            redraw = false;
            sprites.clear();
            icons.clear();
            ui::box(s.x, s.y, s.w, h_tiles);
            int px = s.x * 8, py = s.y * 8 + 4;

            if(s.title)
            {
                ui::text(px + 12, py, s.title, sprites);
            }

            for(int k = 0; k < vis && top + k < n; ++k)
            {
                const row& r = rows[top + k];
                int ry = py + title_h + k * s.row_h;
                int lx = px + 14;

                if(r.icon >= 0 || r.icon <= -100)
                {
                    const bn::sprite_item& item = r.icon >= 0 ? *mimas::items[r.icon].icon : *mimas::heroes[-100 - r.icon].face;
                    bn::sprite_ptr ic = item.create_sprite(lx + 8 - HALF_W, ry + 8 - HALF_H);
                    ic.set_bg_priority(0);
                    icons.push_back(ic);
                    lx += 19;
                }

                ui::text(r.divider ? px + s.w * 4 - G->width(r.label) / 2 : lx, ry, r.label, sprites);
                ui::text_right(px + s.w * 8 - 10, ry, r.right, sprites);

                if(r.bar_max > 0)
                {
                    ui::bar(lx / 8 + 2, (ry + 16) / 8, r.bar, r.bar_max, false);
                }
            }

            // More above / below: arrows under the list, in its middle.
            if(scrolls)
            {
                int ay = py + title_h + vis * s.row_h - 4;
                if(top > 0) { ui::text(px + s.w * 4 - 12, ay, "^", sprites); }
                if(top + vis < n) { ui::text(px + s.w * 4 + 4, ay, "v", sprites); }
            }

            ui::commit();
            shown_detail = -1;
        }

        cursor.set_position(s.x * 8 + 8 - HALF_W, s.y * 8 + 4 + title_h + (at - top) * s.row_h + 8 - HALF_H);

        if(s.detail && shown_detail != at)
        {
            shown_detail = at;
            detail.clear();
            ui::box(0, 14, 30, 6);
            const char* d = s.detail(at);

            if(d && *d)
            {
                bn::string<320> t = wrap(d, 216);
                const char* p = t.c_str();

                for(int line = 0; line < 2 && *p; ++line)
                {
                    const char* end = p;
                    while(*end && *end != '\n') { ++end; }
                    ui::text(12, 118 + line * 16, bn::string_view(p, end - p), detail);
                    p = *end ? end + 1 : end;
                }
            }
        }

        bn::core::update();

        if(bn::keypad::up_pressed()) { do { at = (at + n - 1) % n; } while(rows[at].divider && n > 1); sfx(mimas::snd_menuMove); }
        else if(bn::keypad::down_pressed()) { do { at = (at + 1) % n; } while(rows[at].divider && n > 1); sfx(mimas::snd_menuMove); }
        else if(s.sides && bn::keypad::left_pressed()) { result = -2; sfx(mimas::snd_menuMove); break; }
        else if(s.sides && bn::keypad::right_pressed()) { result = -3; sfx(mimas::snd_menuMove); break; }
        else if(bn::keypad::a_pressed() && ! rows[at].off && ! rows[at].divider) { result = at; sfx(mimas::snd_menuOk); break; }
        else if(bn::keypad::a_pressed()) { sfx(mimas::snd_dodge); }
        else if(bn::keypad::b_pressed() && s.cancel) { result = -1; sfx(mimas::snd_menuBack); break; }
    }

    sprites.clear();
    icons.clear();
    detail.clear();
    ui::clear(s.x, s.y, s.w, h_tiles);

    if(s.detail)
    {
        ui::clear(0, 14, 30, 6);
    }

    bn::core::update();
    ui::close();
    return result;
}

BN_DATA_EWRAM_BSS row ROWS_A[100];
BN_DATA_EWRAM_BSS row ROWS_B[MAX_KNOWN + 2];
BN_DATA_EWRAM_BSS row ROWS_C[34];

// A question in the text box, YES / NO beside it: true for YES.
bool ask(const bn::string_view& text)
{
    ui::open();
    ui::say(text, true);
    set_row(ROWS_C[0], "YES");
    set_row(ROWS_C[1], "NO");
    list_spec s;
    s.x = 22; s.y = 8; s.w = 8; s.visible = 2;
    int k = pick(ROWS_C, 2, s);
    ui::unsay();
    ui::close();
    return k == 0;
}

void say(const bn::string_view& text)
{
    ui::say(text);
}

// "How many?": up / down by one, left / right by ten. 0 for B.
int how_many(int most, int price)
{
    ui::open();
    int n = 1;
    bn::vector<bn::sprite_ptr, 8> sprites;
    ui::box(16, 9, 14, 4);

    while(true)
    {
        sprites.clear();
        bn::string<24> t = "x";
        if(n < 10) { t += "0"; }
        t += bn::to_string<8>(n);
        ui::text(16 * 8 + 12, 9 * 8 + 8, t, sprites);

        if(price >= 0)
        {
            bn::string<24> pr = "$";
            pr += bn::to_string<10>(price * n);
            ui::text_right(30 * 8 - 10, 9 * 8 + 8, pr, sprites);
        }

        bn::core::update();

        if(bn::keypad::up_pressed()) { n = n >= most ? 1 : n + 1; }
        else if(bn::keypad::down_pressed()) { n = n <= 1 ? most : n - 1; }
        else if(bn::keypad::right_pressed()) { n = bn::min(most, n + 10); }
        else if(bn::keypad::left_pressed()) { n = bn::max(1, n - 10); }
        else if(bn::keypad::a_pressed()) { break; }
        else if(bn::keypad::b_pressed()) { n = 0; break; }
    }

    sprites.clear();
    ui::clear(16, 9, 14, 4);
    bn::core::update();
    ui::close();
    return n;
}

// ------------------------------------------------------------------------------------------------ the party menu

[[nodiscard]] bn::string<32> lv_text(const member& m)
{
    bn::string<32> t = "Lv";
    t += bn::to_string<4>(m.level);
    t += m.hp > 0 ? "  " : "  KO ";
    t += bn::to_string<6>(bn::max(0, int(m.hp)));
    t += "/";
    t += bn::to_string<6>(max_hp(m));
    return t;
}

void party_rows()
{
    for(int i = 0; i < party_count; ++i)
    {
        bn::string<32> right = lv_text(party[i]);
        set_row(ROWS_A[i], name_of(party[i]), right.c_str(), -100 - party[i].hero);
        ROWS_A[i].bar = party[i].hp;
        ROWS_A[i].bar_max = int16_t(max_hp(party[i]));
    }
}

// Choose a party member: their place, or -1.
int pick_member(const char* title)
{
    party_rows();
    list_spec s;
    s.x = 0; s.y = 0; s.w = 30; s.visible = 6; s.row_h = 24; s.title = title;
    s.visible = bn::min(6, title ? 5 : 6);
    return pick(ROWS_A, party_count, s);
}

int8_t list_ids[MAX_KNOWN + 2];   // the move list's rows: a move, or 127 for the divider

// A move's details for the box under a list: its type (or GUARD), then its description.
const char* move_detail(int k)
{
    static bn::string<200> d;
    int mv = list_ids[k];
    d.clear();

    if(mv == 127)
    {
        return "";
    }

    if(mv >= 0)
    {
        const mimas::addition_def& a = mimas::additions[mv];
        d = a.guard >= 0 ? "GUARD" : mimas::element_names[a.element];
        d += " - ";
        d += bn::to_string<4>(a.hits);
        d += a.hits == 1 ? " hit. " : " hits. ";
        d += a.description;
    }
    else
    {
        const mimas::spell_def& sp = mimas::spells[-mv - 1];
        d = mimas::element_names[sp.element];
        d += sp.kind == 1 ? " - heals. " : " - spell. ";
        d += sp.description;
    }

    return d.c_str();
}

// The move list as rows (Additions, a "[ Spells ]" divider, spells), each with its MP (GUARD for a guard). In battle
// (`mp` >= 0), ones they can't use now (too little MP, silenced) are greyed. Returns how many rows.
int move_list_rows(const member& m, row* out, int mp = -1, bool silenced = false)
{
    int8_t mv[MAX_KNOWN];
    int sat;
    int n = move_list(m, mv, &sat);
    int r = 0;

    for(int k = 0; k < n; ++k)
    {
        if(k == sat)
        {
            set_row(out[r], "[ Spells ]");
            out[r].divider = true;
            list_ids[r++] = 127;
        }

        bn::string<12> right;
        int cost;

        if(mv[k] < 0)
        {
            int sp = -mv[k] - 1;
            cost = mimas::spells[sp].ranks[bn::max(1, int(m.spells[sp])) - 1].mp;
            right = bn::to_string<4>(cost);
            right += " MP";
        }
        else
        {
            const mimas::addition_def& a = mimas::additions[mv[k]];
            cost = a.mp;
            if(a.guard >= 0) { right = "GUARD "; }
            right += bn::to_string<4>(a.mp);
            right += " MP";
        }

        set_row(out[r], move_name(mv[k]), right.c_str(), -1, mp >= 0 && (cost > mp || (mv[k] < 0 && silenced)));
        list_ids[r++] = mv[k];
    }

    return r;
}

void summary(const member& m)
{
    totals t = totals_of(m);
    constexpr const char* names[] = { "STRENGTH", "DEXTERITY", "AGILITY", "ENDURANCE", "DEFENCE", "MAGIC", "MAGIC DEF." };
    int n = 0;
    auto line = [&](const char* label, int v, int of = -1)
    {
        bn::string<16> r = bn::to_string<8>(v);

        if(of >= 0)
        {
            r += "/";
            r += bn::to_string<8>(of);
        }

        set_row(ROWS_A[n++], label, r.c_str());
    };
    line("LEVEL", m.level);
    set_row(ROWS_A[n++], "CLASS", class_name(m));
    line("SKILL POINTS", m.points);
    line("HP", m.hp, max_hp(m));
    line("MP", m.mp, max_mp(m));
    line("EXP TO NEXT", bn::max(0, xp_to_next(m.level) - int(m.xp)));
    line("ATTACK", attack_of(m) / 100);
    line("ARMOUR", t.armour);

    for(int k = 0; k < 7; ++k)
    {
        line(names[k], t.attrs[k]);
    }

    list_spec s;
    s.x = 2; s.y = 0; s.w = 26; s.visible = 8; s.title = name_of(m);
    pick(ROWS_A, n, s);
}

// Their moves (nothing to choose: they all come to battle), with each one's details.
void moves_menu(member& m)
{
    int n = move_list_rows(m, ROWS_B);

    if(! n)
    {
        say("No moves.");
        return;
    }

    list_spec s;
    s.x = 2; s.y = 0; s.w = 26; s.visible = 5; s.title = "MOVES"; s.detail = move_detail;
    int at = 0;

    while(true)
    {
        int k = pick(ROWS_B, n, s, at);
        if(k < 0) { return; }
        at = k;
    }
}

// Gear on (from the bag) or off (back into it).
void equip_item(member& m, int slot, int item)
{
    if(m.equip[slot] >= 0)
    {
        bag[m.equip[slot]] = uint8_t(bn::min(99, bag[m.equip[slot]] + 1));
    }

    if(item >= 0 && bag[item] > 0)
    {
        --bag[item];
    }

    m.equip[slot] = int16_t(item);
    m.hp = int16_t(bn::min(int(m.hp), max_hp(m)));
}

void equip_menu(member& m)
{
    constexpr const char* slots[] = { "WEAPON", "SHIELD", "ARMOR", "ACCESSORY" };

    while(true)
    {
        for(int s = 0; s < 4; ++s)
        {
            set_row(ROWS_B[s], slots[s], m.equip[s] >= 0 ? mimas::items[m.equip[s]].name : "-", m.equip[s] >= 0 ? m.equip[s] : -1);
        }

        list_spec ls;
        ls.x = 1; ls.y = 0; ls.w = 28; ls.visible = 4; ls.title = "GEAR";
        int k = pick(ROWS_B, 4, ls);

        if(k < 0)
        {
            return;
        }

        int16_t ids[16];
        int c = 0;

        for(int i = 0; i < mimas::item_count && c < 15; ++i)
        {
            if(bag[i] && mimas::items[i].kind == 2 && mimas::items[i].slot == k)
            {
                // Greyed: their class can't use it.
                set_row(ROWS_C[c], mimas::items[i].name, "", i, gear_skill(m, i) == 2);
                ids[c++] = int16_t(i);
            }
        }

        if(m.equip[k] >= 0)
        {
            set_row(ROWS_C[c], "REMOVE");
            ids[c++] = -1;
        }

        if(! c)
        {
            say("Nothing in the bag goes there.");
            continue;
        }

        list_spec ls2;
        ls2.x = 4; ls2.y = 2; ls2.w = 22; ls2.visible = 5; ls2.title = slots[k];
        int j = pick(ROWS_C, c, ls2);

        if(j >= 0)
        {
            equip_item(m, k, ids[j]);
        }
    }
}

void party_menu()
{
    int at = 0;

    while(true)
    {
        party_rows();
        list_spec s;
        s.x = 0; s.y = 0; s.w = 30; s.visible = 6; s.row_h = 24;
        int i = pick(ROWS_A, party_count, s, at);

        if(i < 0)
        {
            return;
        }

        at = i;
        set_row(ROWS_B[0], "SUMMARY");
        set_row(ROWS_B[1], "MOVES");
        set_row(ROWS_B[2], "EQUIP");
        set_row(ROWS_B[3], "SWITCH", "", -1, party_count < 2);
        set_row(ROWS_B[4], "CANCEL");
        list_spec o;
        o.x = 20; o.y = 8; o.w = 10; o.visible = 5;
        int k = pick(ROWS_B, 5, o);

        if(k == 0) { summary(party[i]); }
        else if(k == 1) { moves_menu(party[i]); }
        else if(k == 2) { equip_menu(party[i]); }
        else if(k == 3)
        {
            int j = pick_member("Move to where?");

            if(j >= 0 && j != i)
            {
                member t = party[i];
                party[i] = party[j];
                party[j] = t;
            }
        }
    }
}

// Learning a move: it joins their list (nothing is ever forgotten).
void learn_move(member& m, int a, bool silent)
{
    // a: an Addition, or a spell (-(k + 1); learn_spell has set its rank already).
    if(a >= mimas::addition_count || a < -mimas::spell_count || (a >= 0 && mimas::heroes[m.hero].no_additions))
    {
        return;
    }

    bool fresh = add_move(m, a);

    if(! silent)
    {
        say(txt(fresh ? mimas::T_learn_learned : mimas::T_learn_knows, tv().N(name_of(m)).M(move_name(a))));
    }
}

void learn_spell(member& m, int sp, int rank, bool silent)
{
    if(sp < 0 || sp >= mimas::spell_count)
    {
        return;
    }

    int r = bn::max(1, bn::min(int(mimas::spells[sp].rank_count), rank));

    if(m.spells[sp] >= r)
    {
        return;
    }

    bool fresh = m.spells[sp] == 0;
    m.spells[sp] = uint8_t(r);

    // A new spell joins their move list.
    if(fresh)
    {
        learn_move(m, -(sp + 1), silent);
        return;
    }

    if(! silent)
    {
        bn::string<160> t = txt(mimas::T_learn_learned, tv().N(name_of(m)).M(mimas::spells[sp].name));
        say(t);
    }
}

// ------------------------------------------------------------------------------------------------ the bag

int pocket = 0;   // 0 items, 1 gear, 2 key items
int bag_ids[100];

[[nodiscard]] int pocket_of(int item)
{
    int k = mimas::items[item].kind;
    return k == 2 ? 1 : k == 1 ? 2 : 0;
}

const char* item_detail(int k)
{
    return bag_ids[k] >= 0 ? mimas::items[bag_ids[k]].description : "";
}

// The bag's lines for a pocket (`sell`: prices for selling). Returns how many (with CLOSE BAG last).
int bag_rows(int p, bool sell)
{
    int n = 0;

    for(int i = 0; i < mimas::item_count && n < 98; ++i)
    {
        if(bag[i] && pocket_of(i) == p)
        {
            bn::string<12> r;

            if(sell)
            {
                r = "$";
                r += bn::to_string<8>(mimas::items[i].price / 2);
            }
            else if(p != 2)
            {
                r = "x";
                r += bn::to_string<4>(bag[i]);
            }

            set_row(ROWS_A[n], mimas::items[i].name, r.c_str(), i, sell && (mimas::items[i].no_sell || mimas::items[i].price <= 0));
            bag_ids[n++] = i;
        }
    }

    set_row(ROWS_A[n], sell ? "CANCEL" : "CLOSE BAG");
    bag_ids[n++] = -1;
    return n;
}

// Use a healing item on a party member (out of battle, or in it: `who`). True if it was used.
bool use_item(int item, int who)
{
    const mimas::item_def& it = mimas::items[item];
    member& m = party[who];
    int mh = max_hp(m), mm = max_mp(m);
    int hp = it.hp + it.hp_pct * mh / 100, mp = it.mp + it.mp_pct * mm / 100;
    int before_hp = m.hp, before_mp = m.mp;

    if(m.hp <= 0 && ! it.revive)
    {
        say(txt(mimas::T_item_no_effect));
        return false;
    }

    if(it.revive && m.hp <= 0) { m.hp = int16_t(bn::max(1, bn::min(mh, hp ? hp : mh / 2))); }
    else { m.hp = int16_t(bn::min(mh, m.hp + hp)); }

    m.mp = int16_t(bn::min(mm, m.mp + mp));

    if(m.hp == before_hp && m.mp == before_mp)
    {
        say(txt(mimas::T_item_no_effect));
        return false;
    }

    --bag[item];
    bn::string<160> t = name_of(m);

    if(before_hp <= 0)
    {
        t = txt(mimas::T_item_revived, tv().N(name_of(m)));
    }
    else
    {
        t += " recovered ";

        if(m.hp > before_hp) { t += bn::to_string<6>(m.hp - before_hp); t += " HP"; }
        if(m.hp > before_hp && m.mp > before_mp) { t += " and "; }
        if(m.mp > before_mp) { t += bn::to_string<6>(m.mp - before_mp); t += " MP"; }

        t += ".";
    }

    say(t);
    return true;
}

constexpr const char* POCKETS[] = { "< ITEMS >", "< GEAR >", "< KEY ITEMS >" };

void bag_menu()
{
    int at = 0;

    while(true)
    {
        int n = bag_rows(pocket, false);
        list_spec s;
        s.x = 9; s.y = 0; s.w = 21; s.visible = 5; s.title = POCKETS[pocket]; s.detail = item_detail; s.sides = true;
        int k = pick(ROWS_A, n, s, at);

        if(k == -2 || k == -3)
        {
            pocket = (pocket + (k == -2 ? 2 : 1)) % 3;
            at = 0;
            continue;
        }

        if(k < 0 || bag_ids[k] < 0)
        {
            return;
        }

        at = k;
        int item = bag_ids[k];
        const mimas::item_def& it = mimas::items[item];
        int c = 0;
        int acts[3];

        if(it.kind == 2) { set_row(ROWS_B[c], "EQUIP"); acts[c++] = 1; }
        else if(it.kind == 0) { set_row(ROWS_B[c], "USE"); acts[c++] = 0; }

        if(it.kind != 1) { set_row(ROWS_B[c], "TOSS"); acts[c++] = 2; }

        set_row(ROWS_B[c], "CANCEL");
        acts[c++] = 3;
        list_spec o;
        o.x = 20; o.y = 8; o.w = 10; o.visible = c;
        int j = pick(ROWS_B, c, o);

        if(j < 0 || acts[j] == 3)
        {
            continue;
        }

        if(acts[j] == 0)
        {
            int who = pick_member("Use on which hero?");
            if(who >= 0) { use_item(item, who); }
        }
        else if(acts[j] == 1)
        {
            int who = pick_member("Equip on whom?");

            if(who >= 0 && gear_skill(party[who], item) == 2)
            {
                bn::string<96> t = name_of(party[who]);
                t += "'s class can't use that.";
                say(t);
            }
            else if(who >= 0)
            {
                equip_item(party[who], it.slot, item);
                bn::string<160> t = txt(mimas::T_item_equipped, tv().N(name_of(party[who])).I(it.name));
                say(t);
            }
        }
        else
        {
            int n2 = bag[item] > 1 ? how_many(bag[item], -1) : 1;

            if(n2 > 0)
            {
                bn::string<96> t = "Throw away ";
                if(n2 > 1) { t += bn::to_string<4>(n2); t += " "; }
                t += it.name;
                t += "?";

                if(ask(t))
                {
                    bag[item] = uint8_t(bag[item] - n2);
                    t = "Threw away ";
                    t += it.name;
                    t += ".";
                    say(t);
                }
            }
        }
    }
}

// ------------------------------------------------------------------------------------------------ shops

void money_box(bn::ivector<bn::sprite_ptr>& out)
{
    out.clear();
    ui::box(0, 0, 10, 4);
    bn::string<16> t = "$";
    t += bn::to_string<10>(gold);
    ui::text(12, 4, "MONEY", out);
    ui::text_right(70, 14, t, out);
}

void shop(const int16_t* goods, int n, bool can_sell)
{
    ui::open();
    bn::vector<bn::sprite_ptr, 8> money;
    money_box(money);
    bool first = true;

    while(true)
    {
        int what;
        ui::say(txt(first ? mimas::T_shop_hello : mimas::T_shop_again), true);
        first = false;
        set_row(ROWS_C[0], "BUY");
        set_row(ROWS_C[1], "SELL", "", -1, ! can_sell);
        set_row(ROWS_C[2], "QUIT");
        list_spec q;
        q.x = 21; q.y = 6; q.w = 9; q.visible = 3;
        what = pick(ROWS_C, 3, q);
        ui::unsay();

        if(what == 0)
        {
            while(true)
            {
                for(int k = 0; k < n; ++k)
                {
                    int item = goods[k * 2], price = goods[k * 2 + 1] >= 0 ? goods[k * 2 + 1] : mimas::items[goods[k * 2]].price;
                    bn::string<12> r = "$";
                    r += bn::to_string<8>(price);
                    set_row(ROWS_A[k], mimas::items[item].name, r.c_str(), item);
                    bag_ids[k] = item;
                }

                set_row(ROWS_A[n], "CANCEL");
                bag_ids[n] = -1;
                list_spec s;
                s.x = 10; s.y = 0; s.w = 20; s.visible = 5; s.detail = item_detail;
                int k = pick(ROWS_A, n + 1, s);

                if(k < 0 || k >= n)
                {
                    break;
                }

                int item = goods[k * 2], price = goods[k * 2 + 1] >= 0 ? goods[k * 2 + 1] : mimas::items[item].price;
                int most = bn::min(99 - bag[item], price > 0 ? gold / price : 99);

                if(most < 1)
                {
                    say(txt(bag[item] >= 99 ? mimas::T_shop_no_room : mimas::T_shop_no_money));
                    continue;
                }

                int cnt = mimas::items[item].kind == 2 || mimas::items[item].kind == 1 ? 1 : how_many(most, price);

                if(! cnt)
                {
                    continue;
                }

                bn::string<96> t = mimas::items[item].name;
                if(cnt > 1) { t += ", and you want "; t += bn::to_string<4>(cnt); }
                t += "? That will be $";
                t += bn::to_string<10>(price * cnt);
                t += ". OK?";

                if(ask(t))
                {
                    gold -= price * cnt;
                    sfx(mimas::snd_coin);
                    bag[item] = uint8_t(bag[item] + cnt);
                    money_box(money);
                    say(txt(mimas::T_shop_thanks));
                }
            }
        }
        else if(what == 1 && can_sell)
        {
            int p = 0;

            while(true)
            {
                int cnt = bag_rows(p, true);
                list_spec s;
                s.x = 10; s.y = 0; s.w = 20; s.visible = 5; s.title = POCKETS[p]; s.detail = item_detail; s.sides = true;
                int k = pick(ROWS_A, cnt, s);

                if(k == -2 || k == -3) { p = (p + (k == -2 ? 2 : 1)) % 3; continue; }
                if(k < 0 || bag_ids[k] < 0) { break; }

                int item = bag_ids[k], each = mimas::items[item].price / 2;
                int many = bag[item] > 1 ? how_many(bag[item], each) : 1;

                if(! many)
                {
                    continue;
                }

                bn::string<96> t = "I can pay $";
                t += bn::to_string<10>(each * many);
                t += ". Would that be OK?";

                if(ask(t))
                {
                    bag[item] = uint8_t(bag[item] - many);
                    gold += each * many;
                    sfx(mimas::snd_coin);
                    money_box(money);
                    t = "Turned over the ";
                    t += mimas::items[item].name;
                    t += ".";
                    say(t);
                }
            }
        }
        else
        {
            break;
        }
    }

    money.clear();
    ui::clear(0, 0, 10, 4);
    say(txt(mimas::T_shop_bye));
    ui::close();
}

// ------------------------------------------------------------------------------------------------ saving

struct save_data
{
    char magic[8];
    int16_t map, x, y, dir;
    uint32_t frames;
    int32_t gold;
    int32_t party_count;
    member party[MAX_PARTY];
    uint8_t bag[mimas::item_count];
    bool switches[mimas::switch_count];
    int vars[mimas::var_count];
    uint8_t selfs[mimas::self_count];
};

BN_DATA_EWRAM_BSS save_data SAVE;
constexpr char SAVE_MAGIC[8] = { 'M', 'I', 'M', 'A', 'S', '0', '8', 0 };

[[nodiscard]] bool save_exists()
{
    bn::sram::read(SAVE);

    for(int k = 0; k < 8; ++k)
    {
        if(SAVE.magic[k] != SAVE_MAGIC[k])
        {
            return false;
        }
    }

    return SAVE.map >= 0 && SAVE.map < mimas::map_count && SAVE.party_count > 0;
}

void write_save(int map, int x, int y, int dir)
{
    for(int k = 0; k < 8; ++k) { SAVE.magic[k] = SAVE_MAGIC[k]; }

    SAVE.map = int16_t(map); SAVE.x = int16_t(x); SAVE.y = int16_t(y); SAVE.dir = int16_t(dir);
    SAVE.frames = play_frames;
    SAVE.gold = gold;
    SAVE.party_count = party_count;

    for(int i = 0; i < MAX_PARTY; ++i) { SAVE.party[i] = party[i]; }
    for(int i = 0; i < mimas::item_count; ++i) { SAVE.bag[i] = bag[i]; }
    for(int i = 0; i < mimas::switch_count; ++i) { SAVE.switches[i] = switches[i]; }
    for(int i = 0; i < mimas::var_count; ++i) { SAVE.vars[i] = vars[i]; }
    for(int i = 0; i < mimas::self_count; ++i) { SAVE.selfs[i] = selfs[i]; }

    bn::sram::write(SAVE);
}

// Loads what save_exists() read.
void load_save()
{
    play_frames = SAVE.frames;
    gold = SAVE.gold;
    party_count = SAVE.party_count;

    for(int i = 0; i < MAX_PARTY; ++i) { party[i] = SAVE.party[i]; }
    for(int i = 0; i < mimas::item_count; ++i) { bag[i] = SAVE.bag[i]; }
    for(int i = 0; i < mimas::switch_count; ++i) { switches[i] = SAVE.switches[i]; }
    for(int i = 0; i < mimas::var_count; ++i) { vars[i] = SAVE.vars[i]; }
    for(int i = 0; i < mimas::self_count; ++i) { selfs[i] = SAVE.selfs[i]; }
}

bool save_flow(int map, int x, int y, int dir)
{
    if(! ask(txt(mimas::T_save_ask)))
    {
        return false;
    }

    write_save(map, x, y, dir);
    sfx(mimas::snd_save);
    say(txt(mimas::T_save_done, tv().N(name_of(party[0]))));
    return true;
}

// ------------------------------------------------------------------------------------------------ battles

// A foe for a battle: which enemy, its level (0: its own) and its moves (a custom_moves index, or -1: its own).
struct foe_spec
{
    int16_t enemy;
    int16_t level;
    int16_t moves;
};

// An ailment on someone (-1: none) and the turns it has left (sleep, confusion, blind, silence).
struct ailing
{
    int8_t ailment = -1;
    uint8_t turns = 0;
};

constexpr const char* AIL_TAG[] = { "PSN", "BRN", "PAR", "SLP", "FRZ", "CNF", "BLD", "SIL" };
// The line for each ailment taking hold (Text & dialog), in the ailments' order.
constexpr int AIL_GOT[] = { mimas::T_ail_poison, mimas::T_ail_burn, mimas::T_ail_paralyze, mimas::T_ail_sleep,
                            mimas::T_ail_frozen, mimas::T_ail_confusion, mimas::T_ail_blind, mimas::T_ail_silence };

// An enemy in battle: its numbers at its level, its moves, its magic, its ailment.
struct foe_rt
{
    int id = 0, level = 1, hp = 1, max = 1, attack = 100, defense = 0, magic_defense = 0, agility = 10, crit = 5, xp = 0, gold = 0, mp = 0;
    int scale = 100;          // its attack growth (%), for its spells
    int16_t moves[4] = {};
    int count = 0;
    ailing st;
};

[[nodiscard]] int grow(int v, int pct, int levels)
{
    return v * bn::max(20, 100 + pct * levels) / 100;
}

[[nodiscard]] foe_rt make_foe(const foe_spec& f)
{
    const mimas::enemy_def& e = mimas::enemies[f.enemy];
    foe_rt r;
    r.id = f.enemy;
    r.level = f.level > 0 ? f.level : e.level;
    int d = r.level - e.level;
    r.hp = r.max = bn::max(1, grow(e.hp, mimas::growth_hp, d));
    r.attack = grow(e.attack, mimas::growth_attack, d);
    r.scale = grow(100, mimas::growth_attack, d);
    r.defense = grow(e.defense, mimas::growth_defense, d);
    r.magic_defense = grow(e.magic_defense, mimas::growth_defense, d);
    r.agility = e.agility;
    r.crit = e.crit;
    r.xp = grow(e.xp, mimas::growth_xp, d);
    int g = e.gold_min + (e.gold_max > e.gold_min ? rng.get_int(e.gold_max - e.gold_min + 1) : 0);
    r.gold = grow(g, mimas::growth_gold, d);
    r.mp = e.mp;
    // Its moves: for this fight, else the last set at or below its level.
    const mimas::moveset* ms = nullptr;

    if(f.moves >= 0)
    {
        ms = &mimas::custom_moves[f.moves];
    }
    else
    {
        for(int k = 0; k < e.moveset_count; ++k)
        {
            if(e.movesets[k].level <= r.level && e.movesets[k].count)
            {
                ms = &e.movesets[k];
            }
        }
    }

    if(ms)
    {
        r.count = ms->count;

        for(int k = 0; k < ms->count; ++k) { r.moves[k] = ms->moves[k]; }
    }

    return r;
}

// Types: how much an element does to someone with these elements (%), 0 if they're immune, -1 if they absorb it.
[[nodiscard]] int type_mult(int el, const int8_t* els, uint8_t immune, uint8_t absorb)
{
    if((absorb >> el) & 1) { return -1; }
    if((immune >> el) & 1) { return 0; }

    int m = 100;

    for(int k = 0; k < 2; ++k)
    {
        if(els[k] >= 0) { m = m * mimas::chart[el][els[k]] / 100; }
    }

    return bn::max(25, bn::min(300, m));
}

// Update 15: one strike's timing. The red frame closes in on the foe over `time` frames; A as it meets the dark one.
// 0: missed (too early or too late), 1: good, 2: perfect (the middle of the window).
int qte_strike(bn::fixed_point at, int time, int window)
{
    bn::sprite_ptr mark = bn::sprite_items::qte_mark.create_sprite(at);
    bn::sprite_ptr ring = bn::sprite_items::qte_ring.create_sprite(at);
    mark.set_bg_priority(0);
    ring.set_bg_priority(0);
    ring.set_double_size_mode(bn::sprite_double_size_mode::ENABLED);
    int half = bn::max(2, window / 2);
    time = bn::max(1, time);

    for(int t = 0; ; ++t)
    {
        // From twice its size down onto the dark frame.
        ring.set_scale(bn::fixed(1) + bn::fixed(bn::max(0, time - t)) / time);
        bn::core::update();

        if(bn::keypad::a_pressed())
        {
            int err = bn::abs(t + 1 - time);
            if(err > half) { sfx(mimas::snd_dodge); return 0; }
            sfx(mimas::snd_swing);
            return err * 100 <= window * 18 ? 2 : 1;
        }

        if(t > time + half)
        {
            sfx(mimas::snd_dodge);
            return 0;
        }
    }
}

// The battle's text box (the whole bottom), waiting for A.
void bsay(const bn::string_view& text)
{
    ui::say(text);
    ui::box(0, 14, 30, 6);
}

// A line that stays up while something happens ("Jordan used Quick Strike!" over its animation); the next line
// replaces it, end_hold() takes it away.
void bsay_hold(const bn::string_view& text)
{
    ui::say(text, true);
}

void end_hold()
{
    if(! ui::said.empty())
    {
        ui::open();
        ui::unsay();
        ui::box(0, 14, 30, 6);
        ui::close();
    }
}

// A line that moves on by itself after a moment (A sooner), like the handheld games' "It's super effective!".
void bsay_auto(const bn::string_view& text, int frames = 60)
{
    ui::say(text, true);

    for(int k = 0; k < frames; ++k)
    {
        bn::core::update();

        if(k > 8 && (bn::keypad::a_pressed() || bn::keypad::b_pressed()))
        {
            break;
        }
    }

    end_hold();
}

// The scene: the plain white screen, the foe across from the hero, their panels and the text box.
struct battle_scene
{
    bn::optional<bn::sprite_ptr> foe;
    bn::optional<bn::sprite_ptr> back;
    bn::vector<bn::sprite_ptr, 24> foe_text;
    bn::vector<bn::sprite_ptr, 24> hero_text;
    foe_rt f;
    ailing hero_st[MAX_PARTY];
    int who = 0;

    bn::vector<bn::sprite_ptr, 2> foe_icons;
    bn::vector<bn::sprite_ptr, 3> hero_icons;

    // An element's icon (16 x 16) with its top-left here.
    static void icon(int el, int px, int py, bn::ivector<bn::sprite_ptr>& out)
    {
        if(el < 0 || el >= mimas::element_count || ! mimas::element_icons[el])
        {
            return;
        }

        bn::sprite_ptr s = mimas::element_icons[el]->create_sprite(px + 8 - HALF_W, py + 8 - HALF_H);
        s.set_bg_priority(0);
        out.push_back(bn::move(s));
    }

    // The foe's panel, like Saturn's: name and level, its elements, its health.
    void draw_foe()
    {
        foe_text.clear();
        foe_icons.clear();
        ui::box(0, 1, 17, 5);
        const mimas::enemy_def& e = mimas::enemies[f.id];
        ui::text(12, 12, e.name, foe_text);
        bn::string<12> lv = "Lv";
        lv += bn::to_string<4>(f.level);
        ui::text_right(17 * 8 - 10, 12, lv, foe_text);
        ui::text(12, 26, f.st.ailment >= 0 ? AIL_TAG[f.st.ailment] : "HP", foe_text);
        ui::bar(5, 4, f.hp, f.max);

        for(int k = 0; k < 2; ++k)
        {
            if(e.elements[k] >= 0)
            {
                icon(e.elements[k], 98 + k * 16, 26, foe_icons);
            }
        }
    }

    // The hero's panel, like Saturn's: name (gender) and level; health; health and MP numbers and their elements;
    // the EXP bar.
    void draw_hero()
    {
        hero_text.clear();
        hero_icons.clear();
        const member& m = party[who];
        const mimas::hero_def& h = mimas::heroes[m.hero];
        ui::box(14, 7, 16, 7);
        ui::text(14 * 8 + 12, 58, name_of(m), hero_text);

        if(h.gender >= 0)
        {
            bn::sprite_ptr g = bn::sprite_items::gender.create_sprite(14 * 8 + 14 + G->width(name_of(m)) + 4 - HALF_W, 66 - HALF_H, h.gender);
            g.set_bg_priority(0);
            hero_icons.push_back(bn::move(g));
        }

        bn::string<12> lv = "Lv";
        lv += bn::to_string<4>(m.level);
        ui::text_right(30 * 8 - 10, 58, lv, hero_text);
        ui::text(14 * 8 + 10, 68, hero_st[who].ailment >= 0 ? AIL_TAG[hero_st[who].ailment] : "HP", hero_text);
        ui::bar(18, 9, m.hp, max_hp(m), false);
        bn::string<24> hp = bn::to_string<6>(bn::max(0, int(m.hp)));
        hp += "/";
        hp += bn::to_string<6>(max_hp(m));
        ui::text(14 * 8 + 12, 79, hp, hero_text);
        bn::string<16> mp = "MP ";
        mp += bn::to_string<6>(m.mp);
        ui::text_right(30 * 8 - 10, 79, mp, hero_text);
        ui::text(14 * 8 + 10, 91, "EXP", hero_text);
        int need = xp_to_next(m.level);
        ui::xbar(19, 12, need > 0 ? int(m.xp) : 1, need > 0 ? need : 1, 9);

        for(int k = 0; k < 2; ++k)
        {
            if(h.elements[k] >= 0)
            {
                icon(h.elements[k], 200 + k * 16 + (h.elements[1] >= 0 ? 0 : 16), 65, hero_icons);
            }
        }
    }

    void set_foe(const foe_spec& spec)
    {
        f = make_foe(spec);
        foe = mimas::enemies[f.id].sprite->create_sprite(171 - HALF_W, 21 - HALF_H);
        foe->set_bg_priority(1);
        draw_foe();
    }

    void set_hero(int i)
    {
        who = i;
        back = mimas::heroes[party[i].hero].back->create_sprite(60 - HALF_W, 80 - HALF_H);
        back->set_bg_priority(1);
        draw_hero();
    }

    // Health going down (or up) a little at a time.
    void drain_foe(int to)
    {
        to = bn::max(0, bn::min(f.max, to));

        while(f.hp != to)
        {
            int step = bn::max(1, f.max / 48);
            f.hp = f.hp > to ? bn::max(to, f.hp - step) : bn::min(to, f.hp + step);
            ui::bar(5, 4, f.hp, f.max);
            bn::core::update();
        }
    }

    void drain_hero(int to)
    {
        member& m = party[who];
        to = bn::max(0, bn::min(max_hp(m), to));

        while(m.hp != to)
        {
            int step = bn::max(1, max_hp(m) / 48);
            m.hp = int16_t(m.hp > to ? bn::max(to, m.hp - step) : bn::min(to, m.hp + step));
            draw_hero();
            bn::core::update();
        }

        draw_hero();
    }

    void blink(bn::optional<bn::sprite_ptr>& s)
    {
        for(int k = 0; k < 8 && s; ++k)
        {
            s->set_visible(k % 2 != 0);

            for(int fr = 0; fr < 3; ++fr) { bn::core::update(); }
        }
    }

    // An effect over the foe (at_foe) or the hero: its frames five game frames each, its sound with the first.
    void play_fx(int fx, int element, bool at_foe)
    {
        if(fx < 0 || ! mimas::effects[fx].sprite)
        {
            return;
        }

        const mimas::effect_def& e = mimas::effects[fx];
        bn::sprite_ptr s = e.sprite->create_sprite(at_foe ? 171 - HALF_W : 60 - HALF_W, at_foe ? 21 - HALF_H : 80 - HALF_H);
        s.set_bg_priority(0);

        if(e.hit && element >= 0 && element < mimas::element_count)
        {
            s.set_palette(*mimas::effect_palettes[element]);
        }

        sfx(e.sound);

        for(int fr = 0; fr < e.frames; ++fr)
        {
            s.set_tiles(e.sprite->tiles_item(), fr);

            for(int k = 0; k < 5; ++k) { bn::core::update(); }
        }
    }

    // A move's look: its hit (in its element's colours), then its burst.
    void play_move(int hit, int burst, int element, bool at_foe)
    {
        play_fx(hit, element, at_foe);
        play_fx(burst, 0, at_foe);

        if(hit < 0 && burst < 0)
        {
            sfx(mimas::snd_hit);
        }
    }
};

[[nodiscard]] int spread(int v)
{
    return v * (90 + rng.get_int(21)) / 100;
}

enum outcome { LOST, WON, RAN };

// An ailment landing (its chance, unless they resist it or already have one): true if it took hold.
bool give_ailment(ailing& st, int ail, int chance, uint8_t resists, const char* name)
{
    if(ail < 0 || st.ailment >= 0 || ((resists >> ail) & 1) || rng.get_int(100) >= chance)
    {
        return false;
    }

    st.ailment = int8_t(ail);
    st.turns = uint8_t(ail == mimas::SLEEP ? 1 + rng.get_int(3) : ail == mimas::CONFUSION ? 2 + rng.get_int(3) : ail >= mimas::BLIND ? 3 : 0);
    bsay_auto(txt(AIL_GOT[ail], tv().N(name).T(name)));
    return true;
}

// Before acting: asleep, frozen, paralyzed or confused (it may hit itself: `hurt` is set). True if they act.
bool can_act(ailing& st, const char* name, bool& hurt)
{
    const tv v = tv().N(name).T(name);
    hurt = false;

    switch(st.ailment)
    {
        case mimas::SLEEP:
            if(st.turns > 0) { --st.turns; }
            if(st.turns == 0) { st.ailment = -1; bsay(txt(mimas::T_ail_woke, v)); return true; }
            bsay(txt(mimas::T_ail_still_asleep, v));
            return false;

        case mimas::CHILL:
            if(rng.get_int(5) == 0) { st.ailment = -1; bsay(txt(mimas::T_ail_thawed, v)); return true; }
            bsay(txt(mimas::T_ail_still_frozen, v));
            return false;

        case mimas::PARALYZE:
            if(rng.get_int(4) == 0) { bsay(txt(mimas::T_ail_cant_move, v)); return false; }
            return true;

        case mimas::CONFUSION:
            if(st.turns > 0) { --st.turns; }
            if(st.turns == 0) { st.ailment = -1; bsay(txt(mimas::T_ail_snapped, v)); return true; }
            bsay(txt(mimas::T_ail_still_confused, v));
            if(rng.get_int(3) == 0) { bsay(txt(mimas::T_ail_hurt_self, v)); hurt = true; return false; }
            return true;

        default:
            return true;
    }
}

// After their turn: poison and burns hurt; blindness and silence wear off. The damage (0: none).
int after_turn(ailing& st, int max, const char* name)
{
    const tv v = tv().N(name).T(name);

    if(st.ailment == mimas::POISON) { bsay(txt(mimas::T_ail_poison_hurt, v)); return bn::max(1, max / 8); }
    if(st.ailment == mimas::BURN) { bsay(txt(mimas::T_ail_burn_hurt, v)); return bn::max(1, max / 16); }

    if((st.ailment == mimas::BLIND || st.ailment == mimas::SILENCE) && st.turns > 0 && --st.turns == 0)
    {
        bsay(txt(st.ailment == mimas::BLIND ? mimas::T_ail_sight : mimas::T_ail_voice, v));
        st.ailment = -1;
    }

    return 0;
}

// What a type match did ("Struck a weakness!").
void say_type(int mult, const char* target)
{
    if(mult == 0) { bsay_auto(txt(mimas::T_battle_immune, tv().T(target).F(target))); }
    else if(mult > 100) { sfx(mimas::snd_weak); bsay_auto(txt(mimas::T_battle_weak, tv().T(target))); }
    else if(mult > 0 && mult < 100) { bsay_auto(txt(mimas::T_battle_resist, tv().T(target))); }
}

// A battle against these foes, one at a time. `can_run`: Run works (never from a boss). `prize`: a trainer's money
// (-1: the foes' own).
int battle(world& w, const foe_spec* foes, int foe_count, bool can_run, bool wild, int prize = -1)
{
    // The field goes away: the plain white screen.
    w.people.clear();
    w.people_event.clear();
    w.people_dir.clear();
    w.hero.set_visible(false);
    w.rustle.reset();
    w.layers_off();
    bn::bg_palettes::set_transparent_color(bn::color(31, 31, 31));
    sfx(mimas::snd_encounter);
    fade(0, 1);
    ui::open();
    ui::clear_all();
    // The map's battle background (its top-left at the screen's), behind everything.
    bn::optional<bn::regular_bg_ptr> backdrop;

    if(M->battleback)
    {
        backdrop = M->battleback->create_bg(8, 48);
        backdrop->set_priority(3);
    }

    int result = WON;
    int total_gold = 0;
    bool fought[MAX_PARTY] = {};

    {
        battle_scene sc;
        int lead = bn::max(0, first_standing());
        sc.set_hero(lead);
        fought[lead] = true;

        for(int fi = 0; fi < foe_count && result == WON; ++fi)
        {
            sc.set_foe(foes[fi]);
            const mimas::enemy_def& e = mimas::enemies[sc.f.id];
            bn::string<160> t = txt(wild ? mimas::T_battle_appear : mimas::T_battle_appear_event, tv().F(e.name).N(e.name).T(e.name));
            bsay(t);

            int cmd_at = 0;

            while(sc.f.hp > 0 && result == WON)
            {
                member& m = party[sc.who];
                ailing& hst = sc.hero_st[sc.who];
                // ---- the hero's choice
                int choice = -1, arg = -1;   // 0 move, 1 spell, 2 item, 3 guard (arg: its Addition), 4 switch, 5 run
                end_hold();

                while(choice < 0)
                {
                    bn::vector<bn::sprite_ptr, 24> q;
                    ui::box(0, 14, 11, 6);
                    {
                        // "Jordan stands ready." (Text & dialog), on two lines at most.
                        bn::string<320> ask = wrap(txt(mimas::T_battle_ask, tv().N(name_of(m))), 11 * 8 - 20);
                        const char* p = ask.c_str();

                        for(int ln = 0; ln < 2 && *p; ++ln)
                        {
                            const char* end = p;
                            while(*end && *end != '\n') { ++end; }
                            ui::text(12, 118 + ln * 16, bn::string_view(p, end - p), q);
                            p = *end ? end + 1 : end;
                        }
                    }
                    // ATTACK (Additions, guards and spells) / ITEMS / SWAP / FLEE, two by two (Text & dialog's words).
                    constexpr int cmds[] = { mimas::T_cmd_attack, mimas::T_cmd_items, mimas::T_cmd_swap, mimas::T_cmd_flee };
                    bn::vector<bn::sprite_ptr, 16> labels;
                    ui::box(11, 14, 19, 6);

                    for(int k = 0; k < 4; ++k)
                    {
                        ui::text(11 * 8 + 18 + (k % 2) * 70, 118 + (k / 2) * 16, txt(cmds[k]), labels);
                    }

                    bn::sprite_ptr cur = bn::sprite_items::cursor.create_sprite(0, 0);
                    cur.set_bg_priority(0);

                    while(true)
                    {
                        cur.set_position(11 * 8 + 12 + (cmd_at % 2) * 70 - HALF_W, 118 + (cmd_at / 2) * 16 + 8 - HALF_H);
                        bn::core::update();

                        if(bn::keypad::left_pressed() || bn::keypad::right_pressed()) { cmd_at ^= 1; sfx(mimas::snd_menuMove); }
                        else if(bn::keypad::up_pressed() || bn::keypad::down_pressed()) { cmd_at ^= 2; sfx(mimas::snd_menuMove); }
                        else if(bn::keypad::a_pressed()) { sfx(mimas::snd_menuOk); break; }
                    }

                    q.clear();
                    labels.clear();
                    cur.set_visible(false);
                    bn::core::update();

                    if(cmd_at == 0)
                    {
                        // The move list (Additions weakest first, then "[ Spells ]"), scrolling, above the
                        // details box; the cursor comes back where it was.
                        int n = move_list_rows(m, ROWS_B, m.mp, hst.ailment == mimas::SILENCE);

                        if(! n)
                        {
                            choice = 0;   // a plain hit (no moves known)
                            break;
                        }

                        list_spec ls;
                        ls.x = 0; ls.w = 18; ls.visible = bn::min(4, n); ls.detail = move_detail;
                        ls.y = 14 - (ls.visible * 16 + 8 + (n > ls.visible ? 8 : 0) + 7) / 8;
                        int k = pick(ROWS_B, n, ls, bn::min(int(m.move_at), n - 1));
                        ui::box(0, 14, 30, 6);
                        sc.draw_foe();
                        sc.draw_hero();

                        if(k >= 0)
                        {
                            m.move_at = uint8_t(k);
                            int mv = list_ids[k];
                            if(mv < 0) { choice = 1; arg = -mv - 1; }
                            else if(mimas::additions[mv].guard >= 0) { choice = 3; arg = mv; }
                            else { choice = 0; arg = mv; }
                        }
                    }
                    else if(cmd_at == 1)
                    {
                        int c = 0;
                        int ids[16];

                        for(int i = 0; i < mimas::item_count && c < 15; ++i)
                        {
                            if(bag[i] && mimas::items[i].kind == 0)
                            {
                                bn::string<8> r = "x";
                                r += bn::to_string<4>(bag[i]);
                                set_row(ROWS_B[c], mimas::items[i].name, r.c_str(), i);
                                ids[c++] = i;
                            }
                        }

                        if(! c)
                        {
                            bsay(txt(mimas::T_battle_no_items));
                            continue;
                        }

                        list_spec s;
                        s.x = 0; s.w = 30; s.visible = bn::min(4, c);
                        s.y = 20 - (s.visible * 16 + 8 + (c > 4 ? 8 : 0) + 7) / 8;
                        int k = pick(ROWS_B, c, s);
                        sc.draw_foe();
                        sc.draw_hero();
                        if(k >= 0) { choice = 2; arg = ids[k]; }
                    }
                    else if(cmd_at == 2)
                    {
                        if(party_count < 2)
                        {
                            bsay(txt(mimas::T_battle_no_one));
                            continue;
                        }

                        int k = pick_member(txt(mimas::T_battle_send_who).c_str());

                        if(k >= 0 && k != sc.who && party[k].hp > 0) { choice = 4; arg = k; }
                        else if(k >= 0 && party[k].hp <= 0) { bsay(txt(mimas::T_battle_cant_fight, tv().N(name_of(party[k])))); }
                        else if(k == sc.who) { bsay(txt(mimas::T_battle_already, tv().N(name_of(party[k])))); }

                        sc.draw_foe();
                        sc.draw_hero();
                    }
                    else
                    {
                        if(! can_run || e.boss)
                        {
                            bsay(txt(mimas::T_battle_cant_run));
                            continue;
                        }

                        choice = 5;
                    }
                }

                ui::box(0, 14, 30, 6);
                bool guard = choice == 3;
                totals tm = totals_of(m);
                bool hero_first = tm.attrs[mimas::AGI] > sc.f.agility || (tm.attrs[mimas::AGI] == sc.f.agility && rng.get_int(2));

                // ---- running, switching and items come first
                if(choice == 5)
                {
                    int chance = bn::max(5, bn::min(95, mimas::flee_chance + (tm.attrs[mimas::AGI] - sc.f.agility) * 2));

                    if(rng.get_int(100) < chance)
                    {
                        bsay(txt(mimas::T_battle_fled, tv().N(name_of(m))));
                        result = RAN;
                        break;
                    }

                    bsay(txt(mimas::T_battle_no_escape, tv().N(name_of(m))));
                }
                else if(choice == 4)
                {
                    bsay(txt(mimas::T_battle_swap_out, tv().N(name_of(m))));
                    sc.set_hero(arg);
                    fought[arg] = true;
                    bsay(txt(mimas::T_battle_step_in, tv().N(name_of(party[arg]))));
                }
                else if(choice == 2)
                {
                    sfx(mimas::snd_item);
                    use_item(arg, sc.who);
                    ui::box(0, 14, 30, 6);
                    sc.draw_hero();
                }
                else if(choice == 3)
                {
                    // A guarding move: its MP, half damage and no ailments this round, and a little health back.
                    const mimas::addition_def& a = mimas::additions[arg];
                    m.mp = int16_t(bn::max(0, m.mp - a.mp));
                    bsay_hold(txt(mimas::T_battle_guard_move, tv().N(name_of(m)).M(a.name)));
                    sc.play_move(a.hit, a.burst, a.element, false);
                    int before = m.hp;
                    sc.drain_hero(m.hp + max_hp(m) * a.guard / 100);
                    bsay_auto(m.hp > before ? txt(mimas::T_battle_guard_heal, tv().N(name_of(m)).num(m.hp - before)) : txt(mimas::T_battle_guarding, tv().N(name_of(m))));
                }

                // ---- the attacks, faster first
                for(int turn = 0; turn < 2 && result == WON && sc.f.hp > 0; ++turn)
                {
                    member& hm = party[sc.who];
                    ailing& hs = sc.hero_st[sc.who];
                    bool heroes_turn = (turn == 0) == hero_first;

                    if(heroes_turn)
                    {
                        if((choice != 0 && choice != 1) || hm.hp <= 0)
                        {
                            continue;
                        }

                        bool hurt;

                        if(! can_act(hs, name_of(hm), hurt))
                        {
                            if(hurt) { sc.blink(sc.back); sc.drain_hero(hm.hp - bn::max(1, attack_of(hm) / 200)); }
                            sc.draw_hero();
                            continue;
                        }

                        totals th = totals_of(hm);

                        if(choice == 0)
                        {
                            const mimas::addition_def* a = arg >= 0 ? &mimas::additions[arg] : nullptr;
                            int power = a ? a->power : 100, hits = a ? a->hits : 1, el = a ? a->element : 0;

                            if(a && a->mp > hm.mp)
                            {
                                bsay(txt(mimas::T_battle_no_mp, tv().N(name_of(hm))));
                                continue;
                            }

                            if(a) { hm.mp = int16_t(hm.mp - a->mp); sc.draw_hero(); }
                            bsay_hold(a ? txt(mimas::T_battle_addition, tv().N(name_of(hm)).M(a->name).T(e.name).F(e.name)) : txt(mimas::T_battle_attack, tv().N(name_of(hm)).T(e.name).F(e.name)));

                            if(hs.ailment == mimas::BLIND && rng.get_int(2) == 0)
                            {
                                sfx(mimas::snd_dodge);
                                bsay(txt(mimas::T_battle_miss, tv().N(name_of(hm)).T(e.name)));
                                continue;
                            }

                            // Update 15: an Addition's strikes are timed with A (a miss ends the string; a missed first strike
                            // still lands at half). Each strike landed and completing it give MP back. Automatic: all land.
                            int32_t done = power * 110 / 100;
                            bool complete = true;

                            if(a && mimas::timed_additions)
                            {
                                done = 0;
                                int landed = 0;
                                bn::fixed_point at = sc.foe ? sc.foe->position() : bn::fixed_point(171 - HALF_W, 21 - HALF_H);

                                for(int s = 0; s < a->hits; ++s)
                                {
                                    int r = qte_strike(at, a->strikes[s].time, a->strikes[s].window);

                                    if(! r)
                                    {
                                        if(s == 0) { done = a->strikes[0].power / 2; }
                                        break;
                                    }

                                    ++landed;
                                    done += a->strikes[s].power * (r == 2 ? 110 : 100) / 100;
                                    if(a->mp_hit) { hm.mp = int16_t(bn::min(max_mp(hm), hm.mp + a->mp_hit)); sc.draw_hero(); }
                                    sc.blink(sc.foe);
                                }

                                complete = landed == a->hits;
                                hits = bn::max(1, landed);
                            }

                            if(a && complete && a->mp_done) { hm.mp = int16_t(bn::min(max_mp(hm), hm.mp + a->mp_done)); sc.draw_hero(); }

                            sc.play_move(a ? a->hit : mimas::fx_hit_plain, a ? a->burst : -1, el, true);
                            int mult = type_mult(el, e.elements, e.immune, e.absorb);
                            int32_t dmg = int32_t(attack_of(hm)) * done / 100;
                            dmg = spread(dmg);
                            bool crit = rng.get_int(100) < th.crit;
                            if(crit) { dmg = dmg * 3 / 2; }
                            dmg = dmg * 50 / bn::max(1, sc.f.defense + 50) * mimas::party_damage / 100;

                            if(mult < 0)
                            {
                                sc.drain_foe(sc.f.hp + bn::max(1, int(dmg / 100)));
                                bsay_auto(txt(mimas::T_battle_absorb, tv().T(e.name).F(e.name).N(name_of(hm))));
                                continue;
                            }

                            dmg = dmg * mult / 100;
                            dmg = mult ? bn::max(1, int(dmg / 100)) : 0;
                            if(dmg) { sc.blink(sc.foe); sc.drain_foe(sc.f.hp - dmg); }

                            if(hits > 1 && dmg)
                            {
                                bsay_auto(txt(mimas::T_battle_hits, tv().num(hits)));
                            }

                            if(crit && dmg) { sfx(mimas::snd_crit); bsay_auto(txt(mimas::T_battle_crit)); }
                            say_type(mult, e.name);
                            if(a && complete && dmg && sc.f.hp > 0) { give_ailment(sc.f.st, a->inflict, a->chance, e.resists, e.name); sc.draw_foe(); }
                        }
                        else
                        {
                            const mimas::spell_def& sp = mimas::spells[arg];
                            const mimas::spell_rank& r = sp.ranks[hm.spells[arg] - 1];

                            if(hm.mp < r.mp)
                            {
                                bsay(txt(mimas::T_battle_no_mp, tv().N(name_of(hm))));
                                continue;
                            }

                            if(hs.ailment == mimas::SILENCE)
                            {
                                bsay(txt(mimas::T_battle_silenced, tv().N(name_of(hm))));
                                continue;
                            }

                            hm.mp = int16_t(hm.mp - r.mp);
                            sc.draw_hero();
                            bsay_hold(txt(mimas::T_battle_spell, tv().N(name_of(hm)).M(sp.name).T(e.name).F(e.name)));
                            int power = r.power * (40 + th.attrs[mimas::MAG]) / 50;   // x10

                            if(sp.kind == 0)
                            {
                                sc.play_move(sp.hit, sp.burst, sp.element, true);
                                int mult = type_mult(sp.element, e.elements, e.immune, e.absorb);
                                int dmg = spread(power) * 50 / bn::max(1, sc.f.magic_defense + 50) * mimas::party_damage / 100 / 10;

                                if(mult < 0)
                                {
                                    sc.drain_foe(sc.f.hp + bn::max(1, dmg));
                                    bsay_auto(txt(mimas::T_battle_absorb, tv().T(e.name).F(e.name).N(name_of(hm))));
                                }
                                else
                                {
                                    dmg = mult ? bn::max(1, dmg * mult / 100) : 0;
                                    if(dmg) { sc.blink(sc.foe); sc.drain_foe(sc.f.hp - dmg); }
                                    say_type(mult, e.name);
                                    if(dmg && sc.f.hp > 0) { give_ailment(sc.f.st, sp.inflict, sp.chance, e.resists, e.name); sc.draw_foe(); }
                                }
                            }
                            else
                            {
                                sc.play_move(sp.hit >= 0 ? sp.hit : mimas::fx_sparkle, sp.burst, sp.element, false);
                                int heal = bn::max(1, spread(power) / 10);
                                sc.drain_hero(hm.hp + heal);
                                bsay_auto(txt(mimas::T_battle_heal, tv().N(name_of(hm)).M(sp.name)));
                            }

                            sc.draw_hero();
                        }
                    }
                    else
                    {
                        if(hm.hp <= 0)
                        {
                            continue;
                        }

                        bool hurt;

                        if(! can_act(sc.f.st, e.name, hurt))
                        {
                            if(hurt) { sc.blink(sc.foe); sc.drain_foe(sc.f.hp - bn::max(1, sc.f.attack / 200)); }
                            sc.draw_foe();
                            continue;
                        }

                        // Its move: one it can use (spells need its MP, and it can't be silenced), else a plain hit.
                        int usable[4];
                        int u = 0;

                        for(int k = 0; k < sc.f.count; ++k)
                        {
                            int mv = sc.f.moves[k];

                            if(mv < 0)
                            {
                                const mimas::spell_def& sp = mimas::spells[-mv - 1];
                                if(sp.ranks[0].mp > sc.f.mp || sc.f.st.ailment == mimas::SILENCE) { continue; }
                            }

                            usable[u++] = mv;
                        }

                        totals th = totals_of(hm);
                        const int8_t* hel = mimas::heroes[hm.hero].elements;

                        if(u == 0)
                        {
                            bsay_hold(txt(mimas::T_battle_foe_attack, tv().F(e.name).N(e.name).T(name_of(hm))));
                            sc.play_move(mimas::fx_hit_plain, -1, e.element, false);
                            int mult = type_mult(e.element, hel, 0, 0);
                            int32_t dmg = spread(sc.f.attack);
                            bool crit = rng.get_int(100) < sc.f.crit;
                            if(crit) { dmg = dmg * 3 / 2; }
                            dmg = dmg * 50 / bn::max(1, (e.magic ? th.magic_armour : th.armour) + 50) * mimas::enemy_damage / 100 * mult / 100;
                            if(guard) { dmg /= 2; }
                            dmg = bn::max(1, int(dmg / 100));
                            sc.blink(sc.back);
                            sc.drain_hero(hm.hp - dmg);
                            if(crit) { sfx(mimas::snd_crit); bsay_auto(txt(mimas::T_battle_crit)); }
                            say_type(mult, name_of(hm));
                            if(hm.hp > 0 && ! guard) { give_ailment(hs, e.inflict, e.chance, 0, name_of(hm)); sc.draw_hero(); }
                        }
                        else
                        {
                            int mv = usable[rng.get_int(u)];

                            if(mv >= 0)
                            {
                                const mimas::addition_def& a = mimas::additions[mv];
                                bsay_hold(txt(mimas::T_battle_foe_addition, tv().F(e.name).N(e.name).M(a.name).T(name_of(hm))));

                                if(sc.f.st.ailment == mimas::BLIND && rng.get_int(2) == 0)
                                {
                                    sfx(mimas::snd_dodge);
                                    bsay(txt(mimas::T_battle_miss, tv().N(e.name).F(e.name).T(name_of(hm))));
                                    continue;
                                }

                                sc.play_move(a.hit, a.burst, a.element, false);
                                int mult = type_mult(a.element, hel, 0, 0);
                                int32_t dmg = spread(int32_t(sc.f.attack) * a.power / 100);
                                bool crit = rng.get_int(100) < sc.f.crit;
                                if(crit) { dmg = dmg * 3 / 2; }
                                dmg = dmg * 50 / bn::max(1, th.armour + 50) * mimas::enemy_damage / 100 * mult / 100;
                                if(guard) { dmg /= 2; }
                                dmg = bn::max(1, int(dmg / 100));
                                sc.blink(sc.back);
                                sc.drain_hero(hm.hp - dmg);
                                if(a.hits > 1) { bsay_auto(txt(mimas::T_battle_hits, tv().num(a.hits))); }
                                if(crit) { sfx(mimas::snd_crit); bsay_auto(txt(mimas::T_battle_crit)); }
                                say_type(mult, name_of(hm));
                                if(hm.hp > 0 && ! guard) { give_ailment(hs, a.inflict, a.chance, 0, name_of(hm)); sc.draw_hero(); }
                            }
                            else
                            {
                                const mimas::spell_def& sp = mimas::spells[-mv - 1];
                                sc.f.mp -= sp.ranks[0].mp;
                                bsay_hold(txt(mimas::T_battle_foe_spell, tv().F(e.name).N(e.name).M(sp.name).T(name_of(hm))));

                                if(sp.kind == 0)
                                {
                                    sc.play_move(sp.hit, sp.burst, sp.element, false);
                                    int mult = type_mult(sp.element, hel, 0, 0);
                                    int dmg = spread(sp.ranks[0].power * sc.f.scale / 100) * 50 / bn::max(1, th.magic_armour + 50) * mimas::enemy_damage / 100 * mult / 100 / 10;
                                    if(guard) { dmg /= 2; }
                                    dmg = bn::max(1, dmg);
                                    sc.blink(sc.back);
                                    sc.drain_hero(hm.hp - dmg);
                                    say_type(mult, name_of(hm));
                                    if(hm.hp > 0 && ! guard) { give_ailment(hs, sp.inflict, sp.chance, 0, name_of(hm)); sc.draw_hero(); }
                                }
                                else
                                {
                                    sc.play_move(sp.hit >= 0 ? sp.hit : mimas::fx_sparkle, sp.burst, sp.element, true);
                                    sc.drain_foe(sc.f.hp + bn::max(1, sc.f.max * 35 / 100));
                                    bsay_auto(txt(mimas::T_battle_foe_heal, tv().F(e.name).N(e.name).M(sp.name)));
                                }
                            }
                        }
                    }
                }

                end_hold();

                if(result != WON)
                {
                    break;
                }

                // ---- poison and burns, end of the round
                if(sc.f.hp > 0)
                {
                    int d = after_turn(sc.f.st, sc.f.max, e.name);
                    if(d) { sc.drain_foe(sc.f.hp - d); }
                    sc.draw_foe();
                }

                if(party[sc.who].hp > 0)
                {
                    int d = after_turn(sc.hero_st[sc.who], max_hp(party[sc.who]), name_of(party[sc.who]));
                    if(d) { sc.drain_hero(party[sc.who].hp - d); }
                    sc.draw_hero();
                }

                // ---- the foe falls: EXP for everyone who fought it
                if(sc.f.hp <= 0)
                {
                    sfx(mimas::snd_defeat);
                    sc.foe->set_visible(false);
                    bsay(txt(mimas::T_battle_defeated, tv().F(e.name).N(e.name).T(e.name)));

                    for(int i = 0; i < party_count; ++i)
                    {
                        if(! fought[i] || party[i].hp <= 0 || ! sc.f.xp)
                        {
                            continue;
                        }

                        bsay(txt(mimas::T_battle_exp, tv().N(name_of(party[i])).num(sc.f.xp)));
                        int ups = gain_xp(party[i], sc.f.xp);

                        if(ups)
                        {
                            sfx(mimas::snd_levelUp);
                            bsay(txt(mimas::T_battle_level, tv().N(name_of(party[i])).lv(party[i].level)));
                            if(mimas::points_per_level > 0) { bsay(txt(mimas::T_battle_points, tv().N(name_of(party[i])).num(party[i].points))); }
                        }

                        if(i == sc.who) { sc.draw_hero(); }
                    }

                    total_gold += sc.f.gold;

                    for(int i = 0; i < MAX_PARTY; ++i) { fought[i] = i == sc.who; }

                    break;
                }

                // ---- the hero falls: someone else, or it's over
                if(party[sc.who].hp <= 0)
                {
                    sc.back->set_visible(false);
                    sc.hero_st[sc.who] = ailing();
                    bsay(txt(mimas::T_battle_down, tv().N(name_of(party[sc.who])).T(name_of(party[sc.who]))));

                    if(first_standing() < 0)
                    {
                        bsay(txt(mimas::T_battle_all_down));
                        result = LOST;
                        break;
                    }

                    int k = -1;

                    while(k < 0 || party[k].hp <= 0)
                    {
                        k = pick_member(txt(mimas::T_battle_send_who).c_str());
                        sc.draw_foe();
                    }

                    sc.set_hero(k);
                    fought[k] = true;
                    bsay(txt(mimas::T_battle_step_in, tv().N(name_of(party[k]))));
                }
            }
        }

        if(result == WON)
        {
            int got = prize >= 0 ? prize : total_gold;

            if(got > 0)
            {
                gold += got;
                sfx(mimas::snd_coin);
                bsay(txt(mimas::T_battle_gold, tv().num(got)));
            }
        }

        fade(16, 12);
    }

    // Back to the field.
    ui::clear_all();
    ui::close();
    bn::bg_palettes::set_transparent_color(bn::nullopt);
    backdrop.reset();
    w.layers_on();
    w.hero.set_visible(true);
    w.make_people();
    w.place();
    bn::core::update();
    fade(0, 12);
    return result;
}

// After losing: back to the start, everyone patched up.
void whited_out(world& w)
{
    fade(16, 16);
    heal_all();
    gold /= 2;
    w.load(mimas::start_map, mimas::start_x, mimas::start_y, mimas::start_dir);
    bn::core::update();
    fade(0, 16);
}

// ------------------------------------------------------------------------------------------------ random battles

int grace_steps = 0;

// A step finished on (x, y): maybe a battle, from the zone painted there (or the map's own table).
void encounter_step(world& w, int map)
{
    if(grace_steps > 0)
    {
        --grace_steps;
        return;
    }

    const mimas::map_zones& mz = mimas::zones[map];
    int z = mz.grid[cell_index(w.cell_x, w.cell_y)];

    if(! z || z > mz.count)
    {
        return;
    }

    const mimas::zone_def& zone = mz.zones[z - 1];

    if(! zone.count || rng.get_int(zone.steps) != 0)
    {
        return;
    }

    int total = 0;

    for(int k = 0; k < zone.count; ++k) { total += zone.picks[k].weight; }

    auto pick_one = [&]() -> const mimas::zone_pick&
    {
        int r = rng.get_int(bn::max(1, total));

        for(int k = 0; k < zone.count; ++k)
        {
            r -= zone.picks[k].weight;
            if(r < 0) { return zone.picks[k]; }
        }

        return zone.picks[0];
    };

    foe_spec foes[6];
    int n = 0;
    bool can_run = true;

    if(zone.table)
    {
        int count = zone.min + rng.get_int(zone.max - zone.min + 1);

        for(int k = 0; k < count && n < 6; ++k)
        {
            foes[n++] = { int16_t(-pick_one().troop - 1), 0, -1 };
        }
    }
    else
    {
        const mimas::troop_def& tr = mimas::troops[pick_one().troop];
        can_run = ! tr.no_run;

        for(int k = 0; k < tr.count; ++k)
        {
            const mimas::troop_member& tm = tr.members[k];
            int c = tm.min + rng.get_int(tm.max - tm.min + 1);

            for(int j = 0; j < c && n < 6; ++j) { foes[n++] = { tm.enemy, 0, -1 }; }
        }

        if(tr.random && n > 1)
        {
            foes[0] = foes[rng.get_int(n)];
            n = 1;
        }
    }

    if(! n)
    {
        return;
    }

    if(battle(w, foes, n, can_run, true) == LOST)
    {
        whited_out(w);
    }

    grace_steps = 3;
}

// ------------------------------------------------------------------------------------------------ the START menu

void card()
{
    int t = int(play_frames / 60 / 60);
    bn::string<16> money = "$";
    money += bn::to_string<10>(gold);
    bn::string<16> time = bn::to_string<6>(t / 60);
    time += ":";
    if(t % 60 < 10) { time += "0"; }
    time += bn::to_string<4>(t % 60);
    bn::string<8> n = bn::to_string<4>(party_count);
    set_row(ROWS_B[0], "MONEY", money.c_str());
    set_row(ROWS_B[1], "PARTY", n.c_str());
    set_row(ROWS_B[2], "TIME", time.c_str());
    list_spec s;
    s.x = 3; s.y = 3; s.w = 24; s.visible = 3; s.title = name_of(party[0]);
    pick(ROWS_B, 3, s);
}

// ------------------------------------------------------------------------------------------------ skills and classes

// The trees they learn from (their class's; with no class, or no classes in the game, every tree) and the ones they
// can only look at (classes they've had or unlocked). Bits.
void member_trees(const member& m, uint32_t& learn, uint32_t& view)
{
    uint32_t all = mimas::tree_count >= 32 ? ~0u : (1u << mimas::tree_count) - 1;
    view = 0;

    if(mimas::class_count == 0 || m.cls < 0)
    {
        learn = all;
        return;
    }

    learn = mimas::classes[m.cls].trees & all;

    for(int c = 0; c < mimas::class_count; ++c)
    {
        if(((m.classes | m.joined) >> c) & 1) { view |= mimas::classes[c].trees; }
    }

    view &= all & ~learn;
}

// Whether they can take the next rank of skill `n` now; `why` says why not (nullptr: they can).
bool node_ok(const member& m, int n, bn::istring& why)
{
    const mimas::node_def& d = mimas::nodes[n];
    uint32_t learn, view;
    member_trees(m, learn, view);
    why.clear();

    if(m.nodes[n] >= d.ranks) { why = "Learned in full."; }
    else if(! ((learn >> d.tree) & 1)) { why = "Only another class can learn this."; }
    else
    {
        for(int p = 0; p < 4 && why.empty(); ++p)
        {
            if(d.parents[p] >= 0 && ! m.nodes[d.parents[p]]) { why = "Needs "; why += mimas::nodes[d.parents[p]].name; why += " first."; }
        }

        if(why.empty() && d.level > m.level) { why = "Needs level "; why += bn::to_string<4>(d.level); why += "."; }
        if(why.empty() && m.points < d.cost) { why = "Needs "; why += bn::to_string<4>(d.cost); why += " skill points."; }
    }

    return why.empty();
}

// Take the next rank of skill `n`: its points, its stats, and the Addition or spell it teaches.
void take_node(member& m, int n)
{
    const mimas::node_def& d = mimas::nodes[n];
    int before = max_hp(m);
    m.points = int16_t(m.points - d.cost);
    ++m.nodes[n];

    if(d.addition >= 0 && ! mimas::heroes[m.hero].no_additions)
    {
        add_move(m, d.addition);
    }

    if(d.spell >= 0)
    {
        int r = bn::max(1, bn::min(int(mimas::spells[d.spell].rank_count), m.nodes[n] + d.spell_from - 1));
        if(m.spells[d.spell] < r) { m.spells[d.spell] = uint8_t(r); }
        add_move(m, -(d.spell + 1));
    }

    if(m.hp > 0) { m.hp = int16_t(bn::min(max_hp(m), m.hp + bn::max(0, max_hp(m) - before))); }
}

const member* skill_member = nullptr;
int skill_rows[mimas::max_nodes + 1];

// A skill's description and, when it can't be taken now, why.
const char* skill_detail(int k)
{
    static bn::string<200> d;
    bn::string<64> why;
    node_ok(*skill_member, skill_rows[k], why);
    d = mimas::nodes[skill_rows[k]].description;

    if(! why.empty())
    {
        if(! d.empty()) { d += " "; }
        d += why;
    }

    return d.c_str();
}

// The Skills page: whose, then their trees (left / right), each skill with its rank or cost; A takes the next rank.
void skills_menu()
{
    int who = party_count > 1 ? pick_member("Whose skills?") : 0;

    if(who < 0 || mimas::tree_count == 0)
    {
        return;
    }

    member& m = party[who];
    skill_member = &m;
    int tree_ids[32];
    bool own[32];
    int tc = 0;
    uint32_t learn, view;
    member_trees(m, learn, view);

    for(int pass = 0; pass < 2; ++pass)
    {
        for(int t = 0; t < mimas::tree_count && t < 32; ++t)
        {
            if(((pass == 0 ? learn : view) >> t) & 1) { tree_ids[tc] = t; own[tc++] = pass == 0; }
        }
    }

    if(! tc)
    {
        say("No skill trees.");
        return;
    }

    int p = 0, at = 0;

    while(true)
    {
        int n = 0;

        for(int i = 0; i < mimas::node_count; ++i)
        {
            if(mimas::nodes[i].tree != tree_ids[p]) { continue; }

            const mimas::node_def& d = mimas::nodes[i];
            bn::string<64> why;
            bool ok = node_ok(m, i, why);
            bn::string<14> r;

            if(m.nodes[i] >= d.ranks)
            {
                if(d.ranks > 1) { r = bn::to_string<2>(m.nodes[i]); r += "/"; r += bn::to_string<2>(d.ranks); }
                else { r = "DONE"; }
            }
            else
            {
                if(d.ranks > 1) { r = bn::to_string<2>(m.nodes[i]); r += "/"; r += bn::to_string<2>(d.ranks); r += " "; }
                r += bn::to_string<3>(d.cost);
                r += " SP";
            }

            set_row(ROWS_A[n], d.name, r.c_str(), -1, ! ok);
            skill_rows[n++] = i;
        }

        bn::string<48> title = "< ";
        title += mimas::trees[tree_ids[p]].name;
        if(! own[p]) { title += " (VIEW)"; }
        title += " >  ";
        title += bn::to_string<4>(m.points);
        title += " SP";

        if(! n)
        {
            set_row(ROWS_A[0], "-", "", -1, true);
            skill_rows[0] = 0;
            n = 0;
        }

        list_spec s;
        s.x = 1; s.y = 0; s.w = 28; s.visible = 5; s.title = title.c_str(); s.detail = n ? skill_detail : nullptr; s.sides = tc > 1;
        int k = pick(ROWS_A, bn::max(1, n), s, bn::min(at, bn::max(0, n - 1)));

        if(k == -2 || k == -3)
        {
            p = (p + (k == -2 ? tc - 1 : 1)) % tc;
            at = 0;
            continue;
        }

        if(k < 0)
        {
            return;
        }

        at = k;

        if(! n)
        {
            continue;
        }

        const mimas::node_def& d = mimas::nodes[skill_rows[k]];

        if(ask(txt(mimas::T_skill_ask, tv().N(name_of(m)).M(d.name).num(d.cost))))
        {
            take_node(m, skill_rows[k]);
            sfx(mimas::snd_levelUp);
            say(txt(mimas::T_skill_done, tv().N(name_of(m)).M(d.name)));
        }
    }
}

int class_rows[32];

const char* class_detail(int k)
{
    return mimas::classes[class_rows[k]].description;
}

// A class trainer: one of the classes they've unlocked (-1: none chosen).
int pick_class(const member& m)
{
    int n = 0;

    for(int c = 0; c < mimas::class_count && c < 32; ++c)
    {
        if((m.classes >> c) & 1)
        {
            set_row(ROWS_C[n], mimas::classes[c].name, c == m.cls ? "NOW" : "");
            class_rows[n++] = c;
        }
    }

    if(! n)
    {
        say(txt(mimas::T_class_none, tv().N(name_of(m))));
        return -1;
    }

    bn::string<40> title = name_of(m);
    title += ": which class?";
    list_spec s;
    s.x = 4; s.y = 1; s.w = 22; s.visible = bn::min(5, n); s.title = title.c_str(); s.detail = class_detail;
    int k = pick(ROWS_C, n, s);
    return k >= 0 ? class_rows[k] : -1;
}

// The Change class command: op 0 change to `cls`, 1 unlock it, 2 the player picks one they've unlocked.
void class_event(member& m, int op, int cls, bool silent)
{
    if(op == 1)
    {
        if(cls >= 0 && cls < mimas::class_count && ! ((m.classes >> cls) & 1))
        {
            m.classes |= 1u << cls;
            if(! silent) { say(txt(mimas::T_class_unlocked, tv().N(name_of(m)).C(mimas::classes[cls].name))); }
        }

        return;
    }

    if(op == 2)
    {
        cls = pick_class(m);
    }

    if(cls < 0 || cls >= mimas::class_count)
    {
        return;
    }

    if(m.cls == cls)
    {
        if(op == 2 && ! silent) { say(txt(mimas::T_class_already, tv().N(name_of(m)).C(mimas::classes[cls].name))); }
        return;
    }

    join_class(m, cls);
    sfx(mimas::snd_levelUp);
    if(! silent) { say(txt(mimas::T_class_changed, tv().N(name_of(m)).C(mimas::classes[cls].name))); }
}

const char* start_detail(int k)
{
    constexpr const char* d[] = { "Check and organize your party.", "Items, gear and key items you carry.", "Spend skill points in the skill trees.",
                                  "Your money and play time.", "Save your progress.", "Close this menu." };
    return d[k];
}

void start_menu(world& w, int map)
{
    // The people go while the menu is open (their palettes are needed for icons).
    w.people.clear();
    w.people_event.clear();
    w.people_dir.clear();
    ui::open();
    int at = 0;

    while(true)
    {
        set_row(ROWS_C[0], txt(mimas::T_menu_party).c_str());
        set_row(ROWS_C[1], txt(mimas::T_menu_bag).c_str());
        set_row(ROWS_C[2], txt(mimas::T_menu_skills).c_str());
        set_row(ROWS_C[3], name_of(party[0]));
        set_row(ROWS_C[4], txt(mimas::T_menu_save).c_str());
        set_row(ROWS_C[5], txt(mimas::T_menu_exit).c_str());
        list_spec s;
        s.x = 20; s.y = 0; s.w = 10; s.visible = 6; s.detail = start_detail;
        int k = pick(ROWS_C, 6, s, at);

        if(k < 0 || k == 5)
        {
            break;
        }

        at = k;

        if(k == 0) { party_menu(); }
        else if(k == 1) { bag_menu(); }
        else if(k == 2) { skills_menu(); }
        else if(k == 3) { card(); }
        else if(save_flow(map, w.cell_x, w.cell_y, w.facing)) { break; }
    }

    ui::clear_all();
    ui::close();
    w.make_people();
    bn::core::update();
}

// The title: CONTINUE (the save) or NEW GAME. True if the save was loaded.
bool title_menu()
{
    if(! save_exists())
    {
        return false;
    }

    ui::open();
    bn::bg_palettes::set_transparent_color(bn::color(31, 31, 31));
    set_row(ROWS_C[0], "CONTINUE");
    set_row(ROWS_C[1], "NEW GAME");
    list_spec s;
    s.x = 8; s.y = 6; s.w = 14; s.visible = 2; s.title = "MIMAS"; s.cancel = false;
    int k = pick(ROWS_C, 2, s);
    ui::close();
    bn::bg_palettes::set_transparent_color(bn::nullopt);

    if(k == 0)
    {
        load_save();
        return true;
    }

    return false;
}

// ------------------------------------------------------------------------------------------------ trainers

// A trainer who sees the player: in a straight line the way it faces, within its range, nothing solid between (-1: none).
[[nodiscard]] int spotted(const world& w)
{
    for(int i = 0; i < M->event_count && i < MAX_EVENTS; ++i)
    {
        const mimas::page* pg = page_of(i);

        if(! pg || pg->trainer < 0)
        {
            continue;
        }

        const mimas::trainer_def& t = mimas::trainers[pg->trainer];

        if((selfs[M->events[i].self_id] >> t.beaten) & 1)
        {
            continue;
        }

        int x = ev_x[i], y = ev_y[i], d = pg->dir;

        for(int k = 1; k <= t.range; ++k)
        {
            x += DX[d];
            y += DY[d];

            if(x == w.cell_x && y == w.cell_y)
            {
                return i;
            }

            if(! inside(x, y) || (M->collision[cell_index(x, y)] & mimas::solid))
            {
                break;
            }
        }
    }

    return -1;
}

// A (!) over it, it walks up to the player, says its line, the battle; beaten: its self switch and its line.
void trainer_battle(world& w, int ev, bn::sprite_text_generator& gen, name_banner& banner)
{
    const mimas::page* pg = page_of(ev);

    if(! pg || pg->trainer < 0)
    {
        return;
    }

    const mimas::trainer_def& t = mimas::trainers[pg->trainer];
    int d = pg->dir;
    int k = -1;

    for(int j = 0; j < w.people.size(); ++j)
    {
        if(w.people_event[j] == ev) { k = j; }
    }

    banner.hide();

    if(k >= 0)
    {
        bn::sprite_ptr ex = bn::sprite_items::exclaim.create_sprite(w.people[k].x(), w.people[k].y() - 26);
        ex.set_camera(w.camera);
        ex.set_bg_priority(0);
        sfx(mimas::snd_target);

        for(int f = 0; f < 45; ++f) { bn::core::update(); }
    }

    // Walk up, one cell at a time, until it's next to the player.
    const bn::sprite_item& item = pg->sprite >= 0 ? *mimas::npc_sprites[pg->sprite] : bn::sprite_items::hero;

    while(bn::abs(ev_x[ev] - w.cell_x) + bn::abs(ev_y[ev] - w.cell_y) > 1)
    {
        for(int f = 0; f < CELL; ++f)
        {
            if(k >= 0 && pg->sprite > -10)
            {
                w.people[k].set_position(w.people[k].x() + DX[d], w.people[k].y() + DY[d]);
                int col = f < CELL / 2 ? 1 + ((ev_x[ev] + ev_y[ev]) & 1) : 0;
                w.people[k].set_tiles(item.tiles_item(), SHEET_ROW[d] * mimas::hero_frames + col);
            }

            bn::core::update();
        }

        ev_x[ev] = int16_t(ev_x[ev] + DX[d]);
        ev_y[ev] = int16_t(ev_y[ev] + DY[d]);
    }

    w.facing = OPPOSITE[d];
    w.place();
    w.make_people();
    text_view view;

    if(t.intro >= 0)
    {
        show_text(mimas::strings[t.intro], gen, banner, view);
    }

    foe_spec team[6];
    int n = bn::min(int(t.count), 6);

    for(int j = 0; j < n; ++j) { team[j] = { t.team[j].enemy, t.team[j].level, t.team[j].moves }; }

    int r = battle(w, team, n, false, false, t.gold > 0 ? t.gold : -1);

    if(r == LOST)
    {
        whited_out(w);
        return;
    }

    selfs[M->events[ev].self_id] |= uint8_t(1 << t.beaten);
    w.make_people();

    if(t.lose >= 0)
    {
        show_text(mimas::strings[t.lose], gen, banner, view);
    }

    grace_steps = 3;
}
