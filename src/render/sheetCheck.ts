/**
 * Character Builder sheets sometimes draw an animation without some of the character's clothes or accessories (the
 * piece had no frames for that pose): a combat stance or a run in a bare shirt. Each animation is compared with the
 * walk: if colours that make up a noticeable part of the walking character are missing from it, it's left out, and
 * the character uses their complete animations instead (standing, walking, the swings that have everything).
 * No three.js, so it can be tested on its own.
 */
import type { CharacterAnimLayout } from '../world/types';

/** Share of the walking character's pixels whose colours may be missing before an animation counts as incomplete. */
const MISSING = 0.04;

/** Colours of the visible pixels in one row of frames (4 bits a channel), counted per frame. */
function colours(data: ImageData, frame: number, row: number, frames: number): Map<number, number> {
  const out = new Map<number, number>(), W = data.width, px = data.data;
  for (let f = 0; f < frames; f++) {
    for (let y = row * frame; y < (row + 1) * frame && y < data.height; y++) {
      for (let x = f * frame; x < (f + 1) * frame && x < W; x++) {
        const i = (y * W + x) * 4;
        if (px[i + 3] <= 128) continue;
        const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
        out.set(k, (out.get(k) ?? 0) + 1 / frames);
      }
    }
  }
  return out;
}

/** The animations on this sheet drawn without some of what the character wears. */
export function incompleteAnims(data: ImageData, layout: CharacterAnimLayout): Set<string> {
  const bad = new Set<string>(), A = layout.anims, walk = A.walk;
  if (!walk) return bad;
  const dirRow = (dir: string) => Math.max(0, layout.dirs.indexOf(dir as never));
  const refs = new Map<string, Map<number, number>>();
  const ref = (dir: string) => {
    let r = refs.get(dir);
    if (!r) { r = colours(data, layout.frame, walk.row + (walk.dirs === 4 ? dirRow(dir) : 0), walk.frames); refs.set(dir, r); }
    return r;
  };
  for (const [name, a] of Object.entries(A)) {
    if (name === 'walk') continue;
    // Compared facing the camera; one-direction animations: climbing is seen from behind, the rest from the front.
    const dir = a.dirs === 4 ? 'down' : name === 'climb' ? 'up' : 'down';
    const r = ref(dir), total = [...r.values()].reduce((s, v) => s + v, 0);
    if (!total) continue;
    const c = colours(data, layout.frame, a.row + (a.dirs === 4 ? dirRow(dir) : 0), a.frames);
    let missing = 0;
    for (const [k, v] of r) if (v / total > 0.005 && (c.get(k) ?? 0) < 0.15 * v) missing += v;
    if (missing / total >= MISSING) bad.add(name);
  }
  return bad;
}

/** The layout without its incomplete animations (walk always stays). */
export function completeLayout(data: ImageData, layout: CharacterAnimLayout): CharacterAnimLayout {
  const bad = incompleteAnims(data, layout);
  if (!bad.size) return layout;
  return { ...layout, anims: Object.fromEntries(Object.entries(layout.anims).filter(([n]) => !bad.has(n))) };
}
