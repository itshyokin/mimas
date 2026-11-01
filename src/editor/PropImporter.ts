/**
 * "Import prop" dialog. Load an image (plus an optional normal map and night-glow mask),
 * frame it on a grid of X × Y tiles like cropping a profile picture, mark which tiles block
 * movement, optionally give it a light, and save. The saved image is exactly the framed area.
 */
import { pickFromSheet } from './SheetPicker';
import { propSeason } from '../world/seasons';
import { monthDayInput } from './dateFields';
import { canvasFromBlob, canvasFromImage, loadImage } from '../shared/images';
import { isBuiltinProp, propIdFromName } from '../world/props';
import type { PropDef, PropLight } from '../world/types';
import { type PropImages, commitProp } from './assets';
import { checkbox, field, h, numberInput, openModal, select, textInput, toast } from './dom';
import { builtinArt, customPropImage } from './editorArt';
import { flameStrip } from '../art/placeholderArt';
import { lightFields } from './lightForm';
import { walkSoundField } from './CommandEditor';
import type { EditorStore } from './store';
import type * as THREE from 'three';
import { type ModelExt, bakeModel, modelExt, modelSize, modelThumbnail, parseModel } from '../render/models';

type Res = 'keep' | '16' | '24' | '32' | '48' | '64';
interface Src { canvas: HTMLCanvasElement; name: string }

const MAX_TILES = 16;
const MAX_OUTPUT = 4096;

/** A footprint tile's mark, as saved: '#' X blocks, '.' O walkable, '*' ★ walkable behind the prop. */
type Mark = '#' | '.' | '*';
const MARKS: Record<Mark, { sym: string; name: string }> = { '#': { sym: 'X', name: 'blocks (X)' }, '.': { sym: 'O', name: 'walkable (O)' }, '*': { sym: '★', name: 'walk behind it (★)' } };
const NEXT: Record<Mark, Mark> = { '#': '.', '.': '*', '*': '#' };
const toMark = (c: string | undefined): Mark => (c === '#' || c === 'X' ? '#' : c === '*' ? '*' : '.');

interface State {
  /** A 3D model drawn instead of the picture (the picture is then its rendered icon), and how it's turned. */
  model?: { obj: THREE.Object3D; name: string; blob: Blob; ext: ModelExt; fresh: boolean };
  modelRot: number;
  name: string;
  w: number; h: number;
  /** Source pixels per tile, and the source pixel at the frame's top-left corner. */
  scale: number; ox: number; oy: number;
  image?: Src; normal?: Src; glow?: Src;
  flipGreen: boolean;
  glowColor: string;
  filter: 'point' | 'smooth';
  res: Res;
  castShadow: boolean;
  respawn: boolean;
  cuttable: boolean;
  /** Seasons: '' guessed from the name, or leaves / bare / off. */
  season: '' | 'leaves' | 'bare' | 'off';
  /** Only on some days of the year ("MM-DD"; `to` for a range). */
  dates: { from: string; to?: string } | null;
  mineable: boolean;
  hits: number;
  forge: boolean;
  regrows: boolean;
  stump: string;
  drops: { item: string; count: number; chance?: number }[];
  /** Fires: game hours one burns (0: forever). */
  burns: number;
  burntOut: string;
  startsOut: boolean;
  /** Sways in the wind (0: stiff; 1 a tree, more for grass). */
  sway: number;
  /** Sits flat against the wall behind it. */
  wall: boolean;
  stretch: boolean;
  rustle: '' | 'yes' | 'no';
  front: boolean;
  /** Flat mode: painted flat on the ground (Update 139). */
  ground: boolean;
  /** The layer new copies are painted on (Update 144). */
  layer: number;
  /** Walked on (a bridge or platform): '' no; the way it runs. */
  deck: '' | 'h' | 'v' | 'any';
  /** How a bridge or platform is drawn: its own picture, or built 3D pieces. */
  deckLook: 'art' | 'artStand' | 'wood' | 'rope' | 'stone';
  /** Leans back toward the map camera like other props (off: stays upright). */
  tilt: boolean;
  walkSound?: string;
  /** Footprint: tiles deep, and which are solid (rows from the back row to the front, columns left to right). */
  d: number;
  solid: Mark[][];
  shape: NonNullable<PropDef['shape']>;
  /** Solid shape: how far back it reaches (tiles; 0 = the footprint's depth). */
  thickness: number;
  collide: 'solid' | 'flat';
  lightOn: boolean;
  light: PropLight;
  /** An animated flame drawn on it (torches, campfires): bottom-centre position and size in tiles, from the ground marker. */
  flameOn: boolean;
  flame: { x: number; y: number; w: number; h: number; embers?: boolean };
  tool: 'move' | 'light' | 'flame';
}

const defaultLight = (h: number): PropLight => ({ x: 0, y: Math.round(h * 0.8 * 10) / 10, color: '#ffc86b', intensity: 2.2, radius: 7, schedule: 'night', flicker: 'none' });

/** Opens the importer. Pass an imported prop's definition to edit it instead. */
export async function openPropImporter(store: EditorStore, existing?: PropDef, opts: { model?: boolean } = {}): Promise<void> {
  const st: State = {
    modelRot: existing?.modelRot ?? 0,
    name: existing?.name ?? '', w: existing?.w ?? 1, h: existing?.h ?? 2, scale: 32, ox: 0, oy: 0,
    flipGreen: false, glowColor: existing?.glowColor ?? '#ffc86b', filter: existing?.filter ?? 'point', res: 'keep',
    castShadow: existing?.castShadow !== false,
    respawn: !!existing?.respawn,
    cuttable: !!existing?.cuttable,
    season: existing?.season ?? '',
    dates: existing?.dates ? { ...existing.dates } : null,
    mineable: !!existing?.mineable,
    hits: existing?.hits ?? 3,
    forge: !!existing?.forge,
    regrows: !!existing?.regrows,
    stump: existing?.stump ?? '',
    drops: (existing?.drops ?? []).map((d) => ({ ...d })),
    burns: existing?.burns ?? 0,
    burntOut: existing?.burntOut ?? '',
    startsOut: !!existing?.startsOut,
    sway: existing?.sway ?? 0,
    wall: !!existing?.wall,
    stretch: !!existing?.stretch,
    rustle: existing?.rustle === undefined ? '' : existing.rustle ? 'yes' : 'no',
    front: existing?.frontOfTiles !== false,
    ground: !!existing?.ground,
    layer: existing?.layer ?? 25,
    deck: existing?.deck ? existing.deck.dir ?? 'any' : '',
    deckLook: existing?.deck ? (existing.deck.art ? (existing.deck.stand ? 'artStand' : 'art') : existing.deck.style) : 'art',
    tilt: !existing?.noTilt,
    walkSound: existing?.walkSound,
    d: existing?.foot?.d ?? 1, solid: [],
    shape: existing?.shape ?? 'flat', thickness: existing?.thickness ?? 0, collide: existing?.collide ?? 'solid',
    flameOn: !!existing?.flame, flame: existing?.flame ? { ...existing.flame } : { x: 0, y: Math.round((existing?.h ?? 2) * 0.75 * 10) / 10, w: 0.5, h: 0.75, embers: true },
    lightOn: !!existing?.light, light: existing?.light ? { ...existing.light } : defaultLight(existing?.h ?? 2), tool: 'move',
  };
  st.solid = [Array.from({ length: Math.round(st.w) }, (): Mark => '#')];
  /**
   * The collision grid is Width × Height (Update 135): a 2 × 3 pine gets 2 × 3 blocks to mark, its rows from the top
   * of the picture (the back) to its base (the front). Only 3D models set a Depth of their own. Rows added to a prop
   * that had fewer start as ★ (walk behind), so it keeps working as before until they're marked.
   */
  const addFill: Mark = existing ? '*' : '#';


  if (existing) {
    // Imported (or already customised) props edit their saved image; untouched built-ins start from their art.
    const img = existing.image ? customPropImage(existing.id) : builtinArt(existing);
    if (!img) { toast('This prop’s image isn’t loaded, so it can’t be edited.', 'error'); return; }
    st.image = { canvas: img, name: existing.image?.split('/').pop() ?? `${existing.id} (built-in art)` };
    st.scale = img.width / existing.w;
    const fromFile = async (path?: string) => {
      const b = path ? store.files.get(path) : undefined;
      return b ? { canvas: await canvasFromBlob(b), name: path!.split('/').pop()! } : undefined;
    };
    st.normal = await fromFile(existing.normal);
    if (existing.model) {
      const b = store.files.get(existing.model), ext = modelExt(existing.model);
      if (b && ext) {
        try { st.model = { obj: await parseModel(await b.arrayBuffer(), ext), name: existing.model.split('/').pop()!, blob: b, ext, fresh: false }; }
        catch { toast('This prop’s 3D model couldn’t be read; saving keeps the file as it is.', 'error'); }
      }
    }
    st.glow = await fromFile(existing.glow);
    const cols = Math.max(1, Math.round(existing.w));
    if (existing.foot) {
      st.solid = Array.from({ length: existing.foot.d }, (_, r) => Array.from({ length: existing.foot!.w }, (_, c) => toMark(existing.foot!.solid[r]?.[c])));
    } else {
      // Older props: one row; each blocking offset goes to the nearest column (built-ins can be a fractional number of tiles wide).
      st.solid = [Array.from({ length: cols }, (): Mark => '.')];
      for (const o of existing.block) st.solid[0][Math.max(0, Math.min(cols - 1, Math.floor(o + cols / 2)))] = '#';
    }
    // The tile grid needs whole tiles: the frame grows to the next whole tile, the picture keeps its size and stays
    // standing on the bottom edge, centred (so a flame or light set on it stays in place).
    const nw = Math.max(1, Math.round(existing.w)), nh = Math.max(1, Math.ceil(existing.h - 0.01));
    st.ox = (img.width - nw * st.scale) / 2;
    st.oy = img.height - nh * st.scale;
    st.w = nw; st.h = nh;
    // Update 135: as many rows as the picture is tall (new rows at the back start as ★, walk behind).
    if (!st.model && st.solid.length < nh) st.solid = [...Array.from({ length: nh - st.solid.length }, () => Array.from({ length: nw }, (): Mark => '*')), ...st.solid];
    if (!st.model) st.solid = st.solid.slice(-nh).map((row) => Array.from({ length: nw }, (_, c): Mark => row[c] ?? '#'));
    st.d = st.model ? st.d : nh;
  }

  /* ---------------------------------------------------------------- cropper */
  const canvas = h('canvas', { class: 'crop-canvas', tabindex: '0', 'aria-label': 'Image framing. Drag to move the image, scroll to zoom.' });
  const ctx = canvas.getContext('2d')!;
  const zoom = h('input', { type: 'range', min: '0', max: '1000', step: '1', 'aria-label': 'Zoom', class: 'crop-zoom' });
  const footGrid = h('div', { class: 'foot-wrap' });
  const toolSeg = h('div', { class: 'seg small', role: 'group', 'aria-label': 'Drag action' });
  const empty = h('div', { class: 'crop-empty' }, h('p', {}, 'Choose an image to start, or drop one here.'), h('p', { class: 'hint' }, 'PNG with a transparent background works best.'));
  const cropWrap = h('div', { class: 'crop-wrap' }, canvas, empty);

  let frame = { x: 0, y: 0, cell: 32 };
  const minScale = () => 0.25;
  const maxScale = () => (st.image ? Math.max(st.image.canvas.width, st.image.canvas.height) * 1.5 : 512);
  const toSlider = (s: number) => Math.round((Math.log(s / minScale()) / Math.log(maxScale() / minScale())) * 1000);
  const fromSlider = (v: number) => minScale() * Math.pow(maxScale() / minScale(), v / 1000);

  function layout(): void {
    const r = cropWrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const cw = r.width, ch = r.height;
    const cell = Math.max(8, Math.min((cw - 48) / st.w, (ch - 48) / st.h, 128));
    frame = { cell, x: (cw - cell * st.w) / 2, y: (ch - cell * st.h) / 2 };
    draw();
  }

  function draw(): void {
    const dpr = window.devicePixelRatio || 1, cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Chequerboard shows transparency.
    for (let y = 0; y < ch; y += 12) for (let x = 0; x < cw; x += 12) {
      ctx.fillStyle = ((x + y) / 12) % 2 ? '#1a1f2e' : '#141826';
      ctx.fillRect(x, y, 12, 12);
    }
    empty.hidden = !!st.image;
    if (!st.image) return;
    const k = frame.cell / st.scale;
    ctx.imageSmoothingEnabled = st.filter === 'smooth' || k < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(st.image.canvas, frame.x - st.ox * k, frame.y - st.oy * k, st.image.canvas.width * k, st.image.canvas.height * k);
    const fw = frame.cell * st.w, fh = frame.cell * st.h;
    // Dim everything outside the frame.
    ctx.fillStyle = 'rgba(8,10,16,0.66)';
    ctx.fillRect(0, 0, cw, frame.y);
    ctx.fillRect(0, frame.y + fh, cw, ch - frame.y - fh);
    ctx.fillRect(0, frame.y, frame.x, fh);
    ctx.fillRect(frame.x + fw, frame.y, cw - frame.x - fw, fh);
    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < st.w; i++) { ctx.moveTo(Math.round(frame.x + i * frame.cell) + 0.5, frame.y); ctx.lineTo(Math.round(frame.x + i * frame.cell) + 0.5, frame.y + fh); }
    for (let j = 1; j < st.h; j++) { ctx.moveTo(frame.x, Math.round(frame.y + j * frame.cell) + 0.5); ctx.lineTo(frame.x + fw, Math.round(frame.y + j * frame.cell) + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = '#ffb04a';
    ctx.lineWidth = 2;
    ctx.strokeRect(frame.x, frame.y, fw, fh);
    // Anchor: where the prop touches the ground.
    const ax = frame.x + fw / 2, ay = frame.y + fh;
    ctx.fillStyle = '#7fd3ff';
    ctx.beginPath(); ctx.moveTo(ax, ay - 1); ctx.lineTo(ax - 6, ay + 9); ctx.lineTo(ax + 6, ay + 9); ctx.closePath(); ctx.fill();
    // The flame: its first frame, where it burns.
    if (st.flameOn) {
      const f = st.flame, fl = ax + (f.x - f.w / 2) * frame.cell, ft = ay - (f.y + f.h) * frame.cell;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(flameArt(), 0, 0, 12, 18, fl, ft, f.w * frame.cell, f.h * frame.cell);
      if (st.tool === 'flame') { ctx.strokeStyle = '#ffb04a'; ctx.setLineDash([4, 3]); ctx.strokeRect(fl, ft, f.w * frame.cell, f.h * frame.cell); ctx.setLineDash([]); }
    }
    // Light position
    if (st.lightOn) {
      const lx = ax + st.light.x * frame.cell, ly = ay - st.light.y * frame.cell;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, frame.cell * 1.2);
      g.addColorStop(0, hexA(st.light.color, 0.55));
      g.addColorStop(1, hexA(st.light.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(lx - frame.cell * 1.2, ly - frame.cell * 1.2, frame.cell * 2.4, frame.cell * 2.4);
      ctx.fillStyle = '#0c0f18'; ctx.beginPath(); ctx.arc(lx, ly, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = st.light.color; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill();
    }
    zoom.value = String(toSlider(st.scale));
    updateFoot();
  }

  function zoomAround(newScale: number, sx: number, sy: number): void {
    if (!st.image) return;
    newScale = Math.max(minScale(), Math.min(maxScale(), newScale));
    const k = frame.cell / st.scale, k2 = frame.cell / newScale;
    const srcX = st.ox + (sx - frame.x) / k, srcY = st.oy + (sy - frame.y) / k;
    st.ox = srcX - (sx - frame.x) / k2;
    st.oy = srcY - (sy - frame.y) / k2;
    st.scale = newScale;
    draw();
  }

  /** Frame the visible content (transparent margins trimmed): "contain" fits it inside, "cover" fills the frame. */
  function fit(mode: 'contain' | 'cover'): void {
    if (!st.image) return;
    const b = contentBounds(st.image.canvas);
    const sx = b.w / st.w, sy = b.h / st.h;
    st.scale = Math.max(minScale(), mode === 'contain' ? Math.max(sx, sy) : Math.min(sx, sy));
    // Centred horizontally, standing on the bottom edge.
    st.ox = b.x + b.w / 2 - (st.w * st.scale) / 2;
    st.oy = b.y + b.h - st.h * st.scale;
    draw();
  }

  let drag: { x: number; y: number; ox: number; oy: number } | null = null;
  const local = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const setLightAt = (p: { x: number; y: number }) => {
    st.light.x = round1((p.x - (frame.x + (frame.cell * st.w) / 2)) / frame.cell);
    st.light.y = round1(Math.max(0, (frame.y + frame.cell * st.h - p.y) / frame.cell));
    if (lightX) lightX.value = String(st.light.x);
    if (lightY) lightY.value = String(st.light.y);
    draw();
  };
  const setFlameAt = (p: { x: number; y: number }) => {
    // The click is where the flame's base sits.
    st.flame.x = round1((p.x - (frame.x + (frame.cell * st.w) / 2)) / frame.cell);
    st.flame.y = round1(Math.max(0, (frame.y + frame.cell * st.h - p.y) / frame.cell));
    if (flameX) flameX.value = String(st.flame.x);
    if (flameY) flameY.value = String(st.flame.y);
    draw();
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (!st.image) { fileInputs.image.click(); return; }
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    if (st.lightOn && st.tool === 'light') { setLightAt(p); drag = null; return; }
    if (st.flameOn && st.tool === 'flame') { setFlameAt(p); drag = null; return; }
    drag = { x: p.x, y: p.y, ox: st.ox, oy: st.oy };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!canvas.hasPointerCapture(e.pointerId)) return;
    const p = local(e);
    if (st.lightOn && st.tool === 'light') { setLightAt(p); return; }
    if (st.flameOn && st.tool === 'flame') { setFlameAt(p); return; }
    if (!drag) return;
    const k = frame.cell / st.scale;
    st.ox = drag.ox - (p.x - drag.x) / k;
    st.oy = drag.oy - (p.y - drag.y) / k;
    draw();
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e as unknown as PointerEvent); zoomAround(st.scale * Math.exp(e.deltaY * 0.0015), p.x, p.y); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 1, k = frame.cell / st.scale;
    const d: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const v = d[e.key];
    if (!v || !st.image) return;
    e.preventDefault();
    st.ox += v[0] / k; st.oy += v[1] / k;
    draw();
  });
  zoom.addEventListener('input', () => zoomAround(fromSlider(parseFloat(zoom.value)), frame.x + (frame.cell * st.w) / 2, frame.y + frame.cell * st.h));

  let flameCanvas: HTMLCanvasElement | null = null;
  const flameArt = () => (flameCanvas ??= flameStrip());

  /* ---------------------------------------------------------------- files */
  const modelInput = h('input', { type: 'file', accept: '.glb,.fbx', hidden: true });
  modelInput.addEventListener('change', () => { const f = modelInput.files?.[0]; if (f) void loadModelFile(f); modelInput.value = ''; });
  async function loadModelFile(file: File): Promise<void> {
    const ext = modelExt(file.name);
    if (!ext) { toast('Choose a .glb or .fbx model (a .gltf with separate files: export it as .glb).', 'error'); return; }
    try {
      const obj = await parseModel(await file.arrayBuffer(), ext);
      st.model = { obj, name: file.name, blob: file, ext, fresh: true };
      if (!st.name) st.name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      // Its footprint from its size: models in metres (most) are a tile per metre; very big or tiny ones about 2 tiles.
      const sz = modelSize(obj, st.modelRot), long = Math.max(sz.x, sz.z);
      const k = long >= 0.3 && long <= 12 ? 1 : 2 / Math.max(1e-6, long);
      st.w = clampTiles(sz.x * k); st.d = 0;
      setDepth(clampTiles(sz.z * k));
      if (st.filter === 'point' && !existing) st.filter = 'smooth';
      remodel();
    } catch (e) {
      toast(`Couldn’t read ${file.name}: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }
  /** Fit the model to the footprint again and show its icon in the frame (its height follows from its shape). */
  function remodel(): void {
    if (!st.model) return;
    try {
      const baked = bakeModel(st.model.obj, { w: st.w, d: st.d, rot: st.modelRot, sharp: st.filter === 'point' });
      const PPT = 48, pic = modelThumbnail(baked, st.w, PPT);
      st.image = { canvas: pic, name: `${st.model.name} (rendered)` };
      st.h = clampTiles(Math.ceil(pic.height / PPT - 0.05));
      st.scale = PPT; st.ox = 0; st.oy = pic.height - st.h * PPT;
      layout();
      renderForm();
      draw();
    } catch (e) {
      toast(`Couldn’t fit the model: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }
  const fileInputs = {
    image: h('input', { type: 'file', accept: 'image/*', hidden: true }),
    normal: h('input', { type: 'file', accept: 'image/*', hidden: true }),
    glow: h('input', { type: 'file', accept: 'image/*', hidden: true }),
  };
  async function loadFile(slot: 'image' | 'normal' | 'glow', file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    try {
      const canvasImg = canvasFromImage(await loadImage(url));
      st[slot] = { canvas: canvasImg, name: file.name };
      if (slot === 'image') {
        if (!st.name) st.name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        if (!existing) guessSize(canvasImg);
        layout();
        fit('contain');
      }
      renderForm();
      draw();
    } catch {
      toast(`Couldn’t read ${file.name} as an image.`, 'error');
    } finally { URL.revokeObjectURL(url); }
  }
  for (const slot of ['image', 'normal', 'glow'] as const) {
    fileInputs[slot].addEventListener('change', () => { const f = fileInputs[slot].files?.[0]; if (f) void loadFile(slot, f); fileInputs[slot].value = ''; });
  }
  cropWrap.addEventListener('dragover', (e) => { e.preventDefault(); cropWrap.classList.add('drop'); });
  cropWrap.addEventListener('dragleave', () => cropWrap.classList.remove('drop'));
  cropWrap.addEventListener('drop', (e) => {
    e.preventDefault();
    cropWrap.classList.remove('drop');
    const f = e.dataTransfer?.files?.[0];
    if (f) void loadFile('image', f);
  });

  function guessSize(img: HTMLCanvasElement): void {
    const b = contentBounds(img);
    let w: number, hh: number;
    // Pixel art up to 6 tiles big: 32 px per tile, the scale of the LPC characters (tiny images: the old 16 px).
    if (b.w <= 40 && b.h <= 40) { w = Math.ceil(b.w / 16); hh = Math.ceil(b.h / 16); }
    else if (b.w <= 192 && b.h <= 192) { w = Math.ceil(b.w / 32); hh = Math.ceil(b.h / 32); }
    else { const k = Math.max(b.w, b.h) / 3; w = Math.round(b.w / k); hh = Math.round(b.h / k); } // larger art: about 3 tiles on its longest side
    setSize(clampTiles(w), clampTiles(hh));
  }

  function setSize(w: number, hh: number): void {
    // The picture stays standing on the ground marker: the frame grows upwards and to both sides.
    if (st.image) { st.ox -= ((w - st.w) * st.scale) / 2; st.oy -= (hh - st.h) * st.scale; }
    st.w = w; st.h = hh;
    setDepth(st.model ? st.d : Math.max(1, Math.round(hh)));
    layout();
    if (st.model) remodel();
  }

  /** Resize the footprint (new tiles start X: blocking). */
  function setDepth(d: number): void {
    const old = st.solid, was = st.d;
    st.d = d;
    // Rows are kept from the front: the front row stays the front row.
    st.solid = Array.from({ length: d }, (_, r) => Array.from({ length: st.w }, (_, c): Mark => old[old.length - d + r]?.[c] ?? (r < d - old.length ? addFill : '#')));
    renderTools();
    if (st.model && was !== d) remodel();
  }

  /* ---------------------------------------------------------------- form */
  const form = h('div', { class: 'importer-form' });
  // Tiles from a tileset sheet (Update 149): picked on the sheet's grid, framed exactly (one sheet tile, one map tile).
  const sheetInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  sheetInput.addEventListener('change', () => {
    const file = sheetInput.files?.[0];
    sheetInput.value = '';
    if (!file) return;
    void (async () => {
      const url = URL.createObjectURL(file);
      let sheet: HTMLCanvasElement;
      try { sheet = canvasFromImage(await loadImage(url)); } catch { toast(`Couldn’t read ${file.name} as an image.`, 'error'); return; } finally { URL.revokeObjectURL(url); }
      const pick = await pickFromSheet(sheet, file.name);
      if (!pick) return;
      st.image = { canvas: pick.canvas, name: `${file.name} (${pick.w} × ${pick.h} tiles)` };
      if (!st.name) st.name = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      setSize(clampTiles(pick.w), clampTiles(pick.h));
      st.scale = pick.tilePx; st.ox = 0; st.oy = 0;
      renderForm();
      draw();
    })();
  });
  form.append(sheetInput);
  let lightX: HTMLInputElement | null = null, lightY: HTMLInputElement | null = null;
  let flameX: HTMLInputElement | null = null, flameY: HTMLInputElement | null = null;
  const slotRow = (slot: 'image' | 'normal' | 'glow', label: string, hint: string) => {
    const src = st[slot];
    return h('div', { class: 'slot' },
      h('div', { class: 'slot-head' }, h('span', { class: 'slot-label' }, label), src ? h('span', { class: 'slot-file', title: src.name }, src.name) : h('span', { class: 'slot-none' }, slot === 'image' ? 'Required' : 'Optional')),
      h('div', { class: 'slot-actions' },
        h('button', { type: 'button', class: 'btn small', onclick: () => fileInputs[slot].click() }, src ? 'Replace…' : 'Choose…'),
        src && slot !== 'image' ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { st[slot] = undefined; renderForm(); } }, 'Remove') : null),
      h('p', { class: 'hint' }, hint));
  };

  /** The form's tabs, so it fits the window: what it looks like, how it behaves, its light, and its extra maps. */
  let formTab: 'look' | 'behaviour' | 'light' | 'maps' = 'look';

  function renderForm(): void {
    const parts: Node[] = [
      field('Name', textInput(st.name, (v) => (st.name = v.trim()), { placeholder: 'e.g. Lamp post', oninput: (e: Event) => (st.name = (e.target as HTMLInputElement).value.trim()) })),
      st.model ? h('div', { class: 'slot' },
        h('div', { class: 'slot-head' }, h('span', { class: 'slot-label' }, '3D model'), h('span', { class: 'slot-file', title: st.model.name }, st.model.name)),
        h('div', { class: 'slot-actions' },
          h('button', { type: 'button', class: 'btn small', onclick: () => modelInput.click() }, 'Replace…'),
          h('button', { type: 'button', class: 'btn small ghost', onclick: () => { st.model = undefined; renderForm(); toast('Now a flat picture (its rendered icon). Choose an image to replace it.'); } }, 'Use a picture instead')),
        field('Faces', select([['0', 'As modelled (front toward the camera)'], ['90', 'Turned right 90°'], ['180', 'Turned round'], ['270', 'Turned left 90°']], String(st.modelRot), (v) => { st.modelRot = Number(v); remodel(); })),
        h('p', { class: 'hint' }, 'Drawn in 3D, fitted evenly into its footprint (Width × Depth); its height follows from its shape. The picture is its icon in the palette.'))
        : slotRow('image', 'Image', 'The sprite itself. Transparent background recommended.'),
      st.model ? h('span') : h('div', { class: 'toolrow small' },
        // Update 149: a box of tiles from a tileset sheet (RPG Maker B–E sheets) as the picture.
        h('button', { type: 'button', class: 'btn small', onclick: () => sheetInput.click() }, 'From a tileset sheet…'),
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => modelInput.click() }, 'Use a 3D model instead (.glb, .fbx)…')),
    ];
    if (existing && isBuiltinProp(existing.id)) {
      parts.unshift(h('p', { class: 'note' }, 'Saving makes a customised copy of this built-in prop, used everywhere it’s placed. “Reset to original” in the Props palette brings the built-in back.'));
    }
    if (st.image && !st.model && !hasTransparency(st.image.canvas)) parts.push(h('p', { class: 'warn' }, 'This image has no transparent pixels, so the whole rectangle will show in the game.'));
    parts.push(
      h('div', { class: 'section-label' }, 'Size on the map'),
      h('div', { class: 'field-row three' },
        field('Width (tiles)', numberInput(st.w, (v) => { setSize(clampTiles(v), st.h); renderForm(); }, { min: 1, max: MAX_TILES, step: 1 })),
        st.model ? field('Depth (tiles)', numberInput(st.d, (v) => { setDepth(clampTiles(v)); renderForm(); draw(); }, { min: 1, max: MAX_TILES, step: 1 })) : h('span'),
        field('Height (tiles)', numberInput(st.h, (v) => { setSize(st.w, clampTiles(v)); renderForm(); }, { min: 1, max: MAX_TILES, step: 1 }))),
      h('p', { class: 'hint' }, (st.model ? 'Width and depth: the tiles it covers on the ground (its footprint, each tile marked X, O or ★ in the grid under the picture).' : 'Width and height: the picture’s size, and its collision grid under the picture (Width × Height tiles, each marked X, O or ★).') + ' Height: how tall the picture stands. Placed on the map, it covers whole tiles, its picture rising from the footprint’s front edge: a 1 × 1 × 1 block fills its tile exactly.'),
      h('div', { class: 'section-label' }, 'Shape and collision'),
      h('div', { class: 'field-row' },
        st.model ? field('Shape', h('span', { class: 'hint' }, '3D model')) : field('Shape', select([['flat', 'Flat (one picture)'], ['solid', 'Solid block (pushed back)'], ['crossX', 'Cross × (two at 45°)'], ['crossPlus', 'Cross + (one side-on)'], ['crossStar', 'Star ✳ (cross × plus one facing front)'], ['rows', 'Rows ≡ (three staggered rows)'], ['thicket', 'Thicket (rows of crossing pairs)']], st.shape,
          (v) => { st.shape = v as State['shape']; renderForm(); })),
        field('Collision', select([['solid', 'Solid: its X tiles block'], ['flat', 'Flat: only along the picture']], st.collide,
          (v) => { st.collide = v as 'solid' | 'flat'; renderTools(); renderForm(); }))),
      ...(st.shape === 'solid' ? [field('Thickness (tiles)', numberInput(st.thickness || st.d, (v) => (st.thickness = Math.max(0.05, Math.round(v * 20) / 20)), { min: 0.05, max: MAX_TILES, step: 0.05 }),
        'How far back the block reaches. The footprint’s depth fills its tiles; less makes a slab (a sign, a fence).')] : []),
      h('p', { class: 'hint' }, ({
        flat: 'Flat: the picture alone, as before.',
        solid: 'Solid block: the outline is pushed back, its top and sides taking the edge pixels, so it looks solid from the game’s camera (crates, rocks, statues, pillars).',
        crossX: 'Cross ×: two copies crossing at 45°, so it looks full from every side (bushes, trees, tall grass).',
        crossPlus: 'Cross +: the picture plus a copy side-on through the middle of its footprint (fuller shadows).',
        crossStar: 'Star ✳: Cross × plus a third copy facing the camera through the middle, so it is full from the front too (tall grass, ferns).',
        rows: 'Rows ≡: three copies one behind another across the footprint, each a little offset, sized and mirrored: a thick, layered clump (tall grass, reeds, crops).',
        thicket: 'Thicket: three rows of copies crossing in a shallow V: layered from the front and still full from the side (tall grass, brush).',
      } as Record<string, string>)[st.shape] + (st.collide === 'flat' ? ' Flat collision: only a thin strip along the picture blocks (the front row’s X tiles), so the player can walk up behind it.' : ' Solid collision: the footprint’s X tiles block.')),
      h('div', { class: 'field-row' },
        field('Resolution', select([['keep', 'Keep image detail'], ['16', '16 px per tile'], ['24', '24 px per tile'], ['32', '32 px per tile'], ['48', '48 px per tile'], ['64', '64 px per tile']], st.res, (v) => { st.res = v as Res; updateFoot(); })),
        field('Filtering', select([['point', 'Point (crisp pixels)'], ['smooth', 'Smooth']], st.filter, (v) => { st.filter = v as 'point' | 'smooth'; draw(); }))),
      h('p', { class: 'hint' }, 'Characters are drawn at 32 px per tile: draw props at that scale and keep Point filtering for crisp pixels. (The built-in placeholder art is 16 px per tile.)'),
    );
    const look = parts.splice(0);
    parts.push(
      checkbox('Casts a shadow', st.castShadow, (v) => (st.castShadow = v)),
      field('Sways in the wind', select([['0', 'No (stiff: rocks, signs, buildings)'], ['0.5', 'A little (bushes, vines)'], ['0.8', 'Some (pines, tall trees)'], ['1', 'Like a tree'], ['1.3', 'A lot (grass, flowers, saplings)']],
        String([0, 0.5, 0.8, 1, 1.3].reduce((a, b) => (Math.abs(b - st.sway) < Math.abs(a - st.sway) ? b : a))), (v) => (st.sway = Number(v))),
        'The top moves with the breeze and the base stays put. A map’s wind is set in its settings; storms sway harder.'),
      field('Seasons', select([['', `Guess from its name (now: ${{ leaves: 'keeps its leaves', bare: 'bare in winter', off: 'doesn’t change' }[propSeason({ name: st.name, id: existing?.id })]})`],
        ['leaves', 'Leaves change colour; keeps them in winter, with snow on (pines, flowers)'], ['bare', 'Leaves change colour; bare in winter (oaks, bushes)'], ['off', 'Doesn’t change with the seasons']],
        st.season, (v) => (st.season = v as State['season'])), 'Green parts follow the season outdoors: fresh in spring, green-gold in summer, orange and red in autumn.'),
      (() => {
        // Only on some days (Halloween pumpkins): the real date, any year.
        const d = st.dates ?? { from: '10-31' };
        const from = monthDayInput(d.from, (v) => { d.from = v; }, 'From'), to = monthDayInput(d.to ?? d.from, (v) => { d.to = v; }, 'To');
        const rows = h('div', { class: 'field-row' }, h('label', {}, 'From ', from), h('label', {}, ' to ', to));
        rows.hidden = !st.dates;
        return h('div', {},
          checkbox('Only on some days of the year (a holiday: placed ones show only then)', !!st.dates, (on) => { st.dates = on ? d : null; rows.hidden = !on; }),
          rows,
          h('p', { class: 'note' }, 'The player’s own date, any year: Oct 31 to Oct 31 for Halloween only, Oct 24 to Oct 31 for the week before. To use the same picture all year somewhere else too, Duplicate the prop and give only the copy dates.'));
      })(),
      field('Layer new copies are painted on (0 on top … 25 the ground; lower draws over higher where props overlap)', numberInput(st.layer, (v) => (st.layer = Math.max(0, Math.min(25, Math.round(v)))), { step: 1, min: 0, max: 25 })),
      checkbox('Lie flat on the ground (Flat mode: painted onto the ground like a 2D game, for bedrolls, rugs and puddles; NOT for trees or anything standing up: characters walk over it)', st.ground, (v) => (st.ground = v)),
      checkbox('Sits flat against the wall behind it (cave mouths, doors, windows, banners)', st.wall, (v) => { st.wall = v; renderTools(); }),
      checkbox('Stretches to the height of the wall it’s placed against (ladders, hanging vines)', st.stretch, (v) => (st.stretch = v)),
      checkbox('Always drawn in front of tiles (a ledge or cliff in front never hides it; turn off for tall platforms or bridges whose legs show through the ground)', st.front, (v) => (st.front = v)),
      field('Walk on top (bridge or platform)', select([['', 'No'], ['h', 'Bridge running east–west (left–right)'], ['v', 'Bridge running north–south (up–down)'], ['any', 'Platform or dock (walk any way)']],
        st.deck, (v) => { st.deck = v as State['deck']; renderForm(); }),
        'Walked on at a deck height over water, chasms or lower ground, never blocking. A row of pieces shares one height (the highest bank they touch). Bridges keep walkers on them: along the bridge only, getting on and off at the ends.'),
      ...(st.deck ? [field('Drawn as', select([['art', 'Its picture, lying flat on the deck (seen from above)'], ['artStand', 'Its picture, standing up at the deck’s height'], ['wood', 'Built in 3D: wooden planks'], ['rope', 'Built in 3D: rope bridge'], ['stone', 'Built in 3D: stone']],
        st.deckLook, (v) => (st.deckLook = v as State['deckLook'])), 'Lying flat, the picture covers the footprint like a floor at the height of the banks it joins (top of the picture to the north). Built in 3D pieces have rails and posts down to the ground, like the built-in bridges (the picture is then only the palette icon).')] : []),
      walkSoundField(st.walkSound, (v) => (st.walkSound = v)),
      checkbox('Camera tilt: leans back toward the map camera like the characters (turn off to keep it upright)', st.tilt, (v) => (st.tilt = v)),
      field('Rustles when walked through', select([['', 'Tall grass shapes that don’t block'], ['yes', 'Yes (shakes and swishes)'], ['no', 'No']], st.rustle, (v) => (st.rustle = v as State['rustle']))),
      checkbox('Is respawn point (using it, the player comes back here after losing all health)', st.respawn, (v) => (st.respawn = v)),
      checkbox('Is a forge (an anvil): smelt ore, upgrade weapons and armor, set shards in them', st.forge, (v) => (st.forge = v)),
      field('Can be broken', select([['', 'No'], ['cut', 'Cut down by a weapon (vines, saplings); fire burns it away'], ['mine', 'Mined with a pickaxe or hammer (boulders, ore veins)']],
        st.mineable ? 'mine' : st.cuttable ? 'cut' : '', (v) => { st.cuttable = v === 'cut'; st.mineable = v === 'mine'; renderForm(); })),
      ...(st.cuttable || st.mineable ? [
        st.mineable ? field('Blows to break it', numberInput(st.hits, (v) => (st.hits = Math.max(1, Math.round(v))), { min: 1, step: 1 }), 'Each swing of a mining weapon chips it; the last breaks it open.') : h('span'),
        checkbox(st.mineable ? 'Back again when the player leaves the map (to mine again)' : 'Grows back when the player leaves the map', st.regrows, (v) => (st.regrows = v)),
        field('Leaves behind', select([['', 'Nothing'], ...store.catalog.all().filter((d) => d.id !== existing?.id).map((d) => [d.id, d.name] as [string, string])], st.stump, (v) => (st.stump = v)),
          st.mineable ? 'The prop left where it stood (rubble).' : 'The prop left where it stood (a stump).'),
        h('div', { class: 'field' }, h('label', {}, st.mineable ? 'Gives when broken (chance in %)' : 'Gives when cut (chance in %)'),
          ...st.drops.map((dr, k) => h('div', { class: 'field-row' },
            select((store.db.items ?? []).map((it) => [it.id, it.name] as [string, string]), dr.item, (v) => (dr.item = v), { 'aria-label': `Item ${k + 1}` }),
            numberInput(dr.count, (v) => (dr.count = Math.max(1, Math.round(v))), { min: 1, step: 1, 'aria-label': `How many of item ${k + 1}` }),
            numberInput(dr.chance ?? 100, (v) => { const c = Math.max(1, Math.min(100, Math.round(v))); if (c === 100) delete dr.chance; else dr.chance = c; }, { min: 1, max: 100, step: 5, 'aria-label': `Chance for item ${k + 1} (%)` }),
            h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove item ${k + 1}`, onclick: () => { st.drops.splice(k, 1); renderForm(); } }, '✕'))),
          (store.db.items ?? []).length ? h('button', { type: 'button', class: 'btn small', onclick: () => { st.drops.push({ item: store.db.items![0].id, count: 1 }); renderForm(); } }, '+ Item') : h('span', { class: 'hint' }, 'Add items in Database → Items first (firewood…).')),
      ] : []),
      ...(st.lightOn || st.flameOn ? [field('Burns for when full (game hours)', numberInput(st.burns, (v) => (st.burns = Math.max(0, Math.round(v * 4) / 4)), { min: 0, step: 0.25 }),
        '0: burns forever. Otherwise this is how much it holds: it burns down on the game clock and goes out when empty. Each piece of fuel (firewood: 1 hour) tops it up, never past full, so a torch of 1 hour takes one log and a big campfire of 8 hours takes several.'),
        checkbox('Starts unlit (the player lights it with fuel, or for a moment with a fire attack)', st.startsOut, (v) => (st.startsOut = v)),
        field('When out, show', select([['', 'This prop (its flame and light just go out)'], ...store.catalog.all().filter((d) => d.id !== existing?.id).map((d) => [d.id, d.name] as [string, string])], st.burntOut, (v) => (st.burntOut = v)),
          'If the flames are drawn into this prop’s image, pick a prop without them (Fire logs, a burnt-out torch). Lights placed right by the fire go out with it too.')] : []),
    );
    const behaviour = parts.splice(0);
    parts.push(
      slotRow('normal', 'Normal map', 'Adds lighting detail. Without one, the editor generates one from the image.'),
    );
    if (st.normal) parts.push(checkbox('Flip green channel (DirectX-style normal map)', st.flipGreen, (v) => (st.flipGreen = v)));
    parts.push(slotRow('glow', 'Night glow mask', 'White where it should glow at night, like lit windows. Black or transparent elsewhere.'));
    if (st.glow) {
      const gc = h('input', { type: 'color', value: st.glowColor, class: 'color-input', onchange: () => (st.glowColor = gc.value) });
      parts.push(field('Glow colour', gc));
    }
    const maps = parts.splice(0);
    parts.push(
      checkbox('Has a flame (animated fire: torches, campfires, braziers)', st.flameOn, (v) => { st.flameOn = v; st.tool = v ? 'flame' : 'move'; renderForm(); renderTools(); draw(); }),
    );
    if (st.flameOn) {
      flameX = numberInput(st.flame.x, (v) => { st.flame.x = round1(v); draw(); }, { step: 0.05, min: -MAX_TILES, max: MAX_TILES });
      flameY = numberInput(st.flame.y, (v) => { st.flame.y = round1(Math.max(0, v)); draw(); }, { step: 0.05, min: 0, max: MAX_TILES * 2 });
      parts.push(
        h('p', { class: 'hint' }, 'Choose “Place flame” under the preview and click where the flame should sit (its base). Measured from the blue ground marker.'),
        h('div', { class: 'field-row' }, field('Sideways (tiles)', flameX), field('Height (tiles)', flameY)),
        h('div', { class: 'field-row' },
          field('Flame width', numberInput(st.flame.w, (v) => { st.flame.w = Math.max(0.05, round1(v)); draw(); }, { step: 0.05, min: 0.05, max: 4 })),
          field('Flame height', numberInput(st.flame.h, (v) => { st.flame.h = Math.max(0.05, round1(v)); draw(); }, { step: 0.05, min: 0.05, max: 4 }))),
        checkbox('Gives off embers', !!st.flame.embers, (v) => { st.flame.embers = v || undefined; }),
      );
    }
    parts.push(
      checkbox('Emits light', st.lightOn, (v) => { st.lightOn = v; st.tool = v ? 'light' : 'move'; renderForm(); renderTools(); draw(); }),
    );
    if (st.lightOn) {
      parts.push(h('p', { class: 'hint' }, 'Choose “Place light” under the preview, then click where the light comes from.'));
      lightX = numberInput(st.light.x, (v) => { st.light.x = round1(v); draw(); }, { step: 0.1, min: -MAX_TILES, max: MAX_TILES });
      lightY = numberInput(st.light.y, (v) => { st.light.y = round1(Math.max(0, v)); draw(); }, { step: 0.1, min: 0, max: MAX_TILES * 2 });
      const names = store.knownNames();
      parts.push(
        h('div', { class: 'field-row' }, field('Sideways (tiles)', lightX), field('Height (tiles)', lightY)),
        h('p', { class: 'hint' }, 'Measured from the blue ground marker. Clicking the preview with “Place light” sets these too.'),
        h('div', { hidden: true }, h('datalist', { id: 'dl-switches' }, ...names.switches.map((n) => h('option', { value: n })))),
        ...lightFields(st.light, (apply) => { apply(st.light); draw(); }, {
          showRadius: true, showShadows: true, showSwitch: true,
          shadowHint: 'Point-light shadows are the most expensive kind. Keep them for one or two key lights.',
        }));
    }
    const light = parts.splice(0);
    const tabs: [typeof formTab, string, Node[]][] = [['look', 'Look', look], ['behaviour', 'Behaviour', behaviour], ['light', st.lightOn ? 'Light ✦' : 'Light', light], ['maps', 'Extra maps', maps]];
    form.replaceChildren(
      h('div', { class: 'importer-tabs', role: 'tablist' }, ...tabs.map(([id, label]) =>
        h('button', { type: 'button', role: 'tab', class: 'db-tab', 'aria-selected': String(formTab === id), onclick: () => { formTab = id; renderForm(); } }, label))),
      ...tabs.find(([id]) => id === formTab)![2]);
  }

  function renderTools(): void {
    toolSeg.replaceChildren(
      h('button', { type: 'button', 'aria-pressed': String(st.tool === 'move'), onclick: () => { st.tool = 'move'; renderTools(); } }, 'Move image'),
      ...(st.flameOn ? [h('button', { type: 'button', 'aria-pressed': String(st.tool === 'flame'), onclick: () => { st.tool = 'flame'; renderTools(); draw(); } }, 'Place flame')] : []),
      ...(st.lightOn ? [h('button', { type: 'button', 'aria-pressed': String(st.tool === 'light'), onclick: () => { st.tool = 'light'; renderTools(); draw(); } }, 'Place light')] : []));
    toolSeg.hidden = !st.lightOn && !st.flameOn;
    // The footprint seen from above (like RPG Maker's passability): front row at the bottom, where the picture
    // stands. Click a tile to cycle X → O → ★; drag to paint the same mark over more tiles.
    let paint: Mark | null = null;
    const show = (b: HTMLElement, m: Mark, r: number, c: number) => {
      b.dataset.mark = m; b.textContent = MARKS[m].sym;
      b.title = `${r === st.d - 1 ? 'Front row' : `Row ${r + 1} from the back`}, column ${c + 1}: ${MARKS[m].name}`;
      b.setAttribute('aria-label', b.title);
    };
    const grid = h('div', { class: 'foot-grid', role: 'grid', style: `--cols:${st.w}`, 'aria-label': 'Footprint seen from above: X blocks, O walkable, star walk behind' },
      ...st.solid.flatMap((row, r) => row.map((m, c) => {
        const b = h('button', { type: 'button', class: 'foot-cell' });
        show(b, m, r, c);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); paint = NEXT[st.solid[r][c]]; st.solid[r][c] = paint; show(b, paint, r, c); });
        b.addEventListener('pointerenter', () => { if (paint === null) return; st.solid[r][c] = paint; show(b, paint, r, c); });
        return b;
      })));
    const stop = () => { paint = null; };
    grid.addEventListener('pointerup', stop); grid.addEventListener('pointerleave', stop);
    const all = (m: Mark, label: string) => h('button', { type: 'button', class: 'btn small', onclick: () => { st.solid = st.solid.map((row) => row.map(() => m)); renderTools(); } }, label);
    footGrid.replaceChildren(
      h('div', { class: 'foot-head' }, h('span', { class: 'block-label' }, st.model ? `Footprint ${st.w} × ${st.d}, seen from above` : `Collision ${st.w} × ${st.d} (top row: the back)`)),
      h('div', { class: 'foot-legend hint' }, h('b', { 'data-mark': '#' }, 'X'), ' blocks · ', h('b', { 'data-mark': '.' }, 'O'), ' walkable · ', h('b', { 'data-mark': '*' }, '★'), ' walk behind it'),
      grid,
      h('div', { class: 'foot-front' }, '▲ front edge: the picture stands here'),
      ...(st.wall ? [h('p', { class: 'hint' }, 'On a wall: the front edge is the foot of the wall it hangs on, so its tiles reach back into the wall and the player walks right up to it.')] : []),
      h('div', { class: 'toolrow small' }, all('#', 'All X'), all('.', 'All O'), all('*', 'All ★')));
  }

  /* ---------------------------------------------------------------- footer */
  const foot = h('span', { class: 'importer-foot' });
  function outputPpt(): number {
    const want = st.res === 'keep' ? Math.round(st.scale) : parseInt(st.res, 10);
    return Math.max(4, Math.min(want, Math.floor(MAX_OUTPUT / Math.max(st.w, st.h))));
  }
  function updateFoot(): void {
    if (!st.image) { foot.textContent = ''; return; }
    const ppt = outputPpt();
    foot.textContent = `${st.w} × ${st.h} tiles · saved at ${st.w * ppt} × ${st.h * ppt} px (${ppt} px per tile)`;
  }

  /* ---------------------------------------------------------------- save */
  async function save(close: () => void, button: HTMLButtonElement): Promise<void> {
    if (!st.image) { toast('Choose an image first.', 'error'); return; }
    if (!st.name) { toast('Give the prop a name.', 'error'); return; }
    button.disabled = true;
    try {
      const ppt = outputPpt();
      const img = renderCrop(st.image.canvas, st, ppt, st.image.canvas);
      const images: PropImages = { image: await toPng(img) };
      if (st.normal) {
        const n = renderCrop(st.normal.canvas, st, ppt, st.image.canvas);
        if (st.flipGreen) flipGreen(n);
        images.normal = await toPng(n);
      }
      if (st.glow) images.glow = await toPng(renderCrop(st.glow.canvas, st, ppt, st.image.canvas));
      const id = existing?.id ?? propIdFromName(st.name, (x) => !!store.catalog.get(x));
      const def: PropDef = {
        id, name: st.name, w: st.w, h: st.h,
        // The footprint, plus the front row as the older column list (kept for anything that reads only that).
        foot: { w: st.w, d: st.d, solid: st.solid.map((row) => row.join('')) },
        ...(st.shape !== 'flat' ? { shape: st.shape } : {}),
        ...(st.shape === 'solid' && st.thickness && Math.abs(st.thickness - st.d) > 1e-6 ? { thickness: st.thickness } : {}),
        ...(st.collide === 'flat' ? { collide: 'flat' as const } : {}),
        block: (st.solid[st.d - 1] ?? []).flatMap((m, i) => (m === '#' ? [i + 0.5 - st.w / 2] : [])),
        filter: st.filter,
      };
      if (existing?.credits) def.credits = existing.credits;
      if (!st.castShadow) def.castShadow = false;
      if (st.sway > 0) def.sway = st.sway;
      if (st.wall) def.wall = true;
      if (st.wall && st.stretch) def.stretch = true;
      if (st.rustle) def.rustle = st.rustle === 'yes';
      if (!st.front) def.frontOfTiles = false;
      if (st.ground) def.ground = true;
      if (st.layer !== 25) def.layer = st.layer;
      if (!st.tilt) def.noTilt = true;
      if (st.walkSound) def.walkSound = st.walkSound;
      if (st.deck) {
        const pic = st.deckLook === 'art' || st.deckLook === 'artStand';
        const style = pic ? existing?.deck?.style ?? 'wood' : st.deckLook as 'wood' | 'rope' | 'stone';
        def.deck = { style, ...(st.deck !== 'any' ? { dir: st.deck } : {}) };
        if (pic) { def.deck.art = true; if (st.deckLook === 'artStand') def.deck.stand = true; }
        else if (existing?.deck?.rails !== undefined) def.deck.rails = existing.deck.rails;
        else if (st.deck !== 'any' && style !== 'rope') def.deck.rails = true;
        def.block = [];
      } else if (existing && isBuiltinProp(existing.id) && existing.deck) def.noDeck = true;
      if (st.season) def.season = st.season;
      if (st.dates) def.dates = st.dates.to && st.dates.to !== st.dates.from ? { ...st.dates } : { from: st.dates.from };
      if (st.respawn) def.respawn = true;
      if (st.forge) def.forge = true;
      if (st.cuttable || st.mineable) {
        if (st.cuttable) def.cuttable = true;
        if (st.mineable) { def.mineable = true; if (st.hits !== 3) def.hits = st.hits; }
        if (st.regrows) def.regrows = true;
        if (st.stump) def.stump = st.stump;
        const drops = st.drops.filter((d) => d.item && d.count > 0);
        if (drops.length) def.drops = drops;
      }
      if (st.flameOn) def.flame = { ...st.flame };
      if (st.burns > 0 && (st.lightOn || st.flameOn)) { def.burns = st.burns; if (st.burntOut) def.burntOut = st.burntOut; if (st.startsOut) def.startsOut = true; }
      if (st.glow) def.glowColor = st.glowColor;
      if (st.lightOn) def.light = { ...st.light };
      if (st.model) {
        def.model = st.model.fresh || !existing?.model ? `assets/props/${id}.${st.model.ext}` : existing.model;
        if (st.model.fresh || !existing?.model || existing.model !== def.model) images.model = { path: def.model, blob: st.model.blob };
        if (st.modelRot) def.modelRot = st.modelRot;
        // A model stands as it is: no camera tilt, no paper shapes.
        delete def.shape; delete def.thickness;
      }
      if (await commitProp(store, def, images, img)) {
        store.propType = id;
        store.propTool = 'place';
        store.emit('ui');
        close();
      }
    } finally { button.disabled = false; }
  }

  /* ---------------------------------------------------------------- open */
  const body = h('div', { class: 'importer' },
    h('div', { class: 'importer-left' },
      cropWrap,
      h('div', { class: 'crop-tools' },
        h('span', { class: 'crop-tools-label' }, 'Zoom'), zoom,
        h('button', { type: 'button', class: 'btn small', title: 'Fit the whole image inside the frame', onclick: () => fit('contain') }, 'Fit'),
        h('button', { type: 'button', class: 'btn small', title: 'Fill the frame with the image', onclick: () => fit('cover') }, 'Fill')),
      h('div', { class: 'crop-tools' }, toolSeg),
      h('p', { class: 'hint' }, 'The orange frame is the picture: each square is one tile, Width × Height. Drag to move the image inside it, scroll or use the slider to zoom it, Fit / Fill to size it to the frame. The blue marker is the front edge of the footprint, where the picture stands on the ground.'),
      footGrid),
    form,
    fileInputs.image, fileInputs.normal, fileInputs.glow, modelInput);

  const saveLabel = existing ? 'Save changes' : 'Import prop';

  let closeFn: () => void = () => {};
  const title = !existing ? 'Import prop' : isBuiltinProp(existing.id) ? `Customise “${existing.name}”` : `Edit “${existing.name}”`;
  closeFn = openModal(title, body, [
    { label: 'Cancel' },
    { label: saveLabel, primary: true, onClick: () => {
      const btn = [...document.querySelectorAll<HTMLButtonElement>('.modal-foot .btn.primary')].pop()!;
      void save(closeFn, btn);
      return false;
    } },
  ], undefined, { wide: true, footStart: foot });

  renderForm();
  renderTools();
  const ro = new ResizeObserver(() => layout());
  ro.observe(cropWrap);
  layout();
  if (!existing) (opts.model ? modelInput : fileInputs.image).click();
  else if (st.model) remodel();
}

/* -------------------------------------------------------------------- helpers */

const clampTiles = (v: number) => Math.max(1, Math.min(MAX_TILES, Math.round(v) || 1));
const round1 = (v: number) => Math.round(v * 10) / 10;

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Bounding box of the non-transparent pixels (the whole image if it's fully opaque or empty). */
function contentBounds(c: HTMLCanvasElement): { x: number; y: number; w: number; h: number } {
  const { width: w, height: hh } = c;
  const d = c.getContext('2d')!.getImageData(0, 0, w, hh).data;
  let x0 = w, y0 = hh, x1 = -1, y1 = -1;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 16) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? { x: 0, y: 0, w, h: hh } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function hasTransparency(c: HTMLCanvasElement): boolean {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const step = Math.max(1, Math.floor(d.length / 4 / 40000)) * 4;
  for (let i = 3; i < d.length; i += step) if (d[i] < 250) return true;
  return false;
}

/**
 * Cut the framed area out of `src` at `ppt` pixels per tile. Extra maps may differ in size from
 * the main image; their framing is scaled to match.
 */
function renderCrop(src: HTMLCanvasElement, st: State, ppt: number, main: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = Math.round(st.w * ppt);
  out.height = Math.round(st.h * ppt);
  const ctx = out.getContext('2d')!;
  const rx = src.width / main.width, ry = src.height / main.height;
  // Downscaling averages pixels (smooth); upscaling pixel art keeps hard edges unless "smooth" is chosen.
  ctx.imageSmoothingEnabled = st.filter === 'smooth' || ppt < st.scale;
  ctx.imageSmoothingQuality = 'high';
  const sx = st.ox * rx, sy = st.oy * ry, sw = st.w * st.scale * rx, sh = st.h * st.scale * ry;
  ctx.drawImage(src, 0, 0, src.width, src.height,
    (-sx / sw) * out.width, (-sy / sh) * out.height, (src.width / sw) * out.width, (src.height / sh) * out.height);
  return out;
}

function flipGreen(c: HTMLCanvasElement): void {
  const ctx = c.getContext('2d')!, img = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 1; i < img.data.length; i += 4) img.data[i] = 255 - img.data[i];
  ctx.putImageData(img, 0, 0);
}

function toPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Couldn’t encode the image'))), 'image/png'));
}
