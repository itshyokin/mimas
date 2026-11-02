"""
Mimas: the starter set of battle effects, as GBA Studio sprites (kind "effect": 64 x 64, 6 frames).

  Hits (drawn in greys; a move's element recolours them): slash, double slash, claw, hit, punch, pierce, ding, bite,
  slam, sparkle.
  Bursts (their own colours; elemental moves play their element's after the hit): fire, water, ice, shock, earth,
  nature, poison, light, dark.

Each gets a sound (a built-in sound name). Run once (python3 tools/make_effects.py): it adds the sprites and their
palettes to public/data/gba.json and writes the sheets to public/gba/sprites/fx_*.png. Existing fx_ sprites are kept
unless --force is given, so repainted ones aren't overwritten.
"""
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'public', 'data')
SPRITES = os.path.join(ROOT, 'public', 'gba', 'sprites')
S = 64
FRAMES = 6


def snap(hexstr):
    n = int(hexstr.lstrip('#'), 16)
    out = []
    for v in ((n >> 16) & 255, (n >> 8) & 255, n & 255):
        c5 = round(v / 255 * 31)
        out.append((c5 << 3) | (c5 >> 2))
    return '#%02x%02x%02x' % tuple(out)


# A hit's greys: 1 white, 2 light, 3 mid, 4 dark, 5 outline.
GREYS = ['#f8f8f8', '#d0d0d8', '#a0a0b0', '#606070', '#303038']

BURSTS = {
    'fire': ['#fff8d0', '#f8e050', '#f8a030', '#e05020', '#a02010', '#501008'],
    'water': ['#f0f8ff', '#a0d8f8', '#58a8f0', '#3068d0', '#203890', '#101848'],
    'ice': ['#ffffff', '#d8f8ff', '#a0e8f8', '#60c0e8', '#3088c0', '#184868'],
    'shock': ['#ffffff', '#fff8a0', '#f8e040', '#e0b020', '#a07010', '#403008'],
    'earth': ['#f0e0c0', '#d0a870', '#a87848', '#805030', '#583820', '#302010'],
    'nature': ['#e8ffd0', '#a8e870', '#68c040', '#409028', '#286018', '#103008'],
    'poison': ['#f8e8ff', '#d8a0f0', '#b060e0', '#8038b0', '#582078', '#281038'],
    'light': ['#ffffff', '#fff8d8', '#f8e898', '#f0c850', '#c09030', '#604818'],
    'dark': ['#e8d8f8', '#a080d0', '#7048a8', '#482878', '#281448', '#100818'],
}


def frame_canvas():
    return Image.new('P', (S, S), 0)


def thick_line(d, pts, widths, colours):
    """Draws a polyline several times, widest first: an outlined, shaded stroke."""
    for w, c in zip(widths, colours):
        if w <= 0:
            continue
        d.line(pts, fill=c, width=w, joint='curve')
        for x, y in (pts[0], pts[-1]):
            r = w / 2
            d.ellipse((x - r, y - r, x + r, y + r), fill=c)


def blob(d, x, y, r, colours, steps=(1.0, 0.75, 0.45)):
    for k, c in zip(steps, colours):
        rr = r * k
        if rr >= 0.5:
            d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=c)


def tapered(d, pts, width, colours=(5, 3, 1)):
    """A stroke that swells in the middle and tapers to points at both ends (a blade's arc)."""
    n = len(pts)
    for layer, c in enumerate(colours):
        shrink = [1.0, 0.65, 0.3][layer]
        for i, (x, y) in enumerate(pts):
            s = i / max(1, n - 1)
            r = width * math.sin(math.pi * s) * shrink / 2
            if r >= 0.5:
                d.ellipse((x - r, y - r, x + r, y + r), fill=c)


def arc_points(cx, cy, r, a0, a1, n=40):
    return [(cx + r * math.cos(a0 + (a1 - a0) * i / (n - 1)), cy + r * math.sin(a0 + (a1 - a0) * i / (n - 1))) for i in range(n)]


def star(d, cx, cy, r_out, r_in, points, rot, fill):
    pts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in
        a = rot + math.pi * i / points
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    d.polygon(pts, fill=fill)


# ---------------------------------------------------------------------------------------------- hits

def draw_slash(d, f, mirror=False, delay=0):
    t = f - delay
    if t < 0:
        return
    pts = arc_points(-6, 62, 62, -1.25, -0.08)
    if mirror:
        pts = [(S - x, y) for x, y in pts]
    reveal = [0.35, 0.75, 1, 1, 1, 1][min(t, 5)]
    width = [7, 12, 14, 10, 5, 2][min(t, 5)]
    part = pts[: max(2, int(len(pts) * reveal))]
    if t <= 3:
        tapered(d, part, width)
    elif t == 4:
        tapered(d, part[::2], width, (3, 2))
    else:
        for x, y in part[::5]:
            d.point((x, y), fill=2)


def fx_slash(f):
    im = frame_canvas()
    draw_slash(ImageDraw.Draw(im), f)
    return im


def fx_double(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    draw_slash(d, f)
    draw_slash(d, f, mirror=True, delay=1)
    return im


def fx_claw(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    for k in range(3):
        t = f - k * 0.5
        if t < 0:
            continue
        ox = 14 + k * 12
        x0, y0, x1, y1 = ox, 8, ox - 12, 56
        reveal = min(1, (t + 1) / 2.5)
        fade = max(0, (f - 3)) / 3
        if fade >= 1:
            continue
        pts = [(x0 + (x1 - x0) * i / 20 * reveal, y0 + (y1 - y0) * i / 20 * reveal) for i in range(21)]
        tapered(d, pts, 7 * (1 - fade) + 2, (5, 3, 1) if fade < 0.4 else (3, 2))
    return im


def fx_hit(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    r = [10, 22, 28, 26, 20, 12][f]
    if f <= 2:
        star(d, 32, 32, r + 2, r * 0.45 + 2, 8, 0.2, 5)
        star(d, 32, 32, r, r * 0.45, 8, 0.2, 3)
        star(d, 32, 32, r * 0.7, r * 0.3, 8, 0.2, 1)
    else:
        rr = r + (f - 2) * 4
        d.ellipse((32 - rr, 32 - rr, 32 + rr, 32 + rr), outline=3 if f < 5 else 2, width=3 if f < 4 else 1)
        random.seed(f)
        for k in range(8):
            a = k * math.pi / 4 + 0.3
            x, y = 32 + math.cos(a) * (rr + 4), 32 + math.sin(a) * (rr + 4)
            blob(d, x, y, 2.5 if f < 5 else 1.5, (4, 1))
    return im


def fx_punch(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    if f <= 1:
        blob(d, 32, 32, [10, 16][f], (5, 2, 1))
    rr = [0, 12, 18, 23, 27, 30][f]
    if rr:
        d.ellipse((32 - rr, 32 - rr * 0.8, 32 + rr, 32 + rr * 0.8), outline=5 if f < 4 else 3, width=4 if f < 3 else 2)
        d.ellipse((32 - rr + 2, 32 - rr * 0.8 + 2, 32 + rr - 2, 32 + rr * 0.8 - 2), outline=1 if f < 4 else 2, width=1)
    if 1 <= f <= 3:
        for a in (0.4, 2.0, 3.5, 5.2):
            x0, y0 = 32 + math.cos(a) * (rr + 3), 32 + math.sin(a) * (rr + 3)
            x1, y1 = 32 + math.cos(a) * (rr + 11), 32 + math.sin(a) * (rr + 11)
            thick_line(d, [(x0, y0), (x1, y1)], (3, 1), (4, 1))
    return im


def fx_pierce(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    tip = [20, 40, 52, 52, 52, 52][f]
    if f <= 3:
        thick_line(d, [(2, 34), (tip, 32)], (5, 3, 1), (5, 3, 1))
        d.polygon([(tip, 26), (tip + 8, 32), (tip, 38)], fill=5)
        d.polygon([(tip + 1, 28), (tip + 6, 32), (tip + 1, 36)], fill=1)
    if f >= 2:
        r = [0, 0, 8, 14, 12, 6][f]
        star(d, 52, 32, r, r * 0.3, 4, 0, 3 if f < 5 else 2)
        star(d, 52, 32, r * 0.6, r * 0.2, 4, 0, 1)
    return im


def fx_ding(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    r = [4, 12, 16, 12, 6, 2][f]
    star(d, 32, 30, r + 1, 2.5, 4, -math.pi / 2, 5)
    star(d, 32, 30, r, 1.5, 4, -math.pi / 2, 1)
    if 1 <= f <= 4:
        rr = 6 + f * 4
        d.ellipse((32 - rr, 30 - rr, 32 + rr, 30 + rr), outline=2 if f > 2 else 3, width=1)
    for k, (x, y) in enumerate(((16, 16), (48, 44), (50, 14))):
        s = [0, 2, 4, 5, 3, 1][(f + k) % 6]
        if s:
            star(d, x, y, s, 1, 4, 0, 1)
    return im


def fx_bite(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    gap = [24, 16, 8, 0, 0, 0][f]
    if f <= 4:
        for row, sign in ((32 - gap, -1), (32 + gap, 1)):
            base = row + sign * 8
            d.rectangle((8, min(base, base + sign * 6), 56, max(base, base + sign * 6)), fill=4 if f < 4 else 3)
            for k in range(5):
                x = 10 + k * 10
                d.polygon([(x, base), (x + 8, base), (x + 4, row)], fill=5)
                d.polygon([(x + 2, base), (x + 6, base), (x + 4, row + sign * -2)], fill=1)
    if f >= 3:
        r = [0, 0, 0, 14, 20, 12][f]
        star(d, 32, 32, r, r * 0.35, 6, 0.3, 3)
        star(d, 32, 32, r * 0.55, r * 0.2, 6, 0.3, 1)
    return im


def fx_slam(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    w = [8, 16, 24, 28, 30, 31][f]
    h = w * 0.3
    d.ellipse((32 - w, 50 - h, 32 + w, 50 + h), outline=5 if f < 4 else 3, width=3)
    d.ellipse((32 - w + 3, 50 - h + 1, 32 + w - 3, 50 + h - 1), outline=1 if f < 4 else 2, width=1)
    if f <= 1:
        blob(d, 32, 48, 8 + f * 4, (5, 2, 1))
    for k in range(5):
        x = 12 + k * 10
        y = 50 - [0, 6, 12, 16, 18, 19][f] - (k % 2) * 4
        r = [0, 3, 4, 4, 3, 2][f]
        if r:
            blob(d, x, y, r, (4, 2))
    return im


def fx_sparkle(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    spots = [(32, 24), (18, 36), (46, 40), (26, 50), (42, 16), (14, 18)]
    for k, (x, y) in enumerate(spots):
        t = f - k * 0.6
        if t < 0 or t > 3:
            continue
        s = [3, 7, 5, 2][int(t)]
        y -= int(t * 3)
        star(d, x, y, s + 1, 1.5, 4, 0, 5)
        star(d, x, y, s, 1, 4, 0, 1)
    return im


HITS = [
    ('fx_slash', 'Slash', fx_slash, 'slash'),
    ('fx_double', 'Double slash', fx_double, 'slash'),
    ('fx_claw', 'Claw', fx_claw, 'cut'),
    ('fx_hit', 'Hit', fx_hit, 'hit'),
    ('fx_punch', 'Punch', fx_punch, 'thump'),
    ('fx_pierce', 'Pierce', fx_pierce, 'arrowHit'),
    ('fx_ding', 'Ding', fx_ding, 'ding'),
    ('fx_bite', 'Bite', fx_bite, 'crit'),
    ('fx_slam', 'Slam', fx_slam, 'hitStone'),
    ('fx_sparkle', 'Sparkle', fx_sparkle, 'shine'),
]

# ---------------------------------------------------------------------------------------------- bursts
# Burst palettes: 1 brightest … 6 darkest.


def flame(d, x, base, h, w):
    """A teardrop flame: dark outline, then orange, yellow, a white heart."""
    for k, c in enumerate((6, 4, 3, 2, 1)):
        s = 1 - k * 0.18
        hh, ww = h * s, w * s
        top = base - hh
        d.polygon([(x, top), (x + ww / 2, base - hh * 0.35), (x + ww * 0.42, base - hh * 0.12), (x, base - k * 0.5), (x - ww * 0.42, base - hh * 0.12), (x - ww / 2, base - hh * 0.35)], fill=c)


def fx_fire(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    for k, (x, ph) in enumerate(((32, 0), (20, 1), (44, 1), (26, 2), (38, 2))):
        t = f - ph * 0.5
        if t < 0:
            continue
        h = [10, 26, 38, 34, 22, 10][min(5, int(t))] * (1 if k == 0 else 0.7)
        if h > 2:
            flame(d, x, 58 - (f > 3) * (f - 3) * 4, h, h * 0.55)
    if f >= 3:
        for k in range(4):
            x, y = 16 + k * 11, 40 - (f - 3) * 9 - (k % 2) * 6
            blob(d, x, y, 2, (3, 1))
    return im


def fx_water(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    if f <= 2:
        w = [10, 18, 24][f]
        d.ellipse((32 - w, 50 - w * 0.3, 32 + w, 50 + w * 0.3), outline=4, width=2)
        d.polygon([(32 - w * 0.6, 50), (32 - w * 0.3, 50 - [8, 16, 20][f]), (32, 48), (32 + w * 0.3, 50 - [8, 16, 20][f]), (32 + w * 0.6, 50)], fill=3)
    for k in range(8):
        a = -math.pi + (k + 0.5) * math.pi / 8
        dist = [4, 12, 20, 26, 30, 32][f]
        x, y = 32 + math.cos(a) * dist, 48 + math.sin(a) * dist * 1.1 + (f ** 2) * 0.8
        r = [3, 3.5, 3.5, 3, 2.5, 1.5][f]
        blob(d, x, y, r, (5, 3, 1))
    return im


def fx_ice(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    for k in range(7):
        a = k * 2 * math.pi / 7 + 0.3
        dist = [2, 8, 14, 18, 20, 21][f]
        ln = [6, 12, 16, 14, 10, 6][f]
        x, y = 32 + math.cos(a) * dist, 32 + math.sin(a) * dist
        x2, y2 = x + math.cos(a) * ln, y + math.sin(a) * ln
        px, py = -math.sin(a) * 3.5, math.cos(a) * 3.5
        d.polygon([(x, y), (x + (x2 - x) * 0.5 + px, y + (y2 - y) * 0.5 + py), (x2, y2), (x + (x2 - x) * 0.5 - px, y + (y2 - y) * 0.5 - py)], fill=5)
        d.polygon([(x, y), (x + (x2 - x) * 0.5 + px * 0.4, y + (y2 - y) * 0.5 + py * 0.4), (x2, y2)], fill=2)
    if f <= 2:
        star(d, 32, 32, [6, 12, 9][f], 3, 6, 0, 1)
    if f >= 4:
        for k in range(5):
            star(d, 10 + k * 11, 12 + (k * 17) % 40, 2, 1, 4, 0, 1)
    return im


def fx_shock(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    random.seed(7 + f // 2)
    for k in range(3):
        if f >= 5 and k:
            continue
        x = 32 + (k - 1) * 14
        pts = [(x + random.randint(-3, 3), 0)]
        y = 0
        while y < 46:
            y += random.randint(6, 10)
            pts.append((x + random.randint(-9, 9), y))
        thick_line(d, pts, (5, 3, 1), (5, 3, 1)) if f % 2 == 0 else thick_line(d, pts, (4, 2), (4, 2))
    if 1 <= f <= 4:
        star(d, 32, 46, [0, 10, 14, 12, 8][f], 3, 8, 0.2, 2)
        star(d, 32, 46, [0, 6, 8, 7, 4][f], 2, 8, 0.2, 1)
    return im


def fx_earth(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    random.seed(3)
    rocks = [(random.uniform(-1, 1), random.uniform(0.6, 1.4), random.uniform(3, 6)) for _ in range(7)]
    for vx, vy, size in rocks:
        t = f / 5
        x = 32 + vx * 26 * t
        y = 56 - vy * 60 * t + 50 * t * t
        if f == 0:
            y = 56
        pts = [(x + math.cos(a) * size * (0.8 + 0.3 * math.sin(a * 3)), y + math.sin(a) * size * 0.85) for a in [i * math.pi / 3 for i in range(6)]]
        d.polygon(pts, fill=6)
        d.polygon([(px * 0.8 + x * 0.2 - 1, py * 0.8 + y * 0.2 - 1) for px, py in pts], fill=3)
        d.point((x - 1, y - 2), fill=1)
    w = [10, 18, 24, 28, 30, 30][f]
    d.ellipse((32 - w, 56 - 4, 32 + w, 56 + 4), outline=5, width=2 if f < 4 else 1)
    return im


def fx_nature(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    for k in range(7):
        a = k * 2 * math.pi / 7 + f * 0.55
        r = 6 + f * 4.2
        x, y = 32 + math.cos(a) * r, 32 + math.sin(a) * r * 0.8 - f
        rot = a + math.pi / 2
        lx, ly = math.cos(rot) * 5, math.sin(rot) * 5
        px, py = -math.sin(rot) * 2.5, math.cos(rot) * 2.5
        d.polygon([(x - lx, y - ly), (x + px, y + py), (x + lx, y + ly), (x - px, y - py)], fill=5 if f < 5 else 4)
        d.line([(x - lx * 0.7, y - ly * 0.7), (x + lx * 0.7, y + ly * 0.7)], fill=2)
    if f <= 2:
        blob(d, 32, 32, [6, 9, 6][f], (3, 1))
    return im


def fx_poison(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    for k, (x, ph, r) in enumerate(((22, 0, 6), (34, 1, 8), (44, 0.5, 5), (28, 2, 4), (40, 2.5, 6), (16, 1.5, 3))):
        t = f - ph
        if t < 0:
            continue
        y = 58 - t * 10
        rr = r * (0.6 + 0.2 * min(t, 2))
        if t > 3.5:
            # it pops
            d.arc((x - rr - 2, y - rr - 2, x + rr + 2, y + rr + 2), 0, 360, fill=3)
            continue
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=5)
        d.ellipse((x - rr + 1, y - rr + 1, x + rr - 1, y + rr - 1), fill=3)
        d.ellipse((x - rr * 0.5, y - rr * 0.6, x - rr * 0.1, y - rr * 0.2), fill=1)
    return im


def fx_light(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    ln = [10, 22, 30, 30, 26, 18][f]
    for k in range(12):
        a = k * math.pi / 6 + 0.13
        inner = 6 if f < 4 else 6 + (f - 3) * 6
        thick_line(d, [(32 + math.cos(a) * inner, 32 + math.sin(a) * inner), (32 + math.cos(a) * ln, 32 + math.sin(a) * ln)], (3 if k % 2 else 4, 1), (4, 2))
    if f <= 3:
        blob(d, 32, 32, [6, 12, 14, 9][f], (3, 2, 1))
    return im


def fx_dark(f):
    im = frame_canvas()
    d = ImageDraw.Draw(im)
    for k in range(3):
        a0 = k * 2 * math.pi / 3 + f * 0.9
        r = [28, 24, 18, 14, 10, 6][f]
        pts = [(32 + math.cos(a0 + i * 0.12) * (r - i * 0.6), 32 + math.sin(a0 + i * 0.12) * (r - i * 0.6) * 0.85) for i in range(16)]
        thick_line(d, pts, (6, 3), (6, 4))
        thick_line(d, pts[:8], (2,), (2,))
    if f >= 3:
        blob(d, 32, 32, [0, 0, 0, 5, 9, 12][f], (6, 5))
    return im


BURST_FX = [
    ('fx_fire', 'Fire burst', fx_fire, 'burn', 'fire'),
    ('fx_water', 'Water splash', fx_water, 'splash', 'water'),
    ('fx_ice', 'Ice shards', fx_ice, 'freeze', 'ice'),
    ('fx_shock', 'Lightning', fx_shock, 'zap', 'shock'),
    ('fx_earth', 'Rocks', fx_earth, 'rumble', 'earth'),
    ('fx_nature', 'Leaves', fx_nature, 'leaves', 'nature'),
    ('fx_poison', 'Poison bubbles', fx_poison, 'bubble', 'poison'),
    ('fx_light', 'Holy light', fx_light, 'shine', 'light'),
    ('fx_dark', 'Dark swirl', fx_dark, 'gloom', 'dark'),
]


def sheet(fn, colours):
    rgb = [(0, 0, 0, 0)] + [tuple(int(snap(c)[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for c in colours]
    out = Image.new('RGBA', (S * FRAMES, S), (0, 0, 0, 0))
    for f in range(FRAMES):
        im = fn(f)
        px = im.load()
        for y in range(S):
            for x in range(S):
                v = px[x, y]
                if v:
                    out.putpixel((f * S + x, y), rgb[min(v, len(rgb) - 1)])
    return out


def main():
    force = '--force' in sys.argv
    path = os.path.join(DATA, 'gba.json')
    with open(path) as fh:
        gba = json.load(fh)
    pals = {p['id']: p for p in gba['palettes']}

    def palette(pid, name, colours):
        cols = [snap(c) for c in colours] + ['#000000'] * (15 - len(colours))
        if pid not in pals:
            pals[pid] = {'id': pid, 'name': name, 'colors': cols[:15]}
            gba['palettes'].append(pals[pid])
    palette('fx_hit', 'Effects: hits (greys)', GREYS)
    for el, cols in BURSTS.items():
        palette(f'fx_{el}', f'Effects: {el}', cols)
    os.makedirs(SPRITES, exist_ok=True)
    have = {s['id']: s for s in gba['sprites']}
    made = 0

    def add(sid, name, fn, colours, pal, role, sound, element=None):
        nonlocal made
        if sid in have and not force:
            return
        img = sheet(fn, colours)
        img.save(os.path.join(SPRITES, sid + '.png'))
        entry = {'id': sid, 'name': name, 'kind': 'effect', 'palette': pal, 'image': f'gba/sprites/{sid}.png', 'role': role, 'sound': sound, 'frames': FRAMES}
        if element:
            entry['element'] = element
        if sid in have:
            have[sid].update(entry)
        else:
            gba['sprites'].append(entry)
        made += 1
    for sid, name, fn, sound in HITS:
        add(sid, name, fn, GREYS, 'fx_hit', 'hit', sound)
    for sid, name, fn, sound, el in BURST_FX:
        add(sid, name, fn, BURSTS[el], f'fx_{el}', 'burst', sound, el)
    with open(path, 'w') as fh:
        json.dump(gba, fh, indent=2)
        fh.write('\n')
    print(f'{made} effect sprite(s) written')


if __name__ == '__main__':
    main()
