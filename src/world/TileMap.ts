import { clamp } from '../core/math';
import type { WithGround } from './groundModel';
import { type HeightStyle, STEP, cornerHeights, cornerMask, parseHeightStyles, parseHeights, parseWater, rampDirection, resolveWater, surfaceInCell } from './heights';
import { type PassageFlag, parsePassage } from './passage';
import { TileCatalog } from './tiles';
import type { Dir, MapData, RampData } from './types';

type Corners = [number, number, number, number];
export type Water = NonNullable<ReturnType<typeof resolveWater>>;

/** Grid queries over a map: tiles, heights, ramps, and which cells block movement. */
/** How far below a deck a walker can be and still step up onto it; and the room needed to pass under one. */
const DECK_REACH = 0.35, DECK_HEADROOM = 1.1;

export class TileMap {
  readonly w: number;
  readonly h: number;
  private readonly rows: string[];
  private readonly blocked: Uint8Array;
  /** Height in steps per cell. */
  private readonly heights: Int8Array;
  /** Ramp per cell (index → ramp and its resolved direction). */
  private readonly ramps = new Map<number, { ramp: RampData; dir: Dir | null; raised?: boolean[] | null }>();
  private readonly corners: Corners[];
  /** Water per cell after resolving Auto against the ground (null where dry). */
  private readonly water: (Water | null)[];
  /** Passage flags per cell (climbable, low clearance, wall, open). */
  private readonly passage: PassageFlag[];

  /** Frozen water per cell (winter): the ice's top, or null. Ice is walked on (and slid on), not swum in. */
  private readonly ice: (number | null)[];

  /** `frozen(style)`: water of this style is frozen over (still water in winter). */
  /** Update 156: on a 3D map, the floors come from its scene (set by the game). */
  ground3d: ((x: number, z: number, fromY?: number) => number) | null = null;
  /** Height for maps that don't choose (Update 148): flat in 2D view mode (set by the game). */
  static flatByDefault = false;
  constructor(data: MapData, readonly tiles: TileCatalog = new TileCatalog(), frozen?: (style: number) => boolean) {
    // Height implied by the tiles (RPG Maker): the Heights layer, ramps and hills are kept in the map but not used.
    const ground = (data as WithGround).__ground;
    if (!ground && (data.heightMode === 'flat' || (!data.heightMode && TileMap.flatByDefault))) data = { ...data, heights: undefined, ramps: undefined, heightStyles: undefined };
    this.w = data.width;
    this.h = data.height;
    this.rows = [];
    for (let z = 0; z < this.h; z++) {
      this.rows.push((data.terrain[z] ?? '').padEnd(this.w, '.').slice(0, this.w));
    }
    this.upperRows = Array.from({ length: this.h }, (_, z) => (data.upper?.[z] ?? '').padEnd(this.w, ' ').slice(0, this.w));
    this.heights = parseHeights(data.heights, this.w, this.h);
    const stepAt = (x: number, z: number) => (this.inMap(x, z) ? this.heights[z * this.w + x] : null);
    for (const r of data.ramps ?? []) {
      if (!this.inMap(r.x, r.z)) continue;
      this.ramps.set(r.z * this.w + r.x, r.style === 'corner' ? { ramp: r, dir: null, raised: cornerMask(r, stepAt) } : { ramp: r, dir: rampDirection(r, stepAt) });
    }
    this.corners = [];
    for (let z = 0; z < this.h; z++)
      for (let x = 0; x < this.w; x++) {
        const i = z * this.w + x;
        const r = this.ramps.get(i);
        this.corners.push(cornerHeights(this.heights[i], r?.dir ?? null, r?.raised));
      }
    // Smooth hills: their corners are shared with every neighbour, so the heights run into slopes.
    this.styles = parseHeightStyles(data.heightStyles, this.w, this.h);
    this.hillGrid = this.styles.includes('h') ? this.buildHills() : null;
    // Update 153: a 3D model's ground: every tile a hill on the heights sampled from the model.
    if (ground) {
      this.styles.fill('h');
      this.hillGrid = ground.field;
      const W = this.w;
      for (let z = 0; z < this.h; z++) for (let x = 0; x < W; x++) {
        const at = (i: number, j: number) => ground.field[j * (W + 1) + i];
        this.corners[z * W + x] = [at(x, z), at(x + 1, z), at(x + 1, z + 1), at(x, z + 1)];
      }
    }
    const rawWater = parseWater(data.water, this.w, this.h);
    this.water = rawWater.map((c, i) => resolveWater(c, this.heights[i] * STEP));
    this.ice = this.water.map((w) => (w && frozen?.(w.style) ? w.surface : null));
    this.ice.forEach((v, i) => { if (v !== null) this.water[i] = null; });
    this.passage = parsePassage(data.passage, this.w, this.h);
    this.blocked = new Uint8Array(this.w * this.h);
    for (let z = 0; z < this.h; z++)
      for (let x = 0; x < this.w; x++) {
        // Update 151, like RPG Maker: a tile on the upper layer (not ☆) decides its cell's passage (stairs set to O
        // open a way up a plateau); otherwise the ground's: blocking, or only at the edges of its patch.
        const u = this.upper(x, z), ud = u !== ' ' ? tiles.get(u) : undefined;
        if (ud && !ud.above) { if (ud.blocks) this.blocked[z * this.w + x] = 1; continue; }
        const k = this.terrain(x, z), d = tiles.get(k);
        if (tiles.blocks(k) || ground?.blocked[z * this.w + x]) this.blocked[z * this.w + x] = 1;
        else if (d?.edgeBlocks && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.inMap(x + dx, z + dz) && this.terrain(x + dx, z + dz) !== k)) this.blocked[z * this.w + x] = 1;
      }
  }
  private readonly upperRows: string[];
  /** The upper layer's tile at a cell (Update 147); a space for none (and outside the map). */
  upper(x: number, z: number): string { return this.inMap(x, z) ? this.upperRows[z][x] : ' '; }

  /** Tile key at a tile; coordinates outside the map are clamped to the edge. */
  terrain(x: number, z: number): string {
    return this.rows[clamp(z, 0, this.h - 1)][clamp(x, 0, this.w - 1)];
  }
  inMap(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.w && z < this.h;
  }
  /** Height of a cell in steps (0 outside the map). */
  step(x: number, z: number): number {
    return this.inMap(x, z) ? this.heights[z * this.w + x] : 0;
  }
  /** World height of a cell's base (its low side, for ramps). */
  heightAt(x: number, z: number): number {
    return this.step(x, z) * STEP;
  }
  /** Corner heights of a cell (NW, NE, SE, SW). Outside the map: flat at 0. */
  cornersAt(x: number, z: number): Corners {
    return this.inMap(x, z) ? this.corners[z * this.w + x] : [0, 0, 0, 0];
  }
  rampAt(x: number, z: number): { ramp: RampData; dir: Dir | null; raised?: boolean[] | null } | undefined {
    return this.inMap(x, z) ? this.ramps.get(z * this.w + x) : undefined;
  }
  /** Ground height at any point (in tiles), following ramps smoothly (and hills along their curves). */
  surfaceY(x: number, z: number): number {
    if (this.ground3d) return this.ground3d(x, z);
    const cx = Math.floor(x), cz = Math.floor(z);
    if (this.hillGrid && this.isHill(cx, cz)) return this.hillY(x, z);
    return surfaceInCell(this.cornersAt(cx, cz), x - cx, z - cz);
  }

  /* Height styles (blocky, soft blocky, smooth hills, cliffs). */
  private readonly styles: HeightStyle[];
  /** Hills: the height at every corner point ((w + 1) × (h + 1)), NaN where no hill touches it. */
  private readonly hillGrid: Float32Array | null;
  heightStyle(x: number, z: number): HeightStyle { return this.inMap(x, z) ? this.styles[z * this.w + x] : '.'; }
  /** A smooth-hill cell (ramps and stairs keep their own shape). */
  isHill(x: number, z: number): boolean { return this.heightStyle(x, z) === 'h' && !this.ramps.has(z * this.w + x); }

  private buildHills(): Float32Array {
    const W = this.w, H = this.h, g = new Float32Array((W + 1) * (H + 1)).fill(NaN);
    for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
      const hills: number[] = [], others: number[] = [];
      for (const [cx, cz] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
        if (!this.inMap(cx, cz)) continue;
        const k = cz * W + cx, hgt = this.heights[k] * STEP;
        if (this.styles[k] === 'h' && !this.ramps.has(k)) hills.push(hgt); else others.push(hgt);
      }
      if (!hills.length) continue;
      // Among hills the heights average; next to lower ground a hill comes down to meet it (no wall), but it doesn't
      // climb up the side of higher ground (that keeps its wall).
      const avg = hills.reduce((a, b) => a + b, 0) / hills.length;
      g[j * (W + 1) + i] = others.length ? Math.min(avg, ...others) : avg;
    }
    // The hill cells' corners come from the grid (walls and the rest read corners).
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (!(this.styles[z * W + x] === 'h' && !this.ramps.has(z * W + x))) continue;
      const at = (i: number, j: number) => g[j * (W + 1) + i];
      this.corners[z * W + x] = [at(x, z), at(x + 1, z), at(x + 1, z + 1), at(x, z + 1)];
    }
    return g;
  }

  /** A hill's height at a point: a Catmull-Rom curve through the corner heights, so slopes roll smoothly. */
  private hillY(x: number, z: number): number {
    const g = this.hillGrid!, W = this.w, cx = Math.floor(x), cz = Math.floor(z), fx = x - cx, fz = z - cz;
    const pt = (i: number, j: number) => {
      const v = i >= 0 && j >= 0 && i <= W && j <= this.h ? g[j * (W + 1) + i] : NaN;
      if (!Number.isNaN(v)) return v;
      // Beyond the hills: the nearest corner of this cell.
      const ci = Math.max(cx, Math.min(cx + 1, i)), cj = Math.max(cz, Math.min(cz + 1, j));
      return g[cj * (W + 1) + ci];
    };
    const cr = (a: number, b: number, c: number, d: number, t: number) => b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
    const row = (j: number) => cr(pt(cx - 1, j), pt(cx, j), pt(cx + 1, j), pt(cx + 2, j), fx);
    const y = cr(row(cz - 1), row(cz), row(cz + 1), row(cz + 2), fz);
    // Never above the highest or below the lowest corner nearby (no bumps from overshoot).
    const c = this.corners[cz * W + cx];
    return Math.max(Math.min(...c) - 0.25, Math.min(Math.max(...c) + 0.25, y));
  }
  /** Water at a cell (surface height, depth, and shallow / swim / deep), or null where it's dry. */
  waterAt(x: number, z: number): Water | null {
    return this.inMap(x, z) ? this.water[z * this.w + x] : null;
  }
  /**
   * The height the player moves at: the ground, or the water surface where there's water to wade or swim in.
   * Using the surface lets the player walk from a bank straight into a pond dug lower than it.
   */
  standY(x: number, z: number, fromY?: number): number {
    if (this.ground3d) return this.ground3d(x, z, fromY);
    const d = this.deckAt(Math.floor(x), Math.floor(z));
    if (d !== null) {
      // On a bridge (or arriving at its level): its deck. From below (swimming up a river, walking along a chasm's
      // floor): the ground or water under it, if there's headroom to pass; too low, it stops them like a wall.
      if (fromY === undefined || fromY >= d - DECK_REACH) return d;
      const below = this.standBelow(x, z);
      return d - below >= DECK_HEADROOM ? below : d;
    }
    return this.standBelow(x, z);
  }
  /** standY ignoring bridges. */
  private standBelow(x: number, z: number): number {
    const g = this.surfaceY(x, z), wtr = this.waterAt(Math.floor(x), Math.floor(z)), ice = this.iceAt(Math.floor(x), Math.floor(z));
    if (ice !== null) return Math.max(g, ice);
    return wtr && wtr.kind !== 'deep' ? Math.max(g, wtr.surface) : g;
  }
  /** The top of the ice on a frozen cell, or null. */
  iceAt(x: number, z: number): number | null {
    return this.inMap(x, z) ? this.ice[z * this.w + x] : null;
  }
  /** Passage flag of a cell ("." outside the map). */
  passageAt(x: number, z: number): PassageFlag {
    return this.inMap(x, z) ? this.passage[z * this.w + x] : '.';
  }
  /**
   * Solid: a wall the player can't pass even in the air (blocking tiles and props, passage Wall).
   * The passage layer's Open overrides tiles and props.
   */
  isSolid(x: number, z: number): boolean {
    if (!this.inMap(x, z)) return true;
    const i = z * this.w + x, f = this.passage[i];
    return f === 'x' ? true : f === 'o' ? false : this.blocked[i] === 1;
  }
  /** Can't be walked into: solid, or deep water (unless a bridge or platform crosses it). */
  isBlocked(x: number, z: number): boolean {
    return this.isSolid(x, z) || (this.water[z * this.w + x]?.kind === 'deep' && this.deckAt(x, z) === null);
  }

  /* Bridges and platforms: cells walked on at a deck's height (over water, chasms, lower ground). */
  private readonly decks = new Map<number, number>();
  /** Which way each bridge piece runs ('h' east–west, 'v' north–south; platforms and docks: either way). */
  private readonly deckDirs = new Map<number, 'h' | 'v' | 'any'>();
  setDeck(x: number, z: number, y: number | null, dir: 'h' | 'v' | 'any' = 'any'): void {
    if (!this.inMap(x, z)) return;
    const i = z * this.w + x;
    if (y === null) { this.decks.delete(i); this.deckDirs.delete(i); } else { this.decks.set(i, y); this.deckDirs.set(i, dir); }
  }
  /** The way a bridge piece runs, or null where there's none. */
  deckDir(x: number, z: number): 'h' | 'v' | 'any' | null {
    return this.inMap(x, z) ? this.deckDirs.get(z * this.w + x) ?? null : null;
  }
  /**
   * Bridges keep walkers on them: from a piece running east–west they can only leave east or west (onto the next
   * piece, the bank, or off an open end), north–south pieces only north or south; a piece beside it (a wide bridge)
   * can always be stepped onto. Getting on works the same way: only along the bridge, never over its rails.
   * `fx, fz`: the cell the walker is in; `tx, tz`: a cell part of them would move into; `y`: their feet.
   */
  deckStepOK(fx: number, fz: number, tx: number, tz: number, y: number): boolean {
    if (fx === tx && fz === tz) return true;
    const from = this.onDeck(fx, fz, y) ? this.deckDir(fx, fz) : null, to = this.onDeck(tx, tz, y) ? this.deckDir(tx, tz) : null;
    if (!from && !to) return true;
    if (from && to) return true;
    const dx = tx - fx, dz = tz - fz;
    const along = (d: 'h' | 'v' | 'any') => d === 'any' || (d === 'h' ? dz === 0 : dx === 0);
    return along((from ?? to)!);
  }
  /** The height of a bridge or platform over this cell, or null. */
  deckAt(x: number, z: number): number | null {
    return this.inMap(x, z) ? this.decks.get(z * this.w + x) ?? null : null;
  }
  /** Is a walker at height y up on this cell's bridge (rather than under it)? */
  onDeck(x: number, z: number, y?: number): boolean {
    const d = this.deckAt(x, z);
    return d !== null && (y === undefined || y >= d - DECK_REACH);
  }
  /** Water a walker is in: none up on a bridge or platform (under one, the water as usual). */
  footWaterAt(x: number, z: number, y?: number): Water | null {
    return this.onDeck(x, z, y) ? null : this.waterAt(x, z);
  }
  /** The ground under a walker's feet: a deck they're on, or the terrain. */
  groundY(x: number, z: number, y?: number): number {
    return this.onDeck(Math.floor(x), Math.floor(z), y) ? this.deckAt(Math.floor(x), Math.floor(z))! : this.surfaceY(x, z);
  }
  /** Only passable while crawling. */
  isLow(x: number, z: number): boolean {
    return this.passageAt(x, z) === 'l';
  }
  isClimbable(x: number, z: number): boolean {
    return this.passageAt(x, z) === 'c';
  }
  /** Thin blockers that don't fill whole tiles (props with flat collision), each tagged with what made it. */
  private readonly boxes: { x0: number; z0: number; x1: number; z1: number; tag: unknown }[] = [];
  addBox(b: { x0: number; z0: number; x1: number; z1: number }, tag: unknown): void { this.boxes.push({ ...b, tag }); }
  removeBoxes(tag: unknown): void { for (let i = this.boxes.length - 1; i >= 0; i--) if (this.boxes[i].tag === tag) this.boxes.splice(i, 1); }
  /** Is this point inside a thin blocker? */
  inBox(x: number, z: number): boolean {
    for (const b of this.boxes) if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return true;
    return false;
  }

  setBlocked(x: number, z: number, on: boolean): void {
    if (this.inMap(x, z)) this.blocked[z * this.w + x] = on ? 1 : 0;
  }
  /** True when any tile within `r` of (x, z) has terrain `t`. */
  near(x: number, z: number, t: string, r: number): boolean {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) if (this.inMap(x + dx, z + dz) && this.terrain(x + dx, z + dz) === t) return true;
    return false;
  }
}
