// ---------------------------------------------------------------------------------------------------------------
// The builder: wardrobe, preview, saving and exporting.
// ---------------------------------------------------------------------------------------------------------------

const SKIN = ['#fde3cf', '#f3c9a5', '#e8b48c', '#d49a6a', '#b97a4c', '#965a34', '#734026', '#4f2c1a', '#a9c79a', '#9fb3e0'];
const HAIR = ['#1f1a1c', '#3d2a22', '#6b4429', '#9a5c2c', '#c2702f', '#d9a441', '#ecd79c', '#b9b9c4', '#f2f0ea', '#c2413a', '#3b5fa8', '#7b3fa0', '#3f8a5a', '#e48bb2'];
const CLOTH = ['#2d5b8c', '#3f8ac2', '#2f6b4a', '#6f9a3a', '#c2413a', '#8a2f2f', '#d9a441', '#e2702f', '#5a3f8a', '#b25a9a', '#e8e0d0', '#9aa0a8', '#4b4a5e', '#2a2830', '#6b4325', '#a8784a'];
const EYES = ['#3b6ea8', '#4f8a4a', '#6b4429', '#2a2830', '#8a8f9a', '#7b3fa0', '#c2413a', '#d9a441'];

const CATS = [
  { id: 'body', name: 'Body', palette: SKIN, def: '#f3c9a5', required: true, colorNote: 'Skin tone' },
  { id: 'eyes', name: 'Eyes', palette: EYES, def: '#3b6ea8', colorNote: 'Eye colour' },
  { id: 'hair', name: 'Hair', palette: HAIR, def: '#6b4429' },
  { id: 'top', name: 'Tops', palette: CLOTH, def: '#2d5b8c' },
  { id: 'bottom', name: 'Bottoms', palette: CLOTH, def: '#4b4a5e' },
  { id: 'shoes', name: 'Shoes', palette: CLOTH, def: '#6b4325' },
  { id: 'head', name: 'Hats', palette: CLOTH, def: '#8a2f2f' },
  { id: 'face', name: 'Face', palette: HAIR, def: '#3d2a22', note: 'Beards, glasses' },
  { id: 'acc', name: 'Extras', palette: CLOTH, def: '#6b4325', note: 'Scarves, belts' },
  { id: 'rear', name: 'Back', palette: CLOTH, def: '#8a2f2f', note: 'Capes, packs (shown from behind)' },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
// Drawing order, bottom to top. Facing away, the back layer (capes) goes over the clothes but under the hair.
const ORDER = ['rear', 'body', 'eyes', 'bottom', 'shoes', 'top', 'acc', 'face', 'hair', 'head'];
const UP_ORDER = ['body', 'eyes', 'bottom', 'shoes', 'top', 'acc', 'face', 'rear', 'hair', 'head'];
const BODY_ALIASES = { kid: ['kid', 'kids', 'child', 'children'], masculine: ['masculine', 'male', 'man', 'men', 'masc'], feminine: ['feminine', 'female', 'woman', 'women', 'fem'], any: ['any', 'all', 'shared', 'common', 'all-bodies'] };
const CAT_ALIASES = { body: ['body', 'bodies', 'base', 'skin'], eyes: ['eyes', 'eye'], hair: ['hair', 'hairs', 'hairstyles'], top: ['top', 'tops', 'shirt', 'shirts', 'torso', 'clothes', 'dresses'], bottom: ['bottom', 'bottoms', 'pants', 'trousers', 'legs', 'skirts'], shoes: ['shoes', 'feet', 'boots', 'footwear'], head: ['head', 'hat', 'hats', 'headwear', 'helmets'], face: ['face', 'faces', 'beard', 'beards', 'glasses', 'facial'], acc: ['acc', 'accessory', 'accessories', 'extra', 'extras'], rear: ['rear', 'back', 'backs', 'cape', 'capes', 'wings'] };
const ROW_NAMES = ['Down', 'Left', 'Right', 'Up'];
const WALK = [0, 1, 2, 1];

const DEFAULT_OUTFITS = {
  masculine: { body: 'base', eyes: 'round', hair: 'short', top: 'tunic', bottom: 'trousers', shoes: 'boots', acc: 'belt' },
  feminine: { body: 'base', eyes: 'round', hair: 'long', top: 'dress', shoes: 'shoes' },
  kid: { body: 'base', eyes: 'big', hair: 'short', top: 'tunic', bottom: 'shorts', shoes: 'shoes' },
};

/* State ------------------------------------------------------------------------------------------------------ */
let store = null;
let lib = { parts: [], chars: [], settings: { ...DEFAULT_SETTINGS } };
const S = { id: null, name: 'New character', body: 'masculine', layers: {}, cat: 'hair', row: 0, walking: true, bg: 'grass', dirty: false };

const $ = (id) => document.getElementById(id);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const canvas = (w, hgt) => { const c = document.createElement('canvas'); c.width = w; c.height = hgt; return c; };
const slug = (s) => (s || 'character').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'character';
const fs = () => lib.settings.frame ?? [32, 48];

function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), bad ? 5200 : 2600);
}

/* Part images ------------------------------------------------------------------------------------------------ */
const starterCache = new Map(), libCache = new Map(), colorCache = new Map();

function starterSheet(body, cat, style) {
  const [fw, fh] = fs(), key = `${body}|${cat}|${style}|${fw}`;
  let c = starterCache.get(key);
  if (!c) { c = drawStarter(body, cat, style, fw, fh); starterCache.set(key, c); }
  return c;
}

/** A library part as a sheet at the current frame size (null while it loads). */
function libSheet(part) {
  const [fw, fh] = fs(), key = `${part.id}|${fw}`;
  const e = libCache.get(key);
  if (e) return e.canvas;
  const entry = { canvas: null };
  libCache.set(key, entry);
  const img = new Image();
  img.onload = () => {
    const c = canvas(fw * 3, fh * 4), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0, c.width, c.height);
    entry.canvas = c; entry.natural = [img.naturalWidth, img.naturalHeight];
    redraw();
  };
  img.onerror = () => { entry.failed = true; };
  img.src = store.partURL(part);
  return null;
}

const partById = (id) => lib.parts.find((p) => p.id === id);

/** The uncoloured sheet for a layer choice (starter style or library part id). */
function rawSheet(body, cat, ref) {
  if (!ref) return null;
  if (ref.startsWith('starter:')) return lib.settings.starters !== false || cat === 'body' ? starterSheet(body, cat, ref.slice(8)) : null;
  const p = partById(ref);
  return p ? libSheet(p) : null;
}

function layerSheet(body, cat, layer) {
  const raw = rawSheet(body, cat, layer?.part);
  if (!raw) return null;
  const [fw] = fs(), key = `${body}|${cat}|${layer.part}|${layer.color ?? '-'}|${fw}`;
  let c = colorCache.get(key);
  if (!c) {
    if (colorCache.size > 400) colorCache.clear();
    c = recolor(raw, layer.color); colorCache.set(key, c);
  }
  return c;
}

/** The finished sheet for a recipe {body, layers}. */
function composite(rec) {
  const [fw, fh] = fs(), c = canvas(fw * 3, fh * 4), g = c.getContext('2d');
  for (let r = 0; r < 4; r++) {
    for (const cat of r === 3 ? UP_ORDER : ORDER) {
      const l = layerSheet(rec.body, cat, rec.layers[cat]);
      if (l) g.drawImage(l, 0, r * fh, fw * 3, fh, 0, r * fh, fw * 3, fh);
    }
  }
  return c;
}

/** One frame of a recipe into a canvas (thumbnails). */
function drawCell(rec, row, col, target) {
  const [fw, fh] = fs();
  target.width = fw; target.height = fh;
  const g = target.getContext('2d');
  g.clearRect(0, 0, fw, fh);
  for (const cat of row === 3 ? UP_ORDER : ORDER) {
    const l = layerSheet(rec.body, cat, rec.layers[cat]);
    if (l) g.drawImage(l, col * fw, row * fh, fw, fh, 0, 0, fw, fh);
  }
}

/* Choices ---------------------------------------------------------------------------------------------------- */
function optionsFor(body, cat) {
  const out = [];
  if (!CAT[cat].required) out.push({ ref: null, name: 'None' });
  if (lib.settings.starters !== false || cat === 'body') {
    for (const s of starterList(body)) if (s.cat === cat) out.push({ ref: 'starter:' + s.style, name: s.name, starter: true });
  }
  for (const p of lib.parts) if (p.cat === cat && (p.body === body || p.body === 'any')) out.push({ ref: p.id, name: p.name, mine: true });
  return out;
}

function defaultLayers(body) {
  const out = {};
  for (const c of CATS) {
    const style = DEFAULT_OUTFITS[body][c.id];
    out[c.id] = { part: style ? 'starter:' + style : null, color: c.def };
  }
  return out;
}

/** Keep what still fits after a body change (a matching part of the same name for your own parts). */
function adaptLayers(layers, body) {
  const out = {};
  for (const c of CATS) {
    const l = layers[c.id] ?? { part: null, color: c.def };
    let part = l.part;
    if (part?.startsWith('starter:')) { if (!optionsFor(body, c.id).some((o) => o.ref === part)) part = c.required ? 'starter:base' : null; }
    else if (part) {
      const p = partById(part);
      if (!p || (p.body !== body && p.body !== 'any')) {
        const twin = p && lib.parts.find((q) => q.cat === c.id && q.body === body && q.name.toLowerCase() === p.name.toLowerCase());
        part = twin ? twin.id : (c.required ? 'starter:base' : null);
      }
    }
    out[c.id] = { part, color: l.color === undefined ? c.def : l.color };
  }
  return out;
}

function setDirty(d = true) { S.dirty = d; $('btnSave').classList.toggle('dirty', d); saveDraft(); }

/* Rendering -------------------------------------------------------------------------------------------------- */
let sheetNow = null;
let redrawQueued = false;
function redraw() {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => { redrawQueued = false; renderAll(); });
}

function renderAll() {
  sheetNow = composite(S);
  $('charName').value !== S.name && document.activeElement !== $('charName') && ($('charName').value = S.name);
  renderBodies(); renderCats(); renderParts(); renderColors(); renderSheet(); renderTurn();
  $('charCount').textContent = lib.chars.length ? String(lib.chars.length) : '';
  for (const b of $('dirs').children) b.setAttribute('aria-pressed', String(+b.dataset.row === S.row));
  for (const b of $('bgs').children) b.setAttribute('aria-pressed', String(b.dataset.bg === S.bg));
  $('btnWalk').setAttribute('aria-pressed', String(S.walking)); $('btnStand').setAttribute('aria-pressed', String(!S.walking));
  const [fw, fh] = fs();
  $('stageTag').textContent = `${BODIES[S.body].name} · ${fw}×${fh} frames · facing ${ROW_NAMES[S.row].toLowerCase()}`;
}

function renderBodies() {
  const box = $('bodies');
  box.replaceChildren(...BODY_IDS.map((id) => {
    const c = canvas(1, 1);
    drawCell({ body: id, layers: id === S.body ? S.layers : adaptLayers(S.layers, id) }, 0, 1, c);
    return h('button', { type: 'button', role: 'radio', 'aria-checked': String(id === S.body), onclick: () => switchBody(id) }, c, h('b', { text: BODIES[id].name }));
  }));
}

function renderCats() {
  const box = $('cats');
  box.replaceChildren(...CATS.map((c) => {
    const l = S.layers[c.id], o = optionsFor(S.body, c.id).find((x) => x.ref === (l?.part ?? null));
    return h('button', { type: 'button', role: 'tab', 'aria-selected': String(c.id === S.cat), onclick: () => { S.cat = c.id; redraw(); } },
      c.name, h('span', { class: 'pick', text: o && o.ref ? '· ' + o.name : '' }));
  }));
  $('catTitle').textContent = CAT[S.cat].name;
  $('catNote').textContent = CAT[S.cat].note ?? '';
}

function renderParts() {
  const opts = optionsFor(S.body, S.cat), cur = S.layers[S.cat]?.part ?? null;
  const row = S.cat === 'rear' ? 3 : 0;
  const tiles = opts.map((o) => {
    const c = canvas(1, 1);
    const rec = { body: S.body, layers: { ...S.layers, [S.cat]: { part: o.ref, color: S.layers[S.cat]?.color ?? CAT[S.cat].def } } };
    drawCell(rec, row, 1, c);
    return h('button', { type: 'button', class: 'tile' + (o.ref ? '' : ' none'), 'aria-pressed': String(o.ref === cur), onclick: () => pickPart(o.ref) },
      c, h('span', { text: o.name }), o.mine ? h('i', { class: 'mine', text: 'yours' }) : null);
  });
  if (opts.length <= (CAT[S.cat].required ? 0 : 1)) tiles.push(h('div', { class: 'empty' }, `No ${CAT[S.cat].name.toLowerCase()} for this body yet. Add your own in the Parts library.`));
  $('parts').replaceChildren(...tiles);
}

function renderColors() {
  const c = CAT[S.cat], l = S.layers[S.cat];
  const panel = $('colorPanel');
  panel.hidden = !l?.part;
  if (!l?.part) return;
  const cur = l.color;
  const sw = c.palette.map((hex) => h('button', { type: 'button', class: 'sw', style: `background:${hex}`, 'aria-label': hex, 'aria-pressed': String(cur === hex), onclick: () => setColor(hex) }));
  const custom = h('input', { type: 'color', value: cur ?? c.def, 'aria-label': 'Any colour', oninput: (e) => setColor(e.target.value, true), onchange: (e) => setColor(e.target.value) });
  $('colors').replaceChildren(...sw,
    h('label', { class: 'custom' }, custom, 'Any colour'),
    h('button', { type: 'button', class: 'btn' + (cur === null ? ' primary' : ''), 'aria-pressed': String(cur === null), onclick: () => setColor(null) }, 'As drawn'));
  $('colorNote').textContent = c.colorNote ?? 'Greys in the part take this colour';
}

function renderSheet() {
  const [fw, fh] = fs(), z = Math.max(1, Math.floor(260 / (fw * 3)));
  const c = $('sheet');
  c.width = fw * 3 * z; c.height = fh * 4 * z;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(sheetNow, 0, 0, c.width, c.height);
  g.fillStyle = 'rgba(255,176,74,0.35)';
  for (let i = 1; i < 3; i++) g.fillRect(i * fw * z, 0, 1, c.height);
  for (let i = 1; i < 4; i++) g.fillRect(0, i * fh * z, c.width, 1);
  $('sheetMeta').textContent = `${fw * 3} × ${fh * 4} px · rows: down, left, right, up · columns: step, stand, step`;
}

const turnCanvases = [];
function renderTurn() {
  const box = $('turn');
  if (!turnCanvases.length) {
    for (let r = 0; r < 4; r++) {
      const c = canvas(1, 1);
      c.addEventListener('click', () => { S.row = r; redraw(); });
      turnCanvases.push(c);
      box.append(h('figure', {}, c, h('figcaption', { text: ROW_NAMES[r] })));
    }
  }
  turnCanvases.forEach((c, r) => c.classList.toggle('on', r === S.row));
}

/* The animated stage ------------------------------------------------------------------------------------------ */
const bgCache = {};
function background(kind, w, hgt, z) {
  const key = `${kind}|${w}|${hgt}|${z}`;
  if (bgCache[key]) return bgCache[key];
  const c = canvas(w, hgt), g = c.getContext('2d');
  const t = 16 * z; // one engine tile
  if (kind === 'check') {
    for (let y = 0; y < hgt; y += 8 * z) for (let x = 0; x < w; x += 8 * z) { g.fillStyle = ((x + y) / (8 * z)) % 2 ? '#232a3e' : '#1a2032'; g.fillRect(x, y, 8 * z, 8 * z); }
  } else {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < hgt; y += t) for (let x = 0; x < w; x += t) {
      if (kind === 'grass') {
        g.fillStyle = ['#4d7a3a', '#527f3d', '#4a7537'][Math.floor(rnd() * 3)]; g.fillRect(x, y, t, t);
        for (let i = 0; i < 6; i++) { g.fillStyle = rnd() < 0.5 ? '#5f8f46' : '#3f6630'; g.fillRect(x + Math.floor(rnd() * 15) * z, y + Math.floor(rnd() * 15) * z, z, z * 2); }
      } else {
        g.fillStyle = ['#6b6e78', '#72757f', '#666972'][Math.floor(rnd() * 3)]; g.fillRect(x, y, t, t);
        g.fillStyle = '#4f525b'; g.fillRect(x, y + t - z, t, z); g.fillRect(x + t - z, y, z, t);
        g.fillStyle = '#82858f'; g.fillRect(x, y, t - z, z);
      }
    }
  }
  return (bgCache[key] = c);
}

function tick(time) {
  requestAnimationFrame(tick);
  if (!sheetNow) return;
  const [fw, fh] = fs();
  const col = S.walking ? WALK[Math.floor(time / 170) % 4] : 1;
  // Big preview: the largest whole-number zoom that fits.
  const cv = $('preview'), box = cv.parentElement.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(box.width * dpr)), H = Math.max(1, Math.round(box.height * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const z = Math.max(1, Math.floor(Math.min(W / (fw * 1.6), H / (fh * 1.25))));
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const tz = Math.max(1, Math.round(z * fw / 32));
  g.drawImage(background(S.bg, W, H, tz), 0, 0);
  const x = Math.round((W - fw * z) / 2), y = Math.round((H - fh * z) / 2 + fh * z * 0.06);
  // A soft shadow under the feet, like in the engine.
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.ellipse(W / 2, y + fh * z * 0.96, fw * z * 0.32, fh * z * 0.05, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(sheetNow, col * fw, S.row * fh, fw, fh, x, y, fw * z, fh * z);
  // Turnaround strip.
  turnCanvases.forEach((c, r) => {
    if (c.width !== fw || c.height !== fh) { c.width = fw; c.height = fh; }
    const tg = c.getContext('2d');
    tg.clearRect(0, 0, fw, fh);
    tg.drawImage(sheetNow, col * fw, r * fh, fw, fh, 0, 0, fw, fh);
  });
}

/* Actions ---------------------------------------------------------------------------------------------------- */
function pickPart(ref) {
  const l = S.layers[S.cat] ?? { color: CAT[S.cat].def };
  S.layers[S.cat] = { part: ref, color: l.color === undefined ? CAT[S.cat].def : l.color };
  setDirty(); redraw();
}
function setColor(hex, live = false) {
  S.layers[S.cat] = { ...S.layers[S.cat], color: hex };
  if (!live) setDirty(); else saveDraft();
  redraw();
}
function switchBody(id) {
  if (id === S.body) return;
  S.layers = adaptLayers(S.layers, id); S.body = id;
  setDirty(); redraw();
}

function randomize() {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const chance = { head: 0.35, face: 0.3, acc: 0.4, rear: 0.2, bottom: 0.9, shoes: 0.95, top: 1, hair: 0.92, eyes: 1, body: 1 };
  const layers = {};
  for (const c of CATS) {
    const opts = optionsFor(S.body, c.id).filter((o) => o.ref);
    const on = opts.length && Math.random() < (chance[c.id] ?? 0.5);
    const color = c.id === 'body' ? pick(SKIN.slice(0, 8)) : pick(c.palette);
    layers[c.id] = { part: on ? pick(opts).ref : (c.required ? opts[0]?.ref ?? null : null), color };
  }
  // A dress or robe doesn't need trousers half the time.
  if (/dress|robe/.test(layers.top.part ?? '') && Math.random() < 0.6) layers.bottom.part = null;
  S.layers = layers;
  setDirty(); redraw();
}

function newCharacter() {
  Object.assign(S, { id: null, name: 'New character', layers: defaultLayers(S.body) });
  setDirty(false); redraw();
}

async function saveCharacter() {
  if (!store) return;
  const name = $('charName').value.trim() || 'New character';
  S.name = name;
  try {
    const id = await store.saveChar({ id: S.id ?? undefined, name, body: S.body, layers: S.layers, frame: fs() });
    S.id = id; setDirty(false);
    toast(`Saved “${name}”`);
  } catch (e) { toast('Couldn’t save: ' + (e?.message || e), true); }
}

const toBlob = (c) => new Promise((res) => c.toBlob(res, 'image/png'));
async function exportPng(rec = S) {
  const sheet = rec === S ? sheetNow : composite(rec);
  try {
    const r = await saveFile(slug(rec.name) + '.png', await toBlob(sheet));
    if (r === 'saved') toast(`Exported ${slug(rec.name)}.png`);
  } catch (e) { toast(e.message, true); }
}

function loadCharacter(c) {
  Object.assign(S, { id: c.id, name: c.name, body: c.body in BODIES ? c.body : 'masculine', layers: adaptLayers(c.layers ?? {}, c.body in BODIES ? c.body : 'masculine') });
  setDirty(false); redraw();
}

/* Draft (per browser): the character being edited survives a reload. */
function saveDraft() {
  try { localStorage.setItem('cb:draft', JSON.stringify({ id: S.id, name: S.name, body: S.body, layers: S.layers, cat: S.cat, row: S.row, bg: S.bg, dirty: S.dirty })); } catch { /* fine */ }
}
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem('cb:draft') || 'null');
    if (d && d.body in BODIES) Object.assign(S, { id: d.id ?? null, name: d.name || 'New character', body: d.body, layers: d.layers || defaultLayers(d.body), cat: CAT[d.cat] ? d.cat : 'hair', row: d.row ?? 0, bg: d.bg || 'grass', dirty: !!d.dirty });
    else S.layers = defaultLayers(S.body);
  } catch { S.layers = defaultLayers(S.body); }
}

/* Side sheets ------------------------------------------------------------------------------------------------ */
function openSheet(id) {
  if (!store) { toast('Still loading your library…'); return; }
  const s = $(id);
  s.hidden = false;
  s.querySelector('[data-close]')?.focus();
  if (id === 'charsSheet') renderChars();
  if (id === 'libSheet') renderLibrary();
}
function closeSheets() { for (const id of ['charsSheet', 'libSheet']) $(id).hidden = true; }

/** A two-step delete button: first press asks, second deletes. */
function confirmButton(label, run) {
  const b = h('button', { type: 'button', class: 'btn danger', text: label });
  b.addEventListener('click', async () => {
    if (b.dataset.armed) { b.disabled = true; await run(); return; }
    b.dataset.armed = '1'; b.textContent = 'Tap again to delete';
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = label; } }, 3500);
  });
  return b;
}

function renderChars() {
  const body = $('charsBody');
  if (!lib.chars.length) {
    body.replaceChildren(h('p', { class: 'empty' }, 'No saved characters yet. Build one and press Save, and it will be listed here.'));
    return;
  }
  const sorted = [...lib.chars].sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0));
  body.replaceChildren(h('p', { class: 'hint' }, 'Export PNG gives the sheet the engine imports: Database → Characters → Import character sheets.'),
    h('div', { class: 'list' }, sorted.map((c) => {
      const rec = { body: c.body, layers: adaptLayers(c.layers ?? {}, c.body) };
      const cv = canvas(1, 1); drawCell(rec, 0, 1, cv);
      return h('div', { class: 'item' }, cv,
        h('div', { class: 'info' }, h('b', { text: c.name }), h('span', { class: 'sub', text: `${BODIES[c.body]?.name ?? c.body}${c.id === S.id ? ' · open now' : ''}` })),
        h('div', { class: 'btns' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => { loadCharacter(c); closeSheets(); } }, 'Open'),
          h('button', { type: 'button', class: 'btn', onclick: () => { loadCharacter({ ...c, id: null, name: c.name + ' copy' }); setDirty(); closeSheets(); } }, 'Copy'),
          h('button', { type: 'button', class: 'btn', onclick: () => exportPng({ ...rec, name: c.name }) }, 'PNG'),
          confirmButton('Delete', async () => { await store.deleteChar(c.id); if (S.id === c.id) S.id = null; toast(`Deleted “${c.name}”`); })));
    })));
}

async function exportAllChars() {
  if (!lib.chars.length) { toast('Save a character first', true); return; }
  const files = [], used = new Set();
  for (const c of lib.chars) {
    let name = slug(c.name), n = 2;
    while (used.has(name)) name = slug(c.name) + '_' + n++;
    used.add(name);
    files.push({ name: name + '.png', data: await toBlob(composite({ body: c.body, layers: adaptLayers(c.layers ?? {}, c.body) })) });
  }
  try { await saveFile('characters.zip', await Zip.write(files)); toast(`Exported ${lib.chars.length} characters`); }
  catch (e) { toast(e.message, true); }
}

/* Library ---------------------------------------------------------------------------------------------------- */
const addForm = { body: 'masculine', cat: 'hair' };
const bodyLabel = (b) => (b === 'any' ? 'All bodies' : BODIES[b]?.name ?? b);

function renderLibrary() {
  const [fw, fh] = fs();
  const where = store.kind === 'cloud'
    ? h('span', { class: 'chip cloud' }, '● Saved to your Claude account: the same library on your tablet and computer')
    : store.kind === 'local' ? h('span', { class: 'chip' }, '● Saved in this browser only') : h('span', { class: 'chip' }, '● Not saved: storage is blocked here, so back up with “Back up library”');
  const bodySel = h('select', { id: 'addBody', onchange: (e) => (addForm.body = e.target.value) }, [...BODY_IDS, 'any'].map((b) => h('option', { value: b, selected: b === addForm.body, text: bodyLabel(b) })));
  const catSel = h('select', { id: 'addCat', onchange: (e) => (addForm.cat = e.target.value) }, CATS.map((c) => h('option', { value: c.id, selected: c.id === addForm.cat, text: c.name })));
  const sizeSel = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Frame size' }, FRAME_SIZES.map(([w, hh]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(w === fw), onclick: () => setSettings({ frame: [w, hh] }) }, `${w}×${hh}`)));
  const starters = h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: lib.settings.starters !== false, onchange: (e) => setSettings({ starters: e.target.checked }) }), 'Show the starter parts');

  const groups = [];
  for (const b of [...BODY_IDS, 'any']) for (const c of CATS) {
    const list = lib.parts.filter((p) => p.body === b && p.cat === c.id);
    if (!list.length) continue;
    groups.push(h('h3', { class: 'group-title', text: `${bodyLabel(b)} · ${c.name}` }));
    groups.push(h('div', { class: 'list' }, list.map(partRow)));
  }

  $('libBody').replaceChildren(
    h('div', { class: 'row' }, where),
    h('section', { class: 'panel' },
      h('h2', {}, 'Add your parts'),
      h('p', { class: 'hint' }, `One PNG per part, laid out like a character sheet: 3 frames across × 4 rows (down, left, right, up), ${fw * 3} × ${fh * 4} px at ${fw}×${fh}. Other sizes are scaled to fit.`),
      h('div', { class: 'row' }, h('label', { class: 'field' }, 'Body', bodySel), h('label', { class: 'field' }, 'Part', catSel)),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => $('filePng').click() }, 'Choose PNG files…'),
        h('button', { type: 'button', class: 'btn', onclick: () => $('fileZip').click() }, 'Import a folder (.zip)…'),
        h('span', { class: 'progress', id: 'progress' })),
      h('p', { class: 'hint' }, 'In a .zip, folders name the body and part, e.g. ', h('code', { text: 'feminine/hair/braid.png' }), ' or ', h('code', { text: 'all/hats/straw_hat.png' }), '. A library backup (below) imports the same way, characters included.')),
    h('section', { class: 'panel' },
      h('h2', {}, 'Drawing your own'),
      h('ul', { class: 'rules' },
        h('li', {}, 'Paint anything that should take the colour picker in greys. ', h('span', { class: 'swatch-inline', style: 'background:#a8a8a8' }), ' ', h('code', { text: '#a8a8a8' }), ' becomes the picked colour exactly; lighter greys become highlights, darker greys shadows.'),
        h('li', {}, 'Black outlines (darker than ', h('code', { text: '#212121' }), '), pure white and any coloured pixels stay exactly as drawn: eye whites, gold buckles, gems.'),
        h('li', {}, 'Layers stack in this order: back, body, eyes, bottoms, shoes, tops, extras, face, hair, hats. Facing up, the back layer moves in front of the clothes.'),
        h('li', {}, 'Start from the starter pack: open a part in your art app, redraw it, save it under a new name and add it here.')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', onclick: downloadStarterPack }, 'Starter pack (.zip)'),
        ...BODY_IDS.map((b) => h('button', { type: 'button', class: 'btn ghost', onclick: () => downloadGuide(b) }, `${BODIES[b].name} guide`)))),
    h('section', { class: 'panel' },
      h('h2', {}, 'Frame size', h('small', { text: 'All parts and exports use it' })),
      h('div', { class: 'row' }, sizeSel),
      h('p', { class: 'hint' }, '32×48 gives room for detail; 16×24 matches the engine’s 16-pixel tiles one to one. Starter parts redraw at the new size; your own parts scale to fit (best at their own size).'),
      starters),
    h('section', { class: 'panel' },
      h('h2', {}, 'Your parts', h('small', { text: `${lib.parts.length} part${lib.parts.length === 1 ? '' : 's'}` })),
      lib.parts.length ? groups : h('p', { class: 'empty' }, 'Nothing here yet. Choose PNG files or import a .zip above.'),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: backupLibrary }, 'Back up library (.zip)'))),
  );
}

function partRow(p) {
  const cv = canvas(1, 1);
  const sheet = libSheet(p);
  if (sheet) {
    const [fw, fh] = fs(); cv.width = fw; cv.height = fh;
    cv.getContext('2d').drawImage(sheet, fw, p.cat === 'rear' ? fh * 3 : 0, fw, fh, 0, 0, fw, fh);
  }
  const name = h('input', { type: 'text', value: p.name, 'aria-label': 'Name', onchange: (e) => store.updatePart(p.id, { name: e.target.value.trim() || p.name }) });
  const body = h('select', { 'aria-label': 'Body', onchange: (e) => store.updatePart(p.id, { body: e.target.value }) }, [...BODY_IDS, 'any'].map((b) => h('option', { value: b, selected: b === p.body, text: bodyLabel(b) })));
  const cat = h('select', { 'aria-label': 'Part', onchange: (e) => store.updatePart(p.id, { cat: e.target.value }) }, CATS.map((c) => h('option', { value: c.id, selected: c.id === p.cat, text: c.name })));
  return h('div', { class: 'item' }, cv,
    h('div', { class: 'info' }, name, h('div', { class: 'row' }, body, cat), h('span', { class: 'sub', text: p.w ? `${p.w} × ${p.h} px` : '' })),
    h('div', { class: 'btns' },
      h('button', { type: 'button', class: 'btn', onclick: () => { if (p.body !== 'any' && p.body !== S.body) switchBody(p.body); S.cat = p.cat; pickPart(p.id); closeSheets(); } }, 'Try on'),
      h('button', { type: 'button', class: 'btn', onclick: async () => { const r = await fetch(store.partURL(p)); saveFile(slug(p.name) + '.png', await r.blob()).catch((e) => toast(e.message, true)); } }, 'PNG'),
      confirmButton('Delete', async () => {
        await store.deletePart(p);
        for (const k of Object.keys(S.layers)) if (S.layers[k]?.part === p.id) S.layers[k] = { ...S.layers[k], part: CAT[k].required ? 'starter:base' : null };
        toast(`Deleted “${p.name}”`); redraw();
      })));
}

async function setSettings(patch) {
  const next = { ...lib.settings, ...patch };
  lib.settings = next;
  colorCache.clear();
  redraw();
  try { await store.saveSettings(next); } catch (e) { toast('Couldn’t save the setting: ' + e.message, true); }
  if (!$('libSheet').hidden) renderLibrary();
}

const imageSize = (blob) => new Promise((res) => {
  const u = URL.createObjectURL(blob), img = new Image();
  img.onload = () => { res([img.naturalWidth, img.naturalHeight]); URL.revokeObjectURL(u); };
  img.onerror = () => { res(null); URL.revokeObjectURL(u); };
  img.src = u;
});
const niceName = (file) => file.replace(/^.*\//, '').replace(/\.png$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()) || 'Part';

async function addPngs(files, body = addForm.body, cat = addForm.cat) {
  let n = 0, odd = 0;
  const prog = $('progress');
  for (const f of files) {
    const blob = f instanceof Blob ? f : f.blob;
    const size = await imageSize(blob);
    if (!size) { toast(`${f.name} isn’t a readable PNG`, true); continue; }
    if (size[1] !== size[0] * 2) odd++;
    if (prog) prog.textContent = `Adding ${++n} of ${files.length}…`;
    try { await store.addPart({ name: niceName(f.name), body, cat, w: size[0], h: size[1] }, blob); }
    catch (e) { toast(`Couldn’t add ${f.name}: ${e?.message || e}`, true); }
  }
  if (prog) prog.textContent = '';
  if (n) toast(`Added ${n} part${n === 1 ? '' : 's'}${odd ? ` (${odd} not shaped like a 3 × 4 sheet; check them)` : ''}`);
}

function matchAlias(seg, table) {
  const s = seg.toLowerCase().replace(/\s+/g, '-');
  return Object.keys(table).find((k) => table[k].includes(s)) ?? null;
}

async function importZip(file) {
  let all;
  try { all = await Zip.read(file); } catch { toast('That file isn’t a .zip', true); return; }
  const prog = $('progress');
  const entries = all.filter((f) => !f.dir && /\.png$/i.test(f.name) && !/(^|\/)(__MACOSX|_guides)\//.test(f.name));
  const mf = all.find((f) => f.name === 'library.json');
  let manifest = null;
  try { manifest = mf ? JSON.parse(await mf.text()) : null; } catch { manifest = null; }
  const idMap = new Map();
  let n = 0, skipped = 0;
  for (const e of entries) {
    const segs = e.name.split('/').slice(0, -1);
    const meta = manifest?.parts?.find((p) => p.file === e.name);
    let body = meta?.body ?? null, cat = meta?.cat ?? null;
    for (const s of segs) { body = body ?? matchAlias(s, BODY_ALIASES); cat = cat ?? matchAlias(s, CAT_ALIASES); }
    body = body ?? addForm.body; cat = cat ?? addForm.cat;
    let blob;
    try { blob = await e.blob('image/png'); } catch { skipped++; continue; }
    const size = await imageSize(blob);
    if (!size) { skipped++; continue; }
    prog.textContent = `Importing ${++n} of ${entries.length}…`;
    try {
      const id = await store.addPart({ name: meta?.name ?? niceName(e.name), body, cat, w: size[0], h: size[1] }, blob);
      if (meta?.id) idMap.set(meta.id, id);
    } catch (err) { skipped++; }
  }
  let chars = 0;
  for (const c of manifest?.chars ?? []) {
    const layers = {};
    for (const [k, l] of Object.entries(c.layers ?? {})) layers[k] = { ...l, part: l.part && !l.part.startsWith('starter:') ? idMap.get(l.part) ?? null : l.part };
    await store.saveChar({ name: c.name, body: c.body, layers }); chars++;
  }
  prog.textContent = '';
  toast(`Imported ${n - skipped} part${n - skipped === 1 ? '' : 's'}${chars ? ` and ${chars} character${chars === 1 ? '' : 's'}` : ''}${skipped ? ` (${skipped} skipped)` : ''}`);
}

async function backupLibrary() {
  const files = [], used = new Set(), parts = [];
  for (const p of lib.parts) {
    let base = `${p.body === 'any' ? 'all' : p.body}/${p.cat}/${slug(p.name)}`, file = base + '.png', n = 2;
    while (used.has(file)) file = `${base}_${n++}.png`;
    used.add(file);
    try { files.push({ name: file, data: await (await fetch(store.partURL(p))).blob() }); parts.push({ id: p.id, name: p.name, body: p.body, cat: p.cat, file }); } catch { /* skip unreadable */ }
  }
  files.push({ name: 'library.json', data: JSON.stringify({ version: 1, settings: lib.settings, parts, chars: lib.chars.map(({ id, name, body, layers }) => ({ id, name, body, layers })) }, null, 2) });
  try { await saveFile('character-library.zip', await Zip.write(files)); toast('Library backed up'); } catch (e) { toast(e.message, true); }
}

const README = (fw, fh) => `Sprite Character Builder: starter pack
=======================================

Every part is a PNG laid out like an RPG Maker MV character sheet:
  3 frames across × 4 rows = ${fw * 3} × ${fh * 4} px (each frame ${fw} × ${fh}).
  Rows:    1 facing down (towards you), 2 facing left, 3 facing right, 4 facing up (away).
  Columns: 1 step (left foot), 2 standing, 3 step (right foot). Walking plays 1, 2, 3, 2.

Folders: <body>/<part>/<name>.png
  body: kid, masculine, feminine, or all (fits every body)
  part: body, eyes, hair, top, bottom, shoes, head (hats), face (beards, glasses), acc (extras), rear (capes)

Colours:
  - Paint recolourable areas in greys. #a8a8a8 becomes the colour picked in the builder;
    lighter greys turn into highlights, darker greys into shadows.
  - Near-black outlines, pure white and any coloured pixels stay as drawn.

_guides/ has one guide per body: the bare body at low opacity with each frame's corner marked.
Put it on a layer under your drawing, then hide it before saving.

To use your parts: open the builder, Parts library → Import a folder (.zip), or Choose PNG files.
`;

async function downloadStarterPack() {
  const [fw, fh] = fs(), files = [];
  for (const b of BODY_IDS) {
    for (const s of starterList(b)) files.push({ name: `${b}/${s.cat}/${slug(s.name)}.png`, data: await toBlob(drawStarter(b, s.cat, s.style, fw, fh)) });
    files.push({ name: `_guides/${b}_guide_${fw}x${fh}.png`, data: await toBlob(templateGuide(b, fw, fh)) });
  }
  files.push({ name: 'README.txt', data: README(fw, fh) });
  try { await saveFile(`starter_parts_${fw}x${fh}.zip`, await Zip.write(files)); toast('Starter pack ready'); } catch (e) { toast(e.message, true); }
}

async function downloadGuide(b) {
  const [fw, fh] = fs();
  try { await saveFile(`${b}_guide_${fw}x${fh}.png`, await toBlob(templateGuide(b, fw, fh))); } catch (e) { toast(e.message, true); }
}

/* Wiring ----------------------------------------------------------------------------------------------------- */
function wire() {
  $('charName').addEventListener('input', (e) => { S.name = e.target.value; setDirty(); });
  $('btnRandom').onclick = randomize;
  $('btnNew').onclick = newCharacter;
  $('btnSave').onclick = saveCharacter;
  $('btnExport').onclick = () => exportPng();
  $('btnChars').onclick = () => openSheet('charsSheet');
  $('btnLib').onclick = () => openSheet('libSheet');
  $('btnExportAll').onclick = exportAllChars;
  $('btnWalk').onclick = () => { S.walking = true; redraw(); };
  $('btnStand').onclick = () => { S.walking = false; redraw(); };
  for (const b of $('dirs').children) b.onclick = () => { S.row = +b.dataset.row; saveDraft(); redraw(); };
  for (const b of $('bgs').children) b.onclick = () => { S.bg = b.dataset.bg; saveDraft(); redraw(); };
  for (const s of document.querySelectorAll('.scrim')) {
    s.addEventListener('click', (e) => { if (e.target === s || e.target.closest('[data-close]')) closeSheets(); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheets();
    if (e.target.matches('input, select, textarea')) return;
    const turn = { ArrowDown: 0, ArrowLeft: 1, ArrowRight: 2, ArrowUp: 3 }[e.key];
    if (turn !== undefined && $('libSheet').hidden && $('charsSheet').hidden) { S.row = turn; redraw(); e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveCharacter(); }
  });
  $('filePng').addEventListener('change', async (e) => { const files = [...e.target.files]; e.target.value = ''; if (files.length) await addPngs(files); });
  $('fileZip').addEventListener('change', async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await importZip(f); });
}

async function start() {
  loadDraft();
  wire();
  redraw();
  requestAnimationFrame(tick);
  store = await openStore();
  store.subscribe((snap) => {
    if (snap.error) toast(snap.error, true);
    const sizeChanged = lib.settings.frame?.[0] !== snap.settings.frame?.[0];
    lib = { parts: snap.parts, chars: snap.chars, settings: snap.settings };
    if (sizeChanged) colorCache.clear();
    S.layers = adaptLayers(S.layers, S.body);
    redraw();
    if (!$('libSheet').hidden) renderLibrary();
    if (!$('charsSheet').hidden) renderChars();
  });
}
start();
