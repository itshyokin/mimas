/**
 * The party: heroes who travel with the one you play (Database → Heroes, all but the first). They follow the hero's
 * trail on the map (hopping where the hero jumped) and fight beside them in turn-based battles; their AI style
 * (fighter, archer, caster, healer) picks what they do when the battle runs them.
 * Shared with the hero: the bag and gold (only the hero picks up what enemies drop). Their own: level and experience
 * (given out once a fight is over, for every enemy beaten while they were standing), stats and stat points, equipment,
 * health, magic and stamina. Knocked out, they get up again a little after the fight with a quarter of their health.
 */
import * as THREE from 'three';
import type { TileMap } from '../world/TileMap';
import type { AbilityData, AllyStyle, Dir, Element, EquipSlot, HeroDef, Inflict } from '../world/types';
import { abilityJSON } from './abilities';
import type { Attrs } from './attributes';
import { ATTRS, ATTR_MAX, baseAttrs } from './attributes';
import { CharacterSprite } from './CharacterSprite';
import { SWIM_SINK } from './PlayerMotion';
import type { SpriteLibrary } from '../render/sprites';
import type { RestSpot } from '../world/safeZones';
import { MAX_LEVEL_LIMIT, xpToNext, type XpRules } from './combat/config';

/** Party members besides the hero (eight in all). */
export const MAX_PARTY = 7;
/** Party members who fight beside the hero (three a side); the rest wait on the bench and can swap in. */
export const ACTIVE_MEMBERS = 2;

/** A party member's own state (saved with the game). */
export interface MemberData {
  id: string;
  stats: Attrs;
  statPoints: number;
  /** Growth ranks changed for good (potions, events); the rest are the Database's. */
  statRanks?: Partial<Record<keyof Attrs, import('./statRanks').Rank>>;
  /** Their own level, and experience into it. */
  level: number;
  xp: number;
  /** Experience earned in the fight going on (handed out when it's over). */
  pendingXp?: number;
  equip: Partial<Record<EquipSlot, string>>;
  /** Their Element slots (Primary, Secondary): element stones (item ids). */
  elements?: (string | null)[];
  /** Their own skill tree: ranks learned, and skill points to spend (from levels). */
  skills?: Record<string, number>;
  skillPoints?: number;
  /** How they fight, chosen by the player (unset: their database style). */
  style?: AllyStyle;
  hp: number; mp: number; sp: number;
  down?: boolean;
  /** Learned spells and Additions, the readied ones, and class. */
  abilities?: AbilityData;
  /** Ailments from a battle that last into the next one (turns left), until cured or rested. */
  ailments?: Record<string, number>;
}

export class PartyState {
  members: MemberData[] = [];

  has(id: string): boolean { return this.members.some((m) => m.id === id); }
  get(id: string): MemberData | undefined { return this.members.find((m) => m.id === id); }
  get full(): boolean { return this.members.length >= MAX_PARTY; }

  toJSON(): MemberData[] { return this.members.map((m) => ({ ...m, stats: { ...m.stats }, equip: { ...m.equip }, ...(m.elements ? { elements: [...m.elements] } : {}), ...(m.skills ? { skills: { ...m.skills } } : {}), ...(m.abilities ? { abilities: abilityJSON(m.abilities) } : {}) })); }
  load(d: MemberData[] | undefined): void {
    this.members = (d ?? []).filter((m) => m && typeof m.id === 'string').slice(0, MAX_PARTY).map((m) => ({
      id: m.id, stats: { ...baseAttrs(), ...m.stats }, statPoints: 0, ...(m.statRanks ? { statRanks: { ...m.statRanks } } : {}), level: Math.max(1, Math.round(Number(m.level) || 1)), xp: Math.max(0, Number(m.xp) || 0),
      ...(m.pendingXp ? { pendingXp: m.pendingXp } : {}), equip: { ...m.equip }, ...(m.elements?.some(Boolean) ? { elements: [m.elements[0] ?? null, m.elements[1] ?? null] } : {}),
      ...(m.skills ? { skills: { ...m.skills } } : {}), ...(m.style ? { style: m.style } : {}), ...(m.skillPoints !== undefined ? { skillPoints: Math.max(0, Math.round(Number(m.skillPoints) || 0)) } : {}),
      hp: Number(m.hp) || 0, mp: Number(m.mp) || 0, sp: Number(m.sp) || 0, ...(m.down ? { down: true } : {}),
      ...(m.abilities ? { abilities: abilityJSON(m.abilities) } : {}),
    }));
  }
}

/** Fighting styles, as the Equipment page names them. */
export const STYLE_NAMES: Record<AllyStyle, string> = { fighter: 'Melee', archer: 'Archery', caster: 'Magic', healer: 'Healing' };

/**
 * How a member fights: their chosen style (or the database's), if they have its weapon; otherwise whatever they do
 * have (a bow alone makes an archer, a shard alone a caster; with nothing, fists).
 */
export function fightingStyle(def: Pick<HeroDef, 'ai'>, m: Pick<MemberData, 'style' | 'equip'>, n: { bow: number; spell: number }): AllyStyle {
  const want = m.style ?? def.ai ?? 'fighter';
  const sword = !!m.equip.weapon, bow = n.bow > 0, magic = n.spell > 0;
  if (want === 'archer' && bow) return 'archer';
  if (want === 'caster' && magic) return 'caster';
  if (want === 'healer') return 'healer';
  if (want === 'fighter' && (sword || (!bow && !magic))) return 'fighter';
  return sword ? 'fighter' : bow ? 'archer' : magic ? 'caster' : 'fighter';
}

/** Give a member experience; returns the levels gained (each adds `gains` to their stats, by rank, and `skillPerLevel` skill points). */
export function memberGainXp(m: MemberData, n: number, rules: XpRules, gains: Partial<Attrs>, skillPerLevel = 0): number {
  const top = rules.maxLevel ?? MAX_LEVEL_LIMIT;
  if (m.level >= top) { m.xp = 0; return 0; }
  m.xp += Math.max(0, Math.round(n));
  let ups = 0;
  while (m.level < top && m.xp >= xpToNext(rules, m.level)) { m.xp -= xpToNext(rules, m.level); m.level++; for (const k of ATTRS) m.stats[k] = Math.min(ATTR_MAX, m.stats[k] + (gains[k] ?? 0)); m.skillPoints = (m.skillPoints ?? 0) + skillPerLevel; ups++; }
  if (m.level >= top) m.xp = 0;
  return ups;
}

/** Spend a member's stat points (as the hero's are spent): false if they haven't the points or a stat would pass the top. */
export function spendMember(m: MemberData, add: Partial<Attrs>): boolean {
  const total = ATTRS.reduce((s, k) => s + Math.max(0, Math.round(add[k] ?? 0)), 0);
  if (total > m.statPoints || ATTRS.some((k) => m.stats[k] + (add[k] ?? 0) > ATTR_MAX)) return false;
  for (const k of ATTRS) m.stats[k] += Math.max(0, Math.round(add[k] ?? 0));
  m.statPoints -= total;
  return true;
}

/** What a party member fights with right now (from their stats and gear). */
export interface AllyNumbers {
  max: { hp: number; mp: number; sp: number };
  melee: number; meleeElement: Element; meleeInflicts?: Inflict[];
  /** Seconds between swings. */
  swing: number;
  bow: number; bowElement: Element;
  spell: number; spellMp: number; spellColor?: string; spellElement: Element;
  heal: number;
  crit: number; armour: number; magicArmour: number;
  elements: Element[];
}

export interface AllyHost {
  map: TileMap;
  /** A point on the hero's trail this far behind them (tiles). */
  trailPoint(dist: number): { x: number; z: number } | null;
  leader: { x: number; y: number; z: number };
  /** The hero is riding (Update 110): followers are out of sight until they get off. */
  hidden?: boolean;
  /** Has the party been out of a fight for a while? */
  calm: boolean;
  /** Health comes back on its own (Database → Player: off by default, so a hurt member stays hurt until healed or rested). */
  regenHp: boolean;
  /** Magic comes back on its own (off by default, like the hero's). */
  regenMp: boolean;
  numbers(m: MemberData, def: HeroDef): AllyNumbers;
  float(text: string, x: number, y: number, z: number, kind: 'dmg' | 'heal' | 'info' | 'hurt'): void;
  sound(name: 'hurt' | 'swing' | 'heal' | 'save', x: number, z: number): void;
  log(text: string): void;
  /** Where the hero jumped lately (party members hop there too). */
  jumps(): { id: number; x: number; z: number }[];
  sparkle(x: number, y: number, z: number, color: string): void;
}

const RUN = 4.6, WALK = 3.2;
/** How long a party member's hop lasts (s). */
const HOP_TIME = 0.55;

export class Ally {
  readonly sprite: CharacterSprite;
  x: number; y: number; z: number;
  private stuck = 0;
  private downFor = 0;
  /** Order behind the hero (0 = right behind). */
  slot = 0;
  /** The hero you play, following whoever leads the lineup. */
  passive = false;

  /** The bedroll's blanket over them while they lie down (Update 134). */
  private blanket: THREE.Mesh | null = null;

  constructor(readonly data: MemberData, readonly def: HeroDef, private readonly sprites: SpriteLibrary, look: Parameters<SpriteLibrary['forCharacter']>[0], private readonly parent: THREE.Object3D, x: number, z: number, map: TileMap) {
    this.sprite = new CharacterSprite(sprites, sprites.forCharacter(look), 'down');
    this.map = map;
    this.x = x; this.z = z; this.y = map.standY(x, z);
    this.sprite.mesh.position.set(x, this.y, z);
    this.sprite.mesh.castShadow = true;
    parent.add(this.sprite.mesh);
    if (data.down) this.sprite.play('hurt', 0.3, 0, () => this.sprite.hold('hurt', 5));
  }

  /** Resting at a spot in a safe zone while the player is in it (null: following). */
  private rest: { x: number; z: number; act: RestSpot['act']; t: number; posed: boolean; walk: number } | null = null;
  get resting(): boolean { return !!this.rest; }
  /** Seconds walking to a rest spot before they're simply there (longer for someone walking in from off-screen). */
  walkLimit = 6;
  /** Go and rest at a spot (sit, lie down, practise magic, train), or stop and fall in behind again (null). */
  setRest(spot: RestSpot | null): void {
    if (!spot) { if (this.rest) { this.rest = null; this.sprite.hold(null); this.sprite.mesh.rotation.z = 0; this.coverUp(false); } return; }
    const x = spot.x + 0.5, z = spot.z + 0.5;
    if (this.rest && this.rest.x === x && this.rest.z === z) return;
    this.rest = { x, z, act: spot.act, t: 1 + Math.random() * 2, posed: false, walk: 0 };
    this.sprite.hold(null);
  }
  /** At the spot: walk there, then sit / lie / practise / train until called away. Returns true while resting. */
  private updateRest(dt: number, h: AllyHost): boolean {
    const r = this.rest;
    if (!r) return false;
    const far = Math.hypot(r.x - this.x, r.z - this.z);
    if (far > 0.12) {
      if (r.posed) { r.posed = false; this.sprite.hold(null); this.sprite.mesh.rotation.z = 0; this.coverUp(false); }
      // On the way to their spot they pass through props and each other (Update 122: no getting caught on a log or
      // a tent and walking on the spot); taking too long, they're simply there.
      r.walk += dt;
      const moving = this.moveToward(r.x, r.z, WALK, dt, 0.05, true);
      if (!moving || r.walk > this.walkLimit) { this.stuck += dt; if (this.stuck > 0.5 || r.walk > this.walkLimit) this.place(r.x, r.z, h.map); }
      this.finish(dt, moving, false);
      return true;
    }
    if (!r.posed) {
      r.posed = true;
      // Facing the camera, except at a training dummy (it stands just north of the spot).
      this.sprite.faceVector(0, r.act === 'train' ? -1 : 1);
      // Sitting: the sheet's own sit, else the hurt row's third frame (kneeling down: the LPC sheets' bottom row).
      if (r.act === 'sit') { if (this.sprite.has('sit')) this.sprite.hold('sit', 0); else if (this.sprite.has('hurt')) this.sprite.hold('hurt', 2); }
      // Lying down (Update 134): standing still facing you on the bedroll, its blanket drawn over them (head on the pillow).
      if (r.act === 'lie') this.coverUp(true);
    }
    if (r.act === 'magic' || r.act === 'train') {
      r.t -= dt;
      if (r.t <= 0) {
        r.t = 2.4 + Math.random() * 2.4;
        if (r.act === 'magic') this.sprite.play('spellcast', 0.7);
        // At the dummy: the slash, facing it (the sheet's row 22, counting from 1: slash, facing up).
        else if (!this.sprite.play('slash', 0.45)) this.sprite.play('thrust', 0.45);
      }
    }
    this.finish(dt, false, false);
    return true;
  }

  /** Put the bedroll's blanket over them (or take it away). */
  private coverUp(on: boolean): void {
    if (!on) { this.blanket?.removeFromParent(); this.blanket = null; return; }
    if (!this.blanket) {
      const a = this.sprites.get('bedroll_blanket');
      this.blanket = new THREE.Mesh(a.geometry, a.material);
      this.blanket.renderOrder = 2;
      this.parent.add(this.blanket);
    }
    this.blanket.position.set(this.x, this.y, this.z + 0.08);
  }

  get name(): string { return this.def.name; }
  get down(): boolean { return !!this.data.down; }
  dispose(): void { this.sprite.mesh.removeFromParent(); this.coverUp(false); }

  /** Put them somewhere (a new map, or catching up with the hero). */
  place(x: number, z: number, map: TileMap): void {
    this.map = map;
    this.x = x; this.z = z; this.y = map.standY(x, z);
    this.sprite.mesh.position.set(this.x, this.y, this.z);
    this.stuck = 0;
  }


  update(dt: number, h: AllyHost): void {
    const n = h.numbers(this.data, this.def);
    // Magic and health come back slowly, faster out of a fight.
    if (h.regenMp) this.data.mp = Math.min(n.max.mp, this.data.mp + dt * (h.calm ? 4 : 1));
    this.data.sp = n.max.sp;
    // Knocked out: they stay down (no getting back up by themselves) and out of sight until something heals them
    // (an item, a revive, resting at an inn or a campfire); then they're back, following again.
    if (this.down && this.data.hp >= 1) this.data.down = false;
    if (this.down || h.hidden) {
      if (this.down) this.downFor += dt;
      this.sprite.mesh.visible = false;
      if (this.blanket) { this.coverUp(false); if (this.rest) this.rest.posed = false; }
      return;
    }
    if (!this.sprite.mesh.visible) {
      this.sprite.mesh.visible = true;
      this.sprite.hold(null);
      this.sprite.mesh.rotation.z = 0;
      // Back at the hero's side.
      const p = h.leader;
      this.x = p.x; this.z = p.z; this.y = p.y; this.sprite.mesh.position.set(p.x, p.y, p.z);
    }
    if (h.calm && h.regenHp) this.data.hp = Math.min(n.max.hp, this.data.hp + dt * 0.5);

    if (this.updateRest(dt, h)) return;
    let moving = false, running = false;
    // Following: a spot on the hero's trail, hopping where the hero jumped.
    if (this.hopT <= 0) for (const j of h.jumps()) {
      if (j.id <= this.lastJump || Math.hypot(j.x - this.x, j.z - this.z) > 0.45) continue;
      this.lastJump = j.id; this.hopT = HOP_TIME;
      this.sprite.play('jump', HOP_TIME);
      break;
    }
    const spot = h.trailPoint(1.1 * (this.slot + 1));
    if (spot) {
      const far = Math.hypot(spot.x - this.x, spot.z - this.z);
      if (far > 9) this.place(spot.x, spot.z, h.map);
      else if (far > 0.25) {
        running = far > 1.6;
        moving = this.moveToward(spot.x, spot.z, running ? RUN : WALK, dt, 0.05, true);
        if (!moving && far > 1.2) { this.stuck += dt; if (this.stuck > 1.2) this.place(spot.x, spot.z, h.map); }
      }
    }
    this.finish(dt, moving, running);
  }

  private finish(dt: number, moving: boolean, running: boolean): void {
    if (moving) this.stuck = 0;
    this.sprite.animate(dt, this.sprite.animated ? { moving, running, combat: false } : moving);
    this.swimT += dt;
    // A hop: up and down in an arc (as high as the hero's jump).
    let hop = 0;
    if (this.hopT > 0) { this.hopT = Math.max(0, this.hopT - dt); const k = 1 - this.hopT / HOP_TIME; hop = Math.sin(k * Math.PI) * 0.8; }
    this.sprite.mesh.position.set(this.x, this.feetY() + hop, this.z);
  }

  private hopT = 0;
  /** The last of the hero's jumps copied. */
  private lastJump = 0;

  private swimT = Math.random() * 6;
  /** In water too deep to wade: they sink in up to the chest like the hero (bobbing). */
  get swimming(): boolean {
    const w = this.map?.footWaterAt(Math.floor(this.x), Math.floor(this.z), this.y);
    return !!w && w.kind !== 'shallow';
  }
  /** Where their feet are drawn: the ground, or sunk into swimmable water. */
  private feetY(): number {
    const w = this.map?.footWaterAt(Math.floor(this.x), Math.floor(this.z), this.y);
    return w && w.kind !== 'shallow' ? w.surface - SWIM_SINK + Math.sin(this.swimT * 3) * 0.03 : this.y;
  }

  private map: TileMap | null = null;

  /** Walk toward a point (`ghost`: following the hero's own steps, so no need to check the way). */
  private moveToward(tx: number, tz: number, speed: number, dt: number, stop: number, ghost = false): boolean {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    if (d <= stop || d < 1e-3) return false;
    const step = Math.min(d - stop, speed * dt);
    this.sprite.faceVector(dx, dz);
    if (ghost) {
      this.x += (dx / d) * step; this.z += (dz / d) * step;
      if (this.map) this.y = this.map.standY(this.x, this.z, this.y);
      return true;
    }
    if (this.tryMove((dx / d) * step, (dz / d) * step)) return true;
    // Blocked: a step to the side.
    const sx = -dz / d, sz = dx / d;
    return this.tryMove(sx * step, sz * step) || this.tryMove(-sx * step, -sz * step);
  }

  private tryMove(dx: number, dz: number): boolean {
    const m = this.map;
    if (!m) return false;
    let moved = false;
    if (dx && this.free(this.x + dx, this.z)) { this.x += dx; moved = true; }
    if (dz && this.free(this.x, this.z + dz)) { this.z += dz; moved = true; }
    if (moved) this.y = m.standY(this.x, this.z, this.y);
    return moved;
  }

  private free(x: number, z: number): boolean {
    const m = this.map!, r = 0.22, fromY = this.y;
    for (const [px, pz] of [[x - r, z - r * 0.6], [x + r, z - r * 0.6], [x - r, z + r * 0.6], [x + r, z + r * 0.6]]) {
      const cx = Math.floor(px), cz = Math.floor(pz);
      if (!m.inMap(cx, cz) || m.isBlocked(cx, cz) || m.inBox(px, pz)) return false;
      if (!m.deckStepOK(Math.floor(this.x), Math.floor(this.z), cx, cz, this.y)) return false;
      if (Math.abs(m.standY(px, pz, this.y) - fromY) > 0.3) return false;
    }
    return true;
  }

  /** Face a direction (lined up behind the hero after a map change). */
  face(dir: Dir): void { this.sprite.dir = dir; }
}

/** Magic a healer spends on a heal. */
export const HEAL_MP = 10;
