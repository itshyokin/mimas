/**
 * The world layout (Map editor → World): every map placed on one big grid, edge to edge where they join. It gives
 * the pause menu's world map, and it tells a map which neighbours continue past its edges ("Seamless" sides): those
 * are drawn beyond the edge and walked straight into. No three.js here.
 */
import type { MapBorder } from './types';

/** Where a map sits in the world (its top-left tile) and its size in tiles. */
export interface WorldPlacement { x: number; z: number; w: number; h: number }

/** A name on the world map: a town, a landmark, a dungeon… (world tile coordinates). */
export interface WorldLabel { id: string; name: string; x: number; z: number; kind?: 'town' | 'landmark' | 'dungeon' | 'region' }

/** How places not visited yet look on the world map. */
export type WorldFog = 'hidden' | 'grey' | 'visible';

export interface WorldData {
  maps: Record<string, WorldPlacement>;
  labels?: WorldLabel[];
  /** Maps not visited yet (default hidden). */
  unvisited?: WorldFog;
  /** Within maps visited, only the ground walked near shows (default on). */
  explore?: boolean;
}

export type Side = 'n' | 's' | 'w' | 'e';
export const SIDES: Side[] = ['n', 's', 'w', 'e'];

/** A map that continues past one of this map's edges. */
export interface Neighbour {
  map: string;
  side: Side;
  /** The neighbour's top-left corner in this map's tile coordinates. */
  dx: number; dz: number;
  /** Where along this side they touch (this map's x for n / s, z for w / e): from … to. */
  from: number; to: number;
}

/** Maps touching this one edge to edge (sharing some length of a side). */
export function neighbours(world: WorldData | undefined, name: string): Neighbour[] {
  const me = world?.maps[name];
  if (!me) return [];
  const out: Neighbour[] = [];
  for (const [other, p] of Object.entries(world!.maps)) {
    if (other === name) continue;
    const dx = p.x - me.x, dz = p.z - me.z;
    const ox = [Math.max(0, dx), Math.min(me.w, dx + p.w)], oz = [Math.max(0, dz), Math.min(me.h, dz + p.h)];
    if (dz + p.h === 0 && ox[1] > ox[0]) out.push({ map: other, side: 'n', dx, dz, from: ox[0], to: ox[1] });
    else if (dz === me.h && ox[1] > ox[0]) out.push({ map: other, side: 's', dx, dz, from: ox[0], to: ox[1] });
    else if (dx + p.w === 0 && oz[1] > oz[0]) out.push({ map: other, side: 'w', dx, dz, from: oz[0], to: oz[1] });
    else if (dx === me.w && oz[1] > oz[0]) out.push({ map: other, side: 'e', dx, dz, from: oz[0], to: oz[1] });
  }
  return out;
}

/** The sides of a map set to Seamless (Inspector → Borders). */
export function seamlessSides(border: MapBorder | undefined): Set<Side> {
  return new Set(SIDES.filter((s) => (border?.[s] ?? border?.kind) === 'seamless'));
}

/** The neighbour a point just past this map's edge falls in (tile coordinates of this map), if it's seamless there. */
export function neighbourAt(list: Neighbour[], seamless: Set<Side>, x: number, z: number, w: number, h: number): Neighbour | null {
  const side: Side | null = z < 0 ? 'n' : z >= h ? 's' : x < 0 ? 'w' : x >= w ? 'e' : null;
  if (!side || !seamless.has(side)) return null;
  const along = side === 'n' || side === 's' ? x : z;
  return list.find((n) => n.side === side && along >= n.from && along < n.to) ?? null;
}

/**
 * Snap a map being dragged in the World layout: to the edges of the others when within `reach` tiles (side by side,
 * and lined up with their ends).
 */
export function snapPlacement(p: WorldPlacement, others: WorldPlacement[], reach = 2): { x: number; z: number } {
  let bx = p.x, bz = p.z, best = { x: reach + 1, z: reach + 1 };
  for (const o of others) {
    const xs = [o.x - p.w, o.x + o.w, o.x, o.x + o.w - p.w];
    const zs = [o.z - p.h, o.z + o.h, o.z, o.z + o.h - p.h];
    const nearZ = p.z < o.z + o.h + reach && p.z + p.h > o.z - reach, nearX = p.x < o.x + o.w + reach && p.x + p.w > o.x - reach;
    if (nearZ) for (const x of xs) { const d = Math.abs(x - p.x); if (d < best.x) { best.x = d; bx = x; } }
    if (nearX) for (const z of zs) { const d = Math.abs(z - p.z); if (d < best.z) { best.z = d; bz = z; } }
  }
  return { x: best.x <= reach ? bx : p.x, z: best.z <= reach ? bz : p.z };
}

/** The world's bounds (tiles), for drawing the whole map. */
export function worldBounds(world: WorldData | undefined): { x0: number; z0: number; x1: number; z1: number } {
  const ps = Object.values(world?.maps ?? {});
  if (!ps.length) return { x0: 0, z0: 0, x1: 1, z1: 1 };
  return { x0: Math.min(...ps.map((p) => p.x)), z0: Math.min(...ps.map((p) => p.z)), x1: Math.max(...ps.map((p) => p.x + p.w)), z1: Math.max(...ps.map((p) => p.z + p.h)) };
}

/* ---------------------------------------------------------------- explored ground */

/** Explored cells of one map, as bits (one per tile), stored in saves as base64. */
export class Explored {
  readonly bits: Uint8Array;
  constructor(readonly w: number, readonly h: number, from?: string) {
    this.bits = new Uint8Array(Math.ceil((w * h) / 8));
    if (from) { try { const raw = atob(from); for (let i = 0; i < Math.min(raw.length, this.bits.length); i++) this.bits[i] = raw.charCodeAt(i); } catch { /* a bad save: start fresh */ } }
  }
  has(x: number, z: number): boolean { if (x < 0 || z < 0 || x >= this.w || z >= this.h) return false; const i = z * this.w + x; return (this.bits[i >> 3] & (1 << (i & 7))) !== 0; }
  /** Reveal a circle; true when anything new showed. */
  reveal(cx: number, cz: number, r: number): boolean {
    let changed = false;
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || z < 0 || x >= this.w || z >= this.h || (x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 > r * r) continue;
        const i = z * this.w + x, b = 1 << (i & 7);
        if (!(this.bits[i >> 3] & b)) { this.bits[i >> 3] |= b; changed = true; }
      }
    return changed;
  }
  toString(): string { let s = ''; for (const b of this.bits) s += String.fromCharCode(b); return btoa(s); }
}
