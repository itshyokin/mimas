/*
 * Mimas runtime: plays a map exported from the Saturn Game Engine.
 *
 * v0.1: walk around one map with grid movement, collision, cliffs and bridges,
 * tree tops drawn over the player, and the map name shown on arrival.
 *
 * Controls: D-pad walk, hold B run, START shows the map name again.
 */

#include "bn_core.h"
#include "bn_keypad.h"
#include "bn_display.h"
#include "bn_camera_ptr.h"
#include "bn_regular_bg_ptr.h"
#include "bn_sprite_ptr.h"
#include "bn_sprite_text_generator.h"
#include "bn_vector.h"
#include "bn_string_view.h"

#include "bn_regular_bg_items_world_ground.h"
#include "bn_regular_bg_items_world_over.h"
#include "bn_sprite_items_hero.h"

#include "common_variable_8x16_sprite_font.h"
#include "mimas_map.h"

namespace
{
    constexpr int CELL = 16;
    constexpr int HALF_W = bn::display::width() / 2;
    constexpr int HALF_H = bn::display::height() / 2;

    // Facing directions, in the same order as the hero sprite strip.
    enum dir { DOWN, UP, LEFT, RIGHT };
    constexpr int DX[] = { 0, 0, -1, 1 };
    constexpr int DY[] = { 1, -1, 0, 0 };

    [[nodiscard]] bool inside(int x, int y)
    {
        return x >= 0 && y >= 0 && x < mimas::map::width && y < mimas::map::height;
    }

    [[nodiscard]] int cell_index(int x, int y)
    {
        return y * mimas::map::width + x;
    }

    // Can the player step from (fx, fy) to the neighbouring cell (tx, ty)?
    [[nodiscard]] bool can_step(int fx, int fy, int tx, int ty)
    {
        if(! inside(tx, ty))
        {
            return false;
        }

        uint8_t to = mimas::map::collision[cell_index(tx, ty)];

        if(to & mimas::map::solid)
        {
            return false;
        }

        uint8_t from = mimas::map::collision[cell_index(fx, fy)];

        if((to | from) & mimas::map::bridge)
        {
            return true;
        }

        // Height differences of 2 or more are ledges and cliffs.
        int dh = mimas::map::heights[cell_index(tx, ty)] - mimas::map::heights[cell_index(fx, fy)];
        return dh >= -1 && dh <= 1;
    }

    // World coordinates: the background's centre is (0, 0).
    [[nodiscard]] int world_x(int px)
    {
        return px - mimas::map::bg_width / 2;
    }

    [[nodiscard]] int world_y(int py)
    {
        return py - mimas::map::bg_height / 2;
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
            _generator.generate(0, -HALF_H + 14, mimas::map::name, _sprites);
            _frames = 150;
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
}

int main()
{
    bn::core::init();

    bn::regular_bg_ptr ground = bn::regular_bg_items::world_ground.create_bg(0, 0);
    bn::regular_bg_ptr over = bn::regular_bg_items::world_over.create_bg(0, 0);
    ground.set_priority(3);
    over.set_priority(1);

    int cell_x = mimas::map::start_x;
    int cell_y = mimas::map::start_y;
    int facing = mimas::map::start_dir;

    // Pixel position of the player's cell (top-left corner, in background pixels).
    int px = cell_x * CELL;
    int py = cell_y * CELL;

    bn::camera_ptr camera = bn::camera_ptr::create(0, 0);
    ground.set_camera(camera);
    over.set_camera(camera);

    bn::sprite_ptr hero = bn::sprite_items::hero.create_sprite(0, 0);
    hero.set_camera(camera);
    hero.set_bg_priority(2);   // between the ground (3) and the tree tops (1)

    bn::sprite_text_generator text(common::variable_8x16_sprite_font);
    text.set_center_alignment();
    text.set_bg_priority(0);
    name_banner banner(text);
    banner.show();

    int moving = 0;      // pixels left to walk into the next cell
    int walk_anim = 0;   // counts pixels walked, drives the walk frames
    int bump = 0;        // short pause after walking into a wall

    while(true)
    {
        if(moving == 0)
        {
            int want = -1;

            if(bn::keypad::down_held()) { want = DOWN; }
            else if(bn::keypad::up_held()) { want = UP; }
            else if(bn::keypad::left_held()) { want = LEFT; }
            else if(bn::keypad::right_held()) { want = RIGHT; }

            if(want >= 0)
            {
                facing = want;
                int tx = cell_x + DX[want];
                int ty = cell_y + DY[want];

                if(can_step(cell_x, cell_y, tx, ty))
                {
                    cell_x = tx;
                    cell_y = ty;
                    moving = CELL;
                }
                else if(bump == 0)
                {
                    bump = 8;
                }
            }
            else
            {
                walk_anim = 0;
            }

            if(bump > 0)
            {
                --bump;
            }
        }

        if(moving > 0)
        {
            int speed = bn::keypad::b_held() ? 2 : 1;
            speed = bn::min(speed, moving);
            moving -= speed;
            walk_anim += speed;
            px += DX[facing] * speed;
            py += DY[facing] * speed;
        }

        // Sprite frames: 0 = standing, 1..8 = walking (a new frame every 2 pixels).
        int frame = (moving > 0 || walk_anim % CELL != 0) ? 1 + (walk_anim / 2) % 8 : 0;
        hero.set_tiles(bn::sprite_items::hero.tiles_item(), facing * mimas::map::hero_frames + frame);

        // The 32x32 sprite's feet sit at the bottom of its cell.
        hero.set_position(world_x(px + CELL / 2), world_y(py));

        int cam_x = clamp_camera(world_x(px + CELL / 2), mimas::map::width * CELL, mimas::map::bg_width, HALF_W);
        int cam_y = clamp_camera(world_y(py + CELL / 2), mimas::map::height * CELL, mimas::map::bg_height, HALF_H);
        camera.set_position(cam_x, cam_y);

        if(bn::keypad::start_pressed())
        {
            banner.show();
        }

        banner.update();
        bn::core::update();
    }
}
