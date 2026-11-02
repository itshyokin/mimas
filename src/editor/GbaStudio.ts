/**
 * GBA Studio: paint tiles and sprites with real GBA palettes.
 *
 *  - Tiles: pick a type (ground, path, water, cliff, ledge…) and paint over a
 *    template that shows which piece goes where; the preview builds a sample
 *    shape from the pieces so corners can be checked while painting.
 *  - Sprites: overworld characters (16×32, walk + run), battle back-sprites
 *    (64×64 poses) and battle front sprites, starting from a mannequin.
 *  - Palettes: 15 colors each, snapped to what the GBA can show.
 *
 * Saves public/data/gba.json and PNGs under public/gba/ (read by tools/export.py).
 */
import './gbaStudio.css';
import { checkbox, confirmModal, field, h, numberInput, openModal, select, textInput, toast } from './dom';
import type { EditorStore } from './store';
import { SAMPLE_SHAPE, drawQuarters, quarters } from '../gba/autotile';
import { loadGba, setGba } from './gbaShared';
import { openDatabase } from './DatabaseEditor';
import { saveDatabase } from './io';
import { soundField } from './CommandEditor';
import { ELEMENT_RAMPS, effectFrames } from '../gba/effects';
import type { Element } from '../world/types';
import {
  CELL, SPRITE_KINDS, TILE_TYPES, defaultGbaData, gbaColor, hexToRgb, ledgeCell, tileSize,
  type GbaData, type GbaPalette, type GbaSprite, type GbaTile, type Passage, type SpriteKind, type TileType,
} from '../gba/types';

type Tab = 'tiles' | 'sprites' | 'palettes';
type Tool = 'pencil' | 'erase' | 'fill' | 'pick' | 'line' | 'rect' | 'cell';
type Item = { kind: 'tile'; t: GbaTile } | { kind: 'sprite'; s: GbaSprite };

const TOOLS: [Tool, string, string, string][] = [
  ['pencil', '✎', 'Paint', 'B'],
  ['erase', '⌫', 'Erase (or right-click)', 'E'],
  ['fill', '◧', 'Fill (stays inside one cell)', 'G'],
  ['pick', '⊙', 'Pick a color', 'I'],
  ['line', '╱', 'Line', 'L'],
  ['rect', '▭', 'Rectangle', 'R'],
  ['cell', '⬚', 'Select a cell (to copy, paste or flip it)', 'S'],
];

let open = false;

export async function openGbaStudio(store: EditorStore): Promise<void> {
  if (open) return;
  open = true;
  try {
    const studio = new Studio(store);
    await studio.load();
    studio.mount();
  } catch (err) {
    open = false;
    toast(`GBA Studio couldn’t open: ${(err as Error).message}`, 'error');
  }
}

/* ======================================================================= helpers */

function prefBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
}

function setPref(key: string, v: boolean): void {
  try { localStorage.setItem(key, v ? '1' : '0'); } catch { /* not kept */ }
}

function slug(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}_${n++}`;
  return id;
}

function blankCanvas(w: number, hgt: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  return c;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d', { willReadFrequently: true })!;
}

function resizeCanvas(src: HTMLCanvasElement, w: number, hgt: number): HTMLCanvasElement {
  const c = blankCanvas(w, hgt);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

async function blobToCanvas(b: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(b);
  const c = blankCanvas(bmp.width, bmp.height);
  ctx2d(c).drawImage(bmp, 0, 0);
  return c;
}

function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
}

/** Snap every pixel to the nearest palette color (half-transparent and below become transparent). */
function snapToPalette(c: HTMLCanvasElement, pal: GbaPalette): void {
  const g = ctx2d(c);
  const img = g.getImageData(0, 0, c.width, c.height);
  const cols = pal.colors.map(hexToRgb);
  const cache = new Map<number, number>();
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let best = cache.get(key);
    if (best === undefined) {
      let bd = Infinity;
      best = 0;
      cols.forEach(([r, gg, b], k) => {
        const dist = (r - d[i]) ** 2 + (gg - d[i + 1]) ** 2 + (b - d[i + 2]) ** 2;
        if (dist < bd) { bd = dist; best = k; }
      });
      cache.set(key, best);
    }
    const [r, gg, b] = cols[best];
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

/* ======================================================================= studio */

class Studio {
  data: GbaData = defaultGbaData();
  images = new Map<string, HTMLCanvasElement>();
  dirtyImages = new Set<string>();
  dirtyJson = false;
  tab: Tab = 'tiles';
  sel: { tiles?: string; sprites?: string; palettes?: string } = {};
  tool: Tool = 'pencil';
  color = 1;                 // 0 = transparent, 1..15 = palette slot
  zoom = 0;                  // 0 = fit
  frame = 0;                 // water animation frame being painted
  mirror = false;
  onion = false;
  grid = prefBool('mimas.gs.grid', true);
  undo = new Map<string, ImageData[]>();
  redo = new Map<string, ImageData[]>();
  previewGround = '';
  previewRun = false;
  previewPose = 0;
  /** Effects: the element a hit is previewed in. */
  previewElement: Element = 'neutral';
  /** The selected cells (column, row): from cellSel to cellEnd. Follows the last cell clicked; drag with ⬚ for more. */
  cellSel: [number, number] = [0, 0];
  cellEnd: [number, number] = [0, 0];
  selecting = false;
  /** Copied cells (row by row), kept while the studio is open (works across tiles and sprites). */
  clip: { cols: number; rows: number; cells: HTMLCanvasElement[] } | null = null;
  labels = prefBool('mimas.gs.labels', true);

  root!: HTMLElement;
  listEl!: HTMLElement;
  centerEl!: HTMLElement;
  sideEl!: HTMLElement;
  statusEl!: HTMLElement;
  display!: HTMLCanvasElement;
  previewCanvas!: HTMLCanvasElement;
  previewTimer = 0;
  stroke: { start: [number, number]; last: [number, number]; erase: boolean; before: ImageData } | null = null;
  hover: [number, number] | null = null;
  onKey = (e: KeyboardEvent) => this.key(e);
  onResize = () => { if (!this.zoom) this.drawDisplay(); };

  constructor(public store: EditorStore) {}

  /** The Database (items, troops, enemies…), over the studio. Its changes are saved with the studio's Save too. */
  openDb(): void {
    openDatabase(this.store);
    // the Database window closes on its own; refresh the event card's lists afterwards
    const watch = window.setInterval(() => {
      if (!document.querySelector('.overlay')) { clearInterval(watch); this.renderStatus(); }
    }, 400);
  }

  /* ----------------------------------------------------------------- load & save */

  async load(): Promise<void> {
    const project = this.store.project;
    try {
      const text = await (await project.readFile('data/gba.json')).text();
      const parsed = JSON.parse(text) as GbaData;
      if (parsed && Array.isArray(parsed.palettes)) this.data = parsed;
    } catch { this.dirtyJson = true; /* first time: start from the defaults */ }
    const paths = [...this.data.tiles.map((t) => t.image), ...this.data.sprites.map((s) => s.image)];
    await Promise.all(paths.map(async (p) => {
      try { this.images.set(p, await blobToCanvas(await project.readFile(p))); } catch { /* made below */ }
    }));
    this.migrateLedges();
    for (const s of this.data.sprites) await this.ensureSpriteImage(s);
    this.sel.tiles = this.data.tiles[0]?.id;
    this.sel.sprites = this.data.sprites[0]?.id;
    this.sel.palettes = this.data.palettes[0]?.id;
    this.previewGround = this.data.tiles.find((t) => t.type === 'ground')?.id ?? '';
  }

  /**
   * Ledges used to be 5 pieces in a row (south left / middle / right, east, west). Now east and west
   * have a top, middle and bottom: the old east / west piece fills all three, and maps move along.
   */
  migrateLedges(): void {
    for (const t of this.data.tiles) {
      const old = this.images.get(t.image);
      if (t.type === 'ledge' && old && old.height === CELL) {
        const img = blankCanvas(5 * CELL, 3 * CELL);
        const c = ctx2d(img);
        c.drawImage(old, 0, 0, 3 * CELL, CELL, 0, 0, 3 * CELL, CELL);
        for (let r = 0; r < 3; r++) {
          c.drawImage(old, 3 * CELL, 0, CELL, CELL, 3 * CELL, r * CELL, CELL, CELL);
          c.drawImage(old, 4 * CELL, 0, CELL, CELL, 4 * CELL, r * CELL, CELL, CELL);
        }
        this.images.set(t.image, img);
        this.dirtyImages.add(t.image);
      }
      this.ensureTileImage(t);
    }
  }

  ensureTileImage(t: GbaTile): HTMLCanvasElement {
    const { cols, rows, frames } = tileSize(t);
    const w = cols * CELL, hgt = rows * CELL * frames;
    let c = this.images.get(t.image);
    if (!c) { c = blankCanvas(w, hgt); this.images.set(t.image, c); this.dirtyImages.add(t.image); }
    else if (c.width !== w || c.height !== hgt) { c = resizeCanvas(c, w, hgt); this.images.set(t.image, c); this.dirtyImages.add(t.image); }
    return c;
  }

  async ensureSpriteImage(s: GbaSprite, fromBase = true): Promise<HTMLCanvasElement> {
    const k = SPRITE_KINDS[s.kind];
    const w = k.frameW * k.cols, hgt = k.frameH * k.rows;
    let c = this.images.get(s.image);
    if (!c) {
      c = blankCanvas(w, hgt);
      if (fromBase && k.base) {
        try { ctx2d(c).drawImage(await blobToCanvas(await this.store.project.readFile(k.base)), 0, 0); } catch { /* blank */ }
        snapToPalette(c, this.data.palettes.find((p) => p.id === s.palette) ?? this.data.palettes[0]);
      }
      this.images.set(s.image, c);
      this.dirtyImages.add(s.image);
    } else if (c.width !== w || c.height !== hgt) {
      c = resizeCanvas(c, w, hgt);
      this.images.set(s.image, c);
      this.dirtyImages.add(s.image);
    }
    return c;
  }

  async save(): Promise<boolean> {
    const project = this.store.project;
    if (!project.canSave || !project.canStoreImages) {
      toast('This copy of the editor can’t save files. Open the project folder (or the online editor) to save.', 'error');
      return false;
    }
    try {
      for (const p of [...this.dirtyImages]) {
        const c = this.images.get(p);
        if (c) await project.writeFile(p, await canvasBlob(c));
        this.dirtyImages.delete(p);
      }
      // GBA maps live with the other maps now (public/data/maps); these were GBA Studio's own map list
      delete this.data.maps;
      delete this.data.startMap;
      await project.write('gba.json', JSON.stringify(this.data, null, 2) + '\n');
      this.dirtyJson = false;
      if (this.store.dbDirty && (await saveDatabase(this.store)) === 'failed') throw new Error('the Database didn’t save');
      this.renderStatus();
      toast('GBA Studio saved');
      return true;
    } catch (err) {
      toast(`Couldn’t save: ${(err as Error).message}`, 'error');
      return false;
    }
  }

  get dirty(): boolean { return this.dirtyJson || this.dirtyImages.size > 0 || this.store.dbDirty; }

  /* ----------------------------------------------------------------- shell */

  mount(): void {
    this.listEl = h('div', { class: 'gs-list' });
    this.centerEl = h('div', { class: 'gs-center' });
    this.sideEl = h('div', { class: 'gs-side' });
    this.statusEl = h('span', { class: 'gs-status', role: 'status' });
    const tabs = h('div', { class: 'gs-tabs', role: 'tablist' },
      ...(['tiles', 'sprites', 'palettes'] as Tab[]).map((t) => h('button', {
        type: 'button', role: 'tab', class: 'gs-tab', 'data-tab': t,
        onclick: () => { this.tab = t; this.render(); },
      }, t === 'tiles' ? 'Tiles' : t === 'sprites' ? 'Sprites' : 'Palettes')));
    this.root = h('div', { class: 'gba-studio', role: 'dialog', 'aria-label': 'GBA Studio' },
      h('header', { class: 'gs-head' },
        h('span', { class: 'brand-mark' }, 'GBA Studio'),
        tabs,
        h('div', { class: 'tb-spacer' }),
        this.statusEl,
        h('button', { type: 'button', class: 'btn ghost', title: 'Items, troops, enemies, characters and the rest of the Database', onclick: () => this.openDb() }, 'Database'),
        h('button', { type: 'button', class: 'btn primary', title: 'Save (Ctrl+S)', onclick: () => void this.save() }, 'Save'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => this.close() }, 'Close')),
      h('div', { class: 'gs-main' }, this.listEl, this.centerEl, this.sideEl));
    document.body.appendChild(this.root);
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.render();
  }

  close(): void {
    const finish = (keep: boolean) => {
      // the map editor shows the latest art (as saved; or as loaded, after closing without saving)
      if (keep) setGba(this.data, this.images); else void loadGba(this.store.project);
      clearInterval(this.previewTimer);
      document.removeEventListener('keydown', this.onKey, true);
      window.removeEventListener('resize', this.onResize);
      this.root.remove();
      open = false;
    };
    if (!this.dirty) return finish(true);
    openModal('Unsaved changes', h('p', { class: 'modal-text' }, 'Save your tiles and sprites before closing?'), [
      { label: 'Keep editing' },
      { label: 'Close without saving', danger: true, onClick: () => finish(false) },
      { label: 'Save and close', primary: true, onClick: () => { void this.save().then((ok) => { if (ok) finish(true); }); } },
    ]);
  }

  touch(path?: string): void {
    if (path) this.dirtyImages.add(path);
    else this.dirtyJson = true;
    this.renderStatus();
  }

  renderStatus(): void {
    this.statusEl.textContent = this.dirty ? 'Unsaved changes' : 'All saved';
    this.statusEl.classList.toggle('dirty', this.dirty);
  }

  render(): void {
    this.root.querySelectorAll<HTMLElement>('.gs-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === this.tab)));
    clearInterval(this.previewTimer);
    this.renderList();
    if (this.tab === 'palettes') this.renderPalettes();
    else this.renderPainter();
    this.renderStatus();
  }

  /* ----------------------------------------------------------------- list */

  current(): Item | null {
    if (this.tab === 'tiles') { const t = this.data.tiles.find((x) => x.id === this.sel.tiles); return t ? { kind: 'tile', t } : null; }
    if (this.tab === 'sprites') { const s = this.data.sprites.find((x) => x.id === this.sel.sprites); return s ? { kind: 'sprite', s } : null; }
    return null;
  }

  itemPalette(it: Item): GbaPalette {
    const id = it.kind === 'tile' ? it.t.palette : it.s.palette;
    return this.data.palettes.find((p) => p.id === id) ?? this.data.palettes[0];
  }

  itemImage(it: Item): HTMLCanvasElement {
    return it.kind === 'tile' ? this.ensureTileImage(it.t) : this.images.get(it.s.image)!;
  }

  renderList(): void {
    const rows: HTMLElement[] = [];
    if (this.tab === 'tiles') {
      const byType = new Map<TileType, GbaTile[]>();
      for (const t of this.data.tiles) byType.set(t.type, [...(byType.get(t.type) ?? []), t]);
      for (const [type, list] of byType) {
        rows.push(h('div', { class: 'gs-group' }, TILE_TYPES[type].label));
        for (const t of list) rows.push(this.listRow(t.id, t.name, t.id === this.sel.tiles, this.images.get(t.image), () => { this.sel.tiles = t.id; this.frame = 0; this.render(); }));
      }
      if (!this.data.tiles.length) rows.push(h('p', { class: 'gs-empty' }, 'No tiles yet. Make your first one: pick a type and paint over its template.'));
      rows.unshift(h('button', { type: 'button', class: 'btn primary gs-new', onclick: () => this.newTile() }, '+ New tile'));
    } else if (this.tab === 'sprites') {
      for (const s of this.data.sprites) {
        const tag = this.data.player === s.id ? ' ★' : '';
        rows.push(this.listRow(s.id, s.name + tag, s.id === this.sel.sprites, this.images.get(s.image), () => { this.sel.sprites = s.id; this.render(); }));
      }
      rows.unshift(h('button', { type: 'button', class: 'btn primary gs-new', onclick: () => this.newSprite() }, '+ New sprite'));
    } else {
      for (const p of this.data.palettes) {
        const sw = h('span', { class: 'gs-mini-pal' }, ...p.colors.slice(0, 8).map((c) => h('i', { style: `background:${c}` })));
        rows.push(h('button', { type: 'button', class: `gs-row${p.id === this.sel.palettes ? ' on' : ''}`, onclick: () => { this.sel.palettes = p.id; this.render(); } }, sw, h('span', {}, p.name)));
      }
      rows.unshift(h('button', { type: 'button', class: 'btn primary gs-new', onclick: () => this.newPalette() }, '+ New palette'));
    }
    this.listEl.replaceChildren(...rows);
  }

  listRow(id: string, name: string, on: boolean, img: HTMLCanvasElement | undefined, pick: () => void): HTMLElement {
    const thumb = blankCanvas(32, 32);
    if (img) {
      const g = ctx2d(thumb);
      g.imageSmoothingEnabled = false;
      const s = Math.min(32 / img.width, 32 / img.height);
      const sw = Math.max(1, Math.floor(img.width * s)), sh = Math.max(1, Math.floor(img.height * s));
      g.drawImage(img, 0, 0, img.width, img.height, (32 - sw) / 2, (32 - sh) / 2, sw, sh);
    }
    thumb.className = 'gs-thumb';
    return h('button', { type: 'button', class: `gs-row${on ? ' on' : ''}`, 'data-id': id, onclick: pick }, thumb, h('span', {}, name));
  }

  /* ----------------------------------------------------------------- new items */

  newTile(): void {
    let name = 'New tile', type: TileType = 'ground', palette = this.data.palettes.find((p) => p.id === 'grass')?.id ?? this.data.palettes[0].id;
    let w = 2, hgt = 2;
    const help = h('p', { class: 'hint' }, TILE_TYPES.ground.help);
    const sizeRow = h('div', { class: 'gs-size', hidden: true },
      field('Width (tiles)', numberInput(w, (v) => { w = v; }, { min: 1, max: 8 })),
      field('Height (tiles)', numberInput(hgt, (v) => { hgt = v; }, { min: 1, max: 8 })));
    const body = h('div', { class: 'gs-form' },
      field('Name', textInput(name, (v) => { name = v; })),
      field('Type', select(Object.entries(TILE_TYPES).map(([k, v]) => [k, v.label]), type, (v) => {
        type = v as TileType;
        help.textContent = TILE_TYPES[type].help;
        sizeRow.hidden = !TILE_TYPES[type].sized;
        if (type === 'water') palette = this.data.palettes.find((p) => p.id === 'water')?.id ?? palette;
        if (type === 'cliff' || type === 'ledge' || type === 'stairs') palette = this.data.palettes.find((p) => p.id === 'rock')?.id ?? palette;
        palSel.value = palette;
      })),
      help, sizeRow);
    const palSel = select(this.data.palettes.map((p) => [p.id, p.name]), palette, (v) => { palette = v; });
    body.append(field('Palette', palSel, 'The 15 colors this tile can use.'));
    openModal('New tile', body, [
      { label: 'Cancel' },
      { label: 'Create', primary: true, onClick: () => {
        const id = slug(name, new Set(this.data.tiles.map((t) => t.id)));
        const t: GbaTile = { id, name: name.trim() || id, type, palette, image: `gba/tiles/${id}.png` };
        if (TILE_TYPES[type].sized) { t.w = w; t.h = hgt; }
        if (TILE_TYPES[type].animated) t.frames = 1;
        if (TILE_TYPES[type].passChoice) t.pass = type === 'door' ? 'O' : 'X';
        this.data.tiles.push(t);
        this.ensureTileImage(t);
        if (type === 'ground' && !this.previewGround) this.previewGround = id;
        this.sel.tiles = id;
        this.frame = 0;
        this.touch();
        this.render();
      } },
    ]);
  }

  newSprite(): void {
    let name = 'New sprite', kind: SpriteKind = 'overworld', palette = 'mannequin', base = true;
    const help = h('p', { class: 'hint' }, SPRITE_KINDS.overworld.help);
    const body = h('div', { class: 'gs-form' },
      field('Name', textInput(name, (v) => { name = v; })),
      field('Kind', select(Object.entries(SPRITE_KINDS).map(([k, v]) => [k, v.label]), kind, (v) => { kind = v as SpriteKind; help.textContent = SPRITE_KINDS[kind].help; })),
      help,
      field('Palette', select(this.data.palettes.map((p) => [p.id, p.name]), palette, (v) => { palette = v; })),
      checkbox('Start from the mannequin', base, (v) => { base = v; }));
    openModal('New sprite', body, [
      { label: 'Cancel' },
      { label: 'Create', primary: true, onClick: () => {
        const id = slug(name, new Set(this.data.sprites.map((s) => s.id)));
        const s: GbaSprite = { id, name: name.trim() || id, kind, palette, image: `gba/sprites/${id}.png` };
        this.data.sprites.push(s);
        void this.ensureSpriteImage(s, base).then((c) => {
          snapToPalette(c, this.data.palettes.find((p) => p.id === palette) ?? this.data.palettes[0]);
          this.sel.sprites = id;
          this.touch();
          this.render();
        });
      } },
    ]);
  }

  newPalette(): void {
    let name = 'New palette';
    const from = this.data.palettes.find((p) => p.id === this.sel.palettes) ?? this.data.palettes[0];
    openModal('New palette', h('div', { class: 'gs-form' },
      field('Name', textInput(name, (v) => { name = v; })),
      h('p', { class: 'hint' }, `Starts as a copy of “${from.name}”. The GBA can show up to 16 palettes on screen at once for tiles and 16 for sprites.`)), [
      { label: 'Cancel' },
      { label: 'Create', primary: true, onClick: () => {
        const id = slug(name, new Set(this.data.palettes.map((p) => p.id)));
        this.data.palettes.push({ id, name: name.trim() || id, colors: [...from.colors] });
        this.sel.palettes = id;
        this.touch();
        this.render();
      } },
    ]);
  }

  /* ----------------------------------------------------------------- painter */

  /** Sheet geometry for the current item: the painted area (one frame for water) and its cells. */
  geometry(it: Item): { fw: number; fh: number; cols: number; rows: number; offY: number } {
    if (it.kind === 'tile') {
      const { cols, rows } = tileSize(it.t);
      return { fw: CELL, fh: CELL, cols, rows, offY: this.frame * rows * CELL };
    }
    const k = SPRITE_KINDS[it.s.kind];
    return { fw: k.frameW, fh: k.frameH, cols: k.cols, rows: k.rows, offY: 0 };
  }

  renderPainter(): void {
    const it = this.current();
    if (!it) {
      this.centerEl.replaceChildren(h('div', { class: 'gs-placeholder' },
        this.tab === 'tiles' ? 'Choose “+ New tile” to start painting.' : 'Choose “+ New sprite” to start.'));
      this.sideEl.replaceChildren();
      return;
    }
    const tools = h('div', { class: 'gs-tools' },
      ...TOOLS.map(([t, icon, label, keyName]) => h('button', {
        type: 'button', class: `gs-tool${this.tool === t ? ' on' : ''}`, title: `${label} (${keyName})`, 'aria-label': label,
        onclick: () => { this.tool = t; this.renderPainter(); },
      }, h('span', { class: 'gs-tool-icon' }, icon), h('span', { class: 'gs-tool-label' }, label.split(' (')[0]))),
      h('span', { class: 'gs-sep' }),
      h('button', { type: 'button', class: 'icon-btn', title: 'Undo (Ctrl+Z)', onclick: () => this.doUndo() }, '↶'),
      h('button', { type: 'button', class: 'icon-btn', title: 'Redo (Ctrl+Y)', onclick: () => this.doRedo() }, '↷'),
      h('span', { class: 'gs-sep' }),
      h('button', { type: 'button', class: 'icon-btn', title: 'Zoom out', onclick: () => this.setZoom(-1) }, '−'),
      h('button', { type: 'button', class: 'icon-btn', title: 'Zoom in', onclick: () => this.setZoom(1) }, '+'),
      h('span', { class: 'gs-sep' }),
      this.toggleBtn('Mirror', 'Paint both halves of a cell at once (handy for faces and fronts)', this.mirror, (v) => { this.mirror = v; }),
      it.kind === 'sprite' ? this.toggleBtn('Onion skin', 'Show the previous frame faintly under each frame', this.onion, (v) => { this.onion = v; }) : null,
      this.toggleBtn('Grid', 'Show a light pixel grid', this.grid, (v) => { this.grid = v; setPref('mimas.gs.grid', v); }),
      this.toggleBtn('Labels', 'Show the names of the cells (hide them when they get in the way of painting)', this.labels, (v) => { this.labels = v; setPref('mimas.gs.labels', v); }));

    let frames: HTMLElement | null = null;
    if (it.kind === 'tile' && TILE_TYPES[it.t.type].animated) {
      const n = tileSize(it.t).frames;
      frames = h('div', { class: 'gs-frames' }, h('span', {}, 'Frame:'),
        ...Array.from({ length: n }, (_, i) => h('button', { type: 'button', class: `btn${i === this.frame ? ' primary' : ''}`, onclick: () => { this.frame = i; this.renderPainter(); } }, String(i + 1))),
        n < 8 ? h('button', { type: 'button', class: 'btn ghost', title: 'Add a frame (a copy of this one)', onclick: () => this.addFrame(it.t) }, '+ Frame') : null,
        n > 1 ? h('button', { type: 'button', class: 'btn ghost', title: 'Remove the last frame', onclick: () => this.removeFrame(it.t) }, '− Frame') : null,
        n > 1 ? h('span', { class: 'gs-sep' }) : null,
        n > 1 ? h('button', { type: 'button', class: 'btn ghost', title: 'Move this frame left (earlier)', disabled: this.frame === 0, onclick: () => this.moveFrame(it.t, -1) }, '◀ Move') : null,
        n > 1 ? h('button', { type: 'button', class: 'btn ghost', title: 'Move this frame right (later)', disabled: this.frame === n - 1, onclick: () => this.moveFrame(it.t, 1) }, 'Move ▶') : null);
    }

    const geo = this.geometry(it);
    if (Math.max(this.cellSel[0], this.cellEnd[0]) >= geo.cols || Math.max(this.cellSel[1], this.cellEnd[1]) >= geo.rows) this.cellSel = this.cellEnd = [0, 0];
    this.display = h('canvas', { class: 'gs-canvas' }) as HTMLCanvasElement;
    this.display.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.display.addEventListener('pointermove', (e) => this.pointerMove(e));
    this.display.addEventListener('pointerup', (e) => this.pointerUp(e));
    this.display.addEventListener('pointercancel', (e) => this.pointerUp(e));
    this.display.addEventListener('pointerleave', () => { this.hover = null; this.drawDisplay(); });
    this.display.addEventListener('contextmenu', (e) => e.preventDefault());
    const scroller = h('div', { class: 'gs-scroll' }, this.display);
    const info = it.kind === 'tile' ? TILE_TYPES[it.t.type].help : SPRITE_KINDS[it.s.kind].help;
    this.centerEl.replaceChildren(tools, frames ?? '', h('p', { class: 'gs-help' }, info), scroller);
    requestAnimationFrame(() => this.drawDisplay());
    this.renderSide(it);
  }

  toggleBtn(label: string, title: string, on: boolean, set: (v: boolean) => void): HTMLElement {
    return h('button', { type: 'button', class: `btn ghost gs-toggle${on ? ' on' : ''}`, 'aria-pressed': String(on), title,
      onclick: () => { set(!on); this.renderPainter(); } }, label);
  }

  setZoom(dir: number): void {
    const it = this.current();
    if (!it) return;
    const cur = this.zoom || this.fitZoom(it);
    this.zoom = Math.max(1, Math.min(48, dir > 0 ? cur + (cur >= 8 ? 4 : 1) : cur - (cur > 8 ? 4 : 1)));
    this.drawDisplay();
  }

  fitZoom(it: Item): number {
    const g = this.geometry(it);
    const w = g.cols * g.fw, hgt = g.rows * g.fh;
    const area = this.centerEl.querySelector('.gs-scroll')?.getBoundingClientRect() ?? this.centerEl.getBoundingClientRect();
    const availW = Math.max(160, area.width - 24), availH = Math.max(160, area.height - 24);
    const fit = Math.floor(Math.min(availW / w, availH / hgt));
    // Long strips (battle poses) would be tiny: size them by height and scroll sideways instead.
    if (fit < 4) return Math.max(1, Math.min(8, Math.floor(availH / hgt)));
    return Math.max(1, Math.min(32, fit));
  }

  drawDisplay(): void {
    const it = this.current();
    if (!it || !this.display) return;
    const img = this.itemImage(it);
    const g = this.geometry(it);
    const z = this.zoom || this.fitZoom(it);
    const W = g.cols * g.fw, H = g.rows * g.fh;
    const d = this.display;
    if (d.width !== W * z || d.height !== H * z) { d.width = W * z; d.height = H * z; }
    const c = d.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    // checkerboard = transparent
    const chk = Math.max(4, z * 2);
    for (let y = 0; y < d.height; y += chk) for (let x = 0; x < d.width; x += chk) {
      c.fillStyle = ((x / chk + y / chk) & 1) ? '#2a2f42' : '#353b52';
      c.fillRect(x, y, chk, chk);
    }
    // guides: hatched "leave empty" cells
    if (it.kind === 'tile') {
      for (const gd of TILE_TYPES[it.t.type].guides) {
        if (!gd.empty) continue;
        c.save();
        c.beginPath();
        c.rect(gd.x * CELL * z, gd.y * CELL * z, CELL * z, CELL * z);
        c.clip();
        c.strokeStyle = 'rgba(255,255,255,0.12)';
        c.lineWidth = Math.max(1, z / 3);
        for (let k = -CELL * z; k < CELL * z * 2; k += z * 3) {
          c.beginPath();
          c.moveTo(gd.x * CELL * z + k, gd.y * CELL * z);
          c.lineTo(gd.x * CELL * z + k + CELL * z, (gd.y + 1) * CELL * z);
          c.stroke();
        }
        c.restore();
      }
    }
    // onion skin: the frame to the left, faintly
    if (this.onion && it.kind === 'sprite' && g.cols > 1) {
      c.globalAlpha = 0.28;
      for (let row = 0; row < g.rows; row++) for (let col = 1; col < g.cols; col++) {
        if (it.s.kind === 'overworld' && col === 3) continue; // run starts fresh
        c.drawImage(img, (col - 1) * g.fw, row * g.fh, g.fw, g.fh, col * g.fw * z, row * g.fh * z, g.fw * z, g.fh * z);
      }
      c.globalAlpha = 1;
    }
    c.drawImage(img, 0, g.offY, W, H, 0, 0, W * z, H * z);
    // stroke preview for line / rectangle
    if (this.stroke && (this.tool === 'line' || this.tool === 'rect')) {
      c.fillStyle = this.stroke.erase ? 'rgba(255,255,255,0.5)' : this.colorHex(it);
      for (const [x, y] of this.shapePixels(this.stroke.start, this.stroke.last)) c.fillRect(x * z, y * z, z, z);
    }
    // pixel grid
    if (this.grid && z >= 6) {
      c.strokeStyle = 'rgba(255,255,255,0.07)';
      c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= W; x++) { c.moveTo(x * z + 0.5, 0); c.lineTo(x * z + 0.5, H * z); }
      for (let y = 0; y <= H; y++) { c.moveTo(0, y * z + 0.5); c.lineTo(W * z, y * z + 0.5); }
      c.stroke();
    }
    // red borders between cells / frames (never part of the picture)
    c.strokeStyle = '#ff3b3b';
    c.lineWidth = Math.max(1, Math.min(3, Math.floor(z / 4)));
    c.beginPath();
    for (let col = 0; col <= g.cols; col++) { const x = col * g.fw * z; c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H * z); }
    for (let row = 0; row <= g.rows; row++) { const y = row * g.fh * z; c.moveTo(0, y + 0.5); c.lineTo(W * z, y + 0.5); }
    c.stroke();
    // labels
    if (z >= 4 && this.labels) {
      c.font = `${Math.max(9, Math.min(13, z * 1.2))}px ${getComputedStyle(document.body).fontFamily}`;
      c.textBaseline = 'top';
      const labels = it.kind === 'tile' ? TILE_TYPES[it.t.type].guides.map((gd) => ({ x: gd.x, y: gd.y, label: gd.label }))
        : this.spriteLabels(it.s.kind);
      for (const l of labels) {
        const x = l.x * g.fw * z + 4, y = l.y * g.fh * z + 3;
        const tw = c.measureText(l.label).width;
        c.fillStyle = 'rgba(11,14,22,0.7)';
        c.fillRect(x - 2, y - 1, tw + 4, Math.max(11, z * 1.2) + 3);
        c.fillStyle = '#ffd7a0';
        c.fillText(l.label, x, y);
      }
    }
    // the selected cell (for copy / paste / flip)
    c.save();
    c.strokeStyle = '#ffd34d';
    c.lineWidth = 2;
    c.setLineDash([6, 4]);
    const [sx0, sy0, sx1, sy1] = this.selRect();
    c.strokeRect(sx0 * g.fw * z + 2, sy0 * g.fh * z + 2, (sx1 - sx0 + 1) * g.fw * z - 4, (sy1 - sy0 + 1) * g.fh * z - 4);
    c.restore();
    // hover outline
    if (this.hover && !this.stroke && this.tool !== 'cell') {
      c.strokeStyle = 'rgba(255,255,255,0.8)';
      c.lineWidth = 1;
      c.strokeRect(this.hover[0] * z + 0.5, this.hover[1] * z + 0.5, z - 1, z - 1);
    }
  }

  spriteLabels(kind: SpriteKind): { x: number; y: number; label: string }[] {
    const k = SPRITE_KINDS[kind];
    const out: { x: number; y: number; label: string }[] = [];
    for (let row = 0; row < k.rows; row++) for (let col = 0; col < k.cols; col++) {
      const parts = [row === 0 || kind !== 'overworld' ? k.colLabels[col] : '', col === 0 ? k.rowLabels[row] : ''].filter(Boolean);
      if (parts.length) out.push({ x: col, y: row, label: parts.join(' · ') });
    }
    return out;
  }

  colorHex(it: Item): string {
    return this.color === 0 ? 'rgba(0,0,0,0)' : this.itemPalette(it).colors[this.color - 1];
  }

  /* ----------------------------------------------------------------- painting */

  pixelAt(e: PointerEvent): [number, number] | null {
    const it = this.current();
    if (!it) return null;
    const r = this.display.getBoundingClientRect();
    const g = this.geometry(it);
    const x = Math.floor(((e.clientX - r.left) / r.width) * g.cols * g.fw);
    const y = Math.floor(((e.clientY - r.top) / r.height) * g.rows * g.fh);
    if (x < 0 || y < 0 || x >= g.cols * g.fw || y >= g.rows * g.fh) return null;
    return [x, y];
  }

  pointerDown(e: PointerEvent): void {
    const it = this.current();
    const p = this.pixelAt(e);
    if (!it || !p) return;
    e.preventDefault();
    const g0 = this.geometry(it);
    const cell: [number, number] = [Math.floor(p[0] / g0.fw), Math.floor(p[1] / g0.fh)];
    if (e.shiftKey && this.tool === 'cell') this.cellEnd = cell;   // shift-click: stretch the selection
    else if (this.tool === 'cell' || !this.inSel(cell)) { this.cellSel = cell; this.cellEnd = cell; }
    this.renderCellCard(it);
    if (this.tool === 'cell') { this.selecting = true; this.display.setPointerCapture(e.pointerId); this.drawDisplay(); return; }
    this.display.setPointerCapture(e.pointerId);
    const erase = e.button === 2 || this.tool === 'erase';
    const img = this.itemImage(it);
    if (this.tool === 'pick' && !erase) { this.pickColor(it, p); return; }
    const before = ctx2d(img).getImageData(0, 0, img.width, img.height);
    this.stroke = { start: p, last: p, erase, before };
    if (this.tool === 'fill' && !erase) { this.fill(it, p); this.endStroke(it); return; }
    if (this.tool === 'pencil' || this.tool === 'erase' || erase) {
      if (this.tool === 'line' || this.tool === 'rect') { this.drawDisplay(); return; }
      this.plot(it, p[0], p[1], erase);
    }
    this.drawDisplay();
  }

  pointerMove(e: PointerEvent): void {
    const it = this.current();
    const p = this.pixelAt(e);
    if (!it) return;
    this.hover = p;
    if (this.selecting && p) {
      const g = this.geometry(it);
      const cell: [number, number] = [Math.floor(p[0] / g.fw), Math.floor(p[1] / g.fh)];
      if (cell[0] !== this.cellEnd[0] || cell[1] !== this.cellEnd[1]) { this.cellEnd = cell; this.renderCellCard(it); }
    }
    if (this.stroke && p) {
      if (this.tool === 'line' || this.tool === 'rect') this.stroke.last = p;
      else if (this.tool === 'pencil' || this.tool === 'erase' || this.stroke.erase) {
        for (const [x, y] of linePixels(this.stroke.last, p)) this.plot(it, x, y, this.stroke.erase);
        this.stroke.last = p;
      }
    }
    this.drawDisplay();
  }

  pointerUp(e: PointerEvent): void {
    this.selecting = false;
    const it = this.current();
    if (!it || !this.stroke) return;
    const p = this.pixelAt(e) ?? this.stroke.last;
    if (this.tool === 'line' || this.tool === 'rect') {
      for (const [x, y] of this.shapePixels(this.stroke.start, p)) this.plot(it, x, y, this.stroke.erase);
    }
    this.endStroke(it);
  }

  endStroke(it: Item): void {
    if (!this.stroke) return;
    const path = it.kind === 'tile' ? it.t.image : it.s.image;
    this.pushUndo(path, this.stroke.before);
    this.stroke = null;
    this.touch(path);
    this.drawDisplay();
    this.drawPreview();
    this.refreshThumb(it);
  }

  refreshThumb(it: Item): void {
    const id = it.kind === 'tile' ? it.t.id : it.s.id;
    const row = this.listEl.querySelector<HTMLElement>(`.gs-row[data-id="${CSS.escape(id)}"]`);
    const img = this.itemImage(it);
    const old = row?.querySelector('canvas');
    if (row && old) {
      const fresh = this.listRow(id, '', false, img, () => {}).querySelector('canvas')!;
      old.replaceWith(fresh);
    }
  }

  shapePixels(a: [number, number], b: [number, number]): [number, number][] {
    if (this.tool === 'line') return linePixels(a, b);
    const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    const out: [number, number][] = [];
    for (let x = x0; x <= x1; x++) { out.push([x, y0], [x, y1]); }
    for (let y = y0 + 1; y < y1; y++) { out.push([x0, y], [x1, y]); }
    return out;
  }

  /** Set one pixel (in painted-area coordinates), mirrored inside its cell when Mirror is on. */
  plot(it: Item, x: number, y: number, erase: boolean): void {
    const g = this.geometry(it);
    const img = this.itemImage(it);
    const c = ctx2d(img);
    const put = (px: number) => {
      if (erase || this.color === 0) c.clearRect(px, y + g.offY, 1, 1);
      else { c.fillStyle = this.itemPalette(it).colors[this.color - 1]; c.fillRect(px, y + g.offY, 1, 1); }
    };
    put(x);
    if (this.mirror) {
      const cellX = Math.floor(x / g.fw) * g.fw;
      put(cellX + (g.fw - 1 - (x - cellX)));
    }
  }

  pickColor(it: Item, [x, y]: [number, number]): void {
    const g = this.geometry(it);
    const px = ctx2d(this.itemImage(it)).getImageData(x, y + g.offY, 1, 1).data;
    if (px[3] < 128) this.color = 0;
    else {
      const hex = '#' + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
      const k = this.itemPalette(it).colors.indexOf(hex);
      if (k >= 0) this.color = k + 1;
    }
    this.tool = 'pencil';
    this.renderPainter();
  }

  /** Flood fill, kept inside the cell (or frame) that was clicked. */
  fill(it: Item, [sx, sy]: [number, number]): void {
    const g = this.geometry(it);
    const img = this.itemImage(it);
    const c = ctx2d(img);
    const cx0 = Math.floor(sx / g.fw) * g.fw, cy0 = Math.floor(sy / g.fh) * g.fh;
    const data = c.getImageData(cx0, cy0 + g.offY, g.fw, g.fh);
    const d = data.data;
    const at = (x: number, y: number) => (y * g.fw + x) * 4;
    const i0 = at(sx - cx0, sy - cy0);
    const target = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
    const [r, gg, b] = this.color === 0 ? [0, 0, 0] : hexToRgb(this.itemPalette(it).colors[this.color - 1]);
    const a = this.color === 0 ? 0 : 255;
    const same = (i: number) => (target[3] < 128 ? d[i + 3] < 128 : d[i] === target[0] && d[i + 1] === target[1] && d[i + 2] === target[2] && d[i + 3] >= 128);
    if (target[3] >= 128 ? (target[0] === r && target[1] === gg && target[2] === b && a === 255) : a === 0) return;
    const stack: [number, number][] = [[sx - cx0, sy - cy0]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= g.fw || y >= g.fh) continue;
      const i = at(x, y);
      if (!same(i)) continue;
      d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = a;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    c.putImageData(data, cx0, cy0 + g.offY);
  }

  doUndo(): void { this.history(this.undo, this.redo); }
  doRedo(): void { this.history(this.redo, this.undo); }

  history(from: Map<string, ImageData[]>, to: Map<string, ImageData[]>): void {
    const it = this.current();
    if (!it) return;
    const path = it.kind === 'tile' ? it.t.image : it.s.image;
    const stack = from.get(path);
    const snap = stack?.pop();
    if (!snap) return;
    const img = this.itemImage(it);
    if (snap.width !== img.width || snap.height !== img.height) return;
    const c = ctx2d(img);
    to.set(path, [...(to.get(path) ?? []), c.getImageData(0, 0, img.width, img.height)]);
    c.putImageData(snap, 0, 0);
    this.touch(path);
    this.drawDisplay();
    this.drawPreview();
    this.refreshThumb(it);
  }

  addFrame(t: GbaTile): void {
    const { rows } = tileSize(t);
    const old = this.ensureTileImage(t);
    t.frames = tileSize(t).frames + 1;
    const img = this.ensureTileImage(t);
    // the new frame starts as a copy of the current one
    ctx2d(img).drawImage(old, 0, this.frame * rows * CELL, img.width, rows * CELL, 0, (t.frames - 1) * rows * CELL, img.width, rows * CELL);
    this.frame = t.frames - 1;
    this.touch();
    this.touch(t.image);
    this.renderPainter();
  }

  removeFrame(t: GbaTile): void {
    t.frames = Math.max(1, tileSize(t).frames - 1);
    this.ensureTileImage(t);
    this.frame = Math.min(this.frame, t.frames - 1);
    this.touch();
    this.touch(t.image);
    this.renderPainter();
  }

  /** Swap the current frame with its neighbour (water animation order). */
  moveFrame(t: GbaTile, dir: number): void {
    const { rows, frames } = tileSize(t);
    const to = this.frame + dir;
    if (to < 0 || to >= frames) return;
    const img = this.ensureTileImage(t);
    const c = ctx2d(img);
    this.pushUndo(t.image, c.getImageData(0, 0, img.width, img.height));
    const fh = rows * CELL;
    const a = c.getImageData(0, this.frame * fh, img.width, fh), b = c.getImageData(0, to * fh, img.width, fh);
    c.putImageData(b, 0, this.frame * fh);
    c.putImageData(a, 0, to * fh);
    this.frame = to;
    this.touch(t.image);
    this.renderPainter();
  }

  pushUndo(path: string, before: ImageData): void {
    const stack = this.undo.get(path) ?? [];
    stack.push(before);
    if (stack.length > 60) stack.shift();
    this.undo.set(path, stack);
    this.redo.set(path, []);
  }

  /* ----------------------------------------------------------------- cells: copy, paste, flip */

  cellLabel(it: Item, [cx, cy]: [number, number]): string {
    if (it.kind === 'tile') {
      const gd = TILE_TYPES[it.t.type].guides.find((g) => g.x === cx && g.y === cy);
      const frames = tileSize(it.t).frames;
      const base = gd?.label ?? (tileSize(it.t).cols * tileSize(it.t).rows > 1 ? `Cell ${cx + 1}, ${cy + 1}` : TILE_TYPES[it.t.type].label);
      return frames > 1 ? `${base} (frame ${this.frame + 1})` : base;
    }
    const k = SPRITE_KINDS[it.s.kind];
    return [k.rowLabels[cy], k.colLabels[cx]].filter(Boolean).join(' · ') || `Frame ${cx + 1}, ${cy + 1}`;
  }

  /** The selection as [x0, y0, x1, y1] in cells. */
  selRect(): [number, number, number, number] {
    const [a, b] = [this.cellSel, this.cellEnd];
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }

  inSel([x, y]: [number, number]): boolean {
    const [x0, y0, x1, y1] = this.selRect();
    return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x1 > x0 || y1 > y0);
  }

  selCells(): [number, number][] {
    const [x0, y0, x1, y1] = this.selRect();
    const out: [number, number][] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push([x, y]);
    return out;
  }

  selLabel(it: Item): string {
    const cells = this.selCells();
    return cells.length === 1 ? this.cellLabel(it, cells[0]) : `${cells.length} cells (${this.cellLabel(it, cells[0])} …)`;
  }

  /** Change the sheet (with undo) and redraw. */
  editSheet(it: Item, op: (c: CanvasRenderingContext2D, g: ReturnType<Studio['geometry']>) => void): void {
    const g = this.geometry(it);
    const img = this.itemImage(it);
    const c = ctx2d(img);
    const path = it.kind === 'tile' ? it.t.image : it.s.image;
    this.pushUndo(path, c.getImageData(0, 0, img.width, img.height));
    op(c, g);
    this.touch(path);
    this.drawDisplay();
    this.drawPreview();
    this.refreshThumb(it);
  }

  copyCell(it: Item, cut = false): void {
    const g = this.geometry(it);
    const [x0, y0, x1, y1] = this.selRect();
    const cells = this.selCells().map(([x, y]) => {
      const cv = blankCanvas(g.fw, g.fh);
      ctx2d(cv).drawImage(this.itemImage(it), x * g.fw, g.offY + y * g.fh, g.fw, g.fh, 0, 0, g.fw, g.fh);
      return cv;
    });
    this.clip = { cols: x1 - x0 + 1, rows: y1 - y0 + 1, cells };
    if (cut) this.clearCells(it);
    toast(`${cut ? 'Cut' : 'Copied'} ${this.selLabel(it)}. Select where it goes and Paste (Ctrl+V).`);
    this.renderCellCard(it);
  }

  /**
   * Paste: into one selected cell, the copied cells keep their shape from there. Into several selected
   * cells, they're filled in reading order, so a row of three can go into a column of three.
   */
  pasteCell(it: Item): void {
    const clip = this.clip;
    if (!clip) return;
    const pal = this.itemPalette(it);
    const g0 = this.geometry(it);
    const sel = this.selCells();
    const targets: [number, number][] = sel.length > 1 ? sel.slice(0, clip.cells.length)
      : clip.cells.map((_, i) => [sel[0][0] + (i % clip.cols), sel[0][1] + Math.floor(i / clip.cols)] as [number, number])
        .filter(([x, y]) => x < g0.cols && y < g0.rows);
    this.editSheet(it, (c, g) => targets.forEach(([x, y], i) => {
      const tmp = blankCanvas(g.fw, g.fh);
      ctx2d(tmp).drawImage(clip.cells[i], 0, 0); // same size copies exactly; other sizes land in the top-left corner
      snapToPalette(tmp, pal);
      c.clearRect(x * g.fw, g.offY + y * g.fh, g.fw, g.fh);
      c.drawImage(tmp, x * g.fw, g.offY + y * g.fh);
    }));
    if (sel.length === 1 && targets.length > 1) {
      const last = targets[targets.length - 1];
      this.cellEnd = last;
      this.renderCellCard(it);
      this.drawDisplay();
    }
  }

  clearCells(it: Item): void {
    const [x0, y0, x1, y1] = this.selRect();
    this.editSheet(it, (c, g) => c.clearRect(x0 * g.fw, g.offY + y0 * g.fh, (x1 - x0 + 1) * g.fw, (y1 - y0 + 1) * g.fh));
  }

  /** Flip the selection as one picture (a 2×2 tree flips as a whole). */
  flipCell(it: Item, horizontal: boolean): void {
    const [x0, y0, x1, y1] = this.selRect();
    this.editSheet(it, (c, g) => {
      const x = x0 * g.fw, y = g.offY + y0 * g.fh, w = (x1 - x0 + 1) * g.fw, hh = (y1 - y0 + 1) * g.fh;
      const tmp = blankCanvas(w, hh);
      const t = ctx2d(tmp);
      t.translate(horizontal ? w : 0, horizontal ? 0 : hh);
      t.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
      t.drawImage(c.canvas, x, y, w, hh, 0, 0, w, hh);
      c.clearRect(x, y, w, hh);
      c.drawImage(tmp, x, y);
    });
  }

  /** Turn each selected cell a quarter turn in place (square cells only). Clockwise, or not. */
  rotateCell(it: Item, clockwise: boolean): void {
    this.editSheet(it, (c, g) => this.selCells().forEach(([cx, cy]) => {
      const x = cx * g.fw, y = g.offY + cy * g.fh, n = g.fw;
      const tmp = blankCanvas(n, n);
      const t = ctx2d(tmp);
      t.translate(n / 2, n / 2);
      t.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2);
      t.drawImage(c.canvas, x, y, n, n, -n / 2, -n / 2, n, n);
      c.clearRect(x, y, n, n);
      c.drawImage(tmp, x, y);
    }));
  }

  /** Ledges: the west pieces become the east pieces mirrored. */
  westFromEast(t: GbaTile): void {
    const img = this.ensureTileImage(t);
    const c = ctx2d(img);
    this.pushUndo(t.image, c.getImageData(0, 0, img.width, img.height));
    const [ex] = ledgeCell(3), [wx] = ledgeCell(6);
    const tmp = blankCanvas(CELL, 3 * CELL);
    const g = ctx2d(tmp);
    g.translate(CELL, 0);
    g.scale(-1, 1);
    g.drawImage(img, ex * CELL, 0, CELL, 3 * CELL, 0, 0, CELL, 3 * CELL);
    c.clearRect(wx * CELL, 0, CELL, 3 * CELL);
    c.drawImage(tmp, wx * CELL, 0);
    this.touch(t.image);
    this.drawDisplay();
    this.drawPreview();
    this.refreshThumb({ kind: 'tile', t });
    toast('West ledge made from East, mirrored');
  }

  cellCard: HTMLElement | null = null;

  renderCellCard(it: Item): void {
    if (!this.cellCard) return;
    const btn = (label: string, title: string, fn: () => void, disabled = false) =>
      h('button', { type: 'button', class: 'btn ghost small', title, disabled, onclick: fn }, label);
    const g = this.geometry(it);
    const square = g.fw === g.fh;
    this.cellCard.replaceChildren(
      h('h3', {}, this.selCells().length > 1 ? 'Cells' : 'Cell'),
      h('p', { class: 'gs-kv' }, h('span', {}, 'Selected'), h('strong', {}, this.selLabel(it))),
      h('div', { class: 'gs-actions' },
        btn('Copy', 'Copy the selected cells (Ctrl+C)', () => this.copyCell(it)),
        btn('Paste', this.clip ? 'Put the copied cells here (Ctrl+V)' : 'Copy a cell first', () => this.pasteCell(it), !this.clip),
        btn('Clear', 'Erase the selected cells (Delete)', () => this.clearCells(it))),
      h('div', { class: 'gs-actions' },
        btn('Flip ↔', 'Mirror left to right', () => this.flipCell(it, true)),
        btn('Flip ↕', 'Flip upside down', () => this.flipCell(it, false)),
        btn('Rotate ↺', square ? 'Turn each selected cell a quarter turn to the left (a south ledge becomes an east ledge)' : 'Only square cells can turn', () => this.rotateCell(it, false), !square),
        btn('Rotate ↻', square ? 'Turn each selected cell a quarter turn to the right (a south ledge becomes a west ledge)' : 'Only square cells can turn', () => this.rotateCell(it, true), !square)),
      h('p', { class: 'hint' }, 'Click a cell to select it; with the ⬚ tool, drag (or Shift-click) to select several. Ctrl+C, Ctrl+X, Ctrl+V and Delete work too. Copy works across tiles and sprites. Pasting a row into a selected column fills it top to bottom.'));
  }

  /* ----------------------------------------------------------------- side panel */

  renderSide(it: Item): void {
    const pal = this.itemPalette(it);
    const swatches = h('div', { class: 'gs-swatches' },
      h('button', { type: 'button', class: `gs-swatch clear${this.color === 0 ? ' on' : ''}`, title: 'Transparent', onclick: () => { this.color = 0; this.renderSide(it); } }),
      ...pal.colors.map((c, i) => h('button', {
        type: 'button', class: `gs-swatch${this.color === i + 1 ? ' on' : ''}`, style: `background:${c}`, title: `Color ${i + 1}: ${c} (double-click to change)`,
        onclick: () => { this.color = i + 1; if (this.tool === 'erase' || this.tool === 'pick') this.tool = 'pencil'; this.renderPainter(); },
        ondblclick: () => this.editColor(pal, i),
      })));
    const palRow = h('div', { class: 'gs-pal-head' }, h('strong', {}, pal.name),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => { this.tab = 'palettes'; this.sel.palettes = pal.id; this.render(); } }, 'Edit colors'));

    this.previewCanvas = h('canvas', { class: 'gs-preview' }) as HTMLCanvasElement;
    const previewOpts = h('div', { class: 'gs-preview-opts' });
    if (it.kind === 'tile' && it.t.type !== 'ground') {
      const grounds = this.data.tiles.filter((t) => t.type === 'ground');
      previewOpts.append(field('Preview on', select([['', 'Plain grass'], ...grounds.map((t): [string, string] => [t.id, t.name])], this.previewGround, (v) => { this.previewGround = v; this.drawPreview(); })));
    }
    if (it.kind === 'sprite' && it.s.kind === 'overworld') {
      previewOpts.append(checkbox('Show running', this.previewRun, (v) => { this.previewRun = v; }));
    }
    if (it.kind === 'sprite' && it.s.kind === 'effect' && it.s.role !== 'burst') {
      previewOpts.append(field('Preview as', select((Object.keys(ELEMENT_RAMPS) as Element[]).map((e): [string, string] => [e, e === 'neutral' ? 'No element (greys)' : e[0].toUpperCase() + e.slice(1)]), this.previewElement, (v) => { this.previewElement = v as Element; this.drawPreview(); }), 'A hit takes the colours of the move’s element.'));
    }
    if (it.kind === 'sprite' && it.s.kind === 'backsprite') {
      previewOpts.append(field('Pose', select(SPRITE_KINDS.backsprite.colLabels.map((l, i): [string, string] => [String(i), l]), String(this.previewPose), (v) => { this.previewPose = Number(v); this.drawPreview(); })));
    }

    const props = it.kind === 'tile' ? this.tileProps(it.t) : this.spriteProps(it.s);
    this.cellCard = h('section', { class: 'gs-card' });
    this.renderCellCard(it);
    this.sideEl.replaceChildren(
      h('section', { class: 'gs-card' }, palRow, swatches, h('p', { class: 'hint' }, 'Left-click paints, right-click erases. On a tablet use the Paint and Erase buttons.')),
      h('section', { class: 'gs-card' }, h('h3', {}, 'Preview'), this.previewCanvas, previewOpts),
      this.cellCard,
      h('section', { class: 'gs-card' }, props));
    clearInterval(this.previewTimer);
    let tick = 0;
    this.previewTimer = window.setInterval(() => { tick++; this.drawPreview(tick); }, 140);
    this.drawPreview();
  }

  editColor(pal: GbaPalette, i: number): void {
    const input = h('input', { type: 'color', value: pal.colors[i] }) as HTMLInputElement;
    input.addEventListener('change', () => {
      const old = pal.colors[i];
      const fresh = gbaColor(input.value);
      if (fresh === old) return;
      pal.colors[i] = fresh;
      this.recolor(pal, old, fresh);
      this.touch();
      this.render();
    });
    input.click();
  }

  /** A palette color changed: every picture using that palette follows. */
  recolor(pal: GbaPalette, oldHex: string, newHex: string): void {
    const [or, og, ob] = hexToRgb(oldHex), [nr, ng, nb] = hexToRgb(newHex);
    const users = [...this.data.tiles.filter((t) => t.palette === pal.id).map((t) => t.image), ...this.data.sprites.filter((s) => s.palette === pal.id).map((s) => s.image)];
    for (const p of users) {
      const img = this.images.get(p);
      if (!img) continue;
      const c = ctx2d(img);
      const data = c.getImageData(0, 0, img.width, img.height);
      const d = data.data;
      let changed = false;
      for (let k = 0; k < d.length; k += 4) {
        if (d[k + 3] >= 128 && d[k] === or && d[k + 1] === og && d[k + 2] === ob) { d[k] = nr; d[k + 1] = ng; d[k + 2] = nb; changed = true; }
      }
      if (changed) { c.putImageData(data, 0, 0); this.dirtyImages.add(p); }
    }
  }

  changePalette(item: GbaTile | GbaSprite, id: string): void {
    item.palette = id;
    const img = this.images.get(item.image);
    if (img) { snapToPalette(img, this.data.palettes.find((p) => p.id === id)!); this.dirtyImages.add(item.image); }
    this.touch();
    this.render();
  }

  tileProps(t: GbaTile): HTMLElement {
    const info = TILE_TYPES[t.type];
    const box = h('div', { class: 'gs-form' },
      h('h3', {}, 'Tile'),
      field('Name', textInput(t.name, (v) => { t.name = v; this.touch(); this.renderList(); })),
      h('p', { class: 'gs-kv' }, h('span', {}, 'Type'), h('strong', {}, info.label)),
      h('p', { class: 'gs-kv' }, h('span', {}, 'In game'), h('span', {}, info.behaviour)),
      field('Palette', select(this.data.palettes.map((p) => [p.id, p.name]), t.palette, (v) => this.changePalette(t, v)), 'Changing it moves every pixel to the nearest color of the new palette.'));
    if (info.sized) {
      box.append(h('div', { class: 'gs-size' },
        field('Width', numberInput(tileSize(t).cols, (v) => { t.w = Math.max(1, Math.min(8, v)); this.ensureTileImage(t); this.touch(); this.renderPainter(); }, { min: 1, max: 8 })),
        field('Height', numberInput(tileSize(t).rows, (v) => { t.h = Math.max(1, Math.min(8, v)); this.ensureTileImage(t); this.touch(); this.renderPainter(); }, { min: 1, max: 8 }))));
    }
    if (info.passChoice) {
      box.append(field('Passability', select([['O', 'O · walkable'], ['X', 'X · blocked'], ['*', '☆ · walk behind']], t.pass ?? 'X', (v) => { t.pass = v as Passage; this.touch(); })));
    }
    if (t.type === 'ledge') {
      box.append(h('button', { type: 'button', class: 'btn small', title: 'Copy the three East pieces into West, mirrored left to right',
        onclick: () => this.westFromEast(t) }, 'Make West from East (mirrored)'));
    }
    box.append(this.itemButtons({ kind: 'tile', t }));
    return box;
  }

  spriteProps(s: GbaSprite): HTMLElement {
    const box = h('div', { class: 'gs-form' },
      h('h3', {}, 'Sprite'),
      field('Name', textInput(s.name, (v) => { s.name = v; this.touch(); this.renderList(); })),
      h('p', { class: 'gs-kv' }, h('span', {}, 'Kind'), h('strong', {}, SPRITE_KINDS[s.kind].label)),
      field('Palette', select(this.data.palettes.map((p) => [p.id, p.name]), s.palette, (v) => this.changePalette(s, v)), 'Each character gets its own 15 colors on the GBA.'));
    if (s.kind === 'overworld') {
      box.append(checkbox('The player walks around as this sprite', this.data.player === s.id, (v) => {
        this.data.player = v ? s.id : undefined;
        this.touch();
        this.renderList();
      }));
    }
    if (s.kind === 'effect') {
      box.append(
        field('Role', select([['hit', 'A hit (drawn in greys; takes the move’s element colours)'], ['burst', 'A burst (its own colours; played after elemental moves)']], s.role ?? 'hit', (v) => { s.role = v === 'burst' ? 'burst' : 'hit'; this.touch(); this.render(); })),
        s.role === 'burst' ? field('Element', select([['', '(none: picked by moves)'], ...Object.keys(ELEMENT_RAMPS).filter((e) => e !== 'neutral').map((e): [string, string] => [e, e[0].toUpperCase() + e.slice(1)]), ['ice', 'Ice (chill)'], ['poison', 'Poison']], s.element ?? '', (v) => { if (v) s.element = v; else delete s.element; this.touch(); }), 'Moves of this element play it after their hit.') : h('span'),
        field('Frames used', numberInput(s.frames ?? 6, (v) => { s.frames = Math.max(1, Math.min(6, Math.round(v))); this.touch(); }, { min: 1, max: 6, step: 1 }), 'Played left to right, about 10 a second.'),
        soundField('Sound', s.sound, (v) => { if (v) s.sound = v; else delete s.sound; this.touch(); }, 'Plays with it (built-in sounds go in the ROM as Game Boy-style chip sounds).'),
        h('p', { class: 'hint' }, 'Database → Additions and Spells choose a hit and a burst for each move.'));
    }
    box.append(this.itemButtons({ kind: 'sprite', s }));
    return box;
  }

  itemButtons(it: Item): HTMLElement {
    const item = it.kind === 'tile' ? it.t : it.s;
    const pal = this.itemPalette(it);
    const fileIn = h('input', { type: 'file', accept: 'image/png,image/*', hidden: true }) as HTMLInputElement;
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files?.[0];
      if (!f) return;
      const src = await blobToCanvas(f);
      const img = this.itemImage(it);
      const c = ctx2d(img);
      const before = c.getImageData(0, 0, img.width, img.height);
      const g = this.geometry(it);
      c.clearRect(0, g.offY, img.width, g.rows * g.fh);
      // Exactly the right size is copied as is; anything else is scaled to fit (pixel art stays crisp at whole sizes).
      c.imageSmoothingEnabled = false;
      c.drawImage(src, 0, 0, src.width, src.height, 0, g.offY, g.cols * g.fw, g.rows * g.fh);
      const tmp = blankCanvas(img.width, img.height);
      ctx2d(tmp).drawImage(img, 0, 0);
      snapToPalette(tmp, pal);
      c.clearRect(0, 0, img.width, img.height);
      c.drawImage(tmp, 0, 0);
      this.undo.set(item.image, [...(this.undo.get(item.image) ?? []), before]);
      this.touch(item.image);
      this.renderPainter();
      this.refreshThumb(it);
      toast(`Imported ${f.name} using the ${pal.name} colors`);
    });
    return h('div', { class: 'gs-actions' }, fileIn,
      h('button', { type: 'button', class: 'btn ghost small', title: 'Bring in a PNG (snapped to this palette)', onclick: () => fileIn.click() }, 'Import PNG…'),
      h('button', { type: 'button', class: 'btn ghost small', title: 'Save the sheet as a PNG to paint in another program', onclick: () => void this.download(it) }, 'Download PNG'),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => this.duplicate(it) }, 'Duplicate'),
      h('button', { type: 'button', class: 'btn ghost small danger', onclick: () => this.remove(it) }, 'Delete'));
  }

  async download(it: Item): Promise<void> {
    const img = this.itemImage(it);
    const a = h('a', { href: URL.createObjectURL(await canvasBlob(img)), download: `${it.kind === 'tile' ? it.t.id : it.s.id}.png` }) as HTMLAnchorElement;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  duplicate(it: Item): void {
    if (it.kind === 'tile') {
      const id = slug(it.t.name + ' copy', new Set(this.data.tiles.map((t) => t.id)));
      const t: GbaTile = { ...structuredClone(it.t), id, name: `${it.t.name} copy`, image: `gba/tiles/${id}.png` };
      this.data.tiles.push(t);
      this.images.set(t.image, resizeCanvas(this.itemImage(it), this.itemImage(it).width, this.itemImage(it).height));
      this.dirtyImages.add(t.image);
      this.sel.tiles = id;
    } else {
      const id = slug(it.s.name + ' copy', new Set(this.data.sprites.map((s) => s.id)));
      const s: GbaSprite = { ...structuredClone(it.s), id, name: `${it.s.name} copy`, image: `gba/sprites/${id}.png` };
      this.data.sprites.push(s);
      const src = this.itemImage(it);
      this.images.set(s.image, resizeCanvas(src, src.width, src.height));
      this.dirtyImages.add(s.image);
      this.sel.sprites = id;
    }
    this.touch();
    this.render();
  }

  remove(it: Item): void {
    const name = it.kind === 'tile' ? it.t.name : it.s.name;
    confirmModal('Delete', `Delete “${name}”? Its picture stays in the project folder until you remove it.`, 'Delete', () => {
      if (it.kind === 'tile') {
        this.data.tiles = this.data.tiles.filter((t) => t !== it.t);
        this.sel.tiles = this.data.tiles[0]?.id;
      } else {
        this.data.sprites = this.data.sprites.filter((s) => s !== it.s);
        if (this.data.player === it.s.id) this.data.player = undefined;
        this.sel.sprites = this.data.sprites[0]?.id;
      }
      this.touch();
      this.render();
    }, true);
  }

  /* ----------------------------------------------------------------- previews */

  groundCanvas(): HTMLCanvasElement {
    const t = this.data.tiles.find((x) => x.id === this.previewGround);
    if (t) return this.ensureTileImage(t);
    const c = blankCanvas(CELL, CELL);
    const g = ctx2d(c);
    g.fillStyle = '#58b048';
    g.fillRect(0, 0, CELL, CELL);
    g.fillStyle = '#489838';
    for (const [x, y] of [[3, 4], [10, 2], [7, 11], [13, 9], [1, 13]]) g.fillRect(x, y, 2, 1);
    return c;
  }

  drawPreview(tick = 0): void {
    const it = this.current();
    const pc = this.previewCanvas;
    if (!it || !pc) return;
    const img = this.itemImage(it);
    const S = 3; // preview scale
    if (it.kind === 'sprite') return this.drawSpritePreview(it.s, img, tick);

    const t = it.t;
    const { cols, rows, frames } = tileSize(t);
    const frame = frames > 1 ? Math.floor(tick / 4) % frames : 0;
    const offY = frame * rows * CELL;
    const cellsW = t.type === 'ground' ? 6 : TILE_TYPES[t.type].autotile ? SAMPLE_SHAPE[0].length : Math.max(6, cols + 2);
    const cellsH = t.type === 'ground' ? 4 : TILE_TYPES[t.type].autotile ? SAMPLE_SHAPE.length : Math.max(4, rows + 2);
    pc.width = cellsW * CELL * S;
    pc.height = cellsH * CELL * S;
    const c = pc.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    const ground = t.type === 'ground' ? img : this.groundCanvas();
    for (let y = 0; y < cellsH; y++) for (let x = 0; x < cellsW; x++) c.drawImage(ground, 0, 0, CELL, CELL, x * CELL * S, y * CELL * S, CELL * S, CELL * S);
    if (t.type === 'ground') return;
    const draw = (cx: number, cy: number, x: number, y: number) =>
      c.drawImage(img, cx * CELL, offY + cy * CELL, CELL, CELL, x * CELL * S, y * CELL * S, CELL * S, CELL * S);
    if (TILE_TYPES[t.type].autotile) {
      const inside = (x: number, y: number) => SAMPLE_SHAPE[y]?.[x] === '#';
      for (let y = 0; y < SAMPLE_SHAPE.length; y++) for (let x = 0; x < SAMPLE_SHAPE[0].length; x++) {
        const qs = quarters(inside, x, y);
        if (!qs) continue;
        if (t.type === 'cliff' && qs.every((q) => q === 'c')) continue; // the top of a cliff shows the ground
        const H = CELL / 2;
        drawQuarters(qs, (px, py, qx, qy) => c.drawImage(img, px * CELL + qx * H, offY + py * CELL + qy * H, H, H,
          (x * CELL + qx * H) * S, (y * CELL + qy * H) * S, H * S, H * S));
      }
      return;
    }
    if (t.type === 'ledge') {
      const piece = (p: number, x: number, y: number) => { const [lx, ly] = ledgeCell(p); draw(lx, ly, x, y); };
      // a plateau: west ledges on its left, east ledges on its right, a south row along the bottom
      piece(6, 1, 0); for (let y = 1; y < cellsH - 2; y++) piece(7, 1, y); piece(8, 1, cellsH - 2);
      piece(3, cellsW - 2, 0); for (let y = 1; y < cellsH - 2; y++) piece(4, cellsW - 2, y); piece(5, cellsW - 2, cellsH - 2);
      piece(0, 2, cellsH - 1); for (let x = 3; x < cellsW - 3; x++) piece(1, x, cellsH - 1); piece(2, cellsW - 3, cellsH - 1);
      return;
    }
    if (t.type === 'tallgrass') {
      for (let y = 1; y < cellsH - 1; y++) for (let x = 1; x < cellsW - 1; x++) draw((x + y + Math.floor(tick / 3)) % 7 === 0 ? 1 : 0, 0, x, y);
      return;
    }
    // objects, decorations, stairs, ladders, doors: centred on the ground
    const ox = Math.floor((cellsW - cols) / 2), oy = Math.floor((cellsH - rows) / 2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) draw(x, y, ox + x, oy + y);
  }

  drawSpritePreview(s: GbaSprite, img: HTMLCanvasElement, tick: number): void {
    const pc = this.previewCanvas;
    const k = SPRITE_KINDS[s.kind];
    const c = pc.getContext('2d')!;
    if (s.kind === 'overworld') {
      const S = 3;
      pc.width = 4 * 24 * S;
      pc.height = 36 * S;
      c.imageSmoothingEnabled = false;
      c.fillStyle = '#58b048';
      c.fillRect(0, 0, pc.width, pc.height);
      // Pokémon walk cycle: stand, step, stand, other step
      const cycle = [0, 1, 0, 2][Math.floor(tick / (this.previewRun ? 1 : 2)) % 4];
      const col = cycle + (this.previewRun ? 3 : 0);
      // down, left, up, right (right = left mirrored)
      const dirs: [number, boolean][] = [[0, false], [2, false], [1, false], [2, true]];
      dirs.forEach(([row, flip], i) => {
        const x = (i * 24 + 4) * S, y = 2 * S;
        c.save();
        if (flip) { c.translate(x + k.frameW * S, y); c.scale(-1, 1); } else c.translate(x, y);
        c.drawImage(img, col * k.frameW, row * k.frameH, k.frameW, k.frameH, 0, 0, k.frameW * S, k.frameH * S);
        c.restore();
      });
      return;
    }
    if (s.kind === 'effect') {
      // On the white battle screen, over a stand-in foe, playing on a loop.
      const frames = effectFrames(img, s, this.data, this.previewElement);
      const S2 = 3;
      pc.width = 64 * S2; pc.height = 64 * S2;
      c.imageSmoothingEnabled = false;
      c.fillStyle = '#f8f8f8';
      c.fillRect(0, 0, pc.width, pc.height);
      c.fillStyle = '#d8d8e0';
      c.beginPath(); c.ellipse(32 * S2, 52 * S2, 18 * S2, 5 * S2, 0, 0, Math.PI * 2); c.fill();
      const f = Math.floor(tick / 1) % (frames.length + 3);
      if (f < frames.length) c.drawImage(frames[f], 0, 0, 64 * S2, 64 * S2);
      return;
    }
    const S = 2;
    pc.width = k.frameW * S;
    pc.height = k.frameH * S;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#9ad0a0';
    c.fillRect(0, 0, pc.width, pc.height);
    const col = s.kind === 'backsprite' ? this.previewPose : 0;
    c.drawImage(img, col * k.frameW, 0, k.frameW, k.frameH, 0, 0, k.frameW * S, k.frameH * S);
  }

  /* ----------------------------------------------------------------- palettes tab */

  renderPalettes(): void {
    const pal = this.data.palettes.find((p) => p.id === this.sel.palettes) ?? this.data.palettes[0];
    if (!pal) { this.centerEl.replaceChildren(); this.sideEl.replaceChildren(); return; }
    const slots = pal.colors.map((col, i) => {
      const input = h('input', { type: 'color', value: col, 'aria-label': `Color ${i + 1}` }) as HTMLInputElement;
      input.addEventListener('change', () => {
        const fresh = gbaColor(input.value);
        const old = pal.colors[i];
        pal.colors[i] = fresh;
        input.value = fresh;
        hex.textContent = fresh;
        this.recolor(pal, old, fresh);
        this.touch();
        this.renderList();
      });
      const hex = h('code', {}, col);
      return h('label', { class: 'gs-slot' }, h('span', { class: 'gs-slot-n' }, String(i + 1)), input, hex);
    });
    const used = [...this.data.tiles.filter((t) => t.palette === pal.id).map((t) => t.name), ...this.data.sprites.filter((s) => s.palette === pal.id).map((s) => s.name)];
    this.centerEl.replaceChildren(h('div', { class: 'gs-palette-edit' },
      field('Name', textInput(pal.name, (v) => { pal.name = v; this.touch(); this.renderList(); })),
      h('p', { class: 'hint' }, 'Colors snap to the 32,768 the GBA can show. Changing a color recolors every tile and sprite that uses this palette. Slot 0 (not shown) is always transparent.'),
      h('div', { class: 'gs-slots' }, ...slots)));
    this.sideEl.replaceChildren(h('section', { class: 'gs-card' }, h('h3', {}, 'Used by'),
      used.length ? h('ul', { class: 'gs-used' }, ...used.map((n) => h('li', {}, n))) : h('p', { class: 'hint' }, 'Nothing uses this palette yet.'),
      used.length ? null : h('button', { type: 'button', class: 'btn ghost small danger', onclick: () => {
        if (this.data.palettes.length <= 1) return;
        this.data.palettes = this.data.palettes.filter((p) => p !== pal);
        this.sel.palettes = this.data.palettes[0].id;
        this.touch();
        this.render();
      } }, 'Delete palette')));
  }

  /* ----------------------------------------------------------------- keys */

  key(e: KeyboardEvent): void {
    // Dialogs above the studio get their own keys.
    const overlays = document.querySelectorAll('.overlay');
    if (overlays.length) return;
    const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); void this.save(); return; }
    if (typing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this.doRedo(); else this.doUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopPropagation(); this.doRedo(); return; }
    const cur = this.tab === 'tiles' || this.tab === 'sprites' ? this.current() : null;
    if (cur && (e.ctrlKey || e.metaKey) && ['c', 'x', 'v'].includes(e.key.toLowerCase())) {
      e.preventDefault(); e.stopPropagation();
      const k = e.key.toLowerCase();
      if (k === 'v') this.pasteCell(cur); else this.copyCell(cur, k === 'x');
      return;
    }
    if (cur && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); e.stopPropagation(); this.clearCells(cur); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tool = TOOLS.find(([, , , k]) => k.toLowerCase() === e.key.toLowerCase());
    if (tool && this.tab !== 'palettes') { e.preventDefault(); e.stopPropagation(); this.tool = tool[0]; this.renderPainter(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); e.stopPropagation(); this.setZoom(1); }
    if (e.key === '-') { e.preventDefault(); e.stopPropagation(); this.setZoom(-1); }
    // Block the map editor's shortcuts while the studio is open.
    e.stopPropagation();
  }
}

/** Pixels on a line (Bresenham). */
function linePixels(a: [number, number], b: [number, number]): [number, number][] {
  const out: [number, number][] = [];
  let [x0, y0] = a;
  const [x1, y1] = b;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return out;
}
