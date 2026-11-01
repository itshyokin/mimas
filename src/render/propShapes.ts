/**
 * Prop shapes beyond the flat card:
 *  - Solid: the picture's outline pushed back into the footprint (like a pixel-art item given thickness). The top and
 *    sides take the edge pixels, stretched back, so a crate or a rock reads as a block from the game's camera.
 *  - Cross ×: two copies of the picture crossing at 45° (bushes, trees, grass: they look full from any side).
 *  - Cross +: the picture plus a copy turned side-on through its middle (mostly for fuller shadows).
 *  - Star ✳, Rows ≡ and Thicket: tall grass and thick plants (three crossing copies; three staggered rows; rows of V's).
 * All share the card's texture and material; only the geometry differs, built once per prop type.
 */
import * as THREE from 'three';
import type { PropDef } from '../world/types';

export type PropShape = NonNullable<PropDef['shape']>;

/** How deep a prop's rows spread: its footprint's depth, or a third of a tile. */
const d0 = (d: PropDef): number => Math.max(0.2, Math.min(0.8, d.foot ? d.foot.d : 0.6));

/** Opaque pixels of an image (alpha at least half, the material's alpha cut). */
function alphaMask(img: HTMLCanvasElement): { w: number; h: number; on: (x: number, y: number) => boolean } {
  // Read from a copy (the original's context may not be set up for reading back).
  const { width: w, height: h } = img, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] >= 128 ? 1 : 0;
  return { w, h, on: (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1 };
}

class Builder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly uv: number[] = [];
  readonly idx: number[] = [];

  /** A quad (p0 p1 p2 p3 around its edge) facing `n`; its winding is fixed to match. */
  quad(p: number[][], uv: number[][], n: number[]): void {
    const a = p[0], b = p[1], c = p[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) { this.pos.push(...p[i]); this.nrm.push(...n); this.uv.push(...uv[i]); }
    if (flip) this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** The card: w × h tiles, bottom centre at the origin, facing the camera, at depth `z` and turned by `yaw`. */
function card(b: Builder, w: number, h: number, n: number[], z = 0, yaw = 0, cz = 0): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (x: number, y: number) => [x * c, y, cz + z - x * s];
  b.quad([at(-w / 2, 0), at(w / 2, 0), at(w / 2, h), at(-w / 2, h)], [[0, 0], [1, 0], [1, 1], [0, 1]], n);
}

/** A copy of the card for the grass shapes: placed (dx, depth z), turned by yaw, scaled, maybe mirrored. */
function copy(b: Builder, w: number, h: number, N: number[], o: { x?: number; z?: number; yaw?: number; scale?: number; mirror?: boolean }): void {
  const yaw = o.yaw ?? 0, k = o.scale ?? 1, c = Math.cos(yaw), s = Math.sin(yaw), cw = w * k, ch = h * k;
  const n = new THREE.Vector3(...N).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const at = (x: number, y: number) => [(o.x ?? 0) + x * c, y, (o.z ?? 0) - x * s];
  const u0 = o.mirror ? 1 : 0, u1 = o.mirror ? 0 : 1;
  b.quad([at(-cw / 2, 0), at(cw / 2, 0), at(cw / 2, ch), at(-cw / 2, ch)], [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], [n.x, n.y, n.z]);
}

/**
 * The geometry for a prop's shape. `cardNormal` is the flat sprite's lighting normal (tilted up toward the camera).
 * `center`: depth of the footprint's middle (crosses turn about it), negative = back from the front edge.
 */
export function shapeGeometry(img: HTMLCanvasElement, d: PropDef, cardNormal: THREE.Vector3): THREE.BufferGeometry | null {
  const shape = d.shape ?? 'flat';
  if (shape === 'flat') return null;
  const w = d.w, h = d.h, b = new Builder(), N = [cardNormal.x, cardNormal.y, cardNormal.z];
  const center = d.foot ? -d.foot.d / 2 : 0;
  if (shape === 'crossX') {
    for (const yaw of [Math.PI / 4, -Math.PI / 4]) {
      const n = new THREE.Vector3(...N).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      card(b, w, h, [n.x, n.y, n.z], 0, yaw, center);
    }
    return b.geometry();
  }
  // Tall grass and thick plants.
  if (shape === 'crossStar') {
    // Cross × with a third copy facing the camera through the middle (✳ from above).
    for (const yaw of [Math.PI / 4, -Math.PI / 4]) copy(b, w, h, N, { z: center, yaw, mirror: yaw < 0 });
    copy(b, w, h, N, { z: center });
    return b.geometry();
  }
  if (shape === 'rows') {
    // Three rows one behind another, each a little offset, sized and mirrored: a thick, layered clump.
    const dep = d0(d);
    copy(b, w, h, N, { x: -0.08 * w, z: center - dep * 0.33, scale: 0.92, mirror: true });
    copy(b, w, h, N, { x: 0.06 * w, z: center, scale: 1 });
    copy(b, w, h, N, { x: -0.03 * w, z: center + dep * 0.33, scale: 0.86, mirror: true });
    return b.geometry();
  }
  if (shape === 'thicket') {
    // Rows of shallow V's (each pair turned ±25°): layered from the front, still full from the side.
    const dep = d0(d), ROWS: [number, number, number][] = [[-0.33, -0.06, 0.9], [0, 0.05, 1], [0.33, -0.02, 0.84]];
    ROWS.forEach(([dz, dx, k], i) => {
      for (const yaw of [0.44, -0.44]) copy(b, w, h, N, { x: dx * w, z: center + dz * dep, yaw, scale: k * (yaw > 0 ? 1 : 0.94), mirror: (i + (yaw > 0 ? 0 : 1)) % 2 === 1 });
    });
    return b.geometry();
  }
  if (shape === 'crossPlus') {
    card(b, w, h, N, 0, 0, center);
    const n = new THREE.Vector3(...N).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    // The side-on copy is as wide as the footprint is deep (or the picture, without one).
    const sw = d.foot ? d.foot.d : w;
    const c = Math.cos(Math.PI / 2), s = Math.sin(Math.PI / 2);
    const at = (x: number, y: number) => [x * c, y, center - x * s];
    b.quad([at(-sw / 2, 0), at(sw / 2, 0), at(sw / 2, h), at(-sw / 2, h)], [[0, 0], [1, 0], [1, 1], [0, 1]], [n.x, n.y, n.z]);
    return b.geometry();
  }
  // Solid: the outline pushed back by the thickness.
  const t = Math.max(0.02, d.thickness ?? (d.foot ? d.foot.d : 1));
  const m = alphaMask(img), sx = w / m.w, sy = h / m.h;
  const X = (i: number) => -w / 2 + i * sx, Y = (j: number) => h - j * sy;
  const U = (i: number) => i / m.w, V = (j: number) => 1 - j / m.h;
  card(b, w, h, N);
  // Top edges: rows of opaque pixels with nothing above, as strips running back.
  for (let j = 0; j < m.h; j++) {
    let i = 0;
    while (i < m.w) {
      if (!(m.on(i, j) && !m.on(i, j - 1))) { i++; continue; }
      const i0 = i; while (i < m.w && m.on(i, j) && !m.on(i, j - 1)) i++;
      // The colour one pixel in (pixel art's edge is its dark outline): stretched back, it reads as the surface.
      const y = Y(j), v = 1 - ((m.on(i0, j + 1) ? j + 1 : j) + 0.5) / m.h;
      b.quad([[X(i0), y, 0], [X(i), y, 0], [X(i), y, -t], [X(i0), y, -t]], [[U(i0), v], [U(i), v], [U(i), v], [U(i0), v]], [0, 1, 0]);
    }
  }
  // Undersides (overhangs: a tree's canopy over its trunk).
  for (let j = 0; j < m.h; j++) {
    let i = 0;
    while (i < m.w) {
      if (!(m.on(i, j) && !m.on(i, j + 1) && j + 1 < m.h)) { i++; continue; }
      const i0 = i; while (i < m.w && m.on(i, j) && !m.on(i, j + 1)) i++;
      const y = Y(j + 1), v = 1 - ((m.on(i0, j - 1) ? j - 1 : j) + 0.5) / m.h;
      b.quad([[X(i0), y, 0], [X(i), y, 0], [X(i), y, -t], [X(i0), y, -t]], [[U(i0), v], [U(i), v], [U(i), v], [U(i0), v]], [0, -1, 0]);
    }
  }
  // Left and right edges: columns of opaque pixels with nothing beside them.
  for (const side of [-1, 1]) {
    for (let i = 0; i < m.w; i++) {
      let j = 0;
      while (j < m.h) {
        if (!(m.on(i, j) && !m.on(i + side, j))) { j++; continue; }
        const j0 = j; while (j < m.h && m.on(i, j) && !m.on(i + side, j)) j++;
        const x = side < 0 ? X(i) : X(i + 1), u = ((m.on(i - side, j0) ? i - side : i) + 0.5) / m.w;
        b.quad([[x, Y(j0), 0], [x, Y(j), 0], [x, Y(j), -t], [x, Y(j0), -t]], [[u, V(j0)], [u, V(j)], [u, V(j)], [u, V(j0)]], [side, 0, 0]);
      }
    }
  }
  // The back: the picture again, so it's whole from behind and casts a full shadow.
  card(b, w, h, [0, 0, -1], -t);
  return b.geometry();
}
