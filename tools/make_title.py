"""
Mimas: the title screen's built-in layers (Update 16), 240 x 160 pixel art in public/gba/title/builtin/.

  sky.png     Saturn Engine's own night sky (src/render/Sky.ts): Saturn and its rings, the artificial moon with its
              teal circuit lines, stars. Rendered from the engine's shader looking up, then shrunk to the GBA screen;
              this script only brightens the stars so they survive the shrinking (run with --sky <render.png>).
  clouds.png  a band of clouds, 256 wide so it wraps as it scrolls (the ROM and the playtest scroll it slowly).
  trees.png   the tops of pines all round the bottom edge, seen from below, as if lying in a forest looking up.

GBA Studio → Title screen can swap any layer for your own picture. Run:  python3 tools/make_title.py [--sky render.png]
"""
import math
import os
import random
import sys

from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'public', 'gba', 'title', 'builtin')


def sky_from(render):
    """The shader's picture at 240 x 160, its stars brightened into crisp points."""
    im = Image.open(render).convert('RGB')
    small = im.resize((240, 160), Image.BOX)
    blur = small.filter(ImageFilter.BoxBlur(2))
    px, bl = small.load(), blur.load()
    for y in range(160):
        for x in range(240):
            r, g, b = px[x, y]
            br, bg_, bb = bl[x, y]
            lift = (r + g + b - br - bg_ - bb) / 3
            # A faint point well above its surroundings (not Saturn or the moon, which are big and smooth): a star.
            if 6 < lift < 60:
                k = min(1.0, lift / 22)
                px[x, y] = tuple(int(c + (235 - c) * k) for c in (r, g, b))
    return small


def puff(im, cx, cy, rx, ry, col):
    for y in range(int(cy - ry), int(cy + ry) + 1):
        for x in range(int(cx - rx), int(cx + rx) + 1):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                im.putpixel((x % im.width, y), col)


def clouds():
    """Puffy clouds lit from above by the dusk, in a band that wraps left to right."""
    rnd = random.Random(16)
    W, H = 256, 160
    shadow, body, light = (92, 78, 132, 255), (138, 118, 172, 255), (196, 176, 214, 255)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    banks = [(92, 3, 15), (124, 3, 19)]   # rows (under Saturn and the moon): y, how many clouds, size
    for y0, n, size in banks:
        for k in range(n):
            cx = (k + 0.15 + rnd.random() * 0.5) * W / n
            cy = y0 + rnd.randint(-5, 5)
            w = size * rnd.uniform(1.4, 2.2)
            # Big rounded heaps in the middle, smaller ones trailing off to each side.
            blobs = []
            for _ in range(rnd.randint(5, 8)):
                off = rnd.uniform(-w, w)
                fall = 1 - abs(off) / (w * 1.4)
                r = size * rnd.uniform(0.45, 0.9) * fall
                blobs.append((cx + off, cy - r * 0.4 + rnd.uniform(-1, 1), max(2.5, r), max(2, r * 0.7)))
            for bx, by, rx, ry in blobs:   # the dark underside, a little lower
                puff(im, bx, by + 2, rx, ry, shadow)
            for bx, by, rx, ry in blobs:
                puff(im, bx, by, rx, ry * 0.85, body)
            for bx, by, rx, ry in blobs:   # light along the tops
                puff(im, bx - rx * 0.15, by - ry * 0.35, rx * 0.6, ry * 0.35, light)
    return im


def trees():
    """Pine tops seen from below: dark shapes rising from the bottom edge and leaning in towards the middle."""
    rnd = random.Random(7)
    W, H = 240, 160
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dark, rim = (14, 16, 34, 255), (40, 42, 82, 255)
    # (where it stands on the bottom edge, how tall, how wide its lowest boughs)
    pines = [(-14, 122, 40), (16, 100, 32), (44, 76, 24), (70, 54, 18), (100, 38, 14), (140, 40, 14), (170, 58, 18),
             (196, 80, 24), (222, 100, 32), (252, 118, 40)]
    for base, tall, wide in pines:
        lean = (W / 2 - base) / W * 0.55          # tops lean towards the middle of the sky
        tiers = max(4, tall // 14)
        for y in range(H - tall, H):
            depth = (y - (H - tall)) / tall          # 0 at the tip, 1 at the bottom
            cx = base + lean * (H - y)
            tier = depth * tiers
            jag = 0.55 + 0.45 * (tier - math.floor(tier))   # each tier flares out, then steps in
            half = max(0.5, wide * depth * jag * 0.5 + 1)
            for x in range(int(cx - half), int(cx + half) + 1):
                if 0 <= x < W:
                    im.putpixel((x, y), dark)
    # A faint rim of moonlight on the boughs' right edges.
    px = im.load()
    for y in range(H):
        for x in range(W - 1):
            if px[x, y][3] and not px[x + 1, y][3] and rnd.random() < 0.85:
                px[x, y] = rim
    return im


def main():
    os.makedirs(OUT, exist_ok=True)
    if '--sky' in sys.argv:
        sky_from(sys.argv[sys.argv.index('--sky') + 1]).save(os.path.join(OUT, 'sky.png'))
        print('  sky.png from the render')
    clouds().save(os.path.join(OUT, 'clouds.png'))
    trees().save(os.path.join(OUT, 'trees.png'))
    print(f'  wrote {OUT}')


if __name__ == '__main__':
    main()
