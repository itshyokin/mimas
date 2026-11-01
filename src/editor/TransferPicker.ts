/**
 * The "Transfer player" command form: destination map, a clickable picture of that map to choose
 * the spot, the direction to face on arrival, and the fade.
 */
import { parseHeights } from '../world/heights';
import type { Command, Dir, MapData } from '../world/types';
import { field, h, numberInput, select } from './dom';
import { TS, drawTile } from './editorArt';
import type { EditorStore } from './store';

type Transfer = Extract<Command, { cmd: 'transfer' }>;

/** Short text for the command list, e.g. "map002 (12, 4), facing up". */
export function transferSummary(c: Transfer): string {
  return `${c.map || '(no map)'} (${c.x}, ${c.z})${c.dir ? `, facing ${c.dir}` : ''}${c.fade === 'white' ? ', white fade' : c.fade === 'none' ? ', no fade' : ''}`;
}

export function transferFields(store: EditorStore, d: Transfer): HTMLElement[] {
  const maps = [...new Set([store.mapName, ...store.maps])].sort();
  if (!d.map) d.map = store.mapName;
  const canvas = h('canvas', { class: 'transfer-map', 'aria-label': 'Click the map to choose where the player arrives' });
  const status = h('div', { class: 'hint' }, 'Loading map…');
  const xIn = numberInput(d.x, (v) => { d.x = Math.max(0, Math.round(v)); draw(); }, { step: '1', min: '0', 'aria-label': 'Destination x' });
  const zIn = numberInput(d.z, (v) => { d.z = Math.max(0, Math.round(v)); draw(); }, { step: '1', min: '0', 'aria-label': 'Destination z' });
  let target: MapData | null = null;
  let scale = 1;

  const draw = () => {
    if (!target) return;
    const m = target, w = m.width * TS, hh = m.height * TS;
    scale = Math.min(1.5, 560 / w, 300 / hh);
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(hh * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const at = (x: number, z: number) => m.terrain[Math.max(0, Math.min(m.height - 1, z))]?.[Math.max(0, Math.min(m.width - 1, x))] ?? '.';
    for (let z = 0; z < m.height; z++) for (let x = 0; x < m.width; x++) drawTile(ctx, at(x, z), x, z, x * TS, z * TS, at);
    // Heights as light and shade, so cliffs and pits read at a glance.
    const hs = parseHeights(m.heights, m.width, m.height);
    for (let z = 0; z < m.height; z++)
      for (let x = 0; x < m.width; x++) {
        const v = hs[z * m.width + x];
        if (!v) continue;
        ctx.fillStyle = v > 0 ? `rgba(255,244,214,${Math.min(0.45, v * 0.05)})` : `rgba(6,10,40,${Math.min(0.6, -v * 0.07)})`;
        ctx.fillRect(x * TS, z * TS, TS, TS);
      }
    ctx.fillStyle = 'rgba(255,176,74,0.35)';
    for (const ev of m.events) ctx.fillRect(ev.x * TS + 2, ev.z * TS + 2, (ev.w ?? 1) * TS - 4, (ev.h ?? 1) * TS - 4);
    // The destination.
    const inside = d.x < m.width && d.z < m.height;
    ctx.lineWidth = 2 / scale;
    ctx.strokeStyle = inside ? '#7fd3ff' : '#ff6b6b';
    ctx.strokeRect(Math.min(d.x, m.width - 1) * TS + 1, Math.min(d.z, m.height - 1) * TS + 1, TS - 2, TS - 2);
    if (d.dir) {
      const cx = (Math.min(d.x, m.width - 1) + 0.5) * TS, cz = (Math.min(d.z, m.height - 1) + 0.5) * TS;
      const [dx, dz] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[d.dir];
      ctx.beginPath(); ctx.moveTo(cx, cz); ctx.lineTo(cx + dx * 6, cz + dz * 6); ctx.stroke();
    }
    status.textContent = inside ? `${m.name || d.map}: ${m.width} × ${m.height} tiles. Click to choose where the player arrives.`
      : `(${d.x}, ${d.z}) is outside this map (${m.width} × ${m.height}). Click inside it.`;
    status.classList.toggle('error', !inside);
  };

  const load = async () => {
    target = null;
    status.textContent = 'Loading map…';
    try {
      target = d.map === store.mapName ? store.map : await store.project.readMap(d.map);
      draw();
    } catch (err) {
      status.textContent = `Couldn’t load ${d.map}: ${err instanceof Error ? err.message : String(err)}`;
    }
  };

  canvas.addEventListener('click', (e) => {
    if (!target) return;
    const r = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) * (canvas.width / r.width)) / scale / TS);
    const z = Math.floor(((e.clientY - r.top) * (canvas.height / r.height)) / scale / TS);
    if (x < 0 || z < 0 || x >= target.width || z >= target.height) return;
    d.x = x; d.z = z;
    xIn.value = String(x); zIn.value = String(z);
    draw();
  });
  void load();

  return [
    field('Destination map', select(maps.map((n) => [n, n === store.mapName ? `${n} (this map)` : n] as [string, string]), d.map, (v) => { d.map = v; void load(); })),
    h('div', { class: 'transfer-map-wrap' }, canvas, status),
    h('div', { class: 'field-row' }, field('X', xIn), field('Z', zIn)),
    h('div', { class: 'field-row' },
      field('Facing on arrival', select([['', 'Keep facing'], ['up', 'Up'], ['down', 'Down'], ['left', 'Left'], ['right', 'Right']], d.dir ?? '',
        (v) => { d.dir = (v || undefined) as Dir | undefined; draw(); })),
      field('Fade', select([['black', 'Fade to black'], ['white', 'Fade to white'], ['none', 'No fade']], d.fade ?? 'black',
        (v) => (d.fade = v === 'black' ? undefined : (v as 'white' | 'none'))))),
    h('p', { class: 'hint' }, 'A transfer ends the event: commands after it don’t run. Put it last.'),
  ];
}
