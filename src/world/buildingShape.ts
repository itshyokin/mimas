/**
 * The shape of a building, as plain data (no renderer needed, so the editor and tests can use it too): settings with
 * defaults filled in, its tiles, doors and windows, and the walls / roof / doors / windows as lists of quads.
 */
import { QuadList, type V3 } from './terrainGeometry';
import type { BuildingData, BuildingSide } from './types';

/** A building with every optional setting filled in. */
export interface ResolvedBuilding {
  x: number; z: number; w: number; d: number;
  height: number; wall: string; roof: string;
  roofStyle: 'gable' | 'hip' | 'flat'; ridge: 'x' | 'z';
  pitch: number; overhang: number; windows: 'none' | 'few' | 'many';
  doors: { side: BuildingSide; at: number }[];
}

export const BUILDING_DEFAULTS = { height: 2.5, wall: 'plaster', roof: 'shingle', roofStyle: 'gable', overhang: 0.3, windows: 'few' } as const;

export function resolveBuilding(b: BuildingData): ResolvedBuilding {
  const w = Math.max(1, Math.round(b.w)), d = Math.max(1, Math.round(b.d));
  const ridge = b.ridge ?? (d > w ? 'z' : 'x');
  const span = ridge === 'x' ? d : w;
  return {
    x: b.x, z: b.z, w, d,
    height: Math.max(1, b.height ?? BUILDING_DEFAULTS.height),
    wall: b.wall || BUILDING_DEFAULTS.wall,
    roof: b.roof || BUILDING_DEFAULTS.roof,
    roofStyle: b.roofStyle ?? BUILDING_DEFAULTS.roofStyle,
    ridge,
    pitch: Math.max(0.25, b.pitch ?? defaultPitch(span)),
    overhang: Math.max(0, Math.min(1.5, b.overhang ?? BUILDING_DEFAULTS.overhang)),
    windows: b.windows ?? BUILDING_DEFAULTS.windows,
    doors: (b.doors ?? []).map((o) => ({ side: o.side, at: Math.max(0, Math.min(wallLength(w, d, o.side) - 1, Math.round(o.at))) })),
  };
}

/** A roof rising a bit under 45°: about 0.4 tiles of rise per tile of span, in half-tile steps. */
export function defaultPitch(span: number): number {
  return Math.max(1, Math.min(4, Math.round(span * 0.8) / 2));
}

export const wallLength = (w: number, d: number, side: BuildingSide): number => (side === 'front' || side === 'back' ? w : d);

/** Every tile the building stands on. */
export function buildingCells(b: BuildingData): [number, number][] {
  const out: [number, number][] = [];
  for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) out.push([x, z]);
  return out;
}

/** The footprint tile behind a door (inside the building). */
export function doorCell(b: BuildingData, door: { side: BuildingSide; at: number }): [number, number] {
  switch (door.side) {
    case 'front': return [b.x + door.at, b.z + b.d - 1];
    case 'back': return [b.x + door.at, b.z];
    case 'left': return [b.x, b.z + door.at];
    case 'right': return [b.x + b.w - 1, b.z + door.at];
  }
}

/** The tile just outside a door: where its Transfer event goes. */
export function doorstep(b: BuildingData, door: { side: BuildingSide; at: number }): [number, number] {
  const [x, z] = doorCell(b, door);
  return door.side === 'front' ? [x, z + 1] : door.side === 'back' ? [x, z - 1] : door.side === 'left' ? [x - 1, z] : [x + 1, z];
}

/** Window positions (tile along the wall) on one wall, keeping clear of doors and corners. */
export function windowSlots(r: ResolvedBuilding, side: BuildingSide): number[] {
  if (r.windows === 'none') return [];
  const len = wallLength(r.w, r.d, side);
  const doors = r.doors.filter((o) => o.side === side).map((o) => o.at);
  let slots: number[];
  if (r.windows === 'many') {
    slots = [];
    for (let i = 1; i < len - 1; i += 2) slots.push(i);
    if (len === 2) slots = [0, 1];
  } else if (len >= 4) slots = [Math.floor(len / 4), len - 1 - Math.floor(len / 4)];
  else slots = len === 3 ? [1] : [];
  // A window where a door is moves one tile away from it (if there's room), else it's dropped.
  const clear = (i: number) => i >= 0 && i < len && doors.every((a) => a !== i);
  const out: number[] = [];
  for (const i of slots) {
    const d = doors.find((a) => a === i);
    const j = d === undefined ? i : [i - 1, i + 1].find((k) => clear(k) && !slots.includes(k) && !out.includes(k));
    if (j !== undefined && clear(j) && !out.includes(j)) out.push(j);
  }
  return out.sort((x, y) => x - y);
}

/** Pieces of a building, grouped by what they're drawn with. Keys: "wall:<look>", "roof:<look>", "trim", "door", "window". */
export type BuildingQuads = Map<string, QuadList>;

const FACING: Record<BuildingSide, V3> = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0] };
const DECAL = 0.02;
const FASCIA = 0.12;

/**
 * Add one building's pieces. `floorAt(x, z)` is the ground height of a tile: walls go down to the lowest tile under the
 * building and up `height` from the highest.
 */
export function addBuilding(out: BuildingQuads, b: BuildingData, floorAt: (x: number, z: number) => number): void {
  const r = resolveBuilding(b);
  const list = (k: string) => { let q = out.get(k); if (!q) out.set(k, (q = new QuadList())); return q; };
  const cells = buildingCells(r);
  const heights = cells.map(([x, z]) => floorAt(x, z));
  const yb = Math.min(...heights) - 0.02, yf = Math.max(...heights), yt = yf + r.height;
  const x0 = r.x, x1 = r.x + r.w, z0 = r.z, z1 = r.z + r.d;
  const walls = list('wall:' + r.wall), roof = list('roof:' + r.roof), trim = list('trim');
  const tri = (q: QuadList, a: V3, b2: V3, c: V3, uv: (p: V3) => [number, number], facing: V3) => q.add([a, b2, c, c], [uv(a), uv(b2), uv(c), uv(c)], facing);

  // Walls: textures run in world units (one tile of texture per tile), so neighbouring buildings line up.
  const wallQuad = (side: BuildingSide, ya: number, yb2: number) => {
    const f = FACING[side];
    if (side === 'front' || side === 'back') {
      const z = side === 'front' ? z1 : z0, u = (x: number) => (side === 'front' ? x : -x);
      walls.add([[x0, ya, z], [x1, ya, z], [x1, yb2, z], [x0, yb2, z]], [[u(x0), ya], [u(x1), ya], [u(x1), yb2], [u(x0), yb2]], f);
    } else {
      const x = side === 'left' ? x0 : x1, u = (z: number) => (side === 'left' ? z : -z);
      walls.add([[x, ya, z0], [x, ya, z1], [x, yb2, z1], [x, yb2, z0]], [[u(z0), ya], [u(z1), ya], [u(z1), yb2], [u(z0), yb2]], f);
    }
  };
  for (const s of ['front', 'back', 'left', 'right'] as BuildingSide[]) wallQuad(s, yb, yt);

  // Roof.
  const o = r.overhang, R = yt + r.pitch;
  const rx0 = x0 - o, rx1 = x1 + o, rz0 = z0 - o, rz1 = z1 + o;
  if (r.roofStyle === 'flat') {
    const t = 0.18, yTop = yt + t;
    roof.add([[rx0, yTop, rz0], [rx1, yTop, rz0], [rx1, yTop, rz1], [rx0, yTop, rz1]], [[rx0, -rz0], [rx1, -rz0], [rx1, -rz1], [rx0, -rz1]], [0, 1, 0]);
    trim.add([[rx0, yt, rz0], [rx1, yt, rz0], [rx1, yt, rz1], [rx0, yt, rz1]], [[rx0, rz0], [rx1, rz0], [rx1, rz1], [rx0, rz1]], [0, -1, 0]);
    // Edges (a low parapet).
    trim.add([[rx0, yt, rz1], [rx1, yt, rz1], [rx1, yTop, rz1], [rx0, yTop, rz1]], [[rx0, 0], [rx1, 0], [rx1, t], [rx0, t]], [0, 0, 1]);
    trim.add([[rx0, yt, rz0], [rx1, yt, rz0], [rx1, yTop, rz0], [rx0, yTop, rz0]], [[-rx0, 0], [-rx1, 0], [-rx1, t], [-rx0, t]], [0, 0, -1]);
    trim.add([[rx0, yt, rz0], [rx0, yt, rz1], [rx0, yTop, rz1], [rx0, yTop, rz0]], [[rz0, 0], [rz1, 0], [rz1, t], [rz0, t]], [-1, 0, 0]);
    trim.add([[rx1, yt, rz0], [rx1, yt, rz1], [rx1, yTop, rz1], [rx1, yTop, rz0]], [[-rz0, 0], [-rz1, 0], [-rz1, t], [-rz0, t]], [1, 0, 0]);
  } else {
    // Along the ridge = "a" axis, across it = "c" axis. Work in (a, c) and map back to (x, z).
    const alongX = r.ridge === 'x';
    const P = (a: number, y: number, c: number): V3 => (alongX ? [a, y, c] : [c, y, a]);
    const [a0, a1, c0, c1] = alongX ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
    const am = (a0 + a1) / 2, cm = (c0 + c1) / 2, half = (c1 - c0) / 2;
    const slope = r.pitch / half, eave = yt - slope * o;
    const ra0 = a0 - o, ra1 = a1 + o, rc0 = c0 - o, rc1 = c1 + o;
    // Texture: along the ridge, and down the slope from the ridge (the art's top row at the ridge).
    const slopeUv = (p: V3, n: V3): [number, number] => {
      const hl = Math.hypot(n[0], n[2]) || 1, hx = n[0] / hl, hz = n[2] / hl;
      return [p[0] * -hz + p[2] * hx, -(R - p[1]) / Math.max(0.2, Math.sqrt(Math.max(0, 1 - n[1] * n[1] / (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]))))];
    };
    const face = (pts: V3[], up: V3) => {
      const n = normalOf(pts[0], pts[1], pts[2]), nn: V3 = n[1] < 0 ? [-n[0], -n[1], -n[2]] : n;
      const quad = (pts.length === 3 ? [pts[0], pts[1], pts[2], pts[2]] : pts) as [V3, V3, V3, V3];
      roof.add(quad, quad.map((p) => slopeUv(p, nn)), up);
    };
    let ridgeA0 = am, ridgeA1 = am;
    if (r.roofStyle === 'hip') {
      const inset = Math.min(half, (a1 - a0) / 2);
      ridgeA0 = a0 + inset; ridgeA1 = a1 - inset;
    } else { ridgeA0 = ra0; ridgeA1 = ra1; }
    const upC1: V3 = alongX ? [0, 1, 1] : [1, 1, 0], upC0: V3 = alongX ? [0, 1, -1] : [-1, 1, 0];
    face([P(ra0, eave, rc1), P(ra1, eave, rc1), P(ridgeA1, R, cm), P(ridgeA0, R, cm)], upC1);
    face([P(ra1, eave, rc0), P(ra0, eave, rc0), P(ridgeA0, R, cm), P(ridgeA1, R, cm)], upC0);
    if (r.roofStyle === 'hip') {
      face([P(ra0, eave, rc0), P(ra0, eave, rc1), P(ridgeA0, R, cm)], alongX ? [-1, 1, 0] : [0, 1, -1]);
      face([P(ra1, eave, rc1), P(ra1, eave, rc0), P(ridgeA1, R, cm)], alongX ? [1, 1, 0] : [0, 1, 1]);
    } else {
      // Gable ends: wall up to the ridge.
      for (const [a, s] of [[a0, alongX ? 'left' : 'back'], [a1, alongX ? 'right' : 'front']] as [number, BuildingSide][]) {
        const f = FACING[s], wu = (p: V3): [number, number] => [s === 'front' ? p[0] : s === 'back' ? -p[0] : s === 'left' ? p[2] : -p[2], p[1]];
        tri(walls, P(a, yt, c0), P(a, yt, c1), P(a, R, cm), wu, f);
      }
      // Barge boards along the sloped edges.
      for (const a of [ra0, ra1]) {
        const out2: V3 = alongX ? [a < am ? -1 : 1, 0, 0] : [0, 0, a < am ? -1 : 1];
        for (const c of [rc0, rc1]) {
          const e = P(a, eave, c), top = P(a, R, cm);
          trim.add([[e[0], e[1] - FASCIA, e[2]], [top[0], top[1] - FASCIA, top[2]], top, e], [[0, 0], [half + o, 0], [half + o, FASCIA], [0, FASCIA]], out2);
        }
      }
    }
    // Fascia boards under the eaves.
    for (const c of [rc0, rc1]) {
      const out2: V3 = alongX ? [0, 0, c < cm ? -1 : 1] : [c < cm ? -1 : 1, 0, 0];
      trim.add([P(ra0, eave - FASCIA, c), P(ra1, eave - FASCIA, c), P(ra1, eave, c), P(ra0, eave, c)], [[ra0, 0], [ra1, 0], [ra1, FASCIA], [ra0, FASCIA]], out2);
    }
    if (r.roofStyle === 'hip')
      for (const a of [ra0, ra1]) {
        const out2: V3 = alongX ? [a < am ? -1 : 1, 0, 0] : [0, 0, a < am ? -1 : 1];
        trim.add([P(a, eave - FASCIA, rc0), P(a, eave - FASCIA, rc1), P(a, eave, rc1), P(a, eave, rc0)], [[rc0, 0], [rc1, 0], [rc1, FASCIA], [rc0, FASCIA]], out2);
      }
  }

  // Doors and windows: flat pictures just in front of the walls.
  const decal = (q: QuadList, side: BuildingSide, at: number, w: number, ya: number, yb2: number) => {
    const f = FACING[side], c = at + 0.5, h = w / 2;
    let pts: [V3, V3, V3, V3];
    if (side === 'front') pts = [[x0 + c - h, ya, z1 + DECAL], [x0 + c + h, ya, z1 + DECAL], [x0 + c + h, yb2, z1 + DECAL], [x0 + c - h, yb2, z1 + DECAL]];
    else if (side === 'back') pts = [[x0 + c + h, ya, z0 - DECAL], [x0 + c - h, ya, z0 - DECAL], [x0 + c - h, yb2, z0 - DECAL], [x0 + c + h, yb2, z0 - DECAL]];
    else if (side === 'left') pts = [[x0 - DECAL, ya, z0 + c - h], [x0 - DECAL, ya, z0 + c + h], [x0 - DECAL, yb2, z0 + c + h], [x0 - DECAL, yb2, z0 + c - h]];
    else pts = [[x1 + DECAL, ya, z0 + c + h], [x1 + DECAL, ya, z0 + c - h], [x1 + DECAL, yb2, z0 + c - h], [x1 + DECAL, yb2, z0 + c + h]];
    q.add(pts, [[0, 0], [1, 0], [1, 1], [0, 1]], f);
  };
  // (Each picture faces out, its left edge on the viewer's left.)
  for (const door of r.doors) {
    const [cx, cz] = doorCell(r, door), y = floorAt(cx, cz), h = Math.min(1.8, r.height - 0.25);
    decal(list('door'), door.side, door.at, Math.min(0.92, h / 2), y, y + h);
  }
  const rows = r.height >= 3.5 ? [yf + 1.15, yf + r.height - 1.15] : [yf + Math.min(1.15, r.height - 0.7)];
  for (const side of ['front', 'back', 'left', 'right'] as BuildingSide[])
    for (const i of windowSlots(r, side)) for (const y of rows) decal(list('window'), side, i, 0.8, y - 0.4, y + 0.4);
}

function normalOf(a: V3, b: V3, c: V3): V3 {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

