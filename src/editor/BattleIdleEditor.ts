/**
 * A character's battle idle (Update 111): pick a row of their sheet and the frames in it (click to tick, up to 12),
 * played in a loop as they stand in battle. Like the prop creator's frame picking. Rows are counted from 1.
 */
import type { CharacterDef } from '../world/types';
import { canvasFromBlob } from '../shared/images';
import type { EditorStore } from './store';
import { checkbox, field, h, numberInput, openModal } from './dom';

const MAX = 12;

export async function openBattleIdle(store: EditorStore, c: CharacterDef, done: () => void): Promise<void> {
  const blob = c.sheet ? store.files.get(c.sheet) : undefined;
  const sheet = blob ? await canvasFromBlob(blob) : null;
  const f = c.anim?.frame ?? 64;
  if (!sheet) { openModal('Battle idle', h('p', {}, 'This character has no sheet to pick frames from.'), [{ label: 'OK', primary: true }]); return; }
  const rows = Math.floor(sheet.height / f), cols = Math.floor(sheet.width / f);
  const st = { on: !!c.battleIdle, row: c.battleIdle?.row ?? Math.min(rows - 1, (c.anim?.anims.combat_idle?.row ?? 0) + 2), frames: [...(c.battleIdle?.frames ?? [0, 1])], ms: c.battleIdle?.ms ?? 260 };
  const strip = h('div', { class: 'bi-strip' });
  const preview = h('canvas', { class: 'bi-preview', width: String(f), height: String(f) });
  const draw = () => {
    strip.replaceChildren(...Array.from({ length: cols }, (_, k) => {
      const cv = h('canvas', { class: `bi-frame${st.frames.includes(k) ? ' on' : ''}`, width: String(f), height: String(f), title: `Frame ${k + 1}` });
      const g = cv.getContext('2d')!;
      g.drawImage(sheet, k * f, st.row * f, f, f, 0, 0, f, f);
      cv.addEventListener('click', () => {
        if (st.frames.includes(k)) st.frames = st.frames.filter((x) => x !== k);
        else if (st.frames.length < MAX) st.frames = [...st.frames, k].sort((a, b) => a - b);
        draw();
      });
      return cv;
    }));
  };
  let t = 0, raf = 0;
  const tick = () => {
    t += 1;
    const g = preview.getContext('2d')!;
    g.clearRect(0, 0, f, f);
    if (st.frames.length) { const k = st.frames[Math.floor((t * 16.7) / st.ms) % st.frames.length]; g.drawImage(sheet, k * f, st.row * f, f, f, 0, 0, f, f); }
    raf = requestAnimationFrame(tick);
  };
  const rowIn = numberInput(st.row + 1, (v) => { st.row = Math.max(0, Math.min(rows - 1, Math.round(v) - 1)); rowIn.value = String(st.row + 1); draw(); }, { step: 1, min: 1, max: rows, class: 'db-num' });
  const body = h('div', { class: 'bi-body' },
    checkbox('Use these frames as the battle idle (off: the plain idle)', st.on, (v) => (st.on = v)),
    h('div', { class: 'field-row' },
      field(`Row (1 – ${rows})`, rowIn),
      field('Speed (ms a frame)', numberInput(st.ms, (v) => (st.ms = Math.max(40, Math.min(2000, Math.round(v)))), { step: 20, min: 40, class: 'db-num' }))),
    h('p', { class: 'hint' }, `Click frames to tick them (up to ${MAX}); they play left to right in a loop.`),
    strip, h('div', { class: 'bi-prev-wrap' }, preview));
  draw(); tick();
  openModal(`Battle idle: ${c.name}`, body, [
    { label: 'Cancel' },
    { label: 'Apply', primary: true, onClick: () => {
      if (st.on && st.frames.length) c.battleIdle = { row: st.row, frames: st.frames, ...(st.ms !== 260 ? { ms: st.ms } : {}) };
      else delete c.battleIdle;
      done();
    } },
  ], undefined, { wide: true });
  const stop = () => { if (!document.body.contains(preview)) cancelAnimationFrame(raf); else requestAnimationFrame(stop); };
  requestAnimationFrame(stop);
}
