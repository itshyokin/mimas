/**
 * A shop: Buy and Sell tabs, a list of goods with prices and how many you own, and a quantity
 * picker. Arrow keys (left/right switch tabs or change the amount), Space, Esc; or mouse and touch.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { type Inventory, stackSize } from '../game/inventory';
import { esc, warmthHtml } from './InventoryScreen';
import { itemColor } from '../world/items';

export interface ShopGood { item: string; price: number }

interface Row { item: string; price: number; owned: number; max: number; disabled: boolean; why?: string }

export class ShopScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private tab: 'buy' | 'sell' = 'buy';
  private sel = 0;
  private qty: { row: Row; n: number } | null = null;
  private goods: ShopGood[] = [];
  private canSell = true;
  private name = 'Shop';
  private message = '';
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input, private readonly inv: () => Inventory, private readonly icon: (id: string) => string,
    private readonly changed: () => void) {
    this.root.className = 'inv shop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.back(); } });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  show(name: string, goods: ShopGood[], canSell: boolean, onClose: () => void): void {
    this.name = name; this.goods = goods; this.canSell = canSell; this.onClose = onClose;
    this.tab = 'buy'; this.sel = 0; this.qty = null; this.message = '';
    this.open = true;
    this.root.hidden = false;
    this.render();
  }

  private close(): void {
    this.open = false;
    this.root.hidden = true;
    this.onClose();
  }

  private back(): void {
    uiSound('menuBack');
    if (this.qty) { this.qty = null; this.render(); return; }
    this.close();
  }

  /** What can be bought or sold right now. */
  private rows(): Row[] {
    const inv = this.inv();
    if (this.tab === 'buy') {
      return this.goods.filter((g) => inv.def(g.item)).map((g) => {
        const room = inv.room(g.item), afford = g.price > 0 ? Math.floor(inv.gold / g.price) : 99;
        const max = Math.min(room, afford, 99);
        return { item: g.item, price: g.price, owned: inv.count(g.item), max, disabled: max < 1, why: room < 1 ? 'Bag full' : afford < 1 ? 'Not enough gold' : undefined };
      });
    }
    // Sell: one row per item in the bag (not key items), at half the shop price.
    const seen = new Map<string, number>();
    for (const s of inv.slots) if (s) seen.set(s.id, (seen.get(s.id) ?? 0) + s.n);
    return [...seen].filter(([id]) => inv.def(id)?.kind !== 'key' && !inv.infinite(id)).map(([id, n]) => {
      const price = Math.floor((inv.def(id)?.price ?? 0) / 2);
      // Cannot be sold (Update 133): listed, greyed out.
      if (inv.def(id)?.noSell) return { item: id, price: 0, owned: n, max: 0, disabled: true, why: 'Can’t be sold' };
      // Worn things stay in the bag: only the copies nobody is using can be sold.
      const free = inv.free(id);
      return { item: id, price, owned: n, max: free, disabled: free < 1, why: free < 1 ? 'In use (take it off first)' : price === 0 ? 'Worth nothing' : undefined };
    });
  }

  update(): void {
    if (!this.open) return;
    const i = this.input;
    if (this.qty) {
      const q = this.qty;
      if (i.consume('right') || i.consume('up')) { q.n = Math.min(q.row.max, q.n + 1); this.render(); }
      if (i.consume('left') || i.consume('down')) { q.n = Math.max(1, q.n - 1); this.render(); }
      if (i.confirm()) this.confirm();
      if (i.consume('cancel')) this.back();
      return;
    }
    const rows = this.rows();
    if (i.consume('down') && rows.length) { this.sel = (this.sel + 1) % rows.length; this.render(); }
    if (i.consume('up') && rows.length) { this.sel = (this.sel + rows.length - 1) % rows.length; this.render(); }
    if ((i.consume('left') || i.consume('right')) && this.canSell) { this.tab = this.tab === 'buy' ? 'sell' : 'buy'; this.sel = 0; this.message = ''; this.render(); }
    if (i.confirm()) this.pick();
    if (i.consume('cancel')) this.back();
  }

  private pick(): void {
    uiSound('menuOk');
    const row = this.rows()[this.sel];
    if (!row) return;
    if (row.disabled) { this.message = row.why ?? ''; this.render(); return; }
    this.qty = { row, n: 1 };
    this.render();
  }

  private confirm(): void {
    const q = this.qty, inv = this.inv();
    if (!q) return;
    const name = inv.def(q.row.item)?.name ?? q.row.item;
    if (this.tab === 'buy') {
      const cost = q.row.price * q.n;
      if (cost > inv.gold || inv.room(q.row.item) < q.n) { this.message = 'You can’t carry or afford that many.'; this.qty = null; this.render(); return; }
      inv.gold -= cost;
      inv.add(q.row.item, q.n);
      uiSound('coin');
      this.message = `Bought ${q.n} × ${name} for ${cost.toLocaleString()} G.`;
    } else {
      const got = q.row.price * inv.remove(q.row.item, q.n);
      inv.gold += got;
      uiSound('coin');
      this.message = `Sold ${q.n} × ${name} for ${got.toLocaleString()} G.`;
    }
    this.qty = null;
    this.changed();
    const rows = this.rows();
    this.sel = Math.min(this.sel, Math.max(0, rows.length - 1));
    this.render();
  }

  private render(): void {
    // Keep the list where it was, then bring the chosen row into view (keys and controllers move the cursor).
    const keep = this.root.querySelector<HTMLElement>('.shop-list')?.scrollTop ?? 0;
    this.draw();
    const list = this.root.querySelector<HTMLElement>('.shop-list');
    if (list) { list.scrollTop = keep; list.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }
  }

  private draw(): void {
    const inv = this.inv(), rows = this.rows();
    const tabs = `<div class="shop-tabs"><button type="button" class="shop-tab" data-t="buy" aria-selected="${this.tab === 'buy'}">Buy</button>${
      this.canSell ? `<button type="button" class="shop-tab" data-t="sell" aria-selected="${this.tab === 'sell'}">Sell</button>` : ''}</div>`;
    const list = rows.length ? rows.map((r, k) => {
      const d = inv.def(r.item);
      return `<button type="button" class="menu-item shop-row" data-r="${k}" aria-selected="${k === this.sel}" ${r.disabled ? 'data-off="1"' : ''}>
        <img src="${this.icon(r.item)}" alt=""><span class="menu-label"${itemColor(d) ? ` style="color:${itemColor(d)}"` : ''}>${esc(d?.name ?? r.item)}</span>
        <span class="shop-own">${this.tab === 'buy' ? `own ${r.owned}` : `× ${r.owned}`}</span><span class="shop-price">${r.price.toLocaleString()} G</span></button>`;
    }).join('') : `<p class="menu-note">${this.tab === 'buy' ? 'Nothing for sale.' : 'Nothing to sell.'}</p>`;
    const sel = rows[this.sel], d = sel ? inv.def(sel.item) : undefined;
    const q = this.qty;
    const qtyBox = q ? `<div class="shop-qty"><span>${this.tab === 'buy' ? 'Buy' : 'Sell'} how many?</span>
      <span class="shop-qty-n">◀ ${q.n} ▶</span><span class="shop-qty-total">${(q.row.price * q.n).toLocaleString()} G</span>
      <span class="menu-note">Left / right change · Space confirms · Esc cancels</span></div>` : '';
    this.root.innerHTML = `<div class="inv-box">
      <div class="inv-head"><span class="menu-title">${esc(this.name)}</span><span class="inv-gold">${inv.gold.toLocaleString()} G</span></div>
      ${tabs}<div class="shop-list" role="listbox">${list}</div>
      <div class="inv-info">${d ? `<div class="inv-desc">${esc(d.description ?? '')}${d.warms ? `<span class="inv-kind">${warmthHtml(d).replace(/^ · /, ' ')}</span>` : ''}</div>` : ''}${sel?.why ? `<div class="inv-desc warn">${esc(sel.why)}</div>` : ''}</div>
      ${qtyBox}<div class="inv-msg">${esc(this.message)}</div>
      <div class="menu-note">${this.canSell ? 'Left / right: Buy or Sell · ' : ''}Space: choose · Esc: leave</div></div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.t as 'buy' | 'sell'; this.sel = 0; this.qty = null; this.render(); }));
    this.root.querySelectorAll<HTMLButtonElement>('[data-r]').forEach((b) => b.addEventListener('click', () => {
      const k = Number(b.dataset.r);
      if (this.sel === k && !this.qty) this.pick(); else { this.sel = k; this.qty = null; this.render(); }
    }));
    const qn = this.root.querySelector<HTMLElement>('.shop-qty-n');
    if (qn) qn.addEventListener('click', (e) => {
      const r = qn.getBoundingClientRect(), qq = this.qty!;
      qq.n = e.clientX < r.left + r.width / 2 ? Math.max(1, qq.n - 1) : Math.min(qq.row.max, qq.n + 1);
      this.render();
    });
    const qt = this.root.querySelector<HTMLElement>('.shop-qty-total');
    if (qt) qt.addEventListener('click', () => this.confirm());
  }
}

/** The goods of a shop command with prices filled in from the database. */
export function shopGoods(goods: { item: string; price?: number }[], price: (id: string) => number): ShopGood[] {
  return goods.map((g) => ({ item: g.item, price: Math.max(0, Math.round(g.price ?? price(g.item))) }));
}

export { stackSize };
