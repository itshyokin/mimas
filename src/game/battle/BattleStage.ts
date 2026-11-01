/**
 * A turn-based battle fought on a battle map (Legend of Dragoon / FFX style): the map is built in its own scene, the
 * party stands on its party markers with their backs to the camera, the enemies on theirs facing it, and the camera
 * waits behind the party. Attackers dash to their target, strike and run back; spells flare in their colour; the
 * fallen lie down or sink away. The battle screen's name tags, health bars and numbers follow the sprites on screen.
 *
 * The stage only shows things: the battle itself is run by TurnBattle, which talks to it through the battle screen.
 */
import * as THREE from 'three';
import type { BattleCamera, MapData } from '../../world/types';
import { CharacterSprite, type CarriedWeapon } from '../CharacterSprite';
import { FlatSprite } from '../FlatSprite';
import type { StageHooks } from '../../ui/BattleScreen';

/** Where a fighter stands and what it looks like. */
export interface StageFighterSpec {
  key: string;
  side: 'party' | 'enemy';
  sprite: CharacterSprite | FlatSprite;
  scale?: number;
  /** Weapon sprites held throughout the battle (animated sheets). */
  weapons?: CarriedWeapon[];
  /** The animation an attack plays (slash, thrust, shoot). */
  attackAnim?: string;
  /** Raise (+) or lower (−) the picture, in tiles: art with empty space under the feet would float (Database). */
  lift?: number;
  /** Their colour (Database → Heroes): the ring under them on their turn. */
  color?: string;
}

type Step =
  | { kind: 'move'; to: THREE.Vector3; dur: number; t: number; from?: THREE.Vector3; run?: boolean; keepFacing?: boolean }
  | { kind: 'play'; anim: string; dur: number; t: number; started?: boolean; keepFacing?: boolean }
  | { kind: 'wait'; dur: number; t: number }
  /** Turn to face a point (null: the other side again). */
  | { kind: 'face'; to: THREE.Vector3 | null; dur: number; t: number };

/** A close camera: following an Addition (attacker and target), or in front of a caster. */
interface Shot { kind: 'addition' | 'cast'; a: string; t?: string }

interface Fighter {
  key: string;
  side: 'party' | 'enemy';
  sprite: CharacterSprite | FlatSprite;
  flat: FlatSprite | null;
  scale: number;
  lift: number;
  /** Height and width of the sprite at scale 1 (tiles). */
  tall: number;
  wide: number;
  home: THREE.Vector3;
  /** Where it is now (before shakes and steps). */
  at: THREE.Vector3;
  attackAnim: string;
  steps: Step[];
  shake: number;
  /** Stepping forward as the one whose turn it is (0 … 1). */
  step: number;
  active: boolean;
  down: boolean;
  /** Badly hurt or ailing: crouched, breathing slow and heavy. */
  weak: boolean;
  /** Posing for the camera (casting): arms up. */
  posed: boolean;
  /** Which way they face in the world (x, z); the frame shown depends on where the camera is. */
  facing: THREE.Vector2;
  /** 0 standing … 1 gone (enemies sink away). */
  fade: number;
  fading: boolean;
  ring: THREE.Mesh;
  ringColor: string | null;
  /** The ring on their turn (their hero colour). */
  turnColor: string;
  lunge: number;
}

interface Burst { sprite: THREE.Sprite; t: number; dur: number; grow: number; rise: number }

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The battle cameras (LB / RB cycle them): turned from behind the party by `yaw` radians, `dist` and `height` × the
 * battle map's camera, moved `side` tiles to the right, looking `look` of the way from the party to the enemies.
 */
const CAMERA_PRESETS = [
  { name: 'Behind the party', yaw: 0, dist: 1, height: 1, side: 0, look: 0.6, lookUp: 0, fit: 'all' },
  { name: 'Over the left shoulder', yaw: 0.3, dist: 0.42, height: 0.48, side: -1.7, look: 0.85, lookUp: 0.15, fit: 'enemies' },
  { name: 'Over the right shoulder', yaw: -0.3, dist: 0.42, height: 0.48, side: 1.7, look: 0.85, lookUp: 0.15, fit: 'enemies' },
  { name: 'High above', yaw: 0, dist: 0.9, height: 2.6, side: 0, look: 0.45, lookUp: -0.3, fit: 'all' },
  { name: 'Low and close', yaw: 0.12, dist: 0.4, height: 0.18, side: 0.6, look: 0.8, lookUp: 0.9, fit: 'enemies' },
  { name: 'Wide, from the left', yaw: 0.6, dist: 1.25, height: 1.15, side: 0, look: 0.5, lookUp: 0, fit: 'all' },
  { name: 'Wide, from the right', yaw: -0.6, dist: 1.25, height: 1.15, side: 0, look: 0.5, lookUp: 0, fit: 'all' },
] as const;
/** Pocket Handheld's camera: low behind the hero's right shoulder, the hero big at the bottom left, the foe up and right. */
const POCKET_PRESET = { name: 'Handheld', yaw: 0, dist: 0.6, height: 0.5, side: 0, look: 0.6, lookUp: 0, fit: 'all', lookSide: 0 } as const;

let glowTexture: THREE.Texture | null = null;
/** A soft round glow (spell flares, hit sparks). */
function glow(): THREE.Texture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.encoding = THREE.sRGBEncoding;
  return glowTexture;
}

const RING_GEOMETRY = new THREE.RingGeometry(0.38, 0.5, 40).rotateX(-Math.PI / 2);

export class BattleStage implements StageHooks {
  readonly scene = new THREE.Scene();
  readonly group = new THREE.Group();
  private readonly fighters = new Map<string, Fighter>();
  private readonly bursts: Burst[] = [];
  private readonly party: THREE.Vector3[] = [];
  private readonly enemies: THREE.Vector3[] = [];
  private readonly cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), basePos: new THREE.Vector3(), baseLook: new THREE.Vector3(), t: 0, intro: 1.4 };
  private readonly v = new THREE.Vector3();
  private readonly w = new THREE.Vector3();
  private readonly settings: Required<BattleCamera>;
  private focusKey: string | null = null;
  private focusT = 0;
  private targets = new Set<string>();
  private elapsed = 0;
  /** Field of view the game's camera had before the battle. */
  savedFov = 0;
  /** Pocket Handheld layout: start (and stay, unless changed) on the handheld camera. */
  pocket = false;

  /**
   * `stand(x, z)`: the ground height there. `data`: the battle map (its markers and camera).
   */
  constructor(readonly data: MapData, private readonly stand: (x: number, z: number) => number) {
    this.scene.add(this.group);
    const c = data.battleCamera ?? {};
    this.settings = { distance: c.distance ?? 6, height: c.height ?? 3.2, side: c.side ?? 0, fov: c.fov ?? 40 };
    const marks = (side: 'party' | 'enemy') => (data.markers ?? []).filter((m) => m.side === side).map((m) => new THREE.Vector3(m.x + 0.5, 0, m.z + 0.5));
    this.party.push(...marks('party'));
    this.enemies.push(...marks('enemy'));
  }

  /** Where the n-th fighter of a side stands: its marker, or a spot near the others when there are too few. */
  private spot(side: 'party' | 'enemy', i: number): THREE.Vector3 {
    const list = side === 'party' ? this.party : this.enemies;
    const cx = this.data.width / 2, cz = this.data.height / 2;
    let p: THREE.Vector3;
    if (!list.length) {
      // No markers: a row each side of the middle (the first in the middle, then left, then right), the party nearer
      // the bottom (the camera's side).
      const k = i % 3, row = Math.floor(i / 3), off = [0, -1.6, 1.6][k] + (row % 2) * 0.8;
      p = new THREE.Vector3(cx + off, 0, side === 'party' ? cz + 2.5 + row : cz - 2 - row * 1.4);
    } else if (i < list.length) p = list[i].clone();
    else {
      // More fighters than markers: a step behind the markers, shifted a little.
      const m = list[i % list.length], row = Math.floor(i / list.length);
      p = m.clone().add(new THREE.Vector3(0.7 * (row % 2 ? -1 : 1), 0, (side === 'party' ? 1 : -1.2) * row));
    }
    p.y = this.stand(p.x, p.z);
    return p;
  }

  addFighters(list: StageFighterSpec[]): void {
    const counts = { party: 0, enemy: 0 };
    for (const s of list) this.makeFighter(s, this.pocketSpot(s.side, this.spot(s.side, counts[s.side]++)));
    // Everyone faces the other side (all the same way, so their frames match).
    for (const f of this.fighters.values()) this.faceFoes(f);
    this.frameCamera();
  }

  /**
   * Pocket Handheld: the two sides stand a little further apart and off to either side (the hero to the left, the foe
   * to the right), so the camera behind the hero sees them across the screen from each other.
   */
  private pocketSpot(side: 'party' | 'enemy', p: THREE.Vector3): THREE.Vector3 {
    if (!this.pocket) return p;
    const pc = this.party[0] ?? this.spot('party', 0), ec = this.enemies[0] ?? this.spot('enemy', 0);
    const along = new THREE.Vector3().subVectors(ec, pc).setY(0);
    if (along.lengthSq() < 0.01) along.set(0, 0, -1);
    along.normalize();
    const right = new THREE.Vector3(-along.z, 0, along.x);
    const q = p.clone().addScaledVector(right, side === 'party' ? -0.8 : 1.2).addScaledVector(along, side === 'party' ? 0.6 : 1.4);
    q.x = THREE.MathUtils.clamp(q.x, 0.5, this.data.width - 0.5);
    q.z = THREE.MathUtils.clamp(q.z, 0.5, this.data.height - 0.5);
    q.y = this.stand(q.x, q.z);
    return q;
  }

  /** A party member swapped in: they stand where the one leaving stood. */
  replaceFighter(oldKey: string, s: StageFighterSpec): void {
    const old = this.fighters.get(oldKey);
    if (!old) return;
    old.sprite.mesh.removeFromParent();
    old.ring.removeFromParent();
    (old.ring.material as THREE.Material).dispose();
    this.fighters.delete(oldKey);
    const f = this.makeFighter(s, old.home.clone());
    this.burst(f, '#ffffff', 1.4, 0.5, 0.4);
    this.faceFoes(f);
  }

  private makeFighter(s: StageFighterSpec, home: THREE.Vector3): Fighter {
    {
      const mesh = s.sprite.mesh;
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox!;
      const ring = new THREE.Mesh(RING_GEOMETRY, new THREE.MeshBasicMaterial({ color: '#ffc46e', transparent: true, opacity: 0, depthWrite: false }));
      ring.renderOrder = 2;
      this.group.add(mesh, ring);
      const flat = s.sprite instanceof FlatSprite ? s.sprite : null;
      // A 3D character stands smaller on the stage (it's seen up close): its own share of its height, half by default.
      const rig = s.sprite instanceof CharacterSprite ? s.sprite.rig : null;
      const k = rig ? rig.battleScale : 1;
      const f: Fighter = {
        key: s.key, side: s.side, sprite: s.sprite, flat, scale: (s.scale ?? 1) * k, lift: s.lift ?? 0,
        tall: rig ? rig.height : Math.max(0.4, bb.max.y - bb.min.y), wide: rig ? Math.max(0.5, rig.height * 0.4) : Math.max(0.3, bb.max.x - bb.min.x),
        home, at: home.clone(), attackAnim: s.attackAnim ?? 'slash', steps: [], shake: 0, step: 0, active: false, down: false,
        fade: 0, fading: false, ring, ringColor: null, turnColor: s.color ?? '#ffc46e', lunge: 0, weak: false, posed: false, facing: new THREE.Vector2(0, s.side === 'party' ? -1 : 1),
      };
      if (s.weapons?.length && s.sprite instanceof CharacterSprite) s.sprite.setWeapons(s.weapons);
      this.fighters.set(s.key, f);
      return f;
    }
  }

  private centre(side: 'party' | 'enemy'): THREE.Vector3 {
    const c = new THREE.Vector3();
    let n = 0;
    for (const f of this.fighters.values()) if (f.side === side) { c.add(f.home); n++; }
    return n ? c.divideScalar(n) : c.set(this.data.width / 2, 0, this.data.height / 2);
  }

  /**
   * Where each camera preset rests: behind the party (the default), over either shoulder, high above, low and
   * looking up, and a wide angle from the side. Each backs off until every fighter is comfortably on screen.
   */
  private frameCamera(): void {
    const s = this.settings, pc = this.centre('party'), ec = this.centre('enemy');
    const back0 = new THREE.Vector3().copy(pc).sub(ec).setY(0);
    if (back0.lengthSq() < 0.01) back0.set(0, 0, 1);
    // Keep the view within about 35° of looking north, so the map's props (drawn facing south) still look right.
    const baseYaw = THREE.MathUtils.clamp(Math.atan2(back0.x, back0.z), -0.6, 0.6);
    const probe = new THREE.PerspectiveCamera(s.fov, innerWidth / Math.max(1, innerHeight), 0.3, 200);
    const p = new THREE.Vector3();
    const list = this.pocket ? [POCKET_PRESET, ...CAMERA_PRESETS] : CAMERA_PRESETS;
    this.presets = list.map((pr) => {
      const yaw = THREE.MathUtils.clamp(baseYaw + pr.yaw, -0.65, 0.65);
      const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const right = new THREE.Vector3().crossVectors(UP, back).normalize();
      const look = pc.clone().lerp(ec, pr.look).addScaledVector(right, 'lookSide' in pr ? pr.lookSide : 0);
      look.y = Math.max(pc.y, ec.y) + 0.7 + pr.lookUp;
      const dist0 = s.distance * pr.dist, height = s.height * pr.height;
      const place = (d: number) => {
        probe.position.copy(pc).addScaledVector(back, d).addScaledVector(right, -s.side + pr.side);
        probe.position.y = pc.y + height * (d / dist0);
        probe.lookAt(look);
        probe.updateMatrixWorld();
      };
      let dist = dist0;
      if (pr === POCKET_PRESET) return this.pocketCamera(probe, pc, ec, back, right, dist0, height, pr.name);
      for (let k = 0; k < 14; k++) {
        place(dist);
        let fits = true;
        for (const f of this.fighters.values()) {
          // Close cameras let the party leave the frame (over the shoulder); the enemies must stay in it.
          if (pr.fit === 'enemies' && f.side === 'party') continue;
          for (const y of [0, f.tall * f.scale]) {
            p.copy(f.home).setY(f.home.y + y).project(probe);
            if (Math.abs(p.x) > 0.84 || p.y > 0.8 || p.y < -0.6 || p.z > 1) fits = false;
          }
        }
        if (fits) break;
        dist *= 1.15;
      }
      place(dist);
      return { name: pr.name, pos: probe.position.clone(), look };
    });
    // Each battle starts from a camera chosen at random, most often the one behind the party.
    this.preset = this.pocket ? 0 : Math.random() < 0.5 ? 0 : 1 + Math.floor(Math.random() * (this.presets.length - 1));
    const first = this.presets[this.preset];
    this.cam.basePos.copy(first.pos);
    this.cam.baseLook.copy(first.look);
    // The battle opens with the camera sweeping down from high above.
    this.cam.pos.copy(first.pos).add(new THREE.Vector3(0, 5, 0)).addScaledVector(new THREE.Vector3(Math.sin(baseYaw), 0, Math.cos(baseYaw)), 4);
    this.cam.look.copy(ec).setY(ec.y + 0.5);
    this.cam.t = 0;
  }

  /**
   * The handheld camera: it always turns so the foe sits at the upper right, then tries spots behind and beside the
   * hero and keeps the one that shows the hero big at the lower left.
   */
  private pocketCamera(probe: THREE.PerspectiveCamera, pc: THREE.Vector3, ec: THREE.Vector3, back: THREE.Vector3, right: THREE.Vector3, _dist0: number, _height: number, name: string) {
    const hero = [...this.fighters.values()].find((f) => f.side === 'party'), foe = [...this.fighters.values()].find((f) => f.side === 'enemy');
    const feet = (hero?.home ?? pc).clone(), tall = hero ? hero.tall * hero.scale : 2;
    // The character frame has room above the head: the hero's head is about half way up it.
    const mid = feet.clone().setY(feet.y + tall * 0.25), head = feet.clone().setY(feet.y + tall * 0.47);
    const ep = (foe?.home ?? ec).clone().setY((foe?.home.y ?? ec.y) + (foe ? foe.tall * foe.scale * 0.5 : 0.6));
    const tanV = Math.tan(THREE.MathUtils.degToRad(probe.fov / 2)), tanH = tanV * probe.aspect;
    const turn = Math.atan(0.42 * tanH), tip = Math.atan(0.42 * tanV);
    const p = new THREE.Vector3(), dir = new THREE.Vector3(), best = { score: Infinity, pos: new THREE.Vector3(), look: new THREE.Vector3() };
    for (let b = 1.2; b <= 6; b += 0.3)
      for (let r = -2.5; r <= 2.5; r += 0.25)
        for (let h = 0.6; h <= 3.6; h += 0.2) {
          probe.position.copy(feet).addScaledVector(back, b).addScaledVector(right, r);
          probe.position.y = feet.y + h;
          probe.lookAt(ep);
          // Turn left and tip down, so the foe moves to the upper right of the view.
          probe.rotateY(turn);
          probe.rotateX(-tip);
          probe.updateMatrixWorld();
          p.copy(mid).project(probe);
          if (p.z > 1) continue;
          let score = (p.x + 0.45) ** 2 + 0.5 * (p.y + 0.5) ** 2;
          p.copy(head).project(probe);
          score += (p.y + 0.4) ** 2;
          if (score < best.score) { best.score = score; best.pos.copy(probe.position); best.look.copy(probe.position).add(probe.getWorldDirection(dir).multiplyScalar(6)); }
        }
    return { name, pos: best.pos, look: best.look };
  }

  private presets: { name: string; pos: THREE.Vector3; look: THREE.Vector3 }[] = [];
  private preset = 0;

  /** The camera's name now. */
  get cameraName(): string { return this.presets[this.preset]?.name ?? ''; }

  /** Move to the next (+1) or previous (−1) camera; returns its name. */
  cycleCamera(dir: 1 | -1): string {
    const n = this.presets.length;
    if (!n) return '';
    this.preset = (this.preset + dir + n) % n;
    this.cam.basePos.copy(this.presets[this.preset].pos);
    this.cam.baseLook.copy(this.presets[this.preset].look);
    return this.cameraName;
  }

  get fov(): number { return this.settings.fov; }

  /* ------------------------------------------------------------------ what the battle screen asks for */

  animate(key: string, how: 'lunge' | 'shot' | 'hit' | 'cast' | 'heal' | 'faint' | 'approach' | 'strike' | 'back' | 'pose' | 'unpose' | 'toss' | 'dodge', color?: string, target?: string): void {
    const f = this.fighters.get(key);
    if (!f) return;
    if (how === 'dodge') {
      // A sidestep out of the way, then back.
      if (f.down) return;
      const aside = f.home.clone();
      aside.z += 0.55;
      aside.y = this.stand(aside.x, aside.z);
      f.steps = [{ kind: 'move', to: aside, dur: 0.12, t: 0, keepFacing: true }, { kind: 'wait', dur: 0.25, t: 0 }, { kind: 'move', to: f.home.clone(), dur: 0.2, t: 0, keepFacing: true }];
      return;
    }
    const t = target ? this.fighters.get(target) : undefined;
    if (how === 'pose') {
      // Casting: turn to the camera, raise the arms and hold it.
      f.posed = true;
      f.steps = [];
      const sp = f.sprite;
      if (sp instanceof CharacterSprite && sp.has('spellcast')) sp.play('spellcast', 0.6, 0, () => { if (f.posed) sp.hold('spellcast', 4); }, 4);
      this.burst(f, color ?? '#9dffb0', 1.2, 1.4, 0.7, 0.05);
      return;
    }
    if (how === 'unpose') {
      f.posed = false;
      if (f.sprite instanceof CharacterSprite && !f.down) f.sprite.clearAction();
      this.faceFoes(f);
      return;
    }
    if (how === 'toss') {
      // An item: turn to whoever it's for, a quick toss, then back to facing the foe.
      const to = t && t !== f ? t.home.clone() : null;
      const sp = f.sprite;
      const anim = sp instanceof CharacterSprite && sp.has('thrust') ? 'thrust' : 'slash';
      f.steps = [];
      if (to) f.steps.push({ kind: 'face', to, dur: 0.12, t: 0 });
      f.steps.push({ kind: 'play', anim, dur: 0.38, t: 0, keepFacing: true }, { kind: 'wait', dur: 0.3, t: 0 }, { kind: 'face', to: null, dur: 0.05, t: 0 });
      return;
    }
    if (how === 'shot') {
      // A bow from where they stand: turn to the target, draw and loose, then face the foes again.
      this.focus(key);
      const sp = f.sprite, anim = sp instanceof CharacterSprite && sp.has('shoot') ? 'shoot' : f.attackAnim;
      f.steps = [];
      if (t) f.steps.push({ kind: 'face', to: t.home.clone(), dur: 0.1, t: 0 });
      f.steps.push({ kind: 'play', anim, dur: 0.45, t: 0, keepFacing: true }, { kind: 'wait', dur: 0.15, t: 0 });
      return;
    }
    if (how === 'lunge' || how === 'approach') {
      this.focus(key);
      f.steps = [];
      const to = t ? this.front(f, t, how === 'approach' ? 1.25 : 0.9) : this.v.copy(f.home).lerp(this.centre(f.side === 'party' ? 'enemy' : 'party'), 0.25).clone();
      to.y = this.stand(to.x, to.z);
      f.steps.push({ kind: 'move', to, dur: 0.22, t: 0, run: true });
      f.steps.push({ kind: 'play', anim: f.attackAnim, dur: 0.32, t: 0 });
      if (how === 'lunge') f.steps.push({ kind: 'wait', dur: 0.2, t: 0 }, { kind: 'move', to: f.home.clone(), dur: 0.3, t: 0, run: true });
    } else if (how === 'strike') {
      f.steps.push({ kind: 'play', anim: f.attackAnim, dur: 0.26, t: 0 });
    } else if (how === 'back') {
      f.steps.push({ kind: 'wait', dur: 0.15, t: 0 }, { kind: 'move', to: f.home.clone(), dur: 0.32, t: 0, run: true });
    } else if (how === 'hit') {
      f.shake = 0.35;
      // The hurt pose only if it faces the way they're facing (LPC's has a single, camera-facing row: just the shake).
      if (!f.down && f.sprite instanceof CharacterSprite && f.sprite.has('hurt') && f.sprite.facesAllWays('hurt')) f.sprite.play('hurt', 0.22, 0, undefined, 1);
      this.burst(f, color ?? '#ffffff', color ? 1.6 : 0.8, color ? 0.55 : 0.25);
    } else if (how === 'cast' || how === 'heal') {
      this.focus(key);
      if (f.sprite instanceof CharacterSprite && f.sprite.has('spellcast')) f.sprite.play('spellcast', 0.6);
      this.burst(f, color ?? '#9dffb0', 1.3, 0.7, how === 'heal' ? 0.8 : 0.3);
    } else if (how === 'faint') {
      if (f.side === 'enemy') f.fading = true;
      else if (!f.down) this.lie(f, true);
    }
  }

  /** Just in front of a target, on the attacker's side. */
  private front(f: Fighter, t: Fighter, gap = 0.9): THREE.Vector3 {
    const d = this.v.copy(f.home).sub(t.home).setY(0);
    const len = d.length() || 1;
    return t.home.clone().addScaledVector(d, Math.min(1, gap / len) * (len > gap ? 1 : 0));
  }

  vitals(key: string, down: boolean, guarding: boolean, weak = false): void {
    const f = this.fighters.get(key);
    if (!f) return;
    f.weak = weak && !down;
    if (f.side === 'party' && down !== f.down) this.lie(f, down);
    f.down = down;
    if (f.side === 'enemy' && !down && f.fading) { f.fading = false; f.fade = 0; }
    f.ringColor = guarding ? '#8cc8ff' : null;
  }

  private lie(f: Fighter, down: boolean): void {
    f.down = down;
    if (!(f.sprite instanceof CharacterSprite)) return;
    const s = f.sprite;
    if (down) { if (s.has('hurt')) s.play('hurt', 0.45, 0, () => s.hold('hurt', 5)); }
    else s.clearAction();
  }

  active(key: string | null): void {
    for (const f of this.fighters.values()) f.active = f.key === key;
    if (key) this.focus(key);
  }

  highlight(keys: string[]): void { this.targets = new Set(keys); }

  private focus(key: string): void { this.focusKey = key; this.focusT = 1.6; }

  /** A glow at a fighter (`at`: how far up them, 0 feet … 1 head). */
  private burst(f: Fighter, color: string, size: number, dur: number, rise = 0, at = 0.55): void {
    const m = new THREE.SpriteMaterial({ map: glow(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(m);
    sp.position.copy(f.at).addScaledVector(UP, f.tall * f.scale * at);
    sp.scale.setScalar(size * 0.4);
    sp.renderOrder = 3;
    this.group.add(sp);
    this.bursts.push({ sprite: sp, t: 0, dur, grow: size, rise });
  }

  /* ------------------------------------------------------------------ every frame */

  update(dt: number): void {
    this.elapsed += dt;
    for (const f of this.fighters.values()) this.updateFighter(f, dt);
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.sprite.scale.setScalar(b.grow * (0.4 + 0.8 * Math.sin(k * Math.PI * 0.5)));
      b.sprite.position.y += b.rise * dt;
      (b.sprite.material as THREE.SpriteMaterial).opacity = 1 - k * k;
      if (k >= 1) { b.sprite.removeFromParent(); b.sprite.material.dispose(); this.bursts.splice(i, 1); }
    }
    if (this.focusT > 0) this.focusT -= dt;
  }

  private updateFighter(f: Fighter, dt: number): void {
    const s = f.steps[0];
    let moving = false;
    if (s) {
      s.t += dt;
      if (s.kind === 'move') {
        s.from ??= f.at.clone();
        const k = Math.min(1, s.t / s.dur), e = k * k * (3 - 2 * k);
        f.at.lerpVectors(s.from, s.to, e);
        moving = k < 1;
        const dx = s.to.x - s.from.x, dz = s.to.z - s.from.z;
        // Run facing the way they go; back home, turn to face the foe again.
        if (k < 1 && !s.keepFacing && Math.hypot(dx, dz) > 0.05) this.face(f, dx, dz);
        if (k >= 1) { f.steps.shift(); if (s.to.distanceToSquared(f.home) < 0.01) this.faceFoes(f); }
      } else if (s.kind === 'face') {
        if (s.to) this.face(f, s.to.x - f.at.x, s.to.z - f.at.z); else this.faceFoes(f);
        if (s.t >= s.dur) f.steps.shift();
      } else if (s.kind === 'play') {
        if (!s.started) {
          s.started = true;
          if (!s.keepFacing) this.faceFoes(f);
          const sp = f.sprite;
          if (!(sp instanceof CharacterSprite) || !sp.play(s.anim, s.dur)) f.lunge = 0.001;
        }
        if (s.t >= s.dur) f.steps.shift();
      } else if (s.t >= s.dur) f.steps.shift();
    }
    // The one whose turn it is steps forward a little (party), like FFX.
    const want = f.active && f.side === 'party' && !f.steps.length && !f.down ? 1 : 0;
    f.step += (want - f.step) * (1 - Math.exp(-dt * 8));
    if (f.lunge > 0) f.lunge = Math.min(1, f.lunge + dt * 3.5) % 1;
    // Badly hurt: everything slows, as if each breath is an effort.
    const weak = f.weak && !f.posed && !f.steps.length && !f.down;
    const kneel = f.sprite instanceof CharacterSprite ? ['kneel', 'sit'].find((a) => f.sprite.has(a)) : undefined;
    // Standing: everyone in their plain idle (the same rows for every character sheet), not the combat stance.
    f.sprite.animate(weak ? dt * 0.5 : dt, f.flat ? { moving } : { moving, running: moving, injured: weak, battle: true });
    if (weak && kneel && f.sprite instanceof CharacterSprite && !f.sprite.acting) f.sprite.hold(kneel, 0);
    if (f.fading) f.fade = Math.min(1, f.fade + dt * 1.4);
    const m = f.sprite.mesh;
    const toward = this.v.copy(this.centre(f.side === 'party' ? 'enemy' : 'party')).sub(f.home).setY(0).normalize();
    m.position.copy(f.at).addScaledVector(toward, f.step * 0.5);
    if (f.shake > 0) { f.shake -= dt; m.position.x += Math.sin(f.shake * 70) * 0.06 * (f.shake / 0.35); }
    const sc = f.scale;
    m.scale.set(sc, sc * (1 - f.fade * 0.85), sc);
    if (weak && !kneel) {
      // No kneeling frames: crouch low, with slow, heavy breathing.
      const b = Math.sin(this.elapsed * 2.1 + f.home.x);
      m.scale.y *= 0.86 + 0.035 * b;
      m.scale.x *= 1.05 - 0.015 * b;
    }
    m.position.y += f.lift - f.fade * 0.3;
    m.visible = f.fade < 1;
    if (f.flat) f.flat.pose(f.lunge, toward.x, toward.z, !f.down && !f.fading);
    // Lying down (no "hurt" animation to fall with): tipped over.
    m.rotation.z = f.down && f.side === 'party' && !(f.sprite instanceof CharacterSprite && f.sprite.has('hurt')) ? Math.PI / 2 * 0.9 : 0;
    // Rings on the ground: the one whose turn it is (their hero colour), targets (ember), guarding (blue).
    const target = this.targets.has(f.key), color = target ? '#ff9a3c' : f.active ? f.turnColor : f.ringColor;
    const mat = f.ring.material as THREE.MeshBasicMaterial;
    const op = color && m.visible ? (target ? 0.7 + Math.sin(this.elapsed * 8) * 0.2 : 0.5) : 0;
    mat.opacity += (op - mat.opacity) * (1 - Math.exp(-dt * 12));
    if (color) mat.color.set(color);
    f.ring.position.set(m.position.x, this.stand(m.position.x, m.position.z) + 0.04, m.position.z);
    f.ring.scale.setScalar(Math.max(0.6, f.wide * sc * 0.62));
  }

  /** Face the other side: along the line from one side's middle to the other's, the same for the whole side. */
  private faceFoes(f: Fighter): void {
    const mine = this.centre(f.side), c = this.centre(f.side === 'party' ? 'enemy' : 'party');
    this.face(f, c.x - mine.x, c.z - mine.z);
  }

  /** Face this way in the world (the frame shown is worked out against the camera each frame). */
  private face(f: Fighter, dx: number, dz: number): void { if (dx || dz) f.facing.set(dx, dz); }

  /**
   * Each sprite turns to the camera, showing the frame for the way they face as seen from the camera. Everyone uses
   * the camera's own direction (not their own line to it), so fighters standing off to one side show the same frame
   * as the ones in the middle: three backs from behind the party, never two backs and a side view.
   */
  private faceCamera(camera: THREE.Camera): void {
    const back = camera.getWorldDirection(this.v).setY(0).negate();
    if (back.lengthSq() < 1e-6) back.set(0, 0, 1);
    back.normalize();
    const yaw = Math.atan2(back.x, back.z), rx = back.z, rz = -back.x; // right = up × back
    for (const f of this.fighters.values()) {
      f.sprite.mesh.rotation.y = yaw;
      const x = f.facing.x * rx + f.facing.y * rz, z = f.facing.x * back.x + f.facing.y * back.z;
      f.sprite.faceVector(x, z);
    }
  }

  /** Place the camera (sweeping in at the start, then breathing gently, leaning towards whoever acts). */
  private shotNow: Shot | null = null;

  /**
   * A close camera, or back to the usual one (null; `snap`: at once). Additions: from a little to the left of the
   * attacker and their target, following them. Casting: in front of the caster.
   */
  shot(kind: Shot['kind'] | null, a?: string, t?: string, snap = false): void {
    this.shotNow = kind && a ? { kind, a, t } : null;
    if (!kind && snap) { this.cam.pos.copy(this.cam.basePos); this.cam.look.copy(this.cam.baseLook); }
  }

  updateCamera(dt: number, camera: THREE.PerspectiveCamera): THREE.Vector3 {
    const c = this.cam;
    c.t += dt;
    const sh = this.shotNow, fa = sh ? this.fighters.get(sh.a) : undefined;
    if (sh && fa) {
      const back = new THREE.Vector3().copy(c.basePos).sub(c.baseLook).setY(0).normalize();
      const right = new THREE.Vector3().crossVectors(UP, back).normalize();
      const pos = new THREE.Vector3(), look = new THREE.Vector3();
      const A = fa.sprite.mesh.position;
      if (sh.kind === 'addition') {
        const ft = sh.t ? this.fighters.get(sh.t) : undefined, T = ft ? ft.sprite.mesh.position : A;
        const mid = new THREE.Vector3().addVectors(A, T).multiplyScalar(0.5);
        pos.copy(mid).addScaledVector(back, 2.2).addScaledVector(right, -4.2);
        pos.y = mid.y + 2;
        look.copy(mid).setY(mid.y + 0.75);
      } else {
        // In front of the caster (between them and the foes), looking back at them; they keep facing the foes.
        pos.copy(A).addScaledVector(back, -4.2).addScaledVector(right, -0.6);
        pos.y = A.y + 1.5;
        look.copy(A).setY(A.y + 0.7);
      }
      c.pos.lerp(pos, 1 - Math.exp(-dt * 4.5));
      c.look.lerp(look, 1 - Math.exp(-dt * 4.5));
      camera.position.copy(c.pos);
      this.jolt(camera.position, dt);
      camera.lookAt(c.look);
      this.faceCamera(camera);
      return c.look;
    }
    // The handheld camera sits close to the hero, so it barely drifts and doesn't lean towards whoever acts.
    const calm = this.pocket && this.preset === 0 ? 0.15 : 1;
    const sway = Math.sin(this.elapsed * 0.35) * 0.35 * calm, bob = Math.sin(this.elapsed * 0.5) * 0.12 * calm;
    const pos = this.v.copy(c.basePos);
    pos.x += sway; pos.y += bob;
    const look = this.w.copy(c.baseLook);
    const f = this.focusKey && this.focusT > 0 ? this.fighters.get(this.focusKey) : undefined;
    if (f && calm === 1) {
      // Lean towards the one acting: a party member pulls the camera behind them; an enemy draws the eye.
      const k = Math.min(1, this.focusT);
      if (f.side === 'party') pos.x += (f.home.x - this.centre('party').x) * 0.35 * k;
      look.lerp(f.at, 0.18 * k);
    }
    const rate = c.t < c.intro ? 3 : 2.2;
    c.pos.lerp(pos, 1 - Math.exp(-dt * rate));
    c.look.lerp(look, 1 - Math.exp(-dt * rate));
    camera.position.copy(c.pos);
    this.jolt(camera.position, dt);
    camera.lookAt(c.look);
    this.faceCamera(camera);
    return c.look;
  }

  /** A screen shake (a CRITICAL): the camera jolts about, dying away. */
  shake(amount: number): void { this.shakeAmt = Math.max(this.shakeAmt, amount); }
  private shakeAmt = 0;
  private jolt(p: THREE.Vector3, dt: number): void {
    if (this.shakeAmt <= 0) return;
    const a = this.shakeAmt;
    p.x += (Math.random() - 0.5) * a; p.y += (Math.random() - 0.5) * a * 0.7; p.z += (Math.random() - 0.5) * a * 0.5;
    this.shakeAmt = Math.max(0, a - dt * 0.9);
  }

  /** Where each fighter is on screen (for the battle screen's tags and numbers). */
  project(camera: THREE.Camera, width: number, height: number, place: (key: string, x: number, y: number, w: number, h: number, shown: boolean) => void): void {
    for (const f of this.fighters.values()) {
      const m = f.sprite.mesh;
      const foot = this.v.copy(m.position).project(camera);
      const head = this.w.copy(m.position).addScaledVector(UP, f.tall * f.scale).project(camera);
      const x = (foot.x * 0.5 + 0.5) * width, y = (-foot.y * 0.5 + 0.5) * height;
      const hy = (-head.y * 0.5 + 0.5) * height;
      // Sheets leave room above the head: the tags sit a little lower than the frame's top.
      const h = Math.max(8, (y - hy) * 0.84);
      place(f.key, x, y, h * (f.wide / f.tall), h, foot.z < 1 && m.visible);
    }
  }

  /** Midpoint of the fighters on screen (0 bottom … 1 top), for the tilt-shift's sharp band. */
  focusHeight(camera: THREE.Camera): number {
    const p = this.v.copy(this.centre('party')).lerp(this.centre('enemy'), 0.5).project(camera);
    return THREE.MathUtils.clamp(p.y * 0.5 + 0.5, 0.25, 0.75);
  }

  /** The battle's lights and water need their own updates (`each` is handed the built world's parts). */
  dispose(free: (root: THREE.Object3D) => void): void {
    for (const b of this.bursts) { b.sprite.removeFromParent(); b.sprite.material.dispose(); }
    this.bursts.length = 0;
    for (const f of this.fighters.values()) { (f.ring.material as THREE.Material).dispose(); f.ring.removeFromParent(); f.sprite.mesh.removeFromParent(); }
    this.fighters.clear();
    free(this.group);
    this.scene.remove(this.group);
  }
}
