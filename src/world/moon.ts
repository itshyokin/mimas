/**
 * The moon's phase, from the real calendar: the moon over Titan follows the real one, so a full moon in the game
 * falls on the same night as a real full moon. Worked out from a known new moon and the length of a lunar month
 * (good to within a few hours, plenty for "is it full tonight?").
 */

/** One lunar month (new moon to new moon), in days. */
const SYNODIC = 29.530588853;
/** A known new moon: 6 January 2000, 18:14 UTC. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

export type MoonPhase = 'new' | 'waxingCrescent' | 'firstQuarter' | 'waxingGibbous' | 'full' | 'waningGibbous' | 'lastQuarter' | 'waningCrescent';

export const MOON_PHASES: MoonPhase[] = ['new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous', 'full', 'waningGibbous', 'lastQuarter', 'waningCrescent'];

export const MOON_NAMES: Record<MoonPhase, string> = {
  new: 'New moon', waxingCrescent: 'Waxing crescent', firstQuarter: 'First quarter', waxingGibbous: 'Waxing gibbous',
  full: 'Full moon', waningGibbous: 'Waning gibbous', lastQuarter: 'Last quarter', waningCrescent: 'Waning crescent',
};

/** How far through its month the moon is: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonAge(date: Date = new Date()): number {
  const days = (date.getTime() - NEW_MOON_MS) / 86400000;
  return ((days / SYNODIC) % 1 + 1) % 1;
}

/** How much of the moon's face is lit (0 … 1). */
export const moonLit = (age: number): number => (1 - Math.cos(age * Math.PI * 2)) / 2;

/**
 * The phase by name. New, quarters and full each cover about a day either side (as calendars mark them), the
 * crescents and gibbous moons the days between.
 */
export function moonPhase(date: Date = new Date()): MoonPhase {
  const a = moonAge(date), w = 1.1 / SYNODIC;
  if (a < w || a > 1 - w) return 'new';
  if (Math.abs(a - 0.25) < w) return 'firstQuarter';
  if (Math.abs(a - 0.5) < w) return 'full';
  if (Math.abs(a - 0.75) < w) return 'lastQuarter';
  return a < 0.25 ? 'waxingCrescent' : a < 0.5 ? 'waxingGibbous' : a < 0.75 ? 'waningGibbous' : 'waningCrescent';
}

/** A small picture of the moon in this phase (for the HUD), as SVG. */
export function moonIconSvg(age: number, size = 16): string {
  // The lit part: a half disc plus or minus an ellipse (the terminator), on the right while waxing, left while waning.
  const r = 6.5, c = 8, k = Math.cos(age * Math.PI * 2), waxing = age < 0.5;
  const rx = Math.abs(k) * r;
  const sweepOuter = waxing ? 1 : 0;
  // From the top to the bottom round the lit edge, then back up along the terminator.
  const sweepInner = (k > 0) === waxing ? 0 : 1;
  const lit = `M${c} ${c - r} A${r} ${r} 0 0 ${sweepOuter} ${c} ${c + r} A${rx.toFixed(2)} ${r} 0 0 ${sweepInner} ${c} ${c - r}Z`;
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true"><circle cx="${c}" cy="${c}" r="${r}" fill="#2a3048"/>`
    + `<path d="${lit}" fill="#dfe6f2"/><path d="M5 6h3M8 6v3M10 10h2" stroke="#3fd0c8" stroke-width="0.7" stroke-linecap="round" opacity="0.8"/>`
    + `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#9aa6c4" stroke-width="0.6"/></svg>`;
}
