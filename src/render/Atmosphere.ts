/**
 * Atmosphere: low ground mist and shafts of sunlight.
 *
 * Mist is a few dozen soft sheets lying just above the ground around the camera, drifting slowly with the wind;
 * sprites stand up through it, so it veils their feet. Its colour follows the sky (pale by day, blue-dark at night).
 *
 * Sun rays are long faint beams slanting down along the sun's direction, added on top (additive light). Each beam
 * slowly brightens and fades on its own and moves somewhere new while unseen. They follow the sun's colour and
 * strength, so they're gold at dawn, white at noon and gone at night or under rain.
 */
import * as THREE from 'three';
import { wind } from './wind';

/** The area around the camera's target that holds the mist and the rays. */
const BOX = { x: 30, z: 24 };
const MIST_COUNT = 46;
const RAY_COUNT = 9;

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

let puffTex: THREE.Texture | null = null;
/** A soft, lumpy cloud: a few overlapping radial blobs, faded to nothing at the edge. */
function puff(): THREE.Texture {
  return (puffTex ??= canvasTex(128, (g, s) => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9; i++) {
      const x = s * (0.3 + rnd() * 0.4), y = s * (0.3 + rnd() * 0.4), r = s * (0.18 + rnd() * 0.17);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }
    // Fade the square's edge so no sheet ever shows a corner.
    const img = g.getImageData(0, 0, s, s), d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const r = Math.hypot(x - s / 2, y - s / 2) / (s / 2);
      d[(y * s + x) * 4 + 3] *= Math.max(0, Math.min(1, (1 - r) * 2.2));
    }
    g.putImageData(img, 0, 0);
  }));
}

let rayTex: THREE.Texture | null = null;
/** A beam: bright along the middle, soft at the sides, fading away towards both ends (more towards the ground). */
function beam(): THREE.Texture {
  return (rayTex ??= canvasTex(64, (g, s) => {
    const img = g.createImageData(s, s), d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const u = x / (s - 1), v = y / (s - 1); // v = 0 at the top (sky end)
      const across = Math.pow(Math.sin(Math.PI * u), 2.2);
      const along = Math.min(1, v * 5) * Math.pow(1 - v, 1.4);
      const k = (y * s + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = Math.round(255 * across * along);
    }
    g.putImageData(img, 0, 0);
  }));
}

interface Puff { x: number; z: number; size: number; spin: number; drift: number; seed: number }
interface Ray { x: number; z: number; width: number; phase: number; speed: number; level: number }

export interface AtmosphereLook {
  /** 0 … 1 (more is thicker). */
  mist: number;
  rays: number;
  /** The sky's colour now (fog colour), the sun's colour and how strong the sun is (0 … 1, after weather). */
  skyColor: THREE.Color;
  sunColor: THREE.Color;
  sun: number;
  /** Direction towards the sun (unit). */
  sunDir: THREE.Vector3;
}

export class Atmosphere {
  private group: THREE.Group | null = null;
  private mistMesh: THREE.InstancedMesh | null = null;
  private mistMat: THREE.MeshBasicMaterial | null = null;
  private rayMeshes: THREE.Mesh[] = [];
  private rayMat: THREE.MeshBasicMaterial | null = null;
  private puffs: Puff[] = [];
  private rays: Ray[] = [];
  private mistLevel = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly basis = new THREE.Matrix4();
  private readonly tmpColor = new THREE.Color();

  /** A new map: everything is placed fresh around `center`. */
  attach(parent: THREE.Object3D, center: THREE.Vector3): void {
    this.dispose();
    const g = (this.group = new THREE.Group());
    g.name = 'atmosphere';
    parent.add(g);
    // Mist: one instanced mesh, every sheet lying flat.
    this.mistMat = new THREE.MeshBasicMaterial({ map: puff(), transparent: true, opacity: 0, depthWrite: false, fog: true, color: 0xffffff });
    this.mistMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.mistMat, MIST_COUNT);
    this.mistMesh.frustumCulled = false;
    this.mistMesh.renderOrder = 4;
    this.mistMesh.visible = false;
    g.add(this.mistMesh);
    this.puffs = Array.from({ length: MIST_COUNT }, (_, i) => ({
      x: center.x + (Math.random() - 0.5) * BOX.x, z: center.z + (Math.random() - 0.5) * BOX.z,
      size: 3 + Math.random() * 4, spin: Math.random() * Math.PI * 2, drift: 0.5 + Math.random() * 0.8, seed: i * 1.37,
    }));
    // Rays: a few beams, each its own mesh (they move independently and are few).
    this.rayMat = new THREE.MeshBasicMaterial({ map: beam(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1, 1);
    this.rays = [];
    this.rayMeshes = [];
    for (let i = 0; i < RAY_COUNT; i++) {
      const mat = this.rayMat.clone();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      mesh.visible = false;
      g.add(mesh);
      this.rayMeshes.push(mesh);
      this.rays.push(this.newRay(center, Math.random()));
    }
  }

  private newRay(center: THREE.Vector3, phase = 0): Ray {
    return { x: center.x + (Math.random() - 0.5) * BOX.x * 0.8, z: center.z + (Math.random() - 0.5) * BOX.z * 0.8, width: 1.4 + Math.random() * 2.8, phase, speed: 0.04 + Math.random() * 0.05, level: 0 };
  }

  update(dt: number, center: THREE.Vector3, time: number, ground: (x: number, z: number) => number, look: AtmosphereLook, camera: THREE.Camera): void {
    if (!this.group || !this.mistMesh || !this.mistMat) return;
    this.updateMist(dt, center, time, ground, look);
    this.updateRays(dt, center, ground, look, camera);
  }

  private updateMist(dt: number, center: THREE.Vector3, time: number, ground: (x: number, z: number) => number, look: AtmosphereLook): void {
    const mesh = this.mistMesh!, mat = this.mistMat!;
    this.mistLevel += (look.mist - this.mistLevel) * Math.min(1, dt * 0.5);
    const on = this.mistLevel > 0.005;
    mesh.visible = on;
    if (!on) return;
    mat.opacity = Math.min(1, this.mistLevel * 0.6);
    // Pale and lit by day; takes on the sky's colour (dark blue at night).
    mat.color.copy(look.skyColor).lerp(this.tmpColor.setRGB(1, 1, 1), 0.35 + 0.4 * look.sun);
    const hx = BOX.x / 2, hz = BOX.z / 2, ws = 0.15 + wind.strength;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      p.x += wind.dx * ws * p.drift * dt * 0.6 + Math.sin(time * 0.1 + p.seed) * dt * 0.05;
      p.z += wind.dz * ws * p.drift * dt * 0.6;
      p.spin += dt * 0.02 * (i % 2 ? 1 : -1);
      if (p.x < center.x - hx) p.x += BOX.x; else if (p.x > center.x + hx) p.x -= BOX.x;
      if (p.z < center.z - hz) p.z += BOX.z; else if (p.z > center.z + hz) p.z -= BOX.z;
      // Sits just above the highest ground under it (so slopes don't cut through it).
      const r = p.size * 0.3;
      const y = Math.max(ground(p.x, p.z), ground(p.x - r, p.z), ground(p.x + r, p.z), ground(p.x, p.z - r), ground(p.x, p.z + r)) + 0.12 + (i % 3) * 0.12;
      const breathe = 1 + 0.08 * Math.sin(time * 0.3 + p.seed);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), p.spin).multiply(this.flat);
      this.m.compose(this.v.set(p.x, y, p.z), this.q, this.s.set(p.size * breathe, p.size * breathe, 1));
      mesh.setMatrixAt(i, this.m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  private updateRays(dt: number, center: THREE.Vector3, ground: (x: number, z: number) => number, look: AtmosphereLook, camera: THREE.Camera): void {
    const strength = look.rays * look.sun;
    const up = look.sunDir, toCam = this.v.set(0, 0, 1).applyQuaternion(camera.quaternion);
    // The beam lies along the sun's direction and turns to face the camera as much as it can.
    const right = new THREE.Vector3().crossVectors(up, toCam);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
    right.normalize();
    const normal = new THREE.Vector3().crossVectors(right, up).normalize();
    this.basis.makeBasis(right, up, normal);
    this.q.setFromRotationMatrix(this.basis);
    const hx = BOX.x / 2, hz = BOX.z / 2, len = 16;
    for (let i = 0; i < this.rays.length; i++) {
      const r = this.rays[i], mesh = this.rayMeshes[i], mat = mesh.material as THREE.MeshBasicMaterial;
      r.phase += dt * r.speed;
      if (r.phase >= 1) { Object.assign(r, this.newRay(center)); r.phase = 0; }
      // Fade in, hold, fade out over its life; a new beam somewhere else once it's gone.
      const life = Math.sin(Math.PI * r.phase);
      r.level = life * life;
      const a = strength * r.level * 0.5;
      // Off-screen beams (the camera moved on) start over in view.
      if (r.x < center.x - hx || r.x > center.x + hx || r.z < center.z - hz || r.z > center.z + hz) { Object.assign(r, this.newRay(center)); r.phase = 0; }
      mesh.visible = a > 0.003;
      if (!mesh.visible) continue;
      mat.opacity = a;
      mat.color.copy(look.sunColor);
      // The beam's foot is on the ground; it reaches up towards the sun.
      const gy = ground(r.x, r.z);
      mesh.position.set(r.x + up.x * len * 0.45, gy + up.y * len * 0.45, r.z + up.z * len * 0.45);
      mesh.quaternion.copy(this.q);
      mesh.scale.set(r.width, len, 1);
    }
  }

  dispose(): void {
    if (!this.group) return;
    this.group.removeFromParent();
    this.mistMesh?.geometry.dispose();
    this.mistMat?.dispose();
    for (const m of this.rayMeshes) (m.material as THREE.Material).dispose();
    this.rayMeshes[0]?.geometry.dispose();
    this.rayMat?.dispose();
    this.group = null; this.mistMesh = null; this.mistMat = null; this.rayMat = null;
    this.rayMeshes = []; this.rays = []; this.puffs = [];
  }
}
