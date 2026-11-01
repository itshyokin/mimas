/**
 * What a character visibly carries: the readied weapon (and shield) slung on the back, the weapon's icon swinging at
 * their hand for characters without attack animations, the bow held out while drawing, and for magic a small fire
 * burning in the hand (or the spell shard's icon floating over each palm).
 */
import * as THREE from 'three';
import { Pix } from '../../core/pixel';
import { bayer, clamp, vnoise } from '../../core/math';
import type { Dir } from '../../world/types';
import { leanWith } from '../../render/lean';

const textures = new WeakMap<HTMLCanvasElement, THREE.Texture>();
function tex(c: HTMLCanvasElement): THREE.Texture {
  let t = textures.get(c);
  if (!t) {
    t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.encoding = THREE.sRGBEncoding;
    textures.set(c, t);
  }
  return t;
}

/** A ball of fire for a caster's hand: a round glowing core with flames licking up from it, frames side by side. */
const FLAME_FRAMES = 4, FW = 16, FH = 22;
export function fireballStrip(): HTMLCanvasElement {
  const p = new Pix(FW * FLAME_FRAMES, FH);
  const pal = ['#fffbe8', '#ffe27a', '#ffab3d', '#f0642a', '#c23a1f'];
  const cx = FW / 2 - 0.5, cy = FH - 7.5, R = 5.6;
  for (let f = 0; f < FLAME_FRAMES; f++)
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        // Distance outside the shape: the ball, plus a tapering tongue above it that sways frame to frame.
        const ball = Math.hypot(x - cx, y - cy) - R;
        const up = (cy - y) / (cy - 1);
        const sway = Math.sin(up * 3 + f * 1.57) * 1.6 * up;
        const tongue = up > 0 && up < 1 ? Math.abs(x - cx - sway) - R * Math.pow(1 - up, 0.9) * (0.85 + 0.3 * vnoise(x * 0.5, y * 0.4 + f * 3, 4)) : 99;
        const d = Math.min(ball, tongue);
        if (d > 0.4) continue;
        // Hot white-yellow at the core of the ball, through orange to red at the rim and tips.
        const core = Math.hypot(x - cx, (y - cy) * 1.1) / R;
        const tr = 0.4 + Math.max(0, up) * 0.5;
        const r = Math.min(1, ball <= 0.4 ? (tongue < -0.6 ? Math.min(core * 0.75, tr) : core * 0.75) : tr) + (vnoise(x * 0.7, y * 0.5 + f * 5, 8) - 0.5) * 0.25 + (d > -0.6 ? 0.2 : 0);
        p.set(f * FW + x, y, pal[clamp(Math.floor(r * pal.length + bayer(x, y) * 0.5 - 0.25), 0, pal.length - 1)]);
      }
  return p.canvas();
}
function flameTexture(): THREE.Texture {
  const t = new THREE.CanvasTexture(fireballStrip());
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.encoding = THREE.sRGBEncoding;
  t.repeat.set(1 / FLAME_FRAMES, 1);
  return t;
}

/** A leather quiver with a few arrows (fletching up), 12 × 24 px, drawn once. */
let quiverCanvas: HTMLCanvasElement | null = null;
export function quiverArt(): HTMLCanvasElement {
  if (quiverCanvas) return quiverCanvas;
  const p = new Pix(12, 24);
  const L = ['#3d2615', '#5a3a20', '#77502d', '#8f653b'];
  // Arrow shafts and fletching above the mouth.
  for (const [ax, top, col] of [[3, 1, '#e8e2d0'], [6, 0, '#c8483c'], [9, 2, '#e8e2d0']] as [number, number, string][]) {
    for (let y = top; y < 9; y++) p.set(ax, y, '#b48a5a');
    for (let y = top; y < top + 3; y++) { p.set(ax - 1, y + 1, col); p.set(ax + 1, y + 1, col); }
  }
  // The tube: rounded bottom, a darker rim, a strap band.
  for (let y = 8; y < 24; y++)
    for (let x = 1; x < 11; x++) {
      const bottom = y > 20 ? Math.hypot(x - 5.5, y - 20) > 4.6 : false;
      if (bottom) continue;
      const edge = x === 1 || x === 10;
      const v = edge ? 0 : y < 10 ? 3 : (y === 14 || y === 15) ? 0 : x < 4 ? 3 : x > 8 ? 1 : 2;
      p.set(x, y, L[clamp(v + (bayer(x, y) > 0.8 && v > 0 ? -1 : 0), 0, 3)]);
    }
  for (let x = 2; x < 10; x++) p.set(x, 14, '#c9a24a');
  quiverCanvas = p.canvas();
  return quiverCanvas;
}

/** Weapons on the back are drawn a little bigger than in the hand, so they read at a glance. */
const BACK_SIZE = 1.15;

let glowTex: THREE.Texture | null = null;
function glow(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!, r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 32, 32);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export class Held {
  private readonly pivot = new THREE.Object3D();
  private readonly item: THREE.Mesh;
  private readonly itemMat: THREE.MeshStandardMaterial;
  /** A ball of fire and a glow for each hand (left, right). */
  private readonly flames: { flame: THREE.Mesh; mat: THREE.MeshBasicMaterial; glow: THREE.Mesh; glowMat: THREE.MeshBasicMaterial; shard: THREE.Mesh; shardMat: THREE.MeshBasicMaterial }[] = [];
  private spin = 0;
  /** The sword and bow carried on the back while equipped (and not in the hand). */
  private readonly backSword: THREE.Mesh;
  private readonly backBow: THREE.Mesh;
  private readonly backShield: THREE.Mesh;
  private readonly backQuiver: THREE.Mesh;

  constructor(private readonly parent: THREE.Object3D, private readonly scale = 1) {
    this.itemMat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.4, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    // The icon's bottom-left corner (where a sword's grip is drawn) sits on the pivot: the hand.
    const geo = new THREE.PlaneGeometry(0.62, 0.62);
    geo.translate(0.22, 0.22, 0);
    this.item = new THREE.Mesh(geo, this.itemMat);
    this.pivot.add(this.item);
    this.pivot.visible = false;
    // A small fire in each hand: each its own texture copy, so they (and each caster) flicker on their own.
    const flameGeo = new THREE.PlaneGeometry(0.22, 0.3);
    flameGeo.translate(0, 0.15 - 0.3 * (7.5 / FH), 0);
    const glowGeo = new THREE.PlaneGeometry(0.5, 0.5);
    // A spell shard's icon floats over each palm instead (when the spell has one).
    const shardGeo = new THREE.PlaneGeometry(0.28, 0.28);
    shardGeo.translate(0, 0.1, 0);
    for (let k = 0; k < 2; k++) {
      const mat = new THREE.MeshBasicMaterial({ map: flameTexture(), transparent: true, alphaTest: 0.05, depthWrite: false, opacity: 0 });
      const flame = new THREE.Mesh(flameGeo, mat);
      flame.renderOrder = 3;
      flame.visible = false;
      const glowMat = new THREE.MeshBasicMaterial({ map: glow(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const g = new THREE.Mesh(glowGeo, glowMat);
      g.visible = false;
      const shardMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, depthWrite: false });
      const shard = new THREE.Mesh(shardGeo, shardMat);
      shard.renderOrder = 3;
      shard.visible = false;
      this.flames.push({ flame, mat, glow: g, glowMat, shard, shardMat });
    }
    const backGeo = new THREE.PlaneGeometry(0.62, 0.62);
    this.backSword = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.4, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
    this.backBow = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.4, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
    this.backShield = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.4, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
    const quiverGeo = new THREE.PlaneGeometry(0.34, 0.68);
    this.backQuiver = new THREE.Mesh(quiverGeo, new THREE.MeshStandardMaterial({ map: tex(quiverArt()), transparent: true, alphaTest: 0.4, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
    this.backSword.visible = this.backBow.visible = this.backShield.visible = this.backQuiver.visible = false;
    parent.add(this.pivot, ...this.flames.flatMap((f) => [f.flame, f.glow, f.shard]), this.backSword, this.backBow, this.backShield, this.backQuiver);
  }

  /** Where the hand is for a character at p facing dir (and which way to mirror). */
  private place(p: THREE.Vector3, dir: Dir, raise = 0): number {
    const s = this.scale, side = dir === 'left' ? -1 : 1;
    const x = dir === 'left' ? -0.28 : dir === 'right' ? 0.28 : dir === 'down' ? 0.3 : -0.3;
    // In front of the sprite, or behind it when walking away from the camera.
    const z = dir === 'up' ? -0.06 : 0.06;
    this.pivot.position.set(p.x + x * s, p.y + (0.5 + raise) * s, p.z + z);
    this.pivot.scale.set(side * s, s, s);
    leanWith(this.pivot, p);
    return side;
  }

  /** A melee swing, k from 0 (raised) to 1 (follow-through). */
  swing(icon: HTMLCanvasElement, p: THREE.Vector3, dir: Dir, k: number): void {
    this.setItem(icon);
    this.place(p, dir, 0.08);
    const e = k < 0.3 ? k / 0.3 * 0.15 : 0.15 + (1 - Math.pow(1 - (k - 0.3) / 0.7, 3)) * 0.85;
    this.pivot.rotation.z = 0.95 - e * 2.5;
    this.pivot.visible = true;
  }

  /** Held out at an angle (a fishing rod): `tilt` 0 … 1 from upright to pointing out over the water. */
  hold(icon: HTMLCanvasElement, p: THREE.Vector3, dir: Dir, tilt: number): void {
    this.setItem(icon);
    this.place(p, dir, 0.04);
    this.pivot.rotation.z = 0.6 - tilt * 1.2;
    this.pivot.visible = true;
  }

  /** Where the tip of the held item is (the top-right corner of its icon, where a rod's line starts). */
  tip(): THREE.Vector3 {
    this.pivot.updateMatrixWorld(true);
    return this.pivot.localToWorld(new THREE.Vector3(0.43, 0.43, 0));
  }

  /** Raised and trembling before a swing (an enemy's wind-up). */
  ready(icon: HTMLCanvasElement, p: THREE.Vector3, dir: Dir, t: number): void {
    this.setItem(icon);
    this.place(p, dir, 0.1);
    this.pivot.rotation.z = 0.95 + Math.sin(t * 40) * 0.05;
    this.pivot.visible = true;
  }

  /** A bow held out, pulled back a little as it's drawn (draw 0 … 1). */
  bow(icon: HTMLCanvasElement, p: THREE.Vector3, dir: Dir, draw: number): void {
    this.setItem(icon);
    const side = this.place(p, dir, 0.02);
    this.pivot.position.x -= side * draw * 0.06 * this.scale;
    this.pivot.rotation.z = -0.2 - draw * 0.15;
    this.pivot.visible = true;
  }

  /**
   * Magic: in each hand the spell shard's icon (bobbing over the palm) or, without one, a small ball of fire, with a
   * soft glow in the spell's colour (amount 0 … 1 fades it; they grow while casting).
   */
  cast(p: THREE.Vector3, dir: Dir, color: THREE.Color, amount: number, dt: number, icon?: HTMLCanvasElement): void {
    this.spin += dt * 2.2;
    const s = this.scale, on = amount > 0.01;
    for (const f of this.flames) { f.glow.visible = on; f.flame.visible = on && !icon; f.shard.visible = on && !!icon; }
    if (!on) return;
    // One at each side of the sprite, in front of it, whichever way the hero faces.
    void dir;
    this.flames.forEach((f, k) => {
      const hx = p.x + (k ? 0.3 : -0.3) * s, hy = p.y + 0.5 * s, hz = p.z + 0.08;
      f.glow.position.set(hx, hy + 0.08 * s, hz);
      f.glow.scale.setScalar(s * (0.55 + Math.sin(this.spin * 5 + k * 2) * 0.1 + amount * 0.35));
      f.glowMat.color.copy(color);
      f.glowMat.opacity = amount * 0.8;
      // Flickering through its frames (the two hands out of step), bigger and brighter while a spell is cast.
      f.flame.position.set(hx, hy, hz + 0.01);
      f.flame.scale.setScalar(s * (0.75 + amount * 0.45));
      leanWith(f.glow, p); leanWith(f.flame, p);
      f.mat.map!.offset.x = ((Math.floor(this.spin * 5) + k * 2) % FLAME_FRAMES) / FLAME_FRAMES;
      f.mat.opacity = Math.min(1, 0.4 + amount);
      if (icon) {
        const t = tex(icon);
        if (f.shardMat.map !== t) { f.shardMat.map = t; f.shardMat.needsUpdate = true; }
        // Hovering and slowly rocking over the palm (the hands out of step), a little bigger while casting.
        f.shard.position.set(hx, hy + Math.sin(this.spin * 2.4 + k * 1.7) * 0.025 * s, hz + 0.012);
        f.shard.rotation.set(0, 0, Math.sin(this.spin * 1.3 + k * 2.1) * 0.18);
        f.shard.scale.setScalar(s * (0.9 + amount * 0.3));
        leanWith(f.shard, p);
        f.shardMat.opacity = Math.min(1, 0.5 + amount);
      }
    });
  }

  /**
   * The readied weapon slung on the back: the sword diagonally with its hilt over a shoulder, or the bow.
   * Behind the sprite when facing the camera (peeking out past the shoulders), over the back when facing away.
   * Pass null for one that isn't equipped or is in the hand right now.
   */
  back(sword: HTMLCanvasElement | null, bow: HTMLCanvasElement | null, p: THREE.Vector3, dir: Dir, shield: HTMLCanvasElement | null = null, quiver = false): void {
    const s = this.scale;
    // Seen from behind (facing up) the hero's right shoulder is on screen right; from the front it's on the left, and
    // from the side the back is the side away from where they face. `hx` is where the sword's hilt sticks out.
    const away = dir === 'up', side = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
    const hx = side ? side : away ? 1 : -1;
    const z = away ? 0.05 : -0.05;
    const put = (m: THREE.Mesh, icon: HTMLCanvasElement | null, x: number, y: number, dz: number) => {
      if (!icon) { m.visible = false; return; }
      const mat = m.material as THREE.MeshStandardMaterial, t = tex(icon);
      if (mat.map !== t) { mat.map = t; mat.needsUpdate = true; }
      m.position.set(p.x + x * s, p.y + y * s, p.z + z + dz);
      // The icons are drawn on diagonals (sword grip bottom-left → tip top-right; the bow the other way): turning
      // them half over puts the sword's hilt at the top, and mirroring sends it to the hilt side.
      m.rotation.set(0, 0, Math.PI);
      // Icons cut from a weapon sprite are shown at the sprite's own scale (a dagger stays smaller than a longsword).
      const size = icon.dataset.spritePixels ? icon.width / 32 : BACK_SIZE;
      m.scale.set(hx * s * size, s * size, s);
      leanWith(m, p);
      m.visible = true;
    };
    // Only the readied weapon is carried, so each sits where it shows best: from the front or back the hilt (or the
    // bow's upper limb) rises over a shoulder; from the side it's slung behind, up by the back of the head.
    if (side) {
      put(this.backSword, sword, -side * 0.2, 0.86, 0);
      put(this.backBow, bow, -side * 0.24, 0.8, 0);
    } else {
      put(this.backSword, sword, hx * 0.17, 0.86, 0);
      // The bow sits across the middle of the back.
      put(this.backBow, bow, 0, 0.8, 0);
    }
    // A shield hangs flat in the middle of the back, under the weapon (upright, not turned like the weapons).
    put(this.backShield, shield, side ? -side * 0.12 : 0, 0.5, away ? 0.01 : -0.01);
    if (shield) { const k = shield.dataset.spritePixels ? shield.width / 32 : 0.85; this.backShield.rotation.set(this.backShield.rotation.x, 0, 0); this.backShield.scale.set(s * k, s * k, s); }
    // The quiver (with a bow readied): tilted over the right shoulder, its arrows' fletching sticking up.
    const q = this.backQuiver;
    q.visible = quiver;
    if (quiver) {
      const qx = side ? -side * 0.12 : away ? 0.16 : -0.16;
      q.position.set(p.x + qx * s, p.y + 0.72 * s, p.z + z + (away ? 0.015 : -0.015));
      q.rotation.set(0, 0, (side ? side : away ? -1 : 1) * 0.35);
      q.scale.set(s, s, s);
      leanWith(q, p);
    }
  }

  hideBack(): void { this.backSword.visible = this.backBow.visible = this.backShield.visible = this.backQuiver.visible = false; }

  hideItem(): void { this.pivot.visible = false; }
  hideMagic(): void { for (const f of this.flames) f.flame.visible = f.glow.visible = f.shard.visible = false; }
  hide(): void { this.hideItem(); this.hideMagic(); this.hideBack(); }

  remove(): void { this.parent.remove(this.pivot, ...this.flames.flatMap((f) => [f.flame, f.glow, f.shard]), this.backSword, this.backBow, this.backShield, this.backQuiver); }

  private setItem(icon: HTMLCanvasElement): void {
    const t = tex(icon);
    if (this.itemMat.map !== t) { this.itemMat.map = t; this.itemMat.needsUpdate = true; }
  }
}


