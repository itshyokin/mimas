/**
 * What the ground sounds like underfoot. Each tile has a footstep material: set per tile in the editor (Terrain →
 * the tile → Footsteps), or guessed from its name like the edge blending (grass, dirt and paths, stone, wood floors,
 * sand, snow, carpet, metal). Shallow water splashes whatever is under it.
 */
import type { TileDef } from './types';

export type FootMaterial = 'grass' | 'dirt' | 'stone' | 'wood' | 'sand' | 'snow' | 'water' | 'metal' | 'carpet' | 'none';
export const FOOT_MATERIALS: [FootMaterial, string][] = [
  ['grass', 'Grass, leaves'], ['dirt', 'Dirt, paths, mud'], ['stone', 'Stone, cobbles, tiles'], ['wood', 'Wood floors, bridges'],
  ['sand', 'Sand, gravel'], ['snow', 'Snow'], ['water', 'Shallow water, puddles'], ['metal', 'Metal grates'], ['carpet', 'Carpet, rugs, cloth'], ['none', 'Silent'],
];

export function guessFootstep(def: Pick<TileDef, 'id' | 'name'> | undefined): FootMaterial {
  if (!def) return 'grass';
  const n = `${def.id} ${def.name}`.toLowerCase();
  if (def.id === 'water') return 'sand'; // the built-in lake bed
  if (/carpet|rug|cloth|mat\b|wallpaper/.test(n)) return 'carpet';
  if (/metal|iron|steel|grate|grating/.test(n)) return 'metal';
  if (/plank|wood|board|deck|bridge|floor(?!.*stone)|parquet|herringbone|subfloor/.test(n)) return 'wood';
  if (/snow|ice|frost/.test(n)) return 'snow';
  if (/puddle|shallow|stream|ford|swamp|marsh/.test(n)) return 'water';
  if (/sand|beach|desert|gravel/.test(n)) return 'sand';
  if (/stone|rock|cobble|brick|tile|paving|slate|marble|granite|flagstone|cave/.test(n)) return 'stone';
  if (/dirt|soil|mud|path|earth|road|tilled|farm/.test(n)) return 'dirt';
  return 'grass';
}
