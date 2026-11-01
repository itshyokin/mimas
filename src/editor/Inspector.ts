import { switchInput } from './switchPicker';
import { build3D } from '../game/World3D';
import { readGroundModel } from '../world/groundModel';
import { modelExt } from '../render/models';
import type { EncounterPick, Volume3D } from '../world/types';
import { levelRangeField } from './levelFields';
import { TRANSITIONS, TRANSITION_NAMES } from '../ui/BattleTransition';
import { formatFishing, parseFishing } from '../world/fishing';
import type { Season } from '../world/seasons';
import { blockedTiles } from '../world/props';
/** Right panel: properties of the selection, or of the map when nothing is selected. */
import { elementSelect } from './elementFields';
import { eventH, eventW } from '../world/eventArea';
import { BORDER_KINDS, type Side, borderSides } from '../world/border';
import type { AreaLightData, BorderKind, BreakableDef, Command, Dir, EventData, MapBorder, MapEnvironment, EventPage, LightData, MapData, PointLightData, SpotLightData, Trigger } from '../world/types';
import { audioFiles, mapAudioFields, preview } from './audioEditor';
import { loopChoices } from '../audio/sfx';
import { CommandEditor, WEATHER_NAMES, conditionForm, conditionText, lockFields } from './CommandEditor';
import { checkbox, confirmModal, openModal, field, h, numberInput, select, textInput, toast } from './dom';
import { paletteProps, propName } from './editorArt';
import { lightFields } from './lightForm';
import { cliffChoices } from './assets';
import { BRICKS } from '../world/tiles';
import { type MapTheme, findTheme, mapThemes } from '../world/mapThemes';
import { type WaterCell, autoRampDir, autoCornerMask, formatHeights, formatWater, parseHeights, parseWater } from '../world/heights';
import { openPropImporter } from './PropImporter';
import type { EditorStore } from './store';
import { markerIcon, markerKinds } from '../world/landmarks';
import { CORNER_NAMES, type CornerName, type RampData, WEATHER_KINDS, type MistWhen, type BuildingData, type BuildingSide, type WeatherKind } from '../world/types';
import { BUILDING_DEFAULTS, doorstep, resolveBuilding } from '../world/buildingShape';
import { ROOF_CHOICES, WALL_CHOICES } from './buildingPresets';

const DIRS: [Dir, string][] = [['down', 'Down'], ['left', 'Left'], ['right', 'Right'], ['up', 'Up']];
const TRIGGERS: [Trigger, string][] = [
  ['action', 'Action button (talk / examine)'], ['touch', 'Player touch (step on it, or walk into it)'],
  ['auto', 'Autorun (runs once when page becomes active)'], ['none', 'None'],
];

type MapTab = 'general' | 'edges' | 'weather' | 'sound' | 'battles' | 'encounters';
const MAP_TABS: [MapTab, string, string][] = [
  ['general', 'General', '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>'],
  ['edges', 'Beyond the edges', '<path d="M3 3h18v18H3z"/><path d="M7 7h10v10H7z" stroke-dasharray="2 2"/>'],
  ['weather', 'Wind, weather & air', '<path d="M7 17a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 17z"/><path d="M8 20l1-2M12 21l1-2M16 20l1-2"/>'],
  ['sound', 'Sound', '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>'],
  ['battles', 'Battles', '<path d="M4 4l10 10M14 14l2 2M17 13l-4 4M20 4L10 14M10 14l-2 2M7 13l4 4"/>'],
  ['encounters', 'Random encounters', '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 19c0-3 2.7-5 6-5s6 2 6 5M12 15c1-.7 2.4-1 4-1 3.3 0 6 2 6 5"/>'],
];

export class Inspector {
  readonly el: HTMLElement;
  private readonly commands: CommandEditor;

  constructor(private readonly store: EditorStore) {
    // Update 150: a panel inside the left bar, shown while something is selected.
    this.el = h('section', { class: 'inspector-panel', 'aria-label': 'Selected' });
    this.commands = new CommandEditor(store);
    store.on('selection', () => this.render());
    store.on('structure', () => this.render());
    // The list of battle maps arrives once the project's maps are read.
    let kinds = '';
    store.on('meta', () => { const k = store.battleMapNames().join('|'); if (k !== kinds) { const first = !kinds && !k; kinds = k; if (!first) this.render(); } });
    // Keep the map summary current without rebuilding the form under the cursor.
    store.on('map', () => {
      const line = this.el.querySelector('.stats-line');
      if (line) line.textContent = this.counts();
    });
    this.render();
  }

  render(): void {
    const s = this.store;
    if (!s.map) return;
    const scroll = this.el.querySelector('.side-body')?.scrollTop ?? 0;
    const sel = s.selection;
    let content: HTMLElement[];
    if (sel?.kind === 'prop' && s.map.props[sel.index]) content = this.prop(sel.index);
    else if (sel?.kind === 'light' && s.map.lights[sel.index]) content = this.light(sel.index);
    else if (sel?.kind === 'building' && s.map.buildings?.[sel.index]) content = this.building(sel.index);
    else if (sel?.kind === 'event' && s.event(sel.id)) content = this.event(s.event(sel.id)!);
    else if (sel?.kind === 'start') content = this.start();
    else if (sel?.kind === 'tile') content = this.tile(sel.x, sel.z, sel.w ?? 1, sel.h ?? 1);
    else if (sel?.kind === 'ramp' && s.rampAt(sel.x, sel.z)) content = this.ramp(sel.x, sel.z);
    else if (sel?.kind === 'volume' && s.map.volumes?.some((v) => v.id === sel.id)) content = this.volume(sel.id);
    else content = this.lastSummary = this.mapSummary();
    const body = h('div', { class: 'side-body' }, ...content);
    this.el.replaceChildren(body);
    body.scrollTop = scroll;
    this.el.hidden = !sel || content === this.lastSummary;
    this.drawMapWindow();
    if (this.eventWin) {
      if (sel?.kind === 'event' && sel.id === this.eventWin.id) this.drawEventWindow();
      else this.eventWin.close();
    }
  }

  /**
   * Update 154: a 3D map: a whole place modelled in Blender (GLB), walked through in third person. Names in the scene
   * say what things are (collision, foliage, water, waterfalls, kill zones, the start): docs/BLENDER_3D_MAPS.md.
   */
  private scene3dFields(): HTMLElement[] {
    const s = this.store, m = s.map, g = m.scene3d;
    const choose = () => {
      const inp = h('input', { type: 'file', accept: '.glb' });
      inp.addEventListener('change', () => void (async () => {
        const f = inp.files?.[0]; if (!f) return;
        if (modelExt(f.name) !== 'glb') { toast('Export the scene from Blender as a .glb (glTF Binary).', 'error'); return; }
        const path = `assets/maps/${s.mapName}_3d.glb`;
        if (s.project.canSave && s.project.canStoreImages) {
          try { await s.project.writeFile(path, f); } catch (err) { toast(`Couldn’t save the scene: ${err instanceof Error ? err.message : String(err)}`, 'error'); return; }
        }
        s.files.set(path, f);
        this.edit(() => { m.scene3d = { ...(m.scene3d ?? {}), src: path }; }, true);
        // How big it is, so the map's tiles (for events, for now) can cover it.
        try {
          const url = URL.createObjectURL(f);
          const sc = build3D(await readGroundModel(url, f.name), m.scene3d?.scale ?? 1);
          URL.revokeObjectURL(url);
          const w = Math.ceil(sc.bounds.max.x), d = Math.ceil(sc.bounds.max.z);
          toast(w > m.width || d > m.height ? `The scene is ${w} × ${d} m: make the map at least that big (Width and Height above) so events can go anywhere on it.` : `The scene is ${w} × ${d} m, inside the map’s ${m.width} × ${m.height}.`);
        } catch { toast('The scene is set, but couldn’t be read here to measure it.', 'error'); }
      })());
      inp.click();
    };
    return [
      h('div', { class: 'section-label' }, '3D map (Blender scene)'),
      h('div', { class: 'slot' },
        h('div', { class: 'slot-head' }, h('span', { class: 'slot-label' }, 'Scene (GLB)'), g ? h('span', { class: 'slot-file', title: g.src }, g.src.split('/').pop()!) : h('span', { class: 'slot-none' }, 'None')),
        h('div', { class: 'slot-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: choose }, g ? 'Replace…' : 'Choose…'),
          g ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => this.edit(() => { delete m.scene3d; }, true) }, 'Remove') : null),
        h('p', { class: 'hint' }, 'A whole place modelled in Blender, walked through in third person (the camera orbits the hero). Names in the scene mark collision (_col), foliage (_foliage), water (_water), waterfalls (_waterfall), kill zones (_killzone) and the start: see docs/BLENDER_3D_MAPS.md. 1 Blender metre = 1 tile.')),
      ...(g ? [field('Scale', numberInput(g.scale ?? 1, (v) => this.edit(() => { const n = { ...m.scene3d! }; if (v > 0 && v !== 1) n.scale = v; else delete n.scale; m.scene3d = n; }, true), { step: 0.1, min: 0.01 }), 'Tiles per Blender metre (1 normally).')] : []),
    ];
  }

  /**
   * Update 153: a 3D model (GLB / FBX) as the map's ground and scenery. Its file is kept in assets/maps/; it's fitted
   * over the map unless a scale is set; the map's tiles still hold events, props, lights and passage on top of it.
   */
  private groundModelFields(): HTMLElement[] {
    const s = this.store, m = s.map, g = m.groundModel;
    const choose = () => {
      const inp = h('input', { type: 'file', accept: '.glb,.fbx' });
      inp.addEventListener('change', () => void (async () => {
        const f = inp.files?.[0]; if (!f) return;
        const ext = modelExt(f.name);
        if (!ext) { toast('Choose a .glb or .fbx model.', 'error'); return; }
        const path = `assets/maps/${s.mapName}.${ext}`;
        if (s.project.canSave && s.project.canStoreImages) {
          try { await s.project.writeFile(path, f); } catch (err) { toast(`Couldn’t save the model: ${err instanceof Error ? err.message : String(err)}`, 'error'); return; }
        }
        s.files.set(path, f);
        this.edit(() => { m.groundModel = { ...(m.groundModel ?? {}), src: path }; }, true);
        toast('The model is the ground now: the game walks on it; the map shows it from above.');
      })());
      inp.click();
    };
    const num = (k: 'scale' | 'rot' | 'y', v: number) => this.edit(() => { const n = { ...m.groundModel! }; if (!v && k !== 'scale') delete n[k]; else if (k === 'scale' && !(v > 0)) delete n.scale; else n[k] = v; m.groundModel = n; }, true);
    return [
      h('div', { class: 'section-label' }, '3D model ground'),
      h('div', { class: 'slot' },
        h('div', { class: 'slot-head' }, h('span', { class: 'slot-label' }, 'Model (GLB or FBX)'), g ? h('span', { class: 'slot-file', title: g.src }, g.src.split('/').pop()!) : h('span', { class: 'slot-none' }, 'None: painted tiles')),
        h('div', { class: 'slot-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: choose }, g ? 'Replace…' : 'Choose…'),
          g ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => this.edit(() => { delete m.groundModel; }, true) }, 'Remove') : null),
        h('p', { class: 'hint' }, 'A model of the whole place instead of painted tiles: walked on as it’s shaped (slopes, stairs, floors); steep places, walls and holes block. Events, props, lights and passage go on the map’s tiles over it as usual. Make the map’s size match the model’s footprint in tiles.')),
      ...(g ? [h('div', { class: 'field-row' },
        field('Scale', numberInput(g.scale ?? 0, (v) => num('scale', v), { step: 0.1, min: 0 }), 'Tiles per model unit; 0: fitted over the map.'),
        field('Turn', select([['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']], String(g.rot ?? 0), (v) => num('rot', Number(v)))),
        field('Raise', numberInput(g.y ?? 0, (v) => num('y', v), { step: 0.5 }), 'Up or down, in tiles.'))] : []),
    ];
  }

  /** The map summary shown when nothing is selected (kept hidden: Map Properties has it). */
  private lastSummary: HTMLElement[] | null = null;

  /** Apply a change as one undo step. */
  private edit(fn: () => void, rebuild = false): void {
    this.store.checkpoint();
    fn();
    if (rebuild) this.store.changed('structure'); else this.store.changed();
  }

  /** Map settings → Battles: a battle map's camera, or the battle map a field map's battles are fought on. */
  private battleFields(): HTMLElement[] {
    const s = this.store, m = s.map, battle = m.kind === 'battle';
    const setKind = (v: boolean) => {
      this.edit(() => { if (v) m.kind = 'battle'; else delete m.kind; });
      s.mapKinds.set(s.mapName, v ? 'battle' : 'field');
      s.emit('meta'); s.emit('ui');
      this.render();
    };
    const out: HTMLElement[] = [checkbox('This is a battle map', battle, setKind)];
    if (!battle) {
      const names = s.battleMapNames();
      out.push(field('Battle map', select([['', 'None: the flat battle screen'], ...names.map((n) => [n, n] as [string, string])], m.battleMap ?? '', (v) => this.edit(() => { if (v) m.battleMap = v; else delete m.battleMap; })),
        names.length ? 'Turn-based battles on this map are fought on this battle map (a zone in the Spawns layer can choose another).'
          : 'No battle maps yet: make a new map, tick “This is a battle map”, and place party and enemy markers on it (Spawns layer, key 9).'));
      // Single battle mode: how battles on this map come out unless a troop or event says.
      out.push(field('Single mode: battles here are', select([['', `The game’s default (Database → Combat)`], ...[['random', 'Wild encounter: one at random'], ['oneByOne', 'Trainer battle: one at a time'], ['full', 'Swarm: all at once']]] as [string, string][], m.encounterPick ?? '', (v) => this.edit(() => { if (v) m.encounterPick = v as EncounterPick; else delete m.encounterPick; })),
        'For Single battle mode: random battles, troops left on their default, enemies bumped into on the map and Start battle events left on their default all come out this way. Wild: one at random (an enemy bumped into fights alone). Trainer: one at a time. Swarm: all at once.'));
      // How battles here begin: one transition, or several picked at random (none chosen: any of them).
      const chosen = new Set(m.battleTransitions ?? []);
      out.push(h('div', { class: 'field' }, h('label', {}, 'Battle transition'),
        h('div', { class: 'zone-days', role: 'group', 'aria-label': 'Battle transitions' }, ...TRANSITIONS.map((k) => h('button', { type: 'button', class: 'day-chip', 'aria-pressed': String(chosen.has(k)),
          onclick: () => { this.edit(() => { if (chosen.has(k)) chosen.delete(k); else chosen.add(k); const list = TRANSITIONS.filter((x) => chosen.has(x)); if (list.length) m.battleTransitions = list; else delete m.battleTransitions; }); this.render(); } }, TRANSITION_NAMES[k]))),
        h('div', { class: 'hint' }, chosen.size === 0 ? 'None picked: any of them, at random.' : chosen.size === 1 ? 'Every battle here starts this way.' : 'One of these, at random.')));
      return out;
    }
    const cam = m.battleCamera ?? {};
    const setCam = (k: 'distance' | 'height' | 'side' | 'fov', v: number, def: number) => this.edit(() => {
      const c = { ...m.battleCamera, [k]: v };
      if (v === def) delete c[k];
      m.battleCamera = Object.keys(c).length ? c : undefined;
    });
    out.push(
      h('p', { class: 'hint' }, 'A stage for turn-based battles (a forest clearing, plains, a city street). Place where the party and the enemies stand in the Spawns layer (key 9). Field maps choose it under Battles → Battle map.'),
      h('div', { class: 'field-row' },
        field('Camera back', numberInput(cam.distance ?? 6, (v) => setCam('distance', Math.max(2, Math.min(30, v)), 6), { min: 2, max: 30, step: 0.5 }), 'Tiles behind the party.'),
        field('Camera up', numberInput(cam.height ?? 3.2, (v) => setCam('height', Math.max(0.5, Math.min(20, v)), 3.2), { min: 0.5, max: 20, step: 0.25 }), 'Tiles above the ground.')),
      h('div', { class: 'field-row' },
        field('Camera side', numberInput(cam.side ?? 0, (v) => setCam('side', Math.max(-10, Math.min(10, v)), 0), { min: -10, max: 10, step: 0.5 }), 'Tiles to the right (+) or left (−) of the party.'),
        field('View angle', numberInput(cam.fov ?? 40, (v) => setCam('fov', Math.max(20, Math.min(75, Math.round(v))), 40), { min: 20, max: 75, step: 1 }), 'Degrees: wider shows more.')),
      h('p', { class: 'hint' }, 'The camera backs off further if a crowd wouldn’t fit. Turning the view far from straight up the map makes trees and props look flat, so it stays within about 35°.'));
    return out;
  }

  /** Map settings → Random encounters (turn-based battles): which enemies, how often, how many, and where. */
  private encounterFields(): HTMLElement[] {
    const s = this.store, m = s.map, enemies = s.db.enemies ?? [];
    const t = m.encounters;
    const zones = Object.entries(m.zones ?? {}).filter(([, z]) => z.troops.length);
    const goSpawns = h('button', { type: 'button', class: 'btn small', onclick: () => { s.mode = 'zones'; s.emit('ui'); } }, 'Go to the Spawns layer');
    const how = h('p', { class: 'hint' }, `Paint encounter zones on the Spawns layer (key 9), then pick each zone’s troops (Database → Troops) below the zone letters.${zones.length ? ` This map has ${zones.length} zone${zones.length === 1 ? '' : 's'} with troops: ${zones.map(([k, z]) => z.name || `Zone ${k}`).join(', ')}.` : ''}`);
    // The older per-map list (before zones and troops): only shown on maps that still have one.
    if (!t || !enemies.length) return [how, goSpawns];
    const opts = enemies.map((e) => [e.id, e.name] as [string, string]);
    return [
      how, goSpawns,
      h('div', { class: 'section-label' }, 'Older random encounters list'),
      h('p', { class: 'hint' }, 'From before zones and troops: still used on tiles outside any painted zone. Remove it once your zones are set up.'),
      h('button', { type: 'button', class: 'btn small danger', onclick: () => { this.edit(() => delete m.encounters); this.render(); } }, 'Remove this list'),
      ...t.enemies.map((row, k) => h('div', { class: 'field-row' },
        select(opts, row.enemy, (v) => this.edit(() => (row.enemy = v)), { 'aria-label': `Encounter ${k + 1} enemy` }),
        field('How often', numberInput(row.weight ?? 1, (v) => this.edit(() => { const w = Math.max(0, Math.round(v)); if (w === 1) delete row.weight; else row.weight = w; }), { min: 0, step: 1, 'aria-label': `Encounter ${k + 1} weight` })),
        h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove encounter ${k + 1}`, onclick: () => { this.edit(() => { t.enemies.splice(k, 1); if (!t.enemies.length) delete m.encounters; }); this.render(); } }, '✕'))),
      h('button', { type: 'button', class: 'btn small', onclick: () => { this.edit(() => t.enemies.push({ enemy: enemies[0].id })); this.render(); } }, '+ Add enemy'),
      h('div', { class: 'field-row' },
        field('Tiles between battles', numberInput(t.steps ?? 30, (v) => this.edit(() => { const n = Math.max(4, Math.round(v)); if (n === 30) delete t.steps; else t.steps = n; }), { min: 4, step: 1 }), 'About this far on average (it varies).'),
        field('Enemies: at least', numberInput(t.min ?? 1, (v) => this.edit(() => { const n = Math.max(1, Math.min(3, Math.round(v))); if (n === 1) delete t.min; else t.min = n; }), { min: 1, max: 3, step: 1 })),
        field('at most', numberInput(t.max ?? 3, (v) => this.edit(() => { const n = Math.max(1, Math.min(3, Math.round(v))); if (n === 3) delete t.max; else t.max = n; }), { min: 1, max: 3, step: 1 }))),
      levelRangeField('Enemy levels', () => t.levels, (v) => this.edit(() => { if (v) t.levels = v; else delete t.levels; })),
      field('Only on terrain', textInput(t.terrain ?? '', (v) => this.edit(() => { const c = [...new Set(v.replace(/\s+/g, ''))].join(''); if (c) t.terrain = c; else delete t.terrain; }), { 'aria-label': 'Encounter terrain', placeholder: 'Anywhere' }),
        'Terrain characters, e.g. . for grass (the Terrain palette shows each tile’s character). Empty: anywhere on this map.'),
    ];
  }

  private header(title: string, sub?: string, onDelete?: () => void): HTMLElement {
    return h('header', { class: 'insp-head' },
      h('div', {}, h('h2', {}, title), sub ? h('div', { class: 'insp-sub' }, sub) : null),
      onDelete ? h('button', { type: 'button', class: 'btn danger small', onclick: onDelete }, 'Delete') : null);
  }

  /* ------------------------------------------------------------ map */

  /** Nothing selected: the map's name and counts, and the button for its settings window. */
  private mapSummary(): HTMLElement[] {
    const s = this.store;
    return [
      this.header('Map', `${s.mapName}.json`),
      h('button', { type: 'button', class: 'btn primary', onclick: () => this.openMapWindow() }, '⚙ Map Properties'),
      h('p', { class: 'hint' }, 'Name and size, look and lighting, weather, what lies beyond the edges, sound, battles and random encounters. Select something on the map to edit it here.'),
      h('p', { class: 'stats-line' }, this.counts()),
    ];
  }

  /** The map's settings, in a window with tabs (like the Database). */
  private mapWin: { tab: MapTab; body: HTMLElement; tabs: HTMLElement; close: () => void } | null = null;

  openMapWindow(tab: MapTab = 'general'): void {
    if (this.mapWin) { this.mapWin.tab = tab; this.drawMapWindow(); return; }
    const body = h('div', { class: 'db-editor map-win-body' }), tabs = h('div', { class: 'db-tabs db-icon-tabs map-win-tabs', role: 'tablist' });
    const close = openModal(`Map Properties: ${this.store.map.name || this.store.mapName}`, h('div', { class: 'db-wrap' }, h('div', { class: 'db-tabbar' }, tabs), body),
      [{ label: 'Done', primary: true }], () => {}, { wide: true, cls: 'db-modal map-props-modal' });
    this.mapWin = { tab, body, tabs, close: () => { close(); this.mapWin = null; } };
    // The window closes itself (Done, Esc, ✕): forget it.
    const overlay = body.closest('.overlay');
    new MutationObserver((_, obs) => { if (overlay && !overlay.isConnected) { this.mapWin = null; obs.disconnect(); } }).observe(document.body, { childList: true });
    this.drawMapWindow();
  }

  private drawMapWindow(): void {
    const w = this.mapWin;
    if (!w || !this.store.map) return;
    const battle = this.store.map.kind === 'battle';
    const list = MAP_TABS.filter(([id]) => !(battle && id === 'encounters'));
    if (!list.some(([id]) => id === w.tab)) w.tab = 'general';
    w.tabs.replaceChildren(...list.map(([id, label, icon]) => {
      const b = h('button', { type: 'button', role: 'tab', class: 'db-tab', title: label, 'aria-label': label, 'aria-selected': String(w.tab === id), onclick: () => { w.tab = id; this.drawMapWindow(); } });
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg><span>${label}</span>`;
      return b;
    }));
    const scroll = w.body.scrollTop;
    const content = w.tab === 'general' ? this.mapProps().slice(1)
      : w.tab === 'edges' ? [this.borderFields()]
      : w.tab === 'weather' ? this.weatherFields()
      : w.tab === 'sound' ? [h('div', { class: 'section-label' }, 'Sound'), ...mapAudioFields(this.store, this.store.map, (fn) => this.edit(fn), this.mapTheme())]
      : w.tab === 'battles' ? [h('div', { class: 'section-label' }, 'Battles'), ...this.battleFields()]
      : [h('div', { class: 'section-label' }, 'Random battles'), ...this.encounterFields()];
    w.body.replaceChildren(h('section', { class: 'db-section' }, ...content));
    w.body.scrollTop = scroll;
  }

  private mapProps(): HTMLElement[] {
    const s = this.store, m = s.map;
    let w = m.width, hgt = m.height;
    const resize = () => {
      if (w === m.width && hgt === m.height) return;
      this.edit(() => {
        const old = parseHeights(m.heights, m.width, m.height), next = new Int8Array(w * hgt);
        for (let z = 0; z < Math.min(hgt, m.height); z++) for (let x = 0; x < Math.min(w, m.width); x++) next[z * w + x] = old[z * m.width + x];
        m.heights = formatHeights(next, w, hgt) ?? undefined;
        const oldW = parseWater(m.water, m.width, m.height), nextW: (WaterCell | null)[] = new Array(w * hgt).fill(null);
        for (let z = 0; z < Math.min(hgt, m.height); z++) for (let x = 0; x < Math.min(w, m.width); x++) nextW[z * w + x] = oldW[z * m.width + x];
        m.water = formatWater(nextW, w, hgt) ?? undefined;
        if (m.fishing) {
          const oldF = parseFishing(m.fishing, m.width, m.height), nextF: (number | null)[] = new Array(w * hgt).fill(null);
          for (let z = 0; z < Math.min(hgt, m.height); z++) for (let x = 0; x < Math.min(w, m.width); x++) nextF[z * w + x] = oldF[z * m.width + x];
          m.fishing = formatFishing(nextF, w, hgt) ?? undefined;
        }
        m.ramps = m.ramps?.filter((r) => r.x < w && r.z < hgt);
        m.terrain = Array.from({ length: hgt }, (_, z) => (m.terrain[z] ?? '').padEnd(w, '.').slice(0, w));
        if (m.upper) {
          const rows = Array.from({ length: hgt }, (_, z) => (m.upper![z] ?? '').padEnd(w, ' ').slice(0, w));
          m.upper = rows.some((r) => r.trim()) ? rows : undefined;
        }
        if (m.heightStyles) {
          const rows = Array.from({ length: hgt }, (_, z) => (m.heightStyles![z] ?? '').padEnd(w, '.').slice(0, w));
          m.heightStyles = rows.some((r) => /[^.]/.test(r)) ? rows : undefined;
        }
        if (m.passage) {
          const rows = Array.from({ length: hgt }, (_, z) => (m.passage![z] ?? '').padEnd(w, '.').slice(0, w));
          m.passage = rows.some((r) => /[^.]/.test(r)) ? rows : undefined;
        }
        if (m.zoneGrid) {
          const rows = Array.from({ length: hgt }, (_, z) => (m.zoneGrid![z] ?? '').padEnd(w, '.').slice(0, w));
          m.zoneGrid = rows.some((r) => /[^.]/.test(r)) ? rows : undefined;
        }
        if (m.safeGrid) {
          const rows = Array.from({ length: hgt }, (_, z) => (m.safeGrid![z] ?? '').padEnd(w, '.').slice(0, w));
          m.safeGrid = rows.some((r) => /[^.]/.test(r)) ? rows : undefined;
        }
        m.width = w; m.height = hgt;
        m.props = m.props.filter((p) => p.x < w && p.z < hgt);
        m.lights = m.lights.filter((l) => l.x < w && l.z < hgt);
        if (m.buildings) { m.buildings = m.buildings.filter((b) => b.x + b.w <= w && b.z + b.d <= hgt); if (!m.buildings.length) delete m.buildings; }
      }, true);
    };
    return [
      this.header('Map', `${s.mapName}.json`),
      field('Display name', textInput(m.name, (v) => this.edit(() => (m.name = v)))),
      // Update 152: a folder for the map list (kept in the Database, so it travels with the project).
      (() => {
        const folders = s.db.mapFolders ?? {}, names = [...new Set(Object.values(folders))].sort();
        const list = h('datalist', { id: 'map-folder-names' }, ...names.map((n) => h('option', { value: n })));
        return field('Folder', h('div', {}, textInput(folders[s.mapName] ?? '', (v) => {
          s.checkpoint();
          const f = { ...(s.db.mapFolders ?? {}) }, name = v.trim();
          if (name) f[s.mapName] = name; else delete f[s.mapName];
          if (Object.keys(f).length) s.db.mapFolders = f; else delete s.db.mapFolders;
          s.changedDb();
        }, { list: 'map-folder-names', placeholder: 'No folder' }), list), 'Groups this map with others in the map list (Town, Dungeons, Battle maps…). Empty: no folder.');
      })(),
      h('div', { class: 'field-row' },
        field('Width', numberInput(m.width, (v) => (w = Math.round(Math.min(128, Math.max(8, v)))), { min: 8, max: 128, step: 1 })),
        field('Height', numberInput(m.height, (v) => (hgt = Math.round(Math.min(128, Math.max(8, v)))), { min: 8, max: 128, step: 1 }))),
      h('button', { type: 'button', class: 'btn small', onclick: resize }, 'Apply size'),
      h('p', { class: 'hint' }, 'Resizing keeps the top-left corner. Anything outside the new size is removed.'),
      field('Theme', select([['', 'None'], ...mapThemes(s.db.mapThemes).map((t) => [t.id, t.name] as [string, string])], m.theme ?? '', (v) => this.edit(() => { if (v) m.theme = v; else delete m.theme; }, true)),
        'Database → Map themes: the edges, cliffs, lighting, music, sounds, wind, weather and air this kind of map has. Settings left on “Theme default” follow the theme; change one to override it here.'),
      // Update 148: height implied by the tiles (RPG Maker) or real 3D heights.
      field('Height', select([['', `Follow the view mode (now ${s.db.viewMode === '2d' ? 'flat: 2D mode' : 'real 3D heights: 3D mode'})`], ['flat', 'Implied by the tiles (flat, like RPG Maker)'], ['3d', 'Real 3D heights (the Heights layer)']],
        m.heightMode ?? '', (v) => this.edit(() => { if (v) m.heightMode = v as 'flat' | '3d'; else delete m.heightMode; })),
        'Flat: cliffs and stairs are drawn by the tiles (autotiles, walls) and everything stays at one height; the Heights layer is kept but not used, so you can switch back any time.'),
      ...this.scene3dFields(),
      ...this.groundModelFields(),
      field('Cliff walls', this.themed(cliffChoices(s), m.cliffTile && s.tiles.isCliffLook(m.cliffTile) ? m.cliffTile : m.cliffTile === undefined ? undefined : BRICKS, 'cliffTile', BRICKS,
        (v) => this.edit(() => { if (v === undefined) delete m.cliffTile; else m.cliffTile = v; })),
        'What cliff walls on this map look like. A tile can choose its own in the Terrain palette.'),
      field('Lighting', this.themed([['outdoor', 'Outdoor'], ['indoor', 'Indoor'], ['dark', 'Dark (cave, dungeon)']], m.environment, 'environment', 'outdoor',
        (v) => this.edit(() => { if (v === undefined) delete m.environment; else m.environment = v as MapEnvironment; })),
        'Outdoor: the full day and night. Indoor: muted; windows show daylight and go dark at night. Dark: dark at any hour, only lights show.'),
      field('Season', this.themed([['', 'The day’s season (Database → Time)'], ['spring', 'Always spring'], ['summer', 'Always summer'], ['autumn', 'Always autumn'], ['winter', 'Always winter (snow, ice)']], m.season, 'season', '',
        (v) => this.edit(() => { if (v) m.season = v as Season; else delete m.season; })),
        'Outdoor maps: grass and leaves follow the season. Winter brings snow, bare trees and ice on still water.'),
      h('div', { class: 'section-label' }, 'Game start'),
      field('Starting hour', numberInput(s.db.startHour, (v) => { s.checkpoint(); s.db.startHour = Math.min(23.75, Math.max(0, v)); s.changedDb(); }, { min: 0, max: 23.75, step: 0.25 }), 'Time of day when a new game begins (0 – 23.75; 18.5 is 6:30 PM). Clock speed and night darkness are in Database → Time.'),
      h('p', { class: 'hint' }, s.startHere ? 'The player starts on this map. Select it in the Events layer to move it.' : `The player starts on “${s.db.startMap}”. To start here, select a tile in the Events layer and choose “Move player start here”.`),
      h('p', { class: 'stats-line' }, this.counts()),
    ];
  }

  /** Where the map's water is set up now (the Water tab). */
  private waterFields(_m: MapData): HTMLElement[] {
    return [h('div', { class: 'section-label' }, 'Water'),
      h('p', { class: 'hint' }, 'Colour, clarity, surface, current and glow are set per pool in the Water tab (key 8): a pond, a stream and a lava pool can share a map.')];
  }

  /** The breeze and the weather. */
  private weatherFields(): HTMLElement[] {
    const m = this.store.map, theme = this.mapTheme(), outdoor = (m.environment ?? theme?.environment ?? 'outdoor') === 'outdoor';
    const strength = m.wind?.strength ?? theme?.wind ?? (outdoor ? 0.3 : 0);
    const setWind = (k: 'strength' | 'dir', v: number | undefined) => this.edit(() => {
      const w: { strength?: number; dir?: number } = { ...m.wind, [k]: v };
      if (w.strength === undefined || (theme?.wind === undefined && w.strength === (outdoor ? 0.3 : 0))) delete w.strength;
      if (w.dir === undefined || w.dir === 15) delete w.dir;
      m.wind = Object.keys(w).length ? w : undefined;
    });
    const near = (x: number, steps: number[]) => String(steps.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a)));
    const AIR: [string, string][] = [['0', 'None'], ['0.3', 'Light'], ['0.6', 'Medium'], ['1', 'Thick']];
    const airSelect = (label: string, key: 'haze' | 'mist' | 'rays' | 'clouds') => {
      const tv = theme?.atmosphere?.[key], own = m.atmosphere?.[key];
      const opts: [string, string][] = tv !== undefined ? [['@theme', `Theme default (${AIR.find(([v]) => v === near(tv, [0, 0.3, 0.6, 1]))![1]})`], ...AIR] : AIR;
      return field(label, select(opts, own === undefined && tv !== undefined ? '@theme' : near(own ?? 0, [0, 0.3, 0.6, 1]), (v) => this.edit(() => {
        const a: NonNullable<typeof m.atmosphere> = { ...m.atmosphere };
        if (v === '@theme') delete a[key]; else a[key] = Number(v);
        if (!a[key] && tv === undefined) delete a[key];
        m.atmosphere = Object.keys(a).length ? a : undefined;
      })));
    };
    // Weather: shared by every outdoor map, unless this map has its own (Unique weather), maybe shared with a zone.
    const st = this.store, unique = m.uniqueWeather ?? (m.weather !== undefined || !!theme?.weather);
    const own = unique ? m.weather ?? theme?.weather : st.db.weather;
    const setOwn = (fn: (w: { kind: WeatherKind; amount?: number } | undefined) => { kind: WeatherKind; amount?: number } | undefined) => {
      if (unique) this.edit(() => { const w = fn(m.weather ?? (theme?.weather ? { ...theme.weather } : undefined)); if (w) { m.weather = w; m.uniqueWeather = true; } else delete m.weather; }, true);
      else { st.checkpoint(); const w = fn(st.db.weather); if (w) st.db.weather = w; else delete st.db.weather; st.changedDb('structure'); }
    };
    const kind = own?.kind ?? 'none';
    const amount = numberInput(own?.amount ?? 1, (v) => setOwn((w) => {
      if (!w) return w;
      const a = Math.max(0.1, Math.min(2, Math.round(v * 10) / 10)), out = { ...w };
      if (a === 1) delete out.amount; else out.amount = a;
      return out;
    }), { min: 0.1, max: 2, step: 0.1 });
    const amountField = field('How heavy', amount, '1 is normal; 0.3 light, 2 heavy.');
    amountField.hidden = kind === 'none';
    const weatherRow = h('div', { class: 'field-row' },
      field(unique ? 'Weather' : 'Shared weather at the start', select(WEATHER_KINDS.map((k) => [k, WEATHER_NAMES[k]] as [string, string]), kind,
        (v) => setOwn((w) => (v === 'none' ? (unique ? { kind: 'none' } : undefined) : { ...w, kind: v as WeatherKind })))),
      amountField);
    const weatherParts: HTMLElement[] = [
      checkbox(theme?.weather ? 'Unique weather (on by the theme: its maps share it)' : 'Unique weather (its own, not the shared outdoor weather)', unique, (v) => this.edit(() => {
        if (v) { if (theme?.weather) delete m.uniqueWeather; else { m.uniqueWeather = true; m.weather ??= { kind: 'none' }; } }
        else { if (theme?.weather) m.uniqueWeather = false; else delete m.uniqueWeather; delete m.weather; delete m.weatherZone; }
      }, true)),
      ...(unique ? [field('Weather zone', textInput(m.weatherZone ?? '', (v) => this.edit(() => { if (v.trim()) m.weatherZone = v.trim(); else delete m.weatherZone; })),
        'Optional. Maps with the same zone name share their weather with each other (desert, mountains): a change on one shows on all of them. Blank: this map alone.')] : []),
      weatherRow,
      field(theme?.tempOffset !== undefined && m.tempOffset === undefined ? `Climate (°F; theme: ${theme.tempOffset > 0 ? '+' : ''}${theme.tempOffset})` : 'Climate (°F warmer or colder)',
        numberInput(m.tempOffset ?? theme?.tempOffset ?? 0, (v) => this.edit(() => { const r = Math.round(v); if (r || theme?.tempOffset !== undefined) m.tempOffset = r; else delete m.tempOffset; if (theme?.tempOffset === r) delete m.tempOffset; }), { step: 1 }),
        'A desert +15, a mountain top −20: added to the season’s temperature here. The shared weather still changes by itself (Database → Weather) unless this map has Unique weather.'),
      field('Temperature', select([['', outdoor ? 'Follows outside (season, hour, weather)' : 'Usual (indoors 68°F, caves 55°F)'], ['fixed', 'Its own (a cave, a house)']], m.fixedTemp !== undefined ? 'fixed' : '',
        (v) => this.edit(() => { if (v) m.fixedTemp = outdoor ? 60 : (m.environment === 'indoor' ? 68 : 55); else delete m.fixedTemp; }, true)),
        'Its own: it wanders a few degrees but never into another range (a warm cave never turns sweltering). For heroes’ cold and heat (Database → Weather & temperature → On the body).'),
      ...(m.fixedTemp !== undefined ? [field('°F', numberInput(m.fixedTemp, (v) => this.edit(() => { m.fixedTemp = Math.max(-40, Math.min(140, Math.round(v))); }), { step: 1, min: -40, max: 140 }),
        'A warm house 68, a cool cave 50, an ice cave 20, a lava cave 105.')] : []),
      checkbox('Damp (a wet cave, a cellar): it slowly soaks whoever is in it', !!m.damp, (v) => this.edit(() => { if (v) m.damp = true; else delete m.damp; })),
      checkbox('Keep the elements out (a cozy town): nobody gets cold, hot or wet here', !!m.noElements, (v) => this.edit(() => { if (v) m.noElements = true; else delete m.noElements; })),
      h('p', { class: 'hint' }, unique
        ? 'This map keeps its own weather (or its zone’s), whatever the weather is on other maps. Good for deserts, mountaintops, a magic storm.'
        : outdoor ? 'Shared: every outdoor map without Unique weather has the same weather, so it’s still raining when the player steps into the next map. This is the weather a new game starts with (it’s the same setting on every shared map). Events change it with “Change weather”.'
          : 'Indoor and dark maps show no weather unless they have Unique weather (the shared outdoor weather carries on outside).'),
    ];
    return [
      h('div', { class: 'section-label' }, 'Wind, weather and air'),
      h('div', { class: 'field-row' },
        field('Wind', (() => {
          const W: [string, string][] = [['0', 'Calm'], ['0.15', 'Light air'], ['0.3', 'Breeze'], ['0.6', 'Windy'], ['1', 'Gale']], steps = [0, 0.15, 0.3, 0.6, 1];
          const tw = theme?.wind, opts: [string, string][] = tw !== undefined ? [['@theme', `Theme default (${W.find(([v]) => v === near(tw, steps))![1]})`], ...W] : W;
          return select(opts, tw !== undefined && m.wind?.strength === undefined ? '@theme' : near(strength, steps), (v) => setWind('strength', v === '@theme' ? undefined : Number(v)));
        })()),
        field('Blowing towards', select([['0', 'East →'], ['45', 'South-east ↘'], ['90', 'South ↓'], ['135', 'South-west ↙'], ['180', 'West ←'], ['225', 'North-west ↖'], ['270', 'North ↑'], ['315', 'North-east ↗'], ['15', 'Default (east)']],
          String(m.wind?.dir ?? 15), (v) => setWind('dir', Number(v))))),
      h('p', { class: 'hint' }, 'Trees, bushes, grass and flowers sway with the wind (set per prop in its Behaviour tab).'),
      ...weatherParts,
      h('div', { class: 'field-row' },
        airSelect('Distance haze', 'haze'),
        airSelect('Sun rays', 'rays')),
      h('div', { class: 'field-row' },
        airSelect('Ground mist', 'mist'),
        field('Mist when', select([['always', 'All day'], ['morning', 'Mornings (dawn till 9)'], ['night', 'At night']], m.atmosphere?.mistWhen ?? 'always', (v) => this.edit(() => {
          const a: NonNullable<typeof m.atmosphere> = { ...m.atmosphere, mistWhen: v as MistWhen };
          if (v === 'always') delete a.mistWhen;
          m.atmosphere = Object.keys(a).length ? a : undefined;
        })))),
      h('div', { class: 'field-row' }, airSelect('Moving shadows', 'clouds'),
        field('Shadows of', select([['clouds', 'Drifting clouds'], ['canopy', 'A tree canopy (dappled shade)'], ['beams', 'Beams of light']], m.atmosphere?.shadowKind ?? 'clouds', (v) => this.edit(() => {
          const a: NonNullable<typeof m.atmosphere> = { ...m.atmosphere };
          if (v === 'clouds') delete a.shadowKind; else a.shadowKind = v as 'canopy' | 'beams';
          m.atmosphere = Object.keys(a).length ? a : undefined;
        })))),
      ...this.waterFields(m),
      h('p', { class: 'hint' }, 'Cloud shadows drift across the ground with the wind while the sun is out (fainter in rain, gone at night). Haze fades distant things into the sky colour. Mist lies low over the ground and veils feet. Sun rays slant down along the sunlight (gold at dawn and dusk, gone at night and in rain); on indoor maps they fall as if through windows by day. All of this shows in playtests, not in the editor.'),
    ];
  }

  /** What lies beyond each edge of the map. */
  /** The map's theme (Database → Map themes), if it has one. */
  private mapTheme(): MapTheme | undefined { return findTheme(this.store.db.mapThemes, this.store.map.theme); }

  /**
   * A select for a setting a theme can give: with a theme that sets it, a “Theme default (…)” choice (the map's value
   * left unset) comes first, and every other choice is stored as is. Without one, choosing `plain` clears it as before.
   */
  private themed(opts: [string, string][], value: string | undefined, key: keyof MapTheme, plain: string, set: (v: string | undefined) => void): HTMLSelectElement {
    const t = this.mapTheme(), tv = t?.[key] as string | undefined;
    if (tv === undefined) return select(opts, value ?? plain, (v) => set(v === plain ? undefined : v));
    const label = opts.find(([o]) => o === tv)?.[1] ?? (tv || 'none');
    return select([['@theme', `Theme default (${label})`], ...opts], value === undefined ? '@theme' : value, (v) => set(v === '@theme' ? undefined : v));
  }

  private borderFields(): HTMLElement {
    const m = this.store.map, theme = this.mapTheme(), themed = theme?.border !== undefined && !m.border;
    const sides = borderSides(themed ? { kind: theme!.border, seed: 1 } : m.border);
    const set = (side: Side | 'all', kind: BorderKind) => this.edit(() => {
      const next: MapBorder = { seed: m.border?.seed ?? Math.floor(Math.random() * 1000), ...(side === 'all' ? { n: kind, s: kind, w: kind, e: kind } : { ...sides, [side]: kind }) };
      // Store compactly: one kind when every side matches, and nothing at all for plain grass (unless a theme would
      // put something else there).
      const k = [next.n, next.s, next.w, next.e];
      if (k.every((x) => x === k[0])) m.border = k[0] === 'grass' && theme?.border === undefined ? undefined : { kind: k[0], seed: next.seed };
      else m.border = next;
    }, true);
    const sideSelect = (side: Side, label: string) => field(label, select(BORDER_KINDS, sides[side], (v) => set(side, v as BorderKind)));
    const same = [sides.n, sides.s, sides.w, sides.e].every((k) => k === sides.n);
    const themeOpt: [string, string][] = theme?.border !== undefined ? [['@theme', `Theme default (${BORDER_KINDS.find(([k]) => k === theme.border)?.[1] ?? theme.border})`]] : [];
    return h('div', { class: 'border-fields' },
      h('div', { class: 'section-label' }, 'Beyond the map edge'),
      field('All sides', select([...themeOpt, ...(same ? [] : [['mixed', 'Mixed'] as [string, string]]), ...BORDER_KINDS], themed ? '@theme' : same ? sides.n : 'mixed', (v) => {
        if (v === '@theme') this.edit(() => { delete m.border; }, true);
        else if (v !== 'mixed') set('all', v as BorderKind);
      })),
      h('div', { class: 'field-row' }, sideSelect('n', 'Top'), sideSelect('s', 'Bottom')),
      h('div', { class: 'field-row' }, sideSelect('w', 'Left'), sideSelect('e', 'Right')),
      h('p', { class: 'hint' }, 'Scenery outside the map, seen at its edges. The bottom side is kept low and sparse so it doesn’t hide the map.'));
  }

  private counts(): string {
    const m = this.store.map, b = m.buildings?.length ?? 0;
    return `${m.props.length} props · ${m.lights.length} lights · ${b ? `${b} building${b === 1 ? '' : 's'} · ` : ''}${m.events.length} events`;
  }

  /* ------------------------------------------------------------ building */

  private building(i: number): HTMLElement[] {
    const s = this.store, b = s.map.buildings![i], r = resolveBuilding(b);
    const imported = s.tiles.all().filter((t) => t.image).map((t) => [t.key, `${t.name} (imported tile)`] as [string, string]);
    const looks = (base: [string, string][], cur: string) => {
      const out = [...base, ...imported];
      if (!out.some(([k]) => k === cur)) out.push([cur, `${cur} (missing)`]);
      return out;
    };
    // Move or resize, unless it would overlap another building or leave the map.
    const place = (next: Partial<BuildingData>) => {
      const n = { x: b.x, z: b.z, w: b.w, d: b.d, ...next };
      n.w = Math.max(1, Math.round(n.w)); n.d = Math.max(1, Math.round(n.d)); n.x = Math.round(n.x); n.z = Math.round(n.z);
      if (!s.buildingFits(n, i)) { toast('It would overlap another building or leave the map.', 'error'); this.render(); return; }
      this.edit(() => {
        Object.assign(b, n);
        for (const o of b.doors ?? []) o.at = Math.min(o.at, (o.side === 'front' || o.side === 'back' ? b.w : b.d) - 1);
      }, true);
    };
    const opt = <K extends keyof BuildingData>(key: K, v: BuildingData[K] | undefined, rebuild = false) =>
      this.edit(() => { if (v === undefined) delete b[key]; else b[key] = v; }, rebuild);
    const SIDES: [BuildingSide, string][] = [['front', 'Front (facing the camera)'], ['back', 'Back'], ['left', 'Left'], ['right', 'Right']];
    // The Transfer event in front of a door: select it if there is one, else make one.
    const entrance = (o: { side: BuildingSide; at: number }) => {
      const [x, z] = doorstep(b, o);
      if (!s.inMap(x, z)) { toast('That door faces the edge of the map.', 'error'); return; }
      const ev = s.eventAt(x, z);
      s.mode = 'events';
      if (ev) { s.select({ kind: 'event', id: ev.id }); s.emit('ui'); return; }
      const id = s.nextEventId(), other = s.maps.find((n) => n !== s.mapName) ?? s.mapName;
      const cmd: Command = { cmd: 'transfer', map: other, x: 0, z: 0 };
      const created: EventData = { id, name: `${b.name || 'Door'} → ${other}`, x, z, pages: [{ trigger: 'touch', commands: [cmd] }] };
      s.checkpoint();
      s.map.events.push(created);
      s.changed('structure');
      s.select({ kind: 'event', id });
      s.emit('ui');
      this.commands.editCommand(cmd, created.pages[0].commands);
    };
    const doors = b.doors ?? [];
    const doorRow = (o: { side: BuildingSide; at: number }, k: number) => {
      const len = o.side === 'front' || o.side === 'back' ? b.w : b.d;
      const [dx, dz] = doorstep(b, o), ev = s.inMap(dx, dz) ? s.eventAt(dx, dz) : undefined;
      return h('div', { class: 'credit-row' },
        h('div', { class: 'credit-fields' },
          h('div', { class: 'field-row' },
            field('Wall', select(SIDES, o.side, (v) => this.edit(() => { o.side = v as BuildingSide; o.at = Math.min(o.at, (v === 'front' || v === 'back' ? b.w : b.d) - 1); }, true))),
            field(o.side === 'left' || o.side === 'right' ? 'Tile from top' : 'Tile from left', numberInput(o.at, (v) => this.edit(() => (o.at = Math.max(0, Math.min(len - 1, Math.round(v)))), true), { min: 0, max: len - 1, step: 1 }))),
          h('button', { type: 'button', class: 'btn small', onclick: () => entrance(o) }, ev ? `Edit entrance event (${ev.name})` : 'Add entrance (Transfer event)')),
        h('div', { class: 'credit-btns' }, h('button', { type: 'button', class: 'btn small danger', onclick: () => this.edit(() => { doors.splice(k, 1); if (!doors.length) delete b.doors; }, true) }, 'Remove')));
    };
    const pitched = r.roofStyle !== 'flat';
    return [
      this.header(b.name || 'Building', `${b.w} × ${b.d} tiles at ${b.x}, ${b.z}`, () => this.edit(() => { s.map.buildings!.splice(i, 1); if (!s.map.buildings!.length) delete s.map.buildings; s.select(null); }, true)),
      field('Name', textInput(b.name ?? '', (v) => opt('name', v.trim() || undefined)), 'Only shown in the editor.'),
      h('div', { class: 'field-row' },
        field('X', numberInput(b.x, (v) => place({ x: v }), { step: 1 })),
        field('Z', numberInput(b.z, (v) => place({ z: v }), { step: 1 }))),
      h('div', { class: 'field-row' },
        field('Width', numberInput(b.w, (v) => place({ w: v }), { min: 1, max: 32, step: 1 })),
        field('Depth', numberInput(b.d, (v) => place({ d: v }), { min: 1, max: 32, step: 1 }))),
      h('div', { class: 'section-label' }, 'Look'),
      field('Walls', select(looks(WALL_CHOICES, r.wall), r.wall, (v) => opt('wall', v === BUILDING_DEFAULTS.wall ? undefined : v, true))),
      field('Roof', select(looks(ROOF_CHOICES, r.roof), r.roof, (v) => opt('roof', v === BUILDING_DEFAULTS.roof ? undefined : v, true)),
        imported.length ? 'Imported tiles work too: walls and roofs repeat them like the ground does.' : 'Tiles you import (Terrain layer) can be used for walls and roofs too.'),
      h('div', { class: 'field-row' },
        field('Wall height', numberInput(r.height, (v) => opt('height', Math.max(1, Math.min(12, Math.round(v * 2) / 2))), { min: 1, max: 12, step: 0.5 })),
        field('Windows', select([['none', 'None'], ['few', 'A few'], ['many', 'Many']], r.windows, (v) => opt('windows', v as BuildingData['windows'])))),
      h('div', { class: 'section-label' }, 'Roof'),
      h('div', { class: 'field-row' },
        field('Shape', select([['gable', 'Gable (two slopes)'], ['hip', 'Hip (four slopes)'], ['flat', 'Flat']], r.roofStyle, (v) => opt('roofStyle', v as BuildingData['roofStyle'], true))),
        pitched ? field('Ridge runs', select([['auto', 'Automatic'], ['x', 'Across (left–right)'], ['z', 'Up the map']], b.ridge ?? 'auto', (v) => opt('ridge', v === 'auto' ? undefined : (v as 'x' | 'z'), true))) : h('span')),
      h('div', { class: 'field-row' },
        pitched ? field('Rise', numberInput(r.pitch, (v) => opt('pitch', Math.max(0.25, Math.min(8, Math.round(v * 4) / 4))), { min: 0.25, max: 8, step: 0.25 })) : h('span'),
        field('Overhang', numberInput(r.overhang, (v) => opt('overhang', Math.max(0, Math.min(1.5, Math.round(v * 20) / 20))), { min: 0, max: 1.5, step: 0.05 }))),
      pitched && b.pitch !== undefined ? h('button', { type: 'button', class: 'btn small', onclick: () => opt('pitch', undefined, true) }, 'Automatic rise') : h('span'),
      h('div', { class: 'section-label' }, `Doors (${doors.length})`),
      ...doors.map(doorRow),
      h('button', { type: 'button', class: 'btn small', onclick: () => this.edit(() => (b.doors = [...doors, { side: 'front', at: Math.floor((b.w - 1) / 2) }]), true) }, '+ Add a door'),
      h('p', { class: 'hint' }, 'Sizes are in tiles. The building blocks every tile it stands on. Interiors are separate maps: “Add entrance” puts a Transfer event on the tile in front of the door (dashed orange on the map) — choose the interior map and where to arrive.'),
    ];
  }

  /* ------------------------------------------------------------ prop / light / start / tile */

  private prop(i: number): HTMLElement[] {
    const s = this.store, p = s.map.props[i];
    const def = s.catalog.get(p.type);
    const types = paletteProps().map((d) => [d.id, d.name] as [string, string]);
    if (!def) types.unshift([p.type, `${p.type} (missing)`]);
    const notes: string[] = [];
    const nb = def ? blockedTiles(def, p.x, p.z, p.s ?? 1, s.propStep).length : 0;
    if (def?.foot) notes.push(`Covers ${def.foot.w} × ${def.foot.d} tile${def.foot.w * def.foot.d === 1 ? '' : 's'}; ${nb ? `${nb} solid` : 'all walkable'}.`);
    else if (nb) notes.push(`Blocks ${nb} tile${nb === 1 ? '' : 's'}.`);
    else if (def) notes.push('Doesn’t block movement.');
    if (def?.light) notes.push('Carries a light.');
    if (def?.glow) notes.push('Windows glow at night.');
    return [
      this.header(propName(p.type), def?.image ? 'Imported prop' : 'Prop', () => this.edit(() => { s.map.props.splice(i, 1); s.select(null); })),
      field('Type', select(types, p.type, (v) => this.edit(() => (p.type = v)))),
      h('div', { class: 'field-row' },
        field('X', numberInput(p.x, (v) => this.moveProp(i, v, p.z), { step: 0.1 })),
        field('Z', numberInput(p.z, (v) => this.moveProp(i, p.x, v), { step: 0.1 }))),
      field('Scale', numberInput(p.s ?? 1, (v) => this.edit(() => { const sc = Math.min(3, Math.max(0.3, v)); if (Math.abs(sc - 1) < 0.001) delete p.s; else p.s = sc; }), { step: 0.05, min: 0.3, max: 3 })),
      // Update 144: which draws on top where props overlap.
      field('Layer (0 on top … 25 ground)', numberInput(p.layer ?? def?.layer ?? 25, (v) => this.edit(() => { const l = Math.max(0, Math.min(25, Math.round(v))); if (l === (def?.layer ?? 25)) delete p.layer; else p.layer = l; }), { step: 1, min: 0, max: 25 })),
      h('p', { class: 'hint' }, `Positions are in tiles; .5 is the centre of a tile. ${notes.join(' ')}`),
      def ? h('button', { type: 'button', class: 'btn small', onclick: () => void openPropImporter(s, def) },
        def.image ? `Edit “${def.name}” (all copies)` : `Customise “${def.name}” (all copies)`) : null,
    ].filter((x): x is HTMLElement => !!x);
  }

  /** Move a prop by typing its position, unless another prop already stands on that tile. */
  private moveProp(i: number, x: number, z: number): void {
    const s = this.store, p = s.map.props[i];
    if (s.propOnTile(Math.floor(x), Math.floor(z), i) >= 0) {
      toast('Another prop already stands on that tile.', 'error');
      this.render();
      return;
    }
    this.edit(() => { p.x = x; p.z = z; });
  }

  private light(i: number): HTMLElement[] {
    const s = this.store, l = s.map.lights[i];
    const title = { point: 'Point light', spot: 'Spotlight', area: 'Area light' }[l.type];
    const commit = <T extends LightData>(apply: (x: T) => void, rebuild = false) => this.edit(() => apply(l as T), rebuild);
    const names = s.knownNames();
    const out: HTMLElement[] = [
      this.header(title, `${round2(l.x)}, ${round2(l.z)}`, () => this.edit(() => { s.map.lights.splice(i, 1); s.select(null); })),
      h('div', { hidden: true }, h('datalist', { id: 'dl-switches' }, ...names.switches.map((n) => h('option', { value: n })))),
    ];
    if (l.type === 'area') {
      const a = l as AreaLightData;
      out.push(
        h('div', { class: 'field-row' },
          field('Shape', select([['rect', 'Rectangle'], ['ellipse', 'Ellipse']], a.shape, (v) => commit<AreaLightData>((x) => (x.shape = v as 'rect' | 'ellipse')))),
          field('Soft edge (tiles)', numberInput(a.feather, (v) => commit<AreaLightData>((x) => (x.feather = Math.max(0, v))), { step: 0.25, min: 0, max: 20 }))),
        h('div', { class: 'field-row' },
          field('Width (tiles)', numberInput(a.w, (v) => commit<AreaLightData>((x) => (x.w = Math.max(0.5, v))), { step: 0.5, min: 0.5, max: 128 })),
          field('Height (tiles)', numberInput(a.h, (v) => commit<AreaLightData>((x) => (x.h = Math.max(0.5, v))), { step: 0.5, min: 0.5, max: 128 }))),
        ...lightFields(a, (apply) => commit<AreaLightData>(apply), { brightness: 'tint', showFlicker: false, showRadius: false, showSwitch: true }),
        h('p', { class: 'hint' }, 'Area lights tint the ground, props and characters inside them. They cost almost nothing, so use them freely (up to 8 per map).'),
      );
    } else {
      if (l.type === 'spot') {
        const sp = l as SpotLightData;
        out.push(
          field('Facing', select(DIRS, sp.dir, (v) => commit<SpotLightData>((x) => (x.dir = v as Dir)))),
          h('div', { class: 'field-row' },
            field('Beam width (°)', numberInput(sp.angle, (v) => commit<SpotLightData>((x) => (x.angle = Math.min(170, Math.max(5, v)))), { step: 5, min: 5, max: 170 })),
            field('Tilt down (°)', numberInput(sp.tilt, (v) => commit<SpotLightData>((x) => (x.tilt = Math.min(89, Math.max(0, v)))), { step: 5, min: 0, max: 89 }))));
      }
      const pl = l as PointLightData | SpotLightData;
      if (pl.y === undefined) pl.y = pl.type === 'spot' ? 1.6 : 1.2;
      out.push(...lightFields(pl, (apply) => commit<PointLightData | SpotLightData>(apply), {
        showHeight: true, showShadows: true, showSwitch: true,
        shadowHint: l.type === 'spot' ? 'Spotlight shadows are fairly cheap.' : 'Point-light shadows are the most expensive kind. Keep them for one or two key lights.',
      }));
    }
    return out;
  }

  /** Update 156: a trigger or encounter volume (moved, turned and sized in the 3D view). */
  private volume(id: number): HTMLElement[] {
    const s = this.store, m = s.map, v = m.volumes!.find((x) => x.id === id)!;
    const num = (k: 'sx' | 'sy' | 'sz', label: string) => field(label, numberInput(v[k], (n) => this.edit(() => (v[k] = Math.max(0.2, Math.round(n * 100) / 100)), true), { step: 0.5, min: 0.2 }));
    const zones = Object.keys(m.zones ?? {}).sort();
    return [
      this.header(v.name, v.kind === 'trigger' ? 'Trigger volume' : 'Encounter volume', () => this.edit(() => { m.volumes = m.volumes!.filter((x) => x.id !== id); if (!m.volumes.length) delete m.volumes; s.select(null); }, true)),
      field('Name', textInput(v.name, (n) => this.edit(() => (v.name = n.trim() || v.name), true))),
      field('Kind', select([['trigger', 'Trigger: runs an event when the hero walks in'], ['encounter', 'Encounter: random battles inside (an encounter zone)']], v.kind, (k) => this.edit(() => { v.kind = k as Volume3D['kind']; }, true))),
      h('div', { class: 'field-row' }, num('sx', 'Width (m)'), num('sz', 'Depth (m)'), num('sy', 'Height (m)')),
      ...(v.kind === 'trigger' ? [
        field('Runs', select([['', '— choose an event —'], ...m.events.map((e) => [String(e.id), `${String(e.id).padStart(3, '0')} ${e.name}`] as [string, string])], v.event !== undefined ? String(v.event) : '',
          (e) => this.edit(() => { if (e) v.event = Number(e); else delete v.event; }, true)), 'Its current page’s commands run (its conditions apply, as for any event). An event without a picture, placed anywhere, works well.'),
        checkbox('When the hero walks out (instead of in)', !!v.onExit, (b) => this.edit(() => { if (b) v.onExit = true; else delete v.onExit; })),
        checkbox('Only the first time ever (off: every time)', !!v.once, (b) => this.edit(() => { if (b) v.once = true; else delete v.once; })),
      ] : [
        field('Zone', select([['', '— choose a zone —'], ...zones.map((z) => [z, `Zone ${z}`] as [string, string])], v.zone ?? '', (z) => this.edit(() => { if (z) v.zone = z; else delete v.zone; }, true)),
          zones.length ? 'Inside it, that zone’s troops and rate apply (Map Properties → Encounters).' : 'Make a zone in Map Properties → Encounters first (its troops and how often they attack).'),
      ]),
      h('p', { class: 'hint' }, 'In the 3D view: drag the gizmo to move it (W), turn it (E) or size it (R).'),
    ];
  }

  private ramp(x: number, z: number): HTMLElement[] {
    const s = this.store, r = s.rampAt(x, z)!;
    const detected = autoRampDir((cx, cz) => (s.inMap(cx, cz) ? s.heightAt(cx, cz) : null), x, z);
    const dirName = (d: Dir | null) => (d ? DIRS.find(([k]) => k === d)![1] : 'none');
    const remove = () => this.edit(() => { s.map.ramps = (s.map.ramps ?? []).filter((q) => q !== r); s.select(null); }, true);
    const styleField = field('Style', select([['stairs', 'Stairs'], ['ramp', 'Ramp'], ['corner', 'Corner slope']], r.style, (v) => this.edit(() => { r.style = v as RampData['style']; if (r.style === 'corner') delete r.dir; else delete r.raise; }, true)));
    if (r.style === 'corner') {
      const auto = autoCornerMask((cx, cz) => (s.inMap(cx, cz) ? s.heightAt(cx, cz) : null), x, z);
      const names: [CornerName, string][] = [['nw', 'Top left'], ['ne', 'Top right'], ['se', 'Bottom right'], ['sw', 'Bottom left']];
      const now = r.raise?.length ? CORNER_NAMES.map((c) => r.raise!.includes(c)) : auto ?? [false, false, false, false];
      const out: HTMLElement[] = [this.header('Corner slope', `${x}, ${z} · height ${s.heightAt(x, z)}`, remove), styleField,
        field('Raised corners', select([['auto', `Automatic (${auto ? names.filter((_, k) => auto[k]).map(([, n]) => n.toLowerCase()).join(', ') : 'none'})`], ['hand', 'Set by hand']], r.raise?.length ? 'hand' : 'auto',
          (v) => this.edit(() => { if (v === 'auto') delete r.raise; else r.raise = CORNER_NAMES.filter((_, k) => now[k]).length ? CORNER_NAMES.filter((_, k) => now[k]) : ['ne']; }, true)))];
      if (r.raise?.length) out.push(h('div', { class: 'field-row' }, ...names.map(([c, n], k) => checkbox(n, now[k], (on) => this.edit(() => {
        const set = new Set(r.raise ?? []); if (on) set.add(c); else set.delete(c);
        r.raise = CORNER_NAMES.filter((q) => set.has(q));
        if (!r.raise.length) delete r.raise;
      }, true)))));
      if (!s.rampCorners(r)) out.push(h('p', { class: 'warn' }, 'No ground one step higher touches its corners, so it lies flat (red ✕ on the map).'));
      out.push(h('p', { class: 'hint' }, 'A walkable slope for a hill’s corners. Raised corners climb one step to meet the higher ground: one raised corner rounds an outside corner, three fill an inside one. Put ramps along the hill’s sides and corner slopes at its turns.'),
        h('button', { type: 'button', class: 'btn danger', onclick: remove }, 'Remove this corner slope'));
      return out;
    }
    const out: HTMLElement[] = [
      this.header(r.style === 'stairs' ? 'Stairs' : 'Ramp', `${x}, ${z} · height ${s.heightAt(x, z)}`, remove),
      styleField,
      field('Rises toward', select([['auto', `Automatic (${dirName(detected)})`], ...DIRS], r.dir ?? 'auto',
        (v) => this.edit(() => { if (v === 'auto') delete r.dir; else r.dir = v as Dir; }, true))),
    ];
    const dir = r.dir ?? detected;
    if (!dir) out.push(h('p', { class: 'warn' }, 'No neighbour is one step higher, so this lies flat (red ✕ on the map). Raise the cell it should lead up to by one step, lower this cell, or remove it.'));
    else if (r.dir && r.dir !== detected) out.push(h('p', { class: 'hint' }, 'Set by hand. The high end meets the cell on that side; make sure it is one step higher.'));
    out.push(h('p', { class: 'hint' }, `A ${r.style === 'stairs' ? 'flight of stairs' : 'ramp'} climbs one step (half a tile) across its cell. For taller climbs, chain several, each one step higher.`),
      h('button', { type: 'button', class: 'btn danger', onclick: remove }, `Remove ${r.style === 'stairs' ? 'these stairs' : 'this ramp'}`));
    return out;
  }

  private start(): HTMLElement[] {
    const s = this.store, st = s.db.start;
    return [
      this.header('Player start', `${s.db.startMap} · ${Math.floor(st.x)}, ${Math.floor(st.z)}`),
      field('Facing', select(DIRS, st.dir ?? 'down', (v) => { s.checkpoint(); st.dir = v as Dir; s.changedDb(); })),
      h('p', { class: 'hint' }, 'Drag the hero on the map to move the start position.'),
    ];
  }

  private tile(x: number, z: number, w = 1, hgt = 1): HTMLElement[] {
    const s = this.store;
    const area = w > 1 || hgt > 1;
    const size = area ? { w, h: hgt } : {};
    const fits = s.eventFits({ x, z, w, h: hgt });
    const createEvent = () => {
      const id = s.nextEventId();
      // One tile: a solid "talk to it" event. An area: a step-on trigger you can walk through.
      const ev: EventData = { id, name: `Event ${String(id).padStart(3, '0')}`, x, z, ...size,
        pages: [area ? { trigger: 'touch', commands: [] } : { trigger: 'action', solid: true, commands: [] }] };
      s.checkpoint();
      s.map.events.push(ev);
      s.changed('structure');
      s.select({ kind: 'event', id });
      // Straight into its editor, to give it commands.
      this.openEventWindow(ev);
    };
    // A transfer: an invisible event that runs when the player steps on it.
    const createTransfer = () => {
      const id = s.nextEventId();
      const other = s.maps.find((n) => n !== s.mapName) ?? s.mapName;
      const cmd: Command = { cmd: 'transfer', map: other, x: 0, z: 0 };
      const ev: EventData = { id, name: `To ${other}`, x, z, ...size, pages: [{ trigger: 'touch', commands: [cmd] }] };
      s.checkpoint();
      s.map.events.push(ev);
      s.changed('structure');
      s.select({ kind: 'event', id });
      this.commands.editCommand(cmd, ev.pages[0].commands);
    };
    // A way into a cliff or wall: a cave mouth on the wall that moves the player when they walk into it.
    const createEntrance = () => {
      const id = s.nextEventId();
      const other = s.maps.find((n) => n !== s.mapName) ?? s.mapName;
      const cmd: Command = { cmd: 'transfer', map: other, x: 0, z: 0 };
      const ev: EventData = { id, name: `Cave to ${other}`, x, z, pages: [{ sprite: 'cave_mouth', trigger: 'touch', commands: [cmd] }] };
      s.checkpoint();
      s.map.events.push(ev);
      s.changed('structure');
      s.select({ kind: 'event', id });
      this.commands.editCommand(cmd, ev.pages[0].commands);
    };
    // A chest or a pickup: gives an item once, then a switch remembers it was taken.
    const createLoot = (kind: 'chest' | 'pickup') => {
      const id = s.nextEventId();
      const sw = `${kind}_${s.mapName}_${id}`.replace(/[^A-Za-z0-9_]+/g, '_');
      const items = s.db.items ?? [];
      const first = items.find((d) => d.kind === 'consumable') ?? items[0];
      const give: Command = { cmd: 'giveItem', item: first?.id ?? '', count: 1 };
      const ev: EventData = kind === 'chest'
        ? { id, name: 'Chest', x, z, pages: [
          { sprite: 'chest', trigger: 'action', solid: true, commands: [give, { cmd: 'setSwitch', switch: sw, value: true }] },
          { condition: { switch: sw, is: true }, sprite: 'chest_open', trigger: 'action', solid: true, commands: [] }] }
        : { id, name: 'Item', x, z, pages: [
          { sprite: 'sparkle', trigger: 'action', commands: [give, { cmd: 'setSwitch', switch: sw, value: true }] },
          { condition: { switch: sw, is: true }, trigger: 'none', commands: [] }] };
      s.checkpoint();
      s.map.events.push(ev);
      s.changed('structure');
      s.pageIndex = 0;
      s.select({ kind: 'event', id });
      this.commands.editCommand(give, ev.pages[0].commands);
    };
    const createEnemy = () => {
      const id = s.nextEventId(), foe = s.db.enemies?.[0];
      if (!foe) toast('Add an enemy type in Database → Enemies first; the event is ready for it.');
      const ev: EventData = { id, name: foe?.name ?? 'Enemy', x, z, pages: [{ enemy: foe?.id ?? '', trigger: 'none', commands: [] }] };
      s.checkpoint();
      s.map.events.push(ev);
      s.changed('structure');
      s.pageIndex = 0;
      s.select({ kind: 'event', id });
    };
    // Something to break: a crate by default; breaking it sets a switch, and page 2 shows the rubble.
    const createBreakable = () => {
      const id = s.nextEventId();
      const sw = `broken_${s.mapName}_${id}`.replace(/[^A-Za-z0-9_]+/g, '_');
      const ev: EventData = { id, name: 'Crate', x, z, pages: [
        { sprite: 'crate', trigger: 'none', solid: true, breakable: { hp: 20 }, commands: [{ cmd: 'setSwitch', switch: sw, value: true }] },
        { condition: { switch: sw, is: true }, sprite: 'rubble', trigger: 'none', commands: [] }] };
      s.checkpoint();
      s.map.events.push(ev);
      s.changed('structure');
      s.pageIndex = 0;
      s.select({ kind: 'event', id });
      toast('A crate: hit it to break it. Its commands run when it breaks (add “Set switch” for a bridge or a gate). Try the Crystal switch or Cracked boulder sprites too.');
    };
    // A rest point (Update 106): a campfire (unless a prop is already there) and an event that offers a rest there.
    const createRest = () => {
      const id = s.nextEventId();
      s.checkpoint();
      if (s.propOnTile(x, z) < 0) s.map.props.push({ type: 'campfire', x: x + 0.5, z: z + 0.5 });
      const ev: EventData = { id, name: 'Rest point', x, z, pages: [{ trigger: 'action', commands: [
        { cmd: 'text', text: 'The fire crackles warmly. Make camp here?' },
        { cmd: 'choice', options: ['Rest', 'Not now'], branches: [[{ cmd: 'rest' }], []], cancel: 1 },
      ] }] };
      s.map.events.push(ev);
      s.changed('structure');
      s.pageIndex = 0;
      s.select({ kind: 'event', id });
      toast('A rest point: the player picks how many hours to rest and their camping supplies; it also sets the respawn point.');
    };
    const paste = () => { const r = s.pasteEvent(x, z); if (typeof r === 'string') toast(r, 'error'); };
    const moveStart = () => {
      s.checkpoint();
      s.db.startMap = s.mapName;
      s.db.start.x = x + 0.5;
      s.db.start.z = z + 0.5;
      s.changedDb('structure');
      s.select({ kind: 'start' });
    };
    const clip = s.eventClipboard;
    return [
      this.header(area ? `Tiles ${x}, ${z} · ${w} × ${hgt}` : `Tile ${x}, ${z}`, area ? `${w * hgt} tiles` : s.terrainAt(x, z) === '~' || s.terrainAt(x, z) === '#' ? 'Not walkable' : 'Empty'),
      fits ? null : h('p', { class: 'hint error' }, 'Part of this area already has an event. Events can’t overlap.'),
      h('div', { class: 'stack' },
        h('button', { type: 'button', class: 'btn primary', disabled: !fits, onclick: createEvent }, area ? `Create event over these ${w * hgt} tiles` : 'Create event here'),
        h('button', { type: 'button', class: 'btn', disabled: !fits, onclick: createTransfer, title: 'An invisible event that moves the player to another map (or elsewhere on this one) when stepped on' },
          area ? `Create transfer over these ${w * hgt} tiles` : 'Create transfer here'),
        area ? null : h('button', { type: 'button', class: 'btn', disabled: !fits, onclick: createEntrance, title: 'A cave mouth on the cliff face behind this tile (or on this tile’s own face): the player walks into it to go to another map. Change its picture to the door or square opening if you like.' }, 'Create cave entrance here'),
        area ? null : h('button', { type: 'button', class: 'btn', disabled: !fits, onclick: createEnemy, title: 'An enemy from Database → Enemies' }, 'Create enemy here'),
        area ? null : h('button', { type: 'button', class: 'btn', disabled: !fits, onclick: createBreakable, title: 'A crate, boulder or crystal switch the player breaks by hitting it; its commands run when it breaks' }, 'Create breakable here'),
        area ? null : h('button', { type: 'button', class: 'btn', disabled: !fits, onclick: createRest, title: 'A campfire where the party rests (pick hours, camping supplies); also sets the respawn point' }, 'Create rest point here'),
        area ? null : h('button', { type: 'button', class: 'btn', disabled: !fits, onclick: () => createLoot('chest'), title: 'A chest that gives an item once, then stays open' }, 'Create chest here'),
        area ? null : h('button', { type: 'button', class: 'btn', disabled: !fits, onclick: () => createLoot('pickup'), title: 'A sparkle on the ground: pick it up once and it’s gone' }, 'Create item pickup here'),
        clip ? h('button', { type: 'button', class: 'btn', onclick: paste, title: 'Ctrl+V pastes on the tile under the mouse' }, `Paste “${clip.name}” here`) : null,
        area ? null : h('button', { type: 'button', class: 'btn', onclick: moveStart }, 'Move player start here')),
      h('p', { class: 'hint' }, area ? 'Any tile of the area triggers the event.' : 'Drag across empty tiles to select an area for one big event (a wide doorway, say).'),
    ].filter((n): n is HTMLElement => !!n);
  }

  /** Lock settings (Update 119): a Lock command first in the page's commands (doors, chests…). */
  private lockSection(page: EventPage): HTMLElement[] {
    const lock = page.commands[0]?.cmd === 'lock' ? page.commands[0] as Extract<Command, { cmd: 'lock' }> : null;
    return [h('div', { class: 'section-label' }, 'Lock settings'),
      checkbox('Locked: the player picks the lock (or uses its key) before the rest runs', !!lock, (v) => this.edit(() => {
        if (v && !lock) page.commands.unshift({ cmd: 'lock', level: 'easy' });
        else if (!v && lock) page.commands.shift();
      }, true)),
      ...(lock ? lockFields(this.store, lock, (f) => this.edit(f, true)) : [])];
  }

  /** Health, defence, what can break it, and the name over its health bar. */
  private breakableFields(b: BreakableDef): HTMLElement[] {
    const kinds = new Set(b.hitBy?.length ? b.hitBy : HIT_KINDS.map(([k]) => k));
    return [
      h('div', { class: 'field-row' },
        field('Health', numberInput(b.hp, (v) => this.edit(() => (b.hp = Math.max(1, Math.round(v)))), { step: 1, min: 1 })),
        field('Defence', numberInput(b.defense ?? 0, (v) => this.edit(() => { const n = Math.max(0, Math.round(v)); if (n) b.defense = n; else delete b.defense; }), { step: 1, min: 0 }))),
      field('Name over its health bar', textInput(b.name ?? '', (v) => this.edit(() => (b.name = v.trim() || undefined)), { placeholder: 'The event’s name' })),
      h('div', { class: 'field' }, h('label', {}, 'Broken by'),
        h('div', { class: 'field-row' }, ...HIT_KINDS.map(([k, label]) => checkbox(label, kinds.has(k), (v) => this.edit(() => {
          if (v) kinds.add(k); else kinds.delete(k);
          if (!kinds.size) kinds.add(k);
          const list = HIT_KINDS.map(([x]) => x).filter((x) => kinds.has(x));
          if (list.length === HIT_KINDS.length) delete b.hitBy; else b.hitBy = list;
        }, true))))),
      field('Only hurt by', elementSelect(b.needs, (e) => this.edit(() => { if (e && e !== 'neutral') b.needs = e; else delete b.needs; }), 'Only hurt by element', { auto: 'Any element' }),
        'An ice wall only fire melts, roots only fire burns: other elements show “No effect”.'),
      h('p', { class: 'hint' }, 'A short sword hits for about 8. Other attacks show “No effect” (a crystal only magic reaches, say). Solid by default. To keep it broken, set a switch in its commands and give the event a later page for it (Create breakable here does this, with rubble).'),
    ];
  }

  /* ------------------------------------------------------------ event */

  /** Width and height in tiles; the event can't grow over another event or off the map. */
  private eventSize(ev: EventData): HTMLElement {
    const s = this.store;
    const set = (w: number, hgt: number) => {
      const next = { ...ev, w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(hgt)) };
      if (!s.eventFits(next, ev.id)) { toast('It doesn’t fit: it would leave the map or overlap another event.', 'error'); s.emit('selection'); return; }
      this.edit(() => {
        if (next.w > 1) ev.w = next.w; else delete ev.w;
        if (next.h > 1) ev.h = next.h; else delete ev.h;
      }, true);
    };
    return h('div', { class: 'field-row' },
      field('Width (tiles)', numberInput(eventW(ev), (v) => set(v, eventH(ev)), { min: '1', step: '1' })),
      field('Height (tiles)', numberInput(eventH(ev), (v) => set(eventW(ev), v), { min: '1', step: '1' })));
  }

  /** Copy an event to the first free spot beside it (right, then below, left, above). */
  private duplicate(ev: EventData): void {
    const s = this.store, w = eventW(ev), hgt = eventH(ev);
    s.copyEvent(ev.id);
    for (const [dx, dz] of [[w, 0], [0, hgt], [-w, 0], [0, -hgt]]) {
      if (s.eventFits({ x: ev.x + dx, z: ev.z + dz, w, h: hgt })) { s.pasteEvent(ev.x + dx, ev.z + dz); return; }
    }
    toast('No room right beside it. Select a tile and use Paste instead.', 'error');
  }

  /** The event window (pages, settings and commands), while it's open. */
  private eventWin: { id: number; body: HTMLElement; close: () => void } | null = null;
  /** A copied event page (to paste into this or another event). */
  private pageClip: EventPage | null = null;

  /** The side panel for an event: its name and size, and the button to open its editor window. */
  private event(ev: EventData): HTMLElement[] {
    const s = this.store;
    const del = () => confirmModal('Delete event?', `“${ev.name}” and all its pages will be removed. You can undo this.`, 'Delete', () => {
      this.edit(() => { s.map.events.splice(s.map.events.indexOf(ev), 1); s.select(null); }, true);
    }, true);
    const triggerName = (p: EventPage) => p.enemy !== undefined ? 'enemy' : p.breakable ? 'breakable' : TRIGGERS.find(([k]) => k === p.trigger)?.[1] ?? p.trigger;
    return [
      this.header(ev.name, s.inMap(ev.x, ev.z) ? `Event ${ev.id} · ${ev.x}, ${ev.z}${eventW(ev) > 1 || eventH(ev) > 1 ? ` · ${eventW(ev)} × ${eventH(ev)} tiles` : ''}` : `Event ${ev.id} · off map`, del),
      field('Name', textInput(ev.name, (v) => this.edit(() => (ev.name = v.trim() || ev.name), true))),
      s.inMap(ev.x, ev.z) ? this.eventSize(ev) : h('span', { hidden: true }),
      h('button', { type: 'button', class: 'btn primary wide-btn', onclick: () => this.openEventWindow(ev) }, 'Edit event (pages and commands)…'),
      h('ol', { class: 'ev-page-sum' }, ...ev.pages.map((p, k) => h('li', {},
        h('b', {}, `Page ${k + 1}`), ` · ${triggerName(p)} · ${p.commands.length} command${p.commands.length === 1 ? '' : 's'}${p.condition ? ` · when ${conditionText(p.condition)}` : ''}`))),
      h('div', { class: 'stack row' },
        h('button', { type: 'button', class: 'btn small', title: 'Copy (Ctrl+C)', onclick: () => { s.copyEvent(ev.id); toast(`Copied “${ev.name}”. Select a tile and Paste, or press Ctrl+V over the map.`); s.emit('selection'); } }, 'Copy'),
        h('button', { type: 'button', class: 'btn small', title: 'Copy and paste right next to it', onclick: () => this.duplicate(ev) }, 'Duplicate')),
      h('p', { class: 'hint' }, 'Double-click an event on the map to open its editor too.'),
    ];
  }

  /** A word bubble over the event while this page shows ("!" and "?" for quests, or short text). */
  private bubbleFields(page: EventPage): HTMLElement[] {
    const b = page.bubble;
    const out: HTMLElement[] = [h('div', { class: 'section-label' }, 'Word bubble'),
      field('Show', select([['', 'No bubble'], ['!', '! (a quest to take)'], ['?', '? (ready to hand in)'], ['text', 'Text…']], b ? (b.text === '!' || b.text === '?' ? b.text : 'text') : '', (v) => this.edit(() => {
        if (!v) { delete page.bubble; return; }
        const prev = page.bubble ?? { text: '!', at: 'above' as const, color: '#ffd23f', outline: '#3a2400', transparent: true, size: 30, glow: true };
        page.bubble = { ...prev, text: v === 'text' ? (prev.text === '!' || prev.text === '?' ? 'Hello!' : prev.text) : v };
      }, true)))];
    if (!b) return out;
    const color = (value: string, set: (v: string) => void, label: string) => {
      const i = h('input', { type: 'color', value, 'aria-label': label });
      i.addEventListener('change', () => this.edit(() => set(i.value), true));
      return i;
    };
    if (b.text !== '!' && b.text !== '?') out.push(field('Text', textInput(b.text, (v) => this.edit(() => (b.text = v || '…'), true))));
    out.push(
      h('div', { class: 'field-row' },
        field('Where', select([['above', 'Above it'], ['on', 'On it'], ['below', 'At its feet']], b.at ?? 'above', (v) => this.edit(() => (b.at = v as 'above' | 'on' | 'below'), true))),
        field('Text size', numberInput(b.size ?? 22, (v) => this.edit(() => (b.size = Math.max(8, Math.min(96, Math.round(v)))), true), { min: 8, max: 96, step: 2 })),
        field('Bubble size ×', numberInput(b.scale ?? 1, (v) => this.edit(() => (b.scale = Math.max(0.4, Math.min(4, v))), true), { min: 0.4, max: 4, step: 0.1 }))),
      h('div', { class: 'field-row bubble-colors' },
        field('Text', color(b.color ?? '#ffd23f', (v) => (b.color = v), 'Text colour')),
        field('Bubble', color(b.bubble ?? '#ffffff', (v) => (b.bubble = v), 'Bubble colour')),
        field('Outline', color(b.outline ?? '#000000', (v) => (b.outline = v), 'Outline colour'))),
      h('div', { class: 'checks' },
        checkbox('See-through bubble (just the text)', !!b.transparent, (v) => this.edit(() => (b.transparent = v || undefined), true)),
        checkbox('Bold', b.bold !== false, (v) => this.edit(() => (b.bold = v ? undefined : false), true)),
        checkbox('Italic', !!b.italic, (v) => this.edit(() => (b.italic = v || undefined), true)),
        checkbox('Strikethrough', !!b.strike, (v) => this.edit(() => (b.strike = v || undefined), true)),
        checkbox('Outlined', !!b.outline, (v) => this.edit(() => { if (v) b.outline ??= '#000000'; else delete b.outline; }, true)),
        checkbox('Glowing', !!b.glow, (v) => this.edit(() => (b.glow = v || undefined), true)),
        checkbox('Bob up and down', !b.still, (v) => this.edit(() => (b.still = v ? undefined : true), true))),
      h('p', { class: 'hint' }, 'Shown while this page is the one showing: give a quest giver a page with “!” while the quest can be taken and one with “?” when it’s ready to hand in (Condition → Quest).'));
    return out;
  }

  /** A sound the event makes all the time while this page shows (a campfire, a shore), fading with distance. */
  private soundFields(page: EventPage): HTMLElement[] {
    const snd = page.sound;
    const opts: [string, string][] = [['', 'None'], ...loopChoices('ambience', audioFiles(this.store)).filter(([v]) => v)];
    const out: HTMLElement[] = [h('div', { class: 'section-label' }, 'Sound'),
      h('div', { class: 'field-row' },
        field('Plays all the time', select(opts, snd?.src ?? '', (v) => this.edit(() => { if (v) page.sound = { ...(page.sound ?? {}), src: v }; else delete page.sound; }, true))),
        snd ? h('button', { type: 'button', class: 'btn', onclick: () => preview(this.store, snd.src, true) }, '▶ Listen') : h('span'))];
    if (!snd) return out;
    out.push(h('div', { class: 'field-row' },
      field('Volume', numberInput(snd.volume ?? 80, (v) => this.edit(() => { const n = Math.max(0, Math.min(100, Math.round(v))); if (n === 80) delete snd.volume; else snd.volume = n; }), { min: 0, max: 100, step: 5 })),
      field('Heard from (tiles)', numberInput(snd.range ?? 8, (v) => this.edit(() => { const n = Math.max(1, Math.min(40, v)); if (n === 8) delete snd.range; else snd.range = n; }), { min: 1, max: 40, step: 1 }))),
      h('p', { class: 'hint' }, 'Loud right by the event, fading away to nothing at that distance, and panned left or right as the hero walks past (a crackling campfire, waves on a shore, a waterfall). Only while this page shows, so a page that puts the fire out can go quiet.'));
    return out;
  }

  /** The event's marker on the world map (every page): its kind, its tooltip, and a switch that shows it. */
  private markerFields(ev: EventData): HTMLElement[] {
    const kinds = markerKinds(this.store.db.markers), m = ev.marker;
    const out: HTMLElement[] = [h('div', { class: 'section-label' }, 'Map marker'),
      field('On the world map', select([['', 'None'], ...kinds.map((k) => [k.id, k.name] as [string, string])], m?.kind ?? '', (v) => this.edit(() => {
        if (v) ev.marker = { ...(ev.marker ?? {}), kind: v }; else delete ev.marker;
      }, true)))];
    if (!m) return out;
    const k = kinds.find((x) => x.id === m.kind);
    if (k) out.push(h('div', { class: 'marker-preview' }, h('img', { src: markerIcon(k.symbol, k.color, 26), alt: '' }), h('span', {}, `${k.name}${eventW(ev) > 1 || eventH(ev) > 1 ? ' · its area is outlined on the map' : ''}`)));
    out.push(field('Tooltip', textInput(m.label ?? '', (v) => this.edit(() => { if (v.trim()) m.label = v.trim(); else delete m.label; }, true), { placeholder: ev.name })),
      h('div', { class: 'field-row' },
        field('Only while switch', switchInput(m.switch ?? '', (v) => this.edit(() => { if (v) m.switch = v; else { delete m.switch; delete m.whenOff; } }, true), { placeholder: '(always)' })),
        m.switch ? field('is', select([['on', 'ON'], ['off', 'OFF']], m.whenOff ? 'off' : 'on', (v) => this.edit(() => { if (v === 'off') m.whenOff = true; else delete m.whenOff; }, true))) : h('span')),
      h('p', { class: 'hint' }, 'Show a quest location only while its quest is on: turn a switch on when the quest starts and off when it ends. Kinds, symbols and colours: Database → Map markers.'));
    return out;
  }

  /** Open the event editor window (like RPG Maker's): page tabs on top, settings on the left, commands on the right. */
  openEventWindow(ev: EventData): void {
    this.eventWin?.close();
    const body = h('div', { class: 'ev-window' });
    const close = openModal(`Event: ${ev.name}`, body, [{ label: 'Close', primary: true }], undefined, { wide: true });
    const wrapped = () => { this.eventWin = null; close(); };
    this.eventWin = { id: ev.id, body, close: wrapped };
    // Closing by ✕, Esc or the button: forget it.
    const overlay = body.closest('.overlay');
    const obs = new MutationObserver(() => { if (!overlay?.isConnected) { if (this.eventWin?.body === body) this.eventWin = null; obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
    body.closest('.modal')?.classList.add('ev-modal');
    this.drawEventWindow();
  }

  private drawEventWindow(): void {
    const w = this.eventWin;
    if (!w) return;
    const ev = this.store.event(w.id);
    if (!ev) { w.close(); return; }
    const cmdScroll = w.body.querySelector('.ev-commands')?.scrollTop ?? 0, setScroll = w.body.querySelector('.ev-settings')?.scrollTop ?? 0;
    w.body.replaceChildren(...this.eventEditor(ev));
    const title = w.body.closest('.modal')?.querySelector('.modal-head h2');
    if (title) title.textContent = `Event: ${ev.name}`;
    const c = w.body.querySelector('.ev-commands'), st = w.body.querySelector('.ev-settings');
    if (c) c.scrollTop = cmdScroll;
    if (st) st.scrollTop = setScroll;
  }

  private eventEditor(ev: EventData): HTMLElement[] {
    const s = this.store;
    const pi = Math.min(s.pageIndex, ev.pages.length - 1);
    const page = ev.pages[pi];
    const del = () => confirmModal('Delete event?', `“${ev.name}” and all its pages will be removed. You can undo this.`, 'Delete', () => {
      this.edit(() => { s.map.events.splice(s.map.events.indexOf(ev), 1); s.select(null); }, true);
    }, true);

    const pageTabs = h('div', { class: 'page-tabs', role: 'tablist' },
      ...ev.pages.map((p, k) => h('button', { type: 'button', role: 'tab', class: 'page-tab', 'aria-selected': String(k === pi),
        title: p.condition ? `Active when ${conditionText(p.condition)}` : 'Always active',
        onclick: () => { s.pageIndex = k; this.render(); this.drawEventWindow(); } }, `Page ${k + 1}`)),
      h('button', { type: 'button', class: 'page-tab add', title: 'Add a page', onclick: () => this.edit(() => {
        ev.pages.push({ ...JSON.parse(JSON.stringify(page)) as EventPage, condition: { switch: '', is: true }, commands: [] });
        s.pageIndex = ev.pages.length - 1;
      }, true) }, '+ Page'));

    const pageTools = h('div', { class: 'page-tools' },
      h('button', { type: 'button', class: 'btn small', title: 'Copy this page, to paste here or into another event', onclick: () => { this.pageClip = JSON.parse(JSON.stringify(page)) as EventPage; toast(`Copied page ${pi + 1}`); this.drawEventWindow(); } }, 'Copy page'),
      h('button', { type: 'button', class: 'btn small', disabled: !this.pageClip, title: 'Paste the copied page after this one', onclick: () => this.edit(() => {
        ev.pages.splice(pi + 1, 0, JSON.parse(JSON.stringify(this.pageClip)) as EventPage); s.pageIndex = pi + 1;
      }, true) }, 'Paste page'),
      h('button', { type: 'button', class: 'btn small', onclick: () => this.edit(() => {
        ev.pages.splice(pi + 1, 0, JSON.parse(JSON.stringify(page)) as EventPage); s.pageIndex = pi + 1;
      }, true) }, 'Duplicate page'),
      h('button', { type: 'button', class: 'btn small danger', disabled: ev.pages.length < 2, onclick: () => this.edit(() => {
        ev.pages.splice(pi, 1); s.pageIndex = Math.max(0, pi - 1);
      }, true) }, 'Delete page'));

    const enemies = (s.db.enemies ?? []).map((d) => [d.id, d.name] as [string, string]);
    const appearance = page.enemy ? 'enemy' : page.character ? 'character' : page.sprite ? 'sprite' : 'none';
    const chars = Object.entries(s.db.characters).map(([k, c]) => [k, c.name] as [string, string]);
    const lookControls: HTMLElement[] = [
      field('Appearance', select([['none', 'Invisible'], ['character', 'Character'], ['sprite', 'Object sprite'], ['enemy', 'Enemy']], appearance, (v) => this.edit(() => {
        delete page.character; delete page.sprite; delete page.enemy;
        if (v === 'enemy') { page.enemy = enemies[0]?.[0] ?? ''; page.trigger = 'none'; delete page.solid; }
        if (v === 'character') page.character = chars[0]?.[0];
        if (v === 'sprite') page.sprite = 'sign';
      }, true))),
    ];
    if (page.enemy !== undefined) {
      const opts = enemies.length ? [...enemies] : [['', '(no enemies yet: add some in Database → Enemies)'] as [string, string]];
      if (page.enemy && !opts.some(([id]) => id === page.enemy)) opts.unshift([page.enemy, `${page.enemy} (missing)`]);
      lookControls.push(field('Enemy', select(opts, page.enemy, (v) => this.edit(() => (page.enemy = v)))),
        levelRangeField('Its level', () => page.enemyLevels, (v) => this.edit(() => { if (v) page.enemyLevels = v; else delete page.enemyLevels; }), 'Rolled each time it appears (0: its own level). The event command Enemy levels can make map enemies follow the party’s level instead.'),
        h('p', { class: 'hint' }, 'It fights instead of talking. The commands below run when it’s defeated (open a gate, set a switch). Beaten enemies come back when the player returns to the map; for one that stays beaten, set a switch here and give the event a later page for it.'));
    } else if (page.character) {
      lookControls.push(h('div', { class: 'field-row' },
        field('Character', select(chars, page.character, (v) => this.edit(() => (page.character = v)))),
        field('Facing', select(DIRS, page.dir ?? 'down', (v) => this.edit(() => (page.dir = v as Dir))))));
      lookControls.push(checkbox('Turn to face the player', !!page.facePlayer, (v) => this.edit(() => (page.facePlayer = v || undefined))));
    } else if (page.sprite) {
      const sprites = paletteProps().map((d) => [d.id, d.name] as [string, string]);
      if (!sprites.some(([id]) => id === page.sprite)) sprites.unshift([page.sprite, `${page.sprite} (missing)`]);
      lookControls.push(field('Sprite', select(sprites, page.sprite, (v) => this.edit(() => (page.sprite = v)))));
    }

    const names = s.knownNames();
    void del;
    return [
      h('div', { hidden: true },
        h('datalist', { id: 'dl-switches' }, ...names.switches.map((n) => h('option', { value: n }))),
        h('datalist', { id: 'dl-vars' }, ...names.vars.map((n) => h('option', { value: n })))),
      h('div', { class: 'ev-top' },
        field('Name', textInput(ev.name, (v) => this.edit(() => (ev.name = v.trim() || ev.name), true))),
        pageTools),
      pageTabs,
      h('div', { class: 'ev-grid' },
        h('div', { class: 'ev-settings' },
          h('div', { class: 'section-label' }, 'Condition'),
          conditionForm(page.condition, (c) => this.edit(() => (page.condition = c)), true, () => this.edit(() => delete page.condition, true)),
          ev.pages.length > 1 ? h('p', { class: 'hint' }, 'The last page whose condition is met is the one that runs.') : null,
          h('div', { class: 'section-label' }, 'Appearance'),
          ...lookControls,
          ...(page.enemy !== undefined ? [] : [
            h('div', { class: 'section-label' }, 'Behaviour'),
            checkbox('Breakable: the player can lock on and hit it; the commands run when it breaks', !!page.breakable, (v) => this.edit(() => {
              if (v) { page.breakable = { hp: 20 }; page.trigger = 'none'; page.solid = true; } else delete page.breakable;
            }, true)),
            ...(page.breakable ? this.breakableFields(page.breakable) : [field('Trigger', select(TRIGGERS, page.trigger, (v) => this.edit(() => (page.trigger = v as Trigger), true)))]),
            checkbox('Solid (blocks the player)', !!page.solid, (v) => this.edit(() => (page.solid = v || undefined))),
            ...(page.sprite || page.character ? [checkbox('Flat against the wall behind it (cave mouths, doors, banners)', page.wall ?? (page.sprite ? !!s.catalog.get(page.sprite)?.wall : false), (v) => this.edit(() => {
              const dflt = page.sprite ? !!s.catalog.get(page.sprite)?.wall : false;
              if (v === dflt) delete page.wall; else page.wall = v;
            }))] : []),
            page.trigger === 'touch' ? h('p', { class: 'hint' }, 'Player touch runs when the player steps onto it, or walks into it when they can’t step there (it’s solid, or it’s up on a cliff, like a cave mouth on the wall).') : null,
            checkbox('Is respawn point (after losing all health, the player comes back here)', !!page.respawn, (v) => this.edit(() => (page.respawn = v || undefined))),
            ...this.lockSection(page)]),
          ...this.bubbleFields(page),
          ...this.soundFields(page),
          ...this.markerFields(ev)),
        h('div', { class: 'ev-commands' },
          h('div', { class: 'section-label' }, page.enemy !== undefined ? 'When defeated' : page.breakable ? 'When it breaks' : 'Commands'),
          this.commands.render(page.commands),
          h('p', { class: 'hint' }, 'Click a command to highlight it, double-click to edit. Drag to move it (into a choice or condition too), or use ↑ ↓. Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste (below the highlighted one, even in another event), Ctrl+D duplicates, Delete removes.'))),
    ];
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const HIT_KINDS: ['melee' | 'bow' | 'magic', string][] = [['melee', 'Melee'], ['bow', 'Arrows'], ['magic', 'Magic']];
