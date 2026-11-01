// ---------------------------------------------------------------------------------------------------------------
// Art: the sheet layout, recolouring, and the built-in starter parts (drawn in code at any frame size).
//
// Sheet layout (same as the engine and RPG Maker MV): 3 columns × 4 rows of frames.
//   Rows: 0 facing down (towards you), 1 facing left, 2 facing right, 3 facing up (away).
//   Columns: 0 step (left foot), 1 standing, 2 step (right foot). Walking plays 0, 1, 2, 1.
// Starter parts are designed on a 16 × 24 grid ("units") and drawn at a scale, so 32 × 48 frames are drawn
// natively at 2 pixels per unit, not blown up.
// ---------------------------------------------------------------------------------------------------------------

const ROWS = ['down', 'left', 'right', 'up'];
const FRAME_SIZES = [[16, 24], [32, 48], [48, 72]];

/* Colour helpers --------------------------------------------------------------------------------------------- */
const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// The greys starter parts are drawn in. Mid grey (BASE) becomes exactly the colour picked.
const G = { light: '#dcdcdc', base: '#a8a8a8', dark: '#767676', deep: '#4a4a4a', out: '#17141c', white: '#ffffff' };
const BASE_LUM = 0.659;

/**
 * Recolour an image the way the builder's colour picker does:
 *  - grey pixels take the chosen colour (mid grey #a8a8a8 = the colour itself; lighter greys = highlights,
 *    darker greys = shadows, shifted a little towards blue so shadows don't look muddy);
 *  - near-black (outlines), pure white, and anything already coloured stay as drawn.
 */
function recolor(src, hex) {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  if (!hex) return c;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const col = hexToRgb(hex);
  const hi = mix(col, [255, 255, 255], 0.55);
  const lo = [col[0] * 0.28 + 6, col[1] * 0.28 + 6, col[2] * 0.36 + 18];
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if ((mx - mn) / 255 > 0.06) continue;
    const lum = (0.299 * r + 0.587 * gg + 0.114 * b) / 255;
    if (lum < 0.13 || lum > 0.97) continue;
    const out = lum >= BASE_LUM ? mix(col, hi, Math.min(1, (lum - BASE_LUM) / (0.95 - BASE_LUM))) : mix(col, lo, Math.min(1, (BASE_LUM - lum) / (BASE_LUM - 0.13)));
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* Bodies ----------------------------------------------------------------------------------------------------- */
// Proportions on the 16 × 24 unit grid (feet at the bottom). hw = half width.
const BODIES = {
  masculine: {
    name: 'Masculine',
    head: { cx: 8, cy: 6.9, rx: 4.3, ry: 4.4 },
    neck: { y0: 10.4, y1: 12, hw: 1.15 },
    torso: { y0: 11.5, y1: 17.2, top: 3.9, mid: 3.4, bot: 3.2 },
    arm: { hw: 0.95, y0: 11.9, y1: 17.1 },
    leg: { y0: 16.8, y1: 22.3, hw: 1.25, off: 1.75 },
    foot: { h: 1.15, ext: 0.35 },
    eye: { dx: 1.7, w: 1.15, h: 1.55 },
  },
  feminine: {
    name: 'Feminine',
    head: { cx: 8, cy: 7.1, rx: 4.15, ry: 4.3 },
    neck: { y0: 10.6, y1: 12.1, hw: 0.9 },
    torso: { y0: 11.8, y1: 17, top: 3.2, mid: 2.5, bot: 3.3 },
    arm: { hw: 0.78, y0: 12.1, y1: 16.9 },
    leg: { y0: 16.7, y1: 22.4, hw: 1.1, off: 1.45 },
    foot: { h: 1.05, ext: 0.25 },
    eye: { dx: 1.65, w: 1.1, h: 1.7, lashes: true },
  },
  kid: {
    name: 'Kid',
    head: { cx: 8, cy: 10.9, rx: 4.3, ry: 4.2 },
    neck: { y0: 14.4, y1: 15.5, hw: 0.9 },
    torso: { y0: 15.1, y1: 19.4, top: 2.9, mid: 2.75, bot: 2.8 },
    arm: { hw: 0.8, y0: 15.4, y1: 19.1 },
    leg: { y0: 19.1, y1: 22.5, hw: 1.05, off: 1.3 },
    foot: { h: 1.0, ext: 0.25 },
    eye: { dx: 1.75, w: 1.25, h: 1.95 },
  },
};
const BODY_IDS = ['kid', 'masculine', 'feminine'];

/**
 * Where everything is for one body, view (down / up / side, side = facing right) and walk frame (0, 1, 2).
 * Limbs are capsules (p0 → p1, radius r); `far` limbs are behind the torso.
 */
function pose(bodyId, view, frame) {
  const B = BODIES[bodyId], side = view === 'side';
  const k = frame === 0 ? 1 : frame === 2 ? -1 : 0; // step direction
  const head = { ...B.head };
  if (side) head.cx += 0.25;
  const sx = side ? 0.7 : 1; // torso is narrower seen from the side
  const t = B.torso;
  const torso = { cx: side ? 8.15 : 8, y0: t.y0, y1: t.y1, top: t.top * sx, mid: t.mid * sx, bot: t.bot * sx };
  const L = B.leg, A = B.arm;
  const legs = [], arms = [], feet = [];
  if (!side) {
    for (const s of [-1, 1]) {
      const lift = (k === 1 && s === -1) || (k === -1 && s === 1) ? 0.9 : 0;
      const x = 8 + s * L.off;
      legs.push({ p0: [x, L.y0], p1: [x, L.y1 - lift], r: L.hw, far: false });
      feet.push({ x0: x - L.hw - B.foot.ext, x1: x + L.hw + B.foot.ext, y0: L.y1 - lift - 0.25, y1: L.y1 - lift + B.foot.h, far: false });
      const ax = 8 + s * (t.top + A.hw - 0.35);
      const up = (k === 1 && s === -1) || (k === -1 && s === 1) ? 0.55 : 0;
      arms.push({ p0: [ax, A.y0], p1: [ax + s * 0.15, A.y1 - up], r: A.hw, far: false });
    }
  } else {
    for (const s of [1, -1]) { // front leg first in the list, drawn last
      const far = s === -1;
      const dx = 1.5 * k * s;
      legs.push({ p0: [torso.cx, L.y0], p1: [torso.cx + dx, L.y1 - (far && k ? 0.3 : 0)], r: L.hw * 0.95, far });
      const fx = torso.cx + dx, fy = L.y1 - (far && k ? 0.3 : 0);
      feet.push({ x0: fx - L.hw * 0.8, x1: fx + L.hw + 1.0, y0: fy - 0.25, y1: fy + B.foot.h, far });
      const hand = torso.cx - 1.3 * k * s;
      arms.push({ p0: [torso.cx - 0.15, A.y0 + 0.3], p1: [hand, A.y1], r: A.hw, far });
    }
    legs.reverse(); feet.reverse(); arms.reverse(); // far ones first
  }
  return { body: B, bodyId, view, frame, head, torso, neck: B.neck, legs, arms, feet };
}

/* Shapes (tests on unit coordinates) ------------------------------------------------------------------------- */
const ell = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
/** Capsule p0 → p1 with radius r; `t0`/`t1` cut it to part of its length (0 = p0, 1 = p1). */
function capsule(p0, p1, r, t0 = -1, t1 = 2) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len2 = dx * dx + dy * dy || 1;
  return (x, y) => {
    let t = ((x - p0[0]) * dx + (y - p0[1]) * dy) / len2;
    if (t < t0 || t > t1) return false;
    t = Math.max(0, Math.min(1, t));
    const px = p0[0] + dx * t - x, py = p0[1] + dy * t - y;
    return px * px + py * py <= r * r;
  };
}
/** The torso: rounded shoulders, a waist, hips. `grow` widens it, y0/y1 override its height. */
function torsoShape(T, grow = 0, y0 = T.y0, y1 = T.y1) {
  const midY = T.y0 + (T.y1 - T.y0) * 0.58;
  return (x, y) => {
    if (y < y0 || y >= y1) return false;
    let hw;
    if (y < midY) hw = T.top + (T.mid - T.top) * ((y - T.y0) / (midY - T.y0));
    else hw = T.mid + (T.bot - T.mid) * Math.min(1, (y - midY) / (T.y1 - midY));
    // Rounded shoulders.
    const s = y - T.y0;
    if (s < 1.1) hw -= (1.1 - s) ** 2 * 0.9;
    return Math.abs(x - T.cx) <= hw + grow;
  };
}
/** A trapezoid centred on cx (skirts, capes). */
const trap = (cx, y0, y1, hw0, hw1) => (x, y) => y >= y0 && y < y1 && Math.abs(x - cx) <= hw0 + (hw1 - hw0) * ((y - y0) / (y1 - y0));
const tri = (ax, ay, bx, by, cx, cy) => (x, y) => {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
};
const or = (...fs) => (x, y) => fs.some((f) => f && f(x, y));
const and = (...fs) => (x, y) => fs.every((f) => f(x, y));
const not = (f) => (x, y) => !f(x, y);

/* Painting a layer ------------------------------------------------------------------------------------------- */
// A layer is painted shape by shape into one frame. Each shape is shaded light (top-left) → dark (bottom-right)
// across its own box; where a shape overlaps what's already painted its edge gets a darker line (2× and up),
// and at the end the whole layer gets a near-black outline.

class Frame {
  constructor(fw, fh, s) { this.w = fw; this.h = fh; this.s = s; this.px = new Array(fw * fh).fill(null); }
  at(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x]; }
  put(x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  /**
   * shape(x, y) in units; box [x0, y0, x1, y1] for shading; opts: { ramp: [light, base, dark], flat, shade,
   * noEdge, color (a single colour) }.
   */
  paint(shape, box, opts = {}) {
    const s = this.s, mask = new Uint8Array(this.w * this.h);
    const [bx0, by0, bx1, by1] = box;
    const ramp = opts.ramp ?? [G.light, G.base, G.dark];
    const offs = opts.shade ?? 0;
    for (let py = 0; py < this.h; py++) for (let px = 0; px < this.w; px++) {
      const ux = (px + 0.5) / s, uy = (py + 0.5) / s;
      if (!shape(ux, uy)) continue;
      mask[py * this.w + px] = 1;
      let col;
      if (opts.color) col = opts.color;
      else if (opts.flat) col = ramp[1];
      else {
        const nx = ((ux - bx0) / Math.max(0.01, bx1 - bx0)) * 2 - 1, ny = ((uy - by0) / Math.max(0.01, by1 - by0)) * 2 - 1;
        const d = nx * 0.55 + ny * 0.85 + offs;
        col = d < -0.62 ? ramp[0] : d > 0.55 ? ramp[2] : ramp[1];
      }
      this.px[py * this.w + px] = col;
    }
    const prev = (this._painted ??= new Uint8Array(this.w * this.h));
    // Where this shape covers something already painted, darken its edge so the two read apart (2× and up).
    if (!opts.noEdge && s >= 2) {
      for (let py = 0; py < this.h; py++) for (let px = 0; px < this.w; px++) {
        const i = py * this.w + px;
        if (!mask[i]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const qx = px + dx, qy = py + dy;
          if (qx < 0 || qy < 0 || qx >= this.w || qy >= this.h) continue;
          const j = qy * this.w + qx;
          if (!mask[j] && prev[j]) { this.px[i] = opts.edge ?? G.deep; break; }
        }
      }
    }
    for (let i = 0; i < mask.length; i++) if (mask[i]) prev[i] = 1;
    return this;
  }
  /** Near-black outline around everything painted. */
  outline(color = G.out) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.at(x, y)) continue;
      if (this.at(x + 1, y) || this.at(x - 1, y) || this.at(x, y + 1) || this.at(x, y - 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.put(x, y, color);
    return this;
  }
  /** Single pixels in unit coordinates (details: highlights, nostrils). */
  dot(ux, uy, c) { this.put(Math.floor(ux * this.s), Math.floor(uy * this.s), c); return this; }
  toImageData() {
    const img = new ImageData(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      if (!c) continue;
      const [r, g, b] = hexToRgb(c.slice(0, 7));
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = c.length > 7 ? parseInt(c.slice(7), 16) : 255;
    }
    return img;
  }
}

const boxOf = (P) => [P.head.cx - P.head.rx, P.head.cy - P.head.ry, P.head.cx + P.head.rx, P.head.cy + P.head.ry];
const limbBox = (l) => [Math.min(l.p0[0], l.p1[0]) - l.r, Math.min(l.p0[1], l.p1[1]), Math.max(l.p0[0], l.p1[0]) + l.r, Math.max(l.p0[1], l.p1[1])];
const torsoBox = (T, y0 = T.y0, y1 = T.y1) => [T.cx - T.top, y0, T.cx + T.top, y1];

/* Starter parts ---------------------------------------------------------------------------------------------- */
// Each draws one frame: (f: Frame, P: pose). Recolourable areas are grey; fixed details are coloured.

const DRAW = {
  body: {
    base: { name: 'Base', draw(f, P) {
      const far = (l) => l.far;
      for (const l of P.arms.filter(far)) f.paint(capsule(l.p0, l.p1, l.r), limbBox(l), { shade: 0.5 });
      for (const l of P.legs.filter(far)) f.paint(capsule(l.p0, l.p1, l.r), limbBox(l), { shade: 0.5 });
      for (const ft of P.feet.filter(far)) f.paint(rect(ft.x0, ft.y0, ft.x1, ft.y1), [ft.x0, ft.y0, ft.x1, ft.y1], { shade: 0.5 });
      for (const l of P.legs.filter((l) => !l.far)) f.paint(capsule(l.p0, l.p1, l.r), limbBox(l));
      for (const ft of P.feet.filter((l) => !l.far)) f.paint(rect(ft.x0, ft.y0, ft.x1, ft.y1), [ft.x0, ft.y0, ft.x1, ft.y1]);
      f.paint(torsoShape(P.torso), torsoBox(P.torso));
      for (const l of P.arms.filter((l) => !l.far)) f.paint(capsule(l.p0, l.p1, l.r), limbBox(l));
      const N = P.neck;
      f.paint(rect(P.torso.cx - N.hw, N.y0, P.torso.cx + N.hw, N.y1), [P.torso.cx - N.hw, N.y0, P.torso.cx + N.hw, N.y1], { shade: 0.4, noEdge: true });
      const H = P.head;
      f.paint(ell(H.cx, H.cy, H.rx, H.ry), boxOf(P), { noEdge: true, shade: -0.38 });
      if (P.view === 'side') {
        // Ear and nose.
        f.paint(ell(H.cx - 0.7, H.cy + 0.5, 0.75, 1.0), [H.cx - 1.4, H.cy - 0.5, H.cx, H.cy + 1.5], { shade: 0.3 });
        f.paint(rect(H.cx + H.rx - 0.15, H.cy + 0.6, H.cx + H.rx + 0.55, H.cy + 1.4), [H.cx + H.rx - 0.2, H.cy + 0.6, H.cx + H.rx + 0.6, H.cy + 1.4], { noEdge: true });
      }
      f.outline();
      if (P.view === 'down' && f.s >= 2) f.dot(H.cx, H.cy + 2.2, G.dark); // nose shadow
    } },
  },
  eyes: {
    round: { name: 'Round', draw: (f, P) => drawEyes(f, P, 1) },
    narrow: { name: 'Narrow', draw: (f, P) => drawEyes(f, P, 0.65) },
    big: { name: 'Big', draw: (f, P) => drawEyes(f, P, 1.3) },
  },
  hair: {
    short: { name: 'Short', draw: (f, P) => drawHair(f, P, 'short') },
    spiky: { name: 'Spiky', draw: (f, P) => drawHair(f, P, 'spiky') },
    long: { name: 'Long', draw: (f, P) => drawHair(f, P, 'long') },
    bob: { name: 'Bob', draw: (f, P) => drawHair(f, P, 'bob') },
    ponytail: { name: 'Ponytail', draw: (f, P) => drawHair(f, P, 'ponytail') },
    buns: { name: 'Twin buns', draw: (f, P) => drawHair(f, P, 'buns') },
  },
  top: {
    tunic: { name: 'Tunic', draw: (f, P) => drawTop(f, P, 'tunic') },
    shirt: { name: 'Long shirt', draw: (f, P) => drawTop(f, P, 'shirt') },
    dress: { name: 'Dress', draw: (f, P) => drawTop(f, P, 'dress') },
    robe: { name: 'Robe', draw: (f, P) => drawTop(f, P, 'robe') },
  },
  bottom: {
    trousers: { name: 'Trousers', draw: (f, P) => drawBottom(f, P, 'trousers') },
    shorts: { name: 'Shorts', draw: (f, P) => drawBottom(f, P, 'shorts') },
    skirt: { name: 'Skirt', draw: (f, P) => drawBottom(f, P, 'skirt') },
  },
  shoes: {
    boots: { name: 'Boots', draw: (f, P) => drawShoes(f, P, true) },
    shoes: { name: 'Shoes', draw: (f, P) => drawShoes(f, P, false) },
  },
  head: {
    cap: { name: 'Cap', draw: (f, P) => drawHat(f, P, 'cap') },
    bandana: { name: 'Bandana', draw: (f, P) => drawHat(f, P, 'bandana') },
    wizard: { name: 'Wizard hat', draw: (f, P) => drawHat(f, P, 'wizard') },
    crown: { name: 'Crown', draw: (f, P) => drawHat(f, P, 'crown') },
  },
  face: {
    beard: { name: 'Beard', adult: true, draw: (f, P) => drawFace(f, P, 'beard') },
    mustache: { name: 'Mustache', adult: true, draw: (f, P) => drawFace(f, P, 'mustache') },
    glasses: { name: 'Glasses', draw: (f, P) => drawFace(f, P, 'glasses') },
  },
  acc: {
    scarf: { name: 'Scarf', draw: (f, P) => drawAcc(f, P, 'scarf') },
    belt: { name: 'Belt', draw: (f, P) => drawAcc(f, P, 'belt') },
  },
  rear: {
    cape: { name: 'Cape', draw: (f, P) => drawRear(f, P, 'cape') },
    backpack: { name: 'Backpack', draw: (f, P) => drawRear(f, P, 'backpack') },
  },
};

function drawEyes(f, P, size) {
  if (P.view === 'up') return;
  const H = P.head, E = P.body.eye, s = f.s;
  const h = E.h * size, y0 = H.cy + 0.35 + (E.h - h) * 0.6;
  const list = P.view === 'side' ? [H.cx + H.rx * 0.5] : [H.cx - E.dx, H.cx + E.dx];
  const w = P.view === 'side' ? E.w * 0.8 : E.w;
  for (const cx of list) {
    const x0 = cx - w / 2;
    // Iris (takes the eye colour), dark top row (lid), white glint.
    f.paint(rect(x0, y0, x0 + w, y0 + h), [x0, y0, x0 + w, y0 + h], { flat: true, noEdge: true });
    const px0 = Math.floor(x0 * s), py0 = Math.floor(y0 * s), pw = Math.max(1, Math.round(w * s)), ph = Math.max(1, Math.round(h * s));
    for (let x = px0; x < px0 + pw; x++) f.put(x, py0, G.out);
    if (ph > 1 && s >= 2) for (let y = py0 + ph - 1, x = px0; x < px0 + pw; x++) f.put(x, y, G.deep);
    if (s >= 2 && ph > 2) f.put(cx < H.cx ? px0 + pw - 1 : px0, py0 + 1, G.white);
    if (E.lashes && s >= 2) f.put(cx < H.cx || P.view === 'side' ? (P.view === 'side' ? px0 + pw : px0 - 1) : px0 + pw, py0, G.out);
  }
}

function drawHair(f, P, style) {
  const H = P.head, side = P.view === 'side', up = P.view === 'up';
  const cap = ell(H.cx, H.cy - 0.3, H.rx + 0.35, H.ry + 0.32);
  const fringe = (x) => H.cy - 1.0 + 0.45 * Math.sin((x - H.cx) * 2.3);
  let shape;
  if (up) shape = and(ell(H.cx, H.cy - 0.2, H.rx + 0.35, H.ry + 0.35), (x, y) => y < H.cy + H.ry * 0.72);
  else if (side) shape = and(cap, (x, y) => y < H.cy + H.ry * 0.78, (x, y) => y < fringe(x) || x < H.cx - 0.3 + (y - H.cy) * -0.15);
  else shape = and(cap, (x, y) => y < fringe(x) || (Math.abs(x - H.cx) > H.rx * 0.76 && y < H.cy + 1.0));
  const extra = [];
  if (style === 'spiky') {
    const top = H.cy - H.ry - 0.2;
    for (let i = -2; i <= 2; i++) {
      const x = H.cx + i * 1.7 + (side ? -0.6 : 0);
      extra.push(tri(x - 1.1, top + 1.6 + Math.abs(i) * 0.5, x + 1.1, top + 1.6 + Math.abs(i) * 0.5, x + (side ? -0.6 : i * 0.3), top - 1.1 + Math.abs(i) * 0.6));
    }
  }
  const len = style === 'long' ? 4.6 : style === 'bob' ? 1.6 : 0;
  if (len) {
    const yb = H.cy + H.ry * 0.5 + len;
    if (up) extra.push(and(rect(H.cx - H.rx - 0.35, H.cy - 0.5, H.cx + H.rx + 0.35, yb), (x, y) => y < yb - Math.max(0, Math.abs(x - H.cx) - H.rx + 1.2) * 0.8));
    else if (side) extra.push(and(rect(H.cx - H.rx - 0.45, H.cy - 1, H.cx + 0.2, yb), (x, y) => y < yb - Math.max(0, x - (H.cx - 1.2)) * 1.2));
    else for (const s of [-1, 1]) extra.push(rect(s < 0 ? H.cx - H.rx - 0.45 : H.cx + H.rx * 0.62, H.cy - 1.4, s < 0 ? H.cx - H.rx * 0.62 : H.cx + H.rx + 0.45, yb));
  }
  if (style === 'ponytail') {
    if (up) extra.push(capsule([H.cx, H.cy + 0.6], [H.cx + 0.3, H.cy + H.ry + 3.6], 1.15));
    else if (side) extra.push(capsule([H.cx - H.rx + 0.2, H.cy - 0.8], [H.cx - H.rx - 1.5, H.cy + 3.4], 1.1));
  }
  if (style === 'buns') {
    if (side) extra.push(ell(H.cx - 0.6, H.cy - H.ry - 0.4, 1.6, 1.4));
    else for (const s of [-1, 1]) extra.push(ell(H.cx + s * (H.rx - 0.7), H.cy - H.ry + 0.3, 1.6, 1.5));
  }
  const box = [H.cx - H.rx, H.cy - H.ry - 1, H.cx + H.rx, H.cy + H.ry];
  if (len) {
    // Long hair hangs behind the cap of hair: paint it first.
    for (const e of extra) f.paint(e, [box[0], H.cy, box[2], H.cy + H.ry + len], { shade: 0.15, noEdge: true });
    f.paint(shape, box, { noEdge: true });
  } else {
    f.paint(shape, box, { noEdge: true });
    for (const e of extra) f.paint(e, box, { shade: -0.1 });
  }
  // Strands: a few darker lines through the hair (bigger sizes only).
  if (f.s >= 2) {
    for (let px = 0; px < f.w; px++) for (let py = 0; py < f.h; py++) {
      const c = f.at(px, py);
      if (c !== G.base) continue;
      const ux = (px + 0.5) / f.s;
      if (Math.abs(((ux - H.cx) * 1.3) % 2.6) < 0.18 && (py + px) % 5 !== 0) f.put(px, py, G.dark);
    }
  }
  f.outline();
}

function drawTop(f, P, style) {
  const T = P.torso, side = P.view === 'side';
  const L = P.body.leg;
  const longSleeve = style === 'shirt' || style === 'robe';
  const sleeveEnd = longSleeve ? 0.8 : 0.42;
  const wide = style === 'robe' ? 0.45 : 0.25;
  // Far sleeve, then the body of the garment, then the near sleeves.
  for (const a of P.arms.filter((a) => a.far)) f.paint(capsule(a.p0, a.p1, a.r + wide, -0.2, sleeveEnd), limbBox(a), { shade: 0.5 });
  const hem = style === 'tunic' ? T.y1 + 1.3 : style === 'shirt' ? T.y1 + 0.4 : T.y1 - 0.4;
  let bodyShape = torsoShape(T, 0.28, T.y0 - 0.15, hem);
  if (style === 'tunic') bodyShape = or(bodyShape, trap(T.cx, T.y1 - 0.5, hem, T.bot + 0.3, T.bot + 0.7));
  if (style === 'dress' || style === 'robe') {
    const yb = style === 'dress' ? L.y0 + (L.y1 - L.y0) * 0.6 : L.y1 + 0.35;
    const flare = style === 'dress' ? 1.6 : 1.1;
    bodyShape = or(bodyShape, trap(T.cx, T.y1 - 1.2, yb, T.bot + 0.25, T.bot + (side ? flare * 0.7 : flare)));
  }
  // Neckline: a V for the tunic, round for the rest (front view only).
  if (P.view === 'down') {
    const N = P.neck;
    const neck = style === 'tunic' ? tri(T.cx - 1.2, T.y0 - 0.2, T.cx + 1.2, T.y0 - 0.2, T.cx, T.y0 + 1.6) : ell(T.cx, T.y0 - 0.1, N.hw + 0.35, 0.75);
    bodyShape = and(bodyShape, not(neck));
  }
  const yb = style === 'robe' ? L.y1 : hem;
  f.paint(bodyShape, [T.cx - T.top, T.y0, T.cx + T.top, yb]);
  if (style === 'tunic' && f.s >= 2) f.paint(rect(T.cx - T.bot - 0.6, T.y1 - 0.1, T.cx + T.bot + 0.6, T.y1 + 0.45), [0, 0, 1, 1], { color: G.deep, noEdge: true });
  for (const a of P.arms.filter((a) => !a.far)) {
    f.paint(capsule(a.p0, a.p1, a.r + wide, -0.2, sleeveEnd), limbBox(a));
    if (longSleeve && f.s >= 2) f.paint(capsule(a.p0, a.p1, a.r + wide, sleeveEnd - 0.08, sleeveEnd), limbBox(a), { color: G.dark, noEdge: true });
  }
  f.outline();
}

function drawBottom(f, P, style) {
  const T = P.torso, L = P.body.leg;
  const hips = trap(T.cx, T.y1 - 1.3, L.y0 + 1.1, T.bot + 0.22, T.bot + 0.3);
  const end = style === 'shorts' ? 0.45 : 0.92;
  for (const l of P.legs.filter((l) => l.far)) if (style !== 'skirt') f.paint(capsule(l.p0, l.p1, l.r + 0.2, -0.3, end), limbBox(l), { shade: 0.5 });
  f.paint(hips, torsoBox(T, T.y1 - 1.3, L.y0 + 1.1), { noEdge: true });
  if (style === 'skirt') {
    const yb = L.y0 + (L.y1 - L.y0) * 0.55;
    f.paint(trap(T.cx, T.y1 - 1.0, yb, T.bot + 0.25, T.bot + (P.view === 'side' ? 1.0 : 1.4)), [T.cx - T.bot - 1.4, T.y1 - 1, T.cx + T.bot + 1.4, yb]);
  } else for (const l of P.legs.filter((l) => !l.far)) f.paint(capsule(l.p0, l.p1, l.r + 0.2, -0.3, end), limbBox(l));
  f.outline();
}

function drawShoes(f, P, boots) {
  P.legs.forEach((l, i) => {
    const ft = P.feet[i], far = l.far ? 0.5 : 0;
    if (boots) f.paint(capsule(l.p0, l.p1, l.r + 0.22, 0.68, 1.05), limbBox(l), { shade: far });
    f.paint(rect(ft.x0 - 0.15, ft.y0, ft.x1 + 0.15, ft.y1 + 0.05), [ft.x0, ft.y0, ft.x1, ft.y1], { shade: far });
  });
  f.outline();
}

function drawHat(f, P, style) {
  const H = P.head, side = P.view === 'side', up = P.view === 'up';
  const box = [H.cx - H.rx, H.cy - H.ry - 1, H.cx + H.rx, H.cy];
  if (style === 'cap') {
    f.paint(and(ell(H.cx, H.cy - 0.5, H.rx + 0.45, H.ry + 0.3), (x, y) => y < H.cy - 1.15), box);
    if (side) f.paint(rect(H.cx + 0.5, H.cy - 1.5, H.cx + H.rx + 1.6, H.cy - 0.9), box, { shade: 0.3 });
    else if (!up) f.paint(rect(H.cx - H.rx * 0.8, H.cy - 1.55, H.cx + H.rx * 0.8, H.cy - 0.95), box, { shade: 0.3 });
  } else if (style === 'bandana') {
    f.paint(and(ell(H.cx, H.cy - 0.3, H.rx + 0.4, H.ry + 0.35), (x, y) => y > H.cy - 2.4 && y < H.cy - 1.1), box);
    if (up || side) f.paint(capsule([H.cx - (side ? H.rx : 0), H.cy - 1.6], [H.cx - (side ? H.rx + 1.2 : -0.6), H.cy + 0.9], 0.55), box, { shade: 0.3 });
  } else if (style === 'wizard') {
    const by = H.cy - H.ry * 0.5;
    f.paint(tri(H.cx - H.rx * 0.75, by, H.cx + H.rx * 0.75, by, H.cx + (side ? -1.2 : 1.4), Math.max(0.2, by - 6)), [H.cx - H.rx, by - 6, H.cx + H.rx, by]);
    f.paint(ell(H.cx, by, H.rx + 1.9, side ? 0.75 : 1.0), [H.cx - H.rx - 2, by - 1, H.cx + H.rx + 2, by + 1], { shade: 0.2 });
  } else if (style === 'crown') {
    const y1 = H.cy - H.ry + 1.6, y0 = y1 - 1.1;
    const hw = side ? H.rx * 0.75 : H.rx * 0.85;
    let s = rect(H.cx - hw, y0, H.cx + hw, y1);
    for (const i of side ? [-1, 1] : [-1, 0, 1]) s = or(s, tri(H.cx + i * hw * 0.7 - 0.8, y0 + 0.1, H.cx + i * hw * 0.7 + 0.8, y0 + 0.1, H.cx + i * hw * 0.7, y0 - 1.5));
    f.paint(s, [H.cx - hw, y0 - 1.5, H.cx + hw, y1]);
    if (!up) f.dot(H.cx, y0 + 0.5, '#d4483b');
  }
  f.outline();
}

function drawFace(f, P, style) {
  const H = P.head, side = P.view === 'side';
  if (P.view === 'up' && style !== 'beard') return;
  if (style === 'beard') {
    if (P.view === 'up') return;
    const s = side ? and(ell(H.cx, H.cy + 0.4, H.rx + 0.3, H.ry + 0.6), (x, y) => y > H.cy + 0.8 && x > H.cx - 1.1)
      : and(ell(H.cx, H.cy + 0.6, H.rx + 0.3, H.ry + 0.7), (x, y) => y > H.cy + 2.4 || (Math.abs(x - H.cx) > H.rx * 0.72 && y > H.cy - 0.2));
    f.paint(s, [H.cx - H.rx, H.cy, H.cx + H.rx, H.cy + H.ry + 1], { shade: 0.1, noEdge: true });
    f.outline();
    if (!side && f.s >= 2) f.paint(rect(H.cx - 0.9, H.cy + 2.5, H.cx + 0.9, H.cy + 3.0), [0, 0, 1, 1], { color: G.out, noEdge: true });
  } else if (style === 'mustache') {
    const s = side ? rect(H.cx + H.rx - 1.4, H.cy + 1.9, H.cx + H.rx + 0.3, H.cy + 2.6) : and(rect(H.cx - 1.8, H.cy + 1.8, H.cx + 1.8, H.cy + 2.6), (x, y) => !(Math.abs(x - H.cx) < 0.3 && y < H.cy + 2.1));
    f.paint(s, [H.cx - 2, H.cy + 1.8, H.cx + 2, H.cy + 2.6], { flat: true, noEdge: true });
    f.outline();
  } else if (style === 'glasses') {
    const E = P.body.eye, y0 = H.cy + 0.05, y1 = y0 + 2.2;
    const lens = (cx) => { const w = 1.25; return { o: rect(cx - w, y0, cx + w, y1), i: rect(cx - w + 0.5, y0 + 0.5, cx + w - 0.5, y1 - 0.5) }; };
    const centers = side ? [H.cx + H.rx * 0.5] : [H.cx - E.dx, H.cx + E.dx];
    for (const cx of centers) {
      const l = lens(cx);
      f.paint(and(l.o, not(l.i)), [0, 0, 1, 1], { color: G.deep, noEdge: true });
      f.paint(l.i, [0, 0, 1, 1], { color: '#ffffff70', noEdge: true });
    }
    if (side) f.paint(rect(H.cx - 0.6, y0 + 0.4, H.cx + H.rx * 0.5 - 1.2, y0 + 0.95), [0, 0, 1, 1], { color: G.deep, noEdge: true });
    else f.paint(rect(H.cx - E.dx + 1.2, y0 + 0.5, H.cx + E.dx - 1.2, y0 + 1.0), [0, 0, 1, 1], { color: G.deep, noEdge: true });
  }
}

function drawAcc(f, P, style) {
  const T = P.torso, N = P.neck;
  if (style === 'scarf') {
    f.paint(ell(T.cx, N.y1 - 0.15, T.top * 0.78, 1.0), [T.cx - T.top, N.y1 - 1, T.cx + T.top, N.y1 + 1]);
    if (P.view === 'down') f.paint(rect(T.cx + 0.5, N.y1, T.cx + 1.7, N.y1 + 3.0), [T.cx, N.y1, T.cx + 2, N.y1 + 3], { shade: 0.2 });
    else if (P.view === 'side') f.paint(capsule([T.cx - 0.8, N.y1], [T.cx - 2.4, N.y1 + 2.2], 0.6), [T.cx - 3, N.y1, T.cx, N.y1 + 3], { shade: 0.2 });
    f.outline();
  } else if (style === 'belt') {
    const y0 = T.y1 - 0.75, y1 = T.y1 + 0.15;
    f.paint(trap(T.cx, y0, y1, T.bot + 0.35, T.bot + 0.4), [T.cx - T.bot, y0, T.cx + T.bot, y1], { flat: true, noEdge: true });
    f.outline();
    if (P.view !== 'up') {
      const bx = P.view === 'side' ? T.cx + T.bot - 0.4 : T.cx;
      f.paint(rect(bx - 0.6, y0 - 0.05, bx + 0.6, y1 + 0.05), [bx - 0.6, y0, bx + 0.6, y1], { ramp: ['#ffe9a0', '#e2b84a', '#a8782a'] });
    }
  }
}

function drawRear(f, P, style) {
  const T = P.torso, L = P.body.leg, side = P.view === 'side', up = P.view === 'up';
  if (style === 'cape') {
    const yb = L.y1 - 0.6;
    const s = side ? and(trap(T.cx - 1.2, T.y0 + 0.2, yb, 0.9, 2.0), (x) => x < T.cx + 0.2) : trap(T.cx, T.y0 + 0.1, yb, T.top + 0.5, T.top + 1.6);
    f.paint(s, [T.cx - T.top - 1.6, T.y0, T.cx + T.top + 1.6, yb], { shade: up ? 0 : 0.35 });
    if (up && f.s >= 2) f.paint(rect(T.cx - T.top * 0.8, T.y0 - 0.2, T.cx + T.top * 0.8, T.y0 + 0.6), [0, 0, 1, 1], { color: G.dark, noEdge: true });
    f.outline();
  } else if (style === 'backpack') {
    if (up) f.paint(rect(T.cx - 2.3, T.y0 + 0.5, T.cx + 2.3, T.y1 - 0.2), [T.cx - 2.3, T.y0, T.cx + 2.3, T.y1]);
    else if (side) f.paint(rect(T.cx - T.top - 2.1, T.y0 + 0.4, T.cx - T.top + 0.4, T.y1 - 0.4), [T.cx - T.top - 2, T.y0, T.cx, T.y1]);
    else f.paint(rect(T.cx - T.top - 0.5, T.y0 - 0.9, T.cx + T.top + 0.5, T.y1 - 0.8), [T.cx - T.top, T.y0, T.cx + T.top, T.y1], { shade: 0.3 });
    if (up && f.s >= 2) f.paint(rect(T.cx - 2.3, T.y0 + 0.5, T.cx + 2.3, T.y0 + 2.2), [T.cx - 2.3, T.y0, T.cx + 2.3, T.y0 + 2.2], { shade: -0.2 });
    f.outline();
  }
}

/** Draw one starter part as a full sheet (3 × 4 frames) at frame size fw × fh. */
function drawStarter(bodyId, cat, style, fw, fh) {
  const def = DRAW[cat]?.[style];
  const c = document.createElement('canvas');
  c.width = fw * 3; c.height = fh * 4;
  if (!def) return c;
  const g = c.getContext('2d');
  const s = fh / 24;
  for (const [row, view] of [[0, 'down'], [2, 'side'], [3, 'up']]) {
    for (let col = 0; col < 3; col++) {
      const f = new Frame(fw, fh, s);
      def.draw(f, pose(bodyId, view, col));
      g.putImageData(f.toImageData(), col * fw, row * fh);
    }
  }
  // Facing left = facing right, mirrored (frame by frame, so the step order stays the same).
  for (let col = 0; col < 3; col++) {
    g.save(); g.translate((col + 1) * fw, fh); g.scale(-1, 1);
    g.drawImage(c, col * fw, 2 * fh, fw, fh, 0, 0, fw, fh);
    g.restore();
  }
  return c;
}

/** The starter list for a body: [{cat, style, name}] (beards and mustaches only for grown-ups). */
function starterList(bodyId) {
  const out = [];
  for (const [cat, styles] of Object.entries(DRAW)) for (const [style, d] of Object.entries(styles)) {
    if (d.adult && bodyId === 'kid') continue;
    out.push({ cat, style, name: d.name });
  }
  return out;
}

/** A guide sheet for drawing your own parts: the body at low opacity with each frame's box marked. */
function templateGuide(bodyId, fw, fh) {
  const c = document.createElement('canvas');
  c.width = fw * 3; c.height = fh * 4;
  const g = c.getContext('2d');
  g.globalAlpha = 0.4;
  g.drawImage(drawStarter(bodyId, 'body', 'base', fw, fh), 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255, 64, 160, 0.55)';
  for (let r = 0; r < 4; r++) for (let col = 0; col < 3; col++) {
    const x = col * fw, y = r * fh;
    g.fillRect(x, y, fw, 1); g.fillRect(x, y, 1, fh);
  }
  g.fillRect(0, fh * 4 - 1, fw * 3, 1); g.fillRect(fw * 3 - 1, 0, 1, fh * 4);
  return c;
}
