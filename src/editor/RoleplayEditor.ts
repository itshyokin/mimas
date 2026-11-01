/**
 * Database → Party → Roleplay (Update 127): the roleplay titles every hero shares (Eye colour, Favourite food,
 * Favourite gift…). Each hero fills in their own answers on the Heroes tab. Ids stay put when a title is renamed, so
 * conditions and items that use it keep working.
 */
import type { HeroDef, RoleplayField } from '../world/types';
import { field, h, select, textInput } from './dom';

export function roleplayTab(fields: RoleplayField[], heroes: HeroDef[], rerender: () => void): HTMLElement[] {
  const add = () => {
    let n = fields.length + 1;
    while (fields.some((f) => f.id === `rp${n}`)) n++;
    fields.push({ id: `rp${n}`, title: '' });
    rerender();
  };
  const rows = fields.map((f, i) => h('div', { class: 'field-row rp-row' },
    field(`Title ${i + 1}`, textInput(f.title, (v) => (f.title = v.trim()), { placeholder: 'Favourite food', 'aria-label': `Title ${i + 1}` })),
    field('Answer', select([['text', 'Text'], ['date', 'A date (birthday…)']], f.type ?? 'text', (v) => { if (v === 'date') f.type = 'date'; else delete f.type; rerender(); })),
    h('code', { class: 'rp-id', title: 'The id conditions and items use (stays the same when you rename the title)' }, f.id),
    h('span', { class: 'note rp-answers' }, heroes.map((x) => x.roleplay?.[f.id] ? `${x.name}: ${x.roleplay[f.id]}` : '').filter(Boolean).join(' · ') || 'No answers yet'),
    h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { fields.splice(i - 1, 0, fields.splice(i, 1)[0]); rerender(); } }, '↑'),
    h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Remove', onclick: () => { fields.splice(i, 1); rerender(); } }, '✕')));
  return [
    h('section', { class: 'db-section' }, h('h3', {}, 'Roleplay'),
      h('p', { class: 'note' }, 'Titles every hero shares, each with their own answer (Heroes tab → Roleplay): Eye colour, Favourite food, Favourite gift… They show on each hero’s Status page. Use them in conditions (“Eleanor’s Favourite food is Ramen”), in text with \\rp[Eleanor, Favourite food], and on items (Database → Items → Favourite of / Disliked by) for relationship points.'),
      ...rows,
      h('button', { type: 'button', class: 'btn small', onclick: add }, '+ Add a title')),
  ];
}
