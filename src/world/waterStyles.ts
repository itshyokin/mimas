/**
 * Water styles: the kinds of water a map has (a pond, a river, the sea, lava…), shared by the game and the editor.
 * No three.js.
 */
import type { MapData, WaterStyle } from './types';

/** Ready-made styles for the Water tab's "+ New style". */
export const WATER_PRESETS: [string, WaterStyle][] = [
  ['pond', { name: 'Pond', symbol: '·', color: '#3f86b0', murk: 0.5, bumpy: 0.6 }],
  ['lake', { name: 'Lake', symbol: '-', color: '#4d6c88', murk: 0.6, bumpy: 0.4 }],
  ['river', { name: 'River', symbol: '~', color: '#3a82aa', murk: 0.4, bumpy: 1, flow: 1 }],
  ['sea', { name: 'Tropical sea', symbol: '≈', color: '#1c9cc4', murk: 0.15, bumpy: 1.2 }],
  ['muddy', { name: 'Muddy pond', symbol: ':', color: '#6b6a3c', murk: 0.85, bumpy: 0.4 }],
  ['swamp', { name: 'Swamp', symbol: '"', color: '#4f6a3a', murk: 0.9, bumpy: 0.3 }],
  ['poison', { name: 'Poison goo', symbol: '%', color: '#5e2a96', murk: 0.95, bumpy: 0.35, glow: 0.35, ailment: 'poison', chance: 30 }],
  ['lava', { name: 'Lava', symbol: '^', color: '#ff5a1a', murk: 1, bumpy: 0.5, flow: 0.12, glow: 1, ailment: 'burn', chance: 60 }],
];

/** The map's water styles: its own list, or one made from its older single water look. */
export function waterStyles(map: Pick<MapData, 'waterStyles' | 'waterLook'>): WaterStyle[] {
  if (map.waterStyles?.length) return map.waterStyles;
  const l = map.waterLook ?? {};
  return [{ name: 'Water', color: '#3f86b0', ...l }];
}

/** Marks to pick from for a style (shown on its water in the map editor only). */
export const WATER_SYMBOLS = ['', '~', '≈', '-', '=', '·', ':', '"', '^', '%', '*', '+', '×', '○', '#', '!'];

/** The style for a cell's style number (the first when it's out of range). */
export function waterStyle(map: Pick<MapData, 'waterStyles' | 'waterLook'>, i: number): WaterStyle {
  const all = waterStyles(map);
  return all[i] ?? all[0];
}

/** Whether a style is drawn toon (flat, wave lines, shore foam) rather than with lit ripples. */
export const isToonWater = (st: WaterStyle): boolean => (st.look ?? ((st.glow ?? 0) > 0 ? 'real' : 'toon')) === 'toon';
