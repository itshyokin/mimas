/**
 * The Database's forms, laid out the same way everywhere: every on / off switch gathered at the top (grouped under the
 * section each came from), then the named sections, with a jump bar to go straight to one. Runs on a tab after it's
 * drawn, so each tab's own code stays as it is.
 */
import { h } from './dom';

/** Switches from these parts stay where they are (they belong to one row of a list, not to the whole entry). */
const KEEP = '.enemy-action, .db-table, .st-line, .drop-row, .add-strike, details';

export function organizeForm(content: HTMLElement): void {
  const form = content.querySelector<HTMLElement>('.items-layout .item-form') ?? content;
  const sections = [...form.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.matches('.db-section') && !!el.querySelector(':scope > h3'));
  if (!sections.length) return;
  const title = (sec: HTMLElement) => sec.querySelector(':scope > h3')?.textContent?.trim() ?? '';

  // The switches: straight inside a section (or one of its rows), not inside a list row.
  const groups: { name: string; checks: HTMLElement[] }[] = [];
  const loose = [...form.querySelectorAll<HTMLElement>(':scope > label.check, :scope > .field-row > label.check')];
  if (loose.length) groups.push({ name: 'General', checks: loose });
  for (const sec of sections) {
    const checks = [...sec.querySelectorAll<HTMLElement>(':scope > label.check, :scope > .field-row > label.check')].filter((c) => !c.closest(KEEP));
    if (checks.length) groups.push({ name: title(sec), checks });
  }
  const count = groups.reduce((n, g) => n + g.checks.length, 0);
  let switches: HTMLElement | null = null;
  if (count >= 2) {
    switches = h('section', { class: 'db-section db-switches' }, h('h3', {}, 'Switches'),
      ...groups.map((g) => {
        const rows = g.checks.map((c) => { const row = c.parentElement; c.remove(); if (row?.matches('.field-row') && !row.children.length) row.remove(); return c; });
        return h('div', { class: 'db-switch-group' }, groups.length > 1 ? h('span', { class: 'db-switch-from' }, g.name) : h('span'), h('div', { class: 'db-switch-list' }, ...rows));
      }));
    // A section left with only its heading goes.
    for (const sec of sections) if ([...sec.children].every((c) => c.matches('h3'))) sec.remove();
    form.insertBefore(switches, sections.find((s) => s.isConnected) ?? null);
  }

  // The jump bar: one button per section.
  const named = [switches, ...sections.filter((s) => s.isConnected)].filter((s): s is HTMLElement => !!s && !!title(s));
  if (named.length < 3) return;
  const bar = h('nav', { class: 'db-jump', 'aria-label': 'Jump to a section' },
    ...named.map((sec) => h('button', { type: 'button', class: 'db-jump-btn', onclick: () => sec.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, title(sec))));
  form.insertBefore(bar, form.firstChild);
}
