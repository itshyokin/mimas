/**
 * Item helpers shared by the game and the editor: bringing older item data up to date.
 */
import { RARITY_COLORS, type Database, type FieldPower, type FieldUseKind, type ItemDef, type Rarity } from './types';
import { FISH } from './fishing';
import { withEssenceItems } from '../game/essence';

/**
 * Before rings, light items went in a "Light" slot. They're rings with the Light power now
 * (no magic cost, so they behave as before apart from being switched on with the Ring key).
 * Changes the database in place; returns true when anything changed.
 */
export function migrateItems(db: Database): boolean {
  let changed = false;
  for (const d of db.items ?? []) {
    if ((d.slot as string) === 'light') {
      (d as { slot?: string }).slot = 'ring';
      d.ring ??= { power: 'light' };
      changed = true;
    }
    // (A ring with a light but no power was a Light ring; a plain ring with neither is just a ring.)
    if ((d.slot as string) === 'ring' && !d.ring && d.light) { d.ring = { power: 'light' }; changed = true; }
  }
  const eq = db.inventory?.startEquip as Record<string, string | undefined> | undefined;
  if (eq?.light) { eq.ring ??= eq.light; delete eq.light; changed = true; }
  // Before spell shards, Fire was learned straight from the skill tree: it's the Fire Shard now, which the Fire
  // skill gives (so older games and databases keep their spell).
  const items = (db.items ??= []);
  // Added when the skill tree gives it (the built-in tree's Fire skill, or an older tree's "Spell: Fire") and it's missing.
  const nodes = db.skills?.nodes?.length ? db.skills.nodes : null;
  const wanted = nodes ? nodes.some((n) => n.teaches === FIRE_SHARD || (!n.teaches && n.effects.some((e) => e.stat === 'spellFire'))) : true;
  if (wanted && !items.some((d) => d.id === FIRE_SHARD)) {
    const f = db.combat?.fire ?? {};
    items.push({
      id: FIRE_SHARD, name: 'Fire Shard', kind: 'equipment', slot: 'magic', icon: 'builtin:shard_fire', rarity: 'common', price: 120, element: 'fire',
      description: 'A splinter of ember crystal. Equip it, then cast with B (or F, or key 3) to hurl firebolts.',
      spell: { damage: f.damage ?? 14, mp: f.mp ?? 6, ...(f.speed ? { speed: f.speed } : {}), ...(f.range ? { range: f.range } : {}), color: '#ff8a3a', light: { intensity: 1.2, radius: 3 } },
    });
    changed = true;
  }
  // Firewood, for the built-in sapling to give and fires to burn (added once, when no item is fire fuel yet).
  if (!items.some((d) => d.id === FIREWOOD) && !items.some((d) => (d.fuel ?? 0) > 0)) {
    items.push({ id: FIREWOOD, name: 'Firewood', kind: 'material', icon: 'builtin:log', price: 4, fuel: 1,
      description: 'Dry branches. Feed a fire to keep it burning (+1 hour).' });
    changed = true;
  }
  // Rings used to carry field powers. Light and Water walking are spell shards now ("Light", "Water Walk"); the
  // cutting ring is gone (swords cut vines), along with anything that started the hero with it.
  // Lockpicks (Update 125), added once when the game has none.
  if (!items.some((d) => d.lockpick)) {
    items.push({ id: LOCKPICK, name: 'Lockpick', kind: 'key', icon: 'builtin:lockpick', price: 25, stack: 99, lockpick: true,
      description: 'A thin steel pick for locks. It snaps if you force a lock in the wrong spot.' });
    changed = true;
  }
  // The Cut and Bow key items (Update 132: the map's sword and bow are gone), added once each and put in the
  // starting bag the first time.
  for (const [use, id, name, icon, text] of [['cut', 'key_cut', 'Machete', 'builtin:sword', 'A broad blade for vines, thin trees and crates.'], ['bow', 'key_bow', 'Hunting Bow', 'builtin:bow', 'For switches and targets out of reach.']] as const) {
    if (items.some((d) => d.field?.use === use)) continue;
    items.push({ id, name, kind: 'key', icon, description: text, field: { use, damage: 10 } });
    const start = ((db.inventory ??= {}).startItems ??= []);
    if (!start.some((x) => x.item === id)) start.push({ item: id, count: 1 });
    changed = true;
  }
  if (addOutfits(db)) changed = true;
  if (ringsToShards(db)) changed = true;
  if (shardsToTools(db)) changed = true;
  if (addForging(db)) changed = true;
  if (addFishing(db)) changed = true;
  // Element stones (Fragments, Shards and Heart Stones of each element), added once each by id.
  { const n = items.length, all = withEssenceItems(items); if (all.length !== n) { items.push(...all.slice(n)); changed = true; } }
  // The Light spell is a glow all around the hero now, not a beam: flashlights become orbs reaching further.
  for (const d of items) {
    const l = d.light;
    if (l?.type !== 'flashlight') continue;
    d.light = { type: 'orb', color: l.color, intensity: 2.4, radius: Math.max(10, l.radius || 10), ...(l.shadows ? { shadows: true } : {}) };
    changed = true;
  }
  // Before elements: the Fire Shard is fire.
  const fs = items.find((d) => d.id === FIRE_SHARD);
  if (fs?.spell && !fs.element) { fs.element = 'fire'; changed = true; }
  // Spell shards are items now, not skills: a skill that gave one (or the old "Spell: Fire") becomes a spell perk.
  // An emptied "Fire" skill becomes "Arcana" (spell bolts hit harder), keeping its id so learned ranks still count.
  for (const n of db.skills?.nodes ?? []) {
    const old = n.effects.some((e) => e.stat === 'spellFire');
    if (!n.teaches && !old) continue;
    delete n.teaches;
    n.effects = n.effects.filter((e) => e.stat !== 'spellFire');
    if (!n.effects.length) {
      n.effects = [{ stat: 'spellDamage', value: 10 }];
      if (/^(spell: )?fire$/i.test(n.name)) n.name = 'Arcana';
      n.description = 'Spell bolts hit harder. Opens the Magic tree.';
    }
    changed = true;
  }
  return changed;
}

/**
 * Mining and forging: the stone, ores and ingots the built-in boulders and ore veins give and forges use (added
 * once, when no item smelts yet), a pickaxe, and a material for every weapon and piece of armor that has none
 * (steel or gold when its name says so, otherwise iron), so it can be upgraded at a forge.
 */
function addForging(db: Database): boolean {
  const items = (db.items ??= []);
  let changed = false;
  if (!items.some((d) => d.smelt)) {
    const add = (d: ItemDef) => { if (!items.some((x) => x.id === d.id)) { items.push(d); changed = true; } };
    add({ id: 'stone', name: 'Stone', kind: 'material', icon: 'builtin:stone', price: 2, description: 'Rough stone, broken from a boulder.' });
    add({ id: 'iron_ore', name: 'Iron Ore', kind: 'material', icon: 'builtin:ore_iron', price: 6, smelt: { into: 'iron_ingot', need: 2 },
      description: 'Rusty rock from an iron vein. Smelt two into an iron ingot at a forge.' });
    add({ id: 'gold_ore', name: 'Gold Ore', kind: 'material', icon: 'builtin:ore_gold', price: 15, smelt: { into: 'gold_ingot', need: 2 },
      description: 'Rock flecked with gold. Smelt two into a gold ingot at a forge.' });
    add({ id: 'iron_ingot', name: 'Iron Ingot', kind: 'material', icon: 'builtin:ingot_iron', price: 20, smelt: { into: 'steel_ingot', need: 2 },
      description: 'Upgrades iron weapons and armor at a forge. Two make a steel ingot.' });
    add({ id: 'steel_ingot', name: 'Steel Ingot', kind: 'material', icon: 'builtin:ingot_steel', price: 45, description: 'Upgrades steel weapons and armor at a forge.' });
    add({ id: 'gold_ingot', name: 'Gold Ingot', kind: 'material', icon: 'builtin:ingot_gold', price: 60, description: 'Upgrades golden weapons and jewellery at a forge.' });
    add({ id: 'pickaxe', name: 'Pickaxe', kind: 'equipment', slot: 'weapon', icon: 'builtin:pickaxe', price: 60, weapon: { class: 'light', damage: 7 }, mines: true, material: 'iron_ingot',
      description: 'Breaks boulders and ore veins: swing it at the rock.' });
  }
  const has = (id: string) => items.some((d) => d.id === id);
  if (has('iron_ingot')) {
    for (const d of items) {
      if (d.kind !== 'equipment' || d.material || !d.slot || d.slot === 'magic') continue;
      const n = `${d.name} ${d.id}`;
      d.material = /steel/i.test(n) && has('steel_ingot') ? 'steel_ingot' : /gold|sun/i.test(n) && has('gold_ingot') ? 'gold_ingot' : d.slot === 'accessory' && has('gold_ingot') ? 'gold_ingot' : 'iron_ingot';
      changed = true;
    }
  }
  return changed;
}

/** Fishing: a rod and a few fish to catch (added once, when no item is a rod yet). */
/** Starter outfits from the built-in clothing (Update 128), added once: when no item wears it yet. */
function addOutfits(db: Database): boolean {
  const items = (db.items ??= []);
  if (items.some((d) => d.worn?.top || d.worn?.bottom || d.worn?.accessory) || items.some((d) => d.id.startsWith('outfit_'))) return false;
  const add = (d: ItemDef) => items.push(d);
  add({ id: 'outfit_traveler', name: 'Traveler’s Clothes', kind: 'equipment', slot: 'armor', icon: 'builtin:tunic', price: 40, defense: 2, warmth: 3,
    description: 'A sturdy shirt and pants for the road.', worn: { top: { part: 'torso_clothes_longsleeve', swatch: 4 }, bottom: { part: 'legs_pants', swatch: 0 } } });
  add({ id: 'outfit_leather', name: 'Leather Armor', kind: 'equipment', slot: 'armor', icon: 'builtin:leather_armor', price: 120, defense: 5, warmth: 4,
    description: 'Boiled leather over a padded shirt.', worn: { top: { part: 'torso_armour_leather' }, bottom: { part: 'legs_pants2', swatch: 4 } } });
  add({ id: 'outfit_chainmail', name: 'Chainmail Shirt', kind: 'equipment', slot: 'armor', icon: 'builtin:chainmail', price: 260, defense: 8, warmth: 2,
    description: 'Rings of steel over cuffed pants.', worn: { top: { part: 'torso_chainmail' }, bottom: { part: 'legs_cuffed', swatch: 7 } } });
  add({ id: 'outfit_plate', name: 'Plate Armor', kind: 'equipment', slot: 'armor', icon: 'builtin:plate_armor', price: 600, defense: 12, warmth: 1, rarity: 'rare',
    description: 'Full plate: chest and greaves.', worn: { top: { part: 'torso_armour_plate' }, bottom: { part: 'legs_armour' } } });
  add({ id: 'outfit_cape', name: 'Wanderer’s Cape', kind: 'equipment', slot: 'accessory', icon: 'builtin:cloak', price: 60, defense: 1, warmth: 4,
    description: 'A long cloth cape against the wind.', worn: { accessory: { part: 'cape_solid', swatch: 1 } } });
  add({ id: 'outfit_necklace', name: 'Beaded Necklace', kind: 'equipment', slot: 'accessory', icon: 'builtin:amulet', price: 30,
    description: 'Painted wooden beads on a cord.', worn: { accessory: { part: 'neck_necklace_beaded_small', swatch: 6 } } });
  return true;
}

function addFishing(db: Database): boolean {
  const items = (db.items ??= []);
  if (items.some((d) => d.rod)) return false;
  const add = (d: ItemDef) => { if (!items.some((x) => x.id === d.id)) items.push(d); };
  add({ id: FISH.rod, name: 'Fishing Rod', kind: 'key', icon: 'builtin:fishing_rod', price: 40, rod: { power: 0 },
    description: 'A simple rod and line. Face a fishing spot by the water and press Talk (A / Enter) to cast; when the float bobs under, press it again.' });
  add({ id: FISH.minnow, name: 'Minnow', kind: 'consumable', icon: 'builtin:fish_minnow', price: 4, restore: { hp: 10 }, fish: { size: 8 },
    description: 'A little silver fish. Restores a bit of health.' });
  add({ id: FISH.trout, name: 'Trout', kind: 'consumable', icon: 'builtin:fish_trout', price: 14, restore: { hp: 30 }, fish: { size: 35 },
    description: 'A speckled trout, out by day. Restores health.' });
  add({ id: FISH.eel, name: 'Night Eel', kind: 'consumable', icon: 'builtin:fish_eel', price: 18, restore: { mp: 20 }, fish: { size: 60 },
    description: 'A slippery eel that only bites after dark. Restores magic.' });
  add({ id: FISH.koi, name: 'Golden Koi', kind: 'material', icon: 'builtin:fish_koi', price: 160, rarity: 'rare', fish: { size: 50 },
    description: 'A rare golden fish. Collectors pay well for one.' });
  add({ id: FISH.boot, name: 'Old Boot', kind: 'material', icon: 'builtin:boot', price: 1, description: 'Not a fish. Someone lost this a long time ago.' });
  return true;
}

/** The fuel the built-in sapling gives when cut. */
export const FIREWOOD = 'firewood';
/** The built-in Lockpick (Update 125): picking a lock needs one; a snapped pick uses one up. */
export const LOCKPICK = 'lockpick';

/** The spell shard older Fire skills give. */
export const FIRE_SHARD = 'fire_shard';

/** Weapons, armor, spell shards and other equipment have a rarity; potions, keys and the like don't. */
export const hasRarity = (d: ItemDef | undefined): boolean => d?.kind === 'equipment';
export const rarityOf = (d: ItemDef | undefined): Rarity | null => (hasRarity(d) ? d!.rarity ?? 'common' : null);
/** The colour to show an item's name in: its rarity's, or null for plain white. */
export function itemColor(d: ItemDef | undefined): string | null {
  const r = rarityOf(d);
  return r ? RARITY_COLORS[r] ?? null : null;
}

/** What a field spell does, for menus and the editor. */
export const POWER_NAMES: Record<FieldPower, string> = {
  light: 'Light',
  waterWalk: 'Water Walk',
};

/** Key item field uses (Update 118), for menus and the editor. */
export const FIELD_USE_NAMES: Record<FieldUseKind, string> = {
  dash: 'Sprint', swim: 'Swim', climb: 'Climb', cut: 'Cut', bow: 'Bow', fireBow: 'Fire Bow', smash: 'Smash Stone', weather: 'Change weather', time: 'Change time',
  season: 'Change season', fish: 'Start fishing', horse: 'Ride horse', skeletonKey: 'Skeleton Key',
};
/** What each does (the editor's note and a new item's description). */
export const FIELD_USE_TEXT: Record<FieldUseKind, string> = {
  dash: 'Switch it on (bag or a quick slot): the hero runs while it’s on, even before learning to; switch it off to walk.',
  swim: 'Carrying it, the party can swim in deep water (without one, deep water stops them).',
  climb: 'Carrying it, the hero can climb climbable walls, even before learning to.',
  cut: 'Put it on a quick slot: each press swings it, cutting vines and thin trees and breaking crates (a fixed amount of damage). A foe it reaches starts a battle.',
  bow: 'Put it on a quick slot: hold to draw, let go to shoot (a fixed amount of damage). Lock-on aims it at switches and targets.',
  fireBow: 'Use it facing a fire that’s out to light it again for an hour, no fuel needed, or facing vines to burn them away.',
  smash: 'Use it facing a boulder or ore vein to break it in one blow, no pickaxe needed.',
  weather: 'Use it outdoors to change the weather here (the player picks it from a list).',
  time: 'Use it to set the time: a bubble forms round the hero while the world fast-forwards.',
  season: 'Use it outdoors to change the season (the player picks it).',
  fish: 'Use it facing a fishing spot to cast (works as a basic rod).',
  horse: 'Use it to call your horse to you and get on (riding: get off).',
  skeletonKey: 'Carrying it opens any lock, even ones that can’t be picked.',
};
/** Field uses that work just by being carried (no Use, no quick slot). */
export const carriedUse = (k: FieldUseKind | undefined): boolean => k === 'swim' || k === 'climb' || k === 'skeletonKey';

/** Field spells stay on until switched off. */
export const isToggle = (p: string): boolean => p === 'light' || p === 'waterWalk';

/** The glow a field spell gives the hero by default. */
export const FIELD_GLOW: Record<FieldPower, string> = { light: '#ffd27a', waterWalk: '#5ab8ff' };

/**
 * Field spells moved again, from spell shards to key items: a Light shard is a lantern, Water Walk a pair of boots,
 * switched on and off from the bag or with the B button (no magic needed). Shards still called by their spell's name
 * get a key item's name and icon. Returns true when anything changed.
 */
function shardsToTools(db: Database): boolean {
  let changed = false;
  const moved = new Set<string>();
  for (const d of db.items ?? []) {
    const power = d.spell?.power;
    if (!power) continue;
    changed = true;
    moved.add(d.id);
    d.kind = 'key';
    d.tool = power;
    delete d.slot; delete d.spell; delete d.rarity; delete d.price;
    if (power !== 'light') delete d.light;
    const named = d.name === POWER_NAMES[power];
    if (named) d.name = power === 'light' ? 'Lantern' : 'Strider Boots';
    if (!d.icon || d.icon.startsWith('builtin:shard')) d.icon = power === 'light' ? 'builtin:lantern' : 'builtin:boots';
    if (named || /\bshard\b/i.test(d.description ?? '')) d.description = TOOL_TEXT[power];
  }
  const inv = db.inventory, eq = inv?.startEquip as Record<string, string | undefined> | undefined;
  if (eq?.magic && moved.has(eq.magic)) {
    const id = eq.magic;
    delete eq.magic;
    const start = (inv!.startItems ??= []);
    if (!start.some((s) => s.item === id)) start.push({ item: id, count: 1 });
  }
  return changed;
}

/** What a key item's field use does, for its description. */
export const TOOL_TEXT: Record<FieldPower, string> = {
  light: 'Lights the way in the dark. Switch it on or off in the bag, or assign it to the B button.',
  waterWalk: 'Walk on water of any depth while they’re on; they switch off when you step back on land. Switch them on in the bag, or assign them to the B button.',
};

/**
 * Rings with field powers become spell shards in the magic slot. Their names become the spell's ("Light",
 * "Water Walk") when they were called a ring; their icons become shards. Cutting rings are removed. Returns true
 * when anything changed.
 */
function ringsToShards(db: Database): boolean {
  const items = db.items ?? [];
  let changed = false;
  const cut = new Set<string>();
  for (const d of items) {
    const r = d.ring;
    if (!r) continue;
    changed = true;
    if (r.power === 'cut') { cut.add(d.id); continue; }
    const power = r.power as FieldPower;
    d.slot = 'magic';
    d.spell = { power, damage: 0, mp: r.mpCost ?? 0, ...(r.mpPerSecond ? { mpPerSecond: r.mpPerSecond } : {}), color: r.glow ?? FIELD_GLOW[power], ...(r.glow ? { glow: r.glow } : {}) };
    delete d.ring;
    if (power !== 'light') delete d.light;
    if (/\bring\b/i.test(d.name)) d.name = POWER_NAMES[power];
    if (!d.icon || d.icon.startsWith('builtin:ring')) d.icon = power === 'light' ? 'builtin:shard_light' : 'builtin:shard_tide';
    // Its description was about a ring: it's a shard now.
    d.description = power === 'light'
      ? 'A shard of captured daylight. Cast it (key 3, or F) to call up a light around you; again to put it out. Drains magic while it shines.'
      : 'A shard of still water. Cast it (key 3, or F) to walk on water of any depth; it ends when you step back on land.';
  }
  if (cut.size) {
    db.items = items.filter((d) => !cut.has(d.id));
    const inv = db.inventory;
    if (inv?.startItems) inv.startItems = inv.startItems.filter((s) => !cut.has(s.item));
    if (inv?.startEquip) for (const [k, v] of Object.entries(inv.startEquip)) if (v && cut.has(v)) delete (inv.startEquip as Record<string, string>)[k];
  }
  // No Ring slot any more: plain rings (stats only) are accessories.
  for (const d of db.items ?? []) if ((d.slot as string) === 'ring') { d.slot = 'accessory'; changed = true; }
  // Starting equipment in the old ring slot moves to the slot its item belongs in (if that's free).
  const eq = db.inventory?.startEquip as Record<string, string | undefined> | undefined;
  const r = eq?.ring ? db.items?.find((d) => d.id === eq.ring) : undefined;
  if (eq && 'ring' in eq) { if (r?.slot && !eq[r.slot]) eq[r.slot] = r.id; delete eq.ring; changed = true; }
  return changed;
}
