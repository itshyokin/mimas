/**
 * Rough cost of a map's dynamic lights, used for the green-to-red budget bar in the editor and the game.
 * One unit is about one ordinary light. It warns; it never blocks.
 */
export interface LightCounts { point: number; spot: number; pointShadows: number; spotShadows: number; area: number }

/** Units a map can comfortably use, aimed at mid-range phones. */
export const LIGHT_CAPACITY = 12;

export function lightCost(c: LightCounts): number {
  // Point-light shadows render the scene six times; spot shadows once. Area lights are nearly free.
  return c.point + c.spot + c.pointShadows * 3 + c.spotShadows * 1 + c.area * 0.1;
}

export type BudgetLevel = 'ok' | 'busy' | 'over';

export function budgetLevel(load: number): BudgetLevel {
  return load < 0.6 ? 'ok' : load < 0.9 ? 'busy' : 'over';
}

export function describeCounts(c: LightCounts): string {
  const parts: string[] = [];
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (c.point) parts.push(plural(c.point, 'point light'));
  if (c.spot) parts.push(plural(c.spot, 'spotlight'));
  const sh = c.pointShadows + c.spotShadows;
  if (sh) parts.push(`${sh} with shadows`);
  if (c.area) parts.push(plural(c.area, 'area light'));
  return parts.length ? parts.join(' · ') : 'No dynamic lights';
}
