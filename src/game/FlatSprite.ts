/**
 * A flat-image enemy: one picture brought to life with generic motion instead of drawn frames, the way the very first
 * player sprite moved. It breathes (swells gently) while standing, and slides with a little sway, hops along, or
 * flies (hovering above the ground, bobbing) when it moves. It faces left or right by mirroring the picture, and
 * keeps its last side while moving up or down. Attacks lunge toward the target; the enemy's own wind-up glow, hit
 * flash and death squash work as they do for any sprite.
 *
 * It offers the same calls the enemy makes on a character sprite, so the enemy code treats both alike.
 */
import * as THREE from 'three';
import type { Dir, FlatLook } from '../world/types';
import { type SpriteAsset, withSpriteShadows } from '../render/sprites';

/** How high a flier hovers (tiles). */
export const FLY_HEIGHT = 0.55;

export class FlatSprite {
  readonly mesh: THREE.Mesh;
  dir: Dir = 'down';
  readonly animated = false;
  /** Facing right (on screen) now. */
  private right: boolean;
  private t = Math.random() * 10;
  private moveT = 0;
  private moving = false;
  private action: { t: number; dur: number; done?: () => void } | null = null;

  constructor(asset: SpriteAsset, readonly look: FlatLook, readonly tall: number) {
    this.mesh = withSpriteShadows(new THREE.Mesh(asset.geometry, asset.material), asset);
    this.right = look.faces !== 'left';
  }

  get position(): THREE.Vector3 { return this.mesh.position; }
  get flies(): boolean { return this.look.move === 'fly'; }
  /** -1 when the picture is mirrored. */
  get flip(): number {
    const faces = this.look.faces ?? 'right';
    if (faces === 'none') return 1;
    return this.right === (faces === 'right') ? 1 : -1;
  }

  has(): boolean { return false; }
  setWeapons(): void { /* no weapon sprites */ }
  hold(): void { /* no frames to hold */ }
  /** A one-off action (hurt, attack): no frames, but its callback still comes when it's over. */
  play(_name: string, dur: number, _frame?: number, done?: () => void): void { this.action = { t: 0, dur, done }; }

  faceVector(dx: number, dz: number): void {
    if (Math.abs(dx) > 0.05 * Math.max(Math.abs(dx), Math.abs(dz)) && Math.abs(dx) > 1e-3) this.right = dx > 0;
    this.dir = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'right' : 'left') : dz > 0 ? 'down' : 'up';
  }
  face(dir: Dir): void { this.dir = dir; if (dir === 'left') this.right = false; else if (dir === 'right') this.right = true; }

  animate(dt: number, motion: boolean | { moving: boolean }): void {
    this.t += dt;
    this.moving = typeof motion === 'boolean' ? motion : motion.moving;
    if (this.moving) this.moveT += dt;
    else this.moveT = 0;
    const a = this.action;
    if (a && (a.t += dt) >= a.dur) { this.action = null; a.done?.(); }
  }

  /**
   * The generic motion, applied after the enemy has placed and scaled the mesh. `lunge` 0 … 1 pushes it toward
   * (fx, fz) during an attack; `alive` false keeps only the facing (dying squashes it the enemy's way).
   */
  pose(lunge: number, fx: number, fz: number, alive = true): void {
    const m = this.mesh, L = this.look, move = L.move ?? 'slide';
    let y = 0, sx = 1, sy = 1, rz = 0;
    if (alive) {
      if (L.breathe !== false && !(move === 'hop' && this.moving)) { const b = Math.sin(this.t * 2.4); sy *= 1 + 0.035 * b; sx *= 1 - 0.02 * b; }
      if (move === 'hop' && this.moving) {
        // Bounces about 2.5 a second, squashing as it lands and stretching as it leaves the ground.
        const p = (this.moveT * 2.5) % 1, up = Math.sin(p * Math.PI);
        y += up * 0.3;
        const ground = Math.max(0, 1 - up * 4);
        sy *= 1 - 0.14 * ground + 0.08 * up; sx *= 1 + 0.12 * ground - 0.04 * up;
      } else if (move === 'slide' && this.moving) {
        rz = Math.sin(this.moveT * 9) * 0.07;
        y += Math.abs(Math.sin(this.moveT * 9)) * 0.03;
      } else if (move === 'fly') {
        y += FLY_HEIGHT + Math.sin(this.t * 3.2) * 0.09;
        // A quick shiver, like beating wings, and a lean into the way it's going.
        sx *= 1 + Math.sin(this.t * 38) * 0.015;
        if (this.moving) rz = (this.right ? -1 : 1) * 0.12;
      }
    }
    if (lunge > 0) { const k = Math.sin(lunge * Math.PI) * 0.4; m.position.x += fx * k; m.position.z += fz * k; }
    m.position.y += y;
    m.scale.x *= sx * this.flip;
    m.scale.y *= sy;
    m.rotation.z = rz * this.flip;
  }
}
