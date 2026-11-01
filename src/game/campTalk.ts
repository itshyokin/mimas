/**
 * Talking at camp (Update 122). No three.js.
 *  - Camp lines: what a resting party member says when you talk to them. A default line, plus lines that only play
 *    while a condition holds (a switch on, a quest active…), so they talk about what's going on. Conditional lines
 *    that hold win over the default; several: one at random.
 *  - Group chatter: a little conversation (a speaker and a line per row) that plays top to bottom over each speaker's
 *    head at the next camp, like a live conversation. Queued by an event command, or ready when its switch is on;
 *    each plays once.
 */
import type { Condition, GroupChatter, HeroChatter } from '../world/types';

/** The camp line someone says when talked to, or null (nothing written). */
export function campLine(c: HeroChatter | undefined, test: (cond: Condition) => boolean, rand: () => number = Math.random): string | null {
  const all = (c?.camp ?? []).filter((r) => r.line.trim());
  if (!all.length) return null;
  const when = all.filter((r) => r.if && test(r.if));
  const pool = when.length ? when : all.filter((r) => !r.if);
  if (!pool.length) return null;
  return pool[Math.floor(rand() * pool.length) % pool.length].line.trim();
}

/** The group chatter to play at this camp: the first queued one, else one whose switch is on; each plays once. */
export function nextGroup(list: GroupChatter[] | undefined, queued: string[], played: (id: string) => boolean, switchOn: (id: string) => boolean): GroupChatter | null {
  const usable = (g: GroupChatter | undefined) => !!g && g.lines.some((l) => l.hero && l.text.trim());
  for (const id of queued) { const g = list?.find((x) => x.id === id); if (usable(g)) return g!; }
  return (list ?? []).find((g) => usable(g) && g.switch && switchOn(g.switch) && !played(g.id)) ?? null;
}
