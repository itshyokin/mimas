/**
 * The dice table for setting up stats: a little felt-topped table in its own small three.js scene, where real 3D six-
 * sided dice drop in, bounce off the floor, the rim and each other, tumble and come to rest. Each roll's numbers are
 * chosen first (fair, at random); as a die slows on its last bounce it eases onto the face showing its number, so
 * what lands is what's read out. Has its own animation loop while dice are moving; `skip()` lands them at once.
 */
import * as THREE from 'three';

/** Table half-size (units) and the size of a die. */
const HALF_W = 3.1, HALF_D = 1.9, SIZE = 0.74, R = SIZE / 2;
const GRAVITY = -26;
/** Which local face shows which number (opposite faces add up to 7). Box faces: +x, −x, +y, −y, +z, −z. */
const FACE_VALUES = [3, 4, 1, 6, 2, 5];
const FACE_NORMALS = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)];
const UP = new THREE.Vector3(0, 1, 0);

/** Pip positions on a face (0 … 1). */
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.27, 0.23], [0.73, 0.23], [0.27, 0.5], [0.73, 0.5], [0.27, 0.77], [0.73, 0.77]],
};

function faceTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 56, 10, 64, 64, 90);
  grad.addColorStop(0, '#fbf6ea'); grad.addColorStop(1, '#e2d8c2');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  // Soft darker rim so the edges read as rounded.
  g.strokeStyle = 'rgba(120, 100, 70, 0.35)'; g.lineWidth = 10; g.strokeRect(0, 0, 128, 128);
  for (const [x, y] of PIPS[n]) {
    g.beginPath(); g.arc(x * 128, y * 128, n === 1 ? 15 : 11, 0, Math.PI * 2);
    g.fillStyle = n === 1 ? '#b3262e' : '#231a26'; g.fill();
    g.beginPath(); g.arc(x * 128 - 2, y * 128 - 2, n === 1 ? 5 : 3.5, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

function feltTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f5a3e'; g.fillRect(0, 0, 256, 256);
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 18; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.encoding = THREE.sRGBEncoding;
  return t;
}

interface Die {
  mesh: THREE.Mesh;
  pos: THREE.Vector3; vel: THREE.Vector3;
  spin: THREE.Vector3;
  value: number;
  /** Settling onto its face: from, to and progress (0 … 1); null while still tumbling. */
  settle: { from: THREE.Quaternion; to: THREE.Quaternion; t: number } | null;
  bounces: number;
  resting: boolean;
}

export class DiceTable {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 16 / 10, 0.1, 50);
  private readonly geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
  private readonly faceMats: THREE.MeshStandardMaterial[];
  private readonly dimMats: THREE.MeshStandardMaterial[];
  private dice: Die[] = [];
  private raf = 0;
  private last = 0;
  private onDone: ((values: number[]) => void) | null = null;
  private failed = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mk-dice-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    const tex = [1, 2, 3, 4, 5, 6].map(faceTexture);
    this.faceMats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: tex[v - 1], roughness: 0.42, metalness: 0 }));
    this.dimMats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: tex[v - 1], roughness: 0.6, color: 0x6a6470, transparent: true, opacity: 0.75 }));
    this.camera.position.set(0, 7.4, 4.6);
    this.camera.lookAt(0, 0, 0.25);
    // Table: felt with a wooden rim.
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_D * 2), new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true;
    this.scene.add(felt);
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.55 });
    const rim = (w: number, d: number, x: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, d), wood); m.position.set(x, 0.16, z); m.castShadow = m.receiveShadow = true; this.scene.add(m); };
    rim(HALF_W * 2 + 0.6, 0.3, 0, -HALF_D - 0.15); rim(HALF_W * 2 + 0.6, 0.3, 0, HALF_D + 0.15);
    rim(0.3, HALF_D * 2, -HALF_W - 0.15, 0); rim(0.3, HALF_D * 2, HALF_W + 0.15, 0);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x203028, 0.75));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.1);
    sun.position.set(-3, 9, 4); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 4, bottom: -4, near: 1, far: 20 });
    this.scene.add(sun);
  }

  /** Make (or remake) the renderer at the canvas's size. Returns false when WebGL isn't available. */
  private ensure(): boolean {
    if (this.failed) return false;
    if (!this.renderer) {
      try {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      } catch { this.failed = true; return false; }
    }
    const w = Math.max(160, this.canvas.clientWidth || 480), h = Math.max(100, this.canvas.clientHeight || 300);
    const r = this.renderer;
    if (r.domElement.width !== Math.round(w * Math.min(2, devicePixelRatio)) || r.domElement.height !== Math.round(h * Math.min(2, devicePixelRatio))) {
      r.setPixelRatio(Math.min(2, devicePixelRatio));
      r.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    return true;
  }

  get rolling(): boolean { return this.dice.some((d) => !d.resting); }
  get available(): boolean { return !this.failed; }

  /** Throw dice showing these values; `done` is called once they're all at rest. */
  roll(values: number[], done: (values: number[]) => void): void {
    this.clear();
    this.onDone = done;
    values.forEach((value, i) => {
      const mesh = new THREE.Mesh(this.geo, this.faceMats);
      mesh.castShadow = true;
      const spread = (i - (values.length - 1) / 2) * 0.9;
      const pos = new THREE.Vector3(-HALF_W + 0.6 + Math.random() * 0.5, 2.4 + Math.random() * 0.8, spread * 0.8 + (Math.random() - 0.5) * 0.4);
      const vel = new THREE.Vector3(6 + Math.random() * 4, -1 - Math.random() * 2, (Math.random() - 0.5) * 3);
      const spin = new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30);
      mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
      mesh.position.copy(pos);
      this.scene.add(mesh);
      this.dice.push({ mesh, pos, vel, spin, value, settle: null, bounces: 0, resting: false });
    });
    if (!this.ensure()) { this.finish(); return; }
    this.last = performance.now();
    const start = this.last;
    cancelAnimationFrame(this.raf);
    const loop = (now: number) => {
      // Never more than a few seconds, however the bounces go.
      if (now - start > 4500) { this.skip(); return; }
      const dt = Math.min(1 / 30, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.draw();
      if (this.rolling) this.raf = requestAnimationFrame(loop);
      else this.finish();
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Land every die on its number now. */
  skip(): void {
    if (!this.rolling) return;
    cancelAnimationFrame(this.raf);
    this.dice.forEach((d, i) => {
      d.pos.set(-1.2 + i * 0.95 + (Math.random() - 0.5) * 0.2, R, (Math.random() - 0.5) * 0.8);
      d.mesh.position.copy(d.pos);
      d.mesh.quaternion.copy(this.faceUp(d.value, d.mesh.quaternion));
      d.resting = true;
    });
    this.draw();
    this.finish();
  }

  /** Grey out these dice (the lowest, dropped). */
  dim(indices: number[]): void {
    this.dice.forEach((d, i) => { d.mesh.material = indices.includes(i) ? this.dimMats : this.faceMats; });
    this.draw();
  }

  clear(): void {
    cancelAnimationFrame(this.raf);
    for (const d of this.dice) this.scene.remove(d.mesh);
    this.dice = [];
    this.onDone = null;
  }

  /** Draw the table as it is (after the canvas is shown or resized). */
  draw(): void {
    if (this.ensure()) this.renderer!.render(this.scene, this.camera);
  }

  dispose(): void {
    this.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }

  private finish(): void {
    const cb = this.onDone;
    this.onDone = null;
    cb?.(this.dice.map((d) => d.value));
  }

  /** The resting turn that shows `value` on top, as close as possible to `q` (so it doesn't spin round to get there). */
  private faceUp(value: number, q: THREE.Quaternion): THREE.Quaternion {
    const n = FACE_NORMALS[FACE_VALUES.indexOf(value)];
    const align = new THREE.Quaternion().setFromUnitVectors(n, UP);
    let best = align, bestDot = -2;
    for (let k = 0; k < 8; k++) {
      const c = new THREE.Quaternion().setFromAxisAngle(UP, (k / 8) * Math.PI * 2).multiply(align);
      const d = Math.abs(c.dot(q));
      if (d > bestDot) { bestDot = d; best = c; }
    }
    return best;
  }

  private step(dt: number): void {
    // Smaller steps keep bounces steady.
    const n = 3, h = dt / n;
    for (let s = 0; s < n; s++) {
      for (const d of this.dice) {
        if (d.resting) continue;
        if (d.settle) {
          d.settle.t = Math.min(1, d.settle.t + h / 0.35);
          const e = 1 - Math.pow(1 - d.settle.t, 3);
          d.mesh.quaternion.slerpQuaternions(d.settle.from, d.settle.to, e);
          d.vel.x *= Math.pow(0.04, h); d.vel.z *= Math.pow(0.04, h);
        } else {
          const w = d.spin.length();
          if (w > 0.001) d.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(d.spin.clone().divideScalar(w), w * h));
        }
        d.vel.y += GRAVITY * h;
        d.pos.addScaledVector(d.vel, h);
        // The felt.
        if (d.pos.y < R) {
          d.pos.y = R;
          if (d.vel.y < 0) {
            d.bounces++;
            d.vel.y = -d.vel.y * 0.42;
            d.vel.x *= 0.72; d.vel.z *= 0.72;
            d.spin.multiplyScalar(0.62);
            // Slow enough: ease onto its face.
            if (!d.settle && (d.bounces >= 3 || d.vel.y < 2.2)) d.settle = { from: d.mesh.quaternion.clone(), to: this.faceUp(d.value, d.mesh.quaternion), t: 0 };
            if (d.vel.y < 0.4) d.vel.y = 0;
          }
        }
        // The rim.
        const lx = HALF_W - R, lz = HALF_D - R;
        if (d.pos.x > lx) { d.pos.x = lx; d.vel.x = -Math.abs(d.vel.x) * 0.55; d.spin.y += d.vel.z * 2; }
        if (d.pos.x < -lx) { d.pos.x = -lx; d.vel.x = Math.abs(d.vel.x) * 0.55; }
        if (d.pos.z > lz) { d.pos.z = lz; d.vel.z = -Math.abs(d.vel.z) * 0.55; d.spin.x += d.vel.x; }
        if (d.pos.z < -lz) { d.pos.z = -lz; d.vel.z = Math.abs(d.vel.z) * 0.55; }
      }
      // Dice knock into each other (as spheres, which is plenty at this size).
      for (let i = 0; i < this.dice.length; i++) for (let j = i + 1; j < this.dice.length; j++) {
        const a = this.dice[i], b = this.dice[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dist = Math.hypot(dx, dz), min = SIZE * 1.12;
        if (dist > 0.0001 && dist < min && Math.abs(a.pos.y - b.pos.y) < SIZE) {
          const nx = dx / dist, nz = dz / dist, push = (min - dist) / 2;
          if (!a.resting) { a.pos.x -= nx * push; a.pos.z -= nz * push; }
          if (!b.resting) { b.pos.x += nx * push; b.pos.z += nz * push; }
          const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
          if (rel < 0) {
            const imp = -rel * 0.8;
            a.vel.x -= nx * imp; a.vel.z -= nz * imp; b.vel.x += nx * imp; b.vel.z += nz * imp;
            a.spin.y += imp * 3; b.spin.y -= imp * 3;
          }
        }
      }
      for (const d of this.dice) {
        if (d.resting) continue;
        d.mesh.position.copy(d.pos);
        if (d.settle && d.settle.t >= 1 && d.pos.y <= R + 0.001 && d.vel.y === 0 && Math.hypot(d.vel.x, d.vel.z) < 0.15) d.resting = true;
      }
    }
  }
}
