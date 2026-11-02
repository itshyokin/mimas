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
constexpr int MAX_MOVES = 4;

struct member
{
    int8_t hero;
    uint8_t level;
    int32_t xp;
    int16_t hp;
    int16_t mp;
    int16_t stats[7];
    int8_t moves[MAX_MOVES];
    uint8_t move_count;
    uint8_t spells[mimas::max_spells];   // rank known (0: not)
    int16_t equip[4];                     // item, or -1
    uint32_t known;                       // every Addition they know (bits)
};

member party[MAX_PARTY];
int party_count = 0;
bn::random rng;
uint32_t play_frames = 0;
bn::sprite_text_generator* G = nullptr;   // the dark text for the white windows

struct totals
{
    int attrs[7];
    int armour;
    int magic_armour;
    int crit;
};

[[nodiscard]] totals totals_of(const member& m)
{
    totals t;
    int crit = 0;
    t.armour = t.magic_armour = 0;

    for(int k = 0; k < 7; ++k)
    {
        t.attrs[k] = m.stats[k];
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
    return bn::max(1, mimas::base_hp + (totals_of(m).attrs[mimas::END] - 10) * 2);
}

[[nodiscard]] int max_mp(const member&)
{
    return mimas::base_mp;
}

// x100
[[nodiscard]] int attack_of(const member& m)
{
    int base = m.equip[mimas::WEAPON] >= 0 ? mimas::items[m.equip[mimas::WEAPON]].attack : mimas::unarmed_attack;
    return base * (40 + totals_of(m).attrs[mimas::STR]) / 50;
}

[[nodiscard]] int xp_to_next(int level)
{
    return level >= mimas::max_level ? 0 : mimas::xp_table[level - 1];
}

[[nodiscard]] const char* name_of(const member& m)
{
    return mimas::heroes[m.hero].name;
}

void add_move(member& m, int a)
{
    m.known |= 1u << a;

    if(m.move_count < MAX_MOVES)
    {
        m.moves[m.move_count++] = int8_t(a);
    }
}

[[nodiscard]] bool has_move(const member& m, int a)
{
    for(int k = 0; k < m.move_count; ++k)
    {
        if(m.moves[k] == a)
        {
            return true;
        }
    }

    return false;
}

// A hero joining at this level: their Database stats grown by their ranks, their moves, spells and gear.
[[nodiscard]] member new_member(int hero, int level)
{
    const mimas::hero_def& h = mimas::heroes[hero];
    member m = {};
    m.hero = int8_t(hero);
    m.level = uint8_t(bn::max(1, bn::min(mimas::max_level, level)));

    for(int k = 0; k < 7; ++k)
    {
        m.stats[k] = int16_t(bn::min(100, h.stats[k] + h.gains[k] * (m.level - 1)));
    }

    for(int k = 0; k < h.move_count; ++k)
    {
        add_move(m, h.moves[k]);
    }

    for(int k = 0; k < mimas::max_spells; ++k)
    {
        m.spells[k] = h.spells[k];
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

// EXP: the levels gained (each adds the hero's growth; health and magic grow with their maximums).
int gain_xp(member& m, int xp)
{
    const mimas::hero_def& h = mimas::heroes[m.hero];
    int before = max_hp(m);
    int ups = 0;
    m.xp += xp;

    while(m.level < mimas::max_level && m.xp >= xp_to_next(m.level))
    {
        m.xp -= xp_to_next(m.level);
        ++m.level;
        ++ups;

        for(int k = 0; k < 7; ++k)
        {
            m.stats[k] = int16_t(bn::min(100, m.stats[k] + h.gains[k]));
        }
    }

    if(m.level >= mimas::max_level)
    {
        m.xp = 0;
    }

    if(m.hp > 0)
    {
        m.hp = int16_t(bn::min(max_hp(m), m.hp + bn::max(0, max_hp(m) - before)));
    }

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

                ui::text(lx, ry, r.label, sprites);
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

        if(bn::keypad::up_pressed()) { at = (at + n - 1) % n; sfx(mimas::snd_menuMove); }
        else if(bn::keypad::down_pressed()) { at = (at + 1) % n; sfx(mimas::snd_menuMove); }
        else if(s.sides && bn::keypad::left_pressed()) { result = -2; sfx(mimas::snd_menuMove); break; }
        else if(s.sides && bn::keypad::right_pressed()) { result = -3; sfx(mimas::snd_menuMove); break; }
        else if(bn::keypad::a_pressed() && ! rows[at].off) { result = at; sfx(mimas::snd_menuOk); break; }
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
BN_DATA_EWRAM_BSS row ROWS_B[16];
BN_DATA_EWRAM_BSS row ROWS_C[16];

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
    t += m.hp > 0 ? "  " : "  FNT ";
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

int detail_member = 0;

const char* move_detail(int k)
{
    const member& m = party[detail_member];
    return k < m.move_count ? mimas::additions[m.moves[k]].description : "";
}

void move_rows(const member& m, const int8_t* ids, int n, row* out)
{
    for(int k = 0; k < n; ++k)
    {
        const mimas::addition_def& a = mimas::additions[ids[k]];
        bn::string<12> hits = bn::to_string<4>(a.hits);
        hits += a.hits == 1 ? " HIT" : " HITS";
        set_row(out[k], a.name, hits.c_str());
    }

    (void) m;
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

void moves_menu(member& m)
{
    detail_member = &m - party;

    while(true)
    {
        move_rows(m, m.moves, m.move_count, ROWS_B);
        int n = m.move_count;
        bool spare = false;

        if(mimas::equip_moves && m.move_count < MAX_MOVES)
        {
            for(int a = 0; a < mimas::addition_count; ++a)
            {
                spare = spare || (((m.known >> a) & 1) && ! has_move(m, a));
            }

            if(spare)
            {
                set_row(ROWS_B[n++], "-");
            }
        }

        if(! n)
        {
            say("No moves.");
            return;
        }

        list_spec s;
        s.x = 2; s.y = 0; s.w = 26; s.visible = 4; s.title = "MOVES"; s.detail = move_detail;
        int k = pick(ROWS_B, n, s);

        if(k < 0 || ! mimas::equip_moves)
        {
            if(k < 0) { return; }
            continue;
        }

        // Equip: another move they know in this slot.
        int8_t ids[mimas::max_additions];
        int c = 0;

        for(int a = 0; a < mimas::addition_count; ++a)
        {
            if(((m.known >> a) & 1) && ! has_move(m, a))
            {
                ids[c++] = int8_t(a);
            }
        }

        if(! c)
        {
            say("There are no other moves to use.");
            continue;
        }

        move_rows(m, ids, c, ROWS_C);
        list_spec s2;
        s2.x = 4; s2.y = 2; s2.w = 22; s2.visible = 5; s2.title = "Use which move?";
        int j = pick(ROWS_C, c, s2);

        if(j >= 0)
        {
            if(k < m.move_count) { m.moves[k] = ids[j]; }
            else { m.moves[m.move_count++] = ids[j]; }
        }
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
                set_row(ROWS_C[c], mimas::items[i].name, "", i);
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

// Learning a move: at once with a free slot, else Pokémon's questions (forget one, or put one away: Equip moves).
void learn_move(member& m, int a, bool silent)
{
    if(mimas::heroes[m.hero].no_additions || a < 0 || a >= mimas::addition_count)
    {
        return;
    }

    const char* who = name_of(m);
    const char* name = mimas::additions[a].name;
    bn::string<96> t;

    if(has_move(m, a) || (((m.known >> a) & 1) && ! mimas::equip_moves))
    {
        if(! silent) { t = who; t += " already knows "; t += name; t += "."; say(t); }
        return;
    }

    m.known |= 1u << a;

    if(m.move_count < MAX_MOVES)
    {
        m.moves[m.move_count++] = int8_t(a);
        if(! silent) { t = who; t += " learned "; t += name; t += "!"; say(t); }
        return;
    }

    t = who; t += " is trying to learn "; t += name; t += ".";
    say(t);
    t = "But "; t += who; t += " can't use more than 4 moves.";
    say(t);

    while(true)
    {
        t = mimas::equip_moves ? "Replace a move with " : "Delete a move to make room for ";
        t += name; t += "?";

        if(ask(t))
        {
            int8_t ids[5] = { m.moves[0], m.moves[1], m.moves[2], m.moves[3], int8_t(a) };
            move_rows(m, ids, 5, ROWS_B);
            list_spec s;
            s.x = 2; s.y = 0; s.w = 26; s.visible = 5; s.title = mimas::equip_moves ? "Replace which move?" : "Forget which move?";
            int k = pick(ROWS_B, 5, s);

            if(k >= 0 && k < 4)
            {
                const char* old = mimas::additions[m.moves[k]].name;

                if(! mimas::equip_moves)
                {
                    m.known &= ~(1u << m.moves[k]);
                    t = "1, 2, and... Poof! "; t += who; t += " forgot "; t += old; t += ".";
                }
                else
                {
                    t = who; t += " put away "; t += old; t += ".";
                }

                m.moves[k] = int8_t(a);
                say(t);
                t = "And... "; t += who; t += " learned "; t += name; t += "!";
                say(t);
                return;
            }

            if(k < 0)
            {
                continue;
            }
        }

        t = "Stop learning "; t += name; t += "?";

        if(ask(t))
        {
            if(! mimas::equip_moves)
            {
                m.known &= ~(1u << a);
            }

            t = who; t += mimas::equip_moves ? " learned " : " did not learn "; t += name;
            t += mimas::equip_moves ? ", but kept their four moves." : ".";
            say(t);
            return;
        }
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

    m.spells[sp] = uint8_t(r);

    if(! silent)
    {
        bn::string<96> t = name_of(m);
        t += " learned ";
        t += mimas::spells[sp].name;
        t += "!";
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
        say("It won't have any effect.");
        return false;
    }

    if(it.revive && m.hp <= 0) { m.hp = int16_t(bn::max(1, bn::min(mh, hp ? hp : mh / 2))); }
    else { m.hp = int16_t(bn::min(mh, m.hp + hp)); }

    m.mp = int16_t(bn::min(mm, m.mp + mp));

    if(m.hp == before_hp && m.mp == before_mp)
    {
        say("It won't have any effect.");
        return false;
    }

    --bag[item];
    bn::string<96> t = name_of(m);

    if(before_hp <= 0)
    {
        t += " was revived!";
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

            if(who >= 0)
            {
                equip_item(party[who], it.slot, item);
                bn::string<96> t = name_of(party[who]);
                t += " equipped ";
                t += it.name;
                t += ".";
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
        ui::say(first ? "Hi there! May I help you?" : "Is there anything else I may do for you?", true);
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
                    say(bag[item] >= 99 ? "You have no room for it." : "You don't have enough money.");
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
                    say("Here you are! Thank you!");
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
    say("Please come again!");
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
constexpr char SAVE_MAGIC[8] = { 'M', 'I', 'M', 'A', 'S', '0', '7', 0 };

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
    if(! ask("Would you like to save the game?"))
    {
        return false;
    }

    write_save(map, x, y, dir);
    sfx(mimas::snd_save);
    bn::string<64> t = name_of(party[0]);
    t += " saved the game!";
    say(t);
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
constexpr const char* AIL_GOT[] = { " was poisoned!", " was burned!", " is paralyzed! It may be unable to move!", " fell asleep!",
                                    " was frozen solid!", " became confused!", " was blinded!", " was silenced!" };

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

// The battle's text box (the whole bottom), waiting for A.
void bsay(const bn::string_view& text)
{
    ui::say(text);
    ui::box(0, 14, 30, 6);
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

    void draw_foe()
    {
        foe_text.clear();
        ui::box(0, 1, 15, 5);
        const mimas::enemy_def& e = mimas::enemies[f.id];
        ui::text(12, 12, e.name, foe_text);
        bn::string<12> lv = "Lv";
        lv += bn::to_string<4>(f.level);
        ui::text_right(15 * 8 - 10, 12, lv, foe_text);
        ui::text(12, 26, f.st.ailment >= 0 ? AIL_TAG[f.st.ailment] : "HP", foe_text);
        ui::bar(5, 4, f.hp, f.max);
    }

    void draw_hero()
    {
        hero_text.clear();
        const member& m = party[who];
        ui::box(14, 8, 16, 6);
        ui::text(14 * 8 + 12, 8 * 8 + 4, name_of(m), hero_text);
        bn::string<12> lv = "Lv";
        lv += bn::to_string<4>(m.level);
        ui::text_right(30 * 8 - 10, 8 * 8 + 4, lv, hero_text);
        ui::text(14 * 8 + 12, 8 * 8 + 18, hero_st[who].ailment >= 0 ? AIL_TAG[hero_st[who].ailment] : "HP", hero_text);
        ui::bar(19, 11, m.hp, max_hp(m));
        bn::string<24> hp = bn::to_string<6>(bn::max(0, int(m.hp)));
        hp += "/";
        hp += bn::to_string<6>(max_hp(m));
        ui::text(14 * 8 + 12, 8 * 8 + 30, hp, hero_text);
        bn::string<16> mp = "MP ";
        mp += bn::to_string<6>(m.mp);
        ui::text_right(30 * 8 - 10, 8 * 8 + 30, mp, hero_text);
    }

    void set_foe(const foe_spec& spec)
    {
        f = make_foe(spec);
        foe = mimas::enemies[f.id].sprite->create_sprite(176 - HALF_W, 34 - HALF_H);
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
        bn::sprite_ptr s = e.sprite->create_sprite(at_foe ? 176 - HALF_W : 60 - HALF_W, at_foe ? 34 - HALF_H : 80 - HALF_H);
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

// The FIGHT / MAGIC box: up to four in a 2 x 2 grid on the left, the chosen one's right text (hits, MP) on the
// right, like the handheld games. More than four: a list.
int grid_pick(const row* rows, int n)
{
    if(n > 4)
    {
        list_spec s;
        s.x = 0; s.w = 30; s.visible = 4;
        s.y = 20 - (4 * 16 + 8 + 8 + 7) / 8;
        return pick(rows, n, s);
    }

    ui::open();
    ui::box(0, 14, 20, 6);
    ui::box(20, 14, 10, 6);
    bn::vector<bn::sprite_ptr, 24> labels;
    bn::vector<bn::sprite_ptr, 8> info;
    bn::sprite_ptr cur = bn::sprite_items::cursor.create_sprite(0, 0);
    cur.set_bg_priority(0);

    for(int k = 0; k < n; ++k)
    {
        ui::text(14 + (k % 2) * 76, 118 + (k / 2) * 16, rows[k].label, labels);
    }

    int at = 0, shown = -1, result = -1;

    while(true)
    {
        if(shown != at)
        {
            shown = at;
            info.clear();
            ui::text(20 * 8 + 10, 118, rows[at].right, info);
            ui::text(20 * 8 + 10, 134, rows[at].sub, info);
        }

        cur.set_position(8 + (at % 2) * 76 - HALF_W, 118 + (at / 2) * 16 + 8 - HALF_H);
        bn::core::update();

        if(bn::keypad::left_pressed() || bn::keypad::right_pressed()) { int k = at ^ 1; if(k < n) { at = k; sfx(mimas::snd_menuMove); } }
        else if(bn::keypad::up_pressed() || bn::keypad::down_pressed()) { int k = at ^ 2; if(k < n) { at = k; sfx(mimas::snd_menuMove); } }
        else if(bn::keypad::a_pressed() && ! rows[at].off) { result = at; sfx(mimas::snd_menuOk); break; }
        else if(bn::keypad::b_pressed()) { sfx(mimas::snd_menuBack); break; }
    }

    labels.clear();
    info.clear();
    ui::box(0, 14, 30, 6);
    bn::core::update();
    ui::close();
    return result;
}

// An ailment landing (its chance, unless they resist it or already have one): true if it took hold.
bool give_ailment(ailing& st, int ail, int chance, uint8_t resists, const char* name)
{
    if(ail < 0 || st.ailment >= 0 || ((resists >> ail) & 1) || rng.get_int(100) >= chance)
    {
        return false;
    }

    st.ailment = int8_t(ail);
    st.turns = uint8_t(ail == mimas::SLEEP ? 1 + rng.get_int(3) : ail == mimas::CONFUSION ? 2 + rng.get_int(3) : ail >= mimas::BLIND ? 3 : 0);
    bn::string<96> t = name;
    t += AIL_GOT[ail];
    bsay(t);
    return true;
}

// Before acting: asleep, frozen, paralyzed or confused (it may hit itself: `hurt` is set). True if they act.
bool can_act(ailing& st, const char* name, bool& hurt)
{
    bn::string<96> t = name;
    hurt = false;

    switch(st.ailment)
    {
        case mimas::SLEEP:
            if(st.turns > 0) { --st.turns; }
            if(st.turns == 0) { st.ailment = -1; t += " woke up!"; bsay(t); return true; }
            t += " is fast asleep.";
            bsay(t);
            return false;

        case mimas::CHILL:
            if(rng.get_int(5) == 0) { st.ailment = -1; t += " thawed out!"; bsay(t); return true; }
            t += " is frozen solid!";
            bsay(t);
            return false;

        case mimas::PARALYZE:
            if(rng.get_int(4) == 0) { t += " is paralyzed! It can't move!"; bsay(t); return false; }
            return true;

        case mimas::CONFUSION:
            if(st.turns > 0) { --st.turns; }
            if(st.turns == 0) { st.ailment = -1; t += " snapped out of its confusion!"; bsay(t); return true; }
            t += " is confused!";
            bsay(t);
            if(rng.get_int(3) == 0) { bsay("It hurt itself in its confusion!"); hurt = true; return false; }
            return true;

        default:
            return true;
    }
}

// After their turn: poison and burns hurt; blindness and silence wear off. The damage (0: none).
int after_turn(ailing& st, int max, const char* name)
{
    bn::string<96> t = name;

    if(st.ailment == mimas::POISON) { t += " is hurt by poison!"; bsay(t); return bn::max(1, max / 8); }
    if(st.ailment == mimas::BURN) { t += " is hurt by its burn!"; bsay(t); return bn::max(1, max / 16); }

    if((st.ailment == mimas::BLIND || st.ailment == mimas::SILENCE) && st.turns > 0 && --st.turns == 0)
    {
        t += st.ailment == mimas::BLIND ? " can see again!" : " can use spells again!";
        st.ailment = -1;
        bsay(t);
    }

    return 0;
}

// What a type match did ("It's super effective!").
void say_type(int mult, const char* target)
{
    if(mult == 0) { bn::string<64> t = "It doesn't affect "; t += target; t += "..."; bsay(t); }
    else if(mult > 100) { sfx(mimas::snd_weak); bsay("It's super effective!"); }
    else if(mult > 0 && mult < 100) { bsay("It's not very effective..."); }
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
    w.ground->set_visible(false);
    w.over->set_visible(false);
    bn::bg_palettes::set_transparent_color(bn::color(31, 31, 31));
    sfx(mimas::snd_encounter);
    fade(0, 1);
    ui::open();
    ui::clear_all();
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
            bn::string<64> t;

            if(wild) { t = "A wild "; t += e.name; t += " appeared!"; }
            else { t = e.name; t += " appeared!"; }

            bsay(t);

            if(fi == 0)
            {
                t = "Go! ";
                t += name_of(party[sc.who]);
                t += "!";
                bsay(t);
            }

            int cmd_at = 0;

            while(sc.f.hp > 0 && result == WON)
            {
                member& m = party[sc.who];
                ailing& hst = sc.hero_st[sc.who];
                // ---- the hero's choice
                int choice = -1, arg = -1;   // 0 move, 1 spell, 2 item, 3 guard, 4 switch, 5 run

                while(choice < 0)
                {
                    bn::vector<bn::sprite_ptr, 16> q;
                    ui::box(0, 14, 11, 6);
                    ui::text(12, 118, "What will", q);
                    bn::string<32> who_do = name_of(m);
                    who_do += " do?";
                    ui::text(12, 134, who_do, q);
                    constexpr const char* cmds[] = { "FIGHT", "MAGIC", "BAG", "GUARD", "PARTY", "RUN" };
                    bn::vector<bn::sprite_ptr, 16> labels;
                    ui::box(11, 14, 19, 6);

                    for(int k = 0; k < 6; ++k)
                    {
                        ui::text(11 * 8 + 14 + (k % 3) * 44, 118 + (k / 3) * 16, cmds[k], labels);
                    }

                    bn::sprite_ptr cur = bn::sprite_items::cursor.create_sprite(0, 0);
                    cur.set_bg_priority(0);

                    while(true)
                    {
                        cur.set_position(11 * 8 + 8 + (cmd_at % 3) * 44 - HALF_W, 118 + (cmd_at / 3) * 16 + 8 - HALF_H);
                        bn::core::update();

                        if(bn::keypad::left_pressed()) { cmd_at = (cmd_at / 3) * 3 + (cmd_at % 3 + 2) % 3; sfx(mimas::snd_menuMove); }
                        else if(bn::keypad::right_pressed()) { cmd_at = (cmd_at / 3) * 3 + (cmd_at % 3 + 1) % 3; sfx(mimas::snd_menuMove); }
                        else if(bn::keypad::up_pressed() || bn::keypad::down_pressed()) { cmd_at = (cmd_at + 3) % 6; sfx(mimas::snd_menuMove); }
                        else if(bn::keypad::a_pressed()) { sfx(mimas::snd_menuOk); break; }
                    }

                    q.clear();
                    labels.clear();
                    cur.set_visible(false);
                    bn::core::update();

                    if(cmd_at == 0)
                    {
                        if(! m.move_count)
                        {
                            choice = 0;   // a plain hit (no moves known)
                            break;
                        }

                        for(int k = 0; k < m.move_count; ++k)
                        {
                            const mimas::addition_def& a = mimas::additions[m.moves[k]];
                            bn::string<12> h = bn::to_string<4>(a.hits);
                            h += a.hits == 1 ? " HIT" : " HITS";
                            set_row(ROWS_B[k], a.name, h.c_str());
                            bn::string_view el(mimas::element_names[a.element]);
                            for(int c = 0; c < el.size() && c < 13; ++c) { ROWS_B[k].sub[c] = el[c]; }
                        }

                        int k = grid_pick(ROWS_B, m.move_count);
                        if(k >= 0) { choice = 0; arg = k; }
                    }
                    else if(cmd_at == 1)
                    {
                        int ids[mimas::max_spells];
                        int c = 0;

                        for(int sp = 0; sp < mimas::spell_count; ++sp)
                        {
                            if(m.spells[sp])
                            {
                                const mimas::spell_rank& r = mimas::spells[sp].ranks[m.spells[sp] - 1];
                                bn::string<12> cost = bn::to_string<4>(r.mp);
                                cost += " MP";
                                set_row(ROWS_B[c], mimas::spells[sp].name, cost.c_str(), -1, r.mp > m.mp || hst.ailment == mimas::SILENCE);
                                ids[c++] = sp;
                            }
                        }

                        if(! c)
                        {
                            bsay("No spells learned.");
                            continue;
                        }

                        if(hst.ailment == mimas::SILENCE)
                        {
                            bsay("Silenced: no spells!");
                            continue;
                        }

                        int k = grid_pick(ROWS_B, c);
                        sc.draw_foe();
                        sc.draw_hero();
                        if(k >= 0) { choice = 1; arg = ids[k]; }
                    }
                    else if(cmd_at == 2)
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
                            bsay("There's nothing to use.");
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
                    else if(cmd_at == 3)
                    {
                        choice = 3;
                    }
                    else if(cmd_at == 4)
                    {
                        if(party_count < 2)
                        {
                            bsay("There's no one else to send in.");
                            continue;
                        }

                        int k = pick_member("Send in whom?");

                        if(k >= 0 && k != sc.who && party[k].hp > 0) { choice = 4; arg = k; }
                        else if(k >= 0 && party[k].hp <= 0) { bsay("They're in no shape to fight!"); }
                        else if(k == sc.who) { bsay("They're already fighting!"); }

                        sc.draw_foe();
                        sc.draw_hero();
                    }
                    else
                    {
                        if(! can_run || e.boss)
                        {
                            bsay("There's no running from this fight!");
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
                        bsay("Got away safely!");
                        result = RAN;
                        break;
                    }

                    bsay("Can't escape!");
                }
                else if(choice == 4)
                {
                    t = name_of(m);
                    t += ", come back!";
                    bsay(t);
                    sc.set_hero(arg);
                    fought[arg] = true;
                    t = "Go! ";
                    t += name_of(party[arg]);
                    t += "!";
                    bsay(t);
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
                    t = name_of(m);
                    t += " is guarding.";
                    bsay(t);
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
                            const mimas::addition_def* a = arg >= 0 ? &mimas::additions[hm.moves[arg]] : nullptr;
                            int power = a ? a->power : 100, hits = a ? a->hits : 1, el = a ? a->element : 0;
                            t = name_of(hm);
                            t += a ? " used " : " attacks";
                            if(a) { t += a->name; }
                            t += "!";
                            bsay(t);

                            if(hs.ailment == mimas::BLIND && rng.get_int(2) == 0)
                            {
                                sfx(mimas::snd_dodge);
                                t = name_of(hm);
                                t += "'s attack missed!";
                                bsay(t);
                                continue;
                            }

                            sc.play_move(a ? a->hit : mimas::fx_hit_plain, a ? a->burst : -1, el, true);
                            int mult = type_mult(el, e.elements, e.immune, e.absorb);
                            int32_t dmg = int32_t(attack_of(hm)) * power / 100 * 110 / 100;
                            dmg = spread(dmg);
                            bool crit = rng.get_int(100) < th.crit;
                            if(crit) { dmg = dmg * 3 / 2; }
                            dmg = dmg * 50 / bn::max(1, sc.f.defense + 50) * mimas::party_damage / 100;

                            if(mult < 0)
                            {
                                sc.drain_foe(sc.f.hp + bn::max(1, int(dmg / 100)));
                                t = e.name;
                                t += " absorbed it!";
                                bsay(t);
                                continue;
                            }

                            dmg = dmg * mult / 100;
                            dmg = mult ? bn::max(1, int(dmg / 100)) : 0;
                            if(dmg) { sc.blink(sc.foe); sc.drain_foe(sc.f.hp - dmg); }

                            if(hits > 1 && dmg)
                            {
                                t = "Hit ";
                                t += bn::to_string<4>(hits);
                                t += " times!";
                                bsay(t);
                            }

                            if(crit && dmg) { sfx(mimas::snd_crit); bsay("A critical hit!"); }
                            say_type(mult, e.name);
                            if(a && dmg && sc.f.hp > 0) { give_ailment(sc.f.st, a->inflict, a->chance, e.resists, e.name); sc.draw_foe(); }
                        }
                        else
                        {
                            const mimas::spell_def& sp = mimas::spells[arg];
                            const mimas::spell_rank& r = sp.ranks[hm.spells[arg] - 1];

                            if(hm.mp < r.mp)
                            {
                                bsay("Not enough MP!");
                                continue;
                            }

                            hm.mp = int16_t(hm.mp - r.mp);
                            t = name_of(hm);
                            t += " cast ";
                            t += sp.name;
                            t += "!";
                            bsay(t);
                            int power = r.power * (40 + th.attrs[mimas::MAG]) / 50;   // x10

                            if(sp.kind == 0)
                            {
                                sc.play_move(sp.hit, sp.burst, sp.element, true);
                                int mult = type_mult(sp.element, e.elements, e.immune, e.absorb);
                                int dmg = spread(power) * 50 / bn::max(1, sc.f.magic_defense + 50) * mimas::party_damage / 100 / 10;

                                if(mult < 0)
                                {
                                    sc.drain_foe(sc.f.hp + bn::max(1, dmg));
                                    t = e.name;
                                    t += " absorbed it!";
                                    bsay(t);
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
                                t = name_of(hm);
                                t += " recovered health!";
                                bsay(t);
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
                            t = e.name;
                            t += " attacks!";
                            bsay(t);
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
                            if(crit) { sfx(mimas::snd_crit); bsay("A critical hit!"); }
                            say_type(mult, name_of(hm));
                            if(hm.hp > 0) { give_ailment(hs, e.inflict, e.chance, 0, name_of(hm)); sc.draw_hero(); }
                        }
                        else
                        {
                            int mv = usable[rng.get_int(u)];

                            if(mv >= 0)
                            {
                                const mimas::addition_def& a = mimas::additions[mv];
                                t = e.name;
                                t += " used ";
                                t += a.name;
                                t += "!";
                                bsay(t);

                                if(sc.f.st.ailment == mimas::BLIND && rng.get_int(2) == 0)
                                {
                                    sfx(mimas::snd_dodge);
                                    t = e.name;
                                    t += "'s attack missed!";
                                    bsay(t);
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
                                if(a.hits > 1) { t = "Hit "; t += bn::to_string<4>(a.hits); t += " times!"; bsay(t); }
                                if(crit) { sfx(mimas::snd_crit); bsay("A critical hit!"); }
                                say_type(mult, name_of(hm));
                                if(hm.hp > 0) { give_ailment(hs, a.inflict, a.chance, 0, name_of(hm)); sc.draw_hero(); }
                            }
                            else
                            {
                                const mimas::spell_def& sp = mimas::spells[-mv - 1];
                                sc.f.mp -= sp.ranks[0].mp;
                                t = e.name;
                                t += " cast ";
                                t += sp.name;
                                t += "!";
                                bsay(t);

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
                                    if(hm.hp > 0) { give_ailment(hs, sp.inflict, sp.chance, 0, name_of(hm)); sc.draw_hero(); }
                                }
                                else
                                {
                                    sc.play_move(sp.hit >= 0 ? sp.hit : mimas::fx_sparkle, sp.burst, sp.element, true);
                                    sc.drain_foe(sc.f.hp + bn::max(1, sc.f.max * 35 / 100));
                                    t = e.name;
                                    t += " recovered health!";
                                    bsay(t);
                                }
                            }
                        }
                    }
                }

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
                    t = wild ? "The wild " : "";
                    t += e.name;
                    t += " fainted!";
                    bsay(t);

                    for(int i = 0; i < party_count; ++i)
                    {
                        if(! fought[i] || party[i].hp <= 0 || ! sc.f.xp)
                        {
                            continue;
                        }

                        t = name_of(party[i]);
                        t += " gained ";
                        t += bn::to_string<6>(sc.f.xp);
                        t += " EXP!";
                        bsay(t);
                        int ups = gain_xp(party[i], sc.f.xp);

                        if(ups)
                        {
                            sfx(mimas::snd_levelUp);
                            t = name_of(party[i]);
                            t += " grew to Lv. ";
                            t += bn::to_string<4>(party[i].level);
                            t += "!";
                            bsay(t);
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
                    t = name_of(party[sc.who]);
                    t += " fainted!";
                    bsay(t);

                    if(first_standing() < 0)
                    {
                        bsay("There's no one left to fight!");
                        result = LOST;
                        break;
                    }

                    int k = -1;

                    while(k < 0 || party[k].hp <= 0)
                    {
                        k = pick_member("Send in whom?");
                        sc.draw_foe();
                    }

                    sc.set_hero(k);
                    fought[k] = true;
                    t = "Go! ";
                    t += name_of(party[k]);
                    t += "!";
                    bsay(t);
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
                bn::string<64> t = "Got $";
                t += bn::to_string<8>(got);
                t += " for winning!";
                bsay(t);
            }
        }

        fade(16, 12);
    }

    // Back to the field.
    ui::clear_all();
    ui::close();
    bn::bg_palettes::set_transparent_color(bn::nullopt);
    w.ground->set_visible(true);
    w.over->set_visible(true);
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

const char* start_detail(int k)
{
    constexpr const char* d[] = { "Check and organize your party.", "Items, gear and key items you carry.", "Your money and play time.", "Save your progress.", "Close this menu." };
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
        set_row(ROWS_C[0], "PARTY");
        set_row(ROWS_C[1], "BAG");
        set_row(ROWS_C[2], name_of(party[0]));
        set_row(ROWS_C[3], "SAVE");
        set_row(ROWS_C[4], "EXIT");
        list_spec s;
        s.x = 20; s.y = 0; s.w = 10; s.visible = 5; s.detail = start_detail;
        int k = pick(ROWS_C, 5, s, at);

        if(k < 0 || k == 4)
        {
            break;
        }

        at = k;

        if(k == 0) { party_menu(); }
        else if(k == 1) { bag_menu(); }
        else if(k == 2) { card(); }
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
