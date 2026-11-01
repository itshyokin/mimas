/**
 * Ripples: soft white rings spreading on the water around whoever is in it (the hero swimming or wading, party
 * members swimming). Moving makes them come faster. A small pool of flat rings, reused.
 */
import * as THREE from 'three';

const MAX = 64;
const LIFE = 1.3;

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 18, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  r.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Ring { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; size: number; strength: number }

export class Ripples {
  private readonly rings: Ring[] = [];
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly texture = ringTexture();
  private next = 0;
  /** Seconds until the next ring, per swimmer (keyed by anything stable: the hero, an ally). */
  private readonly timers = new Map<object, number>();

  constructor(private readonly parent: THREE.Object3D) {
    for (let i = 0; i < MAX; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, opacity: 0 });
      const mesh = new THREE.Mesh(this.geometry, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      parent.add(mesh);
      this.rings.push({ mesh, mat, t: LIFE, size: 1, strength: 0 });
    }
  }

  /** A ring at (x, surface y, z). */
  spawn(x: number, y: number, z: number, size = 1, strength = 0.5, color = 0xffffff): void {
    const r = this.rings[this.next];
    this.next = (this.next + 1) % MAX;
    r.t = 0; r.size = size; r.strength = strength;
    r.mat.color.setHex(color);
    r.mesh.position.set(x, y + 0.02, z);
    r.mesh.visible = true;
  }

  /**
   * Someone in the water this frame: rings come every so often (faster when moving). `deep`: swimming (bigger,
   * brighter rings) rather than wading.
   */
  swimmer(key: object, x: number, y: number, z: number, moving: boolean, deep: boolean, dt: number, color = 0xffffff): void {
    let t = (this.timers.get(key) ?? 0) - dt;
    if (t <= 0) {
      if (deep || moving) this.spawn(x, y, z, deep ? 1.15 : 0.8, deep ? 0.7 : 0.45, color);
      t = moving ? 0.32 : 0.95;
    }
    this.timers.set(key, t);
  }

  /** Something standing in the water (a rock, a fallen trunk): a slow, faint ring every couple of seconds. */
  still(key: object, x: number, y: number, z: number, size: number, dt: number, color = 0xffffff): void {
    let t = (this.timers.get(key) ?? Math.random() * 2) - dt;
    if (t <= 0) { this.spawn(x, y, z, size, 0.38, color); t = 1.6 + Math.random() * 1.4; }
    this.timers.set(key, t);
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const k = r.t / LIFE;
      if (k >= 1) { r.mesh.visible = false; continue; }
      const s = r.size * (0.35 + 1.1 * Math.sqrt(k));
      r.mesh.scale.set(s, s, 1);
      r.mat.opacity = r.strength * (1 - k) * Math.min(1, k * 8);
    }
  }

  dispose(): void {
    for (const r of this.rings) { this.parent.remove(r.mesh); r.mat.dispose(); }
    this.geometry.dispose();
    this.texture.dispose();
  }
}
