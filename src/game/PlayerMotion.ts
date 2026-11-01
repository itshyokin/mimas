/**
 * How the player moves over the map: walking and running, wading and swimming, jumping
 * (with gravity), climbing climbable cliffs and crawling through low gaps.
 * No three.js here, so it can be tested on its own.
 */
import type { TileMap } from '../world/TileMap';
import type { Ability, Dir } from '../world/types';

/** Half the player's footprint (x) and its depth (z), in tiles. */
export let PLAYER_RADIUS = 0.26;
let RZ = PLAYER_RADIUS * 0.6;
/**
 * 2D mode (Update 151): the hero's body nearly fills a tile, so walls and trees stop him where their tiles are, like
 * RPG Maker (3D: a small body at his feet).
 */
export function setBody2D(on: boolean): void {
  PLAYER_RADIUS = on ? 0.4 : 0.26;
  RZ = on ? 0.45 : 0.26 * 0.6;
}
/** Highest rise or drop the player can walk over without a ramp (a height step is 0.5). */
export const MAX_STEP = 0.2;
/** Movement speeds in tiles per second (set in the database). */
export interface Speeds { walk: number; run: number; wade: number; swim: number; crawl: number; climb: number }
export const DEFAULT_SPEEDS: Speeds = { walk: 3.4, run: 6.1, wade: 2.4, swim: 1.9, crawl: 1.5, climb: 1.8 };
/** How far below the surface the player sinks while swimming. */
export const SWIM_SINK = 0.62;
const GRAVITY = 22;
/** Take-off speed: the jump peaks 0.8 above the ground, enough to land one step (0.5) higher. */
const JUMP_SPEED = Math.sqrt(2 * GRAVITY * 0.8);
/** A jump may land at most this far below where it started (two steps); further is a fall. */
const MAX_FALL = 1.0;
/** Seconds of pushing against a climbable wall before the player starts climbing it. */
const CLIMB_PUSH = 0.1;

/**
 * Walking off ledges (Database → Player → Ledges). Collision: a drop is a wall (jump down, at most two steps).
 * Walk off: the hero walks off any edge and drops to the ground below. Limited: walk off anywhere except into
 * cells whose height (in steps) is between `min` and `max` (pits and chasms, -10 to -5 by default).
 */
export interface LedgeRules { mode: 'collision' | 'walk' | 'limited'; min: number; max: number }
export const DEFAULT_LEDGES: LedgeRules = { mode: 'limited', min: -10, max: -5 };

export interface MotionWorld {
  map: TileMap;
  /** A solid event (NPC, sign…) stands on this tile. */
  solidEvent(x: number, z: number): boolean;
  /** Can the player use this ability right now (learned, and not out of stamina)? */
  has(a: Ability): boolean;
  speed?: Speeds;
  /** Walking off ledges (default: limited, -10 … -5). */
  ledges?: LedgeRules;
  /** A ring power lets the player walk on water (any depth) as if it were ground. */
  waterWalk?(): boolean;
  /** Riding: water too deep to wade stops the horse (it doesn't swim). */
  noSwim?(): boolean;
  /** Riding: a jump is a leap this many tiles long the way the horse is going (null: an ordinary jump). */
  leap?(): number | null;
  /** The current at a cell (tiles per second, east and south): rivers carry swimmers along. */
  current?(cx: number, cz: number): [number, number] | null;
}

export interface MotionInput {
  /** Direction to move (length 1), or 0, 0 to stand still. */
  dx: number; dz: number;
  run: boolean;
  /** Jump was pressed this frame. */
  jump: boolean;
  /** Sneaking: slow and quiet (no running). */
  sneak?: boolean;
  /** Speed multiplier (drawing a bow slows the hero down). */
  speedScale?: number;
}

/** Sneaking speed as a share of walking speed. */
export const SNEAK_SPEED = 0.55;

export interface MotionResult {
  moving: boolean;
  /** Tried to move but couldn't. */
  blocked: boolean;
  /** Fell (missed a jump): the player was put back where the jump started. */
  fell: boolean;
  /** Direction the sprite should face, when it changed. */
  face: Dir | null;
  /** A jump started this frame. */
  jumped?: boolean;
}

type V3 = [number, number, number];
type State =
  | { kind: 'ground' }
  /**
   * In the air: a jump, or walking off a ledge (`auto`: the way it carries the hero until clear of the edge, whatever
   * is held; `drop`: walked off, so any height is fine where the ledge rules allow it).
   */
  | { kind: 'air'; vy: number; speed: number; from: V3; auto?: [number, number]; drop?: boolean }
  | { kind: 'climb'; path: V3[]; seg: number; face: Dir }
  | { kind: 'dash'; dx: number; dz: number; speed: number; left: number };

export class PlayerMotion {
  x = 0; y = 0; z = 0;
  state: State = { kind: 'ground' };
  crawling = false;
  running = false;
  private push = { t: 0, key: '' };
  /** The last spot on solid ground (or wadeable / swimmable water), for when water walking ends over deep water. */
  private safe: [number, number] | null = null;
  private time = 0;
  /** Sliding on ice: velocity (tiles per second, x and z). */
  private slide: [number, number] = [0, 0];
  /** Update 152: grid movement (2D mode): the hero steps from tile centre to tile centre, like RPG Maker. */
  grid = false;
  private gridStep: { tx: number; tz: number } | null = null;

  constructor(private readonly w: MotionWorld) {}

  get map(): TileMap { return this.w.map; }
  get airborne(): boolean { return this.state.kind === 'air'; }
  get climbing(): boolean { return this.state.kind === 'climb'; }
  get dashing(): boolean { return this.state.kind === 'dash'; }

  /**
   * A quick dash along the ground (a dodge roll, or being knocked back): `dist` tiles over `time` seconds.
   * Stops at walls and cliff edges. Returns false where it can't start (in the air, climbing, swimming).
   */
  dash(dx: number, dz: number, dist: number, time: number): boolean {
    if (this.state.kind !== 'ground' || this.swimming) return false;
    const len = Math.hypot(dx, dz);
    if (!len) return false;
    this.state = { kind: 'dash', dx: dx / len, dz: dz / len, speed: dist / Math.max(0.01, time), left: time };
    return true;
  }
  /** In swimmable water (not wading, not jumping over it). */
  get swimming(): boolean { return this.state.kind === 'ground' && !this.onWater && this.map.footWaterAt(Math.floor(this.x), Math.floor(this.z), this.y)?.kind === 'swim'; }
  /** Walking on water right now (ring power active). */
  get onWater(): boolean { return !!this.w.waterWalk?.(); }
  /** Water under the player that slows or sinks them (none while walking on water). */
  private waterHere(x = this.x, z = this.z) { return this.onWater ? null : this.map.footWaterAt(Math.floor(x), Math.floor(z), this.y); }
  /** The height the player moves at; walking on water, every water surface is ground. */
  private stand(x: number, z: number): number {
    if (this.onWater) {
      const wtr = this.map.waterAt(Math.floor(x), Math.floor(z));
      if (wtr) return Math.max(this.map.surfaceY(x, z), wtr.surface);
    }
    return this.map.standY(x, z, this.y);
  }
  private get sp(): Speeds { return this.w.speed ?? DEFAULT_SPEEDS; }
  /** Walking, running and swimming speeds (Update 154: the 3D maps' hero uses them too). */
  get speeds(): Speeds { return this.sp; }

  /** Put the player at a point on the ground. */
  place(x: number, z: number): void {
    this.x = x; this.z = z;
    this.safe = null;
    this.gridStep = null;
    this.state = { kind: 'ground' };
    // Put down on a bridge: on top of it.
    this.y = this.map.standY(x, z);
    this.y = this.groundY();
  }

  update(dt: number, inp: MotionInput): MotionResult {
    this.time += dt;
    const st = this.state;
    if (st.kind === 'climb') return this.updateClimb(dt, st);
    if (st.kind === 'dash') return this.updateDash(dt, st);
    if (st.kind === 'air') return this.updateAir(dt, inp, st);
    return this.updateGround(dt, inp);
  }

  /* ---------------------------------------------------------------- ground */

  private updateGround(dt: number, inp: MotionInput): MotionResult {
    const m = this.map, res: MotionResult = { moving: false, blocked: false, fell: false, face: null };
    // Water walking ended over deep water: back to the last safe spot.
    const under = m.footWaterAt(Math.floor(this.x), Math.floor(this.z), this.y);
    if (!this.onWater && under?.kind === 'deep' && this.safe) {
      this.place(this.safe[0], this.safe[1]);
      return { ...res, fell: true };
    }
    if (under?.kind !== 'deep') this.safe = [this.x, this.z];
    const here = this.waterHere();
    this.crawling = this.inLow(this.x, this.z);
    this.running = inp.run && !inp.sneak && this.w.has('run') && !here && !this.crawling;

    if (inp.jump && this.w.has('jump') && !this.crawling && here?.kind !== 'swim') {
      const sp = this.sp, fy = this.stand(this.x, this.z);
      // Riding and moving: a leap of the horse's length, the way it's going.
      const leap = (inp.dx || inp.dz) && !here ? this.w.leap?.() ?? null : null;
      if (leap) {
        const vy = Math.sqrt(2 * GRAVITY * 1.0), air = (2 * vy) / GRAVITY, len = Math.hypot(inp.dx, inp.dz);
        this.state = { kind: 'air', vy, speed: leap / air, from: [this.x, fy, this.z], auto: [inp.dx / len, inp.dz / len] };
        this.y = fy;
        res.face = faceOf(inp.dx, inp.dz);
        return { ...this.updateAir(dt, inp, this.state), face: res.face, jumped: true };
      }
      const speed = here ? sp.wade : this.running ? sp.run : sp.walk;
      this.state = { kind: 'air', vy: JUMP_SPEED, speed, from: [this.x, fy, this.z] };
      this.y = fy;
      this.crawling = false;
      if (inp.dx || inp.dz) res.face = faceOf(inp.dx, inp.dz);
      return { ...this.updateAir(dt, inp, this.state), face: res.face, jumped: true };
    }

    // Ice: the hero slides, steering only a little, until something stops them (a prop, a bank, dry ground).
    const onIce = this.map.iceAt(Math.floor(this.x), Math.floor(this.z)) !== null;
    if (onIce) {
      const sp = this.sp, top = sp.run * 1.1, fromY = this.stand(this.x, this.z);
      // Stepping onto the ice keeps the speed the hero came in with.
      if (!this.slide[0] && !this.slide[1] && (inp.dx || inp.dz)) this.slide = [inp.dx * sp.walk, inp.dz * sp.walk];
      this.slide[0] += inp.dx * 5 * dt; this.slide[1] += inp.dz * 5 * dt;
      const v = Math.hypot(this.slide[0], this.slide[1]);
      if (v > top) { this.slide[0] *= top / v; this.slide[1] *= top / v; }
      // Barely any friction: a slow coast to a stop.
      const f = Math.max(0, 1 - dt * 0.25); this.slide[0] *= f; this.slide[1] *= f;
      const nx = this.x + this.slide[0] * dt, nz = this.z + this.slide[1] * dt;
      if (this.slide[0]) { if (this.groundFree(nx, this.z, fromY)) { this.x = nx; res.moving = true; } else this.slide[0] = 0; }
      if (this.slide[1]) { if (this.groundFree(this.x, nz, fromY)) { this.z = nz; res.moving = true; } else this.slide[1] = 0; }
      if (inp.dx || inp.dz) res.face = faceOf(inp.dx, inp.dz);
      // Off the ice onto ground: the slide ends there.
      if (this.map.iceAt(Math.floor(this.x), Math.floor(this.z)) === null) this.slide = [0, 0];
      this.crawling = false;
      if (this.state.kind === 'ground') this.y = this.groundY();
      return res;
    }
    this.slide = [0, 0];
    if (this.grid) return this.gridMove(dt, inp, res, here);
    if (inp.dx || inp.dz) {
      const sp = this.sp;
      let speed = here?.kind === 'swim' ? sp.swim : here?.kind === 'shallow' ? sp.wade : this.crawling ? sp.crawl : this.running ? sp.run : sp.walk;
      if (inp.sneak) speed = Math.min(speed, sp.walk * SNEAK_SPEED);
      const step = speed * (inp.speedScale ?? 1) * dt;
      const fromY = this.stand(this.x, this.z);
      const nx = this.x + inp.dx * step, nz = this.z + inp.dz * step;
      const horiz = Math.abs(inp.dx) >= Math.abs(inp.dz);
      let mainBlocked = false;
      if (inp.dx) { if (this.groundFree(nx, this.z, fromY)) { this.x = nx; res.moving = true; } else if (horiz) mainBlocked = true; }
      if (inp.dz) { if (this.groundFree(this.x, nz, fromY)) { this.z = nz; res.moving = true; } else if (!horiz) mainBlocked = true; }
      res.face = faceOf(inp.dx, inp.dz);
      // Stopped the way the stick mostly points (even while sliding along the wall the other way): a climbable wall
      // is climbed, a ledge walked off. Without needing the stick held perfectly straight.
      if (mainBlocked || !res.moving) {
        if (!res.moving) res.blocked = true;
        if (this.tryClimb(dt, inp)) { res.blocked = false; res.moving = true; res.face = (this.state as { face: Dir }).face; }
        else if (this.tryWalkOff(inp, speed)) return { ...this.updateAir(dt, inp, this.state as Extract<State, { kind: 'air' }>), face: res.face };
      } else this.push = { t: 0, key: '' };
    } else this.push = { t: 0, key: '' };
    // A river's current carries a swimmer (and, more gently, a wader) along: slower against it, faster with it.
    if (here && this.state.kind === 'ground' && !this.onWater) {
      const c = this.w.current?.(Math.floor(this.x), Math.floor(this.z));
      if (c && (c[0] || c[1])) {
        const k = (here.kind === 'swim' ? 0.85 : 0.3) * dt, fromY = this.stand(this.x, this.z);
        const nx = this.x + c[0] * k, nz = this.z + c[1] * k;
        if (c[0] && this.groundFree(nx, this.z, fromY)) this.x = nx;
        if (c[1] && this.groundFree(this.x, nz, fromY)) this.z = nz;
      }
    }
    this.crawling = this.inLow(this.x, this.z);
    if (this.state.kind === 'ground') this.y = this.groundY();
    return res;
  }

  /**
   * Grid movement (Update 152): one tile at a time, centre to centre, in the four directions. Holding a direction
   * walks on without stopping; a blocked tile only turns the hero to face it.
   */
  private gridMove(dt: number, inp: MotionInput, res: MotionResult, here: ReturnType<PlayerMotion['waterHere']>): MotionResult {
    const sp = this.sp;
    let speed = here?.kind === 'swim' ? sp.swim : here?.kind === 'shallow' ? sp.wade : this.crawling ? sp.crawl : this.running ? sp.run : sp.walk;
    if (inp.sneak) speed = Math.min(speed, sp.walk * SNEAK_SPEED);
    let left = speed * (inp.speedScale ?? 1) * dt;
    const startStep = (): boolean => {
      if (!inp.dx && !inp.dz) return false;
      const horiz = Math.abs(inp.dx) >= Math.abs(inp.dz);
      const dx = horiz ? Math.sign(inp.dx) : 0, dz = horiz ? 0 : Math.sign(inp.dz);
      res.face = faceOf(dx, dz);
      const cx = Math.floor(this.x) + 0.5, cz = Math.floor(this.z) + 0.5, tx = cx + dx, tz = cz + dz;
      if (!this.groundFree(tx, tz, this.stand(cx, cz))) { res.blocked = true; return false; }
      this.gridStep = { tx, tz };
      return true;
    };
    // Not stepping and off-centre (just arrived, or the grid was switched on): settle onto the tile's centre.
    if (!this.gridStep) {
      const cx = Math.floor(this.x) + 0.5, cz = Math.floor(this.z) + 0.5;
      if (Math.hypot(cx - this.x, cz - this.z) > 0.001 && !inp.dx && !inp.dz) this.gridStep = { tx: cx, tz: cz };
      else if (Math.hypot(cx - this.x, cz - this.z) > 0.001) { this.x = cx; this.z = cz; }
    }
    if (!this.gridStep && !startStep()) {
      if (res.blocked && this.tryClimb(dt, inp)) { res.blocked = false; res.moving = true; res.face = (this.state as { face: Dir }).face; this.gridStep = null; }
      if (this.state.kind === 'ground') this.y = this.groundY();
      return res;
    }
    while (this.gridStep && left > 0) {
      const g = this.gridStep, d = Math.hypot(g.tx - this.x, g.tz - this.z);
      if (d <= left) {
        this.x = g.tx; this.z = g.tz; left -= d; this.gridStep = null;
        res.moving = true;
        // Held on: the next tile straight away, so walking never stutters.
        if (!startStep()) break;
      } else {
        this.x += ((g.tx - this.x) / d) * left; this.z += ((g.tz - this.z) / d) * left; left = 0;
        res.moving = true;
        res.face ??= faceOf(g.tx - this.x, g.tz - this.z);
      }
    }
    if (res.moving) res.blocked = false;
    this.crawling = this.inLow(this.x, this.z);
    if (this.state.kind === 'ground') this.y = this.groundY();
    return res;
  }

  /** Where the player's feet are on the ground: the surface, or sunk into swimmable water (bobbing). */
  private groundY(): number {
    if (this.onWater) return this.stand(this.x, this.z);
    if (this.map.onDeck(Math.floor(this.x), Math.floor(this.z), this.y)) return this.map.deckAt(Math.floor(this.x), Math.floor(this.z))!;
    const wtr = this.map.waterAt(Math.floor(this.x), Math.floor(this.z));
    const ice = this.map.iceAt(Math.floor(this.x), Math.floor(this.z));
    if (ice !== null) return Math.max(ice, this.map.surfaceY(this.x, this.z));
    return wtr?.kind === 'swim' ? wtr.surface - SWIM_SINK + Math.sin(this.time * 3) * 0.03 : this.map.surfaceY(this.x, this.z);
  }

  /** Is any part of the player's footprint in a low-clearance cell? */
  inLow(x: number, z: number): boolean {
    return probes(x, z).some(([px, pz]) => this.map.isLow(Math.floor(px), Math.floor(pz)));
  }

  /** A cell the player can't enter on foot (or, with `air`, in a jump). */
  private cellBlocked(cx: number, cz: number, air: boolean): boolean {
    const m = this.map;
    if (m.isSolid(cx, cz) || this.w.solidEvent(cx, cz)) return true;
    if (m.isLow(cx, cz)) return air || !this.w.has('crawl');
    // A horse doesn't swim: water deeper than wading stops it (unless walking on water).
    if (!air && !this.onWater && this.w.noSwim?.()) { const w = m.waterAt(cx, cz); if (w && w.kind !== 'shallow' && !m.onDeck(cx, cz, this.y)) return true; }
    return !air && (this.onWater ? m.isSolid(cx, cz) : m.isBlocked(cx, cz));
  }

  /** The console's ghost mode: through walls, props and cliffs (inside the map). */
  ghost = false;

  /** Can the player stand at (x, z) on foot, coming from height fromY? */
  groundFree(x: number, z: number, fromY: number): boolean {
    if (this.ghost) return x > 0.3 && z > 0.3 && x < this.map.w - 0.3 && z < this.map.h - 0.3;
    const fx = Math.floor(this.x), fz = Math.floor(this.z);
    for (const [px, pz] of probes(x, z)) {
      if (this.cellBlocked(Math.floor(px), Math.floor(pz), false) || this.map.inBox(px, pz)) return false;
      if (!this.map.deckStepOK(fx, fz, Math.floor(px), Math.floor(pz), this.y)) return false;
      if (Math.abs(this.stand(px, pz) - fromY) > MAX_STEP) return false;
    }
    return true;
  }

  /* ---------------------------------------------------------------- jumping */

  private airFree(x: number, z: number, feet: number): boolean {
    const fx = Math.floor(this.x), fz = Math.floor(this.z);
    for (const [px, pz] of probes(x, z)) {
      if (this.cellBlocked(Math.floor(px), Math.floor(pz), true) || this.map.inBox(px, pz)) return false;
      if (!this.map.deckStepOK(fx, fz, Math.floor(px), Math.floor(pz), Math.max(feet, this.y))) return false;
      if (this.stand(px, pz) > feet + 0.02) return false;
    }
    return true;
  }

  private updateAir(dt: number, inp: MotionInput, st: Extract<State, { kind: 'air' }>): MotionResult {
    const m = this.map, res: MotionResult = { moving: true, blocked: false, fell: false, face: null };
    // Walking off: carried over the edge at walking pace, then falling (steering as usual) once clear of it.
    const edging = !!st.drop && !!st.auto;
    if (!edging) st.vy -= GRAVITY * dt;
    const feet = this.y + st.vy * dt;
    const [mx, mz] = st.auto ?? [inp.dx, inp.dz];
    const ox = this.x, oz = this.z;
    if (mx || mz) {
      const step = st.speed * dt;
      const nx = this.x + mx * step, nz = this.z + mz * step;
      if (mx && this.airFree(nx, this.z, Math.max(feet, this.y))) this.x = nx;
      if (mz && this.airFree(this.x, nz, Math.max(feet, this.y))) this.z = nz;
      res.face = faceOf(mx, mz);
    }
    this.y = feet;
    if (edging && (probes(this.x, this.z).every(([px, pz]) => this.stand(px, pz) < st.from[1] - MAX_STEP) || (this.x === ox && this.z === oz))) st.auto = undefined;

    // Into deep water: splash, and back to where the jump started.
    const wtr = m.footWaterAt(Math.floor(this.x), Math.floor(this.z), this.y);
    if (wtr?.kind === 'deep' && this.y <= wtr.surface && !this.onWater) return this.fall(st, res);

    if (st.vy < 0) {
      const ground = Math.max(...probes(this.x, this.z).map(([px, pz]) => this.stand(px, pz)));
      if (this.y <= ground) {
        if (!this.landOK(ground, st)) return this.fall(st, res);
        // Land on the highest ground under the footprint (catching a ledge with a toe), then
        // shuffle to the nearest spot where the whole footprint fits.
        if (!this.settle(ground) && !this.settle(this.stand(this.x, this.z))) return this.fall(st, res);
        if (!this.landOK(this.stand(this.x, this.z), st)) return this.fall(st, res);
        this.state = { kind: 'ground' };
        this.y = this.groundY();
        this.crawling = this.inLow(this.x, this.z);
      }
    }
    if (this.y < st.from[1] - (st.drop ? 60 : 8)) return this.fall(st, res);
    return res;
  }

  private fall(st: Extract<State, { kind: 'air' }>, res: MotionResult): MotionResult {
    this.place(st.from[0], st.from[2]);
    return { ...res, moving: false, fell: true };
  }

  /** Move to the nearest position (within half a tile) where the player fits at height y. */
  private settle(y: number): boolean {
    const ok = (x: number, z: number) => this.groundFree(x, z, y) && Math.abs(this.stand(x, z) - y) <= MAX_STEP;
    if (ok(this.x, this.z)) return true;
    for (let r = 0.05; r <= 0.5; r += 0.05)
      for (let a = 0; a < 16; a++) {
        const x = this.x + Math.cos((a / 16) * Math.PI * 2) * r, z = this.z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (ok(x, z)) { this.x = x; this.z = z; return true; }
      }
    return false;
  }

  /* ---------------------------------------------------------------- walking off ledges */

  private get ledges(): LedgeRules { return this.w.ledges ?? DEFAULT_LEDGES; }

  /** May the hero come down into this cell from higher up (the ledge rules)? */
  private dropAllowed(cx: number, cz: number): boolean {
    const r = this.ledges;
    if (r.mode === 'collision') return false;
    if (r.mode === 'walk') return true;
    const h = this.map.step(cx, cz), lo = Math.min(r.min, r.max), hi = Math.max(r.min, r.max);
    return h < lo || h > hi;
  }

  /** Can a jump or a drop end at height `y` here? A jump may always come down two steps; further needs the rules. */
  private landOK(y: number, st: Extract<State, { kind: 'air' }>): boolean {
    const down = st.from[1] - y;
    if (down <= MAX_FALL) return true;
    return probes(this.x, this.z).every(([px, pz]) => this.dropAllowed(Math.floor(px), Math.floor(pz)));
  }

  /**
   * Walking into a drop: the hero walks straight off it (no pause, no hop) and falls to the ground below, if the
   * ledge rules allow coming down there. Not off climbable walls (those are climbed), into deep water or a gap.
   */
  private tryWalkOff(inp: MotionInput, speed: number): boolean {
    const m = this.map;
    if (this.crawling || this.waterHere()?.kind === 'swim' || this.ledges.mode === 'collision') return false;
    const horiz = Math.abs(inp.dx) >= Math.abs(inp.dz);
    const ddx = horiz ? Math.sign(inp.dx) : 0, ddz = horiz ? 0 : Math.sign(inp.dz);
    const cx = Math.floor(this.x), cz = Math.floor(this.z), nx = cx + ddx, nz = cz + ddz;
    if (!m.inMap(nx, nz) || m.isClimbable(cx, cz) || m.isClimbable(nx, nz) || this.cellBlocked(nx, nz, false)) return false;
    const gap = ddx > 0 ? cx + 1 - this.x : ddx < 0 ? this.x - cx : ddz > 0 ? cz + 1 - this.z : this.z - cz;
    if (gap > (ddx ? PLAYER_RADIUS : RZ) + 0.1) return false;
    // Where the hero comes down: just past the edge, the whole footprint on the lower ground.
    const tx = ddx > 0 ? nx + PLAYER_RADIUS + 0.06 : ddx < 0 ? nx + 1 - PLAYER_RADIUS - 0.06 : clampIn(this.x, nx, PLAYER_RADIUS);
    const tz = ddz > 0 ? nz + RZ + 0.06 : ddz < 0 ? nz + 1 - RZ - 0.06 : clampIn(this.z, nz, RZ);
    const fromY = this.stand(this.x, this.z), toY = this.stand(tx, tz);
    if (fromY - toY <= MAX_STEP || !this.groundFree(tx, tz, toY)) return false;
    if (m.footWaterAt(Math.floor(tx), Math.floor(tz))?.kind === 'deep' && !this.onWater) return false;
    if (fromY - toY > MAX_FALL && !probes(tx, tz).every(([px, pz]) => this.dropAllowed(Math.floor(px), Math.floor(pz)))) return false;
    this.push = { t: 0, key: '' };
    this.state = { kind: 'air', vy: 0, speed: Math.max(speed, this.sp.walk * 0.8), from: [this.x, fromY, this.z], auto: [ddx, ddz], drop: true };
    this.y = fromY;
    return true;
  }

  /* ---------------------------------------------------------------- dashing */

  private updateDash(dt: number, st: Extract<State, { kind: 'dash' }>): MotionResult {
    const step = st.speed * Math.min(dt, st.left), fromY = this.stand(this.x, this.z);
    const nx = this.x + st.dx * step, nz = this.z + st.dz * step;
    let moved = false;
    if (st.dx && this.groundFree(nx, this.z, fromY)) { this.x = nx; moved = true; }
    if (st.dz && this.groundFree(this.x, nz, fromY)) { this.z = nz; moved = true; }
    st.left -= dt;
    if (st.left <= 0 || !moved) this.state = { kind: 'ground' };
    this.y = this.groundY();
    return { moving: moved, blocked: !moved, fell: false, face: null };
  }

  /* ---------------------------------------------------------------- climbing */

  /** Pushing against a cliff: if it's climbable, start climbing it up or down. */
  private tryClimb(dt: number, inp: MotionInput): boolean {
    const m = this.map;
    if (!this.w.has('climb') || this.crawling) return false;
    const horiz = Math.abs(inp.dx) >= Math.abs(inp.dz);
    const ddx = horiz ? Math.sign(inp.dx) : 0, ddz = horiz ? 0 : Math.sign(inp.dz);
    const cx = Math.floor(this.x), cz = Math.floor(this.z), nx = cx + ddx, nz = cz + ddz;
    if (!m.inMap(nx, nz) || !(m.isClimbable(cx, cz) || m.isClimbable(nx, nz))) return false;
    // Close enough to the edge?
    const gap = ddx > 0 ? cx + 1 - this.x : ddx < 0 ? this.x - cx : ddz > 0 ? cz + 1 - this.z : this.z - cz;
    if (gap > (ddx ? PLAYER_RADIUS : RZ) + 0.1) return false;
    if (this.cellBlocked(nx, nz, false)) return false;
    // Just over the edge, inside the next cell.
    const tx = ddx > 0 ? nx + PLAYER_RADIUS + 0.05 : ddx < 0 ? nx + 1 - PLAYER_RADIUS - 0.05 : clampIn(this.x, nx, PLAYER_RADIUS);
    const tz = ddz > 0 ? nz + RZ + 0.05 : ddz < 0 ? nz + 1 - RZ - 0.05 : clampIn(this.z, nz, RZ);
    const fromY = this.stand(this.x, this.z), toY = this.stand(tx, tz);
    if (Math.abs(toY - fromY) <= MAX_STEP || !this.groundFree(tx, tz, toY)) return false;

    const key = `${nx},${nz}`;
    if (this.push.key !== key) this.push = { t: 0, key };
    this.push.t += dt;
    if (this.push.t < CLIMB_PUSH) return false;
    this.push = { t: 0, key: '' };

    const dir = faceOf(ddx, ddz)!;
    const up = toY > fromY;
    const start: V3 = [this.x, this.y, this.z];
    // Up: rise against the wall, then step over the top. Down: step over the edge, then lower down.
    const mid: V3 = up ? [this.x, toY, this.z] : [tx, fromY, tz];
    this.state = { kind: 'climb', path: [start, mid, [tx, toY, tz]], seg: 0, face: up ? dir : OPPOSITE[dir] };
    return true;
  }

  private updateClimb(dt: number, st: Extract<State, { kind: 'climb' }>): MotionResult {
    let left = dt;
    while (left > 0 && st.seg < st.path.length - 1) {
      const to = st.path[st.seg + 1];
      const dx = to[0] - this.x, dy = to[1] - this.y, dz = to[2] - this.z;
      const vertical = Math.abs(dy) > Math.hypot(dx, dz);
      const speed = vertical ? this.sp.climb : this.sp.climb * 1.45;
      const dist = Math.hypot(dx, dy, dz), stepLen = speed * left;
      if (stepLen >= dist) { this.x = to[0]; this.y = to[1]; this.z = to[2]; left -= dist / speed; st.seg++; }
      else { const k = stepLen / dist; this.x += dx * k; this.y += dy * k; this.z += dz * k; left = 0; }
    }
    if (st.seg >= st.path.length - 1) {
      this.state = { kind: 'ground' };
      this.y = this.groundY();
    }
    return { moving: true, blocked: false, fell: false, face: st.face };
  }
}

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

function probes(x: number, z: number): [number, number][] {
  const r = PLAYER_RADIUS;
  return [[x - r, z - RZ], [x + r, z - RZ], [x - r, z + RZ], [x + r, z + RZ]];
}

/** Keep a coordinate inside cell n with room for a footprint of half-size r. */
function clampIn(v: number, n: number, r: number): number {
  return Math.min(n + 1 - r - 0.02, Math.max(n + r + 0.02, v));
}

export function faceOf(dx: number, dz: number): Dir | null {
  if (!dx && !dz) return null;
  return Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 'left' : 'right') : dz < 0 ? 'up' : 'down';
}
