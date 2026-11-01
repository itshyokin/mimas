/**
 * Game Boy-style chiptune versions of the built-in effects and music (Database → Audio → Built-in sound style).
 *
 * Built like the handheld's sound chip: two pulse channels (12.5 / 25 / 50 / 75 % duty), a wave channel playing a
 * 4-bit, 32-step triangle (bass), and a noise channel (a 15-bit shift register, or the short 7-bit one for metallic
 * hits). Volumes step through 16 levels and fade in steps of 1/64 s; pitch sweeps move in steps of 1/128 s; a gentle
 * filter stands in for the tiny speaker. All original tunes and effects. No Web Audio, so it can be tested on its own.
 */
import { RATE, type MusicName, type SfxName, type Stereo } from './synth';

type Wave = 'p12' | 'p25' | 'p50' | 'p75' | 'tri' | 'noise' | 'metal';

/** One sound on one channel. Pitch in Hz (noise: the shift register's clock); volume 0 … 15. */
interface Seg {
  wave: Wave;
  f: number;
  /** Pitch at the end (a sweep), if it changes. */
  to?: number;
  dur: number;
  vol: number;
  /** Volume falls one step every `fade` × 1/64 s (0: held). Negative: rises. */
  fade?: number;
  /** Start (s); default: right after the previous one. */
  at?: number;
  /** Vibrato depth (semitones) and speed (Hz). */
  vib?: [number, number];
}

const DUTY: Record<string, number> = { p12: 0.125, p25: 0.25, p50: 0.5, p75: 0.75 };
/** The wave channel's triangle: 32 steps of 4 bits. */
const TRI = Array.from({ length: 32 }, (_, i) => (i < 16 ? i : 31 - i) / 7.5 - 1);

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C5", "F#4", "Bb3" → Hz. */
export function note(n: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) return 440;
  return midi(12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0));
}

/** Render segments (one or more channels at once) into mono samples at `sr`. */
function render(segs: Seg[], sr = RATE, tail = 0.02): Float32Array {
  let cursor = 0;
  const placed = segs.map((s) => { const at = s.at ?? cursor; cursor = at + s.dur; return { ...s, at }; });
  const len = Math.max(...placed.map((s) => s.at + s.dur)) + tail;
  const out = new Float32Array(Math.ceil(len * sr));
  for (const s of placed) addSeg(out, s, sr);
  return speaker(out, sr);
}

let lfsr = 0x7fff;
function addSeg(out: Float32Array, s: Seg & { at: number }, sr: number, gain = 1, loop = false): void {
  const s0 = Math.floor(s.at * sr), n = Math.floor(s.dur * sr);
  let phase = 0, noiseAcc = 0, bit = 1;
  const isNoise = s.wave === 'noise' || s.wave === 'metal';
  for (let i = 0; i < n; i++) {
    const idx = loop ? (s0 + i) % out.length : s0 + i;
    if (!loop && idx >= out.length) break;
    const t = i / sr;
    // Pitch: swept in 1/128 s steps (log scale), with vibrato.
    const st = Math.floor(t * 128) / 128, k = s.dur > 0 ? Math.min(1, st / s.dur) : 0;
    let f = s.to !== undefined ? s.f * Math.pow(s.to / s.f, k) : s.f;
    if (s.vib) f *= Math.pow(2, (s.vib[0] * Math.sin(2 * Math.PI * s.vib[1] * t) * Math.min(1, t / 0.15)) / 12);
    // Volume: 16 steps, fading in 1/64 s steps.
    let v = s.vol;
    if (s.fade) v = s.fade > 0 ? s.vol - Math.floor((t * 64) / s.fade) : Math.min(15, Math.floor((t * 64) / -s.fade));
    if (v <= 0) { if (s.fade && s.fade > 0) break; continue; }
    const amp = (Math.min(15, v) / 15) * 0.25 * gain;
    let x: number;
    if (isNoise) {
      noiseAcc += f / sr;
      while (noiseAcc >= 1) {
        noiseAcc -= 1;
        const b = (lfsr ^ (lfsr >> 1)) & 1;
        lfsr = (lfsr >> 1) | (b << 14);
        if (s.wave === 'metal') lfsr = (lfsr & ~0x40) | (b << 6);
        bit = lfsr & 1;
      }
      x = bit ? 1 : -1;
    } else {
      phase = (phase + f / sr) % 1;
      x = s.wave === 'tri' ? TRI[Math.floor(phase * 32)] : phase < DUTY[s.wave] ? 1 : -1;
    }
    out[idx] += x * amp;
  }
}

/** The tiny speaker: no DC, a soft top end. */
function speaker(a: Float32Array, sr: number, cutoff = 9000): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  let lp = 0, dc = 0;
  for (let i = 0; i < a.length; i++) {
    lp += (a[i] - lp) * k;
    dc += (lp - dc) * 0.0015;
    a[i] = lp - dc;
  }
  return a;
}

/** Quick notes in a row on one channel: [note, length] pairs. */
const run = (wave: Wave, notes: [string, number][], vol = 12, fade = 0, at = 0): Seg[] => {
  let t = at;
  return notes.map(([n, d]) => { const s: Seg = { wave, f: note(n), dur: d, vol, fade, at: t }; t += d; return s; });
};
/** An arpeggio with a softer echo on the second pulse (a classic trick for width). */
const arp = (notes: string[], step: number, tailLen = 0.3, vol = 12): Seg[] => {
  const segs: Seg[] = notes.map((n, k) => ({ wave: 'p50' as Wave, f: note(n), dur: k === notes.length - 1 ? step + tailLen : step, vol, fade: k === notes.length - 1 ? 3 : 0, at: k * step }));
  return [...segs, ...segs.map((s) => ({ ...s, wave: 'p25' as Wave, vol: Math.max(1, Math.round(s.vol / 3)), at: (s.at ?? 0) + step * 0.5 }))];
};
const step = (clock: number, dur: number, vol: number, fade: number, wave: Wave = 'noise', at = 0): Seg => ({ wave, f: clock, dur, vol, fade, at });

/** The chiptune version of an effect (mono samples). */
export function makeChipSfx(name: SfxName): Float32Array {
  // Square waves sound louder than the classic synth's soft tones at the same level: brought down to sit alike.
  const out = chipSfx(name);
  for (let i = 0; i < out.length; i++) out[i] *= 0.62;
  return out;
}

function chipSfx(name: SfxName): Float32Array {
  lfsr = 0x7fff ^ (name.length * 977);
  switch (name) {
    case 'swing': return render([{ wave: 'noise', f: 9000, to: 2500, dur: 0.11, vol: 9, fade: 1 }]);
    case 'swingHeavy': return render([{ wave: 'noise', f: 5000, to: 900, dur: 0.2, vol: 11, fade: 2 }]);
    case 'hitFlesh': return render([step(1500, 0.08, 13, 1), { wave: 'p50', f: 150, to: 60, dur: 0.09, vol: 12, fade: 1, at: 0 }]);
    case 'hitPlant': return render([step(9000, 0.04, 12, 1), step(6000, 0.05, 8, 1, 'noise', 0.05), { wave: 'p25', f: 330, dur: 0.04, vol: 7, fade: 1, at: 0 }]);
    case 'hitMetal': return render([step(9000, 0.03, 14, 1, 'metal'), { wave: 'p12', f: note('E6'), dur: 0.35, vol: 11, fade: 3, at: 0 }, { wave: 'p25', f: note('B6'), dur: 0.25, vol: 6, fade: 3, at: 0.01 }]);
    case 'hitStone': return render([step(2200, 0.1, 15, 2), step(1500, 0.08, 9, 1, 'noise', 0.07), { wave: 'tri', f: 95, dur: 0.08, vol: 12, at: 0 }]);
    case 'hitWood': return render([{ wave: 'p50', f: 520, to: 380, dur: 0.07, vol: 12, fade: 1 }, step(8000, 0.02, 9, 1)]);
    case 'hitBone': return render([step(11000, 0.03, 13, 1, 'metal'), step(9000, 0.02, 10, 1, 'noise', 0.035), { wave: 'p12', f: 900, dur: 0.03, vol: 8, fade: 1, at: 0 }]);
    case 'hitLiquid': return render([{ wave: 'noise', f: 2400, to: 900, dur: 0.3, vol: 12, fade: 2 }, { wave: 'p50', f: 600, to: 240, dur: 0.14, vol: 7, fade: 2, at: 0 }]);
    case 'hitGel': return render([{ wave: 'p50', f: 140, to: 320, dur: 0.13, vol: 13, fade: 2 }, step(1800, 0.06, 7, 1)]);
    case 'hitCrystal': return render([step(12000, 0.02, 12, 1, 'metal'), { wave: 'p25', f: note('C7'), dur: 0.4, vol: 10, fade: 3, at: 0 }, { wave: 'p12', f: note('G7'), dur: 0.3, vol: 7, fade: 3, at: 0.02 }]);
    case 'hitSpirit': return render([{ wave: 'p25', f: 700, to: 300, dur: 0.45, vol: 9, fade: 3, vib: [0.5, 9] }, { wave: 'p12', f: 1050, to: 450, dur: 0.4, vol: 5, fade: 3, at: 0.02 }]);
    case 'hitCloth': return render([step(2500, 0.06, 11, 1), { wave: 'tri', f: 120, dur: 0.05, vol: 9, at: 0 }]);
    case 'critBig': return render([step(14000, 0.03, 15, 1), { wave: 'tri', f: 90, to: 38, dur: 0.6, vol: 15, fade: 4, at: 0 }, step(900, 0.4, 9, 3, 'noise', 0.02)]);
    case 'rustle': return render([step(7000, 0.06, 7, 1), step(5200, 0.06, 6, 1, 'noise', 0.09), step(6200, 0.05, 4, 1, 'noise', 0.18)]);
    case 'hoof': return render([{ wave: 'noise', f: 1800, to: 600, dur: 0.05, vol: 8, fade: 1 }, { wave: 'tri', f: 300, to: 140, dur: 0.05, vol: 9, fade: 1 }]);
    case 'horseSnort': return render([{ wave: 'noise', f: 2400, to: 900, dur: 0.35, vol: 7, fade: 1 }]);
    case 'horseNeigh': return render([{ wave: 'p25', f: 700, to: 420, dur: 0.7, vol: 7, fade: 1 }]);
    case 'lockClick': return render([{ wave: 'noise', f: 9000, dur: 0.02, vol: 6, fade: 1 }]);
    case 'lockTurn': return render([{ wave: 'p25', f: 140, to: 170, dur: 0.18, vol: 5, fade: 1 }]);
    case 'lockOpen': return render([{ wave: 'noise', f: 7000, dur: 0.02, vol: 9, fade: 1 }, { wave: 'p25', f: note('E6'), dur: 0.06, vol: 8, fade: 1, at: 0.04 }, { wave: 'p25', f: note('A6'), dur: 0.1, vol: 8, fade: 1, at: 0.11 }]);
    case 'lockBreak': return render([{ wave: 'noise', f: 8000, to: 3000, dur: 0.12, vol: 10, fade: 1 }]);
    case 'lowHp': return render([{ wave: 'p25', f: note('B5'), dur: 0.1, vol: 10, fade: 1 }, { wave: 'p25', f: note('G5'), dur: 0.1, vol: 10, fade: 1, at: 0.15 }]);
    case 'thump': return render([{ wave: 'tri', f: 110, to: 45, dur: 0.18, vol: 15, fade: 2 }, step(1200, 0.03, 7, 1)]);
    case 'hit': return render([step(3000, 0.07, 14, 1), { wave: 'p50', f: 220, to: 70, dur: 0.08, vol: 12, fade: 1, at: 0 }]);
    case 'crit': return render([{ wave: 'p25', f: 1700, to: 380, dur: 0.16, vol: 13, fade: 2 }, step(5000, 0.05, 14, 1)]);
    case 'hurt': return render([{ wave: 'p50', f: 330, to: 100, dur: 0.18, vol: 13, fade: 2 }, step(1800, 0.1, 10, 1)]);
    case 'draw': return render([{ wave: 'p12', f: 180, to: 260, dur: 0.32, vol: 6 }]);
    case 'shoot': return render([{ wave: 'p25', f: 1100, to: 300, dur: 0.1, vol: 11, fade: 1 }, step(6000, 0.06, 8, 1)]);
    case 'arrowHit': return render([step(2600, 0.06, 13, 1), { wave: 'p50', f: 160, dur: 0.04, vol: 8, fade: 1, at: 0 }]);
    case 'fire': return render([{ wave: 'noise', f: 1500, to: 4000, dur: 0.36, vol: 12, fade: 3 }, { wave: 'p12', f: 300, to: 760, dur: 0.25, vol: 6, fade: 3, at: 0 }]);
    case 'fireHit': return render([{ wave: 'noise', f: 1600, to: 300, dur: 0.42, vol: 15, fade: 2 }]);
    case 'dodge': return render([{ wave: 'noise', f: 2000, to: 7000, dur: 0.14, vol: 8, fade: 2 }]);
    case 'guard': return render([{ wave: 'p50', f: note('A5'), dur: 0.06, vol: 9, fade: 1 }]);
    case 'block': return render([step(7000, 0.1, 13, 1, 'metal'), { wave: 'p50', f: 760, dur: 0.12, vol: 9, fade: 1, at: 0 }]);
    case 'parry': return render([step(8000, 0.03, 14, 1, 'metal'), { wave: 'p25', f: note('E6'), dur: 0.35, vol: 12, fade: 3, at: 0.01 }, { wave: 'p12', f: note('B6'), dur: 0.3, vol: 7, fade: 3, at: 0.04 }]);
    case 'defeat': return render([{ wave: 'p50', f: 700, to: 70, dur: 0.38, vol: 13, fade: 3 }, { wave: 'noise', f: 2500, to: 600, dur: 0.3, vol: 10, fade: 2, at: 0 }]);
    case 'target': return render([...run('p25', [['A5', 0.04], ['E6', 0.06]], 9, 1)]);
    case 'levelUp': return render(arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6'], 0.065, 0.5));
    case 'item': return render(arp(['G5', 'B5', 'D6', 'G6'], 0.07, 0.3));
    case 'dice': return render([0, 0.1, 0.18, 0.25, 0.31, 0.36, 0.4, 0.43].map((at, k) => step(5000 + k * 400, 0.02, 11 - k, 1, k % 2 ? 'metal' : 'noise', at)));
    case 'weak': return render([step(2200, 0.12, 15, 2), { wave: 'p50', f: 220, to: 45, dur: 0.18, vol: 14, fade: 2, at: 0 }, { wave: 'p25', f: note('F#6'), dur: 0.3, vol: 9, fade: 3, at: 0.03 }]);
    case 'coin': return render([{ wave: 'p50', f: note('B5'), dur: 0.06, vol: 12 }, { wave: 'p50', f: note('E6'), dur: 0.35, vol: 12, fade: 3 }]);
    case 'orb': return render([{ wave: 'p25', f: 1200, to: 2500, dur: 0.12, vol: 8, fade: 1 }]);
    case 'cut': return render([step(4500, 0.08, 12, 1), step(2500, 0.08, 8, 1, 'noise', 0.08)]);
    case 'ringOn': return render([{ wave: 'p25', f: 600, to: 1300, dur: 0.28, vol: 10, fade: 3, vib: [0.4, 12] }]);
    case 'ringOff': return render([{ wave: 'p25', f: 1100, to: 450, dur: 0.25, vol: 9, fade: 3 }]);
    case 'swim': return render([{ wave: 'noise', f: 900, to: 1600, dur: 0.25, vol: 7, fade: 3 }, { wave: 'p12', f: 300, to: 520, dur: 0.12, vol: 4, fade: 2, at: 0.15 }]);
    case 'fishCast': return render([{ wave: 'noise', f: 7000, to: 3000, dur: 0.3, vol: 6, fade: 4 }, { wave: 'p50', f: 520, to: 180, dur: 0.12, vol: 10, fade: 1, at: 0.45 }]);
    case 'fishBite': return render([{ wave: 'p50', f: 900, to: 380, dur: 0.07, vol: 11, fade: 1 }, { wave: 'p50', f: 900, to: 380, dur: 0.07, vol: 11, fade: 1, at: 0.14 }]);
    case 'fishCatch': return render([...Array.from({ length: 9 }, (_, k) => step(9000, 0.02, 6, 0, 'metal', k * 0.045)), { wave: 'noise', f: 2500, to: 700, dur: 0.3, vol: 11, fade: 3, at: 0.42 }]);
    case 'textTick': return render([{ wave: 'p50', f: note('C7'), dur: 0.018, vol: 3 }], RATE, 0.005);
    case 'menuMove': return render([{ wave: 'p50', f: note('D7'), dur: 0.03, vol: 4, fade: 1 }]);
    case 'menuOk': return render(run('p50', [['A6', 0.035], ['E7', 0.07]], 5, 1));
    case 'menuBack': return render(run('p50', [['E6', 0.035], ['A5', 0.06]], 5, 1));
    case 'jump': return render([{ wave: 'p50', f: 280, to: 760, dur: 0.13, vol: 10, fade: 2 }]);
    case 'splash': return render([{ wave: 'noise', f: 3000, to: 700, dur: 0.35, vol: 12, fade: 3 }]);
    case 'skill': return render(arp(['G4', 'C5', 'E5', 'G5', 'C6'], 0.06, 0.45));
    case 'save': return render(arp(['C6', 'G6'], 0.1, 0.4));
    // Footsteps: tiny ticks of the noise channel, a different colour for each ground.
    case 'stepGrass': return render([step(6500, 0.035, 5, 1)]);
    case 'stepDirt': return render([step(1800, 0.04, 6, 1)]);
    case 'stepStone': return render([step(4200, 0.025, 6, 1), { wave: 'p50', f: 200, dur: 0.02, vol: 4, fade: 1, at: 0 }]);
    case 'stepWood': return render([{ wave: 'tri', f: 220, to: 170, dur: 0.05, vol: 12, fade: 1 }, step(3000, 0.015, 4, 1)]);
    case 'stepSand': return render([step(3200, 0.06, 5, 2)]);
    case 'stepSnow': return render([step(1300, 0.07, 6, 2), step(5200, 0.03, 3, 1, 'noise', 0.02)]);
    case 'stepWater': return render([{ wave: 'noise', f: 1200, to: 2600, dur: 0.1, vol: 6, fade: 2 }]);
    case 'stepMetal': return render([step(6000, 0.06, 7, 1, 'metal')]);
    case 'stepCarpet': return render([step(900, 0.035, 5, 1)]);
    case 'break': return render([step(2500, 0.08, 15, 1), { wave: 'noise', f: 1400, to: 400, dur: 0.5, vol: 12, fade: 3, at: 0.04 }, { wave: 'metal', f: 3000, dur: 0.15, vol: 6, fade: 2, at: 0.1 }]);
    case 'questStart': return render(arp(['G4', 'B4', 'D5', 'G5'], 0.1, 0.6));
    case 'questStep': return render(arp(['G5', 'C6'], 0.08, 0.35));
    case 'questDone': return render([...arp(['C5', 'E5', 'G5', 'E5', 'G5', 'C6'], 0.1, 0.8), ...run('tri', [['C4', 0.3], ['G3', 0.3], ['C3', 0.6]], 15, 0, 0)]);
    case 'transfer': return render([{ wave: 'p12', f: 900, to: 200, dur: 0.3, vol: 5, fade: 3 }, { wave: 'noise', f: 2000, to: 500, dur: 0.3, vol: 3, fade: 3, at: 0 }]);
    // A battle starts: a fast falling run with a crash.
    case 'encounter': return render([step(1500, 0.2, 15, 2),
      ...['E6', 'C6', 'A5', 'E5', 'C5', 'A4', 'E4', 'C4'].map((n, k) => ({ wave: 'p25' as Wave, f: note(n), dur: 0.05, vol: 13, at: 0.02 + k * 0.05 })),
      { wave: 'p50', f: note('A3'), dur: 0.4, vol: 12, fade: 4, at: 0.42 }, { wave: 'tri', f: note('A2'), dur: 0.45, vol: 15, fade: 0, at: 0.42 }]);
    // Into battle: rising arpeggios getting faster, to a hit.
    case 'battleSwell': {
      const segs: Seg[] = [];
      let t = 0, k = 0;
      const notes = ['A3', 'C4', 'E4', 'A4', 'C5', 'E5'];
      while (t < 1.2) { const d = Math.max(0.03, 0.09 - t * 0.05); segs.push({ wave: 'p50', f: note(notes[k % 6]) * (1 + Math.floor(k / 6) * 0.5), dur: d, vol: 6 + Math.min(8, Math.floor(t * 8)), at: t }); t += d; k++; }
      segs.push({ wave: 'noise', f: 600, to: 9000, dur: 1.2, vol: 1, fade: -6, at: 0 }, step(1200, 0.3, 15, 3, 'noise', 1.25), { wave: 'tri', f: note('A2'), dur: 0.3, vol: 15, at: 1.25 });
      return render(segs);
    }
    case 'thunder': return render([step(4000, 0.1, 9, 1), { wave: 'noise', f: 600, to: 150, dur: 3, vol: 7, fade: 22, at: 0.1 }]);
    case 'shatter': return render([step(6000, 0.06, 15, 1, 'metal'), ...Array.from({ length: 16 }, (_, k) => step(7000 + (k * 1237) % 5000, 0.03, 9 - Math.floor(k / 2), 1, 'metal', 0.06 + k * 0.045))]);
    // Victory: an original little fanfare on both pulses and the wave channel.
    case 'victory': {
      const lead = run('p50', [['G5', 0.12], ['G5', 0.12], ['G5', 0.12], ['C6', 0.45], ['A5', 0.2], ['B5', 0.2], ['C6', 0.9]], 12, 0);
      lead[lead.length - 1].fade = 5;
      const harm = run('p25', [['E5', 0.12], ['E5', 0.12], ['E5', 0.12], ['G5', 0.45], ['F5', 0.2], ['G5', 0.2], ['E5', 0.9]], 7, 0);
      harm[harm.length - 1].fade = 5;
      const bass = run('tri', [['C3', 0.36], ['C3', 0.45], ['F3', 0.2], ['G3', 0.2], ['C3', 0.9]], 15, 0);
      return render([...lead, ...harm, ...bass]);
    }
    case 'expFill': return render(Array.from({ length: 20 }, (_, k) => ({ wave: 'p25' as Wave, f: 400 * Math.pow(4, k / 20), dur: 0.05, vol: 8, at: k * 0.05 })));
    case 'expDing': return render([{ wave: 'p25', f: note('G6'), dur: 0.45, vol: 12, fade: 3 }, { wave: 'p12', f: note('G7'), dur: 0.3, vol: 5, fade: 2, at: 0.02 }]);
    case 'achievement': return render([{ wave: 'p50', f: note('E5'), dur: 0.16, vol: 11 }, { wave: 'p50', f: note('B5'), dur: 0.8, vol: 12, fade: 4 },
      { wave: 'p25', f: note('E6'), dur: 0.7, vol: 5, fade: 4, at: 0.2 }, { wave: 'tri', f: note('E3'), dur: 0.9, vol: 15, at: 0 }]);
    case 'lootGold': return render([...Array.from({ length: 6 }, (_, k) => ({ wave: 'p50' as Wave, f: note(k % 2 ? 'E6' : 'B5'), dur: 0.05, vol: 11 - k, at: k * 0.06 }))]);
    case 'lootPotion': return render([{ wave: 'p50', f: 900, to: 300, dur: 0.04, vol: 12 }, ...Array.from({ length: 4 }, (_, k) => ({ wave: 'p12' as Wave, f: 200 + k * 60, to: 340 + k * 60, dur: 0.08, vol: 8, fade: 1, at: 0.15 + k * 0.1 }))]);
    case 'lootKey': return render(arp(['C6', 'E6', 'G6', 'C7', 'E7'], 0.055, 0.6));
    case 'lootMaterial': return render([{ wave: 'tri', f: 240, to: 160, dur: 0.08, vol: 15 }, step(4000, 0.03, 9, 1, 'metal', 0.09)]);
    case 'lootGear': return render([step(9000, 0.05, 10, 1, 'metal'), { wave: 'p25', f: note('C#7'), dur: 0.5, vol: 10, fade: 4, at: 0.04 }, { wave: 'p12', f: note('G#7'), dur: 0.4, vol: 4, fade: 3, at: 0.06 }]);
    case 'lootItem': return render(arp(['G5', 'B5', 'D6'], 0.07, 0.3));
  }
}

/* ------------------------------------------------------------------ music */

interface Plan {
  bpm: number;
  root: number;
  /** One chord per bar: semitones over the root. */
  chords: number[][];
  scale: number[];
  lead: Wave;
  /** 'arp': fast 16th-note chord arpeggios; 'pulse': chord stabs; 'none'. */
  harmony: 'arp' | 'pulse' | 'none';
  /** 'march', 'gallop', 'soft' or none. */
  drums?: 'march' | 'gallop' | 'soft';
  /** How busy the melody is (0 … 1). */
  busy: number;
  /** Bass pattern: 'walk' (root-fifth-octave), 'pulse' (repeated eighths), 'long'. */
  bass: 'walk' | 'pulse' | 'long';
  vib?: number;
}

const PLANS: Record<MusicName, Plan> = {
  title: { bpm: 96, root: 60, chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2], [0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], scale: [0, 2, 4, 7, 9], lead: 'p50', harmony: 'arp', busy: 0.55, bass: 'long', drums: 'soft', vib: 0.25 },
  field: { bpm: 124, root: 62, chords: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14], [0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], scale: [0, 2, 4, 7, 9], lead: 'p50', harmony: 'arp', busy: 0.8, bass: 'walk', drums: 'march' },
  night: { bpm: 84, root: 57, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], scale: [0, 3, 5, 7, 10], lead: 'p25', harmony: 'arp', busy: 0.4, bass: 'long', vib: 0.3 },
  battle: { bpm: 156, root: 57, chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-4, 0, 3], [-2, 2, 5], [-2, 2, 5], [-5, -1, 2], [-5, -1, 2]], scale: [0, 2, 3, 5, 7, 8, 11], lead: 'p25', harmony: 'pulse', busy: 1, bass: 'pulse', drums: 'gallop' },
  cave: { bpm: 72, root: 50, chords: [[0, 3, 7], [1, 4, 8], [0, 3, 7], [-2, 1, 5]], scale: [0, 1, 3, 5, 7, 8], lead: 'p12', harmony: 'none', busy: 0.3, bass: 'long', vib: 0.2 },
  victory: { bpm: 132, root: 60, chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], scale: [0, 2, 4, 7, 9, 12], lead: 'p50', harmony: 'arp', busy: 0.9, bass: 'walk', drums: 'march' },
};

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/**
 * A looping chiptune track (stereo, at half rate). The melody is built from two short motifs (A and B) laid out
 * A A′ B A″ and bent onto each bar's chord, so it repeats and answers like a real tune rather than wandering.
 */
export function makeChipMusic(name: MusicName): Stereo {
  const p = PLANS[name], R = rng(name.length * 71 + 5), SR = RATE / 2;
  const beat = 60 / p.bpm, bar = beat * 4, bars = p.chords.length * 2, secs = bars * bar, n = Math.ceil(secs * SR);
  const lead = new Float32Array(n), back = new Float32Array(n), low = new Float32Array(n);
  const put = (buf: Float32Array, s: Seg, gain = 1) => addSeg(buf, s as Seg & { at: number }, SR, gain, true);
  // Motifs: rhythm (in 8ths, summing to a bar) and contour (scale steps).
  const motif = () => {
    const rhythm: number[] = [];
    let left = 8;
    while (left > 0) { const d = Math.min(left, R() < p.busy * 0.7 ? 1 : R() < 0.6 ? 2 : 3); rhythm.push(d); left -= d; }
    return { rhythm, steps: rhythm.map(() => Math.floor(R() * 5) - 2), rests: rhythm.map(() => R() > 0.55 + p.busy * 0.4) };
  };
  const A = motif(), B = motif();
  const form = [A, A, B, A];
  let deg = 2;
  for (let b = 0; b < bars; b++) {
    const chord = p.chords[b % p.chords.length], t0 = b * bar, m = form[b % 4], vary = b % 4 === 1 || b % 4 === 3;
    // Melody: walk the scale by the motif's steps, landing on a chord tone at the start of the bar.
    const tones = chord.map((c) => ((c % 12) + 12) % 12);
    let t = t0;
    m.rhythm.forEach((d, k) => {
      deg = Math.max(0, Math.min(p.scale.length * 2 - 1, deg + m.steps[k] + (vary && k === m.rhythm.length - 1 ? 1 : 0)));
      let semi = p.scale[deg % p.scale.length] + 12 * Math.floor(deg / p.scale.length);
      if (k === 0) { const near = tones.reduce((a, c) => (Math.abs(c - (semi % 12)) < Math.abs(a - (semi % 12)) ? c : a), tones[0]); semi = semi - (semi % 12) + near; }
      const dur = (d * beat) / 2;
      if (!m.rests[k] || k === 0) put(lead, { wave: p.lead, f: midi(p.root + semi), dur: dur * 0.92, vol: 11, fade: dur > beat ? 6 : 0, at: t, vib: p.vib ? [p.vib, 5.5] : undefined });
      t += dur;
    });
    // Harmony.
    if (p.harmony === 'arp') {
      const tonesUp = [...chord, chord[0] + 12];
      for (let s = 0; s < 16; s++) put(back, { wave: 'p12', f: midi(p.root + tonesUp[s % tonesUp.length]), dur: bar / 16, vol: 5, at: t0 + (s * bar) / 16 });
    } else if (p.harmony === 'pulse') {
      for (let s = 0; s < 8; s++) if (s % 2 === 0 || s === 7) for (const c of chord.slice(1)) put(back, { wave: 'p25', f: midi(p.root + c - 12), dur: bar / 8 * 0.6, vol: 6, fade: 1, at: t0 + (s * bar) / 8 });
    }
    // Bass on the wave channel.
    const r = p.root + chord[0] - 24;
    if (p.bass === 'long') put(low, { wave: 'tri', f: midi(r), dur: bar * 0.95, vol: 15, at: t0 });
    else if (p.bass === 'walk') [0, 7, 12, 7].forEach((iv, k) => put(low, { wave: 'tri', f: midi(r + iv), dur: beat * 0.9, vol: 15, at: t0 + k * beat }));
    else for (let s = 0; s < 8; s++) put(low, { wave: 'tri', f: midi(r + (s === 6 ? 12 : 0)), dur: beat / 2 * 0.8, vol: 15, at: t0 + (s * beat) / 2 });
    // Drums on the noise channel.
    if (p.drums) for (let s = 0; s < 8; s++) {
      const at = t0 + (s * beat) / 2;
      const kick = p.drums === 'gallop' ? s % 4 === 0 || s % 4 === 3 : s % 4 === 0, snare = s % 4 === 2;
      if (p.drums === 'soft') { if (s === 0) put(low, step(900, 0.06, 7, 1, 'noise', at)); continue; }
      if (kick) put(low, step(700, 0.07, 12, 1, 'noise', at));
      else if (snare) put(low, step(3200, 0.1, 10, 2, 'noise', at));
      else put(low, step(9000, 0.02, 5, 1, 'metal', at));
    }
  }
  // Mix: the lead a touch left, the harmony right (the handheld's headphone panning), bass and drums centre.
  const l = new Float32Array(n), rr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = lead[i] * 0.85 + back[i] * 0.55 + low[i];
    rr[i] = lead[i] * 0.6 + back[i] * 0.85 + low[i];
  }
  speaker(l, SR, 7000); speaker(rr, SR, 7000);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(rr[i]));
  const g = peak > 0 ? 0.6 / peak : 1;
  for (let i = 0; i < n; i++) { l[i] *= g; rr[i] *= g; }
  return { l, r: rr, rate: SR };
}
