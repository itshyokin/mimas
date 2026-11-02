/**
 * GBA playtest: plays a GBA Studio map right in the editor, the way the ROM does
 * (game/src/main.cpp): 240×160 screen, grid steps, run with B, ledge hops, tree
 * tops over the player, people, signs, text boxes and doors between maps.
 *
 * Keys: arrows / WASD walk, Z / Space / Enter = A, X / Shift = B (run), Esc quits.
 * A gamepad works too (d-pad or stick, A, B).
 */
import { collision, drawMap, eventAt, LEDGE_E, LEDGE_S, LEDGE_W, SOLID, type TileLookup } from '../gba/mapRender';
import { CELL, textPages, type Facing, type GbaCommand, type GbaEvent, type GbaMap } from '../gba/types';

export interface PlayWorld {
  maps: Map<string, GbaMap>;
  look: TileLookup;
  /** An overworld sprite sheet (16×32 frames, rows down / up / left) by sprite id. */
  sprite(id: string): HTMLCanvasElement | null;
  /** The player's sheet. */
  player: HTMLCanvasElement | null;
}

const SCREEN_W = 240, SCREEN_H = 160;
const FW = 16, FH = 32;
const DX = { down: 0, up: 0, left: -1, right: 1 } as const;
const DY = { down: 1, up: -1, left: 0, right: 0 } as const;
const ROW: Record<Facing, number> = { down: 0, up: 1, left: 2, right: 2 };
const OPPOSITE: Record<Facing, Facing> = { down: 'up', up: 'down', left: 'right', right: 'left' };

interface Loaded {
  m: GbaMap;
  under: HTMLCanvasElement;
  over: HTMLCanvasElement;
  coll: Uint8Array;
  facing: Map<number, Facing>;
}

let running = false;

export function openGbaPlaytest(world: PlayWorld, mapId: string, at?: { x: number; y: number; dir?: Facing }): void {
  if (running) return;
  const m = world.maps.get(mapId);
  if (!m) return;
  running = true;
  new Playtest(world).start(mapId, at);
}

class Playtest {
  root!: HTMLElement;
  screen = document.createElement('canvas');
  view = document.createElement('canvas');
  scale = 3;
  cur!: Loaded;
  cache = new Map<string, Loaded>();
  // player
  cx = 0; cy = 0; px = 0; py = 0;
  facing: Facing = 'down';
  moving = 0; hop = 0; steps = 0; run = false; bump = 0;
  // input
  keys = new Set<string>();
  pressed = new Set<string>();
  // scripts
  queue: GbaCommand[] = [];
  text: { pages: string[][]; page: number; shown: number } | null = null;
  fade = 0;            // 0 = clear, 16 = black
  fadeDir = 0;
  pendingTransfer: Extract<GbaCommand, { type: 'transfer' }> | null = null;
  banner = 0;
  raf = 0;
  last = 0;
  acc = 0;
  pads: boolean[] = [];

  constructor(private world: PlayWorld) {}

  start(mapId: string, at?: { x: number; y: number; dir?: Facing }): void {
    this.screen.width = SCREEN_W;
    this.screen.height = SCREEN_H;
    this.root = document.createElement('div');
    this.root.className = 'gba-play';
    const bar = document.createElement('div');
    bar.className = 'gba-play-bar';
    bar.innerHTML = '<strong>GBA playtest</strong><span>Arrows / WASD walk · Z or Space = A (talk, next) · hold X or Shift = B (run) · Esc to stop</span>';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn';
    close.textContent = 'Stop';
    close.onclick = () => this.stop();
    bar.append(close);
    this.view.className = 'gba-play-screen';
    this.root.append(bar, this.view);
    document.body.append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('resize', this.onResize);
    this.onResize();
    const m = this.world.maps.get(mapId)!;
    const start = at ?? { x: m.start?.[0] ?? Math.floor(m.width / 2), y: m.start?.[1] ?? Math.floor(m.height / 2), dir: m.dir };
    this.enter(mapId, start.x, start.y, start.dir ?? 'down');
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
    running = false;
  }

  onResize = (): void => {
    const s = Math.max(1, Math.floor(Math.min((window.innerWidth - 24) / SCREEN_W, (window.innerHeight - 80) / SCREEN_H)));
    this.scale = s;
    this.view.width = SCREEN_W * s;
    this.view.height = SCREEN_H * s;
  };

  /* ------------------------------------------------------------------ input */

  static KEYMAP: Record<string, string> = {
    ArrowDown: 'down', ArrowUp: 'up', ArrowLeft: 'left', ArrowRight: 'right',
    s: 'down', w: 'up', a: 'left', d: 'right', S: 'down', W: 'up', A: 'left', D: 'right',
    z: 'A', Z: 'A', ' ': 'A', Enter: 'A', x: 'B', X: 'B', Shift: 'B',
  };

  onKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); this.stop(); return; }
    const k = Playtest.KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    if (!this.keys.has(k)) this.pressed.add(k);
    this.keys.add(k);
  };

  onKeyUp = (e: KeyboardEvent): void => {
    e.stopPropagation();
    const k = Playtest.KEYMAP[e.key];
    if (k) this.keys.delete(k);
  };

  held(k: string): boolean { return this.keys.has(k) || this.padHeld(k); }

  padHeld(k: string): boolean {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p);
    if (!pad) return false;
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
    switch (k) {
      case 'down': return b(13) || ay > 0.5;
      case 'up': return b(12) || ay < -0.5;
      case 'left': return b(14) || ax < -0.5;
      case 'right': return b(15) || ax > 0.5;
      case 'A': return b(0);
      case 'B': return b(1);
      default: return false;
    }
  }

  pollPad(): void {
    for (const k of ['A', 'B']) {
      const now = this.padHeld(k), was = this.pads[k === 'A' ? 0 : 1];
      if (now && !was) this.pressed.add(k);
      this.pads[k === 'A' ? 0 : 1] = now;
    }
  }

  /* ------------------------------------------------------------------ maps */

  load(id: string): Loaded {
    const m = this.world.maps.get(id)!;
    const under = document.createElement('canvas');
    const over = document.createElement('canvas');
    under.width = over.width = m.width * CELL;
    under.height = over.height = m.height * CELL;
    drawMap(under.getContext('2d')!, m, this.world.look, 1, 0, 'under');
    drawMap(over.getContext('2d')!, m, this.world.look, 1, 0, 'over');
    const coll = collision(m, this.world.look);
    const facing = new Map<number, Facing>();
    for (const e of m.events ?? []) facing.set(e.id, e.dir ?? 'down');
    return { m, under, over, coll, facing };
  }

  enter(id: string, x: number, y: number, dir: Facing): void {
    if (!this.cache.has(id)) this.cache.set(id, this.load(id));
    this.cur = this.cache.get(id)!;
    const m = this.cur.m;
    this.cx = Math.max(0, Math.min(m.width - 1, x));
    this.cy = Math.max(0, Math.min(m.height - 1, y));
    this.px = this.cx * CELL;
    this.py = this.cy * CELL;
    this.facing = dir;
    this.moving = this.hop = 0;
    this.banner = 150;
  }

  inside(x: number, y: number): boolean { const m = this.cur.m; return x >= 0 && y >= 0 && x < m.width && y < m.height; }

  blockedByEvent(x: number, y: number): boolean {
    const e = eventAt(this.cur.m, x, y);
    return !!e && !!e.sprite && e.solid !== false;
  }

  canStep(tx: number, ty: number): boolean {
    if (!this.inside(tx, ty)) return false;
    if (this.cur.coll[ty * this.cur.m.width + tx] & SOLID) return false;
    return !this.blockedByEvent(tx, ty);
  }

  canHop(dir: Facing): boolean {
    const tx = this.cx + DX[dir], ty = this.cy + DY[dir];
    if (!this.inside(tx, ty)) return false;
    const c = this.cur.coll[ty * this.cur.m.width + tx];
    const ledge = (dir === 'down' && c & LEDGE_S) || (dir === 'right' && c & LEDGE_E) || (dir === 'left' && c & LEDGE_W);
    if (!ledge) return false;
    const lx = tx + DX[dir], ly = ty + DY[dir];
    return this.inside(lx, ly) && !(this.cur.coll[ly * this.cur.m.width + lx] & SOLID) && !this.blockedByEvent(lx, ly);
  }

  /* ------------------------------------------------------------------ events */

  runEvent(e: GbaEvent): void {
    if (e.sprite && e.trigger === 'action') this.cur.facing.set(e.id, OPPOSITE[this.facing]);
    this.queue = [...e.commands];
    this.next();
  }

  /** Start the next command, if any. */
  next(): void {
    const c = this.queue.shift();
    if (!c) return;
    if (c.type === 'text') this.text = { pages: textPages(c.text), page: 0, shown: 0 };
    else if (c.type === 'transfer') {
      if (!this.world.maps.has(c.map)) { this.next(); return; }
      this.pendingTransfer = c;
      this.fadeDir = 1;
    }
  }

  busy(): boolean { return !!this.text || this.fadeDir !== 0 || this.fade > 0; }

  /* ------------------------------------------------------------------ frame */

  loop = (now: number): void => {
    this.acc += Math.min(100, now - this.last);
    this.last = now;
    while (this.acc >= 1000 / 60) {
      this.acc -= 1000 / 60;
      this.pollPad();
      this.tick();
      this.pressed.clear();
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  tick(): void {
    if (this.banner > 0) this.banner--;
    // fades for transfers (16 steps each way, like the ROM)
    if (this.fadeDir) {
      this.fade += this.fadeDir;
      if (this.fade >= 16 && this.fadeDir > 0) {
        const t = this.pendingTransfer!;
        this.pendingTransfer = null;
        this.enter(t.map, t.x, t.y, t.dir ?? this.facing);
        this.fadeDir = -1;
      } else if (this.fade <= 0 && this.fadeDir < 0) {
        this.fade = 0;
        this.fadeDir = 0;
        this.next();
      }
      return;
    }
    if (this.text) {
      const page = this.text.pages[this.text.page];
      const total = page.join('').length;
      if (this.text.shown < total) {
        this.text.shown = Math.min(total, this.text.shown + 1);
        if (this.pressed.has('A') || this.pressed.has('B')) this.text.shown = total;
      } else if (this.pressed.has('A') || this.pressed.has('B')) {
        this.text.page++;
        this.text.shown = 0;
        if (this.text.page >= this.text.pages.length) { this.text = null; this.next(); }
      }
      return;
    }

    if (this.moving === 0) {
      const want = (['down', 'up', 'left', 'right'] as Facing[]).find((d) => this.held(d));
      if (this.pressed.has('A')) {
        const e = eventAt(this.cur.m, this.cx + DX[this.facing], this.cy + DY[this.facing]);
        if (e && e.trigger === 'action') { this.runEvent(e); return; }
      }
      if (want) {
        this.facing = want;
        const tx = this.cx + DX[want], ty = this.cy + DY[want];
        if (this.canHop(want)) {
          this.cx = tx + DX[want]; this.cy = ty + DY[want];
          this.moving = this.hop = CELL * 2;
          this.steps++;
          this.run = false;
        } else if (this.canStep(tx, ty)) {
          this.cx = tx; this.cy = ty;
          this.moving = CELL;
          this.steps++;
          this.run = this.held('B');
        } else {
          // walking into a blocked touch event (a door in a wall) runs it
          const e = eventAt(this.cur.m, tx, ty);
          if (e && e.trigger === 'touch' && this.bump === 0) { this.bump = 8; this.runEvent(e); return; }
          if (this.bump === 0) this.bump = 8;
        }
      }
      if (this.bump > 0) this.bump--;
    }
    if (this.moving > 0) {
      const speed = Math.min(this.run || this.hop ? 2 : 1, this.moving);
      this.moving -= speed;
      this.px += DX[this.facing] * speed;
      this.py += DY[this.facing] * speed;
      if (this.moving === 0) {
        this.hop = 0;
        const e = eventAt(this.cur.m, this.cx, this.cy);
        if (e && e.trigger === 'touch') this.runEvent(e);
      }
    }
  }

  render(): void {
    const g = this.screen.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const m = this.cur.m;
    const mw = m.width * CELL, mh = m.height * CELL;
    const clamp = (v: number, map: number, screen: number) => (map <= screen ? (map - screen) / 2 : Math.max(0, Math.min(v, map - screen)));
    const camX = Math.round(clamp(this.px + CELL / 2 - SCREEN_W / 2, mw, SCREEN_W));
    const camY = Math.round(clamp(this.py + CELL / 2 - SCREEN_H / 2, mh, SCREEN_H));
    g.fillStyle = '#101810';
    g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    g.drawImage(this.cur.under, -camX, -camY);

    // people and the player, back to front
    const actors: { y: number; draw: () => void }[] = [];
    for (const e of m.events ?? []) {
      if (!e.sprite) continue;
      const img = this.world.sprite(e.sprite);
      if (!img) continue;
      const f = this.cur.facing.get(e.id) ?? 'down';
      actors.push({ y: e.y * CELL, draw: () => this.drawFrame(g, img, ROW[f], 0, f === 'right', e.x * CELL - camX, e.y * CELL - CELL - camY) });
    }
    let col = this.moving > CELL / 2 ? 1 + (this.steps & 1) : 0;
    if (this.run && this.moving > 0) col += 3;
    let lift = 0;
    if (this.hop) { const done = this.hop - this.moving; lift = Math.floor((done * (this.hop - done) * 32) / (this.hop * this.hop)); }
    const player = this.world.player;
    actors.push({ y: this.py, draw: () => {
      if (player) this.drawFrame(g, player, ROW[this.facing], col, this.facing === 'right', this.px - camX, this.py - CELL - camY - lift);
      else { g.fillStyle = '#f0a040'; g.fillRect(this.px - camX + 3, this.py - camY - lift, 10, 16); }
    } });
    actors.sort((a, b) => a.y - b.y).forEach((a) => a.draw());
    g.drawImage(this.cur.over, -camX, -camY);

    // fade
    if (this.fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, this.fade / 16)})`; g.fillRect(0, 0, SCREEN_W, SCREEN_H); }

    // scale up, then text on top (crisp at any size)
    const v = this.view.getContext('2d')!;
    v.imageSmoothingEnabled = false;
    v.drawImage(this.screen, 0, 0, this.view.width, this.view.height);
    const s = this.scale;
    if (this.banner > 0) this.label(v, m.name, SCREEN_W / 2, 14, 'center');
    if (this.text) {
      // the ROM's box: 232×44 at the bottom of the screen
      v.fillStyle = '#f8f8f8';
      v.fillRect(4 * s, 112 * s, 232 * s, 44 * s);
      v.strokeStyle = '#305090';
      v.lineWidth = 2 * s;
      v.strokeRect(5 * s, 113 * s, 230 * s, 42 * s);
      const page = this.text.pages[this.text.page];
      let left = this.text.shown;
      v.fillStyle = '#303038';
      v.font = `${10 * s}px "Trebuchet MS", sans-serif`;
      v.textBaseline = 'top';
      v.textAlign = 'left';
      page.forEach((line, i) => {
        const part = line.slice(0, Math.max(0, left));
        left -= line.length;
        v.fillText(part, 12 * s, (119 + i * 16) * s);
      });
      if (this.text.shown >= page.join('').length && Math.floor(performance.now() / 300) % 2) {
        v.fillStyle = '#d04040';
        v.beginPath();
        v.moveTo(222 * s, 146 * s); v.lineTo(230 * s, 146 * s); v.lineTo(226 * s, 151 * s);
        v.fill();
      }
    }
  }

  drawFrame(g: CanvasRenderingContext2D, img: HTMLCanvasElement, row: number, col: number, flip: boolean, x: number, y: number): void {
    if (flip) {
      g.save();
      g.translate(x + FW, y);
      g.scale(-1, 1);
      g.drawImage(img, col * FW, row * FH, FW, FH, 0, 0, FW, FH);
      g.restore();
    } else g.drawImage(img, col * FW, row * FH, FW, FH, x, y, FW, FH);
  }

  label(v: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign): void {
    const s = this.scale;
    v.font = `bold ${10 * s}px "Trebuchet MS", sans-serif`;
    v.textAlign = align;
    v.textBaseline = 'middle';
    v.lineWidth = 3 * s;
    v.strokeStyle = '#000';
    v.strokeText(text, x * s, y * s);
    v.fillStyle = '#fff';
    v.fillText(text, x * s, y * s);
  }
}

