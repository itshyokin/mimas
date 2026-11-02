/**
 * GBA Studio data (public/data/gba.json): palettes, painted tiles and sprites.
 * Images live in public/gba/tiles and public/gba/sprites as PNGs that only use
 * their palette's colors (plus transparent), so tools/export.py can turn them
 * into GBA graphics without changing a pixel.
 */

export const CELL = 16;
/** Usable colors per palette (index 0 is always transparent on the GBA). */
export const PALETTE_SIZE = 15;

export interface GbaPalette {
  id: string;
  name: string;
  /** 15 colors as #rrggbb, already snapped to the GBA's 15-bit colors. */
  colors: string[];
}

export type TileType =
  | 'ground' | 'decor' | 'path' | 'water' | 'cliff' | 'ledge' | 'stairs' | 'ladder' | 'tallgrass' | 'object' | 'door';

export type Passage = 'O' | 'X' | '*';

export interface GbaTile {
  id: string;
  name: string;
  type: TileType;
  palette: string;
  /** Relative to public/, e.g. "gba/tiles/grass.png". */
  image: string;
  /** Animation frames (water; stacked downwards in the image). */
  frames?: number;
  /** Size in cells, for objects. */
  w?: number;
  h?: number;
  /** Walkable (O), blocked (X) or walk-behind (*), for decor and doors. */
  pass?: Passage;
}

export type SpriteKind = 'overworld' | 'backsprite' | 'battler';

export interface GbaSprite {
  id: string;
  name: string;
  kind: SpriteKind;
  palette: string;
  image: string;
}

export interface GbaData {
  version: 1;
  palettes: GbaPalette[];
  tiles: GbaTile[];
  sprites: GbaSprite[];
  /** The sprite the player walks around as in the ROM. */
  player?: string;
  /** GBA maps, by id (each in public/data/gbamaps/<id>.json). */
  maps?: string[];
  /** The map the ROM starts on (a GBA map id). Without it the ROM uses the Saturn map in mimas.json. */
  startMap?: string;
}

/** Something placed on the objects layer. `t` is an index into the map's tile list (+1). */
export interface GbaPlacement {
  t: number;
  x: number;
  y: number;
  /** Which piece of a ledge (0-2 south left / middle / right, 3-5 east top / middle / bottom, 6-8 west top / middle / bottom). */
  p?: number;
}

export type Facing = 'down' | 'up' | 'left' | 'right';
export const FACINGS: Facing[] = ['down', 'up', 'left', 'right'];

/** What an event does, in order. */
export type GbaCommand =
  | { type: 'text'; text: string }
  | { type: 'transfer'; map: string; x: number; y: number; dir?: Facing };

/**
 * Something on the map the player can talk to or step on: a person, a sign, a door.
 * `action` events run when the player faces them and presses A; `touch` events run
 * when the player steps onto them (or walks into them when they're blocked).
 */
export interface GbaEvent {
  id: number;
  name: string;
  x: number;
  y: number;
  /** An overworld sprite id (people); none for signs, doors and invisible triggers. */
  sprite?: string;
  dir?: Facing;
  trigger: 'action' | 'touch';
  /** People block the way (only events with a sprite). */
  solid?: boolean;
  commands: GbaCommand[];
}

/** Lines of a text box: at most this many characters, two lines a page (the ROM's font fits this). */
export const TEXT_LINE = 30;

/** Split text into pages of two lines (word-wrapped; a blank line starts a new page). */
export function textPages(text: string): string[][] {
  const pages: string[][] = [];
  for (const para of text.replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines: string[] = [];
    for (const raw of para.split('\n')) {
      let line = '';
      for (const word of raw.split(/\s+/).filter(Boolean)) {
        let w = word;
        while (w.length > TEXT_LINE) { if (line) { lines.push(line); line = ''; } lines.push(w.slice(0, TEXT_LINE)); w = w.slice(TEXT_LINE); }
        if (!line) line = w;
        else if (line.length + 1 + w.length <= TEXT_LINE) line += ' ' + w;
        else { lines.push(line); line = w; }
      }
      if (line) lines.push(line);
    }
    for (let i = 0; i < lines.length; i += 2) pages.push(lines.slice(i, i + 2));
  }
  return pages.length ? pages : [['']];
}

/**
 * A GBA map. Grid values are indexes into `tiles` plus one (0 = nothing).
 * Layers, bottom to top: ground, terrain (paths and water, corners picked
 * automatically), cliffs (a ring per tier: `level` k means tiers 1..k), objects.
 */
export interface GbaMap {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: string[];
  ground: number[][];
  terrain: number[][];
  cliff: number[][];
  level: number[][];
  objects: GbaPlacement[];
  /** RPG Maker-style overrides per cell: '.' none, 'O' walkable, 'X' blocked. */
  pass: string[];
  start?: [number, number];
  /** Which way the player faces at the start. */
  dir?: Facing;
  events?: GbaEvent[];
}

export const MAX_TIER = 4;

export function blankMap(id: string, name: string, w: number, h: number, ground?: string): GbaMap {
  const grid = (v = 0) => Array.from({ length: h }, () => Array<number>(w).fill(v));
  return {
    id, name, width: w, height: h, tiles: ground ? [ground] : [],
    ground: grid(ground ? 1 : 0), terrain: grid(), cliff: grid(), level: grid(), objects: [],
    pass: Array.from({ length: h }, () => '.'.repeat(w)), start: [Math.floor(w / 2), Math.floor(h / 2)],
  };
}

/** Resize every layer (new cells are empty, or the given ground). */
export function resizeMap(m: GbaMap, w: number, h: number, fillGround = 0): void {
  const fit = (g: number[][], fill = 0) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => g[y]?.[x] ?? fill));
  m.ground = fit(m.ground, fillGround);
  m.terrain = fit(m.terrain);
  m.cliff = fit(m.cliff);
  m.level = fit(m.level);
  m.pass = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => m.pass[y]?.[x] ?? '.').join(''));
  m.objects = m.objects.filter((o) => o.x < w && o.y < h);
  if (m.events) m.events = m.events.filter((e) => e.x < w && e.y < h);
  m.width = w;
  m.height = h;
  if (m.start && (m.start[0] >= w || m.start[1] >= h)) m.start = [Math.min(m.start[0], w - 1), Math.min(m.start[1], h - 1)];
}

/* ------------------------------------------------------------------ tile types */

export interface CellGuide {
  /** Column and row in the sheet (in cells). */
  x: number;
  y: number;
  label: string;
  /** Shown hatched: leave this cell empty (cliffs: the ground shows through). */
  empty?: boolean;
}

export interface TileTypeInfo {
  label: string;
  /** One line shown under the type picker. */
  help: string;
  cols: number;
  rows: number;
  guides: CellGuide[];
  /** How the type behaves in game, shown to the user. */
  behaviour: string;
  /** The 13-piece set (3x3 block + inner corners), previewed as a shape. */
  autotile?: boolean;
  animated?: boolean;
  sized?: boolean;
  passChoice?: boolean;
}

/** The 13-piece layout: a 3x3 block and the four inner corners beside it. */
export const PIECES = {
  tl: [0, 0], t: [1, 0], tr: [2, 0], itl: [3, 0], itr: [4, 0],
  l: [0, 1], c: [1, 1], r: [2, 1], ibl: [3, 1], ibr: [4, 1],
  bl: [0, 2], b: [1, 2], br: [2, 2],
} as const;
export type Piece = keyof typeof PIECES;

const pieceGuides = (center: string, emptyCenter = false): CellGuide[] => [
  { x: 0, y: 0, label: 'Outer corner' }, { x: 1, y: 0, label: 'Top edge' }, { x: 2, y: 0, label: 'Outer corner' },
  { x: 0, y: 1, label: 'Left edge' }, { x: 1, y: 1, label: center, empty: emptyCenter }, { x: 2, y: 1, label: 'Right edge' },
  { x: 0, y: 2, label: 'Outer corner' }, { x: 1, y: 2, label: 'Bottom edge' }, { x: 2, y: 2, label: 'Outer corner' },
  { x: 3, y: 0, label: 'Inner corner ↖' }, { x: 4, y: 0, label: 'Inner corner ↗' },
  { x: 3, y: 1, label: 'Inner corner ↙' }, { x: 4, y: 1, label: 'Inner corner ↘' },
  { x: 3, y: 2, label: 'Not used', empty: true }, { x: 4, y: 2, label: 'Not used', empty: true },
];

export const TILE_TYPES: Record<TileType, TileTypeInfo> = {
  ground: {
    label: 'Ground', cols: 1, rows: 1, guides: [{ x: 0, y: 0, label: 'Ground' }],
    help: 'One 16×16 tile that repeats. The preview shows it tiled, so seams are easy to spot.',
    behaviour: 'Walkable.',
  },
  decor: {
    label: 'Decoration', cols: 1, rows: 1, guides: [{ x: 0, y: 0, label: 'Decoration' }], passChoice: true,
    help: 'Flowers, rocks, signs: drawn over the ground. Leave the background transparent.',
    behaviour: 'You choose: walkable, blocked or walk behind.',
  },
  path: {
    label: 'Path / transition', cols: 5, rows: 3, guides: pieceGuides('Middle'), autotile: true,
    help: 'Paint the 13 pieces. The preview builds a path shape from them so you can check every corner.',
    behaviour: 'Walkable. The map editor picks the right piece for each spot.',
  },
  water: {
    label: 'Water', cols: 5, rows: 3, guides: pieceGuides('Open water'), autotile: true, animated: true,
    help: 'Shore pieces around open water. Add frames for waves; the preview plays them.',
    behaviour: 'Blocks walking until Surf is unlocked.',
  },
  cliff: {
    label: 'Cliff / hill', cols: 5, rows: 3, guides: pieceGuides('Leave empty: ground shows', true), autotile: true,
    help: 'Paint the edges only. The middle stays empty so the ground shows on top, and the bottom edge is the cliff face. Stack two rings for a taller cliff.',
    behaviour: 'Edges and face block walking; the top is walkable. Stairs or a ladder get you up.',
  },
  ledge: {
    label: 'Ledge', cols: 5, rows: 3,
    guides: [
      { x: 0, y: 0, label: 'South: left end' }, { x: 1, y: 0, label: 'South: middle' }, { x: 2, y: 0, label: 'South: right end' },
      { x: 3, y: 0, label: 'East: top' }, { x: 3, y: 1, label: 'East: middle' }, { x: 3, y: 2, label: 'East: bottom' },
      { x: 4, y: 0, label: 'West: top' }, { x: 4, y: 1, label: 'West: middle' }, { x: 4, y: 2, label: 'West: bottom' },
      ...[0, 1, 2].flatMap((x) => [1, 2].map((y) => ({ x, y, label: 'Not used', empty: true }))),
    ],
    help: 'One-way drops. South ledges have ends and a middle for long rows; east and west ledges have a top, middle and bottom for long columns. “Make West from East” mirrors the east pieces.',
    behaviour: 'Hop down over it in its direction; blocks the other way.',
  },
  stairs: {
    label: 'Stairs', cols: 1, rows: 1, guides: [{ x: 0, y: 0, label: 'Stairs' }],
    help: 'Put stairs into a cliff ring to make the way up.', behaviour: 'Walkable, through cliffs.',
  },
  ladder: {
    label: 'Ladder', cols: 1, rows: 1, guides: [{ x: 0, y: 0, label: 'Ladder' }],
    help: 'Like stairs, for steep climbs.', behaviour: 'Walkable up and down only.',
  },
  tallgrass: {
    label: 'Tall grass', cols: 2, rows: 1, guides: [{ x: 0, y: 0, label: 'Still' }, { x: 1, y: 0, label: 'Rustling' }],
    help: 'Two frames: still, and rustling when someone walks through.', behaviour: 'Walkable; random battles later.',
  },
  object: {
    label: 'Tree / big object', cols: 2, rows: 2, guides: [], sized: true,
    help: 'Trees, houses, statues. The bottom row blocks; the rows above are drawn over the player.',
    behaviour: 'Bottom row blocks; the top is walk-behind.',
  },
  door: {
    label: 'Door / warp', cols: 1, rows: 1, guides: [{ x: 0, y: 0, label: 'Door' }], passChoice: true,
    help: 'Doors, cave mouths, warp pads.', behaviour: 'Takes you to another map (set on the map).',
  },
};

/** The nine ledge pieces, in the order the map stores them (`p`). */
export const LEDGE_PIECES = [
  'South · left end', 'South · middle', 'South · right end',
  'East · top', 'East · middle', 'East · bottom',
  'West · top', 'West · middle', 'West · bottom',
];

/** Where ledge piece `p` sits in the sheet (column, row). */
export function ledgeCell(p: number): [number, number] {
  const q = Math.max(0, Math.min(8, p));
  return q < 3 ? [q, 0] : q < 6 ? [3, q - 3] : [4, q - 6];
}

/** Which way ledge piece `p` drops: south, east or west. */
export const ledgeDir = (p: number): 'S' | 'E' | 'W' => (p < 3 ? 'S' : p < 6 ? 'E' : 'W');

export function tileSize(t: Pick<GbaTile, 'type' | 'w' | 'h' | 'frames'>): { cols: number; rows: number; frames: number } {
  const info = TILE_TYPES[t.type];
  const cols = info.sized ? Math.max(1, Math.min(8, t.w ?? info.cols)) : info.cols;
  const rows = info.sized ? Math.max(1, Math.min(8, t.h ?? info.rows)) : info.rows;
  return { cols, rows, frames: info.animated ? Math.max(1, Math.min(8, t.frames ?? 1)) : 1 };
}

/* ------------------------------------------------------------------ sprites */

export interface SpriteKindInfo {
  label: string;
  help: string;
  frameW: number;
  frameH: number;
  cols: number;
  rows: number;
  colLabels: string[];
  rowLabels: string[];
  /** Mannequin to start from (public/gba/bases/...). */
  base?: string;
}

export const BACK_POSES = ['Default', 'Greatsword', 'Dagger', 'Book', 'Flaming fists', 'Rapier', 'Claws'];

export const SPRITE_KINDS: Record<SpriteKind, SpriteKindInfo> = {
  overworld: {
    label: 'Overworld character (16×32)',
    help: 'Walking around the map. Down, up and left; right is the left row mirrored. Walk and run, 3 frames each.',
    frameW: 16, frameH: 32, cols: 6, rows: 3,
    colLabels: ['Walk: stand', 'Walk: step', 'Walk: step', 'Run: stand', 'Run: step', 'Run: step'],
    rowLabels: ['Down', 'Up', 'Left (right is mirrored)'],
    base: 'gba/bases/overworld_base.png',
  },
  backsprite: {
    label: 'Battle back-sprite (64×64)',
    help: 'Your heroes in battle, seen from behind like Pokémon. One pose per fighting style.',
    frameW: 64, frameH: 64, cols: BACK_POSES.length, rows: 1,
    colLabels: BACK_POSES, rowLabels: [''],
    base: 'gba/bases/backsprite_base.png',
  },
  battler: {
    label: 'Battle front sprite (64×64)',
    help: 'Enemies facing you in battle.',
    frameW: 64, frameH: 64, cols: 1, rows: 1, colLabels: ['Front'], rowLabels: [''],
  },
};

/* ------------------------------------------------------------------ colors */

/** Snap a color to what the GBA can show (5 bits per channel). */
export function gbaColor(hex: string): string {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const ch = (v: number) => { const c5 = Math.round((v / 255) * 31); return (c5 << 3) | (c5 >> 2); };
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const pal = (id: string, name: string, colors: string[]): GbaPalette => {
  const c = colors.map(gbaColor);
  while (c.length < PALETTE_SIZE) c.push('#000000');
  return { id, name, colors: c.slice(0, PALETTE_SIZE) };
};

export function defaultGbaData(): GbaData {
  return {
    version: 1,
    palettes: [
      pal('mannequin', 'Mannequin', ['#303038', '#d0d0d8', '#a0a0b0', '#707080', '#788090', '#d8e0e8', '#f8a040', '#f8e078',
        '#f8c8a0', '#d09070', '#604030', '#4878c8', '#305090', '#585870', '#f8f8f8']),
      pal('grass', 'Grass', ['#183018', '#286028', '#389838', '#58c048', '#88e070', '#c0f098', '#f8f8d0',
        '#806030', '#a88048', '#d0b070', '#f0d898', '#584020', '#f86878', '#f8d048', '#ffffff']),
      pal('water', 'Water', ['#102048', '#183878', '#2858b8', '#3880e0', '#58a8f8', '#90d0f8', '#d0f0ff',
        '#f8f8f8', '#d8c890', '#b8a060', '#887040', '#386838', '#58a048', '#205028', '#000000']),
      pal('rock', 'Rock & cliffs', ['#201810', '#403020', '#605040', '#807060', '#a09080', '#c8b8a0', '#e8e0c8',
        '#285028', '#408838', '#60b848', '#384858', '#586878', '#8898a8', '#b8c8d0', '#f8f8f8']),
    ],
    tiles: [],
    sprites: [
      { id: 'player', name: 'Player', kind: 'overworld', palette: 'mannequin', image: 'gba/sprites/player.png' },
      { id: 'player_back', name: 'Player (battle)', kind: 'backsprite', palette: 'mannequin', image: 'gba/sprites/player_back.png' },
    ],
    player: 'player',
  };
}
