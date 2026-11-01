/**
 * Buildings as meshes: every building on the map turned into walls, roofs, doors and windows (lit at night), one mesh
 * per look. The shapes come from buildingShape.ts.
 */
import * as THREE from 'three';
import { doorArt, roofArt, wallArt, windowArt } from '../art/buildingArt';
import { normalMapFrom } from '../core/pixel';
import { patchAreaTint } from '../render/areaTint';
import { registerGlow } from '../render/sprites';
import { maskToGlow } from '../shared/images';
import { linearColor, makeTexture, registerNormalMap } from '../render/textures';
import type { TileTexture } from '../render/tileTextures';
import { type BuildingQuads, addBuilding, buildingCells } from './buildingShape';
import type { TileMap } from './TileMap';
import type { BuildingData } from './types';

// ---- Meshes ----

const artCache = new Map<string, HTMLCanvasElement>();
const art = (key: string, make: () => HTMLCanvasElement) => artCache.get(key) ?? (artCache.set(key, make()), artCache.get(key)!);

/** One building's materials, for fading it out while it hides the player. */
export interface BuiltBuilding {
  /** Footprint (tiles) and the height of its roof top (world units). */
  x0: number; x1: number; z0: number; z1: number; top: number;
  materials: THREE.MeshStandardMaterial[];
  /** Current opacity (1 = solid). */
  opacity: number;
}

/**
 * Every building on the map as meshes (added to `scene`), with their tiles blocked. Each building gets its own
 * materials (sharing textures) so one can fade out on its own.
 */
export function buildBuildings(scene: THREE.Object3D, map: TileMap, buildings: BuildingData[], tileTextures: Map<string, TileTexture>): BuiltBuilding[] {
  if (!buildings.length) return [];
  const floorAt = (x: number, z: number) => (map.inMap(x, z) ? map.heightAt(x, z) : 0);
  // Textures shared by every building of the same look.
  const tex = new Map<string, { map: THREE.Texture; normal?: THREE.Texture }>();
  const shared = (key: string, make: () => { map: THREE.Texture; normal?: THREE.Texture }) => tex.get(key) ?? (tex.set(key, make()), tex.get(key)!);
  let glowTex: THREE.Texture | null = null;
  const material = (key: string): { mat: THREE.MeshStandardMaterial; cast: boolean } => {
    if (key.startsWith('wall:') || key.startsWith('roof:')) {
      const kind = key.startsWith('wall:') ? 'wall' : 'roof', look = key.slice(5), t = tileTextures.get(look);
      const T = shared(key, () => {
        if (t) {
          // An imported tile: its texture repeating every `span` tiles.
          const span = Math.max(0.25, t.def.span || 1), map = t.map.clone(), normal = t.normal.clone();
          for (const tx of [map, normal]) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1 / span, 1 / span); tx.needsUpdate = true; }
          return { map, normal };
        }
        const c = art(key, () => (kind === 'wall' ? wallArt(look) : roofArt(look)));
        return { map: makeTexture(c, { repeat: true, mip: true }), normal: makeTexture(normalMapFrom(c, { strength: kind === 'roof' ? 3 : 2.5, wrap: true }), { linear: true, repeat: true, mip: true }) };
      });
      const mat = new THREE.MeshStandardMaterial({ map: T.map, roughness: 0.95, ...(kind === 'roof' ? { side: THREE.DoubleSide } : {}) });
      if (T.normal) registerNormalMap(mat, T.normal);
      return { mat: patchAreaTint(mat), cast: true };
    }
    if (key === 'trim') {
      const T = shared(key, () => ({ map: makeTexture(art('roof:wood', () => roofArt('wood')), { repeat: true, mip: true }) }));
      return { mat: patchAreaTint(new THREE.MeshStandardMaterial({ map: T.map, color: linearColor('#b8a69a'), roughness: 0.95, side: THREE.DoubleSide })), cast: true };
    }
    // Doors and windows: drawn over the wall, never casting their own shadow.
    const isDoor = key === 'door';
    const T = shared(key, () => ({ map: makeTexture(isDoor ? art('door', doorArt) : art('window', () => windowArt()), { mip: true }) }));
    const mat = patchAreaTint(new THREE.MeshStandardMaterial({ map: T.map, alphaTest: 0.5, roughness: isDoor ? 0.9 : 0.35, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    if (!isDoor) {
      glowTex ??= makeTexture(maskToGlow(art('window:glow', () => windowArt(true))), { mip: true });
      registerGlow(mat, glowTex, '#ffc86b', 2.4);
    }
    return { mat, cast: false };
  };
  const out: BuiltBuilding[] = [];
  for (const b of buildings) {
    for (const [x, z] of buildingCells(b)) map.setBlocked(x, z, true);
    const quads: BuildingQuads = new Map();
    addBuilding(quads, b, floorAt);
    const built: BuiltBuilding = { x0: b.x, x1: b.x + b.w, z0: b.z, z1: b.z + b.d, top: 0, materials: [], opacity: 1 };
    for (const [key, q] of quads) {
      if (!q.idx.length) continue;
      const { mat, cast } = material(key);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(q.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(q.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(q.uv, 2));
      g.setIndex(q.idx);
      for (let i = 1; i < q.pos.length; i += 3) built.top = Math.max(built.top, q.pos[i]);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      m.name = 'building:' + key;
      scene.add(m);
      // Ready to fade from the start (see fadeBuildings): no shader rebuild mid-game.
      mat.transparent = true;
      built.materials.push(mat);
    }
    out.push(built);
  }
  return out;
}

/** How see-through a building gets while it hides the player. */
const FADED = 0.3;

/**
 * Fade the buildings standing between the camera and the player (the camera looks up the map from below, so
 * a building hides the ground just behind it, up to about its height), and bring the others back.
 */
export function fadeBuildings(list: BuiltBuilding[], px: number, py: number, pz: number, dt: number): void {
  for (const b of list) {
    const reach = Math.max(0, b.top - py) * 1.1;
    const hides = px > b.x0 - 0.6 && px < b.x1 + 0.6 && pz < b.z1 + 0.15 && pz > b.z0 - reach;
    const target = hides ? FADED : 1;
    if (Math.abs(b.opacity - target) < 0.001) continue;
    b.opacity += (target - b.opacity) * Math.min(1, dt * 8);
    if (Math.abs(b.opacity - target) < 0.01) b.opacity = target;
    // The materials are made see-through-capable from the start (still writing depth), so fading only changes the
    // opacity: switching `transparent` on the fly made three.js build a new shader, a visible hitch.
    for (const m of b.materials) {
      if (!m.transparent) { m.transparent = true; m.needsUpdate = true; }
      m.opacity = b.opacity;
    }
  }
}
