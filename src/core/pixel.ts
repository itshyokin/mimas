/**
 * Pixel-art toolkit: a tiny RGBA buffer, distance fields, auto-shaded shapes,
 * and normal-map generation from sprite art (what Laigter / SpriteIlluminator do offline).
 */
import { bayer, clamp, vnoise } from './math';

export type RGB = [number, number, number];
export type ColorLike = string | RGB;

const rgbCache = new Map<string, RGB>();
export function hexRGB(hex: string): RGB {
  let c = rgbCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, c);
  }
  return c;
}

/** Pixels a canvas was made from (so reading them back, for normal maps, needs no slow read from the GPU). */
const sourcePixels = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();

export function canvasFromRGBA(data: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // Kept in memory (not on the graphics card): these are read back for normal maps, which is very slow from the GPU
  // (a whole map's ground took seconds, the freeze on reaching a seamless map).
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  sourcePixels.set(c, data.slice());
  const img = ctx.createImageData(w, h);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return c;
}

export class Pix {
  readonly d: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) {
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  set(x: number, y: number, col: ColorLike): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const c = typeof col === 'string' ? hexRGB(col) : col;
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = 255;
  }
  rect(x: number, y: number, w: number, h: number, col: ColorLike): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, col);
  }
  alpha(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  /** Copy every opaque pixel of `other` on top of this buffer. */
  stamp(other: Pix): void {
    for (let i = 0; i < this.d.length; i += 4) {
      if (other.d[i + 3]) {
        this.d[i] = other.d[i];
        this.d[i + 1] = other.d[i + 1];
        this.d[i + 2] = other.d[i + 2];
        this.d[i + 3] = 255;
      }
    }
  }
  /** 1px outline around every opaque region. */
  outline(col: ColorLike): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) continue;
        if (this.alpha(x + 1, y) || this.alpha(x - 1, y) || this.alpha(x, y + 1) || this.alpha(x, y - 1)) add.push(x, y);
      }
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], col);
  }
  canvas(): HTMLCanvasElement {
    return canvasFromRGBA(this.d, this.w, this.h);
  }
}

/** Chamfer distance from each "inside" pixel to the nearest outside pixel. */
export function distField(m: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = m[i] ? 1e6 : 0;
  const g = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!m[i]) continue;
      d[i] = Math.min(d[i], g(x - 1, y) + 1, g(x, y - 1) + 1, g(x - 1, y - 1) + 1.414, g(x + 1, y - 1) + 1.414);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!m[i]) continue;
      d[i] = Math.min(d[i], g(x + 1, y) + 1, g(x, y + 1) + 1, g(x + 1, y + 1) + 1.414, g(x - 1, y + 1) + 1.414);
    }
  return d;
}

export interface BlobOpts {
  /** Distance (px) over which the shape "rounds off". */
  maxD?: number;
  /** Bump strength used for shading. */
  k?: number;
  /** Amount of noise texture mixed into the shading. */
  tex?: number;
  texS?: number;
  seed?: number;
  bias?: number;
}

const L = (() => {
  const v = [-0.55, -0.75, 0.7];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / l);
})();

/**
 * Paint a shape with automatic pixel-art shading: its distance field acts as a height map,
 * lit from the top-left and quantised to `ramp` (dark → light) with ordered dithering.
 * Returns the shape mask.
 */
export function blob(p: Pix, inside: (x: number, y: number) => boolean, ramp: string[], o: BlobOpts = {}): Uint8Array {
  const { w, h } = p;
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x + 0.5, y + 0.5)) m[y * w + x] = 1;
  const d = distField(m, w, h);
  const maxD = o.maxD ?? 5, k = o.k ?? 3;
  const H = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : Math.sqrt(Math.min(d[y * w + x], maxD) / maxD));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      let nx = -(H(x + 1, y) - H(x - 1, y)) * k, ny = -(H(x, y + 1) - H(x, y - 1)) * k, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const lit = nx * L[0] + ny * L[1] + nz * L[2];
      let v = (lit - 0.25) / 0.85 + (o.bias ?? 0);
      if (o.tex) v += (vnoise(x / (o.texS ?? 3), y / (o.texS ?? 3), o.seed ?? 1) - 0.5) * o.tex;
      p.set(x, y, ramp[clamp(Math.floor(v * (ramp.length - 1) + bayer(x, y)), 0, ramp.length - 1)]);
    }
  return m;
}

export const ell = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

/** Distance from point to segment (for drawing capsules: logs, poles). */
export function segD(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

export interface NormalOpts {
  strength?: number;
  /** Sprites: height comes from distance to the silhouette edge (gives volume). */
  sprite?: boolean;
  maxD?: number;
  /** Tileable textures: wrap at the edges. */
  wrap?: boolean;
}

/** Generate a tangent-space (OpenGL, green-up) normal map from an image. */
export function normalMapFrom(src: HTMLCanvasElement, opt: NormalOpts = {}): HTMLCanvasElement {
  const w = src.width, h = src.height, s = opt.strength ?? 2.5, maxD = opt.maxD ?? 4;
  const px = sourcePixels.get(src) ?? src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  const Hm = new Float32Array(w * h);
  let d: Float32Array | null = null;
  if (opt.sprite) {
    const m = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = px[i * 4 + 3] > 127 ? 1 : 0;
    d = distField(m, w, h);
  }
  for (let i = 0; i < w * h; i++) {
    const lum = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
    Hm[i] = d ? (px[i * 4 + 3] > 127 ? Math.sqrt(Math.min(d[i], maxD) / maxD) * 0.75 + lum * 0.25 : 0) : lum;
  }
  const g = (x: number, y: number) => {
    if (opt.wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = clamp(x, 0, w - 1); y = clamp(y, 0, h - 1); }
    return Hm[y * w + x];
  };
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = -(g(x + 1, y) - g(x - 1, y)) * s, ny = (g(x, y + 1) - g(x, y - 1)) * s, nz = 1;
      const l = Math.hypot(nx, ny, nz), i = (y * w + x) * 4;
      out[i] = (nx / l * 0.5 + 0.5) * 255;
      out[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      out[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  return canvasFromRGBA(out, w, h);
}
