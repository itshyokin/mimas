/**
 * The elements on the body: each hero's cold / heat meter and how wet they are, out of battle only (battles never
 * change them, and they last through one).
 *
 * What a hero feels is the temperature where they stand, adjusted by the Warmth of their gear (0–10: 10 keeps the
 * cold off best, 0 keeps them coolest in the heat) and by being wet. The meter (−100 freezing … +100 overheating)
 * drifts toward what they feel, faster when wet in the cold, and back toward 0 when it's mild, by a fire or indoors.
 * The state shown: Freezing / Overheating at the ends, Cold / Hot past half, else Wet, else Comfortable (by a fire,
 * indoors, or dressed right for the weather), else nothing. No three.js.
 */
import type { BodyConfig } from '../world/types';

export type WeatherState = 'comfortable' | 'wet' | 'cold' | 'freezing' | 'hot' | 'overheating';

export const WEATHER_STATE_INFO: Record<WeatherState, { name: string; does: string; color: string }> = {
  comfortable: { name: 'Comfortable', does: 'Warm and dry: by a fire, indoors, or dressed right for the weather.', color: '#ffd98a' },
  wet: { name: 'Wet', does: 'Soaked by rain or a swim: a little slower, and the cold bites twice as fast.', color: '#9fd2ff' },
  cold: { name: 'Cold', does: 'Chilled through: slower. Find a fire, shelter or warmer gear.', color: '#cfeaff' },
  freezing: { name: 'Freezing', does: 'Much slower, and losing health as they walk (never below 1).', color: '#e6f6ff' },
  hot: { name: 'Hot', does: 'Too warm: slower. Find shade or wear lighter gear.', color: '#ffb27a' },
  overheating: { name: 'Overheating', does: 'Much slower, and losing health as they walk (never below 1).', color: '#ff6a2a' },
};

export const DEFAULT_BODY: Required<Omit<BodyConfig, 'slow'>> & { slow: Required<NonNullable<BodyConfig['slow']>> } = {
  off: false,
  coldAt: 40, freezingAt: 25, hotAt: 85, overheatAt: 100,
  fill: 90, recover: 30, dry: 90,
  chipSteps: 12, chipPct: 3,
  comfortAlways: false,
  rumble: 2,
  hpTint: false,
  ailmentSteps: 10, ailmentPct: 4,
  restedHours: 2, wellRestedHours: 1.5,
  slow: { wet: 10, mild: 20, severe: 35 },
};
export type BodySettings = typeof DEFAULT_BODY;

/** The Database's settings with the defaults filled in. */
export function bodySettings(c?: BodyConfig): BodySettings {
  return { ...DEFAULT_BODY, ...(c ?? {}), slow: { ...DEFAULT_BODY.slow, ...(c?.slow ?? {}) } };
}

/** One hero's body: the meter (−100 … 100) and how wet they are (0 dry … 1 soaked). */
export interface BodyState { meter: number; wet: number }

/** Where the hero stands, this moment. */
export interface BodyPlace {
  /** The temperature there (°F). */
  temp: number;
  /** Their gear's Warmth (0–10). */
  warmth: number;
  raining: boolean;
  swimming: boolean;
  /** Under a roof or indoors: rain doesn't reach them. */
  sheltered: boolean;
  /** Within the warmth of a lit fire. */
  byFire: boolean;
  /** A damp cave or cellar: it slowly soaks them. */
  damp: boolean;
  /** In the open sun on a warm day: dries them faster. */
  sunny: boolean;
  /** The temperature outdoors (°F): indoors, shelter from harsh weather out there is Comfortable. */
  outside: number;
}

/** What a hero feels (°F): the air, changed by their gear's Warmth (0 coolest, 10 warmest), colder still when wet. */
export function feltTemp(p: BodyPlace, b: BodyState): number {
  // In the cold, Warmth keeps it off (10: about 30°F warmer); in the heat, warm gear makes it worse and light gear
  // (Warmth 0) keeps them cooler.
  let t = p.temp < 65 ? p.temp + p.warmth * 3.5 - 5 : p.temp + (p.warmth - 3) * 2.5;
  if (b.wet > 0.3 && p.temp < 65) t -= 10 * b.wet;
  if (p.byFire) t = Math.max(t, 68);
  return t;
}

/** Advance one hero's body by `dt` real seconds. */
export function stepBody(b: BodyState, p: BodyPlace, dt: number, s: BodySettings): void {
  // Wet: rain where it reaches them, a swim, a damp cave; dried by fires, shelter, the sun and time.
  if (p.swimming) b.wet = 1;
  else if (p.raining && !p.sheltered) b.wet = Math.min(1, b.wet + dt / 10);
  else if (p.damp && !p.byFire) b.wet = Math.min(1, b.wet + dt / 120);
  else b.wet = Math.max(0, b.wet - (dt / Math.max(1, s.dry)) * (p.byFire ? 6 : p.sunny ? 2 : 1));
  const felt = feltTemp(p, b);
  // How far the meter can go here: all the way past the extremes, half way in plain cold or heat, back to 0 when mild.
  const target = felt <= s.freezingAt ? -100 : felt < s.coldAt ? -65 : felt >= s.overheatAt ? 100 : felt > s.hotAt ? 65 : 0;
  const away = Math.abs(target) > Math.abs(b.meter) && Math.sign(target || b.meter) === Math.sign(b.meter || target);
  let rate = away ? 100 / Math.max(1, s.fill) : 100 / Math.max(1, s.recover);
  if (away && target < 0 && b.wet > 0.3) rate *= 2;
  if (!away && p.byFire) rate *= 3;
  const step = rate * dt;
  b.meter = b.meter < target ? Math.min(target, b.meter + step) : Math.max(target, b.meter - step);
}

/** The weather state a hero shows (null: nothing worth showing). Comfortable only while something is keeping the weather off. */
export function weatherState(b: BodyState, p: BodyPlace, s: BodySettings): WeatherState | null {
  if (b.meter <= -95) return 'freezing';
  if (b.meter >= 95) return 'overheating';
  if (b.meter <= -50) return 'cold';
  if (b.meter >= 50) return 'hot';
  if (b.wet >= 0.5) return 'wet';
  const felt = feltTemp(p, b), harsh = (t: number) => t < s.coldAt || t > s.hotAt;
  // Comfortable when it's helping: a fire, shelter from harsh weather, or gear that keeps it off.
  const fine = felt >= s.coldAt && felt <= s.hotAt;
  if (s.comfortAlways || p.byFire || (fine && ((p.sheltered && harsh(p.outside)) || harsh(p.temp)))) return 'comfortable';
  return null;
}

/** How much slower a state walks (a share: 0.1 = 10% slower). The worst one counts. */
export function slowOf(st: WeatherState | null, s: BodySettings): number {
  if (st === 'freezing' || st === 'overheating') return s.slow.severe / 100;
  if (st === 'cold' || st === 'hot') return s.slow.mild / 100;
  if (st === 'wet') return s.slow.wet / 100;
  return 0;
}

/** The style that tints a panel's health bar (its `--g-hp`) to a colour, or ''. */
export const hpTintStyle = (color: string | null | undefined): string => (color ? `--g-hp:linear-gradient(color-mix(in srgb, ${color} 55%, #fff), ${color});` : '');

/** Does this state cost health as they walk? */
export const hurts = (st: WeatherState | null): boolean => st === 'freezing' || st === 'overheating';

/** A consumable's warming (+) or cooling (−): how far it moves the meter toward 0 (a Hot Cocoa from Freezing back to normal). */
export function soothe(b: BodyState, warms: number): void {
  if (warms > 0 && b.meter < 0) b.meter = Math.min(0, b.meter + warms);
  else if (warms < 0 && b.meter > 0) b.meter = Math.max(0, b.meter + warms);
}
