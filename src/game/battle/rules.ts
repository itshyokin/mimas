/**
 * Turn-based battle rules: turn order (FFX-style CTB or classic rounds), damage, running away and what enemies
 * choose to do. No three.js and no DOM, so it can be tested on its own.
 */
import type { Element, EnemyAction, Inflict, TurnOrder } from '../../world/types';
import { type BattleStatus, CHILL_AGILITY } from './status';
import { type ElementalDefence, elementResult } from '../elements';
import { CRIT_MULTIPLIER, finalDamage, hitChance, throughFraction } from '../attributes';

export type Side = 'party' | 'enemy';

/** One rank of a spell, as this fighter casts it: its name ("Fire II"), power (with their Magic), cost and charge turns. */
export interface SpellRank { rank: number; name: string; power: number; mp: number; charge: number }

/** A spell addition's buttons at a rank: the spell's, and one more each rank above the first (round the sequence again). */
export function spellSequence(s: Pick<BattleSpell, 'sequence'>, rank: number): import('../../world/types').FaceButton[] {
  const base = s.sequence ?? [];
  if (!base.length) return [];
  return Array.from({ length: base.length + Math.max(0, rank - 1) }, (_, i) => base[i % base.length]);
}

/** A spell a fighter can cast in battle, at any rank they know. */
export interface BattleSpell {
  /** Its own menu icon ("builtin:<name>") and tint; unset: its element's. */
  icon?: string;
  iconTint?: string;
  /** What it does, in a sentence (Database → Spells). */
  description?: string;
  /** Call-out as it goes off, and the chant while it charges. */
  sound?: string;
  chant?: string;
  id: string;
  name: string;
  /** Bolt: damage; heal: health back; support: only buffs or debuffs (`buffs`). */
  kind: 'bolt' | 'heal' | 'support';
  /** Buffs (or debuffs: Slow) it gives each target, on top of anything else it does. */
  buffs?: import('../../world/types').BuffGrant[];
  /** Support spells: aimed at the caster's side (default) or the other side. */
  supportTarget?: 'allies' | 'foes' | 'any';
  /** Chance (%) to land (default 100) against the target's spell evasion; `sure`: never misses. */
  accuracy?: number;
  sure?: boolean;
  /** A spell addition: the buttons for rank 1 (each rank adds one), the time for them, and what a clean cast does for support spells. */
  sequence?: import('../../world/types').FaceButton[];
  seqTime?: number;
  seqBonus?: 'stronger' | 'longer';
  /** The battle weather it brings, and rounds (0: the whole battle). */
  weather?: import('../../world/types').BattleWeather;
  weatherTurns?: number;
  element: Element;
  color?: string;
  targets: 'one' | 'all';
  inflicts?: Inflict[];
  /** Rank 1 up to the highest they know. */
  ranks: SpellRank[];
}

/** An Addition a hero knows: its strikes (power × their attack), rank, and what the rank adds. */
export interface BattleAddition {
  id: string;
  name: string;
  strikes: { power: number; button: 'A' | 'B' | 'X' | 'Y' | 'any'; time: number; window: number }[];
  rank: number;
  maxRank: number;
  /** Completions to the next rank (null at the top). */
  toNext: number | null;
  damage: number;
  /** Call-out when the whole string lands. */
  sound?: string;
}

/** A spell being charged: what it is, at which rank, on whom, and the caster's turns until it goes off. */
export interface Charging { spell: BattleSpell; rank: SpellRank; targets: Battler[]; left: number }

/** Everyone in a battle, on either side. */
export interface Battler {
  /** Unique in this battle ("p0" the hero, "p1"… party members, "e0"… enemies). */
  key: string;
  side: Side;
  name: string;
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  /** Attack damage before defence, its element, and whether it's a spell (Magic Defence counts). */
  attack: number;
  attackElement: Element;
  attackMagic: boolean;
  armour: number;
  magicArmour: number;
  /** How quickly turns come round now (heroes: Agility; Chill, Haste and Slow change it), and without them. */
  agility: number;
  baseAgility: number;
  /** Critical hit chance, %. */
  crit: number;
  /** Weapon hits: chance to land (%, heroes: from Dexterity; default 95) and to dodge one (%, heroes: from Agility). */
  accuracy?: number;
  evasion?: number;
  /** Chance (%) to shrug off an ailment (heroes: from Endurance). */
  resist?: number;
  /** Chance (%) to dodge a spell (heroes: from Magic Defence). */
  spellEvasion?: number;
  /** Their weapon never misses. */
  sure?: boolean;
  /** Enemies: what a weapon hit on them sounds like and what flies off (Database → Enemies → Impact). */
  impact?: { sound: import('../../audio/synth').SfxName; fx: { kind: import('../../world/types').ImpactFx; color: string }[] };
  /** Bosses with a gauge (stat blocks on): 0 … 100; full, their next move hits half again as hard. */
  overdrive?: number;
  /** Their overdrive is let loose this turn. */
  surging?: boolean;
  /** Heroes: extra % of their health back when they Guard (Steady Guard). */
  guardBonus?: number;
  /** Their attack is a bow shot (Dexterity buffs raise it rather than Strength). */
  ranged?: boolean;
  /** The numbers before buffs and debuffs (kept the first time they're worked out). */
  plain?: { attack: number; armour: number; magicArmour: number; crit: number; accuracy: number; evasion: number; resist: number };
  /** How much its hits vary either side (0.1 = ±10%, the default). */
  spread?: number;
  defence: ElementalDefence;
  /** Heroes' element stones: percent more to hits of each element, and to spells of their own elements. */
  affinity?: { bonus: Partial<Record<Element, number>>; elements: Element[]; sameType: number };
  spells: BattleSpell[];
  /** CTB: ticks until this fighter's next turn. */
  ct: number;
  /** Guarding until their next turn (half damage). */
  guarding: boolean;
  /** Bosses: no running away. */
  boss?: boolean;
  /** Ailments on them, and their guard's ward (no new ailments until their next turn). */
  status: BattleStatus;
  /** Ailments their attack can give. */
  inflicts?: Inflict[];
  /** Enemies: what else they can do, how often they just attack, and whether that attack breaks a spell being charged. */
  actions?: EnemyAction[];
  attackWeight?: number;
  counterspell?: boolean;
  /** Heroes: their Additions and the one Attack uses (when set per hero). */
  additions?: BattleAddition[];
  addition?: string;
  /** A plain attack fired from where they stand (a bow), not run in for. */
  shoots?: boolean;
  /** A spell they're charging. */
  charging?: Charging | null;
}

/** Accuracy of a fighter whose own isn't set. */
export const BASE_ACCURACY = 95;

/**
 * Set a fighter's numbers from what's on them: Chill, Haste and Slow change their turn speed; buffs raise (debuffs
 * lower) their stats. Strength (Dexterity for a bow) and Magic: 2% damage a point; Defence and Magic Defence add to
 * their defences; Agility: speed and dodging; Dexterity: aim and critical hits; Endurance: resisting ailments.
 */
export function refreshAgility(b: Battler): void {
  const st = b.status, p = (b.plain ??= { attack: b.attack, armour: b.armour, magicArmour: b.magicArmour, crit: b.crit, accuracy: b.accuracy ?? BASE_ACCURACY, evasion: b.evasion ?? 0, resist: b.resist ?? 0 });
  const agi = st.buff('agi'), dex = st.buff('dex');
  let a = b.baseAgility * (1 + agi / (b.baseAgility + 20));
  if (st.chilled) a *= CHILL_AGILITY;
  a *= (1 + st.buff('haste') / 100) * Math.max(0.2, 1 - st.buff('slow') / 100);
  b.agility = Math.max(1, a);
  const up = b.attackMagic ? st.buff('mag') : b.ranged ? dex : st.buff('str');
  b.attack = p.attack * Math.max(0.1, 1 + up / 50);
  b.armour = p.armour + st.buff('def');
  b.magicArmour = p.magicArmour + st.buff('mdf');
  b.crit = Math.max(0, Math.min(100, p.crit + st.buff('crit') + dex * 0.25));
  b.accuracy = p.accuracy + dex * 0.5 + st.buff('acc') - st.buff('accDown');
  b.evasion = Math.max(0, Math.min(60, p.evasion + agi * 0.5 + st.buff('eva') - st.buff('evaDown')));
  b.resist = Math.max(0, Math.min(80, p.resist + st.buff('end') * 1.5));
}

/** A fighter's Magic buff as a damage multiplier for their spells (2% a point). */
export const spellBoost = (b: Battler): number => Math.max(0.1, 1 + b.status.buff('mag') / 50);
/** Health Regeneration gives back at the end of each of their turns. */
export const regenAmount = (b: Battler): number => (b.status.buff('regen') > 0 ? Math.max(1, Math.round(b.maxHp * 0.06 + b.status.buff('regen') * 2)) : 0);

export const isUp = (b: Battler): boolean => b.hp > 0;

/* ------------------------------------------------------------------ turn order */

/** Rank: how heavy an action is. Light actions bring the next turn round sooner (FFX: Defend 2, Attack 3). */
/** Casting is quicker than attacking; a spell that charges costs this each turn it charges too. */
export const RANK = { attack: 3, magic: 2, item: 2, guard: 2, flee: 2 } as const;
export type ActionKind = keyof typeof RANK;

/** Ticks one rank of action costs at this agility (agility 10: 60; 30: 36; 50: 26). */
export const tickOf = (agility: number): number => 1800 / (Math.max(1, agility) + 20);
export const delayOf = (agility: number, rank: number): number => tickOf(agility) * rank;

/** How a battle opened: the party got the jump (hit first), normally, or the enemies did. */
export type Opening = 'preemptive' | 'normal' | 'ambush';

/** Where everyone's counter starts: a little random, and well behind for the side that was caught out. */
export function startCounters(all: Battler[], opening: Opening, rng: () => number = Math.random): void {
  for (const b of all) {
    let ct = delayOf(b.agility, RANK.attack) * (0.6 + rng() * 0.5);
    if (opening === 'preemptive' && b.side === 'enemy') ct += delayOf(b.agility, RANK.attack);
    if (opening === 'ambush' && b.side === 'party') ct += delayOf(b.agility, RANK.attack);
    b.ct = ct;
  }
}

/** CTB: who acts next (the lowest counter; the party wins ties), and how far the clock moves to get there. */
export function nextUp(all: Battler[]): Battler | null {
  let best: Battler | null = null;
  for (const b of all) {
    if (!isUp(b)) continue;
    if (!best || b.ct < best.ct - 1e-9 || (Math.abs(b.ct - best.ct) < 1e-9 && b.side === 'party' && best.side === 'enemy')) best = b;
  }
  return best;
}

/** Run the clock until `who`'s turn: everyone's counter goes down by theirs. */
export function advanceTo(all: Battler[], who: Battler): void {
  const by = who.ct;
  for (const b of all) if (isUp(b)) b.ct = Math.max(0, b.ct - by);
}

/** After acting, a fighter waits this action's delay for their next turn. */
export function spend(b: Battler, rank: number): void { b.ct += delayOf(b.agility, rank); }

/**
 * CTB forecast: the next `n` turns, assuming everyone after the one acting uses a normal (rank 3) action.
 * `acting` with `rank`: the fighter choosing now and the weight of what they're pointing at (so the bar shows
 * what a lighter action would change, like FFX).
 */
export function forecast(all: Battler[], n: number, acting?: Battler, rank: number = RANK.attack): Battler[] {
  const sim = all.filter(isUp).map((b) => ({ b, ct: b.ct }));
  const out: Battler[] = [];
  if (acting) {
    out.push(acting);
    const s = sim.find((x) => x.b === acting);
    if (s) s.ct += delayOf(acting.agility, rank);
  }
  while (out.length < n && sim.length) {
    let best = sim[0];
    for (const s of sim) if (s.ct < best.ct - 1e-9 || (Math.abs(s.ct - best.ct) < 1e-9 && s.b.side === 'party' && best.b.side === 'enemy')) best = s;
    const by = best.ct;
    for (const s of sim) s.ct -= by;
    out.push(best.b);
    best.ct += delayOf(best.b.agility, RANK.attack);
  }
  return out;
}

/** Rounds: everyone standing, fastest first (a little luck in it); the party's openings act first in round one. */
export function roundOrder(all: Battler[], opening: Opening = 'normal', rng: () => number = Math.random): Battler[] {
  const up = all.filter(isUp).map((b) => ({ b, k: b.agility * (0.9 + rng() * 0.2) }));
  up.sort((a, c) => c.k - a.k);
  const order = up.map((x) => x.b);
  if (opening === 'preemptive') return order.filter((b) => b.side === 'party');
  if (opening === 'ambush') return order.filter((b) => b.side === 'enemy');
  return order;
}

export const turnOrderName: Record<TurnOrder, string> = { ctb: 'Conditional turns (FFX)', rounds: 'Rounds (classic)' };

/* ------------------------------------------------------------------ damage */

export interface HitResult {
  /** 'miss': a weapon hit that was dodged or went wide. */
  kind: 'hit' | 'immune' | 'absorb' | 'miss';
  amount: number;
  crit: boolean;
  label: 'Weak!' | 'Resist' | null;
}

/**
 * The weather's heat and cold in battle (set by the game each frame): fire hits harder in a heat wave and water (the
 * cold element) in the cold; foes of water are softer in the heat and foes of fire in the cold. `strength`: the most
 * it changes a hit (0.25 = 25%).
 */
export const combatClimate = { temp: 70, strength: 0.25 };

/** What battle weather does to each element's damage (rain: water ×1.5, fire ×0.5…). */
export const WEATHER_EFFECT: Record<import('../../world/types').BattleWeather, { name: string; icon: string; does: Partial<Record<Element, number>>; text: string }> = {
  none: { name: 'Clear', icon: '', does: {}, text: '' },
  rain: { name: 'Rain', icon: '☔', does: { water: 1.5, fire: 0.5 }, text: 'Water moves are stronger, fire weaker' },
  storm: { name: 'Thunderstorm', icon: '⛈', does: { shock: 1.5, water: 1.3, fire: 0.5 }, text: 'Shock and water moves are stronger, fire weaker' },
  snow: { name: 'Snow', icon: '❄', does: { water: 1.2, fire: 0.8 }, text: 'Water (ice) moves are a little stronger, fire weaker' },
  blizzard: { name: 'Blizzard', icon: '🌨', does: { water: 1.5, fire: 0.6 }, text: 'Water (ice) moves are stronger, fire weaker' },
  sun: { name: 'Harsh sunlight', icon: '☀', does: { fire: 1.5, water: 0.5 }, text: 'Fire moves are stronger, water weaker' },
  sandstorm: { name: 'Sandstorm', icon: '🌪', does: { earth: 1.5, nature: 0.8 }, text: 'Earth moves are stronger, nature weaker' },
};
/** The battle's weather now (set by the battle). */
export const battleWeather: { kind: import('../../world/types').BattleWeather } = { kind: 'none' };

function climateFactor(element: Element, target: Battler): number {
  const w = WEATHER_EFFECT[battleWeather.kind]?.does[element] ?? 1;
  return w * heatFactor(element, target);
}

function heatFactor(element: Element, target: Battler): number {
  const s = combatClimate.strength, t = combatClimate.temp;
  if (!s) return 1;
  const heat = Math.max(0, Math.min(1, (t - 85) / 20)), cold = Math.max(0, Math.min(1, (40 - t) / 30));
  const els = target.defence?.elements ?? [];
  let f = 1;
  if (element === 'fire') f *= 1 + heat * s - cold * s * 0.6;
  if (element === 'water') f *= 1 + cold * s - heat * s * 0.6;
  if (els.includes('water')) f *= 1 + heat * s * 0.6;
  if (els.includes('fire')) f *= 1 + cold * s * 0.6;
  return f;
}

/** One hit: element, a little spread, a critical, defence (or magic defence), guarding, then the damage scale. */
export function strike(power: number, element: Element, magic: boolean, by: Pick<Battler, 'crit' | 'spread'> & Partial<Pick<Battler, 'accuracy' | 'sure' | 'affinity'>> & { spellAccuracy?: number; spellSure?: boolean }, target: Battler, scale = 1, rng: () => number = Math.random): HitResult {
  // Hits can miss: a weapon's accuracy against the target's evasion; a spell's against their spell evasion (Magic
  // Defence). "Never misses" skips it.
  if (!magic && !by.sure && rng() * 100 >= hitChance(by.accuracy ?? BASE_ACCURACY, target.evasion ?? 0)) return { kind: 'miss', amount: 0, crit: false, label: null };
  if (magic && !by.spellSure && rng() * 100 >= hitChance(by.spellAccuracy ?? 100, target.spellEvasion ?? 0)) return { kind: 'miss', amount: 0, crit: false, label: null };
  const el = elementResult(element, target.defence);
  if (el.kind === 'immune') return { kind: 'immune', amount: 0, crit: false, label: null };
  const sp = Math.max(0, Math.min(0.9, by.spread ?? 0.1));
  let dmg = power * scale * (1 - sp + rng() * 2 * sp) * climateFactor(element, target);
  // Element stones: hits of the hero's elements are stronger, and spells of them stronger again.
  const aff = by.affinity;
  if (aff && element !== 'neutral') { dmg *= 1 + (aff.bonus[element] ?? 0) / 100; if (magic && aff.elements.includes(element)) dmg *= 1 + aff.sameType / 100; }
  if (el.kind === 'absorb' && !target.status.zombie) return { kind: 'absorb', amount: finalDamage(dmg), crit: false, label: null };
  const mult = el.kind === 'hit' ? el.mult : 1;
  dmg *= mult;
  const crit = rng() * 100 < by.crit;
  if (crit) dmg *= CRIT_MULTIPLIER;
  dmg *= throughFraction(magic ? target.magicArmour : target.armour);
  if (target.guarding) dmg *= 0.5;
  return { kind: 'hit', amount: finalDamage(dmg), crit, label: el.kind === 'hit' ? el.label : null };
}

/** Health given back by a heal (the undead are hurt by it instead: a negative number). */
export function healAmount(power: number, target: Battler, rng: () => number = Math.random): number {
  const n = Math.max(1, Math.round(power * (0.95 + rng() * 0.1)));
  return target.status.zombie ? -n : n;
}

/* ------------------------------------------------------------------ running away, enemy choices */

/** Chance (0 … 1) to get away: the base, plus 2% for each point the party is faster on average. */
export function fleeChance(party: Battler[], enemies: Battler[], base: number): number {
  const avg = (l: Battler[]) => { const u = l.filter(isUp); return u.length ? u.reduce((s, b) => s + b.agility, 0) / u.length : 0; };
  if (enemies.some((e) => isUp(e) && e.boss)) return 0;
  return Math.max(0.05, Math.min(0.95, (base + (avg(party) - avg(enemies)) * 2) / 100));
}

/** What an enemy does on its turn: its plain attack (action null) or one of its actions, and on whom. */
export interface EnemyMove { action: EnemyAction | null; targets: Battler[] }

/** Someone standing, the hurt a little more often. */
function pickWeak(list: Battler[], rng: () => number): Battler {
  const w = list.map((b) => 1 + (1 - b.hp / Math.max(1, b.maxHp)));
  let r = rng() * w.reduce((a, x) => a + x, 0);
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) return list[i]; }
  return list[list.length - 1];
}

/**
 * An enemy's choice: its plain attack (weight `attackWeight`, default 1) or one of its actions (each by its weight,
 * if its health condition holds; spells and heals not while silenced; heals only when someone on its side is hurt).
 */
export function enemyChoice(e: Battler, party: Battler[], friends: Battler[], rng: () => number = Math.random): EnemyMove | null {
  const foes = party.filter(isUp), mates = friends.filter(isUp);
  if (!foes.length) return null;
  const hurt = mates.filter((m) => m.hp < m.maxHp * 0.7);
  const options: { action: EnemyAction | null; weight: number }[] = [];
  const aw = e.attackWeight ?? 1;
  if (aw > 0) options.push({ action: null, weight: aw });
  for (const a of e.actions ?? []) {
    const w = a.weight ?? 1;
    if (w <= 0) continue;
    if (a.hpBelow !== undefined && e.hp / Math.max(1, e.maxHp) * 100 >= a.hpBelow) continue;
    if ((a.kind === 'spell' || a.kind === 'heal' || a.kind === 'buff') && e.status.silenced) continue;
    if (a.kind === 'buff' && !a.buffs?.length && !a.weather) continue;
    // A buff it (or its side) already has, or the weather it already brought, isn't worth a turn.
    if (a.kind === 'buff' && a.buffs?.length && a.buffTarget !== 'foes' && (a.buffTarget === 'allies' ? mates : [e]).every((m) => a.buffs!.every((g) => m.status.buff(g.buff) > 0)) && (!a.weather || battleWeather.kind === a.weather)) continue;
    if (a.kind === 'buff' && !a.buffs?.length && a.weather && battleWeather.kind === a.weather) continue;
    if (a.kind === 'heal' && !hurt.length) continue;
    options.push({ action: a, weight: w });
  }
  if (!options.length) options.push({ action: null, weight: 1 });
  const pick = weighted(options, rng)!;
  const a = pick.action;
  if (a?.kind === 'guard') return { action: a, targets: [e] };
  if (a?.kind === 'buff') {
    if (a.buffTarget === 'foes') return { action: a, targets: a.targets === 'all' ? foes : [pickWeak(foes, rng)] };
    return { action: a, targets: a.buffTarget === 'allies' ? mates : [e] };
  }
  if (a?.kind === 'heal') return { action: a, targets: [hurt.sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0]] };
  if (a?.targets === 'all') return { action: a, targets: foes };
  return { action: a, targets: [pickWeak(foes, rng)] };
}

/** An enemy's agility when Database → Enemies leaves it unset: from how fast it moves on the map (1.6 tiles/s: 10). */
export const enemyAgility = (def: { agility?: number; speed: number }): number => Math.max(1, Math.round(def.agility ?? def.speed * 6.25));

/** Pick from weighted entries. */
export function weighted<T extends { weight?: number }>(list: T[], rng: () => number = Math.random): T | undefined {
  const total = list.reduce((s, x) => s + Math.max(0, x.weight ?? 1), 0);
  if (total <= 0) return list[0];
  let r = rng() * total;
  for (const x of list) { r -= Math.max(0, x.weight ?? 1); if (r <= 0) return x; }
  return list[list.length - 1];
}
