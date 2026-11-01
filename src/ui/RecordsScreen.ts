/**
 * The Journal's Records: a tally of the adventure so far (steps taken, days passed, enemies defeated, kind by kind,
 * trees chopped, the strongest hit…), in a few sections. Read-only; ↑ ↓ scroll.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';
import { tabKeys, tabStrip, wireTabs, type TabGroup } from './tabs';

export interface RecordSection { title: string; rows: [string, string][]; empty?: string }

export class RecordsScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private scroller: HTMLElement | null = null;
  private onClose: () => void = () => {};
  private tabs: TabGroup | undefined;

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'inv records-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Records');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.close(); } });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  /** `sections`, or a page of its own (the Type Chart). */
  show(title: string, sections: RecordSection[] | { html: string }, onClose: () => void, tabs?: TabGroup): void {
    this.onClose = onClose;
    this.tabs = tabs;
    this.open = true;
    const body = 'html' in sections ? sections.html : sections.map((s) => `<section class="rec-section"><h3>${esc(s.title)}</h3>${
      s.rows.length ? `<dl class="rec-rows">${s.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : `<p class="rec-empty">${esc(s.empty ?? 'Nothing yet.')}</p>`
    }</section>`).join('');
    this.root.innerHTML = `<div class="inv-box rec-box"><div class="menu-title">${esc(title)}</div>${tabStrip(tabs)}
      <div class="rec-body">${body}</div>
      <div class="menu-note">↑ ↓ scroll${tabs ? ` · ${esc(tabs.keys[0])} / ${esc(tabs.keys[1])}: Journal tabs` : ''} · Esc or B to close</div></div>`;
    wireTabs(this.root, tabs);
    this.scroller = this.root.querySelector('.rec-body');
    this.root.hidden = false;
  }

  private close(): void {
    this.open = false;
    this.root.hidden = true;
    uiSound('menuBack');
    this.onClose();
  }

  /** Put away without closing the Journal (another of its tabs is taking over). */
  hide(): void { this.open = false; this.root.hidden = true; }

  update(dt: number): void {
    if (!this.open) return;
    const i = this.input;
    if (tabKeys(i, this.tabs)) return;
    if (i.consume('cancel') || i.consume('ok')) { this.close(); return; }
    const dir = (i.isHeld('down') ? 1 : 0) - (i.isHeld('up') ? 1 : 0);
    for (const a of ['up', 'down', 'left', 'right'] as const) i.consume(a);
    if (dir && this.scroller) this.scroller.scrollTop += dir * dt * 520;
  }
}
