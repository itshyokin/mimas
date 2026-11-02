/**
 * Mimas: the GBA game's party (Pokémon style: up to six, the first one out in battle). Each hero keeps their level,
 * EXP, health, magic, stats (from the Database, growing a level by their ranks), their gear (what they wear adds to
 * their stats and defence) and their moves: up to four Additions, the FIGHT list. Spells cost MP; moves don't.
 *
 * The numbers follow Saturn's: health is the Database's base plus Endurance's bonus, attack is the weapon's (or bare
 * hands') damage × its class × Strength, defence is armour plus the Defence stat.
 */
import { additionBonus, additionList, additionRank, additionToNext, findAddition, masterAddition, rankName, spellAtRank, spellList, spellMaxRank } from '../game/abilities';
import { ailmentResist, ATTR_MAX, ATTRS, attrsFrom, enduranceHp, evasionOf, heroTotals, powerMultiplier, type Attrs, type HeroTotals } from '../game/attributes';
import type { BattleAddition, BattleSpell } from '../game/battle/rules';
import { xpToNext, type CombatConfig } from '../game/combat/config';
import { configFromDb } from '../game/stats';
import { levelGains, ranksOf } from '../game/statRanks';
import type { AbilityData, Database, EquipSlot, HeroDef, ItemDef } from '../world/types';

export const MAX_MOVES = 4;
export const MAX_PARTY = 6;

export interface Member {
  id: string;
  def: HeroDef;
  level: number;
  xp: number;
  hp: number;
  mp: number;
  stats: Attrs;
  abil: AbilityData;
  equip: Partial<Record<EquipSlot, string>>;
  /** The FIGHT list: up to four Addition ids, in order. */
  moves: string[];
}

/** What a member saves as (and loads from). */
export type MemberSave = Omit<Member, 'def'>;

type Items = (id: string) => ItemDef | undefined;

/** A hero joining at this level: their Database stats grown by their ranks, their starting moves, spells and gear. */
export function newMember(db: Database, def: HeroDef, level: number): Member {
  const stats = attrsFrom(def.stats);
  const gains = levelGains(ranksOf(def.ranks, undefined));
  for (let l = 1; l < level; l++) for (const k of ATTRS) stats[k] = Math.min(ATTR_MAX, stats[k] + gains[k]);
  const abil: AbilityData = { spells: { ...(def.spells ?? {}) }, additions: {} };
  const m: Member = { id: def.id, def, level, xp: 0, hp: 1, mp: 0, stats, abil, equip: { ...(def.gear ?? {}) }, moves: [] };
  if (!def.noAdditions) {
    const list = additionList(db);
    const first = list.find((d) => d.id === def.defaultAddition) ?? (def.additions?.length ? undefined : list.find((d) => d.id === 'quick_strike') ?? list[0]);
    for (const id of [...(first ? [first.id] : []), ...(def.additions ?? [])]) {
      if (!findAddition(db, id) || id in abil.additions!) continue;
      abil.additions![id] = 0;
      if (m.moves.length < MAX_MOVES) m.moves.push(id);
    }
  }
  const max = maxOf(db, m, () => undefined);
  m.hp = max.hp; m.mp = max.mp;
  return m;
}

export function gearOf(m: Member, items: Items): (ItemDef | undefined)[] {
  return Object.values(m.equip).map((id) => (id ? items(id) : undefined));
}

export function totalsOf(m: Member, items: Items): HeroTotals {
  return heroTotals(m.stats, gearOf(m, items).map((g) => (g ? { defense: g.defense, magicDefense: g.magicDefense, bonus: g.bonus, crit: g.crit, slot: g.slot } : undefined)));
}

export function maxOf(db: Database, m: Member, items: Items): { hp: number; mp: number } {
  const base = configFromDb(db).max, t = totalsOf(m, items);
  return { hp: Math.max(1, base.hp + enduranceHp(t.attrs.end)), mp: base.mp };
}

/** Their attack: the weapon's damage (or bare hands') × its class × Strength. */
export function attackOf(cfg: CombatConfig, m: Member, items: Items): number {
  const t = totalsOf(m, items), w = m.equip.weapon ? items(m.equip.weapon) : undefined;
  const cls = w?.weapon && w.weapon.class !== 'bow' ? w.weapon.class : 'unarmed';
  return (cls === 'unarmed' ? cfg.unarmedDamage : w!.weapon!.damage) * cfg.classes[cls].damage * powerMultiplier(t.attrs.str);
}

export function battleNumbers(cfg: CombatConfig, m: Member, items: Items) {
  const t = totalsOf(m, items);
  return { attack: attackOf(cfg, m, items), armour: t.armour, magicArmour: t.magicArmour, agility: t.attrs.agi, crit: t.crit, evasion: evasionOf(t.attrs.agi), spellEvasion: evasionOf(t.attrs.mdf), resist: ailmentResist(t.attrs.end), totals: t };
}

/** Their FIGHT list for a battle (no button prompts: every strike lands). */
export function battleMoves(db: Database, m: Member): BattleAddition[] {
  return m.moves.flatMap((id) => {
    const d = findAddition(db, id);
    if (!d) return [];
    const uses = m.abil.additions?.[id] ?? 0, rank = additionRank(d, uses), bonus = additionBonus(d, rank);
    return [{ id: d.id, name: d.name, sound: d.sound, rank, maxRank: d.maxRank ?? 5, toNext: additionToNext(d, uses), damage: bonus.damage,
      element: d.element, inflicts: d.inflicts, look: { effect: d.effect, burst: d.burst, element: d.element, inflicts: d.inflicts },
      strikes: d.strikes.map((x) => ({ power: x.power, button: x.button ?? 'A', time: Math.max(0.25, Math.min(0.45, x.time ?? 0.45)), window: Math.max(0.06, (x.window ?? 0.24) * bonus.window) })) }];
  });
}

export function battleSpells(db: Database, m: Member, items: Items): BattleSpell[] {
  const power = powerMultiplier(totalsOf(m, items).attrs.mag);
  return spellList(db).flatMap((s) => {
    const known = Math.min(m.abil.spells?.[s.id] ?? 0, spellMaxRank(s));
    if (known < 1) return [];
    const ranks = Array.from({ length: known }, (_, i) => { const at = spellAtRank(s, i + 1); return { rank: i + 1, name: rankName(s.name, i + 1), power: at.power * power, mp: at.mp, charge: at.charge }; });
    return [{ id: s.id, name: s.name, icon: s.icon, iconTint: s.iconTint, description: s.description, sound: s.sound, kind: s.kind, element: s.element ?? 'neutral', color: s.color, targets: s.targets ?? 'one',
      inflicts: s.inflicts, ranks, buffs: s.buffs, supportTarget: s.supportTarget, weather: s.weather, weatherTurns: s.weatherTurns, accuracy: s.accuracy, sure: s.sure,
      look: { effect: s.effect, burst: s.burst, element: s.element, inflicts: s.inflicts } }];
  });
}

/** EXP: the levels gained (each adds their ranks' gains to their stats). Health and magic grow with the maximum. */
export function gainXp(db: Database, cfg: CombatConfig, m: Member, xp: number, items: Items): number {
  const gains = levelGains(ranksOf(m.def.ranks, undefined));
  const before = maxOf(db, m, items);
  m.xp += Math.max(0, Math.round(xp));
  let ups = 0;
  const top = cfg.maxLevel ?? 100;
  while (m.level < top) {
    const need = xpToNext(cfg, m.level);
    if (need <= 0 || m.xp < need) break;
    m.xp -= need; m.level++; ups++;
    for (const k of ATTRS) m.stats[k] = Math.min(ATTR_MAX, m.stats[k] + gains[k]);
  }
  if (m.level >= top) m.xp = 0;
  const after = maxOf(db, m, items);
  if (m.hp > 0) m.hp = Math.min(after.hp, m.hp + Math.max(0, after.hp - before.hp));
  m.mp = Math.min(after.mp, m.mp + Math.max(0, after.mp - before.mp));
  return ups;
}

/** Count a full performance towards its rank (the new rank if it went up). */
export function master(db: Database, m: Member, id: string): number | null {
  const d = findAddition(db, id);
  return d ? masterAddition(m.abil, d) : null;
}

/** Everything they know (Additions), for the equip list. */
export function knownMoves(db: Database, m: Member): string[] {
  return additionList(db).filter((d) => m.abil.additions && d.id in m.abil.additions).map((d) => d.id);
}

export function saveMember(m: Member): MemberSave {
  const { def: _def, ...rest } = m;
  return JSON.parse(JSON.stringify(rest)) as MemberSave;
}

export function loadMember(db: Database, s: MemberSave): Member | null {
  const def = db.heroes?.find((h) => h.id === s.id);
  return def ? { ...s, def } : null;
}
