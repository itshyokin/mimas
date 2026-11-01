/**
 * Database → Map themes: the defaults a kind of map has (a forest, a desert, a snowfield, a cave…). A map picks its
 * theme in Map Properties → General; whatever it leaves on “Theme default” comes from here, so changing a theme
 * changes every map of that theme.
 */
import { field, h, numberInput, select, textInput } from './dom';
import { BORDER_KINDS } from '../world/border';
import { DEFAULT_THEMES, type MapTheme } from '../world/mapThemes';
import { WEATHER_KINDS, type BorderKind, type MapEnvironment, type WeatherKind } from '../world/types';
import type { Season } from '../world/seasons';
import { loopChoices } from '../audio/sfx';

const WEATHER_LABEL: Record<WeatherKind, string> = { none: 'Clear', rain: 'Rain', storm: 'Thunderstorm', snow: 'Snow', blizzard: 'Blizzard', haze: 'Haze', sandstorm: 'Sandstorm', pollen: 'Pollen', dust: 'Dust', leaves: 'Falling leaves' };
const LEVELS: [string, string][] = [['', '(not set)'], ['0', 'None'], ['0.3', 'Light'], ['0.6', 'Medium'], ['1', 'Thick']];

export function mapThemesTab(list: MapTheme[], state: { sel: number }, rerender: () => void, audioFiles: string[], cliffs: [string, string][]): HTMLElement[] {
  state.sel = Math.max(0, Math.min(state.sel, list.length - 1));
  const add = () => {
    let id = 'theme', k = 2;
    while (list.some((x) => x.id === id)) id = `theme_${k++}`;
    list.push({ id, name: 'New theme' });
    state.sel = list.length - 1;
    rerender();
  };
  const side = h('div', { class: 'item-list', role: 'listbox', 'aria-label': 'Map themes' },
    ...list.map((x, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } },
      h('span', {}, x.name, h('small', { class: 'item-sub' }, x.border ? BORDER_KINDS.find(([k]) => k === x.border)?.[1] ?? x.id : x.id)))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, '+ New theme'));
  const t = list[state.sel];
  const form = h('div', { class: 'item-form' });
  if (t) {
    // A select whose first choice ("not set") leaves the setting to the map.
    const opt = <K extends keyof MapTheme>(label: string, key: K, opts: [string, string][], hint?: string, parse: (v: string) => MapTheme[K] = (v) => v as MapTheme[K]) =>
      field(label, select([['@', '(not set: the map’s own)'], ...opts], t[key] === undefined ? '@' : String(t[key]), (v) => { if (v === '@') delete t[key]; else t[key] = parse(v); }), hint);
    const sound = (label: string, key: 'music' | 'battleMusic' | 'ambience' | 'ambienceNight' | 'ambienceCold', kind: 'music' | 'ambience') => {
      const opts = loopChoices(kind, audioFiles);
      if (key === 'battleMusic') opts[0] = ['', 'The game’s battle music'];
      return opt(label, key, opts);
    };
    const air = (label: string, key: 'haze' | 'mist' | 'rays' | 'clouds') => field(label, select(LEVELS, t.atmosphere?.[key] === undefined ? '' : String(t.atmosphere[key]), (v) => {
      const a = { ...t.atmosphere };
      if (v === '') delete a[key]; else a[key] = Number(v);
      if (Object.keys(a).length) t.atmosphere = a; else delete t.atmosphere;
    }));
    form.append(
      h('div', { class: 'field-row' },
        field('Name', textInput(t.name, (v) => { t.name = v.trim() || t.name; rerender(); })),
        field('Id', textInput(t.id, (v) => { const id = v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_'); if (id && !list.some((o) => o !== t && o.id === id)) t.id = id; rerender(); }, { title: 'Maps refer to the theme by this id' }))),
      h('p', { class: 'note' }, 'A map picks its theme in Map Properties → General → Theme. Everything set here is the default for those maps; a map can still change any of it for itself. Settings left “not set” are the map’s own as usual.'),
      h('section', { class: 'db-section' }, h('h3', {}, 'Look'),
        h('div', { class: 'field-row' },
          opt('Beyond the edges', 'border', BORDER_KINDS.filter(([k]) => k !== 'seamless'), 'Every side of the map.', (v) => v as BorderKind),
          opt('Cliff walls', 'cliffTile', cliffs)),
        h('div', { class: 'field-row' },
          opt('Lighting', 'environment', [['outdoor', 'Outdoor'], ['indoor', 'Indoor'], ['dark', 'Dark (cave, dungeon)']], undefined, (v) => v as MapEnvironment),
          opt('Season', 'season', [['spring', 'Always spring'], ['summer', 'Always summer'], ['autumn', 'Always autumn'], ['winter', 'Always winter']], undefined, (v) => v as Season))),
      h('section', { class: 'db-section' }, h('h3', {}, 'Sound'),
        sound('Music', 'music', 'music'),
        sound('Battle music', 'battleMusic', 'music'),
        h('div', { class: 'field-row' }, sound('Background sound', 'ambience', 'ambience'), sound('At night', 'ambienceNight', 'ambience')),
        sound('In autumn & winter', 'ambienceCold', 'ambience')),
      h('section', { class: 'db-section' }, h('h3', {}, 'Wind, weather & air'),
        h('div', { class: 'field-row' },
          opt('Wind', 'wind', [['0', 'Calm'], ['0.15', 'Light air'], ['0.3', 'Breeze'], ['0.6', 'Windy'], ['1', 'Gale']], undefined, Number),
          field('Climate (°F warmer or colder)', numberInput(t.tempOffset ?? 0, (v) => { const r = Math.round(v); if (r) t.tempOffset = r; else delete t.tempOffset; }, { step: 1 }), 'A desert +20, a snowfield −25.')),
        h('div', { class: 'field-row' },
          field('Weather', select([['@', 'The shared outdoor weather'], ...WEATHER_KINDS.map((k) => [k, `Its own: ${WEATHER_LABEL[k]}`] as [string, string])], t.weather?.kind ?? '@', (v) => {
            if (v === '@') delete t.weather; else t.weather = { ...t.weather, kind: v as WeatherKind };
            rerender();
          }), 'Its own: the theme’s maps share their weather with each other (a desert’s sandstorm blows on all of them), apart from the outdoor weather elsewhere.'),
          t.weather ? field('How heavy', numberInput(t.weather.amount ?? 1, (v) => { const a = Math.max(0.1, Math.min(2, Math.round(v * 10) / 10)); if (a === 1) delete t.weather!.amount; else t.weather!.amount = a; }, { min: 0.1, max: 2, step: 0.1 })) : h('span')),
        h('div', { class: 'field-row' }, air('Distance haze', 'haze'), air('Ground mist', 'mist')),
        h('div', { class: 'field-row' }, air('Sun rays', 'rays'), air('Cloud shadows', 'clouds'))),
      h('div', { class: 'item-foot' }, h('button', { type: 'button', class: 'btn danger', onclick: () => { list.splice(state.sel, 1); state.sel = Math.max(0, state.sel - 1); rerender(); } }, 'Delete theme')),
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { list.splice(0, list.length, ...structuredClone(DEFAULT_THEMES)); state.sel = 0; rerender(); } }, 'Back to the starter themes'));
  }
  return [h('div', { class: 'items-layout' }, side, form)];
}
