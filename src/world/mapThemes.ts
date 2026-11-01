/**
 * Map themes (Database → Map themes): defaults a map takes when it picks the theme (Map Properties → General →
 * Theme): what lies beyond its edges, its cliff walls, lighting, music and background sounds, wind, weather, climate
 * and air. Anything the map sets itself wins; anything it leaves as "Theme default" comes from the theme. Applied
 * when the game loads the map, so the rest of the game just reads the map's settings as before.
 */
import type { BorderKind, MapData, MapEnvironment, WeatherKind } from './types';
import type { Season } from './seasons';

export interface MapTheme {
  id: string;
  name: string;
  /** Beyond every edge. */
  border?: BorderKind;
  cliffTile?: string;
  environment?: MapEnvironment;
  season?: Season;
  music?: string;
  battleMusic?: string;
  ambience?: string;
  ambienceNight?: string;
  ambienceCold?: string;
  /** Wind strength 0 … 1. */
  wind?: number;
  /** °F warmer (+) or colder (−). */
  tempOffset?: number;
  /** Its own weather (maps of the theme share it, as a weather zone named after the theme). Unset: the shared outdoor weather. */
  weather?: { kind: WeatherKind; amount?: number };
  atmosphere?: { haze?: number; mist?: number; rays?: number; clouds?: number };
}

/** The keys a theme can give a map, in the order they show. */
export const THEME_KEYS = ['border', 'cliffTile', 'environment', 'season', 'music', 'battleMusic', 'ambience', 'ambienceNight', 'ambienceCold', 'wind', 'tempOffset', 'weather', 'atmosphere'] as const;

/** Starter themes (used until the Database has its own). */
export const DEFAULT_THEMES: MapTheme[] = [
  { id: 'forest', name: 'Forest', border: 'forest', music: 'builtin:field', ambience: 'builtin:forest', ambienceNight: 'builtin:night', wind: 0.3, atmosphere: { rays: 0.3, clouds: 0.3 } },
  { id: 'plains', name: 'Plains', border: 'plains', music: 'builtin:field', ambience: 'builtin:wind', ambienceNight: 'builtin:night', wind: 0.6, atmosphere: { clouds: 0.6 } },
  { id: 'desert', name: 'Desert', border: 'desert', ambience: 'builtin:wind', wind: 0.6, tempOffset: 20, weather: { kind: 'none' }, atmosphere: { haze: 0.6 } },
  { id: 'snowfield', name: 'Snowfield', border: 'snowforest', season: 'winter', ambience: 'builtin:chill', wind: 0.6, tempOffset: -25, weather: { kind: 'snow', amount: 0.6 }, atmosphere: { haze: 0.3 } },
  { id: 'mountains', name: 'Mountains', border: 'rocks', cliffTile: '▲', ambience: 'builtin:wind', wind: 1, tempOffset: -12, atmosphere: { haze: 0.6, clouds: 0.3 } },
  { id: 'cave', name: 'Cave', border: 'none', cliffTile: '▲', environment: 'dark', ambience: 'builtin:cave', wind: 0, atmosphere: { mist: 0.3 } },
  { id: 'interior', name: 'Indoors', border: 'none', environment: 'indoor', wind: 0 },
];

export const mapThemes = (list: MapTheme[] | undefined): MapTheme[] => (list ?? DEFAULT_THEMES);
export const findTheme = (list: MapTheme[] | undefined, id: string | undefined): MapTheme | undefined => (id ? mapThemes(list).find((t) => t.id === id) : undefined);

/**
 * Fill in what the map leaves to its theme (in place). Each setting the map has itself stays; unset ones come from the
 * theme. Weather: a themed weather makes the map's weather unique (shared by the theme's maps as one zone), unless
 * the map turned Unique weather off itself.
 */
export function applyTheme(m: MapData, list: MapTheme[] | undefined): MapData {
  const t = findTheme(list, m.theme);
  if (!t) return m;
  if (t.border !== undefined && !m.border) m.border = { kind: t.border, seed: hashSeed(m.name || t.id) };
  if (t.cliffTile !== undefined && m.cliffTile === undefined) m.cliffTile = t.cliffTile;
  if (t.environment !== undefined && m.environment === undefined) m.environment = t.environment;
  if (t.season !== undefined && m.season === undefined) m.season = t.season;
  for (const k of ['music', 'battleMusic', 'ambience', 'ambienceNight', 'ambienceCold'] as const) if (t[k] !== undefined && m[k] === undefined) m[k] = t[k];
  if (t.wind !== undefined && m.wind?.strength === undefined) m.wind = { ...m.wind, strength: t.wind };
  if (t.tempOffset !== undefined && m.tempOffset === undefined) m.tempOffset = t.tempOffset;
  if (t.weather && m.uniqueWeather === undefined && m.weather === undefined) {
    m.uniqueWeather = true;
    m.weather = { ...t.weather };
    m.weatherZone ??= `theme:${t.id}`;
  }
  if (t.atmosphere) {
    const a = { ...m.atmosphere };
    for (const k of ['haze', 'mist', 'rays', 'clouds'] as const) if (t.atmosphere[k] !== undefined && a[k] === undefined) a[k] = t.atmosphere[k];
    m.atmosphere = a;
  }
  return m;
}

function hashSeed(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000;
  return h;
}
