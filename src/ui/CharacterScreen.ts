/**
 * A hero's Status page (Party → a hero → Status), laid out like the handheld monster games' summary: the hero on the
 * left (their picture, name, level, elements and any ailment), and pages on the right: Profile (who they are and any
 * ailments), Stats (health, magic, their stats on the left and battle numbers on the right, EXP) and Gear (what
 * they're wearing; equipping is done from the bag).
 * Keys: ← → pages · LT / RT another hero · Esc back.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { ATTRS, ATTR_INFO, type Attr } from '../game/attributes';
import { rankPill, type Rank } from '../game/statRanks';
import { esc } from './InventoryScreen';
import { elementPill } from './elementPill';
import type { EquipChoice, EquipHost, EquipSlotId, EquipView } from './EquipScreen';
import { genderBadge, genderName } from '../game/roleplay';

export interface CharacterHost {
  hero(h: number): { name: string; level: number; portrait: string; color: string; about?: string; art?: string; elements?: import('../world/types').Element[]; ailment?: { tag: string; color: string; ink: string; name: string };
    /** Update 127: gender, roleplay answers, and how they see each other party member. */
    gender?: import('../world/types').Gender; roleplay?: { title: string; value: string }[]; bonds?: { name: string; value: number; label: string; color: string }[] };
  gauges(h: number): { hp: [number, number]; mp: [number, number]; sp: [number, number]; xp: { have: number; next: number | null } };
  slots(h: number): { label: string; item: EquipChoice | null }[];
  view(h: number): EquipView;
  ailments(h: number): { name: string; icon: string; left?: string }[];
  /** Each stat's progression rank (A … F), shown as a pill beside it. */
  ranks?(h: number): Record<Attr, Rank>;
  /** Their good state (Rested / Well Rested): + to every stat, + EXP, and the time left. */
  good?(h: number): { name: string; stat: number; exp: number; left: string } | null;
  /** Everyone, in lineup order (LT / RT step through them). */
  order?(): number[];
  /** Equipping from the Gear page (Update 140): the Equipment screen's host (the same hero numbers). */
  equip?(): EquipHost;
}

export class CharacterScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private hero = 0;
  private page = 0;
  private onClose: () => void = () => {};
  private static readonly PAGES = ['Profile', 'Stats', 'Gear'];
  /** The Gear page (Update 140): the slot picked, the choices open for it (and which), and a word after a change. */
  private gearSel = 0;
  private picking: { slot: EquipSlotId; list: (EquipChoice | null)[]; index: number } | null = null;
  private gearNote = '';

  constructor(parent: HTMLElement, private readonly input: Input, private readonly host: CharacterHost) {
    this.root.className = 'inv char-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Status');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.close(); } });
    this.root.addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur?.());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(hero: number, onClose: () => void): void {
    this.hero = hero;
    this.onClose = onClose;
    this.open = true;
    this.page = 0;
    this.gearSel = 0; this.picking = null; this.gearNote = '';
    this.root.hidden = false;
    this.render();
  }

  /** The Gear page's keys (Update 140): ↑ ↓ a slot, A its choices (pick one, or take it off), B back out of them. */
  private gearKeys(): boolean {
    const eh = this.host.equip?.(), i = this.input;
    if (!eh || this.page !== 2) return false;
    const slots = eh.slots(this.hero), p = this.picking;
    if (p) {
      if (i.consume('cancel')) { this.picking = null; uiSound('menuBack'); this.render(); return true; }
      if (i.consume('up')) { p.index = (p.index + p.list.length - 1) % p.list.length; uiSound('menuMove'); this.render(); return true; }
      if (i.consume('down')) { p.index = (p.index + 1) % p.list.length; uiSound('menuMove'); this.render(); return true; }
      if (i.confirm()) { this.choose(p.index); return true; }
      i.consume('left'); i.consume('right');
      return true;
    }
    if (i.consume('up')) { this.gearSel = (this.gearSel + slots.length - 1) % slots.length; uiSound('menuMove'); this.render(); return true; }
    if (i.consume('down')) { this.gearSel = (this.gearSel + 1) % slots.length; uiSound('menuMove'); this.render(); return true; }
    if (i.confirm()) { this.openChoices(); return true; }
    return false;
  }
  private openChoices(): void {
    const eh = this.host.equip?.();
    const s = eh?.slots(this.hero)[this.gearSel];
    if (!eh || !s) return;
    const list: (EquipChoice | null)[] = [...(s.item ? [null] : []), ...eh.choices(this.hero, s.slot)];
    if (!list.length) { this.gearNote = `Nothing in the bag fits: ${s.label}.`; uiSound('menuBack'); this.render(); return; }
    this.picking = { slot: s.slot, list, index: 0 };
    uiSound('menuOk');
    this.render();
  }
  private choose(k: number): void {
    const eh = this.host.equip?.(), p = this.picking;
    if (!eh || !p) return;
    const c = p.list[k];
    const msg = eh.equip(this.hero, p.slot, c ? c.id : null);
    this.gearNote = msg ?? (c ? `Equipped ${c.name}.` : 'Taken off.');
    this.picking = null;
    uiSound('menuOk');
    this.render();
  }

  private close(): void { this.open = false; this.root.hidden = true; uiSound('menuBack'); this.onClose(); }
  /** Put away without going back (another pause tab was picked). */
  hide(): void { this.open = false; this.root.hidden = true; }

  private otherHero(d: number): void {
    const order = this.host.order?.() ?? [this.hero];
    if (order.length < 2) return;
    const k = Math.max(0, order.indexOf(this.hero));
    this.hero = order[(k + d + order.length) % order.length];
    uiSound('menuMove');
    this.render();
  }

  private turn(d: number): void {
    const n = CharacterScreen.PAGES.length;
    this.page = (this.page + d + n) % n;
    uiSound('menuMove');
    this.render();
  }

  update(): void {
    if (!this.open) return;
    const i = this.input;
    // The Gear page's slots and choices first (B backs out of the choices before it closes the page).
    if (this.gearKeys()) return;
    if (i.consume('cancel')) { this.close(); return; }
    // LT / RT: the previous / next party member (in lineup order).
    { const d = i.consume('subPrev') ? -1 : i.consume('subNext') ? 1 : 0; if (d) { this.picking = null; this.gearNote = ''; this.otherHero(d); return; } }
    if (i.consume('left') || i.consume('up')) { this.turn(-1); return; }
    if (i.consume('right') || i.consume('down')) { this.turn(1); return; }
    i.confirm();
  }

  private render(): void {
    const h = this.host, k = this.hero, who = h.hero(k), g = h.gauges(k);
    const pct = (a: number, max: number) => Math.max(0, Math.min(100, (a / Math.max(1, max)) * 100));
    const bar = (label: string, [a, max]: [number, number], cls: string) =>
      `<div class="cs-bar ${cls}"><span>${label}</span><div><i style="width:${pct(a, max)}%"></i></div><b>${Math.round(a)} / ${Math.round(max)}</b></div>`;
    const pages = CharacterScreen.PAGES;
    let body = '';
    if (this.page === 0) {
      const ail = h.ailments(k);
      body = `<div class="cs-sec">About</div>
        <p class="cs-about">${who.about ? esc(who.about).replace(/\n/g, '<br>') : '<span class="cs-none">Nothing written about them yet.</span>'}</p>
        ${who.gender || who.roleplay?.length ? `<div class="cs-sec">Roleplay</div><div class="cs-rp">${who.gender ? `<span class="cs-rp-t">Gender</span><span class="cs-rp-v">${genderBadge(who.gender)} ${esc(genderName(who.gender))}</span>` : ''}${(who.roleplay ?? []).map((r) => `<span class="cs-rp-t">${esc(r.title)}</span><span class="cs-rp-v">${esc(r.value)}</span>`).join('')}</div>` : ''}
        <div class="cs-sec">Ailments</div>
        ${ail.length || who.ailment ? `<div class="cs-ail">${who.ailment && !ail.length ? `<span><span class="st-pill" style="background:${who.ailment.color};color:${who.ailment.ink}">${esc(who.ailment.tag)}</span> ${esc(who.ailment.name)} <small>until cured or rested</small></span>` : ''}${ail.map((a) => `<span><img src="${a.icon}" alt=""> ${esc(a.name)}${a.left ? ` <small>${esc(a.left)}</small>` : ''}</span>`).join('')}</div>` : '<p class="cs-none">None.</p>'}
`;
    } else if (this.page === 1) {
      const v = h.view(k), rk = h.ranks?.(k), gd = h.good?.(k) ?? null;
      const plus = gd ? `<span class="good-bonus" title="${esc(gd.name)}: ${esc(gd.left)} left">+${gd.stat}</span>` : '';
      const cell = (label: string, val: number | string, pill = '') => `<div class="cs-cell"><span>${label}</span>${pill}<b>${val}</b></div>`;
      body = `<div class="cs-sec">Health and magic</div>
        ${bar('HP', g.hp, 'hp')}${bar('MP', g.mp, 'mp')}
        <div class="cs-bar xp"><span>EXP</span><div><i style="width:${g.xp.next === null ? 100 : pct(g.xp.have, g.xp.next)}%"></i></div><b>${g.xp.next === null ? 'MAX' : `${g.xp.have} / ${g.xp.next}`}</b></div>
        <div class="cs-cols">
          <div><div class="cs-sec">Stats${gd ? ` <span class="good-bonus">${esc(gd.name)}<small>${esc(gd.left)} left</small></span>` : ''}</div><div class="cs-list">${ATTRS.map((a) => cell(ATTR_INFO[a].name, `${String(Math.round(v.attrs[a])).padStart(2, '0')}${plus}`, rk ? rankPill(rk[a]) : '')).join('')}</div></div>
          <div><div class="cs-sec">In battle</div><div class="cs-list">${cell('Melee damage', Math.round(v.melee))}${cell('Bow damage', Math.round(v.bow))}${cell('Spell damage', Math.round(v.spell))}
            ${cell('Critical hits', `${Math.round(v.crit)}%`)}${cell('Defence', Math.round(v.armour))}${cell('Magic defence', Math.round(v.magicArmour))}</div></div>
        </div>
        <div class="cs-sec">EXP</div>
        <div class="cs-grid">${cell('EXP points', g.xp.have)}${cell('Next level', g.xp.next === null ? '—' : Math.max(0, g.xp.next - g.xp.have))}${gd ? cell('Bonus', `<span class="good-bonus">EXP +${gd.exp}% (${esc(gd.name)})</span>`) : ''}</div>`;
    } else {
      // Update 140: equip and take off from here (↑ ↓ a slot, A its choices).
      const eh = h.equip?.(), list = eh ? eh.slots(k).map((s) => ({ label: s.label, item: s.item, none: s.none })) : h.slots(k).map((s) => ({ ...s, none: undefined as string | undefined }));
      this.gearSel = Math.min(this.gearSel, Math.max(0, list.length - 1));
      const slots = list.map((s, j) => `<div class="cs-slot${eh && j === this.gearSel ? ' sel' : ''}" data-gear="${j}"><span class="eq-label">${esc(s.label)}</span>${s.item ? `<img src="${s.item.icon}" alt="">` : '<span class="eq-empty"></span>'}
        <span class="eq-name${s.item ? '' : ' none'}"${s.item?.color ? ` style="color:${s.item.color}"` : ''}>${s.item ? esc(s.item.name) : esc(s.none ?? '(nothing)')}</span>${s.item?.shard ? `<img class="eq-shard" src="${s.item.shard.icon}" alt="${esc(s.item.shard.name)}" title="Set with ${esc(s.item.shard.name)}">` : '<span></span>'}</div>`).join('');
      const p = this.picking;
      const pick = p ? `<div class="cs-pick"><div class="cs-sec">Put on…</div>${p.list.map((c, j) => `<button type="button" class="cs-choice${j === p.index ? ' sel' : ''}" data-choice="${j}">${c ? `<img src="${c.icon}" alt=""><span${c.color ? ` style="color:${c.color}"` : ''}>${esc(c.name)}</span>${c.detail ? `<small>${esc(c.detail)}</small>` : ''}` : '<span class="eq-empty"></span><span>Take it off</span>'}</button>`).join('')}</div>` : '';
      body = `<div class="cs-sec">Equipped</div><div class="cs-gear">${slots}</div>${pick}${this.gearNote ? `<p class="cs-note">${esc(this.gearNote)}</p>` : ''}<p class="cs-hint">${eh ? `↑ ↓ choose · ${esc(this.input.label('ok'))}: equip or take off${p ? ' · B: back' : ''}` : 'Equip and take things off in the bag (Inventory → Gear, Shards).'}</p>`;
    }
    this.root.innerHTML = `<div class="inv-box cs-box cs-summary" style="--hero:${who.color}">
      <div class="cs-body">
        <div class="cs-left">
          <div class="cs-art"><img src="${who.art ?? who.portrait}" alt=""></div>
          <div class="cs-id"><b>${esc(who.name)}</b>${genderBadge(who.gender)}<span class="lv-pill" style="color:#3a2200">Lv ${who.level}</span>${who.ailment ? `<span class="st-pill" style="background:${who.ailment.color};color:${who.ailment.ink}" title="${esc(who.ailment.name)}">${esc(who.ailment.tag)}</span>` : ''}</div>
          ${who.elements?.length ? `<div class="cs-els">${who.elements.map((e) => elementPill(e)).join('')}</div>` : ''}
          ${who.bonds?.length ? `<div class="cs-bonds"><div class="cs-sec">Relationships</div>${who.bonds.map((b) => `<div class="cs-bond"><span class="cs-bond-n">${esc(b.name)}</span><span class="cs-bond-bar"><i style="width:${b.value}%;background:${b.color}"></i></span><b style="color:${b.color}">${esc(b.label)}</b></div>`).join('')}</div>` : ''}
        </div>
        <div class="cs-right">
          <div class="cs-pagebar"><span class="menu-title">${pages[this.page]}</span><span class="cs-dots">${pages.map((p, j) => `<button type="button" class="cs-pdot${j === this.page ? ' on' : ''}" data-page="${j}" title="${p}" aria-label="${p}"></button>`).join('')}</span></div>
          <div class="cs-page">${body}</div>
        </div>
      </div>
      <div class="menu-note">← → pages${(this.host.order?.().length ?? 1) > 1 ? ` · ${esc(this.input.label('subPrev'))} / ${esc(this.input.label('subNext'))}: another hero` : ''} · Esc: back</div>
    </div>`;
    this.root.querySelectorAll<HTMLElement>('[data-page]').forEach((b) => b.addEventListener('click', () => { this.page = Number(b.dataset.page); this.picking = null; uiSound('menuMove'); this.render(); }));
    this.root.querySelectorAll<HTMLElement>('[data-gear]').forEach((b) => b.addEventListener('click', () => { const j = Number(b.dataset.gear); if (j === this.gearSel && !this.picking) this.openChoices(); else { this.gearSel = j; this.picking = null; uiSound('menuMove'); this.render(); } }));
    this.root.querySelectorAll<HTMLElement>('[data-choice]').forEach((b) => b.addEventListener('click', () => this.choose(Number(b.dataset.choice))));
  }
}
