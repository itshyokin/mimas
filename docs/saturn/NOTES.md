# To-do (ideas for later)

Kept in the project so they travel with the code. Tick them off as they're built.

## Roadmap (planned Oct 21, updated Oct 22): PC first, sprites, the elements
The game targets PC (a console port, PS1/PS2-style, may come much later as its own project). Tablet limits no longer
decide things; the tablet editor keeps working.
- [x] Update 98: "Stats can't be lowered" buff (Guard Spec: blocks lowering only, buffs still land); "Level up"
      items (Rare Candy: exactly the EXP to the next level); console `achievements_allow` (achievements again after
      cheats); weapon types editable (add / rename / remove, like Armor types, each with a row in every class's table);
      skill-tree Training (a skill can make its hero Trained with a weapon or armor type, whatever their class says).
- [x] Update 99: prop collision seen from above (RPG Maker style): the footprint grid marks each tile X (blocks),
      O (walkable) or ★ (walk behind); flat pictures stand on the front edge of their footprint, so a blocking tile
      stops the player in front of the vines, not behind them. Old props converted. (The grid 3D props will use.)
      Done: wall props' footprints reach back from the wall they hang on (props.ts `footZ`); the importer grid
      cycles X / O / ★ (saved '#', '.', '*'); ★ walks like O until 3D props.
- [x] Update 100: toon water like the GBA references: flat colour, drifting wave-line pattern, a light foam outline
      along shores, a darker ring round rocks and props in it; water styles and recolouring kept.
      Done: WaterStyle `look` ('toon' default, 'real' for glowing styles), `lines`, `noFoam`; waterEdge.ts
      `patchToonWater` (lines and foam in the shader, `toonWaterTime`); Game rings round wet props.
- [x] Update 101: 3D props (GLB first, FBX best-effort), sized on the prop grid.
      Done: render/models.ts (parse, bake into one multi-material mesh fitted to the footprint, icon render);
      PropDef `model` / `modelRot`; importer "+ 3D model…" (Faces, refit on Width / Depth); instanced in
      WorldBuilder like sprite props. Rest pose only (animation comes with Update 102).
- [x] Update 102: 3D characters and enemies: Sprite or 3D model per hero / character / enemy; animation slots picked
      from the file's clips: Idle, Walk, Run, Jump, Swim, Climb, Sit, Injured, KO, Attack, Spellcast (enemies: Idle,
      Attack, Spellcast, Dead), missing ones falling back to Idle; battle, map, Bestiary and portraits. A "3D look"
      setting: Legend of Dragoon style (low resolution, outlined) or FFX style (smooth).
      Done: render/characterModel.ts (ModelRig: slots, guessing by name, root motion kept in place, LoD / FFX look
      with an outline shell, pictures), CharacterDef `model`, Database `modelLook`; CharacterSprite drives the rig
      behind the same calls as sheets; Database → Characters → 3D model window with a live preview. Enemies use
      a 3D character through their Person look. Weapons on models: dropped (sprites only).
- [x] Updates 103–106: the elements (planned Oct 22). Out of battle only: weather states never change a battle, but
      last through one (Freezing before a fight, still Freezing after). Each hero: 1 ailment + 1 weather state +
      1 good state. Every character in the party is affected (the first is the leader); KO'd heroes (0 HP) take no
      chip damage, and falling to 0 HP cures their ailment. Everything is saved.
  - [x] Update 103: Warmth and temperature. Armor and accessories get Warmth 0–10 (10 best against cold, 0 coolest
        in heat). Maps get Temperature: follows outside, or a fixed base (a cool cave, a warm house) that wanders a
        few degrees but never into another state's range; and Damp / Dry (damp caves slowly make you Wet). Warmth
        zones round lit fires, torches and braziers, and indoors. A cold / heat meter per hero fills with the
        temperature over time (faster when Wet), less with the right Warmth. States: Comfortable (by a fire,
        indoors or dressed right; can be set to always show), Wet, Cold, Freezing, Hot, Overheating. Database →
        Weather & temperature: the temperatures for each (e.g. 40 / 25 / 85 / 100 °F), how fast the meter fills,
        chip damage (every N steps, % of max HP, never below 1). Movement: Wet a little slower, Cold / Hot slower,
        Freezing / Overheating slowest (the worst one counts). Rain and swimming wet you; fires, shelter and sun
        dry you. Horses and griffins are never slowed; on a griffin the rider is immune until they land. Items
        (potions, food, drinks) get Warms / Cools (Hot Cocoa, Chilled Tea) and a Camp value.
        Done: game/body.ts (meter, wet, felt temperature, states, slow, soothe), GameState `body`, Game
        `updateBody` / `weatherStates` / console `body`, Lights `byFire`, MapData fixedTemp / damp / noElements,
        ItemDef warmth / warms / camp, Database `body` (Weather & temperature → On the body).
  - [x] Update 104: showing it. The HUD party panels and the pause menu's party cards get a frame per weather state
        (Comfortable gold, Wet drops, Cold frost corners, Freezing frost and icicles with a cold pulse, Hot shimmer,
        Overheating embers and a hot pulse) and a pill row (weather first, then the ailment, then the good state;
        three at most, then "+N"). Ailments show an RPG Maker-style balloon off the face. Chip damage: a screen
        shake, a hurt sound and that hero's panel rumbling (seconds set in the Database). Each ailment can recolour
        the HP bar (off by default; a colour per ailment). On the map: breath puffs in the cold (thicker when
        colder), wet heroes drip and squelch, overheated ones steam.
        Done, except the ailment balloons (moved to 105, with the ailments themselves) and the third pill row (good
        states come in 106): ui/weatherFrame.ts, HUD / pause frames and pills, chip shake + sound + rumble, breath /
        drips / steam, the optional health-bar tint (one colour per ailment: its pill's).
  - [x] Update 104 also (owner's notes, Oct 22): all done (safe zones painted on the Spawns layer, not rectangles;
        chatter in Database → Characters → Chatter; Equipment page statuses; Jordan always walks in front).
        - Comfort zones: placeable areas (a new layer that places and stretches rectangles on tiles like events, not
          events: rest points are events) that keep the elements off: no cold, heat or wet inside (a shelter, a
          market's awnings, a warm inn yard). Decided: a zone counts as sheltered (no rain) and makes heroes
          Comfortable, and monsters never enter it: a truly safe place. Spots inside it are painted like water or
          terrain types: Seat, Lay down (more later: Crouch, Lean…). Entering the zone, every party member except
          the hero you play picks a free spot at random and sits / lies there (Sit and KO-like poses, or the sheet's
          sit) until the player leaves the zone; then they stand and fall in behind again. Activity spots too,
          from the sprites' poses: Practice magic (casting), Training dummy (a dummy prop; the hero swings at it
          now and then), more later. Each character has Rest preferences in the Database: 1–10 per activity (10:
          goes for it most often, 1: rarely); hero spots are shared out by preference, ties going to whoever is
          higher in the party order.
        - The overworld sprite is always the player character (Jordan, the first hero), wherever he is in the
          lineup; the option for another member to be the walking sprite goes away. The followers behind him
          walk in the party's list order, the same order as the HUD panels and the pause menu (always the same).
        - Remove the enemy health bars / meters on the overworld (left over from the action battle system).
        - Party chatter: followers say a line in a speech bubble that follows the speaker (one at a time, picked at
          random, with a cooldown so it stays rare). Database → Characters → Chatter, written per character so it
          fits their personality. Two sections: General (triggers: getting Cold / Freezing / Hot / Overheating /
          Wet / Comfortable, the weather turning to rain / snow / storm…, the wind picking up / dying down, entering
          a rest area or camp, entering a new map) with several lines per trigger; and Map chatter (+ / − rows: pick
          a map from a dropdown, write a line beside it; several lines for one map: one at random), e.g. "This is
          Reach City. I grew up here!". Decided: the hero you play talks too, and it's rare. Each character has
          a Chatter amount (how talkative: a whiny one often, a stoic knight almost never). Every line said goes in
          the adventure log, so players can scroll back to anything they missed.
        - Gear page: the left-hand item list is replaced by the hero's current statuses (weather state, ailment,
          good state); moving up and down shows what each does in a text box. To equip, pick the armor / weapon
          slot, then the item for it; items can also be equipped from the item menu (pick the armor or weapon →
          Equip).
  - [x] Update 105: ailments out of battle. One per hero, and a hero with one can't get another (Zombie too) until
        it's cured. Poison and Burn chip HP to 1, then wear off. The rest (Paralyze, Sleep, Confusion, Blind,
        Silence, Zombie) stay until cured, a rest of 5+ hours, or an event cures them; shown only (balloon, pill).
        Stagger, Chill and Frozen end with the battle.
  - [x] Update 106: resting and camping. A "Rest point" event (like the enemy / transfer prefabs: put it on a
        campfire prop); resting there also sets the respawn point. Rest how many hours: the party's panels refill
        20% an hour as the hours are picked; 1 hour already warms and dries the party; 5+ hours: full restore and
        cures every ailment. Then the camping supplies screen: each item's Camp value (food, potions, drinks);
        a bar to 50 with marks at 25 (Rested) and 50 (Well Rested), Fill buttons that pick the cheapest mix, a
        warning before waste; under 25 nothing is spent ("Add X more to gain additional benefits"). Camping with
        no supplies still restores fully. Rested: +1 to every stat and +10% EXP; Well Rested: +3 and +25% EXP,
        shorter; their lengths set in the Database. Shown on the stat page as gold "+1" beside each stat with the
        time left, and an "EXP +25% (Well Rested)" line. A new good state replaces the old (Well Rested is never
        downgraded by Rested; resting again restarts the timer). Inns give Well Rested. Event commands: Give buff
        (Rested / Well Rested, hours and minutes; also for blessings), Set weather state, Give / cure ailment; event
        conditions "if a hero is Freezing / Well Rested / Poisoned…".
        Done (105 + 106, Oct 22). EXP bonus counts on battle EXP (not quest rewards). Inns: Sleep → "An inn".
- Dropped (Oct 22): the 3D roadmap items (Additions with 3D models, equipment on 3D characters, the 3D character
  builder). The game sticks with sprites. The 3D props and 3D characters already built (Updates 101–102) stay for
  now; the owner may have them removed later.
- Owner's list (Oct 24), planned as Updates 107–114 (in this order):
  - [x] Update 107: fixes. Camping: each party member picks one spot and stays there the whole rest (no switching).
        Pause menu party panels jump far apart vertically while in a rest zone. 4 active: all 3 followers walk
        behind the hero, and the HUD shows a panel for the 3rd member. Rain / snow follow the camera tilt setting.
        Chatter bubbles sit above the head at higher camera angles (not on the body). Sitting uses the sheet's
        bottom row, column 3; the training dummy uses row 22. Party orbs on the hero's battle stat block are each
        member's colour (Database → Heroes); enemies stay orange. Height styles (Blocky…): brighter symbols / tinted
        squares, and Fill works with a style (fills that height as the selection).
        Done: zone spots sorted (the key no longer changed as the hero walked, re-sharing spots) and kept per zone
        (`restPicks`) through battles / respawned allies; fullRest leaves resting allies posed; `.wf` no longer sets
        position on `.pr-panel` / `.hud-top` (the pause panels' jump); active party = Single mode's "Heroes who fight"
        in Single mode; HUD party4 card; weather and bubbles follow the lean; sit = hurt frame 2, dummy = slash;
        hero-coloured spheres; style Brush / Fill and tinted cells.
  - [x] Update 108: dates. A Date condition (month / day, no year, and a date range: Oct 24–31) for event pages
        and Conditional branch (a Halloween pumpkin). Props get a date window too (shown only on those days), and a
        "Duplicate prop" option so a Halloween-only copy can sit in towns while the original is used anywhere.
        Done: world/dates.ts (`inDates`, MM-DD, wrapping ranges), Condition `{ date, until }`, PropDef `dates`
        (filtered in Game `visitData`), editor/dateFields.ts, prop importer "Only on some days", Palette Duplicate.
  - [x] Update 109: fishing and swimming. Fishing now and then hooks a water enemy (enemies get a Water habitat;
        a chance per catch) and starts a battle. Swimming is no longer automatic: it needs a key item (a key item
        flag "lets the party swim") and no longer costs stamina.
  - [x] Update 110: riding. On a horse the party is hidden and the hero uses riding sprites (sheet rows 18–22),
        with the far leg erased in the side views (it's behind the horse; owner's marked-up sheet, Oct 24).
        Done: the rows are the combat stance (rows 18–21 counting from 1); SpriteLibrary `withRide` adds a "ride"
        animation (4 rows appended to the sheet, erase boxes measured from the owner's screenshot); Motion `riding`;
        AllyHost `hidden` while riding. Owner to check the erased areas in game.
  - [x] Update 111: battle look. Bigger damage numbers. Health bars: solid colours, squared or rounded (an option).
        A Battle menu layout editor (like the pause menu's party layout). Battle idle: pick frames from a sheet row
        (like the prop creator: up to N frames of row Y) that loop as the hero's battle idle.
        Done: bigger `.bpop`; Menus `barsSolid` / `barsSquare` (root classes); ui/battleLayout.ts + BattleScreen
        `setBoxes` + editor/BattleLayoutEditor.ts (Pocket pieces placed by hand, % of the screen); CharacterDef
        `battleIdle` (editor/BattleIdleEditor.ts on the Characters card; SpriteLibrary adds a `battle_idle` anim;
        BattleStage animates with `battle: true`).
  - [x] Update 112: terrain looks. Cliffs only 1 height tall get a smaller grassy overhang (2+ keep it). Cliff and
        side walls from heights get a light-top, dark-base gradient. Water reflects the hero. Moving shadow overlays
        besides clouds: tree canopy shadows, light beams…
        Done: terrainGeometry `lipLength` (one-step walls 40%); WorldBuilder `shadeWall` vertex colours on wall meshes;
        Game `updateReflection` (mirrored mesh sharing the hero's geometry, patchLean, scale y and z −1);
        atmosphere `shadowKind` (areaTint `uHdCloudKind`: canopy, beams).
  - [x] Update 113: tutorials and skill tree locks. Tutorial pop-ups (Settings: on / off) that are kept in the
        Journal to read again. Skill tree nodes locked until a quest is done, a level is reached, a key item is
        carried or a switch is on.
        Done: Database `tutorials` (Story → Tutorials tab), command `tutorial`, ui/TutorialPopup.ts, Settings
        `tutorials`, Journal → Tutorials (records `tut:<id>` hold the order seen); SkillNode `needs {quest, item,
        switch}` checked through `Skills.locked` (set by Game). Also: the Database window's "nothing changed" check
        now counts Party size and tutorials.
  - [x] Update 114: equipment changes the hero's look. Armor / clothes get a masc and femme body sprite (from the
        Character Builder's clothes and accessories), with tint / recolour; wearing it redraws the hero.
        Done: the LPC builder's "Export clothes only" (tools/lpc/builder: torso, legs, feet, arms, hats, back, no body);
        ItemDef `worn {masc, femme, mascAnim, femmeAnim, tint}` (editor/WornLookEditor.ts); CharacterDef `body`
        (from the builder's body; a select on the Characters card); SpriteLibrary `wornSheet` composites animation
        for animation (tint = multiply), `preloadWorn`; Game `lookFor(who)` / `wornSig` (player, followers, battle
        figures), redrawn when the outfit changes. Menu portraits still show the plain sheet.
- Owner's playtest notes (Oct 24 evening), planned as Updates 115–120:
  - [x] Update 115: riding. The rider sits higher on the horse (left / right: on its back, not beside it; facing
        down: behind the head, the horse drawn in front; facing up: raised too). Hoof steps and a gallop sound,
        snorts and whinnies now and then while mounted, speed lines on screen while galloping. Database → Travel page
        layout fixed (the horse list on the left, the form two panels wide; griffin flights below the form).
        Done: syncPlayer lifts the rider up the leaning sprite (0.8 sideways, 0.72 down, 0.62 up) and nudges them
        0.6 toward the camera (away facing down, so the horse's head is in front); sfx hoof / horseSnort / horseNeigh
        (and lock sounds for 119); `.speed-lines` overlay; HorsesEditor flight section inside the form.
  - [x] Update 116: reflections for everyone: party members, NPCs and events, map enemies, props, the horse (and its
        rider).
        Done: Game `reflections` map (hero, horse, allies, event visuals that are meshes, map enemies via
        Enemy.spriteMesh); WorldBuilder adds a mirrored InstancedMesh per prop type for props at the water's edge
        (a cut-down prop's reflection stays until the map is reloaded).
  - [x] Update 117: drying indicator on a hero's panel while a fire dries them; a default HUD / settings file
        (Database: save the current HUD layout and settings, export it, and new games start from it).
        Done: Game `drying` map (hero id → wet left) set in the body step while by a fire, out of the rain;
        StatusBars `dryingBar` on the HUD cards and `setHeroDrying` under the hero's own bars; PartyScreen card
        `drying`. Database → Menus → Default settings file: choose a file saved from Settings → "Save settings to a
        file"; it's written to data/settings.json, which new players start from (settings.ts loadProjectSettings).
  - [x] Update 118: key items with field uses (besides Water Walk): Dash, Swim, Climb, Cut, Fire Bow, Smash Stone,
        Change weather, Change time, Change season, Start fishing, Ride horse (call it), Skeleton Key (opens any lock).
        Done: ItemDef `field {use, weather, hour, season, horse}` (types FieldUseKind / FIELD_USES; items.ts
        FIELD_USE_NAMES / FIELD_USE_TEXT / carriedUse). Carried: dash / climb (PlayerMotion `has`), swim (canSwim),
        skeletonKey. Used (bag or B): Game `fieldUse` (cutAhead, mineAhead(smash), fire relight / burnAt, weather
        command, clock jump, GameState `seasonPick` (saved), fishing via bestRod, horse call + mount).
  - [x] Update 119: locks and lockpicking (Skyrim style): door transfers and chests get Lock settings (Easy green,
        Medium yellow, Hard orange, Impossible red, or Cannot be picked); rotate the pick round a half circle to
        find the sweet spot (smaller the harder), with rumble on controllers and a sound that grows near it.
        Done: Command `lock {level, key?, switch?}` (Interpreter stops the event on failure; opened state in switch
        `lock:<map:event>`); ui/LockpickScreen.ts (LOCK_NAMES / LOCK_COLORS); Game `openLock` (key, Skeleton Key,
        lockpick items `lockpick`); Input `rumble` (Gamepad vibrationActuator); Inspector "Lock settings" section and
        CommandEditor `lockFields`; ItemsEditor Lockpick checkbox.
  - [x] Update 120: worn looks rework: pick the Character Builder's own parts (torso, legs, feet, arms, hats, back)
        for an item in the editor, per body type, with colours; the engine builds the sheets, no hand-made PNGs.
        Done: editor/lpcParts.ts (catalog from /builder/ or /tools/lpc/library/, palette recolour and layer order
        ported from the builder's lpc.js, `buildWornSheet`, `previewParts`); ItemDef `worn.parts {masc, femme}`;
        WornLookEditor picks parts (variant, colour channels, Steam-safe filter), rebuilds the sheet on each change and
        saves it to assets/worn/<item>_<body>.png with its layout (runtime unchanged: sprites.ts `wornSheet`).
        Drawn over the hero's own clothes.
- Oct 24 late (owner's notes, planned with the owner):
  - [x] Update 121: fixes. Cold breath from the mouth (head height, along the camera lean; hero and followers).
        Snow on trees drawn solid white (not see-through). Bag → equip armor someone already wears (Titantech on
        Katrina): always show the "who wears it" list (wearer marked), never fall back to the main hero
        (equipTargets uses gear() without in-use copies → [] → equipItem on Jordan); a Take off option.
        Chatter bubbles sit at mid-body, not over the head (Game chatter spot uses a fixed height 1.1 from the
        body's y; check y is the feet and use the sprite's real height).
        Done: Game `bodyEffects` places breath / drips / steam up the leaned sprite (leanNow); chatter spot height 1.5;
        season.ts winter leaves → snow-white `laden` (no more ice blue, no discard on bare trees); equipTargets uses
        gear(true) and marks the wearer "(wearing it)".
  - [x] Update 122: camp. Party members walking to camp spots pass through props and each other until seated
        (then solid; after a few seconds stuck, they appear in their spot). Talk to a resting party member: a camp
        chatter line. Chatter gets a Camp trigger: a default line plus conditional lines ("if switch X is on",
        "if quest Y is active", etc.) so they comment on what's going on.
        Group chatter: a list of up to ~10 lines (speaker dropdown + text) that plays top to bottom at the next camp
        visit, each line over its speaker's head, like a live conversation. Queued by an event command ("Group chatter
        at next camp") or set to play when a switch is on; plays once.
        Done: party.ts updateRest walks as a ghost (place after 0.5 s stuck / 6 s); HeroChatter `camp [{line, if}]`,
        game/campTalk.ts `campLine` / `nextGroup`; Game `restingAllyAt` + `talkAtCamp` (action button), `updateGroup`
        (groupDue 3.5 s after entering a camp; played flag switch `gchat:<id>`); Database `groupChatter`, command
        `groupChatter` (GameState `groupQueue`, saved); ChatterEditor At camp + Group chatter sections.
  - [x] Update 123: footprints and puddles. Terrain materials get "Leaves footprints" (default on for snow, sand,
        mud): prints fade over ~20–30 s, hoof prints when riding, fresh snow fills them faster. After rain, small
        reflective puddles on soft flat ground (dirt, grass, paths; not sand) shrink away over ~2 game hours.
        Done: render/footprints.ts (instanced ovals, per-instance fade), render/puddles.ts (glossy instanced pools sized
        by Game `wet`); assets `tilePrints` + TileRegistry `prints` / `printsDefault`, Palette "Leaves footprints";
        Game `keepsPrints` (tile setting, or winter grass / dirt outdoors), `printAt`, `updatePrints` (hero, allies,
        horse; snowfall fills prints 3× faster), `puddleSpots` (hash ~3.5% of flat walkable tiles, max 60).
        (Puddles are glossy rather than true mirror reflections.)
  - [x] Update 124: relationships. Each character rates each other party member 0 (hate) … 100 (best friends /
        love), ONE-WAY (Katrina→Eleanor ≠ Eleanor→Katrina). The player's hero (Jordan) is rated by the others but
        has no ratings of his own. Labels: 0–14 Hate, 15–29 Dislike, 30–44 Distrust, 45–59 Neutral, 60–74 Like,
        75–89 Close, 90–100 Best friends / Love (per pair). Starting values per pair in the Database.
        Battle sources (Pokémon-style, one fighter at a time; amounts editable, capped per battle):
        stepping in (switching in right after an ally took a big hit / is low, then taking the next blow: the
        rescued one's rating of the rescuer rises, more if it would have KO'd them); healing a benched, hurt ally;
        reviving; avenging (KO the foe that downed an ally); gentle "left out" losses (optional).
        Other sources: downtime games, gifts liked / disliked, camping together, dialogue choices, quest rewards.
        Events: "Change relationship" command (A's rating of B ±, optional both ways); condition "A rates B ≥ X" /
        "A's view of B is Like or better"; quest reward. Pause menu Relationships page shows ONLY the current party
        (each one's ratings of the others, Jordan included as a target); benched-out members keep their numbers.
        A notice when a label changes ("Eleanor now Likes Crowley").
        Done: game/relations.ts (labels, kinds, defaults, cap 8 per pair per battle); GameState `rel` (saved) + condition
        `relation`; command `relation`; QuestReward `relations`; Game `relGet` / `relChange` / `bond` / `bondsHtml`
        (Journal tab "Relationships"); TurnBattle hooks `bond` (cover / coverSave on swap-in below half HP then taking
        the next foe blow, benchHeal / revive via items, avenge via downedBy) and `begun`; camp points in finishRest;
        editor: RelationsEditor (Party → Relationships), CommandEditor command + condition, QuestsEditor rewards.
        Gifts liked / disliked and dialogue choices use the command for now (no gift system yet).
- Oct 24 night (owner's playtest + plan; horse, reflections of characters, locks, camp talk, 4-hero battle all OK):
  - [x] Update 125: fixes. Lockpicking Skyrim-style for real: a built-in Lockpick key item (stacks) is REQUIRED; holding
        the turn off the sweet spot strains and snaps the pick (faster on Hard / Impossible), using one up; opening the
        lock keeps it; out of picks ends the attempt. Lockpick screen redrawn as pixel art (small canvas scaled up
        crisp, limited palette, brass lock face, stepped half-circle track, pixel snap). Prop reflections (widen the
        "water in front" check; verify). Bag: Unequip for anything worn. Save screen: all 4 party portraits the same
        size / brightness. Plain Attack hidden from the Attack menu when the hero has Additions; with none, Attack just
        attacks (no submenu). Battle Swap-in list: compact rows (face, name, HP, MP and EXP bars with numbers) so the 3
        benched heroes fill the panel top to bottom; narrower panel. Relationships + roleplay on the Status page
        (see 127).
        Done: items.ts LOCKPICK (migrateItems adds it; icon builtin:lockpick); LockpickScreen drawn on a 112×64 canvas
        (snap animation `snapT`, `out` ends after the snap); WorldBuilder prop reflections look up to 3 tiles ahead
        and start at the water's near edge; InventoryScreen equipWho "Unequip"; saveParty active = activeMembers + 1;
        TurnBattle attackMenu lists Additions only; BattleScreen `.battle-cmd.swap` rows (HP / MP / EXP side by side).
  - [x] Update 126: meter and orb styles (Database → Menus): fill gradient / flat / glossy / striped / segmented; shape
        pill / rectangle / beveled / thin line / segmented blocks; orbs gradient sphere / flat circle / pixel square /
        diamond. Replaces barsSolid / barsSquare.
        Done: MenuConfig barFill / barShape / orbStyle → root classes bar-fill-* / bar-shape-* / orb-* (Game applySettings;
        CSS overrides --g-* and bar containers / .pb-ball); DatabaseEditor Bars section selects.
  - [x] Update 127: gender, outfit gender, roleplay info, gifts.
        Heroes: Gender (Male ♂ blue, Female ♀ pink, Transman ⚧ dark blue, Transwoman ⚧ dark pink, Transgender ⚧
        blue→white→pink gradient, Nonbinary ⚲ purple, Other ✱ white); Outfit gender masc / femme (replaces the
        Characters card Body; picks the worn-look sprite). Symbol on the HUD card, pause panel, Status page (Gender line).
        Roleplay: Database → Party → Roleplay = shared titles (stable ids; Eye color, Favorite food, Favorite gift…);
        each hero fills details (+/−). Condition "[hero]'s [title] is [value]" (case-insensitive); text code
        \rp[hero, title]. Items: "Favorite of" / "Disliked by" rules (heroes whose [title] is [value]): used on them →
        +/− N to their view of the USER: in battle the hero who used it (Katrina uses Ramen on benched Eleanor →
        Eleanor +1 toward Katrina); out of battle the hero you play.
        Status page: relationships list in the empty space under the portrait; roleplay details in the right panel
        under About / Description.
        Done: game/roleplay.ts (GENDERS, GENDER_INFO, genderBadge, rpValue / rpMatch); HeroDef gender / outfit / roleplay;
        Database roleplay (RoleplayEditor tab, HeroesEditor fields; HeroesWork.rp shares the working list); Condition
        `rp`; GameState.format \rp[hero, title]; ItemDef reactions (ItemsEditor) via Game `itemReaction` (battle: the
        user, from TurnBattle useItem `by`; map: the hero you play); CharacterScreen gender badge, Roleplay section,
        Relationships under the picture; HUD cards / pause panels gender badge; lookFor uses hero outfit.
  - [x] Update 128: built-in clothing. Using the builder's library (Steam-safe parts, credits), ship ~10 tops, ~10
        bottoms and several accessories (necklaces, earrings, capes…) as ready-made masc + femme sheets. Look when worn:
        three preview panels Top / Bottom / Accessory, ← → cycle (with None), live combined preview on a body; each has
        colour swatches (the part's variants / palettes) plus "More colours / tint". A fourth panel far right: the
        masc / femme custom imports + "Use custom clothes sprite" checkbox (ticked: replaces the three). An armor item =
        an outfit set from the three picks. A few starter armor items in the Database using them.
        Done: tools/lpc/build_worn.py → public/assets/worn/builtin (30 parts, masc / femme sheets, _under sheets for
        cape backs, parts.json with layouts, recolor source + 12 swatches, credits; 3.3 MB). world/wornParts.ts (load,
        recolorPairs / recolorCanvas, tintSheet, standingCell). ItemDef worn.top / bottom / accessory (WornPick) +
        worn.custom; Game lookFor builds layers (under + recolor), preloads builtin sheets, wornCredits; sprites.ts
        wornSheet draws under layers before the base. WornLookEditor rewritten (three panels + custom panel with the
        Update 120 builder parts inside a details box). items.ts addOutfits (6 starter items, once).
- Oct 25 evening (owner's notes; clothing builder works great):
  - [x] Update 129: fixes. Event text box style (Sign, etc.) ignored in game. Prop reflections: season colours and wind
        sway like the prop (mirrored copy of its material). Prop collision grid starts at the prop's full size (1×2 →
        2 blocks), each block toggled. Chatter bubbles get a speech tail. Relationship bars shade red (Hate) → yellow
        (Neutral) → green (Best friends / Love). Relationships only on the Status page (Journal tab removed).
        Done: themes.ts rules gave every frame and its text !important colours, so a text box style's window colour and
        ink never showed: `.msg.looked.look-bg .msg-box` keeps --look-bg, text rules skip `.msg.looked .msg-text *`,
        applyLook sets the ink !important. WorldBuilder reflections get patchAreaTint + patchSeason + patchSway.
        PropImporter depth follows the height until set by hand (`depthSet`). Chatter tail: ::before outline +
        ::after fill. relations.ts relColor (hsl 0 → 120). Journal 'bonds' tab and bondsHtml removed.
  - [x] Update 130: Journal and dates. Journal tabs get icons and a little more height. Database → Journal: reorder the
        tabs, show / hide each; an event command shows / hides a tab (saved; e.g. unlock the Bestiary later). Roleplay
        titles get a type: Text or Date; Date answers (Birthday: Oct 31) get conditions "today is X's [title]" and
        "within N days of it", on the REAL date (the game's date is the real date; day / night doesn't change it).
        Done: TabGroup `icons` (tabs.ts, `.tab-ico`); MenuConfig `journal {order, hidden}` + GameState `journalTabs`
        (command `journalTab`); Game `journalList()`. RoleplayField `type: 'date'` (answers "MM-DD"), condition
        `rpDate {hero, title, within}` via roleplay.ts `daysUntil`.
  - [x] Update 131: global events. Database page of event scripts that run once at: a new game, loading a save,
        sleeping at a camp or inn, entering a rest zone, and the real date rolling over; then sleep until the next.
        Normal commands and conditions (full moon → Katrina leaves; otherwise she's back). Someone added back while
        the party is in a rest zone walks in from off-screen to a rest spot.
        Done: Database `globalEvents` (GlobalEvent {id, name, when: GlobalTrigger[], commands}); GlobalEventsEditor
        uses CommandEditor's new standalone mode. Game `fireGlobal` queues, `nextGlobal` runs one when idle and checks
        `state.realDay` (saved) every 5 s. changeParty in a rest zone: others placed at their spots, `walkIn` puts the
        newcomer 12 tiles to the side (Ally `walkLimit` 14 s); updateRestZone gives late joiners a free spot.
  - [x] Update 132: key items and the overworld. Key items go on the d-pad quick slots like consumables (4 slots, one
        per direction); no B-button key items. Field-use pop-ups: Change weather (a list), Change season (four),
        Change time (4 digits moved up / down + AM/PM, controller friendly): a bubble appears round the hero and the
        world fast-forwards around them (time passes: fires, rest effects) until the time is reached, then it pops.
        Overworld sword / bow removed: the Cut key item (tap the slot: a swing, fixed damage; vines, crates) and the
        Bow key item (hold to draw, release; lock-on aims at switches and targets, NOT enemies). The ambush mechanic is
        removed: touching a map enemy (either way) starts a normal battle.
        Done: QUICK_SLOTS 4 (quick4: D-pad ↓ / 8; Release target → left stick, BINDINGS_VERSION 3); bTool moves to
        a quick slot on load; useQuick runs key items (Cut → Combat.keySwing, Bow → keyDraw held by the slot, others
        toggleTool). Combat ignores melee / bow / attack / switch; lock-on uses `lockables()` (breakables only).
        ui/TimePicker.ts; Game startTimeWarp / updateTimeWarp (bubble, 3+ h/s); weather and season lists via
        menu.push. encounter() is always 'normal'. FieldUseKind 'bow', FieldUse.damage; built-in key_cut / key_bow.
  - [x] Update 133: items. Database → Materials tab. "Cannot be sold" on any item (shops won't buy it). Icon effects
        with colours: glow, outline, pattern overlay (stripes, dots, cracks, swirls, checker): a "corrupted" pumpkin.
        Done: ItemCat 'materials' (itemCategory: kind material without essence); ItemDef `noSell` (ShopScreen sell
        rows greyed "Can’t be sold"); ItemDef `iconFx {glow, outline, pattern {kind, color, opacity}}` drawn by
        world/iconFx.ts `applyIconFx` in Game.loadItemIcons and the editor's itemIconImg; ItemsEditor iconFxForm.
  - [x] Update 134: bedroll and custom worn sprites. Replace the bedroll: lying head-to-foot (pillow at the top), drawn
        in two layers (mat + pillow under the character, blanket over); resting heroes stand facing down on it (head on
        the pillow), not the knocked-out pose. Custom sprite (Look when worn) becomes a pop-up: up to three images
        (Front, Back, Side mirrored) from PNGs or built-in icons; tabs Front / Back / Side over the player sprite to
        drag and scale each (like the Prop editor), per body (masc / femme), "Duplicate from masc / femme"; in game
        drawn on every frame of that direction, bobbing with the sprite (worked out from the sheet).
        Done: placeholderArt bedroll (16×28, pillow top) + hidden bedroll_blanket; party.ts Ally.coverUp (blanket mesh at
        z+0.08 over the standing ally on 'lie'). ItemDef worn.customPics {masc, femme: {front, back, side: {src, x, y,
        scale, rot}}} (src a path or icon:<name>); world/wornCustom.ts buildCustomWorn (per-frame bob from each frame's
        top edge vs the standing frame); sprites.ts customWorn(key…) caches it as a sheet; Game lookFor layers it and
        preloads PNGs; editor/CustomWornEditor.ts pop-up (drag, wheel / slider scale, turn, duplicate); WornLookEditor
        custom panel now opens it (the Update 120 builder-parts UI is gone from items; lpcParts.ts stays for reuse).
  - [x] Update 135: prop collision grid is Width × Height (Oct 25 report: a customised 2 × 3 pine only offered a
        2 × 1 row). Done: PropImporter's grid rows follow the height for picture props (the saved footprint of a
        built-in kept depth 1, so Update 129's depth-follows-height never applied); Depth only for 3D models; rows
        added to an existing prop start as ★ (walk behind).
  - [x] Update 136: a Sign-style text box showed the default window (Oct 25 report). Done: with the Ember theme plus a
        window colour / see-through setting, emberCss forced every .msg-box background; it now keeps a style's own
        --look-bg (and look-clear), as Update 129 did for the other themes.
  Oct 25 night list (owner's notes; answers: "always on top" = characters drawn over props; Sprint becomes a key
  item with a Sprint field power on a quick slot or switched on in the bag; overworld shard casting is gone for good):
  - [x] Update 137: fixes. Genders read Male (Cis), Female (Cis), Male (Trans), Female (Trans) (…); Database → Genders:
        rename each, pick its symbol or a custom image, recolour. Enemies drop only the loot set in the Database (no
        built-in fragment / item drops). Look when worn: the "Use custom clothes sprite" box can't be ticked, and a
        custom sprite isn't kept after Save. No sword / bow drawn on the hero's back. Items show Warmth as a coloured
        number (blue cold … orange hot). Sprint: a key item field power (on a quick slot, or on / off in the bag).
        Done: roleplay.ts names + `setGenderLooks` / `genderInfo` (Database `genders`, GendersEditor.ts; picture as a
        32 px data URL). Game `fragmentDrops` removed (and its Combat editor fields). WornLookEditor `set()` kept the
        look only for builder parts / sheets: custom / customPics / tint now count, and the pop-up writes into the same
        object. Combat.updateBack hides the back always (keySwing / keyDraw set the weapon shown). InventoryScreen
        `warmthHtml` (bag kind line, shop). Field use 'dash' = Sprint toggle (GameState `sprint`, saved).
  - [x] Update 138: pickers by category. Database → Enemies → Loot: a section per category (Items, Key items,
        Materials, Weapons, Armor / accessories), each dropdown listing only that category. Shop setup (Open shop
        command): Add item → pick a category → that category's list.
        Done: editor/itemSections.ts `itemSections` (a <details> per ItemCat, + Add per kind, missing items listed);
        used by CombatEditor (Loot) and CommandEditor (shop goods). Sections: Items, Key items, Materials, Weapons,
        Armor / accessories, Shards and stones.
  - [x] Update 139: drawing. Database option "Characters always on top": the hero and party drawn over props they
        overlap (on / off). Props get "Flat mode": painted flat on the terrain like a 2D game (bedrolls, rugs).
        Done: Database `charactersOnTop` (Camera tab). CharacterSprite `onTopCopy` (a child mesh sharing geometry and
        material, renderOrder 20, drawn with no depth test where the stencil is 1); props mark the stencil (lean.ts
        `markProp`, WorldBuilder sprite and 3D props); PostFX rtScene has a stencil buffer. PropDef `ground` (Flat mode,
        PropImporter checkbox): WorldBuilder lays the picture flat (bottom edge at p.z, reaching back d.h).
  - [x] Update 140: party pages. Selected arrows on the Party menu (the outline is hard to follow). Stamina hidden on
        stat pages (the HUD shows it); EXP bar under HP / MP like the other menus. Equip / unequip gear and shards from
        Status → Gear.
        Done: PartyScreen `.pr-slot.sel::before / ::after` arrows; CharacterScreen Stats: no SP bar, EXP bar under HP / MP;
        StatusScreen gauges: EXP instead of SP; CharacterScreen Gear page uses the EquipHost (`equip()` host hook):
        ↑ ↓ `gearSel`, A opens `picking` (Take it off + choices), A equips, B backs out.
  - [x] Update 141: controls and menus. START: Settings (with Save, Load, Quit to Title; an icon beside each setting).
        X: Party (the line-up only). B: the Backpack, a compact bag window bottom right (the game pauses; use items
        and key items, view and equip gear and shards). Y: the World Map (LB / RB pick markers; place, move and
        remove your own marker). Achievements become a Journal tab. Each button closes what it opened (B goes back a
        step first when an item is picked). Pause tabs Items, Map, Achievements and System removed.
        The X menu has two tabs, Party and Journal (LT / RT switch them; LB / RB the Journal's own tabs); View / Back
        stays free for later.
        Done: Input actions settings / party / backpack / worldmap (pad 9 / 2 / 1 / 3; keys Esc / P / I,B / M), and in
        menus the same buttons add those actions (MENU_TOGGLES) so the Game closes what each opened; BINDINGS_VERSION 4;
        ring / magic / melee / bow unbound. tabs.ts `tabSwap` (Party menu: its tabs on LT / RT, inner on LB / RB).
        Game openBackpack (InventoryScreen `compact` → .inv.backpack; `atTop`), openWorldMap, openSettingsMenu (Save /
        Load / Quit at the top; GameMenu `fillIcon` / screen `icon`: a picture per page beside each setting),
        pauseTabs only status + journal; PauseShell `extras` corner buttons; touch Menu presses 'party'. Journal tab
        'achievements' (achScreen with the Journal's tabs). WorldMapScreen: LB / RB markers, A places / moves /
        removes the player's pin (GameState `pin`, saved), `dismiss()`. HUD spell box and touch Spell button hidden.
  - [x] Update 161: renamed to the Saturn Game Engine (titles, editor brand, playtest panel, README, package name).
        The GBA fork is Mimas (github.com/itshyokin/mimas). Internal file kinds like "hd2d-settings" stay as they are
        so existing saves and settings keep loading.
  - [x] Update 159: 3D maps: fog reach × 3.6 (no overworld-distance push), camera far 400 (200 again off them).
  - [x] Update 160: 3D map materials named `ter_<tile>` take that tile's picture (custom or built-in; pixel tiles' first frame / interior), laid in world XZ (`patchWorldUV`, span = tile's one-copy size) with the ground season + area tint; `…_season` keeps its texture with the ground season; `_foliage` also gets the leaves season. Resolver: Game.terrainPicture, View3D uses customTileImage/builtinTileArt.
        Blender doc: Lighting section.
  - [x] Update 158: parseModel sets MeshoptDecoder (src/meshopt.d.ts types it) and, when the GLB's JSON mentions
        KHR_draco_mesh_compression, a DRACOLoader reading public/draco/ (decoder files copied from three). Checked:
        plain / Meshopt / Draco / gltf-transform optimize (names kept) all load with their tags.
  - [x] Update 157: the player start in the 3D view is selectable (Selection 'start') and moved / turned with the
        gizmo; db.start.y (the floor; Body3D.place uses it), facing from the rotation. View3D toolbar: Move / Turn /
        Size buttons (setMode) and a controls hint.
  - [x] Update 156 (3D maps, phase C): MapData.volumes (Volume3D: centre x / z, bottom y, size, ry; trigger event /
        once / onExit; encounter zone). build3D reads trigger_ / encounter_ boxes (scene.volumes). ground3D: one
        downward BVH raycast, highest floor ≤ fromY + 0.45; the lowest surface above facing up (inside a solid) or a
        ceiling under head height → fromY + 50 (a wall); TileMap.ground3d answers standY / surfaceY (set right after
        the TileMap so monsters spawn on floors); lineOfSight passes its height. Game: updateVolumes (inVolumes set,
        @vol:map:id switch for once), volumeZone in updateEncounters, monster billboards. Combat spawns pos3 enemies
        there. Editor: Selection 'volume', Inspector.volume, palette Volumes list, View3D volumes (scale gizmo R,
        Delete, right-click add, Bring in from Blender). Next: phase D (3D NPCs, Mixamo animation library).
  - [x] Update 155 (3D maps, phase B): editor/View3D.ts (own WebGLRenderer in .stage, fly camera on RMB, markers =
        cylinders + name sprites coloured by trigger, TransformControls translate / rotate-Y, right-click menu: New
        event here → selects the tile and the next new event gets pos3; Move start; tablet: a note with Close).
        EventData.pos3; GameEvent stands there; Game.event3DAhead (talk) and touched3d (touch) on 3D maps;
        Input.peek. Next: phase C (trigger and encounter volumes, roaming monsters), phase D (3D NPCs, Mixamo library).
  - [x] Update 154 (3D maps, phase A): game/World3D.ts (build3D: tags by object / material name, offset to the map
        corner, merged world-space collider with a three-mesh-bvh MeshBVH (0.5.24, three 0.149), cam collider without
        _nocam; Body3D capsule r 0.3 h 1.6 pushed out per the three-mesh-bvh character example, 4 substeps, gravity
        22, swim at water − 0.7 h, kill zones / far fall → last safe; Camera3D yaw / pitch / dist, pitch clamp
        orbit −0.12…1.15, follow 0.12…0.85, wall raycast). wind.ts patchSwayModel (vertex colour red weight). Game:
        w3 state, move3D replaces motion.update (motion x / y / z mirrored), updateCamera3D (fov 55, near 0.1,
        sprites turned to the camera, party set on floors), mouse drag / wheel, Input.rstick, 3D waterfalls into
        the waterfall sounds. Editor: Map Properties scene field, top view, playtest hand-over, Database camera3d.
        Next: phase B, the 3D editor (viewport, right-click placing, gizmos, outliner, events in 3D).
  - [x] Update 153 (phase 1 of 3D model maps): MapData.groundModel {src, scale, rot, x, y, z}; world/groundModel.ts
        fitGround (fit footprint, raycast down at corners → hill field, centres + steepness → blocked), loadGround,
        groundTopView (ortho render for the editor). TileMap: __ground → all cells hills on the field, blocked OR.
        WorldBuilder hides terrain + border (water stays), adds the model. Game.loadMapData / boot attach __ground;
        playtest hands the file over. Editor: Map Properties fields (file → assets/maps/<map>.glb), MapView backdrop.
        Phase 2 (planned): a 3D editor viewport (orbit / fly camera, gizmos to move / turn / scale things, volumes for
        triggers) like Unity or Sapien; separate collision meshes; free 3D camera for these maps.
  - [x] Update 152: PlayerMotion.grid / gridMove (centre to centre, held: chained steps; Game sets it in 2D unless
        db.freeMove2D). Flat props one InstancedMesh per type (slots → rustle with a Y twist, cutting), patchSway,
        patchFlat2D (+0.5 z in 2D). db.mapFolders (optgroups in the map select; Map Properties → Folder).
        editor/MvImporter.ts (guessSheet by aspect, cutSheet: A1 water strips played 0 1 2 1, A2 / A4 tops
        autotiles, A3 / A4 walls, A5 / B plain; commitTile quiet).
  - [x] Update 151: pixelTiles frameQuarters / framePieceRect / drawFrameCell (corner tiles of the frame: outer
        half where the patch ends, inner where it continues; inside corners from the corners tile, middle or edge).
        TileDef layout 'frame', frameTiles, edges, corners, cornersAt, edgeBlocks; TileTexture.edges / corners;
        buildPixelTiles rewritten (frame meshes, trims at +0.003). TileMap: upper non-☆ tile decides passage;
        edgeBlocks blocks cells with a different 4-neighbour (store.autoBlocking mirrors it). 2D: lean shader shifts
        sprites +0.5 z (feet on the cell's bottom edge), PlayerMotion setBody2D (radius 0.4 × 0.45), editor
        drawStanding / picking / outlines shifted too. Idea: grid movement for 2D (RPG Maker steps).
  - [x] Update 150: skinned built-in tiles carry kind / frames / fps / blocks / above (TileCatalog), Kind and Passage
        in the skin importer. Palette: tile settings modal from ✎ (no panel above the list), tilePicks with Group… /
        Delete, prop picks gain Group… / Delete, groupSections (details, open state in localStorage
        hd2d.palGroup.*), assets.tileGroups / propGroups via setPaletteGroup. Inspector is a section inside the left
        bar (hidden with nothing selected; above the events list in Events), right bar and Details button gone;
        .layout --left-w set by the .side-grip drag (localStorage hd2d.editorLeftWidth). Maps grouping: later.
  - [x] Update 149: editor/SheetPicker.ts pickFromSheet (grid, drag a box of cells, tile size 16–64) → PropImporter
        sets the picture, size in tiles, scale = tile px, offset 0. RPG Maker plan (145–149) done.
  - [x] Update 148: TileDef kind 'wall' (wallQuarters: outer / inner half-tile per side, 4 rows; quartersFor /
        blockRows shared). MapData.heightMode 'flat' | '3d'; TileMap.flatByDefault (Game sets it from viewMode before
        building maps, false for battle stages) drops heights / ramps / heightStyles. Next: box-select a sheet into a prop.
  - [x] Update 147: MapData.upper (rows, space = none), TileMap.upper(); upper X tiles block (☆ don't). TileDef.above;
        buildPixelTiles also draws the upper layer (plain tiles by span piece, alphaTest 0.5, lift 0.014); ☆ meshes
        depthTest off, renderOrder 20. Editor: store.terrainLayer / upperTile / upperAt / setUpper / layerAt /
        paintLayer (pencil, rectangle, fill), upper drawn over the 2D map, resize and tile delete handle it, Passage
        select in the tile editor. Next: RPG Maker cliffs (flat), then box-select a sheet into a prop.
  - [x] Update 146: TileDef kind 'animated' / 'autotile', frames, fps; world/pixelTiles.ts (frameLayout,
        autotileQuarters: per quarter v / h / diagonal → A2 half-tile, drawPixelTile for the editor). WorldBuilder
        buildPixelTiles: own flat mesh per tile (quarters for autotiles) at surfaceY, nearest, UVs inset half a
        pixel, frame by texture offset in onBeforeRender from tickPixelTiles(elapsed); their overlays / slivers
        skipped and edge blending off. TileImporter: Kind, Frames, Speed, + Add frames, animated pond preview.
        Next: upper terrain layer, passage O / X / ☆, cliffs.
  - [x] Update 145: Database viewMode '2d' / playerLayer. lean.ts uHd2D / uHdPlayer, per-instance hdLayer (hdNudge now
        only the tie); 2D: depth at the ground (y 0) pulled toward the camera by a share of the distance, (25 − layer)
        × 0.012 + z × 0.00002 + tie × 0.0001; non-instanced lean sprites (characters, events) use the player layer;
        not in shadow passes. 2D camera near = 0.4 × distance for depth precision. No on-top copies in 2D.
        Plan next: tile kinds (plain / animated / autotile A2, animated autotile), passage O / X / ☆, upper terrain
        layer, RPG Maker cliffs (flat, per-map option vs 3D heights), box-select a sheet into a prop.
  - [x] Update 144: prop layers (PropData.layer, PropDef.layer, store.propLayer; lean.ts layerNudge → per-instance
        `hdNudge` attribute pulling depth toward the camera, (25 − layer) × 0.01 + a 5-step tie of 0.0018; flat
        props raised by 0.4 × that). Backpack 440px wide, 44px slots, menu-note hidden, actions rendered outside
        the box as a fixed pop-up to its left.
  - [x] Update 143: camera angle up to 90° (runtime caps at 89.5° so lookAt keeps its up), Top-down 2D preset
        (TOPDOWN_OVERWORLD_CAMERA 90 / 38 / 15 / 100); fog near / far pushed back by distance − 14.5; tiltFade
        ramps in from 70° to 85°.
  - [x] Update 142: Oct 26 morning notes. "Characters always on top" off still drew the hero over a tree and cliff
        tops: the ground yield (Update 91b) and props with frontOfTiles false (pushed back like the ground) did it.
        Done: lean.ts uniforms `uHdYield` (ground: 3.5 on, 1.0 off; with none, leaned trees sank behind low ledges
        behind them) and `uHdBack` (props not drawn in front of tiles: 3.5 on, 0 off), set by `setGroundYield`. Achievements page draws the Journal's tab strip. Riding: hold B / Esc
        (DISMOUNT_HOLD 0.45 s) gets off; a tap opens the Backpack / Settings on release. Party menu's corner buttons
        removed (touch: Party, Bag, Map, ⚙ buttons instead). Backpack: icon pocket tabs (Game.POCKET_ICONS, tab titles
        as tooltips), 8 columns of 40 px (gear 4 + 4), details below the grid at a fixed 132 px above the controls.
        Database `aButton` (Player tab): Jump or a field use / power; Game `aButtonPower` (Sprint while A held).
  - [ ] Later: gifting and character rooms. A tower with a room per character; "Give a gift to Crowley?" → "Who's it
        from?" (party list) → the item goes on a decoration spot in Crowley's room (markers like rest spots) and
        Crowley's view of the giver rises by X. "Favorite gift" as a roleplay title.
  - [ ] Later: downtime mini-games (all must play well on a controller: cards, boards, timing, not drawing):
        blackjack with Lynn, swordplay timing with Katrina, magic element sequences with Crowley, CHESS with
        Eleanor (real chess with an AI; not a priority, keep on the list). Each gives relationship points.
- [ ] Future (owner's notes, Oct 22; plan them before building):
  - NPC behaviour (brainstorm first): daily routines and routes, beds and homes, reacting to weather and events
    (heading indoors when it rains, shops closing in blizzards), schedules by hour.
  - Maps: a better map picker, deleting maps, map groups / folders.
  - Button prompts and help text follow the player's custom controls (keyboard and controller).
  - Alchemy / crafting: an Alchemy Set (a key item, or a prop on the map) opens a crafting screen: three boxes on a
    wooden bench with a beaker behind each (up to three materials, several of each), "=", a big round beaker showing
    the result, and a CRAFT button. Each press makes one more while the materials last (3 of each: three crafts),
    e.g. firewood + fur + stone = Stone Axe. Crafting makes items, armor and weapons; the Forge upgrades them.
    Database → Crafting: add / remove recipes, each up to three material items (from the item list) and the result;
    key items can't be crafted. Decided: the order of the materials doesn't matter, only that they're right; a
    recipe takes two or three materials (a stone knife + fur = leather); one craft makes one, and the CRAFT button
    keeps going while the materials last (2 stone knives + 3 fur: two leather). Each material can be marked
    "kept, not used up" (a tool: the knife stays in the bag).
  - Remove copyrighted material, names and references from the engine, code and descriptions (game names used as
    style references in the UI text and docs: Pokémon, Legend of Dragoon, Final Fantasy, RPG Maker, Halo, Baldur's
    Gate…; built-in names; anything taken from other games). Third-party art keeps its licence credits.
- [ ] Later: desktop build (Windows app: Electron or Tauri; saves in a folder, real fullscreen, Steam-ready); an
      optional "PS2 era" render mode.

## Next (planned Oct 17)
- [x] Update 61: active fighter's ring in their Database colour and a glowing outline on their card; self-switches
      (A–D per event, Set self switch command, page condition); a Switches window (+ / − / rename) wherever a switch
      is picked, the names kept in the Database.
- [x] Update 62: the scenery beyond the map edge follows the height of the edge tiles (cliff faces between steps);
      bridges and platforms (plank, rope and stone bridges, docks; a "walk on top" prop setting).
- [x] Update 62b: height styles for raised and lowered ground, painted like water kinds with their own symbols:
      Blocky (as now), Soft blocky (bevelled, rounded edges and corners), Smooth / hills (heights blended into rolling
      hills), Cliffs (1×1 like blocks but jagged rock faces); waterfalls where water drops more than 2 heights.
      (Props in water half-submerged: done in update 62.)
      Bridges with two levels: walked on from the bank, swum or walked under from below (with enough headroom),
      for the hero, the party and enemies.
- [x] Update 63: window themes (Ember, Medieval Parchment, Medieval Wood, Dwarven, Elvish, Titan) for menus, text
      boxes and the HUD; a default in the Database, chosen by players in Settings; a preview page first.
- [x] Update 63b: soft-blocky bevels closed where they end against higher or square-edged ground (no gaps or
      floating corners); cliff faces flush at their ends (no seams down corners); bridges keep walkers on them (along
      the bridge only, off at open ends; getting on only from the ends) for the hero, the party and enemies.
- [x] Update 64: seven stats (STR melee, DEX ranged / accuracy / crits, AGI turn speed and evasion, END ailment
      resistance and a little HP, DEF, MAG, MDF); buffs and debuffs working in battle, Haste / Slow; a Shared skill
      tree for the whole party (stamina and party-wide boosts, new members included). Also: hits can miss (accuracy
      against dodging), Support spells (Haste, Slow), enemy Buff actions, enemy Accuracy / Evasion / Ailment resist /
      Critical hit % fields, party points (Give skill points → Party points).
- [x] Update 65: remove the action battle system (keep bumping into foes, and the sword / bow as field tools with the
      bow's lock-on for sniping foes to start a battle); skills that only worked in real time removed or reworked;
      Database forms reorganised Guerilla-style (all switches together at the top, then named sections with a jump bar)
      and the tabs regrouped. Also: Assassinate and Silent Shot reworked for the map, Steady Guard heals on Guard,
      untrained medium / heavy weapons hit for three quarters, battle Records now count (damage, crits, best hit).

## Tablet editing (Oct 19)
- [x] Update 67: Push to GitHub and Pull from GitHub in the online editor (Project menu): a fine-grained token kept
      in the browser, one commit per Push on top of what's there, Pull brings in the PC's pushes, files changed in
      both places ask which to keep; the site records the commit it was built from (data/build.json).
- [x] Update 67b: Backspace works as Esc everywhere outside text boxes (editor, game, Character Builder).
- [x] Update 68: support spells on either side (Cast on → Either side: Haste a friend or a foe); buffs that last the
      whole battle; battle weather (starts as the map's; spells and enemy Buff actions can bring Rain, Sunlight,
      Sandstorm… for some rounds or the whole battle, strengthening and weakening elements); a Rain Call spell.
- [x] Update 69: Terrain → a built-in tile → Picture: Built-in or Custom picture (swap its look on every map without
      repainting; everything else about the tile stays).

## Combat and classes (planned Oct 19, before Travel)
- [x] Update 70: classes give a one-time stat boost when joined (classes can't be changed); per class, each weapon
      type (swords, daggers, axes, maces, spears, bows, staves, wands…) and armor weight (light, medium, heavy,
      shields) is Trained / Untrained (weaker: ¾ damage, armor costs Agility and Evasion) / Can't use; items get a
      weapon type; skill trees can still teach a proficiency.
- [x] Update 71: enemy levels: a level range per troop / spawn on the map (stats grow per level); an event command
      for "dynamic" levels (spawns come out near the party's average level, a couple either side). EXP rework: only
      active fighters earn EXP (others with an EXP Share accessory or the EXP All key item, switched on and off in
      Key items, each giving a % set on the item); EXP given per foe as it falls, bonuses for the finishing blow,
      Additions (more for faster and more accurate ones; a "+10 EXP" pop-up at the bottom left per strike, like
      Legend of Dragoon's SP), no KOs, weakness; a breakdown on the victory screen.
      Misses: an Addition that misses (the hero runs up, no prompt, MISS, a pause, snaps back); accuracy on weapons
      and spells (spells against MDF); Accuracy / Evasion buffs; a Never miss option.
- [x] Update 72: spell additions: a fixed button sequence per spell (more at higher ranks) while the camera pulls in on
      the caster; mistakes weaken it, a fast and accurate cast earns bonus EXP; per spell, a good cast makes support
      spells stronger or last longer.
- [x] Update 73: Single battle mode (Database → Combat; Pokémon-style): one hero out at a time, swap any time (the
      swap goes first) or after a KO, items on the reserve, both sides pick and the faster acts first (no turn bar);
      up to 8 active members in this mode. Troops: Full troop (a normal group fight), One at random (wild
      encounters), One at a time (trainers: the next steps in), up to 8 foes in this mode. A map sprite you bump into
      is the foe you fight.
- [x] Update 74: Single mode defaults: wild encounter (one at random) unless a troop, a Start battle event (wild /
      trainer / swarm), the map (Map Properties → Battles) or Database → Combat says otherwise.

## Combat (ideas, Oct 18)
- [x] Impact materials: each enemy has a Material type in the Database (flesh, plant, metal, stone, wood, bone,
      liquid, gel, crystal, spirit / ethereal, cloth…) setting the sound when a sword or arrow hits it (squish, vine
      chop, metal ding, stone crack…), plus up to two Material effects (blood — recolourable for ooze / sap / ichor —,
      sparks, stone bits, wood chips, water / gel splash, bone shards, crystal shards, wisps). Critical hits: screen
      shake, a big CRITICAL with a crack / rumble. Weak or immune hits: a soft thump and a big WEAK (the pop-up made
      larger).
- [x] Battle log beside the battle window (left side): Y selects it to scroll up and down, to review what happened.
- [x] Monster stat blocks (Database switch): blocks across the top, lined up with the party's, one per foe — picture
      left, name, element (or Normal) and HP + MP bars (MP greyed when unused) right; bosses can have an overdrive
      gauge across the whole bottom. A fallen foe's block fades out. With blocks on, the names and bars over the
      sprites are hidden; targeting a foe glows its block in its element colour (a left-to-right blend for two
      elements, gold / tan for Normal), with the pause menu's arrows above and below the block, and still the arrow
      over the foe's head.
      (Done in update 66; the overdrive gauge fills as the boss is hurt and makes its next move hit half again as hard.)

## Travel (ideas, Oct 17)
- [x] Horses (update 75): rented at stables (one at a time, tiers with their own stamina and jump, priced by tier); A next to
      the horse mounts, B dismounts (B's key item / spell otherwise); faster on the map; jump 1★ 3 tiles, 2★ 4,
      3★ 5; left where the player got off (saved per map); a Saddle key item sends it home to its stable (so a new
      one can be rented elsewhere). Not shown in battles; still mounted after one. Placeholder horse art for now.
- [x] Griffin flights (update 76; WoW-style): roosts in some towns, fly to known roosts picked on the world map, priced by
      distance. Only roosts unlocked by talking to their griffin master. The griffin flies the route over the World
      layout's maps (lighter versions) with the camera following, unmapped stretches filled with forest / theme
      scenery, at one speed (long flights take longer, no skip), then lands, drops the player off and flies away.
- [x] Pocket Handheld battle layout (update 77; Pokémon Gold / Silver style): foe block top left, hero block right with
      HP numbers, EXP bar and a violet MP orb; four spheres per side (orange to fight, dark with a red ✕ when KO'd,
      empty); commands as a 3 × 2 word grid; the log as a bottom text box; the handheld camera (hero from behind at
      the lower left, foe upper right). Single mode now fights at most 4 (party pool and trainer foes).
- [x] Pocket polish (update 78): blocks half the screen wide and scaled; a fixed-size command box with a boxed choice;
      EXP and loot told in the log (no results screen in Pocket Handheld; EXP Share / All named); the Settings list
      scrolls to follow the controller; themed frames no longer show a gap inside the outline; the bottom EXP bar
      takes the theme's frame; Controls opened from Settings no longer shows the list through it.
- [x] Element stones (update 79): Fragments / Shards / Heart Stones per element in two Element slots (Primary sets the
      basic attack's element), tiered damage and weakness, pair bonus, same-element spell bonus, fusing from the bag,
      Fragment drops; shards no longer set in gear; Normal instead of Non-elemental; element pills and circles; the
      Journal's Type Chart.
- [x] Forms (update 80): heroes' mid and final forms (level, look, face) with a transformation scene after the battle
      that reached the level; monsters' advanced forms (own entry, comes out at a level, Bestiary chain and order).
- [x] Pocket text box and Potato quality (update 81): shorter stat blocks (HP numbers beside the bar); a one-line
      text box that waits for OK (attacks, damage with its element, effectiveness, defeats, EXP, level ups with a
      stats box, loot), centred when the commands are hidden; Potato quality and a cloud-shadows switch.
- [x] Pocket flow (update 82): one foe out → no target choice; moves announced (typed, short pause, no button);
      no damage lines, effectiveness / criticals wait for OK; the text box types its lines; RetroMon window theme
      (also skins the Pocket blocks, text box and commands in every theme).
- [x] Window touches and results order (update 83): window opacity, colour, text colour and frame colour (Settings and
      Database); element pills at the end of the HP bar's row; Pocket results: Victory + fanfare, EXP (with bonus)
      in one window, loot, level ups with stats; transformations play in the dark before the map fades in.
      83b/c: the hero block: name, HP bar with its numbers under it, EXP bar and spheres in a column (the element pill
      ending with the bars), the MP orb beside them inside the block.
- [x] Update 84: Pocket Use Item picks from two lists (party with the one out in gold and the bench, and the foes; harmful
      items list the foes first), so benched members can be healed; the empty top HUD panel (condensed HUD) no longer
      draws a window in themes; keys reach the game again when a clicked button or hidden field kept the focus.
- [x] Update 85: handheld-style map camera (Database → World → Camera: angle 56°, distance, field of view; "Classic"
      preset for the old one) with standing sprites leaning back to face it (Sprite lean, 55% by default).
- [x] Update 86: compact Database pages (Player, Heroes, Combat, Enemies, Spells, Weather & temperature, Camera):
      edit panel at most 800px, side-by-side short boxes, setting help behind an "i" button, switches stacked in one
      column, enemy Immune / Absorbs as a checkbox table; the Weather page's spell-length row lines up again.
- [x] Update 87: status pills beside the name and level in Pocket Handheld (short tags by default, full words as a
      setting; colours, tag and word per ailment in Database → Combat → Status pills); one ailment at a time in
      turn-based battles; element pills get their circle and symbol docked on the left; the Addition ring in the
      middle of the screen; battle pauses run on while the text box is read (no wait after OK); slung weapons, the
      bow and the hand fire lean with their sprite (no more poking out in front); the window theme and other unset
      settings no longer reset when the game loads; the party pop-up, swap list, selected party card, skill tree
      names and tabs follow the theme (selected words readable on a tinted selection).
- [x] Update 88: soft-blocky bevels taper into closed corners (no dark wedges; no round shoreline walls through
      them); battle EXP told and filled once after Victory (total + bonus), the bar running through each level;
      ailments last into the next battle (per ailment, Database → Combat → Ailments → Lasts; cured by items or rest);
      hits play out in order (strike, step back, flash, drain with counting numbers, then the lines); burn and poison
      bite at the end of each round with a line; "is fast asleep!" and "woke up!" lines; party members no longer heal
      on the map when the hero's health doesn't; HUD MP purple and EXP light blue (as in battle) and a gold level
      pill; loot lines with icons; the Party tab and Status page redone in the handheld games' style.
- [x] Update 89 (part 1): Status page Stats with the seven stats on the left and the battle numbers on the right;
      fighting styles gone from Status and Equipment. Soft-blocky rounded corners and a dithered grass lip over the
      cliff tops are built in but off (SOFT_LOOK in terrainGeometry.ts) until a look is picked from the previews.
- [x] Update 89 (part 2): Version C picked: soft-blocky outer corners rounded (half a tile), inner corners curving
      round into the lower cell, bevels and lip lit like the top (no line); the grass lip on every height style
      (and the round shoreline banks); Status stats zero-padded (08) so the rank pills line up.
- [x] Update 90: the pale green line along cliff edges gone (the grass lip's texture stays sharp at any angle);
      torch, campfire and lamp flames, lights and embers lean with their props; battle results: each hero's level up
      straight after their EXP, before the loot, and no EXP bar movement before "Victory!" (Addition strikes moved
      it); "Jordan was poisoned!" lines that wait for OK; new prop shapes for tall grass: Star ✳, Rows ≡, Thicket.
- [x] Tall-grass shapes: the owner keeps all three (Star ✳, Rows ≡, Thicket) alongside Cross ×.
- [ ] Lingering ailments as pills on the HUD party cards.
- [x] Update 91 (part 1): Party tab boxes 60% wide, centred, three to the column's height, with EXP bar and numbers;
      Items: the party strip beside the bag is gone; using an item opens a "Use X on whom?" pop-up like the battle's.
- [x] Update 91 (part 2): sprites and props drawn over bevels and cliff walls (they keep the depth they'd have
      standing upright); wall props don't lean; ladders stretch to their wall; tall grass rustles; built-in Tall
      grass, Really tall grass and Wheat; everyone who fought a foe shares its EXP (shown after the first hero's);
      low-HP alert in battle; MP no longer comes back on the map (hero and party); pause tab icons follow the tab's
      text; coin beside the bag's gold; Database → Title & menus: Bars (health, magic, EXP, stamina colours; HP green
      everywhere by default), stamina wheel steady option, Party page layout editor; per-tile "make a normal map".
- [x] Update 91b: terrain gives way to characters and props in depth on the map (no hiding behind a ledge or a tall
      cliff, like the handheld games; buildings still hide you); a hero swapped out still gets the EXP of the foes
      they fought (they were dropped from the battle's lists), told in turn after the first hero's EXP and level up.
- [x] Owner's list (Oct 20, late) (update 92): battle item picker HP bars yellow/red by health; low-HP alert not playing; map /
      title music sometimes kept playing under the battle music; hero briefly faces the camera when hit; battle
      depth-of-field blurs the tops of tall enemies; title → New / Load: keep the title picture up through the fade
      out, then fade in on the right map; steel arrows auto-equipped (the map bow and sword are hidden field tools:
      no arrows used, nothing equipped); Equipment page top-aligned (gear and stats beside the picture panel);
      the triggers (LT / RT) on Equipment, Status and Skill Tree switch party member; Swap first in the Party menu; Addition moves
      into the Equipment page (one equipped at a time), everyone starts with Quick Strike, "plain attack" only for
      heroes set to No Additions in the Database (with Melee or Ranged: ranged fires the bow without running in);
      Settings → Restore defaults asks "Are you sure?"; console command reset_achievements; check every pause-menu
      key/button hint is right.
- [x] Owner's list (Oct 20, night) (update 93):
  - [x] Props: a "Drawn in front of tiles" toggle (on by default, as now). Off for props like the tall wooden
        bridge/platform, whose legs show through the cliff ground in front of them.
  - [x] Items: remove the "Amounts are percentages of the maximum" toggle (it doesn't seem to work for the owner).
        Instead HP and MP each get a plain amount box and a % box, used together: 10 + 30% restores 10 plus 30% of
        max HP. Text reads "Restores 10 + 30% HP".
  - [x] Battle log: the menu confirm chime plays when pressing Next / Continue on a message.
  - [x] Battles show the map's sky (skybox) instead of plain grey fog.
  - [x] Day/night sky: the dawn/dusk change is too fast. Slow it down, with a Database "Sky transition speed" setting.
  - [x] Battle spell menu: the element's icon beside each spell's name (the spell's own Database icon if it has no
        element).
  - [x] Battle start: health bars start at the hero's current health (no drain down from full). If needed, build
        the scene first and fade in once the bars are set.
- [x] Props: a Walk sound (ground sounds or any sound file); bridges sound like their wood or stone (update 96b).
- [x] Owner's list (Oct 21, noon) (update 97):
  - [x] Shop lists follow the cursor (Buy and Sell).
  - [x] Battle Items list no longer under the hero's block (it moves up), with item icons.
  - [x] Buff / debuff arrows with the stat under them, beside the spheres (not over the head).
  - [x] Item target lists and the Swap list show buffs beside names; Swap shows faces and HP / MP / EXP bars (no
        repeated HP on the right).
  - [x] Using a healing item: the bar fills first, then "X recovered N HP!" waits for OK (bag and battle).
  - [x] Knocked-out party members stay down (no getting back up with a quarter of their health) and are hidden on the
        map until healed.
  - [x] Revive items (a Revives switch) usable on knocked-out heroes from the bag; other items refuse them.
- [x] Owner's list (Oct 21, morning) (update 96):
  - [x] Picture bridges drawn at the deck's height (where the banks meet), not down at the ground or water; lying
        flat on the deck by default (or standing up); no water ripples round them.
  - [x] Props: a "Camera tilt" setting (off: the prop stays upright instead of leaning toward the map camera).
  - [x] Props palette: the tools, chosen prop and import buttons stay at the top while the lists scroll.
- [x] Owner's list (Oct 20, 11:35 pm) (update 95):
  - [x] Stat order (Database → Game → Stat order): reorder STR, DEX… once; every list in the game and the Database follows it.
  - [x] "Weight" renamed "Armor type", with an Armor types window (add, rename, remove; untrained costs per type).
  - [x] Items split into tabs: Items, Weapons, Gear (armor, shields, accessories), Shards (spell shards and element
        stones), Key items.
  - [x] Many more built-in icons (weapons, armor and clothes, potions and bottles, food, drinks, materials, gems,
        ores, herbs, containers, spell symbols…), in folding groups, and a Tint for any item icon.
  - [x] Spells: their own icon (built-in, tintable) or "Use its element".
  - [x] Classes → Skill trees: a dropdown per tree (the old checkboxes had been moved to the top of the form by the
        switches-first layout, so only the note showed), with a picture of each tree that opens it in Skill trees.
- [x] Owner's list (Oct 20, late night) (update 94):
  - [x] Props: a "Walk on top (bridge or platform)" setting (east–west, north–south, or a platform any way), drawn as
        the prop's own picture or built in 3D. Customised built-in bridges that had lost it work as bridges again.
  - [x] Props palette keeps its scroll position when a prop's window opens and closes (or a prop is picked).
  - [x] Props palette: tick props (checkbox on each card, Tick all per section) and Edit together: only the settings
        changed there are given to every ticked prop; each keeps everything else.

## World
- [ ] Moving platforms (left ↔ right, rising ↔ falling), after bridges and platforms.
- [x] Shallow water to wade through, with ripples round the feet and splashing footsteps (earlier updates).
- [x] Real-world date under the game time in the HUD (update 37). Events that happen on certain days or days of the week
      (every Saturday a certain enemy spawns in a certain place with rare items…).
- [x] Enemies walking the maps as events, to bump into or attack to start a battle (earlier updates).

## Menus and saving
- [x] Achievements: their own tab in the pause menu (update 48), with a points bar (update 57).
- [ ] Journal: Story tab. Like the quest log but for the main storyline; each entry shows the game time and real-world
      date it was unlocked, with a screenshot of the moment (an event command "Story note" that takes it).

## Messages
- [ ] Speech bubble position chosen in the editor (per message or per character). Now: text box styles choose
      speech bubble or plain box (update 51), but above / below / top / bottom is still the player's setting.
- [ ] Message window backgrounds: imported images, cropped like props. (Text box styles cover colours, bold, italic.)

## Abilities and combat
- [x] Swapping party members mid-battle (Swap in the battle menu) and battle maps as backdrops (earlier updates).
- [x] Spells that charge for turns, with chants (earlier updates).
- [ ] Turn-based, next steps: ~~buffs in battle (update 64)~~, enemy spells that charge and the party's Counterspell,
      Limit / Overdrive-style specials.
- [ ] Classes: a class change screen at a trainer (an event command opening it), class stat bonuses. Now: Party → a
      hero → Class changes it.

## Gathering
- [ ] Fishing, next steps: cooking fish at a campfire; a reeling mini-game for big fish.

## Resting
- [x] The Sleep command: the camera tilts up to the sky as the hours roll by, then back down (update 53).
- [ ] The hero sits down at a campfire when resting there (before the sky turns).
- [ ] Party members gather round a campfire and sit when the hero is within 3–5 tiles of it (they still get up to
      fight if the party is attacked).

## Done
- [x] AI party members (update 23).
- [x] Party members have their own level and EXP (update 24).
- [x] Cloud shadows (update 24: Inspector → Cloud shadows).
- [x] Continue removed from the title; save pictures; delete saves with confirmation (update 24).
- [x] Letter tick sound (update 24: Settings → Sound → Letter ticks).
- [x] Light ring orb (update 24: Items → the ring → Light: Orb).
- [x] Followers on load and in water, water look options and ripples, swim sound (update 27).
- [x] Rings → spell shards "Light" and "Water Walk"; cutting ring removed (update 27).
- [x] Ring slot removed (rings are accessories); Magic tree perks instead of shards; Light is a glow, no beam (update 28).
- [x] Mining, forges (smelt, upgrade, enchant), weapon materials, fire burns vines, weapon proficiency, harvest pickup delay, large boulder (update 29).
- [x] Calmer water; Water tab with per-pool styles (pond, lake, river, sea, muddy, swamp, poison goo, lava with glow and ailments); ripples round props in water (update 30).
- [x] Shards tab in the bag; spells on their own button (B / F), off the weapon wheel; chest gem charm; enchanted weapons glow and trail in the element's colour (update 30).
- [x] Water past the map edge, paint-bucket fill, editor marks per water style; no chest charm; party HUD piece with stacking and faces; log box/wrap; D-pad ↓ in quick items; bag tabs as 8 × 8 pockets; Shards tab enchanting; new Equipment page with who-can-use (update 31).
- [x] Fishing: rod, painted fishing spots with catch tables (weight, day / night, rare), cast / bite / timing, Records (update 32).
- [x] Burning effect; Party menu (Equipment / Skill Tree / Stats per hero, level-up highlight, member skill trees); Shards tab holder lists; quick slots centred; draggable playtest panel (update 33).
- [x] Worn gear and shards stay in the bag (in use, who / where); shards readied or set in gear from the bag (no anvil enchanting); party fighting styles with weapon fallback (update 34).
- [x] Status page (About, ailments, fighting style); Gear tab as Weapons | Armor with per-hero comparison; hero colours; party beside the bag (update 35).
- [x] River currents push swimmers; drowning sinks; seasons (recolouring, snow, bare or snowy trees, ice and sliding, cold-season ambience) (update 36).
- [x] Turn-based battles as an option (Database → Combat → Battle system): FFX-style turn order or rounds, map enemies and random encounters start battles, Attack / Magic / Items / Guard / Run (update 38).
- [x] Turn-based battles: ailments run on turns, Legend of Dragoon Guard (heals, wards off ailments), enemy actions (attack / spell / heal / guard, whole-party hits, health conditions, Counterspell flag) (update 39).
- [x] Editor online (GitHub Pages) for the Android tablet: changes kept in the browser, Project → Save changes as .zip / Open project .zip / Forget my changes (update 40).
- [x] Learned spells with ranks and charge turns, Counterspell, Additions (timed strikes, button prompts, mastery), classes with their own skill trees, Menu → Abilities, Start battle / Teach / Change class event commands, Character Builder online (update 41).
- [x] Database → Troops, encounter zones painted on maps (Spawns layer) with day/night, weekday and switch conditions, the game's default settings file (data/settings.json) (update 42).
- [x] Battle maps: turn-based battles on a map you've made, with party and enemy markers and a camera behind the party (FFX / Legend of Dragoon style); chosen per map, per zone or per Start battle command (update 43).
- [x] Battle cameras on LB / RB, Legend of Dragoon command bar, HP-coloured target arrows, targeting anyone, items on enemies, volume groups with Master at 50%, victory EXP and Spoils screens, battle transitions and fade out / in (update 44).
- [x] Three a side, row targeting (left / right in a row, up / down between rows), Dragon Legend battle layout (default) with face art, Forbidden Fantasy layout, centred Items / Magic lists with a description box (update 45).
- [x] Turn arrow, Addition and casting camera shots, damage at the end of Additions, item toss, wounded pose, voices (call-outs, chants, attack sounds), victory music, party of eight with Swap, healing from the menu, weather in battle, condensed / hidden HUD bars (update 46).
- [x] Spoils panel cleared between battles, Additions run to the front of the target, casting shot from in front (the caster keeps facing the foes), poses that lose clothing layers skipped, title screen on a set map or a picture / video, fade to black and HUD fade-in from the title, menu icons, party / status cropping fixed, overworld sword and bow as field tools (no arrows) with Enable / disable overworld weapons, Light and Water Walk as key items (bag or B button), even autumn colours, corner slopes, hopping down low ledges (update 47).
- [x] Pause menu as one frame with tabs (Party cards with Swap, Items, Map, Journal, Achievements, Settings, System), the hero can be benched, World layout with snapping and place names, world map drawn from the maps with fog options, seamless map edges with neighbours drawn past the edge, achievements (rules, pop-up, Steam-ready IDs), developer console (update 48).
- [x] Pause frame sized to the party cards with equal tabs, world-map crosshair and tooltips, event map markers (kinds in Database → Map markers, switch-controlled, area outlines), console commands aimed at a hero, word bubbles on event pages (update 49).
- [x] Playtest fixes: delete saves with Y, HUD arranging from the pause menu, tap to walk off by default, newest achievements first, no AO box round battle sprites, matching battle frames, pause frame top to bottom with uncut tab names and arrows on the selected card, walking off ledges (Database → Player → Ledges) and quicker climbing, EXP in the HUD bars, stamina ring, a card per party member, mini-map, season picture, world map glide / one-tile steps / marker jumps, styled words in messages and bubbles with named text colours and message looks, enemy health and damage variance, full-screen Database with icon tabs, Delete under + New, Apply saves, Journal Bestiary, bug notes in the console (update 50).
- [x] Text box styles in Database → Text boxes (Speech, Sign, Narration, Item / Gold received, System, your own), picked per message (update 51).
- [x] System tab Load / Quit fixed, battle music (game default + overrides), smoother seamless maps (no slow pixel reads, padded lights, the map left kept as the neighbour), Map Properties window and icon layer tabs, audio from the project folders, enemy tint, battle height offsets, combat preview, gold on the HUD, camping props, erase by type / erase all of a type, heals stay on the hero, save screen on the current save, turns start on Attack, default Additions, party on save cards (update 52).
- [ ] A "Complete the Bestiary" achievement rule (every enemy met / defeated).
- [ ] Visible wandering enemies per zone (later).
- [x] Sky over Titan (stars, Saturn, sun, the real moon's phase with circuit lines, clouds by weather), moon phase in the clock card and as a condition, Sleep command with the sky transition (update 53).
- [x] Dynamic weather (season chances, storms with lightning and thunder, blizzards, haze, rain/snow by temperature), temperature (daily rolls, curve, map climate, Change temperature command, °F/°C), damp / frost / heat on the ground, Temperature and Weather conditions, heat and cold in battle (update 54).
- [x] Stat ranks (A–F growth per level, set per hero, changed by potions, gear and the Change stat growth rank command, coloured pills on Status), stat setup as Default / Custom → Roll Dice on a 3D dice table, Point Buy, Standard Array, "Set up stats on joining" per hero; level-up stat points removed (update 55).
- [x] Database: Duplicate button, right-click Duplicate / Copy / Paste and Ctrl+D / Ctrl+C / Ctrl+V in every list (update 56).
- [x] Turn-based party on the map: never fights or starts battles, follows (toggle in Combat) and hops where the hero jumped; the lineup's leader walks the map with their own sprite; achievement pop-up shows the description; points bar on the Achievements page (update 57). Everyone stands in their plain idle in battle, not the combat stance (update 57b).
- [x] Event sounds: a page's sound plays all the time, fading with distance and panned (built-in campfire, shore, waterfall, hum); lit campfires crackle (update 58).
- [x] Map themes (Database tab, Theme default in Map Properties), more edges (plains, rocky, desert, snowfield, snowy forest), built-in dirt / stone / rock / snow terrain and desert and snow props; map saves keep every setting (update 59).
- [x] Built-in effects and music remade as Game Boy-style chiptune (pulse, wave and noise channels), with Classic kept as a choice in Database → Audio (update 60); console audio_chiptune true / false to hear them in place of imported sounds (update 60b).
