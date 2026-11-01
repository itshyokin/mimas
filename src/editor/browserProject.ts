/**
 * A project kept in the browser itself, for the hosted editor (GitHub Pages) on a tablet or phone, where the editor
 * can't open a folder. It reads the hosted project's files and keeps every change in the browser's private storage
 * (the Origin Private File System) on top of them, so nothing is lost between visits.
 *
 * Changes go back to the PC as a zip (Project → Save changes as .zip: only what changed, laid out like the project
 * folder, to unzip over it). A zip of a project, or of changes made elsewhere, can be opened here too.
 */
import { loadAssets, loadDatabase, loadMap, normalizeAssets } from '../shared/dataFiles';
import { makeZip, readZip } from '../shared/zip';
import { migrateMap } from '../world/props';
import type { AssetRegistry, Database, MapData } from '../world/types';
import { audioManifest, type DirHandle, type Project } from './project';

const ROOT = 'hd2d-project';

/** Can this browser keep a project (private file storage that can be written)? */
export async function canKeepProject(): Promise<boolean> {
  try {
    const root = await opfsRoot();
    const f = await root.getFileHandle('.probe', { create: true });
    const w = await f.createWritable();
    await w.write('ok');
    await w.close();
    return true;
  } catch { return false; }
}

async function opfsRoot(): Promise<DirHandle> {
  const s = navigator.storage as StorageManager & { getDirectory?: () => Promise<unknown> };
  if (!s?.getDirectory) throw new Error('No private file storage in this browser');
  return ((await s.getDirectory()) as unknown as DirHandle).getDirectoryHandle(ROOT, { create: true });
}

async function dirOf(path: string, create: boolean): Promise<{ dir: DirHandle; name: string }> {
  const parts = path.split('/').filter(Boolean);
  let d = await opfsRoot();
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create });
  return { dir: d, name: parts[parts.length - 1] };
}

/** A changed file kept in the browser (null: it hasn't been changed here). `path` is relative to public/. */
export async function readLocal(path: string): Promise<File | null> {
  try { const { dir, name } = await dirOf(path, false); return await (await dir.getFileHandle(name)).getFile(); } catch { return null; }
}

export async function writeLocal(path: string, data: Blob | string | Uint8Array): Promise<void> {
  const { dir, name } = await dirOf(path, true);
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(data instanceof Uint8Array ? new Blob([data]) : data);
  await w.close();
  // Ask the browser not to clear its storage when space runs low (best effort).
  void navigator.storage?.persist?.().catch(() => false);
}

/** Git's own id for a file's contents (the same as GitHub's for that file). */
export async function blobSha(data: Uint8Array): Promise<string> {
  const head = new TextEncoder().encode(`blob ${data.length}\0`);
  const all = new Uint8Array(head.length + data.length);
  all.set(head); all.set(data, head.length);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Which version of each file this device's edit started from (its git id on GitHub, or 'new' for a file GitHub didn't
 * have). Push uses it to tell an edit apart from an old copy: a file whose GitHub version has moved on since is never
 * sent without asking. Files kept from before this was recorded have none, and count as "changed in both places".
 */
const BASED_FILE = '.sync/based.json';
export async function readBased(): Promise<Record<string, string>> {
  const f = await readLocal(BASED_FILE);
  try { return f ? (JSON.parse(await f.text()) as Record<string, string>) : {}; } catch { return {}; }
}
export async function writeBased(b: Record<string, string>): Promise<void> { await writeLocal(BASED_FILE, JSON.stringify(b)); }

/** Before the first edit of a file on this device: note the version it starts from (the one the site serves). */
async function noteEdit(path: string): Promise<void> {
  if (!/^(data|assets)\//.test(path)) return;
  const based = await readBased();
  if (path in based) return;
  // Already kept here from before versions were noted: leave it unknown (a push asks about it).
  if (await readLocal(path)) return;
  try {
    const res = await fetch(path, { cache: 'no-store' });
    based[path] = res.ok ? await blobSha(new Uint8Array(await res.arrayBuffer())) : 'new';
  } catch { return; }
  await writeBased(based);
}

/** Every file changed in the browser, as paths relative to public/. */
export async function changedFiles(): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: DirHandle, prefix: string): Promise<void> => {
    for await (const e of d.values()) {
      if (e.kind === 'file') { if (prefix) out.push(prefix + e.name); }
      else await walk(await d.getDirectoryHandle(e.name), `${prefix}${e.name}/`);
    }
  };
  try { await walk(await opfsRoot(), ''); } catch { /* nothing kept yet */ }
  return out.filter((p) => p.startsWith('data/') || p.startsWith('assets/')).sort();
}

/** The changes as a zip laid out like the project folder (public/data/…, public/assets/…), to unzip over it. */
export async function changesZip(): Promise<Blob> {
  const files = await Promise.all((await changedFiles()).map(async (p) => ({ path: `public/${p}`, data: (await readLocal(p))! })));
  return makeZip(files.filter((f) => f.data));
}

/**
 * Open a zip: a whole project folder, its public/ folder, or a changes zip. Files under data/ and assets/ (wherever
 * public/ is inside it) are kept in the browser, over the hosted ones. Returns how many were taken.
 */
export async function importZip(file: Blob): Promise<number> {
  const entries = await readZip(file);
  let n = 0;
  for (const e of entries) {
    const p = e.path;
    let rel: string | null = null;
    const i = p.lastIndexOf('public/');
    if (i >= 0) rel = p.slice(i + 'public/'.length);
    else {
      // No public/ folder: data/… and assets/… at the top, or one folder down (a zipped "public" itself).
      const m = /^(?:[^/]+\/)?((?:data|assets)\/.+)$/.exec(p);
      if (m) rel = m[1];
    }
    if (!rel || !/^(data|assets)\//.test(rel) || rel.includes('..')) continue;
    await writeLocal(rel, e.data);
    n++;
  }
  return n;
}

/** Forget every change kept in the browser (back to the hosted project). */
export async function discardChanges(): Promise<void> {
  const s = navigator.storage as StorageManager & { getDirectory?: () => Promise<unknown> };
  const top = (await s.getDirectory!()) as unknown as DirHandle & { removeEntry(name: string, o?: { recursive?: boolean }): Promise<void> };
  try { await top.removeEntry(ROOT, { recursive: true }); } catch { /* nothing kept */ }
}

async function fetchBlob(path: string): Promise<Blob> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load ${path} (HTTP ${res.status})`);
  return res.blob();
}

/** The hosted project's maps (data/maps.json, written when the site is built). */
async function hostedMaps(): Promise<string[]> {
  try {
    const res = await fetch('data/maps.json', { cache: 'no-store' });
    if (!res.ok) return [];
    const list = (await res.json()) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

const json = async <T>(f: File): Promise<T> => JSON.parse(await f.text()) as T;

export function browserProject(): Project {
  return {
    kind: 'browser', label: 'On this device', canSave: true, canStoreImages: true,
    listAudio: audioManifest,
    readDatabase: async () => { const f = await readLocal('data/database.json'); return f ? json<Database>(f) : loadDatabase(); },
    readMap: async (name) => {
      const f = await readLocal(`data/maps/${name}.json`);
      if (!f) return loadMap(name);
      const m = await json<MapData>(f);
      migrateMap(m);
      return m;
    },
    readAssets: async () => {
      const f = await readLocal('data/assets.json');
      if (!f) return loadAssets();
      try { return normalizeAssets(await json<AssetRegistry>(f)); } catch { return normalizeAssets(null); }
    },
    readFile: async (path) => (await readLocal(path)) ?? fetchBlob(path),
    writeFile: async (path, blob) => { await noteEdit(path); await writeLocal(path, blob); },
    write: async (file, text) => { await noteEdit(`data/${file}`); await writeLocal(`data/${file}`, text); },
    listMaps: async () => {
      const local = (await changedFiles()).filter((p) => /^data\/maps\/[^/]+\.json$/.test(p)).map((p) => p.slice('data/maps/'.length, -5));
      return [...new Set([...(await hostedMaps()), ...local])].sort();
    },
  };
}
