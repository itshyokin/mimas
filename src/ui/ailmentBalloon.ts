/**
 * Ailments on a hero's panel (Update 105): an RPG Maker-style balloon popping off the face with the ailment's icon
 * (bubbles for Poison, a flame for Burn, a bolt for Paralyze, "Zz" for Sleep…), and its pill beside the weather's.
 * Used by the HUD's party cards, the hero's own gauges and the pause menu's party panels. Styles: `.ail-*` in
 * styles.css.
 */
const SVG = (body: string) => `<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">${body}</svg>`;
const ICON: Record<string, string> = {
  poison: SVG('<circle cx="6" cy="10" r="3.5" fill="#9a4ad8"/><circle cx="11" cy="6" r="2.4" fill="#b86ef0"/><circle cx="11.5" cy="12.5" r="1.4" fill="#7a2ab8"/>'),
  burn: SVG('<path d="M8 1c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0C4 7 6 6 6 3.5 7 4.5 7.5 5.5 8 1z" fill="#ff6a2a"/><path d="M8 7c.5 1.6 2 2.4 2 4.2a2 2 0 0 1-4 0c0-1.3 1-1.8 1-3 .5.4.8.9 1-1.2z" fill="#ffd04a"/>'),
  paralyze: SVG('<path d="M9.5 1L3 9h4.2L6 15l7-8.4H8.6L9.5 1z" fill="#e8c21a" stroke="#7a5a00" stroke-width="0.8" stroke-linejoin="round"/>'),
  sleep: '<span class="ail-zz">Zz</span>',
  confusion: SVG('<path d="M8 8.2a1.2 1.2 0 1 1 1.2-1.4 2.6 2.6 0 1 1-2.9-2.3 4 4 0 1 1-3.8 4.6" fill="none" stroke="#e05aa8" stroke-width="1.7" stroke-linecap="round"/>'),
  blind: SVG('<path d="M1.5 8s2.4-4.2 6.5-4.2S14.5 8 14.5 8 12.1 12.2 8 12.2 1.5 8 1.5 8z" fill="#3a3a50"/><path d="M2.5 13.5l11-11" stroke="#1a1622" stroke-width="1.8" stroke-linecap="round"/>'),
  silence: SVG('<path d="M3 6h3l3.5-3v10L6 10H3z" fill="#8a64d8"/><path d="M11 6l3.5 4M14.5 6L11 10" stroke="#5a3aa8" stroke-width="1.6" stroke-linecap="round"/>'),
  zombie: SVG('<path d="M8 1.8c3.4 0 5.6 2.3 5.6 5.4 0 2-1 3.2-2.2 3.9v2.6H4.6v-2.6C3.4 10.4 2.4 9.2 2.4 7.2 2.4 4.1 4.6 1.8 8 1.8z" fill="#7aa86a"/><circle cx="5.9" cy="7.4" r="1.4" fill="#1a2a14"/><circle cx="10.1" cy="7.4" r="1.4" fill="#1a2a14"/><path d="M6.4 13.7v-1.6M8 13.7v-1.6M9.6 13.7v-1.6" stroke="#1a2a14" stroke-width="0.9"/>'),
  chill: SVG('<path d="M8 1v14M2 4.5l12 7M2 11.5l12-7" stroke="#5ab0ff" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  frozen: SVG('<rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="#bfe6ff" stroke="#4a9ad8" stroke-width="1.2"/><path d="M5 5l3 2" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>'),
  stagger: SVG('<path d="M8 1.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L8 9.6l-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="#ffb84a" stroke="#8a5a00" stroke-width="0.7"/>'),
};

/** The balloon off the face for this ailment ('' for none). */
export function ailmentBalloon(a: string | null | undefined, name?: string): string {
  if (!a) return '';
  return `<span class="ail-balloon" title="${(name ?? a).replace(/"/g, '')}" role="img" aria-label="${(name ?? a).replace(/"/g, '')}">${ICON[a] ?? `<b>!</b>`}</span>`;
}

/** A good state's pill (Rested, Well Rested): gold, with the time left in its tooltip. */
export function goodPill(g: { name: string; color: string; ink: string; left?: string } | null | undefined, short = false): string {
  if (!g) return '';
  return `<span class="wf-pill good-pill${short ? ' short' : ''}" style="background:${g.color};color:${g.ink}" title="${g.name}${g.left ? `: ${g.left} left` : ''}">★${short ? '' : ` ${g.name}`}</span>`;
}

/** The ailment's pill (its colours from Database → Combat → Ailments). */
export function ailmentPill(p: { tag: string; color: string; ink: string; name: string } | null | undefined): string {
  if (!p) return '';
  return `<span class="wf-pill ail-pill" style="background:${p.color};color:${p.ink}" title="${p.name.replace(/"/g, '')}">${p.tag.replace(/[<&]/g, '')}</span>`;
}
