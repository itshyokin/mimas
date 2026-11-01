/**
 * An enemy on the field: its sprite, what it has noticed, and how it fights.
 *
 * Awareness builds up while it can see or hear the hero (sight shrinks in the dark and while the hero
 * sneaks; noise grows with running and fighting). From 0.35 it's suspicious (?) and goes to look; at 1
 * it's alert (!) and attacks. Every attack has a wind-up the player can read and dodge.
 */
import * as THREE from 'three';
import { tintObject } from '../../render/tint';
import { CharacterSprite } from '../CharacterSprite';
import { FLY_HEIGHT, FlatSprite } from '../FlatSprite';
import { MONSTERS } from '../../art/placeholderArt';
import type { SpriteLibrary } from '../../render/sprites';
import type { TileMap } from '../../world/TileMap';
import type { Database, EnemyDef, WeaponSpriteDef } from '../../world/types';
import { canStep, findPath, walkable } from './pathing';
import { Held } from './Held';
import { builtinIcon } from '../../art/itemIcons';
import { enemyWeaponSprites } from './weaponSprites';
import { StatusSet, effectColor } from '../status';
export { DEFAULT_ENEMY_WEAPONS } from './weaponSprites';

export const ENEMY_RADIUS = 0.3;
/** Awareness at which an enemy becomes suspicious. */
export const SUSPICIOUS = 0.35;

export interface EnemyWorld {
  map: TileMap;
  /** The hero's feet. */
  px: number; py: number; pz: number;
  /** 0.15 … 1: how easy the hero is to see right now (light, sneaking). */
  visibility: number;
  /** How far away the hero can be heard right now, in tiles. */
  noise: number;
  /** A solid event (NPC, sign) stands on this tile. */
  blockedAt(x: number, z: number): boolean;
  hurtPlayer(damage: number, fromX: number, fromZ: number, from?: Enemy): void;
  /** A confused enemy hitting another. */
  hurtEnemy(target: Enemy, damage: number, from: Enemy): void;
  shoot(from: Enemy, tx: number, ty: number, tz: number): void;
  others: readonly Enemy[];
  /** 0 … 1: how lit up the hero is by firelight or a light ring (not daylight). */
  lit: number;
  /** Places no enemy will come into: around lit campfires, where the player rests. */
  safe: readonly { x: number; z: number; r: number }[];
}

type State = 'idle' | 'move' | 'windup' | 'charge' | 'recover';

/** How far light-shy enemies keep from a lit-up hero, in tiles. */
const LIGHT_SHY_DISTANCE = 4.5;

function inSafe(safe: readonly { x: number; z: number; r: number }[], x: number, z: number, margin: number): boolean {
  return safe.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + margin);
}

export class Enemy {
  x: number; y: number; z: number;
  hp: number;
  readonly maxHp: number;
  awareness = 0;
  alert = false;
  /** Ailments and buffs on it. */
  readonly status: StatusSet;
  /** Seconds since it became alert (the ! shows for a moment). */
  alertAge = 0;
  dead = false;
  /** Fully faded out after dying. */
  gone = false;
  private state: State = 'idle';
  private t = 0;
  private cooldown = 0.5;
  private lostFor = 0;
  private last: { x: number; z: number } | null = null;
  private kx = 0; private kz = 0;
  private flash = 0;
  private deadT = 0;
  private fx = 0; private fz = 1;
  private wanderAt = 1 + Math.random() * 2;
  private wanderTo: { x: number; z: number } | null = null;
  private charge = { dx: 0, dz: 0, hit: false };
  /** Cells to walk through when the way isn't straight (around a cliff, up a ramp). */
  private path: [number, number][] = [];
  private pathGoal = '';
  private repath = 0;
  private readonly home: { x: number; z: number };
  private readonly sprite: CharacterSprite;
  /** Its picture or model (Update 156: turned to the camera on 3D maps), and whether it's a 3D model. */
  get visual(): THREE.Object3D { return this.sprite.mesh; }
  get rigged(): boolean { return !!this.sprite.rig; }
  /** Its sprite's mesh (for its reflection in water). */
  get spriteMesh(): THREE.Mesh { return this.sprite.mesh; }
  /** A flat-image enemy's sprite (the same object as `sprite`), for its generic motion. */
  private readonly flat: FlatSprite | null = null;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly scale: number;
  /** The weapon it shows while attacking (null: none, like a slime). */
  private readonly held: Held | null;
  private readonly weaponIcon: HTMLCanvasElement | null;
  /** LPC weapon sprites it fights with (drawn only while attacking), and the icons slung on its back otherwise. */
  private readonly carry: { def: WeaponSpriteDef; map: THREE.Texture }[];
  private readonly backIcons: { weapon: HTMLCanvasElement | null; shield: HTMLCanvasElement | null } | null;
  private strikeT = 0;
  /** The animation its melee strike plays (what its weapon sprite swings with). */
  private readonly attackAnim: string;
  private posed = false;
  private age = 0;

  constructor(readonly def: EnemyDef, readonly key: object, private readonly level: THREE.Object3D, sprites: SpriteLibrary, db: Database, x: number, z: number, private readonly map: TileMap) {
    this.x = x; this.z = z; this.y = map.standY(x, z);
    this.home = { x, z };
    this.hp = this.maxHp = Math.max(1, def.hp);
    this.status = new StatusSet({ resists: def.resists, undead: def.undead, boss: def.boss });
    const monster = def.look.monster && MONSTERS[def.look.monster];
    const person = def.look.character ? db.characters[def.look.character] : undefined;
    const picture = def.look.image ? sprites.flat(def.look.image, def.look.flat?.height ?? 1) : null;
    if (picture) this.flat = new FlatSprite(picture, def.look.flat ?? {}, def.look.flat?.height ?? 1);
    // (A flat sprite answers the same calls as a character sprite.)
    this.sprite = this.flat ? this.flat as unknown as CharacterSprite
      : monster ? new CharacterSprite(sprites, sprites.sheet(monster.draw()), 'down')
      : person ? new CharacterSprite(sprites, sprites.forCharacter(person), 'down')
      : new CharacterSprite(sprites, sprites.sheet(MONSTERS.slime.draw()), 'down');
    if (def.tint) tintObject(this.sprite.mesh, def.tint);
    this.material = this.sprite.mesh.material as THREE.MeshStandardMaterial;
    this.scale = def.scale ?? 1;
    this.sprite.mesh.scale.setScalar(this.scale);
    level.add(this.sprite.mesh);
    // People carry something: a bow for archers, a sword otherwise (Database → Enemies can choose).
    const w = this.flat ? def.weapon ?? '' : def.weapon ?? (def.look.character ? (def.behaviour === 'ranged' ? 'bow' : 'sword') : '');
    // Animated (LPC) people carry LPC weapon sprites, drawn with their own swings, instead of an icon.
    const carry = this.sprite.animated && def.look.character ? enemyWeaponSprites(def, w).map((id) => sprites.weapon(id)).filter((x) => !!x) : [];
    this.carry = carry as { def: WeaponSpriteDef; map: THREE.Texture }[];
    const weaponDef = carry.length ? carry[carry.length - 1]!.def : null;
    this.attackAnim = !weaponDef || def.behaviour === 'ranged' ? (def.behaviour === 'ranged' ? 'shoot' : 'slash')
      : (['slash', 'slash_reverse', 'thrust'].find((a) => weaponDef.anims.includes(a)) ?? 'slash');
    const iconOnly = w && !(weaponDef && (def.behaviour === 'ranged' ? weaponDef.kind === 'bow' : weaponDef.kind !== 'bow' && weaponDef.kind !== 'shield'));
    this.weaponIcon = iconOnly ? builtinIcon(w) : null;
    // Sprite carriers sling their weapon on the back (its icon) until they attack.
    this.backIcons = !iconOnly && this.carry.length ? {
      weapon: w ? builtinIcon(w) : null,
      shield: this.carry.some((c) => c.def.kind === 'shield') ? builtinIcon('shield') : null,
    } : null;
    this.held = iconOnly || this.backIcons ? new Held(level, this.scale) : null;
    this.sync(0, false);
  }

  /** Not yet suspicious: a hit now is a sneak attack. */
  get unaware(): boolean { return !this.alert && this.awareness < SUSPICIOUS; }
  get telegraphing(): boolean { return this.state === 'windup'; }
  get height(): number { return this.flat ? (this.flat.tall + (this.flat.flies ? FLY_HEIGHT : 0)) * this.scale : 1.2 * this.scale; }

  remove(): void { this.level.remove(this.sprite.mesh); this.held?.remove(); }

  /** Take a hit. Returns true when this hit defeated it. */
  /** Absorbing an element: health back, up to the most it has. */
  heal(amount: number): void { if (!this.dead) this.hp = Math.min(this.maxHp, this.hp + Math.max(0, amount)); }

  /** Damage over time (burn, poison): no flinch, no knock-back. Returns true when it finished it off. */
  dot(amount: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.flash = 0.06;
    if (this.hp > 0) return false;
    this.hp = 0; this.dead = true; this.deadT = 0; this.held?.hide();
    this.sprite.play('hurt', 0.5, 0, () => this.sprite.hold('hurt', 5));
    return true;
  }

  /** Its speed now (Chill slows it). */
  private get spd(): number { return this.def.speed * this.status.speed; }

  hurt(amount: number, fromX: number, fromZ: number, knock: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.flash = 0.16;
    const dx = this.x - fromX, dz = this.z - fromZ, d = Math.hypot(dx, dz) || 1;
    this.kx = (dx / d) * knock; this.kz = (dz / d) * knock;
    this.becomeAlert(fromX, fromZ);
    // A hit interrupts a wind-up (not a charge already under way, and bosses shrug it off).
    if (this.state === 'windup' && !this.def.boss) { this.state = 'recover'; this.t = 0.35; this.cooldown = Math.max(this.cooldown, 0.6); }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.deadT = 0; this.held?.hide();
      // Animated sheets fall down (the hurt animation) before fading away.
      this.sprite.play('hurt', 0.5, 0, () => this.sprite.hold('hurt', 5));
      return true;
    }
    this.sprite.play('hurt', 0.2, 0, undefined, 1);
    return false;
  }

  /** Beaten in a turn-based battle: down at once (it falls, then fades). */
  defeat(): void {
    if (this.dead) return;
    this.hp = 0; this.dead = true; this.deadT = 0; this.held?.hide();
    this.sprite.play('hurt', 0.5, 0, () => this.sprite.hold('hurt', 5));
  }

  /** The hero got away (turn-based): it loses track of them for now and wanders back. */
  calm(): void {
    if (this.dead) return;
    this.alert = false;
    this.awareness = 0.3;
    this.state = 'idle';
    this.t = 0;
    this.cooldown = Math.max(this.cooldown, 2);
  }

  /** Remembered between battles: the health it has left (turn-based battles that were run from). */
  setHp(hp: number): void { if (!this.dead) this.hp = Math.max(1, Math.min(this.maxHp, hp)); }

  /** Knocked off balance (a parry): no attacking for a moment. */
  stagger(seconds: number): void {
    if (this.dead) return;
    this.state = 'recover'; this.t = this.def.boss ? seconds * 0.4 : seconds;
    this.cooldown = Math.max(this.cooldown, this.t + 0.3);
    this.flash = 0.2;
  }

  /** Something gave the hero away (a hit, a friend's shout). */
  becomeAlert(atX: number, atZ: number): void {
    if (this.dead) return;
    if (!this.alert) this.alertAge = 0;
    this.alert = true;
    this.awareness = 1;
    this.lostFor = 0;
    this.last = { x: atX, z: atZ };
  }

  /** A noise nearby (a friend dying): it comes to look. */
  disturb(atX: number, atZ: number, amount: number): void {
    if (this.dead || this.alert) return;
    this.awareness = Math.min(0.99, this.awareness + amount);
    this.last = { x: atX, z: atZ };
  }

  update(dt: number, w: EnemyWorld): void {
    if (this.dead) { this.updateDeath(dt); return; }
    this.cooldown -= dt;
    this.alertAge += dt;
    this.flash = Math.max(0, this.flash - dt);
    // Knock-back slides it and fades out.
    if (this.kx || this.kz) {
      this.tryMove(this.kx * dt, this.kz * dt, w);
      const decay = Math.exp(-dt * 9);
      this.kx *= decay; this.kz *= decay;
      if (Math.hypot(this.kx, this.kz) < 0.05) this.kx = this.kz = 0;
    }
    // Frozen, paralysed, asleep or staggered: nothing but the knock-back (an attack being wound up is lost).
    if (this.status.stunned) {
      if (this.state === 'windup' || this.state === 'charge') { this.state = 'recover'; this.t = 0.2; }
      this.cooldown = Math.max(this.cooldown, 0.5);
      this.sync(dt, false);
      return;
    }
    if (this.status.confused) { const moving = this.confusedTurn(dt, w); this.separate(w); this.sync(dt, moving); return; }
    this.perceive(dt, w);
    let moving = false;
    const dx = w.px - this.x, dz = w.pz - this.z, dist = Math.hypot(dx, dz);
    // Light-shy enemies won't come near a lit-up hero; and none will go after someone resting in a camp.
    const shy = this.def.light === 'avoid' && w.lit > 0.25, camped = inSafe(w.safe, w.px, w.pz, 0);
    if (this.alert && (shy || camped) && this.state !== 'charge') {
      if (this.state === 'windup') this.state = 'move';
      moving = shy && dist < LIGHT_SHY_DISTANCE ? this.moveToward(this.x - dx, this.z - dz, this.spd * 0.7, dt, w, 0) : false;
      if (!moving) this.face(dx, dz);
    } else if (this.alert) moving = this.fight(dt, w, dx, dz, dist);
    else if (this.awareness >= SUSPICIOUS && this.last) moving = this.investigate(dt, w);
    else moving = this.wander(dt, w);
    this.separate(w);
    this.sync(dt, moving);
  }

  /* ---------------------------------------------------------------- senses */

  private perceive(dt: number, w: EnemyWorld): void {
    const dx = w.px - this.x, dz = w.pz - this.z, dist = Math.hypot(dx, dz);
    const sight = this.def.sight * (0.35 + 0.65 * w.visibility) * (this.status.blind ? 0.3 : 1);
    const facing = dist > 0 ? (dx * this.fx + dz * this.fz) / dist : 1;
    const inCone = dist < 1.3 || facing >= Math.cos(((this.def.fov || 120) * Math.PI) / 360);
    const seen = dist < sight && inCone && lineOfSight(this.map, this.x, this.y + 0.9, this.z, w.px, w.py + 0.8, w.pz);
    const hearing = w.noise * ((this.def.hearing || 5) / 5);
    const heard = dist < hearing;
    let rate = 0;
    if (seen) rate += (1.3 - dist / sight) * 1.8;
    // Some (bandits) spot a hero carrying a light or by a fire much sooner.
    if (seen && this.def.light === 'drawn') rate *= 1 + 1.5 * w.lit;
    if (heard) rate += (1 - dist / hearing) * 1.2;
    if (rate > 0) {
      this.awareness = Math.min(1, this.awareness + rate * dt);
      if (this.awareness >= 1 && !this.alert) { this.alert = true; this.alertAge = 0; }
      this.last = { x: w.px, z: w.pz };
      this.lostFor = 0;
    } else if (this.alert) {
      // Lost sight of the hero: keep hunting a while, then search, then give up.
      this.lostFor += dt;
      if (this.lostFor > 6) { this.alert = false; this.awareness = 0.7; }
    } else this.awareness = Math.max(0, this.awareness - dt * 0.12);
  }

  /* ---------------------------------------------------------------- behaviour */

  private fight(dt: number, w: EnemyWorld, dx: number, dz: number, dist: number): boolean {
    const d = this.def, speed = this.spd;
    // Hunting the last place it saw the hero.
    if (this.lostFor > 0 && this.state !== 'charge' && this.last) return this.moveToward(this.last.x, this.last.z, speed * 0.8, dt, w, 0.4);
    if (this.state !== 'charge') this.face(dx, dz);
    if (this.state === 'windup') {
      this.t -= dt;
      if (this.t <= 0) this.strike(w, dx, dz, dist);
      return false;
    }
    if (this.state === 'charge') {
      this.t -= dt;
      const step = d.speed * 3.4 * this.status.speed * dt;
      const moved = this.tryMove(this.charge.dx * step, this.charge.dz * step, w);
      if (!this.charge.hit && dist < 0.75) { this.charge.hit = true; w.hurtPlayer(d.damage, this.x, this.z, this); }
      if (this.t <= 0 || !moved) { this.state = 'recover'; this.t = moved ? 0.5 : 0.9; this.cooldown = d.cooldown; }
      return true;
    }
    if (this.state === 'recover') { this.t -= dt; if (this.t <= 0) this.state = 'move'; return false; }
    const range = d.attackRange;
    // Silenced casters can't cast: they keep their distance.
    const mute = d.attackType === 'magic' && this.status.silenced;
    if (d.behaviour === 'ranged') {
      const clear = lineOfSight(this.map, this.x, this.y + 0.8, this.z, w.px, w.py + 0.6, w.pz);
      if (dist < range * 0.5) return this.moveToward(this.x - dx, this.z - dz, speed * 0.8, dt, w, 0);
      if (dist > range || !clear) return this.moveToward(w.px, w.pz, speed, dt, w, range * 0.8);
      if (this.cooldown <= 0 && !mute) this.startWindup();
      return false;
    }
    if (mute) return dist < range + 1.5 ? this.moveToward(this.x - dx, this.z - dz, speed * 0.6, dt, w, 0) : false;
    if (dist > range) return this.moveToward(w.px, w.pz, speed, dt, w, range * 0.8);
    if (this.cooldown <= 0 && (d.behaviour !== 'charger' || lineOfSight(this.map, this.x, this.y + 0.5, this.z, w.px, w.py + 0.5, w.pz))) {
      this.startWindup();
      if (d.behaviour === 'charger') { const l = dist || 1; this.charge = { dx: dx / l, dz: dz / l, hit: false }; }
    }
    return false;
  }

  private startWindup(): void { this.state = 'windup'; this.t = Math.max(0.1, this.def.windup) / this.status.speed; }

  /** Confused: wanders about at random, and swings at any other enemy that ends up in reach. */
  private confusedTurn(dt: number, w: EnemyWorld): boolean {
    this.state = 'idle';
    this.wanderAt -= dt;
    if (this.wanderAt <= 0 || !this.wanderTo) {
      this.wanderAt = 0.8 + Math.random() * 1.2;
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 1.8;
      this.wanderTo = { x: this.x + Math.cos(a) * r, z: this.z + Math.sin(a) * r };
    }
    if (this.cooldown <= 0) {
      const reach = Math.max(1, this.def.attackRange) + 0.4;
      const o = w.others.find((x) => x !== this && !x.dead && Math.hypot(x.x - this.x, x.z - this.z) < reach);
      if (o) {
        this.face(o.x - this.x, o.z - this.z);
        this.cooldown = this.def.cooldown;
        this.strikeT = 0.28;
        this.sprite.play(this.attackAnim, 0.3, this.attackAnim === 'slash' ? 1 : 0);
        w.hurtEnemy(o, this.def.damage, this);
        return false;
      }
    }
    const moved = this.moveToward(this.wanderTo.x, this.wanderTo.z, this.spd * 0.55, dt, w, 0.15);
    if (!moved) this.wanderTo = null;
    return moved;
  }

  private strike(w: EnemyWorld, dx: number, dz: number, dist: number): void {
    const d = this.def;
    this.state = 'recover'; this.t = 0.3; this.cooldown = d.cooldown;
    if (d.behaviour === 'ranged') { w.shoot(this, w.px, w.py + 0.6, w.pz); this.sprite.play('shoot', 0.25, 9); return; }
    if (d.behaviour === 'charger') {
      // The charge keeps the direction it aimed at the start of the wind-up: sidestep it.
      this.state = 'charge'; this.t = (d.attackRange + 1.5) / (d.speed * 3.4);
      return;
    }
    this.strikeT = 0.28;
    this.sprite.play(this.attackAnim, 0.3, this.attackAnim === 'slash' ? 1 : 0);
    const facing = dist > 0 ? (dx * this.fx + dz * this.fz) / dist : 1;
    if (dist <= d.attackRange + 0.45 && facing > 0.3) w.hurtPlayer(d.damage, this.x, this.z, this);
  }

  private investigate(dt: number, w: EnemyWorld): boolean {
    const l = this.last!;
    if (Math.hypot(l.x - this.x, l.z - this.z) < 0.6) {
      // Look around.
      this.t -= dt;
      if (this.t <= 0) { this.t = 0.9; const a = Math.random() * Math.PI * 2; this.face(Math.cos(a), Math.sin(a)); }
      return false;
    }
    return this.moveToward(l.x, l.z, this.spd * 0.55, dt, w, 0.5);
  }

  private wander(dt: number, w: EnemyWorld): boolean {
    this.state = 'idle';
    this.wanderAt -= dt;
    if (this.wanderAt <= 0) {
      this.wanderAt = 2 + Math.random() * 3;
      const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 2.2;
      this.wanderTo = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
    }
    if (!this.wanderTo) return false;
    const moved = this.moveToward(this.wanderTo.x, this.wanderTo.z, this.spd * 0.4, dt, w, 0.15);
    if (!moved) this.wanderTo = null;
    return moved;
  }

  /* ---------------------------------------------------------------- movement */

  private moveToward(tx: number, tz: number, speed: number, dt: number, w: EnemyWorld, stop: number): boolean {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d <= stop || d < 1e-3) return false;
    const step = Math.min(d - stop, speed * dt);
    // No straight way there (a cliff, water, a wall): follow a path around it.
    if (d > 1 && !this.straightWay(tx, tz, w)) {
      if (this.followPath(tx, tz, speed * dt, dt, w)) return true;
    } else this.path.length = 0;
    this.face(dx, dz);
    if (this.tryMove((dx / d) * step, (dz / d) * step, w)) return true;
    // Blocked: try sidestepping around it.
    const sx = -dz / d, sz = dx / d, side = (Math.floor(this.home.x * 7 + this.home.z * 3) % 2) ? 1 : -1;
    return this.tryMove(sx * step * side, sz * step * side, w) || this.tryMove(-sx * step * side, -sz * step * side, w);
  }

  /** Can it walk straight to a point (no blocked cells, no steps too high on the way)? */
  private straightWay(tx: number, tz: number, w: EnemyWorld): boolean {
    const m = this.map, d = Math.hypot(tx - this.x, tz - this.z), n = Math.ceil(d / 0.3);
    let px = Math.floor(this.x), pz = Math.floor(this.z);
    for (let i = 1; i <= n; i++) {
      const x = this.x + ((tx - this.x) * i) / n, z = this.z + ((tz - this.z) * i) / n, cx = Math.floor(x), cz = Math.floor(z);
      if (cx === px && cz === pz) continue;
      if (!walkable(m, cx, cz, w)) return false;
      // A diagonal crossing goes through one of the side cells: both steps must work.
      if (cx !== px && cz !== pz) { if (!(canStep(m, px, pz, cx, pz) && canStep(m, cx, pz, cx, cz)) && !(canStep(m, px, pz, px, cz) && canStep(m, px, cz, cx, cz))) return false; }
      else if (!canStep(m, px, pz, cx, cz)) return false;
      px = cx; pz = cz;
    }
    return true;
  }

  private followPath(tx: number, tz: number, step: number, dt: number, w: EnemyWorld): boolean {
    const goal = `${Math.floor(tx)},${Math.floor(tz)}`;
    this.repath -= dt;
    if (goal !== this.pathGoal || this.repath <= 0 || !this.path.length) {
      this.path = findPath(this.map, Math.floor(this.x), Math.floor(this.z), Math.floor(tx), Math.floor(tz), w) ?? [];
      this.pathGoal = goal;
      this.repath = 0.7;
    }
    while (this.path.length) {
      const [cx, cz] = this.path[0], ex = cx + 0.5 - this.x, ez = cz + 0.5 - this.z, d = Math.hypot(ex, ez);
      if (d < 0.18) { this.path.shift(); continue; }
      this.face(ex, ez);
      const k = Math.min(step, d) / d;
      return this.tryMove(ex * k, ez * k, w);
    }
    return false;
  }

  /** Move by (dx, dz) if the ground allows it, sliding along walls. */
  private tryMove(dx: number, dz: number, w: EnemyWorld): boolean {
    let moved = false;
    if (dx && this.free(this.x + dx, this.z, w) && !this.intoSafe(this.x + dx, this.z, w)) { this.x += dx; moved = true; }
    if (dz && this.free(this.x, this.z + dz, w) && !this.intoSafe(this.x, this.z + dz, w)) { this.z += dz; moved = true; }
    if (moved) this.y = this.map.standY(this.x, this.z, this.y);
    return moved;
  }

  /** Would this step take it further into a camp's safe ground? (Already inside, it may only leave.) */
  private intoSafe(x: number, z: number, w: EnemyWorld): boolean {
    for (const s of w.safe) {
      const now = Math.hypot(this.x - s.x, this.z - s.z), next = Math.hypot(x - s.x, z - s.z);
      if (next < s.r && next < now) return true;
    }
    return false;
  }

  private free(x: number, z: number, w: EnemyWorld): boolean {
    const r = ENEMY_RADIUS, fromY = this.y;
    for (const [px, pz] of [[x - r, z - r * 0.6], [x + r, z - r * 0.6], [x - r, z + r * 0.6], [x + r, z + r * 0.6]]) {
      const cx = Math.floor(px), cz = Math.floor(pz), m = this.map;
      if (!m.inMap(cx, cz) || m.isBlocked(cx, cz) || w.blockedAt(cx, cz) || m.inBox(px, pz)) return false;
      if (!m.deckStepOK(Math.floor(this.x), Math.floor(this.z), cx, cz, this.y)) return false;
      const wtr = m.footWaterAt(cx, cz, this.y);
      if (wtr && wtr.kind !== 'shallow') return false;
      if (Math.abs(m.standY(px, pz, this.y) - fromY) > 0.25) return false;
    }
    return true;
  }

  /** Keep a little space from other enemies and the hero. */
  private separate(w: EnemyWorld): void {
    for (const o of w.others) {
      if (o === this || o.dead) continue;
      const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz);
      if (d > 0 && d < ENEMY_RADIUS * 2) this.tryMove((dx / d) * (ENEMY_RADIUS * 2 - d) * 0.5, (dz / d) * (ENEMY_RADIUS * 2 - d) * 0.5, w);
    }
    const dx = this.x - w.px, dz = this.z - w.pz, d = Math.hypot(dx, dz), min = ENEMY_RADIUS + 0.28;
    if (d > 0 && d < min && this.state !== 'charge') this.tryMove((dx / d) * (min - d), (dz / d) * (min - d), w);
  }

  private face(dx: number, dz: number): void {
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return;
    this.fx = dx / d; this.fz = dz / d;
    this.sprite.faceVector(dx, dz);
  }

  /* ---------------------------------------------------------------- looks */

  private sync(dt: number, moving: boolean): void {
    const m = this.sprite.mesh;
    this.age += dt;
    this.strikeT = Math.max(0, this.strikeT - dt);
    // Its weapon: raised during the wind-up, swung on the strike; an archer's bow while aiming.
    // LPC weapons: in hand from the wind-up to the end of the attack, on the back the rest of the time.
    if (this.carry.length) {
      const fighting = !this.dead && (this.state === 'windup' || this.state === 'recover' || this.strikeT > 0);
      this.sprite.setWeapons(fighting ? this.carry : []);
      if (this.held && this.backIcons) {
        if (fighting || this.dead) this.held.hideBack();
        else {
          const ranged = this.def.behaviour === 'ranged';
          this.held.back(ranged ? null : this.backIcons.weapon, ranged ? this.backIcons.weapon : null, m.position, this.sprite.dir, this.backIcons.shield, ranged);
        }
      }
    }
    if (this.held && this.weaponIcon) {
      const pos = m.position, dir = this.sprite.dir;
      if (this.def.behaviour === 'ranged') {
        if (this.state === 'windup') this.held.bow(this.weaponIcon, pos, dir, 1 - this.t / Math.max(0.1, this.def.windup)); else this.held.hideItem();
      } else if (this.state === 'windup') this.held.ready(this.weaponIcon, pos, dir, this.age);
      else if (this.strikeT > 0) this.held.swing(this.weaponIcon, pos, dir, 1 - this.strikeT / 0.28);
      else this.held.hideItem();
    }
    m.position.set(this.x, this.y, this.z);
    // Animated sheets: the wind-up shows the weapon raised (or the bow being drawn).
    if (this.state === 'windup') {
      const k = 1 - this.t / Math.max(0.1, this.def.windup);
      if (this.def.behaviour === 'ranged') this.sprite.hold('shoot', Math.min(8, Math.floor(k * 8)));
      else this.sprite.hold(this.attackAnim, 0);
      this.posed = true;
    } else if (this.posed) { this.posed = false; this.sprite.hold(null); }
    if (this.sprite.animated) this.sprite.animate(dt, { moving: moving || this.state === 'charge', running: this.state === 'charge' || this.alert, combat: this.alert });
    else this.sprite.animate(dt * (this.state === 'charge' ? 2.2 : 1), moving || this.state === 'charge');
    // Tells: a wind-up glows amber (red for a charge) and rises a little; a hit flashes white.
    const wind = this.state === 'windup' ? Math.max(0, 1 - this.t / Math.max(0.1, this.def.windup)) : 0;
    if (this.flash > 0) { this.material.emissive.setRGB(1, 1, 1); this.material.emissiveIntensity = 1.4; }
    else if (wind > 0) {
      if (this.def.behaviour === 'charger') this.material.emissive.setRGB(1, 0.15, 0.05); else this.material.emissive.setRGB(1, 0.6, 0.1);
      this.material.emissiveIntensity = 0.25 + wind * 0.9;
    } else {
      // An ailment tints it (pulsing gently): frozen icy white, poison green, burn orange…
      const tint = this.status.list.find((e) => !e.id.startsWith('buff:'));
      if (tint || this.status.zombie) {
        const c = new THREE.Color(effectColor(tint?.id ?? 'zombie'));
        this.material.emissive.copy(c);
        this.material.emissiveIntensity = (tint?.id === 'frozen' ? 0.55 : 0.28) + Math.sin(this.age * 5) * 0.08;
      } else this.material.emissiveIntensity = 0;
    }
    m.position.y += wind * 0.08;
    m.scale.set(this.scale * (1 + wind * 0.08), this.scale * (1 - wind * 0.06), this.scale);
    // A flat picture: breathing, sliding, hopping or flying, and a lunge when it strikes.
    if (this.flat) {
      const lunge = this.strikeT > 0 && this.def.behaviour !== 'ranged' ? 1 - this.strikeT / 0.28 : 0;
      this.flat.pose(lunge, this.fx, this.fz);
    }
  }

  private updateDeath(dt: number): void {
    this.deadT += dt;
    if (this.sprite.animated) {
      // Falls, lies still a moment, then fades out.
      this.sprite.animate(dt, false);
      const k = Math.max(0, Math.min(1, (this.deadT - 0.9) / 0.5));
      this.material.transparent = true;
      this.material.opacity = 1 - k;
      this.material.emissiveIntensity = 0;
      if (k >= 1 && !this.gone) { this.gone = true; this.remove(); }
      return;
    }
    const k = Math.min(1, this.deadT / 0.5), m = this.sprite.mesh;
    this.material.emissive.setRGB(1, 1, 1);
    this.material.emissiveIntensity = 1.2 * (1 - k);
    m.scale.set(this.scale * (1 + k * 0.4), this.scale * (1 - k), this.scale);
    this.flat?.pose(0, 0, 0, false);
    if (k >= 1 && !this.gone) { this.gone = true; this.remove(); }
  }
}

/** Can a point see another? Walls (solid cells) and higher ground in between block the view. */
export function lineOfSight(map: TileMap, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.3));
  for (let i = 1; i < n; i++) {
    const k = i / n, x = ax + (bx - ax) * k, z = az + (bz - az) * k, y = ay + (by - ay) * k;
    const cx = Math.floor(x), cz = Math.floor(z);
    if (!map.inMap(cx, cz) || map.isSolid(cx, cz)) return false;
    if (map.standY(x, z, y) > y - 0.15) return false;
  }
  return true;
}

