/**
 * Encounter zones: letters painted on a map's cells (A–Z, "." for none), stored as rows like the terrain, and which
 * troop a battle in a zone brings (by weight, and only when its conditions hold: day or night, real-world days of the
 * week, a switch). No three.js, so it can be tested on its own.
 */
import type { EncounterZone, MapData, ZoneTroop } from './types';

export const ZONE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** A colour for each zone letter (the same in the editor every time). */
export function zoneColor(letter: string): string {
  const i = Math.max(0, ZONE_LETTERS.indexOf(letter));
  return `hsl(${(i * 47) % 360}, 75%, 58%)`;
}

export function parseZones(rows: string[] | undefined, w: number, h: number): string[] {
  const out: string[] = new Array(w * h).fill('.');
  if (!rows) return out;
  for (let z = 0; z < h; z++) {
    const row = rows[z] ?? '';
    for (let x = 0; x < w; x++) { const c = row[x]; if (c && c >= 'A' && c <= 'Z') out[z * w + x] = c; }
  }
  return out;
}

/** Rows for saving, or null when nothing is painted. */
export function formatZones(grid: string[], w: number, h: number): string[] | null {
  if (grid.every((c) => c === '.')) return null;
  const rows: string[] = [];
  for (let z = 0; z < h; z++) rows.push(grid.slice(z * w, z * w + w).join(''));
  return rows;
}

/** The zone letter under a cell, or null. */
export function zoneAt(m: MapData, x: number, z: number): string | null {
  const c = m.zoneGrid?.[Math.floor(z)]?.[Math.floor(x)];
  return c && c >= 'A' && c <= 'Z' ? c : null;
}

export interface ZoneContext { night: boolean; weekday: number; switchOn: (id: string) => boolean }

/** Can this troop come now? */
export function troopAllowed(t: ZoneTroop, c: ZoneContext): boolean {
  if (t.time === 'day' && c.night) return false;
  if (t.time === 'night' && !c.night) return false;
  if (t.days?.length && !t.days.includes(c.weekday)) return false;
  if (t.switch && !c.switchOn(t.switch)) return false;
  return true;
}

/** Pick a troop for a battle in this zone (by weight, among those allowed now), or null. */
export function pickTroop(zone: EncounterZone, c: ZoneContext, rng: () => number = Math.random): ZoneTroop | null {
  const ok = zone.troops.filter((t) => (t.weight ?? 1) > 0 && troopAllowed(t, c));
  const total = ok.reduce((s, t) => s + (t.weight ?? 1), 0);
  if (!ok.length || total <= 0) return null;
  let r = rng() * total;
  for (const t of ok) { r -= t.weight ?? 1; if (r <= 0) return t; }
  return ok[ok.length - 1];
}

/** Battle map markers in the editor: the party's and the enemies'. */
export const MARKER_COLORS = { party: '#6fb6ff', enemy: '#ff7a6b' } as const;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
