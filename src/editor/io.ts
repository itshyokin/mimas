/**
 * Saving through the current project (dev server or project folder).
 * When the editor can't write files (a hosted or preview copy) it shows an export dialog instead.
 */
import { fitInto, heroBattleImage, trim } from './battleArt';
import { formatDatabase, formatMap } from '../shared/dataFiles';
import { h, openModal, toast } from './dom';
import type { EditorStore } from './store';
import { blockedTiles } from '../world/props';
import { characterImage, characterOverworldSheet, enemyBattleImage, propSprite } from './editorArt';
import { tintCanvas } from '../render/tint';
import { builtinIcon, builtinIconName } from '../art/itemIcons';
import { mainHero } from '../world/heroes';
import { romGameData, romSoundFile, romSounds } from './gbaGame';
import { gba } from './gbaShared';
import { makeChipSfx } from '../audio/chip';
import { RATE, SFX_NAMES, type SfxName } from '../audio/synth';

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
  // Props on the map, and the object sprites events show (a chest, a sign): the ROM draws both from these pictures.
  const used = new Set(m.props.map((p) => p.type));
  for (const ev of m.events) for (const pg of ev.pages) if (pg.sprite && !pg.gbaSprite) used.add(pg.sprite);
  for (const type of used) {
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

/** What was written this session (by file), so unchanged pictures aren't written again. */
const bakedArt = new Map<string, string>();

/** A project picture as a canvas (null if it can't be read). */
export async function readCanvas(store: EditorStore, path: string): Promise<HTMLCanvasElement | null> {
  try {
    const bmp = await createImageBitmap(await store.project.readFile(path));
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close();
    return c;
  } catch { return null; }
}

async function blobOf(c: HTMLCanvasElement): Promise<Blob | null> { return new Promise((res) => c.toBlob(res, 'image/png')); }

/**
 * Mimas: the battle and menu art the ROM needs, drawn here (the editor makes these pictures; the exporter can't):
 * each enemy's front (64 × 64), each hero's back (64 × 64) and face (16 × 16), and each item's icon (16 × 16),
 * into public/gba/enemies, heroes and items.
 */
async function bakeGameArt(store: EditorStore): Promise<void> {
  if (!store.project.canStoreImages) return;
  const db = store.db, out: [string, HTMLCanvasElement][] = [];
  for (const e of db.enemies ?? []) {
    let c = enemyBattleImage(db, e.look);
    if (c && e.tint) c = tintCanvas(c, e.tint);
    if (c && c.width && c.height) out.push([`gba/enemies/${e.id}.png`, fitInto(trim(c), 64, 64)]);
  }
  const first = mainHero(db).id;
  for (const hero of db.heroes ?? []) {
    const look = hero.look ?? (hero.id === first ? db.player : undefined);
    // The battle picture (Database → Heroes → Battle picture; the default is their character side-on, ×2).
    const custom = hero.battleLook?.mode === 'image' && hero.battleLook.image ? await readCanvas(store, hero.battleLook.image) : null;
    const bp = heroBattleImage(db.characters, hero, look, custom);
    if (bp) out.push([`gba/heroes/${hero.id}_back.png`, bp]);
    const ch = look ? db.characters[look] : undefined;
    if (!look || !ch) continue;
    const front = characterImage(look, ch, 'down');
    if (front.width && front.height) {
      const t = trim(front), head = document.createElement('canvas');
      head.width = t.width; head.height = Math.min(t.height, t.width);
      head.getContext('2d')!.drawImage(t, 0, 0);
      out.push([`gba/heroes/${hero.id}_face.png`, fitInto(head, 16, 16, false)]);
    }
  }
  // Saturn characters as GBA overworld sheets (the player when GBA Studio has no player sprite, and people events show).
  const looks = new Set<string>([db.player]);
  for (const ev of store.map.events) for (const pg of ev.pages) if (pg.character && !pg.gbaSprite) looks.add(pg.character);
  for (const k of looks) if (db.characters[k]) out.push([`gba/chars/${k.replace(/[^A-Za-z0-9_.-]/g, '_')}.png`, characterOverworldSheet(k, db.characters[k])]);
  for (const it of db.items ?? []) {
    const b = builtinIconName(it.icon);
    let c: HTMLCanvasElement | null = null;
    if (b) c = builtinIcon(b, it.iconTint);
    else if (it.icon && it.icon !== 'sprite') {
      try { const bmp = await createImageBitmap(await store.project.readFile(it.icon)); c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d')!.drawImage(bmp, 0, 0); bmp.close(); } catch { c = null; }
    }
    c ??= builtinIcon(it.slot === 'ranged' ? 'bow' : it.slot === 'shield' ? 'shield' : it.slot ? 'sword' : 'potion');
    if (c.width && c.height) out.push([`gba/items/${it.id}.png`, fitInto(c, 16, 16, false)]);
  }
  await bakeSounds(store);
  for (const [file, c] of out) {
    const key = c.toDataURL();
    if (bakedArt.get(file) === key) continue;
    const blob = await blobOf(c);
    if (!blob) continue;
    try { await store.project.writeFile(file, blob); bakedArt.set(file, key); } catch { /* the ROM uses a stand-in */ }
  }
}

/** 8-bit unsigned mono WAV at `rate` from samples (−1 … 1) at `from` Hz. */
function wav8(samples: Float32Array, from: number, rate = 16000): Blob {
  const n = Math.max(1, Math.floor((samples.length * rate) / from));
  const buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const str = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const gain = peak > 0.95 ? 0.95 / peak : 1;
  for (let i = 0; i < n; i++) {
    // averaged over the source samples this one covers (a simple low-pass against aliasing)
    const a = Math.floor((i * from) / rate), b = Math.max(a + 1, Math.floor(((i + 1) * from) / rate));
    let sum = 0;
    for (let k = a; k < b && k < samples.length; k++) sum += samples[k];
    const x = Math.max(-1, Math.min(1, (sum / (b - a)) * gain));
    v.setUint8(44 + i, Math.round(128 + x * 127));
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/**
 * Mimas: the ROM's sounds, as 8-bit WAVs in public/gba/sounds: built-in sounds as their Game Boy-style chip versions
 * (or the file Database → Audio swaps in for one), sound files decoded and converted.
 */
async function bakeSounds(store: EditorStore): Promise<void> {
  const overrides = (store.db.audio?.sfx ?? {}) as Record<string, string | undefined>;
  for (const name of romSounds(gba.data)) {
    const file = romSoundFile(name);
    const src = (SFX_NAMES as readonly string[]).includes(name) ? overrides[name] ?? name : name;
    const key = `sound:${src}`;
    if (bakedArt.get(file) === key) continue;
    let blob: Blob | null = null;
    try {
      if ((SFX_NAMES as readonly string[]).includes(src)) blob = wav8(makeChipSfx(src as SfxName), RATE);
      else {
        let data: ArrayBuffer;
        try { data = await (await store.project.readFile(src)).arrayBuffer(); } catch { data = await (await store.project.readFile(`assets/${src}`)).arrayBuffer(); }
        const ctx = new OfflineAudioContext(1, 1, 22050);
        const decoded = await ctx.decodeAudioData(data);
        const mono = new Float32Array(decoded.length);
        for (let c = 0; c < decoded.numberOfChannels; c++) { const d = decoded.getChannelData(c); for (let i = 0; i < d.length; i++) mono[i] += d[i] / decoded.numberOfChannels; }
        blob = wav8(mono.subarray(0, Math.min(mono.length, decoded.sampleRate * 3)), decoded.sampleRate);
      }
    } catch { blob = null; }
    if (!blob) continue;
    try { await store.project.writeFile(file, blob); bakedArt.set(file, key); } catch { /* the ROM stays quiet for it */ }
  }
}

export async function save(store: EditorStore): Promise<void> {
  // Mimas: what the ROM needs from the props, worked out here (their art and footprints live in the editor).
  if (store.map.gba && store.project.canSave) await bakeProps(store);
  if (store.map.gba && store.project.canSave) await bakeGameArt(store);
  const files: [string, string][] = [[`maps/${store.mapName}.json`, formatMap(store.map)]];
  // Mimas: the game's numbers for the ROM (battles, the party, items), from the Database.
  if (store.map.gba && store.project.canSave) files.push(['gba_game.json', `${JSON.stringify(romGameData(store.db, gba.data), null, 1)}\n`]);
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
