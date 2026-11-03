/*
 * Mimas runtime: plays the maps made in GBA Studio (or one exported Saturn map).
 *
 * v0.7: the party, Pokémon-style battles (random ones from the Encounters layer, and Start battle), the START menu
 * (party, bag, save), shops, learning moves, saving to the cartridge (game_systems.hpp).
 * v0.6: Saturn's events, compiled by tools/gba_events.py: pages and their conditions, action / touch / autorun
 * triggers, area events, text (box or bubble), choices, if / else, switches, variables, self-switches, items,
 * gold, transfers, waits and fades. Props are drawn into the map by the exporter.
 * v0.5: word bubbles over speakers, Give item (the bag), Start battle (a note for now).
 * v0.4: every GBA map is in the ROM; grid movement, collision, cliffs, ledge hops,
 * tree tops drawn over the player, people standing on the map, signs and people you
 * talk to (text box), doors / transfers between maps with a fade, and the map name
 * shown on arrival. The player is the 16x32 overworld sprite painted in GBA Studio.
 *
 * Controls: D-pad walk, hold B run, A talk / next, START the menu.
 */

#include "bn_core.h"
#include "bn_keypad.h"
#include "bn_display.h"
#include "bn_color.h"
#include "bn_optional.h"
#include "bn_camera_ptr.h"
#include "bn_regular_bg_ptr.h"
#include "bn_sprite_ptr.h"
#include "bn_bg_palettes.h"
#include "bn_sprite_palettes.h"
#include "bn_sprite_text_generator.h"
#include "bn_vector.h"
#include "bn_string_view.h"
#include "bn_string.h"
#include "bn_sram.h"
#include "bn_random.h"
#include "bn_math.h"
#include "bn_fixed_point.h"
#include "bn_sprite_double_size_mode.h"
#include "bn_memory.h"
#include "bn_bg_tiles.h"
#include "bn_regular_bg_item.h"
#include "bn_regular_bg_map_ptr.h"
#include "bn_regular_bg_map_item.h"
#include "bn_regular_bg_map_cell_info.h"

#include "bn_regular_bg_items_textbox.h"
#include "bn_regular_bg_items_bubble.h"
#include "bn_regular_bg_items_choice_2.h"
#include "bn_regular_bg_items_choice_3.h"
#include "bn_regular_bg_items_choice_4.h"
#include "bn_sprite_items_bubble_tail.h"
#include "bn_sprite_items_hero.h"
#include "bn_sprite_palette_items_text_palette.h"
#include "bn_regular_bg_tiles_items_ui_tiles.h"
#include "bn_bg_palette_items_ui_palette.h"
#include "bn_sprite_items_cursor.h"

#include "common_variable_8x16_sprite_font.h"
#include "mimas_map.h"
#include "mimas_game.h"

namespace
{
    constexpr int CELL = 16;
    constexpr int HALF_W = bn::display::width() / 2;
    constexpr int HALF_H = bn::display::height() / 2;
    constexpr int MAX_PEOPLE = 24;

    // Facing directions. The sprite sheet has rows for down, up and left; right is left mirrored.
    enum dir { DOWN, UP, LEFT, RIGHT };
    constexpr int SHEET_ROW[] = { 0, 1, 2, 2 };
    constexpr int DX[] = { 0, 0, -1, 1 };
    constexpr int DY[] = { 1, -1, 0, 0 };
    constexpr int OPPOSITE[] = { UP, DOWN, RIGHT, LEFT };

    const mimas::map_info* M = &mimas::maps[mimas::start_map];

    [[nodiscard]] bool inside(int x, int y)
    {
        return x >= 0 && y >= 0 && x < M->width && y < M->height;
    }

    [[nodiscard]] int cell_index(int x, int y)
    {
        return y * M->width + x;
    }

    // ---------------------------------------------------------------- game state (switches, variables, the bag)

    constexpr int MAX_EVENTS = 128;
    bool switches[mimas::switch_count] = {};
    int vars[mimas::var_count] = {};
    uint8_t selfs[mimas::self_count] = {};   // self-switches A-D as bits, by event
    uint8_t bag[mimas::item_count] = {};
    int gold = 0;
    int16_t active[MAX_EVENTS];               // each event's page now (-1: none)
    int16_t ev_x[MAX_EVENTS];                 // where each event stands now (trainers walk up to the player)
    int16_t ev_y[MAX_EVENTS];

    void place_events();

    [[nodiscard]] bool test(int cond, int self_id)
    {
        const mimas::condition& c = mimas::conditions[cond];

        switch(c.type)
        {
            case 1: return switches[c.a] == (c.b != 0);
            case 2: return (((selfs[self_id] >> c.a) & 1) != 0) == (c.b != 0);
            case 3:
            {
                int v = vars[c.a];
                switch(c.op)
                {
                    case 0: return v >= c.b;
                    case 1: return v <= c.b;
                    case 2: return v == c.b;
                    case 3: return v > c.b;
                    default: return v < c.b;
                }
            }
            case 4: return bag[c.a] >= c.b;
            case 5: return gold >= c.b;
            default: return true;
        }
    }

    // The last page whose condition is met is the one that shows and runs.
    void pick_pages()
    {
        for(int i = 0; i < M->event_count && i < MAX_EVENTS; ++i)
        {
            const mimas::event& e = M->events[i];
            active[i] = -1;

            for(int k = 0; k < e.page_count; ++k)
            {
                const mimas::page& pg = M->pages[e.first_page + k];

                if(! pg.cond || test(pg.cond, e.self_id))
                {
                    active[i] = int16_t(e.first_page + k);
                }
            }
        }
    }

    void place_events()
    {
        for(int i = 0; i < M->event_count && i < MAX_EVENTS; ++i)
        {
            ev_x[i] = M->events[i].x;
            ev_y[i] = M->events[i].y;
        }
    }

    [[nodiscard]] const mimas::page* page_of(int i)
    {
        return i >= 0 && i < MAX_EVENTS && active[i] >= 0 ? &M->pages[active[i]] : nullptr;
    }

    // The event covering a cell (area events cover their whole rectangle); trigger -1: any.
    [[nodiscard]] int event_at(int x, int y, int trigger = -1)
    {
        for(int i = M->event_count - 1; i >= 0; --i)
        {
            const mimas::event& e = M->events[i];
            const mimas::page* pg = page_of(i);

            if(pg && x >= ev_x[i] && y >= ev_y[i] && x < ev_x[i] + e.w && y < ev_y[i] + e.h && (trigger < 0 || pg->trigger == trigger))
            {
                return i;
            }
        }

        return -1;
    }

    [[nodiscard]] bool person_blocks(int x, int y)
    {
        for(int i = 0; i < M->event_count; ++i)
        {
            const mimas::event& e = M->events[i];
            const mimas::page* pg = page_of(i);

            if(pg && pg->solid && x >= ev_x[i] && y >= ev_y[i] && x < ev_x[i] + e.w && y < ev_y[i] + e.h)
            {
                return true;
            }
        }

        return false;
    }

    // Can the player step from (fx, fy) to the neighbouring cell (tx, ty)?
    [[nodiscard]] bool can_step(int fx, int fy, int tx, int ty)
    {
        if(! inside(tx, ty) || person_blocks(tx, ty))
        {
            return false;
        }

        uint8_t to = M->collision[cell_index(tx, ty)];

        if(to & mimas::solid)
        {
            return false;
        }

        uint8_t from = M->collision[cell_index(fx, fy)];

        if((to | from) & mimas::bridge)
        {
            return true;
        }

        // Height differences of 2 or more are ledges and cliffs (Saturn maps).
        int dh = M->heights[cell_index(tx, ty)] - M->heights[cell_index(fx, fy)];
        return dh >= -1 && dh <= 1;
    }

    // Ledges: stepping onto one in its direction hops over it, two cells, landing beyond it.
    [[nodiscard]] bool can_hop(int fx, int fy, int d)
    {
        int tx = fx + DX[d], ty = fy + DY[d];

        if(! inside(tx, ty))
        {
            return false;
        }

        uint8_t c = M->collision[cell_index(tx, ty)];
        bool ledge = (d == DOWN && (c & mimas::ledge_s)) || (d == RIGHT && (c & mimas::ledge_e)) ||
                     (d == LEFT && (c & mimas::ledge_w));

        if(! ledge)
        {
            return false;
        }

        int lx = tx + DX[d], ly = ty + DY[d];
        return inside(lx, ly) && ! (M->collision[cell_index(lx, ly)] & mimas::solid) && ! person_blocks(lx, ly);
    }

    // World coordinates: the background's centre is (0, 0).
    [[nodiscard]] int world_x(int px)
    {
        return px - M->bg_width / 2;
    }

    [[nodiscard]] int world_y(int py)
    {
        return py - M->bg_height / 2;
    }

    [[nodiscard]] int clamp_camera(int value, int map_px, int bg_px, int half_screen)
    {
        int lo = -bg_px / 2 + half_screen;
        int hi = -bg_px / 2 + map_px - half_screen;

        if(hi < lo)
        {
            return -bg_px / 2 + map_px / 2;   // map smaller than the screen: centre it
        }

        return bn::max(lo, bn::min(value, hi));
    }

    struct world
    {
        bn::camera_ptr camera = bn::camera_ptr::create(0, 0);
        bn::optional<bn::regular_bg_ptr> ground;
        bn::optional<bn::regular_bg_ptr> over;
        bn::vector<bn::sprite_ptr, MAX_PEOPLE> people;
        bn::vector<int, MAX_PEOPLE> people_event;   // which event each sprite belongs to
        bn::vector<int, MAX_PEOPLE> people_dir;
        bn::sprite_ptr hero = bn::sprite_items::hero.create_sprite(0, 0);

        int cell_x = 0, cell_y = 0, facing = DOWN;
        int px = 0, py = 0;          // pixel position of the player's cell (top-left, background pixels)
        int moving = 0;              // pixels left to walk into the next cell
        int hop = 0;                 // total length of a ledge hop in progress (0 = walking)
        int steps = 0;               // tiles walked: alternates the left and right foot
        bool running = false;
        int bump = 0;                // short pause after walking into a wall

        void load(int map, int x, int y, int d)
        {
            people.clear();
            people_event.clear();
            ground.reset();
            over.reset();
            M = &mimas::maps[map];
            place_events();
            ground = M->ground->create_bg(0, 0);
            water_tick = water_at = 0;
            rustle.reset();
            over = M->over->create_bg(0, 0);
            ground->set_priority(3);
            over->set_priority(1);
            ground->set_camera(camera);
            over->set_camera(camera);

            make_people();

            cell_x = x;
            cell_y = y;
            facing = d;
            px = x * CELL;
            py = y * CELL;
            moving = hop = 0;
            hero.set_camera(camera);
            hero.set_bg_priority(2);   // between the ground (3) and the tree tops (1)
            place();
        }

        // The people standing on the map: every event whose page now shows a sprite.
        void make_people()
        {
            pick_pages();
            people.clear();
            people_event.clear();
            people_dir.clear();

            for(int i = 0; i < M->event_count && ! people.full(); ++i)
            {
                const mimas::event& e = M->events[i];
                const mimas::page* pg = page_of(i);

                if(! pg || pg->sprite == -1)
                {
                    continue;
                }

                // an object (a chest, a sign): one frame, its foot on the bottom of the event's area
                const bool object = pg->sprite <= -10;
                const bn::sprite_item& item = object ? *mimas::obj_sprites[-10 - pg->sprite] : pg->sprite >= 0 ? *mimas::npc_sprites[pg->sprite] : bn::sprite_items::hero;
                bn::sprite_ptr s = item.create_sprite(0, 0);
                s.set_camera(camera);
                s.set_bg_priority(2);
                s.set_position(world_x(ev_x[i] * CELL + e.w * CELL / 2), object ? world_y((ev_y[i] + e.h) * CELL - mimas::obj_heights[-10 - pg->sprite] / 2) : world_y((ev_y[i] + e.h - 1) * CELL));
                s.set_z_order(-(ev_y[i] + e.h - 1));
                people.push_back(s);
                people_event.push_back(i);
                people_dir.push_back(pg->dir);
                face_person(people.size() - 1, pg->dir);
            }
        }

        void face_person(int k, int d)
        {
            const mimas::page* pg = page_of(people_event[k]);
            if(pg && pg->sprite <= -10) { return; }   // objects have one frame and don't turn
            const bn::sprite_item& item = pg && pg->sprite >= 0 ? *mimas::npc_sprites[pg->sprite] : bn::sprite_items::hero;
            people[k].set_tiles(item.tiles_item(), SHEET_ROW[d] * mimas::hero_frames);
            people[k].set_horizontal_flip(d == RIGHT);
            people_dir[k] = d;
        }

        void face_event(int ev, int d)
        {
            for(int k = 0; k < people.size(); ++k)
            {
                if(people_event[k] == ev)
                {
                    face_person(k, d);
                }
            }
        }

        [[nodiscard]] bool has_person(int ev) const
        {
            for(int k = 0; k < people.size(); ++k)
            {
                if(people_event[k] == ev)
                {
                    return true;
                }
            }

            return false;
        }

        // Sprite frame, position and camera for this frame.
        void place()
        {
            // Pokémon-style steps: a foot forward for the first half of each tile, then standing,
            // alternating feet tile by tile. Columns 0-2 walk, 3-5 run.
            int column = (moving > CELL / 2) ? 1 + (steps & 1) : 0;

            if(running && moving > 0)
            {
                column += 3;
            }

            hero.set_tiles(bn::sprite_items::hero.tiles_item(), SHEET_ROW[facing] * mimas::hero_frames + column);
            hero.set_horizontal_flip(facing == RIGHT);

            // The 16x32 sprite's feet sit at the bottom of its cell. A hop arcs up to 8 pixels over the ledge.
            int lift = 0;

            if(hop)
            {
                int done = hop - moving;
                lift = (done * (hop - done) * 8 * 4) / (hop * hop);
            }

            hero.set_position(world_x(px + CELL / 2), world_y(py) - lift);
            hero.set_z_order(-(py + CELL - 1) / CELL);

            int cam_x = clamp_camera(world_x(px + CELL / 2), M->width * CELL, M->bg_width, HALF_W);
            int cam_y = clamp_camera(world_y(py + CELL / 2), M->height * CELL, M->bg_height, HALF_H);
            camera.set_position(cam_x, cam_y);
        }

        // Water playing its frames (the ground swapped for the next one now and then) and grass rustling.
        int water_tick = 0;
        int water_at = 0;
        bn::optional<bn::sprite_ptr> rustle;
        int rustle_t = 0;

        void animate()
        {
            if(M->water_frames > 1 && ground && ++water_tick >= 16)
            {
                water_tick = 0;
                water_at = (water_at + 1) % M->water_frames;
                ground->set_item(*M->water[water_at]);
            }

            if(rustle && --rustle_t <= 0)
            {
                rustle.reset();
            }
        }

        // The map's backgrounds let go (a battle needs their palettes) and back again.
        void layers_off()
        {
            ground.reset();
            over.reset();
        }

        void layers_on()
        {
            ground = (M->water_frames > 1 ? M->water[water_at] : M->ground)->create_bg(0, 0);
            over = M->over->create_bg(0, 0);
            ground->set_priority(3);
            over->set_priority(1);
            ground->set_camera(camera);
            over->set_camera(camera);
        }

        // Stepped into tall grass: it rustles over the player's feet for a moment. True if it did.
        bool grass_step()
        {
            if(! (M->collision[cell_index(cell_x, cell_y)] & mimas::grass))
            {
                return false;
            }

            rustle = bn::sprite_items::rustle.create_sprite(world_x(px + CELL / 2), world_y(py + CELL / 2));
            rustle->set_camera(camera);
            rustle->set_bg_priority(2);
            rustle->set_z_order(-(py + CELL - 1) / CELL - 1);
            rustle_t = 20;
            return true;
        }
    };

    class name_banner
    {

    public:
        explicit name_banner(const bn::sprite_text_generator& generator) :
            _generator(generator)
        {
        }

        void show()
        {
            _sprites.clear();
            _generator.generate(0, -HALF_H + 14, M->name, _sprites);
            _frames = 150;
        }

        void hide()
        {
            _sprites.clear();
            _frames = 0;
        }

        void update()
        {
            if(_frames > 0 && --_frames == 0)
            {
                _sprites.clear();
            }
        }

    private:
        const bn::sprite_text_generator& _generator;
        bn::vector<bn::sprite_ptr, 32> _sprites;
        int _frames = 0;
    };


    // Waits for A or B (a new press).
    void wait_for_button()
    {
        bn::core::update();

        while(! bn::keypad::a_pressed() && ! bn::keypad::b_pressed())
        {
            bn::core::update();
        }
    }

    // {Vn} and {Sn} in a text: variable n's value, switch n's ON / OFF.
    bn::string<512> fill(const char* text)
    {
        bn::string<512> out;

        for(const char* p = text; *p && out.size() < 500; ++p)
        {
            if(*p == '{' && (p[1] == 'V' || p[1] == 'S'))
            {
                const char* q = p + 2;
                int n = 0;

                while(*q >= '0' && *q <= '9')
                {
                    n = n * 10 + (*q - '0');
                    ++q;
                }

                if(*q == '}')
                {
                    if(p[1] == 'V')
                    {
                        out += bn::to_string<12>(n < mimas::var_count ? vars[n] : 0);
                    }
                    else
                    {
                        out += (n < mimas::switch_count && switches[n]) ? "ON" : "OFF";
                    }

                    p = q;
                    continue;
                }
            }

            out.push_back(*p);
        }

        return out;
    }

    // A text on screen: the box (or bubble) and its letters, kept while a choice is made under it.
    struct text_view
    {
        bn::optional<bn::regular_bg_ptr> box;
        bn::optional<bn::sprite_ptr> tail;
        bn::vector<bn::sprite_ptr, 48> sprites;
    };

    // Shows pre-wrapped text (lines split by \n, pages by \f) a page at a time; A or B for the next. In the box at
    // the bottom of the screen, or (anchor_x > -1000) in a word bubble whose tail points at that screen point
    // (relative to the screen's centre). `hold`: the last page stays up (a choice follows) and isn't waited for.
    void show_text(const char* raw, bn::sprite_text_generator& gen, name_banner& banner, text_view& view, int anchor_x = -1000, int anchor_y = -1000, bool hold = false)
    {
        banner.hide();
        bn::string<512> text = fill(raw);
        bool bubble = anchor_x > -1000;
        constexpr int BW = 152, BH = 40;
        int bx = 4, by = 112;

        if(bubble)
        {
            int sx = anchor_x + HALF_W, sy = anchor_y + HALF_H;   // screen pixels
            bx = bn::max(2, bn::min(bn::display::width() - BW - 2, sx - BW / 2));
            by = bn::max(2, sy - BH - 6);
            int tx = bn::max(bx + 8, bn::min(bx + BW - 8, sx));
            // The bubble sits in the top-left corner of its 256x256 background.
            view.box = bn::regular_bg_items::bubble.create_bg(bx + 128 - HALF_W, by + 128 - HALF_H);
            view.tail = bn::sprite_items::bubble_tail.create_sprite(tx - HALF_W, by + BH - 3 + 8 - HALF_H);
            view.tail->set_bg_priority(0);
        }
        else
        {
            view.box = bn::regular_bg_items::textbox.create_bg(0, 0);
        }

        view.box->set_priority(0);
        const char* p = text.c_str();

        while(true)
        {
            view.sprites.clear();
            int line = 0;

            while(*p && *p != '\f')
            {
                const char* end = p;

                while(*end && *end != '\n' && *end != '\f')
                {
                    ++end;
                }

                // each line is 16 pixels tall; generate() takes its vertical centre
                int top = bubble ? by + 5 : by + 6;
                gen.generate(bx + 8 - HALF_W, top + 8 + line * 16 - HALF_H, bn::string_view(p, end - p), view.sprites);
                ++line;
                p = *end == '\n' ? end + 1 : end;
            }

            if(! *p && hold)
            {
                return;
            }

            wait_for_button();

            if(! *p)
            {
                break;
            }

            ++p;   // past the page break
        }

        view = text_view();
        bn::core::update();   // the A press that closed the box doesn't talk again
    }

    // A choice box over the bottom right (2-4 options): up / down, A picks, B picks `cancel` (when there is one).
    int choose(const int16_t* opts, int n, int cancel, bn::sprite_text_generator& gen)
    {
        n = bn::max(2, bn::min(4, n));
        const bn::regular_bg_item& item = n == 2 ? bn::regular_bg_items::choice_2 : n == 3 ? bn::regular_bg_items::choice_3 : bn::regular_bg_items::choice_4;
        int bw = 80, bh = 16 * n + 10, bx = bn::display::width() - bw - 4, by = 112 - bh - 2;
        bn::regular_bg_ptr box = item.create_bg(bx + 128 - HALF_W, by + 128 - HALF_H);
        box.set_priority(0);
        bn::vector<bn::sprite_ptr, 32> labels;
        bn::vector<bn::sprite_ptr, 2> cursor;

        for(int k = 0; k < n; ++k)
        {
            gen.generate(bx + 16 - HALF_W, by + 5 + 8 + k * 16 - HALF_H, fill(mimas::strings[opts[k]]), labels);
        }

        int at = 0;

        while(true)
        {
            cursor.clear();
            gen.generate(bx + 6 - HALF_W, by + 5 + 8 + at * 16 - HALF_H, ">", cursor);
            bn::core::update();

            if(bn::keypad::up_pressed()) { at = (at + n - 1) % n; }
            else if(bn::keypad::down_pressed()) { at = (at + 1) % n; }
            else if(bn::keypad::a_pressed()) { break; }
            else if(bn::keypad::b_pressed() && cancel >= 0 && cancel < n) { at = cancel; break; }
        }

        bn::core::update();
        return at;
    }

    // Fade to black (16) or back (0) over `frames` frames.
    int faded = 0;

    void fade(int to, int frames = 16)
    {
        int from = faded;
        frames = bn::max(1, frames);

        for(int i = 1; i <= frames; ++i)
        {
            bn::fixed v = bn::fixed(from + (to - from) * i / frames) / 16;
            bn::bg_palettes::set_fade(bn::color(0, 0, 0), v);
            bn::sprite_palettes::set_fade(bn::color(0, 0, 0), v);
            bn::core::update();
        }

        faded = to;
    }

    [[nodiscard]] int map_index()
    {
        return M - mimas::maps;
    }

    #include "game_systems.hpp"

    // Runs an event's page: its script from the map's code (ops in tools/gba_events.py).
    void run_event(int ev, world& w, bn::sprite_text_generator& gen, name_banner& banner)
    {
        const mimas::page* pg = page_of(ev);

        if(! pg || ! pg->code)
        {
            return;
        }

        const mimas::event& e = M->events[ev];
        const int self_id = e.self_id;

        if(pg->face && w.has_person(ev))
        {
            w.face_event(ev, OPPOSITE[w.facing]);
        }

        const int16_t* code = M->code;
        int at = pg->code;
        text_view view;
        const mimas::map_info* home = M;

        for(int guard = 0; guard < 10000; ++guard)
        {
            // A transfer moved the player to another map: the rest of the script still runs (it's in `code`).
            switch(code[at])
            {
                case mimas::OP_END:
                    view = text_view();
                    return;

                case mimas::OP_TEXT:
                {
                    int str = code[at + 1], speaker = code[at + 2];
                    bool hold = code[at + 4] == mimas::OP_CHOICE;
                    bool bubble = code[at + 3] != 0 && M == home;
                    int ax = -1000, ay = -1000;

                    if(bubble)
                    {
                        int x = w.px + CELL / 2, y = w.py - CELL;
                        int who = speaker == -3 ? ev : speaker;

                        if(who >= 0 && who < M->event_count)
                        {
                            const mimas::event& sp = M->events[who];
                            x = ev_x[who] * CELL + sp.w * CELL / 2;
                            y = ev_y[who] * CELL - (w.has_person(who) ? CELL : 0);
                        }

                        ax = world_x(x) - w.camera.x().right_shift_integer();
                        ay = world_y(y) - w.camera.y().right_shift_integer();
                    }

                    show_text(mimas::strings[str], gen, banner, view, ax, ay, hold);
                    at += 4;
                    break;
                }

                case mimas::OP_CHOICE:
                {
                    int n = code[at + 1];
                    int picked = choose(code + at + 2, n, code[at + 2 + n], gen);
                    view = text_view();
                    at = code[at + 3 + n + picked];
                    break;
                }

                case mimas::OP_JUMP:
                    at = code[at + 1];
                    break;

                case mimas::OP_IF:
                    at = test(code[at + 1], self_id) ? at + 3 : code[at + 2];
                    break;

                case mimas::OP_SWITCH:
                    switches[code[at + 1]] = code[at + 2] != 0;
                    w.make_people();
                    at += 3;
                    break;

                case mimas::OP_VAR:
                    vars[code[at + 1]] = code[at + 2] ? vars[code[at + 1]] + code[at + 3] : code[at + 3];
                    w.make_people();
                    at += 4;
                    break;

                case mimas::OP_SELF:
                    if(code[at + 2]) { selfs[self_id] |= uint8_t(1 << code[at + 1]); }
                    else { selfs[self_id] &= uint8_t(~(1 << code[at + 1])); }
                    w.make_people();
                    at += 3;
                    break;

                case mimas::OP_GIVE:
                    bag[code[at + 1]] = uint8_t(bn::min(99, bag[code[at + 1]] + code[at + 2]));
                    if(code[at + 3] >= 0) { show_text(mimas::strings[code[at + 3]], gen, banner, view); }
                    w.make_people();
                    at += 4;
                    break;

                case mimas::OP_TAKE:
                    bag[code[at + 1]] = uint8_t(bn::max(0, bag[code[at + 1]] - code[at + 2]));
                    w.make_people();
                    at += 3;
                    break;

                case mimas::OP_GOLD:
                    gold = code[at + 1] ? code[at + 2] : bn::max(0, gold + code[at + 2]);
                    if(code[at + 3] >= 0) { show_text(mimas::strings[code[at + 3]], gen, banner, view); }
                    w.make_people();
                    at += 4;
                    break;

                case mimas::OP_TRANSFER:
                {
                    banner.hide();
                    bool was_dark = faded >= 16;

                    if(! was_dark)
                    {
                        fade(16);
                    }

                    int d = code[at + 4];
                    w.load(code[at + 1], code[at + 2], code[at + 3], d >= 0 ? d : w.facing);
                    bn::core::update();

                    if(! was_dark)
                    {
                        fade(0);
                        banner.show();
                    }

                    at += 5;
                    break;
                }

                case mimas::OP_WAIT:
                    for(int k = 0; k < code[at + 1]; ++k) { bn::core::update(); }
                    at += 2;
                    break;

                case mimas::OP_FADEOUT:
                    fade(16, code[at + 1]);
                    at += 2;
                    break;

                case mimas::OP_FADEIN:
                    fade(0, code[at + 1]);
                    if(M != home) { banner.show(); }
                    at += 2;
                    break;

                case mimas::OP_BATTLE:
                {
                    view = text_view();
                    banner.hide();
                    int n = bn::min(int(code[at + 1]), 6);
                    foe_spec foes[6];

                    for(int k = 0; k < n; ++k) { foes[k] = { code[at + 2 + k * 3], code[at + 3 + k * 3], code[at + 4 + k * 3] }; }

                    int tail = at + 2 + code[at + 1] * 3;
                    bool can_run = code[tail] != 0;
                    int var = code[tail + 1], lose = code[tail + 2];
                    int r = battle(w, foes, n, can_run, false);

                    if(var >= 0) { vars[var] = r == WON ? 1 : r == RAN ? 2 : 0; }

                    at = tail + 3;

                    if(r == LOST)
                    {
                        if(lose == 0)
                        {
                            whited_out(w);
                            return;
                        }

                        for(int i = 0; i < party_count; ++i) { if(party[i].hp <= 0) { party[i].hp = 1; } }
                    }

                    w.make_people();
                    grace_steps = 3;
                    break;
                }

                case mimas::OP_PARTY:
                {
                    view = text_view();
                    int hero = code[at + 2];
                    bool quiet = code[at + 3] != 0;
                    int here = -1;

                    for(int i = 0; i < party_count; ++i) { if(party[i].hero == hero) { here = i; } }

                    bn::string<64> t = mimas::heroes[hero].name;

                    if(code[at + 1] == 0 && here < 0)
                    {
                        if(party_count < MAX_PARTY)
                        {
                            int level = mimas::heroes[hero].join_level ? mimas::heroes[hero].join_level : party[0].level;
                            party[party_count++] = new_member(hero, level);
                            t += " joined the party!";
                        }
                        else
                        {
                            t = "There's no room in the party.";
                        }

                        if(! quiet) { say(t); }
                    }
                    else if(code[at + 1] == 1 && here > 0)
                    {
                        for(int i = here; i < party_count - 1; ++i) { party[i] = party[i + 1]; }
                        --party_count;
                        t += " left the party.";
                        if(! quiet) { say(t); }
                    }

                    at += 4;
                    break;
                }

                case mimas::OP_LEARN:
                {
                    view = text_view();
                    int who = code[at + 1], add = code[at + 2], sp = code[at + 3], rank = code[at + 4];
                    bool silent = code[at + 5] != 0;

                    for(int i = 0; i < party_count; ++i)
                    {
                        if(who >= 0 && party[i].hero != who) { continue; }
                        if(sp >= 0) { learn_spell(party[i], sp, rank, silent); }
                        if(add >= 0) { learn_move(party[i], add, silent); }
                    }

                    at += 6;
                    break;
                }

                case mimas::OP_SHOP:
                {
                    view = text_view();
                    int n = code[at + 1];
                    shop(code + at + 2, n, code[at + 2 + n * 2] != 0);
                    w.make_people();
                    at += 3 + n * 2;
                    break;
                }

                case mimas::OP_SAVE:
                    view = text_view();
                    save_flow(map_index(), w.cell_x, w.cell_y, w.facing);
                    at += 1;
                    break;

                case mimas::OP_GAUGE:
                {
                    int which = code[at + 1], op = code[at + 2], v = code[at + 3];

                    for(int i = 0; i < party_count; ++i)
                    {
                        member& m = party[i];
                        int mx = which == 0 ? max_hp(m) : max_mp(m);
                        int16_t& g = which == 0 ? m.hp : m.mp;
                        g = int16_t(bn::max(0, bn::min(mx, op == 2 ? mx : op == 0 ? v : g + v)));
                    }

                    at += 4;
                    break;
                }

                case mimas::OP_HEAL:
                    heal_all();
                    at += 1;
                    break;

                case mimas::OP_CLASS:
                {
                    // Change class: who -2 the hero you play, -1 everyone, else a hero; op 0 change, 1 unlock, 2 pick.
                    view = text_view();
                    int who = code[at + 1], op = code[at + 2], cls = code[at + 3];
                    bool silent = code[at + 4] != 0;

                    for(int i = 0; i < party_count; ++i)
                    {
                        if(who == -2 ? i != 0 : (who >= 0 && party[i].hero != who)) { continue; }
                        class_event(party[i], op, cls, silent);
                    }

                    at += 5;
                    break;
                }

                default:
                    return;
            }
        }
    }

    // An autorun page on this map (it runs as soon as nothing else is going on), or -1.
    [[nodiscard]] int autorun()
    {
        for(int i = 0; i < M->event_count; ++i)
        {
            const mimas::page* pg = page_of(i);

            if(pg && pg->trigger == 2 && pg->code)
            {
                return i;
            }
        }

        return -1;
    }
}

int main()
{
    bn::core::init();

    gold = mimas::start_gold;

    for(int k = 0; k < mimas::start_item_count; ++k)
    {
        bag[mimas::start_items[k * 2]] = uint8_t(bn::min(99, int(mimas::start_items[k * 2 + 1])));
    }

    new_party();

    bn::sprite_text_generator text(common::variable_8x16_sprite_font);
    text.set_center_alignment();
    text.set_bg_priority(0);
    bn::sprite_text_generator box_text(common::variable_8x16_sprite_font);
    box_text.set_left_alignment();
    box_text.set_bg_priority(0);
    box_text.set_palette_item(bn::sprite_palette_items::text_palette);
    G = &box_text;

    // A saved game: CONTINUE where it was saved, or a NEW GAME.
    bool continued = title_menu();

    world w;

    if(continued)
    {
        w.load(SAVE.map, SAVE.x, SAVE.y, SAVE.dir);
    }
    else
    {
        w.load(mimas::start_map, mimas::start_x, mimas::start_y, mimas::start_dir);
    }

    name_banner banner(text);
    banner.show();

    while(true)
    {
        int touched = -1;

        if(w.moving == 0)
        {
            int ar = autorun();

            if(ar >= 0)
            {
                run_event(ar, w, box_text, banner);
                bn::core::update();
                continue;
            }

            // A trainer who sees the player walks up and battles.
            int tr = spotted(w);

            if(tr >= 0)
            {
                trainer_battle(w, tr, box_text, banner);
                bn::core::update();
                continue;
            }

            int want = -1;

            if(bn::keypad::down_held()) { want = DOWN; }
            else if(bn::keypad::up_held()) { want = UP; }
            else if(bn::keypad::left_held()) { want = LEFT; }
            else if(bn::keypad::right_held()) { want = RIGHT; }

            if(bn::keypad::a_pressed())
            {
                int e = event_at(w.cell_x + DX[w.facing], w.cell_y + DY[w.facing], 0);

                if(e < 0)
                {
                    e = event_at(w.cell_x, w.cell_y, 0);
                }

                if(e >= 0)
                {
                    run_event(e, w, box_text, banner);
                    want = -1;
                }
            }

            if(want >= 0)
            {
                w.facing = want;
                int tx = w.cell_x + DX[want];
                int ty = w.cell_y + DY[want];

                if(can_hop(w.cell_x, w.cell_y, want))
                {
                    w.cell_x = tx + DX[want];
                    w.cell_y = ty + DY[want];
                    w.moving = w.hop = CELL * 2;
                    ++w.steps;
                    w.running = false;
                }
                else if(can_step(w.cell_x, w.cell_y, tx, ty))
                {
                    w.cell_x = tx;
                    w.cell_y = ty;
                    w.moving = CELL;
                    ++w.steps;
                    w.running = bn::keypad::b_held();
                }
                else if(w.bump == 0)
                {
                    // walking into a blocked door (a touch event in a wall) uses it
                    touched = event_at(tx, ty, 1);

                    w.bump = 8;
                }
            }

            if(w.bump > 0)
            {
                --w.bump;
            }
        }

        if(w.moving > 0)
        {
            int speed = (w.running || w.hop) ? 2 : 1;
            speed = bn::min(speed, w.moving);
            w.moving -= speed;
            w.px += DX[w.facing] * speed;
            w.py += DY[w.facing] * speed;

            if(w.moving == 0)
            {
                touched = event_at(w.cell_x, w.cell_y, 1);

                if(w.grass_step())
                {
                    sfx(mimas::snd_rustle);
                }

                if(touched < 0)
                {
                    w.place();
                    encounter_step(w, map_index());
                }
            }
        }

        w.place();

        if(w.moving == 0 && w.hop)
        {
            w.hop = 0;
        }

        if(touched >= 0)
        {
            run_event(touched, w, box_text, banner);
        }

        if(bn::keypad::start_pressed() && w.moving == 0)
        {
            banner.hide();
            start_menu(w, map_index());
        }

        banner.update();
        w.animate();
        ++play_frames;
        bn::core::update();
    }
}
