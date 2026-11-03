/**
 * Mimas: the GBA game's menus, as the Pokémon games had them on the Game Boy and GBA.
 *
 *   START  a list down the right side: PARTY, BAG, <the hero> (money and play time), SAVE, EXIT.
 *   PARTY  one line each (name, level, health bar): SUMMARY, MOVES, EQUIP, SWITCH.
 *   BAG    pockets (ITEMS, GEAR, KEY ITEMS: left / right), each item's icon, name and ×n: USE / EQUIP, TOSS.
 *   SHOP   BUY / SELL / QUIT, with the money in the corner and "how many?".
 *   MOVES  four at most. Learning a fifth asks which to forget (or, with the Database's Equip option, which to
 *          move off the four: nothing is forgotten, and the four are chosen here).
 */
import { builtinIcon, builtinIconName } from '../art/itemIcons';
import { ATTR_INFO, ATTRS } from '../game/attributes';
import { xpToNext, type CombatConfig } from '../game/combat/config';
import type { Inventory } from '../game/inventory';
import type { Database, EquipSlot, ItemDef } from '../world/types';
import { battleNumbers, canWear, maxOf, memberTrees, moveInfo, moveList, nodeState, takeNode, type Member } from './party';
import { findClass } from '../game/abilities';
import { skillsData } from '../game/skills';
import type { ClassDef } from '../world/types';
import type { GbaUi, Row } from './ui';
import type { TextVars } from '../gba/text';

export interface MenuHost {
  db: Database;
  cfg: CombatConfig;
  ui: GbaUi;
  party: Member[];
  inventory: Inventory;
  items: Map<string, ItemDef>;
  /** A file path in the project as a URL (imported icons). */
  url(path: string): string;
  /** A hero's little picture (party list). */
  face(m: Member): string | undefined;
  sound(name: string): void;
  /** Write the save; false if it couldn't. */
  save(): boolean;
  playTime(): number;
  /** A line in the game's own words (Database → Text & dialog), filled in. */
  t(key: string, vars?: TextVars): string;
  /** Close the game (EXIT on the menu does nothing; this is the playtest's Stop). */
}

const SLOT_NAMES: [EquipSlot, string][] = [['weapon', 'WEAPON'], ['shield', 'SHIELD'], ['armor', 'ARMOR'], ['accessory', 'ACCESSORY']];

type Pocket = 'items' | 'gear' | 'key';
const POCKETS: [Pocket, string][] = [['items', 'ITEMS'], ['gear', 'GEAR'], ['key', 'KEY ITEMS']];
const pocketOf = (d: ItemDef): Pocket => (d.slot ? 'gear' : d.kind === 'key' ? 'key' : 'items');

export class Menus {
  constructor(private readonly h: MenuHost) {}

  private get ui(): GbaUi { return this.h.ui; }

  icon(d: ItemDef | undefined): string | undefined {
    if (!d) return undefined;
    const b = builtinIconName(d.icon);
    if (b) return builtinIcon(b, d.iconTint).toDataURL();
    if (d.icon === 'sprite' || !d.icon) return builtinIcon(d.slot === 'ranged' ? 'bow' : d.slot === 'shield' ? 'shield' : d.slot ? 'sword' : 'potion').toDataURL();
    return this.h.url(d.icon);
  }

  money(): string { return `$${this.h.inventory.gold.toLocaleString()}`; }

  /* ------------------------------------------------------------------ START */

  async start(): Promise<void> {
    const h = this.h, hero = h.party[0];
    const rows = (): Row[] => [
      { label: h.t('menu.party'), detail: 'Check and organize your party.', disabled: !h.party.length },
      { label: h.t('menu.bag'), detail: 'Items, gear and key items you carry.' },
      { label: h.t('menu.skills'), detail: 'Spend skill points in the skill trees.', disabled: !h.party.length },
      { label: (hero?.def.name ?? 'HERO').toUpperCase(), detail: 'Your money and play time.' },
      { label: h.t('menu.save'), detail: 'Save your progress.' },
      { label: h.t('menu.exit'), detail: 'Close this menu.' },
    ];
    await this.ui.run(async () => {
      h.sound('menuOk');
      const win = this.ui.open({ x: 160, y: 4, w: 76, rows: rows(), detail: true, cls: 'start' });
      for (;;) {
        const i = await this.ui.pick(win);
        if (i < 0 || i === 5) break;
        win.el.hidden = true; if (win.detailEl) win.detailEl.hidden = true;
        if (i === 0) await this.partyMenu();
        else if (i === 1) await this.bag();
        else if (i === 2) await this.skillsMenu();
        else if (i === 3) await this.card();
        else if (i === 4) { if (await this.saveFlow()) break; }
        win.el.hidden = false; if (win.detailEl) win.detailEl.hidden = false;
      }
      this.ui.close(win);
    });
  }

  private async card(): Promise<void> {
    const h = this.h, t = Math.floor(h.playTime() / 60);
    await this.ui.choose({ x: 24, y: 24, w: 192, title: (h.party[0]?.def.name ?? 'Hero').toUpperCase(), cls: 'card', rows: [
      { label: 'MONEY', right: this.money() },
      { label: 'PARTY', right: `${h.party.length}` },
      { label: 'TIME', right: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` },
    ] });
  }

  async saveFlow(): Promise<boolean> {
    if ((await this.ui.ask(this.h.t('save.ask'))) !== 0) return false;
    const ok = this.h.save();
    if (ok) this.h.sound('save');
    await this.ui.say(ok ? this.h.t('save.done', { name: this.h.party[0]?.def.name ?? 'You' }) : 'The game couldn’t be saved.');
    return ok;
  }

  /* ------------------------------------------------------------------ PARTY */

  partyRows(note?: (m: Member) => string | undefined): Row[] {
    const h = this.h;
    return h.party.map((m) => {
      const max = maxOf(h.db, m, (id) => h.items.get(id));
      return { label: m.def.name, icon: h.face(m), sub: `Lv${m.level}${m.hp <= 0 ? '  KO' : ''}`, bar: m.hp / max.hp, right: note?.(m) ?? `${Math.max(0, m.hp)}/${max.hp}` };
    });
  }

  /** Choose a party member (for an item, say): the index, or -1. */
  async pickMember(title: string, note?: (m: Member) => string | undefined): Promise<number> {
    return this.ui.choose({ x: 8, y: 6, w: 224, max: 6, rows: [...this.partyRows(note)], title, cls: 'party' });
  }

  async partyMenu(): Promise<void> {
    const win = this.ui.open({ x: 8, y: 6, w: 224, max: 6, rows: this.partyRows(), title: 'Choose a hero.', cls: 'party' });
    for (;;) {
      const i = await this.ui.pick(win);
      if (i < 0) break;
      const m = this.h.party[i];
      const opt = await this.ui.choose({ x: 160, y: 84, w: 76, rows: [{ label: 'SUMMARY' }, { label: 'MOVES' }, { label: 'EQUIP' }, { label: 'SWITCH', disabled: this.h.party.length < 2 }, { label: 'CANCEL' }] });
      if (opt === 0) await this.summary(m);
      else if (opt === 1) await this.movesMenu(m);
      else if (opt === 2) await this.equipMenu(m);
      else if (opt === 3) {
        win.opts.title = 'Move to where?';
        this.ui.setRows(win, this.partyRows());
        const j = await this.ui.pick(win);
        if (j >= 0 && j !== i) { const p = this.h.party; [p[i], p[j]] = [p[j], p[i]]; }
        win.opts.title = 'Choose a hero.';
      }
      this.ui.setRows(win, this.partyRows());
    }
    this.ui.close(win);
  }

  private async summary(m: Member): Promise<void> {
    const h = this.h, items = (id: string) => h.items.get(id), max = maxOf(h.db, m, items), n = battleNumbers(h.cfg, m, items, h.db);
    const need = xpToNext(h.cfg, m.level);
    const rows: Row[] = [
      { label: 'LEVEL', right: `${m.level}` },
      { label: 'CLASS', right: (findClass(h.db, m.abil.cls)?.name ?? '—').toUpperCase() },
      { label: 'SKILL POINTS', right: `${m.points}` },
      { label: 'HP', right: `${Math.max(0, m.hp)}/${max.hp}` },
      { label: 'MP', right: `${m.mp}/${max.mp}` },
      { label: 'EXP TO NEXT', right: need > 0 ? `${need - m.xp}` : '—' },
      { label: 'ATTACK', right: `${Math.round(n.attack)}` },
      { label: 'ARMOUR', right: `${Math.round(n.armour)} / ${Math.round(n.magicArmour)}` },
      ...ATTRS.map((k) => ({ label: ATTR_INFO[k].name.toUpperCase(), right: `${n.totals.attrs[k]}` })),
    ];
    await this.ui.choose({ x: 24, y: 6, w: 192, max: 8, rows, title: `${m.def.name.toUpperCase()}  Lv${m.level}`, cls: 'summary' });
  }

  moveRows(m: Member, ids: string[]): Row[] {
    return ids.map((id) => { const i = moveInfo(this.h.db, m, id); return { label: i.name, right: i.right.toUpperCase(), detail: i.detail }; });
  }

  /** Their move list, as battles show it: Additions weakest first, then the spells (cheapest first). */
  moveListRows(m: Member): Row[] {
    const l = moveList(this.h.db, m);
    return [...this.moveRows(m, l.additions), ...(l.spells.length ? [{ label: '[ Spells ]', divider: true, disabled: true }, ...this.moveRows(m, l.spells)] : [])];
  }

  async movesMenu(m: Member): Promise<void> {
    const rows = this.moveListRows(m);
    if (!rows.length) { await this.ui.say(`${m.def.name} knows no moves.`); return; }
    await this.ui.choose({ x: 24, y: 6, w: 192, max: 6, rows, title: `${m.def.name.toUpperCase()}’S MOVES`, detail: true, cls: 'moves' });
  }

  /* ------------------------------------------------------------------ SKILLS */

  /** The skill trees: a hero, then their trees (◀ ▶), each skill with its rank or cost; A takes the next rank. */
  async skillsMenu(): Promise<void> {
    const h = this.h;
    const k = h.party.length > 1 ? await this.pickMember('Whose skills?', (m) => `${m.points} SP`) : 0;
    if (k < 0) return;
    const m = h.party[k], sk = skillsData(h.db.skills);
    const trees = () => { const t = memberTrees(h.db, m); return [...t.learn.map((id) => ({ id, own: true })), ...t.view.map((id) => ({ id, own: false }))]; };
    if (!trees().length) { await this.ui.say(`${m.def.name} has no skill trees.`); return; }
    let p = 0;
    const nodes = () => sk.nodes.filter((n) => n.tree === trees()[p]?.id).sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = (): Row[] => nodes().map((n) => {
      const st = nodeState(h.db, m, n);
      return { label: n.name, right: st.rank >= st.max ? (st.max > 1 ? `${st.rank}/${st.max}` : 'DONE') : `${st.max > 1 ? `${st.rank}/${st.max} · ` : ''}${st.cost} SP`, disabled: !st.ok,
        detail: [n.description, st.why].filter(Boolean).join('\n') };
    });
    const win = this.ui.open({ x: 8, y: 4, w: 224, max: 6, rows: [], detail: true, cls: 'skills' });
    const fill = () => {
      const t = trees()[p], name = sk.trees.find((x) => x.id === t.id)?.name ?? t.id;
      win.opts.title = `◀ ${name.toUpperCase()}${t.own ? '' : ' (VIEW)'} ▶  ${m.points} SP`;
      this.ui.setRows(win, rows());
    };
    fill();
    win.onSide = (d) => { p = (p + d + trees().length) % trees().length; win.i = 0; win.top = 0; fill(); h.sound('menuMove'); };
    for (;;) {
      const i = await this.ui.pick(win);
      if (i < 0) break;
      const n = nodes()[i], st = nodeState(h.db, m, n);
      if (!st.ok) continue;
      if ((await this.ui.ask(h.t('skill.ask', { name: m.def.name, move: n.name, n: st.cost }))) !== 0) continue;
      takeNode(h.db, m, n, (id) => h.items.get(id));
      h.sound('levelUp');
      await this.ui.say(h.t('skill.done', { name: m.def.name, move: n.name }));
      fill();
    }
    this.ui.close(win);
  }

  /** A class trainer: choose one of the classes they've unlocked (-1: none). */
  async pickClass(m: Member, list: ClassDef[]): Promise<number> {
    return this.ui.choose({ x: 40, y: 20, w: 160, max: 6, title: `${m.def.name.toUpperCase()}: WHICH CLASS?`, detail: true,
      rows: list.map((c) => ({ label: c.name, right: c.id === m.abil.cls ? 'NOW' : '', detail: c.description })) });
  }

  private async equipMenu(m: Member): Promise<void> {
    const h = this.h, inv = h.inventory;
    const rows = (): Row[] => SLOT_NAMES.map(([slot, name]) => {
      const d = m.equip[slot] ? h.items.get(m.equip[slot]!) : undefined;
      return { label: name, sub: d?.name ?? '—', icon: this.icon(d), detail: d?.description };
    });
    const win = this.ui.open({ x: 24, y: 6, w: 192, rows: rows(), title: `${m.def.name.toUpperCase()}’S GEAR`, detail: true, cls: 'equip' });
    for (;;) {
      const i = await this.ui.pick(win);
      if (i < 0) break;
      const slot = SLOT_NAMES[i][0];
      const bag = [...new Map(inv.slots.flatMap((s) => { const d = s && h.items.get(s.id); return s && d && d.slot === slot ? [[d.id, d] as const] : []; })).values()];
      const list: Row[] = [...bag.map((d) => ({ label: d.name, icon: this.icon(d), detail: canWear(h.db, m, d) ? d.description : `${m.def.name}'s class can't use this.`, disabled: !canWear(h.db, m, d) })), ...(m.equip[slot] ? [{ label: 'REMOVE', detail: 'Put it back in the bag.' }] : [])];
      if (!list.length) { await this.ui.say('Nothing in the bag goes there.'); continue; }
      const j = await this.ui.choose({ x: 40, y: 30, w: 176, max: 6, rows: list, title: SLOT_NAMES[i][1], detail: true });
      if (j < 0) continue;
      this.equip(m, slot, j < bag.length ? bag[j].id : null);
      this.ui.setRows(win, rows());
    }
    this.ui.close(win);
  }

  /** Put gear on (from the bag) or take it off (back into it). */
  equip(m: Member, slot: EquipSlot, id: string | null): boolean {
    const inv = this.h.inventory, old = m.equip[slot];
    if (old && inv.room(old) < 1) return false;
    if (id && inv.remove(id, 1) < 1) return false;
    if (old) inv.add(old, 1);
    if (id) m.equip[slot] = id; else delete m.equip[slot];
    const max = maxOf(this.h.db, m, (k) => this.h.items.get(k));
    m.hp = Math.min(m.hp, max.hp); m.mp = Math.min(m.mp, max.mp);
    this.h.sound('item');
    return true;
  }

  /* ------------------------------------------------------------------ BAG */

  bagRows(pocket: Pocket, price?: (d: ItemDef) => number): { rows: Row[]; ids: string[] } {
    const h = this.h, seen = new Map<string, number>();
    for (const s of h.inventory.slots) { const d = s && h.items.get(s.id); if (s && d && pocketOf(d) === pocket) seen.set(s.id, (seen.get(s.id) ?? 0) + s.n); }
    const ids = [...seen.keys()];
    return { ids, rows: [...ids.map((id) => { const d = h.items.get(id)!; return { label: d.name, icon: this.icon(d), right: price ? `$${price(d)}` : pocket === 'key' ? '' : `×${seen.get(id)}`, detail: d.description }; }), { label: 'CLOSE BAG' }] };
  }

  async bag(): Promise<void> {
    let p = 0;
    const win = this.ui.open({ x: 76, y: 4, w: 160, max: 7, rows: [], detail: true, cls: 'bag' });
    const fill = () => { win.opts.title = `◀ ${POCKETS[p][1]} ▶`; const b = this.bagRows(POCKETS[p][0]); this.ui.setRows(win, b.rows); return b; };
    let cur = fill();
    win.onSide = (d) => { p = (p + d + POCKETS.length) % POCKETS.length; win.i = 0; win.top = 0; cur = fill(); this.h.sound('menuMove'); };
    for (;;) {
      const i = await this.ui.pick(win);
      if (i < 0 || i >= cur.ids.length) break;
      const id = cur.ids[i], d = this.h.items.get(id)!;
      const usable = !!(d.restore || d.restorePct || d.revive);
      const opts: [string, () => Promise<void>][] = [];
      if (d.slot) opts.push(['EQUIP', () => this.giveGear(d)]);
      else if (d.kind !== 'key') opts.push(['USE', () => this.useOn(d)]);
      if (d.kind !== 'key') opts.push(['TOSS', () => this.toss(d)]);
      opts.push(['CANCEL', async () => {}]);
      const j = await this.ui.choose({ x: 160, y: 84, w: 76, rows: opts.map(([l]) => ({ label: l, disabled: l === 'USE' && !usable })) });
      if (j >= 0) await opts[j][1]();
      cur = fill();
    }
    this.ui.close(win);
  }

  private async giveGear(d: ItemDef): Promise<void> {
    const k = await this.pickMember(`Equip ${d.name} on whom?`, (m) => (!canWear(this.h.db, m, d) ? 'can’t' : m.equip[d.slot!] ? 'swap' : ''));
    if (k < 0) return;
    const m = this.h.party[k];
    if (!canWear(this.h.db, m, d)) { await this.ui.say(`${m.def.name}'s class can't use the ${d.name}.`); return; }
    if (this.equip(m, d.slot!, d.id)) await this.ui.say(this.h.t('item.equipped', { name: m.def.name, item: d.name }));
    else await this.ui.say('There’s no room in the bag for what they had on.');
  }

  /** Use a healing item on a party member (out of battle). */
  private async useOn(d: ItemDef): Promise<void> {
    const h = this.h;
    const k = await this.pickMember(`Use on which hero?`);
    if (k < 0) return;
    const m = h.party[k], max = maxOf(h.db, m, (id) => h.items.get(id));
    if (m.hp <= 0 && !d.revive) { await this.ui.say(this.h.t('item.no_effect')); return; }
    const hp = (d.restore?.hp ?? 0) + Math.round(((d.restorePct?.hp ?? 0) * max.hp) / 100);
    const mp = (d.restore?.mp ?? 0) + Math.round(((d.restorePct?.mp ?? 0) * max.mp) / 100);
    const before = { hp: m.hp, mp: m.mp };
    if (d.revive && m.hp <= 0) m.hp = Math.max(1, Math.min(max.hp, hp || Math.round(max.hp / 2)));
    else m.hp = Math.min(max.hp, m.hp + hp);
    m.mp = Math.min(max.mp, m.mp + mp);
    if (m.hp === before.hp && m.mp === before.mp) { await this.ui.say(this.h.t('item.no_effect')); return; }
    h.inventory.remove(d.id, 1);
    h.sound('item');
    const parts = [m.hp > before.hp ? `${m.hp - Math.max(0, before.hp)} HP` : '', m.mp > before.mp ? `${m.mp - before.mp} MP` : ''].filter(Boolean).join(' and ');
    await this.ui.say(before.hp <= 0 ? this.h.t('item.revived', { name: m.def.name }) : `${m.def.name} recovered ${parts}.`);
  }

  /** "How many?": up / down by one, left / right by ten. */
  async count(max: number, title: string, price?: number): Promise<number> {
    let n = 1;
    const row = (): Row[] => [{ label: `×${String(n).padStart(2, '0')}`, right: price !== undefined ? `$${(price * n).toLocaleString()}` : undefined }];
    const win = this.ui.open({ x: 120, y: 96, w: 116, rows: row(), title, cls: 'count' });
    const set = (v: number) => { n = ((v - 1 + max) % max) + 1; this.ui.setRows(win, row()); this.h.sound('menuMove'); };
    win.onSide = (d) => set(Math.max(1, Math.min(max, n + d * 10)));
    win.onUpDown = (d) => set(n + d);
    const i = await this.ui.pick(win);
    this.ui.close(win);
    return i < 0 ? 0 : n;
  }

  private async toss(d: ItemDef): Promise<void> {
    const have = this.h.inventory.count(d.id);
    const n = have > 1 ? await this.count(have, 'Toss out how many?') : 1;
    if (!n) return;
    if ((await this.ui.ask(`Throw away ${n > 1 ? `${n} ` : ''}${d.name}${n > 1 ? '(s)' : ''}?`)) !== 0) return;
    this.h.inventory.remove(d.id, n);
    await this.ui.say(`Threw away ${n > 1 ? `${n} ` : ''}${d.name}${n > 1 ? '(s)' : ''}.`);
  }

  /* ------------------------------------------------------------------ SHOP */

  async shop(goods: { item: string; price?: number }[], canSell = true, name?: string): Promise<void> {
    const h = this.h, inv = h.inventory;
    const priceOf = (g: { item: string; price?: number }) => g.price ?? h.items.get(g.item)?.price ?? 0;
    const wares = goods.filter((g) => h.items.has(g.item));
    const cash = this.ui.open({ x: 4, y: 4, w: 84, rows: [{ label: this.money() }], title: 'MONEY', cls: 'cash' });
    const showCash = () => this.ui.setRows(cash, [{ label: this.money() }]);
    let first = true;
    for (;;) {
      const what = await this.ui.ask(first ? `${name ? `${name}. ` : ''}${this.h.t('shop.hello')}` : this.h.t('shop.again'), canSell ? ['BUY', 'SELL', 'QUIT'] : ['BUY', 'QUIT']);
      first = false;
      if (what === 0) {
        const win = this.ui.open({ x: 88, y: 4, w: 148, max: 6, detail: true, cls: 'bag', rows: [...wares.map((g) => { const d = h.items.get(g.item)!; return { label: d.name, icon: this.icon(d), right: `$${priceOf(g)}`, detail: d.description }; }), { label: 'CANCEL' }] });
        for (;;) {
          const i = await this.ui.pick(win);
          if (i < 0 || i >= wares.length) break;
          const g = wares[i], d = h.items.get(g.item)!, p = priceOf(g);
          const most = Math.min(99, p > 0 ? Math.floor(inv.gold / p) : 99, inv.room(d.id));
          if (most < 1) { await this.ui.say(inv.room(d.id) < 1 ? this.h.t('shop.no_room') : this.h.t('shop.no_money')); continue; }
          const n = d.slot || d.kind === 'key' ? 1 : await this.count(most, `${d.name}?`, p);
          if (!n) continue;
          if ((await this.ui.ask(`${d.name}${n > 1 ? `, and you want ${n}` : ''}? That will be $${(p * n).toLocaleString()}. OK?`)) !== 0) continue;
          inv.gold -= p * n; inv.add(d.id, n); showCash();
          h.sound('coin');
          await this.ui.say(this.h.t('shop.thanks'));
        }
        this.ui.close(win);
      } else if (what === 1 && canSell) {
        let p = 0;
        const win = this.ui.open({ x: 88, y: 4, w: 148, max: 6, rows: [], detail: true, cls: 'bag' });
        const sell = (d: ItemDef) => Math.floor((d.price ?? 0) / 2);
        const fill = () => { win.opts.title = `◀ ${POCKETS[p][1]} ▶`; const b = this.bagRows(POCKETS[p][0], sell); b.rows = b.rows.map((r, k) => (k < b.ids.length && (h.items.get(b.ids[k])!.noSell || !h.items.get(b.ids[k])!.price) ? { ...r, disabled: true, right: '—' } : r)); this.ui.setRows(win, b.rows); return b; };
        let cur = fill();
        win.onSide = (d) => { p = (p + d + POCKETS.length) % POCKETS.length; win.i = 0; cur = fill(); };
        for (;;) {
          const i = await this.ui.pick(win);
          if (i < 0 || i >= cur.ids.length) break;
          const d = h.items.get(cur.ids[i])!, have = inv.count(d.id);
          const n = have > 1 ? await this.count(have, `Sell how many?`, sell(d)) : 1;
          if (!n) continue;
          if ((await this.ui.ask(`I can pay $${(sell(d) * n).toLocaleString()}. Would that be OK?`)) !== 0) continue;
          inv.remove(d.id, n); inv.gold += sell(d) * n; showCash();
          h.sound('coin');
          await this.ui.say(`Turned over the ${d.name} and received $${(sell(d) * n).toLocaleString()}.`);
          cur = fill();
        }
        this.ui.close(win);
      } else break;
    }
    this.ui.close(cash);
    await this.ui.say(this.h.t('shop.bye'));
  }
}
