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

## Next (agreed with the owner)
- [ ] GBA maps: a GBA map mode in the Map Editor with a ground layer and a cliff layer painted with GBA Studio
      tiles; paths / water / cliffs autotiled with the 13-piece rule (src/gba/autotile.ts); RPG Maker passability
      (O / X / ☆, one-way arrows) as a per-tile override. Exporter builds the ROM's maps from them.
- [ ] Ledges (one-way hop with a jump), stairs / ladders through cliffs, tall grass rustle, Surf on water.
- [ ] Events: signs and talking (text box), doors / transfers between maps.
- [ ] NPCs walking around (GBA Studio overworld sprites).
- [ ] Menus (START), then battles with back-sprites (the poses from GBA Studio) and front sprites.
- [ ] Move Saturn's Database over piece by piece: items, characters, enemies, heroes as GBA data.

## Ideas
- Water animation in the ROM (the frames are already painted in GBA Studio).
- Day / night palette tint and the moon cycle using the GBA's real-time clock.
