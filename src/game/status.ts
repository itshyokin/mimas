/**
 * Status effects: ailments (burn, poison, chill → frozen, paralyze, blind, silence, stagger, sleep, confusion,
 * zombie) and buffs (raised stats, crit chance, regeneration), each with a time left. Used by the hero and by
 * enemies. No three.js, so it can be tested on its own.
 *
 * Rules: hitting again refreshes an effect rather than stacking it, except Chill, which builds up and freezes at
 * three. Sleep ends when hurt. Zombie can't be given anything else (it clears other ailments when it arrives), makes
 * healing hurt, can't be killed outright, and only goes away with an item that cures it (or after its time, if it
 * has one). Bosses shake ailments off in half the time.
 */
import type { Ailment, BuffKind } from '../world/types';

export const AILMENTS: Ailment[] = ['burn', 'poison', 'chill', 'paralyze', 'blind', 'silence', 'stagger', 'sleep', 'confusion', 'zombie'];
export const BUFFS: BuffKind[] = ['crit', 'str', 'dex', 'agi', 'end', 'def', 'mag', 'mdf', 'regen', 'haste', 'slow', 'acc', 'eva', 'accDown', 'evaDown', 'statGuard'];
/** Buffs that make things worse (they just wear off). */
export const DEBUFFS: ReadonlySet<BuffKind> = new Set(['slow', 'accDown', 'evaDown']);

/** The kind of effect: an ailment, Frozen (from Chill), or a buff. */
export type EffectId = Ailment | 'frozen' | `buff:${BuffKind}`;

export const AILMENT_INFO: Record<Ailment | 'frozen', { name: string; does: string; seconds: number; color: string }> = {
  burn: { name: 'Burn', does: 'Loses health every second', seconds: 6, color: '#ff7a3a' },
  poison: { name: 'Poison', does: 'Slowly loses health; health doesn’t come back on its own', seconds: 14, color: '#8ee05a' },
  chill: { name: 'Chill', does: 'Slower; three chills freeze solid', seconds: 6, color: '#9ad8ff' },
  frozen: { name: 'Frozen', does: 'Can’t move or act', seconds: 2.5, color: '#cfefff' },
  paralyze: { name: 'Paralyze', does: 'Can’t move or act for a moment; hits don’t break it', seconds: 1.6, color: '#ffe04a' },
  blind: { name: 'Blind', does: 'Attacks often miss; can’t see far', seconds: 8, color: '#8a8aa0' },
  silence: { name: 'Silence', does: 'Can’t cast spells', seconds: 8, color: '#c8a0ff' },
  stagger: { name: 'Stagger', does: 'Knocked off balance for a moment', seconds: 0.7, color: '#ffd0a0' },
  sleep: { name: 'Sleep', does: 'Can’t move or act until hurt or it wears off', seconds: 9, color: '#a0b4ff' },
  confusion: { name: 'Confusion', does: 'Moves the wrong way; enemies wander and may hit each other', seconds: 6, color: '#ff9ad8' },
  zombie: { name: 'Zombie', does: 'Healing hurts; can’t be killed outright or given other ailments; only special items cure it', seconds: 0, color: '#9ac080' },
};

export const BUFF_INFO: Record<BuffKind, { name: string; unit: string; amount: number; seconds: number; color: string }> = {
  crit: { name: 'Critical hits', unit: '%', amount: 15, seconds: 60, color: '#ffd84a' },
  str: { name: 'Strength', unit: '', amount: 5, seconds: 60, color: '#ff9a6a' },
  dex: { name: 'Dexterity', unit: '', amount: 5, seconds: 60, color: '#7ce08a' },
  agi: { name: 'Agility', unit: '', amount: 5, seconds: 60, color: '#f0e07a' },
  end: { name: 'Endurance', unit: '', amount: 5, seconds: 60, color: '#e0a86a' },
  def: { name: 'Defence', unit: '', amount: 5, seconds: 60, color: '#9ab8d8' },
  mag: { name: 'Magic', unit: '', amount: 5, seconds: 60, color: '#b48aff' },
  mdf: { name: 'Magic Defence', unit: '', amount: 5, seconds: 60, color: '#8ad8ff' },
  regen: { name: 'Regeneration', unit: ' HP/s', amount: 2, seconds: 30, color: '#7cf0a0' },
  haste: { name: 'Haste', unit: '% faster', amount: 50, seconds: 30, color: '#5ae0ff' },
  slow: { name: 'Slow', unit: '% slower', amount: 40, seconds: 20, color: '#c07a5a' },
  acc: { name: 'Accuracy', unit: '% to hit', amount: 15, seconds: 60, color: '#ffe8a0' },
  eva: { name: 'Evasion', unit: '% to dodge', amount: 15, seconds: 60, color: '#a0ffe8' },
  accDown: { name: 'Accuracy down', unit: '% to hit', amount: 20, seconds: 20, color: '#a08a6a' },
  evaDown: { name: 'Evasion down', unit: '% to dodge', amount: 20, seconds: 20, color: '#6a8aa0' },
  statGuard: { name: 'Stat guard', unit: '', amount: 1, seconds: 60, color: '#e8f4ff' },
};

/** Chill stacks needed to freeze. */
export const FREEZE_AT = 3;
/** Burn and poison: share of maximum health lost per second (at least 1). */
export const BURN_RATE = 0.05, POISON_RATE = 0.02;
/** Blind: chance an attack misses. */
export const BLIND_MISS = 0.5;
/** Chill: speed while chilled. */
export const CHILL_SPEED = 0.6;

export interface Effect {
  id: EffectId;
  /** Seconds left (Infinity: until cured). */
  left: number;
  /** The whole time it was given for (for HUD rings). */
  total: number;
  /** Chill stacks. */
  stacks?: number;
  /** Buffs: how much. Confusion: which way directions are scrambled (0 – 2). */
  amount?: number;
}

export type ApplyResult = 'applied' | 'refreshed' | 'frozen' | 'immune' | 'blocked';

export interface StatusOwner {
  /** Ailments it can't get. */
  resists?: readonly Ailment[];
  /** Always a zombie (undead). */
  undead?: boolean;
  boss?: boolean;
}

export class StatusSet {
  readonly list: Effect[] = [];

  constructor(private owner: StatusOwner = {}) {}

  setOwner(o: StatusOwner): void { this.owner = o; }

  get(id: EffectId): Effect | undefined { return this.list.find((e) => e.id === id); }
  has(id: EffectId): boolean { return !!this.get(id); }

  /** A zombie: given Zombie, or undead. */
  get zombie(): boolean { return !!this.owner.undead || this.has('zombie'); }
  /** Can't move or act. */
  get stunned(): boolean { return this.has('frozen') || this.has('paralyze') || this.has('sleep') || this.has('stagger'); }
  get silenced(): boolean { return this.has('silence'); }
  get blind(): boolean { return this.has('blind'); }
  get confused(): boolean { return this.has('confusion'); }
  /** Movement and attack speed. */
  /** Speed: Chill slows, Haste speeds up, Slow slows down. */
  get speed(): number { return (this.has('chill') ? CHILL_SPEED : 1) * (1 + this.buff('haste') / 100) * Math.max(0.2, 1 - this.buff('slow') / 100); }
  /** Health doesn't come back on its own. */
  get noRegen(): boolean { return this.has('poison'); }
  buff(k: BuffKind): number { return this.get(`buff:${k}`)?.amount ?? 0; }

  /** Give an ailment for `seconds` (0 or missing: its usual time; Zombie's 0 lasts until cured). */
  inflict(a: Ailment, seconds?: number): ApplyResult {
    const o = this.owner;
    if (o.resists?.includes(a)) return 'immune';
    // Zombies can't be given anything else (and undead are zombies already).
    if (this.zombie && a !== 'zombie') return 'immune';
    if (a === 'zombie' && o.undead) return 'immune';
    const info = AILMENT_INFO[a];
    let t = seconds && seconds > 0 ? seconds : info.seconds;
    if (a === 'zombie' && !(seconds && seconds > 0)) t = Infinity;
    if (o.boss && Number.isFinite(t)) t *= 0.5;
    if (a === 'zombie') {
      // Undeath washes out every other ailment (buffs stay).
      for (let i = this.list.length - 1; i >= 0; i--) if (!this.list[i].id.startsWith('buff:')) this.list.splice(i, 1);
    }
    if (a === 'chill') {
      if (this.has('frozen')) return 'blocked';
      const c = this.get('chill');
      const stacks = (c?.stacks ?? 0) + 1;
      if (stacks >= FREEZE_AT) {
        this.remove('chill');
        const f = AILMENT_INFO.frozen.seconds * (o.boss ? 0.5 : 1);
        this.list.push({ id: 'frozen', left: f, total: f });
        return 'frozen';
      }
      if (c) { c.stacks = stacks; c.left = c.total = t; return 'refreshed'; }
      this.list.push({ id: 'chill', left: t, total: t, stacks });
      return 'applied';
    }
    const cur = this.get(a);
    if (cur) { cur.left = Math.max(cur.left, t); cur.total = cur.left; return 'refreshed'; }
    this.list.push({ id: a, left: t, total: t, ...(a === 'confusion' ? { amount: Math.floor(Math.random() * 3) } : {}) });
    return 'applied';
  }

  /** A buff (refreshing one already there; the bigger amount wins). */
  boost(k: BuffKind, amount?: number, seconds?: number): void {
    const info = BUFF_INFO[k], id = `buff:${k}` as const;
    const a = amount ?? info.amount, t = seconds && seconds > 0 ? seconds : info.seconds;
    const cur = this.get(id);
    if (cur) { cur.amount = Math.max(cur.amount ?? 0, a); cur.left = Math.max(cur.left, t); cur.total = cur.left; return; }
    this.list.push({ id, left: t, total: t, amount: a });
  }

  remove(id: EffectId): boolean {
    const i = this.list.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.list.splice(i, 1);
    return true;
  }

  /** Cure these ailments (Chill cures Frozen too). Zombie only when it's listed. Returns what was cured. */
  cure(list: readonly (Ailment | 'all')[]): EffectId[] {
    const all = list.includes('all');
    const out: EffectId[] = [];
    for (let i = this.list.length - 1; i >= 0; i--) {
      const id = this.list[i].id;
      if (id.startsWith('buff:')) continue;
      const hit = id === 'zombie' ? list.includes('zombie') : all || list.includes(id as Ailment) || (id === 'frozen' && list.includes('chill'));
      if (hit) { out.push(id); this.list.splice(i, 1); }
    }
    return out;
  }

  /** Hurt: Sleep ends. */
  hurt(): void { this.remove('sleep'); }

  /** Clear everything (death, a new game). */
  clear(): void { this.list.length = 0; }

  /**
   * Time passes: effects run out. Returns the health change this tick (burn, poison: lost; regen: gained, or lost
   * for a zombie), counted in whole points each second.
   */
  tick(dt: number, maxHp: number): { hp: number; expired: EffectId[] } {
    const expired: EffectId[] = [];
    let hp = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const before = e.left;
      e.left -= dt;
      // Damage and healing land once a second (on each whole second passed).
      const ticks = Number.isFinite(before) ? Math.floor(Math.max(0, e.total - e.left)) - Math.floor(Math.max(0, e.total - before)) : 0;
      if (ticks > 0) {
        if (e.id === 'burn') hp -= ticks * Math.max(1, Math.round(maxHp * BURN_RATE));
        else if (e.id === 'poison') hp -= ticks * Math.max(1, Math.round(maxHp * POISON_RATE));
        else if (e.id === 'buff:regen') hp += (this.zombie ? -1 : 1) * ticks * Math.max(1, Math.round(e.amount ?? 1));
      }
      if (e.left <= 0) { expired.push(e.id); this.list.splice(i, 1); }
    }
    return { hp, expired };
  }

  /** Healing of `amount`: a zombie takes it as damage instead. */
  healing(amount: number): number { return this.zombie ? -amount : amount; }

  /** Turn movement for Confusion: the stick or keys mean something else. */
  scramble(dx: number, dz: number): [number, number] {
    const c = this.get('confusion');
    if (!c) return [dx, dz];
    if (c.amount === 0) return [-dx, -dz];
    if (c.amount === 1) return [dz, dx];
    return [-dz, -dx];
  }

  toJSON(): { id: EffectId; left: number | null; total: number | null; stacks?: number; amount?: number }[] {
    return this.list.map((e) => ({ id: e.id, left: Number.isFinite(e.left) ? e.left : null, total: Number.isFinite(e.total) ? e.total : null,
      ...(e.stacks ? { stacks: e.stacks } : {}), ...(e.amount !== undefined ? { amount: e.amount } : {}) }));
  }

  load(d?: { id: EffectId; left: number | null; total: number | null; stacks?: number; amount?: number }[]): void {
    this.list.length = 0;
    for (const e of d ?? []) this.list.push({ id: e.id, left: e.left ?? Infinity, total: e.total ?? Infinity, ...(e.stacks ? { stacks: e.stacks } : {}), ...(e.amount !== undefined ? { amount: e.amount } : {}) });
  }
}

/** "Strength up", or just "Haste" / "Slow" for the ones that aren't a raised number. */
export const buffLabel = (k: BuffKind): string => (k === 'haste' || k === 'slow' || k === 'statGuard' ? BUFF_INFO[k].name : `${BUFF_INFO[k].name} up`);
export const effectName = (id: EffectId): string => (id.startsWith('buff:') ? buffLabel(id.slice(5) as BuffKind) : AILMENT_INFO[id as Ailment | 'frozen'].name);
export const effectColor = (id: EffectId): string => (id.startsWith('buff:') ? BUFF_INFO[id.slice(5) as BuffKind].color : AILMENT_INFO[id as Ailment | 'frozen'].color);

/** Short tags for buffs and debuffs, shown under an arrow (▲ STR, ▼ SPD). */
const BUFF_TAG: Record<BuffKind, string> = { crit: 'CRT', str: 'STR', dex: 'DEX', agi: 'AGI', end: 'END', def: 'DEF', mag: 'MAG', mdf: 'MDF', regen: 'RGN', haste: 'SPD', slow: 'SPD', acc: 'ACC', eva: 'EVA', accDown: 'ACC', evaDown: 'EVA', statGuard: 'GRD' };
/** A buff as an arrow and a tag: up for a boost, down for a debuff (Slow, Accuracy down, a lowered stat). */
export function buffChip(k: BuffKind, amount = 1): { tag: string; up: boolean; name: string } {
  const up = !DEBUFFS.has(k) && amount >= 0;
  return { tag: BUFF_TAG[k], up, name: up ? buffLabel(k) : k === 'slow' || k === 'accDown' || k === 'evaDown' ? BUFF_INFO[k].name : `${BUFF_INFO[k].name} down` };
}
