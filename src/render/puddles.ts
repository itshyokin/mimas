/**
 * Puddles after rain (Update 123): shallow, glossy pools on flat outdoor ground (not sand, water or roofs), growing
 * while it rains and shrinking away as the ground dries over the next couple of game hours. Spots are picked once per
 * map from a hash of the tile, so the same puddles come back after each shower.
 */
import * as THREE from 'three';

export interface PuddleSpot { x: number; y: number; z: number; size: number; angle: number }

export class Puddles {
  private mesh: THREE.InstancedMesh | null = null;
  private spots: PuddleSpot[] = [];
  private shown = -1;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly mat = new THREE.MeshStandardMaterial({ color: 0x7d98bd, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });

  constructor(private readonly parent: THREE.Object3D) {
    // Soft rim: alpha falls off toward the edge.
    this.mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec2 vPd;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPd = position.xz * 2.0;');
      sh.fragmentShader = 'varying vec2 vPd;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(1.0, 0.7, length(vPd));');
    };
  }

  /** A new map: where its puddles go. */
  setSpots(spots: PuddleSpot[]): void {
    this.mesh?.removeFromParent();
    this.mesh?.geometry.dispose();
    this.mesh = null;
    this.spots = spots;
    this.shown = -1;
    if (!spots.length) return;
    const geo = new THREE.CircleGeometry(0.5, 18);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, spots.length);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.receiveShadow = true;
    this.mesh.visible = false;
    this.parent.add(this.mesh);
  }

  /** How wet the ground is (0 … 1): puddles grow with it and shrink away as it dries. */
  update(wet: number): void {
    const mesh = this.mesh;
    if (!mesh) return;
    const k = Math.max(0, Math.min(1, (wet - 0.12) / 0.6));
    const step = Math.round(k * 40);
    if (step === this.shown) return;
    this.shown = step;
    mesh.visible = k > 0.01;
    if (!mesh.visible) return;
    this.spots.forEach((p, i) => {
      // Smaller puddles dry up first.
      const r = p.size * Math.max(0, Math.min(1, k * 1.25 - (1 - p.size) * 0.4));
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), p.angle);
      this.m.compose(this.v.set(p.x, p.y + 0.01, p.z), this.q, this.s.set(Math.max(0.001, r * 1.6), 1, Math.max(0.001, r)));
      mesh.setMatrixAt(i, this.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.mat.opacity = 0.45 + 0.3 * k;
  }
}
