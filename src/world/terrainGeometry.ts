/**
 * Builds the raw geometry of the ground from the height layer: top surfaces (flat, ramps,
 * stair treads), cliff walls wherever the ground drops, and stair risers.
 * Plain arrays only (no three.js), so it can be tested on its own.
 */
import { STEP } from './heights';
import { NEIGHBOURS8 } from './blend';
import type { TileMap } from './TileMap';
import type { Dir } from './types';

export type V3 = [number, number, number];

/** A list of quads with positions, normals, UVs and indices, ready for a BufferGeometry. */
export class QuadList {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];
  /** One more number per corner when given (a grass lip's fade down the wall). */
  readonly extra: number[] = [];
  private n = 0;

  /**
   * Add a quad (corners in order around its edge). Its winding is fixed so the face points along
   * `facing`, and its normal is the true face normal (tilted on ramps).
   */
  add(p: [V3, V3, V3, V3], uvs: [number, number][], facing: V3, extra?: [number, number, number, number], light?: V3): void {
    let [a, b, c, d] = p;
    let uv = uvs, ex = extra;
    let nrm = faceNormal(a, b, d);
    if (len(nrm) < 1e-9) nrm = faceNormal(b, c, a);
    if (len(nrm) < 1e-9) return; // degenerate
    if (dot(nrm, facing) < 0) { [a, b, c, d] = [a, d, c, b]; uv = [uvs[0], uvs[3], uvs[2], uvs[1]]; if (ex) ex = [ex[0], ex[3], ex[2], ex[1]]; nrm = [-nrm[0], -nrm[1], -nrm[2]]; }
    const l = len(nrm);
    nrm = [nrm[0] / l, nrm[1] / l, nrm[2] / l];
    // Lit as another face would be (a bevel lit like the flat top, so the grass reads as one surface).
    if (light) nrm = light;
    for (const [i, v] of [a, b, c, d].entries()) {
      this.pos.push(v[0], v[1], v[2]);
      this.nor.push(nrm[0], nrm[1], nrm[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      if (ex) this.extra.push(ex[i]);
    }
    const k = this.n;
    // Counter-clockwise seen from the facing side: (a, b, c) and (a, c, d) with a→b→c CCW.
    this.idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    this.n += 4;
  }

  get quads(): number { return this.n / 4; }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
/** Normal of the triangle a, b, c taken counter-clockwise. */
const faceNormal = (a: V3, b: V3, c: V3): V3 => cross(sub(b, a), sub(c, a));

const UP: V3 = [0, 1, 0];
/** Walls reach this far below the ground at their foot, hiding hairline gaps where they meet it. */
const SINK = 0.04;
/**
 * How far the grass lip hangs down a wall (Update 112): walls only one step tall get a short one (it covered their
 * whole face); taller walls keep the full lip.
 */
const lipLength = (lip: number, dropA: number, dropB: number): number => (Math.max(dropA, dropB) <= 0.5 * 1.05 ? lip * 0.4 : lip);

/** How far the grass lip's top edge rises above the ground (past the imported tiles' lift). */
const LIP_RISE = 0.012;
/** The skirt around the map's outer edge reaches down to here (the land around the map sits at −0.02). */
const EDGE_SKIRT = -0.15;
const STAIR_STEPS = 4;

/** A walkable top surface: four corners (NW, NE, SE, SW order around the edge). */
export type Surface = [V3, V3, V3, V3];

/** Map a position along a stair's climb (s = 0 low edge … 1 high edge) and across it (t) to x, z. */
function stairPoint(x: number, z: number, dir: Dir, s: number, t: number): [number, number] {
  switch (dir) {
    case 'up': return [x + t, z + 1 - s];
    case 'down': return [x + t, z + s];
    case 'left': return [x + 1 - s, z + t];
    case 'right': return [x + s, z + t];
  }
}

/** The top surfaces of one cell: one quad, or one per step for stairs. */
export function cellSurfaces(map: TileMap, x: number, z: number): Surface[] {
  const r = map.rampAt(x, z);
  if (r?.ramp.style === 'stairs' && r.dir) {
    const lo = map.heightAt(x, z), out: Surface[] = [];
    for (let i = 0; i < STAIR_STEPS; i++) {
      const y = lo + ((i + 1) / STAIR_STEPS) * STEP;
      const s0 = i / STAIR_STEPS, s1 = (i + 1) / STAIR_STEPS;
      const p = [stairPoint(x, z, r.dir, s0, 0), stairPoint(x, z, r.dir, s1, 0), stairPoint(x, z, r.dir, s1, 1), stairPoint(x, z, r.dir, s0, 1)];
      out.push(p.map(([px, pz]) => [px, y, pz] as V3) as Surface);
    }
    return out;
  }
  // Smooth hills: a fine grid following the hill's curve.
  if (map.isHill(x, z)) {
    const out: Surface[] = [], N = HILL_DIV;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const p = (a: number, b: number): V3 => { const px = x + a / N, pz = z + b / N; return [px, map.surfaceY(Math.min(px, x + 0.9999), Math.min(pz, z + 0.9999)), pz]; };
      out.push([p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)]);
    }
    return out;
  }
  const c = map.cornersAt(x, z);
  // Soft blocky: edges that drop to lower ground are bevelled (the top slopes down a little before the wall).
  if (map.heightStyle(x, z) === 'b' && !r) {
    const b = bevels(map, x, z);
    if (b.some((v) => v > 0)) return bevelSurfaces(x, z, c[0], b, bevelEnds(map, x, z, b), bevelRounds(map, x, z, b).r, bevelInner(map, x, z, b));
  }
  // A corner slope: four triangles from its centre, so the raised corner (or the one left low) curves evenly.
  if (r?.ramp.style === 'corner' && r.raised) {
    const xz: [number, number][] = [[x, z], [x + 1, z], [x + 1, z + 1], [x, z + 1]];
    const centre: V3 = [x + 0.5, (c[0] + c[1] + c[2] + c[3]) / 4, z + 0.5];
    return xz.map(([px, pz], k) => { const [qx, qz] = xz[(k + 1) % 4]; const a: V3 = [px, c[k], pz], b: V3 = [qx, c[(k + 1) % 4], qz]; return [centre, a, b, b] as Surface; });
  }
  const round = cornerRounding(map, x, z);
  if (round.convex.some(Boolean)) {
    // A flat cell with corners cut round: a fan of triangles from its centre (stored as quads with a repeated corner).
    const y = c[0], out: Surface[] = [], pts = roundedOutline(x, z, round.convex);
    const centre: V3 = [x + 0.5, y, z + 0.5];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push([centre, [a[0], y, a[1]], [b[0], y, b[1]], [b[0], y, b[1]]]);
    }
    return out;
  }
  return [[[x, c[0], z], [x + 1, c[1], z], [x + 1, c[2], z + 1], [x, c[3], z + 1]]];
}

/** Hill cells are split into this many strips each way. */
const HILL_DIV = 4;
/** How far a soft-blocky edge is bevelled (tiles across and down). */
const BEVEL = 0.26;

/** The bevel on each edge (N, S, W, E) of a soft-blocky cell: how much it drops there (0: no drop, no bevel). */
export function bevels(map: TileMap, x: number, z: number): number[] {
  const top = map.heightAt(x, z);
  return [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dz]) => {
    const nx = x + dx, nz = z + dz;
    if (!map.inMap(nx, nz)) return 0;
    const drop = top - Math.max(...map.cornersAt(nx, nz));
    return drop > 0.01 ? Math.min(BEVEL, drop) : 0;
  });
}

/**
 * Where each bevel ends against ground at least as high as this cell (and not bevelled the same way): there it
 * tapers to nothing, a short grassy slope into the corner, instead of stopping at a little wall. For each edge
 * (N, S, W, E) its low end (west or north) and its high end.
 */
export function bevelEnds(map: TileMap, x: number, z: number, bev: number[]): boolean[][] {
  const top = map.heightAt(x, z);
  return EDGES.map((e, ei) => [0, 1].map((k) => {
    if (!bev[ei]) return false;
    const corner = CORNER_XZ[e.a[k]], other = CORNER_XZ[e.a[1 - k]];
    const nx = x + Math.sign(corner[0] - other[0]), nz = z + Math.sign(corner[1] - other[1]);
    if (!map.inMap(nx, nz)) return false;
    const nTop = Math.max(...map.cornersAt(nx, nz));
    if (nTop < top - 1e-3) return false;
    // The same bevel carries straight on into the neighbour: no end here.
    if (Math.abs(nTop - top) < 1e-3 && map.heightStyle(nx, nz) === 'b' && !map.rampAt(nx, nz) && Math.abs(bevels(map, nx, nz)[ei] - bev[ei]) < 1e-3) return false;
    return true;
  }));
}

/**
 * Soft blocky's look: how round its outer corners are (tiles; 0: square, like the blocks) and how far the top's
 * ground folds over onto the cliff below it, breaking up in a pixel dither (tiles; 0: a clean edge).
 */
export const SOFT_LOOK = { round: 0.5, lip: 0.5 };
const softLook = (): typeof SOFT_LOOK => ({ ...SOFT_LOOK, ...((globalThis as { __softLook?: Partial<typeof SOFT_LOOK> }).__softLook ?? {}) });

/** The two edges (N, S, W, E) meeting at each corner (NW, NE, SE, SW): the first leads into the corner, the second out. */
const CORNER_EDGES: [number, number][] = [[2, 0], [0, 3], [3, 1], [1, 2]];

/**
 * Soft blocky's rounded corners: at each corner (NW, NE, SE, SW) where both edges drop to the same flat, lower ground,
 * the radius it's rounded to (0: square) and that ground's height.
 */
export function bevelRounds(map: TileMap, x: number, z: number, bev: number[]): { r: number[]; low: number[] } {
  const R = Math.min(0.5, softLook().round), r = [0, 0, 0, 0], low = [0, 0, 0, 0];
  if (R <= Math.max(...bev) + 0.02 || map.heightStyle(x, z) !== 'b' || map.rampAt(x, z)) return { r, low };
  const top = map.heightAt(x, z);
  for (let k = 0; k < 4; k++) {
    const [ea, eb] = CORNER_EDGES[k];
    if (!bev[ea] || !bev[eb]) continue;
    const nb = CORNER_NB[k].map(([dx, dz]) => [x + dx, z + dz] as [number, number]);
    if (!nb.every(([cx, cz]) => map.inMap(cx, cz) && !map.rampAt(cx, cz) && !map.isHill(cx, cz))) continue;
    const cs = nb.map(([cx, cz]) => map.cornersAt(cx, cz)), h = cs[0][0];
    if (cs.some((c) => c.some((v) => Math.abs(v - h) > 1e-3)) || h >= top - 1e-3) continue;
    r[k] = R; low[k] = h;
  }
  return { r, low };
}

/** A rounded corner's arc, outer edge and inner (where the bevel meets the flat top), with the drop along it. */
function bevelArc(x: number, z: number, k: number, R: number, b: number[]): { o: [number, number]; i: [number, number]; d: number }[] {
  const cx = k === 1 || k === 2 ? x + 1 - R : x + R, cz = k >= 2 ? z + 1 - R : z + R;
  const a0 = [Math.PI, Math.PI * 1.5, 0, Math.PI * 0.5][k], [ea, eb] = CORNER_EDGES[k], N = 10, out = [];
  for (let n = 0; n <= N; n++) {
    const t = n / N, a = a0 + t * Math.PI * 0.5, d = b[ea] + (b[eb] - b[ea]) * t, ri = R - d, ca = Math.cos(a), sa = Math.sin(a);
    out.push({ o: [cx + ca * R, cz + sa * R] as [number, number], i: [cx + ca * ri, cz + sa * ri] as [number, number], d });
  }
  return out;
}

/**
 * Soft blocky's inner corners: corner k of a (lower, flat) cell where the two cells beside it and the one diagonal
 * across are soft blocky at one height above it. The plateau curves round into this cell's corner: the radius (big
 * enough that the bevel clears the corner point), that height and the bevel.
 */
export function concaveRound(map: TileMap, x: number, z: number, k: number): { r: number; h: number; b: number } | null {
  const R = softLook().round;
  if (R <= 0 || !map.inMap(x, z) || map.rampAt(x, z) || map.isHill(x, z)) return null;
  const c = map.cornersAt(x, z);
  if (c.some((v) => Math.abs(v - c[0]) > 1e-3)) return null;
  const nb = CORNER_NB[k].map(([dx, dz]) => [x + dx, z + dz] as [number, number]);
  if (!nb.every(([cx, cz]) => map.inMap(cx, cz) && map.heightStyle(cx, cz) === 'b' && !map.rampAt(cx, cz))) return null;
  const hs = nb.map(([cx, cz]) => map.cornersAt(cx, cz)), h = hs[0][0];
  if (hs.some((cc) => cc.some((v) => Math.abs(v - h) > 1e-3)) || h <= c[0] + 0.01) return null;
  const b = Math.min(BEVEL, h - c[0]);
  return { r: Math.min(0.95, Math.max(R, b / (Math.SQRT2 - 1) + 0.02)), h, b };
}

/** For each edge (N, S, W, E) of a soft-blocky cell, at each end: the radius of an inner corner the bevel runs round into (0: none). */
export function bevelInner(map: TileMap, x: number, z: number, bev: number[]): number[][] {
  return EDGES.map((e, ei) => [0, 1].map((k) => {
    if (!bev[ei]) return 0;
    const lx = x + e.nb[0], lz = z + e.nb[1], q = CORNER_XZ[e.a[k]], qx = x + q[0], qz = z + q[1];
    const kk = CORNER_XZ.findIndex(([cx, cz]) => lx + cx === qx && lz + cz === qz);
    return kk < 0 ? 0 : concaveRound(map, lx, lz, kk)?.r ?? 0;
  }));
}

/** The drop along a bevelled edge, as (position along the edge, drop) points: tapering to 0 at a closed end. */
function bevelProfile(lo: number, hi: number, d: number, ends: boolean[]): [number, number][] {
  const t = Math.min(d, (hi - lo) / 2), pts: [number, number][] = [[lo, ends[0] ? 0 : d]];
  if (ends[0]) pts.push([lo + t, d]);
  if (ends[1]) pts.push([hi - t, d]);
  pts.push([hi, ends[1] ? 0 : d]);
  return pts.filter((p, i) => i === 0 || p[0] - pts[i - 1][0] > 1e-6);
}

/** A bevelled top: the flat middle, a sloped strip on each dropping edge, and the corners between them. */
function bevelSurfaces(x: number, z: number, y: number, b: number[], ends0: boolean[][], r: number[] = [0, 0, 0, 0], inner0?: number[][]): Surface[] {
  const inner = inner0 ?? [[0, 0], [0, 0], [0, 0], [0, 0]];
  // An end running round an inner corner doesn't taper: the curve carries it on.
  const ends = ends0.map((e, i) => [e[0] && !inner[i][0], e[1] && !inner[i][1]]);
  const [bn, bs, bw, be] = b;
  const x0 = x, x1 = x + 1, z0 = z, z1 = z + 1, ix0 = x0 + bw, ix1 = x1 - be, iz0 = z0 + bn, iz1 = z1 - bs;
  const out: Surface[] = [];
  const arcs = r.map((R, k) => (R > 0 ? bevelArc(x, z, k, R, b) : null));
  if (!arcs.some(Boolean)) out.push([[ix0, y, iz0], [ix1, y, iz0], [ix1, y, iz1], [ix0, y, iz1]]);
  else {
    // The flat top with its rounded corners: a fan from its middle.
    const inner: [number, number][] = [];
    ([[ix0, iz0], [ix1, iz0], [ix1, iz1], [ix0, iz1]] as [number, number][]).forEach((p, k) => { if (arcs[k]) inner.push(...arcs[k]!.map((q) => q.i)); else inner.push(p); });
    const mx = inner.reduce((a, p) => a + p[0], 0) / inner.length, mz = inner.reduce((a, p) => a + p[1], 0) / inner.length;
    inner.forEach((p, n) => { const q = inner[(n + 1) % inner.length]; out.push([[mx, y, mz], [p[0], y, p[1]], [q[0], y, q[1]], [q[0], y, q[1]]]); });
    // The bevel round each corner.
    for (const arc of arcs) if (arc) for (let n = 0; n + 1 < arc.length; n++) {
      const A = arc[n], B = arc[n + 1];
      out.push([[A.o[0], y - A.d, A.o[1]], [B.o[0], y - B.d, B.o[1]], [B.i[0], y, B.i[1]], [A.i[0], y, A.i[1]]]);
    }
  }
  // Each strip, piece by piece along its profile (outer edge dropped, inner edge at the top).
  const strip = (ei: number, lo: number, hi: number, outer: (s: number) => [number, number], inner: (s: number) => [number, number]) => {
    const pts = bevelProfile(lo, hi, b[ei], ends[ei]);
    for (let i = 0; i + 1 < pts.length; i++) {
      const [s1, d1] = pts[i], [s2, d2] = pts[i + 1], [ax, az] = outer(s1), [bx, bz] = outer(s2), [cx, cz] = inner(s2), [dx, dz] = inner(s1);
      out.push([[ax, y - d1, az], [bx, y - d2, bz], [cx, y, cz], [dx, y, dz]]);
    }
  };
  if (bn) strip(0, r[0] ? x0 + r[0] : ix0 + inner[0][0], r[1] ? x1 - r[1] : ix1 - inner[0][1], (s) => [s, z0], (s) => [s, iz0]);
  if (bs) strip(1, r[3] ? x0 + r[3] : ix0 + inner[1][0], r[2] ? x1 - r[2] : ix1 - inner[1][1], (s) => [s, z1], (s) => [s, iz1]);
  if (bw) strip(2, r[0] ? z0 + r[0] : iz0 + inner[2][0], r[3] ? z1 - r[3] : iz1 - inner[2][1], (s) => [x0, s], (s) => [ix0, s]);
  if (be) strip(3, r[1] ? z0 + r[1] : iz0 + inner[3][0], r[2] ? z1 - r[2] : iz1 - inner[3][1], (s) => [x1, s], (s) => [ix1, s]);
  // Corners: where two bevels meet, a slanted patch; where only one, its strip carries on to the corner.
  const corner = (cx: number, cz: number, ex: number, ez: number, dX: number, dZ: number) => {
    // Nothing to fill when the corner has no width (one edge isn't bevelled): it would only be a sliver on end.
    if (Math.abs(ex - cx) < 1e-6 || Math.abs(ez - cz) < 1e-6) return;
    const d = Math.max(dX, dZ);
    out.push([[cx, y - d, cz], [ex, y - dZ, cz], [ex, y, ez], [cx, y - dX, ez]]);
  };
  if (!r[0]) corner(x0, z0, ix0, iz0, bw, bn);
  if (!r[1]) corner(x1, z0, ix1, iz0, be, bn);
  if (!r[2]) corner(x1, z1, ix1, iz1, be, bs);
  if (!r[3]) corner(x0, z1, ix0, iz1, bw, bs);
  return out;
}

/* ------------------------------------------------------------------ rounded shorelines */

/** Neighbours around each corner (NW, NE, SE, SW): the two beside it and the one diagonal to it. */
const CORNER_NB: [number, number][][] = [
  [[-1, 0], [0, -1], [-1, -1]],
  [[1, 0], [0, -1], [1, -1]],
  [[1, 0], [0, 1], [1, 1]],
  [[-1, 0], [0, 1], [-1, 1]],
];
const ARC_SEGMENTS = 12;

export interface CornerRounding {
  /** Corners of this (higher) cell cut round where it juts out into water. */
  convex: boolean[];
  /** Height (world units) of the water-side ground under each cut corner. */
  lowY: number[];
  /** Corners of this (lower, wet) cell filled round where the bank wraps around it. */
  concave: boolean[];
  /** Height (world units) of the bank that fills each concave corner. */
  highY: number[];
}

/**
 * Where the shoreline gets rounded. A corner is rounded when this cell and the three cells around that
 * corner are all flat, the three share one height, and the step between them involves water:
 * - convex: this cell is higher and the three are water (a bank corner jutting into a pond), or
 * - concave: this cell is water and the three are higher (the bank wraps around this corner).
 */
export function cornerRounding(map: TileMap, x: number, z: number): CornerRounding {
  const r: CornerRounding = { convex: [false, false, false, false], lowY: [0, 0, 0, 0], concave: [false, false, false, false], highY: [0, 0, 0, 0] };
  const flat = (cx: number, cz: number) => map.inMap(cx, cz) && !map.rampAt(cx, cz);
  if (!flat(x, z)) return r;
  const h = map.heightAt(x, z), wet = !!map.waterAt(x, z);
  for (let k = 0; k < 4; k++) {
    const nb = CORNER_NB[k].map(([dx, dz]) => [x + dx, z + dz] as [number, number]);
    if (!nb.every(([cx, cz]) => flat(cx, cz))) continue;
    const hs = nb.map(([cx, cz]) => map.heightAt(cx, cz));
    if (hs[1] !== hs[0] || hs[2] !== hs[0]) continue;
    // Soft blocky banks aren't rounded: their bevels already soften the edge, and a round wall would stand up
    // through the bevel as a dark wedge.
    if (hs[0] < h && nb.every(([cx, cz]) => map.waterAt(cx, cz))) { if (map.heightStyle(x, z) !== 'b') { r.convex[k] = true; r.lowY[k] = hs[0]; } }
    else if (hs[0] > h && wet && !nb.some(([cx, cz]) => map.heightStyle(cx, cz) === 'b')) { r.concave[k] = true; r.highY[k] = hs[0]; }
  }
  return r;
}

const CORNER_XZ_ROUND: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** How far (in tiles) the rounded shoreline wanders in and out of a perfect quarter circle. */
const ARC_WOBBLE = 0.13;

/**
 * Points of the rounded edge that replaces corner k: a quarter circle (radius ½ around the cell centre)
 * from the middle of the edge before the corner to the middle of the edge after it, roughened with
 * noise so it looks like a natural bank. The ends stay put so they meet the straight walls, and the noise
 * depends only on position, so the bank top, the wall and the water under it all follow the same line.
 */
export function cornerArc(x: number, z: number, k: number): [number, number][] {
  const prev = CORNER_XZ_ROUND[(k + 3) % 4], cur = CORNER_XZ_ROUND[k], next = CORNER_XZ_ROUND[(k + 1) % 4];
  const a0 = Math.atan2((prev[1] + cur[1]) / 2 - 0.5, (prev[0] + cur[0]) / 2 - 0.5);
  let a1 = Math.atan2((cur[1] + next[1]) / 2 - 0.5, (cur[0] + next[0]) / 2 - 0.5);
  while (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
  while (a1 - a0 < -Math.PI) a1 += Math.PI * 2;
  const out: [number, number][] = [];
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS, a = a0 + (a1 - a0) * t;
    const px = x + 0.5 + Math.cos(a) * 0.5, pz = z + 0.5 + Math.sin(a) * 0.5;
    // Two octaves of value noise, faded to zero at both ends.
    const n = (valueNoise(px * 3.1, pz * 3.1) - 0.5) * 1.4 + (valueNoise(px * 7.3 + 17, pz * 7.3 + 5) - 0.5) * 0.6;
    const r = 0.5 + n * ARC_WOBBLE * Math.sin(Math.PI * t);
    out.push([x + 0.5 + Math.cos(a) * r, z + 0.5 + Math.sin(a) * r]);
  }
  return out;
}

function hash2(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Smooth 2D value noise in 0..1. */
function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

/** Outline of a cell with some corners rounded, in order around its edge. */
function roundedOutline(x: number, z: number, convex: boolean[]): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k < 4; k++) {
    if (convex[k]) pts.push(...cornerArc(x, z, k));
    else pts.push([x + CORNER_XZ_ROUND[k][0], z + CORNER_XZ_ROUND[k][1]]);
  }
  return pts;
}

/** The sliver between a cell's corner and its arc, as triangles (quads with a repeated corner) at height y. */
export function cornerSliver(x: number, z: number, k: number, y: number): Surface[] {
  const q: V3 = [x + CORNER_XZ_ROUND[k][0], y, z + CORNER_XZ_ROUND[k][1]], arc = cornerArc(x, z, k), out: Surface[] = [];
  for (let i = 0; i < arc.length - 1; i++) out.push([q, [arc[i][0], y, arc[i][1]], [arc[i + 1][0], y, arc[i + 1][1]], [arc[i + 1][0], y, arc[i + 1][1]]]);
  return out;
}

interface EdgeSpec { a: [number, number]; b: [number, number]; nb: [number, number]; nbCorners: [number, number]; out: V3; along: 'x' | 'z' }
/** The four edges of a cell: which of its corners lie on the edge, the neighbour, and the neighbour's matching corners. */
const EDGES: EdgeSpec[] = [
  { a: [0, 1], b: [0, 0], nb: [0, -1], nbCorners: [3, 2], out: [0, 0, -1], along: 'x' }, // north
  { a: [3, 2], b: [0, 1], nb: [0, 1], nbCorners: [0, 1], out: [0, 0, 1], along: 'x' },   // south
  { a: [0, 3], b: [0, 0], nb: [-1, 0], nbCorners: [1, 2], out: [-1, 0, 0], along: 'z' }, // west
  { a: [1, 2], b: [1, 0], nb: [1, 0], nbCorners: [0, 3], out: [1, 0, 0], along: 'z' },   // east
];
const CORNER_XZ: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];

export interface TerrainGeometry {
  /** Top surfaces of every cell, UV-mapped onto the whole map (u = x / width, v = 1 - z / height). */
  ground: QuadList;
  /**
   * Top surfaces of the cells of each imported tile, UV-mapped in world tiles (for repeating textures).
   * With blending on, this includes neighbouring cells it may spread into (the shader trims it to its edge).
   */
  overlays: Map<string, QuadList>;
  /** Rounded-shoreline pieces textured with an imported tile: always drawn whole (no blending). */
  slivers: Map<string, QuadList>;
  /** Height above the ground for each imported tile's overlay: higher priority sits higher, so it covers the others. */
  lifts: Map<string, number>;
  /** Cliff walls and stair risers, UV-mapped in world units, grouped by how they look (see `wallLook`). */
  walls: Map<string, QuadList>;
  /**
   * Soft blocky's grass lip: the top's ground folded over onto the top of the cliff below it, UV-mapped like `ground`
   * (and like `overlays` for imported tiles), each corner's `extra` how far down the lip it is (0 … 1).
   */
  lip: QuadList;
  lipOverlays: Map<string, QuadList>;
}

/**
 * Build the whole ground. `overlayKeys` are the tile keys drawn with their own repeating texture,
 * with the span (tiles per texture copy) for each.
 */
export function buildTerrainGeometry(map: TileMap, overlayKeys: Map<string, number> = new Map(),
  wallLook: (x: number, z: number) => string = () => 'bricks'): TerrainGeometry {
  const ground = new QuadList(), walls = new Map<string, QuadList>(), overlays = new Map<string, QuadList>(), slivers = new Map<string, QuadList>();
  const lip = new QuadList(), lipOverlays = new Map<string, QuadList>(), LIP = softLook().lip;
  const W = map.w, H = map.h;
  const cat = map.tiles;
  // Overlays stack by priority, a millimetre apart.
  const lifts = new Map([...overlayKeys.keys()].sort((a, b) => cat.blendFor(a).priority - cat.blendFor(b).priority).map((k, i) => [k, 0.004 + i * 0.002] as [string, number]));
  const listFor = (m: Map<string, QuadList>, key: string) => { let q = m.get(key); if (!q) m.set(key, (q = new QuadList())); return q; };
  const addOverlay = (m: Map<string, QuadList>, key: string, span: number, s: Surface, light?: V3) => {
    const lift = lifts.get(key) ?? 0.004;
    listFor(m, key).add(s.map((p) => [p[0], p[1] + lift, p[2]] as V3) as Surface, s.map((p) => [p[0] / span, -p[2] / span] as [number, number]), UP, undefined, light);
  };
  const level = (x: number, z: number) => (map.isHill(x, z) ? 777 : map.step(x, z) * 2) + (map.waterAt(x, z) ? 1 : 0) * 1000;
  /** Can imported tile `key` (on neighbour tx, tz) spread into cell x, z? */
  const spreads = (key: string, x: number, z: number, tx: number, tz: number) => {
    const own = map.terrain(x, z), bk = cat.blendFor(key), bo = cat.blendFor(own);
    return own !== key && bk.blend && bo.blend && bk.priority > bo.priority && level(x, z) === level(tx, tz);
  };

  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const key = map.terrain(x, z);
      const span = overlayKeys.get(key);
      // Imported tiles from neighbouring cells that may spread into this one.
      const spreading = new Set<string>();
      for (const [dx, dz] of NEIGHBOURS8) {
        const tx = x + dx, tz = z + dz;
        if (!map.inMap(tx, tz)) continue;
        const nk = map.terrain(tx, tz);
        if (overlayKeys.has(nk) && !spreading.has(nk) && spreads(nk, x, z, tx, tz)) spreading.add(nk);
      }
      // Soft blocky's bevels are lit like the flat top (no line where they meet; the shape still shows in its outline).
      const soft = map.heightStyle(x, z) === 'b' && !map.rampAt(x, z), flatLit = soft ? UP : undefined;
      for (const s of cellSurfaces(map, x, z)) {
        ground.add(s, s.map((p) => [p[0] / W, 1 - p[2] / H] as [number, number]), UP, undefined, flatLit);
        if (span !== undefined) addOverlay(overlays, key, span, s, flatLit);
        for (const nk of spreading) addOverlay(overlays, nk, overlayKeys.get(nk)!, s, flatLit);
      }
      // A wall belongs to the higher cell, and looks the way that cell's tile says.
      const wallsFor = (look: string) => { let q = walls.get(look); if (!q) walls.set(look, (q = new QuadList())); return q; };
      const round = cornerRounding(map, x, z);
      // The top's ground folds a little way over the cliff, breaking up as it goes down (a dither), lit like the top.
      const lipFn: LipFn | undefined = LIP > 0 && !map.rampAt(x, z) ? (a, b, out, footA, footB) => {
        const LL = lipLength(LIP, a[1] - footA, b[1] - footB), da = Math.min(LL, a[1] - footA), db = Math.min(LL, b[1] - footB);
        if (da < 0.02 && db < 0.02) return;
        const l = Math.hypot(out[0], out[2]) || 1, nx = out[0] / l, nz = out[2] / l;
        // Its top edge rises a hair above the ground, to the imported tiles' height, hiding the painted ground's edge
        // under them (it showed as a line of a different green).
        const at = (p: V3, dy: number, off: number): V3 => [p[0] + nx * off, p[1] - dy + (dy === 0 ? LIP_RISE : 0), p[2] + nz * off];
        // A point h down the lip shows the top h in from the edge (the ground folded over).
        const fold = (p: V3, h: number): [number, number] => [p[0] - nx * h, p[2] - nz * h];
        const f = [fold(a, 0), fold(b, 0), fold(b, db), fold(a, da)], fade: [number, number, number, number] = [0, 0, db / LL, da / LL];
        const face: V3 = [nx, 0, nz];
        lip.add([at(a, 0, 0.003), at(b, 0, 0.003), at(b, db, 0.003), at(a, da, 0.003)], f.map(([px, pz]) => [px / W, 1 - pz / H] as [number, number]), face, fade, UP);
        if (span !== undefined) listFor(lipOverlays, key).add([at(a, 0, 0.005), at(b, 0, 0.005), at(b, db, 0.005), at(a, da, 0.005)], f.map(([px, pz]) => [px / span, -pz / span] as [number, number]), face, fade, UP);
      } : undefined;
      addWalls(map, x, z, wallsFor(wallLook(x, z)), round.convex, lipFn);

      // Soft blocky's rounded corners: the curved cliff round each, and the lower ground filling the cut corner.
      if (soft) {
        const bv = bevels(map, x, z), rr = bevelRounds(map, x, z, bv), cy = map.heightAt(x, z);
        for (let k = 0; k < 4; k++) {
          if (!rr.r[k]) continue;
          const arc = bevelArc(x, z, k, rr.r[k], bv), low = rr.low[k], wq = wallsFor(wallLook(x, z));
          const [ddx, ddz] = CORNER_NB[k][2], qx = x + CORNER_XZ_ROUND[k][0], qz = z + CORNER_XZ_ROUND[k][1];
          const mirror = (p: V3) => [(2 * qx - p[0]) / W, 1 - (2 * qz - p[2]) / H] as [number, number];
          const dkey = map.terrain(x + ddx, z + ddz), dspan = overlayKeys.get(dkey);
          const ccx = k === 1 || k === 2 ? x + 1 - rr.r[k] : x + rr.r[k], ccz = k >= 2 ? z + 1 - rr.r[k] : z + rr.r[k];
          let u = 0;
          for (let n = 0; n + 1 < arc.length; n++) {
            const A = arc[n], B = arc[n + 1], len = Math.hypot(B.o[0] - A.o[0], B.o[1] - A.o[1]);
            const facing: V3 = [(A.o[0] + B.o[0]) / 2 - ccx, 0, (A.o[1] + B.o[1]) / 2 - ccz];
            const ta = cy - A.d, tb = cy - B.d, lo = low - SINK;
            wq.add([[A.o[0], ta, A.o[1]], [B.o[0], tb, B.o[1]], [B.o[0], lo, B.o[1]], [A.o[0], lo, A.o[1]]], [[u, ta], [u + len, tb], [u + len, lo], [u, lo]], facing);
            lipFn?.([A.o[0], ta, A.o[1]], [B.o[0], tb, B.o[1]], facing, low, low);
            u += len;
            // The lower ground in the corner cut away.
            const t: Surface = [[qx, low, qz], [A.o[0], low, A.o[1]], [B.o[0], low, B.o[1]], [B.o[0], low, B.o[1]]];
            ground.add(t, t.map(mirror), UP);
            if (dspan !== undefined) addOverlay(slivers, dkey, dspan, t);
          }
        }
      }

      // Rounded shoreline pieces. Their ground texture is borrowed from the cell diagonally across the corner
      // (mirrored through the corner point), so a bank's fill shows bank and a cut corner shows lake bed.
      for (let k = 0; k < 4; k++) {
        if (!round.convex[k] && !round.concave[k]) continue;
        const [ddx, ddz] = CORNER_NB[k][2], qx = x + CORNER_XZ_ROUND[k][0], qz = z + CORNER_XZ_ROUND[k][1];
        const top = round.convex[k] ? round.lowY[k] : round.highY[k];
        const mirror = (p: V3) => [(2 * qx - p[0]) / W, 1 - (2 * qz - p[2]) / H] as [number, number];
        const dkey = map.terrain(x + ddx, z + ddz), dspan = overlayKeys.get(dkey);
        for (const t of cornerSliver(x, z, k, top)) {
          ground.add(t, t.map(mirror), UP);
          if (dspan !== undefined) addOverlay(slivers, dkey, dspan, t);
        }
        // The curved wall: down from this cell's top to the water-side ground (convex), or from the bank down into this cell (concave).
        const arc = cornerArc(x, z, k), cy = map.heightAt(x, z);
        const hi = round.convex[k] ? cy : top, lo = (round.convex[k] ? top : cy) - SINK;
        const wq = wallsFor(round.convex[k] ? wallLook(x, z) : wallLook(x + ddx, z + ddz));
        let u = 0;
        for (let i = 0; i < arc.length - 1; i++) {
          const [ax, az] = arc[i], [bx, bz] = arc[i + 1], len = Math.hypot(bx - ax, bz - az);
          const mx = (ax + bx) / 2 - (x + 0.5), mz = (az + bz) / 2 - (z + 0.5);
          const facing: V3 = round.convex[k] ? [mx, 0, mz] : [-mx, 0, -mz];
          wq.add([[ax, hi, az], [bx, hi, bz], [bx, lo, bz], [ax, lo, az]], [[u, hi], [u + len, hi], [u + len, lo], [u, lo]], facing);
          if (round.convex[k]) lipFn?.([ax, hi, az], [bx, hi, bz], facing, top, top);
          u += len;
        }
      }

      // Soft blocky's inner corners: the plateau around this (lower) cell's corner curves round into it.
      for (let k = 0; k < 4; k++) {
        const cr = concaveRound(map, x, z, k);
        if (!cr) continue;
        const { r, h, b } = cr, low = map.heightAt(x, z);
        const qx = x + CORNER_XZ[k][0], qz = z + CORNER_XZ[k][1], sx = CORNER_XZ[k][0] ? -1 : 1, sz = CORNER_XZ[k][1] ? -1 : 1;
        // Local (u, v) runs into this cell from the corner; the plateau is at u < 0 or v < 0.
        const P = (u: number, v: number): [number, number] => [qx + sx * u, qz + sz * v];
        const [ddx, ddz] = CORNER_NB[k][2], dk = map.terrain(x + ddx, z + ddz), dspan = overlayKeys.get(dk);
        // The ground image is borrowed from the cell diagonally across (the plateau's own), shifted by a whole tile.
        const guv = (p: V3) => [(p[0] + ddx) / W, 1 - (p[2] + ddz) / H] as [number, number];
        const face = (p: V3[]): void => {
          const q = p as Surface;
          ground.add(q, q.map(guv), UP, undefined, UP);
          if (dspan !== undefined) addOverlay(slivers, dk, dspan, q, UP);
        };
        // Rays out from the curve's centre, round the quarter facing the corner (and the union's own corners).
        const cAng = (u: number, v: number) => Math.atan2(v - r, u - r);
        const angs = [Math.PI, Math.PI * 1.5, Math.PI * 1.25, cAng(-b, 0) + Math.PI * 2, cAng(0, -b) + Math.PI * 2];
        for (let n = 1; n < 16; n++) angs.push(Math.PI + (n / 16) * Math.PI * 0.5);
        const sorted = [...new Set(angs.map((a) => Math.round(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) * 1e6) / 1e6))].filter((a) => a >= Math.PI - 1e-6 && a <= Math.PI * 1.5 + 1e-6).sort((a, b2) => a - b2);
        const rays = sorted.map((a) => {
          const ca = Math.cos(a), sa = Math.sin(a), inf = 1e9;
          const tBox = Math.min(ca < -1e-9 ? (r + b) / -ca : inf, sa < -1e-9 ? (r + b) / -sa : inf);
          const tD = Math.max(ca < -1e-9 ? r / -ca : inf, sa < -1e-9 ? r / -sa : inf);
          const tEnd = Math.min(tBox, tD);
          const at = (t: number, y: number): V3 => { const [px, pz] = P(r + ca * t, r + sa * t); return [px, y, pz]; };
          return { o: at(r, h - b), i: at(r + b, h), e: at(tEnd, h), long: tEnd > r + b + 1e-4, ca, sa };
        });
        const wq = wallsFor(wallLook(x + ddx, z + ddz));
        let u = 0;
        for (let n = 0; n + 1 < rays.length; n++) {
          const A = rays[n], B = rays[n + 1];
          face([A.o, B.o, B.i, A.i]);
          if (A.long || B.long) face([A.i, B.i, B.e, A.e]);
          // The curved cliff from the bevel down to this cell's ground, facing into it.
          const len = Math.hypot(B.o[0] - A.o[0], B.o[2] - A.o[2]), lo = low - SINK;
          const facing: V3 = [-sx * (A.ca + B.ca), 0, -sz * (A.sa + B.sa)];
          wq.add([A.o, B.o, [B.o[0], lo, B.o[2]], [A.o[0], lo, A.o[2]]], [[u, A.o[1]], [u + len, B.o[1]], [u + len, lo], [u, lo]], facing);
          u += len;
          if (LIP > 0) {
            const LL = lipLength(LIP, A.o[1] - low, B.o[1] - low), da = Math.min(LL, A.o[1] - low), db = Math.min(LL, B.o[1] - low), l = Math.hypot(facing[0], facing[2]) || 1, nx = facing[0] / l, nz = facing[2] / l;
            const at = (p: V3, dy: number, off: number): V3 => [p[0] + nx * off, p[1] - dy + (dy === 0 ? LIP_RISE : 0), p[2] + nz * off];
            const fold = (p: V3, hh: number): V3 => [p[0] - nx * hh, 0, p[2] - nz * hh];
            const f = [fold(A.o, 0), fold(B.o, 0), fold(B.o, db), fold(A.o, da)], fade: [number, number, number, number] = [0, 0, db / LL, da / LL];
            lip.add([at(A.o, 0, 0.003), at(B.o, 0, 0.003), at(B.o, db, 0.003), at(A.o, da, 0.003)], f.map(guv), [nx, 0, nz], fade, UP);
            if (dspan !== undefined) listFor(lipOverlays, dk).add([at(A.o, 0, 0.005), at(B.o, 0, 0.005), at(B.o, db, 0.005), at(A.o, da, 0.005)], f.map((p) => [p[0] / dspan, -p[2] / dspan] as [number, number]), [nx, 0, nz], fade, UP);
          }
        }
      }
    }
  return { ground, overlays, walls, slivers, lifts, lip, lipOverlays };
}

/**
 * A cliff face: the wall split into a grid whose points (all but the top row, which meets the ground above) jut out
 * by noise, so it reads as broken rock rather than a smooth block.
 */
function jaggedWall(walls: QuadList, p1: [number, number], p2: [number, number], t1: number, t2: number, b1: number, b2: number, out: V3, along: 'x' | 'z'): void {
  const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), cols = Math.max(2, Math.round(len * 4));
  const height = Math.max(t1, t2) - Math.min(b1, b2), rows = Math.max(2, Math.round(height * 3));
  const pt = (i: number, j: number): V3 => {
    const u = i / cols, v = j / rows;
    const x = p1[0] + (p2[0] - p1[0]) * u, zz = p1[1] + (p2[1] - p1[1]) * u;
    const top = t1 + (t2 - t1) * u, bot = b1 + (b2 - b1) * u, y = top + (bot - top) * v;
    // Out from the face, never in (no gaps with the ground on top); the ends stay flush (easing in over the last
    // column) so they meet the next wall, round corners and along straight runs, without a seam.
    const edge = Math.min(1, Math.min(u, 1 - u) * cols * 0.5);
    const k = j === 0 ? 0 : (valueNoise(x * 3.7 + y * 1.3, zz * 3.7 - y * 2.1) * 0.75 + valueNoise(x * 9.1, y * 8.3 + zz * 9.1) * 0.25) * 0.16 * edge;
    return [x + out[0] * k, y, zz + out[2] * k];
  };
  const u = (p: V3) => (along === 'x' ? p[0] : p[2]);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
    walls.add([a, b, c, d], [[u(a), a[1]], [u(b), b[1]], [u(c), c[1]], [u(d), d[1]]], out);
  }
}

/** A wall's top edge (two points), which way it faces and the wall's foot under each end: for the grass lip. */
type LipFn = (a: V3, b: V3, out: V3, footA: number, footB: number) => void;

function addWalls(map: TileMap, x: number, z: number, walls: QuadList, rounded: boolean[] = [false, false, false, false], lip?: LipFn): void {
  const c = map.cornersAt(x, z);
  const ramp = map.rampAt(x, z);
  const stairs = ramp?.ramp.style === 'stairs' && ramp.dir ? ramp.dir : null;
  const style = ramp ? '.' : map.heightStyle(x, z);
  const bev = style === 'b' ? bevels(map, x, z) : [0, 0, 0, 0];
  const bevEnd = style === 'b' ? bevelEnds(map, x, z, bev) : null;
  const trim = style === 'b' ? bevelRounds(map, x, z, bev).r : [0, 0, 0, 0];
  const inner = style === 'b' ? bevelInner(map, x, z, bev) : null;
  for (const [ei, e] of EDGES.entries()) {
    const nx = x + e.nb[0], nz = z + e.nb[1];
    const inside = map.inMap(nx, nz);
    const nc = map.cornersAt(nx, nz);
    const p1 = CORNER_XZ[e.a[0]], p2 = CORNER_XZ[e.a[1]];
    const x1 = x + p1[0], z1 = z + p1[1], x2 = x + p2[0], z2 = z + p2[1];
    // A bevelled edge's wall starts below the bevel.
    const a1 = c[e.a[0]] - bev[ei], a2 = c[e.a[1]] - bev[ei];
    const b1 = inside ? nc[e.nbCorners[0]] : 0, b2 = inside ? nc[e.nbCorners[1]] : 0;
    const u = (px: number, pz: number) => (e.along === 'x' ? px : pz);

    // Stair sides are stepped: one wall piece per step, from the tread down to the neighbour.
    const isSide = stairs && (((stairs === 'up' || stairs === 'down') && e.along === 'z') || ((stairs === 'left' || stairs === 'right') && e.along === 'x'));
    if (isSide) {
      const lo = map.heightAt(x, z);
      for (let i = 0; i < STAIR_STEPS; i++) {
        const y = lo + ((i + 1) / STAIR_STEPS) * STEP;
        const [sx1, sz1] = stairPoint(x, z, stairs!, i / STAIR_STEPS, e.out[0] > 0 || e.out[2] > 0 ? 1 : 0);
        const [sx2, sz2] = stairPoint(x, z, stairs!, (i + 1) / STAIR_STEPS, e.out[0] > 0 || e.out[2] > 0 ? 1 : 0);
        // Neighbour ground along this edge (linear between its corners).
        const f = (px: number, pz: number) => {
          const t = e.along === 'x' ? (px - x1) / (x2 - x1) : (pz - z1) / (z2 - z1);
          return b1 + (b2 - b1) * t;
        };
        const g1 = f(sx1, sz1), g2 = f(sx2, sz2);
        if (y - g1 > 1e-4 || y - g2 > 1e-4) {
          // Reaches a little below the ground in front, so no hairline gap shows at its foot.
          const f1 = Math.min(g1, y) - SINK, f2 = Math.min(g2, y) - SINK;
          walls.add([[sx1, y, sz1], [sx2, y, sz2], [sx2, f2, sz2], [sx1, f1, sz1]],
            [[u(sx1, sz1), y], [u(sx2, sz2), y], [u(sx2, sz2), f2], [u(sx1, sz1), f1]], e.out);
        }
      }
      continue;
    }

    if (!inside) {
      // The map's outer edge: a skirt from the edge down below the land around the map (which sits a little
      // lower), so no gap shows between them. For a pit at the edge, also a wall down into it, facing in.
      const t1 = Math.max(a1, 0), t2 = Math.max(a2, 0);
      walls.add([[x1, t1, z1], [x2, t2, z2], [x2, EDGE_SKIRT, z2], [x1, EDGE_SKIRT, z1]],
        [[u(x1, z1), t1], [u(x2, z2), t2], [u(x2, z2), EDGE_SKIRT], [u(x1, z1), EDGE_SKIRT]], e.out);
      if (b1 - a1 > 1e-4 || b2 - a2 > 1e-4) {
        walls.add([[x1, b1, z1], [x2, b2, z2], [x2, a2, z2], [x1, a1, z1]],
          [[u(x1, z1), b1], [u(x2, z2), b2], [u(x2, z2), a2], [u(x1, z1), a1]], [-e.out[0], 0, -e.out[2]]);
      }
      continue;
    }
    if (a1 - b1 > 1e-4 || a2 - b2 > 1e-4) {
      // This cell is higher: wall from its edge down to the neighbour. Next to a rounded corner the wall
      // only runs to the middle of the edge; the curved wall takes over from there.
      let [sx1, sz1, sa1, sb1] = [x1, z1, a1, b1], [sx2, sz2, sa2, sb2] = [x2, z2, a2, b2];
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2, ma = (a1 + a2) / 2, mb = (b1 + b2) / 2;
      if (rounded[e.a[0]]) [sx1, sz1, sa1, sb1] = [mx, mz, ma, mb];
      if (rounded[e.a[1]]) [sx2, sz2, sa2, sb2] = [mx, mz, ma, mb];
      if (rounded[e.a[0]] && rounded[e.a[1]]) continue;
      // Soft blocky, a bevel tapering to nothing at an end: the wall's top follows it (up to the full height there).
      const in0 = inner?.[ei][0] ?? 0, in1 = inner?.[ei][1] ?? 0;
      if (bevEnd && (bevEnd[ei][0] || bevEnd[ei][1] || trim[e.a[0]] || trim[e.a[1]] || in0 || in1) && !rounded[e.a[0]] && !rounded[e.a[1]]) {
        const pts = bevelProfile(trim[e.a[0]] || in0, 1 - (trim[e.a[1]] || in1), bev[ei], [bevEnd[ei][0] && !in0, bevEnd[ei][1] && !in1]), c1 = c[e.a[0]], c2 = c[e.a[1]];
        for (let i = 0; i + 1 < pts.length; i++) {
          const [t1, d1] = pts[i], [t2, d2] = pts[i + 1];
          const qx1 = x1 + (x2 - x1) * t1, qz1 = z1 + (z2 - z1) * t1, qx2 = x1 + (x2 - x1) * t2, qz2 = z1 + (z2 - z1) * t2;
          const top1 = c1 + (c2 - c1) * t1 - d1, top2 = c1 + (c2 - c1) * t2 - d2;
          const g1 = b1 + (b2 - b1) * t1, g2 = b1 + (b2 - b1) * t2;
          if (top1 - g1 < 1e-4 && top2 - g2 < 1e-4) continue;
          const f1 = Math.min(top1, g1) - SINK, f2 = Math.min(top2, g2) - SINK;
          walls.add([[qx1, top1, qz1], [qx2, top2, qz2], [qx2, f2, qz2], [qx1, f1, qz1]],
            [[u(qx1, qz1), top1], [u(qx2, qz2), top2], [u(qx2, qz2), f2], [u(qx1, qz1), f1]], e.out);
          lip?.([qx1, top1, qz1], [qx2, top2, qz2], e.out, g1, g2);
        }
        continue;
      }
      const lo1 = Math.min(sa1, sb1) - SINK, lo2 = Math.min(sa2, sb2) - SINK;
      if (style === 'c') { jaggedWall(walls, [sx1, sz1], [sx2, sz2], sa1, sa2, lo1, lo2, e.out, e.along); continue; }
      walls.add([[sx1, sa1, sz1], [sx2, sa2, sz2], [sx2, lo2, sz2], [sx1, lo1, sz1]],
        [[u(sx1, sz1), sa1], [u(sx2, sz2), sa2], [u(sx2, sz2), lo2], [u(sx1, sz1), lo1]], e.out);
      lip?.([sx1, sa1, sz1], [sx2, sa2, sz2], e.out, sb1, sb2);
    }
  }

  // Stair risers: the vertical face in front of each step, facing down the stairs.
  if (stairs) {
    const lo = map.heightAt(x, z);
    const face: V3 = { up: [0, 0, 1], down: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] }[stairs] as V3;
    for (let i = 0; i < STAIR_STEPS; i++) {
      const s = i / STAIR_STEPS, top = lo + ((i + 1) / STAIR_STEPS) * STEP, bottom = lo + (i / STAIR_STEPS) * STEP;
      const [ax, az] = stairPoint(x, z, stairs, s, 0), [bx, bz] = stairPoint(x, z, stairs, s, 1);
      const along = stairs === 'up' || stairs === 'down';
      walls.add([[ax, top, az], [bx, top, bz], [bx, bottom, bz], [ax, bottom, az]],
        [[along ? ax : az, top], [along ? bx : bz, top], [along ? bx : bz, bottom], [along ? ax : az, bottom]], face);
    }
  }
}
