/**
 * Bridges and platforms: props with a `deck` (built-in plank, rope and stone bridges, docks and platforms). Each
 * stands on one tile and is walked on at a deck height, so a row of them crosses a river, a chasm or lower ground;
 * water flows and chasms drop away underneath. Built as real 3D pieces (planks lying flat, rails, posts down to the
 * ground), not upright cards like other props.
 *
 * The height: every bridge joined to others (side by side) shares one, the highest ground at the ends where it
 * meets land, so it runs level from bank to bank. A prop's own height (y) overrides it.
 */
import * as THREE from 'three';
import type { TileMap } from './TileMap';
import type { MapData, PropData, PropDef } from './types';
import { footTiles } from './props';
import { makeTexture } from '../render/textures';
import { Pix } from '../core/pixel';

export type DeckStyle = 'wood' | 'rope' | 'stone';
export interface DeckDef {
  style: DeckStyle; /** Runs east–west ('h') or north–south ('v'); platforms: either. */ dir?: 'h' | 'v'; rails?: boolean;
  /** Drawn as the prop's own picture (an imported bridge or platform) instead of the built 3D pieces. */
  art?: boolean;
  /** The picture stands up at the deck's height (unset: it lies flat on the deck, seen from above like a floor). */
  stand?: boolean;
}

interface DeckCell { x: number; z: number; p: PropData; def: DeckDef; y: number }

/** Work out each bridge tile's height and tell the map (walkable there at that height). */
export function placeDecks(map: TileMap, data: MapData, defOf: (type: string) => PropDef | undefined): DeckCell[] {
  const cells = new Map<string, DeckCell>();
  for (const p of data.props) {
    const def = defOf(p.type), d = def?.deck;
    if (!def || !d) continue;
    // Built-in pieces: the one tile they stand in. Imported ones: every tile of their footprint.
    const tiles: [number, number][] = def.foot ? footTiles(def, p.x, p.z, p.s ?? 1) : [[Math.floor(p.x), Math.floor(p.z - 0.01)]];
    for (const [x, z] of tiles) if (map.inMap(x, z)) cells.set(`${x},${z}`, { x, z, p, def: d, y: 0 });
  }
  // Joined pieces share one height: the highest land touching the group (or a piece's own y).
  const seen = new Set<string>();
  for (const [key, start] of cells) {
    if (seen.has(key)) continue;
    const group: DeckCell[] = [], stack = [start];
    seen.add(key);
    while (stack.length) {
      const c = stack.pop()!;
      group.push(c);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${c.x + dx},${c.z + dz}`, n = cells.get(k);
        if (n && !seen.has(k)) { seen.add(k); stack.push(n); }
      }
    }
    let y = -Infinity;
    const own = group.find((c) => c.p.y !== undefined);
    if (own) y = own.p.y!;
    else for (const c of group) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, nz = c.z + dz;
      if (!map.inMap(nx, nz) || cells.has(`${nx},${nz}`)) continue;
      y = Math.max(y, map.standY(nx + 0.5, nz + 0.5));
    }
    if (!Number.isFinite(y)) y = Math.max(...group.map((c) => map.standY(c.x + 0.5, c.z + 0.5)));
    // A hair above the banks (2 px at 32 px per tile): never level with the ground, water or winter ice under it
    // (which would flicker). Walkers step up onto it.
    y += DECK_LIFT;
    for (const c of group) { c.y = y; map.setDeck(c.x, c.z, y, c.def.dir ?? 'any'); }
  }
  return [...cells.values()];
}

/* ------------------------------------------------------------------ art */

function planks(dir: 'h' | 'v'): HTMLCanvasElement {
  const p = new Pix(16, 16), W = ['#5a3a20', '#6e4828', '#825833', '#966a3f'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const a = dir === 'h' ? x : y, b = dir === 'h' ? y : x, board = Math.floor(a / 4);
    if (a % 4 === 0) { p.set(x, y, '#3a2414'); continue; }
    const grain = ((b * 7 + board * 13) % 11) / 11, k = Math.floor(grain * 2 + ((board * 5) % 3) * 0.6);
    p.set(x, y, W[Math.min(3, k)]);
    if ((b === 3 || b === 12) && a % 4 === 2) p.set(x, y, '#c9b089');
  }
  return p.canvas();
}
function stone(): HTMLCanvasElement {
  const p = new Pix(16, 16), S = ['#6b686f', '#79767d', '#88858c', '#96939a'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = Math.floor(y / 8), bx = (x + (row % 2) * 4) & 7;
    p.set(x, y, bx === 0 || (y & 7) === 0 ? '#45424a' : S[(x * 3 + y * 5 + row) % 4]);
  }
  return p.canvas();
}
function solid(c: string): HTMLCanvasElement { const p = new Pix(2, 2); p.rect(0, 0, 2, 2, c); return p.canvas(); }

/** A picture of each built-in piece from above (the editor's palette and map). */
export function deckIcon(d: DeckDef): HTMLCanvasElement {
  const base = d.style === 'stone' ? stone() : planks(d.dir ?? 'h');
  if (!d.rails && d.style !== 'rope') return base;
  const g = base.getContext('2d')!;
  g.fillStyle = d.style === 'stone' ? '#4f4c55' : d.style === 'rope' ? '#c8a96a' : '#3a2414';
  if ((d.dir ?? 'h') === 'h') { g.fillRect(0, 0, 16, 2); g.fillRect(0, 14, 16, 2); } else { g.fillRect(0, 0, 2, 16); g.fillRect(14, 0, 2, 16); }
  return base;
}

/* ------------------------------------------------------------------ meshes */

/** How far a bridge or platform stands above the banks it joins (tiles): 2 pixels at 32 per tile. */
export const DECK_LIFT = 2 / 32;

/** Build the bridges and platforms (after `placeDecks`). */
export function buildDecks(scene: THREE.Object3D, map: TileMap, all: DeckCell[]): void {
  // Pieces drawn as their own picture are left to the props.
  const cells = all.filter((c) => !c.def.art);
  if (!cells.length) return;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const tex = { h: makeTexture(planks('h'), { repeat: true }), v: makeTexture(planks('v'), { repeat: true }), stone: makeTexture(stone(), { repeat: true }) };
  const mats = {
    woodH: new THREE.MeshStandardMaterial({ map: tex.h, roughness: 0.9 }),
    woodV: new THREE.MeshStandardMaterial({ map: tex.v, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ map: tex.stone, roughness: 0.95 }),
    beam: new THREE.MeshStandardMaterial({ map: makeTexture(solid('#4a2f1a')), roughness: 0.9 }),
    rope: new THREE.MeshStandardMaterial({ map: makeTexture(solid('#b8975a')), roughness: 1 }),
  };
  const parts = new Map<THREE.Material, THREE.Matrix4[]>();
  const put = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const list = parts.get(mat) ?? [];
    list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)));
    parts.set(mat, list);
  };
  const has = (x: number, z: number) => cells.some((c) => c.x === x && c.z === z);
  for (const c of cells) {
    const { x, z, y, def } = c, cx = x + 0.5, cz = z + 0.5, dir = def.dir ?? 'h';
    const thick = def.style === 'stone' ? 0.3 : 0.1;
    const top = def.style === 'stone' ? stoneMat(mats) : dir === 'h' ? mats.woodH : mats.woodV;
    // The deck itself, its top flush with the walking height.
    put(top, cx, y - thick / 2, cz, 1, thick, 1);
    const ground = Math.min(map.surfaceY(x + 0.1, z + 0.1), map.surfaceY(x + 0.9, z + 0.9));
    const drop = y - thick - ground;
    // Sides along the length (rails, ropes or parapets), skipped where another piece continues sideways.
    const sides: [number, number, number, number][] = dir === 'h'
      ? [[cx, z + 0.04, 1, 0.08], [cx, z + 0.96, 1, 0.08]].filter((_, k) => !has(x, k ? z + 1 : z - 1)) as [number, number, number, number][]
      : [[x + 0.04, cz, 0.08, 1], [x + 0.96, cz, 0.08, 1]].filter((_, k) => !has(k ? x + 1 : x - 1, z)) as [number, number, number, number][];
    const startOfRun = dir === 'h' ? !has(x - 1, z) : !has(x, z - 1);
    for (const [sx, sz, w, d] of sides) {
      if (def.style === 'stone' && def.rails !== false) put(mats.stone, sx, y + 0.14, sz, w, 0.28, d);
      else if (def.style === 'rope') {
        // Posts at each piece's start, and two ropes that sag a little between them.
        const px = dir === 'h' ? x + 0.04 : sx, pz = dir === 'h' ? sz : z + 0.04;
        put(mats.beam, px, y + 0.3, pz, 0.08, 0.6, 0.08);
        put(mats.rope, sx, y + 0.52, sz, dir === 'h' ? 1 : 0.03, 0.03, dir === 'h' ? 0.03 : 1);
        put(mats.rope, sx, y + 0.28, sz, dir === 'h' ? 1 : 0.03, 0.03, dir === 'h' ? 0.03 : 1);
      } else if (def.rails) {
        const px = dir === 'h' ? x + 0.06 : sx, pz = dir === 'h' ? sz : z + 0.06;
        put(mats.beam, px, y + 0.22, pz, 0.09, 0.44, 0.09);
        if (!(dir === 'h' ? has(x + 1, z) : has(x, z + 1))) put(mats.beam, dir === 'h' ? x + 0.94 : sx, y + 0.22, dir === 'h' ? sz : z + 0.94, 0.09, 0.44, 0.09);
        put(mats.beam, sx, y + 0.4, sz, dir === 'h' ? 1 : 0.06, 0.06, dir === 'h' ? 0.06 : 1);
      }
    }
    // Underneath: wooden posts down to the ground or bed, or stone piers (every other piece), when there's a gap.
    if (drop > 0.25 && def.style !== 'rope') {
      if (def.style === 'stone') { if ((x + z) % 2 === 0 || startOfRun) put(mats.stone, cx, ground + drop / 2, cz, 0.55, drop, 0.55); }
      else for (const [ox, oz] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) put(mats.beam, x + ox, ground + drop / 2, z + oz, 0.1, drop, 0.1);
    }
  }
  for (const [mat, list] of parts) {
    const m = new THREE.InstancedMesh(box, mat, list.length);
    list.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
}
const stoneMat = (m: { stone: THREE.Material }) => m.stone;
