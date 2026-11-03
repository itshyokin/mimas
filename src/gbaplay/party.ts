/**
 * Mimas: the GBA game's party (up to six, the first one out in battle). Each hero keeps their level, EXP, health,
 * magic, gear, class and skills, and every move they know (Additions and spells, nothing forgotten).
 *
 * Stats come from classes (Update 14): everyone starts at 10 in every stat, plus the one-time boost of each class
 * they join; each level up adds their class's per-level bonus (fractions kept as tenths, so +1.5 a level adds 1, 2,
 * 1, 2…) and rolls their class's health and magic dice. Skill-tree stats, gear and items add on top.
 * The ROM (game_systems.hpp) follows the same rules with the same numbers (src/editor/gbaGame.ts exports them).
 *
 * The numbers follow Saturn's: health is the Database's base plus Endurance's bonus (plus the rolls), attack is the
 * weapon's (or bare hands') damage × its class × Strength, defence is armour plus the Defence stat.
 */
import { additionBonus, additionList, additionRank, additionToNext, findAddition, findClass, masterAddition, rankName, spellAtRank, spellList, spellMaxRank } from '../game/abilities';
import { ailmentResist, ATTR_MAX, ATTRS, enduranceHp, evasionOf, heroTotals, powerMultiplier, type Attr, type Attrs, type HeroTotals } from '../game/attributes';
import type { BattleAddition, BattleSpell } from '../game/battle/rules';
import { xpToNext, type CombatConfig } from '../game/combat/config';
import { configFromDb } from '../game/stats';
import { classStatGear, gearSkill, UNTRAINED_WEAPON } from '../game/classes';
import { isSharedTree, skillsData } from '../game/skills';
import type { AbilityData, ClassDef, Database, EquipSlot, HeroDef, ItemDef, SkillNode } from '../world/types';

export const MAX_PARTY = 6;
/** The dice a class can roll for health and magic each level. */
export const DICE = [4, 6, 8, 10, 12] as const;

export interface Member {
  id: string;
  def: HeroDef;
  level: number;
  xp: number;
  hp: number;
  mp: number;
  /** Their own stats (before skills and gear), whole. */
  stats: Attrs;
  /** The same in tenths: the class bonuses' fractions are kept here. */
  tenths: Attrs;
  /** Health and magic their level ups have rolled, added up. */
  hpRoll: number;
  mpRoll: number;
  abil: AbilityData;
  equip: Partial<Record<EquipSlot, string>>;
  /** Every move they know, in the order learned: Addition ids, or `spell:<id>`. */
  moves: string[];
  /** Skill-tree skills taken (id → rank) and skill points to spend. */
  nodes: Record<string, number>;
  points: number;
}

/** What a member saves as (and loads from). */
export type MemberSave = Omit<Member, 'def'>;

type Items = (id: string) => ItemDef | undefined;

const roll = (die: number) => 1 + Math.floor(Math.random() * Math.max(1, die));
const tenths = (v: number | undefined) => Math.round((v ?? 0) * 10);

/** A class's growth: per-level stat bonus (tenths) and dice; no class: nothing a level, d8 health and d6 magic. */
export function classGrowth(cl: ClassDef | undefined): { per: Attrs; hp: number; mp: number } {
  const per = Object.fromEntries(ATTRS.map((k) => [k, tenths(cl?.perLevel?.[k])])) as Attrs;
  const die = (v: number | undefined, d: number) => (DICE as readonly number[]).includes(v ?? 0) ? v! : d;
  return { per, hp: die(cl?.hpDie, 8), mp: die(cl?.mpDie, 6) };
}

/** Whole stats from tenths (never above the cap). */
function refreshStats(m: Member): void {
  for (const k of ATTRS) m.stats[k] = Math.max(1, Math.min(ATTR_MAX, Math.floor(m.tenths[k] / 10)));
}

/** One level up's growth from their class: its stat bonuses, a health roll, a magic roll and skill points. */
function growLevel(db: Database, cfg: CombatConfig, m: Member): void {
  const g = classGrowth(findClass(db, m.abil.cls));
  for (const k of ATTRS) m.tenths[k] = Math.min(ATTR_MAX * 10, m.tenths[k] + g.per[k]);
  m.hpRoll += roll(g.hp);
  m.mpRoll += roll(g.mp);
  m.points += Math.max(0, cfg.pointsPerLevel ?? 1);
  refreshStats(m);
}

/** Join a class: its one-time stat boost the first time ever. */
function joinClass(db: Database, m: Member, cls: string): void {
  const a = m.abil;
  a.cls = cls;
  a.classes = [...new Set([...(a.classes ?? []), cls])];
  a.joined ??= [];
  if (a.joined.includes(cls)) return;
  a.joined.push(cls);
  const b = findClass(db, cls)?.bonus ?? {};
  for (const k of ATTRS) m.tenths[k] = Math.max(10, Math.min(ATTR_MAX * 10, m.tenths[k] + tenths(b[k])));
  refreshStats(m);
}

/** Change class (an event): every stat, skill and move is kept; the new class's bonuses apply from the next level. */
export function changeClass(db: Database, m: Member, cls: string): boolean {
  if (!findClass(db, cls) || m.abil.cls === cls) return false;
  joinClass(db, m, cls);
  return true;
}
/** Unlock a class (it can be picked at a class trainer). */
export function unlockClass(m: Member, cls: string): boolean {
  if (m.abil.classes?.includes(cls)) return false;
  m.abil.classes = [...(m.abil.classes ?? []), cls];
  return true;
}

/**
 * A hero joining at this level: 10 in every stat, their starting class (its one-time boost, and level − 1 levels of
 * its bonuses and rolls), their starting moves, spells and gear.
 */
export function newMember(db: Database, def: HeroDef, level: number, cfg?: CombatConfig): Member {
  const t = Object.fromEntries(ATTRS.map((k) => [k, 100])) as Attrs;
  const abil: AbilityData = { spells: { ...(def.spells ?? {}) }, additions: {} };
  const m: Member = { id: def.id, def, level: Math.max(1, level), xp: 0, hp: 1, mp: 0, stats: { ...t }, tenths: t, hpRoll: 0, mpRoll: 0, abil, equip: { ...(def.gear ?? {}) }, moves: [], nodes: {}, points: cfg?.startPoints ?? 0 };
  refreshStats(m);
  if (def.cls && findClass(db, def.cls)) joinClass(db, m, def.cls);
  if (cfg) for (let l = 1; l < m.level; l++) growLevel(db, cfg, m);
  if (!def.noAdditions) {
    const list = additionList(db);
    const first = list.find((d) => d.id === def.defaultAddition) ?? (def.additions?.length ? undefined : list.find((d) => d.id === 'quick_strike') ?? list[0]);
    for (const id of [...(first ? [first.id] : []), ...(def.additions ?? [])]) {
      if (!findAddition(db, id) || id in abil.additions!) continue;
      abil.additions![id] = 0;
      m.moves.push(id);
    }
  }
  for (const sid of Object.keys(def.spells ?? {})) if (spellList(db).some((x) => x.id === sid)) m.moves.push(spellMove(sid));
  const max = maxOf(db, m, () => undefined);
  m.hp = max.hp; m.mp = max.mp;
  return m;
}

export function gearOf(m: Member, items: Items): (ItemDef | undefined)[] {
  return Object.values(m.equip).map((id) => (id ? items(id) : undefined));
}

/** What their skill-tree skills add to each stat. */
export function nodeStats(db: Database, m: Member): Partial<Record<Attr, number>> {
  const out: Partial<Record<Attr, number>> = {};
  for (const n of skillsData(db.skills).nodes) {
    const r = m.nodes[n.id] ?? 0;
    if (r) for (const e of n.effects) if ((ATTRS as string[]).includes(e.stat)) out[e.stat as Attr] = (out[e.stat as Attr] ?? 0) + e.value * r;
  }
  return out;
}

export function totalsOf(m: Member, items: Items, db?: Database): HeroTotals {
  const gear: { defense?: number; magicDefense?: number; bonus?: Partial<Record<Attr, number>>; crit?: number; slot?: EquipSlot }[] = gearOf(m, items).flatMap((g) => (g ? [{ defense: g.defense, magicDefense: g.magicDefense, bonus: g.bonus, crit: g.crit, slot: g.slot }] : []));
  // Untrained armor costs its type's stats (Database → Classes → Weapons and armor).
  if (db) gear.push(classStatGear({ ...db, classes: (db.classes ?? []).map((c) => ({ ...c, bonus: undefined })) }, m.abil, m.equip.armor ? items(m.equip.armor) : undefined));
  const ns = db ? nodeStats(db, m) : {};
  return heroTotals(m.stats, gear, (k) => (k === 'crit' ? 0 : ns[k] ?? 0));
}

export function maxOf(db: Database, m: Member, items: Items): { hp: number; mp: number } {
  const base = configFromDb(db).max, t = totalsOf(m, items, db);
  return { hp: Math.max(1, base.hp + enduranceHp(t.attrs.end) + (m.hpRoll ?? 0)), mp: Math.max(0, base.mp + (m.mpRoll ?? 0)) };
}

/** Their attack: the weapon's damage (or bare hands') × its class × Strength (× ¾ untrained with it). */
export function attackOf(cfg: CombatConfig, m: Member, items: Items, db?: Database): number {
  const t = totalsOf(m, items, db), w = m.equip.weapon ? items(m.equip.weapon) : undefined;
  const cls = w?.weapon && w.weapon.class !== 'bow' ? w.weapon.class : 'unarmed';
  const untrained = db && w && gearSkill(db, m.abil, w) === 'untrained' ? UNTRAINED_WEAPON : 1;
  return (cls === 'unarmed' ? cfg.unarmedDamage : w!.weapon!.damage) * cfg.classes[cls].damage * powerMultiplier(t.attrs.str) * untrained;
}

/** Can their class use this item at all? (“Can’t use” in Database → Classes.) */
export const canWear = (db: Database, m: Member, d: ItemDef | undefined): boolean => !d || gearSkill(db, m.abil, d) !== 'none';

export function battleNumbers(cfg: CombatConfig, m: Member, items: Items, db?: Database) {
  const t = totalsOf(m, items, db);
  return { attack: attackOf(cfg, m, items, db), armour: t.armour, magicArmour: t.magicArmour, agility: t.attrs.agi, crit: t.crit, evasion: evasionOf(t.attrs.agi), spellEvasion: evasionOf(t.attrs.mdf), resist: ailmentResist(t.attrs.end), totals: t };
}

/** A spell as a move (`spell:<id>`), and back. */
export const spellMove = (id: string): string => `spell:${id}`;
export const moveSpell = (move: string): string | null => (move.startsWith('spell:') ? move.slice(6) : null);

/** An Addition's strength (its strikes' powers added up). */
const strength = (db: Database, id: string) => findAddition(db, id)?.strikes.reduce((s, x) => s + x.power, 0) ?? 0;
/** A spell's MP at the rank they know. */
const spellMp = (db: Database, m: Member, sid: string) => { const s = spellList(db).find((x) => x.id === sid); return s ? spellAtRank(s, Math.max(1, m.abil.spells?.[sid] ?? 1)).mp : 0; };

/**
 * The move list's order: Additions weakest first (by strength; ties in the order learned), then spells cheapest
 * first (by MP; ties in the order learned).
 */
export function moveList(db: Database, m: Member): { additions: string[]; spells: string[] } {
  const known = m.moves.filter((id) => (moveSpell(id) ? (m.abil.spells?.[moveSpell(id)!] ?? 0) > 0 && spellList(db).some((s) => s.id === moveSpell(id)) : !!findAddition(db, id)));
  const order = (a: string, b: string) => known.indexOf(a) - known.indexOf(b);
  return {
    additions: known.filter((id) => !moveSpell(id)).sort((a, b) => strength(db, a) - strength(db, b) || order(a, b)),
    spells: known.filter((id) => moveSpell(id)).sort((a, b) => spellMp(db, m, moveSpell(a)!) - spellMp(db, m, moveSpell(b)!) || order(a, b)),
  };
}

/** A move's name, what lists show on the right (MP or GUARD) and its description. */
export function moveInfo(db: Database, m: Member, move: string): { name: string; right: string; detail?: string } {
  const sid = moveSpell(move);
  if (sid) {
    const s = spellList(db).find((x) => x.id === sid);
    const r = s ? spellAtRank(s, Math.max(1, m.abil.spells?.[sid] ?? 1)) : null;
    return { name: s ? rankName(s.name, Math.max(1, m.abil.spells?.[sid] ?? 1)) : sid, right: r ? `${r.mp} MP` : '', detail: s?.description };
  }
  const d = findAddition(db, move);
  return { name: d?.name ?? move, right: d ? (d.guard ? 'GUARD' : `${d.mp ?? 0} MP`) : '', detail: d?.description };
}

/** Their Additions for a battle (no button prompts: every strike lands). */
export function battleMoves(db: Database, m: Member): BattleAddition[] {
  return moveList(db, m).additions.flatMap((id) => {
    const d = findAddition(db, id);
    if (!d) return [];
    const uses = m.abil.additions?.[id] ?? 0, rank = additionRank(d, uses), bonus = additionBonus(d, rank);
    return [{ id: d.id, name: d.name, sound: d.sound, rank, maxRank: d.maxRank ?? 5, toNext: additionToNext(d, uses), damage: bonus.damage,
      element: d.element, inflicts: d.inflicts, look: { effect: d.effect, burst: d.burst, element: d.element, inflicts: d.inflicts }, mp: d.mp, guard: d.guard ? (d.guardHeal ?? 10) : undefined,
      description: d.description,
      strikes: d.strikes.map((x) => ({ power: x.power, button: x.button ?? 'A', time: Math.max(0.25, Math.min(0.45, x.time ?? 0.45)), window: Math.max(0.06, (x.window ?? 0.24) * bonus.window) })) } as BattleAddition];
  });
}

export function battleSpells(db: Database, m: Member, items: Items): BattleSpell[] {
  const power = powerMultiplier(totalsOf(m, items, db).attrs.mag);
  const known = new Set(moveList(db, m).spells);
  return spellList(db).filter((s) => known.has(spellMove(s.id))).flatMap((s) => {
    const k = Math.min(m.abil.spells?.[s.id] ?? 0, spellMaxRank(s));
    if (k < 1) return [];
    const ranks = Array.from({ length: k }, (_, i) => { const at = spellAtRank(s, i + 1); return { rank: i + 1, name: rankName(s.name, i + 1), power: at.power * power, mp: at.mp, charge: at.charge }; });
    return [{ id: s.id, name: s.name, icon: s.icon, iconTint: s.iconTint, description: s.description, sound: s.sound, kind: s.kind, element: s.element ?? 'neutral', color: s.color, targets: s.targets ?? 'one',
      inflicts: s.inflicts, ranks, buffs: s.buffs, supportTarget: s.supportTarget, weather: s.weather, weatherTurns: s.weatherTurns, accuracy: s.accuracy, sure: s.sure,
      look: { effect: s.effect, burst: s.burst, element: s.element, inflicts: s.inflicts } }];
  });
}

/** The battle's move list, in order: `a:<id>` Additions, then `s:<id>` spells. */
export function battleOrder(db: Database, m: Member): string[] {
  const l = moveList(db, m);
  return [...l.additions.map((id) => `a:${id}`), ...l.spells.map((id) => `s:${moveSpell(id)}`)];
}

/** EXP: the levels gained (each grows them by their class). Health and magic grow with their maximums. */
export function gainXp(db: Database, cfg: CombatConfig, m: Member, xp: number, items: Items): number {
  const before = maxOf(db, m, items);
  m.xp += Math.max(0, Math.round(xp));
  let ups = 0;
  const top = cfg.maxLevel ?? 100;
  while (m.level < top) {
    const need = xpToNext(cfg, m.level);
    if (need <= 0 || m.xp < need) break;
    m.xp -= need; m.level++; ups++;
    growLevel(db, cfg, m);
  }
  if (m.level >= top) m.xp = 0;
  const after = maxOf(db, m, items);
  if (m.hp > 0) m.hp = Math.min(after.hp, m.hp + Math.max(0, after.hp - before.hp));
  m.mp = Math.min(after.mp, m.mp + Math.max(0, after.mp - before.mp));
  return ups;
}

/** Learn a move (nothing is ever forgotten): false if they knew it already. */
export function learnMove(m: Member, move: string): boolean {
  if (m.moves.includes(move)) return false;
  m.moves.push(move);
  const sid = moveSpell(move);
  if (sid) { m.abil.spells ??= {}; m.abil.spells[sid] = Math.max(1, m.abil.spells[sid] ?? 0); }
  else { m.abil.additions ??= {}; m.abil.additions[move] ??= 0; }
  return true;
}

/* ------------------------------------------------------------------ skill trees */

/** The trees they can learn from (their class's; no class, or no classes in the game: every tree but Party ones) and the ones they can only look at (classes they've had). */
export function memberTrees(db: Database, m: Member): { learn: string[]; view: string[] } {
  const sk = skillsData(db.skills), all = sk.trees.filter((t) => !isSharedTree(sk, t.id)).map((t) => t.id);
  const cl = findClass(db, m.abil.cls);
  if (!(db.classes ?? []).length || !cl) return { learn: all, view: [] };
  const learn = cl.trees.filter((t) => all.includes(t));
  const seen = [...new Set([...(m.abil.classes ?? []), ...(m.abil.joined ?? [])])].flatMap((c) => findClass(db, c)?.trees ?? []);
  return { learn, view: all.filter((t) => seen.includes(t) && !learn.includes(t)) };
}

/** Whether they can take the next rank of a skill now, and why not. */
export function nodeState(db: Database, m: Member, n: SkillNode): { rank: number; max: number; cost: number; ok: boolean; why?: string } {
  const rank = m.nodes[n.id] ?? 0, max = Math.max(1, n.ranks ?? 1), cost = Math.max(0, n.cost ?? 1);
  const t = memberTrees(db, m);
  const why = rank >= max ? 'Learned in full.'
    : !t.learn.includes(n.tree) ? `Only a ${(db.classes ?? []).filter((c) => c.trees.includes(n.tree)).map((c) => c.name).join(' or ') || 'another class'} can learn this.`
    : (n.parents ?? []).some((p) => !(m.nodes[p] ?? 0)) ? `Needs ${(n.parents ?? []).filter((p) => !(m.nodes[p] ?? 0)).map((p) => skillsData(db.skills).nodes.find((x) => x.id === p)?.name ?? p).join(', ')} first.`
    : (n.level ?? 0) > m.level ? `Needs level ${n.level}.`
    : m.points < cost ? `Needs ${cost} skill point${cost === 1 ? '' : 's'}.` : undefined;
  return { rank, max, cost, ok: !why, why };
}

/** Take the next rank of a skill: its points, its stats, and the Addition or spell it teaches (the move learned, if any). */
export function takeNode(db: Database, m: Member, n: SkillNode, items: Items): string | null {
  const st = nodeState(db, m, n);
  if (!st.ok) return null;
  const before = maxOf(db, m, items);
  m.points -= st.cost;
  m.nodes[n.id] = st.rank + 1;
  let taught: string | null = null;
  if (n.teachesAddition && findAddition(db, n.teachesAddition) && !m.def.noAdditions && learnMove(m, n.teachesAddition)) taught = n.teachesAddition;
  const s = n.teachesSpell ? spellList(db).find((x) => x.id === n.teachesSpell) : undefined;
  if (s) {
    const r = Math.max(1, Math.min(spellMaxRank(s), st.rank + 1 + (n.spellRankFrom ?? 1) - 1));
    m.abil.spells ??= {};
    if ((m.abil.spells[s.id] ?? 0) < r) { m.abil.spells[s.id] = r; if (!m.moves.includes(spellMove(s.id))) m.moves.push(spellMove(s.id)); taught = spellMove(s.id); }
  }
  const after = maxOf(db, m, items);
  if (m.hp > 0) m.hp = Math.min(after.hp, m.hp + Math.max(0, after.hp - before.hp));
  return taught;
}

/** Count a full performance towards its rank (the new rank if it went up). */
export function master(db: Database, m: Member, id: string): number | null {
  const d = findAddition(db, id);
  return d ? masterAddition(m.abil, d) : null;
}

export function saveMember(m: Member): MemberSave {
  const { def: _def, ...rest } = m;
  return JSON.parse(JSON.stringify(rest)) as MemberSave;
}

/** A saved member (older saves, from before classes grew stats, start again at their level with what they knew). */
export function loadMember(db: Database, s: MemberSave, cfg?: CombatConfig): Member | null {
  const def = db.heroes?.find((h) => h.id === s.id);
  if (!def) return null;
  if (s.tenths) return { ...s, nodes: s.nodes ?? {}, points: s.points ?? 0, def };
  const m = newMember(db, def, s.level, cfg);
  m.xp = s.xp; m.equip = s.equip ?? m.equip;
  for (const id of s.moves ?? []) learnMove(m, id);
  m.abil.spells = { ...m.abil.spells, ...(s.abil?.spells ?? {}) };
  const mx = maxOf(db, m, () => undefined);
  m.hp = Math.min(mx.hp, s.hp); m.mp = Math.min(mx.mp, s.mp);
  return m;
}
