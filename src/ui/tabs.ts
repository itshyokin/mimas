/**
 * Tabs across the top of a menu screen that groups several screens (the Inventory: items, equipment, status; the
 * Journal: quests, the adventure log, records). LB / RB (Q / E, Page Up / Down) move between them, or click one.
 * Each screen draws the strip with `tabStrip`, wires it with `wireTabs`, and asks `tabKeys` first in its update.
 */
import type { Input } from '../game/Input';
import { esc } from './InventoryScreen';

export interface TabGroup {
  labels: string[];
  /** Update 130: a little picture before each label (SVG markup), when given. */
  icons?: string[];
  index: number;
  /** The keys or buttons that move between tabs (shown at each end). */
  keys: [string, string];
  /** Go to another tab: by a step (-1, 1) or, with `to`, straight to that tab. */
  go(step: number, to?: number): void;
  /**
   * Inside the pause menu: its own tabs (Party, Items, Map…), drawn by the menu across the top and moved with LB / RB.
   * This group is then the screen's inner tabs, moved with LT / RT (Z / C) instead.
   */
  main?: TabGroup;
}

export function tabStrip(t: TabGroup | undefined): string {
  if (!t || t.labels.length < 2) return '';
  return `<div class="tab-strip${t.icons ? ' with-icons' : ''}" role="tablist"><span class="tab-key" aria-hidden="true">${esc(t.keys[0])}</span>${
    t.labels.map((l, k) => `<button type="button" class="tab-btn" role="tab" aria-selected="${k === t.index}" data-tabgo="${k}" title="${esc(l)}">${t.icons?.[k] ? `<span class="tab-ico" aria-hidden="true">${t.icons[k]}</span>` : ''}${esc(l)}</button>`).join('')
  }<span class="tab-key" aria-hidden="true">${esc(t.keys[1])}</span></div>`;
}

export function wireTabs(root: HTMLElement, t: TabGroup | undefined): void {
  if (!t) return;
  root.querySelectorAll<HTMLElement>('[data-tabgo]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const k = Number(b.dataset.tabgo);
    if (k !== t.index) t.go(k - t.index, k);
  }));
}

/**
 * The Party menu (Update 141): its own tabs (Party, Journal) on the triggers (LT / RT), the Journal's tabs on the
 * bumpers (LB / RB), the other way round from other menus.
 */
export const tabSwap = { on: false };

/** LB / RB: true when it moved to another tab (the screen should stop handling keys this frame). */
export function tabKeys(input: Input, t: TabGroup | undefined): boolean {
  if (!t) return false;
  if (t.main) {
    const [mp, mn, ip, inn] = tabSwap.on ? ['subPrev', 'subNext', 'tabPrev', 'tabNext'] as const : ['tabPrev', 'tabNext', 'subPrev', 'subNext'] as const;
    if (input.consume(mp)) { t.main.go(-1); return true; }
    if (input.consume(mn)) { t.main.go(1); return true; }
    if (t.labels.length < 2) return false;
    if (input.consume(ip)) { t.go(-1); return true; }
    if (input.consume(inn)) { t.go(1); return true; }
    return false;
  }
  if (t.labels.length < 2) return false;
  if (input.consume('tabPrev')) { t.go(-1); return true; }
  if (input.consume('tabNext')) { t.go(1); return true; }
  return false;
}
