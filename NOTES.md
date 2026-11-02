# Mimas to-do

Tick them off as they're built. Saturn's own notes are in docs/saturn/NOTES.md.

## Done
- [x] Update 1 (Nov 1): exporter + Butano runtime; walk one Saturn map (cliffs from heights, water, bridges,
      pines with tops over the player); ROM built by GitHub Actions.
- [x] Update 2 (Nov 1): Saturn's editor forked in (Database, maps, art; no music, 3D models or LPC library).
      GBA Studio: palettes (15 colors, GBA-snapped, recolor on edit), Tile Creator (types with templates and live
      sample-shape previews), sprite painter (overworld 16×32 walk + run, 64×64 back-sprite poses, front sprites),
      mannequin bases (tools/make_bases.py). The ROM's player is the GBA Studio player sprite (16×32, right
      mirrored, Pokémon step pattern, run with B).

- [x] Update 3 (Nov 1): GBA maps. GBA Studio → Maps: layers Ground, Paths & water (13-piece autotile), Cliffs
      (tiers: level k = tiers 1..k, each tier's ring drawn and blocking, top walkable), Objects (multi-tile
      objects anchored at the trunk, ledge pieces, stairs / ladders clear cliff blocking), Passability (O / X), Start;
      Paint / Erase / Fill / Rectangle, undo, Show blocked overlay. Maps in public/data/gbamaps/<id>.json, gba.json
      `maps` + `startMap`. Exporter builds GBA maps with exact palette colors; ROM: ledge hops (2 cells, arc).
      Starter tiles + Starter Meadow (tools/make_starter.py).
- [x] Update 4 (Nov 1): one-tile-wide water / paths (tiles built from 8×8 quarters of the 13 pieces); Cell card
      (copy / paste / flip / clear any cell, across tiles and sprites) and the ⬚ Select-a-cell tool; move water
      frames left / right; ledges with 9 pieces (east / west get top, middle, bottom; Make West from East mirrors;
      old 5-piece ledges are converted when the studio opens, and the exporter still reads them); GBA playtest in the
      editor (Maps tab ▶ Playtest, ▶ Play from here on events, toolbar ▶ Play GBA); Events layer (people, signs,
      doors: sprite, facing, trigger action / touch, blocks, Show text, Transfer with Pick the spot); the ROM has every
      GBA map, people, a text box (pre-wrapped at 30 characters, two lines a page) and transfers with a fade.

## Next (agreed with the owner)
- [ ] Tall grass rustle, water animation, Surf on water (needs a key item / ability), one-way passability arrows.
- [ ] More event commands: choices, switches / variables, conditions, give item, move route, wait.
- [ ] NPCs walking around (GBA Studio overworld sprites).
- [ ] Menus (START), then battles with back-sprites (the poses from GBA Studio) and front sprites.
- [ ] Move Saturn's Database over piece by piece: items, characters, enemies, heroes as GBA data.

## Later
- [ ] Public GBA Studio page for tablet painting while the repo stays private (studio-only build in a public repo,
      saving into itshyokin/mimas through the GitHub API with a fine-grained token).

## Ideas
- Water animation in the ROM (the frames are already painted in GBA Studio).
- Day / night palette tint and the moon cycle using the GBA's real-time clock.
