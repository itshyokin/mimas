/**
 * Dynamic weather and temperature (Database → Weather). No three.js, so it can be tested on its own.
 *
 * Temperature: each season has a range for the morning low and one for the afternoon high (°F). Every day rolls its
 * own low and high inside them (one summer day 67°, the next 102°), and the day follows a curve between them: coolest
 * just before dawn, warmest mid-afternoon. Rain and storms cool things off, a map's climate shifts it (a desert, a
 * mountain), and an event can set it for a while.
 *
 * Weather: the shared outdoor weather changes every few hours, picked from the season's chances (spring: rain,
 * storms, haze, pollen; winter: snow and blizzards…). Rain turns to snow below freezing and snow to rain above it.
 * Everything is worked out from the game's clock and a seed, so nothing extra needs saving and every map agrees.
 */
import type { Season } from './seasons';
import type { WeatherKind } from './types';

export interface SeasonClimate {
  /** Morning low and afternoon high ranges, °F. */
  low: [number, number];
  high: [number, number];
  /** Chance weights for each weather (any not listed: never). */
  weather: Partial<Record<WeatherKind, number>>;
}

export interface ClimateConfig {
  /** The shared outdoor weather changes by itself (off: it stays as set, as before). */
  dynamic: boolean;
  /** Each spell of weather lasts this many game hours (from … to). */
  spell: [number, number];
  seasons: Record<Season, SeasonClimate>;
  /** Turn-based battles: how much heat strengthens fire (and weakens water-type foes), and cold the reverse (%). */
  battle: number;
}

export const DEFAULT_CLIMATE: ClimateConfig = {
  dynamic: true,
  spell: [3, 8],
  battle: 25,
  seasons: {
    spring: { low: [24, 40], high: [50, 69], weather: { none: 48, rain: 24, storm: 8, haze: 8, pollen: 12 } },
    summer: { low: [60, 76], high: [86, 108], weather: { none: 58, rain: 14, storm: 12, haze: 10, dust: 6 } },
    autumn: { low: [34, 50], high: [56, 78], weather: { none: 44, rain: 24, storm: 6, haze: 12, leaves: 14 } },
    winter: { low: [6, 26], high: [26, 44], weather: { none: 36, snow: 32, blizzard: 12, haze: 10, rain: 10 } },
  },
};

/** The database's settings with the defaults filled in. */
export function climateConfig(data?: Partial<Omit<ClimateConfig, 'seasons'>> & { seasons?: Partial<Record<Season, Partial<SeasonClimate>>> }): ClimateConfig {
  const d = DEFAULT_CLIMATE, s = data ?? {};
  const seasons = {} as Record<Season, SeasonClimate>;
  for (const k of ['spring', 'summer', 'autumn', 'winter'] as Season[]) {
    const x = s.seasons?.[k];
    seasons[k] = { low: x?.low ?? d.seasons[k].low, high: x?.high ?? d.seasons[k].high, weather: x?.weather ?? d.seasons[k].weather };
  }
  return { dynamic: s.dynamic ?? d.dynamic, spell: s.spell ?? d.spell, battle: s.battle ?? d.battle, seasons };
}

/** A repeatable random number (0 … 1) for a whole number and a salt. */
export function rand(n: number, salt: number): number {
  const x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A day's low and high (°F), rolled inside its season's ranges. */
export function dayTemps(day: number, c: SeasonClimate): { low: number; high: number } {
  const low = c.low[0] + (c.low[1] - c.low[0]) * rand(day, 1);
  const high = Math.max(low + 6, c.high[0] + (c.high[1] - c.high[0]) * rand(day, 2));
  return { low, high };
}

/**
 * The temperature at an hour of a day (°F): the low just before dawn (5:00), the high mid-afternoon (15:00), cooling
 * through the evening toward the next day's low.
 */
export function temperatureAt(day: number, hour: number, season: (day: number) => SeasonClimate): number {
  const today = dayTemps(day, season(day));
  const k = (x: number) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, x)))) / 2;
  if (hour < 5) { const y = dayTemps(day - 1, season(day - 1)); return y.high + (today.low - y.high) * k((hour + 9) / 14); }
  if (hour < 15) return today.low + (today.high - today.low) * k((hour - 5) / 10);
  const next = dayTemps(day + 1, season(day + 1));
  return today.high + (next.low - today.high) * k((hour - 15) / 14);
}

/** How the weather changes the temperature (°F). */
export const WEATHER_TEMP: Partial<Record<WeatherKind, number>> = { rain: -6, storm: -9, snow: -4, blizzard: -8, haze: 2, sandstorm: 4 };

/**
 * The shared outdoor weather at a moment of the game's clock (hours since the start): which spell of weather it is
 * (its number, so a change made by an event can last until the next one), and what it is.
 */
export function weatherAt(clock: number, cfg: ClimateConfig, seasonOf: (day: number) => Season, tempAt: (clock: number) => number): { spell: number; kind: WeatherKind; amount: number } {
  // Spells of weather of varying length, laid end to end from the start of the game.
  const [lo, hi] = cfg.spell, mean = (lo + hi) / 2;
  let spell = Math.max(0, Math.floor(clock / mean) - 1), start = spellStart(spell, lo, hi, mean);
  while (start > clock && spell > 0) { spell--; start = spellStart(spell, lo, hi, mean); }
  while (spellStart(spell + 1, lo, hi, mean) <= clock) spell++;
  const day = Math.floor(spellStart(spell, lo, hi, mean) / 24), table = cfg.seasons[seasonOf(day)].weather;
  let kind = pick(table, rand(spell, 7));
  const amount = kind === 'none' ? 0 : 0.55 + rand(spell, 9) * 0.6;
  // Rain falls as snow below freezing; snow as rain above it.
  const t = tempAt(clock);
  if (t <= 32 && (kind === 'rain' || kind === 'storm')) kind = kind === 'storm' ? 'blizzard' : 'snow';
  else if (t >= 38 && (kind === 'snow' || kind === 'blizzard')) kind = kind === 'blizzard' ? 'storm' : 'rain';
  return { spell, kind, amount };
}

/** When spell n begins (hours): each lasts between lo and hi hours. */
function spellStart(n: number, lo: number, hi: number, mean: number): number {
  // Lengths vary around the mean; the start is the mean spacing plus a wobble that never lets two cross.
  const wobble = (rand(n, 3) - 0.5) * Math.min(hi - lo, mean * 0.9);
  return n * mean + (n === 0 ? 0 : wobble);
}

function pick(table: Partial<Record<WeatherKind, number>>, r: number): WeatherKind {
  const list = Object.entries(table).filter(([, w]) => (w ?? 0) > 0) as [WeatherKind, number][];
  const total = list.reduce((s, [, w]) => s + w, 0);
  if (!total) return 'none';
  let x = r * total;
  for (const [k, w] of list) { x -= w; if (x <= 0) return k; }
  return list[list.length - 1][0];
}

/** °F as the player likes it: "72°F" or "22°C". */
export function formatTemp(f: number, unit: 'F' | 'C'): string {
  return unit === 'C' ? `${Math.round((f - 32) * 5 / 9)}°C` : `${Math.round(f)}°F`;
}
