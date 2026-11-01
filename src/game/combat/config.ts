/** Battles are three a side at most: the hero and two party members, and three enemies. */
export const MAX_FOES = 3;
/** Single battle mode: heroes who can be swapped in, and foes in a trainer battle, at most (the four spheres). */
export const SINGLE_MAX = 4;
/**
 * Combat tuning with defaults filled in. Database → Combat stores only what differs.
 * No three.js, so it can be tested on its own.
 */
import { DEFAULT_ESSENCE, essenceRules, type EssenceRules } from '../essence';
import { ATTRS, ATTR_MAX, ATTR_POINTS_PER_LEVEL, type Attrs, attrsFrom, baseAttrs, finalDamage, throughFraction } from '../attributes';
import type { AbilityData, CombatData, Database, EncounterPick, EnemyGrowth, ExpBonus, TurnOrder, WeaponClass } from '../../world/types';
import { abilityJSON } from '../abilities';
import { statusPills, type StatusPill } from '../battle/statusPills';
import type { BattleAilment } from '../battle/status';

export interface ClassTuning { speed: number; reach: number; damage: number }

export interface TurnBasedConfig {
  order: TurnOrder;
  flee: number;
  joinRadius: number;
  maxEnemies: number;
  partyDamage: number;
  enemyDamage: number;
  grace: number;
  guardHeal: number;
  additions: 'set' | 'choose';
  additionTiming: 'press' | 'auto';
  /** The battle screen: Dragon Legend (faces and numbers in a row, lists in the middle) or Forbidden Fantasy (bars in a box, lists at the side). */
  layout: 'dragon' | 'fantasy' | 'pocket';
  /** The hero always fights (can't be swapped onto the bench). */
  heroLocked: boolean;
  /** Party members walk behind the hero on the map (off: only the hero is shown; the party appears in battles). */
  partyFollows: boolean;
  /** Monster stat blocks across the top of the battle screen (instead of names and bars over the foes). */
  statBlocks: boolean;
  /** Status pills: short tags (PSN) or full words (POISONED), and each ailment's colours and text. */
  statusWords: 'short' | 'full';
  statusPills: Record<BattleAilment, StatusPill>;
  /** Group battles, or Single (Pokémon-style: one hero out at a time). */
  mode: 'group' | 'single';
  /** Single mode: heroes who can be swapped in (1 – 8). */
  singleParty: number;
  /** Single mode: how foes come out when nothing else says. */
  singlePick: EncounterPick;
}

export const DEFAULT_TURN_BASED: TurnBasedConfig = { order: 'ctb', flee: 50, joinRadius: 6, maxEnemies: 3, partyDamage: 1, enemyDamage: 1, grace: 3, guardHeal: 10, additions: 'set', additionTiming: 'press', layout: 'dragon', heroLocked: false, partyFollows: true, statBlocks: false, statusWords: 'short', statusPills: statusPills(), mode: 'group', singleParty: 3, singlePick: 'random' };

export interface CombatConfig {
  turnBased: TurnBasedConfig;
  unarmedDamage: number;
  classes: Record<WeaponClass | 'unarmed', ClassTuning>;
  bow: { drawTime: number; arrowSpeed: number; lockRange: number };
  lockRange: number;
  fire: { mp: number; damage: number; speed: number; range: number; kindle: number };
  /** Enemies keep this many tiles from lit campfires. */
  campSafe: number;
  xpBase: number;
  xpGrowth: number;
  maxLevel: number;
  /** Hand-set EXP per level (see CombatData.expTable); the curve fills the rest. */
  expTable?: number[];
  pointsPerLevel: number;
  startPoints: number;
  /** Stat points each level up. */
  statPointsPerLevel: number;
  /** Party (shared) skill tree points each hero level up. */
  sharedPointsPerLevel: number;
  /** The Journal's Bestiary: how many of a kind must be defeated before its numbers, its elements and its drops show. */
  bestiary: { stats: number; elements: number; drops: number };
  /** Enemies above their own level: percent each level adds. */
  enemyGrowth: EnemyGrowth;
  /** EXP bonuses, percent of the foe's EXP. */
  exp: ExpBonus;
  /** Element stones (Fragments, Shards, Heart Stones). */
  essence: EssenceRules;
}

export const DEFAULT_COMBAT: CombatConfig = {
  turnBased: DEFAULT_TURN_BASED,
  unarmedDamage: 3,
  classes: {
    unarmed: { speed: 1.3, reach: 0.85, damage: 1 },
    light: { speed: 1.45, reach: 1.0, damage: 0.85 },
    medium: { speed: 1.0, reach: 1.2, damage: 1 },
    heavy: { speed: 0.62, reach: 1.4, damage: 1.6 },
  },
  bow: { drawTime: 0.75, arrowSpeed: 15, lockRange: 16 },
  lockRange: 8,
  fire: { mp: 6, damage: 14, speed: 9, range: 12, kindle: 20 },
  campSafe: 4,
  xpBase: 60,
  xpGrowth: 1.15,
  maxLevel: 50,
  pointsPerLevel: 1,
  startPoints: 1,
  statPointsPerLevel: ATTR_POINTS_PER_LEVEL,
  sharedPointsPerLevel: 1,
  bestiary: { stats: 1, elements: 3, drops: 5 },
  enemyGrowth: { hp: 12, attack: 7, defense: 6, xp: 12, gold: 8 },
  exp: { finish: 25, weak: 10, strike: 4, complete: 10, noKo: 10 },
  essence: DEFAULT_ESSENCE,
};

/** Base time of one melee swing (at speed 1), in seconds. */
export const SWING_TIME = 0.46;

export function combatConfig(data?: CombatData): CombatConfig {
  const d = DEFAULT_COMBAT, s = data ?? {};
  const classes = { ...d.classes };
  for (const k of ['light', 'medium', 'heavy'] as WeaponClass[]) classes[k] = { ...d.classes[k], ...s.classes?.[k] };
  const tb = { ...d.turnBased, ...s.turnBased };
  return {
    turnBased: {
      ...tb, order: tb.order === 'rounds' ? 'rounds' : 'ctb',
      flee: Math.max(0, Math.min(100, tb.flee)), joinRadius: Math.max(0, tb.joinRadius), maxEnemies: Math.max(1, Math.min(MAX_FOES, Math.round(tb.maxEnemies))),
      partyDamage: Math.max(0.1, tb.partyDamage), enemyDamage: Math.max(0.1, tb.enemyDamage), grace: Math.max(0, tb.grace), guardHeal: Math.max(0, Math.min(100, tb.guardHeal)), additions: tb.additions === 'choose' ? 'choose' : 'set', additionTiming: tb.additionTiming === 'auto' ? 'auto' : 'press', layout: tb.layout === 'fantasy' || tb.layout === 'pocket' ? tb.layout : 'dragon', heroLocked: !!tb.heroLocked, statBlocks: !!tb.statBlocks, statusWords: tb.statusWords === 'full' ? 'full' : 'short', statusPills: statusPills(s.turnBased?.statusPills), mode: tb.mode === 'single' ? 'single' : 'group', singleParty: Math.max(1, Math.min(4, Math.round(tb.singleParty ?? 3))), singlePick: tb.singlePick === 'full' || tb.singlePick === 'oneByOne' ? tb.singlePick : 'random',
    },
    unarmedDamage: s.unarmedDamage ?? d.unarmedDamage,
    classes,
    bow: { ...d.bow, ...s.bow },
    lockRange: s.lockRange ?? d.lockRange,
    fire: { ...d.fire, ...s.fire },
    campSafe: s.campSafe ?? d.campSafe,
    xpBase: s.xpBase ?? d.xpBase,
    xpGrowth: s.xpGrowth ?? d.xpGrowth,
    maxLevel: clampLevel(s.maxLevel ?? d.maxLevel),
    expTable: s.expTable?.length ? s.expTable.map((v) => Math.max(1, Math.round(v))) : undefined,
    pointsPerLevel: s.pointsPerLevel ?? d.pointsPerLevel,
    startPoints: s.startPoints ?? d.startPoints,
    statPointsPerLevel: Math.max(0, Math.round(s.statPointsPerLevel ?? d.statPointsPerLevel)),
    sharedPointsPerLevel: Math.max(0, Math.round(s.sharedPointsPerLevel ?? d.sharedPointsPerLevel)),
    bestiary: { ...d.bestiary, ...s.bestiary },
    enemyGrowth: { ...d.enemyGrowth, ...s.enemyGrowth },
    exp: { ...d.exp, ...s.exp },
    essence: essenceRules(s.essence),
  };
}

export const combatFromDb = (db: Database): CombatConfig => combatConfig(db.combat);

/** Damage after defence: defence d takes away d / (d + 50) of it (rounded up, never below 1 or above 9999). */
export function mitigate(damage: number, defense: number): number {
  return finalDamage(damage * throughFraction(defense));
}

/** Levels can be set from 2 to 99. */
export const MAX_LEVEL_LIMIT = 99;
const clampLevel = (n: number) => Math.max(2, Math.min(MAX_LEVEL_LIMIT, Math.round(n)));

export type XpRules = Pick<CombatConfig, 'xpBase' | 'xpGrowth'> & Partial<Pick<CombatConfig, 'maxLevel' | 'expTable'>>;

/** EXP from `level` to the next on the curve alone (base × growth^(level − 1)). */
export function curveXp(c: Pick<CombatConfig, 'xpBase' | 'xpGrowth'>, level: number): number {
  return Math.max(1, Math.round(c.xpBase * Math.pow(c.xpGrowth, level - 1)));
}

/** Experience needed to go from `level` to the next (0 at the top level: there is no next). */
export function xpToNext(c: XpRules, level: number): number {
  if (level >= (c.maxLevel ?? MAX_LEVEL_LIMIT)) return 0;
  return c.expTable?.[level - 1] ?? curveXp(c, level);
}

/** The whole table for levels 1 … max − 1: EXP to the next level, and the total EXP to reach that next level. */
export function expRows(c: XpRules): { level: number; toNext: number; total: number }[] {
  const max = c.maxLevel ?? MAX_LEVEL_LIMIT, rows: { level: number; toNext: number; total: number }[] = [];
  let total = 0;
  for (let l = 1; l < max; l++) { const n = xpToNext(c, l); total += n; rows.push({ level: l, toNext: n, total }); }
  return rows;
}

/** Level, experience into the current level, unspent skill points, and the hero's stats. */
export class Progression {
  level = 1;
  xp = 0;
  points = 0;
  /** The hero's own stats (from creation, plus the points spent on them since), and stat points not yet spent. */
  stats: Attrs = baseAttrs();
  statPoints = 0;
  /** Ranks taken in each skill. */
  ranks: Record<string, number> = {};
  /** Skills whose spell shard has been given (so it's given only once, even if it's sold or dropped later). */
  taught: string[] = [];
  /** Learned spells and Additions, the readied ones, and class. */
  abilities: AbilityData = {};
  /** Growth ranks changed for good (potions, events); the rest are the Database's. */
  statRanks: Partial<Record<keyof Attrs, import('../statRanks').Rank>> = {};
  /** The Party (shared) skill tree: points for it (one each hero level) and the ranks taken, for everyone. */
  sharedPoints = 0;
  sharedRanks: Record<string, number> = {};
  /** What a level adds to each stat (from the hero's ranks; set by the game). */
  growth: () => Partial<Attrs> = () => ({});

  constructor(private cfg: XpRules & Pick<CombatConfig, 'pointsPerLevel'> & Partial<Pick<CombatConfig, 'startPoints' | 'statPointsPerLevel' | 'sharedPointsPerLevel'>>) {
    this.points = cfg.startPoints ?? 0;
  }

  get toNext(): number { return xpToNext(this.cfg, this.level); }
  /** At the top level: experience no longer counts. */
  get maxed(): boolean { return this.level >= (this.cfg.maxLevel ?? MAX_LEVEL_LIMIT); }

  /** Add experience; returns how many levels were gained. */
  add(xp: number): number {
    let gained = 0;
    if (this.maxed) { this.xp = 0; return 0; }
    this.xp += Math.max(0, Math.round(xp));
    while (!this.maxed && this.xp >= this.toNext) {
      this.xp -= this.toNext;
      this.level++;
      this.points += this.cfg.pointsPerLevel;
      this.sharedPoints += this.cfg.sharedPointsPerLevel ?? 1;
      // Stats grow by their ranks (A +4 … F +0).
      const g = this.growth();
      for (const k of ATTRS) this.stats[k] = Math.min(ATTR_MAX, this.stats[k] + (g[k] ?? 0));
      gained++;
    }
    if (this.maxed) this.xp = 0;
    return gained;
  }

  toJSON(): ProgressData & { level: number; xp: number; points: number } {
    return { level: this.level, xp: this.xp, points: this.points, ranks: { ...this.ranks }, ...(this.taught.length ? { taught: [...this.taught] } : {}),
      stats: { ...this.stats }, sharedPoints: this.sharedPoints, ...(Object.keys(this.sharedRanks).length ? { sharedRanks: { ...this.sharedRanks } } : {}), ...(Object.keys(this.statRanks).length ? { statRanks: { ...this.statRanks } } : {}), ...(Object.keys(abilityJSON(this.abilities)).length ? { abilities: abilityJSON(this.abilities) } : {}) };
  }
  /**
   * Restore from a save, or start fresh (no argument) with `base` stats (the hero's, or what character creation
   * made). Saves from before stats get the database's stats and the points their levels would have given.
   */
  load(d?: ProgressData, base: Attrs = baseAttrs()): void {
    this.taught = [...(d?.taught ?? [])];
    this.abilities = abilityJSON(d?.abilities ?? {});
    this.level = Math.max(1, Math.min(this.cfg.maxLevel ?? MAX_LEVEL_LIMIT, d?.level ?? 1));
    this.xp = this.maxed ? 0 : Math.max(0, d?.xp ?? 0);
    this.points = Math.max(0, d?.points ?? (d ? 0 : this.cfg.startPoints ?? 0));
    this.ranks = { ...(d?.ranks ?? {}) };
    this.stats = d?.stats ? attrsFrom(d.stats) : { ...base };
    // Stat points are gone (stats grow by rank now); any left unspent in an older save are dropped.
    this.statPoints = 0;
    this.statRanks = { ...(d?.statRanks ?? {}) };
    // Saves from before the Party tree get the points their levels would have given.
    this.sharedRanks = { ...(d?.sharedRanks ?? {}) };
    this.sharedPoints = Math.max(0, d?.sharedPoints ?? (this.level - 1) * (this.cfg.sharedPointsPerLevel ?? 1));
  }

  /** Spend stat points: `add` is how many go on each stat. False if there aren't enough or a stat would pass 100. */
  spend(add: Partial<Attrs>): boolean {
    const total = ATTRS.reduce((s, k) => s + Math.max(0, Math.round(add[k] ?? 0)), 0);
    if (total > this.statPoints || ATTRS.some((k) => this.stats[k] + (add[k] ?? 0) > ATTR_MAX)) return false;
    for (const k of ATTRS) this.stats[k] += Math.max(0, Math.round(add[k] ?? 0));
    this.statPoints -= total;
    return true;
  }
}

export interface ProgressData {
  level?: number; xp?: number; points?: number; ranks?: Record<string, number>; taught?: string[];
  stats?: Partial<Attrs>; statPoints?: number;
  abilities?: AbilityData;
  /** The Party skill tree: unspent points and ranks taken. */
  sharedPoints?: number; sharedRanks?: Record<string, number>;
  /** Stat growth ranks changed by potions and events (game/statRanks.ts). */
  statRanks?: Partial<Record<keyof Attrs, import('../statRanks').Rank>>;
}
