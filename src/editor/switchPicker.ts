/**
 * Picking a switch: a text box (with the known names to choose from) and a ☰ button opening the Switches window —
 * every switch in the game's list (kept in the Database), with + to add one, − to remove one, renaming in place, and
 * the names used on this map that aren't in the list yet. Clicking a name picks it.
 */
import { h, openModal, toast } from './dom';
import type { EditorStore } from './store';
import type { Command } from '../world/types';

let store: EditorStore | null = null;
/** Called once by the editor. */
export function initSwitches(s: EditorStore): void { store = s; }

/** The game's switch list (Database), plus anything used on this map that isn't in it. */
function names(): { listed: string[]; unlisted: string[] } {
  const listed = [...(store?.db.switches ?? [])];
  const used = store?.knownNames().switches ?? [];
  return { listed, unlisted: used.filter((n) => !listed.includes(n)) };
}

const clean = (v: string) => v.trim().replace(/\s+/g, '_');

/** A switch field: type a name, or pick one from the Switches window. */
export function switchInput(value: string, onchange: (v: string) => void, attrs: { placeholder?: string } = {}): HTMLElement {
  const dl = `dl-sw-${Math.random().toString(36).slice(2, 8)}`;
  const n = names();
  const input = h('input', { type: 'text', value, list: dl, placeholder: attrs.placeholder ?? 'e.g. met_mira', 'aria-label': 'Switch', onchange: () => { input.value = clean(input.value); onchange(input.value); } });
  const btn = h('button', { type: 'button', class: 'mini-btn sw-pick', title: 'Switches: pick, add, remove or rename', 'aria-label': 'Open the switch list', onclick: () => openSwitches((picked) => { input.value = picked; onchange(picked); }, input.value) }, '☰');
  return h('div', { class: 'sw-input' }, input, btn, h('datalist', { id: dl }, ...[...n.listed, ...n.unlisted].map((x) => h('option', { value: x }))));
}

/** Rename a switch everywhere it's used on the open map (conditions, Set switch, markers, lights). */
function renameOnMap(from: string, to: string): number {
  if (!store) return 0;
  let n = 0;
  const cond = (c: unknown) => { const x = c as { switch?: string } | undefined; if (x?.switch === from) { x.switch = to; n++; } };
  const walk = (list: Command[]) => {
    for (const c of list) {
      if (c.cmd === 'setSwitch' && c.switch === from) { c.switch = to; n++; }
      if (c.cmd === 'if') { cond(c.condition); walk(c.then); walk(c.else ?? []); }
      if (c.cmd === 'choice') c.branches.forEach(walk);
    }
  };
  const m = store.map;
  for (const e of m.events) {
    if (e.marker?.switch === from) { e.marker.switch = to; n++; }
    for (const p of e.pages) { cond(p.condition); walk(p.commands); }
  }
  for (const l of m.lights) if ((l as { switch?: string }).switch === from) { (l as { switch?: string }).switch = to; n++; }
  return n;
}

/** The Switches window. `pick` is called with the chosen name. */
export function openSwitches(pick?: (name: string) => void, current = ''): void {
  if (!store) return;
  const s = store;
  const body = h('div', { class: 'sw-window' });
  let close = () => {};
  const save = (list: string[]) => { s.checkpoint(); if (list.length) s.db.switches = list; else delete s.db.switches; s.changedDb(); };
  const render = () => {
    const { listed, unlisted } = names();
    const row = (name: string, inList: boolean) => {
      const nameIn = h('input', { type: 'text', value: name, class: 'sw-name', 'aria-label': `Switch ${name}`, onchange: () => {
        const to = clean(nameIn.value);
        if (!to || to === name) { nameIn.value = name; return; }
        if (listed.includes(to)) { toast(`There's already a switch called ${to}`, 'error'); nameIn.value = name; return; }
        const list = listed.map((x) => (x === name ? to : x));
        if (!inList) list.push(to);
        s.checkpoint();
        const used = renameOnMap(name, to);
        save(list);
        s.changed();
        toast(used ? `Renamed; ${used} use${used === 1 ? '' : 's'} on this map updated` : 'Renamed');
        render();
      } });
      return h('div', { class: `sw-row${name === current ? ' current' : ''}${inList ? '' : ' unlisted'}` },
        nameIn,
        pick ? h('button', { type: 'button', class: 'btn small', onclick: () => { pick(name); close(); } }, 'Use') : h('span'),
        inList
          ? h('button', { type: 'button', class: 'mini-btn', title: 'Remove from the list (events using it keep working)', 'aria-label': `Remove ${name}`, onclick: () => { save(listed.filter((x) => x !== name)); render(); } }, '−')
          : h('button', { type: 'button', class: 'mini-btn', title: 'Add to the list', 'aria-label': `Add ${name} to the list`, onclick: () => { save([...listed, name]); render(); } }, '+'));
    };
    const add = () => {
      let name = 'new_switch', k = 2;
      while (listed.includes(name) || unlisted.includes(name)) name = `new_switch_${k++}`;
      save([...listed, name]);
      render();
      (body.querySelector('.sw-row:last-of-type .sw-name') as HTMLInputElement | null)?.select();
    };
    body.replaceChildren(
      h('p', { class: 'hint' }, 'Every switch in the game. + adds one, − takes it off the list (events using it still work), and typing over a name renames it (and its uses on this map). Events can also use their own self-switches A–D, which need no names.'),
      h('div', { class: 'sw-list' }, ...(listed.length ? listed.map((x) => row(x, true)) : [h('p', { class: 'note' }, 'No switches in the list yet.')])),
      h('button', { type: 'button', class: 'btn', onclick: add }, '+ New switch'),
      ...(unlisted.length ? [h('div', { class: 'section-label' }, 'Used on this map, not in the list'), h('div', { class: 'sw-list' }, ...unlisted.map((x) => row(x, false)))] : []));
  };
  render();
  close = openModal('Switches', body, [{ label: 'Done', primary: true }]);
}
