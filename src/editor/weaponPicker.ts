/**
 * Choosing the LPC sprite a weapon, bow or shield is drawn with (on animated characters): a button showing the
 * current one, opening a grid of every weapon sprite of the right kind — the built-in LPC weapons and the ones made
 * in the weapon builder (imported here: Import from the weapon builder…).
 */
import { WEAPON_MANIFEST_PATH, itemWeaponSprite } from '../game/combat/weaponSprites';
import { cutIcon, weaponIconRect } from '../art/weaponIcon';
import { readWeaponMeta } from '../shared/pngText';
import type { ItemDef, WeaponSpriteDef, WeaponSpriteKind, WeaponSpriteManifest } from '../world/types';
import { h, openModal, toast } from './dom';
import type { EditorStore } from './store';

export interface WeaponList { list: WeaponSpriteDef[]; byId: Map<string, WeaponSpriteDef>; thumbs: HTMLCanvasElement | null; manifest: WeaponSpriteManifest }

let loading: Promise<WeaponList | null> | null = null;

/** The project's built-in weapon sprite list and previews (null in a project without them). Loaded once. */
export function loadWeaponList(store: EditorStore): Promise<WeaponList | null> {
  loading ??= (async () => {
    try {
      const blob = await store.project.readFile(WEAPON_MANIFEST_PATH);
      store.files.set(WEAPON_MANIFEST_PATH, blob);
      const manifest = JSON.parse(await blob.text()) as WeaponSpriteManifest;
      let thumbs: HTMLCanvasElement | null = null;
      try {
        const tb = await store.project.readFile(WEAPON_MANIFEST_PATH.replace('weapons.json', 'thumbs.png'));
        store.files.set(WEAPON_MANIFEST_PATH.replace('weapons.json', 'thumbs.png'), tb);
        thumbs = await blobCanvas(tb);
      } catch { /* no previews */ }
      return { list: manifest.weapons, byId: new Map(manifest.weapons.map((w) => [w.id, w])), thumbs, manifest };
    } catch { return null; }
  })();
  return loading;
}

async function blobCanvas(b: Blob): Promise<HTMLCanvasElement> {
  const img = await createImageBitmap(b);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

/** A weapon sprite by id: one made in the weapon builder (this project's), else a built-in one. */
export function findWeapon(store: EditorStore, wl: WeaponList | null, id: string | undefined): WeaponSpriteDef | undefined {
  if (!id) return undefined;
  return store.db.weaponSprites?.find((w) => w.id === id) ?? wl?.byId.get(id);
}

/** Read the sheets of the weapon sprites in `ids` into the editor's files (handed to playtests). */
export async function loadWeaponSheets(store: EditorStore, ids: Iterable<string>): Promise<void> {
  const wl = await loadWeaponList(store);
  await Promise.all([...new Set(ids)].map(async (id) => {
    const d = findWeapon(store, wl, id);
    if (!d || store.files.has(d.file)) return;
    try { store.files.set(d.file, await store.project.readFile(d.file)); } catch { console.warn(`Weapon sheet ${d.file} is missing`); }
  }));
}

/** Icons cut from the sprites (by id), for the editor's lists. */
const icons = new Map<string, Promise<HTMLCanvasElement | null>>();
export function weaponIcon(store: EditorStore, wl: WeaponList | null, d: WeaponSpriteDef | undefined): Promise<HTMLCanvasElement | null> {
  if (!d) return Promise.resolve(null);
  let p = icons.get(d.id + '|' + d.file);
  if (!p) {
    p = (async () => {
      const r = weaponIconRect(d, wl?.manifest ?? { thumbSize: 64, thumbCols: 16 });
      if (!r.inSheet) return wl?.thumbs ? cutIcon(wl.thumbs, r) : null;
      try {
        const blob = store.files.get(d.file) ?? await store.project.readFile(d.file);
        store.files.set(d.file, blob);
        return cutIcon(await blobCanvas(blob), r);
      } catch { return null; }
    })();
    icons.set(d.id + '|' + d.file, p);
  }
  return p;
}

/** A weapon sprite's icon, drawn into a `size` px canvas (filled in once it's loaded). */
export function weaponThumb(store: EditorStore, wl: WeaponList | null, d: WeaponSpriteDef | undefined, size = 48): HTMLCanvasElement {
  const c = h('canvas', { class: 'weapon-thumb', width: size, height: size });
  void weaponIcon(store, wl, d).then((icon) => {
    if (!icon) return;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    // Whole pixels where it fits: 1×, 2×…; bigger ones are scaled down to fit.
    const k = icon.width <= size ? Math.floor(size / icon.width) : size / icon.width;
    const s = Math.round(icon.width * k);
    g.drawImage(icon, Math.floor((size - s) / 2), Math.floor((size - s) / 2), s, s);
  });
  return c;
}

const KIND_LABEL: Record<WeaponSpriteKind, string> = { sword: 'Swords', blunt: 'Maces and clubs', staff: 'Staffs and wands', bow: 'Bows', shield: 'Shields' };

/**
 * Import weapons exported by the weapon builder (PNG files with their layout inside). Each one's sheet is saved to
 * assets/weapons/custom/ and its look added to the database (replacing one with the same id). Returns the ids.
 */
export async function importBuilderWeapons(store: EditorStore, files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    const meta = await readWeaponMeta(f);
    if (!meta) { toast(`${f.name} isn’t a weapon from the weapon builder (export it there with Export PNG).`, 'error'); continue; }
    const base = (meta.name || f.name.replace(/\.png$/i, '')).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'weapon';
    const list = (store.db.weaponSprites ??= []);
    // The same name again replaces it (re-exported after changes); a built-in id is never reused.
    const id = `my_${base}`;
    const file = `assets/weapons/custom/${base}.png`;
    const p = store.project;
    const persistent = p.canSave && p.canStoreImages;
    try { if (persistent) await p.writeFile(file, f); }
    catch (err) { toast(`Couldn’t save ${f.name}: ${err instanceof Error ? err.message : String(err)}`, 'error'); continue; }
    store.files.set(file, f);
    for (const k of [...icons.keys()]) if (k.startsWith(id + '|')) icons.delete(k);
    const def: WeaponSpriteDef = {
      id, name: meta.name || base, kind: meta.kind, file, width: meta.width, height: meta.height,
      layers: meta.layers, anims: meta.anims, thumb: 0, icon: meta.icon, custom: true, base: meta.base, credits: meta.credits ?? [],
      ...(meta.effects && (meta.effects.glow || meta.effects.trail) ? { effects: meta.effects } : {}),
    };
    store.checkpoint();
    const i = list.findIndex((w) => w.id === id);
    if (i >= 0) list[i] = def; else list.push(def);
    store.changedDb('ui');
    if (!persistent) toast('Weapon kept for this session only: open the project folder itself to save imported images.');
    out.push(id);
  }
  if (out.length) toast(`Imported ${out.length} weapon${out.length === 1 ? '' : 's'}.`);
  return out;
}

/** A file picker for weapon PNGs; `done` gets the imported ids. */
export function pickWeaponFiles(store: EditorStore, done: (ids: string[]) => void): void {
  const file = h('input', { type: 'file', accept: 'image/png', multiple: true, hidden: true });
  file.addEventListener('change', async () => {
    const files = [...(file.files ?? [])];
    file.remove();
    if (files.length) done(await importBuilderWeapons(store, files));
  });
  document.body.appendChild(file);
  file.click();
}

/**
 * A field for a sprite choice. `value` undefined means automatic (`auto` is what that picks), '' means none.
 */
export function weaponSpriteField(store: EditorStore, opts: {
  value: string | undefined; auto: string; kinds: WeaponSpriteKind[]; onChange: (v: string | undefined) => void; autoLabel?: string;
}): HTMLElement {
  const box = h('div', { class: 'weapon-pick' }, h('span', { class: 'note' }, 'Loading weapon sprites…'));
  void loadWeaponList(store).then((wl) => {
    const mine = (store.db.weaponSprites ?? []).filter((w) => opts.kinds.includes(w.kind));
    if (!wl && !mine.length) { box.replaceChildren(h('span', { class: 'note' }, 'This project has no LPC weapon sprites (public/assets/weapons/). The icon is shown instead.')); return; }
    const shown = opts.value === undefined ? opts.auto : opts.value;
    const d = findWeapon(store, wl, shown);
    const label = opts.value === undefined ? `${d?.name ?? 'None'} (automatic)` : d ? d.name : opts.value === '' ? 'None (shows the icon)' : `${opts.value} (missing)`;
    box.replaceChildren(h('button', { type: 'button', class: 'btn weapon-pick-btn', onclick: () => openPicker(wl) }, weaponThumb(store, wl, d), h('span', {}, label)));
  });
  const openPicker = (wl: WeaponList | null) => {
    let close = () => {};
    const pick = (v: string | undefined) => { opts.onChange(v); close(); };
    const cell = (w: WeaponSpriteDef) => h('button', { type: 'button', class: 'weapon-cell', 'aria-pressed': String(w.id === (opts.value ?? opts.auto)), title: `${w.name} · ${w.anims.join(', ')}`, onclick: () => pick(w.id) },
      weaponThumb(store, wl, w, 56), h('span', {}, w.name));
    const mine = (store.db.weaponSprites ?? []).filter((w) => opts.kinds.includes(w.kind));
    const groups = opts.kinds.map((k) => {
      const list = (wl?.list ?? []).filter((w) => w.kind === k);
      if (!list.length) return null;
      return h('section', {}, h('h3', { class: 'weapon-group' }, KIND_LABEL[k]), h('div', { class: 'weapon-grid' }, ...list.map(cell)));
    });
    const importBtn = h('button', { type: 'button', class: 'btn', onclick: () => pickWeaponFiles(store, (ids) => {
      const fit = ids.find((id) => opts.kinds.includes(findWeapon(store, wl, id)!.kind));
      if (fit) pick(fit);
      else if (ids.length) { toast('Imported, but that kind of weapon doesn’t fit here (a bow on a sword, say).'); close(); }
    }) }, 'Import from the weapon builder…');
    const body = h('div', { class: 'weapon-picker' },
      h('p', { class: 'note' }, 'Drawn on animated (LPC) characters with their own swings. Attacks use what the sprite has: swords with full combos slash, half-slash and backslash; longswords and maces mix in thrusts; staffs thrust. All are Steam-safe (credited in the Credits screen).'),
      h('div', { class: 'weapon-grid' },
        h('button', { type: 'button', class: 'weapon-cell', 'aria-pressed': String(opts.value === undefined), onclick: () => pick(undefined) }, weaponThumb(store, wl, findWeapon(store, wl, opts.auto), 56), h('span', {}, opts.autoLabel ?? 'Automatic')),
        h('button', { type: 'button', class: 'weapon-cell', 'aria-pressed': String(opts.value === ''), onclick: () => pick('') }, h('canvas', { class: 'weapon-thumb', width: 56, height: 56 }), h('span', {}, 'None (icon)'))),
      h('section', {}, h('h3', { class: 'weapon-group' }, 'Your weapons (made in the weapon builder)'),
        mine.length ? h('div', { class: 'weapon-grid' }, ...mine.map(cell)) : h('p', { class: 'note' }, 'None yet. Make one in the Character Builder → Weapons, export it as a PNG and import it here.'),
        h('div', { class: 'weapon-import' }, importBtn)),
      ...groups.filter((x): x is HTMLElement => !!x));
    close = openModal('Choose a weapon sprite', body, [{ label: 'Cancel' }], undefined, { wide: true });
  };
  return box;
}

/** The sprite field for an item (weapons, bows, shields). */
export function itemSpriteField(store: EditorStore, d: ItemDef, rerender: () => void): HTMLElement | null {
  const kinds: WeaponSpriteKind[] | null = d.slot === 'shield' ? ['shield'] : d.weapon?.class === 'bow' ? ['bow'] : d.slot === 'weapon' ? ['sword', 'blunt', 'staff'] : null;
  if (!kinds) return null;
  const auto = itemWeaponSprite({ ...d, sprite: undefined });
  return weaponSpriteField(store, { value: d.sprite, auto, kinds, onChange: (v) => {
    if (v === undefined) delete d.sprite; else d.sprite = v;
    // A weapon of your own: its icon follows its look, and it brings the glow and trail it was made with
    // (unless the item already has its own).
    const mine = v ? store.db.weaponSprites?.find((w) => w.id === v) : undefined;
    if (mine) {
      d.icon = 'sprite';
      if (mine.effects?.glow && !d.glow && d.slot !== 'shield') d.glow = { ...mine.effects.glow };
      if (mine.effects?.trail && !d.trail && d.slot === 'weapon') d.trail = { ...mine.effects.trail };
    }
    rerender();
  } });
}
