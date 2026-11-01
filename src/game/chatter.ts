/**
 * Party chatter: now and then a hero says a line in a speech bubble over their head (one at a time, picked at
 * random). Written per hero in Database → Characters → Chatter: General lines for things that happen (getting Cold,
 * the rain starting, walking into a rest area, a new map…) and Map lines for one map ("This is Reach City. I grew up
 * here!"). Each hero's Chatter amount (0 never … 10 often) says how talkative they are; the hero you play is rarer
 * still. Every line said goes in the adventure log. No three.js.
 */
import type { HeroChatter, ChatterTrigger } from '../world/types';

/** The General triggers, in the editor's order, with their names. */
export const CHATTER_TRIGGERS: [ChatterTrigger, string][] = [
  ['cold', 'Getting Cold'], ['freezing', 'Freezing'], ['hot', 'Getting Hot'], ['overheating', 'Overheating'],
  ['wet', 'Getting Wet'], ['comfortable', 'Warm and comfortable again'],
  ['rain', 'Rain starts'], ['snow', 'Snow starts'], ['storm', 'A storm starts'], ['clear', 'The weather clears'],
  ['windUp', 'The wind picks up'], ['windDown', 'The wind dies down'],
  ['rest', 'Entering a rest area'], ['camp', 'Making camp / resting'], ['newMap', 'Entering a map for the first time'],
];

/** One hero who could speak. */
export interface Talker { id: string; name: string; chatter?: HeroChatter; isPlayer: boolean; canSpeak: boolean }

/** How talkative (0 … 10; 5 when unset). */
export const chatterAmount = (c?: HeroChatter): number => Math.max(0, Math.min(10, c?.amount ?? 5));

const lines = (s: string[] | undefined): string[] => (s ?? []).map((l) => l.trim()).filter(Boolean);

/** A hero's lines for a trigger, or for a map. */
export function linesFor(c: HeroChatter | undefined, what: { trigger?: ChatterTrigger; map?: string }): string[] {
  if (!c) return [];
  if (what.map) return lines((c.maps ?? []).filter((r) => r.map === what.map).map((r) => r.line));
  return what.trigger ? lines(c.lines?.[what.trigger]) : [];
}

/**
 * Who says what for something that happened, or null (nobody this time). Everyone with a line for it may speak, as
 * often as their Chatter amount says (the hero you play a third as often); `prefer` (whoever it happened to) is
 * likelier; `boost` raises the chance (a first visit).
 */
export function pickChatter(talkers: Talker[], what: { trigger?: ChatterTrigger; map?: string }, opts: { prefer?: string; boost?: number; rand?: () => number } = {}): { id: string; name: string; line: string } | null {
  const rand = opts.rand ?? Math.random;
  const can = talkers.flatMap((t) => {
    if (!t.canSpeak) return [];
    const ls = linesFor(t.chatter, what);
    let w = chatterAmount(t.chatter) / 10;
    if (t.isPlayer) w /= 3;
    if (opts.prefer === t.id) w *= 2;
    return ls.length && w > 0 ? [{ t, ls, w: Math.min(1, w) }] : [];
  });
  if (!can.length) return null;
  // The chance someone speaks at all: the chattiest of them, times the boost (capped).
  const chance = Math.min(0.95, Math.max(...can.map((c) => c.w)) * 0.7 * (opts.boost ?? 1));
  if (rand() >= chance) return null;
  let r = rand() * can.reduce((s, c) => s + c.w, 0);
  const who = can.find((c) => (r -= c.w) <= 0) ?? can[can.length - 1];
  return { id: who.t.id, name: who.t.name, line: who.ls[Math.floor(rand() * who.ls.length) % who.ls.length] };
}

/** How long a line stays up (seconds): longer lines longer. */
export const chatterSeconds = (line: string): number => Math.min(7, 2.6 + line.length * 0.055);
