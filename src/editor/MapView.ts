import { HEIGHT_STYLES } from '../world/heights';
import { blockedTiles, footTiles, propBoxes } from '../world/props';
import { tintCanvas } from '../render/tint';
/**
 * The top-down map canvas: draws terrain, props, lights and events, and turns
 * mouse / touch input into editing tools. Pan with middle or right drag, Space+drag,
 * or two fingers; zoom with the wheel or a pinch.
 */
import type { LightData } from '../world/types';
import { MAX_HEIGHT, MIN_HEIGHT, STEP } from '../world/heights';
import { toast } from './dom';
import { waterStyle } from '../world/waterStyles';
import { TS, characterImage, drawTile, enemyImage, propSprite } from './editorArt';
import { groundTopView, loadGround, readGroundModel } from '../world/groundModel';
import { build3D } from '../game/World3D';
import type { MapData } from '../world/types';
import type { EditorStore } from './store';
import { PASSAGE_FLAGS } from '../world/passage';
import { eventH, eventW } from '../world/eventArea';
import { drawPassageIcon } from './passageIcons';
import { MARKER_COLORS, zoneColor } from '../world/zones';
import { drawBuildingTop, presetBuilding, presetById } from './buildingPresets';
import { doorstep } from '../world/buildingShape';

interface Pt { x: number; z: number }
type Stroke =
  | { kind: 'paint'; last: Pt; changed: boolean }
  | { kind: 'rect'; from: Pt; to: Pt }
  | { kind: 'place'; last: Pt | null; placed: number }
  | { kind: 'scatter'; last: Pt; placed: number }
  | { kind: 'erase'; removed: number }
  | { kind: 'rampErase'; removed: number; last: Pt }
  | { kind: 'drag'; target: 'prop' | 'light' | 'event' | 'start' | 'building'; index: number; offset: Pt; moved: boolean }
  | { kind: 'build'; from: Pt; to: Pt }
  | { kind: 'bresize'; index: number; moved: boolean }
  | { kind: 'area'; from: Pt; to: Pt }
  | { kind: 'height'; visited: Set<number>; changed: boolean; last: Pt }
  | { kind: 'water'; changed: boolean; last: Pt }
  | { kind: 'passage'; changed: boolean; last: Pt }
  | { kind: 'zones'; changed: boolean; last: Pt }
  | { kind: 'select-area'; from: Pt; to: Pt }
  | { kind: 'resize'; index: number; moved: boolean }
  | { kind: 'none' };

const MIN_ZOOM = 0.5, MAX_ZOOM = 8;
const r2 = (v: number) => Math.round(v * 100) / 100;

export interface HoverInfo { x: number; z: number; terrain: string | null; height: number; water: string | null; passage: string | null; zone?: string | null }

export class MapView {
  readonly el: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrainCanvas = document.createElement('canvas');
  private dpr = 1;
  private zoom = 2;
  private ox = 0;
  private oy = 0;
  private needsTerrain = true;
  /** Update 153: top-down pictures of maps' 3D model grounds, by file and fit. */
  private readonly groundViews = new Map<string, HTMLCanvasElement | 'loading' | 'failed'>();
  private groundView(m: MapData): HTMLCanvasElement | null {
    const g = (m.scene3d ?? m.groundModel)!, key = JSON.stringify([g, m.width, m.height]);
    const have = this.groundViews.get(key);
    if (have instanceof HTMLCanvasElement) return have;
    if (have) return null;
    this.groundViews.set(key, 'loading');
    void (async () => {
      try {
        const blob = this.store.files.get(g.src) ?? await this.store.project.readFile(g.src);
        if (!this.store.files.has(g.src)) this.store.files.set(g.src, blob);
        const url = URL.createObjectURL(blob);
        // A 3D map's scene as it's placed in the game; a model ground as it's fitted.
        try { this.groundViews.set(key, groundTopView(m.scene3d ? { object: build3D(await readGroundModel(url, g.src), m.scene3d.scale ?? 1).object } as Parameters<typeof groundTopView>[0] : await loadGround(m, url), m.width, m.height, TS)); }
        finally { URL.revokeObjectURL(url); }
      } catch { this.groundViews.set(key, 'failed'); }
      this.needsTerrain = true; this.needsDraw = true;
    })();
    return null;
  }
  private needsDraw = true;
  private hover: Pt | null = null;
  private stroke: Stroke | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; midX: number; midY: number; zoom: number; ox: number; oy: number } | null = null;
  private pan: { x: number; y: number; ox: number; oy: number } | null = null;
  private spaceHeld = false;
  private fitted = false;
  /** Has the user panned or zoomed? If not, keep the map fitted when the view resizes. */
  private userMoved = false;
  onHover: (info: HoverInfo | null) => void = () => {};
  /** Called after each redraw with the zoom level in percent. */
  onView: (zoomPercent: number) => void = () => {};

  constructor(private readonly store: EditorStore) {
    this.el = document.createElement('div');
    this.el.className = 'mapview';
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-label', 'Map canvas');
    this.canvas.tabIndex = 0;
    this.el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    store.on('map', () => { this.needsTerrain = true; this.needsDraw = true; });
    store.on('selection', () => (this.needsDraw = true));
    // Height shading depends on the layer, so the ground image is redrawn when the layer changes.
    store.on('ui', () => { this.needsTerrain = true; this.needsDraw = true; });
    store.on('structure', () => (this.needsDraw = true));

    new ResizeObserver(() => this.resize()).observe(this.el);
    this.bindInput();
    const loop = () => { this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------ view */

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const r = this.el.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    if ((!this.fitted || !this.userMoved) && r.width > 0) { this.fit(); this.fitted = true; }
    this.needsDraw = true;
  }

  /** Zoom and centre so the whole map is visible. */
  fit(): void {
    const r = this.el.getBoundingClientRect();
    if (!this.store.map || r.width === 0) return;
    const mw = this.store.map.width * TS, mh = this.store.map.height * TS;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((r.width - 48) / mw, (r.height - 48) / mh)));
    this.ox = (r.width - mw * this.zoom) / 2;
    this.oy = (r.height - mh * this.zoom) / 2;
    this.userMoved = false;
    this.needsDraw = true;
  }

  zoomBy(f: number, cx?: number, cy?: number): void {
    const r = this.el.getBoundingClientRect();
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * f));
    this.ox = px - ((px - this.ox) * z) / this.zoom;
    this.oy = py - ((py - this.oy) * z) / this.zoom;
    this.zoom = z;
    this.userMoved = true;
    this.needsDraw = true;
  }

  /** Scroll so tile (x, z) is in the middle of the view. */
  centerOn(x: number, z: number): void {
    const r = this.el.getBoundingClientRect();
    this.ox = r.width / 2 - (x + 0.5) * TS * this.zoom;
    this.oy = r.height / 2 - (z + 0.5) * TS * this.zoom;
    this.userMoved = true;
    this.needsDraw = true;
  }

  get zoomPercent(): number { return Math.round(this.zoom * 100); }

  /** The tile under the mouse, if it's over the map. */
  hoveredTile(): Pt | null {
    const h = this.hover;
    if (!h) return null;
    const t = this.tile(h);
    return this.store.inMap(t.x, t.z) ? t : null;
  }

  private toWorld(clientX: number, clientY: number): Pt {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / (TS * this.zoom), z: (clientY - r.top - this.oy) / (TS * this.zoom) };
  }

  /* ------------------------------------------------------------ input */

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !isTyping(e)) { this.spaceHeld = true; this.el.classList.add('grab'); if (document.activeElement === c) e.preventDefault(); } });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.spaceHeld = false; this.el.classList.remove('grab'); } });

    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      c.focus({ preventScroll: true });
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        // Second finger: switch to pinch / pan and cancel whatever the first finger started.
        this.cancelStroke();
        const [a, b] = [...this.pointers.values()];
        this.userMoved = true;
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, zoom: this.zoom, ox: this.ox, oy: this.oy };
        return;
      }
      if (this.pointers.size > 2) return;
      if (e.button === 1 || e.button === 2 || this.spaceHeld) {
        this.pan = { x: e.clientX, y: e.clientY, ox: this.ox, oy: this.oy };
        this.userMoved = true;
        this.el.classList.add('grabbing');
        return;
      }
      if (e.button !== 0) return;
      this.beginStroke(this.toWorld(e.clientX, e.clientY));
    });

    c.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const r = c.getBoundingClientRect();
        const dist = Math.hypot(a.x - b.x, a.y - b.y), midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
        const p = this.pinch, z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, p.zoom * (dist / Math.max(1, p.dist))));
        const ax = p.midX - r.left, ay = p.midY - r.top;
        this.zoom = z;
        this.ox = midX - r.left - ((ax - p.ox) * z) / p.zoom;
        this.oy = midY - r.top - ((ay - p.oy) * z) / p.zoom;
        this.needsDraw = true;
        return;
      }
      if (this.pan) {
        this.ox = this.pan.ox + e.clientX - this.pan.x;
        this.oy = this.pan.oy + e.clientY - this.pan.y;
        this.needsDraw = true;
        return;
      }
      const w = this.toWorld(e.clientX, e.clientY);
      this.hover = w;
      this.reportHover(w);
      if (this.stroke) this.continueStroke(w);
      this.needsDraw = true;
    });

    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; return; }
      if (this.pan) { this.pan = null; this.el.classList.remove('grabbing'); return; }
      if (this.stroke) this.endStroke();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.hover = null; this.onHover(null); this.needsDraw = true; } });
  }

  private reportHover(w: Pt): void {
    const x = Math.floor(w.x), z = Math.floor(w.z), s = this.store;
    const wtr = s.inMap(x, z) ? s.waterAt(x, z) : null;
    this.onHover(s.inMap(x, z) ? { x, z, terrain: s.terrainAt(x, z), height: s.heightAt(x, z),
      water: wtr ? `${{ shallow: 'shallow', swim: 'swimmable', deep: 'deep' }[wtr.kind]} water, level ${Math.round(wtr.surface / 0.5)}` : null,
      passage: s.inMap(x, z) ? PASSAGE_FLAGS.find((f) => f.key === s.passageAt(x, z))?.name ?? null : null,
      zone: s.inMap(x, z) && s.zoneAt(x, z) !== '.' ? s.zoneAt(x, z) : null } : null);
  }

  /* ------------------------------------------------------------ tools */

  private tile(p: Pt): Pt { return { x: Math.floor(p.x), z: Math.floor(p.z) }; }

  private beginStroke(w: Pt): void {
    const s = this.store, t = this.tile(w);
    this.hover = w;
    switch (s.mode) {
      case 'terrain':
        if (s.terrainTool === 'pencil') { s.checkpoint(); this.stroke = { kind: 'paint', last: t, changed: this.paint(t) }; }
        else if (s.terrainTool === 'rect') this.stroke = { kind: 'rect', from: t, to: t };
        else { s.checkpoint(); if (this.flood(t)) s.changed(); else s.dropCheckpoint(); this.stroke = { kind: 'none' }; }
        break;
      case 'water':
        this.waterDown(t);
        break;
      case 'height':
        if (s.heightTool === 'ramp') {
          if (s.rampTool === 'erase') {
            s.checkpoint();
            this.stroke = { kind: 'rampErase', removed: 0, last: t };
            this.eraseRamp(t);
            break;
          }
          if (!s.inMap(t.x, t.z)) break;
          if (!s.rampAt(t.x, t.z)) {
            s.checkpoint();
            (s.map.ramps ??= []).push({ x: t.x, z: t.z, style: s.rampStyle });
            s.changed('structure');
          }
          s.select({ kind: 'ramp', x: t.x, z: t.z });
          break;
        }
        if (s.heightTool === 'water') { this.waterDown(t); break; }
        if (s.heightTool === 'fill') { this.fillHeight(t); break; }
        if (s.heightTool === 'style' && s.heightStyleFill) { this.fillHeightStyle(t); break; }
        s.checkpoint();
        this.stroke = { kind: 'height', visited: new Set(), changed: false, last: t };
        this.applyHeight(t);
        break;
      case 'passage':
        s.checkpoint();
        this.stroke = { kind: 'passage', changed: false, last: t };
        this.applyPassage(t);
        break;
      case 'zones':
        s.checkpoint();
        this.stroke = { kind: 'zones', changed: false, last: t };
        // Battle maps: one marker per click (no painting).
        if (s.isBattleMap()) { if (s.setMarker(t.x, t.z)) { this.stroke.changed = true; s.changed(); s.emit('ui'); } }
        else this.applyZone(t);
        break;
      case 'props':
        if (s.propTool === 'place') { s.checkpoint(); this.stroke = { kind: 'place', last: null, placed: 0 }; this.placeProp(w); }
        else if (s.propTool === 'scatter') { s.checkpoint(); this.stroke = { kind: 'scatter', last: w, placed: 0 }; this.scatter(w); }
        else if (s.propTool === 'erase') { s.checkpoint(); this.stroke = { kind: 'erase', removed: 0 }; this.eraseProp(w); }
        else {
          const i = this.hitProp(w);
          s.select(i >= 0 ? { kind: 'prop', index: i } : null);
          this.stroke = i >= 0 ? { kind: 'drag', target: 'prop', index: i, offset: { x: s.map.props[i].x - w.x, z: s.map.props[i].z - w.z }, moved: false } : { kind: 'none' };
        }
        break;
      case 'lights': {
        // A selected area light can be resized from its bottom-right corner handle.
        const sel = s.selection;
        if (sel?.kind === 'light' && s.lightTool !== 'erase') {
          const l = s.map.lights[sel.index];
          if (l?.type === 'area' && Math.hypot(w.x - (l.x + l.w / 2), w.z - (l.z + l.h / 2)) < Math.max(0.35, 8 / (TS * this.zoom))) {
            this.stroke = { kind: 'resize', index: sel.index, moved: false };
            break;
          }
        }
        const i = s.lightAt(w.x, w.z);
        if (s.lightTool === 'place') {
          if (!s.inMap(t.x, t.z)) break;
          if (s.lightType === 'area') { this.stroke = { kind: 'area', from: t, to: t }; break; }
          // One point light or spotlight per tile: clicking a taken tile selects its light.
          const taken = s.lightOnTile(t.x, t.z);
          if (taken >= 0) { s.select({ kind: 'light', index: taken }); break; }
          s.checkpoint();
          s.map.lights.push({ ...s.lightPreset[s.lightType].values, type: s.lightType, x: t.x + 0.5, z: t.z + 0.5 } as LightData);
          s.select({ kind: 'light', index: s.map.lights.length - 1 });
          s.changed('selection');
        } else if (s.lightTool === 'erase') {
          if (i >= 0) { s.checkpoint(); s.map.lights.splice(i, 1); s.select(null); s.changed(); }
        } else {
          s.select(i >= 0 ? { kind: 'light', index: i } : null);
          if (i >= 0) {
            const l = s.map.lights[i];
            this.stroke = { kind: 'drag', target: 'light', index: i, offset: { x: l.x - w.x, z: l.z - w.z }, moved: false };
          }
        }
        break;
      }
      case 'buildings': {
        const list = s.map.buildings ?? [], sel = s.selection;
        // The selected building's bottom-right corner handle resizes it.
        if (sel?.kind === 'building' && list[sel.index]) {
          const b = list[sel.index];
          if (Math.hypot(w.x - (b.x + b.w), w.z - (b.z + b.d)) < Math.max(0.4, 9 / (TS * this.zoom))) { this.stroke = { kind: 'bresize', index: sel.index, moved: false }; break; }
        }
        const i = s.buildingAt(t.x, t.z);
        if (i >= 0) {
          s.select({ kind: 'building', index: i });
          this.stroke = { kind: 'drag', target: 'building', index: i, offset: { x: list[i].x - t.x, z: list[i].z - t.z }, moved: false };
        } else if (s.buildingTool === 'draw' && s.inMap(t.x, t.z)) this.stroke = { kind: 'build', from: t, to: t };
        else s.select(null);
        break;
      }
      case 'events': {
        const st = s.db.start;
        if (s.startHere && Math.floor(st.x) === t.x && Math.floor(st.z) === t.z) {
          s.select({ kind: 'start' });
          this.stroke = { kind: 'drag', target: 'start', index: 0, offset: { x: 0, z: 0 }, moved: false };
          break;
        }
        const ev = s.eventAt(t.x, t.z);
        if (ev) {
          s.select({ kind: 'event', id: ev.id });
          // Remember where in the event it was grabbed, so a big event moves with the cursor.
          this.stroke = { kind: 'drag', target: 'event', index: ev.id, offset: { x: ev.x - t.x, z: ev.z - t.z }, moved: false };
        } else if (s.inMap(t.x, t.z)) {
          // Empty tile: click selects it, drag selects a rectangle of tiles (for an event covering them all).
          s.select({ kind: 'tile', x: t.x, z: t.z });
          this.stroke = { kind: 'select-area', from: t, to: t };
        } else s.select(null);
        break;
      }
    }
    this.needsDraw = true;
  }

  /** Ramp eraser: removes the ramp on a cell (counted on the stroke so an empty drag leaves no undo step). */
  private eraseRamp(t: Pt): void {
    const st = this.stroke;
    if (!this.store.removeRamp(t.x, t.z)) return;
    if (st?.kind === 'rampErase') st.removed++;
    this.store.changed('structure');
  }

  private continueStroke(w: Pt): void {
    const st = this.stroke;
    if (!st) return;
    const t = this.tile(w);
    switch (st.kind) {
      case 'paint':
        if (t.x !== st.last.x || t.z !== st.last.z) {
          for (const p of line(st.last, t)) if (this.paint(p)) st.changed = true;
          st.last = t;
        }
        break;
      case 'rect': st.to = t; break;
      case 'height':
        if (t.x !== st.last.x || t.z !== st.last.z) { for (const p of line(st.last, t)) this.applyHeight(p); st.last = t; }
        break;
      case 'water':
        if (t.x !== st.last.x || t.z !== st.last.z) { for (const p of line(st.last, t)) this.applyWater(p); st.last = t; }
        break;
      case 'passage':
        if (t.x !== st.last.x || t.z !== st.last.z) { for (const p of line(st.last, t)) this.applyPassage(p); st.last = t; }
        break;
      case 'zones':
        if (this.store.isBattleMap()) break;
        if (t.x !== st.last.x || t.z !== st.last.z) { for (const p of line(st.last, t)) this.applyZone(p); st.last = t; }
        break;
      case 'area': st.to = t; break;
      case 'build': {
        const m = this.store.map;
        st.to = { x: Math.max(0, Math.min(m.width - 1, t.x)), z: Math.max(0, Math.min(m.height - 1, t.z)) };
        break;
      }
      case 'bresize': this.resizeBuilding(st, w); break;
      case 'select-area': {
        const m = this.store.map;
        st.to = { x: Math.max(0, Math.min(m.width - 1, t.x)), z: Math.max(0, Math.min(m.height - 1, t.z)) };
        break;
      }
      case 'resize': this.resizeArea(st, w); break;
      case 'place': this.placeProp(w); break;
      case 'scatter':
        if (Math.hypot(w.x - st.last.x, w.z - st.last.z) >= 0.5) { st.last = w; this.scatter(w); }
        break;
      case 'erase': this.eraseProp(w); break;
      case 'rampErase':
        if (t.x !== st.last.x || t.z !== st.last.z) { for (const p of line(st.last, t)) this.eraseRamp(p); st.last = t; }
        break;
      case 'drag': this.drag(st, w); break;
    }
  }

  private endStroke(): void {
    const st = this.stroke, s = this.store;
    this.stroke = null;
    if (!st) return;
    if (st.kind === 'paint' && !st.changed) s.dropCheckpoint();
    if (st.kind === 'rampErase' && !st.removed) s.dropCheckpoint();
    if ((st.kind === 'height' || st.kind === 'water' || st.kind === 'passage' || st.kind === 'zones') && !st.changed) s.dropCheckpoint();
    if (st.kind === 'rect') {
      s.checkpoint();
      let any = false;
      const [x0, x1] = [Math.min(st.from.x, st.to.x), Math.max(st.from.x, st.to.x)];
      const [z0, z1] = [Math.min(st.from.z, st.to.z), Math.max(st.from.z, st.to.z)];
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (s.paintLayer(x, z)) any = true;
      if (any) s.changed(); else s.dropCheckpoint();
    }
    if (st.kind === 'area') {
      const x0 = Math.min(st.from.x, st.to.x), z0 = Math.min(st.from.z, st.to.z);
      const wTiles = Math.abs(st.to.x - st.from.x) + 1, hTiles = Math.abs(st.to.z - st.from.z) + 1;
      const preset = s.lightPreset.area.values as { w: number; h: number };
      // A plain click places the preset's size centred on the tile; a drag sets the size.
      const single = wTiles === 1 && hTiles === 1;
      const w = single ? preset.w : wTiles, h = single ? preset.h : hTiles;
      const cx = single ? x0 + 0.5 : x0 + w / 2, cz = single ? z0 + 0.5 : z0 + h / 2;
      s.checkpoint();
      s.map.lights.push({ ...s.lightPreset.area.values, type: 'area', x: cx, z: cz, w, h } as LightData);
      s.select({ kind: 'light', index: s.map.lights.length - 1 });
      s.changed('selection');
    }
    if (st.kind === 'resize' && st.moved) s.emit('selection');
    if (st.kind === 'bresize' && st.moved) s.changed('structure');
    if (st.kind === 'build') {
      const x = Math.min(st.from.x, st.to.x), z = Math.min(st.from.z, st.to.z);
      const bw = Math.abs(st.to.x - st.from.x) + 1, bd = Math.abs(st.to.z - st.from.z) + 1;
      // A click places the preset at its own size; a drag sets the footprint (at least 2 × 2).
      const single = bw === 1 && bd === 1;
      const b = single ? presetBuilding(s.buildingPreset, x, z) : presetBuilding(s.buildingPreset, x, z, Math.max(2, bw), Math.max(2, bd));
      if (!s.buildingFits(b)) toast(single ? 'The preset doesn’t fit there (it would leave the map or overlap a building).' : 'Buildings can’t overlap each other or leave the map.', 'error');
      else {
        s.checkpoint();
        (s.map.buildings ??= []).push(b);
        s.select({ kind: 'building', index: s.map.buildings.length - 1 });
        s.changed('structure');
      }
    }
    if (st.kind === 'select-area') {
      const x = Math.min(st.from.x, st.to.x), z = Math.min(st.from.z, st.to.z);
      const w = Math.abs(st.to.x - st.from.x) + 1, hh = Math.abs(st.to.z - st.from.z) + 1;
      s.select(w > 1 || hh > 1 ? { kind: 'tile', x, z, w, h: hh } : { kind: 'tile', x, z });
    }
    if ((st.kind === 'place' || st.kind === 'scatter') && !st.placed) s.dropCheckpoint();
    if (st.kind === 'erase' && !st.removed) s.dropCheckpoint();
    if (st.kind === 'drag' && st.moved) s.emit('selection');
    this.needsDraw = true;
  }

  private cancelStroke(): void {
    const st = this.stroke;
    this.stroke = null;
    if (!st) return;
    const changedSomething = (st.kind === 'paint') || st.kind === 'height' || st.kind === 'water' || st.kind === 'passage' || st.kind === 'zones' || (st.kind === 'place' || st.kind === 'scatter') || st.kind === 'erase' ||
      ((st.kind === 'drag' || st.kind === 'resize' || st.kind === 'bresize') && st.moved);
    if (changedSomething) this.store.revertCheckpoint();
  }

  /**
   * Raise, lower or set the heights under the brush. Each cell changes at most once per stroke,
   * so dragging over the same ground doesn't keep raising it.
   */
  private applyHeight(t: Pt): void {
    const s = this.store, st = this.stroke;
    if (!st || st.kind !== 'height') return;
    const n = s.brushSize, o = Math.floor((n - 1) / 2);
    if (s.heightTool === 'style') {
      const done = s.editHeightStyles((grid, w) => {
        let any = false;
        for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) {
          const x = t.x - o + dx, z = t.z - o + dz;
          if (!s.inMap(x, z) || grid[z * w + x] === s.heightStyleBrush) continue;
          grid[z * w + x] = s.heightStyleBrush; any = true;
        }
        return any;
      });
      if (done) { st.changed = true; s.changed(); }
      return;
    }
    const changed = s.editHeights((grid, w) => {
      let any = false;
      for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) {
        const x = t.x - o + dx, z = t.z - o + dz;
        if (!s.inMap(x, z)) continue;
        const i = z * w + x;
        if (st.visited.has(i)) continue;
        st.visited.add(i);
        const v = s.heightTool === 'raise' ? grid[i] + 1 : s.heightTool === 'lower' ? grid[i] - 1 : s.heightValue;
        const nv = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, v));
        if (nv !== grid[i]) { grid[i] = nv; any = true; }
      }
      return any;
    });
    if (changed) { st.changed = true; s.changed(); }
  }

  /** Style fill: every cell connected to the clicked one at the same height takes the chosen style. */
  private fillHeightStyle(t: Pt): void {
    const s = this.store;
    if (!s.inMap(t.x, t.z)) return;
    s.checkpoint();
    const w = s.map.width, hgt = s.map.height, area: number[] = [];
    const from = s.heightAt(t.x, t.z), seen = new Uint8Array(w * hgt), stack = [t.z * w + t.x];
    while (stack.length) {
      const i = stack.pop()!, x = i % w, z = (i - x) / w;
      if (seen[i] || s.heightAt(x, z) !== from) continue;
      seen[i] = 1; area.push(i);
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (z > 0) stack.push(i - w);
      if (z < hgt - 1) stack.push(i + w);
    }
    const done = s.editHeightStyles((grid) => {
      let any = false;
      for (const i of area) if (grid[i] !== s.heightStyleBrush) { grid[i] = s.heightStyleBrush; any = true; }
      return any;
    });
    if (done) s.changed(); else s.dropCheckpoint();
  }

  /** Fill: every cell connected to the clicked one at the same height is set to the height, or raised or lowered. */
  private fillHeight(t: Pt): void {
    const s = this.store;
    if (!s.inMap(t.x, t.z)) return;
    s.checkpoint();
    const changed = s.editHeights((grid, w) => {
      const hgt = grid.length / w, from = grid[t.z * w + t.x];
      const to = (v: number) => Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, s.heightFillMode === 'set' ? s.heightValue : s.heightFillMode === 'raise' ? v + s.heightFillBy : v - s.heightFillBy));
      if (to(from) === from) return false;
      const seen = new Uint8Array(grid.length), stack = [t.z * w + t.x], area: number[] = [];
      while (stack.length) {
        const i = stack.pop()!;
        if (seen[i] || grid[i] !== from) continue;
        seen[i] = 1; area.push(i);
        const x = i % w, z = (i - x) / w;
        if (x > 0) stack.push(i - 1);
        if (x < w - 1) stack.push(i + 1);
        if (z > 0) stack.push(i - w);
        if (z < hgt - 1) stack.push(i + w);
      }
      for (const i of area) grid[i] = to(from);
      return area.length > 0;
    });
    if (changed) s.changed(); else s.dropCheckpoint();
  }

  /** The Water tab's tools on a click: fill a basin, restyle a pool, or start painting or removing. */
  private waterDown(t: Pt): void {
    const s = this.store;
    if (s.waterMode === 'fill') { this.fillBasin(t); return; }
    if (s.waterMode === 'style') { this.restylePool(t); return; }
    if (s.waterMode === 'fish' && !s.fishErase && !s.map.fishZones?.length) { toast('Add a fishing spot first (+ New fishing spot).', 'error'); return; }
    s.checkpoint();
    this.stroke = { kind: 'water', changed: false, last: t };
    this.applyWater(t);
  }

  /** Give a whole pool (the connected water around the clicked cell) the chosen water style. */
  private restylePool(t: Pt): void {
    const s = this.store, m = s.map;
    if (!s.inMap(t.x, t.z) || !s.water()[t.z * m.width + t.x]) { toast('Click on water to restyle its pool.', 'error'); return; }
    s.checkpoint();
    let count = 0;
    const style = s.waterStyle, from = s.water()[t.z * m.width + t.x]?.style ?? 0;
    // The pool: connected water of the clicked style (so a stream painted in another style stays as it is).
    const changed = s.editWater((grid, w) => {
      const seen = new Uint8Array(w * m.height), stack: Pt[] = [t];
      while (stack.length) {
        const p = stack.pop()!;
        if (!s.inMap(p.x, p.z)) continue;
        const i = p.z * w + p.x, c = grid[i];
        if (seen[i] || !c || (c.style ?? 0) !== from) continue;
        seen[i] = 1;
        if ((c.style ?? 0) !== style) { grid[i] = { ...c, ...(style ? { style } : {}) }; if (!style) delete grid[i]!.style; count++; }
        stack.push({ x: p.x + 1, z: p.z }, { x: p.x - 1, z: p.z }, { x: p.x, z: p.z + 1 }, { x: p.x, z: p.z - 1 });
      }
      return count > 0;
    });
    if (changed) s.changed(); else s.dropCheckpoint();
  }

  /** Paint or remove water under the brush. */
  private applyWater(t: Pt): void {
    const s = this.store, st = this.stroke;
    if (!st || st.kind !== 'water') return;
    const n = s.brushSize, o = Math.floor((n - 1) / 2);
    if (s.waterMode === 'fish') {
      // Fishing spots: painted over water only (or erased).
      const water = s.water();
      const done = s.editFishing((grid, w) => {
        let any = false;
        for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) {
          const x = t.x - o + dx, z = t.z - o + dz;
          if (!s.inMap(x, z)) continue;
          const i = z * w + x;
          const want = s.fishErase || !water[i] ? null : s.fishZone;
          if (s.fishErase ? grid[i] === null : !water[i] || grid[i] === want) continue;
          grid[i] = want; any = true;
        }
        return any;
      });
      if (done) { st.changed = true; s.changed(); }
      return;
    }
    const changed = s.editWater((grid, w) => {
      let any = false;
      for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) {
        const x = t.x - o + dx, z = t.z - o + dz;
        if (!s.inMap(x, z)) continue;
        const i = z * w + x, cur = grid[i];
        if (s.waterMode === 'remove') { if (cur) { grid[i] = null; any = true; } continue; }
        if (cur && cur.level === s.waterLevel && cur.kind === s.waterKind && (cur.style ?? 0) === s.waterStyle) continue;
        grid[i] = { level: s.waterLevel, kind: s.waterKind, ...(s.waterStyle ? { style: s.waterStyle } : {}) };
        any = true;
      }
      return any;
    });
    if (changed) { st.changed = true; s.changed(); }
  }

  /** Paint (or erase) the encounter zone letter under the brush (or the safe zone mark, when one is picked). */
  private applyZone(t: Pt): void {
    const s = this.store, st = this.stroke;
    if (!st || st.kind !== 'zones') return;
    const n = s.brushSize, o = Math.floor((n - 1) / 2);
    if (s.safeMark !== null) {
      const mark = s.safeMark;
      const done = s.editSafe((grid, w) => {
        let any = false;
        for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) {
          const x = t.x - o + dx, z = t.z - o + dz;
          if (!s.inMap(x, z)) continue;
          const i = z * w + x;
          if (grid[i] !== mark) { grid[i] = mark; any = true; }
        }
        return any;
      });
      if (done) { st.changed = true; s.changed(); }
      return;
    }
    const changed = s.editZones((grid, w) => {
      let any = false;
      for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) {
        const x = t.x - o + dx, z = t.z - o + dz;
        if (!s.inMap(x, z)) continue;
        const i = z * w + x;
        if (grid[i] !== s.zoneLetter) { grid[i] = s.zoneLetter; any = true; }
      }
      return any;
    });
    if (changed) { st.changed = true; s.changed(); }
  }

  /** Paint (or erase) the passage flag under the brush. */
  private applyPassage(t: Pt): void {
    const s = this.store, st = this.stroke;
    if (!st || st.kind !== 'passage') return;
    const n = s.brushSize, o = Math.floor((n - 1) / 2);
    const changed = s.editPassage((grid, w) => {
      let any = false;
      for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) {
        const x = t.x - o + dx, z = t.z - o + dz;
        if (!s.inMap(x, z)) continue;
        const i = z * w + x;
        if (grid[i] !== s.passageFlag) { grid[i] = s.passageFlag; any = true; }
      }
      return any;
    });
    if (changed) { st.changed = true; s.changed(); }
  }

  /**
   * Fill a basin: from the clicked cell, water spreads to every connected cell whose ground is below
   * the water level, like pouring water into a dug-out hollow.
   */
  private fillBasin(t: Pt): void {
    const s = this.store, m = s.map, level = s.waterLevel;
    if (!s.inMap(t.x, t.z)) return;
    // A paint bucket: it fills the connected area that matches the clicked cell (dry ground, or water of the same
    // level, type and style), so filling inside a painted ring only fills the ring, not the water around it.
    const cellKey = (c: { level: number; kind?: string; style?: number } | null | undefined) => (c ? `${c.level}|${c.kind ?? 'auto'}|${c.style ?? 0}` : '');
    const start = cellKey(s.water()[t.z * m.width + t.x]);
    if (!start && s.heightAt(t.x, t.z) >= level) {
      toast(`The ground here is at height ${s.heightAt(t.x, t.z)}, not below the water level (${level}). Lower the ground or raise the level.`, 'error');
      return;
    }
    s.checkpoint();
    let count = 0, edge = false;
    const changed = s.editWater((grid, w) => {
      const seen = new Uint8Array(w * m.height), stack: Pt[] = [t];
      while (stack.length) {
        const p = stack.pop()!;
        if (!s.inMap(p.x, p.z)) { edge = true; continue; }
        const i = p.z * w + p.x;
        if (seen[i] || cellKey(grid[i]) !== start || s.heightAt(p.x, p.z) >= level) continue;
        seen[i] = 1;
        grid[i] = { level, kind: s.waterKind, ...(s.waterStyle ? { style: s.waterStyle } : {}) };
        count++;
        stack.push({ x: p.x + 1, z: p.z }, { x: p.x - 1, z: p.z }, { x: p.x, z: p.z + 1 }, { x: p.x, z: p.z - 1 });
      }
      return count > 0;
    });
    if (changed) {
      s.changed();
      toast(edge && !start ? `Filled ${count} cells. The water reaches the map edge (it carries on past it in the game): raise the ground around it if it should be enclosed.` : `Filled ${count} cell${count === 1 ? '' : 's'} with water.`);
    } else s.dropCheckpoint();
  }

  /** Paint the brush footprint centred on tile t. */
  private paint(t: Pt): boolean {
    const s = this.store, n = s.brushSize, o = Math.floor((n - 1) / 2);
    let any = false;
    for (let dz = 0; dz < n; dz++) for (let dx = 0; dx < n; dx++) if (s.paintLayer(t.x - o + dx, t.z - o + dz)) any = true;
    if (any) s.changed();
    return any;
  }

  private flood(t: Pt): boolean {
    const s = this.store;
    if (!s.inMap(t.x, t.z)) return false;
    const from = s.layerAt(t.x, t.z), to = s.terrainLayer === 'upper' ? s.upperTile : s.terrain;
    if (from === to) return false;
    const stack: Pt[] = [t];
    while (stack.length) {
      const p = stack.pop()!;
      if (!s.inMap(p.x, p.z) || s.layerAt(p.x, p.z) !== from) continue;
      s.paintLayer(p.x, p.z);
      stack.push({ x: p.x + 1, z: p.z }, { x: p.x - 1, z: p.z }, { x: p.x, z: p.z + 1 }, { x: p.x, z: p.z - 1 });
    }
    return true;
  }

  private placeProp(w: Pt): void {
    const s = this.store, st = this.stroke;
    if (!st || st.kind !== 'place') return;
    const t = this.tile(w);
    if (!s.inMap(t.x, t.z)) return;
    const p = this.propPos(s.propType, w);
    if (st.last && (s.snap ? (st.last.x === p.x && st.last.z === p.z) : Math.hypot(p.x - st.last.x, p.z - st.last.z) < 1)) return;
    st.last = p;
    // One prop per tile: the same prop again does nothing, a different one replaces it.
    const existing = s.propOnTile(Math.floor(p.x), Math.floor(p.z));
    if (existing >= 0) {
      if (s.map.props[existing].type === s.propType) return;
      s.map.props.splice(existing, 1);
      if (s.selection?.kind === 'prop') s.select(null);
    }
    s.map.props.push({ type: s.propType, x: p.x, z: p.z, ...(s.propLayer !== null ? { layer: s.propLayer } : {}) });
    st.placed++;
    s.changed();
  }

  private scatter(w: Pt): void {
    const s = this.store, st = this.stroke;
    if (!st || st.kind !== 'scatter') return;
    const radius = s.brushSize * 0.9;
    for (let attempt = 0; attempt < 2; attempt++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius;
      const x = r2(w.x + Math.cos(a) * d), z = r2(w.z + Math.sin(a) * d), tx = Math.floor(x), tz = Math.floor(z);
      if (!s.inMap(tx, tz) || s.terrainAt(tx, tz) === '~') continue;
      if (s.propOnTile(tx, tz) >= 0) continue; // one prop per tile
      const prop: { type: string; x: number; z: number; s?: number; layer?: number } = { type: s.propType, x, z, ...(s.propLayer !== null ? { layer: s.propLayer } : {}) };
      const scale = r2(0.85 + Math.random() * 0.3);
      if (Math.abs(scale - 1) > 0.01) prop.s = scale;
      s.map.props.push(prop);
      st.placed++;
    }
    s.changed();
  }

  private eraseProp(w: Pt): void {
    const s = this.store, st = this.stroke;
    if (!st || st.kind !== 'erase') return;
    const i = this.hitProp(w, s.eraseOnlyType ? s.propType : undefined);
    if (i < 0) return;
    s.map.props.splice(i, 1);
    st.removed++;
    if (s.selection?.kind === 'prop') s.select(null);
    s.changed();
  }

  private drag(st: Extract<Stroke, { kind: 'drag' }>, w: Pt): void {
    const s = this.store, t = this.tile(w);
    const begin = () => { if (!st.moved) { s.checkpoint(); st.moved = true; } };
    if (st.target === 'prop') {
      const p = s.map.props[st.index];
      const snapped = this.propPos(p.type, w);
      const nx = s.snap ? snapped.x : r2(w.x + st.offset.x), nz = s.snap ? snapped.z : r2(w.z + st.offset.z);
      if (nx === p.x && nz === p.z) return;
      if (!s.inMap(Math.floor(nx), Math.floor(nz))) return;
      if (s.propOnTile(Math.floor(nx), Math.floor(nz), st.index) >= 0) return; // tile taken
      begin(); p.x = nx; p.z = nz; s.changed();
    } else if (st.target === 'light') {
      const l = s.map.lights[st.index];
      let nx: number, nz: number;
      if (l.type === 'area') {
        // Keep the area aligned to the grid while it moves.
        const ex = l.w / 2 - Math.floor(l.w / 2), ez = l.h / 2 - Math.floor(l.h / 2);
        nx = Math.round(w.x + st.offset.x - ex) + ex;
        nz = Math.round(w.z + st.offset.z - ez) + ez;
      } else { nx = t.x + 0.5; nz = t.z + 0.5; }
      if ((l.x === nx && l.z === nz) || !s.inMap(Math.floor(nx), Math.floor(nz))) return;
      if (l.type !== 'area' && s.lightOnTile(Math.floor(nx), Math.floor(nz), st.index) >= 0) return; // tile taken
      begin(); l.x = nx; l.z = nz; s.changed();
    } else if (st.target === 'building') {
      const b = s.map.buildings![st.index];
      const nx = t.x + st.offset.x, nz = t.z + st.offset.z;
      if ((b.x === nx && b.z === nz) || !s.buildingFits({ x: nx, z: nz, w: b.w, d: b.d }, st.index)) return;
      begin(); b.x = nx; b.z = nz; s.changed();
    } else if (st.target === 'event') {
      const ev = s.event(st.index)!;
      const nx = t.x + st.offset.x, nz = t.z + st.offset.z;
      if ((ev.x === nx && ev.z === nz) || !s.eventFits({ ...ev, x: nx, z: nz }, ev.id)) return;
      begin(); ev.x = nx; ev.z = nz; s.changed();
    } else {
      const sp = s.db.start;
      if (Math.floor(sp.x) === t.x && Math.floor(sp.z) === t.z) return;
      if (!s.inMap(t.x, t.z)) return;
      begin(); sp.x = t.x + 0.5; sp.z = t.z + 0.5; s.changedDb();
    }
  }

  /**
   * Snapped position for a prop under the cursor. Imported props an even number of tiles wide
   * sit on a grid line, so they cover whole tiles; everything else sits in the middle of a tile.
   */
  private propPos(type: string, w: Pt): Pt {
    if (!this.store.snap) return { x: r2(w.x), z: r2(w.z) };
    const d = propSprite(type).def;
    // A footprint covers whole tiles: the tile under the cursor is its front middle, and it stands on that tile's front edge.
    if (d?.foot) return { x: d.foot.w % 2 === 0 ? Math.round(w.x) : Math.floor(w.x) + 0.5, z: Math.floor(w.z) + 1 };
    const even = !!d?.image && Math.abs(d.w - Math.round(d.w)) < 0.01 && Math.round(d.w) % 2 === 0;
    return { x: even ? Math.round(w.x) : Math.floor(w.x) + 0.5, z: Math.floor(w.z) + 0.5 };
  }

  private resizeBuilding(st: Extract<Stroke, { kind: 'bresize' }>, w: Pt): void {
    const s = this.store, b = s.map.buildings?.[st.index];
    if (!b) return;
    const nw = Math.max(2, Math.round(w.x - b.x)), nd = Math.max(2, Math.round(w.z - b.z));
    if ((nw === b.w && nd === b.d) || !s.buildingFits({ x: b.x, z: b.z, w: nw, d: nd }, st.index)) return;
    if (!st.moved) { s.checkpoint(); st.moved = true; }
    b.w = nw; b.d = nd;
    // Keep doors on their walls.
    for (const o of b.doors ?? []) o.at = Math.min(o.at, (o.side === 'front' || o.side === 'back' ? nw : nd) - 1);
    s.changed();
  }

  private resizeArea(st: Extract<Stroke, { kind: 'resize' }>, w: Pt): void {
    const s = this.store, l = s.map.lights[st.index];
    if (!l || l.type !== 'area') return;
    const left = l.x - l.w / 2, top = l.z - l.h / 2;
    const nw = Math.max(1, Math.round(w.x - left)), nh = Math.max(1, Math.round(w.z - top));
    if (nw === l.w && nh === l.h) return;
    if (!st.moved) { s.checkpoint(); st.moved = true; }
    l.w = nw; l.h = nh; l.x = left + nw / 2; l.z = top + nh / 2;
    s.changed();
  }

  /** Topmost prop whose sprite covers the point. */
  /** The prop under a point (the front-most); `type`: only props of that kind count. */
  private hitProp(w: Pt, type?: string): number {
    const props = this.store.map.props;
    let best = -1, bestZ = -Infinity;
    const px = w.x * TS, pz = w.z * TS, sh = this.store.db.viewMode === '2d' ? 0.5 : 0;
    props.forEach((p, i) => {
      if (type && p.type !== type) return;
      const sp = propSprite(p.type), sc = p.s ?? 1, iw = sp.w * sc, ih = sp.h * sc;
      const x0 = p.x * TS - iw / 2, y0 = (p.z + sh) * TS - ih;
      if (px >= x0 && px <= x0 + iw && pz >= y0 && pz <= (p.z + sh) * TS + 2 && p.z >= bestZ) { best = i; bestZ = p.z; }
    });
    return best;
  }

  /* ------------------------------------------------------------ drawing */

  private redrawTerrain(): void {
    const s = this.store, m = s.map;
    const c = this.terrainCanvas;
    if (c.width !== m.width * TS || c.height !== m.height * TS) { c.width = m.width * TS; c.height = m.height * TS; }
    const ctx = c.getContext('2d')!;
    const at = (x: number, z: number): string => s.terrainAt(Math.max(0, Math.min(m.width - 1, x)), Math.max(0, Math.min(m.height - 1, z)));
    for (let z = 0; z < m.height; z++) for (let x = 0; x < m.width; x++) drawTile(ctx, s.terrainAt(x, z), x, z, x * TS, z * TS, at);
    // Update 153: a 3D model ground, seen from above (the tiles under it are hidden in the game).
    if (m.groundModel?.src || m.scene3d?.src) {
      const view = this.groundView(m);
      if (view) { ctx.globalAlpha = 0.92; ctx.drawImage(view, 0, 0); ctx.globalAlpha = 1; }
    }
    // The upper terrain layer (Update 147) over it.
    if (m.upper) {
      const up = (x: number, z: number): string => (s.inMap(x, z) ? s.upperAt(x, z) : s.upperAt(Math.max(0, Math.min(m.width - 1, x)), Math.max(0, Math.min(m.height - 1, z))));
      for (let z = 0; z < m.height; z++) for (let x = 0; x < m.width; x++) { const k = s.upperAt(x, z); if (k !== ' ') drawTile(ctx, k, x, z, x * TS, z * TS, up); }
    }
    this.drawHeights(ctx);
  }

  /**
   * Heights on the 2D map: higher ground lighter, lower ground darker (stronger on the Height layer),
   * a shadow along the foot of every cliff with a highlight on its top edge, and ramps / stairs.
   */
  private drawHeights(ctx: CanvasRenderingContext2D): void {
    const s = this.store, m = s.map, w = m.width, grid = s.heights();
    const strong = s.mode === 'height' ? 1 : 0.55;
    const hAt = (x: number, z: number) => (s.inMap(x, z) ? grid[z * w + x] : 0);
    for (let z = 0; z < m.height; z++)
      for (let x = 0; x < w; x++) {
        const v = grid[z * w + x];
        if (v > 0) ctx.fillStyle = `rgba(255,244,214,${Math.min(0.5, v * 0.05) * strong})`;
        else if (v < 0) ctx.fillStyle = `rgba(6,10,40,${Math.min(0.7, -v * 0.07) * strong})`;
        else continue;
        ctx.fillRect(x * TS, z * TS, TS, TS);
      }
    // Water: lighter for shallow, darker and hatched for deep.
    for (let z = 0; z < m.height; z++)
      for (let x = 0; x < w; x++) {
        const wtr = s.waterAt(x, z);
        if (!wtr) continue;
        const px = x * TS, pz = z * TS;
        // In its style's colour: lighter where shallow, darker where deep.
        const wst = waterStyle(m, wtr.style), col = wst.color || '#3f86b0';
        ctx.fillStyle = col;
        ctx.globalAlpha = wtr.kind === 'shallow' ? 0.45 : wtr.kind === 'swim' ? 0.65 : 0.85;
        ctx.fillRect(px, pz, TS, TS);
        ctx.globalAlpha = 1;
        if (wtr.kind === 'deep') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, pz, TS, TS); }
        if (wst.symbol) {
          // The style's mark (editor only), so styles of the same colour can be told apart.
          ctx.font = `bold ${Math.round(TS * 0.85)}px ui-monospace, monospace`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(wst.symbol, px + TS / 2, pz + TS / 2 + 1);
          ctx.fillStyle = 'rgba(235,248,255,0.92)'; ctx.fillText(wst.symbol, px + TS / 2, pz + TS / 2 + 1);
        } else {
          ctx.fillStyle = 'rgba(200,235,255,0.35)';
          ctx.fillRect(px + 3 + ((x + z) % 3) * 3, pz + 5 + ((x * 7 + z) % 4) * 2, 4, 1);
        }
        if (wtr.kind === 'deep') {
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px, pz + TS); ctx.lineTo(px + TS, pz); ctx.moveTo(px, pz + TS / 2); ctx.lineTo(px + TS / 2, pz); ctx.moveTo(px + TS / 2, pz + TS); ctx.lineTo(px + TS, pz + TS / 2); ctx.stroke();
        }
      }
    // Fishing spots (Water tab): a little fish in the spot's colour on each cell.
    if (s.mode === 'water') {
      const fish = s.fishing(), zones = m.fishZones ?? [];
      for (let z = 0; z < m.height; z++)
        for (let x = 0; x < w; x++) {
          const k = fish[z * w + x];
          if (k === null || k === undefined) continue;
          const px = x * TS, pz = z * TS, col = zones[k]?.color ?? '#7fd0ff';
          ctx.save();
          ctx.globalAlpha = k === s.fishZone && s.waterMode === 'fish' ? 0.95 : 0.6;
          ctx.strokeStyle = col; ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, pz + 1.5, TS - 3, TS - 3);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.ellipse(px + TS * 0.55, pz + TS * 0.72, TS * 0.18, TS * 0.1, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.moveTo(px + TS * 0.38, pz + TS * 0.72); ctx.lineTo(px + TS * 0.26, pz + TS * 0.62); ctx.lineTo(px + TS * 0.26, pz + TS * 0.82); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
    }
    // Cliff edges between neighbours of different heights.
    for (let z = 0; z < m.height; z++)
      for (let x = 0; x < w; x++) {
        const v = hAt(x, z);
        for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
          const nx = x + dx, nz = z + dz;
          if (!s.inMap(nx, nz)) continue;
          const d = v - hAt(nx, nz);
          if (d <= 0) continue;
          // This cell is higher: light top edge on its side, shadow on the lower neighbour's side.
          const thick = Math.min(5, 1 + d);
          const ex = dx > 0 ? (x + 1) * TS : dx < 0 ? x * TS : x * TS;
          const ez = dz > 0 ? (z + 1) * TS : dz < 0 ? z * TS : z * TS;
          ctx.fillStyle = `rgba(255,250,230,${0.55 * strong})`;
          if (dx) ctx.fillRect(dx > 0 ? ex - 1 : ex, ez, 1, TS); else ctx.fillRect(ex, dz > 0 ? ez - 1 : ez, TS, 1);
          ctx.fillStyle = `rgba(0,0,0,${0.5 * strong + 0.1})`;
          if (dx) ctx.fillRect(dx > 0 ? ex : ex - thick, ez, thick, TS); else ctx.fillRect(ex, dz > 0 ? ez : ez - thick, TS, thick);
        }
      }
    // Ramps and stairs.
    for (const r of m.ramps ?? []) {
      if (!s.inMap(r.x, r.z)) continue;
      const corner = r.style === 'corner', raised = corner ? s.rampCorners(r) : null;
      const dir = corner ? null : s.rampDir(r), px = r.x * TS, pz = r.z * TS;
      ctx.save();
      if (raised) {
        // A corner slope: light toward its raised corners, a dot on each.
        const pts: [number, number][] = [[px, pz], [px + TS, pz], [px + TS, pz + TS], [px, pz + TS]];
        const up = pts.filter((_, k) => raised[k]);
        const cx = up.reduce((a, p) => a + p[0], 0) / up.length, cz = up.reduce((a, p) => a + p[1], 0) / up.length;
        const g = ctx.createRadialGradient(cx, cz, 1, cx, cz, TS * 1.2);
        g.addColorStop(0, 'rgba(255,250,230,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = g; ctx.fillRect(px, pz, TS, TS);
        ctx.fillStyle = '#ffd36b';
        for (const [qx, qz] of up) { ctx.beginPath(); ctx.arc(qx + (qx > px ? -3.5 : 3.5), qz + (qz > pz ? -3.5 : 3.5), 2.4, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        continue;
      }
      if (!dir) {
        // No higher neighbour to rise to: show it as a problem.
        ctx.strokeStyle = '#ff5a5a'; ctx.lineWidth = 1.5;
        ctx.strokeRect(px + 1.5, pz + 1.5, TS - 3, TS - 3);
        ctx.beginPath(); ctx.moveTo(px + 4, pz + 4); ctx.lineTo(px + TS - 4, pz + TS - 4); ctx.moveTo(px + TS - 4, pz + 4); ctx.lineTo(px + 4, pz + TS - 4); ctx.stroke();
        ctx.restore();
        continue;
      }
      // Rotate so "up" points the way the ramp rises.
      ctx.translate(px + TS / 2, pz + TS / 2);
      ctx.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir]);
      if (r.style === 'stairs') {
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = `rgba(${40 + i * 40},${36 + i * 38},${30 + i * 34},0.55)`;
          ctx.fillRect(-TS / 2, TS / 2 - (i + 1) * (TS / 4), TS, TS / 4);
        }
      } else {
        const g = ctx.createLinearGradient(0, TS / 2, 0, -TS / 2);
        g.addColorStop(0, 'rgba(0,0,0,0.35)');
        g.addColorStop(1, 'rgba(255,250,230,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(-TS / 2, -TS / 2, TS, TS);
      }
      ctx.fillStyle = '#ffd36b';
      ctx.beginPath(); ctx.moveTo(0, -5.5); ctx.lineTo(4, -1); ctx.lineTo(1.3, -1); ctx.lineTo(1.3, 5); ctx.lineTo(-1.3, 5); ctx.lineTo(-1.3, -1); ctx.lineTo(-4, -1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  private draw(): void {
    const s = this.store;
    if (!this.needsDraw || !s.map) return;
    this.needsDraw = false;
    if (this.needsTerrain) { this.redrawTerrain(); this.needsTerrain = false; }
    const ctx = this.ctx, m = s.map, k = this.dpr * this.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0d15';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(k, 0, 0, k, this.dpr * this.ox, this.dpr * this.oy);
    ctx.imageSmoothingEnabled = false;

    // Map
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(4, 6, m.width * TS, m.height * TS);
    ctx.drawImage(this.terrainCanvas, 0, 0);

    // Grid
    if (s.showGrid) {
      ctx.lineWidth = 1 / this.zoom;
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      for (let x = 1; x < m.width; x++) { ctx.moveTo(x * TS, 0); ctx.lineTo(x * TS, m.height * TS); }
      for (let z = 1; z < m.height; z++) { ctx.moveTo(0, z * TS); ctx.lineTo(m.width * TS, z * TS); }
      ctx.stroke();
    }

    const fade = (mode: string) => (s.mode === mode ? 1 : s.mode === 'terrain' ? 0.35 : 0.6);

    // Light shapes under everything else: areas (always faintly), reach of point and spot lights (Lights layer).
    this.drawLightShapes(ctx);

    // Everything that stands on the map, drawn back to front.
    type Item = { z: number; draw: () => void };
    const items: Item[] = [];
    (m.buildings ?? []).forEach((b) => items.push({ z: b.z + b.d - 0.5, draw: () => drawBuildingTop(ctx, b, s.mode === 'buildings' ? 1 : s.mode === 'terrain' || s.mode === 'height' ? 0.55 : 0.85) }));
    const underRoof = (p: { x: number; z: number }) => (m.buildings ?? []).some((b) => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d);
    m.props.forEach((p) => {
      // Props inside a building are hidden in the game; here they only show on the Props layer.
      if (underRoof(p) && s.mode !== 'props') return;
      const sp = propSprite(p.type), sc = p.s ?? 1, onWall = !!s.catalog.get(p.type)?.wall;
      // Wall props stand at the back edge of their tile, against the wall.
      const bz = onWall ? Math.floor(p.z) + 0.02 : p.z;
      items.push({ z: bz, draw: () => this.drawStanding(sp.img, p.x, bz, sp.w * sc, sp.h * sc, fade('props'), onWall ? null : p.y) });
    });
    for (const ev of m.events) {
      if (!s.inMap(ev.x, ev.z)) continue;
      const page = ev.pages[0];
      const ew = eventW(ev), eh = eventH(ev);
      items.push({ z: ev.z + eh - 0.05, draw: () => {
        const a = fade('events');
        ctx.globalAlpha = a * (s.mode === 'events' ? 1 : 0.7);
        // Enemies are outlined red; other events amber.
        const hostile = !!page?.enemy;
        ctx.fillStyle = hostile ? 'rgba(255,90,74,0.16)' : 'rgba(255,176,74,0.16)';
        ctx.fillRect(ev.x * TS + 1, ev.z * TS + 1, ew * TS - 2, eh * TS - 2);
        ctx.strokeStyle = hostile ? '#ff5a4a' : '#ffb04a';
        ctx.lineWidth = Math.max(1, 1.5 / this.zoom);
        ctx.strokeRect(ev.x * TS + 1, ev.z * TS + 1, ew * TS - 2, eh * TS - 2);
        // A transfer gets an arrow, so doorways stand out.
        if (ev.pages.some((pg) => pg.commands.some((c) => c.cmd === 'transfer'))) {
          ctx.fillStyle = '#ffb04a';
          const cx = (ev.x + ew / 2) * TS, cz = (ev.z + eh / 2) * TS;
          ctx.beginPath(); ctx.moveTo(cx - 4, cz - 3); ctx.lineTo(cx + 1, cz - 3); ctx.lineTo(cx + 1, cz - 6); ctx.lineTo(cx + 6, cz); ctx.lineTo(cx + 1, cz + 6); ctx.lineTo(cx + 1, cz + 3); ctx.lineTo(cx - 4, cz + 3); ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = a;
        let img: HTMLCanvasElement | null = null;
        const foe = page?.enemy ? s.db.enemies?.find((d) => d.id === page.enemy) : undefined;
        if (page?.enemy) { img = enemyImage(s.db, foe?.look ?? {}); if (img && foe?.tint) img = tintCanvas(img, foe.tint); }
        else if (page?.character && s.db.characters[page.character]) img = characterImage(page.character, s.db.characters[page.character], page.dir ?? 'down');
        let iw = 0, ih = 0;
        if (img) { iw = img.width; ih = img.height; }
        else if (page?.sprite) { const sp = propSprite(page.sprite); img = sp.img; iw = sp.w; ih = sp.h; }
        const onWall = page && (page.wall ?? (page.sprite ? !!s.catalog.get(page.sprite)?.wall : false));
        if (img) this.drawStanding(img, ev.x + ew / 2, onWall ? ev.z + eh - 1 : ev.z + eh - 2 / TS, iw, ih, ctx.globalAlpha, onWall ? null : undefined);
      } });
    }
    if (s.startHere) {
      const sp = s.db.start, hero = s.db.characters[s.db.player];
      if (hero) {
        const img = characterImage(s.db.player, hero, sp.dir ?? 'down');
        items.push({ z: sp.z, draw: () => this.drawStanding(img, sp.x, sp.z + 5 / TS, img.width, img.height, fade('events'), undefined) });
      }
    }
    items.sort((a, b) => a.z - b.z).forEach((it) => it.draw());
    ctx.globalAlpha = 1;
    this.drawPassage(ctx);
    this.drawZones(ctx);
    this.drawMarkers(ctx);
    this.drawLightIcons(ctx);

    this.drawOverlays(ctx);
    this.drawLabels();
    this.onView(this.zoomPercent);
  }

  private drawOverlays(ctx: CanvasRenderingContext2D): void {
    const s = this.store, sel = s.selection, lw = 2 / this.zoom;
    const tileRect = (x: number, z: number, w = 1, hgt = 1, color = '#ffffff', dash = false) => {
      ctx.lineWidth = lw;
      ctx.strokeStyle = color;
      ctx.setLineDash(dash ? [4 / this.zoom, 3 / this.zoom] : []);
      ctx.strokeRect(x * TS, z * TS, w * TS, hgt * TS);
      ctx.setLineDash([]);
    };

    // Selection
    if (sel?.kind === 'prop' && s.map.props[sel.index]) {
      const p = s.map.props[sel.index], sp = propSprite(p.type), sc = p.s ?? 1;
      ctx.lineWidth = lw; ctx.strokeStyle = '#7fd3ff'; ctx.setLineDash([4 / this.zoom, 3 / this.zoom]);
      ctx.strokeRect(p.x * TS - (sp.w * sc) / 2, (p.z + (this.store.db.viewMode === '2d' ? 0.5 : 0)) * TS - sp.h * sc, sp.w * sc, sp.h * sc);
      ctx.setLineDash([]);
      ctx.fillStyle = '#7fd3ff';
      ctx.fillRect(p.x * TS - 1.5, p.z * TS - 1.5, 3, 3);
    } else if (sel?.kind === 'light' && s.map.lights[sel.index]) {
      const l = s.map.lights[sel.index];
      ctx.lineWidth = lw; ctx.strokeStyle = '#7fd3ff';
      if (l.type === 'area') {
        this.areaPath(ctx, l.x, l.z, l.w, l.h, l.shape === 'ellipse');
        ctx.stroke();
        // Resize handle
        const hx = (l.x + l.w / 2) * TS, hz = (l.z + l.h / 2) * TS, r = 4 / this.zoom;
        ctx.fillStyle = '#7fd3ff';
        ctx.fillRect(hx - r, hz - r, r * 2, r * 2);
      } else {
        ctx.beginPath(); ctx.arc(l.x * TS, l.z * TS, 7, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (sel?.kind === 'building' && s.map.buildings?.[sel.index]) {
      const b = s.map.buildings[sel.index];
      tileRect(b.x, b.z, b.w, b.d, '#7fd3ff');
      // Where each door's Transfer event goes.
      for (const o of b.doors ?? []) { const [dx, dz] = doorstep(b, o); if (s.inMap(dx, dz)) tileRect(dx, dz, 1, 1, '#ffb04a', true); }
      const r = 4 / this.zoom;
      ctx.fillStyle = '#7fd3ff';
      ctx.fillRect((b.x + b.w) * TS - r, (b.z + b.d) * TS - r, r * 2, r * 2);
    } else if (sel?.kind === 'event') {
      const ev = s.event(sel.id); if (ev && s.inMap(ev.x, ev.z)) tileRect(ev.x, ev.z, eventW(ev), eventH(ev), '#7fd3ff');
    } else if (sel?.kind === 'start') {
      tileRect(Math.floor(s.db.start.x), Math.floor(s.db.start.z), 1, 1, '#7fd3ff');
    } else if (sel?.kind === 'ramp') {
      tileRect(sel.x, sel.z, 1, 1, '#7fd3ff');
    } else if (sel?.kind === 'tile') {
      ctx.fillStyle = 'rgba(127,211,255,0.12)';
      ctx.fillRect(sel.x * TS, sel.z * TS, (sel.w ?? 1) * TS, (sel.h ?? 1) * TS);
      tileRect(sel.x, sel.z, sel.w ?? 1, sel.h ?? 1, '#7fd3ff', true);
    }

    // Tool preview under the cursor
    const st = this.stroke;
    if (st?.kind === 'area') {
      const x0 = Math.min(st.from.x, st.to.x), z0 = Math.min(st.from.z, st.to.z);
      const w = Math.abs(st.to.x - st.from.x) + 1, hh = Math.abs(st.to.z - st.from.z) + 1;
      const v = s.lightPreset.area.values as { color: string; shape: string };
      ctx.globalAlpha = 0.3; ctx.fillStyle = v.color;
      this.areaPath(ctx, x0 + w / 2, z0 + hh / 2, w, hh, v.shape === 'ellipse'); ctx.fill();
      ctx.globalAlpha = 1; ctx.lineWidth = lw; ctx.strokeStyle = '#ffffff'; ctx.stroke();
      return;
    }
    if (st?.kind === 'build') {
      const x0 = Math.min(st.from.x, st.to.x), z0 = Math.min(st.from.z, st.to.z);
      const bw = Math.abs(st.to.x - st.from.x) + 1, bd = Math.abs(st.to.z - st.from.z) + 1;
      const single = bw === 1 && bd === 1;
      const b = single ? presetBuilding(s.buildingPreset, x0, z0) : presetBuilding(s.buildingPreset, x0, z0, Math.max(2, bw), Math.max(2, bd));
      drawBuildingTop(ctx, b, 0.6);
      tileRect(b.x, b.z, b.w, b.d, s.buildingFits(b) ? '#ffffff' : '#ff6b6b', true);
      return;
    }
    if (st?.kind === 'select-area') {
      const x0 = Math.min(st.from.x, st.to.x), z0 = Math.min(st.from.z, st.to.z);
      const w = Math.abs(st.to.x - st.from.x) + 1, hh = Math.abs(st.to.z - st.from.z) + 1;
      ctx.fillStyle = 'rgba(127,211,255,0.18)';
      ctx.fillRect(x0 * TS, z0 * TS, w * TS, hh * TS);
      tileRect(x0, z0, w, hh, '#7fd3ff', true);
      return;
    }
    if (st?.kind === 'rect') {
      const x0 = Math.min(st.from.x, st.to.x), z0 = Math.min(st.from.z, st.to.z);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x0 * TS, z0 * TS, (Math.abs(st.to.x - st.from.x) + 1) * TS, (Math.abs(st.to.z - st.from.z) + 1) * TS);
      tileRect(x0, z0, Math.abs(st.to.x - st.from.x) + 1, Math.abs(st.to.z - st.from.z) + 1);
      return;
    }
    const h = this.hover;
    if (!h || this.pan || this.pinch) return;
    const t = this.tile(h);
    if (s.mode === 'terrain') {
      const n = s.terrainTool === 'pencil' ? s.brushSize : 1, o = Math.floor((n - 1) / 2);
      tileRect(t.x - o, t.z - o, n, n);
    } else if (s.mode === 'passage') {
      const n = s.brushSize, o = Math.floor((n - 1) / 2);
      tileRect(t.x - o, t.z - o, n, n, s.passageFlag === '.' ? '#ff9a9a' : '#ffffff');
    } else if (s.mode === 'zones' && s.isBattleMap()) {
      tileRect(t.x, t.z, 1, 1, s.markerTool === 'erase' ? '#ff9a9a' : s.markerTool === 'party' ? MARKER_COLORS.party : MARKER_COLORS.enemy);
    } else if (s.mode === 'zones') {
      const n = s.brushSize, o = Math.floor((n - 1) / 2);
      tileRect(t.x - o, t.z - o, n, n, s.zoneLetter === '.' ? '#ff9a9a' : zoneColor(s.zoneLetter));
    } else if (s.mode === 'water') {
      const n = s.waterMode === 'fill' || s.waterMode === 'style' ? 1 : s.brushSize, o = Math.floor((n - 1) / 2);
      tileRect(t.x - o, t.z - o, n, n, s.waterMode === 'remove' || (s.waterMode === 'fish' && s.fishErase) ? '#ff9a9a' : s.waterMode === 'fish' ? (s.map.fishZones?.[s.fishZone]?.color ?? '#7fd0ff') : '#9fdcff');
    } else if (s.mode === 'height') {
      const n = s.heightTool === 'ramp' || s.heightTool === 'fill' || (s.heightTool === 'water' && s.waterMode === 'fill') ? 1 : s.brushSize, o = Math.floor((n - 1) / 2);
      tileRect(t.x - o, t.z - o, n, n, s.heightTool === 'lower' ? '#9db8ff' : s.heightTool === 'raise' ? '#ffe3a8' : '#ffffff');
    } else if (s.mode === 'props') {
      if (s.propTool === 'place' && !st) {
        const sp = propSprite(s.propType), pos = this.propPos(s.propType, h);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(sp.img, pos.x * TS - sp.w / 2, (pos.z + (s.db.viewMode === '2d' ? 0.5 : 0)) * TS - sp.h, sp.w, sp.h);
        ctx.globalAlpha = 1;
        this.drawBlocked(ctx, s.propType, pos.x, pos.z, 1);
      } else if (s.propTool === 'scatter') {
        ctx.lineWidth = lw; ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(h.x * TS, h.z * TS, s.brushSize * 0.9 * TS, 0, Math.PI * 2); ctx.stroke();
      } else if (s.propTool === 'erase' || s.propTool === 'select') {
        const i = this.hitProp(h);
        if (i >= 0) {
          const p = s.map.props[i], sp = propSprite(p.type), sc = p.s ?? 1;
          ctx.lineWidth = lw; ctx.strokeStyle = s.propTool === 'erase' ? '#ff6b6b' : 'rgba(255,255,255,0.7)';
          ctx.strokeRect(p.x * TS - (sp.w * sc) / 2, (p.z + (this.store.db.viewMode === '2d' ? 0.5 : 0)) * TS - sp.h * sc, sp.w * sc, sp.h * sc);
        }
      }
    } else if (s.mode === 'buildings') {
      const i = s.buildingAt(t.x, t.z);
      if (i >= 0) { const b = s.map.buildings![i]; tileRect(b.x, b.z, b.w, b.d, 'rgba(255,255,255,0.7)'); }
      else if (s.buildingTool === 'draw' && s.inMap(t.x, t.z)) {
        const v = presetById(s.buildingPreset).values;
        tileRect(t.x, t.z, v.w, v.d, 'rgba(255,255,255,0.5)', true);
      }
    } else if (s.mode === 'lights') {
      if (s.lightTool === 'place' && s.inMap(t.x, t.z)) tileRect(t.x, t.z, 1, 1, 'rgba(255,255,255,0.8)');
      else {
        const i = s.lightAt(h.x, h.z);
        if (i >= 0) {
          const l = s.map.lights[i];
          ctx.lineWidth = lw; ctx.strokeStyle = s.lightTool === 'erase' ? '#ff6b6b' : 'rgba(255,255,255,0.7)';
          if (l.type === 'area') { this.areaPath(ctx, l.x, l.z, l.w, l.h, l.shape === 'ellipse'); ctx.stroke(); }
          else { ctx.beginPath(); ctx.arc(l.x * TS, l.z * TS, 7, 0, Math.PI * 2); ctx.stroke(); }
        }
      }
    } else if (s.inMap(t.x, t.z)) {
      tileRect(t.x, t.z, 1, 1, 'rgba(255,255,255,0.8)');
    }
  }

  /** Outline path of an area light (centre and size in tiles). */
  private areaPath(ctx: CanvasRenderingContext2D, x: number, z: number, w: number, h: number, ellipse: boolean): void {
    ctx.beginPath();
    if (ellipse) ctx.ellipse(x * TS, z * TS, (w / 2) * TS, (h / 2) * TS, 0, 0, Math.PI * 2);
    else ctx.rect((x - w / 2) * TS, (z - h / 2) * TS, w * TS, h * TS);
  }

  /** Tiles a prop would block, shaded red (shown while placing). */
  private drawBlocked(ctx: CanvasRenderingContext2D, type: string, x: number, z: number, scale: number): void {
    const def = propSprite(type).def;
    if (!def) return;
    ctx.fillStyle = 'rgba(255,90,90,0.28)';
    for (const [bx, bz] of blockedTiles(def, x, z, scale, this.store.propStep)) ctx.fillRect(bx * TS, bz * TS, TS, TS);
    // Flat collision: the thin strip along the picture.
    ctx.fillStyle = 'rgba(255,90,90,0.55)';
    for (const b of propBoxes(def, x, z, scale, this.store.propStep)) ctx.fillRect(b.x0 * TS, b.z0 * TS, (b.x1 - b.x0) * TS, (b.z1 - b.z0) * TS);
    // A footprint's walkable tiles: outlined.
    if (def.foot) {
      ctx.strokeStyle = 'rgba(255,176,74,0.7)'; ctx.lineWidth = Math.max(1, 1 / this.zoom);
      for (const [fx, fz] of footTiles(def, x, z, scale, false, this.store.propStep)) ctx.strokeRect(fx * TS + 0.5, fz * TS + 0.5, TS - 1, TS - 1);
    }
  }

  /**
   * The passage layer: what already blocks each cell (tiles, props, deep water) as a faint red cross,
   * and the painted flags as icons. Elsewhere, flags show faintly so they aren't forgotten.
   */
  private drawPassage(ctx: CanvasRenderingContext2D): void {
    const s = this.store, m = s.map, grid = s.passage(), on = s.mode === 'passage';
    if (!on && grid.every((f) => f === '.')) return;
    if (on) {
      // Dim the map a little so the icons stand out.
      ctx.fillStyle = 'rgba(8,10,18,0.25)';
      ctx.fillRect(0, 0, m.width * TS, m.height * TS);
      const auto = s.autoBlocking();
      ctx.strokeStyle = 'rgba(255,90,90,0.75)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let z = 0; z < m.height; z++)
        for (let x = 0; x < m.width; x++) {
          if (!auto[z * m.width + x] || grid[z * m.width + x] !== '.') continue;
          const px = x * TS, pz = z * TS;
          ctx.moveTo(px + 4, pz + 4); ctx.lineTo(px + TS - 4, pz + TS - 4);
          ctx.moveTo(px + TS - 4, pz + 4); ctx.lineTo(px + 4, pz + TS - 4);
        }
      ctx.stroke();
    }
    ctx.globalAlpha = on ? 1 : 0.4;
    for (let z = 0; z < m.height; z++)
      for (let x = 0; x < m.width; x++) {
        const f = grid[z * m.width + x];
        if (f !== '.') drawPassageIcon(ctx, f, x * TS, z * TS, TS);
      }
    ctx.globalAlpha = 1;
  }

  /** Battle maps: party markers (P1, P2…) and enemy markers (E1, E2…), numbered in the order they're used. */
  private drawMarkers(ctx: CanvasRenderingContext2D): void {
    const s = this.store, list = s.map.markers ?? [];
    if (!list.length || !s.isBattleMap()) return;
    const on = s.mode === 'zones', count = { party: 0, enemy: 0 };
    ctx.save();
    ctx.globalAlpha = on ? 1 : 0.6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(TS * 0.34)}px ui-monospace, monospace`;
    for (const mk of list) {
      const n = ++count[mk.side], cx = mk.x * TS + TS / 2, cz = mk.z * TS + TS / 2;
      ctx.beginPath();
      ctx.arc(cx, cz, TS * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_COLORS[mk.side];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#10131c';
      ctx.stroke();
      // Which way they face: party up the map (towards the enemies), enemies down.
      ctx.beginPath();
      const dy = mk.side === 'party' ? -1 : 1;
      ctx.moveTo(cx - TS * 0.14, cz + dy * TS * 0.38);
      ctx.lineTo(cx + TS * 0.14, cz + dy * TS * 0.38);
      ctx.lineTo(cx, cz + dy * TS * 0.56);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#10131c';
      ctx.fillText(`${mk.side === 'party' ? 'P' : 'E'}${n}`, cx, cz + 1);
    }
    ctx.restore();
  }

  /** Safe zones: soft green cells, their rest spots marked (faint on other layers). */
  private drawSafe(ctx: CanvasRenderingContext2D): void {
    const s = this.store, m = s.map, grid = s.safeGrid(), on = s.mode === 'zones';
    if (grid.every((c) => c === '.')) return;
    const ICON: Record<string, string> = { S: '🪑', L: '☾', M: '✦', T: '⚔' };
    ctx.save();
    for (let z = 0; z < m.height; z++)
      for (let x = 0; x < m.width; x++) {
        const c = grid[z * m.width + x];
        if (c === '.') continue;
        ctx.globalAlpha = on ? 0.32 : 0.1;
        ctx.fillStyle = '#5ad08a';
        ctx.fillRect(x * TS, z * TS, TS, TS);
        if (on && c !== 's') {
          ctx.globalAlpha = 0.95;
          ctx.font = `${Math.round(TS * 0.55)}px system-ui, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#0d2a18';
          ctx.fillText(ICON[c] ?? c, x * TS + TS / 2, z * TS + TS / 2 + 1);
        }
      }
    ctx.restore();
  }

  /** Encounter zones: each letter's cells tinted in its colour with the letter on them (faint on other layers). */
  private drawZones(ctx: CanvasRenderingContext2D): void {
    this.drawSafe(ctx);
    const s = this.store, m = s.map, grid = s.zoneGrid(), on = s.mode === 'zones';
    if (grid.every((c) => c === '.')) return;
    ctx.save();
    ctx.globalAlpha = on ? 0.38 : 0.12;
    for (let z = 0; z < m.height; z++)
      for (let x = 0; x < m.width; x++) {
        const c = grid[z * m.width + x];
        if (c === '.') continue;
        ctx.fillStyle = zoneColor(c);
        ctx.fillRect(x * TS, z * TS, TS, TS);
      }
    if (on) {
      ctx.globalAlpha = 0.95;
      ctx.font = `bold ${Math.round(TS * 0.5)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#10131c';
      for (let z = 0; z < m.height; z++)
        for (let x = 0; x < m.width; x++) {
          const c = grid[z * m.width + x];
          if (c !== '.') ctx.fillText(c, x * TS + TS / 2, z * TS + TS / 2 + 1);
        }
    }
    ctx.restore();
  }

  /** Area tints, plus the reach of point and spot lights (and lights carried by props) on the Lights layer. */
  private drawLightShapes(ctx: CanvasRenderingContext2D): void {
    const s = this.store, lightsMode = s.mode === 'lights';
    for (const l of s.map.lights) {
      if (l.type === 'area') {
        const rx = (l.w / 2) * TS, rz = (l.h / 2) * TS;
        const f = Math.min(l.feather * TS, Math.min(rx, rz));
        ctx.save();
        ctx.globalAlpha = lightsMode ? 0.42 : 0.18;
        // Darker tints are drawn as shade, brighter ones as glow.
        ctx.fillStyle = l.intensity < 1 ? shadeColor(l.color, l.intensity) : l.color;
        ctx.filter = f > 0 ? `blur(${Math.max(0.5, (f / 2) * this.zoom * this.dpr)}px)` : 'none';
        // Inset by half the feather, so the blur reaches the shape's edge.
        this.areaPath(ctx, l.x, l.z, Math.max(0.1, l.w - f / TS), Math.max(0.1, l.h - f / TS), l.shape === 'ellipse');
        ctx.fill();
        ctx.restore();
        if (lightsMode) {
          ctx.lineWidth = 1.5 / this.zoom;
          ctx.strokeStyle = withAlpha(l.color, 0.85);
          ctx.setLineDash([5 / this.zoom, 4 / this.zoom]);
          this.areaPath(ctx, l.x, l.z, l.w, l.h, l.shape === 'ellipse');
          ctx.stroke();
          ctx.setLineDash([]);
        }
        continue;
      }
      if (!lightsMode) continue;
      const cx = l.x * TS, cz = l.z * TS, r = l.radius * TS * 0.75;
      const g = ctx.createRadialGradient(cx, cz, 0, cx, cz, r);
      g.addColorStop(0, withAlpha(l.color, 0.4));
      g.addColorStop(1, withAlpha(l.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      if (l.type === 'spot') {
        const ang = { down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 }[l.dir];
        const half = ((Math.min(170, l.angle) / 2) * Math.PI) / 180;
        // Seen from above, a tilted beam lands a little ahead of the light.
        ctx.moveTo(cx, cz);
        ctx.arc(cx, cz, r, ang - half, ang + half);
        ctx.closePath();
      } else ctx.arc(cx, cz, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!lightsMode) return;
    for (const p of s.map.props) {
      const d = propSprite(p.type).def;
      if (!d?.light) continue;
      const sc = p.s ?? 1, cx = (p.x + d.light.x * sc) * TS, cz = (p.z + 0.3) * TS, r = d.light.radius * TS * 0.75;
      const g = ctx.createRadialGradient(cx, cz, 0, cx, cz, r);
      g.addColorStop(0, withAlpha(d.light.color, 0.28));
      g.addColorStop(1, withAlpha(d.light.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, cz - r, r * 2, r * 2);
    }
  }

  /** Small icons for point and spot lights, drawn above the props so they can always be clicked. */
  /**
   * Draw something standing on the map (a prop, an event's picture, the hero) with its feet at (x, z), as the game
   * shows it: a raised wall or cliff in front of it (to the south) hides its lower part from the game's camera, so the
   * part that shows sits on the wall's edge. Hidden completely: a faint ghost, so it can still be found.
   * `y`: its own base height (undefined: the ground's; null: on a wall face, never hidden).
   */
  private drawStanding(img: CanvasImageSource, x: number, z: number, w: number, h: number, alpha: number, y: number | null | undefined): void {
    const s = this.store;
    // 2D mode (Update 151): feet on the bottom edge of the cell, as the game draws it.
    if (s.db.viewMode === '2d') z += 0.5;
    const ctx = this.ctx, left = x * TS - w / 2;
    const cut = y === null ? null : frontWall(s, x, z, y, h / TS);
    if (!cut) { ctx.globalAlpha = alpha; ctx.drawImage(img, left, z * TS - h, w, h); return; }
    const iw = (img as HTMLCanvasElement).width, ih = (img as HTMLCanvasElement).height;
    if (cut.hidden >= 0.97) {
      ctx.globalAlpha = alpha * 0.22;
      ctx.drawImage(img, left, z * TS - h, w, h);
      return;
    }
    const keep = 1 - cut.hidden;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, 0, 0, iw, ih * keep, left, cut.edge * TS - h * keep, w, h * keep);
  }

  private drawLightIcons(ctx: CanvasRenderingContext2D): void {
    const s = this.store, lightsMode = s.mode === 'lights';
    ctx.globalAlpha = lightsMode ? 1 : 0.55;
    for (const l of s.map.lights) {
      if (l.type === 'area') continue;
      const cx = l.x * TS, cz = l.z * TS;
      ctx.fillStyle = 'rgba(10,13,21,0.75)';
      ctx.beginPath(); ctx.arc(cx, cz, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = l.color;
      ctx.beginPath(); ctx.arc(cx, cz, 3.2, 0, Math.PI * 2); ctx.fill();
      if (l.type === 'spot') {
        const [dx, dz] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[l.dir];
        ctx.strokeStyle = l.color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx + dx * 5, cz + dz * 5); ctx.lineTo(cx + dx * 9, cz + dz * 9); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Height of every raised or lowered cell, at screen resolution. */
  private drawHeightNumbers(): void {
    const s = this.store, ctx = this.ctx, m = s.map, grid = s.heights(), cell = TS * this.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = `700 ${Math.round(Math.min(13, cell * 0.42))}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const r = this.canvas.getBoundingClientRect();
    const x0 = Math.max(0, Math.floor(-this.ox / cell)), x1 = Math.min(m.width, Math.ceil((r.width - this.ox) / cell));
    const z0 = Math.max(0, Math.floor(-this.oy / cell)), z1 = Math.min(m.height, Math.ceil((r.height - this.oy) / cell));
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++) {
        const v = grid[z * m.width + x];
        if (!v) continue;
        const sx = this.ox + (x + 0.5) * cell, sy = this.oy + (z + 0.5) * cell;
        ctx.fillStyle = 'rgba(8,10,18,0.7)';
        ctx.fillText(String(v), sx + 1, sy + 1);
        ctx.fillStyle = v > 0 ? '#ffe7b0' : '#b6c8ff';
        ctx.fillText(String(v), sx, sy);
      }
  }

  /** Each cell's height style (soft blocky, hills, cliffs) as a small symbol in its corner. */
  private drawHeightStyles(): void {
    const s = this.store, ctx = this.ctx, m = s.map, cell = TS * this.zoom;
    if (!m.heightStyles) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = `800 ${Math.round(Math.max(9, Math.min(16, cell * 0.45)))}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const r = this.canvas.getBoundingClientRect();
    const x0 = Math.max(0, Math.floor(-this.ox / cell)), x1 = Math.min(m.width, Math.ceil((r.width - this.ox) / cell));
    const z0 = Math.max(0, Math.floor(-this.oy / cell)), z1 = Math.min(m.height, Math.ceil((r.height - this.oy) / cell));
    const col: Record<string, string> = { b: '#5cffc0', h: '#d4ff4a', c: '#ffa860' };
    const tint: Record<string, string> = { b: 'rgba(92,255,192,0.22)', h: 'rgba(212,255,74,0.2)', c: 'rgba(255,168,96,0.24)' };
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const k = s.heightStyleAt(x, z);
      if (k === '.') continue;
      const sym = HEIGHT_STYLES.find(([c]) => c === k)![2];
      const px = this.ox + x * cell, pz = this.oy + z * cell;
      // A tinted square (easier to see what's painted), then a bright symbol with a dark outline.
      ctx.fillStyle = tint[k]; ctx.fillRect(px, pz, cell, cell);
      const sx = px + 2, sy = pz + 1;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(sym, sx, sy);
      ctx.fillStyle = col[k]; ctx.fillText(sym, sx, sy);
    }
  }

  /** Event names and the start flag, drawn at screen resolution so they stay readable. */
  private drawLabels(): void {
    const s = this.store, ctx = this.ctx;
    if (s.mode === 'height') { if (this.zoom >= 0.7) this.drawHeightStyles(); if (this.zoom >= 1.4) this.drawHeightNumbers(); return; }
    if (s.mode !== 'events' || this.zoom < 1.5) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = '600 11px "Atkinson Hyperlegible", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const label = (text: string, x: number, z: number, bg: string, fg: string) => {
      const sx = this.ox + x * TS * this.zoom, sy = this.oy + z * TS * this.zoom - 2;
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = bg;
      ctx.fillRect(sx - w / 2, sy - 15, w, 15);
      ctx.fillStyle = fg;
      ctx.fillText(text, sx, sy - 2);
    };
    for (const ev of s.map.events) if (s.inMap(ev.x, ev.z)) label(ev.name, ev.x + eventW(ev) / 2, ev.z - (ev.pages[0]?.character ? 0.6 : 0), 'rgba(12,15,24,0.85)', '#ffd9a0');
    if (s.startHere) label('Player start', s.db.start.x, s.db.start.z - 1.2, '#7fd3ff', '#08202c');
  }
}

/** Tiles on the line between two tiles (Bresenham), so fast strokes leave no gaps. */
function line(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let x = a.x, z = a.z;
  const dx = Math.abs(b.x - a.x), dz = -Math.abs(b.z - a.z), sx = a.x < b.x ? 1 : -1, sz = a.z < b.z ? 1 : -1;
  let err = dx + dz;
  for (;;) {
    out.push({ x, z });
    if (x === b.x && z === b.z) break;
    const e2 = 2 * err;
    if (e2 >= dz) { err += dz; x += sx; }
    if (e2 <= dx) { err += dx; z += sz; }
  }
  return out;
}

export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Shade colour for a darkening area: the tint multiplied down by its strength. */
function shadeColor(hex: string, intensity: number): string {
  const n = parseInt(hex.slice(1), 16), k = Math.max(0, Math.min(1, intensity)) * 0.6;
  return `rgb(${Math.round(((n >> 16) & 255) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round((n & 255) * k)})`;
}

/** The game camera's tilt (from its offset: 10.5 up, 11.5 back). */
const CAM_SIN = Math.sin(Math.atan2(10.5, 11.5)), CAM_COS = Math.cos(Math.atan2(10.5, 11.5));

/**
 * How much of something standing at (x, z) a higher tile in front of it (south) hides from the game's camera, as a
 * share of its height (0 … 1), and the edge of that tile (where what shows appears to sit). Null when nothing hides it.
 */
export function frontWall(s: { heightAt(x: number, z: number): number; inMap(x: number, z: number): boolean }, x: number, z: number, y: number | undefined, height: number): { hidden: number; edge: number } | null {
  const cx = Math.floor(x), cz = Math.floor(z - 1e-6);
  if (!s.inMap(cx, cz)) return null;
  const y0 = y ?? s.heightAt(cx, cz) * STEP;
  let best: { hidden: number; edge: number } | null = null;
  // Only the row right in front: further back, a tall wall may hide a little in the game, but moving the picture
  // there would make placing things confusing.
  for (let k = 1; k <= 1; k++) {
    if (!s.inMap(cx, cz + k)) break;
    const edge = cz + k, y1 = s.heightAt(cx, cz + k) * STEP;
    if (y1 <= y0) continue;
    const hide = (y1 - y0) * CAM_COS - (edge - z) * CAM_SIN;
    if (hide <= 0) continue;
    const share = Math.min(1, hide / Math.max(0.05, height * CAM_COS));
    if (!best || share > best.hidden) best = { hidden: share, edge };
  }
  return best;
}
