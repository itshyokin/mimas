#!/usr/bin/env python3
"""
Mimas: the built-in battle backgrounds, painted in code at the GBA's screen size (240 x 160) in few colours (so the
ROM can show them as a background): meadow, forest, cave, town street, beach, snowfield. Each has a light oval
where the foe stands (top right) and the ground under the hero.

Writes public/gba/battlebacks/builtin/<id>.png. Run once (python3 tools/make_battlebacks.py); GBA Studio lists them
and can swap any for your own picture (saved beside them as public/gba/battlebacks/<id>.png).
"""
import math
import os
import random

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'gba', 'battlebacks', 'builtin')
W, H = 240, 160
HORIZON = 48          # where the far scenery meets the ground
FOE = (171, 53)       # the middle of the foe's oval (its feet; the ROM's foe stands here too)
HERO = (62, 132)      # the hero's ground (mostly under the panels)

BUILTIN = [
    ('meadow', 'Meadow'), ('forest', 'Forest'), ('cave', 'Cave'), ('town', 'Town street'), ('beach', 'Beach'), ('snow', 'Snowfield'),
]


def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Canvas:
    def __init__(self, seed):
        self.im = Image.new('RGB', (W, H))
        self.px = self.im.load()
        self.r = random.Random(seed)

    def put(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[x, y] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(max(0, y0), min(H, y1)):
            for x in range(max(0, x0), min(W, x1)):
                self.px[x, y] = c

    def bands(self, y0, y1, cols, dither=True):
        """Vertical gradient from cols[0] (top) to cols[-1], in steps, with a checker dither between steps."""
        n = len(cols)
        for y in range(y0, y1):
            t = (y - y0) / max(1, y1 - y0) * (n - 1)
            i = min(n - 2, int(t)) if n > 1 else 0
            f = t - i
            for x in range(W):
                if n == 1:
                    c = cols[0]
                elif dither and 0.35 < f < 0.65:
                    c = cols[i] if (x + y) % 2 else cols[i + 1]
                else:
                    c = cols[i] if f <= 0.5 else cols[i + 1]
                self.px[x, y] = c

    def ellipse(self, cx, cy, rx, ry, c, rim=None, shade=None):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2
                if d <= 1:
                    col = c
                    if shade and y > cy and d > 0.45:
                        col = shade
                    if rim and d > 0.82:
                        col = rim
                    self.put(x, y, col)

    def speckle(self, x0, y0, x1, y1, cols, n):
        for _ in range(n):
            self.put(self.r.randrange(x0, x1), self.r.randrange(y0, y1), self.r.choice(cols))

    def tuft(self, x, y, c, c2=None):
        for dx, dy in ((0, 0), (-1, -1), (1, -1), (0, -2), (-2, -2), (2, -2)):
            self.put(x + dx, y + dy, c if dy > -2 or not c2 else c2)


def platform(cv, top, rim, shade, rx=46, ry=10):
    cv.ellipse(FOE[0], FOE[1], rx, ry, top, rim, shade)


def hero_ground(cv, top, rim, shade):
    cv.ellipse(HERO[0], HERO[1], 72, 16, top, rim, shade)


def clouds(cv, ys, white, shade):
    for cx, cy, s in ys:
        for k in range(4):
            cv.ellipse(cx + k * 6 * s - 9 * s, cy - (2 if k in (1, 2) else 0) * s, 7 * s, 4 * s, white)
        cv.rect(int(cx - 14 * s), int(cy + 2 * s), int(cx + 16 * s), int(cy + 3 * s), shade)


def hills(cv, base, amp, period, phase, c, top=None):
    for x in range(W):
        h = base - int(amp * (0.6 * math.sin(x / period + phase) + 0.4 * math.sin(x / (period * 0.43) + phase * 2)))
        for y in range(h, HORIZON):
            cv.put(x, y, c if top is None or y > h else top)


def meadow():
    cv = Canvas(1)
    sky = [hexc(c) for c in ('#78b8f8', '#98d0f8', '#b8e0f8', '#d8f0f8')]
    cv.bands(0, HORIZON, sky)
    clouds(cv, [(40, 14, 1.0), (120, 9, 0.8), (205, 20, 1.1)], hexc('#f8f8f8'), hexc('#c8e0f0'))
    hills(cv, 38, 6, 22, 0.4, hexc('#88c070'), hexc('#a0d088'))
    hills(cv, 44, 4, 14, 2.1, hexc('#58a048'), hexc('#70b858'))
    g = [hexc(c) for c in ('#68b850', '#78c860', '#88d070')]
    cv.bands(HORIZON, H, g)
    cv.speckle(0, HORIZON + 2, W, H, [hexc('#58a040'), hexc('#90d878')], 700)
    for _ in range(70):
        x, y = cv.r.randrange(W), cv.r.randrange(HORIZON + 4, H)
        cv.tuft(x, y, hexc('#489038'), hexc('#58a040'))
    for _ in range(26):
        x, y = cv.r.randrange(W), cv.r.randrange(HORIZON + 6, H)
        c = cv.r.choice([hexc('#f8f8f8'), hexc('#f8d048'), hexc('#f878a0')])
        cv.put(x, y, c); cv.put(x + 1, y, c); cv.put(x, y - 1, hexc('#f8f0a0'))
    platform(cv, hexc('#a0d880'), hexc('#58a040'), hexc('#88c868'))
    hero_ground(cv, hexc('#a0d880'), hexc('#58a040'), hexc('#88c868'))
    return cv.im


def forest():
    cv = Canvas(2)
    cv.bands(0, HORIZON, [hexc(c) for c in ('#204828', '#306838', '#407848')])
    # light between the trunks
    for x0 in (30, 96, 150, 210):
        for y in range(0, HORIZON):
            for x in range(x0 + y // 4, x0 + y // 4 + 7):
                if (x + y) % 2:
                    cv.put(x, y, hexc('#78a868'))
    # trunks
    for x0, w in ((8, 9), (52, 7), (78, 12), (122, 8), (170, 10), (196, 7), (226, 9)):
        cv.rect(x0, 0, x0 + w, HORIZON + 4, hexc('#4a3424'))
        cv.rect(x0 + 1, 0, x0 + 3, HORIZON + 4, hexc('#6a4a30'))
        for y in range(4, HORIZON, 9):
            cv.put(x0 + w // 2, y, hexc('#382418'))
    # canopy
    for _ in range(60):
        cv.ellipse(cv.r.randrange(-10, W + 10), cv.r.randrange(-6, 14), cv.r.randrange(10, 22), cv.r.randrange(5, 10), cv.r.choice([hexc('#285830'), hexc('#386838'), hexc('#1c4024')]))
    cv.bands(HORIZON, H, [hexc(c) for c in ('#3a6a30', '#4a7a38', '#5a8a40')])
    cv.speckle(0, HORIZON, W, H, [hexc('#2a5428'), hexc('#6a9a48')], 500)
    for _ in range(40):
        x, y = cv.r.randrange(W), cv.r.randrange(HORIZON + 4, H)
        cv.tuft(x, y, hexc('#2a5428'), hexc('#3a6a30'))
    platform(cv, hexc('#8a7048'), hexc('#4a3a24'), hexc('#6e5838'))
    hero_ground(cv, hexc('#8a7048'), hexc('#4a3a24'), hexc('#6e5838'))
    return cv.im


def cave():
    cv = Canvas(3)
    cv.bands(0, HORIZON + 6, [hexc(c) for c in ('#181820', '#282838', '#383848', '#484858')])
    # rock wall blocks
    for _ in range(90):
        x, y = cv.r.randrange(W), cv.r.randrange(4, HORIZON)
        w, h = cv.r.randrange(6, 16), cv.r.randrange(3, 7)
        cv.rect(x, y, x + w, y + 1, hexc('#585868'))
        cv.rect(x, y + h, x + w, y + h + 1, hexc('#202028'))
    # stalactites
    for x0 in range(4, W, 17):
        L = cv.r.randrange(6, 18)
        for y in range(L):
            hw = max(0, (L - y) // 4)
            cv.rect(x0 - hw, y, x0 + hw + 1, y + 1, hexc('#40404c'))
            cv.put(x0 - hw, y, hexc('#606070'))
    # crystals
    for x0, y0, c1, c2 in ((40, 36, '#68c8f8', '#b8f0f8'), (128, 30, '#a878f8', '#e0c8f8'), (214, 38, '#68c8f8', '#b8f0f8')):
        for k, (dx, h) in enumerate(((0, 10), (4, 7), (-4, 6))):
            for y in range(h):
                w = max(0, 2 - y // 4)
                cv.rect(x0 + dx - w, y0 - y, x0 + dx + w + 1, y0 - y + 1, hexc(c1))
            cv.put(x0 + dx, y0 - h + 1, hexc(c2))
    cv.bands(HORIZON + 6, H, [hexc(c) for c in ('#4a4a58', '#56566a', '#626274')])
    cv.speckle(0, HORIZON + 6, W, H, [hexc('#3a3a48'), hexc('#7a7a8a')], 800)
    platform(cv, hexc('#6a6a80'), hexc('#2e2e3a'), hexc('#545468'))
    hero_ground(cv, hexc('#6a6a80'), hexc('#2e2e3a'), hexc('#545468'))
    return cv.im


def town():
    cv = Canvas(4)
    cv.bands(0, 30, [hexc(c) for c in ('#88c0f8', '#a8d8f8', '#c8e8f8')])
    clouds(cv, [(60, 8, 0.8), (190, 12, 0.9)], hexc('#f8f8f8'), hexc('#d0e4f0'))
    x = -6
    walls = ['#d8b890', '#b87858', '#e0d0b0', '#a8a0b8', '#c89070']
    k = 0
    while x < W:
        w = cv.r.randrange(30, 46)
        top = cv.r.randrange(10, 24)
        wall = hexc(walls[k % len(walls)])
        cv.rect(x, top, x + w, HORIZON, wall)
        # roof
        roof = hexc(cv.r.choice(['#a04838', '#5868a0', '#486848']))
        for y in range(top - 6, top):
            cv.rect(x - 2 + (top - y) // 1 - 2, y, x + w + 2 - (top - y) + 2, y + 1, roof)
        # windows
        for wy in range(top + 5, HORIZON - 10, 11):
            for wx in range(x + 5, x + w - 7, 11):
                cv.rect(wx, wy, wx + 6, wy + 7, hexc('#384868'))
                cv.rect(wx + 1, wy + 1, wx + 3, wy + 3, hexc('#88b0d8'))
        # door
        dx = x + w // 2 - 4
        cv.rect(dx, HORIZON - 12, dx + 8, HORIZON, hexc('#5a3a28'))
        cv.rect(x, top, x + 1, HORIZON, hexc('#806050'))
        x += w + 2
        k += 1
    # lamp posts
    for lx in (34, 150):
        cv.rect(lx, 18, lx + 2, HORIZON + 6, hexc('#303040'))
        cv.rect(lx - 2, 15, lx + 4, 19, hexc('#f8e078'))
    # street: cobbles
    cv.bands(HORIZON, H, [hexc(c) for c in ('#9a9488', '#aaa498', '#b8b2a6')], dither=False)
    for y in range(HORIZON + 2, H, 5):
        off = (y // 5) % 2 * 4
        for x0 in range(-off, W, 8):
            cv.rect(x0, y, x0 + 7, y + 1, hexc('#807a70'))
            cv.put(x0 + 7, y + 1, hexc('#807a70')); cv.put(x0 + 7, y + 2, hexc('#807a70'))
    cv.rect(0, HORIZON, W, HORIZON + 2, hexc('#706a60'))
    platform(cv, hexc('#c8c2b4'), hexc('#7a746a'), hexc('#b0aa9c'))
    hero_ground(cv, hexc('#c8c2b4'), hexc('#7a746a'), hexc('#b0aa9c'))
    return cv.im


def beach():
    cv = Canvas(5)
    cv.bands(0, 34, [hexc(c) for c in ('#58a8f8', '#80c0f8', '#a8d8f8', '#d0ecf8')])
    clouds(cv, [(50, 10, 0.9), (170, 7, 1.0)], hexc('#f8f8f8'), hexc('#c8e0f0'))
    cv.bands(34, HORIZON + 4, [hexc(c) for c in ('#3878c8', '#4890d8', '#58a8e0')])
    for _ in range(60):
        x, y = cv.r.randrange(W), cv.r.randrange(36, HORIZON + 3)
        cv.rect(x, y, x + cv.r.randrange(3, 9), y + 1, hexc('#a8d8f8'))
    # foam line
    for x in range(W):
        y = HORIZON + 4 + int(1.5 * math.sin(x / 9))
        cv.put(x, y, hexc('#f0f8f8')); cv.put(x, y + 1, hexc('#c8e8f0'))
        for yy in range(y + 2, HORIZON + 7):
            cv.put(x, yy, hexc('#d8c088'))
    cv.bands(HORIZON + 7, H, [hexc(c) for c in ('#e8d098', '#f0d8a8', '#f8e0b0')])
    cv.speckle(0, HORIZON + 6, W, H, [hexc('#d8b880'), hexc('#f8f0d0')], 700)
    for x0, y0 in ((20, 70), (110, 150), (220, 100)):
        cv.ellipse(x0, y0, 3, 2, hexc('#f8a878'))
    platform(cv, hexc('#f8e8c0'), hexc('#c8a870'), hexc('#e8d0a0'))
    hero_ground(cv, hexc('#f8e8c0'), hexc('#c8a870'), hexc('#e8d0a0'))
    return cv.im


def snow():
    cv = Canvas(6)
    cv.bands(0, HORIZON, [hexc(c) for c in ('#98b0d0', '#b0c8e0', '#c8d8e8', '#e0e8f0')])
    # mountains
    for cx, h, w in ((40, 30, 50), (120, 38, 64), (200, 28, 46)):
        for y in range(HORIZON - h, HORIZON):
            hw = int((y - (HORIZON - h)) * w / h / 2)
            cv.rect(cx - hw, y, cx + hw, y + 1, hexc('#8898b8'))
            cv.rect(cx - hw, y, cx - hw // 3, y + 1, hexc('#a8b8d0'))
            if y < HORIZON - h + h // 3:
                cv.rect(cx - hw, y, cx + hw, y + 1, hexc('#f0f4f8'))
    # pines
    for x0 in range(6, W, 23):
        base = HORIZON + 2
        for y in range(14):
            hw = (y + 2) // 3
            cv.rect(x0 - hw, base - 14 + y, x0 + hw + 1, base - 13 + y, hexc('#305848'))
            cv.put(x0 - hw, base - 14 + y, hexc('#e8f0f8'))
    cv.bands(HORIZON, H, [hexc(c) for c in ('#d8e4f0', '#e4ecf4', '#f0f4f8')])
    cv.speckle(0, HORIZON, W, H, [hexc('#c0d0e0'), hexc('#f8f8f8')], 600)
    for _ in range(80):
        cv.put(cv.r.randrange(W), cv.r.randrange(0, HORIZON), hexc('#f8f8f8'))
    platform(cv, hexc('#f8f8f8'), hexc('#a8b8d0'), hexc('#e0e8f0'))
    hero_ground(cv, hexc('#f8f8f8'), hexc('#a8b8d0'), hexc('#e0e8f0'))
    return cv.im


def main():
    os.makedirs(OUT, exist_ok=True)
    for bid, _ in BUILTIN:
        im = globals()[bid]()
        # GBA colours (5 bits a channel)
        im = im.point(lambda v: (v >> 3) << 3)
        im.save(os.path.join(OUT, f'{bid}.png'))
        print(f'  {bid}: {len(im.getcolors(4096))} colours')


if __name__ == '__main__':
    main()
