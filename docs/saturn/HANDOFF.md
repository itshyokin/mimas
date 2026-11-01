# Handoff: where the project stands (Oct 21, 2026, after Update 103)

A summary for picking the work back up in a new Claude session or account. Everything is committed to
`itshyokin/hd2dengine` (branch `main`). To start a new session, attach the repo and say: *"Read HANDOFF.md,
NOTES.md and README.md, then continue with the next update."*

## What this is
The **Saturn Game Engine** (named Nov 1, 2026; formerly "2.5D Engine" / hd2dengine): an HD-2D RPG engine (TypeScript + three.js 0.149 + Vite): pixel sprites in a 3D tile world, a Map Editor with
a full Database, a Character Builder, and a playtest game. It has turn-based battles (FFX-style turn order,
Legend of Dragoon-style Additions and Guard, battle maps); on the map the sword and bow are field tools and
bumping into (or striking) a foe starts a battle. It builds to standalone HTML files and runs on an Android tablet through the online editor.

- `README.md`: the full feature guide (what every tool, tab and command does).
- `NOTES.md`: the to-do list and roadmap, with ticked items. **This is the master plan.**
- `HANDOFF.md`: this file.

## Pick up here (state as of Oct 25 evening: Updates 115–136 done (Oct 25 list finished; 135: prop collision grid Width × Height; 136: Sign text boxes with a window colour); next: the older Future list, planned with the owner)
- **Update 161 (Nov 1):** renamed to the **Saturn Game Engine** (README, page titles, editor brand, playtest panel,
  package name; save/settings file formats unchanged). GBA fork started as **Mimas** (`itshyokin/mimas`: exporter +
  Butano runtime).
- **Update 160 (Oct 29):** 3D maps change with the seasons: Blender materials named `ter_grass` (any tile id/name) use the game's tile picture; `_season` / `_foliage` tint their own textures. World3D `seasonal()`.
- **Update 159 (Oct 29):** 3D maps see further (fog ~80–180 m); lighting guide in docs/BLENDER_3D_MAPS.md.
- **Update 158 (Oct 29):** Draco and Meshopt compressed models load; Blender doc section on keeping maps small.
- **Update 157 (Oct 29):** 3D view: the player start can be selected, moved and turned (keeps its floor height);
  Move / Turn / Size buttons and a controls hint on screen.
- **Update 156 (Oct 29):** Trigger and encounter volumes, monsters on 3D floors. Checked in the browser (volume fired
  its event, zone A inside the box, monster on the platform, walls block grid walkers).
- **Update 155 (Oct 29):** The editor's 3D view (fly, right-click to place, gizmos) and events placed in 3D.
  Checked in the browser (scene shown, right-click → new event at the exact spot).
- **Update 154 (Oct 29):** 3D maps from Blender, phase A (tags, mesh collision, third-person hero and camera,
  water, kill zones; docs/BLENDER_3D_MAPS.md). Checked in the browser with a generated tagged scene.
- **Update 153 (Oct 28):** 3D model maps, phase 1 (a GLB as the ground, walked on as shaped). Checked in the browser
  with a generated GLB (platform heights, model drawn, tiles hidden).
- **Update 152 (Oct 28):** Grid movement (2D), map folders, MV sheet import, flat props sway / rustle. Checked in the
  browser (grid steps, flat instancing, MV A2 import).
- **Update 151 (Oct 28):** Frame autotiles, edge trims, inside corners, Edges-block passage, upper tiles decide
  passage, 2D feet / body alignment. Checked in the browser.
- **Update 150 (Oct 28):** Editor: right bar gone (selection in the left bar), left bar resizable, tile ✎ settings,
  tick to delete / group tiles and props, groups show / hide, built-in tiles can be animated. Checked in the browser.
- **Update 149 (Oct 28):** Props from a tileset sheet (box-select tiles); picker checked in the browser. RPG Maker plan done.
- **Update 148 (Oct 28):** Wall tiles (A3 / A4) and the per-map Height option (flat by default in 2D); checked in the browser.
- **Update 147 (Oct 28):** Upper terrain layer and O / X / ☆ passage; ☆ over the hero checked in the browser.
- **Update 146 (Oct 28):** Animated tiles and RPG Maker A2 autotiles (tile editor → Kind); checked in the browser.
- **Update 145 (Oct 28):** 2D / 3D mode and the Player layer (Database → View & camera); checked all four sort cases
  in the browser. Next (agreed with the owner): RPG Maker-style tiles, see NOTES Update 145.
- **Update 144 (Oct 28):** Prop layers 0–25 (brush, inspector, prop editor default; no z-fighting on overlaps) and
  the Backpack's Use / Equip pop-up menu, wider bag, no controls line. Checked in the browser.
- **Update 143 (Oct 28):** Camera angle goes to 90° with a *Top-down 2D* preset (flat sprites, fog follows the
  distance, no tilt-shift when steep). Checked in the browser at 90° and 75°.
- **Update 142 (Oct 26):** Characters always on top now also controls the ground yield (off by default: trees and
  ledges in front hide characters), hold B to dismount, Backpack layout (icons, 8 columns, details at the bottom), no
  Party menu corner buttons, Achievements tab strip, Database → Player → A button.
- **Oct 25 night list (137–141, NOTES):** 137 done (genders + Database → Party → Genders, no built-in drops,
  custom worn sprite fix, nothing on the back, Warmth numbers, Sprint key item); 138 done (loot and shop goods by category); 139 done (Characters always on top in Database → Camera, prop Flat mode; browser-checked: on draws the hero over a pine); 140 done (Party arrows, no stamina on stat pages, EXP under HP / MP, equip from Status → Gear; checked); 141 done (START Settings + Save / Load / Quit and icons, X Party + Journal with LT / RT and LB / RB, B Backpack, Y World Map with your own marker, Achievements in the Journal, toggles). Owner to try 141 on a controller.
- **Update 133 done:** Database → Items → Materials tab; Cannot be sold on any item; icon effects (glow, outline,
  pattern: stripes / dots / cracks / swirls / checker, each with a colour).
- **Update 132 done:** four quick slots (D-pad ↓ = slot 4, Release target on the left stick) taking key items; no
  map sword / bow (Machete = Cut, Hunting Bow = Bow, built in and in the starting bag); lock-on only switches /
  targets; no ambushes; Change weather / season lists and the Change time pop-up with the bubble fast-forward.
  Browser-checked: HUD slots, Cut swing, Bow shot, time picker, bubble (8:00 → 13:00). Weather list not screenshot.
- **Update 131 done:** Database → Story → Global events (scripts run at a new game, a load, a sleep, entering a rest
  zone, a new real day); someone joining in a rest zone walks in from off-screen. Browser-checked (editor tab, the
  queue and the day rollover); the walk-in is not screenshot-checked.
- **Update 130 done:** Journal tab icons, order / shown in Database → Title & menus → Journal, the Show / hide a
  Journal tab command; roleplay Date answers and the Roleplay date condition (real date). Browser-checked.
- **Oct 24 night list (125–128) done:** Skyrim lockpicks with a required Lockpick item and a pixel-art lock, prop
  reflections, bag Unequip, save portraits, Attack menu, compact swap list; meter / orb styles; gender, outfit
  gender, roleplay, gift reactions, Status page relationships + roleplay; built-in clothing (30 parts) with the
  three-panel Look when worn editor and starter outfits. Owner to check all of these in game. (Browser-checked: Status
  page, lockpick screen, meter styles, roleplay / relationships, the Look when worn editor and an outfit + cape on the
  hero. Not screenshot-checked: the battle Swap list's new compact rows: headless battles stall in their intro.)
  Note: Vite only serves files added to public/ after it started once it's restarted.
- **Oct 24 late list (121–124) done:** fixes (breath, chatter height, snowy leaves, bag equip), camp (ghost walking,
  talk at camp, camp lines with conditions, group chatter), footprints and puddles, relationships (one-way ratings,
  battle sources, events / conditions / quest rewards, Journal tab, Database → Party → Relationships). Owner to check
  these in game too. Mini-games (blackjack, swordplay, magic sequences, CHESS later) are on the NOTES list.
- **Next work:** Updates 115–120 are done (owner's Oct 24 playtest notes, NOTES.md). Owner to check in game: rider
  height on the horse, horse sounds / speed lines, reflections of everyone, the Drying bar, the default settings file,
  key item field uses, locks (Inspector → Lock settings) and lockpicking, worn looks built from builder parts, and a
  4-hero battle. (Update 120 checked in the browser: plate torso + legs built from builder parts, drawn over the hero, 15 animations.) After that: the older Future list (plan with the owner first).
- **Oct 24 list (done):** planned in NOTES.md as Updates 107–114 (107 fixes, 108 dates,
  109 fishing / swimming, 110 riding sprites, 111 battle look, 112 terrain looks, 113 tutorials + skill tree locks,
  114 equipment changes the look). Work them in order; tick each in NOTES and update this file per commit. After
  them: the older Future list (NPC routines, map management, button prompts, crafting, copyrighted names).
- Oct 22 late: Database → Player → Party size (`db.activeParty` 3 | 4; Game `activeMembers` getter replaces the
  ACTIVE_MEMBERS constant in activeWhos / lineup / PartyScreen `active`). Added quickly at the end of the weekly
  limit and only type-checked (Oct 24: in Single mode the active count is Combat → Heroes who fight (Single)):
  test a 4-hero battle (BattleStage places extra fighters a step behind the markers;
  the battle HUD / Pocket layout with 4 heroes is untested).
- **Recent direction (owner's taste):** the game is moving to a Pokémon Gold/Silver/HGSS handheld feel: the
  **Pocket Handheld** battle layout with Single mode, a high (56°) map camera with sprites leaning back, soft-blocky
  cliffs like HGSS ledges, handheld-style Party and Status screens. The old ABS/real-time systems are gone
  (fighting styles were removed in 89). Battle text should read like the handheld games, one line at a time,
  waiting for OK where the player needs to read it.
- **Battle flow (Pocket Handheld):** move announced (no button) → strike → attacker steps back (`STEP_BACK`) →
  target flashes, HP bar drains with numbers counting (`DRAIN`), battle waits (`pauseText`) → lines ("A critical
  hit!", "Jordan was poisoned!") wait for OK. With Rounds, burn/poison bite at round end. After the last foe:
  "Victory!" (fanfare) → each hero's EXP line (bar fills once, `fillXp`) → their level up → loot. Nothing touches
  the EXP bar before "Victory!".
- **Ailments:** one at a time per fighter; shown as pills (`statusPills.ts`) beside name/level; they last into the
  next battle per ailment (`stays`, Database → Combat → Ailments) until cured, rested or worn off.
- **Known small things / ideas:** lingering ailments aren't on the HUD party cards yet (only Party/Status pages);
  a very faint crease can show where a soft-blocky bevel meets the flat top; the grass lip on Cliff-style rock
  mostly shows along the top edge because the jagged face juts out.
- **Testing in the cloud workspace:** a small Playwright harness drives the game (`window.__game`); tests that
  reshape a map do it by intercepting `01_monolith.json` and editing heights/styles/props in the response. Swiftshader
  is slow: shrink the viewport to 480×270 while waiting, use `waitForFunction`, and drive input with
  `__game.input.press('ok')`.

## How we work (conventions to keep)
- Work in numbered updates ("Update 63", small follow-ups "63b"). Each update: build it, test it in the browser
  (Playwright headless, with the game exposed as `window.__game`), update README.md and NOTES.md, then commit and
  push to `main`.
- Before committing: `npx tsc --noEmit`, then `npm run build:standalone` (rebuilds `Map Editor.html` and
  `Playtest.html`, which are committed).
- Before pushing: `git fetch -q && git rebase -q origin/main` (the owner also commits from other machines).
- Never commit `package-lock.json`.
- Dev server: `npx vite --port 5190 --strictPort`. Typecheck: `npx tsc --noEmit`.
- Preview visual changes (screenshots) before or alongside committing; the owner playtests and reports back
  with annotated screenshots.
- Tone of the docs: plain words, what the user sees and does, no internal jargon.

## Done so far (recent highlights; the full list is under "Done" in NOTES.md)
- 50–54: playtest fixes, HUD rework, styled text, Bestiary, text box styles, seamless maps, Map Properties,
  the sky over Titan with the real moon phase, sleeping, dynamic weather and temperature.
- 55: stat growth ranks (A–F) and stat setup on a 3D dice table (Roll Dice / Point Buy / Standard Array).
- 56: Duplicate / Copy / Paste in every Database list (right-click, Ctrl+D / C / V).
- 57: turn-based party on the map, lineup leader sprite, achievement pop-up with description and points bar.
  57b: everyone uses the plain idle pose in battle.
- 58: event sounds that fade with distance (campfire, shore, waterfall, hum).
- 59: Map Themes Database tab, more map edges, built-in dirt / stone / rock / snow terrain, desert and snow props.
- 60: Game Boy-style chiptune built-in sounds and music; console `audio_chiptune true/false`.
- 61: hero-coloured turn ring and card glow; self-switches A–D; Switches window (+ / − / rename).
- 62: bridges and platforms (wood, rope, stone, docks), edge scenery follows edge heights, props half-submerged.
- 62b: height styles (Blocky, Soft blocky, Smooth hills, Cliffs), waterfalls, two-level bridges (swim under).
- 63: window themes (Ember, Medieval Parchment, Medieval Wood, Dwarven, Elvish, Titan) for menus, text boxes,
  battle panels and the HUD; default in Database → Menus, player choice in Settings → Gameplay.
- 63b: soft-blocky and cliff seam fixes; bridges keep walkers on them (along the bridge only, on and off at
  the ends; same for the party and enemies).
- 64: seven stats (STR, DEX, AGI, END, DEF, MAG, MDF), hits can miss, buffs and debuffs in battle (Haste, Slow,
  Support spells, enemy Buff actions), the Party skill tree shared by everyone.
- 65: the real-time battle system removed (sword and bow are field tools; bow lock-on snipes to strike first;
  Assassinate and Silent Shot reworked; old real-time skills updated); Database forms with switches at the top and
  a jump bar; Database tabs regrouped (Party, Battle, Abilities, Items, Story, World, Game).
- 66: impact materials (hit sounds and effects per enemy), big CRITICAL / WEAK / IMMUNE with shake and thump, a
  battle log on the left (Y scrolls it), monster stat blocks across the top (Database switch) with a boss overdrive
  gauge.
- 67: Push / Pull to GitHub from the online editor (tablet editing without GitHub Desktop): `githubSync.ts` (GitHub
  web API: blobs, tree, commit, ref; compare for changes on both sides) and `githubPanel.ts` (Project menu).
- 68: support spells on either side (`supportTarget: 'any'`), whole-battle buffs (`BuffGrant.whole`), battle
  weather (`WEATHER_EFFECT` / `battleWeather` in `battle/rules.ts`; TurnBattle's `setWeather`; Game's `battleSky`
  shows it around the battle); Haste, Slow and Rain Call added to the project's spell list.
- 69: built-in tiles can take a picture of your own (`TileDef.skin`; an entry in assets.json with the built-in key;
  `TileCatalog.textured()` / `isCustom()` mean "drawn from a picture").
- 70: classes (`src/game/classes.ts`): one-time stat boost (`AbilityData.joined` remembers every class held),
  Trained / Untrained / Can't use per weapon type, armor weight and shields (`gearSkill`); Game's `statGear` adds the
  class to worn gear for stats; players can no longer change class from the menu.
- 71: enemy levels (`src/game/enemyLevels.ts`: `atLevel`, ranges on zones / troops / encounter lists / enemy events,
  dynamic levels in `GameState.enemyLevels`); EXP per foe as it falls (TurnBattle `foeDefeated` / `strikeExp` host
  hooks, Game's `earned`), EXP Share / EXP All (`ItemDef.exp`); misses for Additions and spells (`strike()` takes
  `sure` / `spellAccuracy`; `Battler.spellEvasion` from MDF), Accuracy / Evasion buffs.
- 72: spell additions (`SpellEntry.sequence`; `spellSequence()` in rules.ts; BattleScreen `startSequence`; TurnBattle
  `castSequence` passes `{ mult, clean }` to `unleash`).
- 73: Single battle mode (`TurnBasedConfig.mode`): TurnBattle plans the hero's action first (`planRound` / `defer`),
  then rounds fastest first; `forceSwap` after a KO; `waiting` foes and `nextFoe` for One at a time
  (`TroopDef.pick`); Game's `singlePool` limits who can swap in.
- 74: Single mode defaults: Game's `pickFor()` (troop / event `pick`, then `MapData.encounterPick`, then
  `turnBased.singlePick`, default wild).
- 75: horses (`src/game/horses.ts`, `src/art/horseArt.ts`; `GameState.horse`; Game's `riding`, `mount`,
  `dismount`, `updateHorse`, `horseArrive`; Stable / Horse event commands; PlayerMotion `noSwim` and `leap`).
- 76: griffin flights (Griffin roost command; `GameState.roosts`; WorldMapScreen `pickSpot`; Game's `startFlight`,
  `flightGround`, `updateFlight`, `startFlyAway`; `griffinSheet` in horseArt.ts; Database → Travel).
- 77: Pocket Handheld layout (`turnBased.layout: 'pocket'`): BattleScreen `pocketBlock`, `setSpheres` (TurnBattle's
  `updateSpheres`), `.layout-pocket` CSS; BattleStage `pocket` and `pocketCamera` (searches for a spot putting the
  hero lower left and the foe upper right); heroes get a `back` picture; `SINGLE_MAX = 4` in combat/config.ts.
- 78: Pocket CSS sized in `--u` (container units on `.battle.layout-pocket`); TurnBattle `showXp` / `pocketResults`
  (host `xpPreview`), BattleScreen `setXp` / `pocketVictory`; `VictoryHero.via` and `bonus`; GameMenu scrolls the
  chosen row into view; themes.ts fills under the frame (`background-clip: border-box`) and frames `.hud-xp`.
- 79: element stones: `src/game/essence.ts` (rules, built-in items via `withEssenceItems` in migrateItems,
  `affinity`), `ItemDef.essence`, `Inventory.elements` / `MemberData.elements`, holder keys `elem:<who>:<k>`,
  EquipScreen slots `element1` / `element2`, `Battler.affinity` (in `strike`), `ElementalDefence.weak`; Game's
  `heroAffinity`, `heroDefence`, `fragmentDrops`, `fuse`; `src/ui/elementPill.ts`, `src/ui/typeChart.ts`; forge
  shards dropped (GameState load keeps only levels).
- 80: forms: `HeroDef.forms`, `GameState.forms`; Game's `applyForms` (sets `db.player` / hero `look` / `face`
  from `formBase`, then `refreshLooks`: caches cleared via `SpriteLibrary.clearPictures`, leader and allies
  rebuilt), `nextEvolution` (when calm) and `src/ui/EvolveScreen.ts`; `EnemyDef.advance` used in `levelled`;
  Bestiary `forms` chain and order; editors: HeroesEditor `heroForms`, CombatEditor `advancedForm`.
- 81: BattleScreen `narrate` / `narrating` (queue, `.pocket-text`, `.cmd-off`); TurnBattle `tell`, `announce`
  (+ `announced`), `tellHit`, `combo` (an Addition's total) and `foeMove`; TurnBattle.update waits while narrating;
  `pocketResults` lines with `stats`. Settings `quality: 'potato'` (pixelCap 0.7 off battle maps, applySettings
  re-run when a stage opens / closes) and `cloudShadows`.
- 82: `announce` narrates without waiting and `later`s by the typing time (`TYPE_SPEED` in BattleScreen) + 0.55 s;
  `tellHit(crit, weak, resist)`; `pickTarget` skips the choice in Pocket with one on the usual side; themes.ts
  `retro` look and the Pocket selectors in SMALL.
- 83: themes.ts `WindowStyle` (`applyUiTheme(id, style)`, `tintFrame`, `tintHex`, `windowBackground`, `emberCss`);
  Settings `windowOpacity` / `windowColor` / `windowText` / `windowAccent`, `MenuConfig.window`; TurnBattle `win`
  (Pocket: fanfare + tell first) and `pocketResults` order; Game's outro runs `nextEvolution(after)` before the fade in.
- 84: BattleScreen `pickFromLists` (mode `lists`, `.pocket-pick`), TurnBattle `itemLists` / `itemOnBench`; Input's
  keydown blurs a focused non-typing element instead of ignoring the key; themes skip `.hud-top.hud-compact`.
- 85: `Database.overworldCamera` (`src/game/cameraDefaults.ts`), Game's `overworldCam` / `cameraOffset`;
  `src/render/lean.ts` (`patchLean` on sprite, character, depth and distance materials; `setLean` each frame, 0 on
  battle maps). Torch flames don't lean yet.
- 86: dom.ts `compactForm` (adds `.db-compact` and the "i" buttons that open a field's hint) and `checkList`;
  DatabaseEditor `COMPACT_TABS` (list tabs compact the item form, others the whole page as `.db-page`);
  elementFields `elementTable`; enemy Boss / Undead / Bestiary switches are loose so formLayout gathers them.
- 87: `src/game/battle/statusPills.ts` (defaults + `statusPills()` merge), `TurnBasedData.statusWords` /
  `statusPills`, BattleScreen `setPills` and the `.st-pill` after `.pb-lv` (Vitals status entries carry `ailment`);
  BattleStatus `give` refuses a second ailment; `elementPill` is now icon + `.el-pill-t`; render/lean.ts `leanWith`
  used by combat/Held.ts; TurnBattle.update ticks `wait` while narrating; settings.ts `normalizeSettings` keeps the
  optional keys (uiTheme was dropped on every load); themes.ts covers `.pc-actions`, `.pc-swap`, `.sk-name`, and a
  stronger selected-ink rule.
- 88: terrainGeometry `bevelEnds` / `bevelProfile` (tapered bevels and walls; closing triangles gone; no shoreline
  rounding on 'b'); BattleScreen `fillXp`, `pauseText`, `after`, `tickNumbers`, `DRAIN`, Narration `pause` / `icon`;
  TurnBattle `STEP_BACK`, `roundEnd` / `bitRound`, `partyAilments`; BattleStatus `bite`; Game `heroAilments` (saved),
  `lingering`, `clearLingering`, `keepAilments`, `ailmentPill`, MemberData `ailments`; StatusPill `stays`; AllyHost
  `regenHp`; PartyScreen rewritten (`.pr-*`), CharacterScreen pages (`.cs-summary`).
- 89 (part 1): CharacterScreen without styles (`.cs-cols`); terrainGeometry `SOFT_LOOK` { round, lip } (both 0 for
  now; `globalThis.__softLook` overrides for previews), `bevelRounds`, `bevelArc`, `LipFn`, QuadList `extra`;
  render/lipFade.ts `patchLip`; WorldBuilder lip meshes.
- 89 (part 2): `SOFT_LOOK` { round 0.5, lip 0.5 }; `concaveRound` / `bevelInner` (inner corners: the lower cell draws
  the curve, the plateau cells trim their strips and walls); QuadList `add(..., light)` (soft cells lit flat); lip
  for every style via `lipFn`.
- 90: lip meshes use nearest-filtered copies of the ground textures (a mipmapped copy showed as a pale green line on
  slanted/curved walls) and their top edge rises `LIP_RISE` above the ground; world/Lights.ts `leaners` move prop
  flames, lights and ember origins with `leanNow()` (torches no longer float); TurnBattle: Pocket `expPop` does
  nothing (no mid-battle EXP bar moves), `pocketResults` puts each level up right after that hero's EXP line,
  `GOT_AILMENT` lines on inflict; propShapes.ts `copy()` and shapes `crossStar`, `rows`, `thicket`.
- 91 (part 1): PartyScreen rows are tall boxes (`.pr-row` with `.pr-art.pr-face`, EXP bar + `.pr-xpnum`), CSS at the
  end of styles.css; InventoryScreen `partyPanel()` is now the `.ip-pop` "Use X on whom?" pop-up (target mode only).
- 91 (part 2): render/lean.ts keeps the upright depth (`hdUpright`, gl_Position.z) and skips materials with
  `userData.noLean` (wall props, set in sprites.ts); PropDef `stretch` (WorldBuilder `stretchTo`), `rustle`
  (Game `findRustlers` / `updateRustle`, instance wobble); built-in `tall_grass`, `tall_grass_xl`, `wheat`
  (placeholderArt `grassClump`, `wheat`); sfx `rustle`, `lowHp`; TurnBattle `fought` / `noteFighting` (EXP to every
  participant), `lowHpAlarm`; stats.ts MP no regen by default, AllyHost `regenMp`; `COIN_SVG`; bar colour CSS
  variables `--c-hp/mp/xp/sp` (block at the end of styles.css, set from `MenuConfig.bars` in applySettings),
  `staminaSteady`; `src/ui/partyLayout.ts` + `src/editor/PartyLayoutEditor.ts`, PartyScreen renders `.pr-panel`s
  from it; TileDef `flat` (tileTextures `flatNormal`, painted ground cells flattened).
- 91b: render/lean.ts `patchGroundYield` (terrain, water and edge scenery pushed `GROUND_YIELD` back in depth while
  the map camera leans; applied in WorldBuilder to everything built before props and buildings); TurnBattle
  `foeEarned` reads a swapped-out hero's health from the host (`readVitals`).
- 92: audio/sfx.ts `loopGen` (a newer `playLoop` wins and stops the old loop: no music under battle music); louder
  `lowHp`; CharacterSprite `facesAllWays` (the battle 'hit' only plays 'hurt' when it has 4 directions); PostFX
  `focusBand` (2.2 on the battle stage so tall foes stay sharp); Game `titleLeaving` (title look kept through the
  fade-out, dropped in the transfer's load phase); Restore defaults confirm; console `reset_achievements`;
  Additions live on the Equipment page (equipHost `style`/`setStyle`, `ensureAddition` gives Quick Strike or
  `defaultAddition`, `attackStyle` → `{ additions, addition, shoots }`); HeroDef `noAdditions` + `plainAttack`
  ('ranged' → Battler `shoots`, BattleStage 'shot' anim); inventory `arrow()` only returns an explicitly equipped
  arrow, field bow ignores arrows; Equipment `.eq-left` column, top-aligned; LT / RT (`subPrev`/`subNext`) switch
  hero on Equipment (even locked), Status (`order`) and Skill Tree (`otherHero`); Swap first in Party actions; menu
  hints use `input.label(...)`.
- 93: `src/game/restore.ts` (`restoreAmount` / `restoreBits` / `upgradeRestore`): ItemDef `restorePct` beside
  `restore` (amount + % of max; old `restorePercent` items read as %, the Items editor converts them; the checkbox is
  gone); battle items restore MP too (TurnBattle `itemOnFoe`, BattleItem `pct`). PropDef `frontOfTiles` (false →
  sprites.ts sets `material.userData.hdBack`, and patchLean pushes that prop back by `GROUND_YIELD` so it sorts with
  the yielded ground); checkbox in PropImporter. Battle log Next plays `menuOk`. Battle fog starts 1.8× further out
  (the sky dome already draws on stages; it was mostly hidden by fog). Database → Time `skySpeed` (sleep's sky pass:
  `PASS = min(12, 5 + hours × 0.55) / skySpeed`, slower than before). Battle spell lists: ChoiceItem `inlineIcon`
  (element icon, or the tinted magic picture for non-elemental; spells have no Database icon of their own). First
  draw of a fighter's bars skips the CSS transition (`.no-anim`, PocketBlock `drawn`), so no drain from full.
- 94: PropDef `deck` editable in the PropImporter ("Walk on top" + "Drawn as"); DeckDef `art` (drawn as the prop's
  picture: buildDecks skips it, WorldBuilder keeps its sprite); imported decks cover their footprint (`footTiles` in
  placeDecks); `blockedTiles` / `propBoxes` return nothing for decks; PropCatalog gives customised built-in bridges
  saved without a deck the built-in's deck with `art` (unless `noDeck`). Palette keeps `.side-body` scrollTop per tab
  (`shownMode`); `propPicks` + `.sprite-tick` + `.prop-picks` bar; `src/editor/PropBatchEdit.ts` (settings table,
  only changed keys applied); assets.ts `saveProps` (one assets.json write, entries replaced in place). Customised
  built-ins are now "saved in assets.json", not "has an image".
- 95: attributes.ts `setAttrOrder` reorders `ATTRS` in place (Database `statOrder`; EditorStore's `db` setter and
  `changedDb`, Game after loading); statusFields `orderedBuffs`. Armor types: `ArmorTypeDef`, Database `armorTypes`,
  classes.ts `DEFAULT_ARMOR_TYPES` / `armorTypes(db)` / `gearKinds(db)` (GEAR_KINDS and UNTRAINED_ARMOR gone;
  `armorWeightOf(d, db)` and `gearKindOf(d, db)` take the db), ItemDef `armorWeight` holds a type id;
  `src/editor/armorTypesEditor.ts`, ItemsWork `armorTypes`. Item tabs: ItemsEditor `ItemCat` / `ITEM_CATS` /
  `itemCategory` / `itemsTab(..., cat, goto)`; DatabaseEditor `catState`, listOf `insert`. Icons: itemIcons.ts
  `MORE_ICONS`, `ICON_GROUP_LIST`, `iconGroups()`, `builtinIcon(name, tint)`, `tintCanvas`; ItemDef `iconTint`;
  ItemsEditor `iconGrid` / `tintRow`. SpellEntry / BattleSpell `icon` + `iconTint` (TurnBattle magicMenu).
  Classes: AbilitiesEditor `classTrees` (dropdowns; checkboxes were swept to the top by formLayout) and
  SkillsEditor `treePreview`.
- 96: DeckDef `stand` (art decks lie flat unless set); WorldBuilder draws flat art decks as planes at `deckY`
  (max `deckAt` over the footprint) and standing ones at that height; Game `findWetProps` skips decks; PropDef
  `noTilt` (sprites.ts sets `noLean` like wall props); importer "Drawn as" art / artStand and "Camera tilt"; batch
  edit `tilt`; Palette `.prop-sticky` wraps everything above the Built-in list.
- 96b: PropDef `walkSound` (a FootMaterial name or a sound file / effect); Game `walkSounds` (tile → sound, built
  with findWetProps; decks default to their style) used by `footstep` (decks only while `onDeck`); CommandEditor
  `walkSoundOptions` / `walkSoundField` (importer Behaviour tab, batch edit).
- 97: ShopScreen `render` keeps scroll + scrollIntoView (`draw` builds); pocket `.list-mode` CSS (taller list, the
  hero block moves up); items `inlineIcon`; status.ts `buffChip`; BattleScreen `BuffChip`, `buffChipsHtml`, Vitals
  `buffs` (into `.pb-foot`, none over the head in pocket), PickList rows `buffs`, ChoiceItem `buffs` + `bars` (Swap
  / Send in list: face, bars from `xpPreview`); TurnBattle `chipsOf`, doItem `announce`s "X used Y!", applyItem
  `pauseText` then "X recovered N HP!"; InventoryScreen mode `healed` + `playHeal`; party.ts: no auto get-up, KO'd
  ally hidden until hp ≥ 1; ItemDef `revive` (Game.useItem: KO'd only with a revive, revive only on KO'd; hero too);
  bag targets no longer disable the KO'd.
- 98: BuffKind `statGuard` (TurnBattle giveBuffs refuses lowering: DEBUFFS or negative amounts); ItemDef `levelUp`
  (Game `levelUpBy`, bag only); console `achievements_allow` (GameState `allowAchievements`, `cheat()` checks it);
  weapon types: `WeaponTypeDef`, Database `weaponTypes`, classes.ts `DEFAULT_WEAPON_TYPES` / `weaponTypes(db)` /
  `weaponTypeName` (WEAPON_TYPES and WEAPON_TYPE_NAME gone), `weaponTypeOf(d, db)` (custom types' words first);
  armorTypesEditor.ts `openWeaponTypes`; SkillNode `trains` (Skills `trains(kind)`, `gearSkill(db, a, d, sk)` and
  `classStatGear(..., sk)`; Game `skillsOf(who)`, `statGear(gear, a, sk)`); SkillsEditor "Trains with" chips.
- 99: props.ts `footZ(def, x, z, step)` (wall props: the footprint's front edge is the wall's foot, matching
  wallAnchor) and `StepFn` / `stepOf(map)`; footTiles / blockedTiles / propBoxes take the step function (Game and
  WorldBuilder pass `stepOf(map)`, the editor `store.propStep`); marks `blocks()` ('#' or 'X') and `behind()` ('*');
  PropImporter grid `Mark` cycles X → O → ★.
- 100: WaterStyle `look` / `lines` / `noFoam` (`isToonWater(st)` in waterStyles.ts: toon unless it glows);
  waterEdge.ts `patchToonWater` (applied after patchWaterEdge: wave dashes from world pixels, foam from the shoreline
  mask, whose border now repeats the edge cells) and `toonWaterTime` (Game sets it to `elapsed`); toon water has no
  normal map and roughness 1; Game `wetProps[].ring` (pixel ring decal, pulses, hidden when the prop is gone);
  Palette water form: Look, Wave lines, Shore foam.
- 101: render/models.ts `parseModel` (GLTFLoader / FBXLoader), `bakeModel` (world transforms applied, parts merged
  per material, attributes normalised to position / normal / uv / color, fitted: y ≥ 0, front edge z = 0, back
  z = -d), `modelSize`, `modelThumbnail` (shared offscreen renderer, the map camera's angle); PropDef `model`,
  `modelRot`; SpriteLibrary `model(id)` / `loadModel` (preload); WorldBuilder draws models as InstancedMesh with
  material arrays in the same slots map (hideProp, burnt-out, cutting work unchanged); PropImporter State `model`,
  `remodel()`; PropImages `model`; dev and editor servers accept and serve assets/props/*.glb|fbx (vite.config.ts
  serves prop models from disk, since Vite only knows public files seen at start).
- 102: render/characterModel.ts: `loadCharacterModel` (main file + `extra` action files; root bones' x/z travel
  flattened), `clipFor` (named, '' none, or guessed by GUESS regexes), `ModelRig` (SkeletonUtils clone fitted to
  `height`, `loop` / `once` / `pose` / `release`, `face` with smooth yaw, LoD outline = BackSide shell on smoothed
  normals `hdOutlineNormal`), `renderCharacterPicture`. SpriteAsset `rigged`; SpriteLibrary `modelLook`,
  `charModel`, models loaded in `preloadCharacters`; standingFrame / portrait render models. CharacterSprite `rig`
  (mesh is an invisible holder), SLOT_OF maps sheet names (slash → attack, hurt → ko or a flinch → injured, kneel →
  injured…); Motion gains swimming / sitting / injured. Editor: characterModelEditor.ts, CharactersWork `look`.
  Dev / editor servers accept and serve assets/models/**/*.glb|fbx.
- 102b: ModelStyle `{ look, outline }` (`modelStyle(db)`; Database `modelOutline`); CharacterModel `battleScale`
  (ModelRig `battleScale`, default 0.5; BattleStage multiplies the fighter's scale and uses the rig's height);
  Stat order moved to its own Database tab (Game → Stat order, DbTab 'stats'). vite.config.ts: never write `**/`
  inside a /* */ comment (it ends the comment and the dev server won't start).
- 102c: loadCharacterModel renames generic actions (GENERIC regex) after their file, skips actions already seen
  (same name and length) and names already listed, scales extra files' position tracks by the median bone-offset
  ratio to the main skeleton, and loads extra FBX files with a LoadingManager that blanks textures (also any
  texture path on another computer, C:/…). CharacterModel `trim` per slot ({ from, to } frames at MODEL_FPS 30;
  `trimClip` via AnimationUtils.subclip, cached).
- 102d: season.ts winter leaves and frost on plants are icy blue (linear colour: about rgb(108,168,228) on screen),
  cache key season4; seasons.ts `propSeason` guesses bushes / shrubs / grass / tufts / ferns / vines as 'leaves'
  (bare made leaf-only plants vanish, leaving their shadows); decks.ts `DECK_LIFT` (2/32 tile) added to every deck
  height in placeDecks (walk height and all deck drawing).
- 103: game/body.ts: `BodyState` { meter −100…100, wet 0…1 } per hero id in GameState `body` (saved);
  `feltTemp` (cold side + warmth×3.5 − 5, hot side + (warmth − 3)×2.5, wet −10, by a fire ≥ 68), `stepBody`
  (target −100 / −65 / 0 / 65 / 100 by the felt thresholds; fill / recover / dry seconds), `weatherState`,
  `slowOf`, `soothe`. Game `updateBody` (each frame out of battle, paused in events / sleep / transfers / on a
  griffin; `bodyParty()` lists the hero and members with their positions and equipment; chip every chipSteps tiles
  walked; `bodyHurt(id)` is the hook for Update 104's shake and rumble), `weatherStates` (hero id → state),
  speedScale × (1 − slowOf(leader)) unless riding, `temperature()` honours MapData `fixedTemp` (clamped inside its
  state band). Lights `byFire(x, z)`. Items: `warmth`, `warms` (useItem → `sootheHero`), `camp`.
- 104: ui/weatherFrame.ts (`weatherFrameClass`, `weatherDecor`, `weatherPill`; `.wf-*` styles at the
  end of styles.css); StatusBars PartyCard `weather` / `rumble`, `setHeroWeather` (hud-top frame and pill);
  PartyScreen PartyMemberView `weather` (pr-panel frame and pill); Game `bodyHurt` (screen shake `bodyShake` added
  to the camera's shake, `rumbleUntil` per hero for Database `body.rumble` seconds), `bodyEffects` (breath below
  45°F, drips when Wet, steam when Hot / Overheating, via Bursts); wet footsteps add a soft stepWater squelch;
  CombatOverlay tags show only the noticed ? / ! over map enemies (no health bar, lock, elements, ailments).
  Safe zones ("comfort zones"): world/safeZones.ts (MapData `safeGrid`: s / S seat / L lie / M magic / T training;
  `zoneSpots`, `shareSpots` by HeroDef `restPrefs` 1–10 with a little chance, ties to party order); painted on the
  Spawns layer (store `safeMark`, `safeGrid()` / `editSafe`, MapView `drawSafe`); in the game they count as
  sheltered and by a fire (Comfortable), enemies keep out (Game `safeTiles()` circles in `safeZones()`), no random
  battles there, and `updateRestZone` sends followers to spots (Ally `setRest` / `updateRest`: sit, lie, spellcast or
  swing now and then). Database → Heroes → Rest preferences.
  Party chatter: game/chatter.ts (`CHATTER_TRIGGERS`, `pickChatter` weighted by HeroDef `chatter.amount` 0–10, the
  hero you play a third as often, `chatterSeconds`); HeroDef `chatter {amount, lines{trigger: string[]}, maps[{map,
  line}]}`; Game `chatter(what, opts)` queues one line (1–2.5 s delay, 90 s per trigger, 25–45 s quiet after a line),
  `updateChatter` watches weather kind / wind (≥0.55 up, <0.35 down) / map entry (`chatFirst` from `visited`),
  weather-state changes in updateBody and safe-zone entry in updateRestZone, waking from sleep ('camp');
  `sayChatter` shows an EventBubble `chat: true` (`.ev-bubble.chat`) over the speaker via updateBubbles and logs it
  (LogKind 'chat'). Editor: Database → Characters has a Looks | Chatter switch (editor/ChatterEditor.ts,
  `cleanChatter` used by cleanHeroes). The hero you play is always the walking sprite (refreshLeader); followers are
  the active lineup minus the hero, in list order.
  Equipment page: EquipHost `statuses(hero)` → EquipStatus rows (Weather / Ailment / Good state; Good state is a
  placeholder until 106) in place of the bag list ('list' mode now means the statuses column) with `.eq-desc`;
  equipping is slot → pick; `show(at)` opens on the item's slot with it picked out. Game `ailmentOf(who)`.
  HP tint: BodyConfig `hpTint` (off), `hpTintStyle` (body.ts) sets `--g-hp` on the HUD card / `.hud-top` (StatusBars
  `setHeroTint`) and the pause pr-panel (PartyMemberView `tint`), from Game `hpTint(who)` (statusPills colour).
- 105: Game `updateAilments()` (own step counter `ailWalk`; Poison / Burn lose BodyConfig `ailmentPct`% every
  `ailmentSteps` steps, default 4% / 10, to 1, then `clearLingering` + "wore off" log; anyone at 0 HP is cured,
  Zombie too). Storage is unchanged: hero `heroAilments`, members `data.ailments` (Record ailment → battle turns;
  99 = lasts). `keepAilments` keeps one per hero and none for the KO'd. statusPills defaults: chill / frozen /
  stagger `stays: false`. BattleStatus.give: someone with an ailment can't get Zombie either. ui/ailmentBalloon.ts
  (`ailmentBalloon(id)`, `ailmentPill`); StatusBars PartyCard `ailment` (balloon + pill; `.hud-ally .wf-pills` is
  now absolute at the card's top-right), `setHeroAilment`; PartyScreen balloon in `.pr-art` (PartyMemberView
  `ailment.id`). Database → Weather & temperature → On the body: the Poison / Burn rows (shown even with the
  elements off). Still for 106: 5+ hour rest cures everything incl. Zombie, event Give / cure ailment.
- 106: game/rest.ts (GoodKind, GOOD_INFO, `restShare` 20%/h, `goodFromPoints` 25 / 50, `nextGood` replacement rule,
  `fillSupplies` cheapest mix, `goodHours` from BodyConfig `restedHours` 2 / `wellRestedHours` 1.5, `hoursLabel`).
  GameState `good` (hero id → {kind, until on `clock`}, saved). Commands: `rest` (Game `startRest`: setRespawn, then
  ui/RestScreen.ts hours → supplies; supplies only spent at 25+; then `startSleep` hours with `sleeping.done` →
  `finishRest`: share refill, 1h warms / dries, 5h+ fullRest + cure incl. Zombie, `giveGood('all')`), `goodState`
  (hours + minutes, 'none' removes), `heroWeather` (sets meter / wet), `ailment` now has `hero` ('' / 'all' / id) and
  follows the one-per-hero rule (Game `ailmentCommand` rewritten: stores into heroAilments / data.ailments, no longer
  the old seconds-based heroStatus), `sleep.inn` (wakes Well Rested). Condition `{ heroHas, hero, is }` via
  GameState.env.heroHas → Game `heroHas`. Stats: `goodBonus(id, k)` added into every heroTotals skill function;
  battle EXP `share` wraps `share0` with +10 / 25%. Display: goodPill (HUD cards, hero top via setHeroAilment's
  second arg, pause panels), Equipment status row, CharacterScreen Stats page gold +N with time left and an EXP
  bonus cell. Expiry logged in updateAilments.
- Tooling note: in the cloud workspace npm install is blocked, so typecheck with a global tsc and build the
  standalone files with bun (`bun tools/build-standalone.mjs` with a small esbuild stand-in); the owner's own
  `npm run build:standalone` makes slightly smaller files.

## Next up (in order; details in NOTES.md)
1. The Roadmap at the top of NOTES.md: Updates 104–106 (the elements), then the Future list (sprites only; no more 3D).
2. **Other open items**: Story journal tab, enemy charging spells and Counterspell, Limit specials, class trainer
   screen and class stat bonuses, cooking fish and a reeling mini-game, sitting at campfires (hero and party),
   moving platforms, speech bubble position per message, message window background images, a Bestiary
   achievement rule.

## Code map (where things live)
- `src/game/Game.ts`: the game (large). `PlayerMotion.ts` (hero movement, jumps, ledges, bridges), `party.ts`
  (followers), `combat/Enemy.ts`, `battle/` (turn-based: `TurnBattle.ts`, `BattleStage.ts`), `GameState.ts`,
  `Interpreter.ts` (event commands), `settings.ts`, `statRanks.ts`.
- `src/world/`: `TileMap.ts` (heights, water, decks / bridges, `deckStepOK`), `WorldBuilder.ts` (terrain, map
  edges, props, waterfalls), `terrainGeometry.ts` (cell surfaces, walls, bevels, cliffs, hills), `decks.ts`,
  `heights.ts`, `mapThemes.ts`, `types.ts`.
- `src/ui/`: screens and HUD; `themes.ts` + `themeFonts.css` (window themes); `BattleScreen.ts`,
  `StatusBars.ts`, `CreationScreen.ts`.
- `src/editor/`: the Map Editor; `DatabaseEditor.ts` (tabs, the `listOf` registry for duplicate / copy /
  paste), `CommandEditor.ts` (a new event command needs COMMAND_TYPES, CATEGORY, create, summary and form
  entries), `switchPicker.ts`, `MapThemesEditor.ts`.
- `src/audio/`: `sfx.ts`, `synth.ts`, `chip.ts` (chiptune).
- `src/shared/dataFiles.ts`: `formatMap` (map JSON layout; keeps every key).
