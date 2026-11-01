/**
 * Element stones: Fragments, Shards and Heart Stones of each element. A hero wears up to two (Primary and Secondary
 * Element slots): each gives them its element, with its weaknesses, and makes their hits of that element stronger.
 * Two of the same element add up (and get a small pair bonus), and two Shards make its weaknesses a little worse;
 * a Heart Stone hits hardest without worsening them. Fragments fuse into Shards, Shards into Heart Stones.
 * No three.js, so it can be tested on its own.
 */
import type { Element, EssenceTier, ItemDef } from '../world/types';

export const ESSENCE_TIERS: EssenceTier[] = ['fragment', 'shard', 'heart'];
export const TIER_NAMES: Record<EssenceTier, string> = { fragment: 'Fragment', shard: 'Shard', heart: 'Heart Stone' };
/** The elements stones come in (Normal isn't one: it's having none). */
export const ESSENCE_ELEMENTS: Element[] = ['water', 'fire', 'nature', 'earth', 'shock', 'light', 'dark'];

export interface TierRule {
  /** Percent more damage to hits of its element. */
  damage: number;
  /** How hard that element's weaknesses hit (×, 2 is the usual). */
  weak: number;
}

export interface EssenceRules {
  fragment: TierRule;
  shard: TierRule;
  heart: TierRule;
  /** Two Shards of one element: their weaknesses hit this hard. */
  doubleWeak: number;
  /** The second stone of an element adds this percent of its damage bonus. */
  stack: number;
  /** Both slots the same element: this much more damage (percent). */
  pair: number;
  /** A spell of the caster's own element: this much more damage (percent). */
  sameType: number;
  /** Fragments that fuse into a Shard, and Shards into a Heart Stone. */
  fuseFragments: number;
  fuseShards: number;
  /** Defeated enemies with elements drop Fragments of them: the chance (percent) and how many. */
  dropChance: number;
  dropCount: number;
}

export const DEFAULT_ESSENCE: EssenceRules = {
  fragment: { damage: 10, weak: 1.5 },
  shard: { damage: 25, weak: 2 },
  heart: { damage: 50, weak: 2 },
  doubleWeak: 2.25,
  stack: 60,
  pair: 10,
  sameType: 20,
  fuseFragments: 25,
  fuseShards: 10,
  dropChance: 60,
  dropCount: 1,
};

const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);

/** The Database's numbers, the defaults filling in what isn't set. */
export function essenceRules(s?: Partial<EssenceRules>): EssenceRules {
  const d = DEFAULT_ESSENCE, x = s ?? {};
  const tier = (k: EssenceTier): TierRule => ({ damage: num(x[k]?.damage, d[k].damage, 0, 500), weak: num(x[k]?.weak, d[k].weak, 1, 5) });
  return {
    fragment: tier('fragment'), shard: tier('shard'), heart: tier('heart'),
    doubleWeak: num(x.doubleWeak, d.doubleWeak, 1, 5), stack: num(x.stack, d.stack, 0, 100), pair: num(x.pair, d.pair, 0, 200),
    sameType: num(x.sameType, d.sameType, 0, 200), fuseFragments: Math.round(num(x.fuseFragments, d.fuseFragments, 2, 99)),
    fuseShards: Math.round(num(x.fuseShards, d.fuseShards, 2, 99)), dropChance: num(x.dropChance, d.dropChance, 0, 100), dropCount: Math.round(num(x.dropCount, d.dropCount, 0, 20)),
  };
}

const EL_NAME: Record<Element, string> = { neutral: 'Normal', water: 'Water', fire: 'Fire', nature: 'Nature', earth: 'Earth', shock: 'Shock', light: 'Light', dark: 'Dark' };

/** The built-in stone's item id ("ess_fire_shard"). */
export const essenceId = (e: Element, t: EssenceTier): string => `ess_${e}_${t}`;

/** The built-in stones, one of each element and tier (the Database can rename them, change their icons and prices). */
export function defaultEssenceItems(): ItemDef[] {
  const out: ItemDef[] = [];
  const price: Record<EssenceTier, number> = { fragment: 8, shard: 240, heart: 3000 };
  for (const e of ESSENCE_ELEMENTS)
    for (const t of ESSENCE_TIERS) {
      const name = `${EL_NAME[e]} ${TIER_NAMES[t]}`;
      const what = t === 'fragment' ? `A chip of ${EL_NAME[e].toLowerCase()} power, dropped by ${EL_NAME[e].toLowerCase()} monsters.` : t === 'shard' ? `A whole shard of ${EL_NAME[e].toLowerCase()} power.` : `The heart of ${EL_NAME[e].toLowerCase()} power: strong hits without worse weaknesses.`;
      out.push({ id: essenceId(e, t), name, kind: 'material', icon: `builtin:ess_${t}_${e}`, price: price[t], stack: t === 'heart' ? 9 : 99, essence: { element: e, tier: t },
        description: `${what} Wear it in an Element slot (Bag → Shards) to take on its element.` });
    }
  return out;
}

/** Add the built-in stones a database doesn't have yet (by id), so every game has them. */
export function withEssenceItems(items: ItemDef[]): ItemDef[] {
  const have = new Set(items.map((d) => d.id));
  const extra = defaultEssenceItems().filter((d) => !have.has(d.id));
  return extra.length ? [...items, ...extra] : items;
}

/** The stone of an element and tier (the Database's, else the built-in id). */
export function essenceItem(items: Iterable<ItemDef>, e: Element, t: EssenceTier): ItemDef | undefined {
  let fallback: ItemDef | undefined;
  for (const d of items) {
    if (d.essence?.element === e && d.essence.tier === t) { if (d.id === essenceId(e, t)) return d; fallback ??= d; }
  }
  return fallback;
}

/** What a hero's stones add up to. */
export interface Affinity {
  /** Their elements, the Primary slot's first (empty: Normal). */
  elements: Element[];
  /** The element their basic attacks hit with (the Primary slot's, else the Secondary's). */
  primary?: Element;
  /** Percent more damage to hits of each element. */
  bonus: Partial<Record<Element, number>>;
  /** How hard each of their elements' weaknesses hit (×). */
  weak: Partial<Record<Element, number>>;
  /** A spell of their own element: percent more. */
  sameType: number;
}

/** A hero's two Element slots (Primary, Secondary) worked out. */
export function affinity(slots: (ItemDef | undefined)[], r: EssenceRules): Affinity {
  const worn = slots.slice(0, 2).filter((d): d is ItemDef & { essence: NonNullable<ItemDef['essence']> } => !!d?.essence && d.essence.element !== 'neutral');
  const out: Affinity = { elements: [], bonus: {}, weak: {}, sameType: r.sameType };
  if (!worn.length) return out;
  out.primary = worn[0].essence.element;
  for (const d of worn) if (!out.elements.includes(d.essence.element)) out.elements.push(d.essence.element);
  for (const e of out.elements) {
    const mine = worn.filter((d) => d.essence.element === e).map((d) => r[d.essence.tier]).sort((a, b) => b.damage - a.damage);
    let dmg = mine[0].damage;
    if (mine.length > 1) dmg += (mine[1].damage * r.stack) / 100 + r.pair;
    out.bonus[e] = Math.round(dmg);
    const shards = worn.filter((d) => d.essence.element === e && d.essence.tier === 'shard').length;
    out.weak[e] = shards >= 2 ? r.doubleWeak : Math.max(...mine.map((m) => m.weak));
  }
  return out;
}

/** "Fire +40% · weak ×2.25": a hero's stones in a line, for menus. */
export function affinityText(a: Affinity): string {
  if (!a.elements.length) return 'Normal';
  return a.elements.map((e) => `${EL_NAME[e]} +${a.bonus[e] ?? 0}%${(a.weak[e] ?? 2) !== 2 ? ` (weaknesses ×${a.weak[e]})` : ''}`).join(' · ');
}

/** How many of the next tier `n` stones of a tier fuse into (and what's left over). */
export function fuseCount(tier: EssenceTier, n: number, r: EssenceRules): { make: number; need: number } {
  const need = tier === 'fragment' ? r.fuseFragments : tier === 'shard' ? r.fuseShards : 0;
  return { make: need ? Math.floor(n / need) : 0, need };
}

export const nextTier = (t: EssenceTier): EssenceTier | null => (t === 'fragment' ? 'shard' : t === 'shard' ? 'heart' : null);
