/**
 * RPG Maker-style tiles (Update 146): animated tiles (a strip of frames) and autotiles (RPG Maker's A2 block: 2 × 3
 * tiles, its edges and corners picked from the neighbours as you paint), perhaps animated too (blocks side by side,
 * like A1 water). Plain arrays only (no three.js), shared by the game and the editor.
 */
import type { TileDef } from './types';

export const isPixelTile = (def: TileDef | undefined): boolean => !!def && (def.kind === 'animated' || def.kind === 'autotile' || def.kind === 'wall');

export interface FrameLayout {
  frames: number;
  /** Frames side by side (true) or stacked (false). */
  horiz: boolean;
}

/** How a picture W × H splits into frames. */
export function frameLayout(def: TileDef, w: number, h: number): FrameLayout {
  if (def.kind === 'wall') {
    const tile = h / 2;
    return { frames: Math.max(1, Math.round(def.frames ?? w / (2 * tile))), horiz: true };
  }
  if (def.kind === 'autotile') {
    const tile = h / 3;
    return { frames: Math.max(1, Math.round(def.frames ?? w / (2 * tile))), horiz: true };
  }
  const horiz = w >= h;
  const guess = horiz ? w / Math.max(1, h) : h / Math.max(1, w);
  return { frames: Math.max(1, Math.round(def.frames ?? guess)), horiz };
}

/** The frame showing at `seconds` (frames per second from the tile, 4 by default). */
export function frameAt(def: TileDef, frames: number, seconds: number): number {
  return frames <= 1 ? 0 : Math.floor(seconds * Math.max(0.1, def.fps ?? 4)) % frames;
}

/**
 * An autotile's four quarters (top-left, top-right, bottom-left, bottom-right): each the half-tile [column 0–3,
 * row 0–5] of the 2 × 3 block to draw there, from whether the neighbours hold the same tile (`same(dx, dz)`;
 * outside the map counts as the same, as in RPG Maker).
 */
export function autotileQuarters(same: (dx: number, dz: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const dx = sx ? 1 : -1, dz = sy ? 1 : -1;
    const v = same(0, dz), hz = same(dx, 0), d = same(dx, dz);
    const edgeCol = sx ? 3 : 0, innerCol = sx ? 1 : 2, edgeRow = sy ? 5 : 2, innerRow = sy ? 3 : 4;
    if (!v && !hz) out.push([edgeCol, edgeRow]);
    else if (v && !hz) out.push([edgeCol, innerRow]);
    else if (!v && hz) out.push([innerCol, edgeRow]);
    else if (!d) out.push([2 + sx, sy]);
    else out.push([innerCol, innerRow]);
  }
  return out;
}

/**
 * A wall's four quarters (Update 148, RPG Maker's A3 / A4 walls, a 2 × 2 block): outer half-tiles where the wall ends
 * (no wall beside it that way), inner ones where it carries on. [column 0–3, row 0–3].
 */
export function wallQuarters(same: (dx: number, dz: number) => boolean): [number, number][] {
  return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([sx, sy]) => {
    const hz = same(sx ? 1 : -1, 0), v = same(0, sy ? 1 : -1);
    return [hz ? (sx ? 1 : 2) : (sx ? 3 : 0), v ? (sy ? 1 : 2) : (sy ? 3 : 0)] as [number, number];
  });
}

/** The quarters for an autotile or a wall. */
export const quartersFor = (def: TileDef, same: (dx: number, dz: number) => boolean): [number, number][] => (def.kind === 'wall' ? wallQuarters(same) : autotileQuarters(same));
/** Half-tile rows in the block: 6 for an autotile, 4 for a wall. */
export const blockRows = (def: TileDef): number => (def.kind === 'wall' ? 4 : 6);

/** Pixel rectangle [x, y, w, h] in the picture of an autotile's half-tile (col, row), in frame `f`. */
export function autotileRect(w: number, h: number, frames: number, f: number, col: number, row: number, rows = 6): [number, number, number, number] {
  const bw = w / frames, hw = bw / 4, hh = h / rows;
  return [f * bw + col * hw, row * hh, hw, hh];
}

/** Pixel rectangle of frame `f` of an animated (or plain, one-frame) tile. */
export function frameRect(w: number, h: number, l: FrameLayout, f: number): [number, number, number, number] {
  return l.horiz ? [(f * w) / l.frames, 0, w / l.frames, h] : [0, (f * h) / l.frames, w, h / l.frames];
}

/** Draw one cell of a pixel tile onto a 2D canvas (the editor), frame `f`. */
export function drawPixelTile(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, def: TileDef,
  px: number, py: number, size: number, f: number, same: (dx: number, dz: number) => boolean): void {
  const l = frameLayout(def, img.width, img.height), fr = Math.min(f, l.frames - 1);
  ctx.imageSmoothingEnabled = false;
  if (def.kind === 'autotile' || def.kind === 'wall') {
    const q = quartersFor(def, same), half = size / 2;
    q.forEach(([c, r], k) => {
      const [sx, sy, sw, sh] = autotileRect(img.width, img.height, l.frames, fr, c, r, blockRows(def));
      ctx.drawImage(img, sx, sy, sw, sh, px + (k % 2) * half, py + Math.floor(k / 2) * half, half, half);
    });
    return;
  }
  const [sx, sy, sw, sh] = frameRect(img.width, img.height, l, fr);
  ctx.drawImage(img, sx, sy, sw, sh, px, py, size, size);
}

/**
 * Frames (Update 151): a picture of one whole patch's outline (2 × 2 or 3 × 3 tiles: its corners, edges and inside),
 * any tile size. Each quarter of a cell is cut from the frame's corner tiles: the outer half where the patch ends that
 * way, the inner half where it carries on. Inside corners come from a separate one-tile picture of corner pieces
 * (meeting in the middle like a dot, or RPG Maker style in the outer corners); without one, the inside is used.
 */
export interface FramePiece { corner: boolean; tx: number; ty: number; qx: number; qy: number }
export function frameQuarters(same: (dx: number, dz: number) => boolean, hasCorners: boolean, cornersAt: 'middle' | 'edge' = 'middle'): FramePiece[] {
  return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([sx, sy]) => {
    const dx = sx ? 1 : -1, dz = sy ? 1 : -1;
    const v = same(0, dz), hz = same(dx, 0), d = same(dx, dz);
    if (v && hz && !d && hasCorners) return cornersAt === 'edge' ? { corner: true, tx: 0, ty: 0, qx: sx, qy: sy } : { corner: true, tx: 0, ty: 0, qx: 1 - sx, qy: 1 - sy };
    return { corner: false, tx: sx, ty: sy, qx: hz ? 1 - sx : sx, qy: v ? 1 - sy : sy };
  });
}
/** Pixel rectangle of a frame piece: in the frame picture (n × n tiles; tx / ty 0 the first tile, 1 the last) or the corners picture. */
export function framePieceRect(p: FramePiece, w: number, h: number, n: number): [number, number, number, number] {
  if (p.corner) return [(p.qx * w) / 2, (p.qy * h) / 2, w / 2, h / 2];
  const tw = w / n, th = h / n;
  return [p.tx * (n - 1) * tw + (p.qx * tw) / 2, p.ty * (n - 1) * th + (p.qy * th) / 2, tw / 2, th / 2];
}
/** Draw a frame (and its corners) for one cell onto a 2D canvas (the editor). */
export function drawFrameCell(ctx: CanvasRenderingContext2D, frame: CanvasImageSource & { width: number; height: number }, n: number,
  corners: (CanvasImageSource & { width: number; height: number }) | undefined, cornersAt: 'middle' | 'edge' | undefined,
  px: number, py: number, size: number, same: (dx: number, dz: number) => boolean): void {
  ctx.imageSmoothingEnabled = false;
  const half = size / 2;
  frameQuarters(same, !!corners, cornersAt).forEach((p, k) => {
    const img = p.corner ? corners! : frame;
    const [sx, sy, sw, sh] = framePieceRect(p, img.width, img.height, n);
    ctx.drawImage(img, sx, sy, sw, sh, px + (k % 2) * half, py + Math.floor(k / 2) * half, half, half);
  });
}
