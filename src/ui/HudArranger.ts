/**
 * Settings → HUD → Arrange: move and resize the HUD pieces (stats, stamina ring, each party card, time & ring,
 * mini-map, weapons, EXP bar, log, quest tracker, quick items).
 * Drag a piece with the mouse (wheel resizes it), or pick one with Q / E (LB / RB), move it with the arrows
 * (D-pad / stick) and press Enter (A) to step through sizes. Some pieces have a style too: the stats and the party
 * stack their bars side by side or on top of each other (Y / R), and can show faces (X / Shift); the adventure log
 * has a background box, a strip per line or none (Y / R). Esc (B) finishes. Saved per player.
 */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { HUD_DEFAULT_STACK, HUD_OPTIONS, HUD_WIDGETS, type HudLayout, type HudWidget } from './StatusBars';

const SIZES = [0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2];

export class HudArranger {
  private readonly panel = document.createElement('div');
  private open = false;
  private sel = 0;
  private layout: HudLayout = {};
  private widgets!: Record<HudWidget, HTMLElement>;
  private save: (l: HudLayout) => void = () => {};
  private onClose: () => void = () => {};
  private drag: { w: HudWidget; dx: number; dy: number } | null = null;
  private readonly cleanups: (() => void)[] = [];

  constructor(parent: HTMLElement, private readonly input: Input, private readonly apply: (l: HudLayout) => void) {
    this.panel.className = 'hud-arranger';
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Arrange the HUD');
    parent.appendChild(this.panel);
  }

  get isOpen(): boolean { return this.open; }

  show(widgets: Record<HudWidget, HTMLElement>, layout: HudLayout | undefined, save: (l: HudLayout) => void, onClose: () => void): void {
    this.widgets = widgets;
    this.layout = JSON.parse(JSON.stringify(layout ?? {})) as HudLayout;
    this.save = save; this.onClose = onClose;
    this.open = true; this.sel = 0;
    document.body.classList.add('hud-arranging');
    this.panel.hidden = false;
    for (const [k, name] of HUD_WIDGETS) {
      const el = widgets[k];
      el.classList.add('hud-arrange-on');
      el.dataset.hudName = name;
      const down = (e: PointerEvent) => this.startDrag(k, e);
      const wheel = (e: WheelEvent) => { e.preventDefault(); this.select(k); this.resize(e.deltaY < 0 ? 1 : -1); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('wheel', wheel, { passive: false });
      this.cleanups.push(() => { el.removeEventListener('pointerdown', down); el.removeEventListener('wheel', wheel); el.classList.remove('hud-arrange-on', 'hud-picked'); });
    }
    const move = (e: PointerEvent) => this.moveDrag(e);
    const up = () => { if (this.drag) { this.drag = null; this.commit(); } };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.cleanups.push(() => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); });
    this.render();
  }

  private close(): void {
    this.open = false;
    this.panel.hidden = true;
    document.body.classList.remove('hud-arranging');
    for (const c of this.cleanups.splice(0)) c();
    uiSound('menuBack');
    this.onClose();
  }

  private get current(): HudWidget { return HUD_WIDGETS[this.sel][0]; }

  private select(w: HudWidget): void { this.sel = HUD_WIDGETS.findIndex(([k]) => k === w); this.render(); }

  /** Pin a piece where it is now (by its centre), so it can be moved from there. */
  private pin(w: HudWidget): { x: number; y: number; scale?: number } {
    const l = (this.layout[w] ??= {});
    if (l.x === undefined || l.y === undefined) {
      const r = this.widgets[w].getBoundingClientRect();
      l.x = (r.left + r.width / 2) / innerWidth;
      l.y = (r.top + r.height / 2) / innerHeight;
    }
    return l as { x: number; y: number; scale?: number };
  }

  private startDrag(w: HudWidget, e: PointerEvent): void {
    e.preventDefault();
    this.select(w);
    const l = this.pin(w);
    this.drag = { w, dx: e.clientX - l.x * innerWidth, dy: e.clientY - l.y * innerHeight };
    this.commit();
  }

  private moveDrag(e: PointerEvent): void {
    if (!this.drag) return;
    const l = this.layout[this.drag.w]!;
    l.x = clamp01((e.clientX - this.drag.dx) / innerWidth);
    l.y = clamp01((e.clientY - this.drag.dy) / innerHeight);
    this.apply(this.layout);
  }

  private resize(dir: 1 | -1): void {
    const l = (this.layout[this.current] ??= {}), cur = l.scale ?? 1;
    const i = SIZES.reduce((best, s, k) => (Math.abs(s - cur) < Math.abs(SIZES[best] - cur) ? k : best), 0);
    l.scale = SIZES[Math.max(0, Math.min(SIZES.length - 1, i + dir))];
    if (l.scale === 1) delete l.scale;
    uiSound('menuMove');
    this.commit();
  }

  /** Step one of the piece's style options: stacking, faces, or the log's background. */
  private cycle(opt: 'stack' | 'face' | 'bg' | 'art'): void {
    const l = (this.layout[this.current] ??= {});
    if (opt === 'stack') {
      const now = l.stack ?? HUD_DEFAULT_STACK[this.current] ?? 'h', next = now === 'h' ? 'v' : 'h';
      if (next === HUD_DEFAULT_STACK[this.current]) delete l.stack; else l.stack = next;
    } else if (opt === 'face') { if (l.face) delete l.face; else l.face = true; }
    else if (opt === 'art') { if (l.art === false) delete l.art; else l.art = false; }
    else {
      const order = ['lines', 'box', 'none'] as const, next = order[(order.indexOf(l.bg ?? 'lines') + 1) % order.length];
      if (next === 'lines') delete l.bg; else l.bg = next;
    }
    uiSound('menuMove');
    this.commit();
  }

  private commit(): void {
    for (const k of Object.keys(this.layout) as HudWidget[]) if (!Object.keys(this.layout[k] ?? {}).length) delete this.layout[k];
    this.apply(this.layout);
    this.save(this.layout);
    this.render();
  }

  update(dt: number): void {
    if (!this.open) return;
    const i = this.input;
    if (i.consume('cancel')) { this.close(); return; }
    if (i.consume('tabNext')) { this.sel = (this.sel + 1) % HUD_WIDGETS.length; uiSound('menuMove'); this.render(); }
    if (i.consume('tabPrev')) { this.sel = (this.sel + HUD_WIDGETS.length - 1) % HUD_WIDGETS.length; uiSound('menuMove'); this.render(); }
    const opts = HUD_OPTIONS[this.current] ?? [];
    if (i.consume('switchWeapon') && opts.length) this.cycle(opts.includes('stack') ? 'stack' : opts.includes('art') ? 'art' : 'bg');
    if (i.consume('run') && opts.includes('face')) this.cycle('face');
    if (i.confirm()) {
      // Step up through the sizes, wrapping back to the smallest.
      const l = this.layout[this.current], cur = l?.scale ?? 1;
      if (cur >= SIZES[SIZES.length - 1] - 0.01) { (this.layout[this.current] ??= {}).scale = SIZES[0]; uiSound('menuMove'); this.commit(); } else this.resize(1);
    }
    // Held directions move the piece smoothly.
    const dx = (i.isHeld('right') ? 1 : 0) - (i.isHeld('left') ? 1 : 0), dy = (i.isHeld('down') ? 1 : 0) - (i.isHeld('up') ? 1 : 0);
    for (const a of ['up', 'down', 'left', 'right'] as const) i.consume(a);
    if (dx || dy) {
      const l = this.pin(this.current);
      l.x = clamp01(l.x + dx * dt * 0.35);
      l.y = clamp01(l.y + dy * dt * 0.35);
      this.apply(this.layout);
      this.dirty = true;
    } else if (this.dirty) { this.dirty = false; this.commit(); }
  }
  private dirty = false;

  private render(): void {
    for (const [k] of HUD_WIDGETS) this.widgets[k].classList.toggle('hud-picked', k === this.current);
    const name = HUD_WIDGETS[this.sel][1], l = this.layout[this.current], scale = l?.scale ?? 1;
    const opts = HUD_OPTIONS[this.current] ?? [];
    const stack = l?.stack ?? HUD_DEFAULT_STACK[this.current] ?? 'h';
    const optRow = opts.length ? `<div class="ha-row ha-opts">${[
      opts.includes('stack') ? `<button type="button" data-a="stack">Bars: ${stack === 'v' ? 'stacked ↕' : 'side by side ↔'} <kbd>${this.input.label('switchWeapon')}</kbd></button>` : '',
      opts.includes('face') ? `<button type="button" data-a="face">Faces: ${l?.face ? 'shown' : 'hidden'} <kbd>X / Shift</kbd></button>` : '',
      opts.includes('art') ? `<button type="button" data-a="art">Season picture: ${l?.art === false ? 'off' : 'on'} <kbd>${this.input.label('switchWeapon')}</kbd></button>` : '',
      opts.includes('bg') ? `<button type="button" data-a="bg">Background: ${{ lines: 'behind each line', box: 'one box', none: 'none' }[l?.bg ?? 'lines']} <kbd>${this.input.label('switchWeapon')}</kbd></button>` : '',
    ].join('')}</div>` : '';
    this.panel.innerHTML = `<h2>Arrange the HUD</h2>
      <p>Drag a piece with the mouse (the wheel resizes it). Or pick one with <b>${this.input.label('tabPrev')} / ${this.input.label('tabNext')}</b>, move it with the arrows (D-pad or stick), and press <b>${this.input.label('ok')}</b> to change its size.</p>
      <div class="ha-sel">Selected: <b>${name}</b> · size ${Math.round(scale * 100)}%</div>
      <div class="ha-row">
        <button type="button" data-a="smaller">Smaller</button><button type="button" data-a="bigger">Bigger</button>
        <button type="button" data-a="reset">Put this one back</button><button type="button" data-a="resetAll">Reset everything</button>
        <button type="button" class="primary" data-a="done">Done</button>
      </div>${optRow}`;
    this.panel.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => b.addEventListener('click', () => {
      (document.activeElement as HTMLElement | null)?.blur?.();
      const a = b.dataset.a;
      if (a === 'smaller') this.resize(-1);
      else if (a === 'bigger') this.resize(1);
      else if (a === 'reset') { delete this.layout[this.current]; this.commit(); }
      else if (a === 'resetAll') { this.layout = {}; this.commit(); }
      else if (a === 'stack' || a === 'face' || a === 'bg' || a === 'art') this.cycle(a);
      else this.close();
    }));
  }
}

const clamp01 = (v: number) => Math.min(0.98, Math.max(0.02, v));
