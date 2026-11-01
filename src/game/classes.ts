/**
 * What classes give: a one-time stat boost when a hero joins one, and which weapons and armor they're trained with
 * (full effect), untrained with (weaker) or can't use at all.
 */
import type { AbilityData, ArmorTypeDef, ArmorWeight, ClassDef, Database, GearKind, GearSkill, ItemDef, WeaponType, WeaponTypeDef } from '../world/types';
import { type Attr, ATTRS } from './attributes';

/** The built-in weapon types (a game can rename them, remove some, or add its own: Database → Weapons → ☰). */
export const DEFAULT_WEAPON_TYPES: WeaponTypeDef[] = [
  { id: 'sword', name: 'Swords', one: 'Sword' }, { id: 'dagger', name: 'Daggers', one: 'Dagger' }, { id: 'axe', name: 'Axes', one: 'Axe' },
  { id: 'mace', name: 'Maces and hammers', one: 'Mace or hammer' }, { id: 'spear', name: 'Spears', one: 'Spear' }, { id: 'staff', name: 'Staves', one: 'Staff' },
  { id: 'wand', name: 'Wands', one: 'Wand' }, { id: 'fist', name: 'Fist weapons', one: 'Fist weapon' }, { id: 'bow', name: 'Bows', one: 'Bow' },
  { id: 'crossbow', name: 'Crossbows', one: 'Crossbow' },
];
/** The game's weapon types. */
export const weaponTypes = (db?: Pick<Database, 'weaponTypes'> | null): WeaponTypeDef[] => (db?.weaponTypes?.length ? db.weaponTypes : DEFAULT_WEAPON_TYPES);
/** One weapon of this type, by name ("Sword"). */
export const weaponTypeName = (id: string, db?: Pick<Database, 'weaponTypes'> | null): string => { const t = weaponTypes(db).find((x) => x.id === id); return t?.one || t?.name || id; };
/** The built-in armor types (a game can rename them, change their costs, or add its own: Database → Armor types). */
export const DEFAULT_ARMOR_TYPES: ArmorTypeDef[] = [
  { id: 'light', name: 'Light armor', note: 'Cloth, leather', untrained: { agi: -2 } },
  { id: 'medium', name: 'Medium armor', note: 'Chain, scale', untrained: { agi: -4, dex: -2 } },
  { id: 'heavy', name: 'Heavy armor', note: 'Plate', untrained: { agi: -7, dex: -3 } },
];
/** The game's armor types. */
export const armorTypes = (db?: Pick<Database, 'armorTypes'> | null): ArmorTypeDef[] => (db?.armorTypes?.length ? db.armorTypes : DEFAULT_ARMOR_TYPES);
/** Every row of a class's Weapons and armor table, with its name. */
export const gearKinds = (db?: Pick<Database, 'armorTypes' | 'weaponTypes'> | null): [GearKind, string][] =>
  [...weaponTypes(db).map((t) => [t.id, t.name] as [GearKind, string]), ...armorTypes(db).map((t) => [`armor:${t.id}`, t.name] as [GearKind, string]), ['shield', 'Shields']];
export const gearKindName = (k: GearKind, db?: Pick<Database, 'armorTypes' | 'weaponTypes'> | null): string => gearKinds(db).find(([x]) => x === k)?.[1] ?? k;

/** An untrained weapon hits for this share of its damage. */
export const UNTRAINED_WEAPON = 0.75;

const text = (d: ItemDef) => `${d.name} ${d.id} ${d.sprite ?? ''}`.toLowerCase();

/** The weapon's type: set in the Database, else guessed from its name (its type's words, then the usual ones). */
export function weaponTypeOf(d: ItemDef, db?: Pick<Database, 'weaponTypes'> | null): WeaponType | null {
  if (!d.weapon) return null;
  const list = weaponTypes(db), has = (id: string) => list.some((t) => t.id === id);
  if (d.weapon.type && has(d.weapon.type)) return d.weapon.type;
  const t = text(d);
  // A type's own words ("katana, nodachi"), or its name ("Katanas" → katana).
  for (const w of list) {
    const words = [...(w.words ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean), (w.one ?? '').toLowerCase()].filter((x) => x.length > 2);
    if (!DEFAULT_WEAPON_TYPES.some((x) => x.id === w.id) && words.some((x) => t.includes(x))) return w.id;
  }
  const pick = (id: string) => (has(id) ? id : null);
  if (/crossbow/.test(t) && has('crossbow')) return 'crossbow';
  if ((d.weapon.class === 'bow' || /\bbow\b|longbow|shortbow/.test(t)) && has('bow')) return 'bow';
  if (/dagger|knife|dirk|stiletto/.test(t) && has('dagger')) return 'dagger';
  if (/spear|lance|pike|halberd|trident|glaive/.test(t) && has('spear')) return 'spear';
  if (/mace|hammer|club|flail|morning ?star/.test(t) && has('mace')) return 'mace';
  if (/axe/.test(t) && has('axe')) return 'axe';
  if (/staff|stave|quarterstaff/.test(t) && has('staff')) return 'staff';
  if (/wand|sceptre|scepter/.test(t) && has('wand')) return 'wand';
  if (/fist|knuckle|claw|cestus/.test(t) && has('fist')) return 'fist';
  return pick('sword') ?? list[0]?.id ?? null;
}

/** Armor's type: set in the Database, else guessed from its name (the first type when nothing says). */
export function armorWeightOf(d: ItemDef, db?: Pick<Database, 'armorTypes'> | null): ArmorWeight | null {
  if (d.kind !== 'equipment' || d.slot !== 'armor') return null;
  const list = armorTypes(db), has = (id: string) => list.some((t) => t.id === id);
  if (d.armorWeight && has(d.armorWeight)) return d.armorWeight;
  const t = text(d);
  // A type named in the item's name (a "Robe" for a Robes type), then the usual words for the built-in three.
  const named = list.find((a) => a.name && t.includes(a.name.toLowerCase().replace(/ armou?r$/, '').replace(/s$/, '')));
  if (named && !['light', 'medium', 'heavy'].includes(named.id)) return named.id;
  if (/plate|full ?armou?r|knight|heavy/.test(t) && has('heavy')) return 'heavy';
  if (/chain|mail|scale|brigandine|ring ?armou?r|splint|banded/.test(t) && has('medium')) return 'medium';
  return has('light') ? 'light' : list[0]?.id ?? 'light';
}

/** Which row of a class's table this item falls under (null: anything can use it — accessories, shards…). */
export function gearKindOf(d: ItemDef, db?: Pick<Database, 'armorTypes' | 'weaponTypes'> | null): GearKind | null {
  // Tools anyone can use: pickaxes and hammers that mine.
  if (d.kind !== 'equipment' || d.mines) return null;
  if (d.slot === 'shield') return 'shield';
  if (d.slot === 'armor') return `armor:${armorWeightOf(d, db)!}`;
  if ((d.slot === 'weapon' || d.slot === 'ranged') && d.weapon) return weaponTypeOf(d, db);
  return null;
}

export const classOf = (db: Database, a: AbilityData | null | undefined): ClassDef | undefined => (a?.cls ? (db.classes ?? []).find((c) => c.id === a.cls) : undefined);

/** How the hero's class handles this item (no class, or a row left unset: trained). */
export function gearSkill(db: Database, a: AbilityData | null | undefined, d: ItemDef | undefined, sk?: { trains(kind: string): boolean } | null): GearSkill {
  const k = d && gearKindOf(d, db);
  // A skill that trains them with it wins over the class.
  if (k && sk?.trains(k)) return 'trained';
  return (k && classOf(db, a)?.gear?.[k]) || 'trained';
}

/** Every class the hero has been (their current one included): each gave its boost once. */
export function joinedClasses(a: AbilityData | null | undefined): string[] {
  if (!a) return [];
  const out = [...(a.joined ?? [])];
  if (a.cls && !out.includes(a.cls)) out.push(a.cls);
  return out;
}

/** The stats classes have given, added up. */
export function classBonus(db: Database, a: AbilityData | null | undefined): Partial<Record<Attr, number>> {
  const out: Partial<Record<Attr, number>> = {};
  for (const id of joinedClasses(a)) {
    const b = (db.classes ?? []).find((c) => c.id === id)?.bonus;
    if (b) for (const k of ATTRS) if (b[k]) out[k] = (out[k] ?? 0) + b[k]!;
  }
  return out;
}

/** What the class adds to the hero's stats (as a piece of gear would): its boosts, less untrained armor's cost. */
export function classStatGear(db: Database, a: AbilityData | null | undefined, armor: ItemDef | undefined, sk?: { trains(kind: string): boolean } | null): { bonus: Partial<Record<Attr, number>> } {
  const bonus = { ...classBonus(db, a) };
  if (armor && gearSkill(db, a, armor, sk) === 'untrained') {
    const type = armorTypes(db).find((t) => t.id === armorWeightOf(armor, db)), cost = type?.untrained ?? {};
    for (const k of ATTRS) if (cost[k]) bonus[k] = (bonus[k] ?? 0) + cost[k]!;
  }
  return { bonus };
}
