import { defineConfig, type Plugin } from 'vite';
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

const DATA_DIR = path.resolve('public/data');
const AUDIO_DIR = path.resolve('audio');
const AUDIO_EXT = /\.(ogg|mp3|wav|m4a|flac)$/i;

/** Every sound file under audio/ (music, ambience, footsteps, sound_effects/…, voices, spells), as "audio/…" paths. */
async function listAudio(dir = AUDIO_DIR, rel = 'audio'): Promise<string[]> {
  const out: string[] = [];
  let entries: import('node:fs').Dirent[] = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.isDirectory()) out.push(...await listAudio(path.join(dir, e.name), `${rel}/${e.name}`));
    else if (AUDIO_EXT.test(e.name)) out.push(`${rel}/${e.name}`);
  }
  return out.sort();
}

/**
 * Dev-server endpoints that let the editor save straight into public/data/.
 *   GET  /__editor/maps                     → ["map001", ...]
 *   POST /__editor/save?file=maps/x.json    → writes the request body
 *   POST /__editor/upload?file=assets/props/x.png → writes an imported image (or sound)
 * Only database.json, assets.json, gba.json, mimas.json, maps/*.json, gba/(tiles|sprites)/*.png, assets/(props|tiles|icons|characters|weapons/custom)/*.png, assets/props/*.glb|fbx, assets/models/(any folders)/*.glb|fbx and assets/audio/* can be written.
 */
function editorApi(): Plugin {
  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const readBytes = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  const readBody = async (req: IncomingMessage) => (await readBytes(req)).toString('utf8');

  return {
    name: 'editor-api',
    configureServer(server) {
      // Saving from the editor shouldn't make Vite reload the editor page.
      server.watcher.unwatch(DATA_DIR);
      server.watcher.unwatch(path.resolve('public/assets'));
      // Prop and character models saved this session: Vite only knows the public files it saw at start (and the assets folder
      // isn't watched), so serve them straight from disk.
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/(assets\/(?:props|models(?:\/[A-Za-z0-9_-]+)*)\/[A-Za-z0-9_.-]+\.(?:glb|fbx))(?:\?.*)?$/.exec((() => { try { return decodeURI(req.url ?? ''); } catch { return ''; } })());
        if (!m) return next();
        try {
          const data = await fs.readFile(path.resolve('public', m[1]));
          res.setHeader('Content-Type', m[1].endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream');
          res.end(data);
        } catch { next(); }
      });
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__editor/')) return next();
        try {
          const url = new URL(req.url, 'http://localhost');
          if (url.pathname === '/__editor/ping') return send(res, 200, { ok: true });
          if (req.method === 'GET' && url.pathname === '/__editor/audio') return send(res, 200, await listAudio());
          if (req.method === 'GET' && url.pathname === '/__editor/maps') {
            const files = await fs.readdir(path.join(DATA_DIR, 'maps'));
            return send(res, 200, files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort());
          }
          if (req.method === 'POST' && url.pathname === '/__editor/save') {
            const file = url.searchParams.get('file') ?? '';
            if (!/^(database|assets|gba|gba_game|mimas|(?:gba)?maps\/[A-Za-z0-9_-]+)\.json$/.test(file)) return send(res, 400, { error: 'Invalid file name' });
            const body = await readBody(req);
            JSON.parse(body); // refuse anything that isn't valid JSON
            const target = path.join(DATA_DIR, file);
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, body, 'utf8');
            return send(res, 200, { ok: true });
          }
          if (req.method === 'POST' && url.pathname === '/__editor/upload') {
            const file = url.searchParams.get('file') ?? '';
            if (!/^(?:gba\/(?:tiles|sprites|props|enemies|heroes|items|chars|battlebacks|title)\/[A-Za-z0-9_.-]+\.png$|gba\/sounds\/[A-Za-z0-9_]+\.wav$)|^assets\/(?:(?:props|tiles|icons|characters|enemies|weapons\/custom)\/[A-Za-z0-9_.-]+\.png|props\/[A-Za-z0-9_.-]+\.(?:glb|fbx)|models\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:glb|fbx)|audio\/[A-Za-z0-9_.-]+\.(?:ogg|mp3|wav|m4a))$/.test(file)) return send(res, 400, { error: 'Invalid file name' });
            const target = path.resolve('public', file);
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.writeFile(target, await readBytes(req));
            return send(res, 200, { ok: true });
          }
          send(res, 404, { error: 'Unknown editor endpoint' });
        } catch (err) {
          send(res, 500, { error: String(err) });
        }
      });
    },
  };
}

/** Built site: data/maps.json lists the maps, so the hosted editor (which can't list folders) can offer them all. */
function mapsManifest(): Plugin {
  return {
    name: 'maps-manifest',
    apply: 'build',
    async closeBundle() {
      const names = (await fs.readdir(path.join(DATA_DIR, 'maps'))).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
      await fs.mkdir(path.resolve('dist/data'), { recursive: true });
      await fs.writeFile(path.resolve('dist/data/maps.json'), JSON.stringify(names) + '\n', 'utf8');
      // The project's audio folders, and their list (the hosted editor can't look inside folders).
      const sounds = await listAudio();
      for (const f of sounds) { const to = path.resolve('dist', f); await fs.mkdir(path.dirname(to), { recursive: true }); await fs.copyFile(path.resolve(f), to); }
      await fs.writeFile(path.resolve('dist/data/audio.json'), JSON.stringify(sounds) + '\n', 'utf8');
      // The Character Builder (one self-contained page) comes along, for the online editor's toolbar link.
      try { await fs.copyFile(path.resolve('Character Builder.html'), path.resolve('dist/character-builder.html')); } catch { /* not in this project */ }
    },
  };
}

export default defineConfig({
  // Relative paths so the built game runs from any folder,
  // and later inside Tauri (Windows) or Capacitor (Android).
  base: './',
  plugins: [editorApi(), mapsManifest()],
  build: {
    target: 'es2020',
    rollupOptions: { input: { main: path.resolve('index.html'), editor: path.resolve('editor.html') } },
  },
  // `host: true` lets a phone on the same Wi-Fi open the dev server.
  server: { host: true, port: 5273 },   // Mimas's own address (Saturn's dev server uses 5173)
});
