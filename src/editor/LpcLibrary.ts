/**
 * The LPC library: browse the LPC Revised tiles and props that come with the project (public/assets/lpc-library/,
 * all OGA-BY 3.0, so Steam-safe with credit) and add the ones you pick to the project, where they become ordinary
 * imported props and tiles. Their credits travel with them to the Credits screen.
 */
import { propIdFromName } from '../world/props';
import { freeTileKey, MAX_CUSTOM_TILES } from '../world/tiles';
import type { PropDef, SpriteCredit, TileDef } from '../world/types';
import { commitProp, commitTile } from './assets';
import { h, openModal, toast } from './dom';
import type { EditorStore } from './store';

export const LIBRARY_PATH = 'assets/lpc-library/library.json';
const ROOT = 'assets/lpc-library/';

export interface LibraryEntry {
  id: string; name: string; kind: 'prop' | 'tile'; group: string; season?: string;
  sheet: string; glow?: string; x: number; y: number; w: number; h: number; credits: SpriteCredit[];
}
interface Library { entries: LibraryEntry[]; url: string; pixelsPerTile: number }

let libLoad: Promise<Library | null> | null = null;
function loadLibrary(store: EditorStore): Promise<Library | null> {
  libLoad ??= store.project.readFile(LIBRARY_PATH).then(async (b) => JSON.parse(await b.text()) as Library).catch(() => null);
  return libLoad;
}

const sheets = new Map<string, Promise<ImageBitmap | null>>();
function sheet(store: EditorStore, path: string): Promise<ImageBitmap | null> {
  let p = sheets.get(path);
  if (!p) {
    p = store.project.readFile(ROOT + path).then((b) => createImageBitmap(b)).catch(() => null);
    sheets.set(path, p);
  }
  return p;
}

/** The entry's pixels as a canvas (its own size). */
async function crop(store: EditorStore, e: LibraryEntry, path = e.sheet): Promise<HTMLCanvasElement | null> {
  const img = await sheet(store, path);
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = e.w; c.height = e.h;
  c.getContext('2d')!.drawImage(img, e.x, e.y, e.w, e.h, 0, 0, e.w, e.h);
  return c;
}

const toPng = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encoding failed'))), 'image/png'));

/** Groups whose props are flat or small: they don't block the way. */
const WALK_THROUGH = new Set(['Flowers', 'Food', 'Small items', 'Wall decor', 'Ores', 'Crafts']);

/** Add a library prop to the project. */
async function addProp(store: EditorStore, e: LibraryEntry, ppt: number): Promise<boolean> {
  const img = await crop(store, e);
  if (!img) { toast(`Couldn’t read the sheet for “${e.name}”.`, 'error'); return false; }
  const glow = e.glow ? await crop(store, e, e.glow) : null;
  const w = Math.round((e.w / ppt) * 100) / 100, hgt = Math.round((e.h / ppt) * 100) / 100;
  const id = store.catalog.get(e.id) ? propIdFromName(e.id, (x) => !!store.catalog.get(x)) : e.id;
  const blocks = !WALK_THROUGH.has(e.group) && hgt >= 0.75;
  const def: PropDef = {
    id, name: e.name, w, h: hgt, filter: 'point',
    block: blocks ? Array.from({ length: Math.max(1, Math.round(w)) }, (_, i) => i + 0.5 - Math.max(1, Math.round(w)) / 2) : [],
    credits: e.credits,
  };
  if (glow) def.glowColor = '#ffc86b';
  return commitProp(store, def, { image: await toPng(img), glow: glow ? await toPng(glow) : undefined }, img);
}

/** Add a library tile to the project (a repeating texture; walls and roofs of buildings can use it too). */
async function addTile(store: EditorStore, e: LibraryEntry, ppt: number): Promise<string | null> {
  const key = freeTileKey((k) => !!store.tiles.get(k));
  if (!key) { toast(`You’ve reached the limit of ${MAX_CUSTOM_TILES} imported tiles.`, 'error'); return null; }
  const img = await crop(store, e);
  if (!img) { toast(`Couldn’t read the sheet for “${e.name}”.`, 'error'); return null; }
  const id = store.tiles.all().some((t) => t.id === e.id) ? `${e.id}_${key.charCodeAt(0)}` : e.id;
  const def: TileDef = { key, id, name: e.name, span: Math.max(1, Math.round(e.w / ppt)), filter: 'point', credits: e.credits };
  return (await commitTile(store, def, { image: await toPng(img) }, img)) ? key : null;
}

/** Already in the project (added before)? */
function added(store: EditorStore, e: LibraryEntry): boolean {
  return e.kind === 'prop' ? store.assets.props.some((d) => d.id === e.id) : store.assets.tiles.some((t) => t.id === e.id);
}

const SEASONS = ['all', 'spring', 'summer', 'autumn', 'winter'];

/** Open the library, showing props or tiles first. */
export async function openLpcLibrary(store: EditorStore, kind: 'prop' | 'tile'): Promise<void> {
  const lib = await loadLibrary(store);
  if (!lib) {
    toast('The LPC library isn’t in this project (public/assets/lpc-library/). Copy it over from the latest engine zip.', 'error');
    return;
  }
  const st = { kind, group: '', season: 'summer', q: '', limit: 120, picked: new Set<LibraryEntry>() };
  const groupsOf = (k: string) => [...new Set(lib.entries.filter((e) => e.kind === k).map((e) => e.group))];
  const body = h('div', { class: 'lib' });
  const count = h('span', { class: 'lib-count' });
  let close = () => {};

  const thumb = (e: LibraryEntry) => {
    const size = 72, c = h('canvas', { class: 'lib-thumb', width: size, height: size });
    void sheet(store, e.sheet).then((img) => {
      if (!img) return;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      // Whole pixels where it fits, shrunk otherwise; tiles are shown repeated 2 × 2.
      if (e.kind === 'tile') { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.drawImage(img, e.x, e.y, e.w, e.h, (dx * size) / 2, (dy * size) / 2, size / 2, size / 2); return; }
      const k = Math.min(2, size / e.w, size / e.h), w = e.w * k, hh = e.h * k;
      if (k < 1) g.imageSmoothingEnabled = true;
      g.drawImage(img, e.x, e.y, e.w, e.h, (size - w) / 2, size - hh, w, hh);
    });
    return c;
  };

  const render = () => {
    const groups = groupsOf(st.kind);
    const q = st.q.trim().toLowerCase();
    // Searching looks through every group.
    const list = lib.entries.filter((e) => e.kind === st.kind && (!st.group || q || e.group === st.group)
      && (st.season === 'all' || !e.season || e.season === st.season) && (!q || e.name.toLowerCase().includes(q) || e.group.toLowerCase().includes(q)));
    const shown = list.slice(0, st.limit);
    count.textContent = st.picked.size ? `${st.picked.size} picked` : `${list.length} ${st.kind === 'prop' ? 'props' : 'tiles'}`;
    body.replaceChildren(
      h('div', { class: 'lib-bar' },
        h('div', { class: 'toolrow', role: 'group', 'aria-label': 'Kind' }, ...([['prop', 'Props'], ['tile', 'Tiles']] as const).map(([k, label]) =>
          h('button', { type: 'button', class: 'tool', 'aria-pressed': String(st.kind === k), onclick: () => { st.kind = k; st.group = ''; st.limit = 120; render(); } }, label))),
        h('input', { type: 'search', class: 'lib-search', placeholder: 'Search (tree, chair, brick…)', value: st.q, 'aria-label': 'Search the library',
          oninput: (ev: Event) => { st.q = (ev.target as HTMLInputElement).value; st.limit = 120; render(); (body.querySelector('.lib-search') as HTMLInputElement | null)?.focus(); } }),
        h('select', { 'aria-label': 'Season', onchange: (ev: Event) => { st.season = (ev.target as HTMLSelectElement).value; render(); } },
          ...SEASONS.map((s) => h('option', { value: s, selected: st.season === s }, s === 'all' ? 'All seasons' : s[0].toUpperCase() + s.slice(1))))),
      h('div', { class: 'presets lib-groups' },
        h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!st.group), onclick: () => { st.group = ''; st.limit = 120; render(); } }, 'All'),
        ...groups.map((g) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(st.group === g), onclick: () => { st.group = g; st.limit = 120; render(); } }, g))),
      shown.length
        ? h('div', { class: 'lib-grid' }, ...shown.map((e) => {
          const have = added(store, e), on = st.picked.has(e);
          return h('button', { type: 'button', class: 'lib-cell', 'aria-pressed': String(on), disabled: have,
            title: `${e.name} · ${(e.w / lib.pixelsPerTile).toFixed(1)} × ${(e.h / lib.pixelsPerTile).toFixed(1)} tiles · ${e.credits.map((c) => c.authors.join(', ')).join('; ')}`,
            onclick: () => { if (on) st.picked.delete(e); else st.picked.add(e); render(); } },
            thumb(e), h('span', { class: 'lib-name' }, have ? `✓ ${e.name}` : e.name));
        }))
        : h('p', { class: 'note' }, 'Nothing matches.'),
      list.length > shown.length ? h('button', { type: 'button', class: 'btn small', onclick: () => { st.limit += 240; render(); } }, `Show more (${list.length - shown.length} left)`) : h('span'),
    );
  };

  const addPicked = async () => {
    const picks = [...st.picked];
    if (!picks.length) { toast('Pick some first: click them in the grid.', 'error'); return false; }
    let props = 0, tiles = 0, lastProp = '', lastTile = '';
    for (const e of picks) {
      if (e.kind === 'prop') { if (await addProp(store, e, lib.pixelsPerTile)) { props++; lastProp = store.assets.props[store.assets.props.length - 1].id; } }
      else { const k = await addTile(store, e, lib.pixelsPerTile); if (k) { tiles++; lastTile = k; } }
    }
    if (lastProp && !lastTile) { store.mode = 'props'; store.propType = lastProp; store.propTool = 'place'; }
    if (lastTile) { store.mode = 'terrain'; store.terrain = lastTile; }
    store.emit('ui');
    toast(`Added ${[props ? `${props} prop${props === 1 ? '' : 's'}` : '', tiles ? `${tiles} tile${tiles === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')} to the project.`);
    close();
    return true;
  };

  render();
  close = openModal('LPC library', body, [
    { label: 'Cancel' },
    { label: 'Add to project', primary: true, onClick: () => { void addPicked(); return false; } },
  ], undefined, { wide: true, footStart: h('span', { class: 'lib-foot' }, count, ' · LPC Revised by Eliza Wyatt and others (OGA-BY 3.0, credited automatically)') });
}
