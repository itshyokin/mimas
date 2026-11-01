/**
 * The Party page's member panels (Database → Menus → Party page layout): where each of Players 1 – 4 sits on the
 * page and how big (in percent of the page, so it scales with the screen), its text size, and which parts it shows.
 * Player 1 is the lead (first in the lineup, first out in battle). Anyone after Player 4 (the reserve) takes Player
 * 4's panel, one under another.
 */

export type PanelSize = 'big' | 'medium' | 'small';
export const PANEL_PARTS = ['picture', 'name', 'level', 'ailment', 'elements', 'hp', 'mp', 'exp', 'expNumbers', 'levelUp'] as const;
export type PanelPart = typeof PANEL_PARTS[number];
export const PART_NAMES: Record<PanelPart, string> = {
  picture: 'Picture', name: 'Name', level: 'Level', ailment: 'Ailment', elements: 'Elements', hp: 'Health bar', mp: 'Magic bar',
  exp: 'EXP bar', expNumbers: 'EXP numbers', levelUp: 'LEVEL UP badge',
};

export interface PartyPanel {
  /** Left, top, width and height in percent of the page. */
  x: number; y: number; w: number; h: number;
  size: PanelSize;
  /** Parts hidden (all shown when empty). */
  hide?: PanelPart[];
}

export interface PartyLayout { panels: PartyPanel[] }

export const DEFAULT_PARTY_LAYOUT: PartyLayout = {
  panels: [
    { x: 0, y: 0, w: 36, h: 100, size: 'big' },
    { x: 50.4, y: 0, w: 37.2, h: 32.4, size: 'medium' },
    { x: 50.4, y: 33.8, w: 37.2, h: 32.4, size: 'medium' },
    { x: 50.4, y: 67.6, w: 37.2, h: 32.4, size: 'medium' },
  ],
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** The Database's layout made safe (four panels, inside the page), or the default. */
export function partyLayout(src?: Partial<PartyLayout>): PartyLayout {
  const panels = DEFAULT_PARTY_LAYOUT.panels.map((d, i) => {
    const p = src?.panels?.[i];
    if (!p) return { ...d };
    const w = clamp(Number(p.w) || d.w, 8, 100), h = clamp(Number(p.h) || d.h, 8, 100);
    return {
      x: clamp(Number(p.x) || 0, 0, 100 - w), y: clamp(Number(p.y) || 0, 0, 100 - h), w, h,
      size: (['big', 'medium', 'small'] as PanelSize[]).includes(p.size as PanelSize) ? p.size : d.size,
      hide: (p.hide ?? []).filter((k) => (PANEL_PARTS as readonly string[]).includes(k)),
    };
  });
  return { panels };
}

/** Only what differs from the default (or undefined), for saving. */
export function cleanPartyLayout(l: PartyLayout): PartyLayout | undefined {
  const same = l.panels.every((p, i) => {
    const d = DEFAULT_PARTY_LAYOUT.panels[i];
    return p.x === d.x && p.y === d.y && p.w === d.w && p.h === d.h && p.size === d.size && !(p.hide?.length);
  });
  return same ? undefined : { panels: l.panels.map((p) => ({ ...p, ...(p.hide?.length ? { hide: [...p.hide] } : { hide: undefined }) })) };
}
