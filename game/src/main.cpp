/*
 * Mimas runtime: plays the maps made in GBA Studio (or one exported Saturn map).
 *
 * v0.4: every GBA map is in the ROM; grid movement, collision, cliffs, ledge hops,
 * tree tops drawn over the player, people standing on the map, signs and people you
 * talk to (text box), doors / transfers between maps with a fade, and the map name
 * shown on arrival. The player is the 16x32 overworld sprite painted in GBA Studio.
 *
 * Controls: D-pad walk, hold B run, A talk / next, START shows the map name again.
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

#include "bn_regular_bg_items_textbox.h"
#include "bn_sprite_items_hero.h"
#include "bn_sprite_palette_items_text_palette.h"

#include "common_variable_8x16_sprite_font.h"
#include "mimas_map.h"

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

    [[nodiscard]] const mimas::event* event_at(int x, int y)
    {
        for(int i = 0; i < M->event_count; ++i)
        {
            const mimas::event& e = M->events[i];

            if(e.x == x && e.y == y)
            {
                return &e;
            }
        }

        return nullptr;
    }

    [[nodiscard]] bool person_blocks(int x, int y)
    {
        const mimas::event* e = event_at(x, y);
        return e && e->solid;
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
            ground = M->ground->create_bg(0, 0);
            over = M->over->create_bg(0, 0);
            ground->set_priority(3);
            over->set_priority(1);
            ground->set_camera(camera);
            over->set_camera(camera);

            for(int i = 0; i < M->event_count && ! people.full(); ++i)
            {
                const mimas::event& e = M->events[i];

                if(e.sprite >= 0)
                {
                    bn::sprite_ptr s = mimas::npc_sprites[e.sprite]->create_sprite(0, 0);
                    s.set_camera(camera);
                    s.set_bg_priority(2);
                    s.set_position(world_x(e.x * CELL + CELL / 2), world_y(e.y * CELL));
                    s.set_z_order(-e.y);
                    people.push_back(s);
                    people_event.push_back(i);
                    face_person(people.size() - 1, e.dir);
                }
            }

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

        void face_person(int k, int d)
        {
            const mimas::event& e = M->events[people_event[k]];
            people[k].set_tiles(mimas::npc_sprites[e.sprite]->tiles_item(), SHEET_ROW[d] * mimas::hero_frames);
            people[k].set_horizontal_flip(d == RIGHT);
        }

        void face_event(const mimas::event* e, int d)
        {
            for(int k = 0; k < people.size(); ++k)
            {
                if(&M->events[people_event[k]] == e)
                {
                    face_person(k, d);
                }
            }
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

    // Shows pre-wrapped text (lines split by \n, pages by \f) in the box, a page at a time; A or B for the next.
    void show_text(const char* text, bn::sprite_text_generator& gen, name_banner& banner)
    {
        banner.hide();
        bn::regular_bg_ptr box = bn::regular_bg_items::textbox.create_bg(0, 0);
        box.set_priority(0);
        bn::vector<bn::sprite_ptr, 48> sprites;
        const char* p = text;

        while(true)
        {
            sprites.clear();
            int line = 0;

            while(*p && *p != '\f')
            {
                const char* end = p;

                while(*end && *end != '\n' && *end != '\f')
                {
                    ++end;
                }

                gen.generate(-HALF_W + 12, 120 - HALF_H + line * 16 + 6, bn::string_view(p, end - p), sprites);
                ++line;
                p = *end == '\n' ? end + 1 : end;
            }

            bn::core::update();

            while(! bn::keypad::a_pressed() && ! bn::keypad::b_pressed())
            {
                bn::core::update();
            }

            if(! *p)
            {
                break;
            }

            ++p;   // past the page break
        }

        sprites.clear();
        bn::core::update();   // the A press that closed the box doesn't talk again
    }

    void fade(int from, int to)
    {
        for(int i = 0; i <= 16; ++i)
        {
            bn::fixed v = bn::fixed(from + (to - from) * i / 16) / 16;
            bn::bg_palettes::set_fade(bn::color(0, 0, 0), v);
            bn::sprite_palettes::set_fade(bn::color(0, 0, 0), v);
            bn::core::update();
        }
    }

    void run_event(const mimas::event& e, world& w, bn::sprite_text_generator& gen, name_banner& banner)
    {
        if(e.sprite >= 0 && ! e.touch)
        {
            w.face_event(&e, OPPOSITE[w.facing]);
        }

        for(int i = 0; i < e.command_count; ++i)
        {
            const mimas::command& c = e.commands[i];

            if(c.type == mimas::CMD_TEXT)
            {
                show_text(c.text, gen, banner);
            }
            else if(c.type == mimas::CMD_TRANSFER)
            {
                banner.hide();
                fade(0, 16);
                w.load(c.map, c.x, c.y, c.dir >= 0 ? c.dir : w.facing);
                bn::core::update();
                fade(16, 0);
                banner.show();
                return;   // the rest of the event belonged to the old map
            }
        }
    }
}

int main()
{
    bn::core::init();

    world w;
    w.load(mimas::start_map, mimas::start_x, mimas::start_y, mimas::start_dir);

    bn::sprite_text_generator text(common::variable_8x16_sprite_font);
    text.set_center_alignment();
    text.set_bg_priority(0);
    bn::sprite_text_generator box_text(common::variable_8x16_sprite_font);
    box_text.set_left_alignment();
    box_text.set_bg_priority(0);
    box_text.set_palette_item(bn::sprite_palette_items::text_palette);
    name_banner banner(text);
    banner.show();

    while(true)
    {
        const mimas::event* touched = nullptr;

        if(w.moving == 0)
        {
            int want = -1;

            if(bn::keypad::down_held()) { want = DOWN; }
            else if(bn::keypad::up_held()) { want = UP; }
            else if(bn::keypad::left_held()) { want = LEFT; }
            else if(bn::keypad::right_held()) { want = RIGHT; }

            if(bn::keypad::a_pressed())
            {
                const mimas::event* e = event_at(w.cell_x + DX[w.facing], w.cell_y + DY[w.facing]);

                if(e && ! e->touch)
                {
                    run_event(*e, w, box_text, banner);
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
                    const mimas::event* e = event_at(tx, ty);

                    if(e && e->touch)
                    {
                        touched = e;
                    }

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
                const mimas::event* e = event_at(w.cell_x, w.cell_y);

                if(e && e->touch)
                {
                    touched = e;
                }
            }
        }

        w.place();

        if(w.moving == 0 && w.hop)
        {
            w.hop = 0;
        }

        if(touched)
        {
            run_event(*touched, w, box_text, banner);
        }

        if(bn::keypad::start_pressed())
        {
            banner.show();
        }

        banner.update();
        bn::core::update();
    }
}
