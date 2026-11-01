/**
 * The Change time pop-up (Update 132): four digits (hours and minutes) and AM / PM, controller friendly. ← → pick a
 * digit (or AM / PM), ↑ ↓ change it, A / Enter sets the time, B / Esc cancels. With the 24-hour clock there's no
 * AM / PM and the hours run 00 … 23.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';

export class TimePicker {
  private readonly root = document.createElement('div');
  private open = false;
  private h12 = true;
  /** Digits: tens of hours, hours, tens of minutes, minutes; then PM (12-hour clock). */
  private d = [0, 0, 0, 0];
  private pm = false;
  /** Which column is picked: 0 … 3 the digits, 4 AM / PM. */
  private col = 0;
  private title = 'Change time';
  private done: (hour: number | null) => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'time-picker';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Change the time');
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t || !this.open) return;
      const [act, k] = t.dataset.act!.split(':');
      if (act === 'col') this.col = Number(k);
      else if (act === 'up') { this.col = Number(k); this.step(1); }
      else if (act === 'down') { this.col = Number(k); this.step(-1); }
      else if (act === 'ok') { this.finish(true); return; }
      else if (act === 'cancel') { this.finish(false); return; }
      this.draw();
    });
  }

  get isOpen(): boolean { return this.open; }

  /** Open at `hour` (0 … 24, fractions are minutes); `done` gets the hour picked, or null when cancelled. */
  show(hour: number, clock12: boolean, title: string, done: (hour: number | null) => void): void {
    this.h12 = clock12;
    this.title = title;
    this.done = done;
    const total = Math.round(hour * 60) % 1440, hh = Math.floor(total / 60), mm = total % 60;
    this.pm = hh >= 12;
    const shown = clock12 ? hh % 12 || 12 : hh;
    this.d = [Math.floor(shown / 10), shown % 10, Math.floor(mm / 10), mm % 10];
    this.col = 0;
    this.open = true;
    this.root.hidden = false;
    this.draw();
  }

  /** The hour picked (0 … 24, with minutes as a fraction). */
  private hour(): number {
    let hh = this.d[0] * 10 + this.d[1];
    const mm = this.d[2] * 10 + this.d[3];
    if (this.h12) hh = (hh % 12) + (this.pm ? 12 : 0);
    return hh + mm / 60;
  }

  /** Change the picked column by one (wrapping, and keeping the time valid). */
  private step(by: number): void {
    const c = this.col;
    if (c === 4) { this.pm = !this.pm; uiSound('menuMove'); return; }
    const d = this.d;
    if (c === 0) d[0] = wrap(d[0] + by, this.h12 ? 2 : 3);
    else if (c === 1) d[1] = wrap(d[1] + by, 10);
    else if (c === 2) d[2] = wrap(d[2] + by, 6);
    else d[3] = wrap(d[3] + by, 10);
    // Keep the hours in range: 01 … 12 (12-hour) or 00 … 23.
    let hh = d[0] * 10 + d[1];
    if (this.h12) { if (hh > 12) hh = c === 0 ? 10 + Math.min(2, d[1]) : 12; if (hh === 0) hh = c === 0 ? 1 : 12; }
    else if (hh > 23) hh = c === 0 ? 20 + Math.min(3, d[1]) : 23;
    d[0] = Math.floor(hh / 10); d[1] = hh % 10;
    uiSound('menuMove');
  }

  private finish(ok: boolean): void {
    this.open = false;
    this.root.hidden = true;
    uiSound(ok ? 'menuOk' : 'menuBack');
    this.done(ok ? this.hour() : null);
  }

  update(): void {
    if (!this.open) return;
    const i = this.input, cols = this.h12 ? 5 : 4;
    if (i.consume('cancel')) { this.finish(false); return; }
    if (i.consume('ok') || i.consume('jump')) { this.finish(true); return; }
    let moved = false;
    if (i.consume('left')) { this.col = (this.col + cols - 1) % cols; moved = true; uiSound('menuMove'); }
    if (i.consume('right')) { this.col = (this.col + 1) % cols; moved = true; uiSound('menuMove'); }
    if (i.consume('up')) { this.step(1); moved = true; }
    if (i.consume('down')) { this.step(-1); moved = true; }
    if (moved) this.draw();
  }

  private draw(): void {
    const digit = (k: number) => `<div class="tp-col${this.col === k ? ' on' : ''}">
      <button type="button" class="tp-arrow" data-act="up:${k}" aria-label="Up">▲</button>
      <button type="button" class="tp-digit" data-act="col:${k}">${this.d[k]}</button>
      <button type="button" class="tp-arrow" data-act="down:${k}" aria-label="Down">▼</button></div>`;
    this.root.innerHTML = `<div class="tp-box">
      <div class="tp-title">${this.title}</div>
      <div class="tp-row">${digit(0)}${digit(1)}<span class="tp-colon">:</span>${digit(2)}${digit(3)}${this.h12 ? `<div class="tp-col tp-ampm${this.col === 4 ? ' on' : ''}">
        <button type="button" class="tp-arrow" data-act="up:4" aria-label="Switch">▲</button>
        <button type="button" class="tp-digit" data-act="col:4">${this.pm ? 'PM' : 'AM'}</button>
        <button type="button" class="tp-arrow" data-act="down:4" aria-label="Switch">▼</button></div>` : ''}</div>
      <div class="tp-hint">← → choose · ↑ ↓ change</div>
      <div class="tp-btns"><button type="button" class="tp-btn" data-act="cancel">Cancel (B)</button><button type="button" class="tp-btn primary" data-act="ok">Set time (A)</button></div>
    </div>`;
  }
}

const wrap = (v: number, n: number): number => ((v % n) + n) % n;
