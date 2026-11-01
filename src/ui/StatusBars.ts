/**
 * The HUD. Across the top: the level, magic, a big health bar in the centre, and EXP. Stamina is a ring of its own
 * (with a dash icon) that shows while it's being used and fades once full. Top right: the clock and the worn ring,
 * and a round mini-map under them. Top left: the selected weapon. Each party member's card is its own piece.
 * Low health pulses red around the screen edges, and a hit flashes it, so a draining bar is hard to miss.
 */
import { genderBadge } from '../game/roleplay';
import { weatherDecor, weatherFrameClass, weatherPill } from './weatherFrame';
import { type WeatherState, hpTintStyle } from '../game/body';
import { ailmentBalloon, ailmentPill, goodPill } from './ailmentBalloon';
import { elementDot } from './elementPill';
import type { Element } from '../world/types';
import type { PlayerStats } from '../game/stats';

/** The stats piece: magic, health, EXP (stamina has its own ring). */
const BARS: ['mp' | 'hp' | 'xp', string][] = [['mp', 'MP'], ['hp', 'HP'], ['xp', 'EXP']];
type BarKey = typeof BARS[number][0];

export interface ClockInfo { time: string; hour: number; night: number; weather: string; /** The real-world date (and season), under the game time. */ date?: string; /** The real moon's phase: a picture and its name. */ moon?: { svg: string; name: string; key: string }; /** The temperature here, "72°F". */ temp?: string; /** Riding: the horse's stamina shows in the ring instead. */ mount?: { sp: number; max: number; tired: boolean } }
export interface WeaponSlot { id: string; name: string; icon: string; available: boolean; /** Its rarity's colour. */ color?: string; /** Disabled by an event (indoors): greyed with a red ✕. */ blocked?: boolean }

/** The HUD pieces a player can move and scale. */
export type HudWidget = 'stats' | 'party' | 'party2' | 'party3' | 'party4' | 'stamina' | 'minimap' | 'gold' | 'clock' | 'weapons' | 'xp' | 'log' | 'quest' | 'quick';
export const HUD_WIDGETS: [HudWidget, string][] = [['stats', 'Health, magic & EXP'], ['stamina', 'Stamina ring'], ['party', 'Party: first card'], ['party2', 'Party: second card'], ['party3', 'Party: third card'], ['party4', 'Party: fourth card'],
  ['clock', 'Time & spell'], ['minimap', 'Mini-map'], ['gold', 'Gold'], ['weapons', 'Weapons'], ['xp', 'EXP bar'], ['log', 'Adventure log'], ['quest', 'Quest tracker'], ['quick', 'Quick items']];
/** How many party cards the HUD has (one movable piece each). */
export const PARTY_SLOTS = 4;
const SLOT_WIDGETS: HudWidget[] = ['party', 'party2', 'party3', 'party4'];
/** How a piece is laid out: its bars side by side or stacked, a face beside them, the log's background. */
export interface HudPieceStyle {
  /** Bars side by side ('h') or stacked ('v'). The stats default to side by side, the party to stacked. */
  stack?: 'h' | 'v';
  /** A face beside the bars (stats: where the level is; party: left of each name). */
  face?: boolean;
  /** The adventure log: one box behind it, a strip behind each line (default), or none. */
  bg?: 'box' | 'lines' | 'none';
  /** The clock: a little picture of the season behind it (blossom, sun, leaves, snow). */
  art?: boolean;
  /** The hero's bars: condensed into a card like the party's (first in the party piece) instead of across the top. */
  compact?: boolean;
  /** Not shown at all. */
  hidden?: boolean;
}
/** Which pieces have which options. */
export const HUD_OPTIONS: Partial<Record<HudWidget, (keyof HudPieceStyle)[]>> = { stats: ['stack', 'face'], party: ['face'], log: ['bg'], clock: ['art'] };
export const HUD_DEFAULT_STACK: Partial<Record<HudWidget, 'h' | 'v'>> = { stats: 'h' };
/** Where a piece goes (its centre, as a share of the screen), how big it is, and its style. Missing: the default. */
export type HudLayout = Partial<Record<HudWidget, { x?: number; y?: number; scale?: number } & HudPieceStyle>>;

/** Little pixel-style icons for the clock: sun by day, sun on the horizon at dawn and dusk, moon at night. */
const ICONS = {
  sun: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.4" fill="#ffd36b"/><g stroke="#ffd36b" stroke-width="1.4" stroke-linecap="round"><path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.2 1.2M11.6 11.6l1.2 1.2M3.2 12.8l1.2-1.2M11.6 4.4l1.2-1.2"/></g></svg>',
  horizon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 11a4.5 4.5 0 0 1 9 0z" fill="#ff9a5a"/><g stroke="#ff9a5a" stroke-width="1.3" stroke-linecap="round"><path d="M8 3.2v1.6M2.6 6.2l1.1 1M13.4 6.2l-1.1 1"/></g><path d="M1 12.5h14" stroke="#c9a6ff" stroke-width="1.3" stroke-linecap="round"/></svg>',
  moon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.8 2.2a6 6 0 1 0 3 9.6 5 5 0 0 1-3-9.6z" fill="#cfd8ff"/><circle cx="3.2" cy="3.4" r="0.7" fill="#cfd8ff"/><circle cx="13.6" cy="4.2" r="0.6" fill="#cfd8ff"/></svg>',
};

/** A little thermometer for the clock card. */
const THERMO = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="6.2" y="1.5" width="3.6" height="9.5" rx="1.8" fill="#2a3048" stroke="#9aa6c4" stroke-width="0.8"/><circle cx="8" cy="12" r="2.8" fill="#e85a4a" stroke="#9aa6c4" stroke-width="0.8"/><rect x="7.2" y="5" width="1.6" height="6.5" fill="#e85a4a"/></svg>';

interface Row { fill: HTMLElement; ghost: HTMLElement; num: HTMLElement; row: HTMLElement; shown: number; last: number }

/** One party card's numbers. */
export interface PartyCard { name: string; level?: number; face?: string; hp: number; maxHp: number; mp: number; maxMp: number; down: boolean; xp?: number; toNext?: number;
  /** Their elements (element stones worn), as circles by the name. */
  elements?: Element[];
  /** The elements on them (out of battle): the frame and pill. */
  weather?: WeatherState | null;
  /** Hurt by the elements just now: the card shakes. */
  rumble?: boolean;
  /** Their health bar's colour (their ailment's, when Database → Climate tints it). */
  tint?: string | null;
  /** Their ailment: a balloon off the face and a pill beside the weather's. */
  ailment?: { id?: string; tag: string; color: string; ink: string; name: string };
  /** Their good state (Rested / Well Rested), the third pill. */
  good?: { name: string; color: string; ink: string; left?: string };
  /** Drying off by a fire: how wet they still are (0 … 1), shown as a small bar. */
  drying?: number | null;
  /** Update 127: their gender's symbol beside the name. */
  gender?: import('../world/types').Gender }

/** "Drying" with a bar of the water left (drying off by a fire, Update 117). */
const dryingBar = (wet: number): string => `<span class="hud-dry" title="Drying off by the fire"><span class="hud-dry-label">Drying</span><span class="hud-dry-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, wet)) * 100)}%"></i></span></span>`;

const pct = (a: number, b: number) => Math.max(0, Math.min(100, b > 0 ? (a / b) * 100 : 0));

/** The gold coin (the HUD's gold, the bag's gold count). */
export const COIN_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="8.6" rx="6.2" ry="5.9" fill="#a8741c"/><ellipse cx="8" cy="7.6" rx="6.2" ry="5.9" fill="#f2c64a"/><ellipse cx="8" cy="7.6" rx="4.1" ry="3.8" fill="none" stroke="#c89220" stroke-width="1.2"/><path d="M6.2 5.4h3.4" stroke="#fff3c4" stroke-width="1" stroke-linecap="round"/></svg>';

export class StatusBars {
  /** The stamina wheel stays on screen when full (Database → Menus). */
  staminaSteady = false;
  private readonly top = document.createElement('div');
  private readonly side = document.createElement('div');
  private readonly vignette = document.createElement('div');
  private readonly weapons = document.createElement('div');
  /** Quick items: three slots like the D-pad (left, up, right). */
  private readonly quick = document.createElement('div');
  private quickKey = '';
  /** A quick slot was tapped (touch screens). */
  onQuick: (k: number) => void = () => {};
  /** The quick slot a finger (or the mouse) is holding down, or -1. */
  quickHeld = -1;
  private readonly rows = new Map<BarKey, Row>();
  private readonly clockIcon: HTMLElement;
  private readonly clockTime: HTMLElement;
  private readonly clockWeather: HTMLElement;
  private readonly clockDate: HTMLElement;
  private icon = '';
  private moonKey = '';
  private tempShown = '';
  private readonly ring = document.createElement('div');
  private readonly levelEl = document.createElement('div');
  private readonly xpBar = document.createElement('div');
  private shownLevel = { level: -1, xp: -1, next: -1 };
  private ringOn = false;
  private weaponKey = '';
  private flashT = 0;
  /** Ailments and buffs: small icons under the gauges. */
  private readonly statusRow = document.createElement('div');
  private statusKey = '';

  /**
   * Party members: a card each (face, name, health, magic and EXP; dimmed when knocked out). The cards stack under
   * the weapons by default; each is its own piece, so any of them can be moved or resized on its own.
   */
  private readonly partyEl = document.createElement('div');
  private readonly slots: HTMLElement[] = [];
  private partyKey = '';
  private partyCount = 0;
  setParty(list: PartyCard[]): void {
    const key = JSON.stringify(list.map((m) => [m.name, m.level, m.face?.length, Math.round(m.hp), Math.round(m.mp), m.xp, m.toNext, m.down, m.elements, m.weather, m.rumble, m.tint, m.ailment?.id, m.ailment?.tag, m.good?.name, m.drying ? Math.round(m.drying * 20) : 0, m.gender]));
    if (key === this.partyKey) return;
    this.partyKey = key;
    this.partyCount = list.length;
    this.partyEl.hidden = this.hiddenAll || !list.length;
    this.partyEl.dataset.empty = list.length ? '' : '1';
    this.slots.forEach((el, k) => {
      const m = list[k];
      el.hidden = !m;
      el.dataset.empty = m ? '' : '1';
      el.innerHTML = m ? `<div class="hud-ally${m.down ? ' down' : ''}${weatherFrameClass(m.weather)}${m.rumble ? ' wf-rumble' : ''}" style="${hpTintStyle(m.tint)}">${weatherDecor(m.weather)}${m.down ? '' : ailmentBalloon(m.ailment?.id, m.ailment?.name)}${m.face ? `<img class="hud-ally-face" src="${m.face}" alt="">` : '<span class="hud-ally-face"></span>'}
      <span class="hud-ally-name">${m.name.replace(/[<&]/g, '')}${genderBadge(m.gender)}${m.level ? ` <span class="lv-pill" style="color:#3a2200">Lv ${m.level}</span>` : ''}${(m.elements ?? []).map(elementDot).join('')}</span>
      <span class="hud-ally-bar hp" title="HP ${Math.ceil(m.hp)} / ${m.maxHp}"><i style="width:${pct(m.hp, m.maxHp)}%"></i></span>
      <span class="hud-ally-bar mp" title="MP ${Math.ceil(m.mp)} / ${m.maxMp}"><i style="width:${pct(m.mp, m.maxMp)}%"></i></span>${m.xp !== undefined ? `
      <span class="hud-ally-bar xp" title="${m.toNext ? `EXP ${m.xp} / ${m.toNext}` : 'Top level'}"><i style="width:${m.toNext ? pct(m.xp, m.toNext) : 100}%"></i></span>` : ''}${m.drying ? dryingBar(m.drying) : ''}${m.weather || (!m.down && (m.ailment || m.good)) ? `<span class="wf-pills">${weatherPill(m.weather)}${m.down ? '' : ailmentPill(m.ailment) + goodPill(m.good, true)}</span>` : ''}</div>` : '';
    });
  }

  /** The hero's own drying bar (drying off by a fire; null: none). */
  private readonly heroDryEl = document.createElement('span');
  private heroDryKey = -1;
  setHeroDrying(v: number | null): void {
    const k = v ? Math.round(v * 20) : 0;
    if (k === this.heroDryKey) return;
    this.heroDryKey = k;
    if (!k) { this.heroDryEl.remove(); return; }
    this.heroDryEl.className = 'hud-dry-top';
    this.heroDryEl.innerHTML = dryingBar(v!);
    if (!this.heroDryEl.isConnected) this.top.appendChild(this.heroDryEl);
  }

  /** The hero's own health bar in their ailment's colour (null: the usual). */
  setHeroTint(color: string | null): void {
    const v = hpTintStyle(color);
    if (v) this.top.style.setProperty('--g-hp', v.slice('--g-hp:'.length, -1)); else this.top.style.removeProperty('--g-hp');
  }

  /** The hero's own ailment: a balloon at the gauges' corner and a pill beside the weather's. */
  private heroAilKey = '';
  private readonly heroAilEl = document.createElement('span');
  private readonly heroAilPill = document.createElement('span');
  setHeroAilment(a: PartyCard['ailment'] | null, good?: PartyCard['good'] | null): void {
    const key = `${a ? `${a.id}|${a.tag}|${a.color}` : ''}|${good?.name ?? ''}`;
    if (key === this.heroAilKey) return;
    this.heroAilKey = key;
    this.heroAilEl.remove(); this.heroAilPill.remove();
    if (a) {
      this.heroAilEl.innerHTML = ailmentBalloon(a.id, a.name);
      this.heroAilEl.className = 'hud-ail';
      this.top.appendChild(this.heroAilEl);
    }
    if (!a && !good) return;
    this.heroAilPill.className = 'wf-pills hud-ail-pills';
    this.heroAilPill.innerHTML = ailmentPill(a) + goodPill(good);
    this.top.appendChild(this.heroAilPill);
  }

  /** The hero's own gauges: the elements' frame and pill, and a shake when they're hurt by them. */
  private heroWeatherKey = '';
  private readonly heroWeatherEl = document.createElement('span');
  setHeroWeather(st: WeatherState | null, rumble: boolean): void {
    const key = `${st}|${rumble}`;
    if (key === this.heroWeatherKey) return;
    const stChanged = this.heroWeatherKey.split('|')[0] !== String(st);
    this.heroWeatherKey = key;
    this.top.classList.remove('wf', 'wf-comfortable', 'wf-wet', 'wf-cold', 'wf-freezing', 'wf-hot', 'wf-overheating');
    if (st) this.top.classList.add('wf', `wf-${st}`);
    this.top.classList.toggle('wf-rumble', rumble);
    if (stChanged) {
      this.top.querySelector(':scope > .wf-fx')?.remove();
      const fx = weatherDecor(st);
      if (fx) this.top.insertAdjacentHTML('afterbegin', fx);
      this.heroWeatherEl.className = 'wf-pills';
      this.heroWeatherEl.innerHTML = weatherPill(st);
      if (st) { if (!this.heroWeatherEl.isConnected) this.top.appendChild(this.heroWeatherEl); } else this.heroWeatherEl.remove();
    }
  }

  /** Stamina: a green ring around a dash icon, emptying as it's used; it fades out once full. */
  private readonly stamina = document.createElement('div');
  private staminaFull = 0;

  /** Gold: a coin and "120 Gold". */
  private readonly goldEl = document.createElement('div');
  private goldShown = -1;
  setGold(n: number): void {
    if (n === this.goldShown) return;
    const up = this.goldShown >= 0 && n > this.goldShown;
    this.goldShown = n;
    (this.goldEl.querySelector('b') as HTMLElement).textContent = n.toLocaleString();
    if (up) { this.goldEl.classList.remove('gain'); void this.goldEl.offsetWidth; this.goldEl.classList.add('gain'); }
  }

  /** The mini-map: a round, north-up view of the map around the hero (drawn by the game). */
  readonly minimap = document.createElement('div');
  readonly minimapCanvas = document.createElement('canvas');

  /** The hero's face (shown beside the stats when the player turns it on). */
  setFace(url: string): void {
    const img = this.levelEl.querySelector<HTMLImageElement>('.hud-face')!;
    if (img.getAttribute('src') !== url) img.src = url;
  }

  constructor(parent: HTMLElement) {
    // Low health and hits: a red glow around the edges of the screen.
    this.vignette.className = 'hud-vignette';
    this.vignette.setAttribute('aria-hidden', 'true');

    this.top.className = 'hud-top';
    this.top.setAttribute('aria-label', 'Player status');
    this.levelEl.className = 'hud-level';
    this.levelEl.innerHTML = '<img class="hud-face" alt=""><span class="hud-level-label">LV</span><span class="hud-level-num">1</span>';
    this.top.appendChild(this.levelEl);
    for (const [g, label] of BARS) {
      const row = document.createElement('div');
      row.className = `hud-gauge ${g}`;
      row.innerHTML = `<div class="hud-gauge-head"><span class="hud-label">${label}</span><span class="hud-num"></span></div><span class="hud-bar"><span class="hud-ghost"></span><span class="hud-fill"></span><span class="hud-shine"></span></span>`;
      this.top.appendChild(row);
      this.rows.set(g, { row, fill: row.querySelector('.hud-fill')!, ghost: row.querySelector('.hud-ghost')!, num: row.querySelector('.hud-num')!, shown: 1, last: -1 });
    }

    this.statusRow.className = 'hud-status';
    this.statusRow.setAttribute('aria-label', 'Status effects');
    this.top.appendChild(this.statusRow);
    this.partyEl.className = 'hud-party';
    this.partyEl.setAttribute('aria-label', 'Party');
    this.partyEl.hidden = true;
    this.partyEl.dataset.empty = '1';
    for (let k = 0; k < PARTY_SLOTS; k++) {
      const el = document.createElement('div');
      el.className = 'hud-pslot';
      el.dataset.slot = String(k + 1);
      el.dataset.empty = '1';
      el.hidden = true;
      this.slots.push(el);
      this.partyEl.append(el);
    }

    this.stamina.className = 'hud-stamina';
    this.stamina.setAttribute('role', 'meter');
    this.stamina.setAttribute('aria-label', 'Stamina');
    this.stamina.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="hs-track" cx="24" cy="24" r="20"/><circle class="hs-fill" cx="24" cy="24" r="20" pathLength="100"/>
      <path class="hs-dash" d="M27 12l-9 13h6l-3 11 10-14h-6z"/><path class="hs-lines" d="M9 20h6M7 25h7M9 30h6"/></svg>`;

    this.goldEl.className = 'hud-gold';
    this.goldEl.setAttribute('aria-label', 'Gold');
    this.goldEl.innerHTML = `${COIN_SVG}<b>0</b><span>Gold</span>`;

    this.minimap.className = 'hud-minimap';
    this.minimap.setAttribute('aria-label', 'Mini-map');
    this.minimapCanvas.width = this.minimapCanvas.height = 176;
    this.minimap.append(this.minimapCanvas);

    this.side.className = 'hud-side';
    const clock = document.createElement('div');
    clock.className = 'hud-clock';
    clock.innerHTML = '<span class="hud-clock-icon"></span><span class="hud-clock-time"></span><span class="hud-clock-weather"></span><span class="hud-clock-date"></span><span class="hud-clock-sky"><span class="hud-temp"></span><span class="hud-moon"></span></span>';
    // Behind the clock: a small picture of the season (Settings → HUD → Season picture).
    this.seasonArt.className = 'hud-season';
    this.seasonArt.setAttribute('aria-hidden', 'true');
    this.side.append(this.seasonArt);
    this.clockIcon = clock.querySelector('.hud-clock-icon')!;
    this.clockTime = clock.querySelector('.hud-clock-time')!;
    this.clockWeather = clock.querySelector('.hud-clock-weather')!;
    this.clockDate = clock.querySelector('.hud-clock-date')!;
    this.ring.className = 'hud-ring';
    this.ring.hidden = true;
    this.side.append(clock, this.ring);

    // Experience: a thin green bar along the bottom of the screen, this level on the left and the next on the right.
    this.xpBar.className = 'hud-xp';
    this.xpBar.innerHTML = '<span class="hud-xp-lv now"></span><span class="hud-xp-track"><span class="hud-xp-fill"></span></span><span class="hud-xp-lv next"></span>';
    this.xpBar.setAttribute('role', 'progressbar');

    this.weapons.className = 'hud-weapons';
    this.weapons.setAttribute('aria-label', 'Selected weapon');
    this.quick.className = 'hud-quick';
    this.quick.setAttribute('aria-label', 'Quick items');
    this.quick.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-q]');
      if (!b || document.body.classList.contains('hud-arranging')) return;
      e.stopPropagation();
      this.quickHeld = Number(b.dataset.q);
      this.onQuick(Number(b.dataset.q));
    });
    // A touch held on a slot (drawing the Bow key item) until it lifts.
    const lift = () => { this.quickHeld = -1; };
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift);
    parent.append(this.vignette, this.top, this.partyEl, this.stamina, this.side, this.minimap, this.goldEl, this.weapons, this.quick, this.xpBar);
  }

  /** The readied spell shard (icon and name, with the key that casts it), or null for none. */
  setRing(r: { name: string; icon: string } | null): void {
    this.ring.hidden = !r;
    if (!r) return;
    this.ring.innerHTML = `<img src="${r.icon}" alt=""><span class="hud-ring-name"></span><kbd>4</kbd>`;
    this.ring.querySelector('.hud-ring-name')!.textContent = r.name;
    this.ring.title = `${r.name}: press the spell button to cast`;
  }

  /** The key or button that uses the ring (it follows the controls and the device in use). */
  setRingKey(label: string): void {
    const k = this.ring.querySelector('kbd');
    if (k && k.textContent !== label) k.textContent = label;
  }

  /** Light up the ring while its power is on. */
  setRingActive(on: boolean): void {
    if (on === this.ringOn) return;
    this.ringOn = on;
    this.ring.classList.toggle('on', on);
  }

  /** The hero's ailments and buffs: an icon each, with a ring that empties as it runs out (none: until cured). */
  setStatus(list: { id: string; name: string; icon: string; left: number; total: number }[]): void {
    const key = list.map((e) => `${e.id}:${Number.isFinite(e.total) ? Math.ceil((e.left / e.total) * 12) : 'x'}`).join('|');
    if (key === this.statusKey) return;
    const ids = this.statusKey.split('|').map((x) => x.split(':')[0]).join('|'), now = list.map((e) => e.id).join('|');
    this.statusKey = key;
    if (ids !== now) {
      this.statusRow.innerHTML = list.map((e) => `<span class="hud-st${e.id.startsWith('buff:') ? ' buff' : ''}" data-id="${e.id}" title="${e.name}"><img src="${e.icon}" alt="${e.name}"><i></i></span>`).join('');
    }
    for (const e of list) {
      const el = this.statusRow.querySelector<HTMLElement>(`[data-id="${CSS.escape(e.id)}"] i`);
      if (el) el.style.setProperty('--left', Number.isFinite(e.total) && e.total > 0 ? String(Math.max(0, e.left / e.total)) : '1');
    }
  }

  /**
   * The weapon the attack button uses, big, with the other two smaller underneath (in switching order).
   * `switches` changes on every switch, which plays the swap animation.
   */
  setWeapons(slots: WeaponSlot[], current: string, switches: number, keyLabel: string): void {
    // No field weapons (Update 132): the card goes.
    this.weapons.classList.toggle('gone', !slots.length);
    if (!slots.length) { this.weaponKey = ''; this.weapons.innerHTML = ''; return; }
    const key = `${current}|${switches}|${keyLabel}|${slots.map((s) => s.id + s.icon + s.available + s.name + s.color + !!s.blocked).join()}`;
    if (key === this.weaponKey) return;
    const swapped = this.weaponKey !== '' && this.weaponKey.split('|')[1] !== String(switches);
    this.weaponKey = key;
    const i = Math.max(0, slots.findIndex((s) => s.id === current));
    const order = slots.map((_, k) => slots[(i + k) % slots.length]);
    const slot = (s: WeaponSlot, main: boolean) => `<div class="hud-wslot${main ? ' main' : ''}${s.available ? '' : ' off'}${s.blocked ? ' blocked' : ''}" title="${s.name}${s.blocked ? ' (can’t be used here)' : s.available ? '' : ' (not available)'}">
      <img src="${s.icon}" alt="">${main ? `<span class="hud-wname"${s.color ? ` style="color:${s.color}"` : ''}>${s.name}</span>` : ''}</div>`;
    this.weapons.innerHTML = `${slot(order[0], true)}<div class="hud-wrest">${order.slice(1).map((s) => slot(s, false)).join('')}</div><kbd class="hud-wkey" title="Switch weapon">${keyLabel}</kbd>`;
    if (swapped) {
      this.weapons.classList.remove('swap');
      void this.weapons.offsetWidth;
      this.weapons.classList.add('swap');
    }
  }

  /**
   * The quick slots (Update 132: four, one per D-pad direction, items and key items): icon, how many are left (key
   * items show none) and the key for each slot (null: empty); `drawing` lights the slot whose bow is drawn.
   */
  setQuick(slots: ({ icon: string; name: string; count: number; key?: boolean } | null)[], keys: string[], drawing = -1): void {
    const key = JSON.stringify([slots, keys, drawing]);
    if (key === this.quickKey) return;
    this.quickKey = key;
    const pos = ['left', 'up', 'right', 'down'];
    this.quick.innerHTML = slots.map((s, k) => `<button type="button" class="hud-qslot ${pos[k]}${s ? '' : ' empty'}${s && s.count < 1 ? ' out' : ''}${k === drawing ? ' drawing' : ''}" data-q="${k}" title="${s ? (s.key ? s.name : `${s.name} (${s.count})`) : 'Empty: assign an item in the bag'}">${
      s ? `<img src="${s.icon}" alt="">${s.key ? '' : `<span class="hud-qn">${s.count}</span>`}` : ''}<kbd>${keys[k]}</kbd></button>`).join('');
    this.quick.hidden = this.hiddenAll || slots.every((s) => !s);
    this.quick.dataset.empty = slots.every((s) => !s) ? '1' : '';
  }
  private hiddenAll = false;

  /** The movable pieces. */
  get widgets(): Record<HudWidget, HTMLElement> {
    return { stats: this.top, party: this.slots[0], party2: this.slots[1], party3: this.slots[2], party4: this.slots[3], stamina: this.stamina, minimap: this.minimap, gold: this.goldEl, clock: this.side, weapons: this.weapons, xp: this.xpBar, log: this.logEl, quest: this.questEl, quick: this.quick };
  }

  /** The season picture behind the clock. */
  private readonly seasonArt = document.createElement('div');
  private season = '';
  setSeason(season: string): void {
    if (season === this.season) return;
    this.season = season;
    this.seasonArt.dataset.season = season;
    this.seasonArt.innerHTML = seasonSvg(season);
  }

  /** The adventure log's feed, arranged with the rest of the HUD. */
  logEl: HTMLElement = document.createElement('div');
  /** The followed quest's objectives. */
  questEl: HTMLElement = document.createElement('div');

  /** Place and scale the pieces as the player arranged them. */
  applyLayout(layout: HudLayout | undefined): void {
    for (const [k, el] of Object.entries(this.widgets) as [HudWidget, HTMLElement][]) {
      const l = layout?.[k];
      el.style.setProperty('--hud-scale', String(l?.scale ?? 1));
      const placed = l?.x !== undefined && l?.y !== undefined;
      el.classList.toggle('hud-placed', placed);
      el.style.left = placed ? `${l!.x! * 100}%` : '';
      el.style.top = placed ? `${l!.y! * 100}%` : '';
      // Its style: bars stacked or side by side, faces, the log's background.
      const stack = l?.stack ?? HUD_DEFAULT_STACK[k];
      el.classList.toggle('stack-v', stack === 'v');
      el.classList.toggle('stack-h', stack === 'h');
      el.classList.toggle('with-face', !!l?.face);
      el.classList.toggle('hud-off', !!l?.hidden);
      el.classList.toggle('hud-compact', !!l?.compact);
      if (k === 'log') for (const b of ['box', 'lines', 'none']) el.classList.toggle(`bg-${b}`, (l?.bg ?? 'lines') === b);
      if (k === 'clock') el.classList.toggle('with-art', l?.art !== false);
    }
    // The party's own settings (faces, shown or not) are kept on the first card and go for every card.
    const p = layout?.party;
    this.partyEl.classList.toggle('with-face', !!p?.face);
    this.partyEl.classList.toggle('hud-off', !!p?.hidden);
    for (const w of SLOT_WIDGETS.slice(1)) this.widgets[w].classList.remove('with-face');
  }

  setHidden(hidden: boolean): void {
    for (const el of [this.top, this.side, this.xpBar, this.weapons, this.vignette, this.stamina, this.minimap, this.goldEl]) el.hidden = hidden;
    this.hiddenAll = hidden;
    this.partyEl.hidden = hidden || !this.partyCount;
    this.quick.hidden = hidden || this.quick.dataset.empty === '1';
  }

  /** The hero's elements (element stones worn): circles beside their level. */
  private heroEls = '';
  setHeroElements(list: Element[]): void {
    const key = list.join(',');
    if (key === this.heroEls) return;
    this.heroEls = key;
    this.levelEl.querySelectorAll('.el-dot').forEach((x) => x.remove());
    this.levelEl.insertAdjacentHTML('beforeend', list.map(elementDot).join(''));
  }

  /** Level and experience towards the next one. */
  setLevel(level: number, xp: number, next: number): void {
    const s = this.shownLevel;
    if (s.level === level && s.xp === xp && s.next === next) return;
    this.shownLevel = { level, xp, next };
    this.levelEl.querySelector('.hud-level-num')!.textContent = String(level);
    // next = 0: the top level, so the bar stays full.
    const max = next <= 0;
    this.xpBar.querySelector<HTMLElement>('.hud-xp-fill')!.style.width = `${max ? 100 : Math.min(1, xp / next) * 100}%`;
    this.xpBar.querySelector('.now')!.textContent = String(level);
    this.xpBar.querySelector('.next')!.textContent = max ? 'MAX' : String(level + 1);
    this.xpBar.title = max ? `Level ${level}: the highest level` : `Level ${level}: ${xp} / ${next} EXP`;
    this.xpBar.setAttribute('aria-valuenow', String(max ? 1 : xp));
    this.xpBar.setAttribute('aria-valuemax', String(max ? 1 : next));
    this.xpBar.setAttribute('aria-label', max ? `Experience: level ${level}, the highest level` : `Experience: level ${level}, ${xp} of ${next}`);
    // The EXP gauge in the stats piece.
    const r = this.rows.get('xp')!, f = max ? 1 : Math.min(1, xp / next);
    r.fill.style.width = r.ghost.style.width = `${f * 100}%`;
    r.num.textContent = max ? 'MAX' : `${xp} / ${next}`;
  }

  update(dt: number, s: PlayerStats, clock?: ClockInfo): void {
    if (clock) {
      const h = clock.hour;
      const icon = (h >= 5 && h < 7) || (h >= 18.5 && h < 20.5) ? 'horizon' : clock.night > 0.5 ? 'moon' : 'sun';
      if (icon !== this.icon) { this.icon = icon; this.clockIcon.innerHTML = ICONS[icon as keyof typeof ICONS]; this.clockIcon.title = icon === 'moon' ? 'Night' : icon === 'sun' ? 'Day' : h < 12 ? 'Dawn' : 'Dusk'; }
      this.clockTime.textContent = clock.time;
      this.clockWeather.textContent = clock.weather;
      const d = clock.date ?? '';
      if (this.clockDate.textContent !== d) this.clockDate.textContent = d;
      const tp = clock.temp ?? '';
      if (tp !== this.tempShown) {
        this.tempShown = tp;
        const el = this.side.querySelector<HTMLElement>('.hud-temp')!;
        el.innerHTML = tp ? `${THERMO}<span>${tp}</span>` : '';
        el.title = tp ? `Temperature: ${tp}` : '';
      }
      const m = clock.moon, mk = m?.key ?? '';
      if (mk !== this.moonKey) {
        this.moonKey = mk;
        const el = this.side.querySelector<HTMLElement>('.hud-moon')!;
        el.innerHTML = m ? `${m.svg}<span>${m.name}</span>` : '';
        el.title = m ? `${m.name} (the real moon tonight)` : '';
      }
    }
    for (const [g] of BARS) {
      if (g === 'xp') continue;
      const r = this.rows.get(g)!, max = s.cfg.max[g], f = max > 0 ? s[g] / max : 0;
      r.fill.style.width = `${f * 100}%`;
      // A pale "ghost" trails behind drops, so a hit is easy to read.
      r.shown = f < r.shown ? Math.max(f, r.shown - dt * 0.5) : f;
      r.ghost.style.width = `${r.shown * 100}%`;
      const text = `${Math.ceil(s[g])} / ${max}`;
      if (r.num.textContent !== text) r.num.textContent = text;
      // A real drop (a hit, a spell) shakes the bar.
      if (r.last >= 0 && s[g] < r.last - 0.9 && (g === 'hp' || s[g] < r.last - 5)) {
        r.row.classList.remove('hit');
        void r.row.offsetWidth;
        r.row.classList.add('hit');
        if (g === 'hp') this.flashT = 0.35;
      }
      r.last = s[g];
      r.row.classList.toggle('low', f < 0.3);
    }
    // Stamina ring: shows while stamina is below full (or while arranging), fades a moment after it fills.
    const mt = clock?.mount, tired = mt ? mt.tired : s.exhausted;
    const sp = mt ? (mt.max > 0 ? Math.max(0, Math.min(1, mt.sp / mt.max)) : 1) : s.cfg.max.sp > 0 ? Math.max(0, Math.min(1, s.sp / s.cfg.max.sp)) : 1;
    this.stamina.style.setProperty('--sp', sp.toFixed(3));
    this.staminaFull = sp >= 0.999 ? this.staminaFull + dt : 0;
    this.stamina.classList.toggle('idle', this.staminaFull > 1.2);
    this.stamina.classList.toggle('steady', this.staminaSteady);
    this.stamina.classList.toggle('exhausted', tired);
    this.stamina.classList.toggle('low', !tired && sp < 0.25);
    this.stamina.classList.toggle('mount', !!mt);
    this.stamina.setAttribute('aria-label', mt ? 'Horse stamina' : 'Stamina');
    this.stamina.setAttribute('aria-valuenow', String(Math.round(mt ? mt.sp : s.sp)));
    const hp = s.cfg.max.hp > 0 ? s.hp / s.cfg.max.hp : 1;
    const danger = s.drowning || hp < 0.3;
    this.rows.get('hp')!.row.classList.toggle('danger', danger);
    // Red edges: a flash on each hit, and a slow pulse while health is low (stronger the lower it gets).
    this.flashT = Math.max(0, this.flashT - dt);
    const low = danger && s.hp > 0 ? Math.min(1, (0.3 - hp) / 0.3 + 0.35) : 0;
    this.vignette.style.setProperty('--low', low.toFixed(2));
    this.vignette.style.setProperty('--flash', (this.flashT / 0.35).toFixed(2));
    this.vignette.classList.toggle('pulse', low > 0);
  }
}

/** Little pixel-style pictures of the seasons for behind the clock: blossom, sun, falling leaves, snow. */
function seasonSvg(season: string): string {
  const px = (cells: [number, number, string][]) => cells.map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`).join('');
  const branch = '<path d="M0 3h7l3 2h6l4-2h8" stroke="#5b3d29" stroke-width="1" fill="none" shape-rendering="crispEdges"/>';
  switch (season) {
    case 'spring': return `<svg viewBox="0 0 32 16" preserveAspectRatio="xMaxYMin meet">${branch}${px([[4, 2, '#ffb7d0'], [5, 1, '#ffd7e6'], [9, 4, '#ffb7d0'], [10, 3, '#ff9ec0'], [13, 6, '#ffd7e6'], [15, 5, '#ffb7d0'], [19, 2, '#ff9ec0'], [20, 1, '#ffd7e6'], [24, 2, '#ffb7d0'], [27, 3, '#ffd7e6'], [8, 10, '#ffc4d8'], [17, 12, '#ffd7e6'], [25, 9, '#ffb7d0'], [6, 7, '#9be07a'], [21, 5, '#9be07a']])}</svg>`;
    case 'summer': return `<svg viewBox="0 0 32 16" preserveAspectRatio="xMaxYMin meet"><circle cx="26" cy="5" r="3.2" fill="#ffd36b"/>${px([[26, 0, '#ffe7a3'], [21, 5, '#ffe7a3'], [31, 5, '#ffe7a3'], [22, 1, '#ffe7a3'], [30, 1, '#ffe7a3'], [22, 9, '#ffe7a3'], [30, 9, '#ffe7a3']])}<path d="M0 15c4-3 8-3 12 0s8 3 12 0" stroke="#6fbf5a" stroke-width="1.2" fill="none"/></svg>`;
    case 'autumn': return `<svg viewBox="0 0 32 16" preserveAspectRatio="xMaxYMin meet">${branch}${px([[3, 2, '#e8743a'], [6, 4, '#d9452e'], [10, 2, '#f2a93b'], [14, 5, '#e8743a'], [18, 2, '#d9452e'], [23, 4, '#f2a93b'], [27, 2, '#e8743a'], [8, 9, '#f2a93b'], [9, 10, '#f2a93b'], [16, 11, '#e8743a'], [17, 12, '#e8743a'], [24, 9, '#d9452e'], [25, 10, '#d9452e'], [12, 14, '#f2a93b']])}</svg>`;
    case 'winter': return `<svg viewBox="0 0 32 16" preserveAspectRatio="xMaxYMin meet">${branch}<path d="M0 2h7l3 2h6l4-2h8" stroke="#f4f8ff" stroke-width="1" fill="none" shape-rendering="crispEdges"/>${px([[4, 7, '#ffffff'], [9, 11, '#dfe9ff'], [13, 8, '#ffffff'], [18, 13, '#dfe9ff'], [22, 7, '#ffffff'], [27, 11, '#dfe9ff'], [30, 6, '#ffffff'], [6, 13, '#ffffff'], [15, 4, '#dfe9ff']])}</svg>`;
    default: return '';
  }
}
