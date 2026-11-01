/**
 * Icon effects (Update 133): a glow behind an item's icon, a one-pixel outline round it, and a pattern laid over it
 * (stripes, dots, cracks, swirls, checker), each in a colour of your choosing: a "corrupted" pumpkin with purple
 * cracks and a sickly glow. Drawn onto a copy of the icon, crisp (pixel steps scale with the icon's size). No three.js.
 */
import type { IconFx, IconPattern } from './types';

export const ICON_PATTERNS: [IconPattern, string][] = [['stripes', 'Stripes'], ['dots', 'Dots'], ['cracks', 'Cracks'], ['swirls', 'Swirls'], ['checker', 'Checker']];

/** Has it any effect to draw? */
export const hasIconFx = (fx: IconFx | undefined): fx is IconFx => !!fx && !!(fx.glow || fx.outline || fx.pattern);

/** The icon with its effects drawn (a new canvas the same size; the original is left alone). */
export function applyIconFx(src: HTMLCanvasElement | HTMLImageElement, fx: IconFx | undefined): HTMLCanvasElement {
  const w = 'naturalWidth' in src ? src.naturalWidth || src.width : src.width, hgt = 'naturalHeight' in src ? src.naturalHeight || src.height : src.height;
  const out = document.createElement('canvas');
  out.width = w; out.height = hgt;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  if (!hasIconFx(fx) || !w || !hgt) { g.drawImage(src, 0, 0); return out; }
  const unit = Math.max(1, Math.round(Math.max(w, hgt) / 16));
  // The icon (with its pattern) on its own canvas first.
  const icon = document.createElement('canvas');
  icon.width = w; icon.height = hgt;
  const ig = icon.getContext('2d')!;
  ig.imageSmoothingEnabled = false;
  ig.drawImage(src, 0, 0, w, hgt);
  if (fx.pattern) {
    const pat = patternCanvas(w, hgt, unit, fx.pattern.kind, fx.pattern.color);
    const pg = pat.getContext('2d')!;
    pg.globalCompositeOperation = 'destination-in';
    pg.drawImage(icon, 0, 0);
    ig.globalAlpha = Math.max(0.05, Math.min(1, (fx.pattern.opacity ?? 70) / 100));
    ig.drawImage(pat, 0, 0);
    ig.globalAlpha = 1;
  }
  // The glow: the icon's shape, blurred, in the glow colour, behind it.
  if (fx.glow) {
    const shape = silhouette(icon, fx.glow);
    g.save();
    g.shadowColor = fx.glow;
    g.shadowBlur = Math.max(2, unit * 3);
    for (let k = 0; k < 3; k++) g.drawImage(shape, 0, 0);
    g.restore();
  }
  // The outline: every clear pixel touching the icon, in the outline colour.
  if (fx.outline) {
    const data = ig.getImageData(0, 0, w, hgt).data, edge = g.createImageData(w, hgt), e = edge.data;
    const [r, gg, b] = hexRgb(fx.outline);
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < hgt && data[(y * w + x) * 4 + 3] > 40;
    for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) {
      if (solid(x, y)) continue;
      let near = false;
      for (let dy = -unit; dy <= unit && !near; dy++) for (let dx = -unit; dx <= unit && !near; dx++) if ((dx || dy) && Math.abs(dx) + Math.abs(dy) <= unit && solid(x + dx, y + dy)) near = true;
      if (!near) continue;
      const i = (y * w + x) * 4;
      e[i] = r; e[i + 1] = gg; e[i + 2] = b; e[i + 3] = 255;
    }
    const oc = document.createElement('canvas'); oc.width = w; oc.height = hgt;
    oc.getContext('2d')!.putImageData(edge, 0, 0);
    g.drawImage(oc, 0, 0);
  }
  g.drawImage(icon, 0, 0);
  return out;
}

/** The icon's shape filled with one colour. */
function silhouette(icon: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = icon.width; c.height = icon.height;
  const g = c.getContext('2d')!;
  g.drawImage(icon, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** A full-size pattern in one colour (pixel steps of `u`), cut to the icon's shape afterwards. */
function patternCanvas(w: number, h: number, u: number, kind: IconPattern, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  const px = (x: number, y: number) => g.fillRect(x * u, y * u, u, u);
  const W = Math.ceil(w / u), H = Math.ceil(h / u);
  if (kind === 'stripes') { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x + y) % 4 === 0) px(x, y); }
  else if (kind === 'dots') { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x % 4 === 1 && (y + (Math.floor(x / 4) % 2) * 2) % 4 === 1) px(x, y); }
  else if (kind === 'checker') { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0) px(x, y); }
  else if (kind === 'swirls') {
    const cx = W / 2, cy = H / 2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (Math.sin(r * 1.3 - a * 2) > 0.72) px(x, y);
    }
  } else {
    // Cracks: a few jagged lines branching from near the middle (the same every time).
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let k = 0; k < 4; k++) {
      let x = W / 2 + (rnd() - 0.5) * W * 0.3, y = H / 2 + (rnd() - 0.5) * H * 0.3;
      const ang = (k / 4) * Math.PI * 2 + rnd();
      for (let s = 0; s < Math.max(W, H) * 0.6; s++) {
        px(Math.floor(x), Math.floor(y));
        const wob = (rnd() - 0.5) * 1.4;
        x += Math.cos(ang + wob); y += Math.sin(ang + wob);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
      }
    }
  }
  return c;
}

function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
