/**
 * Edge blending settings for one tile (built-in or imported), with a live preview of the tile
 * meeting a neighbour of your choice.
 */
import { groundCanvas } from '../art/placeholderArt';
import { bayer, hash2, vnoise } from '../core/math';
import { NEIGHBOURS8, cellDistance, reach } from '../world/blend';
import { TileMap } from '../world/TileMap';
import { TileCatalog } from '../world/tiles';
import type { TileBlend } from '../world/types';
import { setTileBlend } from './assets';
import { checkbox, field, h, numberInput, openModal, select } from './dom';
import { TS, drawTile } from './editorArt';
import type { EditorStore } from './store';

const EDGES: [TileBlend['edge'], string][] = [['ragged', 'Ragged (hard pixel edge)'], ['dither', 'Dithered (pixel-art fade)'], ['smooth', 'Smooth (soft fade)']];
const PREVIEW_W = 10, PREVIEW_H = 5, ZOOM = 3;

export function openBlendSettings(store: EditorStore, key: string): void {
  const def = store.tiles.get(key);
  if (!def) return;
  const b: TileBlend = { ...store.tiles.blendFor(key) };
  b.priority = Math.round(b.priority);
  const others = store.tiles.all().filter((t) => t.key !== key);
  let neighbour = others.find((t) => t.key === '.')?.key ?? others[0]?.key ?? '.';

  const preview = h('canvas', { class: 'blend-preview', width: PREVIEW_W * TS * ZOOM, height: PREVIEW_H * TS * ZOOM, 'aria-label': 'Preview of the blended edge' });
  const relation = h('p', { class: 'note' });
  const redraw = () => {
    drawPreview(preview, store, key, b, neighbour);
    const nbb = store.tiles.blendFor(neighbour), nb = { ...nbb, priority: Math.round(nbb.priority) }, nbName = store.tiles.get(neighbour)?.name ?? neighbour;
    relation.textContent = !b.blend || !nb.blend
      ? `No blending between these two: ${!b.blend ? 'this tile' : nbName} has blending off, so the edge is straight.`
      : b.priority > nb.priority ? `${def.name} (priority ${b.priority}) spreads over ${nbName} (${nb.priority}).`
      : b.priority < nb.priority ? `${nbName} (priority ${nb.priority}) spreads over ${def.name} (${b.priority}). Raise the priority to reverse that.`
      : `Same priority (${b.priority}): the tile imported later spreads. Change the priority of one to choose.`;
  };

  const slider = (value: number, min: number, max: number, step: number, set: (v: number) => void, label: string, fmt: (v: number) => string) => {
    const out = h('output', { class: 'blend-out' }, fmt(value));
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label,
      oninput: () => { const v = parseFloat(input.value); set(v); out.textContent = fmt(v); redraw(); } });
    return h('div', { class: 'blend-slider' }, input, out);
  };

  const settings = h('div', { class: 'blend-fields' });
  const renderFields = () => {
    settings.replaceChildren(
      checkbox('Blend edges with neighbouring tiles', b.blend, (v) => { b.blend = v; renderFields(); redraw(); }),
      field('Priority', numberInput(b.priority, (v) => { b.priority = Math.round(v); redraw(); }, { step: '1' }),
        'Where two tiles meet, the higher priority spreads over the lower (equal: the tile imported later). Built-in: grass 30, path 20, sand 10, lake bed 0; imported tiles start from their name (grass 32, dirt 22, sand 14, water 5; floors and walls don’t blend).'),
      field('Blend width', slider(b.width, 0.05, 0.5, 0.01, (v) => (b.width = v), 'Blend width', (v) => `${v.toFixed(2)} tiles`), 'How far this tile reaches into a lower-priority neighbour.'),
      field('Edge roughness', slider(b.roughness, 0, 1, 0.05, (v) => (b.roughness = v), 'Edge roughness', (v) => `${Math.round(v * 100)}%`), '0% is an even line, 100% wanders a lot.'),
      field('Edge style', select(EDGES, b.edge, (v) => { b.edge = v as TileBlend['edge']; redraw(); })),
      def.builtin ? h('span', {}) : checkbox('Follow texture detail (bright parts such as stones reach further)', b.detail, (v) => { b.detail = v; redraw(); }),
    );
    for (const el of settings.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type=checkbox]), select')) el.disabled = !b.blend;
  };
  renderFields();

  const nbSelect = select(others.map((t) => [t.key, t.name] as [string, string]), neighbour, (v) => { neighbour = v; redraw(); }, { 'aria-label': 'Neighbour tile in the preview' });
  const body = h('div', { class: 'blend-editor' },
    h('div', { class: 'blend-preview-col' },
      preview,
      h('div', { class: 'blend-nb' }, h('span', { class: 'swatch-note' }, 'Next to'), nbSelect),
      relation,
      h('p', { class: 'note' }, 'Blending happens in the game and the playtest; the editor map keeps square tiles so they’re easy to paint. Edges never blend across a cliff or a shoreline.')),
    settings);
  redraw();

  const reset = h('button', { type: 'button', class: 'btn ghost', onclick: () => {
    Object.assign(b, new TileCatalog({ tiles: store.assets.tiles }).blendFor(key));
    renderFields(); redraw();
  } }, 'Reset to defaults');

  openModal(`Edge blending · ${def.name}`, body, [
    { label: 'Cancel' },
    { label: 'Apply', primary: true, onClick: () => { void setTileBlend(store, key, b); } },
  ], undefined, { wide: true, footStart: reset });
}

/**
 * Draw the preview: this tile on the left, the neighbour on the right, with an island of each in
 * the other. Built-in tiles come from the game's ground painter; imported tiles are layered on top
 * with the same rules the game's shader uses.
 */
function drawPreview(canvas: HTMLCanvasElement, store: EditorStore, key: string, b: TileBlend, nb: string): void {
  const W = PREVIEW_W, H = PREVIEW_H;
  const terrain: string[] = [];
  for (let z = 0; z < H; z++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      let t = x < W / 2 ? key : nb;
      if ((x === 7 && z === 1) || (x === 2 && z === 3)) t = t === key ? nb : key;
      row += t;
    }
    terrain.push(row);
  }
  const cat = new TileCatalog({ ...store.assets, tileBlend: { ...(store.assets.tileBlend ?? {}), [key]: b } });
  const map = new TileMap({ name: 'preview', width: W, height: H, terrain, props: [], lights: [], events: [] }, cat);
  const base = groundCanvas(map);
  const ctx = base.getContext('2d')!;
  // Imported tiles, lowest priority first, so the higher one ends up on top.
  const imported = [...new Set([key, nb])].filter((k) => cat.isCustom(k)).sort((a, c) => cat.blendFor(a).priority - cat.blendFor(c).priority);
  for (const k of imported) {
    const layer = document.createElement('canvas');
    layer.width = W * TS; layer.height = H * TS;
    const lc = layer.getContext('2d')!;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) drawTile(lc, k, x, z, x * TS, z * TS, (cx, cz) => map.terrain(cx, cz));
    const src = lc.getImageData(0, 0, layer.width, layer.height), dst = ctx.getImageData(0, 0, layer.width, layer.height);
    const bk = cat.blendFor(k);
    for (let py = 0; py < layer.height; py++)
      for (let px = 0; px < layer.width; px++) {
        const i = (py * layer.width + px) * 4;
        const lum = (0.299 * src.data[i] + 0.587 * src.data[i + 1] + 0.114 * src.data[i + 2]) / 255;
        const keep = overlayKeep(map, cat, k, bk, px, py, lum);
        if (keep <= 0) continue;
        for (let c = 0; c < 3; c++) dst.data[i + c] = Math.round(dst.data[i + c] * (1 - keep) + src.data[i + c] * keep);
      }
    ctx.putImageData(dst, 0, 0);
  }
  const out = canvas.getContext('2d')!;
  out.imageSmoothingEnabled = false;
  out.drawImage(base, 0, 0, canvas.width, canvas.height);
}

/** How much of imported tile k shows at a pixel: the same rules as the game's shader (render/tileBlend.ts). */
function overlayKeep(map: TileMap, cat: TileCatalog, k: string, bk: TileBlend, px: number, py: number, lum: number): number {
  const u = (px + 0.5) / TS, v = (py + 0.5) / TS, cx = Math.floor(u), cz = Math.floor(v);
  const own = map.terrain(cx, cz);
  const n = vnoise(u * 2.3, v * 2.3, 7) * 0.75 + hash2(px, py, 3) * 0.25;
  const dith = bk.edge === 'dither' ? (bayer(px, py) - 0.5) * 0.18 : 0;
  const det = bk.detail ? (lum - 0.5) * 0.35 : 0;
  const edge = (s: number) => (bk.edge === 'smooth' ? smooth(-0.1, 0.1, s) : s >= 0 ? 1 : 0);
  if (own === k) {
    if (!bk.blend) return 1;
    let keep = 1;
    for (const [dx, dz] of NEIGHBOURS8) {
      const x = cx + dx, z = cz + dz;
      if (!map.inMap(x, z)) continue;
      const t = map.terrain(x, z), bt = cat.blendFor(t);
      if (t === k || cat.isCustom(t) || !bt.blend || bt.priority <= bk.priority) continue;
      keep = Math.min(keep, edge(cellDistance(u, v, x, z) - (reach(bt, n) + dith - det)));
    }
    return keep;
  }
  const bo = cat.blendFor(own);
  if (!bk.blend || !bo.blend || bk.priority <= bo.priority) return 0;
  let keep = 0;
  for (const [dx, dz] of NEIGHBOURS8) {
    const x = cx + dx, z = cz + dz;
    if (!map.inMap(x, z) || map.terrain(x, z) !== k) continue;
    keep = Math.max(keep, edge(reach(bk, n) + dith + det - cellDistance(u, v, x, z)));
  }
  return keep;
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
