/**
 * Mimas: the GBA playtest. The game page in GBA mode (index.html?gbaplay=<stamp>), shown in a frame over the editor.
 *
 * Saturn's own systems run the game: its event interpreter (pages, conditions, switches, variables, choices, items,
 * gold…), its message window, its turn-based battles (the Pocket Handheld layout on a plain white screen, Gold /
 * Silver style) and its sound (the built-in chiptunes, and your files). What's new is the field: the map is drawn
 * from its GBA layers on a 240×160 screen, with grid steps, running, ledge hops, props and events, as the ROM does.
 */
import { AudioManager, setUiSound, type Sfx } from '../audio/sfx';
import { findAddition, findSpell, learnSpell, rankName } from '../game/abilities';
import { Interpreter, type EventContext } from '../events/Interpreter';
import { BattleStatus } from '../game/battle/status';
import { TurnBattle, type BattleEntry, type BattleHost } from '../game/battle/TurnBattle';
import type { Battler } from '../game/battle/rules';
import { impactOf } from '../game/battle/impact';
import { enemyAgility } from '../game/battle/rules';
import { combatConfig, xpToNext, type CombatConfig } from '../game/combat/config';
import { enemyElement } from '../game/combat/Combat';
import { GameState } from '../game/GameState';
import { Input } from '../game/Input';
import { Inventory } from '../game/inventory';
import { gbaView } from '../gba/layers';
import { collision, drawMap, LEDGE_E, LEDGE_S, LEDGE_W, SOLID, type TileLookup } from '../gba/mapRender';
import type { GbaData } from '../gba/types';
import { waitForPlaytest, type PlaytestData } from '../shared/playtest';
import { BattleScreen, type FighterView, type VictoryReport } from '../ui/BattleScreen';
import { MessageWindow, type Speaker } from '../ui/MessageWindow';
import { mainHero } from '../world/heroes';
import { blockedTiles, PropCatalog } from '../world/props';
import { pickTroop } from '../world/zones';
import type { Command, Database, Dir, EnemyDef, EventData, EventPage, ItemDef, MapData } from '../world/types';
import { Menus } from './menus';
import { battleMoves, battleNumbers, battleSpells, gainXp, loadMember, master, MAX_PARTY, maxOf, newMember, saveMember, type Member, type MemberSave } from './party';
import { GbaUi } from './ui';
import './gba.css';

const W = 240, H = 160, CELL = 16;
const DX: Record<Dir, number> = { down: 0, up: 0, left: -1, right: 1 };
const DZ: Record<Dir, number> = { down: 1, up: -1, left: 0, right: 0 };
const ROW: Record<Dir, number> = { down: 0, up: 1, left: 2, right: 2 };
const OPPOSITE: Record<Dir, Dir> = { down: 'up', up: 'down', left: 'right', right: 'left' };

interface Pic { img: HTMLCanvasElement; w: number; h: number }

/** An event on the map now: its active page, where it faces. */
interface RtEvent { data: EventData; page: EventPage | null; selfId: string; dir: Dir }

interface Loaded {
  name: string;
  data: MapData;
  under: HTMLCanvasElement;
  over: HTMLCanvasElement;
  coll: Uint8Array;
  /** Cells props block. */
  propBlock: Set<number>;
  events: RtEvent[];
}

async function toCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return c;
}

function showError(msg: string): void {
  const el = document.createElement('div');
  el.className = 'boot-error';
  el.textContent = msg;
  document.body.appendChild(el);
}

export async function startGbaGame(): Promise<void> {
  document.body.classList.add('gba-mode');
  const stamp = new URLSearchParams(location.search).get('gbaplay');
  const pt = await waitForPlaytest(stamp, 15000);
  if (!pt || !pt.gba) { showError('The playtest data didn’t arrive. Close this and press ▶ Playtest again.'); return; }
  const game = new GbaGame(pt);
  (window as unknown as { __gba: GbaGame }).__gba = game; // for tests
  await game.init();
  game.run();
}

class GbaGame {
  readonly db: Database;
  readonly gba: GbaData;
  readonly canvas = document.createElement('canvas');
  readonly g: CanvasRenderingContext2D;
  readonly input = new Input();
  readonly state = new GameState();
  readonly inventory: Inventory;
  readonly items = new Map<string, ItemDef>();
  readonly catalog: PropCatalog;
  audio!: AudioManager;
  message!: MessageWindow;
  battleScreen!: BattleScreen;
  battle!: TurnBattle;
  interp!: Interpreter;
  readonly cfg: CombatConfig;
  readonly maps = new Map<string, MapData>();
  readonly images = new Map<string, HTMLCanvasElement>();
  readonly pics = new Map<string, Pic>();
  readonly files = new Map<string, string>();
  cur!: Loaded;
  // the player
  px = 0; pz = 0; cx = 0; cz = 0; dir: Dir = 'down';
  moving = 0; hop = 0; steps = 0; running = false; bump = 0;
  /** The party (Pokémon style, up to six): the first who can fight goes out first. */
  party: Member[] = [];
  ui!: GbaUi;
  menus!: Menus;
  /** Play time before this session (from a save) and when this one began. */
  playBefore = 0; playStart = performance.now();
  /** In a battle: who's been out (they share the EXP), and what each has earned. */
  battleWhos = new Set<number>();
  earned = new Map<number, number>();
  // events and screen
  runningEvent: RtEvent | null = null;
  fade = 0; fadeTarget = 0; fadeSpeed = 0;
  banner = 0;
  walked = 0; grace = 0;
  battlePending = false;
  battleCommands: Command[] = [];
  battleRules: { lose?: 'respawn' | 'continue'; resultVar?: string } = {};
  tick = 0;

  constructor(private readonly pt: PlaytestData) {
    this.db = pt.db;
    this.gba = pt.gba!.data;
    this.g = this.canvas.getContext('2d')!;
    this.catalog = new PropCatalog(pt.assets);
    for (const it of this.db.items ?? []) this.items.set(it.id, it);
    this.inventory = new Inventory((id) => this.items.get(id));
    this.state.inventory = this.inventory;
    this.cfg = combatConfig(this.db.combat);
    // Pokémon-style battles: the Pocket Handheld layout on the flat screen, one hero out at a time (the rest of the
    // party can be sent in), the Additions as the FIGHT moves with no button prompts.
    this.cfg.turnBased = { ...this.cfg.turnBased, layout: 'pocket', mode: 'single', singleParty: MAX_PARTY, additions: 'choose', additionTiming: 'auto', heroLocked: false };
    // The hero, and everyone set to start in the party.
    const heroes = this.db.heroes?.length ? this.db.heroes : [mainHero(this.db)];
    this.party = heroes.filter((h, i) => i === 0 || h.startsInParty).slice(0, MAX_PARTY).map((h) => newMember(this.db, h, Math.max(1, h.joinLevel ?? 1)));
  }

  get lead(): Member { return this.party[0]; }
  itemDef = (id: string): ItemDef | undefined => this.items.get(id);
  maxOf(m: Member): { hp: number; mp: number } { return maxOf(this.db, m, this.itemDef); }

  /**
   * Music on the GBA: the built-in chiptunes play on its sound chip. Music files can't go in a ROM as they are
   * (they'll be tracker files), so for now a file plays as the built-in theme for its place: battle, or the field.
   */
  music(src: string | undefined, kind: 'field' | 'battle' = 'field', fade = 1): void {
    const s = src && src.startsWith('builtin:') ? src : kind === 'battle' ? 'builtin:battle' : 'builtin:field';
    this.audio.music(s, fade);
  }


  async init(): Promise<void> {
    const pt = this.pt;
    for (const [path, blob] of Object.entries(pt.files ?? {})) this.files.set(path, URL.createObjectURL(blob));
    const resolve = (p: string) => this.files.get(p) ?? p;
    for (const [path, blob] of Object.entries(pt.gba!.images)) { try { this.images.set(path, await toCanvas(blob)); } catch { /* missing */ } }
    for (const [k, v] of Object.entries(pt.gba!.pics)) { try { this.pics.set(k, { img: await toCanvas(v.blob), w: v.w, h: v.h }); } catch { /* missing */ } }
    this.maps.set(pt.mapName, pt.map);
    for (const [n, m] of Object.entries(pt.maps ?? {})) this.maps.set(n, m);

    // The bag the game starts with.
    for (const s of this.db.inventory?.startItems ?? []) this.inventory.add(s.item, s.count);
    const startGold = (this.db.inventory as { startGold?: number } | undefined)?.startGold;
    if (startGold) this.inventory.gold = startGold;

    this.canvas.width = W; this.canvas.height = H;
    this.canvas.className = 'gba-screen';
    document.body.append(this.canvas);
    this.input.setBindings({
      // A: Z / Space (Enter too, in menus and text); B: X / Backspace; START: Enter (the menu, on the map).
      keys: { ...this.input.current.keys, ok: ['Enter', 'NumpadEnter', 'KeyZ', 'Space'], jump: [], cancel: ['KeyX', 'Backspace'], run: ['ShiftLeft', 'ShiftRight', 'KeyX'], settings: ['Enter', 'NumpadEnter'], party: [], backpack: [], worldmap: [] },
      pad: { ...this.input.current.pad, ok: [0], jump: [], backpack: [], cancel: [1], run: [1], settings: [9], party: [], worldmap: [] },
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.parent?.postMessage('gba-play-close', '*'); }, true);

    this.audio = new AudioManager(resolve);
    this.audio.overrides = { ...(this.db.audio?.sfx ?? {}) } as Partial<Record<Sfx, string>>;
    // The GBA plays the built-in sounds on its Game Boy sound chip: the chiptune versions.
    this.audio.setStyle('chip');
    setUiSound((s) => this.audio.play(s));

    this.message = new MessageWindow(document.body, this.input);
    this.message.setStyles(this.db.messageStyles);
    this.message.setPlace('bottom');
    this.message.tick = () => this.audio.play('textTick');
    this.battleScreen = new BattleScreen(document.body, this.input);
    this.battleScreen.setLayout('pocket');
    this.battleScreen.setStage(null);
    this.battleScreen.onSound = (n) => this.audio.play(n);
    this.battle = new TurnBattle(this.battleScreen, this.battleHost());
    this.interp = new Interpreter(this.context());
    this.ui = new GbaUi(document.body, this.input, this.message);
    this.ui.sound = (n) => this.audio.play(n);
    this.menus = new Menus({
      db: this.db, cfg: this.cfg, ui: this.ui, party: this.party, inventory: this.inventory, items: this.items,
      url: (p) => this.files.get(p) ?? p,
      face: (m) => this.faceOf(m),
      sound: (n) => this.audio.play(n as Sfx),
      save: () => this.save(),
      playTime: () => this.playBefore + (performance.now() - this.playStart) / 1000,
    });

    // The open map: from the game's start when it's the start map, otherwise the walkable spot nearest its middle.
    const startMap = pt.mapName;
    const st = startMap === this.db.startMap ? this.db.start : null;
    const m = this.maps.get(startMap)!;
    this.cur = this.load(startMap);
    let sx = st ? Math.floor(st.x) : Math.floor(m.width / 2), sz = st ? Math.floor(st.z) : Math.floor(m.height / 2);
    if (!st) {
      let best = Infinity;
      for (let z = 0; z < m.height; z++) for (let x = 0; x < m.width; x++) {
        const d = (x - m.width / 2) ** 2 + (z - m.height / 2) ** 2;
        if (d < best && !this.blocked(x, z)) { best = d; sx = x; sz = z; }
      }
    }
    this.enter(startMap, sx, sz, (st?.dir as Dir) ?? 'down');
    this.healAll();
    // A saved game: CONTINUE (where it was saved) or a NEW GAME (here).
    const saved = this.readSave();
    if (saved && this.maps.get(saved.map)?.gba) {
      void this.ui.run(async () => {
        const t = Math.floor((saved.time ?? 0) / 60);
        const pick = await this.ui.choose({ x: 48, y: 30, w: 144, rows: [
          { label: 'CONTINUE', sub: `${saved.party[0] ? this.db.heroes?.find((h) => h.id === saved.party[0].id)?.name ?? '' : ''}  ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}` },
          { label: 'NEW GAME', sub: 'Start here, as the editor has it' },
        ], title: 'MIMAS', cls: 'title' }, false);
        if (pick === 0) this.loadSave();
      });
    }
  }

  run(): void {
    let last = performance.now(), acc = 0;
    const loop = (now: number) => {
      acc += Math.min(100, now - last);
      last = now;
      while (acc >= 1000 / 60) { acc -= 1000 / 60; this.update(1 / 60); }
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------------ maps */

  look: TileLookup = (id) => {
    const def = this.gba.tiles.find((t) => t.id === id);
    const img = def ? this.images.get(def.image) : undefined;
    return def && img ? { def, img } : null;
  };

  load(name: string): Loaded {
    const data = this.maps.get(name)!;
    const view = gbaView(data, name);
    const under = document.createElement('canvas'), over = document.createElement('canvas');
    under.width = over.width = data.width * CELL;
    under.height = over.height = data.height * CELL;
    drawMap(under.getContext('2d')!, view, this.look, 1, 0, 'under');
    drawMap(over.getContext('2d')!, view, this.look, 1, 0, 'over');
    const coll = collision(view, this.look);
    const propBlock = new Set<number>();
    for (const p of data.props) {
      const def = this.catalog.get(p.type);
      if (!def) continue;
      for (const [x, z] of blockedTiles(def, p.x, p.z, p.s ?? 1)) {
        if (x < 0 || z < 0 || x >= data.width || z >= data.height) continue;
        if (data.gba?.pass[z]?.[x] === 'O') continue;
        propBlock.add(z * data.width + x);
      }
    }
    const events = data.events.map((e): RtEvent => ({ data: e, page: null, selfId: `${name}:${e.id}`, dir: 'down' }));
    return { name, data, under, over, coll, propBlock, events };
  }

  enter(name: string, x: number, z: number, dir: Dir): void {
    this.cur = this.load(name);
    const m = this.cur.data;
    this.cx = Math.max(0, Math.min(m.width - 1, x));
    this.cz = Math.max(0, Math.min(m.height - 1, z));
    this.px = this.cx * CELL; this.pz = this.cz * CELL;
    this.dir = dir;
    this.moving = this.hop = 0;
    this.banner = 150;
    this.walked = 0;
    this.refreshEvents();
    this.music(m.music);
    this.audio.ambience('');
  }

  refreshEvents(): void {
    for (const ev of this.cur.events) {
      let page: EventPage | null = null;
      for (const p of ev.data.pages) if (!p.condition || this.state.test(p.condition, ev.selfId)) page = p;
      if (page !== ev.page) { ev.page = page; ev.dir = (page?.dir as Dir) ?? 'down'; }
    }
  }

  inside(x: number, z: number): boolean { const m = this.cur.data; return x >= 0 && z >= 0 && x < m.width && z < m.height; }

  /** The event covering a cell (big events cover their whole area). */
  eventAt(x: number, z: number, want?: (e: RtEvent) => boolean): RtEvent | null {
    for (let i = this.cur.events.length - 1; i >= 0; i--) {
      const e = this.cur.events[i], d = e.data;
      if (!e.page) continue;
      if (x >= d.x && z >= d.z && x < d.x + (d.w ?? 1) && z < d.z + (d.h ?? 1) && (!want || want(e))) return e;
    }
    return null;
  }

  blocked(x: number, z: number): boolean {
    if (!this.inside(x, z)) return true;
    const i = z * this.cur.data.width + x;
    if (this.cur.coll[i] & SOLID) return true;
    if (this.cur.propBlock.has(i)) return true;
    return !!this.eventAt(x, z, (e) => !!e.page?.solid);
  }

  canHop(d: Dir): boolean {
    const tx = this.cx + DX[d], tz = this.cz + DZ[d];
    if (!this.inside(tx, tz)) return false;
    const c = this.cur.coll[tz * this.cur.data.width + tx];
    const ledge = (d === 'down' && c & LEDGE_S) || (d === 'right' && c & LEDGE_E) || (d === 'left' && c & LEDGE_W);
    return !!ledge && !this.blocked(tx + DX[d], tz + DZ[d]);
  }

  /* ------------------------------------------------------------------ events */

  get busy(): boolean { return this.interp.running || this.message.isOpen || this.ui.busy || this.battle.active || this.battlePending || this.fade > 0 || this.fadeTarget > 0; }

  /** Everyone back to full (a rest, an inn, losing a battle). */
  healAll(): void { for (const m of this.party) { const mx = this.maxOf(m); m.hp = mx.hp; m.mp = mx.mp; } }

  /** The Party command: someone joins (at the lead's level unless they have their own) or leaves. */
  async partyChange(op: 'add' | 'remove', id: string, quiet?: boolean): Promise<void> {
    const def = this.db.heroes?.find((h) => h.id === id);
    if (!def) return;
    const at = this.party.findIndex((m) => m.id === id);
    if (op === 'add') {
      if (at >= 0) return;
      if (this.party.length >= MAX_PARTY) { if (!quiet) await this.ui.say(`There’s no room in the party for ${def.name}.`); return; }
      this.party.push(newMember(this.db, def, def.joinLevel ?? this.lead?.level ?? 1));
      if (!quiet) { this.audio.play('questDone'); await this.ui.say(`${def.name} joined the party!`); }
    } else if (at > 0) {
      this.party.splice(at, 1);
      if (!quiet) await this.ui.say(`${def.name} left the party.`);
    }
  }

  /** The Learn command: a spell (learned at once) or an Addition (a move: four at most, Pokémon's questions). */
  async learn(c: Extract<Command, { cmd: 'learn' }>): Promise<void> {
    const who = !c.who || c.who === '@party' ? this.party : this.party.filter((m) => m.id === c.who);
    const sp = findSpell(this.db, c.spell);
    for (const m of who) {
      if (sp && learnSpell(m.abil, sp, c.rank ?? 1)) {
        this.audio.play('skill');
        if (!c.silent) await this.ui.say(`${m.def.name} learned ${rankName(sp.name, m.abil.spells![sp.id])}!`);
      }
      if (c.addition && findAddition(this.db, c.addition)) await this.menus.learn(m, c.addition);
    }
  }

  /** A hero's little picture: their character's front, cut to the head and shoulders. */
  private faces = new Map<string, string>();
  faceOf(m: Member): string | undefined {
    const look = m.def.look ?? (m === this.party[0] ? this.db.player : undefined);
    const key = `${m.id}:${look}`;
    if (this.faces.has(key)) return this.faces.get(key);
    const sp = m === this.party[0] ? this.gba.sprites.find((x) => x.id === this.gba.player && x.kind === 'overworld') : undefined;
    const sheet = sp ? this.images.get(sp.image) : undefined;
    const pic = this.pics.get(`char:${look}:down`)?.img;
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    // The head: from the top of what's drawn in the front frame, a square as wide as the frame.
    const src = sheet ? { img: sheet, w: 16, h: 32 } : pic ? { img: pic, w: pic.width, h: pic.height } : null;
    if (!src) return undefined;
    let top = 0;
    const px = src.img.getContext('2d')!.getImageData(0, 0, src.w, src.h).data;
    find: for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (px[(y * src.w + x) * 4 + 3] > 0) { top = y; break find; }
    const side = Math.min(src.w, src.h - top);
    g.drawImage(src.img, 0, top, src.w, side, 0, 0, 16, 16);
    const url = c.toDataURL();
    this.faces.set(key, url);
    return url;
  }

  /* ------------------------------------------------------------------ saving */

  get saveKey(): string { return `mimas-gba-save:${(this.db as { title?: string }).title ?? 'game'}`; }

  save(): boolean {
    try {
      const data = {
        v: 1, map: this.cur.name, x: this.cx, z: this.cz, dir: this.dir,
        party: this.party.map(saveMember), inventory: this.inventory.toJSON(), state: this.state.toJSON(),
        time: this.playBefore + (performance.now() - this.playStart) / 1000, at: Date.now(),
      };
      localStorage.setItem(this.saveKey, JSON.stringify(data));
      return true;
    } catch { return false; }
  }

  readSave(): { map: string; x: number; z: number; dir: Dir; party: MemberSave[]; inventory: unknown; state: unknown; time: number } | null {
    try { const raw = localStorage.getItem(this.saveKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }

  /** CONTINUE: the saved game, where it was saved (if that map is still a GBA map). */
  loadSave(): boolean {
    const d = this.readSave();
    if (!d || !this.maps.get(d.map)?.gba) return false;
    const party = d.party.map((x) => loadMember(this.db, x)).filter((m): m is Member => !!m);
    if (!party.length) return false;
    this.party.splice(0, this.party.length, ...party);
    this.inventory.load(d.inventory as never, this.inventory.size);
    this.state.load(d.state as never);
    this.playBefore = d.time ?? 0; this.playStart = performance.now();
    this.enter(d.map, d.x, d.z, d.dir);
    return true;
  }

  runEvent(e: RtEvent): void {
    if (!e.page?.commands.length) return;
    if (e.page.facePlayer && (e.page.gbaSprite || e.page.character)) e.dir = OPPOSITE[this.dir];
    this.runningEvent = e;
    this.interp.start(e.page.commands, e.selfId);
  }

  /** A speaker for word bubbles: the running event's head on screen (Saturn's message window places the bubble). */
  speakerFor(e: RtEvent): Speaker {
    const frame = this.canvas.getBoundingClientRect();
    const sx = frame.width / W, sy = frame.height / H;
    const at = (dy: number) => {
      const { camX, camZ } = this.camera();
      const d = e.data, tall = e.page?.gbaSprite || e.page?.character ? 2 : 1;
      return { x: frame.left + ((d.x + (d.w ?? 1) / 2) * CELL - camX) * sx, y: frame.top + ((d.z + 1 - tall) * CELL - camZ + dy) * sy };
    };
    return { head: () => at(0), feet: () => at(CELL * 2), character: !!(e.page?.gbaSprite || e.page?.character) };
  }

  context(): EventContext {
    const game = this;
    const real = this.message;
    // Text in a box at the bottom; a command set to a speech bubble shows it over the event that's talking.
    const message = new Proxy(real, {
      get(target, prop) {
        if (prop === 'showText') {
          return (text: string, speaker?: string, hold?: boolean, style?: 'speech' | 'plain', look?: unknown, styleId?: string) => {
            const ev = game.runningEvent;
            if (style === 'speech' && ev) { target.setPlace('above'); target.setSpeaker(game.speakerFor(ev)); }
            else { target.setPlace('bottom'); target.setSpeaker(null); }
            target.showText(text, speaker, hold, style, look as never, styleId);
            // One look on the GBA: the white box (text box styles' colours and fonts are for the HD-2D game).
            const el = document.querySelector<HTMLElement>('.msg .msg-text');
            if (el) el.style.cssText = '';
          };
        }
        const v = Reflect.get(target, prop) as unknown;
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(target) : v;
      },
    });
    const ctx: EventContext = {
      state: this.state,
      message,
      setTime: () => {},
      fadeTo: (to, seconds) => { this.fadeTarget = to; this.fadeSpeed = seconds > 0 ? 1 / seconds : 99; },
      isFading: () => Math.abs(this.fade - this.fadeTarget) > 0.001,
      refreshEvents: () => this.refreshEvents(),
      changeGauge: (gauge, op, value) => {
        // The whole party (the GBA has no one hero to single out).
        for (const m of this.party) {
          const mx = this.maxOf(m), max = gauge === 'hp' ? mx.hp : mx.mp;
          const cur = gauge === 'hp' ? m.hp : gauge === 'mp' ? m.mp : 0;
          const next = Math.max(0, Math.min(max, op === 'fill' ? max : op === 'set' ? value : cur + value));
          if (gauge === 'hp') m.hp = next; else if (gauge === 'mp') m.mp = next;
        }
      },
      tendFire: () => {},
      fullRest: () => this.healAll(),
      ailment: () => {},
      transfer: (t) => this.transfer(t.map, t.x, t.z, (t.dir as Dir) ?? this.dir),
      openSave: () => { void this.ui.run(() => this.menus.saveFlow()); },
      items: {
        give: (id, n) => {
          if (!this.items.has(id)) return 'unknown';
          if (this.inventory.room(id) < n) return 'full';
          this.inventory.add(id, n);
          this.audio.play('item');
          return 'ok';
        },
        take: (id, n) => this.inventory.remove(id, n),
        gold: (op, v) => { this.inventory.gold = Math.max(0, op === 'set' ? v : this.inventory.gold + v); },
        name: (id) => this.items.get(id)?.name ?? id,
      },
      openShop: (c) => { void this.ui.run(() => this.menus.shop(c.goods ?? [], c.canSell !== false, c.name)); },
      sound: (src) => this.audio.play(src),
      music: (src, fade) => this.music(src ?? this.cur.data.music, 'field', fade),
      ambience: () => {},
      party: (op, hero, quiet) => { void this.ui.run(() => this.partyChange(op, hero, quiet)); },
      weather: () => {},
      skillPoints: () => {},
      quest: () => {},
      battle: (c) => {
        const foes = c.enemies.map((id) => this.db.enemies?.find((e) => e.id === id)).filter((d): d is EnemyDef => !!d);
        this.battleRules = { lose: c.lose, resultVar: c.resultVar };
        this.startBattle(foes, c.canRun !== false, c.music);
      },
      learn: (c) => { void this.ui.run(() => this.learn(c)); return null; },
      heroClass: () => null,
      busy: () => this.battle.active || this.battlePending || this.ui.busy,
    } as EventContext;
    return ctx;
  }

  transfer(map: string, x: number, z: number, dir: Dir): void {
    const target = this.maps.get(map);
    if (!target?.gba) {
      this.message.showText(`(“${map}” isn’t a GBA map yet: convert it in Map Properties to go there.)`, undefined, false, undefined, undefined, 'system');
      return;
    }
    this.fadeTarget = 1; this.fadeSpeed = 4;
    this.pendingTransfer = { map, x: Math.floor(x), z: Math.floor(z), dir };
  }
  pendingTransfer: { map: string; x: number; z: number; dir: Dir } | null = null;

  /* ------------------------------------------------------------------ battles */

  /** Party member `who` (their place in the party) as a fighter: their numbers, moves, spells and pictures. */
  memberEntry(who: number): BattleEntry {
    const m = this.party[who], c = this.cfg, n = battleNumbers(c, m, this.itemDef), mx = this.maxOf(m);
    const w = m.equip.weapon ? this.items.get(m.equip.weapon) : undefined;
    const key = `p${who}`;
    const battler: Battler = {
      key, side: 'party', name: m.def.name, hp: Math.max(0, m.hp), maxHp: mx.hp, mp: m.mp, maxMp: mx.mp,
      attack: n.attack, attackElement: w?.element ?? 'neutral', attackMagic: false,
      armour: n.armour, magicArmour: n.magicArmour, agility: n.agility, baseAgility: n.agility, crit: n.crit,
      evasion: n.evasion, spellEvasion: n.spellEvasion, resist: n.resist,
      defence: { elements: m.def.elements, immune: m.def.immune, absorb: m.def.absorb }, spells: battleSpells(this.db, m, this.itemDef), ct: 0, guarding: false,
      status: new BattleStatus([...(m.def.resists ?? []), ...Object.values(m.equip).flatMap((id) => (id ? this.items.get(id)?.protects ?? [] : []))] as never),
      inflicts: w?.inflicts,
      additions: m.def.noAdditions ? [] : battleMoves(this.db, m),
    };
    const frame = (img: HTMLCanvasElement | undefined, sx: number, sy: number, fw: number, fh: number, scale: number) => {
      if (!img) return undefined;
      const c2 = document.createElement('canvas');
      c2.width = fw * scale; c2.height = fh * scale;
      const g = c2.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, sx, sy, fw, fh, 0, 0, fw * scale, fh * scale);
      return c2;
    };
    const look = m.def.look ?? (who === 0 || m === this.party[0] ? this.db.player : undefined);
    const isHero = m.def.id === (this.db.heroes?.[0]?.id ?? 'hero');
    const sp = isHero ? this.gba.sprites.find((s2) => s2.id === this.gba.player && s2.kind === 'overworld') : undefined;
    const back = isHero ? this.gba.sprites.find((s2) => s2.kind === 'backsprite') : undefined;
    const sheet = sp ? this.images.get(sp.image) : undefined, backSheet = back ? this.images.get(back.image) : undefined;
    const charUp = this.pics.get(`char:${look}:up`)?.img, charSide = this.pics.get(`char:${look}:left`)?.img;
    const picture = frame(sheet, 0, 2 * 32, 16, 32, 3) ?? (charSide ? frame(charSide, 0, 0, charSide.width, charSide.height, 2) : undefined) ?? document.createElement('canvas');
    const view: FighterView = {
      key, side: 'party', name: m.def.name, picture, icon: this.faceOf(m) ?? '', level: m.level,
      xp: { have: m.xp, next: xpToNext(this.cfg, m.level) },
      back: frame(backSheet, 0, 0, 64, 64, 2) ?? (charUp ? frame(charUp, 0, 0, charUp.width, charUp.height, 2) : undefined),
    };
    return { battler, view, who };
  }

  startBattle(foes: EnemyDef[], canRun = true, music?: string): void {
    if (!foes.length || this.battle.active || this.battlePending) return;
    this.battlePending = true;
    this.audio.play('encounter');
    this.music(music || this.cur.data.battleMusic, 'battle', 0.2);
    // A quick flash into the battle.
    this.flash = 30;
    window.setTimeout(() => {
      this.battlePending = false;
      // The first in the party who can fight goes out.
      const lead = Math.max(0, this.party.findIndex((m) => m.hp > 0));
      this.battleWhos = new Set([lead]);
      this.battleFoes.clear();
      this.earned = new Map();
      const entries: BattleEntry[] = [this.memberEntry(lead)];
      const counts = new Map<string, number>(), seen = new Map<string, number>();
      for (const d of foes) counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
      foes.slice(0, 3).forEach((d, i) => {
        const k = seen.get(d.id) ?? 0;
        seen.set(d.id, k + 1);
        const name = (counts.get(d.id) ?? 0) > 1 ? `${d.name} ${String.fromCharCode(65 + k)}` : d.name;
        const v = Math.max(0, Math.min(0.9, (d.hpVariance ?? 0) / 100)), maxHp = Math.max(1, Math.round(d.hp * (1 - v + Math.random() * 2 * v)));
        const battler: Battler = {
          key: `e${i}`, side: 'enemy', name, hp: maxHp, maxHp, mp: 0, maxMp: 0, spread: (d.damageVariance ?? 10) / 100,
          attack: d.damage, attackElement: enemyElement(d), attackMagic: d.attackType === 'magic',
          armour: d.defense ?? 0, magicArmour: d.magicDefense ?? d.defense ?? 0, agility: enemyAgility(d), baseAgility: enemyAgility(d), crit: d.crit ?? 5,
          accuracy: d.accuracy, evasion: d.evasion, spellEvasion: d.spellEvasion, resist: d.ailmentResist, impact: impactOf(d),
          defence: d, spells: [], ct: 0, guarding: false, boss: d.boss,
          status: new BattleStatus(d.resists ?? [], !!d.boss, !!d.undead), inflicts: d.inflicts,
          actions: d.actions, attackWeight: d.attackWeight, counterspell: d.counterspell,
        };
        const pic = this.pics.get(`enemy:${d.id}`)?.img ?? document.createElement('canvas');
        const big = document.createElement('canvas');
        const sc = Math.max(1, Math.round(64 / Math.max(1, pic.height)));
        big.width = pic.width * sc; big.height = pic.height * sc;
        const g = big.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        g.drawImage(pic, 0, 0, big.width, big.height);
        this.battleFoes.set(battler.key, d);
        entries.push({ battler, view: { key: battler.key, side: 'enemy', name, level: d.level, picture: big, icon: '', scale: d.scale, elements: d.elements }, ref: d });
      });
      this.battle.start(entries, this.cfg.turnBased, 'normal', { canRun });
    }, 500);
  }
  flash = 0;

  battleHost(): BattleHost {
    const earn = (who: number, xp: number) => this.earned.set(who, (this.earned.get(who) ?? 0) + xp);
    return {
      sound: (n) => this.audio.play(n),
      items: () => this.inventory.slots.flatMap((s, i) => {
        const d = s && this.items.get(s.id);
        if (!s || !d || d.kind !== 'consumable' || !(d.restore || d.restorePct || d.cures?.length || d.revive)) return [];
        return [{ slot: i, name: d.name, count: s.n, detail: d.description, restore: { hp: d.restore?.hp, mp: d.restore?.mp }, pct: { hp: d.restorePct?.hp, mp: d.restorePct?.mp }, cures: d.cures as string[] | undefined, buffs: d.buffs }];
      }),
      useItem: (slot, who) => {
        const s = this.inventory.slots[slot], d = s && this.items.get(s.id), m = this.party[who];
        if (!s || !d || !m) return null;
        const mx = this.maxOf(m);
        const hp = (d.restore?.hp ?? 0) + Math.round(((d.restorePct?.hp ?? 0) * mx.hp) / 100);
        const mp = (d.restore?.mp ?? 0) + Math.round(((d.restorePct?.mp ?? 0) * mx.mp) / 100);
        const before = { hp: m.hp, mp: m.mp };
        m.hp = Math.min(mx.hp, m.hp + hp); m.mp = Math.min(mx.mp, m.mp + mp);
        this.inventory.remove(s.id, 1);
        const got = [m.hp > before.hp ? `+${m.hp - before.hp} HP` : '', m.mp > before.mp ? `+${m.mp - before.mp} MP` : ''].filter(Boolean).join(', ');
        return { text: `${m.def.name} used ${d.name}!${got ? ` (${got})` : ''}`, used: true, cures: (d.cures ?? []) as never, buffs: d.buffs };
      },
      spendItem: (slot) => { const s = this.inventory.slots[slot]; if (s) this.inventory.remove(s.id, 1); },
      readVitals: (who) => ({ hp: this.party[who]?.hp ?? 0, mp: this.party[who]?.mp ?? 0 }),
      writeVitals: (who, hp, mp) => { const m = this.party[who]; if (m) { m.hp = Math.max(0, hp); m.mp = Math.max(0, mp); } },
      // The rest of the party: sent in with PARTY (or when the one out falls).
      reserves: () => this.party.flatMap((m, who) => {
        if (this.battle.lineup().includes(who)) return [];
        const mx = this.maxOf(m);
        return [{ who, name: m.def.name, icon: this.faceOf(m) ?? '', hp: Math.max(0, m.hp), maxHp: mx.hp, mp: m.mp, maxMp: mx.mp, down: m.hp <= 0 }];
      }),
      swapIn: (_outKey, _outWho, inWho) => {
        if (!this.party[inWho]) return null;
        this.battleWhos.add(inWho);
        return this.memberEntry(inWho);
      },
      heroColor: (who) => this.party[who]?.def.color ?? '#5a9cff',
      // EXP as each foe falls, shared by everyone who's been out (Pokémon: each gets it in full).
      foeDefeated: (key) => {
        const d = this.battleFoes.get(key), xp = Math.max(0, d?.xp ?? 0);
        if (!xp) return [];
        const out = [...this.battleWhos].filter((w) => (this.party[w]?.hp ?? 0) > 0);
        for (const w of out) earn(w, xp);
        return out.map((who) => ({ who, xp }));
      },
      xpPreview: (who) => {
        const m = this.party[who];
        if (!m) return { level: 1, frac: 0 };
        let level = m.level, have = m.xp, left = this.earned.get(who) ?? 0;
        for (let guard = 0; guard < 100; guard++) {
          const need = xpToNext(this.cfg, level);
          if (need <= 0) return { level, frac: 1 };
          if (have + left < need) return { level, frac: (have + left) / need };
          left -= need - have; have = 0; level++;
        }
        return { level, frac: 1 };
      },
      mastered: (who, id) => { const m = this.party[who]; return m ? master(this.db, m, id) : null; },
      victory: (beaten) => {
        const foes = beaten as EnemyDef[];
        const gold = foes.reduce((n, d) => n + Math.max(0, (d as { gold?: number }).gold ?? 0), 0);
        this.inventory.gold += gold;
        const heroes: VictoryReport['heroes'] = [];
        let total = 0;
        for (const [who, xp] of this.earned) {
          const m = this.party[who];
          if (!m || m.hp <= 0) continue;
          total = Math.max(total, xp);
          const startLevel = m.level, startXp = m.xp;
          const segments: VictoryReport['heroes'][number]['segments'] = [];
          let level = m.level, have = m.xp, left = xp;
          for (let guard = 0; guard < 50; guard++) {
            const need = xpToNext(this.cfg, level);
            if (need <= 0) break;
            if (have + left < need) { segments.push({ level, from: have / need, to: (have + left) / need, up: false, xp: have + left, toNext: need }); break; }
            segments.push({ level, from: have / need, to: 1, up: true, xp: need, toNext: need });
            left -= need - have; have = 0; level++;
          }
          gainXp(this.db, this.cfg, m, xp, this.itemDef);
          heroes.push({ key: `p${who}`, name: m.def.name, icon: this.faceOf(m) ?? '', level: startLevel, xp: startXp, toNext: xpToNext(this.cfg, startLevel), gained: xp, segments,
            changes: m.level > startLevel ? [`Level ${startLevel} → ${m.level}`] : [], after: { level: m.level, xp: m.xp, toNext: xpToNext(this.cfg, m.level) } });
        }
        return { xp: total, heroes, loot: gold ? [{ name: 'Gold', icon: '', count: gold, kind: 'gold' }] : [] };
      },
      fanfare: () => this.audio.music('builtin:victory', 0.2),
      finished: (outcome) => {
        this.grace = this.cfg.turnBased.grace || 3;
        this.walked = 0;
        this.battleFoes.clear();
        const rules = this.battleRules;
        this.battleRules = {};
        if (rules.resultVar) { this.state.setVar(rules.resultVar, outcome === 'victory' ? 1 : outcome === 'fled' ? 2 : 0); this.refreshEvents(); }
        this.music(this.cur.data.music, 'field', 0.8);
        if (outcome === 'defeat') {
          if (rules.lose !== 'continue') {
            // Whited out: back to the start, everyone patched up.
            this.healAll();
            this.interp.stop();
            const st = this.db.start;
            this.transfer(this.db.startMap, st.x, st.z, (st.dir as Dir) ?? 'down');
          } else for (const m of this.party) if (m.hp <= 0) m.hp = 1;
        }
      },
      log: () => {},
    };
  }
  /** The foes in this battle by their key (for their EXP). */
  battleFoes = new Map<string, EnemyDef>();

  /** Random battles: the zone painted under the player (Encounters layer), or the map's own table. */
  encounterStep(): void {
    if (this.grace > 0) { this.grace--; return; }
    const m = this.cur.data;
    const letter = m.zoneGrid?.[this.cz]?.[this.cx];
    const zone = letter && letter !== '.' ? m.zones?.[letter] : undefined;
    const steps = zone?.steps ?? m.encounters?.steps ?? 30;
    if (!zone && !m.encounters?.enemies.length) return;
    this.walked++;
    if (Math.random() * steps > 1 && this.walked < steps * 2) return;
    this.walked = 0;
    let foes: EnemyDef[] = [];
    if (zone) {
      const hour = 12;
      const t = pickTroop(zone, { night: hour < 6 || hour >= 20, weekday: new Date().getDay(), switchOn: (id) => this.state.getSwitch(id) });
      const troop = t && this.db.troops?.find((x) => x.id === t.troop);
      if (!troop) return;
      for (const mb of troop.members) {
        const lo = mb.min ?? 1, hi = Math.max(lo, mb.max ?? lo);
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        const d = this.db.enemies?.find((e) => e.id === mb.enemy);
        if (d) for (let k = 0; k < n; k++) foes.push(d);
      }
      if (troop.pick === 'random' && foes.length > 1) foes = [foes[Math.floor(Math.random() * foes.length)]];
      this.battleRules = {};
      this.startBattle(foes, !troop.noRun, troop.music);
      return;
    }
    const tbl = m.encounters!;
    const total = tbl.enemies.reduce((n, e) => n + (e.weight ?? 1), 0);
    const n = (tbl.min ?? 1) + Math.floor(Math.random() * ((tbl.max ?? 3) - (tbl.min ?? 1) + 1));
    for (let k = 0; k < n; k++) {
      let r = Math.random() * total;
      const pick = tbl.enemies.find((e) => (r -= e.weight ?? 1) < 0) ?? tbl.enemies[0];
      const d = this.db.enemies?.find((e) => e.id === pick.enemy);
      if (d) foes.push(d);
    }
    this.battleRules = {};
    this.startBattle(foes);
  }

  /* ------------------------------------------------------------------ frame */

  update(dt: number): void {
    this.tick++;
    this.input.pollGamepad(dt);
    if (this.banner > 0) this.banner--;
    if (this.flash > 0) this.flash--;
    // fades (transfers, Fade out / in commands)
    if (this.fade !== this.fadeTarget) {
      const step = this.fadeSpeed * dt;
      this.fade = this.fade < this.fadeTarget ? Math.min(this.fadeTarget, this.fade + step) : Math.max(this.fadeTarget, this.fade - step);
      if (this.fade >= 1 && this.pendingTransfer) {
        const t = this.pendingTransfer;
        this.pendingTransfer = null;
        this.enter(t.map, t.x, t.z, t.dir);
        this.fadeTarget = 0;
      }
    }
    if (this.battle.active) {
      this.input.mode = 'menu';
      this.battle.update(dt);
      this.input.endFrame();
      return;
    }
    this.interp.update(dt);
    if (!this.interp.running) this.runningEvent = null;
    this.message.update(dt);
    this.message.position();
    this.ui.update();
    const free = !this.busy;
    this.input.mode = free ? 'field' : 'menu';

    if (free && this.moving === 0) {
      // START: the menu.
      if (this.input.consume('settings')) { this.input.consume('ok'); void this.menus.start(); this.input.endFrame(); return; }
      // autorun events
      const auto = this.cur.events.find((e) => e.page?.trigger === 'auto' && e.page.commands.length);
      if (auto) { this.runEvent(auto); this.input.endFrame(); return; }
      const want = (['down', 'up', 'left', 'right'] as Dir[]).find((d) => this.input.isHeld(d));
      if (this.input.consume('ok')) {
        const fx = this.cx + DX[this.dir], fz = this.cz + DZ[this.dir];
        const e = this.eventAt(fx, fz, (x) => x.page?.trigger === 'action') ?? this.eventAt(this.cx, this.cz, (x) => x.page?.trigger === 'action');
        if (e) { this.runEvent(e); this.input.endFrame(); return; }
      }
      if (want) {
        this.dir = want;
        const tx = this.cx + DX[want], tz = this.cz + DZ[want];
        if (this.canHop(want)) {
          this.cx = tx + DX[want]; this.cz = tz + DZ[want];
          this.moving = this.hop = CELL * 2;
          this.steps++;
          this.running = false;
          this.audio.play('jump');
        } else if (!this.blocked(tx, tz)) {
          this.cx = tx; this.cz = tz;
          this.moving = CELL;
          this.steps++;
          this.running = this.input.isHeld('run');
        } else if (this.bump === 0) {
          this.bump = 12;
          const e = this.eventAt(tx, tz, (x) => x.page?.trigger === 'touch');
          if (e) this.runEvent(e);
        }
      }
      if (this.bump > 0) this.bump--;
    }
    if (this.moving > 0) {
      const speed = Math.min(this.running || this.hop ? 2 : 1, this.moving);
      this.moving -= speed;
      this.px += DX[this.dir] * speed;
      this.pz += DZ[this.dir] * speed;
      if (this.moving === 0) {
        this.hop = 0;
        const e = this.eventAt(this.cx, this.cz, (x) => x.page?.trigger === 'touch');
        if (e) this.runEvent(e);
        else this.encounterStep();
      }
    }
    if (!free) this.input.consume('settings');
    this.input.endFrame();
  }

  camera(): { camX: number; camZ: number } {
    const m = this.cur.data, mw = m.width * CELL, mh = m.height * CELL;
    const clamp = (v: number, map: number, screen: number) => (map <= screen ? (map - screen) / 2 : Math.max(0, Math.min(v, map - screen)));
    return { camX: Math.round(clamp(this.px + CELL / 2 - W / 2, mw, W)), camZ: Math.round(clamp(this.pz + CELL / 2 - H / 2, mh, H)) };
  }

  render(): void {
    const g = this.g;
    g.imageSmoothingEnabled = false;
    const m = this.cur.data, { camX, camZ } = this.camera();
    g.fillStyle = '#101810';
    g.fillRect(0, 0, W, H);
    g.drawImage(this.cur.under, -camX, -camZ);

    // Props, people and the player, back to front (by the row their feet are on).
    const items: { z: number; draw: () => void }[] = [];
    for (const p of m.props) {
      const pic = this.pics.get(`prop:${p.type}`);
      if (!pic) continue;
      const sc = p.s ?? 1, w = pic.w * sc, h = pic.h * sc;
      items.push({ z: p.z, draw: () => g.drawImage(pic.img, Math.round(p.x * CELL - w / 2 - camX), Math.round(p.z * CELL - h - camZ), w, h) });
    }
    for (const e of this.cur.events) {
      const pg = e.page;
      if (!pg) continue;
      const d = e.data, cx = (d.x + (d.w ?? 1) / 2) * CELL, foot = (d.z + (d.h ?? 1)) * CELL;
      if (pg.gbaSprite) {
        const sp = this.gba.sprites.find((s) => s.id === pg.gbaSprite), sheet = sp ? this.images.get(sp.image) : undefined;
        if (sheet) items.push({ z: d.z + 0.5, draw: () => this.drawFrame(sheet, ROW[e.dir], 0, e.dir === 'right', Math.round(cx - 8 - camX), foot - 32 - camZ) });
      } else if (pg.character) {
        const pic = this.pics.get(`char:${pg.character}:${e.dir}`);
        if (pic) items.push({ z: d.z + 0.5, draw: () => g.drawImage(pic.img, Math.round(cx - pic.w / 2 - camX), foot - pic.h - camZ, pic.w, pic.h) });
      } else if (pg.sprite) {
        const pic = this.pics.get(`prop:${pg.sprite}`);
        if (pic) items.push({ z: d.z + 0.5, draw: () => g.drawImage(pic.img, Math.round(cx - pic.w / 2 - camX), foot - pic.h - camZ, pic.w, pic.h) });
      }
    }
    let col = this.moving > CELL / 2 ? 1 + (this.steps & 1) : 0;
    if (this.running && this.moving > 0) col += 3;
    let lift = 0;
    if (this.hop) { const done = this.hop - this.moving; lift = Math.floor((done * (this.hop - done) * 32) / (this.hop * this.hop)); }
    const sp = this.gba.sprites.find((s) => s.id === this.gba.player && s.kind === 'overworld');
    const sheet = sp ? this.images.get(sp.image) : undefined;
    items.push({ z: this.pz / CELL + 0.6, draw: () => {
      if (sheet) this.drawFrame(sheet, ROW[this.dir], col, this.dir === 'right', this.px - camX, this.pz - CELL - camZ - lift);
      else { const pic = this.pics.get(`char:${this.db.player}:${this.dir}`); if (pic) g.drawImage(pic.img, this.px + 8 - pic.w / 2 - camX, this.pz + CELL - pic.h - camZ - lift); }
    } });
    items.sort((a, b) => a.z - b.z).forEach((it) => it.draw());
    g.drawImage(this.cur.over, -camX, -camZ);

    if (this.banner > 0 && !this.message.isOpen) {
      g.font = '10px "Game Pixel", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 3;
      g.strokeStyle = '#000';
      g.strokeText(m.name, W / 2, 12);
      g.fillStyle = '#fff';
      g.fillText(m.name, W / 2, 12);
    }
    if (this.flash > 0) { g.fillStyle = (this.flash >> 2) & 1 ? '#fff' : '#000'; g.fillRect(0, 0, W, H); }
    if (this.fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade)})`; g.fillRect(0, 0, W, H); }
  }

  drawFrame(img: HTMLCanvasElement, row: number, col: number, flip: boolean, x: number, y: number): void {
    const g = this.g;
    if (flip) { g.save(); g.translate(x + 16, y); g.scale(-1, 1); g.drawImage(img, col * 16, row * 32, 16, 32, 0, 0, 16, 32); g.restore(); }
    else g.drawImage(img, col * 16, row * 32, 16, 32, x, y, 16, 32);
  }
}
