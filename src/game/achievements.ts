/**
 * Achievements (Database → Achievements): each has an ID (Steam-style: letters, numbers and underscores), a name,
 * a description, an icon, points, and a rule that unlocks it: an event, a switch, enemies defeated, Additions used,
 * spells cast, a level, a quest, gold, an item, the party's size, or any Journal record reaching a number.
 * Unlocks are the player's, kept across every save in this browser (like Xbox and Steam), not per save.
 * No three.js or DOM here, apart from the storage.
 */

export type AchievementRule =
  /** Only the "Unlock achievement" event command. */
  | { kind: 'event' }
  | { kind: 'switch'; switch: string }
  /** Enemies defeated: one kind, or any (no enemy). */
  | { kind: 'defeat'; enemy?: string; count: number }
  /** Additions performed: one, or any. */
  | { kind: 'addition'; addition?: string; count: number }
  /** Spells cast: one, or any. */
  | { kind: 'spell'; spell?: string; count: number }
  | { kind: 'level'; level: number }
  | { kind: 'quest'; quest: string }
  | { kind: 'gold'; amount: number }
  | { kind: 'item'; item: string; count?: number }
  | { kind: 'party'; size: number }
  /** Any Journal record (steps, fish, trees, battles won without a scratch…) reaching a number. */
  | { kind: 'record'; record: string; count: number };

export type AchievementKind = AchievementRule['kind'];

export interface AchievementDef {
  /** Stable ID: letters, numbers and underscores (the same as a Steam achievement's API name). */
  id: string;
  name: string;
  description: string;
  /** "builtin:trophy", or an image path. */
  icon?: string;
  /** Points (Xbox-style). Steam has no points: they stay in this game. */
  points: number;
  /** Shown as "???" until unlocked. */
  hidden?: boolean;
  rule: AchievementRule;
}

export const RULE_NAMES: Record<AchievementKind, string> = {
  event: 'An event unlocks it', switch: 'A switch turns on', defeat: 'Defeat enemies', addition: 'Perform Additions', spell: 'Cast spells',
  level: 'Reach a level', quest: 'Complete a quest', gold: 'Hold gold', item: 'Have an item', party: 'Party size', record: 'A Journal record',
};

/** Records the game counts that a "Journal record" rule can use. */
export const RECORD_NAMES: [string, string][] = [
  ['steps', 'Steps taken'], ['jumps', 'Jumps'], ['kills', 'Enemies defeated'], ['battlesWon', 'Battles won'], ['flawless', 'Battles won without damage'],
  ['bestHit', 'Strongest hit'], ['crits', 'Critical hits'], ['damageDealt', 'Damage dealt'], ['damageTaken', 'Damage taken'],
  ['additions', 'Additions performed'], ['spells', 'Spells cast'], ['itemsUsed', 'Items used'], ['fled', 'Battles fled'],
  ['trees', 'Trees chopped'], ['fish', 'Fish caught'], ['bestFish', 'Biggest fish (cm)'], ['cut', 'Vines and brush cut'],
  ['itemsFound', 'Items picked up'], ['goldFound', 'Gold found'], ['deaths', 'Times fallen'], ['rests', 'Nights rested'], ['mined', 'Ore mined'],
];

/** IDs Steam accepts as API names. */
export const validId = (id: string): boolean => /^[A-Za-z0-9_]+$/.test(id);
export const toId = (name: string): string => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'ACHIEVEMENT';

/** What the rules read from the game. */
export interface AchievementWorld {
  record(key: string): number;
  level(): number;
  questDone(id: string): boolean;
  switchOn(id: string): boolean;
  gold(): number;
  count(item: string): number;
  partySize(): number;
}

/** How far along a rule is: have / need (need 1 for yes-or-no rules). */
export function progress(r: AchievementRule, w: AchievementWorld): { have: number; need: number } {
  switch (r.kind) {
    case 'event': return { have: 0, need: 1 };
    case 'switch': return { have: w.switchOn(r.switch) ? 1 : 0, need: 1 };
    case 'defeat': return { have: w.record(r.enemy ? `kill:${r.enemy}` : 'kills'), need: Math.max(1, r.count) };
    case 'addition': return { have: w.record(r.addition ? `addition:${r.addition}` : 'additions'), need: Math.max(1, r.count) };
    case 'spell': return { have: w.record(r.spell ? `spell:${r.spell}` : 'spells'), need: Math.max(1, r.count) };
    case 'level': return { have: w.level(), need: Math.max(1, r.level) };
    case 'quest': return { have: w.questDone(r.quest) ? 1 : 0, need: 1 };
    case 'gold': return { have: w.gold(), need: Math.max(1, r.amount) };
    case 'item': return { have: w.count(r.item), need: Math.max(1, r.count ?? 1) };
    case 'party': return { have: w.partySize(), need: Math.max(1, r.size) };
    case 'record': return { have: w.record(r.record), need: Math.max(1, r.count) };
  }
}

/** Unlocked achievements (id → when), kept in this browser for every save. */
export class AchievementBook {
  private unlocked = new Map<string, number>();
  constructor(private readonly key: string) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, number>;
      for (const [id, t] of Object.entries(raw)) if (typeof t === 'number') this.unlocked.set(id, t);
    } catch { /* no storage (private window): unlocks last this session */ }
  }
  has(id: string): boolean { return this.unlocked.has(id); }
  when(id: string): number | undefined { return this.unlocked.get(id); }
  get all(): string[] { return [...this.unlocked.keys()]; }
  /** True when it's newly unlocked. */
  unlock(id: string): boolean {
    if (this.unlocked.has(id)) return false;
    this.unlocked.set(id, Date.now());
    this.store();
    return true;
  }
  /** Forget them all (Settings → Gameplay, or the console). */
  reset(): void { this.unlocked.clear(); this.store(); }
  private store(): void { try { localStorage.setItem(this.key, JSON.stringify(Object.fromEntries(this.unlocked))); } catch { /* ignore */ } }
}

/**
 * A bridge to a store's achievements (Steam through a desktop wrapper such as Electron with steamworks.js): if the
 * page has `window.hd2dAchievements.unlock(id)`, every unlock is passed on, and on start every achievement already
 * unlocked here is passed on too, so earlier unlocks carry over.
 */
export function platformUnlock(id: string): void {
  const b = (window as unknown as { hd2dAchievements?: { unlock?(id: string): void } }).hd2dAchievements;
  try { b?.unlock?.(id); } catch { /* the platform's problem */ }
}

/** A Steam-ready list (API name, display name, description, hidden), as CSV, for Steamworks' achievement setup. */
export function steamCsv(list: AchievementDef[]): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ['API Name,Display Name,Description,Hidden,Points (not used by Steam)', ...list.map((a) => [a.id, q(a.name), q(a.description), a.hidden ? 1 : 0, a.points].join(','))].join('\n');
}
