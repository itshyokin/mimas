/**
 * A hero transforming into their next form (after the battle that took them to its level): the old look, then both
 * as white outlines flickering faster and faster, a flash, and the new look in colour. OK hurries it, then goes on.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';

export class EvolveScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private t = 0;
  private done: () => void = () => {};
  private onSound: (name: string) => void = () => {};
  private oldEl!: HTMLElement;
  private newEl!: HTMLElement;
  private textEl!: HTMLElement;
  private name = '';
  private form = '';
  private finished = false;

  /** How long the flickering lasts, the flash, then the reveal (seconds). */
  private static readonly SHOW = 1.2;
  private static readonly FLICKER = 3.2;

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'evolve';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Transformation');
    this.root.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.press('ok'); });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  /** `form`: what the new form is called ("their final form"). */
  show(name: string, form: string, before: HTMLCanvasElement, after: HTMLCanvasElement, done: () => void, sound: (name: string) => void): void {
    this.open = true; this.t = 0; this.finished = false;
    this.done = done; this.onSound = sound; this.name = name; this.form = form;
    this.root.innerHTML = `<div class="evo-stage"><div class="evo-glow"></div><div class="evo-fig evo-old"></div><div class="evo-fig evo-new"></div><div class="evo-flash"></div></div>
      <div class="evo-text"></div>`;
    this.oldEl = this.root.querySelector('.evo-old')!;
    this.newEl = this.root.querySelector('.evo-new')!;
    this.textEl = this.root.querySelector('.evo-text')!;
    for (const [el, c] of [[this.oldEl, before], [this.newEl, after]] as const) { const img = document.createElement('img'); img.src = c.toDataURL(); img.alt = ''; el.append(img); }
    this.textEl.innerHTML = `What? <b>${esc(name)}</b> is changing!`;
    this.root.hidden = false;
    this.root.classList.remove('on', 'lit', 'revealed');
    void this.root.offsetWidth;
    this.root.classList.add('on');
    this.onSound('skill');
  }

  update(dt: number): void {
    if (!this.open) return;
    const ok = this.input.consume('ok') || this.input.consume('cancel');
    if (this.finished) { if (ok) this.close(); return; }
    if (ok) this.t = Math.max(this.t, EvolveScreen.SHOW + EvolveScreen.FLICKER);
    this.t += dt;
    const S = EvolveScreen.SHOW, F = EvolveScreen.FLICKER;
    if (this.t < S) { this.show2(true, false); return; }
    if (this.t < S + F) {
      // Both as white outlines, swapping faster and faster (every 0.45 s down to every 0.05 s).
      const k = (this.t - S) / F, period = 0.45 * (1 - k) + 0.05 * k;
      const phase = Math.floor((this.t - S) / period) % 2 === 0;
      this.root.classList.add('lit');
      this.show2(phase, !phase);
      return;
    }
    // The flash and the reveal.
    this.root.classList.remove('lit');
    this.root.classList.add('revealed');
    this.show2(false, true);
    this.textEl.innerHTML = `<b>${esc(this.name)}</b> has grown into ${esc(this.form)}!<small>▶ OK</small>`;
    this.finished = true;
    this.onSound('levelUp');
  }

  private show2(a: boolean, b: boolean): void {
    this.oldEl.style.opacity = a ? '1' : '0';
    this.newEl.style.opacity = b ? '1' : '0';
  }

  private close(): void {
    this.open = false;
    this.root.hidden = true;
    this.root.innerHTML = '';
    uiSound('menuOk');
    this.done();
  }
}
