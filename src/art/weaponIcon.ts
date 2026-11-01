/**
 * Icons cut from weapon sprites: a built-in weapon's cell in assets/weapons/thumbs.png, or the icon a weapon made in
 * the weapon builder carries in its own sheet. The bag, shops, the HUD and the weapon on the hero's back use them, so
 * every view of a weapon matches the one in the hand.
 */
import type { WeaponSpriteDef, WeaponSpriteManifest } from '../world/types';

/** Where a weapon's icon is: in thumbs.png (built-in) or in its own sheet (made in the weapon builder). */
export function weaponIconRect(def: WeaponSpriteDef, manifest: Pick<WeaponSpriteManifest, 'thumbSize' | 'thumbCols'>): { x: number; y: number; w: number; h: number; inSheet: boolean } {
  if (def.icon) return { ...def.icon, inSheet: true };
  const s = manifest.thumbSize || 64, cols = manifest.thumbCols || 16;
  return { x: (def.thumb % cols) * s, y: Math.floor(def.thumb / cols) * s, w: s, h: s, inSheet: false };
}

/** A square canvas of the part of `src` at the rect, trimmed to what's drawn (with a pixel of room). */
export function cutIcon(src: CanvasImageSource, r: { x: number; y: number; w: number; h: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = r.w; c.height = r.h;
  const g = c.getContext('2d')!;
  g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const d = g.getImageData(0, 0, r.w, r.h).data;
  let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1;
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++)
      if (d[(y * r.w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  c.dataset.spritePixels = '1';
  if (x1 < 0) return c;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, s = Math.max(w, h) + 2;
  const out = document.createElement('canvas');
  out.width = out.height = s;
  const o = out.getContext('2d')!;
  o.imageSmoothingEnabled = false;
  o.drawImage(c, x0, y0, w, h, Math.floor((s - w) / 2), Math.floor((s - h) / 2), w, h);
  // Drawn at the sprites' scale (32 px a tile) where it's shown in the world, like the weapon in the hand.
  out.dataset.spritePixels = '1';
  return out;
}
