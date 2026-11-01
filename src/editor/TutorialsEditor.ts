/**
 * Database → Story → Tutorials (Update 113): short how-to pop-ups. An event's "Show tutorial" command shows one (the
 * first time only); players can turn the pop-ups off in Settings, and every tutorial they've reached is kept in the
 * Journal's Tutorials tab to read again.
 */
import type { TutorialDef } from '../world/types';
import { field, h, textInput } from './dom';

export function tutorialsTab(list: TutorialDef[], rerender: () => void): HTMLElement[] {
  const rows = list.map((t, i) => {
    const text = h('textarea', { rows: '3', placeholder: 'What to tell the player (a few lines)', 'aria-label': `${t.title} text` });
    text.value = t.text;
    text.addEventListener('change', () => { t.text = text.value.trim(); });
    return h('div', { class: 'tut-row' },
      h('div', { class: 'field-row' },
        field('Title', textInput(t.title, (v) => { t.title = v.trim() || t.title; })),
        field('Id', textInput(t.id, (v) => { const id = v.trim().replace(/[^A-Za-z0-9_-]+/g, '_'); if (id && !list.some((o) => o !== t && o.id === id)) t.id = id; rerender(); }, { title: 'Saves remember tutorials by id' }))),
      field('Text', text),
      h('button', { type: 'button', class: 'btn small danger', onclick: () => { list.splice(i, 1); rerender(); } }, 'Delete'));
  });
  const add = () => {
    let n = list.length + 1;
    while (list.some((t) => t.id === `tutorial_${n}`)) n++;
    list.push({ id: `tutorial_${n}`, title: `Tutorial ${n}`, text: '' });
    rerender();
  };
  return [h('section', { class: 'db-section db-wide' }, h('h3', {}, 'Tutorials'),
    h('p', { class: 'note' }, 'Shown with the event command “Show tutorial” (the first time it runs for that tutorial). Players can turn pop-ups off in Settings; whatever they’ve reached is in the Journal’s Tutorials tab either way.'),
    ...rows,
    h('button', { type: 'button', class: 'btn', onclick: add }, '+ New tutorial'))];
}
