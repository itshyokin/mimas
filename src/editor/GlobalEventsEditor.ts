/**
 * Database → Story → Global events (Update 131): event scripts that belong to no map. Each runs once every time one
 * of its moments comes round (a new game, loading a save, sleeping at a camp or inn, walking into a rest zone, the
 * real date rolling over), then waits for the next. Normal commands and conditions: "If the moon is full: Katrina
 * leaves the party; otherwise she joins". Someone who joins while the party rests in a zone walks in from off-screen.
 */
import type { EditorStore } from './store';
import type { GlobalEvent, GlobalTrigger } from '../world/types';
import { checkbox, field, h, textInput } from './dom';
import { CommandEditor } from './CommandEditor';

export const GLOBAL_TRIGGERS: [GlobalTrigger, string, string][] = [
  ['newGame', 'New game', 'Once, as a new game starts.'],
  ['load', 'Loading a save', 'Each time a save is loaded (Continue or Load).'],
  ['sleep', 'Sleeping (camp or inn)', 'Waking from a rest at a camp, an inn or a Sleep command.'],
  ['restZone', 'Entering a rest zone', 'Walking into a safe zone (the party goes to its rest spots).'],
  ['newDay', 'A new real day', 'The real date rolls over (also on loading a save made on an earlier day).'],
];

let cmdEditor: CommandEditor | null = null;

export function globalEventsTab(store: EditorStore, list: GlobalEvent[], state: { sel: number }, rerender: () => void): HTMLElement[] {
  state.sel = Math.max(0, Math.min(state.sel, list.length - 1));
  const add = () => {
    let n = list.length + 1;
    while (list.some((e) => e.id === `global_${n}`)) n++;
    list.push({ id: `global_${n}`, name: `Global event ${n}`, when: ['sleep'], commands: [] });
    state.sel = list.length - 1;
    rerender();
  };
  const whenText = (e: GlobalEvent) => e.when.map((w) => GLOBAL_TRIGGERS.find((t) => t[0] === w)?.[1] ?? w).join(', ') || 'Never (no moment ticked)';
  const side = h('div', { class: 'item-list', role: 'listbox', 'aria-label': 'Global events' },
    ...list.map((e, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } },
      h('span', {}, e.name, h('small', { class: 'item-sub' }, `${whenText(e)} · ${e.commands.length} command${e.commands.length === 1 ? '' : 's'}`)))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, '+ New global event'));
  const e = list[state.sel];
  const form = h('div', { class: 'item-form' });
  if (!e) {
    form.append(h('p', { class: 'note' }, 'No global events yet. A global event is a script that belongs to no map: it runs once each time one of its moments comes round (a new game, loading a save, sleeping, entering a rest zone, a new real day). Use the usual commands and conditions: “If the moon is full: Katrina leaves; otherwise she joins.”'));
  } else {
    cmdEditor ??= new CommandEditor(store, { onChange: () => side.querySelector<HTMLElement>('[aria-selected="true"] small')?.replaceChildren(`${whenText(e)} · ${e.commands.length} command${e.commands.length === 1 ? '' : 's'}`) });
    form.append(
      h('section', { class: 'db-section' }, h('h3', {}, 'Global event'),
        h('div', { class: 'field-row' },
          field('Name', textInput(e.name, (v) => { e.name = v.trim() || e.name; rerender(); })),
          field('Id', textInput(e.id, (v) => { const id = v.trim().replace(/[^A-Za-z0-9_-]+/g, '_'); if (id && !list.some((o) => o !== e && o.id === id)) e.id = id; rerender(); }))),
        h('p', { class: 'note' }, 'Runs once each time any of these comes round:'),
        h('div', { class: 'check-list' }, ...GLOBAL_TRIGGERS.map(([k, name, hint]) => {
          const c = checkbox(name, e.when.includes(k), (on) => { e.when = on ? [...new Set([...e.when, k])] : e.when.filter((w) => w !== k); rerender(); });
          c.title = hint;
          return c;
        })),
        h('button', { type: 'button', class: 'btn small danger', onclick: () => { list.splice(state.sel, 1); rerender(); } }, 'Delete')),
      h('section', { class: 'db-section db-wide' }, h('h3', {}, 'Commands'),
        h('p', { class: 'note' }, 'Click to pick a command, double-click to edit it. Conditions (If…) can check the moon, the date, switches, the party…'),
        cmdEditor.render(e.commands)));
  }
  return [h('div', { class: 'items-layout' }, side, form)];
}

/** Global events worth saving (named, with an id). */
export const cleanGlobals = (list: GlobalEvent[]): GlobalEvent[] => list.filter((e) => e.id && e.name);
