#!/usr/bin/env python3
"""
Draws a starter GBA tile set in GBA Studio's default palettes, plus a sample
map that uses every kind of tile, so the Maps tab and the ROM have something
real to show. Everything it makes is ordinary GBA Studio data: repaint the
tiles in GBA Studio and the map follows.

  python3 tools/make_starter.py          adds missing starter tiles + the sample map
  python3 tools/make_starter.py --force  redraws them (overwrites your edits to them!)

Writes public/gba/tiles/*.png, adds entries to public/data/gba.json, and
writes public/data/gbamaps/starter_meadow.json (set as the ROM's map if none is set).
"""
import json
import math
import os
import random
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
GBA_JSON = os.path.join(PUBLIC, 'data', 'gba.json')
C = 16


def load():
    with open(GBA_JSON, encoding='utf-8') as f:
        return json.load(f)


def rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


class Pal:
    def __init__(self, data, pid):
        p = next(x for x in data['palettes'] if x['id'] == pid)
        self.c = [rgb(h) for h in p['colors']]

    def __getitem__(self, i):
        return self.c[i]


T = (0, 0, 0, 0)


def new(w, h):
    return Image.new('RGBA', (w, h), T)


# ----------------------------------------------------------------------------- shapes for 13-piece sets

# A 3x3 block (48x48) plus four inner corners. `rock(x, y, piece)` decides each pixel.
OUTER = {'tl': (0, 0), 't': (1, 0), 'tr': (2, 0), 'l': (0, 1), 'c': (1, 1), 'r': (2, 1), 'bl': (0, 2), 'b': (1, 2), 'br': (2, 2)}
INNER = {'itl': (3, 0), 'itr': (4, 0), 'ibl': (3, 1), 'ibr': (4, 1)}


def piece_sheet(pixel, frames=1):
    """pixel(frame, piece, x, y) -> color for local cell coords; outer pieces also get blob coords."""
    img = new(5 * C, 3 * C * frames)
    for f in range(frames):
        for name, (cx, cy) in OUTER.items():
            for y in range(C):
                for x in range(C):
                    col = pixel(f, name, cx * C + x, cy * C + y, x, y)
                    if col:
                        img.putpixel((cx * C + x, f * 3 * C + cy * C + y), col)
        for name, (cx, cy) in INNER.items():
            for y in range(C):
                for x in range(C):
                    col = pixel(f, name, None, None, x, y)
                    if col:
                        img.putpixel((cx * C + x, f * 3 * C + cy * C + y), col)
    return img


def inside_blob(bx, by, e, r):
    """Inside a rounded square inset e from the 48x48 block edges, corner radius r."""
    lo, hi = e, 47 - e
    if not (lo <= bx <= hi and lo <= by <= hi):
        return False
    cx = min(max(bx, lo + r), hi - r)
    cy = min(max(by, lo + r), hi - r)
    return (bx - cx) ** 2 + (by - cy) ** 2 <= r * r + 0.5


def inside_inner(name, x, y, e):
    """Inner corners: everything inside except a notch at one corner."""
    nx = x < e if name in ('itl', 'ibl') else x > 15 - e
    ny = y < e if name in ('itl', 'itr') else y > 15 - e
    return not (nx and ny)


def region_sheet(e, r, fill, border, frames=1):
    """Paths and water: a region drawn over the ground, with a border line."""
    def inside(f, name, bx, by, x, y):
        if name in INNER:
            return inside_inner(name, x, y, e)
        return inside_blob(bx, by, e, r)

    def pixel(f, name, bx, by, x, y):
        if not inside(f, name, bx, by, x, y):
            return None
        # border: a neighbour (in the same piece) is outside
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < C and 0 <= ny < C:
                nb = inside(f, name, (bx - x + nx) if bx is not None else None, (by - y + ny) if by is not None else None, nx, ny)
            else:
                # across the cell edge: outer pieces continue the blob; inner pieces are inside there
                nb = inside_blob(bx + dx, by + dy, e, r) if bx is not None and 0 <= bx + dx < 48 and 0 <= by + dy < 48 else True
            if not nb:
                return border(f, x, y)
        return fill(f, name, x, y)
    return piece_sheet(pixel, frames)


# ----------------------------------------------------------------------------- the tiles

def grass_ground(g):
    rnd = random.Random(7)
    img = new(C, C)
    for y in range(C):
        for x in range(C):
            img.putpixel((x, y), g[3])
    for _ in range(5):
        x, y = rnd.randrange(1, 15), rnd.randrange(2, 15)
        img.putpixel((x, y), g[2])
        img.putpixel(((x + 1) % C, y - 1), g[2])
        img.putpixel(((x - 1) % C, y - 1), g[2])
    for _ in range(4):
        img.putpixel((rnd.randrange(C), rnd.randrange(C)), g[4])
    return img


def dirt_path(g):
    rnd = random.Random(3)
    speck = {(rnd.randrange(C), rnd.randrange(C)): rnd.choice((8, 10)) for _ in range(10)}
    return region_sheet(3, 5, lambda f, n, x, y: g[speck.get((x, y), 9)], lambda f, x, y: g[7])


def pond(w):
    def fill(f, name, x, y):
        # drifting wave dashes, two frames
        if (y % 6 == 2) and ((x + f * 3 + (y // 6) * 5) % 8) < 3:
            return w[5]
        return w[3]
    return region_sheet(3, 5, fill, lambda f, x, y: w[6], frames=2)


def rock_cliff(r):
    """A ring of rock filling the edge tiles (they block, so they should look solid): a rocky rim on the
    top and sides, and a full-height face at the bottom. The middle stays empty so the ground shows on
    top of the cliff, where you can walk."""
    B, FACE = 12, 16
    rnd = random.Random(11)
    speck = {(rnd.randrange(48), rnd.randrange(48)) for _ in range(90)}

    def face(x, y_in_face):
        if y_in_face == 0:
            return r[9]          # grassy lip
        if y_in_face == 1:
            return r[8]
        if y_in_face == FACE - 1:
            return r[1]          # shadow at the foot
        if (x * 3 + y_in_face * 2) % 11 == 0 or (x % 6 == 2 and y_in_face % 5 == 3):
            return r[2]          # cracks
        return r[4] if y_in_face == 2 else r[3]

    def rim(d, x, y):
        """d: distance from the outside of the plateau."""
        if d == 0:
            return r[1]
        if d == 1:
            return r[2]
        if d == B - 1:
            return r[3]          # shade where the rim meets the grass on top
        return r[3] if (x % 48, y % 48) in speck else r[5] if d == 2 else r[4]

    def pixel(f, name, bx, by, x, y):
        if name in INNER:
            left = name in ('itl', 'ibl')
            top = name in ('itl', 'itr')
            dx = x if left else 15 - x
            if top:
                if dx < B and y < B:
                    return rim(min(dx, y) if dx < B and y < B else B, x, y)
                return None
            if dx < B:
                return face(x, y) if dx >= 1 else r[1]
            return None
        if by >= 48 - FACE:
            if bx < 1 or bx > 46:
                return r[1]
            return face(bx, by - (48 - FACE))
        d = min(bx, by, 47 - bx)
        if d < B:
            return rim(d, bx, by)
        return None
    return piece_sheet(pixel)


def grass_ledge(g):
    img = new(5 * C, 3 * C)  # south L / M / R along the top; east and west columns: top, middle, bottom
    rows = {10: g[4], 11: g[3], 12: g[2], 13: g[1], 14: g[1], 15: g[0]}
    for i in range(3):  # south: left end, middle, right end
        for y, col in rows.items():
            for x in range(C):
                if i == 0 and x < (15 - y) // 2 + 1:
                    continue
                if i == 2 and x > 15 - ((15 - y) // 2 + 1):
                    continue
                img.putpixel((i * C + x, y), col)
    for r in range(3):  # east (drop to the right) and west (drop to the left), rounded ends at top and bottom
        for y in range(C):
            for k, col in rows.items():
                cut = (15 - k) // 2 + 1
                if (r == 0 and y < cut) or (r == 2 and y > 15 - cut):
                    continue
                img.putpixel((3 * C + k, r * C + y), col)
                img.putpixel((4 * C + 15 - k, r * C + y), col)
    return img


def stone_stairs(r):
    img = new(C, C)
    for y in range(C):
        for x in range(C):
            if x < 1 or x > 14:
                col = r[1]
            elif x < 2 or x > 13:
                col = r[2]
            else:
                col = (r[5], r[4], r[2], r[1])[y % 4]
            img.putpixel((x, y), col)
    return img


def wood_ladder(r):
    img = new(C, C)
    for y in range(C):
        for x in (3, 4, 11, 12):
            img.putpixel((x, y), r[1] if x in (3, 12) else r[5])
        if y % 4 == 1:
            for x in range(5, 11):
                img.putpixel((x, y), r[5])
            for x in range(5, 11):
                img.putpixel((x, y + 1), r[2])
    return img


def tall_grass(g):
    img = new(2 * C, C)
    blades = [(1, 3), (4, 2), (7, 3), (10, 2), (13, 3), (2, 8), (6, 7), (9, 8), (12, 7)]
    for frame in range(2):
        lean = frame
        for (bx, by) in blades:
            for k in range(7):
                y = by + k
                if y >= C:
                    break
                xl = bx - (k + 1) // 3 - (lean if k < 3 else 0)
                xr = bx + 1 + (k + 1) // 3 - (lean if k < 3 else 0)
                for x, col in ((xl, g[1]), (xr, g[2]), (bx, g[4] if k < 2 else g[3])):
                    if 0 <= x < C:
                        img.putpixel((frame * C + x, y), col)
    return img


def flowers(g):
    img = new(C, C)
    for (fx, fy, petal) in ((3, 4, 12), (11, 3, 13), (6, 11, 13), (13, 11, 12)):
        img.putpixel((fx, fy + 2), g[2])
        img.putpixel((fx, fy + 3), g[2])
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            img.putpixel((fx + dx, fy + dy), g[petal])
        img.putpixel((fx, fy), g[14])
    return img


def signpost(g):
    img = new(C, C)
    for y in range(9, 16):
        for x in (7, 8):
            img.putpixel((x, y), g[11] if x == 7 else g[7])
    for y in range(2, 10):
        for x in range(2, 14):
            edge = y in (2, 9) or x in (2, 13)
            img.putpixel((x, y), g[7] if edge else (g[8] if y < 6 else g[9]))
    for x in range(4, 12):
        img.putpixel((x, 4), g[11])
    for x in range(4, 9):
        img.putpixel((x, 6), g[11])
    return img


def pine(g):
    """Your pine art (images/gb_tiles/pinetree.png), fitted to a 2x2-tile tree."""
    src = Image.open(os.path.join(ROOT, 'images', 'gb_tiles', 'pinetree.png')).convert('RGBA')
    src = src.crop(src.getbbox())
    s = min(2 * C / src.width, 2 * C / src.height)
    w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    src = src.resize((w, h), Image.BOX)
    img = new(2 * C, 2 * C)
    img.alpha_composite(src, ((2 * C - w) // 2, 2 * C - h))
    pal = g.c
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r_, g_, b_, a = px[x, y]
            if a < 110:
                px[x, y] = T
            else:
                px[x, y] = min(pal, key=lambda c: (c[0] - r_) ** 2 + (c[1] - g_) ** 2 + (c[2] - b_) ** 2)
    return img


STARTER = [
    # id, name, type, palette, draw, extra
    ('grass', 'Grass', 'ground', 'grass', grass_ground, {}),
    ('dirt_path', 'Dirt path', 'path', 'grass', dirt_path, {}),
    ('pond', 'Pond', 'water', 'water', pond, {'frames': 2}),
    ('rock_cliff', 'Rock cliff', 'cliff', 'rock', rock_cliff, {}),
    ('grass_ledge', 'Grass ledge', 'ledge', 'grass', grass_ledge, {}),
    ('stone_stairs', 'Stone stairs', 'stairs', 'rock', stone_stairs, {}),
    ('wood_ladder', 'Ladder', 'ladder', 'rock', wood_ladder, {}),
    ('tall_grass', 'Tall grass', 'tallgrass', 'grass', tall_grass, {}),
    ('pine', 'Pine tree', 'object', 'grass', pine, {'w': 2, 'h': 2}),
    ('flowers', 'Flowers', 'decor', 'grass', flowers, {'pass': 'O'}),
    ('signpost', 'Signpost', 'decor', 'grass', signpost, {'pass': 'X'}),
]


# ----------------------------------------------------------------------------- sample map

def sample_map(tiles):
    W, H = 32, 24
    idx = {t: i + 1 for i, t in enumerate(tiles)}
    grid = lambda v=0: [[v] * W for _ in range(H)]
    ground, terrain, cliff, level = grid(idx['grass']), grid(), grid(), grid()
    objects = []

    def rect(g, x0, y0, x1, y1, v):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                g[y][x] = v

    # A two-tier plateau in the north-west, with stairs up each tier
    rect(cliff, 3, 2, 14, 10, idx['rock_cliff'])
    rect(level, 3, 2, 14, 10, 1)
    rect(level, 5, 3, 11, 7, 2)
    rect(level, 10, 3, 11, 4, 2)
    objects.append({'t': idx['stone_stairs'], 'x': 9, 'y': 10})
    objects.append({'t': idx['stone_stairs'], 'x': 8, 'y': 7})
    objects.append({'t': idx['flowers'], 'x': 7, 'y': 5})
    objects.append({'t': idx['flowers'], 'x': 6, 'y': 8})

    # The path from the south up to the stairs, and east to the tall grass
    for y in range(11, 23):
        terrain[y][15] = terrain[y][16] = idx['dirt_path']
    for x in range(9, 17):
        terrain[11][x] = terrain[12][x] = idx['dirt_path']
    for x in range(16, 23):
        terrain[15][x] = terrain[16][x] = idx['dirt_path']

    # A pond in the east with a bite out of it
    for y in range(13, 20):
        for x in range(23, 30):
            if not (y > 17 and x < 25):
                terrain[y][x] = idx['pond']

    # Ledges to hop down south of the plateau
    objects.append({'t': idx['grass_ledge'], 'x': 2, 'y': 15, 'p': 0})
    for x in range(3, 12):
        objects.append({'t': idx['grass_ledge'], 'x': x, 'y': 15, 'p': 1})
    objects.append({'t': idx['grass_ledge'], 'x': 12, 'y': 15, 'p': 2})

    # Tall grass in the north-east
    for y in range(3, 9):
        for x in range(21, 29):
            objects.append({'t': idx['tall_grass'], 'x': x, 'y': y})

    # Trees around the edge (2x2 each)
    for x in range(0, W, 2):
        objects.append({'t': idx['pine'], 'x': x, 'y': 0} if x > 15 else None)
        objects.append({'t': idx['pine'], 'x': x, 'y': H - 2} if x not in (14, 16) else None)
    for y in range(2, H - 2, 2):
        objects.append({'t': idx['pine'], 'x': 0, 'y': y} if y < 2 or y > 10 else None)
        objects.append({'t': idx['pine'], 'x': W - 2, 'y': y})
    objects.append({'t': idx['pine'], 'x': 18, 'y': 19})
    objects.append({'t': idx['pine'], 'x': 20, 'y': 11})
    objects = [o for o in objects if o]

    # Flowers and a sign by the path
    for (x, y) in ((13, 18), (12, 20), (19, 18), (20, 21), (5, 13), (17, 13)):
        objects.append({'t': idx['flowers'], 'x': x, 'y': y})
    objects.append({'t': idx['signpost'], 'x': 17, 'y': 20})

    return {
        'id': 'starter_meadow', 'name': 'Starter Meadow', 'width': W, 'height': H,
        'tiles': tiles, 'ground': ground, 'terrain': terrain, 'cliff': cliff, 'level': level,
        'objects': objects, 'pass': ['.' * W for _ in range(H)], 'start': [15, 21],
    }


def main():
    force = '--force' in sys.argv
    data = load()
    pals = {p['id']: Pal(data, p['id']) for p in data['palettes'] if p['id'] in ('grass', 'water', 'rock')}
    os.makedirs(os.path.join(PUBLIC, 'gba', 'tiles'), exist_ok=True)
    have = {t['id'] for t in data.get('tiles', [])}
    for (tid, name, ttype, pal, draw, extra) in STARTER:
        path = f'gba/tiles/{tid}.png'
        if tid in have and not force:
            continue
        draw(pals[pal]).save(os.path.join(PUBLIC, path))
        entry = {'id': tid, 'name': name, 'type': ttype, 'palette': pal, 'image': path, **extra}
        data['tiles'] = [t for t in data.get('tiles', []) if t['id'] != tid] + [entry]
        print('  tile', tid)
    maps_dir = os.path.join(PUBLIC, 'data', 'gbamaps')
    os.makedirs(maps_dir, exist_ok=True)
    mpath = os.path.join(maps_dir, 'starter_meadow.json')
    if force or not os.path.exists(mpath):
        m = sample_map([t[0] for t in STARTER])
        with open(mpath, 'w', encoding='utf-8') as f:
            json.dump(m, f, separators=(',', ':'))
            f.write('\n')
        print('  map starter_meadow')
    data.setdefault('maps', [])
    if 'starter_meadow' not in data['maps']:
        data['maps'].append('starter_meadow')
    data.setdefault('startMap', 'starter_meadow')
    with open(GBA_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
        f.write('\n')


if __name__ == '__main__':
    main()
