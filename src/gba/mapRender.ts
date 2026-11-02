/**
 * Draws a GBA map the way tools/export.py builds it for the ROM, and works out
 * where you can walk. Keep the two in step: same layer order, same rules.
 */
import { drawQuarters, pieceAt, quarters } from './autotile';
import { CELL, ledgeCell, ledgeDir, type GbaMap, type GbaTile } from './types';

export type TileLookup = (id: string) => { def: GbaTile; img: HTMLCanvasElement } | null;

// Collision bits (match tools/export.py)
export const SOLID = 1, LEDGE_S = 4, LEDGE_E = 8, LEDGE_W = 16, WATER = 32, GRASS = 64;

function tileAt(m: GbaMap, v: number, look: TileLookup) {
  if (!v || v > m.tiles.length) return null;
  return look(m.tiles[v - 1]);
}

const inb = (m: GbaMap, x: number, y: number) => x >= 0 && y >= 0 && x < m.width && y < m.height;

/** Draw the whole map at scale `s` into `c` (which should be width*16*s by height*16*s). */
export function drawMap(c: CanvasRenderingContext2D, m: GbaMap, look: TileLookup, s: number, frame = 0, part: 'all' | 'under' | 'over' = 'all'): void {
  c.imageSmoothingEnabled = false;
  if (part === 'over') {
    // only what's drawn over the player (tree tops, walk-behind decorations)
    for (const d of overParts(m, look)) c.drawImage(d.img, d.cx * CELL, d.cy * CELL, CELL, CELL, d.x * CELL * s, d.y * CELL * s, CELL * s, CELL * s);
    return;
  }
  const put = (img: HTMLCanvasElement, cx: number, cy: number, x: number, y: number, offY = 0) =>
    c.drawImage(img, cx * CELL, offY + cy * CELL, CELL, CELL, x * CELL * s, y * CELL * s, CELL * s, CELL * s);
  const H = CELL / 2;
  const putQ = (img: HTMLCanvasElement, cx: number, cy: number, qx: number, qy: number, x: number, y: number, offY = 0) =>
    c.drawImage(img, cx * CELL + qx * H, offY + cy * CELL + qy * H, H, H, (x * CELL + qx * H) * s, (y * CELL + qy * H) * s, H * s, H * s);

  c.fillStyle = '#101810';
  c.fillRect(0, 0, m.width * CELL * s, m.height * CELL * s);

  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const t = tileAt(m, m.ground[y]?.[x] ?? 0, look);
    if (t) put(t.img, 0, 0, x, y);
  }

  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const v = m.terrain[y]?.[x] ?? 0;
    const t = tileAt(m, v, look);
    if (!t) continue;
    const qs = quarters((a, b) => inb(m, a, b) && m.terrain[b][a] === v, x, y);
    if (!qs) continue;
    const frames = t.def.type === 'water' ? Math.max(1, t.def.frames ?? 1) : 1;
    drawQuarters(qs, (cx, cy, qx, qy) => putQ(t.img, cx, cy, qx, qy, x, y, (frame % frames) * 3 * CELL));
  }

  const top = maxLevel(m);
  for (let k = 1; k <= top; k++) {
    const inside = (a: number, b: number) => inb(m, a, b) && !!m.cliff[b][a] && m.level[b][a] >= k;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const qs = quarters(inside, x, y);
      if (!qs || qs.every((q) => q === 'c')) continue;
      const t = tileAt(m, m.cliff[y][x], look);
      if (!t) continue;
      drawQuarters(qs, (cx, cy, qx, qy) => putQ(t.img, cx, cy, qx, qy, x, y));
    }
  }

  // objects: lower parts first, then everything drawn over the player
  const overs: (() => void)[] = [];
  for (const o of m.objects) {
    const t = tileAt(m, o.t, look);
    if (!t) continue;
    const ty = t.def.type;
    if (ty === 'object') {
      const w = t.def.w ?? 2, h = t.def.h ?? 2;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const draw = () => put(t.img, i, j, o.x + i, o.y + j);
        if (j === h - 1) draw(); else overs.push(draw);
      }
    } else if (ty === 'ledge') {
      const [lx, ly] = ledgeCell(o.p ?? 1);
      put(t.img, lx, ly, o.x, o.y);
    } else if (ty === 'decor' && t.def.pass === '*') {
      overs.push(() => put(t.img, 0, 0, o.x, o.y));
    } else {
      put(t.img, 0, 0, o.x, o.y);
    }
  }
  if (part === 'all') for (const d of overs) d();
}

function overParts(m: GbaMap, look: TileLookup): { img: HTMLCanvasElement; cx: number; cy: number; x: number; y: number }[] {
  const out: { img: HTMLCanvasElement; cx: number; cy: number; x: number; y: number }[] = [];
  for (const o of m.objects) {
    const t = tileAt(m, o.t, look);
    if (!t) continue;
    if (t.def.type === 'object') {
      const w = t.def.w ?? 2, h = t.def.h ?? 2;
      for (let j = 0; j < h - 1; j++) for (let i = 0; i < w; i++) out.push({ img: t.img, cx: i, cy: j, x: o.x + i, y: o.y + j });
    } else if (t.def.type === 'decor' && t.def.pass === '*') out.push({ img: t.img, cx: 0, cy: 0, x: o.x, y: o.y });
  }
  return out;
}

/** The event standing on a cell, if any. */
export function eventAt(m: GbaMap, x: number, y: number) {
  return m.events?.find((e) => e.x === x && e.y === y);
}

export function maxLevel(m: GbaMap): number {
  let top = 0;
  for (const row of m.level) for (const v of row) if (v > top) top = v;
  return top;
}

/** Collision for every cell (bits above), exactly as the ROM gets it. */
export function collision(m: GbaMap, look: TileLookup): Uint8Array {
  const out = new Uint8Array(m.width * m.height);
  const at = (x: number, y: number) => y * m.width + x;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const t = tileAt(m, m.terrain[y][x], look);
    if (t?.def.type === 'water') out[at(x, y)] |= SOLID | WATER;
  }
  const top = maxLevel(m);
  for (let k = 1; k <= top; k++) {
    const inside = (a: number, b: number) => inb(m, a, b) && !!m.cliff[b][a] && m.level[b][a] >= k;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const p = pieceAt(inside, x, y);
      if (p && p !== 'c') out[at(x, y)] |= SOLID;
    }
  }
  for (const o of m.objects) {
    const t = tileAt(m, o.t, look);
    if (!t) continue;
    const ty = t.def.type;
    if (ty === 'object') {
      const w = t.def.w ?? 2, h = t.def.h ?? 2;
      for (let i = 0; i < w; i++) if (inb(m, o.x + i, o.y + h - 1)) out[at(o.x + i, o.y + h - 1)] |= SOLID;
      continue;
    }
    if (!inb(m, o.x, o.y)) continue;
    const i = at(o.x, o.y);
    if (ty === 'ledge') { const p = o.p ?? 1; const d = ledgeDir(p); out[i] |= SOLID | (d === 'S' ? LEDGE_S : d === 'E' ? LEDGE_E : LEDGE_W); }
    else if (ty === 'tallgrass') out[i] |= GRASS;
    else if (ty === 'stairs' || ty === 'ladder') out[i] &= ~SOLID;
    else if (ty === 'decor' && (t.def.pass ?? 'X') === 'X') out[i] |= SOLID;
  }
  m.pass.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!inb(m, x, y)) return;
    if (ch === 'O') out[at(x, y)] &= ~SOLID;
    if (ch === 'X') out[at(x, y)] |= SOLID;
  }));
  return out;
}

/** The cells an object covers (multi-tile objects are anchored at their top-left). */
export function footprint(m: GbaMap, t: number, x: number, y: number, look: TileLookup): [number, number][] {
  const def = tileAt(m, t, look)?.def;
  const w = def?.type === 'object' ? def.w ?? 2 : 1, h = def?.type === 'object' ? def.h ?? 2 : 1;
  const out: [number, number][] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
}
