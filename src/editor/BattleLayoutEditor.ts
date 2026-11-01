/**
 * Database → Menus → Battle layout (Update 111): the Pocket Handheld battle screen as a box with its four pieces
 * (foes' blocks, party's blocks, command box, text box). Tick "Place by hand" for a piece, then drag it to move it and
 * its corner to size it (percent of the screen). Unticked pieces keep the built-in placement.
 */
import { h, checkbox, field, numberInput } from './dom';
import { BATTLE_PIECES, DEFAULT_BATTLE_BOXES, cleanBattleLayout, type BattleLayout, type BattlePiece } from '../ui/battleLayout';
import type { MenuConfig } from '../world/types';

const SIZED: BattlePiece[] = ['cmds', 'text'];

export function battleLayoutSection(menus: MenuConfig): HTMLElement {
  const L: BattleLayout = JSON.parse(JSON.stringify(menus.battleLayout ?? {}));
  let sel: BattlePiece = 'foes';
  const save = () => { const c = cleanBattleLayout(L); if (c) menus.battleLayout = c; else delete menus.battleLayout; };
  const page = h('div', { class: 'pl-page bl-page', 'aria-label': 'The battle screen' });
  const controls = h('div', { class: 'pl-controls' });
  const round = (v: number) => Math.round(v * 10) / 10;
  const boxOf = (k: BattlePiece) => L[k] ?? DEFAULT_BATTLE_BOXES[k];

  const drawPage = () => {
    page.replaceChildren(...BATTLE_PIECES.map(([k, name]) => {
      const b = boxOf(k), own = !!L[k];
      const hgt = b.h ?? (k === 'foes' ? 22 : 18);
      const el = h('div', { class: `pl-panel bl-piece${k === sel ? ' sel' : ''}${own ? '' : ' auto'}`, style: `left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${hgt}%`, title: name },
        h('span', { class: 'pl-label' }, `${name}${own ? '' : ' (built-in)'}`),
        own ? h('span', { class: 'pl-size', 'aria-label': 'Drag to resize' }) : '');
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sel = k;
        if (!L[k]) { drawPage(); drawControls(); return; }
        const p = L[k]!, r = page.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, start = { ...p, h: p.h ?? hgt };
        const resize = (e.target as HTMLElement).classList.contains('pl-size');
        const move = (ev: PointerEvent) => {
          const dx = ((ev.clientX - sx) / r.width) * 100, dy = ((ev.clientY - sy) / r.height) * 100;
          if (resize) { p.w = round(Math.max(10, Math.min(100 - p.x, start.w + dx))); if (SIZED.includes(k)) p.h = round(Math.max(6, Math.min(100 - p.y, start.h + dy))); }
          else { p.x = round(Math.max(0, Math.min(100 - p.w, start.x + dx))); p.y = round(Math.max(0, Math.min(100 - (p.h ?? 4), start.y + dy))); }
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
    const own = L[sel];
    const num = (key: 'x' | 'y' | 'w' | 'h', label: string) => field(label, numberInput(own?.[key] ?? 0, (v) => {
      if (!own) return;
      own[key] = round(v);
      Object.assign(own, cleanBattleLayout({ [sel]: own })?.[sel] ?? own);
      save(); drawPage();
    }, { step: 0.5, min: 0, max: 100, class: 'db-num', disabled: !own }));
    controls.replaceChildren(
      h('div', { class: 'pl-tabs' }, ...BATTLE_PIECES.map(([k, n]) => h('button', { type: 'button', class: `btn small${k === sel ? '' : ' ghost'}`, onclick: () => { sel = k; drawPage(); drawControls(); } }, n))),
      checkbox('Place by hand (off: the built-in place, which also makes room for long lists)', !!own, (v) => {
        if (v) L[sel] = { ...DEFAULT_BATTLE_BOXES[sel] }; else delete L[sel];
        save(); drawPage(); drawControls();
      }),
      h('div', { class: 'field-row' }, num('x', 'Left %'), num('y', 'Top %'), num('w', 'Width %'), ...(SIZED.includes(sel) ? [num('h', 'Height %')] : [])),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => { for (const [k] of BATTLE_PIECES) delete L[k]; save(); drawPage(); drawControls(); } }, 'Back to the built-in layout'),
    );
  };

  drawPage(); drawControls();
  return h('section', { class: 'db-section' }, h('h3', {}, 'Battle layout (Pocket Handheld)'),
    h('p', { class: 'note' }, 'Where the battle screen’s pieces sit, in percent of the screen. Tick “Place by hand” for a piece, then drag it (and its corner to size it). The blocks grow downward with more fighters, so leave room under them.'),
    page, controls);
}
