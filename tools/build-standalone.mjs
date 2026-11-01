/**
 * Builds “Map Editor.html” and Playtest.html into the project folder: single files that run
 * by double-clicking (no dev server). Run with:  npm run build:standalone
 *
 * Everything is inlined (scripts, styles, and three.js when it's installed), because
 * browsers won't load separate module files from a page opened as a file.
 */
import { build } from 'esbuild';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeFile = path.join(root, 'node_modules/three/build/three.min.js');
const haveThree = existsSync(threeFile);

// Fonts are built in (src/fonts.css), so nothing is fetched from the internet.
const FONTS = '';

/** Keep inlined code from closing its own <script> tag early. */
const safe = (code) => code.replace(/<\/script/gi, '<\\/script');

async function bundle(entry, externalThree) {
  const result = await build({
    entryPoints: [path.join(root, entry)],
    bundle: true, minify: true, format: 'esm', target: 'es2020', write: false,
    outdir: path.join(root, '.standalone'),
    external: externalThree ? ['three'] : [],
    logLevel: 'warning',
  });
  const get = (ext) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text ?? '';
  let js = get('.js');
  // three.js loaded as a classic script defines window.THREE; point the bundle's imports at it.
  if (externalThree) js = js.replace(/import\s*\*\s*as\s*([\w$]+)\s*from\s*"three";?/g, 'const $1=window.THREE;');
  return { js, css: get('.css') };
}

const page = (title, css, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
${FONTS}
<style>
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;

const editor = await bundle('src/editor/main.ts', false);
writeFileSync(path.join(root, 'Map Editor.html'), page('Mimas · Map Editor', editor.css,
  `<div id="editor"></div>\n<script type="module">\n${safe(editor.js)}\n</script>`));

// With three.js installed, bundle it in so the game also works offline.
// Without it, load the same version from a CDN.
const game = await bundle('src/main.ts', !haveThree);
const threeTag = haveThree ? '' : '<script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"></script>\n';
writeFileSync(path.join(root, 'Playtest.html'), page('Mimas · Playtest', game.css,
  `<canvas id="view" tabindex="0" aria-label="Game view"></canvas>\n${threeTag}<script type="module">\n${safe(game.js)}\n</script>`));

console.log(`Built “Map Editor.html” and Playtest.html${haveThree ? '' : ' (three.js from CDN: run npm install to bundle it)'}.`);
