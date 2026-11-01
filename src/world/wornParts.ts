/**
 * Built-in clothing (Update 128): tops, bottoms and accessories made from the Character Builder's parts
 * (tools/lpc/build_worn.py writes public/assets/worn/builtin/: a sheet per part and body, and parts.json). An armor
 * item's Look when worn picks one of each (or none), each with a colour swatch (the part's own palettes) or a tint.
 * Used by the game (sprites.ts draws them over the hero's sheet) and the editor (the pickers and previews).
 */
import type { CharacterAnimLayout, SpriteCredit } from './types';

export type WornSlot = 'top' | 'bottom' | 'accessory';
export const WORN_SLOTS: WornSlot[] = ['top', 'bottom', 'accessory'];
export const WORN_SLOT_NAMES: Record<WornSlot, string> = { top: 'Top', bottom: 'Bottom', accessory: 'Accessory' };

export interface BuiltinWornPart {
  id: string;
  slot: WornSlot;
  name: string;
  /** Drawn over the hero, per body. */
  sheets: { masc?: string; femme?: string };
  /** Drawn under the hero (a cape's back), per body. */
  under?: { masc?: string; femme?: string };
  layout: { masc?: CharacterAnimLayout; femme?: CharacterAnimLayout };
  /** The colours that can be swapped, and the palettes to swap them for. */
  recolor?: { source: string[]; swatches: { name: string; cols: string[] }[] };
  credits?: SpriteCredit[];
}

export const WORN_PARTS_PATH = 'assets/worn/builtin/parts.json';

let parts: BuiltinWornPart[] = [];
/** The built-in parts (after loadWornParts). */
export const wornParts = (): BuiltinWornPart[] => parts;
export const wornPart = (id: string | undefined): BuiltinWornPart | undefined => (id ? parts.find((p) => p.id === id) : undefined);
export function setWornParts(list: BuiltinWornPart[]): void { parts = list; }

/** Load parts.json (`read` fetches a project file as text). Missing: no built-in clothing. */
export async function loadWornParts(read: (path: string) => Promise<string>): Promise<BuiltinWornPart[]> {
  try { parts = (JSON.parse(await read(WORN_PARTS_PATH)) as { parts: BuiltinWornPart[] }).parts ?? []; } catch { parts = []; }
  return parts;
}

/** Source → swatch colour pairs for a pick (none: as drawn). */
export function recolorPairs(p: BuiltinWornPart | undefined, swatch: number | undefined): [string, string][] | undefined {
  const r = p?.recolor, sw = swatch !== undefined ? r?.swatches[swatch] : undefined;
  if (!r || !sw) return undefined;
  return r.source.map((c, i) => [c, sw.cols[i] ?? c] as [string, string]);
}

const hexInt = (h: string) => parseInt(h.slice(1, 7), 16);
/** A copy of a sheet with colours swapped (LPC allows ±1 per channel of drift). */
export function recolorCanvas(src: HTMLCanvasElement | HTMLImageElement, pairs: [string, string][]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  if (!pairs.length) return c;
  const map = new Map(pairs.map(([a, b]) => [hexInt(a), hexInt(b)]));
  const keys = [...map.keys()];
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const v = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let t = map.get(v);
    if (t === undefined) {
      const k = keys.find((s) => Math.abs((s >> 16) - px[i]) <= 1 && Math.abs(((s >> 8) & 255) - px[i + 1]) <= 1 && Math.abs((s & 255) - px[i + 2]) <= 1);
      if (k === undefined) continue;
      t = map.get(k)!;
    }
    px[i] = t >> 16; px[i + 1] = (t >> 8) & 255; px[i + 2] = t & 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** Multiply a sheet by a colour (shading kept), cut back to its own shape. */
export function tintSheet(src: HTMLCanvasElement, tint: string): HTMLCanvasElement {
  const t = document.createElement('canvas'); t.width = src.width; t.height = src.height;
  const tg = t.getContext('2d')!;
  tg.drawImage(src, 0, 0);
  tg.globalCompositeOperation = 'multiply'; tg.fillStyle = tint; tg.fillRect(0, 0, t.width, t.height);
  tg.globalCompositeOperation = 'destination-in'; tg.drawImage(src, 0, 0);
  return t;
}

/** The standing frame facing you (walk, facing down, first frame) of a sheet with this layout. */
export function standingCell(layout: CharacterAnimLayout | undefined): { x: number; y: number; size: number } | null {
  const a = layout?.anims.walk ?? layout?.anims.idle;
  if (!layout || !a) return null;
  const down = a.dirs === 4 ? Math.max(0, layout.dirs.indexOf('down')) : 0;
  return { x: 0, y: (a.row + down) * layout.frame, size: layout.frame };
}
