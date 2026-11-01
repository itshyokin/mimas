/**
 * Database → Quests: the quest list with a form for the selected quest — its name, who gives it and where, the story,
 * the objectives (tasks events tick off, enemies to defeat, items to collect, maps to reach), how it finishes and its
 * rewards. Events start and advance quests with the "Quest" command.
 */
import type { EnemyDef, ItemDef, ObjectiveKind, QuestDef, QuestObjective } from '../world/types';
import { checkbox, field, h, numberInput, select, textInput } from './dom';
import type { EditorStore } from './store';

const OBJECTIVE_KINDS: [ObjectiveKind, string][] = [
  ['task', 'Task (an event ticks it off: talk to someone, open a gate…)'],
  ['defeat', 'Defeat enemies'],
  ['collect', 'Collect items (carry them)'],
  ['visit', 'Reach a map'],
];

function slug(text: string, fallback: string, taken: (id: string) => boolean): string {
  const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || fallback;
  let id = base, n = 2;
  while (taken(id)) id = `${base}_${n++}`;
  return id;
}

/** Quests and objectives added in this window: their id follows their name until the database is applied. */
const fresh = new WeakSet<object>();

export interface QuestsLookups { items: ItemDef[]; enemies: EnemyDef[] }

export function questsTab(store: EditorStore, quests: QuestDef[], look: QuestsLookups, state: { sel: number }, rerender: () => void): HTMLElement[] {
  state.sel = Math.min(state.sel, quests.length - 1);
  const add = () => {
    const q: QuestDef = { id: slug('New quest', 'quest', (x) => quests.some((d) => d.id === x)), name: 'New quest', kind: 'side', objectives: [] };
    const o: QuestObjective = { id: 'task', text: 'Do something', kind: 'task' };
    q.objectives.push(o);
    fresh.add(q); fresh.add(o);
    quests.push(q);
    state.sel = quests.length - 1;
    rerender();
  };
  const list = h('div', { class: 'item-list', role: 'listbox', 'aria-label': 'Quests' },
    ...quests.map((q, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } },
      h('span', { class: `quest-mark ${q.kind}`, 'aria-hidden': 'true' }, q.kind === 'main' ? '★' : '•'), h('span', {}, q.name || '(no name)'))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, '+ New quest'));
  const q = quests[state.sel];
  const form = h('div', { class: 'item-form' });
  if (!q) form.append(h('p', { class: 'note' }, 'No quests yet. Add one, then start it from an event with the “Quest” command (talking to someone, reading a notice board…). Defeat, collect and visit objectives count by themselves; tasks are ticked off by events.'));
  else form.append(...questForm(store, quests, q, look, rerender, () => { quests.splice(state.sel, 1); state.sel = Math.max(0, state.sel - 1); rerender(); }));
  return [h('div', { class: 'items-layout' }, list, form)];
}

function questForm(store: EditorStore, quests: QuestDef[], q: QuestDef, look: QuestsLookups, rerender: () => void, remove: () => void): HTMLElement[] {
  const desc = h('textarea', { rows: 3, class: 'text-area', placeholder: 'The story: what’s going on and why it matters (shown in the quest log)' });
  desc.value = q.description ?? '';
  desc.addEventListener('input', () => (q.description = desc.value.trim() ? desc.value : undefined));
  const objectives = h('div', { class: 'quest-objs' });
  const renderObjectives = () => objectives.replaceChildren(...q.objectives.map((o, i) => objectiveRow(store, q, o, i, look, renderObjectives)),
    h('button', { type: 'button', class: 'btn', onclick: () => {
      const o: QuestObjective = { id: slug('objective', 'objective', (x) => q.objectives.some((d) => d.id === x)), text: '', kind: 'task' };
      fresh.add(o);
      q.objectives.push(o);
      renderObjectives();
      objectives.querySelectorAll<HTMLInputElement>('.quest-obj-text').item(q.objectives.length - 1)?.focus();
    } }, '+ Add objective'));
  renderObjectives();

  const r = (q.rewards ??= {});
  const rewardItems = h('div', { class: 'shop-goods' });
  const itemOpts = (cur: string): [string, string][] => {
    const out: [string, string][] = look.items.map((d) => [d.id, d.name]);
    if (cur && !out.some(([id]) => id === cur)) out.unshift([cur, `${cur} (missing)`]);
    return out.length ? out : [['', '(no items yet)']];
  };
  const renderRewardItems = () => rewardItems.replaceChildren(...(r.items ?? []).map((it, k) => h('div', { class: 'field-row shop-good' },
    select(itemOpts(it.item), it.item, (v) => (it.item = v), { 'aria-label': `Reward item ${k + 1}` }),
    numberInput(it.count, (v) => (it.count = Math.max(1, Math.round(v))), { step: 1, min: 1, 'aria-label': `How many (item ${k + 1})`, class: 'db-num' }),
    h('button', { type: 'button', class: 'mini-btn', title: 'Remove', 'aria-label': `Remove reward item ${k + 1}`, onclick: () => { r.items!.splice(k, 1); if (!r.items!.length) delete r.items; renderRewardItems(); } }, '✕'))),
  h('button', { type: 'button', class: 'btn', disabled: !look.items.length, onclick: () => { (r.items ??= []).push({ item: look.items[0]?.id ?? '', count: 1 }); renderRewardItems(); } }, '+ Add item'));
  renderRewardItems();
  // Relationship points (Update 124): a's rating of b goes up (or down), optionally both ways.
  const heroes = store.db.heroes ?? [], raters: [string, string][] = heroes.slice(1).map((x) => [x.id, x.name]), rated: [string, string][] = [['', 'The hero you play'], ...raters];
  const rewardRel = h('div', { class: 'shop-goods' });
  const renderRel = () => rewardRel.replaceChildren(...(r.relations ?? []).map((x, k) => h('div', { class: 'field-row shop-good' },
    select(raters.length ? raters : [['', '(no party members yet)']], x.a, (v) => (x.a = v), { 'aria-label': 'Whose rating' }),
    h('span', { class: 'note' }, 'of'),
    select(rated, x.b, (v) => (x.b = v), { 'aria-label': 'Of whom' }),
    numberInput(x.value, (v) => (x.value = Math.round(v)), { step: 1, min: -100, max: 100, 'aria-label': 'Points', class: 'db-num' }),
    checkbox('both ways', !!x.both, (v) => { if (v) x.both = true; else delete x.both; }),
    h('button', { type: 'button', class: 'mini-btn', title: 'Remove', 'aria-label': 'Remove', onclick: () => { r.relations!.splice(k, 1); if (!r.relations!.length) delete r.relations; renderRel(); } }, '✕'))),
  h('button', { type: 'button', class: 'btn', disabled: !raters.length, onclick: () => { (r.relations ??= []).push({ a: raters[0]?.[0] ?? '', b: '', value: 5 }); renderRel(); } }, '+ Add relationship points'));
  renderRel();
  const rewardNum = (key: 'gold' | 'xp' | 'skillPoints', label: string) =>
    field(label, numberInput(r[key] ?? 0, (v) => { const n = Math.max(0, Math.round(v)); if (n) r[key] = n; else delete r[key]; }, { step: 1, min: 0 }));

  const turnIn = textInput(q.turnIn ?? '', (v) => (q.turnIn = v.trim() || undefined), { placeholder: q.giver ? `Return to ${q.giver}` : 'e.g. Return to Mira' });
  const turnInField = field('When every objective is done, the log says', turnIn, 'Then an event completes it (check with a conditional branch: Quest → Ready to hand in).');
  turnInField.hidden = !!q.autoComplete;

  return [
    h('div', { class: 'item-head quest-head' },
      field('Name', textInput(q.name, (v) => {
        q.name = v.trim() || q.name;
        if (fresh.has(q)) q.id = slug(q.name, 'quest', (x) => x !== q.id && quests.some((d) => d.id === x));
        rerender();
      }, { 'aria-label': 'Quest name' })),
      h('div', { class: 'item-id', title: 'Used by events and saves; it doesn’t change when you rename the quest.' }, `id: ${q.id}`)),
    h('div', { class: 'field-row' },
      field('Kind', select([['main', '★ Main quest'], ['side', 'Side quest']], q.kind, (v) => { q.kind = v as 'main' | 'side'; rerender(); })),
      field('Given by', textInput(q.giver ?? '', (v) => { q.giver = v.trim() || undefined; turnIn.placeholder = q.giver ? `Return to ${q.giver}` : 'e.g. Return to Mira'; }, { placeholder: 'e.g. Mira' })),
      field('Where', textInput(q.location ?? '', (v) => (q.location = v.trim() || undefined), { placeholder: 'e.g. Willow Village' }))),
    field('Description', desc),
    h('section', { class: 'db-section' }, h('h3', {}, 'Objectives'), objectives,
      checkbox('One at a time, in order (the next shows once the one before is done)', !!q.inOrder, (v) => (q.inOrder = v || undefined)),
      h('p', { class: 'note' }, 'The id after each objective is what the “Quest” command and conditions refer to.')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Finishing'),
      checkbox('Completes by itself when the last objective is done', !!q.autoComplete, (v) => { q.autoComplete = v || undefined; turnInField.hidden = v; }),
      turnInField,
      checkbox('Completing it takes the items its collect objectives ask for', !!q.takeItems, (v) => (q.takeItems = v || undefined))),
    h('section', { class: 'db-section' }, h('h3', {}, 'Rewards'),
      h('div', { class: 'field-row' }, rewardNum('gold', 'Gold'), rewardNum('xp', 'EXP'), rewardNum('skillPoints', 'Skill points')),
      field('Items', rewardItems, 'Given on completion; what doesn’t fit in the bag is put down by the hero’s feet.'),
      field('Relationships', rewardRel, 'How much one party member’s view of another changes (negative lowers it).')),
    h('div', { class: 'item-foot' }, h('button', { type: 'button', class: 'btn danger', onclick: () => {
      const used = questUses(store, q.id);
      if (used && !confirm(`${q.name} is used by ${used} event command${used === 1 ? '' : 's'} or condition${used === 1 ? '' : 's'}. Delete it anyway?`)) return;
      remove();
    } }, 'Delete quest')),
  ];
}

function objectiveRow(store: EditorStore, q: QuestDef, o: QuestObjective, i: number, look: QuestsLookups, rerender: () => void): HTMLElement {
  const target = h('div', { class: 'field-row' });
  const renderTarget = () => {
    target.replaceChildren();
    if (o.kind === 'defeat') {
      const opts: [string, string][] = look.enemies.map((e) => [e.id, e.name]);
      if (o.enemy && !opts.some(([id]) => id === o.enemy)) opts.unshift([o.enemy, `${o.enemy} (missing)`]);
      if (!o.enemy) o.enemy = opts[0]?.[0];
      target.append(field('Enemy', select(opts.length ? opts : [['', '(no enemies yet)']], o.enemy ?? '', (v) => (o.enemy = v))));
    } else if (o.kind === 'collect') {
      const opts: [string, string][] = look.items.map((d) => [d.id, d.name]);
      if (o.item && !opts.some(([id]) => id === o.item)) opts.unshift([o.item, `${o.item} (missing)`]);
      if (!o.item) o.item = opts[0]?.[0];
      target.append(field('Item', select(opts.length ? opts : [['', '(no items yet)']], o.item ?? '', (v) => (o.item = v))));
    } else if (o.kind === 'visit') {
      const opts: [string, string][] = store.maps.map((m) => [m, m]);
      if (o.map && !opts.some(([id]) => id === o.map)) opts.unshift([o.map, `${o.map} (missing)`]);
      if (!o.map) o.map = opts[0]?.[0];
      target.append(field('Map', select(opts, o.map ?? '', (v) => (o.map = v))));
    }
    if (o.kind !== 'visit') target.append(field(o.kind === 'task' ? 'Count' : 'How many', numberInput(o.count ?? 1, (v) => { const n = Math.max(1, Math.round(v)); o.count = n > 1 ? n : undefined; }, { step: 1, min: 1, class: 'db-num' }),
      o.kind === 'task' ? 'Above 1: events count it up (“Quest” → Count it up).' : undefined));
  };
  renderTarget();
  const btn = (text: string, title: string, fn: () => void, disabled = false) => h('button', { type: 'button', class: 'mini-btn', title, 'aria-label': title, disabled, onclick: fn }, text);
  const text = textInput(o.text, (v) => {
    o.text = v.trim();
    if (fresh.has(o)) { o.id = slug(o.text, 'objective', (x) => x !== o.id && q.objectives.some((d) => d.id === x)); idEl.textContent = `id: ${o.id}`; }
  }, { placeholder: 'What to do, e.g. “Defeat the slimes in the meadow”', class: 'quest-obj-text', 'aria-label': `Objective ${i + 1}` });
  const idEl = h('span', { class: 'item-id' }, `id: ${o.id}`);
  return h('div', { class: 'quest-obj' },
    h('div', { class: 'quest-obj-head' }, h('span', { class: 'quest-obj-n' }, String(i + 1)), text,
      btn('↑', 'Move up', () => { [q.objectives[i - 1], q.objectives[i]] = [q.objectives[i], q.objectives[i - 1]]; rerender(); }, i === 0),
      btn('↓', 'Move down', () => { [q.objectives[i + 1], q.objectives[i]] = [q.objectives[i], q.objectives[i + 1]]; rerender(); }, i === q.objectives.length - 1),
      btn('✕', 'Delete objective', () => { q.objectives.splice(i, 1); rerender(); })),
    h('div', { class: 'field-row' },
      field('Kind', select(OBJECTIVE_KINDS, o.kind, (v) => {
        o.kind = v as ObjectiveKind;
        if (o.kind !== 'defeat') delete o.enemy;
        if (o.kind !== 'collect') delete o.item;
        if (o.kind !== 'visit') delete o.map; else delete o.count;
        renderTarget();
      }))),
    target,
    h('div', { class: 'quest-obj-foot' }, checkbox('Optional', !!o.optional, (v) => (o.optional = v || undefined)), idEl));
}

/** How many event commands and conditions mention a quest (across the loaded maps). */
function questUses(store: EditorStore, id: string): number {
  let n = 0;
  const json = JSON.stringify(store.map?.events ?? []);
  const re = new RegExp(`"quest":"${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
  n += (json.match(re) ?? []).length;
  return n;
}

/** Tidy for database.json: no empty rewards or blank objective texts. */
export function cleanQuests(quests: QuestDef[]): QuestDef[] | undefined {
  for (const q of quests) {
    if (q.rewards && !Object.keys(q.rewards).length) delete q.rewards;
    for (const o of q.objectives) if (!o.text) o.text = o.id;
  }
  return quests.length ? quests : undefined;
}
