# Mimas

The Game Boy Advance version of the **Saturn Game Engine**. Mimas is
Saturn's smallest major moon; this is its little sibling, built to make real
GBA games that run on hardware, in any GBA emulator, and in Kestrel.

It has two halves:

- **The project** (`project/`): maps, tiles, props and sprites in the Saturn
  Game Engine's format, copied from `hd2dengine`.
- **The runtime** (`game/`): a small C++ engine built on
  [Butano](https://github.com/GValiente/butano) that plays that data on a GBA.

`tools/export.py` sits between them: it turns a Saturn map into GBA graphics
and data, applying the GBA's rules automatically.

## Play the latest build

Open on your phone or tablet, then load it in Kestrel:
**https://github.com/itshyokin/mimas/releases/latest/download/Mimas.gba**

Each release also has `map-preview.png`, a picture of the whole exported map.

### Controls (v0.1)

| Button | Does |
|---|---|
| D-pad | Walk (one tile per step) |
| Hold B | Run |
| START | Show the map name again |

## What v0.1 does

- Exports one map (`project/mimas.json` → `"map"`), currently **Monolith Woods - Monolith**.
- **Ground** from your terrain tiles, shrunk to 16×16 if they're bigger.
- **Cliffs and ledges** from the map's heights: a rock face where the ground
  drops away toward the camera, a dark edge line on the other sides. Height
  changes of 2 or more block walking; steps of 1 are fine.
- **Water** (from the map's water levels) blocks walking; **bridges** cross it.
- **Pines** block their cell and their tops are drawn **over** the player, so
  you walk behind trees like in the handheld Pokémon games. Grass tufts, the
  signpost and the crystal are drawn too.
- **Jordan** as the player, made from his character sheet: 4 directions,
  8-frame walk.
- The map name appears when you arrive.

Not yet: events and talking, NPCs, other maps and transfers, menus, battles,
music. Those come next, one update at a time.

## GBA rules (what the exporter does for you)

- Every map cell is **16×16 pixels**. Tiles drawn at 16×16 come through
  pixel-perfect; bigger ones (your 32×32 tiles) are shrunk.
- Each 8×8 quarter of a tile uses one **16-color palette**, and the whole
  map shares up to 15 of them. The exporter reduces colors until it fits and
  prints how many it used.
- Maps can be any size; the GBA background is padded to a multiple of 256
  pixels behind the scenes.
- Sprites are 32×32 with 15 colors.

## Building

GitHub builds the ROM on every push to `main` (see the **Actions** tab).

To build yourself: install [devkitPro](https://devkitpro.org/wiki/Getting_Started)
with the GBA tools and Python 3 with Pillow, then:

```
git clone --depth 1 --branch 21.9.0 https://github.com/GValiente/butano.git butano
python3 tools/export.py
make -C game -j8
```

The ROM is `game/mimas.gba`. `build/preview.png` shows the exported map.

To export a different map: change `"map"` in `project/mimas.json` (and
`"start"`, the cell the player starts on; the nearest walkable cell is used).

## Layout

```
project/            the game's data (Saturn Game Engine format)
  mimas.json        which map, start cell, player sheet
  maps/ tiles/ props/ sprites/ assets.json
tools/export.py     Saturn map → GBA graphics + game/include/mimas_map.h
game/               the Butano runtime
  src/main.cpp      movement, collision, camera, layers
  Makefile
```

## Licenses

Butano is © Gustavo Valiente, zlib license. Game art and data are the
project owner's.
