/**
 * Database → Items and Database → Inventory: the item list with a form for the selected item
 * (name, icon, kind, price, what it restores or which slot it fills, a ring's power and magic cost),
 * and the bag size and what a new game starts with.
 */
import { wornLookForm } from './WornLookEditor';
import { upgradeRestore } from '../game/restore';
import { ailmentChips, buffsField, inflictsField } from './statusFields';
import type { Ailment } from '../world/types';
import { elementSelect, matchupText } from './elementFields';
import { ITEM_ICONS, builtinIcon, builtinIconName, iconGroups, tintCanvas } from '../art/itemIcons';
import { DEFAULT_BAG_SLOTS } from '../game/inventory';
import { EQUIP_SLOTS, RARITIES, RARITY_COLORS, RARITY_NAMES, FIELD_POWERS, type FieldPower, type Rarity, type SpellDef, type EquipSlot, type Gauge, type InventorySetup, type ItemDef, type ItemKind, type ItemLight, type WeaponClass, type WeaponType, type ArmorWeight, type ArmorTypeDef, type WeaponTypeDef, type EssenceTier } from '../world/types';
import { armorTypes, armorWeightOf, weaponTypeName, weaponTypeOf, weaponTypes } from '../game/classes';
import { openArmorTypes, openWeaponTypes } from './armorTypesEditor';
import { FIELD_GLOW, FIELD_USE_NAMES, FIELD_USE_TEXT, POWER_NAMES, carriedUse, itemColor } from '../world/items';
import { FIELD_USES, WEATHER_KINDS, type FieldUseKind, type WeatherKind } from '../world/types';
import { SEASONS, SEASON_NAMES, type Season } from '../world/seasons';
import { horseList } from '../game/horses';
import { ATTRS, ATTR_INFO, type Attr } from '../game/attributes';
import { RANKS, RANK_GAIN, type Rank } from '../game/statRanks';
import { checkbox, field, h, numberInput, select, textInput, toast } from './dom';
import type { EditorStore } from './store';
import { findWeapon, itemSpriteField, loadWeaponList, weaponIcon } from './weaponPicker';
import { itemWeaponSprite } from '../game/combat/weaponSprites';
import { ICON_PATTERNS, applyIconFx, hasIconFx } from '../world/iconFx';
import type { IconPattern } from '../world/types';
import type { WeaponGlow, WeaponTrail } from '../world/types';

export const SLOT_NAMES: Record<EquipSlot, string> = { weapon: 'Melee weapon', shield: 'Shield', ranged: 'Bow', magic: 'Spell shard', armor: 'Armor', accessory: 'Accessory (rings, amulets…)' };
const KIND_NAMES: [ItemKind, string][] = [['consumable', 'Consumable (used up)'], ['material', 'Loot / material (furs, wood, ore…)'], ['equipment', 'Equipment'], ['ammo', 'Arrows'], ['key', 'Key / quest item (always fits, can’t be sold or dropped)']];
const CLASS_NAMES: [string, string][] = [['light', 'Light: daggers, short swords (fast, short reach)'], ['medium', 'Medium: longswords, rapiers'], ['heavy', 'Heavy: greatswords, great axes (slow, long reach, hard hits)']];
const LIGHT_TYPES: [ItemLight['type'], string][] = [['orb', 'Orb: a ball of light floating by the hero, lighting all around'], ['lantern', 'Lantern: a steady glow all around'], ['torch', 'Torch: a flickering flame']];
const GAUGE_LABEL: Record<Gauge, string> = { hp: 'Health', mp: 'Magic', sp: 'Stamina' };

export function defaultLight(type: ItemLight['type']): ItemLight {
  if (type === 'orb') return { type, color: '#ffe6b0', intensity: 2.2, radius: 10 };
  if (type === 'lantern') return { type, color: '#ffd38a', intensity: 2.4, radius: 7 };
  return { type, color: '#ffae55', intensity: 2.8, radius: 8 };
}

/** Image URL for an item icon in the editor (built-in art, or an imported file). */
const urls = new Map<string, string>();
export function iconUrl(store: EditorStore, icon: string | undefined, tint?: string): string {
  const name = builtinIconName(icon);
  if (name || !icon) return builtinIcon(name ?? 'bag', tint).toDataURL();
  const blob = store.files.get(icon);
  if (!blob) return builtinIcon('?').toDataURL();
  let u = urls.get(icon);
  if (!u) { u = URL.createObjectURL(blob); urls.set(icon, u); }
  return u;
}

/**
 * An item's icon as an <img>. Icons cut from a weapon sprite ("sprite") load in the background and fill in
 * (every image showing that weapon's icon updates).
 */
const spriteIconUrls = new Map<string, string>();
export function itemIconImg(store: EditorStore, d: ItemDef, cls = 'item-icon'): HTMLImageElement {
  if (d.icon !== 'sprite') {
    const img = h('img', { src: iconUrl(store, d.icon, d.iconTint), alt: '', class: cls });
    // An imported picture with a tint (recoloured), or icon effects (Update 133): redrawn once it has loaded.
    const tint = d.iconTint && !builtinIconName(d.icon) && d.icon ? d.iconTint : undefined, fx = hasIconFx(d.iconFx) ? d.iconFx : undefined;
    if (tint || fx) {
      img.addEventListener('load', () => {
        if (img.dataset.tinted) return;
        let c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d')!.drawImage(img, 0, 0);
        if (tint) c = tintCanvas(c, tint);
        if (fx) c = applyIconFx(c, fx);
        img.dataset.tinted = '1';
        img.src = c.toDataURL();
      });
    }
    return img;
  }
  const id = itemWeaponSprite(d);
  const fallback = builtinIcon(d.slot === 'ranged' ? 'bow' : d.slot === 'shield' ? 'shield' : 'sword').toDataURL();
  const img = h('img', { src: spriteIconUrls.get(id) ?? fallback, alt: '', class: `${cls} pixel`, 'data-sprite-icon': id });
  if (!spriteIconUrls.has(id)) {
    void loadWeaponList(store).then((wl) => weaponIcon(store, wl, findWeapon(store, wl, id))).then((c) => {
      if (!c) return;
      spriteIconUrls.set(id, c.toDataURL());
      for (const el of document.querySelectorAll<HTMLImageElement>(`img[data-sprite-icon="${CSS.escape(id)}"]`)) el.src = spriteIconUrls.get(id)!;
    });
  }
  return img;
}

/** Load the icon images that items in the database use (so the editor and playtests can show them). */
export async function loadItemIconFiles(store: EditorStore): Promise<void> {
  await Promise.all((store.db.items ?? []).map(async (d) => {
    if (!d.icon || d.icon === 'sprite' || builtinIconName(d.icon) || store.files.has(d.icon)) return;
    try { store.files.set(d.icon, await store.project.readFile(d.icon)); } catch { console.warn(`${d.name}: icon ${d.icon} is missing`); }
  }));
}

function itemId(name: string, taken: (id: string) => boolean): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
  let id = base, n = 2;
  while (taken(id)) id = `${base}_${n++}`;
  return id;
}

export interface ItemsWork { items: ItemDef[]; inventory: InventorySetup; /** The window's armor types (Database → Armor types). */ armorTypes?: ArmorTypeDef[]; /** And weapon types. */ weaponTypes?: WeaponTypeDef[] }

/** Items added in this window: their id follows their name until the database is applied. */
const fresh = new WeakSet<ItemDef>();

/** The item tabs: everything in one list in the game's data, shown in five Database tabs. */
export type ItemCat = 'items' | 'materials' | 'weapons' | 'gear' | 'shards' | 'keyItems';
export const ITEM_CATS: [ItemCat, string, string][] = [
  ['items', 'Items', 'Potions, food and other consumables'],
  ['materials', 'Materials', 'Loot, ore, wood, ingots and other resources'],
  ['weapons', 'Weapons', 'Swords, bows and arrows'],
  ['gear', 'Gear', 'Armor, shields and accessories'],
  ['shards', 'Shards', 'Spell shards and element stones'],
  ['keyItems', 'Key items', 'Quest items, keys and field tools'],
];
/** Which tab an item is listed in. */
export function itemCategory(d: ItemDef): ItemCat {
  if (d.kind === 'key') return 'keyItems';
  if (d.kind === 'ammo') return 'weapons';
  if (d.kind === 'equipment') return d.slot === 'weapon' || d.slot === 'ranged' ? 'weapons' : d.slot === 'magic' ? 'shards' : 'gear';
  if (d.kind === 'material' && d.essence) return 'shards';
  if (d.kind === 'material') return 'materials';
  return 'items';
}
/** A new entry for a tab. */
function newItem(cat: ItemCat, id: string): ItemDef {
  switch (cat) {
    case 'weapons': return { id, name: 'New weapon', kind: 'equipment', slot: 'weapon', icon: 'builtin:sword', price: 50, weapon: { class: 'light', damage: 8 } };
    case 'gear': return { id, name: 'New armor', kind: 'equipment', slot: 'armor', icon: 'builtin:armor', price: 50, defense: 4 };
    case 'shards': return { id, name: 'New shard', kind: 'equipment', slot: 'magic', icon: 'builtin:shard_frost', price: 80, spell: defaultSpell() };
    case 'keyItems': return { id, name: 'New key item', kind: 'key', icon: 'builtin:key' };
    case 'materials': return { id, name: 'New material', kind: 'material', icon: 'builtin:log', price: 5 };
    default: return { id, name: 'New item', kind: 'consumable', icon: 'builtin:potion', price: 10, restore: { hp: 20 } };
  }
}

/**
 * One of the item tabs. `rerender` redraws the whole tab (after adding or deleting an item); `goto` opens another
 * item tab (an item whose kind or slot changes moves to its tab, still selected).
 */
export function itemsTab(store: EditorStore, work: ItemsWork, state: { sel: number; cur?: ItemDef }, rerender: () => void, cat: ItemCat = 'items', goto?: (cat: ItemCat, d: ItemDef) => void): HTMLElement[] {
  const all = work.items;
  // The item being edited changed tab (its kind or slot): follow it there.
  if (state.cur && all.includes(state.cur) && itemCategory(state.cur) !== cat && goto) { const d = state.cur; state.cur = undefined; goto(itemCategory(d), d); return []; }
  const items = all.filter((d) => itemCategory(d) === cat);
  state.sel = Math.max(0, Math.min(state.sel, items.length - 1));
  const label = ITEM_CATS.find(([c]) => c === cat)![1];
  const add = () => {
    const base = newItem(cat, '');
    base.id = itemId(base.name, (x) => all.some((d) => d.id === x));
    fresh.add(base);
    all.push(base);
    state.sel = items.length;
    rerender();
  };
  const list = h('div', { class: 'item-list', role: 'listbox', 'aria-label': label },
    ...items.map((d, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } },
      itemIconImg(store, d), h('span', itemColor(d) ? { style: `color:${itemColor(d)}` } : {}, d.name || '(no name)'))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, `+ New ${{ items: 'item', materials: 'material', weapons: 'weapon', gear: 'gear', shards: 'shard', keyItems: 'key item' }[cat]}`));
  const d = items[state.sel];
  state.cur = d;
  const form = h('div', { class: 'item-form' });
  if (!d) form.append(h('p', { class: 'note' }, `No ${label.toLowerCase()} yet. Items are handed out with the “Give item” event command, put in chests (Inspector → Create chest here), or sold in shops (“Open shop”).`));
  else form.append(...itemForm(store, work, d, rerender, () => { all.splice(all.indexOf(d), 1); state.sel = Math.max(0, state.sel - 1); state.cur = undefined; rerender(); }));
  return [h('div', { class: 'items-layout' }, list, form)];
}

function itemForm(store: EditorStore, work: ItemsWork, d: ItemDef, rerender: () => void, remove: () => void): HTMLElement[] {
  let icon = itemIconImg(store, d, 'item-icon big');
  const refreshIcon = () => { const n = itemIconImg(store, d, 'item-icon big'); icon.replaceWith(n); icon = n; };
  const rowName = () => rerender();
  const out: HTMLElement[] = [
    h('div', { class: 'item-head' }, icon,
      field('Name', textInput(d.name, (v) => {
        d.name = v.trim() || d.name;
        // A new item's id follows its name (unless it has an imported icon saved under the old id).
        if (fresh.has(d) && builtinIconName(d.icon)) d.id = itemId(d.name, (x) => x !== d.id && work.items.some((o) => o.id === x));
        rowName();
      }, { 'aria-label': 'Item name' })),
      h('div', { class: 'item-id', title: 'Used by events and saves; it doesn’t change when you rename the item.' }, `id: ${d.id}`)),
    field('Description', textInput(d.description ?? '', (v) => (d.description = v.trim() || undefined), { placeholder: 'Shown in the bag and shops' })),
    field('Icon', iconPicker(store, d, refreshIcon, rerender)),
    iconFxForm(d, refreshIcon, rerender),
    h('div', { class: 'field-row' },
      field('Kind', select(KIND_NAMES, d.kind, (v) => {
        d.kind = v as ItemKind;
        if (d.kind === 'equipment') { d.slot ??= 'accessory'; delete d.restore; delete d.restorePct; delete d.restorePercent; delete d.stack; }
        else { if (!(d.kind === 'key' && d.exp?.all)) delete d.exp; delete d.slot; delete d.protects; if (d.kind !== 'ammo') delete d.inflicts; if (!(d.kind === 'key' && d.tool === 'light')) delete d.light; delete d.ring; delete d.weapon; delete d.defense; delete d.magicDefense; delete d.bonus; delete d.crit; delete d.glow; delete d.trail; delete d.sprite; delete d.rarity; delete d.spell; if (d.icon === 'sprite') d.icon = 'builtin:bag'; }
        if (d.kind === 'ammo') { d.ammo ??= { damage: 2 }; delete d.restore; delete d.restorePct; delete d.restorePercent; } else delete d.ammo;
        if (d.kind === 'consumable') d.restore ??= { hp: 20 };
        if (d.kind === 'key' || d.kind === 'material') { delete d.restore; delete d.restorePct; delete d.restorePercent; }
        if (d.kind !== 'consumable') { delete d.cures; delete d.buffs; }
        if (d.kind === 'key') delete d.stack; else delete d.tool;
        rerender();
      })),
      field('Price', numberInput(d.price ?? 0, (v) => (d.price = Math.max(0, Math.round(v)) || undefined), { step: 1, min: 0 }), 'Shops sell for this and buy back for half. 0: not sold unless a shop sets a price.'),
      d.kind === 'key' ? h('span') : checkbox('Cannot be sold (shops won’t buy it)', !!d.noSell, (v) => { if (v) d.noSell = true; else delete d.noSell; }),
      d.kind === 'consumable' || d.kind === 'material' ? field('Stack', numberInput(d.stack ?? 64, (v) => { const n = Math.max(1, Math.min(999, Math.round(v))); d.stack = n === 64 ? undefined : n; }, { step: 1, min: 1, max: 999 }), 'How many fit in one bag slot (64 by default); more take another slot.') : h('span')),
  ];
  if (d.kind === 'material' || d.kind === 'consumable') {
    out.push(h('div', { class: 'field-row' }, field('Fire fuel: adds (game hours)', numberInput(d.fuel ?? 0, (v) => { const n = Math.max(0, Math.round(v * 4) / 4); if (n) d.fuel = n; else delete d.fuel; }, { step: 0.5, min: 0 }),
      '0: not fuel. Otherwise the player can feed it to a fire that burns out (action button at the fire): a twig might add 0.5, a log 2, coal 6.')));
  }
  if (d.kind === 'material') {
    // Ore (or an ingot that makes a better one): smelted at a forge.
    const others = work.items.filter((x) => x !== d && x.kind === 'material').map((x) => [x.id, x.name] as [string, string]);
    out.push(h('div', { class: 'field-row' },
      field('At a forge, smelts into', select([['', 'Nothing (not ore)'], ...others], d.smelt?.into ?? '', (v) => { if (v) d.smelt = { ...d.smelt, into: v }; else delete d.smelt; rerender(); }),
        'Ore becomes ingots (Iron Ore → Iron Ingot); an ingot can make a better one (Iron Ingot → Steel Ingot).'),
      d.smelt ? field('How many for one', numberInput(d.smelt.need ?? 2, (v) => { const n = Math.max(1, Math.round(v)); d.smelt!.need = n === 2 ? undefined : n; }, { step: 1, min: 1 })) : h('span')));
    // An element stone: worn in a hero's Element slots (Database → Combat → Element stones sets what each kind gives).
    out.push(h('div', { class: 'field-row' },
      field('Element stone', select([['', 'No'], ['fragment', 'Fragment'], ['shard', 'Shard'], ['heart', 'Heart Stone']], d.essence?.tier ?? '', (v) => {
        if (v) d.essence = { element: d.essence?.element ?? 'fire', tier: v as EssenceTier }; else delete d.essence; rerender();
      }), 'Worn in a hero’s Element slot: it gives them its element (and its weaknesses) and stronger hits of it. Kept in the bag’s Shards tab.'),
      d.essence ? field('Of element', elementSelect(d.essence.element, (e) => { if (d.essence && e && e !== 'neutral') d.essence.element = e; rerender(); })) : h('span')));
  }
  if (d.kind === 'consumable') {
    upgradeRestore(d);
    const r = (d.restore ??= {});
    const pctBox = (g: Gauge) => field(`${GAUGE_LABEL[g]} %`, numberInput(d.restorePct?.[g] ?? 0, (v) => {
      const n = Math.max(0, Math.min(100, Math.round(v))), p = (d.restorePct ??= {});
      if (n) p[g] = n; else delete p[g];
      if (!Object.keys(p).length) delete d.restorePct;
    }, { step: 1, min: 0, max: 100 }), `Percent of the maximum, added to the amount (10 and 30 % = 10 + 30% of max ${g.toUpperCase()}).`);
    out.push(field('Level up (levels)', numberInput(d.levelUp ?? 0, (v) => { const n = Math.max(0, Math.min(99, Math.round(v))); if (n) d.levelUp = n; else delete d.levelUp; }, { step: 1, min: 0, max: 99 }),
      'Rare Candy: used from the bag, the hero gains exactly the EXP to their next level (this many times), with the level up as usual. 0: not a level-up item.'));
    out.push(h('div', { class: 'field-row' },
      field('Warms / cools', numberInput(d.warms ?? 0, (v) => { const n = Math.max(-100, Math.min(100, Math.round(v))); if (n) d.warms = n; else delete d.warms; }, { step: 5, min: -100, max: 100 }),
        'Out of battle: moves the drinker’s cold / heat meter back toward normal. + warms (a Hot Cocoa: 100 takes them from Freezing all the way back), − cools (a Chilled Tea). 0: neither.'),
      field('Camp value', numberInput(d.camp ?? 0, (v) => { const n = Math.max(0, Math.min(50, Math.round(v))); if (n) d.camp = n; else delete d.camp; }, { step: 1, min: 0, max: 50 }),
        'What it’s worth as camping supplies when resting at a camp: 25 in all for Rested, 50 for Well Rested. 0: not a camping supply.')));
    out.push(checkbox('Revives: brings a knocked-out hero back with what it restores (at least 1 HP); it only works on the knocked out, and other items can’t help them', !!d.revive, (v) => { if (v) d.revive = true; else delete d.revive; }));
    out.push(h('section', { class: 'db-section' }, h('h3', {}, 'Using it restores'),
      h('div', { class: 'field-row' }, ...(['hp', 'mp', 'sp'] as Gauge[]).flatMap((g) => [
        field(GAUGE_LABEL[g], numberInput(r[g] ?? 0, (v) => { const n = Math.max(0, Math.round(v)); if (n) r[g] = n; else delete r[g]; }, { step: 1, min: 0 })),
        ...(g === 'sp' ? [] : [pctBox(g)])])),
      field('Cures', ailmentChips(() => d.cures, (v) => { if (v) d.cures = v; else delete d.cures; }, rerender, 'Cures', { all: true }),
        'Zombie is only cured when it’s chosen itself. A zombie is hurt by healing, so a Zombie cure that also heals cures first, then heals.'),
      buffsField(() => d.buffs, (v) => { if (v) d.buffs = v; else delete d.buffs; }, rerender),
      statRankField(d, rerender, 'For good: a Potion of Defense can raise Defence’s rank from C to A, so it grows faster every level after.'),
      h('p', { class: 'note' }, 'An item isn’t used up when it would do nothing (health already full, say).')));
  }
  if (d.kind === 'equipment') {
    out.push(h('section', { class: 'db-section' }, h('h3', {}, 'Equipment'),
      field('Slot', select(EQUIP_SLOTS.map((s) => [s, SLOT_NAMES[s]] as [string, string]), d.slot ?? 'accessory', (v) => {
        d.slot = v as EquipSlot;
        delete d.ring;
        if (d.slot !== 'magic') delete d.light;
        if (d.slot === 'weapon') d.weapon = { class: d.weapon && d.weapon.class !== 'bow' ? d.weapon.class : 'light', damage: d.weapon?.damage ?? 8 };
        else if (d.slot === 'ranged') d.weapon = { class: 'bow', damage: d.weapon?.damage ?? 8 };
        else delete d.weapon;
        if (d.slot !== 'armor' && d.slot !== 'accessory' && d.slot !== 'shield') { delete d.defense; delete d.magicDefense; }
        if (d.slot !== 'weapon' && d.slot !== 'ranged' && d.slot !== 'shield') delete d.sprite;
        if (d.slot !== 'weapon' && d.slot !== 'ranged') delete d.glow;
        if (d.slot !== 'weapon') delete d.trail;
        if (d.slot !== 'weapon' && d.slot !== 'ranged' && d.slot !== 'magic') { delete d.element; delete d.inflicts; }
        if (d.slot === 'magic') { d.spell ??= defaultSpell(); if (!d.icon.startsWith('builtin:shard_') && builtinIconName(d.icon)) d.icon = 'builtin:shard_frost'; }
        else delete d.spell;
        if (d.slot !== 'weapon' && d.slot !== 'ranged' && d.slot !== 'shield' && d.icon === 'sprite') d.icon = 'builtin:bag';
        rerender();
      })),
      rarityField(d, rerender),
      ...(d.slot === 'weapon' || d.slot === 'ranged' || (d.slot === 'magic' && !d.spell?.power) ? [field('Element', elementSelect(d.element, (e) => { if (e && e !== 'neutral') d.element = e; else delete d.element; rerender(); }), matchupText(d.element))] : []),
      d.slot === 'weapon' || d.slot === 'ranged' ? weaponForm(d, work, rerender) : d.slot === 'magic' ? spellForm(d, rerender) : defenseForm(d, work, rerender),
      ...(d.slot === 'armor' || d.slot === 'accessory' || d.slot === 'shield' ? [wornLookForm(store, d, rerender)] : []),
      ...(() => { const f = itemSpriteField(store, d, rerender); return f ? [field('Sprite (animated characters)', f, 'What LPC characters hold. Characters without animations show the icon.')] : []; })(),
      ...(d.slot === 'weapon' || d.slot === 'ranged' ? [effectsForm(d)] : []),
      ...(d.slot === 'weapon' ? [checkbox('Breaks rock (a pickaxe, a hammer): mines boulders and ore veins', !!d.mines, (v) => { if (v) d.mines = true; else delete d.mines; })] : []),
      ...(d.slot !== 'magic' ? [field('Material (forge upgrades)', select([['none', 'None (can’t be upgraded)'], ...work.items.filter((x) => x.kind === 'material').map((x) => [x.id, x.name] as [string, string])],
        d.material ?? 'none', (v) => { d.material = v; }), 'A forge upgrades it with ingots of this (Iron Ingot, Steel Ingot…): each upgrade adds a little damage or defence (Database → Combat → Forges).')] : []),
      bonusForm(d),
      statRankField(d, rerender, 'While worn, the stat grows at least this fast when the hero levels up.'),
      ...(d.slot === 'weapon' || d.slot === 'ranged' || (d.slot === 'magic' && !d.spell?.power) ? [inflictsField(() => d.inflicts, (v) => { if (v) d.inflicts = v; else delete d.inflicts; }, rerender)] : []),
      ...(d.slot === 'accessory' ? [field('EXP Share: % for its wearer when they sit a battle out', numberInput(d.exp?.share ?? 0, (v) => { const n = Math.max(0, Math.min(100, Math.round(v))); if (n) d.exp = { share: n }; else delete d.exp; }, { step: 5, min: 0, max: 100 }),
        'Only fighters earn EXP. Worn by someone on the bench, this gives them that percent of the foes’ EXP (0: not an EXP Share).')] : []),
      field('Wards off', ailmentChips(() => d.protects, (v) => { if (v) d.protects = v as Ailment[]; else delete d.protects; }, rerender, 'Wards off'), 'While worn, the hero can’t get these.'),
      ...(d.slot !== 'magic' ? [usersField(store, d, rerender)] : [])));
  }
  if (d.kind === 'ammo') {
    const a = (d.ammo ??= { damage: 2 });
    out.push(h('section', { class: 'db-section' }, h('h3', {}, 'Arrows'),
      field('Extra damage', numberInput(a.damage, (v) => (a.damage = Math.max(0, Math.round(v))), { step: 1, min: 0 }), 'Added to the bow’s damage.'),
      field('Element', elementSelect(d.element, (e) => { if (e && e !== 'neutral') d.element = e; else delete d.element; rerender(); }), d.element ? matchupText(d.element) : 'Normal arrows hit with the bow’s element.'),
      checkbox('Never run out (shown as ∞; one in the bag is enough; can’t be sold or dropped)', !!a.infinite, (v) => { a.infinite = v || undefined; rerender(); }),
      inflictsField(() => d.inflicts, (v) => { if (v) d.inflicts = v; else delete d.inflicts; }, rerender, 'Ailments these arrows can give (with the bow’s)'),
      a.infinite ? h('span') : field('Stack', numberInput(d.stack ?? 64, (v) => { const n = Math.max(1, Math.min(999, Math.round(v))); d.stack = n === 64 ? undefined : n; }, { step: 1, min: 1 }), 'How many fit in one bag slot (64 by default).'),
      h('p', { class: 'note' }, 'The player picks which arrows to shoot in the bag (Nock these arrows). When they run out, the never-ending ones are used.')));
  }
  // Key items: a field use (switched on and off from the bag or a quick slot).
  if (d.kind === 'key') {
    out.push(h('section', { class: 'db-section' }, h('h3', {}, 'Field use'),
      field('Use', select([['', 'None (a plain key item)'], ...FIELD_POWERS.map((p) => [p, POWER_NAMES[p]] as [string, string]), ...FIELD_USES.map((u) => [`f:${u}`, FIELD_USE_NAMES[u]] as [string, string])], d.field ? `f:${d.field.use}` : d.tool ?? '', (v) => {
        delete d.field;
        if (v.startsWith('f:')) { delete d.tool; delete d.exp; d.field = { use: v.slice(2) as FieldUseKind }; if (!d.description) d.description = FIELD_USE_TEXT[d.field.use]; }
        else if (v) { d.tool = v as FieldPower; delete d.exp; } else delete d.tool;
        if (d.tool === 'light') d.light ??= defaultLight('lantern'); else delete d.light;
        rerender();
      }), 'Light: a lantern, torch or floating orb lights the way in the dark. Water Walk: walk on water of any depth (it switches off back on land). The player switches it on and off in the bag, or puts it on a quick slot (the D-pad). No magic needed.'),
      d.tool === 'light' ? lightForm(d, rerender) : h('span'),
      d.field ? fieldUseForm(store, d) : h('span'),
      d.tool || d.field ? h('span') : checkbox('Saddle: using it from the bag sends the rented horse home (stables give one with a horse)', !!d.saddle, (v) => { if (v) d.saddle = true; else delete d.saddle; }),
      d.tool || d.field ? h('span') : checkbox('Lets the party swim: carrying it, they can swim in deep water (without one, deep water stops them)', !!d.swim, (v) => { if (v) d.swim = true; else delete d.swim; }),
      d.tool || d.field ? h('span') : field('EXP All: % for everyone sitting a battle out', numberInput(d.exp?.all ? d.exp.share : 0, (v) => { const n = Math.max(0, Math.min(100, Math.round(v))); if (n) d.exp = { share: n, all: true }; else delete d.exp; }, { step: 5, min: 0, max: 100 }),
        'While held and switched on (the player switches it on and off in the bag’s Key items), everyone on the bench gets this percent of the foes’ EXP. Fighters always get the most. 0: not an EXP All.')));
  }
  // Favourite of / disliked by (Update 127): used on a hero whose roleplay answer matches, it moves their view of
  // whoever used it (in battle the hero acting, out of battle the hero you play).
  if (d.kind === 'consumable') {
    const fields = store.db.roleplay ?? [];
    const rows = (d.reactions ?? []).map((r, k) => h('div', { class: 'field-row' },
      h('span', { class: 'note' }, 'Heroes whose'),
      select(fields.length ? fields.map((f) => [f.id, f.title] as [string, string]) : [['', '(add titles in Party → Roleplay)']], r.field, (v) => (r.field = v), { 'aria-label': 'Roleplay title' }),
      h('span', { class: 'note' }, 'is'),
      textInput(r.value, (v) => (r.value = v.trim()), { placeholder: 'Ramen', 'aria-label': 'Answer' }),
      select([['1', 'love it (+)'], ['-1', 'dislike it (−)']], r.points < 0 ? '-1' : '1', (v) => (r.points = Math.abs(r.points || 1) * Number(v)), { 'aria-label': 'Like or dislike' }),
      numberInput(Math.abs(r.points), (v) => (r.points = Math.sign(r.points || 1) * Math.max(0, Math.round(v))), { step: 1, min: 0, max: 50, 'aria-label': 'Points', class: 'db-num' }),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Remove', onclick: () => { d.reactions!.splice(k, 1); if (!d.reactions!.length) delete d.reactions; rerender(); } }, '✕')));
    out.push(h('section', { class: 'db-section' }, h('h3', {}, 'Favourite of / disliked by'),
      h('p', { class: 'note' }, 'Used on a hero whose roleplay answer matches (Favourite food is Ramen, say), their view of whoever used it goes up (or down) by the points: in battle the hero who used it, out of battle the hero you play.'),
      ...rows,
      h('button', { type: 'button', class: 'btn small', disabled: !fields.length, onclick: () => { (d.reactions ??= []).push({ field: fields[0]?.id ?? '', value: '', points: 1 }); rerender(); } }, '+ Add a reaction')));
  }
  // Lockpicks (Update 119): one is used up when a pick snaps.
  if (d.kind !== 'equipment') out.push(h('section', { class: 'db-section' }, h('h3', {}, 'Lockpicking'),
    checkbox('Lockpick: picking a lock needs one in the bag, and a snapped pick uses one up (with no lockpick items in the game, picking is free)', !!d.lockpick, (v) => { if (v) d.lockpick = true; else delete d.lockpick; })));
  // Fishing: a rod (any item kind; with one in the bag the hero can fish), or a fish (its usual size, for Records).
  out.push(h('section', { class: 'db-section' }, h('h3', {}, 'Fishing'),
    checkbox('Fishing rod: with this in the bag, the hero can fish at fishing spots (Map editor → Water → Fishing)', !!d.rod, (v) => { if (v) d.rod = { power: d.rod?.power ?? 0 }; else delete d.rod; rerender(); }),
    d.rod ? field('Rod power', numberInput(d.rod.power ?? 0, (v) => { d.rod = { power: Math.max(0, Math.min(100, Math.round(v))) }; }, { min: 0, max: 100, step: 5 }), '0 … 100: bites come sooner, the hero has a little longer to react, and rare catches are likelier. The best rod in the bag is used.') : h('span'),
    d.kind === 'consumable' || d.kind === 'material' ? checkbox('It’s a fish (each catch gets a length; Records keep the biggest)', !!d.fish, (v) => { if (v) d.fish = { size: d.fish?.size ?? 30 }; else delete d.fish; rerender(); }) : h('span'),
    d.fish ? field('Usual length (cm)', numberInput(d.fish.size, (v) => { d.fish = { size: Math.max(1, Math.round(v)) }; }, { min: 1, step: 1 }), 'Each catch is 70 % … 135 % of this.') : h('span'),
    h('p', { class: 'note' }, 'What can be caught where is set per fishing spot, in the Map editor’s Water tab → Fishing.')));
  out.push(h('div', { class: 'item-foot' }, h('button', { type: 'button', class: 'btn danger', onclick: () => {
    const used = usedBy(work, d.id);
    if (used && !confirm(`${d.name} is ${used}. Delete it anyway?`)) return;
    remove();
  } }, 'Delete item')));
  return out;
}

/** Equipment: which heroes can use it (none ticked: everyone). In the game, the others are greyed out for it. */
function usersField(store: EditorStore, d: ItemDef, rerender: () => void): HTMLElement {
  const heroes = store.db.heroes ?? [];
  if (heroes.length < 2) return h('span');
  const on = new Set(d.users ?? []);
  return field('Who can use it', h('div', { class: 'users-row', style: 'display:flex;flex-wrap:wrap;gap:4px 14px' }, ...heroes.map((x) => checkbox(x.name, on.has(x.id), (v) => {
    if (v) on.add(x.id); else on.delete(x.id);
    const list = heroes.map((y) => y.id).filter((id) => on.has(id));
    if (list.length && list.length < heroes.length) d.users = list; else delete d.users;
    rerender();
  }))), d.users?.length ? `Only ${heroes.filter((x) => d.users!.includes(x.id)).map((x) => x.name).join(', ')}: the others are greyed out for it in Equipment.` : 'Everyone (tick heroes to keep it to them).');
}

/** A new spell shard's spell. */
export const defaultSpell = (): SpellDef => ({ damage: 14, mp: 6, color: '#7ac8ff', light: { intensity: 1.2, radius: 3 } });

/** Rarity: the colour the item's name is shown in (weapons, armor, shards and other equipment). */
function rarityField(d: ItemDef, rerender: () => void): HTMLElement {
  const r = d.rarity ?? 'common';
  const dot = h('span', { class: 'rarity-dot', style: `background:${RARITY_COLORS[r]}` });
  return field('Rarity', h('div', { class: 'rarity-pick' }, dot,
    select(RARITIES.map((x) => [x, RARITY_NAMES[x]] as [string, string]), r, (v) => { d.rarity = v === 'common' ? undefined : v as Rarity; rerender(); }, { 'aria-label': 'Rarity' })),
  'Its name shows in this colour in the bag, equipment, shops and the HUD: grey common, green uncommon, blue rare, purple legendary, orange mythic. Uncommon and better glow when dropped.');
}

const FIELD_HINTS: Record<FieldPower, string> = {
  light: 'Casting it (key 3, or F) calls up its light around the hero; casting again puts it out. Drains magic while it shines.',
  waterWalk: 'Casting it (key 3, or F) lets the hero walk on water of any depth instead of swimming (no stamina), draining magic; it ends when they step back on land. If magic runs out over deep water, the hero is put back on the shore.',
};

/** A spell shard: a bolt (damage, magic, speed, colour, the light in the hands), or a field spell (Light, Water Walk). */
function spellForm(d: ItemDef, rerender: () => void): HTMLElement {
  const sp = (d.spell ??= defaultSpell());
  const kind = select([['bolt', 'A bolt (an attack)'], ...FIELD_POWERS.map((p) => [p, `${POWER_NAMES[p]} (turns it into a key item)`] as [string, string])], sp.power ?? 'bolt', (v) => {
    if (v === 'bolt') { d.spell = defaultSpell(); delete d.light; }
    else {
      // Field uses are key items now (a lantern, water-walking boots), switched on from the bag or the B button.
      const power = v as FieldPower;
      d.kind = 'key'; d.tool = power;
      delete d.slot; delete d.spell; delete d.rarity; delete d.element; delete d.inflicts; delete d.price;
      if (power === 'light') d.light ??= defaultLight('lantern'); else delete d.light;
    }
    rerender();
  });
  if (sp.power) {
    const power = sp.power;
    const num = (v: number | undefined, set: (n: number | undefined) => void) =>
      numberInput(v ?? 0, (n) => set(Math.max(0, Math.round(n * 10) / 10) || undefined), { step: 0.5, min: 0 });
    const glow = h('input', { type: 'color', value: sp.glow ?? FIELD_GLOW[power], 'aria-label': 'Glow colour' });
    glow.addEventListener('input', () => { sp.glow = glow.value === FIELD_GLOW[power] ? undefined : glow.value; sp.color = glow.value; });
    return h('div', { class: 'item-ring' },
      field('Spell', kind),
      h('p', { class: 'note' }, FIELD_HINTS[power]),
      h('div', { class: 'field-row' },
        field('MP to switch on', num(sp.mp, (n) => (sp.mp = n ?? 0)), 'Spent once each time it’s cast.'),
        field('MP per second while on', num(sp.mpPerSecond, (n) => (sp.mpPerSecond = n)), 'When magic runs out, it ends.'),
        field('Glow colour', glow, 'The hero glows this colour while it’s on.')),
      power === 'light' ? lightForm(d, rerender) : h('span'));
  }
  const li = (sp.light ??= { intensity: 1.2, radius: 3 });
  const color = h('input', { type: 'color', value: sp.color, 'aria-label': 'Spell colour', oninput: () => (sp.color = color.value) });
  const num = (v: number | undefined, set: (n: number) => void, o: { step: number; min: number; max?: number }) => numberInput(v ?? 0, set, o);
  return h('div', { class: 'item-ring' },
    field('Spell', kind),
    h('div', { class: 'field-row' },
      field('Damage', num(sp.damage, (v) => (sp.damage = Math.max(0, Math.round(v))), { step: 1, min: 0 })),
      field('MP a cast', num(sp.mp, (v) => (sp.mp = Math.max(0, Math.round(v))), { step: 1, min: 0 })),
      field('Speed (tiles/s)', numberInput(sp.speed ?? 0, (v) => (sp.speed = v > 0 ? v : undefined), { step: 0.5, min: 0 }), '0: Database → Combat’s spell speed.'),
      field('Range (tiles)', numberInput(sp.range ?? 0, (v) => (sp.range = v > 0 ? v : undefined), { step: 0.5, min: 0 }), '0: Database → Combat’s spell range.')),
    h('div', { class: 'field-row' },
      field('Colour', color, 'The bolt, its sparks, the glow in the hands, and its light.'),
      field('Hand light brightness', num(li.intensity ?? 1.2, (v) => (li.intensity = Math.max(0, Math.min(3, v))), { step: 0.1, min: 0, max: 3 }), '0: no light (still glows).'),
      field('Hand light reach (tiles)', num(li.radius ?? 3, (v) => (li.radius = Math.max(1, Math.min(10, v))), { step: 0.5, min: 1, max: 10 }))),
    h('p', { class: 'note' }, 'One shard is equipped at a time, in the magic slot. Key 3 casts it (Y on a controller switches to it); its icon floats in the hero’s hands while it’s readied. Give shards as loot, quest rewards, in shops, or from a skill (Database → Skills → Gives spell shard).'));
}

/** A melee weapon's class and damage, or a bow's damage. */
function weaponForm(d: ItemDef, work: ItemsWork, rerender: () => void): HTMLElement {
  const w = (d.weapon ??= { class: d.slot === 'ranged' ? 'bow' : 'light', damage: 8 });
  const dmg = field('Damage', numberInput(w.damage, (v) => (w.damage = Math.max(0, Math.round(v))), { step: 1, min: 0 }),
    w.class === 'bow' ? 'Plus the arrow’s extra damage, scaled by how far the bow was drawn.' : 'Each swing; the third swing of a combo hits harder.');
  // Its type: what classes are trained with (Database → Classes → Weapons and armor).
  const db = { weaponTypes: work.weaponTypes };
  const guess = weaponTypeOf({ ...d, weapon: { ...w, type: undefined } }, db);
  const type = field('Type', h('div', { class: 'sw-input' },
    select([['', `Automatic (${guess ? weaponTypeName(guess, db) : 'from the name'})`], ...weaponTypes(db).map((t) => [t.id, t.one || t.name] as [string, string]),
      ...(w.type && !weaponTypes(db).some((t) => t.id === w.type) ? [[w.type, `${w.type} (removed: automatic)`] as [string, string]] : [])],
      w.type ?? '', (v) => { if (v) w.type = v as WeaponType; else delete w.type; }),
    work.weaponTypes ? h('button', { type: 'button', class: 'mini-btn', title: 'Add, rename or remove weapon types', 'aria-label': 'Edit weapon types', onclick: () => openWeaponTypes(work.weaponTypes!, rerender) }, '☰') : h('span')),
    'For classes and skills: which weapons each is trained with (☰ edits the types). Automatic guesses from the name.');
  const aim = h('div', { class: 'field-row' },
    field('Accuracy %', numberInput(w.accuracy ?? 100, (v) => { const n = Math.max(10, Math.min(200, Math.round(v))); if (n === 100) delete w.accuracy; else w.accuracy = n; }, { step: 5, min: 10, max: 200 }), 'Turn-based: of the wielder’s aim (from Dexterity). 100 as normal; a dagger might be 105, a great axe 90.'),
    checkbox('Never misses', !!w.sure, (v) => { if (v) w.sure = true; else delete w.sure; }));
  if (w.class === 'bow') return h('div', { class: 'item-ring' }, h('div', { class: 'field-row' }, dmg, type), aim, h('p', { class: 'note' }, 'Key 2: hold to draw, let go to shoot. Draw time, arrow speed and lock-on range are in Database → Combat.'));
  return h('div', { class: 'item-ring' },
    h('div', { class: 'field-row' }, field('Class', select(CLASS_NAMES, w.class, (v) => (w.class = v as WeaponClass))), type),
    dmg, aim,
    h('p', { class: 'note' }, 'Key 1 swings. Each class’s swing speed, reach and damage multiplier are in Database → Combat.'));
}

/** Armor and accessories: defence against hits and against spells. */
function defenseForm(d: ItemDef, work: ItemsWork, rerender: () => void): HTMLElement {
  const db = { armorTypes: work.armorTypes };
  const types = armorTypes(db);
  const auto = types.find((t) => t.id === armorWeightOf({ ...d, armorWeight: undefined }, db))?.name ?? types[0]?.name ?? '';
  const weight = d.slot === 'armor' ? field('Armor type', h('div', { class: 'sw-input' },
    select([['', `Automatic (${auto})`], ...types.map((t) => [t.id, t.note ? `${t.name} (${t.note})` : t.name] as [string, string]), ...(d.armorWeight && !types.some((t) => t.id === d.armorWeight) ? [[d.armorWeight, `${d.armorWeight} (removed: automatic)`] as [string, string]] : [])],
      d.armorWeight ?? '', (v) => { if (v) d.armorWeight = v as ArmorWeight; else delete d.armorWeight; }),
    work.armorTypes ? h('button', { type: 'button', class: 'mini-btn', title: 'Add, rename or remove armor types', 'aria-label': 'Edit armor types', onclick: () => openArmorTypes(work.armorTypes!, rerender) }, '☰') : h('span')),
    'For classes: which armor each is trained with (☰ edits the types). Automatic guesses from the name.') : null;
  return h('div', { class: 'item-ring' }, weight ?? h('span'), h('div', { class: 'field-row' },
    field('Defence', numberInput(d.defense ?? 0, (v) => (d.defense = Math.max(0, Math.round(v)) || undefined), { step: 1, min: 0 }),
      'Against hits and arrows. Damage taken is reduced by defence ÷ (defence + 50): 10 takes away 17%, 50 takes away half.'),
    field('Magic defence', numberInput(d.magicDefense ?? 0, (v) => (d.magicDefense = Math.max(0, Math.round(v)) || undefined), { step: 1, min: 0 }),
      'The same against spells.'),
    field('Warmth (0–10)', numberInput(d.warmth ?? 0, (v) => { const n = Math.max(0, Math.min(10, Math.round(v))); if (n) d.warmth = n; else delete d.warmth; }, { step: 1, min: 0, max: 10 }),
      'Out of battle: how warm it keeps its wearer. A hero’s gear adds up (10 at most): 10 keeps the cold off best, 0 keeps them coolest in the heat (a fur cloak in the snow, light clothes in the desert).')));
}

/** Any equipment: stats it adds (or takes away) while worn, and extra critical hit chance. */
function bonusForm(d: ItemDef): HTMLElement {
  const b = d.bonus ?? {};
  const set = (k: Attr, v: number) => { const n = Math.max(-99, Math.min(99, Math.round(v))); if (n) b[k] = n; else delete b[k]; if (!Object.keys(b).length) delete d.bonus; };
  return h('div', { class: 'item-ring' },
    h('div', { class: 'section-label' }, 'While worn'),
    h('div', { class: 'field-row bonus-row' },
      ...ATTRS.map((k) => field(ATTR_INFO[k].short, numberInput(b[k] ?? 0, (v) => { d.bonus ??= b; set(k, v); }, { step: 1, min: -99, max: 99, 'aria-label': `${ATTR_INFO[k].name} bonus` }))),
      field('Crit %', numberInput(d.crit ?? 0, (v) => (d.crit = Math.max(-100, Math.min(100, Math.round(v * 10) / 10)) || undefined), { step: 1, 'aria-label': 'Critical hit chance bonus' }))),
    h('p', { class: 'note' }, 'Added to the hero’s Strength, Dexterity, Defence, Magic and Magic Defence (negative takes away: a heavy axe might cost Dexterity). Critical hits start at 5%.'));
}

function lightForm(d: ItemDef, rerender: () => void): HTMLElement {
  const l = (d.light ??= defaultLight('orb'));
  const color = h('input', { type: 'color', value: l.color, 'aria-label': 'Light colour', oninput: () => (l.color = color.value) });
  return h('div', { class: 'item-light' },
    field('Light', select(LIGHT_TYPES, l.type, (v) => { d.light = { ...defaultLight(v as ItemLight['type']), color: l.color === defaultLight(l.type).color ? defaultLight(v as ItemLight['type']).color : l.color }; rerender(); })),
    h('div', { class: 'field-row' },
      field('Colour', color),
      field('Brightness', numberInput(l.intensity, (v) => (l.intensity = Math.max(0, v)), { step: 0.2, min: 0 })),
      field('Reach (tiles)', numberInput(l.radius, (v) => (l.radius = Math.max(1, v)), { step: 0.5, min: 1 })),
      h('span')),
    checkbox('Casts shadows (looks great; costs some speed)', !!l.shadows, (v) => (l.shadows = v || undefined)),
    h('p', { class: 'note' }, 'The light reaches this far around the hero (Radiance in the Magic tree reaches further still).'));
}

/** Built-in icon grid plus “Import image…”. */
/** Icon effects (Update 133): glow, outline and a pattern, each ticked on with its own colour. */
function iconFxForm(d: ItemDef, refresh: () => void, rerender: () => void): HTMLElement {
  const fx = d.iconFx ?? {};
  const save = () => { if (fx.glow || fx.outline || fx.pattern) d.iconFx = fx; else delete d.iconFx; refresh(); };
  const color = (value: string, set: (v: string) => void, label: string) => {
    const c = h('input', { type: 'color', value, 'aria-label': label }) as HTMLInputElement;
    c.addEventListener('input', () => { set(c.value); save(); });
    return c;
  };
  const p = fx.pattern;
  return h('details', { class: 'icon-fx', ...(d.iconFx ? { open: true } : {}) }, h('summary', {}, 'Icon effects', d.iconFx ? h('span', { class: 'note' }, ' (on)') : ''),
    h('div', { class: 'field-row icon-fx-row' },
      checkbox('Glow', !!fx.glow, (v) => { if (v) fx.glow = '#7cff6a'; else delete fx.glow; save(); rerender(); }),
      fx.glow ? color(fx.glow, (v) => (fx.glow = v), 'Glow colour') : h('span'),
      checkbox('Outline', !!fx.outline, (v) => { if (v) fx.outline = '#1a0f24'; else delete fx.outline; save(); rerender(); }),
      fx.outline ? color(fx.outline, (v) => (fx.outline = v), 'Outline colour') : h('span')),
    h('div', { class: 'field-row icon-fx-row' },
      field('Pattern', select([['', 'None'], ...ICON_PATTERNS], p?.kind ?? '', (v) => { if (v) fx.pattern = { kind: v as IconPattern, color: p?.color ?? '#a040ff', ...(p?.opacity ? { opacity: p.opacity } : {}) }; else delete fx.pattern; save(); rerender(); })),
      p ? field('Colour', color(p.color, (v) => (p.color = v), 'Pattern colour')) : h('span'),
      p ? field('Strength %', numberInput(p.opacity ?? 70, (v) => { const n = Math.max(5, Math.min(100, Math.round(v))); if (n === 70) delete p.opacity; else p.opacity = n; save(); }, { min: 5, max: 100, step: 5 })) : h('span')),
    h('p', { class: 'note' }, 'Drawn on the icon everywhere it shows: a “corrupted” pumpkin with purple cracks and a green glow.'));
}

function iconPicker(store: EditorStore, d: ItemDef, refresh: () => void, rerender: () => void): HTMLElement {
  const grid = iconGrid(d.icon, d.iconTint, (icon) => { d.icon = icon; rerender(); });
  const file = h('input', { type: 'file', accept: 'image/png,image/webp,image/gif', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    const path = `assets/icons/${d.id}.png`;
    const p = store.project;
    const persistent = p.canSave && p.canStoreImages;
    try { if (persistent) await p.writeFile(path, f); }
    catch (err) { toast(`Couldn’t save the icon: ${err instanceof Error ? err.message : String(err)}`, 'error'); return; }
    store.files.set(path, f);
    urls.delete(path);
    d.icon = path;
    if (!persistent) toast('Icon kept for this session only: open the project folder itself to save imported images.');
    refresh();
    rerender();
  });
  const imported = !builtinIconName(d.icon) && d.icon !== 'sprite';
  const fromSprite = d.slot === 'weapon' || d.slot === 'ranged' || d.slot === 'shield'
    ? h('button', { type: 'button', class: 'icon-pick sprite-pick', role: 'radio', 'aria-checked': String(d.icon === 'sprite'), title: 'Cut from its weapon sprite: the bag, shop and back icons look like the weapon in the hand',
      onclick: () => { d.icon = 'sprite'; rerender(); } }, 'From its sprite')
    : null;
  if (fromSprite) grid.prepend(fromSprite);
  return h('div', { class: 'icon-picker' }, tintRow(d.iconTint, (t) => { if (t) d.iconTint = t; else delete d.iconTint; rerender(); }), grid,
    h('div', { class: 'icon-import' },
      h('button', { type: 'button', class: 'btn', onclick: () => file.click() }, imported ? 'Replace image…' : 'Import image…'),
      h('span', { class: 'hint' }, imported ? d.icon : d.icon === 'sprite' ? 'Cut from its weapon sprite (bag, shop and back icons match the weapon).' : '16 × 16 or 32 × 32 PNG with a transparent background.'), file));
}

/** The built-in icons by group (potions, food, weapons…), the chosen one marked; `tint` previews them recoloured. */
export function iconGrid(current: string | undefined, tint: string | undefined, pick: (icon: string) => void): HTMLElement {
  const btn = (name: string) => h('button', {
    type: 'button', class: 'icon-pick', role: 'radio', 'aria-checked': String(current === `builtin:${name}`), title: ITEM_ICONS[name].name, 'aria-label': ITEM_ICONS[name].name,
    onclick: () => pick(`builtin:${name}`),
  }, h('img', { src: builtinIcon(name, tint).toDataURL(), alt: '' }));
  // The chosen icon's group starts open; the rest fold away (the lists are long).
  const cur = builtinIconName(current);
  return h('div', { class: 'icon-groups', role: 'radiogroup', 'aria-label': 'Built-in icons' },
    ...iconGroups().map(([group, names]) => {
      const det = h('details', { class: 'icon-group' }, h('summary', {}, `${group} (${names.length})`), h('div', { class: 'icon-grid' }, ...names.map(btn)));
      if (cur && names.includes(cur)) det.open = true;
      return det;
    }));
}
/** A tint for an icon: off, or a colour (with a few quick picks). */
export function tintRow(tint: string | undefined, set: (t: string | undefined) => void): HTMLElement {
  const color = h('input', { type: 'color', value: tint ?? '#e05a4a', 'aria-label': 'Tint colour', disabled: !tint });
  color.addEventListener('change', () => set(color.value));
  const QUICK = ['#e8483a', '#ff9a2a', '#f0d040', '#5ac840', '#3ab8c8', '#3a6ae0', '#9a4ae0', '#e04a9a', '#f4f4f4', '#2a2a30'];
  return h('div', { class: 'tint-row' },
    checkbox('Tint', !!tint, (v) => set(v ? color.value : undefined)),
    color,
    ...QUICK.map((c) => h('button', { type: 'button', class: `tint-swatch${tint === c ? ' on' : ''}`, style: `background:${c}`, title: `Tint ${c}`, 'aria-label': `Tint ${c}`, onclick: () => set(c) })),
    h('span', { class: 'hint' }, 'Recolours the icon, keeping its shading.'));
}

/** Where an item is used by the inventory setup (events aren't scanned here). */
function usedBy(work: ItemsWork, id: string): string | null {
  const inv = work.inventory;
  if (inv.startItems?.some((s) => s.item === id)) return 'in the starting items';
  if (Object.values(inv.startEquip ?? {}).includes(id)) return 'starting equipment';
  return null;
}

/** The Inventory tab: bag size, starting gold, items and equipment. */
export function inventoryTab(store: EditorStore, work: ItemsWork, rerender: () => void): HTMLElement[] {
  const inv = work.inventory, items = work.items;
  const choices = (filter: (d: ItemDef) => boolean, current: string | undefined): [string, string][] => {
    const out = items.filter(filter).map((d) => [d.id, d.name] as [string, string]);
    if (current && !out.some(([id]) => id === current)) out.unshift([current, `${current} (missing)`]);
    return out;
  };
  const start = (inv.startItems ??= []);
  return [
    h('section', { class: 'db-section' }, h('h3', {}, 'Bag'),
      h('div', { class: 'field-row' },
        field('Slots per bag tab', numberInput(inv.slots ?? DEFAULT_BAG_SLOTS, (v) => { const n = Math.max(8, Math.min(96, Math.round(v / 8) * 8)); inv.slots = n === DEFAULT_BAG_SLOTS ? undefined : n; }, { step: 8, min: 8, max: 96 }), 'Each tab of the bag (Consumables, Gear, Shards, Materials, Key items) has this many slots, eight to a row. Each slot holds one stack of an item.'),
        field('Starting gold', numberInput(inv.startGold ?? 0, (v) => (inv.startGold = Math.max(0, Math.round(v)) || undefined), { step: 10, min: 0 })))),
    h('section', { class: 'db-section' }, h('h3', {}, 'Starting items'),
      ...start.map((s, k) => h('div', { class: 'field-row start-item' },
        select(choices(() => true, s.item), s.item, (v) => (s.item = v), { 'aria-label': `Starting item ${k + 1}` }),
        numberInput(s.count, (v) => (s.count = Math.max(1, Math.round(v))), { step: 1, min: 1, 'aria-label': `How many of starting item ${k + 1}` }),
        h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove starting item ${k + 1}`, onclick: () => { start.splice(k, 1); rerender(); } }, '✕'))),
      items.length ? h('button', { type: 'button', class: 'btn', onclick: () => { start.push({ item: items[0].id, count: 1 }); rerender(); } }, '+ Add starting item')
        : h('p', { class: 'note' }, 'Add items in the Items tab first.')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Starting equipment'),
      h('div', { class: 'field-row' }, ...EQUIP_SLOTS.map((slot) => field(SLOT_NAMES[slot],
        select([['', 'Nothing'], ...choices((d) => d.kind === 'equipment' && d.slot === slot, inv.startEquip?.[slot])], inv.startEquip?.[slot] ?? '', (v) => {
          inv.startEquip ??= {};
          if (v) inv.startEquip[slot] = v; else delete inv.startEquip[slot];
        })))),
      h('p', { class: 'note' }, 'A Light or Water Walk shard in the magic slot is ready from the start: cast it (key 3, or F) to switch it on.')),
  ];
}

/** Drop empty parts, so database.json only lists what was set. */
export function cleanInventory(inv: InventorySetup): InventorySetup | undefined {
  const out: InventorySetup = {};
  if (inv.slots && inv.slots !== DEFAULT_BAG_SLOTS) out.slots = inv.slots;
  if (inv.startGold) out.startGold = inv.startGold;
  const items = (inv.startItems ?? []).filter((s) => s.item && s.count > 0);
  if (items.length) out.startItems = items;
  const eq = Object.fromEntries(Object.entries(inv.startEquip ?? {}).filter(([, v]) => v));
  if (Object.keys(eq).length) out.startEquip = eq;
  return Object.keys(out).length ? out : undefined;
}

/** Glow and swing trail: per weapon, on or off, with their colours (drawn on animated characters). */
function effectsForm(d: ItemDef): HTMLElement {
  const melee = d.slot === 'weapon';
  const glowBox = h('div', { class: 'field-row' });
  const trailBox = h('div', { class: 'field-row' });
  const colour = (value: string, set: (v: string) => void, label: string) => {
    const i = h('input', { type: 'color', value, 'aria-label': label, class: 'color-in' });
    i.addEventListener('input', () => set(i.value));
    return i;
  };
  const renderGlow = () => {
    glowBox.replaceChildren();
    const g = d.glow;
    if (!g) return;
    glowBox.append(field('Colour', colour(g.color, (v) => (g.color = v), 'Glow colour')),
      field('Strength', numberInput(g.strength ?? 1, (v) => { const n = Math.max(0.2, Math.min(2, v)); g.strength = Math.abs(n - 1) < 0.001 ? undefined : n; }, { step: 0.1, min: 0.2, max: 2 })),
      checkbox('Pulses', g.pulse !== false, (v) => (g.pulse = v ? undefined : false)));
  };
  const renderTrail = () => {
    trailBox.replaceChildren();
    const t = d.trail;
    if (!t) return;
    trailBox.append(field('Colour', colour(t.color, (v) => (t.color = v), 'Trail colour')),
      field('Length', numberInput(t.length ?? 3, (v) => { const n = Math.max(1, Math.min(4, Math.round(v))); t.length = n === 3 ? undefined : n; }, { step: 1, min: 1, max: 4 }), 'Earlier frames echoing behind the swing.'));
  };
  renderGlow(); renderTrail();
  return h('section', { class: 'db-section' }, h('h3', {}, 'Effects (animated characters)'),
    checkbox('Glow: a coloured aura around the weapon while it’s in the hand', !!d.glow, (v) => { if (v) d.glow = { color: '#7fd0ff' } as WeaponGlow; else delete d.glow; renderGlow(); }),
    glowBox,
    ...(melee ? [checkbox('Swing trail: a coloured streak following each swing', !!d.trail, (v) => { if (v) d.trail = { color: '#ffffff' } as WeaponTrail; else delete d.trail; renderTrail(); }), trailBox] : []),
    h('p', { class: 'note' }, 'Any weapon can have them, whatever its rarity. Preview them in the Character Builder → Weapons.'));
}

/** Stat growth: a consumable changes a stat's rank for good; gear lifts it while worn. */
function statRankField(d: ItemDef, rerender: () => void, note: string): HTMLElement {
  const sr = d.statRank;
  return h('div', { class: 'field-row' },
    field('Stat growth', select([['', 'No change'], ...ATTRS.map((k) => [k, ATTR_INFO[k].name] as [string, string])], sr?.stat ?? '', (v) => {
      if (v) d.statRank = { stat: v as Attr, rank: sr?.rank ?? 'A' }; else delete d.statRank; rerender();
    }), sr ? undefined : note),
    sr ? field('Rank', select(RANKS.map((r) => [r, `${r} (+${RANK_GAIN[r]} a level)`] as [string, string]), sr.rank, (v) => { sr.rank = v as Rank; }), note) : h('span'));
}

/** A key item's field use settings (Update 118): what it does, and the weather / hour / season / horse it brings. */
function fieldUseForm(store: EditorStore, d: ItemDef): HTMLElement {
  const f = d.field!;
  const extra = f.use === 'cut' || f.use === 'bow'
    ? field('Damage', numberInput(f.damage ?? 10, (v) => { const n = Math.max(1, Math.min(999, Math.round(v))); if (n === 10) delete f.damage; else f.damage = n; }, { min: 1, max: 999, step: 1 }), f.use === 'cut' ? 'A fixed amount each swing (crates, barrels and other breakables).' : 'A fixed amount for a full draw (half that for a quick shot).')
    : f.use === 'weather'
    ? field('Brings', select([['', 'The player picks (a list)'], ...WEATHER_KINDS.map((k) => [k, k === 'none' ? 'Clear skies' : k[0].toUpperCase() + k.slice(1)] as [string, string])], f.weather ?? '', (v) => { if (v) f.weather = v as WeatherKind; else delete f.weather; }))
    : f.use === 'time'
      ? field('Jumps to', select([['', 'The player sets the time'], ...Array.from({ length: 24 }, (_, k) => [String(k), `${String(k).padStart(2, '0')}:00`] as [string, string])], f.hour === undefined ? '' : String(f.hour), (v) => { if (v) f.hour = Number(v); else delete f.hour; }))
      : f.use === 'season'
        ? field('Brings', select([['', 'The player picks one'], ...SEASONS.map((x) => [x, SEASON_NAMES[x]] as [string, string]), ['auto', 'Back to the calendar’s']], f.season ?? '', (v) => { if (v) f.season = v as Season | 'auto'; else delete f.season; }))
        : f.use === 'horse'
          ? field('With no horse, it brings', select([['', 'Nothing (only calls the horse they have)'], ...horseList(store.db).map((x) => [x.id, x.name] as [string, string])], f.horse ?? '', (v) => { if (v) f.horse = v; else delete f.horse; }), 'A whistle for a horse of its own: the first use gives the party that horse for free.')
          : h('span');
  return h('div', {}, h('p', { class: 'note' }, `${FIELD_USE_TEXT[f.use]}${carriedUse(f.use) ? '' : ' The player uses it from the bag or puts it on a quick slot (the D-pad).'}`), extra);
}
