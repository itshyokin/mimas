"""
Mimas: the game for the ROM: battles, the party, items, shops and menus.

The editor works out the numbers with the game's own rules and writes public/data/gba_game.json when a GBA map is
saved (src/editor/gbaGame.ts), with the pictures the ROM needs in public/gba/enemies, heroes and items. This turns
them into the ROM's tables (game/include/mimas_game.h) and sprites, plus the menus' window tiles.

Everything is in the Database's order (items, enemies, heroes, Additions, spells), the same numbers the event
scripts use (tools/gba_events.py).
"""
import json
import os

from PIL import Image

from gba_events import additions_of, spells_of

STATS = ['str', 'dex', 'agi', 'end', 'def', 'mag', 'mdf']
SLOTS = ['weapon', 'shield', 'armor', 'accessory']   # what the ROM equips (others: none)
MAX_SPELLS = 16
MAX_ADDITIONS = 32

# The menus' and battles' colours: the text box palette (index 0-3 as before) and the health bars.
UI_PAL = [(255, 0, 255), (248, 248, 248), (48, 80, 144), (112, 144, 200),
          (64, 64, 72), (88, 208, 128), (248, 192, 64), (240, 80, 72), (160, 160, 168), (48, 48, 56), (72, 152, 240)] + [(0, 0, 0)] * 5


def c_str(text):
    text = ''.join(ch for ch in (text or '') if 32 <= ord(ch) < 127)
    return '"' + text.replace('\\', '\\\\').replace('"', '\\"') + '"'


def put_pal(im, pal):
    flat = []
    for c in pal:
        flat += list(c)
    flat += [0] * (768 - len(flat))
    im.putpalette(flat)


def write_json(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f)


def nearest(c, pal):
    return min(range(len(pal)), key=lambda i: sum((a - b) ** 2 for a, b in zip(c, pal[i])))


def sprite_from(img, size, gfx, name):
    """An RGBA picture as a size x size sprite (15 colours at most), bottom-centred. Writes <name>.bmp / .json."""
    img = img.convert('RGBA')
    if img.width > size or img.height > size:
        img.thumbnail((size, size), Image.NEAREST)
    pad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    pad.alpha_composite(img, ((size - img.width) // 2, size - img.height))
    opaque = [(r, g, b) for (r, g, b, a) in pad.getdata() if a >= 128]
    cols = sorted(set(opaque))
    if len(cols) > 15:
        sample = Image.new('RGB', (len(opaque), 1))
        sample.putdata(opaque)
        qp = sample.quantize(colors=15, method=Image.Quantize.MEDIANCUT).getpalette()[:45]
        cols = [tuple(qp[i:i + 3]) for i in range(0, len(qp), 3)]
    cols = cols or [(0, 0, 0)]
    cache = {}

    def idx(c):
        if c not in cache:
            cache[c] = 1 + nearest(c, cols)
        return cache[c]
    data = [0 if a < 128 else idx((r, g, b)) for (r, g, b, a) in pad.getdata()]
    out = Image.new('P', pad.size)
    out.putdata(data)
    put_pal(out, [(255, 0, 255)] + (cols + [(0, 0, 0)] * 15)[:15])
    out.save(os.path.join(gfx, name + '.bmp'))
    write_json(os.path.join(gfx, name + '.json'), {'type': 'sprite', 'height': size})


def stand_in(size, colour):
    """A plain shape for art the editor hasn't drawn yet (save the map in the editor to bake it)."""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    m = size // 4
    for y in range(m, size):
        for x in range(m, size - m):
            edge = x in (m, size - m - 1) or y in (m, size - 1)
            im.putpixel((x, y), (40, 40, 48, 255) if edge else colour)
    return im


def load_png(public, rel):
    path = os.path.join(public, rel)
    try:
        return Image.open(path).convert('RGBA') if os.path.exists(path) else None
    except OSError:
        return None


def ui_tiles(gfx):
    """
    The window pieces, 8 x 8 tiles in one column (the runtime draws boxes and health bars with them):
    0 empty, 1 white, 2-9 the frame (top-left, top, top-right, left, right, bottom-left, bottom, bottom-right),
    10-36 health bars (green, yellow, red; 0-8 pixels full), 37 a bar's left end, 38 its right end, 39 the dark line,
    40-48 the EXP bar, 49 / 50 its ends.
    """
    tiles = []

    def blank(v=0):
        return [[v] * 8 for _ in range(8)]
    tiles.append(blank(0))
    tiles.append(blank(1))
    # the frame: 2 px blue, 1 px light blue inside, rounded corners
    def frame(top, bottom, left, right):
        t = blank(1)
        for y in range(8):
            for x in range(8):
                dy = y if top else (7 - y if bottom else 9)
                dx = x if left else (7 - x if right else 9)
                d = min(dx, dy)
                if (top or bottom) and (left or right) and dx + dy < 2:
                    t[y][x] = 0
                elif d < 2 or ((top or bottom) and (left or right) and dx + dy < 4):
                    t[y][x] = 2
                elif d < 3:
                    t[y][x] = 3
        return t
    for top, bottom, left, right in ((1, 0, 1, 0), (1, 0, 0, 0), (1, 0, 0, 1), (0, 0, 1, 0), (0, 0, 0, 1), (0, 1, 1, 0), (0, 1, 0, 0), (0, 1, 0, 1)):
        tiles.append(frame(top, bottom, left, right))
    for colour in (5, 6, 7):
        for fill in range(9):
            t = blank(1)
            for x in range(8):
                t[2][x] = t[6][x] = 9
                for y in (3, 4, 5):
                    t[y][x] = colour if x < fill else 4
            tiles.append(t)
    left_end = blank(1)
    right_end = blank(1)
    for y in range(2, 7):
        left_end[y][7] = 9
        right_end[y][0] = 9
    tiles.append(left_end)
    tiles.append(right_end)
    line = blank(1)
    for x in range(8):
        line[4][x] = 9
    tiles.append(line)
    # 40-48 the EXP bar (thinner, blue; 0-8 pixels full), 49 its left end, 50 its right end
    for fill in range(9):
        t = blank(1)
        for x in range(8):
            t[2][x] = t[5][x] = 9
            for y in (3, 4):
                t[y][x] = 10 if x < fill else 4
        tiles.append(t)
    xl, xr = blank(1), blank(1)
    for y in range(2, 6):
        xl[y][7] = 9
        xr[y][0] = 9
    tiles.append(xl)
    tiles.append(xr)
    im = Image.new('P', (8, 8 * len(tiles)))
    for i, t in enumerate(tiles):
        for y in range(8):
            for x in range(8):
                im.putpixel((x, i * 8 + y), t[y][x])
    put_pal(im, UI_PAL)
    im.save(os.path.join(gfx, 'ui_tiles.bmp'))
    write_json(os.path.join(gfx, 'ui_tiles.json'), {'type': 'regular_bg_tiles', 'bpp_mode': 'bpp_4'})
    pal = Image.new('P', (16, 16))
    put_pal(pal, UI_PAL)
    pal.save(os.path.join(gfx, 'ui_palette.bmp'))
    write_json(os.path.join(gfx, 'ui_palette.json'), {'type': 'bg_palette', 'bpp_mode': 'bpp_4'})
    # the menu cursor: a dark triangle (8 x 8), in the text's palette (the two share one palette slot)
    cur = Image.new('P', (8, 8), 0)
    for y in range(7):
        for x in range(1 + min(y, 6 - y)):
            cur.putpixel((x + 1, y), 14)
    tp = [(255, 0, 255)] + [(0, 0, 0)] * 15
    tp[14], tp[12], tp[13] = (48, 48, 56), (200, 200, 208), (120, 120, 136)
    put_pal(cur, tp)
    cur.save(os.path.join(gfx, 'cursor.bmp'))
    write_json(os.path.join(gfx, 'cursor.json'), {'type': 'sprite', 'height': 8})


def clean(gfx):
    for f in os.listdir(gfx):
        if f.split('.')[0].startswith(('enemy_', 'hback_', 'hface_', 'icon_', 'ui_tiles', 'ui_palette', 'cursor', 'fx_', 'fxpal_', 'exclaim', 'elicon_', 'gender', 'rustle')):
            os.remove(os.path.join(gfx, f))


ELEMENTS = ['neutral', 'water', 'fire', 'nature', 'earth', 'shock', 'light', 'dark']
AILMENTS = ['poison', 'burn', 'paralyze', 'sleep', 'chill', 'confusion', 'blind', 'silence']
# A hit's five greys, and each element's colours for them (must match ELEMENT_RAMPS in src/gba/effects.ts).
HIT_GREYS = ['#f8f8f8', '#d0d0d8', '#a0a0b0', '#606070', '#303038']
ELEMENT_RAMPS = {
    'neutral': HIT_GREYS,
    'fire': ['#fff8c0', '#f8c040', '#f08020', '#c03010', '#601008'],
    'water': ['#e8f8ff', '#80c8f8', '#3880e0', '#2048a0', '#102050'],
    'nature': ['#f0ffd0', '#a0e060', '#50a830', '#286818', '#103008'],
    'earth': ['#f8e8c0', '#d0a060', '#a07038', '#604020', '#302010'],
    'shock': ['#ffffe0', '#f8f060', '#e0c020', '#a08010', '#504008'],
    'light': ['#ffffff', '#fff0a0', '#f8d850', '#c0a030', '#605018'],
    'dark': ['#e0c8f8', '#a070d0', '#6838a0', '#381860', '#180828'],
}


def hex_rgb(h):
    n = int(h.lstrip('#'), 16)
    return ((n >> 16) & 255, (n >> 8) & 255, n & 255)


def effect_sheets(public, gba, effects, gfx):
    """
    Each effect as a sprite (64 x 64, its frames one under another), in its GBA Studio palette's slots. Hits also get
    one palette per element (fxpal_<element>): the same slots with colours 1-5 swapped for the element's.
    """
    pals = {p['id']: p for p in gba.get('palettes', [])}
    sprites = {s['id']: s for s in gba.get('sprites', [])}
    made = []
    for k, e in enumerate(effects):
        sp = sprites.get(e['id'])
        img = load_png(public, e['image'])
        pal = pals.get(sp.get('palette')) if sp else None
        if img is None or not pal:
            made.append(None)
            continue
        cols = [hex_rgb(c) for c in pal['colors'][:15]]
        frames = max(1, min(6, int(e.get('frames', 6)), img.width // 64))
        out = Image.new('P', (64, 64 * frames), 0)
        src = img.load()
        for f in range(frames):
            for y in range(64):
                for x in range(64):
                    r, g, b, a = src[f * 64 + x, y]
                    if a >= 128:
                        out.putpixel((x, f * 64 + y), 1 + nearest((r, g, b), cols))
        put_pal(out, [(255, 0, 255)] + (cols + [(0, 0, 0)] * 15)[:15])
        out.save(os.path.join(gfx, f'fx_{k}.bmp'))
        write_json(os.path.join(gfx, f'fx_{k}.json'), {'type': 'sprite', 'height': 64})
        made.append({'frames': frames, 'hit': e.get('role') != 'burst', 'cols': cols})
    # element palettes for the hits (built from the first hit's palette)
    base = next((m['cols'] for m in made if m and m['hit']), [hex_rgb(c) for c in HIT_GREYS])
    for el in ELEMENTS:
        cols = list(base)
        for i, c in enumerate(ELEMENT_RAMPS[el]):
            if i < len(cols):
                cols[i] = hex_rgb(c)
        im = Image.new('P', (16, 16), 0)
        put_pal(im, [(255, 0, 255)] + (cols + [(0, 0, 0)] * 15)[:15])
        im.save(os.path.join(gfx, f'fxpal_{el}.bmp'))
        write_json(os.path.join(gfx, f'fxpal_{el}.json'), {'type': 'sprite_palette', 'bpp_mode': 'bpp_4'})
    return made


def exclaim_sprite(gfx):
    """A trainer's (!) bubble, 16 x 16."""
    im = Image.new('P', (16, 16), 0)
    for y in range(1, 15):
        for x in range(3, 13):
            edge = y in (1, 14) or x in (3, 12)
            im.putpixel((x, y), 2 if edge else 1)
    for y in range(3, 10):
        im.putpixel((7, y), 3)
        im.putpixel((8, y), 3)
    for y in (11, 12):
        im.putpixel((7, y), 3)
        im.putpixel((8, y), 3)
    put_pal(im, [(255, 0, 255), (248, 248, 248), (48, 48, 56), (208, 48, 48)] + [(0, 0, 0)] * 12)
    im.save(os.path.join(gfx, 'exclaim.bmp'))
    write_json(os.path.join(gfx, 'exclaim.json'), {'type': 'sprite', 'height': 16})


# The gender symbols on a hero's panel, 8 x 8: male (blue), female (red).
GENDER_ART = [
    ['....###.', '.....##.', '....#.#.', '.###....', '#...#...', '#...#...', '#...#...', '.###....'],
    ['..###...', '.#...#..', '.#...#..', '.#...#..', '..###...', '...#....', '..###...', '...#....'],
]


def gender_sprite(gfx):
    im = Image.new('P', (8, 16), 0)
    for f, art in enumerate(GENDER_ART):
        for y, line in enumerate(art):
            for x, ch in enumerate(line):
                if ch == '#':
                    im.putpixel((x, f * 8 + y), 1 + f)
    put_pal(im, [(255, 0, 255), (48, 112, 216), (216, 64, 72)] + [(0, 0, 0)] * 13)
    im.save(os.path.join(gfx, 'gender.bmp'))
    write_json(os.path.join(gfx, 'gender.json'), {'type': 'sprite', 'height': 8})


def element_icons(public, gfx):
    """Saturn's element icons (baked into public/gba/icons/el_<element>.png), one 16 x 16 sprite each."""
    for k, el in enumerate(ELEMENTS):
        img = load_png(public, f'gba/icons/el_{el}.png')
        sprite_from(img or stand_in(14, (200, 200, 200, 255)), 16, gfx, f'elicon_{k}')


def rustle_sprite(public, gba, gfx):
    """Tall grass rustling (the tall grass tile's second frame), 16 x 16, shown where the player steps in."""
    t = next((x for x in gba.get('tiles', []) if x.get('type') == 'tallgrass'), None)
    img = load_png(public, t['image']) if t else None
    frame = img.crop((16, 0, 32, 16)) if img is not None and img.width >= 32 else Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    if not any(a for (_, _, _, a) in frame.getdata()):
        frame.putpixel((0, 15), (0, 0, 0, 255))   # never empty (a sprite needs a colour)
    sprite_from(frame, 16, gfx, 'rustle')


def sounds_out(public, root, sounds):
    """The baked sounds into game/audio (Maxmod): sfx_<name>.wav. Returns {name: item id}."""
    adir = os.path.join(root, 'game', 'audio')
    os.makedirs(adir, exist_ok=True)
    for f in os.listdir(adir):
        if f.startswith('sfx_'):
            os.remove(os.path.join(adir, f))
    ids = {}
    for snd in sounds:
        name, rel = snd['name'], snd['file']
        path = os.path.join(public, rel)
        if not os.path.exists(path):
            continue
        sid = 'sfx_' + ''.join(ch if ch.isalnum() else '_' for ch in os.path.splitext(os.path.basename(rel))[0]).lower()
        if sid in ids.values():
            ids[name] = sid
            continue
        with open(path, 'rb') as src, open(os.path.join(adir, sid + '.wav'), 'wb') as dst:
            dst.write(src.read())
        ids[name] = sid
    return ids


def export(root, public, data, gfx, inc, db, gba, maps, comp):
    """Writes the game's sprites and game/include/mimas_game.h. `maps`: the exported maps (with their Saturn data)."""
    clean(gfx)
    try:
        with open(os.path.join(data, 'gba_game.json')) as f:
            game = json.load(f)
    except (OSError, ValueError):
        game = None
        print('  no gba_game.json yet (open the editor and save a GBA map): battles use stand-in numbers')
    game = game or {}
    items = game.get('items') or [{'id': it.get('id'), 'name': it.get('name', '?'), 'kind': it.get('kind', 'material')} for it in db.get('items', [])]
    enemies = game.get('enemies') or [{'id': e.get('id'), 'name': e.get('name', '?'), 'hp': e.get('hp', 10), 'attack': e.get('damage', 5), 'xp': e.get('xp', 0)} for e in db.get('enemies', [])]
    heroes = game.get('heroes') or [{'id': h.get('id'), 'name': h.get('name', 'Hero'), 'first': i == 0, 'startsInParty': i == 0} for i, h in enumerate(db.get('heroes') or [{'id': 'hero', 'name': 'Hero'}])]
    additions = game.get('additions') or [{'id': a.get('id'), 'name': a.get('name', a.get('id')), 'hits': 1, 'power': 1} for a in additions_of(db)]
    spells = game.get('spells') or [{'id': s.get('id'), 'name': s.get('name', s.get('id')), 'kind': 'bolt', 'ranks': [{'power': 10, 'mp': 5}]} for s in spells_of(db)]
    troops = game.get('troops') or [{'id': t.get('id'), 'members': t.get('members', []), 'pick': t.get('pick', 'all'), 'noRun': t.get('noRun', False)} for t in db.get('troops', [])]
    add_index = {a['id']: i for i, a in enumerate(additions)}
    spell_index = {s['id']: i for i, s in enumerate(spells)}
    item_index = {it['id']: i for i, it in enumerate(items)}
    enemy_index = {e['id']: i for i, e in enumerate(enemies)}
    troop_index = {t['id']: i for i, t in enumerate(troops)}
    if len(additions) > MAX_ADDITIONS:
        print(f'  more than {MAX_ADDITIONS} Additions: the ROM keeps the first {MAX_ADDITIONS}')
        additions = additions[:MAX_ADDITIONS]
    if len(spells) > MAX_SPELLS:
        print(f'  more than {MAX_SPELLS} spells: the ROM keeps the first {MAX_SPELLS}')
        spells = spells[:MAX_SPELLS]

    ui_tiles(gfx)
    missing = []
    for k, e in enumerate(enemies):
        img = load_png(public, f'gba/enemies/{e["id"]}.png')
        if img is None:
            missing.append(e['name'])
        sprite_from(img or stand_in(64, (120, 200, 120, 255)), 64, gfx, f'enemy_{k}')
    # the hero you play: GBA Studio's backsprite when there is one
    gba_back = next((s for s in gba.get('sprites', []) if s.get('kind') == 'backsprite'), None)
    for k, h in enumerate(heroes):
        back = None
        if h.get('first') and gba_back:
            back = load_png(public, gba_back['image'])
            if back is not None:
                back = back.crop((0, 0, min(64, back.width), min(64, back.height)))
        back = back or load_png(public, f'gba/heroes/{h["id"]}_back.png')
        face = load_png(public, f'gba/heroes/{h["id"]}_face.png')
        if back is None or face is None:
            missing.append(h['name'])
        sprite_from(back or stand_in(64, (200, 200, 220, 255)), 64, gfx, f'hback_{k}')
        sprite_from(face or stand_in(16, (200, 200, 220, 255)), 16, gfx, f'hface_{k}')
    for k, it in enumerate(items):
        icon = load_png(public, f'gba/items/{it["id"]}.png')
        sprite_from(icon or stand_in(16, (220, 180, 120, 255)), 16, gfx, f'icon_{k}')
    if missing:
        print(f'  battle art not baked yet (save a GBA map in the editor): {", ".join(missing[:8])}{"…" if len(missing) > 8 else ""}')
    effects = game.get('effects') or []
    fx_made = effect_sheets(public, gba, effects, gfx)
    fx_index = {e['id']: k for k, e in enumerate(effects) if fx_made[k]}
    exclaim_sprite(gfx)
    gender_sprite(gfx)
    rustle_sprite(public, gba, gfx)
    element_icons(public, gfx)
    snd_ids = sounds_out(public, root, game.get('sounds') or [])
    snd_names = list(snd_ids.keys())
    snd_index = {n: i for i, n in enumerate(snd_names)}
    if snd_names:
        print(f'  sounds: {len(set(snd_ids.values()))}')

    out = []
    w = out.append
    w('// Generated by tools/gba_game.py from public/data - do not edit.\n')
    w('#ifndef MIMAS_GAME_H\n#define MIMAS_GAME_H\n\n#include <cstdint>\n#include "bn_sprite_item.h"\n#include "bn_sprite_palette_item.h"\n#include "bn_sound_item.h"\n')
    if snd_ids:
        w('#include "bn_sound_items.h"\n')
    for k, m in enumerate(fx_made):
        if m:
            w(f'#include "bn_sprite_items_fx_{k}.h"\n')
    for el in ELEMENTS:
        w(f'#include "bn_sprite_palette_items_fxpal_{el}.h"\n')
    w('#include "bn_sprite_items_exclaim.h"\n')
    w('#include "bn_sprite_items_gender.h"\n')
    w('#include "bn_sprite_items_rustle.h"\n')
    for k in range(len(ELEMENTS)):
        w(f'#include "bn_sprite_items_elicon_{k}.h"\n')
    for k in range(len(enemies)):
        w(f'#include "bn_sprite_items_enemy_{k}.h"\n')
    for k in range(len(heroes)):
        w(f'#include "bn_sprite_items_hback_{k}.h"\n#include "bn_sprite_items_hface_{k}.h"\n')
    for k in range(len(items)):
        w(f'#include "bn_sprite_items_icon_{k}.h"\n')
    w('\nnamespace mimas\n{\n')
    w('// Stats, in this order: Strength, Dexterity, Agility, Endurance, Defence, Magic, Magic Defence.\n')
    w('enum stat { STR, DEX, AGI, END, DEF, MAG, MDF };\n')
    w('// Gear slots the ROM equips.\nenum slot { WEAPON, SHIELD, ARMOR, ACCESSORY };\n')
    w(f'constexpr int max_spells = {MAX_SPELLS};\nconstexpr int max_additions = {MAX_ADDITIONS};\n\n')
    w(f'// Types (elements) and ailments, in this order.\nconstexpr int element_count = {len(ELEMENTS)};\nconstexpr int ailment_count = {len(AILMENTS)};\n')
    w('enum ailment { POISON, BURN, PARALYZE, SLEEP, CHILL, CONFUSION, BLIND, SILENCE };\n')
    w('constexpr const bn::sprite_item* element_icons[] = { ' + ', '.join(f'&bn::sprite_items::elicon_{k}' for k in range(len(ELEMENTS))) + ' };\n')
    w('constexpr const char* element_names[] = { ' + ', '.join(c_str(e.upper()) for e in ELEMENTS) + ' };\n')
    w('// How much (%) an element does to each element.\n')
    chart = game.get('chart') or [[100] * len(ELEMENTS) for _ in ELEMENTS]
    w('constexpr int16_t chart[element_count][element_count] = {\n    ' + ',\n    '.join('{ ' + ', '.join(str(int(round(float(v) * 100 if float(v) < 20 else float(v)))) for v in row) + ' }' for row in chart) + '\n};\n')
    w('// A move: an Addition (>= 0) or a spell (-(spell + 1)); a moveset: the moves from a level on.\n')
    w('struct moveset { uint8_t level; uint8_t count; int16_t moves[4]; };\n')
    w('// An effect: its sprite (64 x 64 frames), frames, whether it\'s a hit (recoloured by element), its sound (-1 none).\n')
    w('struct effect_def { const bn::sprite_item* sprite; uint8_t frames; bool hit; int16_t sound; };\n')
    w('struct hero_def { const char* name; int16_t stats[7]; int8_t gains[7]; int8_t moves[4]; uint8_t move_count; uint8_t spells[max_spells];\n'
      '    int16_t gear[4]; bool starts; uint8_t join_level; bool no_additions; const bn::sprite_item* back; const bn::sprite_item* face; int8_t elements[2];\n'
      '    int8_t gender; };   // gender: 0 male, 1 female, -1 none shown\n')
    w('// power: the strikes\' powers added up, x100. inflict: an ailment (-1 none) and its chance. hit / burst: effects (-1 none).\n')
    w('struct addition_def { const char* name; const char* description; uint8_t hits; int16_t power; int8_t element; int8_t inflict; uint8_t chance; int8_t hit; int8_t burst;\n'
      '    int16_t mp; int8_t guard; };   // guard: a guarding move\'s health back in % (-1: not a guard)\n')
    w('struct spell_rank { int16_t power; int16_t mp; };\n')
    w('// kind: 0 damage, 1 heal, 2 support (the ROM casts it as a small heal for now). power x10.\n')
    w('struct spell_def { const char* name; const char* description; uint8_t kind; bool all; uint8_t rank_count; spell_rank ranks[5];\n'
      '    int8_t element; int8_t inflict; uint8_t chance; int8_t hit; int8_t burst; };\n')
    w('// kind: 0 usable (restores), 1 key item, 2 gear, 3 other. slot: -1 none, else enum slot. attack x100.\n')
    w('struct item_def { const char* name; const char* description; uint8_t kind; int8_t slot; int16_t price; bool no_sell;\n'
      '    int16_t hp; int16_t mp; int16_t hp_pct; int16_t mp_pct; bool revive; int16_t attack; int16_t defense; int16_t magic_defense;\n'
      '    int8_t bonus[7]; int8_t crit; const bn::sprite_item* icon; };\n')
    w('// attack x100.\n')
    w('// elements: up to two (-1 none); immune / absorb: element bits; resists: ailment bits; movesets: by level (the first is\n'
      '// its own moves, level 0); element / inflict: its plain hit\'s.\n')
    w('struct enemy_def { const char* name; uint8_t level; int16_t hp; int16_t attack; bool magic; int16_t defense; int16_t magic_defense;\n'
      '    int16_t agility; int16_t crit; int16_t xp; int16_t gold_min; int16_t gold_max; bool boss; const bn::sprite_item* sprite;\n'
      '    int8_t elements[2]; uint8_t immune; uint8_t absorb; uint8_t resists; int16_t mp; int8_t element; int8_t inflict; uint8_t chance;\n'
      '    const moveset* movesets; uint8_t moveset_count; };\n')
    w('struct troop_member { int16_t enemy; uint8_t min; uint8_t max; };\n')
    w('struct troop_def { const troop_member* members; uint8_t count; bool random; bool no_run; };\n\n')

    def i16(v):
        return max(-32768, min(32767, int(round(v))))

    el_index = {e: i for i, e in enumerate(ELEMENTS)}
    ail_index = {a: i for i, a in enumerate(AILMENTS)}

    def inflict_of(o):
        l = [x for x in (o.get('inflicts') or []) if x.get('ailment') in ail_index]
        return (ail_index[l[0]['ailment']], int(l[0].get('chance', 0))) if l else (-1, 0)

    def fx_of(i):
        return fx_index.get(i, -1) if i else -1

    def move_code(r):
        if r.get('addition') in add_index and add_index[r['addition']] < MAX_ADDITIONS:
            return add_index[r['addition']]
        if r.get('spell') in spell_index and spell_index[r['spell']] < MAX_SPELLS:
            return -(spell_index[r['spell']] + 1)
        return None

    def moves_c(refs_):
        codes = [c for c in (move_code(r) for r in (refs_ or [])) if c is not None][:4]
        return len(codes), '{ ' + ', '.join(str(c) for c in (codes + [0] * 4)[:4]) + ' }'

    # sounds and effects
    w('constexpr const bn::sound_item* sounds[] = { ' + (', '.join(f'&bn::sound_items::{snd_ids[n]}' for n in snd_names) or 'nullptr') + ' };\n')
    w(f'constexpr int sound_count = {len(snd_names)};\n')
    for n in ['menuMove', 'menuOk', 'menuBack', 'encounter', 'hit', 'weak', 'thump', 'crit', 'defeat', 'levelUp', 'item', 'coin', 'save', 'target', 'dodge', 'jump', 'expDing', 'swing', 'rustle']:
        w(f'constexpr int snd_{n} = {snd_index.get(n, -1)};\n')
    erow = []
    for k, e in enumerate(effects):
        m = fx_made[k]
        if not m:
            erow.append('{ nullptr, 0, false, -1 }')
        else:
            erow.append(f'{{ &bn::sprite_items::fx_{k}, {m["frames"]}, {"true" if m["hit"] else "false"}, {snd_index.get(e.get("sound") or "", -1)} }}')
    w('constexpr effect_def effects[] = {\n    ' + (',\n    '.join(erow) or '{ nullptr, 0, false, -1 }') + '\n};\n')
    w('constexpr const bn::sprite_palette_item* effect_palettes[] = { ' + ', '.join(f'&bn::sprite_palette_items::fxpal_{el}' for el in ELEMENTS) + ' };\n')
    w(f'constexpr int fx_hit_plain = {fx_index.get("fx_hit", -1)};\n')
    w(f'constexpr int fx_sparkle = {fx_index.get("fx_sparkle", -1)};\n\n')

    # heroes
    rows = []
    for k, h in enumerate(heroes):
        st = h.get('stats') or {}
        gn = h.get('gains') or {}
        mv = [add_index[m] for m in h.get('moves', []) if m in add_index][:4]
        sp = [0] * MAX_SPELLS
        for sid, rank in (h.get('spells') or {}).items():
            if sid in spell_index and spell_index[sid] < MAX_SPELLS:
                sp[spell_index[sid]] = max(0, min(5, int(rank or 0)))
        # Spells they start with are moves too (FIGHT holds both), in the free slots.
        mv += [-(i + 1) for i, r in enumerate(sp) if r > 0][:max(0, 4 - len(mv))]
        gear = [item_index.get((h.get('gear') or {}).get(s), -1) for s in SLOTS]
        rows.append(f'{{ {c_str(h.get("name"))}, {{ {", ".join(str(i16(st.get(s, 10))) for s in STATS)} }}, {{ {", ".join(str(int(gn.get(s, 2))) for s in STATS)} }}, '
                    f'{{ {", ".join(str(x) for x in (mv + [-1] * 4)[:4])} }}, {len(mv)}, {{ {", ".join(str(x) for x in sp)} }}, {{ {", ".join(str(x) for x in gear)} }}, '
                    f'{"true" if h.get("startsInParty") else "false"}, {int(h.get("joinLevel", 0) or 0)}, {"true" if h.get("noAdditions") else "false"}, '
                    f'&bn::sprite_items::hback_{k}, &bn::sprite_items::hface_{k}, '
                    f'{{ {", ".join(str(el_index.get(x, -1)) for x in ((h.get("elements") or []) + [None, None])[:2])} }}, '
                    f'{ {"male": 0, "transman": 0, "female": 1, "transwoman": 1}.get(h.get("gender"), -1) } }}')
    w('constexpr hero_def heroes[] = {\n    ' + ',\n    '.join(rows) + '\n};\n')
    w(f'constexpr int hero_count = {len(heroes)};\n\n')

    arows = []
    for a in additions:
        inf, ch = inflict_of(a)
        arows.append(f'{{ {c_str(a.get("name"))}, {c_str(a.get("description", ""))}, {int(a.get("hits", 1))}, {i16(float(a.get("power", 1)) * 100)}, '
                     f'{el_index.get(a.get("element") or "neutral", 0)}, {inf}, {ch}, {fx_of(a.get("hit", "fx_slash"))}, {fx_of(a.get("burst"))}, '
                     f'{i16(a.get("mp", 0) or 0)}, {int(a["guard"]) if a.get("guard") is not None else -1} }}')
    w('constexpr addition_def additions[] = {\n    ' + (',\n    '.join(arows) or '{ "", "", 1, 100, 0, -1, 0, -1, -1, 0, -1 }') + '\n};\n')
    w(f'constexpr int addition_count = {len(additions)};\n')
    srows = []
    for s in spells:
        ranks = (s.get('ranks') or [{'power': 10, 'mp': 5}])[:5]
        kind = {'bolt': 0, 'heal': 1}.get(s.get('kind'), 2)
        rk = ', '.join(f'{{ {i16(float(r.get("power", 0)) * 10)}, {i16(r.get("mp", 0))} }}' for r in ranks)
        inf, ch = inflict_of(s)
        srows.append(f'{{ {c_str(s.get("name"))}, {c_str(s.get("description", ""))}, {kind}, {"true" if s.get("targets") == "all" else "false"}, {len(ranks)}, {{ {rk} }}, '
                     f'{el_index.get(s.get("element") or "neutral", 0)}, {inf}, {ch}, {fx_of(s.get("hit"))}, {fx_of(s.get("burst"))} }}')
    w('constexpr spell_def spells[] = {\n    ' + (',\n    '.join(srows) or '{ "", "", 0, false, 1, { { 0, 0 } }, 0, -1, 0, -1, -1 }') + '\n};\n')
    w(f'constexpr int spell_count = {len(spells)};\n\n')

    irows = []
    for k, it in enumerate(items):
        kind = 2 if it.get('slot') else 1 if it.get('kind') == 'key' else 0 if (it.get('hp') or it.get('mp') or it.get('hpPct') or it.get('mpPct') or it.get('revive')) else 3
        slot = SLOTS.index(it['slot']) if it.get('slot') in SLOTS else -1
        if it.get('slot') and slot < 0:
            kind = 3   # bows, spell shards…: not on the GBA yet
        b = it.get('bonus') or {}
        irows.append(f'{{ {c_str(it.get("name"))}, {c_str(it.get("description", ""))}, {kind}, {slot}, {i16(it.get("price", 0))}, {"true" if it.get("noSell") else "false"}, '
                     f'{i16(it.get("hp", 0))}, {i16(it.get("mp", 0))}, {i16(it.get("hpPct", 0))}, {i16(it.get("mpPct", 0))}, {"true" if it.get("revive") else "false"}, '
                     f'{i16(float(it.get("attack", 0)) * 100)}, {i16(it.get("defense", 0))}, {i16(it.get("magicDefense", 0))}, '
                     f'{{ {", ".join(str(max(-128, min(127, int(b.get(s, 0))))) for s in STATS)} }}, {max(-128, min(127, int(it.get("crit", 0))))}, &bn::sprite_items::icon_{k} }}')
    w('constexpr item_def items[] = {\n    ' + (',\n    '.join(irows) or '{ "", "", 3, -1, 0, false, 0, 0, 0, 0, false, 0, 0, 0, { 0, 0, 0, 0, 0, 0, 0 }, 0, nullptr }') + '\n};\n\n')

    erows = []
    for k, e in enumerate(enemies):
        sets = [(0, e.get('moves') or [])] + [(int(ms.get('level', 1)), ms.get('moves') or []) for ms in (e.get('movesets') or [])]
        w(f'constexpr moveset enemy{k}_movesets[] = {{ ' + ', '.join(f'{{ {lv}, {n}, {mc} }}' for lv, (n, mc) in ((lv, moves_c(r)) for lv, r in sets)) + ' };\n')
    for k, e in enumerate(enemies):
        gold = e.get('gold') or [0, 0]
        els = [el_index.get(x, -1) for x in ((e.get('elements') or []) + [None, None])[:2]]
        mask = lambda l, idx: sum(1 << idx[x] for x in (l or []) if x in idx)
        inf, ch = inflict_of(e)
        extra = (f', {{ {els[0]}, {els[1]} }}, {mask(e.get("immune"), el_index)}, {mask(e.get("absorb"), el_index)}, {mask(e.get("resists"), ail_index)}, '
                 f'{i16(e.get("mp", 0))}, {el_index.get(e.get("element") or "neutral", 0)}, {inf}, {ch}, enemy{k}_movesets, {1 + len(e.get("movesets") or [])}')
        erows.append(f'{{ {c_str(e.get("name"))}, {max(1, min(99, int(e.get("level", 1))))}, {i16(e.get("hp", 10))}, {i16(float(e.get("attack", 5)) * 100)}, {"true" if e.get("magic") else "false"}, '
                     f'{i16(e.get("defense", 0))}, {i16(e.get("magicDefense", 0))}, {i16(e.get("agility", 10))}, {i16(e.get("crit", 5))}, {i16(e.get("xp", 0))}, '
                     f'{i16(gold[0])}, {i16(gold[-1])}, {"true" if e.get("boss") else "false"}, &bn::sprite_items::enemy_{k}{extra} }}')
    w('constexpr enemy_def enemies[] = {\n    ' + (',\n    '.join(erows) or '{ "", 1, 1, 100, false, 0, 0, 10, 5, 0, 0, 0, false, nullptr, { -1, -1 }, 0, 0, 0, 0, 0, -1, 0, nullptr, 0 }') + '\n};\n')
    growth = game.get('enemyGrowth') or {'hp': 12, 'attack': 7, 'defense': 6, 'xp': 12, 'gold': 8}
    w('// Each level an enemy is above (or below) its own: these % more (or less) health, attack, defence, EXP and gold.\n')
    w(f'constexpr int growth_hp = {int(growth.get("hp", 12))}, growth_attack = {int(growth.get("attack", 7))}, growth_defense = {int(growth.get("defense", 6))}, '
      f'growth_xp = {int(growth.get("xp", 12))}, growth_gold = {int(growth.get("gold", 8))};\n')
    # moves given to one fight (Start battle, trainers), and the trainers
    w('constexpr moveset custom_moves[] = { ' + (', '.join(f'{{ 0, {n}, {mc} }}' for n, mc in (moves_c(r) for r in comp.custom_moves)) or '{ 0, 0, { 0, 0, 0, 0 } }') + ' };\n')
    w('struct foe_def { int16_t enemy; uint8_t level; int16_t moves; };\n')
    w('struct trainer_def { uint8_t range; uint8_t beaten; int16_t gold; int16_t intro; int16_t lose; const foe_def* team; uint8_t count; };\n')
    for k, t in enumerate(comp.trainers):
        w(f'constexpr foe_def trainer{k}_team[] = {{ ' + ', '.join(f'{{ {a}, {b}, {c} }}' for a, b, c in t[5]) + ' };\n')
    w('constexpr trainer_def trainers[] = { ' + (', '.join(f'{{ {t[0]}, {t[1]}, {t[2]}, {t[3]}, {t[4]}, trainer{k}_team, {len(t[5])} }}' for k, t in enumerate(comp.trainers)) or '{ 0, 0, 0, -1, -1, nullptr, 0 }') + ' };\n')
    w(f'constexpr int enemy_count = {len(enemies)};\n\n')

    for k, t in enumerate(troops):
        ms = [(enemy_index[m['enemy']], int(m.get('min', 1)), int(m.get('max', m.get('min', 1)))) for m in t.get('members', []) if m.get('enemy') in enemy_index]
        w(f'constexpr troop_member troop{k}_members[] = {{ ' + (', '.join(f'{{ {a}, {b}, {max(b, c)} }}' for a, b, c in ms) or '{ -1, 0, 0 }') + ' };\n')
        t['_count'] = len(ms)
    w('constexpr troop_def troops[] = {\n    ' + (',\n    '.join(
        f'{{ troop{k}_members, {t["_count"]}, {"true" if t.get("pick") == "random" else "false"}, {"true" if t.get("noRun") else "false"} }}' for k, t in enumerate(troops)) or '{ nullptr, 0, false, false }') + '\n};\n\n')

    # Random battles: each map's zones (Encounters layer), and its own table where no zone is painted.
    w('// A zone\'s picks: troop >= 0, or -(enemy + 1) for a map table entry; table: n = min … max foes, each picked by weight.\n')
    w('struct zone_pick { int16_t troop; uint8_t weight; };\n')
    w('struct zone_def { uint8_t steps; const zone_pick* picks; uint8_t count; bool table; uint8_t min; uint8_t max; };\n')
    zone_infos = []
    for i, m in enumerate(maps):
        sm = m.get('saturn') or {}
        W, H = m['W'], m['H']
        zones = []      # (steps, picks, table, min, max)
        letter_zone = {}
        for letter, z in (sm.get('zones') or {}).items():
            picks = [(troop_index[t['troop']], int(t.get('weight', 1) or 1)) for t in z.get('troops', []) if t.get('troop') in troop_index]
            if picks:
                letter_zone[letter] = len(zones) + 1
                zones.append((int(z.get('steps', 30) or 30), picks, False, 1, 1))
        table = sm.get('encounters') or {}
        tz = 0
        tpicks = [(-(enemy_index[e['enemy']] + 1), int(e.get('weight', 1) or 1)) for e in table.get('enemies', []) if e.get('enemy') in enemy_index]
        if tpicks:
            tz = len(zones) + 1
            zones.append((int(table.get('steps', 30) or 30), tpicks, True, int(table.get('min', 1) or 1), int(table.get('max', 1) or 1)))
        grid = sm.get('zoneGrid') or []
        cells = []
        for y in range(H):
            row = grid[y] if y < len(grid) else ''
            for x in range(W):
                ch = row[x] if x < len(row) else '.'
                cells.append(letter_zone.get(ch, tz))
        w(f'constexpr uint8_t map{i}_zone_grid[] = {{ {", ".join(str(c) for c in cells)} }};\n')
        for k, (steps, picks, tbl, mn, mx) in enumerate(zones):
            w(f'constexpr zone_pick map{i}_zone{k}_picks[] = {{ ' + ', '.join(f'{{ {a}, {b} }}' for a, b in picks) + ' };\n')
        w(f'constexpr zone_def map{i}_zones[] = {{ ' + (', '.join(
            f'{{ {max(1, min(255, s))}, map{i}_zone{k}_picks, {len(p)}, {"true" if tb else "false"}, {mn}, {max(mn, mx)} }}' for k, (s, p, tb, mn, mx) in enumerate(zones)) or '{ 0, nullptr, 0, false, 0, 0 }') + ' };\n')
        zone_infos.append((f'map{i}_zone_grid', f'map{i}_zones', len(zones)))
    w('struct map_zones { const uint8_t* grid; const zone_def* zones; int count; };\n')
    w('constexpr map_zones zones[] = {\n    ' + ',\n    '.join(f'{{ {g}, {z}, {n} }}' for g, z, n in zone_infos) + '\n};\n\n')

    xp = game.get('xp') or [int(60 * 1.15 ** (l - 1)) for l in range(1, 50)]
    w('// EXP to the next level, from level 1.\n')
    w('constexpr int32_t xp_table[] = { ' + ', '.join(str(int(x)) for x in xp) + ' };\n')
    w(f'constexpr int max_level = {len(xp) + 1};\n')
    base = game.get('base') or {'hp': 100, 'mp': 100}
    w(f'constexpr int base_hp = {int(base.get("hp", 100))};\nconstexpr int base_mp = {int(base.get("mp", 100))};\n')
    w(f'constexpr int unarmed_attack = {i16(float(game.get("unarmed", 3)) * 100)};   // x100\n')
    w(f'constexpr int party_damage = {i16(float(game.get("partyDamage", 1)) * 100)};   // %\n')
    w(f'constexpr int enemy_damage = {i16(float(game.get("enemyDamage", 1)) * 100)};   // %\n')
    w(f'constexpr int flee_chance = {int(game.get("flee", 50))};\n')
    w(f'// Additions past four: forget one (Pokemon), or keep them all and equip four (Party > Moves).\n')
    w(f'constexpr bool equip_moves = {"true" if game.get("moveSlots") == "equip" else "false"};\n')
    w('}\n\n#endif\n')
    with open(os.path.join(inc, 'mimas_game.h'), 'w') as f:
        f.write(''.join(out))
    print(f'  game: {len(heroes)} heroes, {len(additions)} Additions, {len(spells)} spells, {len(items)} items, {len(enemies)} enemies, {len(troops)} troops')
