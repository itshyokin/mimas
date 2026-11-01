/**
 * Database → Weather: dynamic weather and temperature. Whether the shared outdoor weather changes by itself, how long
 * each spell lasts, and per season the morning lows and afternoon highs (°F) and how likely each weather is.
 */
import { checkbox, h, numberInput } from './dom';
import { DEFAULT_CLIMATE, climateConfig, type ClimateConfig } from '../world/climate';
import { type BodyConfig, WEATHER_KINDS, type WeatherKind } from '../world/types';
import { type BodySettings, DEFAULT_BODY } from '../game/body';
import { WEATHER_NAMES } from './CommandEditor';
import type { Season } from '../world/seasons';

const SEASONS: [Season, string][] = [['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['winter', 'Winter']];

export function climateTab(c: ClimateConfig, rerender: () => void): HTMLElement[] {
  const num = (v: number, set: (x: number) => void, step = 1, label = '') => numberInput(v, (x) => { set(x); }, { step: String(step), class: 'db-num', 'aria-label': label });
  const seasons = SEASONS.map(([k, name]) => {
    const s = c.seasons[k];
    const total = Object.values(s.weather).reduce((a, b) => a + (b ?? 0), 0) || 1;
    return h('section', { class: 'db-section climate-season' }, h('h3', {}, name),
      h('div', { class: 'db-table climate-temps' },
        h('span', { class: 'db-name' }, 'Morning low'), num(s.low[0], (v) => (s.low = [Math.round(v), Math.max(Math.round(v), s.low[1])]), 1, `${name} low from`), h('span', { class: 'db-unit' }, 'to'),
        num(s.low[1], (v) => (s.low = [Math.min(s.low[0], Math.round(v)), Math.round(v)]), 1, `${name} low to`), h('span', { class: 'db-unit' }, '°F'),
        h('span', { class: 'db-name' }, 'Afternoon high'), num(s.high[0], (v) => (s.high = [Math.round(v), Math.max(Math.round(v), s.high[1])]), 1, `${name} high from`), h('span', { class: 'db-unit' }, 'to'),
        num(s.high[1], (v) => (s.high = [Math.min(s.high[0], Math.round(v)), Math.round(v)]), 1, `${name} high to`), h('span', { class: 'db-unit' }, '°F')),
      h('div', { class: 'climate-chances' }, ...WEATHER_KINDS.map((w: WeatherKind) => {
        const v = s.weather[w] ?? 0;
        return h('label', { class: 'climate-chance' }, h('span', {}, WEATHER_NAMES[w]),
          num(v, (x) => { const n = Math.max(0, Math.round(x)); if (n) s.weather[w] = n; else delete s.weather[w]; rerender(); }, 1, `${name} ${WEATHER_NAMES[w]} chance`),
          h('small', {}, `${Math.round((v / total) * 100)}%`));
      })),
      h('button', { type: 'button', class: 'btn ghost small', onclick: () => { c.seasons[k] = structuredClone(DEFAULT_CLIMATE.seasons[k]); rerender(); } }, `Back to the default ${name.toLowerCase()}`));
  });
  return [
    h('section', { class: 'db-section' }, h('h3', {}, 'Dynamic weather'),
      checkbox('The outdoor weather changes by itself', c.dynamic, (v) => { c.dynamic = v; rerender(); }),
      h('div', { class: 'db-table climate-temps' },
        h('span', { class: 'db-name' }, 'Each spell lasts'), num(c.spell[0], (v) => (c.spell = [Math.max(0.5, v), Math.max(Math.max(0.5, v), c.spell[1])]), 0.5, 'Shortest spell'), h('span', { class: 'db-unit' }, 'to'),
        num(c.spell[1], (v) => (c.spell = [Math.min(c.spell[0], Math.max(0.5, v)), Math.max(0.5, v)]), 0.5, 'Longest spell'), h('span', { class: 'db-unit' }, 'game hours'),
        h('span', { class: 'db-name' }, 'Heat and cold in battle'), num(c.battle, (v) => (c.battle = Math.max(0, Math.min(100, Math.round(v)))), 5, 'Battle effect'), h('span', { class: 'db-unit' }, '%'), h('span'), h('span')),
      h('p', { class: 'note' }, 'Outdoor maps share the weather (except maps with Unique weather in Map Properties → Weather). Every few game hours it changes, picked from the season’s chances below; rain falls as snow below freezing and snow as rain above it. A Change weather command (or a spell) changes it until the next change. Temperatures: each day rolls its own low (around dawn) and high (mid-afternoon) inside the ranges; rain and storms cool it, haze warms it, and each map can be warmer or colder (Map Properties → Weather → Climate). Below freezing, grass and leaves frost over; in a heat wave grass turns straw-coloured; rain leaves the ground damp for a while. In turn-based battles heat makes fire stronger and water-type foes weaker; cold the reverse (water is the cold element).')),
    ...seasons,
  ];
}

/** Only what differs from the defaults (or undefined). */
export function cleanClimate(c: ClimateConfig): ReturnType<typeof climateConfig> extends infer T ? Partial<T> | undefined : never {
  const d = DEFAULT_CLIMATE, out: Record<string, unknown> = {};
  if (c.dynamic !== d.dynamic) out.dynamic = c.dynamic;
  if (c.spell[0] !== d.spell[0] || c.spell[1] !== d.spell[1]) out.spell = c.spell;
  if (c.battle !== d.battle) out.battle = c.battle;
  const seasons: Record<string, unknown> = {};
  for (const [k] of SEASONS) if (JSON.stringify(c.seasons[k]) !== JSON.stringify(d.seasons[k])) seasons[k] = c.seasons[k];
  if (Object.keys(seasons).length) out.seasons = seasons;
  return (Object.keys(out).length ? out : undefined) as never;
}

/** Database → Weather & temperature → On the body: cold, heat and wet out of battle (game/body.ts). */
export function bodySection(b: BodySettings, rerender: () => void): HTMLElement {
  const num = (v: number, set: (x: number) => void, label: string, step = 1, min = 0, max = 999) =>
    numberInput(v, (x) => { set(Math.max(min, Math.min(max, x))); }, { step: String(step), class: 'db-num', 'aria-label': label });
  const row = (name: string, input: HTMLElement, unit: string) => [h('span', { class: 'db-name' }, name), input, h('span', { class: 'db-unit' }, unit)];
  return h('section', { class: 'db-section db-wide' }, h('h3', {}, 'On the body (out of battle)'),
    checkbox('Heroes feel the elements: cold, heat and wet', !b.off, (v) => { b.off = !v; rerender(); }),
    ...(b.off ? [] : [
      h('div', { class: 'db-table body-table' },
        ...row('Cold below', num(b.coldAt, (v) => (b.coldAt = Math.round(v)), 'Cold below', 1, -60, 140), '°F felt'),
        ...row('Freezing at or below', num(b.freezingAt, (v) => (b.freezingAt = Math.round(v)), 'Freezing at', 1, -60, 140), '°F felt'),
        ...row('Hot above', num(b.hotAt, (v) => (b.hotAt = Math.round(v)), 'Hot above', 1, -60, 160), '°F felt'),
        ...row('Overheating at or above', num(b.overheatAt, (v) => (b.overheatAt = Math.round(v)), 'Overheating at', 1, -60, 160), '°F felt'),
        ...row('Getting cold or hot takes', num(b.fill, (v) => (b.fill = Math.round(v)), 'Seconds to fill', 5, 5, 1200), 'seconds (wet in the cold: half)'),
        ...row('Recovering takes', num(b.recover, (v) => (b.recover = Math.round(v)), 'Seconds to recover', 5, 5, 1200), 'seconds (by a fire: a third)'),
        ...row('Drying off takes', num(b.dry, (v) => (b.dry = Math.round(v)), 'Seconds to dry', 5, 5, 1200), 'seconds (by a fire or in the sun: sooner)'),
        ...row('Freezing / Overheating: lose', num(b.chipPct, (v) => (b.chipPct = Math.round(v * 10) / 10), 'Health lost', 0.5, 0, 50), '% of max health'),
        ...row('every', num(b.chipSteps, (v) => (b.chipSteps = Math.round(v)), 'Steps between', 1, 1, 200), 'steps (never below 1 health)'),
        ...row('Their panel rumbles for', num(b.rumble, (v) => (b.rumble = Math.round(v * 10) / 10), 'Rumble seconds', 0.5, 0, 10), 'seconds'),
        ...row('Wet: slower by', num(b.slow.wet, (v) => (b.slow.wet = Math.round(v)), 'Wet slower', 1, 0, 90), '%'),
        ...row('Cold / Hot: slower by', num(b.slow.mild, (v) => (b.slow.mild = Math.round(v)), 'Cold slower', 1, 0, 90), '%'),
        ...row('Freezing / Overheating: slower by', num(b.slow.severe, (v) => (b.slow.severe = Math.round(v)), 'Freezing slower', 1, 0, 90), '%')),
      checkbox('Tint a hero’s health bar the colour of their ailment (Poison purple, Burn orange…)', b.hpTint, (v) => { b.hpTint = v; }),
      checkbox('Always show Comfortable when nothing else shows (off: only while a fire, shelter or warm gear is keeping the weather off)', b.comfortAlways, (v) => { b.comfortAlways = v; }),
      h('p', { class: 'note' }, 'Each hero has a cold / heat meter that follows what they feel: the temperature where they stand (this map’s, Map Properties → Weather), warmed by their gear’s Warmth (0–10, Database → Gear: 10 keeps the cold off, 0 keeps them coolest in the heat), colder when wet. It fills over time: Cold / Hot past half way, Freezing / Overheating at the end, then slowly back when it’s mild. Rain and swimming soak them; fires (campfires, torches, braziers), shelter and the sun dry them. Freezing and Overheating cost health as they walk (never below 1). Battles never change any of this, and it lasts through them. On a griffin the rider is safe; horses are never slowed. Hot drinks warm and cold ones cool (an item’s Warms / cools). The console’s body command shows each hero’s meter.'),
    ]),
    h('div', { class: 'db-table body-table' },
      ...row('Poisoned / Burned: lose', num(b.ailmentPct, (v) => (b.ailmentPct = Math.round(v * 10) / 10), 'Ailment health lost', 0.5, 0, 50), '% of max health'),
      ...row('every', num(b.ailmentSteps, (v) => (b.ailmentSteps = Math.round(v)), 'Ailment steps between', 1, 1, 200), 'steps (down to 1, then it wears off)')),
    h('h4', {}, 'Resting and camping'),
    h('div', { class: 'db-table body-table' },
      ...row('Rested lasts', num(b.restedHours, (v) => (b.restedHours = Math.round(v * 4) / 4), 'Rested hours', 0.25, 0.25, 72), 'game hours (+1 to every stat, +10% EXP)'),
      ...row('Well Rested lasts', num(b.wellRestedHours, (v) => (b.wellRestedHours = Math.round(v * 4) / 4), 'Well Rested hours', 0.25, 0.25, 72), 'game hours (+3 to every stat, +25% EXP)')),
    h('p', { class: 'note' }, 'At a rest point (“Create rest point here” on an empty tile) the party rests for the hours the player picks: health and magic come back 20% an hour, 1 hour warms and dries them, 5+ hours is a full restore that cures every ailment. Camping supplies (each item’s Camp value, Database → Items) make them Rested at 25 points, Well Rested at 50. Inns (Sleep with “An inn”) give Well Rested. Event command: Give buff.'),
    h('p', { class: 'note' }, 'Ailments out of battle: one per hero (someone who has one can’t get another, Zombie included). Poison and Burn cost health as they walk, down to 1, then wear off; the rest stay until cured (an item, an event, or 5+ hours of rest). Chill, Frozen and Stagger end with the battle (Database → Combat → Ailments: “lasts after battle”). Falling to 0 health cures it.'));
}

/** The body settings: only what differs from the defaults (or undefined). */
export function cleanBody(b: BodySettings): BodyConfig | undefined {
  const d = DEFAULT_BODY, out: Record<string, unknown> = {};
  for (const k of Object.keys(d) as (keyof BodySettings)[]) {
    if (k === 'slow') continue;
    if (b[k] !== d[k]) out[k] = b[k];
  }
  const slow: Record<string, number> = {};
  for (const k of ['wet', 'mild', 'severe'] as const) if (b.slow[k] !== d.slow[k]) slow[k] = b.slow[k];
  if (Object.keys(slow).length) out.slow = slow;
  return Object.keys(out).length ? out as BodyConfig : undefined;
}
