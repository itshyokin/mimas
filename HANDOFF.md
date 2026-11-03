# Handoff: where Mimas stands (Nov 3, 2026, after Update 11)

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
- Text wrapping for events: `textPages` in types.ts = `text_pages` in export.py (30 characters, 2 lines a page);
  the ROM's menus wrap at run time by pixel width (`wrap` in game_systems.hpp).
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
- GitHub Pages (`.github/workflows/pages.yml`) publishes the editor and the game for editing on Android; it needs
  the repo public and Settings → Pages → Source: GitHub Actions.

## The plan the owner agreed (Nov 1)
Saturn is the game; GBA Studio is the art department. Everything must work in a GBA ROM: Saturn features that can't
are removed or adjusted. Maps: Saturn map files with a `gba` block (src/gba/layers.ts) painted in the Mimas Map
Editor (GBA layers + Saturn's props, events, encounter zones). Next: the playtest runs Saturn's Interpreter
(src/events/Interpreter.ts, an EventContext) on a GBA screen, battles via TurnBattle with a white Gold/Silver
screen; then the ROM compiles Saturn events. Sound: Saturn's chip.ts (Game Boy chip versions of the built-in
sounds) → the GBA's DMG channels; effect files → Maxmod samples; music → tracker files (.xm / .mod).

## Next up
Update 12 (Nov 3): the battle menu layout the owner approved; battle backgrounds (below).
Done the same day: soft fade into battles, no Perfect popups (gba), foes mirrored by "The picture faces", meter
shape / colours from Database → Menus (playtest root classes; ROM ui_tiles round ends + colours), bigger panel
text, src/editor/mimasSupport.ts greys Database settings the GBA game doesn't use (lists per tab).
Update 11 is done (below). The owner's open wishes from NOTES.md: music in the ROM (tracker files), support spells'
buffs in the ROM, learnsets (moves on level up), NPCs walking, Surf, more event commands. Ask the owner which first.

## Things to know
- Nov 3 fixes: greyed commands can be landed on (OK on one buzzes); the hero's lunge / flinch keep their 1.8×
  (pocket-lunge / pocket-hit in styles.css); battle text 2.5u. HeroDef.battleLook { mode default | overworld | frame
  | image, dir, col, row, image } (Heroes → Battle picture (GBA); src/editor/battleArt.ts heroBattleImage); the
  playtest gets `heroback:<id>` pics, the ROM bakes gba/heroes/<id>_back.png, and gba_game.py uses GBA Studio's
  back sprite for 'default'. Open questions to the owner: level-up learning (skill trees vs learnsets) and
  rewording the lines borrowed from Pokémon.
- Update 12, battle screen and backgrounds:
  - Playtest menus: BattleScreen.gbaGrid (set from turnBased.gba) makes the command bar a 2 × 2 grid (left / right =
    index ^ 1, up / down = index ^ 2) with no caption; ChoiceItem.move { element, type, mp } draws a FIGHT button;
    the selected move's detail goes in `.pt-note` inside the text box. TurnBattle.gbaFightMenu passes bar = true.
    Party is always listed (greyed). Layout in gba.css (--cmd-h 15.6u, hero sprite bottom 24.6%, log hint).
  - Battle backgrounds: tools/make_battlebacks.py paints public/gba/battlebacks/builtin/<id>.png (240 × 160; the
    foe's oval at FOE = (171, 53), where the ROM's foe stands too). gba.json `battlebacks` holds renames, your
    pictures in place of built-ins (gba/battlebacks/<id>.png) and new ones; battlebackList() merges them. GBA
    Studio tab "Battle backgrounds"; MapData.battleBack (Map settings → Battles). Playtest: BattleScreen.setBackdrop.
    ROM: export.py writes bback_K (own palettes) and map_info.battleback; battle() lets the world's backgrounds go
    (world::layers_off / layers_on) and shows it at (8, 48), priority 3.
- Update 11, battle menu / guard / panels / field:
  - Data: AdditionDef `mp`, `guard`, `guardHeal` (types.ts; AbilitiesEditor fields). The Database has a `guard`
    Addition; heroes start with quick_strike + guard. gbaGame.ts exports additions' `mp` and `guard` (heal %, null
    for none) and heroes' `gender`.
  - Playtest: TurnBattle with `turnBased.gba` drops Magic / Guard from the commands; `gbaFightMenu` lists the
    Battler's `moveOrder` (`a:<id>` / `s:<id>`); `doGuard(b, heal, move)`. party.ts moves can be `spell:<id>`
    (spellMove / moveSpell / moveInfo). gba.css lays the commands out 2 × 2.
  - Field (playtest): `Loaded.frames` (water frames drawn on demand, a new one every 15 ticks), `grassStep()` +
    `rustle`; Saturn characters drawn from `charsheet:<key>:` (editorArt `characterOverworldSheet`: 6 × 3 frames of
    32 × 32, walk / run × down, up, left; right mirrored). gba.json `player` unset = the Saturn character.
  - ROM: member.moves holds Additions (k) and spells (-(k + 1)); move_name / knows / set_known; learn_spell sends a
    new spell through learn_move (slots, forget questions). Battle: FIGHT / BAG / PARTY / RUN; grid_pick falls back
    to a list when names don't fit; bsay_hold (line over the animation) / bsay_auto (moves on after 60 frames) /
    end_hold; panels draw element icons (elicon_K sprites from public/gba/icons/el_<element>.png, Saturn's icons,
    committed), the gender sprite and ui::xbar (EXP tiles 40-50 in ui_tiles). Foe sprite at (184, 24).
  - ROM field: export.py `saturn_sheet(key)` cuts public/gba/chars/<key>.png to 16 × 32 frames for the hero and
    `char:<key>` NPC sprites; `water_frames` / `build_gba_map(..., frame)` export world_ground_N_fK (water frames are
    stacked down the tile sheet, 3 cells each); map_info.water / water_frames; world::animate() swaps the ground
    every 16 frames; world::grass_step() shows the `rustle` sprite (the tall grass tile's 2nd frame) + snd_rustle.
- Update 10, moves / trainers / effects / sound:
  - Types: world/types.ts MoveRef, TeamMember, TrainerDef (EventPage.trainer), EnemyDef.moves / movesets / mp,
    AdditionDef.element / inflicts / effect / burst, SpellEntry.effect / burst, EnemyAction.mp / look.
  - src/gba/effects.ts (element ramps, default hit / burst, recolouring), src/gba/moves.ts (movesAt),
    src/editor/moveFields.ts (effect pickers with preview, move slots, enemy moves, teamEditor).
  - Playtest: src/gbaplay/foes.ts turns moves into EnemyActions; TurnBattle calls host.effect() and waits for it;
    GbaGame.playEffect draws the frames; trainers: spotted() / trainerBattle(). The interpreter only updates while
    an event runs (an idle one closes the text box the menus use).
  - Effects art: tools/make_effects.py (run once; --force redraws). New effect sounds in src/audio/synth.ts and
    chip.ts; io.ts bakeSounds writes public/gba/sounds/*.wav; gba_game.py copies them to game/audio (Maxmod).
  - ROM: gba_game.py writes the chart, ailments, effects + fxpal_<element> palettes, movesets, custom_moves,
    trainers; game_systems.hpp battle() / spotted() / trainer_battle(); main.cpp keeps events' positions in
    ev_x / ev_y. BATTLE op: n (enemy level moves)*n run var lose; page struct has `trainer`.
- Update 9, the party / menus / battles:
  - Playtest: src/gbaplay/party.ts (members: level, EXP, stats, gear, four moves; the same formulas as the ROM),
    menus.ts (START menu, bag, party, shops, the learn questions), ui.ts (windows on the 240×160 screen; messages and
    YES / NO through Saturn's MessageWindow). Battles run TurnBattle in Single mode with additions 'choose' and
    additionTiming 'auto' (QTE hidden by gba.css). Saves: localStorage `mimas-gba-save:<title>`.
  - Database option: combat.turnBased.moveSlots 'forget' (default) | 'equip' (CombatEditor, "GBA moves").
  - ROM: the editor's save writes public/data/gba_game.json (src/editor/gbaGame.ts: numbers from the game's own
    rules) and public/gba/enemies|heroes|items PNGs; tools/gba_game.py turns them into game/include/mimas_game.h
    and sprites (enemy_K 64×64, hback_K, hface_K, icon_K, the ui_tiles window pieces and cursor);
    game/src/game_systems.hpp (included into main.cpp) has the party, ui:: windows on a run-time background,
    pick() lists, the START menu, bag, shops, learn, battles, random encounters and SRAM saves.
  - New ROM ops (gba_events.py, keep the enum in export.py in step): BATTLE n enemy*n run var lose, PARTY, LEARN,
    SHOP, SAVE, GAUGE, HEAL.
- ROM events (Update 8): tools/gba_events.py compiles each GBA map's Saturn events (ops listed at its top; the enum
  export.py writes must match); game/src/main.cpp `run_event` runs them. Props: the editor's save writes
  public/gba/props/<type>.png and the map's gba.propCells; export.py's draw_props uses them. src/editor/gbaCheck.ts
  lists what's left out (keep it in step with gba_events.py).
- GBA playtest (Update 7): ▶ Playtest on a GBA map opens index.html?gbaplay=<stamp> in an iframe; the editor writes
  the usual playtest hand-off plus `gba` (gba.json, its pictures, and baked prop / character / enemy pictures). The
  game page runs src/gbaplay/GbaGame.ts (src/main.ts branches on ?gbaplay). Styles: src/gbaplay/gba.css.
- Map editor (Update 6): store modes gground / gpath / gcliff / gobjects / gpass (src/editor/gbaPaint.ts paints,
  gbaPalette.ts is the left panel, MapView draws with mapRender.drawMap). GBA Studio art is shared through
  src/editor/gbaShared.ts (loaded at start, handed back when the studio closes). Old Saturn modes still exist in the
  code but have no tabs.
- Mimas's editor server is on 5274+ and checks `project: 'mimas'` in the ping before reusing a running server;
  Saturn's is on 5174+. Vite dev: 5273. IndexedDB names are `mimas-editor` / `mimas-playtest`. Keep them apart.
- The ROM's bag is `bag[item_count]` (Database item order). Text box and bubble share `box_palette`, so the world
  can keep 15 palettes; menus and battles use `ui_palette` on a background made at run time (only while open).
- Ledges: 15 pieces (0-2 S, 3-5 E, 6-8 W, 9-11 singles S/E/W, 12-14 extras S/E/W).

## How we work
- Numbered updates; each: build, test, update README.md and NOTES.md, commit, push to `main`.
- Before committing: `npx tsc --noEmit`, `npm run build:standalone` (rebuilds Map Editor.html / Playtest.html).
- Never commit package-lock.json.
- Test the ROM: run the exporter, build, and play it in mGBA (the cloud session had a local devkitARM stand-in
  and drove mGBA through Kestrel's JNI bridge to take screenshots).
- Docs in plain words: what the user sees and does.
