/**
 * All dynamic lighting on a map:
 *  - point and spot lights placed on the Lights layer,
 *  - area lights (local tint, see render/areaTint.ts),
 *  - lights carried by props (campfires, torches, imported lamps), with their flames and embers.
 *
 * Each light follows its schedule (always / night only / brighter at night), an optional switch,
 * and a flicker pattern.
 */
import type { PropData } from './types';
import * as THREE from 'three';
import { flameStrip, softDot } from '../art/placeholderArt';
import { leanNow } from '../render/lean';
import { clamp, hash2 } from '../core/math';
import type { GameState } from '../game/GameState';
import { type AreaUniform, MAX_AREAS, setAreas } from '../render/areaTint';
import { SpriteLibrary, spriteGeometry } from '../render/sprites';
import { linearColor, makeTexture } from '../render/textures';
import type { LightCounts } from '../shared/lightBudget';
import type { TileMap } from './TileMap';
import { propBase } from './wallAnchor';
import type { Dir, Flicker, LightData, LightSchedule, MapData } from './types';

/** How far in front of a prop its light sits, so it lights the sprite's face. */
const PROP_LIGHT_FORWARD = 0.3;
const EMBERS = 48;

const DIR_VEC: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

interface Live {
  light: THREE.PointLight | THREE.SpotLight;
  intensity: number;
  schedule: LightSchedule;
  flicker: Flicker;
  switch?: string;
  seed: number;
  /** Flame meshes shown only while this light is on. */
  flames: THREE.Mesh[];
  /** Index into the ember emitters, or -1. */
  emitter: number;
  on: boolean;
  /** The prop it belongs to (fires that burn out). */
  prop?: PropData;
  /** Burnt out (no fuel): dark until fed. */
  out?: boolean;
}

interface LiveArea { data: Extract<LightData, { type: 'area' }>; uniform: AreaUniform; color: THREE.Color }

interface Emitter { origin: THREE.Vector3; spread: number; active: boolean }


/** Schedule factor for a night amount (0 day … 1 night). */
export function scheduleFactor(s: LightSchedule | undefined, night: number): number {
  if (s === 'night') return clamp((night - 0.15) / 0.45, 0, 1);
  if (s === 'nightBoost') return 0.4 + 0.6 * night;
  return 1;
}

function flickerFactor(f: Flicker | undefined, t: number, seed: number): number {
  switch (f) {
    case 'fire': return 0.82 + 0.12 * Math.sin(t * 11 + seed) + 0.06 * Math.sin(t * 23.7 + seed * 2);
    case 'candle': return 0.9 + 0.07 * Math.sin(t * 7 + seed) + 0.03 * Math.sin(t * 17.3 + seed * 3);
    case 'pulse': return 0.7 + 0.3 * Math.sin(t * 2.2 + seed);
    case 'faulty': {
      const k = Math.floor(t * 9);
      return hash2(k, Math.floor(seed * 10), 5) < 0.12 ? 0.08 : 1;
    }
    default: return 1;
  }
}

/** Lights of each kind, as the shaders count them. */
export interface ShaderLights { point: number; spot: number; pointShadows: number; spotShadows: number }
export const maxLights = (a: ShaderLights, b: ShaderLights): ShaderLights => ({
  point: Math.max(a.point, b.point), spot: Math.max(a.spot, b.spot), pointShadows: Math.max(a.pointShadows, b.pointShadows), spotShadows: Math.max(a.spotShadows, b.spotShadows),
});

export class Lights {
  private readonly lives: Live[] = [];
  private readonly areas: LiveArea[] = [];
  private readonly emitters: Emitter[] = [];
  private readonly flameTex: THREE.Texture;
  /** Things on props placed upright (a flame, a light, embers' origin): where they sit as the props lean. */
  private readonly leaners: { at: THREE.Vector3; base: number; z: number; dy: number; tilt?: THREE.Object3D }[] = [];
  private leanWas = 0;
  private readonly embers: THREE.Points;
  private readonly emberPos = new Float32Array(EMBERS * 3);
  private readonly emberVel = new Float32Array(EMBERS * 3);
  private readonly emberLife = new Float32Array(EMBERS);
  /** Lights that cast shadows (debug panel can switch them off). */
  readonly shadowLights: (THREE.PointLight | THREE.SpotLight)[] = [];
  readonly budget: LightCounts = { point: 0, spot: 0, pointShadows: 0, spotShadows: 0, area: 0 };
  private scene!: THREE.Object3D;
  private readonly standIns: THREE.Light[] = [];

  /** How many lights of each kind this map's shaders are built for (its own, before any stand-ins). */
  get counts(): ShaderLights {
    const c = { point: 0, spot: 0, pointShadows: 0, spotShadows: 0 };
    for (const { light: l } of this.lives) {
      if (!l.parent) continue; // a flame's placeholder, never added
      if (l instanceof THREE.SpotLight) { if (l.castShadow) c.spotShadows++; else c.spot++; }
      else if (l.castShadow) c.pointShadows++; else c.point++;
    }
    return c;
  }

  /**
   * Unlit stand-ins (far away, intensity 0) so the map has at least `want` lights of each kind. Every material's shader
   * is built for the number of lights in the scene, so walking into a seamless neighbour with a different number made
   * the whole scene rebuild its shaders (a long freeze). The game pads each map to the most any map around it needs.
   */
  padTo(want: ShaderLights): void {
    const have = { ...this.counts };
    for (const l of this.standIns) {
      if (l instanceof THREE.SpotLight) { if (l.castShadow) have.spotShadows++; else have.spot++; }
      else if (l.castShadow) have.pointShadows++; else have.point++;
    }
    const add = (n: number, make: () => THREE.PointLight | THREE.SpotLight, shadow: boolean) => {
      for (let k = 0; k < n; k++) {
        const l = make();
        l.position.set(0, -500, 0);
        if (shadow) {
          // A tiny shadow map drawn once: it only has to exist for the shader to match.
          l.castShadow = true;
          l.shadow.mapSize.set(8, 8);
          l.shadow.autoUpdate = false;
          l.shadow.needsUpdate = true;
        }
        this.scene.add(l);
        if (l instanceof THREE.SpotLight) this.scene.add(l.target);
        this.standIns.push(l);
      }
    };
    add(want.point - have.point, () => new THREE.PointLight(0x000000, 0, 0.01), false);
    add(want.spot - have.spot, () => new THREE.SpotLight(0x000000, 0, 0.01), false);
    add(want.pointShadows - have.pointShadows, () => new THREE.PointLight(0x000000, 0, 0.01), true);
    add(want.spotShadows - have.spotShadows, () => new THREE.SpotLight(0x000000, 0, 0.01), true);
  }

  constructor(scene: THREE.Object3D, data: MapData, map: TileMap, sprites: SpriteLibrary) {
    this.flameTex = makeTexture(flameStrip());
    this.flameTex.repeat.set(1 / 4, 1);
    const flameMat = new THREE.MeshBasicMaterial({ map: this.flameTex, alphaTest: 0.4, side: THREE.DoubleSide, color: new THREE.Color(3.4, 2.5, 1.8) });
    const ground = (x: number, z: number) => map.surfaceY(x, z);

    // Lights placed on the Lights layer.
    for (const l of data.lights) {
      if (l.type === 'area') {
        this.areas.push({
          data: l, color: linearColor(l.color).multiplyScalar(l.intensity),
          uniform: { x: l.x, z: l.z, hw: l.w / 2, hh: l.h / 2, ellipse: l.shape === 'ellipse', feather: l.feather, color: new THREE.Color(), amount: 0 },
        });
        this.budget.area++;
        continue;
      }
      const y = ground(l.x, l.z) + (l.y ?? (l.type === 'spot' ? 1.6 : 1.2));
      let light: THREE.PointLight | THREE.SpotLight;
      if (l.type === 'spot') {
        const s = new THREE.SpotLight(linearColor(l.color), l.intensity, l.radius, THREE.MathUtils.degToRad(clamp(l.angle, 5, 170) / 2), 0.45, 2);
        const [dx, dz] = DIR_VEC[l.dir], t = THREE.MathUtils.degToRad(clamp(l.tilt, 0, 89));
        s.position.set(l.x, y, l.z);
        s.target.position.set(l.x + dx * Math.cos(t) * 4, y - Math.sin(t) * 4, l.z + dz * Math.cos(t) * 4);
        scene.add(s.target);
        light = s;
        this.budget.spot++;
      } else {
        light = new THREE.PointLight(linearColor(l.color), l.intensity, l.radius, 2);
        light.position.set(l.x, y, l.z);
        this.budget.point++;
      }
      this.addLive(scene, light, l.intensity, l.schedule, l.flicker, l.switch, !!l.shadows, [], -1);
    }

    // Lights, flames and embers carried by props.
    for (const p of data.props) {
      const d = sprites.def(p.type);
      if (!d || (!d.light && !d.flame)) continue;
      // Wall props (torches, lanterns) hang on the cliff face behind their tile.
      const s = p.s ?? 1, at = propBase(map, p, d), base = at.y, pz = at.z;
      const flames: THREE.Mesh[] = [];
      let emitter = -1;
      if (d.flame) {
        const f = new THREE.Mesh(spriteGeometry(d.flame.w * s, d.flame.h * s), flameMat);
        f.position.set(p.x + d.flame.x * s, base + d.flame.y * s, pz + 0.03);
        if (!d.wall) this.leaners.push({ at: f.position, base, z: pz + 0.03, dy: d.flame.y * s, tilt: f });
        scene.add(f);
        flames.push(f);
        if (d.flame.embers) {
          emitter = this.emitters.length;
          this.emitters.push({ origin: new THREE.Vector3(p.x + d.flame.x * s, base + d.flame.y * s + d.flame.h * s * 0.15, pz + 0.05), spread: d.flame.w * s * 0.5, active: true });
          if (!d.wall) this.leaners.push({ at: this.emitters[emitter].origin, base, z: pz + 0.05, dy: d.flame.y * s + d.flame.h * s * 0.15 });
        }
      }
      if (d.light) {
        const l = d.light;
        const light = new THREE.PointLight(linearColor(l.color), l.intensity, l.radius * Math.sqrt(s), 2);
        light.position.set(p.x + l.x * s, base + l.y * s, pz + PROP_LIGHT_FORWARD);
        if (!d.wall) this.leaners.push({ at: light.position, base, z: pz + PROP_LIGHT_FORWARD, dy: l.y * s });
        this.addLive(scene, light, l.intensity, l.schedule, l.flicker, l.switch, !!l.shadows, flames, emitter);
        this.lives[this.lives.length - 1].prop = p;
        this.budget.point++;
      } else if (flames.length) {
        // A flame with no light still animates; it's always on.
        this.lives.push({ light: new THREE.PointLight(0, 0), intensity: 0, schedule: 'always', flicker: 'none', seed: 0, flames, emitter, on: true, prop: p });
      }
    }

    if (this.areas.length > MAX_AREAS) console.warn(`Only the first ${MAX_AREAS} area lights on a map are shown.`);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.emberPos, 3));
    this.embers = new THREE.Points(geo, new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(softDot()), size: 0.09, color: new THREE.Color(4, 1.6, 0.5),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.embers.frustumCulled = false;
    this.embers.visible = this.emitters.length > 0;
    scene.add(this.embers);
    this.scene = scene;
    for (let i = 0; i < EMBERS; i++) { this.spawnEmber(i); this.emberLife[i] *= Math.random(); }
  }

  private addLive(scene: THREE.Object3D, light: THREE.PointLight | THREE.SpotLight, intensity: number, schedule: LightSchedule | undefined,
    flicker: Flicker | undefined, sw: string | undefined, shadows: boolean, flames: THREE.Mesh[], emitter: number): void {
    if (shadows) {
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.camera.near = 0.1;
      light.shadow.camera.far = Math.max(4, light.distance || 10);
      light.shadow.bias = -0.004;
      this.shadowLights.push(light);
      if (light instanceof THREE.SpotLight) this.budget.spotShadows++; else this.budget.pointShadows++;
    }
    scene.add(light);
    this.lives.push({ light, intensity, schedule: schedule ?? 'always', flicker: flicker ?? 'none', switch: sw || undefined, seed: this.lives.length * 3.1, flames, emitter, on: true });
  }

  /** A fire prop burnt out (true) or burning (false). */
  setOut(prop: PropData, out: boolean): void {
    for (const l of this.lives) {
      // Its own light and flame, and any light placed on the Lights layer right by it (a fire's glow set by hand).
      const near = !l.prop && Math.hypot(l.light.position.x - prop.x, l.light.position.z - prop.z) < 1.25;
      if (l.prop === prop || near) l.out = out;
    }
  }

  /** Is a spot within the warmth of a burning fire (a campfire, a torch, a brazier: anything with a flame that's lit)? */
  byFire(x: number, z: number, reach = 2.5): boolean {
    for (const l of this.lives) {
      if (!l.flames.length || l.out || !l.on || l.light.intensity <= 0.05) continue;
      if (Math.hypot(l.light.position.x - x, l.light.position.z - z) <= reach) return true;
    }
    return false;
  }

  /** How brightly the map's lamps and fires light a spot right now (0 … 1), for stealth. */
  lightAt(x: number, z: number): number {
    let best = 0;
    for (const l of this.lives) {
      if (!l.on || l.light.intensity <= 0.05) continue;
      const r = l.light.distance || 8, d = Math.hypot(l.light.position.x - x, l.light.position.z - z);
      if (d >= r) continue;
      const k = (1 - d / r) ** 2 * Math.min(1, l.light.intensity / 1.5);
      if (k > best) best = k;
    }
    return Math.min(1, best * 1.6);
  }

  update(dt: number, time: number, night: number, state: GameState): void {
    for (const l of this.lives) {
      const sw = l.switch ? (state.getSwitch(l.switch) ? 1 : 0) : 1;
      const f = scheduleFactor(l.schedule, night) * sw * (l.out ? 0 : 1);
      // Lights stay in the scene and fade to zero: adding or removing lights would make three.js recompile shaders.
      l.light.intensity = l.intensity * f * flickerFactor(l.flicker, time, l.seed);
      const on = f > 0.05;
      if (on !== l.on) {
        l.on = on;
        for (const m of l.flames) m.visible = on;
        if (l.emitter >= 0) this.emitters[l.emitter].active = on;
      }
    }
    for (const a of this.areas) {
      const sw = a.data.switch ? (state.getSwitch(a.data.switch) ? 1 : 0) : 1;
      a.uniform.amount = scheduleFactor(a.data.schedule, night) * sw;
      a.uniform.color.copy(a.color);
    }
    setAreas(this.areas.map((a) => a.uniform));

    this.flameTex.offset.x = (Math.floor(time * 10) % 4) / 4;
    // Props lean back toward the camera (render/lean.ts): their flames, lights and embers go with them.
    const lean = leanNow();
    if (lean !== this.leanWas) {
      this.leanWas = lean;
      const c = Math.cos(lean), sn = Math.sin(lean);
      for (const q of this.leaners) { q.at.y = q.base + q.dy * c; q.at.z = q.z - q.dy * sn; if (q.tilt) q.tilt.rotation.x = -lean; }
    }
    if (!this.emitters.length) return;
    for (let i = 0; i < EMBERS; i++) {
      this.emberLife[i] -= dt;
      if (this.emberLife[i] <= 0) { this.spawnEmber(i); continue; }
      this.emberPos[i * 3] += this.emberVel[i * 3] * dt + Math.sin(time * 3 + i) * 0.004;
      this.emberPos[i * 3 + 1] += this.emberVel[i * 3 + 1] * dt;
      this.emberPos[i * 3 + 2] += this.emberVel[i * 3 + 2] * dt;
    }
    (this.embers.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private spawnEmber(i: number): void {
    const active = this.emitters.filter((e) => e.active);
    if (!active.length) { this.emberPos[i * 3 + 1] = -100; this.emberLife[i] = 0.5; return; }
    const e = active[Math.floor(Math.random() * active.length)], o = e.origin;
    this.emberPos[i * 3] = o.x + (Math.random() - 0.5) * e.spread;
    this.emberPos[i * 3 + 1] = o.y;
    this.emberPos[i * 3 + 2] = o.z + (Math.random() - 0.5) * 0.2;
    this.emberVel[i * 3] = (Math.random() - 0.5) * 0.3;
    this.emberVel[i * 3 + 1] = 0.6 + Math.random() * 0.9;
    this.emberVel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    this.emberLife[i] = 0.6 + Math.random() * 1.4;
  }
}
