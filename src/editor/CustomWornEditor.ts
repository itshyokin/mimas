/**
 * Custom worn sprite builder (Update 134): a pop-up for an item's own clothes pictures. Up to three pictures (Front,
 * Back, Side; the side one is mirrored for the other side), each a PNG of your own or one of the built-in item icons.
 * Front / Back / Side tabs show the player's sprite facing that way: drag the picture into place, scroll (or the
 * slider) to scale it, per body (Masc / Femme). "Duplicate from …" copies the other body's setup to start from. In the
 * game each picture is drawn in every frame of its direction, bobbing with the hero (world/wornCustom.ts).
 */
import type { CharacterDef, CustomWornBody, CustomWornPic, ItemDef } from '../world/types';
import type { EditorStore } from './store';
import { builtinIcon, iconGroups, ITEM_ICONS } from '../art/itemIcons';
import { characterSheetImage } from './editorArt';
import { canvasFromBlob } from '../shared/images';
import { h, openModal, toast } from './dom';
import { WORN_VIEWS, WORN_VIEW_NAMES, drawPic, viewFor, type WornView } from '../world/wornCustom';
import { standingCell } from '../world/wornParts';

type Body = 'masc' | 'femme';
const SIZE = 320; // the editing canvas (a 64-pixel frame at 5×)
const K = SIZE / 64;

/** A picture source as an image: "icon:<name>" (a built-in icon) or a project path. */
const picCache = new Map<string, HTMLCanvasElement>();
async function loadPic(store: EditorStore, src: string): Promise<HTMLCanvasElement | null> {
  const hit = picCache.get(src);
  if (hit) return hit;
  try {
    const c = src.startsWith('icon:') ? builtinIcon(src.slice(5)) : await canvasFromBlob(store.files.get(src) ?? await store.project.readFile(src));
    picCache.set(src, c);
    return c;
  } catch { return null; }
}
export const customPicImage = loadPic;

/** The player's standing frame facing `dir`, from their look (null without an animated sheet). */
function heroFrame(store: EditorStore, dir: 'down' | 'up' | 'left'): HTMLCanvasElement | null {
  const look: CharacterDef | undefined = store.db.characters[store.db.player];
  const sheet = look?.sheet ? characterSheetImage(look.sheet) : undefined, lay = look?.anim, cell = standingCell(lay);
  if (!sheet || !lay || !cell) return null;
  const walk = lay.anims.walk ?? lay.anims.idle!, r = walk.dirs === 4 ? Math.max(0, lay.dirs.indexOf(dir)) : 0;
  const c = document.createElement('canvas'); c.width = c.height = lay.frame;
  c.getContext('2d')!.drawImage(sheet, 0, (walk.row + r) * lay.frame, lay.frame, lay.frame, 0, 0, lay.frame, lay.frame);
  return c;
}

export function openCustomWorn(store: EditorStore, d: ItemDef, done: () => void): void {
  const w = (d.worn ??= {});
  // Work on a copy; Save writes it back.
  const work: { masc?: CustomWornBody; femme?: CustomWornBody } = JSON.parse(JSON.stringify(w.customPics ?? {}));
  let body: Body = 'masc', view: WornView = 'front';
  const canvas = h('canvas', { class: 'cw-canvas', width: String(SIZE), height: String(SIZE) }) as HTMLCanvasElement;
  const side = h('div', { class: 'cw-side' });
  const tabs = h('div', { class: 'cw-tabs' });
  const bodies = h('div', { class: 'cw-tabs' });
  const cur = (): CustomWornPic | undefined => work[body]?.[view];

  const draw = async () => {
    const g = canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, SIZE, SIZE);
    // A faint tile grid, then the hero, then the picture.
    g.fillStyle = '#1a1e2a'; g.fillRect(0, 0, SIZE, SIZE);
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i <= 64; i += 8) { g.beginPath(); g.moveTo(i * K, 0); g.lineTo(i * K, SIZE); g.moveTo(0, i * K); g.lineTo(SIZE, i * K); g.stroke(); }
    const dir = view === 'front' ? 'down' : view === 'back' ? 'up' : 'left';
    const hero = heroFrame(store, dir);
    if (hero) g.drawImage(hero, 0, 0, hero.width, hero.height, 0, 0, SIZE, SIZE);
    else { g.fillStyle = '#8a8fa0'; g.font = '14px sans-serif'; g.fillText('No animated player look to preview on', 20, SIZE / 2); }
    const p = cur(), img = p ? await loadPic(store, p.src) : null;
    if (p && img) {
      const big = document.createElement('canvas'); big.width = big.height = 64;
      drawPic(big.getContext('2d')!, img, p, 0, 0, 64, 0, viewFor(dir).flip);
      g.drawImage(big, 0, 0, 64, 64, 0, 0, SIZE, SIZE);
    }
  };

  const setPic = (src: string) => {
    const b = (work[body] ??= {});
    const was = b[view];
    // A fresh picture sits in the middle of the body; a replaced one keeps its place and scale.
    b[view] = { src, x: was?.x ?? 32, y: was?.y ?? 36, scale: was?.scale ?? (src.startsWith('icon:') ? 1.5 : 0.5), ...(was?.rot ? { rot: was.rot } : {}) };
    render();
  };
  const pickPng = () => {
    const input = h('input', { type: 'file', accept: 'image/png' }) as HTMLInputElement;
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      const path = `assets/worn/${d.id}_${body}_${view}.png`;
      try {
        const c = await canvasFromBlob(f);
        if (store.project.canSave && store.project.canStoreImages) await store.project.writeFile(path, f);
        store.files.set(path, f);
        picCache.set(path, c);
        setPic(path);
      } catch (err) { toast(`Couldn’t use that picture: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
    });
    input.click();
  };

  const render = () => {
    tabs.replaceChildren(...WORN_VIEWS.map((v) => h('button', { type: 'button', class: `btn small${v === view ? ' primary' : ''}`, onclick: () => { view = v; render(); } }, `${WORN_VIEW_NAMES[v]}${work[body]?.[v] ? ' ●' : ''}`)));
    const other: Body = body === 'masc' ? 'femme' : 'masc';
    bodies.replaceChildren(
      ...(['masc', 'femme'] as Body[]).map((b) => h('button', { type: 'button', class: `btn small${b === body ? ' primary' : ''}`, onclick: () => { body = b; render(); } }, b === 'masc' ? 'Masc' : 'Femme')),
      work[other] && Object.keys(work[other]!).length ? h('button', { type: 'button', class: 'btn small ghost', title: `Start from the ${other} setup (replaces this one)`, onclick: () => { work[body] = JSON.parse(JSON.stringify(work[other])); render(); } }, `Duplicate from ${other === 'masc' ? 'masc' : 'femme'}`) : h('span'));
    const p = cur();
    const icons = h('select', { 'aria-label': 'Use an item icon', onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; if (v) setPic(`icon:${v}`); } },
      h('option', { value: '' }, 'Use an item icon…'),
      ...iconGroups().map(([grp, list]) => h('optgroup', { label: grp }, ...list.map((n) => h('option', { value: n, selected: p?.src === `icon:${n}` }, ITEM_ICONS[n]?.name ?? n)))));
    const scale = h('input', { type: 'range', min: '0.1', max: '4', step: '0.05', value: String(p?.scale ?? 1), disabled: !p, 'aria-label': 'Scale' }) as HTMLInputElement;
    scale.addEventListener('input', () => { const q = cur(); if (q) { q.scale = Number(scale.value); void draw(); } });
    const rot = h('input', { type: 'range', min: '-180', max: '180', step: '5', value: String(p?.rot ?? 0), disabled: !p, 'aria-label': 'Turn' }) as HTMLInputElement;
    rot.addEventListener('input', () => { const q = cur(); if (q) { const r = Number(rot.value); if (r) q.rot = r; else delete q.rot; void draw(); } });
    side.replaceChildren(
      h('div', { class: 'cw-row' }, h('b', {}, 'Body'), bodies),
      h('div', { class: 'cw-row' }, h('b', {}, 'View'), tabs),
      h('p', { class: 'note' }, view === 'side' ? 'Side: drawn as it faces (left); mirrored for the right.' : view === 'back' ? 'Back: shown walking away (up).' : 'Front: shown walking toward you (down).'),
      h('div', { class: 'cw-row' }, h('button', { type: 'button', class: 'btn small', onclick: pickPng }, p && !p.src.startsWith('icon:') ? 'Replace PNG…' : 'Choose a PNG…'), icons),
      p ? h('div', { class: 'cw-row' }, h('span', { class: 'note' }, 'Scale'), scale) : h('span'),
      p ? h('div', { class: 'cw-row' }, h('span', { class: 'note' }, 'Turn'), rot) : h('span'),
      p ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { const b = work[body]; if (b) { delete b[view]; if (!Object.keys(b).length) delete work[body]; } render(); } }, `Remove the ${WORN_VIEW_NAMES[view].toLowerCase()} picture`) : h('span'),
      h('p', { class: 'note' }, 'Drag the picture over the hero to place it; scroll over it to scale. In the game it’s drawn in every frame facing this way and bobs with the walk.'));
    void draw();
  };

  // Drag to move, wheel to scale.
  let drag: { x: number; y: number; px: number; py: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { const p = cur(); if (!p) return; drag = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const p = cur(); if (!drag || !p) return;
    const r = canvas.getBoundingClientRect(), k = (r.width / SIZE) * K;
    const flip = view === 'side' ? -1 : 1;
    p.x = Math.round((drag.px + ((e.clientX - drag.x) / k) * (flip > 0 ? 1 : 1)) * 2) / 2;
    p.y = Math.round((drag.py + (e.clientY - drag.y) / k) * 2) / 2;
    void draw();
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('wheel', (e) => { const p = cur(); if (!p) return; e.preventDefault(); p.scale = Math.max(0.1, Math.min(4, Math.round((p.scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08)) * 100) / 100)); render(); }, { passive: false });

  render();
  openModal(`Custom sprite: ${d.name}`, h('div', { class: 'cw-body' }, canvas, side), [
    { label: 'Cancel' },
    { label: 'Save', primary: true, onClick: () => {
      const clean = Object.fromEntries(Object.entries(work).filter(([, b]) => b && Object.keys(b).length));
      if (Object.keys(clean).length) { w.customPics = clean; w.custom = true; } else delete w.customPics;
      done();
    } },
  ], undefined, { wide: true });
}
