/**
 * Mimas: pictures for GBA battles drawn in the editor: fitting art into a sprite box, and a hero's battle picture
 * (Database → Heroes → Battle picture), for the playtest and the ROM.
 */
import { characterImage, characterSheetFrames } from './editorArt';
import type { CharacterDef, HeroDef } from '../world/types';

/** A picture fitted into a box (nearest-neighbour, keeping its shape), bottom-centred. */
export function fitInto(src: HTMLCanvasElement, w: number, h: number, bottom = true): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  // Small art is scaled up by whole steps (crisp pixels), big art down to fit.
  const fit = Math.min(w / src.width, h / src.height) || 1;
  const k = fit >= 1 ? Math.floor(fit) : fit;
  const dw = Math.max(1, Math.round(src.width * k)), dh = Math.max(1, Math.round(src.height * k));
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(src, Math.floor((w - dw) / 2), bottom ? h - dh : Math.floor((h - dh) / 2), dw, dh);
  return c;
}

/** The part of a picture that's drawn (no empty rows or columns around it). */
export function trim(src: HTMLCanvasElement): HTMLCanvasElement {
  const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 16) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return src;
  const c = document.createElement('canvas');
  c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
  c.getContext('2d')!.drawImage(src, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
  return c;
}

/**
 * A hero's battle picture (64 × 64, feet at the bottom) as Database → Heroes → Battle picture says, or null for the
 * default (GBA Studio's back sprite). `look`: their character; `custom`: their own picture, already loaded.
 */
export function heroBattleImage(chars: Record<string, CharacterDef>, hero: HeroDef, look: string | undefined, custom?: HTMLCanvasElement | null): HTMLCanvasElement | null {
  const bl = hero.battleLook;
  if (!bl || bl.mode === 'default') return null;
  if (bl.mode === 'image') return custom && custom.width ? fitInto(trim(custom), 64, 64) : null;
  const ch = look ? chars[look] : undefined;
  if (!look || !ch) return null;
  if (bl.mode === 'overworld') return fitInto(trim(characterImage(look, ch, bl.dir ?? 'up')), 64, 64);
  const f = characterSheetFrames(look, ch);
  const col = Math.max(0, Math.min(f.cols - 1, bl.col ?? 0)), row = Math.max(0, Math.min(f.rows - 1, bl.row ?? 0));
  const c = document.createElement('canvas');
  c.width = f.fw; c.height = f.fh;
  c.getContext('2d')!.drawImage(f.sheet, col * f.fw, row * f.fh, f.fw, f.fh, 0, 0, f.fw, f.fh);
  return fitInto(trim(c), 64, 64);
}
