/**
 * Tiny local server for the map editor. No dependencies: just Node.js.
 * Started by "Start Map Editor.bat"; opens the editor in your default browser (any browser).
 *
 *   /                      → Map Editor.html
 *   /index.html            → Playtest.html (what the editor's Playtest button opens)
 *   /data/...              → public/data/...
 *   /__editor/maps         → list of maps
 *   /__editor/save?file=…  → save a data file (POST)
 *   /__editor/upload?file= → save an imported image or sound into public/assets/ (POST, raw bytes)
 *   /__editor/ping         → keep-alive from the open editor (and the Character Builder)
 *   /builder/              → the Character Builder (characters and weapons), tools/lpc/builder/site/index.html,
 *                            with its parts library from tools/lpc/library/ and the weapons from public/assets/weapons/
 *
 * "Start Character Builder.bat" starts the same server and opens /builder/.
 * Only listens on this computer (127.0.0.1). Stops by itself a few minutes after the
 * editor tab is closed, or when you close its window.
 */
import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(PUBLIC, 'data');
const BUILDER = path.join(ROOT, 'tools', 'lpc', 'builder', 'site');
const LIBRARY = path.join(ROOT, 'tools', 'lpc', 'library');
const WEAPONS = path.join(PUBLIC, 'assets', 'weapons');
// Mimas has its own addresses (5274+), so it never opens on Saturn's editor server (5174+) or shares its browser data.
const FIRST_PORT = 5274;
const PROJECT = 'mimas';
/** What to open first: the editor, or the Character Builder (node editor-server.mjs builder). */
const START_PAGE = process.argv.includes('builder') ? 'builder/' : '';
const IDLE_LIMIT_MS = 3 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.woff2': 'font/woff2',
};

let lastPing = 0;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function serveFile(res, file) {
  try {
    const data = await fs.readFile(file);
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
  } catch {
    send(res, 404, `Not found: ${path.basename(file)}`, 'text/plain; charset=utf-8');
  }
}

/** Resolve a URL path inside `base`, refusing anything that escapes it. */
function inside(base, urlPath) {
  const p = path.resolve(base, '.' + decodeURIComponent(urlPath));
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

const readBytes = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const readBody = async (req) => (await readBytes(req)).toString('utf8');
/** Imported files: images under public/assets/(props|tiles|icons|characters)/, sounds under public/assets/audio/. */
const ASSET_FILE = /^(?:gba\/(?:tiles|sprites|props|enemies|heroes|items|chars)\/[A-Za-z0-9_.-]+\.png$|gba\/sounds\/[A-Za-z0-9_]+\.wav$)|^assets\/(?:(?:props|tiles|icons|characters|enemies|weapons\/custom)\/[A-Za-z0-9_.-]+\.png|props\/[A-Za-z0-9_.-]+\.(?:glb|fbx)|models\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:glb|fbx)|audio\/[A-Za-z0-9_.-]+\.(?:ogg|mp3|wav|m4a))$/;

const AUDIO = path.join(ROOT, 'audio');
/** Every sound under audio/ (any depth), as "audio/…" paths. */
async function listAudio(dir = AUDIO, rel = 'audio') {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...await listAudio(path.join(dir, e.name), `${rel}/${e.name}`));
    else if (/\.(ogg|mp3|wav|m4a|flac)$/i.test(e.name)) out.push(`${rel}/${e.name}`);
  }
  return out.sort();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const p = url.pathname;
  try {
    if (p === '/__editor/ping') { lastPing = Date.now(); return send(res, 200, { ok: true, project: PROJECT }); }
    if (p === '/__editor/builder') {
      const has = async (f) => fs.access(f).then(() => true, () => false);
      return send(res, 200, { builder: await has(path.join(BUILDER, 'index.html')), library: await has(path.join(LIBRARY, 'catalog.json')) });
    }
    if (p === '/__editor/audio' && req.method === 'GET') return send(res, 200, await listAudio());
    if (p === '/__editor/maps' && req.method === 'GET') {
      const files = await fs.readdir(path.join(DATA, 'maps')).catch(() => []);
      return send(res, 200, files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort());
    }
    if (p === '/__editor/save' && req.method === 'POST') {
      const file = url.searchParams.get('file') ?? '';
      if (!/^(database|assets|gba|gba_game|mimas|(?:gba)?maps\/[A-Za-z0-9_-]+)\.json$/.test(file)) return send(res, 400, { error: 'Invalid file name' });
      const body = await readBody(req);
      JSON.parse(body); // refuse anything that isn't valid JSON
      const target = path.join(DATA, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, body, 'utf8');
      console.log(`Saved public/data/${file}`);
      return send(res, 200, { ok: true });
    }
    if (p === '/__editor/upload' && req.method === 'POST') {
      const file = url.searchParams.get('file') ?? '';
      if (!ASSET_FILE.test(file)) return send(res, 400, { error: 'Invalid file name' });
      const bytes = await readBytes(req);
      if (bytes.length > 32 * 1024 * 1024) return send(res, 413, { error: 'File is larger than 32 MB' });
      const target = path.join(PUBLIC, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
      console.log(`Saved public/${file}`);
      return send(res, 200, { ok: true });
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    if (p === '/' || p === '/editor.html') return serveFile(res, path.join(ROOT, 'Map Editor.html'));
    if (p === '/index.html' || p === '/play') return serveFile(res, path.join(ROOT, 'Playtest.html'));
    // The Character Builder and what it loads (its parts library, the weapon sheets).
    if (p === '/builder') { res.writeHead(302, { Location: '/builder/' }); return res.end(); }
    if (p === '/builder/' || p === '/builder/index.html') return serveFile(res, path.join(BUILDER, 'index.html'));
    if (p.startsWith('/builder/weapons/')) { const f = inside(WEAPONS, p.slice('/builder/weapons'.length)); return f ? serveFile(res, f) : send(res, 403, 'Forbidden', 'text/plain; charset=utf-8'); }
    if (p.startsWith('/builder/')) { const f = inside(LIBRARY, p.slice('/builder'.length)); return f ? serveFile(res, f) : send(res, 403, 'Forbidden', 'text/plain; charset=utf-8'); }
    // The project's audio folders (music, ambience, sound effects…), used where they are.
    if (p.startsWith('/audio/')) { const f = inside(AUDIO, p.slice('/audio'.length)); return f ? serveFile(res, f) : send(res, 403, 'Forbidden', 'text/plain; charset=utf-8'); }
    const file = inside(PUBLIC, p);
    if (!file) return send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return serveFile(res, file);
  } catch (err) {
    send(res, 500, { error: String(err) });
  }
});

function openBrowser(url) {
  if (process.env.NO_OPEN) return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, (err) => { if (err) console.log(`Open ${url} in your browser.`); });
}

function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < FIRST_PORT + 20) listen(port + 1);
    else { console.error(`Couldn't start the editor server: ${err.message}`); process.exit(1); }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/${START_PAGE}`;
    console.log(`Mimas map editor running at http://localhost:${port}/ (Character Builder: http://localhost:${port}/builder/)`);
    console.log('Close this window to stop it. It also stops a few minutes after you close the editor tab.');
    openBrowser(url);
    lastPing = Date.now();
    setInterval(() => {
      if (Date.now() - lastPing > IDLE_LIMIT_MS) { console.log('Editor closed; stopping.'); process.exit(0); }
    }, 15000).unref();
  });
}

/**
 * Already running (the map editor's server, say)? Then just open the page there: one server, one address, so the
 * Character Builder's saved characters (kept by the browser per address) are always the same ones.
 */
async function alreadyRunning(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__editor/ping`, { signal: AbortSignal.timeout(800) });
    const j = r.ok ? await r.json() : {};
    return j.ok === true && j.project === PROJECT;   // only Mimas's own server, never Saturn's
  } catch { return false; }
}

const port0 = Number(process.env.PORT) || FIRST_PORT;
if (await alreadyRunning(port0)) {
  console.log(`Already running at http://localhost:${port0}/; opening it.`);
  openBrowser(`http://localhost:${port0}/${START_PAGE}`);
  setTimeout(() => process.exit(0), 1500);
} else listen(port0);
