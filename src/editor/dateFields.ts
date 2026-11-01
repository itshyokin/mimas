/** A day of the year picker (month and day, no year) for the Date condition and props' Dates (Update 108). */
import { MONTH_NAMES, monthDay, parseMonthDay } from '../world/dates';
import { h, numberInput, select } from './dom';

export function monthDayInput(value: string, onchange: (v: string) => void, label: string): HTMLElement {
  const [mo0, d0] = parseMonthDay(value) ?? [10, 31];
  let mo = mo0, d = d0;
  const days = (m: number) => [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  const day = numberInput(d, (v) => { d = Math.max(1, Math.min(days(mo), Math.round(v))); day.value = String(d); onchange(monthDay(mo, d)); }, { step: 1, min: 1, max: 31, class: 'db-num', 'aria-label': `${label}: day` });
  const month = select(MONTH_NAMES.map((n, i) => [String(i + 1), n] as [string, string]), String(mo), (v) => { mo = +v; d = Math.min(d, days(mo)); day.value = String(d); onchange(monthDay(mo, d)); }, { 'aria-label': `${label}: month` });
  return h('span', { class: 'month-day' }, month, day);
}
