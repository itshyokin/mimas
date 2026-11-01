/**
 * What defeated enemies leave on the ground: green EXP orbs, gold, and the items they drop. Orbs and gold spill out,
 * bounce, hover and drift to the hero when near (then are absorbed); items wait to be walked over. Whatever is still
 * lying around when the hero leaves the map (or saves) is collected for them, so nothing is lost.
 */
import * as THREE from 'three';
import type { TileMap } from '../world/TileMap';
import { Pix } from '../core/pixel';

type Kind = 'xp' | 'gold' | 'item';
interface Pickup {
  kind: Kind;
  /** EXP or gold in it; for items, the count. */
  value: number;
  item?: string;
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number;
  /** Resting on the ground (after bouncing). */
  landed: boolean;
  /** Flying to the hero. */
  pulled: boolean;
  phase: number;
  /** Rare loot: a soft glow behind it in its rarity's colour. */
  glow?: THREE.Mesh;
  /** Dropped from the bag: seconds before it can be picked up again (shown dimmed until then). */
  lock?: number;
  /** The hero has stepped off it since it was dropped (so standing still doesn't take it straight back). */
  leftIt?: boolean;
}

/** How long a dropped item waits before it can be picked up again. */
export const DROP_LOCK = 3;
/** How long something cut or mined waits (after landing) before it can be picked up. */
export const HARVEST_LOCK = 0.3;

/** What the hero gets: called as things are absorbed or picked up. Items return how many didn't fit (bag full). */
export interface PickupHost {
  xp(n: number): void;
  gold(n: number): void;
  item(id: string, count: number): number;
  icon(id: string): HTMLCanvasElement;
  /** The colour of the glow behind an item on the ground (its rarity), or null for none. */
  color?(id: string): string | null;
}

let haloCanvas: HTMLCanvasElement | null = null;
function haloArt(): HTMLCanvasElement {
  if (haloCanvas) return haloCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!, r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.45, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  haloCanvas = c;
  return c;
}

let orbCanvas: HTMLCanvasElement | null = null;
function orbArt(): HTMLCanvasElement {
  if (orbCanvas) return orbCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(240,255,230,1)');
  r.addColorStop(0.22, 'rgba(160,255,120,1)');
  r.addColorStop(0.45, 'rgba(70,220,70,0.75)');
  r.addColorStop(1, 'rgba(30,160,40,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 32, 32);
  orbCanvas = c;
  return c;
}

/** A gold coin, 8 × 8. */
let coinCanvas: HTMLCanvasElement | null = null;
function coinArt(): HTMLCanvasElement {
  if (coinCanvas) return coinCanvas;
  const p = new Pix(8, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 3.5);
      if (d > 3.6) continue;
      p.set(x, y, d > 2.8 ? '#8a5a12' : x + y < 5 ? '#fff1a8' : d < 1.4 ? '#f2c443' : '#d9a12a');
    }
  coinCanvas = p.canvas();
  return coinCanvas;
}

/** A leather coin purse with gold peeking out, 14 × 14. */
let purseCanvas: HTMLCanvasElement | null = null;
function purseArt(): HTMLCanvasElement {
  if (purseCanvas) return purseCanvas;
  const p = new Pix(14, 14);
  const L = ['#3d2615', '#5a3a20', '#77502d', '#94683c'];
  for (let y = 4; y < 14; y++)
    for (let x = 0; x < 14; x++) {
      const d = Math.hypot((x - 6.5) / 6.3, (y - 9) / 4.8);
      if (d > 1) continue;
      p.set(x, y, L[d > 0.86 ? 0 : x < 5 && y < 10 ? 3 : d > 0.6 ? 1 : 2]);
    }
  // The tied neck, the drawstring and coins at the mouth.
  for (let x = 4; x < 10; x++) { p.set(x, 4, '#3d2615'); p.set(x, 3, '#77502d'); }
  for (const [x, y] of [[5, 2], [6, 1], [7, 1], [8, 2], [6, 2], [7, 2]]) p.set(x, y, y === 1 ? '#fff1a8' : '#f2c443');
  for (let x = 3; x < 11; x++) p.set(x, 5, '#c9a24a');
  purseCanvas = p.canvas();
  return purseCanvas;
}

/** Split an amount: under `big`, ones; otherwise pieces of up to `max` (the last one has the rest). */
export function split(total: number, big: number, max: number): number[] {
  total = Math.max(0, Math.floor(total));
  if (total <= 0) return [];
  if (total < big) return new Array(total).fill(1);
  const out: number[] = [];
  for (let left = total; left > 0; left -= max) out.push(Math.min(max, left));
  return out;
}

const textures = new WeakMap<HTMLCanvasElement, THREE.Texture>();
function tex(c: HTMLCanvasElement, smooth: boolean): THREE.Texture {
  let t = textures.get(c);
  if (!t) {
    t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    if (!smooth) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
    textures.set(c, t);
  }
  return t;
}

const GRAVITY = 14;
/** How close the hero must be for orbs and gold to start drifting over, and to absorb / pick up. */
const PULL = 2.6, TAKE = 0.35, ITEM_TAKE = 0.55;

export class Pickups {
  private list: Pickup[] = [];
  /** An item that wouldn't fit, so "bag full" isn't repeated every frame. */
  private refused = new Set<Pickup>();
  /** An item was walked over but the bag is full. */
  onFull: (name: string) => void = () => {};

  constructor(private level: THREE.Object3D, private map: TileMap, private readonly host: PickupHost) {}

  /** A new map: the old objects went with the old level (collect them first with `collectAll`). */
  reset(level: THREE.Object3D, map: TileMap): void { this.level = level; this.map = map; this.list = []; this.refused.clear(); }

  get count(): number { return this.list.length; }

  /**
   * Spill what an enemy leaves at (x, y, z). EXP: under 10, one small orb per point; 10 or more, large orbs of up to 50
   * each. Gold: under 10, single coins; 10 or more, coin purses of up to 100 each. Items: each stack as its icon.
   */
  drop(x: number, y: number, z: number, xp: number, gold: number, items: { id: string; count: number }[]): void {
    for (const v of split(xp, 10, 50)) this.spill(x, y, z, 'xp', v, orbArt(), v >= 10 ? 0.4 : 0.2);
    for (const v of split(gold, 10, 100)) this.spill(x, y, z, 'gold', v, v >= 10 ? purseArt() : coinArt(), v >= 10 ? 0.42 : 0.2);
    for (const it of items) this.spill(x, y, z, 'item', it.count, this.host.icon(it.id), 0.5, it.id);
  }

  /**
   * Put an item down by the hero (dropped from the bag): it lies dimmed for a few seconds, and can be picked up again
   * once that's over and the hero has stepped off it.
   */
  place(id: string, count: number, x: number, y: number, z: number): void {
    const p = this.spill(x, y, z, 'item', count, this.host.icon(id), 0.5, id, true);
    p.lock = DROP_LOCK;
    p.leftIt = false;
    p.mat.color.setRGB(0.42, 0.42, 0.46);
  }

  /**
   * Something cut or broken open (firewood from a sapling, ore from a vein): it tumbles out and can be picked up a
   * moment later, so a hero standing right by it sees it land first.
   */
  harvest(id: string, count: number, x: number, y: number, z: number): void {
    // A short hop out (so it lands quickly), then a moment's wait.
    const p = this.spill(x, y, z, 'item', count, this.host.icon(id), 0.5, id, true);
    p.vx *= 2.2; p.vz *= 2.2; p.vy = 2.4;
    p.lock = HARVEST_LOCK;
    p.leftIt = true;
  }

  private spill(x: number, y: number, z: number, kind: Kind, value: number, art: HTMLCanvasElement, size: number, item?: string, gently = false): Pickup {
    {
      const additive = kind === 'xp';
      const mat = new THREE.MeshBasicMaterial({ map: tex(art, additive), transparent: true, depthWrite: !additive, alphaTest: additive ? 0 : 0.4,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.renderOrder = additive ? 4 : 1;
      this.level.add(mesh);
      const a = Math.random() * Math.PI * 2, sp = gently ? 0.4 : (kind === 'item' ? 0.6 : 0.8) + Math.random() * (kind === 'item' ? 0.8 : 1.2);
      const p: Pickup = { kind, value, item, mesh, mat, x, y: y + 0.6, z, vx: Math.cos(a) * sp, vy: gently ? 1.5 : 3.2 + Math.random() * 1.8, vz: Math.sin(a) * sp, age: 0, landed: false, pulled: false, phase: Math.random() * 6 };
      const color = item ? this.host.color?.(item) : null;
      if (color) {
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.7, size * 1.7),
          new THREE.MeshBasicMaterial({ map: tex(haloArt(), true), color: new THREE.Color(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
        glow.position.z = -0.02;
        glow.renderOrder = 0;
        mesh.add(glow);
        p.glow = glow;
      }
      this.list.push(p);
      return p;
    }
  }

  update(dt: number, px: number, py: number, pz: number, canTake: boolean): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      const ground = this.groundAt(p.x, p.z);
      const dx = px - p.x, dz = pz - p.z, dy = py + 0.6 - p.y, d = Math.hypot(dx, dz);
      const magnet = p.kind !== 'item';
      if (canTake && magnet && p.age > 0.55 && (p.pulled || d < PULL)) {
        // Drift to the hero, faster the closer, then absorbed.
        p.pulled = true;
        const k = Math.min(1, dt * (6 + 10 / Math.max(0.3, d)));
        p.x += dx * k; p.z += dz * k; p.y += dy * k;
        if (Math.hypot(dx, dz, dy) < TAKE) { this.take(p, i); continue; }
      } else if (!p.landed) {
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
        if (!this.map.inMap(Math.floor(p.x), Math.floor(p.z)) || this.map.isSolid(Math.floor(p.x), Math.floor(p.z))) { p.x -= p.vx * dt; p.z -= p.vz * dt; p.vx *= -0.3; p.vz *= -0.3; }
        const rest = ground + (p.kind === 'item' ? 0.02 : 0.22);
        if (p.y <= rest) {
          p.y = rest;
          if (Math.abs(p.vy) > 2.2) { p.vy = -p.vy * 0.35; p.vx *= 0.5; p.vz *= 0.5; }
          else { p.landed = true; p.vx = p.vz = 0; }
        }
      } else {
        // Resting: orbs and coins hover and bob, items sit still.
        p.y = ground + (p.kind === 'item' ? 0.02 : 0.24 + Math.sin(p.age * 3 + p.phase) * 0.06);
        if (p.lock !== undefined) {
          // Dropped from the bag: dimmed while it waits; then it brightens again and can be taken.
          p.lock -= dt;
          if (d > ITEM_TAKE + 0.25) p.leftIt = true;
          if (p.lock <= 0 && p.leftIt) { p.lock = undefined; p.leftIt = undefined; }
        } else if (p.mat.color.r < 1) p.mat.color.setScalar(Math.min(1, p.mat.color.r + dt * 3));
        if (canTake && p.kind === 'item' && p.lock === undefined && d < ITEM_TAKE && Math.abs(py - ground) < 0.9) {
          if (!this.refused.has(p)) {
            const left = this.host.item(p.item!, p.value);
            if (left === 0) { this.take(p, i, false); continue; }
            p.value = left;
            this.refused.add(p);
            this.onFull(p.item!);
          }
        } else if (d > 1.2) this.refused.delete(p);
      }
      // Items stand on the ground (the icon's bottom at their feet); orbs and coins are centred.
      p.mesh.position.set(p.x, p.y + (p.kind === 'item' ? 0.25 : 0), p.z);
      if (p.kind === 'xp') p.mat.opacity = 0.85 + Math.sin(p.age * 9 + p.phase) * 0.15;
      if (p.glow) (p.glow.material as THREE.MeshBasicMaterial).opacity = (p.lock !== undefined ? 0.25 : 0.55) + Math.sin(p.age * 2.5 + p.phase) * 0.15;
    }
  }

  private groundAt(x: number, z: number): number {
    const cx = Math.floor(x), cz = Math.floor(z);
    return this.map.inMap(cx, cz) ? this.map.standY(x, z) : 0;
  }

  private take(p: Pickup, i: number, give = true): void {
    if (give) {
      if (p.kind === 'xp') this.host.xp(p.value);
      else if (p.kind === 'gold') this.host.gold(p.value);
    }
    this.level.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mat.dispose();
    if (p.glow) { p.glow.geometry.dispose(); (p.glow.material as THREE.Material).dispose(); }
    this.refused.delete(p);
    this.list.splice(i, 1);
  }

  /**
   * Everything still lying around, collected at once: returns the EXP and gold for the caller to add. Items go into
   * the bag when `items` is 'all' (saving; `taken` false: it didn't fit and stays), or only those `keep` says always
   * fit (leaving the map: key and quest items come along, the rest vanish).
   */
  collectAll(items: 'all' | 'keys', keep: (id: string) => boolean): { xp: number; gold: number; items: { id: string; count: number; taken: boolean }[]; lost: { id: string; count: number }[] } {
    const out = { xp: 0, gold: 0, items: [] as { id: string; count: number; taken: boolean }[], lost: [] as { id: string; count: number }[] };
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.kind === 'xp') out.xp += p.value;
      else if (p.kind === 'gold') out.gold += p.value;
      else if (items === 'all' || keep(p.item!)) {
        const left = this.host.item(p.item!, p.value);
        out.items.push({ id: p.item!, count: p.value - left, taken: left === 0 });
        if (left > 0) { p.value = left; continue; }
      } else out.lost.push({ id: p.item!, count: p.value });
      this.take(p, i, false);
    }
    return out;
  }
}
