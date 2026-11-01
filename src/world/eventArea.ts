/**
 * Events can cover a rectangle of tiles (x, z is the top-left tile; w × h its size).
 * Stepping on, talking to or bumping into any of its tiles counts as that event.
 */
export interface EventRect { x: number; z: number; w?: number; h?: number }

export const eventW = (e: EventRect): number => Math.max(1, Math.round(e.w ?? 1));
export const eventH = (e: EventRect): number => Math.max(1, Math.round(e.h ?? 1));

/** Does the event cover tile (x, z)? */
export function eventCovers(e: EventRect, x: number, z: number): boolean {
  return x >= e.x && z >= e.z && x < e.x + eventW(e) && z < e.z + eventH(e);
}

/** Do two event rectangles share a tile? */
export function eventsOverlap(a: EventRect, b: EventRect): boolean {
  return a.x < b.x + eventW(b) && b.x < a.x + eventW(a) && a.z < b.z + eventH(b) && b.z < a.z + eventH(a);
}

/** The centre of the event's tile nearest to a point (where to walk to, what to face). */
export function nearestTileCentre(e: EventRect, px: number, pz: number): [number, number] {
  const tx = Math.min(e.x + eventW(e) - 1, Math.max(e.x, Math.floor(px)));
  const tz = Math.min(e.z + eventH(e) - 1, Math.max(e.z, Math.floor(pz)));
  return [tx + 0.5, tz + 0.5];
}
