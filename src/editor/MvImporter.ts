/**
 * RPG Maker MV sheets (Update 152): a whole tileset sheet in one go. The sheet's kind is worked out from its shape
 * (A1 animated water, A2 ground autotiles, A3 / A4 roofs and walls, A5 plain tiles, B–E objects) and every piece is
 * shown ticked (empty ones left out); the ticked ones become tiles: autotiles, walls, animated water, plain tiles.
 */
import { commitTile } from './assets';
import { field, h, openModal, select, toast } from './dom';
import { canvasFromImage, loadImage } from '../shared/images';
import { MAX_CUSTOM_TILES, freeTileKey } from '../world/tiles';
import type { TileDef } from '../world/types';
import type { EditorStore } from './store';

type Sheet = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'B';
interface Piece { name: string; kind?: TileDef['kind']; frames?: number; canvas: HTMLCanvasElement; on: boolean }

/** The sheet's kind from its shape (and name: A1 and A2 are the same size). */
export function guessSheet(w: number, h: number, name: string): Sheet {
  const r = w / h, n = name.toUpperCase();
  if (Math.abs(r - 4 / 3) < 0.02) return /A1\b|_A1|A1[_.]/.test(n) ? 'A1' : 'A2';
  if (Math.abs(r - 2) < 0.02) return 'A3';
  if (Math.abs(r - 16 / 15) < 0.02) return 'A4';
  if (Math.abs(r - 0.5) < 0.02) return 'A5';
  return 'B';
}

const crop = (src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h);
  c.getContext('2d')!.drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
  return c;
};
const empty = (c: HTMLCanvasElement): boolean => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return false;
  return true;
};

/** Cut a sheet into its pieces (tile size: the sheet's width over its columns). */
export function cutSheet(src: HTMLCanvasElement, kind: Sheet, base: string): Piece[] {
  const cols = kind === 'A5' ? 8 : 16, t = src.width / cols, out: Piece[] = [];
  const add = (name: string, c: HTMLCanvasElement, extra: Partial<Piece> = {}) => { const e = empty(c); out.push({ name, canvas: c, on: !e, ...extra }); };
  if (kind === 'A2') for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) add(`${base} ${r * 8 + c + 1}`, crop(src, c * 2 * t, r * 3 * t, 2 * t, 3 * t), { kind: 'autotile' });
  else if (kind === 'A3') for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) add(`${base} ${r * 8 + c + 1}`, crop(src, c * 2 * t, r * 2 * t, 2 * t, 2 * t), { kind: 'wall' });
  else if (kind === 'A4') for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) {
    add(`${base} top ${r * 8 + c + 1}`, crop(src, c * 2 * t, r * 5 * t, 2 * t, 3 * t), { kind: 'autotile' });
    add(`${base} wall ${r * 8 + c + 1}`, crop(src, c * 2 * t, (r * 5 + 3) * t, 2 * t, 2 * t), { kind: 'wall' });
  }
  else if (kind === 'A1') {
    // MV's water: three frames side by side, played 0 1 2 1; kinds 2 and 3 are still; odd kinds from 5 are waterfalls (left out).
    const water = (bx: number, by: number, name: string) => {
      const c = document.createElement('canvas'); c.width = Math.round(8 * t); c.height = Math.round(3 * t);
      const g = c.getContext('2d')!;
      [0, 1, 2, 1].forEach((f, i) => g.drawImage(src, (bx + f * 2) * t, by * t, 2 * t, 3 * t, i * 2 * t, 0, 2 * t, 3 * t));
      add(name, c, { kind: 'autotile', frames: 4 });
    };
    water(0, 0, `${base} water 1`); water(0, 3, `${base} water 2`);
    add(`${base} still 1`, crop(src, 6 * t, 0, 2 * t, 3 * t), { kind: 'autotile' });
    add(`${base} still 2`, crop(src, 6 * t, 3 * t, 2 * t, 3 * t), { kind: 'autotile' });
    for (let k = 4; k < 16; k += 2) {
      const tx = k % 8, ty = Math.floor(k / 8);
      water(Math.floor(tx / 4) * 8, ty * 6 + (Math.floor(tx / 2) % 2) * 3, `${base} water ${k / 2 + 1}`);
    }
  } else {
    const rows = Math.round(src.height / t);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) add(`${base} ${r * cols + c + 1}`, crop(src, c * t, r * t, t, t));
    // Objects (B–E): mostly for the upper layer; left unticked so only the ones picked come in.
    if (kind === 'B') for (const p of out) p.on = false;
  }
  return out;
}

export function openMvImporter(store: EditorStore): void {
  const input = h('input', { type: 'file', accept: 'image/png,image/*' });
  input.addEventListener('change', () => void (async () => {
    const f = input.files?.[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    let src: HTMLCanvasElement;
    try { src = canvasFromImage(await loadImage(url)); } catch { toast(`Couldn’t read ${f.name} as an image.`, 'error'); return; } finally { URL.revokeObjectURL(url); }
    const base = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    let kind = guessSheet(src.width, src.height, f.name), pieces = cutSheet(src, kind, base);
    const grid = h('div', { class: 'mv-grid' }), count = h('span', { class: 'importer-foot' });
    const draw = () => {
      grid.replaceChildren(...pieces.map((p) => {
        const thumb = document.createElement('canvas'); thumb.width = thumb.height = 40;
        const g = thumb.getContext('2d')!; g.imageSmoothingEnabled = false;
        const s = Math.min(40 / p.canvas.width, 40 / p.canvas.height);
        g.drawImage(p.canvas, (40 - p.canvas.width * s) / 2, (40 - p.canvas.height * s) / 2, p.canvas.width * s, p.canvas.height * s);
        const b = h('button', { type: 'button', class: `mv-piece${p.on ? ' on' : ''}`, title: p.name, 'aria-pressed': String(p.on), onclick: () => { p.on = !p.on; draw(); } }, thumb);
        return b;
      }));
      const n = pieces.filter((p) => p.on).length, free = MAX_CUSTOM_TILES - store.tiles.custom().length;
      count.textContent = `${n} ticked · room for ${free} more imported tiles`;
    };
    const body = h('div', { class: 'stack' },
      field('Sheet', select([['A1', 'A1: animated water'], ['A2', 'A2: ground (autotiles)'], ['A3', 'A3: roofs and walls'], ['A4', 'A4: wall tops and walls'], ['A5', 'A5: plain tiles'], ['B', 'B–E: objects (pick the ones you want)']], kind,
        (v) => { kind = v as Sheet; pieces = cutSheet(src, kind, base); draw(); }), `Worked out from its size (${src.width} × ${src.height} px, ${Math.round(src.width / (kind === 'A5' ? 8 : 16))} px tiles). Click pieces to tick or untick them.`),
      h('div', { class: 'toolrow small' },
        h('button', { type: 'button', class: 'btn small', onclick: () => { for (const p of pieces) p.on = true; draw(); } }, 'Tick all'),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => { for (const p of pieces) p.on = false; draw(); } }, 'Untick all')),
      grid,
      h('p', { class: 'note' }, 'Ground autotiles, walls and water come in ready to paint. Objects (B–E) are usually better as props (prop editor → From a tileset sheet…) or on the upper layer.'));
    openModal(`RPG Maker MV sheet: ${f.name}`, body, [
      { label: 'Cancel' },
      { label: 'Import ticked', primary: true, onClick: () => {
        const ticked = pieces.filter((p) => p.on);
        if (!ticked.length) { toast('Tick at least one piece.', 'error'); return false; }
        if (store.tiles.custom().length + ticked.length > MAX_CUSTOM_TILES) { toast(`That’s more than the ${MAX_CUSTOM_TILES} imported tiles allowed: untick some.`, 'error'); return false; }
        void (async () => {
          let done = 0;
          for (const p of ticked) {
            const key = freeTileKey((k) => !!store.tiles.get(k));
            if (!key) break;
            let id = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'tile', n = 2;
            while (store.tiles.all().some((t) => t.id === id)) id = `${id.replace(/_\d+$/, '')}_${n++}`;
            const def: TileDef = { key, id, name: p.name, span: 1, filter: 'point', flat: true, ...(p.kind ? { kind: p.kind } : {}), ...(p.frames ? { frames: p.frames, fps: 3 } : {}) };
            const blob = await new Promise<Blob>((res, rej) => p.canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/png'));
            if (await commitTile(store, def, { image: blob }, p.canvas, { quiet: true })) done++;
          }
          toast(`Imported ${done} tile${done === 1 ? '' : 's'} from ${f.name}.`);
          store.emit('ui');
        })();
        return true;
      } },
    ], undefined, { wide: true, footStart: count });
    draw();
  })());
  input.click();
}
