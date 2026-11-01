/**
 * Window themes: the look of every menu, text box, battle panel and the HUD, swapped in one go. Ember is the
 * engine's own look; the others are drawn here in code (frames with carved or forged corners, parchment, wood grain,
 * stone, marble, riveted metal) and laid over the usual styles, so the game stays self-contained and works offline.
 * The Database sets the game's theme (Title & menus); players can pick another in Settings.
 */
import './themeFonts.css';

export type UiThemeId = 'ember' | 'parchment' | 'wood' | 'dwarven' | 'elvish' | 'titan' | 'retro';

export const UI_THEMES: { id: UiThemeId; name: string; note: string }[] = [
  { id: 'ember', name: 'Ember', note: 'Dark glass and warm gold (the original look).' },
  { id: 'parchment', name: 'Medieval parchment', note: 'Aged paper, ink-brown text, wax-red highlights.' },
  { id: 'wood', name: 'Medieval wood', note: 'Dark oak panels, iron brackets, brass trim.' },
  { id: 'dwarven', name: 'Dwarven', note: 'Grey stone slabs, carved rune borders, griffin end caps.' },
  { id: 'elvish', name: 'Elvish', note: 'White and gold marble, emerald and sapphire gems, leafy filigree.' },
  { id: 'titan', name: 'Titan', note: 'Black patchwork metal, rivets, glowing red veins.' },
  { id: 'retro', name: 'RetroMon', note: 'Handheld-era windows: white panels, dark pixel text, a double black border.' },
];

interface ThemeLook {
  /** Light backgrounds need dark text everywhere. */
  light: boolean;
  ink: string; muted: string; accent: string; accentInk: string;
  /** Selected tabs and items. */
  sel: string; selInk: string;
  title: string;
  /** The frame's nine-slice (border-image) and the panel fill. */
  frame: (g: CanvasRenderingContext2D, s: number) => void;
  fill: (g: CanvasRenderingContext2D, w: number, h: number) => void;
  fillColor: string;
  /** Border widths: big windows and small HUD panels. */
  border: number; small: number;
  glow?: string;
}

/* ------------------------------------------------------------------ drawing helpers */

function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
function speckle(g: CanvasRenderingContext2D, w: number, h: number, colors: string[], n: number, size: [number, number], seed: number): void {
  const R = rand(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = colors[Math.floor(R() * colors.length)]; const s = size[0] + R() * (size[1] - size[0]); g.globalAlpha = 0.25 + R() * 0.5; g.fillRect(R() * w, R() * h, s, s); }
  g.globalAlpha = 1;
}
/** Draw the four corners of a frame by drawing one (top-left) and mirroring it. */
function corners(g: CanvasRenderingContext2D, s: number, draw: (g: CanvasRenderingContext2D) => void): void {
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    g.save(); g.translate(sx > 0 ? 0 : s, sy > 0 ? 0 : s); g.scale(sx, sy); draw(g); g.restore();
  }
}
/** The straight edges between corners (a band along all four sides). */
function band(g: CanvasRenderingContext2D, s: number, width: number, style: string | CanvasGradient | CanvasPattern): void {
  g.fillStyle = style;
  g.fillRect(0, 0, s, width); g.fillRect(0, s - width, s, width); g.fillRect(0, 0, width, s); g.fillRect(s - width, 0, width, s);
}

/* ------------------------------------------------------------------ the themes */

const LOOKS: Record<Exclude<UiThemeId, 'ember'>, ThemeLook> = {
  // Handheld-era windows: plain white, dark text, a thick black line with a thin one inside it, a ▶ on the choice.
  retro: {
    light: true, ink: '#181818', muted: '#585858', accent: '#d83828', accentInk: '#ffffff', sel: '#dcdcd4', selInk: '#181818',
    title: 'var(--f-display)', fillColor: '#f8f8f0', border: 10, small: 8,
    fill: (g, w, h) => { g.fillStyle = '#f8f8f0'; g.fillRect(0, 0, w, h); },
    frame: (g, s) => {
      g.fillStyle = '#f8f8f0'; g.fillRect(0, 0, s, s);
      // The thick outer line (corners cut a step, for a rounded pixel look), a white gap, the thin inner line.
      band(g, s, 7, '#202830');
      g.clearRect(0, 0, 3, 3); g.clearRect(s - 3, 0, 3, 3); g.clearRect(0, s - 3, 3, 3); g.clearRect(s - 3, s - 3, 3, 3);
      g.fillStyle = '#202830'; for (const [x, y] of [[3, 3], [s - 6, 3], [3, s - 6], [s - 6, s - 6]]) g.fillRect(x, y, 3, 3);
      g.fillStyle = '#5868a0'; g.fillRect(12, 12, s - 24, 3); g.fillRect(12, s - 15, s - 24, 3); g.fillRect(12, 12, 3, s - 24); g.fillRect(s - 15, 12, 3, s - 24);
    },
  },
  parchment: {
    light: true, ink: '#3a2716', muted: '#7a5c3c', accent: '#9b2a1c', accentInk: '#fff3dc', sel: 'linear-gradient(#b13a26, #7d1d12)', selInk: '#fff1d8',
    title: '"Almendra", Georgia, serif', fillColor: '#e8d6ad', border: 14, small: 9,
    fill: (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.75);
      gr.addColorStop(0, '#f1e2bd'); gr.addColorStop(1, '#d9c08c');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      speckle(g, w, h, ['#b89a62', '#c8ab73', '#a0804e', '#f7ecd0'], 900, [1, 3], 11);
      // Fibres.
      const R = rand(5); g.strokeStyle = 'rgba(140,110,60,0.18)'; g.lineWidth = 1;
      for (let i = 0; i < 70; i++) { const x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 6); g.stroke(); }
    },
    frame: (g, s) => {
      // Burnt, darkened edge with a ruled ink line, and a little flourish in each corner.
      const gr = g.createLinearGradient(0, 0, 0, 14); gr.addColorStop(0, '#6b4524'); gr.addColorStop(1, '#c9a86e');
      band(g, s, 14, '#b9935c');
      g.fillStyle = '#7a5530'; g.fillRect(0, 0, s, 3); g.fillRect(0, s - 3, s, 3); g.fillRect(0, 0, 3, s); g.fillRect(s - 3, 0, 3, s);
      g.strokeStyle = '#4a2e18'; g.lineWidth = 1.5; g.strokeRect(9.5, 9.5, s - 19, s - 19);
      corners(g, s, (c) => { c.strokeStyle = '#4a2e18'; c.lineWidth = 1.6; c.beginPath(); c.arc(9.5, 9.5, 5, 0, Math.PI * 1.5); c.stroke(); c.fillStyle = '#9b2a1c'; c.beginPath(); c.arc(9.5, 9.5, 2.2, 0, Math.PI * 2); c.fill(); });
    },
  },
  wood: {
    light: false, ink: '#f2e4c8', muted: '#c4a77e', accent: '#e0b356', accentInk: '#2a1606', sel: 'linear-gradient(#e8c26a, #b8862e)', selInk: '#2a1606',
    title: '"MedievalSharp", Georgia, serif', fillColor: '#3a2414', border: 18, small: 11,
    fill: (g, w, h) => {
      g.fillStyle = '#3d2615'; g.fillRect(0, 0, w, h);
      // Planks with grain.
      const R = rand(7);
      for (let y = 0; y < h; y += 32) {
        g.fillStyle = `hsl(25, 42%, ${16 + R() * 6}%)`; g.fillRect(0, y, w, 31);
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y + 31, w, 1);
        g.strokeStyle = 'rgba(255,220,170,0.05)';
        for (let k = 0; k < 7; k++) { g.beginPath(); const yy = y + 3 + R() * 26; g.moveTo(0, yy); for (let x = 0; x <= w; x += 16) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 2); g.stroke(); }
      }
    },
    frame: (g, s) => {
      const gr = g.createLinearGradient(0, 0, 16, 0); gr.addColorStop(0, '#2a180b'); gr.addColorStop(0.5, '#5b391e'); gr.addColorStop(1, '#2a180b');
      band(g, s, 18, gr);
      g.fillStyle = gr; g.fillRect(0, 0, s, 18);
      g.strokeStyle = '#d4a548'; g.lineWidth = 2.5; g.strokeRect(14, 14, s - 28, s - 28);
      g.strokeStyle = '#1a0e06'; g.lineWidth = 2; g.strokeRect(1, 1, s - 2, s - 2);
      // Iron corner brackets with rivets.
      corners(g, s, (c) => {
        c.fillStyle = '#2b2b30'; c.beginPath(); c.moveTo(0, 0); c.lineTo(26, 0); c.lineTo(26, 9); c.lineTo(9, 9); c.lineTo(9, 26); c.lineTo(0, 26); c.closePath(); c.fill();
        c.strokeStyle = '#6a6a72'; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#9a9aa4'; for (const [x, y] of [[3.5, 3.5], [16, 3.5], [3.5, 16]]) { c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill(); }
      });
    },
  },
  dwarven: {
    light: false, ink: '#e8e6e0', muted: '#a7a7a2', accent: '#7fd0ff', accentInk: '#0a1620', sel: 'linear-gradient(#6a7480, #3e454d)', selInk: '#e8f6ff',
    title: '"Metamorphous", Georgia, serif', fillColor: '#3a3b3f', border: 18, small: 10, glow: 'rgba(127,208,255,0.35)',
    fill: (g, w, h) => {
      g.fillStyle = '#3c3d42'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, ['#2c2d31', '#4a4b51', '#55565c', '#303136'], 1600, [1, 4], 21);
      // Slab seams.
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
      for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 64) % 2 ? 48 : 0; x < w; x += 96) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
    },
    frame: (g, s) => {
      band(g, s, 18, '#55565c');
      g.fillStyle = '#2a2b2f'; g.fillRect(0, 0, s, 2); g.fillRect(0, s - 2, s, 2); g.fillRect(0, 0, 2, s); g.fillRect(s - 2, 0, 2, s);
      g.strokeStyle = '#1e1f22'; g.lineWidth = 2; g.strokeRect(15, 15, s - 30, s - 30);
      // Runes carved into the band, faintly glowing.
      g.strokeStyle = 'rgba(127,208,255,0.55)'; g.lineWidth = 1.2;
      const rune = (x: number, y: number, k: number) => { g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y + 4); if (k % 2) { g.moveTo(x, y - 4); g.lineTo(x + 3, y - 1); } else { g.moveTo(x - 3, y); g.lineTo(x + 3, y + 2); } g.stroke(); };
      for (let i = 0; i < 2; i++) { rune(s / 2 - 4 + i * 8, 9, i); rune(s / 2 - 4 + i * 8, s - 9, i + 1); rune(9, s / 2 - 4 + i * 8, i); rune(s - 9, s / 2 - 4 + i * 8, i + 1); }
      // Griffin-head end caps: a heavy carved knot in each corner.
      corners(g, s, (c) => {
        c.fillStyle = '#6b6c72'; c.beginPath(); c.moveTo(0, 0); c.lineTo(26, 0); c.quadraticCurveTo(20, 8, 14, 10); c.quadraticCurveTo(10, 14, 10, 26); c.lineTo(0, 26); c.closePath(); c.fill();
        c.strokeStyle = '#2a2b2f'; c.lineWidth = 1.5; c.stroke();
        c.fillStyle = '#c9a24a'; c.beginPath(); c.arc(8, 8, 3, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#2a2b2f'; c.beginPath(); c.moveTo(14, 4); c.lineTo(20, 6); c.moveTo(4, 14); c.lineTo(6, 20); c.stroke();
      });
    },
  },
  elvish: {
    light: true, ink: '#1f3346', muted: '#5a6f80', accent: '#1f8a6a', accentInk: '#f4fff9', sel: 'linear-gradient(#2a9d7a, #1b6e8a)', selInk: '#f4fffb',
    title: '"Cinzel", Georgia, serif', fillColor: '#eef0f2', border: 16, small: 9, glow: 'rgba(214,178,94,0.45)',
    fill: (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#f6f7f8'); gr.addColorStop(1, '#e2e6ea');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // Marble veins.
      const R = rand(31);
      for (let k = 0; k < 9; k++) {
        g.strokeStyle = `rgba(${150 + R() * 40},${160 + R() * 40},${175 + R() * 40},${0.25 + R() * 0.3})`; g.lineWidth = 0.6 + R() * 1.6;
        let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y);
        for (let i = 0; i < 14; i++) { x += (R() - 0.3) * 30; y += (R() - 0.5) * 24; g.lineTo(x, y); }
        g.stroke();
      }
    },
    frame: (g, s) => {
      const gold = g.createLinearGradient(0, 0, s, s); gold.addColorStop(0, '#f3dc9a'); gold.addColorStop(0.5, '#c79a3a'); gold.addColorStop(1, '#f0d488');
      band(g, s, 16, gold);
      g.fillStyle = '#f7f8f9'; g.fillRect(4, 4, s - 8, 2); g.fillRect(4, s - 6, s - 8, 2); g.fillRect(4, 4, 2, s - 8); g.fillRect(s - 6, 4, 2, s - 8);
      g.strokeStyle = '#8a6420'; g.lineWidth = 1; g.strokeRect(12.5, 12.5, s - 25, s - 25);
      // Leaf filigree and a gem in each corner (emerald top, sapphire bottom).
      corners(g, s, (c) => {
        c.strokeStyle = '#7a5a1c'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(14, 4); c.quadraticCurveTo(22, 2, 26, 8); c.moveTo(4, 14); c.quadraticCurveTo(2, 22, 8, 26); c.stroke();
        c.fillStyle = '#3ea86f'; c.beginPath(); c.ellipse(20, 6, 3.4, 1.6, -0.3, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(6, 20, 1.6, 3.4, -0.3, 0, Math.PI * 2); c.fill();
      });
      for (const [x, y, col] of [[8, 8, '#1fae7a'], [s - 8, 8, '#1fae7a'], [8, s - 8, '#2a6fd0'], [s - 8, s - 8, '#2a6fd0']] as [number, number, string][]) {
        const gg = g.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5); gg.addColorStop(0, '#e9fff6'); gg.addColorStop(0.35, col); gg.addColorStop(1, '#0d2a3a');
        g.fillStyle = gg; g.beginPath(); g.arc(x, y, 4.6, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#8a6420'; g.lineWidth = 1; g.stroke();
      }
    },
  },
  titan: {
    light: false, ink: '#e6e8ec', muted: '#9097a3', accent: '#ff4a3d', accentInk: '#1a0606', sel: 'linear-gradient(#ff5a46, #a3170f)', selInk: '#fff0ee',
    title: '"Orbitron", ui-monospace, monospace', fillColor: '#15171b', border: 14, small: 9, glow: 'rgba(255,60,40,0.55)',
    fill: (g, w, h) => {
      g.fillStyle = '#15171b'; g.fillRect(0, 0, w, h);
      // Patchwork plates, each a slightly different shade, with rivets and the odd glowing seam.
      const R = rand(41);
      for (let y = 0; y < h; y += 48) for (let x = 0; x < w; x += 64) {
        const pw = 64, ph = 48; g.fillStyle = `hsl(220, 6%, ${8 + R() * 6}%)`; g.fillRect(x + 1, y + 1, pw - 2, ph - 2);
        g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + 1, y + 1, pw - 2, 1);
        g.fillStyle = '#3a3d44'; for (const [rx, ry] of [[5, 5], [pw - 6, 5], [5, ph - 6], [pw - 6, ph - 6]]) g.fillRect(x + rx, y + ry, 2, 2);
        if (R() < 0.18) { g.strokeStyle = 'rgba(255,60,40,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 8, y + ph / 2); g.lineTo(x + pw / 2, y + ph / 2 + (R() - 0.5) * 10); g.lineTo(x + pw - 8, y + ph / 2); g.stroke(); }
      }
    },
    frame: (g, s) => {
      band(g, s, 14, '#24272d');
      g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, s, 2); g.fillRect(0, s - 2, s, 2); g.fillRect(0, 0, 2, s); g.fillRect(s - 2, 0, 2, s);
      // A glowing red vein running round the frame.
      g.strokeStyle = '#ff3b2e'; g.lineWidth = 1.5; g.shadowColor = '#ff3b2e'; g.shadowBlur = 4; g.strokeRect(7.5, 7.5, s - 15, s - 15); g.shadowBlur = 0;
      g.strokeStyle = '#454952'; g.lineWidth = 1; g.strokeRect(12.5, 12.5, s - 25, s - 25);
      corners(g, s, (c) => {
        c.fillStyle = '#3a3e46'; c.beginPath(); c.moveTo(0, 0); c.lineTo(20, 0); c.lineTo(12, 8); c.lineTo(8, 12); c.lineTo(0, 20); c.closePath(); c.fill();
        c.fillStyle = '#ff4a3d'; c.shadowColor = '#ff2a1d'; c.shadowBlur = 5; c.fillRect(4, 4, 3, 3); c.shadowBlur = 0;
      });
    },
  },
};

/* ------------------------------------------------------------------ CSS */

/** Big windows (menus, the pause frame, text boxes, results). */
const FRAMES = ['.pause-shell', '.menu-box', '.inv-box', '.sk-box', '.ctl-box', '.cr-box', '.log-box', '.quest-box', '.mk-box', '.st-box', '.eq-box', '.rec-box', '.sv-box', '.pt-box', '.battle-victory', '.msg-box', '.mk-confirm'];
/** Small HUD and battle panels. */
const SMALL = ['.hud-top', '.hud-side', '.hud-ally', '.hud-gold', '.hud-wslot', '.hud-pslot', '.battle-msg', '.hud-quest', '.dl-card', '.bcmd-tile', '.notice', '.loot-feed .loot', '.ach-pill', '.bstat', '.cs-stats', '.pt-card', '.ip-card', '.mk-choice', '.mk-row', '.mk-slot', '.hud-xp', '.pb', '.pocket-text', '.pt-stats', '.layout-pocket .battle-cmd.bar', '.pp-col', '.pc-actions', '.pc-swap', '.pr-slot', '.pr-msg', '.pr-menu', '.ip-pop-box'];
/** Windows inside the pause frame (it already has one). */
const INNER = ['body.pause-open .inv > .inv-box', 'body.pause-open .menu > .menu-box', 'body.pause-open .inv > *'];

function canvasURL(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  return c.toDataURL();
}

/**
 * The player's (or the game's) touches on a theme: how see-through the windows are, their colour, the main text colour
 * and the frame's colour (its coloured lines and gems take that hue: Titan's red veins turned blue, say).
 */
export interface WindowStyle { opacity?: number; color?: string; text?: string; accent?: string }

const hexRgb = (h: string): [number, number, number] => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (h: string, a: number) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${Math.round(a * 100) / 100})`; };

/** RGB (0 … 255) to hue (0 … 1), saturation and lightness, and back. */
function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function rgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** A frame redrawn in another colour: its coloured pixels take the colour's hue (greys and black stay as they are). */
/** `near`: only pixels of about this colour's hue are changed (a texture's coloured bits, not the whole texture). */
function tintFrame(draw: (g: CanvasRenderingContext2D) => void, S: number, accent: string, minSat = 0.18, near?: string): string {
  const nh = near ? hsl(...hexRgb(near))[0] : -1;
  return canvasURL(S, S, (g) => {
    draw(g);
    const [th, ts] = hsl(...hexRgb(accent)), img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const [, s, l] = hsl(d[i], d[i + 1], d[i + 2]);
      if (s < minSat && ts > 0.18) continue;
      if (nh >= 0) { const h0 = hsl(d[i], d[i + 1], d[i + 2])[0], dh = Math.min(Math.abs(h0 - nh), 1 - Math.abs(h0 - nh)); if (dh > 0.06 || l < 0.08) continue; }
      const [r, gg, b] = rgb(th, ts > 0.18 ? Math.max(s, ts * 0.8) : 0, l);
      d[i] = r; d[i + 1] = gg; d[i + 2] = b;
    }
    g.putImageData(img, 0, 0);
  });
}

/** One colour moved to another's hue (greys stay grey). */
function tintHex(hex: string, accent: string): string {
  const [, s, l] = hsl(...hexRgb(hex)), [th, ts] = hsl(...hexRgb(accent));
  if (s < 0.18 || ts < 0.18) return hex;
  const [r, g, b] = rgb(th, Math.max(s, ts * 0.8), l);
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/** The CSS for a window's background with the style's colour and see-through-ness. */
function windowBackground(fillColor: string, fillUrl: string | null, st: WindowStyle): string {
  const op = Math.max(0, Math.min(1, (st.opacity ?? 100) / 100));
  if (op < 1) return `background: ${rgba(st.color || fillColor, op)} !important;`;
  if (st.color && fillUrl) return `background: ${st.color} url(${fillUrl}) repeat !important; background-blend-mode: multiply !important;`;
  if (st.color) return `background: ${st.color} !important;`;
  return fillUrl ? `background: ${fillColor} url(${fillUrl}) repeat !important;` : '';
}

const cache = new Map<string, string>();
function css(id: Exclude<UiThemeId, 'ember'>, style: WindowStyle = {}): string {
  const key = `${id}|${JSON.stringify(style)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const L0 = LOOKS[id], S = 64;
  const L: ThemeLook = { ...L0, ...(style.text ? { ink: style.text } : {}) };
  if (style.accent) {
    // The frame colour runs through the theme: its accent, its selection colours and the coloured bits of its texture.
    L.accent = tintHex(L0.accent, style.accent);
    L.sel = L0.sel.replace(/#[0-9a-f]{6}/gi, (h) => tintHex(h, style.accent!));
    // The selected words stay readable on the new colour: light on a dark selection, dark on a light one.
    const first = L.sel.match(/#([0-9a-f]{6})/i)?.[1];
    if (first) {
      const v = parseInt(first, 16), lum = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
      L.selInk = lum < 0.55 ? '#fffaf0' : '#1a1410';
    }
  }
  // A window colour of its own: the selection is a soft shade of the text instead of the theme's.
  if (style.color) { L.sel = rgba(L.ink, 0.16); L.selInk = L.ink; }
  const frame = style.accent ? tintFrame((g) => L0.frame(g, S), S, style.accent) : canvasURL(S, S, (g) => L0.frame(g, S));
  const fill = style.accent ? tintFrame((g) => L0.fill(g, 256, 256), 256, style.accent, 0.25, L0.accent) : canvasURL(256, 256, (g) => L.fill(g, 256, 256));
  const T = `html[data-ui-theme="${id}"]`;
  const sel = (list: string[]) => list.map((x) => `${T} ${x}`).join(',\n');
  const slice = 28;
  const textSel = ['span', 'b', 'strong', 'small', 'p', 'div', 'label', 'li', 'em', 'i', 'h1', 'h2', 'h3', 'h4', 'kbd', 'button', 'td', 'th', 'output'];
  const out = `
${sel([...FRAMES, ...SMALL])} { --ember: ${L.accent}; --ember-ink: ${L.accentInk}; --ink: ${L.ink}; --muted: ${L.muted}; --window: ${L.fillColor}; --line: ${L.light ? 'rgba(60,40,20,0.22)' : 'rgba(255,255,255,0.14)'}; }
${sel(FRAMES)} {
  ${windowBackground(L.fillColor, fill, style)} background-clip: border-box !important; background-origin: border-box !important;
  border: ${L.border}px solid transparent !important; border-image: url(${frame}) ${slice} / ${L.border}px round !important;
  border-radius: 0 !important; color: ${L.ink} !important; backdrop-filter: none !important;
  box-shadow: 0 14px 40px rgba(0,0,0,0.55)${L.glow ? `, 0 0 18px ${L.glow}` : ''} !important;
}
${sel(SMALL)} {
  ${windowBackground(L.fillColor, fill, style)} background-clip: border-box !important; background-origin: border-box !important;
  border: ${L.small}px solid transparent !important; border-image: url(${frame}) ${slice} / ${L.small}px round !important;
  border-radius: 0 !important; color: ${L.ink} !important; backdrop-filter: none !important;
}
${sel(INNER)} { background: transparent !important; border: 0 !important; border-image: none !important; box-shadow: none !important; }
${T} .msg.tail .msg-box::after { display: none !important; }
/* Text box styles (Database → Text boxes; Update 129): a style's own window colour shows through the theme. */
${T} .msg.looked.look-bg .msg-box { background: var(--look-bg) !important; }
${T} .msg.looked.look-clear .msg-box { background: none !important; border-image: none !important; box-shadow: none !important; }
${T} :is(.menu-title, .battle-result-title, .ps-tab, .bcmd-tile-label, .sk-tab, .tab, .mk-choice b, .dl-name, .hud-level-num, .eq-col-title, .cs-id b, .pc-name) { font-family: ${L.title} !important; letter-spacing: 0.03em; }
${T} :is(.menu-title, .battle-result-title) { color: ${L.accent} !important; font-size: 1.15em; }
${T} :is(.ps-tab, .sk-tab, .menu-item, .bcmd, .mk-btn, .mk-use, .tab)[aria-selected="true"] { background: ${L.sel} !important; color: ${L.selInk} !important; box-shadow: 0 1px 0 rgba(0,0,0,0.4) !important; }
${T} :is(.ps-tab, .sk-tab, .menu-item, .bcmd, .mk-btn, .mk-use, .tab)[aria-selected="true"] * { color: ${L.selInk} !important; }
${T} .bcmd-tile[aria-selected="true"] { filter: drop-shadow(0 0 8px ${L.accent}); }
${T} :is(.pt-card.sel, .ip-card.sel, .mk-row.sel, .mk-slot.sel, .mk-choice[aria-selected="true"], .pr-slot.sel) { outline: 2px solid ${L.accent}; outline-offset: -2px; }
${T} .pr-slot.target { outline: 2px dashed ${L.accent}; outline-offset: -2px; }
${T} .hud-minimap { border-color: ${L.accent} !important; }
/* The condensed HUD (stats on the party cards) leaves the top panel empty: no window drawn for it. */
${T} .hud-top.hud-compact { background: none !important; border: 0 !important; border-image: none !important; box-shadow: none !important; }
/* Pocket Handheld: the command words aren't windows of their own; the chosen one gets a ▶ and a soft box. */
${T} .layout-pocket .bcmd-tile { border: 0 !important; border-image: none !important; background: none !important; filter: none !important; }
${T} .layout-pocket .bcmd-tile[aria-selected="true"] { background: ${L.light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'} !important; }
${T} .layout-pocket .bcmd-tile[aria-selected="true"]::before, ${T} .pocket-text .pt-next { color: ${L.ink} !important; }
${T} .pb.targeted { box-shadow: 0 0 0 3px ${L.accent} !important; }
${T} .pb-orb b { background: ${L.fillColor} !important; }
${L.light ? `${T} .pb-ball.empty { border-color: rgba(0,0,0,0.35) !important; } ${T} .pb-bracket { background: linear-gradient(90deg, ${L.ink}, transparent) !important; }` : ''}
${T} :is(.pb, .pocket-text, .pt-stats, .layout-pocket .battle-cmd.bar) { color: ${L.ink} !important; }
/* The EXP bar along the bottom: the theme's frame, its track inked to match. */
${T} .hud-xp { border-radius: 0 !important; }
${T} .hud-xp-track { background: ${L.light ? 'rgba(60,40,20,0.22)' : 'rgba(0,0,0,0.45)'} !important; box-shadow: inset 0 0 0 1px ${L.light ? 'rgba(60,40,20,0.35)' : 'rgba(0,0,0,0.6)'} !important; }
${T} .hud-xp-lv { color: ${L.muted} !important; font-family: ${L.title} !important; }
/* The skill tree is drawn (SVG): its names, dots and lines take the window's ink. */
${T} .sk-name { fill: ${style.text || L.ink} !important; }
${T} .sk-node:not(.some, .full, .open) .sk-name { fill-opacity: 0.7; }
${T} .sk-line { stroke: ${L.light ? 'rgba(60,40,20,0.3)' : 'rgba(255,255,255,0.22)'} !important; }
${T} .sk-detail, ${T} .pc-mini { background: ${L.light ? 'rgba(60,40,20,0.06)' : 'rgba(255,255,255,0.05)'} !important; }
${T} .pc-mini { border-color: ${L.light ? 'rgba(60,40,20,0.18)' : 'rgba(255,255,255,0.1)'} !important; }
${T} .pc-mini.sel { border-color: ${L.accent} !important; }
${T} .pc-card.sel { border-color: ${L.accent} !important; box-shadow: 0 0 0 2px ${rgba(L.accent, 0.35)} !important; }
${T} .pc-swap-title, ${T} .sk-title, ${T} .sk-points b { color: ${L.accent} !important; }
${L.light || style.text ? `
/* Light paper or marble: dark ink everywhere inside the windows (coloured words keep their colour). */
${[...FRAMES, ...SMALL].map((f) => textSel.map((t) => `${T} ${f} ${t}:not([style*="color"]):not(.bar):not([class*="bar"]):not(.rank-pill):not(.msg.looked .msg-text *)`).join(',')).join(',\n')} { color: ${L.ink} !important; text-shadow: none !important; }
${T} :is(${[...FRAMES, ...SMALL].join(',')}) :is(.note, .menu-note, small, .muted, .item-sub) { color: ${L.muted} !important; }
${T} :is(${[...FRAMES, ...SMALL].join(',')}) :is(.menu-title, .battle-result-title) { color: ${L.accent} !important; }
${T} :is(.ps-tab, .sk-tab, .menu-item, .bcmd, .mk-btn, .mk-use, .tab)[aria-selected="true"], ${T} :is(.ps-tab, .sk-tab, .menu-item, .bcmd, .mk-btn, .mk-use, .tab)[aria-selected="true"] * { color: ${L.selInk} !important; }
/* (Stronger than the ink rule above, which otherwise wins inside windows: the selected words keep the selection's ink.) */
${T} :is(${[...FRAMES, ...SMALL].join(',')}) :is(.ps-tab, .sk-tab, .menu-item, .bcmd, .mk-btn, .mk-use, .tab)${'[aria-selected="true"]'.repeat(6)}, ${T} :is(${[...FRAMES, ...SMALL].join(',')}) :is(.ps-tab, .sk-tab, .menu-item, .bcmd, .mk-btn, .mk-use, .tab)${'[aria-selected="true"]'.repeat(6)} * { color: ${L.selInk} !important; }
${T} :is(${[...FRAMES, ...SMALL].join(',')}) :is(input, select, textarea) { color: ${L.ink}; background: rgba(255,255,255,0.5); }
` : ''}`;
  cache.set(key, out);
  return out;
}

let current: UiThemeId = 'ember';
/** Put a theme on (Ember: the plain look). */
export function applyUiTheme(id: string | undefined, style: WindowStyle = {}): void {
  const t = (UI_THEMES.some((x) => x.id === id) ? id : 'ember') as UiThemeId;
  current = t;
  const touched = (style.opacity ?? 100) < 100 || !!style.color || !!style.text || !!style.accent;
  let el = document.getElementById('ui-theme') as HTMLStyleElement | null;
  if (t === 'ember' && !touched) { el?.remove(); delete document.documentElement.dataset.uiTheme; return; }
  if (!el) { el = document.createElement('style'); el.id = 'ui-theme'; document.head.appendChild(el); }
  el.textContent = t === 'ember' ? emberCss(style) : css(t, style);
  document.documentElement.dataset.uiTheme = t;
}

/** Ember (the plain look) with the style's touches: its windows' colour and see-through-ness, the text, the gold. */
function emberCss(st: WindowStyle): string {
  const T = 'html[data-ui-theme="ember"]', all = [...FRAMES, ...SMALL].map((x) => `${T} ${x}`).join(',\n');
  const op = Math.max(0, Math.min(1, (st.opacity ?? 100) / 100));
  const textSel = ['span', 'b', 'strong', 'small', 'p', 'div', 'label', 'li', 'em', 'button', 'td', 'th', 'output'];
  return [
    `${T} .hud-top.hud-compact { background: none !important; border-color: transparent !important; box-shadow: none !important; }`,
    st.accent ? `${all} { --ember: ${st.accent}; }` : '',
    st.accent ? `${T} .pc-card.sel { box-shadow: 0 0 0 2px ${rgba(st.accent, 0.35)} !important; }` : '',
    st.color || op < 1 ? `${all} { background: ${rgba(st.color || '#0e111c', op * 0.95)} !important; ${op < 1 ? 'backdrop-filter: none !important;' : ''} }` : '',
    // Text box styles (Update 136): a style's own window colour (a Sign's brown) still shows through the window colour.
    `${T} .msg.looked.look-bg .msg-box { background: var(--look-bg) !important; }`,
    `${T} .msg.looked.look-clear .msg-box { background: none !important; box-shadow: none !important; }`,
    st.text ? `${T} .sk-name { fill: ${st.text} !important; }` : '',
    st.text ? `${all} { color: ${st.text} !important; }\n${[...FRAMES, ...SMALL].map((f) => textSel.map((x) => `${T} ${f} ${x}:not([style*="color"]):not([class*="bar"]):not(.msg.looked .msg-text *):not(.menu-title):not(.el-pill):not(:is(.ps-tab, .tab, .sk-tab, [aria-selected="true"]) *):not(.ps-tab, .tab, .sk-tab)`).join(',')).join(',\n')} { color: ${st.text} !important; }` : '',
  ].filter(Boolean).join('\n');
}
export const uiTheme = (): UiThemeId => current;
