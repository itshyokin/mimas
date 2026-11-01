/**
 * The height layer. Every cell has a height from -10 to 10 in steps of half a tile
 * (stored in the map as rows of space-separated numbers). Ramps and stairs are listed
 * separately; each one rises by one step towards a higher neighbour.
 */
import { CORNER_NAMES, type Dir, type MapData, type RampData } from './types';

/** World units per height step (one step = half a tile). */
export const STEP = 0.5;
export const MIN_HEIGHT = -10;
export const MAX_HEIGHT = 10;

export const clampHeight = (v: number): number => Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(v)));

/** Read the height rows into a grid (row-major). Missing or bad values count as 0. */
export function parseHeights(rows: string[] | undefined, w: number, h: number): Int8Array {
  const out = new Int8Array(w * h);
  if (!rows) return out;
  for (let z = 0; z < h; z++) {
    const parts = (rows[z] ?? '').trim().split(/\s+/);
    for (let x = 0; x < w; x++) {
      const v = parseInt(parts[x] ?? '0', 10);
      out[z * w + x] = Number.isFinite(v) ? clampHeight(v) : 0;
    }
  }
  return out;
}

/** Grid back to rows; null when everything is at ground level (the map then omits the layer). */
export function formatHeights(grid: Int8Array, w: number, h: number): string[] | null {
  if (!grid.some((v) => v !== 0)) return null;
  const rows: string[] = [];
  for (let z = 0; z < h; z++) rows.push(Array.from(grid.subarray(z * w, z * w + w)).join(' '));
  return rows;
}

const NEIGHBOUR: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const ORDER: Dir[] = ['up', 'down', 'left', 'right'];

/**
 * Which way a ramp rises: towards the neighbour exactly one step higher, with the opposite side
 * no higher than the ramp. Returns null when no neighbour fits (the ramp then lies flat).
 */
export function autoRampDir(height: (x: number, z: number) => number | null, x: number, z: number): Dir | null {
  const h0 = height(x, z) ?? 0;
  for (const d of ORDER) {
    const [dx, dz] = NEIGHBOUR[d], [ox, oz] = NEIGHBOUR[OPPOSITE[d]];
    const n = height(x + dx, z + dz), o = height(x + ox, z + oz);
    if (n === h0 + 1 && (o === null || o <= h0)) return d;
  }
  return null;
}

/** The cells around each corner (NW, NE, SE, SW): the two beside it and the one diagonal to it. */
const AROUND_CORNER: [number, number][][] = [
  [[-1, 0], [0, -1], [-1, -1]],
  [[1, 0], [0, -1], [1, -1]],
  [[1, 0], [0, 1], [1, 1]],
  [[-1, 0], [0, 1], [-1, 1]],
];

/**
 * A corner slope's raised corners (NW, NE, SE, SW): each corner touching a cell at least one step higher. One raised
 * corner rounds a hill's outer corner (the higher ground is diagonal); three fill an inner corner. Null when none
 * (or all four) would rise: it lies flat.
 */
export function autoCornerMask(height: (x: number, z: number) => number | null, x: number, z: number): boolean[] | null {
  const h0 = height(x, z) ?? 0;
  const mask = AROUND_CORNER.map((nb) => nb.some(([dx, dz]) => (height(x + dx, z + dz) ?? -Infinity) >= h0 + 1));
  const n = mask.filter(Boolean).length;
  return n === 0 || n === 4 ? null : mask;
}

/** The corners a corner slope raises: its override, or the detected ones. */
export function cornerMask(r: RampData, height: (x: number, z: number) => number | null): boolean[] | null {
  if (r.raise?.length) { const m = CORNER_NAMES.map((c) => r.raise!.includes(c)); return m.every(Boolean) ? null : m; }
  return autoCornerMask(height, r.x, r.z);
}

/** The direction a ramp actually uses: its override, or the detected one. */
export function rampDirection(r: RampData, height: (x: number, z: number) => number | null): Dir | null {
  return r.dir ?? autoRampDir(height, r.x, r.z);
}

/**
 * World heights of a cell's corners, in the order north-west, north-east, south-east, south-west.
 * Flat cells have four equal corners; a ramp's two corners on its high side are one step up.
 */
export function cornerHeights(h: number, rampDir: Dir | null, raised?: boolean[] | null): [number, number, number, number] {
  const lo = h * STEP, hi = (h + 1) * STEP;
  if (raised) return raised.map((r) => (r ? hi : lo)) as [number, number, number, number];
  switch (rampDir) {
    case 'up': return [hi, hi, lo, lo];
    case 'down': return [lo, lo, hi, hi];
    case 'left': return [hi, lo, lo, hi];
    case 'right': return [lo, hi, hi, lo];
    default: return [lo, lo, lo, lo];
  }
}

/** How raised and lowered ground is shaped, per cell. */
export type HeightStyle = '.' | 'b' | 'h' | 'c';
export const HEIGHT_STYLES: [HeightStyle, string, string][] = [
  ['.', 'Blocky', '▢'], ['b', 'Soft blocky', '◫'], ['h', 'Smooth hills', '∿'], ['c', 'Cliffs', '▲'],
];
export function parseHeightStyles(rows: string[] | undefined, w: number, h: number): HeightStyle[] {
  const out: HeightStyle[] = new Array(w * h).fill('.');
  if (!rows) return out;
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const c = rows[z]?.[x];
    if (c === 'b' || c === 'h' || c === 'c') out[z * w + x] = c;
  }
  return out;
}
export function formatHeightStyles(grid: HeightStyle[], w: number, h: number): string[] | null {
  if (grid.every((c) => c === '.')) return null;
  return Array.from({ length: h }, (_, z) => grid.slice(z * w, z * w + w).join(''));
}

/** Ground height inside a cell (fx, fz in 0..1), blending its corners. */
export function surfaceInCell(c: [number, number, number, number], fx: number, fz: number): number {
  const n = c[0] + (c[1] - c[0]) * fx, s = c[3] + (c[2] - c[3]) * fx;
  return n + (s - n) * fz;
}

/**
 * Old maps marked raised ground with the "#" tile. Turn it into grass at height 2 (the same height
 * it had before) and let props on it stand on the new ground. Returns true when anything changed.
 */
export function migratePlateaus(map: MapData): boolean {
  if (!map.terrain.some((r) => r.includes('#'))) return false;
  const w = map.width, h = map.height;
  const grid = parseHeights(map.heights, w, h);
  for (let z = 0; z < h; z++) {
    const row = map.terrain[z] ?? '';
    for (let x = 0; x < w; x++) if (row[x] === '#') grid[z * w + x] = Math.max(grid[z * w + x], 2);
  }
  map.terrain = map.terrain.map((r) => r.replace(/#/g, '.'));
  map.heights = formatHeights(grid, w, h) ?? undefined;
  for (const p of map.props) delete p.y;
  return true;
}

/* ------------------------------------------------------------------ water */

/** How water behaves: Auto picks shallow or swimmable from the depth. */
export type WaterKind = 'auto' | 'shallow' | 'swim' | 'deep';
/** Water on one cell: its surface level in steps, its kind, and its style (the map's water styles; 0 when missing). */
export interface WaterCell { level: number; kind: WaterKind; style?: number }

/** Deepest water (world units) that counts as shallow when the kind is Auto: one step. */
export const SHALLOW_DEPTH = STEP + 1e-6;

const KIND_CODE: Record<WaterKind, string> = { auto: '', shallow: 's', swim: 'w', deep: 'd' };
const CODE_KIND: Record<string, WaterKind> = { '': 'auto', s: 'shallow', w: 'swim', d: 'deep' };

/**
 * Water rows: space-separated tokens, "." for no water, otherwise the level (steps) and an optional
 * kind letter: s shallow, w swimmable, d deep (no letter = auto), then "@" and its style when not the first
 * (the map's water styles: a pond and a river on one map). E.g. ". . 0 0 -1d 0w@2".
 */
export function parseWater(rows: string[] | undefined, w: number, h: number): (WaterCell | null)[] {
  const out: (WaterCell | null)[] = new Array(w * h).fill(null);
  if (!rows) return out;
  for (let z = 0; z < h; z++) {
    const parts = (rows[z] ?? '').trim().split(/\s+/);
    for (let x = 0; x < w; x++) {
      const m = /^(-?\d+)([swd]?)(?:@(\d+))?$/.exec(parts[x] ?? '.');
      if (m) out[z * w + x] = { level: clampHeight(parseInt(m[1], 10)), kind: CODE_KIND[m[2]], ...(m[3] && m[3] !== '0' ? { style: parseInt(m[3], 10) } : {}) };
    }
  }
  return out;
}

export function formatWater(grid: (WaterCell | null)[], w: number, h: number): string[] | null {
  if (!grid.some(Boolean)) return null;
  const rows: string[] = [];
  for (let z = 0; z < h; z++) {
    const t: string[] = [];
    for (let x = 0; x < w; x++) { const c = grid[z * w + x]; t.push(c ? `${c.level}${KIND_CODE[c.kind]}${c.style ? `@${c.style}` : ''}` : '.'); }
    rows.push(t.join(' '));
  }
  return rows;
}

/** What the water actually does at a cell, given the ground under it; null when it's dry (no water, or ground above it). */
export function resolveWater(c: WaterCell | null, groundY: number): { surface: number; depth: number; kind: Exclude<WaterKind, 'auto'>; style: number } | null {
  if (!c) return null;
  const surface = c.level * STEP, depth = surface - groundY;
  if (depth <= 1e-6) return null;
  const kind = c.kind === 'auto' ? (depth <= SHALLOW_DEPTH ? 'shallow' : 'swim') : c.kind;
  return { surface, depth, kind, style: c.style ?? 0 };
}

/**
 * Old maps used the "~" tile as water that simply blocked. Turn each such pool into a dug-out
 * basin (two steps deep) with swimmable water at ground level. Only runs on maps without a water layer.
 */
export function migrateWaterTiles(map: MapData): boolean {
  if (map.water || !map.terrain.some((r) => r.includes('~'))) return false;
  const w = map.width, h = map.height;
  const heights = parseHeights(map.heights, w, h), water: (WaterCell | null)[] = new Array(w * h).fill(null);
  for (let z = 0; z < h; z++) {
    const row = map.terrain[z] ?? '';
    for (let x = 0; x < w; x++) if (row[x] === '~') {
      const i = z * w + x, base = heights[i];
      water[i] = { level: base, kind: 'auto' };
      heights[i] = clampHeight(base - 2);
    }
  }
  map.heights = formatHeights(heights, w, h) ?? undefined;
  map.water = formatWater(water, w, h) ?? undefined;
  return true;
}
