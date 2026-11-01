/**
 * Fishing data shared by the game and the editor: the painted fishing spots, what each spot gives, and the rolls
 * (how long until a bite, what bites). No three.js, so it can be tested on its own.
 */
import type { FishCatch, FishZone, ItemDef, MapData } from './types';

/** Fishing spots per cell: the zone number, or null. Rows are space-separated: "." for none. */
export function parseFishing(rows: string[] | undefined, w: number, h: number): (number | null)[] {
  const out: (number | null)[] = new Array(w * h).fill(null);
  if (!rows) return out;
  for (let z = 0; z < h; z++) {
    const toks = (rows[z] ?? '').trim().split(/\s+/);
    for (let x = 0; x < w; x++) { const t = toks[x]; if (t && /^\d+$/.test(t)) out[z * w + x] = parseInt(t, 10); }
  }
  return out;
}

/** Back to rows (null when nothing is painted). */
export function formatFishing(grid: (number | null)[], w: number, h: number): string[] | null {
  if (!grid.some((c) => c !== null)) return null;
  const rows: string[] = [];
  for (let z = 0; z < h; z++) {
    const t: string[] = [];
    for (let x = 0; x < w; x++) { const c = grid[z * w + x]; t.push(c === null ? '.' : String(c)); }
    rows.push(t.join(' '));
  }
  return rows;
}

/** A map's fishing spots (the zone painted on each cell). */
export const fishingGrid = (m: Pick<MapData, 'fishing' | 'width' | 'height'>): (number | null)[] => parseFishing(m.fishing, m.width, m.height);

/** Ids of the built-in fish and catches (added to a database once, with the rod). */
export const FISH = { rod: 'fishing_rod', minnow: 'minnow', trout: 'trout', eel: 'night_eel', koi: 'golden_koi', boot: 'old_boot' } as const;

/** A sensible first catch table for a new spot: from the database's fish when it has them. */
export function defaultZone(items: ItemDef[], name = 'Pond'): FishZone {
  const has = (id: string) => items.some((d) => d.id === id);
  const fish: FishCatch[] = [];
  if (has(FISH.minnow)) fish.push({ item: FISH.minnow, chance: 50 });
  if (has(FISH.trout)) fish.push({ item: FISH.trout, chance: 28, time: 'day' });
  if (has(FISH.eel)) fish.push({ item: FISH.eel, chance: 20, time: 'night' });
  if (has(FISH.koi)) fish.push({ item: FISH.koi, chance: 3, rare: true });
  if (has(FISH.boot)) fish.push({ item: FISH.boot, chance: 8 });
  if (!fish.length) { const f = items.find((d) => d.fish); if (f) fish.push({ item: f.id, chance: 100 }); }
  return { name, color: '#7fd0ff', fish };
}

/** Seconds until a bite: 2 … 7, sooner with a better rod (power 0 … 100). */
export function biteDelay(power: number, roll: number): number {
  const p = Math.max(0, Math.min(100, power)) / 100;
  return (2 + roll * 5) * (1 - p * 0.45);
}

/** How long the hero has to react to a bite (seconds): a little longer with a better rod. */
export const biteWindow = (power: number): number => 0.75 + Math.max(0, Math.min(100, power)) / 100 * 0.35;

/**
 * What bites: a weighted pick from the spot's table, leaving out fish of the wrong time of day. Rare catches count
 * for more with a better rod. Null when nothing in the table can bite now.
 */
export function pickCatch(zone: FishZone | undefined, night: boolean, power: number, roll: number): FishCatch | null {
  const p = Math.max(0, Math.min(100, power)) / 100;
  const ok = (zone?.fish ?? []).filter((f) => f.chance > 0 && (!f.time || (f.time === 'night') === night));
  const w = (f: FishCatch) => f.chance * (f.rare ? 1 + p * 2 : 1);
  const total = ok.reduce((a, f) => a + w(f), 0);
  if (total <= 0) return null;
  let r = roll * total;
  for (const f of ok) { r -= w(f); if (r < 0) return f; }
  return ok[ok.length - 1];
}

/** This catch's length (cm): its usual size, 70 % … 135 %. */
export const catchSize = (d: ItemDef | undefined, roll: number): number => (d?.fish ? Math.round(d.fish.size * (0.7 + roll * 0.65)) : 0);
