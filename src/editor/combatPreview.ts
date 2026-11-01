/**
 * Combat preview (Database → Enemies / Troops → ▶ Combat preview): a playtest that opens straight into a battle with
 * those enemies on a battle map. The editor sets how a playtest starts; the Database window first applies its changes.
 */
import { field, h, select } from './dom';

let start: (enemies: string[], map?: string) => void = () => {};
let before: () => void = () => {};
export function setCombatPreview(fn: (enemies: string[], map?: string) => void): void { start = fn; }
/** What to do first (the Database window puts its changes into the project). */
export function beforeCombatPreview(fn: () => void): void { before = fn; }

let lastMap = '';
/** A battle map picker and the button. `enemies` is read when it's pressed. */
export function combatPreviewRow(names: string[], enemies: () => string[]): HTMLElement {
  if (!names.includes(lastMap)) lastMap = names[0] ?? '';
  return h('div', { class: 'field-row combat-preview' },
    field('Preview on', select([['', 'The flat battle screen'], ...names.map((n) => [n, n] as [string, string])], lastMap, (v) => (lastMap = v))),
    h('button', { type: 'button', class: 'btn', title: 'Opens a playtest straight into this battle (changes here are applied first)', onclick: () => {
      const list = enemies();
      if (!list.length) return;
      before();
      start(list, lastMap || undefined);
    } }, '▶ Combat preview'));
}
