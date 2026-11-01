/** Form fields for light settings, shared by the light inspector and the prop importer. */
import { switchInput } from './switchPicker';
import type { Flicker, LightSchedule } from '../world/types';
import { checkbox, field, h, numberInput, select } from './dom';

export const SCHEDULES: [LightSchedule, string][] = [
  ['always', 'Always on'],
  ['night', 'Night only (off during the day)'],
  ['nightBoost', 'Brighter at night'],
];
export const FLICKERS: [Flicker, string][] = [
  ['none', 'None (steady)'], ['fire', 'Fire'], ['candle', 'Candle'], ['pulse', 'Slow pulse'], ['faulty', 'Faulty'],
];

/** The settings this form can edit; omit a key to leave its field out. */
export interface LightFields {
  color?: string;
  intensity?: number;
  radius?: number;
  y?: number;
  flicker?: Flicker;
  schedule?: LightSchedule;
  shadows?: boolean;
  switch?: string;
}

export interface LightFormOpts {
  /** Brightness meaning: "light" (0–6) or "tint" (area lights: 1 = unchanged). */
  brightness?: 'light' | 'tint';
  showRadius?: boolean;
  showHeight?: boolean;
  showFlicker?: boolean;
  showShadows?: boolean;
  showSwitch?: boolean;
  shadowHint?: string;
}

/**
 * Builds the fields. `commit` is called with a function that applies one change,
 * so callers can wrap it in an undo step.
 */
export function lightFields<T extends LightFields>(l: T, commit: (apply: (l: T) => void) => void, o: LightFormOpts = {}): HTMLElement[] {
  const color = h('input', { type: 'color', value: l.color ?? '#ffffff', class: 'color-input', onchange: () => commit((x) => (x.color = color.value)) });
  const tint = o.brightness === 'tint';
  const out: HTMLElement[] = [
    h('div', { class: 'field-row' },
      field('Colour', color),
      field(tint ? 'Strength' : 'Brightness', numberInput(l.intensity ?? 1, (v) => commit((x) => (x.intensity = Math.max(0, v))), { step: tint ? 0.05 : 0.1, min: 0, max: tint ? 3 : 10 }))),
  ];
  if (tint) out.push(h('p', { class: 'hint' }, 'Strength 1 leaves colours unchanged. Below 1 shades the area (0.7 is gentle shade), above 1 brightens it.'));
  const row: HTMLElement[] = [];
  if (o.showRadius !== false && l.radius !== undefined) row.push(field('Reach (tiles)', numberInput(l.radius, (v) => commit((x) => (x.radius = Math.max(0.5, v))), { step: 0.5, min: 0.5, max: 40 })));
  if (o.showHeight && l.y !== undefined) row.push(field('Height (tiles)', numberInput(l.y, (v) => commit((x) => (x.y = Math.max(0, v))), { step: 0.1, min: 0, max: 10 })));
  if (row.length) out.push(h('div', { class: 'field-row' }, ...row));
  out.push(field('When', select(SCHEDULES, l.schedule ?? 'always', (v) => commit((x) => (x.schedule = v as LightSchedule)))));
  if (o.showFlicker !== false) out.push(field('Flicker', select(FLICKERS, l.flicker ?? 'none', (v) => commit((x) => (x.flicker = v === 'none' ? undefined : (v as Flicker))))));
  if (o.showShadows) {
    out.push(checkbox('Casts shadows', !!l.shadows, (v) => commit((x) => (x.shadows = v || undefined))));
    if (o.shadowHint) out.push(h('p', { class: 'hint' }, o.shadowHint));
  }
  if (o.showSwitch) {
    out.push(field('Only on while switch is ON', switchInput(l.switch ?? '', (v) => commit((x) => (x.switch = v || undefined)), { placeholder: 'Leave empty: not tied to a switch' })));
  }
  return out;
}
