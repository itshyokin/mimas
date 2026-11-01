/**
 * Ailment and buff pickers for the database: what a hit can inflict (with chances), which ailments something
 * resists or wards off, and what a consumable cures and buffs.
 */
import { statusIconUrl } from '../art/statusIcons';
import { AILMENTS, AILMENT_INFO, BUFFS, BUFF_INFO } from '../game/status';
import { ATTRS } from '../game/attributes';
/** Buffs with the stat ones in the game's stat order. */
const orderedBuffs = () => { const stat = new Set<string>(ATTRS); const rest = BUFFS.filter((b) => !stat.has(b)); return [rest[0], ...ATTRS, ...rest.slice(1)] as typeof BUFFS; };
import { BUFF_TURNS } from '../game/battle/status';
import type { Ailment, BattleWeather, BuffGrant, Inflict } from '../world/types';
import { WEATHER_EFFECT } from '../game/battle/rules';
import { field, h, numberInput, select } from './dom';

const AIL_CHOICES = AILMENTS.map((a) => [a, AILMENT_INFO[a].name] as [string, string]);

/** A list of ailments a hit can give: ailment, chance %, seconds (0: its usual time). */
export function inflictsField(get: () => Inflict[] | undefined, set: (v: Inflict[] | undefined) => void, rerender: () => void, label = 'Ailments its hits can give'): HTMLElement {
  const list = get() ?? [];
  const save = (l: Inflict[]) => set(l.length ? l : undefined);
  return h('div', { class: 'field st-field' }, h('label', {}, label),
    ...list.map((f, k) => h('div', { class: 'st-line' },
      h('img', { src: statusIconUrl(f.ailment), alt: '', class: 'el-icon' }),
      select(AIL_CHOICES, f.ailment, (v) => { f.ailment = v as Ailment; save(list); rerender(); }, { 'aria-label': `Ailment ${k + 1}` }),
      h('span', { class: 'note' }, 'chance'),
      numberInput(f.chance, (v) => { f.chance = Math.max(0, Math.min(100, Math.round(v))); save(list); }, { step: 5, min: 0, max: 100, 'aria-label': `Ailment ${k + 1} chance` }),
      h('span', { class: 'note' }, '% for'),
      numberInput(f.seconds ?? 0, (v) => { const n = Math.max(0, Math.round(v * 10) / 10); if (n) f.seconds = n; else delete f.seconds; save(list); }, { step: 1, min: 0, 'aria-label': `Ailment ${k + 1} seconds` }),
      h('span', { class: 'note' }, 's'),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove ailment ${k + 1}`, onclick: () => { list.splice(k, 1); save(list); rerender(); } }, '✕'))),
    h('button', { type: 'button', class: 'btn small', onclick: () => { list.push({ ailment: 'poison', chance: 20 }); save(list); rerender(); } }, '+ Ailment'),
    h('p', { class: 'note' }, `Seconds 0: its usual time (${AILMENTS.filter((a) => a !== 'zombie').map((a) => `${AILMENT_INFO[a].name} ${AILMENT_INFO[a].seconds}`).join(', ')}; Zombie lasts until cured). Bosses shake ailments off twice as fast.`));
}

/** Toggle chips for a set of ailments (resists, wards off, cures). `all` adds an "All ailments" chip (not Zombie). */
export function ailmentChips(get: () => (Ailment | 'all')[] | undefined, set: (v: (Ailment | 'all')[] | undefined) => void, rerender: () => void, label: string, opts: { all?: boolean } = {}): HTMLElement {
  const cur = new Set(get() ?? []);
  const toggle = (a: Ailment | 'all') => {
    if (cur.has(a)) cur.delete(a); else cur.add(a);
    const order: (Ailment | 'all')[] = ['all', ...AILMENTS];
    const out = order.filter((x) => cur.has(x));
    set(out.length ? out : undefined);
    rerender();
  };
  const chip = (a: Ailment | 'all', name: string) => h('button', { type: 'button', class: 'el-chip', 'aria-pressed': String(cur.has(a)), onclick: () => toggle(a) },
    a === 'all' ? h('span') : h('img', { src: statusIconUrl(a), alt: '' }), name);
  return h('div', { class: 'el-grid', role: 'group', 'aria-label': label },
    ...(opts.all ? [chip('all', 'All (not Zombie)')] : []),
    ...AILMENTS.map((a) => chip(a, AILMENT_INFO[a].name)));
}

/**
 * Buffs (and debuffs like Slow) an item, a spell or an enemy gives: kind, amount, seconds on the map (`seconds`,
 * items only) and turns in a battle.
 */
export function buffsField(get: () => BuffGrant[] | undefined, set: (v: BuffGrant[] | undefined) => void, rerender: () => void, opts: { label?: string; seconds?: boolean } = {}): HTMLElement {
  const list = get() ?? [];
  const save = (l: BuffGrant[]) => set(l.length ? l : undefined);
  const secs = opts.seconds !== false;
  return h('div', { class: 'field st-field' }, h('label', {}, opts.label ?? 'Buffs it gives'),
    ...list.map((b, k) => h('div', { class: 'st-line' },
      h('img', { src: statusIconUrl(`buff:${b.buff}`), alt: '', class: 'el-icon' }),
      select(orderedBuffs().map((x) => [x, BUFF_INFO[x].name] as [string, string]), b.buff, (v) => { b.buff = v as BuffGrant['buff']; delete b.amount; save(list); rerender(); }, { 'aria-label': `Buff ${k + 1}` }),
      h('span', { class: 'note' }, '+'),
      numberInput(b.amount ?? BUFF_INFO[b.buff].amount, (v) => { const n = Math.max(1, Math.round(v)); if (n === BUFF_INFO[b.buff].amount) delete b.amount; else b.amount = n; save(list); }, { step: 1, min: 1, 'aria-label': `Buff ${k + 1} amount` }),
      h('span', { class: 'note' }, `${BUFF_INFO[b.buff].unit || ''} for`),
      secs ? numberInput(b.seconds ?? BUFF_INFO[b.buff].seconds, (v) => { const n = Math.max(1, Math.round(v)); if (n === BUFF_INFO[b.buff].seconds) delete b.seconds; else b.seconds = n; save(list); }, { step: 5, min: 1, 'aria-label': `Buff ${k + 1} seconds` }) : h('span'),
      secs ? h('span', { class: 'note' }, 's on the map,') : h('span'),
      b.whole ? h('span') : numberInput(b.turns ?? BUFF_TURNS, (v) => { const n = Math.max(1, Math.round(v)); if (n === BUFF_TURNS) delete b.turns; else b.turns = n; save(list); }, { step: 1, min: 1, 'aria-label': `Buff ${k + 1} turns` }),
      b.whole ? h('span') : h('span', { class: 'note' }, 'turns in battle,'),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!b.whole, 'aria-label': `Buff ${k + 1} lasts the whole battle`, onchange: (e: Event) => { if ((e.target as HTMLInputElement).checked) { b.whole = true; delete b.turns; } else delete b.whole; save(list); rerender(); } }), h('span', {}, b.whole ? 'the whole battle' : 'or the whole battle')),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove buff ${k + 1}`, onclick: () => { list.splice(k, 1); save(list); rerender(); } }, '✕'))),
    h('button', { type: 'button', class: 'btn small', onclick: () => { list.push({ buff: 'crit' }); save(list); rerender(); } }, '+ Buff'));
}

/** The weather a spell or enemy action brings to a turn-based battle (Rain makes water moves stronger…), and for how long. */
export function weatherField(get: () => { weather?: BattleWeather; weatherTurns?: number }, set: (kind: BattleWeather | undefined, turns: number | undefined) => void, rerender: () => void, label = 'Battle weather it brings'): HTMLElement {
  const cur = get(), kinds = Object.keys(WEATHER_EFFECT) as BattleWeather[];
  const turns = cur.weatherTurns ?? 5;
  return h('div', { class: 'field-row' },
    field(label, select(kinds.map((k) => [k, k === 'none' ? 'None' : `${WEATHER_EFFECT[k].icon} ${WEATHER_EFFECT[k].name} — ${WEATHER_EFFECT[k].text.toLowerCase()}`] as [string, string]), cur.weather ?? 'none', (v) => { set(v === 'none' ? undefined : v as BattleWeather, v === 'none' ? undefined : cur.weatherTurns); rerender(); }),
      'Turn-based: it replaces the battle’s weather (battles start with the map’s own: rain, snow…). Clear weather ends it.'),
    cur.weather && cur.weather !== 'none' ? field('For (rounds)', numberInput(turns, (v) => { const t = Math.max(0, Math.round(v)); set(cur.weather, t === 5 ? undefined : t); rerender(); }, { step: 1, min: 0, 'aria-label': 'Weather rounds' }), '0: the whole battle.') : h('span'));
}

export const statusField = (label: string, el: HTMLElement, hint?: string): HTMLElement => field(label, el, hint);
