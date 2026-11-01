/**
 * The Character Builder's parts library in the editor (Update 120): worn looks built from the builder's own clothes,
 * armor and hats instead of exported PNGs. A port of the compositing in tools/lpc/builder/src/lpc.js (palette
 * recolouring and layer order), cut down to what clothes need (no eyes, no skin).
 *
 * The library is tools/lpc/library (catalog.json and packs of base64 PNGs). It's served at /builder/ by
 * "Start Map Editor.bat" and at /tools/lpc/library/ by the dev server.
 */
import type { CharacterAnimLayout } from '../world/types';

export const F = 64;
/** The builder's tabs whose parts can be worn. */
export const WORN_TABS = ['torso', 'legs', 'feet', 'arms', 'headwear', 'back'] as const;
export const TAB_NAMES: Record<string, string> = { torso: 'Torso', legs: 'Legs', feet: 'Feet', arms: 'Arms & hands', headwear: 'Hats & helmets', back: 'Back' };
/** The library's body for the engine's body types. */
export const LPC_BODY = { masc: 'male', femme: 'female' } as const;
/** Animations a worn look carries (the builder's export order). */
const ANIMS = ['walk', 'idle', 'run', 'jump', 'climb', 'combat_idle', 'slash', 'backslash', 'halfslash', 'thrust', 'shoot', 'spellcast', 'hurt', 'sit', 'emote'];
const PLAY: Record<string, { cycle: number[]; ms: number }> = {
  walk: { cycle: [1, 2, 3, 4, 5, 6, 7, 8], ms: 100 }, idle: { cycle: [0, 0, 1], ms: 380 }, run: { cycle: [0, 1, 2, 3, 4, 5, 6, 7], ms: 80 },
  jump: { cycle: [0, 1, 2, 3, 4, 1], ms: 120 }, climb: { cycle: [0, 1, 2, 3, 4, 5], ms: 120 }, combat_idle: { cycle: [0, 0, 1], ms: 300 },
  slash: { cycle: [0, 1, 2, 3, 4, 5], ms: 80 }, backslash: { cycle: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12], ms: 70 }, halfslash: { cycle: [0, 1, 2, 3, 4, 5], ms: 80 },
  thrust: { cycle: [0, 1, 2, 3, 4, 5, 6, 7], ms: 80 }, shoot: { cycle: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], ms: 70 },
  spellcast: { cycle: [0, 1, 2, 3, 4, 5, 6], ms: 90 }, hurt: { cycle: [0, 1, 2, 3, 4, 5], ms: 110 }, sit: { cycle: [0, 1, 2], ms: 600 }, emote: { cycle: [0, 1, 2], ms: 600 },
};

/** A palette by reference. */
export interface PaletteRef { mat: string; ver: string; name: string }
/** One picked part: a library item, its colour variant, and its colour channels' palettes. */
export interface WornPart { id: string; variant?: string; colours?: (PaletteRef | null)[] }

export interface LpcChannel { label: string; material: string; source: string[] | null; palettes: [string, string][] }
export interface LpcItem {
  id: string; name: string; type: string; tab: string; pack: number;
  layers: { z: number; paths: Record<string, string> }[];
  variants: string[] | null; colours: LpcChannel[] | null;
  anims: Record<string, string[]>; safe?: boolean; safeBy?: Record<string, boolean>;
  thumbs?: Record<string, number>;
}
interface Catalog {
  anims: Record<string, { frames: number; dirs: number }>;
  palettes: Record<string, Record<string, Record<string, string[]>>>;
  packs: string[]; items: LpcItem[];
  thumbs: { sheets: string[]; perSheet: number; cols: number };
}

let base = '';
let cat: Catalog | null = null;
let loading: Promise<Catalog | null> | null = null;
const packs = new Map<number, Promise<Map<string, string>>>();
const images = new Map<string, Promise<HTMLImageElement | null>>();

/** Load the catalog (null: the library isn't served here). */
export function loadParts(): Promise<Catalog | null> {
  loading ??= (async () => {
    for (const b of ['/builder/', '/tools/lpc/library/']) {
      try {
        const r = await fetch(b + 'catalog.json');
        if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) continue;
        cat = await r.json() as Catalog;
        base = b;
        return cat;
      } catch { /* try the next */ }
    }
    return null;
  })();
  return loading;
}

export const partById = (id: string): LpcItem | undefined => cat?.items.find((i) => i.id === id);
/** Steam-safe (CC0 / OGA-BY) for this body. */
export const partSafe = (it: LpcItem, body: string): boolean => it.safeBy?.[body] ?? it.safe ?? false;
/** The worn parts of a tab that this body can wear. */
export function partsIn(tab: string, body: string): LpcItem[] {
  return (cat?.items ?? []).filter((i) => i.tab === tab && i.anims[body]?.length && i.layers.some((l) => l.paths[body])).sort((a, b) => a.name.localeCompare(b.name));
}
/** The palettes a colour channel may use (deduplicated). */
export function channelChoices(ch: LpcChannel): { ref: PaletteRef; cols: string[] }[] {
  const out: { ref: PaletteRef; cols: string[] }[] = [], seen = new Set<string>();
  for (const [mat, ver] of ch.palettes) for (const [name, cols] of Object.entries(cat?.palettes[mat]?.[ver] ?? {})) {
    if (cols.length !== ch.source?.length) continue;
    const k = cols.join();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ref: { mat, ver, name }, cols });
  }
  return out;
}

function pack(i: number): Promise<Map<string, string>> {
  let p = packs.get(i);
  if (!p) {
    p = fetch(base + 'packs/' + cat!.packs[i]).then(async (r) => new Map(Object.entries((await r.json() as { files: Record<string, string> }).files)));
    p.catch(() => packs.delete(i));
    packs.set(i, p);
  }
  return p;
}
function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => res(null); img.src = src; });
}
function image(it: LpcItem, path: string): Promise<HTMLImageElement | null> {
  const key = `${it.pack}:${path}`;
  let p = images.get(key);
  if (!p) { p = pack(it.pack).then((m) => { const b = m.get(path); return b ? loadImg('data:image/png;base64,' + b) : null; }); images.set(key, p); }
  return p;
}

const hexInt = (h: string) => parseInt(h.slice(1, 7), 16);
/** Source colour → picked colour for a part's channels. */
function colourMap(it: LpcItem, chosen: (PaletteRef | null)[] | undefined): Map<number, number> {
  const map = new Map<number, number>();
  (it.colours ?? []).forEach((ch, i) => {
    const pick = chosen?.[i];
    const target = pick ? cat!.palettes[pick.mat]?.[pick.ver]?.[pick.name] : null;
    if (ch.source && target) ch.source.forEach((c, k) => { if (target[k]) map.set(hexInt(c), hexInt(target[k])); });
  });
  return map;
}
function recolour(img: HTMLImageElement, map: Map<number, number>): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  if (!map.size) return c;
  const d = g.getImageData(0, 0, c.width, c.height), px = d.data;
  const keys = [...map.keys()];
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const v = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let t = map.get(v);
    if (t === undefined) {
      // LPC allows ±1 per channel for colours that drifted in editing.
      const near = keys.find((s) => Math.abs((s >> 16) - px[i]) <= 1 && Math.abs(((s >> 8) & 255) - px[i + 1]) <= 1 && Math.abs((s & 255) - px[i + 2]) <= 1);
      if (near === undefined) continue;
      t = map.get(near)!;
    }
    px[i] = t >> 16; px[i + 1] = (t >> 8) & 255; px[i + 2] = t & 255;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** A small standing preview of the parts (from the thumbnail atlas). */
export async function previewParts(parts: WornPart[], body: string, size = 64): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  if (!cat) return c;
  const list = parts.map((p) => ({ p, it: partById(p.id) })).filter((x) => x.it?.thumbs?.[body] !== undefined)
    .sort((a, b) => Math.min(...a.it!.layers.map((l) => l.z)) - Math.min(...b.it!.layers.map((l) => l.z)));
  for (const { p, it } of list) {
    const idx = it!.thumbs![body], per = cat.thumbs.perSheet, cols = cat.thumbs.cols;
    const sheet = await loadImg(base + cat.thumbs.sheets[Math.floor(idx / per)]);
    if (!sheet) continue;
    const k = idx % per, sx = (k % cols) * F, sy = Math.floor(k / cols) * F;
    const one = document.createElement('canvas'); one.width = one.height = F;
    one.getContext('2d')!.drawImage(sheet, sx, sy, F, F, 0, 0, F, F);
    const img = await loadImg(one.toDataURL());
    if (img) g.drawImage(recolour(img, colourMap(it!, p.colours)), 0, 0, F, F, 0, 0, size, size);
  }
  return c;
}

/**
 * The clothes-only sheet for these parts on this body: every animation they all have, stacked like the builder's
 * export, with its layout. Null when nothing could be drawn.
 */
export async function buildWornSheet(parts: WornPart[], body: string): Promise<{ canvas: HTMLCanvasElement; layout: CharacterAnimLayout } | null> {
  if (!cat || !parts.length) return null;
  const items = parts.map((p) => ({ p, it: partById(p.id) })).filter((x): x is { p: WornPart; it: LpcItem } => !!x.it && !!x.it.anims[body]);
  if (!items.length) return null;
  // The animations any of them has (the hero's sheet takes the matching ones; missing ones stay bare).
  const anims = ANIMS.filter((a) => cat!.anims[a] && items.some(({ it }) => it.anims[body].includes(a)));
  const strips: { a: string; c: HTMLCanvasElement }[] = [];
  for (const a of anims) {
    const info = cat.anims[a];
    const c = document.createElement('canvas');
    c.width = info.frames * F; c.height = info.dirs * F;
    const g = c.getContext('2d')!;
    const layers: { z: number; it: LpcItem; p: WornPart; path: string }[] = [];
    for (const { p, it } of items) {
      if (!it.anims[body].includes(a)) continue;
      for (const L of it.layers) {
        const folder = L.paths[body];
        if (!folder || folder.includes('${')) continue;
        const v = it.variants ? (p.variant ?? it.variants[0]).replace(/ /g, '_') : null;
        layers.push({ z: L.z, it, p, path: v ? `${folder}${a}/${v}.png` : `${folder}${a}.png` });
      }
    }
    layers.sort((x, y) => x.z - y.z);
    const imgs = await Promise.all(layers.map((l) => image(l.it, l.path)));
    layers.forEach((l, i) => { const img = imgs[i]; if (img) g.drawImage(recolour(img, colourMap(l.it, l.p.colours)), 0, 0); });
    strips.push({ a, c });
  }
  const out = document.createElement('canvas');
  out.width = Math.max(...strips.map((s) => s.c.width));
  out.height = strips.reduce((h, s) => h + s.c.height, 0);
  const g = out.getContext('2d')!;
  const layout: CharacterAnimLayout = { frame: F, dirs: ['up', 'left', 'down', 'right'], anims: {} } as unknown as CharacterAnimLayout;
  let y = 0;
  for (const s of strips) {
    g.drawImage(s.c, 0, y);
    const info = cat.anims[s.a];
    (layout.anims as Record<string, unknown>)[s.a] = { row: y / F, frames: info.frames, dirs: info.dirs, cycle: PLAY[s.a].cycle, ms: PLAY[s.a].ms };
    y += s.c.height;
  }
  return { canvas: out, layout };
}
