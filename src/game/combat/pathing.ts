/** Grid paths for enemies: around cliffs, up ramps, past water. No three.js, so it can be tested on its own. */
import type { TileMap } from '../../world/TileMap';

/** A cell an enemy can stand in: on the map, not blocked, not swimmable or deep water, no solid event. */
export function walkable(m: TileMap, cx: number, cz: number, w: { blockedAt(x: number, z: number): boolean }): boolean {
  if (!m.inMap(cx, cz) || m.isBlocked(cx, cz) || w.blockedAt(cx, cz)) return false;
  const wtr = m.waterAt(cx, cz);
  return !wtr || wtr.kind === 'shallow';
}

/** A* over the tile grid (4 directions, steps of at most 0.3 in height). Returns the cells after the start. */
export function findPath(m: TileMap, sx: number, sz: number, gx: number, gz: number, w: { blockedAt(x: number, z: number): boolean }, limit = 700): [number, number][] | null {
  if (sx === gx && sz === gz) return [];
  const key = (x: number, z: number) => z * m.w + x;
  const open: { x: number; z: number; f: number }[] = [{ x: sx, z: sz, f: 0 }];
  const g = new Map<number, number>([[key(sx, sz), 0]]), from = new Map<number, number>();
  let n = 0, best = { x: sx, z: sz, h: Infinity };
  while (open.length && n++ < limit) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const c = open.splice(bi, 1)[0], ck = key(c.x, c.z);
    const h0 = Math.abs(gx - c.x) + Math.abs(gz - c.z);
    if (h0 < best.h) best = { x: c.x, z: c.z, h: h0 };
    if (c.x === gx && c.z === gz) break;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, nz = c.z + dz;
      // The goal (where the hero stands) counts as open even next to a wall.
      if (!(nx === gx && nz === gz) && !walkable(m, nx, nz, w)) continue;
      if (!m.inMap(nx, nz) || !canStep(m, c.x, c.z, nx, nz)) continue;
      const nk = key(nx, nz), ng = g.get(ck)! + 1;
      if (ng >= (g.get(nk) ?? Infinity)) continue;
      g.set(nk, ng); from.set(nk, ck);
      open.push({ x: nx, z: nz, f: ng + Math.abs(gx - nx) + Math.abs(gz - nz) });
    }
  }
  // Walk back from the goal (or the closest cell reached).
  let k = g.has(key(gx, gz)) ? key(gx, gz) : key(best.x, best.z);
  if (k === key(sx, sz)) return null;
  const out: [number, number][] = [];
  while (k !== key(sx, sz)) { out.push([k % m.w, Math.floor(k / m.w)]); const p = from.get(k); if (p === undefined) return null; k = p; }
  return out.reverse();
}

/** Can an enemy step from one cell to its neighbour? Compares the ground on both sides of the shared edge, so ramps work. */
export function canStep(m: TileMap, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
  // A point on the shared edge (the middle of it for a straight step).
  const ex = dx ? Math.max(ax, bx) : ax + 0.5, ez = dz ? Math.max(az, bz) : az + 0.5;
  const e = 0.04;
  return Math.abs(m.standY(ex - dx * e, ez - dz * e) - m.standY(ex + dx * e, ez + dz * e)) <= 0.3;
}
