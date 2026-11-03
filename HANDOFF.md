# Handoff: where Mimas stands (Nov 3, 2026, after Update 15; Update 16 planned below)

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

## Next up: the owner's plan (agreed Nov 3, 2026). Build in this order, one numbered update and build each.
Updates 13-15 are built (below, kept for reference); 16 is not. Owner wants the game NOT too close to Pokémon
(copyright worry); mechanics are fine, copied wording and look are what we're removing.

### Update 13 (BUILT): text, words, Database split, side view
- **Text & dialog tab** (Database, GBA side): every built-in line (battle, menus, saving, learning) with its default
  shown greyed; typing replaces it; Reset restores. Fill-ins like `{name} attacks with {move}!`. Several variants per
  line allowed (picked at random; the ROM too). Command words live here as well. Store as e.g. db.gbaText
  { key: string[] }. Playtest: give TurnBattle a host hook (e.g. `host.line?(key, vars)`) used where the pocket
  layout speaks (TurnBattle.ts: intro ~183, weak/resist/crit ~213-215, "What will" ~447, steps in ~390/477, guard
  ~981, fled ~991/998, announces 662/746/820/901/963/1028, missed ~1148, immune ~1163, absorbed ~1170, defeated /
  knocked out ~1329, EXP / level lines in pocketResults ~1433-1439), plus GbaGame (gold ~738) and menus.ts (learn
  lines ~213). ROM: export the lines as strings (gba_game.py) and use them in game_systems.hpp battle() etc.
- **New default lines (owner approved):** A wild X appeared → "A Green Slime leaps out!"; What will X do? →
  "Jordan stands ready."; X used Y → "Jordan attacks with Quick Strike!" (spells: "casts"); It's super effective →
  "Struck a weakness!"; not very effective → "It was resisted…"; doesn't affect X → "Green Slime is immune!";
  foe fainted → "Green Slime is defeated!"; hero fainted → "Jordan collapses!"; Got away safely / Can't escape →
  "You got away!" / "No way out!"; grew to Lv. → "Jordan reached level 5!"; drop "1, 2, and… Poof!" (learning
  changes in Update 14 anyway). Remove "Go!" style lines (already "steps in").
- **Command words:** ATTACK / ITEMS / SWAP / FLEE (Saturn's own), playtest and ROM.
- **Party markers:** diamonds instead of balls (Saturn's orbStyle 'diamond' as Mimas's default).
- **Remove "Pokémon" from every user-facing editor label** (moveFields.ts h3 "Moves (GBA, Pokémon-style)",
  CombatEditor.ts option labels ~83/102, gba/types.ts backsprite help ~376, ui/typeChart.ts "super effective").
- **Database split:** ONE data file, TWO editor views: "Database" (only what the GBA game uses) and "Saturn extras"
  (everything mimasSupport.ts greys now). Build the views from src/editor/mimasSupport.ts's lists.
- **Side view is the default battle picture:** HeroDef.battleLook default = their character standing side-on facing
  the foe (right), scaled ×2 (whole steps). The mannequin stays an option (it's drawn from behind, so it would want
  a side pose to match).

### Update 14 (BUILT): classes, growth, skill trees, move list
- **Stats are class-only.** Every hero starts with 10 in each stat; heroes give no bonuses (grey out heroes' own
  stats / ranks). Each level the class adds its per-level stat bonus (allow fractions, keep the remainder, e.g.
  +1.5 → +1, +2…). Joining at level N = N-1 levels of their starting class's bonuses. Nodes, gear, items and effects
  add on top (example: Strength 10 → level up 12 → Strength node 15). Stat cap 100 stays unless the owner says.
- **HP / MP growth per class:** Database → Classes gets "Health growth" and "Magic growth" dropdowns, each a dice
  range: 1-4, 1-6, 1-8, 1-10, 1-12. Every level up rolls a new number in that range and adds it (always unique).
  Melee classes high HP (1-10, 1-12), mages low HP / high MP (HP 1-4, MP 1-12). Endurance bonuses add on top for HP.
  Retune enemy growth to keep pace. (The ROM's max_hp / max_mp must then come from stored rolled totals per member.)
- **Class change only through events:** commands "Unlock class" and "Change class" (opens a class picker, e.g. at
  an NPC). Changing keeps all stats so far; the new class's bonuses apply from the next level. Nodes unlocked
  under any class stay unlocked (stats and moves kept). The player can VIEW old classes' trees but only SPEND
  points in the current class's trees. One skill-point pool per hero.
- **Skill trees in GBA mode** (Saturn's: SkillNode in world/types.ts ~1990: grid x/y, parents, ranks, cost, level,
  effects {stat,value}, teachesSpell, teachesAddition). Skill points per level (Database → Combat). Nodes: stat
  boosts and teaching Additions / spells. A Skills page in the START menu (playtest and ROM), the editor's grid.
  Saturn's Classes tab: un-grey it (ClassDef: bonus, gear, trees) and add the per-level bonuses and growth ranges.
- **Moves: a vertical list, no limit, no loadout, nothing forgotten.** Physical moves (Additions) first, then a
  "[ Spells ]" divider row (not selectable), then spells. Each row: name, element icon + type, MP cost (0 for most
  Additions); the selected move's details in the note box. ROM: a scrolling list (it has pick() lists already),
  remembering the cursor. Replaces the 4-move system, the forget questions and the moveSlots setting.
  **Order (owner's answer):** Additions weakest first: sorted by strength (total power), ties in the order learned,
  so "Better Quick Hit" (stronger) sits below "Quick Hit". Spells sorted by MP cost (cheaper / weaker at the top),
  ties in the order learned. Enemies keep their up-to-4 moves.

### Update 15 (BUILT): timed Additions (Legend of Dragoon) with MP
- Bring back Saturn's timing-based Additions (currently cfg.additionTiming 'auto' + gba.css hides the QTE): a frame
  closes in around the target, press on time for each strike; a miss ends the combo. Playtest and ROM. Generous
  windows, adjustable, and an "Automatic" choice (for touch-control lag on Android).
- **MP regained per Addition, set per Addition in the Database:** "MP per hit landed" and "MP for completing it"
  (both custom numbers, so the owner can tune them against the bonus EXP).
- No Addition mastery. Timed spells OFF in one-on-one (maybe back if 3-character battles happen later).

### Update 16: saves, title, achievements, credits
- **Three save slots:** Save asks which slot (list: lead hero, level, map, play time; overwrite confirms); Load
  shows the same list. ROM SRAM has room; old saves become unreadable (bump SAVE_MAGIC). Playtest: three slots too.
- **Title screen:** layers: Saturn Engine's own skybox art (it is in the Saturn engine; it already has the
  artificial moon graphic, NOT the real moon Mimas; avoid anything Death Star-like) with a slowly scrolling cloud
  layer and trees in the foreground, looking up. GBA Studio gets a Title screen tab to swap each layer and set the
  cloud speed. Menu: New Game, Load Game, Achievements, Credits, Quit. **Quit (owner's answer):** on the GBA it shows a
  "You can turn off the power now." screen. (Later, maybe: a non-GBA build for Steam, where Quit really quits; the
  focus now is the GBA version.)
- **Achievements in GBA mode** (src/game/achievements.ts): rules event, switch, defeat, addition, spell, level,
  gold, item, party, and records (steps, kills, battlesWon, flawless, crits, additions, spells, itemsUsed, fled,
  deaths). Grey out quest rules and Saturn-only records (fish, trees…). Kept on the cartridge apart from the save
  slots (count across saves). "Achievement unlocked!" pop-up; Achievements screen from the title (and START?).
- **Credits:** reuse Saturn's Credits tab (un-grey it) for a credits roll.

## Things to know
- Update 15, timed Additions:
  - Playtest: TurnBattle.doAddition runs Saturn's startQte in GBA mode too (no forced 'auto' in GbaGame any more);
    windows × cfg.timingWindow / 100 (TurnBasedData.timingWindow, default 160); every strike's button is A
    (party.ts battleMoves; Z works as A in BattleScreen.onQteKey); the frame sits over the foe (startQte, gbaGrid);
    gba.css styles it square and shows one touch pad. AdditionDef.mpPerHit / mpComplete (BattleAddition too):
    per landed strike in onStrike, on completion in finishAddition. No Perfect / Missed popups in GBA mode. Spells:
    startSequence auto when cfg.gba.
  - ROM: addition_def.strikes[8] { power x100, time frames, window frames (already × timingWindow) }, mp_hit, mp_done;
    timed_additions (Combat → Addition timing). qte_strike() (game_systems.hpp) scales the qte_ring sprite (affine,
    double size) from 2 to 1 over the qte_mark at the foe; good 100%, perfect (within 18% of the window) 110%, auto =
    every strike 110% as before. Ailments only on a completed string. Sprites from gba_game.py qte_sprites().
- Update 14, classes / growth / skills / move list:
  - Rules (playtest src/gbaplay/party.ts = ROM game_systems.hpp): Member.tenths (stats ×10, start 100), hpRoll / mpRoll,
    nodes (skill ranks), points, moves = every move in the order learned. joinClass gives ClassDef.bonus once (abil.joined);
    growLevel adds ClassDef.perLevel (tenths), rolls hpDie / mpDie (unset 8 / 6) and pointsPerLevel. newMember: class
    boost, then level − 1 growLevels. max HP = base + Endurance bonus + hpRoll; max MP = base + mpRoll. Node stats add in
    totalsOf (only the seven stats; Saturn's other skill effects do nothing in GBA mode). Untrained weapon ×¾, untrained
    armor costs its type's stats, "Can't use" greyed in equip (playtest canWear, ROM gear_skill).
  - Move list: moveList / battleOrder (playtest) and move_list / move_list_rows (ROM): Additions by summed strike power,
    spells by MP at the known rank, ties by learn order. TurnBattle.gbaFightMenu is a scrolling list (ChoiceItem.divider,
    BattleScreen gba-moves CSS), lastMove per fighter; ROM pick() rows have `divider`, member.move_at remembers. The
    learnset / forget questions and moveSlots are gone (CombatEditor field removed; config field left unused).
  - Skills: memberTrees / nodeState / takeNode (playtest), member_trees / node_ok / take_node / skills_menu (ROM).
    Exported in gba_game.json `skills` (nodes sorted per tree by y then x = the page's order; Party trees left out),
    `classes` (bonus, perLevel ×10, dice, trees, gear), `gearKinds`, items' gearKind, pointsPerLevel, startPoints.
    MAX_NODES 64 (tools/gba_game.py), classes / trees ≤ 32 (bits).
  - Change class: Command heroClass op 'pick' (class trainer). ROM op CLASS who op cls silent (gba_events.py; enum in
    export.py); class_event / pick_class. SAVE_MAGIC is MIMAS08 (old cartridge saves are ignored); playtest saves
    from before are rebuilt at their level (loadMember).
  - Database: Classes and Skill trees tabs are on; heroes' Progression curve / Setting up stats are Saturn extras.
- Update 13, text / views / side view:
  - Lines: src/gba/text.ts is the one list (TEXT_LINES: key, group, label, default versions, `word` for command words);
    db.gbaText holds only overrides (cleanText). gbaLine(db, key, vars) picks a version at random and fills {name}
    {foe} {target} {move} {item} {n} {level} ("A {foe}" → "An" before a vowel). Editor: src/editor/TextEditor.ts
    (Database → Game → Text & dialog). Add a line: add it to TEXT_LINES, then use it in the playtest (host.line /
    GbaGame.t / MenuHost.t) and the ROM (txt(mimas::T_<key with _>, tv().N(..).F(..).M(..).num(..))).
  - Playtest: BattleHost.line?(key, vars) → TurnBattle's private T(key, vars, fallback) (Saturn keeps its own words when
    the host has no line()). GbaGame.line swaps battle.appear for battle.appear_event when the battle isn't random
    (wildBattle). Menus get MenuHost.t.
  - ROM: gbaGame.ts exports `text` (every version by key) into gba_game.json; tools/gba_game.py text_table() reads the
    keys from text.ts (regex on the L(/W( lines) and writes text_lines + enum text_id { T_... }; non-ASCII punctuation is
    turned plain (c_str's ASCII map). game_systems.hpp: struct tv (fill-ins, chained setters) and txt(id, tv) →
    bn::string<160>. Battle `t` strings are 160 long.
  - Database views: mimasSupport.ts tabInView(tab, view) / markMimas(content, tab, view) (classes db-view-gba /
    db-view-saturn / db-partial; CSS in editor.css hides by view; jump buttons follow). lastView is remembered.
  - Battle picture: HeroDef.battleLook mode 'default' (unset) = heroSideImage (battleArt.ts: the GBA overworld sheet's
    left standing frame mirrored, ×2 at most via fitInto's `most`); 'mannequin' = GBA Studio's back sprite (null from
    heroBattleImage; also the stand-in when a hero has no character). The editor's save bakes gba/heroes/<id>_back.png
    for every non-mannequin hero; gba_game.py uses the mannequin only for 'mannequin' or a missing picture.
  - Party markers: menus.orbStyle unset = 'diamond' (GbaGame, Game, the Database's select); the project's 'flat' was
    removed so it shows diamonds. FNT is KO now (playtest party list and the ROM).
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
