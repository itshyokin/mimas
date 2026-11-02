/**
 * Mimas: the GBA layers of a map (Saturn's MapData.gba). Events, props, encounter zones and the rest stay
 * Saturn's; the ground the player walks on is these layers, drawn with GBA Studio tiles.
 */
import type { MapData } from '../world/types';
import type { GbaMap, GbaPlacement } from './types';

export interface GbaLayers {
  /** GBA Studio tile ids; grid values are an index into this plus one (0 = nothing). */
  tiles: string[];
  ground: number[][];
  /** Paths and water (13-piece autotiles). */
  terrain: number[][];
  /** Cliff tile per cell, and its tier (`level` k means tiers 1..k). */
  cliff: number[][];
  level: number[][];
  /** Trees, decorations, ledges, stairs, ladders, tall grass, doors. */
  objects: GbaPlacement[];
  /** RPG Maker-style overrides per cell: '.' none, 'O' walkable, 'X' blocked. */
  pass: string[];
  /** Cells the map's props block (worked out by the editor when the map is saved, for the ROM). */
  propCells?: [number, number][];
}

export function blankLayers(w: number, h: number, ground?: string): GbaLayers {
  const grid = (v = 0) => Array.from({ length: h }, () => Array<number>(w).fill(v));
  return {
    tiles: ground ? [ground] : [], ground: grid(ground ? 1 : 0), terrain: grid(), cliff: grid(), level: grid(),
    objects: [], pass: Array.from({ length: h }, () => '.'.repeat(w)),
  };
}

/** Make the layers fit the map's size (after a resize, or on a hand-edited file). */
export function fitLayers(g: GbaLayers, w: number, h: number): GbaLayers {
  const fit = (grid: number[][] | undefined, fill = 0) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => grid?.[y]?.[x] ?? fill));
  const g0 = g.ground?.[0]?.[0] ?? 0;
  return {
    tiles: g.tiles ?? [],
    ground: fit(g.ground, g0), terrain: fit(g.terrain), cliff: fit(g.cliff), level: fit(g.level),
    objects: (g.objects ?? []).filter((o) => o.x < w && o.y < h),
    pass: Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => g.pass?.[y]?.[x] ?? '.').join('')),
  };
}

/** The map as the GBA renderer (mapRender.ts) and the exporter's rules see it. */
export function gbaView(m: MapData, id = ''): GbaMap {
  const g = m.gba!;
  return { id, name: m.name, width: m.width, height: m.height, ...g };
}

export const isGbaMap = (m: MapData | undefined | null): boolean => !!m?.gba;
