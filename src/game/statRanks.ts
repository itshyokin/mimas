/**
 * Stat growth ranks: each hero's Strength, Dexterity, Defence, Magic and Magic Defence grow every level by their rank:
 * A +4, B +3, C +2, D +1, F +0. Ranks are set per hero in the Database; items (a Potion of Defense), worn gear and
 * events can change them. Worn gear lifts a rank while it's worn; a potion or an event changes it for good.
 */
import { ATTRS, type Attr, type Attrs } from './attributes';

export type Rank = 'A' | 'B' | 'C' | 'D' | 'F';
export const RANKS: Rank[] = ['A', 'B', 'C', 'D', 'F'];
export const RANK_GAIN: Record<Rank, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
export const RANK_COLORS: Record<Rank, string> = { A: '#5fcf5a', B: '#f2d24a', C: '#f29a3a', D: '#f07aa8', F: '#e5484d' };
export const DEFAULT_RANK: Rank = 'C';

/** The better of two ranks. */
export const bestRank = (a: Rank, b: Rank): Rank => (RANKS.indexOf(a) <= RANKS.indexOf(b) ? a : b);

/** A hero's rank in each stat: the Database's, changed for good by potions and events, lifted by worn gear. */
export function ranksOf(base: Partial<Record<Attr, Rank>> | undefined, changed: Partial<Record<Attr, Rank>> | undefined, gear: ({ statRank?: { stat: Attr; rank: Rank } } | undefined)[] = []): Record<Attr, Rank> {
  const out = {} as Record<Attr, Rank>;
  for (const k of ATTRS) {
    let r = changed?.[k] ?? base?.[k] ?? DEFAULT_RANK;
    for (const g of gear) if (g?.statRank?.stat === k) r = bestRank(r, g.statRank.rank);
    out[k] = r;
  }
  return out;
}

/** What one level adds to each stat. */
export function levelGains(ranks: Record<Attr, Rank>): Attrs {
  const a = {} as Attrs;
  for (const k of ATTRS) a[k] = RANK_GAIN[ranks[k]];
  return a;
}

/** A rank as a coloured pill (HTML). */
export const rankPill = (r: Rank): string => `<span class="rank-pill" style="--rank:${RANK_COLORS[r]}" title="Rank ${r}: +${RANK_GAIN[r]} a level">${r}</span>`;
