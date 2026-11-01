# Handoff: where Mimas stands (Nov 1, 2026, after Update 2)

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
- `src/gba/autotile.ts`: 13-piece picking (`pieceAt`) and the preview shape.
- `src/editor/GbaStudio.ts` + `gbaStudio.css`: the studio (opened from the toolbar in main.ts). Saves through the
  editor's Project API: `write('gba.json')`, `writeFile('gba/tiles|sprites/<id>.png')` (allowed in vite.config.ts and
  tools/editor-server.mjs).
- `tools/export.py`: Saturn map → GBA backgrounds (16×16 cells, banked 4bpp palettes, ≤15 banks, shared palette
  item), collision + heights header, hero sprite from gba.json's player.
- `tools/make_bases.py`: draws the mannequins into `public/gba/bases/`.
- `game/src/main.cpp`: grid movement, collision, camera, layers, walk / run frames.
- `.github/workflows/build.yml`: devkitpro/devkitarm container, Butano 21.9.0, export, make, release.
- No GitHub Pages: the repo stays private (owner's choice, Nov 1). Editing is on the PC (Start Map Editor.bat).
  Later: a public GBA Studio page (separate public repo, no art) that loads / saves the private repo through the
  GitHub API with a token kept in the tablet's browser.

## How we work
- Numbered updates; each: build, test, update README.md and NOTES.md, commit, push to `main`.
- Before committing: `npx tsc --noEmit`, `npm run build:standalone` (rebuilds Map Editor.html / Playtest.html).
- Never commit package-lock.json.
- Test the ROM: run the exporter, build, and play it in mGBA (the cloud session had a local devkitARM stand-in
  and drove mGBA through Kestrel's JNI bridge to take screenshots).
- Docs in plain words: what the user sees and does.
