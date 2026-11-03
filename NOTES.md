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
- [x] Update 9 (Nov 2): Pokémon-style party, menus and battles, in the playtest and the ROM. Playtest
      (src/gbaplay/party.ts, menus.ts, ui.ts): START menu (Party, Bag with pockets / icons / ×n / Use · Equip · Toss,
      the hero's card, Save, Exit), party Summary / Moves / Equip / Switch, shops, saving with Continue; battles in
      Single mode (the party sent in one at a time), Additions as the four FIGHT moves without prompts, a 5th asks
      which to forget (Database → Combat → GBA moves: Equip keeps them all), light command box. ROM
      (game/src/game_systems.hpp, tools/gba_game.py, gba_game.json + battle art baked by the editor on save):
      battles on a white screen (FIGHT / MAGIC / BAG / GUARD / PARTY / RUN), random battles from zones and map
      tables, Start battle, Party, Learn (forget prompt), Shop, Save (SRAM, CONTINUE / NEW GAME), Change HP / MP,
      Full rest, gear stats, the START menu.
- [x] Update 10 (Nov 2): enemy moves (four Additions / spells, MP, movesets by level, per-fight overrides); Additions
      get a type, ailments and an animation; battle effects (GBA Studio effect sprites: 10 hits recoloured by element,
      9 bursts, each with a chip sound; tools/make_effects.py made the starter set); trainers (sight range, (!), walk
      up, team with levels and moves, lines, prize, beaten self switch); Start battle levels and moves per foe; the
      ROM: types, ailments, effects, sounds (Maxmod; the editor bakes 8-bit WAVs), trainers; enemy art at its drawn
      size (no more squashed slime).
- [x] Update 11 (Nov 3): battle menu FIGHT / BAG / PARTY / RUN (spells sit with Additions in FIGHT, with their MP);
      Guard is a move (an Addition marked as a guard: half damage, no ailments, health back, 10% by default); any
      Addition can cost MP; Pokémon-style text (the move's line stays up over its animation, then "super effective"
      and the like move on by themselves); no "Go!" lines (party members step in); the ROM's panels like Saturn's
      (EXP bar, element icons, gender symbols); Saturn characters walk the field in the playtest and the ROM (the
      editor's save bakes public/gba/chars/<key>.png); water plays its frames and tall grass rustles (both).
- [x] Update 12 (Nov 3): the battle screen tidied (big FIGHT / BAG / PARTY / RUN buttons, FIGHT as four move buttons
      with type and MP, the move's details in a note, taller boxes, bigger panel text, soft fade in, no Perfect
      popups, foes face the right way, meters follow the Database); Database settings the GBA game doesn't use are
      greyed; battle backgrounds (six built in, replaceable, per map) in the playtest and the ROM.
- [ ] Battles with more than one hero and foe out at once (2 v 2 or 3 v 3): owner is thinking about it.
- [ ] Music in the ROM (tracker files); support spells' buffs in the ROM; learning moves on level up (a learnset).
- [ ] Surf on water (needs a key item / ability), one-way passability arrows.
- [ ] More event commands in the ROM: move route, show / hide events, class changes.
- [ ] NPCs walking around (GBA Studio overworld sprites).
- [ ] Move Saturn's Database over piece by piece: items, characters, enemies, heroes as GBA data.

## Later
- [ ] Public GBA Studio page for tablet painting while the repo stays private (studio-only build in a public repo,
      saving into itshyokin/mimas through the GitHub API with a fine-grained token).

## Ideas
- Day / night palette tint and the moon cycle using the GBA's real-time clock.
