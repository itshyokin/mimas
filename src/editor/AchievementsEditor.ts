/**
 * Database → Achievements: each achievement's ID (Steam-style API name), name, description, icon, points, whether it's
 * hidden until unlocked, and what unlocks it. Export a Steam-ready list for Steamworks.
 */
import type { EditorStore } from './store';
import type { Database } from '../world/types';
import { checkbox, field, h, numberInput, select, textInput, toast } from './dom';
import { ITEM_ICONS, builtinIcon, builtinIconName } from '../art/itemIcons';
import { RECORD_NAMES, RULE_NAMES, steamCsv, toId, validId, type AchievementDef, type AchievementKind, type AchievementRule } from '../game/achievements';
import { additionList, spellList } from '../game/abilities';

const DEFAULT_RULE: Record<AchievementKind, () => AchievementRule> = {
  event: () => ({ kind: 'event' }), switch: () => ({ kind: 'switch', switch: '' }), defeat: () => ({ kind: 'defeat', count: 10 }),
  addition: () => ({ kind: 'addition', count: 10 }), spell: () => ({ kind: 'spell', count: 10 }), level: () => ({ kind: 'level', level: 10 }),
  quest: () => ({ kind: 'quest', quest: '' }), gold: () => ({ kind: 'gold', amount: 1000 }), item: () => ({ kind: 'item', item: '', count: 1 }),
  party: () => ({ kind: 'party', size: 4 }), record: () => ({ kind: 'record', record: 'steps', count: 10000 }),
};

export function achievementsTab(store: EditorStore, db: Database, list: AchievementDef[], state: { sel: number }, rerender: () => void): HTMLElement[] {
  state.sel = Math.max(0, Math.min(state.sel, list.length - 1));
  const iconUrl = (icon?: string): string => {
    const b = builtinIconName(icon ?? 'builtin:trophy');
    if (b) return builtinIcon(b).toDataURL();
    const f = store.files.get(icon!);
    return f ? URL.createObjectURL(f) : icon!;
  };
  const add = () => {
    let id = 'NEW_ACHIEVEMENT', k = 2;
    while (list.some((a) => a.id === id)) id = `NEW_ACHIEVEMENT_${k++}`;
    list.push({ id, name: 'New achievement', description: 'What the player did.', icon: 'builtin:trophy', points: 10, rule: { kind: 'event' } });
    state.sel = list.length - 1;
    rerender();
  };
  const total = list.reduce((s, a) => s + a.points, 0);
  const side = h('div', { class: 'item-list', role: 'listbox', 'aria-label': 'Achievements' },
    ...list.map((a, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } },
      h('img', { class: 'item-icon', src: iconUrl(a.icon), alt: '' }),
      h('span', {}, a.name, h('small', { class: 'item-sub' }, `${a.points}G · ${RULE_NAMES[a.rule.kind]}${a.hidden ? ' · hidden' : ''}`)))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, '+ New achievement'),
    h('p', { class: 'note' }, `${list.length} achievement${list.length === 1 ? '' : 's'} · ${total}G in all.`),
    list.length ? h('button', { type: 'button', class: 'btn small', onclick: () => {
      const blob = new Blob([steamCsv(list)], { type: 'text/csv' }), url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'achievements-steam.csv' }); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Saved achievements-steam.csv');
    } }, 'Export for Steam (.csv)') : h('span'));
  const a = list[state.sel];
  const form = h('div', { class: 'item-form' });
  if (!a) form.append(h('p', { class: 'note' }, 'No achievements yet. Each has a name, a description, an icon and points, and unlocks by itself when its goal is met (enemies defeated, Additions used, a level…) or from an event (Unlock achievement). They show in Pause → Achievements with an Xbox-style pop-up when unlocked.'));
  else {
    const r = a.rule;
    const ruleFields: HTMLElement[] = [];
    const count = (v: number, set: (n: number) => void, label: string) => field(label, numberInput(v, (n) => set(Math.max(1, Math.round(n))), { min: 1, step: 1 }));
    const enemies = (db.enemies ?? []).map((e) => [e.id, e.name] as [string, string]);
    const quests = (db.quests ?? []).map((q) => [q.id, q.name] as [string, string]);
    const items = (db.items ?? []).map((d) => [d.id, d.name] as [string, string]);
    if (r.kind === 'switch') ruleFields.push(field('Switch', textInput(r.switch, (v) => (r.switch = v.trim()), { placeholder: 'switch name' }), 'Unlocks when this switch turns on.'));
    if (r.kind === 'defeat') ruleFields.push(field('Enemy', select([['', 'Any enemy'], ...enemies], r.enemy ?? '', (v) => { if (v) r.enemy = v; else delete r.enemy; })), count(r.count, (n) => (r.count = n), 'How many'));
    if (r.kind === 'addition') ruleFields.push(field('Addition', select([['', 'Any Addition'], ...additionList(db).map((d) => [d.id, d.name] as [string, string])], r.addition ?? '', (v) => { if (v) r.addition = v; else delete r.addition; })), count(r.count, (n) => (r.count = n), 'Times performed'));
    if (r.kind === 'spell') ruleFields.push(field('Spell', select([['', 'Any spell'], ...spellList(db).map((d) => [d.id, d.name] as [string, string])], r.spell ?? '', (v) => { if (v) r.spell = v; else delete r.spell; })), count(r.count, (n) => (r.count = n), 'Times cast (in battle)'));
    if (r.kind === 'level') ruleFields.push(count(r.level, (n) => (r.level = n), 'Hero level'));
    if (r.kind === 'quest') ruleFields.push(field('Quest', select(quests.length ? quests : [['', '(add quests first)']], r.quest, (v) => (r.quest = v)), 'Unlocks when the quest is completed.'));
    if (r.kind === 'gold') ruleFields.push(count(r.amount, (n) => (r.amount = n), 'Gold held at once'));
    if (r.kind === 'item') ruleFields.push(field('Item', select(items.length ? items : [['', '(add items first)']], r.item, (v) => (r.item = v))), count(r.count ?? 1, (n) => (r.count = n), 'How many in the bag'));
    if (r.kind === 'party') ruleFields.push(count(r.size, (n) => (r.size = Math.min(8, n)), 'Party members (the hero counts)'));
    if (r.kind === 'record') ruleFields.push(field('Record', select(RECORD_NAMES, r.record, (v) => (r.record = v)), 'The Journal’s Records (Pause → Journal → Records), plus battles won and won without a scratch.'), count(r.count, (n) => (r.count = n), 'Reaches'));
    if (r.kind === 'event') ruleFields.push(h('p', { class: 'note' }, 'Only the “Unlock achievement” event command unlocks it (finishing a story chapter, a secret, a boss).'));
    const idInput = textInput(a.id, (v) => {
      const id = v.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
      if (id && validId(id) && !list.some((o) => o !== a && o.id === id)) a.id = id;
      rerender();
    }, { 'aria-label': 'Achievement id' });
    const icons = h('div', { class: 'icon-grid' }, ...['trophy', 'coin', 'gem', 'sword', 'shield', 'key', 'book', 'scroll', 'fish_trout', 'potion', 'ring_sun', 'shard_fire', 'shard_light', 'amulet', 'boots', 'herb']
      .filter((n) => ITEM_ICONS[n]).map((n) => h('button', { type: 'button', class: 'icon-pick', 'aria-pressed': String(a.icon === `builtin:${n}`), title: ITEM_ICONS[n].name, onclick: () => { a.icon = `builtin:${n}`; rerender(); } },
        h('img', { src: builtinIcon(n).toDataURL(), alt: ITEM_ICONS[n].name }))));
    form.append(
      h('div', { class: 'field-row' },
        field('Name', textInput(a.name, (v) => { const was = a.name; a.name = v.trim() || a.name; if (a.id === toId(was)) a.id = toId(a.name); rerender(); })),
        field('ID', idInput, 'Letters, numbers and underscores: the same as its API name on Steam, so it carries over.'),
        field('Points', numberInput(a.points, (v) => { a.points = Math.max(0, Math.round(v)); rerender(); }, { min: 0, step: 5 }))),
      field('Description', textInput(a.description, (v) => { a.description = v.trim(); rerender(); }, { placeholder: 'Defeat 100 slimes.' })),
      field('Icon', h('div', {}, h('img', { class: 'ach-edit-icon', src: iconUrl(a.icon), alt: '' }), icons), 'Built-in pictures; an imported item icon’s path also works.'),
      checkbox('Hidden until unlocked (shown as “???”)', !!a.hidden, (v) => { a.hidden = v || undefined; rerender(); }),
      h('section', { class: 'db-section' }, h('h3', {}, 'Unlocked by'),
        field('Goal', select(Object.entries(RULE_NAMES) as [string, string][], r.kind, (v) => { a.rule = DEFAULT_RULE[v as AchievementKind](); rerender(); })),
        ...ruleFields),
      h('button', { type: 'button', class: 'btn danger', onclick: () => { list.splice(state.sel, 1); rerender(); } }, 'Delete achievement'),
    );
  }
  return [h('div', { class: 'items-layout' }, side, form)];
}
