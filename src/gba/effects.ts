/**
 * Mimas: battle effects (GBA Studio sprites of kind "effect": 64 × 64, up to 6 frames in a row).
 *
 * A move plays its hit (drawn in the five greys of the fx_hit palette, recoloured to the move's element), then, for
 * an elemental move, its element's burst (fire, water…; bursts keep their own colours). Each has its own sound.
 * The ROM does the same with sprite palettes (tools/gba_game.py), so these colours must match ELEMENT_RAMPS there.
 */
import type { Ailment, Element } from '../world/types';
import type { GbaData, GbaSprite } from './types';

/** The hit greys, brightest first (fx_hit's colours 1-5), and each element's five colours for them. */
export const HIT_GREYS = ['#f8f8f8', '#d0d0d8', '#a0a0b0', '#606070', '#303038'];
export const ELEMENT_RAMPS: Record<Element, string[]> = {
  neutral: HIT_GREYS,
  fire: ['#fff8c0', '#f8c040', '#f08020', '#c03010', '#601008'],
  water: ['#e8f8ff', '#80c8f8', '#3880e0', '#2048a0', '#102050'],
  nature: ['#f0ffd0', '#a0e060', '#50a830', '#286818', '#103008'],
  earth: ['#f8e8c0', '#d0a060', '#a07038', '#604020', '#302010'],
  shock: ['#ffffe0', '#f8f060', '#e0c020', '#a08010', '#504008'],
  light: ['#ffffff', '#fff0a0', '#f8d850', '#c0a030', '#605018'],
  dark: ['#e0c8f8', '#a070d0', '#6838a0', '#381860', '#180828'],
};

/** Each element's burst (the effect sprite id), and the ones some ailments use when the move has no element. */
export const ELEMENT_BURST: Record<Element, string | null> = {
  neutral: null, fire: 'fx_fire', water: 'fx_water', nature: 'fx_nature', earth: 'fx_earth', shock: 'fx_shock', light: 'fx_light', dark: 'fx_dark',
};
export const AILMENT_BURST: Partial<Record<Ailment, string>> = { poison: 'fx_poison', chill: 'fx_ice', burn: 'fx_fire', paralyze: 'fx_shock' };

export interface MoveLook { effect?: string; burst?: string; element?: Element; inflicts?: { ailment: Ailment }[] }

/** What a move plays: its hit (default: a slash for Additions, nothing for spells) and its burst. */
export function moveEffects(m: MoveLook, kind: 'addition' | 'spell' | 'heal'): { hit: string | null; burst: string | null } {
  const hit = m.effect === 'none' ? null : m.effect ?? (kind === 'addition' ? 'fx_slash' : kind === 'heal' ? 'fx_sparkle' : null);
  let burst: string | null = null;
  if (m.burst && m.burst !== 'auto') burst = m.burst === 'none' ? null : m.burst;
  else burst = ELEMENT_BURST[m.element ?? 'neutral'] ?? (m.inflicts ?? []).map((x) => AILMENT_BURST[x.ailment]).find(Boolean) ?? null;
  // a spell with no hit still shows something
  if (!hit && !burst && kind === 'spell') return { hit: 'fx_hit', burst: null };
  return { hit, burst };
}

export function effectSprites(gba: GbaData): GbaSprite[] { return gba.sprites.filter((s) => s.kind === 'effect'); }

const rgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/**
 * An effect's frames, ready to draw: a hit recoloured to `element` (its greys swapped for the element's colours;
 * the sprite's own palette colours 1-5 are the greys it was painted with).
 */
export function effectFrames(sheet: HTMLCanvasElement, sprite: GbaSprite, gba: GbaData, element: Element = 'neutral'): HTMLCanvasElement[] {
  const n = Math.max(1, Math.min(6, sprite.frames ?? Math.floor(sheet.width / 64)));
  const ramp = sprite.role !== 'burst' && element !== 'neutral' ? ELEMENT_RAMPS[element] : null;
  const from = (gba.palettes.find((p) => p.id === sprite.palette)?.colors ?? HIT_GREYS).slice(0, 5).map(rgb);
  const to = ramp?.map(rgb);
  const out: HTMLCanvasElement[] = [];
  for (let f = 0; f < n; f++) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d')!;
    g.drawImage(sheet, f * 64, 0, 64, 64, 0, 0, 64, 64);
    if (to) {
      const d = g.getImageData(0, 0, 64, 64);
      for (let i = 0; i < d.data.length; i += 4) {
        if (d.data[i + 3] < 128) continue;
        const k = from.findIndex(([r, gg, b]) => Math.abs(r - d.data[i]) < 6 && Math.abs(gg - d.data[i + 1]) < 6 && Math.abs(b - d.data[i + 2]) < 6);
        if (k >= 0) { d.data[i] = to[k][0]; d.data[i + 1] = to[k][1]; d.data[i + 2] = to[k][2]; }
      }
      g.putImageData(d, 0, 0);
    }
    out.push(c);
  }
  return out;
}
