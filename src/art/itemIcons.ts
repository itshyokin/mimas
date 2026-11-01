/**
 * Built-in item icons: 16 × 16 pixel art drawn in code, with a dark outline.
 * An item's `icon` is "builtin:<name>" for these, or an imported image path.
 */
import { Pix, ell, segD } from '../core/pixel';

const OUT = '#1a1420';
type Draw = (p: Pix) => void;

/** Fill every pixel where `inside` is true, shading from `light` (top-left) to `dark` (bottom-right). */
function fill(p: Pix, inside: (x: number, y: number) => boolean, ramp: string[]): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const t = Math.min(ramp.length - 1, Math.max(0, Math.floor(((x + y) / 30) * ramp.length)));
      p.set(x, y, ramp[t]);
    }
}
const line = (p: Pix, x0: number, y0: number, x1: number, y1: number, w: number, ramp: string[]) =>
  fill(p, (x, y) => segD(x, y, x0, y0, x1, y1) <= w, ramp);

/** A fish facing right: body (length rx, height ry), a forked tail and an eye; `spots` adds a few marks. */
function fishArt(ramp: string[], rx: number, ry: number, spots?: string): Draw {
  return (p) => {
    const cx = 9.2 - (5.4 - rx) * 0.4;
    fill(p, (x, y) => ell(x, y, cx, 8.5, rx, ry) || (x < cx - rx + 1.2 && x > cx - rx - 3 && Math.abs(y - 8.5) < (cx - rx + 1.2 - x) * 0.9 + 0.3), ramp);
    p.set(Math.round(cx + rx * 0.55), 7, '#1a1420');
    if (spots) for (const [x, y] of [[Math.round(cx - 1), 8], [Math.round(cx + 1), 10], [Math.round(cx - 2), 10]]) p.set(x, y, spots);
  };
}

function flask(liquid: string[]): Draw {
  return (p) => {
    fill(p, (x, y) => ell(x, y, 8, 10.5, 5, 4.6), ['#e8f4ff', '#b8d2e6', '#8aa8c2']);
    fill(p, (x, y) => ell(x, y, 8, 11, 4.2, 3.8) && y > 9, liquid);
    fill(p, (x, y) => x >= 6.5 && x <= 9.5 && y >= 3 && y <= 6.5, ['#d8ecfa', '#a8c4da']);
    fill(p, (x, y) => x >= 6 && x <= 10 && y >= 1.5 && y <= 3.5, ['#a87a4a', '#7a5434']);
    p.set(6, 9, '#ffffff'); p.set(5, 10, '#ffffff');
  };
}

/** A band with a gem on top. */
function ringIcon(band: string[], gem: string[]): Draw {
  return (p) => {
    fill(p, (x, y) => ell(x, y, 8, 10, 5, 4.5) && !ell(x, y, 8, 10, 3, 2.6), band);
    fill(p, (x, y) => ell(x, y, 8, 4.5, 2.4, 2.2), gem);
    p.set(7, 3, '#ffffff');
  };
}

/** Inside a convex polygon (points clockwise on screen)? */
function inPoly(x: number, y: number, pts: [number, number][]): boolean {
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    if ((bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) return false;
  }
  return true;
}

/**
 * A spell shard: a long crystal with a bright left facet and a darker right one (ramp light → dark), a glinting
 * edge down the middle and a small glow mark of the spell in its heart.
 */
function shard(ramp: [string, string, string, string], mark: string): Draw {
  const outline: [number, number][] = [[8, 0.6], [12.2, 4.6], [11.2, 12], [8, 15.4], [4.8, 12], [3.8, 4.6]];
  return (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        if (!inPoly(cx, cy, outline)) continue;
        // Facets: the left face catches the light, the right is in shade, the top caps are brightest.
        const left = cx < 8 - (cy - 8) * 0.12, top = cy < 4.8;
        p.set(x, y, top ? (left ? ramp[0] : ramp[1]) : left ? ramp[1] : cy > 11.5 ? ramp[3] : ramp[2]);
      }
    for (let y = 2; y < 14; y++) p.set(y < 5 ? 8 : 7, y, ramp[0]);
    p.set(8, 7, mark); p.set(8, 8, mark); p.set(9, 8, mark); p.set(8, 9, mark);
    p.set(6, 3, '#ffffff'); p.set(5, 5, '#ffffff');
  };
}

/** A lump of rock: stone, or ore with bright flecks (`fleck` ramp, or none for plain stone). */
function lump(rock: string[], fleck: string[] | null): Draw {
  return (p) => {
    fill(p, (x, y) => ell(x, y, 8, 9.5, 6, 4.8) || ell(x, y, 6, 7.5, 3.5, 3.2), rock);
    if (fleck) for (const [x, y, k] of [[5, 7, 0], [6, 8, 1], [9, 9, 0], [10, 10, 1], [7, 11, 0], [11, 8, 1], [8, 6, 1]] as [number, number, number][]) p.set(x, y, fleck[k]);
    else { p.set(5, 7, '#c8cbd4'); p.set(9, 11, '#3a3c46'); p.set(10, 11, '#3a3c46'); }
  };
}

/** An ingot: a trapezoid bar with a bright top face. */
function ingot(ramp: string[], top: string): Draw {
  return (p) => {
    fill(p, (x, y) => y >= 7 && y <= 12 && x >= 2 + (12 - y) * 0.3 && x <= 14 - (12 - y) * 0.3, ramp);
    fill(p, (x, y) => y >= 5 && y < 7.5 && x >= 4 + (7 - y) * 0.6 && x <= 12 - (7 - y) * 0.6, [top]);
    p.set(5, 6, '#ffffff');
  };
}

export const ITEM_ICONS: Record<string, { name: string; draw: Draw }> = {
  stone: { name: 'Stone', draw: lump(['#b2b5bf', '#878b98', '#5c5f6c', '#3c3e48'], null) },
  ore_iron: { name: 'Iron ore', draw: lump(['#8a8d99', '#666975', '#4a4c57', '#33343d'], ['#e8a066', '#a8582a']) },
  ore_gold: { name: 'Gold ore', draw: lump(['#7a7d8a', '#5a5d69', '#40424d', '#2c2d36'], ['#fff0a0', '#e0b030']) },
  ore_silver: { name: 'Silver ore', draw: lump(['#7a7d8a', '#5a5d69', '#40424d', '#2c2d36'], ['#ffffff', '#b8c4d8']) },
  ingot_iron: { name: 'Iron ingot', draw: ingot(['#9aa0ac', '#6e7480', '#4a4f5a'], '#c4c9d2') },
  ingot_steel: { name: 'Steel ingot', draw: ingot(['#c2cad8', '#8a94a8', '#5c6478'], '#eef2fa') },
  ingot_gold: { name: 'Gold ingot', draw: ingot(['#ffd86a', '#e0a82a', '#a8761a'], '#fff2b0') },
  ingot_silver: { name: 'Silver ingot', draw: ingot(['#eef2f8', '#b8c0d0', '#8088a0'], '#ffffff') },
  pickaxe: { name: 'Pickaxe', draw: (p) => {
    line(p, 3, 14, 11, 5, 0.9, ['#a8784a', '#6a4428']);
    fill(p, (x, y) => segD(x, y, 5.5, 3, 15, 8) <= 1.3 && y < 9, ['#eef2fa', '#aab4c4', '#7a8498']);
  } },
  hammer: { name: 'War hammer', draw: (p) => {
    line(p, 3, 14, 10, 6, 0.9, ['#a8784a', '#6a4428']);
    fill(p, (x, y) => segD(x, y, 8, 3, 13.5, 8.5) <= 2.4, ['#c2cad8', '#8a94a8', '#5c6478']);
  } },

  fishing_rod: { name: 'Fishing rod', draw: (p) => {
    line(p, 2, 15, 13, 2, 0.75, ['#c89a5c', '#8a5c30']);
    fill(p, (x, y) => ell(x, y, 5, 12, 1.6, 1.6), ['#c4ccd8', '#7a8494']);
    for (let y = 3; y <= 12; y++) p.set(14, y, '#e8eef8');
    fill(p, (x, y) => ell(x, y, 14, 13.2, 1.2, 1.2), ['#ff6a5a', '#c83a32']);
  } },
  fish_minnow: { name: 'Small fish', draw: fishArt(['#e8f0f8', '#a8b8cc', '#6a7c94'], 3.2, 2) },
  fish_trout: { name: 'Trout', draw: fishArt(['#d8e8b8', '#8cae6a', '#4e7240'], 5.4, 2.6, '#c84a4a') },
  fish_eel: { name: 'Eel', draw: (p) => {
    fill(p, (x, y) => segD(x, y, 2, 11, 7, 6) <= 1.5 || segD(x, y, 7, 6, 11, 9) <= 1.6 || segD(x, y, 11, 9, 14, 4) <= 1.4, ['#9a8ad8', '#5c4c9c', '#3a2c6a']);
    p.set(13, 4, '#ffffff');
  } },
  fish_koi: { name: 'Golden fish', draw: fishArt(['#fff2a0', '#ffc43a', '#d8841a'], 5, 3, '#ffffff') },
  boot: { name: 'Old boot', draw: (p) => {
    fill(p, (x, y) => (x >= 5 && x <= 10 && y >= 2 && y <= 12) || ell(x, y, 9.5, 12.2, 5, 2.4), ['#a87a52', '#7a5434', '#4e3420']);
    line(p, 5, 4, 10, 4, 0.5, ['#4e3420']);
    p.set(12, 10, '#5a8a3a'); p.set(13, 9, '#5a8a3a');
  } },

  potion: { name: 'Red potion', draw: flask(['#ff6b6b', '#d83a3a', '#a01e2a']) },
  ether: { name: 'Blue potion', draw: flask(['#7cc0ff', '#3a7ce0', '#1f4aa0']) },
  tonic: { name: 'Green potion', draw: flask(['#b6f07a', '#6cbf3a', '#3a8424']) },
  herb: { name: 'Herb', draw: (p) => {
    line(p, 8, 15, 8, 6, 0.6, ['#4a7a2c']);
    fill(p, (x, y) => ell(x, y, 5, 7, 3.2, 1.8) || ell(x, y, 11, 6, 3.2, 1.8) || ell(x, y, 6, 11, 3, 1.6) || ell(x, y, 10.5, 10.5, 3, 1.6) || ell(x, y, 8, 3.5, 1.8, 2.5), ['#a8e070', '#6cb444', '#3f7f2a']);
  } },
  bread: { name: 'Bread', draw: (p) => {
    fill(p, (x, y) => ell(x, y, 8, 9.5, 7, 4.5), ['#f2c47a', '#d8964a', '#a8662c']);
    for (const cx of [5, 8, 11]) line(p, cx - 1, 8, cx + 1, 10.5, 0.45, ['#8a4e20']);
  } },
  apple: { name: 'Apple', draw: (p) => {
    fill(p, (x, y) => ell(x, y, 6.2, 9.5, 4, 4.8) || ell(x, y, 9.8, 9.5, 4, 4.8), ['#ff7a6a', '#e03a32', '#9c1e22']);
    line(p, 8, 5, 9, 2, 0.5, ['#6a4422']);
    fill(p, (x, y) => ell(x, y, 11, 3.5, 2.2, 1.2), ['#8ad060', '#4e9a34']);
    p.set(5, 7, '#ffd0c8');
  } },
  flashlight: { name: 'Flashlight', draw: (p) => {
    line(p, 3, 13, 10, 6, 2.1, ['#9aa4b4', '#6a7484', '#464e5c']);
    fill(p, (x, y) => segD(x, y, 10, 6, 12.5, 3.5) <= 3, ['#c4ccd8', '#8a94a4']);
    fill(p, (x, y) => segD(x, y, 12, 3, 13.4, 1.6) <= 2.2 && x + y > 13.5, ['#fff6b0', '#ffd84a']);
    p.set(6, 10, '#d84a3a');
  } },
  lantern: { name: 'Lantern', draw: (p) => {
    fill(p, (x, y) => (x >= 4 && x <= 12 && y >= 4 && y <= 5.5) || (x >= 4 && x <= 12 && y >= 13 && y <= 14.5), ['#6a5a4a', '#4a3e34']);
    fill(p, (x, y) => x >= 5 && x <= 11 && y >= 5.5 && y <= 13, ['#fff2a0', '#ffc24a', '#e08a2a']);
    for (const x of [5, 8, 11]) for (let y = 6; y < 13; y++) p.set(x, y, '#5a4a3c');
    fill(p, (x, y) => !ell(x, y, 8, 3.6, 2.4, 2.2) && ell(x, y, 8, 3.6, 3.4, 3), ['#8a7a6a']);
    p.set(8, 9, '#ffffff');
  } },
  torch: { name: 'Torch', draw: (p) => {
    line(p, 5, 15, 9.5, 7, 1.2, ['#a87a4a', '#7a5434']);
    fill(p, (x, y) => ell(x, y, 10.5, 5, 3, 4) && y < 8, ['#fff2a0', '#ffb43a', '#ff6a2a']);
    fill(p, (x, y) => ell(x, y, 10.5, 5.5, 1.4, 2), ['#fffbe0']);
  } },
  sword: { name: 'Sword', draw: (p) => {
    line(p, 6, 10, 14, 2, 1.2, ['#f2f6ff', '#c2cad8', '#8a94a8']);
    line(p, 3, 9, 7, 13, 0.9, ['#ffd86a', '#c89a2a']);
    line(p, 2, 14, 5, 11, 0.9, ['#8a5a34', '#5a3a22']);
  } },
  greatsword: { name: 'Greatsword', draw: (p) => {
    line(p, 5, 11, 14.5, 1.5, 1.7, ['#f2f6ff', '#c2cad8', '#8a94a8']);
    line(p, 2, 9, 7, 14, 1, ['#d8dce8', '#8a94a8']);
    line(p, 1.5, 14.5, 4, 12, 1, ['#5a3a22']);
  } },
  axe: { name: 'Great axe', draw: (p) => {
    line(p, 3, 14, 12, 4, 0.9, ['#a8784a', '#6a4428']);
    fill(p, (x, y) => ell(x, y, 11.5, 4.5, 3.6, 3.4) && x + y > 13.5, ['#eef2fa', '#aab4c4', '#7a8498']);
  } },
  bow: { name: 'Bow', draw: (p) => {
    fill(p, (x, y) => { const d = Math.hypot(x - 2, y - 14); return d > 10.2 && d < 11.8 && x > 1 && y < 15; }, ['#d8a060', '#a8703a', '#6a4422']);
    line(p, 2.6, 3.4, 12.6, 13.4, 0.35, ['#f0ead8']);
  } },
  arrow: { name: 'Arrow', draw: (p) => {
    line(p, 3, 13, 12, 4, 0.6, ['#c8a070', '#8a6a40']);
    fill(p, (x, y) => x > 10.5 && y < 5.5 && x - y < 10.5 && x + y > 13, ['#c8ccd8', '#8a90a0']);
    line(p, 2, 12, 4, 14, 0.8, ['#e8e0d0']);
  } },
  arrow_steel: { name: 'Steel arrow', draw: (p) => {
    line(p, 3, 13, 12, 4, 0.6, ['#5a5450', '#3a3430']);
    fill(p, (x, y) => x > 10 && y < 6 && x - y < 10.5 && x + y > 12.5, ['#f4f8ff', '#b8c4d8', '#7a8aa8']);
    line(p, 2, 12, 4, 14, 0.8, ['#c84a3a']);
  } },
  spell_fire: { name: 'Fire spell', draw: (p) => {
    fill(p, (x, y) => { const t = (y - 2) / 13; if (t < 0 || t > 1) return false; const w = Math.sin(t * Math.PI * 0.95) * 5.5 * (0.75 + 0.25 * Math.sin(y * 1.7)); return Math.abs(x - 8 - Math.sin(y * 0.6) * (1 - t)) < w; }, ['#fff6c8', '#ffd04a', '#ff8a2a', '#d8431e']);
    fill(p, (x, y) => ell(x, y, 8, 11, 2.2, 3), ['#fffbe8', '#ffe48a']);
  } },
  log: { name: 'Firewood', draw: (p) => {
    line(p, 3, 11, 13, 6, 2.2, ['#a8743f', '#7a4f2d', '#5a3820']);
    line(p, 2, 8, 11, 12, 1.8, ['#94673b', '#6b4325', '#4a2d18']);
    fill(p, (x, y) => ell(x, y, 13, 6, 1.7, 2), ['#f0cf94', '#c8955a']);
    fill(p, (x, y) => ell(x, y, 11.2, 12, 1.4, 1.7), ['#e0b67a', '#b07a48']);
  } },
  shard_fire: { name: 'Fire shard', draw: shard(['#ffe9a8', '#ffab3d', '#e8582a', '#a8301c'], '#fff6d0') },
  shard_frost: { name: 'Frost shard', draw: shard(['#effaff', '#9ad8ff', '#4e9ae8', '#2a5aa8'], '#ffffff') },
  shard_spark: { name: 'Lightning shard', draw: shard(['#fffbd0', '#ffe45a', '#e0b02a', '#9a6e14'], '#ffffff') },
  shard_venom: { name: 'Poison shard', draw: shard(['#e4ffb8', '#9ee05a', '#55a834', '#2e6a24'], '#f4ffd8') },
  shard_arcane: { name: 'Arcane shard', draw: shard(['#f4dcff', '#c48aff', '#8a4ee0', '#552c9a'], '#ffffff') },
  shard_light: { name: 'Light shard', draw: shard(['#ffffff', '#fff2c0', '#e8cf7a', '#b0924a'], '#ffffff') },
  shard_shadow: { name: 'Shadow shard', draw: shard(['#b8a8d8', '#6a5a94', '#3e3462', '#221c3a'], '#d8c8ff') },
  shard_earth: { name: 'Earth shard', draw: shard(['#f0d8a8', '#c89a5a', '#8a6232', '#5a3c1e'], '#fff0c8') },
  shard_tide: { name: 'Water shard', draw: shard(['#e4fbff', '#7ee0f0', '#2fa6c8', '#1a5f86'], '#ffffff') },
  fist: { name: 'Fist', draw: (p) => {
    fill(p, (x, y) => ell(x, y, 8, 8.5, 5, 4.5) || (x > 3.5 && x < 12.5 && y > 9 && y < 14), ['#f4cfa8', '#d9a27a', '#b07a54']);
    for (let x = 5; x <= 11; x += 2) p.set(x, 6, '#8a5a3a');
  } },
  dagger: { name: 'Dagger', draw: (p) => {
    line(p, 7, 9, 12, 4, 1.1, ['#eef2fa', '#aab4c4']);
    line(p, 5, 8, 8, 11, 0.8, ['#c89a2a']);
    line(p, 4, 12, 6, 10, 0.8, ['#6a4428']);
  } },
  shield: { name: 'Shield', draw: (p) => {
    fill(p, (x, y) => y >= 2 && y <= 9 ? x >= 3 && x <= 13 : Math.abs(x - 8) <= (14.5 - y) * 0.9, ['#ffd86a', '#c89a2a']);
    fill(p, (x, y) => y >= 3.2 && y <= 9 ? x >= 4.2 && x <= 11.8 : Math.abs(x - 8) <= (13.3 - y) * 0.85, ['#6a9cf0', '#3a62c0', '#24408a']);
    line(p, 8, 4, 8, 12, 0.5, ['#ffd86a']);
  } },
  armor: { name: 'Armor', draw: (p) => {
    fill(p, (x, y) => (x >= 4 && x <= 12 && y >= 4 && y <= 14) || ell(x, y, 3.5, 5, 2.4, 2) || ell(x, y, 12.5, 5, 2.4, 2), ['#dfe6f2', '#a8b4c8', '#6a7890']);
    fill(p, (x, y) => ell(x, y, 8, 3.6, 2.4, 1.6), ['#1a1420']);
    line(p, 8, 6, 8, 13, 0.4, ['#7a869c']);
  } },
  boots: { name: 'Boots', draw: (p) => {
    fill(p, (x, y) => (x >= 3 && x <= 7 && y >= 3 && y <= 12) || ell(x, y, 6, 13, 4.5, 2), ['#b07a4a', '#7a5032', '#4e321e']);
    fill(p, (x, y) => (x >= 9 && x <= 13 && y >= 4 && y <= 12) || ell(x, y, 12, 13, 3.8, 1.8), ['#a06a3e', '#6a442a']);
  } },
  ring: { name: 'Ring', draw: ringIcon(['#fff0a0', '#e0b43a', '#a87a1e'], ['#c8f4ff', '#4ac0e0', '#2a7aa0']) },
  ring_sun: { name: 'Sun ring', draw: ringIcon(['#fff0a0', '#e0b43a', '#a87a1e'], ['#fffbe0', '#ffd84a', '#e08a1e']) },
  ring_tide: { name: 'Tide ring', draw: ringIcon(['#f4f6ff', '#b8c0d8', '#7a829a'], ['#d8f4ff', '#3aa0f0', '#1a4aa0']) },
  ring_leaf: { name: 'Leaf ring', draw: ringIcon(['#f4e0c0', '#b88a5a', '#7a5434'], ['#d8ffb0', '#5ac03a', '#2a7a1e']) },
  ring_ember: { name: 'Ember ring', draw: ringIcon(['#3a3440', '#26222c', '#141218'], ['#ffd0a0', '#ff5a2a', '#a01e1e']) },
  amulet: { name: 'Amulet', draw: (p) => {
    fill(p, (x, y) => ell(x, y, 8, 5, 6, 5) && !ell(x, y, 8, 5, 5, 4) && y < 7, ['#e0b43a']);
    fill(p, (x, y) => Math.abs(x - 8) + Math.abs(y - 11) <= 3.6, ['#ff9ad0', '#e04a8a', '#9a2a5a']);
  } },
  key: { name: 'Key', draw: (p) => {
    fill(p, (x, y) => ell(x, y, 5, 5.5, 3.4, 3.4) && !ell(x, y, 5, 5.5, 1.4, 1.4), ['#fff0a0', '#e0b43a', '#a87a1e']);
    line(p, 7, 8, 13, 14, 0.9, ['#e0b43a', '#a87a1e']);
    line(p, 11, 12, 13, 10, 0.7, ['#c8962a']);
  } },
  lockpick: { name: 'Lockpick', draw: (p) => {
    // A slim steel pick with a hooked tip and a wrapped grip.
    line(p, 3, 13, 11, 5, 0.7, ['#e8ecf4', '#9aa2b4']);
    line(p, 11, 5, 13, 4, 0.6, ['#c8ccd8']);
    line(p, 13, 4, 13, 2, 0.6, ['#c8ccd8']);
    line(p, 2, 14, 5, 11, 1.4, ['#c08a4a', '#7a4a1e']);
  } },
  gem: { name: 'Gem', draw: (p) => {
    fill(p, (x, y) => y >= 4 && y <= 7 ? Math.abs(x - 8) <= 4 + (y - 4) * 0.7 : y > 7 && Math.abs(x - 8) <= (14 - y) * 1.1, ['#e0fbff', '#5ad8f0', '#2a90b8', '#1a5a80']);
    line(p, 5, 7, 11, 7, 0.4, ['#bff2ff']);
  } },
  trophy: { name: 'Trophy', draw: (p) => {
    // The cup, its handles, the stem and the base.
    fill(p, (x, y) => y >= 2 && y <= 8 && Math.abs(x - 8) <= 5 - Math.max(0, y - 5) * 0.9, ['#fff4b0', '#f0c44a', '#c8902a', '#8a5a1a']);
    line(p, 2, 3, 2, 5, 0.6, ['#e0b43a']); line(p, 14, 3, 14, 5, 0.6, ['#e0b43a']);
    p.set(3, 6, '#c8902a'); p.set(13, 6, '#c8902a');
    p.rect(7, 9, 2, 3, '#c8902a');
    p.rect(5, 12, 6, 2, '#8a5a1a'); p.rect(5, 12, 6, 1, '#e0b43a');
    p.set(6, 3, '#ffffff'); p.set(6, 4, '#fff8d0');
  } },
  coin: { name: 'Coins', draw: (p) => {
    fill(p, (x, y) => ell(x, y, 6, 10, 4.5, 4.5), ['#fff0a0', '#e0b43a', '#a87a1e']);
    fill(p, (x, y) => ell(x, y, 10.5, 6.5, 4, 4), ['#fff4b0', '#f0c44a', '#b8862a']);
    p.set(10, 6, '#a87a1e'); p.set(11, 6, '#a87a1e'); p.set(6, 10, '#a87a1e');
  } },
  scroll: { name: 'Scroll', draw: (p) => {
    fill(p, (x, y) => x >= 4 && x <= 12 && y >= 3 && y <= 13, ['#fff4d8', '#ead6a8', '#c8ae7a']);
    fill(p, (x, y) => ell(x, y, 8, 3, 5.5, 1.5) || ell(x, y, 8, 13.5, 5.5, 1.5), ['#d8c08a', '#a88a5a']);
    for (const y of [6, 8, 10]) line(p, 6, y, 10.5, y, 0.35, ['#8a7a6a']);
  } },
  book: { name: 'Book', draw: (p) => {
    fill(p, (x, y) => x >= 3 && x <= 13 && y >= 2 && y <= 14, ['#e05a4a', '#a83a2e', '#6a2420']);
    fill(p, (x, y) => x >= 11 && x <= 12.5 && y >= 3 && y <= 13.5, ['#fff4d8']);
    fill(p, (x, y) => x >= 5 && x <= 9 && y >= 5 && y <= 7, ['#ffd86a']);
  } },
  saddle: { name: 'Saddle', draw: (p) => {
    // The seat (a dipped curve), the horn at the front, the flap and a stirrup hanging below.
    fill(p, (x, y) => y >= 5 && y <= 9 && x >= 2 && x <= 14 && y >= 5 + Math.round(2.2 - Math.abs(x - 8) * 0.38), ['#c8844a', '#9a5a2e', '#6a3a1a']);
    fill(p, (x, y) => ell(x, y, 12.5, 4.5, 1.6, 1.8), ['#d89a5a', '#9a5a2e']);
    fill(p, (x, y) => x >= 6 && x <= 10 && y >= 9 && y <= 11, ['#7a4220', '#5a2e14']);
    line(p, 8, 11, 8, 13, 0.5, ['#c8c0b0']);
    line(p, 6.5, 14, 9.5, 14, 0.6, ['#e0d8c8', '#a8a090']);
  } },
  bag: { name: 'Pouch', draw: (p) => {
    fill(p, (x, y) => ell(x, y, 8, 10.5, 5.5, 4.5) || (x >= 6 && x <= 10 && y >= 4 && y <= 7), ['#c8946a', '#9a6a44', '#6a442a']);
    line(p, 5.5, 5, 10.5, 5, 0.6, ['#e0b43a']);
  } },
  mushroom: { name: 'Mushroom', draw: (p) => {
    fill(p, (x, y) => x >= 6.5 && x <= 9.5 && y >= 8 && y <= 14, ['#fff4e0', '#e0d0b8']);
    fill(p, (x, y) => ell(x, y, 8, 8, 6, 4.5) && y < 9, ['#ff7a6a', '#d83a3a', '#9c1e22']);
    p.set(6, 6, '#ffffff'); p.set(10, 5, '#ffffff'); p.set(8, 7, '#ffffff');
  } },
};

/* ---------------------------------------------------------------- more icons (update 95) */
type In = (x: number, y: number) => boolean;
const R = (x0: number, y0: number, x1: number, y1: number): In => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const E = (cx: number, cy: number, rx: number, ry: number): In => (x, y) => ell(x, y, cx, cy, rx, ry);
const S = (x0: number, y0: number, x1: number, y1: number, w: number): In => (x, y) => segD(x, y, x0, y0, x1, y1) <= w;
const P = (pts: [number, number][]): In => (x, y) => inPoly(x, y, pts);
const U = (...fs: In[]): In => (x, y) => fs.some((f) => f(x, y));
const Er = (cx: number, cy: number, rx: number, ry: number, a: number): In => (x, y) => { const dx = x - cx, dy = y - cy, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a); return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1; };
const Minus = (a: In, b: In): In => (x, y) => a(x, y) && !b(x, y);
const dot = (p: Pix, pts: [number, number][], c: string) => { for (const [x, y] of pts) p.set(x, y, c); };

const STEEL = ['#f2f6ff', '#c2cad8', '#8a94a8'];
const IRON = ['#c4ccd8', '#8a94a4', '#5a6474'];
const DARKIRON = ['#8a8f9c', '#5c616e', '#3a3e48'];
const WOOD = ['#c89a5c', '#8a5c30', '#5a3a22'];
const LIGHTWOOD = ['#e8c48a', '#c08e52', '#8a5e30'];
const GOLD = ['#fff0a0', '#e0b43a', '#a87a1e'];
const LEATHER = ['#c8946a', '#9a6a44', '#6a442a'];
const RED = ['#ff8a7a', '#d84a3a', '#9a2a22'];
const BLUE = ['#8ac0ff', '#3a7ce0', '#1f4aa0'];
const GREEN = ['#b6f07a', '#6cbf3a', '#3a8424'];
const PURPLE = ['#e0b0ff', '#9a5ae0', '#5a2a9a'];
const WHITE = ['#ffffff', '#e0e4ec', '#a8b0c0'];
const BONE = ['#fffbe8', '#e8dcb8', '#b0a07a'];
const GLASS = ['#e8f4ff', '#b8d2e6', '#8aa8c2'];
const FUR = ['#d8b48a', '#a87a52', '#6e4a2e'];
const STRAW = ['#fff0a0', '#e8c85a', '#b8942e'];
const CLOTHW = ['#f4ecd8', '#d8cba8', '#a8987a'];

/** A sword-like blade from the hilt (hx, hy) toward the tip, with a guard and grip. */
function blade(tipX: number, tipY: number, w: number, ramp: string[], guard: string[], grip: string[], curve = 0): Draw {
  return (p) => {
    if (curve) fill(p, (x, y) => { const t = (x - 6) / (tipX - 6); if (t < 0 || t > 1) return false; const cy = 10 + (tipY - 10) * t - Math.sin(t * Math.PI) * curve; return Math.abs(y - cy) <= w * (1 - t * 0.6); }, ramp);
    else line(p, 6, 10, tipX, tipY, w, ramp);
    line(p, 3, 9, 7, 13, 0.9, guard);
    line(p, 2, 14, 5, 11, 0.9, grip);
  };
}
/** A bottle: body ellipse or box, neck and cork; liquid fills the lower part. */
function bottle(kind: 'tall' | 'vial' | 'jar' | 'round', liquid: string[]): Draw {
  return (p) => {
    if (kind === 'tall') {
      fill(p, R(5, 6, 11, 14.5), GLASS); fill(p, R(5.5, 9, 10.5, 14), liquid); fill(p, R(7, 2.5, 9, 6), GLASS); fill(p, R(6.5, 1, 9.5, 2.8), WOOD);
      dot(p, [[6, 7], [6, 8]], '#ffffff');
    } else if (kind === 'vial') {
      fill(p, U(R(6.5, 4, 9.5, 12), E(8, 12, 1.6, 2.4)), GLASS); fill(p, U(R(6.8, 8, 9.2, 12), E(8, 12, 1.3, 2.1)), liquid); fill(p, R(6, 2, 10, 4), WOOD);
      p.set(7, 6, '#ffffff');
    } else if (kind === 'jar') {
      fill(p, R(3.5, 5, 12.5, 14), GLASS); fill(p, R(4, 8, 12, 13.5), liquid); fill(p, R(3, 3, 13, 5), ['#c8a070', '#8a6a40']);
      dot(p, [[5, 6], [5, 7]], '#ffffff');
    } else {
      fill(p, E(8, 10.5, 5, 4.6), GLASS); fill(p, (x, y) => ell(x, y, 8, 11, 4.2, 3.8) && y > 8.5, liquid); fill(p, R(6.5, 3, 9.5, 6.5), GLASS); fill(p, R(6, 1.5, 10, 3.5), WOOD);
      dot(p, [[6, 9], [5, 10]], '#ffffff');
    }
  };
}
/** A cut gem in one of a few shapes. */
function gemShape(shape: 'round' | 'oval' | 'square' | 'tear', ramp: string[]): Draw {
  return (p) => {
    if (shape === 'round') fill(p, E(8, 8.5, 5.5, 5.5), ramp);
    else if (shape === 'oval') fill(p, E(8, 8.5, 4, 6), ramp);
    else if (shape === 'square') fill(p, P([[5, 3], [11, 3], [13, 5], [13, 11], [11, 13], [5, 13], [3, 11], [3, 5]]), ramp);
    else fill(p, U(E(8, 10.5, 4.5, 4), P([[8, 2], [12, 9], [4, 9]])), ramp);
    fill(p, shape === 'oval' ? E(7, 6.5, 1.8, 2.5) : E(6.5, 6.5, 2, 1.8), [ramp[0]]);
    dot(p, [[6, 5], [5, 6]], '#ffffff');
  };
}
/** A helmet: dome, brim and an optional visor slit / horns / plume. */
function helmet(ramp: string[], extra: 'none' | 'horns' | 'plume' | 'visor'): Draw {
  return (p) => {
    if (extra === 'horns') { fill(p, U(S(4, 8, 1.5, 3, 0.9), S(12, 8, 14.5, 3, 0.9)), BONE); }
    if (extra === 'plume') fill(p, U(E(8, 3, 2, 2.2), S(8, 3, 12, 1.5, 1.2)), RED);
    fill(p, (x, y) => ell(x, y, 8, 9, 5.5, 5.5) && y < 12.5, ramp);
    fill(p, R(2.5, 11.5, 13.5, 13), ramp.slice(1));
    if (extra === 'visor') { for (let x = 5; x <= 10; x++) p.set(x, 9, '#1a1420'); p.set(8, 10, '#1a1420'); p.set(8, 11, '#1a1420'); }
    dot(p, [[6, 5], [5, 6]], '#ffffff');
  };
}
/** A body garment from the front: shoulders, body, optional sleeves. */
function garment(ramp: string[], kind: 'shirt' | 'tunic' | 'robe' | 'vest' | 'mail' | 'plate', trim?: string): Draw {
  return (p) => {
    const long = kind === 'robe' ? 15 : kind === 'tunic' ? 14 : 13;
    const sleeves = kind !== 'vest';
    fill(p, U(P([[5, 3], [11, 3], [12.5, 5], [12, long], [4, long], [3.5, 5]]), sleeves ? U(S(4, 4.5, 1.8, 10, 1.3), S(12, 4.5, 14.2, 10, 1.3)) : () => false), ramp);
    fill(p, E(8, 3, 1.8, 1.4), ['#1a1420']);
    if (kind === 'mail') for (let y = 5; y < 13; y += 2) for (let x = 5 + (y % 4 ? 1 : 0); x < 12; x += 2) p.set(x, y, ramp[2]);
    if (kind === 'plate') { fill(p, R(6, 5, 10, 8), [ramp[0]]); line(p, 4.5, 9.5, 11.5, 9.5, 0.4, [ramp[2]]); line(p, 4.5, 11.5, 11.5, 11.5, 0.4, [ramp[2]]); }
    if (kind === 'robe') line(p, 8, 4.5, 8, 15, 0.45, [trim ?? '#e0b43a']);
    if (kind === 'tunic') line(p, 4, 10, 12, 10, 0.5, [trim ?? '#6a442a']);
    if (kind === 'vest') line(p, 8, 4.5, 8, 13, 0.4, [trim ?? '#3a2414']);
  };
}

const MORE_ICONS: Record<string, { name: string; draw: Draw }> = {
  // Weapons
  longsword: { name: 'Longsword', draw: blade(14.5, 1.5, 1.2, STEEL, GOLD, ['#5a3a22', '#3a2414']) },
  katana: { name: 'Katana', draw: blade(14.5, 2, 0.9, STEEL, ['#3a3440', '#1a1420'], ['#e0d8c8', '#8a2a2a'], 1.6) },
  rapier: { name: 'Rapier', draw: (p) => { line(p, 6, 10, 14.5, 1.5, 0.55, STEEL); fill(p, Minus(E(5, 11, 2.6, 2.6), E(5, 11, 1.4, 1.4)), GOLD); line(p, 2, 14, 4.5, 11.5, 0.8, ['#3a2414']); } },
  scimitar: { name: 'Scimitar', draw: blade(14, 4, 1.3, STEEL, GOLD, ['#6a2a2a', '#3a1a1a'], 2.6) },
  cleaver: { name: 'Cleaver', draw: (p) => { fill(p, P([[6, 3], [14, 3], [14, 9], [6, 9]]), STEEL); line(p, 2, 13, 6, 8, 1, WOOD); p.set(12, 5, '#1a1420'); } },
  spear: { name: 'Spear', draw: (p) => { line(p, 2, 14, 11, 5, 0.6, WOOD); fill(p, P([[14.5, 1.5], [12.5, 6.5], [9.5, 3.5]]), STEEL); } },
  halberd: { name: 'Halberd', draw: (p) => { line(p, 2, 14, 12, 4, 0.6, WOOD); fill(p, U(E(11.5, 5.5, 3, 2.5)), STEEL); fill(p, P([[14.5, 1.5], [13.5, 4], [12, 2.5]]), STEEL); } },
  trident: { name: 'Trident', draw: (p) => { line(p, 2, 14, 10, 6, 0.6, GOLD); line(p, 8, 6, 12, 10, 0.6, GOLD); for (const [a, b, c, d] of [[8, 6, 9, 2], [10, 6, 14.5, 2], [12, 10, 14, 7]]) line(p, a, b, c, d, 0.55, STEEL); } },
  mace: { name: 'Mace', draw: (p) => { line(p, 3, 14, 9.5, 7.5, 0.8, WOOD); fill(p, E(11, 5.5, 3.2, 3.2), IRON); dot(p, [[11, 1], [15, 5], [7, 5], [11, 9]], '#c2cad8'); } },
  morningstar: { name: 'Morning star', draw: (p) => { line(p, 2, 14, 7, 9, 0.8, WOOD); line(p, 7, 9, 9, 7, 0.35, DARKIRON); fill(p, E(11, 5, 2.8, 2.8), DARKIRON); for (const [x, y] of [[11, 1], [14.5, 5], [11, 8.5], [7.5, 4], [13.5, 2], [13.5, 7.5]]) p.set(x, y, '#c2cad8'); } },
  club: { name: 'Club', draw: (p) => { fill(p, U(S(3, 14, 8, 8, 1), S(8, 8, 12, 3.5, 2.3)), LIGHTWOOD); dot(p, [[10, 5], [11, 7]], '#8a5e30'); } },
  staff: { name: 'Staff', draw: (p) => { line(p, 3, 15, 12, 3, 0.7, WOOD); fill(p, U(E(12.5, 2.8, 1.8, 1.6)), WOOD); } },
  staff_orb: { name: 'Orb staff', draw: (p) => { line(p, 3, 15, 11, 5, 0.7, WOOD); fill(p, Minus(E(12, 3.8, 2.8, 2.8), E(12, 3.8, 1.7, 1.7)), GOLD); fill(p, E(12, 3.8, 1.6, 1.6), ['#d8f4ff', '#4ac0e0']); } },
  wand: { name: 'Wand', draw: (p) => { line(p, 3, 13, 10.5, 5.5, 0.55, ['#5a3a22', '#3a2414']); fill(p, U(S(12, 1.5, 12, 7, 0.6), S(9.3, 4.3, 14.7, 4.3, 0.6), S(10.2, 2.4, 13.8, 6.2, 0.45), S(13.8, 2.4, 10.2, 6.2, 0.45)), GOLD); p.set(12, 4, '#ffffff'); } },
  scepter: { name: 'Scepter', draw: (p) => { line(p, 3, 14, 10, 7, 0.65, GOLD); fill(p, E(11.5, 5, 2.4, 2.4), ['#ffc8f0', '#e04a8a', '#9a2a5a']); dot(p, [[13, 2], [9, 3], [14, 6]], '#fff0a0'); } },
  crossbow: { name: 'Crossbow', draw: (p) => { line(p, 4, 13, 12, 5, 1, WOOD); fill(p, (x, y) => { const d = Math.hypot(x - 15, y - 15); return d > 10 && d < 11.4 && x > 3 && y > 3 && x < 14 && y < 14 && x + y < 21; }, IRON); line(p, 5.5, 4.5, 11.5, 10.5, 0.3, ['#f0ead8']); } },
  longbow: { name: 'Longbow', draw: (p) => { fill(p, (x, y) => { const d = Math.hypot(x - 1, y - 15); return d > 12.4 && d < 13.8 && x > 0.5 && y < 15; }, LIGHTWOOD); line(p, 1.8, 2.2, 13.8, 14.2, 0.3, ['#f0ead8']); } },
  knuckles: { name: 'Knuckles', draw: (p) => { fill(p, Minus(R(2.5, 6, 13.5, 11), U(E(4.5, 8.5, 1, 1.2), E(7, 8.5, 1, 1.2), E(9.5, 8.5, 1, 1.2), E(12, 8.5, 1, 1.2))), IRON); dot(p, [[4, 5], [7, 5], [9, 5], [12, 5]], '#c2cad8'); } },
  scythe: { name: 'Scythe', draw: (p) => { line(p, 4, 15, 9, 2, 0.6, WOOD); fill(p, (x, y) => Math.hypot(x - 15, y - 9) < 7.5 && Math.hypot(x - 15.5, y - 10.5) > 6.5 && y < 6 && x > 8.5, STEEL); } },
  whip: { name: 'Whip', draw: (p) => { line(p, 2, 14, 5, 11, 0.9, ['#3a2414']); fill(p, U(S(5, 11, 8, 6, 0.5), S(8, 6, 13, 4, 0.5), S(13, 4, 14, 8, 0.45), S(14, 8, 11, 10, 0.4)), LEATHER); } },
  bomb: { name: 'Bomb', draw: (p) => { fill(p, E(7.5, 9.5, 5, 5), ['#5a5e6c', '#3a3e48', '#22242c']); fill(p, R(9, 3.5, 11, 5.5), IRON); line(p, 10.5, 3.5, 13, 1.5, 0.4, ['#c8a070']); dot(p, [[13, 1], [14, 1], [14, 2]], '#ffd84a'); p.set(5, 7, '#9aa0b0'); } },
  throwing_knife: { name: 'Throwing knives', draw: (p) => { for (const o of [0, 3]) { line(p, 3 + o, 12 - o, 9 + o, 6 - o, 0.6, STEEL); line(p, 2 + o, 13 - o, 4 + o, 11 - o, 0.6, ['#6a2a2a']); } } },
  // Armor and clothes
  helmet: { name: 'Helmet', draw: helmet(IRON, 'none') },
  helmet_knight: { name: 'Knight helm', draw: helmet(STEEL, 'visor') },
  helmet_horned: { name: 'Horned helmet', draw: helmet(DARKIRON, 'horns') },
  helmet_plumed: { name: 'Plumed helmet', draw: helmet(GOLD, 'plume') },
  hood: { name: 'Hood', draw: (p) => { fill(p, U(P([[8, 1.5], [13, 7], [13, 14], [3, 14], [3, 7]])), ['#6a8a5a', '#4a6a3e', '#2e4a26']); fill(p, E(8, 9, 3, 3.6), ['#2a2030']); } },
  wizard_hat: { name: 'Wizard hat', draw: (p) => { fill(p, P([[9, 1], [12, 11], [4, 11]]), PURPLE); fill(p, E(8, 12, 7, 2), PURPLE.slice(1)); dot(p, [[8, 6], [9, 8], [7, 9]], '#fff0a0'); } },
  hat: { name: 'Hat', draw: (p) => { fill(p, U(R(5, 4, 11, 10)), LEATHER); fill(p, E(8, 11, 7, 2.2), LEATHER.slice(1)); line(p, 5, 9, 11, 9, 0.5, ['#d84a3a']); } },
  crown: { name: 'Crown', draw: (p) => { fill(p, U(R(2.5, 8, 13.5, 12.5), P([[2.5, 3], [5.5, 8.5], [2.5, 8.5]]), P([[8, 2.5], [10.5, 8.5], [5.5, 8.5]]), P([[13.5, 3], [13.5, 8.5], [10.5, 8.5]])), GOLD); dot(p, [[5, 10], [11, 10]], '#4ac0e0'); dot(p, [[8, 10]], '#e03a5a'); } },
  tiara: { name: 'Tiara', draw: (p) => { fill(p, Minus(E(8, 12, 6.5, 6), E(8, 13, 5.2, 5.5)), ['#ffffff', '#c8d0e0', '#8a94a8']); fill(p, P([[8, 3], [10, 7], [8, 8.5], [6, 7]]), ['#d8f4ff', '#4ac0e0', '#2a7aa0']); } },
  circlet: { name: 'Circlet', draw: (p) => { fill(p, Minus(E(8, 9, 6.5, 3.6), E(8, 9, 5, 2.4)), GOLD); fill(p, E(8, 5.6, 1.6, 1.4), ['#a8ffb0', '#3ac05a']); } },
  shirt: { name: 'Shirt', draw: garment(CLOTHW, 'shirt') },
  tunic: { name: 'Tunic', draw: garment(['#a8d070', '#6c9a3a', '#3e6a24'], 'tunic') },
  robe: { name: 'Robe', draw: garment(BLUE, 'robe') },
  vest: { name: 'Leather vest', draw: (p) => { fill(p, P([[5, 3], [11, 3], [12.5, 5], [12, 13], [4, 13], [3.5, 5]]), LEATHER); fill(p, P([[6.5, 2.5], [9.5, 2.5], [8, 8]]), CLOTHW); dot(p, [[7, 9], [7, 11]], '#e0b43a'); } },
  leather_armor: { name: 'Leather armor', draw: garment(['#b07a4a', '#7a5032', '#4e321e'], 'tunic', '#3a2414') },
  chainmail: { name: 'Chainmail', draw: garment(IRON, 'mail') },
  plate_armor: { name: 'Plate armor', draw: garment(STEEL, 'plate') },
  cloak: { name: 'Cloak', draw: (p) => { fill(p, P([[6, 2], [10, 2], [14, 14.5], [2, 14.5]]), RED); fill(p, E(8, 2.8, 2.6, 1.4), GOLD); line(p, 8, 4, 8, 14, 0.35, ['#9a2a22']); } },
  gloves: { name: 'Gloves', draw: (p) => { fill(p, U(R(4.5, 7, 11, 14), S(5.5, 7.5, 5.5, 3, 0.75), S(7.3, 7, 7.3, 2, 0.75), S(9.1, 7, 9.1, 2.5, 0.75), S(10.6, 7.5, 10.6, 4, 0.7), S(4.8, 10.5, 2.5, 8, 0.8)), LEATHER); line(p, 4.5, 12.5, 11, 12.5, 0.5, ['#6a442a']); } },
  gauntlets: { name: 'Gauntlets', draw: (p) => { fill(p, U(R(4.5, 7, 11, 14), S(5.5, 7.5, 5.5, 3, 0.8), S(7.3, 7, 7.3, 2, 0.8), S(9.1, 7, 9.1, 2.5, 0.8), S(10.6, 7.5, 10.6, 4, 0.75), S(4.8, 10.5, 2.5, 8, 0.85)), STEEL); fill(p, R(4, 11.5, 11.5, 14.5), IRON); for (const y of [4, 6]) line(p, 5, y, 11, y, 0.25, ['#8a94a8']); } },
  belt: { name: 'Belt', draw: (p) => { fill(p, R(1.5, 7, 14.5, 10), LEATHER); fill(p, Minus(R(6, 6, 10, 11), R(7, 7, 9, 10)), GOLD); } },
  pants: { name: 'Trousers', draw: (p) => { fill(p, U(R(3.5, 2, 12.5, 6), P([[3.5, 5], [7.4, 5], [7, 14.5], [3.5, 14.5]]), P([[8.6, 5], [12.5, 5], [12.5, 14.5], [9, 14.5]])), ['#8a9ab8', '#5a6a8a', '#3a4660']); line(p, 3.5, 3, 12.5, 3, 0.4, ['#3a2414']); } },
  shoes: { name: 'Shoes', draw: (p) => { fill(p, U(E(5.5, 10, 3.5, 2.2), R(3, 7, 6, 10)), LEATHER); fill(p, U(E(11.5, 12, 3.5, 2.2), R(9, 9, 12, 12)), LEATHER.slice(1)); } },
  shield_round: { name: 'Round shield', draw: (p) => { fill(p, E(8, 8.5, 6, 6), WOOD); fill(p, Minus(E(8, 8.5, 6, 6), E(8, 8.5, 5, 5)), IRON); fill(p, E(8, 8.5, 1.6, 1.6), IRON); } },
  shield_kite: { name: 'Kite shield', draw: (p) => { fill(p, U(R(3, 2, 13, 7), P([[3, 7], [13, 7], [8, 15]])), STEEL); fill(p, U(R(4.2, 3.2, 11.8, 7), P([[4.2, 7], [11.8, 7], [8, 13.5]])), RED); line(p, 4.5, 6, 11.5, 6, 0.5, ['#fff0a0']); line(p, 8, 3.5, 8, 12.5, 0.5, ['#fff0a0']); } },
  buckler: { name: 'Buckler', draw: (p) => { fill(p, E(8, 8.5, 4.6, 4.6), IRON); fill(p, E(8, 8.5, 2, 2), STEEL); dot(p, [[8, 5], [11, 8], [8, 12], [5, 8]], '#5a6474'); } },
  // Potions and bottles (tint them for more colours)
  vial: { name: 'Vial', draw: bottle('vial', RED) },
  vial_blue: { name: 'Blue vial', draw: bottle('vial', BLUE) },
  bottle: { name: 'Tall bottle', draw: bottle('tall', GREEN) },
  jar: { name: 'Jar', draw: bottle('jar', STRAW) },
  potion_purple: { name: 'Purple potion', draw: bottle('round', PURPLE) },
  potion_yellow: { name: 'Yellow potion', draw: bottle('round', STRAW) },
  potion_white: { name: 'White potion', draw: bottle('round', WHITE) },
  elixir: { name: 'Elixir', draw: (p) => { bottle('round', ['#fff6c8', '#ffd04a', '#e0902a'])(p); dot(p, [[8, 11], [7, 12], [9, 12], [8, 13], [8, 10]], '#ffffff'); } },
  // Food
  pear: { name: 'Pear', draw: (p) => { fill(p, U(E(8, 11, 4.5, 4), E(8, 6.5, 2.6, 3)), ['#e8f07a', '#b8c83a', '#7a8a24']); line(p, 8, 3.5, 9, 1.5, 0.45, ['#6a4422']); } },
  banana: { name: 'Bananas', draw: (p) => { for (const o of [0, 2.2]) fill(p, (x, y) => { const d = Math.hypot(x - 2 - o, y + 2); return d > 10.5 && d < 13 && x > 3 && y > 2 && y < 13.5; }, ['#fff4a0', '#f0d040', '#b89a20']); } },
  grapes: { name: 'Grapes', draw: (p) => { for (const [x, y] of [[6, 6], [10, 6], [8, 7.5], [5, 9], [11, 9], [8, 10], [6.5, 12], [9.5, 12], [8, 14]]) fill(p, E(x, y, 1.8, 1.8), PURPLE); line(p, 8, 5, 9, 2, 0.4, ['#6a4422']); fill(p, E(10.5, 3, 2, 1.1), GREEN); } },
  cherries: { name: 'Cherries', draw: (p) => { line(p, 5, 11, 9, 3, 0.35, ['#5a8a3a']); line(p, 11, 11, 9, 3, 0.35, ['#5a8a3a']); fill(p, U(E(5, 12, 2.6, 2.6), E(11, 12, 2.6, 2.6)), RED); dot(p, [[4, 11], [10, 11]], '#ffd0c8'); } },
  orange: { name: 'Orange', draw: (p) => { fill(p, E(8, 9, 5.5, 5.5), ['#ffd08a', '#ff9a2a', '#c8601a']); fill(p, E(9, 3.5, 2, 1), GREEN); p.set(6, 7, '#fff0d0'); } },
  lemon: { name: 'Lemon', draw: (p) => { fill(p, U(E(8, 9, 5.5, 4.2), E(2.8, 9, 1, 0.8), E(13.2, 9, 1, 0.8)), ['#fffbb0', '#f0e040', '#b8a820']); } },
  berries: { name: 'Berries', draw: (p) => { for (const [x, y] of [[6, 8], [10, 8], [8, 11], [5, 12], [11, 12]]) fill(p, E(x, y, 2.2, 2.2), BLUE); fill(p, U(E(6, 4.5, 2.4, 1.2), E(10, 4.5, 2.4, 1.2)), GREEN); } },
  carrot: { name: 'Carrot', draw: (p) => { fill(p, P([[9, 4], [12, 7], [3, 14]]), ['#ffb070', '#ff7a2a', '#c8501a']); fill(p, U(S(10.5, 5.5, 12, 1.5, 0.6), S(10.5, 5.5, 14.5, 3.5, 0.6), S(10.5, 5.5, 14, 6.5, 0.6)), GREEN); } },
  potato: { name: 'Potato', draw: (p) => { fill(p, E(8, 9, 6, 4.5), ['#e8c890', '#c09a5a', '#8a6a3a']); dot(p, [[6, 8], [10, 10], [9, 7]], '#8a6a3a'); } },
  onion: { name: 'Onion', draw: (p) => { fill(p, U(E(8, 10, 5, 4.5), P([[8, 2.5], [10, 6], [6, 6]])), ['#f4e0e8', '#d8a0b8', '#a86a88']); line(p, 8, 6, 8, 14, 0.3, ['#a86a88']); } },
  cabbage: { name: 'Cabbage', draw: (p) => { fill(p, E(8, 9, 6, 5.5), ['#d0f0a0', '#8ac85a', '#4e8a34']); fill(p, U(S(8, 4, 8, 13, 0.4), S(8, 9, 4, 6, 0.4), S(8, 9, 12, 6, 0.4)), ['#e8ffc8']); } },
  corn: { name: 'Corn', draw: (p) => { fill(p, E(8.5, 7.5, 2.8, 6), ['#fff4a0', '#f0c840', '#c09a20']); fill(p, U(P([[5, 6], [8, 14.5], [4, 13]]), P([[12, 6], [12.5, 13], [9, 14.5]])), GREEN); } },
  tomato: { name: 'Tomato', draw: (p) => { fill(p, E(8, 9.5, 5.5, 4.8), RED); fill(p, P([[8, 3.5], [10.5, 5.5], [8, 6], [5.5, 5.5]]), GREEN); p.set(6, 8, '#ffd0c8'); } },
  pumpkin: { name: 'Pumpkin', draw: (p) => { fill(p, U(E(5.5, 9.5, 3.5, 4.5), E(10.5, 9.5, 3.5, 4.5), E(8, 9.5, 3, 4.8)), ['#ffc070', '#ff8a2a', '#b8561a']); fill(p, R(7.5, 3, 8.5, 5.5), ['#6a8a3a']); } },
  mushroom_brown: { name: 'Brown mushroom', draw: (p) => { fill(p, R(6.5, 8, 9.5, 14), ['#fff4e0', '#e0d0b8']); fill(p, (x, y) => ell(x, y, 8, 8, 6, 4.5) && y < 9, ['#c8946a', '#9a6a44', '#6a442a']); } },
  egg: { name: 'Egg', draw: (p) => { fill(p, E(8, 9, 4, 5.2), ['#ffffff', '#f0e8d8', '#c8b898']); p.set(6, 6, '#ffffff'); } },
  cheese: { name: 'Cheese', draw: (p) => { fill(p, P([[2.5, 12.5], [11, 4], [14, 7], [14, 12.5]]), ['#fff0a0', '#f0c840', '#c09a20']); dot(p, [[9, 9], [12, 10], [11, 7]], '#c09a20'); } },
  drumstick: { name: 'Drumstick', draw: (p) => { fill(p, E(9.5, 6.5, 4.5, 4), ['#e8a060', '#b8702e', '#7a461a']); line(p, 6.5, 9.5, 3, 13, 0.8, BONE); fill(p, U(E(2.5, 12.5, 1.1, 1.1), E(3.5, 13.8, 1.1, 1.1)), BONE); } },
  steak: { name: 'Steak', draw: (p) => { fill(p, U(E(8, 9, 6, 4.5)), ['#ff8a7a', '#c83a3a', '#8a2020']); fill(p, Minus(E(8, 9, 6, 4.5), E(8.3, 9.2, 5, 3.6)), ['#fff0e0']); fill(p, E(10, 8, 1.4, 1.2), BONE); } },
  ham: { name: 'Ham', draw: (p) => { fill(p, U(E(9, 9, 5, 5)), ['#ffb0a0', '#e07a6a', '#a84a3a']); fill(p, E(9, 9, 2.8, 2.6), ['#ffd0c8']); line(p, 5, 12, 2, 14.5, 0.8, BONE); } },
  fish_cooked: { name: 'Cooked fish', draw: fishArt(['#f0c890', '#c8904a', '#8a5a2a'], 5.4, 2.6, '#6a3a1a') },
  bread_loaf: { name: 'Bread loaf', draw: (p) => { fill(p, U(E(8, 10, 6.5, 4), R(1.5, 10, 14.5, 13)), ['#f2c47a', '#d8964a', '#a8662c']); for (const cx of [5, 8, 11]) line(p, cx, 7.5, cx + 1, 10, 0.4, ['#fff0c8']); } },
  pie: { name: 'Pie', draw: (p) => { fill(p, U(E(8, 9, 6.5, 4)), ['#f2c47a', '#d8964a', '#a8662c']); fill(p, E(8, 8.5, 5, 2.6), ['#d84a6a', '#9a2a4a']); for (const x of [5, 8, 11]) line(p, x - 1, 7, x + 1, 10, 0.35, ['#f2c47a']); } },
  cake: { name: 'Cake', draw: (p) => { fill(p, R(3, 7, 13, 13), ['#fff0f4', '#f0c8d8', '#c898a8']); fill(p, R(3, 6, 13, 8), ['#ffffff']); for (const x of [5, 8, 11]) fill(p, E(x, 5, 0.9, 0.9), RED); line(p, 3, 10, 13, 10, 0.5, ['#e86a8a']); } },
  cookie: { name: 'Cookie', draw: (p) => { fill(p, E(8, 8.5, 5.5, 5.5), ['#e8b878', '#c08a48', '#8a5a2a']); dot(p, [[6, 6], [10, 7], [7, 10], [10, 11], [5, 9]], '#4a2a14'); } },
  honey: { name: 'Honey pot', draw: (p) => { fill(p, U(E(8, 10, 5.5, 4.5), R(4.5, 5, 11.5, 7)), ['#ffe08a', '#f0a82a', '#b8701a']); fill(p, P([[4, 6], [12, 6], [11, 9], [9, 8], [7, 10], [5, 8]]), ['#fff4a0', '#ffc83a']); } },
  rice_ball: { name: 'Rice ball', draw: (p) => { fill(p, P([[8, 3], [13.5, 12.5], [2.5, 12.5]]), ['#ffffff', '#f0f0e8', '#c8c8c0']); fill(p, R(5.5, 9.5, 10.5, 13), ['#3a5a3a', '#1e2e1e']); } },
  soup: { name: 'Soup', draw: (p) => { fill(p, (x, y) => ell(x, y, 8, 9, 6.5, 5) && y > 8, ['#e8c890', '#b8904a', '#7a5a2a']); fill(p, E(8, 9, 6.5, 2), ['#ffb070', '#e07a2a']); dot(p, [[6, 9], [10, 8], [8, 10]], '#6cbf3a'); for (const x of [6, 9]) line(p, x, 2, x + 0.5, 6, 0.3, ['#ffffff']); } },
  stew: { name: 'Stew pot', draw: (p) => { fill(p, U(R(3, 7, 13, 13.5), E(8, 13.5, 5, 1.2)), DARKIRON); fill(p, E(8, 7, 5, 1.5), ['#c86a3a', '#8a4020']); line(p, 2, 8, 3, 8, 0.6, DARKIRON); line(p, 13, 8, 14, 8, 0.6, DARKIRON); for (const x of [6, 10]) line(p, x, 1.5, x + 0.5, 5, 0.3, ['#ffffff']); } },
  // Drinks
  waterskin: { name: 'Waterskin', draw: (p) => { fill(p, U(E(8, 10, 5, 4.5), R(6.5, 3, 9.5, 6)), LEATHER); fill(p, R(6, 1.5, 10, 3), ['#5a3a22']); line(p, 4, 7, 12, 13, 0.3, ['#6a442a']); } },
  water: { name: 'Water', draw: bottle('tall', ['#c8f0ff', '#6ac0f0', '#2a80c0']) },
  milk: { name: 'Milk', draw: bottle('tall', ['#ffffff', '#f0f0f0', '#c8c8d0']) },
  mug: { name: 'Mug of ale', draw: (p) => { fill(p, R(3, 5, 11, 14), ['#c89a5c', '#8a5c30', '#5a3a22']); fill(p, Minus(E(12, 9.5, 2.6, 3), E(12, 9.5, 1.3, 1.7)), WOOD); fill(p, U(E(5, 4.5, 2, 1.6), E(8, 4, 2.2, 1.8), E(10, 4.6, 1.6, 1.4)), ['#ffffff', '#f0ead8']); line(p, 3, 8, 11, 8, 0.35, ['#5a3a22']); line(p, 3, 12, 11, 12, 0.35, ['#5a3a22']); } },
  wine: { name: 'Wine', draw: (p) => { fill(p, U(R(5.5, 7, 10.5, 14.5), E(8, 7, 2.5, 1.5)), ['#8a2a4a', '#5a1a30', '#3a0e1e']); fill(p, R(7, 1.5, 9, 6), ['#5a1a30']); fill(p, R(5.5, 9.5, 10.5, 12.5), CLOTHW); p.set(6, 8, '#d86a8a'); } },
  wine_glass: { name: 'Wine glass', draw: (p) => { fill(p, (x, y) => ell(x, y, 8, 4.5, 4, 3.5) && y > 3, GLASS); fill(p, (x, y) => ell(x, y, 8, 4.5, 3.4, 3) && y > 5, RED); line(p, 8, 8, 8, 13, 0.4, GLASS); fill(p, E(8, 13.8, 3, 0.9), GLASS); } },
  soda: { name: 'Soda bottle', draw: (p) => { fill(p, U(R(5.5, 7, 10.5, 14.5), P([[7, 3], [9, 3], [10.5, 7], [5.5, 7]])), ['#a8e0c8', '#5ab890', '#2a7a5a']); fill(p, R(6.8, 1.5, 9.2, 3), ['#d84a3a']); fill(p, R(5.5, 9, 10.5, 11.5), RED); } },
  soda_can: { name: 'Soda can', draw: (p) => { fill(p, U(R(4.5, 3.5, 11.5, 13.5)), RED); fill(p, U(E(8, 3.5, 3.5, 1), E(8, 13.5, 3.5, 1)), IRON); line(p, 5, 8, 11, 8, 0.6, ['#ffffff']); } },
  tea: { name: 'Tea cup', draw: (p) => { fill(p, (x, y) => ell(x, y, 7, 8, 5, 5) && y > 8, WHITE); fill(p, Minus(E(12.5, 10, 2, 2), E(12.5, 10, 1, 1)), WHITE); fill(p, E(7, 8.5, 4.5, 1.2), ['#c8904a', '#8a5a2a']); fill(p, E(7, 13.8, 6, 1), WHITE.slice(1)); line(p, 6, 2, 6.5, 6, 0.3, ['#ffffff']); } },
  keg: { name: 'Keg', draw: (p) => { fill(p, U(E(8, 8.5, 5.5, 6.5)), ['#d8a060', '#a8703a', '#6a4422']); for (const y of [4.5, 12.5]) line(p, 3, y, 13, y, 0.6, DARKIRON); fill(p, R(13, 7.5, 15, 9.5), ['#8a94a4']); } },
  barrel: { name: 'Barrel', draw: (p) => { fill(p, U(R(3.5, 2.5, 12.5, 14.5), E(8, 8.5, 5.5, 6)), WOOD); for (const y of [4.5, 8.5, 12.5]) line(p, 3, y, 13, y, 0.5, DARKIRON); for (const x of [6, 10]) line(p, x, 3, x, 14, 0.25, ['#5a3a22']); } },
  // Materials
  fur: { name: 'Fur pelt', draw: (p) => { fill(p, U(E(8, 8.5, 4.5, 5.5), S(4, 5, 1.5, 3, 1), S(12, 5, 14.5, 3, 1), S(4, 12, 1.5, 14, 1), S(12, 12, 14.5, 14, 1), S(8, 13, 9, 15, 0.8)), FUR); dot(p, [[7, 6], [9, 9], [7, 11]], '#d8b48a'); } },
  wolf_pelt: { name: 'Grey pelt', draw: (p) => { fill(p, U(E(8, 8.5, 4.5, 5.5), S(4, 5, 1.5, 3, 1), S(12, 5, 14.5, 3, 1), S(4, 12, 1.5, 14, 1), S(12, 12, 14.5, 14, 1)), ['#d8dce4', '#9aa0ac', '#5c616e']); } },
  leather: { name: 'Leather', draw: (p) => { fill(p, P([[3, 4], [12, 2.5], [14, 11], [5, 13.5], [2, 9]]), LEATHER); line(p, 4, 6, 11, 11, 0.3, ['#6a442a']); } },
  hide: { name: 'Hide', draw: (p) => { fill(p, U(R(3, 3, 13, 13), E(3, 3, 1.5, 1.5), E(13, 13, 1.5, 1.5)), ['#e8d0a8', '#c8a878', '#8a6e48']); dot(p, [[5, 6], [10, 5], [8, 10], [11, 11]], '#8a6e48'); } },
  tusk: { name: 'Tusk', draw: (p) => { fill(p, (x, y) => { const d = Math.hypot(x - 1, y - 2); return d < 12.5 && d > 12.5 - Math.max(0.7, (13 - x) * 0.32) && y > 2 && x < 13.5; }, BONE); } },
  horn: { name: 'Horn', draw: (p) => { fill(p, (x, y) => { const d = Math.hypot(x - 14, y - 15); return d < 11 && d > 11 - Math.max(0.8, (y) * 0.32) && x < 14 && y < 14.5; }, ['#e8dcb8', '#a8987a', '#5a4e3a']); } },
  bone: { name: 'Bone', draw: (p) => { fill(p, U(S(4, 12, 12, 4, 1), E(3, 11.5, 1.6, 1.6), E(4.5, 13, 1.6, 1.6), E(11.5, 3, 1.6, 1.6), E(13, 4.5, 1.6, 1.6)), BONE); } },
  skull: { name: 'Skull', draw: (p) => { fill(p, U(E(8, 7, 5.5, 5), R(5, 10, 11, 13.5)), BONE); fill(p, U(E(5.8, 7.5, 1.4, 1.6), E(10.2, 7.5, 1.4, 1.6)), ['#1a1420']); p.set(8, 10, '#1a1420'); for (const x of [6, 8, 10]) p.set(x, 13, '#b0a07a'); } },
  feather: { name: 'Feather', draw: (p) => { fill(p, (x, y) => segD(x, y, 3, 14, 13, 2) <= 2.4 * Math.min(1, Math.hypot(x - 3, y - 14) / 5) && Math.hypot(x - 3, y - 14) > 1.5, WHITE); line(p, 2.5, 14.5, 12, 3, 0.3, ['#a8b0c0']); } },
  claw: { name: 'Claw', draw: (p) => { fill(p, (x, y) => { const d = Math.hypot(x - 2, y - 2); return d < 11 && d > 11 - Math.max(0.6, (14 - y) * 0.35) && x > 2 && y > 2.5; }, ['#f4ecd8', '#a8987a', '#3a3430']); } },
  fang: { name: 'Fang', draw: (p) => { fill(p, P([[5, 3], [11, 3], [8.5, 14.5]]), BONE); fill(p, R(5, 2, 11, 4), ['#e88a8a', '#b85a5a']); } },
  scale: { name: 'Scale', draw: (p) => { fill(p, U(E(8, 7, 5, 4), P([[3, 7], [13, 7], [8, 14.5]])), ['#a8f0c8', '#3ac08a', '#1a7a54']); line(p, 8, 4, 8, 12, 0.35, ['#d8ffe8']); } },
  shell: { name: 'Shell', draw: (p) => { fill(p, U(E(8, 8, 5.5, 5.5), P([[5, 12], [11, 12], [8, 14.5]])), ['#fff0e8', '#f0b8a8', '#c87a6a']); for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) line(p, 8, 13, 8 + Math.sin(a) * 6, 13 - Math.cos(a) * 9, 0.3, ['#c87a6a']); } },
  pearl: { name: 'Pearl', draw: (p) => { fill(p, E(8, 8.5, 4.5, 4.5), ['#ffffff', '#f0ecf4', '#c8c0d8']); dot(p, [[6, 6], [7, 6], [6, 7]], '#ffffff'); } },
  slime_gel: { name: 'Slime gel', draw: (p) => { fill(p, U(E(8, 10.5, 6, 3.6), E(8, 7, 3.4, 3.4)), ['#c8ffb0', '#6ae05a', '#2e9a34']); dot(p, [[6, 6], [7, 5]], '#ffffff'); } },
  hay: { name: 'Hay bundle', draw: (p) => { fill(p, U(P([[4, 2], [12, 2], [10, 8], [12, 14.5], [4, 14.5], [6, 8]])), STRAW); line(p, 5.5, 8, 10.5, 8, 0.7, ['#a8703a']); for (const x of [6, 8, 10]) line(p, x, 3, x - 0.5, 7, 0.25, ['#b8942e']); } },
  wheat_bundle: { name: 'Wheat', draw: (p) => { for (const [x, d] of [[5, -2], [8, 0], [11, 2]]) { line(p, 8, 14.5, x + d * 0.5, 6, 0.3, ['#b8942e']); fill(p, E(x + d * 0.5, 4.5, 1.3, 3), STRAW); } } },
  wool: { name: 'Wool', draw: (p) => { for (const [x, y] of [[6, 7], [10, 7], [8, 9.5], [5, 11], [11, 11]]) fill(p, E(x, y, 3, 2.6), ['#ffffff', '#ece8e0', '#c0b8a8']); } },
  cloth: { name: 'Cloth roll', draw: (p) => { fill(p, R(2.5, 5, 13.5, 11), ['#f0c8d8', '#d88aa8', '#a8587a']); fill(p, E(13.5, 8, 1.6, 3), ['#a8587a']); line(p, 2.5, 7, 13, 7, 0.3, ['#ffe0ec']); } },
  thread: { name: 'Thread spool', draw: (p) => { fill(p, R(4, 4, 12, 12), ['#8ac0ff', '#3a7ce0', '#1f4aa0']); fill(p, U(R(3, 2.5, 13, 4), R(3, 12, 13, 13.5)), LIGHTWOOD); line(p, 12, 9, 14.5, 13, 0.3, ['#3a7ce0']); } },
  silk: { name: 'Silk', draw: (p) => { fill(p, (x, y) => Math.abs(y - 8 - Math.sin(x * 0.7) * 2.5) < 2.4 && x > 1.5 && x < 14.5, ['#ffffff', '#f0e8ff', '#c8b8e0']); } },
  rope: { name: 'Rope', draw: (p) => { fill(p, Minus(E(8, 8.5, 6, 5.5), E(8, 8.5, 3.6, 3.2)), ['#e8c888', '#b8944a', '#7a5e2a']); for (let a = 0; a < 6.28; a += 0.8) p.set(Math.round(8 + Math.cos(a) * 4.8), Math.round(8.5 + Math.sin(a) * 4.4), '#7a5e2a'); } },
  plank: { name: 'Planks', draw: (p) => { fill(p, P([[2, 6], [13, 3], [14, 6], [3, 9]]), LIGHTWOOD); fill(p, P([[2, 10], [13, 7], [14, 10], [3, 13]]), WOOD); } },
  nails: { name: 'Nails', draw: (p) => { for (const [x, y] of [[4, 4], [8, 3], [12, 5]]) { line(p, x, y, x + 1, y + 9, 0.4, IRON); fill(p, E(x, y, 1.4, 0.8), STEEL); } } },
  coal: { name: 'Coal', draw: lump(['#5a5e6a', '#3a3c46', '#26272e', '#16161c'], ['#8a8f9c', '#6a6e7a']) },
  ore_copper: { name: 'Copper ore', draw: lump(['#8a8d99', '#666975', '#4a4c57', '#33343d'], ['#ffb07a', '#d8703a']) },
  ore_mythril: { name: 'Mythril ore', draw: lump(['#7a7d8a', '#5a5d69', '#40424d', '#2c2d36'], ['#c8f4ff', '#4ac0e0']) },
  ingot_copper: { name: 'Copper ingot', draw: ingot(['#ffb07a', '#d8703a', '#9a4a1e'], '#ffd0b0') },
  ingot_mythril: { name: 'Mythril ingot', draw: ingot(['#c8f4ff', '#6ac8e8', '#2a88b0'], '#effbff') },
  crystal: { name: 'Crystal cluster', draw: (p) => { fill(p, U(P([[8, 1.5], [10, 5], [10, 14], [6, 14], [6, 5]]), P([[3.5, 6], [5.5, 8], [5.5, 14], [2.5, 14], [2.5, 8]]), P([[12.5, 5], [14, 8], [13.5, 14], [10.5, 14], [11, 8]])), ['#f4dcff', '#c48aff', '#8a4ee0', '#552c9a']); line(p, 7, 5, 7, 13, 0.3, ['#ffffff']); } },
  salt: { name: 'Salt', draw: (p) => { fill(p, U(E(8, 11, 6, 3), P([[8, 4], [13, 11], [3, 11]])), WHITE); } },
  sulfur: { name: 'Sulfur', draw: lump(['#fff4a0', '#e8d040', '#b8a020', '#7a6a10'], null) },
  clay: { name: 'Clay', draw: (p) => { fill(p, U(E(8, 10, 6, 4), R(3, 6, 13, 10)), ['#e8a888', '#c07858', '#8a4e36']); } },
  sand: { name: 'Sand', draw: (p) => { fill(p, (x, y) => y > 6 + Math.abs(x - 8) * 0.9 && y < 14, ['#fff0c0', '#e8d090', '#c0a060']); } },
  // Gems (tint any of them)
  ruby: { name: 'Ruby', draw: gemShape('oval', ['#ffd0d8', '#ff4a6a', '#c01a3a', '#7a0e22']) },
  sapphire: { name: 'Sapphire', draw: gemShape('square', ['#d8e8ff', '#4a7aff', '#1a3ac0', '#0e1e7a']) },
  emerald: { name: 'Emerald', draw: gemShape('square', ['#d8ffe0', '#3ae07a', '#1a9a4a', '#0e5a2a']) },
  amethyst: { name: 'Amethyst', draw: gemShape('tear', ['#f4dcff', '#c48aff', '#8a4ee0', '#552c9a']) },
  topaz: { name: 'Topaz', draw: gemShape('oval', ['#fff8d0', '#ffd04a', '#d8901a', '#8a5a0e']) },
  diamond: { name: 'Diamond', draw: gemShape('round', ['#ffffff', '#e8f4ff', '#a8c8e0', '#6a8aa8']) },
  // Herbs and plants
  flower: { name: 'Flower', draw: (p) => { line(p, 8, 15, 8, 8, 0.45, ['#4a7a2c']); fill(p, E(10.5, 12, 2, 1), GREEN); for (const [x, y] of [[8, 3], [11, 5.5], [10, 9], [6, 9], [5, 5.5]]) fill(p, E(x, y, 2, 2), ['#ffd0e8', '#ff7ab0', '#c83a7a']); fill(p, E(8, 6.3, 1.5, 1.5), GOLD); } },
  rose: { name: 'Rose', draw: (p) => { line(p, 7, 15, 8, 8, 0.45, ['#3a6a24']); fill(p, E(5.5, 11, 2, 1), GREEN); fill(p, E(8, 5.5, 4, 3.6), RED); line(p, 6.5, 5, 9.5, 6.5, 0.3, ['#9a2a22']); line(p, 8, 3, 9, 5, 0.3, ['#9a2a22']); } },
  leaf: { name: 'Leaf', draw: (p) => { fill(p, Er(8, 8, 6.8, 3.4, -Math.PI / 4), GREEN); line(p, 2.5, 13.5, 12, 4, 0.3, ['#2e6a1e']); } },
  clover: { name: 'Four-leaf clover', draw: (p) => { line(p, 8, 9, 11, 15, 0.4, ['#3a7a24']); for (const [x, y] of [[8, 4.5], [11.5, 8], [8, 11.5], [4.5, 8]]) fill(p, E(x, y, 2.6, 2.6), ['#a8f07a', '#4ec03a', '#2a7a1e']); } },
  root: { name: 'Root', draw: (p) => { fill(p, U(S(8, 2, 8, 9, 1.4), S(8, 9, 4, 14, 0.6), S(8, 9, 12, 14, 0.6), S(8, 8, 8, 14.5, 0.5)), ['#e8c890', '#b88a50', '#7a5428']); fill(p, U(E(6, 2, 2, 1), E(10, 2, 2, 1)), GREEN); } },
  seeds: { name: 'Seeds', draw: (p) => { for (const [x, y] of [[5, 6], [9, 5], [11, 9], [6, 10], [9, 12]]) fill(p, E(x, y, 1.4, 1.9), ['#f0d8a0', '#c8a060', '#8a6a3a']); } },
  sapling: { name: 'Sapling', draw: (p) => { fill(p, R(4, 11, 12, 14.5), ['#c87a5a', '#8a4e36']); line(p, 8, 11, 8, 5, 0.5, ['#6a4422']); fill(p, U(E(5.5, 5, 2.6, 1.6), E(10.5, 4, 2.6, 1.6), E(8, 2.5, 1.6, 2)), GREEN); } },
  mint: { name: 'Mint', draw: (p) => { line(p, 8, 15, 8, 4, 0.4, ['#3a7a24']); for (const [x, y, s] of [[5.5, 6, 1], [10.5, 6, 1], [5.5, 10, 1.2], [10.5, 10, 1.2], [8, 3, 0.8]]) fill(p, E(x, y, 2.4 * s, 1.6 * s), ['#c8ffd0', '#5ae07a', '#2a9a4a']); } },
  nightshade: { name: 'Nightshade', draw: (p) => { line(p, 8, 15, 8, 6, 0.4, ['#3a5a24']); for (const [x, y] of [[5, 6], [11, 6], [8, 3.5]]) fill(p, E(x, y, 2.2, 2), ['#d8b0ff', '#8a4ee0', '#4a1e8a']); fill(p, E(9.5, 11, 2.4, 1.2), GREEN); } },
  cactus: { name: 'Cactus', draw: (p) => { fill(p, U(R(6, 3, 10, 14.5), R(2.5, 6, 5, 10), R(11, 5, 13.5, 9), R(4, 9, 7, 11), R(9.5, 8, 12, 10)), ['#a8e08a', '#5aa83a', '#2e6a1e']); dot(p, [[7, 5], [9, 8], [7, 11], [3, 7]], '#fff0c8'); } },
  // Spell symbols (for the Magic list)
  spell_ice: { name: 'Ice spell', draw: (p) => { for (const a of [0, 1.047, 2.094]) line(p, 8 - Math.cos(a) * 6, 8.5 - Math.sin(a) * 6, 8 + Math.cos(a) * 6, 8.5 + Math.sin(a) * 6, 0.8, ['#effaff', '#9ad8ff', '#4e9ae8']); fill(p, E(8, 8.5, 1.8, 1.8), ['#ffffff']); } },
  spell_bolt: { name: 'Lightning spell', draw: (p) => { fill(p, U(S(11, 1.5, 6, 8, 1.2), S(6, 8, 10.5, 8, 1.1), S(10.5, 8, 5, 14.5, 1.2)), ['#fffbd0', '#ffe45a', '#e0b02a']); } },
  spell_heal: { name: 'Healing spell', draw: (p) => { fill(p, U(R(6, 2.5, 10, 14), R(2.5, 6.5, 13.5, 10)), ['#e0ffe8', '#7ae09a', '#3aa85a']); fill(p, U(R(7, 3.5, 9, 13), R(3.5, 7.5, 12.5, 9)), ['#ffffff']); } },
  spell_wind: { name: 'Wind spell', draw: (p) => { for (const [y, l] of [[5, 11], [8.5, 13], [12, 9]]) { line(p, 2, y, l, y, 0.6, ['#e8fff4', '#a8e8c8']); fill(p, Minus(E(l, y - 1.6, 1.8, 1.8), E(l - 0.4, y - 1.8, 0.9, 0.9)), ['#c8f4e0']); } } },
  spell_quake: { name: 'Earth spell', draw: (p) => { fill(p, P([[1.5, 9], [14.5, 9], [14.5, 14], [1.5, 14]]), ['#c89a5a', '#8a6232', '#5a3c1e']); line(p, 8, 9, 6.5, 14, 0.5, ['#2a1a0e']); fill(p, U(P([[4, 3], [6, 8], [2, 8]]), P([[10, 1.5], [13, 8], [8, 8]])), ['#d8b07a', '#9a7040']); } },
  spell_water: { name: 'Water spell', draw: (p) => { fill(p, U(E(8, 10.5, 4.5, 4.2), P([[8, 1.5], [12.2, 9], [3.8, 9]])), ['#e4fbff', '#7ee0f0', '#2fa6c8', '#1a5f86']); dot(p, [[6, 9], [6, 10]], '#ffffff'); } },
  spell_light: { name: 'Light spell', draw: (p) => { for (let a = 0; a < 6.28; a += 0.785) line(p, 8, 8.5, 8 + Math.cos(a) * 6.5, 8.5 + Math.sin(a) * 6.5, 0.45, ['#fff2c0']); fill(p, E(8, 8.5, 3.2, 3.2), ['#ffffff', '#fff2a0', '#e8cf7a']); } },
  spell_dark: { name: 'Dark spell', draw: (p) => { fill(p, E(8, 8.5, 5.8, 5.8), ['#9a7ad8', '#5e44a0', '#33245e']); fill(p, E(9.5, 7.2, 4.2, 4.2), ['#1e1530']); dot(p, [[5, 6], [4, 9]], '#d8c8ff'); } },
  spell_shield: { name: 'Protect spell', draw: (p) => { fill(p, Minus(U(R(3, 2, 13, 8), P([[3, 8], [13, 8], [8, 15]])), U(R(5, 4, 11, 8), P([[5, 8], [11, 8], [8, 12.5]]))), ['#e8f4ff', '#8ac0ff', '#3a7ce0']); fill(p, U(R(5, 4, 11, 8), P([[5, 8], [11, 8], [8, 12.5]])), ['#c8e4ff']); } },
  spell_haste: { name: 'Haste spell', draw: (p) => { fill(p, Minus(E(9, 8.5, 5.5, 5.5), E(9, 8.5, 4.3, 4.3)), ['#fff0a0', '#e0b43a']); line(p, 9, 8.5, 9, 5, 0.5, ['#e0b43a']); line(p, 9, 8.5, 11.5, 9.5, 0.5, ['#e0b43a']); for (const y of [5, 8.5, 12]) line(p, 0.8, y, 3, y, 0.45, ['#ffffff']); } },
  spell_poison: { name: 'Poison spell', draw: (p) => { fill(p, U(E(8, 10, 5, 4), E(6, 6, 2.2, 2.2), E(10.5, 5, 1.8, 1.8)), ['#e4ffb8', '#9ee05a', '#55a834']); fill(p, U(E(6.5, 9.5, 1, 1.2), E(9.5, 9.5, 1, 1.2)), ['#1a2a10']); } },
  spell_star: { name: 'Arcane spell', draw: (p) => { fill(p, U(P([[8, 1.5], [10, 7], [6, 7]]), P([[14.5, 7], [10, 10], [10, 7]]), P([[6, 7], [6, 10], [1.5, 7]]), P([[10, 10], [12, 15], [8, 11.5]]), P([[8, 11.5], [4, 15], [6, 10]]), R(6, 7, 10, 10)), ['#f4dcff', '#c48aff', '#8a4ee0']); } },
  // Containers and odds and ends
  crate: { name: 'Crate', draw: (p) => { fill(p, R(2.5, 3.5, 13.5, 14), LIGHTWOOD); fill(p, Minus(R(2.5, 3.5, 13.5, 14), R(4, 5, 12, 12.5)), WOOD); line(p, 4, 12.5, 12, 5, 0.6, WOOD.slice(1)); } },
  chest: { name: 'Chest', draw: (p) => { fill(p, U(R(2.5, 7, 13.5, 14), (x, y) => ell(x, y, 8, 7, 5.5, 3.5) && y < 7.5), WOOD); line(p, 2.5, 7.5, 13.5, 7.5, 0.6, GOLD); line(p, 4, 4, 4, 14, 0.5, GOLD); line(p, 12, 4, 12, 14, 0.5, GOLD); fill(p, R(7, 7, 9, 10), GOLD); } },
  sack: { name: 'Sack', draw: (p) => { fill(p, U(E(8, 10.5, 5.5, 4.5), P([[6, 3], [10, 3], [11, 7], [5, 7]])), CLOTHW); line(p, 5.5, 6, 10.5, 6, 0.6, ['#8a6a40']); } },
  basket: { name: 'Basket', draw: (p) => { fill(p, P([[2, 7], [14, 7], [12, 14], [4, 14]]), STRAW); fill(p, Minus(E(8, 7, 5, 5), E(8, 7, 3.8, 4)), ['#b8942e']); for (let y = 9; y < 14; y += 2) line(p, 3, y, 13, y, 0.3, ['#b8942e']); } },
  clay_pot: { name: 'Clay pot', draw: (p) => { fill(p, U(E(8, 10, 5.5, 4.5), R(5, 3.5, 11, 6.5)), ['#e8a888', '#c07858', '#8a4e36']); fill(p, R(4, 3, 12, 4.5), ['#c07858']); line(p, 3, 10, 13, 10, 0.35, ['#8a4e36']); } },
  coin_bag: { name: 'Coin purse', draw: (p) => { fill(p, U(E(8, 10.5, 5.5, 4.5), P([[6, 4], [10, 4], [11, 7], [5, 7]])), ['#c8946a', '#9a6a44', '#6a442a']); line(p, 5.5, 6, 10.5, 6, 0.6, GOLD); fill(p, E(8, 11, 2, 2), GOLD); } },
  map: { name: 'Map', draw: (p) => { fill(p, P([[2, 3], [14, 3], [14, 13], [2, 13]]), ['#fff0d0', '#e8d0a0', '#b8a070']); line(p, 4, 10, 7, 6, 0.3, ['#c84a3a']); line(p, 7, 6, 11, 9, 0.3, ['#c84a3a']); dot(p, [[11, 9], [12, 10], [10, 10], [11, 8]], '#c84a3a'); line(p, 6, 3, 6, 13, 0.25, ['#c8b088']); line(p, 10, 3, 10, 13, 0.25, ['#c8b088']); } },
  letter: { name: 'Letter', draw: (p) => { fill(p, R(2, 4, 14, 12.5), ['#ffffff', '#f0ead8', '#c8c0a8']); line(p, 2, 4, 8, 9, 0.35, ['#a8a090']); line(p, 14, 4, 8, 9, 0.35, ['#a8a090']); fill(p, E(8, 9, 1.4, 1.4), RED); } },
  candle: { name: 'Candle', draw: (p) => { fill(p, R(6, 6, 10, 14), ['#fffbe8', '#f0e8c8', '#c8b898']); fill(p, E(8, 14.2, 4, 1), IRON); fill(p, E(8, 3.5, 1.3, 2.2), ['#fff6c8', '#ffb43a']); p.set(8, 5, '#3a3430'); } },
  bell: { name: 'Bell', draw: (p) => { fill(p, U((x, y) => ell(x, y, 8, 8, 4.5, 6) && y < 12, R(2.5, 11.5, 13.5, 12.8)), GOLD); fill(p, E(8, 13.8, 1.3, 1.2), GOLD); fill(p, E(8, 2, 1.2, 1.2), GOLD); } },
  hourglass: { name: 'Hourglass', draw: (p) => { fill(p, U(P([[4, 3], [12, 3], [8, 8.5]]), P([[8, 8.5], [12, 14], [4, 14]])), GLASS); fill(p, U(P([[5.5, 4], [10.5, 4], [8, 7]]), P([[8, 11], [11, 13.5], [5, 13.5]])), STRAW); fill(p, U(R(3, 2, 13, 3), R(3, 14, 13, 15)), WOOD); } },
  compass: { name: 'Compass', draw: (p) => { fill(p, E(8, 8.5, 6, 6), GOLD); fill(p, E(8, 8.5, 4.8, 4.8), CLOTHW); fill(p, P([[8, 4.5], [9.2, 8.5], [6.8, 8.5]]), RED); fill(p, P([[6.8, 8.5], [9.2, 8.5], [8, 12.5]]), ['#5a6474']); } },
  quill: { name: 'Quill', draw: (p) => { fill(p, (x, y) => segD(x, y, 5, 12, 13, 2) <= 2.2 * Math.min(1, Math.hypot(x - 5, y - 12) / 4) && Math.hypot(x - 5, y - 12) > 1, WHITE); line(p, 2, 15, 12, 3, 0.3, ['#3a3430']); } },
  ticket: { name: 'Ticket', draw: (p) => { fill(p, Minus(R(1.5, 5, 14.5, 11), U(E(1.5, 8, 1.4, 1.4), E(14.5, 8, 1.4, 1.4))), ['#ffd0a0', '#f0a050', '#b8702a']); line(p, 5, 5.5, 5, 10.5, 0.25, ['#b8702a']); } },
  orb: { name: 'Orb', draw: (p) => { fill(p, E(8, 8, 5.5, 5.5), ['#d8f4ff', '#6ac8f0', '#2a7ab0', '#1a4a7a']); dot(p, [[6, 5], [5, 6], [6, 6]], '#ffffff'); } },
  rune: { name: 'Rune stone', draw: (p) => { fill(p, E(8, 8.5, 5, 6), ['#b2b5bf', '#878b98', '#5c5f6c']); line(p, 8, 4.5, 8, 12.5, 0.45, ['#7ae0ff']); line(p, 8, 6, 10.5, 8, 0.45, ['#7ae0ff']); line(p, 8, 9, 5.5, 11, 0.45, ['#7ae0ff']); } },
  totem: { name: 'Charm', draw: (p) => { line(p, 8, 1.5, 8, 5, 0.3, ['#c8a070']); fill(p, E(8, 9.5, 4, 4.5), BONE); fill(p, U(E(6.5, 8.5, 0.9, 1.1), E(9.5, 8.5, 0.9, 1.1)), ['#1a1420']); line(p, 6.5, 11.5, 9.5, 11.5, 0.35, ['#9a2a22']); } },
};
const ICON_GROUP_LIST: [string, string[]][] = [
  ['Potions and bottles', ['potion', 'ether', 'tonic', 'potion_purple', 'potion_yellow', 'potion_white', 'elixir', 'vial', 'vial_blue', 'bottle', 'jar']],
  ['Food', ['apple', 'pear', 'banana', 'grapes', 'cherries', 'orange', 'lemon', 'berries', 'carrot', 'potato', 'onion', 'cabbage', 'corn', 'tomato', 'pumpkin', 'mushroom', 'mushroom_brown', 'egg', 'cheese', 'bread', 'bread_loaf', 'drumstick', 'steak', 'ham', 'fish_cooked', 'pie', 'cake', 'cookie', 'honey', 'rice_ball', 'soup', 'stew']],
  ['Drinks', ['water', 'waterskin', 'milk', 'mug', 'wine', 'wine_glass', 'soda', 'soda_can', 'tea', 'keg', 'barrel']],
  ['Weapons', ['sword', 'longsword', 'greatsword', 'katana', 'rapier', 'scimitar', 'dagger', 'throwing_knife', 'cleaver', 'axe', 'hammer', 'mace', 'morningstar', 'club', 'spear', 'halberd', 'trident', 'scythe', 'staff', 'staff_orb', 'wand', 'scepter', 'whip', 'knuckles', 'fist', 'bow', 'longbow', 'crossbow', 'arrow', 'arrow_steel', 'bomb', 'pickaxe']],
  ['Armor and clothes', ['armor', 'leather_armor', 'chainmail', 'plate_armor', 'shirt', 'tunic', 'vest', 'robe', 'cloak', 'pants', 'helmet', 'helmet_knight', 'helmet_horned', 'helmet_plumed', 'hood', 'hat', 'wizard_hat', 'crown', 'tiara', 'circlet', 'gloves', 'gauntlets', 'belt', 'boots', 'shoes', 'shield', 'shield_round', 'shield_kite', 'buckler']],
  ['Accessories and gems', ['ring', 'ring_sun', 'ring_tide', 'ring_leaf', 'ring_ember', 'amulet', 'gem', 'ruby', 'sapphire', 'emerald', 'amethyst', 'topaz', 'diamond', 'pearl', 'orb', 'rune', 'totem']],
  ['Materials', ['fur', 'wolf_pelt', 'leather', 'hide', 'tusk', 'horn', 'bone', 'skull', 'feather', 'claw', 'fang', 'scale', 'shell', 'slime_gel', 'hay', 'wheat_bundle', 'wool', 'cloth', 'thread', 'silk', 'rope', 'plank', 'log', 'nails']],
  ['Ores and minerals', ['stone', 'coal', 'ore_copper', 'ore_iron', 'ore_silver', 'ore_gold', 'ore_mythril', 'ingot_copper', 'ingot_iron', 'ingot_steel', 'ingot_silver', 'ingot_gold', 'ingot_mythril', 'crystal', 'salt', 'sulfur', 'clay', 'sand']],
  ['Herbs and plants', ['herb', 'flower', 'rose', 'leaf', 'clover', 'mint', 'nightshade', 'root', 'seeds', 'sapling', 'cactus']],
  ['Fishing', ['fishing_rod', 'fish_minnow', 'fish_trout', 'fish_eel', 'fish_koi', 'boot']],
  ['Containers and things', ['bag', 'sack', 'coin_bag', 'coin', 'basket', 'crate', 'chest', 'clay_pot', 'key', 'lockpick', 'scroll', 'book', 'map', 'letter', 'ticket', 'candle', 'lantern', 'torch', 'flashlight', 'bell', 'hourglass', 'compass', 'quill', 'saddle', 'trophy']],
  ['Magic', ['spell_fire', 'spell_ice', 'spell_bolt', 'spell_water', 'spell_wind', 'spell_quake', 'spell_poison', 'spell_light', 'spell_dark', 'spell_star', 'spell_heal', 'spell_shield', 'spell_haste', 'shard_fire', 'shard_frost', 'shard_spark', 'shard_venom', 'shard_arcane', 'shard_light', 'shard_shadow', 'shard_earth', 'shard_tide']],
];
Object.assign(ITEM_ICONS, MORE_ICONS);

/* ---------------------------------------------------------------- element stones */
const ESS_RAMPS: Record<string, [[string, string, string, string], string]> = {
  water: [['#e4fbff', '#7ee0f0', '#2fa6c8', '#1a5f86'], '#ffffff'],
  fire: [['#ffe9a8', '#ffab3d', '#e8582a', '#a8301c'], '#fff6d0'],
  nature: [['#e4ffb8', '#9ee05a', '#55a834', '#2e6a24'], '#f4ffd8'],
  earth: [['#f0d8a8', '#c89a5a', '#8a6232', '#5a3c1e'], '#fff0c8'],
  shock: [['#fffbd0', '#ffe45a', '#e0b02a', '#9a6e14'], '#ffffff'],
  light: [['#ffffff', '#fff2c0', '#e8cf7a', '#b0924a'], '#ffffff'],
  dark: [['#d8c8ff', '#9a7ad8', '#5e44a0', '#33245e'], '#efe4ff'],
};
const ESS_NAMES: Record<string, string> = { water: 'Water', fire: 'Fire', nature: 'Nature', earth: 'Earth', shock: 'Shock', light: 'Light', dark: 'Dark' };

/** A fragment: a small broken chip. */
function fragment(ramp: [string, string, string, string], mark: string): Draw {
  const outline: [number, number][] = [[7, 3.5], [11.5, 7], [10, 12.5], [4.5, 12], [3.8, 7.5]];
  return (p) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        if (!inPoly(cx, cy, outline)) continue;
        p.set(x, y, cy < 7 ? (cx < 8 ? ramp[0] : ramp[1]) : cx < 7 ? ramp[1] : cy > 10.5 ? ramp[3] : ramp[2]);
      }
    p.set(6, 6, mark); p.set(7, 7, mark);
  };
}

/** A heart stone: a faceted heart-shaped gem with a bright core. */
function heartStone(ramp: [string, string, string, string], mark: string): Draw {
  return (p) => {
    const inside = (x: number, y: number) => ell(x, y, 5.6, 5.8, 3.4, 3.2) || ell(x, y, 10.4, 5.8, 3.4, 3.2) || (y >= 5.8 && y <= 14.2 && Math.abs(x - 8) < (14.2 - y) * 0.82);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        if (!inside(cx, cy)) continue;
        const d = Math.hypot(cx - 7, cy - 7.5);
        p.set(x, y, d < 2 ? ramp[0] : cx < 8 && cy < 9 ? ramp[1] : cy > 11 || cx > 11 ? ramp[3] : ramp[2]);
      }
    p.set(5, 4, mark); p.set(6, 4, mark); p.set(4, 5, mark); p.set(7, 7, '#ffffff');
  };
}

for (const [el, [ramp, mark]] of Object.entries(ESS_RAMPS)) {
  ITEM_ICONS[`ess_fragment_${el}`] = { name: `${ESS_NAMES[el]} fragment`, draw: fragment(ramp, mark) };
  ITEM_ICONS[`ess_shard_${el}`] = { name: `${ESS_NAMES[el]} shard`, draw: shard(ramp, mark) };
  ITEM_ICONS[`ess_heart_${el}`] = { name: `${ESS_NAMES[el]} heart stone`, draw: heartStone(ramp, mark) };
}

/** The icons in picker order, by group (anything not listed goes under "More"). */
export function iconGroups(): [string, string[]][] {
  const seen = new Set<string>();
  const out: [string, string[]][] = ICON_GROUP_LIST.map(([g, list]) => [g, list.filter((n) => ITEM_ICONS[n] && !seen.has(n) && (seen.add(n), true))]);
  const ess = Object.keys(ITEM_ICONS).filter((n) => n.startsWith('ess_') && !seen.has(n));
  ess.forEach((n) => seen.add(n));
  out.push(['Element stones', ess]);
  const rest = Object.keys(ITEM_ICONS).filter((n) => !seen.has(n));
  if (rest.length) out.push(['More', rest]);
  return out.filter(([, l]) => l.length);
}

const cache = new Map<string, HTMLCanvasElement>();

/** The 16 × 16 canvas for a built-in icon (cached; an unknown name draws a grey square), recoloured by `tint`. */
export function builtinIcon(name: string, tint?: string): HTMLCanvasElement {
  const key = tint ? `${name}|${tint}` : name;
  let c = cache.get(key);
  if (c) return c;
  if (tint) { c = tintCanvas(builtinIcon(name), tint); cache.set(key, c); return c; }
  const p = new Pix(16, 16);
  const def = ITEM_ICONS[name];
  if (def) def.draw(p); else p.rect(3, 3, 10, 10, '#6a6a7a');
  p.outline(OUT);
  c = p.canvas();
  cache.set(key, c);
  return c;
}

/**
 * An icon recoloured in `hex`: every pixel takes the tint's hue (and most of its saturation) and keeps its own
 * lightness, so shading and highlights stay; the dark outline and pure white glints are left as they are.
 */
export function tintCanvas(src: HTMLCanvasElement, hex: string): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = src.width; out.height = src.height;
  const g = out.getContext('2d')!;
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, out.width, out.height), d = img.data;
  const t = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  const [th, ts, tl] = rgbToHsl((t >> 16) & 255, (t >> 8) & 255, t & 255);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    if (l < 0.13 || l > 0.97) continue;
    // Greys (blades, steel) take the colour more gently; a very dark or pale tint darkens or lightens a little too.
    const ns = Math.min(1, ts * (s > 0.12 ? 1 : 0.6));
    const nl = Math.max(0, Math.min(1, l + (tl - 0.5) * 0.35));
    const [r, gg, b] = hslToRgb(th, ns, nl);
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }
  g.putImageData(img, 0, 0);
  return out;
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const dd = mx - mn, s = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
  const h = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
  return [h / 6, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/** "builtin:potion" → "potion", or null for an imported image path. */
export const builtinIconName = (icon: string | undefined): string | null => (icon?.startsWith('builtin:') ? icon.slice(8) : null);
