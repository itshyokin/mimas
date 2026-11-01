/**
 * Keyboard and controller input with "held" and "just pressed" states, mapped to game actions.
 *
 * Bindings belong to the player (Settings → Controls) and can be changed. Menus always also answer to the
 * arrow keys, Enter and Escape, and on a controller to the D-pad / left stick, A (confirm), B (back), X / Y
 * (screen extras) and LB / RB (switch tabs), whatever the field bindings are. Pointer / touch input is handled by the Game.
 */
export type Action = 'up' | 'down' | 'left' | 'right' | 'ok' | 'cancel' | 'run' | 'jump' | 'ring'
  | 'melee' | 'bow' | 'magic' | 'attack' | 'switchWeapon' | 'lock' | 'target' | 'targetPrev' | 'sneak'
  /** Quick items and key items (assigned in the bag): left, up, right, down. */
  | 'quick1' | 'quick2' | 'quick3' | 'quick4'
  /** Menus only: switch tabs (the pause menu's: LB / RB, Q / E), and the tabs inside one (LT / RT, Z / C). */
  | 'tabPrev' | 'tabNext' | 'subPrev' | 'subNext'
  /** Update 141: START Settings, X the Party menu (with the Journal), B the Backpack, Y the World Map. */
  | 'settings' | 'party' | 'backpack' | 'worldmap';

/** Actions the player can rebind, in the order the Controls screen lists them. */
export const BINDABLE: [Action, string][] = [
  ['up', 'Move up'], ['down', 'Move down'], ['left', 'Move left'], ['right', 'Move right'],
  ['run', 'Run'], ['jump', 'Jump'], ['ok', 'Talk / interact'],
  // (No sword or bow on the map since Update 132, and no spells cast on it: key items go on the quick slots.)
  ['target', 'Lock on / next target'], ['targetPrev', 'Previous target'], ['lock', 'Release target'],
  ['sneak', 'Sneak / crouch'],
  ['quick1', 'Quick slot ← (left)'], ['quick2', 'Quick slot ↑ (up)'], ['quick3', 'Quick slot → (right)'], ['quick4', 'Quick slot ↓ (down)'],
  ['settings', 'Settings (save, load, quit)'], ['party', 'Party and Journal'], ['backpack', 'Backpack (items)'], ['worldmap', 'World map'],
  ['cancel', 'Back (in menus)'],
];

export interface Bindings {
  /** Keyboard codes per action (KeyboardEvent.code). */
  keys: Partial<Record<Action, string[]>>;
  /** Controller buttons per action (standard mapping indices). */
  pad: Partial<Record<Action, number[]>>;
}

export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    ok: ['Enter', 'NumpadEnter'], jump: ['Space'], cancel: ['KeyX'], run: ['ShiftLeft', 'ShiftRight'],
    melee: [], bow: [], magic: [], ring: [],
    settings: ['Escape'], party: ['KeyP'], backpack: ['KeyI', 'KeyB'], worldmap: ['KeyM'],
    attack: [], switchWeapon: ['KeyR'],
    target: ['Tab'], lock: ['KeyQ'], targetPrev: [],
    // Sneak is on C (Ctrl would make Ctrl+W close the browser tab).
    sneak: ['KeyC'],
    quick1: ['Digit5', 'Numpad5'], quick2: ['Digit6', 'Numpad6'], quick3: ['Digit7', 'Numpad7'], quick4: ['Digit8', 'Numpad8'],
  },
  pad: {
    // Update 141: A talks (when facing someone) or jumps; B the Backpack; X the Party menu; Y the World Map;
    // START Settings. RB / LB lock on and cycle targets either way, the left stick (pressed) lets go; the right
    // stick crouches.
    ok: [0], jump: [0], backpack: [1], party: [2], worldmap: [3], settings: [9],
    targetPrev: [4], target: [5],
    sneak: [11], lock: [10],
    // The D-pad: the four quick slots (items and key items: left, up, right, down).
    quick1: [14], quick2: [12], quick3: [15], quick4: [13],
  },
};

/** Keys menus always understand. */
const MENU_KEYS: Record<string, Action> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'cancel', Backspace: 'cancel',
  PageUp: 'tabPrev', PageDown: 'tabNext', KeyQ: 'tabPrev', KeyE: 'tabNext',
  KeyZ: 'subPrev', KeyC: 'subNext', BracketLeft: 'subPrev', BracketRight: 'subNext',
};
/** Controller buttons menus always understand. */
// X and Y give menus their extra buttons (Y deletes a save, swaps lists, rerolls; X cycles options).
const MENU_PAD: Record<number, Action> = { 0: 'ok', 1: 'cancel', 2: 'run', 3: 'switchWeapon', 9: 'cancel', 8: 'cancel', 12: 'up', 13: 'down', 14: 'left', 15: 'right', 4: 'tabPrev', 5: 'tabNext', 6: 'subPrev', 7: 'subNext' };
/**
 * Update 141: in menus the same buttons also say which menu they open, so each one closes what it opened (B the
 * Backpack, X the Party menu, Y the World Map, START Settings).
 */
const MENU_TOGGLES: Record<number, Action> = { 1: 'backpack', 2: 'party', 3: 'worldmap', 9: 'settings' };
/** Bumped when the default controller layout changes, so old saved layouts are replaced. */
export const BINDINGS_VERSION = 4;

export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'Left stick', 'Right stick', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Xbox'];

/** A short name for a key code: KeyW → W, Digit1 → 1, ArrowUp → ↑. */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const names: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab',
    ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt',
    Backspace: 'Backspace', CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };
  return names[code] ?? code;
}
export const padName = (b: number): string => PAD_NAMES[b] ?? `Button ${b}`;

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);
const STICK_DEAD = 0.3;

export class Input {
  private readonly held = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private readonly keysDown = new Set<string>();
  private keyMap = new Map<string, Action[]>();
  private bindings: Bindings = DEFAULT_BINDINGS;
  /** Run toggled on by the touch button or the controller's run button (Settings → Sprint: Toggle). */
  runLatched = false;
  /** The touch Run button is held down (Sprint: Hold). */
  touchRun = false;
  /** Sprint: press once to start and again to stop, on a controller and the touch button (else hold to sprint). */
  sprintToggle = false;
  /** 'menu' while a menu, message or screen has the keys; 'field' while playing. */
  mode: 'field' | 'menu' = 'menu';
  /** The left stick (or nothing), for walking at any angle. */
  readonly stick = { x: 0, y: 0 };
  /** The right stick (Update 154: turns the camera on 3D maps). */
  readonly rstick = { x: 0, y: 0 };
  /** How far the left stick is pushed (0 … 1). */
  get stickAmount(): number { return Math.min(1, Math.hypot(this.stick.x, this.stick.y)); }
  /** Which device was used last, so prompts can name the right button. */
  lastDevice: 'keyboard' | 'pad' = 'keyboard';
  private padPrev: boolean[] = [];
  private padHeld = new Set<Action>();
  private stickRepeat = { dir: '' as '' | Action, t: 0 };
  private capture: ((k: { key?: string; button?: number; cancel?: boolean }) => void) | null = null;

  constructor() {
    this.setBindings(DEFAULT_BINDINGS);
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t !== document.body && !this.capture && (FORM_TAGS.has(t.tagName) || t.isContentEditable)) {
        // A box being typed in (the debug panel's) keeps its keys; anything else that kept the focus after a click (a
        // menu button, a checkbox, a hidden field) lets go of it, so Enter, Space and the rest reach the game again.
        const type = (t as HTMLInputElement).type ?? '';
        const typing = (t.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'color', 'submit', 'reset', 'file'].includes(type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
        if (typing && t.offsetParent !== null) return;
        t.blur();
      }
      this.lastDevice = 'keyboard';
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture; this.capture = null;
        cb(e.code === 'Escape' ? { cancel: true } : { key: e.code });
        return;
      }
      const acts = this.actionsForKey(e.code);
      if (!acts.length) return;
      e.preventDefault();
      if (!this.keysDown.has(e.code)) for (const a of acts) this.pressed.add(a);
      this.keysDown.add(e.code);
      for (const a of acts) this.held.add(a);
    });
    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.rebuildHeld();
    });
    window.addEventListener('blur', () => { this.keysDown.clear(); this.held.clear(); });
  }

  /** Use the player's bindings (missing actions keep their defaults). */
  setBindings(b: Bindings): void {
    this.bindings = {
      keys: { ...DEFAULT_BINDINGS.keys, ...b.keys },
      pad: { ...DEFAULT_BINDINGS.pad, ...b.pad },
    };
    this.keyMap = new Map();
    for (const [a, codes] of Object.entries(this.bindings.keys) as [Action, string[]][])
      for (const c of codes ?? []) this.keyMap.set(c, [...(this.keyMap.get(c) ?? []), a]);
  }

  get current(): Bindings { return this.bindings; }

  private actionsForKey(code: string): Action[] {
    // Backspace does what Esc does (tablet keyboards often have no Esc), unless the player bound it to something.
    if (code === 'Backspace' && !this.keyMap.has('Backspace')) code = 'Escape';
    const out = [...(this.keyMap.get(code) ?? [])];
    if (this.mode === 'menu') { const m = MENU_KEYS[code]; if (m && !out.includes(m)) out.push(m); }
    return out;
  }

  /** Forget every key and button held (after the console had the keyboard). */
  releaseAll(): void { this.keysDown.clear(); this.padHeld.clear(); this.held.clear(); this.pressed.clear(); }

  private rebuildHeld(): void {
    this.held.clear();
    for (const c of this.keysDown) for (const a of this.actionsForKey(c)) this.held.add(a);
    for (const a of this.padHeld) this.held.add(a);
  }

  /** The next key or button pressed goes to `cb` instead of the game (Esc cancels). Used by the Controls screen. */
  captureNext(cb: (k: { key?: string; button?: number; cancel?: boolean }) => void): void { this.capture = cb; }
  get capturing(): boolean { return !!this.capture; }

  /**
   * Read the first connected controller. Call once at the start of every frame.
   * Buttons fire their actions; the left stick moves (and steps through menus).
   */
  pollGamepad(dt: number): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find((p) => p && p.connected);
    this.padHeld.clear();
    this.stick.x = 0; this.stick.y = 0;
    this.rstick.x = 0; this.rstick.y = 0;
    if (!pad) { this.padPrev = []; this.rebuildHeld(); return; }
    const down = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    if (down.some(Boolean) || Math.hypot(pad.axes[0] ?? 0, pad.axes[1] ?? 0) > 0.5) this.lastDevice = 'pad';
    // Rebinding: the first newly pressed button.
    if (this.capture) {
      const b = down.findIndex((d, i) => d && !this.padPrev[i]);
      if (b >= 0) { const cb = this.capture; this.capture = null; cb({ button: b }); }
      this.padPrev = down;
      return;
    }
    const actions = (b: number): Action[] => {
      const out: Action[] = [];
      if (this.mode === 'menu') { const m = MENU_PAD[b]; if (m) out.push(m); const t = MENU_TOGGLES[b]; if (t) out.push(t); return out; }
      for (const [a, list] of Object.entries(this.bindings.pad) as [Action, number[]][]) if (list?.includes(b)) out.push(a);
      return out;
    };
    down.forEach((d, i) => {
      if (!d) return;
      const acts = actions(i);
      for (const a of acts) {
        this.padHeld.add(a);
        if (!this.padPrev[i]) {
          // The controller's run button toggles running (a stick is hard to hold a button with).
          if (a === 'run' && this.mode === 'field' && this.sprintToggle) this.runLatched = !this.runLatched;
          else this.pressed.add(a);
        }
      }
    });
    this.padPrev = down;
    { const rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0; if (Math.hypot(rx, ry) > STICK_DEAD) { this.rstick.x = rx; this.rstick.y = ry; } }
    // Left stick: walking direction in the field; steps through menus (with repeat).
    const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0, mag = Math.hypot(x, y);
    if (mag > STICK_DEAD) {
      this.stick.x = x; this.stick.y = y;
      const dir: Action = Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down';
      if (this.mode === 'menu' && mag > 0.6) {
        if (this.stickRepeat.dir !== dir) { this.stickRepeat = { dir, t: 0.4 }; this.pressed.add(dir); }
        else { this.stickRepeat.t -= dt; if (this.stickRepeat.t <= 0) { this.stickRepeat.t = 0.12; this.pressed.add(dir); } }
      }
      this.padHeld.add(dir);
    } else this.stickRepeat.dir = '';
    this.rebuildHeld();
  }

  /** Shake the controller (Update 119: lockpicking), if it can; strength 0 … 1. */
  rumble(strength: number, ms: number): void {
    try {
      const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = [...pads].find((p) => p && p.connected) as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | undefined;
      const s = Math.max(0, Math.min(1, strength));
      void pad?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: s * 0.7, weakMagnitude: s })?.catch(() => {});
    } catch { /* no rumble here */ }
  }

  isHeld(a: Action): boolean {
    return this.held.has(a);
  }

  /** True once per key press; consuming it stops later systems seeing the same press. */
  consume(a: Action): boolean {
    return this.pressed.delete(a);
  }
  /** Pressed this frame, without using it up (Update 155). */
  peek(a: Action): boolean { return this.pressed.has(a); }

  /** Confirm in menus and messages: Enter, Space or A. */
  confirm(): boolean {
    const a = this.pressed.delete('ok'), b = this.pressed.delete('jump');
    return a || b;
  }

  /** Simulate a press (used by taps on the message window). */
  press(a: Action): void {
    this.pressed.add(a);
  }

  /** The name of what's bound to an action on the device used last (for prompts like "press 4"). */
  /** The field action on a controller button (by its standard index), if any (D-pad ↓ is 13). */
  padAction(button: number): Action | undefined {
    return (Object.entries(this.bindings.pad) as [Action, number[]][]).find(([, list]) => list?.includes(button))?.[0];
  }

  label(a: Action): string {
    if (this.lastDevice === 'pad') {
      const b = this.bindings.pad[a]?.[0] ?? Number(Object.keys(MENU_PAD).find((n) => MENU_PAD[Number(n)] === a) ?? NaN);
      if (!Number.isNaN(b)) return padName(b);
    }
    // Menu-only actions (tabs) have fixed keys.
    const k = this.bindings.keys[a]?.[0] ?? ({ tabPrev: 'KeyQ', tabNext: 'KeyE', subPrev: 'KeyZ', subNext: 'KeyC' } as Partial<Record<Action, string>>)[a];
    return k ? keyName(k) : '—';
  }

  /** Call at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
  }
}
