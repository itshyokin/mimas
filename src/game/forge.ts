/**
 * Forging: weapons and armor upgraded with ingots of their material, and spell shards set in them (an enchantment).
 *
 * Upgrades and enchantments belong to the kind of item (every Longsword the player owns is the same Longsword +2),
 * because the bag keeps item ids, not separate copies. The game swaps the item's definition for a forged one: more
 * damage or defence, "+2" on its name, and a set shard's element (weapons hit with it; armor halves it).
 * No three.js, so it can be tested alone.
 */
import type { CombatData, ItemDef } from '../world/types';
import { ELEMENT_COLORS } from './elements';

/** What the forge has done to one kind of item. */
export interface ForgeEntry { level?: number; shard?: string }

export interface ForgeRules { maxLevel: number; percent: number; enchantPercent: number }
export const forgeRules = (c?: CombatData): ForgeRules => ({
  maxLevel: Math.max(1, Math.round(c?.forge?.maxLevel ?? 5)),
  percent: Math.max(0, c?.forge?.percent ?? 8),
  enchantPercent: Math.max(0, c?.forge?.enchantPercent ?? 10),
});

/** Can it be upgraded (a weapon, bow, armor, shield or accessory with a material)? */
export const upgradable = (d: ItemDef | undefined): boolean =>
  !!d && d.kind === 'equipment' && !!d.slot && d.slot !== 'magic' && !!d.material && d.material !== 'none';
/** Can a shard be set in it (weapons, bows, armor, shields, accessories)? */
export const enchantable = (d: ItemDef | undefined): boolean => !!d && d.kind === 'equipment' && !!d.slot && d.slot !== 'magic';
/** A shard that can be set in gear: one with an element (not a field spell like Light). */
export const settableShard = (d: ItemDef | undefined): boolean => !!d?.spell && !d.spell.power && !!d.element && d.element !== 'neutral';
/** Is it a weapon (hits) rather than something worn (wards)? */
const hits = (d: ItemDef) => d.slot === 'weapon' || d.slot === 'ranged';

/** Ingots the next upgrade takes: 1 for +1, 2 for +2… */
export const upgradeCost = (level: number): number => level + 1;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The item as forged: upgraded numbers, its level on its name, and a set shard's element. */
export function forgedDef(base: ItemDef, e: ForgeEntry | undefined, shard: ItemDef | undefined, rules: ForgeRules): ItemDef {
  const level = Math.min(rules.maxLevel, Math.max(0, e?.level ?? 0));
  const set = e?.shard && settableShard(shard) ? shard : undefined;
  if (!level && !set) return base;
  const k = 1 + (level * rules.percent) / 100, d: ItemDef = { ...base };
  if (level) d.name = `${base.name} +${level}`;
  if (base.weapon) d.weapon = { ...base.weapon, damage: round1(base.weapon.damage * k * (set && hits(base) ? 1 + rules.enchantPercent / 100 : 1)) };
  if (base.defense) d.defense = Math.round(base.defense * k);
  if (base.magicDefense) d.magicDefense = Math.round(base.magicDefense * k);
  if (set) {
    d.enchanted = set.element;
    const c = ELEMENT_COLORS[set.element!];
    if (hits(base)) {
      // A soft glow in the element's colour, and its swings leave a trail of it (unless the item has its own).
      d.glow = base.glow ?? { color: c, strength: 0.55, pulse: true };
      if (base.slot === 'weapon') d.trail = base.trail ?? { color: c, length: 3 };
      // The shard's element in every hit, and the ailments its bolts give.
      d.element = set.element;
      if (set.inflicts?.length) d.inflicts = [...(base.inflicts ?? []), ...set.inflicts];
    } else d.wards = [...new Set([...(base.wards ?? []), set.element!])];
  }
  return d;
}
