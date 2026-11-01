/**
 * Database → Map markers: the kinds of marker events can put on the world map (Event → Map marker): each with a name,
 * a symbol and a colour (its area outline uses the colour too). Add more kinds as needed.
 */
import { field, h, select, textInput } from './dom';
import { DEFAULT_MARKERS, MARKER_SYMBOLS, markerIcon, type MarkerKind, type MarkerSymbol } from '../world/landmarks';

export function markersTab(list: MarkerKind[], rerender: () => void): HTMLElement[] {
  const rows = list.map((k, i) => {
    const color = h('input', { type: 'color', value: k.color, 'aria-label': `${k.name} colour` });
    color.addEventListener('change', () => { k.color = color.value; rerender(); });
    return h('div', { class: 'marker-row' },
      h('img', { src: markerIcon(k.symbol, k.color, 30), alt: '' }),
      field('Name', textInput(k.name, (v) => { k.name = v.trim() || k.name; rerender(); })),
      field('Symbol', select(MARKER_SYMBOLS, k.symbol, (v) => { k.symbol = v as MarkerSymbol; rerender(); })),
      field('Colour', color),
      field('Id', textInput(k.id, (v) => { const id = v.trim().replace(/[^A-Za-z0-9_-]+/g, '_'); if (id && !list.some((o) => o !== k && o.id === id)) k.id = id; rerender(); }, { title: 'Events refer to the kind by this id' })),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove ${k.name}`, disabled: list.length < 2, onclick: () => { list.splice(i, 1); rerender(); } }, '✕'));
  });
  const add = () => {
    let id = 'marker', n = 2;
    while (list.some((k) => k.id === id)) id = `marker_${n++}`;
    list.push({ id, name: 'New marker', symbol: 'diamond', color: '#b98aff' });
    rerender();
  };
  return [h('section', { class: 'db-section' }, h('h3', {}, 'Map markers'),
    h('p', { class: 'note' }, 'Events show on the world map (Pause → Map) as one of these (Event → Map marker), with a tooltip when the crosshair is on them. An area event’s area is outlined in the marker’s colour. A marker can be shown only while a switch is on: switch it on when a quest starts and off when it ends.'),
    h('div', { class: 'marker-list' }, ...rows),
    h('div', { class: 'stack row' },
      h('button', { type: 'button', class: 'btn', onclick: add }, '+ New marker kind'),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { list.splice(0, list.length, ...structuredClone(DEFAULT_MARKERS)); rerender(); } }, 'Back to the built-in four')))];
}
