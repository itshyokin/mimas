/**
 * Pause → Achievements: every achievement with its icon, name, description and points; locked ones greyed with how
 * far along they are, hidden ones as "???" until unlocked. The total points are at the top.
 * Keys: ↑ ↓ scroll · Esc close · LB / RB other tabs.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';
import { tabKeys, tabStrip, wireTabs, type TabGroup } from './tabs';

export interface AchievementView {
  id: string; name: string; description: string; icon: string; points: number;
  unlocked: boolean; hidden: boolean;
  /** When it was unlocked (ms), or how far along it is. */
  when?: number; have?: number; need?: number;
}

export class AchievementsScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private sel = 0;
  private tabs: TabGroup | undefined;
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input, private readonly all: () => AchievementView[], private readonly note: () => string) {
    this.root.className = 'inv ach-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Achievements');
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  /** Newest unlocks first, then the rest unlocked, then locked ones by how close they are (secret ones last). */
  private list(): AchievementView[] {
    const frac = (a: AchievementView) => (a.need ? Math.min(1, (a.have ?? 0) / a.need) : 0);
    return this.all().map((a, k) => ({ a, k })).sort((p, q) => {
      const A = p.a, B = q.a;
      if (A.unlocked !== B.unlocked) return A.unlocked ? -1 : 1;
      if (A.unlocked) return (B.when ?? 0) - (A.when ?? 0) || p.k - q.k;
      if (A.hidden !== B.hidden) return A.hidden ? 1 : -1;
      return frac(B) - frac(A) || p.k - q.k;
    }).map((x) => x.a);
  }

  show(onClose: () => void, tabs?: TabGroup): void {
    this.open = true; this.onClose = onClose; this.tabs = tabs;
    this.root.hidden = false;
    this.render();
  }

  hide(): void { this.open = false; this.root.hidden = true; }

  update(): void {
    if (!this.open) return;
    const i = this.input, n = this.list().length;
    if (i.consume('cancel')) { this.hide(); uiSound('menuBack'); this.onClose(); return; }
    if (tabKeys(i, this.tabs)) return;
    if (n && i.consume('down')) { this.sel = (this.sel + 1) % n; uiSound('menuMove'); this.render(); }
    if (n && i.consume('up')) { this.sel = (this.sel + n - 1) % n; uiSound('menuMove'); this.render(); }
  }

  private render(): void {
    const list = this.list();
    this.sel = Math.min(this.sel, Math.max(0, list.length - 1));
    const got = list.filter((a) => a.unlocked), pts = got.reduce((s, a) => s + a.points, 0), all = list.reduce((s, a) => s + a.points, 0);
    const rows = list.map((a, k) => {
      const secret = a.hidden && !a.unlocked;
      const bar = !a.unlocked && a.need && a.need > 1 ? `<div class="ach-prog"><i style="width:${Math.min(100, ((a.have ?? 0) / a.need) * 100)}%"></i><span>${Math.min(a.have ?? 0, a.need).toLocaleString()} / ${a.need.toLocaleString()}</span></div>` : '';
      const when = a.unlocked && a.when ? `<small class="ach-when">${new Date(a.when).toLocaleDateString()}</small>` : '';
      return `<div class="ach-row${a.unlocked ? ' got' : ''}${k === this.sel ? ' sel' : ''}" data-k="${k}">
        <span class="ach-icon">${secret ? '<span class="ach-q">?</span>' : `<img src="${a.icon}" alt="">`}</span>
        <span class="ach-body"><b>${secret ? 'Hidden achievement' : esc(a.name)}</b><span>${secret ? 'Keep playing to find out.' : esc(a.description)}</span>${bar}</span>
        <span class="ach-points">${a.points}G${when}</span>
      </div>`;
    }).join('');
    this.root.innerHTML = `<div class="inv-box ach-box">
      <div class="inv-head"><span class="menu-title">${this.tabs ? 'Journal' : 'Achievements'}</span><span class="ach-total">${got.length} / ${list.length} · <b>${pts}</b> / ${all}G</span></div>
      ${tabStrip(this.tabs)}
      ${list.length ? `<div class="ach-prog ach-total-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${all}" aria-valuenow="${pts}" aria-label="Achievement points"><i style="width:${all ? Math.min(100, (pts / all) * 100) : 0}%"></i><span>${pts.toLocaleString()} / ${all.toLocaleString()} pts</span></div>` : ''}
      <div class="ach-list">${rows || '<p class="pc-empty">No achievements in this game yet.</p>'}</div>
      <div class="menu-note">${esc(this.note())}</div>
    </div>`;
    wireTabs(this.root, this.tabs);
    this.root.querySelector('.ach-row.sel')?.scrollIntoView({ block: 'nearest' });
  }
}
