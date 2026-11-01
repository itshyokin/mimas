/**
 * Field spells: the spell shard in the magic slot when it carries one, switched on and off by casting it (key 3)
 * or with F. (They were ring powers once, hence the name.)
 *  - Light: a glow all around the hero, from an orb of light floating by them, or a lantern / torch. Drains magic while on.
 *    (Older flashlight beams are orbs now: a wide glow rather than a ray.)
 *  - Water Walk: walk on water of any depth as if it were ground (no swimming, no stamina). Drains magic while on.
 * The lights exist for as long as a Light shard is equipped and are dimmed to nothing while it's off: adding or
 * removing a light makes every material recompile, which would stutter on each press.
 */
import * as THREE from 'three';
import { linearColor } from '../render/textures';
import type { Dir, FieldPower, ItemDef, ItemLight } from '../world/types';
import { FIELD_GLOW } from '../world/items';

/** A field spell's power and costs. */
export interface FieldSpell { power: FieldPower; mpCost?: number; mpPerSecond?: number; glow?: string }


/** A Light key item with no light of its own set: a warm lantern glow. */
const DEFAULT_LANTERN: ItemLight = { type: 'lantern', color: '#ffe2b0', intensity: 2, radius: 10 };

interface RingLights { def: ItemLight; main: THREE.PointLight; radius: number; orb: THREE.Sprite | null }

export class Rings {
  /** A toggle power is switched on. */
  active = false;
  private worn: ItemDef | null = null;
  private lights: RingLights | null = null;
  /** 0 … 1: the light fades in and out over a moment instead of snapping. */
  private level = 0;
  /** A one-off power (cutting) flashes the glow for a moment. */
  private flashT = 0;
  /** A soft ring of colour on the ground around the hero while a power is on. */
  private aura: THREE.Mesh | null = null;
  private readonly glowColor = new THREE.Color();

  constructor(private readonly scene: THREE.Scene) {}

  /** The shard whose field spell is ready (if any). */
  get ring(): ItemDef | null { return this.worn; }
  get power(): FieldSpell | null {
    const w = this.worn, s = w?.spell;
    // Key items (a lantern, water-walking boots): free to use.
    if (w?.tool) return { power: w.tool };
    return s?.power ? { power: s.power, mpCost: s.mp, mpPerSecond: s.mpPerSecond, glow: s.glow } : null;
  }
  /** The field use comes from a key item (not a spell). */
  get isTool(): boolean { return !!this.worn?.tool; }
  get waterWalk(): boolean { return this.active && this.power?.power === 'waterWalk'; }
  /** Magic drained per second right now. */
  get mpDrain(): number { return this.active ? Math.max(0, this.power?.mpPerSecond ?? 0) : 0; }

  /** Match the worn ring (after equipping, loading…). Changing rings switches the power off. */
  wear(def: ItemDef | null, shadows: boolean): void {
    if (def === this.worn) return;
    this.worn = def;
    this.active = false;
    this.level = 0;
    this.removeLights();
    const l = (def?.spell?.power ?? def?.tool) === 'light' ? def!.light ?? (def!.tool ? DEFAULT_LANTERN : undefined) : undefined;
    if (l) this.addLights(l, shadows);
  }

  /** The colour the hero glows while this ring's power is on: chosen per ring, or by power (gold light, blue water, green cutting). */
  get color(): string {
    const r = this.power;
    return r?.glow ?? FIELD_GLOW[r?.power ?? 'light'];
  }

  /** Flash the glow (a one-off power was used). */
  flash(): void { this.flashT = 0.5; }

  /** How the hero glows right now (null: not at all). */
  glow(time: number): { color: THREE.Color; amount: number } | null {
    const on = this.active ? 0.22 + 0.1 * Math.sin(time * 4) : 0, f = this.flashT > 0 ? this.flashT / 0.5 * 0.7 : 0;
    const amount = Math.max(on, f);
    if (amount <= 0.01) return null;
    this.glowColor.set(this.color).convertSRGBToLinear();
    return { color: this.glowColor, amount };
  }

  /** Switch a toggle power off (out of magic, respawning, menus that change the ring). */
  off(): void { this.active = false; }

  /**
   * Press of the Ring key for a toggle power: switch it on or off.
   * `spend` takes the switch-on cost; returns a message for the player, or null.
   */
  toggle(spend: (mp: number) => boolean, mp: number): string | null {
    const r = this.power;
    if (!r) return null;
    if (this.active) { this.active = false; return null; }
    if ((r.mpPerSecond ?? 0) > 0 && mp <= 0) return 'Not enough MP.';
    if (!spend(r.mpCost ?? 0)) return 'Not enough MP.';
    this.active = true;
    return null;
  }

  setShadows(on: boolean): void {
    const l = this.lights;
    if (l?.main) l.main.castShadow = !!l.def.shadows && on;
  }

  /** How much further the light reaches (Radiance, in the Magic tree): 1 = as set on the shard. */
  reach = 1;

  /** Keep the light with the hero: the orb floats by them; a torch flickers. */
  update(dt: number, p: THREE.Vector3, dir: Dir, visible: boolean, elapsed: number): void {
    this.flashT = Math.max(0, this.flashT - dt);
    this.updateAura(p, visible, elapsed);
    const l = this.lights;
    if (!l) return;
    const want = this.active && visible ? 1 : 0;
    this.level += Math.sign(want - this.level) * Math.min(Math.abs(want - this.level), dt * 6);
    const d = l.def;
    l.main.distance = l.radius * this.reach;
    if (l.orb) {
      // The orb: floating above the hero's shoulder, drifting round them a little and bobbing; the light comes from it.
      const a = elapsed * 0.9, bob = Math.sin(elapsed * 2.3) * 0.08;
      const ox = p.x + Math.cos(a) * 0.45, oy = p.y + 2.1 + bob, oz = p.z + 0.15 + Math.sin(a) * 0.3;
      l.orb.position.set(ox, oy, oz);
      l.main.position.set(ox, oy, oz);
      const pulse = 0.94 + 0.06 * Math.sin(elapsed * 3.1);
      l.main.intensity = (d.type === 'flashlight' ? 2.4 : d.intensity || 2.2) * pulse * this.level;
      l.orb.visible = this.level > 0.01;
      l.orb.scale.setScalar((0.55 + 0.05 * Math.sin(elapsed * 3.1)) * (0.4 + 0.6 * this.level));
      (l.orb.material as THREE.SpriteMaterial).opacity = this.level;
    } else {
      // Held at the side.
      l.main.position.set(p.x + 0.25, p.y + 0.95, p.z + 0.25);
      const flicker = d.type === 'torch' ? 0.85 + 0.15 * Math.sin(elapsed * 11) * Math.sin(elapsed * 7.3) : 1;
      l.main.intensity = (d.intensity || 1.6) * flicker * this.level;
    }
  }

  private updateAura(p: THREE.Vector3, visible: boolean, t: number): void {
    const show = visible && (this.active || this.flashT > 0);
    if (!show) { if (this.aura) this.aura.visible = false; return; }
    if (!this.aura) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 10, 32, 32, 31);
      r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,0.55)'); r.addColorStop(0.8, 'rgba(255,255,255,0.25)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      this.aura = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), mat);
      this.aura.rotation.x = -Math.PI / 2;
      this.scene.add(this.aura);
    }
    const a = this.aura, mat = a.material as THREE.MeshBasicMaterial;
    a.visible = true;
    a.position.set(p.x, p.y + 0.03, p.z);
    a.scale.setScalar(1 + Math.sin(t * 3) * 0.06 + (this.flashT > 0 ? (0.5 - this.flashT) * 0.8 : 0));
    mat.color.set(this.color);
    mat.opacity = this.active ? 0.6 : this.flashT / 0.5;
  }

  private addLights(d: ItemLight, shadows: boolean): void {
    const color = linearColor(d.color || '#ffe8b0'), radius = Math.max(1, d.radius || 6);
    const main = new THREE.PointLight(color, 0, radius, 2);
    main.castShadow = !!d.shadows && shadows;
    if (main.castShadow) main.shadow.mapSize.set(512, 512);
    this.scene.add(main);
    // The orb itself: a soft glowing ball (drawn over the scene, so it reads as light). An old flashlight is one too.
    let orb: THREE.Sprite | null = null;
    if (d.type === 'orb' || d.type === 'flashlight') {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      const col = new THREE.Color(d.color || '#ffe6b0');
      const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.95)'); r.addColorStop(0.32, `rgba(${rgb},0.75)`);
      r.addColorStop(0.6, `rgba(${rgb},0.22)`); r.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      orb.visible = false;
      orb.renderOrder = 5;
      this.scene.add(orb);
    }
    this.lights = { def: d, main, radius, orb };
  }

  private removeLights(): void {
    const l = this.lights;
    if (!l) return;
    this.scene.remove(l.main);
    l.main.shadow?.map?.dispose();
    l.main.dispose?.();
    if (l.orb) { this.scene.remove(l.orb); const m = l.orb.material as THREE.SpriteMaterial; m.map?.dispose(); m.dispose(); }
    this.lights = null;
  }
}
