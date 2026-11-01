/**
 * Resting and camping (Update 106). Rest for some hours at a rest point (a campfire): the party's health and magic
 * refill 20% an hour; even one hour warms and dries them; 5 hours or more is a full restore that cures every
 * ailment. Then camping supplies: food, potions and drinks have a Camp value; 25 points make the party Rested
 * (+1 to every stat, +10% EXP), 50 Well Rested (+3, +25% EXP, but it doesn't last as long). Under 25 nothing is
 * spent. Good states last game hours (Database → Weather & temperature → Resting and camping). No three.js.
 */
import type { BodyConfig } from '../world/types';

export type GoodKind = 'rested' | 'wellRested';
export const GOOD_KINDS: GoodKind[] = ['rested', 'wellRested'];

/** One hero's good state: which, and the game hour (on GameState.clock) it ends. */
export interface GoodState { kind: GoodKind; until: number }

export const GOOD_INFO: Record<GoodKind, { name: string; stat: number; exp: number; color: string; ink: string; tag: string }> = {
  rested: { name: 'Rested', stat: 1, exp: 10, color: '#ffd36a', ink: '#3a2600', tag: 'RST' },
  wellRested: { name: 'Well Rested', stat: 3, exp: 25, color: '#ffb83a', ink: '#3a1e00', tag: 'WRS' },
};

/** Camp points needed: Rested, Well Rested (the most that counts). */
export const CAMP_RESTED = 25, CAMP_WELL = 50;
/** Hours of rest for a full restore and cure. */
export const FULL_REST_HOURS = 5;

/** How long each good state lasts (game hours), from the Database. */
export function goodHours(c: BodyConfig | undefined, kind: GoodKind): number {
  return Math.max(0.25, kind === 'rested' ? c?.restedHours ?? 2 : c?.wellRestedHours ?? 1.5);
}

/** The share of max health and magic an hour's rest gives back (20% an hour; 5+ hours: all). */
export const restShare = (hours: number): number => (hours >= FULL_REST_HOURS ? 1 : Math.max(0, Math.min(1, hours * 0.2)));

/** What the supplies make: null under 25. */
export const goodFromPoints = (points: number): GoodKind | null => (points >= CAMP_WELL ? 'wellRested' : points >= CAMP_RESTED ? 'rested' : null);

/**
 * A new good state on someone who may have one: a new one replaces the old, except Rested never takes Well Rested's
 * place while it lasts (then the timer is left as it was). The same one again restarts the timer.
 */
export function nextGood(cur: GoodState | undefined, kind: GoodKind, now: number, hours: number): GoodState | undefined {
  const live = cur && cur.until > now ? cur : undefined;
  if (live?.kind === 'wellRested' && kind === 'rested') return live;
  return { kind, until: now + Math.max(0, hours) };
}

/** A camping supply in the bag: its Camp value and how many there are. */
export interface Supply { id: string; camp: number; count: number; price: number }

/**
 * Fill toward `target` points with the cheapest mix: the least valuable items first (by price per point, then the
 * smallest value), never going far past the target. Returns how many of each to use.
 */
export function fillSupplies(list: Supply[], target: number, already: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = { ...already };
  let have = list.reduce((s, x) => s + (out[x.id] ?? 0) * x.camp, 0);
  const order = [...list].filter((x) => x.camp > 0).sort((a, b) => a.price / a.camp - b.price / b.camp || a.camp - b.camp);
  for (const x of order) {
    while (have < target && (out[x.id] ?? 0) < x.count) {
      // Skip a big item that would waste a lot when a smaller one still fits better later.
      out[x.id] = (out[x.id] ?? 0) + 1;
      have += x.camp;
    }
    if (have >= target) break;
  }
  // Too much: give back whatever isn't needed (the most valuable first).
  for (const x of [...order].reverse()) while ((out[x.id] ?? 0) > (already[x.id] ?? 0) && have - x.camp >= target) { out[x.id]--; have -= x.camp; }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/** How many points a pick of supplies makes. */
export const supplyPoints = (list: Supply[], pick: Record<string, number>): number => list.reduce((s, x) => s + (pick[x.id] ?? 0) * x.camp, 0);

/** "1 h 20 m" / "45 m" from game hours. */
export function hoursLabel(h: number): string {
  const m = Math.max(0, Math.round(h * 60)), hh = Math.floor(m / 60), mm = m % 60;
  return hh ? `${hh} h${mm ? ` ${mm} m` : ''}` : `${mm} m`;
}
