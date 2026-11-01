/**
 * The turn-based battle screen: enemies on the left, the party on the right facing them, the turn order down the
 * right edge (FFX-style), a message line, the command menu and the party's health and magic. Keyboard, controller
 * and touch: arrows / D-pad move, OK picks, Cancel goes back; fighters and menu entries can be tapped.
 * It only shows things and asks questions: the battle itself is run by TurnBattle.
 */
import { type BattleLayout, type BattlePiece, pieceStyle } from './battleLayout';
import { DEFAULT_STATUS_PILLS, type StatusPill } from '../game/battle/statusPills';
import type { Input } from '../game/Input';
import type { Element, FaceButton, ImpactFx } from '../world/types';
import { ELEMENT_COLORS } from '../game/elements';
import { elementPill } from './elementPill';
import { esc } from './InventoryScreen';

/** One timed strike of an Addition: the button, the seconds the ring takes to close, and the timing window. */
export interface QteStrike { button: FaceButton | 'any'; time: number; window: number }
export type QteResult = 'perfect' | 'good' | 'miss';
/** How a spell addition went: buttons right of all of them, and the share of the time left (0 … 1). */
export interface SeqResult { correct: number; total: number; left: number }
/** One of the four spheres on a Pocket Handheld block: still to fight (or fighting), knocked out, or no one. */
export type Sphere = 'up' | 'ko' | 'empty';
/** A Pocket Handheld block (Pokémon-style): name and level, health bar (and a hero's numbers, MP orb and EXP). */
/** Pocket Handheld's text box types its lines out at this many letters a second. */
export const TYPE_SPEED = 55;

/** A line for Pocket Handheld's text box. */
/** Pocket Handheld: how long a health bar takes to drain (seconds); the battle waits for it. */
export const DRAIN = 0.9;

interface Narration { text: string; wait: boolean; sound?: string; bars?: () => void; stats?: string[]; /** A picture before the words (the gold coin, an item's icon). */ icon?: string; /** A pause (seconds) with the last line left up: the battle waits (a health bar draining). */ pause?: number }

interface PocketBlock { el: HTMLElement; hp: HTMLElement; num: HTMLElement | null; orb: HTMLElement | null; orbText: HTMLElement | null; /** Drawn once already (the first draw skips the bar animation). */ drawn?: boolean; /** The HP shown (counting toward the real one), its target, the most, and how fast it counts. */ shown?: number; to?: number; max?: number; rate?: number }

interface Qte {
  target: string;
  strikes: QteStrike[];
  auto: boolean;
  i: number;
  t: number;
  onStrike: (i: number, r: QteResult) => void;
  done: (landed: number) => void;
  ring: HTMLElement;
  pressed: (FaceButton | null)[];
}

/** Keys for the face buttons: the letters themselves, and Space / Enter for A. */
const QTE_KEYS: Record<string, FaceButton> = { KeyA: 'A', KeyB: 'B', KeyX: 'X', KeyY: 'Y', Space: 'A', Enter: 'A', NumpadEnter: 'A' };
const PAD_FACE: FaceButton[] = ['A', 'B', 'X', 'Y'];
import { uiSound } from '../audio/sfx';

export interface FighterView {
  key: string;
  side: 'party' | 'enemy';
  name: string;
  /** Their level, when they have one (shown beside the name; heroes in the Pocket Handheld layout). */
  level?: number;
  /** Heroes (Pocket Handheld layout): EXP towards the next level. */
  xp?: { have: number; next: number };
  /** Heroes (Pocket Handheld layout, flat screen): seen from behind. */
  back?: HTMLCanvasElement;
  /** Full-body picture, and a small one for the turn order (party: their face). */
  picture: HTMLCanvasElement;
  icon: string;
  /** Mirror the picture (a flat enemy drawn facing the wrong way). */
  flip?: boolean;
  /** Size multiplier (Database → Enemies → Size). */
  scale?: number;
  color?: string;
  /** Party: their face art (Dragon Legend layout); unset: `icon`. */
  face?: string;
  /** Enemies: their elements (stat blocks show them and glow in their colours), and an overdrive gauge (bosses). */
  elements?: Element[];
  overdrive?: boolean;
}

/** Normal (no element): the stat block's glow, gold to tan. */
const NORMAL_GLOW = ['#f2c64a', '#c9a46a'];

/** One hero on the victory screen: their EXP bar before, and how it fills (level by level) with what they won. */
export interface VictoryHero {
  key: string; name: string; icon: string; color?: string;
  /** Knocked out: no EXP. */
  out?: boolean;
  level: number; xp: number; toNext: number; gained: number;
  /** Where the EXP came from ("Base 40 · Finishing blows +10 · Additions +6"), or why there's none. */
  note?: string;
  /** Each stretch of the bar to fill: a level, from and to (0 … 1), whether it ends in a level up, the EXP shown then. */
  segments: { level: number; from: number; to: number; up: boolean; xp: number; toNext: number }[];
  /** What their new levels brought ("Max HP 100 → 112", "+3 stat points"). */
  changes: string[];
  /** Where their bar ends up. */
  after: { level: number; xp: number; toNext: number };
  /** Sat out but earned EXP all the same: the item that shared it (EXP Share, EXP All). */
  via?: string;
  /** The EXP earned fighting, split up (Pocket Handheld's log): bonuses beyond each foe's own EXP. */
  bonus?: { gained: number; bits: string[] };
}
export interface VictoryLoot { name: string; icon: string; count: number; kind: 'gold' | 'potion' | 'key' | 'material' | 'gear' | 'item'; note?: string }
export interface VictoryReport { xp: number; heroes: VictoryHero[]; loot: VictoryLoot[] }

const LOOT_SOUND: Record<VictoryLoot['kind'], string> = { gold: 'lootGold', potion: 'lootPotion', key: 'lootKey', material: 'lootMaterial', gear: 'lootGear', item: 'lootItem' };

interface VicHeroView { h: VictoryHero; fill: HTMLElement; num: HTMLElement; lv: HTMLElement; badge: HTMLElement; changes: HTMLElement }
interface Victory {
  report: VictoryReport; done: () => void; el: HTMLElement; hint: HTMLElement;
  page: 'exp' | 'expDone' | 'loot' | 'lootDone';
  heroes: VicHeroView[]; hero: number; seg: number; t: number; pause: number; started: boolean;
  rows: HTMLElement[]; row: number;
}

/** A 3D battle stage behind the screen (a battle map): it moves the sprites; the screen keeps the tags and numbers. */
export interface StageHooks {
  animate(key: string, how: Anim, color?: string, target?: string): void;
  vitals(key: string, down: boolean, guarding: boolean, weak?: boolean): void;
  shot?(kind: 'addition' | 'cast' | null, a?: string, t?: string, snap?: boolean): void;
  active(key: string | null): void;
  highlight(keys: string[]): void;
  /** A screen shake (a CRITICAL). */
  shake?(amount: number): void;
}

/** Fighter animations. approach / strike / back: an Addition (close in, strike per button, then run back). */
export type Anim = 'lunge' | 'shot' | 'hit' | 'cast' | 'heal' | 'faint' | 'approach' | 'strike' | 'back' | 'pose' | 'unpose' | 'toss' | 'dodge';

export interface Vitals { hp: number; maxHp: number; mp: number; maxMp: number; guarding?: boolean; /** Badly hurt or ailing (the wounded pose). */ weak?: boolean; /** Ailments and buffs on them: icon, a name for the tooltip, and which ailment (none for a buff). */ status?: { icon: string; name: string; ailment?: string }[]; /** Buffs as arrows beside the orbs (Pocket Handheld). */ buffs?: BuffChip[] }

export interface ChoiceItem {
  label: string;
  /** The command bar's picture (a key of COMMAND_ICONS), tinted `iconColor` in lists; or a picture of its own. */
  icon?: string;
  iconColor?: string;
  iconUrl?: string;
  /** Show the picture before the name in every layout (spells: their element's icon). */
  inlineIcon?: boolean;
  detail?: string;
  disabled?: boolean;
  /** Shown on the right (an MP cost, a count). */
  right?: string;
  /** Hovering it: what it would do to the turn order (the action's weight). */
  rank?: number;
  /** Buffs and debuffs beside the name (▲ STR). */
  buffs?: BuffChip[];
  /** Bars under the name (the Swap list: health, magic, EXP), with a face on the left from `iconUrl`. */
  bars?: { hp: number; maxHp: number; mp: number; maxMp: number; xp?: number };
}
/** A buff or debuff: an arrow (up or down) over a short tag. */
export interface BuffChip { tag: string; up: boolean; name: string }
/** The arrows-over-tags row. */
export function buffChipsHtml(list: BuffChip[] | undefined): string {
  if (!list?.length) return '';
  return `<span class="bchips">${list.map((c) => `<span class="bchip ${c.up ? 'up' : 'down'}" title="${c.name.replace(/"/g, '&quot;')}"><i>${c.up ? '▲' : '▼'}</i>${c.tag}</span>`).join('')}</span>`;
}

type Mode =
  | { kind: 'idle' }
  | { kind: 'list'; title: string; items: ChoiceItem[]; index: number; pick: (i: number) => void; back?: () => void; hover?: (i: number) => void; bar?: boolean }
  /** Choosing who: `rows` are the enemies' row and the party's (left to right as on screen); `keys` is the row in use. */
  | { kind: 'target'; keys: string[]; index: number; pick: (key: string) => void; back: () => void; all?: boolean; rows: string[][] }
  | { kind: 'wait'; done: () => void }
  /** Pocket Handheld: whom an item is for, from lists side by side (the party, the foes). */
  | { kind: 'lists'; lists: PickList[]; col: number; rows: number[]; pick: (key: string) => void; back: () => void };

/** A list of fighters to choose from (Pocket Handheld's item targets). `gold`: the one out fighting. */
export interface PickList { title: string; rows: { key: string; name: string; hp: number; maxHp: number; mp?: number; maxMp?: number; down?: boolean; gold?: boolean; disabled?: boolean; buffs?: BuffChip[] }[] }

/** The command bar's pictures (Legend of Dragoon style): small white line drawings. */
export const COMMAND_ICONS: Record<string, string> = {
  attack: '<path d="M6 26 L22 10 L26 6 L25 12 L10 27 Z" fill="currentColor" opacity=".9"/><path d="M5 22 L10 27 M7 29 L3 25" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  guard: '<path d="M16 3 L27 7 V15 C27 22 22 27 16 29 C10 27 5 22 5 15 V7 Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M16 8 V24 M10 14 H22" stroke="currentColor" stroke-width="2" opacity=".75"/>',
  magic: '<path d="M16 3 L18.6 12.4 L28 15 L18.6 17.6 L16 27 L13.4 17.6 L4 15 L13.4 12.4 Z" fill="currentColor"/><circle cx="25" cy="6" r="1.8" fill="currentColor"/><circle cx="7" cy="25" r="1.4" fill="currentColor"/>',
  items: '<path d="M13 4 H19 V9 L24 16 C26 20 24 28 16 28 C8 28 6 20 8 16 L13 9 Z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><path d="M9.5 18 H22.5 C23 23 20 26 16 26 C12 26 9 23 9.5 18 Z" fill="currentColor" opacity=".8"/><path d="M12 4 H20" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  swap: '<path d="M6 11 H24 L19 6 M26 21 H8 L13 26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  escape: '<circle cx="19" cy="6" r="3" fill="currentColor"/><path d="M17 11 L12 18 L17 21 L15 28 M12 18 L7 22 M17 11 L23 15 L27 13 M14 14 L9 13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 9 H8 M1 14 H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>',
};
const svgIcon = (k: string) => `<svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">${COMMAND_ICONS[k] ?? ''}</svg>`;

export class BattleScreen {
  private readonly root = document.createElement('div');
  private readonly field: HTMLElement;
  private readonly enemiesEl: HTMLElement;
  private readonly partyEl: HTMLElement;
  private readonly orderEl: HTMLElement;
  private readonly msgEl: HTMLElement;
  private readonly cmdEl: HTMLElement;
  private readonly cmdTitle: HTMLElement;
  private readonly cmdList: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly resultEl: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly fighters = new Map<string, { view: FighterView; el: HTMLElement; img: HTMLCanvasElement; bar: HTMLElement | null; row: HTMLElement | null; icons: HTMLElement; rowIcons: HTMLElement | null; statusKey: string; buffKey?: string; card: HTMLElement | null; pb: PocketBlock }>();
  /** Pocket Handheld: each side's spheres (shown on that side's first block). */
  private spheres: Record<'party' | 'enemy', Sphere[]> = { party: [], enemy: [] };
  private readonly camEl: HTMLElement;
  private readonly cardsEl: HTMLElement;
  private readonly descEl: HTMLElement;
  private layout: 'dragon' | 'fantasy' | 'pocket' = 'dragon';
  private readonly blocksEl: HTMLElement;
  private readonly logEl: HTMLElement;
  private readonly logLines: HTMLElement;
  private readonly pocketText: HTMLElement;
  /** The battle log is picked (Y): up / down scroll it. */
  private logFocus = false;
  /** Monster stat blocks across the top (Database → Combat): one per foe, with their bars. */
  private blocksOn = false;
  private readonly blocks = new Map<string, { el: HTMLElement; hp: HTMLElement; mp: HTMLElement; mpBar: HTMLElement; od: HTMLElement | null }>();
  /** Whose turn it is (a party member's shows the arrow over them while they choose). */
  private activeKey: string | null = null;
  private readonly capEl: HTMLElement;
  private camTimer = 0;
  private vic: Victory | null = null;
  /** The results panel, kept while the battle fades out, removed when the screen closes. */
  private leftover: HTMLElement | null = null;
  /** Plays an effect or chime (victory, EXP, loot) on the game's sound. */
  onSound: ((name: string) => void) | null = null;
  /** Staged battles: the camera button (or LB / RB) asks for the next (+1) or previous (−1) camera. */
  onCamera: ((dir: 1 | -1) => void) | null = null;
  private mode: Mode = { kind: 'idle' };
  private msgTimer = 0;
  private qte: Qte | null = null;
  /** A spell addition under way: the buttons, how far along, and the time left. */
  private seq: { buttons: FaceButton[]; i: number; t: number; time: number; auto: boolean; el: HTMLElement; keys: HTMLElement[]; bar: HTMLElement; onPress: (i: number, ok: boolean) => void; done: (r: SeqResult) => void; over: boolean } | null = null;
  private readonly qteEl = document.createElement('div');
  private readonly padsEl = document.createElement('div');
  private padWas: boolean[] = [];
  /** The 3D stage (battle maps), or null for the flat screen. */
  private stage: StageHooks | null = null;
  /** Called once the screen closes (the battle ended or was abandoned). */
  onClosed: (() => void) | null = null;
  private readonly onQteKey = (e: KeyboardEvent): void => {
    const b = QTE_KEYS[e.code];
    if (this.seq && b && !e.repeat) { e.preventDefault(); e.stopPropagation(); this.seqPress(b); return; }
    if (!this.qte || !b || e.repeat) return;
    e.preventDefault(); e.stopPropagation();
    this.qtePress(b);
  };

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'battle';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Battle');
    this.root.innerHTML = `
      <div class="battle-shade"></div>
      <div class="battle-flash"></div>
      <div class="battle-msg" role="status" aria-live="polite"></div>
      <div class="battle-field"><div class="battle-floor"></div><div class="battle-enemies"></div><div class="battle-party"></div></div>
      <div class="battle-order" aria-label="Turn order"></div>
      <button type="button" class="battle-cam" hidden aria-label="Change camera"><span class="battle-cam-key">LB</span><span class="battle-cam-name"></span><span class="battle-cam-key">RB</span></button>
      <div class="battle-bottom">
        <div class="battle-cmd" hidden><div class="battle-cmd-title"></div><div class="battle-cmd-list" role="listbox"></div><div class="battle-cmd-cap"></div></div>
        <div class="battle-status"></div>
        <div class="battle-cards"></div>
      </div>
      <div class="battle-desc" hidden></div>
      <div class="battle-blocks" aria-label="Foes"></div>
      <div class="pocket-foes" aria-label="Foes"></div><div class="pocket-heroes" aria-label="Party"></div><div class="pocket-text" aria-live="polite"><div class="pt-line"><img class="pt-icon" alt="" hidden><span class="pt-text"></span></div><span class="pt-next">▼</span><div class="pt-stats" hidden></div></div>
      <div class="battle-log" role="log" aria-label="Battle log"><div class="battle-log-lines"></div><div class="battle-log-hint">Y: battle log</div></div>
      <div class="battle-result" hidden></div>`;
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.field = q('.battle-field');
    this.enemiesEl = q('.battle-enemies');
    this.partyEl = q('.battle-party');
    this.orderEl = q('.battle-order');
    this.msgEl = q('.battle-msg');
    this.cmdEl = q('.battle-cmd');
    this.cmdTitle = q('.battle-cmd-title');
    this.cmdList = q('.battle-cmd-list');
    this.statusEl = q('.battle-status');
    this.resultEl = q('.battle-result');
    this.flashEl = q('.battle-flash');
    this.camEl = q('.battle-cam');
    this.capEl = q('.battle-cmd-cap');
    this.cardsEl = q('.battle-cards');
    this.descEl = q('.battle-desc');
    this.blocksEl = q('.battle-blocks');
    this.logEl = q('.battle-log');
    this.logLines = q('.battle-log-lines');
    this.pocketText = q('.pocket-text');
    this.logEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!this.logFocus) this.focusLog(true); });
    // Y (the key, or the controller's Y) picks the battle log to scroll; again (or Back) lets go.
    addEventListener('keydown', (e) => {
      if (this.root.hidden || this.qte || this.vic || e.code !== 'KeyY' || e.repeat) return;
      e.preventDefault();
      this.focusLog(!this.logFocus);
    });
    this.camEl.addEventListener('click', (e) => { e.stopPropagation(); this.onCamera?.(1); });
    // Tapping anywhere while a message waits moves it on.
    this.root.addEventListener('pointerdown', (e) => {
      if (this.vic) { e.preventDefault(); this.vicNext(); return; }
      if (this.narrCur?.wait && this.mode.kind !== 'list' && this.mode.kind !== 'target' && !this.qte && !this.seq) { e.preventDefault(); this.input.press('ok'); return; }
      if (this.mode.kind === 'wait' && !(e.target as HTMLElement).closest('.battle-cmd')) { e.preventDefault(); this.finishWait(); }
    });
    // Additions: the ring that closes on the target, the button to press, and touch buttons.
    this.qteEl.className = 'qte';
    this.qteEl.hidden = true;
    this.padsEl.className = 'qte-pads';
    this.padsEl.hidden = true;
    for (const b of ['Y', 'X', 'B', 'A'] as FaceButton[]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `qte-pad pad-${b}`;
      btn.textContent = b;
      btn.setAttribute('aria-label', `Button ${b}`);
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.seq) this.seqPress(b); else this.qtePress(b); });
      this.padsEl.append(btn);
    }
    this.root.append(this.qteEl, this.padsEl);
    parent.append(this.root);
  }

  get isOpen(): boolean { return !this.root.hidden; }
  /** Fighting on a 3D stage (a battle map). */
  get staged(): boolean { return !!this.stage; }

  /** Open with these fighters. `opening` decides the banner. */
  open(views: FighterView[]): void {
    this.fighters.clear();
    for (const el of this.root.querySelectorAll('.battle-victory')) el.remove();
    this.enemiesEl.replaceChildren();
    this.partyEl.replaceChildren();
    this.statusEl.replaceChildren();
    this.cardsEl.replaceChildren();
    this.blocksEl.replaceChildren();
    this.blocks.clear();
    this.root.querySelector('.pocket-foes')!.replaceChildren();
    this.root.querySelector('.pocket-heroes')!.replaceChildren();
    this.spheres = { party: [], enemy: [] };
    this.logLines.replaceChildren();
    this.focusLog(false);
    this.resultEl.hidden = true;
    this.cmdEl.hidden = true;
    this.mode = { kind: 'idle' };
    const enemies = views.filter((v) => v.side === 'enemy'), party = views.filter((v) => v.side === 'party');
    enemies.forEach((v, i) => this.addFighter(v, i, enemies.length));
    party.forEach((v, i) => this.addFighter(v, i, party.length));
    // Dragon Legend: the hero's card in the middle, the party either side (as they stand).
    const cards = party.map((v) => this.fighters.get(v.key)?.card).filter((c): c is HTMLElement => !!c);
    this.cardsEl.replaceChildren(...(cards.length === 3 ? [cards[1], cards[0], cards[2]] : cards));
    this.enemiesEl.dataset.count = String(enemies.length);
    this.partyEl.dataset.count = String(party.length);
    this.root.hidden = false;
    this.root.style.transition = '';
    this.root.style.opacity = '';
    this.root.classList.remove('closing');
    this.root.classList.remove('entering');
    void this.root.offsetWidth;
    this.root.classList.add('entering');
  }

  close(): void {
    this.endQte();
    this.vic?.el.remove();
    this.vic = null;
    this.narr = []; this.narrCur = null; this.narrDone = null; for (const t of this.xpTimers) clearTimeout(t); this.xpTimers = []; this.timers = [];
    this.leftover?.remove();
    this.leftover = null;
    this.mode = { kind: 'idle' };
    this.root.hidden = true;
    this.fighters.clear();
    this.setStage(null);
    const done = this.onClosed;
    this.onClosed = null;
    done?.();
  }

  /** Fight on a 3D stage (set before `open`), or the flat screen (null). */
  setStage(stage: StageHooks | null): void {
    this.stage = stage;
    this.root.classList.toggle('staged', !!stage);
    this.camEl.hidden = !stage;
    document.body.classList.toggle('staged-battle', !!stage);
  }

  /** Staged: show which camera is in use (briefly bright, then dim). */
  cameraHint(name: string, keys: [string, string] = ['LB', 'RB']): void {
    (this.camEl.querySelector('.battle-cam-name') as HTMLElement).textContent = name;
    const k = this.camEl.querySelectorAll('.battle-cam-key');
    (k[0] as HTMLElement).textContent = keys[0]; (k[1] as HTMLElement).textContent = keys[1];
    this.camEl.classList.add('lit');
    this.camTimer = 2;
  }

  /** Staged: where a fighter's sprite is on screen (its feet, its size), so its tag and numbers follow it. */
  place(key: string, x: number, y: number, w: number, h: number, shown: boolean): void {
    const f = this.fighters.get(key);
    if (!f) return;
    f.el.style.left = `${x.toFixed(1)}px`;
    f.el.style.top = `${(y - h - 6).toFixed(1)}px`;
    f.img.style.width = `${Math.max(8, w).toFixed(1)}px`;
    f.img.style.height = `${h.toFixed(1)}px`;
    f.el.style.visibility = shown ? '' : 'hidden';
  }

  private addFighter(v: FighterView, i: number, n: number): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `bfighter ${v.side}`;
    el.style.setProperty('--i', String(i));
    el.style.setProperty('--n', String(n));
    el.setAttribute('aria-label', v.name);
    const img = document.createElement('canvas');
    // Pocket Handheld (flat screen): the party seen from behind, facing the foe.
    const pic = this.layout === 'pocket' && v.side === 'party' && v.back ? v.back : v.picture;
    img.width = pic.width; img.height = pic.height;
    img.getContext('2d')!.drawImage(pic, 0, 0);
    img.className = 'bf-pic';
    // A crowd is drawn smaller so it fits (more than 3 in the party, more than 4 enemies).
    const crowd = v.side === 'party' ? (n > 3 ? 3.3 / n : 1) : n > 4 ? 4.6 / n : 1;
    const s = Math.max(0.3, Math.min(3, (v.scale ?? 1) * crowd));
    img.style.width = `${Math.round(v.picture.width * s)}px`;
    img.style.height = `${Math.round(v.picture.height * s)}px`;
    if (v.flip) img.classList.add('flip');
    const shadow = document.createElement('span');
    shadow.className = 'bf-shadow';
    const icons = document.createElement('span');
    icons.className = 'bf-status';
    // Over the head: the target arrow (coloured by health), ailments, and an enemy's name and health.
    const head = document.createElement('span');
    head.className = 'bf-head';
    const arrow = document.createElement('span');
    arrow.className = 'bf-arrow';
    head.append(arrow, icons);
    el.append(shadow, head, img);
    let bar: HTMLElement | null = null;
    if (v.side === 'enemy') {
      const tag = document.createElement('span');
      tag.className = 'bf-tag';
      tag.innerHTML = `<span class="bf-name"></span><span class="bf-hp"><span></span></span>`;
      (tag.querySelector('.bf-name') as HTMLElement).textContent = v.name;
      if (v.level) { const lv = document.createElement('span'); lv.className = 'bf-lv'; lv.textContent = `Lv ${v.level}`; tag.querySelector('.bf-name')!.append(' ', lv); }
      bar = tag.querySelector('.bf-hp span') as HTMLElement;
      head.append(tag);
    }
    el.classList.add('hp-high');
    el.addEventListener('click', () => this.tapFighter(v.key));
    if (v.side === 'enemy' && this.blocksOn) this.addBlock(v);
    (v.side === 'enemy' ? this.enemiesEl : this.partyEl).append(el);
    let row: HTMLElement | null = null;
    if (v.side === 'party') {
      row = document.createElement('div');
      row.className = 'bstat';
      if (v.color) row.style.setProperty('--hero', v.color);
      row.innerHTML = `<span class="bstat-name"><span class="bstat-label"></span><span class="bstat-status"></span></span><span class="bstat-bar hp"><span></span></span><span class="bstat-num hp"></span><span class="bstat-bar mp"><span></span></span><span class="bstat-num mp"></span>`;
      (row.querySelector('.bstat-label') as HTMLElement).textContent = v.name;
      row.addEventListener('click', () => this.tapFighter(v.key));
      this.statusEl.append(row);
    }
    let card: HTMLElement | null = null;
    if (v.side === 'party') {
      card = document.createElement('div');
      card.className = 'dl-card';
      if (v.color) card.style.setProperty('--hero', v.color);
      card.innerHTML = `<img class="dl-face" alt=""><div class="dl-info"><div class="dl-name"></div><div class="dl-nums"><span class="dl-k">HP</span><span class="dl-hp"></span><span class="dl-k">MP</span><span class="dl-mp"></span></div></div>`;
      (card.querySelector('.dl-face') as HTMLImageElement).src = v.face ?? v.icon;
      (card.querySelector('.dl-name') as HTMLElement).textContent = v.name;
      card.addEventListener('click', () => this.tapFighter(v.key));
    }
    const pb = this.pocketBlock(v);
    this.root.querySelector(v.side === 'enemy' ? '.pocket-foes' : '.pocket-heroes')!.append(pb.el);
    this.fighters.set(v.key, { view: v, el, img, bar, row, icons, rowIcons: row?.querySelector('.bstat-status') as HTMLElement | null, statusKey: '', card, pb });
  }

  /** A Pocket Handheld block: the foe's (name, level, element, health) or a hero's (and numbers, MP orb, EXP). */
  private pocketBlock(v: FighterView): PocketBlock {
    const el = document.createElement('div');
    el.className = `pb ${v.side === 'enemy' ? 'foe' : 'hero'}`;
    if (v.color) el.style.setProperty('--hero', v.color);
    const els = v.elements?.length ? v.elements.slice(0, 2) : [];
    // Heroes: everything in a column (the HP numbers under the bar), the MP orb beside it.
    el.innerHTML = v.side === 'party'
      ? `<div class="pb-main"><div class="pb-top"><span class="pb-name"></span><span class="pb-lv"></span></div>
        <div class="pb-line"><span class="pb-k">HP</span><div class="pb-bar"><span></span></div></div>
        <div class="pb-num"></div>
        <div class="pb-line pb-xpline"><span class="pb-k">EXP</span><div class="pb-xp"><span></span></div></div>
        <div class="pb-foot"><div class="pb-balls"></div></div></div>
        <div class="pb-orb"><b>MP<span></span></b></div>`
      : `<div class="pb-top"><span class="pb-name"></span><span class="pb-lv"></span></div>
        <div class="pb-line"><span class="pb-k">HP</span><div class="pb-bar"><span></span></div></div>
        <div class="pb-foot"><div class="pb-balls"></div><div class="pb-bracket"></div></div>`;
    (el.querySelector('.pb-name') as HTMLElement).textContent = v.name;
    const lv = el.querySelector('.pb-lv') as HTMLElement;
    lv.textContent = v.level ? `Lv ${v.level}` : '';
    // Their elements as pills ("FIRE"), beside the level.
    if (els.length) { const p = document.createElement('span'); p.className = 'pb-els'; p.innerHTML = els.map((e) => elementPill(e)).join(''); el.querySelector('.pb-top')!.append(p); }
    const xp = el.querySelector('.pb-xp span') as HTMLElement | null;
    if (xp && v.xp) xp.style.width = `${v.xp.next > 0 ? Math.max(0, Math.min(100, (v.xp.have / v.xp.next) * 100)) : 100}%`;
    el.addEventListener('click', () => this.tapFighter(v.key));
    return { el, hp: el.querySelector('.pb-bar span') as HTMLElement, num: el.querySelector('.pb-num'), orb: el.querySelector('.pb-orb'), orbText: el.querySelector('.pb-orb span') };
  }

  /** Pocket Handheld: a hero's EXP bar (0 … 1) and level, as EXP comes in during the battle. */
  setXp(key: string, frac: number, level?: number, up = false): void {
    const f = this.fighters.get(key);
    if (!f) return;
    const span = f.pb.el.querySelector('.pb-xp span') as HTMLElement | null;
    if (span) span.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
    const lv = f.pb.el.querySelector('.pb-lv') as HTMLElement;
    if (level) lv.textContent = `Lv ${level}`;
    if (up) { lv.classList.remove('up'); void lv.offsetWidth; lv.classList.add('up'); }
  }

  private xpTimers: number[] = [];
  /**
   * Pocket Handheld: fill a hero's EXP bar through each stretch (a level up empties it and ticks the level), ending
   * where it ends up. Each stretch takes a little under a second.
   */
  fillXp(key: string, segs: { level: number; from: number; to: number; up: boolean }[], after: { level: number; xp: number; toNext: number }): void {
    const f = this.fighters.get(key);
    const span = f?.pb.el.querySelector('.pb-xp span') as HTMLElement | null;
    if (!f || !span) return;
    const lv = f.pb.el.querySelector('.pb-lv') as HTMLElement;
    const list = segs.length ? segs : [{ level: after.level, from: after.toNext ? after.xp / after.toNext : 1, to: after.toNext ? after.xp / after.toNext : 1, up: false }];
    const STEP = 0.85;
    list.forEach((s, i) => {
      this.xpTimers.push(window.setTimeout(() => {
        // Jump (no slide) to where this stretch starts, then slide to its end.
        span.style.transition = 'none';
        span.style.width = `${Math.max(0, Math.min(100, s.from * 100))}%`;
        lv.textContent = `Lv ${s.level}`;
        void span.offsetWidth;
        span.style.transition = `width ${STEP}s ease-out`;
        span.style.width = `${Math.max(0, Math.min(100, s.to * 100))}%`;
        span.parentElement!.classList.toggle('full', s.up);
        if (s.up) this.xpTimers.push(window.setTimeout(() => { lv.textContent = `Lv ${s.level + 1}`; lv.classList.remove('up'); void lv.offsetWidth; lv.classList.add('up'); span.parentElement!.classList.remove('full'); }, STEP * 1000));
      }, i * (STEP + 0.15) * 1000));
    });
    // Ending exactly on a level up: the new level's empty bar (or what's carried into it) to finish.
    const last = list[list.length - 1];
    if (last.up) this.xpTimers.push(window.setTimeout(() => { span.style.transition = 'none'; span.style.width = `${after.toNext ? Math.min(100, (after.xp / after.toNext) * 100) : 100}%`; }, list.length * (STEP + 0.15) * 1000));
  }

  /**
   * Pocket Handheld's victory: no results screen; the EXP, level ups (with what they brought) and loot are told in
   * the text box a line at a time, each waiting for OK, then it goes on.
   */
  pocketVictory(lines: { text: string; sound?: string; bars?: () => void; stats?: string[]; icon?: string }[], done: () => void): void {
    this.idle();
    for (const l of lines) this.narrate(l.text, true, l);
    this.narrDone = done;
  }

  /* ---------------------------------------------------------------- Pocket Handheld's text box */
  private narr: Narration[] = [];
  private narrCur: (Narration & { t: number }) | null = null;
  private narrDone: (() => void) | null = null;

  /**
   * Pocket Handheld: a line in the text box. `wait`: it stays until OK (and the battle waits with it); otherwise the
   * next line replaces it. `extra`: a sound, bars to move and stat changes to show as it comes up.
   */
  narrate(text: string, wait = true, extra: { sound?: string; bars?: () => void; stats?: string[]; icon?: string } = {}): void {
    if (this.layout !== 'pocket' || !text) return;
    this.narr.push({ text, wait, sound: extra.sound, bars: extra.bars, stats: extra.stats, icon: extra.icon });
    if (!this.narrCur?.wait && !this.narrCur?.pause) this.nextLine();
  }

  /** Lines are being read (the battle waits for them). */
  get narrating(): boolean { return this.layout === 'pocket' && (!!this.narrCur?.wait || !!this.narrCur?.pause || this.narr.length > 0 || !!this.narrDone); }

  /** Pocket Handheld's HP numbers, counting toward the real ones. */
  private tickNumbers(dt: number): void {
    if (this.layout !== 'pocket') return;
    for (const f of this.fighters.values()) {
      const pb = f.pb;
      if (!pb.num || pb.shown === undefined || pb.to === undefined || pb.shown === pb.to) continue;
      const step = (pb.rate ?? 30) * dt;
      pb.shown = pb.shown > pb.to ? Math.max(pb.to, pb.shown - step) : Math.min(pb.to, pb.shown + step);
      pb.num.textContent = `${Math.round(pb.shown)} / ${pb.max}`;
    }
  }

  /** Pocket Handheld: hold the text box (and the battle) this long, the last line still up (a health bar draining). */
  pauseText(seconds: number): void {
    if (this.layout !== 'pocket' || seconds <= 0) return;
    const last = this.narr[this.narr.length - 1];
    if (last?.pause) { last.pause = Math.max(last.pause, seconds); return; }
    if (!this.narr.length && this.narrCur?.pause) { this.narrCur.pause = Math.max(this.narrCur.pause, this.narrCur.t + seconds); return; }
    this.narr.push({ text: '', wait: false, pause: seconds });
    if (!this.narrCur?.wait && !this.narrCur?.pause) this.nextLine();
  }

  /** Things to do a little later (a hit's flash once the attacker is back), on the battle's clock. */
  private timers: { t: number; fn: () => void }[] = [];
  after(seconds: number, fn: () => void): void { if (seconds <= 0) fn(); else this.timers.push({ t: seconds, fn }); }

  private nextLine(): void {
    const n = this.narr.shift();
    if (!n) {
      if (this.narrCur?.wait) this.narrCur = null;
      if (this.narrDone && !this.narrCur?.wait) { const d = this.narrDone; this.narrDone = null; d(); }
      return;
    }
    this.narrCur = { ...n, t: 0 };
    if (n.pause) return;
    this.pocketText.querySelector('.pt-text')!.textContent = '';
    const ic = this.pocketText.querySelector('.pt-icon') as HTMLImageElement;
    ic.hidden = !n.icon; if (n.icon) ic.src = n.icon;
    this.pocketText.classList.toggle('waits', n.wait);
    n.bars?.();
    if (n.sound) this.onSound?.(n.sound);
    const st = this.pocketText.querySelector('.pt-stats') as HTMLElement;
    st.hidden = !n.stats?.length;
    st.innerHTML = (n.stats ?? []).map((x) => `<div>${esc(x)}</div>`).join('');
  }

  private narrUpdate(dt: number): boolean {
    const c = this.narrCur;
    if (c?.pause) {
      c.t += dt;
      if (c.t >= c.pause) { this.narrCur = null; this.nextLine(); }
      this.input.consume('ok'); this.input.consume('cancel');
      return true;
    }
    if (c) {
      // Typed out a letter at a time.
      const was = Math.floor(c.t * TYPE_SPEED);
      c.t += dt;
      const n = Math.min(c.text.length, Math.floor(c.t * TYPE_SPEED));
      if (n !== was || n === c.text.length) { const el = this.pocketText.querySelector('.pt-text')!; if (el.textContent !== c.text.slice(0, n)) el.textContent = c.text.slice(0, n); }
      this.pocketText.classList.toggle('typed', n >= c.text.length);
    }
    if (!c?.wait) { if (this.narr.length || this.narrDone) this.nextLine(); return false; }
    if (this.mode.kind === 'list' || this.mode.kind === 'target') return false;
    // OK: the rest of the line at once, then (a moment after it's all there) on to the next.
    const full = c.t * TYPE_SPEED >= c.text.length;
    if (this.input.consume('ok') || this.input.consume('cancel')) {
      if (!full) c.t = c.text.length / TYPE_SPEED;
      else if (c.t - c.text.length / TYPE_SPEED > 0.15) { uiSound('menuOk'); this.narrCur = null; this.nextLine(); }
    }
    return true;
  }

  /** Pocket Handheld: the four spheres on a side's first block (up to fight, knocked out with a red ✕, or empty). */
  private sphereColors: Record<'party' | 'enemy', (string | undefined)[]> = { party: [], enemy: [] };
  setSpheres(side: 'party' | 'enemy', list: Sphere[], colors?: (string | undefined)[]): void {
    this.spheres[side] = Array.from({ length: 4 }, (_, i) => list[i] ?? 'empty');
    this.sphereColors[side] = colors ?? [];
    this.drawSpheres(side);
  }

  private drawSpheres(side: 'party' | 'enemy'): void {
    const box = this.root.querySelector(side === 'enemy' ? '.pocket-foes' : '.pocket-heroes')!;
    const blocks = [...box.querySelectorAll<HTMLElement>('.pb')];
    blocks.forEach((b, i) => {
      const balls = b.querySelector('.pb-balls') as HTMLElement;
      balls.replaceChildren(...(i === 0 ? this.spheres[side] : []).map((s, k) => { const x = document.createElement('i'); x.className = `pb-ball ${s}`; const c = s === 'up' ? this.sphereColors[side][k] : undefined; if (c) x.style.setProperty('--ball', c); x.title = s === 'up' ? 'Ready' : s === 'ko' ? 'Knocked out' : 'No one'; return x; }));
    });
  }

  /** A party member swapped in where another stood: their picture, card and row take the old one's place. */
  replaceFighter(oldKey: string, v: FighterView): void {
    const old = this.fighters.get(oldKey);
    if (!old) return;
    const n = this.partyEl.childElementCount;
    this.addFighter(v, Number(old.el.style.getPropertyValue('--i')) || 0, n);
    const f = this.fighters.get(v.key)!;
    old.el.replaceWith(f.el);
    old.pb.el.replaceWith(f.pb.el);
    this.drawSpheres(v.side);
    if (old.row && f.row) old.row.replaceWith(f.row);
    if (old.card && f.card) old.card.replaceWith(f.card);
    f.el.style.cssText = old.el.style.cssText;
    this.fighters.delete(oldKey);
  }

  /** Health and magic for one fighter (party rows show numbers; enemies a bar). */
  setVitals(key: string, v: Vitals): void {
    const f = this.fighters.get(key);
    if (!f) return;
    const down = v.hp <= 0;
    this.stage?.vitals(key, down, !!v.guarding, !!v.weak);
    // The target arrow's colour: cyan with plenty of health, yellow at half or less, red at a quarter or less.
    const share = v.hp / Math.max(1, v.maxHp);
    f.el.classList.toggle('hp-high', share > 0.5);
    f.el.classList.toggle('hp-mid', share <= 0.5 && share > 0.25);
    f.el.classList.toggle('hp-low', share <= 0.25);
    f.el.classList.toggle('down', down);
    f.el.classList.toggle('guarding', !!v.guarding);
    // Ailment icons over the fighter (and beside a party member's name).
    const sk = (v.status ?? []).map((x) => x.name).join('|');
    if (sk !== f.statusKey) {
      f.statusKey = sk;
      // Pocket Handheld: the ailment is a pill beside the name and level ("PSN"); only buffs stay over the head.
      const ail = [...(v.status ?? [])].reverse().find((x) => x.ailment);
      f.pb.el.querySelector('.st-pill')?.remove();
      if (ail) {
        const p = this.pills[ail.ailment!];
        if (p) {
          const s = document.createElement('span');
          s.className = 'st-pill'; s.title = ail.name;
          s.style.background = p.color; s.style.color = p.ink;
          s.textContent = this.pillWords === 'full' ? p.word : p.tag;
          f.pb.el.querySelector('.pb-lv')!.after(s);
        }
      }
      // Pocket Handheld: buffs are arrows beside the orbs, not over the head.
      const over = this.layout === 'pocket' ? [] : v.status ?? [];
      f.icons.replaceChildren(...over.map((x) => { const im = document.createElement('img'); im.src = x.icon; im.alt = x.name; im.title = x.name; return im; }));
      const make = () => (v.status ?? []).map((x) => { const im = document.createElement('img'); im.src = x.icon; im.alt = x.name; im.title = x.name; return im; });
      f.rowIcons?.replaceChildren(...make());
    }
    const bk = (v.buffs ?? []).map((c) => `${c.up}${c.tag}`).join();
    if (bk !== f.buffKey) {
      f.buffKey = bk;
      const foot = f.pb.el.querySelector('.pb-foot');
      foot?.querySelector('.bchips')?.remove();
      if (foot && v.buffs?.length) foot.querySelector('.pb-balls')!.insertAdjacentHTML('afterend', buffChipsHtml(v.buffs));
    }
    if (f.bar) f.bar.style.width = `${Math.max(0, Math.min(100, (v.hp / Math.max(1, v.maxHp)) * 100))}%`;
    // Pocket Handheld: the bar goes green, yellow, red; heroes' numbers and MP orb.
    const pb = f.pb;
    // The first draw jumps straight to the real health (no drain from full as the battle opens).
    const first = !pb.drawn;
    if (first) { pb.drawn = true; pb.el.classList.add('no-anim'); f.el.classList.add('no-anim'); }
    pb.hp.style.width = `${Math.max(0, Math.min(100, share * 100))}%`;
    pb.el.classList.toggle('mid', share <= 0.5 && share > 0.2);
    pb.el.classList.toggle('low', share <= 0.2);
    pb.el.classList.toggle('down', down);
    if (pb.num) {
      // Pocket Handheld: the numbers count down (or up) with the bar, Pokémon-style.
      const to = Math.ceil(Math.max(0, v.hp));
      if (pb.shown === undefined || this.layout !== 'pocket') { pb.shown = to; pb.num.textContent = `${to} / ${v.maxHp}`; }
      else if (to !== pb.to) pb.rate = Math.max(1, Math.abs(to - pb.shown) / DRAIN);
      pb.to = to; pb.max = v.maxHp;
    }
    if (pb.orb) {
      pb.orb.style.setProperty('--mp', String(v.maxMp ? Math.max(0, Math.min(1, v.mp / v.maxMp)) : 0));
      pb.orb.classList.toggle('none', !v.maxMp);
      pb.orbText!.textContent = String(Math.floor(v.mp));
      pb.orb.title = `MP ${Math.floor(v.mp)} / ${v.maxMp}`;
    }
    if (first) requestAnimationFrame(() => requestAnimationFrame(() => { pb.el.classList.remove('no-anim'); f.el.classList.remove('no-anim'); }));
    const b = this.blocks.get(key);
    if (b && first) { b.el.classList.add('no-anim'); requestAnimationFrame(() => requestAnimationFrame(() => b.el.classList.remove('no-anim'))); }
    if (b) {
      b.hp.style.width = `${Math.max(0, Math.min(100, share * 100))}%`;
      b.mpBar.classList.toggle('unused', !v.maxMp);
      b.mp.style.width = v.maxMp ? `${Math.max(0, Math.min(100, (v.mp / v.maxMp) * 100))}%` : '0%';
      b.el.classList.toggle('low', !down && share <= 0.25);
      b.el.classList.toggle('down', down);
    }
    if (f.row) {
      const q = (s: string) => f.row!.querySelector(s) as HTMLElement;
      q('.bstat-bar.hp span').style.width = `${Math.max(0, Math.min(100, (v.hp / Math.max(1, v.maxHp)) * 100))}%`;
      q('.bstat-bar.mp span').style.width = `${Math.max(0, Math.min(100, (v.mp / Math.max(1, v.maxMp)) * 100))}%`;
      q('.bstat-num.hp').textContent = `${Math.ceil(v.hp)}/${v.maxHp}`;
      q('.bstat-num.mp').textContent = `${Math.floor(v.mp)}/${v.maxMp}`;
      f.row.classList.toggle('down', down);
      f.row.classList.toggle('low', !down && v.hp <= v.maxHp * 0.25);
    }
    if (f.card) {
      // Numbers: white, yellow at half or less, red at a quarter or less.
      const tier = (n: number, mx: number) => (n / Math.max(1, mx) <= 0.25 ? 'low' : n / Math.max(1, mx) <= 0.5 ? 'mid' : '');
      const hp = f.card.querySelector('.dl-hp') as HTMLElement, mp = f.card.querySelector('.dl-mp') as HTMLElement;
      hp.textContent = `${Math.ceil(v.hp)}/${v.maxHp}`;
      mp.textContent = `${Math.floor(v.mp)}/${v.maxMp}`;
      hp.className = `dl-hp ${tier(v.hp, v.maxHp)}`;
      mp.className = `dl-mp ${v.maxMp ? tier(v.mp, v.maxMp) : ''}`;
      f.card.classList.toggle('down', down);
    }
  }

  /** The battle screen's look: Dragon Legend (default) or Forbidden Fantasy. */
  setLayout(l: 'dragon' | 'fantasy' | 'pocket'): void {
    this.layout = l;
    this.root.classList.toggle('layout-dragon', l === 'dragon');
    this.root.classList.toggle('layout-fantasy', l === 'fantasy');
    this.root.classList.toggle('layout-pocket', l === 'pocket');
  }

  get pocket(): boolean { return this.layout === 'pocket'; }

  /** Database → Menus → Battle layout: the Pocket Handheld pieces placed by hand (unset ones keep their place). */
  setBoxes(l: BattleLayout | undefined): void {
    const set = (sel: string, k: BattlePiece, withH: boolean) => {
      const el = this.root.querySelector<HTMLElement>(sel);
      if (el) el.style.cssText = l?.[k] ? pieceStyle(l[k], withH) : '';
    };
    set('.pocket-foes', 'foes', false);
    set('.pocket-heroes', 'heroes', false);
    set('.battle-bottom', 'cmds', false);
    set('.pocket-text', 'text', true);
    // The command box's own height (its tiles fill it).
    this.root.style.setProperty('--cmd-h-user', l?.cmds?.h !== undefined ? `${l.cmds.h}cqh` : '');
    this.root.classList.toggle('boxed-cmds', l?.cmds?.h !== undefined);
  }

  private pills: Record<string, StatusPill> = DEFAULT_STATUS_PILLS;
  private pillWords: 'short' | 'full' = 'short';
  /** Status pills (Pocket Handheld): each ailment's colours and text, and short tags or full words. */
  setPills(pills: Record<string, StatusPill>, words: 'short' | 'full'): void { this.pills = pills; this.pillWords = words; }

  /** Whose turn it is (highlighted), and the turn order after them. */
  setOrder(keys: string[], active: string | null): void {
    this.orderEl.replaceChildren(...keys.map((k, i) => {
      const f = this.fighters.get(k);
      const chip = document.createElement('div');
      chip.className = `border-chip ${f?.view.side ?? ''}${i === 0 ? ' now' : ''}`;
      const im = document.createElement('img');
      im.src = f?.view.icon ?? '';
      im.alt = '';
      if (f?.view.flip) im.classList.add('flip');
      const nm = document.createElement('span');
      nm.textContent = f?.view.name ?? k;
      chip.append(im, nm);
      return chip;
    }));
    this.stage?.active(active);
    this.activeKey = active;
    for (const [k, f] of this.fighters) {
      f.el.classList.toggle('active', k === active);
      f.row?.classList.toggle('active', k === active);
      f.card?.classList.toggle('active', k === active);
    }
  }

  /** Monster stat blocks across the top (set before `open`). */
  setBlocks(on: boolean): void {
    this.blocksOn = on;
    this.root.classList.toggle('blocks-on', on);
  }

  private addBlock(v: FighterView): void {
    const els = v.elements?.length ? v.elements.slice(0, 2) : [];
    const glow = els.length ? els.map((e) => ELEMENT_COLORS[e]) : NORMAL_GLOW;
    const el = document.createElement('div');
    el.className = 'mblock';
    el.style.setProperty('--g1', glow[0]);
    el.style.setProperty('--g2', glow[1] ?? glow[0]);
    el.innerHTML = `<img class="mb-pic" alt=""><div class="mb-info"><div class="mb-name"></div><div class="mb-el"></div>
      <div class="mb-bar hp"><span></span></div><div class="mb-bar mp"><span></span></div></div>${v.overdrive ? '<div class="mb-od"><span></span><b>OVERDRIVE</b></div>' : ''}`;
    const pic = el.querySelector('.mb-pic') as HTMLImageElement;
    pic.src = v.icon;
    if (v.flip) pic.classList.add('flip');
    (el.querySelector('.mb-name') as HTMLElement).textContent = v.name;
    if (v.level) { const lv = document.createElement('span'); lv.className = 'bf-lv'; lv.textContent = `Lv ${v.level}`; el.querySelector('.mb-name')!.append(' ', lv); }
    const elEl = el.querySelector('.mb-el') as HTMLElement;
    elEl.innerHTML = (els.length ? els : ['neutral' as Element]).map((e) => elementPill(e)).join(' ');
    el.addEventListener('click', () => this.tapFighter(v.key));
    this.blocksEl.append(el);
    const mpBar = el.querySelector('.mb-bar.mp') as HTMLElement;
    this.blocks.set(v.key, { el, hp: el.querySelector('.mb-bar.hp span') as HTMLElement, mp: mpBar.querySelector('span') as HTMLElement, mpBar, od: el.querySelector('.mb-od') as HTMLElement | null });
  }

  /** A boss's overdrive gauge (0 … 100; full: it glows). */
  setOverdrive(key: string, pct: number): void {
    const od = this.blocks.get(key)?.od;
    if (!od) return;
    (od.querySelector('span') as HTMLElement).style.width = `${Math.max(0, Math.min(100, pct))}%`;
    od.classList.toggle('full', pct >= 100);
  }

  /** A line in the battle log (left side). */
  logLine(text: string, cls?: string): void {
    // Pocket Handheld shows messages in the log too: the same words twice in a row ("steps in!", "steps in") once.
    const same = (a: string) => a.trim().replace(/[.!]+$/, '');
    if (this.layout === 'pocket' && same(this.logLines.lastElementChild?.textContent ?? '') === same(text)) return;
    const p = document.createElement('div');
    p.textContent = text;
    if (cls) p.className = cls;
    this.logLines.append(p);
    while (this.logLines.childElementCount > 200) this.logLines.firstElementChild?.remove();
    // Keep showing the newest unless the player is reading back.
    if (!this.logFocus) this.logLines.scrollTop = this.logLines.scrollHeight;
  }

  private focusLog(on: boolean): void {
    this.logFocus = on;
    this.logEl.classList.toggle('focused', on);
    (this.logEl.querySelector('.battle-log-hint') as HTMLElement).textContent = on ? '↑ ↓ scroll · Y or Back: done' : 'Y: battle log';
    if (on) uiSound('menuOk');
    else this.logLines.scrollTop = this.logLines.scrollHeight;
  }

  /** What flies off a fighter when hit: bits in each effect's colour (blood, sparks, chips, a splash, wisps…). */
  impact(key: string, fx: { kind: ImpactFx; color: string }[], big = false): void {
    const f = this.fighters.get(key);
    if (!f) return;
    for (const e of fx) {
      const n = (e.kind === 'sparks' || e.kind === 'crystal' ? 10 : e.kind === 'wisps' ? 6 : 9) * (big ? 1.5 : 1);
      for (let k = 0; k < n; k++) {
        const b = document.createElement('span');
        b.className = `bfx ${e.kind}`;
        const ang = Math.random() * Math.PI * 2, d = 26 + Math.random() * 40 * (big ? 1.4 : 1);
        b.style.setProperty('--dx', `${Math.cos(ang) * d}px`);
        b.style.setProperty('--dy', `${e.kind === 'wisps' ? -30 - Math.random() * 40 : Math.sin(ang) * d * 0.7 - 10}px`);
        b.style.setProperty('--c', e.color);
        b.style.setProperty('--s', `${(e.kind === 'splash' ? 5 : e.kind === 'sparks' ? 3 : 4) + Math.random() * 3}px`);
        b.style.animationDelay = `${Math.random() * 0.05}s`;
        f.el.append(b);
        setTimeout(() => b.remove(), 900);
      }
    }
  }

  /** A hard shake of the whole screen (a CRITICAL). */
  shake(): void {
    this.root.classList.remove('shake');
    void this.root.offsetWidth;
    this.root.classList.add('shake');
    this.stage?.shake?.(0.35);
  }

  /** "+10 EXP" at the bottom left (Legend of Dragoon's SP): each line rises and fades. */
  expPop(text: string): void {
    let box = this.root.querySelector<HTMLElement>('.battle-exp');
    if (!box) { box = document.createElement('div'); box.className = 'battle-exp'; box.setAttribute('aria-live', 'polite'); this.root.append(box); }
    const line = document.createElement('div');
    line.className = 'battle-exp-line';
    line.textContent = text;
    box.append(line);
    while (box.children.length > 5) box.firstElementChild!.remove();
    setTimeout(() => line.remove(), 2200);
  }

  /** The battle's weather (a badge under the turn order), or none. */
  setWeather(text: string | null): void {
    let el = this.root.querySelector<HTMLElement>('.battle-weather');
    if (!text) { el?.remove(); return; }
    if (!el) { el = document.createElement('div'); el.className = 'battle-weather'; el.setAttribute('role', 'status'); this.root.append(el); }
    el.textContent = text;
  }

  /** A line at the top. Without `hold` it fades after a moment. */
  message(text: string, hold = false): void {
    // Pocket Handheld: messages go in the text box at the bottom (the battle log).
    if (this.layout === 'pocket' && text) this.narrate(text, false);
    this.msgEl.textContent = text;
    this.msgEl.classList.toggle('on', !!text);
    this.msgTimer = hold ? Infinity : 2.2;
  }


  /** A number or word rising from a fighter. */
  popup(key: string, text: string, kind: 'dmg' | 'crit' | 'heal' | 'info' | 'mp' | 'big' | 'critBig' = 'dmg', color?: string): void {
    const f = this.fighters.get(key);
    if (!f) return;
    const el = document.createElement('span');
    el.className = `bpop ${kind}`;
    el.textContent = text;
    if (color) el.style.color = color;
    const n = f.el.querySelectorAll('.bpop').length;
    el.style.setProperty('--lift', `${n * 28}px`);
    f.el.append(el);
    setTimeout(() => el.remove(), 1300);
  }

  /**
   * Step forward and back (an attack, at `target` when given), shake (hit; a colour: a spell's impact), flash in a
   * colour (a spell), or fall (knocked out).
   */
  animate(key: string, anim: Anim, color?: string, target?: string): void {
    const f = this.fighters.get(key);
    if (!f) return;
    this.stage?.animate(key, anim, color, target);
    if (anim === 'back' || anim === 'pose' || anim === 'unpose' || anim === 'toss') return;
    const how = anim === 'approach' || anim === 'strike' ? 'lunge' : anim;
    f.el.classList.remove('lunge', 'hit', 'cast', 'heal', 'faint', 'dodge');
    if (color) f.el.style.setProperty('--fx', color);
    void f.el.offsetWidth;
    f.el.classList.add(how);
    if (how !== 'faint') setTimeout(() => f.el.classList.remove(how), 650);
  }

  /** A white flash over everything (critical hits, the battle starting). */
  flash(color = '#fff'): void {
    this.flashEl.style.background = color;
    this.flashEl.classList.remove('go');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('go');
  }

  /* ------------------------------------------------------------------ questions */

  /** A list to pick from (commands, spells, items). */
  choose(title: string, items: ChoiceItem[], pick: (i: number) => void, back?: () => void, hover?: (i: number) => void, start = 0, bar = false): void {
    // A choice means the fight is on: no results panel can still be showing (one was seen over a later turn).
    if (!this.vic) { for (const el of this.root.querySelectorAll('.battle-victory')) el.remove(); this.leftover = null; }
    const first = items[start] && !items[start].disabled ? start : Math.max(0, items.findIndex((i) => !i.disabled));
    this.mode = { kind: 'list', title, items, index: first, pick, back, hover, bar };
    this.renderList();
    hover?.(first);
  }

  /**
   * Pick a fighter (arrows cycle, OK confirms). `all`: the whole group is hit (shown, not chosen); with `other`,
   * left / right switch to that group instead (a healing spell on every foe, say), and the pick is its first key.
   */
  target(keys: string[], pick: (key: string) => void, back: () => void, start?: string, all = false, other?: string[]): void {
    if (!keys.length) { back(); return; }
    // Two rows, enemies above and the party below, each left to right as on screen: left / right move along a row,
    // up / down change rows. A whole group (`all`) is one choice per row.
    const x = (k: string) => { const f = this.fighters.get(k); return f ? f.el.getBoundingClientRect().left + f.el.offsetWidth / 2 : 0; };
    const side = (k: string) => this.fighters.get(k)?.view.side ?? 'enemy';
    const pool = all ? [...keys, ...(other ?? [])] : keys;
    const rows = (['enemy', 'party'] as const).map((sd) => pool.filter((k) => side(k) === sd).sort((a, b) => x(a) - x(b))).filter((r) => r.length);
    const first = start && pool.includes(start) ? start : keys[0];
    const keysRow = rows.find((r) => r.includes(first)) ?? rows[0];
    this.mode = { kind: 'target', keys: keysRow, index: Math.max(0, keysRow.indexOf(first)), pick, back, all, rows };
    this.cmdEl.hidden = true;
    this.descEl.hidden = true;
    this.renderTarget();
  }

  /**
   * Pocket Handheld: choose whom from lists side by side (left / right between them, up / down along one), a ▶ on
   * the choice; `start`: the list the cursor begins in.
   */
  pickFromLists(lists: PickList[], start: number, pick: (key: string) => void, back: () => void): void {
    const firstOk = (l: PickList) => Math.max(0, l.rows.findIndex((r) => !r.disabled));
    this.mode = { kind: 'lists', lists, col: Math.max(0, Math.min(lists.length - 1, start)), rows: lists.map(firstOk), pick, back };
    this.cmdEl.hidden = true;
    this.descEl.hidden = true;
    this.renderLists();
  }

  private renderLists(): void {
    const m = this.mode;
    let box = this.root.querySelector<HTMLElement>('.pocket-pick');
    if (m.kind !== 'lists') { box?.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'pocket-pick'; this.root.append(box); }
    const bar = (a: number, b: number) => { const f = b > 0 ? Math.max(0, Math.min(1, a / b)) : 0; return `<span class="pp-bar${f <= 0.2 ? ' low' : f <= 0.5 ? ' mid' : ''}"><i style="width:${f * 100}%"></i></span>`; };
    box.innerHTML = m.lists.map((l, c) => `<div class="pp-col${c === m.col ? ' on' : ''}"><h4>${esc(l.title)}</h4>${l.rows.map((r, k) => `<button type="button" class="pp-row${r.gold ? ' gold' : ''}${r.down ? ' down' : ''}${c === m.col && k === m.rows[c] ? ' sel' : ''}" data-c="${c}" data-k="${k}"${r.disabled ? ' disabled' : ''}>
      <b>${esc(r.name)}${buffChipsHtml(r.buffs)}</b><small>HP ${Math.round(r.hp)} / ${r.maxHp}${r.maxMp ? ` · MP ${Math.round(r.mp ?? 0)} / ${r.maxMp}` : ''}${r.down ? ' · KO' : ''}</small>${bar(r.hp, r.maxHp)}</button>`).join('') || '<p class="pp-none">No one</p>'}</div>`).join('');
    box.querySelectorAll<HTMLElement>('.pp-row').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      const mm = this.mode;
      if (mm.kind !== 'lists') return;
      const c = Number(el.dataset.c), k = Number(el.dataset.k), r = mm.lists[c].rows[k];
      if (!r || r.disabled) return;
      uiSound('menuOk'); this.idle(); mm.pick(r.key);
    }));
  }

  /** Change to the enemies' row (up) or the party's (down), landing on whoever is nearest on screen. */
  private changeRow(m: Extract<Mode, { kind: 'target' }>, side: 'enemy' | 'party'): boolean {
    const row = m.rows.find((r) => this.fighters.get(r[0])?.view.side === side);
    if (!row || row === m.keys) return false;
    const at = this.fighters.get(m.keys[m.index])?.el.getBoundingClientRect();
    const cx = at ? at.left + at.width / 2 : 0;
    let best = 0, bd = Infinity;
    row.forEach((k, i) => { const r = this.fighters.get(k)!.el.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - cx); if (d < bd) { bd = d; best = i; } });
    m.keys = row; m.index = best;
    return true;
  }

  /** Wait for OK (or a tap), then go on. */
  waitForOk(done: () => void): void { this.mode = { kind: 'wait', done }; this.cmdEl.hidden = true; }

  /** Nothing to answer (enemies acting, animations). */
  idle(): void { this.mode = { kind: 'idle' }; this.root.querySelector('.pocket-pick')?.remove(); this.cmdEl.hidden = true; this.descEl.hidden = true; this.root.classList.remove('bar-mode', 'list-mode'); this.clearTargets(); }

  /** The victory panel: a heading and lines (EXP, gold, items, level-ups). */
  result(title: string, lines: string[]): void {
    this.resultEl.replaceChildren();
    const h = document.createElement('div');
    h.className = 'battle-result-title';
    h.textContent = title;
    const list = document.createElement('div');
    list.className = 'battle-result-list';
    for (const l of lines) { const p = document.createElement('div'); p.textContent = l; list.append(p); }
    const hint = document.createElement('div');
    hint.className = 'battle-result-hint';
    hint.textContent = 'OK to continue';
    this.resultEl.append(h, list, hint);
    this.resultEl.hidden = false;
  }

  private renderList(): void {
    const m = this.mode;
    if (m.kind !== 'list') return;
    // Choosing what to do: the arrow over the one whose turn it is.
    for (const [k, f] of this.fighters) f.el.classList.toggle('turn', k === this.activeKey && f.view.side === 'party');
    this.cmdEl.hidden = false;
    this.cmdTitle.textContent = m.title;
    this.cmdEl.classList.toggle('bar', !!m.bar);
    this.root.classList.toggle('bar-mode', !!m.bar);
    this.root.classList.toggle('list-mode', !m.bar);
    // The Swap list (Update 125): compact rows that share the panel's height.
    this.cmdEl.classList.toggle('swap', !m.bar && m.items.some((x) => !!x.bars));
    if (m.bar) {
      this.descEl.hidden = true;
      // Legend of Dragoon: a row of pictures, the chosen one raised, named underneath.
      this.cmdList.replaceChildren(...m.items.map((it, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bcmd-tile';
        b.disabled = !!it.disabled;
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(i === m.index));
        b.setAttribute('aria-label', it.label);
        b.innerHTML = `${svgIcon(it.icon ?? '')}<span class="bcmd-tile-label"></span>`;
        (b.querySelector('.bcmd-tile-label') as HTMLElement).textContent = it.label;
        b.addEventListener('pointerenter', () => { if (this.mode === m && !it.disabled && m.index !== i) { m.index = i; this.renderList(); m.hover?.(i); } });
        b.addEventListener('click', () => { if (this.mode !== m || it.disabled) return; m.index = i; uiSound('menuOk'); this.idle(); m.pick(i); });
        return b;
      }));
      const it = m.items[m.index];
      this.capEl.textContent = it ? [it.right, it.detail].filter(Boolean).join(' · ') : '';
      return;
    }
    this.capEl.textContent = '';
    // Dragon Legend: the list in the middle with pictures, and what the chosen one does in a box at the top.
    const dragon = this.layout === 'dragon';
    const cur = m.items[m.index];
    this.descEl.hidden = !dragon || !cur?.detail;
    this.descEl.textContent = dragon ? cur?.detail ?? '' : '';
    this.cmdList.replaceChildren(...m.items.map((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bcmd';
      b.disabled = !!it.disabled;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(i === m.index));
      if (dragon) {
        const ic = document.createElement('span');
        ic.className = 'bcmd-icon';
        if (it.iconUrl) { const im = document.createElement('img'); im.src = it.iconUrl; im.alt = ''; ic.append(im); }
        else if (it.icon) { ic.innerHTML = svgIcon(it.icon); if (it.iconColor) ic.style.color = it.iconColor; }
        b.append(ic);
      }
      if (!dragon && it.inlineIcon) {
        const ic = document.createElement('span');
        ic.className = 'bcmd-inline-icon';
        if (it.iconUrl) { const im = document.createElement('img'); im.src = it.iconUrl; im.alt = ''; ic.append(im); }
        else if (it.icon) { ic.innerHTML = svgIcon(it.icon); if (it.iconColor) ic.style.color = it.iconColor; }
        b.append(ic);
      }
      const l = document.createElement('span'); l.className = 'bcmd-label'; l.textContent = it.label;
      if (it.buffs?.length) l.insertAdjacentHTML('beforeend', buffChipsHtml(it.buffs));
      b.append(l);
      if (it.bars) {
        // The Swap list: health, magic and EXP under the name.
        const v = it.bars, w = (a: number, m: number) => `${Math.max(0, Math.min(100, (a / Math.max(1, m)) * 100))}%`;
        const share = v.hp / Math.max(1, v.maxHp);
        const bars = document.createElement('span');
        bars.className = `bcmd-bars${share <= 0.2 ? ' low' : share <= 0.5 ? ' mid' : ''}`;
        bars.innerHTML = `<span class="bbw"><em>HP ${Math.ceil(v.hp)} / ${v.maxHp}</em><span class="bb hp"><i style="width:${w(v.hp, v.maxHp)}"></i></span></span>`
          + (v.maxMp ? `<span class="bbw"><em>MP ${Math.floor(v.mp)} / ${v.maxMp}</em><span class="bb mp"><i style="width:${w(v.mp, v.maxMp)}"></i></span></span>` : '')
          + (v.xp !== undefined ? `<span class="bbw"><em>EXP ${Math.round(v.xp * 100)}%</em><span class="bb xp"><i style="width:${Math.round(v.xp * 100)}%"></i></span></span>` : '');
        b.append(bars);
        b.classList.add('with-bars');
      }
      if (it.right) { const r = document.createElement('span'); r.className = 'bcmd-right'; r.textContent = it.right; b.append(r); }
      if (it.detail && !dragon) { const d = document.createElement('span'); d.className = 'bcmd-detail'; d.textContent = it.detail; b.append(d); }
      b.addEventListener('pointerenter', () => { if (this.mode === m && !it.disabled && m.index !== i) { m.index = i; this.renderList(); m.hover?.(i); } });
      b.addEventListener('click', () => { if (this.mode !== m || it.disabled) return; m.index = i; uiSound('menuOk'); this.idle(); m.pick(i); });
      return b;
    }));
    (this.cmdList.children[m.index] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }

  private renderTarget(): void {
    const m = this.mode;
    this.clearTargets();
    if (m.kind !== 'target') return;
    m.keys.forEach((k, i) => { const f = this.fighters.get(k); f?.el.classList.toggle('targeted', m.all || i === m.index); f?.pb.el.classList.toggle('targeted', m.all || i === m.index); f?.card?.classList.toggle('targeted', m.all || i === m.index); this.blocks.get(k)?.el.classList.toggle('targeted', m.all || i === m.index); });
    this.stage?.highlight(m.all ? m.keys : [m.keys[m.index]]);
    const f = this.fighters.get(m.keys[m.index]);
    if (this.layout !== 'pocket') this.message(m.all ? (f?.view.side === 'party' ? 'The whole party' : 'Every foe') : f ? f.view.name : '', true);
  }

  private clearTargets(): void { for (const f of this.fighters.values()) { f.el.classList.remove('targeted', 'turn'); f.card?.classList.remove('targeted'); f.pb.el.classList.remove('targeted'); } for (const b of this.blocks.values()) b.el.classList.remove('targeted'); this.stage?.highlight([]); }

  private tapFighter(key: string): void {
    const m = this.mode;
    if (m.kind !== 'target') return;
    // A fighter in the other row: change rows to them.
    const row = m.rows.find((r) => r.includes(key));
    if (!row) return;
    if (row !== m.keys) { m.keys = row; m.index = m.all ? 0 : row.indexOf(key); this.renderTarget(); uiSound('menuMove'); return; }
    if (m.all) { uiSound('menuOk'); this.idle(); this.message(''); m.pick(m.keys[0]); return; }
    if (m.keys[m.index] !== key) { m.index = m.keys.indexOf(key); this.renderTarget(); uiSound('menuMove'); return; }
    uiSound('menuOk');
    this.idle();
    this.message('');
    m.pick(key);
  }

  private finishWait(): void {
    const m = this.mode;
    if (m.kind !== 'wait') return;
    this.mode = { kind: 'idle' };
    uiSound('menuOk');
    m.done();
  }

  /** Keys and buttons, and the message timer. */
  update(dt: number): void {
    if (this.timers.length) {
      const due = this.timers.filter((x) => (x.t -= dt) <= 0);
      if (due.length) { this.timers = this.timers.filter((x) => x.t > 0); for (const x of due) x.fn(); }
    }
    this.tickNumbers(dt);
    if (this.msgTimer !== Infinity && this.msgTimer > 0 && (this.msgTimer -= dt) <= 0) this.msgEl.classList.remove('on');
    if (this.vic) { this.updateVictory(dt); return; }
    if (this.camTimer > 0 && (this.camTimer -= dt) <= 0) this.camEl.classList.remove('lit');
    if (this.qte) { this.updateQte(dt); return; }
    if (this.seq) { this.updateSeq(dt); return; }
    if (this.layout === 'pocket') {
      // The text box moves to the middle while there are no commands beside it.
      this.root.classList.toggle('cmd-off', this.cmdEl.hidden === true);
      if (this.narrUpdate(dt)) return;
    }
    const i = this.input, m = this.mode;
    // The controller's Y (and R) picks the battle log; while picked, up / down scroll it and Back lets go.
    if (i.consume('switchWeapon')) this.focusLog(!this.logFocus);
    if (this.logFocus) {
      if (i.consume('up')) this.logLines.scrollBy({ top: -48, behavior: 'smooth' });
      if (i.consume('down')) this.logLines.scrollBy({ top: 48, behavior: 'smooth' });
      if (i.consume('cancel') || i.consume('ok')) { this.focusLog(false); uiSound('menuBack'); }
      for (const a of ['left', 'right'] as const) i.consume(a);
      return;
    }
    if (m.kind === 'list') {
      const step = (d: number) => {
        const n = m.items.length;
        for (let k = 1; k <= n; k++) { const j = (m.index + d * k + n * k) % n; if (!m.items[j].disabled) { m.index = j; break; } }
        uiSound('menuMove');
        this.renderList();
        m.hover?.(m.index);
      };
      // Pocket Handheld's commands are a 3 × 2 grid: up / down move a row.
      const grid = m.bar && this.layout === 'pocket' ? 3 : 1;
      if (i.consume('down')) step(grid); else if (m.bar && i.consume('right')) step(1);
      if (i.consume('up')) step(-grid); else if (m.bar && i.consume('left')) step(-1);
      if (i.consume('ok')) { const it = m.items[m.index]; if (it && !it.disabled) { uiSound('menuOk'); this.idle(); m.pick(m.index); } }
      else if (i.consume('cancel') && m.back) { uiSound('menuBack'); this.idle(); m.back(); }
    } else if (m.kind === 'target') {
      const n = m.keys.length;
      let moved = false;
      if (i.consume('up')) moved = this.changeRow(m, 'enemy');
      if (i.consume('down')) moved = this.changeRow(m, 'party') || moved;
      if (!m.all) {
        if (i.consume('right')) { m.index = (m.index + 1) % n; moved = true; }
        if (i.consume('left')) { m.index = (m.index - 1 + n) % n; moved = true; }
      } else {
        // A whole row: left / right also swap rows.
        const l = i.consume('left'), r = i.consume('right');
        if ((l || r) && m.rows.length > 1) { const other = m.rows.find((x) => x !== m.keys)!; m.keys = other; m.index = 0; moved = true; }
      }
      if (moved) { uiSound('menuMove'); this.renderTarget(); }
      if (i.consume('ok')) { uiSound('menuOk'); const k = m.keys[m.index]; this.idle(); this.message(''); m.pick(k); }
      else if (i.consume('cancel')) { uiSound('menuBack'); this.idle(); this.message(''); m.back(); }
    } else if (m.kind === 'wait') {
      if (i.consume('ok') || i.consume('cancel')) this.finishWait();
    } else if (m.kind === 'lists') {
      const list = m.lists[m.col], n = list.rows.length;
      const step = (d: number) => { if (!n) return; let k = m.rows[m.col]; for (let t = 0; t < n; t++) { k = (k + d + n) % n; if (!list.rows[k].disabled) break; } m.rows[m.col] = k; };
      let moved = false;
      if (i.consume('down')) { step(1); moved = true; }
      if (i.consume('up')) { step(-1); moved = true; }
      if (i.consume('right') && m.col < m.lists.length - 1 && m.lists[m.col + 1].rows.length) { m.col++; moved = true; }
      if (i.consume('left') && m.col > 0 && m.lists[m.col - 1].rows.length) { m.col--; moved = true; }
      if (moved) { uiSound('menuMove'); this.renderLists(); }
      if (i.consume('ok')) { const r = m.lists[m.col].rows[m.rows[m.col]]; if (r && !r.disabled) { uiSound('menuOk'); this.idle(); m.pick(r.key); } }
      else if (i.consume('cancel')) { uiSound('menuBack'); this.idle(); m.back(); }
    }
  }

  /** The battle field's size, for laying out sprites (unused for now, kept for later camera work). */
  get bounds(): DOMRect { return this.field.getBoundingClientRect(); }

  /** A close camera on a 3D stage (an Addition, a caster), or back to the usual one (null). */
  shot(kind: 'addition' | 'cast' | null, a?: string, t?: string, snap = false): void { this.stage?.shot?.(kind, a, t, snap); }

  /** Fade the whole battle screen away over `secs` (leaving the battle). */
  fadeOut(secs: number): void {
    this.root.style.transition = `opacity ${secs}s ease`;
    this.root.style.opacity = '0';
  }

  /* ------------------------------------------------------------------ the victory screens: EXP, then loot */

  /**
   * After a win: each hero's EXP bar fills in turn (a level up dings and lists what it brought), then the loot,
   * row by row, each with its sound. OK hurries things along; at the end B (or OK, or a tap) goes on: `done`.
   */
  victory(report: VictoryReport, done: () => void): void {
    this.idle();
    this.message('');
    this.setOrder([], null);
    const el = document.createElement('div');
    el.className = 'battle-victory';
    el.innerHTML = `<div class="bv-head"><span class="bv-title">Victory!</span><span class="bv-xp"></span></div><div class="bv-body"></div><div class="bv-hint"></div>`;
    (el.querySelector('.bv-xp') as HTMLElement).textContent = report.xp > 0 ? `+${report.xp} EXP` : '';
    const body = el.querySelector('.bv-body') as HTMLElement;
    const heroes = report.heroes.map((h) => {
      const row = document.createElement('div');
      row.className = `bv-hero${h.out ? ' out' : ''}`;
      if (h.color) row.style.setProperty('--hero', h.color);
      row.innerHTML = `<img class="bv-face" alt=""><div class="bv-main"><div class="bv-line"><span class="bv-name"></span><span class="bv-lv"></span><span class="bv-badge">Level up!</span></div>
        <div class="bv-bar"><span></span></div><div class="bv-num"></div><div class="bv-note"></div><div class="bv-changes"></div></div>`;
      (row.querySelector('.bv-face') as HTMLImageElement).src = h.icon;
      (row.querySelector('.bv-name') as HTMLElement).textContent = h.name;
      const v: VicHeroView = { h, fill: row.querySelector('.bv-bar span') as HTMLElement, num: row.querySelector('.bv-num') as HTMLElement, lv: row.querySelector('.bv-lv') as HTMLElement,
        badge: row.querySelector('.bv-badge') as HTMLElement, changes: row.querySelector('.bv-changes') as HTMLElement };
      v.lv.textContent = `Lv ${h.level}`;
      v.fill.style.width = `${h.toNext ? Math.min(100, (h.xp / h.toNext) * 100) : 100}%`;
      v.num.textContent = h.out ? 'Knocked out: no EXP' : h.toNext ? `${h.xp} / ${h.toNext} EXP` : 'Top level';
      (row.querySelector('.bv-note') as HTMLElement).textContent = h.out ? '' : h.note ?? '';
      body.append(row);
      return v;
    });
    this.root.append(el);
    this.vic = { report, done, el, hint: el.querySelector('.bv-hint') as HTMLElement, page: 'exp', heroes, hero: 0, seg: 0, t: 0, pause: 0.9, started: false, rows: [], row: 0 };
    this.vic.hint.textContent = 'OK to skip';
  }

  private vicSound(name: string): void { this.onSound?.(name); }
  /** Play one of the victory screen's sounds (a level up, the EXP filling). */
  cue(name: string): void { this.onSound?.(name); }

  /** OK / B / a tap on the victory screens: hurry the animation, or go on. */
  private vicNext(): void {
    const v = this.vic!;
    if (v.page === 'exp') { this.finishExp(true); return; }
    if (v.page === 'expDone') { this.showLoot(); uiSound('menuOk'); return; }
    if (v.page === 'loot') { while (v.row < v.rows.length) this.revealLoot(false); this.lootDone(); return; }
    // The end: on to the field.
    const done = v.done;
    v.hint.textContent = '';
    this.vic = null;
    // The panel goes with the battle screen as it fades (and never carries over into the next battle).
    this.leftover = v.el;
    uiSound('menuOk');
    done();
  }

  private updateVictory(dt: number): void {
    const v = this.vic!, i = this.input;
    const okKey = i.consume('ok'), backKey = i.consume('cancel');
    if (okKey || backKey) { this.vicNext(); return; }
    if (v.page === 'exp') {
      if (v.pause > 0) { v.pause -= dt; return; }
      const hv = v.heroes[v.hero];
      if (!hv) { this.finishExp(false); return; }
      const seg = hv.h.segments[v.seg];
      if (!seg) { v.hero++; v.seg = 0; v.started = false; v.pause = 0.25; return; }
      if (!v.started) { v.started = true; v.t = 0; this.vicSound('expFill'); }
      const dur = Math.max(0.35, (seg.to - seg.from) * 1.0);
      v.t += dt;
      const k = Math.min(1, v.t / dur), f = seg.from + (seg.to - seg.from) * k;
      hv.fill.style.width = `${f * 100}%`;
      hv.num.textContent = `${Math.round(f * seg.toNext)} / ${seg.toNext} EXP`;
      if (k >= 1) {
        v.started = false;
        v.seg++;
        if (seg.up) { this.levelUp(hv, seg.level + 1); v.pause = 1.1; } else v.pause = 0.15;
      }
    } else if (v.page === 'loot') {
      v.t += dt;
      if (v.t >= 0.4) { v.t = 0; this.revealLoot(true); if (v.row >= v.rows.length) this.lootDone(); }
    }
  }

  private barAt(hv: VicHeroView, a: { level: number; xp: number; toNext: number }): void {
    hv.fill.style.width = `${a.toNext ? Math.min(100, (a.xp / a.toNext) * 100) : 100}%`;
    hv.num.textContent = a.toNext ? `${a.xp} / ${a.toNext} EXP` : 'Top level';
  }

  private levelUp(hv: VicHeroView, level: number, sound = true): void {
    hv.fill.style.width = '0%';
    if (level === hv.h.after.level) hv.num.textContent = hv.h.after.toNext ? `0 / ${hv.h.after.toNext} EXP` : 'Top level';
    hv.lv.textContent = `Lv ${level}`;
    hv.badge.classList.add('on');
    hv.lv.classList.add('up');
    if (hv.h.changes.length && !hv.changes.childElementCount) for (const c of hv.h.changes) { const d = document.createElement('span'); d.textContent = c; hv.changes.append(d); }
    if (sound) { this.vicSound('expDing'); setTimeout(() => this.vicSound('levelUp'), 180); }
  }

  /** Every bar straight to where it ends (a level up still chimes, once). */
  private finishExp(hurry: boolean): void {
    const v = this.vic!;
    let ups = false;
    for (const hv of v.heroes.slice(v.hero)) {
      const segs = hv.h.segments, last = segs[segs.length - 1];
      for (const sg of segs.slice(hv === v.heroes[v.hero] ? v.seg : 0)) if (sg.up) { this.levelUp(hv, sg.level + 1, false); ups = true; }
      if (last) this.barAt(hv, hv.h.after);
    }
    if (hurry && ups) this.vicSound('levelUp');
    v.hero = v.heroes.length;
    v.page = 'expDone';
    v.hint.textContent = 'OK: spoils';
  }

  private showLoot(): void {
    const v = this.vic!;
    v.page = 'loot';
    (v.el.querySelector('.bv-title') as HTMLElement).textContent = 'Spoils';
    (v.el.querySelector('.bv-xp') as HTMLElement).textContent = '';
    const body = v.el.querySelector('.bv-body') as HTMLElement;
    body.classList.add('loot');
    body.replaceChildren();
    v.rows = v.report.loot.map((l) => {
      const r = document.createElement('div');
      r.className = `bv-loot ${l.kind}`;
      r.innerHTML = `<img alt=""><span class="bv-loot-name"></span><span class="bv-loot-n"></span>${l.note ? '<span class="bv-loot-note"></span>' : ''}`;
      (r.querySelector('img') as HTMLImageElement).src = l.icon;
      (r.querySelector('.bv-loot-name') as HTMLElement).textContent = l.name;
      (r.querySelector('.bv-loot-n') as HTMLElement).textContent = l.kind === 'gold' ? '' : `×${l.count}`;
      if (l.note) (r.querySelector('.bv-loot-note') as HTMLElement).textContent = l.note;
      body.append(r);
      return r;
    });
    if (!v.rows.length) { const p = document.createElement('div'); p.className = 'bv-empty'; p.textContent = 'Nothing found.'; body.append(p); }
    v.row = 0; v.t = 0.25;
    v.hint.textContent = 'OK to skip';
    if (!v.rows.length) this.lootDone();
  }

  private revealLoot(sound: boolean): void {
    const v = this.vic!, r = v.rows[v.row], l = v.report.loot[v.row];
    if (!r || !l) return;
    r.classList.add('on');
    if (sound) this.vicSound(LOOT_SOUND[l.kind]);
    v.row++;
  }

  private lootDone(): void {
    const v = this.vic!;
    v.page = 'lootDone';
    v.hint.textContent = this.input.lastDevice === 'pad' ? 'Press B to continue' : 'Press Esc to continue';
    v.hint.classList.add('go');
  }

  /* ------------------------------------------------------------------ Additions: timed button presses */

  /** Fighters with a spell charging show it ("Fire II · 1"), or nothing. */
  setCharging(key: string, text: string | null, color?: string): void {
    const f = this.fighters.get(key);
    if (!f) return;
    f.el.classList.toggle('charging', !!text);
    if (color) f.el.style.setProperty('--fx', color);
    let tag = f.el.querySelector('.bf-charge') as HTMLElement | null;
    if (!text) { tag?.remove(); return; }
    if (!tag) { tag = document.createElement('span'); tag.className = 'bf-charge'; f.el.append(tag); }
    tag.textContent = text;
  }

  /**
   * Run an Addition's strikes on a target: for each, a ring closes on it and the shown button must be pressed as
   * it meets the marker. `onStrike` hears each result as it happens; a miss ends the string. `auto`: every strike
   * lands perfectly by itself (the accessibility setting).
   */
  startQte(target: string, strikes: QteStrike[], auto: boolean, onStrike: (i: number, r: QteResult) => void, done: (landed: number) => void): void {
    const f = this.fighters.get(target);
    if (!f || !strikes.length) { done(0); return; }
    this.idle();
    this.qteEl.replaceChildren();
    const ring = document.createElement('div');
    ring.className = 'qte-ring';
    const mark = document.createElement('div');
    mark.className = 'qte-mark';
    const glyph = document.createElement('div');
    glyph.className = 'qte-btn';
    this.qteEl.append(mark, ring, glyph);
    // In the middle of the screen (the camera closes in on the strikes there), clear of the stat blocks.
    this.qteEl.style.left = '50%';
    this.qteEl.style.top = '45%';
    this.qteEl.hidden = false;
    this.padsEl.hidden = auto;
    this.qte = { target, strikes, auto, i: 0, t: 0, onStrike, done, ring, pressed: [] };
    this.showStrike();
    window.addEventListener('keydown', this.onQteKey, true);
    this.padWas = [];
  }

  private showStrike(): void {
    const q = this.qte!, s = q.strikes[q.i];
    const glyph = this.qteEl.querySelector('.qte-btn') as HTMLElement;
    glyph.textContent = s.button === 'any' ? '★' : s.button;
    glyph.className = `qte-btn pad-${s.button === 'any' ? 'any' : s.button}`;
    glyph.title = s.button === 'any' ? 'Any button' : `Press ${s.button}`;
    q.t = 0;
  }

  private qtePress(b: FaceButton): void {
    const q = this.qte;
    if (!q || q.auto) return;
    const s = q.strikes[q.i], err = Math.abs(q.t - s.time);
    const right = s.button === 'any' || s.button === b;
    // Too early (before the window), or the wrong button: the string ends here.
    const r: QteResult = !right || err > s.window / 2 ? 'miss' : err <= s.window * 0.18 ? 'perfect' : 'good';
    this.judge(r);
  }

  private judge(r: QteResult): void {
    const q = this.qte!;
    const i = q.i;
    this.qteEl.classList.remove('hit', 'miss', 'perfect');
    void this.qteEl.offsetWidth;
    this.qteEl.classList.add(r === 'miss' ? 'miss' : r === 'perfect' ? 'perfect' : 'hit');
    q.onStrike(i, r);
    if (r === 'miss' || i + 1 >= q.strikes.length) {
      const landed = r === 'miss' ? i : i + 1;
      const done = q.done;
      setTimeout(() => { this.endQte(); done(landed); }, r === 'miss' ? 450 : 350);
      q.i = q.strikes.length; // nothing more to judge
      return;
    }
    q.i++;
    this.showStrike();
  }

  private updateQte(dt: number): void {
    const q = this.qte!;
    if (q.i >= q.strikes.length) return;
    const s = q.strikes[q.i];
    q.t += dt;
    // The ring shrinks from three times the marker's size onto it.
    const k = Math.max(0, 1 - q.t / s.time);
    q.ring.style.transform = `translate(-50%, -50%) scale(${1 + k * 2})`;
    q.ring.style.opacity = String(Math.min(1, 0.35 + q.t / s.time));
    if (q.auto) { if (q.t >= s.time) this.judge('perfect'); return; }
    // Controllers: the face buttons (standard mapping: 0 A, 1 B, 2 X, 3 Y).
    const pad = navigator.getGamepads?.().find((g) => g && g.connected);
    if (pad) for (let k2 = 0; k2 < 4; k2++) {
      const down = !!pad.buttons[k2]?.pressed;
      if (down && !this.padWas[k2]) this.qtePress(PAD_FACE[k2]);
      this.padWas[k2] = down;
      if (!this.qte || this.qte.i >= this.qte.strikes.length) return;
    }
    // Too late.
    if (q.t > s.time + s.window / 2) this.judge('miss');
  }

  /**
   * A spell addition: the caster's button sequence shows in a row with a timer under it; each right button lights
   * the next, a wrong one ends it, and so does the time running out. `auto`: it plays itself.
   */
  startSequence(buttons: FaceButton[], seconds: number, auto: boolean, onPress: (i: number, ok: boolean) => void, done: (r: SeqResult) => void): void {
    if (!buttons.length) { done({ correct: 0, total: 0, left: 1 }); return; }
    this.idle();
    const el = document.createElement('div');
    el.className = 'spell-seq';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', `Press ${buttons.join(' ')}`);
    const row = document.createElement('div');
    row.className = 'spell-seq-row';
    const keys = buttons.map((b) => { const k = document.createElement('span'); k.className = `qte-btn seq-key pad-${b}`; k.textContent = b; row.append(k); return k; });
    const track = document.createElement('div');
    track.className = 'spell-seq-time';
    const bar = document.createElement('span');
    track.append(bar);
    el.append(row, track);
    keys[0].classList.add('next');
    this.root.append(el);
    this.padsEl.hidden = auto;
    this.seq = { buttons, i: 0, t: 0, time: Math.max(0.5, seconds), auto, el, keys, bar, onPress, done, over: false };
    window.addEventListener('keydown', this.onQteKey, true);
    this.padWas = [];
  }

  private seqPress(b: FaceButton): void {
    const q = this.seq;
    if (!q || q.over || (q.auto && b)) return;
    const ok = q.buttons[q.i] === b, k = q.keys[q.i];
    k.classList.remove('next');
    k.classList.add(ok ? 'done' : 'wrong');
    q.onPress(q.i, ok);
    if (!ok) { this.endSeq(q.i); return; }
    q.i++;
    if (q.i >= q.buttons.length) { this.endSeq(q.i); return; }
    q.keys[q.i].classList.add('next');
  }

  private updateSeq(dt: number): void {
    const q = this.seq!;
    if (q.over) return;
    q.t += dt;
    q.bar.style.width = `${Math.max(0, 100 * (1 - q.t / q.time))}%`;
    if (q.auto) {
      // Played for them: one button every so often, all right, at an even pace.
      while (!q.over && q.t >= ((q.i + 1) * q.time * 0.5) / q.buttons.length) { const b = q.buttons[q.i]; q.auto = false; this.seqPress(b); if (this.seq === q) q.auto = true; }
      return;
    }
    const pad = navigator.getGamepads?.().find((g) => g && g.connected);
    if (pad) for (let k = 0; k < 4; k++) {
      const down = !!pad.buttons[k]?.pressed;
      if (down && !this.padWas[k]) this.seqPress(PAD_FACE[k]);
      this.padWas[k] = down;
      if (!this.seq || this.seq.over) return;
    }
    if (q.t >= q.time) { q.keys[q.i]?.classList.add('wrong'); this.endSeq(q.i); }
  }

  private endSeq(correct: number): void {
    const q = this.seq!;
    q.over = true;
    const r: SeqResult = { correct, total: q.buttons.length, left: Math.max(0, 1 - q.t / q.time) };
    q.el.classList.add(correct >= q.buttons.length ? 'complete' : 'broken');
    window.removeEventListener('keydown', this.onQteKey, true);
    this.padsEl.hidden = true;
    setTimeout(() => { q.el.remove(); if (this.seq === q) this.seq = null; q.done(r); }, 450);
  }

  private endQte(): void {
    window.removeEventListener('keydown', this.onQteKey, true);
    this.qte = null;
    this.qteEl.hidden = true;
    this.padsEl.hidden = true;
  }
}
