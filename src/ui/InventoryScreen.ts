/**
 * The bag: a tab (pocket) per kind of item, each an 8 × 8 grid of slots (empty ones too, so things can be arranged),
 * with the selected item's details, gold, and an action list (Use, Equip, Quick slot, Move, Drop). The Shards tab
 * readies a shard as a hero's spell and sets shards in weapons and armor. Arrow keys / Space / Esc, or mouse and touch.
 */
import { restoreBits } from '../game/restore';
import { COIN_SVG } from './StatusBars';
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { type Inventory, type Pocket } from '../game/inventory';
import type { ItemDef } from '../world/types';
import { FIELD_USE_NAMES, POWER_NAMES, carriedUse, itemColor, rarityOf } from '../world/items';
import { RARITY_NAMES } from '../world/types';
import { ATTRS, ATTR_INFO } from '../game/attributes';
import { ELEMENT_COLORS, ELEMENT_NAMES } from '../game/elements';
import { AILMENT_INFO, BUFF_INFO } from '../game/status';
import { tabKeys, tabStrip, wireTabs, type TabGroup } from './tabs';

export interface InventoryActions {
  /** Use a consumable in slot i. Returns a message to show, or null if nothing happened. */
  use(i: number, who?: number): string | null;
  /** Who a consumable can be used on (the hero, then party members); with fewer than two, Use needs no choice. */
  targets?(i: number): { label: string; disabled?: boolean }[];
  /** A warning to show on Use (a zombie drinking a potion), or null. */
  useWarning?(i: number): string | null;
  /** Key items with a field use (a lantern…): switched on now? Switch it on or off; put it on (or take it off) the B button. */
  toolOn?(i: number): boolean;
  toggleTool?(i: number): string | null;
  assignB?(i: number): string | null;
  /** The B button's key or button name. */
  bLabel?(): string;
  /** The key or button for quick slot k (shown when assigning). */
  quickLabel?(k: number): string;
  /** Equip the item in slot i. */
  equip(i: number): string | null;
  /** Equipment: who can put it on (the hero first; with fewer than two, Equip needs no choice), and putting it on. */
  equipTargets?(i: number): { label: string; disabled?: boolean }[];
  equipOn?(i: number, who: number): string | null;
  /** Open the equipment screen (on a slot, with this item highlighted, when it's given). */
  openEquip?(at?: { slot: 'weapon' | 'shield' | 'ranged' | 'magic' | 'armor' | 'accessory' | 'ammo'; item?: string }): void;
  /** Called after anything changed (to refresh lights, save state…). */
  changed(): void;
  /** Icon for an item, as an image URL. */
  icon(id: string): string;
  /** Put the stack in slot i down on the ground (null: can't here). */
  /** Put `count` of slot i down by the hero's feet. */
  drop?(i: number, count: number): string | null;
  /** Shards: the heroes a shard can be readied for (the hero first), and readying it for one of them. */
  readyTargets?(i: number): { label: string; disabled?: boolean }[];
  ready?(i: number, who: number): string | null;
  /** Shards readied now, per hero (the hero first). */
  readied?(): { hero: string; name: string; icon: string }[];
  /** Weapons and armor a shard (by id) can be set in: worn by anyone, or in the bag. */
  shardSpots?(shard: string): { gear: string; label: string; detail?: string; disabled?: boolean }[];
  /** Set a shard in a piece of gear (null takes its shard out). */
  setShard?(gear: string, shard: string | null): string | null;
  /** The shard set in a piece of gear, if any. */
  shardIn?(gear: string): { id: string; name: string; icon: string } | null;
  /** Every piece of gear with a shard set in it. */
  enchanted?(): { gear: string; name: string; icon: string; shard: { name: string; icon: string } }[];
  /** Who uses the copy in slot i (a hero's name, or "In Short Sword" for a set shard), or null: free. */
  usedBy?(i: number): string | null;
  /** The colour of whoever uses it (their colour from the database), for its "equipped" tag. */
  usedColor?(i: number): string | null;
  /** Gear: what it would change for each hero who can use it (empty lines: no change; null lines: they're wearing it). */
  compare?(i: number): { name: string; color: string; lines: string[] | null }[];
  /** The party, shown beside the bag: faces, gauges and ailments (and picking who to use something on). */
  party?(): { name: string; color: string; portrait: string; level: number; hp: [number, number]; mp: [number, number]; ailments: { name: string; icon: string }[]; down?: boolean }[];
  /** Whoever uses the copy in slot i lets go of it (it stays in the bag). */
  takeOff?(i: number): string | null;
  /** Shards: where the shard in slot i can go (heroes, then weapons and armor), as keys for placeShard. */
  shardTargets?(i: number): { label: string; value: string; disabled?: boolean }[];
  placeShard?(i: number, key: string): string | null;
  /** Element stones: fusing them into the next kind ("Fuse 25 into a Fire Shard"), once or as many as there are. */
  fuseOptions?(i: number): { label: string; disabled?: boolean; all: boolean }[];
  fuse?(i: number, all: boolean): string | null;
  /** Shards tab: who holds a shard: each hero (readied), and armor and weapons with one set in them. */
  holders?(): ShardHolder[];
  /** What a holder's shard can be switched with (shards in the bag, other holders' shards), as `value`s for holderApply. */
  holderChoices?(key: string): { label: string; value: string; disabled?: boolean }[];
  /** Take a holder's shard out ('remove': back to the bag) or switch it (a value from holderChoices). */
  holderApply?(key: string, value: string): string | null;
}

/** One place a shard can be: a hero's readied spell, or set in a piece of armor or a weapon. */
export interface ShardHolder { group: 'hero' | 'armor' | 'weapon'; key: string; name: string; icon: string; shard: { id: string; name: string; icon: string } | null }

const COLS = 8;
/** The All tab shows at least this many cells (8 × 8), empty ones included. */
const ALL_CELLS = 64;

/** Which items a tab of the bag shows: everything (in its slots, empty ones too) or one kind. */
export type BagFilter = 'all' | 'consumable' | 'gear' | 'shard' | 'material' | 'key';
type Mode = { kind: 'grid' } | { kind: 'actions'; index: number; options: { label: string; run: () => void; disabled?: boolean }[] } | { kind: 'move'; from: number }
  /** Using something on someone: the cursor is on the party beside the bag. */
  | { kind: 'target'; index: number; disabled: boolean[]; run: (k: number) => void }
  /** An item just used from the pop-up: the bars fill, then a line saying what it did waits for OK. */
  | { kind: 'healed'; index: number; before: { hp: [number, number]; mp: [number, number] }[]; text: string; ready: boolean; done: () => void };

export class InventoryScreen {
  private readonly root = document.createElement('div');
  private sel = 0;
  private mode: Mode = { kind: 'grid' };
  /** Shards tab: the cursor is on the holder lists (heroes, armor, weapons) rather than the grid, and which. */
  private hfocus = false;
  private hsel = 0;
  private open = false;
  private message = '';
  private onClose: () => void = () => {};
  private tabs: TabGroup | undefined;
  private filter: BagFilter = 'all';

  constructor(parent: HTMLElement, private readonly input: Input, private readonly inv: () => Inventory, private readonly actions: InventoryActions,
    private readonly title: () => string) {
    this.root.className = 'inv';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.cancel(); } });
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  /** Open the bag, on one tab of the Inventory (`filter`: which items it shows). */
  show(onClose: () => void, tabs?: TabGroup, filter: BagFilter = 'all'): void {
    this.open = true;
    this.onClose = onClose;
    this.tabs = tabs;
    this.filter = filter;
    this.mode = { kind: 'grid' };
    this.message = '';
    const view = this.view();
    if (!view.includes(this.sel)) { const inv = this.inv(); this.sel = view.find((i) => inv.slots[i]) ?? view[0] ?? 0; }
    this.root.hidden = false;
    this.render();
  }

  /** Put away without closing the Inventory (another of its tabs is taking over). */
  hide(): void { this.open = false; this.root.hidden = true; }

  /** The Backpack (Update 141): the bag as a compact window at the bottom right, opened with B. */
  set compact(on: boolean) { this.root.classList.toggle('backpack', on); }
  get compact(): boolean { return this.root.classList.contains('backpack'); }
  /** Nothing picked (no item's actions or targets open): B closes the Backpack from here. */
  get atTop(): boolean { return this.mode.kind === 'grid' && !this.hfocus; }

  /** The slots this tab shows: its pocket, empty slots included (All: every item, pocket by pocket). */
  private view(): number[] {
    const inv = this.inv();
    if (this.filter === 'gear') {
      // Weapons and armor side by side, 4 columns each: row by row, the weapons' four then the armor's four.
      const w = inv.pocketSlots('weapon'), a = inv.pocketSlots('armor'), out: number[] = [];
      for (let r = 0; r * 4 < Math.max(w.length, a.length); r++) out.push(...w.slice(r * 4, r * 4 + 4), ...a.slice(r * 4, r * 4 + 4));
      return out;
    }
    if (this.filter !== 'all') return inv.pocketSlots(this.filter as Pocket);
    const out: number[] = [];
    inv.slots.forEach((st, i) => { if (st) out.push(i); });
    return out;
  }

  /** Draw again (after the equipment screen changed the bag). */
  refresh(): void { if (this.open) this.render(); }

  close(): void {
    this.open = false;
    this.root.hidden = true;
    this.onClose();
  }

  update(): void {
    if (!this.open) return;
    const i = this.input, m = this.mode;
    if (m.kind === 'healed') {
      if (m.ready && (i.confirm() || i.consume('cancel'))) { uiSound('menuOk'); m.done(); }
      return;
    }
    if (m.kind === 'target') {
      const n = m.disabled.length;
      const step = (d: number) => {
        let k = m.index;
        for (let c = 0; c < n; c++) { k = (k + d + n) % n; if (!m.disabled[k]) break; }
        if (k !== m.index) { m.index = k; uiSound('menuMove'); this.render(); }
      };
      if (i.consume('down') || i.consume('right')) step(1);
      if (i.consume('up') || i.consume('left')) step(-1);
      if (i.confirm()) { if (!m.disabled[m.index]) { uiSound('menuOk'); m.run(m.index); } return; }
      if (i.consume('cancel')) this.cancel();
      return;
    }
    if (m.kind === 'actions') {
      // Step over options that can't be picked, with the cursor sound.
      const step = (d: number) => {
        let k = m.index;
        for (let n = 0; n < m.options.length; n++) { k = (k + d + m.options.length) % m.options.length; if (!m.options[k].disabled) break; }
        if (k !== m.index) { m.index = k; uiSound('menuMove'); this.render(); }
      };
      if (i.consume('down')) step(1);
      if (i.consume('up')) step(-1);
      if (i.confirm()) { const o = m.options[m.index]; if (!o.disabled) { uiSound('menuOk'); o.run(); } return; }
      if (i.consume('cancel')) this.cancel();
      return;
    }
    if (tabKeys(i, this.tabs)) return;
    if (this.filter === 'shard' && this.hfocus && m.kind === 'grid') { this.updateHolders(); return; }
    const view = this.view(), n = view.length;
    // Shards tab: right from the grid's last column goes to the holder lists.
    if (this.filter === 'shard' && m.kind === 'grid' && (this.actions.holders?.().length ?? 0) && view.indexOf(this.sel) % COLS === COLS - 1 && i.consume('right')) {
      this.hfocus = true; uiSound('menuMove'); this.render(); return;
    }
    const go = (d: number) => {
      if (!n) return;
      const at = Math.max(0, view.indexOf(this.sel));
      this.sel = view[(at + d + n) % n]; uiSound('menuMove'); this.render();
    };
    if (i.consume('right')) go(1);
    if (i.consume('left')) go(-1);
    if (i.consume('down')) go(COLS);
    if (i.consume('up')) go(-COLS);
    // Y / R: every action for the item (move, drop…), equipment included.
    if (i.consume('switchWeapon')) { this.activate(true); return; }
    if (i.confirm()) this.activate();
    if (i.consume('cancel')) this.cancel();
  }

  /** The holder lists: ↑ ↓ through them, ← → between the columns (← from the first goes back to the grid), Space: options. */
  private updateHolders(): void {
    const i = this.input, hs = this.actions.holders?.() ?? [];
    if (!hs.length) { this.hfocus = false; this.render(); return; }
    this.hsel = Math.min(this.hsel, hs.length - 1);
    const groups: ShardHolder['group'][] = ['hero', 'armor', 'weapon'];
    const jump = (d: number) => {
      const g = groups.indexOf(hs[this.hsel].group);
      for (let k = g + d; k >= 0 && k < groups.length; k += d) { const at = hs.findIndex((x) => x.group === groups[k]); if (at >= 0) { this.hsel = at; return true; } }
      return false;
    };
    if (i.consume('cancel')) { this.hfocus = false; uiSound('menuBack'); this.render(); return; }
    if (i.consume('up')) { this.hsel = (this.hsel + hs.length - 1) % hs.length; uiSound('menuMove'); this.render(); return; }
    if (i.consume('down')) { this.hsel = (this.hsel + 1) % hs.length; uiSound('menuMove'); this.render(); return; }
    if (i.consume('right')) { if (jump(1)) { uiSound('menuMove'); this.render(); } return; }
    if (i.consume('left')) { if (!jump(-1)) this.hfocus = false; uiSound('menuMove'); this.render(); return; }
    if (i.confirm() || i.consume('switchWeapon')) this.holderMenu(hs[this.hsel]);
  }

  /** A holder picked: take its shard out, or switch it with one in the bag or another holder's. */
  private holderMenu(h: ShardHolder): void {
    uiSound('menuOk');
    const after = (msg: string | null) => { this.message = msg ?? ''; this.mode = { kind: 'grid' }; this.actions.changed(); this.render(); };
    const choices = this.actions.holderChoices?.(h.key) ?? [];
    const options: { label: string; run: () => void; disabled?: boolean }[] = [];
    if (h.shard) options.push({ label: `Take out ${h.shard.name} (back to the bag)`, run: () => after(this.actions.holderApply!(h.key, 'remove')) });
    for (const c of choices) options.push({ label: `${h.shard ? 'Switch with' : 'Use'} ${c.label}`, disabled: c.disabled, run: () => after(this.actions.holderApply!(h.key, c.value)) });
    if (!options.length) options.push({ label: h.group === 'hero' ? 'No shards to ready' : 'No elemental shards to set', disabled: true, run: () => {} });
    options.push({ label: 'Cancel', run: () => this.cancel() });
    this.mode = { kind: 'actions', index: Math.max(0, options.findIndex((o) => !o.disabled)), options };
    this.render();
  }

  private cancel(): void {
    uiSound('menuBack');
    if (this.mode.kind !== 'grid') { this.mode = { kind: 'grid' }; this.message = ''; this.render(); return; }
    this.close();
  }

  /** OK on a slot: equipment opens the equipment screen; anything else (or `all`) opens its actions. */
  private activate(all = false): void {
    uiSound('menuOk');
    const inv = this.inv(), m = this.mode;
    if (m.kind === 'move') {
      if (!inv.move(m.from, this.sel)) { this.message = 'Things stay in their own tab.'; uiSound('menuBack'); this.mode = { kind: 'grid' }; this.render(); return; }
      this.mode = { kind: 'grid' };
      this.actions.changed();
      this.render();
      return;
    }
    const s = inv.slots[this.sel];
    if (!s) return;
    const def = inv.def(s.id);
    // Shards (any tab): Space chooses where it goes: a hero (readied as their spell) or a weapon or armor.
    if (!all && def?.slot === 'magic' && this.actions.shardTargets) { this.shardWhere(); return; }
    // Element stones: wear one (a hero's Primary or Secondary Element slot), or fuse them.
    if (def?.essence && this.actions.shardTargets) { this.shardWhere(); return; }
    if (!all && this.filter === 'shard' && def?.slot === 'magic') {
      const who = this.actions.readyTargets?.(this.sel) ?? [];
      if (who.length > 1) { this.readyFor(who); return; }
      this.message = (this.actions.ready ? this.actions.ready(this.sel, 0) : this.actions.equip(this.sel)) ?? ''; this.actions.changed(); this.render(); return;
    }
    // Weapons, armour and arrows: put on (choosing who, with a party).
    if (!all && this.actions.equipOn && (def?.kind === 'equipment' || def?.kind === 'ammo')) { this.equipWho(); return; }
    if (!all && this.actions.openEquip && (def?.kind === 'equipment' || def?.kind === 'ammo')) {
      this.actions.openEquip({ slot: def.kind === 'ammo' ? 'ammo' : def.slot ?? 'accessory', item: s.id });
      return;
    }
    const options: { label: string; run: () => void; disabled?: boolean }[] = [];
    const after = (msg: string | null) => { this.message = msg ?? ''; this.mode = { kind: 'grid' }; this.actions.changed(); this.render(); };
    const who = def?.kind === 'consumable' ? this.actions.targets?.(this.sel) ?? [] : [];
    // With the party beside the bag, Space on a consumable goes straight to picking who it's for.
    if (!all && who.length > 1 && this.actions.party) { this.useOn(who, after); return; }
    if (def?.kind === 'consumable') options.push(who.length > 1
      ? { label: 'Use on…', run: () => this.useOn(who, after) }
      : { label: this.actions.useWarning?.(this.sel) ?? 'Use', run: () => after(this.actions.use(this.sel)) });
    // Consumables and key items with a use (Update 132: key items go on the D-pad's quick slots too).
    const quickable = def?.kind === 'consumable' || !!def?.tool || (!!def?.field && !carriedUse(def.field.use));
    // Key items with a field use: switch on and off.
    if ((def?.tool || def?.exp?.all) && this.actions.toggleTool) {
      const on = this.actions.toolOn?.(this.sel) ?? false;
      options.push({ label: on ? 'Turn off' : 'Turn on', run: () => after(this.actions.toggleTool!(this.sel)) });
    }
    // Other field uses (Update 118): Use (carried ones just work; Cut and Bow are used from a quick slot).
    if (def?.field && !carriedUse(def.field.use) && def.field.use !== 'cut' && def.field.use !== 'bow' && this.actions.toggleTool) {
      options.push({ label: FIELD_USE_NAMES[def.field.use], run: () => after(this.actions.toggleTool!(this.sel)) });
    }
    if (quickable && def) options.push({ label: inv.quick.includes(s.id) ? 'Quick slot… (assigned)' : 'Quick slot…', run: () => this.quickMenu(s.id, def.name, after) });
    // A Saddle: send the rented horse home (so another can be rented).
    if (def?.saddle && this.actions.toggleTool) options.push({ label: 'Send your horse home', run: () => after(this.actions.toggleTool!(this.sel)) });
    // In use: let go of it (it stays in the bag).
    const user = this.actions.usedBy?.(this.sel);
    if (user && this.actions.takeOff) options.push({ label: user.startsWith('In ') ? `Take it out of ${user.slice(3)}` : `Take it off ${user}`, run: () => after(this.actions.takeOff!(this.sel)) });
    if (def?.slot === 'magic' && this.actions.shardTargets) options.push({ label: 'Equip or set in…', run: () => this.shardWhere() });
    else if (def?.slot === 'magic') {
      // Shards: ready one as a spell, or set it in a weapon or armor.
      const who = this.actions.readyTargets?.(this.sel) ?? [];
      options.push(who.length > 1 ? { label: 'Ready for…', run: () => this.readyFor(who) } : { label: 'Ready as your spell', run: () => after(this.actions.ready ? this.actions.ready(this.sel, 0) : this.actions.equip(this.sel)) });
      const spots = this.actions.shardSpots?.(s.id);
      if (spots) options.push({ label: 'Set in gear…', disabled: !spots.length, run: () => this.setIn(s.id, spots, after) });
    } else if ((def?.kind === 'equipment' || def?.kind === 'ammo') && this.actions.equipOn) options.push({ label: 'Equip…', run: () => this.equipWho() });
    else if (def?.kind === 'equipment' || def?.kind === 'ammo') options.push({ label: 'Equip…', run: () => { this.mode = { kind: 'grid' }; this.render(); this.actions.openEquip ? this.actions.openEquip({ slot: def.kind === 'ammo' ? 'ammo' : def.slot ?? 'accessory', item: s.id }) : after(this.actions.equip(this.sel)); } });
    const set = def?.kind === 'equipment' && def.slot !== 'magic' ? this.actions.shardIn?.(s.id) : null;
    if (set && this.actions.setShard) options.push({ label: `Take out ${set.name}`, run: () => after(this.actions.setShard!(s.id, null)) });
    if (def?.kind === 'ammo') options.push({ label: inv.ammo === s.id ? 'Nocked (in use)' : 'Nock these arrows', disabled: inv.ammo === s.id, run: () => { inv.ammo = s.id; after(`Shooting ${def.name} now.`); } });
    if (this.filter === 'all') options.push({ label: 'Move (in its own tab)', disabled: true, run: () => {} });
    else options.push({ label: 'Move', run: () => { this.mode = { kind: 'move', from: this.sel }; this.message = 'Choose where to put it (any slot in this tab).'; this.render(); } });
    // Nothing is thrown away: it's put down on the ground, where it can be picked up again.
    if (def?.kind !== 'key' && !inv.infinite(s.id) && this.actions.drop && user && def?.kind === 'equipment') options.push({ label: 'Drop (take it off first)', disabled: true, run: () => {} });
    else if (def?.kind !== 'key' && !inv.infinite(s.id) && this.actions.drop) {
      if (s.n > 1) options.push({ label: 'Drop one', run: () => after(this.actions.drop!(this.sel, 1)) });
      options.push({ label: s.n > 1 ? `Drop all (${s.n})` : 'Drop', run: () => after(this.actions.drop!(this.sel, s.n)) });
    }
    options.push({ label: 'Cancel', run: () => this.cancel() });
    this.mode = { kind: 'actions', index: 0, options };
    this.render();
  }

  /** A shard: choose who readies it, or which weapon or armor it's set in. */
  private shardWhere(): void {
    const i = this.sel, list = this.actions.shardTargets?.(i) ?? [];
    const after = (msg: string | null) => { this.message = msg ?? ''; this.mode = { kind: 'grid' }; this.actions.changed(); this.render(); };
    const options: { label: string; run: () => void; disabled?: boolean }[] = list.map((t) => ({ label: t.label, disabled: t.disabled, run: () => after(this.actions.placeShard!(i, t.value)) }));
    for (const f of this.actions.fuseOptions?.(i) ?? []) options.push({ label: f.label, disabled: f.disabled, run: () => after(this.actions.fuse!(i, f.all)) });
    const user = this.actions.usedBy?.(i);
    if (user && this.actions.takeOff) options.unshift({ label: user.startsWith('In ') ? `Take it out of ${user.slice(3)}` : `Take it off ${user}`, run: () => after(this.actions.takeOff!(i)) });
    options.push({ label: 'Cancel', run: () => this.cancel() });
    this.mode = { kind: 'actions', index: Math.max(0, options.findIndex((o) => !o.disabled)), options };
    this.render();
  }

  /** Put on the selected equipment: straight away for the hero alone, or choosing who (those who can't are greyed out). */
  private equipWho(): void {
    const i = this.sel, who = this.actions.equipTargets?.(i) ?? [];
    const after = (msg: string | null) => { this.message = msg ?? ''; this.mode = { kind: 'grid' }; this.actions.changed(); this.render(); };
    if (who.length < 2 && !this.actions.usedBy?.(i)) { after(this.actions.equipOn!(i, 0)); return; }
    const options: { label: string; run: () => void; disabled?: boolean }[] = who.length ? who.map((w, k) => ({ label: `Equip on ${w.label}`, disabled: w.disabled, run: () => after(this.actions.equipOn!(i, k)) })) : [{ label: 'Equip', run: () => after(this.actions.equipOn!(i, 0)) }];
    // Worn by someone: take it off them (Update 125), so it can be worn by no one.
    const user = this.actions.usedBy?.(i);
    if (user && this.actions.takeOff) options.push({ label: `Unequip (take it off ${user})`, run: () => after(this.actions.takeOff!(i)) });
    options.push({ label: 'Cancel', run: () => this.cancel() });
    this.mode = { kind: 'actions', index: Math.max(0, options.findIndex((o) => !o.disabled)), options };
    this.render();
  }

  /** Ready a shard: for whom (the hero or a party member). */
  private readyFor(who: { label: string; disabled?: boolean }[]): void {
    const i = this.sel;
    const after = (msg: string | null) => { this.message = msg ?? ''; this.mode = { kind: 'grid' }; this.actions.changed(); this.render(); };
    const options: { label: string; run: () => void; disabled?: boolean }[] = who.map((w, k) => ({ label: w.label, disabled: w.disabled, run: () => after(this.actions.ready!(i, k)) }));
    options.push({ label: 'Cancel', run: () => this.cancel() });
    this.mode = { kind: 'actions', index: Math.max(0, options.findIndex((o) => !o.disabled)), options };
    this.render();
  }

  /** Set a shard in a weapon or armor (one that has a shard already gets this one instead; that one comes back). */
  private setIn(shard: string, spots: { gear: string; label: string; detail?: string; disabled?: boolean }[], after: (msg: string | null) => void): void {
    const options: { label: string; run: () => void; disabled?: boolean }[] = spots.map((p) => ({
      label: p.detail ? `${p.label} · ${p.detail}` : p.label, disabled: p.disabled, run: () => after(this.actions.setShard!(p.gear, shard)),
    }));
    options.push({ label: 'Cancel', run: () => this.cancel() });
    this.mode = { kind: 'actions', index: Math.max(0, options.findIndex((o) => !o.disabled)), options };
    this.render();
  }

  /** Use: who on (the hero or a party member). */
  private useOn(who: { label: string; disabled?: boolean }[], after: (msg: string | null) => void): void {
    const i = this.sel;
    // With the party beside the bag: pick who on it (their bars fill as it's used).
    if (this.actions.party) {
      const disabled = who.map((w) => !!w.disabled);
      this.message = this.actions.useWarning?.(i) ? 'Careful: you’re a zombie, healing hurts you.' : '';
      this.mode = { kind: 'target', index: Math.max(0, disabled.indexOf(false)), disabled, run: (k) => {
        const before = (this.actions.party?.() ?? []).map((x) => ({ hp: [...x.hp] as [number, number], mp: [...x.mp] as [number, number] }));
        const id = this.inv().slots[i]?.id, had = id ? this.inv().count(id) : 0;
        const msg = this.actions.use(i, k);
        // Not used (it would do nothing, or can't help them): say why and stay on the choice.
        if (!id || this.inv().count(id) >= had) { this.message = msg ?? ''; this.render(); return; }
        this.actions.changed();
        const now = (this.actions.party?.() ?? [])[k], was = before[k];
        const name = this.actions.party?.()[k]?.name ?? '';
        const hp = now && was ? Math.round(now.hp[0] - was.hp[0]) : 0, mp = now && was ? Math.round(now.mp[0] - was.mp[0]) : 0;
        const text = hp > 0 && was && was.hp[0] <= 0 ? `${name} is back on their feet with ${Math.round(now!.hp[0])} HP!`
          : hp > 0 || mp > 0 ? `${name} recovered ${[hp > 0 ? `${hp} HP` : '', mp > 0 ? `${mp} MP` : ''].filter(Boolean).join(' and ')}!` : msg ?? '';
        this.mode = { kind: 'healed', index: k, before, text, ready: false, done: () => after(null) };
        this.render();
        this.playHeal();
      } };
      this.render();
      return;
    }
    const options: { label: string; run: () => void; disabled?: boolean }[] = who.map((w, k) => ({
      label: k === 0 ? this.actions.useWarning?.(i)?.replace(/^Use/, w.label) ?? w.label : w.label, disabled: w.disabled,
      run: () => after(this.actions.use(i, k)),
    }));
    options.push({ label: 'Cancel', run: () => this.cancel() });
    this.mode = { kind: 'actions', index: 0, options };
    this.render();
  }

  /** Put an item on a quick slot (or take it off). */
  private quickMenu(id: string, name: string, after: (msg: string | null) => void): void {
    const inv = this.inv(), dirs = ['←', '↑', '→', '↓'];
    const options: { label: string; run: () => void; disabled?: boolean }[] = inv.quick.map((cur, k) => ({
      label: `${dirs[k]} ${this.actions.quickLabel?.(k) ?? ''}: ${cur === id ? `${name} (here)` : cur ? `replace ${inv.def(cur)?.name ?? cur}` : 'empty'}`.replace(/\s+:/, ':'),
      disabled: cur === id,
      run: () => { inv.quick = inv.quick.map((q, j) => (j === k ? id : q === id ? null : q)); after(`${name} is on quick slot ${dirs[k]}.`); },
    }));
    if (inv.quick.includes(id)) options.push({ label: 'Take it off the quick slots', run: () => { inv.quick = inv.quick.map((q) => (q === id ? null : q)); after(`${name} is off the quick slots.`); } });
    options.push({ label: 'Cancel', run: () => this.cancel() });
    this.mode = { kind: 'actions', index: 0, options };
    this.render();
  }

  /** The Shards tab's holder lists, side by side: heroes (readied), in armor, in weapons. */
  private holderLists(): string {
    const hs = this.actions.holders?.() ?? [];
    if (!hs.length) return '';
    const col = (g: ShardHolder['group'], title: string) => {
      const rows = hs.map((h, k) => ({ h, k })).filter(({ h }) => h.group === g);
      return `<div class="sh-col"><div class="sh-title">${title}</div>${rows.length ? rows.map(({ h, k }) => `<button type="button" class="sh-row${this.hfocus && k === this.hsel ? ' sel' : ''}${h.shard ? '' : ' empty'}" data-h="${k}" title="${esc(h.name)}${h.shard ? `: ${esc(h.shard.name)}` : ''}">
          <img class="sh-who" src="${h.icon}" alt=""><span class="sh-name">${esc(h.name)}</span>${h.shard ? `<img class="sh-shard" src="${h.shard.icon}" alt="${esc(h.shard.name)}">` : '<span class="sh-none">—</span>'}</button>`).join('') : `<p class="sh-empty">${g === 'armor' ? 'No armor with a shard' : 'No weapon with a shard'}</p>`}</div>`;
    };
    return `<div class="sh-lists${this.hfocus ? ' focus' : ''}">${col('hero', 'Heroes')}${col('armor', 'In armor')}${col('weapon', 'In weapons')}</div>`;
  }


  /**
   * Using an item: who on, in a pop-up over the bag like the battle's (the lead in gold at the top, then the rest),
   * each with their level, HP (and numbers) and MP. Only shown while choosing.
   */
  private partyPanel(): string {
    const live = this.actions.party?.() ?? [], m = this.mode;
    if (!live.length || (m.kind !== 'target' && m.kind !== 'healed')) return '';
    // Just used: drawn with the numbers from before, then filled up to the new ones (playHeal).
    const list = m.kind === 'healed' && !m.ready ? live.map((x, k) => ({ ...x, hp: m.before[k]?.hp ?? x.hp, mp: m.before[k]?.mp ?? x.mp, down: (m.before[k]?.hp[0] ?? x.hp[0]) <= 0 && x.down })) : live;
    const dis = m.kind === 'target' ? m.disabled : [];
    const pct = ([v, max]: [number, number]) => Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100));
    const tier = (hp: [number, number]) => { const f = hp[0] / Math.max(1, hp[1]); return f <= 0.2 ? ' low' : f <= 0.5 ? ' mid' : ''; };
    const def = this.inv().def(this.inv().slots[this.sel]?.id ?? '');
    return `<div class="ip-pop" role="dialog" aria-label="Use on whom?"><div class="ip-pop-box">
      <h4>Use ${esc(def?.name ?? 'it')} on whom?</h4>
      ${list.map((x, k) => `<button type="button" class="ip-row${m.index === k ? ' sel' : ''}${k === 0 ? ' lead' : ''}${x.down ? ' down' : ''}" data-pc="${k}" ${dis[k] ? 'disabled' : ''} style="--hero:${x.color}">
        <img class="ip-face" src="${x.portrait}" alt="">
        <span class="ip-main"><span class="ip-name"><b>${esc(x.name)}</b><span class="lv-pill" style="color:#3a2200">Lv ${x.level}</span>${x.down ? '<span class="st-pill" style="background:#5a5a68;color:#f4f4fa">KO</span>' : ''}${x.ailments.map((a) => `<img class="ip-ail" src="${a.icon}" alt="${esc(a.name)}" title="${esc(a.name)}">`).join('')}</span>
        <span class="ip-line"><span class="ip-k">HP</span><span class="ip-bar hp${tier(x.hp)}"><i style="width:${pct(x.hp)}%"></i></span><span class="ip-num" data-g="hp">${Math.round(x.hp[0])} / ${Math.round(x.hp[1])}</span></span>
        <span class="ip-line"><span class="ip-k">MP</span><span class="ip-bar mp"><i style="width:${pct(x.mp)}%"></i></span><span class="ip-num" data-g="mp">${Math.round(x.mp[0])} / ${Math.round(x.mp[1])}</span></span></span>
      </button>`).join('')}
      ${m.kind === 'healed' ? `<div class="ip-said${m.ready ? ' ready' : ''}">${esc(m.ready ? m.text : '')}<span class="ip-next">▼</span></div>` : '<div class="ip-hint">↑ ↓ choose · Space: use · Esc: back</div>'}</div></div>`;
  }

  /** The used-on hero's bars fill to their new numbers (the numbers counting up), then the line appears. */
  private playHeal(): void {
    const m = this.mode;
    if (m.kind !== 'healed') return;
    const row = this.root.querySelectorAll<HTMLElement>('.ip-row')[m.index], now = (this.actions.party?.() ?? [])[m.index], was = m.before[m.index];
    const finish = () => { if (this.mode === m) { m.ready = true; this.render(); } };
    if (!row || !now || !was) { finish(); return; }
    row.classList.remove('down');
    const T = 700, t0 = performance.now();
    const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / Math.max(1, max)) * 100))}%`;
    const tick = () => {
      if (this.mode !== m) return;
      const f = Math.min(1, (performance.now() - t0) / T), e = 1 - (1 - f) * (1 - f);
      for (const g of ['hp', 'mp'] as const) {
        const v = was[g][0] + (now[g][0] - was[g][0]) * e;
        const bar = row.querySelector<HTMLElement>(`.ip-bar.${g} i`), num = row.querySelector<HTMLElement>(`.ip-num[data-g="${g}"]`);
        if (bar) { bar.style.transition = 'none'; bar.style.width = pct(v, now[g][1]); }
        if (num) num.textContent = `${Math.round(v)} / ${Math.round(now[g][1])}`;
      }
      if (f < 1) requestAnimationFrame(tick); else setTimeout(finish, 150);
    };
    requestAnimationFrame(tick);
  }

  /** Gear: what it would change for each hero who can use it. */
  private compareBlock(): string {
    const rows = this.actions.compare?.(this.sel) ?? [];
    if (!rows.length) return '';
    return `<div class="inv-compare">${rows.map((r) => `<div class="ic-row"><span class="ic-who" style="--hero:${r.color}">${esc(r.name)}</span><span class="ic-lines">${r.lines === null ? '<em>equipped</em>'
      : r.lines.length ? r.lines.map((l) => `<span class="${l.startsWith('−') ? 'down' : 'up'}">${esc(l)}</span>`).join('') : '<em>no change</em>'}</span></div>`).join('')}</div>`;
  }

  private render(): void {
    const inv = this.inv(), m = this.mode;
    // On the holder lists, the details are of the shard the chosen holder has.
    const held = this.filter === 'shard' && this.hfocus ? (this.actions.holders?.() ?? [])[this.hsel]?.shard : null;
    const s = held ? { id: held.id, n: 1 } : this.filter === 'shard' && this.hfocus ? null : inv.slots[this.sel], def = s ? inv.def(s.id) : undefined;
    const view = this.view();
    const cells = this.filter === 'all' ? [...view, ...new Array(Math.max(0, Math.ceil(Math.max(ALL_CELLS, view.length) / COLS) * COLS - view.length)).fill(-1)] : view;
    const grid = cells.map((i) => {
      if (i < 0) return '<span class="inv-slot blank" aria-hidden="true"></span>';
      const st = inv.slots[i];
      const d = st ? inv.def(st.id) : undefined;
      const cls = ['inv-slot', i === this.sel && !(this.filter === 'shard' && this.hfocus) ? 'sel' : '', m.kind === 'move' && m.from === i ? 'moving' : '', itemColor(d) ? 'rar' : ''].join(' ');
      const rar = itemColor(d);
      return `<button type="button" class="${cls}"${rar ? ` style="--rarity:${rar}"` : ''} data-i="${i}" aria-label="${d ? esc(d.name) + (st!.n > 1 ? ' × ' + st!.n : '') : 'Empty slot'}">${
        d ? `<img src="${this.actions.icon(st!.id)}" alt=""${d.enchanted ? ` style="filter:drop-shadow(0 0 3px ${ELEMENT_COLORS[d.enchanted]})"` : ''}>${inv.infinite(st!.id) ? '<span class="inv-n">∞</span>' : st!.n > 1 ? `<span class="inv-n">${st!.n}</span>` : ''}${
          (() => {
            if (d.kind === 'ammo' && inv.arrow() === st!.id) return '<span class="inv-tag">equipped</span>';
            const u = this.actions.usedBy?.(i);
            if (!u) return '';
            const c = this.actions.usedColor?.(i);
            return `<span class="inv-tag"${c ? ` style="background:${c}"` : ''} title="${esc(u.startsWith('In ') ? `Set in ${u.slice(3)}` : `Equipped by ${u}`)}">${u.startsWith('In ') ? 'set' : 'equipped'}</span>`;
          })()}${
          inv.quick.includes(st!.id) ? `<span class="inv-quick" title="Quick slot">${['←', '↑', '→', '↓'][inv.quick.indexOf(st!.id)]}</span>` : ''}` : ''}</button>`;
    }).join('');
    const color = itemColor(def), rarity = rarityOf(def);
    const info = def ? `<div class="inv-name"${color ? ` style="color:${color}"` : ''}>${esc(def.name)}${rarity ? ` <span class="inv-rarity" style="color:${color}">${RARITY_NAMES[rarity]}</span>` : ''}</div><div class="inv-kind">${kindLine(def)}</div>${def.description ? `<div class="inv-desc">${esc(def.description)}</div>` : ''}`
      : `<div class="inv-desc empty">${this.filter === 'shard' && this.hfocus ? 'No shard here: Space to ready or set one' : 'Empty slot'}</div>`;
    const actions = m.kind === 'actions'
      ? `<div class="inv-actions" role="listbox">${m.options.map((o, k) => `<button type="button" class="menu-item" data-a="${k}" aria-selected="${k === m.index}" ${o.disabled ? 'disabled' : ''}><span class="menu-label">${esc(o.label)}</span></button>`).join('')}</div>` : '';
    this.root.innerHTML = `${this.partyPanel()}<div class="inv-box">
      <div class="inv-head"><span class="menu-title">${esc(this.title())}</span>${this.actions.openEquip && !this.tabs ? '<button type="button" class="btn-link inv-equip">Equipment</button>' : ''}<span class="inv-gold">${COIN_SVG}${inv.gold.toLocaleString()} G</span></div>
      ${tabStrip(this.tabs)}
      <div class="inv-main">
        ${this.filter === 'gear' ? `<div class="inv-gearwrap"><div class="inv-gearhead"><span>Weapons</span><span>Armor</span></div><div class="inv-grid gear-split" style="--cols:${COLS}">${grid}</div></div>` : `<div class="inv-grid" style="--cols:${COLS}">${grid}</div>`}
        <div class="inv-side">
          <div class="inv-info">${info}${(() => { const u = s && !(this.filter === 'shard' && this.hfocus) ? this.actions.usedBy?.(this.sel) : null; return u ? `<div class="inv-set inv-who">${u.startsWith('In ') ? `Set in <b>${esc(u.slice(3))}</b>` : `Equipped by <b>${esc(u)}</b>`}</div>` : ''; })()}${def && def.kind === 'equipment' && def.slot !== 'magic' ? (() => { const sh = this.actions.shardIn?.(s!.id); return sh ? `<div class="inv-set"><img src="${sh.icon}" alt=""> Enchanted with <b>${esc(sh.name)}</b></div>` : ''; })() : ''}${s && !(this.filter === 'shard' && this.hfocus) ? this.compareBlock() : ''}</div>
          ${this.compact ? '' : actions}
          <div class="inv-msg">${esc(this.message)}</div>
          ${this.filter === 'shard' ? this.holderLists() : ''}
        </div>
      </div>
      <div class="menu-note">${this.filter === 'shard' && this.hfocus ? '↑ ↓ ← → choose · Space: take out or switch · Esc: back to the shards'
        : `Arrows move${this.filter === 'shard' && this.actions.holders ? ' (→ past the last column: who holds shards)' : ''} · Space: ${this.filter === 'shard' ? 'ready a spell, wear an element stone, or fuse stones' : this.filter === 'gear' ? 'equip (choose who)' : 'use / equip'} · ${esc(this.input.label('switchWeapon'))}: more (${this.filter === 'gear' || this.filter === 'shard' ? 'take off, ' : ''}move, drop)${this.tabs ? ` · ${esc(this.tabs.keys[0])} / ${esc(this.tabs.keys[1])}: tabs` : ''} · Esc: back`}</div>
    </div>${this.compact ? actions : ''}`;
    wireTabs(this.root, this.tabs);
    this.root.querySelector('.inv-slot.sel')?.scrollIntoView({ block: 'nearest' });
    this.root.querySelector('.inv-equip')?.addEventListener('click', () => this.actions.openEquip?.());
    this.root.querySelectorAll<HTMLButtonElement>('.inv-slot').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.i);
      this.hfocus = false;
      if (this.mode.kind === 'actions') this.mode = { kind: 'grid' };
      if (this.sel === i || this.mode.kind === 'move') { this.sel = i; this.activate(); } else { this.sel = i; this.render(); }
    }));
    this.root.querySelectorAll<HTMLButtonElement>('.sh-row').forEach((b) => b.addEventListener('click', () => {
      const k = Number(b.dataset.h), hs = this.actions.holders?.() ?? [];
      if (this.hfocus && this.hsel === k && hs[k]) { this.holderMenu(hs[k]); return; }
      this.hfocus = true; this.hsel = k; this.mode = { kind: 'grid' }; uiSound('menuMove'); this.render();
    }));
    this.root.querySelectorAll<HTMLElement>('[data-pc]').forEach((b) => b.addEventListener('click', () => {
      const mm = this.mode, k = Number(b.dataset.pc);
      if (mm.kind === 'target' && !mm.disabled[k]) { if (mm.index === k) { uiSound('menuOk'); mm.run(k); } else { mm.index = k; uiSound('menuMove'); this.render(); } }
      else if (mm.kind === 'healed' && mm.ready) { uiSound('menuOk'); mm.done(); }
    }));
    this.root.querySelector<HTMLElement>('.ip-said')?.addEventListener('click', () => { const mm = this.mode; if (mm.kind === 'healed' && mm.ready) { uiSound('menuOk'); mm.done(); } });
    this.root.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const mm = this.mode;
      if (mm.kind === 'actions') { const o = mm.options[Number(b.dataset.a)]; if (!o.disabled) { uiSound('menuOk'); o.run(); } }
    }));
  }
}

/**
 * Warmth (Update 137): how much an item warms (+, orange) or cools (−, blue) whoever uses it, as a coloured number;
 * the further from 0, the stronger the colour.
 */
export function warmthHtml(d: ItemDef): string {
  const w = d.warms ?? 0;
  if (!w) return '';
  const k = Math.min(1, Math.abs(w) / 100), c = w > 0 ? [255, 138, 58] : [74, 168, 255], base = [210, 210, 210];
  const col = `rgb(${base.map((b, i) => Math.round(b + (c[i] - b) * (0.45 + 0.55 * k))).join(',')})`;
  return ` · <span class="warmth" title="${w > 0 ? 'Warms' : 'Cools'} whoever uses it">Warmth <b style="color:${col}">${w > 0 ? '+' : '−'}${Math.abs(w)}</b></span>`;
}

function kindLine(d: ItemDef): string {
  if (d.kind === 'key') return `Key item${d.tool ? ` · ${POWER_NAMES[d.tool]} (switch on and off here, or put it on a quick slot)` : d.exp?.all ? ` · EXP All: those sitting a battle out get ${d.exp.share}% (switch on and off here)` : d.saddle ? ' · Saddle: sends your rented horse home' : d.field ? ` · ${FIELD_USE_NAMES[d.field.use]}${carriedUse(d.field.use) ? ' (works while carried)' : ' (use it here, or put it on a quick slot)'}` : ''}`;
  if (d.kind === 'material') return `Loot${d.fuel ? ` · fire fuel +${d.fuel} h` : ''}${d.smelt ? ' · smelt it at a forge' : ''}`;
  if (d.kind === 'ammo') return `Arrows${d.element && d.element !== 'neutral' ? ` · ${ELEMENT_NAMES[d.element]}` : ''} · +${d.ammo?.damage ?? 0} damage${d.ammo?.infinite ? ' · never run out' : ''}`;
  if (d.kind === 'equipment') {
    const slot = { weapon: 'Weapon', shield: 'Shield', ranged: 'Bow', magic: 'Spell shard', armor: 'Armor', accessory: 'Accessory' }[d.slot ?? 'accessory'];
    const w = d.weapon ? ` · ${d.weapon.class === 'bow' ? 'bow' : d.weapon.class} · ${d.weapon.damage} damage` : '';
    const def = d.defense ? ` · +${d.defense} defence` : '';
    const f = d.spell?.power ? d.spell : null;
    const power = f ? ` · ${POWER_NAMES[f.power!]} (on and off)${f.mp ? ` · ${f.mp} MP to start` : ''}${f.mpPerSecond ? ` · ${f.mpPerSecond} MP/s` : ''}` : '';
    const sp = d.spell && !f ? ` · ${d.spell.damage} damage · ${d.spell.mp} MP a cast` : '';
    const mdef = d.magicDefense ? ` · +${d.magicDefense} magic defence` : '';
    const bonus = ATTRS.filter((k) => d.bonus?.[k]).map((k) => ` · ${d.bonus![k]! > 0 ? '+' : '−'}${Math.abs(d.bonus![k]!)} ${ATTR_INFO[k].short}`).join('');
    const crit = d.crit ? ` · ${d.crit > 0 ? '+' : '−'}${Math.abs(d.crit)}% crit` : '';
    const el = d.element && d.element !== 'neutral' ? ` · ${ELEMENT_NAMES[d.element]}` : '';
    const inf = d.inflicts?.length ? ` · ${d.inflicts.map((f) => `${f.chance}% ${AILMENT_INFO[f.ailment].name.toLowerCase()}`).join(', ')}` : '';
    const prot = d.protects?.length ? ` · wards off ${d.protects.map((a) => AILMENT_INFO[a].name.toLowerCase()).join(', ')}` : '';
    const ward = d.wards?.length ? ` · halves ${d.wards.map((e) => ELEMENT_NAMES[e].toLowerCase()).join(', ')} damage` : '';
    const mines = d.mines ? ' · breaks rock' : '';
    return `Equipment · ${slot}${el}${w}${def}${mdef}${power}${sp}${bonus}${crit}${inf}${prot}${ward}${mines}`;
  }
  const parts = restoreBits(d);
  if (d.cures?.length) parts.push(`cures ${d.cures.map((c) => (c === 'all' ? 'all ailments' : AILMENT_INFO[c].name)).join(', ')}`);
  for (const b of d.buffs ?? []) parts.push(`${BUFF_INFO[b.buff].name} +${b.amount ?? BUFF_INFO[b.buff].amount}${BUFF_INFO[b.buff].unit} for ${b.seconds ?? BUFF_INFO[b.buff].seconds}s`);
  return `Consumable${parts.length ? ' · ' + parts.join(', ') : ''}${warmthHtml(d)}`;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
