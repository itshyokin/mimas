# Saturn Game Engine

The **Saturn Game Engine** is a browser-based 2.5D RPG engine in the spirit of RPG Maker MV, with HD-2D style lighting:
2D sprites standing in a lit 3D world, with dynamic lights, shadows, bloom and tilt-shift.

Written in TypeScript on top of three.js, built with Vite.

Its little sibling is **[Mimas](https://github.com/itshyokin/mimas)**, a fork for making Game Boy Advance
games from the same kind of maps (named after Saturn's smallest major moon).

## Running it on Windows

1. Install **Node.js LTS** from <https://nodejs.org> (the installer adds `node` and `npm`).
2. Open a terminal (PowerShell or Windows Terminal) in this folder.
3. Install dependencies (once):
   ```
   npm install
   ```
4. Start the dev server:
   ```
   npm run dev
   ```
   Open the address it prints (usually <http://localhost:5173>). Saving any file reloads the game instantly.

### The editor and game online (GitHub Pages), and editing on a tablet

Every push to the repository's `main` branch rebuilds the site (`.github/workflows/pages.yml`):

- Map editor: <https://itshyokin.github.io/hd2dengine/editor.html> (with a link to the Character Builder)
- Game: <https://itshyokin.github.io/hd2dengine/>

The online editor works in any recent browser, Android tablets and phones included. It opens the project as it is
on GitHub and keeps your changes **in that browser, on that device** (they're still there next time). The
**Project** button in the toolbar:

- **Push to GitHub / Pull from GitHub** (no PC or GitHub Desktop needed):
  - **Connect to GitHub…** (once per device): paste a GitHub token. Make it on github.com → Settings → Developer
    settings → **Fine-grained tokens** → Generate new token: *Only select repositories* → this repository, and
    Repository permissions → **Contents: Read and write**. The token is kept only in that browser; the window has the
    steps and a link. Lost the tablet? Delete the token on GitHub and it stops working at once. Owner, repository and
    branch fill themselves in on the online editor.
  - **⤓ Pull from GitHub**: brings in what was pushed from elsewhere (the PC) since this device last pulled or
    pushed, and reloads. Do it before you start.
  - **⤒ Push to GitHub…**: lists the files that differ from GitHub's and sends them as one commit, with a message
    you can change. Work pushed from the PC in the meantime stays. The online editor and game rebuild a minute or two
    later; on the PC, GitHub Desktop gets it with Fetch / Pull.
  - **Changed in both places**: each file edited on this device remembers which GitHub version the edit started
    from. If GitHub's has moved on since (changed from the PC, or this device kept an old copy from an earlier
    session), nothing is overwritten until you choose: on Push, *Pull first* or *Push mine over them*; on Pull, *Keep
    mine* or *Take GitHub's*. Files kept from before this was added always ask once.
  - Only people with write access to the repository can push: anyone else using the online editor only changes their
    own copy, on their own device. Deleting a map or file isn't sent (delete it on the PC).
- **Save changes as .zip**: only the files you changed, laid out like the project folder (`public/data/…`,
  `public/assets/…`). On the PC, unzip it into the project folder (replacing files), then commit and push with
  GitHub Desktop.
- **Open project .zip…**: a zip of the project folder (or its `public` folder, or a changes zip from another
  device); its maps, database and imported files replace the ones on this device.
- **Forget my changes…**: back to the project as it is on GitHub.

**No Esc key?** (Many tablet keyboards.) **Backspace** does everything Esc does, in the editor, the game and the
Character Builder: it closes windows and menus, cancels and deselects. While typing in a text box it still deletes
letters. (In the event command list, the Delete key or the ✕ button removes a command.)

Playtest works from the online editor too.

### Testing on an Android phone

With `npm run dev` running, the terminal also prints a **Network** address such as `http://192.168.1.20:5173`.
Open that on your phone while it's on the same Wi-Fi. If it doesn't load, allow Node.js through Windows Firewall
when prompted (private networks only).

### Other commands

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the game into `dist/` (a static site you can host anywhere, including Neocities). |
| `npm run preview` | Serves the `dist/` build locally to check it. |
| `npm run typecheck` | Runs the TypeScript checker over the whole project. |
| `npm run build:standalone` | Rebuilds `Map Editor.html` and `Playtest.html` (single files that run by double-clicking). |

## Character Builder

`Character Builder.html` (double-click; works in Firefox, Brave and on an Android tablet's browser) builds
character sprite sheets from layered parts, like RPG Maker MV's generator. There's also a hosted copy on claude.ai
that keeps your library in your Claude account, so the same parts and characters show on your tablet and PC.
The double-clicked copy saves into the browser it's opened in. Its *Back up library (.zip)* moves everything
between copies.

- **Body type**: Kid, Masculine or Feminine. Parts are made per body type (or for *all bodies*).
- **Parts**: body, eyes, hair, tops, bottoms, shoes, hats, face (beards, glasses), extras (scarves, belts) and back
  (capes, packs). Each has a colour row; *As drawn* keeps a part's own colours.
- **Preview**: walking or standing, facing any way, on grass, stone or a clear background, plus a turnaround of all
  four directions and the full sheet. **Randomize** makes quick NPCs.
- **Save** keeps a character; **Export PNG** saves its sheet; *Characters → Export all* zips every sheet.
- **Parts library**: add your own PNG parts (pick body and part, then the files) or a .zip of folders
  (`feminine/hair/braid.png`, `all/hats/straw_hat.png`). *Starter pack* gives every built-in part as a PNG plus a
  drawing guide per body to redraw in your art app. *Frame size*: 16×24 (one pixel per texel, like the built-in
  art), 32×48 (default) or 48×72.
- **Colours**: paint anything recolourable in greys. `#a8a8a8` becomes the picked colour, lighter greys highlights,
  darker greys shadows. Near-black outlines, pure white and coloured pixels stay as drawn.
- Layers stack: back, body, eyes, bottoms, shoes, tops, extras, face, hair, hats (facing up, the back layer goes over
  the clothes).

**Into the game**: Database → **Characters** → *Import character sheets…* (pick one or many PNGs). Each becomes a
character for events, enemies or the player (*Player* on its card). *Replace sheet…* updates one after you re-export
it. Sheets are saved to `public/assets/characters/`. Any RPG Maker MV-style sheet works: 3 frames across × 4 rows
(down, left, right, up), any frame size; characters always stand 1.5 tiles tall.

The builder's source is in `tools/character-builder/src/`; `python tools/character-builder/build.py` rebuilds it.
(The LPC edition below, with the weapon builder, is in `tools/lpc/builder/src/`; `python tools/lpc/builder/build.py`
rebuilds it into `tools/lpc/builder/site/`.)

### 3D characters (GLB / FBX)

Any character in Database → **Characters** can be a rigged 3D model instead of a sheet: *Use a 3D model…* on its
card. Type the model's path under `public/` (e.g. `assets/models/characters/party/katrina/katrina.glb`) or *Import a
model file…* (saved to `assets/models/characters/<id>/`). The window shows the model turning in a live preview:
- **Animation slots**: Idle, Walk, Run, Jump, Swim, Climb, Sit, Injured, KO, Attack, Spellcast. One file can hold every
  action (Blender actions, Mixamo takes); each slot plays one, picked from the list. Left on **Guess**, a slot takes
  the first action whose name fits (*Walk_Cycle* → Walk, *Death* → KO, *Attack1* → Attack); the dropdown shows which.
  *None* or nothing found: the slot uses Idle (Run and Swim use Walk first). ▶ previews a slot.
- **Start / End** beside each slot: play only those frames of its action (30 a second; blank: its start or end), to cut
  a few wonky frames off. Choosing another action clears them.
- **More actions from other files**: extra GLB / FBX files with actions for the same skeleton (same bone names), such
  as Mixamo animations. Actions with names that say nothing (Mixamo's *mixamo.com*, *Take 001*) are named after
  their file (*Jumping.fbx* → *Jumping*). An action already in the list isn't added again (a file exported with
  every action of the project only brings its new ones). Files in other units (Mixamo FBX in centimetres) are
  scaled to the model's skeleton, and their textures aren't loaded (only their actions are used).
- **Height** (tiles, default 1.6) and **Faces** (turn it if the model was made facing another way).
- **Size in battle**: the battle stage is seen up close, so models stand at half their height there by default
  (35% to full size).
- **3D characters** box, above the list, for every 3D character: the **Look**, **Legend of Dragoon** (crisp low-res
  textures, flat shading) or **Final Fantasy X** (smooth), and a **Dark outline** (on with Legend of Dragoon, off with
  FFX, unless set).

In the game the model is drawn everywhere the sheet was: the player and party on the map (walking, running, swimming,
climbing, jumping, turning smoothly to the exact way they move, diagonals included), events, enemies whose look is
that character, and the battle stage (attacks, spells, flinching, kneeling when weak, KO held on its last frame).
Faces in menus, battle pictures, save slots and the Bestiary are rendered from the model in its Idle pose. Actions
that walk the body forward (root motion) are kept in place: the game moves the character. Enemies drawn as a
3D character use Idle, Attack, Spellcast and KO (their death). Not yet: weapons and armor on the model (Update 104),
and Additions playing a combo as segments of the Attack action (Update 103).

**Exporting from Blender**: name actions clearly (Idle, Walk, Attack…); push each one down to an NLA track (or give
it a fake user) so the glTF exporter includes it; apply scale and rotation; export .glb with +Y up (the default).

### Character Builder, LPC edition

The hosted Character Builder now uses the Liberated Pixel Cup (LPC) sprites: 64 × 64 frames with walk, idle, run,
jump, climb, combat stance, slash, backslash, half slash, thrust, shoot, cast, hurt, sit and emote, for masculine,
feminine, teen, kid, muscular and pregnant bodies. Parts recolour with LPC's palettes.

- **Steam-safe parts only** (on by default) offers only parts available under CC0 or OGA-BY (credit required, DRM
  fine). Parts that are only CC-BY-SA / GPL get an *SA/GPL* tag when it's off, and a banner lists any in the character.
- **Export** chooses the animations in the sheet: walk and idle always, plus run/jump/climb, combat, and sit/emote. A
  townsperson with just walk and idle is a fraction of the size of a fighter.
- **Export PNG** writes the sheet with its animation layout and credits stored inside the PNG (an `hd2d-character`
  text chunk). **Credits** saves them as text; *Characters → Export all* zips every sheet with a combined CREDITS.txt.
- The library is built from a checkout of the LPC generator by `python tools/lpc/build_lpc.py <repo> <out>`
  (catalog, sprite packs, thumbnails). The builder's source is in `tools/lpc/builder/`.
- **Into the game**: import the exported PNG in Database → **Characters** like any sheet. The editor reads the
  animation layout and credits from it (the card says *Animated (13 animations) · Steam-safe*). In the game the
  character walks, idles, runs, jumps, climbs, takes a combat stance while fighting, swings with slash / backslash /
  half slash, draws and looses the bow with *shoot*, casts with *spellcast*, flinches and falls with *hurt*. Enemies
  using an LPC sheet do the same. Sheets without an animation fall back to the nearest one (walk at least).
- LPC sheets are drawn at **32 px per tile** (a 64 × 64 frame covers 2 × 2 tiles, the character about 1.5 tall).
- **Weapons**: animated characters carry the LPC sprite of what's equipped, drawn frame for frame with their own
  swings (see *LPC weapons* below). Build characters without a weapon in the builder, so the equipped one shows.

### Armor you can see (Updates 114, 120, 128)

- **Built-in clothing** (Update 128): the engine comes with 10 tops (shirts, a cardigan, leather, chainmail, plate),
  10 bottoms (pants, shorts, leggings, skirts, greaves) and 10 accessories (necklaces, earrings, capes, a hood, a
  bandana, gloves, a cravat), made from the Character Builder's Steam-safe parts for masc and femme bodies
  (`public/assets/worn/builtin`; rebuild them with `python tools/lpc/build_worn.py`). Their credits join the Credits
  screen when an item uses them.
- **Database → Items** (armor, accessories, shields) → **Look when worn**: three panels, **Top**, **Bottom** and
  **Accessory**: ◀ ▶ cycles through them (and None); colour swatches recolour the part from its own palettes, and
  **More colours / tint** tints it any colour. The preview shows the outfit on the player's look (Masc / Femme).
  The fourth panel, **Custom sprite** (Update 134): tick **Use custom clothes sprite** and press **Edit custom
  sprite…**. In the pop-up, pick up to three pictures, **Front**, **Back** and **Side** (the side one is mirrored for
  the other side), each a PNG of your own or one of the built-in item icons. Each tab shows the player's sprite facing
  that way: drag the picture into place, scroll or use the slider to scale it (and Turn to rotate it), for **Masc**
  and **Femme**. **Duplicate from masc / femme** copies the other body's setup to start from. In the game each picture
  is drawn in every frame of its direction and bobs with the walk. (Items with an older full clothes sheet keep it.)
- Starter outfits are added to the Database once: Traveler's Clothes, Leather Armor, Chainmail Shirt, Plate Armor,
  Wanderer's Cape and a Beaded Necklace.
- Capes have a back piece drawn behind the hero and a front drawn over them.
- **Bedroll** (Update 134): lies head-to-foot with the pillow at the top. Put one on a rest zone's **L** (Lie down)
  spot: the party member resting there stands on it facing you and its blanket is drawn over them, head on the pillow
  (no more knocked-out pose).

- **Database → Items** (armor, accessories, shields) → **Look when worn**: for the masculine and the feminine body,
  **+ Add a part…** picks the Character Builder's own parts (Torso, Legs, Feet, Arms & hands, Hats & helmets, Back),
  each with its colour variant or palette, just like in the builder. A preview shows the outfit, and the editor builds
  the clothes-only sheet itself and saves it as `assets/worn/<item>_<body>.png` (no exporting). **Steam-safe parts
  only** (on by default) lists CC0 / OGA-BY parts. The parts library is `tools/lpc/library`, served by **Start Map
  Editor.bat**.
- Or the older way: in the builder, dress a character and press **Export clothes only**, then **Choose a PNG…** here.
  **Tint it** recolours either kind (its shading is kept).
- The worn sheet is drawn **over** the hero's own sprite, so it covers their own clothes.
- **Database → Characters**: each animated card has a **Body** (masculine / feminine; read from the builder when the
  sheet is imported). Heroes wearing the item get its clothes drawn over their sheet, animation for animation, on the
  map, following, riding and in battle. With only one version, everyone uses it.

### Enemy sprites

Database → Enemies → **Sprite** has three kinds:

- **Matches the player's sprite sheet**: any character from Database → Characters (Character Builder sheets animate fully).
- **Flat sprite**: one picture (PNG, any size; huge drawings are shrunk to 256 px tall), no frames needed. The engine
  moves it: it **breathes** while standing, and **slides** (a little sway), **hops** (squash and stretch) or **flies**
  (hovers and bobs) when it moves. It's mirrored to face where it's going (*The picture faces*: right, left, or never
  mirror), lunges when it strikes, and flashes, glows and squashes like any enemy. *Height (tiles)* sets its size; the
  width follows the picture. Pictures are saved to `assets/enemies/`. Credit the artist in Database → Credits.
- **Built-in monster**: the slimes drawn by the engine.

### LPC weapons

Weapons, bows and shields have a **Sprite** (Database → Items, on the item): the LPC weapon an animated character
holds. Swords (dagger, arming sword in 8 metals, longsword, rapier, katana, scimitar, glowswords), a mace and a club,
staffs and a wand, bows, and shields. Only Steam-safe ones are included (no Steam-safe spears or axes exist in LPC yet).

- The weapon rides on the back while exploring and comes into the hand to attack (see *Carried weapons*), so the
  walking, running and jumping frames never show it out of step. Attacks use what the sprite can do: the arming
  sword has the full slash / half-slash / backslash combo, the longsword mixes in a reversed slash and a thrust, staffs
  thrust. Big swings use LPC's oversized frames (up to 6 × 6 tiles), centred on the character.
- Items without a sprite choice get one for their kind (light weapon: steel arming sword; others: longsword; bows: a
  bow; shields: a round shield). *None (icon)* keeps the old icon.
- **Shield** is a new equipment slot (it adds defence). Mira's shop in the sample map sells a Round Shield.
- **Enemies** using an animated character carry a sprite too (Database → Enemies: *Weapon sprite* and *Shield*).
- Characters without animations (RPG Maker-style sheets) still show the icons.
- The sheets are in `public/assets/weapons/` (rebuilt by `python tools/lpc/build_weapons.py <LPC generator repo> public/assets/weapons`).
  Their artists are added to the Credits screen for the sprites in use.

### Weapon builder

The Character Builder has a **Weapons** mode (top left: *Characters | Weapons*) for making your own weapon looks, so a
legendary sword can look different from a plain longsword, everywhere it shows: in the hand, on the back, in the bag.

- **Shape**: start from any of the Steam-safe LPC weapons (swords, maces and clubs, staffs, bows, shields).
- **Colours**: the weapon is split into parts by colour (metal and light parts, gold and brass, wood and leather, gems,
  outline). Give each part a material (steel, gold, obsidian, ice, ruby…), any colour, or keep it as drawn. Each part
  keeps its shading, and the swing smears follow the blade.
- **Effects**: a **glow** (colour, strength, pulse) and, for melee weapons, a **swing trail** (colour, length). They're
  saved with the weapon, and an item that picks it starts with them; Database → Items can still change them per item.
- **Preview**: your current character swings it (slash, backslash, thrust… whatever the shape has), from all four
  sides, with the icon at bag size and actual size.
- **Save** keeps it in your library (with your characters); **Export PNG** writes one PNG with everything inside: the
  sprite sheet, its icon, the LPC artists' credits (a recolour is still their work) and the effects.
- **Into the game**: Database → Items → a weapon → *Sprite* → **Import from the weapon builder…** (pick one or more
  PNGs). The sheet is saved to `assets/weapons/custom/` and the look listed under *Your weapons*. The item's icon
  switches to *From its sprite*, so the bag, shop, HUD and the weapon on the back all match.

**Icons from sprites**: every weapon sprite now has an icon cut from its own art (`thumbs.png`, rebuilt by
`python tools/lpc/weapon_icons.py`, which picks the frame that shows each weapon best and lays it on the same diagonal).
Any weapon, bow or shield item can use it: Items → *Icon* → **From its sprite**. On the hero's back these icons are
drawn at the sprites' own scale, so a dagger stays smaller than a longsword.

**Glow and swing trail per item**: Database → Items → a melee weapon or bow → *Effects*: *Glow* (colour, strength,
pulse) and, for melee weapons, *Swing trail* (colour, how many earlier frames echo behind the swing). Any rarity can
have them. They're drawn on animated (LPC) characters.

### Character Builder on your PC

The LPC Character Builder (characters and weapons) also runs from the engine folder, next to the map editor. Its
parts library is included (`tools/lpc/library/`, about 136 MB, the same one the hosted builder uses).

- Double-click **Start Character Builder.bat**, or press **Character Builder** in the map editor's toolbar (shown
  when the editor runs from *Start Map Editor.bat*).
- It's served by the same little server as the map editor (one window, one address), so your saved characters and
  weapons are there every time. They're kept by the browser on this computer.

**Moving characters and weapons between builders** (say, from the tablet to the PC): open *Characters* (or
*Weapons*) and press **Back up (.json)**: one file with every character and weapon and all their settings. On the
other builder, press **Import…** and pick it. Import also takes exported PNGs (characters and weapons carry their
settings inside them now) and *Export all* .zip files. Ones already there are only replaced by a newer copy, so
importing the same file twice doesn't make duplicates. Character PNGs exported before this change only hold the
sprite sheet: open those characters in the builder they were made in and export them again (or back them up).

### Your own picture for a built-in tile

Terrain → select a built-in tile (Grass, Path, Sand, Dirt, Stone paving, Rock, Snow, Lake bed) → **Picture**:
*Built-in* or *Custom picture*. Choosing Custom picture the first time opens the tile importer (same settings as
importing a tile: how many tiles one copy covers, resolution, filtering, a normal map); *Change…* picks a new one.
The picture replaces the painted look everywhere the tile is used, on every map, in the editor and the game (cliff
walls and the scenery past the map edge too), so nothing needs repainting. The tile keeps its footsteps, edge
blending, cliffs, road setting and the rest. Switching back to Built-in keeps the picture, to switch again later. It's
saved in `assets/tiles/` (named after the tile) and listed in `data/assets.json` under the built-in tile's key.

### LPC library (tiles and props)

Terrain → *+ Add from the LPC library…* (tiles) and Props → *+ Add from the LPC library…* (props) open a browser of
**LPC Revised** art (Eliza Wyatt and others, github.com/ElizaWy/LPC): about 3,000 pieces, all OGA-BY 3.0 (Steam-safe
with credit). Pick a group (Trees, Plants, Flowers, Rocks, Furniture, Beds, Seating, Smithing, Food, Doors, Windows,
Signs, Fences…; tiles: Terrain in four seasons, Floors, Walls, Roofs), a season, or search; click to pick several,
then *Add to project*.

- Added pieces become ordinary imported props and tiles (in `assets/props/` and `assets/tiles/`): edit them like any
  other. Their credits are saved with them and shown in the Credits screen.
- Props block the tiles under them (flowers, food and small items don't). Wall and roof tiles can be used for
  buildings (a building's *Walls* / *Roof* lists imported tiles).
- Pieces drawn lying flat (rugs, bridges, stairs, roof pieces) are left out: props stand upright in the 3D world.
- The library lives in `public/assets/lpc-library/` (rebuilt by `python tools/lpc/build_library.py <ElizaWy/LPC checkout> public/assets/lpc-library`).
  It's only for the editor: leave it out of a release if you like.

## Credits

The title screen has **Credits**. It lists your own sections first (Database → **Credits**: a heading and names,
one per line, in any order you like), then everyone whose sprite art is in the game, gathered automatically from the
imported characters' credits (with licences and links). Scroll with up / down; Enter or Esc closes it.

## Map editor

### Easiest: double-click `Start Map Editor.bat`

Works in any browser (Firefox, Brave, Chrome, Edge). It starts a tiny editor server
(`tools/editor-server.mjs`, plain Node.js, nothing to install) in a minimized window and opens the editor in your
default browser. **Save** writes straight into `public/data/`, and **▶ Playtest** opens the game in a new tab.
Close the minimized “Map Editor” window to stop it; it also stops on its own a few minutes after you close the editor tab.

### Chrome or Edge only: open `Map Editor.html` directly

1. Open `Map Editor.html` (in this folder) with **Google Chrome** or **Microsoft Edge**.
   Tip: right-click it → *Open with* → Chrome/Edge, or drag it onto a browser window.
2. Click **Choose project folder…** and pick this project folder. Allow the browser to view and edit files.
3. Edit away. **Save** (Ctrl+S) writes straight into `public/data/`. **▶ Playtest** opens `Playtest.html` with your map.

The editor remembers the folder, so next time it's one click (“Open … again”).
`Playtest.html` is meant to be opened by the Playtest button; it needs an internet connection the first time for its
fonts, and for three.js unless you've run `npm install` and rebuilt (below).

If you change the engine's code, rebuild these two files with `npm run build:standalone`.

### With the dev server

With `npm run dev` running, open <http://localhost:5173/editor.html>. Same editor; saving goes through the dev server.

### Using the editor

- **Save** (Ctrl+S) writes `public/data/maps/<map>.json` (and `database.json` when the player start or
  starting hour or abilities changed). A hosted or preview copy that can't reach your project offers an export instead.
- **Map Properties** (button above the layer tabs, or in the Inspector when nothing is selected): the map's settings
  in a window with tabs, like the Database: **General** (name, size, cliff walls, lighting, season, game start),
  **Beyond the edges**, **Wind, weather & air**, **Sound**, **Battles** and **Random encounters**. The Inspector now only
  shows what's selected. The **layer tabs** are icons (hover for the name; the open layer's name shows under them).
- **Map themes** (**Database → Map themes**): the defaults a kind of map has: what lies beyond its edges, cliff walls,
  lighting, season, music and background sounds, wind, climate, weather and air. Starter themes: Forest, Plains,
  Desert, Snowfield, Mountains, Cave and Indoors (change them, duplicate them, add your own). A map picks one in **Map
  Properties → General → Theme**; every setting there then shows **Theme default (…)** until changed, and changing a
  theme changes every map using it. A theme with its own weather makes its maps share it (a desert's sandstorm blows on
  all of them).
- **More edges** (Beyond the edges): Plains, Rocky ground (boulders), Desert (sand, cacti, sandstone, dry bushes),
  Snowfield and Snowy forest, alongside grass, forest, meadow, rocky cliffs and water.
- **Built-in terrain**: Dirt, Stone paving, Rock (also as cliff walls) and Snow, beside grass, path, sand and the lake
  bed. New built-in props: cactus, dry bush, sandstone rock, snowy pine (snow all year) and snowy rock.
- Saving a map now keeps every setting it has (before, a few — the season, climate, autumn sound, water kinds and
  fishing spots — could be left out of the saved file).
- **Height styles** (Heights → **Style**, key Y): paint how raised and lowered ground is shaped, without changing
  the heights: **Blocky** (square blocks, as before), **Soft blocky** (bevelled edges), **Smooth hills** (heights blend
  into rolling slopes the hero walks up and down; next to lower ground a hill comes down to meet it, next to higher
  ground that keeps its wall) and **Cliffs** (jagged rock faces, bare rock unless the map or tile chose a wall look).
  Each cell shows its style's symbol (◫ ∿ ▲) in the Heights layer. Soft blocky looks like the handheld games' cliffs
  and ledges: outer corners rounded, inner corners curving round too, the bevel lit like the flat top. On every
  style, the top's ground folds a little way over the cliff below and breaks up in chunky pixels (the **grass lip**),
  so grass and rock blend like grass and road do.
- **Waterfalls**: wherever water drops more than two steps to water below, a sheet of falling water runs down between
  them, with spray where it lands and its own sound (louder for taller falls).
- **Bridges and platforms** (Props → built-in): wooden bridges (with rails and posts), rope bridges, stone bridges (low
  parapets and piers), docks and stone platforms, each one tile, east–west or north–south. Paint a row across a river,
  a chasm or lower ground: they're built in 3D, joined pieces share one height (the highest bank they touch, so they
  run level from side to side), and the hero, the party and enemies walk across them; water flows and chasms drop
  away underneath. Fishing from a dock works.
  Bridges have two levels: walked on from the bank, or swum and walked under from below (a gorge, a high bridge) when
  there's headroom; a low bridge stops a swimmer like a wall instead of letting them climb onto it. The party and
  enemies follow the same rules.
  On a bridge, walkers move only along it: east–west pieces east or west, north–south pieces north or south (a piece
  laid beside it, for a wider bridge, can be stepped onto). Nobody falls or jumps off the sides; they leave at the ends
  (onto the bank, or off an open end like any ledge), and get on only from the ends too. Docks and platforms can be
  walked in any direction.
- **Beyond the edges follows the ground**: the scenery outside the map carries on at the height of the map's edge tiles
  (a −4 edge continues at −4), with rock faces where it steps up or down, and its trees, rocks and cliffs stand on it.
- **Props in water** stand half under the surface instead of on the bed (a rock in a stream, a post in a pond).
- **Props → Erase**: tick **Only erase …** to remove just the kind picked in the list (everything else is left alone),
  or **Erase all …** to clear that kind from the whole map at once (it asks first; Ctrl+Z undoes it). New built-in
  props for camps and woods: wooden fence, fence post and gate, one-person tents (red, blue, green, tan, purple), a
  bedroll, a log seat, a firewood stack, a lantern post (lit at night) and a cooking pot.
- **Audio folders**: sounds are used straight from the project's `audio/` folder (`audio/music`, `audio/ambience`,
  `audio/footsteps`, `audio/sound_effects/…`, `audio/voices`, `audio/spells`, any subfolders): every picker lists them,
  no importing. Database → Audio shows what was found (*Look again* after adding files). The built site carries the
  folders and a list of them, so the online editor sees them too. Importing single files still works.
- **Database** (toolbar): fills the screen and stays the same size on every tab. The tabs are icons in groups
  (Party, Battle, Abilities, Items, Story, World, Game): hover one for its name; the open tab's name shows at the right.
  Every form is laid out the same way: all its on / off **Switches** together at the top (under the name of the
  section each belongs to), then its named sections, with a **jump bar** above that goes straight to a section.
  Player, Heroes, Combat, Enemies, Spells, Weather & temperature and Camera use a compact layout: the edit panel is at
  most 800px wide, short boxes sit side by side, and each setting's explanation hides behind a small **i** next to
  its name (click it to show or hide). An enemy's Immune / Absorbs elements are a checkbox table, one element a row.
  **Apply** puts the changes into the project **and saves `database.json`** straight away: "Changes saved. It's
  safe to close the Database." shows at the bottom left for a few seconds (or "No changes to save"). The window
  stays open; **Close** with changes not applied asks whether to apply and save them or let them go. Every list
  (items, heroes, enemies, troops, quests, spells, Additions, classes, skills, achievements) has a red **Delete**
  under **+ New**, which asks "Are you sure you wish to delete …?" first (and warns again if it's used elsewhere).
- **▶ Playtest** opens the game in a new tab with the map exactly as it is in the editor, unsaved changes included.
  Under the dev server you can also open a saved map directly with `index.html?map=map002`.
- **Layers** (1–7): Terrain, Height, Passage, Props, Lights, Events, Buildings. Objects from other layers are dimmed.
- **Terrain tools:** Pencil (B) with brush sizes, Rectangle (R), Fill (G).
- **Prop tools:** Place (P), Scatter (S) for natural-looking forests, Select (V) to drag, Erase (E).
  Turn off *Snap to tiles* for free placement. While placing, the tiles the prop will block show in red.
- **Lights:** Point, Spotlight or Area, each with presets. Area lights are drawn by dragging; select one and drag its
  corner handle to resize. The **Lights %** bar in the status bar shows the light budget (hover it for details).
- **Undo / redo** covers map edits. Importing, editing or deleting a prop saves the asset list right away.
- **Events:** click an empty tile to create an event or move the player start. Click an event to edit its pages,
  conditions, appearance, trigger and commands. Drag events to move them.
- **View:** wheel or pinch to zoom; middle/right-drag, Space+drag or two fingers to pan; F fits the map.
- **Undo / redo:** Ctrl+Z, Ctrl+Y (or Ctrl+Shift+Z). Delete removes the selected prop, light or event.

On a tablet or phone the side panels slide in from the **Tools** and **Details** buttons.

### Buildings (Buildings layer, key 7)

Houses, shops, towers and barns drawn as 3D models from a footprint of tiles, so they light, cast shadows and line up
with the ground like everything else.

- **Draw** (D): pick a preset (Cottage, Townhouse, Stone house, Shop, Barn, Tower), then drag out a footprint, or
  click to place the preset at its own size. **Select** (V): click a building to select it, drag to move it, drag
  the corner handle to resize. Delete removes it. Buildings can't overlap each other.
- **Inspector**: walls (plaster, stone, brick, timber, or any imported tile), roof (shingle, thatch, slate, wood, or
  an imported tile), wall height, windows (none / a few / many), roof shape (gable, hip or flat), which way the ridge
  runs, how high it rises and how far it overhangs.
- **Doors**: any number, on any wall. The front wall faces the camera. Windows keep clear of doors and light up at night,
  like the windows of imported props.
- **Interiors** are separate maps. *Add entrance* on a door puts a Transfer event on the tile in front of it (shown
  dashed orange on the map) and opens it so you can pick the interior map and where to arrive. Do the same inside,
  by the interior's door, to come back out.
- A building fades to see-through while the hero is behind it, and comes back when they step out.
- A building blocks every tile it stands on. Props standing inside one aren't drawn in the game (you'll still see
  them on the Props layer, so they come back if you move the building).
- Tiles you draw for walls and roofs: 32 × 32, seamless. A roof tile's top edge is towards the ridge.

### Importing props from images

In the Props layer, click **+ Image…** (or drop an image on the preview).

1. **Image**: the sprite. A transparent PNG works best; the editor warns if the image has no transparency.
2. **Size on the map**: width × height in tiles. The preview shows the image cut into that grid.
   Drag to move the image, scroll or use the slider to zoom. **Fit** frames the visible part of the image
   (transparent margins are ignored), standing on the bottom edge. The blue marker is where the prop touches the ground.
3. **Collision** (seen from above, like RPG Maker's passability): **Width × Height** squares (Update 135: a 2 × 3
   pine gets 2 × 3; 3D models use their Width × Depth instead), the front row at the bottom, where the picture stands
   (the blue line), the top row the back. Rows added to an older prop start as ★, so it works as before until marked. Click a tile to cycle **X** (blocks), **O** (walkable) and **★**
   (walkable, behind the prop); drag to paint the same mark over more tiles, or use *All X / All O / All ★*. The picture
   is always at the front of what it blocks, so the player stops in front of it. Wall props (vines, doors, cave
   mouths) count their front edge from the foot of the wall they hang on, so their tiles reach back into the wall and
   the player walks right up to them. ★ walks the same as O for flat pictures (a hero on a tile behind the picture
   is already drawn behind it); it's there for 3D props (Update 101). Older props keep working as they were saved.
4. **Resolution**: keep the image's detail, or resample to 16–64 px per tile. **Filtering**: *Point* for crisp
   pixels (like Unity's "Point (no filter)"), or *Smooth*. LPC characters and new art: 32 px per tile + Point
   (props up to 192 px are guessed at 32 px per tile when imported).
5. **Normal map** (optional): framed exactly like the image. Tick *Flip green channel* for DirectX-style maps.
   Without one, a normal map is generated from the image.
6. **Night glow mask** (optional): white where it glows at night (lit windows), black or transparent elsewhere.
   It fades in at dusk and out at dawn, in the colour you choose.
7. **Emits light** (optional): choose *Place light* under the preview and click where the light comes from.
   Set its colour, brightness, reach, flicker, when it's on, and shadows.
8. **Flat mode** (Update 139): the picture is painted flat on the ground like a 2D game draws it (bedrolls, rugs,
   puddles), its top edge the far end, instead of standing up. Characters walk and stand over it.
   **Wall props** (*Sits flat against the wall*) stand upright against it, and *Stretches to the height of the wall*
   makes one (a ladder, hanging vines) fill whatever wall it's placed on. **Rustles when walked through**: tall
   grass shakes and swishes as the hero or the party step in (on by default for the tall-grass shapes that don't
   block). Built-in **Tall grass**, **Really tall grass** (taller than the hero) and **Wheat** are in the Props layer.
   **Always drawn in front of tiles** (on by default): a ledge or cliff in front of the prop never hides it, like the
   characters. Turn it off for tall platforms and bridges whose legs would show through the ground in front of them.
   **Walk on top (bridge or platform)**: makes the prop a bridge running east–west or north–south, or a platform /
   dock walked any way. It never blocks; every tile of its footprint is walked on at one deck height (a row of pieces
   shares the highest bank they touch), and bridges keep walkers on them like the built-in ones (along the bridge,
   on and off at the ends). **Drawn as**: its own picture **lying flat** on the deck (like a floor seen from above,
   covering its footprint, the top of the picture to the north), its picture **standing up**, or built in 3D like the
   built-in bridges (wooden planks, rope or stone). Pictures sit at the deck's height (the banks it joins), not down
   on the ground or water under it, and no ripples ring them.
   **Walk sound**: the hero's footsteps on the prop: one of the ground sounds (*Footsteps: Wood*, Stone, Metal,
   Carpet…, which Database → Audio can swap for your own, like `foot_step_wood`) or any sound file or effect. Bridges and
   platforms without one sound like their wood or stone (only while walking on top, not swimming under them); any
   other prop with one (a rug, a wooden floor) changes the footsteps on its tiles.
   **Camera tilt** (on by default): the prop leans back toward the map camera like the characters. Turn it off to keep
   it upright (flat pieces and pictures that look wrong tilted).
9. **Shape**: *Flat* (one picture), *Solid block* (pushed back so it looks like a block), *Cross ×* (two copies at
   45°), *Cross +* (one side-on), and for tall grass and thick plants: *Star ✳* (Cross × plus one facing the
   camera), *Rows ≡* (three staggered rows across the footprint, each offset, sized and mirrored) and *Thicket*
   (three rows of copies crossing in a shallow V). Props lean back toward the map camera like characters; their
   flames, lights and embers lean with them. Characters and props are never hidden by the ground (a ledge in front, a tall cliff behind),
   like the handheld games; buildings and other props still hide them.

Imported **tiles** have *Make a normal map from the texture*: off, the tile lies flat under the lights (cleaner
for pixel art); a normal map image of your own is always used.

Saved files: `public/assets/props/<id>.png` (plus `<id>_normal.png`, `<id>_glow.png`) and the list in
`public/data/assets.json`.


### 3D props (GLB / FBX models)

In the Props layer, click **+ 3D model…** and pick a **.glb** model (an **.fbx** works too, best with its textures
embedded; a .gltf with separate files: export it as .glb). It opens in the prop importer like a picture does, and
everything else (name, footprint, behaviour, light, drops) is set the same way:
- **Footprint**: guessed from the model's size (a tile per metre, the glTF scale; very large or tiny models about two
  tiles). Change *Width* and *Depth* and the model is refitted: scaled evenly to fit inside the footprint, standing on
  its front edge like a picture, centred left to right. Its *Height* follows from its shape.
- **Faces**: as modelled (its front toward the camera), turned right or left 90°, or turned round.
- **Filtering**: *Smooth* (default for models) or *Point* for crisp low-res textures (PS1 style).
- The picture in the frame is the model **rendered from the map camera's angle**: it's the palette icon and how the
  2D map shows it. *Use a picture instead* turns it back into a flat prop (that icon as its picture).
- The X / O / ★ grid works as for pictures. With a model, the ground behind it really is behind it: anyone on a tile
  behind the model (★, or a path round its back) is hidden by it like by a building.

In the game a model is lit, casts and catches shadows, takes the map's area tints and cloud shadows, and is cut,
mined, burnt out or hidden like any prop; every copy of one model is drawn in one go. Models don't lean toward the
camera, sway or change with the seasons. Animated models stand still in their rest pose (characters with animations
come in Update 102). The model file is saved as `assets/props/<id>.glb` (or `.fbx`) beside its icon.

### Heights, cliffs, ramps and stairs (Height layer)

- Heights go from −10 to 10. One step is half a tile. Below 0 makes pits and riverbeds.
- **Raise (R)** / **Lower (L)** change the ground one step under the brush; each cell changes once per stroke.
  **Set (S)** paints a chosen height.
- Cliff walls appear automatically wherever neighbouring cells differ, including around pits.
- **Ramp (A)**: click a cell to put stairs or a ramp there. It rises one step toward the neighbour that is exactly
  one step higher (shown with an arrow). For taller climbs, chain several, each one step higher than the last.
  A red cross means there is no such neighbour. Click an existing one to select it: change its style, set its
  direction by hand, or delete it.
- **Corner slopes** (Ramp → Style: **Corner**): a walkable slope for a hill's corners, so raised ground can be a
  rounded hill instead of cliff steps. Put ramps along a hill's sides and a corner slope on the low cell at each turn:
  at an outside corner it rises toward the higher ground diagonally beside it (one raised corner); tucked into an
  inside corner it rises on two sides (three raised corners). The corners are found from the neighbours one step
  higher (dots on the map mark them); select one to set them by hand.
- **Cliff wall look:** the Map settings' **Cliff walls** sets the default for the whole map (built-in stone bricks
  or any imported tile). A tile can choose its own: select it in the Terrain palette (or in the tile importer) and
  set **Cliff walls under it**. A wall takes its look from the tile on top of the cliff.
- **Water (its own tab, key 8)**: water has a level (−10 to 10), a type and a style. **Fill basin**: dig a hollow with Lower, click inside it,
  and water fills every connected cell whose ground is below the level. **Paint** / **Remove** use the brush.
  **Fill basin** works like a paint bucket: it fills the connected area that matches the cell you click (dry ground,
  or water of the same level, type and style), so filling inside a painted ring fills only the ring. **Restyle
  pool** gives a whole pool (connected water of the style you click) the chosen style. See *Water styles*.
  Water that reaches the map edge carries on past it in the game, like roads (a stream running off into the woods).
  Types: **Auto** (shallow if one step deep or less, otherwise swimmable), **Shallow** (wade, a bit slower),
  **Swimmable** (the player swims, if the party carries a key item marked **Lets the party swim**, Database →
  Items: without one, swimmable water stops them like deep water; swimming costs no stamina; Update 109),
  **Deep** (can't be entered: oceans and map borders). Water only appears where
  it's above the ground. In the game the shoreline is softened: bank corners that jut into water are cut round
  and the water's inner corners are filled round, with a natural wobble (the cliff wall curves with them), and water at a bank's level
  laps a little over it. This only applies where flat ground meets water; other cliffs keep square corners.
- In the game the player walks up ramps, stairs and corner slopes, can jump up one step, and climbs only walls marked Climbable
  (Passage layer): walking into one starts the climb at once, even with the stick held a little off straight.
  **Database → Player → Ledges** decides what happens at a drop: **Walk off, except into pits** (the default: the
  hero walks straight off any edge and drops to the ground below, except into cells whose height is between the two
  numbers, -10 to -5 steps by default, whose edges stay walls), **Walk off any ledge**, or **Collision** (drops are
  walls; a jump still comes down up to two steps). Never off climbable walls (they're climbed down) or into deep water. From a bank they can walk straight into water at the bank's level, wade, or swim. Props, events
  and lights stand on the ground at whatever height it is.

### The sky, the moon and sleeping

- **The sky over Titan** is drawn behind every outdoor map and battle map, in three layers: far away the stars (fading
  in at dusk, each twinkling on its own), **Saturn** with its rings (pale behind the daylight, vivid at night), the sun
  and the moon; then the sky's colour (horizon to zenith, following the hour and the weather, meeting the fog at the
  horizon); then clouds drifting with the wind: a few puffy ones on clear days (more on some days, thin and wispy on
  others), thick grey-purple in rain, pale grey in snow (hiding the sun and Saturn), sand-coloured in a sandstorm.
  Indoors and underground there's no sky. The field camera looks down at the ground, so the sky shows most in
  battles and while sleeping.
- **The moon** is artificial (barren, with teal circuit lines that glow on its dark side) and follows the **real
  moon**: its phase comes from the player's date, so a full moon in the game is a full moon outside. A full moon rises
  as the sun sets; a new moon travels with the sun.
- **Clock card**: the moon's phase (a little picture and its name) under the date.
- **Date condition** (event pages and Conditional branch, Update 108): *Date (real world)*: a day of the year (Oct 31)
  or a range (Oct 24 – Oct 31; it can wrap past New Year), from the player's own date, any year.
- **Props for some days** (Update 108): a prop's *Only on some days of the year* (Edit… in the prop list) shows the
  placed ones only on those days. **Duplicate** (beside Edit…) makes a copy with the same picture and its own
  settings: keep the original for all year and give the copy Halloween dates for the town square.
- **Moon phase condition** (event pages and Conditional branch): *Moon phase (real world)*: new, waxing crescent,
  first quarter, waxing gibbous, full, waning gibbous, last quarter, waning crescent (any you tick). Full and new moons
  count for about two days. For werewolves, night markets…
- **Sleep** (event command): the camera lifts and tilts up from the hero to the sky, the HUD steps aside, the hours
  rush by overhead (the sky turning from day to night to dawn, the stars and the moon going round), then it comes back
  down. *Until morning* (7:00), *until night* (21:00) or *for a number of hours*; *Rest too* refills health, magic and
  stamina. Time slept counts for fires and the calendar. Console: `sleep`, `sleep night`, `sleep 4`. *An inn*: the
  party wakes Well Rested.

### Resting and camping (Update 106)

- **Rest points**: in the Events layer, click an empty tile and choose **Create rest point here**: a campfire (unless a prop is
  already there) and an event that asks "Make camp here?". Its **Rest point** command (event command, under State)
  also sets the respawn point.
- **Rest how many hours?** (1–12, ← →): health and magic come back **20% an hour** (each hero's bars show it as you
  pick); even **1 hour** warms and dries the party; **5+ hours** is a full restore that revives the knocked out and
  cures every ailment, Zombie included.
- **Camping supplies**: food, potions and drinks with a **Camp value** (Database → Items) from the bag. **25 points**
  make the party **Rested** (+1 to every stat, +10% EXP from battles); **50 Well Rested** (+3, +25%, but shorter).
  ↑ ↓ choose, ← → fewer / more, *Fill to Rested* / *Fill to Well Rested* pick the cheapest mix, *Clear*. Under 25
  nothing is used ("Add X more to gain additional benefits"); past 50 it warns once before wasting points. Camping
  with no supplies still rests the party.
- **Good states**: a new one replaces the old one, but Rested never replaces Well Rested while it lasts; resting
  again restarts the timer. How long each lasts (game hours): **Database → Weather & temperature → Resting and
  camping** (2 and 1.5 by default). They show as a gold ★ pill on the HUD and pause menu, on the Equipment page's
  statuses, and on the Status → Stats page as a gold **+3** beside every stat with the time left and an *EXP +25%
  (Well Rested)* line.
- **Event commands**: *Give buff (Rested / Well Rested)* for hours and minutes (or the Database's length; also for
  blessings at a shrine), or take it away; *Set weather state* (Normal, Wet, Cold, Freezing, Hot, Overheating) for
  the hero, everyone or one hero; *Give / cure an ailment* now picks who too. **Condition** *A hero is…*: the hero you
  play, anyone in the party or one hero is (or isn't) Freezing, Wet, Poisoned, any ailment, Rested, Well Rested…

### The party on the map (turn-based)

- Party members never fight on the map: foes only go for the hero, and touching the hero starts the
  battle (so a party member can't start one by wandering into a foe). They walk behind the hero and **hop where the
  hero jumped**, over gaps and fences. **Database → Combat → The party follows the hero on the map** (on by default);
  off, only the hero walks the map and the party appears in battles.
- **The hero you play always walks in front** (Jordan, the first hero), wherever he is in the lineup; the party
  members fighting with him walk behind in the list's order, the same order as the HUD panels and the pause menu.
- **Four in the party**: in Single battle mode the lineup that's out (and walks behind the hero, and gets HUD cards)
  is Database → Combat → Heroes who fight (Single), up to 4; otherwise Database → Player → Party size (3 or 4). The
  HUD has a fourth party card (Settings → HUD → arrange).
- **Party chatter**: now and then a hero says a line in a speech bubble over their head that follows them (one at a
  time, and rarely). Write it in **Database → Characters → Chatter**, per hero: a *Chatter amount* (0 never … 10 all
  the time; the hero you play talks a third as often), *General* lines per trigger (getting Cold / Freezing / Hot /
  Overheating / Wet, warm and comfortable again, rain / snow / a storm starting, the weather clearing, the wind
  picking up or dying down, entering a rest area, making camp or sleeping, a map for the first time; one line per row,
  one picked at random) and *Map chatter* (a map and a line: "This is Reach City. I grew up here!", likeliest the
  first time there). Every line said goes in the adventure log.
- **Talking at camp** (Update 122): in a rest area, walk up to a resting party member and press Talk: they say their
  **At camp** line (Chatter tab, per hero): a *Default* line plus lines with **Only when…** (a switch on, a quest
  active, any condition) so they talk about what's going on; a line whose condition holds wins over the default.
- **Group chatter** (Chatter tab, bottom): a whole conversation, one row per line (speaker dropdown + what they say,
  up to 20 rows). It plays at the **next camp**, top to bottom, each line over its speaker's head like a live talk.
  Start it with the event command **Group chatter at next camp**, or give it a switch and it plays at a camp once the
  switch is on. Each plays once; speakers not in the party are skipped.
- On the way to their camp spots, party members walk through props and each other (no getting stuck walking on the
  spot); once seated they're solid again.

### Gender and roleplay (Update 127)

- **Database → Heroes**: **Gender** (Male (Cis) ♂ blue, Female (Cis) ♀ pink, Male (Trans) ⚧ dark blue, Female (Trans) ⚧ dark pink,
  Transgender ⚧ in the trans flag's blue, white and pink, Nonbinary ⚲ purple, Other ✱ white) shows as a symbol beside
  their name on the HUD cards, the pause menu's party panels and their Status page. **Outfit gender** (masc / femme)
  picks which version of worn armor and clothes they wear (unset: their look's Body from Characters).
- **Database → Party → Genders** (Update 137): rename each gender, pick another symbol (or type your own), use a
  small picture instead of a symbol, and give it a colour of your own. Empty boxes keep the built-in ones.
- **Database → Party → Roleplay**: titles every hero shares (Eye colour, Favourite food, Favourite gift…); each hero
  writes their own answers on the Heroes tab (**Roleplay**). They show on the Status page under About.
- **Using them**: the **Roleplay** condition ("Eleanor's Favourite food is Ramen", upper and lower case aside), the
  text code `\rp[Eleanor, Favourite food]`, and items: Database → Items (consumables) → **Favourite of / disliked by**
  (heroes whose title is an answer love it (+) or dislike it (−) by some points). Used on them, their view of whoever
  used it changes: in battle the hero who used it (Katrina uses Ramen on Eleanor on the bench: Eleanor warms to
  Katrina), out of battle the hero you play.
- **Status page**: the hero's relationships (how they see each party member) under their picture, and gender and
  roleplay answers in the Profile page under About.
- **Date answers** (Update 130): a title's **Answer** can be *A date (birthday…)*; heroes then pick a month and day
  (Birthday: Oct 31). The **Roleplay date** condition is true on that day, or within N days of it ("within 3 days of
  Eleanor's Birthday"), on the REAL date (the device's calendar; the game's day / night doesn't change it).

### Relationships (Update 124)

- Each party member rates each other one from **0 (Hate) to 100 (Best friends / Love)**, one way: Katrina's view of
  Eleanor is her own, separate from Eleanor's view of Katrina. The hero you play is rated by everyone but has no
  ratings of their own (the player decides how they feel). Labels: Hate 0+, Dislike 15+, Distrust 30+, Neutral 45+,
  Like 60+, Close 75+, Best friends 90+ (Love for pairs marked ♥).
- **Database → Party → Relationships**: where each rating starts (a grid: each row is how that hero sees the others;
  unset 50), ♥ pairs, the points each thing is worth, and an on / off switch.
- **What changes them** (battle points capped at 8 per pair per battle):
  - **Stepping in**: you switch someone in while the hero they replace is below half health, and the newcomer takes
    the foe's next blow. The one saved warms to them, more if that blow would have knocked them out.
  - **Healing someone on the bench** while they're hurt, and **reviving** someone. The one helped warms to the one
    who used the item.
  - **Avenging**: whoever a foe knocked out warms to the hero who beats that foe.
  - **Camping together**: each rest at a rest point, everyone travelling warms a little to everyone else.
  - **Events**: the **Change relationship** command (one person's rating of another, + / − or set, optionally both
    ways), **quest rewards** (Rewards → Relationships), and the **Relationship** condition ("Eleanor rates the hero at
    most 14") for dialogue, event pages and quests that only open at a certain rating.
- Crossing into a new label shows a notice and goes in the adventure log ("Eleanor's view of Crowley: Like").
- **Each hero's Status page** shows how they see the current party (Update 129: there's no Journal tab for it any
  more): a bar from red (Hate) through yellow (Neutral) to green (Best friends / Love). Members who leave keep their
  numbers for when they come back.

### Stats and growth ranks

- **Seven stats**: **STR** Strength (melee damage), **DEX** Dexterity (bow damage, aim, critical hits, swing and draw
  speed), **AGI** Agility (how often turns come round in battle, and dodging), **END** Endurance (shrugging off
  ailments and Slow, and a little more health: +2 HP a point over 10), **DEF** Defence, **MAG** Magic and **MDF**
  Magic Defence. 10 is normal. The Status page shows what each one does at its value ("+20% bow, 100% aim") and,
  under the stats, critical hits, Defence, Magic Defence, **Accuracy**, **Dodge** and **Resist ailments**. In
  battle a weapon hit lands on its accuracy (95% at DEX 10, half a % more a point) minus the target's dodge (half a
  % a point of AGI over 10, up to 40%), never below 20%; spells always land. Each point of DEX over 10 adds a
  quarter of a % to critical hits; each point of END over 10 adds 1.5% to the chance of shrugging off an ailment
  (up to 60%). Saves from before seven stats give Agility and Endurance 10.
- **Stat order** (Database → Game → Stat order): move the stats up and down with ▲ ▼ to set the order every list
  shows them in, in the game (Status, Equipment, level ups, the dice table) and in the Database (heroes, classes,
  gear bonuses, buffs). *Back to the usual order* resets it.
- **Growth ranks**: each hero's seven stats have a level 1 value
  and a **rank** set in **Database → Heroes → Progression curve**: each level adds **A +4, B +3, C +2, D +1, F +0**.
  There are no stat points to spend any more; skill points stay. HP, MP and stamina aren't ranked (the skill tree
  raises them). The Status page shows each stat's rank as a coloured pill (A green, B yellow, C orange, D pink,
  F red). The victory screen lists what each level-up added ("STR +4 · DEF +2").
- **Changing a rank**: a consumable with **Stat growth** (Database → Items: a Potion of Defense taking Defence from C
  to A) changes it for good; gear with Stat growth lifts it while worn (the better rank counts); the event command
  **Change stat growth rank** sets it for the hero you play, one hero or everyone.
- **Setting up stats**: after New Game the player picks **Default stats** (the level 1 values) or **Custom stats**:
  **Roll Dice**, **Point Buy** or **Standard Array** (and *Hard: 3d6 in order* if ticked), one page at a time; Back
  returns a page and every page keeps what was set up on it. **Roll Dice**: the stats with empty boxes on the left,
  a felt dice table in the middle, Roll / Re-Roll / Continue / Back on the right. Four 3D dice drop and tumble onto
  the table, the lowest is dropped and the total appears in the first empty box: ↑ ↓ move it to another stat, OK
  places it; ← → go between the boxes and the buttons; OK on a filled box picks its number up again. Re-rolls are
  unlimited unless **Re-rolls allowed** is set; Continue is greyed until every stat has a number. Works with the
  keyboard, a controller or the mouse. **Point Buy**: every stat starts at 8, with 30 points to raise them up to 15.
  **Standard Array**: 16, 14, 13, 12, 10, 10 and 8 to place.
- Other heroes use their default stats, or set **Stats when they join → Set up stats on joining** to have the
  player set theirs up the moment they join (then grown by their ranks to the level they join at).

### Weather and temperature

- **Dynamic weather** (**Database → Weather & temperature**): the shared outdoor weather changes by itself every few
  game hours (*Each spell lasts*), picked from each season's chances: clear, rain, **thunderstorms** (heavy rain,
  lightning flashes, thunder), snow, **blizzards** (whiteout and wind), **haze**, pollen, dust, falling leaves,
  sandstorms. Rain falls as snow below freezing and snow as rain above it. Maps with *Unique weather* keep their own.
  A Change weather command (from an event, a spell or an item's event) changes it until the next change. The
  adventure log says when the weather turns; the clock card names it. Off: the weather stays as set, as before.
- **Temperature**: each season has a range for the morning low and the afternoon high (°F). Every day rolls its own
  (one summer day 67°, the next 102°), coolest around dawn and warmest mid-afternoon. Rain and storms cool it, haze
  warms it, **Map Properties → Weather → Climate** makes a map warmer or colder (a desert +15, a peak −20), and the
  **Change temperature** command sets it (or warms / cools it) until the player leaves the map. Indoors it's 68°.
  The clock card shows it with a thermometer, beside the moon; **Settings → Gameplay → Temperature**: °F or °C.
- **Puddles** (Update 123): rain leaves glossy puddles on flat outdoor ground (grass, dirt, stone paths; not sand),
  growing while it rains and shrinking away as the ground dries over the next couple of game hours. The same spots
  come back after each shower.
- **Footprints** (Update 123): the hero, the party and the horse (hoof prints) leave prints in snow and sand that fade
  over about half a minute (sooner while snow is falling). In the map editor's terrain panel each tile has **Leaves
  footprints** (on by default for snow and sand: tick it for mud, say). In winter, snowed-over grass keeps prints too.
- **The ground follows it**: rain leaves it damp (darker and richer, drying over a couple of game hours), below
  freezing grass and leaves frost over white-blue, and in a heat wave grass turns straw-coloured, coming back as the
  evening cools.
- **Conditions**: *Temperature* (at least / at most °F) and *Weather* (any of the kinds you tick), for events that
  happen in the heat, the cold or the rain.
- **Battles**: heat makes fire attacks stronger and water-type foes softer; cold makes water (the cold element)
  stronger and fire-type foes softer (*Heat and cold in battle*, 25% at most by default).
- Console: `temperature` shows it (and the weather), `temperature add -30`, `temperature set 100`, `temperature reset`.

### The elements on the body (cold, heat and wet)

Out of battle, every hero in the party feels the weather. Battles never change any of this, and it lasts through
them: Freezing before a fight, still Freezing after.
- **The meter**: each hero has a cold / heat meter that follows what they *feel*: the temperature where they stand,
  changed by their gear's **Warmth** (Database → Gear: 0–10 per piece, adding up to 10; in the cold 10 is about 30°F
  warmer, in the heat warm gear makes it worse and Warmth 0 keeps them coolest) and by being wet (wet in the cold is
  colder, and the cold bites twice as fast). It fills over time (*Getting cold or hot takes*, 90 seconds by default)
  and drifts back when it's mild, three times as fast by a fire.
- **States**: *Cold* / *Hot* past half way, *Freezing* / *Overheating* at the end (only when it's colder than the
  Freezing or hotter than the Overheating temperature felt: 40 / 25 / 85 / 100 °F by default), *Wet* (rain where it
  reaches them, a swim, a damp cave), and *Comfortable* when a fire, shelter from harsh weather or warm enough gear is
  keeping it off (or always, with *Always show Comfortable*).
- **What they do**: Wet walks a little slower (10%), Cold / Hot slower (20%), Freezing / Overheating slowest (35%);
  the hero you play sets the walking pace (the worst state counts; riding, the horse is never slowed). Freezing and
  Overheating also lose health as they walk (3% every 12 steps by default), never below 1, and never on someone
  knocked out; the adventure log says so the first time.
- **Cold breath** puffs from each hero's mouth (and followers'), and steam rises off their heads in the heat, placed up
  the sprite as it leans toward a high camera (Update 121).
- **Warming up and drying off**: lit fires (campfires, torches, braziers: anything with a flame) warm and dry everyone
  within about two and a half tiles; indoors keeps the rain off; the sun dries you on a warm, clear day. Items with
  **Warms / cools** (Database → Items: + a Hot Cocoa, − a Chilled Tea; 100 takes them all the way back) work from the
  bag (Update 137: the bag and shops show it as **Warmth**, a number coloured orange for warming, blue for cooling), and items have a **Camp value** for camping (Update 106).
  While a fire dries someone, their panel shows **Drying** with a bar of the water left (HUD cards, the hero's own
  bars and the pause menu's party panels).
- **Maps** (Map Properties → Weather): *Temperature: its own* for caves and houses (a cool cave 50°F, an ice cave 20,
  a lava cave 105): it wanders a few degrees but never into another state's range (a warm cave never turns
  sweltering); *Damp* slowly soaks whoever is in it; *Keep the elements out* for cozy towns. Unset, indoors is 68°F
  and caves 55°F.
- **Griffins**: up in the air the rider is safe; the elements pause until they land. They also pause during events
  and while sleeping.
- **Database → Weather & temperature → On the body**: all of the above (the temperatures, how fast it fills,
  recovers and dries, the health lost and how often, how much slower, how long a hurt hero's panel rumbles), and an
  off switch.
- Console: `body` shows each hero's meter, wetness, state and Warmth (and the temperature); `body -100` makes everyone
  Freezing, `body 0 1` soaked and otherwise normal.
- **Seeing it** (Update 104): each hero's HUD panel and pause-menu card gets a frame and a pill for their state:
  Comfortable gold, Wet with drops running down, Cold with frost in the corners, Freezing frosted all round with
  icicles, Hot shimmering, Overheating with rising embers. A chip of damage shakes the screen with a hurt sound, and
  that hero's panel rumbles. On the map: breath puffs in the cold (below 45°F, thicker the colder), wet heroes drip
  and their footsteps squelch, Hot ones steam. *Tint a hero's health bar the colour of their ailment* (On the body;
  off by default) colours the health bar like the ailment's pill.
- **Equipment page**: the left column shows the hero's statuses (weather state, ailment, good state); move over one
  to read what it does. To change gear, pick a slot, then the piece from the bag (or the bag's Equip…). Gear shows
  its Warmth.
- **Safe zones** (Spawns layer → Safe zones): paint *Safe ground* where the elements can't reach (everyone is
  Comfortable: sheltered and as good as by a fire), monsters never come in and there are no random battles. Paint
  spots inside it: *Seat*, *Lie down*, *Practise magic*, *Training dummy* (put a dummy prop just north of it). While
  the hero you play is in the zone, each party member goes to a spot (the one they like best: **Database → Heroes →
  Rest preferences**, 1–10 per activity, ties to whoever is higher in the party) and sits, lies down, casts now and
  then or swings at the dummy; step out and they fall in behind again.
- Map enemies no longer show health bars or meters on the overworld (only the noticed ? / !).
- **Ailments out of battle** (Update 105): one per hero; someone who has one can't get another (Zombie included, in
  battle too). **Poison** and **Burn** cost health as the party walks (4% every 10 steps by default: *Poisoned /
  Burned: lose … every …* in On the body), down to 1, then wear off. **Paralyze, Sleep, Confusion, Blind, Silence and
  Zombie** only show out of battle and last until cured: an item, an event (*Give / cure an ailment*), or 5+ hours of
  rest. **Chill, Frozen and Stagger** end with the battle (Database → Combat → Ailments: "lasts after battle"). Falling
  to 0 health cures it. Each one shows as an RPG Maker-style **balloon** off the hero's face (bubbles, a flame, a bolt,
  Zz…) on the HUD and the pause menu, with its pill beside the weather's.

### Terrain touches (Update 112)

- **Cliffs one step tall** get a shorter grassy overhang (it used to cover the whole face); taller cliffs keep it.
- **Cliff and side walls** are shaded light at the top and darker at the foot.
- **Water reflects** the hero, party members, the horse and its rider, event characters, map enemies and props
  standing at the edge with water in front of them (not while swimming; off in Potato quality).
- **Moving shadows** (Map Properties → Weather → *Moving shadows* and *Shadows of*): drifting clouds, a tree canopy's
  dappled shade (swaying a little in the wind: forests), or beams of light sliding across the ground.

### Time, night and map lighting

- **Database → Time**: *Clock speed* from stopped to 60× (1× is real time; the default 20× makes a day last 72
  minutes of play) and *Night darkness* (up to pitch black away from lights). The clock pauses in menus.
  *Sky transition speed* (Slow, Normal, Fast, Very fast) sets how quickly the sky turns through the hours when
  sleeping (Normal takes 5 – 12 seconds, longer for a longer sleep).
  The day runs the full 24 hours, midnight and dawn included. "Set time of day" takes 0 – 23.75.
- **Map settings → Lighting**: *Outdoor* (full day and night), *Indoor* (muted light; windows with a glow mask
  show daylight and go dark at night, the opposite of outside; no fireflies), *Dark* (caves and dungeons: dark at
  any hour, so only lights show; lamps on a night schedule stay lit).
- **Map settings → Beyond the map edge**, per side (top, bottom, left, right) or all at once: open grass, forest,
  meadow (bushes and flowers), rocky cliffs, water, or nothing (darkness).
- **Roads past the edge**: tick **Is road** on a tile (Terrain palette; the built-in path is one already). Wherever
  a road tile touches the map edge, the road carries straight on outside, as wide as it was painted: across grass,
  forest and meadow (with grass growing over its sides, and no trees on it), through a gap cut in rocky cliffs, or
  over water on a stone causeway. Only "Nothing (darkness)" stops it.
- The status box shows the time with a sun or moon (a half-sun at dawn and dusk) and the weather. Weather itself
  comes later, so it reads Clear, Indoors or Underground. Settings → Clock switches 24-hour / 12-hour.

### Title screen, pause menu and settings

- The game (and every playtest) opens on the **title screen**. **Database → Title & menus → Title background**: a
  **map** (any map, centred on a spot you choose, the camera drifting round it), a **picture** or a **video** (no map
  behind it at all). Starting or loading a game fades to black, hides the HUD while the map loads, then fades in with
  the HUD coming up with it (Quit to Title fades the same way). Title options:
  **Continue** (the latest save; greyed out without one), **New Game**, **Load Game**, **Options**, **Exit**.
- **Database → Title & menus**: the game title, the title shown on screen and a subtitle; rename or hide each title
  option and each pause menu entry; *Skip the title screen in playtests* for quick testing.
- **Menus on their own buttons** (Update 141): **START** (Esc) opens **Settings**, now with **Save**, **Load** and
  **Quit to Title** at the top and a picture beside every setting. **X** (P) opens the **Party menu**: two tabs,
  **Party** and **Journal**, switched with **LT / RT** (Z / C), the Journal's own tabs with **LB / RB** (Q / E);
  small buttons in its top corner open the Backpack, World Map and Settings (mouse and touch; the touch Menu button
  opens it). **B** (I or B) opens the **Backpack**: the bag as a compact window at the bottom right (the game waits;
  use items and key items, equip gear and shards; Update 144: a little wider, no controls line (more room for the
  details), and Use / Equip pops up as its own menu to the left;  use items and key items, equip gear and shards; Update 142: pocket tabs are pictures, 8 columns on every pocket,
  gear as 4 weapons + 4 armor, and the item's details at the bottom above the controls). **Riding, hold B** (or Esc)
  to get off the horse; a quick press still opens the Backpack (or Settings). **Y** (M) opens the **World Map**. Each button closes what it
  opened; in the Backpack, B first backs out of an item's choices. **Achievements** are a Journal tab now (with the
  Journal's tabs across the top). Touch screens get Party, Bag, Map and ⚙ buttons.
- **A button** (Update 142, Database → Player → *A button (on the map)*): Jump (the default) or any field power:
  Sprint (run while A is held), Cut, Bow (hold to draw), Fire Bow, Smash Stone, the weather / time / season, fishing,
  the horse, Light, Water Walk. Talking to someone in front still comes first.
  *(Before Update 141, below:)*
- **Pause menu** (Esc / Start): one frame from the top of the screen to the bottom (the same size for every tab),
  with its tabs (all the same size) across the top: **Party · Items · Map ·
  Journal · Achievements · Settings · System**. **LB / RB** (Q / E) move between the tabs; tabs inside a tab (the
  bag's pockets, the Journal's pages) move with **LT / RT** (Z / C). The bottom line shows where you are, the time
  played and your gold. The HUD steps aside while it's open. Map shows once there's a World layout, Achievements
  once there are achievements; System holds Save, Load and Quit to Title.
- **Party** (handheld style): each member in a panel with their picture, name, gold level pill, any ailment (PSN…),
  elements, HP, MP and EXP (with the numbers). By default the lead (Player 1, first in the lineup and first out in
  battle) has a big panel on the left and Players 2–4 sit in boxes down the right; the reserve after Player 4 take
  Player 4's panel, one under another. **Database → Title & menus → Party page layout** moves and sizes each panel
  (drag it, or its corner; percentages of the page, so it fits any screen), sets its text size (Big / Medium /
  Small) and what it shows. A message box along the bottom says what to do. ↑ ↓ choose (← to the lead); Space
  opens a menu at the bottom right: **Swap** ("Move Katrina to where?"), **Status**, **Equipment**, **Skill Tree**,
  **Magic**, **Class** (when they have more than one) and Cancel. On the Equipment, Status and Skill Tree pages the
  triggers (LT / RT; Z / C on the keyboard) go to the previous / next party member. Anyone with skill points to spend
  shows a **LEVEL UP** badge.
- **Status** (Party → someone → Status), like the handheld games' summary: the hero on the left (picture, name, level
  pill, ailment, elements) and three pages on the right, ← → between them: **Profile** (About and ailments),
  **Stats** (HP, MP and the EXP bar under them; Update 140: stamina isn't shown, the HUD ring covers it; the seven
  stats with their growth ranks on the left, damage and defence on the right; EXP and how much to the next level)
  and **Gear** (what they're wearing; Update 140: ↑ ↓ pick a slot, A shows what fits from the bag, pick one or *Take
  it off*). The Party menu marks the selected hero with arrows either side.
- **Map**: the world map (Pokémon Gold / Silver style), drawn from your maps themselves and laid out as in the
  **World layout** (Map editor toolbar → **World**). The **stick glides** across it (faster the further it's pushed);
  the **D-pad** (arrow keys) moves the crosshair **one tile** a press, repeating while held, to fine-tune; or drag it.
  Zoom with LT / RT (Z / C, or the mouse wheel), nine steps, up close to whole regions. **A** (Enter / Space) jumps
  to the next marker and **Y** (R) to the previous one, starting at you (the red pin), nearest first. Place names show over towns and landmarks.
  A **crosshair** sits in the middle: move it over the hero, a marker or a place name for its **tooltip** (with a
  mouse, the tooltip follows the pointer). **Event markers** (below) show as stars, circles, skulls…; an area event's
  whole area is outlined in its marker's colour, with the symbol in the middle.
  The World layout's **Places not visited yet** setting: *hidden*, *greyed out* or *fully visible*; and **Explore**:
  in maps visited, only the ground walked near shows (the rest stays under a dark fog) — mix them as you like.
- **Journal tabs** (Update 130): each tab has an icon. **Database → Title & menus → Journal** sets their order (↑ ↓)
  and which are shown at the start; the **Show / hide a Journal tab** event command changes that during play (saved),
  e.g. unlock the Bestiary later.
- **Journal**: Quests, Adventure Log, **Bestiary** and Records (LT / RT). The **Bestiary** lists every enemy (the
  Database's order, numbered), the ones not met yet as "???". Each shows its picture, its description (Database →
  Enemies → Bestiary), the maps it was met on and how many were defeated; its numbers (HP, attack, defences, EXP,
  gold), its elements (weak to, resists, immune to, absorbs, and what it attacks with) and its drops show once enough
  of its kind have been defeated (Database → Combat → Bestiary: 1, 3 and 5 by default). *Leave it out of the
  Bestiary* hides an enemy (a training dummy, a story-only foe).
- **Save / Load**: each save card shows the party standing (Legend of Dragoon style), the three fighting in front and
  the reserve smaller behind them. The save screen opens on the save you're playing from. Load and Quit to Title from
  the System tab close the pause menu first. Healing from the menu (Mend…) stays on the hero just healed.
- **Achievements**: each with its icon, name, description and points (Xbox-style G), the newest unlocks at the top,
  then the rest unlocked, then locked ones (greyed, with how far along they are) closest first; hidden ones as "???"
  until unlocked; your total at the top.
- **Playtest panel**: drag the *Saturn Game Engine* panel by its title bar to move it anywhere (remembered in this browser).
- **HUD**: level, magic, health and EXP (all the same size) across the top; the clock and readied shard top right,
  with a little picture of the season behind it (blossom, sun, falling leaves, snow; Settings → HUD → Season
  picture) and a round **mini-map** under it (north up, you in the middle, drawn like the world map with the same fog,
  the map's markers, party members as dots); the selected weapon top left; your **gold** (a coin, the amount and "Gold") at the bottom left; a card per party member under the weapon (face,
  name, HP, MP and EXP); EXP along the bottom; and **stamina** as a green ring with a dash icon (Halo Reach style),
  shown while stamina is used and fading out a moment after it's full again (orange when it ran out). A hit shakes the bar and flashes the screen edges red, and
  below 30% health the edges pulse red. **Settings → HUD → Arrange and resize** lets each player drag the pieces
  anywhere (or pick one with Q / E or LB / RB and move it with the arrows / stick) and change their size; it's saved
  per player. While arranging, the pause menu steps aside and comes back on the same tab afterwards. Each party card is
  a piece of its own (first, second, third card: by place, so swapping people doesn't scatter them), and so are the
  stamina ring and the mini-map. The stats can have their bars **side by side or stacked** (Y / R) and show
  **faces** (X / Shift: the hero's where the level is; the first party card's setting goes for every card); the clock's
  season picture turns on and off with Y / R; the
  adventure log can have **one box** behind it, a strip behind each line, or **no background** (Y / R). In playtests the debug panel sits under the weapons and can be hidden.
- **Window themes**: the frames, backgrounds and fonts of every menu, text box and HUD piece. Built in: **Ember**
  (the original dark glass with warm gold), **Medieval Parchment** (aged paper, dark ink, wax-red trim), **Medieval
  Wood** (oak planks with iron brackets), **Dwarven** (carved grey stone with runes and griffin-head end caps),
  **Elvish** (white and gold marble set with emeralds and sapphires) and **Titan** (black patchwork metal with glowing
  red veins). **Database → Menus → Window theme** sets the game's own; players can pick another in **Settings →
  Gameplay → Window theme** ("The game’s own" follows the Database). Each theme comes with its own title font (embedded,
  open-licensed), so it works offline and in the standalone builds.
- **Text boxes**: by default a speech bubble over whoever is talking, sized to the text, with a tail pointing at
  characters (signs and objects get a plain box). **Settings → Gameplay → Text boxes**: above speaker, below speaker,
  top, bottom or centre of the screen. The Show text command can force a speech bubble or a plain box.
- **Styled words**: tags colour or style just some words in a message, a choice or a word bubble: `[b]bold[/b]`,
  `[i]italic[/i]`, `[s]struck through[/s]`, `[u]underlined[/u]`, `[glow]glowing[/glow]`, `[outline]outlined[/outline]`,
  `[color=#5ab8ff]any colour[/color]`, and the **named colours** of **Database → Text colours** (Names blue, Places
  green, Items gold, Danger red, and any you add): `[name]Lord Varn[/name]`. Change a named colour once and every
  message follows. The typewriter skips the tags, so they never show half-typed. In the Show text window, select
  words and click **B**, **I**, **S**, **U**, **Glow**, **Outline**, a colour dot or ◼ (the picked colour) to wrap them.
- **Text box styles** (**Database → Text boxes**): ready-made looks for messages, set up once. Built in: **Speech**
  (people talking), **Sign** (signs, chests and other objects), **Narration** (nobody speaking), **Item received**,
  **Gold received** and **System** (learned a spell, changed class, no room in the bag); add your own (a villain's
  red box, a ghost's see-through text…). Show text → **Style** picks one; *Automatic* uses Speech, Sign or Narration
  by who's talking. Change a style and every message using it follows; each has a preview.
- **A message's own look** (Show text → *Change the look just for this message*, starting from its style's): text and box colours, text size, bold,
  italic, strikethrough, an outline (and its colour), a glow, and a see-through box (just the text): the same
  settings as word bubbles, with a preview.
- **Tap to walk** (tap or click the ground to walk there, or a person to go and talk to them) is off unless the player
  turns it on in Settings → Gameplay (or the title's Options); tablets have the on-screen stick.
- **Settings** (the title's Options and the pause menu's Settings are the same screen): **Picture** (brightness,
  bloom, depth of field, shadows, lamp/fire shadows, detailed lighting), **Sound** (music, effects, background
  volumes), **HUD** (arrange and resize), **Controls** (keyboard and controller bindings) and **Gameplay** (text boxes, text speed,
  always run, sneak hold / toggle, sprint hold / toggle, run with a full stick push, footsteps on / off, clock format). They belong to the player, not to a save: loading a save never changes them.
  **Save settings to a file** downloads them all (HUD layout, controls, everything) as a small `.json`, and **Load
  settings from a file…** brings them into another copy of the game: a newer version, the other browser, or the
  hosted game. Choosing the file needs a click or Enter (browsers don't open file pickers from a controller button).
- **The game's default settings**: put a saved settings file at `public/data/settings.json` and it becomes the
  starting settings for every player who hasn't changed theirs (controls, HUD layout, picture…). **Restore
  defaults** goes back to it (it asks "Are you sure?" first). A browser that already has settings saved keeps them until Restore defaults.
  The editor does this for you: **Database → Menus → Default settings file → Choose settings file…** takes a file
  saved from Settings → **Save settings to a file** and puts it in the data folder (and shows whether one is set).
- Exit closes the game where the browser allows it; in a normal tab it asks the player to close the tab.

### World layout, the world map and seamless maps

- **Map editor toolbar → World**: every field map on one grid. Tick a map to put it in the world, drag it into
  place: it snaps edge to edge to the maps around it. **Add a place name** and click the map to put a town, landmark,
  dungeon or region name on the world map (click one to rename it, drag it to move it). The settings at the bottom say
  how places not visited yet show in the game. **Apply**, then save.
- **Seamless edges**: in Map Properties → *Beyond the edges*, set a side to **Seamless**. Where another map
  touches that side in the World layout, it's drawn past the edge (built a moment after you arrive, so arriving stays
  smooth), and walking off the edge takes you straight into it: no fade, the same spot on the other side, the camera
  carrying on. Set the matching side of the other map to Seamless too, to walk back. Make the ground meet at the same
  height along the seam. Parts of a seamless side with no map beyond it show nothing (like *Nothing*), so keep the
  other kinds (forest, cliffs, water…) for the world's outer edges, or a dungeon's darkness.
- The ground under the hero and around them is marked as explored as they walk (kept in saves), for the world map's fog.
- **Map markers on events**: in the event window, **Map marker** puts the event on the world map as a *Quest
  location*, *Landmark*, *Town*, *Danger* or any kind you add, with its own tooltip (default: the event's name).
  **Only while switch** shows it only while a switch is on (or off): turn a quest's switch on when it starts and off
  when it ends, and its location appears and disappears. Area events (bigger than one tile) are outlined.
  **Database → Map markers**: each kind's name, symbol (star, circle, diamond, square, triangle, !, ?, flag, skull,
  house, cross, heart) and colour, and new kinds.

### Battle look (Update 111)

- **Damage numbers** are bigger (critical hits and the big finishers bigger still).
- **Meter and orb styles** (Update 126): Database → Title & menus → Bars: **Meter fill** (gradient, flat colour,
  glossy with a shine along the top, striped, or segmented blocks of colour), **Meter shape** (pill, rectangle,
  bevelled corners, thin line, or blocks with gaps) and **Party orbs** in battle (shaded sphere, flat circle, pixel
  square, diamond), everywhere meters are drawn. (The older solid / square switches become Flat / Rectangle.)
- **Battle layout** (Database → Title & menus → Battle layout, Pocket Handheld): the foes' blocks, the party's
  blocks, the command box and the text box. Tick *Place by hand* for a piece and drag it (its corner sizes it), in
  percent of the screen; unticked pieces keep the built-in place.
- **Battle idle** (Database → Characters → a card's *Battle idle…*): pick a row of the sheet (counted from 1) and tick
  up to 12 of its frames; they loop, at the speed you set, while that character stands in battle.

### Battles: whose turn it is

- The ring under whoever's turn it is, and the glowing, gently pulsing outline on their card (and their row in the
  Forbidden Fantasy layout), are in their own colour from Database → Heroes.

### Built-in sounds: chiptune

- The built-in effects and music are **Game Boy-style chiptune** by default: two pulse channels, a wave channel (bass)
  and a noise channel (drums, hits, footsteps), with stepped volume fades and pitch sweeps like the handheld's sound
  chip. Every effect (menus, hits, jumps, coins, level-ups, loot, battle stings, the victory fanfare…) and every theme
  (title, field, night, battle, cave, victory) has a chip version; the tunes are original, built from repeating
  motifs over each track's chords. **Database → Audio → Built-in sounds → Style**: *Chiptune* or *Classic* (the older
  soft synth). Background sounds (wind, birds, rain, campfires…) stay natural either way, and your own files are
  never changed.
- **Console: `audio_chiptune true`** (playtests): hear every effect and theme in its built-in chip version, whatever
  the Database has swapped in, without changing anything. Music files give way to the matching built-in theme (battle,
  victory, title, cave in dark maps, night outdoors at night, otherwise field). `audio_chiptune false` puts your
  sounds back. Voices and event sounds from files stay as they are.

### Self-switches and the switch list

- **Self-switches**: every event has its own switches **A–D**, no names needed. **Set self switch** (event command)
  turns one on or off for the event running it; a page's **Condition → Self switch** (or a Conditional branch) checks
  it. A chest: page 1 gives the item and sets A; page 2 (Self switch A is ON) shows it open. Each event keeps its
  own, saved with the game.
- **Switches window**: every switch field has a **☰** button opening the game's switch list (kept in the Database):
  **+ New switch**, **−** to take one off the list, type over a name to rename it (its uses on the open map follow),
  **Use** to pick it. Names used on the map but not in the list show underneath, with + to add them.

### Event sounds

- An event page can make a sound all the time (**Inspector → event page → Sound → Plays all the time**): a crackling
  campfire, waves on a shore, a waterfall, a machine hum (built in) or any file from audio/ambience. It's loud right
  by the event and fades smoothly to nothing at **Heard from** (8 tiles by default), panned left or right as the hero
  walks past; **Volume** 0–100. It plays only while that page shows, so a page that puts the fire out goes quiet.
  Event sounds use the Ambience volume and hush during battles.
- Lit campfires (fires that are respawn points) crackle softly on their own.

### Word bubbles

- In the event window, each page can have a **Word bubble**: **!** (a quest to take), **?** (ready to hand in) or
  any short text, **above** the event, **on** it or **at its feet**. Set the text and bubble colours, bold, italic,
  strikethrough, an outline (and its colour), a glow, the text size and the bubble's size, and whether it bobs.
  **See-through bubble** shows only the text (a floating gold "!", World of Warcraft style).
- Its text can use the same style tags as messages (`Hello [name]Varn[/name]!`).
- It shows while that page is the one showing, so quest givers use pages: one with "!" while the quest can be taken
  (Condition → Quest not started), one with "?" when it's ready to hand in (Condition → Quest ready to hand in).
  Bubbles hide in menus, battles and on the title screen.

### Tutorials (Update 113)

- **Database → Story → Tutorials**: each has a title and a few lines. The event command **Show tutorial** pops one up
  the first time it runs (each tutorial once per game). Players can turn **Tutorial pop-ups** off in Settings; every
  tutorial they reach is kept in **Journal → Tutorials** (newest first) either way, and the adventure log notes it.
- **Skill tree locks**: a skill can also need a quest done, a key item carried or a switch on (Database → Skill trees
  → the skill: *Unlocked by…*); until then it says what it needs.

### Global events (Update 131)

- **Database → Story → Global events**: event scripts that belong to no map. Each has a name, the moments it runs at
  (tick any): **New game**, **Loading a save**, **Sleeping** (waking from a camp, an inn or a Sleep command), **Entering
  a rest zone** and **A new real day** (the device's date rolling over while playing, or loading a save made on an
  earlier day). At each, it runs once (when nothing else is going on: no menu, message or other event), then waits for
  the next. The commands are the usual ones, conditions too: *If the moon is full: Katrina leaves the party; else she
  joins.*
- Someone who **joins while the party rests in a zone** walks in from off-screen to a free rest spot; everyone else
  stays where they are.

### Achievements

- **Database → Achievements**: each has a **name**, a **description**, an **icon**, **points** and an **ID**
  (letters, numbers and underscores, like `SLIME_SLAYER`: the same as a Steam achievement's API name, so they carry
  over). Tick *Hidden until unlocked* for secrets. **Unlocked by**: an event (the **Unlock achievement** command), a
  switch turning on, defeating enemies (one kind or any, how many), performing Additions (one or any), casting spells,
  reaching a level, completing a quest, holding gold, having an item, the party's size, or any **Journal record**
  reaching a number (steps, fish caught, battles won, battles won without anyone taking damage…).
- Unlocking shows the pop-up (a badge pops in at the bottom, opens into "Achievement unlocked · 20G – Name", the name
  gives way to the description for a few seconds, then it closes and fades) with its own sound (Database → Audio → *Achievement unlocked*), and a line in the adventure log.
- The Achievements page has a bar across the top: points earned out of the total ("35 / 180 pts").
- Unlocks belong to the player in this browser and count for every save (like Xbox and Steam). Playtests keep their own.
- **Steam**: *Export for Steam (.csv)* lists the API names, names, descriptions and hidden flags for setting them up in
  Steamworks (Steam has no points; theirs stay in the game). A desktop build that talks to Steam (Electron with
  steamworks.js, say) only has to provide `window.hd2dAchievements.unlock(id)`: every unlock is passed on, and on start
  every achievement already unlocked is passed on too, so earlier unlocks carry over.
- Console cheats (below) turn achievements off for that game (the save remembers it).

### Developer console

- Press **`** in a playtest (or three fingers on a touch screen, or **Console** in the playtest panel): the game
  freezes and commands can be typed. **Tab** completes commands and names (items, heroes, spells, enemies, maps…),
  ↑ ↓ go through earlier commands, `help` lists everything (`help give` the ones matching), Esc or ` closes.
- **Who it's for**: commands about a character take a hero's name (or id) anywhere in them, or `all`:
  `level 5 eleanor`, `exp 300 all`, `hp 10 katrina`, `learn_spell fire 2 crowley`. With no name they're for the
  hero you play (`heal`, `revive` and the `learn` / `forget` commands default to everyone).
- Commands: `give <item> [count]`, `take`, `gold <amount>`, `party_add <hero>`, `party_remove`, `learn_spell <spell>
  [rank] [hero]`, `learn_addition`, `forget_spell`, `forget_addition`, `exp <n> [hero]`, `level <n> [hero]`, `heal [hero]`,
  `hp <n> [hero]`, `mp <n> [hero]`, `ko [hero]`, `revive [hero]`, `deathless`,
  `deathless_party`, `infinite_items`, `infinite_gold`, `god` (all four), `ghost` (through walls, props and cliffs),
  `speed <×>`, `unlock_skills [hero|all]`, `teleport <map> [x z]`, `time <hour>`, `weather <kind> [amount]` (rain, storm, snow, blizzard, haze, sandstorm, pollen, dust, leaves, none; also clear / sunny, fog, thunder),
  `season <name|auto>`, `battle <troop|enemies…>`, `win_battle`, `switch <name> <on|off>`, `var <name> <value>`,
  `debug_menu <show|hide>` (the playtest panel), `fps`, `hud <on|off>` (screenshots), `achievement <id>`,
  `achievements_reset` (or `reset_achievements`; counts kept in the save, like foes defeated, can earn them
  again), `achievements_allow [on|off]` (achievements unlock on this save even after cheats; off: the next cheat
  locks them again), `explore_all`, `where`, `bug <what went wrong>` (notes the map, tile, height, time, party,
  level and a small picture, kept in this browser) and `bugs` (downloads every note as a `.json`; `bugs clear` starts
  over): handy for playtesting.
- **Database → Title & menus → Developer console**: in playtests only (default), always, or never.
- The **Run console command** event command runs any of them from an event (handy for test events).

### Saving, loading and respawn points

- **Saving**: from the pause menu's Save / Load. There are 3 save
  slots plus an **Autosave** written on every map change. The game keeps the map and position, switches,
  variables, abilities, health / magic / stamina, the bag, gold and equipment, the time of day, the respawn
  point and the play time.
- Playtests keep their saves and settings apart from the real game's.
- **Database → Saving**: *Save from the menu anywhere* (off = only at save points) and *Autosave on every map change*.
- **Save points**: the **Open save screen** event command (a statue, a bed, a journal…).
- **Respawn points**: tick **Is respawn point** on a prop (in its importer, or *Customise* for built-ins; the built-in
  campfire is one already) or on an event page. Using it (facing a prop and pressing Enter, or running the event)
  shows "Respawn point set". After losing all health the player comes back there, or to the player start if they
  haven't used one yet.
- Saves are kept in the browser's storage for now (per game title); a Windows build can store them as files later.

### Items, the bag, equipment and shops

- **Six item tabs** in the Database's Items group, each listing part of the game's items: **Items** (potions, food
  and other consumables), **Materials** (Update 133: loot, ore, wood, ingots…), **Weapons** (melee weapons, bows and
  arrows), **Gear** (armor, shields and accessories), **Shards** (spell shards and element stones) and **Key items**. *+ New* in each starts the right
  kind (a new weapon is a sword, new gear is armor…). Changing an item's kind or slot moves it to its tab, still
  selected. Duplicate, copy and paste work in every tab.
- **Icons**: over 250 built-in pixel icons, in folding groups (potions and bottles, food, drinks, weapons, armor and
  clothes, accessories and gems, materials, ores and minerals, herbs and plants, fishing, containers and things,
  magic, element stones), or **Import image…** (a 16 × 16 or 32 × 32 PNG, saved to `assets/icons/`). **Tint**
  recolours any icon, built-in or imported, keeping its shading: a red potion becomes a teal one, a steel helmet a
  golden one (ten quick colours or any colour).
- **Icon effects** (Update 133, under the icon): a **Glow** behind it, an **Outline** round it and a **Pattern** laid
  over it (stripes, dots, cracks, swirls or checker, with how strong it shows), each in a colour of your choosing: a
  *corrupted* pumpkin with purple cracks and a green glow. They show everywhere the icon does (bag, shops, HUD, loot).
- **Cannot be sold** (Update 133, any item): shops list it greyed out in their Sell tab (*Can’t be sold*) and won't buy it.
- **Every item** has a name, description, icon, a price and a kind:
  - **Consumable**: restores health, magic and/or stamina. Health and magic each have an amount box and a **%** box
    (of the maximum), used together: 10 and 30 % restores 10 + 30% of max HP ("+10 + 30% HP"). Items work on
    magic in battle too.
    It isn't used up when it would do nothing. **Stack** sets how many fit in one bag slot (default 64); more of the
    same item starts another stack.
  - **Equipment**: goes in the **Weapon** (melee: light, medium or heavy class, damage), **Bow** (damage),
    **Shield** / **Armor** / **Accessory** (defence) or **Spell shard** slot. Weapons, bows and shields also choose the LPC
    **Sprite** animated characters hold. **Who can use it** keeps a piece to some heroes (none ticked: everyone).
  - **Arrows**: extra damage, stacks of 64, or *never run out* for the basic arrows.
  - **Loot** (materials): furs, wood, ore and other resources, stacks of 64 (more stacks as needed).
  - **Key / quest item**: can't be sold or discarded, has no stack limit and always fits (even in a full bag).
- **Database → Inventory**: slots per bag tab (8 to a row, default 64), starting gold, starting items and starting equipment.
- **In game**: the pause menu's **Items** opens the bag. Each kind of item has its own tab (pocket) of 8 × 8 slots,
  empty ones shown so things can be arranged (**Move** works within a tab): *Consumables*, *Gear* (weapons, armor,
  arrows), *Shards*, *Materials*, *Key items*; *All* shows everything at once. Use, Equip, Quick slot, Move, Drop one /
  Drop all; nothing is ever thrown away. Older saves sort their items into the tabs when loaded.
  - **Worn things stay in the bag**, like arrows: weapons, armor and shards that someone has on show **in use** in
    their tab, and the details say who (*Equipped by Mira*). Things in use can't be dropped or sold (take them off
    first: **Y / R → Take it off**). Older saves put what was worn back in the bag, marked in use.
  - **Gear** (Space on a weapon, armor or arrows): choose who puts it on (with a party; those who can't use it are
    greyed out). If every copy is in use, it moves from whoever had it.
  - **Shards** (Space on a shard): **Ready for** a hero (their spell, cast with B / F). What it replaces simply stays
    in the bag, free again.
  - **Element stones** (the Shards tab too): Space on one puts it in a hero's **Primary** or **Secondary** Element
    slot, or **fuses** them: 25 Fragments into a Shard, 10 Shards of one element into a Heart Stone (*Fuse all* does
    as many as there are; worn ones aren't used up).
- **Element stones** (Fragments, Shards and Heart Stones of Water, Fire, Nature, Earth, Shock, Light and Dark; the 21
  are added to Database → Items as `ess_…`, to rename or price): each hero has two **Element slots** (Equipment, or the
  bag). A stone gives them its element, with its weaknesses, and makes their hits of it stronger: a Fragment +10%
  (its weaknesses milder, ×1.5), a Shard +25%, a Heart Stone +50% (neither worse than the usual ×2). Two of one
  element add up (the second gives 60% of its bonus, +10% more for the pair), but two Shards' weaknesses hit ×2.25.
  The **Primary** slot's element is what their basic attacks hit with (on the map too); spells of their own element
  get +20% more. With no stones a hero is **Normal** (their Database elements, if any). Enemies with elements drop
  Fragments of them (60%). All the numbers are in Database → Combat → *Element stones*. Their elements show as pills
  (**FIRE** on orange) on their cards, in battle and on the HUD (small circles with the element's symbol).
- **Hero forms** (Database → Heroes → *Forms*): a **mid** and a **final** form, each at a level, with its own look
  (from Characters) and face art. After the battle that takes a hero to that level, a transformation scene plays
  (their old look, white outlines flickering faster and faster, a flash, the new look) and from then on they look that
  way everywhere: on the map, in battle, on their cards. Party members have forms too. Saved with the game.
- **Advanced monster forms** (Database → Enemies → *Advanced form*): another enemy (its own entry, art, numbers and
  loot) that comes out instead once this one's level reaches a set level: a spawn's level range, or dynamic levels
  catching up with the party, so old areas can start showing the advanced form. *Make an advanced form* adds a copy
  right after it with its numbers grown to that level. The Bestiary lists each advanced form right after its base
  and shows them linked (*Green Slime —Lv 6→ Red Slime*; unmet ones as ?).
- **Type Chart** (Journal → Type Chart): every element against every other (green ×2, red ½), each one's strengths
  and weaknesses, and what the stones give.
- **Status** (Party → a hero → Status): their gauges and numbers on the left, what they're wearing in the middle, and
  on the right their name, **About** (Database → Heroes → About), any ailments and, for party members, their
  **Fighting style** (Melee, Archery, Magic, Healing, each with a line on what it does): the weapon they mainly use.
  It starts as their database style; without that style's weapon (no bow for Archery, no shard for Magic) they fight
  with what they have (a bow alone makes an archer), and the page says so. Equipping is done from the bag.
- **Gear tab**: **Weapons** (swords, bows, arrows) and **Armor** (armor, shields, accessories) side by side, 4 × 8
  each. Picking a piece shows what it would change for each hero who can use it (+4 melee, −2 DEF…), and Space puts
  it on whoever you choose (those who can't use it are greyed out). What someone wears is tagged **equipped** in
  their colour (Database → Heroes → Colour).
- **The party beside the bag**: with party members, everyone's face, HP, MP and ailments stay on the right of the
  Inventory. Space on a potion (or other consumable) moves the cursor onto them: pick who, and watch the bar fill.
  The bag, gold and equipment are saved with the game.
- **Chests and pickups**: in the Events layer, click a tile and choose **Create chest here** or **Create item
  pickup here**. Both make a two-page event: page 1 gives the item and sets a switch
  (`chest_<map>_<id>`), page 2 (when the switch is on) shows the open chest, or nothing for a pickup.
  If the bag is full the player is told and the chest stays closed.
- **Locks and lockpicking** (Update 119): select any event (a door transfer, a chest…) and tick **Lock settings →
  Locked**. Pick the difficulty: **Easy** (green), **Medium** (yellow), **Hard** (orange), **Impossible** (red) or
  **Cannot be picked** (grey: only its key opens it), and optionally a key item that opens it. It's a **Lock**
  command first in the page's commands (you can also add it anywhere yourself). Until it's open the event stops there.
  Picking works like Skyrim: move the pick round the half circle (← → , the stick or the mouse) and hold Space / A
  (or click) to turn. On the sweet spot the lock turns all the way and opens; near it, it turns part way; off it, it
  jams and the pick strains until it snaps. Easier locks have a wider sweet spot; Impossible is a sliver. A soft click
  ticks faster near the spot, and controllers rumble more the closer the pick gets. A **Skeleton Key** (Field use)
  or the lock's own key opens it straight away. An opened lock stays open (saved).
  Update 125: picking needs a **Lockpick** (a built-in key item, added to every game; shops can sell it). Holding the
  turn on the wrong spot strains the pick until it snaps (faster on Hard and Impossible), using one up; opening the
  lock keeps it. Out of picks, the attempt ends. The lock is drawn in pixel art: a brass lock face, a stepped track
  for the pick, and a pick that reddens as it strains and flies apart when it snaps.
- **Taking gear off from the bag** (Update 125): Space on worn armor or a weapon lists who to put it on and
  **Unequip (take it off …)**, so it can be worn by no one.
- **Shops**: the **Open shop** command lists what's for sale (prices come from the item unless you set one) and
  whether the player can sell (for half the price). In the sample map, talk to Mira twice and ask to trade.
- **Picking items by kind** (Update 138): the Open shop command's goods and an enemy's **Loot** (Database → Enemies →
  Rewards) are split into sections (Items, Key items, Materials, Weapons, Armor / accessories, Shards and stones), each
  with its own *+ Add* and dropdowns listing only that kind.
- Built-in sprites for events: **Chest**, **Chest (open)** and **Item sparkle** (which glows in the dark).
- The sample map starts with 60 gold, 2 potions and some bread; a potion sparkle lies by the path.

### Horses

Stables rent horses: the event command **Stable** (Items group) has the keeper offer the horses you tick (none
ticked: all of them), each with its stars and price. **Database → Horses** sets each one: stars (1 – 3), price,
galloping speed, stamina, jump length and its colours (placeholder art for now). The built-in three: a Brown Horse
(★, 200 G, jumps 3 tiles), a Grey Steed (★★, 600 G, 4 tiles) and a Black Charger (★★★, 1500 G, 5 tiles).

- **One at a time.** A rented horse stands beside the hero. The Talk button beside it gets on; **B** gets off (while
  riding, B does that instead of the key item or spell on it). It stays where it was left, on that map, and in saves.
- **Riding**: walking is half the gallop; running gallops. The horse has its own **stamina**, shown in the stamina
  ring: galloping and jumping use it, walking and standing bring it back; run out and it can only walk until it has
  its breath back. **Jump** while moving is a long leap (the horse's jump length) over gaps, streams and fences. No
  climbing, crawling or swimming: water too deep to wade stops the horse. Hooves clop (a quick gallop when
  running), the horse snorts and whinnies now and then, and speed lines streak in while galloping. While riding, the party is out of sight
  and the hero sits in the saddle (LPC sheets: the combat stance, with the leg on the far side of the horse
  hidden; a sheet with its own "ride" animation uses that). It **waits outside** an indoor map (where
  the hero went in). Battles don't show it, and the hero is still riding afterwards.
- **Sending it home**: a key item marked **Saddle** (Database → Items → Field use; the project has one) comes with
  a rented horse; *Send your horse home* from the bag returns it to its stable, so another can be rented anywhere.
  A stable keeper offers the same when you already have one.
- The event command **Horse** gives one (free or not), sends it home, or puts the hero on or off it, for story
  moments. Console: `horse grey_steed` (free), `horse home`, `horse on`, `horse off`.

### Griffin flights

WoW-style flight paths between towns. Put the event command **Griffin roost** (Items group) on a griffin master in
each town, with the roost's name and an id (one per town). Talking to a master **unlocks** that roost (the hero will
land where they stood while talking) and opens the **world map** with every other unlocked roost on it: A (Space)
steps through them showing each price, A again (or a click on the chosen one) flies there; B cancels. Masters with
*Only unlock it* just open the roost.

- **Price**: a base plus so much a tile of distance in the World layout (Database → Travel: 20 G + 0.5 G a tile unless
  changed). Roosts too dear are greyed out.
- **The flight**: the screen fades, then the griffin (with the hero on its back) takes off and flies the route at one
  speed (Database → Travel, 12 tiles a second; long flights take longer, no skipping), over the World layout's maps
  drawn from above, with forest and pines where nothing is laid out. It lands, the hero is set down at the roost, and
  the griffin flies away. A horse being ridden waits where it was left.
- Placeholder griffin art for now. Roosts on maps outside the World layout still work (a short flight over forest).

### On the map: the sword, the bow and starting battles

Battles are turn-based (next section); the real-time battle system was removed in update 65. On the map:

- **Update 132**: the map has no sword or bow any more and no ambushes. Touching a foe (either way: it reaching the
  hero, or the hero reaching it) starts a **normal** battle. The **Cut** and **Bow** key items do the field jobs from a
  quick slot (Field uses below); lock-on (Tab / RB) aims at switches and targets, not foes. *(Older notes follow.)*
- **Bumping into foes**: an enemy that sees or hears the hero chases them, and reaching the hero starts a battle with
  it and its friends nearby. Ranged foes start it when they shoot.
- **The sword (1) and the bow (2)** (before Update 132) were field tools the hero always had: they cut vines and grass,
  hit switches and break things. An equipped weapon or bow shows in their place. The field bow never uses up arrows
  (and picking arrows up doesn't equip them: arrows are only used in battle once equipped on the Equipment page).
  Hold the bow to draw, let go to shoot. Fire spells, fire arrows and fire weapons light torches and campfires.
- **Striking first**: a sword swing, an arrow or a spell bolt that reaches a foe starts the battle with the party's
  turns first. **Lock on with the bow (Tab / RB)** to snipe a foe from afar: with a bow the lock-on reaches much
  further (Eagle Eye further still). Two skills change an unseen strike: **Assassinate** (a sword strike on an ordinary
  foe that hasn't noticed the hero ends it on the spot, no battle) and **Silent Shot** (an arrow from 5 tiles or more at
  a foe that hasn't noticed the hero wounds it before the battle starts, and can finish it).
- **Carried weapons**: the readied weapon is slung on the hero's back and comes into the hand to swing or draw, then
  goes back. Animated (LPC) heroes hold the weapon's LPC sprite; others show its icon. Enemies carry theirs the same way
  (Database → Enemies → *Holds*).
- **Database → Combat**: *Weapon damage* (each class's damage ×, and how the sword swings on the map) and *Sword, bow and
  spells on the map* (draw time, arrow speed, lock-on ranges, spell bolt speed and range, how long a fire attack keeps
  a fire lit). Settings of the old real-time system (dodging, blocking, sneak attack damage) are gone; an older
  database's are dropped when Database → Combat is opened.

**Stealth (C to sneak)**: sneaking is slow and quiet, and the hero crouches. An eye at the top shows *Hidden*,
*Noticed* or *Detected*, and the screen's edges darken the better hidden you are (in the dark, sneaking): they ease off
when someone grows suspicious and clear when you're seen. Enemies see further in light and much less in the dark (the time of day, the map's lamps
and fires, and the Light spell all count), have a field of view, and hear running and fighting. Each enemy builds up
awareness: **?** = suspicious (it comes to look), **!** = alert (it chases the hero and calls nearby friends). Sneak
past foes, or catch one unaware to strike first.

**Enemies** (Database → Enemies): health, damage, defence, speed, a behaviour (**melee**, **ranged**: keeps its
distance and shoots, **charger**: winds up then rushes in a straight line), attack range (how close it gets before it reaches the hero), wind-up (the glow before
it lunges), time between attacks, sight, field of view, hearing, EXP, gold and item drops (Update 137: only the drops set
here; enemies with elements no longer drop Fragments of their own accord), a
size, and a boss flag. They look like a character from the database or a built-in monster (green, blue and ember
slimes). They walk around cliffs and up ramps to reach the hero. Place one with **Create enemy here** in the Events
layer, or set an event page's Appearance to **Enemy**. The page's commands run when it's defeated (open a gate,
set a switch); beaten enemies come back when the player returns to the map.

**Levels**: enemies give EXP; each level gives a **skill point** (see *Skill tree*). The level
shows big beside the bars, and a green EXP bar runs along the bottom of the screen (full, showing MAX, at the top
level). **Database → Player → EXP progression** sets the highest level (default 50, up to 99) and how much EXP each
level takes: start from a curve (EXP for level 2 and how much more each level needs), then type over any row of the
table to set it by hand. A chart shows the shape; *All ±10%* scales the whole table and *Rebuild from the curve*
drops the hand-set numbers. Database → Combat sets points per level.

**Sample map**: slimes around the pond and paths, an ember slime (charger) in the east meadow, and a bandit camp
on the plateau to the north-east (two bandits and an archer), with the ramp as the way up. The hero starts with a
Short Sword, a Hunting Bow and Iron Arrows; bandits drop Steel Arrows.

### Turn-based battles (optional battle system)

**Database → Combat → Battle system** chooses how the game fights: **Action** (everything above, the default) or
**Turn-based**, in the style of Final Fantasy X and the Game Boy Advance Pokémon games. Heroes, stats, gear, spell
shards, items, enemies, EXP, gold and drops are the same in both, so a game can switch at any time.

- **On the overworld** (before Update 132; now the Cut and Bow key items) the hero's **sword and bow were field tools**: always there (not bag items, no arrows needed),
  for cutting vines, breaking crates and shooting switches. An equipped weapon or bow is shown instead when there is
  one. The **Enable / disable overworld weapons** event command turns them off indoors or in restricted areas: they're
  greyed out on the HUD with a red ✕ until an event turns them back on.

- **Starting a battle**: an enemy on the map that reaches the hero (its strike or its arrow) starts a battle with it
  and the enemies near it (*Enemies who join*, up to *Most enemies in a battle*). Hitting it first on the map, with a
  sword, an arrow or a spell, gives the party the first turns (*You caught … off guard!*); being hit from behind is an
  **ambush** (the enemies go first). Stealth still matters: sneak up on an enemy to strike first.
- **Battle music**: Database → Audio → **Battle music** plays in every battle (the built-in theme when unset). A map's
  **Override battle music** (Map Properties → Sound) is for areas that need their own; a battle map's own music, a
  troop, an encounter zone or a Start battle command (bosses) can override it too.
- **Each turn starts on Attack**, and Attack performs the hero's **Default Addition** (Database → Heroes; Party →
  Addition still switches it). Heroes and enemies have a **Battle height offset** for art that floats or sinks.
- **Enemy tint** (Database → Enemies → Tint): turn the hue, change the colourfulness and mix in a colour, RPG Maker
  style, to make new monsters from old art: on the map, in battle, in the Bestiary and in the editor.
- **▶ Combat preview** (Database → Enemies, and Troops): pick a battle map (or the flat battle screen) and a playtest
  opens straight into that battle with your party, the window's changes applied first.
- **Damage and health vary**: every hit varies a little (Database → Enemies → *Damage ± %*, 10 by default) and is
  then cut down by the target's Defence (or Magic Defence for magic) and guarding. *Health ± %* rolls each enemy's
  health either side of its Health, so no two slimes are quite the same.
- **On the battle map** every fighter shows the frame for the camera's direction (from behind the party: three backs,
  never two backs and a side view), and ambient occlusion leaves the fighters alone (no shaded box around them).
- **Random battles**: paint encounter zones on a map's **Spawns** layer and give each zone its troops (below). Maps
  made before zones may still have an older *random encounters* list (shown in map settings → Random battles, with a
  button to remove it); it only applies outside painted zones. Works alongside enemies placed on the map.
- **Battle cameras**: on a battle map, **LB / RB** (Q / E, or tap the camera chip top-left) switch between seven
  cameras: behind the party, over either shoulder, high above, low and close, and wide from either side. Each
  battle starts on one at random, most often the one behind the party.
- **Three a side, eight in the party**: the party holds up to eight (the hero and seven more). The hero and the first
  two of the lineup fight (and follow on the map); the rest wait on the bench. **Swap** on any hero's turn brings one
  in where they stood, and the newcomer takes that turn (no turn is lost). Whoever finishes a battle stays at the front
  of the lineup. Up to three enemies (troops, zones and Start battle are capped at three). On a battle map, put P1 (the
  hero) in the middle and P2 / P3 either side.
- **On the stage**: an arrow over whoever's turn it is while they choose. Additions: the camera closes in from the
  side as the hero rushes up to the front of the target; the damage lands all at once when the string ends (a missed
  strike ends it, with the damage of the strikes that landed); a pause, then they run back. Spells: the camera swings
  round between the caster and the foes, looking back at the caster (who keeps facing the foes) as they raise their
  arms (their chant, for a spell that charges), then back; when it goes off, in front again for the call-out, back,
  and only then the spell. Sprites face the way they're turned in the world whichever way the camera looks.
  Character Builder sheets don't always have every clothing layer in every pose: a pose that loses clothes or
  accessories compared with the walk is left out automatically (the standing / walking frames are used instead). Items: they turn to whoever it's for and toss it. Badly hurt (a
  quarter of their health or less) or ailing, fighters crouch and breathe slow and heavy (a sheet with a `kneel` or
  `sit` animation kneels instead). The field's weather and mist carry on over the battle.
- **Voices**: Database → Spells → *Call-out* (as it goes off) and *Chant* (while it charges); Database → Additions →
  *Call-out* (when the whole string lands); Database → Heroes → *Attack sounds* (one at random when they land a weapon
  or bow attack). Import voice clips in Database → Audio.
- **Victory music**: the fanfare, then Database → Audio → *Music after the fanfare* (unset: the map's music).
- **RetroMon window theme** (Settings → Window theme, or Database → Title & menus): handheld-era windows, white panels
  with dark pixel text and a thick black border with a thin line inside; made for the Pocket Handheld battle layout
  (its stat blocks, text box and commands take it too).
- **Window touches** (Settings → Gameplay, under Window theme; the game's own in Database → Title & menus): **Window
  opacity** (see-through windows; below 100% a theme's texture gives way to its plain colour), **Window colour** (a
  tint; a light theme can go dark), **Text colour** (the main text only: coloured names, items and places keep their
  colours) and **Frame colour** (the frame's coloured lines and gems, the selection and the texture's coloured bits:
  Titan's red veins turned blue). They work on every theme, Ember too.
- **Map camera** (Database → World → Camera): by default a steep, handheld-style camera (56° down) with standing
  sprites (trees, people, signs, props) leaning back to face it, so they keep their height and fill out their tile.
  Angle, distance, field of view and *Sprite lean* (0 upright … 100% facing the camera) can be changed; *Classic* puts
  back the original lower camera with upright sprites. Battle maps keep their own cameras (sprites upright there).
  *Top-down 2D* (Update 143) looks straight down (angle 90°, lean 100%, a narrow 15° view from 38 tiles back) like a
  Game Boy or RPG Maker game: sprites lie flat, the fog moves back with the camera and the tilt-shift blur fades out
  above 70°.
- **Seasons on 3D maps** (Update 160): name a Blender material `ter_grass` (or any tile's id or name, `ter_dirt`,
  `ter_sand`…) and it uses the game's tile picture, laid from above, changing with the seasons and weather like the
  2D ground; `…_season` keeps your texture but tints it with the seasons, and `_foliage` leaves turn too.
- **Compressed models** (Update 158): GLBs compressed with Draco (Blender's export option; decoder in public/draco/)
  or Meshopt (gltf-transform) load anywhere models do. docs/BLENDER_3D_MAPS.md → *Keeping maps small*.
- **Volumes and monsters on 3D maps** (Update 156): in the 3D view, right-click → *Trigger volume* (runs an event's
  page when the hero walks in or out, once ever or every time) or *Encounter volume* (counts as one of the map's
  encounter zones); move, turn (E) and size (R) them with the gizmo. Boxes named `trigger_…` / `encounter_A…` in
  Blender come in with one click. Monsters (Create enemy here) placed in 3D roam and chase on the scene's floors and
  stop at its walls; whole-map random encounters work as on any map.
- **3D view** (Update 155, the toolbar's *3D view* on a 3D map): fly round the Blender scene (right mouse + W A S D),
  right-click a spot to put a new event or the player's start there, click events to select them, drag the gizmo to
  move (W) or turn (E) them, F to frame, double-click to edit. Events placed in 3D keep their exact spot and height
  (`pos3`); the game stands them there, talks to them from in front and fires touch events when walked into.
- **3D maps from Blender** (Update 154, Map Properties → *3D map (Blender scene)*; how-to: docs/BLENDER_3D_MAPS.md):
  a whole place modelled in Blender, walked through in third person. Names in the scene mark collision (`_col`,
  `_nocol`, `_nocam`), swaying foliage (`_foliage` materials), water to swim in (`_water`), waterfalls
  (`_waterfall`), kill zones (`_killzone`) and the start (`start`). The hero walks up ramps and stairs, over and
  under bridges, jumps and swims; the camera orbits them like World of Warcraft (or follows behind: Database → View
  & camera), never from under the ground or straight down. Events still go on the map's tiles for now.
- **3D model maps** (Update 153, Map Properties → *3D model ground*): a GLB or FBX of a whole place as the map's
  ground and scenery instead of painted tiles. It's fitted over the map (or scaled, turned and raised as you set), and
  the game walks on it as it's shaped: slopes, floors and stairs; steep places, walls and holes block. Events, props,
  lights and passage go on the map's tiles over it as on any map; the editor shows the model from above.
- **Update 152**: **Grid movement** in 2D mode (the hero steps tile by tile like RPG Maker; Database → View &
  camera to walk freely instead). **Map folders** (Map Properties → Folder; the map list groups them). **RPG Maker MV
  sheets** (Terrain → *+ RPG Maker MV sheet…*: A1 water, A2 ground, A3 / A4 walls, A5 and B–E tiles, cut and ticked
  for you). Flat props sway in the wind and rustle when walked through. The tile editor shows Edge trim, Inside
  corners and Frame size together.
- **Frames, edge trims and inside corners** (Update 151, tile editor → *Edges and corners*): an Autotile can use the
  *Frame* layout (a picture of one patch's outline, 2 × 2 or 3 × 3 tiles, any tile size, e.g. 32 × 32 for 16 px
  tiles); any tile can have an *Edge trim* (a frame, see-through in the middle, drawn along the edges of each patch:
  grass edging, a rim round water); *Inside corners* is one tile of corner pieces (meeting in the middle like a dot,
  or RPG Maker style). New passage **Edges block**: walk on top of a patch, not off its sides. A tile on the upper
  layer decides its cell's passage, like RPG Maker (stairs set to O open a way up). **2D mode** draws characters and
  props with their feet on the bottom edge of their cell, and the hero's body fills his tile, so walls and trees stop
  him where their tiles are.
- **Editor layout** (Update 150): one bar on the left (drag its edge to make it wider; double-click the edge for the
  normal width); what's selected shows at the top of it (events: above *Events on this map*); the right bar is gone.
  Every tile, built-in or imported, has a ✎ for its settings (picture, kind, passage, cliffs, footsteps, blending,
  delete). Tick tiles or props to **Delete** them together or put them in a **Group**: groups are sections of the
  palette you can show or hide. Built-in tiles given your own picture can be Animated, Autotiles or Walls too.
- **Props from a tileset sheet** (Update 149, prop editor → *From a tileset sheet…*): open a sheet (RPG Maker B–E
  sheets, your commissioned ones), pick the tile size, drag a box over the tiles of a tree, rock or cave mouth, and
  they become the prop's picture, framed exactly (one sheet tile = one map tile).
- **RPG Maker cliffs** (Update 148): tile *Kind → Wall* is RPG Maker's A3 / A4 wall block (2 × 2 tiles, 64 × 64 at
  32 px), its sides and ends drawn from the neighbours; paint a cliff's top with an Autotile and its face with a Wall.
  Map settings → **Height**: *Implied by the tiles* (flat, like RPG Maker; the Heights layer is kept but unused),
  *Real 3D heights*, or follow the view mode (2D flat, 3D heights; battle maps keep their heights).
- **Upper terrain layer** (Update 147, Terrain → *Lower / Upper*): paint any imported tile over the ground (see-through
  where its picture is: flowers, path edges, tree tops), with an Eraser. Each tile has a **Passage** like RPG Maker:
  O walkable, X blocks, ☆ drawn over the characters and walked under.
- **RPG Maker-style tiles** (Update 146, tile editor → *Kind*): *Animated* (a strip of frames side by side or
  stacked, or added one picture at a time; set the frame count and speed) and *Autotile* (RPG Maker's A2 block,
  2 × 3 tiles, e.g. 64 × 96 at 32 px: painting picks the edges and corners from the neighbours; animated autotiles
  have the frames' blocks side by side, like A1 water). Drawn crisp and flat on the ground with no blended edges.
- **2D / 3D mode** (Update 145, Database → World → View & camera): *3D mode* is the HD-2D look; *2D mode* looks
  straight down with everything flat and draws in order of layers like RPG Maker: characters are on the *Player
  layer* (default 10), props on a lower layer always cover them, higher ones are always under them, and on the same
  layer whoever is further down the screen is in front (trees on the player's layer, flowers on 25, overhangs low).
- **Prop layers** (Update 144): every placed prop has a *Layer*, 0 (drawn on top) … 25 (the ground, the default),
  like RPG Maker's layers. Pick it in the map editor's prop brush (or *Prop's own*, the default set in the prop
  editor), or on a selected prop in the inspector. Where props overlap the lower layer draws on top; it never moves
  the picture. Overlapping copies on the same layer get a tiny automatic difference so they never flicker.
  **Characters always on top** (Update 139; Update 142: off by default, and now it covers the ground too): on, the
  hero and party are drawn over props they overlap and over ledges and cliff tops in front of them; off, trees,
  props, ledges and cliffs in front of a character hide them, as they really stand. Either way a leaned sprite
  standing in front of a wall never tucks into it.
- **Settings → Picture → Quality → Potato**: the lightest the map can be drawn, for slower tablets: a lower
  resolution, and no shadows, glow, depth of field, ambient occlusion, detailed lighting, swaying plants, drifting
  cloud shadows, mist, sun rays or neighbouring maps. Battles on battle maps keep their normal resolution. *Moving
  cloud shadows* can be switched off on its own too.
- **Healing out of battle**: Menu → Abilities → a hero → a healing spell: cast it on the party (it costs their MP).
- **Battle screen layout** (Database → Combat): **Dragon Legend** (default, Legend of Dragoon style): each hero's
  card in a row along the bottom (the hero in the middle), with their face (Database → Heroes → *Face art*, or one cut
  from their look), name, and HP / MP as numbers that are white, yellow at half or less, red at a quarter or less. A
  gold frame marks whose turn it is; a silver card is the one being chosen for a spell or item. Items and Magic open
  in the middle of the screen with their pictures and costs, and what the chosen one does in a box at the top.
  **Forbidden Fantasy**: health and magic bars in a box at the bottom right, lists at the side.
  **Pocket Handheld** (Pokémon Gold / Silver style, best with Single mode): the foe's block at the top left (name,
  level, health bar) and the hero's at the right (name, level, health bar with the numbers, a thin blue EXP bar, and
  a violet **MP orb** that empties as magic is spent). Under each block are four **spheres**: orange for each fighter
  still to come, dark with a red ✕ for each one knocked out, empty for no one. The commands are a 3 × 2 grid of
  words under the hero's block, the battle log is the text box along the bottom, and the camera starts low behind the
  hero (seen from the back, at the lower left) looking at the foe (upper right). The other cameras still work.
  Each side's block is half the screen wide (everything in it grows and shrinks with the screen, keeping its shape);
  the command box stays one size, the chosen command boxed and marked ▶. With one foe out there's no choosing a
  target. Like the handheld games, the **text box** types the battle out a line at a time: a move is announced
  ("Jordan attacks with Double Slash!", "Green Slime attacks!") and, after a short pause, happens (no button); what
  follows waits for OK (▼): "A critical hit!", "It's super effective!", "It's not very effective…", "Green Slime
  was defeated!". **Items** open two lists side by side: the party (the one out in gold at the top, then the bench, so
  benched heroes can be healed too) and the foes; harmful items list the foes first. Left / right between them, up /
  down to choose. A hit plays out in order: the attacker strikes and steps back, the target flashes and its health
  drains (the numbers count down with it), and the battle waits for that before the next line. With **Rounds** (and
  Single mode), burn and poison bite at the end of each round, a line each ("Jordan is hurt by poison!"); a fighter
  who can't act says so ("…is fast asleep!"), and one that wears off says that too. EXP is told and the bar filled
  once, after "Victory!" (everyone who fought a foe shares its EXP, even if swapped out since), each hero in turn: the
  total (and how much was bonus), the bar running through any level it passes, then that
  hero's level up (nothing moves the bar before "Victory!"). An ailment taking hold gets its own line that waits for
  OK ("Jordan was poisoned!"). While a hero out fighting is in the red, a soft two-note alert loops (it stops when
  the foes are down, they're healed, or they're swapped for someone who isn't). The loot
  lines show the coin or the item's icon ("+10 Gold!"). An **ailment** shows as a pill beside the name and level (PSN on purple, BRN on orange…; Database →
  Combat → Status pills switches to full words, POISONED, and sets each pill's colour, text colour, tag and word);
  only buffs show over the fighter's head. A fighter has **one ailment at a time** in turn-based battles: one that's
  poisoned can't be burned until it's cured or wears off (Chill and the Frozen it leads to count as one; Zombie
  replaces the rest). Ailments **last after the battle** into the next one, until they wear off there, an item cures
  them or the party rests (each ailment can be set not to: Database → Combat → Ailments → Lasts); they show on the
  Party and Status pages. Elements show as pills with their circle and symbol docked on the left end. An Addition's ring
  appears in the middle of the screen. Damage numbers show on the fighters only (and the EXP bar fills as each foe falls). The end of a
  battle: "Victory!" with the fanfare (the victory tune follows), then each hero's EXP in one window (what they earned,
  and under it the bonus), the loot, and each level up with a ding and a box of what it brought. A hero who reached a
  new form transforms after the screen fades out, before the map fades back in. The box moves to the
  middle while there are no commands beside it; Y opens the full battle log. There's no results screen: the EXP bar
  fills as each foe falls, and at the end the box tells the rest ("Katrina gained 30 EXP from sharing experience!",
  "Katrina reached Level 2!", then "Katrina grew stronger!" with a box of what the level brought, then the loot). The
  other two layouts keep the EXP and loot screens.
- **Choosing a target**: enemies are one row and the party another. Left / right move along the row; up / down
  change rows.
- **Commands** (Legend of Dragoon style): a row of pictures, Attack, Guard, Magic, Items and Escape; left / right
  choose. Any fighter can be targeted with an attack, a spell or an item (the usual side first; keep pressing left /
  right to reach the other side): heal a friend, or use a potion on a zombie to hurt it. Spells that hit a whole
  group can be switched to the other group. The arrow over the target shows their health: **cyan** above half,
  **yellow** at half or less, **red** at a quarter or less. Enemies' names and health bars are over their heads.
- **Into battle**: a sting, everything freezes, and the picture breaks into black: **shatter, swirl, smudge,
  blinds, rush in** or **flash**, with a rising swell. Map settings → Battles → *Battle transition* picks one, or
  several to choose from at random (none picked: any).
- **Victory**: a fanfare, then the victory tune. Each hero's EXP bar fills in turn (a level up dings and lists what
  it brought: Max HP, stat and skill points), then the **Spoils**: gold and each item with a sound for its kind
  (coins, a cork and slosh for potions, a chime for key items, a clunk for materials, steel for gear). OK hurries
  things along; **B** (Esc) at the end fades the battle and its music out and the field back in.
- **Battle maps** (FFX / Legend of Dragoon style): a battle can be fought on a map you've made (a forest clearing,
  plains, a city street). Make a map and tick **Battles → This is a battle map** in its settings (or choose *Battle
  map* when making a new map); battle maps are listed apart in the map list. On the **Spawns** layer (key 9) of a
  battle map, place **party markers** (P1 is the hero, then the party in order) and **enemy markers** (E1, E2…). The
  camera stands behind the party looking at the enemies, so put the party near the bottom of the map and the enemies
  above them. *Camera back / up / side* and *View angle* fine-tune it. Then choose where battles are fought: a field
  map's **Battles → Battle map**, a zone's **Battle map** (Spawns layer), or the **Start battle** command's *Battle
  map* (boss arenas). Without one, battles use the flat battle screen. On the stage, attackers dash to their target,
  Additions keep the hero at the foe for the whole string, spells flare in their colour, and the fallen sink away
  (enemies) or fall (heroes). `battle_forest` is a sample.
- **Troops and encounter zones**: **Database → Troops** are groups of enemies that fight together (each enemy with
  *at least* / *at most* how many, their own battle music, and *can't run*). On a map, the **Spawns** layer (key 9)
  paints zone letters A, B, C… on tiles, like the Height layer paints numbers. Pick a letter and, below it, set the
  zone's name, tiles between battles and its troops: each with *how often* (a weight) and optional conditions:
  **day or night** (game clock), **real-world days of the week** (the player's computer clock: a Friday-only
  troop, say) and a **switch** that must be ON. Unpainted tiles have no random battles (unless the map has its own
  Random encounters list, which still applies outside zones).
- **Turn order**: *Conditional turns (FFX)*: fast fighters (**Agility**: the heroes' stat, and Database → Enemies →
  Agility for enemies) act more often, and light actions (Guard, Items, a failed Run) bring the next turn round
  sooner. The bar on the right shows who's coming up, and changes as you move through the commands, like FFX.
  *Rounds (classic)*: everyone acts once a round, fastest first.
- **Commands**: **Attack** (the equipped weapon; a bow if there's no melee weapon), **Magic** (the spell shard in the
  magic slot; healers also have *Heal*), **Items** (consumables from the bag, on anyone in the party; cures work on
  battle ailments), **Guard** (Legend of Dragoon style: half damage, a little health back (*Guard heals %*, default
  10) and no new ailments until your next turn) and **Run** (more likely when the party is faster; never from a boss).
  Elements, weaknesses, immunities, absorbing, critical hits and Defence / Magic Defence work as on the map.
- **EXP** goes only to those who fight, as each foe falls ("Jordan +15 EXP" rises at the bottom left): everyone
  fighting then gets its EXP. Bonuses (Database → Combat → *EXP bonuses*, in % of the foe's EXP): the **finishing
  blow** (+25%), finishing it with a **weakness** (+10%), each **Addition strike** landed (+4%, twice that for a
  perfect one, shown as it lands, like Legend of Dragoon's SP), an Addition **completed** (+10%), and **no KOs** in
  the battle (+10% of what each earned). The victory screen shows where each hero's EXP came from. Those on the
  bench get nothing, unless they wear an **EXP Share** (an accessory: Database → Items → *EXP Share %*) or the party
  holds an **EXP All** key item switched on (Key items → Turn on / off; *EXP All %*): then they get that percent of
  the foes' EXP. A hero swapped in partway earns from then on; one knocked out keeps what they'd earned.
- **Winning** gives gold and drops straight into the bag (a full bag leaves them on the ground) and runs the beaten
  enemies' page commands. The hero you play, knocked out in a won battle, gets back up with 1 HP; other party members
  stay knocked out (and out of sight on the map, no longer following) until something heals them: a **revive** item,
  resting at an inn or a campfire, or the *Full rest* event command. Health never comes back on its own.
- **Level-up items** (Database → Items → a consumable → *Level up*): like Rare Candy, used from the bag the hero gains
  exactly the EXP to their next level (that many times), with the level up as usual.
- **Revives** (Database → Items → a consumable → *Revives*): bring a knocked-out hero back with what the item restores
  (at least 1 HP), from the bag or in battle. A revive only works on the knocked out, and other items can't help them
  (healing items say "only a revive can help").
- **Using items** shows it happening: in the bag's "Use on whom?" the bar fills and the numbers count up, then a line
  ("Katrina recovered 30 HP!") waits for OK; in battle (Pocket Handheld) "Jordan used Potion!", the bar fills, then
  "Jordan recovered 60 HP!" waits for OK.
- **Buffs and debuffs** (Pocket Handheld): arrows with the stat under them beside each block's spheres (▲ STR in green,
  ▼ SPD in red), and the same beside names when choosing whom to use an item on and in the Swap list. The Swap list
  shows each hero's face, name, buffs, and their health, magic and EXP bars.
- **Single battle mode** (Database → Combat → *Battle mode: Single*; Pokémon-style): one hero is out at a time,
  against one foe (or a full troop). Each round the hero picks first, then both sides act, the faster first (Agility,
  Haste and Slow decide; the log says who moves first); there's no turn order bar. **Swap** brings in another hero:
  it goes first, and the newcomer takes that round's hits. Items, Guard and Escape also go first. When the hero is
  knocked out, the player picks who steps in at once; the party falls when everyone who can fight is down (passing
  out and respawning, as usual). *Heroes who fight (Single)* sets how many of the lineup can be swapped in (1 – 4).
  How foes come out: a **wild encounter** (one of them, picked at random; an enemy bumped into on the map fights
  alone), a **trainer battle** (one at a time, the next stepping in as each falls, up to 4) or a **swarm** (all at
  once, as a group fight, three at most). Each battle uses the first of these that's set: the troop's *In Single
  battle mode* (Database → Troops) or the Start battle event's *In Single battle mode*; then the map's *Single mode:
  battles here are* (Map Properties → Battles); then Database → Combat → *Single mode: battles are* (a wild encounter
  unless changed). So every random battle, troop and event battle is a wild encounter by default, and only the
  trainers and swarms need setting. EXP, Additions, spells and spell additions work the same.
- **Spell additions** (Database → Spells → *Spell addition*): give a spell a button sequence (A, B, X, Y) and, as it
  goes off, the camera holds on the caster while the buttons show in a row with a timer; the player presses them in
  order (keys A B X Y, a controller's face buttons, or the on-screen pads). Each rank above the first adds one more
  button (round the sequence again), so the same pattern can be practised. A wrong button or running out of time ends
  it and the spell goes off weaker (half, plus half for the share pressed right); a clean cast is full strength, up to
  15% stronger the faster it was. Each right button earns a little EXP ("+1 EXP" at the bottom left), a clean cast
  more, and a fast one more again. For Support spells, *A clean cast* makes their buffs stronger, or last longer (a
  turn more, or two more rounds of weather) for whole-battle buffs. *Time to press them* sets the clock (0.8 s a
  button plus 1.2 unless set). With Addition timing on Automatic they play themselves. Enemies' spells just go off.
- **Missing**: weapon hits and Additions can miss (the wielder's accuracy, from Dexterity, times the weapon's
  *Accuracy %* in Database → Items, against the target's evasion). A missed Addition: the hero runs up, no buttons
  show, a big **MISS**, and back they go. Attack spells can miss too: the spell's *Accuracy %* (100 unless set)
  against the target's spell evasion (heroes: from Magic Defence; enemies: *Spell evasion %*). *Never misses* on a
  weapon or spell skips it. Buffs and debuffs for **Accuracy** and **Evasion** (and *Accuracy down* / *Evasion down*,
  a Sand Attack) change the odds. A dodge is a quick sidestep ("Dodged" for the party).
- **Enemy levels**: each enemy's numbers are for its *Level* (Database → Enemies; 1 unless set). Spawns can roll a
  level from a range: a painted zone's *Enemy levels* (Spawns layer; each troop in it can set its own), the older
  random encounters list, and an enemy event (*Its level*). Each level above its own adds *Health*, *Damage*,
  *Defence*, *EXP* and *Gold* by Database → Combat → *Enemy levels* (12%, 7%, 6%, 12%, 8% a level); below takes them
  away. Levels show beside enemy names in battle ("Lv 5"). The event command **Enemy levels** switches the map to
  **dynamic** levels: spawns come out near the party's average level, a couple either side (*Either side*), until
  another switches it back to *As set*. Bosses and battles started by events keep their own.
  **Losing** sends the party back to the respawn point, as dying on the map does. Running away leaves the enemies
  on the map; they lose track of the hero for a moment.
- **Tuning**: *Party damage ×* and *Enemy damage ×* scale each side's hits; *Safe after a battle* stops a new
  battle starting straight away. The map's **battle music** plays during battles (the built-in battle theme if the map
  has none).
- Controls: arrows / D-pad move, OK picks, Cancel goes back; on a tablet, tap a command, then tap the target.
- **Ailments in battle** run on turns instead of seconds, counted on the afflicted fighter's own turns: Burn (8% of
  their health at the start of each turn, 3 turns), Poison (5%, 5 turns), Chill (slower turns; three freeze),
  Frozen and Paralyze (lose a turn), Sleep (lose turns until hit, up to 3), Blind (half their attacks miss),
  Silence (no Magic), Confusion (attacks anyone, friend or foe), Stagger (the next turn comes later) and Zombie
  (healing hurts, all battle). Weapons and enemies give them with the same *Ailments its hits can give* settings
  as on the map (a time set in seconds becomes about one turn per 3 seconds); bosses shake them off in half the
  turns. Icons show over each fighter and beside party names. The hero brings their ailments from the map into a
  battle; battle ailments end with the battle. A hero's **Endurance** gives a chance to shrug an ailment off
  ("Resisted"); enemies have *Ailment resist %* in Database → Enemies.
- **Buffs and debuffs in battle** last a few of the fighter's own turns (3 unless set), or the **whole battle** (tick
  *or the whole battle* beside the turns, like a Pokémon speed or critical-hit boost), and show as icons with turns
  left ("all battle" for whole-battle ones): raised Strength, Dexterity, Agility, Endurance, Defence, Magic, Magic Defence or critical hits,
  **Regeneration** (health back at the end of each turn), **Haste** (turns come round half again as often) and
  **Slow** (turns come round much more slowly; a debuff), and **Stat guard** (like Guard Spec: while it lasts nothing
  lowers their stats: Slow, Accuracy and Evasion down, or a stat lowered all bounce off as "stats won't go down!";
  boosts still land). Haste and Slow cancel each other out. A Slow cast on the
  other side can be shrugged off with Endurance or warded off by guarding. They come from **items** (a consumable's
  *Buffs it gives*: seconds on the map, turns in battle), **spells** (*Buffs it gives in battle*; the **Support**
  kind does only that, on the caster's side, the other side, or **either side**: the caster picks, so Haste can
  speed up a friend or undo a foe's Slow) and **enemies** (a *Buff* action, below). The
  built-in spells include **Haste** and **Slow** (either side), learned from Quicken and Hinder in the Magic tree,
  and **Rain Call** (not in a tree yet: give it from the console or a skill).
- **Battle weather**: a battle starts in the map's weather when it's falling outdoors (rain, thunderstorm, snow,
  blizzard, sandstorm), shown as a badge at the top. **Rain** makes water moves half again as strong and fire ones
  half as strong; a **Thunderstorm** strengthens shock and water; **Snow** and a **Blizzard** strengthen water
  (ice) and weaken fire; **Harsh sunlight** strengthens fire and weakens water; a **Sandstorm** strengthens earth.
  A spell (any kind) or an enemy's Buff action can bring its own weather with *Battle weather it brings*, for a
  number of rounds (5 unless set; 0: the whole battle), and it falls around the battle; when it wears off the
  map's weather comes back. A Support spell with only weather needs no target. On the map,
  Haste and Slow change walking speed. Buffs from the map stay on the map. Each hit can also **miss** ("Miss"):
  accuracy against dodging (see *Seven stats*); enemies have *Accuracy %*, *Evasion %* and *Critical hit %*.
- **Impact materials** (Database → Enemies → *Impact*): each enemy is made of something (flesh, plant, metal,
  stone, wood, bone, liquid, gel / slime, crystal, spirit, cloth), which sets the sound a sword or arrow makes hitting
  it (a squish, a vine chop, a metal ding, a stone crack…; *▶ Hear it*), and up to two effects that fly off it: blood
  (recolour it for ooze, sap or ichor), sparks, stone bits, wood chips, a water / gel splash, bone shards, crystal
  shards or wisps. Unset, slimes are gel, the undead bone, golems stone, ghosts spirit and the rest flesh.
  **Critical hits** shake the screen with a big **CRITICAL!**, a crack and a rumble; **weak** hits show a big
  **WEAK!** and **immune** ones a big **IMMUNE**, each with a soft thump.
- **Battle log**: what happened, line by line, down the left side. **Y** (key or controller) picks it: ↑ ↓ scroll
  back through the battle, Y or Back lets go. On a tablet, touch it and scroll.
- **Monster stat blocks** (Database → Combat → *Monster stat blocks*): a block per foe across the top, like the
  party's cards: its picture, name, element (or Normal) and health and magic bars (magic greyed out when it has
  none); the names and bars over the foes go. Choosing a target glows its block in its element's colour (two
  elements blend left to right; Normal is gold to tan), with arrows above and below it (and still the arrow over its
  head). A fallen foe's block fades out. A **boss** can have an **Overdrive gauge** (Database → Enemies, under Boss)
  along the bottom of its block: it fills as the boss is hurt (and a little each of its turns); full, its next move
  hits half again as hard.
- **Enemy actions** (Database → Enemies → *Turn-based battles*): besides its plain attack (*how often*, 0 for
  never), an enemy can have actions: **Attack** and **Spell** (its damage × power, on one of the party or all of
  them, with their own element and ailments), **Heal** (itself or a hurt friend, % of their health) and **Guard**
  (enemies only guard when given this) and **Buff** (raises its own stats or every enemy's, or casts a debuff like
  Slow on one of the party or all of them; it doesn't use one it already has). Each has *how often* and can be
  limited to *only below health %*.
  **Counterspell** (on an action or the plain attack) will break a spell being charged once spells can be charged.
- **Magic** (turn-based): the hero's **learned spells** (see below). Spells known at more than one rank ask which
  rank to cast: a higher rank hits harder and costs more, and **charges** a turn longer for each rank (the caster
  shows *Fire III · 2* and the turn bar keeps going; it goes off on their turn). Casting is quicker than attacking in
  the turn order. A foe's **Counterspell** hit breaks a spell being charged (the magic is lost), and so does Silence.
  Healing spells can heal one or the whole party; attack spells can hit one or every foe.
- **Additions** (Legend of Dragoon): Attack performs the hero's Addition, a string of 1 to 7 timed strikes. For each
  strike a ring closes on the target; press the button shown (A, B, X, Y, or ★ for any) as it meets the marker.
  Keyboard: the letters A, B, X, Y (Space / Enter for A); controller: the face buttons; touch: the four buttons
  that appear. A miss or the wrong button ends the string (a missed first strike still lands, weakly); perfect
  timing adds 10%. Performing an Addition in full counts towards its next **rank** (more damage, a wider window).
  Each hero has one Addition equipped at a time, set on the **Equipment** page (the Addition row, ← → or Space to
  change it); everyone starts with Quick Strike (or the hero's Default Addition in Database → Heroes). A hero set to
  **No Additions** in Database → Heroes makes a plain attack instead: **Melee** runs in and strikes once, **Ranged**
  fires the bow from where they stand.
  Database → Combat → *Additions*: set per hero on the Equipment page (default), or chosen from a list with each Attack;
  *Addition timing: Automatic* lands every strike by itself (accessibility).
- **Start battle** (event command): a turn-based battle against chosen enemies (bosses, set pieces), in either battle
  system. The event waits for it. Options: may the party run, what losing does (back to the respawn point, or the
  event goes on: a story battle meant to be lost), a variable for the result (1 won, 2 ran, 0 lost), its music.

### Learned spells, Additions and classes

- **Database → Spells**: attack spells (bolts) and healing spells: power and magic cost at rank 1, element, ailments,
  one target or all, the highest rank and what each rank adds (power %, magic %, one more charge turn), and for action
  mode the bolt's speed and range. Built-in: Fire, Frost, Spark (every foe) and Mend.
  **Icon**: *Use its element's icon* (the default), or *Pick an icon* from the built-in set (the Magic group has
  spell symbols: fire, ice, lightning, water, wind, earth, poison, light, dark, arcane, healing, protect, haste),
  with a tint. It shows beside the spell's name in the battle Magic list.
- **Database → Additions**: strikes (power × the hero's attack, button, how long the ring takes, the timing window)
  and mastery (highest rank, completions per rank, damage and window per rank). Built-in: Quick Strike, Double Slash,
  Volley and Crescent Storm (seven strikes).
- **Learning**: a skill-tree skill can teach a spell or an Addition (Database → Skills → *Teaches*; each further rank
  of the skill raises the spell a rank). The built-in trees teach them: Arcana (Fire), Empower (Fire II, III), Frost
  Lore, Storm Lore (Spark), Mending (Mend), Fighter (Quick Strike), Double Slash, Volley and Crescent Storm. Events and
  trainers use the event command **Teach spell / Addition** (to the hero, a party hero or everyone); heroes can start
  with some (Database → Heroes → *Class, spells and Additions at the start*).
- **Classes** (Database → Classes): each class opens skill trees, picked from a dropdown under **Skill trees**
  (*+ Another tree* gives it more, × takes one away). Each picked tree shows a small picture of its skills; click it
  to edit that tree in Database → Skill trees. A hero learns from the trees of their class and of
  every class they've had. Players can't change class; only the event command **Change class** does (a story
  promotion, say). Without classes, every hero sees every tree.
  - **Stat boost**: stats a class gives once, for good, when a hero joins it (their starting class counts): a
    Fighter's Strength and Endurance, a Mage's Magic and Magic Defence. Negative numbers take away.
  - **Weapons and armor**: for each weapon type (swords, daggers, axes, maces and hammers, spears, staves, wands, fist
    weapons, bows, crossbows), each armor type and shields: **Trained** (full effect),
    **Untrained** (weapons hit for three quarters; armor costs the stats set for its type) or **Can't use** (greyed
    out in Equipment for that hero). A weapon's *Type* is set in Database → Weapons and an armor's **Armor type** in
    Database → Gear, or guessed from the name (Leather Armor is light, Chainmail medium, Plate heavy; a Short Sword
    is a sword).
  - **Weapon types** (*Edit weapon types…* under the table, or ☰ beside a weapon's Type): built in swords, daggers,
    axes, maces and hammers, spears, staves, wands, fist weapons, bows and crossbows. Rename them, remove some, or add
    your own (Katanas, Whips, Guns…) with the words that pick them from an item's name ("katana, nodachi"); every
    class's table gets a row for each.
  - **Training in the skill trees** (Database → Skill trees → a skill → **Trains with**): learning the skill makes its
    hero Trained with those weapon types, armor types or shields, whatever their class says (even "can't use"): Bow
    Training, Heavy Armor Training. In the Party tree it trains everyone.
  - **Armor types** (*Edit armor types…* under the table, or ☰ beside an armor's Armor type): built in **Light**
    (cloth, leather; untrained −2 AGI), **Medium** (chain, scale; −4 AGI −2 DEX) and **Heavy** (plate; −7 AGI −3 DEX).
    Rename them, change what each costs untrained (any of the seven stats), or add your own (Robes, Mail, Bone…);
    every class's table gets a row for each. Pickaxes and mining hammers are tools anyone can use. Arms
    Training in the skill trees still decides medium and heavy weapon training as before.
- **Menu → Party → a hero → Magic** lists their spells; **Equipment → Addition** picks the Addition Attack uses (with
  its rank).

### EXP orbs and loot on the ground

Defeated enemies don't hand over their rewards at once: they spill them onto the ground around them.

- **EXP**: under 10, small single orbs (one per point); 10 or more, **large orbs** of up to 50 each (75 EXP is a
  50 orb and a 25 orb).
- **Gold**: under 10, single **coins**; 10 or more, **coin purses** of up to 100 each (130 gold is two purses).
- **Items**: each stack lies on the ground as its icon.

Orbs, coins and purses drift to the hero when they come near and are absorbed (a burst shows as one "+N EXP" and one
"+N G"). Items are picked up by walking over them. If the bag is full, a **BAG FULL** alert offers to open the bag so
the player can drop something; the item stays where it is (walk away and back to try again). Bag →
**Drop** (one, or the whole stack) puts it down by the hero's feet: it lies there dimmed for a few seconds (and
until you step off it), then brightens and can be picked up again by walking over it.

- **Saving** collects everything still lying around (anything that still doesn't fit stays on the ground).
- **Leaving the map**: EXP and gold are collected; **key and quest items** come along; other items **vanish**
  (the log says what was left behind).
- Starting a new game, loading a save or quitting to the title clears it.

### Breakables (crates, boulders, crystal switches)

Events can be **breakable**: the hero can lock on to them and hit them with the sword, arrows or spells, a health bar
shows once they're hit, and when their health runs out they shatter and the page's commands run. Use them for
puzzles: a crystal switch across a gap that lowers a bridge (*Set switch* `bridge_down`, and the bridge event's
page shows up on that switch), a cracked boulder blocking a cave, crates with something inside.

- **Create breakable here** (Events layer, on an empty tile) makes a crate whose commands set a switch, and a second
  page showing rubble once it's set. Change its sprite to **Cracked boulder** or **Crystal switch** (new built-in
  sprites), add your own commands, or tick **Breakable** on any event page (Behaviour).
- **Health** and **Defence** (softens each hit like armour), the **name** over its health bar, and **Broken by**:
  melee, arrows, magic. Attacks it doesn't take show *No effect* (a crystal only magic reaches, a rope only arrows).
- Broken things stay broken while you're on the map; to keep them broken after leaving, set a switch in their
  commands with a later page for it (the helper does this).

### Quick items

Four quick slots (Update 132), laid out like the D-pad (bottom right): **←, ↑, → and ↓** on a controller, **5, 6, 7
and 8** on a keyboard (rebindable), or tap them on a touch screen. They take consumables and **key items** with a use
(Cut, Bow, a lantern, Change time…; key items show no count). A new game puts the starting key items on the free
slots. On a controller *Release target* moved to the left stick (press). In the bag, pick a
consumable or key item → **Quick slot…** and choose a slot (it shows a small arrow badge in the bag). Each slot shows the item and
how many are left; it stays assigned when they run out (greyed out) and fills again when you get more. An item that
would do nothing (health already full) isn't used up. The HUD arranger can move and resize the slots.

### Footsteps

The hero's footsteps sound like the ground: grass, dirt and paths, stone, wood floors and bridges, sand and gravel,
snow, carpet, metal, and splashes in shallow water. Running is louder and quicker, sneaking soft (quieter still with
the Light Step skill), and landing from a jump thuds. Each tile's sound is guessed from its name; change it in
Terrain → the tile → **Footsteps** (built-in and imported tiles, *Silent* for none). The sounds are made in code, like
the other effects, and can be swapped for your own files in Database → Audio (*Footstep: grass* and so on).
Settings → Sound → *Footsteps* turns them off.

### Adventure log

A short feed of what's happening, bottom left: hits given and taken, defeats, loot, EXP, level-ups, items received
from events and notices. Each line fades after a few seconds (a repeat just counts up: "×3"). The pause menu's
**Adventure Log** has the whole session, newest first, with the in-game time. Settings → *Adventure log* shows
everything, everything but hits, or nothing on screen; the HUD arranger can move and resize it like the other pieces.
Lines start at the left and wrap inside the log's box (the oldest go when it's full).
Database → Title & menus can rename or hide the menu entry.

### Quests

- **Database → Quests**: each quest has a name, **main** (★, listed first) or **side**, who gives it and where, a
  description, its **objectives** and its **rewards** (gold, EXP, skill points, items). Objectives are:
  - **Task**: ticked off by an event (talk to someone, open a gate…). Give it a count above 1 to count it up in steps.
  - **Defeat enemies**: beat a number of one enemy type (counted while the quest is in progress).
  - **Collect items**: carry a number of an item. It's counted from the bag, so selling or using them undoes it.
  - **Reach a map**.
  Any objective can be **optional**. *One at a time, in order* shows (and counts) only the current objective.
- **Finishing**: a quest either *completes by itself* when the last objective is done, or waits, **ready to hand in**
  (the log says "Return to Mira", or your own line), until an event completes it. *Completing it takes the items*
  takes what its collect objectives asked for. Rewards that don't fit in the bag are put down by the hero's feet.
- **Events**: the **Quest** command starts a quest, completes or counts up an objective, completes the quest (gives the
  rewards), fails it, or forgets it (back to not started). Conditions (in branches and on event pages) can check a
  quest's state (not started, in progress, ready to hand in, completed, failed) or one objective. *Quietly* skips the
  banner.
- **In game**: a banner and a jingle when a quest starts, is ready to hand in, completes or fails; every step goes in
  the adventure log. The **tracker** (top right, under the clock) shows the followed quest's objectives with their
  counts; the HUD arranger can move and resize it. The pause menu's **Quest Log** lists quests in progress, completed
  and failed, with the story, objectives, status and rewards; Enter (A) or *Follow this quest* picks the one the
  tracker shows. A new quest is followed automatically when nothing else is. Quests are saved with the game.
- The sample map has a main quest (talk to Mira, then rest at the campfire) and Mira's side quest, *Slime Trouble*
  (defeat three green slimes, then go back to her).

### Skill tree

Each level gives a **skill point** (and a new game starts with one; quests can give more with the **Give skill
points** command). Spend them in **Party → a hero → Skill Tree** (each party member has their own), laid out like Skyrim's constellations: a skill
opens once at least one rank of the skills it's linked from is learned, and many have several ranks.

- **Might**: Fighter → Quick Hands (Agility) → Steady Guard (Guard heals more); Heavy Blows (melee damage);
  Arms Training (trained with medium weapons: untrained, medium and heavy weapons hit for three quarters) → Heavy
  Arms, and Light, Medium or Heavy Mastery (damage, and critical hits, for that weapon class).
- **Dexterity**: archery (Archer → Steady Draw (Dexterity), Eagle Eye (longer bow lock-on, for sniping), Power Shot)
  and stealth (Shadow (harder to see) → Light Step (quieter), Backstab (critical hits) → Assassinate (level 5: a
  sword strike on an ordinary foe that hasn't noticed the hero ends it, no battle), and Silent Shot (needs Light Step
  and Archer: an arrow from 5+ tiles at an unaware foe wounds it before the battle)).
- **Skills from the real-time battles** (swing, weapon and draw speed, cheaper blocking, sneak attack damage) do
  nothing now. Database → Skills lists any a database still has and **Update them** turns them into Agility,
  critical hits, Dexterity and Guard healing (the sample project's are updated).
- **Magic**: perks that make every spell shard better (see below).
- **Vitality**: Toughness, Endurance and Focus raise max health, stamina and magic.
- **Party**: a tree the **whole party shares**, shown to every hero whatever their class. It has its own **party
  points** (one each time the hero levels up; Database → Combat → *Party skill points per level*, and the **Give
  skill points** command with *Party points* ticked) and is learned once for everyone: party members who join later
  get it too. Fellowship (health and stamina) → Hardy Company (health), Second Wind (stamina), Battle Drill (melee
  damage), Arcane Chorus (spell damage and magic), Thick Skin (Endurance), Quick Step (Agility), Keen Eyes
  (Dexterity) and Shield Wall (Defence and Magic Defence). In Database → Skills any tree can be made a Party tree
  (*Party tree: shared by the whole party*); databases made before it get the built-in one added.

Every tree, skill, rank, cost, level requirement and effect can be edited in **Database → Skills** (add trees and
skills as new abilities arrive). A **LEVEL UP** banner appears at the top of the screen on each level.

### Sound

- **Built in**: every sound effect, six background sounds (wind, forest birds, night crickets, cave drips, stream,
  rain) and five music tracks (title, fields, night, battle, cave) are generated in code, so there's sound from the
  start. They're placeholders to swap for real audio.
- **Your own audio**: Database → Audio → *Import audio file…* (.ogg, .mp3, .wav; saved to `assets/audio/`). Swap any
  sound effect for a file (or make it silent) and pick the title music there.
- **Per map** (map settings → Sound): music, **battle music** (takes over while an enemy is hunting the hero and
  fades back after), background sound, and a night background sound for outdoor maps.
- **Events**: Play sound effect, Change music, Change background sound (each lasts until the player leaves the map).
- **Settings → HUD**: *Hero bars* long (across the top) or condensed (a card with the party's), *Show hero bars*,
  *Show party bars*, and *Faces* beside the bars.
- **Settings → Sound**: **Master volume** (50% to start), music, sound effects, background sounds, **menus and text**, and **fanfares and chimes**. Browsers only allow sound after the first
  click or key press, so the title music starts then.

### Field uses: key items (Light, Water Walk, Dash, Cut…)

Overworld abilities come from **key items**: the built-in **Lantern** (Light) and **Strider Boots** (Water Walk).
Pick one in the bag (**Key items** tab) and choose **Turn on** / **Turn off**, or put it on a **quick slot** (the
D-pad; Update 132 replaced the B button for key items) to switch it on and off from there. Only one is on at a time;
they cost no magic. Set them up in **Database → Items**: Kind *Key / quest item* → **Field use**:

| Use | What it does |
| --- | --- |
| **Light** | A glow all around the hero: a **lantern**, a flickering **torch** or an **orb** floating by them. Colour, brightness, reach and shadows are set per item. |
| **Water Walk** | Water of any depth is solid ground: no swimming, no stamina. Switches off by itself when the hero steps back on land. |
| **Sprint** | Update 137: switch it on and off (bag or a quick slot); while it's on the hero runs, even before learning to. Saved with the game. |
| **Swim** | Carried: the party can swim in deep water (same as *Lets the party swim*). |
| **Climb** | Carried: the hero can climb climbable walls, even before learning to. |
| **Cut** | On a quick slot: each press swings it, cutting vines and thin trees and breaking crates for a fixed **Damage** (set on the item, 10 by default). A foe it reaches starts a normal battle. Built in: the **Machete**. |
| **Bow** | On a quick slot: hold to draw, let go to shoot (fixed **Damage** for a full draw, half for a quick shot). Lock-on aims it at switches and targets. Built in: the **Hunting Bow**. |
| **Fire Bow** | Use it facing a fire that's out to light it for an hour (no fuel), or facing vines to burn them. |
| **Smash Stone** | Use it facing a boulder or ore vein to break it in one blow (no pickaxe). |
| **Change weather** | Outdoors: brings the weather set on the item, or (unset) the player picks from a list. |
| **Change time** | Unset: a pop-up sets any time (four digits moved up / down, AM / PM; ← → to pick, controller friendly). A bubble forms round the hero while the world fast-forwards (fires burn down, the sky turns), then pops at that time. Set on the item: goes to that hour the same way. |
| **Change season** | Outdoors: brings the season set on the item, or (unset) the player picks one (*Follow the calendar* undoes it). Saved with the game. |
| **Start fishing** | Use it facing a fishing spot to cast; works as a basic rod. |
| **Ride horse** | Calls your horse to you and gets on (riding: gets off). Can bring a horse of its own the first time (a whistle). |
| **Skeleton Key** | Carried: opens any lock, even ones that can't be picked. |

Carried uses just work while they're in the bag; the others are used from the bag (the use's name in the item's
menu) or from a quick slot. The built-in Machete and Hunting Bow are added (and put in the starting bag) once, when
the game has no Cut or Bow key item.

- While one is on the hero glows (gold for Light, blue for Water Walk). Over deep water the hero is put back on the last bit of shore.
- A lantern on a quick slot switches on and off from there; the HUD's spell box lights up while one is on.
- **Older databases**: spell shards that carried Light or Water Walk become these key items when the database loads
  (a shard still named *Light* / *Water Walk* becomes the Lantern / Strider Boots); choosing a field use for a shard
  in the editor makes it a key item too. Older still: Light and Tide rings (open the editor and Save to keep the
  change); cutting rings are removed (sword swings cut vines). Saves wearing one
  in the ring slot move it to the magic slot. There's no Ring slot any more: rings with stats are accessories.
- **Cuttable props**: tick *Can be cut down* in a prop's importer (or *Customise* for built-ins); a sword swing cuts
  them. Built in: **Vines (cuttable)** and **Sapling (cuttable)**.

### Mining and forging

- **Mining**: swing a weapon that *Breaks rock* (Database → Items → a weapon; the built-in **Pickaxe** does) at a
  mineable prop. Each blow chips it; the last breaks it open, leaving rubble and spilling what it gives (stone, ore),
  which can be picked up a moment later. Other weapons bounce off. Built in: **Large boulder** (stone), **Iron vein**
  (iron ore, sometimes extra) and **Gold vein** (gold ore). They're back the next time the player comes to the map.
  Any prop can be made mineable: its importer (or *Customise*) → Behaviour → *Can be broken: Mined*, with the
  number of blows, what it leaves behind, and what it gives (each with a chance in %).
- **Forges**: the **Anvil** prop (or any prop marked *Is a forge*). Facing it, the action button opens the forge:
  - *Smelt ore*: ore into ingots (Database → Items → an ore → *At a forge, smelts into*; two ore make one by
    default). Two Iron Ingots make a Steel Ingot.
  - *Upgrade*: weapons and armor are made of a **material** (an ingot: Database → Items → *Material*). Each upgrade
    takes ingots of it (+1: one, +2: two…) and adds a few percent of damage or defence (Database → Combat →
    *Forges*: how many upgrades, and the percent). The item shows as *Longsword +2*.
  - Shards aren't set in gear any more: heroes wear element stones instead (older saves take any set shard back out,
    free in the bag).
  - Upgrades apply to every copy of an item, and are saved with the game.
- Fire (a fire spell, arrow or weapon) **burns away** cuttable props (vines, saplings), giving nothing: they catch
  fire, blacken and crumble, with *Burnt!* over them and a line in the adventure log, so it's clear why nothing dropped.
- **Weapon proficiency**: light weapons are ready from the start; medium and heavy weapons swing slowly until the
  hero is trained (Might tree: *Arms Training* for medium, *Heavy Arms* for heavy). Trees without a training skill
  (older copies of the tree) don't slow anything.

### Magic tree

Spell shards are items (found, bought, given by events or quests); the skill tree doesn't hand them out. The
built-in **Magic** tree makes every shard better instead: **Arcana** and **Empower** (spell bolts hit harder),
**Mana Thrift** (every spell costs less magic, including switching on and keeping Light or Water Walk going),
**Radiance** (Light shines further) and **Far Cast** (bolts fly further). Older skills that gave a shard become
spell perks when the database loads; a copied tree gets the new Magic skills with *Reset to built-in*.

### Water styles

Each map has a list of water **styles** (Map editor → **Water** tab), and every bit of water uses one, so a calm
lake, the stream running out of it and a lava pit can share a map. Pick a style, then Fill / Paint with it, or
use **Restyle pool** to change one already placed. **+ New style…** starts from a preset: Pond, Lake, River,
Tropical sea, Muddy pond, Swamp, Poison goo, Lava. Each style sets:

- *Editor mark*: a symbol (~, -, ≈…) drawn on its water in the map editor only, to tell styles of the same colour apart.
- *Colour* and *Clarity* (crystal clear … muddy / thick), *Surface* (glassy … rough), *Current* (still … a fast
  river) with the direction it flows (it carries the ripples along).
- *Look*: **Toon** (the default for water, like the handheld games: a flat colour with short pixel wave lines that
  drift and breathe, carried along by the current; a pale foam outline along every shore; a darker ring hugging each
  rock or prop standing in it) or **Realistic** (lit ripples and soft glints; the default for glowing styles). Toon
  water has *Wave lines* (none … packed; a rougher *Surface* adds a few more) and *Shore foam* (on or off). The wave
  lines are a lighter tint of the water's colour and the foam near white, so recolouring a style recolours them too.
- *Glows*: lava and goo shine in the dark (brightly veined, with light seams drifting with the current).
- *Being in it gives*: an ailment with a chance every half second (Lava burns, Poison goo poisons). Water Walk
  keeps the hero above it.

The surface is calm and matte (no plastic glare). Rings spread around anyone in the water (the hero swimming or
wading, party members swimming) and slowly around props standing in it (a stone, a fallen trunk); on glowing
liquids they take its colour. Swimming has its own stroke sound (Database → Audio: *Swimming stroke*). A map's
older single water look becomes its first style.

### Seasons

- Seasons match the **real world** by default (the player's date: March–May spring, June–August summer,
  September–November autumn, December–February winter; a southern-hemisphere option flips them). **Database → Time
  → Seasons** can make them follow the in-game days instead (days per season, the starting season), or turn them off.
- **Real-world date**: the HUD shows the player's date (and the season) under the game time. Event pages can use the
  condition **Day of the week (real world)**: a market only on Saturdays, a rare enemy on Fridays. A map can have its own season
  (Inspector → map settings → **Season**: follows the days, or always spring / summer / autumn / winter). Indoor and
  underground maps don't change. The playtest panel has season buttons for testing.
- Outdoors everything green follows the season: fresh green in spring, green-gold in summer, autumn's even straw-gold
  grass with each tree and bush turning wholly red, orange or gold (one colour per plant, no patches), and snow in winter
  (grass under it; tree and bush leaves are snow-laden: solid white with their shading, a little blue in the shade so
  they stand out against snowy ground; Update 121: nothing is cut away, so nothing shows through a canopy).
- Props have a **Seasons** setting (prop importer): *keeps its leaves* (pines, bushes, grass, flowers), *bare in
  winter* (oaks and other broadleaf trees) or *doesn't change*. Since Update 121 both of the first two are snow-covered
  in winter. Unset, it's guessed from the name.
- **Bridges and platforms** stand 2 px (1/16 tile) above the banks they join, so they never flicker against the ground,
  water or winter ice under them.
- **Ice**: in winter, still water (no current, not lava or goo) freezes over. The hero walks onto it and slides,
  steering only a little, until a prop, a bank or dry ground stops them. Rivers keep flowing. Going into or out of
  winter, the map is rebuilt with a quick fade.
- **Sound**: map settings → Sound → *In autumn & winter* sets a cold-season background sound; unset, a forest's
  birdsong gives way to cold wind.

### Rivers and drowning

- A water style's **Current** pushes swimmers along the way it flows (waders a little): swimming with it is quicker,
  against it slower, and drifting carries you downstream.
- Running out of health while swimming, the hero sinks below the surface and drowns (a slower fade), then wakes at
  the respawn point as usual.

### Fishing

- **Where**: Map editor → **Water** tab → **Fishing** (key G). **+ New fishing spot** makes a catch table, then paint
  it over water (Erase removes it). A map can have several spots: the pond's minnows, the river's trout, the sea's…
- **What bites**: each spot lists its catches with a **weight** (its share is shown as a %), **when** it bites (any
  time, by day or at night) and whether it's **rare** (a better rod makes rare ones likelier). Any item can be on
  the list (junk too: the Old Boot).
- **The rod**: an item marked **Fishing rod** (Database → Items → Fishing), with a **power** of 0 … 100 (sooner bites,
  a little longer to react, more rare catches). The best rod in the bag is used. Items can also be marked as a
  **fish** with a usual length: each catch is a little bigger or smaller, and Records keep the biggest.
- **In the game**: face a fishing spot from the bank and press **Talk / interact** (A, Enter, or the touch Jump button):
  the hero casts and the float bobs on the water, with the odd nibble. When it's pulled under (a "!" and a plip),
  press again quickly to land the catch; too soon or too late and it gets away. Walking off, jumping or getting hit
  reels in. Catches go in the bag (the adventure log says what and how big); Records count fish caught and the
  biggest.
- **Water enemies** (Update 109): tick **Water enemy** on an enemy (Database → Enemies) and now and then a bite is one
  of them instead: a splash, a "!", and a battle starts. Each fishing spot sets the **chance a bite is a monster**
  (10% by default) and which water enemies live there (all of them unless you untick some).
- **Built in** (added to a database once): the Fishing Rod, Minnow (+10 HP), Trout (+30 HP, by day), Night Eel
  (+20 MP, at night), Golden Koi (rare, sells well) and the Old Boot. Sounds: *Fishing: cast / a bite / caught one*
  in Database → Audio.

### Copying events and area events

- **Copy / paste**: select an event and press **Ctrl+C** (or **Copy** in its panel), point at a tile and press
  **Ctrl+V** (or select a tile and click **Paste … here**). The copy keeps everything: pages, commands, size.
  It works across maps too. **Duplicate** puts a copy right beside the original.
- **Area events**: in the Events layer, drag across empty tiles to select a rectangle, then **Create event over
  these tiles** or **Create transfer over these tiles**. It's one event; stepping on, talking to or bumping into
  any of its tiles counts. Change its **Width / Height** in the event panel; drag it by any tile to move it.
- Events can't overlap. Transfers show an arrow on the map.

### Map transfers

In the Events layer, click a tile and choose **Create transfer here**: it makes an invisible event that runs when
the player steps on it, and opens the **Transfer player** command. Pick the destination map, click the spot on
the picture of that map, choose which way the player faces and the fade (black, white or none).

You can also add **Transfer player** to any event (after a conversation, say, or behind a door that needs a
switch). It ends the event, so put it last. Switches, variables, abilities, health and the time of day carry
over between maps. For a two-way doorway, make a transfer on each map.

▶ Playtest hands every map in the project to the game, so transfers work with unsaved changes too.
Losing all health now sends the player to the player start even when it's on another map.

### Database: player stats

**Copying entries**: every Database list (items, enemies, heroes, quests, troops, spells, Additions, classes,
achievements, text boxes) has **Duplicate** beside Delete; right-click a row for **Duplicate / Copy / Paste**, or use
**Ctrl+D / Ctrl+C / Ctrl+V** (⌘ on a Mac). The copy gets its own id and “(copy)” on its name and lands under the
original. Copies also go to the system clipboard, so an enemy can be pasted into another project's Database.

**Database** in the top bar opens the game-wide player settings (saved in `database.json`, only values that differ
from the defaults):

- **Health, magic and stamina**: maximum, how much each regains per second, and *Does not regenerate
  automatically* for each. By default health doesn't regenerate (only items and events heal); magic and stamina
  refill on their own. Everything starts full.
- **Stamina costs**: run, climb and swim per second, jump per jump. At 0 stamina the player can only walk (and
  crawl) until stamina refills to **Abilities return at** (30% by default). Stamina starts refilling after a short
  rest (**Refills after**). Swimming with no stamina left costs health (**Drowning**).
- **Movement speed** for walking, running, wading, swimming, crawling and climbing, in tiles per second.
- **Starting abilities** (the same switches as on the Passage layer).

In the game, HP / MP / SP bars sit top-right. At 0 health the screen fades and the player comes back at the
player start with full stats (respawn points such as campfires come later). The playtest's debug panel has
test buttons: −25 HP, Empty stamina, Refill.

### Passage layer and abilities

- Paint per-cell movement rules with the brush (shortcut letters in brackets):
  **Climbable (C)**: cliff walls next to it can be climbed (mark the top or the bottom cell);
  **Low clearance (L)**: only passable by crawling; **Wall (X)**: always blocked; **Open (O)**: always passable,
  even under a blocking tile or prop; **Erase (E)**.
- Red crosses show what already blocks a cell (blocking tiles, props, deep water), so you can see what to override.
- **Player abilities at the start** (whole game, saved in `database.json`): Run, Jump, Climb, Crawl. Turn one off
  and unlock it later with the **Change ability** event command.
- How they work in the game:
  - **Run**: hold Shift (or the Run button on a touch screen). Not in water or while crawling.
    Running, jumping, climbing and swimming use stamina (see Database).
  - **Jump**: C (or the Jump button). Clears one step up, a one-tile gap walking, about two tiles running. You can
    jump down at most two steps; missing a jump (into deep water, or a longer drop) puts you back where you jumped.
    No jumping while swimming or crawling.
  - **Climb**: walk into a climbable wall for a moment and the hero climbs up or down it.
  - **Crawl**: walking into a low-clearance cell crouches automatically, at a slower pace.

### Edge blending between tiles

Select a tile in the Terrain palette and click **Edge blending…** (works for built-in and imported tiles):

- **Blend edges**: off gives a straight, hard edge with every neighbour.
- **Priority**: where two tiles meet, the higher one spreads over the lower. Built-in: grass 30, path 20,
  sand 10, lake bed 0. Imported tiles start from their name: grass and snow 32, dirt and paths 22, stone 18,
  sand 14, shallow water 8, water 5 (all with ragged edges); floors, walls, roofs and carpets don't blend (straight
  edges, as built things have); anything else 25. With equal priorities, the tile imported later spreads.
- **Blend width** (0.05 – 0.5 tiles) and **Edge roughness** (an even line → a wandering one).
- **Edge style**: *Ragged* (hard pixel edge), *Dithered* (pixel-art fade) or *Smooth* (soft fade, for smooth
  textures). The edge of the tile that spreads is the one used.
- **Follow texture detail** (imported tiles): bright parts of the texture, like stones, reach further.

The window previews the tile next to any other. Blending shows in the game; the editor map keeps square tiles.
Edges never blend across a cliff or a shoreline. Settings are saved in `assets.json` (`tileBlend`).

### Importing tiles from textures

In the Terrain layer, click **+ Import tile from texture…** (or drop a texture on the preview).

- **Texture**: ideally seamless. Non-square images are cropped to their middle square.
- **One copy covers**: 1 × 1 up to 8 × 8 tiles. Spreading a detailed texture over more tiles hides the repeat.
- **Resolution**: keep the texture's detail, or resample to 16–64 px per tile. **Filtering**: *Point* (crisp pixels)
  or *Smooth*. Draw new tiles at 32 × 32 and import them at 32 px per tile + Point, to match LPC characters.
- **Blocks movement** for water, walls and similar.
- **Normal map** (optional, with *Flip green channel* for DirectX-style maps). Without one, one is generated.

The preview shows a patch of ground covered with the tile, exactly as it will be saved. Files go to
`public/assets/tiles/<id>.png` (and `<id>_normal.png`) and the list to `public/data/assets.json`. Select an imported
tile to **Edit…** or **Delete** it (✎ on its swatch also edits). Deleting turns its cells on the open map back into
grass; other maps show grass where it was used. Imported tiles have hard edges for now; soft blending comes later.

### Editing props

Select a prop in the palette: the panel at the top shows its actions. Each card also has a ✎ button, and clicking a
placed prop (Select tool) shows an edit button in the inspector. Edits change every copy on every map.

- **Imported props:** **Edit…** reopens the importer (reframe, resize, blocking, maps, light). **Delete** removes it.
- **Built-in props:** **Customise…** opens the same window, starting from the built-in art. Saving makes a customised
  copy (marked with a blue dot) that replaces the built-in everywhere; campfires and torches keep their flames.
  **Reset to original** brings the built-in back.
- **Several at once:** tick the box in the bottom-left corner of each card (or **Tick all** beside a section's title),
  then **Edit together…** in the bar at the top. Every setting shows the ticked props' shared value, or *Keep each
  one's own* where they differ; only what you change is given to all of them (for example, three trees and a bush
  all set to *Cross ×*), and each keeps its own picture, size, footprint, light and everything else. Built-ins
  edited this way become customised (Reset to original still works).
- The palette stays where you scrolled while you open, close and save props, and its top (the tools, the chosen
  prop with its buttons, the ticked bar and the import buttons) stays in view while you scroll the lists.

## Controls

Every key and button can be changed in **Settings → Controls** (per player, kept for every save).

| Action | Keyboard | Xbox controller |
| --- | --- | --- |
| Move | WASD / arrows | Left stick (push all the way to run) |
| Run / sprint (hold by default; toggle in Settings → Gameplay) | Shift | A full stick push, or the Sprint key item on a quick slot |
| Talk / interact | Enter | A (when facing someone or something) |
| Jump | Space | A |
| Lock on / next target (switches and targets for the Bow key item) | Tab | RB (LB cycles the other way) |
| Release target | Q | Left stick click |
| Quick slots: items and key items (left / up / right / down) | 5 / 6 / 7 / 8 | D-pad ← / ↑ / → / ↓ |
| Sneak / crouch (toggle by default; hold in Settings → Gameplay) | C | Right stick click |
| Settings (with Save, Load, Quit to Title) | Esc | START |
| Party menu (Party and Journal) | P | X |
| Backpack (items, gear, shards) | I or B | B |
| World map (LB / RB: markers; A: place, move or remove your marker) | M | Y |
| Back (in menus) | Esc, Backspace or X | B |

Update 141: nothing is cast on the map any more (shards are for battles; Light and Water Walk are key items on
the quick slots). Saved keyboard layouts are kept; the controller layout switches to the table above.

In menus the arrows, Enter and Esc always work, and on a controller the D-pad / left stick, A (confirm), B (back)
and LB / RB (switch tabs). Touch screens get Menu, Run (hold, or toggle), Jump and Spell buttons, and the quick
item slots can be tapped. Sneak is on C rather than Ctrl
because Ctrl+W closes the browser tab and a page can't stop it.

## Project layout

```
Map Editor.html           Standalone editor (double-click; built by build:standalone)
Playtest.html             Standalone game page the editor's Playtest button opens
Character Builder.html    Sprite character builder (double-click)
editor.html               The map editor page for the dev server
public/data/              Game data (what the editor creates)
  database.json           Title, start, characters, player stats, items, inventory, menus
  maps/map001.json        Terrain, props, lights and events for one map
  assets.json             Imported props (written by the editor)
public/assets/props/      Imported prop images
public/assets/tiles/      Imported tile textures
public/assets/icons/      Imported item icons
public/assets/audio/      Imported music and sounds
public/assets/characters/ Imported character sheets (Database → Characters)
src/
  main.ts                 Entry point
  game/                   Game loop, player, input, stats, skills, inventory, saves, settings; combat/ (enemies, fighting);
                          battle/ (turn-based battles: rules.ts for turn order and damage, TurnBattle.ts runs a battle)
  audio/                  Sound: the Web Audio player and the built-in sounds, music and ambience made in code
  events/                 Map events (pages, triggers) and the command interpreter
  render/                 Sprite system, textures, post-processing
  world/                  Map data types, tile grid, world building, time of day, fires, fireflies
  art/                    Placeholder art and item icons generated in code
  ui/                     Message window, HUD, menus, bag and shop screens, debug panel
  editor/                 The map editor (canvas, palette, inspector, event and command editors)
  shared/                 Data loading/formatting and the editor → game playtest hand-off
tools/build-standalone.mjs  Builds Map Editor.html and Playtest.html
tools/character-builder/    Character Builder source (build.py makes Character Builder.html)
```

## Map format (`public/data/maps/*.json`)

- **cliffTile** (optional): default cliff wall look, `"bricks"` or an imported tile's key.
- **heights** (optional): one string per row, space-separated heights from −10 to 10 (one step = half a tile).
- **water** (optional): one string per row, space-separated: `.` for none, otherwise the level plus an optional
  type letter (`s` shallow, `w` swimmable, `d` deep; none = automatic) and `@n` for a style other than the first.
  Example: `. . 0 0 -1d 0w@2`.
- **waterStyles** (optional): `{ name, color, murk?, bumpy?, flow?, flowDir?, glow?, ailment?, chance? }` per style.
- **ramps** (optional): `{ "x", "z", "style": "stairs" | "ramp", "dir"? }`; without `dir` it rises toward the
  neighbour one step higher.
- **passage** (optional): one string per row, one character per cell: `.` normal, `c` climbable, `l` low clearance,
  `x` wall, `o` open.
- **terrain**: one string per row, one character per tile. Built-in: `.` grass, `=` path, `:` sand, `~` water,
  Imported tiles get their own character (their `key` in `assets.json`). Older maps' `#` raised tiles are converted
  to grass at height 2, and their `~` water tiles to a dug-out pond with swimmable water (`~` is now "Lake bed").
- **buildings** (optional): `{ "x", "z", "w", "d", "height"?, "wall"?, "roof"?, "roofStyle"?, "ridge"?, "pitch"?,
  "overhang"?, "windows"?, "doors"?: [{ "side": "front" | "back" | "left" | "right", "at" }], "name"? }`. `x, z` is
  the top-left tile, `w × d` the footprint; `at` counts tiles from the wall's left (front / back) or top (left / right)
  end. Left-out settings use the defaults (2.5 tall, plaster, shingle gable, a few windows).
- **encounters** (optional, turn-based battles): `{ "enemies": [{ "enemy": "slime", "weight": 3 }], "steps": 30,
  "min": 1, "max": 3, "terrain": "." }` (random battles while walking; `terrain` limits them to those characters).
- **kind** (optional): `"battle"` for a battle map. Battle maps have **markers** (`[{ "side": "party" | "enemy",
  "x", "z" }]`, tiles, in order) and optionally **battleCamera** (`{ "distance", "height", "side", "fov" }`).
- **battleMap** (optional, field maps): the battle map turn-based battles here are fought on (a file name).
- **zoneGrid** (optional): one string per row, `.` for no zone or a letter `A`–`Z`.
- **zones** (optional): `{ "A": { "name"?, "steps"?, "battleMap"?, "troops": [{ "troop": "slimes", "weight"?, "time"?: "day" |
  "night", "days"?: [5, 6], "switch"? }] } }` (`days`: 0 = Sunday … 6 = Saturday).
- **events**: `{ "id", "name", "x", "z", "w"?, "h"?, "pages": [...] }`; `x, z` is the top-left tile and
  `w × h` the size in tiles (1 × 1 when left out).
- **props**: `{ "type": "oak", "x": 3.6, "z": 1.5, "s": 1.1 }`. Positions are in tiles (x, z is where the prop
  touches the ground). Built-in types: `oak`, `pine`, `bush`, `rock`, `pebble`, `tuft`, `flowers`, `sign`,
  `campfire`, `torch`; imported props use their id from `assets.json`. Campfires and torches carry their own light.
- **lights**: one of
  - `{ "type": "point", "x", "z", "y", "radius", "color", "intensity", "flicker", "schedule", "shadows", "switch" }`
  - `{ "type": "spot", …same…, "dir": "down", "angle": 40, "tilt": 30 }`
  - `{ "type": "area", "x", "z", "shape": "rect" | "ellipse", "w", "h", "feather", "color", "intensity", "schedule", "switch" }`

  `schedule` is `always`, `night` (off by day, fading in at dusk) or `nightBoost` (brighter at night).
  `flicker` is `none`, `fire`, `candle`, `pulse` or `faulty`. With `switch`, the light is only on while that
  switch is ON. For area lights, `intensity` 1 leaves colours unchanged, below 1 shades, above 1 brightens
  (up to 8 area lights per map). Maps from older versions are converted automatically.
- **events**: see below.

## Events

Events work like RPG Maker's. Each event has **pages**. The active page is the last one whose
`condition` is met, and it decides how the event looks, how it's triggered and what it does.

```json
{ "id": 3, "name": "Mira", "x": 11, "z": 16, "pages": [
  { "character": "mira", "facePlayer": true, "trigger": "action", "solid": true,
    "commands": [ { "cmd": "text", "speaker": "Mira", "text": "Hello!" } ] },
  { "condition": { "switch": "met_mira" }, "character": "mira", "trigger": "action", "solid": true,
    "commands": [ ... ] }
] }
```

**Page fields:** `condition`, `sprite` (a prop type) or `character` (from database.json) or `enemy` (from Database → Enemies; its commands run when it's defeated), `breakable` (`{ "hp": 20, "defense": 0, "hitBy": ["magic"], "name": "Crystal" }`: it can be hit and its commands run when it breaks), `dir`,
`facePlayer`, `trigger` (`action` = talk to it, `touch` = step on it, `auto` = runs once when the page activates,
`none`), `solid`, `commands`.

**Conditions:** `{ "switch": "id", "is": true }`, `{ "var": "id", "op": ">=", "value": 3 }`,
`{ "item": "potion", "count": 2 }` (has at least; equipped counts), `{ "gold": 100 }` (has at least),
`{ "quest": "slime_trouble", "is": "ready" }` (`inactive`, `started` = in progress or ready, `active`, `ready`, `done`,
`failed`) or `{ "quest": "first_night", "objective": "rest", "done": true }`.

**Commands:**

| Command | Example |
| --- | --- |
| Show text | `{ "cmd": "text", "speaker": "Mira", "text": "Line one\nLine two" }` |
| Show choices | `{ "cmd": "choice", "options": ["Yes", "No"], "cancel": 1, "branches": [[...], [...]] }` |
| Conditional branch | `{ "cmd": "if", "condition": { "switch": "rested" }, "then": [...], "else": [...] }` |
| Set switch | `{ "cmd": "setSwitch", "switch": "met_mira", "value": true }` |
| Set variable | `{ "cmd": "setVar", "var": "talks", "op": "add", "value": 1 }` |
| Wait | `{ "cmd": "wait", "seconds": 0.5 }` |
| Fade out / in | `{ "cmd": "fadeOut", "seconds": 1 }`, `{ "cmd": "fadeIn" }` |
| Set time of day | `{ "cmd": "setTime", "hour": 21.5, "instant": true }` |
| Change ability | `{ "cmd": "ability", "ability": "climb", "on": true }` (run, jump, climb, crawl) |
| Enable / disable overworld weapons | `{ "cmd": "fieldWeapons", "on": false }`: the field sword and bow greyed out on the HUD with a red ✕ (indoors, towns, restricted areas) until enabled again; kept in saves |
| Unlock achievement | `{ "cmd": "achievement", "id": "SECRET_OF_THE_STONE" }` |
| Run console command | `{ "cmd": "console", "line": "give potion 3" }` |
| Open save screen | `{ "cmd": "save" }` |
| Transfer player | `{ "cmd": "transfer", "map": "map002", "x": 3, "z": 5, "dir": "up", "fade": "black" }` (fade `black`, `white` or `none`; ends the event) |
| Play sound effect | `{ "cmd": "sound", "sound": "levelUp" }` (a built-in name or a file path) |
| Change music | `{ "cmd": "music", "music": "builtin:night", "fade": 2 }` (`""` stops it; no `music`: back to the map's) |
| Change background sound | `{ "cmd": "ambience", "ambience": "builtin:rain" }` |
| Give skill points | `{ "cmd": "skillPoints", "value": 1 }` |
| Start battle | `{ "cmd": "battle", "enemies": ["slime", "slime"], "canRun": false, "lose": "continue", "resultVar": "boss_result" }` |
| Teach spell / Addition | `{ "cmd": "learn", "who": "", "spell": "fire", "rank": 2, "addition": "volley" }` (`who`: '' the hero, '@party' everyone, or a hero id) |
| Change class | `{ "cmd": "heroClass", "who": "", "op": "change", "cls": "mage" }` (op `change` or `unlock`) |
| Quest | `{ "cmd": "quest", "quest": "slime_trouble", "op": "start" }` (op `start`, `objective` with `"objective": "id"` and optional `"add": 1` to count up, `complete`, `fail`, `reset`; `silent: true` skips the banner) |
| Give item | `{ "cmd": "giveItem", "item": "potion", "count": 2 }` (`silent: true` skips the "Received" message; a full bag stops the event) |
| Take item | `{ "cmd": "takeItem", "item": "old_key", "count": 1 }` |
| Change gold | `{ "cmd": "gold", "op": "add", "value": 50 }` (`add` or `set`) |
| Open shop | `{ "cmd": "shop", "name": "Mira's pack", "goods": [{ "item": "potion" }, { "item": "torch", "price": 5 }], "canSell": true }` |
| Change health / magic / stamina | `{ "cmd": "gauge", "gauge": "hp", "op": "add", "value": -10 }` (`hp`, `mp`, `sp`; op `add`, `set` or `fill`) |

Text placed right before a choice stays on screen above the options.
In text, `\v[name]` shows a variable's value and `\s[name]` shows a switch as ON/OFF.

## Notes

- three.js is pinned to **0.149.0**, the version the lighting was tuned on. Newer versions changed how light
  brightness is measured, so upgrading means re-tuning light intensities. That's a planned later step.
- The debug panel (top-left) shows time of day, effect toggles, the light budget, and live switches & variables.
- If an imported prop's image is missing, the game shows a pink chequerboard in its place and logs a warning.

## Roadmap

1. ~~Renderer prototype~~
2. ~~Project structure, JSON maps, events and message window~~
3. ~~Map editor: terrain painting, prop and light placement, event editor, playtest button~~
4. ~~Props from images (importer), point / spot / area lights, light budget~~
5. ~~Custom tiles from textures (point filtering, pixels per tile)~~
6. ~~Height layer, cliff walls, ramps and stairs~~
7. ~~Water levels: shallow, swimmable and deep water, wading and swimming~~
8. ~~Passage layer, and movement abilities (run, jump, climb, crawl)~~
9. ~~Soft tile blending~~, ~~map transfers between maps~~
10. Packaging: Windows app (Tauri); Android (Capacitor) maybe later
11. ~~Respawn points, save / load~~, ~~title screen, pause menu, settings~~
12. ~~Items, bag, equipment, light items, chests and shops~~, ~~magic rings~~
13. Battle system: ~~stage 1 (action combat, enemies, stealth, levels)~~, ~~stage 2 (skill tree, block / parry)~~,
    stage 3 (party: AI companions with their own stats and gear, swapping, wait / follow orders),
    ~~turn-based battles as an option (FFX-style turn order or rounds, random encounters)~~
14. ~~Sound, rebindable controls, Xbox controller~~, ~~quest log~~; plugins
15. ~~LPC characters with full animation sets, Credits screen~~, ~~Buildings~~, ~~fading buildings~~, ~~LPC weapons~~,
    ~~LPC library (tiles and props)~~, ~~adventure / combat log~~, ~~weapon builder~~,
    ~~Character Builder on your PC~~
