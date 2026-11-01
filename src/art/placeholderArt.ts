/**
 * Placeholder art generated in code. Every function returns a canvas at 16 px per tile.
 * When real tilesets and sprite sheets arrive, the SpriteLibrary will load image files instead
 * and nothing else in the engine needs to change.
 */
import { deckIcon } from '../world/decks';
import { bayer, clamp, hash2, rng, vnoise } from '../core/math';
import { Pix, blob, canvasFromRGBA, ell, segD } from '../core/pixel';
import type { TileMap } from '../world/TileMap';
import { NEIGHBOURS8, cellDistance, reach } from '../world/blend';
import type { CharacterPalette } from '../world/types';

const OUTLINE = '#17131d';
const FOLIAGE_OUTLINE = '#13220f';
const BARK = ['#3f2614', '#5a3820', '#7a4f2d', '#94673b'];
const STONE = ['#33343f', '#4b4d5a', '#666a78', '#878b98', '#b2b5bf'];

/** A one-person tent (A-frame) in a colour: lighter and darker canvas, a dark opening, pegs and guy lines. */
function tentArt(ramp: string[]): HTMLCanvasElement {
  const p = new Pix(30, 22);
  const inside = (x: number, y: number) => y >= 3 && y < 21 && Math.abs(x - 15) <= (y - 3) * 0.78 + 1;
  blob(p, inside, ramp, { maxD: 4, k: 3, tex: 0.25, texS: 2.5, seed: 11 });
  // The ridge pole and the seam, and the front flap open on a dark inside.
  for (let y = 3; y < 21; y++) p.set(15, y, ramp[0]);
  for (let y = 12; y < 21; y++) for (let x = 15 - Math.floor((y - 12) * 0.45); x <= 15 + Math.floor((y - 12) * 0.45); x++) p.set(x, y, y < 14 ? '#2a2420' : '#171310');
  p.set(15, 2, '#5a3820'); p.set(15, 1, '#7a4f2d');
  // Guy lines and pegs.
  for (let k = 0; k < 5; k++) { p.set(4 - k, 16 + k, '#c9bfa8'); p.set(26 + k, 16 + k, '#c9bfa8'); }
  p.set(0, 21, '#5a3820'); p.set(29, 21, '#5a3820');
  p.outline(OUTLINE);
  return p.canvas();
}

/** A clump of grass blades w × h px: each blade curving one way, dark at the root and light at the tip. */
function grassClump(W: number, H: number, pal: string[], seed: number): HTMLCanvasElement {
  const p = new Pix(W, H), R = rng(seed);
  const n = Math.round(W * 1.1);
  for (let i = 0; i < n; i++) {
    const bx = Math.floor(R() * W), hgt = Math.round(H * (0.55 + R() * 0.45)), lean = (R() - 0.5) * W * 0.45;
    for (let j = 0; j < hgt; j++) {
      const x = Math.round(bx + (lean * j * j) / (hgt * hgt)), f = j / hgt;
      if (x < 0 || x >= W) continue;
      p.set(x, H - 1 - j, pal[Math.min(pal.length - 1, Math.floor(f * pal.length + (R() < 0.15 ? 1 : 0)))]);
    }
  }
  p.outline(FOLIAGE_OUTLINE);
  return p.canvas();
}

export const PLACEHOLDER_SPRITES: Record<string, () => HTMLCanvasElement> = {
  // Bridges and platforms are built in 3D; these are their pictures from above (palette and editor map).
  bridge_wood_h() { return deckIcon({ style: 'wood', dir: 'h', rails: true }); },
  bridge_wood_v() { return deckIcon({ style: 'wood', dir: 'v', rails: true }); },
  bridge_rope_h() { return deckIcon({ style: 'rope', dir: 'h' }); },
  bridge_rope_v() { return deckIcon({ style: 'rope', dir: 'v' }); },
  bridge_stone_h() { return deckIcon({ style: 'stone', dir: 'h', rails: true }); },
  bridge_stone_v() { return deckIcon({ style: 'stone', dir: 'v', rails: true }); },
  dock() { return deckIcon({ style: 'wood', dir: 'h' }); },
  platform_stone() { return deckIcon({ style: 'stone' }); },
  tent_red() { return tentArt(['#5a1a1a', '#7e2626', '#a33a32', '#c45a44', '#de8064']); },
  tent_blue() { return tentArt(['#1a2a5a', '#263c7e', '#3452a3', '#4c70c4', '#7096de']); },
  tent_green() { return tentArt(['#1c3a1e', '#285428', '#3a7034', '#548e46', '#7aae62']); },
  tent_tan() { return tentArt(['#5a4a2c', '#7a6640', '#9a8456', '#b8a270', '#d4c290']); },
  tent_purple() { return tentArt(['#3a1a4a', '#522666', '#6c3684', '#8a50a4', '#ac76c2']); },
  oak() {
    const p = new Pix(32, 40);
    blob(p, (x, y) => (x >= 13 && x < 19 && y >= 24 && y < 39) || (y >= 37 && x >= 12 && x < 20), BARK, { maxD: 2, k: 2 });
    blob(p, (x, y) => ell(x, y, 16, 13, 11, 10) || ell(x, y, 8.5, 19, 7.5, 6.5) || ell(x, y, 23.5, 19, 7.5, 6.5) ||
      ell(x, y, 16, 22, 9, 7) || ell(x, y, 11, 8, 6, 5.5) || ell(x, y, 21, 8, 6, 5.5),
      ['#183323', '#22472b', '#2f6233', '#43803b', '#62a046', '#8cc457'], { maxD: 6, k: 3, tex: 0.55, texS: 2.5, seed: 3 });
    p.outline(OUTLINE);
    return p.canvas();
  },
  pine() {
    const p = new Pix(26, 44);
    blob(p, (x, y) => x >= 11 && x < 15 && y >= 34 && y < 44, BARK, { maxD: 2, k: 2 });
    blob(p, (x, y) => {
      for (let i = 0; i < 4; i++) {
        const ap = 2 + i * 8, base = ap + 14, hw = 5 + i * 2.4;
        if (y >= ap && y <= base - (Math.floor(x) % 3 === 0 ? 1 : 0) && Math.abs(x - 13) <= ((y - ap) / (base - ap)) * hw) return true;
      }
      return false;
    }, ['#10271f', '#183a2c', '#235038', '#336b45', '#4f8e57', '#77b06a'], { maxD: 4, k: 3, tex: 0.4, texS: 2, seed: 5 });
    p.outline(OUTLINE);
    return p.canvas();
  },
  bush() {
    const p = new Pix(22, 15);
    blob(p, (x, y) => ell(x, y, 7, 9, 6, 5) || ell(x, y, 15, 9, 6, 5) || ell(x, y, 11, 6, 6, 5),
      ['#1a3524', '#28512f', '#3b7038', '#5a9346', '#8cc062'], { maxD: 4, k: 3, tex: 0.5, texS: 2, seed: 9 });
    for (const [x, y] of [[6, 7], [12, 5], [15, 9], [9, 10], [17, 7]]) { p.set(x, y, '#d8434a'); p.set(x, y - 1, '#f08a8a'); }
    p.outline(OUTLINE);
    return p.canvas();
  },
  rock() {
    const p = new Pix(18, 13);
    const m = blob(p, (x, y) => ell(x, y, 9, 8, 8, 4.6) || ell(x, y, 6.5, 5.5, 4.5, 3.8), STONE, { maxD: 4, k: 3, tex: 0.3, texS: 2, seed: 12 });
    for (let y = 2; y < 7; y++)
      for (let x = 0; x < 18; x++)
        if (m[y * 18 + x] && !m[(y - 2) * 18 + x] && vnoise(x / 2, y / 2, 4) > 0.35) p.set(x, y, vnoise(x, y, 6) > 0.5 ? '#5f8c45' : '#466b37');
    p.outline(OUTLINE);
    return p.canvas();
  },
  pebble() {
    const p = new Pix(10, 7);
    blob(p, (x, y) => ell(x, y, 5, 4.2, 4.2, 2.6), ['#3d3f4a', '#5a5d6a', '#7c808d', '#a3a7b2'], { maxD: 3, k: 3 });
    p.outline(OUTLINE);
    return p.canvas();
  },
  tuft() {
    const p = new Pix(12, 9), R = rng(21);
    for (let i = 0; i < 6; i++) {
      const bx = 1 + i * 2, hgt = 4 + Math.floor(R() * 4), lean = R() < 0.5 ? -1 : 1;
      for (let j = 0; j < hgt; j++) {
        const x = bx + Math.round((lean * j * j) / (hgt * 2));
        p.set(x, 8 - j, j > hgt - 2 ? '#8cc457' : j > hgt / 2 ? '#5d9a45' : '#3c6b34');
      }
    }
    p.outline(FOLIAGE_OUTLINE);
    return p.canvas();
  },
  /** Tall grass: a dense clump of blades about a tile tall, leaning this way and that. */
  tallGrass() { return grassClump(16, 18, ['#2f5a2c', '#3c6b34', '#5d9a45', '#8cc457'], 41); },
  /** Really tall grass (taller than the hero): long blades in a thick stand. */
  tallGrassXL() { return grassClump(16, 30, ['#2a5128', '#37652f', '#558f40', '#7fba4f'], 57); },
  /** Wheat: golden stalks with heavy, drooping heads of grain. */
  wheat() {
    const W = 16, H = 30, p = new Pix(W, H), R = rng(77);
    const stalk = ['#7a5a1c', '#a07a2a', '#c99d3c'], head = ['#9c7420', '#d9ac43', '#f2cf6a', '#fde69a'];
    for (let i = 0; i < 9; i++) {
      const bx = 1 + Math.floor(R() * (W - 2)), hgt = H - 4 - Math.floor(R() * 8), lean = (R() - 0.5) * 3;
      const xAt = (j: number) => Math.round(bx + (lean * j * j) / (hgt * hgt));
      for (let j = 0; j < hgt - 5; j++) p.set(xAt(j), H - 1 - j, stalk[j < hgt / 3 ? 0 : j < (hgt * 2) / 3 ? 1 : 2]);
      // The head: a short plump spike of grain, lighter on one side.
      for (let j = hgt - 6; j < hgt; j++) { const x = xAt(j), y = H - 1 - j; p.set(x, y, head[1 + (j % 2)]); p.set(x + 1, y, head[j % 3 === 0 ? 3 : 2]); if (j % 2 === 0) p.set(x - 1, y, head[0]); }
    }
    p.outline('#3a2a0c');
    return p.canvas();
  },
  flowers() {
    const p = new Pix(14, 9), cols = ['#f4d35e', '#ee6c9b', '#ece6f6', '#8fb7ff'], R = rng(33);
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(R() * 12), hgt = 3 + Math.floor(R() * 4), c = cols[i % cols.length];
      for (let j = 0; j < hgt; j++) p.set(x, 8 - j, '#3c6b34');
      p.set(x - 1, 8 - hgt, c); p.set(x + 1, 8 - hgt, c); p.set(x, 7 - hgt, c); p.set(x, 8 - hgt, '#fff4c2');
    }
    p.outline(FOLIAGE_OUTLINE);
    return p.canvas();
  },
  sign() {
    const p = new Pix(14, 18);
    blob(p, (x, y) => segD(x, y, 7, 17.5, 7, 8) < 1.3, ['#4a2d18', '#6b4325', '#8a5a35'], { maxD: 2, k: 2 });
    blob(p, (x, y) => x >= 1 && x < 13 && y >= 2 && y < 10, ['#5a3820', '#7a4f2d', '#94673b', '#b3834e'], { maxD: 3, k: 2, tex: 0.3, texS: 2, seed: 7 });
    for (let x = 3; x < 11; x++) { if (x !== 6) p.set(x, 4, '#4a2d18'); if (x < 9) p.set(x, 7, '#4a2d18'); }
    p.outline(OUTLINE);
    return p.canvas();
  },
  logs() {
    const p = new Pix(22, 11);
    blob(p, (x, y) => segD(x, y, 4, 8, 17, 3.5) < 1.8 || segD(x, y, 5, 3.5, 18, 8) < 1.8, ['#3a2213', ...BARK], { maxD: 2, k: 2 });
    for (let x = 9; x < 14; x++) for (let y = 5; y < 8; y++) p.set(x, y, (x + y) % 3 ? '#2a1d18' : '#ff8a2a');
    const stones = new Pix(22, 11);
    blob(stones, (x, y) => { for (let i = 0; i < 7; i++) if (ell(x, y, 2 + i * 3, 9, 1.9, 1.6)) return true; return false; },
      ['#3d3f4a', '#5a5d6a', '#7c808d', '#a3a7b2'], { maxD: 2, k: 3 });
    p.stamp(stones);
    p.outline(OUTLINE);
    return p.canvas();
  },
  torch() {
    const p = new Pix(8, 22);
    blob(p, (x, y) => segD(x, y, 4, 21.5, 4, 6) < 1.3, ['#4a2d18', '#6b4325', '#8a5a35'], { maxD: 2, k: 2 });
    p.rect(1, 3, 6, 3, '#3a3640'); p.rect(1, 3, 6, 1, '#6a6573'); p.rect(2, 6, 4, 1, '#2a2630');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A torch in an iron bracket, for a wall (mounted above the ground: the bottom of the image is empty). */
  wall_torch() {
    const p = new Pix(12, 28);
    p.rect(3, 15, 4, 7, '#3a3640'); p.rect(3, 15, 4, 1, '#6a6573'); p.set(4, 17, '#8a8590'); p.set(4, 20, '#8a8590');
    blob(p, (x, y) => segD(x, y, 5, 20.5, 7.5, 8) < 1.2, ['#4a2d18', '#6b4325', '#8a5a35'], { maxD: 2, k: 2 });
    p.rect(5, 17, 3, 1, '#2a2630');
    p.rect(6, 5, 4, 3, '#3a3640'); p.rect(6, 5, 4, 1, '#6a6573'); p.rect(7, 8, 2, 1, '#2a2630');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A lantern hanging from an iron arm, for a wall. */
  wall_lantern() {
    const p = new Pix(12, 28);
    p.rect(1, 4, 2, 9, '#3a3640'); p.set(1, 5, '#6a6573'); p.set(1, 11, '#6a6573');
    p.rect(2, 6, 7, 1, '#3a3640'); p.rect(3, 5, 5, 1, '#55505c');
    p.rect(8, 7, 1, 2, '#3a3640');
    p.rect(6, 9, 5, 1, '#2a2630'); p.rect(7, 8, 3, 1, '#4a4652');
    for (let y = 10; y < 17; y++) {
      p.set(6, y, '#2a2630'); p.set(10, y, '#2a2630');
      for (let x = 7; x < 10; x++) p.set(x, y, y < 12 ? '#ffe7a8' : y < 15 ? '#ffd27a' : '#f0a848');
    }
    p.rect(5, 17, 7, 1, '#3a3640'); p.rect(6, 18, 5, 1, '#2a2630');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** An iron fire basket on a bracket, for a wall. */
  wall_brazier() {
    const p = new Pix(18, 26);
    blob(p, (x, y) => (x >= 7 && x <= 10 && y >= 13 && y <= 20) || segD(x, y, 4, 9, 8, 15) < 0.9 || segD(x, y, 13, 9, 9, 15) < 0.9, ['#2a2630', '#3a3640', '#55505c'], { maxD: 1, k: 2 });
    p.rect(7, 18, 4, 3, '#3a3640'); p.set(8, 19, '#8a8590');
    blob(p, (x, y) => ell(x, y, 8.5, 7.5, 7, 5) && y >= 8, ['#2a2630', '#3a3640', '#55505c', '#6a6573'], { maxD: 2, k: 2, seed: 3 });
    for (let x = 3; x < 15; x++) p.set(x, 8, x % 2 ? '#3a3640' : '#55505c');
    for (let x = 4; x < 14; x++) p.set(x, 7, ['#c84a1a', '#ff8a3a', '#7a2a12', '#ffb35c'][x % 4]);
    for (let x = 6; x < 12; x++) p.set(x, 6, x % 2 ? '#c84a1a' : '#7a2a12');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A curtain of vines hanging across a path: cut it with a cutting ring. */
  vines() {
    const p = new Pix(16, 22), R = rng(41);
    const greens = ['#1f3f22', '#2c5a2c', '#3f7a36', '#5d9a45'];
    // A tangle at the top, strands hanging down.
    blob(p, (x, y) => y < 6 && ell(x, y, 8, 3, 8, 4.5), greens, { maxD: 3, k: 3, tex: 0.5, texS: 2, seed: 4 });
    for (let i = 0; i < 7; i++) {
      const x0 = 1 + i * 2.2 + R() * 0.8, len = 12 + Math.floor(R() * 8);
      for (let y = 4; y < 4 + len && y < 22; y++) {
        const x = Math.round(x0 + Math.sin(y * 0.6 + i) * 0.8);
        p.set(x, y, greens[1 + ((y + i) % 3 === 0 ? 1 : 0)]);
        if ((y + i * 3) % 5 === 0) { p.set(x - 1, y, greens[3]); p.set(x + 1, y + 1, greens[2]); }
      }
    }
    p.outline(FOLIAGE_OUTLINE);
    return p.canvas();
  },
  /** A thin young tree in the way: cut it with a cutting ring. */
  sapling() {
    const p = new Pix(14, 26);
    blob(p, (x, y) => x >= 6 && x < 8 && y >= 12 && y < 26, BARK, { maxD: 1, k: 2 });
    blob(p, (x, y) => ell(x, y, 7, 8, 6, 6.5) || ell(x, y, 4.5, 12, 3.5, 3) || ell(x, y, 9.5, 12, 3.5, 3),
      ['#1d3a26', '#2a5230', '#3e7038', '#5a9446', '#86bc58'], { maxD: 4, k: 3, tex: 0.5, texS: 2, seed: 17 });
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A wooden crate: break it open. */
  crate() {
    const p = new Pix(16, 16);
    const WOOD = ['#4a2d18', '#6b4325', '#8a5a35', '#a8743f'];
    blob(p, (x, y) => x >= 1 && x < 15 && y >= 1 && y < 16, WOOD, { maxD: 3, k: 2, tex: 0.35, texS: 2, seed: 9 });
    // Frame and a diagonal brace.
    p.rect(1, 1, 14, 2, '#5a3820'); p.rect(1, 13, 14, 2, '#5a3820'); p.rect(1, 1, 2, 14, '#5a3820'); p.rect(13, 1, 2, 14, '#5a3820');
    for (let i = 0; i < 10; i++) { p.set(3 + i, 12 - i, '#3f2614'); p.set(3 + i, 11 - i, '#7a4f2d'); }
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) p.set(x, y, '#9a98ab');
    p.rect(1, 1, 14, 1, '#a8743f');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A boulder with a crack running through it: strong hits break it. */
  boulder_cracked() {
    const p = new Pix(22, 18);
    blob(p, (x, y) => ell(x, y, 11, 10.5, 10, 7.5), ['#33343d', '#4a4c57', '#666975', '#8a8d99', '#aeb1bc'], { maxD: 5, k: 3, tex: 0.45, texS: 2.5, seed: 21 });
    // The crack.
    for (const [x, y] of [[9, 4], [10, 5], [10, 6], [11, 7], [10, 8], [11, 9], [12, 10], [12, 11], [11, 12], [12, 13], [13, 14], [8, 9], [7, 10], [6, 10], [14, 10], [15, 11]]) p.set(x, y, '#1b1c22');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A large boulder: two tiles across, mossy on top (mine it for stone). */
  boulder() { return boulderArt(32, 26, 31, null); },
  /** An iron vein: a boulder seamed with rusty ore. */
  ore_iron() { return boulderArt(28, 23, 37, ['#7a3c1e', '#a8582a', '#d07a3a', '#e8a066']); },
  /** A gold vein: a dark boulder flecked with gold. */
  ore_gold() { return boulderArt(28, 23, 43, ['#8a6a14', '#c89a24', '#f2c84a', '#fff0a0']); },
  /** A blacksmith's anvil on a wooden block: a forge. */
  anvil() {
    const p = new Pix(24, 18);
    // The block it stands on.
    blob(p, (x, y) => x >= 7 && x < 17 && y >= 11 && y < 18, BARK, { maxD: 2, k: 2, seed: 6 });
    for (let x = 7; x < 17; x++) p.set(x, 11, '#a8743f');
    // The anvil: a waist, then the face with its horn to the left and heel to the right.
    const steel = ['#22242c', '#3a3d48', '#5a5e6c', '#868a98', '#c2c6d0'];
    blob(p, (x, y) => (x >= 9 && x < 15 && y >= 7 && y < 11) || (x >= 7 && x < 17 && y >= 9.5 && y < 11.5), steel, { maxD: 2, k: 2, seed: 2 });
    blob(p, (x, y) => (y >= 3 && y < 7.5 && x >= 6 && x < 21) || (y >= 3 && y < 6 && x >= 2 && x < 6 && y - 3 < (x - 2) * 0.8), steel, { maxD: 2.5, k: 3, seed: 3 });
    for (let x = 6; x < 21; x++) p.set(x, 3, '#dfe3ea');
    p.set(3, 4, '#c2c6d0');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A crystal on a stone pedestal: hit it to throw a switch. */
  crystal() {
    const p = new Pix(14, 24);
    blob(p, (x, y) => x >= 2 && x < 12 && y >= 18 && y < 24, ['#3d3f4a', '#5a5d6a', '#7c808d', '#a3a7b2'], { maxD: 2, k: 2 });
    p.rect(1, 18, 12, 1, '#a3a7b2');
    blob(p, (x, y) => { const cx = 7, top = 1, bot = 17, mid = 7; if (y < top || y > bot) return false; const half = y < mid ? (y - top) * 0.75 + 0.5 : (bot - y) * 0.45 + 0.5; return Math.abs(x + 0.5 - cx) <= half; },
      ['#1f3f8a', '#2f63c4', '#4f8ff0', '#8cc4ff', '#d8f0ff'], { maxD: 4, k: 2, seed: 5 });
    for (let y = 3; y < 15; y++) p.set(6, y, y < 8 ? '#ffffff' : '#a8d8ff');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A wooden fence: two posts and two rails (one tile wide; line them up). */
  fence() {
    const p = new Pix(16, 14), WOOD = ['#4a2d18', '#6b4325', '#8a5a35', '#a8743f'];
    blob(p, (x, y) => (y >= 4 && y < 6.5) || (y >= 8.5 && y < 11), WOOD, { maxD: 1.5, k: 2, seed: 3 });
    blob(p, (x, y) => (x >= 1 && x < 4 && y >= 1 && y < 14) || (x >= 12 && x < 15 && y >= 1 && y < 14), WOOD, { maxD: 1.5, k: 2, seed: 5 });
    for (const x of [1, 12]) p.set(x + 1, 1, '#c08a50');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A single fence post (the end of a fence, or a corner). */
  fence_post() {
    const p = new Pix(6, 15);
    blob(p, (x, y) => x >= 1.5 && x < 4.5 && y >= 1 && y < 15, ['#4a2d18', '#6b4325', '#8a5a35', '#a8743f'], { maxD: 1.5, k: 2, seed: 9 });
    p.set(3, 1, '#c08a50');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A fence gate: a frame with a cross brace. */
  fence_gate() {
    const p = new Pix(16, 15), WOOD = ['#4a2d18', '#6b4325', '#8a5a35', '#a8743f'];
    blob(p, (x, y) => (x >= 0.5 && x < 3 && y >= 0 && y < 15) || (x >= 13 && x < 15.5 && y >= 0 && y < 15), WOOD, { maxD: 1.5, k: 2, seed: 2 });
    blob(p, (x, y) => (x >= 3 && x < 13) && ((y >= 3 && y < 5) || (y >= 10 && y < 12) || segD(x, y, 3.5, 11, 12.5, 4) < 1.1), WOOD, { maxD: 1.5, k: 2, seed: 4 });
    p.set(11, 8, '#2a1d18'); p.set(11, 7, '#c9c2b0');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /**
   * A bedroll laid head-to-foot (Update 134): the pillow at the top and the open roll below. Someone lying on it is
   * drawn over this, and the blanket (bedroll_blanket) over them, so their head rests on the pillow.
   */
  bedroll() {
    const p = new Pix(16, 28);
    blob(p, (x, y) => x >= 1 && x < 15 && y >= 1 && y < 27, ['#2c3550', '#3d4a6b', '#4f6088', '#6478a4'], { maxD: 2, k: 2, seed: 6 });
    blob(p, (x, y) => ell(x, y, 8, 5.5, 5.5, 3.3), ['#a89c84', '#c8bca2', '#e4dac2', '#f4ecd8'], { maxD: 2, k: 2, seed: 1 });
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** The bedroll's blanket, drawn over whoever lies on it (Update 134). */
  bedroll_blanket() {
    const p = new Pix(16, 28);
    blob(p, (x, y) => x >= 1 && x < 15 && y >= 11 && y < 27, ['#3d4a6b', '#4f6088', '#6478a4', '#8094bf'], { maxD: 2, k: 2, seed: 9 });
    // The folded-back top edge.
    blob(p, (x, y) => x >= 1 && x < 15 && y >= 11 && y < 14, ['#9aa8cc', '#b4c0dc', '#ccd6ec'], { maxD: 1, k: 2, seed: 3 });
    for (let y = 14; y < 27; y += 4) for (let x = 2; x < 14; x += 3) p.set(x, y, '#5a6c96');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A log to sit on by the fire. */
  log_seat() {
    const p = new Pix(24, 10);
    blob(p, (x, y) => segD(x, y, 3.5, 5.5, 20.5, 5.5) < 3.3, ['#3a2213', ...BARK], { maxD: 2.5, k: 2, tex: 0.3, texS: 2, seed: 8 });
    blob(p, (x, y) => ell(x, y, 21, 5.5, 2.2, 3), ['#a8743f', '#c8955a', '#e0b67a'], { maxD: 2, k: 2, seed: 2 });
    p.set(21, 5, '#8a5a35');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A stack of split firewood. */
  firewood() {
    const p = new Pix(18, 13);
    const logs: [number, number][] = [[4, 10], [9, 10], [14, 10], [6.5, 6], [11.5, 6], [9, 2.5]];
    for (const [cx, cy] of logs) blob(p, (x, y) => ell(x, y, cx, cy, 2.6, 2.3), ['#3a2213', '#5a3820', '#7a4f2d'], { maxD: 2, k: 2, seed: cx * 3 });
    for (const [cx, cy] of logs) { p.set(Math.floor(cx), Math.floor(cy), '#c8955a'); p.set(Math.floor(cx) - 1, Math.floor(cy), '#e0b67a'); }
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A lantern hanging from a post (lights up at night). */
  lantern_post() {
    const p = new Pix(12, 30);
    blob(p, (x, y) => (x >= 2 && x < 4.5 && y >= 3 && y < 30) || (y >= 3 && y < 5 && x >= 2 && x < 10), ['#3a2213', '#5a3820', '#7a4f2d'], { maxD: 1.5, k: 2, seed: 3 });
    for (let y = 5; y < 8; y++) p.set(8, y, '#2a2a2a');
    blob(p, (x, y) => x >= 6 && x < 11 && y >= 8 && y < 15, ['#2c2c34', '#46464f', '#6a6a72'], { maxD: 1.5, k: 2, seed: 1 });
    for (let y = 10; y < 14; y++) for (let x = 7; x < 10; x++) p.set(x, y, y < 12 ? '#ffe9a0' : '#ffc45a');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A cooking pot hung over a tripod of sticks. */
  cooking_pot() {
    const p = new Pix(18, 18);
    blob(p, (x, y) => segD(x, y, 2, 17.5, 9, 1) < 0.9 || segD(x, y, 16, 17.5, 9, 1) < 0.9, ['#3a2213', '#5a3820', '#7a4f2d'], { maxD: 1, k: 2, seed: 4 });
    for (let y = 2; y < 8; y++) p.set(9, y, '#2a2a2a');
    blob(p, (x, y) => ell(x, y, 9, 11, 5, 4) && y > 7.5, ['#1c1c22', '#2e2e36', '#46464f', '#62626c'], { maxD: 2.5, k: 2, seed: 2 });
    for (let x = 5; x < 14; x++) p.set(x, 8, '#7a7a84');
    p.set(8, 7, '#d8d8e0'); p.set(10, 6, '#d8d8e0');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A saguaro: a ribbed trunk with two arms. */
  cactus() {
    const p = new Pix(16, 26);
    const shape = (x: number, y: number) => (x >= 6 && x < 10 && y >= 2 && y < 26) || ell(x, y, 8, 2.5, 2, 2)
      || (x >= 1.5 && x < 4.5 && y >= 7 && y < 15) || ell(x, y, 3, 7, 1.5, 1.5) || (y >= 13 && y < 16 && x >= 2 && x < 7)
      || (x >= 11.5 && x < 14.5 && y >= 5 && y < 12) || ell(x, y, 13, 5, 1.5, 1.5) || (y >= 10 && y < 13 && x >= 9 && x < 14);
    blob(p, shape, ['#1e3d24', '#2b5a2f', '#3c7a3a', '#56984a', '#7cb860'], { maxD: 2.5, k: 2, tex: 0.3, texS: 1.5, seed: 12 });
    for (let y = 4; y < 25; y += 3) { p.set(7, y, '#1a3320'); p.set(5, y + 1, '#e8e0b0'); p.set(10, y + 2, '#e8e0b0'); }
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A dry, twiggy desert bush. */
  dry_bush() {
    const p = new Pix(16, 10);
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.12 + 0.76 * (k / 8)), len = 4 + (k % 3) * 1.6;
      for (let t = 0; t < len; t += 0.5) p.set(Math.round(8 + Math.cos(a) * t * 1.5), Math.round(9 - Math.sin(a) * t), t > len - 1.5 ? '#a8874f' : '#7a5c34');
    }
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A sandstone rock, banded in reds and tans. */
  sandstone() {
    const p = new Pix(20, 14);
    blob(p, (x, y) => ell(x, y, 10, 8.5, 9, 5.5) || ell(x, y, 8, 5, 5, 4), ['#6a3a22', '#8a5230', '#a86a3e', '#c48650', '#d8a468'], { maxD: 3, k: 2, tex: 0.4, texS: 1.4, seed: 21 });
    for (let x = 3; x < 18; x++) { if (p.alpha(x, 9)) p.set(x, 9, '#7a4628'); if (p.alpha(x, 6)) p.set(x, 6, '#c88e58'); }
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A pine laden with snow, all year (for snowfields and peaks). */
  snowy_pine() {
    const c = PLACEHOLDER_SPRITES.pine(), g = c.getContext('2d')!, img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    // Snow settles on the top of each tier: the topmost green pixels of every column in each band turn white.
    for (let x = 0; x < c.width; x++) {
      let lastEmpty = true;
      for (let y = 0; y < c.height - 10; y++) {
        const i = (y * c.width + x) * 4, a = d[i + 3], green = a > 0 && d[i + 1] > d[i] + 12;
        if (green && (lastEmpty || (y % 8 === 3 && hash2(x, y, 3) > 0.35))) {
          for (let k = 0; k < 2 && y + k < c.height; k++) { const j = ((y + k) * c.width + x) * 4; if (d[j + 3] && d[j + 1] > d[j] + 12) { d[j] = 232 - k * 18; d[j + 1] = 240 - k * 16; d[j + 2] = 250 - k * 10; } }
        }
        lastEmpty = a === 0;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  },
  /** A grey rock with a cap of snow. */
  snow_rock() {
    const p = new Pix(18, 13);
    blob(p, (x, y) => ell(x, y, 9, 8, 8, 5), ['#2e2e36', '#46464f', '#5c5c66', '#74747e'], { maxD: 2.5, k: 2, seed: 8 });
    blob(p, (x, y) => ell(x, y, 9, 5.2, 6.5, 2.6) && y < 6.5, ['#b8c6d8', '#d8e2ee', '#f2f6fb'], { maxD: 2, k: 2, seed: 3 });
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** What's left of a tree that was cut down. */
  stump() {
    const p = new Pix(14, 8);
    blob(p, (x, y) => (y >= 2 && x >= 3 && x < 11) || ell(x, y, 7, 6.5, 6, 1.6), BARK, { maxD: 2, k: 2, seed: 4 });
    blob(p, (x, y) => ell(x, y, 7, 2, 4, 1.4), ['#a8743f', '#c8955a', '#e0b67a'], { maxD: 2, k: 2, seed: 2 });
    p.set(7, 2, '#8a5a35'); p.set(6, 2, '#c8955a');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A cave mouth for a cliff face: a rocky arch around darkness (sits flat on the wall). */
  cave_mouth() {
    const p = new Pix(32, 26);
    const inner = (x: number, y: number) => ell(x, y, 16, 17.5, 11, 11.5) && y <= 25;
    blob(p, (x, y) => ell(x, y, 16, 16, 15.5, 15) && y <= 25 && !inner(x, y), ['#24242b', '#383843', '#50515e', '#6b6d7b', '#8a8c99'], { maxD: 4, k: 3, tex: 0.5, texS: 2.2, seed: 31 });
    for (let y = 0; y < 26; y++) for (let x = 0; x < 32; x++) {
      if (!inner(x, y)) continue;
      p.set(x, y, y < 11 ? '#040406' : y < 16 ? '#08080c' : y < 21 ? '#0e0e14' : y < 24 ? '#15151c' : '#1d1d25');
    }
    // A few teeth of rock hanging into the dark, and a lip of floor.
    for (const [x, y] of [[9, 9], [9, 10], [13, 6], [13, 7], [14, 7], [19, 6], [20, 7], [23, 9], [23, 10], [23, 11]]) p.set(x, y, '#2c2c34');
    for (let x = 7; x < 26; x++) if (inner(x, 25)) p.set(x, 25, x % 3 ? '#262630' : '#30303b');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A square opening in a wall: a stone frame around a dark passage. */
  square_hole() {
    const p = new Pix(16, 20);
    const inner = (x: number, y: number) => x >= 3 && x <= 12 && y >= 4;
    blob(p, (x, y) => !inner(x, y), ['#34343d', '#4a4b56', '#646673', '#82848f'], { maxD: 2, k: 2, seed: 8 });
    // Mortar lines between the blocks.
    for (let x = 0; x < 16; x++) p.set(x, 3, '#2a2a32');
    for (const y of [8, 13]) { p.set(0, y, '#2a2a32'); p.set(1, y, '#2a2a32'); p.set(2, y, '#2a2a32'); p.set(13, y, '#2a2a32'); p.set(14, y, '#2a2a32'); p.set(15, y, '#2a2a32'); }
    for (const x of [5, 10]) for (let y = 0; y < 3; y++) p.set(x, y, '#2a2a32');
    for (let y = 4; y < 20; y++) for (let x = 3; x <= 12; x++) p.set(x, y, y < 9 ? '#050507' : y < 14 ? '#0a0a0f' : y < 18 ? '#111117' : '#18181f');
    for (let y = 4; y < 20; y++) p.set(3, y, '#1d1d24');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** A wooden door in an arched stone frame, for a wall or cliff face. */
  wall_door() {
    const p = new Pix(18, 26);
    const door = (x: number, y: number) => (x >= 3 && x <= 14 && y >= 8) || ell(x, y, 9, 8.5, 6, 5.5);
    blob(p, (x, y) => ((x >= 0 && x <= 17 && y >= 7) || ell(x, y, 9, 8, 9, 8)) && !door(x, y), ['#34343d', '#4a4b56', '#646673', '#82848f'], { maxD: 2, k: 2, seed: 12 });
    const wood = ['#5a361c', '#6b4325', '#7d5130'];
    for (let y = 0; y < 26; y++) for (let x = 0; x < 18; x++) {
      if (!door(x, y)) continue;
      const plank = Math.floor((x - 3) / 3);
      p.set(x, y, (x - 3) % 3 === 0 ? '#3d2412' : wood[(plank + (y > 16 ? 1 : 0)) % 3]);
    }
    // Iron bands with rivets, and the handle.
    for (const by of [11, 20]) for (let x = 3; x <= 14; x++) p.set(x, by, x % 3 === 1 ? '#8a8d99' : '#3a3a42');
    p.set(12, 16, '#f0d27a'); p.set(12, 17, '#c8a048'); p.set(11, 16, '#8a6a2a');
    p.outline(OUTLINE);
    return p.canvas();
  },
  /** What's left of something broken. */
  rubble() {
    const p = new Pix(20, 8), R = rng(13);
    blob(p, (x, y) => { for (let i = 0; i < 8; i++) if (ell(x, y, 2 + i * 2.3 + (i % 2), 6 - (i % 3) * 0.6, 1.8 + (i % 2) * 0.5, 1.5)) return true; return false; },
      ['#3d3f4a', '#5a5d6a', '#7c808d', '#a3a7b2'], { maxD: 2, k: 3, seed: 11 });
    for (let i = 0; i < 5; i++) p.set(Math.floor(R() * 18) + 1, 7, '#6b4325');
    p.outline(OUTLINE);
    return p.canvas();
  },
  chest() { return chestArt(false); },
  chest_open() { return chestArt(true); },
  /** A glint on the ground marking something to pick up. */
  sparkle() {
    const p = new Pix(10, 10);
    const gold = ['#fff8d6', '#ffe48a', '#f2c14e'];
    for (let i = -4; i <= 4; i++) {
      const c = gold[Math.min(2, Math.abs(i) >> 1)];
      p.set(4 + i, 5, c); p.set(4, 5 + i, c);
    }
    for (const [x, y] of [[3, 4], [5, 4], [3, 6], [5, 6]]) p.set(x, y, '#fff3b0');
    p.set(4, 5, '#ffffff');
    p.set(8, 1, '#ffe48a'); p.set(1, 8, '#fff3b0');
    return p.canvas();
  },
};

/** A wooden chest with iron bands; open shows the dark inside under a raised lid. */
function chestArt(open: boolean): HTMLCanvasElement {
  const p = new Pix(16, 14);
  const WOOD = ['#4a2d18', '#6b4325', '#8a5a35', '#a8743f'];
  const IRON = '#59566a', IRON_HI = '#9a98ab';
  if (open) {
    // Lid tipped back, seen from the front as a thin slab above the box.
    blob(p, (x, y) => x >= 1 && x < 15 && y >= 0 && y < 4, WOOD, { maxD: 2, k: 2, tex: 0.3, texS: 2, seed: 4 });
    p.rect(1, 3, 14, 1, IRON);
    blob(p, (x, y) => x >= 1 && x < 15 && y >= 5 && y < 14, WOOD, { maxD: 2, k: 2, tex: 0.3, texS: 2, seed: 6 });
    p.rect(2, 5, 12, 3, '#1b120c');
    p.rect(3, 6, 4, 1, '#e8c25a'); p.rect(9, 6, 3, 1, '#c79a3a');
    p.rect(1, 8, 14, 1, IRON);
  } else {
    blob(p, (x, y) => x >= 1 && x < 15 && ((y >= 3 && y < 14) || (y >= 1 && y < 3 && x >= 2 && x < 14)), WOOD, { maxD: 3, k: 2, tex: 0.3, texS: 2, seed: 6 });
    p.rect(1, 6, 14, 1, IRON);
    p.rect(3, 1, 1, 13, IRON); p.rect(12, 1, 1, 13, IRON);
    p.rect(7, 5, 2, 3, '#d9b44a'); p.set(7, 5, '#fff0a0'); p.set(8, 7, '#7a5a1a');
    p.set(3, 2, IRON_HI); p.set(12, 2, IRON_HI);
  }
  p.outline(OUTLINE);
  return p.canvas();
}

/** Four-frame flame strip, 12×18 per frame. */
export function flameStrip(): HTMLCanvasElement {
  const FW = 12, FH = 18, N = 4, p = new Pix(FW * N, FH);
  const pal = ['#fffbe8', '#ffe27a', '#ffab3d', '#f0642a', '#c23a1f'];
  for (let f = 0; f < N; f++)
    for (let y = 0; y < FH; y++)
      for (let x = 0; x < FW; x++) {
        const t = (FH - 1 - y) / (FH - 1), sway = Math.sin(t * 3.2 + f * 1.57) * 1.4 * t, cx = FW / 2 - 0.5 + sway;
        const hw = 4.8 * Math.pow(1 - t, 0.65) * (0.85 + 0.3 * vnoise(x * 0.5, y * 0.4 + f * 3, 4));
        const dx = Math.abs(x - cx);
        if (dx > hw || t > 0.96) continue;
        const r = (dx / Math.max(hw, 0.01)) * 0.7 + t * 0.55 + (vnoise(x * 0.7, y * 0.5 + f * 5, 8) - 0.5) * 0.3;
        p.set(f * FW + x, y, pal[clamp(Math.floor(r * pal.length + bayer(x, y) * 0.5 - 0.25), 0, pal.length - 1)]);
      }
  return p.canvas();
}

export const CHAR_FRAME_W = 16;
export const CHAR_FRAME_H = 24;

/** Built-in monster sheets (same layout as characters), for enemies. */
export const MONSTERS: Record<string, { name: string; draw: () => HTMLCanvasElement }> = {
  slime: { name: 'Green slime', draw: () => slimeSheet(['#d8ffb0', '#8ee05a', '#4fae3a', '#2a6e24']) },
  slime_blue: { name: 'Blue slime', draw: () => slimeSheet(['#d8f4ff', '#6ac0f0', '#2e7ad0', '#1a3e8a']) },
  slime_red: { name: 'Ember slime', draw: () => slimeSheet(['#ffe0b0', '#ff8a4a', '#d0402a', '#7a1a1a']) },
};

/** A bouncing slime: frames squash, rest, stretch; eyes show which way it faces. */
function slimeSheet(ramp: string[]): HTMLCanvasElement {
  const FW = CHAR_FRAME_W, FH = CHAR_FRAME_H, p = new Pix(FW * 3, FH * 4);
  const shapes = [{ w: 7.2, h: 4.6 }, { w: 6.4, h: 5.6 }, { w: 5.6, h: 6.8 }];
  for (let row = 0; row < 4; row++)
    for (let f = 0; f < 3; f++) {
      const ox = f * FW, oy = row * FH, { w, h } = shapes[f];
      const cx = ox + FW / 2, base = oy + FH - 1;
      for (let y = 0; y < FH; y++)
        for (let x = 0; x < FW; x++) {
          const dx = (ox + x + 0.5 - cx) / w, dy = (oy + y + 0.5 - (base - h)) / h;
          if (dy > 1 || dx * dx + dy * dy > 1) continue;
          // Light from the top left, a rim of dark at the bottom.
          const t = clamp((dx * 0.5 + dy * 0.8 + 0.6) / 1.6, 0, 0.999);
          p.set(ox + x, oy + y, ramp[Math.floor(t * ramp.length)]);
        }
      const top = base - h * 2;
      p.set(Math.round(cx - w * 0.45), Math.round(top + h * 0.55), '#ffffff');
      if (row !== 3) {
        const shift = row === 1 ? -2 : row === 2 ? 2 : 0, ey = Math.round(base - h * 0.9);
        for (const ex of row === 0 ? [-2, 1] : [shift - 1 + (row === 1 ? 0 : 1)]) { p.set(Math.round(cx + ex), ey, '#1a1420'); p.set(Math.round(cx + ex), ey + 1, '#1a1420'); }
      }
    }
  p.outline(OUTLINE);
  return p.canvas();
}

/** The look used when a character has neither a sheet nor a palette. */
export const DEFAULT_PALETTE: CharacterPalette = {
  hair: '#b5532a', hairLight: '#dc7c42', hairDark: '#93421f', skin: '#f0c39a', skinShade: '#cf9b72', eye: '#221a2a',
  tunic: '#2d5b8c', tunicShade: '#1f4166', tunicLight: '#4580ba', belt: '#6b4325', buckle: '#e2b84a',
  pants: '#4b4a5e', pantsShade: '#3a394b', boot: '#33261f', cape: '#9c2f2f', capeShade: '#721f24',
};

/** Character sheet in RPG Maker MV layout: 3 frames × 4 rows (down, left, right, up). */
export function characterSheet(C: CharacterPalette): HTMLCanvasElement {
  const FW = CHAR_FRAME_W, FH = CHAR_FRAME_H, p = new Pix(FW * 3, FH * 4);
  for (let row = 0; row < 4; row++)
    for (let f = 0; f < 3; f++) {
      const ph = f - 1, ox = f * FW, oy = row * FH + 1, mirror = row === 2;
      const r = (x: number, y: number, w: number, h: number, c: string) => p.rect(ox + (mirror ? FW - x - w : x), oy + y, w, h, c);
      if (row === 0 || row === 3) {
        const lL = ph === -1 ? 1 : 0, rL = ph === 1 ? 1 : 0;
        r(5, 17, 3, 3 + lL, C.pants); r(8, 17, 3, 3 + rL, C.pantsShade);
        r(5, 20 + lL, 3, 2, C.boot); r(8, 20 + rL, 3, 2, C.boot);
        const la = ph === 1 ? -1 : 0, ra = ph === -1 ? -1 : 0;
        r(3, 11 + la, 1, 4, C.tunicLight); r(3, 15 + la, 1, 1, C.skin);
        r(12, 11 + ra, 1, 4, C.tunicShade); r(12, 15 + ra, 1, 1, C.skinShade);
        r(4, 10, 8, 7, C.tunic); r(4, 10, 2, 7, C.tunicLight); r(10, 10, 2, 7, C.tunicShade);
        r(4, 15, 8, 1, C.belt);
        if (row === 0) {
          r(7, 15, 2, 1, C.buckle);
          r(4, 2, 8, 8, C.skin); r(10, 4, 2, 6, C.skinShade);
          r(4, 1, 8, 3, C.hair); r(3, 2, 1, 5, C.hair); r(12, 2, 1, 5, C.hair); r(5, 1, 4, 1, C.hairLight);
          r(4, 4, 2, 1, C.hair); r(9, 4, 3, 1, C.hair);
          r(6, 6, 1, 2, C.eye); r(9, 6, 1, 2, C.eye); r(7, 8, 2, 1, C.skinShade);
        } else {
          r(4, 10, 8, 6, C.cape); r(10, 10, 2, 6, C.capeShade); r(5, 16, 6, 1, C.capeShade);
          r(4, 1, 8, 9, C.hair); r(3, 2, 1, 6, C.hair); r(12, 2, 1, 6, C.hair); r(5, 2, 3, 1, C.hairLight); r(10, 3, 2, 6, C.hairDark);
        }
      } else {
        if (ph === 0) { r(6, 17, 4, 3, C.pants); r(6, 20, 4, 2, C.boot); }
        else { r(9, 17, 3, 3, C.pantsShade); r(10, 20, 2, 2, C.boot); r(4, 17, 3, 3, C.pants); r(3, 20, 3, 2, C.boot); }
        r(5, 10, 6, 7, C.tunic); r(5, 10, 2, 7, C.tunicLight); r(10, 10, 2, 6, C.cape); r(5, 15, 6, 1, C.belt);
        const ax = ph === 0 ? 7 : ph === -1 ? 6 : 8;
        r(ax, 11, 2, 4, C.tunicLight); r(ax, 15, 2, 1, C.skin);
        r(4, 2, 7, 8, C.skin); r(3, 6, 1, 2, C.skin);
        r(4, 1, 8, 3, C.hair); r(8, 3, 4, 6, C.hair); r(5, 1, 4, 1, C.hairLight); r(4, 4, 1, 1, C.hair);
        r(5, 6, 1, 2, C.eye);
      }
    }
  p.outline(OUTLINE);
  return p.canvas();
}

/** Ground texture painted from the terrain layer: 16 px per tile, noisy organic edges between types. */
export function groundCanvas(map: TileMap): HTMLCanvasElement {
  const TS = 16, w = map.w * TS, h = map.h * TS, p = new Pix(w, h);
  const G = ['#2a502b', '#346031', '#407238', '#4e843f', '#5f9746'];
  const P = ['#5e4630', '#6f5539', '#806444', '#94744f', '#a8875c'];
  const S = ['#a68e62', '#b9a170', '#cab17e', '#d9c08c'];
  const Wt = ['#16314a', '#1c3e5a', '#234b6a'];
  const D = ['#3e2d20', '#4a3626', '#56402c', '#634a33', '#70553b'];
  const Rk = ['#3a3540', '#4a4552', '#5a5463', '#6b6474', '#7c7584'];
  const Sn = ['#b8c7da', '#c9d6e6', '#d8e3f0', '#e6eef7', '#f4f8fc'];
  const BUILT_IN = '.=:~▒▦▲❄';
  const cat = map.tiles, isB = (k: string) => BUILT_IN.includes(k) && !cat.isCustom(k);
  const wet = (x: number, z: number) => !!map.waterAt(x, z);
  // Edges only blend between cells at the same height (and both wet or both dry): across a height
  // change the ground is cut by a straight cliff.
  // Hills run into each other, so they blend whatever their heights.
  const sameLevel = (ax: number, az: number, bx: number, bz: number) => (map.step(ax, az) === map.step(bx, bz) || (map.isHill(ax, az) && map.isHill(bx, bz))) && wet(ax, az) === wet(bx, bz);

  // What each cell paints when nothing spreads into it. Imported tiles are drawn on top separately; under
  // them goes the highest-priority built-in neighbour, so their edges can give way to it.
  const base: string[] = [];
  for (let z = 0; z < map.h; z++)
    for (let x = 0; x < map.w; x++) {
      const k = map.terrain(x, z);
      if (isB(k)) { base.push(k); continue; }
      let best = '.', bp = -Infinity;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!map.inMap(nx, nz) || !sameLevel(x, z, nx, nz)) continue;
        const nk = map.terrain(nx, nz);
        if (isB(nk) && cat.blendFor(nk).priority > bp) { best = nk; bp = cat.blendFor(nk).priority; }
      }
      base.push(best);
    }

  /** The built-in tile painted at a pixel, and for smooth edges the tile it fades into (with its share f). */
  const tileAt = (px: number, py: number): { k: string; other: string | null; f: number } => {
    const ox = clamp(Math.floor(px / TS), 0, map.w - 1), oz = clamp(Math.floor(py / TS), 0, map.h - 1);
    const ko = map.terrain(ox, oz), bo = cat.blendFor(ko), own = base[oz * map.w + ox];
    if (!bo.blend) return { k: own, other: null, f: 0 };
    const u = (px + 0.5) / TS, v = (py + 0.5) / TS;
    const n = vnoise(px / 6.5, py / 6.5, 11) * 0.75 + hash2(px, py, 31) * 0.25;
    let best: string | null = null, bp = -Infinity, bf = 0;
    for (const [dx, dz] of NEIGHBOURS8) {
      const cx = ox + dx, cz = oz + dz;
      if (!map.inMap(cx, cz)) continue;
      const kc = map.terrain(cx, cz);
      if (kc === ko || !isB(kc)) continue;
      const bc = cat.blendFor(kc);
      if (!bc.blend || bc.priority <= bo.priority || bc.priority <= bp || !sameLevel(ox, oz, cx, cz)) continue;
      const d = cellDistance(u, v, cx, cz), r = reach(bc, n);
      let f: number;
      if (bc.edge === 'smooth') f = 1 - smoothstep(r - 0.14, r + 0.06, d);
      else if (bc.edge === 'dither') f = d < r + (bayer(px, py) - 0.5) * 0.18 ? 1 : 0;
      else f = d < r ? 1 : 0;
      if (f <= 0) continue;
      best = kc; bp = bc.priority; bf = f;
    }
    if (!best) return { k: own, other: null, f: 0 };
    return bf >= 1 ? { k: best, other: null, f: 0 } : { k: own, other: best, f: bf };
  };

  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const at = tileAt(px, py), up = tileAt(px, py - 2).k;
      const n = vnoise(px / 10, py / 10, 5) * 0.55 + hash2(px, py, 9) * 0.45, hs = hash2(px, py, 17);
      const pick = (r: string[]) => r[clamp(Math.floor(n * (r.length - 1) + bayer(px, py) * 0.9), 0, r.length - 1)];
      const colour = (t: string): string => {
        if (t === '.') return hs > 0.9975 ? '#e7d36a' : hs > 0.985 ? '#86b85a' : pick(G);
        // A darker lip where a tile sits just below grass (or the lake bed's edge), for depth.
        if (t === '=') return up === '.' ? '#463424' : hs > 0.975 ? (hs > 0.99 ? '#b8a283' : '#4d3a28') : pick(P);
        if (t === ':') return up === '.' ? '#7d6c4a' : pick(S);
        if (t === '▒') return up === '.' ? '#33251a' : hs > 0.975 ? '#7d6a52' : pick(D);
        if (t === '▦') return stoneAt(px & 15, py & 15, 800);
        if (t === '▲') return hs > 0.97 ? '#2f2b35' : pick(Rk);
        if (t === '❄') return hs > 0.992 ? '#ffffff' : pick(Sn);
        return up !== '~' ? '#0f2236' : pick(Wt);
      };
      p.set(px, py, at.other ? mixHex(colour(at.k), colour(at.other), at.f) : colour(at.k));
    }
  return p.canvas();
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function mixHex(a: string, b: string, f: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - f) + ((pb >> sh) & 255) * f);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

export function grassTile(seed: number): HTMLCanvasElement {
  const p = new Pix(16, 16), G = ['#2a502b', '#346031', '#407238', '#4e843f', '#5f9746'];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = vnoise(x / 5, y / 5, seed) * 0.5 + hash2(x, y, seed) * 0.5;
      p.set(x, y, hash2(x, y, seed + 3) > 0.97 ? '#86b85a' : G[clamp(Math.floor(n * 4 + bayer(x, y) * 0.9), 0, 4)]);
    }
  return p.canvas();
}

export function cliffTile(): HTMLCanvasElement {
  const p = new Pix(16, 16), R = ['#3a3443', '#4c4556', '#615868', '#776d7d', '#8d8392'];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const lip = 3 + (hash2(x, 0, 77) < 0.5 ? 1 : 0);
      if (y < lip) { p.set(x, y, ['#346031', '#407238', '#4e843f'][clamp(Math.floor(hash2(x, y, 4) * 2 + bayer(x, y)), 0, 2)]); continue; }
      const row = Math.floor((y - 3) / 4), bx = (x + (row % 2) * 4) % 8;
      if (bx === 0 || (y - 3) % 4 === 0) { p.set(x, y, '#29232f'); continue; }
      const n = vnoise(x / 3, y / 3, row + 2) * 0.6 + (bx < 3 ? 0.25 : 0) + ((y - 3) % 4 === 1 ? 0.2 : 0);
      p.set(x, y, R[clamp(Math.floor(n * 4 + bayer(x, y) * 0.8), 0, 4)]);
    }
  return p.canvas();
}

/** Stone paving: flagstones of a few greys with dark joints, the rows offset. */
function stoneTile(seed: number): HTMLCanvasElement {
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) p.set(x, y, stoneAt(x, y, seed));
  return p.canvas();
}
const PAVING = ['#5d5a60', '#6b686f', '#79767d', '#88858c', '#96939a'];
function stoneAt(x: number, y: number, seed: number): string {
  const row = Math.floor(y / 8), bx = (x + (row % 2) * 4) & 7, by = y & 7;
  if (bx === 0 || by === 0) return '#3f3c43';
  const slab = Math.floor((x + (row % 2) * 4) / 8) * 31 + row * 17;
  const n = hash2(slab, row, seed) * 0.6 + vnoise(x / 3, y / 3, seed) * 0.4 + (bx === 1 || by === 1 ? 0.18 : 0) - (bx === 7 || by === 7 ? 0.12 : 0);
  return PAVING[clamp(Math.floor(n * 4 + bayer(x, y) * 0.7), 0, 4)];
}

function noiseTile(ramp: string[], seed: number, speckle?: [number, string]): HTMLCanvasElement {
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const n = vnoise(x / 5, y / 5, seed) * 0.5 + hash2(x, y, seed) * 0.5;
      let c = ramp[clamp(Math.floor(n * (ramp.length - 1) + bayer(x, y) * 0.9), 0, ramp.length - 1)];
      if (speckle && hash2(x, y, seed + 7) > speckle[0]) c = speckle[1];
      p.set(x, y, c);
    }
  return p.canvas();
}

/** One 16 × 16 tile of a built-in ground type (grass ".", path "=", sand ":", water "~"); variants differ in detail. */
export function builtinTileArt(key: string, variant = 0): HTMLCanvasElement {
  switch (key) {
    case '=': return noiseTile(['#6f5539', '#806444', '#94744f', '#a8875c'], 200 + variant, [0.975, '#4d3a28']);
    case ':': return noiseTile(['#b9a170', '#cab17e', '#d9c08c'], 300 + variant);
    case '~': return noiseTile(['#1c3e5a', '#234b6a', '#2c5a7c'], 400 + variant, [0.985, '#5f93b8']);
    case '#': return noiseTile(['#407238', '#4e843f', '#5f9746', '#70a852'], 500 + variant);
    case 'rock': case '▲': return noiseTile(['#4a4552', '#5a5463', '#6b6474', '#7c7584'], 600 + variant, [0.97, '#3a3540']);
    case '▒': return noiseTile(['#4a3626', '#56402c', '#634a33', '#70553b'], 700 + variant, [0.97, '#7d6a52']);
    case '▦': return stoneTile(800 + variant);
    case '❄': return noiseTile(['#c9d6e6', '#d8e3f0', '#e6eef7', '#f4f8fc'], 900 + variant, [0.985, '#b4c4d8']);
    default: return grassTile(100 + variant);
  }
}

/** Tileable rock for cliff walls (one tile square). */
export function rockFace(): HTMLCanvasElement {
  const p = new Pix(16, 16), R = ['#3a3443', '#4c4556', '#615868', '#776d7d', '#8d8392'];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 4), bx = (x + (row % 2) * 4) % 8;
      if (bx === 0 || y % 4 === 0) { p.set(x, y, '#29232f'); continue; }
      const n = vnoise(x / 3, y / 3, row + 2) * 0.6 + (bx < 3 ? 0.25 : 0) + (y % 4 === 1 ? 0.2 : 0);
      p.set(x, y, R[clamp(Math.floor(n * 4 + bayer(x, y) * 0.8), 0, 4)]);
    }
  return p.canvas();
}

/** Tileable water ripple normal map. */
/**
 * Glowing liquid (lava, poison goo): a tileable pattern of bright cracks and dimmer crust, used as its glow map
 * (so it glows unevenly, brightest along the seams).
 */
export function glowPattern(): HTMLCanvasElement {
  const S = 64, out = new Uint8ClampedArray(S * S * 4);
  const waves: [number, number, number][] = [[2, 1, 0.3], [-1, 3, 1.7], [3, -2, 2.4], [1, 4, 0.9], [-4, -1, 3.1]];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const [a, b, ph] of waves) v += Math.sin((2 * Math.PI * (a * x + b * y)) / S + ph);
      // Seams where the sum crosses zero glow brightest; the crust between is dim.
      const seam = Math.max(0, 1 - Math.abs(v) / 0.9), k = 0.28 + 0.72 * seam * seam;
      const i = (y * S + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = Math.round(255 * k); out[i + 3] = 255;
    }
  return canvasFromRGBA(out, S, S);
}

/** Frozen water: pale blue ice with darker depths, white cracks and a few frosty streaks (tileable). */
export function iceTile(): HTMLCanvasElement {
  const N = 64, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9cc8dc'; g.fillRect(0, 0, N, N);
  // Darker patches where the water under it is deeper, lighter frosty ones.
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 26; k++) {
    const x = r() * N, y = r() * N, rad = 4 + r() * 10, light = r() < 0.5;
    g.fillStyle = light ? 'rgba(230,246,255,0.35)' : 'rgba(60,110,140,0.22)';
    for (const [ox, oy] of [[0, 0], [N, 0], [-N, 0], [0, N], [0, -N]]) { g.beginPath(); g.ellipse(x + ox, y + oy, rad, rad * 0.6, r() * 3, 0, Math.PI * 2); g.fill(); }
  }
  // Cracks: thin white zig-zags.
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
  for (let k = 0; k < 5; k++) {
    let x = r() * N, y = r() * N;
    g.beginPath(); g.moveTo(x, y);
    for (let s2 = 0; s2 < 5; s2++) { x += (r() - 0.5) * 18; y += (r() - 0.5) * 18; g.lineTo(x, y); }
    g.stroke();
  }
  // Streaks of frost.
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
  for (let k = 0; k < 6; k++) { const y = r() * N, x = r() * N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14 + r() * 10, y - 3 - r() * 4); g.stroke(); }
  return c;
}

export function rippleNormals(): HTMLCanvasElement {
  // Many small wavelets in different directions (tileable): a busy, fine surface rather than a few big swells, so
  // the light breaks into small glints instead of shining off broad bumps.
  const S = 64, out = new Uint8ClampedArray(S * S * 4);
  const waves: [number, number, number, number][] = [[2, 3, 0.5, 0.2], [-3, 2, 0.45, 1.3], [4, -1, 0.35, 2.1], [1, 5, 0.3, 0.7], [-5, -3, 0.25, 2.8], [6, 2, 0.2, 1.9], [-2, 7, 0.18, 0.4], [7, -5, 0.14, 3.3]];
  const ht = (x: number, y: number) => waves.reduce((s, [a, b, amp, ph]) => s + amp * Math.sin((2 * Math.PI * (a * x + b * y)) / S + ph), 0);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const nx = -(ht(x + 1, y) - ht(x - 1, y)) * 1.2, ny = (ht(x, y + 1) - ht(x, y - 1)) * 1.2, nz = 1;
      const l = Math.hypot(nx, ny, nz), i = (y * S + x) * 4;
      out[i] = (nx / l * 0.5 + 0.5) * 255; out[i + 1] = (ny / l * 0.5 + 0.5) * 255; out[i + 2] = (nz / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
    }
  return canvasFromRGBA(out, S, S);
}

export function softDot(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return c;
}

/** Corner-bracket tile marker. */
export function tileCursor(): HTMLCanvasElement {
  const p = new Pix(16, 16);
  for (let i = 0; i < 16; i++) if (i < 4 || i > 11) { p.set(i, 0, '#ffffff'); p.set(i, 15, '#ffffff'); p.set(0, i, '#ffffff'); p.set(15, i, '#ffffff'); }
  return p.canvas();
}


/**
 * A boulder `w` × `h` (mossy on top), optionally seamed with ore: `ore` is the ore's ramp (dark → bright), drawn as
 * veins and glinting nuggets across the stone.
 */
function boulderArt(w: number, h: number, seed: number, ore: string[] | null): HTMLCanvasElement {
  const p = new Pix(w, h);
  const cx = w / 2, cy = h * 0.6;
  const ramp = ore ? ['#2c2d36', '#40424d', '#5a5d69', '#7a7d8a', '#a2a5b0'] : STONE;
  const m = blob(p, (x, y) => ell(x, y, cx, cy, w / 2 - 0.5, h * 0.42) || ell(x, y, cx - w * 0.14, cy - h * 0.2, w * 0.3, h * 0.3) || ell(x, y, cx + w * 0.16, cy - h * 0.12, w * 0.26, h * 0.27),
    ramp, { maxD: 6, k: 3, tex: 0.4, texS: 2.5, seed });
  const R = rng(seed);
  if (ore) {
    // Veins: short wandering seams, with bright nuggets along them.
    for (let v = 0; v < 5; v++) {
      let x = 3 + R() * (w - 6), y = h * 0.3 + R() * h * 0.5;
      for (let i = 0; i < 7; i++) {
        const xi = Math.floor(x), yi = Math.floor(y);
        if (m[yi * w + xi]) p.set(xi, yi, ore[i % 3 === 0 ? 2 : 1]);
        if (i % 3 === 1 && m[yi * w + xi + 1]) { p.set(xi + 1, yi, ore[3]); p.set(xi, yi, ore[2]); }
        x += R() * 2.4 - 1.2; y += R() * 1.6 - 0.5;
      }
    }
    for (let i = 0; i < 6; i++) { const x = Math.floor(2 + R() * (w - 4)), y = Math.floor(h * 0.25 + R() * h * 0.6); if (m[y * w + x]) { p.set(x, y, ore[3]); if (m[y * w + x - 1]) p.set(x - 1, y, ore[1]); } }
  } else {
    // Moss along the top, and a few cracks.
    for (let y = 1; y < h * 0.55; y++)
      for (let x = 0; x < w; x++)
        if (m[y * w + x] && !m[Math.max(0, y - 2) * w + x] && vnoise(x / 2.5, y / 2.5, seed) > 0.32) p.set(x, y, vnoise(x, y, seed + 1) > 0.5 ? '#5f8c45' : '#466b37');
    for (const [x, y] of [[cx - 4, cy + 1], [cx - 3, cy + 2], [cx - 3, cy + 3], [cx + 5, cy - 2], [cx + 6, cy - 1]]) if (m[Math.floor(y) * w + Math.floor(x)]) p.set(Math.floor(x), Math.floor(y), '#23242c');
  }
  p.outline(OUTLINE);
  return p.canvas();
}
