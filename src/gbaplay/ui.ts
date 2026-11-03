/**
 * Mimas: the GBA playtest's menus, Pokémon GB / GBA style. White windows with a blue frame placed on the 240 × 160
 * screen, a ▶ beside the chosen line, the pixel font. The pause menu, the bag, the party, shops and the "forget a move"
 * questions are built from these, and the ROM draws the same windows.
 *
 * Windows stay on screen until they're closed (the pause menu stays while the bag is open over it); `pick` makes one
 * take the keys until a line is chosen (or B: -1). Messages and yes / no questions use Saturn's message window.
 */
import type { Input } from '../game/Input';
import type { MessageWindow } from '../ui/MessageWindow';

export interface Row {
  label: string;
  /** A picture to the left of the label (an item's icon). */
  icon?: string;
  /** Text on the right (×3, a price). */
  right?: string;
  disabled?: boolean;
  /** A heading inside the list ("[ Spells ]"): the cursor passes over it. */
  divider?: boolean;
  /** Shown in the window's description box while this line is chosen. */
  detail?: string;
  /** A health bar under the label (0 … 1). */
  bar?: number;
  /** A second line under the label (smaller). */
  sub?: string;
}

export interface WinOpts {
  /** Where, in GBA pixels (240 × 160). */
  x: number;
  y: number;
  w: number;
  rows: Row[];
  /** Lines shown before it scrolls. */
  max?: number;
  title?: string;
  start?: number;
  /** A description box at the bottom of the screen, for the chosen line's `detail`. */
  detail?: boolean;
  /** Extra class (bag, party…). */
  cls?: string;
}

export interface Win {
  el: HTMLDivElement;
  opts: WinOpts;
  i: number;
  top: number;
  detailEl?: HTMLDivElement;
  resolve?: (i: number) => void;
  onMove?: (i: number) => void;
  /** Left / right on this window (the bag's pockets, a count). */
  onSide?: (d: -1 | 1) => void;
  /** Up / down change something instead of moving the cursor (a count). */
  onUpDown?: (d: -1 | 1) => void;
}

export class GbaUi {
  readonly root = document.createElement('div');
  private wins: Win[] = [];
  private active: Win | null = null;
  private waits: { test: () => boolean; done: () => void }[] = [];
  /** Running flows (menus, questions): the field and events wait while there are any. */
  flows = 0;

  constructor(parent: HTMLElement, private readonly input: Input, private readonly message: MessageWindow) {
    this.root.className = 'gba-ui';
    parent.append(this.root);
  }

  get busy(): boolean { return this.flows > 0 || this.wins.length > 0; }

  /** Run a flow (the field and events wait until it's done). */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.flows++;
    try { return await fn(); } finally { this.flows--; }
  }

  open(opts: WinOpts): Win {
    const el = document.createElement('div');
    el.className = `gba-win ${opts.cls ?? ''}`;
    el.style.left = `calc(var(--gba) * ${opts.x})`;
    el.style.top = `calc(var(--gba) * ${opts.y})`;
    el.style.width = `calc(var(--gba) * ${opts.w})`;
    const w: Win = { el, opts, i: Math.max(0, Math.min(opts.rows.length - 1, opts.start ?? 0)), top: 0 };
    if (opts.detail) {
      w.detailEl = document.createElement('div');
      w.detailEl.className = 'gba-win gba-detail';
      this.root.append(w.detailEl);
    }
    this.root.append(el);
    this.wins.push(w);
    this.draw(w);
    return w;
  }

  /** New lines for an open window (after Toss, say). */
  setRows(w: Win, rows: Row[]): void {
    w.opts.rows = rows;
    w.i = Math.max(0, Math.min(rows.length - 1, w.i));
    this.draw(w);
  }

  close(w: Win | null | undefined): void {
    if (!w) return;
    w.el.remove();
    w.detailEl?.remove();
    this.wins = this.wins.filter((x) => x !== w);
    if (this.active === w) { this.active = null; w.resolve?.(-1); }
  }

  closeAll(): void { for (const w of [...this.wins]) this.close(w); }

  /** Let the player choose a line: its index, or -1 for B. */
  pick(w: Win, cancel = true): Promise<number> {
    this.active = w;
    w.el.classList.add('active');
    for (const o of this.wins) if (o !== w) o.el.classList.remove('active');
    this.draw(w);
    return new Promise((res) => {
      w.resolve = (i) => {
        if (i < 0 && !cancel) return;
        w.resolve = undefined;
        if (this.active === w) this.active = null;
        w.el.classList.remove('active');
        this.draw(w);
        res(i);
      };
    });
  }

  /** Open a window, choose, close it: the index (or -1). */
  async choose(opts: WinOpts, cancel = true): Promise<number> {
    const w = this.open(opts);
    const i = await this.pick(w, cancel);
    this.close(w);
    return i;
  }

  /** Wait until `test` is true (checked every frame). */
  until(test: () => boolean): Promise<void> {
    if (test()) return Promise.resolve();
    return new Promise((done) => this.waits.push({ test, done }));
  }

  /** A line in the text box; waits for A. `keep`: leave it showing (a question's yes / no comes next). */
  async say(text: string, keep = false): Promise<void> {
    this.message.setPlace('bottom');
    this.message.setSpeaker(null);
    this.message.showText(text, undefined, keep, undefined, undefined, 'system');
    const el = document.querySelector<HTMLElement>('.msg .msg-text');
    if (el) el.style.cssText = '';
    await this.until(() => !this.message.busy);
    if (!keep) this.message.close();
  }

  /** A question in the text box with its answers (YES / NO…) in the little box beside it: the answer (or `cancel` with B). */
  async ask(text: string, options = ['YES', 'NO'], cancel = options.length - 1): Promise<number> {
    await this.say(text, true);
    this.message.showChoices(options, cancel);
    let got: number | null = null;
    await this.until(() => (got = this.message.takeChoice()) !== null);
    this.message.close();
    return got ?? cancel;
  }

  update(): void {
    for (const w of [...this.waits]) if (w.test()) { this.waits = this.waits.filter((x) => x !== w); w.done(); }
    const w = this.active;
    if (!w || this.message.busy) return;
    const n = w.opts.rows.length;
    if (w.onUpDown) { if (this.input.consume('up')) w.onUpDown(1); if (this.input.consume('down')) w.onUpDown(-1); }
    else {
      // Dividers are passed over.
      const step = (d: number) => { let j = w.i; for (let k = 0; k < n; k++) { j = (j + d + n) % n; if (!w.opts.rows[j].divider) break; } return j; };
      if (n && this.input.consume('up')) this.move(w, step(-1));
      if (n && this.input.consume('down')) this.move(w, step(1));
    }
    if (w.onSide && this.input.consume('left')) w.onSide(-1);
    if (w.onSide && this.input.consume('right')) w.onSide(1);
    if (this.input.consume('ok')) { if (n && !w.opts.rows[w.i].disabled && !w.opts.rows[w.i].divider) { this.sound?.('menuOk'); w.resolve?.(w.i); } }
    else if (this.input.consume('cancel')) { this.sound?.('menuBack'); w.resolve?.(-1); }
  }

  sound?: (name: 'menuMove' | 'menuOk' | 'menuBack') => void;

  private move(w: Win, i: number): void {
    if (i === w.i) return;
    w.i = i;
    this.sound?.('menuMove');
    this.draw(w);
    w.onMove?.(i);
  }

  private draw(w: Win): void {
    const { rows, title } = w.opts, max = w.opts.max ?? rows.length;
    if (w.i < w.top) w.top = w.i;
    if (w.i >= w.top + max) w.top = w.i - max + 1;
    w.top = Math.max(0, Math.min(w.top, Math.max(0, rows.length - max)));
    w.el.replaceChildren();
    if (title) { const t = document.createElement('div'); t.className = 'gba-title'; t.textContent = title; w.el.append(t); }
    if (w.top > 0) { const up = document.createElement('div'); up.className = 'gba-more up'; up.textContent = '▲'; w.el.append(up); }
    rows.slice(w.top, w.top + max).forEach((r, k) => {
      const i = w.top + k;
      const row = document.createElement('div');
      row.className = 'gba-row';
      if (i === w.i) row.classList.add('sel');
      if (r.disabled) row.classList.add('off');
      if (r.divider) row.classList.add('divider');
      if (r.icon) { const im = document.createElement('img'); im.src = r.icon; im.alt = ''; row.append(im); }
      const l = document.createElement('span'); l.className = 'gba-label'; l.textContent = r.label; row.append(l);
      if (r.sub !== undefined || r.bar !== undefined) {
        const box = document.createElement('span'); box.className = 'gba-two';
        box.append(l);
        if (r.sub) { const sb = document.createElement('span'); sb.className = 'gba-sub'; sb.textContent = r.sub; box.append(sb); }
        if (r.bar !== undefined) {
          const bar = document.createElement('span'); bar.className = 'gba-bar';
          const f = Math.max(0, Math.min(1, r.bar)), fill = document.createElement('b');
          fill.style.width = `${f * 100}%`;
          fill.className = f > 0.5 ? 'hi' : f > 0.2 ? 'mid' : 'lo';
          bar.append(fill); box.append(bar);
        }
        row.append(box);
      }
      if (r.right) { const rt = document.createElement('span'); rt.className = 'gba-right'; rt.textContent = r.right; row.append(rt); }
      // The mouse: point to choose, click for A.
      row.addEventListener('pointermove', () => { if (this.active === w && w.i !== i) this.move(w, i); });
      row.addEventListener('click', () => { if (this.active !== w) return; this.move(w, i); if (!r.disabled) { this.sound?.('menuOk'); w.resolve?.(i); } });
      w.el.append(row);
    });
    if (w.top + max < rows.length) { const dn = document.createElement('div'); dn.className = 'gba-more dn'; dn.textContent = '▼'; w.el.append(dn); }
    if (w.detailEl) w.detailEl.textContent = rows[w.i]?.detail ?? '';
  }
}
