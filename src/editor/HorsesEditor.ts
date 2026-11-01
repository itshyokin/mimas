/** Database → Horses: the horses stables rent out (speed, stamina, jump, price, and the placeholder colours). */
import type { Database, HorseDef } from '../world/types';
import { field, h, numberInput, textInput } from './dom';
import { listLayout, nameId } from './AbilitiesEditor';
import { horseSheet } from '../art/horseArt';
import { stars } from '../game/horses';

const n = (v: number, set: (x: number) => void, step: number, min: number, max: number, label: string) =>
  numberInput(v, (x) => set(Math.max(min, Math.min(max, x))), { step, min, max, 'aria-label': label, class: 'db-num' });

/** The horse as it looks on the map (a side-on frame of its sheet). */
function preview(d: HorseDef): HTMLCanvasElement {
  const sheet = horseSheet(d.color, d.mane), fw = sheet.width / 3, fh = sheet.height / 4;
  const c = document.createElement('canvas');
  c.width = fw * 3; c.height = fh * 3;
  c.className = 'horse-preview';
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, fw, fh * 2, fw, fh, 0, 0, fw * 3, fh * 3);
  return c;
}

type Travel = NonNullable<Database['travel']>;

/** Griffin flights: what they cost and how fast the griffin flies. */
function flightSection(t: Travel): HTMLElement {
  const set = (k: keyof Travel, v: number, def: number) => { if (v === def) delete t[k]; else t[k] = v; };
  return h('section', { class: 'db-section' }, h('h3', {}, 'Griffin flights'),
    h('div', { class: 'field-row' },
      field('Price: base (gold)', n(t.flightBase ?? 20, (v) => set('flightBase', Math.round(v), 20), 5, 0, 99999, 'Flight base price')),
      field('Price: gold a tile', n(t.flightPerTile ?? 0.5, (v) => set('flightPerTile', Math.round(v * 100) / 100, 0.5), 0.05, 0, 100, 'Flight price a tile'), 'Distance in the World layout (60 tiles to a map not laid out).'),
      field('Speed (tiles a second)', n(t.flightSpeed ?? 12, (v) => set('flightSpeed', Math.round(v * 10) / 10, 12), 0.5, 2, 60, 'Flight speed'), 'One speed: long flights take longer (no skipping).')),
    h('p', { class: 'note' }, 'Griffin masters (the Griffin roost event command) open their roost when talked to, then show the world map: pick any other roost unlocked so far. The griffin takes off, flies the route over the World layout’s maps (forest where nothing is laid out), lands, drops the hero off and flies away.'));
}

export function horsesTab(list: HorseDef[], state: { sel: number }, rerender: () => void, travel: Travel): HTMLElement[] {
  const out = listLayout<HorseDef>(list, state, 'Horse', (id) => ({ id, name: 'New horse', tier: 1, price: 200, speed: 8.5, stamina: 100, jump: 3, color: '#8a5a34', mane: '#2a1a12' }), (d) => [
    nameId(list, d, rerender, 'Horse'),
    field('Description', textInput(d.description ?? '', (v) => { d.description = v.trim() || undefined; }, { 'aria-label': 'Horse description' })),
    h('section', { class: 'db-section' }, h('h3', {}, 'Riding'),
      h('div', { class: 'field-row' },
        field('Stars', n(d.tier, (v) => { d.tier = Math.round(v); rerender(); }, 1, 1, 3, 'Horse stars'), `${stars(d.tier)}: shown at the stable.`),
        field('Price (gold)', n(d.price, (v) => { d.price = Math.round(v); }, 10, 0, 999999, 'Horse price'))),
      h('div', { class: 'field-row' },
        field('Gallop (tiles a second)', n(d.speed, (v) => { d.speed = Math.round(v * 10) / 10; }, 0.1, 3, 20, 'Horse speed'), 'Running on foot is 6.1; walking on the horse is half this.'),
        field('Stamina', n(d.stamina, (v) => { d.stamina = Math.round(v); }, 5, 10, 999, 'Horse stamina'), 'Galloping uses 12 a second and a jump 18; walking and standing bring back 16 a second. Out of it: no galloping until it’s back to 30%.'),
        field('Jump (tiles)', n(d.jump, (v) => { d.jump = Math.round(v * 2) / 2; }, 0.5, 1, 10, 'Horse jump'), 'How far it leaps while moving: over gaps, streams and fences (3 for one star, 4 for two, 5 for three).'))),
    h('section', { class: 'db-section' }, h('h3', {}, 'Look (placeholder)'),
      h('div', { class: 'field-row' },
        field('Coat', h('input', { type: 'color', value: d.color, 'aria-label': 'Coat colour', onchange: (e: Event) => { d.color = (e.target as HTMLInputElement).value; rerender(); } })),
        field('Mane and tail', h('input', { type: 'color', value: d.mane, 'aria-label': 'Mane colour', onchange: (e: Event) => { d.mane = (e.target as HTMLInputElement).value; rerender(); } }))),
      preview(d)),
    h('p', { class: 'note' }, 'Stables rent these (the Stable event command). One horse at a time: it stands beside the hero, the Talk button beside it gets on, B gets off, and it waits where it was left (on that map, saved). Riding: faster, its own stamina in the stamina ring, a long jump while moving; no climbing, crawling or swimming, and it waits outside indoor maps. A Saddle key item sends it home so another can be rented elsewhere.'),
    // Griffin flights sit under the horse's form (as their own grid cell they fell into the list's column).
    flightSection(travel),
  ], rerender, 'No horses: the built-in three are used.');
  return out;
}
