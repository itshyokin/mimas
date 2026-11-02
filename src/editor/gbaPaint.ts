/**
 * Mimas: painting a map's GBA layers (Ground, Paths & water, Cliffs, Objects, Passability) in the map editor.
 * The same rules GBA Studio's map painter had: big objects anchored at the trunk, ledge pieces, cliff tiers.
 */
import { footprint } from '../gba/mapRender';
import { gbaView } from '../gba/layers';
import type { GbaPlacement, GbaTile, TileType } from '../gba/types';
import type { MapData } from '../world/types';
import { tileLookup } from './gbaShared';

export type GbaLayerMode = 'gground' | 'gpath' | 'gcliff' | 'gobjects' | 'gpass';
export const GBA_MODES: GbaLayerMode[] = ['gground', 'gpath', 'gcliff', 'gobjects', 'gpass'];
export const isGbaMode = (m: string): m is GbaLayerMode => (GBA_MODES as string[]).includes(m);

/** Which GBA Studio tile types each layer paints. */
export const LAYER_TYPES: Record<Exclude<GbaLayerMode, 'gpass'>, TileType[]> = {
  gground: ['ground'],
  gpath: ['path', 'water'],
  gcliff: ['cliff'],
  gobjects: ['object', 'decor', 'ledge', 'stairs', 'ladder', 'tallgrass', 'door'],
};

export interface GbaBrush {
  layer: GbaLayerMode;
  tile?: GbaTile;
  tier: number;
  ledgePiece: number;
  pass: 'O' | 'X' | '.';
}

/** The map's tile-list index (+1) for a tile id, adding it if needed. */
function ref(m: MapData, id: string): number {
  const g = m.gba!;
  let i = g.tiles.indexOf(id);
  if (i < 0) { g.tiles.push(id); i = g.tiles.length - 1; }
  return i + 1;
}

/** How many cells a stamp covers (big objects), for rectangles. */
export function stampSize(b: GbaBrush): [number, number] {
  return b.layer === 'gobjects' && b.tile?.type === 'object' ? [b.tile.w ?? 2, b.tile.h ?? 2] : [1, 1];
}

/** Paint (or erase) one cell. True if anything changed. `fromRect`: big objects are anchored at their top-left. */
export function applyGba(m: MapData, b: GbaBrush, x: number, y: number, erase: boolean, fromRect = false): boolean {
  const g = m.gba;
  if (!g || x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
  const before = JSON.stringify([g.ground[y][x], g.terrain[y][x], g.cliff[y][x], g.level[y][x], g.pass[y][x], g.objects.length]);
  const t = b.tile;
  switch (b.layer) {
    case 'gground': g.ground[y][x] = erase || !t ? 0 : ref(m, t.id); break;
    case 'gpath': g.terrain[y][x] = erase || !t ? 0 : ref(m, t.id); break;
    case 'gcliff':
      if (erase) {
        if (g.level[y][x] >= b.tier) g.level[y][x] = b.tier - 1;
        if (!g.level[y][x]) g.cliff[y][x] = 0;
      } else if (t) {
        g.cliff[y][x] = ref(m, t.id);
        g.level[y][x] = b.tier;
      }
      break;
    case 'gobjects': {
      const view = gbaView(m);
      const covers = (o: GbaPlacement, cx: number, cy: number) => footprint(view, o.t, o.x, o.y, tileLookup).some(([fx, fy]) => fx === cx && fy === cy);
      if (erase || !t) {
        const n = g.objects.length;
        g.objects = g.objects.filter((o) => !covers(o, x, y));
        return g.objects.length !== n;
      }
      const idx = ref(m, t.id);
      const [w, hh] = t.type === 'object' ? [t.w ?? 2, t.h ?? 2] : [1, 1];
      // Click where the trunk / base goes: big objects grow up and to the right from there.
      const ax = x, ay = fromRect ? y : y - (hh - 1);
      if (ax + w > m.width || ay < 0 || ay + hh > m.height) return false;
      const cells = footprint(gbaView(m), idx, ax, ay, tileLookup);
      const same = g.objects.find((o) => o.t === idx && o.x === ax && o.y === ay && (t.type !== 'ledge' || o.p === b.ledgePiece));
      if (same) return false;
      g.objects = g.objects.filter((o) => !cells.some(([cx, cy]) => covers(o, cx, cy)));
      const o: GbaPlacement = { t: idx, x: ax, y: ay };
      if (t.type === 'ledge') o.p = b.ledgePiece;
      g.objects.push(o);
      return true;
    }
    case 'gpass': {
      const row = [...g.pass[y]];
      row[x] = erase ? '.' : b.pass;
      g.pass[y] = row.join('');
      break;
    }
  }
  return before !== JSON.stringify([g.ground[y][x], g.terrain[y][x], g.cliff[y][x], g.level[y][x], g.pass[y][x], g.objects.length]);
}

/** Flood fill the connected area with the same value on this layer. True if anything changed. */
export function floodGba(m: MapData, b: GbaBrush, sx: number, sy: number): boolean {
  const g = m.gba;
  if (!g) return false;
  const grid = b.layer === 'gground' ? g.ground : b.layer === 'gpath' ? g.terrain : b.layer === 'gcliff' ? g.level : null;
  if (!grid) return applyGba(m, b, sx, sy, false);
  const target = grid[sy]?.[sx];
  if (target === undefined) return false;
  const seen = new Uint8Array(m.width * m.height);
  const stack: [number, number][] = [[sx, sy]];
  let any = false, count = 0;
  while (stack.length && count < 20000) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= m.width || y >= m.height || seen[y * m.width + x] || grid[y][x] !== target) continue;
    seen[y * m.width + x] = 1;
    count++;
    if (applyGba(m, b, x, y, false)) any = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return any;
}
