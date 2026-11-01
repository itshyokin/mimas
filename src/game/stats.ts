/**
 * The player's health, magic and stamina: limits, regeneration, stamina costs of movement,
 * exhaustion and drowning. No three.js, so it can be tested on its own.
 */
import type { Database, Gauge, PlayerConfigData } from '../world/types';
import { DEFAULT_LEDGES, type LedgeRules } from './PlayerMotion';

export interface PlayerConfig {
  max: Record<Gauge, number>;
  regen: Record<Gauge, number>;
  noRegen: Record<Gauge, boolean>;
  speed: Record<'walk' | 'run' | 'wade' | 'swim' | 'crawl' | 'climb', number>;
  cost: Record<'run' | 'climb' | 'swim' | 'jump', number>;
  recoverPercent: number;
  regenDelay: number;
  drownDamage: number;
  ledges: LedgeRules;
}

export const DEFAULT_PLAYER: PlayerConfig = {
  max: { hp: 100, mp: 100, sp: 100 },
  regen: { hp: 1, mp: 2, sp: 25 },
  // Health only comes back from items and events; magic and stamina refill on their own.
  noRegen: { hp: true, mp: true, sp: false },
  speed: { walk: 3.4, run: 6.1, wade: 2.4, swim: 1.9, crawl: 1.5, climb: 1.8 },
  cost: { run: 12, climb: 15, swim: 6, jump: 15 },
  recoverPercent: 30,
  regenDelay: 0.8,
  drownDamage: 10,
  ledges: { ...DEFAULT_LEDGES },
};

/** The database's settings with defaults filled in. */
export function playerConfig(data?: PlayerConfigData): PlayerConfig {
  const d = DEFAULT_PLAYER, s = data ?? {};
  return {
    max: { ...d.max, ...s.max },
    regen: { ...d.regen, ...s.regen },
    noRegen: { ...d.noRegen, ...s.noRegen },
    speed: { ...d.speed, ...s.speed },
    cost: { ...d.cost, ...s.cost },
    recoverPercent: s.recoverPercent ?? d.recoverPercent,
    regenDelay: s.regenDelay ?? d.regenDelay,
    drownDamage: s.drownDamage ?? d.drownDamage,
    ledges: { ...d.ledges, ...s.ledges },
  };
}

export const configFromDb = (db: Database): PlayerConfig => playerConfig(db.stats);

/** What the player did this frame, for stamina. */
export interface Activity {
  running: boolean;
  climbing: boolean;
  /** In swimmable water (not wading). */
  swimming: boolean;
  jumped: boolean;
  /** Magic drained per second by an active ring power (0 when none). */
  mpDrain?: number;
}

export class PlayerStats {
  hp: number; mp: number; sp: number;
  /** Ran out of stamina: run, jump and climb are off until it refills to recoverPercent. */
  exhausted = false;
  /** Losing health to drowning right now. */
  drowning = false;
  /** Poisoned: health doesn't come back on its own. Zombie: it drains instead. */
  hpRegenBlocked = false;
  zombie = false;
  private sinceUse = 99;
  private sinceMp = 99;

  constructor(public cfg: PlayerConfig) {
    this.hp = cfg.max.hp; this.mp = cfg.max.mp; this.sp = cfg.max.sp;
  }

  get dead(): boolean { return this.hp <= 0; }

  /** Is there stamina to start a jump? */
  canJump(): boolean { return !this.exhausted && this.sp > 0; }

  update(dt: number, a: Activity): void {
    const c = this.cfg;
    let use = 0;
    if (a.running) use += c.cost.run * dt;
    if (a.climbing) use += c.cost.climb * dt;
    // Swimming no longer costs stamina (Update 109: it takes a key item instead).
    if (a.jumped) use += c.cost.jump;
    if (use > 0) {
      this.sp = Math.max(0, this.sp - use);
      this.sinceUse = 0;
      if (this.sp <= 0) this.exhausted = true;
    } else {
      this.sinceUse += dt;
      if (this.sinceUse >= c.regenDelay) this.regen('sp', dt);
    }
    if (this.exhausted && this.sp >= (c.max.sp * c.recoverPercent) / 100) this.exhausted = false;
    // Out of breath in deep water: drowning.
    this.drowning = false;
    if (this.drowning) this.hp = Math.max(0, this.hp - c.drownDamage * dt);
    else this.regen('hp', dt);
    // Magic: an active ring power drains it; it refills only after a short rest from using it.
    if (a.mpDrain && a.mpDrain > 0) {
      this.mp = Math.max(0, this.mp - a.mpDrain * dt);
      this.sinceMp = 0;
    } else {
      this.sinceMp += dt;
      if (this.sinceMp >= c.regenDelay) this.regen('mp', dt);
    }
  }

  /** Spend magic for a one-off power. Returns false (spending nothing) when there isn't enough. */
  spendMp(n: number): boolean {
    if (n <= 0) return true;
    if (this.mp + 1e-6 < n) return false;
    this.mp = Math.max(0, this.mp - n);
    this.sinceMp = 0;
    return true;
  }

  private regen(g: Gauge, dt: number): void {
    if (this.cfg.noRegen[g] || this.dead) return;
    if (g === 'hp' && this.hpRegenBlocked) return;
    if (g === 'hp' && this.zombie) { this.hp = Math.max(0, this.hp - this.cfg.regen.hp * dt); return; }
    this[g] = Math.min(this.cfg.max[g], this[g] + this.cfg.regen[g] * dt);
  }

  /** Change a gauge (events): add (negative to take away), set, or fill to the maximum. */
  change(g: Gauge, op: 'add' | 'set' | 'fill', value = 0): void {
    const v = op === 'fill' ? this.cfg.max[g] : op === 'set' ? value : this[g] + value;
    this[g] = Math.max(0, Math.min(this.cfg.max[g], v));
    if (g === 'sp' && this.exhausted && this.sp >= (this.cfg.max.sp * this.cfg.recoverPercent) / 100) this.exhausted = false;
  }

  /** Back to full (after respawning). */
  refill(): void {
    this.hp = this.cfg.max.hp; this.mp = this.cfg.max.mp; this.sp = this.cfg.max.sp;
    this.exhausted = false; this.drowning = false; this.sinceUse = 99; this.sinceMp = 99;
  }
}
