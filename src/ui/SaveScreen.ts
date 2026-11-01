/**
 * Save and Load: the slots as cards, each with a picture of the moment it was saved, where, the level, play time
 * and date. Saves can be deleted (Y / R, or the bin button), always after a confirmation.
 * Keys: ↑ ↓ choose, Space saves / loads, Y or R deletes, Esc goes back.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { formatPlayTime, type SaveData, type SlotId } from '../game/saves';
import { esc } from './InventoryScreen';

export interface SaveSlotView { slot: SlotId; label: string; data: SaveData | null; shot: string | null; /** The party standing, the three fighting first. */ party?: { img: string; name: string; active: boolean }[] }

export interface SaveScreenHost {
  /** The slots this screen shows (saving: the numbered slots; loading: the autosave too). */
  slots(mode: 'save' | 'load'): SaveSlotView[];
  /** Save into / load from a slot. Returns true when the screen should stay open (it saved). */
  act(mode: 'save' | 'load', slot: SlotId): boolean;
  remove(slot: SlotId): void;
}

export class SaveScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private mode: 'save' | 'load' = 'load';
  private sel = 0;
  private confirm: { slot: SlotId; yes: boolean } | null = null;
  private note = '';
  private message = '';
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input, private readonly host: SaveScreenHost) {
    this.root.className = 'inv save-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.back(); } });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  /** `current`: the save this game came from or was last saved to; the screen opens on it. */
  show(mode: 'save' | 'load', onClose: () => void, note = '', current: SlotId | null = null): void {
    this.open = true;
    this.mode = mode;
    this.onClose = onClose;
    this.note = note;
    this.message = '';
    this.confirm = null;
    const list = this.host.slots(mode);
    // Loading: the newest save first. Saving: the first empty slot, else the newest.
    let best = -1;
    list.forEach((s, k) => { if (s.data && (best < 0 || s.data.savedAt > list[best].data!.savedAt)) best = k; });
    const empty = list.findIndex((s) => !s.data);
    const cur = current ? list.findIndex((s) => s.slot === current && s.data) : -1;
    this.sel = Math.max(0, cur >= 0 ? cur : mode === 'save' && empty >= 0 ? empty : best);
    this.root.setAttribute('aria-label', mode === 'save' ? 'Save game' : 'Load game');
    this.root.hidden = false;
    this.render();
  }

  close(): void { this.open = false; this.root.hidden = true; this.onClose(); }

  private back(): void {
    uiSound('menuBack');
    if (this.confirm) { this.confirm = null; this.render(); return; }
    this.close();
  }

  update(): void {
    if (!this.open) return;
    const i = this.input, list = this.host.slots(this.mode), n = list.length;
    if (this.confirm) {
      const c = this.confirm;
      if (i.consume('left') || i.consume('right') || i.consume('up') || i.consume('down')) { c.yes = !c.yes; uiSound('menuMove'); this.render(); return; }
      if (i.consume('cancel')) { this.back(); return; }
      if (i.confirm()) this.answer(c.yes);
      return;
    }
    if (i.consume('cancel')) { this.back(); return; }
    if (i.consume('up')) { this.sel = (this.sel + n - 1) % n; uiSound('menuMove'); this.render(); return; }
    if (i.consume('down')) { this.sel = (this.sel + 1) % n; uiSound('menuMove'); this.render(); return; }
    if (i.consume('switchWeapon')) { this.askDelete(); return; }
    if (i.confirm()) this.pick();
  }

  private pick(k = this.sel): void {
    const s = this.host.slots(this.mode)[k];
    if (!s) return;
    this.sel = k;
    if (this.mode === 'load' && !s.data) { uiSound('menuBack'); return; }
    uiSound('menuOk');
    if (this.host.act(this.mode, s.slot)) { this.message = ''; this.render(); }
    else this.close();
  }

  private askDelete(k = this.sel): void {
    const s = this.host.slots(this.mode)[k];
    if (!s?.data) { uiSound('menuBack'); return; }
    this.sel = k;
    uiSound('menuOk');
    this.confirm = { slot: s.slot, yes: false };
    this.render();
  }

  private answer(yes: boolean): void {
    const c = this.confirm;
    if (!c) return;
    this.confirm = null;
    if (yes) {
      this.host.remove(c.slot);
      uiSound('menuBack');
      this.message = 'Save deleted.';
      // Nothing left to load: back out.
      if (this.mode === 'load' && !this.host.slots('load').some((s) => s.data)) { this.close(); return; }
    } else uiSound('menuOk');
    this.render();
  }

  private render(): void {
    const list = this.host.slots(this.mode), c = this.confirm;
    const card = (s: SaveSlotView, k: number) => {
      const d = s.data;
      const when = d ? new Date(d.savedAt) : null;
      const date = when ? `${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
      const level = d?.progress?.level ?? 1;
      return `<div class="sv-slot${k === this.sel ? ' sel' : ''}${d ? '' : ' empty'}" data-k="${k}" role="option" aria-selected="${k === this.sel}">
        <div class="sv-shot">${s.shot ? `<img src="${s.shot}" alt="">` : `<span>${d ? 'No picture' : ''}</span>`}</div>
        <div class="sv-info">
          <b class="sv-label">${esc(s.label)}</b>
          ${d ? `<span class="sv-map">${esc(d.mapTitle)}</span>
          <span class="sv-meta">Level ${level} · ${formatPlayTime(d.playTime)} played</span>
          <span class="sv-date">${esc(date)}</span>
          ${s.party?.length ? `<div class="sv-party">${s.party.map((p) => `<img class="${p.active ? 'on' : 'bench'}" src="${p.img}" alt="${esc(p.name)}" title="${esc(p.name)}${p.active ? '' : ' (reserve)'}">`).join('')}</div>` : ''}` : `<span class="sv-meta">Empty${this.mode === 'save' ? ': save here' : ''}</span>`}
        </div>
        ${d ? `<button type="button" class="sv-del" data-del="${k}" aria-label="Delete ${esc(s.label)}" title="Delete">✕</button>` : ''}
      </div>`;
    };
    const confirmBox = c ? `<div class="sv-confirm" role="alertdialog">
        <p>Delete ${esc(list.find((s) => s.slot === c.slot)?.label ?? 'this save')}? This can’t be undone.</p>
        <div class="sv-confirm-btns">
          <button type="button" class="menu-item${!c.yes ? ' sel' : ''}" data-yes="0" aria-selected="${!c.yes}"><span class="menu-label">Keep it</span></button>
          <button type="button" class="menu-item danger${c.yes ? ' sel' : ''}" data-yes="1" aria-selected="${c.yes}"><span class="menu-label">Delete</span></button>
        </div></div>` : '';
    this.root.innerHTML = `<div class="inv-box sv-box">
      <div class="inv-head"><span class="menu-title">${this.mode === 'save' ? 'Save game' : 'Load game'}</span></div>
      <div class="sv-list" role="listbox">${list.map(card).join('')}</div>
      ${confirmBox}
      <div class="inv-msg">${esc(this.message || this.note)}</div>
      <div class="menu-note">${c ? '← →: choose · Space: confirm · Esc: keep it' : `↑ ↓ choose · Space: ${this.mode === 'save' ? 'save here' : 'load'} · ${this.input.label('switchWeapon')}: delete · Esc: back`}</div>
    </div>`;
    this.root.querySelectorAll<HTMLElement>('.sv-slot').forEach((el) => el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.sv-del') || this.confirm) return;
      this.pick(Number(el.dataset.k));
    }));
    this.root.querySelectorAll<HTMLElement>('.sv-del').forEach((b) => b.addEventListener('click', () => this.askDelete(Number(b.dataset.del))));
    this.root.querySelectorAll<HTMLElement>('[data-yes]').forEach((b) => b.addEventListener('click', () => this.answer(b.dataset.yes === '1')));
    this.root.querySelector('.sv-slot.sel')?.scrollIntoView({ block: 'nearest' });
  }
}
