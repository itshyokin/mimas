/**
 * Mimas: the GBA Studio art (public/data/gba.json and its pictures) for the map editor, the playtest and GBA Studio.
 * Loaded once from the project; GBA Studio hands its art back here when it closes, so the map shows the latest.
 */
import type { TileLookup } from '../gba/mapRender';
import { CELL, defaultGbaData, type GbaData, type GbaSprite, type GbaTile } from '../gba/types';
import type { Project } from './project';

export const gba = {
  data: defaultGbaData() as GbaData,
  images: new Map<string, HTMLCanvasElement>(),
  loaded: false,
};

const listeners = new Set<() => void>();
export function onGbaChange(fn: () => void): void { listeners.add(fn); }
function changed(): void { for (const fn of listeners) fn(); }

async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

/** Old 5-piece ledge sheets (one row) shown in the 15-piece layout (GBA Studio converts them for good). */
function ledgeLayout(img: HTMLCanvasElement): HTMLCanvasElement {
  if (img.height !== CELL) return img;
  const c = document.createElement('canvas');
  c.width = 5 * CELL;
  c.height = 3 * CELL;
  const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, 3 * CELL, CELL, 0, 0, 3 * CELL, CELL);
  for (let r = 0; r < 3; r++) {
    g.drawImage(img, 3 * CELL, 0, CELL, CELL, 3 * CELL, r * CELL, CELL, CELL);
    g.drawImage(img, 4 * CELL, 0, CELL, CELL, 4 * CELL, r * CELL, CELL, CELL);
  }
  return c;
}

export async function loadGba(project: Project): Promise<void> {
  try {
    const parsed = JSON.parse(await (await project.readFile('data/gba.json')).text()) as GbaData;
    if (parsed && Array.isArray(parsed.palettes)) gba.data = parsed;
  } catch { /* no GBA art yet */ }
  const images = new Map<string, HTMLCanvasElement>();
  await Promise.all([...gba.data.tiles, ...gba.data.sprites].map(async (it) => {
    try {
      let img = await blobToCanvas(await project.readFile(it.image));
      if ((it as GbaTile).type === 'ledge') img = ledgeLayout(img);
      images.set(it.image, img);
    } catch { /* missing picture: drawn as nothing */ }
  }));
  gba.images = images;
  gba.loaded = true;
  changed();
}

/** GBA Studio closed: use its art (saved, or as it is when nothing changed). */
export function setGba(data: GbaData, images: Map<string, HTMLCanvasElement>): void {
  gba.data = data;
  gba.images = images;
  gba.loaded = true;
  changed();
}

export const tileLookup: TileLookup = (id) => {
  const def = gba.data.tiles.find((t) => t.id === id);
  const img = def ? gba.images.get(def.image) : undefined;
  return def && img ? { def, img } : null;
};

export function gbaTile(id: string): GbaTile | undefined { return gba.data.tiles.find((t) => t.id === id); }
export function gbaSprite(id: string): GbaSprite | undefined { return gba.data.sprites.find((s) => s.id === id); }
export function gbaImage(path: string | undefined): HTMLCanvasElement | undefined { return path ? gba.images.get(path) : undefined; }
