/**
 * Saving through the current project (dev server or project folder).
 * When the editor can't write files (a hosted or preview copy) it shows an export dialog instead.
 */
import { formatDatabase, formatMap } from '../shared/dataFiles';
import { h, openModal, toast } from './dom';
import type { EditorStore } from './store';
import { blockedTiles } from '../world/props';
import { propSprite } from './editorArt';

/** File name for a prop's GBA picture (public/gba/props/<name>.png). */
export const propFile = (type: string): string => `gba/props/${type.replace(/[^A-Za-z0-9_.-]/g, '_')}.png`;
const bakedThisSession = new Set<string>();

/**
 * Mimas: before a GBA map is saved, the cells its props block go into its GBA layers (`propCells`), and each kind of
 * prop's picture is written to public/gba/props at map scale (16 pixels a tile), for tools/export.py to draw.
 */
async function bakeProps(store: EditorStore): Promise<void> {
  const m = store.map, g = m.gba!;
  const cells = new Set<string>();
  for (const p of m.props) {
    const def = store.catalog.get(p.type);
    if (!def) continue;
    for (const [x, z] of blockedTiles(def, p.x, p.z, p.s ?? 1)) if (x >= 0 && z >= 0 && x < m.width && z < m.height) cells.add(`${x},${z}`);
  }
  g.propCells = [...cells].map((k) => k.split(',').map(Number) as [number, number]);
  if (!store.project.canStoreImages) return;
  for (const type of new Set(m.props.map((p) => p.type))) {
    if (bakedThisSession.has(type)) continue;
    const sp = propSprite(type);
    const w = Math.max(1, Math.round(sp.w)), h = Math.max(1, Math.round(sp.h));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sp.img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) continue;
    try { await store.project.writeFile(propFile(type), blob); bakedThisSession.add(type); } catch { /* the ROM leaves it out */ }
  }
}

export async function save(store: EditorStore): Promise<void> {
  // Mimas: what the ROM needs from the props, worked out here (their art and footprints live in the editor).
  if (store.map.gba && store.project.canSave) await bakeProps(store);
  const files: [string, string][] = [[`maps/${store.mapName}.json`, formatMap(store.map)]];
  if (store.dbDirty) files.push(['database.json', formatDatabase(store.db)]);

  if (store.project.canSave) {
    try {
      for (const [file, text] of files) await store.project.write(file, text);
      store.dirty = false;
      store.dbDirty = false;
      if (!store.maps.includes(store.mapName)) store.maps = [...store.maps, store.mapName].sort();
      store.emit('meta');
      toast(store.project.kind === 'browser' ? 'Saved on this device (Project → Push to GitHub, or Save changes as .zip)' : `Saved ${files.map(([f]) => f).join(' and ')}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast(/permission|not allowed/i.test(msg) ? 'Couldn’t save: the browser no longer has permission for the project folder. Reload the editor and reopen it.' : `Couldn’t save: ${msg}`, 'error');
    }
    return;
  }
  exportDialog(store, files);
}

function exportDialog(store: EditorStore, files: [string, string][]): void {
  const body = h('div', { class: 'export' },
    h('p', { class: 'modal-text' }, 'This copy of the editor can’t write to your project. Open “Map Editor.html” from your project folder to save directly. Meanwhile, copy each file’s contents into public/data/ yourself:'),
    ...files.map(([file, text]) => {
      const area = h('textarea', { class: 'code', readonly: true, rows: 8, spellcheck: 'false' });
      area.value = text;
      const copy = h('button', { type: 'button', class: 'btn', onclick: async () => {
        try { await navigator.clipboard.writeText(text); toast(`Copied ${file}`); }
        catch { area.focus(); area.select(); toast('Press Ctrl+C to copy the selected text'); }
      } }, 'Copy');
      return h('div', { class: 'export-file' }, h('div', { class: 'export-head' }, h('code', {}, `public/data/${file}`), copy), area);
    }));
  openModal('Export map', body, [{ label: 'Done', primary: true, onClick: () => { store.dirty = false; store.dbDirty = false; store.emit('meta'); } }]);
}

/**
 * Save just database.json (the Database window's Apply). 'saved': written; 'export': this copy can't write files
 * (Save shows the export dialog); 'failed': writing went wrong (a toast says why).
 */
export async function saveDatabase(store: EditorStore): Promise<'saved' | 'export' | 'failed'> {
  if (!store.project.canSave) return 'export';
  try {
    await store.project.write('database.json', formatDatabase(store.db));
    store.dbDirty = false;
    store.emit('meta');
    return 'saved';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast(`Couldn’t save the database: ${msg}`, 'error');
    return 'failed';
  }
}
