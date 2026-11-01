/**
 * Database → Troops: groups of enemies that fight together in random encounters (each kind with how many of it),
 * with their own battle music and whether the party may run. Maps say which troops come where (Spawns layer).
 */
import type { EncounterPick } from '../world/types';
import type { EnemyDef, TroopDef } from '../world/types';
import { checkbox, field, h, numberInput, select, textInput } from './dom';
import { loopChoices } from '../audio/sfx';
import { combatPreviewRow } from './combatPreview';

export function troopsTab(list: TroopDef[], enemies: EnemyDef[], audioFiles: string[], state: { sel: number }, rerender: () => void, battleMaps: string[] = []): HTMLElement[] {
  state.sel = Math.max(0, Math.min(state.sel, list.length - 1));
  const add = () => {
    let id = 'troop', k = 2;
    while (list.some((t) => t.id === id)) id = `troop_${k++}`;
    list.push({ id, name: 'New troop', members: enemies.length ? [{ enemy: enemies[0].id, min: 1, max: 2 }] : [] });
    state.sel = list.length - 1;
    rerender();
  };
  const enemyName = (id: string) => enemies.find((e) => e.id === id)?.name ?? id;
  const summary = (t: TroopDef) => t.members.map((m) => `${(m.min ?? 1) === (m.max ?? m.min ?? 1) ? m.min ?? 1 : `${m.min ?? 1}–${m.max}`} ${enemyName(m.enemy)}`).join(', ');
  const side = h('div', { class: 'item-list', role: 'listbox', 'aria-label': 'Troops' },
    ...list.map((t, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } },
      h('span', {}, t.name, h('small', { class: 'item-sub' }, summary(t))))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, '+ New troop'));
  const t = list[state.sel];
  const form = h('div', { class: 'item-form' });
  if (!t) form.append(h('p', { class: 'note' }, 'No troops yet. A troop is a group of enemies that fight together, like “2–3 slimes” or “two bandits and an archer”. Add troops here, then paint encounter zones on a map (the Spawns layer) and choose which troops come in each zone.'));
  else {
    const opts = enemies.map((e) => [e.id, e.name] as [string, string]);
    const n = (v: number, set: (x: number) => void, label: string) => numberInput(v, (x) => { set(Math.max(0, Math.min(4, Math.round(x)))); rerender(); }, { step: 1, min: 0, max: 4, 'aria-label': label, class: 'db-num' });
    const total = t.members.reduce((s, m) => s + Math.max(m.min ?? 1, m.max ?? m.min ?? 1), 0);
    form.append(
      h('div', { class: 'field-row' },
        field('Name', textInput(t.name, (v) => { t.name = v.trim() || t.name; rerender(); }, { 'aria-label': 'Troop name' })),
        field('Id', textInput(t.id, (v) => {
          const id = v.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
          if (id && !list.some((o) => o !== t && o.id === id)) t.id = id;
          rerender();
        }, { 'aria-label': 'Troop id', title: 'Maps refer to the troop by this id' }))),
      h('section', { class: 'db-section' }, h('h3', {}, 'Enemies'),
        ...t.members.map((m, k) => h('div', { class: 'field-row troop-row' },
          select(opts.length ? opts : [['', '(add enemies in Database → Enemies)']], m.enemy, (v) => { m.enemy = v; rerender(); }, { 'aria-label': `Enemy ${k + 1}` }),
          field('At least', n(m.min ?? 1, (v) => { m.min = v; if ((m.max ?? v) < v) m.max = v; }, `Enemy ${k + 1} at least`)),
          field('At most', n(m.max ?? m.min ?? 1, (v) => { m.max = Math.max(v, m.min ?? 1); }, `Enemy ${k + 1} at most`)),
          h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove enemy ${k + 1}`, onclick: () => { t.members.splice(k, 1); rerender(); } }, '✕'))),
        opts.length ? h('button', { type: 'button', class: 'btn', onclick: () => { t.members.push({ enemy: opts[0][0], min: 1, max: 1 }); rerender(); } }, '+ Add enemy') : h('span'),
        h('p', { class: 'note' }, `Each battle picks how many of each between “at least” and “at most” (up to ${total} in all). A group battle holds at most 3; Single mode’s One at random and One at a time take up to 4.`)),
      h('section', { class: 'db-section' }, h('h3', {}, 'Battle'),
        field('Battle music', select([['', 'The usual (map override, else the game’s)'], ...loopChoices('music', audioFiles).filter(([v]) => v)], t.music ?? '', (v) => { if (v) t.music = v; else delete t.music; })),
        checkbox('The party can’t run from this troop', !!t.noRun, (v) => { if (v) t.noRun = true; else delete t.noRun; }),
        field('In Single battle mode', select([['', 'The map’s default (Map Properties → Battles, else Database → Combat)'], ...[['random', 'Wild encounter: one at random'], ['oneByOne', 'Trainer battle: one at a time'], ['full', 'Swarm: all at once']]] as [string, string][], t.pick ?? '', (v) => { if (v) t.pick = v as EncounterPick; else delete t.pick; }),
          'Wild: one of its foes, at random. Trainer: one at a time, the next stepping in as each falls. Swarm: all at once (a group fight). Group battle mode always fights the troop together.'),
        combatPreviewRow(battleMaps, () => t.members.flatMap((m) => Array.from({ length: Math.max(1, m.max ?? m.min ?? 1) }, () => m.enemy)).slice(0, 3))),
    );
  }
  return [h('div', { class: 'items-layout' }, side, form)];
}
