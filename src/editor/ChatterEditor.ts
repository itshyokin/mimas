/**
 * Database → Characters → Chatter: what each hero says now and then out of battle (game/chatter.ts). Pick a hero,
 * set how talkative they are, then write General lines per trigger (one line per row; one at random each time) and
 * Map lines (a map and a line; several rows for one map: one at random).
 */
import type { GroupChatter, HeroChatter, HeroDef } from '../world/types';
import { conditionForm, conditionText } from './CommandEditor';
import { switchInput } from './switchPicker';
import { CHATTER_TRIGGERS } from '../game/chatter';
import { field, h, select } from './dom';

export interface ChatterState { sel: number }

/** Tidy one hero's chatter for saving (undefined: nothing written). */
export function cleanChatter(c: HeroChatter | undefined): HeroChatter | undefined {
  if (!c) return undefined;
  const out: HeroChatter = {};
  if (c.amount !== undefined && c.amount !== 5) out.amount = Math.max(0, Math.min(10, Math.round(c.amount)));
  const lines = Object.fromEntries(Object.entries(c.lines ?? {}).map(([k, v]) => [k, (v ?? []).map((l) => l.trim()).filter(Boolean)]).filter(([, v]) => v.length));
  if (Object.keys(lines).length) out.lines = lines;
  const maps = (c.maps ?? []).map((r) => ({ map: r.map, line: r.line.trim() })).filter((r) => r.map && r.line);
  if (maps.length) out.maps = maps;
  const camp = (c.camp ?? []).map((r) => (r.if ? { line: r.line.trim(), if: r.if } : { line: r.line.trim() })).filter((r) => r.line);
  if (camp.length) out.camp = camp;
  return Object.keys(out).length ? out : undefined;
}

export function chatterTab(heroes: HeroDef[], maps: string[], st: ChatterState, rerender: () => void, groups: GroupChatter[] = []): HTMLElement[] {
  if (!heroes.length) return [h('p', { class: 'note' }, 'Add heroes first (Database → Heroes).')];
  st.sel = Math.max(0, Math.min(heroes.length - 1, st.sel));
  const x = heroes[st.sel];
  const c = (x.chatter ??= {});

  const amount = h('input', { type: 'range', min: '0', max: '10', step: '1', value: String(c.amount ?? 5), 'aria-label': 'Chatter amount' });
  const amountNote = h('span', { class: 'chat-amount' });
  const describe = (n: number) => (n === 0 ? 'Never talks' : n <= 2 ? 'Almost never (a stoic knight)' : n <= 4 ? 'Now and then' : n <= 6 ? 'Sometimes' : n <= 8 ? 'Often' : 'All the time (a whiner)');
  const showAmount = () => { amountNote.textContent = `${amount.value}: ${describe(+amount.value)}`; };
  amount.addEventListener('input', () => { c.amount = +amount.value; showAmount(); });
  showAmount();

  const general = CHATTER_TRIGGERS.map(([t, name]) => {
    const ta = h('textarea', { rows: '2', class: 'chat-lines', placeholder: 'One line per row (one is picked at random)', 'aria-label': `${name} lines` });
    ta.value = (c.lines?.[t] ?? []).join('\n');
    ta.addEventListener('change', () => {
      const ls = ta.value.split('\n').map((l) => l.trim()).filter(Boolean);
      if (ls.length) (c.lines ??= {})[t] = ls;
      else if (c.lines) { delete c.lines[t]; if (!Object.keys(c.lines).length) delete c.lines; }
    });
    return h('div', { class: 'chat-row' }, h('label', { class: 'chat-trigger' }, name), ta);
  });

  const mapOpts: [string, string][] = maps.map((m) => [m, m]);
  const rows = (c.maps ?? []).map((r, i) => {
    const line = h('input', { type: 'text', value: r.line, placeholder: 'This is Reach City. I grew up here!', 'aria-label': 'Line', class: 'chat-map-line' });
    line.addEventListener('change', () => { r.line = line.value; });
    return h('div', { class: 'chat-row map' },
      select(mapOpts.some(([m]) => m === r.map) ? mapOpts : [[r.map, `${r.map} (missing)`], ...mapOpts], r.map, (v) => { r.map = v; }, { 'aria-label': 'Map' }),
      line,
      h('button', { type: 'button', class: 'btn small', title: 'Remove this line', 'aria-label': 'Remove', onclick: () => { c.maps!.splice(i, 1); if (!c.maps!.length) delete c.maps; rerender(); } }, '−'));
  });

  // At camp (Update 122): talked to while resting. A default line, and lines for while something's true.
  const campRows = (c.camp ?? []).map((r, i) => {
    const line = h('input', { type: 'text', value: r.line, placeholder: r.if ? 'Did you hear about the bandits?' : 'Nice to sit down for a bit.', 'aria-label': 'Camp line', class: 'chat-map-line' });
    line.addEventListener('change', () => { r.line = line.value; });
    const cond = r.if ? h('div', { class: 'chat-cond' }, h('span', { class: 'note' }, 'Only while:'), conditionForm(r.if, (v) => { r.if = v; }, true, () => { delete r.if; rerender(); }))
      : h('button', { type: 'button', class: 'btn small ghost', title: 'Only say it while a switch is on, a quest is active…', onclick: () => { r.if = { switch: '', is: true }; rerender(); } }, 'Only when…');
    return h('div', { class: 'chat-camp-row' }, h('div', { class: 'chat-row map' }, h('span', { class: 'chat-tag' }, r.if ? `If ${conditionText(r.if)}` : 'Default'), line,
      h('button', { type: 'button', class: 'btn small', title: 'Remove this line', 'aria-label': 'Remove', onclick: () => { c.camp!.splice(i, 1); if (!c.camp!.length) delete c.camp; rerender(); } }, '−')), cond);
  });

  // Group chatter (Update 122): whole conversations for the next camp.
  const heroOpts: [string, string][] = heroes.map((d) => [d.id, d.name || d.id]);
  const groupBoxes = groups.map((g, gi) => {
    const name = h('input', { type: 'text', value: g.name, placeholder: 'Around the fire after the bridge', 'aria-label': 'Conversation name' });
    name.addEventListener('change', () => { g.name = name.value; });
    const lines = g.lines.map((l, li) => {
      const text = h('input', { type: 'text', value: l.text, placeholder: 'What they say', 'aria-label': `Line ${li + 1}`, class: 'chat-map-line' });
      text.addEventListener('change', () => { l.text = text.value; });
      return h('div', { class: 'chat-row map' }, h('span', { class: 'chat-num' }, String(li + 1)),
        select(heroOpts, l.hero, (v) => { l.hero = v; }, { 'aria-label': 'Speaker' }), text,
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'Move up', disabled: li === 0, onclick: () => { g.lines.splice(li - 1, 0, g.lines.splice(li, 1)[0]); rerender(); } }, '↑'),
        h('button', { type: 'button', class: 'btn small', 'aria-label': 'Remove', onclick: () => { g.lines.splice(li, 1); rerender(); } }, '−'));
    });
    return h('div', { class: 'chat-group' },
      h('div', { class: 'field-row' }, field('Name', name), field('Id', h('code', {}, g.id)),
        field('Also plays when switch is on', switchInput(g.switch ?? '', (v) => { if (v) g.switch = v; else delete g.switch; }, { placeholder: '(only by the event command)' }))),
      ...lines,
      h('div', { class: 'field-row' },
        h('button', { type: 'button', class: 'btn small', disabled: g.lines.length >= 20, onclick: () => { g.lines.push({ hero: g.lines[g.lines.length - 1]?.hero ?? heroes[0].id, text: '' }); rerender(); } }, '+ Add a line'),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => { groups.splice(gi, 1); rerender(); } }, 'Delete conversation')));
  });
  const newGroup = () => {
    let n = groups.length + 1;
    while (groups.some((g) => g.id === `talk_${n}`)) n++;
    groups.push({ id: `talk_${n}`, name: `Conversation ${n}`, lines: [{ hero: heroes[0].id, text: '' }, { hero: heroes[1]?.id ?? heroes[0].id, text: '' }] });
    rerender();
  };

  return [
    h('section', { class: 'db-section' }, h('h3', {}, 'Party chatter'),
      h('p', { class: 'note' }, 'Out of battle, a hero now and then says a line in a speech bubble over their head (one at a time). Every line said goes in the adventure log. The hero you play talks too, but more rarely.'),
      h('div', { class: 'field-row' },
        field('Hero', select(heroes.map((d, i) => [String(i), d.name || d.id] as [string, string]), String(st.sel), (v) => { st.sel = +v; rerender(); })),
        field('Chatter amount', h('div', { class: 'chat-amount-row' }, amount, amountNote), 'How talkative they are: 0 never … 10 all the time.'))),
    h('section', { class: 'db-section' }, h('h3', {}, 'General'),
      h('p', { class: 'note' }, 'Lines for things that happen. Leave a trigger empty and they say nothing then.'),
      h('div', { class: 'chat-grid' }, ...general)),
    h('section', { class: 'db-section' }, h('h3', {}, 'Map chatter'),
      h('p', { class: 'note' }, 'Said on coming onto that map (likeliest the first time). Several lines for one map: one at random.'),
      ...rows,
      h('button', { type: 'button', class: 'btn small', onclick: () => { (c.maps ??= []).push({ map: maps[0] ?? '', line: '' }); rerender(); } }, '+ Add a map line')),
    h('section', { class: 'db-section' }, h('h3', {}, 'At camp (talked to)'),
      h('p', { class: 'note' }, 'What this hero says when the player talks to them while they rest at camp. Write a Default line, then lines that only play while something is true (a switch on, a quest active…) so they talk about what’s going on. A line whose condition holds wins over the default; several: one at random. With none, they use a Making camp line.'),
      ...campRows,
      h('button', { type: 'button', class: 'btn small', onclick: () => { (c.camp ??= []).push({ line: '' }); rerender(); } }, '+ Add a camp line')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Group chatter (everyone)'),
      h('p', { class: 'note' }, 'A conversation that plays at the next camp, top to bottom, each line over its speaker’s head, like a live talk. Start it with the event command “Group chatter at next camp”, or give it a switch and it plays at a camp once the switch is on. Each plays once. Speakers not in the party are skipped.'),
      ...groupBoxes,
      h('button', { type: 'button', class: 'btn small', onclick: newGroup }, '+ New conversation')),
  ];
}
