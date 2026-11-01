/**
 * The Armor types window: the kinds of armor in the game (built in: Light, Medium, Heavy), each with a name, a short
 * note and what wearing it untrained costs. Opened from an armor's Armor type field and from a class's Weapons and
 * armor table; edits the Database window's own copy (Apply keeps them). The Weapon types window is below.
 */
import { ATTRS, ATTR_INFO, type Attr } from '../game/attributes';
import type { ArmorTypeDef, WeaponTypeDef } from '../world/types';
import { field, h, numberInput, openModal, textInput } from './dom';

const slug = (name: string) => name.toLowerCase().replace(/ armou?r$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'armor';

/** Open the window on `list` (changed in place). `done` runs when it closes. */
export function openArmorTypes(list: ArmorTypeDef[], done: () => void): void {
  const body = h('div', { class: 'armor-types' });
  const render = () => {
    body.replaceChildren(
      h('p', { class: 'hint' }, 'Each armor (Database → Gear) is one of these types, and each class is trained with some of them (Database → Classes → Weapons and armor). A hero wearing a type their class isn’t trained with loses the stats set here (heavier armor usually costs more Agility and Dexterity).'),
      ...list.map((t, i) => {
        const cost = (k: Attr) => field(ATTR_INFO[k].short, numberInput(t.untrained?.[k] ?? 0, (v) => {
          const n = Math.max(-50, Math.min(0, Math.round(-Math.abs(v))));
          if (n) (t.untrained ??= {})[k] = n; else if (t.untrained) { delete t.untrained[k]; if (!Object.keys(t.untrained).length) delete t.untrained; }
        }, { step: 1, min: -50, max: 0, 'aria-label': `${t.name}: ${ATTR_INFO[k].name} when untrained` }));
        return h('div', { class: 'armor-type-row' },
          h('div', { class: 'field-row' },
            field('Name', textInput(t.name, (v) => { t.name = v.trim() || t.name; }, { 'aria-label': `Armor type ${i + 1} name` })),
            field('Note', textInput(t.note ?? '', (v) => { t.note = v.trim() || undefined; }, { placeholder: 'e.g. Cloth, leather', 'aria-label': `Armor type ${i + 1} note` })),
            h('div', { class: 'armor-type-id', title: 'Used by items and classes; it doesn’t change when you rename the type.' }, `id: ${t.id}`),
            h('button', { type: 'button', class: 'mini-btn', disabled: list.length <= 1, title: list.length <= 1 ? 'A game needs at least one armor type' : `Remove ${t.name} (its armor is then guessed from its name)`, 'aria-label': `Remove ${t.name}`, onclick: () => { list.splice(i, 1); render(); } }, '×')),
          h('div', { class: 'section-label' }, 'Untrained: stats it costs'),
          h('div', { class: 'field-row bonus-row' }, ...ATTRS.map(cost)));
      }),
      h('button', { type: 'button', class: 'btn', onclick: () => {
        let name = 'New armor', id = slug(name), n = 2;
        while (list.some((t) => t.id === id)) id = `${slug(name)}_${n++}`;
        list.push({ id, name, untrained: { agi: -2 } });
        render();
        (body.querySelector('.armor-type-row:last-of-type input') as HTMLInputElement | null)?.select();
      } }, '+ New armor type'));
  };
  render();
  openModal('Armor types', body, [{ label: 'Done', primary: true, onClick: () => { done(); } }], done, { wide: true });
}

/**
 * The Weapon types window: the kinds of weapons classes are trained with (built in: swords, daggers, axes…), each with
 * its name in class tables, one weapon's name, and words in an item's name that pick it automatically.
 */
export function openWeaponTypes(list: WeaponTypeDef[], done: () => void): void {
  const body = h('div', { class: 'armor-types' });
  const render = () => {
    body.replaceChildren(
      h('p', { class: 'hint' }, 'Each weapon (Database → Weapons) is one of these types, and each class is trained with some of them (Database → Classes → Weapons and armor). A skill can also train a hero with a type (Database → Skill trees → a skill → Trains with). Untrained weapons hit for three quarters.'),
      ...list.map((t, i) => h('div', { class: 'armor-type-row' },
        h('div', { class: 'field-row weapon-type-fields' },
          field('Name (in class tables)', textInput(t.name, (v) => { t.name = v.trim() || t.name; }, { 'aria-label': `Weapon type ${i + 1} name`, placeholder: 'e.g. Katanas' })),
          field('One of them', textInput(t.one ?? '', (v) => { t.one = v.trim() || undefined; }, { 'aria-label': `Weapon type ${i + 1}: one weapon`, placeholder: 'e.g. Katana' })),
          field('Words that pick it', textInput(t.words ?? '', (v) => { t.words = v.trim() || undefined; }, { 'aria-label': `Weapon type ${i + 1} words`, placeholder: 'e.g. katana, nodachi' })),
          h('div', { class: 'armor-type-id', title: 'Used by items, classes and skills; it doesn’t change when you rename the type.' }, `id: ${t.id}`),
          h('button', { type: 'button', class: 'mini-btn', disabled: list.length <= 1, title: list.length <= 1 ? 'A game needs at least one weapon type' : `Remove ${t.name} (its weapons are then guessed from their names)`, 'aria-label': `Remove ${t.name}`, onclick: () => { list.splice(i, 1); render(); } }, '×')))),
      h('button', { type: 'button', class: 'btn', onclick: () => {
        let id = 'weapon', n = 2;
        while (list.some((t) => t.id === id)) id = `weapon_${n++}`;
        list.push({ id, name: 'New weapons', one: 'New weapon' });
        render();
        (body.querySelector('.armor-type-row:last-of-type input') as HTMLInputElement | null)?.select();
      } }, '+ New weapon type'));
  };
  render();
  openModal('Weapon types', body, [{ label: 'Done', primary: true, onClick: () => { done(); } }], done, { wide: true });
}
