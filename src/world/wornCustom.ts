/**
 * Custom worn sprites (Update 134): up to three pictures for an item (Front, Back and Side; the side one mirrored for
 * the other side), each placed and scaled over the hero in the editor, per body (masc / femme). The game builds a
 * clothes-only sheet with the hero's own layout: every frame facing down gets the front picture, facing up the back,
 * left and right the side (mirrored for one of them), each moved up and down with the hero's own bob (worked out by
 * comparing each frame's top edge with the standing frame's). No three.js.
 */
import type { CharacterAnimLayout, CustomWornBody, CustomWornPic } from './types';

export type WornView = 'front' | 'back' | 'side';
export const WORN_VIEWS: WornView[] = ['front', 'back', 'side'];
export const WORN_VIEW_NAMES: Record<WornView, string> = { front: 'Front', back: 'Back', side: 'Side' };

/** Which picture a direction row uses, and whether it's mirrored (the side picture faces left as drawn). */
export function viewFor(dir: 'up' | 'down' | 'left' | 'right'): { view: WornView; flip: boolean } {
  return dir === 'down' ? { view: 'front', flip: false } : dir === 'up' ? { view: 'back', flip: false } : { view: 'side', flip: dir === 'right' };
}

type Img = HTMLCanvasElement | HTMLImageElement;

/** The top-most drawn row of a frame (its height when empty). */
function topEdge(g: CanvasRenderingContext2D, x: number, y: number, size: number): number {
  const d = g.getImageData(x, y, size, size).data;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (d[(r * size + c) * 4 + 3] > 40) return r;
  return size;
}

/** Draw one placed picture into a frame at (fx, fy), shifted down by `dy`, mirrored when `flip`. */
export function drawPic(g: CanvasRenderingContext2D, img: Img, p: CustomWornPic, fx: number, fy: number, frame: number, dy = 0, flip = false): void {
  const w = img.width * p.scale, h = img.height * p.scale;
  // x / y: the picture's centre in the frame (pixels of a 64-pixel frame, scaled to this sheet's frame size).
  const k = frame / 64, cx = (flip ? 64 - p.x : p.x) * k, cy = p.y * k + dy;
  g.save();
  g.translate(fx + cx, fy + cy);
  if (flip) g.scale(-1, 1);
  if (p.rot) g.rotate((p.rot * Math.PI) / 180);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, (-w / 2) * k, (-h / 2) * k, w * k, h * k);
  g.restore();
}

/**
 * The clothes-only sheet for these pictures on this hero: the hero's sheet size and layout, each picture drawn in
 * every frame of its direction, bobbing with the hero.
 */
export function buildCustomWorn(base: Img, layout: CharacterAnimLayout, cfg: CustomWornBody, pic: (src: string) => Img | undefined): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = base.width; out.height = base.height;
  const g = out.getContext('2d')!;
  const bc = document.createElement('canvas'); bc.width = base.width; bc.height = base.height;
  const bg = bc.getContext('2d', { willReadFrequently: true })!;
  bg.drawImage(base, 0, 0);
  const f = layout.frame;
  // The standing frame's top edge per direction (walk, frame 0): the bob is measured from it.
  const walk = layout.anims.walk ?? layout.anims.idle;
  const ref: Record<string, number> = {};
  layout.dirs.forEach((dir, r) => { ref[dir] = walk ? topEdge(bg, 0, (walk.row + (walk.dirs === 4 ? r : 0)) * f, f) : 0; });
  for (const a of Object.values(layout.anims)) {
    for (let r = 0; r < a.dirs; r++) {
      // One-row animations: climbing faces away, the rest (hurt) face you.
      const dir = a.dirs === 4 ? layout.dirs[r] : (a === layout.anims.climb ? 'up' : 'down');
      const v = viewFor(dir as 'up' | 'down' | 'left' | 'right'), p = cfg[v.view];
      const img = p?.src ? pic(p.src) : undefined;
      if (!p || !img) continue;
      for (let c = 0; c < a.frames; c++) {
        const fx = c * f, fy = (a.row + r) * f, top = topEdge(bg, fx, fy, f);
        if (top >= f) continue;
        drawPic(g, img, p, fx, fy, f, top - (ref[dir] ?? top), v.flip);
      }
    }
  }
  return out;
}

/** Every picture a set of custom worn sprites uses. */
export const customSrcs = (c: { masc?: CustomWornBody; femme?: CustomWornBody } | undefined): string[] =>
  [c?.masc, c?.femme].flatMap((b) => WORN_VIEWS.map((v) => b?.[v]?.src).filter((s): s is string => !!s));
