/**
 * A map drawn from above for the world map (Pause → Map): its ground in each tile's colour, shaded by height with a
 * cliff edge where the ground steps down, water, buildings' roofs, and trees and rocks as dots. Drawn from the map
 * itself, so the world map always matches the maps 1:1.
 */
import { TileMap } from '../world/TileMap';
import type { TileCatalog } from '../world/tiles';
import type { MapData } from '../world/types';

/** What a prop looks like from above. */
export type PropMark = 'tree' | 'pine' | 'bush' | 'rock' | 'solid' | null;

export interface MapArtStyle {
  /** The colour of a terrain tile (by its key). */
  tile(key: string): string;
  /** How a prop shows. */
  prop(type: string): PropMark;
}

const BUILTIN: Record<string, string> = { '.': '#5f9a45', '=': '#b89c68', ':': '#dcc58e', '~': '#4f6f74' };
export const builtinTileColor = (key: string): string | undefined => BUILTIN[key];

const ROOFS: Record<string, string> = { shingle: '#9a4b3a', thatch: '#b8923e', slate: '#4e5a6e', wood: '#7a5636' };

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16), f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Draw one map, `px` pixels per tile. */
export function drawMapArt(data: MapData, tiles: TileCatalog, style: MapArtStyle, px = 4): HTMLCanvasElement {
  const map = new TileMap(data, tiles);
  const w = data.width, h = data.height;
  const c = document.createElement('canvas');
  c.width = w * px; c.height = h * px;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  // Ground, lighter the higher it is; the face of a cliff where the ground steps down to the south.
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const step = map.step(x, z), base = style.tile(map.terrain(x, z));
      g.fillStyle = shade(base, Math.max(-0.45, Math.min(0.35, step * 0.045)));
      g.fillRect(x * px, z * px, px, px);
      // Grain: a pixel of darker colour here and there, like a drawn map.
      if (((x * 7 + z * 13) % 11) === 0) { g.fillStyle = shade(base, -0.15); g.fillRect(x * px + (px >> 1), z * px + (px >> 2), Math.max(1, px >> 2), Math.max(1, px >> 2)); }
      const below = z + 1 < h ? map.step(x, z + 1) : step;
      if (below < step && !map.rampAt(x, z + 1)) {
        const drop = Math.min(3, step - below);
        g.fillStyle = 'rgba(30, 22, 18, 0.55)';
        g.fillRect(x * px, (z + 1) * px - Math.max(1, Math.round(px * 0.28 * drop)), px, Math.max(1, Math.round(px * 0.28 * drop)));
      }
      if (x + 1 < w && map.step(x + 1, z) !== step && !map.rampAt(x + 1, z) && !map.rampAt(x, z)) {
        g.fillStyle = map.step(x + 1, z) < step ? 'rgba(30,22,18,0.35)' : 'rgba(255,250,230,0.18)';
        g.fillRect((x + 1) * px - 1, z * px, 1, px);
      }
    }
  // Water.
  for (let z = 0; z < h; z++)
    for (let x = 0; x < w; x++) {
      const wtr = map.waterAt(x, z);
      if (!wtr) continue;
      g.fillStyle = wtr.kind === 'deep' ? '#2b5a8c' : wtr.kind === 'swim' ? '#3f78ad' : '#6aa3c8';
      g.fillRect(x * px, z * px, px, px);
      if (((x + z * 3) % 7) === 0) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x * px, z * px + (px >> 1), Math.max(1, px >> 1), 1); }
    }
  // Buildings: their roofs, with a darker rim.
  for (const b of data.buildings ?? []) {
    const roof = ROOFS[b.roof ?? 'shingle'] ?? '#8a5a46';
    g.fillStyle = shade(roof, -0.35);
    g.fillRect(b.x * px, b.z * px, b.w * px, b.d * px);
    g.fillStyle = roof;
    g.fillRect(b.x * px + 1, b.z * px + 1, b.w * px - 2, b.d * px - 2);
    g.fillStyle = shade(roof, 0.18);
    g.fillRect(b.x * px + 1, b.z * px + 1, b.w * px - 2, Math.max(1, Math.round(b.d * px * 0.4)));
  }
  // Props: trees as round tops, pines darker, rocks grey.
  for (const p of data.props) {
    const k = style.prop(p.type);
    if (!k) continue;
    const s = p.s ?? 1, cx = p.x * px, cz = p.z * px;
    if (k === 'tree' || k === 'pine' || k === 'bush') {
      const r = (k === 'bush' ? 0.45 : 0.85) * s * px;
      g.fillStyle = k === 'pine' ? '#1f4a2c' : '#2f6a33';
      g.beginPath(); g.arc(cx, cz - r * 0.2, Math.max(1, r), 0, Math.PI * 2); g.fill();
      g.fillStyle = k === 'pine' ? '#2d6b3d' : '#4a8a3f';
      g.beginPath(); g.arc(cx - r * 0.25, cz - r * 0.45, Math.max(0.6, r * 0.45), 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = k === 'rock' ? '#8d8a84' : '#5b4a3c';
      g.fillRect(Math.round(cx - px * 0.3 * s), Math.round(cz - px * 0.3 * s), Math.max(1, Math.round(px * 0.6 * s)), Math.max(1, Math.round(px * 0.6 * s)));
    }
  }
  return c;
}

/** The average colour of an image (a tile's texture), for its colour on the world map. */
export function averageColor(img: CanvasImageSource): string {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  try { g.drawImage(img, 0, 0, 4, 4); } catch { return '#5f9a45'; }
  const d = g.getImageData(0, 0, 4, 4).data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 8) continue; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  if (!n) return '#5f9a45';
  const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(gg)}${hx(b)}`;
}

/** How a prop looks on the world map, from its name and what it does. */
export function propMark(d: { id?: string; name?: string; blocks?: boolean; season?: string } | undefined): PropMark {
  if (!d) return null;
  const n = `${d.id ?? ''} ${d.name ?? ''}`.toLowerCase();
  if (/pine|fir|spruce|conifer|evergreen/.test(n)) return 'pine';
  if (/bush|shrub|hedge|sapling/.test(n)) return 'bush';
  if (/tree|oak|maple|birch|willow|palm/.test(n)) return 'tree';
  if (/rock|stone|boulder|ore/.test(n)) return 'rock';
  if (/flower|grass|tuft|fern|mushroom|pebble|leaf|vine/.test(n)) return null;
  return d.blocks ? 'solid' : null;
}
