/**
 * Database → Menus → Party page layout: the pause menu's Party page as a box with the four member panels on it.
 * Drag a panel to move it, drag its corner to size it (all in percent of the page, so it fits any screen), and set
 * its text size and which parts it shows. Player 1 is the lead; the reserve use Player 4's panel.
 */
import { h, checkbox, field, numberInput, select } from './dom';
import { DEFAULT_PARTY_LAYOUT, PANEL_PARTS, PART_NAMES, cleanPartyLayout, partyLayout, type PanelSize, type PartyLayout } from '../ui/partyLayout';
import type { MenuConfig } from '../world/types';

const NAMES = ['Player 1 (lead)', 'Player 2', 'Player 3', 'Player 4 (and the reserve)'];

export function partyLayoutSection(menus: MenuConfig): HTMLElement {
  const L: PartyLayout = partyLayout(menus.partyLayout);
  let sel = 0;
  const save = () => { const c = cleanPartyLayout(L); if (c) menus.partyLayout = c; else delete menus.partyLayout; };
  const page = h('div', { class: 'pl-page', 'aria-label': 'The Party page' });
  const controls = h('div', { class: 'pl-controls' });
  const round = (v: number) => Math.round(v * 10) / 10;

  const drawPage = () => {
    page.replaceChildren(...L.panels.map((p, i) => {
      const el = h('div', { class: `pl-panel size-${p.size}${i === sel ? ' sel' : ''}`, style: `left:${p.x}%;top:${p.y}%;width:${p.w}%;height:${p.h}%`, title: NAMES[i] },
        !p.hide?.includes('picture') ? h('span', { class: 'pl-pic' }) : h('span', { class: 'pl-gap' }),
        h('span', { class: 'pl-label' }, NAMES[i].replace(/ \(.*\)/, '')),
        ...(['hp', 'mp', 'exp'] as const).filter((k) => !p.hide?.includes(k)).map((k) => h('span', { class: `pl-bar ${k}` })),
        h('span', { class: 'pl-size', 'aria-label': 'Drag to resize' }));
      // Drag to move; the corner to resize.
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sel = i;
        const r = page.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, start = { ...p };
        const resize = (e.target as HTMLElement).classList.contains('pl-size');
        const move = (ev: PointerEvent) => {
          const dx = ((ev.clientX - sx) / r.width) * 100, dy = ((ev.clientY - sy) / r.height) * 100;
          if (resize) { p.w = round(Math.max(8, Math.min(100 - p.x, start.w + dx))); p.h = round(Math.max(8, Math.min(100 - p.y, start.h + dy))); }
          else { p.x = round(Math.max(0, Math.min(100 - p.w, start.x + dx))); p.y = round(Math.max(0, Math.min(100 - p.h, start.y + dy))); }
          drawPage();
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); save(); drawControls(); };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        drawPage(); drawControls();
      });
      return el;
    }));
  };

  const drawControls = () => {
    const p = L.panels[sel];
    const num = (k: 'x' | 'y' | 'w' | 'h', label: string) => field(label, numberInput(p[k], (v) => {
      p[k] = round(v);
      const fixed = partyLayout(L).panels[sel];
      Object.assign(p, { x: fixed.x, y: fixed.y, w: fixed.w, h: fixed.h });
      save(); drawPage();
    }, { step: 0.5, min: 0, max: 100, class: 'db-num', 'aria-label': `${NAMES[sel]} ${label}` }));
    controls.replaceChildren(
      h('div', { class: 'pl-tabs' }, ...NAMES.map((n, i) => h('button', { type: 'button', class: `btn small${i === sel ? '' : ' ghost'}`, onclick: () => { sel = i; drawPage(); drawControls(); } }, n.replace(/ \(.*\)/, '')))),
      h('div', { class: 'field-row' }, num('x', 'Left %'), num('y', 'Top %'), num('w', 'Width %'), num('h', 'Height %'),
        field('Size', select([['big', 'Big'], ['medium', 'Medium'], ['small', 'Small']], p.size, (v) => { p.size = v as PanelSize; save(); drawPage(); }))),
      h('div', { class: 'db-checks pl-parts' }, ...PANEL_PARTS.map((k) => checkbox(PART_NAMES[k], !p.hide?.includes(k), (v) => {
        const set = new Set(p.hide ?? []);
        if (v) set.delete(k); else set.add(k);
        p.hide = [...set];
        save(); drawPage();
      }))),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => {
        L.panels = DEFAULT_PARTY_LAYOUT.panels.map((d) => ({ ...d }));
        save(); drawPage(); drawControls();
      } }, 'Back to the default layout'),
    );
  };

  drawPage(); drawControls();
  return h('section', { class: 'db-section' }, h('h3', {}, 'Party page layout'),
    h('p', { class: 'note' }, 'The pause menu’s Party page. Drag a panel to move it and its corner to size it; sizes are percentages of the page, so it fits any screen. Player 1 is the lead (first in the lineup, first out in battle); anyone past Player 4 uses Player 4’s panel, one under another.'),
    page, controls);
}
