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
| A | Talk to people, read signs, next page of text, choose |
| B | Back (in menus) |
| START | The menu: PARTY, BAG, your hero (money, time), SAVE, EXIT |

The game saves to the cartridge (SAVE in the menu, or a Save event); with a
save on it, it starts with **CONTINUE / NEW GAME**.

## The editor

- **On a PC:** double-click `Start Map Editor.bat` (needs Node.js), or
  `npm install` then `npm run dev`. Mimas opens at **localhost:5274**
  (`npm run dev`: 5273), never at Saturn's 5174 / 5173, so the two editors
  can't open each other's files. The top-left says **Mimas · Map Editor**. Saves go straight into the project
  folder; commit and push them (GitHub Desktop is fine) and GitHub builds a
  new ROM.
- **On a phone or tablet:** open **https://itshyokin.github.io/mimas/editor.html**
  (the repo is public and GitHub Pages publishes the editor and the game on
  every push). Your changes are kept on that device until you send them:
  **Project → Push to GitHub** (it asks once for a fine-grained token with
  *Contents: read and write* on this repo only). **Pull** brings in changes
  made on the PC. GitHub then builds a new ROM as usual.

### The map editor

Maps are painted with your GBA Studio tiles; everything else is Saturn's.
The layer tabs on the left:

| Layer | What it's for |
|---|---|
| Ground (1) | The base: grass, sand, floors |
| Paths & water (2) | Paths and ponds; edges, corners and one-tile-wide strips are picked for you |
| Cliffs (3) | The *area* of a raised plateau, by tier. The ring of cliff edges is drawn around it and the top stays walkable. Tier 2 inside tier 1 is a higher level; right up to its edge, a taller cliff |
| Objects (4) | Trees (click where the trunk goes), ledges (pick the piece), stairs and ladders (the way through cliffs), signs, flowers, tall grass, doors |
| Props (5) | Saturn's props, as before |
| Events (6) | Saturn's events, with everything they had: pages, conditions, switches, variables, every command, and big events covering an area (drag across empty tiles) |
| Encounters (7) | Saturn's encounter zones: paint regions, each with its own troops (Map Properties → Random battles for the whole map) |
| Passability (8) | RPG Maker-style overrides: O walkable, ✕ blocked |

Tools for the GBA layers: Paint (B), Rectangle (R, great for tall grass and
ledge rows), Fill (G), Erase (E). **Show blocked** tints every cell the player
can't walk on, as the ROM sees it (red blocked, blue water, orange arrows for
ledges). Paths and water are built from four 8×8 quarters of your 13 pieces
(the RPG Maker trick), so strips, ends, T-junctions and crossings all work.

An event's *Appearance* can be a **GBA sprite** (an overworld sprite from GBA
Studio). Saturn characters still work as placeholders until their GBA sprites
are painted.

**New map** makes a GBA map. Old Saturn maps open as they were; *⚙ Map
Properties → Convert to GBA map* turns one into a GBA map, keeping its events,
props and encounter zones (its houses and lights go: paint houses as GBA
objects). Maps are saved in `public/data/maps/` as before, with the GBA
layers in a `gba` block.

**▶ Playtest** plays the open map on a GBA screen (240×160) right in the
editor, with your unsaved changes. Saturn's own systems run it:
- **Events**: pages and conditions, switches, variables, self switches,
  choices, if / else, items and gold, transfers between GBA maps, fades,
  sounds, autorun and touch events, big area events. Text shows in a white
  box at the bottom; a Show text set to a *speech* bubble shows over the
  event that's talking.
- **Props** stand on the map and block like they did in Saturn.
- **Random battles** from the Encounters layer's zones (or the map's own
  table), and the *Start battle* command: Saturn's turn-based battles in the
  Pocket Handheld layout on a plain white screen, Gold / Silver style. The
  party fights Pokémon-style: one hero out at a time, the rest sent in with
  PARTY (or when one faints); everyone who was out shares the EXP.
- **Moves**: each hero's Additions are their FIGHT moves, four at most, played
  without button prompts (for now); moves cost no MP, spells (MAGIC) do. When
  a hero learns a fifth, they're asked which to forget, Pokémon-style. With
  Database → Combat → *GBA moves* set to *Equip*, nothing is forgotten: the
  new move takes a slot and the four are chosen in PARTY → MOVES.
- **The menu** (Enter = START): PARTY (SUMMARY, MOVES, EQUIP, SWITCH), BAG
  (pockets ITEMS / GEAR / KEY ITEMS with ◀ ▶; each item's icon, name and ×n;
  USE / EQUIP / TOSS), your hero (money and play time), SAVE, EXIT. Gear adds
  to stats and armour.
- **Shops** (BUY / SELL / QUIT with "how many?") and **saving** (kept in the
  browser; the next playtest offers CONTINUE).
- **Enemy moves**: Database → Enemies → *Moves (GBA)*: four moves each
  (Additions or spells; spells use the enemy's MP, so give it at least one
  Addition), and *+ New moves from a level* for movesets it "learns" as it
  levels. Foes fight at their level (Combat's enemy growth) with those moves.
- **Types and ailments**: Additions have a type (Saturn's elements), ailments
  and an animation; "It's super effective!", poison, burns, sleep and the rest
  work as in Saturn's battles.
- **Trainers**: an event page's *Trainer (GBA)* box: how far it sees, its team
  (each enemy's level, and its own moves for this fight if you like), what it
  says before and after, prize money, and the self switch it sets when beaten.
  Walk into its line of sight and a (!) pops up, it walks over and the battle
  starts. *Start battle* has the same per-foe level and moves.
- **Battle animations**: GBA Studio → Sprites has *Battle effects* (64×64, 6
  frames): 10 hits (slash, double slash, claw, hit, punch, pierce, ding, bite,
  slam, sparkle) drawn in greys that take each move's element colours, and 9
  bursts (fire, water, ice, lightning, rocks, leaves, poison, holy light, dark).
  Each has a sound. Additions and spells pick a hit and a burst (by default,
  their element's burst), with a live preview. Repaint them or add your own.
- **Sound**: Saturn's sound effects (your files and the built-in ones) and the
  built-in chiptune music, as the GBA's sound chip will play it. Music files
  play as the built-in field or battle theme for now (a GBA ROM can't hold
  them as they are; they'll become tracker songs).

Keys: arrows or WASD walk, Z / Space = A (Enter too in menus), X = B (hold
to run), Enter = START, Esc stops; a gamepad works too. One pixel font for
everything: text boxes, menus and battles.

**Saving a GBA map** also writes what the ROM needs for battles and menus:
`public/data/gba_game.json` (the heroes, moves, spells, items, enemies and
troops with the game's numbers) and pictures in `public/gba/enemies/` (each
foe's front), `public/gba/heroes/` (backs and faces) and `public/gba/items/`
(icons). Save once after changing them in the Database.

The full guide to Saturn's tools (events, Database, props) is in
[docs/saturn/README.md](docs/saturn/README.md).

### GBA Studio

The **GBA Studio** button opens the art department: Tiles, Sprites and
Palettes. When it closes, the map editor shows your latest tiles. Its
**Database** button opens the Database over it.

A starter set of tiles (grass, dirt path, pond, rock cliff, ledges, stairs,
ladder, tall grass, flowers, signpost, and a pine tree from your own pine
art) and a sample map, **Starter Meadow** (where the game starts), come ready
to use. They're ordinary GBA Studio tiles: repaint them and every map using
them follows. `python3 tools/make_starter.py --force` redraws the originals.

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

## What the ROM does (v0.7)

- **Battles**, Gold / Silver style on a white screen: the foe across from your
  hero, HP bars, *What will Jordan do?* with FIGHT, MAGIC, BAG, GUARD, PARTY
  and RUN. FIGHT is the hero's four moves (their Additions, every strike
  landing); MAGIC their spells (costing MP); the faster side goes first.
  Foes from a troop come out one at a time. Winning gives EXP (levels grow
  each stat by the hero's ranks) and money; losing sends you back to the
  start, healed, with half your money.
- **Random battles** from the Encounters layer's zones (each with its troops
  and steps) and the map's own table, plus the *Start battle* command (can
  run, the result variable, lose and continue).
- **The party**: up to six heroes (the *Party* command adds and removes
  them). The START menu has PARTY (SUMMARY, MOVES, EQUIP, SWITCH), BAG (item
  icons, ×n, USE / EQUIP / TOSS), your hero's card, SAVE and EXIT.
- **Learn** gives moves and spells; a fifth move asks which to forget (or,
  with *Equip* moves, which to put away). **Shops**, **Save**, **Full rest**
  and **Change HP / MP** work too. Saves go to the cartridge.
- **Enemy moves, types and ailments**: foes use their four moves (or their
  level's moveset, or a fight's own), spells cost their MP; type matchups
  (super effective / not very effective / doesn't affect / absorbs) and
  poison, burn, paralysis, sleep, freeze, confusion, blindness and silence.
  The panels show PSN, BRN… Support spells work as small heals for now.
- **Trainers** spot you, show a (!), walk up, say their line and battle (one
  foe at a time, no running); beaten, their self switch turns on.
- **Animations and sound**: each move plays its hit (in its type's colours)
  and burst over whoever it hits, with its sound; menus, battles, saving and
  shops have sound effects (the Game Boy-style chip versions, baked into
  `public/gba/sounds/` when a GBA map is saved). Music comes later.

- Every GBA map is in the ROM; it starts on the game's start map (Database
  → start; now **Starter Meadow**). Maps are built from your tiles with
  their exact colors: ground, paths and water with joined corners (one tile
  wide too), cliff tiers, objects, tree tops drawn over the player.
- **Saturn's events**, translated by `tools/gba_events.py` into a small
  script the ROM runs: pages and their conditions (switches, self switches,
  variables, items, gold), action / touch / autorun triggers, area events,
  Show text (box, or a speech bubble over the event; a speaker's name leads
  the line; `\v[name]` and `\s[name]` show values), Show choices (up to 4,
  B for the cancel choice), if / else, switches, variables, self switches,
  give / take items, gold, transfers between GBA maps, waits and fades.
  People show their GBA sprite (Saturn characters: the player's sprite stands
  in) and turn to face you when the page says so. Objects events show (a
  chest, a sign) use their picture at GBA size, so a chest opens when its
  page changes.
- **Props** are drawn into the map (their tops over the player) and block the
  cells they block in the editor. Saving a GBA map in the editor writes their
  pictures to `public/gba/props/` and the cells they block into the map.
- **GBA check** (toolbar, on GBA maps) lists what a map uses that the ROM
  can't do yet, so nothing is left out without you knowing.
- Walls, water, cliff edges, tree trunks and signs block; stairs and ladders
  get you through cliffs; **ledges** hop you down (and block the way back up).
- The player is your GBA Studio sprite, walking Pokémon-style (a foot forward
  each tile, alternating) and running with B. The map name shows on arrival.
- With no GBA map set, it plays the Saturn map in `public/data/mimas.json`
  instead (the old Monolith Woods export).

Next up: music, people walking around, Surf. See [NOTES.md](NOTES.md).

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
