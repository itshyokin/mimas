/**
 * Ailments in turn-based battles. On the map, ailments run on seconds; in a battle they run on turns: each one lasts
 * a few of the afflicted fighter's own turns and ticks down as each of those turns ends. Battle ailments end with
 * the battle (the hero's ailments from the map carry in, and are still there, untouched, when it's over).
 * No three.js and no DOM, so it can be tested on its own.
 */
import type { Ailment, BuffKind, Inflict } from '../../world/types';
import { AILMENT_INFO, BUFF_INFO, FREEZE_AT } from '../status';

export type BattleAilment = Ailment | 'frozen';

/** How many of the fighter's own turns each ailment lasts, and what it does in a battle. */
export const BATTLE_AILMENT: Record<BattleAilment, { turns: number; does: string }> = {
  burn: { turns: 3, does: 'Loses 8% of their health at the start of each turn' },
  poison: { turns: 5, does: 'Loses 5% of their health at the start of each turn' },
  chill: { turns: 3, does: 'Slower turns; three chills freeze solid' },
  frozen: { turns: 1, does: 'Loses their next turn' },
  paralyze: { turns: 1, does: 'Loses their next turn' },
  blind: { turns: 3, does: 'Half their attacks miss' },
  silence: { turns: 3, does: 'Can’t cast spells' },
  stagger: { turns: 0, does: 'Their next turn comes later' },
  sleep: { turns: 3, does: 'Loses their turns until hurt or it wears off' },
  confusion: { turns: 2, does: 'Attacks anyone, friend or foe' },
  zombie: { turns: Infinity, does: 'Healing hurts; lasts the whole battle' },
};

export const BURN_SHARE = 0.08, POISON_SHARE = 0.05;
/** Chilled fighters' turns come round this much slower. */
export const CHILL_AGILITY = 0.7;
export const BLIND_MISS_CHANCE = 0.5;
/** Buffs and debuffs in battle: how many of the fighter's own turns they last when nothing says. */
export const BUFF_TURNS = 3;

/** A buff or debuff on a fighter in battle: how much, and turns left. */
export interface BattleBuff { amount: number; turns: number }

/** What a turn's start did: damage from burn or poison, and whether the fighter can act. */
export interface TurnStart { damage: { ailment: 'burn' | 'poison'; amount: number }[]; skip: BattleAilment | null; confused: boolean }

const family = (a: BattleAilment): BattleAilment => (a === 'frozen' ? 'chill' : a);

export class BattleStatus {
  /** Turns left for each ailment (Infinity: all battle), and Chill's build-up. */
  readonly turns = new Map<BattleAilment, number>();
  chillStacks = 0;
  /** Guarding: no new ailments until their next turn. */
  ward = false;
  /** Buffs and debuffs (raised stats, Haste, Slow, Regeneration…), with turns left. */
  readonly buffs = new Map<BuffKind, BattleBuff>();

  constructor(readonly resists: readonly Ailment[] = [], readonly boss = false, undead = false) {
    if (undead) this.turns.set('zombie', Infinity);
  }

  has(a: BattleAilment): boolean { return (this.turns.get(a) ?? 0) > 0; }
  get list(): BattleAilment[] { return [...this.turns.keys()].filter((a) => this.has(a)); }
  get zombie(): boolean { return this.has('zombie'); }
  get silenced(): boolean { return this.has('silence'); }
  get blind(): boolean { return this.has('blind'); }
  get chilled(): boolean { return this.has('chill'); }

  /**
   * Try to give an ailment. Returns what happened: given, refreshed, frozen (a third chill), resisted (they can't
   * get it, or they're guarding), or nothing (zombies get no other ailments; anyone with an ailment gets no second,
   * Zombie included: Update 105).
   */
  give(a: Ailment, turns?: number): 'given' | 'refreshed' | 'frozen' | 'resisted' | 'none' {
    if (this.ward || this.resists.includes(a)) return 'resisted';
    if (this.zombie && a !== 'zombie') return 'none';
    // One ailment at a time: a fighter that's poisoned can't be burned too (Chill and the Frozen it leads to count as
    // one; Stagger is only a moment). Zombie too: someone already poisoned can't become a zombie.
    if (a !== 'stagger' && this.list.some((o) => o !== 'zombie' && family(o) !== family(a))) return 'none';
    let t = turns ?? BATTLE_AILMENT[a].turns;
    if (this.boss && Number.isFinite(t)) t = Math.max(1, Math.ceil(t / 2));
    if (a === 'zombie') { for (const k of [...this.turns.keys()]) this.turns.delete(k); this.chillStacks = 0; }
    if (a === 'chill') {
      this.chillStacks++;
      if (this.chillStacks >= FREEZE_AT) { this.chillStacks = 0; this.turns.delete('chill'); this.turns.set('frozen', BATTLE_AILMENT.frozen.turns); return 'frozen'; }
    }
    if (a === 'stagger') return 'given';
    const had = this.has(a);
    this.turns.set(a, Math.max(this.turns.get(a) ?? 0, t));
    return had ? 'refreshed' : 'given';
  }

  /** A buff's amount now (0 if it hasn't got it). */
  buff(k: BuffKind): number { return this.buffs.get(k)?.amount ?? 0; }
  /**
   * Give a buff or debuff (the bigger amount and the longer time win if it's already there). Haste and Slow cancel
   * each other out: one arriving takes the other away. Returns 'cancelled' when that's all it did.
   */
  boost(k: BuffKind, amount = BUFF_INFO[k].amount, turns = BUFF_TURNS): 'given' | 'refreshed' | 'cancelled' {
    const opposite = k === 'haste' ? 'slow' : k === 'slow' ? 'haste' : null;
    if (opposite && this.buffs.has(opposite)) { this.buffs.delete(opposite); return 'cancelled'; }
    const had = this.buffs.get(k);
    this.buffs.set(k, { amount: Math.max(had?.amount ?? 0, amount), turns: Math.max(had?.turns ?? 0, Math.max(1, Math.round(turns))) });
    return had ? 'refreshed' : 'given';
  }
  /** The end of their turn: buffs tick down one; which wore off. */
  endBuffs(): BuffKind[] {
    const gone: BuffKind[] = [];
    for (const [k, b] of this.buffs) { if (b.turns - 1 <= 0) { this.buffs.delete(k); gone.push(k); } else b.turns--; }
    return gone;
  }

  /** Cure these (an item's list; 'all' cures everything but Zombie, which needs its own cure). */
  cure(list: readonly (Ailment | 'all')[]): BattleAilment[] {
    const all = list.includes('all'), out: BattleAilment[] = [];
    for (const a of this.list) {
      const hit = a === 'zombie' ? list.includes('zombie') : all || list.includes(a as Ailment) || (a === 'frozen' && list.includes('chill'));
      if (hit) { this.turns.delete(a); out.push(a); }
    }
    if (out.includes('chill') || all) this.chillStacks = 0;
    return out;
  }

  /** Hurt: Sleep ends. */
  hurt(): boolean { if (!this.has('sleep')) return false; this.turns.delete('sleep'); return true; }

  /** The start of their turn: the guard drops, burn and poison bite, and whether an ailment takes the turn. */
  startTurn(maxHp: number, bite = true): TurnStart {
    this.ward = false;
    const damage = bite ? this.bite(maxHp) : [];
    const skip = (['frozen', 'paralyze', 'sleep'] as BattleAilment[]).find((a) => this.has(a)) ?? null;
    return { damage, skip, confused: !skip && this.has('confusion') };
  }

  /** What burn and poison take (at the start of their turn, or with Rounds at the end of each round). */
  bite(maxHp: number): TurnStart['damage'] {
    const damage: TurnStart['damage'] = [];
    if (this.has('burn')) damage.push({ ailment: 'burn', amount: Math.max(1, Math.round(maxHp * BURN_SHARE)) });
    if (this.has('poison')) damage.push({ ailment: 'poison', amount: Math.max(1, Math.round(maxHp * POISON_SHARE)) });
    return damage;
  }

  /** The end of their turn: everything ticks down one; what wore off. */
  endTurn(): BattleAilment[] {
    const gone: BattleAilment[] = [];
    for (const [a, t] of this.turns) {
      if (!Number.isFinite(t)) continue;
      if (t - 1 <= 0) { this.turns.delete(a); gone.push(a); if (a === 'chill') this.chillStacks = 0; }
      else this.turns.set(a, t - 1);
    }
    return gone;
  }
}

/** Roll a hit's ailments (chances in %). Seconds set for the map become turns (about one turn per 3 seconds). */
export function rollInflicts(inflicts: readonly Inflict[] | undefined, rng: () => number = Math.random): { ailment: Ailment; turns?: number }[] {
  const out: { ailment: Ailment; turns?: number }[] = [];
  for (const f of inflicts ?? []) if (rng() * 100 < f.chance) out.push({ ailment: f.ailment, turns: f.seconds ? Math.max(1, Math.round(f.seconds / 3)) : undefined });
  return out;
}

/** Turns for an ailment carried in from the map (seconds left there). */
export const turnsFromSeconds = (a: BattleAilment, seconds: number): number => (Number.isFinite(seconds) ? Math.max(1, Math.min(BATTLE_AILMENT[a].turns || 1, Math.ceil(seconds / 3))) : Infinity);

export const ailmentName = (a: BattleAilment): string => AILMENT_INFO[a].name;
/** "Poisoned!", "Asleep!": what pops up when it lands. */
export const AILMENT_WORD: Record<BattleAilment, string> = {
  burn: 'Burned!', poison: 'Poisoned!', chill: 'Chilled!', frozen: 'Frozen!', paralyze: 'Paralyzed!', blind: 'Blinded!',
  silence: 'Silenced!', stagger: 'Staggered!', sleep: 'Asleep!', confusion: 'Confused!', zombie: 'Zombie!',
};
