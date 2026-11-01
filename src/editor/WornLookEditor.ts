/**
 * Database → Items → an armor, accessory or shield → Look when worn.
 * Update 128: an outfit from the built-in clothing (made from the Character Builder's parts): a Top, a Bottom and an
 * Accessory, each picked with ← → (or None), each with colour swatches (the part's own palettes) or a tint of your
 * choosing, and a live preview of the outfit on the player's look. On the far right, "Use custom clothes sprite"
 * switches to sheets of your own instead: Character Builder parts (Update 120) or exported PNGs (Update 114), for
 * masculine and feminine bodies. Heroes wear the version for their outfit gender (Database → Heroes).
 */
import type { CharacterDef, ItemDef, WornPick } from '../world/types';
import type { EditorStore } from './store';
import { characterSheetImage } from './editorArt';
import { checkbox, h } from './dom';
import { openCustomWorn, customPicImage } from './CustomWornEditor';
import { drawPic } from '../world/wornCustom';
import { WORN_SLOTS, WORN_SLOT_NAMES, loadWornParts, recolorCanvas, recolorPairs, standingCell, tintSheet, wornPart, wornParts, type WornSlot } from '../world/wornParts';

type Body = 'masc' | 'femme';
let previewBody: Body = 'masc';

/** Built-in part sheets for the editor's previews (path → image). */
const sheetCache = new Map<string, Promise<HTMLImageElement | null>>();
function sheetImage(store: EditorStore, path: string): Promise<HTMLImageElement | null> {
  let p = sheetCache.get(path);
  if (!p) {
    p = (async () => {
      try {
        const b = await store.project.readFile(path);
        const url = URL.createObjectURL(b);
        return await new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
      } catch { return null; }
    })();
    sheetCache.set(path, p);
  }
  return p;
}
let partsLoad: Promise<unknown> | null = null;
const ensureParts = (store: EditorStore) => (partsLoad ??= loadWornParts(async (p) => (await store.project.readFile(p)).text()));

/** One pick drawn standing (its swatch or tint applied) onto `g` at size `s`. */
async function drawPick(store: EditorStore, g: CanvasRenderingContext2D, pick: WornPick | undefined, body: Body, s: number, under = false): Promise<void> {
  const p = wornPart(pick?.part);
  const path = under ? p?.under?.[body] : p?.sheets[body], lay = p?.layout[body], cell = standingCell(lay);
  if (!p || !path || !cell) return;
  const img = await sheetImage(store, path);
  if (!img) return;
  const one = document.createElement('canvas'); one.width = one.height = cell.size;
  one.getContext('2d')!.drawImage(img, cell.x, cell.y, cell.size, cell.size, 0, 0, cell.size, cell.size);
  let c: HTMLCanvasElement = one;
  const pairs = recolorPairs(p, pick?.swatch);
  if (pairs) c = recolorCanvas(c, pairs);
  if (pick?.tint) c = tintSheet(c, pick.tint);
  g.drawImage(c, 0, 0, cell.size, cell.size, 0, 0, s, s);
}

export function wornLookForm(store: EditorStore, d: ItemDef, rerender: () => void): HTMLElement {
  const w = d.worn ?? {};
  const set = () => {
    // Update 137: the custom sprite (its tick box and pictures) counts too; without it, ticking the box or saving the
    // pictures from the pop-up was thrown away when nothing else was picked.
    const pics = w.customPics && (['masc', 'femme'] as const).some((b) => { const p = w.customPics?.[b]; return !!(p?.front || p?.back || p?.side); });
    const keep = w.masc || w.femme || w.parts?.masc?.length || w.parts?.femme?.length || w.top || w.bottom || w.accessory || w.custom || pics || w.tint;
    if (keep) d.worn = w; else delete d.worn;
  };
  const animKey = (b: Body) => (b === 'masc' ? 'mascAnim' : 'femmeAnim') as 'mascAnim' | 'femmeAnim';
  const box = h('section', { class: 'db-section worn-look' }, h('h3', {}, 'Look when worn'), h('p', { class: 'note' }, 'Loading the clothing…'));

  /** The combined preview: the player's look with the outfit over it (or the custom sheets). */
  const preview = h('canvas', { class: 'worn-preview big', width: '128', height: '128' }) as HTMLCanvasElement;
  const drawPreview = async () => {
    const g = preview.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 128, 128);
    const look: CharacterDef | undefined = store.db.characters[store.db.player];
    const base = look?.sheet ? characterSheetImage(look.sheet) : undefined, bc = standingCell(look?.anim);
    for (const slot of WORN_SLOTS) await drawPick(store, g, w[slot], previewBody, 128, true);
    if (base && bc) g.drawImage(base, bc.x, bc.y, bc.size, bc.size, 0, 0, 128, 128);
    if (w.custom) {
      const pics = w.customPics?.[previewBody] ?? w.customPics?.[previewBody === 'femme' ? 'masc' : 'femme'], p = pics?.front;
      const img = p ? await customPicImage(store, p.src) : null;
      if (p && img) {
        const big = document.createElement('canvas'); big.width = big.height = 64;
        drawPic(big.getContext('2d')!, img, p, 0, 0, 64);
        g.drawImage(w.tint ? tintSheet(big, w.tint) : big, 0, 0, 64, 64, 0, 0, 128, 128);
      } else {
        const path = w[previewBody], c = standingCell(w[animKey(previewBody)]);
        const sheet = path ? characterSheetImage(path) : undefined;
        if (sheet && c) g.drawImage(w.tint ? tintSheet(sheet, w.tint) : sheet, c.x, c.y, c.size, c.size, 0, 0, 128, 128);
      }
      return;
    }
    for (const slot of WORN_SLOTS) await drawPick(store, g, w[slot], previewBody, 128);
  };

  /** One slot's panel: its picture, ← name →, swatches and a tint. */
  const slotPanel = (slot: WornSlot): HTMLElement => {
    const list = wornParts().filter((p) => p.slot === slot);
    const pick = w[slot], part = wornPart(pick?.part), idx = part ? list.indexOf(part) : -1;
    const pic = h('canvas', { class: 'worn-preview', width: '96', height: '96' }) as HTMLCanvasElement;
    const g = pic.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    void drawPick(store, g, pick, previewBody, 96, true).then(() => drawPick(store, g, pick, previewBody, 96));
    const go = (step: number) => {
      const n = list.length + 1, k = ((idx + 1 + step) % n + n) % n - 1;
      if (k < 0) delete w[slot]; else w[slot] = { part: list[k].id };
      set(); rerender();
    };
    const swatches = part?.recolor?.swatches ?? [];
    const chips = h('div', { class: 'worn-swatches' },
      h('button', { type: 'button', class: `worn-chip none${pick && pick.swatch === undefined && !pick.tint ? ' on' : ''}`, title: 'As drawn', disabled: !pick, onclick: () => { if (!pick) return; delete pick.swatch; delete pick.tint; set(); rerender(); } }, '·'),
      ...swatches.map((s, k) => h('button', { type: 'button', class: `worn-chip${pick?.swatch === k ? ' on' : ''}`, title: s.name, style: `background:linear-gradient(${s.cols[4] ?? s.cols[3]}, ${s.cols[2] ?? s.cols[1]})`, onclick: () => { if (!pick) return; pick.swatch = k; delete pick.tint; set(); rerender(); } })));
    const tint = h('input', { type: 'color', value: pick?.tint ?? '#c0a080', disabled: !pick, title: 'More colours: tint it any colour' }) as HTMLInputElement;
    tint.addEventListener('change', () => { if (!pick) return; pick.tint = tint.value; delete pick.swatch; set(); rerender(); });
    return h('div', { class: `worn-panel${w.custom ? ' off' : ''}` },
      h('b', { class: 'worn-slot' }, WORN_SLOT_NAMES[slot]),
      pic,
      h('div', { class: 'worn-cycle' },
        h('button', { type: 'button', class: 'btn small', 'aria-label': `Previous ${WORN_SLOT_NAMES[slot]}`, onclick: () => go(-1) }, '◀'),
        h('span', { class: 'worn-name' }, part?.name ?? 'None'),
        h('button', { type: 'button', class: 'btn small', 'aria-label': `Next ${WORN_SLOT_NAMES[slot]}`, onclick: () => go(1) }, '▶')),
      part ? chips : h('span'),
      part ? h('label', { class: 'worn-tint' }, 'More colours / tint ', tint) : h('span'));
  };

  /** The custom sprite panel (Update 134): pictures placed over the hero in a pop-up, per body and direction. */
  const customPanel = (): HTMLElement => {
    const cp = w.customPics ?? {};
    const sum = (b: Body) => { const x = cp[b]; return x ? (['front', 'back', 'side'] as const).filter((v) => x[v]).map((v) => v[0].toUpperCase() + v.slice(1)).join(', ') || 'nothing yet' : 'nothing yet'; };
    const tint = h('input', { type: 'color', value: w.tint ?? '#c0a080', disabled: !w.tint }) as HTMLInputElement;
    tint.addEventListener('change', () => { w.tint = tint.value; set(); rerender(); });
    const legacy = w.masc || w.femme;
    return h('div', { class: `worn-panel custom${w.custom ? '' : ' dim'}` },
      h('b', { class: 'worn-slot' }, 'Custom sprite'),
      checkbox('Use custom clothes sprite', !!w.custom, (v) => { if (v) w.custom = true; else delete w.custom; set(); rerender(); }),
      h('button', { type: 'button', class: 'btn primary small', onclick: () => { d.worn = w; openCustomWorn(store, d, () => { set(); rerender(); }); } }, 'Edit custom sprite…'),
      h('div', { class: 'worn-row' }, h('span', { class: 'worn-label' }, 'Masc'), h('span', { class: 'note' }, sum('masc'))),
      h('div', { class: 'worn-row' }, h('span', { class: 'worn-label' }, 'Femme'), h('span', { class: 'note' }, sum('femme'))),
      h('div', { class: 'worn-row' }, checkbox('Tint it', !!w.tint, (on) => { if (on) w.tint = tint.value; else delete w.tint; tint.disabled = !on; set(); rerender(); }), tint),
      h('p', { class: 'note' }, 'Up to three pictures (Front, Back, Side) from your PNGs or the item icons, placed over the hero for each body. They bob with the walk.'),
      legacy ? h('div', { class: 'worn-row' }, h('span', { class: 'note' }, `Older full sheet in use (${[w.masc ? 'masc' : '', w.femme ? 'femme' : ''].filter(Boolean).join(', ')}).`),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => { delete w.masc; delete w.femme; delete w.mascAnim; delete w.femmeAnim; delete w.parts; set(); rerender(); } }, 'Remove it')) : h('span'));
  };

  void ensureParts(store).then(() => {
    const has = wornParts().length;
    box.replaceChildren(h('h3', {}, 'Look when worn'),
      h('p', { class: 'note' }, 'Pick a Top, a Bottom and an Accessory (← →; None for nothing), each with a colour swatch or a tint of your own. Heroes wearing the item get it drawn over their sprite, covering their own clothes, in the version for their outfit gender (Database → Heroes). Tick “Use custom clothes sprite” to use sheets of your own instead.'),
      h('div', { class: 'worn-head' }, h('span', { class: 'note' }, 'Preview:'),
        h('button', { type: 'button', class: `btn small${previewBody === 'masc' ? ' primary' : ''}`, onclick: () => { previewBody = 'masc'; rerender(); } }, 'Masc'),
        h('button', { type: 'button', class: `btn small${previewBody === 'femme' ? ' primary' : ''}`, onclick: () => { previewBody = 'femme'; rerender(); } }, 'Femme'), preview),
      h('div', { class: 'worn-panels' }, ...(has ? WORN_SLOTS.map(slotPanel) : [h('p', { class: 'note' }, 'The built-in clothing (public/assets/worn/builtin) is missing.')]), customPanel()));
    void drawPreview();
  });
  return box;
}
