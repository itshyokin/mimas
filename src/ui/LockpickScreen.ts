/**
 * Lockpicking (Update 119), Skyrim style. The pick swings round the top half of the lock (← → or the stick, or the
 * mouse); holding Space / A turns the cylinder. Near the sweet spot it turns further; on the spot it turns all the way
 * and the lock opens. Off the spot it jams, and holding a jammed lock strains the pick until it snaps (a lockpick from
 * the bag is used up when the game has lockpick items). The sweet spot is wider on easier locks. Controllers rumble
 * more the closer the pick is, and a soft click ticks faster near it for everyone.
 */
import type { Input } from '../game/Input';
import type { LockLevel } from '../world/types';
import { uiSound } from '../audio/sfx';

export const LOCK_LEVELS: LockLevel[] = ['easy', 'medium', 'hard', 'impossible', 'never'];
export const LOCK_NAMES: Record<LockLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard', impossible: 'Impossible', never: 'Cannot be picked' };
export const LOCK_COLORS: Record<LockLevel, string> = { easy: '#5ad06a', medium: '#f0d040', hard: '#ff9a3a', impossible: '#ff4a4a', never: '#9a9aa6' };
/** Half the sweet spot's width in degrees, per difficulty. */
const SWEET: Record<LockLevel, number> = { easy: 16, medium: 9, hard: 5, impossible: 2, never: 0 };
/** The little canvas the lock is drawn on (scaled up crisp), and how long a snapped pick shows. */
const W = 112, H = 84;
const SNAP_TIME = 0.6;

export interface LockpickHost {
  /** Picks left in the bag (null: the game has no lockpick items, so picking is free). */
  picks(): number | null;
  /** A pick snapped: take one from the bag. */
  breakPick(): void;
  sound(name: 'lockClick' | 'lockTurn' | 'lockOpen' | 'lockBreak'): void;
  rumble(strength: number, ms: number): void;
}

export class LockpickScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private level: LockLevel = 'easy';
  private done: (ok: boolean) => void = () => {};
  /** The pick's angle, −90 (left) … 90 (right), and the sweet spot's. */
  private angle = 0;
  private sweet = 0;
  /** How far the cylinder has turned, 0 … 1. */
  private turn = 0;
  /** How strained the pick is, 0 … 1 (snaps at 1). */
  private strain = 0;
  private clickT = 0;
  private turnSoundT = 0;
  private closing = 0;
  private mouseHeld = false;
  /** A pick just snapped: shown flying apart for a moment before the next one. */
  private snapT = 0;
  /** Out of picks after this snap: the attempt ends once it's shown. */
  private out = false;

  constructor(parent: HTMLElement, private readonly input: Input, private readonly host: LockpickHost) {
    this.root.className = 'lockpick';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Pick the lock');
    parent.appendChild(this.root);
    this.root.addEventListener('mousemove', (e) => {
      const dial = this.canvas;
      if (!dial || !this.open) return;
      const r = dial.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + (r.height * 52) / H;
      const a = (Math.atan2(e.clientX - cx, cy - e.clientY) * 180) / Math.PI;
      if (this.turn < 0.02) this.angle = Math.max(-90, Math.min(90, a));
    });
    this.root.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouseHeld = true; });
    window.addEventListener('mouseup', () => (this.mouseHeld = false));
  }

  get isOpen(): boolean { return this.open; }

  show(level: LockLevel, done: (ok: boolean) => void): void {
    this.open = true;
    this.level = level;
    this.done = done;
    this.angle = 0;
    this.turn = 0;
    this.strain = 0;
    this.closing = 0;
    this.snapT = 0;
    this.out = false;
    // Somewhere in the half circle, not hugging the very ends.
    this.sweet = Math.round((Math.random() * 2 - 1) * 78);
    this.root.hidden = false;
    this.render();
  }

  private finish(ok: boolean): void {
    this.open = false;
    this.root.hidden = true;
    this.done(ok);
  }

  /** How far the cylinder may turn with the pick where it is: all the way on the spot, less further off. */
  private reach(): number {
    const w = SWEET[this.level], off = Math.abs(this.angle - this.sweet);
    if (off <= w) return 1;
    const fall = w * 3 + 14;
    return Math.max(0, 1 - (off - w) / fall) * 0.85;
  }

  update(dt: number): void {
    if (!this.open) return;
    const i = this.input;
    if (this.closing > 0) {
      this.closing -= dt;
      this.render();
      if (this.closing <= 0) this.finish(true);
      return;
    }
    if (i.consume('cancel')) { uiSound('menuBack'); this.finish(false); return; }
    if (this.snapT > 0) { this.snapT = Math.max(0, this.snapT - dt); this.render(); if (this.snapT <= 0 && this.out) this.finish(false); return; }
    const turning = i.isHeld('ok') || i.isHeld('jump') || this.mouseHeld;
    i.consume('ok'); i.consume('jump');
    // The pick only moves while the cylinder is at rest.
    if (!turning || this.turn < 0.02) {
      const sx = Math.abs(i.stick.x) > 0.15 ? i.stick.x : (i.isHeld('right') ? 1 : 0) - (i.isHeld('left') ? 1 : 0);
      this.angle = Math.max(-90, Math.min(90, this.angle + sx * 75 * dt));
    }
    i.consume('left'); i.consume('right');
    const reach = this.reach(), near = Math.max(0, 1 - Math.abs(this.angle - this.sweet) / 60);
    // A soft click that ticks faster (and a rumble that grows) as the pick nears the spot.
    this.clickT -= dt;
    if (this.clickT <= 0 && !turning) {
      this.clickT = 0.55 - near * 0.42;
      if (near > 0.15) { this.host.sound('lockClick'); this.host.rumble(0.08 + near * near * 0.5, 50); }
    }
    if (turning) {
      this.turn = Math.min(reach, this.turn + dt * 1.6);
      this.turnSoundT -= dt;
      if (this.turnSoundT <= 0) { this.turnSoundT = 0.3; this.host.sound('lockTurn'); }
      if (this.turn >= 1) { this.host.sound('lockOpen'); this.host.rumble(0.6, 160); this.closing = 0.6; this.render(); return; }
      if (this.turn >= reach - 0.01) {
        // Jammed: the pick strains (and the controller shakes) until it snaps.
        this.strain += dt * (this.level === 'impossible' ? 1.4 : this.level === 'hard' ? 1.1 : 0.8);
        this.host.rumble(0.35 + this.strain * 0.4, 60);
        if (this.strain >= 1) {
          this.host.sound('lockBreak');
          this.host.rumble(1, 220);
          this.host.breakPick();
          this.strain = 0;
          this.turn = 0;
          this.snapT = SNAP_TIME;
          this.mouseHeld = false;
          const left = this.host.picks();
          this.out = left !== null && left <= 0;
          this.render();
          return;
        }
      }
    } else {
      this.turn = Math.max(0, this.turn - dt * 3);
      this.strain = Math.max(0, this.strain - dt * 0.6);
    }
    this.render();
  }

  /** The pixel-art lock (Update 125): drawn small on a canvas and scaled up with crisp pixels. */
  private readonly canvas = document.createElement('canvas');
  private built = false;

  private render(): void {
    const picks = this.host.picks(), color = LOCK_COLORS[this.level];
    if (!this.built) {
      this.built = true;
      this.canvas.width = W; this.canvas.height = H;
      this.canvas.className = 'lp-canvas';
      this.root.innerHTML = `<div class="lp-box" style="--lock:${color}">
        <div class="lp-head"><span class="menu-title">Locked</span><span class="lp-level"></span></div>
        <div class="lp-stage"></div>
        <p class="lp-status"></p>
        <div class="menu-note">← → (or the mouse) move the pick · hold Space / A (or click) to turn · Esc: give up</div>
      </div>`;
      this.root.querySelector('.lp-stage')!.appendChild(this.canvas);
    }
    const box = this.root.querySelector<HTMLElement>('.lp-box')!;
    box.style.setProperty('--lock', color);
    const lv = this.root.querySelector<HTMLElement>('.lp-level')!;
    lv.textContent = LOCK_NAMES[this.level]; lv.style.color = color; lv.style.borderColor = color;
    this.root.querySelector<HTMLElement>('.lp-status')!.textContent = this.closing > 0 ? 'Unlocked!' : this.snapT > 0 ? 'The pick snapped!' : picks === null ? '' : `Lockpicks: ${picks}`;
    this.draw();
  }

  /** Where the dial's hub sits on the little canvas. */
  private draw(): void {
    const g = this.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const shake = this.strain > 0 ? Math.round((Math.random() - 0.5) * this.strain * 3) : 0;
    const cx = W / 2 + shake, cy = 52;
    const px = (x: number, y: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), 1, 1); };
    const disc = (r: number, c: string) => { g.fillStyle = c; for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); g.fillRect(cx - w, cy + y, w * 2 + 1, 1); } };
    const line = (x0: number, y0: number, x1: number, y1: number, c: string, t = 1) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; g.fillStyle = c; g.fillRect(Math.round(x - (t - 1) / 2), Math.round(y - (t - 1) / 2), t, t); }
    };
    g.clearRect(0, 0, W, H);
    // The stepped half-circle track the pick swings round.
    for (let a = -90; a <= 90; a += 6) {
      const r = (a * Math.PI) / 180, x = cx + Math.sin(r) * 40, y = cy - Math.cos(r) * 40;
      px(x, y, a % 30 === 0 ? '#8a7a5a' : '#4a4032');
    }
    // The lock: a brass plate with a darker rim, the turning cylinder and its keyhole.
    disc(30, '#3a2a14'); disc(29, '#b8862e'); disc(26, '#e0b04a'); disc(25, '#c8963a');
    for (let k = 0; k < 8; k++) { const r = (k / 8) * Math.PI * 2, x = cx + Math.cos(r) * 27.5, y = cy + Math.sin(r) * 27.5; px(x, y, '#6a4a1a'); px(x + 1, y, '#ffe08a'); }
    const turn = (this.turn * Math.PI) / 2;
    disc(14, '#5a4020'); disc(13, '#9a7034');
    // Keyhole, turned with the cylinder.
    const kx = Math.sin(turn), ky = -Math.cos(turn);
    line(cx - kx * 6, cy - ky * 6, cx + kx * 2, cy + ky * 2, '#1a1008', 3);
    line(cx + kx * 2, cy + ky * 2, cx + kx * 7, cy + ky * 7, '#1a1008', 2);
    // The tension wrench, from the keyhole down and out to the side, turning with the cylinder.
    const wx = Math.sin(turn + Math.PI * 0.85), wy = -Math.cos(turn + Math.PI * 0.85);
    line(cx + kx * 5, cy + ky * 5, cx + kx * 5 + wx * 20, cy + ky * 5 + wy * 20, '#6a6e7a', 2);
    // The pick: steel with a wooden grip; it reddens as it strains, and flies apart when it snaps.
    const pa = ((this.angle + shake * 0.6) * Math.PI) / 180, sx = Math.sin(pa), sy = -Math.cos(pa);
    if (this.snapT > 0) {
      const f = 1 - this.snapT / SNAP_TIME;
      line(cx + sx * 4, cy + sy * 4, cx + sx * (14 + f * 4), cy + sy * (14 + f * 4) + f * 6, '#c8ccd8');
      line(cx + sx * (20 + f * 8), cy + sy * (20 + f * 8) + f * 10, cx + sx * (34 + f * 8), cy + sy * (34 + f * 8) + f * 12, '#c8ccd8');
      for (let k = 0; k < 5; k++) px(cx + sx * 17 + (k - 2) * 3 * f, cy + sy * 17 - k * f * 2, '#ffe9a0');
    } else {
      const steel = this.strain > 0.6 ? '#ffb07a' : this.strain > 0.3 ? '#ffd8b8' : '#e8ecf4';
      line(cx + sx * 4, cy + sy * 4, cx + sx * 34, cy + sy * 34, steel);
      line(cx + sx * 34, cy + sy * 34, cx + sx * 37 + sy * 2, cy + sy * 37 - sx * 2, steel);
      line(cx + sx * 34, cy + sy * 34, cx + sx * 46, cy + sy * 46, '#a06a34', 2);
    }
    if (this.closing > 0) disc(3, '#fff4c0');
  }
}
