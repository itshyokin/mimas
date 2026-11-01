/**
 * The 2.5D sprite system.
 *
 * Sprites are upright quads standing on the ground. Their vertex normals point mostly UP
 * (tilted slightly toward the camera), so a sprite is lit like the ground it stands on —
 * the core HD-2D trick. A normal map (imported, or generated from the art) adds volume on top.
 * Shadows use the sprite's alpha, so trees cast tree-shaped shadows.
 */
import { recolorCanvas } from '../world/wornParts';
import { buildCustomWorn } from '../world/wornCustom';
import { builtinIcon } from '../art/itemIcons';
import { patchLean } from './lean';
import * as THREE from 'three';
import { shapeGeometry } from './propShapes';
import { patchSway } from './wind';
import { DEFAULT_PALETTE, PLACEHOLDER_SPRITES, characterSheet } from '../art/placeholderArt';
import { normalMapFrom } from '../core/pixel';
import { loadCanvas, maskToGlow, missingImage } from '../shared/images';
import type { PropCatalog } from '../world/props';
import type { CharacterAnimLayout, CharacterDef, CharacterModel, CharacterPalette, CustomWornBody, PropDef, WeaponSpriteDef, WeaponSpriteManifest } from '../world/types';

import { WEAPON_MANIFEST_PATH as WEAPON_MANIFEST } from '../game/combat/weaponSprites';
import { cutIcon, weaponIconRect } from '../art/weaponIcon';
import { weaponMaskCanvas } from './weaponMask';
import { completeLayout } from './sheetCheck';
import { type BakedModel, bakeModel, modelExt, parseModel } from './models';
import { type LoadedCharModel, type ModelStyle, loadCharacterModel, renderCharacterPicture } from './characterModel';
import { patchAreaTint } from './areaTint';
import { linearColor, makeTexture, registerNormalMap } from './textures';

export const PIXELS_PER_TILE = 16;
const SPRITE_NORMAL = new THREE.Vector3(0, 1, 0.35).normalize();

export interface SpriteAsset {
  map: THREE.Texture;
  material: THREE.MeshStandardMaterial;
  geometry: THREE.BufferGeometry;
  castShadow: boolean;
  depthMaterial: THREE.MeshDepthMaterial;
  distanceMaterial: THREE.MeshDistanceMaterial;
  /**
   * An animated sheet (LPC layout): its animations and pixel size. These share one texture between every character
   * wearing the sheet, so each gets its own geometry and picks frames through its UVs (not the texture offset).
   */
  anim?: { layout: CharacterAnimLayout; width: number; height: number };
  /** A 3D character (render/characterModel.ts): drawn instead of the sheet, which stays as the fallback. */
  rigged?: { model: LoadedCharModel; def: CharacterModel; style: ModelStyle };
}

/** Pixels per tile for animated (LPC) sheets: a 64 × 64 frame covers 2 × 2 tiles. */
export const ANIM_PIXELS_PER_TILE = 32;

export interface SpriteOpts {
  /** Size in tiles. Defaults to the canvas (or frame) size at 16 px per tile. */
  w?: number;
  h?: number;
  /** For sprite sheets: the size of one frame in pixels. */
  frameW?: number;
  frameH?: number;
  /** Generated normal map: strength and rounding distance (px). */
  normalStrength?: number;
  maxD?: number;
  /** Use this normal map instead of generating one. */
  normal?: HTMLCanvasElement;
  /** Night-glow mask (white glows). */
  glow?: HTMLCanvasElement;
  glowColor?: string;
  filter?: 'point' | 'smooth';
  castShadow?: boolean;
}

/** Upright quad with its origin at the bottom centre, and up-tilted normals. */
export function spriteGeometry(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, SPRITE_NORMAL.x, SPRITE_NORMAL.y, SPRITE_NORMAL.z);
  return g;
}

/** Materials whose glow mask lights up at night. */
const glowMaterials: THREE.MeshStandardMaterial[] = [];
/** 0 = day (no glow) … 1 = full glow. */
export function setSpriteGlow(amount: number): void {
  for (const m of glowMaterials) m.emissiveIntensity = amount * (m.userData.glowStrength as number);
  lastGlow = amount;
}
let lastGlow = 0;

/** Make a material's `mask` (white = glows) light up at night with the sprites (building windows). */
export function registerGlow(material: THREE.MeshStandardMaterial, mask: HTMLCanvasElement | THREE.Texture, color: string, strength = 2.2): void {
  material.emissiveMap = typeof HTMLCanvasElement !== 'undefined' && mask instanceof HTMLCanvasElement ? makeTexture(maskToGlow(mask), { mip: true }) : (mask as THREE.Texture);
  material.emissive = linearColor(color);
  material.userData.glowStrength = strength;
  material.emissiveIntensity = lastGlow * strength;
  glowMaterials.push(material);
}

/** Forget a material that's being thrown away (map change). */
export function unregisterGlow(material: THREE.Material): void {
  const i = glowMaterials.indexOf(material as THREE.MeshStandardMaterial);
  if (i >= 0) glowMaterials.splice(i, 1);
}

export function createSpriteAsset(canvas: HTMLCanvasElement, o: SpriteOpts = {}): SpriteAsset {
  const smooth = o.filter === 'smooth';
  const map = makeTexture(canvas, { mip: smooth });
  if (smooth) map.magFilter = THREE.LinearFilter;
  const nmCanvas = o.normal ?? normalMapFrom(canvas, { sprite: true, strength: o.normalStrength ?? 2.5, maxD: o.maxD ?? 4 });
  const nm = makeTexture(nmCanvas, { linear: true, mip: smooth });
  if (smooth) nm.magFilter = THREE.LinearFilter;
  const material = patchLean(patchAreaTint(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }), false));
  registerNormalMap(material, nm);
  if (o.glow) {
    const gm = makeTexture(maskToGlow(o.glow), { mip: smooth });
    material.emissiveMap = gm;
    material.emissive = linearColor(o.glowColor ?? '#ffc86b');
    material.emissiveIntensity = 0;
    material.userData.glowStrength = 2.2; // above 1 so lit windows bloom
    glowMaterials.push(material);
  }
  const w = o.w ?? (o.frameW ?? canvas.width) / PIXELS_PER_TILE;
  const h = o.h ?? (o.frameH ?? canvas.height) / PIXELS_PER_TILE;
  return {
    map,
    material,
    geometry: spriteGeometry(w, h),
    castShadow: o.castShadow !== false,
    depthMaterial: patchLean(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5, side: THREE.DoubleSide })),
    distanceMaterial: patchLean(new THREE.MeshDistanceMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide })),
  };
}

/** Apply alpha-cut shadow casting/receiving to a mesh built from a sprite asset. */
export function withSpriteShadows<T extends THREE.Mesh>(mesh: T, a: SpriteAsset): T {
  mesh.castShadow = a.castShadow;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = a.depthMaterial;
  mesh.customDistanceMaterial = a.distanceMaterial;
  return mesh;
}

/** Tuning for the generated normal maps of the built-in art. */
const BUILTIN_OPTS: Record<string, SpriteOpts> = {
  oak: { maxD: 6 },
  pine: { maxD: 5 },
  rock: { normalStrength: 3 },
  pebble: { normalStrength: 3 },
  tuft: { maxD: 2 },
  flowers: { maxD: 2 },
};

/** Images loaded for one imported prop. */
interface LoadedImages { image: HTMLCanvasElement; normal?: HTMLCanvasElement; glow?: HTMLCanvasElement }

/** Builds sprite assets for props on first use and caches them. */
export class SpriteLibrary {
  private readonly cache = new Map<string, SpriteAsset>();
  private readonly images = new Map<string, LoadedImages>();
  /** Imported character sheets by path. */
  private readonly sheets = new Map<string, HTMLCanvasElement>();
  /** Flat enemy pictures (scaled down if huge), and their normal maps (made once). */
  private readonly flats = new Map<string, { image: HTMLCanvasElement; normal: HTMLCanvasElement | null }>();

  /** Load the flat enemy pictures in use. */
  async preloadFlats(paths: Iterable<string>, resolve: (path: string) => string): Promise<void> {
    await Promise.all([...new Set(paths)].filter((p) => !this.flats.has(p)).map(async (p) => {
      try {
        let img = await loadCanvas(resolve(p));
        // A big drawing is shrunk to at most 256 px tall: plenty on screen, and quick to light.
        if (img.height > 256) {
          const c = document.createElement('canvas'), k = 256 / img.height;
          c.width = Math.max(1, Math.round(img.width * k)); c.height = 256;
          const g = c.getContext('2d')!;
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, c.width, c.height);
          img = c;
        }
        this.flats.set(p, { image: img, normal: null });
      } catch { this.problems.push(`Enemy picture “${p}” is missing`); }
    }));
  }

  /** A flat enemy picture as a sprite, `height` tiles tall (null when it didn't load). Each call has its own material. */
  flat(path: string, height: number): SpriteAsset | null {
    const f = this.flats.get(path);
    if (!f) return null;
    const h = Math.max(0.2, height), w = h * f.image.width / f.image.height, ppt = f.image.height / h;
    f.normal ??= normalMapFrom(f.image, { sprite: true, strength: 2.2, maxD: Math.max(2, Math.round(ppt / 10)) });
    return createSpriteAsset(f.image, { w, h, normal: f.normal, filter: ppt > 48 ? 'smooth' : 'point' });
  }
  /** Textures for animated sheets, shared by every character wearing them. */
  private readonly animBases = new Map<string, { map: THREE.Texture; normal: THREE.Texture }>();
  /** LPC weapon sprites: the list (assets/weapons/weapons.json), the loaded sheets and their textures. */
  private readonly weaponDefs = new Map<string, WeaponSpriteDef>();
  private readonly weaponSheets = new Map<string, HTMLCanvasElement>();
  private readonly weaponTex = new Map<string, THREE.Texture>();
  private weaponManifest: Pick<WeaponSpriteManifest, 'thumbSize' | 'thumbCols'> = { thumbSize: 64, thumbCols: 16 };
  private weaponThumbs: HTMLCanvasElement | null = null;
  private readonly weaponIcons = new Map<string, HTMLCanvasElement>();
  private readonly weaponMasks = new Map<string, THREE.Texture>();
  /** Problems found while loading (missing files); shown as warnings. */
  readonly problems: string[] = [];

  constructor(readonly catalog: PropCatalog) {}

  /** Load the images of every imported prop. `resolve` turns a stored path into a URL. */
  async preload(resolve: (path: string) => string): Promise<void> {
    const jobs = this.catalog.all().filter((d) => d.image).map(async (d) => {
      const load = async (path: string | undefined, what: string) => {
        if (!path) return undefined;
        try { return await loadCanvas(resolve(path)); }
        catch { this.problems.push(`${d.name}: ${what} “${path}” is missing`); return undefined; }
      };
      const [image, normal, glow] = await Promise.all([load(d.image, 'image'), load(d.normal, 'normal map'), load(d.glow, 'glow mask')]);
      this.images.set(d.id, { image: image ?? missingImage(d.w * 16, d.h * 16), normal, glow });
    });
    // 3D props: each model read and fitted to its footprint once.
    const models = this.catalog.all().filter((d) => d.model).map(async (d) => {
      try { this.models.set(d.id, await loadModel(d, resolve(d.model!))); }
      catch (e) { this.problems.push(`${d.name}: model “${d.model}” couldn’t be loaded (${e instanceof Error ? e.message : String(e)})`); }
    });
    await Promise.all([...jobs, ...models]);
  }

  /** 3D props, fitted to their footprints (see render/models.ts). */
  private readonly models = new Map<string, BakedModel>();
  /** A prop's 3D model, when it has one and it loaded. */
  model(id: string): BakedModel | undefined { return this.models.get(id); }
  /** Use this model for a prop (the editor, after importing one). */
  setModel(id: string, m: BakedModel | undefined): void { if (m) this.models.set(id, m); else this.models.delete(id); }

  /** How 3D characters are drawn (Database → Characters → 3D characters). */
  modelStyle: ModelStyle = { look: 'lod', outline: true };
  /** 3D characters' models, by their file (and extra files). */
  private readonly charModels = new Map<string, LoadedCharModel>();
  private static modelKey(m: CharacterModel): string { return [m.file, ...(m.extra ?? [])].join('|'); }
  /** A character's loaded 3D model (undefined: none, or it didn't load). */
  charModel(def: CharacterDef | undefined): LoadedCharModel | undefined { return def?.model ? this.charModels.get(SpriteLibrary.modelKey(def.model)) : undefined; }
  /** Use this loaded model for a character model's files (the editor's preview, after loading one). */
  setCharModel(m: CharacterModel, loaded: LoadedCharModel): void { this.charModels.set(SpriteLibrary.modelKey(m), loaded); }

  /** Load the imported character sheets (Database → Characters), and their 3D models. */
  async preloadCharacters(chars: Record<string, CharacterDef>, resolve: (path: string) => string): Promise<void> {
    await Promise.all(Object.values(chars).filter((c) => c.model?.file && !this.charModels.has(SpriteLibrary.modelKey(c.model))).map(async (c) => {
      try {
        const m = await loadCharacterModel(c.model!, async (p) => { const r = await fetch(resolve(p)); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.arrayBuffer(); });
        this.charModels.set(SpriteLibrary.modelKey(c.model!), m);
      } catch (e) { this.problems.push(`${c.name}: 3D model “${c.model!.file}” couldn’t be loaded (${e instanceof Error ? e.message : String(e)})`); }
    }));
    await Promise.all(Object.values(chars).filter((c) => c.sheet && !this.sheets.has(c.sheet)).map(async (c) => {
      try { this.sheets.set(c.sheet!, await loadCanvas(resolve(c.sheet!))); }
      catch { this.problems.push(`${c.name}: character sheet “${c.sheet}” is missing`); }
    }));
  }

  /** A character's own sprite asset: its imported sheet, else its palette over the built-in look. */
  forCharacter(def: CharacterDef | undefined): SpriteAsset {
    const model = this.charModel(def);
    if (model && def?.model) return { ...this.forCharacter({ ...def, model: undefined }), rigged: { model, def: def.model, style: this.modelStyle } };
    let sheet = def?.sheet ? this.sheets.get(def.sheet) : undefined;
    // Worn items' looks drawn over the sheet (Update 114): its own sheet key per outfit.
    let sheetKey = def?.sheet ?? '';
    if (sheet && def?.anim && def.wornLayers?.length) {
      const layers = def.wornLayers.filter((l) => this.sheets.has(l.sheet));
      if (layers.length) {
        sheetKey = `${def.sheet}|${layers.map((l) => `${l.sheet}~${l.tint ?? ''}~${l.under ? 'u' : ''}~${l.recolor?.map((p) => p[1]).join('') ?? ''}`).join('|')}`;
        sheet = this.wornSheet(sheetKey, sheet, def.anim, layers);
      }
    }
    if (sheet && def?.anim) {
      // A battle idle picked from one row (Update 111): its own animation, looped in battle.
      const bi = def.battleIdle;
      return this.animated(sheetKey, sheet, def.anim, bi?.frames.length ? { battle_idle: { row: bi.row, frames: Math.max(...bi.frames) + 1, dirs: 1, cycle: bi.frames, ms: bi.ms ?? 260 } } : undefined);
    }
    if (sheet) return this.sheet(sheet);
    return this.character(def?.palette ?? DEFAULT_PALETTE);
  }

  /** A character's sheet with worn items' clothes-only sheets drawn over it, animation for animation (cached). */
  private readonly wornSheets = new Map<string, HTMLCanvasElement>();
  private wornSheet(key: string, base: HTMLCanvasElement, layout: CharacterAnimLayout, layers: { sheet: string; anim: CharacterAnimLayout; tint?: string; under?: boolean; recolor?: [string, string][] }[]): HTMLCanvasElement {
    const hit = this.wornSheets.get(key);
    if (hit) return hit;
    const out = document.createElement('canvas');
    out.width = base.width; out.height = base.height;
    const g = out.getContext('2d')!;
    const f = layout.frame;
    // Pieces behind the body (a cape's back) first, then the hero's own sheet, then everything worn over it.
    const ordered = [...layers.filter((l) => l.under), null, ...layers.filter((l) => !l.under)];
    for (const l of ordered) {
      if (!l) { g.drawImage(base, 0, 0); continue; }
      let src = this.sheets.get(l.sheet)!;
      // Built-in clothing's colour swatch (Update 128): its colours swapped for the palette's.
      if (l.recolor?.length) src = recolorCanvas(src, l.recolor);
      if (l.tint) {
        // Tinted: the clothes multiplied by the colour (their shading kept), cut back to their own shape.
        const t = document.createElement('canvas'); t.width = src.width; t.height = src.height;
        const tg = t.getContext('2d')!;
        tg.drawImage(src, 0, 0);
        tg.globalCompositeOperation = 'multiply'; tg.fillStyle = l.tint; tg.fillRect(0, 0, t.width, t.height);
        tg.globalCompositeOperation = 'destination-in'; tg.drawImage(src, 0, 0);
        src = t;
      }
      const lf = l.anim.frame || f;
      // Each of the hero's animations takes the same one from the clothes, row for row and frame for frame.
      for (const [name, a] of Object.entries(layout.anims)) {
        const b = l.anim.anims[name];
        if (!b) continue;
        const rows = Math.min(a.dirs, b.dirs), cols = Math.min(a.frames, b.frames);
        for (let r = 0; r < rows; r++) g.drawImage(src, 0, (b.row + r) * lf, cols * lf, lf, 0, (a.row + r) * f, cols * f, f);
      }
    }
    this.wornSheets.set(key, out);
    return out;
  }

  /**
   * A custom worn sprite (Update 134) built for a hero's sheet: the pictures placed in every frame of their direction,
   * bobbing with the hero. Kept as a sheet under `key` (returned), or null when the hero's sheet isn't loaded.
   */
  customWorn(key: string, sheetPath: string, layout: CharacterAnimLayout, cfg: CustomWornBody): string | null {
    if (this.sheets.has(key)) return key;
    const base = this.sheets.get(sheetPath);
    if (!base) return null;
    const pic = (src: string) => (src.startsWith('icon:') ? builtinIcon(src.slice(5)) : this.sheets.get(src));
    this.sheets.set(key, buildCustomWorn(base, layout, cfg, pic));
    return key;
  }

  /** Load the worn looks of items (Update 114): their clothes-only sheets. */
  async preloadWorn(items: { worn?: { masc?: string; femme?: string } }[], resolve: (path: string) => string, more: string[] = []): Promise<void> {
    const paths = new Set<string>(more.filter((p) => !this.sheets.has(p)));
    for (const d of items) for (const p of [d.worn?.masc, d.worn?.femme]) if (p && !this.sheets.has(p)) paths.add(p);
    await Promise.all([...paths].map(async (p) => {
      try { this.sheets.set(p, await loadCanvas(resolve(p))); }
      catch { this.problems.push(`A worn look “${p}” is missing`); }
    }));
  }

  private readonly standing = new Map<string, HTMLCanvasElement>();

  /** Forget the cut-out pictures (standing frames, portraits): a hero's look changed (a new form). */
  clearPictures(): void { this.standing.clear(); this.portraits.clear(); }

  /**
   * A character's whole standing frame facing `dir` (for turn-based battles), trimmed to what's drawn and scaled
   * up `scale` times with sharp pixels. `key` caches it.
   */
  standingFrame(key: string, def: CharacterDef | undefined, dir: 'down' | 'left' | 'right' | 'up', scale = 3): HTMLCanvasElement {
    const k = `${key}|${dir}|${scale}`;
    const hit = this.standing.get(k);
    if (hit) return hit;
    // A 3D character: the model in its Idle pose, rendered.
    const model = this.charModel(def);
    if (model && def?.model) {
      const pic = renderCharacterPicture(model, def.model, this.modelStyle, dir, 'full', (scale || 2) * 56);
      this.standing.set(k, pic);
      return pic;
    }
    const sheet = (def?.sheet ? this.sheets.get(def.sheet) : undefined) ?? characterSheet(def?.palette ?? DEFAULT_PALETTE);
    let fx: number, fy: number, fw: number, fh: number;
    if (def?.sheet && def.anim && this.sheets.has(def.sheet)) {
      const L = this.completeLayout(def.sheet, sheet, def.anim), a = L.anims.idle ?? L.anims.walk ?? Object.values(L.anims)[0];
      fw = fh = L.frame; fx = 0;
      fy = ((a?.row ?? 0) + (a?.dirs === 4 ? Math.max(0, L.dirs.indexOf(dir)) : 0)) * L.frame;
    } else {
      // RPG Maker layout: 3 across (the middle one stands), rows down, left, right, up.
      fw = Math.floor(sheet.width / 3); fh = Math.floor(sheet.height / 4); fx = fw;
      fy = ['down', 'left', 'right', 'up'].indexOf(dir) * fh;
    }
    // 0: about 110 pixels for a frame (people come out roughly the same size whatever their sheet's resolution).
    const out = SpriteLibrary.trimmed(sheet, fx, fy, fw, fh, scale || Math.max(1, Math.round(110 / fh)));
    this.standing.set(k, out);
    return out;
  }

  /** A sheet's frame (or a picture) cut to what's drawn, scaled `scale` times with sharp pixels. */
  static trimmed(src: HTMLCanvasElement, fx: number, fy: number, fw: number, fh: number, scale: number): HTMLCanvasElement {
    const g = src.getContext('2d', { willReadFrequently: true })!, px = g.getImageData(fx, fy, fw, fh).data;
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (px[(y * fw + x) * 4 + 3] > 10) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) { x0 = 0; y0 = 0; x1 = fw - 1; y1 = fh - 1; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * scale)); out.height = Math.max(1, Math.round(h * scale));
    const o = out.getContext('2d')!;
    o.imageSmoothingEnabled = scale < 1;
    o.drawImage(src, fx + x0, fy + y0, w, h, 0, 0, out.width, out.height);
    return out;
  }

  /** A flat enemy picture as loaded (null when it didn't load). */
  flatImage(path: string): HTMLCanvasElement | null { return this.flats.get(path)?.image ?? null; }

  private readonly portraits = new Map<string, HTMLCanvasElement>();

  /**
   * A character's head and shoulders, cut from the front-facing standing frame of their sheet (for menus).
   * `key` caches it (the character's id).
   */
  portrait(key: string, def: CharacterDef | undefined, size = 48): HTMLCanvasElement {
    const k = `${key}|${size}`;
    let out = this.portraits.get(k);
    if (out) return out;
    const model = this.charModel(def);
    if (model && def?.model) {
      const head = renderCharacterPicture(model, def.model, this.modelStyle, 'down', 'head', size);
      out = document.createElement('canvas');
      out.width = out.height = size;
      out.getContext('2d')!.drawImage(head, Math.round((size - head.width) / 2), 0);
      this.portraits.set(k, out);
      return out;
    }
    const sheet = (def?.sheet ? this.sheets.get(def.sheet) : undefined) ?? characterSheet(def?.palette ?? DEFAULT_PALETTE);
    // The front-facing frame: LPC sheets by their layout (the walk's down row, first frame); others 3 × 4 (middle of row 0).
    let fx = 0, fy = 0, fw: number, fh: number;
    if (def?.sheet && def.anim && this.sheets.has(def.sheet)) {
      const L = def.anim, a = L.anims.walk ?? L.anims.idle ?? Object.values(L.anims)[0];
      fw = fh = L.frame;
      fy = ((a?.row ?? 0) + (a?.dirs === 4 ? Math.max(0, L.dirs.indexOf('down')) : 0)) * L.frame;
    } else {
      fw = Math.floor(sheet.width / 3); fh = Math.floor(sheet.height / 4); fx = fw;
    }
    // From the top of the head down: a square about the width of the head.
    const g = sheet.getContext('2d', { willReadFrequently: true })!, px = g.getImageData(fx, fy, fw, fh).data;
    let top = 0, minX = fw, maxX = 0;
    for (let y = 0; y < fh && !top; y++) for (let x = 0; x < fw; x++) if (px[(y * fw + x) * 4 + 3] > 20) { top = y; break; }
    for (let y = top; y < Math.min(fh, top + Math.round(fh * 0.25)); y++) for (let x = 0; x < fw; x++) if (px[(y * fw + x) * 4 + 3] > 20) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    const side = Math.max(8, Math.round((maxX - minX + 1) * 1.35)), cx = maxX >= minX ? (minX + maxX + 1) / 2 : fw / 2;
    const sx = Math.round(fx + cx - side / 2), sy = Math.max(fy, fy + top - 1);
    out = document.createElement('canvas');
    out.width = out.height = size;
    const o = out.getContext('2d')!;
    o.imageSmoothingEnabled = false;
    o.drawImage(sheet, sx, sy, side, side, 0, 0, size, size);
    this.portraits.set(k, out);
    return out;
  }

  def(id: string): PropDef | undefined {
    return this.catalog.get(id);
  }

  get(id: string): SpriteAsset {
    let a = this.cache.get(id);
    if (a) return a;
    const d = this.catalog.get(id);
    let picture: HTMLCanvasElement | null = null;
    if (!d) {
      // Unknown prop type (deleted from the catalog): show the "missing" chequerboard, one tile big.
      if (!this.problems.some((p) => p.includes(`“${id}”`))) this.problems.push(`Unknown prop “${id}”`);
      a = createSpriteAsset(missingImage(16, 16), { w: 1, h: 1 });
    } else if (d.builtin) {
      const art = (picture = PLACEHOLDER_SPRITES[d.builtin]());
      // The pickup sparkle glows by itself so it can be found in the dark.
      const glow = d.builtin === 'sparkle' ? art : undefined;
      a = createSpriteAsset(art, { ...BUILTIN_OPTS[d.builtin], w: d.w, h: d.h, castShadow: d.castShadow, glow, glowColor: '#ffe9a0' });
    } else {
      const img = this.images.get(d.id) ?? { image: missingImage(d.w * 16, d.h * 16) };
      picture = img.image;
      a = createSpriteAsset(img.image, {
        w: d.w, h: d.h, normal: img.normal, glow: img.glow, glowColor: d.glowColor,
        filter: d.filter, castShadow: d.castShadow,
        // Generated normal maps for imported art scale their rounding with the image resolution.
        maxD: Math.max(3, Math.round((img.image.width / Math.max(1, d.w)) / 4)),
      });
    }
    // A block, or crossing cards, instead of the flat card.
    const shaped = d && picture ? shapeGeometry(picture, d, SPRITE_NORMAL) : null;
    if (shaped) { a.geometry.dispose(); a.geometry = shaped; }
    // Props flat on a wall don't lean back with the camera (they'd sink into the rock).
    if (d?.wall || d?.noTilt) for (const m of [a.material, a.depthMaterial, a.distanceMaterial]) if (m) m.userData.noLean = true;
    // Not drawn in front of tiles (tall platforms whose legs would show through the cliff in front of them).
    if (d?.frontOfTiles === false) a.material.userData.hdBack = true;
    // Trees, bushes and grass sway in the wind (the shadow too).
    if (d?.sway) for (const m of [a.material, a.depthMaterial, a.distanceMaterial]) patchSway(m, d.sway);
    this.cache.set(id, a);
    return a;
  }

  /**
   * An animated (LPC) sheet for one character: textures shared with every other character on the same sheet, its own
   * material (so a hurt flash stays its own) and its own geometry (the frame is chosen by UVs).
   */
  /** A sheet's layout without the animations drawn missing some of the character's clothes (worked out once). */
  completeLayout(key: string, canvas: HTMLCanvasElement, layout: CharacterAnimLayout): CharacterAnimLayout {
    let l = this.layouts.get(key);
    if (l && l.src === layout) return l.out;
    let out = layout;
    try {
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (g) out = completeLayout(g.getImageData(0, 0, canvas.width, canvas.height), layout);
    } catch { /* unreadable: use it as it is */ }
    this.layouts.set(key, (l = { src: layout, out }));
    return l.out;
  }
  private readonly layouts = new Map<string, { src: CharacterAnimLayout; out: CharacterAnimLayout }>();

  /**
   * Riding (Update 110): LPC sheets get a "ride" animation made from their combat stance (sheet rows 18–21 counting
   * from 1), with the leg on the far side of the horse erased (the owner's marked-up sheet, Oct 24): four rows added
   * below the sheet. Sheets with their own "ride" keep it.
   */
  private withRide(key: string, canvas: HTMLCanvasElement, layout: CharacterAnimLayout): { canvas: HTMLCanvasElement; layout: CharacterAnimLayout } {
    const src = layout.anims.combat_idle;
    if (layout.anims.ride || !src || src.dirs !== 4) return { canvas, layout };
    const hit = this.rideSheets.get(key);
    if (hit && hit.src === canvas && hit.from === layout) return hit.out;
    const f = layout.frame, rows = Math.ceil(canvas.height / f), k = f / 64;
    const out = document.createElement('canvas');
    out.width = canvas.width; out.height = (rows + 4) * f;
    const g = out.getContext('2d')!;
    g.drawImage(canvas, 0, 0);
    // Erased per facing (in 64-pixel frame units): the far leg, hidden behind the horse.
    const ERASE: Record<string, [number, number, number, number]> = { up: [13, 52, 35, 64], left: [13, 48, 33, 64], down: [11, 47, 36, 64], right: [34, 48, 58, 64] };
    layout.dirs.forEach((dir, i) => {
      const y = (rows + i) * f;
      g.drawImage(canvas, 0, (src.row + i) * f, canvas.width, f, 0, y, canvas.width, f);
      const e = ERASE[dir];
      if (e) for (let c = 0; c < src.frames; c++) g.clearRect(c * f + e[0] * k, y + e[1] * k, (e[2] - e[0]) * k, (e[3] - e[1]) * k);
    });
    const res = { canvas: out, layout: { ...layout, anims: { ...layout.anims, ride: { ...src, row: rows } } } };
    this.rideSheets.set(key, { src: canvas, from: layout, out: res });
    return res;
  }
  private readonly rideSheets = new Map<string, { src: HTMLCanvasElement; from: CharacterAnimLayout; out: { canvas: HTMLCanvasElement; layout: CharacterAnimLayout } }>();

  animated(key: string, canvas: HTMLCanvasElement, layout: CharacterAnimLayout, extra?: Record<string, import('../world/types').SheetAnim>): SpriteAsset {
    layout = this.completeLayout(key, canvas, layout);
    ({ canvas, layout } = this.withRide(key, canvas, layout));
    if (extra) layout = { ...layout, anims: { ...layout.anims, ...extra } };
    let base = this.animBases.get(key);
    if (!base) {
      const map = makeTexture(canvas, {});
      const normal = makeTexture(normalMapFrom(canvas, { sprite: true, strength: 2, maxD: 6 }), { linear: true });
      base = { map, normal };
      this.animBases.set(key, base);
    }
    const f = layout.frame, size = f / ANIM_PIXELS_PER_TILE;
    const material = patchLean(patchAreaTint(new THREE.MeshStandardMaterial({ map: base.map, alphaTest: 0.5, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }), false));
    registerNormalMap(material, base.normal);
    const geometry = spriteGeometry(size, size);
    // LPC feet stand 2 pixels above the bottom of the frame.
    geometry.translate(0, -(f / 32) / ANIM_PIXELS_PER_TILE, 0);
    return {
      map: base.map, material, geometry, castShadow: true,
      depthMaterial: patchLean(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: base.map, alphaTest: 0.5, side: THREE.DoubleSide })),
      distanceMaterial: patchLean(new THREE.MeshDistanceMaterial({ map: base.map, alphaTest: 0.5, side: THREE.DoubleSide })),
      anim: { layout, width: canvas.width, height: canvas.height },
    };
  }

  /** GPU resources the library keeps for reuse across maps (not to be disposed on a map change). */
  shared(): Set<unknown> {
    const out = new Set<unknown>();
    for (const b of this.animBases.values()) { out.add(b.map); out.add(b.normal); }
    for (const t of this.weaponTex.values()) out.add(t);
    for (const t of this.weaponMasks.values()) out.add(t);
    for (const a of this.cache.values()) {
      out.add(a.map); out.add(a.material); out.add(a.geometry); out.add(a.depthMaterial); out.add(a.distanceMaterial);
      for (const v of Object.values(a.material)) if ((v as THREE.Texture | null)?.isTexture) out.add(v);
      if (a.material.userData.normalMap) out.add(a.material.userData.normalMap);
    }
    return out;
  }

  /**
   * Load the LPC weapon list and the sheets of the weapons in `ids` (the ones items and enemies use). Without the
   * list (an older project), weapons keep their icons.
   */
  async preloadWeapons(ids: Iterable<string>, resolve: (path: string) => string, custom: WeaponSpriteDef[] = [], icons: Iterable<string> = []): Promise<void> {
    if (!this.weaponDefs.size) {
      try {
        const r = await fetch(resolve(WEAPON_MANIFEST));
        if (r.ok) {
          const m = (await r.json()) as WeaponSpriteManifest;
          this.weaponManifest = { thumbSize: m.thumbSize, thumbCols: m.thumbCols };
          for (const d of m.weapons) this.weaponDefs.set(d.id, d);
        }
      } catch { /* no weapon sprites in this project */ }
    }
    // Looks made in the weapon builder (Database.weaponSprites).
    for (const d of custom) this.weaponDefs.set(d.id, d);
    // Icons cut from the sprites: built-in ones from thumbs.png, made ones from their own sheet (loaded below).
    const iconIds = [...new Set(icons)].filter((id) => id && this.weaponDefs.has(id));
    if (!this.weaponThumbs && iconIds.some((id) => !this.weaponDefs.get(id)!.icon)) {
      try { this.weaponThumbs = await loadCanvas(resolve(WEAPON_MANIFEST.replace('weapons.json', 'thumbs.png'))); } catch { /* icons fall back */ }
    }
    ids = [...ids, ...iconIds.filter((id) => this.weaponDefs.get(id)!.icon)];
    await Promise.all([...new Set(ids)].filter((id) => id && !this.weaponSheets.has(id)).map(async (id) => {
      const d = this.weaponDefs.get(id);
      if (!d) { if (this.weaponDefs.size) this.problems.push(`Unknown weapon sprite “${id}”`); return; }
      try { this.weaponSheets.set(id, await loadCanvas(resolve(d.file))); }
      catch { this.problems.push(`${d.name}: weapon sheet “${d.file}” is missing`); }
    }));
  }

  /** A loaded weapon sprite and its texture (shared by everyone carrying it), or null. */
  weapon(id: string | undefined): { def: WeaponSpriteDef; map: THREE.Texture } | null {
    if (!id) return null;
    const def = this.weaponDefs.get(id), sheet = this.weaponSheets.get(id);
    if (!def || !sheet) return null;
    let map = this.weaponTex.get(id);
    if (!map) { map = makeTexture(sheet, {}); this.weaponTex.set(id, map); }
    return { def, map };
  }

  /** A weapon sheet's soft silhouette (for glows and swing trails), made the first time it's needed. */
  weaponMask(id: string): THREE.Texture | null {
    let t = this.weaponMasks.get(id);
    if (t) return t;
    const sheet = this.weaponSheets.get(id);
    if (!sheet) return null;
    t = new THREE.CanvasTexture(weaponMaskCanvas(sheet));
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    this.weaponMasks.set(id, t);
    return t;
  }

  /** The icon cut from a weapon sprite (null if it isn't loaded or has none). */
  weaponIcon(id: string | undefined): HTMLCanvasElement | null {
    if (!id) return null;
    const hit = this.weaponIcons.get(id);
    if (hit) return hit;
    const def = this.weaponDefs.get(id);
    if (!def) return null;
    const r = weaponIconRect(def, this.weaponManifest);
    const src = r.inSheet ? this.weaponSheets.get(id) : this.weaponThumbs;
    if (!src) return null;
    const c = cutIcon(src, r);
    this.weaponIcons.set(id, c);
    return c;
  }

  /** Every weapon sprite in the list (loaded or not). */
  weaponDef(id: string): WeaponSpriteDef | undefined { return this.weaponDefs.get(id); }

  /** Characters get their own asset each, because each one animates its own texture frame. */
  character(palette: CharacterPalette): SpriteAsset {
    return this.sheet(characterSheet(palette));
  }

  /**
   * A sprite sheet in the character layout (3 frames × 4 directions); each call makes its own copy to animate.
   * Any frame size works: characters are always 1.5 tiles tall (a 16 × 24 frame is one pixel per texel, a
   * 32 × 48 frame just has finer detail).
   */
  sheet(canvas: HTMLCanvasElement): SpriteAsset {
    const fw = canvas.width / 3, fh = canvas.height / 4;
    const a = createSpriteAsset(canvas, { maxD: Math.max(3, Math.round(3 * fh / 24)), normalStrength: 2, frameW: fw, frameH: fh, w: 1.5 * fw / fh, h: 1.5 });
    a.map.repeat.set(1 / 3, 1 / 4);
    return a;
  }
}

/** Read a prop's model file and fit it to the prop's footprint. */
export async function loadModel(d: PropDef, url: string): Promise<BakedModel> {
  const ext = modelExt(d.model ?? '') ?? 'glb';
  const buf = await (await fetch(url)).arrayBuffer();
  const obj = await parseModel(buf, ext);
  return bakeModel(obj, { w: d.foot?.w ?? Math.max(1, Math.round(d.w)), d: d.foot?.d ?? 1, rot: d.modelRot, sharp: d.filter === 'point' });
}
