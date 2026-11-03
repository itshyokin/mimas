/**
 * Mimas: the GBA check. What a map uses that the ROM can't do yet (tools/gba_events.py leaves the same things out),
 * so nothing is dropped without you knowing. The GBA playtest runs Saturn's full systems, so it can do more.
 */
import type { Command, Condition, Database, EventPage, MapData } from '../world/types';
import { h, openModal } from './dom';

/** Commands the ROM runs (the rest are left out). */
const SUPPORTED = new Set(['text', 'choice', 'if', 'setSwitch', 'setVar', 'selfSwitch', 'giveItem', 'takeItem', 'gold', 'transfer', 'wait', 'fadeOut', 'fadeIn', 'battle',
  'party', 'learn', 'shop', 'save', 'gauge', 'fullRest', 'rest', 'heroClass']);
/** Commands that only change sound or the HD-2D look: skipped quietly. */
const QUIET = new Set(['sound', 'music', 'ambience', 'weather', 'console', 'tutorial', 'journalTab', 'heroWeather', 'temperature']);

export interface CheckLine { where: string; what: string; kind: 'left out' | 'stand-in' | 'later' }

function condProblem(c: Condition | undefined): string | null {
  if (!c) return null;
  if ('switch' in c || 'self' in c || 'var' in c || 'item' in c || 'gold' in c) return null;
  return `a “${Object.keys(c)[0]}” condition (treated as met)`;
}

function commands(list: Command[] | undefined, where: string, maps: (n: string) => MapData | undefined, out: CheckLine[]): void {
  for (const c of list ?? []) {
    if (c.cmd === 'choice') {
      if (c.options.length > 4) out.push({ where, what: `a choice with ${c.options.length} options (the GBA shows the first 4)`, kind: 'left out' });
      c.branches.forEach((b) => commands(b, where, maps, out));
    } else if (c.cmd === 'if') {
      const p = condProblem(c.condition);
      if (p) out.push({ where, what: `If with ${p}`, kind: 'left out' });
      commands(c.then, where, maps, out);
      commands(c.else, where, maps, out);
    } else if (c.cmd === 'transfer') {
      if (!maps(c.map)?.gba) out.push({ where, what: `a transfer to “${c.map}”, which isn’t a GBA map`, kind: 'left out' });
    } else if (c.cmd === 'battle') {
      if (c.map) out.push({ where, what: 'Start battle on a battle map: the GBA fights on its white screen', kind: 'stand-in' });
    } else if (!SUPPORTED.has(c.cmd) && !QUIET.has(c.cmd)) {
      out.push({ where, what: `the “${c.cmd}” command`, kind: 'left out' });
    }
  }
}

function pageLines(page: EventPage, where: string, maps: (n: string) => MapData | undefined, out: CheckLine[]): void {
  const p = condProblem(page.condition);
  if (p) out.push({ where, what: `page condition: ${p}`, kind: 'left out' });
  if (page.enemy) out.push({ where, what: 'an enemy walking the map: the GBA has random battles and Start battle, not roaming enemies', kind: 'left out' });
  if (page.character && !page.gbaSprite) out.push({ where, what: `Saturn character “${page.character}”: the player’s GBA sprite stands in until it has a GBA sprite`, kind: 'stand-in' });
  if (page.sprite && !page.gbaSprite && !page.character) out.push({ where, what: `object sprite “${page.sprite}”: the ROM uses its picture at GBA size (save the map so it's written; a GBA Studio sprite looks crisper)`, kind: 'stand-in' });
  if (page.breakable) out.push({ where, what: 'a breakable (no hitting things on the GBA)', kind: 'left out' });
  if (page.trigger === 'auto' && !page.commands.some((c) => c.cmd === 'selfSwitch' || c.cmd === 'setSwitch' || c.cmd === 'setVar' || c.cmd === 'transfer'))
    out.push({ where, what: 'an autorun page that never changes a switch, variable or map: it would run forever', kind: 'left out' });
  commands(page.commands, where, maps, out);
}

export function gbaCheck(m: MapData, mapName: string, db: Database, maps: (n: string) => MapData | undefined): CheckLine[] {
  const out: CheckLine[] = [];
  if (!m.gba) return [{ where: mapName, what: 'an old Saturn map: convert it (Map Properties) to put it in the ROM', kind: 'left out' }];
  for (const ev of m.events) ev.pages.forEach((pg, i) => pageLines(pg, `${ev.name} · page ${i + 1}`, maps, out));
  if (m.lights.length) out.push({ where: 'Map', what: `${m.lights.length} light(s): the GBA has no lighting`, kind: 'left out' });
  if (m.buildings?.length) out.push({ where: 'Map', what: 'Saturn houses: paint houses as GBA objects', kind: 'left out' });
  if (m.weather && (m.weather.amount ?? 1) > 0) out.push({ where: 'Map', what: 'weather (not on the GBA yet)', kind: 'later' });
  const zones = Object.values(m.zones ?? {});
  if (zones.some((z) => z.troops?.some((t) => t.time || t.days?.length || t.switch)))
    out.push({ where: 'Map', what: 'encounter troops only by day / night, on some weekdays or with a switch: the GBA uses every troop any time', kind: 'stand-in' });
  if (zones.some((z) => z.levels || z.troops?.some((t) => t.levels)))
    out.push({ where: 'Map', what: 'zone enemy levels: the GBA uses each enemy’s own level', kind: 'stand-in' });
  void db;
  return out;
}

export function openGbaCheck(m: MapData, mapName: string, db: Database, maps: (n: string) => MapData | undefined): void {
  // The same thing several times on one event page shows once, with how many.
  const counts = new Map<string, CheckLine & { n: number }>();
  for (const l of gbaCheck(m, mapName, db, maps)) {
    const k = `${l.kind}|${l.where}|${l.what}`;
    const have = counts.get(k);
    if (have) have.n++; else counts.set(k, { ...l, n: 1 });
  }
  const lines = [...counts.values()].map((l) => ({ ...l, what: l.n > 1 ? `${l.what} (×${l.n})` : l.what }));
  const body = h('div', { class: 'gba-check' },
    h('p', { class: 'hint' }, lines.length ? 'What this map uses that the GBA ROM can’t do yet. The GBA playtest runs Saturn’s full systems, so it may still work there.'
      : 'Everything on this map goes into the GBA ROM.'),
    ...(['left out', 'stand-in', 'later'] as const).map((kind) => {
      const ls = lines.filter((l) => l.kind === kind);
      if (!ls.length) return '';
      return h('div', {}, h('div', { class: 'section-label' }, kind === 'left out' ? 'Left out of the ROM' : kind === 'stand-in' ? 'Stand-ins' : 'Coming in a later update'),
        h('ul', { class: 'gba-check-list' }, ...ls.map((l) => h('li', {}, h('strong', {}, l.where), ' — ', l.what))));
    }));
  openModal(`GBA check: ${m.name || mapName}`, body, [{ label: 'Done', primary: true }]);
}
