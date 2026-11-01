/**
 * Data formats. Everything the editor will eventually create lives in these shapes,
 * saved as JSON under public/data/.
 */

/** Terrain characters: . grass  = path  : sand  ~ water  # raised plateau (height 1) */
export type Terrain = '.' | '=' | ':' | '~' | '#';

export type Dir = 'down' | 'left' | 'right' | 'up';

/** A decoration placed on the map (trees, rocks, flowers…). Positions are in tiles; x/z may be fractional. */
export interface PropFoot { w: number; d: number; solid: string[] }

export interface PropData {
  type: string;
  x: number;
  z: number;
  /** Height the prop stands on (1 for plateau tops). */
  y?: number;
  /** Uniform scale. */
  s?: number;
  /**
   * Layer (Update 144): 0 drawn on top of everything … 25 the ground (the default). Lower layers win where props
   * overlap; it only changes which draws on top, never where the picture is.
   */
  layer?: number;
}

/* ------------------------------------------------------------------ lights */

/** When a light is on. "night" lights fade in at dusk and out at dawn. */
export type LightSchedule = 'always' | 'night' | 'nightBoost';
export type Flicker = 'none' | 'fire' | 'candle' | 'pulse' | 'faulty';

/** Settings every light shares. */
export interface LightSettings {
  /** sRGB hex colour. */
  color: string;
  /** Brightness (point / spot: about 1–4; area: 1 = no change, below 1 shades, above 1 brightens). */
  intensity: number;
  schedule?: LightSchedule;
  /** Only on while this switch is ON. */
  switch?: string;
}

export interface PointLightData extends LightSettings {
  type: 'point';
  /** Position in tiles (x, z on the ground; y height above the ground). */
  x: number; z: number; y?: number;
  /** Reach in tiles. */
  radius: number;
  flicker?: Flicker;
  shadows?: boolean;
}

export interface SpotLightData extends LightSettings {
  type: 'spot';
  x: number; z: number; y?: number;
  radius: number;
  /** Which way the beam points. */
  dir: Dir;
  /** Cone width in degrees. */
  angle: number;
  /** How steeply it points down, in degrees (0 = level, 90 = straight down). */
  tilt: number;
  flicker?: Flicker;
  shadows?: boolean;
}

/** Local tint: colours and lights or shades everything inside a shape, fading at the edge. */
export interface AreaLightData extends LightSettings {
  type: 'area';
  /** Centre in tiles. */
  x: number; z: number;
  shape: 'rect' | 'ellipse';
  /** Size in tiles. */
  w: number; h: number;
  /** Soft edge width in tiles. */
  feather: number;
}

export type LightData = PointLightData | SpotLightData | AreaLightData;

/** Pre-0.2 maps stored campfires and torches as lights; they are props now. */
export interface LegacyLightData { kind: 'campfire' | 'torch'; x: number; z: number }

/* ------------------------------------------------------------------ props */

/** A light carried by a prop. Offset in tiles from the prop's anchor (bottom centre): x sideways, y up. */
export interface PropLight extends LightSettings {
  x: number; y: number;
  radius: number;
  flicker?: Flicker;
  shadows?: boolean;
}

/** A prop type: built in, or imported from an image (stored in public/data/assets.json). */
export interface PropDef {
  id: string;
  name: string;
  /** Image path relative to public/, e.g. "assets/props/lamp.png". Built-in props have none. */
  image?: string;
  /**
   * A 3D model (GLB or FBX, e.g. "assets/props/hut.glb") drawn instead of the picture, fitted to the footprint
   * (render/models.ts); the image is then its rendered icon.
   */
  model?: string;
  /** The model turned this many degrees (0, 90, 180, 270) to face the camera. */
  modelRot?: number;
  /** Built-in props only: key of the art generated in code. */
  builtin?: string;
  /** Only shown on these days of the year ("MM-DD", to "MM-DD" for a range; Update 108): Halloween pumpkins. */
  dates?: { from: string; to?: string };
  /** A bridge or platform piece: walked on at a deck height over water, chasms or lower ground (world/decks.ts). */
  deck?: import('./decks').DeckDef;
  /** A customised built-in bridge or platform set not to be walked on (otherwise it keeps the built-in's deck). */
  noDeck?: boolean;
  /** Optional normal map (same framing as the image). Generated from the image when missing. */
  normal?: string;
  /** Optional night-glow mask: bright pixels glow at night (lit windows). */
  glow?: string;
  glowColor?: string;
  /** Size in tiles. */
  w: number; h: number;
  /** Tiles that block movement, as offsets in tiles from the anchor along x (0 = the tile under the anchor). */
  block: number[];
  /**
   * Its footprint on the tile grid (props set up in the importer): `w` tiles across and `d` deep, and which of them
   * are solid (one string per row from the back row to the front, "#" solid, "." walkable). A prop with a footprint
   * stands on its front edge: placed, it covers whole tiles, its picture rising from the footprint's front edge.
   * Without one (built-ins, older props), it stands in the middle of a tile and `block` says what it blocks.
   */
  foot?: PropFoot;
  /**
   * How it's drawn: a flat card (default); "solid", its outline pushed back `thickness` tiles (default: the footprint's
   * depth) so it looks like a block; or two crossing copies of the picture, "crossX" (at 45°) or "crossPlus" (one side-on).
   */
  shape?: 'flat' | 'solid' | 'crossX' | 'crossPlus' | 'crossStar' | 'rows' | 'thicket';
  thickness?: number;
  /** Props with a footprint: "solid" (default) blocks its solid tiles; "flat" only a thin strip along the picture. */
  collide?: 'solid' | 'flat';
  /** "point" keeps pixels crisp; "smooth" filters them. */
  filter?: 'point' | 'smooth';
  castShadow?: boolean;
  light?: PropLight;
  /** Using it (facing it and pressing the action button) makes it where the player comes back after losing all health. */
  respawn?: boolean;
  /** Sways in the wind: how much (1 for a tree, more for grass, 0 or missing: stays still). The base doesn't move. */
  sway?: number;
  /**
   * Rustles (a shake and a swish) when someone walks through it. Unset: tall-grass shapes (Cross ×, Star, Rows,
   * Thicket) that don't block do, the rest don't.
   */
  rustle?: boolean;
  /** Sits flat against the cliff face behind it (cave mouths, doorways, doors, wall banners) instead of standing in its tile. */
  wall?: boolean;
  /**
   * Drawn in front of the tiles (ground and cliffs in front of it give way, so it never hides behind a ledge). On by
   * default; turn off for props that must sort with the ground as they stand (tall platforms whose legs show through).
   */
  frontOfTiles?: boolean;
  /** Flat mode (Update 139): painted flat on the ground like a 2D game draws it (bedrolls, rugs), not standing up. */
  ground?: boolean;
  /** The layer new copies are painted on (Update 144), 0 … 25 (25, the ground, when unset). */
  layer?: number;
  /**
   * The hero's footsteps on it: a ground sound ('wood', 'stone', 'metal', 'carpet', 'grass', 'dirt', 'sand', 'snow',
   * 'water') or a sound of its own (an imported file or a built-in effect). Unset: the ground's (bridges: their wood
   * or stone).
   */
  walkSound?: string;
  /** Doesn't lean back toward the map camera (stays upright): bridges and flat pieces that look wrong tilted. */
  noTilt?: boolean;
  /** On a wall: stretched to the wall's height wherever it's placed (ladders, vines, waterfalls of ivy). */
  stretch?: boolean;
  /** Fires that burn out: starts unlit the first time the player comes (light it with fuel or a fire attack). */
  startsOut?: boolean;
  /** Weapons cut it down (vines, thin trees); fire burns it away (giving nothing). */
  cuttable?: boolean;
  /** Mining weapons (pickaxes, hammers) break it after `hits` blows (default 3): boulders, ore veins. */
  mineable?: boolean;
  hits?: number;
  /** A forge (an anvil): using it smelts ore into ingots, upgrades weapons and armor, and sets shards in them. */
  forge?: boolean;
  /** After being cut it grows back when the player leaves the map (otherwise it stays cut, saved with the game). */
  regrows?: boolean;
  /** Cut down or mined: the prop left in its place (a stump, rubble), and items it gives (firewood, stone, ore). */
  stump?: string;
  /** Seasons: its leaves change colour (and get snow in winter), it's bare in winter, or it doesn't change. Unset: guessed from its name. */
  season?: 'leaves' | 'bare' | 'off';
  /** `chance`: percent (default 100), for rarer finds (gold in an ore vein). */
  drops?: { item: string; count: number; chance?: number }[];
  /** Fires (props with a flame or light): game hours one burns before going out. Missing: burns forever. */
  burns?: number;
  /** Fires: the prop shown instead while it's out (when the flames are part of this prop's own image). */
  burntOut?: string;
  /** Animated flame drawn over the prop (built-in campfire and torch). */
  flame?: { x: number; y: number; w: number; h: number; embers?: boolean };
  /** Who made the art (props added from the LPC library); shown in the Credits screen. */
  credits?: SpriteCredit[];
}

/** A ground tile type: built in, or imported from a texture (stored in public/data/assets.json). */
export interface TileDef {
  /** The single character that stands for this tile in a map's terrain rows. */
  key: string;
  id: string;
  name: string;
  /** Texture path relative to public/, e.g. "assets/tiles/cobble.png". Built-in tiles have none. */
  image?: string;
  /** Optional normal map. Generated from the texture when missing (unless `flat`). */
  normal?: string;
  /** No generated normal map: the texture lies flat under the lights (pixel-art tiles look cleaner). */
  flat?: boolean;
  /** How many tiles across one copy of the texture covers (1 = every tile shows the whole texture). */
  span: number;
  /** "point" keeps pixels crisp (like Unity's "Point (no filter)"); "smooth" filters them. */
  filter?: 'point' | 'smooth';
  /** Blocks movement (water, walls…). */
  blocks?: boolean;
  /** Built-in tiles only: painted in code. */
  builtin?: boolean;
  /**
   * RPG Maker-style tiles (Update 146): 'animated' a strip of frames (side by side or stacked); 'autotile' RPG
   * Maker's A2 block (2 × 3 tiles) whose edges and corners follow the neighbours, its frames side by side (A1
   * water). Update 148: 'wall' RPG Maker's A3 / A4 wall block (2 × 2 tiles): its sides and ends follow the neighbours.
   * Unset: a plain repeating texture.
   */
  kind?: 'animated' | 'autotile' | 'wall';
  /** How many frames (unset: worked out from the picture's shape). */
  frames?: number;
  /** Frames per second (default 4). */
  fps?: number;
  /** ☆ passage (Update 147): drawn above characters (tree tops, roof edges) and walked under. */
  above?: boolean;
  /**
   * Update 151: an autotile laid out as a frame (one patch's outline, `frameTiles` × `frameTiles` tiles, any tile
   * size) instead of RPG Maker's A2 block.
   */
  layout?: 'frame';
  /** Tiles across a frame picture (the autotile's, or its edges'): 2 (default) or 3. */
  frameTiles?: number;
  /** A frame picture drawn over the tile as a trim along the edges of each patch of it (grass edging, a cliff's rim). */
  edges?: string;
  /** One tile of inside-corner pieces for frames (where a patch turns a corner inwards). */
  corners?: string;
  /** How the corner pieces sit in their picture: meeting in the middle (a dot, the default) or in its outer corners (RPG Maker). */
  cornersAt?: 'middle' | 'edge';
  /** Passage (Update 151): only the cells at the edge of each patch block (walk on top of a raised patch, not off its sides). */
  edgeBlocks?: boolean;
  /**
   * A built-in tile with a picture of your own (kept in the asset list under the built-in tile's key): the picture
   * replaces the painted art everywhere, the tile keeps everything else. False: back to the built-in art (the picture
   * is kept, to switch back to).
   */
  skin?: boolean;
  /** Who made the art (tiles added from the LPC library); shown in the Credits screen. */
  credits?: SpriteCredit[];
}

/** Imported assets, saved as public/data/assets.json. */
export interface AssetRegistry {
  props: PropDef[];
  tiles: TileDef[];
  /**
   * Cliff walls per tile type: tile key → what the walls under that tile look like
   * ("bricks" for the built-in stone bricks, or an imported tile's key). Tiles not listed use the map's setting.
   */
  tileCliffs?: Record<string, string>;
  /** Tiles that are roads (true) or not (false), overriding the default (only the built-in path is a road). Roads continue past the map edge. */
  tileRoads?: Record<string, boolean>;
  /** Edge blending per tile key (built-in or imported). Missing settings use the defaults (see world/blend.ts). */
  tileBlend?: Record<string, Partial<TileBlend>>;
  /** Footstep sounds per tile key ("grass", "stone", "wood"…), overriding the guess from the tile's name. */
  tileSteps?: Record<string, string>;
  /** Update 150: palette groups, tile key → group name and prop id → group name (built-ins too). */
  tileGroups?: Record<string, string>;
  propGroups?: Record<string, string>;
  /** Update 123: tiles that keep footprints (or don't), by key; unset: on for snow and sand. */
  tilePrints?: Record<string, boolean>;
  /** Ailments a tile gives while it's stood on (lava burns, a swamp poisons): a % chance each half second. */
  tileAilments?: Record<string, { ailment: Ailment; chance?: number; seconds?: number }>;
}

/** How a tile's edges blend into its neighbours. */
export interface TileBlend {
  blend: boolean;
  /** Where two blending tiles meet, the higher priority spreads over the lower. */
  priority: number;
  /** How far the edge spreads into the neighbour, in tiles (0.05 – 0.5). */
  width: number;
  /** 0 = an even edge, 1 = very irregular. */
  roughness: number;
  /** ragged: hard pixel edge; dither: a dithered fade (pixel art); smooth: a soft fade (smooth textures). */
  edge: 'ragged' | 'dither' | 'smooth';
  /** Imported tiles: the edge follows the texture (bright parts like stones reach further). */
  detail: boolean;
}

/** When a page applies. With several matching pages, the last one wins (as in RPG Maker). */
export type SelfSwitch = 'A' | 'B' | 'C' | 'D';
export const SELF_SWITCHES: SelfSwitch[] = ['A', 'B', 'C', 'D'];

export type Condition =
  | { switch: string; is?: boolean }
  /** One of this event's own self-switches (A–D), no name needed. */
  | { self: SelfSwitch; is?: boolean }
  | { var: string; op: '>=' | '<=' | '==' | '>' | '<'; value: number }
  /** The player carries at least `count` of an item (equipped counts too). */
  | { item: string; count?: number }
  /** The player has at least this much gold. */
  | { gold: number }
  /** A quest's state ('started': active or ready to hand in). */
  | { quest: string; is: QuestStatus | 'started' }
  /** One of a quest's objectives is done (or not, with `done: false`). */
  | { quest: string; objective: string; done?: boolean }
  /** The real world's day of the week is one of these (0 Sunday … 6 Saturday, from the player's date). */
  | { weekday: number[] }
  /** The real moon's phase tonight is one of these (full and new for werewolves…). */
  | { moon: import('./moon').MoonPhase[] }
  /** The temperature here (°F) is at least / at most this. */
  | { temp: number; op: '>=' | '<=' }
  /** The weather here is one of these. */
  | { weather: WeatherKind[] }
  /**
   * A hero has a state (Update 106): a weather state (wet, cold, freezing, hot, overheating, comfortable), an ailment,
   * any ailment ('ailment'), or a good state (rested, wellRested, 'good': either). hero: '' the hero you play, 'any'
   * anyone in the party, or a hero's id.
   */
  | { heroHas: string; hero?: string; is?: boolean }
  /** The real date is this day of the year ("MM-DD"), or between it and `until` (both included; may wrap past December). */
  | { date: string; until?: string }
  /** Relationships (Update 124): how `relation` (a hero id) rates `of` ('' the hero you play), at least / at most `value` (0 … 100). */
  | { relation: string; of: string; op: '>=' | '<='; value: number }
  /** Roleplay (Update 127): `hero`'s answer ('' the hero you play) for the title `rp` (an id) is `is` (case aside). */
  | { rp: string; hero: string; is: string }
  /** Roleplay dates (Update 130): today (the real date) is `hero`'s `rpDate` title (a date), or it's within `within` days ahead. */
  | { rpDate: string; hero: string; within?: number };

/** Event commands. Branches nest as lists, so no indent bookkeeping is needed. */
export type Command =
  /** `bubble`: a speech bubble with a tail pointing at the speaker, or a plain box (default: a tail when the event shows a character). */
  | { cmd: 'text'; text: string; speaker?: string; bubble?: 'speech' | 'plain'; /** A text box style (Database → Text boxes; unset: automatic). */ style?: string; /** Its own look: colours, size, bold… (like word bubbles), over the style's. */ look?: import('../ui/richText').TextLook }
  | { cmd: 'choice'; options: string[]; branches: Command[][]; cancel?: number }
  | { cmd: 'if'; condition: Condition; then: Command[]; else?: Command[] }
  | { cmd: 'setSwitch'; switch: string; value: boolean }
  /** One of the running event's own switches (A–D). */
  | { cmd: 'selfSwitch'; letter: SelfSwitch; value: boolean }
  | { cmd: 'setVar'; var: string; op: 'set' | 'add'; value: number }
  | { cmd: 'wait'; seconds: number }
  | { cmd: 'fadeOut'; seconds?: number }
  | { cmd: 'fadeIn'; seconds?: number }
  | { cmd: 'setTime'; hour: number; instant?: boolean }
  /** Group chatter (Update 122): play this conversation at the next camp visit. */
  | { cmd: 'groupChatter'; id: string }
  /** Show or hide a Journal tab (Update 130; kept with the save). */
  | { cmd: 'journalTab'; tab: JournalTabId; show: boolean }
  /** Relationships (Update 124): `a`'s rating of `b` ('' the hero you play) up or down by `value`, or set to it; `both`: b's of a too. */
  | { cmd: 'relation'; a: string; b: string; op: 'add' | 'set'; value: number; both?: boolean }
  /**
   * A lock (Update 119): until it's opened, the event stops here unless the player picks it (or carries its key or a
   * Skeleton Key). Opened once, it stays open (remembered per event, or in `switch`).
   */
  | { cmd: 'lock'; level: LockLevel; key?: string; switch?: string }
  /**
   * Sleep (a camp, an inn): the camera tilts up to the sky, the hours rush by overhead, then it comes back down.
   * Until morning (7:00), until night (21:00), or for some hours; `rest`: health, magic and stamina refill.
   */
  /** Change how a hero's stat grows each level (for good). hero: an id, '' for the hero you play, 'all' for everyone. */
  | { cmd: 'statRank'; hero: string; stat: 'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf'; rank: import('../game/statRanks').Rank }
  | { cmd: 'sleep'; until?: 'morning' | 'night' | 'hours'; hours?: number; rest?: boolean; /** An inn: the party wakes Well Rested. */ inn?: boolean }
  /**
   * A rest point (a campfire; Update 106): the player picks how many hours to rest, then camping supplies (for
   * Rested / Well Rested), and the party sleeps. Also sets the respawn point (unless `noRespawn`).
   */
  | { cmd: 'rest'; noSupplies?: boolean; noRespawn?: boolean }
  /** Give a good state (Rested, Well Rested: also for blessings) for hours and minutes (unset: the Database's), or take it away ('none'). */
  | { cmd: 'goodState'; hero: string; kind: 'rested' | 'wellRested' | 'none'; hours?: number; minutes?: number }
  /** Set a hero's weather state (soak them, chill them to Freezing…; 'normal' warms and dries them). */
  | { cmd: 'heroWeather'; hero: string; state: 'normal' | 'wet' | 'cold' | 'freezing' | 'hot' | 'overheating' }
  | { cmd: 'ability'; ability: Ability; on: boolean }
  | { cmd: 'gauge'; gauge: Gauge; op: 'add' | 'set' | 'fill'; value: number }
  /** Give the hero an ailment (for `seconds`, 0: its usual time), or cure one ('all': every one but Zombie). */
  | { cmd: 'ailment'; op: 'give' | 'cure'; ailment: Ailment | 'all'; seconds?: number; /** '' (unset) the hero you play, 'all' the party, or a hero's id. */ hero?: string }
  /** Open the nearest fire's fuel menu (add firewood, see how long it burns). */
  | { cmd: 'tendFire' }
  /** A full rest (campfire, inn): health, magic and stamina to full for the whole party, ailments cured (not Zombie). */
  | { cmd: 'fullRest' }
  /** Open the save screen (a save point). */
  | { cmd: 'save' }
  /** Give items; if the bag is full the player is told and the event stops (so a chest stays closed). */
  | { cmd: 'giveItem'; item: string; count: number; silent?: boolean }
  | { cmd: 'takeItem'; item: string; count: number }
  | { cmd: 'gold'; op: 'add' | 'set'; value: number; silent?: boolean }
  /** A shop: what it sells (price overrides optional) and whether the player can sell to it. */
  | { cmd: 'shop'; goods: { item: string; price?: number }[]; canSell?: boolean; name?: string }
  /** A stable: rent one of these horses (Database → Horses; empty: all of them), or send yours home. */
  | { cmd: 'stable'; horses?: string[]; name?: string }
  /**
   * A griffin master: talking unlocks this roost (here, where the hero stands) and opens the world map to fly to any
   * other unlocked roost, priced by distance.
   */
  | { cmd: 'roost'; id: string; name: string; speaker?: string; /** Unlock it without offering a flight. */ unlockOnly?: boolean; /** (Internal: open the world map to pick a flight now.) */ pick?: boolean }
  /** The rented horse: rent one (free, from an event), send it home, get on or off. */
  | { cmd: 'horse'; op: 'rent' | 'home' | 'mount' | 'dismount'; id?: string; free?: boolean }
  /** Move the player to a map (this one or another) at x, z. Ends the event. */
  | { cmd: 'transfer'; map: string; x: number; z: number; dir?: Dir; fade?: 'black' | 'white' | 'none' }
  /** Play a sound effect (a built-in name like "levelUp", or a file path). */
  | { cmd: 'sound'; sound: string }
  /** Change the music or the background sound ('' stops it; omitted: back to the map's own). */
  | { cmd: 'music'; music?: string; fade?: number }
  | { cmd: 'ambience'; ambience?: string }
  /** A hero (Database → Heroes, not the first) joins or leaves the party. */
  | { cmd: 'party'; op: 'add' | 'remove'; hero: string; quiet?: boolean }
  /** Change this map's weather (kept for the rest of the game); wind: a new breeze strength (blank: unchanged). */
  | { cmd: 'weather'; kind: WeatherKind; amount?: number; wind?: number; scope?: 'here' | 'world' }
  /** Change the temperature on this map (set to, or warmer / colder by, °F) until the player leaves it; reset: back to normal. */
  | { cmd: 'temperature'; op: 'set' | 'add' | 'reset'; value?: number }
  /** Give skill points (a quest reward). */
  | { cmd: 'skillPoints'; value: number; /** Party skill tree points instead of the hero's. */ party?: boolean }
  /** Overworld weapons (the field sword and bow) on or off: off indoors or in restricted areas (greyed out on the HUD). */
  | { cmd: 'fieldWeapons'; on: boolean }
  /**
   * Enemy levels on the map: as set (the spawns' level ranges) or "dynamic" (they come out near the party's average
   * level, `spread` either side; bosses and event battles keep their own).
   */
  | { cmd: 'enemyLevels'; mode: 'fixed' | 'party'; spread?: number }
  /** Show a tutorial pop-up (Database → Tutorials) the first time; kept in the Journal (Update 113). */
  | { cmd: 'tutorial'; id: string }
  /** Unlock an achievement (Database → Achievements). */
  | { cmd: 'achievement'; id: string }
  /** Run a developer-console command (testing shortcuts: give items, teleport…). */
  | { cmd: 'console'; line: string }
  /**
   * Quests: start one, tick off (or count up) an objective, complete it (gives the rewards), fail it, or forget it
   * (back to not started). `add` counts an objective up by that much instead of finishing it.
   */
  | { cmd: 'quest'; quest: string; op: QuestOp; objective?: string; add?: number; silent?: boolean }
  /**
   * A turn-based battle against these enemies (a boss, a set-piece fight). The event waits for it. `canRun`: the
   * party may run away (default false); `lose: 'continue'`: losing doesn't send the party back (the event goes
   * on, with the party on 1 health); `resultVar`: a variable set to 1 (won), 2 (ran away) or 0 (lost).
   */
  | { cmd: 'battle'; enemies: string[]; /** Single mode: wild (one at random), trainer (one at a time) or swarm (all); unset: the map's default. */ pick?: EncounterPick; canRun?: boolean; lose?: 'respawn' | 'continue'; resultVar?: string; music?: string; /** The battle map to fight on (unset: the map's). */ map?: string }
  /** Teach a spell (at a rank) or an Addition: to the hero you play (''), a party hero by id, or everyone ('@party'). */
  | { cmd: 'learn'; who: string; spell?: string; rank?: number; addition?: string; silent?: boolean }
  /** Change a hero's class, or let them change to it later (unlock). */
  | { cmd: 'heroClass'; who: string; op: 'change' | 'unlock'; cls: string; silent?: boolean };

export type QuestOp = 'start' | 'objective' | 'complete' | 'fail' | 'reset';
/** inactive: not started; ready: every objective done, waiting to be handed in. */
export type QuestStatus = 'inactive' | 'active' | 'ready' | 'done' | 'failed';
/**
 * What an objective asks for. task: ticked off by an event (talk to someone, open a gate…); defeat: beat `count` of an
 * enemy type; collect: carry `count` of an item (counted live: selling them undoes it); visit: reach a map.
 */
export type ObjectiveKind = 'task' | 'defeat' | 'collect' | 'visit';
export interface QuestObjective {
  id: string;
  text: string;
  kind: ObjectiveKind;
  enemy?: string;
  item?: string;
  map?: string;
  /** How many (defeat, collect; a task with a count is counted up with "add"). Default 1. */
  count?: number;
  /** Not needed to finish the quest. */
  optional?: boolean;
}
export interface QuestReward { xp?: number; gold?: number; skillPoints?: number; items?: { item: string; count: number }[]; /** Update 124: relationship points (a's rating of b; both: each way). */ relations?: { a: string; b: string; value: number; both?: boolean }[] }
export interface QuestDef {
  id: string;
  name: string;
  /** Main story or side quest (main quests are listed first, with a star). */
  kind: 'main' | 'side';
  /** Who gave it and where (shown in the quest log). */
  giver?: string;
  location?: string;
  description?: string;
  objectives: QuestObjective[];
  /** One objective at a time: the next shows (and counts) once the one before is done. */
  inOrder?: boolean;
  /** Finishes by itself when the last objective is done; otherwise it waits to be handed in (an event completes it). */
  autoComplete?: boolean;
  /** Shown once every objective is done and it's waiting to be handed in, e.g. "Return to Mira". */
  turnIn?: string;
  rewards?: QuestReward;
  /** Completing it takes the items its collect objectives asked for. */
  takeItems?: boolean;
}

/** Ways the player can move beyond walking. */
export type Ability = 'run' | 'jump' | 'climb' | 'crawl';
export const ABILITIES: Ability[] = ['run', 'jump', 'climb', 'crawl'];

export type Trigger = 'action' | 'touch' | 'auto' | 'none';

export interface EventPage {
  condition?: Condition;
  /** Static sprite key (see SpriteLibrary), e.g. "sign". */
  sprite?: string;
  /** Character key from database.json, drawn with a walking sprite sheet. */
  character?: string;
  dir?: Dir;
  /** Turn to face the player when activated. */
  facePlayer?: boolean;
  trigger: Trigger;
  solid?: boolean;
  /** Its picture sits flat against the wall behind (default: as its prop says; cave mouths and doors do). */
  wall?: boolean;
  /** Running this page makes it where the player comes back after losing all health. */
  respawn?: boolean;
  /** An enemy (id from Database → Enemies) instead of an NPC: it fights, and the page's commands run when it's defeated. */
  enemy?: string;
  /** That enemy's level, rolled when it appears (unset: its own). */
  enemyLevels?: LevelRange;
  /**
   * Something to break (a crate, a cracked boulder, a crystal switch): it can be locked on to and hit, and when its
   * health runs out the page's commands run (set a switch to lower a bridge, open a gate…).
   */
  breakable?: BreakableDef;
  /** A word bubble over the event while this page is showing: "!" / "?" for quests, or short text. */
  bubble?: import('../ui/BubbleLayer').EventBubble;
  /** A sound that plays all the time while this page shows (a campfire, a shore, a waterfall): loud up close, fading with distance. */
  sound?: EventSound;
  commands: Command[];
}

export interface EventSound {
  /** A loop: 'builtin:fire', 'builtin:shore'… or a file (audio/ambience/…). */
  src: string;
  /** 0 … 100 (default 80). */
  volume?: number;
  /** Heard up to this many tiles away (default 8). */
  range?: number;
}

/** Elements: water beats fire beats nature beats earth beats shock beats water; light and dark beat each other. */
export type Element = 'neutral' | 'water' | 'fire' | 'nature' | 'earth' | 'shock' | 'light' | 'dark';

/** Ailments a hit can give (each with a chance), and buffs items can give. */
export type Ailment = 'burn' | 'poison' | 'chill' | 'paralyze' | 'blind' | 'silence' | 'stagger' | 'sleep' | 'confusion' | 'zombie';
export type BuffKind = 'crit' | 'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf' | 'regen' | 'haste' | 'slow' | 'acc' | 'eva' | 'accDown' | 'evaDown' | 'statGuard';
/** A chance (%) for a hit to give an ailment, for `seconds` (0 or missing: its usual time). */
export interface Inflict { ailment: Ailment; chance: number; seconds?: number }
/** A buff an item gives: how much (default per kind) for how long. */
export interface BuffGrant { buff: BuffKind; amount?: number; seconds?: number; /** In battle: how many of the fighter's turns (default 3). */ turns?: number; /** In battle: it lasts the whole battle (Pokémon-style). */ whole?: boolean }

/** Battle weather (a weather spell, or the map's weather a battle starts in): it makes some elements stronger. */
export type BattleWeather = 'none' | 'rain' | 'storm' | 'snow' | 'blizzard' | 'sun' | 'sandstorm';

export interface BreakableDef {
  /** How much damage it takes to break. */
  hp: number;
  /** Softens each hit like armour: damage × 50 / (defence + 50). */
  defense?: number;
  /** What can break it (all of them when left out): a crystal only magic reaches, a rope only arrows… */
  hitBy?: ('melee' | 'bow' | 'magic')[];
  /** Only hits of this element hurt it (an ice wall only fire melts). */
  needs?: Element;
  /** Shown over its health bar (default: the event's name). */
  name?: string;
}

export interface EventData {
  id: number;
  name: string;
  /** Top-left tile. */
  x: number;
  z: number;
  /** Size in tiles (1 × 1 when omitted). Any tile of the area triggers the event. */
  w?: number;
  h?: number;
  /** A marker on the world map (Quest location, Landmark…), optionally only while a switch is on. */
  marker?: import('./landmarks').EventMarker;
  /**
   * 3D maps (Update 155): exactly where it stands (metres; y its feet) and which way it faces (degrees), placed in the
   * editor's 3D view. Its tile (x, z) follows along.
   */
  pos3?: { x: number; y: number; z: number; ry?: number };
  pages: EventPage[];
}

/**
 * A volume on a 3D map (Update 156): a box (x, z its centre, y its bottom, sx × sy × sz metres, turned ry degrees).
 * A trigger runs an event's page when the hero walks in (or out); an encounter box counts as one of the map's
 * encounter zones (its troops and rate, Map Properties → Encounters).
 */
export interface Volume3D {
  id: number;
  name: string;
  kind: 'trigger' | 'encounter';
  x: number; y: number; z: number;
  sx: number; sy: number; sz: number;
  ry?: number;
  /** Trigger: the event on this map whose page runs. */
  event?: number;
  /** Trigger: only the first time ever (off: every time the hero walks in). */
  once?: boolean;
  /** Trigger: on walking out instead of in. */
  onExit?: boolean;
  /** Encounter: the zone letter. */
  zone?: string;
}

/** A ramp or stairs on one cell. Without `dir` it faces the neighbour that is one step higher. */
export interface RampData {
  x: number;
  z: number;
  /** corner: a walkable slope that rounds a hill's corner (its raised corners meet the higher ground around it). */
  style: 'ramp' | 'stairs' | 'corner';
  /** Direction it rises towards. */
  dir?: Dir;
  /** Corner slopes: which corners are raised one step (unset: found from the neighbours one step higher). */
  raise?: CornerName[];
}

/** A cell's corners, in the order north-west, north-east, south-east, south-west. */
export type CornerName = 'nw' | 'ne' | 'se' | 'sw';
export const CORNER_NAMES: CornerName[] = ['nw', 'ne', 'se', 'sw'];

/** Which wall of a building: front faces the camera (down the map), back faces up the map. */
export type BuildingSide = 'front' | 'back' | 'left' | 'right';

export interface BuildingDoor {
  side: BuildingSide;
  /** Tiles from the wall's left end (front and back, as seen from the front) or its top end (left and right walls). */
  at: number;
}

/**
 * A building: a rectangle of tiles (its footprint, all blocked) with walls, a roof, doors and windows, drawn as a 3D
 * model. Interiors are separate maps: put a Transfer event on the tile in front of a door.
 */
export interface BuildingData {
  x: number;
  z: number;
  /** Footprint size in tiles: w across, d up the map. */
  w: number;
  d: number;
  /** Wall height in tiles (default 2.5). */
  height?: number;
  /** Wall look: "plaster" (default), "stone", "brick", "timber", or an imported tile's key. */
  wall?: string;
  /** Roof look: "shingle" (default), "thatch", "slate", "wood", or an imported tile's key. */
  roof?: string;
  /** Roof shape (default gable). */
  roofStyle?: 'gable' | 'hip' | 'flat';
  /** Which way the ridge runs: "x" across the map, "z" up it (default: along the longer side). */
  ridge?: 'x' | 'z';
  /** How far the roof rises above the walls, in tiles (default: from the building's depth). */
  pitch?: number;
  /** How far the roof reaches past the walls, in tiles (default 0.3). */
  overhang?: number;
  /** Windows on each wall (default few). They light up at night. */
  windows?: 'none' | 'few' | 'many';
  doors?: BuildingDoor[];
  /** Shown in the editor only. */
  name?: string;
}

/** Enemy levels: from the first to the second (each foe rolls one). */
export type LevelRange = [number, number];

/** Random encounters on a map: which enemies, how often, how many at once, and where. */
export interface EncounterTable {
  /** Their levels (unset: each enemy's own, Database → Enemies). */
  levels?: LevelRange;
  /** Enemy ids with weights (higher: more often). */
  enemies: { enemy: string; weight?: number }[];
  /** About this many tiles walked between battles (default 30). */
  steps?: number;
  /** Enemies in each battle (default 1 – 3). */
  min?: number;
  max?: number;
  /** Only on these terrain characters (tall grass, say). Empty: anywhere on the map. */
  terrain?: string;
}

/** A troop: a group of enemies that fight together (Database → Troops). */
export interface BattleMarker { side: 'party' | 'enemy'; x: number; z: number }
export interface BattleCamera { distance?: number; height?: number; side?: number; fov?: number }

export interface TroopDef {
  id: string;
  name: string;
  /** Each kind of enemy and how many of it (a range: 1–3 slimes). */
  members: { enemy: string; min?: number; max?: number }[];
  /** Its own battle music (else the map's), and whether the party may run (default yes). */
  music?: string;
  noRun?: boolean;
  /**
   * Single battle mode: all of them at once (a normal group fight; the default), one of them picked at random (a
   * wild encounter), or one at a time, the next stepping in as each falls (a trainer). Up to eight in Single mode.
   */
  pick?: EncounterPick;
}

/** A horse to rent at a stable: faster on the map, its own stamina, and a jump over gaps. */
export interface HorseDef {
  id: string;
  name: string;
  description?: string;
  /** 1 – 3 stars. */
  tier: number;
  /** Gold to rent it. */
  price: number;
  /** Galloping speed, tiles a second (walking is a little over half). */
  speed: number;
  /** Its stamina: galloping and jumping use it, walking and standing bring it back. */
  stamina: number;
  /** How far it jumps, in tiles (over gaps, streams, fences). */
  jump: number;
  /** Placeholder art: its coat and its mane and tail. */
  color: string;
  mane: string;
}

/** Single battle mode: all at once (a swarm), one picked at random (a wild encounter) or one at a time (a trainer). */
export type EncounterPick = 'full' | 'random' | 'oneByOne';

/** One troop in a zone: how often it comes, and when it can. */
export interface ZoneTroop {
  troop: string;
  /** How often, against the zone's other troops (default 1). */
  weight?: number;
  /** Only by day or only at night (game time). */
  time?: 'day' | 'night';
  /** Only on these real-world days of the week (0 Sunday … 6 Saturday). */
  days?: number[];
  /** Only while this switch is ON (story progress). */
  switch?: string;
  /** Its enemies' levels (unset: the zone's). */
  levels?: LevelRange;
}

/** A painted zone on a map: its troops and about how many tiles are walked between battles. */
export interface EncounterZone {
  name?: string;
  steps?: number;
  troops: ZoneTroop[];
  /** The battle map for battles in this zone (unset: the map's). */
  battleMap?: string;
  /** Enemies' levels here (unset: each enemy's own); a troop can set its own. */
  levels?: LevelRange;
}

export interface MapData {
  name: string;
  width: number;
  height: number;
  terrain: string[];
  /**
   * Upper terrain layer (Update 147): one row per line, one tile key per cell (a space: nothing), painted over the
   * ground like RPG Maker's upper layers (flowers, path edges, overhangs). Omitted when empty.
   */
  upper?: string[];
  /**
   * Height on this map (Update 148): 'flat' implied by the tiles like RPG Maker (the Heights layer is kept but not
   * used), '3d' real heights. Unset: follows the view mode (2D flat, 3D real heights).
   */
  heightMode?: 'flat' | '3d';
  /**
   * Update 153: a 3D model (GLB / FBX) as the map's ground and scenery instead of painted tiles: walked on as it's
   * shaped. Fitted over the map unless `scale` is set (tiles per model unit); turned `rot` degrees; moved by x / y / z.
   */
  groundModel?: { src: string; scale?: number; rot?: number; x?: number; y?: number; z?: number };
  /**
   * Update 154: a 3D map: a whole place modelled in Blender (GLB), walked through in third person. Names in the scene
   * say what things are (docs/BLENDER_3D_MAPS.md); the map's tiles still hold events for now.
   */
  scene3d?: { src: string; scale?: number };
  /** Update 156: trigger and encounter volumes on a 3D map (boxes placed in the editor's 3D view). */
  volumes?: Volume3D[];
  /** Height layer: one row per line, space-separated steps from -10 to 10 (a step is half a tile). Omitted when flat. */
  heights?: string[];
  /**
   * Water layer: one row per line, space-separated: "." for none, else the surface level in steps plus an
   * optional kind letter (s shallow, w swimmable, d deep; none = automatic by depth). Omitted when dry.
   */
  water?: string[];
  /**
   * How this map's water looks: bumpiness of its surface (0 glassy … 2 rough, default 1), murkiness (0 crystal clear …
   * 1 muddy, default 0.5), and flow (tiles per second of current, 0 still; direction in degrees, 0 = east, 90 = south).
   */
  waterLook?: { bumpy?: number; murk?: number; flow?: number; flowDir?: number };
  /**
   * The map's kinds of water (Water tab): each cell of water uses one (its "@n" in the water rows; the first when
   * none), so a pond, a river and a lava pool can share a map. Missing: one style, from `waterLook`.
   */
  waterStyles?: WaterStyle[];
  /**
   * Fishing spots painted over water (Map editor → Water → Fishing): one string per row, space-separated, "." for none,
   * otherwise the number of the spot's catch table in `fishZones`.
   */
  fishing?: string[];
  /** This map's season, whatever the day (a snowy peak); unset: the season of the day. Outdoor maps only. */
  season?: import('./seasons').Season;
  /** What can be caught where fishing is painted: a catch table per spot (a pond, the river, the sea…). */
  fishZones?: FishZone[];
  /**
   * How each cell's raised or lowered ground is shaped (the Heights layer's Style brush): one character per cell,
   * "." blocky (default), "b" soft blocky (bevelled edges), "h" smooth hills (heights blended into slopes),
   * "c" cliffs (jagged rock faces). Omitted when all blocky.
   */
  heightStyles?: string[];
  /** Ramps and stairs, each rising one step towards a higher neighbour. */
  ramps?: RampData[];
  /**
   * Passage layer: one row per line, one character per cell. "." nothing special, "c" climbable
   * (its cliff walls can be climbed), "l" low clearance (crawl through), "x" always blocked,
   * "o" always passable (overrides blocking tiles and props). Omitted when empty.
   */
  passage?: string[];
  props: PropData[];
  lights: LightData[];
  events: EventData[];
  /** Houses, shops and other buildings, drawn in 3D from a footprint. Omitted when there are none. */
  buildings?: BuildingData[];
  /** A map theme (Database → Map themes): settings this map leaves unset come from it. */
  theme?: string;
  /** What cliff walls look like unless a tile chooses its own: "bricks" (default) or an imported tile's key. */
  cliffTile?: string;
  /** What lies beyond each edge of the map (older maps: { kind: 'forest', seed }). */
  border?: MapBorder;
  /** Outdoor (full day and night), indoor (muted, windows lit by day) or dark (caves: dark at any hour). */
  environment?: MapEnvironment;
  /** Sound: music, music while fighting, and the background sound by day and at night (sources: "builtin:field" or a file path; '' = none). */
  music?: string;
  battleMusic?: string;
  /** Turn-based battles: random encounters while walking (Pokémon tall grass, classic JRPG overworlds). */
  encounters?: EncounterTable;
  /** Single battle mode: how battles on this map come out unless a troop or event says (unset: Database → Combat's). */
  encounterPick?: EncounterPick;
  /**
   * Encounter zones painted on the map (the editor's Spawns layer): one character per cell, A–Z for a zone, "."
   * for none. Each zone's troops and how often battles come are in `zones`.
   */
  zoneGrid?: string[];
  /** Safe zones (world/safeZones.ts): one character per cell, "." none, s safe ground, S seat, L lie down, M practise magic, T training dummy. */
  safeGrid?: string[];
  zones?: Record<string, EncounterZone>;
  /**
   * 'battle': a battle map (a stage for turn-based battles: forest clearing, plains, city street…), listed apart in
   * the editor and never walked on. Its `markers` say where the party and the enemies stand.
   */
  kind?: 'field' | 'battle';
  /** Battle maps: where each party member (in party order) and each enemy (in order) stands. */
  markers?: BattleMarker[];
  /** Battle maps: the camera behind the party (tiles back, tiles up, tiles to the side; field of view in degrees). */
  battleCamera?: BattleCamera;
  /** Field maps: the battle map turn-based battles here are fought on (its file name); unset: the flat battle screen. */
  battleMap?: string;
  /** How battles here begin (one, or several picked at random): shatter, swirl, smudge, blinds, zoom, flash. Unset: any. */
  battleTransitions?: string[];
  ambience?: string;
  ambienceNight?: string;
  /** Background sound in autumn and winter (outdoors, by day). Unset: the forest's birds give way to cold wind. */
  ambienceCold?: string;
  /** The breeze: strength 0 (calm) … 1 (stormy), default 0.3 outdoors and 0 indoors; direction in degrees (0 = east, 90 = south). */
  wind?: { strength?: number; dir?: number };
  /**
   * Unique weather: this map has its own weather (below) instead of sharing the outdoor weather every other outdoor
   * map shares. Omitted: unique when `weather` is set (maps from before sharing). Maps with the same `weatherZone`
   * share their weather with each other (a desert, a mountain range).
   */
  uniqueWeather?: boolean;
  weatherZone?: string;
  /** Climate: this many °F warmer (+) or colder (−) than the season says (a desert, a mountain top). */
  tempOffset?: number;
  /**
   * A temperature of its own (°F), for caves and houses: it wanders a few degrees but never into another state's
   * range (a warm cave never turns sweltering). Unset: outdoors follows the weather; indoors 68, caves 55.
   */
  fixedTemp?: number;
  /** Damp (a wet cave, a cellar): it slowly soaks whoever is in it. */
  damp?: boolean;
  /** The elements don't touch anyone here (a cozy town): no cold, heat or wet. */
  noElements?: boolean;
  /** Its own weather at the start, when unique (a "Change weather" command can change it for the rest of the game). */
  weather?: { kind: WeatherKind; amount?: number };
  /** Air: distance haze, low ground mist (all day, mornings or nights only) and shafts of sunlight; each 0 … 1. */
  atmosphere?: { haze?: number; mist?: number; mistWhen?: MistWhen; rays?: number; clouds?: number; /** What the moving shadows are (Update 112): drifting clouds (default), a tree canopy's dappled shade, or beams of light. */ shadowKind?: 'clouds' | 'canopy' | 'beams' };
}

export type MistWhen = 'always' | 'morning' | 'night';

export type WeatherKind = 'none' | 'rain' | 'storm' | 'snow' | 'blizzard' | 'haze' | 'sandstorm' | 'pollen' | 'dust' | 'leaves';
export const WEATHER_KINDS: WeatherKind[] = ['none', 'rain', 'storm', 'snow', 'blizzard', 'haze', 'sandstorm', 'pollen', 'dust', 'leaves'];

/** Palette for a generated character sprite sheet (stand-in until real sheets are imported). */
export interface CharacterPalette {
  hair: string; hairLight: string; hairDark: string;
  skin: string; skinShade: string; eye: string;
  tunic: string; tunicShade: string; tunicLight: string;
  belt: string; buckle: string;
  pants: string; pantsShade: string; boot: string;
  cape: string; capeShade: string;
}

/** One animation in an animated sheet: its first row, frame count, 1 or 4 directions, frame order and speed. */
export interface SheetAnim { row: number; frames: number; dirs: 1 | 4; cycle: number[]; ms: number }

/** An animated character sheet (Character Builder, LPC layout): square frames, named animations. */
export interface CharacterAnimLayout {
  /** Frame size in pixels (64 for LPC). Characters are drawn at 32 pixels per tile. */
  frame: number;
  /** The order of the 4 direction rows in each 4-direction animation (LPC: up, left, down, right). */
  dirs: Dir[];
  anims: Record<string, SheetAnim>;
}

/** Credit for an artwork used in the game (sprite parts from the Character Builder). */
export interface SpriteCredit { item: string; authors: string[]; licenses: string[]; urls: string[] }

/** Where one animation's frames are in a weapon sheet (y in pixels; frames are `frame` px square, `dirs` rows). */
export interface WeaponSheetAnim { y: number; frame: number; frames: number; dirs: 1 | 4 }
export type WeaponSpriteKind = 'sword' | 'blunt' | 'staff' | 'bow' | 'shield';
/**
 * An LPC weapon drawn over an animated character, frame for frame (assets/weapons/weapons.json). The back layer
 * is drawn behind the body, the front layer over it. Attack frames can be bigger than the body's (128 or 192 px,
 * centred on it). Animation names follow the body's; "slash_reverse" is the slash played backwards.
 */
export interface WeaponSpriteDef {
  id: string;
  name: string;
  kind: WeaponSpriteKind;
  file: string;
  width: number;
  height: number;
  layers: { back: Record<string, WeaponSheetAnim>; front: Record<string, WeaponSheetAnim> };
  anims: string[];
  /** Index of its icon in thumbs.png (built-in weapons). */
  thumb: number;
  /** Where its icon is in its own sheet (weapons made in the weapon builder). */
  icon?: { x: number; y: number; w: number; h: number };
  /** Made in the weapon builder (imported into the project, not one of the built-in sheets). */
  custom?: boolean;
  /** The built-in weapon it was made from. */
  base?: string;
  /** The glow and trail it was made with (an item choosing it starts with them). */
  effects?: { glow?: WeaponGlow; trail?: WeaponTrail };
  credits: SpriteCredit[];
}
export interface WeaponGlow { color: string; /** 0.2 – 2, default 1. */ strength?: number; /** Slow pulse (default on). */ pulse?: boolean }
export interface WeaponTrail { color: string; /** How many earlier frames echo behind the swing (1 – 4, default 3). */ length?: number }
export interface WeaponSpriteManifest { version: number; thumbSize: number; thumbCols: number; weapons: WeaponSpriteDef[] }

/** A section of the Credits screen you write yourself (Database → Credits). */
export interface CreditEntry { title: string; names: string }

export interface CharacterDef {
  name: string;
  /** The built-in placeholder look, recoloured (used when there's no sheet). */
  palette?: CharacterPalette;
  /**
   * An imported character sheet (path relative to public/, e.g. "assets/characters/mira.png"): 3 frames across ×
   * 4 rows (down, left, right, up), any frame size; it's always shown 1.5 tiles tall. Sheets from the Character
   * Builder's LPC edition carry `anim` instead (then frames are square, 32 pixels per tile).
   */
  sheet?: string;
  /** The animations in an animated sheet (read from the PNG when it's imported). */
  anim?: CharacterAnimLayout;
  /** Body type for worn looks (Update 114): which version of an item's Look when worn they use (unset: masc). */
  body?: 'masc' | 'femme';
  /** (In the game only: worn items' sheets drawn over this one, in order.) */
  wornLayers?: { sheet: string; anim: CharacterAnimLayout; tint?: string; /** Update 128: drawn under the hero (a cape's back). */ under?: boolean; /** Update 128: colours swapped (source → new). */ recolor?: [string, string][] }[];
  /** Battle idle (Update 111): frames of one sheet row (0-based row, columns) looped while standing in battle. */
  battleIdle?: { row: number; frames: number[]; ms?: number };
  /** Who made the sheet's parts (read from the PNG; shown on the Credits screen). */
  credits?: SpriteCredit[];
  /** A rigged 3D model drawn instead of the sheet (render/characterModel.ts); the sheet or palette stays as a fallback. */
  model?: CharacterModel;
}

/** A 3D character's animation slots. Enemies use Idle, Attack, Spellcast and KO (their death). */
export type ModelSlot = 'idle' | 'walk' | 'run' | 'jump' | 'swim' | 'climb' | 'sit' | 'injured' | 'ko' | 'attack' | 'spellcast';
/** How 3D characters are drawn: Legend of Dragoon (low-res: crisp textures, flat shading, an outline) or FFX (smooth). */
export type ModelLook = 'lod' | 'ffx';

/** A character's 3D model (Database → Characters). */
export interface CharacterModel {
  /** The model file (GLB or FBX) under public/, e.g. "assets/models/characters/party/katrina/katrina.glb". */
  file: string;
  /** More files with actions for the same skeleton. */
  extra?: string[];
  /** The action each slot plays, by name ('' none); a slot left out is matched by the actions' names. */
  anims?: Partial<Record<ModelSlot, string>>;
  /** How tall it stands, in tiles (default 1.6). */
  height?: number;
  /** Turned this many degrees so it faces the camera when facing down (0, 90, 180, 270). */
  rot?: number;
  /** Its size on the battle stage, as a share of its height (default 0.5: the stage is seen up close). */
  battleScale?: number;
  /** Slots that play only part of their action (frames, 30 per second). */
  trim?: Partial<Record<ModelSlot, ClipTrim>>;
}

/** Part of an action: from frame `from` to frame `to` (either missing: its start or end). */
export interface ClipTrim { from?: number; to?: number }

/** How a new game's hero gets their stats (Database → Heroes). */
export interface CreationSettings {
  /** Show the stat screen after New Game (off: the hero's stats are used as set). */
  enabled?: boolean;
  /** Which ways are offered (default: roll, point buy and standard array). 'hard' is 3d6 in order. */
  methods?: ('roll' | 'pointBuy' | 'array' | 'hard')[];
  /** How many rerolls (0 or missing: as many as they like). */
  rerolls?: number;
}

/** A hero (Database → Heroes): their name, look and starting stats. */
/** A hero's later form: the level it comes at, its look (a Characters id) and face art. */
export interface HeroForm { level: number; look?: string; face?: string }

/** What a General chatter line is for (game/chatter.ts). */
export type ChatterTrigger = 'cold' | 'freezing' | 'hot' | 'overheating' | 'wet' | 'comfortable' | 'rain' | 'snow' | 'storm' | 'clear' | 'windUp' | 'windDown' | 'rest' | 'camp' | 'newMap';
/** A hero's chatter: how talkative (0 never … 10 often; 5 unset), lines per trigger, and lines for particular maps. */
export interface HeroChatter {
  amount?: number;
  lines?: Partial<Record<ChatterTrigger, string[]>>;
  maps?: { map: string; line: string }[];
  /** Update 122: what they say when talked to at camp: a default (no condition) and lines for while a condition holds. */
  camp?: { line: string; if?: Condition }[];
}

/** A custom worn picture (Update 134): a PNG path or "icon:<name>", its centre in a 64-pixel frame, scale and turn. */
export interface CustomWornPic { src: string; x: number; y: number; scale: number; rot?: number }
/** One body's custom worn pictures (Update 134). */
export interface CustomWornBody { front?: CustomWornPic; back?: CustomWornPic; side?: CustomWornPic }

/** One built-in clothing pick (Update 128): a part (world/wornParts.ts), its colour swatch or a tint. */
export interface WornPick { part: string; swatch?: number; tint?: string }

/** The Journal's tabs (Update 130). */
export type JournalTabId = 'quests' | 'log' | 'bestiary' | 'types' | 'tutorials' | 'records' | 'achievements';

/** A hero's gender (Update 127; game/roleplay.ts). */
export type Gender = 'male' | 'female' | 'transman' | 'transwoman' | 'transgender' | 'nonbinary' | 'other';
/** Database → Party → Genders (Update 137): a gender's own name, symbol (text or a small picture) and colour. */
export interface GenderLook { name?: string; symbol?: string; image?: string; color?: string }
/** A roleplay title every hero shares (Update 127): its id stays put when it's renamed. */
export interface RoleplayField { id: string; title: string; /** Update 130: a date answer ("MM-DD": a birthday) rather than text. */ type?: 'text' | 'date' }

/** What moves a relationship rating (Update 124; game/relations.ts). */
export type RelationKind = 'cover' | 'coverSave' | 'benchHeal' | 'revive' | 'avenge' | 'camp';
/** Relationships setup (Database → Relationships). */
export interface RelationSettings {
  /** Where each rating starts: start[rater][rated] (0 … 100; unset 50). */
  start?: Record<string, Record<string, number>>;
  /** Points for each thing that happens (unset: the defaults). */
  gains?: Partial<Record<RelationKind, number>>;
  /** Pairs ("a>b") whose top label reads Love instead of Best friends. */
  love?: string[];
  /** Turn relationships off (no Journal tab, no changes). */
  off?: boolean;
}

/** Group chatter (Update 122): a short conversation played over the speakers' heads at the next camp. */
export interface GroupChatter {
  id: string;
  name: string;
  /** Top to bottom: who says it (a hero id) and the line. */
  lines: { hero: string; text: string }[];
  /** Also plays (once) at a camp while this switch is on. */
  switch?: string;
}

/** A pattern laid over an item's icon (Update 133). */
export type IconPattern = 'stripes' | 'dots' | 'cracks' | 'swirls' | 'checker';
/** Icon effects (Update 133): colours as "#rrggbb"; the pattern's opacity 5 … 100 (unset 70). */
export interface IconFx {
  glow?: string;
  outline?: string;
  pattern?: { kind: IconPattern; color: string; opacity?: number };
}

/** When a global event runs (Update 131). */
export type GlobalTrigger = 'newGame' | 'load' | 'sleep' | 'restZone' | 'newDay';
/** A global event (Update 131): a script that runs once each time one of its moments comes round. */
export interface GlobalEvent {
  id: string;
  name: string;
  when: GlobalTrigger[];
  commands: Command[];
}

/** A tutorial pop-up: a title and a few lines. */
export interface TutorialDef { id: string; title: string; text: string }

export interface HeroDef {
  id: string;
  name: string;
  /** Update 127: their gender (a coloured symbol on stat blocks), and which version of worn clothes they wear. */
  gender?: Gender;
  outfit?: 'masc' | 'femme';
  /** Update 127: their answers to the roleplay titles (Database → Party → Roleplay), by title id. */
  roleplay?: Record<string, string>;
  /** In a safe zone: how much they like each rest activity, 1 (rarely) … 10 (goes for it most often); unset 5. */
  restPrefs?: Partial<Record<RestActivity, number>>;
  /** Party chatter: what they say now and then out of battle (Database → Characters → Chatter; game/chatter.ts). */
  chatter?: HeroChatter;
  /**
   * No Additions: Attack is a plain attack, never an Addition (archers, mages). Everyone else starts with Quick Strike
   * equipped and can equip any Addition they learn (Equipment page).
   */
  noAdditions?: boolean;
  /** Their plain attack (with No Additions): melee runs in and swings (default), ranged fires the bow from where they stand. */
  plainAttack?: 'melee' | 'ranged';
  /** Which look from Characters (the first hero's is the player's look). */
  look?: string;
  /** Face art for the battle screen and menus (an image path); unset: a face cut from their look. */
  face?: string;
  /**
   * Their mid and final forms (first, second): at that level they transform, after the battle that took them there,
   * into a new look (from Characters) and face art. Unset parts keep the form before's.
   */
  forms?: HeroForm[];
  /** Turn-based: voice clips, one at random as they land a weapon or bow attack (sound sources). */
  attackSounds?: string[];
  /** Turn-based battles: raise (+) or lower (−) their picture, in tiles, when the art floats or sinks. */
  battleOffset?: number;
  /** The Addition Attack performs unless the player picks another (Party → Addition); unset: their first. */
  defaultAddition?: string;
  /** Starting Strength, Dexterity, Defence, Magic and Magic Defence (10 each when left out). */
  stats?: Partial<Record<'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf', number>>;
  /** How each stat grows a level: A +4, B +3, C +2 (default), D +1, F +0 (game/statRanks.ts). */
  ranks?: Partial<Record<'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf', import('../game/statRanks').Rank>>;
  /** Set up their stats when they join (dice, point buy, standard array, or the Database's): the hero you play does by default. */
  setupStats?: boolean;
  /** The first hero: how a new game makes their stats. */
  creation?: CreationSettings;
  /** Their colour in menus (behind "equipped" on what they wear, on their card). Unset: one of a few defaults. */
  color?: string;
  /** A few lines about them, shown on their Status page. */
  about?: string;
  /** Up to two elements, and elements they're immune to or absorb. */
  elements?: Element[];
  immune?: Element[];
  absorb?: Element[];
  /** Ailments they can't get. */
  resists?: Ailment[];
  /** Party members (every hero but the first): how they fight on their own, and whether they're in the party from the start. */
  ai?: AllyStyle;
  startsInParty?: boolean;
  /** The level they join at (unset: the level of the hero you play when they join). */
  joinLevel?: number;
  /** Equipment they join with (item ids by slot): given to them, not taken from the bag. */
  gear?: Partial<Record<EquipSlot, string>>;
  /** Class they start in, and spells (id → rank) and Additions they know from the start. */
  cls?: string;
  spells?: Record<string, number>;
  additions?: string[];
}

/** Fighter: closes in with their weapon. Archer: keeps back and shoots. Caster: their spell shard. Healer: heals the hurt, else casts. */
export type AllyStyle = 'fighter' | 'archer' | 'caster' | 'healer';

/**
 * The camera over the maps (not battles): how steeply it looks down (degrees from level), how far back it sits (tiles),
 * its field of view, and how far standing sprites lean back to face it (0 – 100% of the camera's angle).
 */
export interface OverworldCamera { pitch?: number; distance?: number; fov?: number; lean?: number }

export interface Database {
  /** The elements on the body out of battle: cold, heat and wet (Database → Weather & temperature). */
  body?: BodyConfig;
  /** How 3D characters are drawn (Database → Characters). Unset: Legend of Dragoon (low-res, outlined). */
  modelLook?: ModelLook;
  /** 3D characters' dark outline: on or off (unset: on with Legend of Dragoon, off with FFX). */
  modelOutline?: boolean;
  /** Weapon types (missing: the built-in ten). */
  weaponTypes?: WeaponTypeDef[];
  /** Armor types (missing: Light, Medium and Heavy armor). */
  armorTypes?: ArmorTypeDef[];
  /** The order stats are listed in everywhere (missing: Strength, Dexterity, Agility, Endurance, Defence, Magic, Magic Defence). */
  statOrder?: ('str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf')[];
  /** The camera over the maps (Database → Camera). Unset: the handheld-style camera. */
  overworldCamera?: OverworldCamera;
  /**
   * The A button on the map (Update 142): 'jump' (unset) or a field power: a key item field use (Sprint is held to
   * run; Cut swings; Bow is held to draw) or a key item power (light, waterWalk). Talking still comes first.
   */
  aButton?: 'jump' | FieldUseKind | FieldPower;
  /** Characters always on top (Update 139): the hero and party are drawn over props they overlap. */
  charactersOnTop?: boolean;
  /**
   * View (Update 145): '2d' draws everything flat and in order of layers like RPG Maker (characters on
   * `playerLayer`, props on theirs; the same layer sorts by position); unset, the 3D HD-2D look.
   */
  viewMode?: '2d';
  /** 2D mode: the layer characters are on (0 on top … 25 the ground; default 10). */
  playerLayer?: number;
  /** 2D mode (Update 152): walk freely instead of tile by tile. */
  freeMove2D?: boolean;
  /** 3D maps (Update 154): the camera orbits the hero (default) or settles behind them as they walk. */
  camera3d?: 'orbit' | 'follow';
  title: string;
  /** The World layout (Map editor → World): where each map sits, place names, and the world map's fog. */
  world?: import('./worldLayout').WorldData;
  /** Kinds of world-map marker for events (Database → Map markers; default: Quest location, Landmark, Town, Danger). */
  markers?: import('./landmarks').MarkerKind[];
  /** Map themes (Database → Map themes). Unset: the starter themes. */
  mapThemes?: import('./mapThemes').MapTheme[];
  /** The game's list of switch names (the editor's Switches window). Switches not listed still work. */
  switches?: string[];
  /** Named text colours for messages: [id]words[/id] (Database → Text colours). */
  textColors?: import('../ui/richText').TextColor[];
  /** Text box styles for messages (Database → Text boxes): Speech, Sign, Item received… and your own. */
  messageStyles?: import('../ui/richText').MessageStyle[];
  /** Achievements (Database → Achievements). */
  achievements?: import('../game/achievements').AchievementDef[];
  /** Tutorial pop-ups (Update 113), shown by the Show tutorial command and kept in the Journal. */
  tutorials?: TutorialDef[];
  /** Group chatter (Update 122): conversations played at camp (Database → Characters → Chatter). */
  groupChatter?: GroupChatter[];
  /** Global events (Update 131): scripts run at a new game, a load, a sleep, a rest zone or a new real day. */
  globalEvents?: GlobalEvent[];
  /** Relationships between party members (Update 124). */
  relations?: RelationSettings;
  /** Roleplay titles (Update 127). */
  roleplay?: RoleplayField[];
  /** Genders renamed, given other symbols or colours (Update 137; unset: the built-in ones). */
  genders?: Partial<Record<Gender, GenderLook>>;
  /** The developer console (the ` key): in playtests only (default), always, or never. */
  devConsole?: 'playtest' | 'always' | 'off';
  /** How many heroes fight and walk on the map at once, the hero you play included (3 unset, or 4). */
  activeParty?: 3 | 4;
  startMap: string;
  /** Update 152: the editor's map folders, map name → folder name (maps not listed: no folder). */
  mapFolders?: Record<string, string>;
  /** Update 157: `y` the floor it stands on (3D maps, where floors can be stacked). */
  start: { x: number; z: number; y?: number; dir?: Dir };
  startHour: number;
  /** The shared outdoor weather when a new game starts (outdoor maps without their own weather all share it). */
  weather?: { kind: WeatherKind; amount?: number };
  /** Dynamic weather and temperature (Database → Weather); anything left out uses the defaults (world/climate.ts). */
  climate?: Partial<Omit<import('./climate').ClimateConfig, 'seasons'>> & { seasons?: Partial<Record<import('./seasons').Season, Partial<import('./climate').SeasonClimate>>> };
  player: string;
  characters: Record<string, CharacterDef>;
  /** Which movement abilities the player starts with (all of them when omitted). Events can change them. */
  abilities?: Partial<Record<Ability, boolean>>;
  /** Player stats, speeds and stamina costs. Anything left out uses the defaults (see game/stats.ts). */
  stats?: PlayerConfigData;
  /** Saving rules (defaults: save from the menu anywhere, autosave on map change). */
  saving?: { anywhere?: boolean; autosave?: boolean };
  /** Title screen and pause menu wording (anything left out uses the defaults). */
  menus?: MenuConfig;
  /** Your own sections of the Credits screen (Database → Credits); sprite credits are added from the characters. */
  credits?: CreditEntry[];
  /** Combat tuning (Database → Combat); anything left out uses the defaults (see game/combat/config.ts). */
  combat?: CombatData;
  /** Sound (Database → Audio): imported files, effects swapped for files, title music. */
  audio?: { files?: string[]; sfx?: Record<string, string>; titleMusic?: string; /** After the victory fanfare (unset: the map's music). */ victoryMusic?: string; /** Every battle's music unless a map, zone, troop or Start battle command overrides it (unset: the built-in theme). */ battleMusic?: string; /** Built-in effects and music: 'chip' (Game Boy-style chiptune, default) or 'classic'. */ style?: 'chip' | 'classic' };
  /** The skill tree (Database → Skills). Without it, the built-in tree is used. */
  skills?: SkillsData;
  /** Troops: groups of enemies for random encounters (encounter zones on maps). */
  troops?: TroopDef[];
  /** Horses rented at stables (Database → Travel; unset: the built-in three). */
  horses?: HorseDef[];
  /** Griffin flights: price (gold, plus gold a tile of distance) and speed (tiles a second). */
  travel?: { flightBase?: number; flightPerTile?: number; flightSpeed?: number };
  /** Learned spells, Additions and classes (built-in ones when left out). */
  spells?: SpellEntry[];
  additions?: AdditionDef[];
  classes?: ClassDef[];
  /** Enemy types (Database → Enemies), placed on maps as event pages. */
  enemies?: EnemyDef[];
  /** Items the game uses (see Database → Items). */
  items?: ItemDef[];
  /** The heroes: the first is the one you play (its look is `player`); more join the party later. */
  heroes?: HeroDef[];
  /** Weapon looks made in the weapon builder and imported (sheets in assets/weapons/custom/). */
  weaponSprites?: WeaponSpriteDef[];
  /** Bag size and what a new game starts with. */
  inventory?: InventorySetup;
  /** Quests (Database → Quests), started and advanced by events. */
  quests?: QuestDef[];
  /** The clock: game minutes per real minute (0 stops it; default 20) and how dark night gets (0 – 1, default 0.85). */
  /** skySpeed: how fast sleeping's sky transition runs (1 normal, 0.5 twice as slow, 2 twice as fast). */
  time?: { rate?: number; darkness?: number; skySpeed?: number; seasons?: import('./seasons').SeasonSettings };
}

export type ItemKind = 'consumable' | 'equipment' | 'key' | 'ammo' | 'material';
/** weapon: melee (key 1); ranged: a bow (key 2); magic: the spell shard cast with key 3. */
/** Element stones, weakest to strongest. */
export type EssenceTier = 'fragment' | 'shard' | 'heart';

export type EquipSlot = 'weapon' | 'shield' | 'ranged' | 'magic' | 'armor' | 'accessory';
export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'shield', 'ranged', 'magic', 'armor', 'accessory'];
/** Older databases and saves: the Ring slot (rings are accessories now). */
export type OldEquipSlot = EquipSlot | 'ring' | 'light';

/** How rare a piece of equipment is: the colour its name is shown in (other items are plain white). */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythic';
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
export const RARITY_NAMES: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', legendary: 'Legendary', mythic: 'Mythic' };
export const RARITY_COLORS: Record<Rarity, string> = { common: '#a9acb6', uncommon: '#5fd068', rare: '#4f9dff', legendary: '#b571ff', mythic: '#ff9a2e' };

/** A spell shard: equipped in the magic slot, it's the spell key 3 (or Y to switch to it) casts. */
export interface SpellDef {
  /**
   * A field spell instead of a bolt: Light (a light around the hero) or Water Walk (walk on water of any depth). The
   * magic button (or F) switches it on and off: `mp` is spent to switch it on, `mpPerSecond` drains while it's on.
   */
  power?: FieldPower;
  mpPerSecond?: number;
  /** Field spells: the colour the hero glows while it's on (default gold for Light, blue for Water Walk). */
  glow?: string;
  /** Damage of each bolt (0 for field spells), and the magic it costs (field spells: to switch on). */
  damage: number;
  mp: number;
  /** Tiles per second, and how far it flies (defaults: Database → Combat's spell values). */
  speed?: number;
  range?: number;
  /** The bolt's colour, its sparks, and the light it and the hero's hands give off. */
  color: string;
  /** The light in the hands while it's readied (intensity 0 – 3, radius in tiles; intensity 0 for none). */
  light?: { intensity?: number; radius?: number };
}

/** Melee weapon weight class: light (daggers, short swords), medium (longswords, rapiers), heavy (greatswords, great axes). */
export type WeaponClass = 'light' | 'medium' | 'heavy';
export const WEAPON_CLASSES: WeaponClass[] = ['light', 'medium', 'heavy'];

/** What kind of weapon it is (classes can be trained with each kind, or kept from it). */
/** A weapon type's id (Database → Weapon types): built in sword, dagger, axe, mace, spear, staff, wand, fist, bow, crossbow. */
export type WeaponType = string;
/** A weapon type: its id, its name in class tables ("Swords"), one weapon of it ("Sword"), and words that pick it automatically from an item's name. */
export interface WeaponTypeDef { id: string; name: string; one?: string; words?: string }
/** An armor type's id (Database → Armor types): built in light (cloth, leather), medium (chain, scale), heavy (plate). */
export type ArmorWeight = string;
/** An armor type: its name, and what wearing it untrained costs (Agility and Dexterity for the built-in ones). */
export interface ArmorTypeDef {
  id: string;
  name: string;
  /** A short description (cloth, leather…). */
  note?: string;
  /** Stats it costs a hero whose class is untrained with it (negative numbers). */
  untrained?: Partial<Record<'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf', number>>;
}
/** What a class can be trained with: a weapon type, an armor type, or shields. */
export type GearKind = WeaponType | `armor:${string}` | 'shield';
/** Trained (full effect), untrained (weaker), or can't use it at all. */
export type GearSkill = 'trained' | 'untrained' | 'none';

export interface WeaponDef {
  /** Melee class, or 'bow' for the ranged slot. */
  class: WeaponClass | 'bow';
  /** Sword, dagger, axe… (unset: guessed from the name). */
  type?: WeaponType;
  /** Turn-based: how well it aims, in percent of the wielder's accuracy (default 100: a dagger 105, a great axe 90). */
  accuracy?: number;
  /** Turn-based: its hits never miss. */
  sure?: boolean;
  damage: number;
}

/** Field spells a spell shard can carry, switched on and off with the magic button (or F). */
export type FieldPower = 'light' | 'waterWalk';
export const FIELD_POWERS: FieldPower[] = ['light', 'waterWalk'];
/**
 * Key item field uses (Update 118), besides the Light / Water Walk toggles. Carried ones work just by being in the bag
 * (Dash, Climb, Skeleton Key); the others are used from the bag or the B button.
 */
/** How hard a lock is to pick (Update 119); 'never': it can't be picked (only its key or a Skeleton Key opens it). */
export type LockLevel = 'easy' | 'medium' | 'hard' | 'impossible' | 'never';
export type FieldUseKind = 'dash' | 'swim' | 'climb' | 'cut' | 'bow' | 'fireBow' | 'smash' | 'weather' | 'time' | 'season' | 'fish' | 'horse' | 'skeletonKey';
export const FIELD_USES: FieldUseKind[] = ['dash', 'swim', 'climb', 'cut', 'bow', 'fireBow', 'smash', 'weather', 'time', 'season', 'fish', 'horse', 'skeletonKey'];
export interface FieldUse {
  use: FieldUseKind;
  /** Cut and Bow (Update 132): the fixed damage a swing or a full draw does (unset: 10). */
  damage?: number;
  /** Change weather: the weather it brings (unset: the player picks from a list). */
  weather?: WeatherKind;
  /** Change time: the hour it jumps to (unset: the player sets a time). */
  hour?: number;
  /** Change season: the season it brings (unset: the player picks one; 'auto' goes back to the calendar's). */
  season?: import('./seasons').Season | 'auto';
  /** Ride horse: the horse it calls when the party has none (a horse id; unset: only calls the one they have). */
  horse?: string;
}
/**
 * Older databases: powers rings used to carry. Light and Water walking are spell shards now (moved over when the
 * database loads); cutting is gone (swords cut vines).
 */
export type RingPower = FieldPower | 'cut';

export interface RingDef {
  power: RingPower;
  /** Magic spent each use (cut) or each time it's switched on (light, water walking). */
  mpCost?: number;
  /** Magic drained per second while it's on (light, water walking). */
  mpPerSecond?: number;
  /** The colour the hero glows while it's on (default by power: gold light, blue water, green cutting). */
  glow?: string;
}

/** The light a Light shard gives while it's on. */
export interface ItemLight {
  /** orb: a ball of light floating by the hero, lighting all around; flashlight: a beam where the hero faces; lantern: a glow all around; torch: a flickering flame. */
  type: 'orb' | 'flashlight' | 'lantern' | 'torch';
  color: string;
  intensity: number;
  /** Reach in tiles. */
  radius: number;
  /** Beam width in degrees (flashlight). */
  angle?: number;
  /** Casts shadows (looks great, costs speed). */
  shadows?: boolean;
  /** Flashlight: a soft lantern-like glow around the hero as well as the beam. */
  glow?: { intensity: number; radius: number };
}

export interface ItemDef {
  id: string;
  name: string;
  description?: string;
  kind: ItemKind;
  /**
   * "builtin:potion" (built-in icons), an image path like "assets/icons/feather.png", or "sprite": the icon cut from
   * its weapon sprite (so the bag, shop and back icons look like the weapon in the hand).
   */
  icon: string;
  /** What shops charge (they buy it back for half). 0 or missing: not sold in shops by default. */
  price?: number;
  /** How many fit in one bag slot (equipment always 1). */
  stack?: number;
  /** Consumables: what using it restores. */
  restore?: Partial<Record<Gauge, number>>;
  /** Consumables: percent of the maximum restored, added to `restore` (10 + 30% max HP). */
  restorePct?: Partial<Record<Gauge, number>>;
  /** Old: restore amounts are percentages of the maximum (read as `restorePct`; the editor converts it). */
  restorePercent?: boolean;
  /** Changes how a stat grows each level: a consumable changes it for good (a Potion of Defense), gear while it's worn. */
  statRank?: { stat: 'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf'; rank: import('../game/statRanks').Rank };
  /** Equipment: which slot it goes in. */
  slot?: EquipSlot;
  /** Equipment (weapons, armor, spell shards…): how rare it is (default common). Other items have none. */
  rarity?: Rarity;
  /** Fire fuel: game hours it adds to a fire (firewood, coal…). Feed fires by using them (action button). */
  fuel?: number;
  /** Weapons, bows, arrows and spell shards: ailments their hits can give. */
  inflicts?: Inflict[];
  /** Consumables: ailments they cure ('all': every one but Zombie, which must be listed itself). */
  cures?: (Ailment | 'all')[];
  /** Consumables: buffs they give. */
  buffs?: BuffGrant[];
  /** Equipment: ailments it keeps away while worn. */
  protects?: Ailment[];
  /** Weapons, bows, arrows and spell shards: the element they hit with (arrows override the bow's). */
  element?: Element;
  /**
   * Element stones (the Shards pocket): a Fragment, Shard or Heart Stone of an element, worn in a hero's Element
   * slots. It gives the hero that element (its weaknesses too) and stronger hits of it. Fragments fuse into a Shard,
   * Shards into a Heart Stone (Database → Combat → Elements).
   */
  essence?: { element: Element; tier: EssenceTier };
  /** Spell shards (magic slot): the spell. Its icon is held in the hero's hands while it's readied. */
  spell?: SpellDef;
  /** Weapons: class and damage. */
  weapon?: WeaponDef;
  /**
   * Key items: a field use the player switches on and off from the bag, or with the B button once it's assigned
   * there: Light (a lantern's glow around the hero; set the light below) or Water Walk (walk on water of any depth).
   */
  tool?: FieldPower;
  /** Weapons: breaks rock (pickaxes, hammers): mineable boulders and ore veins. */
  mines?: boolean;
  /** Key items: one of the other field uses (Update 118): Dash, Climb, Cut, Fire Bow, Smash Stone, the weather, time or season, fishing, calling the horse, a Skeleton Key. */
  field?: FieldUse;
  /** Consumables (Update 127): heroes whose roleplay answer for `field` is `value` change their view of whoever used it by `points`. */
  reactions?: { field: string; value: string; points: number }[];
  /** A lockpick (Update 119): one is used up each time a pick snaps. With none in the database, picking is free. */
  lockpick?: boolean;
  /** Key items: a Saddle (using it from the bag sends the rented horse home to its stable). */
  saddle?: boolean;
  /**
   * Armor, accessories and shields (Update 114): how the item looks when worn: a clothes-only sheet from the Character
   * Builder (Export clothes only) for masculine and feminine bodies, drawn over the hero's sheet, optionally tinted.
   */
  worn?: { masc?: string; femme?: string; mascAnim?: CharacterAnimLayout; femmeAnim?: CharacterAnimLayout; tint?: string;
    /** Update 120: the Character Builder parts the sheets are built from (the editor rebuilds them when these change). */
    parts?: { masc?: import('../editor/lpcParts').WornPart[]; femme?: import('../editor/lpcParts').WornPart[] };
    /** Update 128: the outfit from the built-in clothing (public/assets/worn/builtin), one pick per slot. */
    top?: WornPick; bottom?: WornPick; accessory?: WornPick;
    /** Update 128: use the custom sheets (masc / femme) instead of the built-in picks. */
    custom?: boolean;
    /** Update 134: custom pictures placed over the hero (Front, Back, Side), per body. */
    customPics?: { masc?: CustomWornBody; femme?: CustomWornBody } };
  /** Key items: carrying it lets the party swim in deep water (Update 109: without one, deep water stops them). */
  swim?: boolean;
  /** A fishing rod: with one in the bag, Talk / interact facing a fishing spot casts. `power` (0 … 100) brings bites sooner and rarer fish. */
  rod?: { power?: number };
  /** A fish: its usual length in cm (each catch is a little bigger or smaller; Records keep the biggest). */
  fish?: { size: number };
  /**
   * Weapons, armor, shields and accessories: what it's made of, the ingot (item id) a forge upgrades it with
   * ('none': it can't be upgraded).
   */
  material?: string;
  /** Ores (and ingots that make better ones): smelted at a forge into `into`, `need` at a time (default 2). */
  smelt?: { into: string; need?: number };
  /** Set at a forge (the game fills this in): the element of the shard set in it, for its glow. */
  enchanted?: Element;
  /** Equipment: the heroes (ids) who can use it. Unset or empty: everyone. */
  users?: string[];
  /** Armor and other worn things: elements whose damage it halves (a fire shard set in it wards off fire). */
  wards?: Element[];
  /**
   * Weapons, bows and shields: the LPC sprite drawn on animated characters (an id from assets/weapons/weapons.json,
   * or a look made in the weapon builder, from Database.weaponSprites).
   */
  sprite?: string;
  /** Weapons and bows: a coloured glow around the weapon while it's in the hand. */
  glow?: WeaponGlow;
  /** Weapons: a coloured streak following each swing. */
  trail?: WeaponTrail;
  /** Armor and accessories: damage taken is reduced by defence / (defence + 50). */
  defense?: number;
  /**
   * EXP for those who sit a battle out: an accessory (EXP Share) gives its wearer `share` percent of what the
   * fighters earned; a key item with `all` (EXP All) gives everyone not fighting that much while it's switched on.
   */
  exp?: { share: number; all?: boolean };
  /** Consumables: levels it gives (Rare Candy: exactly the EXP to the next level, once per level). */
  levelUp?: number;
  /** Consumables: brings a knocked-out hero back (with what it restores; at least 1 HP). Only works on the knocked out. */
  revive?: boolean;
  /** Armor and accessories: how warm it keeps its wearer, 0 (none: coolest in the heat) … 10 (the warmest). */
  warmth?: number;
  /** Consumables: warms (+, a Hot Cocoa) or cools (−, a Chilled Tea) by this much of the cold / heat meter (100: all the way back). */
  warms?: number;
  /** Food, drinks, potions: what it's worth as camping supplies (25 for Rested, 50 for Well Rested). */
  camp?: number;
  /** Recolours the icon (built-in or imported): every colour takes this hue, keeping its shading. */
  iconTint?: string;
  /** Icon effects (Update 133): a glow, an outline and a pattern over it, each in its own colour. */
  iconFx?: IconFx;
  /** Cannot be sold (Update 133): shops won't buy it. */
  noSell?: boolean;
  /** Armor (the armor slot): its armor type's id (unset: guessed from the name, else the first type). */
  armorWeight?: ArmorWeight;
  /** The same against spells. */
  magicDefense?: number;
  /** Equipment: stats it adds while worn (negative takes away: a heavy axe might cost Dexterity). */
  bonus?: Partial<Record<'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf', number>>;
  /** Equipment: extra critical hit chance, in percent. */
  crit?: number;
  /** Arrows: extra damage, and whether the stack never runs out (the basic arrows). */
  ammo?: { damage: number; infinite?: boolean };
  /** Rings: the field power, and its magic cost. */
  ring?: RingDef;
  /** Light rings: the light they give. */
  light?: ItemLight;
}

export interface InventorySetup {
  /** Slots in each tab (pocket) of the bag (default 64: 8 × 8). */
  slots?: number;
  startGold?: number;
  startItems?: { item: string; count: number }[];
  startEquip?: Partial<Record<EquipSlot, string>>;
}

export type MapEnvironment = 'outdoor' | 'indoor' | 'dark';
/** Scenery outside the map: open grass, forest, meadow (bushes and flowers), rocky cliffs, water, or nothing. */
export type BorderKind = 'grass' | 'forest' | 'meadow' | 'plains' | 'rocks' | 'rocky' | 'desert' | 'snow' | 'snowforest' | 'water' | 'none' | 'seamless';
export interface MapBorder {
  /** Old maps: one kind for every side. */
  kind?: BorderKind;
  /** Per side: top (north), bottom (south), left (west), right (east). */
  n?: BorderKind; s?: BorderKind; w?: BorderKind; e?: BorderKind;
  seed: number;
}

export type TitleOption = 'continue' | 'newGame' | 'load' | 'options' | 'credits' | 'exit';
export type PauseOption = 'items' | 'equipment' | 'skills' | 'abilities' | 'journal' | 'log' | 'status' | 'quests' | 'settings' | 'saveLoad' | 'quitToTitle' | 'map' | 'achievements' | 'system';

export interface MenuConfig {
  /** The window theme for menus, text boxes and the HUD (players can pick another in Settings): ember (default), parchment, wood, dwarven, elvish, titan. */
  uiTheme?: string;
  /** The game's touches on its window theme (players can change them in Settings). */
  window?: import('../ui/themes').WindowStyle;
  /** Bar colours everywhere (HUD, menus, battle): health, magic, EXP and the stamina wheel (unset: the defaults). */
  bars?: { hp?: string; mp?: string; xp?: string; sp?: string };
  /** The stamina wheel stays on screen when full (default: it fades away once full). */
  staminaSteady?: boolean;
  /** Health and magic bars (Update 111): solid colours instead of the shaded ones, and square ends instead of round. */
  barsSolid?: boolean;
  barsSquare?: boolean;
  /** Update 130: the Journal's tabs: their order and which are hidden at the start (events can show / hide them). */
  journal?: { order?: JournalTabId[]; hidden?: JournalTabId[] };
  /** Update 126: how meters are filled and shaped, and how the party's orbs look (unset: gradient, pill, sphere). */
  barFill?: 'gradient' | 'flat' | 'glossy' | 'striped' | 'segmented';
  barShape?: 'pill' | 'rect' | 'bevel' | 'thin' | 'blocks';
  orbStyle?: 'sphere' | 'flat' | 'square' | 'diamond';
  /** The Party page's member panels: where they sit, how big, what they show (see ui/partyLayout.ts). */
  partyLayout?: import('../ui/partyLayout').PartyLayout;
  /** The battle screen's pieces (Pocket Handheld; Update 111). */
  battleLayout?: import('../ui/battleLayout').BattleLayout;
  /** Big text on the title screen (defaults to the game's title) and a line under it. */
  titleText?: string;
  subtitle?: string;
  /** Renamed title options, and ones to hide. */
  titleLabels?: Partial<Record<TitleOption, string>>;
  titleHidden?: Partial<Record<TitleOption, boolean>>;
  /** Renamed pause menu entries, and ones to hide. */
  pauseLabels?: Partial<Record<PauseOption, string>>;
  pauseHidden?: Partial<Record<PauseOption, boolean>>;
  /** Start playtests straight on the map instead of at the title screen. */
  skipTitleInPlaytest?: boolean;
  /**
   * Behind the title menu: a map (`map`, looking around `x`, `z`; unset map: the start map), or a picture or a
   * video (paths) with no map behind it. Unset: the start map.
   */
  titleBackground?: { kind: 'map' | 'image' | 'video'; map?: string; x?: number; z?: number; image?: string; video?: string };
  /** The game's lettering: "classic" Game Boy-style pixels (default), "soft" rounder pixels, or "smooth" (not pixel). */
  font?: 'classic' | 'soft' | 'smooth';
}

/** A gauge: health (hp), magic (mp) or stamina (sp). */
export type Gauge = 'hp' | 'mp' | 'sp';

export interface PlayerConfigData {
  /** Maximum (and starting) health, magic and stamina. */
  max?: Partial<Record<Gauge, number>>;
  /** Points regained per second. */
  regen?: Partial<Record<Gauge, number>>;
  /** Gauges that don't refill on their own (only events or items restore them). */
  noRegen?: Partial<Record<Gauge, boolean>>;
  /** Movement speeds in tiles per second. */
  speed?: Partial<Record<'walk' | 'run' | 'wade' | 'swim' | 'crawl' | 'climb', number>>;
  /** Stamina costs: per second for run, climb and swim; per jump for jump. */
  cost?: Partial<Record<'run' | 'climb' | 'swim' | 'jump', number>>;
  /** After running out, stamina must refill to this percentage before run, jump and climb work again. */
  recoverPercent?: number;
  /** Seconds after using stamina before it starts to refill. */
  regenDelay?: number;
  /** Health lost per second while swimming with no stamina left. */
  drownDamage?: number;
  /** Walking off ledges: collide, walk off any, or walk off except into cells of height `min` … `max` (steps). */
  ledges?: Partial<{ mode: 'collision' | 'walk' | 'limited'; min: number; max: number }>;
}

/* ------------------------------------------------------------------ combat */

export type EnemyBehaviour = 'melee' | 'ranged' | 'charger';

/** What an enemy is made of: the sound and the bits that fly when it's hit. */
export type Material = 'flesh' | 'plant' | 'metal' | 'stone' | 'wood' | 'bone' | 'liquid' | 'gel' | 'crystal' | 'spirit' | 'cloth';
/** What flies off when an enemy is hit. */
export type ImpactFx = 'blood' | 'sparks' | 'stone' | 'wood' | 'splash' | 'bone' | 'crystal' | 'wisps';

export interface EnemyDef {
  id: string;
  name: string;
  /** What the Journal's Bestiary says about it. */
  description?: string;
  /** Left out of the Bestiary (a story-only foe, a training dummy). */
  noBestiary?: boolean;
  /** Recolour its picture (RPG Maker style): hue turned this many degrees, saturation ×, and a colour mixed in. */
  tint?: { hue?: number; sat?: number; color?: string; amount?: number };
  /** Turn-based battles: raise (+) or lower (−) its picture, in tiles, when its art floats or sinks. */
  battleOffset?: number;
  /**
   * How it looks: a character from the database (a sheet, like the player's), a flat image (one picture, brought to
   * life with generic motion: breathing, sliding, hopping or flying), or a built-in monster sheet.
   */
  look: { character?: string; monster?: string; image?: string; flat?: FlatLook };
  hp: number;
  /** Damage of its attack, and its defence (reduces damage like the player's armor). */
  damage: number;
  /** Turn-based battles: each one's health is rolled this many percent either side of `hp` (0: always the same). */
  hpVariance?: number;
  /** How much each of its hits varies, percent either side (default 10). */
  damageVariance?: number;
  defense?: number;
  /** Defence against spells (default: the same as its defence). */
  magicDefense?: number;
  /** Its attack is a spell (the hero's Magic Defence counts, not Defence; ranged casters throw firebolts). */
  attackType?: 'physical' | 'magic';
  /**
   * Light: "avoid" keeps away from a hero lit by a fire or a light ring (creatures of the dark); "drawn" spots a lit-up
   * hero much sooner (bandits). Missing: light makes no difference beyond being easier to see.
   */
  light?: 'avoid' | 'drawn';
  /** Up to two elements (hits are weighed against both), and elements it's immune to or absorbs (heals from). */
  elements?: Element[];
  immune?: Element[];
  absorb?: Element[];
  /**
   * Its advanced form: at this level or higher (a level range, or dynamic levels catching up with the party) the
   * enemy `into` (its own Database entry) comes out instead. The Bestiary shows them linked.
   */
  advance?: { into: string; level: number };
  /** The element its attacks hit with (default: its first element). */
  attackElement?: Element;
  /** Ailments its hits can give, ailments it can't get, and undead (always a zombie: healing hurts it). */
  inflicts?: Inflict[];
  resists?: Ailment[];
  undead?: boolean;
  /** Tiles per second. */
  speed: number;
  behaviour: EnemyBehaviour;
  /** How close it gets before attacking (ranged: the distance it shoots from). */
  attackRange: number;
  /** Seconds between attacks, and the wind-up before each one (the tell the player reacts to). */
  cooldown: number;
  windup: number;
  /** Sight range in tiles (in full light; darkness and sneaking shorten it), field of view in degrees, and hearing range. */
  sight: number;
  fov: number;
  hearing: number;
  xp: number;
  gold?: [number, number];
  /** The level its numbers (health, damage, defence, EXP, gold) are set for (default 1). Spawns can roll others. */
  level?: number;
  drops?: { item: string; chance: number; count?: number }[];
  /** The built-in icon it holds while attacking ("sword", "bow", "axe"…; '' for nothing). People default to a sword (archers a bow). */
  weapon?: string;
  /** Animated (LPC) people: the weapon and shield sprites they carry instead of the icon ('' for none). */
  weaponSprite?: string;
  shieldSprite?: string;
  /** Bosses: can't be killed outright by a sneak attack (for later perks). */
  boss?: boolean;
  /** Lives in water (Update 109): can be hooked while fishing, starting a battle. */
  water?: boolean;
  /** Sprite size (1 = normal). */
  scale?: number;
  /** Turn-based battles: how quickly its turns come round (like the heroes' Agility; default from its speed). */
  agility?: number;
  /** Turn-based: chance (%) to dodge the party's spells (default 0; heroes dodge with Magic Defence). */
  spellEvasion?: number;
  /** Turn-based battles: chance (%) its attacks land (default 95), to dodge the party's weapon hits (default 0), and to shrug off ailments (default 0). */
  accuracy?: number;
  evasion?: number;
  ailmentResist?: number;
  /** Critical hit chance, % (default 5). */
  crit?: number;
  /** What it's made of (Database → Enemies → Impact): the sound a sword or arrow makes hitting it, and its effects. */
  material?: Material;
  /** Up to two effects when it's hit (unset: its material's), each with an optional colour (green ooze, golden sap). */
  impactFx?: { kind: ImpactFx; color?: string }[];
  /** Bosses with stat blocks on: an overdrive gauge that fills as it's hurt; full, its next move hits half again as hard. */
  overdrive?: boolean;
  /** Turn-based battles: what else it can do on its turn, and how often it uses its plain attack (default 1; 0: never). */
  actions?: EnemyAction[];
  attackWeight?: number;
  /** Its plain attack breaks a spell being charged (turn-based). */
  counterspell?: boolean;
}

/**
 * Something an enemy can do on its turn in a turn-based battle, besides its plain attack.
 * attack: a hit (its damage × power); spell: a magic hit (its damage × power, Magic Defence counts);
 * heal: health back for itself or a hurt friend (power % of their health); guard: half damage, a little health back
 * and no ailments until its next turn.
 */
export interface EnemyAction {
  name: string;
  /** Buff: gives `buffs` (to itself, its side, or, for debuffs like Slow, the party). */
  kind: 'attack' | 'spell' | 'heal' | 'guard' | 'buff';
  buffs?: BuffGrant[];
  /** Buffs: on itself (default), everyone on its side, or the party (one or all, by `targets`). */
  buffTarget?: 'self' | 'allies' | 'foes';
  /** Buff actions: the battle's weather it brings, and for how many rounds (0: the whole battle; default 5). */
  weather?: BattleWeather;
  weatherTurns?: number;
  /** Attacks and spells: × its damage (default 1). Heals: % of the target's health (default 30). */
  power?: number;
  element?: Element;
  inflicts?: Inflict[];
  /** One of the party, or all of them. */
  targets?: 'one' | 'all';
  /** How often it's chosen, against the others (default 1). */
  weight?: number;
  /** Only when its own health is below this % (e.g. a heal at 40). */
  hpBelow?: number;
  /** Breaks a spell being charged. */
  counterspell?: boolean;
}

/** A kind of water on a map: how it looks and flows, and what standing in it does. */
export interface WaterStyle {
  name: string;
  /** Its colour (deep water shows it fullest). */
  color: string;
  /** 0 crystal clear … 1 muddy (default 0.5). */
  murk?: number;
  /** Surface: 0 glassy … 2 rough (default 1). */
  bumpy?: number;
  /** Current (tiles per second, 0 still) and the way it flows (degrees, 0 = east, 90 = south). */
  flow?: number;
  flowDir?: number;
  /** Glows by itself (lava, poison goo): 0 … 1. */
  glow?: number;
  /**
   * How it's drawn: 'toon' (flat colour, drifting wave lines, a foam outline along its shores and a dark ring round
   * rocks in it, like the handheld games) or 'real' (lit ripples and glints). Default toon, or real for glowing styles.
   */
  look?: 'toon' | 'real';
  /** Toon: how many wave lines (0 none … 1 lots; default 0.5). */
  lines?: number;
  /** Toon: no foam outline along the shore. */
  noFoam?: boolean;
  /** A mark drawn on its water in the map editor only (~, -, ≈…), to tell styles of the same colour apart. */
  symbol?: string;
  /** Being in it gives this ailment (a % chance every half second): poison goo poisons, lava burns. */
  ailment?: Ailment;
  chance?: number;
}

/** A flat-image enemy: how it moves and which way the picture faces. */
export interface FlatLook {
  /** slide: glides with a little sway; hop: bounces along; fly: hovers above the ground and bobs. Default slide. */
  move?: 'slide' | 'hop' | 'fly';
  /** The way the picture faces: it's mirrored to face the other way. 'none' never mirrors. Default right. */
  faces?: 'left' | 'right' | 'none';
  /** Height in tiles (before Size); the width follows the picture. Default 1. */
  height?: number;
  /** Breathes (swells gently) while standing. Default on. */
  breathe?: boolean;
}

/** Combat tuning, all optional (see game/combat/config.ts for the defaults). */
/** Which battle system the game uses: action combat on the map, or turn-based battles (FFX / classic JRPG style). */
/** Turn-based battles: who acts next. ctb: FFX-style (fast fighters act more often; actions have weight); rounds: everyone once a round, fastest first. */
export type TurnOrder = 'ctb' | 'rounds';

/** Database → Combat → Battle system: turn-based settings (only what differs from the defaults is kept). */
export interface TurnBasedData {
  order?: TurnOrder;
  /** Chance to run away (%) when both sides are equally fast; each point of Dexterity / Agility between them moves it 2%. */
  flee?: number;
  /** Enemies this many tiles from the one that started the fight join it (up to `maxEnemies`). */
  joinRadius?: number;
  maxEnemies?: number;
  /** Damage multipliers: the party's hits and the enemies' hits (enemies attack only on their turns, so they hit harder). */
  partyDamage?: number;
  enemyDamage?: number;
  /** Seconds after a battle (won or fled) before another can start. */
  grace?: number;
  /** Guarding gives back this % of the guard's health (default 10). */
  guardHeal?: number;
  /** Additions: one set per hero in the menu (Legend of Dragoon), or chosen from a list each Attack. */
  additions?: 'set' | 'choose';
  /** Additions' timing: pressed by the player, or automatic (every strike lands; for accessibility). */
  additionTiming?: 'press' | 'auto';
  /** The battle screen's look: 'dragon' (default; Legend of Dragoon-like) or 'fantasy' (Final Fantasy-like). */
  layout?: 'dragon' | 'fantasy' | 'pocket';
  /** The hero always fights: can't be swapped onto the bench (default: anyone can). */
  heroLocked?: boolean;
  /** Party members follow the hero on the map (default on). Off: only the hero walks the map. */
  partyFollows?: boolean;
  /** Monster stat blocks across the top of the battle screen (default off). */
  statBlocks?: boolean;
  /** Status pills beside a fighter's name: short tags ("PSN", default) or full words ("POISONED"). */
  statusWords?: 'short' | 'full';
  /** Each ailment's pill: colour, text colour, tag and word (only what differs from the defaults). */
  statusPills?: Partial<Record<string, { color?: string; ink?: string; tag?: string; word?: string; stays?: boolean }>>;
  /**
   * Group (default: up to three a side, the turn order bar) or Single (Pokémon-style: one hero out at a time, swapped
   * any time, both sides pick and the faster goes first, no turn bar).
   */
  mode?: 'group' | 'single';
  /** Single mode: heroes who can be swapped in (the lineup's first, 1 – 8; default 3). */
  singleParty?: number;
  /** Single mode: how foes come out when the troop, the map and the event don't say (default: one at random, a wild encounter). */
  singlePick?: EncounterPick;
}

/**
 * EXP bonuses in battle, in percent of the foe's EXP: the finishing blow, finishing with a weakness, each Addition
 * strike landed (a perfect one twice), an Addition completed, and no one knocked out (of what each earned).
 */
export interface ExpBonus { finish: number; weak: number; strike: number; complete: number; noKo: number }

/** Percent each enemy level above its own adds (and each level below takes away). */
export interface EnemyGrowth { hp: number; attack: number; defense: number; xp: number; gold: number }

export interface CombatData {
  /** The Journal's Bestiary: defeats needed before an enemy's numbers, elements and drops show. */
  bestiary?: Partial<{ stats: number; elements: number; drops: number }>;
  turnBased?: TurnBasedData;
  /** Forges: how many times one item can be upgraded, and the percent of damage or defence each upgrade adds. */
  forge?: { maxLevel?: number; percent?: number; enchantPercent?: number };
  unarmedDamage?: number;
  /** Per melee class: swings per second multiplier, reach in tiles, damage multiplier. */
  classes?: Partial<Record<WeaponClass, { speed?: number; reach?: number; damage?: number }>>;
  bow?: { drawTime?: number; arrowSpeed?: number; lockRange?: number };
  lockRange?: number;
  /** kindle: seconds a fire attack keeps an out-of-fuel fire (a torch, a campfire) lit. */
  fire?: { mp?: number; damage?: number; speed?: number; range?: number; kindle?: number };
  campSafe?: number;
  /** EXP bonuses (percent of the foe's EXP). */
  exp?: Partial<ExpBonus>;
  /** Element stones: what each tier gives, fusing, drops (see EssenceRules). */
  essence?: Partial<import('../game/essence').EssenceRules>;
  /** Enemies above (or below) their own level: how much each level adds to their numbers, in percent. */
  enemyGrowth?: Partial<EnemyGrowth>;
  /** Experience to reach level 2, and how much more each level after needs (1.3 = 30% more). */
  xpBase?: number;
  xpGrowth?: number;
  /** Highest level the player can reach (default 50). */
  maxLevel?: number;
  /**
   * Hand-set EXP table (Database → Player → EXP progression): entry i is the EXP needed to go from level i + 1 to
   * level i + 2. Levels it doesn't cover follow the curve above. Without it the whole table follows the curve.
   */
  expTable?: number[];
  /** Skill points per level up, and to start a new game with. */
  pointsPerLevel?: number;
  /** Stat points per level up (default 2), spent on the Status screen. */
  statPointsPerLevel?: number;
  /** Party (shared) skill tree points per hero level up (default 1). */
  sharedPointsPerLevel?: number;
  startPoints?: number;
}

/* ------------------------------------------------------------------ skills */

/** What a skill changes. Percentages add up across ranks and skills; flags are on at 1. */
export type SkillStat =
  | 'maxHp' | 'maxMp' | 'maxSp'
  | 'meleeDamage' | 'swingSpeed' | 'lightDamage' | 'mediumDamage' | 'heavyDamage' | 'lightSpeed' | 'mediumSpeed' | 'heavySpeed'
  | 'bowDamage' | 'drawSpeed' | 'bowRange'
  | 'sneakHide' | 'quietSteps' | 'sneakDamage' | 'silentShot' | 'assassinate'
  | 'blockStamina' | 'guardHeal' | 'spellFire'
  | 'spellDamage' | 'spellCost' | 'spellRange' | 'lightReach' | 'proficientMedium' | 'proficientHeavy'
  | 'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf' | 'crit';

export interface SkillTreeDef {
  id: string; name: string; color?: string;
  /** A Party tree: learned once with Party points, and every skill in it counts for the whole party (new members too). */
  shared?: boolean;
}

export interface SkillNode {
  id: string;
  /** Which tree (tab) it's in. */
  tree: string;
  name: string;
  description?: string;
  /** Position in the tree's grid: column (x) and row (y, 0 at the bottom, growing upwards like Skyrim's constellations). */
  x: number; y: number;
  /** Needs at least one rank in each of these first. */
  parents?: string[];
  /** How many times it can be taken (default 1). */
  ranks?: number;
  /** Skill points per rank (default 1). */
  cost?: number;
  /** Level needed (optional). */
  level?: number;
  /** Locked until (Update 113): a quest is done, a key item is carried, a switch is on (each optional). */
  needs?: { quest?: string; item?: string; switch?: string };
  /** What each rank adds. */
  effects: { stat: SkillStat; value: number }[];
  /** Older databases: a spell shard (item id) the skill gave. Shards are items now (moved to spell perks on load). */
  teaches?: string;
  /** Teaches a spell (Database → Spells): rank r of this skill gives the spell's rank r + spellRankFrom − 1. */
  teachesSpell?: string;
  spellRankFrom?: number;
  /** Teaches an Addition (Database → Additions). */
  teachesAddition?: string;
  /** Trains its hero with these weapon types / armor types ("armor:heavy") / shields: Trained whatever their class says. */
  trains?: GearKind[];
}

/* ------------------------------------------------------------------ learned spells, Additions, classes */

/** A spell heroes learn (Database → Spells), from skill-tree skills, events and trainers. */
export interface SpellEntry {
  id: string;
  name: string;
  description?: string;
  /** Its icon in menus: a built-in icon ("builtin:<name>"); unset: its element's icon. */
  icon?: string;
  /** Recolours its icon. */
  iconTint?: string;
  /**
   * bolt: a magic hit (in action mode, the bolt the magic button throws); heal: health back for the party;
   * support (turn-based): only its buffs or debuffs (Haste, Slow, Protect…).
   */
  kind: 'bolt' | 'heal' | 'support';
  /** Buffs (or debuffs like Slow) it gives each target, on top of its damage or healing. */
  buffs?: BuffGrant[];
  /** Support spells: cast on the caster's side (default), the other side (Slow on the enemies), or either. */
  supportTarget?: 'allies' | 'foes' | 'any';
  /** Turn-based: chance (%) to land against a target with no spell evasion (default 100); Magic Defence dodges it. */
  accuracy?: number;
  /** Turn-based: never misses. */
  sure?: boolean;
  /**
   * A spell addition (turn-based): the buttons the caster presses in order as it goes off (each rank above the first
   * adds one more, going round the sequence again); a mistake or running out of time weakens it, a fast clean cast
   * strengthens it. Empty: it just goes off.
   */
  sequence?: FaceButton[];
  /** Seconds to press them all (default: 0.8 a button, plus 1.2). */
  seqTime?: number;
  /** Support spells: a clean cast makes its buffs stronger (default) or last longer (better for whole-battle buffs and weather). */
  seqBonus?: 'stronger' | 'longer';
  /** Turn-based: the battle's weather it brings (rain makes water stronger and fire weaker…), for turns or the whole battle. */
  weather?: BattleWeather;
  /** Rounds the weather lasts (default 5); 0: the whole battle. */
  weatherTurns?: number;
  /** Rank 1's damage (bolts) or health given back (heals), before the caster's Magic. */
  power: number;
  /** Rank 1's magic cost. */
  mp: number;
  element?: Element;
  inflicts?: Inflict[];
  /** One target or all of them (turn-based). */
  targets?: 'one' | 'all';
  color?: string;
  /** Highest rank (default 1). Each rank above the first: +rankPower % power, +rankMp % magic, one more turn to charge. */
  maxRank?: number;
  rankPower?: number;
  rankMp?: number;
  /** Turns rank 1 takes to charge (default 0: cast at once). */
  charge?: number;
  /** Turn-based: the caster's call-out as it goes off ("Fire!"), and a chant while it charges (sound sources). */
  sound?: string;
  chant?: string;
  /** Action mode: bolt speed and range in tiles (0 / unset: Database → Combat's spell values). */
  speed?: number;
  range?: number;
}

export type FaceButton = 'A' | 'B' | 'X' | 'Y';

/** One strike of an Addition: its damage and the button to press as the ring closes. */
export interface AdditionStrike {
  /** × the hero's attack. */
  power: number;
  /** The button to press ('any': any of them). Default A. */
  button?: FaceButton | 'any';
  /** Seconds the ring takes to close (default 0.7), and the timing window in seconds (default 0.24). */
  time?: number;
  window?: number;
}

/** A Legend of Dragoon-style Addition: a string of timed strikes, stronger as it's mastered by use. */
export interface AdditionDef {
  id: string;
  name: string;
  description?: string;
  strikes: AdditionStrike[];
  /** Highest rank (default 5), and completions needed for each rank (default 6; rank n needs n × this in all). */
  maxRank?: number;
  usesPerRank?: number;
  /** Each rank above the first: +rankDamage % damage (default 12), +rankWindow % wider timing (default 6). */
  rankDamage?: number;
  rankWindow?: number;
  /** The hero's call-out when the whole string lands ("Quick slash!"): a sound source. */
  sound?: string;
}

/** A class: the skill trees its members learn from. Changing class keeps everything already learned. */
export interface ClassDef {
  id: string;
  name: string;
  description?: string;
  /** Stats added once, for good, when a hero joins the class (a Fighter's Strength and Endurance). */
  bonus?: Partial<Record<'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf', number>>;
  /** Each weapon type, armor weight and shields: trained, untrained (weaker) or can't use. Unset: trained. */
  gear?: Partial<Record<GearKind, GearSkill>>;
  /** Skill tree ids (Database → Skills). */
  trees: string[];
  color?: string;
}

/** What a hero has learned and chosen: spell ranks, Additions (with how often each was completed), class. */
export interface AbilityData {
  spells?: Record<string, number>;
  additions?: Record<string, number>;
  /** The Addition used by Attack (turn-based, "set per character"). */
  addition?: string;
  /** The learned bolt readied for the magic button in action mode (and its rank). */
  fieldSpell?: string;
  fieldRank?: number;
  /** Their class, and every class they can change to (held before or unlocked). */
  cls?: string;
  classes?: string[];
  /** Every class they've been (each gave its one-time stat boost). */
  joined?: string[];
}

export interface SkillsData { trees: SkillTreeDef[]; nodes: SkillNode[] }

/** A fishing spot's catch table: the fish (and junk) it gives and how often. */
export interface FishZone {
  name: string;
  /** Shown on the map editor's fishing overlay. */
  color?: string;
  fish: FishCatch[];
  /** Water enemies (Update 109): the chance (%) a bite is a monster that starts a battle (unset: 10 when there are any). */
  monsterChance?: number;
  /** Which water enemies bite here (unset: every enemy marked Water). */
  monsters?: string[];
}
/** One thing a spot can give: its weight against the others (a chance), and when it bites. */
export interface FishCatch {
  item: string;
  /** Weight against the others in the table (they needn't add up to 100). */
  chance: number;
  /** Only by day or only at night (default: any time). */
  time?: 'day' | 'night';
  /** Rare: a better rod makes it more likely. */
  rare?: boolean;
}

/** The elements on the body (game/body.ts has the defaults). */
export interface BodyConfig {
  /** Off: nobody gets cold, hot or wet. */
  off?: boolean;
  /** What a hero feels (°F, after their gear's Warmth) to get Cold, Freezing, Hot, Overheating. */
  coldAt?: number;
  freezingAt?: number;
  hotAt?: number;
  overheatAt?: number;
  /** Seconds (real) for the meter to fill from normal; to recover; to dry off. */
  fill?: number;
  recover?: number;
  dry?: number;
  /** Freezing / Overheating: lose this % of max health every this many steps (never below 1). */
  chipSteps?: number;
  chipPct?: number;
  /** Show Comfortable whenever nothing else is shown (off: only when a fire, shelter or gear is keeping it off). */
  comfortAlways?: boolean;
  /** Seconds a hero's panel rumbles when they take a chip of damage. */
  rumble?: number;
  /** Poison and Burn out of battle: lose this % of max health every this many steps, down to 1, then they wear off. */
  ailmentSteps?: number;
  ailmentPct?: number;
  /** Resting and camping (Update 106): how long Rested and Well Rested last, in game hours (2 and 1.5). */
  restedHours?: number;
  wellRestedHours?: number;
  /** Tint a hero's health bar the colour of their ailment (Poison purple, Burn orange…); off by default. */
  hpTint?: boolean;
  /** How much slower (%): wet, Cold / Hot, Freezing / Overheating. */
  slow?: { wet?: number; mild?: number; severe?: number };
}

/** What a party member does at a rest spot in a safe zone. */
export type RestActivity = 'sit' | 'lie' | 'magic' | 'train';
