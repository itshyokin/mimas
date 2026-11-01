/**
 * The Credits screen (title menu → Credits): your sections from Database → Credits, then everyone whose sprite art
 * is in the game. It scrolls by itself; up / down (or the stick, or the mouse wheel) scroll it by hand, and Esc / B or
 * Enter / A closes it.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import type { CreditSection } from '../game/credits';
import { esc } from './InventoryScreen';

export class CreditsScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private scroller: HTMLElement | null = null;
  private auto = true;
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'inv credits-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Credits');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.close(); } });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(title: string, sections: CreditSection[], onClose: () => void): void {
    this.onClose = onClose;
    this.open = true; this.auto = true;
    const body = sections.length
      ? sections.map((s) => `<section class="cr-sec${s.small ? ' cr-small' : ''}">${s.title ? `<h3>${esc(s.title)}</h3>` : ''}${s.lines.map((l) => (l ? `<p>${esc(l)}</p>` : '<p class="cr-gap"></p>')).join('')}</section>`).join('')
      : '<p class="cr-empty">No credits yet. Add them in the editor under Database → Credits.</p>';
    this.root.innerHTML = `<div class="inv-box cr-box"><div class="cr-scroll"><h2 class="cr-title">${esc(title)}</h2>${body}<p class="cr-end">Thank you for playing!</p></div>
      <div class="menu-note">↑ ↓ scroll · Enter or Esc to close</div></div>`;
    this.scroller = this.root.querySelector('.cr-scroll');
    this.scroller?.addEventListener('wheel', () => (this.auto = false), { passive: true });
    this.scroller?.addEventListener('touchstart', () => (this.auto = false), { passive: true });
    this.root.hidden = false;
  }

  private close(): void {
    this.open = false;
    this.root.hidden = true;
    uiSound('menuBack');
    this.onClose();
  }

  update(dt: number): void {
    if (!this.open) return;
    const i = this.input, s = this.scroller;
    if (i.consume('cancel') || i.consume('ok')) { this.close(); return; }
    if (!s) return;
    const dir = (i.isHeld('down') ? 1 : 0) - (i.isHeld('up') ? 1 : 0);
    for (const a of ['up', 'down', 'left', 'right'] as const) i.consume(a);
    if (dir) { this.auto = false; s.scrollTop += dir * dt * 420; }
    else if (this.auto) s.scrollTop += dt * 36;
  }
}
