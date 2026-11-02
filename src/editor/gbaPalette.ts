/**
 * Mimas: the left panel for the GBA layers (Ground, Paths & water, Cliffs, Objects, Passability):
 * tools, the GBA Studio tiles for the layer, cliff tiers, ledge pieces and Show blocked.
 */
import { CELL, LEDGE_PIECES, MAX_TIER, TILE_TYPES, ledgeCell, type GbaTile } from '../gba/types';
import { h } from './dom';
import { gba } from './gbaShared';
import { LAYER_TYPES, type GbaLayerMode } from './gbaPaint';
import type { EditorStore } from './store';

export const GBA_MODE_INFO: Record<GbaLayerMode, { label: string; help: string }> = {
  gground: { label: 'Ground', help: 'The bottom layer: grass, sand, floors.' },
  gpath: { label: 'Paths & water', help: 'Paths and water over the ground. Corners, edges and one-tile-wide strips are picked for you.' },
  gcliff: { label: 'Cliffs', help: 'Paint the area of a raised plateau: the ring of cliff edges is drawn around it and the top stays walkable. Tier 2 inside tier 1 is a higher level; right at its edge, a taller cliff. Stairs or a ladder (Objects) make the way up.' },
  gobjects: { label: 'Objects', help: 'Trees (click where the trunk goes), decorations, ledges, stairs, ladders, tall grass and doors, from GBA Studio.' },
  gpass: { label: 'Passability', help: 'RPG Maker-style overrides: O makes a cell walkable, ✕ blocks it, whatever is drawn there.' },
};

const TOOLS: [EditorStore['gbaTool'], string, string][] = [['pencil', 'Paint', 'B'], ['rect', 'Rectangle', 'R'], ['fill', 'Fill', 'G'], ['erase', 'Erase', 'E']];

function tileThumb(t: GbaTile): HTMLCanvasElement {
  const img = gba.images.get(t.image);
  const c = document.createElement('canvas');
  c.width = c.height = 40;
  c.className = 'gs-tile-thumb';
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#2a3a2a';
  g.fillRect(0, 0, 40, 40);
  if (!img) return c;
  let sx = 0, sy = 0, sw = CELL, sh = CELL;
  if (t.type === 'cliff') { sy = 2 * CELL; sw = 2 * CELL; }
  else if (TILE_TYPES[t.type].autotile) { sx = CELL; sy = CELL; }
  else if (t.type === 'object') { sw = (t.w ?? 2) * CELL; sh = (t.h ?? 2) * CELL; }
  else if (t.type === 'ledge') sx = CELL;
  const s = Math.min(40 / sw, 40 / sh);
  g.drawImage(img, sx, sy, sw, sh, (40 - sw * s) / 2, (40 - sh * s) / 2, sw * s, sh * s);
  return c;
}

export function gbaPanel(s: EditorStore, openStudio: () => void): Node[] {
  const mode = s.mode as GbaLayerMode;
  const out: Node[] = [];
  if (!s.map.gba) {
    out.push(h('p', { class: 'note' }, 'This is an old Saturn map, painted with Saturn tiles. Convert it to a GBA map (⚙ Map Properties → Convert to GBA map) to paint it with your GBA Studio tiles. Its events, props and encounter zones stay.'));
    return out;
  }
  out.push(h('div', { class: 'toolrow', role: 'group', 'aria-label': 'Tool' }, ...TOOLS.map(([t, label, key]) =>
    h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.gbaTool === t), title: `${label} (${key})`, onclick: () => { s.gbaTool = t; s.emit('ui'); } }, label))));
  out.push(h('p', { class: 'note' }, GBA_MODE_INFO[mode].help));

  if (mode === 'gpass') {
    out.push(h('div', { class: 'toolrow small' }, ...([['O', 'O · walkable'], ['X', '✕ · blocked'], ['.', 'Clear']] as const).map(([v, label]) =>
      h('button', { type: 'button', class: 'tool', 'aria-pressed': String(s.gbaPass === v), onclick: () => { s.gbaPass = v; if (s.gbaTool === 'erase') s.gbaTool = 'pencil'; s.emit('ui'); } }, label))),
      h('p', { class: 'note' }, 'Red tint: blocked. Blue: water. Orange arrows: ledges (hop that way). Overrides win over everything drawn.'));
  } else {
    const types = LAYER_TYPES[mode];
    const tiles = gba.data.tiles.filter((t) => types.includes(t.type));
    if (!s.gbaBrush[mode] || !tiles.some((t) => t.id === s.gbaBrush[mode])) s.gbaBrush[mode] = tiles[0]?.id;
    out.push(h('div', { class: 'section-label' }, 'Tiles'),
      tiles.length ? h('div', { class: 'gs-tile-grid' }, ...tiles.map((t) => h('button', {
        type: 'button', class: `gs-tile-pick${s.gbaBrush[mode] === t.id ? ' on' : ''}`, title: `${t.name} (${TILE_TYPES[t.type].label})`,
        onclick: () => { s.gbaBrush[mode] = t.id; if (s.gbaTool === 'erase') s.gbaTool = 'pencil'; s.emit('ui'); },
      }, tileThumb(t), h('span', {}, t.name))))
        : h('p', { class: 'note' }, `No ${types.map((ty) => TILE_TYPES[ty].label.toLowerCase()).join(' or ')} tiles yet.`),
      h('button', { type: 'button', class: 'btn ghost small', onclick: openStudio }, 'Make or edit tiles in GBA Studio…'));
    if (mode === 'gcliff') {
      out.push(h('div', { class: 'gs-tiers' }, h('span', {}, 'Tier:'),
        ...Array.from({ length: MAX_TIER }, (_, i) => h('button', { type: 'button', class: `btn${s.gbaTier === i + 1 ? ' primary' : ''}`, onclick: () => { s.gbaTier = i + 1; s.emit('ui'); } }, String(i + 1)))),
        h('p', { class: 'note' }, 'Erasing removes this tier and the ones above it. Numbers on the map show each cell’s tier.'));
    }
    const brush = gba.data.tiles.find((t) => t.id === s.gbaBrush[mode]);
    if (mode === 'gobjects' && brush?.type === 'ledge') {
      const img = gba.images.get(brush.image);
      out.push(h('div', { class: 'section-label' }, 'Ledge piece'), h('div', { class: 'gs-ledges' }, ...LEDGE_PIECES.map((label, i) => {
        const c = document.createElement('canvas');
        c.width = c.height = 32;
        const g = c.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        const [lx, ly] = ledgeCell(i);
        if (img) g.drawImage(img, lx * CELL, ly * CELL, CELL, CELL, 0, 0, 32, 32);
        return h('button', { type: 'button', class: `gs-tile-pick${s.ledgePiece === i ? ' on' : ''}`, title: label, onclick: () => { s.ledgePiece = i; s.emit('ui'); } }, c, h('span', {}, label));
      })));
    }
  }
  out.push(h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: s.showBlocked, onchange: (e: Event) => { s.showBlocked = (e.target as HTMLInputElement).checked; s.emit('ui'); } }),
    h('span', {}, 'Show blocked (as the ROM sees it)')));
  return out;
}
