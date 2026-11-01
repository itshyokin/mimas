/**
 * Footprints (Update 123): soft prints pressed into snow, sand and other ground set to keep them, fading away over
 * half a minute (sooner while snow is falling: it fills them in). Hooves leave rounder prints. One instanced mesh of
 * small flat ovals lying on the ground; each print's fade is an instance attribute.
 */
import * as THREE from 'three';

const MAX = 320;

export class Footprints {
  readonly mesh: THREE.InstancedMesh;
  private readonly fade: THREE.InstancedBufferAttribute;
  private readonly life = new Float32Array(MAX);
  private readonly span = new Float32Array(MAX);
  private next = 0;
  private live = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();

  constructor(parent: THREE.Object3D) {
    // A soft-edged oval: a circle's alpha falling off toward the rim.
    const geo = new THREE.CircleGeometry(0.5, 14);
    geo.rotateX(-Math.PI / 2);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    geo.setAttribute('aFade', this.fade);
    const mat = new THREE.MeshBasicMaterial({ color: 0x141822, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float aFade;\nvarying float vFade;\nvarying vec2 vPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;\nvPos = position.xz * 2.0;');
      sh.fragmentShader = 'varying float vFade;\nvarying vec2 vPos;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= vFade * smoothstep(1.0, 0.45, length(vPos));');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
  }

  /** A print at (x, y, z) facing `angle` (radians, 0 = toward +z); `hoof`: a round hoof print. `seconds` until gone. */
  add(x: number, y: number, z: number, angle: number, hoof = false, seconds = 25): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.live = Math.min(MAX, this.live + 1);
    this.mesh.count = this.live;
    this.e.set(0, angle, 0);
    this.q.setFromEuler(this.e);
    this.s.set(hoof ? 0.24 : 0.15, 1, hoof ? 0.24 : 0.27);
    this.m.compose(this.v.set(x, y + 0.012, z), this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.life[i] = this.span[i] = seconds;
    this.fade.setX(i, 1);
    this.fade.needsUpdate = true;
  }

  /** Fade them; `fill` speeds it up (falling snow fills prints in). */
  update(dt: number, fill = 1): void {
    if (!this.live) return;
    let any = false;
    for (let i = 0; i < this.live; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt * fill);
      // Full for the first half, then fading out.
      this.fade.setX(i, Math.min(1, (this.life[i] / this.span[i]) * 2));
      any = true;
    }
    if (any) this.fade.needsUpdate = true;
  }

  /** A new map: none left. */
  clear(): void {
    this.life.fill(0);
    this.live = 0;
    this.next = 0;
    this.mesh.count = 0;
  }
}
