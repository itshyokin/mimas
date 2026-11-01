import { HEIGHT_STYLES, type HeightStyle } from '../world/heights';
import { levelRangeField } from './levelFields';
import { openDatabase } from './DatabaseEditor';
/** Left panel: layer tabs, tools, brush options and the swatch / sprite palette. */
import { cliffChoices, deleteProp, deleteTile, setPaletteGroup, mapCliffName, resetProp, setTileAilment, setTileCliff, setTileRoad, setTileSkin, setTilePrints, setTileSteps } from './assets';
import { AILMENTS, AILMENT_INFO } from '../game/status';
import type { Ailment } from '../world/types';
import { FOOT_MATERIALS, guessFootstep } from '../world/footsteps';
import { isBuiltinProp } from '../world/props';
import { canvasCopy, checkbox, confirmModal, h, numberInput, openModal, select, textInput, toast } from './dom';
import { characterImage, paletteProps, propImage, tileNote, tileThumb } from './editorArt';
import { openTileImporter } from './TileImporter';
import { openMvImporter } from './MvImporter';
import { openBlendSettings } from './BlendSettings';
import type { TileDef } from '../world/types';
import { BUILTIN_TILES } from '../world/tiles';
import { LIGHT_PRESETS } from './lightPresets';
import { openPropBatchEdit } from './PropBatchEdit';
import { openPropImporter } from './PropImporter';
import { duplicateProp } from './assets';
import { openLpcLibrary } from './LpcLibrary';
import type { BuildingTool, EditorStore, HeightTool, LightType, Mode, ObjectTool, TerrainTool } from './store';
import type { WaterKind } from '../world/heights';
import type { FishZone, WaterStyle } from '../world/types';
import { SAFE_MARKS } from '../world/safeZones';
import { WATER_PRESETS, WATER_SYMBOLS, isToonWater, waterStyles } from '../world/waterStyles';
import { defaultZone } from '../world/fishing';
import { PASSAGE_FLAGS, type PassageFlag } from '../world/passage';
import { passageThumb } from './passageIcons';
import { MARKER_COLORS, WEEKDAY_SHORT, ZONE_LETTERS, zoneColor } from '../world/zones';
import { ABILITIES } from '../world/types';
import { ABILITY_NAMES } from './CommandEditor';
import { MAX_HEIGHT, MIN_HEIGHT } from '../world/heights';
import { BUILDING_PRESETS, drawBuildingTop } from './buildingPresets';
import { TS } from './editorArt';

/**
 * Palette groups (Update 150): each group a section that opens and closes (remembered on this device), its items
 * drawn by `draw`. Items not in a group are left for the usual sections.
 */
function groupSections<T>(kind: 'tile' | 'prop', items: [string, T][], groups: Record<string, string> | undefined, draw: (list: T[]) => HTMLElement): HTMLElement[] {
  if (!groups) return [];
  const by = new Map<string, T[]>();
  for (const [id, t] of items) { const g = groups[id]; if (g) by.set(g, [...(by.get(g) ?? []), t]); }
  return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([name, list]) => {
    const key = `hd2d.palGroup.${kind}.${name}`;
    let open = true;
    try { open = localStorage.getItem(key) !== '0'; } catch { /* storage off */ }
    const d = h('details', { class: 'pal-group', ...(open ? { open: true } : {}) },
      h('summary', { class: 'section-label' }, `${name} (${list.length})`), draw(list));
    d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch { /* storage off */ } });
    return d;
  });
}

/** Put ticked tiles or props into a group (a new name or an existing one), or out of their group. */
function groupModal(store: EditorStore, kind: 'tile' | 'prop', ids: string[], done: () => void): void {
  const groups = kind === 'tile' ? store.assets.tileGroups : store.assets.propGroups;
  const names = [...new Set(Object.values(groups ?? {}))].sort();
  let name = (ids.length === 1 && groups?.[ids[0]]) || '';
  const list = h('datalist', { id: 'pal-group-names' }, ...names.map((n) => h('option', { value: n })));
  const input = textInput(name, (v) => (name = v.trim()), { placeholder: 'e.g. Desert, Forest, Testing', list: 'pal-group-names', oninput: (e: Event) => (name = (e.target as HTMLInputElement).value.trim()) });
  openModal(`Group ${ids.length} ${kind}${ids.length === 1 ? '' : 's'}`, h('div', { class: 'stack' },
    h('label', { class: 'field' }, h('span', {}, 'Group name'), input), list,
    names.length ? h('div', { class: 'toolrow small' }, ...names.map((n) => h('button', { type: 'button', class: 'chip', onclick: () => { name = n; input.value = n; } }, n))) : null,
    h('p', { class: 'note' }, 'Groups show as their own sections in the palette; click a group’s name to show or hide it.')), [
    { label: 'Take out of groups', onClick: () => { void setPaletteGroup(store, kind, ids, undefined).then(done); } },
    { label: 'Cancel' },
    { label: 'Group', primary: true, onClick: () => { if (!name) { toast('Type a group name.', 'error'); return false; } void setPaletteGroup(store, kind, ids, name).then(done); return true; } },
  ]);
}

const MODES: [Mode, string, string][] = [
  ['terrain', 'Terrain', '1'], ['height', 'Height', '2'], ['passage', 'Passage', '3'], ['props', 'Props', '4'], ['lights', 'Lights', '5'], ['events', 'Events', '6'], ['buildings', 'Buildings', '7'], ['water', 'Water', '8'], ['zones', 'Spawns', '9'],
];
/** Layer icons (24 × 24 line drawings): the tabs show these, the name in a tooltip and beside them. */
const MODE_ICONS: Record<string, string> = {
  terrain: '<path d="M3 17l5-6 4 4 3-3 6 5"/><path d="M3 20h18"/>',
  height: '<path d="M4 20h4v-5h4v-5h4V5h4"/>',
  passage: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/><path d="M7 7l3 3M14 14l3 3"/>',
  props: '<path d="M12 3l5 8h-3l4 6H6l4-6H7z"/><path d="M12 17v4"/>',
  lights: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  events: '<path d="M4 5h16v11H10l-4 4v-4H4z"/><path d="M12 8v3M12 13.5v.5"/>',
  buildings: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
  water: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  zones: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
};
const iconSvg = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

/** Opens the map's settings window (set by the editor once the Inspector exists). */
let openMapProperties: () => void = () => {};
export function setMapPropertiesOpener(fn: () => void): void { openMapProperties = fn; }

const TERRAIN_TOOLS: [TerrainTool, string, string][] = [['pencil', 'Pencil', 'B'], ['rect', 'Rectangle', 'R'], ['fill', 'Fill', 'G']];
const PROP_TOOLS: [ObjectTool, string, string][] = [['place', 'Place', 'P'], ['scatter', 'Scatter', 'S'], ['select', 'Select', 'V'], ['erase', 'Erase', 'E']];
const HEIGHT_TOOLS: [HeightTool, string, string][] = [['raise', 'Raise', 'R'], ['lower', 'Lower', 'L'], ['set', 'Set', 'S'], ['fill', 'Fill', 'G'], ['ramp', 'Ramp', 'A'], ['style', 'Style', 'Y']];
const BUILDING_TOOLS: [BuildingTool, string, string][] = [['draw', 'Draw', 'D'], ['select', 'Select', 'V']];
const LIGHT_TOOLS: [ObjectTool, string, string][] = [['place', 'Place', 'P'], ['select', 'Select', 'V'], ['erase', 'Erase', 'E']];

export const MODE_HINTS: Record<string, string> = {
  'terrain:pencil': 'Click and drag to paint. Brush size changes the footprint.',
  'terrain:rect': 'Drag to fill a rectangle.',
  'terrain:fill': 'Click to fill a connected area of the same terrain.',
  'height:style': 'Paint how raised and lowered ground is shaped: blocky, soft blocky, smooth hills or cliffs.',
  'height:raise': 'Click or drag to raise the ground one step (half a tile). Each cell rises once per stroke.',
  'height:lower': 'Click or drag to lower the ground one step. Go below 0 for pits and riverbeds.',
  'height:set': 'Click or drag to set the ground to the chosen height.',
  'water:fill': 'Paint bucket: click inside a hollow (or on water) to fill the connected area that matches it, in the chosen style.',
  'water:paint': 'Click or drag to paint water at this level and style. Cells whose ground is at or above the level stay dry.',
  'water:remove': 'Drag over water to remove it.',
  'water:style': 'Click a pool (or river): all of its connected water takes the chosen style.',
  'water:fish': 'Paint fishing spots over water (Erase removes them). Each spot has its own list of catches.',
  'height:ramp': 'Click a cell for a ramp or stairs. It rises toward the neighbour one step higher. Click an existing one to select it. E erases.',
  'passage:paint': 'Click or drag to paint the chosen flag; Erase clears it. Red crosses show what already blocks (tiles, props, deep water).',
  'zones:paint': 'Click or drag to paint the chosen encounter zone; Erase clears it. Each zone has its own troops (below the letters).',
  'zones:markers': 'Battle map: click a tile to place a party (P) or enemy (E) marker; Remove takes one away.',
  'props:place': 'Click or drag to place, one prop per tile (placing on a taken tile replaces its prop). Turn off “Snap to tiles” for free placement.',
  'props:scatter': 'Drag to scatter props naturally, with varied sizes.',
  'props:select': 'Click a prop to select it, drag to move. Delete removes it.',
  'props:erase': 'Click or drag over props to remove them (tick “Only erase …” to remove just the kind picked in the list).',
  'lights:place': 'Click a tile to place a light, one per tile. For area lights, drag to draw the area (areas may overlap).',
  'lights:select': 'Click a light to select it, drag to move. Drag an area’s corner handle to resize it.',
  'lights:erase': 'Click a light to remove it.',
  'buildings:draw': 'Drag out a footprint to build (a click places the preset at its own size). Click a building to select and move it.',
  'buildings:select': 'Click a building to select it, drag to move. Drag the corner handle to resize. Delete removes it.',
  'events:select': 'Click a tile or event to select it; drag events to move them. Drag across empty tiles to select an area for one big event. Ctrl+C / Ctrl+V copy and paste events.',
};

export class Palette {
  readonly el: HTMLElement;

  constructor(private readonly store: EditorStore, private readonly onFocusEvent: (id: number) => void) {
    this.el = h('aside', { class: 'side left', 'aria-label': 'Tools and palette' });
    store.on('ui', () => this.render());
    store.on('structure', () => this.render());
    store.on('selection', () => { if (store.mode === 'events' || store.mode === 'buildings') this.render(); });
    this.render();
  }

  render(): void {
    const s = this.store;
    if (!s.map) return;
    const tabs = h('div', { class: 'tabs icon-tabs', role: 'tablist' }, ...MODES.map(([m, label, key]) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-label': label, 'aria-selected': String(s.mode === m), title: `${label} (${key})`, onclick: () => { s.mode = m; s.select(null); s.emit('ui'); } });
      b.innerHTML = iconSvg(MODE_ICONS[m] ?? '');
      return b;
    }));
    const current = MODES.find(([m]) => m === s.mode);
    const head = h('div', { class: 'palette-head' },
      h('button', { type: 'button', class: 'btn map-props-btn', title: 'Name, size, look, weather, sound, battles and encounters', onclick: () => openMapProperties() }, '⚙ Map Properties'),
      tabs,
      h('div', { class: 'layer-name' }, current ? `${current[1]} · key ${current[2]}` : ''));

    const body: Node[] = [];
    if (s.mode === 'terrain') {
      const blendSummary = (key: string) => { const b = s.tiles.blendFor(key); return b.blend ? `priority ${Math.round(b.priority)}` : 'off'; };
      body.push(this.tools(TERRAIN_TOOLS, s.terrainTool, (t) => (s.terrainTool = t)));
      // Update 147: the lower (ground) or upper layer, like RPG Maker's.
      const upper = s.terrainLayer === 'upper';
      body.push(h('div', { class: 'toolrow small' }, ...([['lower', 'Lower (ground)'], ['upper', 'Upper (over it)']] as const).map(([k, label]) =>
        h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.terrainLayer === k), onclick: () => { s.terrainLayer = k; s.emit('ui'); } }, label))));
      if (upper) body.push(h('p', { class: 'note' }, 'Painted over the ground: flowers, path edges, tree tops. See-through where the picture is. Tiles set to ☆ draw over the characters.'));
      if (s.terrainTool === 'pencil') body.push(this.brush());
      const tiles = s.tiles.all();
      const editTile = (key: string) => { const d = s.tiles.get(key); if (d) void openTileImporter(s, d); };
      const cliffField = (key: string) => {
        const choice = s.tiles.cliffChoice(key) ?? '';
        const sel = select([['', `Map default (${mapCliffName(s)})`], ...cliffChoices(s)], choice, (v) => void setTileCliff(s, key, v || undefined),
          { 'aria-label': 'Cliff walls under this tile' });
        return h('div', { class: 'cliff-field' }, h('span', { class: 'swatch-note' }, 'Cliff walls under it'), sel);
      };
      const stepsField = (key: string) => {
        const guess = FOOT_MATERIALS.find(([m]) => m === guessFootstep(s.tiles.get(key)))?.[1] ?? '';
        const sel = select([['', `Automatic (${guess.split(',')[0].toLowerCase()})`], ...FOOT_MATERIALS], s.tiles.footstepChoice(key) ?? '', (v) => void setTileSteps(s, key, v || undefined),
          { 'aria-label': 'Footsteps on this tile' });
        return h('div', { class: 'cliff-field' }, h('span', { class: 'swatch-note' }, 'Footsteps'), sel);
      };
      // Update 123: footprints on it (default on for snow and sand).
      const printsField = (key: string) => {
        const c = checkbox('Leaves footprints', s.tiles.prints(key), (v) => void setTilePrints(s, key, v === s.tiles.printsDefault(key) ? undefined : v));
        c.title = 'Prints fade over half a minute (sooner while snow falls). On by default for snow and sand; in winter, grass under snow keeps them too.';
        return c;
      };
      const ailmentField = (key: string) => {
        const cur = s.tiles.ailment(key);
        const chance = numberInput(cur?.chance ?? 100, (v) => { const c = s.tiles.ailment(key); if (c) void setTileAilment(s, key, { ...c, chance: Math.max(1, Math.min(100, Math.round(v))) }); },
          { step: 5, min: 1, max: 100, 'aria-label': 'Chance each half second', class: 'tile-ail-chance' });
        chance.hidden = !cur;
        const sel = select([['', 'Nothing'], ...AILMENTS.map((a) => [a, AILMENT_INFO[a].name] as [string, string])], cur?.ailment ?? '',
          (v) => { void setTileAilment(s, key, v ? { ailment: v as Ailment, chance: s.tiles.ailment(key)?.chance ?? 100 } : undefined); chance.hidden = !v; },
          { 'aria-label': 'Ailment while standing on this tile' });
        const f = h('div', { class: 'cliff-field' }, h('span', { class: 'swatch-note' }, 'Standing on it gives'), h('div', { class: 'el-pick' }, sel, chance));
        f.title = 'Lava that burns, a swamp that poisons, cursed ground… The chance (%) is rolled every half second while the hero stands on it.';
        return f;
      };
      const roadField = (key: string) => {
        const c = checkbox('Is road (continues past the map edge)', s.tiles.isRoad(key), (v) => void setTileRoad(s, key, v));
        c.title = 'Where this tile touches the map edge, it carries on straight out: through the scenery, a gap in cliffs, or a causeway over water.';
        return c;
      };
      // A built-in tile's picture: the built-in art, or one of your own (the tile keeps everything else).
      const pictureField = (t: TileDef) => {
        const own = s.assets.tiles.find((x) => x.key === t.key && x.image);
        const edit = () => void openTileImporter(s, own, BUILTIN_TILES.find((b) => b.key === t.key) ?? t);
        const sel = select([['builtin', 'Built-in'], ['custom', 'Custom picture']], t.skin ? 'custom' : 'builtin', (v) => {
          if (v === 'builtin') void setTileSkin(s, t.key, false);
          else if (own) void setTileSkin(s, t.key, true);
          else { edit(); s.emit('ui'); }
        }, { 'aria-label': `${t.name} picture` });
        const f = h('div', { class: 'cliff-field' }, h('span', { class: 'swatch-note' }, 'Picture'), h('div', { class: 'el-pick' }, sel,
          own ? h('button', { type: 'button', class: 'btn small', onclick: edit }, 'Change…') : null));
        f.title = 'Swap this built-in tile’s look for a picture of your own, on every map, without repainting. Everything else about the tile stays.';
        return f;
      };
      // Update 150: a tile's settings open from its ✎ (built-in and imported alike), not a panel above the list.
      const tileSettings = (t: TileDef) => {
        const body = h('div', { class: 'tile-settings' },
          h('div', { class: 'prop-current' },
            h('span', { class: 'prop-current-thumb' }, tileThumb(t.key, 48)),
            h('div', { class: 'prop-current-info' }, h('div', { class: 'prop-current-name' }, t.name),
              h('div', { class: 'swatch-note' }, `${t.builtin ? (t.skin ? 'Built-in, your picture' : 'Built-in') : 'Imported'} · ${tileNote(t)}`))),
          t.builtin ? pictureField(t) : h('button', { type: 'button', class: 'btn small', onclick: () => { close(); editTile(t.key); } }, 'Picture, kind and passage…'),
          cliffField(t.key), stepsField(t.key), printsField(t.key), ailmentField(t.key), roadField(t.key),
          h('button', { type: 'button', class: 'btn small', onclick: () => openBlendSettings(s, t.key) }, `Edge blending… (${blendSummary(t.key)})`),
          t.builtin ? null : h('button', { type: 'button', class: 'btn small danger', onclick: () => confirmModal('Delete tile?',
            `“${t.name}” will be removed from the tile list. On this map its cells turn back into grass (you can undo that). Its image files stay in your project.`,
            'Delete', () => { close(); void deleteTile(s, t.key); }, true) }, 'Delete tile'));
        const close = openModal(`Tile: ${t.name}`, body, [{ label: 'Done', primary: true }]);
      };
      // Ticked tiles (Update 150): delete or group them together.
      const tpicks = this.tilePicks;
      for (const k of [...tpicks]) if (!s.tiles.get(k)) tpicks.delete(k);
      if (tpicks.size) {
        const own = [...tpicks].filter((k) => !s.tiles.get(k)?.builtin);
        body.push(h('div', { class: 'prop-picks' },
          h('span', { class: 'prop-picks-n' }, `${tpicks.size} ticked`),
          h('button', { type: 'button', class: 'btn small', onclick: () => groupModal(s, 'tile', [...tpicks], () => { tpicks.clear(); this.render(); }) }, 'Group…'),
          h('button', { type: 'button', class: 'btn small danger', disabled: !own.length, title: own.length ? 'Delete the ticked imported tiles' : 'Built-in tiles can’t be deleted',
            onclick: () => confirmModal(`Delete ${own.length} tile${own.length === 1 ? '' : 's'}?`, `${own.map((k) => `“${s.tiles.get(k)?.name}”`).join(', ')} will be removed from the tile list. Their cells on this map turn back into grass (you can undo that). Built-in tiles stay.`,
              'Delete', () => void (async () => { for (const k of own) await deleteTile(s, k); tpicks.clear(); this.render(); })(), true) }, `Delete${own.length ? ` (${own.length})` : ''}`),
          h('button', { type: 'button', class: 'btn small ghost', onclick: () => { tpicks.clear(); this.render(); } }, 'Clear')));
      }
      const brushKey = () => (upper ? s.upperTile : s.terrain);
      const swatch = (t: TileDef) => h('div', { class: `swatch-row${tpicks.has(t.key) ? ' ticked' : ''}` },
        h('input', { type: 'checkbox', class: 'swatch-tick', checked: tpicks.has(t.key), 'aria-label': `Tick ${t.name}`, title: `Tick ${t.name} to delete or group it with others`,
          onchange: (e: Event) => { if ((e.target as HTMLInputElement).checked) tpicks.add(t.key); else tpicks.delete(t.key); this.render(); } }),
        h('button', { type: 'button', class: 'swatch', 'aria-pressed': String(brushKey() === t.key), title: tileNote(t), onclick: () => { if (upper) s.upperTile = t.key; else s.terrain = t.key; s.emit('ui'); } },
          tileThumb(t.key),
          h('span', { class: 'swatch-name' }, t.name),
          h('span', { class: 'swatch-note' }, tileNote(t))),
        h('button', { type: 'button', class: 'mini-btn swatch-edit', title: `${t.name}: settings`, 'aria-label': `${t.name} settings`, onclick: () => tileSettings(t) }, '✎'));
      const imported = tiles.filter((t) => !t.builtin);
      body.push(...[
        h('button', { type: 'button', class: 'btn import-btn', onclick: () => void openTileImporter(s) }, '+ Import tile from texture…'),
        h('button', { type: 'button', class: 'btn import-btn', onclick: () => void openLpcLibrary(s, 'tile') }, '+ Add from the LPC library…'),
        h('button', { type: 'button', class: 'btn import-btn', onclick: () => openMvImporter(s) }, '+ RPG Maker MV sheet…'),
        upper ? h('div', { class: 'swatches' }, h('button', { type: 'button', class: 'swatch', 'aria-pressed': String(s.upperTile === ' '), onclick: () => { s.upperTile = ' '; s.emit('ui'); } },
          h('span', { class: 'swatch-name' }, '✕ Eraser'), h('span', { class: 'swatch-note' }, 'Clears the upper layer'))) : null,
        // Update 150: groups first (each opens and closes), then the rest.
        ...groupSections('tile', (upper ? imported : tiles).map((t) => [t.key, t] as [string, TileDef]), s.assets.tileGroups, (list) => h('div', { class: 'swatches' }, ...list.map(swatch))),
        upper ? null : h('div', { class: 'section-label' }, 'Built-in'),
        upper ? null : h('div', { class: 'swatches' }, ...tiles.filter((t) => t.builtin && !s.assets.tileGroups?.[t.key]).map(swatch)),
        h('div', { class: 'section-label' }, `Imported (${imported.filter((t) => !s.assets.tileGroups?.[t.key]).length})`),
        imported.length ? h('div', { class: 'swatches' }, ...imported.filter((t) => !s.assets.tileGroups?.[t.key]).map(swatch)) : h('p', { class: 'note' }, 'Tiles you import from textures appear here.')].filter((x): x is NonNullable<typeof x> => !!x));
    } else if (s.mode === 'water') {
      body.push(...this.waterPanel());
    } else if (s.mode === 'height') {
      if (s.heightTool === 'water') s.heightTool = 'raise';
      body.push(this.tools(HEIGHT_TOOLS, s.heightTool, (t) => (s.heightTool = t)));
      if (s.heightTool !== 'ramp' && s.heightTool !== 'fill') body.push(this.brush());
      if (s.heightTool === 'fill') {
        const setting = s.heightFillMode === 'set';
        const val = setting ? s.heightValue : s.heightFillBy;
        const out = h('output', { class: 'height-out' }, String(val));
        const slider = h('input', { type: 'range', min: setting ? String(MIN_HEIGHT) : '1', max: setting ? String(MAX_HEIGHT) : '10', step: '1', value: String(val), 'aria-label': setting ? 'Height to fill with' : 'Steps',
          oninput: () => { const v = parseInt(slider.value, 10); if (setting) s.heightValue = v; else s.heightFillBy = v; out.textContent = String(v); },
          onchange: () => s.emit('ui') });
        body.push(
          h('div', { class: 'toolrow small' }, ...(['set', 'raise', 'lower'] as const).map((md) =>
            h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.heightFillMode === md), onclick: () => { s.heightFillMode = md; s.emit('ui'); } },
              { set: 'Set to', raise: 'Raise by', lower: 'Lower by' }[md]))),
          h('div', { class: 'height-set' }, h('span', { class: 'section-label' }, setting ? 'Height' : 'Steps'), slider, out),
          h('p', { class: 'note' }, 'Click a cell: every connected cell at the same height as it changes together (a whole wall, a whole floor, a plateau), up to where the height changes. Undo (Ctrl+Z) puts it back.'));
      }
      if (s.heightTool === 'style') {
        const NOTES: Record<HeightStyle, string> = {
          '.': 'Square blocks with straight walls (as before).',
          b: 'Blocks with bevelled edges: softer, less sharp.',
          h: 'Heights blend into rolling slopes you can walk up and down.',
          c: 'Jagged rock faces instead of smooth walls.',
        };
        body.push(h('div', { class: 'toolrow small' }, ...([[false, 'Brush'], [true, 'Fill']] as const).map(([f, label]) =>
            h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.heightStyleFill === f), title: f ? 'Fill: every connected cell at the clicked height' : 'Paint with the brush', onclick: () => { s.heightStyleFill = f; s.emit('ui'); } }, label))),
          h('div', { class: 'section-label' }, 'Paint the shape'),
          h('div', { class: 'swatches' }, ...HEIGHT_STYLES.map(([k, name, sym]) =>
            h('button', { type: 'button', class: 'swatch', 'aria-pressed': String(s.heightStyleBrush === k), onclick: () => { s.heightStyleBrush = k; s.emit('ui'); } },
              h('span', { class: 'swatch-thumb height-style-sym' }, sym), h('span', { class: 'swatch-name' }, name), h('span', { class: 'swatch-note' }, NOTES[k])))),
          h('p', { class: 'note' }, 'Paint over raised or lowered ground to change how it’s shaped; the heights stay as they are. Hills: paint the whole slope (and a cell or two of the ground around it) so it rolls down to meet it. The symbol shows in each cell’s corner.'));
      }
      if (s.heightTool === 'set') {
        const out = h('output', { class: 'height-out' }, String(s.heightValue));
        const slider = h('input', { type: 'range', min: String(MIN_HEIGHT), max: String(MAX_HEIGHT), step: '1', value: String(s.heightValue), 'aria-label': 'Height to set',
          oninput: () => { s.heightValue = parseInt(slider.value, 10); out.textContent = String(s.heightValue); },
          onchange: () => s.emit('ui') });
        body.push(h('div', { class: 'height-set' }, h('span', { class: 'section-label' }, 'Height'), slider, out),
          h('div', { class: 'presets' }, ...[-4, -2, 0, 2, 4, 6].map((v) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.heightValue === v), onclick: () => { s.heightValue = v; s.emit('ui'); } }, v > 0 ? `+${v}` : String(v)))));
      }
      if (s.heightTool === 'ramp') {
        body.push(h('div', { class: 'toolrow' }, ...(['place', 'erase'] as const).map((m) =>
          h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.rampTool === m), title: m === 'place' ? 'Place (A)' : 'Erase (E)',
            onclick: () => { s.rampTool = m; s.emit('ui'); } }, m === 'place' ? 'Place' : 'Erase'))));
        if (s.rampTool === 'place') body.push(h('div', { class: 'section-label' }, 'Style'),
          h('div', { class: 'toolrow' }, ...(['stairs', 'ramp', 'corner'] as const).map((st) =>
            h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.rampStyle === st), onclick: () => { s.rampStyle = st; s.emit('ui'); } }, st === 'stairs' ? 'Stairs' : st === 'ramp' ? 'Ramp' : 'Corner'))));
        body.push(h('p', { class: 'note' }, s.rampTool === 'erase'
          ? 'Click or drag over ramps and stairs to remove them.'
          : s.rampStyle === 'corner'
            ? 'A corner slope rounds off a hill: put one on the low cell at a hill’s corner, between two ramps, and it rises toward the higher ground diagonally beside it (or, tucked into an inside corner, toward the higher ground on two sides). With ramps along the sides and corners at the turns, a raised area becomes a gentle hill instead of a cliff.'
            : 'Place it on the lower cell, next to ground one step higher. For taller climbs, chain several in a row, each one step higher than the last. A red cross means it has no higher neighbour to rise to: switch to Erase to remove it.'));
        const broken = s.brokenRamps();
        if (broken.length) body.push(h('button', { type: 'button', class: 'btn danger small', style: 'white-space: normal; max-width: 100%', onclick: () => {
          s.checkpoint();
          const gone = new Set(broken);
          s.map.ramps = (s.map.ramps ?? []).filter((r) => !gone.has(r));
          if (s.selection?.kind === 'ramp' && !s.rampAt(s.selection.x, s.selection.z)) s.selection = null;
          s.changed('structure');
        } }, `Remove ${broken.length} broken ramp${broken.length === 1 ? '' : 's'} (red ✕)`));
      }
      body.push(h('p', { class: 'note' }, 'Heights go from −10 to 10; one step is half a tile. Cliff walls appear wherever neighbouring cells differ. The player can’t walk up or down a cliff, only ramps and stairs, but can jump up one step, and climb walls marked Climbable on the Passage layer.'));
    } else if (s.mode === 'zones') {
      body.push(...this.zonesPanel());
    } else if (s.mode === 'passage') {
      const flagBtn = (key: PassageFlag, name: string, note: string, shortcut: string) =>
        h('button', { type: 'button', class: 'swatch passage-swatch', 'aria-pressed': String(s.passageFlag === key), title: `${name} (${shortcut})`, onclick: () => { s.passageFlag = key; s.emit('ui'); } },
          passageThumb(key), h('span', { class: 'swatch-name' }, name), h('span', { class: 'swatch-note' }, note));
      body.push(this.brush(),
        h('div', { class: 'section-label' }, 'Paint'),
        h('div', { class: 'swatches' },
          ...PASSAGE_FLAGS.map((f) => flagBtn(f.key, f.name, f.note, f.key.toUpperCase())),
          flagBtn('.', 'Erase', 'Back to normal: the tile, props and heights decide.', 'E')),
        h('p', { class: 'note' }, 'Climbable goes on either side of a cliff (top or bottom cell). The player climbs by walking into the wall.'));
      // Abilities are for the whole game (saved in the database), not this map.
      const NOTES: Record<string, string> = {
        run: 'Hold Shift (Run button on touch screens).',
        jump: 'C (Jump button): up one step, or across a one-tile gap.',
        climb: 'Walk into a climbable wall.',
        crawl: 'Walk into a low-clearance cell.',
      };
      body.push(h('div', { class: 'section-label' }, 'Player abilities at the start'),
        h('div', { class: 'abilities-list' }, ...ABILITIES.map((a) => h('div', { class: 'ability-row' },
          checkbox(ABILITY_NAMES[a], s.db.abilities?.[a] ?? true, (v) => {
            s.checkpoint();
            const ab = (s.db.abilities ??= {});
            if (v) delete ab[a]; else ab[a] = false;
            if (!Object.keys(ab).length) delete s.db.abilities;
            s.changedDb();
          }),
          h('span', { class: 'swatch-note' }, NOTES[a])))),
        h('p', { class: 'note' }, 'Turn one off to unlock it later with the “Change ability” event command (climbing gloves, a crawl-through-vents skill…).'));
    } else if (s.mode === 'props') {
      const stickFrom = body.length;
      body.push(this.tools(PROP_TOOLS, s.propTool, (t) => (s.propTool = t)));
      if (s.propTool === 'scatter') body.push(this.brush());
      const defs = paletteProps();
      if (s.propTool === 'erase') {
        // Erase by type: only the kind picked below; or every one of that kind on the map at once.
        const kind = defs.find((d) => d.id === s.propType), name = kind?.name ?? s.propType;
        const count = s.map.props.filter((p) => p.type === s.propType).length;
        body.push(h('div', { class: 'erase-type' },
          checkbox(`Only erase ${name}`, s.eraseOnlyType, (v) => { s.eraseOnlyType = v; s.emit('ui'); }),
          h('button', { type: 'button', class: 'btn small danger', disabled: !count, onclick: () => confirmModal(`Erase every ${name}?`, `This removes all ${count} ${name} on this map (Ctrl+Z undoes it).`, 'Erase them all', () => {
            s.checkpoint();
            s.map.props = s.map.props.filter((p) => p.type !== s.propType);
            if (s.selection?.kind === 'prop') s.select(null);
            s.changed();
            toast(`Erased ${count} × ${name}`);
          }, true) }, `Erase all ${name} (${count})`),
          h('p', { class: 'note' }, 'Pick the kind in the list below (the tool stays on Erase).')));
      }
      body.push(checkbox('Snap to tiles', s.snap, (v) => { s.snap = v; s.emit('ui'); }));
      // Layer (Update 144): 0 on top … 25 the ground, like RPG Maker's layers.
      if (s.propTool === 'place' || s.propTool === 'scatter') {
        const dl = s.catalog.get(s.propType)?.layer ?? 25;
        body.push(h('label', { class: 'field-row prop-layer' }, h('span', {}, 'Layer'),
          select([['', `Prop’s own (${dl})`], ...Array.from({ length: 26 }, (_, k) => [String(k), k === 0 ? '0 (on top)' : k === 25 ? '25 (ground)' : String(k)] as [string, string])],
            s.propLayer === null ? '' : String(s.propLayer), (v) => { s.propLayer = v === '' ? null : Number(v); s.emit('ui'); }),
          h('span', { class: 'swatch-note' }, 'Lower numbers draw on top where props overlap.')));
      }
      const edit = (id: string) => { const d = s.catalog.get(id); if (d) void openPropImporter(s, d); };
      const remove = (id: string, name: string) => confirmModal('Delete prop?',
        `“${name}” will be removed from the prop list and from this map. Its image files stay in your project.`, 'Delete', () => void deleteProp(s, id), true);
      const reset = (id: string, name: string) => confirmModal('Reset to original?',
        `“${name}” goes back to the built-in art and settings, everywhere it’s placed.`, 'Reset', () => void resetProp(s, id));
      const customised = (id: string) => isBuiltinProp(id) && s.assets.props.some((d) => d.id === id);

      // The selected prop, with its actions always in view.
      const cur = s.catalog.get(s.propType);
      if (cur) {
        const builtin = isBuiltinProp(cur.id);
        body.push(h('div', { class: 'prop-current' },
          h('span', { class: 'prop-current-thumb' }, spriteThumb(propImage(cur.id), 40, 40)),
          h('div', { class: 'prop-current-info' },
            h('div', { class: 'prop-current-name' }, cur.name),
            h('div', { class: 'swatch-note' }, `${builtin ? (customised(cur.id) ? 'Built-in, customised' : 'Built-in') : 'Imported'} · ${fmtTiles(cur.w)} × ${fmtTiles(cur.h)} tiles`)),
          h('div', { class: 'prop-current-actions' },
            h('button', { type: 'button', class: 'btn small', onclick: () => edit(cur.id) }, builtin && !customised(cur.id) ? 'Customise…' : 'Edit…'),
            customised(cur.id) ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => reset(cur.id, cur.name) }, 'Reset to original') : null,
            h('button', { type: 'button', class: 'btn small', title: 'A copy with the same picture, to give its own settings (a Halloween-only copy, say)', onclick: () => void duplicateProp(s, cur.id) }, 'Duplicate'),
            !builtin ? h('button', { type: 'button', class: 'btn small danger', onclick: () => remove(cur.id, cur.name) }, 'Delete') : null)));
      }

      // Ticked props, to edit together.
      const picks = this.propPicks;
      for (const id of [...picks]) if (!s.catalog.get(id)) picks.delete(id);
      const tick = (id: string, name: string) => {
        const box = h('input', { type: 'checkbox', class: 'sprite-tick', checked: picks.has(id), title: `Tick ${name} to edit it with others`, 'aria-label': `Tick ${name} to edit together`,
          onchange: () => { if (box.checked) picks.add(id); else picks.delete(id); this.render(); } });
        return box;
      };
      if (picks.size) {
        body.push(h('div', { class: 'prop-picks' },
          h('span', { class: 'prop-picks-n' }, `${picks.size} ticked`),
          h('button', { type: 'button', class: 'btn small primary', disabled: picks.size < 2, title: picks.size < 2 ? 'Tick at least two' : 'Change settings for all the ticked props', onclick: () => openPropBatchEdit(s, [...picks], () => { picks.clear(); this.render(); }) }, 'Edit together…'),
          h('button', { type: 'button', class: 'btn small', onclick: () => groupModal(s, 'prop', [...picks], () => { picks.clear(); this.render(); }) }, 'Group…'),
          (() => {
            // Update 150: delete the ticked imported props at once.
            const own = [...picks].filter((id) => !isBuiltinProp(id));
            return h('button', { type: 'button', class: 'btn small danger', disabled: !own.length, title: own.length ? 'Delete the ticked imported props' : 'Built-in props can’t be deleted',
              onclick: () => confirmModal(`Delete ${own.length} prop${own.length === 1 ? '' : 's'}?`, `${own.map((id) => `“${s.catalog.get(id)?.name ?? id}”`).join(', ')} will be removed from the prop list and from this map. Their image files stay in your project.`,
                'Delete', () => void (async () => { for (const id of own) await deleteProp(s, id); picks.clear(); this.render(); })(), true) }, `Delete${own.length ? ` (${own.length})` : ''}`);
          })(),
          h('button', { type: 'button', class: 'btn small ghost', onclick: () => { picks.clear(); this.render(); } }, 'Clear')));
      }
      const card = (id: string, name: string, lit: boolean) => {
        const pick = () => { s.propType = id; if (s.propTool === 'select') s.propTool = 'place'; s.emit('ui'); };
        return h('div', { class: `sprite-card${picks.has(id) ? ' ticked' : ''}` },
          tick(id, name),
          h('button', { type: 'button', class: 'sprite-btn', 'aria-pressed': String(s.propType === id), title: name, onclick: pick },
            h('span', { class: 'sprite-frame' }, spriteThumb(propImage(id))),
            h('span', { class: 'sprite-name' }, name),
            lit ? h('span', { class: 'sprite-badge', title: 'Carries a light' }, '✦') : null,
            customised(id) ? h('span', { class: 'sprite-badge left', title: 'Customised' }, '●') : null),
          h('button', { type: 'button', class: 'mini-btn sprite-edit', title: `Edit ${name}`, 'aria-label': `Edit ${name}`, onclick: () => edit(id) }, '✎'));
      };
      const pg = s.assets.propGroups ?? {};
      const builtins = defs.filter((d) => isBuiltinProp(d.id) && !pg[d.id]), imported = defs.filter((d) => !isBuiltinProp(d.id) && !pg[d.id]);
      const tickAll = (list: { id: string }[]) => {
        const all = list.every((d) => picks.has(d.id));
        return h('button', { type: 'button', class: 'mini-link', onclick: () => { for (const d of list) if (all) picks.delete(d.id); else picks.add(d.id); this.render(); } }, all ? 'Untick all' : 'Tick all');
      };
      const builtinLabel = h('div', { class: 'section-label' }, 'Built-in', tickAll(builtins));
      body.push(
        h('button', { type: 'button', class: 'btn import-btn', title: 'Import a prop from an image', onclick: () => void openPropImporter(s) }, '+ Image…'),
        h('button', { type: 'button', class: 'btn import-btn', title: 'Import a 3D prop from a GLB or FBX model', onclick: () => void openPropImporter(s, undefined, { model: true }) }, '+ 3D model…'),
        h('button', { type: 'button', class: 'btn import-btn', title: 'Add props from the LPC library', onclick: () => void openLpcLibrary(s, 'prop') }, '+ LPC library…'),
        ...groupSections('prop', defs.map((d) => [d.id, d] as [string, typeof d]), pg, (list) => h('div', { class: 'sprites' }, ...list.map((d) => card(d.id, d.name, !!d.light)))),
        builtinLabel,
        h('div', { class: 'sprites' }, ...builtins.map((d) => card(d.id, d.name, !!d.light))));
      // Everything above the lists (tools, the chosen prop, ticks, import) stays in view while scrolling them.
      const firstGroup = body.findIndex((n) => n instanceof HTMLElement && n.classList.contains('pal-group'));
      const at = firstGroup >= 0 ? firstGroup : body.indexOf(builtinLabel);
      if (at > stickFrom) body.splice(stickFrom, at - stickFrom, h('div', { class: 'prop-sticky' }, ...body.slice(stickFrom, at)));
      body.push(h('div', { class: 'section-label' }, `Imported (${imported.length})`, imported.length ? tickAll(imported) : null),
        imported.length
          ? h('div', { class: 'sprites' }, ...imported.map((d) => card(d.id, d.name, !!d.light)))
          : h('p', { class: 'note' }, 'Props you import from images appear here.'));
    } else if (s.mode === 'lights') {
      body.push(this.tools(LIGHT_TOOLS, s.lightTool, (t) => (s.lightTool = t)));
      const TYPES: [LightType, string, string][] = [
        ['point', 'Point', 'Shines in every direction: torches, lamps, magic.'],
        ['spot', 'Spotlight', 'A beam facing up, down, left or right, like a flashlight.'],
        ['area', 'Area', 'Tints or shades everything inside a shape, fading at the edge.'],
      ];
      body.push(h('div', { class: 'section-label' }, 'Light type'),
        h('div', { class: 'swatches' }, ...TYPES.map(([t, name, note]) =>
          h('button', { type: 'button', class: 'swatch light-swatch', 'aria-pressed': String(s.lightType === t),
            onclick: () => { s.lightType = t; s.lightTool = 'place'; s.emit('ui'); } },
            h('span', { class: `light-icon ${t}`, 'aria-hidden': 'true' }),
            h('span', { class: 'swatch-name' }, name),
            h('span', { class: 'swatch-note' }, note)))),
        h('div', { class: 'section-label' }, 'Preset for new lights'),
        h('div', { class: 'presets' }, ...LIGHT_PRESETS[s.lightType].map((p) =>
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.lightPreset[s.lightType] === p),
            onclick: () => { s.lightPreset[s.lightType] = p; s.lightTool = 'place'; s.emit('ui'); } },
            h('span', { class: 'chip-dot', style: `background:${p.values.color}` }), p.name))),
        h('p', { class: 'note' }, 'Campfires and torches are props now: place them from the Props layer and their light comes with them.'));
    } else if (s.mode === 'buildings') {
      body.push(this.tools(BUILDING_TOOLS, s.buildingTool, (t) => (s.buildingTool = t)));
      body.push(h('div', { class: 'section-label' }, 'Preset for new buildings'),
        h('div', { class: 'sprites' }, ...BUILDING_PRESETS.map((p) =>
          h('div', { class: 'sprite-card' }, h('button', { type: 'button', class: 'sprite-btn', 'aria-pressed': String(s.buildingPreset === p.id), title: p.note,
            onclick: () => { s.buildingPreset = p.id; s.buildingTool = 'draw'; s.emit('ui'); } },
            h('span', { class: 'sprite-frame' }, buildingThumb(p.id)), h('span', { class: 'sprite-name' }, p.name))))),
        h('p', { class: 'note' }, 'Change the walls, roof, height, doors and windows of a selected building at the top of this panel. Buildings block their tiles. For an interior, make a new map and put a Transfer event in front of the door (the building’s panel can add one).'));
      const list = s.map.buildings ?? [];
      if (list.length)
        body.push(h('div', { class: 'section-label' }, `Buildings on this map (${list.length})`),
          h('ul', { class: 'event-list' }, ...list.map((b, i) => h('li', {}, h('button', { type: 'button', class: 'event-item',
            'aria-pressed': String(s.selection?.kind === 'building' && s.selection.index === i), onclick: () => s.select({ kind: 'building', index: i }) },
            h('span', { class: 'ev-name' }, b.name || BUILDING_PRESETS.find((p) => p.values.wall === b.wall && p.values.roof === b.roof)?.name || 'Building'),
            h('span', { class: 'ev-pos' }, `${b.x}, ${b.z} · ${b.w}×${b.d}`))))));
    } else {
      body.push(h('p', { class: 'note' }, 'Click an empty tile to create an event or move the player start there. Drag across tiles for one event covering an area (wide doorways). Ctrl+C / Ctrl+V copy and paste events.'));
      const hero = s.db.characters[s.db.player];
      // Update 150: the selected event's settings (or the new-event panel) right above the list.
      if (this.inspector) body.push(this.inspector);
      // Update 156: a 3D map's volumes (made in the 3D view).
      const vols = s.map.volumes ?? [];
      if (s.map.scene3d) body.push(h('div', { class: 'section-label' }, `Volumes (${vols.length})`),
        vols.length ? h('ul', { class: 'event-list' }, ...vols.map((v) => h('li', {}, h('button', { type: 'button', class: 'event-item', 'aria-pressed': String(s.selection?.kind === 'volume' && s.selection.id === v.id), onclick: () => s.select({ kind: 'volume', id: v.id }) },
          h('span', { class: 'ev-id' }, v.kind === 'trigger' ? '▣' : '⚔'), h('span', { class: 'ev-name' }, v.name), h('span', { class: 'ev-pos' }, v.kind === 'encounter' ? (v.zone ? `zone ${v.zone}` : 'no zone') : v.event !== undefined ? `→ ${String(v.event).padStart(3, '0')}` : 'no event')))))
          : h('p', { class: 'note' }, 'In the 3D view, right-click a spot → Trigger volume or Encounter volume.'));
      body.push(h('div', { class: 'section-label' }, `Events on this map (${s.map.events.length})`),
        h('ul', { class: 'event-list' },
          s.startHere && hero ? h('li', {}, h('button', { type: 'button', class: 'event-item', 'aria-pressed': String(s.selection?.kind === 'start'),
            onclick: () => { s.select({ kind: 'start' }); this.onFocusEvent(-1); } },
            canvasCopy(characterImage(s.db.player, hero), 'mini'), h('span', {}, 'Player start'))) : null,
          ...s.map.events.map((ev) => {
            const onMap = s.inMap(ev.x, ev.z);
            const sel = s.selection?.kind === 'event' && s.selection.id === ev.id;
            return h('li', {}, h('button', { type: 'button', class: 'event-item', 'aria-pressed': String(sel), onclick: () => { s.select({ kind: 'event', id: ev.id }); this.onFocusEvent(ev.id); } },
              h('span', { class: 'ev-id' }, String(ev.id).padStart(3, '0')),
              h('span', { class: 'ev-name' }, ev.name),
              h('span', { class: 'ev-pos' }, onMap ? `${ev.x}, ${ev.z}${(ev.w ?? 1) > 1 || (ev.h ?? 1) > 1 ? ` · ${ev.w ?? 1}×${ev.h ?? 1}` : ''}` : 'Off map')));
          })));
    }
    body.push(checkbox('Show grid', s.showGrid, (v) => { s.showGrid = v; s.emit('ui'); }));
    // Other tabs: what's selected (a prop, a light, a building…) at the top.
    if (this.inspector && s.mode !== 'events') body.unshift(this.inspector);

    // Keep the list where it was (editing a prop, picking one, saving): only a different tab starts at the top.
    const old = this.el.querySelector('.side-body') as HTMLElement | null;
    const keep = old && this.shownMode === s.mode ? old.scrollTop : 0;
    const side = h('div', { class: 'side-body' }, ...body);
    const grip = this.el.querySelector('.side-grip');
    this.el.replaceChildren(head, side, ...(grip ? [grip] : []));
    side.scrollTop = keep;
    this.shownMode = s.mode;
  }
  /** The tab the panel was last drawn for. */
  private shownMode = '';
  /** Update 150: the inspector (what's selected), shown inside this panel; the right bar is gone. */
  private inspector: HTMLElement | null = null;
  setInspector(el: HTMLElement): void { this.inspector = el; this.render(); }
  /** Props ticked in the palette, to edit together. */
  private readonly propPicks = new Set<string>();
  /** Ticked tiles (Update 150). */
  private readonly tilePicks = new Set<string>();

  /**
   * The Water tab: fill, paint, remove or restyle water; its level and kind; and the map's water styles (a pond, a
   * river, the sea, lava…), each with its colour, clarity, surface, current and glow.
   */
  private waterPanel(): HTMLElement[] {
    const s = this.store, m = s.map;
    const styles = waterStyles(m);
    if (s.waterStyle >= styles.length) s.waterStyle = 0;
    // Editing a style: the map gets its own list (made from the older single look the first time).
    const editStyles = (fn: (list: WaterStyle[]) => void, rerender = true) => {
      s.checkpoint();
      if (!m.waterStyles?.length) { m.waterStyles = waterStyles(m).map((x) => ({ ...x })); delete m.waterLook; }
      fn(m.waterStyles);
      s.changed('structure');
      if (rerender) s.emit('ui');
    };
    const out = h('output', { class: 'height-out' }, String(s.waterLevel));
    const slider = h('input', { type: 'range', min: String(MIN_HEIGHT), max: String(MAX_HEIGHT), step: '1', value: String(s.waterLevel), 'aria-label': 'Water level',
      oninput: () => { s.waterLevel = parseInt(slider.value, 10); out.textContent = String(s.waterLevel); } });
    const KINDS: [WaterKind, string, string][] = [
      ['auto', 'Auto', 'Shallow if one step deep or less, otherwise swimmable.'],
      ['shallow', 'Shallow', 'Wade through it, a bit slower.'],
      ['swim', 'Swimmable', 'The player swims.'],
      ['deep', 'Deep', 'Can’t be entered: oceans, map borders.'],
    ];
    const st = styles[s.waterStyle];
    const near = (v: number, opts: number[]) => String(opts.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)));
    const set = <K extends keyof WaterStyle>(k: K, v: WaterStyle[K] | undefined, rerender = false) => editStyles((list) => {
      const x = list[s.waterStyle];
      if (v === undefined) delete x[k]; else x[k] = v;
    }, rerender);
    const color = h('input', { type: 'color', value: st.color, 'aria-label': 'Water colour' });
    color.addEventListener('change', () => set('color', color.value, true));
    const presetPick = select([['', '+ New style…'], ...WATER_PRESETS.map(([k, p]) => [k, p.name] as [string, string])], '', (v) => {
      const p = WATER_PRESETS.find(([k]) => k === v)?.[1];
      if (!p) return;
      editStyles((list) => { list.push({ ...p }); s.waterStyle = list.length - 1; });
    }, { 'aria-label': 'New water style' });
    const toolRow = h('div', { class: 'toolrow small' }, ...(['fill', 'paint', 'remove', 'style', 'fish'] as const).map((md) =>
      h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.waterMode === md), title: { fill: 'F', paint: 'P', remove: 'X', style: 'R', fish: 'G' }[md], onclick: () => { s.waterMode = md; s.emit('ui'); } },
        { fill: 'Fill basin', paint: 'Paint', remove: 'Remove', style: 'Restyle pool', fish: 'Fishing' }[md])));
    if (s.waterMode === 'fish') return [toolRow, ...this.fishPanel()];
    const parts: (HTMLElement | null)[] = [
      toolRow,
      s.waterMode === 'paint' || s.waterMode === 'remove' ? this.brush() : null,
      s.waterMode === 'remove' || s.waterMode === 'style' ? null : h('div', { class: 'height-set' }, h('span', { class: 'section-label' }, 'Level'), slider, out),
      s.waterMode === 'remove' || s.waterMode === 'style' ? null : h('div', { class: 'section-label' }, 'Type'),
      s.waterMode === 'remove' || s.waterMode === 'style' ? null : h('div', { class: 'swatches' }, ...KINDS.map(([k, name, note]) =>
        h('button', { type: 'button', class: 'swatch water-swatch', 'aria-pressed': String(s.waterKind === k), onclick: () => { s.waterKind = k; s.emit('ui'); } },
          h('span', { class: `water-icon ${k}`, 'aria-hidden': 'true' }), h('span', { class: 'swatch-name' }, name), h('span', { class: 'swatch-note' }, note)))),
      s.waterMode === 'remove' ? null : h('div', { class: 'section-label' }, 'Style'),
      s.waterMode === 'remove' ? null : h('div', { class: 'swatches' }, ...styles.map((x, i) =>
        h('button', { type: 'button', class: 'swatch water-swatch', 'aria-pressed': String(s.waterStyle === i), onclick: () => { s.waterStyle = i; s.emit('ui'); } },
          h('span', { class: 'water-dot', style: `background:${x.color}${x.glow ? `;box-shadow:0 0 6px ${x.color}` : ''}`, 'aria-hidden': 'true' }, x.symbol ?? ''),
          h('span', { class: 'swatch-name' }, x.name), h('span', { class: 'swatch-note' }, [x.flow ? 'flowing' : 'still', x.glow ? 'glows' : '', x.ailment ? AILMENT_INFO[x.ailment].name.toLowerCase() : ''].filter(Boolean).join(' · '))))),
      s.waterMode === 'remove' ? null : presetPick,
      s.waterMode === 'remove' ? null : h('div', { class: 'water-style-form' },
        h('label', { class: 'field' }, h('span', {}, 'Name'), (() => { const i = h('input', { type: 'text', value: st.name }); i.addEventListener('change', () => set('name', i.value.trim() || st.name, true)); return i; })()),
        h('label', { class: 'field' }, h('span', {}, 'Colour'), color),
        h('label', { class: 'field' }, h('span', {}, 'Editor mark'), select(WATER_SYMBOLS.map((k) => [k, k ? `${k}` : 'None'] as [string, string]), st.symbol ?? '', (v) => set('symbol', v || undefined, true), { 'aria-label': 'Mark shown on this water in the editor' })),
        h('label', { class: 'field' }, h('span', {}, 'Clarity'), select([['0', 'Crystal clear'], ['0.25', 'Clear'], ['0.5', 'Normal'], ['0.75', 'Murky'], ['1', 'Muddy / thick']], near(st.murk ?? 0.5, [0, 0.25, 0.5, 0.75, 1]), (v) => set('murk', Number(v) === 0.5 ? undefined : Number(v)))),
        h('label', { class: 'field' }, h('span', {}, 'Look'), select([['toon', 'Toon (flat, wave lines, foam)'], ['real', 'Realistic (ripples, glints)']], isToonWater(st) ? 'toon' : 'real',
          (v) => set('look', (v === ((st.glow ?? 0) > 0 ? 'real' : 'toon') ? undefined : v) as WaterStyle['look'], true))),
        isToonWater(st) ? h('label', { class: 'field' }, h('span', {}, 'Wave lines'), select([['0', 'None'], ['0.25', 'A few'], ['0.5', 'Some'], ['0.75', 'Lots'], ['1', 'Packed']], near(st.lines ?? 0.5, [0, 0.25, 0.5, 0.75, 1]), (v) => set('lines', Number(v) === 0.5 ? undefined : Number(v)))) : null,
        isToonWater(st) ? h('label', { class: 'field' }, h('span', {}, 'Shore foam'), select([['on', 'Foam outline along the shore'], ['off', 'None']], st.noFoam ? 'off' : 'on', (v) => set('noFoam', v === 'off' ? true : undefined))) : null,
        h('label', { class: 'field' }, h('span', {}, 'Surface'), select([['0.3', 'Glassy'], ['0.6', 'Calm'], ['1', 'Normal'], ['1.6', 'Choppy'], ['2.2', 'Rough']], near(st.bumpy ?? 1, [0.3, 0.6, 1, 1.6, 2.2]), (v) => set('bumpy', Number(v) === 1 ? undefined : Number(v)))),
        h('label', { class: 'field' }, h('span', {}, 'Current'), select([['0', 'Still (a pond, a lake)'], ['0.12', 'Barely (lava)'], ['0.4', 'Slow'], ['1', 'A stream'], ['2', 'A fast river']], near(st.flow ?? 0, [0, 0.12, 0.4, 1, 2]), (v) => set('flow', Number(v) || undefined, true))),
        (st.flow ?? 0) > 0 ? h('label', { class: 'field' }, h('span', {}, 'Flowing towards'), select([['0', 'East →'], ['45', 'South-east ↘'], ['90', 'South ↓'], ['135', 'South-west ↙'], ['180', 'West ←'], ['225', 'North-west ↖'], ['270', 'North ↑'], ['315', 'North-east ↗']],
          near(st.flowDir ?? 0, [0, 45, 90, 135, 180, 225, 270, 315]), (v) => set('flowDir', Number(v) || undefined))) : null,
        h('label', { class: 'field' }, h('span', {}, 'Glows'), select([['0', 'No'], ['0.35', 'Faintly (goo)'], ['0.7', 'Brightly'], ['1', 'Like lava']], near(st.glow ?? 0, [0, 0.35, 0.7, 1]), (v) => set('glow', Number(v) || undefined))),
        h('label', { class: 'field' }, h('span', {}, 'Being in it gives'), select([['', 'Nothing'], ...AILMENTS.filter((a) => a !== 'zombie').map((a) => [a, AILMENT_INFO[a].name] as [string, string])], st.ailment ?? '', (v) => set('ailment', (v || undefined) as Ailment | undefined, true))),
        st.ailment ? h('label', { class: 'field' }, h('span', {}, 'Chance (% each half second)'), numberInput(st.chance ?? 100, (v) => set('chance', Math.max(1, Math.min(100, Math.round(v))) === 100 ? undefined : Math.max(1, Math.min(100, Math.round(v)))), { min: 1, max: 100, step: 5 })) : null,
        styles.length > 1 ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => {
          const used = (m.water ?? []).some((r) => r.split(/\s+/).some((t) => t.endsWith(`@${s.waterStyle}`)) || (s.waterStyle === 0 && /\d/.test(r)));
          if (used && !confirm(`Water on this map uses “${st.name}”. Delete it? That water takes the first style.`)) return;
          const gone = s.waterStyle;
          editStyles((list) => { list.splice(gone, 1); });
          // Renumber the cells: the deleted style's water takes the first, later styles move down one.
          s.checkpoint();
          s.editWater((grid) => { let any = false; for (let i = 0; i < grid.length; i++) { const c = grid[i]; if (!c?.style) continue; if (c.style === gone) { delete c.style; any = true; } else if (c.style > gone) { c.style--; any = true; } } return any; });
          s.waterStyle = 0;
          s.changed('structure');
          s.emit('ui');
        } }, 'Delete this style') : null),
      h('p', { class: 'note' }, s.waterMode === 'fill'
        ? 'Dig a hollow with Height → Lower, then click inside it: water fills every connected cell whose ground is below the level.'
        : s.waterMode === 'paint' ? 'Paint water at this level. Cells whose ground is at or above the level stay dry.'
          : s.waterMode === 'style' ? 'Click any water: its whole pool takes the chosen style. A pond and the stream running out of it can be different styles: paint the stream on its own.'
            : 'Drag over water to remove it.'),
    ];
    return parts.filter((n): n is HTMLElement => !!n);
  }

  /** Water tab → Fishing: paint fishing spots over water, each with a catch table (what bites, how often, when). */
  private fishPanel(): HTMLElement[] {
    const s = this.store, m = s.map, items = s.db.items ?? [];
    const zones = m.fishZones ?? [];
    if (s.fishZone >= zones.length) s.fishZone = Math.max(0, zones.length - 1);
    const edit = (fn: (list: FishZone[]) => void, rerender = true) => { s.checkpoint(); m.fishZones ??= []; fn(m.fishZones); if (!m.fishZones.length) delete m.fishZones; s.changed('structure'); if (rerender) s.emit('ui'); };
    const tools = h('div', { class: 'toolrow small fish-tools' },
      h('button', { type: 'button', class: 'tool', 'aria-pressed': String(!s.fishErase), onclick: () => { s.fishErase = false; s.emit('ui'); } }, 'Paint spot'),
      h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.fishErase), onclick: () => { s.fishErase = true; s.emit('ui'); } }, 'Erase'));
    const COLORS = ['#7fd0ff', '#ffd27a', '#a6f08a', '#ff9ad0', '#c8a6ff', '#ffb070'];
    const list = h('div', { class: 'swatches' }, ...zones.map((z, i) =>
      h('button', { type: 'button', class: 'swatch water-swatch', 'aria-pressed': String(s.fishZone === i), onclick: () => { s.fishZone = i; s.fishErase = false; s.emit('ui'); } },
        h('span', { class: 'water-dot', style: `background:${z.color ?? '#7fd0ff'}`, 'aria-hidden': 'true' }, '><'),
        h('span', { class: 'swatch-name' }, z.name), h('span', { class: 'swatch-note' }, `${z.fish.length} catch${z.fish.length === 1 ? '' : 'es'}`))));
    const add = h('button', { type: 'button', class: 'btn small', onclick: () => edit((l) => { l.push({ ...defaultZone(items, `Spot ${l.length + 1}`), color: COLORS[l.length % COLORS.length] }); s.fishZone = l.length - 1; s.fishErase = false; }) }, '+ New fishing spot');
    const out: HTMLElement[] = [tools, this.brush(), h('div', { class: 'section-label' }, 'Fishing spots'), list, add];
    const z = zones[s.fishZone];
    if (z) {
      const name = h('input', { type: 'text', value: z.name });
      name.addEventListener('change', () => edit((l) => { l[s.fishZone].name = name.value.trim() || z.name; }));
      const col = h('input', { type: 'color', value: z.color ?? '#7fd0ff' });
      col.addEventListener('change', () => edit((l) => { l[s.fishZone].color = col.value; }));
      const itemOpts = items.map((d) => [d.id, `${d.name}${d.fish ? '' : d.kind === 'material' || d.kind === 'consumable' ? '' : ` (${d.kind})`}`] as [string, string]);
      const total = z.fish.reduce((a, f) => a + Math.max(0, f.chance), 0) || 1;
      const rows = z.fish.map((f, k) => h('div', { class: 'fish-row' },
        select(itemOpts, f.item, (v) => edit((l) => { l[s.fishZone].fish[k].item = v; }), { 'aria-label': 'Catch' }),
        numberInput(f.chance, (v) => edit((l) => { l[s.fishZone].fish[k].chance = Math.max(0, Math.round(v)); }), { min: 0, step: 1, 'aria-label': 'Weight', title: 'Weight against the others' }),
        h('span', { class: 'fish-pct' }, `${Math.round((Math.max(0, f.chance) / total) * 100)}%`),
        select([['', 'Any time'], ['day', 'By day'], ['night', 'At night']], f.time ?? '', (v) => edit((l) => { const x = l[s.fishZone].fish[k]; if (v) x.time = v as 'day' | 'night'; else delete x.time; }), { 'aria-label': 'When' }),
        h('label', { class: 'fish-rare', title: 'Rare: a better rod makes it more likely' }, (() => { const c = h('input', { type: 'checkbox', checked: !!f.rare, onchange: () => edit((l) => { const x = l[s.fishZone].fish[k]; if (c.checked) x.rare = true; else delete x.rare; }) }); return c; })(), 'Rare'),
        h('button', { type: 'button', class: 'btn small ghost', title: 'Remove', onclick: () => edit((l) => { l[s.fishZone].fish.splice(k, 1); }) }, '×')));
      out.push(h('div', { class: 'water-style-form' },
        h('label', { class: 'field' }, h('span', {}, 'Name'), name),
        h('label', { class: 'field' }, h('span', {}, 'Colour (editor only)'), col),
        h('div', { class: 'section-label' }, 'What bites (weight · chance · when)'),
        ...rows,
        h('button', { type: 'button', class: 'btn small', onclick: () => edit((l) => { l[s.fishZone].fish.push({ item: items.find((d) => d.fish)?.id ?? items[0]?.id ?? '', chance: 10 }); }) }, '+ Add a catch'),
        ...(() => {
          // Water enemies (Update 109): a share of bites are monsters that start a battle.
          const water = (s.db.enemies ?? []).filter((e) => e.water);
          if (!water.length) return [h('p', { class: 'note' }, 'Water enemies: none yet. Tick “Water enemy” on an enemy (Database → Enemies) and now and then a bite here is one of them, starting a battle.')];
          const picked = (id: string) => !z.monsters?.length || z.monsters.includes(id);
          return [h('div', { class: 'section-label' }, 'Water enemies'),
            h('label', { class: 'field' }, h('span', {}, 'Chance a bite is a monster (%)'),
              numberInput(z.monsterChance ?? 10, (v) => edit((l) => { const n = Math.max(0, Math.min(100, Math.round(v))); if (n === 10) delete l[s.fishZone].monsterChance; else l[s.fishZone].monsterChance = n; }, false), { min: 0, max: 100, step: 1 })),
            h('div', { class: 'fish-monsters' }, ...water.map((e) => checkbox(e.name, picked(e.id), (on) => edit((l) => {
              const zz = l[s.fishZone], all = water.map((x) => x.id);
              const cur = new Set(zz.monsters?.length ? zz.monsters : all);
              if (on) cur.add(e.id); else cur.delete(e.id);
              const list = all.filter((id) => cur.has(id));
              // None ticked: no monsters here (chance 0).
              if (!list.length) { delete zz.monsters; zz.monsterChance = 0; } else if (list.length === all.length) delete zz.monsters; else zz.monsters = list;
            }))))];
        })(),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => {
          if (!confirm(`Delete the fishing spot “${z.name}”? Water painted with it stops being a fishing spot.`)) return;
          const gone = s.fishZone;
          edit((l) => { l.splice(gone, 1); }, false);
          s.editFishing((grid) => { let any = false; for (let i = 0; i < grid.length; i++) { const c = grid[i]; if (c === null) continue; if (c === gone) { grid[i] = null; any = true; } else if (c > gone) { grid[i] = c - 1; any = true; } } return any; });
          s.fishZone = 0; s.changed('structure'); s.emit('ui');
        } }, 'Delete this spot')));
    }
    out.push(h('p', { class: 'note' }, zones.length
      ? 'Paint over water where fish can be caught. In the game, a hero with a fishing rod faces the spot and presses Talk to cast; when the float is pulled under, Talk again to land it. What bites is picked from the spot’s list by weight (night or day fish only at that time; rare ones are likelier with a better rod).'
      : 'Add a fishing spot, then paint it over water. Each spot has its own list of catches (a pond’s minnows, the river’s trout, the sea’s…).'));
    return out;
  }

  private tools<T extends string>(list: [T, string, string][], current: T, set: (t: T) => void): HTMLElement {
    return h('div', { class: 'toolrow', role: 'group', 'aria-label': 'Tool' }, ...list.map(([t, label, key]) =>
      h('button', { type: 'button', class: 'tool', 'aria-pressed': String(current === t), title: `${label} (${key})`, onclick: () => { set(t); this.store.emit('ui'); } }, label)));
  }

  /** The Spawns layer: zone letters to paint, and the chosen zone's troops, conditions and frequency. */
  /** Battle maps: where the party and the enemies stand. */
  private markersPanel(): HTMLElement[] {
    const s = this.store, list = s.map.markers ?? [];
    const n = (side: 'party' | 'enemy') => list.filter((mk) => mk.side === side).length;
    const tool = (key: 'party' | 'enemy' | 'erase', name: string, note: string) =>
      h('button', { type: 'button', class: 'swatch zone-swatch', 'aria-pressed': String(s.markerTool === key), onclick: () => { s.markerTool = key; s.emit('ui'); } },
        h('span', { class: 'zone-chip', style: key === 'erase' ? '' : `background:${MARKER_COLORS[key]}` }, key === 'erase' ? '✕' : key === 'party' ? 'P' : 'E'),
        h('span', { class: 'swatch-name' }, name), h('span', { class: 'swatch-note' }, note));
    return [
      h('p', { class: 'note' }, 'This is a battle map, so the Spawns layer places where fighters stand. Zones and troops are painted on the maps you walk around (untick Map settings → Battles → This is a battle map to paint zones here).'),
      h('div', { class: 'section-label' }, 'Place'),
      h('div', { class: 'swatches' },
        tool('party', 'Party marker', `${n('party')} placed · P1 is the hero (put it in the middle), P2 and P3 the party`),
        tool('enemy', 'Enemy marker', `${n('enemy')} placed · E1 to E3 (three at most)`),
        tool('erase', 'Remove', 'Click a marker to take it away.')),
      h('p', { class: 'note' }, 'Click a tile to put a marker there. The camera stands behind the party, looking at the enemies, so put the party near the bottom of the map and the enemies above them (like FFX and Legend of Dragoon).'),
      h('p', { class: 'note' }, 'More fighters than markers: the extra ones stand just behind the others. No markers at all: the party and the enemies line up either side of the middle.'),
      list.length ? h('button', { type: 'button', class: 'btn small', onclick: () => { s.checkpoint(); delete s.map.markers; s.changed(); s.emit('ui'); } }, 'Clear all markers') : h('span'),
    ];
  }

  private zonesPanel(): HTMLElement[] {
    if (this.store.isBattleMap()) return this.markersPanel();
    const s = this.store, m = s.map, grid = s.zoneGrid();
    const used = new Set(grid.filter((c) => c !== '.'));
    for (const k of Object.keys(m.zones ?? {})) used.add(k);
    // The letters in use, plus the next free one.
    const letters = ZONE_LETTERS.filter((l) => used.has(l));
    const next = ZONE_LETTERS.find((l) => !used.has(l));
    if (next) letters.push(next);
    const edit = (fn: () => void) => { s.checkpoint(); fn(); s.changed(); s.emit('ui'); };
    const btn = (l: string) => h('button', { type: 'button', class: 'swatch zone-swatch', 'aria-pressed': String(s.safeMark === null && s.zoneLetter === l), title: l === '.' ? 'Erase' : `Zone ${l}`,
      onclick: () => { s.zoneLetter = l; s.safeMark = null; s.emit('ui'); } },
      h('span', { class: 'zone-chip', style: l === '.' ? '' : `background:${zoneColor(l)}` }, l === '.' ? '✕' : l),
      h('span', { class: 'swatch-name' }, l === '.' ? 'Erase' : m.zones?.[l]?.name || `Zone ${l}`),
      h('span', { class: 'swatch-note' }, l === '.' ? 'No random battles here.' : `${grid.filter((c) => c === l).length} tiles · ${m.zones?.[l]?.troops.length ?? 0} troop${(m.zones?.[l]?.troops.length ?? 0) === 1 ? '' : 's'}`));
    const out: HTMLElement[] = [];
    out.push(this.brush(), h('div', { class: 'section-label' }, 'Paint'), h('div', { class: 'swatches' }, ...letters.map(btn), btn('.')));
    // Safe zones: the opposite of spawns (no monsters, no battles, no weather), with rest spots for the party.
    const safeGrid = s.safeGrid();
    const safeBtn = (mark: string, name: string, note: string) => h('button', { type: 'button', class: 'swatch zone-swatch', 'aria-pressed': String(s.safeMark === mark), title: name,
      onclick: () => { s.safeMark = mark; s.emit('ui'); } },
      h('span', { class: 'zone-chip safe-chip', 'data-mark': mark }, ({ s: '◇', S: '🪑', L: '☾', M: '✦', T: '⚔', '.': '✕' } as Record<string, string>)[mark] ?? mark),
      h('span', { class: 'swatch-name' }, name),
      h('span', { class: 'swatch-note' }, mark === '.' ? note : `${safeGrid.filter((c) => c === mark).length} tiles · ${note}`));
    out.push(h('div', { class: 'section-label' }, 'Safe zones'),
      h('div', { class: 'swatches' }, ...SAFE_MARKS.map((k) => safeBtn(k.mark, k.name, k.note)), safeBtn('.', 'Erase safe ground', 'Back to ordinary ground.')));
    if (s.safeMark !== null) {
      out.push(h('p', { class: 'note' }, 'A safe zone keeps the elements out (no cold, heat or rain: the party is Comfortable), monsters never come into it, and there are no random battles on it. Paint its ground, then its spots: while the player is in the zone, each party member goes to a free spot they like (Database → Heroes → Rest preferences) and sits, lies down, practises magic or trains there, until the player leaves; then they fall in behind again. A training dummy spot: put a dummy prop just north of it.'));
      return out;
    }
    const l = s.zoneLetter;
    if (l === '.') {
      out.push(h('p', { class: 'note' }, 'Erase: tiles with no zone have no random battles. Pick a zone letter above to paint it and choose its troops.'));
      return out;
    }
    const troops = s.db.troops ?? [];
    const zone = m.zones?.[l];
    const ensure = () => ((m.zones ??= {})[l] ??= { troops: [] });
    out.push(h('div', { class: 'section-label' }, `Zone ${l}`),
      h('div', { class: 'field' }, h('label', {}, 'Name'), h('input', { type: 'text', value: zone?.name ?? '', placeholder: `Zone ${l}`, onchange: (e: Event) => edit(() => { const v = (e.target as HTMLInputElement).value.trim(); if (v) ensure().name = v; else if (m.zones?.[l]) delete m.zones[l].name; }) })),
      h('div', { class: 'field' }, h('label', {}, 'Battle map'), select([['', s.map.battleMap ? `The map’s (${s.map.battleMap})` : 'The map’s (flat battle screen)'], ...s.battleMapNames().map((n) => [n, n] as [string, string])], zone?.battleMap ?? '',
        (v) => edit(() => { if (v) ensure().battleMap = v; else if (m.zones?.[l]) delete m.zones[l].battleMap; }), { 'aria-label': `Zone ${l} battle map` }),
        h('div', { class: 'hint' }, 'Where battles in this zone are fought (a forest clearing, a beach…).')),
      h('div', { class: 'field' }, h('label', {}, 'Tiles between battles'), numberInput(zone?.steps ?? 30, (v) => edit(() => { const n = Math.max(4, Math.round(v)); if (n === 30) { if (m.zones?.[l]) delete m.zones[l].steps; } else ensure().steps = n; }), { min: 4, step: 1 }), h('div', { class: 'hint' }, 'About this far on average (it varies).')),
      levelRangeField('Enemy levels', () => zone?.levels, (v) => edit(() => { if (v) ensure().levels = v; else if (m.zones?.[l]) delete m.zones[l].levels; }), 'Each foe here rolls a level in this range (0: each enemy’s own). Early areas low, dangerous ones higher. A troop below can set its own.'));
    out.push(h('div', { class: 'section-label' }, `Zone ${l} troops`));
    if (!troops.length) {
      out.push(h('p', { class: 'note' }, 'No troops yet. A troop is a group of enemies that fight together (“2–3 slimes”). Make some in Database → Troops, then add them to this zone here.'),
        h('button', { type: 'button', class: 'btn small', onclick: () => openDatabase(s, 'troops') }, 'Open Database → Troops'));
      return out;
    }
    const tOpts = troops.map((t) => [t.id, t.name] as [string, string]);
    (zone?.troops ?? []).forEach((zt, k) => {
      const days = new Set(zt.days ?? []);
      out.push(h('div', { class: 'zone-troop' },
        h('div', { class: 'field-row' },
          select(tOpts, zt.troop, (v) => edit(() => (zt.troop = v)), { 'aria-label': `Troop ${k + 1}` }),
          h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove troop ${k + 1}`, onclick: () => edit(() => { zone!.troops.splice(k, 1); if (!zone!.troops.length && !zone!.name && !zone!.steps) delete m.zones![l]; }) }, '✕')),
        h('div', { class: 'field-row' },
          h('div', { class: 'field' }, h('label', {}, 'How often'), numberInput(zt.weight ?? 1, (v) => edit(() => { const w = Math.max(0, Math.round(v)); if (w === 1) delete zt.weight; else zt.weight = w; }), { min: 0, step: 1, 'aria-label': `Troop ${k + 1} weight` })),
          h('div', { class: 'field' }, h('label', {}, 'When'), select([['', 'Any time'], ['day', 'By day'], ['night', 'At night']], zt.time ?? '', (v) => edit(() => { if (v) zt.time = v as 'day' | 'night'; else delete zt.time; }), { 'aria-label': `Troop ${k + 1} time` }))),
        h('div', { class: 'zone-days', role: 'group', 'aria-label': 'Real-world days' }, ...WEEKDAY_SHORT.map((name, d) => h('button', { type: 'button', class: 'day-chip', 'aria-pressed': String(days.has(d)), title: 'Only on these real-world days (none: every day)',
          onclick: () => edit(() => { if (days.has(d)) days.delete(d); else days.add(d); const list = [...days].sort(); if (list.length) zt.days = list; else delete zt.days; }) }, name))),
        levelRangeField('Levels (this troop)', () => zt.levels, (v) => edit(() => { if (v) zt.levels = v; else delete zt.levels; }), 'Unset (0): the zone’s levels.'),
        h('div', { class: 'field' }, h('label', {}, 'Only while switch is ON'), h('input', { type: 'text', value: zt.switch ?? '', placeholder: 'Any (optional)', onchange: (e: Event) => edit(() => { const v = (e.target as HTMLInputElement).value.trim(); if (v) zt.switch = v; else delete zt.switch; }) }))));
    });
    if (!zone?.troops.length) out.push(h('p', { class: 'note' }, `No troops in zone ${l} yet: add one, or several with how often each comes.`));
    out.push(h('button', { type: 'button', class: 'btn small', onclick: () => edit(() => ensure().troops.push({ troop: tOpts[0][0] })) }, '+ Add troop'),
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => openDatabase(s, 'troops') }, 'Edit troops (Database)'),
      h('p', { class: 'note' }, 'Walking in this zone brings a battle now and then (turn-based battles), with one of these troops by how often each is set, among those allowed right then: by day or at night (game time), on the chosen real-world days of the week, or while a switch is on.'));
    return out;
  }

  private brush(): HTMLElement {
    const s = this.store;
    return h('div', { class: 'brush' }, h('span', { class: 'section-label' }, 'Brush'),
      h('div', { class: 'toolrow small' }, ...[1, 2, 3, 5].map((n) =>
        h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.brushSize === n), onclick: () => { s.brushSize = n; s.emit('ui'); } }, `${n}×${n}`))));
  }
}

/** A preset seen from above, for the palette. */
function buildingThumb(id: string): HTMLCanvasElement {
  const p = BUILDING_PRESETS.find((q) => q.id === id)!, v = p.values;
  const pad = 0.6, scale = Math.min(64 / ((v.w + pad * 2) * TS), 54 / ((v.d + pad * 2) * TS));
  const c = h('canvas', { class: 'sprite-thumb', width: Math.round((v.w + pad * 2) * TS * scale), height: Math.round((v.d + pad * 2) * TS * scale) });
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.scale(scale, scale);
  drawBuildingTop(ctx, { ...v, x: pad, z: pad }, 1);
  return c;
}

/** Copy that fits a 64×54 frame. */
function spriteThumb(src: HTMLCanvasElement, maxW = 64, maxH = 54): HTMLCanvasElement {
  // Small pixel art is enlarged with hard edges; large imported images are shrunk smoothly to fit.
  const k = Math.min(2.5, maxW / src.width, maxH / src.height);
  const c = h('canvas', { class: 'sprite-thumb', width: Math.max(1, Math.round(src.width * k)), height: Math.max(1, Math.round(src.height * k)) });
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = k < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const fmtTiles = (v: number) => (Math.abs(v - Math.round(v)) < 0.01 ? String(Math.round(v)) : v.toFixed(1));
