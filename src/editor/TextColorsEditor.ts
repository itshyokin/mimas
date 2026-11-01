/**
 * Database → Text colours: named colours for words in messages and word bubbles. Write [name]Lord Varn[/name] (the
 * colour's id in square brackets) and the words take its colour; change it here and every message follows.
 */
import { field, h, textInput } from './dom';
import { DEFAULT_TEXT_COLORS, type TextColor } from '../ui/richText';

export function textColorsTab(list: TextColor[], rerender: () => void): HTMLElement[] {
  const rows = list.map((k, i) => {
    const color = h('input', { type: 'color', value: k.color, 'aria-label': `${k.name} colour` });
    color.addEventListener('change', () => { k.color = color.value; rerender(); });
    return h('div', { class: 'marker-row text-color-row' },
      h('span', { class: 'tc-sample', style: `color:${k.color}` }, k.name),
      field('Name', textInput(k.name, (v) => { k.name = v.trim() || k.name; rerender(); })),
      field('Colour', color),
      field('Tag', textInput(k.id, (v) => { const id = v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_'); if (id && !['b', 'i', 's', 'u', 'glow', 'outline', 'color', 'colour'].includes(id) && !list.some((o) => o !== k && o.id === id)) k.id = id; rerender(); }, { title: 'Write [tag]words[/tag] in a message' })),
      h('code', { class: 'tc-use' }, `[${k.id}]…[/${k.id}]`),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove ${k.name}`, onclick: () => { list.splice(i, 1); rerender(); } }, '✕'));
  });
  const add = () => {
    let id = 'color', n = 2;
    while (list.some((k) => k.id === id)) id = `color${n++}`;
    list.push({ id, name: 'New colour', color: '#c89cff' });
    rerender();
  };
  return [h('section', { class: 'db-section' }, h('h3', {}, 'Text colours'),
    h('p', { class: 'note' }, 'Colour words in any message, choice or word bubble by wrapping them in a tag: [name]Lord Varn[/name]. Also: [b]bold[/b], [i]italic[/i], [s]struck through[/s], [u]underlined[/u], [glow]glowing[/glow], [outline]outlined[/outline] and [color=#5ab8ff]any colour[/color]. The Show Text window has buttons that add these for you.'),
    h('div', { class: 'marker-list' }, ...rows),
    h('div', { class: 'stack row' },
      h('button', { type: 'button', class: 'btn', onclick: add }, '+ New text colour'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { list.splice(0, list.length, ...structuredClone(DEFAULT_TEXT_COLORS)); rerender(); } }, 'Back to the built-in four')))];
}
