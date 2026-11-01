/**
 * 3D maps (Update 154): a whole place modelled in Blender (a GLB), walked through in third person.
 *
 * The scene is read once, and names in it (on objects or their materials) say what things are, see
 * docs/BLENDER_3D_MAPS.md:
 *   _col        collision only (invisible). With any of these, only they collide; without, every visible mesh does.
 *   _nocol      seen, never collided with (grass, cobwebs).
 *   _nocam      collides, but the camera passes through it (leaves, thin poles).
 *   _foliage    (a material) sways in the wind.
 *   _water      a water surface: swum in, splashed into.
 *   _waterfall  falling water: its picture runs down, and it's heard.
 *   _killzone   falling into it puts the hero back on the last safe ground.
 *   start       (an empty, or an object) where the hero starts when nothing else says.
 *
 * The hero is a capsule pushed out of the collision mesh (three-mesh-bvh), so ramps, stairs, bridges and floors over
 * floors all work; gravity, jumping and swimming on top. The camera orbits the hero like World of Warcraft (or settles
 * behind them in Follow mode), never under the ground nor straight down, and comes in closer when a wall is between.
 */
import { patchSeason } from '../render/season';
import { patchAreaTint } from '../render/areaTint';
import * as THREE from 'three';
import { MeshBVH, type ExtendedTriangle } from 'three-mesh-bvh';
import { patchSwayModel } from '../render/wind';
import { modelExt, parseModel } from '../render/models';
import type { MapData } from '../world/types';

const GRAVITY = 22, JUMP = Math.sqrt(2 * GRAVITY * 0.9);
/** The hero's capsule: radius and height (tiles = metres). */
const RADIUS = 0.3, HEIGHT = 1.6;

export interface Scene3D {
  object: THREE.Object3D;
  collider: THREE.Mesh;
  /** What the camera can't pass through (the collision without the _nocam pieces). */
  camCollider: THREE.Mesh | null;
  waters: { box: THREE.Box3; y: number }[];
  falls: { mesh: THREE.Mesh; x: number; z: number; y: number; top: number }[];
  kills: THREE.Box3[];
  start: THREE.Vector3 | null;
  bounds: THREE.Box3;
  /** Update 156: boxes named trigger_… / encounter_… in Blender, offered as volumes in the editor. */
  volumes: { name: string; kind: 'trigger' | 'encounter'; x: number; y: number; z: number; sx: number; sy: number; sz: number; zone?: string }[];
}

/** A 3D map's data with its scene attached (at run time, never saved). */
export type With3D = MapData & { __scene3d?: Scene3D };

/** A name says a tag: "Rock_col", "col_rock", "rock.col" or a material "Leaves_foliage". */
const has = (name: string | undefined, tag: string): boolean => {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes(`_${tag}`) || n.startsWith(`${tag}_`) || n.endsWith(`.${tag}`) || n === tag;
};
const tagged = (o: THREE.Object3D, tag: string): boolean => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (has(p.name, tag)) return true;
  const m = (o as THREE.Mesh).material;
  return (Array.isArray(m) ? m : m ? [m] : []).some((x) => has(x.name, tag));
};

/** Every triangle of these meshes, in world space, as one mesh with a BVH for fast collision. */
function mergedCollider(meshes: THREE.Mesh[]): THREE.Mesh | null {
  const parts: Float32Array[] = [];
  let n = 0;
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const g = m.geometry, pos = g.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const idx = g.index, count = idx ? idx.count : pos.count, out = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
      out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
    }
    parts.push(out); n += out.length;
  }
  if (!n) return null;
  const all = new Float32Array(n);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
  (geo as THREE.BufferGeometry & { boundsTree?: MeshBVH }).boundsTree = new MeshBVH(geo);
  const mesh = new THREE.Mesh(geo);
  mesh.visible = false;
  return mesh;
}

/** A game tile's picture for a model's ter_… material (Update 160): its picture, tiles per repeat, crisp or smooth. */
export type TerrainPicture = (name: string) => { image: CanvasImageSource; span: number; point: boolean } | null;

/** The texture laid across the model from above (world x / z), one copy every `span` metres. */
function patchWorldUV<T extends THREE.Material>(mat: T, span: number): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
  #ifdef USE_UV
    vUv = (modelMatrix * vec4(position, 1.0)).xz / ${span.toFixed(3)};
  #endif`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `|worlduv${span}`;
  return mat;
}

/**
 * Seasons on a model's materials (Update 160): ter_<tile> becomes that game tile's picture (laid from above) and
 * changes with the seasons and weather like the 2D ground; _season keeps its own texture but changes too; _foliage
 * gets snow on its leaves in winter (and sways).
 */
function seasonal(m: THREE.Mesh, terrain: TerrainPicture | undefined, done: Map<string, THREE.Material>): void {
  const swap = (mt: THREE.Material): THREE.Material => {
    const hit = done.get(mt.uuid);
    if (hit) return hit;
    let out = mt;
    const ter = /^ter[_ ](.+?)(\.\d+)?$/i.exec(mt.name);
    const pic = ter && terrain ? terrain(ter[1]) : null;
    if (pic) {
      const tex = new THREE.CanvasTexture(pic.image as HTMLCanvasElement);
      tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (pic.point) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter; }
      out = patchSeason(patchAreaTint(patchWorldUV(new THREE.MeshStandardMaterial({ name: mt.name, map: tex, roughness: 1, metalness: 0, side: mt.side }), pic.span), false), 'ground');
    } else if (has(mt.name, 'season')) patchSeason(patchAreaTint(mt, false), 'ground');
    else if (has(mt.name, 'foliage')) patchSeason(patchAreaTint(mt, false), 'leaves');
    done.set(mt.uuid, out);
    return out;
  };
  m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
}

/** Read a Blender scene into a 3D map: sorted by its names, offset so its corner sits at the map's (0, 0). */
export function build3D(src: THREE.Object3D, scale = 1, terrain?: TerrainPicture): Scene3D {
  const swapped = new Map<string, THREE.Material>();
  const root = new THREE.Group();
  const obj = src.clone(true);
  obj.scale.multiplyScalar(scale);
  root.add(obj);
  root.updateMatrixWorld(true);
  // Its footprint's corner on the map's corner (so the map's tiles line up with it), its ground where it was modelled.
  const pre = new THREE.Box3().setFromObject(root);
  obj.position.x -= pre.min.x; obj.position.z -= pre.min.z;
  root.updateMatrixWorld(true);

  const cols: THREE.Mesh[] = [], solid: THREE.Mesh[] = [], nocam = new Set<THREE.Mesh>();
  const waters: Scene3D['waters'] = [], falls: Scene3D['falls'] = [], kills: THREE.Box3[] = [];
  let start: THREE.Vector3 | null = null;
  const volumes: Scene3D['volumes'] = [];
  root.traverse((o) => {
    if (!start && /^(start|player_?start|spawn)(\.\d+)?$/i.test(o.name)) start = o.getWorldPosition(new THREE.Vector3());
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const box = new THREE.Box3().setFromObject(m);
    if (tagged(m, 'killzone')) { kills.push(box); m.visible = false; return; }
    // Update 156: trigger_… and encounter_A… boxes: volumes (the letter after encounter_ is the zone).
    const vm = /^(trigger|encounter)[_ ]?(.*?)(\.\d+)?$/i.exec(m.name);
    if (vm) {
      const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
      const kind = vm[1].toLowerCase() as 'trigger' | 'encounter', rest = vm[2] || m.name;
      volumes.push({ name: m.name, kind, x: c.x, y: box.min.y, z: c.z, sx: sz.x, sy: sz.y, sz: sz.z, ...(kind === 'encounter' && /^[a-z]$/i.test(rest.charAt(0)) ? { zone: rest.charAt(0).toUpperCase() } : {}) });
      m.visible = false;
      return;
    }
    if (tagged(m, 'col')) { cols.push(m); m.visible = false; return; }
    m.castShadow = true; m.receiveShadow = true;
    seasonal(m, terrain, swapped);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) if (has(mt.name, 'foliage')) patchSwayModel(mt, 1);
    if (tagged(m, 'waterfall')) { falls.push({ mesh: m, x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2, y: box.min.y, top: box.max.y }); m.castShadow = false; return; }
    if (tagged(m, 'water')) { waters.push({ box, y: box.max.y }); m.castShadow = false; return; }
    if (tagged(m, 'nocol')) return;
    solid.push(m);
    if (tagged(m, 'nocam')) nocam.add(m);
  });
  const colliding = cols.length ? cols : solid;
  const collider = mergedCollider(colliding) ?? mergedCollider([new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2))])!;
  const camCollider = nocam.size ? mergedCollider(colliding.filter((m) => !nocam.has(m))) : collider;
  return { object: root, collider, camCollider, waters, falls, kills, start, volumes, bounds: new THREE.Box3().setFromObject(root) };
}

/**
 * The floor at a point for things that walk the map's grid (enemies, the party, events), Update 156: the highest
 * floor no more than a step above `fromY` (the highest of all without it). Where something solid stands, or the
 * ceiling is too low to stand, it answers far above, so they treat it as a wall.
 */
export function ground3D(s: Scene3D, x: number, z: number, fromY?: number): number {
  const bvh = (s.collider.geometry as THREE.BufferGeometry & { boundsTree: MeshBVH }).boundsTree;
  const ray = new THREE.Ray(new THREE.Vector3(x, s.bounds.max.y + 5, z), new THREE.Vector3(0, -1, 0));
  const hits = bvh.raycast(ray, THREE.DoubleSide) as THREE.Intersection[];
  const ref = fromY === undefined ? Infinity : fromY + 0.45;
  let floor = -Infinity, above: THREE.Intersection | null = null;
  for (const hit of hits) {
    const y = hit.point.y;
    if (y <= ref) { if (y > floor) floor = y; }
    else if (!above || y < above.point.y) above = hit;
  }
  if (fromY !== undefined && above) {
    // Under the top of something solid (inside a wall), or a ceiling lower than a head: blocked.
    if ((above.face?.normal.y ?? 0) > 0.2 || above.point.y < fromY + 1.5) return fromY + 50;
  }
  return floor === -Infinity ? s.bounds.min.y - 10 : floor;
}

const cache = new Map<string, Promise<THREE.Object3D>>();
/** Load a 3D map's scene file (once per address) and read it. */
export async function load3D(data: MapData, url: string, terrain?: TerrainPicture): Promise<Scene3D> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => parseModel(await (await fetch(url)).arrayBuffer(), modelExt(data.scene3d!.src) ?? 'glb'))();
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return build3D(await p, data.scene3d!.scale ?? 1, terrain);
}

export interface Move3D {
  /** Where to go, in world directions (length up to 1). */
  dx: number; dz: number;
  speed: number; swimSpeed: number;
  jump: boolean;
}

/** The hero in a 3D map: a capsule with gravity, jumping and swimming. */
export class Body3D {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  onGround = false;
  swimming = false;
  private readonly safe = new THREE.Vector3();
  private readonly seg = new THREE.Line3();
  private readonly box = new THREE.Box3();
  private readonly tp = new THREE.Vector3();
  private readonly cp = new THREE.Vector3();
  constructor(private readonly s: Scene3D) {}

  /** Put the hero at a point: on the ground below it (or the highest floor there). */
  place(x: number, z: number, y?: number): void {
    const top = y ?? this.groundBelow(x, this.s.bounds.max.y + 5, z) ?? 0;
    this.pos.set(x, top + 0.02, z);
    this.vel.set(0, 0, 0);
    this.safe.copy(this.pos);
  }

  /** The highest floor under a point (null: none). */
  groundBelow(x: number, y: number, z: number): number | null {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0));
    const hit = (this.s.collider.geometry as THREE.BufferGeometry & { boundsTree: MeshBVH }).boundsTree.raycastFirst(ray.ray, THREE.DoubleSide);
    return hit ? hit.point.y : null;
  }

  /** The water surface over this point, if the hero is in it. */
  private waterAt(): number | null {
    for (const w of this.s.waters) if (this.pos.x >= w.box.min.x && this.pos.x <= w.box.max.x && this.pos.z >= w.box.min.z && this.pos.z <= w.box.max.z && this.pos.y < w.y) return w.y;
    return null;
  }

  /** One step; returns what happened (moved, jumped, splashed in, fell out of the world). */
  update(dt: number, m: Move3D): { moving: boolean; jumped: boolean; splash: boolean; respawned: boolean } {
    const out = { moving: false, jumped: false, splash: false, respawned: false };
    const water = this.waterAt(), wasSwimming = this.swimming;
    // Deep enough to float: chest-deep (the surface above the hero's middle).
    this.swimming = water !== null && water - this.pos.y > HEIGHT * 0.6;
    if (this.swimming && !wasSwimming && this.vel.y < -2) out.splash = true;
    const speed = this.swimming ? m.swimSpeed : m.speed;
    if (m.jump && this.onGround && !this.swimming) { this.vel.y = JUMP; this.onGround = false; out.jumped = true; }
    const STEPS = 4, h = dt / STEPS;
    for (let k = 0; k < STEPS; k++) {
      if (this.swimming && water !== null) {
        // Bobbing at the surface: head and shoulders out.
        const want = water - HEIGHT * 0.7;
        this.vel.y += ((want - this.pos.y) * 12 - this.vel.y * 4) * h;
      } else this.vel.y = this.onGround ? Math.max(-2, this.vel.y - GRAVITY * h) : this.vel.y - GRAVITY * h;
      this.vel.y = Math.max(this.vel.y, -40);
      this.pos.x += m.dx * speed * h; this.pos.z += m.dz * speed * h;
      this.pos.y += this.vel.y * h;
      this.collide(h);
    }
    out.moving = Math.hypot(m.dx, m.dz) > 0.05;
    if (this.onGround && !this.swimming) this.safe.copy(this.pos);
    // A kill zone, or far below everything: back to the last safe ground.
    const fell = this.pos.y < this.s.bounds.min.y - 30 || this.s.kills.some((b) => b.containsPoint(this.tp.set(this.pos.x, this.pos.y + 0.5, this.pos.z)));
    if (fell) { this.pos.copy(this.safe); this.vel.set(0, 0, 0); out.respawned = true; }
    return out;
  }

  /** Push the capsule out of the collision mesh (the three-mesh-bvh character controller approach). */
  private collide(h: number): void {
    const bvh = (this.s.collider.geometry as THREE.BufferGeometry & { boundsTree: MeshBVH }).boundsTree;
    const seg = this.seg;
    seg.start.set(this.pos.x, this.pos.y + RADIUS, this.pos.z);
    seg.end.set(this.pos.x, this.pos.y + HEIGHT - RADIUS, this.pos.z);
    this.box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
    this.box.min.addScalar(-RADIUS); this.box.max.addScalar(RADIUS);
    bvh.shapecast({
      intersectsBounds: (b: THREE.Box3) => b.intersectsBox(this.box),
      intersectsTriangle: (tri: ExtendedTriangle) => {
        const d = tri.closestPointToSegment(seg, this.tp, this.cp);
        if (d < RADIUS) {
          const depth = RADIUS - d, dir = this.cp.sub(this.tp).normalize();
          seg.start.addScaledVector(dir, depth); seg.end.addScaledVector(dir, depth);
        }
        return false;
      },
    });
    const np = this.tp.set(seg.start.x, seg.start.y - RADIUS, seg.start.z);
    const delta = this.cp.subVectors(np, this.pos);
    this.onGround = delta.y > Math.abs(h * this.vel.y * 0.25);
    const off = Math.max(0, delta.length() - 1e-5);
    delta.normalize().multiplyScalar(off);
    this.pos.add(delta);
    if (this.onGround) this.vel.y = 0;
    else if (off > 0) { delta.normalize(); this.vel.addScaledVector(delta, -delta.dot(this.vel)); }
  }
}

/** The camera on a 3D map: orbits the hero (WoW style), or settles behind them in Follow mode. */
export class Camera3D {
  yaw = 0;
  pitch = 0.45;
  dist = 6;
  follow = false;
  private idle = 0;
  private readonly target = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  constructor(private readonly s: Scene3D) {}

  /** Turn by a mouse drag or the right stick (radians). */
  turn(dYaw: number, dPitch: number): void {
    this.yaw += dYaw;
    this.pitch += dPitch;
    this.clamp();
    this.idle = 0;
  }
  zoom(f: number): void { this.dist = Math.max(2, Math.min(16, this.dist * f)); }
  private clamp(): void {
    // Never from under the ground, never straight down: somewhere between.
    const [lo, hi] = this.follow ? [0.12, 0.85] : [-0.12, 1.15];
    this.pitch = Math.max(lo, Math.min(hi, this.pitch));
  }

  /** Walking directions (screen up / right) as world directions. */
  toWorld(dx: number, dz: number): [number, number] {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // Screen up (dz −1) is away from the camera: (−sin yaw, −cos yaw); screen right: (cos yaw, −sin yaw).
    return [dx * c + dz * s, -dx * s + dz * c];
  }

  update(dt: number, cam: THREE.PerspectiveCamera, hero: THREE.Vector3, moving: [number, number] | null): void {
    this.clamp();
    this.idle += dt;
    // Follow: walking with the camera left alone, it swings round behind the hero.
    if (this.follow && moving && this.idle > 0.6) {
      const want = Math.atan2(-moving[0], -moving[1]);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 2.2);
    }
    this.target.lerp(new THREE.Vector3(hero.x, hero.y + HEIGHT * 0.8, hero.z), 1 - Math.exp(-dt * 12));
    if (this.target.lengthSq() === 0 || this.target.distanceTo(hero) > 8) this.target.set(hero.x, hero.y + HEIGHT * 0.8, hero.z);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let d = this.dist;
    // A wall between: come in closer.
    const col = this.s.camCollider;
    if (col) {
      this.ray.set(this.target, dir);
      const hit = (col.geometry as THREE.BufferGeometry & { boundsTree: MeshBVH }).boundsTree.raycastFirst(this.ray.ray, THREE.DoubleSide);
      if (hit && hit.distance < d + 0.3) d = Math.max(0.6, hit.distance - 0.3);
    }
    cam.position.copy(this.target).addScaledVector(dir, d);
    cam.lookAt(this.target);
  }
}
