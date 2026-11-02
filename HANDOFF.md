# Handoff: where Mimas stands (Nov 1, 2026, after Update 6)

To pick this up in a new session: attach `itshyokin/mimas` and say *"Read HANDOFF.md, NOTES.md and README.md,
then continue with the next update."*

## What this is
The GBA fork of the Saturn Game Engine (`itshyokin/hd2dengine`). Same editor code (TypeScript, Vite) with a new
**GBA Studio**, a Python exporter, and a C++ runtime on Butano that becomes `Mimas.gba`. The owner plays builds in
Kestrel, their own Android GBA emulator (`itshyokin/gba`).

Owner's choices: GBA Pokémon look; overworld sprites 16×32 with 3 frames per direction (walk) plus 3 (run);
cliffs are a one-tile ring painted over the ground (empty middle = walkable top, stacked rings = taller cliffs);
the simple 13-piece corner set; battles use back-sprites with poses Default, Greatsword, Dagger, Book,
Flaming fists, Rapier, Claws; RPG Maker passability stays as an override; GBA Studio lives inside the editor.

## Code map
- `src/gba/types.ts`: gba.json types, tile types (layouts, labels, behaviour), sprite kinds, palettes, GBA color snap.
- `src/gba/autotile.ts`: 13-piece picking (`pieceAt`), `quarters` (each 16×16 cell drawn from four 8×8 quarters, so
  1-wide strips work; mirrored by `quarters` / `compose` in tools/export.py) and the preview shape.
- `src/gba/mapRender.ts`: draws a GBA map and computes its collision. Must match `build_gba_map` in tools/export.py
  (same layer order and rules); collision bits SOLID 1, LEDGE_S 4, LEDGE_E 8, LEDGE_W 16, WATER 32, GRASS 64.
- `src/editor/GbaPlaytest.ts`: the in-editor GBA playtest (same rules as main.cpp: steps, run, hops, events, text,
  transfers). Text wrapping: `textPages` in types.ts = `text_pages` in export.py (30 characters, 2 lines a page).
- Ledges: 9 pieces, `ledgeCell` / `ledgeDir` in types.ts (0-2 south, 3-5 east, 6-8 west; sheet 5×3). Old 5×1
  ledge sheets are migrated by `migrateLedges` in GbaStudio.ts (maps' p 3→4, 4→7); the exporter detects the old
  height and reads them the old way.
- `tools/make_starter.py`: the starter tile set and the Starter Meadow sample map.
- `src/editor/GbaStudio.ts` + `gbaStudio.css`: the studio (opened from the toolbar in main.ts). Saves through the
  editor's Project API: `write('gba.json')`, `writeFile('gba/tiles|sprites/<id>.png')` (allowed in vite.config.ts and
  tools/editor-server.mjs).
- `tools/export.py`: every GBA map (start map first) → `world_ground_N` / `world_over_N` backgrounds sharing one
  `world_palette` (≤15 banks across all maps), `textbox` bg, `text_palette`, `hero` and `npc_K` sprites, and
  `game/include/mimas_map.h` (map table with collision, heights, events and commands). Without a GBA start map
  it exports the Saturn map instead. `MIMAS_DATA=<dir>` reads test data from another folder.
- `tools/make_bases.py`: draws the mannequins into `public/gba/bases/`.
- `game/src/main.cpp`: grid movement, collision, camera, layers, walk / run frames, people, events (A to talk,
  touch for doors), text box, transfers with a fade (blocking loops for text and fades).
- `.github/workflows/build.yml`: devkitpro/devkitarm container, Butano 21.9.0, export, make, release.
- No GitHub Pages: the repo stays private (owner's choice, Nov 1). Editing is on the PC (Start Map Editor.bat).
  Later: a public GBA Studio page (separate public repo, no art) that loads / saves the private repo through the
  GitHub API with a token kept in the tablet's browser.

## The plan the owner agreed (Nov 1)
Saturn is the game; GBA Studio is the art department. Everything must work in a GBA ROM: Saturn features that can't
are removed or adjusted. Maps: Saturn map files with a `gba` block (src/gba/layers.ts) painted in the Mimas Map
Editor (GBA layers + Saturn's props, events, encounter zones). Next: the playtest runs Saturn's Interpreter
(src/events/Interpreter.ts, an EventContext) on a GBA screen, battles via TurnBattle with a white Gold/Silver
screen; then the ROM compiles Saturn events. Sound: Saturn's chip.ts (Game Boy chip versions of the built-in
sounds) → the GBA's DMG channels; effect files → Maxmod samples; music → tracker files (.xm / .mod).

## Things to know
- Map editor (Update 6): store modes gground / gpath / gcliff / gobjects / gpass (src/editor/gbaPaint.ts paints,
  gbaPalette.ts is the left panel, MapView draws with mapRender.drawMap). GBA Studio art is shared through
  src/editor/gbaShared.ts (loaded at start, handed back when the studio closes). Old Saturn modes still exist in the
  code but have no tabs.
- Mimas's editor server is on 5274+ and checks `project: 'mimas'` in the ping before reusing a running server;
  Saturn's is on 5174+. Vite dev: 5273. IndexedDB names are `mimas-editor` / `mimas-playtest`. Keep them apart.
- Event commands: text (speaker '' / 'player' / 'ev:<id>', bubble), transfer, item (Database item, count), battle
  (Database troop). The header's `command` struct carries speaker / bubble / item / count; the ROM's bag is
  `bag[item_count]`. Text box and bubble share `box_palette`, so the world can keep 15 palettes.
- Ledges: 15 pieces (0-2 S, 3-5 E, 6-8 W, 9-11 singles S/E/W, 12-14 extras S/E/W).

## How we work
- Numbered updates; each: build, test, update README.md and NOTES.md, commit, push to `main`.
- Before committing: `npx tsc --noEmit`, `npm run build:standalone` (rebuilds Map Editor.html / Playtest.html).
- Never commit package-lock.json.
- Test the ROM: run the exporter, build, and play it in mGBA (the cloud session had a local devkitARM stand-in
  and drove mGBA through Kestrel's JNI bridge to take screenshots).
- Docs in plain words: what the user sees and does.
