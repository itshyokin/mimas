/**
 * The 3D view (Update 155): a 3D map's Blender scene in the editor, like Unity or Sapien. Fly round it (hold the right
 * mouse button: drag to look, W A S D to move, Q / E down / up, Shift faster; the wheel moves forward and back),
 * click an event to select it (double-click opens it), drag the gizmo to move it (W) or turn it (E), F to frame it.
 * Right-click a spot to put something there: a new event (pick its kind on the left) or the player's start.
 * Events placed here keep their exact 3D position (EventData.pos3), used by the game.
 */
import { customTileImage } from './editorArt';
import { builtinTileArt } from '../art/placeholderArt';
import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Body3D, type Scene3D, build3D } from '../game/World3D';
import { readGroundModel } from '../world/groundModel';
import type { EventData } from '../world/types';
import { h, toast } from './dom';
import type { EditorStore } from './store';

const COLORS: Record<string, number> = { action: 0xffc04a, touch: 0x4aa8ff, auto: 0xc77dff, parallel: 0x9d8cff };

export class View3D {
  readonly el: HTMLElement;
  active = false;
  /** Right-clicked spot waiting for the event created from the left bar. */
  private pending: THREE.Vector3 | null = null;
  private readonly canvas = h('canvas', { class: 'view3d-canvas', tabindex: '0', 'aria-label': '3D view of the map' });
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  private gizmo: TransformControls | null = null;
  private world: { key: string; s3: Scene3D; body: Body3D } | null = null;
  private loading = '';
  private readonly markers = new Map<number, THREE.Group>();
  /** Update 156: volumes, as unit boxes scaled to their size (bottom at the group's origin). */
  private readonly vols = new Map<number, THREE.Group>();
  private readonly bring = h('button', { type: 'button', class: 'btn small view3d-bring', hidden: true, onclick: () => this.bringVolumes() });
  private readonly startMarker = new THREE.Group();
  private known = new Set<number>();
  private yaw = 0;
  private pitch = -0.6;
  private readonly keys = new Set<string>();
  private look: { x: number; y: number; moved: number } | null = null;
  private raf = 0;
  private last = 0;
  private menu: HTMLElement | null = null;

  constructor(private readonly store: EditorStore, private readonly openEvent: (ev: EventData) => void) {
    // Update 157: the tools in view: Move / Turn / Size, and how to get round.
    const tool = (mode: 'translate' | 'rotate' | 'scale', text: string, key: string) => h('button', { type: 'button', class: 'tool', 'data-mode': mode, title: `${text} (${key})`, onclick: () => { this.setMode(mode); this.canvas.focus(); } }, `${text} · ${key}`);
    this.tools = h('div', { class: 'view3d-tools' },
      h('div', { class: 'toolrow small' }, tool('translate', 'Move', 'W'), tool('rotate', 'Turn', 'E'), tool('scale', 'Size', 'R')),
      h('div', { class: 'view3d-help' }, 'Click: select · Right-click: place here · Hold right button: look, W A S D / Q E fly, Shift faster · Wheel: forward / back · F: frame · Double-click: open'));
    this.el = h('div', { class: 'view3d', hidden: true }, this.canvas, this.bring, this.tools);
    this.scene.background = new THREE.Color(0x9fb4c8);
    this.scene.add(new THREE.HemisphereLight(0xdfeeff, 0x4a4030, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(-30, 60, -20); this.scene.add(sun);
    this.scene.add(this.startMarker);
    const startMesh = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 12), new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x1a5a30 }));
    startMesh.position.y = 0.6; startMesh.rotation.x = Math.PI;
    startMesh.userData.start = true;
    // Which way the hero faces at the start.
    const startNose = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), new THREE.MeshStandardMaterial({ color: 0x14532d }));
    startNose.position.set(0, 0.9, 0.35);
    this.startMarker.add(startNose);
    this.startMarker.add(startMesh, label('Player start', '#4ade80'));
    for (const t of ['map', 'structure', 'selection'] as const) store.on(t, () => { if (this.active) this.sync(); });
    this.bind();
  }

  /** Show or hide the view (the 2D map shows otherwise). */
  show(on: boolean): void {
    this.active = on;
    this.el.hidden = !on;
    cancelAnimationFrame(this.raf);
    this.closeMenu();
    if (!on) return;
    // A tablet: the 3D view is for a computer (a mouse and keyboard).
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
      this.el.replaceChildren(h('div', { class: 'view3d-note' }, h('p', {}, 'The 3D view needs a computer with a mouse and keyboard.'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => this.onClose?.() }, 'Close')));
      return;
    }
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
      this.renderer.outputEncoding = THREE.sRGBEncoding;
      this.gizmo = new TransformControls(this.camera, this.canvas);
      this.gizmo.setSize(0.9);
      this.gizmo.addEventListener('dragging-changed', (e) => { if (!(e as unknown as { value: boolean }).value) this.commitGizmo(); });
      this.scene.add(this.gizmo);
    }
    this.sync();
    this.setMode('translate');
    this.canvas.focus();
    this.last = performance.now();
    const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); };
    loop();
  }
  private readonly tools: HTMLElement;
  /** The gizmo's tool (sizing is for volumes only); the buttons show which is on. */
  private setMode(mode: 'translate' | 'rotate' | 'scale'): void {
    if (!this.gizmo) return;
    if (mode === 'scale' && this.store.selection?.kind !== 'volume') mode = 'translate';
    this.gizmo.setMode(mode);
    const rot = mode === 'rotate';
    this.gizmo.showX = !rot; this.gizmo.showZ = !rot; this.gizmo.showY = true;
    this.tools.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  }
  /** Asked to close (the tablet note's button). */
  onClose: (() => void) | null = null;

  /** Load the map's scene (once per file), then the markers. */
  private sync(): void {
    const m = this.store.map, g = m.scene3d;
    if (!g) return;
    const key = JSON.stringify(g);
    if (this.world?.key !== key && this.loading !== key) {
      this.loading = key;
      void (async () => {
        try {
          const blob = this.store.files.get(g.src) ?? await this.store.project.readFile(g.src);
          if (!this.store.files.has(g.src)) this.store.files.set(g.src, blob);
          const url = URL.createObjectURL(blob);
          const s3 = build3D(await readGroundModel(url, g.src), g.scale ?? 1, (n) => {
            // ter_… materials (Update 160): the game tile's picture, as in the game.
            const norm = (t: string) => t.toLowerCase().replace(/[\s-]+/g, '_'), want = norm(n);
            const def = this.store.tiles.all().find((t) => norm(t.id) === want || norm(t.name) === want);
            if (!def) return null;
            const img = customTileImage(def.key) ?? builtinTileArt(def.key);
            return { image: img, span: def.kind ? 1 : Math.max(1, def.span || 1), point: def.filter !== 'smooth' };
          });
          URL.revokeObjectURL(url);
          if (this.world) this.scene.remove(this.world.s3.object);
          this.world = { key, s3, body: new Body3D(s3) };
          this.scene.add(s3.object);
          // Start looking over the whole place.
          const c = s3.bounds.getCenter(new THREE.Vector3()), size = s3.bounds.getSize(new THREE.Vector3());
          this.camera.position.set(c.x, s3.bounds.max.y + Math.max(size.x, size.z) * 0.5, s3.bounds.max.z + Math.max(size.x, size.z) * 0.3);
          this.yaw = 0; this.pitch = -0.7;
        } catch { toast('Couldn’t read this map’s 3D scene.', 'error'); }
        this.loading = '';
        this.markersSync();
      })();
    }
    this.markersSync();
  }

  /** Where an event stands: its 3D spot, or its tile's centre on the highest floor there. */
  private spotOf(ev: EventData): THREE.Vector3 {
    if (ev.pos3) return new THREE.Vector3(ev.pos3.x, ev.pos3.y, ev.pos3.z);
    const x = ev.x + (ev.w ?? 1) / 2, z = ev.z + (ev.h ?? 1) / 2;
    return new THREE.Vector3(x, this.world?.body.groundBelow(x, (this.world?.s3.bounds.max.y ?? 0) + 5, z) ?? 0, z);
  }

  private markersSync(): void {
    const s = this.store, m = s.map;
    // A new event made from the left bar after right-clicking a spot: it goes exactly there.
    const ids = new Set(m.events.map((e) => e.id));
    if (this.pending) for (const e of m.events) if (!this.known.has(e.id) && !e.pos3) {
      e.pos3 = { x: round2(this.pending.x), y: round2(this.pending.y), z: round2(this.pending.z) };
      e.x = Math.floor(this.pending.x); e.z = Math.floor(this.pending.z);
      this.pending = null;
      s.changed();
      break;
    }
    this.known = ids;
    for (const [id, g] of this.markers) if (!ids.has(id)) { this.scene.remove(g); this.markers.delete(id); }
    const sel = s.selection?.kind === 'event' ? s.selection.id : null;
    for (const e of m.events) {
      let g = this.markers.get(e.id);
      const trig = e.pages[0]?.trigger ?? 'action', key = `${e.name}|${trig}`;
      if (!g || g.userData.key !== key) {
        if (g) this.scene.remove(g);
        g = new THREE.Group();
        g.userData = { key, id: e.id };
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 16), new THREE.MeshStandardMaterial({ color: COLORS[trig] ?? 0xffc04a, transparent: true, opacity: 0.85 }));
        body.position.y = 0.8;
        body.userData.eventId = e.id;
        const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        nose.position.set(0, 1.3, 0.3);
        g.add(body, nose, label(e.name, '#ffffff'));
        this.markers.set(e.id, g);
        this.scene.add(g);
      }
      if (!(this.gizmo?.dragging && this.gizmo.object === g)) { g.position.copy(this.spotOf(e)); g.rotation.y = ((e.pos3?.ry ?? 0) * Math.PI) / 180; }
      const mat = (g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(e.id === sel ? 0x664400 : 0x000000);
      g.scale.setScalar(e.id === sel ? 1.15 : 1);
    }
    // The player's start, when it's on this map.
    const st = s.db.start, here = s.db.startMap === s.mapName;
    this.startMarker.visible = here;
    if (here && !(this.gizmo?.dragging && this.gizmo.object === this.startMarker)) {
      this.startMarker.position.set(st.x, st.y ?? this.world?.body.groundBelow(st.x, (this.world?.s3.bounds.max.y ?? 0) + 5, st.z) ?? 0, st.z);
      this.startMarker.rotation.y = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 }[st.dir ?? 'down'];
    }
    ((this.startMarker.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.setHex(s.selection?.kind === 'start' ? 0x2a8a50 : 0x1a5a30);
    // Volumes.
    const vsel = s.selection?.kind === 'volume' ? s.selection.id : null, vols = m.volumes ?? [];
    for (const [id, g] of this.vols) if (!vols.some((v) => v.id === id)) { this.scene.remove(g); this.vols.delete(id); }
    for (const v of vols) {
      let g = this.vols.get(v.id);
      const key = `${v.kind}|${v.name}`;
      if (!g || g.userData.key !== key) {
        if (g) this.scene.remove(g);
        g = new THREE.Group();
        g.userData = { key, volumeId: v.id };
        const col = v.kind === 'trigger' ? 0xff9a3c : 0xff4f6a;
        const fill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.16, depthWrite: false }));
        fill.userData.volumeId = v.id;
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), new THREE.LineBasicMaterial({ color: col }));
        g.add(fill, edges);
        this.vols.set(v.id, g);
        this.scene.add(g);
      }
      if (!(this.gizmo?.dragging && this.gizmo.object === g)) {
        g.position.set(v.x, v.y, v.z); g.rotation.set(0, ((v.ry ?? 0) * Math.PI) / 180, 0); g.scale.set(v.sx, v.sy, v.sz);
      }
      ((g.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = v.id === vsel ? 0.32 : 0.16;
    }
    // Volumes made in Blender and not brought in yet.
    const fresh = (this.world?.s3.volumes ?? []).filter((b) => !vols.some((v) => v.name === b.name));
    this.bring.hidden = !fresh.length;
    this.bring.textContent = `Bring in ${fresh.length} volume${fresh.length === 1 ? '' : 's'} from Blender`;
    // The gizmo on the selected event or volume.
    const gm = sel !== null ? this.markers.get(sel) : vsel !== null ? this.vols.get(vsel) : s.selection?.kind === 'start' && here ? this.startMarker : undefined;
    if (this.gizmo) {
      if (gm) { if (this.gizmo.object !== gm) this.gizmo.attach(gm); } else this.gizmo.detach();
      // Events don't scale.
      if (this.gizmo.mode === 'scale' && vsel === null) this.gizmo.setMode('translate');
      if (this.gizmo.mode === 'rotate') { this.gizmo.showX = false; this.gizmo.showZ = false; }
    }
  }

  /** The gizmo let go: the event's new spot and facing. */
  private commitGizmo(): void {
    const g = this.gizmo?.object, s = this.store;
    // The player's start (Update 157): where, on which floor, and facing which way (the nearest of the four).
    if (g === this.startMarker) {
      const a = ((g.rotation.y % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), q = Math.round(a / (Math.PI / 2)) % 4;
      s.checkpoint();
      s.db.start = { ...s.db.start, x: round2(g.position.x), y: round2(g.position.y), z: round2(g.position.z), dir: (['down', 'right', 'up', 'left'] as const)[q] };
      s.changedDb();
      return;
    }
    const vol = g && g.userData.volumeId !== undefined ? s.map.volumes?.find((v) => v.id === g.userData.volumeId) : undefined;
    if (g && vol) {
      s.checkpoint();
      vol.x = round2(g.position.x); vol.y = round2(g.position.y); vol.z = round2(g.position.z);
      const ry = Math.round(((((g.rotation.y * 180) / Math.PI) % 360) + 360) % 360);
      if (ry) vol.ry = ry; else delete vol.ry;
      vol.sx = Math.max(0.2, round2(Math.abs(g.scale.x))); vol.sy = Math.max(0.2, round2(Math.abs(g.scale.y))); vol.sz = Math.max(0.2, round2(Math.abs(g.scale.z)));
      s.changed();
      return;
    }
    const ev = g ? s.map.events.find((e) => e.id === g.userData.id) : undefined;
    if (!g || !ev) return;
    s.checkpoint();
    const ry = Math.round(((((g.rotation.y * 180) / Math.PI) % 360) + 360) % 360);
    ev.pos3 = { x: round2(g.position.x), y: round2(g.position.y), z: round2(g.position.z), ...(ry ? { ry } : {}) };
    ev.x = Math.floor(g.position.x); ev.z = Math.floor(g.position.z);
    s.changed();
  }

  private frame(): void {
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const r = this.renderer!, w = this.el.clientWidth, hh = this.el.clientHeight;
    if (!w || !hh) return;
    if (this.canvas.width !== Math.round(w * devicePixelRatio) || this.canvas.height !== Math.round(hh * devicePixelRatio)) {
      r.setPixelRatio(devicePixelRatio); r.setSize(w, hh, false);
      this.camera.aspect = w / hh; this.camera.updateProjectionMatrix();
    }
    // Flying: only while the right mouse button is held (W and E are the gizmo's otherwise).
    if (this.look) {
      const sp = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 24 : 8) * dt;
      const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
      const rt = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      if (this.keys.has('KeyW')) this.camera.position.addScaledVector(f, sp);
      if (this.keys.has('KeyS')) this.camera.position.addScaledVector(f, -sp);
      if (this.keys.has('KeyD')) this.camera.position.addScaledVector(rt, sp);
      if (this.keys.has('KeyA')) this.camera.position.addScaledVector(rt, -sp);
      if (this.keys.has('KeyE')) this.camera.position.y += sp;
      if (this.keys.has('KeyQ')) this.camera.position.y -= sp;
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    r.render(this.scene, this.camera);
  }

  private ray(e: { clientX: number; clientY: number }): THREE.Raycaster {
    const rc = this.canvas.getBoundingClientRect(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1), this.camera);
    return ray;
  }

  private bind(): void {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => {
      this.closeMenu();
      c.focus();
      if (e.button === 2) { this.look = { x: e.clientX, y: e.clientY, moved: 0 }; c.setPointerCapture(e.pointerId); return; }
      if (e.button !== 0 || this.gizmo?.axis) return;
      // Click: select the event under the pointer (or nothing).
      const hit = this.ray(e).intersectObjects([...this.markers.values(), ...this.vols.values(), this.startMarker], true).find((i) => i.object.userData.eventId !== undefined || i.object.userData.volumeId !== undefined || i.object.userData.start);
      this.store.select(!hit ? null : hit.object.userData.start ? { kind: 'start' } : hit.object.userData.eventId !== undefined ? { kind: 'event', id: hit.object.userData.eventId as number } : { kind: 'volume', id: hit.object.userData.volumeId as number });
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.look) return;
      const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
      this.look.moved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.004; this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.004));
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    c.addEventListener('pointerup', (e) => {
      if (e.button !== 2 || !this.look) return;
      const moved = this.look.moved;
      this.look = null;
      // A right-click without dragging: what to put here.
      if (moved < 5) this.openMenu(e);
    });
    c.addEventListener('dblclick', (e) => {
      const hit = this.ray(e).intersectObjects([...this.markers.values()], true).find((i) => i.object.userData.eventId !== undefined);
      const ev = hit ? this.store.map.events.find((x) => x.id === hit.object.userData.eventId) : undefined;
      if (ev) this.openEvent(ev);
    });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
      this.camera.position.addScaledVector(f, (e.deltaY > 0 ? -1 : 1) * (e.shiftKey ? 6 : 2));
    }, { passive: false });
    c.addEventListener('keydown', (e) => {
      e.stopPropagation();
      this.keys.add(e.code);
      if (this.look) return;
      if (e.code === 'KeyW') this.setMode('translate');
      if (e.code === 'KeyE') this.setMode('rotate');
      if (e.code === 'KeyR') this.setMode('scale');
      if ((e.code === 'Delete' || e.code === 'Backspace') && this.store.selection?.kind === 'volume') {
        const id = this.store.selection.id, m = this.store.map;
        this.store.checkpoint(); m.volumes = (m.volumes ?? []).filter((v) => v.id !== id); if (!m.volumes.length) delete m.volumes;
        this.store.select(null); this.store.changed('structure');
      }
      if (e.code === 'KeyF') this.frameSelected();
      if (e.code === 'Escape') { this.store.select(null); this.closeMenu(); }
    });
    c.addEventListener('keyup', (e) => { e.stopPropagation(); this.keys.delete(e.code); });
    c.addEventListener('blur', () => this.keys.clear());
  }

  private frameSelected(): void {
    const sel = this.store.selection, g = sel?.kind === 'event' ? this.markers.get(sel.id) : sel?.kind === 'volume' ? this.vols.get(sel.id) : sel?.kind === 'start' ? this.startMarker : null;
    if (!g) return;
    const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
    this.camera.position.copy(g.position).add(new THREE.Vector3(0, 1, 0)).addScaledVector(f, -6);
  }

  private openMenu(e: PointerEvent): void {
    const s = this.store, w = this.world;
    if (!w) return;
    const hit = this.ray(e).intersectObject(w.s3.object, true).find((i) => (i.object as THREE.Mesh).isMesh && i.object.visible);
    if (!hit) return;
    const p = hit.point.clone();
    const item = (text: string, fn: () => void) => h('button', { type: 'button', class: 'menu-item', onclick: () => { this.closeMenu(); fn(); } }, text);
    this.menu = h('div', { class: 'view3d-menu', style: `left:${e.offsetX}px;top:${e.offsetY}px` },
      item('New event here… (choose its kind on the left)', () => {
        this.pending = p;
        s.select({ kind: 'tile', x: Math.floor(p.x), z: Math.floor(p.z) });
      }),
      item('Trigger volume here (runs an event when walked into)', () => this.addVolume('trigger', p)),
      item('Encounter volume here (random battles inside)', () => this.addVolume('encounter', p)),
      s.db.startMap === s.mapName ? item('Move the player’s start here', () => { s.checkpoint(); s.db.start = { ...s.db.start, x: round2(p.x), y: round2(p.y), z: round2(p.z) }; s.changedDb(); s.select({ kind: 'start' }); }) : null,
      h('div', { class: 'view3d-menu-note' }, `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`));
    this.el.append(this.menu);
  }
  private closeMenu(): void { this.menu?.remove(); this.menu = null; }

  /** A new volume standing on the clicked spot (Update 156). */
  private addVolume(kind: 'trigger' | 'encounter', p: THREE.Vector3, size?: { name: string; sx: number; sy: number; sz: number; zone?: string; y?: number }): void {
    const s = this.store, m = s.map, vols = (m.volumes ??= []);
    const id = vols.reduce((a, v) => Math.max(a, v.id), 0) + 1;
    const n = vols.filter((v) => v.kind === kind).length + 1;
    s.checkpoint();
    vols.push({ id, name: size?.name ?? `${kind === 'trigger' ? 'Trigger' : 'Encounters'} ${n}`, kind, x: round2(p.x), y: round2(size?.y ?? p.y), z: round2(p.z),
      sx: size?.sx ?? 3, sy: size?.sy ?? 2.5, sz: size?.sz ?? 3, ...(size?.zone ? { zone: size.zone } : {}) });
    s.changed('structure');
    if (!size) s.select({ kind: 'volume', id });
  }
  /** The trigger_… and encounter_… boxes from Blender, as volumes to edit here. */
  private bringVolumes(): void {
    const m = this.store.map;
    for (const b of this.world?.s3.volumes ?? []) if (!(m.volumes ?? []).some((v) => v.name === b.name))
      this.addVolume(b.kind, new THREE.Vector3(b.x, b.y, b.z), { name: b.name, sx: round2(b.sx), sy: round2(b.sy), sz: round2(b.sz), zone: b.zone, y: b.y });
    toast('Brought in. Pick each trigger’s event (and each encounter box’s zone) on the left.');
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A name floating over a marker. */
function label(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const g = c.getContext('2d')!;
  g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text.slice(0, 22), 128, 24);
  g.fillStyle = color; g.fillText(text.slice(0, 22), 128, 24);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.45, 1); s.position.y = 2.05; s.renderOrder = 10;
  return s;
}
