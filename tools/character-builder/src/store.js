// ---------------------------------------------------------------------------------------------------------------
// Storage: your parts (PNG sheets), saved characters and settings.
//  - Published on claude.ai: kept with the page in your Claude account (the same library on your tablet and PC).
//  - Opened as a file: kept in this browser (IndexedDB).
// Both offer the same small interface: subscribe, addPart, updatePart, deletePart, saveChar, deleteChar,
// saveSettings, partURL.
// ---------------------------------------------------------------------------------------------------------------

async function claudeUse(name) {
  try { return window.claude?.use ? await window.claude.use(name) : null; } catch { return null; }
}

const DEFAULT_SETTINGS = { frame: [32, 48], starters: true };
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

class CloudStore {
  constructor(db, assets) { this.db = db; this.assets = assets; this.kind = 'cloud'; }
  subscribe(cb) {
    const st = { parts: [], chars: [], settings: { ...DEFAULT_SETTINGS } }, got = new Set();
    const emit = (k) => { got.add(k); if (got.size === 3) cb({ ...st }); };
    const fail = (e) => cb({ ...st, error: e?.message || 'The library could not be loaded' });
    this.db.collection('parts').onSnapshot((q) => { st.parts = q.docs.map((d) => ({ id: d.id, ...d.data() })); emit('parts'); }, fail);
    this.db.collection('chars').onSnapshot((q) => { st.chars = q.docs.map((d) => ({ id: d.id, ...d.data() })); emit('chars'); }, fail);
    this.db.doc('config/settings').onSnapshot((d) => { st.settings = { ...DEFAULT_SETTINGS, ...(d.exists ? d.data() : {}) }; emit('settings'); }, fail);
  }
  async addPart(meta, blob) {
    const up = await this.assets.upload(blob, { type: 'image/png' });
    const id = newId();
    await this.db.collection('parts').doc(id).set({ ...meta, asset: up.id, created: Date.now() });
    return id;
  }
  updatePart(id, patch) { return this.db.collection('parts').doc(id).update(patch); }
  async deletePart(part) {
    await this.db.collection('parts').doc(part.id).delete();
    if (part.asset) await this.assets.delete(part.asset).catch(() => {});
  }
  partURL(part) { return '/_blob/' + part.asset; }
  async saveChar(c) {
    const id = c.id || newId();
    const { id: _, ...body } = c;
    await this.db.collection('chars').doc(id).set({ ...body, updated: Date.now() });
    return id;
  }
  deleteChar(id) { return this.db.collection('chars').doc(id).delete(); }
  saveSettings(s) { return this.db.doc('config/settings').set(s); }
}

class LocalStore {
  constructor() { this.kind = 'local'; this.urls = new Map(); this.listeners = []; }
  async open() {
    this.idb = await new Promise((res, rej) => {
      const r = indexedDB.open('sprite-character-builder', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('parts', { keyPath: 'id' }); d.createObjectStore('chars', { keyPath: 'id' }); d.createObjectStore('kv'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this;
  }
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.idb.transaction(store, mode), s = t.objectStore(store);
      const req = fn(s);
      t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error);
    });
  }
  async snapshot() {
    const parts = await this.tx('parts', 'readonly', (s) => s.getAll());
    const chars = await this.tx('chars', 'readonly', (s) => s.getAll());
    const settings = { ...DEFAULT_SETTINGS, ...((await this.tx('kv', 'readonly', (s) => s.get('settings'))) ?? {}) };
    return { parts, chars, settings };
  }
  async subscribe(cb) { this.listeners.push(cb); cb(await this.snapshot()); }
  async changed() { const s = await this.snapshot(); for (const l of this.listeners) l(s); }
  async addPart(meta, blob) {
    const id = newId();
    await this.tx('parts', 'readwrite', (s) => s.put({ id, ...meta, blob, created: Date.now() }));
    await this.changed();
    return id;
  }
  async updatePart(id, patch) {
    const p = await this.tx('parts', 'readonly', (s) => s.get(id));
    if (p) await this.tx('parts', 'readwrite', (s) => s.put({ ...p, ...patch }));
    await this.changed();
  }
  async deletePart(part) {
    await this.tx('parts', 'readwrite', (s) => s.delete(part.id));
    const u = this.urls.get(part.id); if (u) { URL.revokeObjectURL(u); this.urls.delete(part.id); }
    await this.changed();
  }
  partURL(part) {
    let u = this.urls.get(part.id);
    if (!u && part.blob) { u = URL.createObjectURL(part.blob); this.urls.set(part.id, u); }
    return u;
  }
  async saveChar(c) {
    const id = c.id || newId();
    await this.tx('chars', 'readwrite', (s) => s.put({ ...c, id, updated: Date.now() }));
    await this.changed();
    return id;
  }
  async deleteChar(id) { await this.tx('chars', 'readwrite', (s) => s.delete(id)); await this.changed(); }
  async saveSettings(st) { await this.tx('kv', 'readwrite', (s) => s.put(st, 'settings')); await this.changed(); }
}

/** A store that lives only for this visit (when nothing else is available, e.g. storage blocked). */
class MemoryStore extends LocalStore {
  constructor() { super(); this.kind = 'memory'; this.mem = { parts: [], chars: [], settings: { ...DEFAULT_SETTINGS } }; }
  async open() { return this; }
  async snapshot() { return { parts: [...this.mem.parts], chars: [...this.mem.chars], settings: { ...this.mem.settings } }; }
  async addPart(meta, blob) { const id = newId(); this.mem.parts.push({ id, ...meta, blob, created: Date.now() }); await this.changed(); return id; }
  async updatePart(id, patch) { this.mem.parts = this.mem.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)); await this.changed(); }
  async deletePart(part) { this.mem.parts = this.mem.parts.filter((p) => p.id !== part.id); await this.changed(); }
  async saveChar(c) { const id = c.id || newId(); this.mem.chars = [...this.mem.chars.filter((x) => x.id !== id), { ...c, id, updated: Date.now() }]; await this.changed(); return id; }
  async deleteChar(id) { this.mem.chars = this.mem.chars.filter((c) => c.id !== id); await this.changed(); }
  async saveSettings(s) { this.mem.settings = s; await this.changed(); }
}

async function openStore() {
  // Inside claude.ai the page's helpers may arrive a moment after the page starts.
  if (window.parent !== window) for (let i = 0; i < 15 && !window.claude?.use; i++) await new Promise((r) => setTimeout(r, 100));
  if (window.claude?.use) {
    const [db, assets] = await Promise.all([claudeUse('db'), claudeUse('assets')]);
    if (db && assets) return new CloudStore(db, assets);
  }
  try { return await new LocalStore().open(); } catch { return new MemoryStore(); }
}

/** Offer a file to save: through claude.ai's download prompt when published, else a normal download. */
async function saveFile(filename, blob) {
  const dl = await claudeUse('downloads');
  if (dl) {
    try { await dl.save({ filename, data: blob }); return 'saved'; }
    catch (e) { if (e?.code === 'declined') return 'declined'; throw new Error(e?.message || 'The file could not be saved'); }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  return 'saved';
}
