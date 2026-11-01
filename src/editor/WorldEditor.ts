/**
 * World layout (toolbar → World): every field map on one big grid. Drag maps into place; they snap edge to edge to the
 * maps around them. Maps that touch can be walked between without a fade when that side of the map is set to
 * Seamless (Inspector → Borders), and the neighbour is drawn past the edge. Place names (towns, landmarks) go on the
 * game's world map (Pause → Map). Also: how places not visited yet look there.
 */
import type { EditorStore } from './store';
import { checkbox, field, h, openModal, select, textInput, toast } from './dom';
import { drawTile } from './editorArt';
import type { MapData } from '../world/types';
import { averageColor, builtinTileColor, drawMapArt, propMark } from '../render/worldMapArt';
import { snapPlacement, type WorldData, type WorldFog, type WorldLabel, type WorldPlacement } from '../world/worldLayout';

const PX = 4;

export async function openWorldLayout(store: EditorStore): Promise<void> {
  // Every field map (battle maps aren't part of the world).
  const maps = new Map<string, MapData>();
  for (const n of store.maps) {
    try {
      const m = n === store.mapName ? store.map : await store.project.readMap(n);
      if (m.kind !== 'battle') maps.set(n, m);
    } catch { /* unreadable: left out */ }
  }
  const world: WorldData = structuredClone(store.db.world ?? { maps: {} });
  world.maps ??= {};
  // Sizes follow the maps (a map may have been resized since).
  for (const [n, p] of Object.entries(world.maps)) {
    const m = maps.get(n);
    if (!m) { delete world.maps[n]; continue; }
    p.w = m.width; p.h = m.height;
  }
  const colors = new Map<string, string>();
  const tileColor = (key: string): string => {
    let c = colors.get(key);
    if (c) return c;
    c = builtinTileColor(key);
    if (!c) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 16;
      const g = cv.getContext('2d')!;
      try { drawTile(g, key, 0, 0, 0, 0, () => key); c = averageColor(cv); } catch { c = '#5f9a45'; }
    }
    colors.set(key, c);
    return c;
  };
  const art = new Map<string, HTMLCanvasElement>();
  const artOf = (n: string) => {
    let a = art.get(n);
    if (!a) { a = drawMapArt(maps.get(n)!, store.tiles, { tile: tileColor, prop: (t) => propMark(store.catalog.get(t)) }, PX); art.set(n, a); }
    return a;
  };

  // View: centre (world tiles) and zoom (screen pixels per tile).
  let cx = 0, cz = 0, zoom = 4, selected: string | null = null, placingLabel = false, selLabel: number | null = null;
  const canvas = h('canvas', { class: 'wl-canvas' });
  const side = h('div', { class: 'wl-side' });
  const fit = () => {
    const ps = Object.values(world.maps);
    if (!ps.length) { cx = 0; cz = 0; return; }
    const x0 = Math.min(...ps.map((p) => p.x)), z0 = Math.min(...ps.map((p) => p.z)), x1 = Math.max(...ps.map((p) => p.x + p.w)), z1 = Math.max(...ps.map((p) => p.z + p.h));
    cx = (x0 + x1) / 2; cz = (z0 + z1) / 2;
    const r = canvas.getBoundingClientRect();
    zoom = Math.max(1, Math.min(10, Math.min((r.width || 600) / (x1 - x0 + 8), (r.height || 400) / (z1 - z0 + 8))));
  };
  const toWorld = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - r.width / 2) / zoom + cx, z: (e.clientY - r.top - r.height / 2) / zoom + cz };
  };
  const draw = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#16263a'; g.fillRect(0, 0, r.width, r.height);
    const sx = (x: number) => (x - cx) * zoom + r.width / 2, sz = (z: number) => (z - cz) * zoom + r.height / 2;
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let x = Math.floor((cx - r.width / 2 / zoom) / 8) * 8; sx(x) < r.width; x += 8) { g.beginPath(); g.moveTo(Math.round(sx(x)) + 0.5, 0); g.lineTo(Math.round(sx(x)) + 0.5, r.height); g.stroke(); }
    for (let z = Math.floor((cz - r.height / 2 / zoom) / 8) * 8; sz(z) < r.height; z += 8) { g.beginPath(); g.moveTo(0, Math.round(sz(z)) + 0.5); g.lineTo(r.width, Math.round(sz(z)) + 0.5); g.stroke(); }
    for (const [n, p] of Object.entries(world.maps)) {
      g.drawImage(artOf(n), sx(p.x), sz(p.z), p.w * zoom, p.h * zoom);
      g.strokeStyle = n === selected ? '#ffd27a' : 'rgba(0,0,0,0.6)'; g.lineWidth = n === selected ? 2 : 1;
      g.strokeRect(sx(p.x) + 0.5, sz(p.z) + 0.5, p.w * zoom - 1, p.h * zoom - 1);
      // Seamless sides: a dashed line along them.
      const b = maps.get(n)?.border, sides = { n: b?.n ?? b?.kind, s: b?.s ?? b?.kind, w: b?.w ?? b?.kind, e: b?.e ?? b?.kind };
      g.setLineDash([4, 3]); g.strokeStyle = '#7fe0ff'; g.lineWidth = 2;
      if (sides.n === 'seamless') { g.beginPath(); g.moveTo(sx(p.x), sz(p.z) + 1); g.lineTo(sx(p.x + p.w), sz(p.z) + 1); g.stroke(); }
      if (sides.s === 'seamless') { g.beginPath(); g.moveTo(sx(p.x), sz(p.z + p.h) - 1); g.lineTo(sx(p.x + p.w), sz(p.z + p.h) - 1); g.stroke(); }
      if (sides.w === 'seamless') { g.beginPath(); g.moveTo(sx(p.x) + 1, sz(p.z)); g.lineTo(sx(p.x) + 1, sz(p.z + p.h)); g.stroke(); }
      if (sides.e === 'seamless') { g.beginPath(); g.moveTo(sx(p.x + p.w) - 1, sz(p.z)); g.lineTo(sx(p.x + p.w) - 1, sz(p.z + p.h)); g.stroke(); }
      g.setLineDash([]);
      g.font = '600 12px system-ui, sans-serif'; g.fillStyle = 'rgba(0,0,0,0.65)';
      const label = maps.get(n)?.name || n, tw = g.measureText(label).width;
      g.fillRect(sx(p.x) + 4, sz(p.z) + 4, tw + 10, 18); g.fillStyle = '#fff'; g.fillText(label, sx(p.x) + 9, sz(p.z) + 17);
    }
    (world.labels ?? []).forEach((l, k) => {
      const x = sx(l.x), z = sz(l.z);
      g.fillStyle = k === selLabel ? '#ffd27a' : '#ffffff';
      g.beginPath(); g.arc(x, z, 4, 0, Math.PI * 2); g.fill();
      g.font = '700 12px system-ui, sans-serif';
      const tw = g.measureText(l.name).width;
      g.fillStyle = 'rgba(10, 14, 24, 0.8)'; g.fillRect(x + 7, z - 9, tw + 8, 17);
      g.fillStyle = k === selLabel ? '#ffd27a' : '#f3ead8'; g.fillText(l.name, x + 11, z + 4);
    });
  };
  const changed = () => { draw(); renderSide(); };

  // Dragging a map (snapping to the others), or the view.
  let drag: { kind: 'map'; name: string; ox: number; oz: number } | { kind: 'label'; k: number } | { kind: 'view'; x: number; y: number; cx: number; cz: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const w = toWorld(e);
    if (placingLabel) {
      (world.labels ??= []).push({ id: `place${Date.now().toString(36)}`, name: 'New place', x: Math.round(w.x), z: Math.round(w.z), kind: 'town' });
      selLabel = world.labels.length - 1; placingLabel = false; changed(); return;
    }
    const lk = (world.labels ?? []).findIndex((l) => Math.hypot(l.x - w.x, l.z - w.z) * zoom < 9);
    if (lk >= 0) { selLabel = lk; selected = null; drag = { kind: 'label', k: lk }; changed(); return; }
    const hit = Object.entries(world.maps).reverse().find(([, p]) => w.x >= p.x && w.x < p.x + p.w && w.z >= p.z && w.z < p.z + p.h);
    if (hit) { selected = hit[0]; selLabel = null; drag = { kind: 'map', name: hit[0], ox: w.x - hit[1].x, oz: w.z - hit[1].z }; changed(); return; }
    selected = null; selLabel = null;
    drag = { kind: 'view', x: e.clientX, y: e.clientY, cx, cz };
    changed();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'view') { cx = drag.cx - (e.clientX - drag.x) / zoom; cz = drag.cz - (e.clientY - drag.y) / zoom; draw(); return; }
    const w = toWorld(e);
    if (drag.kind === 'label') { const l = world.labels![drag.k]; l.x = Math.round(w.x); l.z = Math.round(w.z); draw(); return; }
    const moving = drag.name, p = world.maps[moving];
    const want: WorldPlacement = { ...p, x: Math.round(w.x - drag.ox), z: Math.round(w.z - drag.oz) };
    const at = snapPlacement(want, Object.entries(world.maps).filter(([n]) => n !== moving).map(([, q]) => q), Math.max(1, Math.round(6 / zoom)));
    p.x = at.x; p.z = at.z;
    draw();
  });
  canvas.addEventListener('pointerup', () => { drag = null; renderSide(); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.max(1, Math.min(12, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); draw(); }, { passive: false });

  const renderSide = () => {
    const placed = Object.keys(world.maps);
    const rows = [...maps.keys()].map((n) => checkbox(maps.get(n)!.name || n, placed.includes(n), (on) => {
      if (on) {
        const m = maps.get(n)!, ps = Object.values(world.maps);
        const x = ps.length ? Math.max(...ps.map((p) => p.x + p.w)) : 0, z = ps.length ? Math.min(...ps.map((p) => p.z)) : 0;
        world.maps[n] = { x, z, w: m.width, h: m.height };
        selected = n;
      } else delete world.maps[n];
      changed();
    }));
    const lab = selLabel !== null ? world.labels?.[selLabel] : undefined;
    side.replaceChildren(
      h('div', { class: 'section-label' }, 'Maps in the world'),
      h('div', { class: 'wl-maps' }, ...rows),
      h('p', { class: 'note' }, 'Drag a map to move it; it snaps edge to edge. A side set to Seamless (Inspector → Borders: dashed blue here) is walked straight across into the map touching it, which is drawn past the edge.'),
      h('div', { class: 'section-label' }, 'Place names'),
      h('button', { type: 'button', class: 'btn small', 'aria-pressed': String(placingLabel), onclick: () => { placingLabel = !placingLabel; renderSide(); } }, placingLabel ? 'Click the map to place it…' : 'Add a place name'),
      lab ? h('div', { class: 'wl-label-form' },
        field('Name', textInput(lab.name, (v) => { lab.name = v.trim() || 'Place'; draw(); })),
        field('Kind', select([['town', 'Town'], ['landmark', 'Landmark'], ['dungeon', 'Dungeon'], ['region', 'Region (large, faint)']], lab.kind ?? 'town', (v) => { lab.kind = v as WorldLabel['kind']; draw(); })),
        h('button', { type: 'button', class: 'btn danger small', onclick: () => { world.labels!.splice(selLabel!, 1); selLabel = null; changed(); } }, 'Remove')) : h('p', { class: 'note' }, 'Click a name on the map to edit it, drag it to move it.'),
      h('div', { class: 'section-label' }, 'In the game (Pause → Map)'),
      field('Places not visited yet', select([['hidden', 'Hidden'], ['grey', 'Greyed out'], ['visible', 'Fully visible']], world.unvisited ?? 'hidden', (v) => { world.unvisited = v as WorldFog; })),
      checkbox('Explore: only the ground walked near shows in maps visited', world.explore !== false, (v) => { world.explore = v ? undefined : false; }),
    );
  };

  const body = h('div', { class: 'wl-body' }, canvas, side);
  openModal('World layout', body, [
    { label: 'Cancel' },
    { label: 'Apply', primary: true, onClick: () => {
      store.checkpoint();
      if (Object.keys(world.maps).length || world.labels?.length) store.db.world = world; else delete store.db.world;
      store.changedDb();
      toast('World layout updated (save to keep it)');
    } },
  ], undefined, { wide: true });
  renderSide();
  requestAnimationFrame(() => { fit(); draw(); });
}
