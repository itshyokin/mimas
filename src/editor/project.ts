/**
 * Where the editor reads and writes data. Three kinds:
 *  - dev:    running under `npm run dev`; files go through the dev server
 *  - folder: the editor opened as a file (Map Editor.html) with a project folder picked
 *            through the browser's File System Access API (Chrome / Edge)
 *  - browser: the hosted editor (GitHub Pages) on a tablet: changes kept in the browser (see browserProject.ts)
 *  - static: a hosted or preview copy where the browser can't keep files; saving exports JSON
 */
import { loadAssets, loadDatabase, loadMap, normalizeAssets } from '../shared/dataFiles';
import { migrateMap } from '../world/props';
import type { AssetRegistry, Database, MapData } from '../world/types';

export interface Project {
  kind: 'dev' | 'folder' | 'browser' | 'static';
  /** Shown in the toolbar, e.g. the folder name. */
  label: string;
  canSave: boolean;
  readDatabase(): Promise<Database>;
  readMap(name: string): Promise<MapData>;
  listMaps(): Promise<string[]>;
  /** `file` is relative to the data folder: "database.json" or "maps/<name>.json". */
  write(file: string, text: string): Promise<void>;
  readAssets(): Promise<AssetRegistry>;
  /** Can imported images be stored in the project (public/assets/)? */
  canStoreImages: boolean;
  /** `path` is relative to public/, e.g. "assets/props/lamp.png". */
  readFile(path: string): Promise<Blob>;
  writeFile(path: string, data: Blob): Promise<void>;
  /** The sound files in the project's audio/ folders, as "audio/music/x.wav" paths (used where they are). */
  listAudio?(): Promise<string[]>;
}

/** The built site's list of its audio files (the hosted editor can't look inside folders). */
export async function audioManifest(): Promise<string[]> {
  try { const r = await fetch('data/audio.json', { cache: 'no-store' }); if (!r.ok) return []; const v = (await r.json()) as unknown; return Array.isArray(v) ? (v as string[]) : []; } catch { return []; }
}

async function fetchBlob(path: string): Promise<Blob> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load ${path} (HTTP ${res.status})`);
  return res.blob();
}

/* ------------------------------------------------------------ dev server */

export async function devServerProject(): Promise<Project | null> {
  const list = async (): Promise<string[] | null> => {
    try {
      const res = await fetch('/__editor/maps', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as unknown;
      return Array.isArray(data) ? (data as string[]) : null;
    } catch { return null; }
  };
  if (location.protocol === 'file:' || !(await list())) return null;
  // Tell the small editor server (tools/editor-server.mjs) the editor is still open.
  const ping = () => void fetch('/__editor/ping', { cache: 'no-store' }).catch(() => {});
  ping();
  setInterval(ping, 20000);
  return {
    kind: 'dev', label: 'Project (dev server)', canSave: true, canStoreImages: true,
    readDatabase: loadDatabase, readMap: loadMap, readAssets: loadAssets, readFile: fetchBlob,
    writeFile: async (file, data) => {
      const res = await fetch(`/__editor/upload?file=${encodeURIComponent(file)}`, { method: 'POST', body: data });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(msg.error ?? `HTTP ${res.status}`);
      }
    },
    listMaps: async () => (await list()) ?? [],
    listAudio: async () => {
      try { const r = await fetch('/__editor/audio', { cache: 'no-store' }); if (!r.ok) return []; const v = (await r.json()) as unknown; return Array.isArray(v) ? (v as string[]) : []; } catch { return []; }
    },
    write: async (file, text) => {
      const res = await fetch(`/__editor/save?file=${encodeURIComponent(file)}`, { method: 'POST', body: text, headers: { 'Content-Type': 'application/json' } });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(msg.error ?? `HTTP ${res.status}`);
      }
    },
  };
}

/* ------------------------------------------------------------ static (read-only) */

export function staticProject(): Project {
  return {
    kind: 'static', label: 'Preview', canSave: false, canStoreImages: false,
    readDatabase: loadDatabase, readMap: loadMap, readAssets: loadAssets, readFile: fetchBlob,
    writeFile: async () => { throw new Error('This copy of the editor can’t save files.'); },
    listMaps: async () => [],
    listAudio: audioManifest,
    write: async () => { throw new Error('This copy of the editor can’t save files.'); },
  };
}

/* ------------------------------------------------------------ project folder */

// The File System Access API isn't in TypeScript's standard DOM types yet, so describe the parts we use.
type Perm = 'granted' | 'denied' | 'prompt';
interface Writable { write(data: string | Blob): Promise<void>; close(): Promise<void> }
interface FileHandle { kind: 'file'; name: string; getFile(): Promise<File>; createWritable(): Promise<Writable> }
export interface DirHandle {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandle>;
  values(): AsyncIterable<{ kind: string; name: string }>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<Perm>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<Perm>;
}
type PickerWindow = Window & { showDirectoryPicker?: (o?: { id?: string; mode?: 'readwrite' }) => Promise<DirHandle> };

export const canOpenFolders = (): boolean => typeof (window as PickerWindow).showDirectoryPicker === 'function';

/** Ask the user to pick their project folder. */
export async function pickFolder(): Promise<DirHandle> {
  return (window as PickerWindow).showDirectoryPicker!({ id: 'hd2d-project', mode: 'readwrite' });
}

/** Make sure we may read and write the folder; must be called from a click when it needs to ask. */
export async function ensurePermission(dir: DirHandle): Promise<boolean> {
  if (!dir.queryPermission) return true;
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await dir.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

async function tryDir(dir: DirHandle, path: string[]): Promise<DirHandle | null> {
  try {
    let d = dir;
    for (const p of path) d = await d.getDirectoryHandle(p);
    await d.getFileHandle('database.json');
    return d;
  } catch { return null; }
}

/** The data folder, and the public/ folder imported images go in (null if only the data folder was picked). */
export interface ProjectDirs { data: DirHandle; pub: DirHandle | null }

/** Accept the project folder itself, its public/ folder, or the data/ folder. */
export async function findDataDir(dir: DirHandle): Promise<ProjectDirs | null> {
  const a = await tryDir(dir, ['public', 'data']);
  if (a) return { data: a, pub: await dir.getDirectoryHandle('public') };
  const b = await tryDir(dir, ['data']);
  if (b) return { data: b, pub: dir };
  const c = await tryDir(dir, []);
  return c ? { data: c, pub: null } : null;
}

async function walk(dir: DirHandle, parts: string[], create: boolean): Promise<DirHandle> {
  let d = dir;
  for (const p of parts) d = await d.getDirectoryHandle(p, { create });
  return d;
}

async function readJSON<T>(dir: DirHandle, path: string[]): Promise<T> {
  let d = dir;
  for (const p of path.slice(0, -1)) d = await d.getDirectoryHandle(p);
  const file = await (await d.getFileHandle(path[path.length - 1])).getFile();
  return JSON.parse(await file.text()) as T;
}

export function folderProject(root: DirHandle, dirs: ProjectDirs): Project {
  const { data, pub } = dirs;
  return {
    kind: 'folder', label: root.name, canSave: true, canStoreImages: !!pub,
    readDatabase: () => readJSON<Database>(data, ['database.json']),
    readMap: async (name) => { const m = await readJSON<MapData>(data, ['maps', `${name}.json`]); migrateMap(m); return m; },
    readAssets: async () => {
      try { return normalizeAssets(await readJSON<AssetRegistry>(data, ['assets.json'])); } catch { return normalizeAssets(null); }
    },
    readFile: async (path) => {
      const parts = path.split('/');
      // The audio folders sit beside public/, in the project folder itself.
      if (parts[0] === 'audio' && pub) return (await (await walk(root, parts.slice(0, -1), false)).getFileHandle(parts[parts.length - 1])).getFile();
      if (!pub) throw new Error('Pick the project folder (not the data folder) to use imported images.');
      return (await (await walk(pub, parts.slice(0, -1), false)).getFileHandle(parts[parts.length - 1])).getFile();
    },
    writeFile: async (path, blob) => {
      if (!pub) throw new Error('Pick the project folder (not the data folder) to import images.');
      const parts = path.split('/');
      const w = await (await (await walk(pub, parts.slice(0, -1), true)).getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
      await w.write(blob);
      await w.close();
    },
    listAudio: async () => {
      const out: string[] = [];
      const scan = async (d: DirHandle, rel: string): Promise<void> => {
        for await (const e of d.values()) {
          if (e.name.startsWith('.')) continue;
          if (e.kind === 'directory') await scan(await d.getDirectoryHandle(e.name), `${rel}/${e.name}`);
          else if (/\.(ogg|mp3|wav|m4a|flac)$/i.test(e.name)) out.push(`${rel}/${e.name}`);
        }
      };
      if (pub) { try { await scan(await root.getDirectoryHandle('audio'), 'audio'); } catch { /* no audio folder */ } }
      return out.sort();
    },
    listMaps: async () => {
      const out: string[] = [];
      try {
        const maps = await data.getDirectoryHandle('maps');
        for await (const entry of maps.values()) if (entry.kind === 'file' && entry.name.endsWith('.json')) out.push(entry.name.slice(0, -5));
      } catch { /* no maps folder yet */ }
      return out.sort();
    },
    write: async (file, text) => {
      const parts = file.split('/');
      let d = data;
      for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const w = await (await d.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
      await w.write(text);
      await w.close();
    },
  };
}

/* ------------------------------------------------------------ remember the folder */

const DB = 'hd2d-editor', STORE = 'handles', KEY = 'project';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberFolder(dir: DirHandle): Promise<void> {
  try {
    const db = await idb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(dir, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* not fatal: the user just picks the folder again next time */ }
}

export async function recallFolder(): Promise<DirHandle | null> {
  try {
    const db = await idb();
    return await new Promise<DirHandle | null>((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DirHandle | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}
