/**
 * Calendar dates without a year (Update 108): "MM-DD", for the Date condition on event pages and for props that only
 * show on some days (Halloween pumpkins, winter lights). A range may wrap round the new year (12-20 to 01-05). The
 * player's real date counts (like the weekday and moon conditions). No three.js.
 */

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "MM-DD" → [month 1–12, day 1–31], or null. */
export function parseMonthDay(s: string | undefined): [number, number] | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec((s ?? '').trim());
  if (!m) return null;
  const mo = +m[1], d = +m[2];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? [mo, d] : null;
}

export const monthDay = (mo: number, d: number): string => `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Is `now` on `from` (or between `from` and `to`, both included; wrapping past December)? Unparseable: true. */
export function inDates(now: Date, from: string | undefined, to?: string): boolean {
  const a = parseMonthDay(from);
  if (!a) return true;
  const b = parseMonthDay(to) ?? a, k = (now.getMonth() + 1) * 100 + now.getDate(), ka = a[0] * 100 + a[1], kb = b[0] * 100 + b[1];
  return ka <= kb ? k >= ka && k <= kb : k >= ka || k <= kb;
}

/** "Oct 31" / "Oct 24 – Oct 31". */
export function datesLabel(from: string | undefined, to?: string): string {
  const one = (s: string | undefined) => { const p = parseMonthDay(s); return p ? `${MONTH_NAMES[p[0] - 1].slice(0, 3)} ${p[1]}` : '?'; };
  return to && to !== from ? `${one(from)} – ${one(to)}` : one(from);
}
