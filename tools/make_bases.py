#!/usr/bin/env python3
"""
Draws the plain gray mannequins used as starting points in GBA Studio.

  overworld_base.png  96 x 96: 16x32 frames, 6 columns x 3 rows
                      columns: walk (stand, step A, step B), run (stand, step A, step B)
                      rows:    down (front), up (back), left (side; right is mirrored in game)
  backsprite_base.png 448 x 64: 64x64 battle back-sprites, one per pose (see POSES)
  *_guide.png         the same sheets with red borders between frames, for painting
                      in outside tools (GBA Studio draws its own borders)

Every part is drawn with its own outline, so joints show like a wooden mannequin.
Re-run after tweaking:  python3 tools/make_bases.py
"""
import os
import math
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'gba', 'bases')

# The mannequin palette (15 colors + transparent), also written to gba.json.
OUTLINE = (48, 48, 56)
LIGHT = (208, 208, 216)
MID = (160, 160, 176)
DARK = (112, 112, 128)
EYE = (48, 48, 56)
WEAPON = (120, 128, 144)
WEAPON_LIGHT = (216, 224, 232)
FLAME = (248, 160, 64)
FLAME_LIGHT = (248, 224, 120)
PALETTE = [OUTLINE, LIGHT, MID, DARK, WEAPON, WEAPON_LIGHT, FLAME, FLAME_LIGHT]

POSES = ['default', 'greatsword', 'dagger', 'book', 'flaming_fists', 'rapier', 'claws']


class Canvas:
    """Draws parts back to front; each part gets shading and its own outline."""

    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]

    def part(self, inside, light=LIGHT, mid=MID, shade_right=0.65, outline=OUTLINE, shade_bottom=True):
        cells = set()
        xs, ys = [], []
        for y in range(self.h):
            for x in range(self.w):
                if inside(x + 0.5, y + 0.5):
                    cells.add((x, y))
                    xs.append(x)
                    ys.append(y)
        if not cells:
            return cells
        x0, x1 = min(xs), max(xs)
        y1 = max(ys)
        for (x, y) in cells:
            edge = any((x + dx, y + dy) not in cells for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                c = outline
            elif (x1 > x0 and (x - x0) / (x1 - x0) >= shade_right) or (shade_bottom and (x, y + 2) not in cells):
                c = mid
            else:
                c = light
            self.px[y][x] = c
        return cells

    def dot(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / max(1, n)
            self.dot(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), c)

    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x]:
                    im.putpixel((x, y), self.px[y][x] + (255,))
        return im


def rect(x0, y0, x1, y1):
    return lambda x, y: x0 <= x <= x1 and y0 <= y <= y1


def ellipse(cx, cy, rx, ry):
    return lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0


def rounded(x0, y0, x1, y1, r):
    def f(x, y):
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        cx = min(max(x, x0 + r), x1 - r)
        cy = min(max(y, y0 + r), y1 - r)
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    return f


def capsule(ax, ay, bx, by, r):
    """A limb: a thick line from a to b."""
    def f(x, y):
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / L))
        px, py = ax + t * dx, ay + t * dy
        return (x - px) ** 2 + (y - py) ** 2 <= r * r
    return f


# ----------------------------------------------------------------------------- overworld 16x32

def front_or_back(step, run, back):
    """step: 0 stand, 1 left foot forward, 2 right foot forward."""
    c = Canvas(16, 32)
    bob = 1 if (run and step) else 0          # running frames sit a pixel lower
    lift = 2 if run else 1                     # how far the back foot lifts
    lL = -lift if step == 2 else 0             # left leg shorter when it's the back leg
    lR = -lift if step == 1 else 0
    # legs
    c.part(rect(4, 24 + bob, 8, 32 + lL), shade_right=0.9)
    c.part(rect(8, 24 + bob, 12, 32 + lR), shade_right=0.6)
    # torso
    c.part(rounded(3.5, 19 + bob, 12.5, 27 + bob, 2))
    # arms swing opposite to the legs
    swing = (2 if run else 1)
    aL = swing if step == 1 else (-swing if step == 2 else 0)
    aR = -aL
    if run:  # bent arms
        c.part(capsule(3.0, 21.0 + bob, 2.5, 24.0 + bob - aL, 1.9), shade_right=0.9)
        c.part(capsule(13.0, 21.0 + bob, 13.5, 24.0 + bob - aR, 1.9), shade_right=0.4)
    else:
        c.part(capsule(3.0, 21.0 + bob, 3.0, 25.5 + bob + aL * 0.5, 1.9), shade_right=0.9)
        c.part(capsule(13.0, 21.0 + bob, 13.0, 25.5 + bob + aR * 0.5, 1.9), shade_right=0.4)
    # head
    c.part(ellipse(8.0, 14.5 + bob, 6.6, 6.0), shade_right=0.72)
    if not back:
        c.dot(6, 15 + bob, EYE)
        c.dot(6, 16 + bob, EYE)
        c.dot(9, 15 + bob, EYE)
        c.dot(9, 16 + bob, EYE)
    else:
        c.line(4, 12 + bob, 11, 12 + bob, MID)   # a seam so the back reads differently
    return c.image()


def side(step, run):
    """Facing left."""
    c = Canvas(16, 32)
    bob = 1 if (run and step) else 0
    lean = -1 if run else 0
    stride = (3 if run else 2) if step else 0
    # back leg (darker), then front leg
    if step == 0:
        c.part(rect(7, 24 + bob, 11, 32), light=MID, mid=DARK)
        c.part(rect(5, 24 + bob, 9, 32))
    else:
        back_x = 8 + stride if step == 1 else 8 - stride
        front_x = 8 - stride if step == 1 else 8 + stride
        c.part(capsule(8.0, 25.0 + bob, back_x, 30.0, 2.0), light=MID, mid=DARK)
        c.part(capsule(8.0, 25.0 + bob, front_x, 30.0, 2.0))
    # back arm
    swing = (3 if run else 2) if step else 0
    sgn = 1 if step == 1 else -1
    c.part(capsule(9.0 + lean, 21.0 + bob, 9.0 + lean + sgn * swing * 0.7, 25.0 + bob, 1.9), light=MID, mid=DARK)
    # torso
    c.part(rounded(4.5 + lean, 19 + bob, 11.5 + lean, 27 + bob, 2))
    # front arm
    c.part(capsule(8.0 + lean, 21.0 + bob, 8.0 + lean - sgn * swing * 0.7, (25.0 if not run else 23.5) + bob, 1.9))
    # head
    c.part(ellipse(8.0 + lean, 14.5 + bob, 6.0, 6.0), shade_right=0.75)
    c.dot(4 + lean, 15 + bob, EYE)
    c.dot(4 + lean, 16 + bob, EYE)
    c.dot(1 + lean, 15 + bob, OUTLINE)   # nose bump
    return c.image()


def overworld_sheet():
    sheet = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
    for row, make in enumerate([lambda s, r: front_or_back(s, r, False),
                                lambda s, r: front_or_back(s, r, True),
                                lambda s, r: side(s, r)]):
        for col in range(6):
            run = col >= 3
            step = col % 3
            sheet.alpha_composite(make(step, run), (col * 16, row * 32))
    return sheet


# ----------------------------------------------------------------------------- back-sprites 64x64

def back_pose(pose):
    c = Canvas(64, 64)
    hx, hy = 31, 24  # head centre

    def arm(ax, ay, bx, by, front=True):
        c.part(capsule(ax, ay, bx, by, 4.2), light=LIGHT if front else MID, mid=MID if front else DARK)

    def hand(x, y, front=True):
        c.part(ellipse(x, y, 4.4, 4.2), light=LIGHT if front else MID, mid=MID if front else DARK)

    def blade(ax, ay, bx, by, width):
        c.part(capsule(ax, ay, bx, by, width), light=WEAPON_LIGHT, mid=WEAPON, shade_right=0.6)

    # things behind the body
    if pose == 'greatsword':
        blade(48, 34, 60, 2, 2.6)
        c.part(rect(42, 33, 54, 37), light=WEAPON, mid=DARK)           # cross guard
    if pose == 'rapier':
        arm(14, 38, 6, 20, front=False)                                  # off hand up behind
        hand(6, 18, front=False)

    # torso and shoulders (seen from behind, cut off at the bottom like Pokémon)
    c.part(rounded(12, 34, 50, 70, 9), shade_right=0.7)
    c.line(31, 40, 31, 63, MID)  # spine seam

    if pose == 'default':
        arm(13, 40, 9, 62)
        arm(49, 40, 53, 62)
    elif pose == 'greatsword':
        arm(14, 40, 30, 46)
        arm(48, 40, 46, 38)
        hand(46, 37)
        hand(31, 46)
    elif pose == 'dagger':
        arm(13, 40, 9, 62)
        arm(48, 40, 54, 48)
        blade(55, 46, 60, 34, 1.6)
        hand(54, 48)
    elif pose == 'book':
        arm(14, 40, 12, 50)
        c.part(rect(2, 42, 20, 58), light=WEAPON_LIGHT, mid=WEAPON, shade_right=0.85)  # book
        c.line(11, 43, 11, 57, WEAPON)
        hand(12, 52)
        arm(49, 40, 53, 62)
    elif pose == 'flaming_fists':
        arm(14, 40, 10, 44)
        arm(48, 40, 52, 44)
        for fx in (9, 53):
            c.part(lambda x, y, fx=fx: (abs(x - fx) * 1.1 + (46 - y) * 0.42 <= 8.0) and 24 <= y <= 46,
                   light=FLAME_LIGHT, mid=FLAME, outline=FLAME, shade_bottom=False)
            hand(fx, 46)
    elif pose == 'rapier':
        arm(48, 40, 56, 36)
        hand(56, 35)
        blade(57, 33, 63, 6, 0.9)
        c.part(ellipse(56, 37, 4, 2.2), light=WEAPON_LIGHT, mid=WEAPON)  # cup guard
    elif pose == 'claws':
        arm(14, 40, 6, 30)
        arm(48, 40, 56, 30)
        for (hx2, sgn) in ((6, -1), (56, 1)):
            hand(hx2, 28)
            for k in range(3):
                c.line(hx2 - 3 + k * 3, 24, hx2 - 3 + k * 3 + sgn * 2, 17, WEAPON_LIGHT)

    # head last (in front of the shoulders)
    c.part(ellipse(hx, hy, 12.5, 12.0), shade_right=0.7)
    c.line(hx - 9, hy - 3, hx + 9, hy - 3, MID)   # back-of-head seam
    return c.image()


def back_sheet():
    sheet = Image.new('RGBA', (64 * len(POSES), 64), (0, 0, 0, 0))
    for i, p in enumerate(POSES):
        sheet.alpha_composite(back_pose(p), (i * 64, 0))
    return sheet


def guide(sheet, fw, fh):
    g = sheet.copy()
    for x in range(0, g.width + 1, fw):
        for y in range(g.height):
            for xx in (x - 1, x):
                if 0 <= xx < g.width:
                    g.putpixel((xx, y), (255, 0, 0, 255))
    for y in range(0, g.height + 1, fh):
        for x in range(g.width):
            for yy in (y - 1, y):
                if 0 <= yy < g.height:
                    g.putpixel((x, yy), (255, 0, 0, 255))
    return g


def main():
    os.makedirs(OUT, exist_ok=True)
    ow = overworld_sheet()
    ow.save(os.path.join(OUT, 'overworld_base.png'))
    guide(ow, 16, 32).save(os.path.join(OUT, 'overworld_base_guide.png'))
    bs = back_sheet()
    bs.save(os.path.join(OUT, 'backsprite_base.png'))
    guide(bs, 64, 64).save(os.path.join(OUT, 'backsprite_base_guide.png'))
    # Big previews for checking by eye
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    ow.resize((ow.width * 6, ow.height * 6), Image.NEAREST).save(os.path.join(ROOT, 'build', 'overworld_preview.png'))
    bs.resize((bs.width * 3, bs.height * 3), Image.NEAREST).save(os.path.join(ROOT, 'build', 'backsprite_preview.png'))
    print('wrote', OUT)


if __name__ == '__main__':
    main()
