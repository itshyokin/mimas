/**
 * Database → Player → EXP progression: the highest level, a curve to start from, and a table of how much EXP each
 * level takes. Any row can be typed over; the table then becomes hand-set (saved as combat.expTable) and the curve
 * only fills levels past its end. “Rebuild from the curve” throws the hand-set values away.
 */
import { DEFAULT_COMBAT, MAX_LEVEL_LIMIT, combatConfig, curveXp, expRows } from '../game/combat/config';
import type { CombatData } from '../world/types';
import { field, h, numberInput } from './dom';

const num = (v: number, set: (n: number) => void, step: number, min: number, label: string, extra: Record<string, unknown> = {}) =>
  numberInput(v, (n) => set(Math.max(min, n)), { step, min, 'aria-label': label, class: 'db-num', ...extra });

/** The section (edits `data`, the Database window's working copy of the combat settings). */
export function expSection(data: CombatData): HTMLElement {
  const section = h('section', { class: 'db-section db-wide exp-section' });
  const render = () => {
    const c = combatConfig(data), rows = expRows(c), max = c.maxLevel;
    const custom = !!data.expTable?.length;
    const HAND = 'Hand-set table: your numbers are used as typed. Levels past the end of it follow the curve.';
    const status = h('p', { class: 'note' }, custom ? HAND : 'Following the curve. Type over any row to set that level by hand.');
    const rebuild = h('button', { type: 'button', class: 'btn ghost', disabled: !custom, onclick: () => { delete data.expTable; render(); } }, 'Rebuild from the curve');
    const chart = h('div', { class: 'exp-chart', 'aria-hidden': 'true' });
    const totals: HTMLElement[] = [];
    const drawChart = () => {
      const r = expRows(combatConfig(data)), top = Math.max(1, ...r.map((x) => x.toNext));
      const pts = r.map((x, i) => `${(i / Math.max(1, r.length - 1)) * 300},${58 - (x.toNext / top) * 54}`).join(' ');
      chart.innerHTML = `<svg viewBox="-2 0 304 60" preserveAspectRatio="none"><polyline points="0,58 ${pts} 300,58" fill="var(--ember-soft)" stroke="none"/><polyline points="${pts}" fill="none" stroke="var(--ember)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`
        + `<span class="exp-chart-top">${top.toLocaleString()} EXP</span><span class="exp-chart-l">Lv 1</span><span class="exp-chart-r">Lv ${max - 1} → ${max}</span>`;
      for (const [i, el] of totals.entries()) el.textContent = r[i]?.total.toLocaleString() ?? '';
    };
    /** Typing in a row: turn the whole table hand-set (copying the curve) and change that one level. */
    const setRow = (level: number, v: number) => {
      const cfg = combatConfig(data);
      if (!data.expTable?.length) data.expTable = expRows(cfg).map((x) => x.toNext);
      while (data.expTable.length < level) data.expTable.push(curveXp(cfg, data.expTable.length + 1));
      data.expTable[level - 1] = Math.max(1, Math.round(v));
      // Update in place (re-rendering would lose the row being typed in).
      status.textContent = HAND; rebuild.disabled = false;
      drawChart();
    };
    const table = h('div', { class: 'exp-table', role: 'table', 'aria-label': 'EXP needed for each level' },
      h('span', { class: 'db-head' }, 'Level'), h('span', { class: 'db-head' }, 'EXP to the next level'), h('span', { class: 'db-head' }, 'Total EXP at the next level'),
      ...rows.flatMap((r) => {
        const total = h('span', { class: 'db-unit exp-total' }, r.total.toLocaleString());
        totals.push(total);
        return [
          h('span', { class: 'db-name' }, `${r.level} → ${r.level + 1}`),
          num(r.toNext, (v) => setRow(r.level, v), 1, 1, `EXP from level ${r.level} to ${r.level + 1}`),
          total,
        ];
      }),
      h('span', { class: 'db-name' }, `${max}`), h('span', { class: 'db-unit' }, 'Highest level'), h('span'));

    section.replaceChildren(
      h('h3', {}, 'EXP progression'),
      h('div', { class: 'field-row' },
        field('Highest level', num(max, (v) => { data.maxLevel = Math.min(MAX_LEVEL_LIMIT, Math.max(2, Math.round(v))); render(); }, 1, 2, 'Highest level', { max: MAX_LEVEL_LIMIT })),
        field('Curve: EXP for level 2', num(c.xpBase, (v) => { data.xpBase = Math.max(1, Math.round(v)); render(); }, 5, 1, 'Curve base')),
        field('Curve: each level needs ×', num(c.xpGrowth, (v) => { data.xpGrowth = Math.max(1, v); render(); }, 0.01, 1, 'Curve growth'))),
      h('div', { class: 'exp-tools' },
        rebuild,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => scaleAll(0.9) }, 'All −10%'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => scaleAll(1.1) }, 'All +10%')),
      status,
      chart,
      table,
      h('p', { class: 'note' }, `Defaults: highest level ${DEFAULT_COMBAT.maxLevel}, ${DEFAULT_COMBAT.xpBase} EXP for level 2, ×${DEFAULT_COMBAT.xpGrowth} per level after. At the highest level the EXP bar stays full and shows MAX.`),
    );
    drawChart();
  };
  const scaleAll = (k: number) => {
    const cfg = combatConfig(data);
    data.expTable = expRows(cfg).map((x) => Math.max(1, Math.round(x.toNext * k)));
    render();
  };
  render();
  return section;
}

/** Keep only the levels the highest level uses (called when saving). */
export function trimExpTable(data: CombatData): void {
  if (!data.expTable) return;
  const max = combatConfig(data).maxLevel;
  data.expTable = data.expTable.slice(0, max - 1);
  if (!data.expTable.length) delete data.expTable;
}
