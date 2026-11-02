#!/usr/bin/env python3
"""
Mimas exporter: turns a Saturn Game Engine map into GBA data for the Butano runtime.

Reads   public/data/mimas.json  (which map, where the player starts)
        public/data/maps/<map>.json, public/data/assets.json, public/assets/tiles
        public/data/gba.json + public/gba/  (GBA Studio: palettes, painted sprites)
Writes  game/graphics/world_ground.bmp/.json   ground layer (behind the player)
        game/graphics/world_over.bmp/.json     overhead layer (tree tops, in front)
        game/graphics/world_palette.bmp/.json  shared background palette
        game/graphics/hero.bmp/.json           player sprite (32x32 frames)
        game/include/mimas_map.h               size, start, collision, heights, name
        build/preview.png                      what the map looks like (for checking)

GBA rules this enforces automatically:
  - every map cell is 16x16 pixels (bigger tiles are shrunk)
  - colors are reduced so each 8x8 block uses one 16-color palette, max 15 palettes
"""
import json
import math
from gba_events import Compiler
import os
import sys
from collections import Counter

import warnings

from PIL import Image, ImageDraw

warnings.filterwarnings('ignore', category=DeprecationWarning)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, 'public')
DATA = os.environ.get('MIMAS_DATA') or os.path.join(PUBLIC, 'data')   # MIMAS_DATA: test data elsewhere
GFX = os.path.join(ROOT, 'game', 'graphics')
INC = os.path.join(ROOT, 'game', 'include')
CELL = 16
BACKDROP = (16, 24, 16)

# Bits in the collision grid
SOLID = 1
BRIDGE = 2
LEDGE_S = 4    # hop down going south
LEDGE_E = 8    # hop going east
LEDGE_W = 16   # hop going west
WATER = 32     # for Surf, later
GRASS = 64     # tall grass, for random battles later


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# Built-in prop art the exporter uses (from images/gb_tiles).
PROP_ART = {'pine.png': 'images/gb_tiles/pinetree.png', 'tuft.png': 'images/gb_tiles/grass_patch_test.png'}


def project_image(rel):
    """An image by its path under public/ (as assets.json writes it), or a built-in prop picture."""
    for p in (os.path.join(PUBLIC, rel), os.path.join(ROOT, PROP_ART.get(rel, '\0'))):
        if os.path.isfile(p):
            return Image.open(p).convert('RGBA')
    return None


def shrink(im, w, h):
    """Shrink pixel art to w x h. Exact 2x/3x/4x art uses nearest, anything else box-averages."""
    if im.size == (w, h):
        return im
    sx, sy = im.width / w, im.height / h
    if sx == sy and sx == int(sx):
        s = int(sx)
        near = im.resize((w, h), Image.NEAREST)
        if near.resize(im.size, Image.NEAREST).tobytes() == im.tobytes():
            return near
    return im.resize((w, h), Image.BOX)


# ----------------------------------------------------------------------------- tile art

def tile_cell(tdef):
    """One 16x16 picture for a terrain tile definition."""
    im = project_image(tdef.get('image', ''))
    if im is None:
        return None
    kind = tdef.get('kind', '')
    if kind == 'animated':
        # Frames side by side, each as tall as the strip: use the first one.
        fs = im.height
        im = im.crop((0, 0, fs, fs))
    elif kind == 'wall' or im.width != im.height:
        # Autotile / wall sheets: take a block from the middle, which is the plain fill.
        s = min(im.width, im.height, 32) // 2 * 2
        cx, cy = im.width // 2, im.height // 2
        im = im.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2))
    return shrink(im, CELL, CELL)


def solid_cell(rgb):
    return Image.new('RGBA', (CELL, CELL), rgb + (255,))


def shade(im, factor):
    px = im.load()
    out = im.copy()
    o = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            o[x, y] = (min(255, int(r * factor)), min(255, int(g * factor)), min(255, int(b * factor)), a)
    return out


def cliff_cell(rock):
    """A cliff face: darker rock with a light rim at the top and a shadow at the bottom."""
    c = shade(rock, 0.72)
    d = ImageDraw.Draw(c)
    d.line([(0, 0), (CELL - 1, 0)], fill=(196, 176, 140, 255))
    d.line([(0, CELL - 1), (CELL - 1, CELL - 1)], fill=(40, 30, 24, 255))
    return c


def plank_cell(vertical):
    c = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    for i in range(0, CELL, 4):
        if vertical:
            d.rectangle([2, i, CELL - 3, i + 2], fill=(156, 108, 60, 255))
            d.line([(2, i + 3), (CELL - 3, i + 3)], fill=(92, 60, 32, 255))
        else:
            d.rectangle([i, 2, i + 2, CELL - 3], fill=(156, 108, 60, 255))
            d.line([(i + 3, 2), (i + 3, CELL - 3)], fill=(92, 60, 32, 255))
    if vertical:
        d.line([(1, 0), (1, CELL - 1)], fill=(72, 44, 24, 255))
        d.line([(CELL - 2, 0), (CELL - 2, CELL - 1)], fill=(72, 44, 24, 255))
    else:
        d.line([(0, 1), (CELL - 1, 1)], fill=(72, 44, 24, 255))
        d.line([(0, CELL - 2), (CELL - 1, CELL - 2)], fill=(72, 44, 24, 255))
    return c


def sign_cell():
    c = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    d.rectangle([7, 9, 8, 15], fill=(92, 60, 32, 255))
    d.rectangle([2, 2, 13, 9], fill=(176, 128, 72, 255), outline=(72, 44, 24, 255))
    d.line([(4, 5), (11, 5)], fill=(110, 76, 40, 255))
    d.line([(4, 7), (9, 7)], fill=(110, 76, 40, 255))
    return c


def crystal_cell():
    c = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(c)
    d.polygon([(8, 0), (13, 6), (10, 15), (6, 15), (3, 6)], fill=(96, 220, 210, 255), outline=(24, 96, 104, 255))
    d.line([(8, 1), (8, 14)], fill=(200, 255, 248, 255))
    return c


def tree_parts():
    """The pine split into its lower cell (ground layer) and upper cell (drawn over the player)."""
    im = project_image('pine.png')
    if im is None:
        im = Image.new('RGBA', (16, 32), (0, 0, 0, 0))
        ImageDraw.Draw(im).polygon([(8, 0), (15, 26), (1, 26)], fill=(40, 120, 48, 255))
    bbox = im.getbbox() or (0, 0, im.width, im.height)
    im = im.crop(bbox)
    # Fit into 16 x 32 keeping the shape, trunk at the bottom.
    s = min(CELL / im.width, 2 * CELL / im.height)
    w, h = max(1, round(im.width * s)), max(1, round(im.height * s))
    im = im.resize((w, h), Image.BOX)
    canvas = Image.new('RGBA', (CELL, 2 * CELL), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((CELL - w) // 2, 2 * CELL - h))
    # Hard edges: GBA pixels are either fully there or not.
    px = canvas.load()
    for y in range(canvas.height):
        for x in range(canvas.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
    return canvas.crop((0, CELL, CELL, 2 * CELL)), canvas.crop((0, 0, CELL, CELL))


def hard_alpha(im):
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
    return im


# ----------------------------------------------------------------------------- map build

def num(s, default=0.0):
    try:
        return float(str(s).rstrip('s'))
    except ValueError:
        return default


def build_map(cfg, mp, assets):
    W, H = mp['width'], mp['height']
    terrain = mp['terrain']
    heights = [[num(v) for v in row.split()] for row in mp.get('heights', [])] or [[0] * W for _ in range(H)]
    water = [row.split() for row in mp.get('water', [])] or [['.'] * W for _ in range(H)]

    tiles = {t['key']: t for t in assets.get('tiles', [])}
    cells = {}
    blocks = {}
    for key, t in tiles.items():
        c = tile_cell(t)
        if c is not None:
            cells[key] = c
            blocks[key] = bool(t.get('blocks'))
    # Built-in tiles the engine draws itself, for keys the project didn't give a picture.
    fallback = {'.': (72, 152, 64), ':': (214, 196, 128), '=': (168, 132, 88), '~': (64, 136, 216)}

    def cell_for(key):
        if key not in cells:
            cells[key] = solid_cell(fallback.get(key, (110, 110, 110)))
            blocks[key] = key == '~'
        return cells[key]

    rock = cells.get(mp.get('cliffTile', '▲')) or cells.get('▲') or solid_cell((110, 96, 80))
    cliff = cliff_cell(rock)
    water_tile = cells.get('~') or solid_cell((64, 136, 216))
    tree_low, tree_high = tree_parts()
    tuft = project_image('tuft.png')
    tuft = hard_alpha(shrink(tuft, CELL, CELL)) if tuft else None
    planks_h, planks_v = plank_cell(False), plank_cell(True)
    sign, crystal = sign_cell(), crystal_cell()

    ground = Image.new('RGBA', (W * CELL, H * CELL), BACKDROP + (255,))
    over = Image.new('RGBA', (W * CELL, H * CELL), (0, 0, 0, 0))
    coll = [[0] * W for _ in range(H)]

    def h_at(x, z):
        return heights[z][x] if 0 <= z < len(heights) and 0 <= x < len(heights[z]) else 0

    def is_water(x, z):
        try:
            w = water[z][x]
        except IndexError:
            return False
        return w != '.' and num(w, -1e9) > h_at(x, z)

    for z in range(H):
        row = terrain[z] if z < len(terrain) else ''
        for x in range(W):
            key = row[x] if x < len(row) else '.'
            px, py = x * CELL, z * CELL
            pic = cell_for(key)
            if blocks.get(key):
                coll[z][x] |= SOLID
            h = h_at(x, z)
            north = h_at(x, z - 1) if z > 0 else h
            if is_water(x, z):
                pic = water_tile
                coll[z][x] |= SOLID
            elif north - h >= 2:
                pic = cliff  # a wall facing the camera
                coll[z][x] |= SOLID
            ground.alpha_composite(pic, (px, py))
            # Ledge lines where this cell drops to a lower neighbour on the sides or below.
            d = ImageDraw.Draw(ground)
            edge = (36, 44, 28, 255)
            if x > 0 and h - h_at(x - 1, z) >= 2:
                d.line([(px, py), (px, py + CELL - 1)], fill=edge)
            if x < W - 1 and h - h_at(x + 1, z) >= 2:
                d.line([(px + CELL - 1, py), (px + CELL - 1, py + CELL - 1)], fill=edge)
            if z < H - 1 and h - h_at(x, z + 1) >= 2:
                d.line([(px, py + CELL - 1), (px + CELL - 1, py + CELL - 1)], fill=edge)

    skipped = Counter()
    for p in mp.get('props', []):
        t = p.get('type', '')
        x, z = int(math.floor(p.get('x', 0))), int(math.floor(p.get('z', 0)))
        if not (0 <= x < W and 0 <= z < H):
            continue
        px, py = x * CELL, z * CELL
        if t.startswith('bridge'):
            ground.alpha_composite(planks_v if t.endswith('_v') else planks_h, (px, py))
            coll[z][x] = BRIDGE
        elif 'pine' in t or 'tree' in t:
            ground.alpha_composite(tree_low, (px, py))
            if z > 0:
                over.alpha_composite(tree_high, (px, py - CELL))
            coll[z][x] |= SOLID
        elif 'tuft' in t or 'grass' in t:
            if tuft and not coll[z][x] & SOLID:
                ground.alpha_composite(tuft, (px, py))
        elif t == 'sign':
            ground.alpha_composite(sign, (px, py))
            coll[z][x] |= SOLID
        elif 'crystal' in t:
            ground.alpha_composite(crystal, (px, py))
            coll[z][x] |= SOLID
        else:
            skipped[t] += 1
    if skipped:
        print('  props not drawn yet:', dict(skipped))

    hgrid = [[int(max(-128, min(127, round(h_at(x, z))))) for x in range(W)] for z in range(H)]
    return ground, over, coll, hgrid


# ----------------------------------------------------------------------------- GBA Studio maps

# Must match src/gba/types.ts (TILE_TYPES) and src/gba/autotile.ts.
TYPE_SIZE = {'ground': (1, 1), 'decor': (1, 1), 'path': (5, 3), 'water': (5, 3), 'cliff': (5, 3), 'ledge': (5, 3),
             'stairs': (1, 1), 'ladder': (1, 1), 'tallgrass': (2, 1), 'object': (2, 2), 'door': (1, 1)}
PIECE_CELL = {'tl': (0, 0), 't': (1, 0), 'tr': (2, 0), 'itl': (3, 0), 'itr': (4, 0),
              'l': (0, 1), 'c': (1, 1), 'r': (2, 1), 'ibl': (3, 1), 'ibr': (4, 1),
              'bl': (0, 2), 'b': (1, 2), 'br': (2, 2)}


def piece_at(inside, x, y):
    if not inside(x, y):
        return None
    n, s, w, e = inside(x, y - 1), inside(x, y + 1), inside(x - 1, y), inside(x + 1, y)
    if not n and not w: return 'tl'
    if not n and not e: return 'tr'
    if not s and not w: return 'bl'
    if not s and not e: return 'br'
    if not n: return 't'
    if not s: return 'b'
    if not w: return 'l'
    if not e: return 'r'
    if not inside(x - 1, y - 1): return 'itl'
    if not inside(x + 1, y - 1): return 'itr'
    if not inside(x - 1, y + 1): return 'ibl'
    if not inside(x + 1, y + 1): return 'ibr'
    return 'c'


# What each 8x8 quarter (TL, TR, BL, BR) of a piece normally shows (match src/gba/autotile.ts).
CANON = {'tl': ('tl', 't', 'l', 'c'), 't': ('t', 't', 'c', 'c'), 'tr': ('t', 'tr', 'c', 'r'),
         'l': ('l', 'c', 'l', 'c'), 'c': ('c', 'c', 'c', 'c'), 'r': ('c', 'r', 'c', 'r'),
         'bl': ('l', 'c', 'bl', 'b'), 'b': ('c', 'c', 'b', 'b'), 'br': ('c', 'r', 'b', 'br'),
         'itl': ('itl', 'c', 'c', 'c'), 'itr': ('c', 'itr', 'c', 'c'), 'ibl': ('c', 'c', 'ibl', 'c'),
         'ibr': ('c', 'c', 'c', 'ibr')}


def quarters(inside, x, y):
    """For each quarter TL, TR, BL, BR, the piece whose same quarter is drawn there (1-wide strips work)."""
    full = piece_at(inside, x, y)
    if full is None:
        return None
    n, s, w, e = inside(x, y - 1), inside(x, y + 1), inside(x - 1, y), inside(x + 1, y)

    def q(v, h, d, corner, vedge, hedge, inner):
        return corner if not v and not h else vedge if not v else hedge if not h else inner if not d else 'c'
    want = (q(n, w, inside(x - 1, y - 1), 'tl', 't', 'l', 'itl'), q(n, e, inside(x + 1, y - 1), 'tr', 't', 'r', 'itr'),
            q(s, w, inside(x - 1, y + 1), 'bl', 'b', 'l', 'ibl'), q(s, e, inside(x + 1, y + 1), 'br', 'b', 'r', 'ibr'))
    return [full if p == CANON[full][i] else p for i, p in enumerate(want)]


def compose(img, qs):
    """One 16x16 cell built from four 8x8 quarters."""
    out = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0))
    h = CELL // 2
    for i, p in enumerate(qs):
        cx, cy = PIECE_CELL[p]
        qx, qy = i & 1, i >> 1
        out.paste(img.crop((cx * CELL + qx * h, cy * CELL + qy * h, cx * CELL + qx * h + h, cy * CELL + qy * h + h)), (qx * h, qy * h))
    return out


def build_gba_map(gba, mp):
    W, H = mp['width'], mp['height']
    defs = {t['id']: t for t in gba.get('tiles', [])}
    names = mp.get('tiles', [])
    images = {}

    def tile(i):
        """Tile definition and picture for a grid value (index + 1)."""
        if not i or i > len(names):
            return None, None
        tid = names[i - 1]
        t = defs.get(tid)
        if not t:
            return None, None
        if tid not in images:
            images[tid] = project_image(t['image'])
        return t, images[tid]

    def cell(img, cx, cy):
        return img.crop((cx * CELL, cy * CELL, cx * CELL + CELL, cy * CELL + CELL))

    def grid(name, default=0):
        g = mp.get(name) or []
        return lambda x, y: (g[y][x] if 0 <= y < len(g) and 0 <= x < len(g[y]) else default)

    ground_g, terrain_g, cliff_g, level_g = grid('ground'), grid('terrain'), grid('cliff'), grid('level')
    ground = Image.new('RGBA', (W * CELL, H * CELL), BACKDROP + (255,))
    over = Image.new('RGBA', (W * CELL, H * CELL), (0, 0, 0, 0))
    coll = [[0] * W for _ in range(H)]
    inb = lambda x, y: 0 <= x < W and 0 <= y < H

    # 1. ground
    for y in range(H):
        for x in range(W):
            t, img = tile(ground_g(x, y))
            if img is not None:
                ground.alpha_composite(cell(img, 0, 0), (x * CELL, y * CELL))

    # 2. paths and water (13-piece sets, corners picked from the neighbours)
    for y in range(H):
        for x in range(W):
            v = terrain_g(x, y)
            t, img = tile(v)
            if img is None:
                continue
            qs = quarters(lambda a, b: inb(a, b) and terrain_g(a, b) == v, x, y)
            ground.alpha_composite(compose(img, qs), (x * CELL, y * CELL))
            if t['type'] == 'water':
                coll[y][x] |= SOLID | WATER

    # 3. cliffs: tier k is every cell at level k or higher; its ring is drawn and blocks
    top = max((level_g(x, y) for y in range(H) for x in range(W)), default=0)
    for k in range(1, top + 1):
        inside = lambda a, b: inb(a, b) and cliff_g(a, b) and level_g(a, b) >= k
        for y in range(H):
            for x in range(W):
                qs = quarters(inside, x, y)
                if qs is None or all(p == 'c' for p in qs):
                    continue
                t, img = tile(cliff_g(x, y))
                if img is not None:
                    ground.alpha_composite(compose(img, qs), (x * CELL, y * CELL))
                coll[y][x] |= SOLID

    # 4. objects
    for o in mp.get('objects', []):
        t, img = tile(o.get('t', 0))
        if img is None:
            continue
        x0, y0, ty = o.get('x', 0), o.get('y', 0), t['type']
        if ty == 'object':
            w, h = t.get('w', 2), t.get('h', 2)
            for j in range(h):
                for i in range(w):
                    x, y = x0 + i, y0 + j
                    if not inb(x, y):
                        continue
                    piece = cell(img, i, j)
                    if j == h - 1:
                        ground.alpha_composite(piece, (x * CELL, y * CELL))
                        coll[y][x] |= SOLID
                    else:
                        over.alpha_composite(piece, (x * CELL, y * CELL))
            continue
        if not inb(x0, y0):
            continue
        px, py = x0 * CELL, y0 * CELL
        if ty == 'ledge':
            p = o.get('p', 1)
            if img.height <= CELL:
                # old 5-piece ledges (south left / middle / right, east, west), from before update 4
                p = max(0, min(4, p))
                cx, cy, d = p, 0, (LEDGE_S if p < 3 else LEDGE_E if p == 3 else LEDGE_W)
            else:
                # 0-2 south, 3-5 east, 6-8 west, 9-11 singles, 12-14 extras (src/gba/types.ts ledgeCell / ledgeDir)
                p = max(0, min(14, p))
                cx, cy = (p, 0) if p < 3 else (3, p - 3) if p < 6 else (4, p - 6) if p < 9 else (p - 9, 1) if p < 12 else (p - 12, 2)
                d = LEDGE_S if p < 3 else LEDGE_E if p < 6 else LEDGE_W if p < 9 else (LEDGE_S, LEDGE_E, LEDGE_W)[(p - 9) % 3]
            ground.alpha_composite(cell(img, cx, cy), (px, py))
            coll[y0][x0] |= SOLID | d
        elif ty == 'tallgrass':
            ground.alpha_composite(cell(img, 0, 0), (px, py))
            coll[y0][x0] |= GRASS
        elif ty in ('stairs', 'ladder'):
            ground.alpha_composite(cell(img, 0, 0), (px, py))
            coll[y0][x0] &= ~SOLID
        elif ty == 'decor' and t.get('pass') == '*':
            over.alpha_composite(cell(img, 0, 0), (px, py))
        else:
            ground.alpha_composite(cell(img, 0, 0), (px, py))
            if ty == 'decor' and t.get('pass', 'X') == 'X':
                coll[y0][x0] |= SOLID

    # 5. passability overrides (RPG Maker style)
    for y, row in enumerate(mp.get('pass', [])[:H]):
        for x, ch in enumerate(row[:W]):
            if ch == 'O':
                coll[y][x] &= ~SOLID
            elif ch == 'X':
                coll[y][x] |= SOLID

    hgrid = [[0] * W for _ in range(H)]
    return ground, over, coll, hgrid


# ----------------------------------------------------------------------------- palettes

def nearest(c, pal):
    return min(range(len(pal)), key=lambda i: (pal[i][0] - c[0]) ** 2 + (pal[i][1] - c[1]) ** 2 + (pal[i][2] - c[2]) ** 2)


def to_banked(images, max_banks=15):
    """Reduce colors so every 8x8 block fits a 15-color bank; returns indexed images + one shared palette."""
    opaque = [(r, g, b) for im in images for (r, g, b, a) in im.getdata() if a]
    sample = Image.new('RGB', (len(opaque), 1))
    sample.putdata(opaque)
    unique = sorted(set(opaque))
    for k in (None, 96, 80, 64, 48, 40, 32, 24):
        if k is None:
            # First try the exact colors (tiles painted in GBA Studio already fit the GBA).
            if len(unique) > 240:
                continue
            gpal = unique
            k = len(unique)
        else:
            q = sample.quantize(colors=k, method=Image.Quantize.MEDIANCUT)
            qp = q.getpalette()[:k * 3]
            gpal = [tuple(qp[i:i + 3]) for i in range(0, len(qp), 3)]
        cache = {}

        def gi(c):
            if c not in cache:
                cache[c] = nearest(c, gpal)
            return cache[c]

        # Global color index per pixel (-1 = transparent)
        layers = []
        for im in images:
            w, h = im.size
            data = [gi((r, g, b)) if a else -1 for (r, g, b, a) in im.getdata()]
            layers.append((w, h, data))

        # Color sets per 8x8 block, trimmed to 15 if needed
        blocks = []
        for li, (w, h, data) in enumerate(layers):
            for by in range(0, h, 8):
                for bx in range(0, w, 8):
                    idx = [data[(by + y) * w + bx + x] for y in range(8) for x in range(8)]
                    cnt = Counter(i for i in idx if i >= 0)
                    if not cnt:
                        continue
                    keep = [c for c, _ in cnt.most_common(15)]
                    if len(cnt) > 15:
                        kp = [gpal[c] for c in keep]
                        remap = {c: (c if c in keep else keep[nearest(gpal[c], kp)]) for c in cnt}
                        for y in range(8):
                            for x in range(8):
                                o = (by + y) * w + bx + x
                                if data[o] >= 0:
                                    data[o] = remap[data[o]]
                    blocks.append((li, bx, by, frozenset(keep)))

        # Pack color sets into banks (biggest first, best fit)
        banks = []
        order = sorted({b[3] for b in blocks}, key=len, reverse=True)
        bank_of = {}
        for s in order:
            best, best_add = None, 99
            for i, bank in enumerate(banks):
                add = len(s - bank)
                if len(bank) + add <= 15 and add < best_add:
                    best, best_add = i, add
            if best is None:
                banks.append(set(s))
                best = len(banks) - 1
            else:
                banks[best] |= s
            bank_of[s] = best
        # Second pass: a set may now fit an earlier bank fully
        for s in order:
            for i, bank in enumerate(banks):
                if s <= bank:
                    bank_of[s] = i
                    break
        if len(banks) > max_banks:
            print(f'  {k} colors need {len(banks)} palettes, trying fewer colors')
            continue

        bank_lists = [sorted(b) for b in banks]
        palette = [BACKDROP]
        for i in range(16 * len(banks)):
            b, slot = divmod(i, 16)
            if slot == 0:
                if i:
                    palette.append(BACKDROP)
                continue
            lst = bank_lists[b]
            palette.append(gpal[lst[slot - 1]] if slot - 1 < len(lst) else (0, 0, 0))
        palette = palette[:16 * len(banks)]

        outs = []
        for li, (w, h, data) in enumerate(layers):
            out = [0] * (w * h)
            outs.append(out)
        for li, bx, by, s in blocks:
            w, h, data = layers[li]
            b = bank_of[s]
            pos = {c: j for j, c in enumerate(bank_lists[b])}
            for y in range(8):
                for x in range(8):
                    o = (by + y) * w + bx + x
                    if data[o] >= 0:
                        outs[li][o] = b * 16 + 1 + pos[data[o]]
        print(f'  background: {k} colors in {len(banks)} palettes')
        imgs = []
        for li, (w, h, _) in enumerate(layers):
            im = Image.new('P', (w, h))
            im.putdata(outs[li])
            imgs.append(im)
        return imgs, palette
    raise SystemExit('Too many colors for the GBA even after reducing. Use simpler tiles.')


def put_palette(im, palette):
    flat = []
    for c in palette:
        flat += list(c)
    flat += [0] * (768 - len(flat))
    im.putpalette(flat)


def pad_to(im, w, h, fill):
    out = Image.new(im.mode, (w, h), fill)
    out.paste(im, (0, 0))
    return out


# ----------------------------------------------------------------------------- sprite

DIR_ORDER = ['down', 'up', 'left']   # rows in the sheet; right is the left row mirrored in game
HERO_COLS = 6                        # walk: stand, step, step; run: stand, step, step
HERO_W, HERO_H = 16, 32
MANNEQUIN = ['#303038', '#d0d0d8', '#a0a0b0', '#707080', '#788090', '#d8e0e8', '#f8a040', '#f8e078',
             '#f8c8a0', '#d09070', '#604030', '#4878c8', '#305090', '#585870', '#f8f8f8']


def hex_rgb(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def player_sprite():
    """The overworld sheet and palette GBA Studio marked as the player (or the plain mannequin)."""
    try:
        gba = load_json(os.path.join(DATA, 'gba.json'))
    except (OSError, ValueError):
        gba = {}
    sprite = next((s for s in gba.get('sprites', []) if s.get('id') == gba.get('player') and s.get('kind') == 'overworld'), None)
    if sprite:
        pal = next((p for p in gba.get('palettes', []) if p.get('id') == sprite.get('palette')), None)
        img = project_image(sprite['image'])
        if img is not None and pal:
            return img, [hex_rgb(c) for c in pal['colors']], sprite.get('name', 'player')
    base = project_image('gba/bases/overworld_base.png')
    return base, [hex_rgb(c) for c in MANNEQUIN], 'mannequin'


def build_hero():
    sheet, pal, name = player_sprite()
    print(f'  player sprite: {name}')
    return build_sheet(sheet, pal)


def build_sheet(sheet, pal):
    """An overworld sheet (16x32 frames, rows down / up / left, 6 columns) as a Butano sprite strip."""
    frames = []
    for row in range(len(DIR_ORDER)):
        for col in range(HERO_COLS):
            frames.append(sheet.crop((col * HERO_W, row * HERO_H, (col + 1) * HERO_W, (row + 1) * HERO_H)))
    strip = Image.new('RGBA', (HERO_W, HERO_H * len(frames)), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        strip.alpha_composite(fr, (0, i * HERO_H))
    pal = (pal + [(0, 0, 0)] * 15)[:15]
    cache = {}
    data = []
    for (r, g, b, a) in strip.getdata():
        if a < 128:
            data.append(0)
            continue
        c = (r, g, b)
        if c not in cache:
            cache[c] = 1 + nearest(c, pal)
        data.append(cache[c])
    out = Image.new('P', strip.size)
    out.putdata(data)
    put_palette(out, [(255, 0, 255)] + pal)
    return out


# ----------------------------------------------------------------------------- main

def c_array(name, ctype, values, per_line=32):
    lines = []
    for i in range(0, len(values), per_line):
        lines.append('    ' + ', '.join(str(v) for v in values[i:i + per_line]) + ',')
    return f'constexpr {ctype} {name}[] = {{\n' + '\n'.join(lines) + '\n};\n'


def find_start(cfg, coll, W, H):
    sx, sz = cfg.get('start', [W // 2, H // 2])
    best = None
    for z in range(H):
        for x in range(W):
            if coll[z][x] & SOLID:
                continue
            d = (x - sx) ** 2 + (z - sz) ** 2
            if best is None or d < best[0]:
                best = (d, x, z)
    return (best[1], best[2]) if best else (0, 0)


def write_json(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, indent=4)
        f.write('\n')


TEXT_LINE = 30   # characters per text-box line (matches src/gba/types.ts)
BUBBLE_LINE = 20  # characters per word-bubble line (matches BUBBLE_LINE in src/gba/types.ts)
DIRS = {'down': 0, 'up': 1, 'left': 2, 'right': 3}


def text_pages(text, TEXT_LINE=TEXT_LINE):
    """Word-wrapped pages of up to two lines (a blank line starts a new page), like textPages() in the editor."""
    pages = []
    for para in text.replace('\r', '').split('\n\n'):
        lines = []
        for raw in para.split('\n'):
            line = ''
            for word in raw.split():
                while len(word) > TEXT_LINE:
                    if line:
                        lines.append(line)
                        line = ''
                    lines.append(word[:TEXT_LINE])
                    word = word[TEXT_LINE:]
                if not word:
                    continue
                if not line:
                    line = word
                elif len(line) + 1 + len(word) <= TEXT_LINE:
                    line += ' ' + word
                else:
                    lines.append(line)
                    line = word
            if line:
                lines.append(line)
        for k in range(0, len(lines), 2):
            pages.append(lines[k:k + 2])
    return pages or [['']]


def c_string(text):
    """A C string literal; the GBA font only has plain ASCII."""
    text = ''.join(ch for ch in text if 32 <= ord(ch) < 127 or ch in '\n\f')
    return '"' + text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\f', '\\f') + '"'


BOX_PAL = [(255, 0, 255), (248, 248, 248), (48, 80, 144), (112, 144, 200)] + [(0, 0, 0)] * 12


def panel(im, x0, y0, x1, y1):
    """A white panel with a blue frame and rounded corners (colors of BOX_PAL)."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            edge = min(x - x0, x1 - x, y - y0, y1 - y)
            corner = min(x - x0, x1 - x) + min(y - y0, y1 - y)
            if corner < 2:
                continue
            im.putpixel((x, y), 2 if edge < 2 or corner < 4 else 3 if edge < 3 else 1)


def textbox_bg():
    """The text box at the bottom of the screen (a 256x256 bg, centred): screen (4, 112)-(236, 156)."""
    im = Image.new('P', (256, 256), 0)
    panel(im, 12, 160, 243, 203)
    put_palette(im, BOX_PAL)
    return im


def bubble_bg():
    """A 152x40 word bubble in the top-left corner of a 256x256 bg (the runtime moves it over the speaker)."""
    im = Image.new('P', (256, 256), 0)
    panel(im, 0, 0, 151, 39)
    put_palette(im, BOX_PAL)
    return im


def choice_bg(n):
    """A box for n choices (16 pixels a line), 80 wide, in the top-left corner of a 256x256 bg."""
    im = Image.new('P', (256, 256), 0)
    panel(im, 0, 0, 79, 16 * n + 9)
    put_palette(im, BOX_PAL)
    return im


def bubble_tail():
    """The bubble's tail: a 16x16 sprite, its top rows cover the bubble's frame, the tip points down."""
    pal = BOX_PAL
    im = Image.new('P', (16, 16), 0)
    for y in range(9):
        half = 5 - (y * 5) // 8 if y > 2 else 5
        for x in range(8 - half, 8 + half):
            border = x in (8 - half, 8 + half - 1) and y > 2
            im.putpixel((x, y), 2 if border or y == 8 else 1)
    put_palette(im, pal)
    return im


def text_palette():
    """Dark text with a light shadow for the white box (the font draws with colors 14 and 12)."""
    pal = [(255, 0, 255)] + [(0, 0, 0)] * 15
    pal[14] = (48, 48, 56)
    pal[12] = (200, 200, 208)
    pal[13] = (120, 120, 136)
    im = Image.new('P', (16, 16), 0)
    put_palette(im, pal)
    return im


def clean_outputs():
    os.makedirs(GFX, exist_ok=True)
    os.makedirs(INC, exist_ok=True)
    for f in os.listdir(GFX):
        if f.split('.')[0].startswith(('world_', 'hero', 'npc_', 'obj_', 'textbox', 'text_palette', 'bubble', 'box_palette', 'choice_')):
            os.remove(os.path.join(GFX, f))


def draw_props(sm, ground, over, coll):
    """
    Saturn props on a GBA map, drawn into the background: the bottom row of each picture behind the player, the
    rest over (tree tops). Pictures and blocked cells come from the editor (public/gba/props, the map's propCells),
    written when the map is saved.
    """
    W, H = sm['width'], sm['height']
    missing = set()
    for p in sorted(sm.get('props', []), key=lambda q: q.get('z', 0)):
        safe = ''.join(ch if ch.isalnum() or ch in '_.-' else '_' for ch in p.get('type', ''))
        path = os.path.join(PUBLIC, 'gba', 'props', safe + '.png')
        if not os.path.exists(path):
            missing.add(p.get('type'))
            continue
        img = hard_alpha(Image.open(path).convert('RGBA'))
        sc = float(p.get('s', 1) or 1)
        if sc != 1:
            img = img.resize((max(1, round(img.width * sc)), max(1, round(img.height * sc))), Image.NEAREST)
        left = int(round(float(p.get('x', 0)) * CELL - img.width / 2))
        foot = int(round(float(p.get('z', 0)) * CELL))
        top = foot - img.height
        cut = max(0, min(img.height, foot - CELL - top))   # rows above the foot cell go over the player
        if cut:
            paste_clipped(over, img.crop((0, 0, img.width, cut)), left, top)
        if cut < img.height:
            paste_clipped(ground, img.crop((0, cut, img.width, img.height)), left, top + cut)
    for x, z in (sm.get('gba') or {}).get('propCells', []):
        if 0 <= x < W and 0 <= z < H and (sm['gba'].get('pass') or [''] * H)[z][x:x + 1] != 'O':
            coll[z][x] |= SOLID
    if missing:
        print(f'  props without a GBA picture (open and save the map in the editor): {", ".join(sorted(missing))}')


def paste_clipped(dst, src, x, y):
    """alpha_composite that allows the picture to hang off the map's edges."""
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(src.width, dst.width - x), min(src.height, dst.height - y)
    if sx >= ex or sy >= ey:
        return
    part = src.crop((sx, sy, ex, ey))
    dst.alpha_composite(part, (x + sx, y + sy))


def main():
    cfg = load_json(os.path.join(DATA, 'mimas.json'))
    try:
        gba = load_json(os.path.join(DATA, 'gba.json'))
    except (OSError, ValueError):
        gba = {}
    # The ROM plays the GBA Studio maps when one is set as the start map (all of them go in, so doors work);
    # otherwise the Saturn map in mimas.json.
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        db = load_json(os.path.join(DATA, 'database.json'))
    except (OSError, ValueError):
        db = {}
    # The ROM plays the GBA maps (maps painted with GBA Studio tiles: a "gba" block in public/data/maps/<id>.json),
    # starting on the game's start map (Database: startMap / start). Without GBA maps: the Saturn map in mimas.json.
    gba_maps = {}
    maps_dir = os.path.join(DATA, 'maps')
    for f in sorted(os.listdir(maps_dir)) if os.path.isdir(maps_dir) else []:
        if f.endswith('.json'):
            try:
                mp = load_json(os.path.join(maps_dir, f))
            except (OSError, ValueError):
                continue
            if isinstance(mp.get('gba'), dict):
                gba_maps[f[:-5]] = mp
    start_id = arg if arg in gba_maps else (db.get('startMap') if db.get('startMap') in gba_maps else next(iter(gba_maps), None))
    if arg and arg not in gba_maps:
        start_id = None
    maps = []   # dicts: id, name, W, H, ground, over, coll, hgrid, start, dir, events
    if start_id:
        for mid in [start_id] + [m for m in gba_maps if m != start_id]:
            sm = gba_maps[mid]
            W, H = sm['width'], sm['height']
            mp = dict(sm['gba'], width=W, height=H, name=sm.get('name', mid))
            print(f'Exporting GBA map "{mp["name"]}" ({W} x {H})')
            ground, over, coll, hgrid = build_gba_map(gba, mp)
            draw_props(sm, ground, over, coll)
            start = None
            if mid == db.get('startMap') and db.get('start'):
                start = [int(db['start'].get('x', 0)), int(db['start'].get('z', 0))]
            maps.append({'id': mid, 'name': mp['name'], 'W': W, 'H': H, 'ground': ground, 'over': over,
                         'coll': coll, 'hgrid': hgrid, 'start': start, 'dir': (db.get('start') or {}).get('dir', 'down'),
                         'events': [], 'saturn': sm})
    else:
        map_id = arg or cfg['map']
        mp = load_json(os.path.join(DATA, 'maps', map_id + '.json'))
        assets = load_json(os.path.join(DATA, 'assets.json'))
        W, H = mp['width'], mp['height']
        print(f'Exporting "{mp.get("name", map_id)}" ({W} x {H})')
        ground, over, coll, hgrid = build_map(cfg, mp, assets)
        maps.append({'id': map_id, 'name': mp.get('name', map_id), 'W': W, 'H': H, 'ground': ground, 'over': over,
                     'coll': coll, 'hgrid': hgrid, 'start': cfg.get('start'), 'dir': cfg.get('dir', 'down'), 'events': []})

    index = {m['id']: i for i, m in enumerate(maps)}
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    layers = []
    for i, m in enumerate(maps):
        W, H = m['W'], m['H']
        m['bw'] = max(256, math.ceil(W * CELL / 256) * 256)
        m['bh'] = max(256, math.ceil(H * CELL / 256) * 256)
        g = pad_to(m['ground'], m['bw'], m['bh'], BACKDROP + (255,))
        o = pad_to(m['over'], m['bw'], m['bh'], (0, 0, 0, 0))
        preview = g.copy()
        preview.alpha_composite(o)
        preview = preview.crop((0, 0, W * CELL, H * CELL))
        preview.save(os.path.join(ROOT, 'build', 'preview.png' if i == 0 else f'preview_{m["id"]}.png'))
        layers += [g, o]

    indexed, palette = to_banked(layers)
    clean_outputs()
    for i in range(len(maps)):
        for im, name in ((indexed[2 * i], f'world_ground_{i}'), (indexed[2 * i + 1], f'world_over_{i}')):
            put_palette(im, palette)
            im.save(os.path.join(GFX, name + '.bmp'))
            write_json(os.path.join(GFX, name + '.json'),
                       {'type': 'regular_bg', 'bpp_mode': 'bpp_4_manual', 'palette_item': 'world_palette'})
    pal_img = Image.new('P', (16, 16))
    put_palette(pal_img, palette)
    pal_img.save(os.path.join(GFX, 'world_palette.bmp'))
    write_json(os.path.join(GFX, 'world_palette.json'),
               {'type': 'bg_palette', 'bpp_mode': 'bpp_4', 'colors_count': len(palette)})
    # the text box and the word bubble share one palette (the world can use the other 15)
    box_pal = Image.new('P', (16, 16))
    put_palette(box_pal, BOX_PAL)
    box_pal.save(os.path.join(GFX, 'box_palette.bmp'))
    write_json(os.path.join(GFX, 'box_palette.json'), {'type': 'bg_palette', 'bpp_mode': 'bpp_4'})
    for name, im in (('textbox', textbox_bg()), ('bubble', bubble_bg()), ('choice_2', choice_bg(2)), ('choice_3', choice_bg(3)), ('choice_4', choice_bg(4))):
        im.save(os.path.join(GFX, name + '.bmp'))
        write_json(os.path.join(GFX, name + '.json'), {'type': 'regular_bg', 'bpp_mode': 'bpp_4_manual', 'palette_item': 'box_palette'})
    bubble_tail().save(os.path.join(GFX, 'bubble_tail.bmp'))
    write_json(os.path.join(GFX, 'bubble_tail.json'), {'type': 'sprite', 'height': 16})
    text_palette().save(os.path.join(GFX, 'text_palette.bmp'))
    write_json(os.path.join(GFX, 'text_palette.json'), {'type': 'sprite_palette', 'bpp_mode': 'bpp_4'})

    hero = build_hero()
    hero.save(os.path.join(GFX, 'hero.bmp'))
    write_json(os.path.join(GFX, 'hero.json'), {'type': 'sprite', 'height': HERO_H})

    # People: one sprite item per GBA Studio overworld sprite an event page shows
    sprites = {s['id']: s for s in gba.get('sprites', [])}
    palettes = {p['id']: p for p in gba.get('palettes', [])}
    npc_ids = []
    for m in maps:
        for e in (m.get('saturn') or {}).get('events', []):
            for pg in e.get('pages', []):
                sid = pg.get('gbaSprite')
                if sid and sid in sprites and sprites[sid].get('kind') == 'overworld' and sid not in npc_ids:
                    img = project_image(sprites[sid]['image'])
                    pal = palettes.get(sprites[sid].get('palette'))
                    if img is None or not pal:
                        continue
                    k = len(npc_ids)
                    npc_ids.append(sid)
                    build_sheet(img, [hex_rgb(c) for c in pal['colors']]).save(os.path.join(GFX, f'npc_{k}.bmp'))
                    write_json(os.path.join(GFX, f'npc_{k}.json'), {'type': 'sprite', 'height': HERO_H})
    if npc_ids:
        print(f'  people sprites: {", ".join(npc_ids)}')

    # Objects events show (a chest, a sign): one-frame sprites from the editor's baked prop pictures.
    obj_ids, obj_heights = [], []
    for m in maps:
        for e in (m.get('saturn') or {}).get('events', []):
            for pg in e.get('pages', []):
                t = pg.get('sprite')
                if not t or pg.get('gbaSprite') or t in obj_ids:
                    continue
                safe = ''.join(ch if ch.isalnum() or ch in '_.-' else '_' for ch in t)
                path = os.path.join(PUBLIC, 'gba', 'props', safe + '.png')
                if not os.path.exists(path):
                    continue
                im = hard_alpha(Image.open(path).convert('RGBA'))
                size = next((n for n in (16, 32, 64) if im.width <= n and im.height <= n), 64)
                if im.width > 64 or im.height > 64:
                    im.thumbnail((64, 64), Image.NEAREST)
                pad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
                pad.alpha_composite(im, ((size - im.width) // 2, size - im.height))
                k = len(obj_ids)
                obj_ids.append(t)
                obj_heights.append(size)
                # 15 colours at most (the sprite's palette; 0 is see-through)
                opaque = [(r, g, b) for (r, g, b, al) in pad.getdata() if al >= 128]
                cols = sorted(set(opaque))
                if len(cols) > 15:
                    sample = Image.new('RGB', (len(opaque), 1))
                    sample.putdata(opaque)
                    qp = sample.quantize(colors=15, method=Image.Quantize.MEDIANCUT).getpalette()[:45]
                    cols = [tuple(qp[i:i + 3]) for i in range(0, len(qp), 3)]
                cols = cols or [(0, 0, 0)]
                data = [0 if al < 128 else 1 + nearest((r, g, b), cols) for (r, g, b, al) in pad.getdata()]
                out_im = Image.new('P', pad.size)
                out_im.putdata(data)
                put_palette(out_im, [(255, 0, 255)] + (cols + [(0, 0, 0)] * 15)[:15])
                out_im.save(os.path.join(GFX, f'obj_{k}.bmp'))
                write_json(os.path.join(GFX, f'obj_{k}.json'), {'type': 'sprite', 'height': size})
    if obj_ids:
        print(f'  event objects: {", ".join(obj_ids)}')

    def sprite_of(pg):
        if pg.get('sprite') in obj_ids and not pg.get('gbaSprite'):
            return -10 - obj_ids.index(pg['sprite'])   # an object: obj_sprites[-10 - n]
        if pg.get('gbaSprite') in npc_ids:
            return npc_ids.index(pg['gbaSprite'])
        if pg.get('gbaSprite') or pg.get('character'):
            return -2   # the player's sprite stands in (a Saturn character, or a GBA sprite that's missing)
        return -1

    # Saturn's events, compiled (tools/gba_events.py)
    comp = Compiler(db, index, lambda text, bubble: text_pages(text, BUBBLE_LINE if bubble else TEXT_LINE))
    compiled = []
    for m in maps:
        compiled.append(comp.map_events(m['id'], m['saturn'], sprite_of) if m.get('saturn') else ([0], [], []))
    for wmsg in comp.warnings:
        print('  GBA check: ' + wmsg)

    # The header: every map, its collision, heights and events
    out = []
    w = out.append
    w('// Generated by tools/export.py from public/data - do not edit.\n')
    w('#ifndef MIMAS_MAP_H\n#define MIMAS_MAP_H\n\n#include <cstdint>\n#include "bn_regular_bg_item.h"\n#include "bn_sprite_item.h"\n')
    for i in range(len(maps)):
        w(f'#include "bn_regular_bg_items_world_ground_{i}.h"\n#include "bn_regular_bg_items_world_over_{i}.h"\n')
    for k in range(len(npc_ids)):
        w(f'#include "bn_sprite_items_npc_{k}.h"\n')
    for k in range(len(obj_ids)):
        w(f'#include "bn_sprite_items_obj_{k}.h"\n')
    w('\nnamespace mimas\n{\n')
    w(f'constexpr uint8_t solid = {SOLID};\nconstexpr uint8_t bridge = {BRIDGE};\n')
    w(f'constexpr uint8_t ledge_s = {LEDGE_S};\nconstexpr uint8_t ledge_e = {LEDGE_E};\nconstexpr uint8_t ledge_w = {LEDGE_W};\n')
    w(f'constexpr uint8_t water = {WATER};\nconstexpr uint8_t grass = {GRASS};\n')
    w(f'constexpr int hero_frames = {HERO_COLS};\n\n')
    w('// Event scripts (tools/gba_events.py has the ops). Text is pre-wrapped: lines split by \\n, pages by \\f.\n')
    w('enum op : int16_t { OP_END, OP_TEXT, OP_CHOICE, OP_JUMP, OP_IF, OP_SWITCH, OP_VAR, OP_SELF, OP_GIVE, OP_TAKE, OP_GOLD, '
      'OP_TRANSFER, OP_WAIT, OP_FADEOUT, OP_FADEIN, OP_BATTLE };\n')
    w('struct condition { uint8_t type; uint8_t op; int16_t a; int16_t b; };\n')
    w('// sprite: -1 none, -2 the player\'s sprite (a stand-in), k = npc_sprites[k]. trigger: 0 action, 1 touch, 2 autorun, 3 none.\n')
    w('struct page { int16_t cond; int8_t sprite; uint8_t dir; uint8_t trigger; bool solid; bool face; int16_t code; };\n')
    w('struct event { uint8_t x; uint8_t y; uint8_t w; uint8_t h; int16_t first_page; uint8_t page_count; int16_t self_id; };\n\n')
    w('struct map_info\n{\n    int width; int height; int bg_width; int bg_height; const char* name;\n'
      '    const uint8_t* collision; const int8_t* heights; const event* events; int event_count; const page* pages; const int16_t* code;\n'
      '    const bn::regular_bg_item* ground; const bn::regular_bg_item* over;\n};\n\n')
    w('constexpr condition conditions[] = {\n    ' + ',\n    '.join(f'{{ {a}, {b}, {c}, {d} }}' for a, b, c, d in comp.conds) + '\n};\n')
    w('constexpr const char* strings[] = {\n    ' + (',\n    '.join(c_string(x) for x in comp.strings) or '""') + '\n};\n\n')
    infos = []
    for i, m in enumerate(maps):
        W, H = m['W'], m['H']
        code, pages, events = compiled[i]
        w(c_array(f'map{i}_collision', 'uint8_t', [m['coll'][y][x] for y in range(H) for x in range(W)], W))
        w(c_array(f'map{i}_heights', 'int8_t', [m['hgrid'][y][x] for y in range(H) for x in range(W)], W))
        w(c_array(f'map{i}_code', 'int16_t', code, 24))
        if pages:
            w(f'constexpr page map{i}_pages[] = {{\n    ' + ',\n    '.join(
                f'{{ {c}, {sp}, {d}, {t}, {"true" if so else "false"}, {"true" if fa else "false"}, {cd} }}' for c, sp, d, t, so, fa, cd in pages) + '\n};\n')
        if events:
            w(f'constexpr event map{i}_events[] = {{\n    ' + ',\n    '.join(
                f'{{ {x}, {z}, {ew}, {eh}, {fp}, {pc}, {sid} }}' for x, z, ew, eh, fp, pc, sid in events) + '\n};\n')
        name = ''.join(ch for ch in m['name'] if 32 <= ord(ch) < 127)
        infos.append(f'{{ {W}, {H}, {m["bw"]}, {m["bh"]}, {c_string(name)}, map{i}_collision, map{i}_heights, '
                     f'{f"map{i}_events" if events else "nullptr"}, {len(events)}, {f"map{i}_pages" if pages else "nullptr"}, map{i}_code, '
                     f'&bn::regular_bg_items::world_ground_{i}, &bn::regular_bg_items::world_over_{i} }}')
        w('\n')
    w('constexpr map_info maps[] = {\n    ' + ',\n    '.join(infos) + '\n};\n')
    w(f'constexpr int map_count = {len(maps)};\n')
    w(f'constexpr int switch_count = {max(1, len(comp.switches))};\nconstexpr int var_count = {max(1, len(comp.vars))};\n')
    w(f'constexpr int self_count = {max(1, comp.self_count)};\n')
    item_names = [''.join(ch for ch in n if 32 <= ord(ch) < 127) for n in comp.item_names]
    w('// Database items, in order (the bag counts them).\n')
    w('constexpr const char* item_names[] = { ' + (', '.join(c_string(n) for n in item_names) or '""') + ' };\n')
    w(f'constexpr int item_count = {max(1, len(item_names))};\n')
    gold0 = int((db.get('inventory') or {}).get('startGold', 0) or 0)
    start_items = [(comp.items[s['item']], int(s.get('count', 1))) for s in (db.get('inventory') or {}).get('startItems', []) if s.get('item') in comp.items]
    w(f'constexpr int start_gold = {gold0};\n')
    w('constexpr int16_t start_items[] = { ' + (', '.join(f'{a}, {b}' for a, b in start_items) or '-1, 0') + ' };\n')
    w(f'constexpr int start_item_count = {len(start_items)};\n')
    w('// Objects events show (sprite -10 - k): one frame each, this tall.\n')
    w('constexpr const bn::sprite_item* obj_sprites[] = { ' + (', '.join(f'&bn::sprite_items::obj_{k}' for k in range(len(obj_ids))) or 'nullptr') + ' };\n')
    w('constexpr int obj_heights[] = { ' + (', '.join(str(x) for x in obj_heights) or '0') + ' };\n')
    w('constexpr const bn::sprite_item* npc_sprites[] = { ' +
      (', '.join(f'&bn::sprite_items::npc_{k}' for k in range(len(npc_ids))) or 'nullptr') + ' };\n\n')

    m0 = maps[0]
    sx, sz = find_start({'start': m0['start'] or [m0['W'] // 2, m0['H'] // 2]}, m0['coll'], m0['W'], m0['H'])
    w(f'constexpr int start_map = 0;\nconstexpr int start_x = {sx};\nconstexpr int start_y = {sz};\n')
    w(f'constexpr int start_dir = {DIRS.get(m0["dir"], 0)};\n')
    w('}\n\n#endif\n')
    with open(os.path.join(INC, 'mimas_map.h'), 'w') as f:
        f.write(''.join(out))
    print(f'  {len(maps)} map(s); start at {sx}, {sz}; wrote game/graphics and game/include/mimas_map.h')


if __name__ == '__main__':
    main()
