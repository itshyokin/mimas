/** Developer panel: time of day, effect toggles, live switches/variables and performance stats. */
import type { LightCounts } from '../shared/lightBudget';
import { MAX_HOUR, MIN_HOUR } from '../world/TimeOfDay';
import { BudgetMeter } from './BudgetMeter';

export interface DebugHooks {
  setHour(h: number, instant: boolean): void;
  setNormalMaps(on: boolean): void;
  setSunShadows(on: boolean): void;
  setFireShadows(on: boolean): void;
  setBloom(on: boolean): void;
  setTiltShift(on: boolean): void;
  /** Test buttons: take damage, use stamina, refill everything. */
  hurt(): void;
  tire(): void;
  refill(): void;
  /** Test a season (null: back to the day's). */
  setSeason?(s: 'spring' | 'summer' | 'autumn' | 'winter' | null): void;
  /** Open the developer console (for touch screens with no ` key). */
  console?(): void;
}

const TOGGLES: [string, string, keyof DebugHooks][] = [
  ['dbgNormals', 'Normal maps', 'setNormalMaps'],
  ['dbgBloom', 'Bloom', 'setBloom'],
  ['dbgSun', 'Sun shadows', 'setSunShadows'],
  ['dbgTilt', 'Tilt-shift', 'setTiltShift'],
  ['dbgFire', 'Light shadows', 'setFireShadows'],
];

export class DebugPanel {
  private readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly slider: HTMLInputElement;
  private readonly timeOut: HTMLOutputElement;
  private readonly stateEl: HTMLElement;
  private readonly abilitiesEl: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly callsEl: HTMLElement;
  private readonly meter = new BudgetMeter(false);
  private dragging = false;
  private frames = 0;
  private elapsed = 0;

  constructor(parent: HTMLElement, mapName: string, hooks: DebugHooks) {
    this.root = document.createElement('aside');
    this.root.className = 'panel';
    this.root.innerHTML = `
      <header class="panel-head">
        <div><div class="eyebrow" id="dbgMap">Playtest · ${escapeHtml(mapName)}</div><h1>Mimas</h1></div>
        <button class="ghost" id="dbgCollapse" type="button" aria-expanded="true" aria-controls="dbgBody">Hide</button>
      </header>
      <div id="dbgBody" class="panel-body">
        <section class="group">
          <div class="row"><label class="label" for="dbgTime">Time of day</label><output id="dbgTimeOut"></output></div>
          <input type="range" id="dbgTime" min="${MIN_HOUR}" max="${MAX_HOUR}" step="0.05">
          <div class="presets">
            <button class="chip" type="button" data-h="5.6">Dawn</button>
            <button class="chip" type="button" data-h="8">Morning</button>
            <button class="chip" type="button" data-h="12">Noon</button>
            <button class="chip" type="button" data-h="17.5">Golden</button>
            <button class="chip" type="button" data-h="19.4">Dusk</button>
            <button class="chip" type="button" data-h="22.5">Night</button>
            <button class="chip" type="button" data-h="0">Midnight</button>
          </div>
          <div class="presets" style="margin-top:6px" aria-label="Season">
            <button class="chip" type="button" data-season="">Day's season</button>
            <button class="chip" type="button" data-season="spring">Spring</button>
            <button class="chip" type="button" data-season="summer">Summer</button>
            <button class="chip" type="button" data-season="autumn">Autumn</button>
            <button class="chip" type="button" data-season="winter">Winter</button>
          </div>
        </section>
        <section class="group">
          <div class="label">Effects</div>
          <div class="toggles">${TOGGLES.map(([id, label]) => `<label class="switch"><input type="checkbox" id="${id}" checked>${label}</label>`).join('')}</div>
        </section>
        <section class="group">
          <div class="label">Controls</div>
          <div class="controls-help">Move <kbd>WASD</kbd> · Run <kbd>Shift</kbd> · Jump <kbd>Space</kbd> · Talk <kbd>Enter</kbd><br>Melee <kbd>1</kbd> · Bow <kbd>2</kbd> (hold) · Magic <kbd>3</kbd> · Switch sword / bow <kbd>R</kbd> · Spell <kbd>F</kbd><br>Lock on / next <kbd>Tab</kbd> (snipe a foe with the bow to start a battle with the first turns) · Release <kbd>Q</kbd> · Sneak <kbd>C</kbd><br>Xbox: LT attack · X sprint (hold) · A talk / jump · Y switch sword / bow · B spell · RB / LB target · D-pad ↓ release · R-stick click sneak<br>All of them can be changed in Settings → Controls.</div>
          <div class="abilities" id="dbgAbilities"></div>
          <div class="presets" style="margin-top:8px">
            <button class="chip" type="button" id="dbgHurt">−25 HP</button>
            <button class="chip" type="button" id="dbgTire">Empty stamina</button>
            <button class="chip" type="button" id="dbgRefill">Refill</button>
            <button class="chip" type="button" id="dbgConsole" title="Developer console (\` key)">Console</button>
          </div>
        </section>
        <section class="group">
          <div class="label">Switches &amp; variables</div>
          <div class="state" id="dbgState"></div>
        </section>
        <div id="dbgBudget"></div>
        <footer class="stats"><span id="dbgFps">— fps</span><span id="dbgCalls">— draw calls</span></footer>
      </div>`;
    parent.appendChild(this.root);
    const q = <T extends HTMLElement>(id: string) => this.root.querySelector<T>('#' + id)!;
    this.body = q('dbgBody');
    this.slider = q<HTMLInputElement>('dbgTime');
    this.timeOut = q<HTMLOutputElement>('dbgTimeOut');
    this.stateEl = q('dbgState');
    this.abilitiesEl = q('dbgAbilities');
    this.fpsEl = q('dbgFps');
    this.callsEl = q('dbgCalls');
    q('dbgBudget').replaceWith(this.meter.el);

    this.slider.addEventListener('pointerdown', () => (this.dragging = true));
    window.addEventListener('pointerup', () => (this.dragging = false));
    this.slider.addEventListener('input', () => hooks.setHour(parseFloat(this.slider.value), true));
    this.root.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) => b.addEventListener('click', () => hooks.setHour(parseFloat(b.dataset.h!), false)));
    for (const [id, , hook] of TOGGLES) {
      const el = q<HTMLInputElement>(id);
      el.addEventListener('change', () => (hooks[hook] as (on: boolean) => void)(el.checked));
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-season]').forEach((b) => b.addEventListener('click', () => hooks.setSeason?.((b.dataset.season || null) as 'spring' | null)));
    q('dbgHurt').addEventListener('click', () => hooks.hurt());
    q('dbgTire').addEventListener('click', () => hooks.tire());
    q('dbgRefill').addEventListener('click', () => hooks.refill());
    q('dbgConsole').addEventListener('click', () => hooks.console?.());
    const collapse = q<HTMLButtonElement>('dbgCollapse');
    const setCollapsed = (c: boolean) => {
      this.body.hidden = c;
      collapse.textContent = c ? 'Show' : 'Hide';
      collapse.setAttribute('aria-expanded', String(!c));
    };
    collapse.addEventListener('click', () => setCollapsed(!this.body.hidden));
    // Starts minimised (just its title bar); Show opens it.
    setCollapsed(true);
    this.makeDraggable();
  }

  /** Drag the panel by its title bar, anywhere on screen (so it never covers HUD pieces); remembered in this browser. */
  private makeDraggable(): void {
    const head = this.root.querySelector<HTMLElement>('.panel-head')!, KEY = 'hd2d.debugPanelPos';
    head.style.cursor = 'grab';
    head.style.touchAction = 'none';
    head.title = 'Drag to move';
    const place = (x: number, y: number) => {
      const r = this.root.getBoundingClientRect();
      const nx = Math.max(0, Math.min(innerWidth - Math.min(r.width, 80), x)), ny = Math.max(0, Math.min(innerHeight - 40, y));
      this.root.style.left = `${nx}px`; this.root.style.top = `${ny}px`;
      this.root.style.right = 'auto'; this.root.style.bottom = 'auto';
      return { x: nx, y: ny };
    };
    try { const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (saved && typeof saved.x === 'number') place(saved.x, saved.y); } catch { /* no storage: default spot */ }
    let drag: { dx: number; dy: number; id: number } | null = null;
    head.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const r = this.root.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      head.setPointerCapture(e.pointerId);
      head.style.cursor = 'grabbing';
      e.preventDefault();
    });
    head.addEventListener('pointermove', (e) => { if (drag && e.pointerId === drag.id) place(e.clientX - drag.dx, e.clientY - drag.dy); });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      head.style.cursor = 'grab';
      const r = this.root.getBoundingClientRect();
      try { localStorage.setItem(KEY, JSON.stringify({ x: r.left, y: r.top })); } catch { /* not kept */ }
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
    addEventListener('resize', () => { const r = this.root.getBoundingClientRect(); if (this.root.style.left) place(r.left, r.top); });
  }

  setMap(name: string): void {
    const el = this.root.querySelector('#dbgMap');
    if (el) el.textContent = `Playtest · ${name}`;
  }

  setLights(c: LightCounts): void {
    this.meter.setCounts(c);
  }

  /** Show or hide the whole panel (the console's debug_menu command). */
  setVisible(on: boolean): void { this.root.hidden = !on; }
  get visible(): boolean { return !this.root.hidden; }

  update(dt: number, hour: number, timeLabel: string, drawCalls: number, state: { switches: Record<string, boolean>; variables: Record<string, number>; abilities?: Record<string, boolean> }): void {
    if (!this.dragging) this.slider.value = String(hour);
    this.timeOut.value = timeLabel;
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.fpsEl.textContent = `${Math.round(this.frames / this.elapsed)} fps`;
      this.meter.setFps(this.frames / this.elapsed);
      this.callsEl.textContent = `${drawCalls} draw calls`;
      this.frames = 0;
      this.elapsed = 0;
      const rows = [
        ...Object.entries(state.switches).map(([k, v]) => `<span class="k">${escapeHtml(k)}</span><span class="v ${v ? 'on' : 'off'}">${v ? 'ON' : 'OFF'}</span>`),
        ...Object.entries(state.variables).map(([k, v]) => `<span class="k">${escapeHtml(k)}</span><span class="v">${v}</span>`),
      ];
      this.abilitiesEl.innerHTML = Object.entries(state.abilities ?? {}).map(([k, v]) => `<span class="ability ${v ? 'on' : 'off'}">${escapeHtml(k)}</span>`).join('');
      this.stateEl.innerHTML = rows.length ? rows.join('') : '<span class="empty">None set yet. Talk to someone.</span>';
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
