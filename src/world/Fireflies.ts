/** Night-time fireflies drifting over the map. */
import * as THREE from 'three';
import { softDot } from '../art/placeholderArt';
import { clamp } from '../core/math';
import type { TileMap } from './TileMap';

const COUNT = 70;

export class Fireflies {
  private readonly base = new Float32Array(COUNT * 3);
  private readonly pos = new Float32Array(COUNT * 3);
  private readonly points: THREE.Points;
  private readonly mat: THREE.PointsMaterial;

  constructor(scene: THREE.Object3D, map: TileMap) {
    for (let i = 0; i < COUNT; i++) {
      let x = 0, z = 0;
      x = Math.random() * map.w; z = Math.random() * map.h;
      this.base[i * 3] = x;
      // Over water, float above its surface rather than the lake bed.
      this.base[i * 3 + 1] = 0.4 + Math.random() * 1.3 + map.standY(x, z);
      this.base[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(softDot()), size: 0.14, color: new THREE.Color(2.2, 3.2, 0.9),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(time: number, night: number): void {
    this.mat.opacity = clamp((night - 0.3) / 0.5, 0, 1);
    this.points.visible = this.mat.opacity > 0.01;
    if (!this.points.visible) return;
    for (let i = 0; i < COUNT; i++) {
      const s = i * 1.7;
      this.pos[i * 3] = this.base[i * 3] + Math.sin(time * 0.4 + s) * 0.8;
      this.pos[i * 3 + 1] = this.base[i * 3 + 1] + Math.sin(time * 0.9 + s * 2) * 0.25;
      this.pos[i * 3 + 2] = this.base[i * 3 + 2] + Math.cos(time * 0.33 + s) * 0.8;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.mat.size = 0.14 * (0.75 + 0.25 * Math.sin(time * 2));
  }
}
