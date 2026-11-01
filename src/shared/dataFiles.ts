/** Loading and formatting of the JSON data files, shared by the game and the editor. */
import { migrateMap } from '../world/props';
import type { AssetRegistry, Database, MapData } from '../world/types';

export async function loadJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load ${path} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export const loadDatabase = (): Promise<Database> => loadJSON<Database>('data/database.json');
export async function loadMap(name: string): Promise<MapData> {
  const map = await loadJSON<MapData>(`data/maps/${name}.json`);
  migrateMap(map);
  return map;
}

/** Imported props (and later tiles). A project without the file simply has none. */
export async function loadAssets(): Promise<AssetRegistry> {
  try { return normalizeAssets(await loadJSON<AssetRegistry>('data/assets.json')); } catch { return normalizeAssets(null); }
}

export function normalizeAssets(a: Partial<AssetRegistry> | null | undefined): AssetRegistry {
  const out: AssetRegistry = { props: Array.isArray(a?.props) ? a!.props : [], tiles: Array.isArray(a?.tiles) ? a!.tiles : [] };
  if (a?.tileCliffs && typeof a.tileCliffs === 'object' && Object.keys(a.tileCliffs).length) out.tileCliffs = { ...a.tileCliffs };
  if (a?.tileBlend && typeof a.tileBlend === 'object' && Object.keys(a.tileBlend).length) out.tileBlend = { ...a.tileBlend };
  if (a?.tileRoads && typeof a.tileRoads === 'object' && Object.keys(a.tileRoads).length) out.tileRoads = { ...a.tileRoads };
  if (a?.tileSteps && typeof a.tileSteps === 'object' && Object.keys(a.tileSteps).length) out.tileSteps = { ...a.tileSteps };
  if (a?.tileAilments && typeof a.tileAilments === 'object' && Object.keys(a.tileAilments).length) out.tileAilments = { ...a.tileAilments };
  return out;
}

export function formatAssets(a: AssetRegistry): string {
  return JSON.stringify(a, null, 2) + '\n';
}

/**
 * Stable, diff-friendly map JSON: terrain one row per line, one prop per line,
 * events pretty-printed.
 */
const MAP_KEYS_ORDERED = new Set(['name', 'kind', 'width', 'height', 'environment', 'border', 'music', 'battleMusic', 'battleMap', 'battleTransitions', 'encounters', 'zones', 'ambience', 'ambienceNight', 'wind', 'uniqueWeather', 'weatherZone', 'weather', 'atmosphere',
  'cliffTile', 'theme', 'season', 'tempOffset', 'ambienceCold', 'terrain', 'heights', 'water', 'ramps', 'passage', 'zoneGrid', 'safeGrid', 'markers', 'battleCamera', 'lights', 'events']);

export function formatMap(map: MapData): string {
  const { props, buildings, ...rest } = map;
  const ordered = {
    name: rest.name, kind: rest.kind, width: rest.width, height: rest.height, environment: rest.environment, border: rest.border,
    music: rest.music, battleMusic: rest.battleMusic, battleMap: rest.battleMap, battleTransitions: rest.battleTransitions, encounters: rest.encounters, zones: rest.zones, ambience: rest.ambience, ambienceNight: rest.ambienceNight, wind: rest.wind, uniqueWeather: rest.uniqueWeather, weatherZone: rest.weatherZone, weather: rest.weather, atmosphere: rest.atmosphere,
    cliffTile: rest.cliffTile, theme: rest.theme, season: rest.season, tempOffset: rest.tempOffset, ambienceCold: rest.ambienceCold,
    // Anything else the map has (water styles, fishing…), so nothing is lost on save.
    ...Object.fromEntries(Object.entries(rest).filter(([k]) => !MAP_KEYS_ORDERED.has(k))),
    terrain: rest.terrain, heights: rest.heights?.length ? rest.heights : undefined,
    water: rest.water?.length ? rest.water : undefined, ramps: rest.ramps?.length ? rest.ramps : undefined,
    passage: rest.passage?.some((r) => /[^.]/.test(r)) ? rest.passage : undefined,
    zoneGrid: rest.zoneGrid?.some((r) => /[^.]/.test(r)) ? rest.zoneGrid : undefined,
    safeGrid: rest.safeGrid?.some((r) => /[^.]/.test(r)) ? rest.safeGrid : undefined,
    markers: rest.markers?.length ? rest.markers : undefined, battleCamera: rest.battleCamera, lights: rest.lights, events: rest.events,
  };
  let head = JSON.stringify(ordered, null, 2).replace(/\n}$/, '');
  // Buildings and props: one per line.
  if (buildings?.length) head += `,\n  "buildings": [\n${buildings.map((b) => '    ' + JSON.stringify(b)).join(',\n')}\n  ]`;
  if (!props.length) return `${head},\n  "props": []\n}\n`;
  const propLines = props.map((p) => '    ' + JSON.stringify(p)).join(',\n');
  return `${head},\n  "props": [\n${propLines}\n  ]\n}\n`;
}

export function formatDatabase(db: Database): string {
  return JSON.stringify(db, null, 2) + '\n';
}
