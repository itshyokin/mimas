/**
 * 3D props: a GLB (or FBX) model read from its file, baked into one mesh that stands on the prop grid.
 *
 * A model is flattened (every part's transform applied, all parts merged into one geometry with a material per
 * part), turned to face the way it was set, and scaled evenly to fit its footprint (width × depth tiles). It stands
 * on y = 0 with its front edge on z = 0 and its back reaching north to z = -depth, centred left to right: the same
 * place a flat prop's picture stands, so the map, the footprint and the collision line up. One mesh means the game
 * draws every copy of it in one go (instanced) and cuts, breaks and hides it like any other prop.
 */
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { mergeBufferGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type ModelExt = 'glb' | 'fbx';

/** A model file's kind from its name (null: not one we read). */
export function modelExt(name: string): ModelExt | null {
  const m = /\.(glb|fbx)$/i.exec(name);
  return m ? (m[1].toLowerCase() as ModelExt) : null;
}

/** Read a model file into a scene graph. Throws when it can't be read. */
export async function parseModel(buf: ArrayBuffer, ext: ModelExt): Promise<THREE.Object3D> {
  if (ext === 'fbx') return new FBXLoader().parse(buf, '');
  // Update 158: compressed models: Meshopt (gltf-transform; its decoder is built in) and Draco (Blender's own
  // "Compression" export option; its decoder is read from the project's draco/ folder when a model needs it).
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (usesDraco(buf)) loader.setDRACOLoader(draco());
  const gltf = await loader.parseAsync(buf, '');
  return gltf.scene;
}

let dracoLoader: DRACOLoader | null = null;
function draco(): DRACOLoader {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(new URL('draco/', document.baseURI).href);
  }
  return dracoLoader;
}
/** Does a GLB's description mention Draco compression? (The JSON chunk is at the start of the file.) */
function usesDraco(buf: ArrayBuffer): boolean {
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 65536));
  return new TextDecoder().decode(head).includes('KHR_draco_mesh_compression');
}

export interface BakeOpts {
  /** Footprint in tiles: the model is scaled evenly to fit inside it. */
  w: number;
  d: number;
  /** Turned this many degrees (0, 90, 180, 270) about the vertical, before fitting. */
  rot?: number;
  /** Crisp texture pixels (nearest filtering), for low-res textures. */
  sharp?: boolean;
}

export interface BakedModel {
  geometry: THREE.BufferGeometry;
  materials: THREE.MeshStandardMaterial[];
  /** Its height in tiles once fitted. */
  height: number;
  /** Its size in tiles once fitted (≤ the footprint). */
  width: number;
  depth: number;
}

/** A model's natural size (its own units), after turning: for guessing a footprint. */
export function modelSize(obj: THREE.Object3D, rot = 0): THREE.Vector3 {
  const g = new THREE.Group();
  const c = obj.clone(true);
  c.rotation.y = THREE.MathUtils.degToRad(-rot);
  g.add(c);
  g.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
}

/** Any lit material as a standard one (FBX gives Phong / Lambert), keeping its colour, texture and transparency. */
function standard(m: THREE.Material, sharp: boolean, vertexColors: boolean): THREE.MeshStandardMaterial {
  const src = m as THREE.MeshStandardMaterial & { shininess?: number };
  const out = new THREE.MeshStandardMaterial({
    color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
    map: src.map ?? null,
    roughness: m instanceof THREE.MeshStandardMaterial ? Math.max(0.55, src.roughness) : 0.85,
    metalness: m instanceof THREE.MeshStandardMaterial ? Math.min(0.3, src.metalness) : 0,
    transparent: m.transparent && m.opacity < 0.99,
    opacity: m.opacity,
    alphaTest: m.alphaTest || (src.map && m.transparent ? 0.5 : 0),
    side: m.side,
    vertexColors,
  });
  if (src.emissive && (src.emissive.r || src.emissive.g || src.emissive.b)) { out.emissive = src.emissive.clone(); out.emissiveMap = src.emissiveMap ?? null; }
  if (out.map) {
    if (sharp) { out.map.magFilter = THREE.NearestFilter; out.map.minFilter = THREE.NearestMipmapNearestFilter; }
    out.map.needsUpdate = true;
  }
  out.name = m.name;
  return out;
}

/**
 * Bake a model for the prop grid (see the file comment). Parts without normals get them worked out; parts without
 * texture coordinates or vertex colours get blank ones so every part merges.
 */
export function bakeModel(obj: THREE.Object3D, o: BakeOpts): BakedModel {
  const root = new THREE.Group();
  const c = obj.clone(true);
  c.rotation.y = THREE.MathUtils.degToRad(-(o.rot ?? 0));
  root.add(c);
  root.updateMatrixWorld(true);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = [];
  root.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    let geo = mesh.geometry.clone();
    // Skinned or not, the model is used as it stands (its bind pose).
    geo.applyMatrix4(mesh.matrixWorld);
    if (geo.index) geo = geo.toNonIndexed();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (Array.isArray(mesh.material) && geo.groups.length) {
      // One part per material group.
      for (const g of geo.groups) {
        const sub = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(geo.attributes)) {
          const a = attr as THREE.BufferAttribute, n2 = a.itemSize;
          const count = Math.min(g.count, a.count - g.start);
          sub.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).slice(g.start * n2, (g.start + count) * n2), n2, a.normalized));
        }
        parts.push({ geo: sub, mat: mats[g.materialIndex ?? 0] ?? mats[0] });
      }
    } else parts.push({ geo, mat: mats[0] });
  });
  if (!parts.length) throw new Error('The model has no meshes.');
  const hasColor = parts.some((p) => p.geo.attributes.color);
  for (const p of parts) {
    const g = p.geo, n = g.attributes.position.count;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (hasColor) {
      const col = g.attributes.color as THREE.BufferAttribute | undefined;
      if (!col) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      else if (col.itemSize !== 3 || col.normalized || !(col.array instanceof Float32Array)) {
        const out = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { out[i * 3] = col.getX(i); out[i * 3 + 1] = col.getY(i); out[i * 3 + 2] = col.getZ(i); }
        g.setAttribute('color', new THREE.Float32BufferAttribute(out, 3));
      }
    }
    for (const name of ['position', 'normal', 'uv'] as const) {
      const a = g.attributes[name] as THREE.BufferAttribute;
      if (a.normalized || !(a.array instanceof Float32Array)) {
        const out = new Float32Array(a.count * a.itemSize);
        const get = [a.getX, a.getY, a.getZ, a.getW];
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = get[k].call(a, i);
        g.setAttribute(name, new THREE.Float32BufferAttribute(out, a.itemSize));
      }
    }
  }
  // Parts sharing a material are drawn together.
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const p of parts) { const l = byMat.get(p.mat) ?? []; l.push(p.geo); byMat.set(p.mat, l); }
  const geos: THREE.BufferGeometry[] = [], materials: THREE.MeshStandardMaterial[] = [];
  for (const [mat, list] of byMat) {
    const merged = list.length === 1 ? list[0] : mergeBufferGeometries(list, false);
    if (!merged) continue;
    geos.push(merged);
    materials.push(standard(mat, !!o.sharp, hasColor));
  }
  const geometry = geos.length === 1 ? geos[0] : mergeBufferGeometries(geos, true);
  if (!geometry) throw new Error('The model’s parts couldn’t be joined.');
  if (geos.length === 1) { geometry.clearGroups(); geometry.addGroup(0, geometry.attributes.position.count, 0); }
  // Fit: evenly scaled into the footprint, standing on y = 0, front edge on z = 0, centred left to right.
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!, size = b.getSize(new THREE.Vector3());
  const k = Math.min(o.w / Math.max(1e-6, size.x), o.d / Math.max(1e-6, size.z));
  geometry.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geometry.scale(k, k, k);
  geometry.translate(0, 0, -o.d / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, materials, height: size.y * k, width: size.x * k, depth: size.z * k };
}

let thumbRenderer: THREE.WebGLRenderer | null = null;

/**
 * A picture of a baked model as the map camera sees it (from the front, looking down), on a transparent
 * background: the prop's palette icon and its stand-in wherever a picture is needed. `w` tiles wide, `ppt` pixels
 * per tile; as tall as the model looks.
 */
export function modelThumbnail(m: BakedModel, w: number, ppt = 48): HTMLCanvasElement {
  // Seen from in front and a little above (like the game's camera): the frame is as tall as the model looks.
  const dir = new THREE.Vector3(0, 0.45, 1).normalize(), sin = dir.y, cos = Math.sqrt(1 - sin * sin);
  const h = Math.max(0.25, m.height * cos + m.depth * sin) * 1.04;
  const W = Math.max(16, Math.round(w * ppt)), H = Math.max(16, Math.round(h * ppt));
  thumbRenderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  const r = thumbRenderer;
  r.setPixelRatio(1);
  r.setSize(W, H, false);
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(-2, 5, 4);
  scene.add(sun);
  scene.add(new THREE.Mesh(m.geometry, m.materials));
  const mid = new THREE.Vector3(0, m.height / 2, -m.depth / 2);
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.01, 200);
  cam.position.copy(mid).addScaledVector(dir, 50);
  cam.lookAt(mid);
  r.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d')!.drawImage(r.domElement, 0, 0);
  return out;
}
