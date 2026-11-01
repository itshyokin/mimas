/**
 * Built-in building art, drawn in code (32 px per tile, tileable): wall looks, roof looks, a door and a window
 * (with a night-glow mask for its panes). All original, so they're safe to ship.
 */
import { bayer, clamp, hash2 } from '../core/math';
import { Pix } from '../core/pixel';

export const WALL_LOOKS = ['plaster', 'stone', 'brick', 'timber'] as const;
export const ROOF_LOOKS = ['shingle', 'thatch', 'slate', 'wood'] as const;
export type WallLook = (typeof WALL_LOOKS)[number];
export type RoofLook = (typeof ROOF_LOOKS)[number];

/** A representative colour of each look, for the editor's top-down view. */
export const LOOK_COLOR: Record<string, string> = {
  plaster: '#e2d6b8', stone: '#8e8a86', brick: '#a4553f', timber: '#e6dcc0',
  shingle: '#8b4a3a', thatch: '#c49a4c', slate: '#56627a', wood: '#7a5634',
};

const S = 32;
/** Pick from a ramp (dark → light) by a 0…1 value, dithered. */
const shade = (ramp: string[], v: number, x: number, y: number) => ramp[clamp(Math.floor(v * (ramp.length - 1) + bayer(x, y) * 0.9), 0, ramp.length - 1)];
const noise = (x: number, y: number, s: number) => hash2(((x % S) + S) % S, ((y % S) + S) % S, s);

export function wallArt(look: string): HTMLCanvasElement {
  const p = new Pix(S, S);
  switch (look) {
    case 'stone': {
      const R = ['#4d4a48', '#625e5a', '#777370', '#8e8a86', '#a5a19b'];
      // Rows of 8 px; blocks of varying width per row (fixed so the tile repeats).
      const rows = [[0, 11, 20], [0, 7, 17, 26], [0, 13, 22], [0, 5, 15, 24]];
      for (let y = 0; y < S; y++) {
        const r = Math.floor(y / 8), cuts = rows[r], yy = y % 8;
        for (let x = 0; x < S; x++) {
          let k = 0;
          for (let i = 0; i < cuts.length; i++) if (x >= cuts[i]) k = i;
          const bx = x - cuts[k];
          if (yy === 7 || bx === 0) { p.set(x, y, '#3a3634'); continue; }
          const v = 0.25 + hash2(r, k, 5) * 0.35 + (yy === 0 ? 0.25 : 0) + (bx === 1 ? 0.12 : 0) - (yy === 6 ? 0.15 : 0) + (noise(x, y, 6) - 0.5) * 0.3;
          p.set(x, y, shade(R, clamp(v, 0, 1), x, y));
        }
      }
      break;
    }
    case 'brick': {
      const R = ['#6e3326', '#86402f', '#9c4d39', '#b25d44', '#c4705a'];
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const r = Math.floor(y / 8), yy = y % 8, bx = (x + (r % 2) * 8) % 16, k = Math.floor((x + (r % 2) * 8) / 16);
          if (yy === 7 || bx === 0) { p.set(x, y, '#c9b9a0'); continue; }
          const v = 0.3 + hash2(r, k, 9) * 0.35 + (yy === 0 ? 0.2 : 0) - (yy === 6 ? 0.2 : 0) + (noise(x, y, 3) - 0.5) * 0.25;
          p.set(x, y, shade(R, clamp(v, 0, 1), x, y));
        }
      break;
    }
    case 'timber': {
      plaster(p);
      const W = ['#3b2617', '#4f3320', '#64432a'];
      const beam = (x: number, y: number, edge: boolean) => p.set(x, y, edge ? W[0] : shade(W, 0.4 + (noise(x, y, 8) - 0.5) * 0.6, x, y));
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          // A frame round the tile (meeting the next tile's) and one diagonal brace.
          const fx = x < 3 || x > 29, fy = y < 3 || y > 29, diag = Math.abs(x - y) <= 1 && !fx && !fy;
          if (fx || fy) beam(x, y, x === 2 || x === 29 || y === 2 || y === 29);
          else if (diag) beam(x, y, Math.abs(x - y) === 1);
        }
      break;
    }
    default:
      plaster(p);
  }
  return p.canvas();
}

function plaster(p: Pix): void {
  const R = ['#bfb090', '#d1c4a5', '#e2d6b8', '#ece3cb'];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = 0.55 + (noise(x, y, 1) - 0.5) * 0.35 + (noise(x >> 2, y >> 2, 2) - 0.5) * 0.3;
      p.set(x, y, shade(R, clamp(v, 0, 1), x, y));
    }
  // A hairline crack or two.
  for (const [cx, cy, n] of [[7, 9, 5], [22, 21, 4]]) for (let i = 0; i < n; i++) p.set(cx + i, cy + (i % 2), '#a99a7c');
}

/** Roof art: the top of the image is towards the ridge, the bottom towards the eaves. */
export function roofArt(look: string): HTMLCanvasElement {
  const p = new Pix(S, S);
  switch (look) {
    case 'thatch': {
      const R = ['#6e5226', '#8c6a32', '#a9843f', '#c49a4c', '#d9b467'];
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          // Bundles of straw 16 px tall, each lighter at its lower lip; streaks down the slope.
          const yy = y % 16, streak = noise(x, Math.floor(y / 3), 4);
          const v = 0.2 + streak * 0.45 + (yy > 12 ? 0.25 : 0) - (yy < 2 ? 0.3 : 0) + (noise(x, y, 5) - 0.5) * 0.2;
          p.set(x, y, shade(R, clamp(v, 0, 1), x, y));
        }
      break;
    }
    case 'slate': {
      const R = ['#2f3644', '#3f4858', '#4e596b', '#5f6b80', '#74819a'];
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const r = Math.floor(y / 8), yy = y % 8, bx = (x + (r % 2) * 4) % 8, k = Math.floor((x + (r % 2) * 4) / 8);
          if (bx === 0) { p.set(x, y, '#252a35'); continue; }
          const v = 0.3 + hash2(r, k % 4, 11) * 0.35 - (yy < 1 ? 0.3 : 0) + (yy === 7 ? 0.25 : 0) + (noise(x, y, 7) - 0.5) * 0.15;
          p.set(x, y, shade(R, clamp(v, 0, 1), x, y));
        }
      break;
    }
    case 'wood': {
      const R = ['#4a3320', '#5f4229', '#7a5634', '#8f6a42', '#a47d50'];
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          // Planks down the slope, 8 px wide, with grain and a butt joint.
          const k = Math.floor(x / 8), bx = x % 8, joint = (y + k * 11) % 32 === 0;
          if (bx === 0 || joint) { p.set(x, y, '#33241a'); continue; }
          const v = 0.3 + hash2(k, 0, 13) * 0.3 + (bx === 1 ? 0.2 : 0) - (bx === 7 ? 0.15 : 0) + (noise(x, y >> 2, 14) - 0.5) * 0.3;
          p.set(x, y, shade(R, clamp(v, 0, 1), x, y));
        }
      break;
    }
    default: {
      // Shingles: staggered rows of tabs 8 px tall and of varied widths; each row's top is shadowed by the row
      // above, its lower lip catches the light.
      const R = ['#4f2620', '#69322a', '#7d3d32', '#8b4a3a', '#a25c48'];
      for (let r = 0; r < 4; r++) {
        // Joint positions for this row (wrapping, so the tile repeats).
        const cuts: number[] = [];
        for (let x = (r * 5) % 7; cuts.length < 6 && x < S + 32; x += 5 + Math.floor(hash2(r, cuts.length, 17) * 4)) cuts.push(x % S);
        for (let yy = 0; yy < 8; yy++)
          for (let x = 0; x < S; x++) {
            const y = r * 8 + yy;
            const k = cuts.filter((c) => c <= x).length;
            if (cuts.includes(x) && yy > 1) { p.set(x, y, '#3b1d18'); continue; }
            const v = 0.32 + hash2(r, k, 19) * 0.3 - (yy < 2 ? 0.35 : 0) + (yy === 7 ? 0.28 : 0) + (yy === 6 ? 0.08 : 0) + (noise(x, y, 18) - 0.5) * 0.18;
            p.set(x, y, shade(R, clamp(v, 0, 1), x, y));
          }
      }
    }
  }
  return p.canvas();
}

/** A wooden door in a stone frame, 32 × 64 (1 × 2 tiles), arched at the top (transparent corners). */
export function doorArt(): HTMLCanvasElement {
  const W = 32, H = 64, p = new Pix(W, H);
  const F = ['#5d5955', '#77736e', '#8e8a85'], D = ['#3e2716', '#53351f', '#6b4629', '#805633'];
  const cx = 15.5, archY = 15;
  const inside = (x: number, y: number, r: number) => (y >= archY ? Math.abs(x - cx) <= r : Math.hypot(x - cx, y - archY) <= r);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y, 16)) continue;
      if (!inside(x, y, 12.5)) { p.set(x, y, shade(F, 0.5 + (noise(x, y, 21) - 0.5) * 0.7, x, y)); continue; }
      // Planks, 5 px wide, with two cross braces.
      const plank = Math.floor((x - 3) / 5), px = (x - 3) % 5;
      if (px === 0) { p.set(x, y, '#2c1c10'); continue; }
      const brace = (y >= 24 && y <= 27) || (y >= 50 && y <= 53);
      const v = (brace ? 0.75 : 0.35 + hash2(plank, 0, 22) * 0.3) + (px === 1 ? 0.12 : 0) + (noise(x, y >> 2, 23) - 0.5) * 0.25;
      p.set(x, y, shade(D, clamp(v, 0, 1), x, y));
    }
  // Iron hinges and a ring handle.
  for (const hy of [25, 51]) for (let x = 4; x < 12; x++) p.set(x, hy, '#2a2a2e');
  for (const [x, y] of [[22, 38], [23, 37], [24, 37], [25, 38], [25, 39], [24, 40], [23, 40], [22, 39]]) p.set(x, y, '#c9a24a');
  // A step at the threshold.
  p.rect(0, 62, 32, 2, '#6d6862');
  return p.canvas();
}

/** A four-pane window with a wooden frame and a sill, 32 × 32. `mask` draws only the panes (white), for the night glow. */
export function windowArt(mask = false): HTMLCanvasElement {
  const p = new Pix(S, S);
  for (let y = 3; y < 30; y++)
    for (let x = 4; x < 28; x++) {
      const frame = x < 6 || x > 25 || y < 5 || y > 26 || x === 15 || x === 16 || y === 15 || y === 16;
      if (mask) { if (!frame) p.set(x, y, '#ffffff'); continue; }
      if (frame) { p.set(x, y, x === 4 || y === 3 || x === 27 ? '#3e2716' : shade(['#53351f', '#6b4629', '#80562f'], 0.5 + (noise(x, y, 31) - 0.5) * 0.6, x, y)); continue; }
      // Glass: dark with a soft diagonal sheen.
      const sheen = ((x + y) % 11 < 2 && (x % 15) > 8) ? 0.8 : 0;
      p.set(x, y, shade(['#1d2836', '#2a3a4e', '#3c536b', '#8aa4bd'], 0.3 + sheen + (y < 10 ? 0.15 : 0), x, y));
    }
  if (!mask) for (let x = 2; x < 30; x++) { p.set(x, 29, '#77736e'); p.set(x, 30, '#5d5955'); }
  return p.canvas();
}
