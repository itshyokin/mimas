/**
 * Time-of-day lighting over a full 24-hour day: interpolates sun (or moon), sky, fog and exposure
 * between keyframes, and lets the clock run on its own.
 *
 * How it looks depends on the map's environment:
 *  - outdoor: the full cycle.
 *  - indoor:  a muted version (light through the windows), dimmer and softer than outside.
 *  - dark:    caves and dungeons: dark whatever the hour, so only lights show.
 * `darkness` (0 – 1, from the database) sets how dark night gets: 1 is pitch black away from lights.
 */
import * as THREE from 'three';
import { clamp } from '../core/math';
import { linearColor } from '../render/textures';
import type { MapEnvironment } from './types';

interface Key { h: number; sun: string; si: number; el: number; sky: string; gnd: string; hi: number; fog: string; exp: number; night: number }
interface LinKey { h: number; sun: THREE.Color; si: number; el: number; sky: THREE.Color; gnd: THREE.Color; hi: number; fog: THREE.Color; exp: number; night: number }

/** Keyframes from midnight to midnight (the last equals the first, so the day wraps smoothly). */
const KEYS: Key[] = [
  { h: 0,    sun: '#7d97ff', si: 0.30, el: 48, sky: '#28335e', gnd: '#0f101b', hi: 0.24, fog: '#0c1024', exp: 1.3,  night: 1 },
  { h: 4.5,  sun: '#7d97ff', si: 0.30, el: 30, sky: '#2b3663', gnd: '#10111c', hi: 0.24, fog: '#0e1228', exp: 1.3,  night: 1 },
  { h: 5.5,  sun: '#a7a2e0', si: 0.35, el: 2,  sky: '#56578f', gnd: '#1d1c2a', hi: 0.30, fog: '#3a3a64', exp: 1.2,  night: 0.75 },
  { h: 6.5,  sun: '#ffb98a', si: 0.9,  el: 8,  sky: '#9fb6d8', gnd: '#3a3a42', hi: 0.40, fog: '#a6b4cf', exp: 1.05, night: 0.3 },
  { h: 8,    sun: '#ffe2bf', si: 1.5,  el: 24, sky: '#bcd6ee', gnd: '#46553a', hi: 0.55, fog: '#b4cddb', exp: 1.0,  night: 0 },
  { h: 12,   sun: '#fff4e2', si: 1.9,  el: 58, sky: '#cfe3f5', gnd: '#52683c', hi: 0.60, fog: '#a8c7d8', exp: 1.0,  night: 0 },
  { h: 17.5, sun: '#ffbf73', si: 1.7,  el: 20, sky: '#f0c7a0', gnd: '#4a3e38', hi: 0.45, fog: '#e0a77c', exp: 1.05, night: 0.1 },
  { h: 19.5, sun: '#ff6d55', si: 0.55, el: 7,  sky: '#6f63a6', gnd: '#272233', hi: 0.35, fog: '#463c66', exp: 1.15, night: 0.65 },
  { h: 21,   sun: '#7d97ff', si: 0.32, el: 30, sky: '#2f3b6a', gnd: '#121320', hi: 0.26, fog: '#10142a', exp: 1.3,  night: 1 },
  { h: 24,   sun: '#7d97ff', si: 0.30, el: 48, sky: '#28335e', gnd: '#0f101b', hi: 0.24, fog: '#0c1024', exp: 1.3,  night: 1 },
];
const LIN: LinKey[] = KEYS.map((k) => ({ ...k, sun: linearColor(k.sun), sky: linearColor(k.sky), gnd: linearColor(k.gnd), fog: linearColor(k.fog) }));
const SUN_AZIMUTH = new THREE.Vector2(-0.45, -0.8).normalize();
const BLACK = new THREE.Color(0, 0, 0);
const RAIN_FOG = new THREE.Color(0.52, 0.56, 0.62);
const SAND_FOG = new THREE.Color(0.85, 0.68, 0.45);
const MIST_FOG = new THREE.Color(0.7, 0.73, 0.78);
const INDOOR_SKY = linearColor('#c9c2b4'), INDOOR_GND = linearColor('#3a332c');
const CAVE_SKY = linearColor('#3a4660'), CAVE_GND = linearColor('#1a1a22');

export const MIN_HOUR = 0;
export const MAX_HOUR = 24;

/** Hours in 0 ≤ h < 24. */
export const wrapHour = (h: number): number => ((h % 24) + 24) % 24;

export class TimeOfDay {
  hour: number;
  /** Where `hour` is easing toward (presets and events animate the change). */
  target: number;
  /** 0 = full daylight, 1 = deep night: drives lamps on a night schedule and fireflies. */
  night = 0;
  /** How much windows and other glow masks glow (lit windows at night outside, daylight through them inside). */
  glow = 0;
  exposure = 1;
  readonly sunDir = new THREE.Vector3(0, 1, 0);
  /** Game minutes per real minute (0 = the clock stands still). */
  rate = 0;
  /** How dark night gets, 0 – 1. */
  darkness = 0.85;
  environment: MapEnvironment = 'outdoor';

  constructor(hour: number, private readonly sun: THREE.DirectionalLight, private readonly hemi: THREE.HemisphereLight, private readonly fog: THREE.Fog) {
    this.hour = this.target = wrapHour(hour);
    this.apply();
  }

  set(hour: number, instant: boolean): void {
    this.target = wrapHour(hour);
    if (instant) this.hour = this.target;
  }

  /** Weather: how rainy (0 … 1) and how sandy the air is (0 … 1). Set each frame by the game. */
  gloom = 0;
  haze = 0;
  /** Grey murk (haze, a blizzard's whiteout), 0 … 1. */
  mist = 0;

  update(dt: number): void {
    // The clock runs forward; a change of time (event, debug slider) eases there the short way round.
    if (this.rate > 0) this.target = wrapHour(this.target + (dt * this.rate) / 3600);
    let d = this.target - this.hour;
    if (d > 12) d -= 24; else if (d < -12) d += 24;
    this.hour = Math.abs(d) > 0.02 ? wrapHour(this.hour + d * Math.min(1, dt * 2.5)) : this.target;
    this.apply();
  }

  /** "18:36" or "6:36 PM". */
  label(twelveHour = false): string {
    const hh = Math.floor(this.hour), mm = Math.floor((this.hour - hh) * 60);
    if (!twelveHour) return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    return `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  }

  private apply(): void {
    let i = 0;
    while (i < LIN.length - 2 && this.hour > LIN[i + 1].h) i++;
    const a = LIN[i], b = LIN[i + 1], t = clamp((this.hour - a.h) / (b.h - a.h), 0, 1);
    const lerp = (p: number, q: number) => p + (q - p) * t;
    const night = lerp(a.night, b.night);
    // Darkness pulls the night toward black: less moonlight and sky light, no exposure boost.
    const dk = this.darkness * night;
    this.sun.color.lerpColors(a.sun, b.sun, t);
    this.sun.intensity = lerp(a.si, b.si) * (1 - 0.95 * dk);
    this.hemi.color.lerpColors(a.sky, b.sky, t);
    this.hemi.groundColor.lerpColors(a.gnd, b.gnd, t);
    this.hemi.intensity = lerp(a.hi, b.hi) * (1 - 0.92 * dk);
    this.fog.color.lerpColors(a.fog, b.fog, t).lerp(BLACK, dk * 0.9);
    this.exposure = lerp(a.exp, b.exp) * (1 - 0.25 * dk);
    this.night = night;
    this.glow = night;
    const el = THREE.MathUtils.degToRad(lerp(a.el, b.el));
    this.sunDir.set(Math.cos(el) * SUN_AZIMUTH.x, Math.sin(el), Math.cos(el) * SUN_AZIMUTH.y);

    if (this.environment === 'indoor') {
      // Light comes in through the windows: softer, warmer-white, never as bright or as dark as outside.
      this.sun.intensity *= 0.4;
      this.sun.color.lerp(new THREE.Color(1, 0.96, 0.9), 0.5);
      this.hemi.color.lerp(INDOOR_SKY, 0.6);
      this.hemi.groundColor.lerp(INDOOR_GND, 0.6);
      this.hemi.intensity = THREE.MathUtils.lerp(this.hemi.intensity, 0.38 * (1 - 0.7 * dk), 0.6);
      this.fog.color.lerp(BLACK, 0.85);
      this.exposure = THREE.MathUtils.lerp(this.exposure, 1.05, 0.6);
      // Windows show daylight by day and go dark at night (the opposite of outside).
      this.glow = (1 - night) * 0.8;
    } else if (this.environment === 'dark') {
      // Caves and dungeons: dark at any hour; lamps on a night schedule stay lit.
      this.sun.intensity = 0;
      this.hemi.color.copy(CAVE_SKY);
      this.hemi.groundColor.copy(CAVE_GND);
      this.hemi.intensity = 0.22 * (1 - this.darkness * 0.9);
      this.fog.color.copy(BLACK);
      this.exposure = 1.1;
      this.night = 1;
      this.glow = 0.6;
    }
    // Weather outdoors: rain greys the sky and dims the sun; a sandstorm turns the air the colour of sand.
    if (this.environment === 'outdoor') {
      const g = this.gloom, hz = this.haze;
      if (g > 0) {
        this.sun.intensity *= 1 - 0.55 * g;
        this.hemi.intensity *= 1 - 0.2 * g;
        this.fog.color.lerp(RAIN_FOG.clone().multiplyScalar(1 - 0.85 * night), 0.45 * g);
        this.exposure *= 1 - 0.08 * g;
      }
      if (this.mist > 0) {
        const m = this.mist;
        this.sun.intensity *= 1 - 0.35 * m;
        this.fog.color.lerp(MIST_FOG.clone().multiplyScalar(1 - 0.85 * night), 0.55 * m);
      }
      if (hz > 0) {
        this.sun.intensity *= 1 - 0.4 * hz;
        this.sun.color.lerp(SAND_FOG, 0.3 * hz);
        this.fog.color.lerp(SAND_FOG.clone().multiplyScalar(1 - 0.85 * night), 0.65 * hz);
      }
    }
  }
}
