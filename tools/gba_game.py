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
          (64, 64, 72), (88, 208, 128), (248, 192, 64), (240, 80, 72), (160, 160, 168), (48, 48, 56)] + [(0, 0, 0)] * 6


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
    10-36 health bars (green, yellow, red; 0-8 pixels full), 37 a bar's left end, 38 its right end, 39 the dark line.
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
        if f.split('.')[0].startswith(('enemy_', 'hback_', 'hface_', 'icon_', 'ui_tiles', 'ui_palette', 'cursor')):
            os.remove(os.path.join(gfx, f))


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

    out = []
    w = out.append
    w('// Generated by tools/gba_game.py from public/data - do not edit.\n')
    w('#ifndef MIMAS_GAME_H\n#define MIMAS_GAME_H\n\n#include <cstdint>\n#include "bn_sprite_item.h"\n')
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
    w('struct hero_def { const char* name; int16_t stats[7]; int8_t gains[7]; int8_t moves[4]; uint8_t move_count; uint8_t spells[max_spells];\n'
      '    int16_t gear[4]; bool starts; uint8_t join_level; bool no_additions; const bn::sprite_item* back; const bn::sprite_item* face; };\n')
    w('// power: the strikes\' powers added up, x100.\n')
    w('struct addition_def { const char* name; const char* description; uint8_t hits; int16_t power; };\n')
    w('struct spell_rank { int16_t power; int16_t mp; };\n')
    w('// kind: 0 damage, 1 heal, 2 support (the ROM casts it as a small heal for now). power x10.\n')
    w('struct spell_def { const char* name; const char* description; uint8_t kind; bool all; uint8_t rank_count; spell_rank ranks[5]; };\n')
    w('// kind: 0 usable (restores), 1 key item, 2 gear, 3 other. slot: -1 none, else enum slot. attack x100.\n')
    w('struct item_def { const char* name; const char* description; uint8_t kind; int8_t slot; int16_t price; bool no_sell;\n'
      '    int16_t hp; int16_t mp; int16_t hp_pct; int16_t mp_pct; bool revive; int16_t attack; int16_t defense; int16_t magic_defense;\n'
      '    int8_t bonus[7]; int8_t crit; const bn::sprite_item* icon; };\n')
    w('// attack x100.\n')
    w('struct enemy_def { const char* name; uint8_t level; int16_t hp; int16_t attack; bool magic; int16_t defense; int16_t magic_defense;\n'
      '    int16_t agility; int16_t crit; int16_t xp; int16_t gold_min; int16_t gold_max; bool boss; const bn::sprite_item* sprite; };\n')
    w('struct troop_member { int16_t enemy; uint8_t min; uint8_t max; };\n')
    w('struct troop_def { const troop_member* members; uint8_t count; bool random; bool no_run; };\n\n')

    def i16(v):
        return max(-32768, min(32767, int(round(v))))

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
        gear = [item_index.get((h.get('gear') or {}).get(s), -1) for s in SLOTS]
        rows.append(f'{{ {c_str(h.get("name"))}, {{ {", ".join(str(i16(st.get(s, 10))) for s in STATS)} }}, {{ {", ".join(str(int(gn.get(s, 2))) for s in STATS)} }}, '
                    f'{{ {", ".join(str(x) for x in (mv + [-1] * 4)[:4])} }}, {len(mv)}, {{ {", ".join(str(x) for x in sp)} }}, {{ {", ".join(str(x) for x in gear)} }}, '
                    f'{"true" if h.get("startsInParty") else "false"}, {int(h.get("joinLevel", 0) or 0)}, {"true" if h.get("noAdditions") else "false"}, '
                    f'&bn::sprite_items::hback_{k}, &bn::sprite_items::hface_{k} }}')
    w('constexpr hero_def heroes[] = {\n    ' + ',\n    '.join(rows) + '\n};\n')
    w(f'constexpr int hero_count = {len(heroes)};\n\n')

    w('constexpr addition_def additions[] = {\n    ' + (',\n    '.join(
        f'{{ {c_str(a.get("name"))}, {c_str(a.get("description", ""))}, {int(a.get("hits", 1))}, {i16(float(a.get("power", 1)) * 100)} }}' for a in additions) or '{ "", "", 1, 100 }') + '\n};\n')
    w(f'constexpr int addition_count = {len(additions)};\n')
    srows = []
    for s in spells:
        ranks = (s.get('ranks') or [{'power': 10, 'mp': 5}])[:5]
        kind = {'bolt': 0, 'heal': 1}.get(s.get('kind'), 2)
        rk = ', '.join(f'{{ {i16(float(r.get("power", 0)) * 10)}, {i16(r.get("mp", 0))} }}' for r in ranks)
        srows.append(f'{{ {c_str(s.get("name"))}, {c_str(s.get("description", ""))}, {kind}, {"true" if s.get("targets") == "all" else "false"}, {len(ranks)}, {{ {rk} }} }}')
    w('constexpr spell_def spells[] = {\n    ' + (',\n    '.join(srows) or '{ "", "", 0, false, 1, { { 0, 0 } } }') + '\n};\n')
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
        gold = e.get('gold') or [0, 0]
        erows.append(f'{{ {c_str(e.get("name"))}, {max(1, min(99, int(e.get("level", 1))))}, {i16(e.get("hp", 10))}, {i16(float(e.get("attack", 5)) * 100)}, {"true" if e.get("magic") else "false"}, '
                     f'{i16(e.get("defense", 0))}, {i16(e.get("magicDefense", 0))}, {i16(e.get("agility", 10))}, {i16(e.get("crit", 5))}, {i16(e.get("xp", 0))}, '
                     f'{i16(gold[0])}, {i16(gold[-1])}, {"true" if e.get("boss") else "false"}, &bn::sprite_items::enemy_{k} }}')
    w('constexpr enemy_def enemies[] = {\n    ' + (',\n    '.join(erows) or '{ "", 1, 1, 100, false, 0, 0, 10, 5, 0, 0, 0, false, nullptr }') + '\n};\n')
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
