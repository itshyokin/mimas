/** Editor state: the open map, the current tool, selection, and undo history. */
import { formatSafe, parseSafe } from '../world/safeZones';
import { setAttrOrder } from '../game/attributes';
import { type HeightStyle, formatHeightStyles, parseHeightStyles } from '../world/heights';
import { formatFishing, parseFishing } from '../world/fishing';
import { PropCatalog, alignFootProps, blockedTiles, type StepFn } from '../world/props';
import type { AssetRegistry, Command, Database, EventData, LightData, MapData } from '../world/types';
import { TileCatalog } from '../world/tiles';
import { STEP, type WaterCell, type WaterKind, autoRampDir, cornerMask, formatHeights, formatWater, parseHeights, parseWater, resolveWater } from '../world/heights';
import type { Dir, RampData } from '../world/types';
import { type PassageFlag, formatPassage, parsePassage } from '../world/passage';
import { formatZones, parseZones } from '../world/zones';
import type { Project } from './project';
import { eventCovers, eventH, eventW, eventsOverlap } from '../world/eventArea';
import { setPropCatalog, setTileCatalog } from './editorArt';
import { LIGHT_PRESETS, type LightPreset } from './lightPresets';

export type Mode = 'terrain' | 'height' | 'passage' | 'props' | 'lights' | 'buildings' | 'events' | 'water' | 'zones';
export type BuildingTool = 'select' | 'draw';
export type HeightTool = 'raise' | 'lower' | 'set' | 'fill' | 'ramp' | 'water' | 'style';
export type WaterMode = 'fill' | 'paint' | 'remove' | 'style' | 'fish';
export type TerrainTool = 'pencil' | 'rect' | 'fill';
export type ObjectTool = 'select' | 'place' | 'scatter' | 'erase';
export type LightType = LightData['type'];

export type Selection =
  | { kind: 'prop'; index: number }
  | { kind: 'light'; index: number }
  | { kind: 'building'; index: number }
  | { kind: 'event'; id: number }
  | { kind: 'start' }
  /** An empty tile, or a dragged rectangle of tiles (w × h). */
  | { kind: 'tile'; x: number; z: number; w?: number; h?: number }
  | { kind: 'ramp'; x: number; z: number }
  /** Update 156: a trigger or encounter volume on a 3D map. */
  | { kind: 'volume'; id: number }
  | null;

/**
 * Change topics, so each part of the UI only rebuilds when it has to:
 *  map       – map content changed (redraw canvas)
 *  selection – selection changed (rebuild inspector)
 *  structure – shape of events/pages/commands changed (rebuild inspector + lists)
 *  ui        – mode / tool / view options changed
 *  meta      – saved state, file name, map list
 */
export type Topic = 'map' | 'selection' | 'structure' | 'ui' | 'meta';

const HISTORY_LIMIT = 100;

export class EditorStore {
  private dbValue!: Database;
  get db(): Database { return this.dbValue; }
  /** Setting the database also puts the stats in its order. */
  set db(v: Database) { this.dbValue = v; setAttrOrder(v?.statOrder); }
  mapName = '';
  map!: MapData;
  maps: string[] = [];
  /** Which maps are battle maps (read as the project opens; the open map decides for itself). */
  mapKinds = new Map<string, 'field' | 'battle'>();
  /** Where maps are read from and saved to. */
  project!: Project;
  dirty = false;
  dbDirty = false;

  mode: Mode = 'terrain';
  /** Key of the tile being painted. */
  terrain = '.';
  terrainTool: TerrainTool = 'pencil';
  /** Update 147: which terrain layer is painted, and the upper layer's brush (a space erases). */
  terrainLayer: 'lower' | 'upper' = 'lower';
  upperTile = ' ';
  brushSize = 1;
  heightTool: HeightTool = 'raise';
  /** The Style brush's shape for raised and lowered ground. */
  heightStyleBrush: HeightStyle = 'h';
  /** Style tool: paint with the brush, or fill every connected cell at the clicked cell's height. */
  heightStyleFill = false;
  /** Value the Set tool paints. */
  heightValue = 2;
  /** Fill: set the whole connected area to Height, or raise / lower it all by Steps. */
  heightFillMode: 'set' | 'raise' | 'lower' = 'set';
  heightFillBy = 2;
  rampStyle: 'ramp' | 'stairs' | 'corner' = 'stairs';
  /** The Ramp tool places ramps, or erases them (click or drag over them). */
  rampTool: 'place' | 'erase' = 'place';
  waterMode: WaterMode = 'fill';
  /** Water surface level the water tool uses (steps). */
  waterLevel = 0;
  waterKind: WaterKind = 'auto';
  /** The water style painting uses (the map's water styles, Water tab). */
  waterStyle = 0;
  /** Water tab → Fishing: the spot (catch table) painted, and painting (true) or erasing. */
  fishZone = 0;
  fishErase = false;
  /** Flag the passage brush paints ("." erases). */
  passageFlag: PassageFlag = 'c';
  /** Encounter zone letter the Encounters brush paints ("." erases). */
  zoneLetter = 'A';
  /** Battle maps: what the Spawns layer places (a party or enemy marker) or removes. */
  markerTool: 'party' | 'enemy' | 'erase' = 'party';
  propType = 'oak';
  propTool: ObjectTool = 'place';
  /** Erasing props: only the kind picked in the list (propType), leaving everything else alone. */
  eraseOnlyType = false;
  lightType: LightType = 'point';
  /** Preset used for newly placed lights, per type. */
  lightPreset: Record<LightType, LightPreset> = { point: LIGHT_PRESETS.point[0], spot: LIGHT_PRESETS.spot[0], area: LIGHT_PRESETS.area[0] };
  lightTool: ObjectTool = 'place';
  buildingTool: BuildingTool = 'draw';
  /** Preset the Draw tool uses for new buildings. */
  buildingPreset = 'cottage';
  /** Imported props (public/data/assets.json). Saved straight away, not part of undo. */
  assets: AssetRegistry = { props: [], tiles: [] };
  catalog = new PropCatalog();
  tiles = new TileCatalog();
  /** Imported images by path, kept for playtests (and for this session when the project can't store them). */
  files = new Map<string, Blob>();
  snap = true;
  /** The layer props are painted on (Update 144); null: each prop's own default. */
  propLayer: number | null = null;
  showGrid = true;
  selection: Selection = null;
  /** Page shown in the event inspector. */
  pageIndex = 0;

  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private listeners = new Map<Topic, Set<() => void>>();

  on(topic: Topic, fn: () => void): void {
    let set = this.listeners.get(topic);
    if (!set) this.listeners.set(topic, (set = new Set()));
    set.add(fn);
  }

  emit(...topics: Topic[]): void {
    const called = new Set<() => void>();
    for (const t of topics) for (const fn of this.listeners.get(t) ?? []) if (!called.has(fn)) { called.add(fn); fn(); }
  }

  /* ------------------------------------------------------------ loading */

  open(name: string, map: MapData, fresh = false): void {
    if (this.map && this.mapName) this.mapKinds.set(this.mapName, this.map.kind === 'battle' ? 'battle' : 'field');
    this.mapName = name;
    this.map = map;
    this.mapKinds.set(name, map.kind === 'battle' ? 'battle' : 'field');
    // Props that now have a footprint move from the middle of their tile to its front edge.
    this.dirty = alignFootProps(map, (t) => this.catalog.get(t)) || fresh;
    this.selection = null;
    this.undoStack = [];
    this.redoStack = [];
    this.emit('map', 'selection', 'structure', 'meta', 'ui');
  }

  /* ------------------------------------------------------------ undo */

  private snapshot(): string {
    return JSON.stringify({ map: this.map, db: this.db });
  }

  /** Call before every change; one checkpoint = one undo step. */
  checkpoint(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Throw away an in-progress change (e.g. a stroke cancelled by a two-finger pan). */
  revertCheckpoint(): void {
    const s = this.undoStack.pop();
    if (s) this.restore(s);
  }

  /** Forget the last checkpoint without restoring it (the action turned out to change nothing). */
  dropCheckpoint(): void {
    this.undoStack.pop();
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): void {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.snapshot());
    this.restore(s);
  }

  redo(): void {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.restore(s);
  }

  private restore(s: string): void {
    const { map, db } = JSON.parse(s) as { map: MapData; db: Database };
    if (JSON.stringify(db) !== JSON.stringify(this.db)) this.dbDirty = true;
    this.map = map;
    this.db = db;
    this.dirty = true;
    this.validateSelection();
    this.emit('map', 'selection', 'structure', 'meta');
  }

  /** Mark the map changed and notify listeners. */
  changed(...topics: Topic[]): void {
    this.dirty = true;
    this.emit('map', 'meta', ...topics);
  }

  changedDb(...topics: Topic[]): void {
    this.dbDirty = true;
    setAttrOrder(this.db.statOrder);
    this.emit('map', 'meta', ...topics);
  }

  /* ------------------------------------------------------------ selection */

  select(sel: Selection): void {
    const prev = this.selection;
    if (sel?.kind === 'event' && !(prev?.kind === 'event' && prev.id === sel.id)) this.pageIndex = 0;
    this.selection = sel;
    this.emit('selection');
  }

  private validateSelection(): void {
    const s = this.selection;
    if (!s) return;
    if ((s.kind === 'prop' && s.index >= this.map.props.length) ||
        (s.kind === 'light' && s.index >= this.map.lights.length) ||
        (s.kind === 'building' && s.index >= (this.map.buildings?.length ?? 0)) ||
        (s.kind === 'event' && !this.event(s.id)) ||
        (s.kind === 'ramp' && !this.rampAt(s.x, s.z))) this.selection = null;
    if (this.selection?.kind === 'event') {
      const ev = this.event(this.selection.id)!;
      this.pageIndex = Math.min(this.pageIndex, ev.pages.length - 1);
    }
  }

  /* ------------------------------------------------------------ map helpers */

  terrainAt(x: number, z: number): string {
    return this.map.terrain[z]?.[x] ?? '.';
  }

  setTerrain(x: number, z: number, t: string): boolean {
    if (x < 0 || z < 0 || x >= this.map.width || z >= this.map.height) return false;
    const row = this.map.terrain[z].padEnd(this.map.width, '.');
    if (row[x] === t) return false;
    this.map.terrain[z] = row.slice(0, x) + t + row.slice(x + 1);
    return true;
  }

  /** The upper terrain layer (Update 147): a space for nothing. */
  upperAt(x: number, z: number): string {
    return this.map.upper?.[z]?.[x] ?? ' ';
  }

  setUpper(x: number, z: number, t: string): boolean {
    if (!this.inMap(x, z)) return false;
    const w = this.map.width, rows = (this.map.upper ??= Array.from({ length: this.map.height }, () => ' '.repeat(w)));
    const row = (rows[z] ?? '').padEnd(w, ' ');
    if (row[x] === t) return false;
    rows[z] = row.slice(0, x) + t + row.slice(x + 1);
    if (rows.every((r) => !r.trim())) delete this.map.upper;
    return true;
  }

  /** The cell on the terrain layer being painted, and painting it with that layer's brush. */
  layerAt(x: number, z: number): string { return this.terrainLayer === 'upper' ? this.upperAt(x, z) : this.terrainAt(x, z); }
  paintLayer(x: number, z: number): boolean { return this.terrainLayer === 'upper' ? this.setUpper(x, z, this.upperTile) : this.setTerrain(x, z, this.terrain); }

  inMap(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.map.width && z < this.map.height;
  }

  event(id: number): EventData | undefined {
    return this.map.events.find((e) => e.id === id);
  }

  eventAt(x: number, z: number): EventData | undefined {
    return this.map.events.find((e) => eventCovers(e, x, z));
  }

  /** Can an event cover this rectangle? It must be on the map and not overlap another event. */
  eventFits(r: { x: number; z: number; w?: number; h?: number }, exceptId = -1): boolean {
    const w = eventW(r), hh = eventH(r);
    if (!this.inMap(r.x, r.z) || !this.inMap(r.x + w - 1, r.z + hh - 1)) return false;
    return !this.map.events.some((e) => e.id !== exceptId && this.inMap(e.x, e.z) && eventsOverlap(e, r));
  }

  /** The copied event (kept across maps for this session). */
  eventClipboard: EventData | null = null;

  copyEvent(id: number): boolean {
    const ev = this.event(id);
    if (!ev) return false;
    this.eventClipboard = JSON.parse(JSON.stringify(ev)) as EventData;
    return true;
  }

  /** Paste the copied event with its top-left at (x, z). Returns the new event, or an error message. */
  pasteEvent(x: number, z: number): EventData | string {
    const c = this.eventClipboard;
    if (!c) return 'Nothing copied yet: select an event and press Ctrl+C.';
    const ev: EventData = { ...JSON.parse(JSON.stringify(c)) as EventData, id: this.nextEventId(), x, z };
    if (!this.eventFits(ev)) return eventW(ev) > 1 || eventH(ev) > 1 ? `The ${eventW(ev)} × ${eventH(ev)} event doesn’t fit there: it would leave the map or overlap another event.` : 'There’s already an event on that tile.';
    this.checkpoint();
    this.map.events.push(ev);
    this.changed('structure');
    this.select({ kind: 'event', id: ev.id });
    return ev;
  }

  /**
   * The light at a point (in tiles). Point and spot lights win over areas; among areas, the smallest wins,
   * so small areas inside big ones can still be picked.
   */
  lightAt(x: number, z: number): number {
    let best = -1, bestScore = Infinity;
    this.map.lights.forEach((l, i) => {
      let score: number;
      if (l.type === 'area') {
        const dx = Math.abs(x - l.x) / (l.w / 2), dz = Math.abs(z - l.z) / (l.h / 2);
        const inside = l.shape === 'ellipse' ? dx * dx + dz * dz <= 1 : dx <= 1 && dz <= 1;
        if (!inside) return;
        score = 10 + l.w * l.h;
      } else {
        const d = Math.hypot(x - l.x, z - l.z);
        if (d > 0.6) return;
        score = d;
      }
      if (score < bestScore) { bestScore = score; best = i; }
    });
    return best;
  }

  /** Index of the prop standing on a tile (by where it touches the ground), or -1. */
  propOnTile(x: number, z: number, except = -1): number {
    return this.map.props.findIndex((p, i) => i !== except && Math.floor(p.x) === x && Math.floor(p.z) === z);
  }

  /** Index of the point light or spotlight on a tile, or -1. Area lights cover zones and may overlap. */
  lightOnTile(x: number, z: number, except = -1): number {
    return this.map.lights.findIndex((l, i) => i !== except && l.type !== 'area' && Math.floor(l.x) === x && Math.floor(l.z) === z);
  }

  /** Replace the asset list (after an import, edit or delete) and rebuild the catalog. */
  setAssets(a: AssetRegistry): void {
    this.assets = a;
    this.catalog = new PropCatalog(a);
    setPropCatalog(this.catalog);
    this.tiles = new TileCatalog(a);
    setTileCatalog(this.tiles);
    if (this.map && alignFootProps(this.map, (t) => this.catalog.get(t))) this.dirty = true;
    this.emit('map', 'ui', 'selection');
  }

  /* ------------------------------------------------------------ heights */

  private hCache: { src: string[] | undefined; w: number; h: number; grid: Int8Array } | null = null;

  /** The height grid (steps per cell), parsed from the map and cached. */
  heights(): Int8Array {
    const m = this.map, c = this.hCache;
    if (c && c.src === m.heights && c.w === m.width && c.h === m.height) return c.grid;
    const grid = parseHeights(m.heights, m.width, m.height);
    this.hCache = { src: m.heights, w: m.width, h: m.height, grid };
    return grid;
  }

  /** Heights for the prop footprint helpers (wall props reach back from the wall they stand against). */
  readonly propStep: StepFn = (x, z) => (this.inMap(x, z) ? this.heightAt(x, z) : null);

  heightAt(x: number, z: number): number {
    return this.inMap(x, z) ? this.heights()[z * this.map.width + x] : 0;
  }

  /** Change heights through `fn` (return true if anything changed), then write them back to the map once. */
  editHeights(fn: (grid: Int8Array, w: number) => boolean): boolean {
    const grid = this.heights();
    if (!fn(grid, this.map.width)) return false;
    this.map.heights = formatHeights(grid, this.map.width, this.map.height) ?? undefined;
    this.hCache = { src: this.map.heights, w: this.map.width, h: this.map.height, grid };
    return true;
  }

  /** Change height styles (blocky, soft, hills, cliffs) through `fn`, then write them back. */
  editHeightStyles(fn: (grid: HeightStyle[], w: number) => boolean): boolean {
    const m = this.map, grid = parseHeightStyles(m.heightStyles, m.width, m.height);
    if (!fn(grid, m.width)) return false;
    m.heightStyles = formatHeightStyles(grid, m.width, m.height) ?? undefined;
    return true;
  }
  heightStyleAt(x: number, z: number): HeightStyle { return (this.inMap(x, z) ? (this.map.heightStyles?.[z]?.[x] as HeightStyle | undefined) : undefined) ?? '.'; }

  private wCache: { src: string[] | undefined; w: number; h: number; grid: (WaterCell | null)[] } | null = null;

  /** The water grid (per cell: level and kind, or null), parsed from the map and cached. */
  water(): (WaterCell | null)[] {
    const m = this.map, c = this.wCache;
    if (c && c.src === m.water && c.w === m.width && c.h === m.height) return c.grid;
    const grid = parseWater(m.water, m.width, m.height);
    this.wCache = { src: m.water, w: m.width, h: m.height, grid };
    return grid;
  }

  /** Water as it behaves at a cell (Auto resolved by depth), or null where dry. */
  waterAt(x: number, z: number): ReturnType<typeof resolveWater> {
    if (!this.inMap(x, z)) return null;
    return resolveWater(this.water()[z * this.map.width + x], this.heightAt(x, z) * STEP);
  }

  editWater(fn: (grid: (WaterCell | null)[], w: number) => boolean): boolean {
    const grid = this.water();
    if (!fn(grid, this.map.width)) return false;
    this.map.water = formatWater(grid, this.map.width, this.map.height) ?? undefined;
    this.wCache = { src: this.map.water, w: this.map.width, h: this.map.height, grid };
    return true;
  }

  private fCache: { src: string[] | undefined; w: number; h: number; grid: (number | null)[] } | null = null;

  /** Fishing spots per cell (a catch table's number, or null), parsed from the map and cached. */
  fishing(): (number | null)[] {
    const m = this.map, c = this.fCache;
    if (c && c.src === m.fishing && c.w === m.width && c.h === m.height) return c.grid;
    const grid = parseFishing(m.fishing, m.width, m.height);
    this.fCache = { src: m.fishing, w: m.width, h: m.height, grid };
    return grid;
  }

  editFishing(fn: (grid: (number | null)[], w: number) => boolean): boolean {
    const grid = this.fishing();
    if (!fn(grid, this.map.width)) return false;
    this.map.fishing = formatFishing(grid, this.map.width, this.map.height) ?? undefined;
    this.fCache = { src: this.map.fishing, w: this.map.width, h: this.map.height, grid };
    return true;
  }

  private zCache: { src: string[] | undefined; w: number; h: number; grid: string[] } | null = null;

  /** Is this map (the open one, or another by name) a battle map? */
  isBattleMap(name = this.mapName): boolean {
    return name === this.mapName ? this.map?.kind === 'battle' : this.mapKinds.get(name) === 'battle';
  }

  /** The project's battle maps, by file name. */
  battleMapNames(): string[] {
    const names = this.maps.includes(this.mapName) ? this.maps : [...this.maps, this.mapName];
    return names.filter((n) => this.isBattleMap(n));
  }

  /** Battle maps: place the marker tool's kind of marker on a cell, or remove the one there. True if it changed. */
  setMarker(x: number, z: number): boolean {
    if (!this.inMap(x, z)) return false;
    const list = (this.map.markers ??= []);
    const i = list.findIndex((mk) => mk.x === x && mk.z === z);
    if (this.markerTool === 'erase') {
      if (i < 0) return false;
      list.splice(i, 1);
    } else {
      if (i >= 0 && list[i].side === this.markerTool) return false;
      if (i >= 0) list.splice(i, 1);
      list.push({ side: this.markerTool, x, z });
    }
    if (!list.length) delete this.map.markers;
    return true;
  }

  /** The encounter zone grid (a letter or "." per cell), parsed from the map and cached. */
  zoneGrid(): string[] {
    const m = this.map, c = this.zCache;
    if (c && c.src === m.zoneGrid && c.w === m.width && c.h === m.height) return c.grid;
    const grid = parseZones(m.zoneGrid, m.width, m.height);
    this.zCache = { src: m.zoneGrid, w: m.width, h: m.height, grid };
    return grid;
  }

  zoneAt(x: number, z: number): string {
    return this.inMap(x, z) ? this.zoneGrid()[z * this.map.width + x] : '.';
  }

  /** Safe zones (world/safeZones.ts): a mark or "." per cell, parsed and cached. */
  private sCache: { src: string[] | undefined; w: number; h: number; grid: string[] } | null = null;
  safeGrid(): string[] {
    const m = this.map, c = this.sCache;
    if (c && c.src === m.safeGrid && c.w === m.width && c.h === m.height) return c.grid;
    const grid = parseSafe(m.safeGrid, m.width, m.height);
    this.sCache = { src: m.safeGrid, w: m.width, h: m.height, grid };
    return grid;
  }
  editSafe(fn: (grid: string[], w: number) => boolean): boolean {
    const grid = this.safeGrid();
    if (!fn(grid, this.map.width)) return false;
    this.map.safeGrid = formatSafe(grid, this.map.width, this.map.height) ?? undefined;
    this.sCache = { src: this.map.safeGrid, w: this.map.width, h: this.map.height, grid };
    return true;
  }
  /** Spawns layer: painting a safe zone mark (s, S, L, M, T, "." to erase) instead of an encounter zone letter. */
  safeMark: string | null = null;

  editZones(fn: (grid: string[], w: number) => boolean): boolean {
    const grid = this.zoneGrid();
    if (!fn(grid, this.map.width)) return false;
    this.map.zoneGrid = formatZones(grid, this.map.width, this.map.height) ?? undefined;
    this.zCache = { src: this.map.zoneGrid, w: this.map.width, h: this.map.height, grid };
    return true;
  }

  private pCache: { src: string[] | undefined; w: number; h: number; grid: PassageFlag[] } | null = null;

  /** The passage grid (one flag per cell), parsed from the map and cached. */
  passage(): PassageFlag[] {
    const m = this.map, c = this.pCache;
    if (c && c.src === m.passage && c.w === m.width && c.h === m.height) return c.grid;
    const grid = parsePassage(m.passage, m.width, m.height);
    this.pCache = { src: m.passage, w: m.width, h: m.height, grid };
    return grid;
  }

  passageAt(x: number, z: number): PassageFlag {
    return this.inMap(x, z) ? this.passage()[z * this.map.width + x] : '.';
  }

  editPassage(fn: (grid: PassageFlag[], w: number) => boolean): boolean {
    const grid = this.passage();
    if (!fn(grid, this.map.width)) return false;
    this.map.passage = formatPassage(grid, this.map.width, this.map.height) ?? undefined;
    this.pCache = { src: this.map.passage, w: this.map.width, h: this.map.height, grid };
    return true;
  }

  /**
   * What blocks each cell before the passage layer: "tile" (a blocking tile), "prop", "deep" (deep water),
   * or null. Shown on the Passage layer so you can see what to override.
   */
  autoBlocking(): ('tile' | 'prop' | 'building' | 'deep' | null)[] {
    const m = this.map, w = m.width, out: ('tile' | 'prop' | 'building' | 'deep' | null)[] = new Array(w * m.height).fill(null);
    for (let z = 0; z < m.height; z++)
      for (let x = 0; x < w; x++) {
        // Update 151: as the game decides it (an upper tile decides its cell; edge-blocking tiles block at the edges).
        const u = this.upperAt(x, z), ud = u !== ' ' ? this.tiles.get(u) : undefined, k = this.terrainAt(x, z);
        if (ud && !ud.above) { if (ud.blocks) out[z * w + x] = 'tile'; }
        else if (this.tiles.blocks(k)) out[z * w + x] = 'tile';
        else if (this.tiles.get(k)?.edgeBlocks && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.inMap(x + dx, z + dz) && this.terrainAt(x + dx, z + dz) !== k)) out[z * w + x] = 'tile';
        else if (this.waterAt(x, z)?.kind === 'deep') out[z * w + x] = 'deep';
      }
    for (const p of m.props) {
      const def = this.catalog.get(p.type);
      if (!def) continue;
      for (const [x, z] of blockedTiles(def, p.x, p.z, p.s ?? 1, this.propStep)) if (this.inMap(x, z) && !out[z * w + x]) out[z * w + x] = 'prop';
    }
    for (const b of m.buildings ?? [])
      for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) if (this.inMap(x, z) && !out[z * w + x]) out[z * w + x] = 'building';
    return out;
  }

  /** The building standing on a tile (the last drawn wins), or -1. */
  buildingAt(x: number, z: number, except = -1): number {
    const list = this.map.buildings ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (i !== except && x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d) return i;
    }
    return -1;
  }

  /** Would a building on this rectangle overlap another one (or leave the map)? */
  buildingFits(r: { x: number; z: number; w: number; d: number }, except = -1): boolean {
    if (r.x < 0 || r.z < 0 || r.x + r.w > this.map.width || r.z + r.d > this.map.height) return false;
    return (this.map.buildings ?? []).every((b, i) => i === except || b.x >= r.x + r.w || r.x >= b.x + b.w || b.z >= r.z + r.d || r.z >= b.z + b.d);
  }

  rampAt(x: number, z: number): RampData | undefined {
    return this.map.ramps?.find((r) => r.x === x && r.z === z);
  }

  /** The direction a ramp rises (its override, or detected from the neighbours); null if it can't rise anywhere. */
  /** Ramps with no neighbour one step higher to rise to (drawn with a red cross). */
  brokenRamps(): RampData[] {
    return (this.map.ramps ?? []).filter((r) => !this.inMap(r.x, r.z) || (r.style === 'corner' ? this.rampCorners(r) === null : this.rampDir(r) === null));
  }

  /** Remove the ramp on a cell; true if there was one. (No checkpoint: the caller makes one.) */
  removeRamp(x: number, z: number): boolean {
    const list = this.map.ramps ?? [], n = list.length;
    this.map.ramps = list.filter((r) => r.x !== x || r.z !== z);
    if (this.map.ramps.length === n) return false;
    if (this.selection?.kind === 'ramp' && this.selection.x === x && this.selection.z === z) this.selection = null;
    return true;
  }

  /** A corner slope's raised corners (NW, NE, SE, SW), or null when it would lie flat. */
  rampCorners(r: RampData): boolean[] | null {
    return cornerMask(r, (x, z) => (this.inMap(x, z) ? this.heightAt(x, z) : null));
  }

  rampDir(r: RampData): Dir | null {
    return r.dir ?? autoRampDir((x, z) => (this.inMap(x, z) ? this.heightAt(x, z) : null), r.x, r.z);
  }

    /** Is the player start on this map? */
  get startHere(): boolean {
    return this.db.startMap === this.mapName;
  }

  nextEventId(): number {
    return this.map.events.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  }

  /** Every switch / variable / speaker name used on this map (for autocomplete). */
  knownNames(): { switches: string[]; vars: string[]; speakers: string[] } {
    const sw = new Set<string>(), vars = new Set<string>(), sp = new Set<string>(Object.values(this.db.characters).map((c) => c.name));
    const cond = (c?: { switch?: string; var?: string }) => { if (c?.switch) sw.add(c.switch); if (c?.var) vars.add(c.var); };
    const walk = (list: Command[]) => {
      for (const c of list) {
        if (c.cmd === 'text' && c.speaker) sp.add(c.speaker);
        if (c.cmd === 'setSwitch' && c.switch) sw.add(c.switch);
        if (c.cmd === 'setVar' && c.var) vars.add(c.var);
        if (c.cmd === 'if') { cond(c.condition as { switch?: string; var?: string }); walk(c.then); walk(c.else ?? []); }
        if (c.cmd === 'choice') c.branches.forEach(walk);
      }
    };
    for (const e of this.map.events) for (const p of e.pages) { cond(p.condition as { switch?: string; var?: string } | undefined); walk(p.commands); }
    const sort = (s: Set<string>) => [...s].filter(Boolean).sort();
    return { switches: sort(sw), vars: sort(vars), speakers: sort(sp) };
  }
}
