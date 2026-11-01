/**
 * Buildings in the editor: starting presets for the Draw tool, and the top-down picture of a building on the map
 * (its roof, ridge and doors).
 */
import { LOOK_COLOR, ROOF_LOOKS, WALL_LOOKS, roofArt, wallArt } from '../art/buildingArt';
import { doorstep, resolveBuilding } from '../world/buildingShape';
import type { BuildingData } from '../world/types';
import { TS, customTileImage } from './editorArt';

export interface BuildingPreset { id: string; name: string; note: string; values: Omit<BuildingData, 'x' | 'z'> }

export const BUILDING_PRESETS: BuildingPreset[] = [
  { id: 'cottage', name: 'Cottage', note: 'Plaster and thatch, one storey.', values: { w: 4, d: 3, height: 2.5, wall: 'plaster', roof: 'thatch', roofStyle: 'gable', windows: 'few', doors: [{ side: 'front', at: 1 }] } },
  { id: 'townhouse', name: 'Townhouse', note: 'Timber frame, tall, slate roof.', values: { w: 3, d: 3, height: 4, wall: 'timber', roof: 'slate', roofStyle: 'gable', ridge: 'z', windows: 'many', doors: [{ side: 'front', at: 1 }] } },
  { id: 'stonehouse', name: 'Stone house', note: 'Sturdy walls, hipped roof.', values: { w: 5, d: 4, height: 2.5, wall: 'stone', roof: 'slate', roofStyle: 'hip', windows: 'few', doors: [{ side: 'front', at: 2 }] } },
  { id: 'shop', name: 'Shop', note: 'Brick front, wide windows.', values: { w: 5, d: 3, height: 3, wall: 'brick', roof: 'shingle', roofStyle: 'gable', windows: 'many', doors: [{ side: 'front', at: 2 }] } },
  { id: 'barn', name: 'Barn', note: 'Wide wooden roof, no windows.', values: { w: 6, d: 4, height: 3, wall: 'timber', roof: 'wood', roofStyle: 'gable', ridge: 'z', windows: 'none', doors: [{ side: 'front', at: 2 }] } },
  { id: 'tower', name: 'Tower', note: 'Tall stone tower.', values: { w: 3, d: 3, height: 6, wall: 'stone', roof: 'slate', roofStyle: 'hip', pitch: 2.5, windows: 'few', doors: [{ side: 'front', at: 1 }] } },
];

export const presetById = (id: string): BuildingPreset => BUILDING_PRESETS.find((p) => p.id === id) ?? BUILDING_PRESETS[0];

/** A new building from a preset on a rectangle (the preset's own size when none is given). The door stays centred. */
export function presetBuilding(id: string, x: number, z: number, w?: number, d?: number): BuildingData {
  const v = presetById(id).values, nw = w ?? v.w, nd = d ?? v.d;
  const b: BuildingData = { ...structuredClone(v), x, z, w: nw, d: nd };
  if (w !== undefined || d !== undefined) {
    delete b.ridge; delete b.pitch; // let the new shape choose
    b.doors = (b.doors ?? []).map((o) => ({ ...o, at: Math.floor((o.side === 'front' || o.side === 'back' ? nw : nd) / 2) - (nw % 2 === 0 && (o.side === 'front' || o.side === 'back') ? 1 : 0) }));
  }
  return b;
}

export const WALL_CHOICES: [string, string][] = WALL_LOOKS.map((k) => [k, k[0].toUpperCase() + k.slice(1)]);
export const ROOF_CHOICES: [string, string][] = ROOF_LOOKS.map((k) => [k, k[0].toUpperCase() + k.slice(1)]);

const patterns = new Map<string, CanvasPattern | null>();
function lookPattern(ctx: CanvasRenderingContext2D, kind: 'wall' | 'roof', look: string): CanvasPattern | string {
  const key = kind + ':' + look;
  if (!patterns.get(key)) {
    const builtin = (kind === 'roof' ? (ROOF_LOOKS as readonly string[]) : (WALL_LOOKS as readonly string[])).includes(look);
    const src = builtin ? (kind === 'roof' ? roofArt(look) : wallArt(look)) : customTileImage(look) ?? null;
    let pat: CanvasPattern | null = null;
    if (src) {
      // Scale the art (32 px per tile) to the editor's tile size.
      const w = (src as HTMLCanvasElement).width || 32, c = document.createElement('canvas');
      c.width = c.height = TS;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = w > TS * 2;
      g.drawImage(src, 0, 0, TS, TS);
      pat = ctx.createPattern(c, 'repeat');
    }
    patterns.set(key, pat);
  }
  return patterns.get(key) ?? LOOK_COLOR[look] ?? (kind === 'roof' ? '#7a5a4a' : '#bbb');
}

/** Forget cached looks (an imported tile changed). */
export function clearBuildingPatterns(): void { patterns.clear(); }

/**
 * Draw a building seen from above: the roof (with its overhang), shaded by slope, the ridge, and doors as notches on
 * the walls. Drawn in map pixels (TS per tile).
 */
export function drawBuildingTop(ctx: CanvasRenderingContext2D, b: BuildingData, alpha: number): void {
  const r = resolveBuilding(b), o = r.roofStyle === 'flat' ? Math.min(r.overhang, 0.15) : r.overhang;
  const x0 = (r.x - o) * TS, z0 = (r.z - o) * TS, x1 = (r.x + r.w + o) * TS, z1 = (r.z + r.d + o) * TS;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Shadow, roof fill.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x0 + 3, z0 + 4, x1 - x0, z1 - z0);
  ctx.fillStyle = lookPattern(ctx, 'roof', r.roof);
  ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
  // The front wall shows as a band below the roof's front edge, so you can tell which side faces the camera.
  ctx.fillStyle = lookPattern(ctx, 'wall', r.wall);
  ctx.fillRect(r.x * TS, z1, r.w * TS, TS * 0.3);
  // Slopes: the far and left slopes a little darker; ridge and hip lines.
  const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2;
  ctx.lineWidth = Math.max(1, TS / 16);
  ctx.strokeStyle = 'rgba(30,18,12,0.85)';
  if (r.roofStyle !== 'flat') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const half = r.ridge === 'x' ? (z1 - z0) / 2 : (x1 - x0) / 2;
    const ins = r.roofStyle === 'hip' ? Math.min(half, (r.ridge === 'x' ? x1 - x0 : z1 - z0) / 2) : 0;
    ctx.beginPath();
    if (r.ridge === 'x') {
      const ra = x0 + ins, rb = x1 - ins;
      ctx.moveTo(x0, z0); ctx.lineTo(x1, z0); ctx.lineTo(rb, zm); ctx.lineTo(ra, zm); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ra, zm); ctx.lineTo(rb, zm);
      if (ins) { ctx.moveTo(x0, z0); ctx.lineTo(ra, zm); ctx.lineTo(x0, z1); ctx.moveTo(x1, z0); ctx.lineTo(rb, zm); ctx.lineTo(x1, z1); }
    } else {
      const ra = z0 + ins, rb = z1 - ins;
      ctx.moveTo(x0, z0); ctx.lineTo(x0, z1); ctx.lineTo(xm, rb); ctx.lineTo(xm, ra); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(xm, ra); ctx.lineTo(xm, rb);
      if (ins) { ctx.moveTo(x0, z0); ctx.lineTo(xm, ra); ctx.lineTo(x1, z0); ctx.moveTo(x0, z1); ctx.lineTo(xm, rb); ctx.lineTo(x1, z1); }
    }
    ctx.stroke();
  }
  ctx.strokeRect(x0, z0, x1 - x0, z1 - z0);
  // Doors: a dark notch on the wall and a light mark on the doorstep.
  for (const door of r.doors) {
    const [sx, sz] = doorstep(r, door);
    ctx.fillStyle = '#3e2716';
    const cx = (sx + 0.5) * TS, cz = (sz + 0.5) * TS, n = TS * 0.32;
    if (door.side === 'front') ctx.fillRect(cx - n, z1 - 2, n * 2, Math.max(3, TS * 0.18) + 2);
    else if (door.side === 'back') ctx.fillRect(cx - n, z0 - Math.max(3, TS * 0.18), n * 2, Math.max(3, TS * 0.18) + 2);
    else if (door.side === 'left') ctx.fillRect(x0 - Math.max(3, TS * 0.18), cz - n, Math.max(3, TS * 0.18) + 2, n * 2);
    else ctx.fillRect(x1 - 2, cz - n, Math.max(3, TS * 0.18) + 2, n * 2);
  }
  ctx.restore();
}
