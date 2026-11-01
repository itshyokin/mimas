/**
 * Pick tiles from a tileset sheet (Update 149): the sheet on a grid of its tiles; drag a box over the ones that make
 * up a prop (a tree, a rock, a cave mouth) and they're cut out as its picture, exactly a whole number of tiles.
 */
import { field, h, openModal, select, toast } from './dom';

export interface SheetPick { canvas: HTMLCanvasElement; w: number; h: number; tilePx: number }

export function pickFromSheet(sheet: HTMLCanvasElement, name: string): Promise<SheetPick | null> {
  return new Promise((resolve) => {
    let tilePx = 32, sel: { x0: number; z0: number; x1: number; z1: number } | null = null, done = false;
    const canvas = h('canvas', { class: 'sheet-canvas', 'aria-label': 'The tileset sheet: drag over the tiles to use' });
    const wrap = h('div', { class: 'sheet-wrap' }, canvas);
    const info = h('span', { class: 'importer-foot' });
    let k = 1;
    const cols = () => Math.floor(sheet.width / tilePx), rows = () => Math.floor(sheet.height / tilePx);
    function draw(): void {
      // Whole pixels per sheet pixel where it fits (crisp), else shrunk to fit the width.
      const avail = Math.max(200, (wrap.clientWidth || 720) - 4);
      k = sheet.width * 2 <= avail ? 2 : Math.min(1, avail / sheet.width);
      canvas.width = Math.round(sheet.width * k); canvas.height = Math.round(sheet.height * k);
      const g = canvas.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#1b2030'; g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(sheet, 0, 0, canvas.width, canvas.height);
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1; g.beginPath();
      for (let x = 1; x < cols(); x++) { const p = Math.round(x * tilePx * k) + 0.5; g.moveTo(p, 0); g.lineTo(p, canvas.height); }
      for (let z = 1; z < rows(); z++) { const p = Math.round(z * tilePx * k) + 0.5; g.moveTo(0, p); g.lineTo(canvas.width, p); }
      g.stroke();
      if (sel) {
        const [x0, x1] = [Math.min(sel.x0, sel.x1), Math.max(sel.x0, sel.x1)], [z0, z1] = [Math.min(sel.z0, sel.z1), Math.max(sel.z0, sel.z1)];
        g.fillStyle = 'rgba(255,176,74,0.18)'; g.strokeStyle = '#ffb04a'; g.lineWidth = 2;
        const r = [x0 * tilePx * k, z0 * tilePx * k, (x1 - x0 + 1) * tilePx * k, (z1 - z0 + 1) * tilePx * k] as const;
        g.fillRect(...r); g.strokeRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2);
        info.textContent = `${x1 - x0 + 1} × ${z1 - z0 + 1} tiles selected`;
      } else info.textContent = `${cols()} × ${rows()} tiles of ${tilePx} px · drag over the tiles to use`;
    }
    const cellAt = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / (tilePx * k * (r.width / canvas.width))), z = Math.floor((e.clientY - r.top) / (tilePx * k * (r.height / canvas.height)));
      return { x: Math.max(0, Math.min(cols() - 1, x)), z: Math.max(0, Math.min(rows() - 1, z)) };
    };
    let dragging = false;
    canvas.addEventListener('pointerdown', (e) => { const c = cellAt(e); sel = { x0: c.x, z0: c.z, x1: c.x, z1: c.z }; dragging = true; canvas.setPointerCapture(e.pointerId); draw(); });
    canvas.addEventListener('pointermove', (e) => { if (!dragging || !sel) return; const c = cellAt(e); sel.x1 = c.x; sel.z1 = c.z; draw(); });
    canvas.addEventListener('pointerup', () => (dragging = false));
    const finish = (v: SheetPick | null) => { if (!done) { done = true; resolve(v); } };
    const body = h('div', { class: 'sheet-picker' },
      field('Tile size', select([['16', '16 px'], ['24', '24 px'], ['32', '32 px'], ['48', '48 px (RPG Maker MV)'], ['64', '64 px']], String(tilePx), (v) => { tilePx = parseInt(v, 10); sel = null; draw(); })),
      wrap);
    openModal(`Tiles from “${name}”`, body, [
      { label: 'Cancel', onClick: () => { finish(null); } },
      { label: 'Use these tiles', primary: true, onClick: () => {
        if (!sel) { toast('Drag over the tiles to use first.', 'error'); return false; }
        const [x0, x1] = [Math.min(sel.x0, sel.x1), Math.max(sel.x0, sel.x1)], [z0, z1] = [Math.min(sel.z0, sel.z1), Math.max(sel.z0, sel.z1)];
        const w = x1 - x0 + 1, hh = z1 - z0 + 1, out = document.createElement('canvas');
        out.width = w * tilePx; out.height = hh * tilePx;
        out.getContext('2d')!.drawImage(sheet, x0 * tilePx, z0 * tilePx, out.width, out.height, 0, 0, out.width, out.height);
        finish({ canvas: out, w, h: hh, tilePx });
        return true;
      } },
    ], () => finish(null), { wide: true, footStart: info });
    requestAnimationFrame(draw);
  });
}
