/**
 * Database → Party → Relationships (Update 124): where each party member's rating of each other one starts (one way:
 * a row is how that hero sees the others), which pairs read "Love" at the top, and the points each thing that happens
 * is worth. The hero you play (the first hero) is rated by the others but has no row of their own.
 */
import type { HeroDef, RelationSettings } from '../world/types';
import { REL_BATTLE_CAP, REL_KINDS, REL_START, relKey, relLabel } from '../game/relations';
import { checkbox, field, h, numberInput } from './dom';

export function relationsTab(rel: RelationSettings, heroes: HeroDef[], rerender: () => void): HTMLElement[] {
  if (heroes.length < 2) return [h('p', { class: 'note' }, 'Add at least two heroes first (Database → Heroes).')];
  const lead = heroes[0], raters = heroes.slice(1);
  const cell = (a: HeroDef, b: HeroDef) => {
    const v = rel.start?.[a.id]?.[b.id] ?? REL_START, key = relKey(a.id, b.id), love = !!rel.love?.includes(key);
    const tag = h('span', { class: 'rel-tag' });
    const paint = (n: number) => { const l = relLabel(n, rel.love?.includes(key)); tag.textContent = l.name; tag.style.color = l.color; };
    paint(v);
    const num = numberInput(v, (n) => {
      const x = Math.max(0, Math.min(100, Math.round(n)));
      const row = ((rel.start ??= {})[a.id] ??= {});
      if (x === REL_START) delete row[b.id]; else row[b.id] = x;
      if (!Object.keys(row).length) delete rel.start![a.id];
      if (rel.start && !Object.keys(rel.start).length) delete rel.start;
      paint(x);
    }, { step: 5, min: 0, max: 100, 'aria-label': `${a.name}’s view of ${b.name}`, class: 'db-num' });
    const heart = h('button', { type: 'button', class: `btn small ghost rel-heart${love ? ' on' : ''}`, title: 'At 90+ this reads Love instead of Best friends', 'aria-pressed': String(love), onclick: () => {
      const list = (rel.love ??= []), i = list.indexOf(key);
      if (i >= 0) list.splice(i, 1); else list.push(key);
      if (!list.length) delete rel.love;
      rerender();
    } }, '♥');
    return h('td', {}, h('div', { class: 'rel-cell' }, num, heart), tag);
  };
  const table = h('table', { class: 'rel-grid' },
    h('thead', {}, h('tr', {}, h('th', {}, 'How … sees →'), ...heroes.map((b) => h('th', {}, b.name + (b === lead ? ' (you)' : ''))))),
    h('tbody', {}, ...raters.map((a) => h('tr', {}, h('th', {}, a.name), ...heroes.map((b) => (a === b ? h('td', { class: 'rel-self' }, '—') : cell(a, b)))))));
  const gains = REL_KINDS.map(([k, label, dflt]) => field(label, numberInput(rel.gains?.[k] ?? dflt, (n) => {
    const x = Math.round(n);
    if (x === dflt) { if (rel.gains) { delete rel.gains[k]; if (!Object.keys(rel.gains).length) delete rel.gains; } } else (rel.gains ??= {})[k] = x;
  }, { step: 1, min: -20, max: 20 })));
  return [
    h('section', { class: 'db-section' }, h('h3', {}, 'Relationships'),
      h('p', { class: 'note' }, `Each party member rates each other one from 0 (Hate) to 100 (Best friends, or Love). Ratings are one way: a row is how that hero sees the others. ${lead.name}, the hero you play, is rated by everyone but has no ratings of their own. Labels: Hate 0+, Dislike 15+, Distrust 30+, Neutral 45+, Like 60+, Close 75+, Best friends 90+. Players see the current party's in Journal → Relationships.`),
      checkbox('Relationships are on', !rel.off, (v) => { if (v) delete rel.off; else rel.off = true; rerender(); })),
    h('section', { class: 'db-section' }, h('h3', {}, 'Where they start'), h('div', { class: 'rel-grid-wrap' }, table),
      h('p', { class: 'note' }, '♥: at 90+ that pair reads Love instead of Best friends. Unset ratings start at 50 (Neutral).')),
    h('section', { class: 'db-section' }, h('h3', {}, 'What changes them'),
      h('p', { class: 'note' }, `Points the one helped gives the helper (battle points are capped at ${REL_BATTLE_CAP} per pair per battle). Events (Change relationship), quest rewards and conditions (Relationship) do the rest: dialogue, gifts, downtime.`),
      ...gains),
  ];
}
