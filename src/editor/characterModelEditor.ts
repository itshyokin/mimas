/**
 * Database → Characters → 3D model…: give a character a rigged model (GLB or FBX) and pick the action each
 * animation slot plays, with a live preview. Models are files under public/ (put there by hand, e.g.
 * assets/models/characters/party/katrina/katrina.glb, or imported here into assets/models/characters/).
 */
import * as THREE from 'three';
import { MODEL_SLOTS, type LoadedCharModel, ModelRig, type ModelStyle, clipFor, clipFrames, clipName, loadCharacterModel } from '../render/characterModel';
import { modelExt } from '../render/models';
import type { CharacterDef, CharacterModel, ModelSlot } from '../world/types';
import { field, h, numberInput, openModal, select, textInput, toast } from './dom';
import type { EditorStore } from './store';

/** Models read in the editor, by their files. */
const loaded = new Map<string, Promise<LoadedCharModel>>();
const keyOf = (m: CharacterModel) => [m.file, ...(m.extra ?? [])].join('|');

/** Read a character's model (and its extra files) from the project. Cached; `fresh` reads it again. */
export function editorCharModel(store: EditorStore, m: CharacterModel, fresh = false): Promise<LoadedCharModel> {
  const k = keyOf(m);
  let p = fresh ? undefined : loaded.get(k);
  if (!p) {
    p = loadCharacterModel(m, async (path) => {
      let b = store.files.get(path);
      if (!b) { b = await store.project.readFile(path); store.files.set(path, b); }
      return b.arrayBuffer();
    });
    loaded.set(k, p);
    p.catch(() => loaded.delete(k));
  }
  return p;
}

/** Open the 3D model window for one character (changes go to `c`, the Database window's copy). */
export function openCharacterModel(store: EditorStore, id: string, c: CharacterDef, style: ModelStyle, done: () => void): void {
  const look = style.look;
  const body = h('div', { class: 'char-model' });
  let model: LoadedCharModel | null = null, error = '';
  let previewSlot: ModelSlot = 'idle';
  // The preview: one renderer, the model turning slowly, playing the chosen slot.
  const canvas = h('canvas', { class: 'char-model-view', width: '280', height: '320', 'aria-label': 'Model preview' });
  let renderer: THREE.WebGLRenderer | null = null, rig: ModelRig | null = null, raf = 0, spin = 0;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(-2, 5, 4);
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a3140 }));
  scene.add(floor);
  const cam = new THREE.PerspectiveCamera(30, 280 / 320, 0.05, 50);
  let last = performance.now();
  const frame = () => {
    if (!canvas.isConnected) { renderer?.dispose(); renderer = null; return; }
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (rig) {
      spin += dt * 0.5;
      rig.face('down', Math.sin(spin) * 0.9);
      rig.update(dt);
    }
    renderer?.render(scene, cam);
    raf = requestAnimationFrame(frame);
  };
  const showRig = () => {
    rig?.dispose(); rig = null;
    if (!model || !c.model) return;
    try {
      rig = new ModelRig(model, c.model, style, false);
      scene.add(rig.root);
      const tall = c.model.height ?? 1.6;
      cam.position.set(0, tall * 0.62, tall * 2.6);
      cam.lookAt(0, tall * 0.48, 0);
      play(previewSlot);
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  };
  const play = (slot: ModelSlot) => {
    previewSlot = slot;
    if (!rig) return;
    rig.release();
    if (slot === 'ko') rig.once('ko', undefined, undefined, true);
    else if (['jump', 'attack', 'spellcast', 'injured'].includes(slot)) {
      const again = () => { if (rig && previewSlot === slot) rig.once(slot, undefined, () => setTimeout(again, 350)); };
      again();
    } else rig.loop(slot);
  };

  const load = async (fresh = false) => {
    model = null; error = '';
    if (!c.model?.file) { render(); return; }
    render();
    try { model = await editorCharModel(store, c.model, fresh); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    render();
    showRig();
  };

  const importFile = (slot: 'main' | 'extra') => {
    const input = h('input', { type: 'file', accept: '.glb,.fbx' });
    input.addEventListener('change', async () => {
      const f = input.files?.[0], ext = f ? modelExt(f.name) : null;
      if (!f || !ext) { if (f) toast('Choose a .glb or .fbx file.', 'error'); return; }
      const base = f.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_') || id;
      const path = `assets/models/characters/${id}/${base}.${ext}`;
      const p = store.project;
      if (p.canSave && p.canStoreImages) {
        try { await p.writeFile(path, f); } catch (err) { toast(`Couldn’t save the model: ${err instanceof Error ? err.message : String(err)}`, 'error'); return; }
      } else toast('Imported for this session only: open the project folder itself to keep it.');
      store.files.set(path, f);
      if (slot === 'main') c.model = { ...(c.model ?? {}), file: path };
      else if (c.model) c.model.extra = [...(c.model.extra ?? []), path];
      void load(true);
    });
    input.click();
  };

  const setPath = (v: string) => {
    v = v.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^public\//, '');
    if (!v) return;
    if (!modelExt(v)) { toast('The path should end in .glb or .fbx.', 'error'); return; }
    c.model = { ...(c.model ?? {}), file: v };
    void load(true);
  };

  function render(): void {
    const m = c.model;
    const parts: Node[] = [
      h('p', { class: 'hint' }, 'A rigged model drawn instead of the sheet, on the map, in battle and in pictures (faces, the Bestiary). One file can hold all its actions; each slot below plays one of them. Slots left on “Guess” take an action whose name fits (Walk_Cycle → Walk, Death → KO); empty slots use Idle. Enemies drawn as this character use Idle, Attack, Spellcast and KO (their death).'),
      field('Model file (under public/)', textInput(m?.file ?? '', setPath, { placeholder: 'assets/models/characters/party/katrina/katrina.glb', 'aria-label': 'Model file path' }),
        'Type the path of a model already in the project, or import one.'),
      h('div', { class: 'toolrow small' },
        h('button', { type: 'button', class: 'btn small', onclick: () => importFile('main') }, m ? 'Import another file…' : 'Import a model file…'),
        m ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => void load(true) }, 'Reload') : null,
        m ? h('button', { type: 'button', class: 'btn small danger', onclick: () => { delete c.model; rig?.dispose(); rig = null; model = null; render(); } }, 'Remove 3D model') : null),
    ];
    if (m && !model && !error) parts.push(h('p', { class: 'note' }, 'Loading…'));
    if (error) parts.push(h('p', { class: 'warn' }, `Couldn’t load it: ${error}`));
    if (m && model) {
      const names = model.clips.map(clipName);
      parts.push(
        h('div', { class: 'field-row three' },
          field('Height (tiles)', numberInput(m.height ?? 1.6, (v) => { m.height = Math.max(0.3, Math.min(8, Math.round(v * 20) / 20)); if (m.height === 1.6) delete m.height; showRig(); }, { min: 0.3, max: 8, step: 0.05 })),
          field('Faces', select([['0', 'As modelled'], ['90', 'Turned right 90°'], ['180', 'Turned round'], ['270', 'Turned left 90°']], String(m.rot ?? 0), (v) => { const n = Number(v); if (n) m.rot = n; else delete m.rot; showRig(); })),
          field('Size in battle', select([['0.35', 'Small (35%)'], ['0.5', 'Half (default)'], ['0.65', '65%'], ['0.8', '80%'], ['1', 'Full size']], String([0.35, 0.5, 0.65, 0.8, 1].reduce((a, b) => (Math.abs(b - (m.battleScale ?? 0.5)) < Math.abs(a - (m.battleScale ?? 0.5)) ? b : a))),
            (v) => { const n = Number(v); if (n === 0.5) delete m.battleScale; else m.battleScale = n; }), 'The battle stage is seen up close.')),
        h('div', { class: 'char-model-count' }, `${names.length} action${names.length === 1 ? '' : 's'} in ${1 + (m.extra?.length ?? 0)} file${m.extra?.length ? 's' : ''}`),
        h('div', { class: 'char-model-slot char-model-slot-head' }, h('span'), h('span', { class: 'section-label' }, 'Animation slots'), h('span'), h('span', { class: 'hint' }, 'Start'), h('span', { class: 'hint' }, 'End')),
        h('div', { class: 'char-model-slots' }, ...MODEL_SLOTS.map((s) => {
          const guess = clipFor(model!, { ...m, anims: { ...m.anims, [s.id]: undefined } }, s.id);
          const cur = m.anims?.[s.id];
          const opts: [string, string][] = [['\u0000guess', guess ? `Guess: ${clipName(guess)}` : 'Guess: none (uses Idle)'], ['', 'None (uses Idle)'], ...names.map((n) => [n, n] as [string, string])];
          // Trim: play only frames from … to (blank: the start, the end).
          const chosen = clipFor(model!, m, s.id), total = chosen ? clipFrames(chosen) : 0, tr = m.trim?.[s.id];
          const setTrim = (k: 'from' | 'to', raw: string) => {
            const t = { ...(m.trim?.[s.id] ?? {}) }, n = raw.trim() === '' ? undefined : Math.max(0, Math.round(Number(raw)));
            if (n === undefined || Number.isNaN(n) || (k === 'from' && n === 0) || (k === 'to' && n >= total)) delete t[k]; else t[k] = n;
            const all = { ...(m.trim ?? {}) };
            if (t.from === undefined && t.to === undefined) delete all[s.id]; else all[s.id] = t;
            if (Object.keys(all).length) m.trim = all; else delete m.trim;
            showRig();
          };
          const frameBox = (k: 'from' | 'to') => h('input', { type: 'number', class: 'char-model-frame', min: '0', max: String(total), step: '1', disabled: !chosen,
            value: tr?.[k] !== undefined ? String(tr[k]) : '', placeholder: k === 'from' ? '0' : String(total),
            title: chosen ? `${k === 'from' ? 'First' : 'Last'} frame to play (of ${total}; 30 a second). Blank: ${k === 'from' ? 'its start' : 'its end'}.` : 'No action for this slot',
            'aria-label': `${s.name}: ${k === 'from' ? 'start' : 'end'} frame`, onchange: (e: Event) => setTrim(k, (e.target as HTMLInputElement).value) });
          return h('div', { class: 'char-model-slot' + (s.enemy ? ' enemy' : '') },
            h('button', { type: 'button', class: 'btn small' + (previewSlot === s.id ? ' on' : ''), title: `Preview ${s.name}`, 'aria-pressed': String(previewSlot === s.id), onclick: () => { play(s.id); render(); } }, '▶'),
            h('span', { class: 'char-model-slot-name', title: s.hint }, s.name, s.enemy ? h('small', {}, ' · enemies') : null),
            select(opts, cur === undefined ? '\u0000guess' : cur, (v) => {
              const a = { ...(m.anims ?? {}) };
              if (v === '\u0000guess') delete a[s.id]; else a[s.id] = v;
              if (Object.keys(a).length) m.anims = a; else delete m.anims;
              // A different action: its trim no longer applies.
              if (m.trim?.[s.id]) { delete m.trim[s.id]; if (!Object.keys(m.trim).length) delete m.trim; }
              showRig();
              render();
            }, { 'aria-label': `${s.name} action` }),
            frameBox('from'), frameBox('to'));
        })),
        h('div', { class: 'section-label' }, 'More actions from other files'),
        ...(m.extra ?? []).map((f, i) => h('div', { class: 'toolrow small' }, h('code', {}, f),
          h('button', { type: 'button', class: 'btn small ghost', 'aria-label': `Remove ${f}`, onclick: () => { m.extra!.splice(i, 1); if (!m.extra!.length) delete m.extra; void load(true); } }, '×'))),
        h('div', { class: 'toolrow small' },
          h('button', { type: 'button', class: 'btn small', onclick: () => importFile('extra') }, '+ Import a file of actions…'),
          (() => { const t = textInput('', (v) => { v = v.trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/^public\//, ''); if (!modelExt(v)) return; m.extra = [...(m.extra ?? []), v]; void load(true); }, { placeholder: '…or type its path', 'aria-label': 'Path of a file of actions' }); return t; })()),
        h('p', { class: 'hint' }, 'Files of actions must use the same skeleton (the same bone names), e.g. Mixamo animations downloaded without skin.'),
      );
    }
    body.replaceChildren(h('div', { class: 'char-model-grid' }, h('div', { class: 'char-model-left' }, canvas, h('p', { class: 'hint' }, `Look: ${look === 'lod' ? 'Legend of Dragoon' : 'Final Fantasy X'}, ${style.outline ? 'outlined' : 'no outline'}: set for every 3D character above the list (3D characters).`)), h('div', { class: 'char-model-form' }, ...parts)));
  }

  render();
  openModal(`3D model: ${c.name}`, body, [{ label: 'Done', primary: true, onClick: () => { done(); } }], () => { cancelAnimationFrame(raf); rig?.dispose(); done(); }, { wide: true });
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: look !== 'lod', alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
  } catch { toast('This browser can’t show the 3D preview.', 'error'); }
  raf = requestAnimationFrame(frame);
  void load();
}
