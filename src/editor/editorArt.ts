/** Images the editor draws with: terrain tiles, prop thumbnails, light and character icons. */
import { CHAR_FRAME_H, CHAR_FRAME_W, MONSTERS, PLACEHOLDER_SPRITES, builtinTileArt, DEFAULT_PALETTE, characterSheet, cliffTile, flameStrip } from '../art/placeholderArt';
import { missingImage } from '../shared/images';
import { HIDDEN_BUILTINS, PropCatalog } from '../world/props';
import { TileCatalog } from '../world/tiles';
import { hash2 } from '../core/math';
import { drawFrameCell, drawPixelTile, frameLayout, frameRect, isPixelTile } from '../world/pixelTiles';
import type { CharacterDef, Dir, EnemyDef, PropDef, TileDef } from '../world/types';

export const TS = 16;

/* ------------------------------------------------------------ tiles */

let tileCatalog = new TileCatalog();
const customTiles = new Map<string, HTMLCanvasElement>();

export function setTileCatalog(c: TileCatalog): void { tileCatalog = c; }
export function getTileCatalog(): TileCatalog { return tileCatalog; }
/** Texture of an imported tile, by key. */
export function setCustomTileImage(key: string, img: HTMLCanvasElement | null): void {
  if (img) customTiles.set(key, img); else customTiles.delete(key);
}
export function customTileImage(key: string): HTMLCanvasElement | undefined { return customTiles.get(key); }

export const tileName = (key: string): string => tileCatalog.get(key)?.name ?? `Unknown tile “${key}”`;
export function tileNote(d: TileDef): string {
  return d.key === '#' ? 'Raised 1 tile, blocks movement' : d.blocks ? 'Blocks movement' : 'Walkable';
}

const VARIANTS = 4;
const tiles: Record<string, HTMLCanvasElement[]> = Object.fromEntries(
  ['.', '=', ':', '~', '#', '▒', '▦', '▲', '❄'].map((k) => [k, Array.from({ length: VARIANTS }, (_, i) => builtinTileArt(k, i))]));
const cliff = cliffTile();

/** Image of a built-in tile at (x, z); variants break up repetition. */
export function tileImage(t: string, x: number, z: number): HTMLCanvasElement {
  const v = tiles[t] ?? tiles['.'];
  return v[Math.floor(hash2(x, z, 3) * VARIANTS)];
}

/**
 * Draw one tile into a 2D context at pixel (px, py). Built-in tiles get edge hints
 * (cliff faces where a plateau drops away, a dark lip on water); imported tiles show
 * their part of the repeating texture.
 */
export function drawTile(ctx: CanvasRenderingContext2D, t: string, x: number, z: number, px: number, py: number, at: (x: number, z: number) => string): void {
  const def = tileCatalog.get(t);
  if (def?.image) {
    const img = customTiles.get(t);
    if (!img) { ctx.drawImage(missingTile, px, py); return; }
    const same = (dx: number, dz: number) => at(x + dx, z + dz) === t;
    const corners = customTiles.get(`${t}#corners`), edges = customTiles.get(`${t}#edges`), n = Math.max(2, Math.round(def.frameTiles ?? 2));
    // Update 151: a frame autotile; then any edge trim over the tile.
    const trim = () => { if (edges) drawFrameCell(ctx, edges, n, corners, def.cornersAt, px, py, TS, same); };
    if (def.kind === 'autotile' && def.layout === 'frame') { drawFrameCell(ctx, img, n, corners, def.cornersAt, px, py, TS, same); trim(); return; }
    // RPG Maker-style tiles (Update 146): first frame, autotiles shaped by their neighbours.
    if (isPixelTile(def)) { drawPixelTile(ctx, img, def, px, py, TS, 0, same); trim(); return; }
    const span = Math.max(1, Math.round(def.span || 1));
    const sw = img.width / span, sh = img.height / span;
    const ix = ((x % span) + span) % span, iz = ((z % span) + span) % span;
    ctx.imageSmoothingEnabled = def.filter === 'smooth' || sw > TS * 1.5;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, ix * sw, iz * sh, sw, sh, px, py, TS, TS);
    ctx.imageSmoothingEnabled = false;
    trim();
    return;
  }
  ctx.drawImage(tileImage(def ? t : '.', x, z), px, py);
  if (t === '#') {
    if (at(x, z - 1) !== '#') { ctx.fillStyle = 'rgba(255,255,220,0.35)'; ctx.fillRect(px, py, TS, 1); }
    if (at(x - 1, z) !== '#') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px, py, 1, TS); }
    if (at(x + 1, z) !== '#') { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(px + TS - 1, py, 1, TS); }
    if (at(x, z + 1) !== '#') ctx.drawImage(cliff, 0, 4, TS, 12, px, py + 9, TS, 7);
  } else if (t === '~' && at(x, z - 1) !== '~') {
    ctx.fillStyle = 'rgba(5,12,24,0.7)';
    ctx.fillRect(px, py, TS, 2);
  }
}
const missingTile = missingImage(16, 16);

/** Square thumbnail of a tile (one tile of it, or the whole texture for imported tiles). */
export function tileThumb(key: string, size = 36): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const def = tileCatalog.get(key);
  const img = def?.image ? customTiles.get(key) : tileImage(key, 0, 0);
  if (!img) { ctx.drawImage(missingTile, 0, 0, size, size); return c; }
  if (def && isPixelTile(def)) {
    // One tile of the first frame (an autotile: its top-left preview tile).
    ctx.imageSmoothingEnabled = false;
    const l = frameLayout(def, img.width, img.height);
    const [sx, sy, sw, sh] = def.layout === 'frame' ? [0, 0, img.width / Math.max(2, Math.round(def.frameTiles ?? 2)), img.height / Math.max(2, Math.round(def.frameTiles ?? 2))] : def.kind === 'autotile' || def.kind === 'wall' ? [0, 0, img.width / l.frames / 2, img.height / (def.kind === 'wall' ? 2 : 3)] : frameRect(img.width, img.height, l, 0);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
    return c;
  }
  ctx.imageSmoothingEnabled = img.width > size || def?.filter === 'smooth';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  return c;
}

/* ------------------------------------------------------------ props */

let catalog = new PropCatalog();
const customImages = new Map<string, HTMLCanvasElement>();
const builtinCache = new Map<string, HTMLCanvasElement>();

/** The editor's current prop catalog (built-in + imported). */
export function setPropCatalog(c: PropCatalog): void { catalog = c; composedCache.clear(); }
export function getPropCatalog(): PropCatalog { return catalog; }
/** Image for an imported prop (already cropped to its frame). */
export function setCustomPropImage(id: string, img: HTMLCanvasElement | null): void {
  if (img) customImages.set(id, img); else customImages.delete(id);
  composedCache.clear();
}
export function customPropImage(id: string): HTMLCanvasElement | undefined { return customImages.get(id); }

let flame0: HTMLCanvasElement | null = null;
function flameFrame(): HTMLCanvasElement {
  if (!flame0) {
    const strip = flameStrip();
    flame0 = document.createElement('canvas');
    flame0.width = 12; flame0.height = 18;
    flame0.getContext('2d')!.drawImage(strip, 0, 0, 12, 18, 0, 0, 12, 18);
  }
  return flame0;
}

/** The built-in art for a prop (without its flame), 16 px per tile. */
export function builtinArt(def: PropDef): HTMLCanvasElement | undefined {
  return def.builtin ? PLACEHOLDER_SPRITES[def.builtin]?.() : undefined;
}

/**
 * The prop's picture as drawn on the map, at 16 px per tile: the base image scaled to the prop's size,
 * with the flame drawn in for props that have one (campfire, torch).
 */
function composed(def: PropDef, base: HTMLCanvasElement): HTMLCanvasElement {
  const key = `${def.id}|${def.w}|${def.h}`;
  let c = composedCache.get(key);
  if (c) return c;
  const bw = Math.max(1, Math.round(def.w * TS)), bh = Math.max(1, Math.round(def.h * TS));
  const f = def.flame;
  const fw = f ? Math.round(f.w * TS) : 0, fh = f ? Math.round(f.h * TS) : 0, fy = f ? Math.round(f.y * TS) : 0;
  c = document.createElement('canvas');
  c.width = Math.max(bw, fw);
  c.height = Math.max(bh, fy + fh);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = def.filter === 'smooth' || base.width > bw;
  ctx.imageSmoothingQuality = 'high';
  const ox = (c.width - bw) / 2;
  ctx.drawImage(base, ox, c.height - bh, bw, bh);
  if (f) ctx.drawImage(flameFrame(), Math.round(ox + bw / 2 + f.x * TS - fw / 2), c.height - fy - fh, fw, fh);
  composedCache.set(key, c);
  return c;
}
const composedCache = new Map<string, HTMLCanvasElement>();

const missing = missingImage(16, 16);

/** What to draw for a prop type: the image and its size on the map in pixels (16 per tile). */
export interface PropSprite { img: HTMLCanvasElement; w: number; h: number; def?: PropDef }

export function propSprite(type: string): PropSprite {
  const def = catalog.get(type);
  if (!def) return { img: missing, w: TS, h: TS };
  // Imported image (also used when a built-in has been customised), otherwise the built-in art.
  const base = def.image ? customImages.get(def.id) : builtinCache.get(def.id) ?? cacheBuiltin(def);
  if (!base) return { img: missing, w: def.w * TS, h: def.h * TS, def };
  if (!def.flame && def.image) return { img: base, w: def.w * TS, h: def.h * TS, def };
  const img = composed(def, base);
  return { img, w: img.width, h: img.height, def };
}

function cacheBuiltin(def: PropDef): HTMLCanvasElement | undefined {
  const c = builtinArt(def);
  if (c) builtinCache.set(def.id, c);
  return c;
}

/** Image for a prop type (thumbnails). */
export const propImage = (type: string): HTMLCanvasElement => propSprite(type).img;

/** Props shown in the palette and type pickers: visible built-ins first, then imported ones. */
export function paletteProps(): PropDef[] {
  return catalog.all().filter((d) => !HIDDEN_BUILTINS.has(d.id));
}
export const propName = (type: string): string => catalog.get(type)?.name ?? type;

const charCache = new Map<string, HTMLCanvasElement>();
const DIR_ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };
/** Imported character sheets by path (Database → Characters), loaded with the project. */
const charSheets = new Map<string, HTMLCanvasElement>();
export function setCharacterSheet(path: string, sheet: HTMLCanvasElement | null): void {
  if (sheet) charSheets.set(path, sheet); else charSheets.delete(path);
  charCache.clear();
}
export const characterSheetImage = (path: string): HTMLCanvasElement | undefined => charSheets.get(path);

/** Flat enemy pictures by path (Database → Enemies → Flat image), loaded with the project. */
const flatImages = new Map<string, HTMLCanvasElement>();
export function setFlatImage(path: string, img: HTMLCanvasElement | null): void {
  if (img) flatImages.set(path, img); else flatImages.delete(path);
  for (const k of [...charCache.keys()]) if (k.startsWith('flat:')) charCache.delete(k);
}
export const flatImage = (path: string): HTMLCanvasElement | undefined => flatImages.get(path);

function sheetOf(key: string, def: CharacterDef | undefined): HTMLCanvasElement {
  const imported = def?.sheet ? charSheets.get(def.sheet) : undefined;
  if (imported) return imported;
  let s = charCache.get(key + ':sheet');
  if (!s) { s = characterSheet(def?.palette ?? DEFAULT_PALETTE); charCache.set(key + ':sheet', s); }
  return s;
}

/** One standing frame at the sheet's own size (thumbnails in lists). */
export function characterFrame(key: string, def: CharacterDef | undefined, dir: Dir = 'down'): HTMLCanvasElement {
  const id = `${key}:${def?.sheet ?? ''}:${dir}:full`;
  let c = charCache.get(id);
  if (!c) {
    const sheet = sheetOf(key, def);
    c = document.createElement('canvas');
    const L = def?.sheet && charSheets.has(def.sheet) ? def.anim : undefined;
    if (L) {
      // Animated sheet: the first idle (or walk) frame facing `dir`.
      const a = L.anims.idle ?? L.anims.walk ?? Object.values(L.anims)[0];
      const f = L.frame, row = a.row + (a.dirs === 4 ? Math.max(0, L.dirs.indexOf(dir)) : 0), col = a.cycle[0] ?? 0;
      c.width = f; c.height = f;
      c.getContext('2d')!.drawImage(sheet, col * f, row * f, f, f, 0, 0, f, f);
    } else {
      const fw = sheet.width / 3, fh = sheet.height / 4;
      c.width = fw; c.height = fh;
      c.getContext('2d')!.drawImage(sheet, fw, DIR_ROW[dir] * fh, fw, fh, 0, 0, fw, fh);
    }
    charCache.set(id, c);
  }
  return c;
}

/** One standing frame of a character facing `dir`, at map scale (as big as in the game). */
export function characterImage(key: string, def: CharacterDef | undefined, dir: Dir = 'down'): HTMLCanvasElement {
  const id = `${key}:${def?.sheet ?? ''}:${dir}`;
  let c = charCache.get(id);
  if (!c) {
    const full = characterFrame(key, def, dir);
    c = document.createElement('canvas');
    // Animated (LPC) frames are 32 pixels per tile; other sheets stand 1.5 tiles tall.
    const animated = !!(def?.anim && def.sheet && charSheets.has(def.sheet));
    c.height = animated ? Math.round((full.height / 32) * TS) : CHAR_FRAME_H;
    c.width = Math.round(c.height * full.width / full.height);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = full.height > c.height;
    g.drawImage(full, 0, 0, c.width, c.height);
    charCache.set(id, c);
  }
  return c;
}

/** One standing frame of an enemy (its character or built-in monster), facing down. */
export function enemyImage(db: { characters: Record<string, CharacterDef> }, look: EnemyDef['look']): HTMLCanvasElement | null {
  if (look.image) {
    // A flat picture, at its height in tiles (the map's 16 px per tile).
    const src = flatImages.get(look.image);
    if (!src) return null;
    const tall = look.flat?.height ?? 1, key = `flat:${look.image}:${tall}`;
    let c = charCache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.height = Math.max(4, Math.round(tall * TS));
      c.width = Math.max(1, Math.round(c.height * src.width / src.height));
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = src.height > c.height * 2;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, c.width, c.height);
      charCache.set(key, c);
    }
    return c;
  }
  if (look.character && db.characters[look.character]) return characterImage(look.character, db.characters[look.character], 'down');
  const m = MONSTERS[look.monster ?? ''] ?? MONSTERS.slime;
  const id = `monster:${look.monster ?? 'slime'}`;
  let c = charCache.get(id);
  if (!c) {
    const sheet = m.draw();
    c = document.createElement('canvas');
    c.width = CHAR_FRAME_W; c.height = CHAR_FRAME_H;
    c.getContext('2d')!.drawImage(sheet, CHAR_FRAME_W, 0, CHAR_FRAME_W, CHAR_FRAME_H, 0, 0, CHAR_FRAME_W, CHAR_FRAME_H);
    charCache.set(id, c);
  }
  return c;
}
