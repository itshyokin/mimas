/**
 * Status: the hero's level, gauges and stats (their own, what equipment and skills add, and what each does), crit
 * chance and defences, and spending stat points from levelling up. Points go on tentatively (← / →) and are only
 * final after "Confirm".
 * Keys: ↑/↓ pick a stat, → adds a point, ← takes back one added here, Space on Confirm keeps them, Esc closes.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { ATTRS, ATTR_INFO, ATTR_MAX, type Attr, type Attrs, type HeroTotals, accuracyOf, ailmentResist, attrEffect, baseAttrs, evasionOf } from '../game/attributes';
import { esc } from './InventoryScreen';
import { tabKeys, tabStrip, wireTabs, type TabGroup } from './tabs';

/** A stat's effect, red when it's a penalty. */
const effSpan = (k: Attr, v: number): string => { const t = attrEffect(k, v); return `<span class="mk-eff${/^−|more damage/.test(t) ? ' bad' : ''}">${t}</span>`; };

/** Every function takes the hero: 0 is the one you play, then the party members in order. */
export interface StatusHost {
  /** How many heroes there are (you plus the party). */
  count(): number;
  name(hero: number): string;
  level(hero: number): number;
  /** EXP into this level, and needed for the next (null at the top). */
  xp(hero: number): { have: number; next: number | null };
  gauges(hero: number): { hp: [number, number]; mp: [number, number]; sp: [number, number] };
  /** The hero's own stats (before gear) and unspent stat points. */
  own(hero: number): Attrs;
  points(hero: number): number;
  /** Totals for own stats plus `extra` points (gear and skills added). */
  totals(hero: number, extra: Attrs): HeroTotals;
  /** Keep the points: false if that didn't work. */
  spend(hero: number, add: Attrs): boolean;
}

export class StatusScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private row = 0;
  private hero = 0;
  private add: Attrs = baseAttrs(0);
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input, private readonly host: StatusHost) {
    this.root.className = 'inv status-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Status');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.cancel(); } });
    this.root.addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur?.());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  private tabs: TabGroup | undefined;

  /** Locked to one hero (opened from the Party menu for them): no switching. */
  private locked = false;

  show(onClose: () => void, tabs?: TabGroup, hero?: number): void {
    this.locked = hero !== undefined;
    if (hero !== undefined) this.hero = hero;
    this.open = true;
    this.onClose = onClose;
    this.tabs = tabs;
    this.add = baseAttrs(0);
    this.row = 0;
    if (this.hero >= this.host.count()) this.hero = 0;
    this.root.hidden = false;
    this.render();
  }

  private close(): void { this.open = false; this.root.hidden = true; this.onClose(); }
  /** Put away without closing the Inventory (another of its tabs is taking over). */
  hide(): void { this.open = false; this.root.hidden = true; }

  private get pending(): number { return ATTRS.reduce((s, k) => s + this.add[k], 0); }
  private get left(): number { return this.host.points(this.hero) - this.pending; }
  /** Rows: the five stats, then Confirm (when there are points). */
  private get rows(): number { return this.host.points(this.hero) > 0 ? ATTRS.length + 1 : ATTRS.length; }

  /** Esc: drop points not yet confirmed first, then close. */
  private cancel(): void {
    uiSound('menuBack');
    if (this.pending > 0) { this.add = baseAttrs(0); this.render(); return; }
    this.close();
  }

  update(): void {
    if (!this.open) return;
    const i = this.input;
    if (tabKeys(i, this.tabs)) return;
    if (i.consume('cancel')) { this.cancel(); return; }
    // LB / RB: another hero (← → are for points). Without tabs only; points not confirmed are dropped.
    if (!this.tabs && i.consume('tabPrev')) { this.switchHero(-1); return; }
    if (!this.tabs && i.consume('tabNext')) { this.switchHero(1); return; }
    if (i.consume('up')) { this.row = (this.row + this.rows - 1) % this.rows; uiSound('menuMove'); this.render(); return; }
    if (i.consume('down')) { this.row = (this.row + 1) % this.rows; uiSound('menuMove'); this.render(); return; }
    if (i.consume('right') && this.row < ATTRS.length) { this.change(ATTRS[this.row], 1); return; }
    if (i.consume('left') && this.row < ATTRS.length) { this.change(ATTRS[this.row], -1); return; }
    if (i.confirm()) {
      if (this.row === ATTRS.length) this.confirm();
      else this.change(ATTRS[this.row], 1);
    }
  }

  private switchHero(d: number): void {
    const n = this.host.count();
    if (n < 2 || this.locked) { uiSound('menuBack'); return; }
    this.hero = (this.hero + d + n) % n;
    this.add = baseAttrs(0);
    if (this.row >= this.rows) this.row = 0;
    uiSound('menuMove');
    this.render();
  }

  private change(k: Attr, d: number): void {
    const own = this.host.own(this.hero);
    if (d > 0 && (this.left <= 0 || own[k] + this.add[k] >= ATTR_MAX)) { uiSound('menuBack'); return; }
    if (d < 0 && this.add[k] <= 0) { uiSound('menuBack'); return; }
    this.add[k] += d;
    uiSound('menuMove');
    this.render();
  }

  private confirm(): void {
    if (this.pending <= 0) { uiSound('menuBack'); return; }
    if (this.host.spend(this.hero, this.add)) { uiSound('skill'); this.add = baseAttrs(0); if (this.host.points(this.hero) <= 0) this.row = 0; }
    this.render();
  }

  private render(): void {
    const h = this.host, k0 = this.hero, own = h.own(k0), pts = h.points(k0), now = h.totals(k0, baseAttrs(0)), after = h.totals(k0, this.add);
    const g = h.gauges(k0), xp = h.xp(k0), many = h.count() > 1 && !this.locked;
    const bar = (label: string, [v, max]: [number, number], cls: string) =>
      `<div class="st-gauge ${cls}"><span>${label}</span><div class="st-bar"><i style="width:${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%"></i></div><b>${Math.round(v)} / ${Math.round(max)}</b></div>`;
    const rows = ATTRS.map((k, i) => {
      const info = ATTR_INFO[k], base = own[k] + this.add[k], total = after.attrs[k], gear = total - base;
      const cls = ['st-row', i === this.row ? 'sel' : '', this.add[k] ? 'raised' : ''].join(' ');
      return `<div class="${cls}" data-row="${i}" role="option" aria-selected="${i === this.row}">
        <span class="mk-short">${info.short}</span><span class="mk-name">${info.name}<small>${info.does}</small></span>
        <span class="st-own">${base}${this.add[k] ? `<em>+${this.add[k]}</em>` : ''}</span>
        <span class="st-gear ${gear > 0 ? 'up' : gear < 0 ? 'down' : ''}">${gear ? (gear > 0 ? `+${gear}` : `−${-gear}`) : ''}</span>
        <span class="mk-val">${total}</span>${effSpan(k, total)}
        ${pts > 0 ? `<span class="st-pm"><button type="button" class="mk-pm" data-k="${i}" data-d="-1" aria-label="Take back a point from ${info.name}" ${this.add[k] ? '' : 'disabled'}>−</button><button type="button" class="mk-pm" data-k="${i}" data-d="1" aria-label="Add a point to ${info.name}" ${this.left > 0 && base < ATTR_MAX ? '' : 'disabled'}>+</button></span>` : ''}
      </div>`;
    }).join('');
    const diff = (a: number, b: number, unit = '') => (b !== a ? ` <em class="${b > a ? 'up' : 'down'}">→ ${b}${unit}</em>` : '');
    this.root.innerHTML = `<div class="inv-box st-box">
      <div class="inv-head"><span class="menu-title">${many ? '<button type="button" class="st-swap" data-d="-1" aria-label="Previous hero">◀</button> ' : ''}${esc(h.name(k0))}${many ? ' <button type="button" class="st-swap" data-d="1" aria-label="Next hero">▶</button>' : ''}</span><span class="sk-points">Level ${h.level(k0)}${xp.next !== null ? ` · EXP ${xp.have} / ${xp.next}` : ' · max level'}</span></div>
      ${tabStrip(this.tabs)}
      <div class="st-gauges">${bar('HP', g.hp, 'hp')}${bar('MP', g.mp, 'mp')}${xp.next !== null ? bar('EXP', [xp.have, xp.next], 'xp') : ''}</div>
      <div class="st-head"><span></span><span></span><span>Own</span><span>Gear</span><span>Total</span><span></span></div>
      <div class="mk-stats st-stats" role="listbox">${rows}</div>
      <div class="st-derived">
        <span>Critical hits <b>${now.crit}%</b>${diff(now.crit, after.crit, '%')}</span>
        <span>Defence <b>${now.armour}</b>${diff(now.armour, after.armour)}</span>
        <span>Magic defence <b>${now.magicArmour}</b>${diff(now.magicArmour, after.magicArmour)}</span>
        <span>Accuracy <b>${Math.round(accuracyOf(now.attrs.dex))}%</b>${diff(Math.round(accuracyOf(now.attrs.dex)), Math.round(accuracyOf(after.attrs.dex)), '%')}</span>
        <span>Dodge <b>${Math.round(evasionOf(now.attrs.agi))}%</b>${diff(Math.round(evasionOf(now.attrs.agi)), Math.round(evasionOf(after.attrs.agi)), '%')}</span>
        <span>Resist ailments <b>${Math.round(ailmentResist(now.attrs.end))}%</b>${diff(Math.round(ailmentResist(now.attrs.end)), Math.round(ailmentResist(after.attrs.end)), '%')}</span>
      </div>
      ${pts > 0 ? `<div class="mk-foot"><span class="mk-points">Stat points: <b>${this.left}</b> of ${pts} left</span><button type="button" class="menu-item mk-use" data-row="${ATTRS.length}" aria-selected="${this.row === ATTRS.length}" ${this.pending ? '' : 'disabled'}><span class="menu-label">Confirm</span></button></div>` : ''}
      <div class="menu-note">${pts > 0 ? '↑ ↓ choose · → add a point · ← take one back · Confirm keeps them · ' : 'Level up for stat points · '}${this.tabs ? `${esc(this.tabs.keys[0])} / ${esc(this.tabs.keys[1])}: tabs · ` : many ? `${esc(this.input.label('tabPrev'))} / ${esc(this.input.label('tabNext'))}: another hero · ` : ''}Esc: ${this.pending ? 'undo' : 'back'}</div>
    </div>`;
    wireTabs(this.root, this.tabs);
    this.root.querySelectorAll<HTMLButtonElement>('.st-swap').forEach((b) => b.addEventListener('click', () => this.switchHero(Number(b.dataset.d))));
    this.root.querySelectorAll<HTMLButtonElement>('.mk-pm').forEach((b) => b.addEventListener('click', () => { this.row = Number(b.dataset.k); this.change(ATTRS[this.row], Number(b.dataset.d)); }));
    this.root.querySelectorAll<HTMLElement>('.st-row').forEach((el) => el.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('.mk-pm')) { this.row = Number(el.dataset.row); uiSound('menuMove'); this.render(); } }));
    this.root.querySelector('.mk-use')?.addEventListener('click', () => { this.row = 5; this.confirm(); });
  }
}
