/**
 * Resting at a rest point (Update 106), in two steps.
 * 1. How many hours: ← → picks 1–12; each hero's health and magic bars show what comes back (20% an hour), with
 *    notes for 1 hour (warm and dry) and 5+ hours (full restore, every ailment cured).
 * 2. Camping supplies: food, potions and drinks from the bag with a Camp value. ↑ ↓ choose, ← → fewer / more. The bar
 *    runs to 50 with marks at 25 (Rested) and 50 (Well Rested); Fill picks the cheapest mix; under 25 nothing is
 *    spent ("Add X more to gain additional benefits"); past 50 it warns before wasting any.
 * Space goes on (and rests), Esc goes back.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';
import { CAMP_RESTED, CAMP_WELL, FULL_REST_HOURS, GOOD_INFO, type Supply, fillSupplies, goodFromPoints, restShare, supplyPoints } from '../game/rest';

export interface RestHero { name: string; face: string; hp: [number, number]; mp: [number, number]; down?: boolean }
export interface RestSupply extends Supply { name: string; icon: string }
export interface RestHost {
  party(): RestHero[];
  supplies(): RestSupply[];
}
export interface RestChoice { hours: number; use: Record<string, number> }

const MAX_HOURS = 12;

export class RestScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private step: 'hours' | 'supplies' = 'hours';
  private hours = 8;
  private use: Record<string, number> = {};
  private row = 0;
  private warned = false;
  private withSupplies = true;
  private done: (r: RestChoice | null) => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input, private readonly host: RestHost) {
    this.root.className = 'inv rest-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Rest');
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(opts: { supplies: boolean }, done: (r: RestChoice | null) => void): void {
    this.open = true;
    this.withSupplies = opts.supplies;
    this.done = done;
    this.step = 'hours';
    this.use = {};
    this.row = 0;
    this.warned = false;
    this.root.hidden = false;
    this.render();
  }

  private finish(r: RestChoice | null): void {
    this.open = false;
    this.root.hidden = true;
    uiSound(r ? 'menuOk' : 'menuBack');
    this.done(r);
  }

  private list(): RestSupply[] { return this.host.supplies().filter((s) => s.camp > 0 && s.count > 0); }

  /** Buttons under the supplies, after the item rows. */
  private buttons(): { id: string; label: string }[] {
    return [{ id: 'fill25', label: `Fill to Rested (${CAMP_RESTED})` }, { id: 'fill50', label: `Fill to Well Rested (${CAMP_WELL})` }, { id: 'clear', label: 'Clear' }, { id: 'rest', label: 'Rest' }];
  }

  private goOn(): void {
    if (this.step === 'hours') {
      if (this.withSupplies && this.list().length) { this.step = 'supplies'; this.row = 0; uiSound('menuOk'); this.render(); return; }
      this.finish({ hours: this.hours, use: {} });
      return;
    }
    const pts = supplyPoints(this.list(), this.use);
    if (pts > CAMP_WELL && !this.warned) { this.warned = true; uiSound('menuBack'); this.render(); return; }
    // Under 25 nothing is spent.
    this.finish({ hours: this.hours, use: pts >= CAMP_RESTED ? this.use : {} });
  }

  private press(id: string): void {
    const list = this.list();
    if (id === 'fill25' || id === 'fill50') { this.use = fillSupplies(list, id === 'fill25' ? CAMP_RESTED : CAMP_WELL, id === 'fill50' ? this.use : {}); this.warned = false; uiSound('menuOk'); this.render(); return; }
    if (id === 'clear') { this.use = {}; this.warned = false; uiSound('menuBack'); this.render(); return; }
    if (id === 'rest') this.goOn();
  }

  private change(i: number, d: number): void {
    const s = this.list()[i];
    if (!s) return;
    const n = Math.max(0, Math.min(s.count, (this.use[s.id] ?? 0) + d));
    if (n === (this.use[s.id] ?? 0)) { uiSound('menuBack'); return; }
    if (n) this.use[s.id] = n; else delete this.use[s.id];
    this.warned = false;
    uiSound('menuMove');
    this.render();
  }

  update(): void {
    if (!this.open) return;
    const i = this.input;
    if (this.step === 'hours') {
      if (i.consume('cancel')) { this.finish(null); return; }
      if (i.consume('left') || i.consume('down')) { this.hours = Math.max(1, this.hours - 1); uiSound('menuMove'); this.render(); return; }
      if (i.consume('right') || i.consume('up')) { this.hours = Math.min(MAX_HOURS, this.hours + 1); uiSound('menuMove'); this.render(); return; }
      if (i.confirm()) this.goOn();
      return;
    }
    const list = this.list(), btns = this.buttons(), n = list.length + btns.length;
    if (i.consume('cancel')) { this.step = 'hours'; uiSound('menuBack'); this.render(); return; }
    if (i.consume('up')) { this.row = (this.row + n - 1) % n; uiSound('menuMove'); this.render(); return; }
    if (i.consume('down')) { this.row = (this.row + 1) % n; uiSound('menuMove'); this.render(); return; }
    if (this.row < list.length) {
      if (i.consume('left')) { this.change(this.row, -1); return; }
      if (i.consume('right')) { this.change(this.row, 1); return; }
      if (i.confirm()) this.change(this.row, 1);
      return;
    }
    const b = this.row - list.length;
    if (i.consume('left')) { this.row = list.length + (b + btns.length - 1) % btns.length; uiSound('menuMove'); this.render(); return; }
    if (i.consume('right')) { this.row = list.length + (b + 1) % btns.length; uiSound('menuMove'); this.render(); return; }
    if (i.confirm()) this.press(btns[b].id);
  }

  private render(): void {
    const pct = (a: number, b: number) => Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0));
    if (this.step === 'hours') {
      const share = restShare(this.hours);
      const rows = this.host.party().map((x) => {
        const bar = (cls: string, [have, max]: [number, number], label: string) => {
          const to = x.down && this.hours < FULL_REST_HOURS ? have : Math.min(max, have + max * share);
          return `<div class="rs-bar ${cls}" title="${label} ${Math.round(have)} → ${Math.round(to)} / ${max}"><i class="rs-gain" style="width:${pct(to, max)}%"></i><i style="width:${pct(have, max)}%"></i><span>${label} ${Math.round(to)} / ${max}</span></div>`;
        };
        return `<div class="rs-hero${x.down ? ' down' : ''}"><img src="${x.face}" alt=""><b>${esc(x.name)}</b>${bar('hp', x.hp, 'HP')}${bar('mp', x.mp, 'MP')}</div>`;
      }).join('');
      const notes = [this.hours >= 1 ? 'Warms and dries the party' : '', this.hours >= FULL_REST_HOURS ? 'Full restore: everyone back on their feet, every ailment cured' : `Health and magic +${Math.round(share * 100)}% (${FULL_REST_HOURS}+ hours: full restore and cures every ailment)`].filter(Boolean);
      this.root.innerHTML = `<div class="inv-box rest-box">
        <div class="inv-head"><span class="menu-title">Rest</span></div>
        <p class="rs-q">Rest how many hours?</p>
        <div class="rs-hours"><button type="button" data-h="-1" aria-label="Fewer hours">◀</button><b>${this.hours}</b><span>hour${this.hours === 1 ? '' : 's'}</span><button type="button" data-h="1" aria-label="More hours">▶</button></div>
        <ul class="rs-notes">${notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <div class="rs-party">${rows}</div>
        <div class="rs-btns"><button type="button" class="btn" data-go="cancel">Cancel</button><button type="button" class="btn primary" data-go="ok">${this.withSupplies && this.list().length ? 'Next: supplies' : 'Rest'}</button></div>
        <div class="menu-note">← → hours · Space: ${this.withSupplies && this.list().length ? 'camping supplies' : 'rest'} · Esc: cancel</div>
      </div>`;
      this.root.querySelectorAll<HTMLElement>('[data-h]').forEach((b) => b.addEventListener('click', () => { this.hours = Math.max(1, Math.min(MAX_HOURS, this.hours + Number(b.dataset.h))); uiSound('menuMove'); this.render(); }));
      this.root.querySelector('[data-go="cancel"]')?.addEventListener('click', () => this.finish(null));
      this.root.querySelector('[data-go="ok"]')?.addEventListener('click', () => this.goOn());
      return;
    }
    const list = this.list(), pts = supplyPoints(list, this.use), good = goodFromPoints(pts), btns = this.buttons();
    const rows = list.map((s, k) => `<div class="rs-item${this.row === k ? ' sel' : ''}" data-row="${k}">
        <img src="${s.icon}" alt=""><span class="rs-name">${esc(s.name)}<small>Camp ${s.camp} · ${s.count} in the bag</small></span>
        <button type="button" data-d="-1" data-k="${k}" aria-label="Fewer ${esc(s.name)}">−</button><b>${this.use[s.id] ?? 0}</b><button type="button" data-d="1" data-k="${k}" aria-label="More ${esc(s.name)}">+</button></div>`).join('');
    const status = pts > CAMP_WELL && this.warned ? `${pts - CAMP_WELL} point${pts - CAMP_WELL === 1 ? '' : 's'} over 50 would be wasted. Press Rest again to use them anyway.`
      : good ? `${GOOD_INFO[good].name}: +${GOOD_INFO[good].stat} to every stat, +${GOOD_INFO[good].exp}% EXP${good === 'rested' ? ` · ${CAMP_WELL - pts} more for Well Rested` : ''}${pts > CAMP_WELL ? ` · ${pts - CAMP_WELL} over 50` : ''}`
        : pts ? `Add ${CAMP_RESTED - pts} more to gain additional benefits (under ${CAMP_RESTED}, nothing is used)` : 'No supplies: the party still rests. 25 makes them Rested, 50 Well Rested.';
    this.root.innerHTML = `<div class="inv-box rest-box">
      <div class="inv-head"><span class="menu-title">Camping supplies</span><span class="sk-points">${this.hours} hour${this.hours === 1 ? '' : 's'}</span></div>
      <div class="rs-meter${good ? ` ${good}` : ''}"><i style="width:${pct(Math.min(pts, CAMP_WELL), CAMP_WELL)}%"></i><em style="left:50%"></em><span>${pts} / ${CAMP_WELL}</span></div>
      <div class="rs-marks"><span style="left:50%">Rested</span><span style="left:100%">Well Rested</span></div>
      <p class="rs-status${pts > CAMP_WELL && this.warned ? ' warn' : ''}">${esc(status)}</p>
      <div class="rs-items">${rows}</div>
      <div class="rs-btns">${btns.map((b, k) => `<button type="button" class="btn${b.id === 'rest' ? ' primary' : ''}${this.row === list.length + k ? ' sel' : ''}" data-b="${b.id}">${esc(b.label)}</button>`).join('')}</div>
      <div class="menu-note">↑ ↓ choose · ← → fewer / more · Space: add one (or press the button) · Esc: back to the hours</div>
    </div>`;
    this.root.querySelectorAll<HTMLElement>('[data-d]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.row = Number(b.dataset.k); this.change(this.row, Number(b.dataset.d)); }));
    this.root.querySelectorAll<HTMLElement>('[data-b]').forEach((b) => b.addEventListener('click', () => this.press(b.dataset.b!)));
    this.root.querySelector('.rs-item.sel, .rs-btns .sel')?.scrollIntoView({ block: 'nearest' });
  }
}
