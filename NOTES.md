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
- [x] Update 5 (Nov 1): Mimas has its own editor address (5274; dev 5273) and browser storage, so it no longer opens
      on Saturn's server (that's why edits went into hd2dengine); Database button in GBA Studio (saved with the
      studio); event commands Give item and Start battle (playtest: Saturn battle preview; ROM: a note), Show text
      speaker + word bubble (playtest and ROM); cell multi-select (drag / Shift-click with ⬚), Ctrl+C / X / V, Delete,
      Rotate ↺ / ↻, Labels toggle; ledges use all 15 cells (singles and an extra style).
- [x] Update 6 (Nov 1): one map editor. The Mimas Map Editor paints the GBA layers (Ground, Paths & water, Cliffs,
      Objects, Passability) in place of Saturn's terrain, heights, water, buildings and lights; Props, Events (pages,
      switches, every command, area events) and Encounter zones stay Saturn's. Maps are Saturn map files with a `gba`
      block; Starter Meadow moved there and is the start map; old maps: Map Properties → Convert to GBA map. GBA
      Studio is tiles, sprites and palettes (no Maps tab). Event pages can show a GBA sprite. ▶ Playtest walks the
      open GBA map. The exporter builds every map with a `gba` block.

## Next (agreed with the owner)
- [x] Update 7 (Nov 1): GBA playtest = the game page in GBA mode (index.html?gbaplay) in a frame over the editor
      (src/gbaplay/GbaGame.ts): Saturn's Interpreter, MessageWindow (GBA white box; speech bubbles over the event),
      GameState, Inventory, TurnBattle + BattleScreen (Pocket Handheld, flat white screen), encounter zones and map
      tables, props drawn and blocking, Saturn's sound effects (copied into public/assets/audio) and the built-in
      chiptune music. The editor hands over GBA art and the pictures it draws (props, characters, enemies).
- [x] Update 8 (Nov 2): Saturn events in the ROM (tools/gba_events.py → game/src/main.cpp interpreter): pages,
      conditions, triggers, area events, text / bubbles / names, choices, if / else, switches, variables, self
      switches, items, gold, transfers, waits, fades; props drawn and blocking (baked by the editor on save);
      GBA check panel; the GBA playtest uses the Game Pixel font everywhere.
- [ ] Update 9 (agreed): GBA battles in the ROM (Pokémon style, white screen); playtest and ROM menus in GB / GBA
      Pokémon style (vertical pause list: party as the "Pokémon" list, bag as a text list with icons and (x3),
      Use / Toss…, Save); battle log in the pixel font; Additions are the attacks (no button prompts yet), up to 4
      a hero, learning a 5th asks which to forget (Database option: keep them all and equip 4 outside battle);
      Additions cost no MP, Spells do; shops; party members in battle; stats from gear.
- [ ] GBA playtest gaps: shops, START menu (bag, party), saving, party members in battle, hero stats from gear.
- [ ] Update 8+: the ROM: Saturn events compiled to a compact script, encounter zones, battles, sound (chip versions
      of the built-in sounds on the GBA's sound chip; effect files as samples; music as tracker files), props drawn
      into the map, and a GBA check panel listing what a map uses that the GBA can't do.
- [ ] Tall grass rustle, water animation, Surf on water (needs a key item / ability), one-way passability arrows.
- [ ] More event commands: choices, switches / variables, conditions, give item, move route, wait.
- [ ] NPCs walking around (GBA Studio overworld sprites).
- [ ] GBA battles (Start battle runs them), the bag in a START menu.
- [ ] Menus (START), then battles with back-sprites (the poses from GBA Studio) and front sprites.
- [ ] Move Saturn's Database over piece by piece: items, characters, enemies, heroes as GBA data.

## Later
- [ ] Public GBA Studio page for tablet painting while the repo stays private (studio-only build in a public repo,
      saving into itshyokin/mimas through the GitHub API with a fine-grained token).

## Ideas
- Water animation in the ROM (the frames are already painted in GBA Studio).
- Day / night palette tint and the moon cycle using the GBA's real-time clock.
