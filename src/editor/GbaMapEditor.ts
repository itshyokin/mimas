/**
 * GBA Studio → Maps: paint GBA maps with the tiles made in the Tiles tab.
 *
 * Layers: Ground, Paths & water (corners picked automatically), Cliffs (tiers:
 * paint tier 1, then tier 2 inside it, or right at its edge for a taller cliff),
 * Objects (trees, ledges, stairs, signs, tall grass…), Passability (RPG Maker
 * O / X overrides), Events (people, signs, doors) and Start (where the player begins).
 */
import { field, h, numberInput, openModal, select, textInput, toast, checkbox, confirmModal } from './dom';
import { collision, drawMap, eventAt, footprint, GRASS, LEDGE_E, LEDGE_S, LEDGE_W, SOLID, WATER, type TileLookup } from '../gba/mapRender';
import {
  CELL, FACINGS, MAX_TIER, TILE_TYPES, blankMap, resizeMap, LEDGE_PIECES, ledgeCell,
  type Facing, type GbaCommand, type GbaEvent, type GbaMap, type GbaSprite, type GbaTile, type TileType,
} from '../gba/types';

export type Layer = 'ground' | 'terrain' | 'cliff' | 'objects' | 'events' | 'pass' | 'start';
type MapTool = 'paint' | 'erase' | 'fill' | 'rect';

export const LAYERS: [Layer, string, string][] = [
  ['ground', 'Ground', 'The bottom layer: grass, sand, floors.'],
  ['terrain', 'Paths & water', 'Paths and water over the ground. Corners and edges are picked for you.'],
  ['cliff', 'Cliffs', 'Paint the area of a raised plateau: the ring of cliff edges is drawn around it and the top stays walkable. Paint tier 2 inside tier 1 for a higher level, or right up to its edge for a taller cliff.'],
  ['objects', 'Objects', 'Trees, ledges, stairs, ladders, signs, flowers, tall grass, doors. Stairs and ladders make a way through cliffs.'],
  ['events', 'Events', 'People, signs and doors. Click an empty cell to add an event, click one to edit it, drag to move it, right-click to delete it.'],
  ['pass', 'Passability', 'RPG Maker-style overrides: O makes a cell walkable, X blocks it, whatever is drawn there.'],
  ['start', 'Start', 'Click where the player starts on this map.'],
];

const LAYER_TYPES: Partial<Record<Layer, TileType[]>> = {
  ground: ['ground'],
  terrain: ['path', 'water'],
  cliff: ['cliff'],
  objects: ['object', 'decor', 'ledge', 'stairs', 'ladder', 'tallgrass', 'door'],
};


/** What the map editor needs from the studio around it. */
export interface MapHost {
  tiles(): GbaTile[];
  tileImage(t: GbaTile): HTMLCanvasElement;
  maps: Map<string, GbaMap>;
  mapIds(): string[];
  addMapId(id: string): void;
  removeMapId(id: string): void;
  startMap(): string | undefined;
  setStartMap(id: string | undefined): void;
  touchMap(id: string): void;
  touchData(): void;
  listEl: HTMLElement;
  centerEl: HTMLElement;
  sideEl: HTMLElement;
  goToTiles(): void;
  sprites(): GbaSprite[];
  spriteImage(s: GbaSprite): HTMLCanvasElement | undefined;
  playtest(mapId: string, at?: { x: number; y: number; dir?: Facing }): void;
  items(): { id: string; name: string }[];
  troops(): { id: string; name: string }[];
  openDatabase(): void;
}

const FACING_LABEL: Record<Facing, string> = { down: 'Down', up: 'Up', left: 'Left', right: 'Right' };
const ROW_OF: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 2 };

export class MapEditor {
  sel?: string;
  layer: Layer = 'ground';
  tool: MapTool = 'paint';
  brush: Partial<Record<Layer, string>> = {};
  tier = 1;
  ledgePiece = 1;
  passBrush: 'O' | 'X' | '.' = 'X';
  zoom = 0;
  grid = true;
  showBlocked = false;
  /** The selected event (Events layer). */
  selEvent?: number;
  /** Choosing where a transfer lands: back to this map / event / command afterwards. */
  picking: { from: string; ev: number; cmd: number } | null = null;
  moveEv: { id: number; before: string; moved: boolean } | null = null;
  undo = new Map<string, string[]>();
  redo = new Map<string, string[]>();

  display?: HTMLCanvasElement;
  drag: { start: [number, number]; last: [number, number]; erase: boolean; before: string } | null = null;
  hover: [number, number] | null = null;

  constructor(private host: MapHost) {}

  get map(): GbaMap | undefined { return this.sel ? this.host.maps.get(this.sel) : undefined; }

  lookup: TileLookup = (id) => {
    const def = this.host.tiles().find((t) => t.id === id);
    return def ? { def, img: this.host.tileImage(def) } : null;
  };

  /* ------------------------------------------------------------------ list */

  renderList(): void {
    const ids = this.host.mapIds();
    if (!this.sel || !this.host.maps.has(this.sel)) this.sel = ids.find((i) => this.host.maps.has(i));
    const rows: HTMLElement[] = [h('button', { type: 'button', class: 'btn primary gs-new', onclick: () => this.newMap() }, '+ New map')];
    for (const id of ids) {
      const m = this.host.maps.get(id);
      if (!m) continue;
      const star = this.host.startMap() === id ? ' ★' : '';
      rows.push(h('button', { type: 'button', class: `gs-row${id === this.sel ? ' on' : ''}`, onclick: () => { this.sel = id; this.zoom = 0; this.render(); } },
        this.mapThumb(m), h('span', {}, `${m.name}${star}`)));
    }
    if (!ids.length) rows.push(h('p', { class: 'gs-empty' }, 'No GBA maps yet.'));
    this.host.listEl.replaceChildren(...rows);
  }

  mapThumb(m: GbaMap): HTMLCanvasElement {
    const full = document.createElement('canvas');
    full.width = m.width * CELL;
    full.height = m.height * CELL;
    drawMap(full.getContext('2d')!, m, this.lookup, 1);
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    c.className = 'gs-thumb';
    const g = c.getContext('2d')!;
    const s = Math.min(32 / full.width, 32 / full.height);
    g.drawImage(full, (32 - full.width * s) / 2, (32 - full.height * s) / 2, full.width * s, full.height * s);
    return c;
  }

  newMap(): void {
    let name = 'New map', w = 30, hgt = 20;
    const grounds = this.host.tiles().filter((t) => t.type === 'ground');
    let ground = grounds[0]?.id ?? '';
    const body = h('div', { class: 'gs-form' },
      field('Name', textInput(name, (v) => { name = v; })),
      h('div', { class: 'gs-size' },
        field('Width (tiles)', numberInput(w, (v) => { w = v; }, { min: 15, max: 128 })),
        field('Height (tiles)', numberInput(hgt, (v) => { hgt = v; }, { min: 10, max: 128 }))),
      grounds.length ? field('Fill with', select(grounds.map((t) => [t.id, t.name]), ground, (v) => { ground = v; }))
        : h('p', { class: 'hint' }, 'Tip: make a Ground tile in the Tiles tab first, so new maps start filled with it.'),
      h('p', { class: 'hint' }, 'The GBA screen shows 15 × 10 tiles, so maps at least that big fill the screen.'));
    openModal('New GBA map', body, [
      { label: 'Cancel' },
      { label: 'Create', primary: true, onClick: () => {
        const taken = new Set(this.host.mapIds());
        const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'map';
        let id = base, n = 2;
        while (taken.has(id)) id = `${base}_${n++}`;
        const m = blankMap(id, name.trim() || id, Math.max(15, Math.min(128, w)), Math.max(10, Math.min(128, hgt)), ground || undefined);
        this.host.maps.set(id, m);
        this.host.addMapId(id);
        if (!this.host.startMap()) this.host.setStartMap(id);
        this.sel = id;
        this.zoom = 0;
        this.host.touchMap(id);
        this.host.touchData();
        this.render();
      } },
    ]);
  }

  /* ------------------------------------------------------------------ main view */

  render(): void {
    this.renderList();
    const m = this.map;
    if (!m) {
      this.host.centerEl.replaceChildren(h('div', { class: 'gs-placeholder' }, 'Choose “+ New map” to start one.'));
      this.host.sideEl.replaceChildren();
      return;
    }
    const layerBar = h('div', { class: 'gs-layers', role: 'tablist' }, ...LAYERS.map(([l, label]) =>
      h('button', { type: 'button', class: `gs-layer${this.layer === l ? ' on' : ''}`, onclick: () => { this.layer = l; this.render(); } }, label)));
    const tools: [MapTool, string, string][] = [['paint', '✎', 'Paint'], ['erase', '⌫', 'Erase'], ['fill', '◧', 'Fill'], ['rect', '▭', 'Rectangle']];
    const toolBar = h('div', { class: 'gs-tools' },
      ...tools.map(([t, icon, label]) => h('button', {
        type: 'button', class: `gs-tool${this.tool === t ? ' on' : ''}`, title: label, 'aria-label': label,
        onclick: () => { this.tool = t; this.render(); },
      }, h('span', { class: 'gs-tool-icon' }, icon), h('span', { class: 'gs-tool-label' }, label))),
      h('span', { class: 'gs-sep' }),
      h('button', { type: 'button', class: 'icon-btn', title: 'Undo (Ctrl+Z)', onclick: () => this.history(true) }, '↶'),
      h('button', { type: 'button', class: 'icon-btn', title: 'Redo (Ctrl+Y)', onclick: () => this.history(false) }, '↷'),
      h('span', { class: 'gs-sep' }),
      h('button', { type: 'button', class: 'icon-btn', title: 'Zoom out', onclick: () => this.setZoom(-1) }, '−'),
      h('button', { type: 'button', class: 'icon-btn', title: 'Zoom in', onclick: () => this.setZoom(1) }, '+'),
      h('span', { class: 'gs-sep' }),
      h('button', { type: 'button', class: `btn ghost gs-toggle${this.grid ? ' on' : ''}`, onclick: () => { this.grid = !this.grid; this.render(); } }, 'Grid'),
      h('button', { type: 'button', class: `btn ghost gs-toggle${this.showBlocked ? ' on' : ''}`, title: 'Tint every cell the player can’t walk on (as the ROM sees it)',
        onclick: () => { this.showBlocked = !this.showBlocked; this.render(); } }, 'Show blocked'),
      h('span', { class: 'gs-sep' }),
      h('button', { type: 'button', class: 'btn primary', title: 'Play this map from its start, as the ROM would (includes unsaved changes)',
        onclick: () => this.host.playtest(m.id) }, '▶ Playtest'));
    const help = this.picking ? '' : LAYERS.find(([l]) => l === this.layer)![2];
    const banner = this.picking ? h('div', { class: 'gs-pick-banner' },
      h('span', {}, `Click where the player arrives on “${m.name}”. Pick another map on the left to land there instead.`),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => this.endPick() }, 'Cancel')) : null;
    this.display = h('canvas', { class: 'gs-canvas gs-map-canvas' }) as HTMLCanvasElement;
    this.display.addEventListener('pointerdown', (e) => this.down(e));
    this.display.addEventListener('pointermove', (e) => this.move(e));
    this.display.addEventListener('pointerup', (e) => this.up(e));
    this.display.addEventListener('pointercancel', (e) => this.up(e));
    this.display.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    this.display.addEventListener('contextmenu', (e) => e.preventDefault());
    this.host.centerEl.replaceChildren(layerBar, toolBar, banner ?? h('p', { class: 'gs-help' }, help), h('div', { class: 'gs-scroll' }, this.display));
    requestAnimationFrame(() => this.draw());
    this.renderSide(m);
  }

  fitZoom(m: GbaMap): number {
    const area = this.host.centerEl.querySelector('.gs-scroll')?.getBoundingClientRect();
    const aw = Math.max(200, (area?.width ?? 800) - 24), ah = Math.max(200, (area?.height ?? 600) - 24);
    // Fractional on screen (the canvas is drawn at the next whole size and scaled down, still crisp).
    return Math.max(0.5, Math.min(5, Math.min(aw / (m.width * CELL), ah / (m.height * CELL))));
  }

  setZoom(d: number): void {
    const m = this.map;
    if (!m) return;
    this.zoom = Math.max(1, Math.min(6, Math.round(this.zoom || this.fitZoom(m)) + d));
    this.draw();
  }

  draw(): void {
    const m = this.map, d = this.display;
    if (!m || !d) return;
    const shown = this.zoom || this.fitZoom(m);
    const z = Math.max(1, Math.ceil(shown));
    const W = m.width * CELL * z, H = m.height * CELL * z;
    if (d.width !== W || d.height !== H) { d.width = W; d.height = H; }
    d.style.width = `${Math.round(m.width * CELL * shown)}px`;
    d.style.height = `${Math.round(m.height * CELL * shown)}px`;
    const c = d.getContext('2d')!;
    drawMap(c, m, this.lookup, z);
    const S = CELL * z;
    if (this.showBlocked || this.layer === 'pass') {
      const col = collision(m, this.lookup);
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        const v = col[y * m.width + x];
        if (v & (LEDGE_S | LEDGE_E | LEDGE_W)) {
          c.fillStyle = 'rgba(255,190,60,0.45)';
          c.fillRect(x * S, y * S, S, S);
          c.fillStyle = '#fff';
          c.font = `bold ${Math.max(10, S * 0.6)}px sans-serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(v & LEDGE_S ? '↓' : v & LEDGE_E ? '→' : '←', x * S + S / 2, y * S + S / 2);
        } else if (v & SOLID) {
          c.fillStyle = v & WATER ? 'rgba(80,140,255,0.4)' : 'rgba(255,60,60,0.4)';
          c.fillRect(x * S, y * S, S, S);
        } else if (v & GRASS && this.showBlocked) {
          c.fillStyle = 'rgba(120,255,120,0.18)';
          c.fillRect(x * S, y * S, S, S);
        }
      }
    }
    if (this.layer === 'pass') {
      c.font = `bold ${Math.max(10, S * 0.55)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      m.pass.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === '.') return;
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.fillRect(x * S + S * 0.2, y * S + S * 0.2, S * 0.6, S * 0.6);
        c.fillStyle = ch === 'O' ? '#8ef08e' : '#ff8a8a';
        c.fillText(ch === 'O' ? 'O' : '✕', x * S + S / 2, y * S + S / 2 + 1);
      }));
    }
    if (this.layer === 'cliff') {
      // show the tier numbers faintly
      c.font = `${Math.max(9, S * 0.4)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = 'rgba(255,255,255,0.55)';
      for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
        const lv = m.level[y][x];
        if (lv) c.fillText(String(lv), x * S + S / 2, y * S + S / 2);
      }
    }
    if (this.grid && z >= 2) {
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= m.width; x++) { c.moveTo(x * S + 0.5, 0); c.lineTo(x * S + 0.5, H); }
      for (let y = 0; y <= m.height; y++) { c.moveTo(0, y * S + 0.5); c.lineTo(W, y * S + 0.5); }
      c.stroke();
      // the GBA screen size, around the start
      if (m.start) {
        c.strokeStyle = 'rgba(255,176,74,0.5)';
        c.setLineDash([6, 4]);
        const sx = Math.max(0, Math.min(m.width - 15, m.start[0] - 7)), sy = Math.max(0, Math.min(m.height - 10, m.start[1] - 5));
        c.strokeRect(sx * S + 0.5, sy * S + 0.5, Math.min(15, m.width) * S, Math.min(10, m.height) * S);
        c.setLineDash([]);
      }
    }
    if (m.start) {
      const [x, y] = m.start;
      c.fillStyle = 'rgba(255,176,74,0.9)';
      c.beginPath();
      c.arc(x * S + S / 2, y * S + S / 2, S * 0.32, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#2a1606';
      c.font = `bold ${Math.max(9, S * 0.4)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('S', x * S + S / 2, y * S + S / 2 + 1);
    }
    this.drawEvents(c, m, z);
    // rectangle preview / hover
    const box = this.drag && this.tool === 'rect' ? this.rectOf(this.drag.start, this.drag.last) : this.hover ? [this.hover[0], this.hover[1], this.hover[0], this.hover[1]] : null;
    if (box) {
      const [x0, y0, x1, y1] = box;
      c.strokeStyle = this.drag?.erase || this.tool === 'erase' ? '#ff7b6b' : '#ffffff';
      c.lineWidth = 2;
      c.strokeRect(x0 * S + 1, y0 * S + 1, (x1 - x0 + 1) * S - 2, (y1 - y0 + 1) * S - 2);
    }
  }

  /** People are always drawn (they're part of the scene); markers and names on the Events layer. */
  drawEvents(c: CanvasRenderingContext2D, m: GbaMap, z: number): void {
    const S = CELL * z;
    for (const e of m.events ?? []) {
      const sp = e.sprite ? this.host.sprites().find((s) => s.id === e.sprite) : undefined;
      const img = sp ? this.host.spriteImage(sp) : undefined;
      const f = e.dir ?? 'down';
      if (img) {
        c.save();
        c.imageSmoothingEnabled = false;
        if (f === 'right') { c.translate((e.x + 1) * S, 0); c.scale(-1, 1); c.drawImage(img, 0, ROW_OF[f] * 32, 16, 32, 0, (e.y - 1) * S, S, 2 * S); }
        else c.drawImage(img, 0, ROW_OF[f] * 32, 16, 32, e.x * S, (e.y - 1) * S, S, 2 * S);
        c.restore();
      }
      if (this.layer !== 'events') continue;
      const on = e.id === this.selEvent;
      c.strokeStyle = on ? '#ffd34d' : 'rgba(120,200,255,0.95)';
      c.lineWidth = on ? 3 : 2;
      c.strokeRect(e.x * S + 1.5, e.y * S + 1.5, S - 3, S - 3);
      if (!img) {
        c.fillStyle = 'rgba(30,60,110,0.75)';
        c.fillRect(e.x * S + 3, e.y * S + 3, S - 6, S - 6);
        c.fillStyle = '#fff';
        c.font = `bold ${Math.max(9, S * 0.45)}px sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(e.trigger === 'touch' ? '⇥' : '!', e.x * S + S / 2, e.y * S + S / 2 + 1);
      }
      c.font = `${Math.max(9, Math.min(12, S * 0.32))}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      const tw = c.measureText(e.name).width;
      c.fillStyle = 'rgba(0,0,0,0.65)';
      c.fillRect(e.x * S + S / 2 - tw / 2 - 2, (e.y + 1) * S, tw + 4, Math.max(11, S * 0.36));
      c.fillStyle = on ? '#ffd34d' : '#cfe6ff';
      c.fillText(e.name, e.x * S + S / 2, (e.y + 1) * S + 1);
    }
  }

  rectOf(a: [number, number], b: [number, number]): [number, number, number, number] {
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }

  /* ------------------------------------------------------------------ painting */

  cellAt(e: PointerEvent): [number, number] | null {
    const m = this.map, d = this.display;
    if (!m || !d) return null;
    const r = d.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * m.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * m.height);
    return x >= 0 && y >= 0 && x < m.width && y < m.height ? [x, y] : null;
  }

  down(e: PointerEvent): void {
    const m = this.map, p = this.cellAt(e);
    if (!m || !p) return;
    e.preventDefault();
    if (this.picking) { this.pickTarget(m, p); return; }
    if (this.layer === 'events') { this.eventDown(m, p, e); return; }
    this.display!.setPointerCapture(e.pointerId);
    const erase = e.button === 2 || this.tool === 'erase';
    if (!erase && this.needsBrush() && !this.currentBrush()) {
      toast(`Pick a tile on the right first${this.availableTiles().length ? '' : ' (make one in the Tiles tab)'}`, 'error');
      return;
    }
    this.drag = { start: p, last: p, erase, before: JSON.stringify(m) };
    if (this.layer === 'start') { m.start = p; this.finish(); return; }
    if (this.tool === 'fill' && !erase) { this.flood(m, p); this.finish(); return; }
    if (this.tool !== 'rect') this.apply(m, p[0], p[1], erase);
    this.draw();
  }

  move(e: PointerEvent): void {
    const m = this.map, p = this.cellAt(e);
    if (!m) return;
    this.hover = p;
    if (this.moveEv && p) {
      const ev = m.events?.find((x) => x.id === this.moveEv!.id);
      if (ev && (ev.x !== p[0] || ev.y !== p[1]) && !eventAt(m, p[0], p[1])) { ev.x = p[0]; ev.y = p[1]; this.moveEv.moved = true; }
    }
    if (this.drag && p && (p[0] !== this.drag.last[0] || p[1] !== this.drag.last[1])) {
      if (this.tool === 'paint' || this.tool === 'erase' || (this.drag.erase && this.tool !== 'rect')) this.apply(m, p[0], p[1], this.drag.erase);
      this.drag.last = p;
    }
    this.draw();
  }

  up(e: PointerEvent): void {
    const m = this.map;
    if (m && this.moveEv) {
      if (this.moveEv.moved) this.pushUndo(m, this.moveEv.before);
      this.moveEv = null;
      this.draw();
      return;
    }
    if (!m || !this.drag) return;
    if (this.tool === 'rect') {
      const p = this.cellAt(e) ?? this.drag.last;
      const [x0, y0, x1, y1] = this.rectOf(this.drag.start, p);
      const step = this.stampSize();
      for (let y = y0; y <= y1; y += this.drag.erase ? 1 : step[1]) for (let x = x0; x <= x1; x += this.drag.erase ? 1 : step[0]) this.apply(m, x, y, this.drag.erase, true);
    }
    this.finish();
  }

  finish(): void {
    const m = this.map;
    if (!m || !this.drag) return;
    const after = JSON.stringify(m);
    if (after !== this.drag.before) {
      const stack = this.undo.get(m.id) ?? [];
      stack.push(this.drag.before);
      if (stack.length > 80) stack.shift();
      this.undo.set(m.id, stack);
      this.redo.set(m.id, []);
      this.host.touchMap(m.id);
    }
    this.drag = null;
    this.draw();
    if (this.layer === 'start') this.renderSide(m);
  }

  pushUndo(m: GbaMap, before: string): void {
    const stack = this.undo.get(m.id) ?? [];
    stack.push(before);
    if (stack.length > 80) stack.shift();
    this.undo.set(m.id, stack);
    this.redo.set(m.id, []);
    this.host.touchMap(m.id);
  }

  /* ------------------------------------------------------------------ events */

  eventDown(m: GbaMap, [x, y]: [number, number], e: PointerEvent): void {
    const hit = eventAt(m, x, y);
    const before = JSON.stringify(m);
    if (e.button === 2) {
      if (!hit) return;
      m.events = (m.events ?? []).filter((v) => v !== hit);
      if (this.selEvent === hit.id) this.selEvent = undefined;
      this.pushUndo(m, before);
      this.draw();
      this.renderSide(m);
      return;
    }
    if (hit) {
      this.selEvent = hit.id;
      this.moveEv = { id: hit.id, before, moved: false };
      this.display!.setPointerCapture(e.pointerId);
    } else {
      const id = Math.max(0, ...(m.events ?? []).map((v) => v.id)) + 1;
      const ev: GbaEvent = { id, name: `EV${String(id).padStart(3, '0')}`, x, y, trigger: 'action', solid: true, commands: [{ type: 'text', text: '' }] };
      m.events = [...(m.events ?? []), ev];
      this.selEvent = id;
      this.pushUndo(m, before);
    }
    this.draw();
    this.renderSide(m);
  }

  /** Change the selected event (with undo) and redraw. */
  editEvent(m: GbaMap, ev: GbaEvent, fn: (ev: GbaEvent) => void, rerender = false): void {
    const before = JSON.stringify(m);
    fn(ev);
    this.pushUndo(m, before);
    this.draw();
    if (rerender) this.renderSide(m);
  }

  startPick(m: GbaMap, ev: GbaEvent, cmd: number): void {
    const c = ev.commands[cmd];
    if (c?.type !== 'transfer') return;
    this.picking = { from: m.id, ev: ev.id, cmd };
    if (this.host.maps.has(c.map)) this.sel = c.map;
    this.zoom = 0;
    this.render();
  }

  pickTarget(target: GbaMap, [x, y]: [number, number]): void {
    const pk = this.picking!;
    const from = this.host.maps.get(pk.from);
    const ev = from?.events?.find((v) => v.id === pk.ev);
    const c = ev?.commands[pk.cmd];
    if (from && c?.type === 'transfer') {
      const before = JSON.stringify(from);
      c.map = target.id;
      c.x = x;
      c.y = y;
      this.pushUndo(from, before);
      toast(`The player will arrive on “${target.name}” at ${x + 1}, ${y + 1}`);
    }
    this.endPick();
  }

  endPick(): void {
    const pk = this.picking;
    this.picking = null;
    if (pk) { this.sel = pk.from; this.layer = 'events'; this.selEvent = pk.ev; }
    this.zoom = 0;
    this.render();
  }

  eventCard(m: GbaMap): HTMLElement {
    const ev = m.events?.find((v) => v.id === this.selEvent);
    const card = h('section', { class: 'gs-card' }, h('h3', {}, 'Event'));
    if (!ev) {
      card.append(h('p', { class: 'hint' }, `${(m.events ?? []).length} event(s) on this map. Click an empty cell to add one, or click an event to edit it.`),
        h('p', { class: 'hint' }, 'A person: pick a sprite, “Talk (A button)”, and a Show text. A sign: no sprite, on the signpost. A door: “Step on it” and a Transfer.'));
      return card;
    }
    const sprites = this.host.sprites().filter((s) => s.kind === 'overworld');
    const ed = (fn: (ev: GbaEvent) => void, rerender = false) => this.editEvent(m, ev, fn, rerender);
    card.append(h('div', { class: 'gs-form' },
      field('Name', textInput(ev.name, (v) => ed((x) => { x.name = v.trim() || x.name; }))),
      h('p', { class: 'gs-kv' }, h('span', {}, 'Where'), h('span', {}, `column ${ev.x + 1}, row ${ev.y + 1} (drag it on the map to move it)`)),
      field('Sprite', select([['', 'None (sign, door, trigger)'], ...sprites.map((s): [string, string] => [s.id, s.name])], ev.sprite ?? '',
        (v) => ed((x) => { x.sprite = v || undefined; }, true)), 'Overworld sprites from the Sprites tab.'),
      ev.sprite ? field('Facing', select(FACINGS.map((f): [string, string] => [f, FACING_LABEL[f]]), ev.dir ?? 'down', (v) => ed((x) => { x.dir = v as Facing; }))) : null,
      field('Starts when', select([['action', 'The player faces it and presses A'], ['touch', 'The player steps on it (doors)']], ev.trigger,
        (v) => ed((x) => { x.trigger = v as GbaEvent['trigger']; }, true))),
      ev.sprite ? checkbox('Blocks the way', ev.solid !== false, (v) => ed((x) => { x.solid = v; })) : null));

    const cmds = h('div', { class: 'gs-cmds' });
    ev.commands.forEach((c, i) => {
      const title = { text: 'Show text', transfer: 'Transfer player', item: 'Give item', battle: 'Start battle' }[c.type];
      const head = h('div', { class: 'gs-cmd-head' }, h('span', {}, title),
        h('button', { type: 'button', class: 'icon-btn', title: 'Move up', disabled: i === 0, onclick: () => ed((x) => { [x.commands[i - 1], x.commands[i]] = [x.commands[i], x.commands[i - 1]]; }, true) }, '↑'),
        h('button', { type: 'button', class: 'icon-btn', title: 'Move down', disabled: i === ev.commands.length - 1, onclick: () => ed((x) => { [x.commands[i + 1], x.commands[i]] = [x.commands[i], x.commands[i + 1]]; }, true) }, '↓'),
        h('button', { type: 'button', class: 'icon-btn', title: 'Remove', onclick: () => ed((x) => { x.commands.splice(i, 1); }, true) }, '✕'));
      const box = h('div', { class: 'gs-cmd' }, head);
      if (c.type === 'text') {
        const ta = h('textarea', { placeholder: 'What they say. Long text wraps; a blank line starts a new box.' }) as HTMLTextAreaElement;
        ta.value = c.text;
        ta.addEventListener('change', () => ed(() => { c.text = ta.value; }));
        const speakers: [string, string][] = [['', 'Nobody (a sign, a narrator)'], ['player', 'The player'],
          ...(m.events ?? []).map((v): [string, string] => [`ev:${v.id}`, v.id === ev.id ? `${v.name} (this event)` : v.name])];
        box.append(ta,
          field('Speaker', select(speakers, c.speaker ?? '', (v) => ed(() => { c.speaker = v || undefined; if (!v) c.bubble = undefined; }, true))),
          c.speaker ? checkbox('Word bubble over the speaker (instead of the box at the bottom)', !!c.bubble, (v) => ed(() => { c.bubble = v || undefined; })) : '');
      } else if (c.type === 'item') {
        const items = this.host.items();
        box.append(
          items.length ? field('Item', select(items.map((x): [string, string] => [x.id, x.name]), c.item, (v) => ed(() => { c.item = v; }))) : h('p', { class: 'hint' }, 'No items in the Database yet.'),
          field('How many', numberInput(c.count, (v) => ed(() => { c.count = Math.max(1, Math.min(99, Math.round(v))); }), { min: 1, max: 99 })),
          h('p', { class: 'hint' }, 'Shows “You got …!” and adds it to the bag.'));
      } else if (c.type === 'battle') {
        const troops = this.host.troops();
        box.append(
          troops.length ? field('Troop', select(troops.map((x): [string, string] => [x.id, x.name]), c.troop, (v) => ed(() => { c.troop = v; }))) : h('p', { class: 'hint' }, 'No troops in the Database yet (Database → Troops).'),
          h('p', { class: 'hint' }, 'GBA battles aren’t built yet: the playtest offers the Saturn battle preview with this troop, and the ROM shows a note.'));
      } else {
        const maps = this.host.mapIds().map((id): [string, string] => [id, this.host.maps.get(id)?.name ?? id]);
        const tgt = this.host.maps.get(c.map);
        box.append(
          field('Map', select(maps, c.map, (v) => ed(() => { c.map = v; }, true))),
          h('div', { class: 'gs-size' },
            field('Column', numberInput(c.x + 1, (v) => ed(() => { c.x = Math.max(0, Math.round(v) - 1); }), { min: 1, max: tgt?.width ?? 128 })),
            field('Row', numberInput(c.y + 1, (v) => ed(() => { c.y = Math.max(0, Math.round(v) - 1); }), { min: 1, max: tgt?.height ?? 128 }))),
          field('Then facing', select([['', 'Same as before'], ...FACINGS.map((f): [string, string] => [f, FACING_LABEL[f]])], c.dir ?? '', (v) => ed(() => { c.dir = (v || undefined) as Facing | undefined; }))),
          h('button', { type: 'button', class: 'btn small', onclick: () => this.startPick(m, ev, i) }, 'Pick the spot on the map…'));
      }
      cmds.append(box);
    });
    const add = (c: GbaCommand) => ed((x) => { x.commands.push(c); }, true);
    card.append(h('h3', {}, 'What happens'), cmds,
      h('div', { class: 'gs-actions' },
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => add({ type: 'text', text: '' }) }, '+ Show text'),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => add({ type: 'transfer', map: m.id, x: m.start?.[0] ?? 0, y: m.start?.[1] ?? 0 }) }, '+ Transfer player'),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => add({ type: 'item', item: this.host.items()[0]?.id ?? '', count: 1 }) }, '+ Give item'),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => add({ type: 'battle', troop: this.host.troops()[0]?.id ?? '' }) }, '+ Start battle'),
        h('button', { type: 'button', class: 'btn ghost small', title: 'Items, troops, enemies and the rest of the Database', onclick: () => this.host.openDatabase() }, 'Database…')),
      h('div', { class: 'gs-actions' },
        h('button', { type: 'button', class: 'btn ghost small', title: 'Play this map starting next to this event', onclick: () => {
          const spots: [number, number, Facing][] = [[0, 1, 'up'], [0, -1, 'down'], [-1, 0, 'right'], [1, 0, 'left']];
          const col = collision(m, this.lookup);
          const ok = spots.find(([dx, dy]) => { const x = ev.x + dx, y = ev.y + dy; return x >= 0 && y >= 0 && x < m.width && y < m.height && !(col[y * m.width + x] & SOLID) && !eventAt(m, x, y); });
          this.host.playtest(m.id, ok ? { x: ev.x + ok[0], y: ev.y + ok[1], dir: ok[2] } : undefined);
        } }, '▶ Play from here'),
        h('button', { type: 'button', class: 'btn ghost small danger', onclick: () => {
          const before = JSON.stringify(m);
          m.events = (m.events ?? []).filter((v) => v !== ev);
          this.selEvent = undefined;
          this.pushUndo(m, before);
          this.draw();
          this.renderSide(m);
        } }, 'Delete event')));
    return card;
  }

  history(isUndo: boolean): void {
    const m = this.map;
    if (!m) return;
    const from = (isUndo ? this.undo : this.redo).get(m.id) ?? [];
    const snap = from.pop();
    if (!snap) return;
    const to = isUndo ? this.redo : this.undo;
    to.set(m.id, [...(to.get(m.id) ?? []), JSON.stringify(m)]);
    Object.assign(m, JSON.parse(snap) as GbaMap);
    this.host.touchMap(m.id);
    this.draw();
  }

  needsBrush(): boolean { return !!LAYER_TYPES[this.layer]; }
  availableTiles(): GbaTile[] { const types = LAYER_TYPES[this.layer]; return types ? this.host.tiles().filter((t) => types.includes(t.type)) : []; }
  currentBrush(): GbaTile | undefined {
    const id = this.brush[this.layer];
    return this.availableTiles().find((t) => t.id === id);
  }

  /** The map's tile-list index (+1) for a tile id, adding it if needed. */
  ref(m: GbaMap, id: string): number {
    let i = m.tiles.indexOf(id);
    if (i < 0) { m.tiles.push(id); i = m.tiles.length - 1; }
    return i + 1;
  }

  stampSize(): [number, number] {
    const t = this.currentBrush();
    return this.layer === 'objects' && t?.type === 'object' ? [t.w ?? 2, t.h ?? 2] : [1, 1];
  }

  apply(m: GbaMap, x: number, y: number, erase: boolean, fromRect = false): void {
    const t = this.currentBrush();
    switch (this.layer) {
      case 'ground': m.ground[y][x] = erase || !t ? 0 : this.ref(m, t.id); break;
      case 'terrain': m.terrain[y][x] = erase || !t ? 0 : this.ref(m, t.id); break;
      case 'cliff':
        if (erase) {
          if (m.level[y][x] >= this.tier) m.level[y][x] = this.tier - 1;
          if (!m.level[y][x]) m.cliff[y][x] = 0;
        } else if (t) {
          m.cliff[y][x] = this.ref(m, t.id);
          m.level[y][x] = this.tier;
        }
        break;
      case 'objects': {
        const covers = (o: { t: number; x: number; y: number }, cx: number, cy: number) =>
          footprint(m, o.t, o.x, o.y, this.lookup).some(([fx, fy]) => fx === cx && fy === cy);
        if (erase || !t) { m.objects = m.objects.filter((o) => !covers(o, x, y)); break; }
        const idx = this.ref(m, t.id);
        const [w, hh] = t.type === 'object' ? [t.w ?? 2, t.h ?? 2] : [1, 1];
        // Click where the trunk / base goes: big objects grow up and to the right from there.
        const ax = x, ay = fromRect ? y : y - (hh - 1);
        if (ax + w > m.width || ay < 0 || ay + hh > m.height) break;
        const cells = footprint(m, idx, ax, ay, this.lookup);
        m.objects = m.objects.filter((o) => !cells.some(([cx, cy]) => covers(o, cx, cy)));
        const o: GbaMap['objects'][number] = { t: idx, x: ax, y: ay };
        if (t.type === 'ledge') o.p = this.ledgePiece;
        m.objects.push(o);
        break;
      }
      case 'pass': {
        const row = [...m.pass[y]];
        row[x] = erase ? '.' : this.passBrush;
        m.pass[y] = row.join('');
        break;
      }
      default: break;
    }
  }

  /** Flood fill: the connected area with the same value on this layer. */
  flood(m: GbaMap, [sx, sy]: [number, number]): void {
    const grid = this.layer === 'ground' ? m.ground : this.layer === 'terrain' ? m.terrain : this.layer === 'cliff' ? m.level : null;
    if (!grid) { this.apply(m, sx, sy, false); return; }
    const target = grid[sy][sx];
    const seen = new Uint8Array(m.width * m.height);
    const stack: [number, number][] = [[sx, sy]];
    let count = 0;
    while (stack.length && count < 20000) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= m.width || y >= m.height || seen[y * m.width + x] || grid[y][x] !== target) continue;
      seen[y * m.width + x] = 1;
      count++;
      this.apply(m, x, y, false);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  /* ------------------------------------------------------------------ side panel */

  tileThumb(t: GbaTile): HTMLCanvasElement {
    const img = this.host.tileImage(t);
    const c = document.createElement('canvas');
    c.width = c.height = 40;
    c.className = 'gs-tile-thumb';
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#2a3a2a';
    g.fillRect(0, 0, 40, 40);
    let sx = 0, sy = 0, sw = CELL, sh = CELL;
    if (t.type === 'cliff') { sx = 0; sy = 2 * CELL; sw = 2 * CELL; }       // corner + face
    else if (TILE_TYPES[t.type].autotile) { sx = CELL; sy = CELL; }          // the middle
    else if (t.type === 'object') { sw = (t.w ?? 2) * CELL; sh = (t.h ?? 2) * CELL; }
    else if (t.type === 'ledge') { sx = CELL; }
    const s = Math.min(40 / sw, 40 / sh);
    g.drawImage(img, sx, sy, sw, sh, (40 - sw * s) / 2, (40 - sh * s) / 2, sw * s, sh * s);
    return c;
  }

  renderSide(m: GbaMap): void {
    const cards: HTMLElement[] = [];
    if (this.needsBrush()) {
      const tiles = this.availableTiles();
      if (!this.currentBrush() && tiles[0]) this.brush[this.layer] = tiles[0].id;
      const grid = h('div', { class: 'gs-tile-grid' }, ...tiles.map((t) => h('button', {
        type: 'button', class: `gs-tile-pick${this.brush[this.layer] === t.id ? ' on' : ''}`, title: `${t.name} (${TILE_TYPES[t.type].label})`,
        onclick: () => { this.brush[this.layer] = t.id; if (this.tool === 'erase') this.tool = 'paint'; this.render(); },
      }, this.tileThumb(t), h('span', {}, t.name))));
      const card = h('section', { class: 'gs-card' }, h('h3', {}, 'Tiles'),
        tiles.length ? grid : h('p', { class: 'hint' }, `No ${LAYER_TYPES[this.layer]!.map((ty) => TILE_TYPES[ty].label.toLowerCase()).join(' or ')} tiles yet.`),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => this.host.goToTiles() }, 'Make or edit tiles…'));
      if (this.layer === 'cliff') {
        card.append(h('div', { class: 'gs-tiers' }, h('span', {}, 'Tier:'),
          ...Array.from({ length: MAX_TIER }, (_, i) => h('button', { type: 'button', class: `btn${this.tier === i + 1 ? ' primary' : ''}`, onclick: () => { this.tier = i + 1; this.render(); } }, String(i + 1)))),
          h('p', { class: 'hint' }, 'Erasing removes this tier and the ones above it. Numbers on the map show each cell’s tier.'));
      }
      if (this.layer === 'objects' && this.currentBrush()?.type === 'ledge') {
        const t = this.currentBrush()!;
        card.append(h('div', { class: 'gs-ledges' }, ...LEDGE_PIECES.map((label, i) => {
          const c = document.createElement('canvas');
          c.width = c.height = 32;
          const g = c.getContext('2d')!;
          g.imageSmoothingEnabled = false;
          const [lx, ly] = ledgeCell(i);
          g.drawImage(this.host.tileImage(t), lx * CELL, ly * CELL, CELL, CELL, 0, 0, 32, 32);
          return h('button', { type: 'button', class: `gs-tile-pick${this.ledgePiece === i ? ' on' : ''}`, title: label, onclick: () => { this.ledgePiece = i; this.render(); } }, c, h('span', {}, label));
        })));
      }
      cards.push(card);
    } else if (this.layer === 'pass') {
      cards.push(h('section', { class: 'gs-card' }, h('h3', {}, 'Passability'),
        h('div', { class: 'gs-tiers' }, ...([['O', 'O · walkable'], ['X', '✕ · blocked'], ['.', 'Clear']] as const).map(([v, label]) =>
          h('button', { type: 'button', class: `btn${this.passBrush === v ? ' primary' : ''}`, onclick: () => { this.passBrush = v; if (this.tool === 'erase') this.tool = 'paint'; this.render(); } }, label))),
        h('p', { class: 'hint' }, 'Red tint: blocked. Blue: water. Orange arrows: ledges (hop that way). Overrides win over everything drawn.')));
    } else if (this.layer === 'events') {
      cards.push(this.eventCard(m));
    } else if (this.layer === 'start') {
      cards.push(h('section', { class: 'gs-card' }, h('h3', {}, 'Start'),
        h('p', {}, m.start ? `The player starts at column ${m.start[0] + 1}, row ${m.start[1] + 1}.` : 'No start yet.'),
        field('Facing', select(FACINGS.map((f): [string, string] => [f, FACING_LABEL[f]]), m.dir ?? 'down', (v) => { m.dir = v as Facing; this.host.touchMap(m.id); })),
        h('p', { class: 'hint' }, 'The dashed box shows how much of the map the GBA screen shows around it.')));
    }

    let w = m.width, hh = m.height;
    cards.push(h('section', { class: 'gs-card' }, h('div', { class: 'gs-form' },
      h('h3', {}, 'Map'),
      field('Name', textInput(m.name, (v) => { m.name = v; this.host.touchMap(m.id); this.renderList(); })),
      h('div', { class: 'gs-size' },
        field('Width', numberInput(w, (v) => { w = v; }, { min: 15, max: 128 })),
        field('Height', numberInput(hh, (v) => { hh = v; }, { min: 10, max: 128 }))),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => {
        const nw = Math.max(15, Math.min(128, w)), nh = Math.max(10, Math.min(128, hh));
        if (nw === m.width && nh === m.height) return;
        const before = JSON.stringify(m);
        const g0 = m.ground[0]?.[0] ?? 0;
        resizeMap(m, nw, nh, g0);
        this.undo.set(m.id, [...(this.undo.get(m.id) ?? []), before]);
        this.host.touchMap(m.id);
        this.zoom = 0;
        this.render();
      } }, 'Apply size'),
      checkbox('The ROM starts on this map', this.host.startMap() === m.id, (v) => { this.host.setStartMap(v ? m.id : undefined); this.host.touchData(); this.renderList(); }),
      h('button', { type: 'button', class: 'btn ghost small danger', onclick: () => confirmModal('Delete map', `Delete “${m.name}”? Its file stays in the project folder until you remove it.`, 'Delete', () => {
        this.host.maps.delete(m.id);
        this.host.removeMapId(m.id);
        if (this.host.startMap() === m.id) this.host.setStartMap(undefined);
        this.host.touchData();
        this.sel = undefined;
        this.render();
      }, true) }, 'Delete map'))));
    this.host.sideEl.replaceChildren(...cards);
  }

  key(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { this.history(!e.shiftKey); return true; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { this.history(false); return true; }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (this.picking && e.key === 'Escape') { this.endPick(); return true; }
    if (this.layer === 'events' && (e.key === 'Delete' || e.key === 'Backspace') && this.map && this.selEvent) {
      const m = this.map, before = JSON.stringify(m);
      m.events = (m.events ?? []).filter((v) => v.id !== this.selEvent);
      this.selEvent = undefined;
      this.pushUndo(m, before);
      this.render();
      return true;
    }
    const tool = ({ b: 'paint', p: 'paint', e: 'erase', g: 'fill', r: 'rect' } as Record<string, MapTool>)[k];
    if (tool) { this.tool = tool; this.render(); return true; }
    if (k === '+' || k === '=') { this.setZoom(1); return true; }
    if (k === '-') { this.setZoom(-1); return true; }
    return false;
  }
}
