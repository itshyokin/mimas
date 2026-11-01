/**
 * Enemy levels: an enemy's numbers are set for its own level (Database → Enemies); a spawn can roll it higher or
 * lower, and each level changes its health, damage, defence, EXP and gold by the Database's growth percentages.
 */
import type { EnemyDef, EnemyGrowth, LevelRange } from '../world/types';

export const MAX_ENEMY_LEVEL = 99;
const clampLevel = (n: number) => Math.max(1, Math.min(MAX_ENEMY_LEVEL, Math.round(n)));

/** A level from a range (inclusive), or the enemy's own. */
export function rollLevel(def: EnemyDef, range?: LevelRange | null, rng: () => number = Math.random): number {
  if (!range) return clampLevel(def.level ?? 1);
  const lo = clampLevel(Math.min(range[0], range[1])), hi = clampLevel(Math.max(range[0], range[1]));
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Dynamic levels: near the party's average, `spread` either side. */
export function partyLevel(average: number, spread: number, rng: () => number = Math.random): number {
  const s = Math.max(0, Math.round(spread));
  return clampLevel(Math.round(average) - s + Math.floor(rng() * (2 * s + 1)));
}

/** The enemy at another level: its numbers grown (or shrunk) by the growth percentages. Its own level: as it is. */
export function atLevel(def: EnemyDef, level: number, g: EnemyGrowth): EnemyDef {
  const own = clampLevel(def.level ?? 1), lv = clampLevel(level), d = lv - own;
  if (!d) return def.level === undefined && lv === 1 ? def : { ...def, level: lv };
  const f = (pct: number) => Math.max(0.2, 1 + (pct / 100) * d);
  const r = (v: number, pct: number, min = 0) => Math.max(min, Math.round(v * f(pct)));
  const out: EnemyDef = { ...def, level: lv, hp: r(def.hp, g.hp, 1), damage: r(def.damage, g.attack), xp: r(def.xp, g.xp) };
  if (def.defense !== undefined) out.defense = r(def.defense, g.defense);
  if (def.magicDefense !== undefined) out.magicDefense = r(def.magicDefense, g.defense);
  if (def.gold) out.gold = [r(def.gold[0], g.gold), r(def.gold[1], g.gold)];
  return out;
}
