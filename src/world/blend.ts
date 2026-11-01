/**
 * Soft tile blending: where two tiles meet, the one with the higher priority spreads a little
 * over the other, along an irregular edge. Shared by the painted ground, the imported-tile shader
 * and the editor.
 */
import type { TileBlend, TileDef } from './types';

/** Built-in priorities: grass grows over everything, the lake bed is lowest. */
const BUILTIN_PRIORITY: Record<string, number> = { '❄': 34, '.': 30, '▒': 22, '=': 20, '▦': 16, '▲': 14, ':': 10, '~': 0 };

export function defaultBlend(def: TileDef | undefined): TileBlend {
  if (!def || def.builtin) {
    return { blend: true, priority: BUILTIN_PRIORITY[def?.key ?? '.'] ?? 5, width: 0.2, roughness: 0.6, edge: 'ragged', detail: false };
  }
  return { ...guessBlend(def.name), edge: def.filter === 'smooth' ? 'smooth' : guessBlend(def.name).edge, detail: false };
}

/**
 * How an imported tile blends unless you set it (Terrain → the tile → Edge blending): judged from its name, so natural
 * ground overlaps in the usual order (grass over dirt over sand over water) with ragged edges, and built surfaces
 * (floors, walls, roofs, carpets) keep straight edges.
 */
export function guessBlend(name: string): Omit<TileBlend, 'detail'> {
  const n = name.toLowerCase();
  const natural = (priority: number, width = 0.32, roughness = 0.75) => ({ blend: true, priority, width, roughness, edge: 'ragged' as const });
  if (/floor|plank|carpet|rug|wall|brick|roof|shingle|tile|paving|wallpaper|siding|panel|stucco|drywall|subfloor|herringbone/.test(n)) {
    return { blend: false, priority: 25, width: 0.22, roughness: 0.6, edge: 'dither' };
  }
  if (/grass|snow|moss|meadow|lawn|leaves|leaf/.test(n)) return natural(32, 0.34, 0.8);
  if (/flower|clover|bush|hedge/.test(n)) return natural(31);
  if (/dirt|soil|mud|path|cobble|earth|road|tilled|gravel/.test(n)) return natural(22);
  if (/stone|rock|pebble/.test(n)) return natural(18);
  if (/sand|beach|desert/.test(n)) return natural(n.includes('warm') ? 13 : 14);
  if (/stream|shallow|ford/.test(n)) return natural(8, 0.28);
  if (/water|pond|lake|lagoon|sea|ocean|river|ice/.test(n)) return natural(n.includes('deep') ? 3 : 5, 0.28);
  return { blend: true, priority: 25, width: 0.26, roughness: 0.7, edge: 'ragged' };
}

export function resolveBlend(def: TileDef | undefined, override?: Partial<TileBlend>): TileBlend {
  const b = { ...defaultBlend(def), ...override };
  // RPG Maker-style tiles draw their own edges (Update 146).
  if (def?.kind || def?.edges) b.blend = false;
  b.width = Math.min(0.5, Math.max(0.05, b.width));
  b.roughness = Math.min(1, Math.max(0, b.roughness));
  return b;
}

/** Distance from point (u, v) to the square of cell (cx, cz), in tiles (0 inside it). */
export function cellDistance(u: number, v: number, cx: number, cz: number): number {
  const dx = Math.max(cx - u, 0, u - (cx + 1)), dz = Math.max(cz - v, 0, v - (cz + 1));
  return Math.hypot(dx, dz);
}

/** How far a tile reaches at a point: its width, varied by roughness × noise (0..1). */
export function reach(b: TileBlend, noise: number): number {
  return b.width * (1 + b.roughness * (noise * 2 - 1));
}

/** The 8 neighbour offsets. */
export const NEIGHBOURS8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
