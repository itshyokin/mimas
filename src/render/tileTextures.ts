/** Textures for imported ground tiles: repeating, with point or smooth filtering, plus normal maps. */
import * as THREE from 'three';
import { normalMapFrom } from '../core/pixel';
import { loadCanvas, missingImage } from '../shared/images';
import type { TileCatalog } from '../world/tiles';
import type { TileDef } from '../world/types';

export interface TileTexture { def: TileDef; map: THREE.Texture; normal: THREE.Texture; /** Update 151: its edge trim and inside-corner pictures. */ edges?: HTMLCanvasElement; corners?: HTMLCanvasElement }

let maxAniso = 1;
export function setTileAnisotropy(n: number): void { maxAniso = n; }

function texture(canvas: HTMLCanvasElement, def: TileDef, linear: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.encoding = linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  if (def.filter === 'smooth') {
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = maxAniso;
  } else {
    // "Point": crisp pixels up close; mipmaps keep distant ground from shimmering.
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
  }
  return t;
}

/** A normal map that changes nothing (straight up). */
function flatNormal(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const g = c.getContext('2d')!; g.fillStyle = '#8080ff'; g.fillRect(0, 0, 4, 4);
  return c;
}

/** Load the textures of every imported tile. Missing files become a visible chequerboard. */
export async function loadTileTextures(catalog: TileCatalog, resolve: (path: string) => string, problems: string[]): Promise<Map<string, TileTexture>> {
  const out = new Map<string, TileTexture>();
  await Promise.all(catalog.textured().map(async (def) => {
    let img: HTMLCanvasElement;
    try { img = await loadCanvas(resolve(def.image!)); }
    catch { problems.push(`Tile ${def.name}: texture “${def.image}” is missing`); img = missingImage(32, 32); }
    let nm: HTMLCanvasElement | undefined;
    if (def.normal) {
      try { nm = await loadCanvas(resolve(def.normal)); }
      catch { problems.push(`Tile ${def.name}: normal map “${def.normal}” is missing`); }
    }
    nm ??= def.flat ? flatNormal() : normalMapFrom(img, { strength: 2, wrap: true });
    const extra = async (path: string | undefined, what: string) => {
      if (!path) return undefined;
      try { return await loadCanvas(resolve(path)); } catch { problems.push(`Tile ${def.name}: ${what} “${path}” is missing`); return undefined; }
    };
    out.set(def.key, { def, map: texture(img, def, false), normal: texture(nm, def, true), edges: await extra(def.edges, 'edges picture'), corners: await extra(def.corners, 'corners picture') });
  }));
  return out;
}
