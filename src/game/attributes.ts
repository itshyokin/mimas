/**
 * Character stats (attributes): Strength, Dexterity, Agility, Endurance, Defence, Magic and Magic Defence, what they do, the damage
 * rules every hit follows, and making a new hero's stats (rolled, bought with points, or the standard array).
 * No three.js, so it can be tested on its own.
 */

export type Attr = 'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf';
/** The stats, in the order every list shows them (Database → Heroes → Stat order changes it: `setAttrOrder`). */
export const ATTRS: Attr[] = ['str', 'dex', 'agi', 'end', 'def', 'mag', 'mdf'];
/** The built-in order. */
export const DEFAULT_ATTR_ORDER: readonly Attr[] = ['str', 'dex', 'agi', 'end', 'def', 'mag', 'mdf'];
/** Put the stats in the game's order (unknown or missing ones keep their place at the end). */
export function setAttrOrder(order?: readonly string[] | null): void {
  const want = (order ?? []).filter((k, i, a): k is Attr => (DEFAULT_ATTR_ORDER as readonly string[]).includes(k) && a.indexOf(k) === i);
  const next = [...want, ...DEFAULT_ATTR_ORDER.filter((k) => !want.includes(k))];
  ATTRS.splice(0, ATTRS.length, ...next);
}
export type Attrs = Record<Attr, number>;

export const ATTR_INFO: Record<Attr, { name: string; short: string; does: string }> = {
  str: { name: 'Strength', short: 'STR', does: 'Melee damage' },
  dex: { name: 'Dexterity', short: 'DEX', does: 'Bow damage, aim, critical hits' },
  agi: { name: 'Agility', short: 'AGI', does: 'Turn speed in battle and dodging' },
  end: { name: 'Endurance', short: 'END', does: 'Resisting ailments, a little HP' },
  def: { name: 'Defence', short: 'DEF', does: 'Less damage from physical hits' },
  mag: { name: 'Magic', short: 'MAG', does: 'Spell damage' },
  mdf: { name: 'Magic Defence', short: 'MDF', does: 'Less damage from spells' },
};

/** Every stat starts here; 10 is "normal" (no bonus, no penalty). */
export const ATTR_BASE = 10;
export const ATTR_MIN = 1;
export const ATTR_MAX = 100;
/** Stat points gained each level (Database → Heroes can change it). */
export const ATTR_POINTS_PER_LEVEL = 2;
/** Base critical hit chance (%), and how much harder a critical hit is. */
export const BASE_CRIT = 5;
export const CRIT_MULTIPLIER = 1.5;
/** No hit does more than this. */
export const DAMAGE_CAP = 9999;

export const baseAttrs = (v = ATTR_BASE): Attrs => ({ str: v, dex: v, agi: v, end: v, def: v, mag: v, mdf: v });
export const clampAttr = (v: number): number => Math.max(ATTR_MIN, Math.min(ATTR_MAX, Math.round(v)));
export function attrsFrom(p?: Partial<Attrs> | null, fallback = ATTR_BASE): Attrs {
  const a = baseAttrs(fallback);
  for (const k of ATTRS) if (typeof p?.[k] === 'number' && Number.isFinite(p[k])) a[k] = clampAttr(p[k]!);
  return a;
}

/** Strength and Magic: damage × this (each point over 10 adds 2%, each under takes 2% away). */
export const powerMultiplier = (v: number): number => Math.max(0.1, 1 + (v - ATTR_BASE) / 50);
/** Dexterity: swings and draws this much faster (1% a point over 10, up to +50%; down to −20% for low DEX). */
export const speedMultiplier = (dex: number): number => Math.max(0.8, Math.min(1.5, 1 + (dex - ATTR_BASE) / 100));
/** Dexterity: critical hit chance added (a quarter of a % a point over 10). */
export const dexCrit = (dex: number): number => (dex - ATTR_BASE) * 0.25;
/** Dexterity: chance (%) to land a weapon hit, before the target's evasion. */
export const accuracyOf = (dex: number): number => Math.max(50, Math.min(150, 95 + (dex - ATTR_BASE) * 0.5));
/** Agility: chance (%) to dodge a weapon hit (half a % a point over 10, up to 40%). */
export const evasionOf = (agi: number): number => Math.max(0, Math.min(40, (agi - ATTR_BASE) * 0.5));
/** Endurance: chance (%) to shrug off an ailment (1.5% a point over 10, up to 60%). */
export const ailmentResist = (end: number): number => Math.max(0, Math.min(60, (end - ATTR_BASE) * 1.5));
/** Endurance: max HP added (2 a point over 10; less for low Endurance). */
export const enduranceHp = (end: number): number => Math.round((end - ATTR_BASE) * 2);
/** The chance (%) a weapon hit lands: accuracy minus evasion, never below 20% or above 100%. */
export const hitChance = (accuracy: number, evasion: number): number => Math.max(20, Math.min(100, accuracy - evasion));

/** Defence and Magic Defence: added to the armour's defence (10 adds nothing). */
export const defenceBonus = (v: number): number => v - ATTR_BASE;
/**
 * Share of a hit that gets through `defence` (the armour formula: 50 defence halves it). Below 0 (a low Defence
 * with no armour) hits do more: 2% a point, up to double.
 */
export const throughFraction = (defence: number): number => (defence >= 0 ? 1 - defence / (defence + 50) : Math.min(2, 1 - defence / 50));

/** "+12%" for a multiplier. */
export const percentText = (m: number): string => { const p = Math.round((m - 1) * 100); return p === 0 ? '±0%' : `${p > 0 ? '+' : '−'}${Math.abs(p)}%`; };

/** What a stat does at this value, for the stat page: "+12% damage". */
export function attrEffect(a: Attr, v: number): string {
  if (a === 'str' || a === 'mag') return `${percentText(powerMultiplier(v))} damage`;
  if (a === 'dex') return `${percentText(powerMultiplier(v))} bow, ${Math.round(accuracyOf(v))}% aim`;
  if (a === 'agi') return `${percentText(Math.min(2.5, Math.max(0.4, (v + 20) / 30)))} speed, ${Math.round(evasionOf(v))}% dodge`;
  if (a === 'end') { const h = enduranceHp(v); return `${h >= 0 ? '+' : '−'}${Math.abs(h)} HP, ${Math.round(ailmentResist(v))}% resist`; }
  const f = throughFraction(defenceBonus(v)), p = Math.round(Math.abs(1 - f) * 100);
  return p === 0 ? 'no change' : f < 1 ? `${p}% less damage` : `${p}% more damage`;
}

/**
 * The final number for a hit: never more than the cap, and never below 1 (rounded up). Immunity (0) and absorbing
 * (negative: healing) are decided before this and skip it.
 */
export const finalDamage = (x: number): number => (Number.isFinite(x) ? Math.min(DAMAGE_CAP, Math.max(1, Math.ceil(x))) : 1);

/* ------------------------------------------------------------------ making a hero */

export type CreationMethod = 'roll' | 'pointBuy' | 'array' | 'hard';
export const CREATION_METHODS: CreationMethod[] = ['roll', 'pointBuy', 'array', 'hard'];
export const CREATION_NAMES: Record<CreationMethod, string> = {
  roll: 'Roll Dice (4d6, drop the lowest)',
  pointBuy: 'Point buy',
  array: 'Standard array',
  hard: 'Hard: 3d6 in order',
};

/** Point buy: every stat starts at 8 and can be raised to 15, with this many points (D&D 5e's costs). */
export const POINT_BUY = { budget: 30, min: 8, max: 15 } as const;
const BUY_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const buyCost = (v: number): number => BUY_COST[Math.max(POINT_BUY.min, Math.min(POINT_BUY.max, v))] ?? 0;
export const pointsSpent = (a: Attrs): number => ATTRS.reduce((s, k) => s + buyCost(a[k]), 0);
/** The cost of raising a stat one more step (null at the top). */
export const nextCost = (v: number): number | null => (v >= POINT_BUY.max ? null : buyCost(v + 1) - buyCost(v));

export const STANDARD_ARRAY = [16, 14, 13, 12, 10, 10, 8];

export type Rng = () => number;
const d6 = (rng: Rng) => 1 + Math.floor(rng() * 6);
/** 4d6, the lowest die dropped: the dice and the total. */
export function roll4d6(rng: Rng = Math.random): { dice: number[]; total: number } {
  const dice = [d6(rng), d6(rng), d6(rng), d6(rng)];
  const low = dice.indexOf(Math.min(...dice));
  return { dice, total: dice.reduce((s, v, i) => (i === low ? s : s + v), 0) };
}
export function roll3d6(rng: Rng = Math.random): { dice: number[]; total: number } {
  const dice = [d6(rng), d6(rng), d6(rng)];
  return { dice, total: dice[0] + dice[1] + dice[2] };
}

/** Values arranged onto the stats: `order[i]` is the index into `values` for ATTRS[i]. */
export function arranged(values: number[], order: number[]): Attrs {
  const a = baseAttrs();
  ATTRS.forEach((k, i) => (a[k] = values[order[i]] ?? ATTR_BASE));
  return a;
}

/** Swap which values two stats have. */
export function swapOrder(order: number[], i: number, j: number): number[] {
  const o = [...order];
  [o[i], o[j]] = [o[j], o[i]];
  return o;
}

/* ------------------------------------------------------------------ a hero's totals */

/** What equipment can add (the parts of an item that matter here). */
export interface StatGear { defense?: number; magicDefense?: number; bonus?: Partial<Attrs>; crit?: number; slot?: string }

export interface HeroTotals {
  /** Stats with equipment and skills (1 – 100). */
  attrs: Attrs;
  /** Critical hit chance, %. */
  crit: number;
  /** Defence against physical hits and against spells: armour plus the stat's bonus. */
  armour: number;
  magicArmour: number;
}

/** Slots whose defence counts (weapons and bows don't protect). */
const ARMOUR_SLOTS = new Set(['armor', 'shield', 'accessory']);

/** The hero's own stats plus what their equipment and skills add. `skill` gives a skill stat's total. */
export function heroTotals(own: Attrs, gear: (StatGear | undefined)[], skill: (s: Attr | 'crit') => number = () => 0): HeroTotals {
  const attrs = { ...own };
  let crit = skill('crit'), armour = 0, magicArmour = 0;
  for (const g of gear) {
    if (!g) continue;
    for (const k of ATTRS) attrs[k] += g.bonus?.[k] ?? 0;
    crit += g.crit ?? 0;
    if (!g.slot || ARMOUR_SLOTS.has(g.slot)) { armour += g.defense ?? 0; magicArmour += g.magicDefense ?? 0; }
  }
  for (const k of ATTRS) attrs[k] = clampAttr(attrs[k] + skill(k));
  crit += BASE_CRIT + dexCrit(attrs.dex);
  return { attrs, crit: Math.max(0, Math.min(100, Math.round(crit * 10) / 10)), armour: armour + defenceBonus(attrs.def), magicArmour: magicArmour + defenceBonus(attrs.mdf) };
}
