/** Short particle puffs: leaves when something is cut, sparks on a hit, embers from a firebolt. */
import * as THREE from 'three';
import { linearColor } from './textures';

interface Burst { pts: THREE.Points; vel: [number, number, number][]; t: number; life: number; gravity: number }

export class Bursts {
  private readonly list: Burst[] = [];
  private parent: THREE.Object3D | null = null;

  /** Where new bursts go (the current map's group). Old ones are dropped. */
  attach(parent: THREE.Object3D): void { this.clear(); this.parent = parent; }

  spawn(x: number, y: number, z: number, o: { color: string; n?: number; speed?: number; up?: number; life?: number; size?: number; gravity?: number; additive?: boolean }): void {
    if (!this.parent) return;
    const n = o.n ?? 16, pos = new Float32Array(n * 3), vel: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      pos.set([x, y, z], i * 3);
      const a = Math.random() * Math.PI * 2, s = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      vel.push([Math.cos(a) * s, (o.up ?? 2) * (0.5 + Math.random()), Math.sin(a) * s * 0.7]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: linearColor(o.color), size: o.size ?? 0.1, transparent: true, opacity: 1, depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pts = new THREE.Points(geo, mat);
    this.parent.add(pts);
    this.list.push({ pts, vel, t: 0, life: o.life ?? 0.7, gravity: o.gravity ?? 9 });
  }

  update(dt: number): void {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const b = this.list[k];
      b.t += dt;
      const attr = b.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      b.vel.forEach((v, i) => {
        v[1] -= b.gravity * dt;
        attr.setXYZ(i, attr.getX(i) + v[0] * dt, attr.getY(i) + v[1] * dt, attr.getZ(i) + v[2] * dt);
      });
      attr.needsUpdate = true;
      (b.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - b.t / b.life);
      if (b.t > b.life) { this.dispose(b); this.list.splice(k, 1); }
    }
  }

  clear(): void { for (const b of this.list) this.dispose(b); this.list.length = 0; }

  private dispose(b: Burst): void {
    b.pts.removeFromParent();
    b.pts.geometry.dispose();
    (b.pts.material as THREE.Material).dispose();
  }
}
