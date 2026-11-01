/**
 * Player settings (the title's Options and the pause menu's Settings): picture, sound and controls.
 * They belong to the player, not to a save: kept in the browser per game, and loading a save never
 * changes them.
 */
import { BINDINGS_VERSION, type Bindings } from './Input';
import type { HudLayout } from '../ui/StatusBars';

/** Text boxes: above or below whoever is talking, or fixed at the top, bottom or centre of the screen. */
export type TextBoxPlace = 'above' | 'below' | 'top' | 'bottom' | 'center';

/** Picture quality: how sharp the picture is drawn and how often shadows are redrawn (auto: by the device). */
/** potato: the lightest the map can be drawn (lower resolution, no shadows, glow, depth of field, swaying or drifting clouds). */
export type Quality = 'auto' | 'high' | 'balanced' | 'performance' | 'potato';

export interface Settings {
  quality: Quality;
  /** Show frames per second in a corner. */
  showFps: boolean;
  bloom: boolean;
  depthOfField: boolean;
  shadows: boolean;
  /** Soft shading in corners (SSAO); only on High / Balanced quality. */
  ambientOcclusion: boolean;
  lightShadows: boolean;
  detailedLighting: boolean;
  /** Cloud shadows drifting over the ground. */
  cloudShadows: boolean;
  /** Tutorial pop-ups (they're kept in the Journal either way). */
  tutorials?: boolean;
  /** Window touches over the theme: see-through-ness (30 – 100), colour, main text colour, frame colour ('' : the theme's / the game's). */
  windowOpacity: number;
  windowColor: string;
  windowText: string;
  windowAccent: string;
  /** Brightness multiplier, 0.6 – 1.4. */
  brightness: number;
  /** 0 – 100. Everything at once (the others are mixed under it). */
  masterVolume: number;
  musicVolume: number;
  /** Menus and message text. */
  uiVolume: number;
  /** Fanfares and chimes: victory, level up, quests. */
  jingleVolume: number;
  soundVolume: number;
  ambienceVolume: number;
  /** Keyboard and controller bindings the player changed (the rest use the defaults). */
  bindings?: Bindings;
  /** Which default controller layout `bindings` was made with (older layouts are replaced). */
  bindingsVersion?: number;
  /** Sneak while the button is held (like Halo's crouch), or press once to toggle. */
  crouch: 'hold' | 'toggle';
  /** Sprint while the run button is held (default), or press once to start and again to stop (controller and touch). */
  sprint: 'hold' | 'toggle';
  /** On a controller, pushing the stick all the way runs. */
  stickRun: boolean;
  /** Temperatures in °F (default) or °C. */
  tempUnit?: 'F' | 'C';
  /** Tap or click the ground to walk there (off by default; tablets still have the on-screen stick). */
  tapToWalk?: boolean;
  /** Where the HUD pieces are and how big (Settings → HUD → Arrange). */
  hud?: HudLayout;
  /** Where text boxes appear. */
  textBox: TextBoxPlace;
  /** Window theme ('' or unset: the game's own, from the Database). */
  uiTheme?: string;
  /** The game's own lettering, or an easy-to-read one (players who find pixel text hard to read). */
  easyText?: boolean;
  /** A soft tick as message letters appear (off: silent typing). */
  textTicks?: boolean;
  textSpeed: 'slow' | 'normal' | 'fast' | 'instant';
  alwaysRun: boolean;
  /** Show the clock as 6:30 PM instead of 18:30. */
  clock12: boolean;
  /** Footstep sounds for the hero. */
  footsteps: boolean;
  /** What the adventure log shows on screen (its history in the pause menu always has everything). */
  adventureLog: 'all' | 'noCombat' | 'off';
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto', showFps: false, bloom: true, depthOfField: true, shadows: true, ambientOcclusion: true, lightShadows: true, detailedLighting: true, cloudShadows: true, windowOpacity: 100, windowColor: '', windowText: '', windowAccent: '',
  brightness: 1, masterVolume: 50, uiVolume: 70, jingleVolume: 80, musicVolume: 70, soundVolume: 80, ambienceVolume: 70, textSpeed: 'normal', alwaysRun: false, clock12: false, crouch: 'toggle', sprint: 'hold', stickRun: true, textBox: 'above', adventureLog: 'all', footsteps: true,
};

export const TEXT_SPEEDS: Record<Settings['textSpeed'], number> = { slow: 25, normal: 45, fast: 90, instant: Infinity };

export class SettingsStore {
  private readonly key: string;

  constructor(gameTitle: string, playtest: boolean) {
    const id = gameTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'game';
    this.key = `hd2d:${playtest ? 'playtest:' : ''}${id}:settings`;
  }

  /**
   * The game's own defaults (public/data/settings.json: a settings file exported from the game), used by a player
   * who hasn't changed anything yet, and by Restore defaults.
   */
  projectDefaults: Settings | null = null;

  /** The defaults for this game: its settings.json if it has one, else the engine's. */
  defaults(): Settings { return this.projectDefaults ? normalizeSettings(JSON.parse(JSON.stringify(this.projectDefaults))) : { ...DEFAULT_SETTINGS }; }

  load(): Settings {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? normalizeSettings(JSON.parse(raw)) : this.defaults();
    } catch { return this.defaults(); }
  }

  save(s: Settings): void {
    try { localStorage.setItem(this.key, JSON.stringify(s)); } catch { /* settings just won't stick */ }
  }
}

/** Fill in defaults, keep only known settings, and replace a controller layout made for an older default layout. */
export function normalizeSettings(raw: unknown): Settings {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s: Settings = { ...DEFAULT_SETTINGS };
  const out = s as unknown as Record<string, unknown>;
  // The settings with no default (unset means the game's own choice) are kept too: the window theme was being lost.
  for (const k of [...Object.keys(DEFAULT_SETTINGS), 'bindings', 'bindingsVersion', 'hud', 'uiTheme', 'tempUnit', 'tapToWalk', 'easyText', 'textTicks']) if (src[k] !== undefined) out[k] = src[k];
  // The default controller layout changed: a layout saved with an older one is replaced (keys are kept).
  if (s.bindings && (s.bindingsVersion ?? 1) < BINDINGS_VERSION) { s.bindings = { keys: s.bindings.keys ?? {}, pad: {} }; s.bindingsVersion = BINDINGS_VERSION; }
  return s;
}

const FILE_KIND = 'hd2d-settings';

/** A game's default settings file (data/settings.json, exported from Settings): its settings, or null. */
export async function loadProjectSettings(): Promise<Settings | null> {
  try {
    const res = await fetch('data/settings.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { kind?: string; settings?: unknown };
    const raw = data?.kind === FILE_KIND ? data.settings : data;
    return raw && typeof raw === 'object' ? normalizeSettings(raw) : null;
  } catch { return null; }
}

/** Download the settings as a small .json file (HUD layout, controls, picture, sound, gameplay). */
export function exportSettings(s: Settings, gameTitle: string): void {
  const data = { kind: FILE_KIND, version: 1, game: gameTitle, saved: new Date().toISOString(), settings: s };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${gameTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'game'}-settings.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Ask for a settings file and read it. Resolves with the settings, null if the player closed the picker, or throws
 * with a message to show. Browsers only open the file picker right after a key press or click, so a controller
 * button can't open it (`needsClick` tells the caller to say so).
 */
export function importSettings(): { needsClick: true } | Promise<Settings | null> {
  const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  if (ua && !ua.isActive) return { needsClick: true };
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    let done = false;
    const finish = () => { done = true; input.remove(); };
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      finish();
      if (!file) { resolve(null); return; }
      try {
        const data = JSON.parse(await file.text()) as { kind?: string; settings?: unknown };
        // A plain settings object (copied from the browser's storage) works too.
        const raw = data?.kind === FILE_KIND ? data.settings : data;
        if (!raw || typeof raw !== 'object' || !('textSpeed' in raw || 'bindings' in raw || 'hud' in raw)) throw new Error('not settings');
        resolve(normalizeSettings(raw));
      } catch { reject(new Error('That file isn’t a settings file')); }
    });
    input.addEventListener('cancel', () => { if (!done) { finish(); resolve(null); } });
    input.click();
  });
}
