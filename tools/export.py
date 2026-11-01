#!/usr/bin/env python3
"""
Mimas exporter: turns a Saturn Game Engine map into GBA data for the Butano runtime.

Reads   project/mimas.json   (which map, where the player starts, which sprite)
        project/maps/<map>.json, project/assets.json, project/tiles, props, sprites
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
import os
import sys
from collections import Counter

import warnings

from PIL import Image, ImageDraw

warnings.filterwarnings('ignore', category=DeprecationWarning)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.join(ROOT, 'project')
GFX = os.path.join(ROOT, 'game', 'graphics')
INC = os.path.join(ROOT, 'game', 'include')
CELL = 16
BACKDROP = (16, 24, 16)

# Bits in the collision grid
SOLID = 1
BRIDGE = 2


def load_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def project_image(rel):
    """assets.json paths look like 'assets/tiles/rock.png'; Mimas keeps them in project/tiles."""
    name = os.path.basename(rel)
    for sub in ('tiles', 'props', 'sprites'):
        p = os.path.join(PROJECT, sub, name)
        if os.path.exists(p):
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


# ----------------------------------------------------------------------------- palettes

def nearest(c, pal):
    return min(range(len(pal)), key=lambda i: (pal[i][0] - c[0]) ** 2 + (pal[i][1] - c[1]) ** 2 + (pal[i][2] - c[2]) ** 2)


def to_banked(ground, over, max_banks=15):
    """Reduce colors so every 8x8 block fits a 15-color bank; returns indexed images + palette."""
    opaque = [(r, g, b) for im in (ground, over) for (r, g, b, a) in im.getdata() if a]
    sample = Image.new('RGB', (len(opaque), 1))
    sample.putdata(opaque)
    for k in (96, 80, 64, 48, 40, 32, 24):
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
        for im in (ground, over):
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

LPC_ROWS = {'up': 8, 'left': 9, 'down': 10, 'right': 11}  # walk rows in an LPC sheet
DIR_ORDER = ['down', 'up', 'left', 'right']
FRAMES = 9  # stand + 8 walk frames


def build_hero(path):
    sheet = Image.open(path).convert('RGBA')
    frames = []
    for d in DIR_ORDER:
        row = LPC_ROWS[d]
        for f in range(FRAMES):
            fr = sheet.crop((f * 64, row * 64, f * 64 + 64, row * 64 + 64))
            frames.append(hard_alpha(fr.resize((32, 32), Image.BOX)))
    strip = Image.new('RGBA', (32, 32 * len(frames)), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        strip.alpha_composite(fr, (0, i * 32))
    opaque = [(r, g, b) for (r, g, b, a) in strip.getdata() if a]
    sample = Image.new('RGB', (len(opaque), 1))
    sample.putdata(opaque)
    q = sample.quantize(colors=15, method=Image.Quantize.MEDIANCUT)
    qp = q.getpalette()[:45]
    pal = [tuple(qp[i:i + 3]) for i in range(0, len(qp), 3)]
    while len(pal) < 15:
        pal.append((0, 0, 0))
    cache = {}
    data = []
    for (r, g, b, a) in strip.getdata():
        if not a:
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


def main():
    cfg = load_json(os.path.join(PROJECT, 'mimas.json'))
    map_id = sys.argv[1] if len(sys.argv) > 1 else cfg['map']
    mp = load_json(os.path.join(PROJECT, 'maps', map_id + '.json'))
    assets = load_json(os.path.join(PROJECT, 'assets.json'))
    W, H = mp['width'], mp['height']
    print(f'Exporting "{mp.get("name", map_id)}" ({W} x {H})')

    ground, over, coll, hgrid = build_map(cfg, mp, assets)

    bw = max(256, math.ceil(W * CELL / 256) * 256)
    bh = max(256, math.ceil(H * CELL / 256) * 256)
    ground = pad_to(ground, bw, bh, BACKDROP + (255,))
    over = pad_to(over, bw, bh, (0, 0, 0, 0))
    os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
    ground.alpha_composite(Image.new('RGBA', ground.size, (0, 0, 0, 0)))
    preview = ground.copy()
    preview.alpha_composite(over)
    preview.crop((0, 0, W * CELL, H * CELL)).save(os.path.join(ROOT, 'build', 'preview.png'))

    (g_idx, o_idx), palette = to_banked(ground, over)
    os.makedirs(GFX, exist_ok=True)
    os.makedirs(INC, exist_ok=True)
    for im, name in ((g_idx, 'world_ground'), (o_idx, 'world_over')):
        put_palette(im, palette)
        im.save(os.path.join(GFX, name + '.bmp'))
        write_json(os.path.join(GFX, name + '.json'),
                   {'type': 'regular_bg', 'bpp_mode': 'bpp_4_manual', 'palette_item': 'world_palette'})
    pal_img = Image.new('P', (16, 16))
    put_palette(pal_img, palette)
    pal_img.save(os.path.join(GFX, 'world_palette.bmp'))
    write_json(os.path.join(GFX, 'world_palette.json'),
               {'type': 'bg_palette', 'bpp_mode': 'bpp_4', 'colors_count': len(palette)})

    hero = build_hero(os.path.join(PROJECT, 'sprites', cfg.get('player', 'jordan') + '.png'))
    hero.save(os.path.join(GFX, 'hero.bmp'))
    write_json(os.path.join(GFX, 'hero.json'), {'type': 'sprite', 'height': 32})

    sx, sz = find_start(cfg, coll, W, H)
    dirs = {d: i for i, d in enumerate(DIR_ORDER)}
    # The GBA font only has plain ASCII letters.
    name = ''.join(ch for ch in mp.get('name', map_id) if 32 <= ord(ch) < 127)
    name = name.replace('\\', '\\\\').replace('"', '\\"')
    flat_coll = [coll[z][x] for z in range(H) for x in range(W)]
    flat_h = [hgrid[z][x] for z in range(H) for x in range(W)]
    with open(os.path.join(INC, 'mimas_map.h'), 'w') as f:
        f.write('// Generated by tools/export.py from project/maps/' + map_id + '.json - do not edit.\n')
        f.write('#ifndef MIMAS_MAP_H\n#define MIMAS_MAP_H\n\n#include <cstdint>\n\nnamespace mimas::map\n{\n')
        f.write(f'constexpr int width = {W};\nconstexpr int height = {H};\n')
        f.write(f'constexpr int bg_width = {bw};\nconstexpr int bg_height = {bh};\n')
        f.write(f'constexpr int start_x = {sx};\nconstexpr int start_y = {sz};\n')
        f.write(f'constexpr int start_dir = {dirs.get(cfg.get("dir", "down"), 0)};\n')
        f.write(f'constexpr int hero_frames = {FRAMES};\n')
        f.write(f'constexpr const char* name = "{name}";\n')
        f.write(f'constexpr uint8_t solid = {SOLID};\nconstexpr uint8_t bridge = {BRIDGE};\n\n')
        f.write(c_array('collision', 'uint8_t', flat_coll, W))
        f.write(c_array('heights', 'int8_t', flat_h, W))
        f.write('}\n\n#endif\n')
    print(f'  start at {sx}, {sz}; wrote game/graphics and game/include/mimas_map.h')


if __name__ == '__main__':
    main()
