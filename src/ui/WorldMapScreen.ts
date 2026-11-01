/**
 * Pause → Map: the world map (Pokémon Gold / Silver style), drawn from the maps themselves and laid out as in the
 * Map editor's World layout. The stick glides across it (faster the further it's pushed); the D-pad (arrow keys)
 * steps the crosshair one tile at a time, repeating while held, to fine-tune. Drag with the mouse; zoom with LT / RT
 * (Z / C, or the wheel). Update 141: Y opens and closes it; LB / RB (Q / E) jump to the next / previous marker,
 * starting at the hero; A (Enter / Space) puts your own marker under the crosshair (again elsewhere moves it, on it
 * removes it). Places not visited yet are hidden, greyed or shown (Database → World map); inside visited maps only
 * the ground walked near shows, if exploring is on.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';
import { tabKeys, type TabGroup } from './tabs';
import type { Explored, WorldFog, WorldLabel, WorldPlacement } from '../world/worldLayout';
import { drawMarker, type MarkerSymbol } from '../world/landmarks';

export interface WorldMapPiece {
  name: string; title: string; at: WorldPlacement;
  /** The map drawn from above (null: not drawn yet, or never shown). */
  art: HTMLCanvasElement | null;
  visited: boolean;
  /** Ground seen so far (null: all of it). */
  explored: Explored | null;
}

/** An event's marker, in world tiles (an area event's whole area: w × h). */
export interface WorldMapMarker { x: number; z: number; w: number; h: number; symbol: MarkerSymbol; color: string; label: string; kind: string }

export interface WorldMapHost {
  /** Event markers shown now (their switches allow it). */
  markers(): WorldMapMarker[];
  /** The hero's name, for the pin's tooltip. */
  heroName(): string;
  pieces(): WorldMapPiece[];
  labels(): WorldLabel[];
  unvisited(): WorldFog;
  /** The hero in world tiles, and the map they're on. */
  hero(): { x: number; z: number; map: string } | null;
  /** Pixels per tile the art is drawn at. */
  artScale: number;
  /** The player's own marker (Update 141), in world tiles, and setting it (null removes it). */
  pin?(): { x: number; z: number } | null;
  setPin?(p: { x: number; z: number } | null): void;
}

const ZOOMS = [1, 2, 3, 4, 6, 8, 12, 16, 24];

/** A place to pick on the map (a griffin roost): where, its name, and a line under it (the price). */
export interface PickSpot { x: number; z: number; label: string; detail: string; disabled?: boolean }

export class WorldMapScreen {
  private readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly labelsEl = document.createElement('div');
  private readonly info = document.createElement('div');
  private readonly tip = document.createElement('div');
  private readonly cross = document.createElement('div');
  /** The pointer over the map (mouse): its tooltip follows it; otherwise the crosshair in the middle has it. */
  private hover: { x: number; y: number } | null = null;
  private open = false;
  private tabs: TabGroup | undefined;
  private onClose: () => void = () => {};
  /** The centre of the view, in world tiles, and pixels per tile on screen. */
  private cx = 0; private cz = 0; private zoom = 3;
  private drag: { x: number; y: number; cx: number; cz: number } | null = null;
  private fogCache = new Map<string, HTMLCanvasElement>();
  /** Gliding to a marker (A / Y): where to, and which one (-1: the hero). */
  private goal: { x: number; z: number } | null = null;
  private pick = -1;
  /** Picking a place (a griffin flight): the spots, and what happens with the choice (null: cancelled). */
  private picking: { spots: PickSpot[]; done: (i: number | null) => void; title: string } | null = null;
  /** The D-pad held: the direction and the time to the next repeated step. */
  private rep = { dir: '' as '' | 'left' | 'right' | 'up' | 'down', t: 0 };

  constructor(parent: HTMLElement, private readonly input: Input, private readonly host: WorldMapHost) {
    this.root.className = 'inv world-map-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'World map');
    const box = document.createElement('div');
    box.className = 'inv-box wm-box';
    const view = document.createElement('div');
    view.className = 'wm-view';
    this.labelsEl.className = 'wm-labels';
    this.cross.className = 'wm-cross';
    this.tip.className = 'wm-tip';
    view.append(this.canvas, this.labelsEl, this.cross, this.tip);
    this.info.className = 'menu-note';
    box.append(view, this.info);
    this.root.append(box);
    view.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz }; view.setPointerCapture(e.pointerId); });
    view.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { const r = view.getBoundingClientRect(); this.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; }
      if (!this.drag) { if (e.pointerType === 'mouse') this.draw(); return; }
      const s = this.scale(); this.cx = this.drag.cx - (e.clientX - this.drag.x) / s; this.cz = this.drag.cz - (e.clientY - this.drag.y) / s; this.draw();
    });
    view.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    view.addEventListener('pointerup', (e) => {
      const d = this.drag;
      this.drag = null;
      // Picking: a tap on a spot selects it; a tap on the selected one chooses it.
      if (!this.picking || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      const r = view.getBoundingClientRect(), s = this.scale(), wx = (e.clientX - r.left - r.width / 2) / s + this.cx, wz = (e.clientY - r.top - r.height / 2) / s + this.cz;
      const k = this.picking.spots.findIndex((p) => Math.hypot((p.x - wx) * s, (p.z - wz) * s) < 16);
      if (k < 0) return;
      if (k === this.pick) this.choose(); else { this.pick = k; this.goal = this.picking.spots[k]; uiSound('menuMove'); this.draw(); }
    });
    view.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(onClose: () => void, tabs?: TabGroup): void {
    // (Shown again while picking, as the maps finish drawing: keep the choice, just redraw.)
    if (this.picking) { this.fogCache.clear(); requestAnimationFrame(() => this.draw()); return; }
    this.open = true; this.onClose = onClose; this.tabs = tabs;
    this.root.hidden = false;
    this.fogCache.clear();
    this.centre();
    this.goal = null; this.pick = -1;
    requestAnimationFrame(() => this.draw());
  }

  hide(): void { this.open = false; this.root.hidden = true; }

  /** Pick one of these places on the map (a griffin flight's destination); `done` gets its index, or null. */
  pickSpot(title: string, spots: PickSpot[], done: (i: number | null) => void): void {
    this.picking = null;
    this.show(() => {});
    this.picking = { spots, done, title };
    if (spots.length) { this.pick = 0; this.goal = spots[0]; }
  }

  /** Picking: the selected spot is chosen. */
  private choose(): void {
    const p = this.picking, k = this.pick;
    if (!p || k < 0) return;
    if (p.spots[k]?.disabled) { uiSound('menuBack'); return; }
    this.picking = null;
    this.hide();
    uiSound('menuOk');
    p.done(k);
  }

  /** Close it from outside (its button pressed again, Update 141). */
  dismiss(): void { if (this.open) this.close(); }

  /** A: your own marker under the crosshair: put there, moved there, or (on it) taken away. */
  private togglePin(): void {
    const h = this.host;
    if (!h.setPin) return;
    const p = h.pin?.() ?? null, s = this.scale();
    if (p && Math.hypot((p.x - this.cx) * s, (p.z - this.cz) * s) < 14) { h.setPin(null); uiSound('menuBack'); }
    else { h.setPin({ x: Math.floor(this.cx) + 0.5, z: Math.floor(this.cz) + 0.5 }); uiSound('menuOk'); }
    this.draw();
  }

  private close(): void {
    this.hide(); uiSound('menuBack');
    const p = this.picking;
    if (p) { this.picking = null; p.done(null); return; }
    this.onClose();
  }

  private scale(): number { return ZOOMS[this.zoom] * (window.devicePixelRatio > 1 ? 1 : 1); }

  private centre(): void {
    const h = this.host.hero();
    if (h) { this.cx = h.x; this.cz = h.z; return; }
    const ps = this.host.pieces();
    if (ps.length) { this.cx = ps[0].at.x + ps[0].at.w / 2; this.cz = ps[0].at.z + ps[0].at.h / 2; }
  }

  private zoomBy(d: number): void {
    const z = Math.max(0, Math.min(ZOOMS.length - 1, this.zoom + d));
    if (z === this.zoom) return;
    this.zoom = z; uiSound('menuMove'); this.draw();
  }

  /** The hero, then every marker by how far it is from the hero: what A / Y step through. */
  private stops(): { x: number; z: number }[] {
    if (this.picking) return this.picking.spots;
    const h = this.host.hero(), ms = this.host.markers().map((m) => ({ x: m.x + m.w / 2, z: m.z + m.h / 2 }));
    const pin = this.host.pin?.();
    if (pin) ms.push(pin);
    if (h) ms.sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
    return h ? [{ x: h.x, z: h.z }, ...ms] : ms;
  }

  private step(dir: 1 | -1): void {
    const list = this.stops();
    if (!list.length) return;
    this.pick = ((this.pick + dir) % list.length + list.length) % list.length;
    this.goal = list[this.pick];
    this.hover = null;
    uiSound('menuMove');
  }

  update(dt: number): void {
    if (!this.open) return;
    const i = this.input;
    if (i.consume('cancel')) { this.close(); return; }
    if (tabKeys(i, this.tabs)) return;
    if (i.consume('subPrev')) this.zoomBy(-1);
    if (i.consume('subNext')) this.zoomBy(1);
    // Update 141: LB / RB (Q / E) the next / previous marker (the hero first); A your own marker.
    // Picking: A chooses the selected spot; the arrows (and LB / RB) step through them.
    if (this.picking) {
      if (i.confirm()) { this.choose(); return; }
      if (i.consume('right') || i.consume('down')) this.step(1);
      if (i.consume('left') || i.consume('up')) this.step(-1);
    } else if (i.confirm()) this.togglePin();
    if (i.consume('tabNext')) this.step(1);
    if (i.consume('tabPrev')) this.step(-1);
    i.consume('switchWeapon');
    let moved = false;
    // The stick glides, faster the further it's pushed (and faster zoomed out).
    const st = i.stick, amt = i.stickAmount;
    const dirs = ['left', 'right', 'up', 'down'] as const;
    if (amt > 0.25) {
      for (const a of dirs) i.consume(a); // its menu "presses" aren't tile steps
      const k = ((amt - 0.25) / 0.75) ** 1.6, speed = (22 / ZOOMS[this.zoom]) * 30 * k * dt;
      this.cx += (st.x / Math.max(amt, 1e-3)) * speed;
      this.cz += (st.y / Math.max(amt, 1e-3)) * speed;
      moved = true; this.goal = null; this.rep.dir = '';
    } else {
      // The D-pad / arrows: one tile per press (snapping the crosshair onto the tile grid), repeating while held.
      const stepTile = (a: typeof dirs[number]) => {
        const dx = a === 'left' ? -1 : a === 'right' ? 1 : 0, dz = a === 'up' ? -1 : a === 'down' ? 1 : 0;
        this.cx = Math.floor(this.cx) + 0.5 + dx; this.cz = Math.floor(this.cz) + 0.5 + dz;
        moved = true; this.goal = null;
      };
      for (const a of dirs) if (i.consume(a)) { stepTile(a); this.rep = { dir: a, t: 0.32 }; }
      if (this.rep.dir) {
        if (!i.isHeld(this.rep.dir)) this.rep.dir = '';
        else if ((this.rep.t -= dt) <= 0) { this.rep.t = 0.07; stepTile(this.rep.dir); }
      }
    }
    // Gliding to the picked marker.
    if (this.goal) {
      const k = 1 - Math.exp(-dt * 10);
      this.cx += (this.goal.x - this.cx) * k; this.cz += (this.goal.z - this.cz) * k;
      if (Math.hypot(this.goal.x - this.cx, this.goal.z - this.cz) < 0.02) { this.cx = this.goal.x; this.cz = this.goal.z; this.goal = null; }
      moved = true;
    }
    if (moved) { this.hover = null; this.draw(); }
  }

  /** The fog over a map: dark where the ground hasn't been seen yet. */
  private fog(p: WorldMapPiece): HTMLCanvasElement | null {
    if (!p.explored) return null;
    let c = this.fogCache.get(p.name);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = p.at.w; c.height = p.at.h;
    const g = c.getContext('2d')!, img = g.createImageData(p.at.w, p.at.h);
    for (let z = 0; z < p.at.h; z++) for (let x = 0; x < p.at.w; x++) { const i = (z * p.at.w + x) * 4; img.data[i] = 22; img.data[i + 1] = 26; img.data[i + 2] = 38; img.data[i + 3] = p.explored.has(x, z) ? 0 : 235; }
    g.putImageData(img, 0, 0);
    this.fogCache.set(p.name, c);
    return c;
  }

  private draw(): void {
    if (!this.open) return;
    const view = this.canvas.parentElement!, W = view.clientWidth, H = view.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) { this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr); }
    const g = this.canvas.getContext('2d')!, s = this.scale();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#18324a';
    g.fillRect(0, 0, W, H);
    // A faint grid, like a chart.
    g.strokeStyle = 'rgba(255,255,255,0.04)'; g.lineWidth = 1;
    const sx = (x: number) => (x - this.cx) * s + W / 2, sz = (z: number) => (z - this.cz) * s + H / 2;
    const grid = 16;
    for (let x = Math.floor((this.cx - W / 2 / s) / grid) * grid; sx(x) < W; x += grid) { g.beginPath(); g.moveTo(Math.round(sx(x)) + 0.5, 0); g.lineTo(Math.round(sx(x)) + 0.5, H); g.stroke(); }
    for (let z = Math.floor((this.cz - H / 2 / s) / grid) * grid; sz(z) < H; z += grid) { g.beginPath(); g.moveTo(0, Math.round(sz(z)) + 0.5); g.lineTo(W, Math.round(sz(z)) + 0.5); g.stroke(); }
    const fogMode = this.host.unvisited(), hero = this.host.hero();
    const shown = new Set<string>();
    for (const p of this.host.pieces()) {
      if (!p.visited && fogMode === 'hidden') continue;
      const x = sx(p.at.x), z = sz(p.at.z), w = p.at.w * s, h = p.at.h * s;
      if (x > W || z > H || x + w < 0 || z + h < 0) continue;
      shown.add(p.name);
      g.save();
      if (!p.visited && fogMode === 'grey') g.filter = 'grayscale(1) brightness(0.55)';
      if (p.art) g.drawImage(p.art, Math.round(x), Math.round(z), Math.round(w), Math.round(h));
      else { g.fillStyle = '#3d4a3a'; g.fillRect(x, z, w, h); }
      g.restore();
      const f = p.visited ? this.fog(p) : null;
      if (f) { g.imageSmoothingEnabled = true; g.drawImage(f, Math.round(x), Math.round(z), Math.round(w), Math.round(h)); g.imageSmoothingEnabled = false; }
      g.strokeStyle = hero?.map === p.name ? 'rgba(255, 210, 122, 0.85)' : 'rgba(0,0,0,0.45)';
      g.lineWidth = hero?.map === p.name ? 2 : 1;
      g.strokeRect(Math.round(x) + 0.5, Math.round(z) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
    }
    // Event markers: an area's outline in the marker's colour, the symbol at its middle.
    const markers = this.host.markers(), mr = Math.max(7, Math.min(13, s * 1.6));
    for (const m of markers) {
      if (m.w > 1 || m.h > 1) {
        g.save();
        g.fillStyle = m.color; g.globalAlpha = 0.16; g.fillRect(sx(m.x), sz(m.z), m.w * s, m.h * s);
        g.globalAlpha = 0.9; g.strokeStyle = m.color; g.lineWidth = 2; g.setLineDash([5, 4]);
        g.strokeRect(Math.round(sx(m.x)) + 0.5, Math.round(sz(m.z)) + 0.5, Math.round(m.w * s), Math.round(m.h * s));
        g.restore();
      }
      drawMarker(g, m.symbol, sx(m.x + m.w / 2), sz(m.z + m.h / 2), mr, m.color);
    }
    // Your own marker (Update 141): a red flag.
    const pin = this.host.pin?.() ?? null;
    if (pin) drawMarker(g, 'flag', sx(pin.x), sz(pin.z), mr * 1.25, '#ff5a5a');
    // Picking: the spots (the selected one bigger, in gold).
    if (this.picking) this.picking.spots.forEach((p, k) => drawMarker(g, 'flag', sx(p.x), sz(p.z), k === this.pick ? mr * 1.5 : mr, p.disabled ? '#8a8a8a' : k === this.pick ? '#ffd27a' : '#e8e0c8'));
    // Names: towns and landmarks (in places shown), and the hero's pin.
    const pieces = this.host.pieces();
    const inShown = (l: WorldLabel) => pieces.some((p) => shown.has(p.name) && l.x >= p.at.x && l.x < p.at.x + p.at.w && l.z >= p.at.z && l.z < p.at.z + p.at.h
      && (p.visited || fogMode === 'visible'));
    const html = this.host.labels().filter(inShown).map((l) => `<span class="wm-label ${l.kind ?? 'town'}" style="left:${sx(l.x)}px;top:${sz(l.z)}px">${esc(l.name)}</span>`);
    if (hero) html.push(`<span class="wm-pin" style="left:${sx(hero.x)}px;top:${sz(hero.z)}px" aria-label="You are here"></span>`);
    this.labelsEl.innerHTML = html.join('');
    // The tooltip: whatever is under the crosshair (or the mouse) — the hero, a marker, a place name.
    const at = this.hover ?? { x: W / 2, y: H / 2 }, wx = (at.x - W / 2) / s + this.cx, wz = (at.y - H / 2) / s + this.cz;
    const near = (x: number, z: number) => Math.hypot(sx(x) - at.x, sz(z) - at.y) < Math.max(14, mr + 4);
    let tip = '';
    const spot = this.picking ? (this.hover ? this.picking.spots.find((p) => near(p.x, p.z)) : undefined) ?? this.picking.spots[this.pick] : undefined;
    if (spot) tip = `${spot.label} · ${spot.detail}`;
    else if (hero && near(hero.x, hero.z)) tip = `${this.host.heroName()} · ${pieces.find((p) => p.name === hero.map)?.title ?? ''}`;
    else if (pin && near(pin.x, pin.z)) tip = `Your marker · ${this.input.lastDevice === 'pad' ? 'A' : 'Space'} to take it away`;
    else {
      const point = markers.find((m) => near(m.x + m.w / 2, m.z + m.h / 2));
      const area = point ? null : markers.find((m) => (m.w > 1 || m.h > 1) && wx >= m.x && wx < m.x + m.w && wz >= m.z && wz < m.z + m.h);
      const mk = point ?? area;
      if (mk) tip = `${mk.label} · ${mk.kind}`;
      else { const l = this.host.labels().filter(inShown).find((x) => near(x.x, x.z)); if (l) tip = l.name; }
    }
    this.tip.textContent = tip;
    this.tip.hidden = !tip;
    this.tip.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y - 18)}px) translate(-50%, -100%)`;
    this.cross.hidden = !!this.hover;
    const here = pieces.find((p) => p.name === hero?.map);
    const pad = this.input.lastDevice === 'pad';
    if (this.picking) { this.info.textContent = `${this.picking.title} · ${pad ? 'D-pad' : 'Arrows'}: next roost · ${pad ? 'A' : 'Space / Enter'}: fly there · a click selects, a second click flies · ${pad ? 'B' : 'Esc'}: cancel`; return; }
    this.info.textContent = `${here ? here.title : ''}${here ? ' · ' : ''}${pad ? 'Stick: glide · D-pad: one tile' : 'Arrows: one tile · drag: scroll'} · ${this.input.label('subPrev')} / ${this.input.label('subNext')}: zoom · ${this.input.label('tabPrev')} / ${this.input.label('tabNext')}: previous / next marker · ${pad ? 'A' : 'Space'}: ${pin ? 'move / remove' : 'place'} your marker · ${pad ? 'Y / B' : 'M / Esc'}: close`;
  }
}
