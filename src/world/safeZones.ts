/**
 * Safe zones (painted on the Spawns layer): places that keep the elements out (no cold, heat or rain: everyone is
 * Comfortable), that monsters never come into, and with no random battles. Some of their tiles are spots for the
 * party to rest at while the player is in the zone: a seat, somewhere to lie down, a place to practise magic, a
 * training dummy to swing at. One character per cell in `MapData.safeGrid`: "." none, "s" safe ground, "S" seat,
 * "L" lie down, "M" practise magic, "T" training dummy (spots are safe ground too). No three.js.
 */
import type { MapData, RestActivity } from './types';

/** The marks, in the order the editor offers them. */
export const SAFE_MARKS: { mark: string; name: string; note: string; act?: RestActivity }[] = [
  { mark: 's', name: 'Safe ground', note: 'No cold, heat or rain; monsters stay out; no random battles.' },
  { mark: 'S', name: 'Seat', note: 'A party member sits here while the player is in the zone.', act: 'sit' },
  { mark: 'L', name: 'Lie down', note: 'A party member lies down here.', act: 'lie' },
  { mark: 'M', name: 'Practise magic', note: 'A party member practises spells here now and then.', act: 'magic' },
  { mark: 'T', name: 'Training dummy', note: 'A party member swings at a dummy (put a dummy prop just north of it).', act: 'train' },
];
const ACT_OF: Record<string, RestActivity> = { S: 'sit', L: 'lie', M: 'magic', T: 'train' };
export const isSafeMark = (c: string | undefined): boolean => !!c && 'sSLMT'.includes(c) && c.length === 1;

export function parseSafe(rows: string[] | undefined, w: number, h: number): string[] {
  const out: string[] = new Array(w * h).fill('.');
  if (!rows) return out;
  for (let z = 0; z < h; z++) {
    const row = rows[z] ?? '';
    for (let x = 0; x < w; x++) { const c = row[x]; if (isSafeMark(c)) out[z * w + x] = c; }
  }
  return out;
}

/** Rows for saving, or null when nothing is painted. */
export function formatSafe(grid: string[], w: number, h: number): string[] | null {
  if (grid.every((c) => c === '.')) return null;
  const rows: string[] = [];
  for (let z = 0; z < h; z++) rows.push(grid.slice(z * w, z * w + w).join(''));
  return rows;
}

/** Is this cell safe ground (any mark)? */
export function safeAt(m: Pick<MapData, 'safeGrid'>, x: number, z: number): boolean {
  return isSafeMark(m.safeGrid?.[Math.floor(z)]?.[Math.floor(x)]);
}

/** A rest spot in a zone: its cell and what's done there. */
export interface RestSpot { x: number; z: number; act: RestActivity }

/** The rest spots of the safe zone around a cell (the safe tiles joined to it), or [] when the cell isn't safe. */
export function zoneSpots(m: Pick<MapData, 'safeGrid' | 'width' | 'height'>, x: number, z: number): RestSpot[] {
  if (!safeAt(m, x, z)) return [];
  const w = m.width, h = m.height, seen = new Set<number>(), out: RestSpot[] = [];
  const stack = [[Math.floor(x), Math.floor(z)]];
  while (stack.length && seen.size < 4000) {
    const [cx, cz] = stack.pop()!, k = cz * w + cx;
    if (cx < 0 || cz < 0 || cx >= w || cz >= h || seen.has(k) || !safeAt(m, cx, cz)) continue;
    seen.add(k);
    const c = m.safeGrid![cz][cx];
    if (ACT_OF[c]) out.push({ x: cx, z: cz, act: ACT_OF[c] });
    stack.push([cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]);
  }
  // The same order wherever in the zone the fill starts (so the zone's key, and who sits where, stay put).
  return out.sort((a, b) => a.z - b.z || a.x - b.x);
}

/** The activities, with their names (Database → Heroes → Rest preferences). */
export const REST_ACTIVITIES: [RestActivity, string][] = [['sit', 'Sitting'], ['lie', 'Lying down'], ['magic', 'Practising magic'], ['train', 'Training']];

/**
 * Share a zone's spots out among the party: each takes the free spot they like best (Rest preferences, 1–10, 5 when
 * unset, with a little chance each time), the keenest first; ties go to whoever is higher in the party order.
 * Returns the spot per member index.
 */
export function shareSpots(spots: RestSpot[], prefs: Partial<Record<RestActivity, number>>[], rand: () => number = Math.random): (RestSpot | null)[] {
  // A little chance each time (so a 10 usually wins, a 1 now and then gets its turn); exact ties: party order.
  const jitter = prefs.map(() => ({ sit: rand() * 2.5, lie: rand() * 2.5, magic: rand() * 2.5, train: rand() * 2.5 }) as Record<RestActivity, number>);
  const out: (RestSpot | null)[] = prefs.map(() => null), free = [...spots];
  const left = prefs.map((_, i) => i);
  while (left.length && free.length) {
    let best: { who: number; spot: number; score: number } | null = null;
    for (const who of left) for (let k = 0; k < free.length; k++) {
      const score = (prefs[who][free[k].act] ?? 5) + jitter[who][free[k].act];
      if (!best || score > best.score || (score === best.score && who < best.who)) best = { who, spot: k, score };
    }
    if (!best) break;
    out[best.who] = free[best.spot];
    free.splice(best.spot, 1);
    left.splice(left.indexOf(best.who), 1);
  }
  return out;
}
