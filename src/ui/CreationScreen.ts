/**
 * Setting up a hero's stats (after New Game, or when a hero set to "Set up stats on joining" joins): one page at a
 * time.
 *
 *  1. Default stats (the Database's level 1 values) or Custom stats.
 *  2. Custom: Roll Dice, Point Buy or Standard Array (and Hard, 3d6 in order, when the game offers it).
 *  3. The way chosen:
 *     - Roll Dice: the stats on the left with empty boxes, the dice table in the middle, Roll / Re-Roll / Continue /
 *       Back on the right. Four dice tumble onto the table; the lowest is dropped and the total appears in the first
 *       empty box. ↑ ↓ move it to another empty box, OK puts it there. ← → go between the boxes and the buttons.
 *       OK on a filled box picks its number up again to move it. Continue is greyed until every stat has one.
 *     - Point Buy and Standard Array as before.
 *  Back returns a page, and every page keeps what was set up on it. "Continue" asks once more before it's final.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import {
  ATTRS, ATTR_INFO, POINT_BUY, STANDARD_ARRAY, type Attr, type Attrs, type CreationMethod,
  arranged, attrEffect, baseAttrs, nextCost, pointsSpent, swapOrder,
} from '../game/attributes';
import { rankPill, type Rank } from '../game/statRanks';
import { DiceTable } from '../render/DiceTable';
import { esc } from './InventoryScreen';

/** A stat's effect, red when it's a penalty. */
const effSpan = (k: Attr, v: number): string => { const t = attrEffect(k, v); return `<span class="mk-eff${/^−|more damage/.test(t) ? ' bad' : ''}">${t}</span>`; };

export interface CreationOptions {
  heroName: string;
  methods: CreationMethod[];
  /** Re-rolls allowed (0: no limit). */
  rerolls: number;
  /** The key or button that re-rolls, for the hint. */
  rerollKey: string;
  /** The Database's level 1 stats ("Default stats"). */
  defaults: Attrs;
  /** Each stat's growth rank, shown beside it. */
  ranks?: Record<Attr, Rank>;
  /** Esc on the first page goes back (New Game: to the title). Off when a hero is joining. */
  canLeave?: boolean;
}

export type CreationResult = CreationMethod | 'default';

type Page = 'choice' | 'methods' | CreationMethod;

const METHOD_NAMES: Record<CreationMethod, string> = { roll: 'Roll Dice', pointBuy: 'Point Buy', array: 'Standard Array', hard: 'Hard (3d6 in order)' };
const METHOD_DOES: Record<CreationMethod, string> = {
  roll: 'Roll four dice for each stat and drop the lowest. Put each roll on the stat you like.',
  pointBuy: `Every stat starts at ${POINT_BUY.min}. Spend ${POINT_BUY.budget} points to raise them, up to ${POINT_BUY.max}.`,
  array: `The same set for everyone: ${STANDARD_ARRAY.join(', ')}. Arrange them as you like.`,
  hard: 'Three dice for each stat, straight down the list: no re-rolls, no swaps.',
};

/** The Roll Dice page's buttons, top to bottom. */
const BUTTONS = ['roll', 'reroll', 'continue', 'back'] as const;
type Btn = typeof BUTTONS[number];

interface DicePage {
  /** The number on each stat (null: empty yet). */
  slots: (number | null)[];
  /** A roll waiting to be placed: its total, dice, dropped die, and the box it's showing in. */
  pending: { total: number; dice: number[]; drop: number; at: number } | null;
  rerollsUsed: number;
  /** Where the cursor is: the boxes or the buttons. */
  col: 'slots' | 'buttons';
  row: number;
  btn: number;
  /** The last dice shown (to redraw the table when coming back). */
  shown: number[];
  lastDrop?: number;
}

/** Rows after the stats: Continue, then Back. */
const ROW_CONTINUE = ATTRS.length, ROW_BACK = ATTRS.length + 1;
const freshDice = (): DicePage => ({ slots: ATTRS.map(() => null), pending: null, rerollsUsed: 0, col: 'buttons', row: 0, btn: 0, shown: [] });

export class CreationScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private opts!: CreationOptions;
  private page: Page = 'choice';
  private choiceSel = 0;
  private methodSel = 0;
  private confirming = false;
  private confirmSel = 0;
  private warnedLeft = false;
  /** Each page's setup, kept while going back and forth. */
  private roll: DicePage = freshDice();
  private hard: DicePage = freshDice();
  private arrayOrder = ATTRS.map((_, i) => i);
  private bought: Attrs = baseAttrs(POINT_BUY.min);
  /** Point buy / standard array: the selected row (after the stats: Continue) and a value picked up to swap. */
  private row = 0;
  private picked: number | null = null;
  private table: DiceTable | null = null;
  private done: (a: Attrs, how: CreationResult) => void = () => {};
  private back: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'inv creation-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Set up stats');
    this.root.addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur?.());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(opts: CreationOptions, done: (a: Attrs, how: CreationResult) => void, back: () => void = () => {}): void {
    this.opts = { ...opts, methods: opts.methods.length ? opts.methods : ['roll', 'pointBuy', 'array'] };
    this.done = done; this.back = back;
    this.open = true;
    this.page = 'choice'; this.choiceSel = 0; this.methodSel = 0; this.confirming = false; this.warnedLeft = false;
    this.roll = freshDice(); this.hard = freshDice(); this.arrayOrder = ATTRS.map((_, i) => i); this.bought = baseAttrs(POINT_BUY.min);
    this.row = 0; this.picked = null;
    this.root.hidden = false;
    this.render();
  }

  private close(): void {
    this.open = false; this.root.hidden = true;
    this.table?.dispose(); this.table = null;
  }

  /* ------------------------------------------------------------------ input */

  update(): void {
    if (!this.open) return;
    const i = this.input;
    if (this.confirming) {
      if (i.consume('cancel')) { this.confirming = false; uiSound('menuBack'); this.render(); return; }
      if (i.consume('left') || i.consume('right') || i.consume('up') || i.consume('down')) { this.confirmSel = 1 - this.confirmSel; uiSound('menuMove'); this.render(); return; }
      if (i.confirm()) { if (this.confirmSel === 0) this.finish(); else { this.confirming = false; uiSound('menuBack'); this.render(); } }
      return;
    }
    switch (this.page) {
      case 'choice': return this.updateList(2, () => this.choiceSel, (v) => (this.choiceSel = v), () => this.pickChoice(this.choiceSel), () => {
        if (this.opts.canLeave === false) return;
        uiSound('menuBack'); this.close(); this.back();
      });
      case 'methods': return this.updateList(this.opts.methods.length, () => this.methodSel, (v) => (this.methodSel = v), () => this.go(this.opts.methods[this.methodSel]), () => this.goBack());
      case 'roll': case 'hard': return this.updateDice();
      default: return this.updateRows();
    }
  }

  private updateList(n: number, get: () => number, set: (v: number) => void, ok: () => void, cancel: () => void): void {
    const i = this.input;
    if (i.consume('cancel')) { cancel(); return; }
    if (i.consume('up') || i.consume('left')) { set((get() + n - 1) % n); uiSound('menuMove'); this.render(); return; }
    if (i.consume('down') || i.consume('right')) { set((get() + 1) % n); uiSound('menuMove'); this.render(); return; }
    if (i.confirm()) ok();
  }

  private pickChoice(k: number): void {
    uiSound('menuOk');
    if (k === 0) { this.defaultChosen = true; this.confirming = true; this.confirmSel = 0; this.render(); return; }
    this.defaultChosen = false;
    if (this.opts.methods.length === 1) this.go(this.opts.methods[0]);
    else { this.page = 'methods'; this.render(); }
  }

  private defaultChosen = false;

  private go(p: Page): void {
    uiSound('menuOk');
    this.page = p; this.row = 0; this.picked = null; this.warnedLeft = false;
    if (p === 'roll' || p === 'hard') {
      // The table shows this page's last dice, as they lay.
      const d = this.dice, t = this.ensureTable();
      t.clear();
      if (d.shown.length) { t.roll(d.shown, () => {}); t.skip(); t.dim(d.lastDrop !== undefined && d.lastDrop >= 0 ? [d.lastDrop] : []); }
    }
    this.render();
  }

  private goBack(): void {
    uiSound('menuBack');
    this.table?.skip();
    this.page = this.page === 'methods' || this.opts.methods.length === 1 ? 'choice' : 'methods';
    this.render();
  }

  /* ------------------------------------------------------------------ roll dice */

  private get dice(): DicePage { return this.page === 'hard' ? this.hard : this.roll; }
  private get isHard(): boolean { return this.page === 'hard'; }

  private rerollsLeft(p = this.dice): number | null {
    if (this.isHard) return 0;
    return this.opts.rerolls > 0 ? Math.max(0, this.opts.rerolls - p.rerollsUsed) : null;
  }

  private btnEnabled(b: Btn): boolean {
    const p = this.dice, rolling = !!this.table?.rolling, full = p.slots.every((v) => v !== null);
    if (b === 'roll') return !rolling && !p.pending && !full;
    if (b === 'reroll') return !rolling && !!p.pending && this.rerollsLeft() !== 0;
    if (b === 'continue') return !rolling && full && !p.pending;
    return true;
  }

  private updateDice(): void {
    const i = this.input, p = this.dice;
    if (i.consume('cancel')) {
      if (this.table?.rolling) { this.table.skip(); return; }
      this.goBack(); return;
    }
    if (i.consume('switchWeapon')) { this.press('reroll'); return; }
    if (this.table?.rolling) { if (i.confirm()) this.table.skip(); return; }
    const l = i.consume('left'), r = i.consume('right');
    if ((l || r) && !this.isHard) { p.col = p.col === 'slots' ? 'buttons' : 'slots'; uiSound('menuMove'); this.render(); return; }
    const up = i.consume('up'), down = i.consume('down');
    if (up || down) {
      const d = up ? -1 : 1;
      if (p.col === 'buttons') p.btn = (p.btn + d + BUTTONS.length) % BUTTONS.length;
      else if (p.pending) {
        // The roll moves to the next empty box.
        const empty = p.slots.map((v, k) => (v === null ? k : -1)).filter((k) => k >= 0);
        const at = empty.indexOf(p.pending.at);
        p.pending.at = empty[(at + d + empty.length) % empty.length];
        p.row = p.pending.at;
      } else p.row = (p.row + d + ATTRS.length) % ATTRS.length;
      uiSound('menuMove'); this.render(); return;
    }
    if (i.confirm()) {
      if (p.col === 'buttons') this.press(BUTTONS[p.btn]);
      else this.slotOk(p.row);
    }
  }

  private press(b: Btn): void {
    if (!this.btnEnabled(b)) { uiSound('menuBack'); return; }
    if (b === 'back') { this.goBack(); return; }
    if (b === 'continue') { this.askConfirm(); return; }
    if (b === 'reroll') this.dice.rerollsUsed++;
    this.throwDice();
  }

  /** OK on a box: put the waiting roll there, or pick a placed number up again. */
  private slotOk(k: number): void {
    const p = this.dice;
    if (this.isHard) return;
    if (p.pending) {
      if (p.slots[k] !== null) { uiSound('menuBack'); return; }
      p.slots[k] = p.pending.total; p.pending = null;
      uiSound('menuOk');
      const full = p.slots.every((v) => v !== null);
      p.col = 'buttons'; p.btn = full ? BUTTONS.indexOf('continue') : 0;
    } else if (p.slots[k] !== null) {
      p.pending = { total: p.slots[k]!, dice: [], drop: -1, at: k };
      p.slots[k] = null;
      uiSound('menuOk');
    } else return;
    this.render();
  }

  private throwDice(): void {
    const p = this.dice, hard = this.isHard, n = hard ? 3 : 4;
    const dice = Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));
    const drop = hard ? -1 : dice.indexOf(Math.min(...dice));
    const total = dice.reduce((s, v, k) => (k === drop ? s : s + v), 0);
    const firstEmpty = p.slots.findIndex((v) => v === null);
    p.pending = null;
    p.shown = dice;
    uiSound('dice');
    const land = () => {
      this.table?.dim(drop >= 0 ? [drop] : []);
      if (hard) {
        p.slots[firstEmpty] = total;
        p.btn = p.slots.every((v) => v !== null) ? BUTTONS.indexOf('continue') : 0;
      } else {
        p.pending = { total, dice, drop, at: firstEmpty };
        p.col = 'slots'; p.row = firstEmpty;
      }
      p.lastDrop = drop;
      this.render();
    };
    this.render();
    const t = this.ensureTable();
    if (t.available) t.roll(dice, land); else land();
    this.render();
  }

  private ensureTable(): DiceTable {
    return (this.table ??= new DiceTable());
  }

  /* ------------------------------------------------------------------ point buy / standard array */

  private updateRows(): void {
    const i = this.input;
    if (i.consume('cancel')) {
      if (this.picked !== null) { this.picked = null; uiSound('menuBack'); this.render(); return; }
      this.goBack(); return;
    }
    if (i.consume('up')) { this.row = (this.row + ROW_BACK) % (ROW_BACK + 1); uiSound('menuMove'); this.render(); return; }
    if (i.consume('down')) { this.row = (this.row + 1) % (ROW_BACK + 1); uiSound('menuMove'); this.render(); return; }
    const l = i.consume('left'), r = i.consume('right');
    if ((l || r) && this.page === 'pointBuy' && this.row < ROW_CONTINUE) { this.buy(this.row, r ? 1 : -1); return; }
    if (i.confirm()) this.activate(this.row);
  }

  private buy(k: number, d: number): void {
    const a = ATTRS[k], v = this.bought[a] + d;
    if (v < POINT_BUY.min || v > POINT_BUY.max) { uiSound('menuBack'); return; }
    const after = { ...this.bought, [a]: v };
    if (pointsSpent(after) > POINT_BUY.budget) { uiSound('menuBack'); return; }
    this.bought = after;
    uiSound('menuMove');
    this.render();
  }

  /** OK on a row: pick up / swap a value, Continue or Back. */
  private activate(row: number): void {
    if (row === ROW_BACK) { this.goBack(); return; }
    if (row === ROW_CONTINUE) {
      if (this.page === 'pointBuy' && pointsSpent(this.bought) < POINT_BUY.budget && !this.warnedLeft) { this.warnedLeft = true; uiSound('menuBack'); this.render(); return; }
      this.askConfirm(); return;
    }
    if (this.page !== 'array') return;
    if (this.picked === null) { this.picked = row; uiSound('menuOk'); this.render(); return; }
    if (this.picked !== row) { this.arrayOrder = swapOrder(this.arrayOrder, this.picked, row); uiSound('menuOk'); }
    this.picked = null;
    this.render();
  }

  /* ------------------------------------------------------------------ finishing */

  /** The stats the current page gives. */
  private stats(): Attrs {
    if (this.defaultChosen && this.page === 'choice') return { ...this.opts.defaults };
    if (this.page === 'roll' || this.page === 'hard') {
      const a = baseAttrs();
      ATTRS.forEach((k, i) => (a[k] = this.dice.slots[i] ?? a[k]));
      return a;
    }
    if (this.page === 'array') return arranged(STANDARD_ARRAY, this.arrayOrder);
    return { ...this.bought };
  }

  private askConfirm(): void { this.confirming = true; this.confirmSel = 0; uiSound('menuOk'); this.render(); }

  private finish(): void {
    uiSound('menuOk');
    const a = this.stats(), how: CreationResult = this.defaultChosen && this.page === 'choice' ? 'default' : this.page as CreationMethod;
    this.close();
    this.done(a, how);
  }

  /* ------------------------------------------------------------------ drawing */

  private render(): void {
    const o = this.opts;
    const head = `<div class="inv-head"><span class="menu-title">${this.page === 'choice' ? 'Set up stats' : this.page === 'methods' ? 'Custom stats' : METHOD_NAMES[this.page as CreationMethod]}</span><span class="sk-points">${esc(o.heroName)}</span></div>`;
    let body = '', note = '', wide = false;
    if (this.page === 'choice') {
      const pills = (k: Attr) => (o.ranks ? rankPill(o.ranks[k]) : '');
      const preview = `<div class="mk-preview">${ATTRS.map((k) => `<span>${ATTR_INFO[k].short} <b>${o.defaults[k]}</b>${pills(k)}</span>`).join('')}</div>`;
      body = `<div class="mk-choices" role="listbox">
        ${this.choice(0, this.choiceSel, 'Default stats', `${esc(o.heroName)} as the story made them.`, preview)}
        ${this.choice(1, this.choiceSel, 'Custom stats', o.methods.map((m) => METHOD_NAMES[m]).join(' · '))}
      </div>`;
      note = `↑ ↓ choose · OK${o.canLeave === false ? '' : ' · Esc: back'}`;
    } else if (this.page === 'methods') {
      body = `<div class="mk-choices" role="listbox">${o.methods.map((m, k) => this.choice(k, this.methodSel, METHOD_NAMES[m], METHOD_DOES[m])).join('')}</div>`;
      note = '↑ ↓ choose · OK · Esc: back';
    } else if (this.page === 'roll' || this.page === 'hard') {
      body = this.diceBody(); wide = true;
      note = this.isHard ? '↑ ↓ choose · OK · Esc: back' : `← → boxes / buttons · ↑ ↓ choose · OK · ${esc(o.rerollKey)}: re-roll · Esc: back`;
    } else {
      body = this.rowsBody();
      note = `↑ ↓ choose · ${this.page === 'pointBuy' ? '← → lower / raise' : 'OK: swap two values'} · Esc: back`;
    }
    const a = this.stats();
    const confirm = this.confirming ? `<div class="mk-confirm" role="alertdialog">
        <p>Use these stats for ${esc(o.heroName)}?</p>
        <p class="mk-sum">${ATTRS.map((k) => `${ATTR_INFO[k].short} <b>${a[k]}</b>`).join(' · ')}</p>
        <p class="mk-note">They can’t be set up again: from here they grow with each level, by their rank.</p>
        <div class="mk-yn"><button type="button" class="menu-item" data-yn="0" aria-selected="${this.confirmSel === 0}"><span class="menu-label">Yes, begin</span></button><button type="button" class="menu-item" data-yn="1" aria-selected="${this.confirmSel === 1}"><span class="menu-label">Not yet</span></button></div>
      </div>` : '';
    this.root.innerHTML = `<div class="inv-box mk-box${wide ? ' wide' : ''}">${head}${body}<div class="menu-note">${note}</div>${confirm}</div>`;
    this.wire();
  }

  private choice(k: number, sel: number, title: string, does: string, extra = ''): string {
    return `<button type="button" class="mk-choice" data-choice="${k}" role="option" aria-selected="${k === sel}"><b>${title}</b><small>${esc(does)}</small>${extra}</button>`;
  }

  private diceBody(): string {
    const p = this.dice, rolling = !!this.table?.rolling, left = this.rerollsLeft();
    const slots = ATTRS.map((k, i) => {
      const v = p.slots[i], pend = p.pending?.at === i ? p.pending : null;
      const cur = p.col === 'slots' && p.row === i;
      const box = pend ? `<span class="mk-box-v pending"><i>▲</i>${pend.total}<i>▼</i></span>` : `<span class="mk-box-v${v === null ? ' empty' : ''}">${v ?? ''}</span>`;
      return `<div class="mk-slot${cur ? ' sel' : ''}" data-slot="${i}" role="option" aria-selected="${cur}">
        <span class="mk-short">${ATTR_INFO[k].short}</span><span class="mk-name">${ATTR_INFO[k].name}${this.opts.ranks ? rankPill(this.opts.ranks[k]) : ''}</span>${box}</div>`;
    }).join('');
    const label: Record<Btn, string> = { roll: 'Roll', reroll: `Re-Roll${left !== null && !this.isHard ? ` (${left})` : ''}`, continue: 'Continue', back: 'Back' };
    const btns = BUTTONS.filter((b) => !(this.isHard && b === 'reroll')).map((b) => {
      const k = BUTTONS.indexOf(b), cur = p.col === 'buttons' && p.btn === k;
      return `<button type="button" class="menu-item mk-btn" data-btn="${b}" aria-selected="${cur}" ${this.btnEnabled(b) ? '' : 'disabled'}><span class="menu-label">${label[b]}</span></button>`;
    }).join('');
    const shown = p.shown, drop = p.lastDrop ?? -1;
    const total = shown.reduce((s, v, k) => (k === drop ? s : s + v), 0);
    const tally = rolling ? 'Rolling…' : shown.length
      ? `${shown.map((v, k) => `<span class="mk-die${k === drop ? ' dropped' : ''}">${v}</span>`).join('')} <b>= ${total}</b>${drop >= 0 ? ' <small>(lowest dropped)</small>' : ''}`
      : this.isHard ? 'Three dice for each stat, in order.' : 'Roll four dice: the lowest is dropped.';
    const hint = p.pending ? `↑ ↓ choose a stat for the ${p.pending.total}, then OK.` : p.slots.every((v) => v !== null) ? 'Every stat has a number. Continue when you’re happy.' : this.isHard || p.slots.every((v) => v === null) ? '' : 'OK on a filled box picks its number up again.';
    return `<div class="mk-roll">
      <div class="mk-slots" role="listbox">${slots}</div>
      <div class="mk-table"><div class="mk-dice-slot"></div><div class="mk-tally">${tally}</div></div>
      <div class="mk-btns">${btns}</div>
    </div><p class="mk-hint">${hint}</p>`;
  }

  private rowsBody(): string {
    const m = this.page as CreationMethod, a = this.stats();
    const rows = ATTRS.map((k, i) => {
      const info = ATTR_INFO[k], v = a[k];
      let extra = '';
      if (m === 'pointBuy') {
        const nc = nextCost(v);
        extra = `<span class="mk-buy"><button type="button" class="mk-pm" data-buy="${i}" data-d="-1" aria-label="Lower ${info.name}" ${v <= POINT_BUY.min ? 'disabled' : ''}>−</button><button type="button" class="mk-pm" data-buy="${i}" data-d="1" aria-label="Raise ${info.name}" ${nc === null ? 'disabled' : ''}>+</button><span class="mk-cost">${nc === null ? 'max' : `next: ${nc} pt${nc === 1 ? '' : 's'}`}</span></span>`;
      } else extra = '<span></span>';
      const cls = ['mk-row', i === this.row ? 'sel' : '', this.picked === i ? 'picked' : ''].join(' ');
      return `<div class="${cls}" data-row="${i}" role="option" aria-selected="${i === this.row}">
        <span class="mk-short">${info.short}</span><span class="mk-name">${info.name}${this.opts.ranks ? rankPill(this.opts.ranks[k]) : ''}<small>${info.does}</small></span>
        <span class="mk-val">${v}</span>${effSpan(k, v)}${extra}</div>`;
    }).join('');
    const left = POINT_BUY.budget - pointsSpent(this.bought);
    const status = m === 'pointBuy' ? `<span class="mk-points">Points left: <b>${left}</b> / ${POINT_BUY.budget}</span>` : `<span class="mk-points">Total ${ATTRS.reduce((s, k) => s + a[k], 0)}</span>`;
    const hint = this.picked !== null ? `Now choose the stat to swap ${ATTR_INFO[ATTRS[this.picked]].name} with.` : METHOD_DOES[m];
    const warn = this.warnedLeft && m === 'pointBuy' && left > 0 ? `<div class="mk-warn">You still have ${left} point${left === 1 ? '' : 's'} to spend. Choose Continue again to go on anyway.</div>` : '';
    return `<p class="mk-hint">${esc(hint)}</p><div class="mk-stats" role="listbox">${rows}</div>
      <div class="mk-foot">${status}<span class="mk-foot-btns"><button type="button" class="menu-item mk-use" data-row="${ROW_BACK}" aria-selected="${this.row === ROW_BACK}"><span class="menu-label">Back</span></button><button type="button" class="menu-item mk-use" data-row="${ROW_CONTINUE}" aria-selected="${this.row === ROW_CONTINUE}"><span class="menu-label">Continue</span></button></span></div>${warn}`;
  }

  private wire(): void {
    const q = <T extends HTMLElement>(s: string) => this.root.querySelectorAll<T>(s);
    q('[data-choice]').forEach((b) => b.addEventListener('click', () => {
      const k = Number(b.dataset.choice);
      if (this.page === 'choice') { this.choiceSel = k; this.pickChoice(k); } else { this.methodSel = k; this.go(this.opts.methods[k]); }
    }));
    q('[data-slot]').forEach((el) => el.addEventListener('click', () => {
      const p = this.dice, k = Number(el.dataset.slot);
      if (p.pending && p.slots[k] === null) p.pending.at = k;
      p.col = 'slots'; p.row = k;
      this.slotOk(k);
    }));
    q<HTMLButtonElement>('[data-btn]').forEach((b) => b.addEventListener('click', () => { const p = this.dice; p.col = 'buttons'; p.btn = BUTTONS.indexOf(b.dataset.btn as Btn); this.press(b.dataset.btn as Btn); }));
    q('.mk-row').forEach((el) => el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.mk-pm')) return;
      this.row = Number(el.dataset.row); this.activate(this.row);
    }));
    q('.mk-use').forEach((b) => b.addEventListener('click', () => { this.row = Number(b.dataset.row); this.activate(this.row); }));
    q<HTMLButtonElement>('.mk-pm').forEach((b) => b.addEventListener('click', () => { this.row = Number(b.dataset.buy); this.buy(this.row, Number(b.dataset.d)); }));
    q('[data-yn]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.yn === '0') this.finish(); else { this.confirming = false; this.render(); } }));
    // The dice table's canvas lives on between redraws.
    const slot = this.root.querySelector('.mk-dice-slot');
    if (slot) {
      const t = this.ensureTable();
      slot.appendChild(t.canvas);
      requestAnimationFrame(() => t.draw());
    }
  }
}
