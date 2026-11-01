/**
 * Elements: water → fire → nature → earth → shock → water (each beats the next), light and dark each strong against
 * the other, and non-elemental plain against everything. A defender can have up to two elements (their effects
 * multiply, kept between ×0.25 and ×3), and be immune to or absorb some. No three.js, so it can be tested on its own.
 */
import type { Element } from '../world/types';

export const ELEMENT_LIST: Element[] = ['neutral', 'water', 'fire', 'nature', 'earth', 'shock', 'light', 'dark'];
/** The elements a creature can be (non-elemental isn't one: it's having none). */
export const TYPED_ELEMENTS: Element[] = ELEMENT_LIST.filter((e) => e !== 'neutral');

export const ELEMENT_NAMES: Record<Element, string> = {
  neutral: 'Normal', water: 'Water', fire: 'Fire', nature: 'Nature', earth: 'Earth', shock: 'Shock', light: 'Light', dark: 'Dark',
};
export const ELEMENT_COLORS: Record<Element, string> = {
  neutral: '#e9e2d2', water: '#5ab4ff', fire: '#ff7a3a', nature: '#6fd05a', earth: '#c8964e', shock: '#ffe04a', light: '#fff4c2', dark: '#a77cff',
};

/** Who each element beats (×2). */
const BEATS: Partial<Record<Element, Element[]>> = {
  water: ['fire'], fire: ['nature'], nature: ['earth'], earth: ['shock'], shock: ['water'],
  light: ['dark'], dark: ['light'],
};

export const STRONG = 2, WEAK = 0.5, MULT_MIN = 0.25, MULT_MAX = 3;

/** One attack element against one defending element. */
export function versus(attack: Element, defend: Element): number {
  if (attack === 'neutral' || defend === 'neutral') return 1;
  if (BEATS[attack]?.includes(defend)) return STRONG;
  // Same element shrugs it off; the element it loses to resists it (light and dark only ever win against each other).
  if (attack === defend) return WEAK;
  if (BEATS[defend]?.includes(attack) && attack !== 'light' && attack !== 'dark') return WEAK;
  return 1;
}

/** What an element is strong against (×2) and weak against (×0.5), for menus. */
export function matchups(e: Element): { strong: Element[]; weak: Element[] } {
  const all = TYPED_ELEMENTS;
  return { strong: all.filter((d) => versus(e, d) > 1), weak: all.filter((d) => versus(e, d) < 1) };
}

/** A defender's elements and specials. */
/**
 * `halve`: elements whose damage is halved (worn gear that wards it off). `weak`: how hard each of their elements'
 * weaknesses hit (a hero's element stones: a Fragment's are milder, two Shards' harsher), instead of ×2.
 */
export interface ElementalDefence { elements?: Element[]; immune?: Element[]; absorb?: Element[]; halve?: Element[]; weak?: Partial<Record<Element, number>> }

export type ElementResult =
  | { kind: 'absorb' }
  | { kind: 'immune' }
  | { kind: 'hit'; mult: number; label: 'Weak!' | 'Resist' | null };

/** What an attack of `attack` does to a defender: absorbed (heals), immune (nothing), or a multiplier. */
export function elementResult(attack: Element | undefined, d: ElementalDefence | undefined): ElementResult {
  const a = attack ?? 'neutral';
  if (d?.absorb?.includes(a)) return { kind: 'absorb' };
  if (d?.immune?.includes(a)) return { kind: 'immune' };
  let mult = 1;
  for (const e of (d?.elements ?? []).slice(0, 2)) { const v = versus(a, e); mult *= v > 1 ? d?.weak?.[e] ?? v : v; }
  if (d?.halve?.includes(a)) mult *= 0.5;
  mult = Math.max(MULT_MIN, Math.min(MULT_MAX, mult));
  return { kind: 'hit', mult, label: mult > 1 ? 'Weak!' : mult < 1 ? 'Resist' : null };
}
