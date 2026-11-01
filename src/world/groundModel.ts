/**
 * 3D model maps (Update 153): a map whose ground and scenery are a 3D model (GLB or FBX) instead of painted tiles.
 * The model is fitted onto the map (its footprint over the map's tiles, its lowest point at height 0, unless a scale
 * is set) and sampled straight down at every tile corner and centre: the corners become the ground's heights (walked
 * on smoothly, like hills), and tiles that are too steep, have a wall or pillar through them, or have no ground at all
 * block. Events, props, lights and passage on the map's tiles work on top of it as on any map.
 */
import * as THREE from 'three';
import { modelExt, parseModel } from '../render/models';
import type { MapData } from './types';

export interface GroundModel {
  /** The fitted model, ready to add to a scene (clone it for more than one). */
  object: THREE.Object3D;
  /** Ground height at every tile corner, (w + 1) × (h + 1), in tiles. */
  field: Float32Array;
  /** 1 where a tile blocks. */
  blocked: Uint8Array;
}

/** A map's data with its ground model attached (at run time, never saved). */
export type WithGround = MapData & { __ground?: GroundModel };

/** How steep a tile's ground may be (height across it, in tiles) and how far a wall may rise above it. */
const STEEP = 0.8, WALL = 0.55;

const cache = new Map<string, Promise<THREE.Object3D>>();

/** Read a model file (once per address). */
export function readGroundModel(url: string, name: string): Promise<THREE.Object3D> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => parseModel(await (await fetch(url)).arrayBuffer(), modelExt(name) ?? 'glb'))();
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

/** Fit a model onto a map and sample its ground. */
export function fitGround(src: THREE.Object3D, data: MapData): GroundModel {
  const gm = data.groundModel!, W = data.width, H = data.height;
  const inner = src.clone(true);
  inner.rotation.y = ((gm.rot ?? 0) * Math.PI) / 180;
  const obj = new THREE.Group();
  obj.add(inner);
  obj.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = gm.scale ?? Math.min(W / Math.max(0.001, size.x), H / Math.max(0.001, size.z));
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(obj);
  // Its footprint's corner on the map's corner, its lowest point at the ground (plus any offset).
  obj.position.set(-box.min.x + (gm.x ?? 0), -box.min.y + (gm.y ?? 0), -box.min.z + (gm.z ?? 0));
  obj.updateMatrixWorld(true);
  obj.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  box = new THREE.Box3().setFromObject(obj);

  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), from = new THREE.Vector3(), top = box.max.y + 5;
  const meshes: THREE.Object3D[] = [];
  obj.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
  const sample = (x: number, z: number): number => {
    from.set(x, top, z);
    ray.set(from, down);
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit ? hit.point.y : NaN;
  };
  const field = new Float32Array((W + 1) * (H + 1));
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    // Corners: pulled in a hair so the map's outer edge still finds the model's edge.
    field[j * (W + 1) + i] = sample(Math.min(W - 0.02, Math.max(0.02, i)), Math.min(H - 0.02, Math.max(0.02, j)));
  }
  const blocked = new Uint8Array(W * H);
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const c = [field[z * (W + 1) + x], field[z * (W + 1) + x + 1], field[(z + 1) * (W + 1) + x + 1], field[(z + 1) * (W + 1) + x]];
    const mid = sample(x + 0.5, z + 0.5), ok = c.filter((v) => !Number.isNaN(v));
    if (Number.isNaN(mid) || ok.length < 4) { blocked[z * W + x] = 1; continue; }
    const lo = Math.min(...ok), hi = Math.max(...ok), avg = ok.reduce((a, b) => a + b, 0) / ok.length;
    if (hi - lo > STEEP || mid - avg > WALL) blocked[z * W + x] = 1;
  }
  // No ground at a corner: the nearest found height (so the slope doesn't plunge), the tile already blocks.
  for (let k = 0; k < field.length; k++) if (Number.isNaN(field[k])) field[k] = 0;
  return { object: obj, field, blocked };
}

/** Load and fit a map's ground model, from its file's address. */
export async function loadGround(data: MapData, url: string): Promise<GroundModel> {
  return fitGround(await readGroundModel(url, data.groundModel!.src), data);
}

/** A top-down picture of the fitted model for the editor's map, `ppt` pixels per tile. */
export function groundTopView(g: GroundModel, w: number, h: number, ppt: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ppt); canvas.height = Math.round(h * ppt);
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.outputEncoding = THREE.sRGBEncoding;
  const scene = new THREE.Scene();
  scene.add(g.object.clone(true), new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8); sun.position.set(-0.4, 1, -0.6); scene.add(sun);
  const box = new THREE.Box3().setFromObject(g.object);
  const cam = new THREE.OrthographicCamera(0, w, 0, -h, 0.1, box.max.y + 50);
  cam.position.set(0, box.max.y + 20, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0);
  // Looking straight down with north up: x right, z down the picture.
  cam.left = 0; cam.right = w; cam.top = 0; cam.bottom = -h; cam.updateProjectionMatrix();
  r.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  out.getContext('2d')!.drawImage(canvas, 0, 0);
  r.dispose();
  return out;
}
