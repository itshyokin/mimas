/**
 * Quests on screen: the tracker (the followed quest's objectives, top right under the clock, movable in Settings →
 * HUD) and the Quest Log in the pause menu (In progress / Completed / Failed, with each quest's story, objectives and
 * rewards; pick one to follow it).
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';
import { tabKeys, tabStrip, wireTabs, type TabGroup } from './tabs';
import { need, objectiveLine, type QuestBook } from '../game/quests';
import type { QuestDef } from '../world/types';

/** Names for rewards and objectives' targets. */
export interface QuestNames { item(id: string): string }

export function rewardText(q: QuestDef, names: QuestNames): string {
  const r = q.rewards, out: string[] = [];
  if (!r) return '';
  if (r.gold) out.push(`${r.gold.toLocaleString()} G`);
  if (r.xp) out.push(`${r.xp} EXP`);
  for (const it of r.items ?? []) out.push(`${it.count > 1 ? `${it.count} × ` : ''}${names.item(it.item)}`);
  if (r.skillPoints) out.push(`${r.skillPoints} skill point${r.skillPoints === 1 ? '' : 's'}`);
  return out.join(' · ');
}

const turnIn = (q: QuestDef) => q.turnIn || (q.giver ? `Return to ${q.giver}` : 'Ready to hand in');

/* ------------------------------------------------------------------ tracker */

export class QuestTracker {
  readonly el = document.createElement('div');
  private key = '';

  constructor(parent: HTMLElement) {
    this.el.className = 'hud-quest';
    this.el.setAttribute('aria-label', 'Followed quest');
    this.el.setAttribute('aria-live', 'polite');
    parent.appendChild(this.el);
    this.el.dataset.empty = '1';
  }

  /** Redraw when the followed quest or its objectives changed. */
  update(book: QuestBook): void {
    const id = book.tracked, q = id ? book.def(id) : undefined;
    const st = id ? book.status(id) : 'inactive';
    if (!q || (st !== 'active' && st !== 'ready')) {
      if (this.key !== '') { this.key = ''; this.el.innerHTML = '<div class="hq-name">No quest followed</div>'; this.el.dataset.empty = '1'; }
      return;
    }
    const objs = st === 'ready' ? [] : book.visible(q).filter((o) => !book.objectiveDone(q, o) || need(o) > 1);
    const lines = objs.map((o) => ({ text: objectiveLine(book, q, o), done: book.objectiveDone(q, o), optional: !!o.optional }));
    const key = JSON.stringify([q.id, st, lines]);
    if (key === this.key) return;
    const fresh = this.key !== '' && JSON.parse(this.key)[0] === q.id;
    this.key = key;
    delete this.el.dataset.empty;
    this.el.innerHTML = `<div class="hq-name">${q.kind === 'main' ? '<span class="hq-star" aria-label="Main quest">★</span>' : ''}${esc(q.name)}</div>
      <ul class="hq-list">${st === 'ready' ? `<li class="hq-ready">${esc(turnIn(q))}</li>` : lines.map((l) =>
        `<li class="${l.done ? 'done' : ''}${l.optional ? ' optional' : ''}">${esc(l.text)}${l.optional ? ' <i>(optional)</i>' : ''}</li>`).join('')}</ul>`;
    if (fresh) { this.el.classList.remove('bump'); void this.el.offsetWidth; this.el.classList.add('bump'); }
  }

  setHidden(hidden: boolean): void { this.el.hidden = hidden; }
}

/* ------------------------------------------------------------------ the log */

type Tab = 'open' | 'done' | 'failed';
const TABS: [Tab, string][] = [['open', 'In progress'], ['done', 'Completed'], ['failed', 'Failed']];

export class QuestLogScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private tab: Tab = 'open';
  private sel = 0;
  private list: QuestDef[] = [];
  private book!: QuestBook;
  private names!: QuestNames;
  private title = '';
  private onClose: () => void = () => {};
  private tabs: TabGroup | undefined;

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'inv quest-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Quest log');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.close(); } });
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-q],[data-track]');
      if (!t) return;
      if (t.dataset.tab) { this.tab = t.dataset.tab as Tab; this.sel = 0; uiSound('menuMove'); this.render(); }
      else if (t.dataset.q) { this.sel = Number(t.dataset.q); uiSound('menuMove'); this.render(); }
      else if (t.dataset.track !== undefined) this.toggleTrack();
    });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(title: string, book: QuestBook, names: QuestNames, onClose: () => void, tabs?: TabGroup): void {
    this.title = title; this.book = book; this.names = names; this.onClose = onClose; this.tabs = tabs;
    this.open = true;
    this.tab = 'open';
    this.sel = 0;
    this.render();
    // Start on the followed quest.
    const i = this.list.findIndex((q) => q.id === book.tracked);
    if (i > 0) { this.sel = i; this.render(); }
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

  private quests(tab: Tab): QuestDef[] {
    const b = this.book;
    const want = (id: string) => { const s = b.status(id); return tab === 'open' ? s === 'active' || s === 'ready' : s === tab; };
    return b.all.filter((q) => want(q.id)).sort((a, c) => {
      if (tab === 'open' && a.kind !== c.kind) return a.kind === 'main' ? -1 : 1;
      const ea = b.entry(a.id)!, ec = b.entry(c.id)!;
      return tab === 'open' ? ec.started - ea.started : (ec.ended ?? 0) - (ea.ended ?? 0);
    });
  }

  private toggleTrack(): void {
    const q = this.list[this.sel];
    if (!q || this.tab !== 'open') return;
    this.book.tracked = this.book.tracked === q.id ? null : q.id;
    uiSound('menuOk');
    this.render();
  }

  private render(): void {
    const b = this.book;
    this.list = this.quests(this.tab);
    this.sel = Math.max(0, Math.min(this.sel, this.list.length - 1));
    const counts = Object.fromEntries(TABS.map(([t]) => [t, this.quests(t).length])) as Record<Tab, number>;
    const tabs = TABS.filter(([t]) => t !== 'failed' || counts.failed > 0).map(([t, label]) =>
      `<button type="button" class="ql-tab" role="tab" aria-selected="${t === this.tab}" data-tab="${t}">${label}<span class="ql-count">${counts[t]}</span></button>`).join('');
    const rows = this.list.map((q, i) => {
      const st = b.status(q.id);
      return `<li><button type="button" class="ql-row${i === this.sel ? ' sel' : ''}" data-q="${i}" aria-current="${i === this.sel}">
        ${q.kind === 'main' ? '<span class="ql-star" title="Main quest">★</span>' : '<span class="ql-dot"></span>'}
        <span class="ql-name">${esc(q.name)}</span>${b.tracked === q.id ? '<span class="ql-follow" title="Followed">◆</span>' : ''}${st === 'ready' ? '<span class="ql-ready" title="Ready to hand in">!</span>' : ''}</button></li>`;
    }).join('');
    const empty = { open: 'No quests yet. People around the world may need your help.', done: 'No quests completed yet.', failed: '' }[this.tab];
    const q = this.list[this.sel];
    this.root.innerHTML = `<div class="inv-box quest-box"><div class="menu-title">${esc(this.title)}</div>${tabStrip(this.tabs)}
      <div class="ql-tabs" role="tablist">${tabs}</div>
      <div class="ql-body"><ol class="ql-list">${rows || `<li class="ql-empty">${empty}</li>`}</ol>
      <div class="ql-detail">${q ? this.detail(q) : ''}</div></div>
      <div class="menu-note">↑ ↓ choose · ← → tabs · ${this.tab === 'open' ? 'Enter (A): follow · ' : ''}${this.tabs ? `${esc(this.tabs.keys[0])} / ${esc(this.tabs.keys[1])}: Journal tabs · ` : ''}Esc (B): close</div></div>`;
    wireTabs(this.root, this.tabs);
    this.root.querySelector('.ql-row.sel')?.scrollIntoView({ block: 'nearest' });
  }

  private detail(q: QuestDef): string {
    const b = this.book, st = b.status(q.id);
    const meta = [q.giver && `From ${esc(q.giver)}`, q.location && esc(q.location)].filter(Boolean).join(' · ');
    const objs = (st === 'done' || st === 'failed' ? q.objectives.filter((o) => b.objectiveDone(q, o) || !o.optional) : b.visible(q)).map((o) => {
      const done = st === 'done' || b.objectiveDone(q, o), failed = st === 'failed' && !done;
      return `<li class="${done ? 'done' : failed ? 'failed' : ''}${o.optional ? ' optional' : ''}"><span class="ql-box" aria-hidden="true">${done ? '✓' : failed ? '✕' : ''}</span>
        <span>${esc(objectiveLine(b, q, o))}${o.optional ? ' <i>(optional)</i>' : ''}</span></li>`;
    }).join('');
    const status = st === 'ready' ? `<div class="ql-status ready">✓ ${esc(turnIn(q))}</div>`
      : st === 'done' ? '<div class="ql-status done">Completed</div>' : st === 'failed' ? '<div class="ql-status failed">Failed</div>' : '';
    const rewards = rewardText(q, this.names);
    const follow = this.tab === 'open'
      ? `<button type="button" class="ql-track" data-track>${b.tracked === q.id ? 'Stop following' : 'Follow this quest'}</button>` : '';
    return `<div class="ql-kind">${q.kind === 'main' ? '★ Main quest' : 'Side quest'}</div>
      <h3 class="ql-title">${esc(q.name)}</h3>${meta ? `<div class="ql-meta">${meta}</div>` : ''}
      ${q.description ? `<p class="ql-desc">${esc(q.description).replace(/\n/g, '<br>')}</p>` : ''}
      ${objs ? `<ul class="ql-objs">${objs}</ul>` : ''}${status}
      ${rewards ? `<div class="ql-rewards"><span>Rewards</span> ${esc(rewards)}</div>` : ''}${follow}`;
  }

  update(): void {
    if (!this.open) return;
    const i = this.input;
    if (tabKeys(i, this.tabs)) return;
    if (i.consume('cancel')) { this.close(); return; }
    if (i.consume('ok')) this.toggleTrack();
    const tabs = TABS.filter(([t]) => t !== 'failed' || this.quests('failed').length).map(([t]) => t);
    const dx = (i.consume('right') ? 1 : 0) - (i.consume('left') ? 1 : 0);
    const dy = (i.consume('down') ? 1 : 0) - (i.consume('up') ? 1 : 0);
    if (dx) { this.tab = tabs[(tabs.indexOf(this.tab) + dx + tabs.length) % tabs.length]; this.sel = 0; uiSound('menuMove'); this.render(); }
    else if (dy && this.list.length > 1) { this.sel = (this.sel + dy + this.list.length) % this.list.length; uiSound('menuMove'); this.render(); }
  }
}
