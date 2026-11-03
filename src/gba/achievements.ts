/**
 * Mimas: achievements in the GBA game (Update 16). The rules are Saturn's (src/game/achievements.ts) less what the
 * GBA game doesn't have: quests, and records like fish caught or trees chopped. Records and unlocks are the
 * cartridge's (the playtest: this browser's), counted across every save slot, never reset by a new game.
 */
import type { AchievementDef, AchievementKind, AchievementRule } from '../game/achievements';

/** The records the GBA game counts (with kill:<enemy>, addition:<id> and spell:<id>), in the ROM's order. */
export const GBA_RECORDS = ['steps', 'kills', 'battlesWon', 'flawless', 'crits', 'additions', 'spells', 'itemsUsed', 'fled', 'deaths'] as const;
export type GbaRecord = (typeof GBA_RECORDS)[number];

/** Rule kinds the GBA game can unlock (the ROM's numbers are their places here). */
export const GBA_RULES: AchievementKind[] = ['event', 'switch', 'defeat', 'addition', 'spell', 'level', 'gold', 'item', 'party', 'record'];

/** Can the GBA game unlock this one? */
export function gbaRuleOk(r: AchievementRule): boolean {
  return GBA_RULES.includes(r.kind) && (r.kind !== 'record' || (GBA_RECORDS as readonly string[]).includes(r.record));
}

/** The achievements the GBA game has (Database order). */
export const gbaAchievements = (list: AchievementDef[] | undefined): AchievementDef[] => (list ?? []).filter((a) => gbaRuleOk(a.rule));
