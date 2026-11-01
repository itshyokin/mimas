/**
 * Learned spells and Additions: the built-in lists (used when the database has none), ranks and their numbers,
 * Addition mastery, and what a hero has learned. No three.js, so it can be tested on its own.
 *
 * Spells are learned (from skill-tree skills, events and trainers) and rank up the same way; a higher rank hits
 * harder and costs more, and takes a turn longer to charge in a turn-based battle. Additions are learned the same
 * way and rank up by being performed in full (Legend of Dragoon).
 */
import type { AbilityData, AdditionDef, ClassDef, Database, HeroDef, SkillNode, SpellEntry } from '../world/types';

export const DEFAULT_SPELLS: SpellEntry[] = [
  { id: 'fire', name: 'Fire', kind: 'bolt', power: 14, mp: 6, element: 'fire', color: '#ff8a3a', maxRank: 3, description: 'A firebolt. Higher ranks burn hotter but take longer to call up.', inflicts: [{ ailment: 'burn', chance: 15 }] },
  { id: 'frost', name: 'Frost', kind: 'bolt', power: 12, mp: 6, element: 'water', color: '#8ad8ff', maxRank: 3, description: 'A shard of ice that can chill.', inflicts: [{ ailment: 'chill', chance: 35 }] },
  { id: 'spark', name: 'Spark', kind: 'bolt', power: 10, mp: 8, element: 'shock', color: '#ffe04a', maxRank: 3, targets: 'all', description: 'Lightning that strikes every foe.' },
  { id: 'mend', name: 'Mend', kind: 'heal', power: 26, mp: 8, color: '#9dffb0', maxRank: 3, description: 'Closes wounds on one of the party.' },
  { id: 'haste', name: 'Haste', kind: 'support', power: 0, mp: 10, color: '#5ae0ff', supportTarget: 'any', description: 'Someone (a friend, or a foe to undo its Slow) takes their turns half again as often, for a few turns.', buffs: [{ buff: 'haste', amount: 50, turns: 4 }] },
  { id: 'slow', name: 'Slow', kind: 'support', power: 0, mp: 8, color: '#c07a5a', supportTarget: 'any', description: 'Someone’s turns come round much more slowly (or undo a Haste), for a few turns. Endurance can shrug it off.', buffs: [{ buff: 'slow', amount: 40, turns: 4 }] },
  { id: 'rain_call', name: 'Rain Call', kind: 'support', power: 0, mp: 12, color: '#5a9cff', description: 'Brings rain over the battle for five rounds: water spells hit harder, fire ones weaker.', weather: 'rain', weatherTurns: 5 },
];

export const DEFAULT_ADDITIONS: AdditionDef[] = [
  { id: 'quick_strike', name: 'Quick Strike', description: 'One clean, well-timed cut.', strikes: [{ power: 1.3 }] },
  { id: 'double_slash', name: 'Double Slash', description: 'Two strikes; the second needs B.', strikes: [{ power: 0.8 }, { power: 0.9, button: 'B' }] },
  { id: 'volley', name: 'Volley', description: 'Four quick strikes with mixed buttons.', strikes: [{ power: 0.5, time: 0.6 }, { power: 0.5, button: 'X', time: 0.55 }, { power: 0.6, button: 'A', time: 0.5 }, { power: 0.8, button: 'Y', time: 0.5 }], maxRank: 5 },
  { id: 'crescent_storm', name: 'Crescent Storm', description: 'Seven strikes, fast and unforgiving.', strikes: [
    { power: 0.4, time: 0.55 }, { power: 0.4, button: 'B', time: 0.5 }, { power: 0.45, button: 'X', time: 0.45 }, { power: 0.45, button: 'Y', time: 0.45 },
    { power: 0.5, button: 'A', time: 0.42, window: 0.2 }, { power: 0.55, button: 'B', time: 0.4, window: 0.2 }, { power: 0.9, button: 'any', time: 0.55 }], maxRank: 5 },
];

export const spellList = (db: Database): SpellEntry[] => db.spells ?? DEFAULT_SPELLS;
export const additionList = (db: Database): AdditionDef[] => db.additions ?? DEFAULT_ADDITIONS;
export const classList = (db: Database): ClassDef[] => db.classes ?? [];
export const findSpell = (db: Database, id: string | undefined): SpellEntry | undefined => (id ? spellList(db).find((s) => s.id === id) : undefined);
export const findAddition = (db: Database, id: string | undefined): AdditionDef | undefined => (id ? additionList(db).find((a) => a.id === id) : undefined);
export const findClass = (db: Database, id: string | undefined): ClassDef | undefined => (id ? classList(db).find((c) => c.id === id) : undefined);

/* ------------------------------------------------------------------ spells */

export const spellMaxRank = (s: SpellEntry): number => Math.max(1, Math.round(s.maxRank ?? 1));

/** A rank's numbers: power and magic before the caster's own bonuses, and the turns it charges. */
export function spellAtRank(s: SpellEntry, rank: number): { power: number; mp: number; charge: number } {
  const r = Math.max(1, Math.min(spellMaxRank(s), Math.round(rank))) - 1;
  return {
    power: s.power * (1 + r * (s.rankPower ?? 60) / 100),
    mp: Math.round(s.mp * (1 + r * (s.rankMp ?? 50) / 100)),
    charge: Math.max(0, Math.round(s.charge ?? 0)) + r,
  };
}

/** "Fire", "Fire II", "Fire III"… */
export function rankName(name: string, rank: number): string {
  const R = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  return rank > 1 ? `${name} ${R[rank] ?? rank}` : name;
}

/** Learn a spell (or raise it) to this rank. Returns true if that's new. */
export function learnSpell(a: AbilityData, s: SpellEntry, rank = 1): boolean {
  const want = Math.max(1, Math.min(spellMaxRank(s), Math.round(rank)));
  const had = a.spells?.[s.id] ?? 0;
  if (had >= want) return false;
  (a.spells ??= {})[s.id] = want;
  return true;
}

/* ------------------------------------------------------------------ Additions */

export const additionMaxRank = (d: AdditionDef): number => Math.max(1, Math.round(d.maxRank ?? 5));
const perRank = (d: AdditionDef): number => Math.max(1, Math.round(d.usesPerRank ?? 6));

/** Rank from how often it's been completed: rank n + 1 takes n × usesPerRank completions in all. */
export function additionRank(d: AdditionDef, uses: number): number {
  let rank = 1, need = 0;
  while (rank < additionMaxRank(d)) { need += rank * perRank(d); if (uses < need) break; rank++; }
  return rank;
}

/** Completions still needed for the next rank (null at the top). */
export function additionToNext(d: AdditionDef, uses: number): number | null {
  const rank = additionRank(d, uses);
  if (rank >= additionMaxRank(d)) return null;
  let need = 0;
  for (let r = 1; r <= rank; r++) need += r * perRank(d);
  return need - uses;
}

/** At this rank: damage multiplier and how much wider the timing window is. */
export function additionBonus(d: AdditionDef, rank: number): { damage: number; window: number } {
  const r = Math.max(0, rank - 1);
  return { damage: 1 + r * (d.rankDamage ?? 12) / 100, window: 1 + r * (d.rankWindow ?? 6) / 100 };
}

export function learnAddition(a: AbilityData, d: AdditionDef): boolean {
  if (a.additions && d.id in a.additions) return false;
  (a.additions ??= {})[d.id] = 0;
  // The first one learned is the one Attack uses.
  a.addition ??= d.id;
  return true;
}

/** Performed in full: one more completion. Returns the new rank if it went up. */
export function masterAddition(a: AbilityData, d: AdditionDef): number | null {
  const before = additionRank(d, a.additions?.[d.id] ?? 0);
  (a.additions ??= {})[d.id] = (a.additions[d.id] ?? 0) + 1;
  const after = additionRank(d, a.additions[d.id]);
  return after > before ? after : null;
}

/* ------------------------------------------------------------------ classes */

/** Skill trees a hero can learn from: their class's and those of every class they've held. Null: all of them (no classes). */
export function heroTrees(db: Database, a: AbilityData): Set<string> | null {
  if (!classList(db).length || !a.cls) return null;
  const out = new Set<string>();
  for (const id of new Set([a.cls, ...(a.classes ?? [])])) for (const t of findClass(db, id)?.trees ?? []) out.add(t);
  return out;
}

/** Change class: the new one joins those held (its trees open), nothing learned is lost. */
export function changeClass(a: AbilityData, cls: string): void {
  if (a.cls && !(a.classes ?? []).includes(a.cls)) (a.classes ??= []).push(a.cls);
  // Each class's stat boost is given once, for good: remember every class they've been.
  for (const c of [a.cls, cls]) if (c && !(a.joined ?? []).includes(c)) (a.joined ??= []).push(c);
  a.cls = cls;
  if (!(a.classes ?? []).includes(cls)) (a.classes ??= []).push(cls);
}

/** Let a hero change to a class later (an event, a trainer). */
export function unlockClass(a: AbilityData, cls: string): boolean {
  if ((a.classes ?? []).includes(cls)) return false;
  (a.classes ??= []).push(cls);
  return true;
}

/** A new hero's starting abilities from Database → Heroes. */
export function startingAbilities(db: Database, h: HeroDef | undefined): AbilityData {
  const a: AbilityData = {};
  for (const [id, rank] of Object.entries(h?.spells ?? {})) { const s = findSpell(db, id); if (s) learnSpell(a, s, rank); }
  for (const id of h?.additions ?? []) { const d = findAddition(db, id); if (d) learnAddition(a, d); }
  // Their default Addition (Database → Heroes): known from the start, and what Attack performs.
  const def = h?.defaultAddition ? findAddition(db, h.defaultAddition) : undefined;
  if (def) { learnAddition(a, def); a.addition = def.id; }
  if (h?.cls && findClass(db, h.cls)) changeClass(a, h.cls);
  return a;
}

/** Copy only the ability fields (saves keep them; a plain object). */
export function abilityJSON(a: AbilityData): AbilityData {
  const o: AbilityData = {};
  if (a.spells && Object.keys(a.spells).length) o.spells = { ...a.spells };
  if (a.additions && Object.keys(a.additions).length) o.additions = { ...a.additions };
  if (a.addition) o.addition = a.addition;
  if (a.fieldSpell) { o.fieldSpell = a.fieldSpell; if (a.fieldRank) o.fieldRank = a.fieldRank; }
  if (a.cls) o.cls = a.cls;
  if (a.classes?.length) o.classes = [...a.classes];
  return o;
}

/**
 * What skill-tree skills taken so far teach (spells, raised to the rank the skill's ranks give, and Additions).
 * Returns the names of anything new, for a notice ("Fire II", "Double Slash").
 */
export function teachFromSkills(db: Database, a: AbilityData, ranks: Record<string, number>, nodes: readonly SkillNode[]): string[] {
  const got: string[] = [];
  for (const node of nodes) {
    const r = Math.min(ranks[node.id] ?? 0, Math.max(1, node.ranks ?? 1));
    if (r <= 0) continue;
    const s = findSpell(db, node.teachesSpell);
    if (s) { const want = r + Math.max(1, node.spellRankFrom ?? 1) - 1; if (learnSpell(a, s, want)) got.push(rankName(s.name, a.spells![s.id])); }
    const d = findAddition(db, node.teachesAddition);
    if (d && learnAddition(a, d)) got.push(d.name);
  }
  return got;
}

/** Starting abilities merged in (a new hero, or a save from before abilities): never takes anything away. */
export function mergeStarting(db: Database, a: AbilityData, h: HeroDef | undefined): void {
  const s = startingAbilities(db, h);
  for (const [id, rank] of Object.entries(s.spells ?? {})) { const sp = findSpell(db, id); if (sp) learnSpell(a, sp, rank); }
  for (const id of Object.keys(s.additions ?? {})) { const d = findAddition(db, id); if (d) learnAddition(a, d); }
  if (!a.cls && s.cls) changeClass(a, s.cls);
}
