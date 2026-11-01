/**
 * Hand-off between the editor and the game: the editor stores the map it's working on
 * (saved or not), the asset list and the imported images, and the game picks them up
 * when opened with ?playtest. Uses IndexedDB because images are too big for localStorage.
 */
import type { AssetRegistry, Database, Dir, MapData } from '../world/types';

const DB = 'hd2d-playtest', STORE = 'handoff', KEY = 'current';

export interface PlaytestData {
  db: Database;
  mapName: string;
  map: MapData;
  /** Every other map in the project, so transfers work in a playtest (the open map is `map`). */
  maps?: Record<string, MapData>;
  start?: { x: number; z: number; dir?: Dir };
  assets: AssetRegistry;
  /** Imported images by path (e.g. "assets/props/lamp.png"). */
  files: Record<string, Blob>;
  /** Matches ?playtest=<stamp> in the game's URL, so the game knows it has this hand-off and not an older one. */
  stamp?: string;
  /** Combat preview (Database → Enemies / Troops): straight into a battle with these enemies, on this battle map. */
  battle?: { enemies: string[]; map?: string };
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Browser storage is unavailable'));
  });
}

export async function writePlaytest(d: PlaytestData): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(d, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Couldn’t store the playtest data'));
  });
  db.close();
}

/**
 * Wait for the hand-off with this stamp (the editor may still be writing it when the game tab opens).
 * Without a stamp, returns whatever is stored.
 */
export async function waitForPlaytest(stamp: string | null, timeoutMs = 6000): Promise<PlaytestData | null> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const d = await readPlaytest();
    if (d && (!stamp || d.stamp === stamp)) return d;
    if (Date.now() > until) return stamp ? null : d;
    await new Promise((r) => setTimeout(r, 120));
  }
}

export async function readPlaytest(): Promise<PlaytestData | null> {
  try {
    const db = await open();
    const d = await new Promise<PlaytestData | null>((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as PlaytestData | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
    db.close();
    return d;
  } catch {
    return null;
  }
}
