/**
 * Field combat: the hero's attacks (1 melee, 2 bow, 3 magic), lock-on (Q / Tab), dodging (Space while
 * locked on), sneaking (C), the enemies on the map, arrows and firebolts, and the feel of a hit
 * (hit-stop, knock-back, a little camera shake, numbers).
 */
import * as THREE from 'three';
import type { Bursts } from '../../render/Bursts';
import type { SpriteLibrary } from '../../render/sprites';
import { linearColor } from '../../render/textures';
import type { CombatOverlay } from '../../ui/CombatOverlay';
import type { TileMap } from '../../world/TileMap';
import type { Ailment, Database, Element, EnemyDef, EquipSlot, EventPage, Inflict, ItemDef, LevelRange } from '../../world/types';
import type { CarriedWeapon, CharacterSprite } from '../CharacterSprite';
import { DIR_VECTOR } from '../CharacterSprite';
import { Breakable, type BreakableEvent, type HitKind } from './Breakable';
import type { Input } from '../Input';
import type { Inventory } from '../inventory';
import type { PlayerMotion } from '../PlayerMotion';
import type { PlayerStats } from '../stats';
import { type CombatConfig, SWING_TIME, mitigate } from './config';
import type { Skills } from '../skills';
import type { Sfx } from '../../audio/sfx';
import { ENEMY_RADIUS, Enemy, type EnemyWorld, SUSPICIOUS, lineOfSight } from './Enemy';
import { Held } from './Held';
import { elementIconUrl } from '../../art/elementIcons';
import { statusIconUrl } from '../../art/statusIcons';
import type { LogKind } from '../../ui/AdventureLog';
import { itemWeaponSprite } from './weaponSprites';
import { ELEMENT_COLORS, type ElementalDefence } from '../elements';
import { StatusSet, effectColor, effectName } from '../status';
import { DAMAGE_CAP, type HeroTotals, powerMultiplier, speedMultiplier } from '../attributes';

/** What the attack button uses. */
export type WeaponMode = 'melee' | 'bow' | 'magic';
export const WEAPON_MODES: WeaponMode[] = ['melee', 'bow', 'magic'];
/** What Y switches between and the trigger attacks with (spells have their own button). */
const ARMS: WeaponMode[] = ['melee', 'bow'];
/** Turn-based games: the hero's overworld tools (cutting vines, hitting switches), never in the bag. */
export const FIELD_SWORD: ItemDef = { id: '__fieldSword', name: 'Sword', kind: 'equipment', icon: 'builtin:sword', slot: 'weapon', weapon: { class: 'light', damage: 6 } };
export const FIELD_BOW: ItemDef = { id: '__fieldBow', name: 'Bow', kind: 'equipment', icon: 'builtin:bow', slot: 'ranged', weapon: { class: 'bow', damage: 5 } };

export interface CombatHost {
  map: TileMap;
  level: THREE.Object3D;
  sprites: SpriteLibrary;
  db: Database;
  cfg: CombatConfig;
  player: CharacterSprite;
  motion: PlayerMotion;
  stats: PlayerStats;
  inventory: Inventory;
  items: Map<string, ItemDef>;
  overlay: CombatOverlay;
  bursts: Bursts;
  /** The hero's skills (bonuses, spells, perks). */
  skills: Skills;
  /** The hero's stats with equipment and skills, crit chance and defences. */
  hero(): HeroTotals;
  /** The enemy as it comes out here: its level rolled (the page's range, or near the party's with dynamic levels). */
  levelled?(def: EnemyDef, range?: LevelRange): EnemyDef;
  /** The hero's elements, immunities and absorbs. */
  heroElements(): ElementalDefence;
  /** The hero's element stones: their Primary element (their swings and arrows hit with it) and damage bonuses. */
  heroAffinity?(): { primary?: Element; elements: Element[]; bonus: Partial<Record<Element, number>>; sameType: number };
  /** A melee swing hit nothing: it can chop something cuttable in front of the hero. */
  swingMissed?(): void;
  /** Trained with this weapon class (the skill tree)? Untrained, medium and heavy weapons swing slowly. */
  proficient?(cls: 'light' | 'medium' | 'heavy'): boolean;
  /** Ailments the hero can't get (their own and what their equipment keeps away). */
  heroResists(): Ailment[];
  /** The picture of an item (its icon), or a built-in icon when there's no item. */
  iconCanvas(itemId: string | undefined, fallback: string): HTMLCanvasElement;
  /** The hero's glow while a ring power is on (null: none). */
  glow(): { color: THREE.Color; amount: number } | null;
  /** Sneak while the button is held (true) or toggle it (false). */
  crouchHold(): boolean;
  /** Play a sound effect at a spot (or flat, without one). */
  sound(name: Sfx, x?: number, z?: number): void;
  /** 0 … 1: how lit the spot is (time of day, lamps, the hero's own light). */
  lightAt(x: number, z: number): number;
  notice(text: string): void;
  solidEventAt(x: number, z: number): boolean;
  /** A fire attack reached (x, y, z): light any fire that's gone out within `r` (true if one caught). */
  ignite?(x: number, y: number, z: number, r: number): boolean;
  /** 0 … 1: how lit up the hero is by firelight or a light ring. */
  heroLit?(): number;
  /** Ground no enemy enters: around lit campfires. */
  safeZones?(): { x: number; z: number; r: number }[];
  /** Count something for the Journal's records. */
  tally?(key: string, n?: number, best?: boolean): void;
  /** Cast a field spell (Light, Water Walk): switch it on or off. */
  fieldSpell?(): void;
  /** Party members on the field (enemies may go after them instead of the hero). */
  /** An enemy was defeated: experience, loot and its page's commands. */
  defeated(e: Enemy): void;
  /** Something breakable was broken: its page's commands. */
  broken(b: Breakable): void;
  /** A line in the adventure log. */
  log(text: string, kind: LogKind): void;
  /**
   * Turn-based battles: a fight broke out with `e` on the map (the hero or a friend hit it first: preemptive; it hit
   * first: normal, or from behind: ambush). True when the game took it over (a battle starts, or one just ended and
   * the hit is ignored); the hit itself then doesn't happen.
   */
  encounter?(e: Enemy, opening: 'preemptive' | 'normal' | 'ambush'): boolean;
  /** Can a battle start right now (not in one, not just after one, no cutscene)? */
  canEncounter?(): boolean;
  /** A learned spell readied for the magic button (it takes the place of the spell shard), as an item. */
  learnedSpell?(): (ItemDef & { spell: NonNullable<ItemDef['spell']> }) | undefined;
}

/** An event the combat system can turn into an enemy. */
/** What the hero can lock on to and hit. */
export type Target = Enemy | Breakable;
const radiusOf = (t: Target): number => (t instanceof Breakable ? t.radius : ENEMY_RADIUS);

export interface EnemyEvent { page: EventPage | null; readonly x: number; readonly z: number; readonly w: number; readonly h: number }

interface Projectile {
  mesh: THREE.Object3D;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  left: number;
  damage: number;
  from: 'player' | 'enemy';
  kind: 'arrow' | 'fire';
  light?: THREE.PointLight;
  /** Spells: the bolt's colour (sparks and light); enemy firebolts have none. */
  color?: string;
  element: Element;
  /** Ailments it can give, and whether its shooter was blind (half its hits miss). */
  inflicts?: Inflict[];
  blind?: boolean;
  /** Shot from this far away (for future stealth perks). */
  range: number;
  sneak: boolean;
}

interface Swing { t: number; dur: number; hit: boolean; dx: number; dz: number; combo: number; reach: number; damage: number; element: Element; inflicts?: Inflict[] }

export class Combat {
  readonly enemies: Enemy[] = [];
  /** The locked-on enemy (or something to break). */
  lock: Target | null = null;
  /** Things to break on this map (event pages marked breakable). */
  readonly breakables: Breakable[] = [];
  private readonly byBreakable = new Map<EnemyEvent, { b: Breakable; page: EventPage }>();
  sneaking = false;
  /** Seconds the world stays frozen after a solid hit. */
  hitStop = 0;
  /** Camera shake amount (decays). */
  shake = 0;
  private host!: CombatHost;
  private readonly byEvent = new Map<EnemyEvent, Enemy>();
  /** Enemies already beaten on this visit to the map. */
  private readonly beaten = new Set<EnemyEvent>();
  private readonly projectiles: Projectile[] = [];
  private swing: Swing | null = null;
  private combo = 0;
  private comboWindow = 0;
  /** Seconds the bow stays in hand after a shot (the release animation), before going back on the back. */
  private bowHands = 0;
  private queued = false;
  /** The bow being drawn: how long, and (the Bow key item, Update 132) its fixed damage and what keeps it drawn. */
  private draw: { t: number; fixed?: number; held?: () => boolean } | null = null;
  private cast = 0;
  private drawPosed = false;
  /** What the hero holds while fighting, and how long the casting glow lasts. */
  private held: Held | null = null;
  private castGlow = 0;
  private readonly fireColor = linearColor('#ff8a3a');
  /** Seconds since the hero last made a fighting noise. */
  private sinceNoise = 99;
  private noiseRadius = 0;
  private moving = false;
  private slash: { pivot: THREE.Object3D; mat: THREE.MeshBasicMaterial } | null = null;
  private readonly fireLights: THREE.PointLight[] = [];
  /** The hero's ailments and buffs. */
  readonly heroStatus = new StatusSet();
  private statusFx = 0;
  private handLight: THREE.PointLight | null = null;
  /** The readied shard's colour, converted once per colour. */
  private spellColor = { hex: '', color: new THREE.Color() };
  private textures: ReturnType<typeof makeTextures> | null = null;

  /** Start on a new map: drop everything from the last one. */
  attach(host: CombatHost): void {
    for (const e of this.enemies) e.remove();
    this.enemies.length = 0;
    this.byEvent.clear();
    this.breakables.length = 0;
    this.byBreakable.clear();
    this.beaten.clear();
    for (const p of this.projectiles) this.dropProjectile(p, false);
    this.projectiles.length = 0;
    this.lock = null;
    this.swing = null; this.draw = null; this.cast = 0; this.queued = false;
    this.host = host;
    host.overlay.clear();
    this.textures ??= makeTextures();
    // The slash arc, laid flat in front of the hero.
    const mat = new THREE.MeshBasicMaterial({ map: this.textures.slash, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    const pivot = new THREE.Object3D();
    pivot.add(mesh);
    pivot.visible = false;
    host.level.add(pivot);
    this.slash = { pivot, mat };
    this.held = new Held(host.level);
    // Two lights for firebolts, always there (adding lights later would make every material recompile).
    this.fireLights.length = 0;
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(linearColor('#ff8a3a'), 0, 4.5, 2);
      host.level.add(l);
      this.fireLights.push(l);
    }
    // Out-of-sight copies of the bolt and arrow materials, so their shaders are built with the map (the game warms
    // shaders up after loading) instead of stuttering the first time one is shot.
    const t = this.textures;
    for (const mat of [
      new THREE.MeshBasicMaterial({ map: t.bolt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      new THREE.MeshBasicMaterial({ map: t.fire, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      new THREE.MeshBasicMaterial({ map: t.arrow, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }),
    ]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), mat);
      w.position.set(0, -500, 0);
      w.frustumCulled = true;
      host.level.add(w);
    }
    // The light of a readied spell shard, in its colour.
    this.handLight = new THREE.PointLight(this.fireColor, 0, 3, 2);
    host.level.add(this.handLight);
  }

  get locked(): boolean { return !!this.lock; }
  get busy(): boolean { return !!this.swing || !!this.draw || this.cast > 0; }

  /** Spawn enemies for event pages that are enemies (and remove ones whose page changed); the same for breakables. */
  syncEvents(events: readonly EnemyEvent[]): void {
    for (const ev of events) {
      const page = ev.page, have = this.byBreakable.get(ev);
      if (have && have.page !== page) {
        this.breakables.splice(this.breakables.indexOf(have.b), 1);
        this.byBreakable.delete(ev);
        if (this.lock === have.b) this.lock = null;
      }
      if (!page?.breakable || page.enemy || this.byBreakable.has(ev) || !('broken' in ev)) continue;
      const b = new Breakable(ev as unknown as BreakableEvent, page.breakable, this.host.map);
      this.breakables.push(b);
      this.byBreakable.set(ev, { b, page });
    }
    for (const ev of events) {
      const id = ev.page?.enemy, have = this.byEvent.get(ev);
      if (have && (have.def.id !== id || have.dead)) {
        if (!have.dead) { have.remove(); this.enemies.splice(this.enemies.indexOf(have), 1); }
        this.byEvent.delete(ev);
      }
      if (!id || this.byEvent.has(ev) || this.beaten.has(ev)) continue;
      const base = this.host.db.enemies?.find((d) => d.id === id);
      if (!base) continue;
      const def = this.host.levelled?.(base, ev.page?.enemyLevels) ?? base;
      // Update 156: placed in 3D (a 3D map): there, on the floor it was placed on.
      const p3 = (ev as { data?: { pos3?: { x: number; y: number; z: number } } }).data?.pos3;
      const e = new Enemy(def, ev, this.host.level, this.host.sprites, this.host.db, p3 ? p3.x : ev.x + ev.w / 2, p3 ? p3.z : ev.z + ev.h - 0.5, this.host.map);
      if (p3) e.y = this.host.map.standY(p3.x, p3.z, p3.y + 0.2);
      this.enemies.push(e);
      this.byEvent.set(ev, e);
    }
  }

  /** Is this event an enemy that's still fighting (so it isn't talked to or bumped into)? */
  isEnemyEvent(ev: EnemyEvent): boolean { return !!ev.page?.enemy; }

  /* ------------------------------------------------------------------ input */

  /** The field keys: sneaking, lock-on, the sword and bow (field tools) and field spells. */
  handleInput(i: Input): void {
    const h = this.host, m = h.motion;
    // Sneak: held (like Halo's crouch) or toggled, as the player chose in Settings → Gameplay.
    if (h.crouchHold()) { i.consume('sneak'); this.sneaking = i.isHeld('sneak'); }
    else if (i.consume('sneak')) { this.sneaking = !this.sneaking; h.notice(this.sneaking ? 'Sneaking' : 'Stopped sneaking'); }
    // Targeting: lock on / next target; release lets go.
    if (i.consume('lock')) { if (this.lock) { this.lock = null; h.sound('menuBack'); } }
    if (i.consume('target')) {
      if (this.lock) this.cycleTarget(1);
      else { this.lock = this.pickTarget(null); if (this.lock) h.sound('target'); else h.notice('Nothing to lock on to'); }
    }
    if (i.consume('targetPrev')) { if (this.lock) this.cycleTarget(-1); else this.lock = this.pickTarget(null); }
    const free = !m.airborne && !m.climbing && !m.swimming && !m.dashing && !m.crawling;
    // Weapons: switch between the sword and the bow (Y), then attack with the one selected (the trigger). The
    // keyboard's 1 / 2 pick one and use it at once. Spells are their own button (B, F, or 3): cast between attacks.
    if (this.weapon === 'magic') this.weapon = 'melee';
    // Update 132: no sword or bow on the map; the Cut and Bow key items (quick slots) do their jobs.
    i.consume('switchWeapon'); i.consume('attack');
    for (const w of ARMS) i.consume(w);
    let use: WeaponMode | null = null;
    // A spell pressed mid-swing waits (briefly) for the swing to end, so sword-then-spell combos flow.
    const pressed = i.consume('magic');
    if (pressed || this.castQueued > 0) { use = this.available('magic') ? 'magic' : null; if (!use && pressed) this.whyNot('magic'); }
    if (pressed && use) this.castQueued = Math.max(this.castQueued, 0.5);
    // The Bow key item: held while its quick slot is held; let go to shoot.
    if (this.draw && (!this.draw.held?.() || !free)) {
      if (free && this.draw.t >= 0.12) this.shootArrow(Math.min(1, this.draw.t / this.drawTime), this.draw.fixed);
      this.draw = null;
    }
    if (use === 'magic' && free && !this.swing && !this.draw && this.cast <= 0) {
      if (this.available('magic')) this.castSpell(); else this.whyNot('magic');
      this.castQueued = 0;
    }
  }

  /**
   * The Cut key item (Update 132): one swing ahead, a fixed amount of damage to whatever it hits (vines and thin trees
   * are cut down, crates broken; a foe on the map starts a battle). Returns why it can't, or null.
   */
  keySwing(damage: number): string | null {
    const m = this.host.motion;
    if (this.toolsOff) return 'You can’t use that here.';
    if (m.airborne || m.climbing || m.swimming || m.dashing || m.crawling) return null;
    if (this.swing) { this.queued = false; return null; }
    if (this.draw) return null;
    this.weapon = 'melee';
    this.startSwing(damage);
    return null;
  }
  /** The Bow key item (Update 132): start drawing; `held` keeps it drawn (the quick slot held), letting go shoots. */
  keyDraw(damage: number, held: () => boolean): string | null {
    const m = this.host.motion;
    if (this.toolsOff) return 'You can’t use that here.';
    if (m.airborne || m.climbing || m.swimming || m.dashing || m.crawling || this.swing || this.draw) return null;
    this.weapon = 'bow';
    this.draw = { t: 0, fixed: damage, held };
    this.host.sound('draw');
    return null;
  }
  /** Drawing the bow, and for how long (seconds). */
  get drawing(): number | null { return this.draw ? this.draw.t : null; }

  /** Something held in the hand instead of a weapon (a fishing rod while fishing), tilted 0 … 1. */
  holding: { icon: HTMLCanvasElement; tilt: number } | null = null;

  /** The tip of what's held (a rod's tip), once it's shown. */
  holdTip(): THREE.Vector3 | null { return this.holding && this.held ? this.held.tip() : null; }

  /** The weapon the attack button uses (shown on the HUD). */
  weapon: WeaponMode = 'melee';
  /** Bumped on every switch, so the HUD can play its swap animation. */
  switches = 0;

  /** Can this weapon be used right now (a bow equipped, Fire learned)? */
  available(w: WeaponMode): boolean {
    if (w === 'bow') return this.equipped('ranged')?.weapon?.class === 'bow';
    if (w === 'magic') return !!this.spell() && !this.heroStatus.silenced;
    return true;
  }

  private whyNot(w: WeaponMode): void {
    this.host.notice(w === 'bow' ? 'No bow equipped: put one on in Menu → Equipment' : this.spell() && this.heroStatus.silenced ? 'Silenced: can’t cast spells' : 'No spell shard equipped: put one in the magic slot in Menu → Equipment');
  }

  private select(w: WeaponMode): void {
    if (this.weapon === w) return;
    this.weapon = w;
    this.switches++;
    this.draw = null;
  }

  /** Cast the readied spell shard's bolt (the spell button: B, F); it goes off on the next update, between attacks. */
  castShard(): void {
    if (!this.available('magic')) { this.whyNot('magic'); return; }
    this.castQueued = 0.5;
  }
  /** Seconds a pressed spell waits for the hero to be free (after a swing or a draw). */
  private castQueued = 0;

  /** Y / R: the other weapon (sword or bow), if it can be used. */
  switchWeapon(): void {
    const start = Math.max(0, ARMS.indexOf(this.weapon));
    for (let k = 1; k <= ARMS.length; k++) {
      const w = ARMS[(start + k) % ARMS.length];
      if (w === this.weapon) break;
      if (this.available(w)) { this.select(w); this.host.sound('menuMove'); return; }
    }
    this.host.notice('Nothing else to switch to: equip a bow (spells are cast with their own button: B or F)');
  }


  /** How fast the hero can move right now (slower while swinging, drawing or casting). */
  get speedScale(): number { return (this.draw ? 0.45 : this.swing ? 0.35 : this.cast > 0 ? 0.5 : 1) * this.heroStatus.speed; }
  /** Frozen, paralysed, asleep or staggered: the hero can't move or act. */
  get heroStunned(): boolean { return this.heroStatus.stunned; }

  /** Seconds for a full bow draw (Steady Draw makes it quicker). */
  private get drawTime(): number { return this.host.cfg.bow.drawTime / speedMultiplier(this.host.hero().attrs.dex) / this.heroStatus.speed; }
  /** Lock-on reach: further with a bow (Eagle Eye adds more). */
  private get lockReach(): number {
    const h = this.host;
    return this.equipped('ranged')?.weapon?.class === 'bow' ? Math.max(h.cfg.lockRange, h.cfg.bow.lockRange * (1 + h.skills.get('bowRange') / 100)) : h.cfg.lockRange;
  }

  /** After the hero moved this frame (for how much noise they make). */
  setMoving(moving: boolean): void { this.moving = moving; }

  /* ------------------------------------------------------------------ attacks */

  /** The spell shard in the magic slot (with its spell), if any. */
  spell(): (ItemDef & { spell: NonNullable<ItemDef['spell']> }) | undefined {
    const learned = this.host?.learnedSpell?.();
    if (learned) return learned;
    const d = this.equipped('magic');
    return d?.spell ? (d as ItemDef & { spell: NonNullable<ItemDef['spell']> }) : undefined;
  }

  private equipped(slot: EquipSlot): ItemDef | undefined {
    const id = this.host.inventory.equip[slot];
    const it = id ? this.host.items.get(id) : undefined;
    // The sword and bow are field tools the hero always has (vines, switches), not bag items.
    if ((!it || (slot === 'ranged' && it.weapon?.class !== 'bow'))) {
      if (slot === 'weapon') return FIELD_SWORD;
      if (slot === 'ranged') return FIELD_BOW;
    }
    return it;
  }

  /** Set by the "Overworld weapons" event command: off indoors or in restricted areas. */
  toolsOff = false;

  /** Where an attack goes: at the locked target, or a nearby enemy roughly ahead, or straight ahead. */
  private aim(reach: number): [number, number] {
    const p = this.host.player.position;
    if (this.lock) return norm(this.lock.x - p.x, this.lock.z - p.z);
    const [fx, fz] = DIR_VECTOR[this.host.player.dir];
    let best: Target | null = null, bestD = reach + 0.6;
    for (const e of this.targets()) {
      if (e.dead) continue;
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
      if (d < bestD && (dx * fx + dz * fz) / (d || 1) > 0.5) { best = e; bestD = d; }
    }
    return best ? norm(best.x - p.x, best.z - p.z) : [fx, fz];
  }

  private startSwing(fixed?: number): void {
    const h = this.host, w = this.equipped('weapon');
    const cls = w?.weapon && w.weapon.class !== 'bow' ? w.weapon.class : 'unarmed';
    this.swingFixed = fixed;
    const t = h.cfg.classes[cls];
    if (this.comboWindow <= 0) this.combo = 0;
    this.combo = (this.combo % 3) + 1;
    const base = cls === 'unarmed' ? h.cfg.unarmedDamage : w!.weapon!.damage;
    const sk = h.skills;
    const hero = h.hero().attrs;
    // The sword on the map: its class's swing speed, a little quicker with Dexterity.
    const speed = t.speed * speedMultiplier(hero.dex) * this.heroStatus.speed;
    const bonus = (1 + (sk.get('meleeDamage') + (cls === 'unarmed' ? 0 : sk.get(`${cls}Damage` as 'lightDamage'))) / 100) * powerMultiplier(hero.str);
    const [dx, dz] = this.aim(t.reach);
    const ha = h.heroAffinity?.(), el = ha?.primary ?? (cls === 'unarmed' ? undefined : w?.element) ?? 'neutral', boost = 1 + (ha?.bonus[el] ?? 0) / 100;
    this.swing = { t: 0, dur: SWING_TIME / speed * (this.combo === 3 ? 1.25 : 1), hit: false, dx, dz, combo: this.combo, reach: t.reach, damage: fixed ?? base * t.damage * bonus * boost * (this.combo === 3 ? 1.3 : 1), element: el, inflicts: cls === 'unarmed' ? undefined : w?.inflicts };
    h.player.faceVector(dx, dz);
    // Animated sheets: a slash, the other way on the second hit of a combo, and a big backswing to finish
    // (heavy weapons always swing the big one).
    // Off the back and into the hand first, so the swing shows the weapon from its first frame.
    this.updateBack();
    for (const a of this.swingAnims(cls)) if (h.player.play(a, this.swing.dur)) break;
    h.sound(cls === 'heavy' ? 'swingHeavy' : 'swing');
    this.makeNoise(4);
  }

  /**
   * Which animations to try for this swing, best first. Plain: a slash, the other way on the second hit, a big
   * backswing to finish (heavy weapons always swing big). A weapon sprite only has some: a spear-like weapon thrusts,
   * one drawn swinging backwards (a club) reverses the slash.
   */
  private swingAnims(cls: string): string[] {
    const plain = cls === 'heavy' || this.combo === 3 ? ['backslash', 'slash'] : this.combo === 2 ? ['halfslash', 'slash'] : ['slash'];
    const id = itemWeaponSprite(this.equipped('weapon')), w = id && this.host.player.animated && this.host.sprites.weapon(id) ? this.host.sprites.weaponDef(id) : undefined;
    if (!w) return plain;
    const has = (a: string) => w.anims.includes(a);
    const combo: string[][] = [
      ['slash', 'slash_reverse', 'thrust'],
      ['halfslash', 'slash_reverse', 'thrust', 'slash'],
      ['backslash', 'thrust', 'slash_reverse', 'slash'],
    ];
    const pick = (cls === 'heavy' ? combo[2] : combo[this.combo - 1]).filter(has);
    return [...pick, ...plain];
  }

  private updateSwing(dt: number): void {
    const s = this.swing, h = this.host;
    if (!s) { this.comboWindow -= dt; return; }
    s.t += dt;
    const k = s.t / s.dur, p = h.player.position;
    // The arc sweeps across in front of the hero during the active part of the swing.
    if (this.slash) {
      const { pivot, mat } = this.slash;
      pivot.visible = k > 0.2 && k < 0.75;
      // An enchanted (or elemental) weapon's arc takes its element's colour.
      mat.color.set(s.element && s.element !== 'neutral' ? ELEMENT_COLORS[s.element] : '#ffffff');
      pivot.position.set(p.x, p.y + 0.45, p.z);
      const sweep = (k - 0.45) * 1.6 * (s.combo === 2 ? -1 : 1);
      pivot.rotation.y = Math.atan2(-s.dx, -s.dz) + sweep;
      const r = s.reach * 1.9;
      pivot.scale.set(r, 1, r);
      mat.opacity = pivot.visible ? 0.75 * (1 - Math.abs(k - 0.45) * 2.2) : 0;
    }
    if (!s.hit && k >= 0.38) {
      s.hit = true;
      let any = false;
      for (const e of this.targets()) {
        if (e.dead) continue;
        const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz);
        if (d > s.reach + radiusOf(e) || Math.abs(e.y - p.y) > 0.9) continue;
        if (d > 0.35 && (dx * s.dx + dz * s.dz) / d < 0.25) continue;
        any = true;
        if (e instanceof Breakable) this.damageBreakable(e, s.damage, 'melee', s.element);
        else this.damageEnemy(e, s.damage, false);
      }
      // A fire weapon lights a torch or fire in front of the hero.
      if (s.element === 'fire' && h.ignite?.(p.x + s.dx * s.reach * 0.7, p.y + 0.9, p.z + s.dz * s.reach * 0.7, s.reach * 0.6)) any = true;
      if (!any && this.equipped('weapon')) h.swingMissed?.();
      if (any) { this.hitStop = Math.max(this.hitStop, s.combo === 3 ? 0.09 : 0.06); this.shake = Math.max(this.shake, s.combo === 3 ? 0.12 : 0.06); }
    }
    if (k >= 1) {
      this.swing = null;
      if (this.slash) this.slash.pivot.visible = false;
      this.comboWindow = 0.45;
      if (this.queued) { this.queued = false; this.startSwing(this.swingFixed); }
    }
  }

  /** The Cut key item's damage while its swing (and combo) runs. */
  private swingFixed: number | undefined;

  private shootArrow(power: number, fixed?: number): void {
    const h = this.host, bow = this.equipped('ranged');
    if (!bow?.weapon) return;
    // The field bow is a tool (switches, starting fights): it uses no arrows, and arrows don't change it.
    const arrow = undefined as import('../../world/types').ItemDef | undefined;
    h.tally?.('arrows');
    const p = h.player.position, range = h.cfg.bow.lockRange * 1.1;
    const [dx, dz] = this.aim(0);
    const ty = this.lock ? this.lock.y + 0.6 : p.y + 0.7;
    const dist = this.lock ? Math.hypot(this.lock.x - p.x, this.lock.z - p.z) : range;
    const speed = h.cfg.bow.arrowSpeed * (0.55 + 0.45 * power);
    const damage = fixed !== undefined ? fixed * (0.5 + 0.5 * power) : (bow.weapon.damage + (arrow?.ammo?.damage ?? 0)) * (0.35 + 0.65 * power) * (1 + h.skills.get('bowDamage') / 100) * powerMultiplier(h.hero().attrs.dex);
    // Elemental arrows hit with their own element; plain ones with the bow's.
    const ha = h.heroAffinity?.(), ael: Element = (arrow?.element && arrow.element !== 'neutral' ? arrow.element : ha?.primary ?? bow.element) ?? 'neutral';
    this.launch('arrow', 'player', p.x + dx * 0.3, p.y + 0.7, p.z + dz * 0.3, dx, (ty - (p.y + 0.7)) / Math.max(1, dist), dz, speed, range, damage * (1 + (ha?.bonus[ael] ?? 0) / 100), undefined, ael, [...(bow.inflicts ?? []), ...(arrow?.inflicts ?? [])]);
    h.player.faceVector(dx, dz);
    // The release: the end of the shoot animation (its first part is the draw, held while aiming).
    h.player.play('shoot', 0.28, 9);
    this.bowHands = 0.32;
    h.sound('shoot');
    this.makeNoise(1.5);
  }

  /** Cast the equipped shard's spell: a bolt in its colour (speed and range default to Database → Combat's). */
  private castSpell(): void {
    const h = this.host, f = h.cfg.fire, shard = this.spell();
    if (!shard) return;
    // A field spell (Light, Water Walk) is switched on or off instead of hurled.
    if (shard.spell.power) { h.fieldSpell?.(); this.cast = 0.25; return; }
    // The Magic tree: cheaper (Mana Thrift), harder-hitting (Arcana, Empower) and further-flying (Far Cast) bolts.
    const sk = h.skills, thrift = 1 - Math.min(75, sk.get('spellCost')) / 100;
    const sp = shard.spell, mp = Math.round((sp.mp ?? f.mp) * thrift), speed = sp.speed || f.speed, range = (sp.range || f.range) * (1 + sk.get('spellRange') / 100);
    if (!h.stats.spendMp(mp)) { h.notice('Not enough MP'); return; }
    h.tally?.('spells');
    const p = h.player.position, [dx, dz] = this.aim(0);
    const ty = this.lock ? this.lock.y + 0.6 : p.y + 0.6;
    const dist = this.lock ? Math.hypot(this.lock.x - p.x, this.lock.z - p.z) : range;
    const ha = h.heroAffinity?.(), sel: Element = shard.element ?? 'neutral', own = sel !== 'neutral' && ha ? (1 + (ha.bonus[sel] ?? 0) / 100) * (ha.elements.includes(sel) ? 1 + ha.sameType / 100 : 1) : 1;
    this.launch('fire', 'player', p.x + dx * 0.4, p.y + 0.65, p.z + dz * 0.4, dx, (ty - (p.y + 0.65)) / Math.max(1, dist), dz, speed, range, (sp.damage ?? f.damage) * powerMultiplier(h.hero().attrs.mag) * (1 + sk.get('spellDamage') / 100) * own, sp.color || SPELL_DEFAULT_COLOR, sel, shard.inflicts);
    h.player.faceVector(dx, dz);
    h.player.play('spellcast', 0.42);
    this.cast = 0.28;
    this.castGlow = 0.7;
    h.sound('fire');
    this.makeNoise(3);
  }

  /* ------------------------------------------------------------------ damage */

  /**
   * The sword, an arrow or a field spell reaching an enemy on the map: a battle starts, and hitting it first gives the
   * party the first turns. Two skills change what an unseen hit does: Assassinate (a sword strike on an ordinary foe
   * that hasn't noticed the hero finishes it on the spot, no battle) and Silent Shot (an arrow from 5 tiles or more at
   * one that hasn't noticed wounds it before the battle starts, and can finish it).
   */
  private damageEnemy(e: Enemy, base: number, ranged: boolean, range = 0, magic = false): void {
    const h = this.host, sk = h.skills, top = e.y + e.height;
    if (e.dead) return;
    if (!h.canEncounter?.()) return;
    const unaware = e.unaware && !e.def.boss && !e.status.zombie;
    if (unaware && !ranged && !magic && sk.has('assassinate')) {
      e.hurt(Math.ceil(e.hp), h.player.position.x, h.player.position.z, 3);
      h.overlay.float('Assassinated!', e.x, top + 0.35, e.z, 'crit');
      h.log(`You assassinate ${e.def.name}`, 'hit');
      h.tally?.('sneakAttacks');
      h.sound('crit', e.x, e.z);
      this.enemyDown(e);
      return;
    }
    if (unaware && ranged && !magic && range >= 5 && sk.has('silentShot')) {
      const dmg = mitigate(base * (0.9 + Math.random() * 0.2), e.def.defense ?? 0);
      const killed = e.hurt(Math.min(dmg, Math.ceil(e.hp)), h.player.position.x, h.player.position.z, 1.4);
      h.overlay.float(String(dmg), e.x, top, e.z, 'crit');
      h.overlay.float('Silent shot!', e.x, top + 0.35, e.z, 'info');
      h.log(`Silent shot! ${e.def.name} takes ${dmg}`, 'hit');
      h.tally?.('sneakAttacks');
      h.sound('crit', e.x, e.z);
      if (killed) { this.enemyDown(e); return; }
    }
    h.encounter?.(e, 'preemptive');
  }

  /* ------------------------------------------------------------------ ailments */

  /** An enemy beaten (by anything): the sound, it stays beaten for this visit, the lock moves on, rewards. */
  private enemyDown(e: Enemy): void {
    const h = this.host;
    h.sound('defeat', e.x, e.z);
    this.beaten.add(e.key as EnemyEvent);
    if (this.lock === e) this.lock = this.pickTarget(e, true);
    h.defeated(e);
  }

  /** Ailments and buffs run: burn and poison hurt, regeneration heals, and wisps of colour drift off the afflicted. */
  private updateStatuses(dt: number): void {
    const h = this.host, p = h.player.position, hs = this.heroStatus;
    this.statusFx -= dt;
    const fx = this.statusFx <= 0;
    if (fx) this.statusFx = 0.22;
    if (hs.list.length || hs.zombie) {
      const r = hs.tick(dt, h.stats.cfg.max.hp);
      if (r.hp) {
        h.stats.change('hp', 'add', r.hp);
        h.overlay.float(r.hp > 0 ? `+${r.hp}` : String(-r.hp), p.x, p.y + 1.3, p.z, r.hp > 0 ? 'heal' : 'hurt');
      }
      for (const id of r.expired) if (!id.startsWith('buff:')) h.overlay.float(`${effectName(id)} wore off`, p.x, p.y + 1.7, p.z, 'info');
      if (fx) this.wisps(hs, p.x, p.y, p.z);
    }
    h.stats.hpRegenBlocked = hs.noRegen;
    h.stats.zombie = hs.zombie;
    for (const e of this.enemies) {
      if (e.dead || !e.status.list.length) continue;
      const r = e.status.tick(dt, e.maxHp);
      if (r.hp < 0) {
        const dmg = Math.min(DAMAGE_CAP, -r.hp);
        h.overlay.float(String(dmg), e.x, e.y + e.height, e.z, 'dmg');
        if (e.dot(dmg)) { h.log(`${e.def.name} succumbs`, 'hit'); this.enemyDown(e); continue; }
      } else if (r.hp > 0) e.heal(r.hp);
      if (fx) this.wisps(e.status, e.x, e.y, e.z);
    }
  }

  private wisps(st: StatusSet, x: number, y: number, z: number): void {
    const a = st.list.find((e) => !e.id.startsWith('buff:'))?.id ?? (st.zombie ? 'zombie' : null);
    if (!a) return;
    const rise = a === 'burn' ? 1.6 : a === 'poison' || a === 'zombie' ? 0.8 : a === 'sleep' ? 0.5 : 0.3;
    this.host.bursts.spawn(x + (Math.random() - 0.5) * 0.4, y + 0.4 + Math.random() * 0.6, z, { color: effectColor(a), n: 2, speed: 0.3, up: rise, life: 0.6, size: 0.07, gravity: -0.6, additive: a !== 'poison' && a !== 'zombie' });
  }

  /** What lock-on can aim at (Update 132): switches, targets and other breakables, not enemies. */
  private lockables(): Target[] { return this.breakables; }

  /** Everything the hero can hit: enemies and things to break. */
  private targets(): Target[] { return this.breakables.length ? [...this.enemies, ...this.breakables] : this.enemies; }

  /** A hit on something breakable: chips and a knock, "No effect" if this kind of attack can't hurt it. */
  private damageBreakable(b: Breakable, base: number, kind: HitKind, element: Element = 'neutral'): void {
    const h = this.host, top = b.y + b.height;
    if (!b.accepts(kind) || (b.def.needs && b.def.needs !== 'neutral' && b.def.needs !== element)) {
      h.overlay.float('No effect', b.x, top, b.z, 'info');
      h.sound('block', b.x, b.z);
      h.bursts.spawn(b.x, b.y + b.height * 0.5, b.z, { color: '#cfd6e6', n: 5, speed: 1.6, up: 1, life: 0.25, size: 0.05, additive: true });
      return;
    }
    const dmg = mitigate(base * (0.9 + Math.random() * 0.2), b.def.defense ?? 0);
    const broke = b.hurt(dmg);
    h.overlay.float(String(dmg), b.x, top, b.z, 'dmg');
    h.sound(broke ? 'break' : 'block', b.x, b.z);
    h.bursts.spawn(b.x, b.y + b.height * 0.45, b.z, { color: '#9a8a74', n: broke ? 26 : 8, speed: broke ? 3 : 2, up: broke ? 2.6 : 1.4, life: broke ? 0.7 : 0.35, size: broke ? 0.1 : 0.07, gravity: 6 });
    if (!broke) { h.log(`You hit ${b.name} for ${dmg}`, 'hit'); return; }
    h.log(`${b.name} breaks`, 'defeat');
    this.shake = Math.max(this.shake, 0.1);
    if (this.lock === b) this.lock = this.pickTarget(b, true);
    h.broken(b);
  }

  /** An enemy's attack reaching the hero: the battle starts (an ambush when it came from behind). */
  hurtPlayer(fromX: number, fromZ: number, from?: Enemy): void {
    if (from) this.host.encounter?.(from, this.behind(fromX, fromZ) ? 'ambush' : 'normal');
  }

  /* ------------------------------------------------------------------ projectiles */

  private launch(kind: 'arrow' | 'fire', from: 'player' | 'enemy', x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, range: number, damage: number, color?: string, element: Element = 'neutral', inflicts?: Inflict[], blind = false): void {
    const h = this.host, t = this.textures!;
    let mesh: THREE.Object3D, light: THREE.PointLight | undefined;
    if (kind === 'arrow') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.62), new THREE.MeshBasicMaterial({ map: from === 'player' ? t.arrow : t.enemyArrow, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      const pivot = new THREE.Object3D();
      pivot.add(m);
      pivot.rotation.y = Math.atan2(-dx, -dz);
      mesh = pivot;
    } else if (color) {
      // A spell: a glow in its colour round a white-hot core.
      const c = linearColor(color), g = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: t.bolt, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const core = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ map: t.bolt, color: new THREE.Color(1, 1, 1).lerp(c, 0.25), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      core.position.z = 0.01;
      g.add(outer, core);
      mesh = g;
      light = this.fireLights.find((l) => !this.projectiles.some((p) => p.light === l));
      light?.color.copy(c);
    } else {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ map: t.fire, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh = m;
      light = this.fireLights.find((l) => !this.projectiles.some((p) => p.light === l));
      light?.color.copy(this.fireColor);
    }
    mesh.position.set(x, y, z);
    h.level.add(mesh);
    const len = Math.hypot(dx, dz) || 1;
    this.projectiles.push({ mesh, x, y, z, vx: (dx / len) * speed, vy: dy * speed, vz: (dz / len) * speed, left: range, damage, from, kind, light, color, element, inflicts, blind, range: 0, sneak: false });
  }

  private updateProjectiles(dt: number): void {
    const h = this.host, m = h.map;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      const step = Math.hypot(pr.vx, pr.vz) * dt;
      // Move in small steps so fast arrows can't skip through a thin enemy.
      const n = Math.max(1, Math.ceil(step / 0.2));
      let done = false;
      for (let k = 0; k < n && !done; k++) {
        pr.x += (pr.vx * dt) / n; pr.y += (pr.vy * dt) / n; pr.z += (pr.vz * dt) / n;
        pr.range += step / n;
        const cx = Math.floor(pr.x), cz = Math.floor(pr.z);
        if (!m.inMap(cx, cz) || m.isSolid(cx, cz) || m.inBox(pr.x, pr.z) || m.standY(pr.x, pr.z) > pr.y) { this.impact(pr); done = true; break; }
        if (pr.from === 'player') {
          // Fire bolts and fire arrows light torches and fires that have gone out.
          if (pr.element === 'fire' && h.ignite?.(pr.x, pr.y, pr.z, 0.35)) { this.impact(pr); done = true; break; }
          for (const e of this.targets()) {
            if (e.dead) continue;
            if (Math.hypot(e.x - pr.x, e.z - pr.z) < radiusOf(e) + 0.12 && pr.y > e.y - 0.1 && pr.y < e.y + e.height + 0.1) {
              if (e instanceof Breakable) this.damageBreakable(e, pr.damage, pr.kind === 'fire' ? 'magic' : 'bow', pr.element);
              else this.damageEnemy(e, pr.damage, true, pr.range, pr.kind === 'fire');
              this.impact(pr);
              done = true;
              break;
            }
          }
        }
      }
      if (done) { this.projectiles.splice(i, 1); continue; }
      pr.left -= step;
      if (pr.left <= 0) { this.dropProjectile(pr, true); this.projectiles.splice(i, 1); continue; }
      pr.mesh.position.set(pr.x, pr.y, pr.z);
      if (pr.light) { pr.light.position.set(pr.x, pr.y + 0.2, pr.z); pr.light.intensity = 2.2 + Math.sin(performance.now() / 40) * 0.4; }
      if (pr.kind === 'fire' && Math.random() < 0.5) h.bursts.spawn(pr.x, pr.y, pr.z, { color: pr.color ?? '#ff9a3a', n: 2, speed: 0.4, up: 0.6, life: 0.35, size: 0.08, gravity: -1, additive: true });
    }
    // Firebolt lights that aren't carrying a bolt go dark.
    for (const l of this.fireLights) if (!this.projectiles.some((pr) => pr.light === l)) l.intensity = 0;
  }

  private impact(pr: Projectile): void {
    const h = this.host;
    h.sound(pr.kind === 'fire' ? 'fireHit' : 'arrowHit', pr.x, pr.z);
    if (pr.kind === 'fire') h.bursts.spawn(pr.x, pr.y, pr.z, { color: pr.color ?? '#ffb347', n: 18, speed: 2.4, up: 1.8, life: 0.5, size: 0.1, additive: true });
    else h.bursts.spawn(pr.x, pr.y, pr.z, { color: '#d8cbb0', n: 5, speed: 1.2, up: 1, life: 0.25, size: 0.05 });
    this.dropProjectile(pr, false);
  }

  private dropProjectile(pr: Projectile, fizzle: boolean): void {
    if (fizzle && pr.kind === 'fire') this.host?.bursts.spawn(pr.x, pr.y, pr.z, { color: pr.color ?? '#ff9a3a', n: 6, speed: 0.6, up: 0.6, life: 0.3, size: 0.08, gravity: -1, additive: true });
    pr.mesh.removeFromParent();
    pr.mesh.traverse((o) => {
      const mm = o as THREE.Mesh;
      mm.geometry?.dispose();
      (mm.material as THREE.Material | undefined)?.dispose?.();
    });
    if (pr.light) pr.light.intensity = 0;
  }

  /* ------------------------------------------------------------------ targets */

  /** The best enemy to lock on to (or the next one after `after` when cycling). */
  pickTarget(after: Target | null, alertOnly = false): Target | null {
    const h = this.host, p = h.player.position;
    const range = this.lockReach;
    const [fx, fz] = DIR_VECTOR[h.player.dir];
    // Update 132: lock-on aims at switches and targets (things to hit), not foes on the map.
    const list = this.lockables().filter((e) => !e.dead && e !== after && (!alertOnly || (e instanceof Enemy && e.alert))
      && Math.hypot(e.x - p.x, e.z - p.z) <= range
      && lineOfSight(h.map, p.x, p.y + 0.8, p.z, e.x, e.y + 0.6, e.z));
    const score = (e: Target) => { const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz) || 1; return d * (1.6 - (dx * fx + dz * fz) / d); };
    list.sort((a, b) => score(a) - score(b));
    return list[0] ?? null;
  }

  /** Tab / RB: the next target clockwise around the hero (LB: anticlockwise). */
  cycleTarget(dir: 1 | -1): void {
    const h = this.host, p = h.player.position, cur = this.lock;
    if (!cur) return;
    const range = this.lockReach;
    const angle = (e: Target) => Math.atan2(e.z - p.z, e.x - p.x);
    const a0 = angle(cur);
    const list = this.lockables().filter((e) => !e.dead && e !== cur && Math.hypot(e.x - p.x, e.z - p.z) <= range
      && lineOfSight(h.map, p.x, p.y + 0.8, p.z, e.x, e.y + 0.6, e.z));
    if (!list.length) return;
    const delta = (e: Target) => { let d = (angle(e) - a0) * dir; while (d <= 0) d += Math.PI * 2; return d; };
    list.sort((a, b) => delta(a) - delta(b));
    this.lock = list[0];
    h.sound('target');
  }

  /* ------------------------------------------------------------------ frame */

  update(dt: number): void {
    if (this.castQueued > 0) this.castQueued = Math.max(0, this.castQueued - dt);
    const h = this.host, p = h.player.position;
    this.cast = Math.max(0, this.cast - dt);
    this.sinceNoise += dt;
    this.shake = Math.max(0, this.shake - dt * 0.8);
    if (this.draw) {
      this.draw.t += dt;
      // Animated sheets: the bow drawn back over the first part of the shoot animation, held while aiming.
      h.player.hold('shoot', Math.min(8, Math.floor(Math.min(1, this.draw.t / this.drawTime) * 8)));
      this.drawPosed = true;
    } else if (this.drawPosed) { this.drawPosed = false; h.player.hold(null); }
    this.updateSwing(dt);
    const mat = h.player.mesh.material as THREE.MeshStandardMaterial;
    const glow = h.glow();
    this.updateStatuses(dt);
    const ail = this.heroStatus.list.find((e) => !e.id.startsWith('buff:'));
    if (glow) { mat.emissive.copy(glow.color); mat.emissiveIntensity = glow.amount; }
    else if (ail) { mat.emissive.set(effectColor(ail.id)); mat.emissiveIntensity = (ail.id === 'frozen' ? 0.55 : 0.25) + Math.sin(performance.now() / 200) * 0.07; }
    else mat.emissiveIntensity = 0;
    // Can't act: an attack under way is lost.
    if (this.heroStatus.stunned) { this.swing = null; this.draw = null; if (this.slash) this.slash.pivot.visible = false; }
    this.updateHeld(dt);
    h.player.mesh.visible = true;

    // Lose a target that's too far, hidden or beaten.
    if (this.lock) {
      const range = this.lockReach * 1.3;
      if (this.lock.dead || Math.hypot(this.lock.x - p.x, this.lock.z - p.z) > range) this.lock = this.lock.dead ? this.pickTarget(this.lock, true) : null;
    }

    const world: EnemyWorld = {
      map: h.map, px: p.x, py: p.y, pz: p.z,
      visibility: this.visibility(),
      noise: this.noise(),
      lit: h.heroLit?.() ?? 0,
      safe: h.safeZones?.() ?? [],
      blockedAt: (x, z) => h.solidEventAt(x, z),
      // Reaching the hero (a blow, a charge, a shot) starts the battle.
      hurtPlayer: (_d, x, z, from) => this.hurtPlayer(x, z, from),
      hurtEnemy: () => {},
      shoot: (e) => { h.encounter?.(e, 'normal'); },
      others: this.enemies,
    };
    // Foes on the map only ever go for the hero: reaching them starts the battle.
    for (const e of this.enemies) e.update(dt, world);
    for (const b of this.breakables) b.update(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].gone) this.enemies.splice(i, 1);
    this.updateProjectiles(dt);
    this.updateOverlay();
  }

  /** Show the weapon in the hero's hand while swinging or drawing, and runes while casting. */
  private updateHeld(dt: number): void {
    const hd = this.held, h = this.host;
    if (!hd) return;
    const p = h.player.position, dir = h.player.dir;
    // Weapons with an LPC sprite are drawn by the hero's own animation; the rest show their icon.
    const drawn = h.player.weaponIds;
    const sprite = (slot: EquipSlot) => { const id = itemWeaponSprite(this.equipped(slot)); return !!id && drawn.includes(id); };
    if (this.holding) hd.hold(this.holding.icon, p, dir, this.holding.tilt);
    else if (this.swing && !sprite('weapon')) hd.swing(h.iconCanvas(h.inventory.equip.weapon, 'sword'), p, dir, this.swing.t / this.swing.dur);
    else if (this.draw && !sprite('ranged')) hd.bow(h.iconCanvas(h.inventory.equip.ranged, 'bow'), p, dir, Math.min(1, this.draw.t / this.drawTime));
    else hd.hideItem();
    this.castGlow = Math.max(0, this.castGlow - dt);
    this.bowHands = Math.max(0, this.bowHands - dt);
    // Magic: the hands glow in the spell's colour only while casting (the readied shard shows on the HUD).
    const shard = this.spell();
    const amount = Math.min(1, this.castGlow / 0.4);
    const hex = shard?.spell.color || SPELL_DEFAULT_COLOR;
    if (this.spellColor.hex !== hex) this.spellColor = { hex, color: linearColor(hex) };
    hd.cast(p, dir, this.spellColor.color, amount, dt);
    const L = this.handLight;
    if (L) {
      const li = shard?.spell.light, on = amount > 0.01 && (li?.intensity ?? 1) > 0;
      L.intensity = on ? (li?.intensity ?? 1) * (0.55 + amount * 0.9) * (0.92 + Math.sin(performance.now() / 70) * 0.08) : 0;
      if (on) {
        L.color.copy(this.spellColor.color);
        L.distance = Math.max(1, li?.radius ?? 3);
        L.position.set(p.x, p.y + 0.75, p.z + 0.25);
      }
    }
  }

  /**
   * The readied weapon slung on the hero's back: the sword with melee chosen, the bow with the bow chosen (nothing
   * with magic, where the hands glow instead). It leaves the back while it's in the hand. Runs every frame, cutscenes
   * and menus included, so it follows the hero wherever events move them.
   */
  updateBack(): void {
    const hd = this.held, h = this.host;
    if (!hd || !h) return;
    if (!h.player.mesh.visible || h.motion.swimming) { hd.hideBack(); h.player.setWeapons([]); return; }
    // The weapon comes off the back only to fight: swinging (and between the hits of a combo), guarding, drawing
    // and loosing the bow. Animated heroes then hold its LPC sprite (with the shield, for melee); otherwise the icon
    // swings at the hand. The rest of the time it's slung on the back, where walking, running and jumping can't
    // make it look out of step.
    const meleeHands = this.weapon === 'melee' && (!!this.swing || this.comboWindow > 0);
    const bowHands = this.weapon === 'bow' && (!!this.draw || this.bowHands > 0);
    const carry: CarriedWeapon[] = [];
    if (h.player.animated) {
      const add = (slot: EquipSlot) => {
        const item = this.equipped(slot), id = itemWeaponSprite(item), w = h.sprites.weapon(id);
        if (!w) return;
        // The item's glow and swing trail, drawn with the sheet's soft silhouette.
        const fx = item?.glow || item?.trail;
        carry.push({ ...w, glow: item?.glow, trail: item?.trail, mask: fx ? h.sprites.weaponMask(id) : null });
      };
      if (meleeHands) { add('shield'); add('weapon'); }
      else if (bowHands && this.available('bow')) add('ranged');
    }
    h.player.setWeapons(carry);
    // Update 137: nothing slung on the back any more (the Cut and Bow key items only show while they're used).
    hd.hideBack();
  }

  /** How visible the hero is: light where they stand, halved while sneaking. */
  private visibility(): number {
    const h = this.host, p = h.player.position;
    return Math.max(0.15, Math.min(1, h.lightAt(p.x, p.z))) * (this.sneaking ? 0.5 * (1 - Math.min(80, h.skills.get('sneakHide')) / 100) : 1);
  }

  /** How far the hero can be heard, in tiles. */
  private noise(): number {
    const m = this.host.motion;
    const quiet = 1 - Math.min(90, this.host.skills.get('quietSteps')) / 100;
    let r = this.moving ? (m.running ? 6 : this.sneaking ? 0.9 * quiet : 2.6) : this.sneaking ? 0 : 0.6;
    if (m.swimming) r = Math.max(r, 3);
    if (this.sinceNoise < 0.8) r = Math.max(r, this.noiseRadius);
    return r;
  }

  private makeNoise(radius: number): void {
    this.sinceNoise = 0;
    this.noiseRadius = this.sneaking ? radius * 0.6 : radius;
  }

  private updateOverlay(): void {
    const h = this.host, o = h.overlay, p = h.player.position;
    o.beginTags();
    for (const e of this.enemies) {
      o.tag(e, e.x, e.y + e.height + 0.15, e.z, { hp: e.hp, max: e.maxHp, awareness: e.awareness, alert: e.alert, alertAge: e.alertAge, locked: e === this.lock, name: e.def.name, dead: e.dead, elements: e.def.elements?.slice(0, 2).map(elementIconUrl),
        status: e.status.list.length ? e.status.list.filter((x) => !x.id.startsWith('buff:')).map((x) => statusIconUrl(x.id)) : e.def.undead ? [statusIconUrl('zombie')] : undefined });
    }
    // Breakables show their health once hit (or when locked on).
    for (const b of this.breakables) {
      const show = !b.dead && (b.hp < b.maxHp || b === this.lock);
      o.tag(b, b.x, b.y + b.height + 0.15, b.z, { hp: b.hp, max: b.maxHp, awareness: 0, alert: false, alertAge: 99, locked: b === this.lock, name: b.name, dead: !show });
    }
    o.endTags();
    o.meter(p.x, p.y - 0.05, p.z, this.draw ? this.draw.t / this.drawTime : null);
    if (!this.sneaking) { o.stealth(null); o.hidden(0); }
    else {
      const live = this.enemies.filter((e) => !e.dead);
      const state = live.some((e) => e.alert) ? 'detected' : live.some((e) => e.awareness >= SUSPICIOUS) ? 'noticed' : 'hidden';
      o.stealth(state);
      // The screen's edges darken the better hidden the hero is (in shadow, sneaking); seen, it lifts.
      const hide = Math.max(0, Math.min(1, (0.9 - this.visibility()) / 0.75));
      o.hidden(state === 'detected' ? 0 : state === 'noticed' ? hide * 0.5 : hide);
    }
  }

  /** Stop everything at once (death, a cutscene starting is fine to leave). */
  /** Did a hit from (x, z) come from behind the hero? */
  private behind(x: number, z: number): boolean {
    const p = this.host.player.position, [fx, fz] = DIR_VECTOR[this.host.player.dir], [ax, az] = norm(x - p.x, z - p.z);
    return ax * fx + az * fz < -0.4;
  }

  /** Turn-based: beaten in a battle. It falls and fades on the map and stays beaten until the hero comes back. */
  beatenInBattle(e: Enemy): void {
    e.defeat();
    this.beaten.add(e.key as EnemyEvent);
    if (this.lock === e) this.lock = null;
  }

  reset(): void {
    this.swing = null; this.draw = null; this.cast = 0; this.lock = null; this.bowHands = 0;
    this.held?.hide();
    if (this.handLight) this.handLight.intensity = 0;
    this.heroStatus.clear();
    if (this.slash) this.slash.pivot.visible = false;
    if (this.host) { this.host.player.mesh.visible = true; (this.host.player.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0; }
  }
}

function norm(x: number, z: number): [number, number] {
  const d = Math.hypot(x, z);
  return d ? [x / d, z / d] : [0, 0];
}

/** Textures drawn in code: the slash arc, arrows and the firebolt. */
function makeTextures(): { slash: THREE.Texture; arrow: THREE.Texture; enemyArrow: THREE.Texture; fire: THREE.Texture; bolt: THREE.Texture } {
  const canvas = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  };
  // A crescent pointing up (towards local -z once laid flat).
  const slash = canvas(64, 64, (c) => {
    const g = c.createRadialGradient(32, 40, 10, 32, 40, 30);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.65, 'rgba(255,250,235,0.0)');
    g.addColorStop(0.82, 'rgba(255,250,235,0.95)');
    g.addColorStop(1, 'rgba(255,250,235,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(32, 40); c.arc(32, 40, 30, Math.PI * 1.12, Math.PI * 1.88); c.closePath(); c.fill();
  });
  const arrowTex = (shaft: string, head: string) => canvas(8, 32, (c) => {
    c.fillStyle = shaft; c.fillRect(3, 6, 2, 22);
    c.fillStyle = head; c.beginPath(); c.moveTo(4, 0); c.lineTo(7, 7); c.lineTo(1, 7); c.closePath(); c.fill();
    c.fillStyle = '#e8e0d0'; c.fillRect(1, 25, 2, 6); c.fillRect(5, 25, 2, 6);
  });
  const fire = canvas(32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.3, 'rgba(255,190,80,0.95)');
    g.addColorStop(0.65, 'rgba(255,90,30,0.5)');
    g.addColorStop(1, 'rgba(255,40,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  // A spell bolt: white, tinted by the material to the spell's colour.
  const bolt = canvas(32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  });
  return { slash, arrow: arrowTex('#c8a070', '#d8dce8'), enemyArrow: arrowTex('#6a4a30', '#9a9aa8'), fire, bolt };
}

/** A spell with no colour set. */
const SPELL_DEFAULT_COLOR = '#ff8a3a';

/** The element an enemy's attacks hit with: set on purpose, or its first element. */
export const enemyElement = (d: EnemyDef): Element => d.attackElement ?? d.elements?.[0] ?? 'neutral';

/** "You are poisoned", "Bandit is frozen". */
export const STATUS_WORD: Record<Ailment | 'frozen', string> = {
  burn: 'burning', poison: 'poisoned', chill: 'chilled', frozen: 'frozen', paralyze: 'paralysed', blind: 'blinded', silence: 'silenced',
  stagger: 'staggered', sleep: 'asleep', confusion: 'confused', zombie: 'a zombie',
};
