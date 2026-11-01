/**
 * Database → Characters: the people events, enemies and the player are drawn as. Import character sheets
 * (from the Character Builder, whose LPC sheets carry their animations and credits inside the PNG, or any
 * RPG Maker MV-style sheet: 3 frames across × 4 rows, any frame size), rename them, pick the player, replace or
 * remove a sheet. Sheets are saved to public/assets/characters/.
 */
import { canvasFromBlob } from '../shared/images';
import { type BuilderSheetMeta, readBuilderMeta } from '../shared/pngText';
import type { CharacterDef, ModelLook } from '../world/types';
import { editorCharModel, openCharacterModel } from './characterModelEditor';
import { modelStyle, renderCharacterPicture } from '../render/characterModel';
import { characterFrame, setCharacterSheet } from './editorArt';
import { checkbox, field, h, select, toast } from './dom';
import { openBattleIdle } from './BattleIdleEditor';
import type { EditorStore } from './store';

export interface CharactersWork { chars: Record<string, CharacterDef>; player: string; /** How 3D characters are drawn (unset: Legend of Dragoon). */ look?: ModelLook; /** Their outline (unset: with Legend of Dragoon only). */ outline?: boolean }

const slug = (s: string) => s.toLowerCase().replace(/\.png$/i, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'character';
const niceName = (file: string) => file.replace(/\.png$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()) || 'Character';

/** Load every imported sheet the database names (at project open). */
export async function loadCharacterSheets(store: EditorStore): Promise<void> {
  await Promise.all(Object.values(store.db.characters).map(async (c) => {
    if (!c.sheet) return;
    try {
      const blob = await store.project.readFile(c.sheet);
      store.files.set(c.sheet, blob);
      setCharacterSheet(c.sheet, await canvasFromBlob(blob));
    } catch { console.warn(`${c.name}: character sheet ${c.sheet} is missing`); }
  }));
}

/** Apply a sheet's builder metadata (animations, credits) to a character, or clear it for a plain sheet. */
function applyMeta(c: CharacterDef, meta: BuilderSheetMeta | null): void {
  if (meta) {
    c.anim = { frame: meta.frame, dirs: meta.dirs, anims: meta.anims };
    // Body type for worn looks, from the builder's body (female, teen and pregnant: feminine).
    if (meta.body && !c.body) c.body = meta.body === 'female' || meta.body === 'teen' || meta.body === 'pregnant' ? 'femme' : 'masc';
    if (meta.credits?.length) c.credits = meta.credits; else delete c.credits;
  } else { delete c.anim; delete c.credits; }
}

/** Check a sheet's shape: 3 × 4 frames of whole pixels. Returns a warning, or ''. */
function shapeWarning(c: HTMLCanvasElement, meta: BuilderSheetMeta | null = null): string {
  if (meta) return '';
  if (c.width % 3 || c.height % 4) return `${c.width} × ${c.height} px doesn’t split evenly into 3 × 4 frames`;
  const fw = c.width / 3, fh = c.height / 4;
  if (Math.abs(fh / fw - 1.5) > 0.01) return `its frames are ${fw} × ${fh}; characters look right at 2 : 3 (like 16 × 24 or 32 × 48)`;
  return '';
}

/** Save one sheet into the project (or keep it for this session when the editor can't write files). */
async function storeSheet(store: EditorStore, path: string, blob: Blob): Promise<HTMLCanvasElement | null> {
  let canvas: HTMLCanvasElement;
  try { canvas = await canvasFromBlob(blob); } catch { toast('That file isn’t an image the browser can read', 'error'); return null; }
  const p = store.project, persistent = p.canSave && p.canStoreImages;
  if (persistent) {
    try { await p.writeFile(path, blob); }
    catch (err) { toast(`Couldn’t save the sheet: ${err instanceof Error ? err.message : String(err)}`, 'error'); return null; }
  }
  store.files.set(path, blob);
  setCharacterSheet(path, canvas);
  return canvas;
}

function pickPngs(multiple: boolean, done: (files: File[]) => void): void {
  const input = h('input', { type: 'file', accept: 'image/png', multiple });
  input.addEventListener('change', () => { const f = [...(input.files ?? [])]; if (f.length) done(f); });
  input.click();
}

export function charactersTab(store: EditorStore, w: CharactersWork, rerender: () => void): HTMLElement[] {
  const importSheets = () => pickPngs(true, async (files) => {
    let added = 0;
    const warnings: string[] = [];
    for (const f of files) {
      let id = slug(f.name), n = 2;
      while (w.chars[id]) id = `${slug(f.name)}_${n++}`;
      const path = `assets/characters/${id}.png`;
      const canvas = await storeSheet(store, path, f);
      if (!canvas) continue;
      const meta = await readBuilderMeta(f);
      const warn = shapeWarning(canvas, meta);
      if (warn) warnings.push(`${f.name}: ${warn}`);
      const def: CharacterDef = { name: meta?.name?.trim() || niceName(f.name), sheet: path };
      applyMeta(def, meta);
      w.chars[id] = def;
      added++;
    }
    if (added) {
      const p = store.project;
      toast(warnings.length ? `Imported ${added}. Check: ${warnings.join('; ')}` : p.canSave && p.canStoreImages ? `Imported ${added} character${added === 1 ? '' : 's'} to assets/characters/` : 'Imported for this session only: open the project folder itself to keep imported sheets.', warnings.length ? 'error' : 'ok');
    }
    rerender();
  });

  const style = modelStyle({ modelLook: w.look, modelOutline: w.outline });
  const usedBy = (id: string): string[] => {
    const out: string[] = [];
    if (w.player === id) out.push('the player');
    const ev = store.map.events.filter((e) => e.pages.some((pg) => pg.character === id)).length;
    if (ev) out.push(`${ev} event${ev === 1 ? '' : 's'} on this map`);
    const foes = (store.db.enemies ?? []).filter((d) => d.look.character === id).length;
    if (foes) out.push(`${foes} enem${foes === 1 ? 'y' : 'ies'}`);
    return out;
  };

  const card = (id: string, c: CharacterDef) => {
    const frame = characterFrame(id, c, 'down');
    const thumb = document.createElement('canvas');
    thumb.width = frame.width; thumb.height = frame.height; thumb.className = 'char-thumb';
    thumb.getContext('2d')!.drawImage(frame, 0, 0);
    // A 3D character: its model, rendered (once it's read).
    if (c.model) void editorCharModel(store, c.model).then((m) => {
      const pic = renderCharacterPicture(m, c.model!, style, 'down', 'full', 96);
      thumb.width = pic.width; thumb.height = pic.height;
      thumb.getContext('2d')!.drawImage(pic, 0, 0);
    }).catch(() => { /* shown as missing below */ });
    const sheet = c.sheet ? store.files.get(c.sheet) : undefined;
    const n = c.anim ? Object.keys(c.anim.anims).length : 0;
    const safe = c.credits?.length ? c.credits.every((x) => x.licenses.some((l) => /^(CC0|OGA-BY)/.test(l.trim()))) : null;
    const size = c.model ? `3D model${c.model.anims ? ` (${Object.keys(c.model.anims).length} slot${Object.keys(c.model.anims).length === 1 ? '' : 's'} set)` : ''}` : c.anim ? `Animated (${n} animation${n === 1 ? '' : 's'})${safe === null ? '' : safe ? ' · Steam-safe' : ' · not Steam-safe'}` : c.sheet ? `${frame.width} × ${frame.height} frames` : 'Built-in look';
    const used = usedBy(id);
    let armed = false;
    const del = h('button', { type: 'button', class: 'btn small danger', disabled: w.player === id, title: w.player === id ? 'Choose another player first' : undefined,
      onclick: () => {
        if (!armed) { armed = true; del.textContent = used.length ? `Used by ${used.join(', ')}. Delete anyway?` : 'Click again to delete'; return; }
        delete w.chars[id]; rerender();
      } }, 'Delete');
    return h('div', { class: 'char-card' + (w.player === id ? ' is-player' : '') },
      thumb,
      h('div', { class: 'char-info' },
        h('input', { type: 'text', value: c.name, 'aria-label': 'Name', onchange: (e: Event) => { c.name = (e.target as HTMLInputElement).value.trim() || c.name; } }),
        h('span', { class: 'char-meta' }, h('code', {}, id), ' · ', size, sheet ? '' : c.sheet ? ' · file missing' : ''),
        h('div', { class: 'char-btns' },
          h('label', { class: 'check' }, h('input', { type: 'radio', name: 'db-player', checked: w.player === id, onchange: () => { w.player = id; rerender(); } }), h('span', {}, 'Player')),
          h('button', { type: 'button', class: 'btn small', onclick: () => pickPngs(false, async ([f]) => {
            const path = c.sheet ?? `assets/characters/${id}.png`;
            const canvas = await storeSheet(store, path, f);
            if (!canvas) return;
            c.sheet = path;
            const meta = await readBuilderMeta(f);
            applyMeta(c, meta);
            const warn = shapeWarning(canvas, meta);
            toast(warn ? `Sheet replaced, but ${warn}` : `Sheet replaced for ${c.name}`, warn ? 'error' : 'ok');
            rerender();
          }) }, c.sheet ? 'Replace sheet…' : 'Use a sheet…'),
          h('button', { type: 'button', class: 'btn small', onclick: () => openCharacterModel(store, id, c, style, rerender) }, c.model ? '3D model…' : 'Use a 3D model…'),
          c.anim ? select([['masc', 'Body: masculine'], ['femme', 'Body: feminine']], c.body ?? 'masc', (v) => { if (v === 'femme') c.body = 'femme'; else delete c.body; }, { 'aria-label': 'Body type for worn looks', title: 'Which version of an item’s Look when worn they wear' }) : '',
          c.anim ? h('button', { type: 'button', class: 'btn small', title: 'Frames of one row looped as they stand in battle', onclick: () => void openBattleIdle(store, c, rerender) }, c.battleIdle ? `Battle idle: row ${c.battleIdle.row + 1}…` : 'Battle idle…') : '',
          del)));
  };

  const ids = Object.keys(w.chars).sort((a, b) => (a === w.player ? -1 : b === w.player ? 1 : w.chars[a].name.localeCompare(w.chars[b].name)));
  return [
    h('section', { class: 'db-section db-wide' },
      h('h3', {}, 'Characters'),
      h('div', { class: 'char-btns' }, h('button', { type: 'button', class: 'btn', onclick: importSheets }, 'Import character sheets…')),
      h('div', { class: 'char-3d-style' },
        h('div', { class: 'section-label' }, '3D characters'),
        h('div', { class: 'field-row' },
          field('Look', select([['lod', 'Legend of Dragoon: low-res, crisp, flat shading'], ['ffx', 'Final Fantasy X: smooth']], w.look ?? 'lod', (v) => { w.look = v === 'lod' ? undefined : v as ModelLook; rerender(); }, { 'aria-label': '3D look' })),
          checkbox('Dark outline', style.outline, (v) => { w.outline = v === ((w.look ?? 'lod') === 'lod') ? undefined : v; rerender(); })),
        h('p', { class: 'hint' }, 'For every character with a 3D model (its card’s 3D model… button). The outline is on with Legend of Dragoon and off with FFX unless set here.')),
      h('p', { class: 'note' }, 'Sheets from the Character Builder bring their animations (walk, run, attacks…) and credits with them; credits appear on the Credits screen. Plain RPG Maker MV-style sheets (3 frames across × 4 rows: facing down, left, right, up) also work, walking only. Pick several files at once to import a batch.'),
      h('div', { class: 'char-grid' }, ...ids.map((id) => card(id, w.chars[id])))),
  ];
}
