/**
 * Item lists split by category (Update 138): enemy loot (Database → Enemies → Rewards) and a shop's goods (the Open
 * shop command) show a section per kind of item (Items, Key items, Materials, Weapons, Armor / accessories, Shards),
 * each with its own "+ Add" and dropdowns that list only that kind, instead of one long list of everything.
 */
import type { ItemDef } from '../world/types';
import { h, select } from './dom';
import { itemCategory, type ItemCat } from './ItemsEditor';

export const PICK_CATS: [ItemCat, string, string][] = [
  ['items', 'Items', 'item'], ['keyItems', 'Key items', 'key item'], ['materials', 'Materials', 'material'],
  ['weapons', 'Weapons', 'weapon'], ['gear', 'Armor / accessories', 'piece of gear'], ['shards', 'Shards and stones', 'shard'],
];

export interface SectionOptions<T extends { item: string }> {
  /** A new entry for an item. */
  make: (id: string) => T;
  /** The boxes after the item dropdown (chance, count, price…). */
  extras: (e: T, k: number) => HTMLElement[];
  rerender: () => void;
  /** Kinds left out (a shop doesn't sell key items, say). */
  skip?: ItemCat[];
  /** What the list is called in labels ("Drop", "Item for sale"). */
  noun: string;
}

export function itemSections<T extends { item: string }>(items: ItemDef[], list: T[], o: SectionOptions<T>): HTMLElement {
  const byId = new Map(items.map((d) => [d.id, d]));
  const catOf = (id: string): ItemCat | null => { const d = byId.get(id); return d ? itemCategory(d) : null; };
  const sections: HTMLElement[] = PICK_CATS.filter(([c]) => !o.skip?.includes(c)).map(([cat, title, one]) => {
    const choices = items.filter((d) => itemCategory(d) === cat).map((d) => [d.id, d.name] as [string, string]);
    const rows = list.map((e, k) => ({ e, k })).filter(({ e }) => catOf(e.item) === cat);
    if (!choices.length && !rows.length) return null;
    const add = () => {
      const next = choices.find(([id]) => !list.some((x) => x.item === id)) ?? choices[0];
      if (next) { list.push(o.make(next[0])); o.rerender(); }
    };
    return h('details', { class: 'item-section', ...(rows.length ? { open: true } : {}) },
      h('summary', {}, title, h('span', { class: 'note' }, rows.length ? ` (${rows.length})` : '')),
      ...rows.map(({ e, k }) => h('div', { class: 'field-row drop-row' },
        select(choices, e.item, (v) => { e.item = v; o.rerender(); }, { 'aria-label': `${o.noun} ${k + 1}` }),
        ...o.extras(e, k),
        h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove ${o.noun.toLowerCase()} ${k + 1}`, onclick: () => { list.splice(k, 1); o.rerender(); } }, '✕'))),
      choices.length ? h('button', { type: 'button', class: 'btn small', onclick: add }, `+ Add ${one}`) : h('span'));
  }).filter((x): x is HTMLDetailsElement => !!x);
  // Entries whose item is gone from the Database: shown so they can be removed.
  const missing = list.map((e, k) => ({ e, k })).filter(({ e }) => !catOf(e.item));
  if (missing.length) sections.push(h('div', { class: 'item-section missing' }, h('b', {}, 'Missing items'),
    ...missing.map(({ e, k }) => h('div', { class: 'field-row drop-row' }, h('span', { class: 'note' }, `${e.item || '(none)'} (not in the Database)`),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove ${o.noun.toLowerCase()} ${k + 1}`, onclick: () => { list.splice(k, 1); o.rerender(); } }, '✕')))));
  return h('div', { class: 'item-sections' }, ...sections);
}
