/**
 * Weather: rain, snow, a sandstorm, drifting pollen, dust motes or falling leaves, as particles in a box that
 * follows the camera (so there's always weather on screen, and only there). Everything drifts with the wind.
 * Changing the weather fades the old out while the new comes in.
 */
import * as THREE from 'three';
import { wind } from './wind';
import { leanNow } from './lean';
import type { WeatherKind } from '../world/types';

interface Style {
  count: number;
  /** Fall speed (tiles per second), how much the wind pushes it, how much it wanders. */
  fall: number; push: number; wander: number;
  color: string[]; size: number;
  /** Rain is drawn as streaks. */
  streak?: number;
  /** How high above the ground they fill the air (tiles). */
  height: number;
  /** Drawn as little leaves rather than soft dots. */
  leaf?: boolean;
  opacity: number;
}

const STYLES: Record<Exclude<WeatherKind, 'none'>, Style> = {
  rain: { height: 12, count: 1400, fall: 15, push: 2.5, wander: 0, color: ['#a8c4e8', '#c8dcf4'], size: 0, streak: 0.55, opacity: 0.55 },
  storm: { height: 12, count: 2400, fall: 21, push: 6, wander: 0, color: ['#9cb4d8', '#b8cce8'], size: 0, streak: 0.75, opacity: 0.6 },
  blizzard: { height: 9, count: 1800, fall: 1.8, push: 7, wander: 1.1, color: ['#ffffff', '#e8f0ff'], size: 0.5, opacity: 0.95 },
  haze: { height: 4, count: 220, fall: 0.05, push: 0.4, wander: 0.3, color: ['#d8dce4', '#c4c8d0'], size: 0.22, opacity: 0.35 },
  snow: { height: 9, count: 900, fall: 1.1, push: 1.2, wander: 0.6, color: ['#ffffff', '#e8f0ff'], size: 0.45, opacity: 0.95 },
  sandstorm: { height: 6, count: 1800, fall: 0.6, push: 9, wander: 1.2, color: ['#e8c28a', '#d8a868', '#f4d8a0'], size: 0, streak: 0.7, opacity: 0.8 },
  pollen: { height: 4, count: 260, fall: 0.15, push: 0.6, wander: 0.5, color: ['#fff2a0', '#ffe070', '#f8f8d0'], size: 0.26, opacity: 0.9 },
  dust: { height: 4, count: 320, fall: 0.08, push: 0.5, wander: 0.35, color: ['#d8ccb0', '#bfb39a'], size: 0.2, opacity: 0.65 },
  leaves: { height: 6, count: 280, fall: 0.9, push: 1.6, wander: 1.4, color: ['#d8782e', '#c8a032', '#a84a22', '#7a9a3a'], size: 1.1, opacity: 1, leaf: true },
};

/** The size of the box around the camera's target that holds the weather (its height is per kind). */
const BOX = { x: 26, z: 22 };

let leafTex: THREE.Texture | null = null;
/** A small leaf: a pointed oval with a darker midrib (white, so each leaf takes its own colour). */
function leaf(): THREE.Texture {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.translate(8, 8); g.rotate(-0.6);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(0, -4.5, 6, 0); g.quadraticCurveTo(0, 4.5, -6, 0); g.fill();
  g.strokeStyle = 'rgba(120,120,120,0.9)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-5, 0); g.lineTo(6, 0); g.stroke();
  leafTex = new THREE.CanvasTexture(c);
  leafTex.magFilter = THREE.NearestFilter;
  return leafTex;
}

let dotTex: THREE.Texture | null = null;
function dot(): THREE.Texture {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!, r = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,0.8)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 16, 16);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

class Layer {
  readonly obj: THREE.Points | THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly seed: Float32Array;
  private readonly mat: THREE.PointsMaterial | THREE.LineBasicMaterial;
  /** 0 … 1: faded in. */
  level = 0;
  target = 1;

  constructor(readonly kind: Exclude<WeatherKind, 'none'>, readonly amount: number, center: THREE.Vector3) {
    const st = STYLES[kind], n = Math.max(1, Math.round(st.count * amount));
    const perVert = st.streak ? 2 : 1;
    this.pos = new Float32Array(n * 3 * perVert);
    this.seed = new Float32Array(n);
    const col = new Float32Array(n * 3 * perVert), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.seed[i] = Math.random() * 100;
      const x = center.x + (Math.random() - 0.5) * BOX.x, y = center.y + Math.random() * st.height, z = center.z + (Math.random() - 0.5) * BOX.z;
      c.set(st.color[i % st.color.length]);
      for (let k = 0; k < perVert; k++) { this.pos.set([x, y, z], (i * perVert + k) * 3); col.set([c.r, c.g, c.b], (i * perVert + k) * 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (st.streak) {
      this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: true });
      this.obj = new THREE.LineSegments(g, this.mat);
    } else {
      this.mat = new THREE.PointsMaterial({ map: st.leaf ? leaf() : dot(), alphaTest: st.leaf ? 0.5 : 0, size: st.size, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, fog: true });
      this.obj = new THREE.Points(g, this.mat);
    }
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 5;
  }

  update(dt: number, center: THREE.Vector3, time: number, ground: (x: number, z: number) => number): void {
    this.level += (this.target - this.level) * Math.min(1, dt * 0.8);
    const st = STYLES[this.kind];
    this.mat.opacity = st.opacity * this.level;
    const perVert = st.streak ? 2 : 1, n = this.seed.length, p = this.pos;
    const ws = wind.strength, wx = wind.dx * st.push * (0.3 + ws), wz = wind.dz * st.push * (0.3 + ws);
    const fall = st.fall * (st.streak ? 1 : 0.8 + 0.4 * ws);
    const hx = BOX.x / 2, hz = BOX.z / 2;
    // With the camera tilted up (Database → Camera → Lean), things fall down the screen like the leaning sprites
    // stand up it: along the leaned "down" (down and toward the camera), not straight down.
    const lean = leanNow(), cy = Math.cos(lean), sz = Math.sin(lean);
    for (let i = 0; i < n; i++) {
      const o = i * perVert * 3, s = this.seed[i];
      let x = p[o], y = p[o + 1], z = p[o + 2];
      const wob = st.wander ? Math.sin(time * 1.3 + s) * st.wander : 0;
      const drop = fall * dt * (0.85 + (s % 1) * 0.3);
      x += (wx + wob) * dt; z += (wz + Math.cos(time * 1.1 + s * 1.7) * st.wander * 0.5) * dt + drop * sz;
      y -= drop * cy;
      // Wrapped around the box (it follows the camera), and back to the top once it reaches the ground.
      if (x < center.x - hx) x += BOX.x; else if (x > center.x + hx) x -= BOX.x;
      if (z < center.z - hz) z += BOX.z; else if (z > center.z + hz) z -= BOX.z;
      if (y < ground(x, z) || y < center.y - 2) y = center.y + st.height * (0.6 + Math.random() * 0.4);
      else if (y > center.y + st.height) y = center.y;
      p[o] = x; p[o + 1] = y; p[o + 2] = z;
      if (st.streak) {
        // The streak trails back along the way it's moving (up for rain, upwind for blowing sand).
        const vx = wx + wob, vz = wz + fall * sz, vy = -fall * cy, vl = Math.hypot(vx, vy, vz) || 1, len = st.streak / vl;
        p[o + 3] = x - vx * len; p[o + 4] = y - vy * len; p[o + 5] = z - vz * len;
      }
    }
    (this.obj.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void { this.obj.removeFromParent(); this.obj.geometry.dispose(); this.mat.dispose(); }
}

export class Weather {
  private layers: Layer[] = [];
  private parent: THREE.Object3D | null = null;
  kind: WeatherKind = 'none';
  amount = 0;

  /** A new map: its weather starts already in full (no fade). */
  attach(parent: THREE.Object3D, kind: WeatherKind, amount: number, center: THREE.Vector3): void {
    for (const l of this.layers) l.dispose();
    this.layers = [];
    this.parent = parent;
    this.kind = 'none';
    this.set(kind, amount, center);
    for (const l of this.layers) l.level = 1;
  }

  /** Change the weather: the old fades out as the new fades in. */
  set(kind: WeatherKind, amount: number, center: THREE.Vector3): void {
    // A kind with no look (a typo, an old save): clear skies rather than a crash.
    if (kind !== 'none' && !(kind in STYLES)) kind = 'none';
    amount = Math.max(0, Math.min(2, Number.isFinite(amount) ? amount : 1));
    if (kind === this.kind && Math.abs(amount - this.amount) < 0.01) return;
    for (const l of this.layers) l.target = 0;
    this.kind = kind; this.amount = amount;
    if (kind !== 'none' && amount > 0 && this.parent) {
      const l = new Layer(kind, amount, center);
      this.parent.add(l.obj);
      this.layers.push(l);
    }
  }

  /** How much it's raining (or snowing…) right now, 0 … 1, for sounds and gloom. */
  get rain(): number { return this.layers.filter((l) => l.kind === 'rain' || l.kind === 'storm').reduce((s, l) => s + l.level * Math.min(1, l.amount * (l.kind === 'storm' ? 1.4 : 1)), 0); }
  /** Grey murk: haze, and a blizzard's whiteout. */
  get mist(): number { return this.layers.filter((l) => l.kind === 'haze' || l.kind === 'blizzard').reduce((s, l) => s + l.level * Math.min(1, l.amount * (l.kind === 'haze' ? 0.7 : 0.9)), 0); }
  /** A storm right now (thunder and lightning), 0 … 1. */
  get storm(): number { return this.layers.filter((l) => l.kind === 'storm').reduce((s, l) => s + l.level, 0); }
  get haze(): number { return this.layers.filter((l) => l.kind === 'sandstorm').reduce((s, l) => s + l.level * Math.min(1, l.amount), 0); }

  update(dt: number, center: THREE.Vector3, time: number, ground: (x: number, z: number) => number): void {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const l = this.layers[i];
      l.update(dt, center, time, ground);
      if (l.target === 0 && l.level < 0.01) { l.dispose(); this.layers.splice(i, 1); }
    }
  }
}
