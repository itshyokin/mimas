/**
 * Sound: effects, background music and ambience through Web Audio, each with its own volume.
 *
 * A sound is named by a source string: "builtin:<name>" for the sounds made in code (see synth.ts), or a
 * file path like "assets/audio/forest.ogg". Effects can be swapped for files in Database → Audio.
 * Browsers only start audio after the player clicks or presses a key, so nothing plays before that.
 */
import { makeChipMusic, makeChipSfx } from './chip';
import { AMBIENCE_NAMES, type AmbienceName, JINGLE_SFX, MUSIC_NAMES, type MusicName, RATE, SFX_NAMES, type SfxName, type Stereo, UI_SFX, makeAmbience, makeMusic, makeSfx } from './synth';

/** The volume groups (Settings → Sound), 0 – 100 each. */
export interface Volumes { master: number; music: number; sfx: number; ambience: number; ui: number; jingle: number }
type Bus = 'music' | 'ambience' | 'sfx' | 'ui' | 'jingle';

export type Sfx = SfxName;
export { SFX_NAMES, MUSIC_NAMES, AMBIENCE_NAMES };

interface Loop { src: string; node: AudioBufferSourceNode; gain: GainNode }

/** UI screens play their clicks through this (set by the game). */
let uiPlayer: (s: Sfx) => void = () => {};
export function setUiSound(fn: (s: Sfx) => void): void { uiPlayer = fn; }
export function uiSound(s: Sfx): void { uiPlayer(s); }

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly loops: Record<'music' | 'ambience', Loop | null> = { music: null, ambience: null };
  /** What each loop should be playing (kept while audio is still locked). */
  private readonly want: Record<'music' | 'ambience', string> = { music: '', ambience: '' };
  private readonly loopGen: Record<'music' | 'ambience', number> = { music: 0, ambience: 0 };
  private volumes: Record<Bus | 'master', number> = { master: 0.25, music: 0.49, ambience: 0.49, sfx: 0.64, ui: 0.49, jingle: 0.64 };
  /** Effects swapped for other sounds (Database → Audio): name → source ('' = silent). */
  overrides: Partial<Record<Sfx, string>> = {};
  /** The built-in effects and music: Game Boy-style chiptune (default) or the older classic synth. */
  private builtinStyle: 'chip' | 'classic' = 'chip';
  setStyle(style: 'chip' | 'classic' | undefined): void {
    const st = style ?? 'chip';
    if (st === this.builtinStyle) return;
    this.builtinStyle = st;
    this.refreshBuiltins();
  }
  private get chipNow(): boolean { return this.chipOnly || this.builtinStyle === 'chip'; }
  /** Forget made sounds and start the music again (after the style or the chiptune test changes). */
  private refreshBuiltins(): void {
    for (const k of [...this.buffers.keys()]) if (k.startsWith('builtin:')) this.buffers.delete(k);
    const src = this.want.music;
    if (src) { this.want.music = ''; this.playLoop('music', src, 0.5); }
  }

  /**
   * Testing the chiptune (console: audio_chiptune true): every effect plays its built-in chip version, whatever the
   * Database swapped it for, and music from files gives way to the built-in theme `chipMusic` picks for it. Nothing is
   * changed in the Database; false puts everything back.
   */
  private chipOnly = false;
  chipMusic: (src: string) => string = () => 'builtin:field';
  get chipTest(): boolean { return this.chipOnly; }
  set chipTest(on: boolean) {
    if (on === this.chipOnly) return;
    this.chipOnly = on;
    this.refreshBuiltins();
  }
  /** Where the listener is (the hero), for effects placed in the world. */
  listener = { x: 0, z: 0 };

  constructor(private readonly resolve: (path: string) => string = (p) => p) {
    const unlock = () => { this.start(); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { capture: true });
  }

  get ready(): boolean { return !!this.ctx && this.ctx.state === 'running'; }

  /** Start audio (after the first click or key press). */
  start(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return; }
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      const bus = () => { const g = this.ctx!.createGain(); g.connect(this.master); return g; };
      this.buses = { music: bus(), ambience: bus(), sfx: bus(), ui: bus(), jingle: bus() };
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    // Anything asked for before audio could start begins now.
    for (const k of ['music', 'ambience'] as const) if (this.want[k] && !this.loops[k]) this.playLoop(k, this.want[k], 1.2, true);
  }

  /** Volumes 0 – 100 from the settings. */
  setVolumes(v: Volumes): void {
    // Perceived loudness: squared.
    const q = (n: number) => (Math.max(0, Math.min(100, n)) / 100) ** 2;
    this.volumes = { master: q(v.master), music: q(v.music), sfx: q(v.sfx), ambience: q(v.ambience), ui: q(v.ui), jingle: q(v.jingle) };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    for (const k of ['music', 'ambience', 'sfx', 'ui', 'jingle'] as const) this.buses[k].gain.setTargetAtTime(this.volumes[k], t, 0.05);
  }

  /** Play an effect. With a world position it gets quieter with distance and pans left / right. */
  play(name: Sfx | string, x?: number, z?: number, gain = 1): void {
    if (!this.ready) return;
    const src = (SFX_NAMES as readonly string[]).includes(name) ? (this.chipOnly ? `builtin:${name}` : this.overrides[name as Sfx] ?? `builtin:${name}`) : name;
    if (!src) return;
    let vol = gain, pan = 0;
    if (x !== undefined && z !== undefined) {
      const dx = x - this.listener.x, dz = z - this.listener.z, d = Math.hypot(dx, dz);
      vol *= Math.max(0, 1 - d / 16);
      pan = Math.max(-0.8, Math.min(0.8, dx / 8));
      if (vol <= 0.01) return;
    }
    void this.buffer(src).then((buf) => {
      if (!buf || !this.ctx) return;
      const node = this.ctx.createBufferSource();
      node.buffer = buf;
      // A touch of pitch variety so repeated hits don't sound identical.
      if (src.startsWith('builtin:')) node.playbackRate.value = 0.95 + Math.random() * 0.1;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      let out: AudioNode = g;
      if (pan && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
      node.connect(g);
      const bus: Bus = (UI_SFX as readonly string[]).includes(name) ? 'ui' : (JINGLE_SFX as readonly string[]).includes(name) ? 'jingle' : 'sfx';
      out.connect(this.buses[bus]);
      node.start();
    });
  }

  /** Change the music ('' stops it), crossfading over `fade` seconds. */
  music(src: string, fade = 1.5): void { this.playLoop('music', src, fade); }
  /** Change the background sound ('' stops it). */
  ambience(src: string, fade = 2): void { this.playLoop('ambience', src, fade); }
  get currentMusic(): string { return this.want.music; }

  private playLoop(kind: 'music' | 'ambience', src: string, fade: number, force = false): void {
    if (!force && this.want[kind] === src) return;
    this.want[kind] = src;
    // Each change has its number: only the latest one's track may start (a slow load finishing late used to start a
    // second track on top of the battle music).
    const gen = ++this.loopGen[kind];
    if (!this.ready) return;
    const ctx = this.ctx!, t = ctx.currentTime, old = this.loops[kind];
    if (old) {
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.node.stop(t + fade + 0.05);
      this.loops[kind] = null;
    }
    if (!src) return;
    // Testing the chiptune: music files give way to a built-in theme.
    const play = kind === 'music' && this.chipOnly && !src.startsWith('builtin:') ? this.chipMusic(src) : src;
    void this.buffer(play).then((buf) => {
      if (!buf || this.want[kind] !== src || this.loopGen[kind] !== gen || !this.ctx) return;
      // Anything still playing in this slot goes (it should already be fading out).
      const prev = this.loops[kind];
      if (prev) { try { prev.node.stop(); } catch { /* stopped already */ } }
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.loop = true;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + fade);
      node.connect(g);
      g.connect(this.buses[kind]);
      node.start();
      this.loops[kind] = { src, node, gain: g };
    });
  }

  /** Load (or make) a sound once. */
  private buffer(src: string): Promise<AudioBuffer | null> {
    let b = this.buffers.get(src);
    if (b) return b;
    b = this.load(src);
    this.buffers.set(src, b);
    return b;
  }

  private async load(src: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (src.startsWith('builtin:')) {
      const name = src.slice(8);
      const chip = this.chipNow;
      if ((SFX_NAMES as readonly string[]).includes(name)) return mono(ctx, chip ? makeChipSfx(name as SfxName) : makeSfx(name as SfxName));
      if (name in MUSIC_NAMES) return stereo(ctx, chip ? makeChipMusic(name as MusicName) : makeMusic(name as MusicName));
      if (name in AMBIENCE_NAMES) return stereo(ctx, makeAmbience(name as AmbienceName));
      return null;
    }
    try {
      const res = await fetch(this.resolve(src));
      if (!res.ok) throw new Error(String(res.status));
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      console.warn(`Sound “${src}” couldn’t be loaded`);
      return null;
    }
  }

  /** Get a sound ready ahead of time (battle music when a map loads), so it doesn't stall when it's needed. */
  prepare(src: string): void { if (this.ready && src && !this.buffers.has(src)) void this.buffer(src); }

  /** Forget a loaded file (after it was replaced in the editor). */
  forget(src: string): void { this.buffers.delete(src); }

  /** Stop everything (leaving the editor's preview, say). */
  stopAll(): void { this.music('', 0.3); this.ambience('', 0.3); this.setSpots([]); }

  /* Sounds placed in the world (an event's sound: a campfire, a shore): looping, loud up close and fading out with
     distance, panned left / right. Given every so often as the full list; ones no longer listed fade out. */
  private readonly spots = new Map<string, { src: string; node: AudioBufferSourceNode | null; gain: GainNode; pan: StereoPannerNode | null; dead?: boolean }>();

  setSpots(list: { key: string; src: string; x: number; z: number; range: number; volume: number }[]): void {
    if (!this.ready) return;
    const ctx = this.ctx!, t = ctx.currentTime, seen = new Set<string>();
    for (const s of list) {
      if (!s.src) continue;
      const key = `${s.key}|${s.src}`;
      seen.add(key);
      const dx = s.x - this.listener.x, dz = s.z - this.listener.z, d = Math.hypot(dx, dz);
      // Full within a tile or so, fading smoothly to nothing at the edge of its range.
      const k = Math.max(0, Math.min(1, 1 - Math.max(0, d - 1) / Math.max(0.5, s.range - 1)));
      const vol = k * k * (3 - 2 * k) * s.volume;
      let sp = this.spots.get(key);
      if (!sp) {
        if (vol <= 0.001) continue;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
        if (pan) { gain.connect(pan); pan.connect(this.buses.ambience); } else gain.connect(this.buses.ambience);
        sp = { src: s.src, node: null, gain, pan };
        this.spots.set(key, sp);
        const holder = sp;
        void this.buffer(s.src).then((buf) => {
          if (!buf || holder.dead || !this.ctx) return;
          const node = this.ctx.createBufferSource();
          node.buffer = buf; node.loop = true;
          // Start somewhere in the loop, so two of the same don't play in step.
          node.connect(holder.gain);
          node.start(0, Math.random() * buf.duration);
          holder.node = node;
        });
      }
      sp.gain.gain.setTargetAtTime(vol, t, 0.25);
      sp.pan?.pan.setTargetAtTime(d < 0.5 ? 0 : Math.max(-0.75, Math.min(0.75, dx / Math.max(3, s.range * 0.6))), t, 0.25);
    }
    for (const [key, sp] of this.spots) {
      if (seen.has(key)) continue;
      sp.dead = true;
      sp.gain.gain.setTargetAtTime(0, t, 0.3);
      sp.node?.stop(t + 1.5);
      this.spots.delete(key);
    }
  }
}

function mono(ctx: AudioContext, data: Float32Array): AudioBuffer {
  const b = ctx.createBuffer(1, Math.max(1, data.length), RATE);
  b.getChannelData(0).set(data);
  return b;
}
function stereo(ctx: AudioContext, s: Stereo): AudioBuffer {
  const b = ctx.createBuffer(2, Math.max(1, s.l.length), s.rate ?? RATE);
  b.getChannelData(0).set(s.l);
  b.getChannelData(1).set(s.r);
  return b;
}

/** Choices for a music or ambience picker: built-ins, then imported files. */
export function loopChoices(kind: 'music' | 'ambience', files: string[]): [string, string][] {
  const names = kind === 'music' ? MUSIC_NAMES : AMBIENCE_NAMES;
  // Files from the audio folders: music lists audio/music/…, background sounds audio/ambience/… (imported files: all).
  const fits = (f: string) => !f.startsWith('audio/') || f.startsWith(`audio/${kind}/`);
  return [['', 'None'], ...Object.entries(names).map(([k, v]) => [`builtin:${k}`, `${v} (built-in)`] as [string, string]),
    ...files.filter(fits).map((f) => [f, f.startsWith('audio/') ? f.slice(6) : f.split('/').pop()!] as [string, string])];
}
