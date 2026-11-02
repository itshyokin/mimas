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
| A | Talk to people, read signs, next page of text |
| START | Show the map name again |

## The editor

- **On a PC:** double-click `Start Map Editor.bat` (needs Node.js), or
  `npm install` then `npm run dev`. Mimas opens at **localhost:5274**
  (`npm run dev`: 5273), never at Saturn's 5174 / 5173, so the two editors
  can't open each other's files. The top-left says **Mimas · Map Editor**. Saves go straight into the project
  folder; commit and push them (GitHub Desktop is fine) and GitHub builds a
  new ROM.
- The repo is private, so there's no online/tablet editor for now. A public
  GBA Studio page that saves into this private repo is planned for later.

Everything from Saturn is still there (maps, Database, World). The full
guide to those tools is in [docs/saturn/README.md](docs/saturn/README.md).

### GBA Studio

The **GBA Studio** button in the toolbar opens a full-screen workspace with
four tabs: Maps, Tiles, Sprites and Palettes.

**Maps.** Paint GBA maps with your tiles, layer by layer:

| Layer | What you paint |
|---|---|
| Ground | The base: grass, sand, floors |
| Paths & water | Paths and ponds; edges and corners are picked for you |
| Cliffs | The *area* of a raised plateau, by tier. The ring of cliff edges is drawn around it and the top stays walkable. Paint tier 2 inside tier 1 for a higher level, or right up to its edge for a taller cliff |
| Objects | Trees (click where the trunk goes), ledges (pick the piece: south left/middle/right, east or west top/middle/bottom), stairs and ladders (a way through cliffs), signs, flowers, tall grass, doors |
| Events | People, signs and doors (see below) |
| Passability | RPG Maker-style overrides: O walkable, ✕ blocked |
| Start | Where the player begins (the dashed box is the GBA screen) |

Paths and water join up from just the 13 pieces you paint, including
one-tile-wide streams and paths, dead ends, T-junctions and crossings: each
tile is built from four 8×8 quarters of your pieces (the RPG Maker trick).

Tools: Paint, Erase (or right-click), Fill, Rectangle (great for tall grass
patches and ledge rows), undo / redo, zoom. **Show blocked** tints every
cell the player can't walk on, exactly as the ROM sees it (red blocked, blue
water, orange arrows for ledges). Tick **The ROM starts on this map** to play
it; each map is saved in `public/data/gbamaps/`.

**Events.** On the Events layer, click an empty cell to add an event, click
one to edit it, drag it to move it, and right-click (or Delete) to remove it.
Each event has:
- a *Sprite* (any overworld sprite, for people; *None* for signs, doors and
  invisible triggers) and which way it faces;
- *Starts when*: the player faces it and presses A (people, signs), or steps
  on it (doors; walking into a door in a wall works too);
- *Blocks the way* (people);
- *What happens*, in order:
  - **Show text**: long text wraps by itself; a blank line starts a new box.
    Pick a *Speaker* (the player or any event on the map) and tick *Word
    bubble* to show it in a bubble over them instead of the box at the bottom.
  - **Transfer player**: to any map, column, row and facing; *Pick the spot on
    the map…* lets you click where they arrive.
  - **Give item**: an item from the Database, and how many. Shows “You got …!”
    and adds it to the bag.
  - **Start battle**: a troop from the Database. GBA battles aren't built yet:
    the playtest offers to fight it in the Saturn battle preview, and the ROM
    shows a note.

The **Database** button (top of GBA Studio, and *Database…* on an event)
opens the full Database over the studio: items, troops, enemies, characters
and the rest. GBA Studio's *Save* saves its changes too.

A sign is an event with no sprite on the signpost. A door is an event that
starts when stepped on, with a Transfer; put another one on the other map to
come back.

**Playtest.** *▶ Playtest* in the Maps tab plays the map right in the editor,
the way the ROM does (240×160 screen, walking, running, ledges, people, text,
doors between maps), with your unsaved changes. *▶ Play from here* on an
event starts next to it. In the main toolbar, *▶ Play GBA* plays the map the
ROM starts on. Keys: arrows or WASD walk, Z / Space = A, hold X or Shift = B
(run), Esc stops; a gamepad works too. (*▶ Saturn playtest* is the old HD-2D
game.)

A starter set of tiles (grass, dirt path, pond, rock cliff, ledges, stairs,
ladder, tall grass, flowers, signpost, and a pine tree from your own pine
art) and a sample map, **Starter Meadow**, come ready to use. They're ordinary
GBA Studio tiles: repaint them and every map using them follows.
`python3 tools/make_starter.py --force` redraws the originals.

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
| Ledge | South (left end, middle, right end); east and west (top, middle, bottom); one-tile singles (south, east, west); and an extra style (south, east, west). *Make West from East* mirrors the east pieces | One-way hop down |
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

**Cells.** Click a cell on the sheet, or use the ⬚ *Select a cell* tool (it
doesn't paint) and drag or Shift-click to select several. The **Cell** card
can *Copy*, *Paste*, *Clear*, *Flip ↔*, *Flip ↕* and *Rotate ↺ / ↻* (each cell
turns a quarter turn: ↺ makes a south ledge an east one). Ctrl+C, Ctrl+X,
Ctrl+V and Delete work too. Copy works across tiles and sprites, so a bush
painted in *Still* can be pasted into *Rustling* as a start; pasting a copied
row into a selected column fills it top to bottom. *Labels* hides the cell
names while you paint (and *Grid* the pixel grid). Water frames can be moved
earlier or later with *◀ Move* and *Move ▶*.

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

## What the ROM does (v0.5)

- Every GBA map is in the ROM; it starts on the one marked **The ROM starts
  on this map** (now **Starter Meadow**). Maps are built from your tiles with
  their exact colors: ground, paths and water with joined corners (one tile
  wide too), cliff tiers, objects, tree tops drawn over the player.
- People stand on the map and turn to face you when you talk (A); signs
  show their text; doors take you to other maps with a fade. Text shows in
  the box at the bottom or in a word bubble over whoever speaks. Give item
  fills the bag (no menu to see it yet); Start battle shows a note.
- Walls, water, cliff edges, tree trunks and signs block; stairs and ladders
  get you through cliffs; **ledges** hop you down (and block the way back up).
- The player is your GBA Studio sprite, walking Pokémon-style (a foot forward
  each tile, alternating) and running with B. The map name shows on arrival.
- With no GBA map set, it plays the Saturn map in `public/data/mimas.json`
  instead (the old Monolith Woods export).

Next up: people walking around, Surf, menus and battles. See [NOTES.md](NOTES.md).

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
