/**
 * Something on the map to break: an event page marked breakable (a crate, a cracked boulder, a crystal switch). It
 * can be locked on to and hit by the hero's sword, arrows and spells (or only some of them), shakes and sheds chips
 * when hit, and when its health runs out it vanishes and its page's commands run (set a switch, open a way…).
 */
import type * as THREE from 'three';
import type { BreakableDef, EventPage } from '../../world/types';
import type { TileMap } from '../../world/TileMap';

export type HitKind = 'melee' | 'bow' | 'magic';

/** The event it belongs to (a GameEvent). */
export interface BreakableEvent {
  page: EventPage | null;
  readonly x: number; readonly z: number; readonly w: number; readonly h: number;
  readonly data: { name: string };
  broken: boolean;
  readonly visualObject: THREE.Object3D | null;
  speakerPoint(): { height: number } | null;
}

export class Breakable {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly height: number;
  readonly radius: number;
  readonly maxHp: number;
  hp: number;
  dead = false;
  readonly name: string;
  private shakeT = 0;
  private readonly home: { x: number; z: number } | null;

  constructor(readonly key: BreakableEvent, readonly def: BreakableDef, map: TileMap) {
    this.x = key.x + key.w / 2;
    this.z = key.z + key.h - 0.5;
    this.y = map.standY(this.x, this.z);
    this.height = Math.max(0.5, key.speakerPoint()?.height ?? 1);
    this.radius = Math.max(0.42, key.w / 2 - 0.05);
    this.hp = this.maxHp = Math.max(1, def.hp);
    this.name = def.name?.trim() || key.data.name || 'Target';
    const v = key.visualObject;
    this.home = v ? { x: v.position.x, z: v.position.z } : null;
  }

  /** Can this kind of attack hurt it? */
  accepts(kind: HitKind): boolean { return !this.def.hitBy?.length || this.def.hitBy.includes(kind); }

  /** Take a hit. Returns true when it breaks. */
  hurt(amount: number): boolean {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.shakeT = 0.25;
    if (this.hp > 0) return false;
    this.dead = true;
    this.key.broken = true;
    const v = this.key.visualObject;
    if (v) v.visible = false;
    return true;
  }

  /** The shake after a hit. */
  update(dt: number): void {
    const v = this.key.visualObject;
    if (!v || !this.home || this.dead) return;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeT / 0.25;
      v.position.x = this.home.x + Math.sin(this.shakeT * 90) * 0.05 * k;
      v.position.z = this.home.z;
    } else if (v.position.x !== this.home.x) v.position.x = this.home.x;
  }
}
