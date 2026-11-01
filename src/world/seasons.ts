/**
 * Seasons: spring, summer, autumn and winter follow the in-game days (Database → Time → Seasons), unless a map has
 * its own. Outdoors, grass and leaves are recoloured with them, winter brings snow, bare trees and ice on still
 * water. No three.js, so it can be tested on its own.
 */
import type { PropDef } from './types';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_NAMES: Record<Season, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

export interface SeasonSettings {
  /** Off: no seasons (everything stays as drawn). */
  off?: boolean;
  /** In-game days each season lasts (default 7). */
  length?: number;
  /** The season a new game starts in (default spring). */
  start?: Season;
  /** 'real' (default): the real world's season, from the player's date (northern hemisphere; 'realSouth' for the southern); 'days': by in-game days. */
  mode?: 'real' | 'realSouth' | 'days';
}

/** The real world's season on a date: March–May spring, June–August summer, September–November autumn, December–February winter (flipped in the south). */
export function realSeason(date: Date, south = false): Season {
  const m = date.getMonth(), k = m >= 2 && m <= 4 ? 0 : m >= 5 && m <= 7 ? 1 : m >= 8 && m <= 10 ? 2 : 3;
  return SEASONS[south ? (k + 2) % 4 : k];
}

/** Days of the week, Sunday first (as Date.getDay counts them). */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The season on in-game day `day` (0 = the first day). */
export function seasonOn(day: number, s: SeasonSettings | undefined): Season {
  const len = Math.max(1, Math.round(s?.length ?? 7)), start = SEASONS.indexOf(s?.start ?? 'spring');
  return SEASONS[(start + Math.floor(Math.max(0, day) / len)) % 4];
}

/** How a prop changes with the seasons: its leaves recoloured (and snowy in winter), bare in winter, or not at all. */
export type PropSeason = 'leaves' | 'bare' | 'off';

/** A prop's season setting, or a guess from its name: broadleaf trees, bushes and grasses go bare; pines and flowers keep theirs. */
export function propSeason(d: Pick<PropDef, 'season' | 'name'> & { id?: string }): PropSeason {
  if (d.season) return d.season;
  const n = `${d.id ?? ''} ${d.name ?? ''}`.toLowerCase();
  // Evergreens and small plants keep their leaves (icy blue in winter): a bush that lost them would vanish entirely.
  if (/pine|fir|spruce|conifer|evergreen|cactus|palm|flower|mushroom|bush|shrub|hedge|vine|tuft|grass|fern|plant/.test(n)) return 'leaves';
  if (/tree|oak|maple|birch|sapling|leaf|willow/.test(n)) return 'bare';
  return 'off';
}
