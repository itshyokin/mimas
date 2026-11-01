# Mimas

The Game Boy Advance fork of the **Saturn Game Engine**. Mimas is Saturn's
smallest major moon; this is its little sibling, for making real GBA games
in the style of the GBA Pokémon games. They run on hardware, in any GBA
emulator, and in Kestrel.

It has three parts:

- **The editor**: Saturn's Map Editor and Database, brought over with all your
  items, characters, enemies, heroes, maps and art, plus the new
  **GBA Studio** for painting GBA tiles and sprites.
- **The exporter** (`tools/export.py`): turns the project into GBA graphics
  and data, enforcing the GBA's rules.
- **The runtime** (`game/`): a small C++ engine built on
  [Butano](https://github.com/GValiente/butano) that plays it.

## Play the latest build

On your phone or tablet, open this link and load the file in Kestrel:
**https://github.com/itshyokin/mimas/releases/latest/download/Mimas.gba**

Every push to `main` builds a new ROM (see the **Actions** tab). Each release
also has `map-preview.png`, a picture of the exported map.

| Button | Does |
|---|---|
| D-pad | Walk, one tile per step |
| Hold B | Run |
| START | Show the map name again |

## The editor

- **Online:** `https://itshyokin.github.io/mimas/editor.html` (once GitHub
  Pages is on, see below). Works on tablets; Project → Push sends your
  changes to GitHub, which then builds a new ROM.
- **On a PC:** double-click `Start Map Editor.bat`, or `npm install` then
  `npm run dev`.

Everything from Saturn is still there (maps, Database, World). The full
guide to those tools is in [docs/saturn/README.md](docs/saturn/README.md).

### GBA Studio

The **GBA Studio** button in the toolbar opens a full-screen workspace with
three tabs.

**Sprites.** Characters start from a plain gray mannequin to paint over.
- *Overworld character (16×32)*: rows for down, up and left (right is the left
  row mirrored in game), columns for walking (stand, step, step) and running
  (stand, step, step). The preview walks them in all four directions;
  tick *Show running* to see the run.
- *Battle back-sprite (64×64)*: your hero seen from behind, Pokémon style, one
  pose per fighting style: Default, Greatsword, Dagger, Book, Flaming fists,
  Rapier, Claws.
- *Battle front sprite (64×64)*: for enemies.
- Tick **The player walks around as this sprite** to put it in the ROM.

**Tiles.** Choose **+ New tile**, pick the type from the dropdown, and paint
over the template. Each cell is labelled with the piece it is, and the
preview builds a sample shape from your pieces, so you can check every
corner as you paint.

| Type | You paint | In game |
|---|---|---|
| Ground | 1 tile (preview repeats it) | Walkable |
| Decoration | 1 tile over the ground | Walkable, blocked or walk-behind (your choice) |
| Path / transition | 13 pieces: 3×3 block + 4 inner corners | Walkable |
| Water | 13 shore pieces, plus animation frames | Blocks until Surf |
| Cliff / hill | 13 edge pieces; the middle stays empty | Edges and face block; the top is walkable |
| Ledge | South (ends + middle), east, west | One-way hop down |
| Stairs, Ladder | 1 tile | The way up a cliff |
| Tall grass | Still + rustling | Walkable; battles later |
| Tree / big object | Any size up to 8×8 tiles | Bottom row blocks; the top draws over you |
| Door / warp | 1 tile | Goes to another map |

Cliffs are painted *over* the ground: only the ring of edges is drawn, so the
ground shows on top and you can walk there. Two rings, one inside the other,
make a taller cliff; stairs or a ladder in the ring are the way up.

**Palettes.** Each palette holds 15 colors (slot 0 is always transparent).
Colors snap to the 32,768 the GBA can show, so what you see is what the GBA
shows. Changing a color recolors every tile and sprite using that palette.

**Painting.** Left-click paints, right-click erases (on a tablet use the
*Paint* and *Erase* buttons). Tools: Paint (B), Erase (E), Fill (G, stays
inside one cell), Pick a color (I), Line (L), Rectangle (R); Ctrl+Z / Ctrl+Y;
+ / − zoom. *Mirror* paints both halves of a cell at once; *Onion skin* shows
the previous frame faintly. Red lines mark the borders between cells and
frames; they're never part of the picture. *Import PNG…* brings in a picture
(snapped to the palette); *Download PNG* saves the sheet to paint elsewhere.

The mannequins are also in `public/gba/bases/`, with red-bordered versions
(`*_guide.png`) for painting in other programs.

Files: `public/data/gba.json` (palettes, tiles, sprites) and the pictures in
`public/gba/tiles/` and `public/gba/sprites/`.

## What the ROM does (v0.2)

- Exports one map (`public/data/mimas.json` → `"map"`), currently **Monolith Woods - Monolith**:
  ground tiles, cliffs and ledges from heights, water, bridges, pines (tops over
  the player), tufts, the sign and the crystal.
- The player is your GBA Studio sprite, walking Pokémon-style (a foot forward
  each tile, alternating) and running with B.
- The map name shows on arrival.

Next up: GBA maps painted with your GBA Studio tiles (ground and cliff
layers, autotiled), then events and talking, map transfers, NPCs, menus and
battles. See [NOTES.md](NOTES.md).

## Turning on the online editor (once)

GitHub → this repo → **Settings → Pages** → *Source: GitHub Actions*. The
"Publish to GitHub Pages" workflow then publishes the editor and Saturn's 3D
playtest on every push.

## Building the ROM yourself

Install [devkitPro](https://devkitpro.org/wiki/Getting_Started) with the GBA
tools, and Python 3 with Pillow, then:

```
git clone --depth 1 --branch 21.9.0 https://github.com/GValiente/butano.git butano
python3 tools/export.py
make -C game -j8
```

The ROM is `game/mimas.gba`; `build/preview.png` shows the exported map.
`python3 tools/make_bases.py` redraws the mannequins.

## What came over from Saturn (and what didn't)

Everything in the Saturn project came over (code, Database, maps, characters,
enemies, items, icons, tiles, props, fonts) except the music and sound files,
the 3D models and the LPC character-builder parts library, which the GBA can't
use. Those stay in `itshyokin/hd2dengine`.

## Licenses

Butano is © Gustavo Valiente, zlib license. Game art and data are the
project owner's.
