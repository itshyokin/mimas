/** Mimas: Pokémon-style moves (four at most). */
import type { EnemyDef, MoveRef } from '../world/types';

export const MAX_MOVES = 4;

/** Its moves at a level: an override, else the last moveset at or below the level, else its moves. */
export function movesAt(d: EnemyDef, level: number, override?: MoveRef[]): MoveRef[] {
  if (override?.length) return override.slice(0, MAX_MOVES);
  const set = [...(d.movesets ?? [])].sort((a, b) => a.level - b.level).filter((s) => s.level <= level).pop();
  return (set?.moves ?? d.moves ?? []).slice(0, MAX_MOVES);
}
