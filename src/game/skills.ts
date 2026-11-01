/**
 * The skill tree: built-in trees (Might, Dexterity, Magic, Vitality, and the Party tree everyone shares), what
 * each skill does, and the hero's ranks. Skill points come from levels (and quest rewards). No three.js, so it can be tested alone.
 */
import type { SkillNode, SkillStat, SkillsData } from '../world/types';

/**
 * What each stat means, for the tree screen and the editor. `flag`: on or off rather than an amount. `old`: only did
 * something in the real-time battles (removed in update 65): no effect now (Database → Skills can update them).
 */
export const SKILL_STATS: Record<SkillStat, { name: string; unit: string; flag?: boolean; old?: boolean }> = {
  maxHp: { name: 'Max health', unit: '' },
  maxMp: { name: 'Max magic', unit: '' },
  maxSp: { name: 'Max stamina', unit: '' },
  meleeDamage: { name: 'Melee damage', unit: '%' },
  swingSpeed: { name: 'Swing speed (old: no effect)', unit: '%', old: true },
  lightDamage: { name: 'Light weapon damage', unit: '%' },
  mediumDamage: { name: 'Medium weapon damage', unit: '%' },
  heavyDamage: { name: 'Heavy weapon damage', unit: '%' },
  lightSpeed: { name: 'Light weapon speed (old: no effect)', unit: '%', old: true },
  mediumSpeed: { name: 'Medium weapon speed (old: no effect)', unit: '%', old: true },
  heavySpeed: { name: 'Heavy weapon speed (old: no effect)', unit: '%', old: true },
  bowDamage: { name: 'Bow damage', unit: '%' },
  drawSpeed: { name: 'Draw speed (old: no effect)', unit: '%', old: true },
  bowRange: { name: 'Bow lock-on range (sniping)', unit: '%' },
  sneakHide: { name: 'Harder to see while sneaking', unit: '%' },
  quietSteps: { name: 'Quieter while sneaking', unit: '%' },
  sneakDamage: { name: 'Sneak attack multiplier (old: no effect)', unit: '×', old: true },
  silentShot: { name: 'Silent shot: a far arrow wounds an unaware foe first', unit: '', flag: true },
  assassinate: { name: 'Assassinate: an unseen sword strike ends an ordinary foe', unit: '', flag: true },
  blockStamina: { name: 'Less stamina to block (old: no effect)', unit: '%', old: true },
  guardHeal: { name: 'Guard heals more', unit: '%' },
  /** Older databases: the Fire skill (Arcana now: spell shards are items). */
  spellFire: { name: 'Spell: Fire', unit: '', flag: true },
  spellDamage: { name: 'Spell bolt damage', unit: '%' },
  spellCost: { name: 'Less magic for spells', unit: '%' },
  spellRange: { name: 'Spell bolt range', unit: '%' },
  lightReach: { name: 'Light spell reach', unit: '%' },
  proficientMedium: { name: 'Trained: medium weapons (full damage)', unit: '', flag: true },
  proficientHeavy: { name: 'Trained: heavy weapons (full damage)', unit: '', flag: true },
  str: { name: 'Strength', unit: '' },
  dex: { name: 'Dexterity', unit: '' },
  agi: { name: 'Agility', unit: '' },
  end: { name: 'Endurance', unit: '' },
  def: { name: 'Defence', unit: '' },
  mag: { name: 'Magic', unit: '' },
  mdf: { name: 'Magic Defence', unit: '' },
  crit: { name: 'Critical hit chance', unit: '%' },
};

const n = (id: string, tree: string, name: string, x: number, y: number, effects: SkillNode['effects'], o: Partial<SkillNode> = {}): SkillNode =>
  ({ id, tree, name, x, y, effects, ...o });

/**
 * The Party tree: learned once with Party points (one each time the hero levels up), and every skill counts for the
 * whole party, members who join later included.
 */
const PARTY_TREE = { id: 'party', name: 'Party', color: '#5ac8c0', shared: true };
const PARTY_NODES: SkillNode[] = [
  n('fellowship', 'party', 'Fellowship', 3, 0, [{ stat: 'maxHp', value: 10 }, { stat: 'maxSp', value: 10 }], { description: 'The party sticks together: more health and stamina for everyone. Opens the Party tree.' }),
  n('hardy_company', 'party', 'Hardy Company', 0, 1, [{ stat: 'maxHp', value: 15 }], { parents: ['fellowship'], ranks: 3, description: 'More health for everyone in the party.' }),
  n('second_wind', 'party', 'Second Wind', 1.5, 1, [{ stat: 'maxSp', value: 20 }], { parents: ['fellowship'], ranks: 3, description: 'More stamina for everyone in the party.' }),
  n('battle_drill', 'party', 'Battle Drill', 4.5, 1, [{ stat: 'meleeDamage', value: 5 }], { parents: ['fellowship'], ranks: 3, description: 'Everyone’s melee hits do more damage.' }),
  n('arcane_chorus', 'party', 'Arcane Chorus', 6, 1, [{ stat: 'spellDamage', value: 5 }, { stat: 'maxMp', value: 5 }], { parents: ['fellowship'], ranks: 3, description: 'Everyone’s spells hit harder, with a little more magic.' }),
  n('thick_skin', 'party', 'Thick Skin', 0, 2, [{ stat: 'end', value: 2 }], { parents: ['hardy_company'], ranks: 3, description: 'Everyone’s Endurance goes up: ailments take hold less often.' }),
  n('quick_step', 'party', 'Quick Step', 1.5, 2, [{ stat: 'agi', value: 2 }], { parents: ['second_wind'], ranks: 3, level: 3, description: 'Everyone’s Agility goes up: quicker turns, more dodging.' }),
  n('keen_eyes', 'party', 'Keen Eyes', 3, 1, [{ stat: 'dex', value: 2 }], { parents: ['fellowship'], ranks: 3, level: 3, description: 'Everyone’s Dexterity goes up: better aim and more critical hits.' }),
  n('shield_wall', 'party', 'Shield Wall', 4.5, 2, [{ stat: 'def', value: 2 }, { stat: 'mdf', value: 2 }], { parents: ['battle_drill'], ranks: 3, level: 5, description: 'Everyone’s Defence and Magic Defence go up.' }),
];

/** The built-in tree, used when the database has none (and copied into it by the editor to change). */
export const DEFAULT_SKILLS: SkillsData = {
  trees: [
    { id: 'might', name: 'Might', color: '#e8784e' },
    { id: 'dexterity', name: 'Dexterity', color: '#7cc46a' },
    { id: 'magic', name: 'Magic', color: '#7aa8ff' },
    { id: 'vitality', name: 'Vitality', color: '#e6c25a' },
    PARTY_TREE,
  ],
  nodes: [
    // Might: swing speed, weapon damage, and mastery of light, medium or heavy weapons.
    n('fighter', 'might', 'Fighter', 2, 0, [{ stat: 'meleeDamage', value: 5 }], { description: 'The basics of the blade. Opens the Might tree.', teachesAddition: 'quick_strike' }),
    n('quick_hands', 'might', 'Quick Hands', 0, 1, [{ stat: 'agi', value: 2 }], { parents: ['fighter'], ranks: 3, description: 'Quicker in battle: Agility up, so turns come round sooner.' }),
    n('steady_guard', 'might', 'Steady Guard', 0, 2, [{ stat: 'guardHeal', value: 5 }], { parents: ['quick_hands'], ranks: 2, description: 'Guard gives back more health.' }),
    n('heavy_blows', 'might', 'Heavy Blows', 2, 1, [{ stat: 'meleeDamage', value: 10 }], { parents: ['fighter'], ranks: 3, description: 'Every melee hit does more damage.' }),
    n('arms_training', 'might', 'Arms Training', 4, 1, [{ stat: 'meleeDamage', value: 3 }, { stat: 'proficientMedium', value: 1 }], { parents: ['fighter'], description: 'Trained with medium weapons (longswords, rapiers): untrained, they hit for three quarters. Opens the masteries.' }),
    n('heavy_arms', 'might', 'Heavy Arms', 6, 1.6, [{ stat: 'proficientHeavy', value: 1 }], { parents: ['arms_training'], level: 3, description: 'Trained with heavy weapons (greatswords, great axes, hammers): untrained, they hit for three quarters.' }),
    n('light_mastery', 'might', 'Light Mastery', 3, 2, [{ stat: 'lightDamage', value: 15 }, { stat: 'crit', value: 3 }], { parents: ['arms_training'], ranks: 2, description: 'Daggers and short swords: deadlier, with more critical hits.' }),
    n('medium_mastery', 'might', 'Medium Mastery', 4, 2.4, [{ stat: 'mediumDamage', value: 15 }, { stat: 'crit', value: 2 }], { parents: ['arms_training'], ranks: 2, description: 'Longswords and rapiers: the balanced path.' }),
    n('heavy_mastery', 'might', 'Heavy Mastery', 5, 2, [{ stat: 'heavyDamage', value: 20 }], { parents: ['heavy_arms'], ranks: 2, description: 'Greatswords and great axes hit even harder.' }),
    // Additions (turn-based battles): strings of timed strikes.
    n('double_slash', 'might', 'Double Slash', 1, 2, [], { parents: ['quick_hands'], teachesAddition: 'double_slash', description: 'An Addition: two timed strikes.' }),
    n('volley', 'might', 'Volley', 2, 3, [], { parents: ['heavy_blows'], level: 4, teachesAddition: 'volley', description: 'An Addition: four timed strikes with mixed buttons.' }),
    n('crescent_storm', 'might', 'Crescent Storm', 2, 4, [], { parents: ['volley'], level: 10, cost: 2, teachesAddition: 'crescent_storm', description: 'An Addition: seven fast strikes.' }),
    // Dexterity: archery on the left, stealth on the right.
    n('archer', 'dexterity', 'Archer', 1, 0, [{ stat: 'bowDamage', value: 10 }], { description: 'Arrows fly true. Opens archery.' }),
    n('steady_draw', 'dexterity', 'Steady Draw', 0, 1, [{ stat: 'dex', value: 2 }], { parents: ['archer'], ranks: 2, description: 'A steadier hand: Dexterity up (aim, critical hits, bow damage).' }),
    n('eagle_eye', 'dexterity', 'Eagle Eye', 2, 1, [{ stat: 'bowRange', value: 25 }], { parents: ['archer'], ranks: 2, description: 'Lock on to enemies further away with a bow: spot them first and snipe one to start the battle with the first turns.' }),
    n('power_shot', 'dexterity', 'Power Shot', 1, 2, [{ stat: 'bowDamage', value: 15 }], { parents: ['steady_draw'], ranks: 2, description: 'Arrows hit harder.' }),
    n('shadow', 'dexterity', 'Shadow', 4, 0, [{ stat: 'sneakHide', value: 25 }], { description: 'Harder to see while sneaking: slip past foes, or catch them unaware for the first turns. Opens stealth.' }),
    n('light_step', 'dexterity', 'Light Step', 3, 1, [{ stat: 'quietSteps', value: 30 }], { parents: ['shadow'], ranks: 2, description: 'Make less noise while sneaking.' }),
    n('backstab', 'dexterity', 'Backstab', 5, 1, [{ stat: 'crit', value: 4 }], { parents: ['shadow'], ranks: 2, description: 'Find the weak spots: more critical hits.' }),
    n('silent_shot', 'dexterity', 'Silent Shot', 3, 2, [{ stat: 'silentShot', value: 1 }], { parents: ['light_step', 'archer'], description: 'An arrow from 5 tiles or more at a foe that hasn’t noticed you wounds it before the battle starts (and can finish it).' }),
    n('assassinate', 'dexterity', 'Assassinate', 5, 2, [{ stat: 'assassinate', value: 1 }], { parents: ['backstab'], level: 5, description: 'A sword strike on an ordinary foe that hasn’t noticed you ends it on the spot: no battle (not bosses).' }),
    // Magic: spells come as shards (equipped in the magic slot); this one gives the first.
    // Spell shards are found, bought or given as items; the Magic tree makes them better.
    n('fire', 'magic', 'Arcana', 2, 0, [{ stat: 'spellDamage', value: 10 }], { description: 'Spell bolts hit harder, and learn Fire. Opens the Magic tree.', teachesSpell: 'fire' }),
    n('thrift', 'magic', 'Mana Thrift', 1, 1, [{ stat: 'spellCost', value: 10 }], { parents: ['fire'], ranks: 3, description: 'Every spell costs less magic: bolts, and Light and Water Walk to cast and to keep going.' }),
    n('empower', 'magic', 'Empower', 3, 1, [{ stat: 'spellDamage', value: 10 }], { parents: ['fire'], ranks: 3, description: 'Spell bolts hit harder still, and Fire ranks up (Fire II, Fire III).', teachesSpell: 'fire', spellRankFrom: 2 }),
    n('frost_lore', 'magic', 'Frost Lore', 0, 1, [], { parents: ['fire'], ranks: 3, teachesSpell: 'frost', description: 'Learn Frost; more ranks raise it.' }),
    n('storm_lore', 'magic', 'Storm Lore', 4, 2, [], { parents: ['empower'], ranks: 3, level: 5, teachesSpell: 'spark', description: 'Learn Spark, lightning on every foe; more ranks raise it.' }),
    n('radiance', 'magic', 'Radiance', 1, 2, [{ stat: 'lightReach', value: 25 }], { parents: ['thrift'], ranks: 2, description: 'The Light spell shines further.' }),
    n('quicken', 'magic', 'Quicken', 0, 2, [], { parents: ['frost_lore'], level: 4, teachesSpell: 'haste', description: 'Learn Haste: one of the party takes turns more often for a while.' }),
    n('hinder', 'magic', 'Hinder', 0, 3, [], { parents: ['quicken'], level: 6, teachesSpell: 'slow', description: 'Learn Slow: a foe’s turns come round more slowly for a while.' }),
    n('far_cast', 'magic', 'Far Cast', 3, 2, [{ stat: 'spellRange', value: 25 }], { parents: ['empower'], ranks: 2, description: 'Spell bolts fly further.' }),
    // Vitality: health, stamina and magic.
    n('toughness', 'vitality', 'Toughness', 0, 0, [{ stat: 'maxHp', value: 20 }], { ranks: 5, description: 'More health.' }),
    n('endurance', 'vitality', 'Endurance', 2, 0, [{ stat: 'maxSp', value: 20 }], { ranks: 5, description: 'More stamina.' }),
    n('focus', 'vitality', 'Focus', 4, 0, [{ stat: 'maxMp', value: 15 }], { ranks: 5, description: 'More magic.' }),
    n('mending', 'vitality', 'Mending', 6, 0, [], { ranks: 3, teachesSpell: 'mend', description: 'Learn Mend, healing for one of the party; more ranks raise it.' }),
    ...PARTY_NODES,
  ],
};

/** Is this tree the Party (shared) tree? */
export const isSharedTree = (data: SkillsData, tree: string): boolean => !!data.trees.find((t) => t.id === tree)?.shared;

const withParty = new WeakMap<SkillsData, SkillsData>();
/**
 * The database's skills (or the built-in ones). A database made before the Party tree gets the built-in one added
 * (the same object each time, so it can be compared).
 */
export function skillsData(data?: SkillsData): SkillsData {
  if (!data?.nodes?.length) return DEFAULT_SKILLS;
  if (data.trees.some((t) => t.shared)) return data;
  let d = withParty.get(data);
  if (!d) { d = addPartyTree(data, false); withParty.set(data, d); }
  return d;
}
/** The data with the built-in Party tree added (a copy unless `inPlace`), unless it already has a shared tree. */
export function addPartyTree(data: SkillsData, inPlace: boolean): SkillsData {
  if (data.trees.some((t) => t.shared)) return data;
  const used = new Set(data.nodes.map((x) => x.id)), trees = new Set(data.trees.map((t) => t.id));
  const tree = trees.has(PARTY_TREE.id) ? { ...PARTY_TREE, id: 'party_shared' } : { ...PARTY_TREE };
  const nodes = PARTY_NODES.filter((x) => !used.has(x.id)).map((x) => ({ ...x, tree: tree.id, parents: x.parents?.filter((p) => !used.has(p) || PARTY_NODES.some((q) => q.id === p)) }));
  if (inPlace) { data.trees.push(tree); data.nodes.push(...nodes); return data; }
  return { ...data, trees: [...data.trees, tree], nodes: [...data.nodes, ...nodes] };
}

export class Skills {
  private totals = new Map<SkillStat, number>();

  /** `party`: this holds the Party tree's ranks (and counts only its skills); otherwise only the other trees count. */
  constructor(public data: SkillsData, readonly ranks: Record<string, number>, readonly party = false) { this.recount(); }

  /** Set by the game: why a node's Needs (a quest, a key item, a switch) still lock it, or null. */
  static locked: ((node: SkillNode) => string | null) | null = null;

  node(id: string): SkillNode | undefined { return this.data.nodes.find((x) => x.id === id); }
  rank(id: string): number { return this.ranks[id] ?? 0; }
  maxRank(node: SkillNode): number { return Math.max(1, node.ranks ?? 1); }

  /** Can the hero take the next rank of this skill? Says why not. */
  check(node: SkillNode, points: number, level: number): { ok: boolean; why?: string } {
    if (this.rank(node.id) >= this.maxRank(node)) return { ok: false, why: 'Fully learned' };
    const missing = (node.parents ?? []).filter((p) => this.rank(p) < 1).map((p) => this.node(p)?.name ?? p);
    if (missing.length) return { ok: false, why: `Needs ${missing.join(' and ')}` };
    if (node.level && level < node.level) return { ok: false, why: `Needs level ${node.level}` };
    const lock = Skills.locked?.(node);
    if (lock) return { ok: false, why: lock };
    if (points < (node.cost ?? 1)) return { ok: false, why: this.party ? 'Not enough party points' : 'Not enough skill points' };
    return { ok: true };
  }

  /** Take one rank (after check). Returns the points it cost. */
  take(node: SkillNode): number {
    this.ranks[node.id] = this.rank(node.id) + 1;
    this.recount();
    return node.cost ?? 1;
  }

  /** The Party tree's skills, counted for this hero too (set by the game). */
  shared: Skills | null = null;

  /** Weapon and armor types a learned skill trains this hero with (or the whole party, from the Party tree). */
  trains(kind: string): boolean { return this.trained.has(kind) || (!!this.shared && this.shared !== this && this.shared.trained.has(kind)); }
  private trained = new Set<string>();

  /** The total of a stat over every skill and rank taken (the hero's own, and the Party tree's). */
  get(stat: SkillStat): number { return (this.totals.get(stat) ?? 0) + (this.shared && this.shared !== this ? this.shared.get(stat) : 0); }
  has(stat: SkillStat): boolean { return this.get(stat) > 0; }

  recount(): void {
    this.totals.clear();
    this.trained.clear();
    for (const [id, r] of Object.entries(this.ranks)) {
      const node = this.node(id);
      if (!node || r <= 0 || isSharedTree(this.data, node.tree) !== this.party) continue;
      const k = Math.min(r, this.maxRank(node));
      for (const g of node.trains ?? []) this.trained.add(g);
      for (const e of node.effects) this.totals.set(e.stat, (this.totals.get(e.stat) ?? 0) + e.value * k);
    }
  }
}

/** "+8% Swing speed" style text for an effect. */
export function effectText(e: { stat: SkillStat; value: number }): string {
  const info = SKILL_STATS[e.stat];
  if (!info) return e.stat;
  if (info.flag) return info.name;
  if (info.unit === '×') return `+${e.value}× ${info.name.toLowerCase()}`;
  return `+${e.value}${info.unit} ${info.name.toLowerCase()}`;
}

/** Untrained with medium or heavy weapons (Arms Training, Heavy Arms), a hero's Attack in battle does this much. */
export const UNTRAINED_DAMAGE = 0.75;
/**
 * Trained with this kind of weapon? Only medium and heavy need it, and only when the skill tree teaches it (a tree
 * without Arms Training leaves everyone trained).
 */
export function proficientWith(sk: Skills, cls: string): boolean {
  if (cls !== 'medium' && cls !== 'heavy') return true;
  const stat = cls === 'medium' ? 'proficientMedium' : 'proficientHeavy';
  if (!sk.data.nodes.some((n) => n.effects.some((e) => e.stat === stat))) return true;
  return sk.has(stat);
}

/** Skills from the real-time battles, and what Database → Skills turns them into (stat, value from the old one). */
const OLD_SKILLS: Partial<Record<SkillStat, (v: number) => { stat: SkillStat; value: number }>> = {
  swingSpeed: (v) => ({ stat: 'agi', value: Math.max(1, Math.round(v / 4)) }),
  lightSpeed: (v) => ({ stat: 'crit', value: Math.max(1, Math.round(v / 3)) }),
  mediumSpeed: (v) => ({ stat: 'crit', value: Math.max(1, Math.round(v / 3)) }),
  heavySpeed: (v) => ({ stat: 'crit', value: Math.max(1, Math.round(v / 3)) }),
  drawSpeed: (v) => ({ stat: 'dex', value: Math.max(1, Math.round(v / 7)) }),
  blockStamina: (v) => ({ stat: 'guardHeal', value: Math.max(1, Math.round(v / 5)) }),
  sneakDamage: (v) => ({ stat: 'crit', value: Math.max(1, Math.round(v * 4)) }),
};
/** Skills still using an effect from the real-time battles. */
export const oldSkillNodes = (data: SkillsData): SkillNode[] => data.nodes.filter((n) => n.effects.some((e) => SKILL_STATS[e.stat]?.old));
/** Turn those effects into turn-based ones (Agility, critical hits, Dexterity, Guard healing); how many skills changed. */
export function updateOldSkills(data: SkillsData): number {
  const list = oldSkillNodes(data);
  for (const n of list) n.effects = n.effects.map((e) => OLD_SKILLS[e.stat]?.(e.value) ?? e);
  return list.length;
}
