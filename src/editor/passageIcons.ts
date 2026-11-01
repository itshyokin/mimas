/** Icons for the passage layer, drawn with canvas paths so they stay crisp at any zoom. */
import type { PassageFlag } from '../world/passage';

export const PASSAGE_COLORS: Record<Exclude<PassageFlag, '.'>, string> = {
  c: '#7be07b', // climbable: green ladder
  l: '#ffc65a', // low clearance: amber
  x: '#ff5a5a', // wall: red
  o: '#7fd3ff', // open: blue ring
};

/** Draw a flag's icon in the square (x, y, size). */
export function drawPassageIcon(ctx: CanvasRenderingContext2D, flag: PassageFlag, x: number, y: number, size: number): void {
  if (flag === '.') return;
  const s = size, col = PASSAGE_COLORS[flag];
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Dark backing so the icon reads over any ground.
  ctx.fillStyle = 'rgba(8,10,18,0.45)';
  ctx.fillRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8);
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.beginPath();
  if (flag === 'c') {
    // Ladder: two rails and three rungs.
    const l = x + s * 0.32, r = x + s * 0.68;
    ctx.moveTo(l, y + s * 0.18); ctx.lineTo(l, y + s * 0.82);
    ctx.moveTo(r, y + s * 0.18); ctx.lineTo(r, y + s * 0.82);
    for (const k of [0.32, 0.5, 0.68]) { ctx.moveTo(l, y + s * k); ctx.lineTo(r, y + s * k); }
  } else if (flag === 'l') {
    // Low ceiling: a bar over a flattened arrow.
    ctx.moveTo(x + s * 0.18, y + s * 0.3); ctx.lineTo(x + s * 0.82, y + s * 0.3);
    ctx.moveTo(x + s * 0.22, y + s * 0.64); ctx.lineTo(x + s * 0.78, y + s * 0.64);
    ctx.moveTo(x + s * 0.62, y + s * 0.5); ctx.lineTo(x + s * 0.78, y + s * 0.64); ctx.lineTo(x + s * 0.62, y + s * 0.78);
  } else if (flag === 'x') {
    ctx.rect(x + s * 0.18, y + s * 0.18, s * 0.64, s * 0.64);
    ctx.moveTo(x + s * 0.3, y + s * 0.3); ctx.lineTo(x + s * 0.7, y + s * 0.7);
    ctx.moveTo(x + s * 0.7, y + s * 0.3); ctx.lineTo(x + s * 0.3, y + s * 0.7);
  } else {
    ctx.arc(x + s / 2, y + s / 2, s * 0.26, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** A small canvas with one icon, for the palette. */
export function passageThumb(flag: PassageFlag, size = 28): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.className = 'passage-thumb';
  const ctx = c.getContext('2d')!;
  if (flag === '.') {
    // Eraser: a crossed-out circle.
    ctx.strokeStyle = '#c9cede'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size * 0.3, 0, Math.PI * 2);
    ctx.moveTo(size * 0.28, size * 0.72); ctx.lineTo(size * 0.72, size * 0.28); ctx.stroke();
  } else drawPassageIcon(ctx, flag, 0, 0, size);
  return c;
}
