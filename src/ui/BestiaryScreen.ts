/**
 * The Journal's Bestiary: every enemy in the game, in order, with the ones not met yet as "???". Picking one shows
 * its picture, description, where it was seen and how many were defeated; its numbers, its elements (weak to,
 * resists, immune, absorbs) and its drops show once enough of its kind have been defeated (Database → Combat →
 * Bestiary). ↑ ↓ choose, the Journal's tabs switch pages.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';
import { tabKeys, tabStrip, wireTabs, type TabGroup } from './tabs';

/** An element: its name and icon. */
export interface Chip { name: string; icon: string }

export interface BestiaryEntry {
  id: string;
  name: string;
  /** Met in battle at least once. */
  seen: boolean;
  defeated: number;
  picture: string;
  description?: string;
  /** Map names it was met on. */
  places: string[];
  /** Shown once enough were defeated (null: not yet, and how many more are needed). */
  stats: { hp: string; attack: number; defence: number; magicDefence: number; exp: number; gold: string; boss?: boolean } | { need: number };
  elements: { weak: Chip[]; resist: Chip[]; immune: Chip[]; absorb: Chip[]; attack: string } | { need: number };
  drops: { name: string; icon: string; chance: number }[] | { need: number };
  /** Its forms, base first (Database → Enemies → Advanced form): each one's picture (when met) and the level it comes at. */
  forms?: { name: string; picture: string | null; level?: number; current: boolean }[];
}

const locked = (x: unknown): x is { need: number } => !!x && typeof x === 'object' && 'need' in (x as object);

export class BestiaryScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private sel = 0;
  private list: BestiaryEntry[] = [];
  private title = '';
  private tabs: TabGroup | undefined;
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'inv bestiary-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Bestiary');
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(title: string, list: BestiaryEntry[], onClose: () => void, tabs?: TabGroup): void {
    this.title = title; this.list = list; this.onClose = onClose; this.tabs = tabs;
    this.open = true;
    this.sel = Math.max(0, Math.min(this.sel, list.length - 1));
    this.root.hidden = false;
    this.render();
  }

  hide(): void { this.open = false; this.root.hidden = true; }

  private close(): void { this.hide(); uiSound('menuBack'); this.onClose(); }

  update(): void {
    if (!this.open) return;
    const i = this.input, n = this.list.length;
    if (tabKeys(i, this.tabs)) return;
    if (i.consume('cancel')) { this.close(); return; }
    if (n && i.consume('down')) { this.sel = (this.sel + 1) % n; uiSound('menuMove'); this.render(); }
    if (n && i.consume('up')) { this.sel = (this.sel + n - 1) % n; uiSound('menuMove'); this.render(); }
    if (n && i.consume('right')) { this.sel = Math.min(n - 1, this.sel + 8); uiSound('menuMove'); this.render(); }
    if (n && i.consume('left')) { this.sel = Math.max(0, this.sel - 8); uiSound('menuMove'); this.render(); }
  }

  private render(): void {
    const list = this.list, e = list[this.sel];
    const met = list.filter((x) => x.seen).length, beaten = list.filter((x) => x.defeated > 0).length;
    const rows = list.map((x, k) => `<button type="button" class="bs-row${k === this.sel ? ' sel' : ''}${x.seen ? '' : ' unseen'}" data-k="${k}">
      <span class="bs-no">${String(k + 1).padStart(3, '0')}</span>${x.seen ? `<img src="${x.picture}" alt="">` : '<span class="bs-q">?</span>'}
      <span class="bs-name">${x.seen ? esc(x.name) : '???'}</span>${x.defeated ? `<small>×${x.defeated}</small>` : ''}</button>`).join('');
    const more = (need: number) => `<p class="bs-locked">Defeat ${need} more to learn this.</p>`;
    const chips = (label: string, list: Chip[], cls: string) => list.length
      ? `<div class="bs-el ${cls}"><b>${label}</b>${list.map((c) => `<span class="bs-chip"><img src="${c.icon}" alt="">${esc(c.name)}</span>`).join('')}</div>` : '';
    let detail = '<p class="bs-locked">No enemies in this game yet.</p>';
    if (e && !e.seen) detail = `<div class="bs-head"><div class="bs-pic unseen"><span>?</span></div><div><h3>???</h3><p class="bs-desc">Not met yet.</p></div></div>`;
    else if (e) {
      const st = e.stats, el = e.elements, dr = e.drops;
      detail = `<div class="bs-head"><div class="bs-pic"><img src="${e.picture}" alt=""></div><div>
          <h3>${esc(e.name)}${!locked(st) && st.boss ? ' <span class="bs-boss">Boss</span>' : ''}</h3>
          <p class="bs-count">Defeated: <b>${e.defeated.toLocaleString()}</b></p>
          ${e.places.length ? `<p class="bs-places">Seen in ${e.places.map(esc).join(', ')}</p>` : ''}</div></div>
        ${e.description ? `<p class="bs-desc">${esc(e.description)}</p>` : ''}
        ${e.forms && e.forms.length > 1 ? `<section><h4>Forms</h4><div class="bs-forms">${e.forms.map((f, k) => `${k ? `<span class="bs-arrow">Lv ${f.level ?? '?'}<i>→</i></span>` : ''}<span class="bs-form${f.current ? ' cur' : ''}" title="${esc(f.picture ? f.name : '???')}">${f.picture ? `<img src="${f.picture}" alt="">` : '<b>?</b>'}<small>${esc(f.picture ? f.name : '???')}</small></span>`).join('')}</div></section>` : ''}
        <section><h4>Numbers</h4>${locked(st) ? more(st.need) : `<dl class="bs-stats">
          <div><dt>HP</dt><dd>${st.hp}</dd></div><div><dt>Attack</dt><dd>${st.attack}</dd></div><div><dt>Defence</dt><dd>${st.defence}</dd></div>
          <div><dt>Magic defence</dt><dd>${st.magicDefence}</dd></div><div><dt>EXP</dt><dd>${st.exp}</dd></div><div><dt>Gold</dt><dd>${st.gold}</dd></div></dl>`}</section>
        <section><h4>Elements</h4>${locked(el) ? more(el.need) : `${chips('Weak to', el.weak, 'weak')}${chips('Resists', el.resist, 'resist')}${chips('Immune to', el.immune, 'immune')}${chips('Absorbs', el.absorb, 'absorb')}
          ${!el.weak.length && !el.resist.length && !el.immune.length && !el.absorb.length ? '<p class="bs-none">No weaknesses or resistances.</p>' : ''}<p class="bs-atk">Attacks with: ${esc(el.attack)}</p>`}</section>
        <section><h4>Drops</h4>${locked(dr) ? more(dr.need) : dr.length ? `<ul class="bs-drops">${dr.map((d) => `<li><img src="${d.icon}" alt=""><span>${esc(d.name)}</span><small>${Math.round(d.chance * 100)}%</small></li>`).join('')}</ul>` : '<p class="bs-none">Nothing.</p>'}</section>`;
    }
    this.root.innerHTML = `<div class="inv-box bs-box"><div class="menu-title">${esc(this.title)}</div>${tabStrip(this.tabs)}
      <div class="bs-body"><div class="bs-list" role="listbox" aria-label="Enemies">${rows}</div><div class="bs-detail">${detail}</div></div>
      <div class="menu-note">Met ${met} / ${list.length} · defeated ${beaten} · ↑ ↓ choose${this.tabs ? ` · ${esc(this.tabs.keys[0])} / ${esc(this.tabs.keys[1])}: Journal pages` : ''} · Esc or B to close</div></div>`;
    wireTabs(this.root, this.tabs);
    this.root.querySelectorAll<HTMLElement>('.bs-row').forEach((b) => b.addEventListener('click', () => { this.sel = Number(b.dataset.k); uiSound('menuMove'); this.render(); }));
    this.root.querySelector('.bs-row.sel')?.scrollIntoView({ block: 'nearest' });
  }
}
