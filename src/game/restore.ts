/**
 * What a consumable restores: a plain amount plus a percentage of the maximum, per gauge (10 + 30% max HP).
 * Old items saved with "Amounts are percentages of the maximum" read their numbers as percentages.
 */
import type { Gauge, ItemDef } from '../world/types';

type Restorer = Pick<ItemDef, 'restore' | 'restorePct' | 'restorePercent'>;
const GAUGES: Gauge[] = ['hp', 'mp', 'sp'];

/** The flat amount and the percentage for one gauge. */
export function restoreParts(d: Restorer, g: Gauge): { flat: number; pct: number } {
  if (d.restorePercent) return { flat: 0, pct: (d.restore?.[g] ?? 0) + (d.restorePct?.[g] ?? 0) };
  return { flat: d.restore?.[g] ?? 0, pct: d.restorePct?.[g] ?? 0 };
}

/** How much one gauge goes up, given its maximum. */
export function restoreAmount(d: Restorer, g: Gauge, max: number): number {
  const { flat, pct } = restoreParts(d, g);
  return flat + (max * pct) / 100;
}

export function restoresAny(d: Restorer, g?: Gauge): boolean {
  return (g ? [g] : GAUGES).some((k) => { const p = restoreParts(d, k); return p.flat > 0 || p.pct > 0; });
}

/** "+10 + 30% HP", "+30% MP", "+50 HP" for each gauge it restores. */
export function restoreBits(d: Restorer): string[] {
  return GAUGES.flatMap((g) => {
    const { flat, pct } = restoreParts(d, g);
    if (!flat && !pct) return [];
    return [`+${[flat ? String(flat) : '', pct ? `${pct}%` : ''].filter(Boolean).join(' + ')} ${g.toUpperCase()}`];
  });
}

/** Turn an old percentage item into amount + % (the editor does this when it opens one). */
export function upgradeRestore(d: Restorer): void {
  if (!d.restorePercent) return;
  const pct: Partial<Record<Gauge, number>> = { ...(d.restorePct ?? {}) };
  for (const g of GAUGES) if (d.restore?.[g]) pct[g] = (pct[g] ?? 0) + d.restore[g]!;
  d.restore = {};
  d.restorePct = Object.keys(pct).length ? pct : undefined;
  delete d.restorePercent;
}
