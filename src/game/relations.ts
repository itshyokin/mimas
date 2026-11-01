/**
 * Relationships (Update 124). Each party member rates each other one from 0 (hate) to 100 (best friends / love), one
 * way: Katrina's rating of Eleanor is her own, separate from Eleanor's of Katrina. The hero you play is rated by the
 * others but has no ratings of their own (the player decides how they feel). Ratings start where the Database says
 * (50 when unset) and move with what happens: battle (stepping in to take a blow, healing someone on the bench,
 * reviving, avenging), downtime, gifts, dialogue and quests. No three.js.
 */
import type { Database, RelationKind } from '../world/types';

export const REL_MIN = 0;
export const REL_MAX = 100;
export const REL_START = 50;

/** The labels, from the bottom: each starts at `from`. */
export const REL_LABELS: { from: number; name: string; color: string }[] = [
  { from: 0, name: 'Hate', color: '#e04848' },
  { from: 15, name: 'Dislike', color: '#e8844a' },
  { from: 30, name: 'Distrust', color: '#d8b04a' },
  { from: 45, name: 'Neutral', color: '#a8adb8' },
  { from: 60, name: 'Like', color: '#7ccf6a' },
  { from: 75, name: 'Close', color: '#4ac0a8' },
  { from: 90, name: 'Best friends', color: '#5aa8ff' },
];

/** What changes ratings in battle and elsewhere, with their default amounts (Database → Relationships changes them). */
export const REL_KINDS: [RelationKind, string, number][] = [
  ['cover', 'Stepped in to take a blow meant for them (switching in while they were hurt)', 3],
  ['coverSave', '…and that blow would have knocked them out', 5],
  ['benchHeal', 'Healed them while they were hurt on the bench', 2],
  ['revive', 'Revived them', 4],
  ['avenge', 'Beat the foe that knocked them out', 2],
  ['camp', 'Camping together (each rest)', 1],
];
/** The most one pair's rating moves in a single battle. */
export const REL_BATTLE_CAP = 8;

export const relKey = (a: string, b: string): string => `${a}>${b}`;
export const relClamp = (n: number): number => Math.max(REL_MIN, Math.min(REL_MAX, Math.round(n)));

/** The label for a rating (90+: "Love" for pairs set that way in the Database). */
export function relLabel(n: number, love = false): { name: string; color: string } {
  let out = REL_LABELS[0];
  for (const l of REL_LABELS) if (n >= l.from) out = l;
  return out.from === 90 && love ? { name: 'Love', color: '#ff6fa8' } : out;
}

/** A rating's colour (Update 129): red at 0 (Hate), through yellow (Neutral), to green at 100 (Best friends / Love). */
export const relColor = (n: number): string => `hsl(${Math.round(Math.max(0, Math.min(100, n)) * 1.2)}, 72%, 50%)`;

/** Where `a`'s rating of `b` starts (the Database's, else 50). */
export const relStart = (db: Database, a: string, b: string): number => db.relations?.start?.[a]?.[b] ?? REL_START;
/** The amount for something that happened. */
export const relAmount = (db: Database, k: RelationKind): number => db.relations?.gains?.[k] ?? REL_KINDS.find(([x]) => x === k)?.[2] ?? 0;
/** At 90+, this pair reads "Love" rather than "Best friends". */
export const relLove = (db: Database, a: string, b: string): boolean => !!db.relations?.love?.includes(relKey(a, b));
