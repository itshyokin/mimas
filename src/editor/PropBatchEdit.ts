/**
 * Editing several props at once (ticked in the Props palette). Each setting starts as the props' shared value, or
 * "keep each one's own" where they differ; only the settings changed here are written to every picked prop, and
 * everything else about each prop (its picture, size, footprint, light, drops…) stays as it was.
 */
import { builtinProp, isBuiltinProp } from '../world/props';
import type { PropDef } from '../world/types';
import { saveProps } from './assets';
import { walkSoundOptions } from './CommandEditor';
import { field, h, openModal, select, toast } from './dom';
import type { EditorStore } from './store';

interface Setting {
  key: string;
  label: string;
  hint?: string;
  options: [string, string][];
  get(d: PropDef): string;
  set(d: PropDef, v: string): void;
}

const yesNo: [string, string][] = [['yes', 'Yes'], ['no', 'No']];
const flag = (k: 'wall' | 'stretch' | 'respawn' | 'forge') => ({
  get: (d: PropDef) => (d[k] ? 'yes' : 'no'),
  set: (d: PropDef, v: string) => { if (v === 'yes') d[k] = true; else delete d[k]; },
});
const SWAYS = [0, 0.5, 0.8, 1, 1.3];

const SETTINGS: Setting[] = [
  { key: 'shape', label: 'Shape', options: [['flat', 'Flat (one picture)'], ['solid', 'Solid block (pushed back)'], ['crossX', 'Cross × (two at 45°)'], ['crossPlus', 'Cross + (one side-on)'], ['crossStar', 'Star ✳ (cross × plus one facing front)'], ['rows', 'Rows ≡ (three staggered rows)'], ['thicket', 'Thicket (rows of crossing pairs)']],
    get: (d) => d.shape ?? 'flat', set: (d, v) => { if (v === 'flat') { delete d.shape; delete d.thickness; } else d.shape = v as NonNullable<PropDef['shape']>; } },
  { key: 'collide', label: 'Collision', hint: 'For props with a footprint (set up in the importer).', options: [['solid', 'Solid (its X tiles block)'], ['flat', 'Flat (a thin strip along the picture)']],
    get: (d) => d.collide ?? 'solid', set: (d, v) => { if (v === 'flat') d.collide = 'flat'; else delete d.collide; } },
  { key: 'filter', label: 'Pixels', options: [['point', 'Sharp (pixel art)'], ['smooth', 'Smooth (painted art)']],
    get: (d) => d.filter ?? 'point', set: (d, v) => { d.filter = v as 'point' | 'smooth'; } },
  { key: 'castShadow', label: 'Casts a shadow', options: yesNo,
    get: (d) => (d.castShadow === false ? 'no' : 'yes'), set: (d, v) => { if (v === 'no') d.castShadow = false; else delete d.castShadow; } },
  { key: 'sway', label: 'Sways in the wind', options: [['0', 'No (stiff)'], ['0.5', 'A little (bushes, vines)'], ['0.8', 'Some (pines, tall trees)'], ['1', 'Like a tree'], ['1.3', 'A lot (grass, flowers, saplings)']],
    get: (d) => String(SWAYS.reduce((a, b) => (Math.abs(b - (d.sway ?? 0)) < Math.abs(a - (d.sway ?? 0)) ? b : a))),
    set: (d, v) => { const n = Number(v); if (n > 0) d.sway = n; else delete d.sway; } },
  { key: 'season', label: 'Seasons', options: [['', 'Guess from its name'], ['leaves', 'Leaves change colour, kept in winter'], ['bare', 'Leaves change colour, bare in winter'], ['off', 'Doesn’t change']],
    get: (d) => d.season ?? '', set: (d, v) => { if (v) d.season = v as NonNullable<PropDef['season']>; else delete d.season; } },
  { key: 'wall', label: 'Sits flat against the wall behind it', options: yesNo, ...flag('wall') },
  { key: 'stretch', label: 'Stretches to the wall’s height', options: yesNo, ...flag('stretch') },
  { key: 'front', label: 'Always drawn in front of tiles', hint: 'Turn off for tall platforms or bridges whose legs show through the ground.', options: yesNo,
    get: (d) => (d.frontOfTiles === false ? 'no' : 'yes'), set: (d, v) => { if (v === 'no') d.frontOfTiles = false; else delete d.frontOfTiles; } },
  { key: 'rustle', label: 'Rustles when walked through', options: [['', 'Tall grass shapes that don’t block'], ['yes', 'Yes'], ['no', 'No']],
    get: (d) => (d.rustle === undefined ? '' : d.rustle ? 'yes' : 'no'), set: (d, v) => { if (v) d.rustle = v === 'yes'; else delete d.rustle; } },
  { key: 'deck', label: 'Walk on top (bridge or platform)', options: [['', 'No'], ['h', 'Bridge running east–west'], ['v', 'Bridge running north–south'], ['any', 'Platform or dock (any way)']],
    get: (d) => (d.deck ? d.deck.dir ?? 'any' : ''),
    set: (d, v) => {
      if (!v) { delete d.deck; if (builtinProp(d.id)?.deck) d.noDeck = true; return; }
      const was = d.deck ?? builtinProp(d.id)?.deck;
      d.deck = { style: was?.style ?? 'wood', ...(v !== 'any' ? { dir: v as 'h' | 'v' } : {}), ...(was?.rails !== undefined ? { rails: was.rails } : {}) };
      // Kept as it was drawn; new ones show their own picture.
      if (was ? was.art || !d.builtin : true) d.deck.art = true;
      delete d.noDeck;
      d.block = [];
    } },
  { key: 'deckLook', label: 'Bridge or platform drawn as', hint: 'Only for props that are walked on.', options: [['art', 'Its picture, lying flat'], ['artStand', 'Its picture, standing up'], ['wood', 'Built in 3D: wooden planks'], ['rope', 'Built in 3D: rope bridge'], ['stone', 'Built in 3D: stone']],
    get: (d) => (d.deck ? (d.deck.art ? (d.deck.stand ? 'artStand' : 'art') : d.deck.style) : ''),
    set: (d, v) => {
      if (!d.deck) return;
      if (v === 'art' || v === 'artStand') { d.deck.art = true; if (v === 'artStand') d.deck.stand = true; else delete d.deck.stand; }
      else { delete d.deck.art; delete d.deck.stand; d.deck.style = v as 'wood' | 'rope' | 'stone'; }
    } },
  { key: 'walkSound', label: 'Walk sound', hint: 'The hero’s footsteps on it.', get options() { return walkSoundOptions(); },
    get: (d) => d.walkSound ?? '', set: (d, v) => { if (v) d.walkSound = v; else delete d.walkSound; } },
  { key: 'tilt', label: 'Camera tilt (leans back toward the map camera)', options: yesNo,
    get: (d) => (d.noTilt ? 'no' : 'yes'), set: (d, v) => { if (v === 'no') d.noTilt = true; else delete d.noTilt; } },
  { key: 'respawn', label: 'Is a respawn point', options: yesNo, ...flag('respawn') },
  { key: 'forge', label: 'Is a forge (anvil)', options: yesNo, ...flag('forge') },
];
/** Settings applied first (a prop becomes walkable before its look is chosen). */
const ORDER = SETTINGS.map((s) => s.key);

/** Open the window for the picked props. `done` runs after saving (to clear the picks). */
export function openPropBatchEdit(store: EditorStore, ids: string[], done: () => void): void {
  const defs = ids.map((id) => store.catalog.get(id)).filter((d): d is PropDef => !!d);
  if (defs.length < 2) { toast('Tick two or more props to edit them together.'); return; }
  const changed = new Map<string, string>();
  const MIXED = '\u0000mixed';
  const rows = SETTINGS.map((st) => {
    const values = new Set(defs.map((d) => st.get(d)));
    const mixed = values.size > 1;
    const opts: [string, string][] = mixed ? [[MIXED, '— Keep each one’s own (they differ) —'], ...st.options] : st.options;
    const sel = select(opts, mixed ? MIXED : [...values][0], (v) => {
      if (v === MIXED || (!mixed && v === [...values][0])) changed.delete(st.key); else changed.set(st.key, v);
      row.classList.toggle('batch-changed', changed.has(st.key));
    });
    const row = field(st.label, sel, st.hint);
    return row;
  });
  const names = defs.map((d) => d.name);
  const body = h('div', { class: 'prop-batch' },
    h('p', { class: 'hint' }, `Editing ${defs.length} props: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}. Only the settings you change here are given to all of them; everything else about each one (its picture, size, footprint, light, drops…) stays as it is.`),
    ...rows);
  openModal(`Edit ${defs.length} props together`, body, [
    { label: 'Cancel' },
    { label: 'Save', primary: true, onClick: () => {
      if (!changed.size) { toast('Nothing changed.'); return; }
      const out = defs.map((d) => {
        const copy = structuredClone(d);
        for (const key of ORDER) { const v = changed.get(key); if (v !== undefined) SETTINGS.find((s) => s.key === key)!.set(copy, v); }
        return copy;
      });
      const fresh = out.filter((d) => isBuiltinProp(d.id) && !store.assets.props.some((x) => x.id === d.id)).length;
      void saveProps(store, out).then((ok) => {
        if (!ok) return;
        const built = fresh;
        toast(`Saved ${changed.size} setting${changed.size === 1 ? '' : 's'} to ${out.length} props${built ? ` (${built} built-in, now customised)` : ''}`);
        done();
      });
    } },
  ], undefined, { wide: true });
}
