/**
 * Settings → Controls: every action with two keyboard keys and a controller button. Pick a slot and
 * press the new key or button (Esc cancels, Backspace clears it). A keyboard key moves to the action it's
 * given; a controller button can be shared on purpose (A both talks and jumps by default).
 */
import { BINDABLE, type Action, type Bindings, DEFAULT_BINDINGS, type Input, keyName, padName } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';

type Col = 0 | 1 | 2;

export class ControlsScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private row = 0;
  private col: Col = 0;
  private waiting = false;
  private b: Bindings = DEFAULT_BINDINGS;
  private onClose: () => void = () => {};
  private save: (b: Bindings) => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'inv controls-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Controls');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root && !this.waiting) { e.preventDefault(); this.close(); } });
    // Clicked buttons keep focus, which would stop the keyboard reaching the game: let go of it.
    this.root.addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur?.());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(current: Bindings, save: (b: Bindings) => void, onClose: () => void): void {
    this.b = { keys: { ...DEFAULT_BINDINGS.keys, ...current.keys }, pad: { ...DEFAULT_BINDINGS.pad, ...current.pad } };
    for (const k of Object.keys(this.b.keys) as Action[]) this.b.keys[k] = [...(this.b.keys[k] ?? [])];
    for (const k of Object.keys(this.b.pad) as Action[]) this.b.pad[k] = [...(this.b.pad[k] ?? [])];
    this.save = save; this.onClose = onClose;
    this.open = true; this.row = 0; this.col = 0; this.waiting = false;
    this.root.hidden = false;
    this.render();
  }

  private close(): void {
    this.open = false;
    this.root.hidden = true;
    uiSound('menuBack');
    this.onClose();
  }

  /** Rows: the actions, then Reset and Done. */
  private get rows(): number { return BINDABLE.length + 2; }

  update(): void {
    if (!this.open || this.waiting) return;
    const i = this.input;
    if (i.consume('cancel')) { this.close(); return; }
    if (i.consume('up')) { this.row = (this.row + this.rows - 1) % this.rows; uiSound('menuMove'); this.render(); }
    if (i.consume('down')) { this.row = (this.row + 1) % this.rows; uiSound('menuMove'); this.render(); }
    if (i.consume('left')) { this.col = Math.max(0, this.col - 1) as Col; uiSound('menuMove'); this.render(); }
    if (i.consume('right')) { this.col = Math.min(2, this.col + 1) as Col; uiSound('menuMove'); this.render(); }
    if (i.confirm()) this.activate();
  }

  private activate(): void {
    if (this.row === BINDABLE.length) {
      this.b = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)) as Bindings;
      this.commit();
      uiSound('menuOk');
      return;
    }
    if (this.row === BINDABLE.length + 1) { this.close(); return; }
    this.listen(BINDABLE[this.row][0], this.col);
  }

  /** Wait for the next key or button for one slot. */
  private listen(action: Action, col: Col): void {
    this.waiting = true;
    uiSound('menuOk');
    this.render();
    this.input.captureNext((k) => {
      // A frame later, so the key that was pressed doesn't also act in the menu.
      setTimeout(() => {
        this.waiting = false;
        if (k.cancel) { this.render(); return; }
        if (col < 2) {
          if (k.key === 'Backspace' || k.key === 'Delete') this.setKey(action, col, null);
          else if (k.key) this.setKey(action, col, k.key);
        } else if (k.button !== undefined) {
          this.b.pad[action] = [k.button];
        } else if (k.key === 'Backspace' || k.key === 'Delete') this.b.pad[action] = [];
        this.commit();
      }, 0);
    });
  }

  private setKey(action: Action, slot: number, code: string | null): void {
    const list = [...(this.b.keys[action] ?? [])];
    if (code) {
      // A key does one thing: take it off any other action first.
      for (const a of Object.keys(this.b.keys) as Action[]) if (a !== action) this.b.keys[a] = (this.b.keys[a] ?? []).filter((c) => c !== code);
      const other = list[1 - slot];
      if (other === code) list.splice(1 - slot, 1);
      list[Math.min(slot, list.length)] = code;
    } else list.splice(slot, 1);
    this.b.keys[action] = list.filter(Boolean);
  }

  private commit(): void {
    this.save(this.b);
    this.render();
  }

  private render(): void {
    const used = new Map<number, string[]>();
    for (const [a, name] of BINDABLE) for (const btn of this.b.pad[a] ?? []) used.set(btn, [...(used.get(btn) ?? []), name]);
    const cell = (r: number, c: Col, text: string, extra = '') =>
      `<button type="button" class="ctl-cell${r === this.row && c === this.col ? ' sel' : ''}${this.waiting && r === this.row && c === this.col ? ' wait' : ''}" data-r="${r}" data-c="${c}">${
        this.waiting && r === this.row && c === this.col ? (c === 2 ? 'Press a button…' : 'Press a key…') : esc(text) || '<span class="ctl-none">—</span>'}${extra}</button>`;
    const rows = BINDABLE.map(([a, name], r) => {
      const keys = this.b.keys[a] ?? [], btn = this.b.pad[a]?.[0];
      const shared = btn !== undefined && (used.get(btn)?.length ?? 0) > 1 ? `<span class="ctl-shared" title="Also: ${esc(used.get(btn)!.filter((n) => n !== name).join(', '))}">shared</span>` : '';
      return `<div class="ctl-row${r === this.row ? ' on' : ''}"><span class="ctl-name">${esc(name)}</span>${cell(r, 0, keys[0] ? keyName(keys[0]) : '')}${cell(r, 1, keys[1] ? keyName(keys[1]) : '')}${['up', 'down', 'left', 'right'].includes(a) && btn === undefined ? '<span class="ctl-cell ctl-fixed" title="The left stick always moves">Left stick</span>' : cell(r, 2, btn !== undefined ? padName(btn) : '', shared)}</div>`;
    }).join('');
    const foot = (r: number, label: string) => `<button type="button" class="menu-item ctl-foot" data-foot="${r}" aria-selected="${this.row === r}"><span class="menu-label">${label}</span></button>`;
    this.root.innerHTML = `<div class="inv-box ctl-box">
      <div class="inv-head"><span class="menu-title">Controls</span><span class="menu-note">${this.input.lastDevice === 'pad' ? 'Controller connected' : 'Keyboard'}</span></div>
      <div class="ctl-row ctl-headrow"><span></span><span>Key</span><span>Other key</span><span>Controller</span></div>
      <div class="ctl-list">${rows}</div>
      <div class="ctl-foots">${foot(BINDABLE.length, 'Reset to defaults')}${foot(BINDABLE.length + 1, 'Done')}</div>
      <div class="menu-note">${this.waiting ? 'Esc cancels · Backspace clears' : 'Choose a slot and press Enter (A), then the new key or button. Menus always also work with the arrows, Enter and Esc (D-pad, A and B).'}</div></div>`;
    this.root.querySelectorAll<HTMLElement>('.ctl-cell').forEach((el) => el.addEventListener('click', () => {
      if (this.waiting) return;
      this.row = Number(el.dataset.r); this.col = Number(el.dataset.c) as Col;
      this.activate();
    }));
    this.root.querySelectorAll<HTMLElement>('[data-foot]').forEach((el) => el.addEventListener('click', () => { this.row = Number(el.dataset.foot); this.activate(); }));
    this.root.querySelector('.ctl-cell.sel, .ctl-foot[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
}
