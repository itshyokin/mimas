/** Scenery beyond the map edge, chosen per side (top, bottom, left, right). */
import type { BorderKind, MapBorder } from './types';

export type Side = 'n' | 's' | 'w' | 'e';
export const BORDER_KINDS: [BorderKind, string][] = [
  ['grass', 'Open grass'], ['forest', 'Forest'], ['meadow', 'Meadow (bushes, flowers)'], ['plains', 'Plains (open, a few tufts)'],
  ['rocks', 'Rocky cliffs'], ['rocky', 'Rocky ground (boulders)'], ['desert', 'Desert (sand, cacti)'], ['snow', 'Snowfield'], ['snowforest', 'Snowy forest'], ['water', 'Water'], ['none', 'Nothing (darkness)'], ['seamless', 'Seamless (the next map: World layout)'],
];

/** The kind on each side. Old maps ({ kind: 'forest' }) use it everywhere; no border at all is open grass. */
export function borderSides(b: MapBorder | undefined): Record<Side, BorderKind> {
  const all = b?.kind ?? 'grass';
  return { n: b?.n ?? all, s: b?.s ?? all, w: b?.w ?? all, e: b?.e ?? all };
}

/** Which side's scenery a cell outside the map belongs to (top and bottom strips include the corners). */
export function sideOf(x: number, z: number, w: number, h: number): Side {
  return z < 0 ? 'n' : z >= h ? 's' : x < 0 ? 'w' : 'e';
}

/** The ground beyond the edge for each kind (the strip's flat surface). */
export type BorderGround = 'grass' | 'sand' | 'snow' | 'rock';
export const borderGround = (k: BorderKind): BorderGround =>
  k === 'desert' ? 'sand' : k === 'snow' || k === 'snowforest' ? 'snow' : k === 'rocky' ? 'rock' : 'grass';

/** Height of rocky cliffs: lower on the bottom side so they don't hide the map from the camera. */
export const cliffHeight = (side: Side): number => (side === 's' ? 0.5 : 1.5);

/** A road reaching the map edge: tiles `from`–`to` (along the edge) of tile `key`, continuing out on `side`. */
export interface EdgeRoad { side: Side; key: string; from: number; to: number }

/** Roads carry on across every kind of border except darkness (through a gap in cliffs, on a causeway over water). */
export const roadContinues = (k: BorderKind): boolean => k !== 'none' && k !== 'seamless';

/**
 * Every run of road tiles along the map's edges, per side (consecutive tiles of the same key form one
 * run). `terrain(x, z)` and `isRoad(key)` come from the map and the tile catalog.
 */
export function edgeRoads(w: number, h: number, terrain: (x: number, z: number) => string, isRoad: (k: string) => boolean,
  sides: Record<Side, BorderKind>): EdgeRoad[] {
  const out: EdgeRoad[] = [];
  const scan = (side: Side, n: number, at: (i: number) => string) => {
    if (!roadContinues(sides[side])) return;
    let i = 0;
    while (i < n) {
      const k = at(i);
      if (!isRoad(k)) { i++; continue; }
      let j = i;
      while (j + 1 < n && at(j + 1) === k) j++;
      out.push({ side, key: k, from: i, to: j });
      i = j + 1;
    }
  };
  scan('n', w, (x) => terrain(x, 0));
  scan('s', w, (x) => terrain(x, h - 1));
  scan('w', h, (z) => terrain(0, z));
  scan('e', h, (z) => terrain(w - 1, z));
  return out;
}

/** Is the out-of-map cell (x, z) on a continuing road, or within `margin` tiles of one? (Keeps trees off roads.) */
export function onEdgeRoad(roads: EdgeRoad[], x: number, z: number, w: number, h: number, margin: number): boolean {
  return roads.some((r) => {
    if (r.side === 'n' && z < 0) return x >= r.from - margin && x <= r.to + margin;
    if (r.side === 's' && z >= h) return x >= r.from - margin && x <= r.to + margin;
    if (r.side === 'w' && x < 0) return z >= r.from - margin && z <= r.to + margin;
    if (r.side === 'e' && x >= w) return z >= r.from - margin && z <= r.to + margin;
    return false;
  });
}

/** Water reaching the map edge: tiles `from`–`to` along the edge, continuing out on `side` as a channel. */
export interface EdgeWater { side: Side; from: number; to: number; surface: number; bed: number; kind: 'shallow' | 'swim' | 'deep'; style: number }

/** Water continues past every kind of border except darkness and open water (which is already water). */
export const waterContinues = (k: BorderKind): boolean => k !== 'none' && k !== 'water' && k !== 'seamless';

/**
 * Every run of water along the map's edges, per side: consecutive edge cells with water of the same level, kind and
 * style form one run. Like roads, it carries on straight out (a stream leaving the map runs on into the woods).
 */
export function edgeWaters(w: number, h: number, water: (x: number, z: number) => { surface: number; kind: 'shallow' | 'swim' | 'deep'; style: number } | null,
  ground: (x: number, z: number) => number, sides: Record<Side, BorderKind>): EdgeWater[] {
  const out: EdgeWater[] = [];
  const scan = (side: Side, n: number, at: (i: number) => [number, number]) => {
    if (!waterContinues(sides[side])) return;
    const key = (i: number) => { const c = water(...at(i)); return c ? `${c.surface}|${c.kind}|${c.style}` : ''; };
    let i = 0;
    while (i < n) {
      const k = key(i);
      if (!k) { i++; continue; }
      let j = i, bed = ground(...at(i));
      while (j + 1 < n && key(j + 1) === k) { j++; bed = Math.min(bed, ground(...at(j))); }
      const c = water(...at(i))!;
      out.push({ side, from: i, to: j, surface: c.surface, bed: Math.min(bed, c.surface - 0.25), kind: c.kind, style: c.style });
      i = j + 1;
    }
  };
  scan('n', w, (x) => [x, 0]);
  scan('s', w, (x) => [x, h - 1]);
  scan('w', h, (z) => [0, z]);
  scan('e', h, (z) => [w - 1, z]);
  return out;
}
