/**
 * The adventure log: a short feed of what just happened (bottom left, movable in Settings → HUD), and the whole
 * history of this session in the pause menu (Adventure Log). Lines are coloured by kind: your hits, hits taken,
 * defeats, loot and EXP, level-ups and everything else.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';
import { tabKeys, tabStrip, wireTabs, type TabGroup } from './tabs';

export type LogKind = 'hit' | 'hurt' | 'defeat' | 'loot' | 'xp' | 'level' | 'quest' | 'info' | 'chat';
/** What the on-screen feed shows (the history always keeps everything). */
export type LogFeed = 'all' | 'noCombat' | 'off';
const COMBAT: LogKind[] = ['hit', 'hurt'];
const HISTORY = 250;

export interface LogLine { text: string; kind: LogKind; time: string }

export class AdventureLog {
  readonly el = document.createElement('div');
  readonly history: LogLine[] = [];
  feed: LogFeed = 'all';
  /** The in-game clock for each line ("8:15 AM"). */
  clock: () => string = () => '';

  constructor(parent: HTMLElement) {
    this.el.className = 'loot-feed adv-log';
    this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-label', 'Adventure log');
    parent.appendChild(this.el);
  }

  add(text: string, kind: LogKind = 'info'): void {
    // The same line again right away (three hits in a combo for the same damage): counted, not repeated.
    const last = this.history[this.history.length - 1];
    const lastEl = this.el.lastElementChild as HTMLElement | null;
    if (last && last.text === text && last.kind === kind && lastEl && !lastEl.classList.contains('out') && lastEl.dataset.text === text) {
      const n = Number(lastEl.dataset.n ?? 1) + 1;
      lastEl.dataset.n = String(n);
      lastEl.textContent = `${text} ×${n}`;
      this.fadeLater(lastEl);
      this.history.push({ text, kind, time: this.clock() });
      this.trim();
      return;
    }
    this.history.push({ text, kind, time: this.clock() });
    this.trim();
    if (this.feed === 'off' || (this.feed === 'noCombat' && COMBAT.includes(kind))) return;
    const line = document.createElement('div');
    line.className = `loot log-${kind}`;
    line.dataset.text = text;
    line.textContent = text;
    this.el.appendChild(line);
    while (this.el.children.length > 6) this.el.firstElementChild!.remove();
    // Lines wrap inside the log's box: the oldest go when they no longer fit.
    while (this.el.children.length > 1 && this.el.scrollHeight > this.el.clientHeight + 1) this.el.firstElementChild!.remove();
    this.fadeLater(line);
  }

  private trim(): void { if (this.history.length > HISTORY) this.history.splice(0, this.history.length - HISTORY); }

  private fadeLater(line: HTMLElement): void {
    clearTimeout(Number(line.dataset.t1)); clearTimeout(Number(line.dataset.t2));
    line.dataset.t1 = String(window.setTimeout(() => line.classList.add('out'), 5200));
    line.dataset.t2 = String(window.setTimeout(() => line.remove(), 5800));
  }

  /** Clear the screen feed (a new game or a loaded save keeps the history; the feed starts fresh). */
  clearFeed(): void { this.el.replaceChildren(); }

  setHidden(hidden: boolean): void { this.el.hidden = hidden; }
}

/** Pause menu → Adventure Log: everything this session, newest first. */
export class AdventureLogScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private scroller: HTMLElement | null = null;
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'inv log-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Adventure log');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.close(); } });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  private tabs: TabGroup | undefined;

  show(title: string, lines: LogLine[], onClose: () => void, tabs?: TabGroup): void {
    this.onClose = onClose;
    this.tabs = tabs;
    this.open = true;
    const rows = [...lines].reverse().map((l) => `<li class="log-${l.kind}">${l.time ? `<span class="log-time">${esc(l.time)}</span>` : ''}<span>${esc(l.text)}</span></li>`).join('');
    this.root.innerHTML = `<div class="inv-box log-box"><div class="menu-title">${esc(title)}</div>${tabStrip(tabs)}
      <ol class="log-list">${rows || '<li class="log-empty">Nothing yet. Fights, loot and discoveries are written here.</li>'}</ol>
      <div class="menu-note">↑ ↓ scroll${tabs ? ` · ${esc(tabs.keys[0])} / ${esc(tabs.keys[1])}: Journal tabs` : ''} · Esc or B to close</div></div>`;
    wireTabs(this.root, tabs);
    this.scroller = this.root.querySelector('.log-list');
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
