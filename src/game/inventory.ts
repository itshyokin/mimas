/**
 * The player's bag: a pocket of slots per kind of item (consumables, gear, shards, materials, key items), each slot
 * holding a stack of one item, plus gold and equipment. The pockets sit one after another in one list of slots, so a
 * slot is still one number: pocket k is slots k·size … k·size + size − 1 (key items can add slots past the end).
 * No three.js, so it can be tested on its own.
 */
import { EQUIP_SLOTS, type Database, type EquipSlot, type ItemDef } from '../world/types';

export interface Stack { id: string; n: number }
export interface InventoryData { slots: (Stack | null)[]; gold: number; equip: Partial<Record<EquipSlot, string>>; ammo?: string | null; quick?: (string | null)[];
  /** The key item (a field tool: lantern, water-walking boots) quick-assigned to the B button. */
  bTool?: string | null;
  /** The hero's Element slots (Primary, Secondary): element stones (item ids). */
  elements?: (string | null)[];
  /** The size of each pocket when it was saved (older saves had one shared bag: their items are sorted into pockets). */
  pocket?: number;
  /** How many pockets the bag had (gear became two pockets: weapons and armor). */
  layout?: number }

/** The bag's pockets, in order (one tab each). */
export const POCKETS = ['consumable', 'weapon', 'armor', 'shard', 'material', 'key'] as const;
export type Pocket = (typeof POCKETS)[number];
/** Which pocket an item goes in. */
export function pocketOf(d: ItemDef | undefined): Pocket {
  if (!d) return 'material';
  // Gear is two pockets side by side: weapons (swords, bows, arrows) and armor (armor, shields, accessories).
  if (d.kind === 'equipment') return d.slot === 'magic' ? 'shard' : d.slot === 'weapon' || d.slot === 'ranged' ? 'weapon' : 'armor';
  if (d.kind === 'ammo') return 'weapon';
  // Element stones sit with the spell shards.
  if (d.essence) return 'shard';
  return d.kind === 'consumable' ? 'consumable' : d.kind === 'key' ? 'key' : 'material';
}

/** How many quick item slots there are (left, up, right on the D-pad; 5, 6, 7 on the keyboard). */
export const QUICK_SLOTS = 4;

/** Slots in each pocket (8 × 8). */
export const DEFAULT_BAG_SLOTS = 64;

/** Stacks of consumables, materials and arrows hold this many unless the item says otherwise. */
export const DEFAULT_STACK = 64;

/** How many of an item fit in one slot. */
export function stackSize(def: ItemDef | undefined): number {
  if (!def) return 1;
  if (def.kind === 'equipment') return 1;
  // Key and quest items have no limit.
  if (def.kind === 'key') return 999;
  if (def.kind === 'ammo') return def.ammo?.infinite ? 1 : Math.max(1, Math.min(999, Math.round(def.stack ?? DEFAULT_STACK)));
  return Math.max(1, Math.min(999, Math.round(def.stack ?? DEFAULT_STACK)));
}

/** Key and quest items always fit: the bag makes room for them (extra slots, gone again when they're used up). */
export const alwaysFits = (def: ItemDef | undefined): boolean => def?.kind === 'key';

export class Inventory {
  slots: (Stack | null)[];
  gold = 0;
  equip: Partial<Record<EquipSlot, string>> = {};
  /** The hero's Element slots (Primary, Secondary): the element stones worn (each holds one copy in the bag). */
  elements: (string | null)[] = [null, null];
  /** The arrows the player chose to shoot (falls back to never-ending arrows when they run out). */
  ammo: string | null = null;
  /** Quick items: the item each quick slot uses (it stays assigned when they run out). */
  quick: (string | null)[] = new Array(QUICK_SLOTS).fill(null);
  /** The key item with a field use (Light, Water Walk) the B button switches on and off. */
  bTool: string | null = null;

  /** Slots in each pocket (key items can add slots past the last one). */
  size: number;

  /** Item definitions (the game swaps in forged ones: upgraded, enchanted). */
  constructor(public items: (id: string) => ItemDef | undefined, size = DEFAULT_BAG_SLOTS) {
    this.size = size;
    this.slots = new Array(this.length).fill(null);
  }

  /** The bag's own length (all pockets). */
  /** Each pocket's size: the two gear pockets are half a pocket each (4 × 8 side by side). */
  private pocketSize(p: Pocket): number { return p === 'weapon' || p === 'armor' ? Math.max(4, Math.round(this.size / 2)) : this.size; }
  /** Where each pocket starts in the slot list. */
  private pocketStart(p: Pocket): number { let at = 0; for (const q of POCKETS) { if (q === p) return at; at += this.pocketSize(q); } return at; }
  private get length(): number { return POCKETS.reduce((a, p) => a + this.pocketSize(p), 0); }

  /** Drop empty slots past the bag's own size (made for key items that have gone). */
  private trim(): void {
    while (this.slots.length > this.length && this.slots[this.slots.length - 1] === null) this.slots.pop();
  }

  /** The pocket a slot belongs to. */
  pocketAt(i: number): Pocket {
    for (const p of POCKETS) if (i < this.pocketStart(p) + this.pocketSize(p)) return p;
    return 'key';
  }

  /** The slots of one pocket, in order (the key pocket includes any extra slots). */
  pocketSlots(p: Pocket): number[] {
    const out: number[] = [], start = this.pocketStart(p);
    const end = p === 'key' ? Math.max(this.slots.length, this.length) : start + this.pocketSize(p);
    for (let i = start; i < end; i++) out.push(i);
    return out;
  }

  /** The slots an item can go in (its pocket's). */
  private slotsFor(id: string): number[] { return this.pocketSlots(pocketOf(this.def(id))); }

  /** A new game: the database's starting gold, items and equipment. */
  static fresh(db: Database): Inventory {
    const items = new Map((db.items ?? []).map((d) => [d.id, d]));
    const inv = new Inventory((id) => items.get(id), db.inventory?.slots ?? DEFAULT_BAG_SLOTS);
    inv.gold = Math.max(0, db.inventory?.startGold ?? 0);
    for (const s of db.inventory?.startItems ?? []) inv.add(s.item, s.count);
    // Starting equipment is worn, and (like everything worn) a copy of it is in the bag.
    for (const slot of EQUIP_SLOTS) { const id = db.inventory?.startEquip?.[slot]; if (id && items.get(id)?.slot === slot) { inv.equip[slot] = id; if (inv.count(id) < 1) inv.add(id, 1); } }
    return inv;
  }

  def(id: string): ItemDef | undefined { return this.items(id); }

  /**
   * How many of an item the player has. Worn things stay in the bag (marked in use), so this is the bag's count;
   * `equip` (and the party's gear, and shards set in gear) only point at copies in it.
   */
  count(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s?.id === id) n += s.n;
    return n;
  }

  /** How many copies of an item are in use (worn by someone, set in gear): the game fills this in. */
  reserved: (id: string) => number = (id) => EQUIP_SLOTS.filter((s) => this.equip[s] === id).length;
  /** Called after anything leaves the bag, so whoever wore a copy that's gone can take it off. */
  onRemoved: () => void = () => {};

  /** Copies not in use (to sell, drop or put on someone else). */
  free(id: string): number { return Math.max(0, this.count(id) - this.reserved(id)); }

  /** How many of an item would fit right now. */
  room(id: string): number {
    if (alwaysFits(this.def(id))) return 9999;
    const mine = this.slotsFor(id);
    if (this.infinite(id)) return this.count(id) > 0 ? 999 : mine.some((i) => !this.slots[i]) ? 999 : 0;
    const max = stackSize(this.def(id));
    let r = 0;
    for (const i of mine) { const s = this.slots[i]; r += s ? (s.id === id ? max - s.n : 0) : max; }
    return r;
  }

  /** Never-ending items (the basic arrows): one in the bag is all there is. */
  infinite(id: string): boolean { return !!this.def(id)?.ammo?.infinite; }

  /** The arrows equipped (Equipment → Arrows), while any are left. Nothing is picked by itself. */
  arrow(): string | null {
    if (this.ammo && (this.count(this.ammo) > 0 || this.infinite(this.ammo))) return this.ammo;
    return null;
  }

  /** Use up one arrow (never-ending ones stay). */
  spendArrow(id: string): void { if (!this.infinite(id)) this.remove(id, 1); }

  /** Add items: tops up stacks of the same item first, then fills empty slots. Returns how many didn't fit. */
  add(id: string, n: number): number {
    if (!this.def(id) || n <= 0) return Math.max(0, n);
    const mine = this.slotsFor(id);
    if (this.infinite(id)) {
      if (this.count(id) > 0) return 0;
      const free = mine.find((i) => !this.slots[i]);
      if (free === undefined) return n;
      this.slots[free] = { id, n: 1 };
      return 0;
    }
    const max = stackSize(this.def(id));
    for (const i of mine) {
      const s = this.slots[i];
      if (n <= 0) break;
      if (s?.id === id && s.n < max) { const k = Math.min(n, max - s.n); s.n += k; n -= k; }
    }
    for (const i of mine) {
      if (n <= 0) break;
      if (this.slots[i]) continue;
      const k = Math.min(n, max);
      this.slots[i] = { id, n: k };
      n -= k;
    }
    // A key item with the bag full: an extra slot for it.
    while (n > 0 && alwaysFits(this.def(id))) { const k = Math.min(n, max); this.slots.push({ id, n: k }); n -= k; }
    return n;
  }

  /** Take items out of the bag (last stacks first). Returns how many were actually taken. */
  remove(id: string, n: number): number {
    let taken = 0;
    for (let i = this.slots.length - 1; i >= 0 && taken < n; i--) {
      const s = this.slots[i];
      if (s?.id !== id) continue;
      const k = Math.min(s.n, n - taken);
      s.n -= k; taken += k;
      if (s.n <= 0) this.slots[i] = null;
    }
    this.trim();
    if (taken) this.onRemoved();
    return taken;
  }

  /** Take from one slot. */
  /** The console's infinite_items: using consumables doesn't use them up. */
  keepUsed = false;

  removeAt(i: number, n: number): void {
    const s = this.slots[i];
    if (!s) return;
    if (this.keepUsed && this.def(s.id)?.kind === 'consumable') return;
    s.n -= n;
    if (s.n <= 0) this.slots[i] = null;
    this.trim();
    this.onRemoved();
  }

  /** Swap two slots, or merge them when they hold the same item (only within one pocket). False when it can't. */
  move(from: number, to: number): boolean {
    if (from === to) return true;
    if (this.pocketAt(from) !== this.pocketAt(to)) return false;
    const a = this.slots[from], b = this.slots[to];
    if (a && b && a.id === b.id) {
      const max = stackSize(this.def(a.id)), k = Math.min(a.n, max - b.n);
      b.n += k; a.n -= k;
      if (a.n <= 0) this.slots[from] = null;
      return true;
    }
    this.slots[from] = b; this.slots[to] = a;
    return true;
  }

  /**
   * Put on the item in bag slot i (it stays in the bag, marked in use; whatever was worn there is just taken off).
   * Returns false if the item isn't equipment.
   */
  equipFrom(i: number): boolean {
    const s = this.slots[i], def = s && this.def(s.id);
    if (!s || !def?.slot || def.kind !== 'equipment') return false;
    this.equip[def.slot] = s.id;
    return true;
  }

  /** Take off whatever is in an equipment slot (it stays in the bag). */
  unequip(slot: EquipSlot): boolean {
    delete this.equip[slot];
    return true;
  }

  toJSON(): InventoryData {
    return { slots: this.slots.map((s) => (s ? { ...s } : null)), gold: this.gold, equip: { ...this.equip }, ammo: this.ammo, quick: [...this.quick], ...(this.bTool ? { bTool: this.bTool } : {}), ...(this.elements.some(Boolean) ? { elements: [...this.elements] } : {}), pocket: this.size, layout: POCKETS.length };
  }

  /** Restore from a save. Items no longer in the database are dropped; a bigger or smaller bag keeps what fits. */
  load(d: InventoryData, size: number): void {
    this.size = size;
    this.slots = new Array(this.length).fill(null);
    this.gold = Math.max(0, d.gold ?? 0);
    this.equip = {};
    this.elements = [0, 1].map((k) => { const id = d.elements?.[k]; return id && this.def(id)?.essence ? id : null; });
    this.ammo = d.ammo && this.def(d.ammo) ? d.ammo : null;
    this.quick = Array.from({ length: QUICK_SLOTS }, (_, k) => { const id = d.quick?.[k]; return id && this.def(id) ? id : null; });
    this.bTool = null;
    // Update 132: key items go on the quick slots; one that was on the B button moves to a free one.
    const b = d.bTool && (this.def(d.bTool)?.tool || this.def(d.bTool)?.field) ? d.bTool : null;
    if (b && !this.quick.includes(b)) { const k = this.quick.indexOf(null); if (k >= 0) this.quick[k] = b; }
    // Saves from before rings kept light items in a "light" slot.
    const eq = { ...d.equip } as Record<string, string | undefined>;
    if (eq.light && !eq.ring) eq.ring = eq.light;
    for (const slot of EQUIP_SLOTS) { const id = eq[slot]; if (id && this.def(id)?.slot === slot) this.equip[slot] = id; }
    const extra: Stack[] = [];
    // Equipment in a slot it no longer belongs to (the old Ring slot: Light and Water Walk are shards now, plain rings
    // accessories) goes to its own slot when that's free, otherwise into the bag.
    for (const [slot, id] of Object.entries(eq)) {
      const own = id ? this.def(id)?.slot : undefined;
      if (!id || !own || own === slot || this.equip[own] === id) continue;
      if (!this.equip[own]) this.equip[own] = id; else extra.push({ id, n: 1 });
    }
    // Saved with these pockets: every item back where it was. Otherwise (an older save, a different pocket size)
    // each item is sorted into its pocket, keeping its order.
    const same = d.pocket === size && d.layout === POCKETS.length;
    (d.slots ?? []).forEach((s, i) => {
      if (!s || !this.def(s.id)) return;
      if (same && i < this.length && this.pocketAt(i) === pocketOf(this.def(s.id)) && !this.slots[i]) this.slots[i] = { id: s.id, n: Math.min(s.n, stackSize(this.def(s.id))) };
      else extra.push(s);
    });
    for (const s of extra) this.add(s.id, s.n);
  }
}
