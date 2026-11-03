/** Map editor entry point: lays out the panels and wires the toolbar and shortcuts. */
import { battlebackList } from '../gba/types';
import { View3D } from './View3D';
import { WEAPON_MANIFEST_PATH, itemWeaponSprite, usedWeaponSprites } from '../game/combat/weaponSprites';
import { findWeapon, loadWeaponList, loadWeaponSheets } from './weaponPicker';
import '../fonts.css';
import './editor.css';
import { writePlaytest, type PlaytestData } from '../shared/playtest';
import { loadEnemyImages } from './CombatEditor';
import { openDatabase } from './DatabaseEditor';
import { openGbaStudio } from './GbaStudio';
import { openGbaCheck } from './gbaCheck';
import { gba, loadGba } from './gbaShared';
import { blankLayers } from '../gba/layers';
import { setCombatPreview } from './combatPreview';
import { openWorldLayout } from './WorldEditor';
import type { Dir, MapData } from '../world/types';
import { backspaceAsEscape, confirmModal, field, h, numberInput, openModal, select, textInput, toast } from './dom';
import { installErrorBar } from '../shared/errorBar';
import { characterImage, characterOverworldSheet, enemyBattleImage, propSprite, tileName } from './editorArt';
import { tintCanvas } from '../render/tint';
import { Inspector } from './Inspector';
import { save } from './io';
import { browserProject, canKeepProject, changedFiles } from './browserProject';
import { projectMenu } from './projectMenu';
import { loadProjectAssets } from './assets';
import { loadCharacterSheets } from './CharactersEditor';
import { loadItemIconFiles } from './ItemsEditor';
import { audioFiles, loadAudioFiles, preview, readSound } from './audioEditor';
import { setAudioHooks } from './CommandEditor';
import { migrateItems } from '../world/items';
import { BudgetMeter } from '../ui/BudgetMeter';
import type { LightCounts } from '../shared/lightBudget';
import { MapView, isTyping } from './MapView';
import { MODE_HINTS, MODES, Palette, setMapPropertiesOpener } from './Palette';
import { isGbaMode } from './gbaPaint';
import { EditorStore, type Mode } from './store';
import {
  type DirHandle, type Project, canOpenFolders, devServerProject, ensurePermission, findDataDir, folderProject,
  pickFolder, recallFolder, rememberFolder, staticProject,
} from './project';

// Opened as a file the game page is Playtest.html; under the dev server it's index.html.
const PLAYTEST_URL = location.protocol === 'file:' ? 'Playtest.html?playtest' : 'index.html?playtest';

const store = new EditorStore();
const root = document.getElementById('editor')!;

async function boot(): Promise<void> {
  const project = await chooseProject();
  store.project = project;
  store.db = await project.readDatabase();
  // Older light items become Light rings; mark the database to be saved.
  if (migrateItems(store.db)) store.dbDirty = true;
  const maps = await project.listMaps();
  store.maps = maps.length ? maps : [store.db.startMap];
  const wanted = new URLSearchParams(location.search).get('map');
  const first = wanted && store.maps.includes(wanted) ? wanted : store.maps.includes(store.db.startMap) ? store.db.startMap : store.maps[0];
  const map = await project.readMap(first);
  await loadProjectAssets(store);
  await loadGba(project);
  await loadCharacterSheets(store);
  await loadEnemyImages(store);
  await loadItemIconFiles(store);
  await loadAudioFiles(store);
  setAudioHooks(() => audioFiles(store), (src) => preview(store, src));
  buildUI();
  store.open(first, map);
  view.fit();
  void scanMapKinds();
}

/** Read which maps are battle maps (for the map list and the Battle map choices). */
async function scanMapKinds(): Promise<void> {
  for (const n of [...store.maps]) {
    if (n === store.mapName) continue;
    try { const m = await store.project.readMap(n); store.mapKinds.set(n, m.kind === 'battle' ? 'battle' : 'field'); } catch { /* unreadable: a field map */ }
  }
  store.emit('meta');
}

// Errors show on screen (tablets have no developer tools); Backspace works as Esc outside text boxes.
installErrorBar('Map editor');
backspaceAsEscape();

/** Dev server if it's running; the project folder when opened as a file; otherwise read-only preview. */
async function chooseProject(): Promise<Project> {
  const dev = await devServerProject();
  if (dev) return dev;
  if (location.protocol === 'file:' || new URLSearchParams(location.search).has('folder')) return welcome();
  // Hosted (GitHub Pages): keep changes in the browser when it can (tablets and phones included).
  if (await canKeepProject()) return browserProject();
  return staticProject();
}

/** First screen when opened from the project folder: pick (or reopen) the folder. */
function welcome(): Promise<Project> {
  return new Promise((resolve) => {
    const error = h('p', { class: 'welcome-error', role: 'alert' });
    const fail = (msg: string) => { error.textContent = msg; };
    const open = async (dir: DirHandle) => {
      if (!(await ensurePermission(dir))) return fail('The browser wasn’t given permission to use that folder. Try again and choose “Edit files” when asked.');
      const data = await findDataDir(dir);
      if (!data) return fail(`Couldn’t find public/data/database.json inside “${dir.name}”. Choose the project folder itself (the one with “Map Editor.html” in it).`);
      await rememberFolder(dir);
      resolve(folderProject(dir, data));
    };
    const choose = async () => {
      error.textContent = '';
      try { await open(await pickFolder()); }
      catch (err) { if ((err as Error)?.name !== 'AbortError') fail(`Couldn’t open that folder: ${(err as Error)?.message ?? String(err)}`); }
    };
    const card = h('div', { class: 'welcome-card' },
      h('div', { class: 'brand-mark' }, 'Mimas · Map Editor'),
      h('h1', {}, 'Open your project'),
      h('p', {}, 'Choose your game’s project folder, the one this “Map Editor.html” file is in. The editor opens the maps inside it and saves your changes straight back there.'));
    root.replaceChildren(h('div', { class: 'welcome' }, card));
    if (!canOpenFolders()) {
      card.append(h('p', { class: 'welcome-error' }, 'This browser can’t open folders from a page.'),
        h('p', {}, 'Close this tab and double-click “Start Map Editor.bat” in your project folder instead. It opens the editor in any browser, with saving.'));
      return;
    }
    const actions = h('div', { class: 'welcome-actions' });
    card.append(actions, error, h('p', { class: 'hint' }, 'Your browser will ask to let this page view and edit files in that folder. It remembers the folder for next time.'));
    void recallFolder().then((prev) => {
      if (prev) actions.append(h('button', { type: 'button', class: 'btn primary', onclick: () => { error.textContent = ''; void open(prev).catch((e: Error) => fail(e.message)); } }, `Open “${prev.name}” again`));
      actions.append(h('button', { type: 'button', class: prev ? 'btn' : 'btn primary', onclick: () => void choose() }, prev ? 'Choose a different folder…' : 'Choose project folder…'));
    });
  });
}

let view: MapView;

function buildUI(): void {
  view = new MapView(store);
  const palette = new Palette(store, (id) => {
    const ev = id >= 0 ? store.event(id) : null;
    if (ev && store.inMap(ev.x, ev.z)) view.centerOn(ev.x, ev.z);
    else if (id < 0) view.centerOn(Math.floor(store.db.start.x), Math.floor(store.db.start.z));
  });
  const inspector = new Inspector(store);
  setMapPropertiesOpener(() => inspector.openMapWindow());
  // Double-clicking an event on the map opens its editor window.
  view.el.addEventListener('dblclick', () => {
    const sel = store.selection, ev = sel?.kind === 'event' ? store.event(sel.id) : null;
    if (ev) inspector.openEventWindow(ev);
  });

  /* ---------------- toolbar */
  const mapSelect = h('select', { class: 'map-select', 'aria-label': 'Map', onchange: () => switchMap(mapSelect.value) });
  const saveBtn = h('button', { type: 'button', class: 'btn primary', title: 'Save (Ctrl+S)', onclick: () => void save(store) }, 'Save');
  const saveState = h('span', { class: 'save-state', role: 'status' });
  const undoBtn = h('button', { type: 'button', class: 'icon-btn', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => store.undo() }, '↶');
  const redoBtn = h('button', { type: 'button', class: 'icon-btn', title: 'Redo (Ctrl+Y)', 'aria-label': 'Redo', onclick: () => store.redo() }, '↷');
  const zoomOut = h('button', { type: 'button', class: 'icon-btn', title: 'Zoom out (−)', 'aria-label': 'Zoom out', onclick: () => { view.zoomBy(1 / 1.25); updateStatus(); } }, '−');
  const zoomIn = h('button', { type: 'button', class: 'icon-btn', title: 'Zoom in (+)', 'aria-label': 'Zoom in', onclick: () => { view.zoomBy(1.25); updateStatus(); } }, '+');
  // Update 155: a 3D map's scene in 3D (fly round it, place and move events), instead of the 2D map.
  const view3d = new View3D(store, (ev) => inspector.openEventWindow(ev));
  const toggle3d = h('button', { type: 'button', class: 'btn ghost', 'aria-pressed': 'false', title: 'See this 3D map’s scene in 3D: fly round it (hold the right mouse button + W A S D), right-click to place things, drag to move them', onclick: () => set3d(!view3d.active) }, '3D view');
  const set3d = (on: boolean) => {
    on = on && !!store.map.scene3d;
    view3d.show(on);
    view.el.hidden = on;
    toggle3d.setAttribute('aria-pressed', String(on));
    if (!on) store.emit('ui');
  };
  view3d.onClose = () => set3d(false);
  const update3d = () => { toggle3d.hidden = !store.map?.scene3d; if (view3d.active && !store.map?.scene3d) set3d(false); };
  store.on('meta', update3d);
  store.on('structure', update3d);
  const fitBtn = h('button', { type: 'button', class: 'btn ghost', title: 'Fit map (F)', onclick: () => { view.fit(); updateStatus(); } }, 'Fit');
  const playBtn = h('a', { class: 'btn ghost', href: PLAYTEST_URL, target: '_blank', title: 'Play this Saturn (HD-2D) map in a new tab, including unsaved changes. For the GBA game use ▶ Play GBA.',
    onclick: () => {
      // The link opens the game normally; it waits for the data stored under this stamp.
      const stamp = String(Date.now());
      playBtn.href = `${PLAYTEST_URL}=${stamp}`;
      void playtest(stamp);
    } }, '▶ Saturn playtest');
  // Mimas: GBA maps play right here on a GBA screen; old Saturn maps still open the Saturn game.
  const gbaPlayBtn = h('button', { type: 'button', class: 'btn play', title: 'Play this map on a GBA screen, right here (includes unsaved changes)', onclick: () => void playGba() }, '▶ Playtest');
  const gbaCheckBtn = h('button', { type: 'button', class: 'btn ghost', title: 'What this map uses that the GBA ROM can’t do yet', onclick: () => void (async () => {
    const others = new Map<string, MapData>();
    await Promise.all(store.maps.filter((n) => n !== store.mapName).map(async (n) => { try { others.set(n, await store.project.readMap(n)); } catch { /* unreadable */ } }));
    openGbaCheck(store.map, store.mapName, store.db, (n) => (n === store.mapName ? store.map : others.get(n)));
  })() }, 'GBA check');
  const updatePlayButtons = () => { const g = !!store.map?.gba; gbaPlayBtn.hidden = !g; playBtn.hidden = g; gbaCheckBtn.hidden = !g; };
  store.on('meta', updatePlayButtons);
  store.on('map', updatePlayButtons);
  const toggleLeft = h('button', { type: 'button', class: 'btn ghost panel-toggle', 'aria-expanded': 'false', onclick: () => togglePanel('left') }, 'Tools');

  const toolbar = h('header', { class: 'toolbar' },
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, 'Mimas · Map Editor')),
    h('div', { class: 'tb-group' },
      store.project.kind === 'folder' ? h('span', { class: 'project-chip', title: 'Project folder' }, store.project.label) : null,
      store.project.kind === 'browser' ? h('button', { type: 'button', class: 'btn ghost', title: 'Your changes are kept in this browser. Push them to GitHub (or Pull the latest), or save them as a zip.', onclick: () => void projectMenu(store) }, 'Project') : null,
      store.project.kind === 'browser' ? h('a', { class: 'btn ghost', href: 'character-builder.html', target: '_blank', rel: 'noopener', title: 'Make character sprite sheets, then import them in Database → Characters' }, 'Character Builder') : null,
      mapSelect, h('button', { type: 'button', class: 'btn ghost', onclick: newMapDialog }, 'New map'),
      h('button', { type: 'button', class: 'btn ghost', title: 'Player stats, speeds and stamina costs', onclick: () => openDatabase(store) }, 'Database'),
      h('button', { type: 'button', class: 'btn ghost gba-btn', title: 'Paint GBA tiles and sprites with real GBA palettes', onclick: () => void openGbaStudio(store) }, 'GBA Studio'),

      h('button', { type: 'button', class: 'btn ghost', title: 'Lay the maps out as one world: the world map in the pause menu, and seamless edges', onclick: () => void openWorldLayout(store) }, 'World')),
    h('div', { class: 'tb-group' }, undoBtn, redoBtn),
    h('div', { class: 'tb-group zoom' }, zoomOut, fitBtn, zoomIn),
    h('div', { class: 'tb-group' }, toggle3d),
    h('div', { class: 'tb-spacer' }),
    h('div', { class: 'tb-group' }, toggleLeft),
    h('div', { class: 'tb-group' }, saveState, gbaCheckBtn, saveBtn, gbaPlayBtn, playBtn));
  // Opened by "Start Map Editor.bat": the Character Builder (characters and weapons) is served alongside.
  if (store.project.kind === 'dev') {
    void fetch('/__editor/builder', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((b: { builder?: boolean; library?: boolean } | null) => {
      if (!b?.builder) return;
      const link = h('a', { class: 'btn ghost', href: '/builder/', target: '_blank', rel: 'noopener',
        title: b.library ? 'Characters and weapons, exported as PNGs to import here' : 'The parts library (tools/lpc/library) is missing' }, 'Character Builder');
      toolbar.querySelector('.tb-group')?.append(link);
    }).catch(() => {});
  }

  /* ---------------- status bar */
  const statusPos = h('span', { class: 'st-pos' }, '—');
  const statusHint = h('span', { class: 'st-hint' });
  const statusZoom = h('span', { class: 'st-zoom' });
  const meter = new BudgetMeter(false);
  const status = h('footer', { class: 'statusbar' }, statusPos, statusHint, meter.el, statusZoom);
  const updateBudget = () => { meter.el.hidden = !!store.map?.gba; meter.setCounts(countLights(store)); };
  store.on('map', updateBudget);
  updateBudget();
  view.onHover = (info) => { if (info && store.map.gba) { statusPos.textContent = `${info.x}, ${info.z}${info.zone ? ` · zone ${info.zone}` : ''}`; return; } statusPos.textContent = info ? `${info.x}, ${info.z} · ${info.terrain ? tileName(info.terrain) : ''} · height ${info.height}${store.rampAt(info.x, info.z) ? ` (${store.rampAt(info.x, info.z)!.style})` : ''}${info.water ? ` · ${info.water}` : ''}${info.passage ? ` · ${info.passage}` : ''}${info.zone ? ` · zone ${info.zone}` : ''}` : '—'; };
  const updateStatus = () => {
    const tool = isGbaMode(store.mode) ? store.gbaTool : store.mode === 'terrain' ? store.terrainTool : store.mode === 'water' ? store.waterMode : store.mode === 'height' ? store.heightTool : store.mode === 'props' ? store.propTool : store.mode === 'lights' ? store.lightTool : store.mode === 'buildings' ? store.buildingTool : store.mode === 'zones' && store.isBattleMap() ? 'markers' : store.mode === 'passage' || store.mode === 'zones' ? 'paint' : 'select';
    statusHint.textContent = MODE_HINTS[`${store.mode}:${tool}`] ?? '';
    statusZoom.textContent = `${view.zoomPercent}%`;
  };
  view.onView = (pct) => { const t = `${pct}%`; if (statusZoom.textContent !== t) statusZoom.textContent = t; };
  store.on('ui', updateStatus);

  const updateMeta = () => {
    const names = store.maps.includes(store.mapName) ? store.maps : [...store.maps, store.mapName];
    const opt = (n: string) => h('option', { value: n }, n + (n === store.mapName && (store.dirty || store.dbDirty) ? ' •' : ''));
    // Battle maps are listed apart, like a folder of their own.
    // Update 152: maps in folders (Map Properties → Folder), each folder a group of the list.
    const folders = store.db.mapFolders ?? {};
    const fieldMaps = names.filter((n) => !store.isBattleMap(n) && !folders[n]), battleMaps = names.filter((n) => store.isBattleMap(n) && !folders[n]);
    const named = [...new Set(names.map((n) => folders[n]).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b));
    const groups = [...named.map((f) => h('optgroup', { label: `📁 ${f}` }, ...names.filter((n) => folders[n] === f).map(opt))),
      ...(fieldMaps.length ? [h('optgroup', { label: 'Maps' }, ...fieldMaps.map(opt))] : []),
      ...(battleMaps.length ? [h('optgroup', { label: 'Battle maps' }, ...battleMaps.map(opt))] : [])];
    mapSelect.replaceChildren(...(named.length || battleMaps.length ? groups : names.map(opt)));
    mapSelect.value = store.mapName;
    const unsaved = store.dirty || store.dbDirty;
    saveState.textContent = !store.project.canSave ? 'Save exports JSON' : unsaved ? 'Unsaved changes' : 'All changes saved';
    saveState.classList.toggle('unsaved', unsaved);
    saveBtn.textContent = store.project.canSave ? 'Save' : 'Export';
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
    document.title = `${unsaved ? '• ' : ''}${store.mapName} – Map Editor`;
  };
  store.on('meta', updateMeta);
  store.on('map', () => { undoBtn.disabled = !store.canUndo; redoBtn.disabled = !store.canRedo; });

  // Update 150: one bar on the left (tools, lists and what's selected); drag its edge to make it wider.
  palette.setInspector(inspector.el);
  const grip = h('div', { class: 'side-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Drag to resize the panel', title: 'Drag to resize (double-click: back to normal)' });
  palette.el.append(grip);
  const layout = h('div', { class: 'layout' }, palette.el, h('main', { class: 'stage' }, view.el, view3d.el));
  update3d();
  const LEFT_KEY = 'hd2d.editorLeftWidth';
  const setLeft = (px: number | null) => {
    if (px === null) { layout.style.removeProperty('--left-w'); try { localStorage.removeItem(LEFT_KEY); } catch { /* storage off */ } return; }
    const w = Math.round(Math.max(220, Math.min(px, Math.max(320, window.innerWidth * 0.7))));
    layout.style.setProperty('--left-w', `${w}px`);
    try { localStorage.setItem(LEFT_KEY, String(w)); } catch { /* storage off */ }
  };
  try { const w = Number(localStorage.getItem(LEFT_KEY)); if (w) setLeft(w); } catch { /* storage off */ }
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-side');
    const left = layout.getBoundingClientRect().left;
    const move = (ev: PointerEvent) => setLeft(ev.clientX - left);
    const up = () => { document.body.classList.remove('resizing-side'); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); window.dispatchEvent(new Event('resize')); };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });
  grip.addEventListener('dblclick', () => { setLeft(null); window.dispatchEvent(new Event('resize')); });
  root.replaceChildren(toolbar, layout, status);

  function togglePanel(_side: 'left'): void {
    const open = !palette.el.classList.contains('open');
    palette.el.classList.toggle('open', open);
    toggleLeft.setAttribute('aria-expanded', String(open));
  }
  // On narrow screens, selecting something opens the panel (what's selected shows in it).
  store.on('selection', () => { if (store.selection && window.innerWidth <= 900 && !palette.el.classList.contains('open')) togglePanel('left'); });

  updateMeta();
  updateStatus();
  bindShortcuts(updateStatus);
  window.addEventListener('beforeunload', (e) => { if (store.dirty || store.dbDirty) { e.preventDefault(); e.returnValue = ''; } });
}

/* ------------------------------------------------------------ playtest */

/** Hand the current map, assets and imported images to the game (opened by the Playtest link). */
/** Combat preview from the Database: a playtest that opens straight into a battle. */
setCombatPreview((enemies, map) => {
  const stamp = String(Date.now());
  window.open(`${PLAYTEST_URL}=${stamp}`, '_blank');
  void playtest(stamp, { enemies, map });
});

async function playtest(stamp: string, battle?: { enemies: string[]; map?: string }, gbaPlay?: PlaytestData['gba']): Promise<void> {
  try {
    const used = new Set<string>();
    for (const d of store.assets.props) for (const p of [d.image, d.normal, d.glow, d.model]) if (p) used.add(p);
    for (const t of store.assets.tiles) for (const p of [t.image, t.normal, t.edges, t.corners]) if (p) used.add(p);
    // Update 153: this map's 3D model ground.
    { const f = store.map.scene3d?.src; if (f) { used.add(f); if (!store.files.has(f)) { try { store.files.set(f, await store.project.readFile(f)); } catch { /* the game tries the project */ } } } }
    { const f = store.map.groundModel?.src;
      if (f) { used.add(f); if (!store.files.has(f)) { try { store.files.set(f, await store.project.readFile(f)); } catch { /* the game tries the project */ } } } }
    for (const d of store.db.items ?? []) if (d.icon && !d.icon.startsWith('builtin:') && d.icon !== 'sprite') used.add(d.icon);
    // Imported sounds: read now the ones the game can't fetch itself (a project folder, or kept on this device).
    const kept = store.project.kind === 'browser' ? new Set(await changedFiles()) : null;
    for (const f of store.db.audio?.files ?? []) { used.add(f); await readSound(store, f, async () => !!kept?.has(f)); }
    for (const c of Object.values(store.db.characters)) if (c.sheet) used.add(c.sheet);
    for (const e of store.db.enemies ?? []) if (e.look.image) used.add(e.look.image);
    // 3D characters' model files (read now if they haven't been yet).
    for (const c of Object.values(store.db.characters)) for (const f of c.model ? [c.model.file, ...(c.model.extra ?? [])] : []) {
      used.add(f);
      if (!store.files.has(f)) { try { store.files.set(f, await store.project.readFile(f)); } catch { /* the game tries the project */ } }
    }
    // The title's picture or video.
    { const tb = store.db.menus?.titleBackground, f = tb?.kind === 'image' ? tb.image : tb?.kind === 'video' ? tb.video : undefined;
      if (f) { used.add(f); if (!store.files.has(f)) { try { store.files.set(f, await store.project.readFile(f)); } catch { /* the game tries the project */ } } } }
    // Heroes' face art (read now if it hasn't been yet).
    for (const x of store.db.heroes ?? []) if (x.face) {
      used.add(x.face);
      if (!store.files.has(x.face)) { try { store.files.set(x.face, await store.project.readFile(x.face)); } catch { /* the game tries the project */ } }
    }
    // LPC weapon sprites in use, with their list (read into the editor's files so file-based projects hand them over).
    const weapons = usedWeaponSprites(store.db), wl = await loadWeaponList(store);
    // Icons cut from weapon sprites need their sheet too (or the built-in thumbs).
    const iconSprites = (store.db.items ?? []).filter((d) => d.icon === 'sprite').map((d) => itemWeaponSprite(d)).filter(Boolean);
    await loadWeaponSheets(store, [...weapons, ...iconSprites]);
    if (wl) { used.add(WEAPON_MANIFEST_PATH); used.add(WEAPON_MANIFEST_PATH.replace('weapons.json', 'thumbs.png')); }
    for (const id of [...weapons, ...iconSprites]) { const d = findWeapon(store, wl, id); if (d) used.add(d.file); }
    // Sounds from the audio folders in use (a project folder opened as a file hands them over; servers serve them).
    if (store.project.kind === 'folder') {
      const text = JSON.stringify(store.db) + JSON.stringify(store.map);
      for (const m of text.matchAll(/"(audio\/[^"]+\.(?:ogg|mp3|wav|m4a|flac))"/gi)) {
        const f = m[1]; used.add(f);
        if (!store.files.has(f)) { try { store.files.set(f, await store.project.readFile(f)); } catch { /* missing */ } }
      }
    }
    const files: Record<string, Blob> = {};
    for (const p of used) { const b = store.files.get(p); if (b) files[p] = b; }
    // Every other map too, so transfers work. Maps that can't be read are left out (the game then tries the project).
    const maps: Record<string, MapData> = {};
    await Promise.all(store.maps.filter((n) => n !== store.mapName).map(async (n) => {
      try { maps[n] = await store.project.readMap(n); } catch { /* not readable here */ }
    }));
    await writePlaytest({
      db: store.db, mapName: store.mapName, map: store.map, maps, start: store.startHere ? store.db.start : undefined,
      assets: store.assets, files, stamp, battle, gba: gbaPlay,
    });
  } catch (err) {
    toast(`Couldn’t start the playtest: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

/** Dynamic lights on the open map, including those carried by props. */
function countLights(s: EditorStore): LightCounts {
  const c: LightCounts = { point: 0, spot: 0, pointShadows: 0, spotShadows: 0, area: 0 };
  if (!s.map) return c;
  for (const l of s.map.lights) {
    if (l.type === 'area') c.area++;
    else if (l.type === 'spot') { c.spot++; if (l.shadows) c.spotShadows++; }
    else { c.point++; if (l.shadows) c.pointShadows++; }
  }
  for (const p of s.map.props) {
    const l = s.catalog.get(p.type)?.light;
    if (l) { c.point++; if (l.shadows) c.pointShadows++; }
  }
  return c;
}

/* ------------------------------------------------------------ maps */

async function switchMap(name: string): Promise<void> {
  if (name === store.mapName) return;
  const go = async () => {
    try {
      const map = await store.project.readMap(name);
      store.open(name, map);
      view.fit();
    } catch (err) {
      toast(`Couldn't open ${name}: ${err instanceof Error ? err.message : String(err)}`, 'error');
      store.emit('meta');
    }
  };
  if (store.dirty) confirmModal('Discard changes?', `“${store.mapName}” has unsaved changes. Open “${name}” anyway?`, 'Discard and open', () => void go(), true);
  else await go();
  store.emit('meta');
}

/** Mimas: play the open GBA map on a GBA screen, in a frame over the editor (the game page in GBA mode). */
async function playGba(): Promise<void> {
  if (!store.map.gba || document.querySelector('.gba-play')) return;
  const stamp = String(Date.now());
  const shell = h('div', { class: 'gba-play' });
  const frame = h('iframe', { class: 'gba-play-frame', title: 'GBA playtest', src: `${PLAYTEST_URL.replace('?playtest', '?gbaplay')}=${stamp}` }) as HTMLIFrameElement;
  const close = () => { shell.remove(); window.removeEventListener('message', onMsg); window.removeEventListener('resize', fit); };
  const onMsg = (e: MessageEvent) => { if (e.data === 'gba-play-close') close(); };
  const fit = () => {
    const sc = Math.max(1, Math.floor(Math.min((innerWidth - 24) / 240, (innerHeight - 80) / 160)));
    frame.style.width = `${240 * sc}px`;
    frame.style.height = `${160 * sc}px`;
  };
  shell.append(h('div', { class: 'gba-play-bar' }, h('strong', {}, 'GBA playtest'),
    h('span', {}, 'Arrows walk · Z / Space = A · X = B (hold to run) · Enter = START (menu) · Esc stops'),
    h('button', { type: 'button', class: 'btn', onclick: close }, 'Stop')), frame);
  document.body.append(shell);
  fit();
  window.addEventListener('message', onMsg);
  window.addEventListener('resize', fit);
  frame.addEventListener('load', () => frame.contentWindow?.focus());
  try {
    await playtest(stamp, undefined, await gbaHandoff());
  } catch (err) {
    toast(`Couldn’t start the GBA playtest: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

/** GBA Studio's art and the pictures the editor draws for props, characters and enemies, for the GBA playtest. */
async function gbaHandoff(): Promise<PlaytestData['gba']> {
  const blob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('picture'))), 'image/png'));
  const images: Record<string, Blob> = {};
  for (const [path, c] of gba.images) images[path] = await blob(c);
  // Battle backgrounds the maps use (the built-ins, or your pictures in their place).
  const backs = battlebackList(gba.data);
  const usedBacks = new Set<string>();
  const pics: NonNullable<PlaytestData['gba']>['pics'] = {};
  const maps: MapData[] = [store.map];
  await Promise.all(store.maps.filter((n) => n !== store.mapName).map(async (n) => { try { maps.push(await store.project.readMap(n)); } catch { /* skipped */ } }));
  const want = new Set<string>();
  for (const m of maps) {
    if (!m.gba) continue;
    if (m.battleBack) usedBacks.add(m.battleBack);
    for (const p of m.props) want.add(`prop:${p.type}`);
    for (const ev of m.events) for (const pg of ev.pages) {
      if (pg.character) { for (const d of ['down', 'up', 'left', 'right']) want.add(`char:${pg.character}:${d}`); want.add(`charsheet:${pg.character}:`); }
      if (pg.sprite) want.add(`prop:${pg.sprite}`);
    }
  }
  for (const d of ['down', 'up', 'left', 'right']) want.add(`char:${store.db.player}:${d}`);
  want.add(`charsheet:${store.db.player}:`);
  // The party's looks (party lists, battle backs).
  for (const hero of store.db.heroes ?? []) if (hero.look) for (const d of ['down', 'up', 'left']) want.add(`char:${hero.look}:${d}`);
  for (const k of want) {
    const [kind, id, dir] = k.split(':');
    let c: HTMLCanvasElement | null = null, w = 0, hh = 0;
    if (kind === 'prop') { const sp = propSprite(id); c = sp.img as HTMLCanvasElement; w = sp.w; hh = sp.h; }
    else if (kind === 'char' && store.db.characters[id]) { c = characterImage(id, store.db.characters[id], dir as Dir); w = c.width; hh = c.height; }
    else if (kind === 'charsheet' && store.db.characters[id]) { c = characterOverworldSheet(id, store.db.characters[id]); w = c.width; hh = c.height; }
    if (c && c.width && c.height) pics[k] = { blob: await blob(c), w, h: hh };
  }
  for (const e of store.db.enemies ?? []) {
    let c = enemyBattleImage(store.db, e.look);
    if (c && e.tint) c = tintCanvas(c, e.tint);
    if (c && c.width && c.height) pics[`enemy:${e.id}`] = { blob: await blob(c), w: c.width, h: c.height };
  }
  for (const id of usedBacks) {
    const b = backs.find((x) => x.id === id);
    if (b && !images[b.image]) { try { images[b.image] = await store.project.readFile(b.image); } catch { /* none */ } }
  }
  return { data: gba.data, images, pics };
}

function newMapDialog(): void {
  let n = store.maps.length + 1;
  while (store.maps.includes(`map${String(n).padStart(3, '0')}`)) n++;
  const grounds = gba.data.tiles.filter((t) => t.type === 'ground');
  const data = { file: `map${String(n).padStart(3, '0')}`, name: 'New Map', width: 30, height: 20, base: grounds[0]?.id ?? '', kind: 'field' as 'field' | 'battle' };
  const err = h('p', { class: 'form-error', role: 'alert' });
  const body = h('div', { class: 'form' },
    field('File name', textInput(data.file, (v) => (data.file = v.trim())), 'Letters, numbers, - and _ only. Saved as public/data/maps/<name>.json'),
    field('Display name', textInput(data.name, (v) => (data.name = v))),
    field('Kind', select([['field', 'Map (to walk around)'], ['battle', 'Battle map (a stage for turn-based battles)']], data.kind, (v) => (data.kind = v as 'field' | 'battle')),
      'Battle maps are listed apart and start with party and enemy markers.'),
    h('div', { class: 'field-row' },
      field('Width', numberInput(data.width, (v) => (data.width = Math.round(Math.min(128, Math.max(15, v)))), { min: 15, max: 128 })),
      field('Height', numberInput(data.height, (v) => (data.height = Math.round(Math.min(128, Math.max(10, v)))), { min: 10, max: 128 }))),
    grounds.length ? field('Fill with', select(grounds.map((t) => [t.id, t.name] as [string, string]), data.base, (v) => (data.base = v)), 'A Ground tile from GBA Studio.')
      : h('p', { class: 'note' }, 'Tip: make a Ground tile in GBA Studio first, so new maps start filled with it.'),
    h('p', { class: 'note' }, 'The GBA screen shows 15 × 10 tiles, so maps at least that big fill the screen.'),
    err);
  openModal('New map', body, [
    { label: 'Cancel' },
    { label: 'Create', primary: true, onClick: () => {
      if (!/^[A-Za-z0-9_-]+$/.test(data.file)) { err.textContent = 'Use only letters, numbers, - and _ in the file name.'; return false; }
      if (store.maps.includes(data.file)) { err.textContent = `A map called “${data.file}” already exists.`; return false; }
      const create = () => {
        const map: MapData = {
          name: data.name || data.file, width: data.width, height: data.height,
          terrain: Array.from({ length: data.height }, () => '.'.repeat(data.width)),
          props: [], lights: [], events: [],
          gba: blankLayers(data.width, data.height, data.base || undefined),
        };
        if (data.kind === 'battle') {
          // Three party markers near the bottom middle, three enemies above them.
          const cx = Math.floor(data.width / 2), cz = Math.floor(data.height / 2);
          map.kind = 'battle';
          map.markers = [
            ...[0, -2, 2].map((dx) => ({ side: 'party' as const, x: cx + dx, z: Math.min(data.height - 2, cz + 3) })),
            ...[0, -2, 2].map((dx) => ({ side: 'enemy' as const, x: cx + dx, z: Math.max(1, cz - 2 - (dx ? 1 : 0)) })),
          ];
        }
        store.mapKinds.set(data.file, data.kind);
        store.open(data.file, map, true);
        view.fit();
        toast(`Created ${data.file}. Save to write it to your project.`);
      };
      if (store.dirty) { confirmModal('Discard changes?', `“${store.mapName}” has unsaved changes. Create a new map anyway?`, 'Discard and create', create, true); return; }
      create();
    } },
  ]);
}

/* ------------------------------------------------------------ shortcuts */

function bindShortcuts(updateStatus: () => void): void {
  window.addEventListener('keydown', (e) => {
    if (document.querySelector('.overlay')) return; // a dialog is open
    if (document.querySelector('.gba-play')) { if (e.key === 'Escape') document.querySelector('.gba-play')?.remove(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void save(store); return; }
    if (isTyping(e)) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); store.redo(); return; }
    // Events: copy the selected one, paste on the tile under the mouse (or the selected tile).
    if (mod && e.key.toLowerCase() === 'c' && store.selection?.kind === 'event') {
      e.preventDefault();
      const ev = store.event(store.selection.id);
      if (ev && store.copyEvent(ev.id)) { toast(`Copied “${ev.name}”. Point at a tile and press Ctrl+V.`); store.emit('selection'); }
      return;
    }
    if (mod && e.key.toLowerCase() === 'v' && store.mode === 'events') {
      e.preventDefault();
      const sel = store.selection;
      const at = view.hoveredTile() ?? (sel?.kind === 'tile' ? { x: sel.x, z: sel.z } : null);
      if (!at) { toast('Point at a tile on the map, then press Ctrl+V.', 'error'); return; }
      const r = store.pasteEvent(at.x, at.z);
      if (typeof r === 'string') toast(r, 'error');
      return;
    }
    if (mod || e.altKey) return;
    const k = e.key.toLowerCase();
    const modes: Record<string, Mode> = Object.fromEntries(MODES.map(([m, , key]) => [key, m]));
    if (modes[k]) { store.mode = modes[k]; store.select(null); store.emit('ui'); return; }
    if (store.mode === 'height' && k === 'e') { store.heightTool = 'ramp'; store.rampTool = 'erase'; store.emit('ui'); return; }
    if (store.mode === 'water' && 'fpxrg'.includes(k) && k.length === 1) { store.waterMode = ({ f: 'fill', p: 'paint', x: 'remove', r: 'style', g: 'fish' } as const)[k as 'f' | 'p' | 'x' | 'r' | 'g']; store.emit('ui'); return; }
    if (store.mode === 'height' && k === 'w') { store.mode = 'water'; store.emit('ui'); return; }
    if (store.mode === 'height' && 'rlsagy'.includes(k) && k.length === 1) { store.heightTool = ({ r: 'raise', l: 'lower', s: 'set', a: 'ramp', g: 'fill', y: 'style' } as const)[k as 'r' | 'l' | 's' | 'a' | 'g' | 'y']; if (k === 'a') store.rampTool = 'place'; store.emit('ui'); return; }
    if (store.mode === 'passage' && 'clxoe'.includes(k) && k.length === 1) { store.passageFlag = k === 'e' ? '.' : (k as 'c' | 'l' | 'x' | 'o'); store.emit('ui'); return; }
    if (isGbaMode(store.mode) && (k === 'b' || k === 'r' || k === 'g' || k === 'e')) { store.gbaTool = ({ b: 'pencil', r: 'rect', g: 'fill', e: 'erase' } as const)[k]; store.emit('ui'); return; }
    if (store.mode === 'terrain' && (k === 'b' || k === 'r' || k === 'g')) { store.terrainTool = k === 'b' ? 'pencil' : k === 'r' ? 'rect' : 'fill'; store.emit('ui'); return; }
    if (store.mode === 'props' && 'psve'.includes(k) && k.length === 1) { store.propTool = ({ p: 'place', s: 'scatter', v: 'select', e: 'erase' } as const)[k as 'p' | 's' | 'v' | 'e']; store.emit('ui'); return; }
    if (store.mode === 'buildings' && (k === 'd' || k === 'v')) { store.buildingTool = k === 'd' ? 'draw' : 'select'; store.emit('ui'); return; }
    if (store.mode === 'lights' && 'pve'.includes(k) && k.length === 1) { store.lightTool = ({ p: 'place', v: 'select', e: 'erase' } as const)[k as 'p' | 'v' | 'e']; store.emit('ui'); return; }
    if (k === 'f') { view.fit(); updateStatus(); return; }
    if (k === '+' || k === '=') { view.zoomBy(1.25); updateStatus(); return; }
    if (k === '-') { view.zoomBy(1 / 1.25); updateStatus(); return; }
    if (k === 'escape') { store.select(null); return; }
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelection(); }
  });
}

function deleteSelection(): void {
  const s = store.selection;
  if (!s) return;
  if (s.kind === 'prop') { store.checkpoint(); store.map.props.splice(s.index, 1); }
  else if (s.kind === 'light') { store.checkpoint(); store.map.lights.splice(s.index, 1); }
  else if (s.kind === 'building') { store.checkpoint(); store.map.buildings!.splice(s.index, 1); if (!store.map.buildings!.length) delete store.map.buildings; }
  else if (s.kind === 'event') { store.checkpoint(); store.map.events = store.map.events.filter((e) => e.id !== s.id); }
  else if (s.kind === 'ramp') { store.checkpoint(); store.map.ramps = (store.map.ramps ?? []).filter((r) => r.x !== s.x || r.z !== s.z); }
  else return;
  store.select(null);
  store.changed('structure');
  toast('Deleted. Ctrl+Z to undo.');
}

boot().catch((err: unknown) => {
  root.replaceChildren(h('div', { class: 'boot-error' }, `The editor couldn't start: ${err instanceof Error ? err.message : String(err)}`));
});
