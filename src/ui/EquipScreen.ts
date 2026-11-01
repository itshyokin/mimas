/**
 * Equipment: the party across the top (← → another hero), the hero's statuses down the left (weather state, ailment,
 * good state; moving over one explains it in the box below), the selected hero's gear in the middle and their numbers
 * on the right. To equip, pick a slot, then the piece from the bag that fits it; moving over a choice shows every stat
 * it would change for that hero (green up, red down).
 * Keys: ↑ ↓ choose · Space changes the slot (or takes it off) · Y / R: between the gear and the statuses ·
 * ← → another hero · Esc goes back (LB / RB move between the Inventory's tabs).
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { ATTRS, ATTR_INFO, type HeroTotals } from '../game/attributes';
import { esc } from './InventoryScreen';
import { tabKeys, tabStrip, wireTabs, type TabGroup } from './tabs';

/** element1 / element2: the Element slots (Primary, Secondary) for element stones. */
export type EquipSlotId = 'weapon' | 'shield' | 'ranged' | 'magic' | 'armor' | 'accessory' | 'ammo' | 'element1' | 'element2';

export interface EquipChoice {
  id: string; name: string; icon: string; color?: string | null; detail?: string; count?: number;
  /** The shard set in it (its icon and name), shown after its name. */
  shard?: { icon: string; name: string } | null;
}
/** A piece in the bag's list: the slot it goes in, and which heroes (by number) can use it. */
export interface GearEntry extends EquipChoice { slot: EquipSlotId; users: boolean[] }
export interface EquipView extends HeroTotals { melee: number; bow: number; spell: number }

export interface EquipHost {
  heroes(): { id: string; name: string; level: number; portrait: string }[];
  /** `none`: what an empty slot says (the Element slots explain themselves). */
  slots(hero: number): { slot: EquipSlotId; label: string; item: EquipChoice | null; none?: string }[];
  /** The hero's elements from their stones, in a line ("Fire +40% · Water +25%"), shown under their numbers. */
  elements?(hero: number): string;
  /** Every piece of equipment in the bag (weapons, bows, shields, armor, accessories, arrows). */
  gear(all?: boolean): GearEntry[];
  /** What in the bag fits a slot (for this hero). */
  choices(hero: number, slot: EquipSlotId): EquipChoice[];
  /** The hero's numbers now, or with `id` in `slot` (null: taken off). */
  view(hero: number, change?: { slot: EquipSlotId; id: string | null }): EquipView;
  /** The hero's Addition (what Attack performs; null: they have none, a plain attack): the ones learned, the one equipped. */
  style?(hero: number): { value: string; options: [string, string][]; note?: string } | null;
  setStyle?(hero: number, value: string): void;
  /** The hero's statuses for the left column (Update 104): their weather state, ailment and good state. */
  statuses?(hero: number): EquipStatus[];
  /** Put it on (null takes off). Returns a message, or null. */
  equip(hero: number, slot: EquipSlotId, id: string | null): string | null;
}

/** One row of the statuses column: what kind, what they have (null: none), its colour, and what it does. */
export interface EquipStatus { label: string; name: string | null; color?: string; text: string }

type Mode = { kind: 'list' } | { kind: 'slots' } | { kind: 'pick'; slot: EquipSlotId; index: number; list: (EquipChoice | null)[] };

export class EquipScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private hero = 0;
  private slot = 0;
  private item = 0;
  private mode: Mode = { kind: 'list' };
  private message = '';
  private onClose: () => void = () => {};
  private tabs: TabGroup | undefined;

  constructor(parent: HTMLElement, private readonly input: Input, private readonly host: EquipHost) {
    this.root.className = 'inv equip-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Equipment');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.close(); } });
    this.root.addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur?.());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  /** Locked to one hero (opened from the Party menu for them): only they are shown. */
  private locked = false;

  /** Open on a piece from the bag (highlighted in the list), or on a slot; `hero` locks it to that hero. */
  show(onClose: () => void, at?: { slot: EquipSlotId; item?: string }, tabs?: TabGroup, hero?: number): void {
    this.locked = hero !== undefined;
    if (hero !== undefined) this.hero = hero;
    this.open = true;
    this.onClose = onClose;
    this.tabs = tabs;
    this.message = '';
    // Opened on a piece (the bag's Equip): its slot, with the piece picked out in the choices.
    this.mode = { kind: 'slots' };
    if (at) {
      const k = this.host.slots(this.hero).findIndex((s) => s.slot === at.slot);
      if (k >= 0) { this.slot = k; this.pick(at.item); }
    }
    this.item = 0;
    this.slot = Math.min(this.slot, this.host.slots(this.hero).length - 1);
    this.root.hidden = false;
    this.render();
  }

  private close(): void { this.open = false; this.root.hidden = true; uiSound('menuBack'); this.onClose(); }
  /** Put away without closing the Inventory (another of its tabs is taking over). */
  hide(): void { this.open = false; this.root.hidden = true; }

  private pick(item?: string): void {
    const s = this.host.slots(this.hero)[this.slot];
    if (!s) return;
    const list: (EquipChoice | null)[] = [...(s.item ? [null] : []), ...this.host.choices(this.hero, s.slot)];
    const k = item ? list.findIndex((c) => c?.id === item) : -1;
    this.mode = { kind: 'pick', slot: s.slot, index: Math.max(0, k), list };
  }

  update(): void {
    if (!this.open) return;
    const i = this.input, m = this.mode;
    if (tabKeys(i, this.tabs)) return;
    // LT / RT: the previous / next party member.
    { const d = i.consume('subPrev') ? -1 : i.consume('subNext') ? 1 : 0; if (d) { if (m.kind === 'pick') this.mode = { kind: 'slots' }; this.switchHero(d, true); return; } }
    // Without tabs (opened on its own): LB / RB move between the bag's list and the hero's gear (to take things off).
    if (!this.tabs && (i.consume('tabPrev') || i.consume('tabNext'))) {
      if (m.kind === 'pick') { this.mode = { kind: 'slots' }; uiSound('menuBack'); this.render(); return; }
      this.focus(m.kind === 'list' ? 'slots' : 'list'); return;
    }
    if (m.kind === 'pick') {
      const n = m.list.length;
      if (i.consume('cancel')) { this.mode = { kind: 'slots' }; uiSound('menuBack'); this.render(); return; }
      if (n && i.consume('up')) { m.index = (m.index + n - 1) % n; uiSound('menuMove'); this.render(); return; }
      if (n && i.consume('down')) { m.index = (m.index + 1) % n; uiSound('menuMove'); this.render(); return; }
      if (i.confirm() && n) this.choose(m.list[m.index]);
      return;
    }
    if (i.consume('cancel')) { this.close(); return; }
    const onAdd = m.kind === 'slots' && !!this.host.style?.(this.hero) && this.slot === this.host.slots(this.hero).length;
    if (i.consume('left')) { if (onAdd) this.cycleStyle(-1); else this.switchHero(-1); return; }
    if (i.consume('right')) { if (onAdd) this.cycleStyle(1); else this.switchHero(1); return; }
    // Y / R: between the bag's list and the hero's gear.
    if (i.consume('switchWeapon')) { this.focus(m.kind === 'list' ? 'slots' : 'list'); return; }
    if (m.kind === 'list') {
      // The statuses: ↑ ↓ read each one; Space goes back to the gear.
      const n = this.statuses().length;
      if (n && i.consume('up')) { this.item = (this.item + n - 1) % n; uiSound('menuMove'); this.render(); return; }
      if (n && i.consume('down')) { this.item = (this.item + 1) % n; uiSound('menuMove'); this.render(); return; }
      if (i.confirm()) this.focus('slots');
      return;
    }
    const st = this.host.style?.(this.hero), n = this.host.slots(this.hero).length + (st ? 1 : 0);
    if (i.consume('up')) { this.slot = (this.slot + n - 1) % n; uiSound('menuMove'); this.render(); return; }
    if (i.consume('down')) { this.slot = (this.slot + 1) % n; uiSound('menuMove'); this.render(); return; }
    if (i.confirm()) {
      // The last row: the Addition, stepped through with Space (or ← → on it).
      if (st && this.slot === n - 1) { this.cycleStyle(1); return; }
      uiSound('menuOk'); this.pick(); this.render();
    }
  }

  private cycleStyle(d: number): void {
    const st = this.host.style?.(this.hero);
    if (!st) return;
    const k = st.options.findIndex(([v]) => v === st.value);
    this.host.setStyle?.(this.hero, st.options[(k + d + st.options.length) % st.options.length][0]);
    uiSound('menuMove');
    this.render();
  }

  private statuses(): EquipStatus[] { return this.host.statuses?.(this.hero) ?? []; }

  private focus(to: 'list' | 'slots'): void {
    if (to === 'list' && !this.statuses().length) { uiSound('menuBack'); return; }
    this.mode = { kind: to };
    uiSound('menuMove');
    this.render();
  }

  private switchHero(d: number, trigger = false): void {
    const n = this.host.heroes().length;
    // Opened for one hero (from the Party page): only LT / RT move on to the next.
    if (n < 2 || (this.locked && !trigger)) { uiSound('menuBack'); return; }
    this.hero = (this.hero + d + n) % n;
    if (this.mode.kind === 'pick') this.mode = { kind: 'slots' };
    this.slot = Math.min(this.slot, this.host.slots(this.hero).length - 1);
    this.message = '';
    uiSound('menuMove');
    this.render();
  }

  private choose(c: EquipChoice | null): void {
    const m = this.mode;
    if (m.kind !== 'pick') return;
    uiSound('menuOk');
    this.message = this.host.equip(this.hero, m.slot, c ? c.id : null) ?? '';
    this.mode = { kind: 'slots' };
    this.render();
  }

  private render(): void {
    const h = this.host, heroes = h.heroes(), slots = h.slots(this.hero), m = this.mode, gear = h.gear();
    if (this.hero >= heroes.length) this.hero = 0;
    const now = h.view(this.hero);
    const sel = m.kind === 'pick' ? m.list[m.index] : undefined;
    const listed = m.kind === 'pick' && sel ? gear.find((g) => g.id === sel.id) : undefined;
    let next: EquipView | null = null;
    if (m.kind === 'pick') next = h.view(this.hero, { slot: m.slot, id: sel ? sel.id : null });
    const party = heroes.map((x, k) => (this.locked && k !== this.hero ? '' : `<button type="button" class="eq-hero${k === this.hero ? ' sel' : ''}${listed && !listed.users[k] ? ' cant' : ''}" data-hero="${k}"${listed && !listed.users[k] ? ` title="Can’t use ${esc(listed.name)}"` : ''}>
      <img src="${x.portrait}" alt=""><span><b>${esc(x.name)}</b><small>Level ${x.level}</small></span></button>`)).join('');
    const icon = (c: EquipChoice | null | undefined) => (c ? `<img src="${c.icon}" alt="">` : '<span class="eq-empty"></span>');
    const shard = (c: EquipChoice | null | undefined) => (c?.shard ? `<img class="eq-shard" src="${c.shard.icon}" alt="${esc(c.shard.name)}" title="Set with ${esc(c.shard.name)}">` : '<span></span>');
    const name = (c: EquipChoice | null | undefined, none = '(nothing)') => (c ? `<span class="eq-name"${c.color ? ` style="color:${c.color}"` : ''}>${esc(c.name)}</span>` : `<span class="eq-name none">${esc(none)}</span>`);
    const slotRows = slots.map((s, k) => `<button type="button" class="eq-slot${(m.kind === 'slots' || m.kind === 'pick') && k === this.slot ? ' sel' : ''}${m.kind === 'pick' && k === this.slot ? ' open' : ''}" data-slot="${k}">
      <span class="eq-label">${esc(s.label)}</span>${icon(s.item)}${name(s.item, s.none)}${shard(s.item)}</button>`).join('');
    const style = h.style?.(this.hero);
    const styleRow = style ? `<button type="button" class="eq-slot eq-style${m.kind === 'slots' && this.slot === slots.length ? ' sel' : ''}" data-style="1">
      <span class="eq-label">Addition</span><span class="eq-empty off" aria-hidden="true"></span><span class="eq-name">◀ ${esc(style.options.find(([v]) => v === style.value)?.[1] ?? style.value)} ▶${style.note ? ` <small>${esc(style.note)}</small>` : ''}</span><span></span></button>` : '';
    const picker = m.kind === 'pick' ? `<div class="eq-pick" role="listbox">${m.list.length ? m.list.map((c, k) => `<button type="button" class="eq-choice${k === m.index ? ' sel' : ''}" data-choice="${k}" role="option" aria-selected="${k === m.index}">
        ${c ? icon(c) : '<span class="eq-empty off"></span>'}${c ? name(c) : '<span class="eq-name none">Take it off</span>'}${shard(c)}${c?.count && c.count > 1 ? `<span class="eq-count">× ${c.count}</span>` : '<span></span>'}
        ${c?.detail ? `<small>${esc(c.detail)}</small>` : ''}</button>`).join('') : '<p class="eq-none">Nothing in the bag fits here.</p>'}</div>` : '';
    const sts = this.statuses();
    this.item = Math.max(0, Math.min(this.item, sts.length - 1));
    const list = sts.map((x, k) => `<button type="button" class="eq-status${m.kind === 'list' && k === this.item ? ' sel' : ''}" data-item="${k}">
        <span class="eq-label">${esc(x.label)}</span><span class="eq-st-name${x.name ? '' : ' none'}"${x.name && x.color ? ` style="--st:${x.color}"` : ''}>${esc(x.name ?? 'None')}</span></button>`).join('');
    const shownStatus = sts[m.kind === 'list' ? this.item : -1];
    const desc = shownStatus ? shownStatus.text : sel?.detail ?? (m.kind === 'pick' ? (m.list.length ? 'Take it off: the slot is left empty.' : 'Nothing in the bag fits this slot.') : 'Pick a slot to change it. Y / R: read the statuses.');
    const row = (label: string, a: number, b: number | undefined, unit = '') => {
      const d = b === undefined ? 0 : Math.round((b - a) * 10) / 10;
      return `<div class="eq-stat"><span>${label}</span><b>${Math.round(a)}${unit}</b>${b !== undefined && d !== 0 ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.round(b)}${unit}</em>` : '<em></em>'}</div>`;
    };
    const stats = [
      ...ATTRS.map((k) => row(ATTR_INFO[k].name, now.attrs[k], next?.attrs[k])),
      '<hr>',
      row('Melee damage', now.melee, next?.melee),
      row('Bow damage', now.bow, next?.bow),
      row('Spell damage', now.spell, next?.spell),
      row('Critical hits', now.crit, next?.crit, '%'),
      row('Defence', now.armour, next?.armour),
      row('Magic defence', now.magicArmour, next?.magicArmour),
      ...(h.elements ? [`<div class="eq-stat eq-elements"><span>Elements</span><b>${esc(h.elements(this.hero))}</b><em></em></div>`] : []),
    ].join('');
    const many = heroes.length > 1, who = `${this.locked ? '' : '← → · '}${esc(this.input.label('subPrev'))} / ${esc(this.input.label('subNext'))}`, sw = esc(this.input.label('switchWeapon'));
    const note = m.kind === 'pick' ? '↑ ↓ compare · Space: equip · Esc: back'
      : m.kind === 'list' ? `↑ ↓ read each status${many ? ` · ${who}: another hero` : ''} · ${sw} or Space: ${esc(heroes[this.hero]?.name ?? '')}’s gear${this.tabs ? ` · ${esc(this.tabs.keys[0])} / ${esc(this.tabs.keys[1])}: tabs` : ''} · Esc: close`
        : `↑ ↓ choose a slot · Space: change it (or take it off; Addition: the next one)${many ? ` · ${who}: another hero` : ''} · ${sw}: statuses${this.tabs ? ` · ${esc(this.tabs.keys[0])} / ${esc(this.tabs.keys[1])}: tabs` : ''} · Esc: close`;
    this.root.innerHTML = `<div class="inv-box eq-box">
      <div class="inv-head"><span class="menu-title">Equipment</span><span class="sk-points">${many ? `${who}: another hero` : ''}</span></div>
      ${tabStrip(this.tabs)}
      <div class="eq-body">
        <div class="eq-left"><div class="eq-party">${party}</div>
        <div class="eq-list eq-statuses${m.kind === 'list' ? ' focus' : ''}"><div class="eq-col-title">Status</div>${list}
        <div class="eq-desc" aria-live="polite">${esc(desc)}</div></div></div>
        <div class="eq-mid${m.kind !== 'list' ? ' focus' : ''}"><div class="eq-col-title">${esc(heroes[this.hero]?.name ?? '')}’s gear</div><div class="eq-slots">${slotRows}${styleRow}</div>${picker}</div>
        <div class="eq-stats">${stats}</div>
      </div>
      <div class="inv-msg">${esc(this.message)}</div>
      <div class="menu-note">${note}</div>
    </div>`;
    this.root.querySelector('.eq-choice.sel')?.scrollIntoView({ block: 'nearest' });
    this.root.querySelectorAll<HTMLElement>('[data-slot]').forEach((b) => b.addEventListener('click', () => {
      const k = Number(b.dataset.slot);
      if (this.mode.kind === 'pick' && k === this.slot) { this.mode = { kind: 'slots' }; this.render(); return; }
      this.slot = k; uiSound('menuOk'); this.pick(); this.render();
    }));
    this.root.querySelector('[data-style]')?.addEventListener('click', () => { this.mode = { kind: 'slots' }; this.slot = slots.length; this.cycleStyle(1); });
    this.root.querySelectorAll<HTMLElement>('[data-item]').forEach((b) => b.addEventListener('click', () => {
      this.item = Number(b.dataset.item); this.mode = { kind: 'list' }; uiSound('menuMove'); this.render();
    }));
    this.root.querySelectorAll<HTMLElement>('[data-choice]').forEach((b) => {
      b.addEventListener('pointerenter', () => { const mm = this.mode; if (mm.kind === 'pick' && mm.index !== Number(b.dataset.choice)) { mm.index = Number(b.dataset.choice); this.render(); } });
      b.addEventListener('click', () => { const mm = this.mode; if (mm.kind === 'pick') this.choose(mm.list[Number(b.dataset.choice)]); });
    });
    wireTabs(this.root, this.tabs);
    this.root.querySelectorAll<HTMLElement>('[data-hero]').forEach((b) => b.addEventListener('click', () => { const k = Number(b.dataset.hero); if (k !== this.hero) this.switchHero(k - this.hero); }));
  }
}
