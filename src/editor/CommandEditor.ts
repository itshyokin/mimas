/**
 * Event command list: a readable outline of an event's commands (with nested branches)
 * and a form dialog for each command type.
 */
import { itemSections } from './itemSections';
import { findHorse, horseList, stars } from '../game/horses';
import type { EncounterPick } from '../world/types';
import { SELF_SWITCHES, type SelfSwitch, type LockLevel } from '../world/types';
import { LOCK_COLORS, LOCK_LEVELS, LOCK_NAMES } from '../ui/LockpickScreen';
import { WEEKDAYS } from '../world/seasons';
import { MOON_NAMES, MOON_PHASES, moonPhase } from '../world/moon';
import { ABILITIES, WEATHER_KINDS, type WeatherKind, type Ailment, type Ability, type Command, type Database, type Condition, type Gauge, type QuestDef, type QuestOp, type QuestStatus } from '../world/types';
import { AILMENTS, AILMENT_INFO } from '../game/status';
import { checkbox, field, h, numberInput, openModal, select, textInput } from './dom';
import { monthDayInput } from './dateFields';
import { datesLabel } from '../world/dates';
import { transferFields, transferSummary } from './TransferPicker';
import { AMBIENCE_NAMES, MUSIC_NAMES, SFX_LABELS, SFX_NAMES } from '../audio/synth';
import { loopChoices } from '../audio/sfx';
import { initSwitches, switchInput } from './switchPicker';
import { additionList, classList, findAddition, findClass, findSpell, rankName, spellList, spellMaxRank } from '../game/abilities';
import type { EditorStore } from './store';
import { applyLook, messageStyles, parseRich, richHTML, setTextColors, textColors, type TextLook } from '../ui/richText';

type Cmd = Command['cmd'];

/** A lock's settings (Update 119): how hard it is to pick, and the key that opens it. Also used by the Inspector. */
export function lockFields(store: EditorStore, d: { level: LockLevel; key?: string; switch?: string }, edit: (f: () => void) => void = (f) => f()): HTMLElement[] {
  const opt = (l: LockLevel) => { const o = h('option', { value: l }, LOCK_NAMES[l]) as HTMLOptionElement; o.style.color = LOCK_COLORS[l]; return o; };
  const sel = h('select', {}, ...LOCK_LEVELS.map(opt)) as HTMLSelectElement;
  sel.value = d.level;
  const paint = () => { sel.style.color = LOCK_COLORS[d.level]; sel.style.borderColor = LOCK_COLORS[d.level]; };
  paint();
  sel.addEventListener('change', () => edit(() => { d.level = sel.value as LockLevel; paint(); }));
  return [field('Difficulty', sel),
    field('Key (optional)', select([['', 'No key'], ...(store.db.items ?? []).filter((x) => x.kind === 'key').map((x) => [x.id, x.name] as [string, string])], d.key ?? '', (v) => edit(() => { if (v) d.key = v; else delete d.key; }))),
    h('p', { class: 'hint' }, 'Until it’s open, the event stops here. The player picks it (the easier, the wider the sweet spot), or carries its key or a Skeleton Key. “Cannot be picked” only opens with the key (or a Skeleton Key). Once open it stays open. Lockpick items (Database → Items) are used up when picks snap; with none in the game, picking is free.')];
}

const COMMAND_TYPES: [Cmd, string][] = [
  ['text', 'Show text'], ['choice', 'Show choices'], ['if', 'Conditional branch'],
  ['setSwitch', 'Set switch'], ['selfSwitch', 'Set self switch'], ['setVar', 'Set variable'], ['wait', 'Wait'],
  ['fadeOut', 'Fade out'], ['fadeIn', 'Fade in'], ['setTime', 'Set time of day'], ['sleep', 'Sleep (sky transition)'], ['ability', 'Change ability'], ['fieldWeapons', 'Enable / disable overworld weapons'], ['enemyLevels', 'Enemy levels (as set / near the party)'], ['achievement', 'Unlock achievement'], ['tutorial', 'Show tutorial'], ['console', 'Run console command'], ['gauge', 'Change health / magic / stamina'], ['ailment', 'Give / cure an ailment'], ['fullRest', 'Full rest (restore the party)'], ['rest', 'Rest point (pick hours, camping supplies)'], ['goodState', 'Give buff (Rested / Well Rested)'], ['heroWeather', 'Set weather state (wet, cold…)'], ['tendFire', 'Tend the fire (add fuel)'], ['transfer', 'Transfer player'], ['save', 'Open save screen'], ['lock', 'Lock (pick it, or a key)'], ['groupChatter', 'Group chatter at next camp'], ['relation', 'Change relationship'], ['journalTab', 'Show / hide a Journal tab'],
  ['giveItem', 'Give item'], ['takeItem', 'Take item'], ['gold', 'Change gold'], ['shop', 'Open shop'], ['stable', 'Stable (rent a horse)'], ['roost', 'Griffin roost (fly)'], ['horse', 'Horse: rent / send home / get on / off'],
  ['sound', 'Play sound effect'], ['music', 'Change music'], ['ambience', 'Change background sound'], ['weather', 'Change weather'], ['temperature', 'Change temperature'], ['skillPoints', 'Give skill points'], ['statRank', 'Change stat growth rank'], ['party', 'Change party'],
  ['quest', 'Quest'],
  ['battle', 'Start battle'], ['learn', 'Teach spell / Addition'], ['heroClass', 'Change class'],
];

const CATEGORY: Record<Cmd, string> = {
  text: 'msg', choice: 'msg', if: 'flow', setSwitch: 'state', selfSwitch: 'state', setVar: 'state', wait: 'flow', fadeOut: 'screen', fadeIn: 'screen', setTime: 'screen', sleep: 'screen', ability: 'state', fieldWeapons: 'state', enemyLevels: 'state', achievement: 'quest', tutorial: 'msg', console: 'flow', gauge: 'state', ailment: 'state', fullRest: 'state', rest: 'state', goodState: 'state', heroWeather: 'state', tendFire: 'item', transfer: 'screen', save: 'screen', lock: 'flow', groupChatter: 'msg', relation: 'state', journalTab: 'screen',
  giveItem: 'item', takeItem: 'item', gold: 'item', shop: 'item', stable: 'item', roost: 'item', horse: 'item',
  sound: 'screen', music: 'screen', ambience: 'screen', weather: 'screen', temperature: 'screen', party: 'state', skillPoints: 'state', statRank: 'state', quest: 'quest',
  battle: 'flow', learn: 'state', heroClass: 'state',
};

function defaultCommand(cmd: Cmd): Command {
  switch (cmd) {
    case 'text': return { cmd, text: '' };
    case 'choice': return { cmd, options: ['Yes', 'No'], branches: [[], []], cancel: 1 };
    case 'if': return { cmd, condition: { switch: '', is: true }, then: [], else: [] };
    case 'setSwitch': return { cmd, switch: '', value: true };
    case 'selfSwitch': return { cmd, letter: 'A', value: true };
    case 'setVar': return { cmd, var: '', op: 'set', value: 0 };
    case 'wait': return { cmd, seconds: 0.5 };
    case 'fadeOut': return { cmd, seconds: 1 };
    case 'fadeIn': return { cmd, seconds: 1 };
    case 'setTime': return { cmd, hour: 8, instant: true };
    case 'sleep': return { cmd, until: 'morning', rest: true };
    case 'ability': return { cmd, ability: 'climb', on: true };
    case 'gauge': return { cmd, gauge: 'hp', op: 'fill', value: 0 };
    case 'ailment': return { cmd, op: 'give', ailment: 'poison' };
    case 'fullRest': return { cmd };
    case 'rest': return { cmd };
    case 'lock': return { cmd, level: 'easy' };
    case 'groupChatter': return { cmd, id: '' };
    case 'journalTab': return { cmd, tab: 'bestiary', show: true };
    case 'relation': return { cmd, a: dbNow?.().heroes?.[1]?.id ?? '', b: '', op: 'add', value: 5 };
    case 'goodState': return { cmd, hero: 'all', kind: 'wellRested' };
    case 'heroWeather': return { cmd, hero: 'all', state: 'wet' };
    case 'tendFire': return { cmd };
    case 'transfer': return { cmd, map: '', x: 0, z: 0 };
    case 'save': return { cmd };
    case 'giveItem': return { cmd, item: '', count: 1 };
    case 'takeItem': return { cmd, item: '', count: 1 };
    case 'gold': return { cmd, op: 'add', value: 10 };
    case 'shop': return { cmd, goods: [], canSell: true };
    case 'stable': return { cmd };
    case 'roost': return { cmd, id: 'roost', name: 'Roost' };
    case 'horse': return { cmd, op: 'rent', free: true };
    case 'sound': return { cmd, sound: 'item' };
    case 'music': return { cmd, music: 'builtin:field', fade: 1.5 };
    case 'ambience': return { cmd, ambience: 'builtin:wind' };
    case 'weather': return { cmd, kind: 'rain', amount: 1 };
    case 'temperature': return { cmd, op: 'add', value: 20 };
    case 'party': return { cmd, op: 'add', hero: heroList()[0]?.[0] ?? '' };
    case 'skillPoints': return { cmd, value: 1 };
    case 'statRank': return { cmd, hero: '', stat: 'def', rank: 'A' };
    case 'fieldWeapons': return { cmd, on: false };
    case 'enemyLevels': return { cmd, mode: 'party', spread: 2 };
    case 'achievement': return { cmd, id: dbNow?.().achievements?.[0]?.id ?? '' };
    case 'tutorial': return { cmd, id: dbNow?.().tutorials?.[0]?.id ?? '' };
    case 'console': return { cmd, line: 'heal' };
    case 'quest': return { cmd, quest: questDefs()[0]?.id ?? '', op: 'start' };
    case 'battle': return { cmd, enemies: dbNow ? (dbNow().enemies ?? []).slice(0, 1).map((e) => e.id) : [] };
    case 'learn': return { cmd, who: '', spell: dbNow ? spellList(dbNow())[0]?.id : undefined, rank: 1 };
    case 'heroClass': return { cmd, who: '', op: 'change', cls: dbNow ? classList(dbNow())[0]?.id ?? '' : '' };
  }
}

/** The database being edited (for names in summaries and lists of enemies, spells, Additions and classes). */
let dbNow: (() => Database) | null = null;
const whoName = (who: string): string => (!who ? 'The hero' : who === '@party' ? 'The whole party' : (dbNow?.().heroes ?? []).find((x) => x.id === who)?.name ?? who);

/** Heroes who can join (all but the first), for the party command (set by the editor that owns the database). */
let heroList: () => [string, string][] = () => [];
export function setHeroLookup(fn: () => [string, string][]): void { heroList = fn; }

/** Who a hero command is for: '' the hero you play, 'all' everyone, or a hero's id. */
const heroWhoName = (who: string | undefined): string => (!who ? 'The hero' : who === 'all' ? 'Everyone' : who === 'any' ? 'Anyone in the party' : (dbNow?.().heroes ?? []).find((x) => x.id === who)?.name ?? who);
const heroWhoChoices = (everyone: 'all' | 'any'): [string, string][] => [['', 'The hero you play'], [everyone, everyone === 'all' ? 'Everyone in the party' : 'Anyone in the party'], ...(dbNow?.().heroes ?? []).slice(1).map((x) => [x.id, x.name] as [string, string])];
const HERO_WEATHER: [string, string][] = [['normal', 'Normal (warm and dry)'], ['wet', 'Wet'], ['cold', 'Cold'], ['freezing', 'Freezing'], ['hot', 'Hot'], ['overheating', 'Overheating']];
const HERO_STATES: [string, string][] = [['comfortable', 'Comfortable'], ['wet', 'Wet'], ['cold', 'Cold'], ['freezing', 'Freezing'], ['hot', 'Hot'], ['overheating', 'Overheating'],
  ['ailment', 'Any ailment'], ...AILMENTS.filter((a) => a !== 'chill' && a !== 'stagger').map((a) => [a, AILMENT_INFO[a].name] as [string, string]),
  ['good', 'Any good state'], ['rested', 'Rested'], ['wellRested', 'Well Rested']];

/** Item names for summaries (set by the editor that owns the database). */
let itemNames: (id: string) => string = (id) => id;
export function setItemNameLookup(fn: (id: string) => string): void { itemNames = fn; }
const itemName = (id: string) => (id ? itemNames(id) : '(no item)');

/** Item choices for a select, keeping an unknown current value visible. */
function itemChoices(store: EditorStore, current: string): [string, string][] {
  const out: [string, string][] = (store.db.items ?? []).map((d) => [d.id, d.name]);
  if (!out.length) out.push(['', '(no items yet: add some in Database → Items)']);
  else if (!current) out.unshift(['', 'Choose an item…']);
  if (current && !out.some(([id]) => id === current)) out.unshift([current, `${current} (missing)`]);
  return out;
}

const STAT_NAMES: Record<'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf', string> = { str: 'Strength', dex: 'Dexterity', agi: 'Agility', end: 'Endurance', def: 'Defence', mag: 'Magic', mdf: 'Magic Defence' };
export const WEATHER_NAMES: Record<WeatherKind, string> = { none: 'Clear', rain: 'Rain', storm: 'Thunderstorm', snow: 'Snow', blizzard: 'Blizzard', haze: 'Haze', sandstorm: 'Sandstorm', pollen: 'Pollen', dust: 'Dust motes', leaves: 'Falling leaves' };
export const GAUGE_NAMES: Record<Gauge, string> = { hp: 'Health', mp: 'Magic', sp: 'Stamina' };
export const ABILITY_NAMES: Record<Ability, string> = { run: 'Run', jump: 'Jump', climb: 'Climb', crawl: 'Crawl' };

const hourLabel = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Quests in the database (set by the editor that owns it). */
let questDefs: () => QuestDef[] = () => [];
export function setQuestLookup(fn: () => QuestDef[]): void { questDefs = fn; }
/** The quests in the database being edited (for pickers elsewhere). */
export const questList = (): QuestDef[] => questDefs();
const questName = (id: string) => (id ? questDefs().find((q) => q.id === id)?.name ?? `${id} (missing)` : '(no quest)');
const objectiveName = (quest: string, id: string | undefined) => {
  const o = questDefs().find((q) => q.id === quest)?.objectives.find((x) => x.id === id);
  return o ? `“${o.text}”` : id ? `${id} (missing)` : '(no objective)';
};
export const QUEST_STATUS_NAMES: [QuestStatus | 'started', string][] = [
  ['inactive', 'Not started'], ['started', 'Started (in progress or ready)'], ['active', 'In progress'], ['ready', 'Ready to hand in'], ['done', 'Completed'], ['failed', 'Failed']];
const QUEST_OPS: [QuestOp, string][] = [['start', 'Start the quest'], ['objective', 'Complete an objective (or count it up)'], ['complete', 'Complete the quest (gives the rewards)'], ['fail', 'Fail the quest'], ['reset', 'Forget it (back to not started)']];

/** Quest choices for a select, keeping an unknown current value visible. */
function questChoices(current: string): [string, string][] {
  const out: [string, string][] = questDefs().map((q) => [q.id, q.name]);
  if (!out.length) out.push(['', '(no quests yet: add some in Database → Quests)']);
  if (current && !out.some(([id]) => id === current)) out.unshift([current, `${current} (missing)`]);
  return out;
}
function objectiveChoices(quest: string, current: string | undefined): [string, string][] {
  const out: [string, string][] = (questDefs().find((q) => q.id === quest)?.objectives ?? []).map((o) => [o.id, o.text || o.id]);
  if (!out.length) out.push(['', '(this quest has no objectives)']);
  if (current && !out.some(([id]) => id === current)) out.unshift([current, `${current} (missing)`]);
  return out;
}

export function conditionText(c: Condition): string {
  if ('quest' in c) {
    if ('objective' in c) return `${questName(c.quest)}: ${objectiveName(c.quest, c.objective)} ${c.done === false ? 'not done' : 'done'}`;
    return `quest ${questName(c.quest)} is ${QUEST_STATUS_NAMES.find(([k]) => k === c.is)?.[1].toLowerCase() ?? c.is}`;
  }
  if ('switch' in c) return `switch ${c.switch || '(unnamed)'} is ${c.is === false ? 'OFF' : 'ON'}`;
  if ('self' in c) return `self switch ${c.self} is ${c.is === false ? 'OFF' : 'ON'}`;
  if ('item' in c) return `has ${(c.count ?? 1) > 1 ? `${c.count} × ` : ''}${itemName(c.item)}`;
  if ('gold' in c) return `gold ≥ ${c.gold}`;
  if ('moon' in c) return `the moon is ${c.moon.length ? c.moon.map((m) => MOON_NAMES[m].toLowerCase()).join(' or ') : '(no phase picked)'} (real world)`;
  if ('temp' in c) return `it's ${c.op === '<=' ? 'at most' : 'at least'} ${c.temp}°F here`;
  if ('weather' in c) return `the weather is ${c.weather.length ? c.weather.map((k) => WEATHER_NAMES[k].toLowerCase()).join(' or ') : '(none picked)'}`;
  if ('date' in c) return `it's ${datesLabel(c.date, c.until)} (real world)`;
  if ('heroHas' in c) return `${heroWhoName(c.hero)} ${c.is === false ? 'is not' : c.hero === 'any' ? 'is' : 'is'} ${(HERO_STATES.find(([k]) => k === c.heroHas)?.[1] ?? c.heroHas).toLowerCase()}`;
  if ('weekday' in c) return `it's ${c.weekday.length ? c.weekday.map((d) => WEEKDAYS[d]).join(' or ') : '(no day picked)'} (real world)`;
  if ('rpDate' in c) return `today is ${relHeroName(c.hero)}’s ${dbNow?.().roleplay?.find((f) => f.id === c.rpDate)?.title ?? c.rpDate}${c.within ? ` (or within ${c.within} day${c.within === 1 ? '' : 's'})` : ''}`;
  if ('rp' in c) return `${relHeroName(c.hero)}’s ${dbNow?.().roleplay?.find((f) => f.id === c.rp)?.title ?? c.rp} is “${c.is}”`;
  if ('relation' in c) return `${relHeroName(c.relation)} rates ${relHeroName(c.of)} ${c.op === '<=' ? 'at most' : 'at least'} ${c.value}`;
  return `variable ${c.var || '(unnamed)'} ${c.op} ${c.value}`;
}

/** Relationships (Update 124): hero names and choices. */
/** The Journal's tabs by name (Update 130). */
export const JOURNAL_TAB_NAMES: Record<string, string> = { quests: 'Quests', log: 'Adventure Log', bestiary: 'Bestiary', types: 'Type Chart', tutorials: 'Tutorials', records: 'Records', achievements: 'Achievements' };
const relHeroName = (id: string): string => (!id ? 'the hero you play' : dbNow?.().heroes?.find((x) => x.id === id)?.name ?? id);
const relRaters = (): [string, string][] => (dbNow?.().heroes ?? []).slice(1).map((x) => [x.id, x.name] as [string, string]);
const relTargets = (): [string, string][] => [['', 'The hero you play'], ...relRaters()];

function summary(c: Command): string {
  switch (c.cmd) {
    case 'text': {
      const first = c.text.split('\n')[0] || '(empty)';
      const st = c.style ? messageStyles(dbNow?.().messageStyles).find((x) => x.id === c.style)?.name.replace(/ \(.*\)$/, '') : '';
      return `${st ? `[${st}] ` : ''}${c.speaker ? c.speaker + ': ' : ''}${first}${c.text.includes('\n') ? ' …' : ''}`;
    }
    case 'choice': return c.options.join(' / ');
    case 'if': return conditionText(c.condition);
    case 'setSwitch': return `${c.switch || '(unnamed)'} = ${c.value ? 'ON' : 'OFF'}`;
    case 'selfSwitch': return `Self switch ${c.letter} = ${c.value ? 'ON' : 'OFF'}`;
    case 'setVar': return `${c.var || '(unnamed)'} ${c.op === 'add' ? (c.value < 0 ? '−=' : '+=') : '='} ${c.op === 'add' ? Math.abs(c.value) : c.value}`;
    case 'wait': return `${c.seconds} s`;
    case 'fadeOut': case 'fadeIn': return `${c.seconds ?? 0.8} s`;
    case 'setTime': return `${hourLabel(c.hour)}${c.instant ? ', instantly' : ''}`;
    case 'sleep': return `${c.until === 'night' ? 'Until night (21:00)' : c.until === 'hours' ? `For ${c.hours ?? 8} hours` : 'Until morning (7:00)'}${c.rest ? ', and rest' : ''}${c.inn ? ' (inn: Well Rested)' : ''}`;
    case 'ability': return `${ABILITY_NAMES[c.ability]}: ${c.on ? 'learn (on)' : 'lose (off)'}`;
    case 'transfer': return transferSummary(c);
    case 'save': return 'Let the player save (a save point)';
    case 'journalTab': return `Journal: ${c.show ? 'show' : 'hide'} the ${JOURNAL_TAB_NAMES[c.tab] ?? c.tab} tab`;
    case 'relation': return `${relHeroName(c.a)}’s view of ${relHeroName(c.b)}: ${c.op === 'set' ? `set to ${c.value}` : `${c.value >= 0 ? '+' : ''}${c.value}`}${c.both ? ' (both ways)' : ''}`;
    case 'groupChatter': return `Group chatter at the next camp: ${c.id || '(none picked)'}`;
    case 'lock': return `Lock: ${LOCK_NAMES[c.level]}${c.key ? ` · key: ${c.key}` : ''}`;
    case 'fullRest': return 'Health, magic and stamina to full; ailments cured';
    case 'rest': return `Pick hours to rest${c.noSupplies ? '' : ', then camping supplies'}${c.noRespawn ? '' : '; sets the respawn point'}`;
    case 'goodState': return `${heroWhoName(c.hero)}: ${c.kind === 'none' ? 'no good state' : `${c.kind === 'rested' ? 'Rested' : 'Well Rested'}${c.hours || c.minutes ? ` for ${c.hours ? `${c.hours} h` : ''}${c.hours && c.minutes ? ' ' : ''}${c.minutes ? `${c.minutes} m` : ''}` : ''}`}`;
    case 'heroWeather': return `${heroWhoName(c.hero)}: ${HERO_WEATHER.find(([k]) => k === c.state)?.[1] ?? c.state}`;
    case 'tendFire': return 'Open the nearest fire’s fuel menu';
    case 'ailment': return `${c.hero ? `${heroWhoName(c.hero)}: ` : ''}${c.op === 'give' ? 'Give' : 'Cure'} ${c.ailment === 'all' ? 'all ailments' : AILMENT_INFO[c.ailment].name}`;
    case 'gauge': return `${GAUGE_NAMES[c.gauge]} ${c.op === 'fill' ? 'to full' : c.op === 'set' ? `= ${c.value}` : c.value < 0 ? `− ${-c.value}` : `+ ${c.value}`}`;
    case 'giveItem': return `${c.count} × ${itemName(c.item)}${c.silent ? ' (quietly)' : ''}`;
    case 'takeItem': return `${c.count} × ${itemName(c.item)}`;
    case 'gold': return c.op === 'set' ? `= ${c.value} G` : c.value < 0 ? `− ${-c.value} G` : `+ ${c.value} G`;
    case 'sound': return soundName(c.sound);
    case 'music': return c.music === undefined ? 'Back to the map’s music' : c.music ? loopName(c.music) : 'Stop the music';
    case 'ambience': return c.ambience === undefined ? 'Back to the map’s sound' : c.ambience ? loopName(c.ambience) : 'Silence';
    case 'statRank': return `${c.hero === 'all' ? 'Everyone' : c.hero ? heroList().find(([id]) => id === c.hero)?.[1] ?? c.hero : 'The hero'}: ${STAT_NAMES[c.stat]} grows at Rank ${c.rank}`;
    case 'temperature': return c.op === 'reset' ? 'Back to normal' : c.op === 'set' ? `${c.value ?? 70}°F on this map` : `${(c.value ?? 0) >= 0 ? '+' : ''}${c.value ?? 0}°F on this map`;
    case 'weather': return `${c.kind === 'none' ? 'Clear skies' : `${WEATHER_NAMES[c.kind]}${c.amount !== undefined && c.amount !== 1 ? ` × ${c.amount}` : ''}`}${c.wind !== undefined ? `, wind ${c.wind}` : ''}${c.scope === 'world' ? ' (shared outdoor weather)' : ''}`;
    case 'party': return `${heroList().find(([id]) => id === c.hero)?.[1] ?? (c.hero || '(no hero)')} ${c.op === 'add' ? 'joins' : 'leaves'}${c.quiet ? ' (quietly)' : ''}`;
    case 'skillPoints': return `+${c.value} ${c.party ? 'party' : 'skill'} point${c.value === 1 ? '' : 's'}`;
    case 'fieldWeapons': return c.on ? 'Overworld weapons: enabled' : 'Overworld weapons: disabled';
    case 'enemyLevels': return c.mode === 'party' ? `Enemy levels: near the party’s (±${c.spread ?? 2})` : 'Enemy levels: as set on the map';
    case 'tutorial': return dbNow?.().tutorials?.find((t) => t.id === c.id)?.title ?? (c.id || '(none chosen)');
    case 'achievement': return `Unlock: ${dbNow?.().achievements?.find((a) => a.id === c.id)?.name ?? (c.id || '(none chosen)')}`;
    case 'console': return `> ${c.line}`;
    case 'battle': {
      const names = c.enemies.map((id) => (dbNow?.().enemies ?? []).find((e) => e.id === id)?.name ?? id);
      return `Battle: ${names.join(', ') || '(no enemies)'}${c.map ? ` on ${c.map}` : ''}${c.canRun ? '' : ' · no running'}${c.lose === 'continue' ? ' · may lose' : ''}${c.resultVar ? ` → ${c.resultVar}` : ''}`;
    }
    case 'learn': {
      const db = dbNow?.(), sp = db ? findSpell(db, c.spell) : undefined, ad = db ? findAddition(db, c.addition) : undefined;
      return `${whoName(c.who)} learns ${[sp ? rankName(sp.name, c.rank ?? 1) : '', ad ? ad.name : ''].filter(Boolean).join(' and ') || '(nothing)'}`;
    }
    case 'heroClass': {
      const cl = dbNow ? findClass(dbNow(), c.cls) : undefined;
      return `${whoName(c.who)}: ${c.op === 'change' ? 'becomes' : 'may become'} ${cl?.name ?? (c.cls || '(no class)')}`;
    }
    case 'quest': {
      const q = questName(c.quest);
      if (c.op === 'objective') return `${q}: ${objectiveName(c.quest, c.objective)}${c.add !== undefined ? ` ${c.add < 0 ? '−' : '+'}${Math.abs(c.add)}` : ' done'}`;
      return `${{ start: 'Start', complete: 'Complete', fail: 'Fail', reset: 'Forget', objective: '' }[c.op]} ${q}`;
    }
    case 'roost': return `Griffin roost: ${c.name || c.id}${c.unlockOnly ? ' (unlock only)' : ''}`;
    case 'stable': return `${c.name || 'Stable'}: ${c.horses?.length ? c.horses.map((id) => (dbNow ? findHorse(dbNow(), id)?.name : undefined) ?? id).join(', ') : 'every horse'}`;
    case 'horse': return c.op === 'rent' ? `Rent ${(dbNow ? findHorse(dbNow(), c.id)?.name : undefined) ?? 'a horse'}${c.free ? ' (free)' : ''}` : c.op === 'home' ? 'Send the horse home' : c.op === 'mount' ? 'Get on the horse' : 'Get off the horse';
    case 'shop': return `${c.name || 'Shop'}: ${c.goods.length ? c.goods.map((g) => itemName(g.item)).join(', ') : 'nothing for sale'}${c.canSell === false ? ' (no selling)' : ''}`;
  }
}
const label = (cmd: Cmd) => COMMAND_TYPES.find(([c]) => c === cmd)![1];

/* ------------------------------------------------------------ list */

/** Copied commands (shared by every event, so they can be pasted into another one). */
let clipboard: Command[] = [];

export class CommandEditor {
  /**
   * `standalone` (Update 131): a list outside the map (Database → Global events) edited in a working copy: no undo
   * through the store; changes redraw the list and call `onChange`.
   */
  constructor(private readonly store: EditorStore, private readonly standalone?: { onChange?: () => void }) {
    setItemNameLookup((id) => store.db.items?.find((d) => d.id === id)?.name ?? `${id} (missing)`);
    setConditionItems(() => (store.db.items ?? []).map((d) => [d.id, d.name] as [string, string]));
    initSwitches(store);
    setQuestLookup(() => store.db.quests ?? []);
    setHeroLookup(() => (store.db.heroes ?? []).slice(1).map((h) => [h.id, h.name] as [string, string]));
    dbNow = () => store.db;
  }

  /** The highlighted command: the list it's in and where. */
  private sel: { list: Command[]; i: number } | null = null;
  /** The list and element being shown (to redraw after a highlight or move). */
  private root: { el: HTMLElement; list: Command[] } | null = null;
  private drag: { list: Command[]; i: number } | null = null;

  /**
   * Build the outline for a command list. Click highlights a command, double-click edits it. With one highlighted:
   * ↑ ↓ pick another, Alt+↑ / Alt+↓ (or the arrows beside it, or dragging) move it, Ctrl+C / Ctrl+X / Ctrl+V copy,
   * cut and paste (below it), Ctrl+D duplicates, Delete removes, Enter edits. Changes go through the store (undoable).
   */
  render(list: Command[]): HTMLElement {
    if (this.root?.list !== list) this.sel = null;
    if (this.sel && !this.contains(list, this.sel.list)) this.sel = null;
    const focused = !!this.root?.el.contains(document.activeElement);
    const el = h('div', { class: 'commands', tabindex: '0', 'aria-label': 'Commands' });
    el.addEventListener('keydown', (e) => this.key(e));
    this.root = { el, list };
    // Rebuilt after a change: keep the keyboard on the list.
    if (focused) queueMicrotask(() => el.focus({ preventScroll: true }));
    this.draw();
    return el;
  }

  /** Redraw in place (a highlight, a move), keeping the scroll position and focus. */
  private draw(): void {
    const r = this.root;
    if (!r) return;
    const scroller = r.el.closest('.ev-commands, .side-body') as HTMLElement | null, top = scroller?.scrollTop ?? 0;
    r.el.replaceChildren(this.toolbar(), this.list(r.list, 0));
    if (scroller) scroller.scrollTop = top;
  }

  private contains(list: Command[], target: Command[]): boolean {
    if (list === target) return true;
    for (const c of list) {
      if (c.cmd === 'choice' && c.branches.some((b) => this.contains(b, target))) return true;
      if (c.cmd === 'if' && (this.contains(c.then, target) || (c.else && this.contains(c.else, target)))) return true;
    }
    return false;
  }

  private cp(): void { if (!this.standalone) this.store.checkpoint(); }
  private dropCp(): void { if (!this.standalone) this.store.dropCheckpoint(); }
  private done(): void {
    if (!this.standalone) { this.store.changed('structure'); return; }
    this.draw();
    this.standalone.onChange?.();
  }

  private change(fn: () => void): void {
    this.cp();
    fn();
    this.done();
  }

  private toolbar(): HTMLElement {
    const sel = this.sel, has = !!sel && !!sel.list[sel.i];
    const b = (text: string, title: string, fn: () => void, on: boolean) =>
      h('button', { type: 'button', class: 'btn small', title, disabled: !on, onclick: (e: Event) => { e.stopPropagation(); fn(); } }, text);
    return h('div', { class: 'cmd-toolbar' },
      b('↑', 'Move up (Alt+↑)', () => this.move(-1), has && sel!.i > 0),
      b('↓', 'Move down (Alt+↓)', () => this.move(1), has && sel!.i < sel!.list.length - 1),
      b('Edit', 'Edit (Enter or double-click)', () => this.edit(sel!.list[sel!.i], sel!.list, false), has),
      b('Copy', 'Copy (Ctrl+C)', () => this.copy(), has),
      b('Cut', 'Cut (Ctrl+X)', () => { this.copy(); this.remove(); }, has),
      b('Paste', clipboard.length ? `Paste ${clipboard.length === 1 ? label(clipboard[0].cmd) : `${clipboard.length} commands`} (Ctrl+V)` : 'Nothing copied yet', () => this.paste(), clipboard.length > 0),
      b('Delete', 'Delete (Del)', () => this.remove(), has));
  }

  private select(list: Command[], i: number): void {
    this.sel = { list, i };
    this.draw();
    this.root?.el.focus({ preventScroll: true });
  }

  private move(d: number): void {
    const s = this.sel;
    if (!s || !s.list[s.i + d] || !s.list[s.i]) return;
    this.change(() => { [s.list[s.i + d], s.list[s.i]] = [s.list[s.i], s.list[s.i + d]]; });
    this.sel = { list: s.list, i: s.i + d };
    this.draw();
  }

  private copy(): void {
    const s = this.sel;
    if (!s?.list[s.i]) return;
    clipboard = [JSON.parse(JSON.stringify(s.list[s.i])) as Command];
    this.draw();
  }

  private paste(): void {
    if (!clipboard.length) return;
    const s = this.sel, list = s?.list ?? this.root?.list;
    if (!list) return;
    const at = s ? s.i + 1 : list.length;
    this.change(() => list.splice(at, 0, ...(JSON.parse(JSON.stringify(clipboard)) as Command[])));
    this.sel = { list, i: at + clipboard.length - 1 };
    this.draw();
  }

  private remove(): void {
    const s = this.sel;
    if (!s?.list[s.i]) return;
    this.change(() => s.list.splice(s.i, 1));
    this.sel = s.list.length ? { list: s.list, i: Math.min(s.i, s.list.length - 1) } : null;
    this.draw();
  }

  private key(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey, s = this.sel;
    let done = true;
    if (this.standalone && mod && 'zy'.includes(e.key.toLowerCase())) return;
    if (mod && e.key.toLowerCase() === 'z') { if (e.shiftKey) this.store.redo(); else this.store.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') this.store.redo();
    else if (mod && e.key.toLowerCase() === 'c') this.copy();
    else if (mod && e.key.toLowerCase() === 'x') { this.copy(); this.remove(); }
    else if (mod && e.key.toLowerCase() === 'v') this.paste();
    else if (mod && e.key.toLowerCase() === 'd' && s?.list[s.i]) { this.change(() => s.list.splice(s.i + 1, 0, JSON.parse(JSON.stringify(s.list[s.i])) as Command)); this.select(s.list, s.i + 1); }
    else if (e.altKey && e.key === 'ArrowUp') this.move(-1);
    else if (e.altKey && e.key === 'ArrowDown') this.move(1);
    else if (e.key === 'ArrowUp' && s && s.i > 0) this.select(s.list, s.i - 1);
    else if (e.key === 'ArrowDown' && s && s.i < s.list.length - 1) this.select(s.list, s.i + 1);
    else if (e.key === 'Delete' && s) this.remove();
    else if (e.key === 'Enter' && s?.list[s.i]) this.edit(s.list[s.i], s.list, false);
    else if (e.key === 'Escape' && s) { this.sel = null; this.draw(); }
    else done = false;
    if (done) { e.preventDefault(); e.stopPropagation(); }
    // Keep the map's own shortcuts (copy an event, undo…) from also acting on these keys.
    else if (mod) e.stopPropagation();
  }

  private list(list: Command[], depth: number): HTMLElement {
    const rows = list.map((c, i) => this.row(list, c, i, depth));
    const add = select([['', '+ Add command…'], ...COMMAND_TYPES], '', (v) => {
      if (!v) return;
      const cmd = defaultCommand(v as Cmd);
      this.cp();
      // Added under the highlighted command when it's in this list, otherwise at the end.
      const at = this.sel?.list === list ? this.sel.i + 1 : list.length;
      list.splice(at, 0, cmd);
      this.sel = { list, i: at };
      this.done();
      this.edit(cmd, list, true);
    }, { class: 'add-cmd', 'aria-label': 'Add command' });
    const end = h('li', { class: 'cmd-add' }, add);
    // Dropping on the "add" line puts the command at the end of this list.
    this.dropTarget(end, list, () => list.length);
    return h('ol', { class: `cmd-list depth-${Math.min(depth, 3)}` }, ...rows, end);
  }

  /** Something dragged can be dropped here: moved to `at()` in `list`. */
  private dropTarget(el: HTMLElement, list: Command[], at: () => number): void {
    el.addEventListener('dragover', (e) => {
      const d = this.drag;
      if (!d) return;
      const moving = d.list[d.i];
      // Not into its own branches.
      if (moving && (moving.cmd === 'choice' || moving.cmd === 'if') && this.contains([moving], list)) return;
      e.preventDefault();
      e.stopPropagation();
      el.classList.add('drop-here');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-here'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('drop-here');
      const d = this.drag;
      this.drag = null;
      if (!d || !d.list[d.i]) return;
      let to = at();
      if (d.list === list && (to === d.i || to === d.i + 1)) return;
      this.change(() => {
        const [c] = d.list.splice(d.i, 1);
        if (d.list === list && d.i < to) to--;
        list.splice(to, 0, c);
        this.sel = { list, i: to };
      });
      this.draw();
    });
  }

  private row(list: Command[], c: Command, i: number, depth: number): HTMLElement {
    const selected = this.sel?.list === list && this.sel.i === i;
    const btn = (text: string, title: string, fn: () => void, disabled = false) =>
      h('button', { type: 'button', class: 'mini-btn', title, 'aria-label': title, disabled, onclick: (e: Event) => { e.stopPropagation(); fn(); } }, text);
    const main = h('button', { type: 'button', class: 'cmd-main', title: 'Click to highlight, double-click to edit',
      onclick: () => this.select(list, i), ondblclick: () => this.edit(c, list, false) },
      h('span', { class: 'cmd-grip', 'aria-hidden': 'true' }, '⋮⋮'),
      h('span', { class: 'cmd-tag' }, label(c.cmd)),
      h('span', { class: 'cmd-text' }, summary(c)));
    const line = h('div', { class: `cmd-line cat-${CATEGORY[c.cmd]}${selected ? ' selected' : ''}`, draggable: 'true' }, main,
      selected ? h('span', { class: 'cmd-actions' },
        btn('↑', 'Move up', () => this.move(-1), i === 0),
        btn('↓', 'Move down', () => this.move(1), i === list.length - 1),
        btn('⧉', 'Duplicate', () => { this.change(() => list.splice(i + 1, 0, JSON.parse(JSON.stringify(c)) as Command)); this.select(list, i + 1); }),
        btn('✕', 'Delete', () => this.remove())) : null);
    line.addEventListener('dragstart', (e) => { this.drag = { list, i }; e.dataTransfer?.setData('text/plain', label(c.cmd)); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; line.classList.add('dragging'); });
    line.addEventListener('dragend', () => { this.drag = null; line.classList.remove('dragging'); });
    // Dropping on a command puts the dragged one just before it.
    this.dropTarget(line, list, () => list.indexOf(c));
    const children: Node[] = [];
    if (c.cmd === 'choice') {
      c.options.forEach((o, k) => children.push(h('div', { class: 'branch' }, h('div', { class: 'branch-label' }, `When “${o}”`), this.list(c.branches[k] ?? (c.branches[k] = []), depth + 1))));
    } else if (c.cmd === 'if') {
      children.push(h('div', { class: 'branch' }, h('div', { class: 'branch-label' }, 'Then'), this.list(c.then, depth + 1)));
      children.push(h('div', { class: 'branch' }, h('div', { class: 'branch-label' }, 'Otherwise'), this.list(c.else ?? (c.else = []), depth + 1)));
    }
    return h('li', { class: 'cmd' }, line, ...children);
  }

  /* ------------------------------------------------------------ dialogs */

  /** Open a command's form (used to set up a just-created transfer event). */
  editCommand(c: Command, list: Command[], isNew = false): void {
    this.edit(c, list, isNew);
  }

  private edit(c: Command, list: Command[], isNew: boolean): void {
    const names = this.store.knownNames();
    const draft = JSON.parse(JSON.stringify(c)) as Command;
    const lists = h('div', { hidden: true },
      h('datalist', { id: 'dl-switches' }, ...names.switches.map((n) => h('option', { value: n }))),
      h('datalist', { id: 'dl-vars' }, ...names.vars.map((n) => h('option', { value: n }))),
      h('datalist', { id: 'dl-speakers' }, ...names.speakers.map((n) => h('option', { value: n }))));
    const form = h('div', { class: 'form' }, lists, ...this.form(draft));
    const removeIfNew = () => {
      if (!isNew) return;
      const i = list.indexOf(c);
      if (i >= 0) { list.splice(i, 1); this.dropCp(); this.done(); }
    };
    openModal(isNew ? `Add: ${label(c.cmd)}` : label(c.cmd), form, [
      { label: 'Cancel', onClick: removeIfNew },
      { label: isNew ? 'Add' : 'Save', primary: true, onClick: () => {
        if (!isNew) this.cp();
        if (draft.cmd === 'choice') {
          draft.options = draft.options.map((o) => o.trim()).filter(Boolean);
          if (!draft.options.length) draft.options = ['OK'];
          draft.branches = draft.options.map((_, k) => draft.branches[k] ?? []);
          if (draft.cancel !== undefined && draft.cancel >= draft.options.length) draft.cancel = undefined;
        }
        for (const k of Object.keys(c)) delete (c as unknown as Record<string, unknown>)[k];
        Object.assign(c, draft);
        this.done();
      } },
    ], removeIfNew);
  }

  private form(d: Command): HTMLElement[] {
    switch (d.cmd) {
      case 'text': {
        const ta = h('textarea', { rows: 4, class: 'text-area' });
        ta.value = d.text;
        const td = d;
        const previewBox = h('div', { class: 'msg cmd-msg-preview', 'aria-label': 'Preview' }, h('div', { class: 'msg-box' }, h('div', { class: 'msg-text' })));
        ta.addEventListener('input', () => { d.text = ta.value; preview(); });
        queueMicrotask(() => preview());
        const sp = textInput(d.speaker ?? '', (v) => (d.speaker = v.trim() || undefined), { list: 'dl-speakers', placeholder: 'Nobody (narration)' });
        sp.addEventListener('input', () => (d.speaker = sp.value.trim() || undefined));
        const styles = messageStyles(dbNow?.().messageStyles);
        const styleOf = () => styles.find((x) => x.id === td.style);
        return [field('Speaker', sp), formatBar(ta, () => { d.text = ta.value; preview(); }), field('Text', ta, 'Use new lines to break the text. \\v[name] shows a variable, \\s[name] a switch. Select words and use the buttons above to bold or colour just them.'),
          field('Style', select([['', 'Automatic (Speech for people, Sign for signs and objects, Narration with nobody)'], ...styles.map((x) => [x.id, x.name] as [string, string])], d.style ?? '',
            (v) => { if (v) td.style = v; else delete td.style; preview(); }), 'Text box styles are set up in Database → Text boxes, so every message using one changes together.'),
          field('Box', select([['auto', 'From the style'], ['speech', 'Speech bubble (with a tail)'], ['plain', 'Plain box (no tail)']],
            d.bubble ?? 'auto', (v) => (d.bubble = v === 'auto' ? undefined : (v as 'speech' | 'plain'))), 'Players choose where boxes go (over the speaker, or fixed on screen) in Settings.'),
          ...lookFields(d, () => preview(), 'Change the look just for this message', () => ({ ...(styleOf()?.look ?? { color: '#fff6dc', bubble: '#0e1222' }) })), previewBox];
        function preview(): void {
          setTextColors(dbNow?.().textColors);
          const t = previewBox.querySelector('.msg-text') as HTMLElement;
          t.innerHTML = richHTML(parseRich(td.text || '…'));
          applyLook(previewBox, td.look ?? styleOf()?.look, t);
        }
      }
      case 'choice': {
        const ta = h('textarea', { rows: 4 });
        ta.value = d.options.join('\n');
        const cancel = select([], '', () => {});
        const syncCancel = () => {
          const opts = ta.value.split('\n').map((o) => o.trim()).filter(Boolean);
          cancel.replaceChildren(h('option', { value: '' }, 'Can’t be cancelled'), ...opts.map((o, k) => h('option', { value: String(k) }, o)));
          cancel.value = d.cancel !== undefined && d.cancel < opts.length ? String(d.cancel) : '';
        };
        ta.addEventListener('input', () => { d.options = ta.value.split('\n'); syncCancel(); });
        cancel.addEventListener('change', () => (d.cancel = cancel.value === '' ? undefined : parseInt(cancel.value, 10)));
        syncCancel();
        return [field('Options (one per line)', ta, 'Each option gets its own branch of commands.'), field('If the player cancels (Esc)', cancel)];
      }
      case 'if':
        return [conditionForm(d.condition, (c) => (d.condition = c), false)];
      case 'selfSwitch':
        return [h('div', { class: 'field-row' },
          field('Self switch', select(SELF_SWITCHES.map((l) => [l, l] as [string, string]), d.letter, (v) => (d.letter = v as SelfSwitch))),
          field('Set to', select([['on', 'ON'], ['off', 'OFF']], d.value ? 'on' : 'off', (v) => (d.value = v === 'on')))),
          h('p', { class: 'hint' }, 'This event’s own switch: no name needed, and every event has its own A–D. A chest sets A when opened; its second page (Condition → Self switch A is ON) shows it open. Copies of the event each keep their own.')];
      case 'setSwitch':
        return [field('Switch', switchInput(d.switch, (v) => (d.switch = v))),
          field('Set to', select([['on', 'ON'], ['off', 'OFF']], d.value ? 'on' : 'off', (v) => (d.value = v === 'on')))];
      case 'setVar':
        return [field('Variable', textInput(d.var, (v) => (d.var = v.trim()), { list: 'dl-vars', placeholder: 'e.g. gold' })),
          field('Operation', select([['set', 'Set to'], ['add', 'Add (use a negative number to subtract)']], d.op, (v) => (d.op = v as 'set' | 'add'))),
          field('Value', numberInput(d.value, (v) => (d.value = v), { step: 1 }))];
      case 'wait':
        return [field('Seconds', numberInput(d.seconds, (v) => (d.seconds = Math.max(0, v)), { step: 0.1, min: 0 }))];
      case 'fadeOut': case 'fadeIn':
        return [field('Duration (seconds)', numberInput(d.seconds ?? 0.8, (v) => (d.seconds = Math.max(0, v)), { step: 0.1, min: 0 }))];
      case 'setTime':
        return [field('Hour (0 – 23.75)', numberInput(d.hour, (v) => (d.hour = Math.min(23.75, Math.max(0, v))), { step: 0.25, min: 0, max: 23.75 }), '0 = midnight, 6 = dawn, 12 = noon, 19.5 = dusk, 22 = night. The clock keeps running from there.'),
          field('Change', select([['instant', 'Instantly'], ['ease', 'Gradually']], d.instant ? 'instant' : 'ease', (v) => (d.instant = v === 'instant')))];
      case 'sleep':
        return [field('Sleep', select([['morning', 'Until morning (7:00)'], ['night', 'Until night (21:00)'], ['hours', 'For a number of hours']], d.until ?? 'morning', (v) => { d.until = v as typeof d.until; })),
          field('Hours', numberInput(d.hours ?? 8, (v) => (d.hours = Math.max(0.25, Math.min(48, v))), { step: 0.5, min: 0.25, max: 48 }), 'Used with “For a number of hours”.'),
          checkbox('Rest too (health, magic and stamina back to full)', !!d.rest, (v) => (d.rest = v || undefined)),
          checkbox('An inn: the party wakes Well Rested (+3 to every stat, +25% EXP)', !!d.inn, (v) => (d.inn = v || undefined)),
          h('p', { class: 'hint' }, 'The camera tilts up from the hero to the sky, the hours rush by overhead (sun, clouds, stars, Saturn and the moon go round), then it comes back down. Put it after a choice at a camp or an inn.')];
      case 'ability':
        return [field('Ability', select(ABILITIES.map((a) => [a, ABILITY_NAMES[a]] as [string, string]), d.ability, (v) => (d.ability = v as Ability))),
          field('Player', select([['on', 'Learns it (on)'], ['off', 'Loses it (off)']], d.on ? 'on' : 'off', (v) => (d.on = v === 'on')),
            'Lock an ability at the start (Database → Player) and unlock it here, e.g. after finding climbing gloves.')];
      case 'transfer':
        return transferFields(this.store, d);
      case 'save':
        return [h('p', { class: 'hint' }, 'Opens the save screen; the event continues once the player closes it. Use it for save points (a statue, a bed, a journal), especially if saving from the menu is turned off in Database → Saving.')];
      case 'fullRest':
        return [h('p', { class: 'hint' }, 'For an inn bed or a campfire: health, magic and stamina back to full for the whole party, and ailments cured (Zombie needs its own cure). Pair it with “Set time of day” to sleep until morning.')];
      case 'tendFire':
        return [h('p', { class: 'hint' }, 'Opens the fuel menu of the fire nearest the hero (a fire prop with a burn time): how long it burns, and fuel from the bag to add. Use it as one of a campfire event’s choices. In text, \\fire shows how long the nearest fire burns, e.g. “The fire will burn for \\fire.”')];
      case 'lock':
        return lockFields(this.store, d);
      case 'journalTab':
        return [h('div', { class: 'field-row' },
          field('Tab', select(Object.entries(JOURNAL_TAB_NAMES) as [string, string][], d.tab, (v) => (d.tab = v as typeof d.tab))),
          field('Make it', select([['show', 'Shown'], ['hide', 'Hidden']], d.show ? 'show' : 'hide', (v) => (d.show = v === 'show')))),
          h('p', { class: 'hint' }, 'Unlock a Journal page with the story (the Bestiary after meeting the hunter, say). Which tabs are hidden at the start, and their order, are in Database → Title & menus → Journal. Kept with the save.')];
      case 'relation':
        return [h('div', { class: 'field-row' },
          field('Who', select(relRaters(), d.a, (v) => (d.a = v)), 'Whose rating changes (the hero you play has none of their own).'),
          field('Of', select(relTargets(), d.b, (v) => (d.b = v)))),
          h('div', { class: 'field-row' },
            field('Change', select([['add', 'Add (negative takes away)'], ['set', 'Set to']], d.op, (v) => (d.op = v as 'add' | 'set'))),
            field('Points', numberInput(d.value, (v) => (d.value = Math.round(v)), { step: 1, min: -100, max: 100 }))),
          checkbox('Both ways (their rating of the first one changes too)', !!d.both, (v) => { if (v) d.both = true; else delete d.both; }),
          h('p', { class: 'hint' }, 'Ratings run 0 (Hate) … 100 (Best friends / Love): Hate under 15, Dislike 15+, Distrust 30+, Neutral 45+, Like 60+, Close 75+, Best friends 90+. Each is one way: Katrina’s view of Eleanor is her own.')];
      case 'groupChatter': {
        const list = this.store.db.groupChatter ?? [];
        return [field('Conversation', select([['', list.length ? 'Choose…' : '(none yet: Database → Characters → Chatter → Group chatter)'], ...list.map((g) => [g.id, g.name || g.id] as [string, string])], d.id, (v) => (d.id = v))),
          h('p', { class: 'hint' }, 'Queues the conversation: the next time the party makes camp (a rest area), it plays line by line over each speaker’s head. It plays once.')];
      }
      case 'rest':
        return [checkbox('Camping supplies (Rested / Well Rested)', !d.noSupplies, (v) => { if (v) delete d.noSupplies; else d.noSupplies = true; }),
          checkbox('Sets the respawn point', !d.noRespawn, (v) => { if (v) delete d.noRespawn; else d.noRespawn = true; }),
          h('p', { class: 'hint' }, 'A campfire or bedroll: the player picks how many hours to rest (health and magic come back 20% an hour; 1 hour already warms and dries the party; 5+ hours is a full restore that cures every ailment), then camping supplies from the bag (each item’s Camp value: 25 makes the party Rested, 50 Well Rested; under 25 nothing is spent), and the party sleeps. Use “Create rest point here” on an empty tile for a ready-made one.')];
      case 'goodState':
        return [field('Who', select(heroWhoChoices('all'), d.hero, (v) => (d.hero = v))),
          field('Good state', select([['rested', 'Rested (+1 to every stat, +10% EXP)'], ['wellRested', 'Well Rested (+3 to every stat, +25% EXP)'], ['none', 'Take it away']], d.kind, (v) => (d.kind = v as typeof d.kind))),
          h('div', { class: 'field-row' },
            field('Hours', numberInput(d.hours ?? 0, (v) => { const n = Math.max(0, Math.round(v)); if (n) d.hours = n; else delete d.hours; }, { step: 1, min: 0 })),
            field('Minutes', numberInput(d.minutes ?? 0, (v) => { const n = Math.max(0, Math.min(59, Math.round(v))); if (n) d.minutes = n; else delete d.minutes; }, { step: 5, min: 0, max: 59 }))),
          h('p', { class: 'hint' }, 'Game time. 0 hours and 0 minutes: as long as Database → Weather & temperature → Resting and camping says. A blessing at a shrine can be a Well Rested. A new good state replaces the old one, but Rested never replaces Well Rested.')];
      case 'heroWeather':
        return [field('Who', select(heroWhoChoices('all'), d.hero, (v) => (d.hero = v))),
          field('Weather state', select(HERO_WEATHER, d.state, (v) => (d.state = v as typeof d.state))),
          h('p', { class: 'hint' }, 'Soak them (a bucket of water, falling in a river), chill them to the bone, or warm and dry them (Normal). It changes from there as usual with the weather where they stand.')];
      case 'ailment': {
        const secs = field('For (seconds)', numberInput(d.seconds ?? 0, (v) => { const n = Math.max(0, Math.round(v * 10) / 10); if (n) d.seconds = n; else delete d.seconds; }, { step: 1, min: 0 }), '0: its usual time (Zombie: until cured).');
        secs.hidden = true;
        const ailSel = select([...(d.op === 'cure' ? [['all', 'All ailments (not Zombie)'] as [string, string]] : []), ...AILMENTS.map((a) => [a, AILMENT_INFO[a].name] as [string, string])], d.ailment, (v) => (d.ailment = v as Ailment | 'all'));
        return [field('Do', select([['give', 'Give'], ['cure', 'Cure']], d.op, (v) => {
          d.op = v as 'give' | 'cure'; secs.hidden = d.op !== 'give';
          if (d.op === 'give' && d.ailment === 'all') d.ailment = 'poison';
          ailSel.replaceChildren(...[...(d.op === 'cure' ? [['all', 'All ailments (not Zombie)']] : []), ...AILMENTS.map((a) => [a, AILMENT_INFO[a].name])].map(([k, l]) => h('option', { value: k }, l)));
          ailSel.value = d.ailment;
        })), field('Who', select(heroWhoChoices('all'), d.hero ?? '', (v) => { if (v) d.hero = v; else delete d.hero; })), field('Ailment', ailSel), secs,
        h('p', { class: 'hint' }, 'One ailment per hero: someone who already has one doesn’t get another. Their resistances and gear that wards it off count when giving. Poison and Burn wear off once they’re down to 1 health; the rest last until cured (an item, this command, or 5+ hours of rest). Chill and Stagger only happen in battle. For a trap, a poison swamp or a cursed chest.')];
      }
      case 'gauge': {
        const value = numberInput(d.value, (v) => (d.value = v), { step: 1 });
        const valueField = field('Amount', value, 'For Add, a negative amount takes away (damage, spending magic).');
        valueField.hidden = d.op === 'fill';
        return [field('Gauge', select((['hp', 'mp', 'sp'] as Gauge[]).map((g) => [g, GAUGE_NAMES[g]] as [string, string]), d.gauge, (v) => (d.gauge = v as Gauge))),
          field('Change', select([['fill', 'Fill to maximum'], ['add', 'Add'], ['set', 'Set to']], d.op, (v) => { d.op = v as 'add' | 'set' | 'fill'; valueField.hidden = d.op === 'fill'; })),
          valueField];
      }
      case 'giveItem': case 'takeItem': {
        const out = [field('Item', select(itemChoices(this.store, d.item), d.item, (v) => (d.item = v))),
          field('How many', numberInput(d.count, (v) => (d.count = Math.max(1, Math.round(v))), { step: 1, min: 1 }))];
        if (d.cmd === 'giveItem') {
          const g = d;
          out.push(checkbox('Quietly (no “Received …!” message)', !!g.silent, (v) => (g.silent = v || undefined)));
          out.push(h('p', { class: 'hint' }, 'If the bag is full, the player is told and the event stops here, so a chest that sets its switch after this stays closed.'));
        } else out.push(h('p', { class: 'hint' }, 'Takes as many as the player has (equipped items are taken off first). Check with a conditional branch “has item” beforehand.'));
        return out;
      }
      case 'gold':
        return [field('Change', select([['add', 'Add (negative to take away)'], ['set', 'Set to']], d.op, (v) => (d.op = v as 'add' | 'set'))),
          field('Amount', numberInput(d.value, (v) => (d.value = Math.round(v)), { step: 1 })),
          checkbox('Quietly (no message)', !!d.silent, (v) => (d.silent = v || undefined))];
      case 'sound': {
        const opts: [string, string][] = [...SFX_NAMES.map((n) => [n, `${SFX_LABELS[n]} (built-in)`] as [string, string]), ...audioFiles().map((f) => [f, f.startsWith('audio/') ? f.slice(6) : f.split('/').pop()!] as [string, string])];
        if (!opts.some(([v]) => v === d.sound)) opts.unshift([d.sound, d.sound]);
        return [field('Sound', select(opts, d.sound, (v) => (d.sound = v))), previewButton(() => previewSound(d.sound))];
      }
      case 'music': {
        const opts: [string, string][] = [['@map', 'Back to the map’s music'], ...loopChoices('music', audioFiles()).map(([v, l]) => [v, v ? l : 'Stop the music'] as [string, string])];
        return [field('Music', select(opts, d.music === undefined ? '@map' : d.music, (v) => (d.music = v === '@map' ? undefined : v))),
          field('Crossfade (seconds)', numberInput(d.fade ?? 1.5, (v) => (d.fade = Math.max(0, v)), { step: 0.5, min: 0 })),
          h('p', { class: 'hint' }, 'Lasts until the player leaves the map. Battle music (map settings) still takes over in a fight.')];
      }
      case 'ambience': {
        const opts: [string, string][] = [['@map', 'Back to the map’s sound'], ...loopChoices('ambience', audioFiles()).map(([v, l]) => [v, v ? l : 'Silence'] as [string, string])];
        return [field('Background sound', select(opts, d.ambience === undefined ? '@map' : d.ambience, (v) => (d.ambience = v === '@map' ? undefined : v))),
          h('p', { class: 'hint' }, 'Lasts until the player leaves the map.')];
      }
      case 'party': {
        const list = heroList();
        return [
          field('Hero', select(list.length ? list : [['', '(add more heroes in Database → Heroes)']], d.hero, (v) => (d.hero = v))),
          field('Do', select([['add', 'Joins the party'], ['remove', 'Leaves the party']], d.op, (v) => (d.op = v as 'add' | 'remove'))),
          checkbox('Quietly (no message)', !!d.quiet, (v) => (d.quiet = v || undefined)),
          h('p', { class: 'hint' }, `Up to ${3} join the hero you play. They follow, fight on their own (their AI style in Database → Heroes) and share the bag, gold and level. Leaving, their equipment goes back in the bag.`),
        ];
      }
      case 'statRank':
        return [field('Who', select([['', 'The hero you play'], ['all', 'Everyone in the party'], ...heroList()], d.hero, (v) => (d.hero = v))),
          h('div', { class: 'field-row' },
            field('Stat', select(Object.entries(STAT_NAMES) as [string, string][], d.stat, (v) => (d.stat = v as typeof d.stat))),
            field('Rank', select([['A', 'A (+4 a level)'], ['B', 'B (+3)'], ['C', 'C (+2)'], ['D', 'D (+1)'], ['F', 'F (+0)']], d.rank, (v) => (d.rank = v as typeof d.rank)))),
          h('p', { class: 'hint' }, 'For good: every level from now on adds that much to the stat. A Potion of Defense does the same from the bag (Database → Items → Stat growth).')];
      case 'temperature':
        return [field('Change', select([['add', 'Warmer / colder by'], ['set', 'Set to'], ['reset', 'Back to normal']], d.op, (v) => (d.op = v as typeof d.op))),
          field('°F', numberInput(d.value ?? 0, (v) => (d.value = Math.round(v)), { step: 1 }), 'Warmer / colder: + or − degrees (−30: an icy spell). Set to: that temperature.'),
          h('p', { class: 'hint' }, 'Lasts while the player stays on this map; leaving it puts the temperature back. For a fire spell that warms the air, a frost charm…')];
      case 'weather': {
        const amt = field('How heavy', numberInput(d.amount ?? 1, (v) => (d.amount = Math.max(0.1, Math.min(2, Math.round(v * 10) / 10))), { step: 0.1, min: 0.1, max: 2 }), '1 is normal; 0.3 a light drizzle, 2 a downpour.');
        amt.hidden = d.kind === 'none';
        return [field('Weather', select(WEATHER_KINDS.map((k) => [k, WEATHER_NAMES[k]] as [string, string]), d.kind, (v) => { d.kind = v as WeatherKind; amt.hidden = d.kind === 'none'; })), amt,
          field('Wind', select([['', 'Unchanged'], ['0', 'Calm'], ['0.3', 'Breeze'], ['0.6', 'Windy'], ['1', 'Gale']], d.wind === undefined ? '' : String(d.wind), (v) => { if (v === '') delete d.wind; else d.wind = Number(v); })),
          field('Where', select([['here', 'This map’s weather (shared outdoor, its zone’s or its own)'], ['world', 'The shared outdoor weather (even from indoors)']], d.scope ?? 'here', (v) => { if (v === 'world') d.scope = 'world'; else delete d.scope; })),
          h('p', { class: 'hint' }, 'Fades from the old weather to the new over a few seconds. It stays that way for the rest of the game (saved with the game), until another “Change weather”. On a shared outdoor map, “here” changes the weather on every shared map.')];
      }
      case 'quest': {
        const objWrap = h('div');
        const renderObj = () => {
          objWrap.replaceChildren();
          if (d.op !== 'objective') { delete d.objective; delete d.add; return; }
          const opts = objectiveChoices(d.quest, d.objective);
          if (!d.objective || !opts.some(([id]) => id === d.objective)) d.objective = opts[0][0] || undefined;
          const amount = numberInput(d.add ?? 1, (v) => (d.add = Math.round(v)), { step: 1 });
          const amountField = field('By', amount, 'Negative counts back down.');
          amountField.hidden = d.add === undefined;
          objWrap.append(field('Objective', select(opts, d.objective ?? '', (v) => (d.objective = v || undefined))),
            field('Change', select([['done', 'Mark it done'], ['add', 'Count it up']], d.add === undefined ? 'done' : 'add', (v) => {
              if (v === 'add') d.add = 1; else delete d.add;
              renderObj();
            })), amountField);
        };
        renderObj();
        return [field('Quest', select(questChoices(d.quest), d.quest, (v) => { d.quest = v; renderObj(); })),
          field('Do', select(QUEST_OPS, d.op, (v) => { d.op = v as QuestOp; renderObj(); })),
          objWrap,
          checkbox('Quietly (no banner; it’s still written in the adventure log)', !!d.silent, (v) => (d.silent = v || undefined)),
          h('p', { class: 'hint' }, 'Defeat, collect and visit objectives count by themselves while the quest is in progress. A quest that doesn’t complete by itself waits, “ready to hand in”, until an event completes it: check for that with a conditional branch (Quest → Ready to hand in).')];
      }
      case 'tutorial': {
        const list = (this.store.db.tutorials ?? []).map((t) => [t.id, t.title] as [string, string]);
        return [field('Tutorial', select(list.length ? list : [['', '(add tutorials in Database → Tutorials)']], d.id, (v) => (d.id = v)),
          'Pops up the first time this runs (each tutorial once per game), unless the player turned tutorials off in Settings; either way it goes in the Journal’s Tutorials tab.')];
      }
      case 'achievement': {
        const list = (this.store.db.achievements ?? []).map((a) => [a.id, `${a.name} (${a.points}G)`] as [string, string]);
        return [field('Achievement', select(list.length ? list : [['', '(add achievements in Database → Achievements)']], d.id, (v) => (d.id = v)),
          'Unlocks it with its pop-up (once: it stays unlocked across every save). Achievements set to “An event unlocks it” need this; the others unlock by themselves too.')];
      }
      case 'console':
        return [field('Command', textInput(d.line, (v) => (d.line = v.trim()), { placeholder: 'e.g. give potion 3' }),
          'Any developer-console command (type help in the console, ` in a playtest, to see them all). Handy for test events: give items, teleport, set the time…')];
      case 'fieldWeapons':
        return [field('Overworld weapons', select([['off', 'Disable (greyed out with a red ✕)'], ['on', 'Enable again']], d.on ? 'on' : 'off', (v) => (d.on = v === 'on')),
          'The sword and bow the hero uses on the field (cutting vines, shooting switches). Disable them indoors, in towns or other restricted areas; they stay off (across maps and saves) until an event enables them again.')];
      case 'enemyLevels':
        return [field('Enemies on the map', select([['party', 'Dynamic: near the party’s average level'], ['fixed', 'As set (each spawn’s level range)']], d.mode, (v) => (d.mode = v as 'party' | 'fixed')),
          'Dynamic: random battles and enemies on the map come out near the party’s average level, a few either side (they “level up with the players”). Bosses and battles started by events keep their own. It lasts (across maps and saves) until another event sets it back.'),
          field('Either side (levels, dynamic only)', numberInput(d.spread ?? 2, (v) => (d.spread = Math.max(0, Math.min(10, Math.round(v)))), { step: 1, min: 0, max: 10 }), '2: from two below the average to two above.')];
      case 'skillPoints':
        return [field('Skill points', numberInput(d.value, (v) => (d.value = Math.round(v)), { step: 1 }), 'A quest reward. Negative takes points away.'),
          checkbox('Party points (for the Party skill tree everyone shares)', !!d.party, (v) => { if (v) d.party = true; else delete d.party; })];
      case 'battle': {
        const enemies = (this.store.db.enemies ?? []).map((e) => [e.id, e.name] as [string, string]);
        const list = h('div', { class: 'battle-foes' });
        const render = () => list.replaceChildren(...d.enemies.map((id, k) => h('div', { class: 'field-row' },
          select(enemies.length ? enemies : [['', '(add enemies in Database → Enemies)']], id, (v) => (d.enemies[k] = v), { 'aria-label': `Enemy ${k + 1}` }),
          h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove enemy ${k + 1}`, onclick: () => { d.enemies.splice(k, 1); render(); } }, '✕'))),
          d.enemies.length < 4 && enemies.length ? h('button', { type: 'button', class: 'btn', onclick: () => { d.enemies.push(d.enemies[d.enemies.length - 1] ?? enemies[0][0]); render(); } }, '+ Add enemy') : h('span'));
        render();
        return [list,
          field('In Single battle mode', select([['', 'The map’s default'], ...[['random', 'Wild encounter: one at random'], ['oneByOne', 'Trainer battle: one at a time'], ['full', 'Swarm: all at once']]] as [string, string][], d.pick ?? '', (v) => { if (v) d.pick = v as EncounterPick; else delete d.pick; }),
            'Wild: one of these, at random. Trainer: one at a time, the next stepping in as each falls (up to 4). Swarm: all at once (3 at most). Group battle mode fights the first three together.'),
          checkbox('The party may run away', !!d.canRun, (v) => (d.canRun = v || undefined)),
          field('If the party loses', select([['respawn', 'Back to the respawn point (as dying does); the event stops'], ['continue', 'The event goes on (a story battle meant to be lost)']], d.lose ?? 'respawn', (v) => { if (v === 'continue') d.lose = 'continue'; else delete d.lose; })),
          field('Result into variable', textInput(d.resultVar ?? '', (v) => (d.resultVar = v.trim() || undefined), { placeholder: 'Optional, e.g. boss_result' }), '1 if won, 2 if the party ran away, 0 if lost. Branch on it afterwards.'),
          field('Battle music', select([['', 'The usual (map override, else the game’s)'], ...loopChoices('music', audioFiles()).filter(([v]) => v)], d.music ?? '', (v) => (d.music = v || undefined))),
          field('Battle map', select([['', 'The map’s battle map'], ...this.store.battleMapNames().map((n) => [n, n] as [string, string])], d.map ?? '', (v) => (d.map = v || undefined)), 'Where it’s fought: a boss arena, a throne room…'),
          h('p', { class: 'hint' }, 'A turn-based battle (in either battle system), for bosses and set-piece fights. The event waits for it to end. Beating these enemies gives EXP, gold and drops as usual.')];
      }
      case 'learn': {
        const db = this.store.db;
        const heroes: [string, string][] = [['', 'The hero you play'], ['@party', 'Everyone in the party'], ...(db.heroes ?? []).slice(1).map((x) => [x.id, x.name] as [string, string])];
        const spells: [string, string][] = [['', '(no spell)'], ...spellList(db).map((x) => [x.id, x.name] as [string, string])];
        const adds: [string, string][] = [['', '(no Addition)'], ...additionList(db).map((x) => [x.id, x.name] as [string, string])];
        const rankWrap = h('div');
        const renderRank = () => {
          const sp = findSpell(db, d.spell);
          rankWrap.replaceChildren(sp && spellMaxRank(sp) > 1 ? field('Rank', select(Array.from({ length: spellMaxRank(sp) }, (_, i) => [String(i + 1), rankName(sp.name, i + 1)] as [string, string]), String(d.rank ?? 1), (v) => (d.rank = Number(v) > 1 ? Number(v) : undefined)), 'Raises it to this rank if they know it lower.') : h('span'));
        };
        renderRank();
        return [field('Who', select(heroes, d.who, (v) => (d.who = v))),
          field('Spell', select(spells, d.spell ?? '', (v) => { d.spell = v || undefined; renderRank(); })), rankWrap,
          field('Addition', select(adds, d.addition ?? '', (v) => (d.addition = v || undefined))),
          checkbox('Quietly (no message)', !!d.silent, (v) => (d.silent = v || undefined)),
          h('p', { class: 'hint' }, 'Trainers: put this after a choice and a gold check (Conditional branch → Gold, then Change gold). Party heroes named here must be in the party.')];
      }
      case 'heroClass': {
        const db = this.store.db;
        const heroes: [string, string][] = [['', 'The hero you play'], ['@party', 'Everyone in the party'], ...(db.heroes ?? []).slice(1).map((x) => [x.id, x.name] as [string, string])];
        const classes = classList(db).map((x) => [x.id, x.name] as [string, string]);
        return [field('Who', select(heroes, d.who, (v) => (d.who = v))),
          field('Do', select([['change', 'Change to this class now'], ['unlock', 'Let them change to it (Menu → Abilities)']], d.op, (v) => (d.op = v as 'change' | 'unlock'))),
          field('Class', select(classes.length ? classes : [['', '(add classes in Database → Classes)']], d.cls, (v) => (d.cls = v))),
          checkbox('Quietly (no message)', !!d.silent, (v) => (d.silent = v || undefined)),
          h('p', { class: 'hint' }, 'A class opens its skill trees. Changing class keeps every skill, spell and Addition already learned.')];
      }
      case 'roost':
        return [h('div', { class: 'field-row' },
          field('Roost name', textInput(d.name, (v) => (d.name = v.trim() || d.name), { placeholder: 'e.g. Rivertown' }), 'Shown on the world map when picking where to fly.'),
          field('Roost id', textInput(d.id, (v) => (d.id = v.trim().replace(/[^A-Za-z0-9_-]+/g, '_') || d.id), { placeholder: 'rivertown' }), 'One per town: the same id everywhere means the same roost.')),
          field('Griffin master’s name', textInput(d.speaker ?? '', (v) => (d.speaker = v.trim() || undefined), { placeholder: 'Griffin master' })),
          checkbox('Only unlock it (no flight offered now)', !!d.unlockOnly, (v) => { if (v) d.unlockOnly = true; else delete d.unlockOnly; }),
          h('p', { class: 'hint' }, 'Put it on the griffin master’s event. Talking to them unlocks this roost (the hero lands here, where they stand while talking) and opens the world map: pick any other unlocked roost to fly there, priced by distance (Database → Travel). The griffin flies over the World layout’s maps, at one speed, then lands, drops the hero off and flies away. Roosts on maps outside the World layout still work (a short flight over forest).')];
      case 'stable': {
        const all = horseList(this.store.db), on = new Set(d.horses ?? []);
        return [field('Keeper’s name', textInput(d.name ?? '', (v) => (d.name = v.trim() || undefined), { placeholder: 'Stable keeper' })),
          h('div', { class: 'field' }, h('label', {}, 'Horses for rent (none ticked: all of them)'),
            ...all.map((x) => checkbox(`${x.name} ${stars(x.tier)} · ${x.price} G`, on.has(x.id), (v) => { if (v) on.add(x.id); else on.delete(x.id); const l = all.filter((y) => on.has(y.id)).map((y) => y.id); if (l.length) d.horses = l; else delete d.horses; }))),
          h('p', { class: 'hint' }, 'The keeper offers these (Database → Horses). One horse at a time: with one already, they offer to send it home. A rented horse stands beside the hero; the Talk button beside it gets on, B gets off, and it stays where it was left. A key item marked Saddle (Database → Items) comes with it, to send it home from anywhere.')];
      }
      case 'horse': {
        const all = horseList(this.store.db);
        return [field('Do', select([['rent', 'Give a horse (rent one)'], ['home', 'Send the horse home'], ['mount', 'Put the hero on the horse'], ['dismount', 'Get the hero off the horse']], d.op, (v) => (d.op = v as typeof d.op))),
          field('Horse (giving one)', select(all.map((x) => [x.id, `${x.name} ${stars(x.tier)}`] as [string, string]), d.id ?? all[0]?.id ?? '', (v) => (d.id = v))),
          checkbox('Free (no gold taken)', !!d.free, (v) => { if (v) d.free = true; else delete d.free; }),
          h('p', { class: 'hint' }, 'For story moments: a horse given as a reward, sent home before a cave, the hero put on it for a ride. Getting off leaves it here.')];
      }
      case 'shop': {
        const goods = h('div', { class: 'shop-goods' });
        // Update 138: a section per kind of item (Items, Materials, Weapons…), each listing only that kind.
        const renderGoods = () => {
          const all = this.store.db.items ?? [];
          goods.replaceChildren(all.length ? itemSections(all, d.goods, {
            noun: 'Item for sale', rerender: renderGoods, make: (id): (typeof d.goods)[number] => ({ item: id }),
            extras: (g, k) => [priceInput(g.price, all.find((i) => i.id === g.item)?.price ?? 0, (v) => (g.price = v), `Price ${k + 1}`)],
          }) : h('p', { class: 'note' }, 'No items yet: add some in Database → Items.'));
        };
        renderGoods();
        return [field('Shop name', textInput(d.name ?? '', (v) => (d.name = v.trim() || undefined), { placeholder: 'Shop' })),
          field('For sale', goods, 'Price: leave empty to use the item’s price from the Database.'),
          checkbox('The player can sell to this shop (for half the price)', d.canSell !== false, (v) => (d.canSell = v ? true : false))];
      }
    }
  }
}

/**
 * Form for a condition. `allowNone` adds an "Always" option (event pages);
 * onchange receives null for "Always".
 */
/** A price box that may be left empty (meaning: the item's own price). */
function priceInput(value: number | undefined, fallback: number, onchange: (v: number | undefined) => void, label: string): HTMLInputElement {
  const i = h('input', { type: 'number', step: 1, min: 0, inputmode: 'numeric', value: value === undefined ? '' : String(value),
    placeholder: `${fallback} (default)`, 'aria-label': label, title: 'Leave empty to use the item’s price' });
  i.addEventListener('input', () => { const v = parseFloat(i.value); onchange(i.value.trim() === '' || !Number.isFinite(v) ? undefined : Math.max(0, Math.round(v))); });
  return i;
}

/** Imported audio files and a preview player (set by the editor). */
let audioFiles: () => string[] = () => [];
let previewSound: (src: string) => void = () => {};
export function setAudioHooks(files: () => string[], preview: (src: string) => void): void { audioFiles = files; previewSound = preview; }
/** Play a sound in the editor (a built-in effect's name, or a file). */
export function playSound(src: string): void { previewSound(src); }
const previewButton = (play: () => void) => h('button', { type: 'button', class: 'btn small', onclick: play }, '▶ Preview');

/** A sound to pick (none, a built-in effect or an imported file), with a preview button. */
export function soundField(label: string, value: string | undefined, set: (v: string | undefined) => void, hint?: string): HTMLElement {
  const opts: [string, string][] = [['', 'None'], ...audioFiles().map((f) => [f, f.startsWith('audio/') ? f.slice(6) : f.split('/').pop()!] as [string, string]), ...SFX_NAMES.map((n) => [n, `${SFX_LABELS[n]} (built-in)`] as [string, string])];
  let cur = value ?? '';
  return field(label, h('div', { class: 'field-row audio-row' }, select(opts, cur, (v) => { cur = v; set(v || undefined); }), previewButton(() => { if (cur) previewSound(cur); })), hint);
}
/** Choices for a prop's walk sound: the ground's, a ground sound, or any sound file or effect. */
export function walkSoundOptions(): [string, string][] {
  const ground: [string, string][] = [['wood', 'Wood'], ['stone', 'Stone'], ['metal', 'Metal'], ['carpet', 'Carpet / rug'], ['grass', 'Grass'], ['dirt', 'Dirt'], ['sand', 'Sand'], ['snow', 'Snow'], ['water', 'Water (splashing)']];
  return [['', 'The ground’s (bridges: their wood or stone)'], ...ground.map(([v, l]) => [v, `Footsteps: ${l}`] as [string, string]),
    ...audioFiles().map((f) => [f, f.startsWith('audio/') ? f.slice(6) : f.split('/').pop()!] as [string, string]),
    ...SFX_NAMES.map((n) => [n, `${SFX_LABELS[n]} (built-in)`] as [string, string])];
}
/** A prop's walk sound field, with a ▶ to hear it. */
export function walkSoundField(value: string | undefined, set: (v: string | undefined) => void): HTMLElement {
  let cur = value ?? '';
  const hear = (v: string) => (/^(wood|stone|metal|carpet|grass|dirt|sand|snow|water)$/.test(v) ? `step${v[0].toUpperCase()}${v.slice(1)}` : v);
  return field('Walk sound', h('div', { class: 'field-row audio-row' }, select(walkSoundOptions(), cur, (v) => { cur = v; set(v || undefined); }), previewButton(() => { if (cur) previewSound(hear(cur)); })),
    'The hero’s footsteps on it (a bridge, a rug, a wooden floor). The Footsteps ones use the ground sounds (Database → Audio can swap in your own, like foot_step_wood); or pick any sound file.');
}
const soundName = (src: string) => (SFX_LABELS as Record<string, string>)[src] ?? src.split('/').pop() ?? src;
function loopName(src: string): string {
  const b = src.startsWith('builtin:') ? src.slice(8) : '';
  return (MUSIC_NAMES as Record<string, string>)[b] ?? (AMBIENCE_NAMES as Record<string, string>)[b] ?? src.split('/').pop() ?? src;
}

/** Items offered by condition forms (set by the editor that owns the database). */
let conditionItems: () => [string, string][] = () => [];
export function setConditionItems(fn: () => [string, string][]): void { conditionItems = fn; }

export function conditionForm(initial: Condition | undefined, onchange: (c: Condition) => void, allowNone: true, onNone: () => void): HTMLElement;
export function conditionForm(initial: Condition, onchange: (c: Condition) => void, allowNone: false): HTMLElement;
export function conditionForm(initial: Condition | undefined, onchange: (c: Condition) => void, allowNone: boolean, onNone?: () => void): HTMLElement {
  const wrap = h('div', { class: 'condition' });
  let cur: Condition | undefined = initial ? (JSON.parse(JSON.stringify(initial)) as Condition) : undefined;
  const render = () => {
    const kind = !cur ? 'none' : 'quest' in cur ? ('objective' in cur ? 'objective' : 'quest') : 'switch' in cur ? 'switch' : 'self' in cur ? 'self' : 'item' in cur ? 'item' : 'gold' in cur ? 'gold' : 'weekday' in cur ? 'weekday' : 'moon' in cur ? 'moon' : 'temp' in cur ? 'temp' : 'weather' in cur ? 'weather' : 'heroHas' in cur ? 'heroHas' : 'date' in cur ? 'date' : 'relation' in cur ? 'relation' : 'rpDate' in cur ? 'rpDate' : 'rp' in cur ? 'rp' : 'var';
    const kinds: [string, string][] = [...(allowNone ? [['none', 'Always'] as [string, string]] : []), ['switch', 'Switch'], ['self', 'Self switch (this event)'], ['var', 'Variable'], ['item', 'Has item'], ['gold', 'Has gold'], ['quest', 'Quest'], ['objective', 'Quest objective'], ['weekday', 'Day of the week (real world)'], ['date', 'Date (real world: a holiday, a week of it)'], ['moon', 'Moon phase (real world)'], ['temp', 'Temperature'], ['weather', 'Weather'], ['heroHas', 'A hero is (Freezing, Poisoned, Well Rested…)'], ['relation', 'Relationship (how one hero rates another)'], ['rp', 'Roleplay (a hero’s Favourite food is…)'], ['rpDate', 'Roleplay date (today is a hero’s Birthday…)']];
    const firstQuest = questDefs()[0];
    const kindSel = select(kinds, kind, (v) => {
      cur = v === 'none' ? undefined : v === 'switch' ? { switch: '', is: true } : v === 'self' ? { self: 'A', is: true } : v === 'item' ? { item: conditionItems()[0]?.[0] ?? '', count: 1 }
        : v === 'gold' ? { gold: 100 } : v === 'weekday' ? { weekday: [6] } : v === 'moon' ? { moon: ['full'] } : v === 'temp' ? { temp: 90, op: '>=' } : v === 'weather' ? { weather: ['rain', 'storm'] } : v === 'heroHas' ? { heroHas: 'freezing', hero: 'any' } : v === 'date' ? { date: '10-31' } : v === 'relation' ? { relation: relRaters()[0]?.[0] ?? '', of: '', op: '>=', value: 60 } : v === 'rp' ? { rp: dbNow?.().roleplay?.[0]?.id ?? '', hero: '', is: '' } : v === 'rpDate' ? { rpDate: dbNow?.().roleplay?.find((f) => f.type === 'date')?.id ?? '', hero: '' } : v === 'quest' ? { quest: firstQuest?.id ?? '', is: 'started' }
        : v === 'objective' ? { quest: firstQuest?.id ?? '', objective: firstQuest?.objectives[0]?.id ?? '', done: true } : { var: '', op: '>=', value: 1 };
      if (cur) onchange(cur); else onNone?.();
      render();
    }, { 'aria-label': 'Condition type' });
    const parts: HTMLElement[] = [field(allowNone ? 'Active when' : 'Condition', kindSel)];
    if (cur && 'quest' in cur) {
      const c = cur;
      if ('objective' in c) {
        parts.push(field('Quest', select(questChoices(c.quest), c.quest, (v) => { c.quest = v; c.objective = objectiveChoices(v, undefined)[0][0]; onchange(c); render(); })),
          h('div', { class: 'field-row' },
            field('Objective', select(objectiveChoices(c.quest, c.objective), c.objective, (v) => { c.objective = v; onchange(c); })),
            field('Is', select([['done', 'Done'], ['not', 'Not done']], c.done === false ? 'not' : 'done', (v) => { c.done = v === 'done' ? true : false; onchange(c); }))));
      } else {
        parts.push(h('div', { class: 'field-row' },
          field('Quest', select(questChoices(c.quest), c.quest, (v) => { c.quest = v; onchange(c); })),
          field('Is', select(QUEST_STATUS_NAMES, c.is, (v) => { c.is = v as QuestStatus | 'started'; onchange(c); }))));
      }
    } else if (cur && 'switch' in cur) {
      const c = cur;
      parts.push(field('Switch', switchInput(c.switch, (v) => { c.switch = v; onchange(c); })),
        field('Is', select([['on', 'ON'], ['off', 'OFF']], c.is === false ? 'off' : 'on', (v) => { c.is = v === 'on'; onchange(c); })));
    } else if (cur && 'self' in cur) {
      const c = cur;
      parts.push(h('div', { class: 'field-row' },
        field('Self switch', select(SELF_SWITCHES.map((l) => [l, l] as [string, string]), c.self, (v) => { c.self = v as SelfSwitch; onchange(c); })),
        field('Is', select([['on', 'ON'], ['off', 'OFF']], c.is === false ? 'off' : 'on', (v) => { c.is = v === 'on'; onchange(c); }))),
        h('p', { class: 'hint' }, 'This event’s own switch (Set self switch). In a Conditional branch it means the event running the commands.'));
    } else if (cur && 'item' in cur) {
      const c = cur;
      const opts = conditionItems();
      if (c.item && !opts.some(([id]) => id === c.item)) opts.unshift([c.item, `${c.item} (missing)`]);
      parts.push(h('div', { class: 'field-row' },
        field('Item', select(opts.length ? opts : [['', '(no items yet)']], c.item, (v) => { c.item = v; onchange(c); })),
        field('At least', numberInput(c.count ?? 1, (v) => { c.count = Math.max(1, Math.round(v)); onchange(c); }, { step: 1, min: 1 }))));
    } else if (cur && 'weekday' in cur) {
      const c = cur;
      parts.push(field('On', h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px 12px' }, ...WEEKDAYS.map((name, d) => checkbox(name.slice(0, 3), c.weekday.includes(d), (on) => {
        c.weekday = on ? [...new Set([...c.weekday, d])].sort() : c.weekday.filter((x) => x !== d); onchange(c);
      }))), 'The player’s own date: an event page that only shows on Saturdays, say (a market, a rare enemy).'));
    } else if (cur && 'temp' in cur) {
      const c = cur;
      parts.push(h('div', { class: 'field-row' },
        field('Temperature here is', select([['>=', 'at least'], ['<=', 'at most']], c.op, (v) => { c.op = v as '>=' | '<='; onchange(c); })),
        field('°F', numberInput(c.temp, (v) => { c.temp = Math.round(v); onchange(c); }, { step: 1 }))),
        h('p', { class: 'hint' }, 'The temperature on the map the player is on (season, time of day, weather and the map’s climate). 32°F is freezing.'));
    } else if (cur && 'weather' in cur) {
      const c = cur;
      parts.push(field('When the weather is', h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px 12px' }, ...WEATHER_KINDS.map((k) => checkbox(WEATHER_NAMES[k], c.weather.includes(k), (on) => {
        c.weather = on ? WEATHER_KINDS.filter((x) => x === k || c.weather.includes(x)) : c.weather.filter((x) => x !== k); onchange(c);
      }))), 'The weather on the map the player is on (Clear: none).'));
    } else if (cur && 'date' in cur) {
      const c = cur;
      const untilWrap = h('span', {}, monthDayInput(c.until ?? c.date, (v) => { c.until = v; onchange(c); }, 'Until'));
      untilWrap.hidden = !c.until;
      parts.push(field('On', monthDayInput(c.date, (v) => { c.date = v; onchange(c); }, 'Date')),
        checkbox('A range of days (up to and including)', !!c.until, (on) => { if (on) c.until = c.date; else delete c.until; untilWrap.hidden = !on; onchange(c); }),
        untilWrap,
        h('p', { class: 'hint' }, 'The player’s own date, any year: a pumpkin on Halloween (Oct 31), decorations the week before (Oct 24 – Oct 31). A range can wrap past New Year (Dec 20 – Jan 5).'));
    } else if (cur && 'rpDate' in cur) {
      const c = cur, fields = (dbNow?.().roleplay ?? []).filter((f) => f.type === 'date');
      parts.push(h('div', { class: 'field-row' },
        field('Hero', select(relTargets(), c.hero, (v) => { c.hero = v; onchange(c); })),
        field('Date', select(fields.length ? fields.map((f) => [f.id, f.title] as [string, string]) : [['', '(add a Date title in Party → Roleplay)']], c.rpDate, (v) => { c.rpDate = v; onchange(c); })),
        field('Or within (days ahead)', numberInput(c.within ?? 0, (v) => { const n = Math.max(0, Math.round(v)); if (n) c.within = n; else delete c.within; onchange(c); }, { step: 1, min: 0, max: 60 }))),
        h('p', { class: 'hint' }, 'The player’s real date (the game’s date is the real one). 0: only on the day; 3: the three days before it too.'));
    } else if (cur && 'rp' in cur) {
      const c = cur, fields = dbNow?.().roleplay ?? [];
      parts.push(h('div', { class: 'field-row' },
        field('Hero', select(relTargets(), c.hero, (v) => { c.hero = v; onchange(c); })),
        field('Title', select(fields.length ? fields.map((f) => [f.id, f.title] as [string, string]) : [['', '(add titles in Party → Roleplay)']], c.rp, (v) => { c.rp = v; onchange(c); })),
        field('Is', textInput(c.is, (v) => { c.is = v.trim(); onchange(c); }, { placeholder: 'Ramen' }))),
        h('p', { class: 'hint' }, 'Their answer on the Heroes tab (Roleplay), upper and lower case aside.'));
    } else if (cur && 'relation' in cur) {
      const c = cur;
      parts.push(h('div', { class: 'field-row' },
        field('Who', select(relRaters(), c.relation, (v) => { c.relation = v; onchange(c); })),
        field('Rates', select(relTargets(), c.of, (v) => { c.of = v; onchange(c); }))),
        h('div', { class: 'field-row' },
          field('At', select([['>=', 'least'], ['<=', 'most']], c.op, (v) => { c.op = v as '>=' | '<='; onchange(c); })),
          field('Points (0 … 100)', numberInput(c.value, (v) => { c.value = Math.max(0, Math.min(100, Math.round(v))); onchange(c); }, { step: 5, min: 0, max: 100 }))),
        h('p', { class: 'hint' }, 'Their rating of the other one: Like is 60+, Close 75+, Best friends 90+; Dislike under 30, Hate under 15. Eleanor hating the hero (Eleanor rates the hero at most 14) can open her own dialogue or quest.'));
    } else if (cur && 'heroHas' in cur) {
      const c = cur;
      parts.push(h('div', { class: 'field-row' },
        field('Who', select(heroWhoChoices('any'), c.hero ?? '', (v) => { c.hero = v; onchange(c); })),
        field('Is', select([['yes', 'is'], ['no', 'is not']], c.is === false ? 'no' : 'yes', (v) => { c.is = v === 'yes' ? undefined : false; onchange(c); })),
        field('State', select(HERO_STATES, c.heroHas, (v) => { c.heroHas = v; onchange(c); }))),
        h('p', { class: 'hint' }, 'Their weather state, an ailment, or a good state from resting. Anyone: true if at least one of the party is.'));
    } else if (cur && 'moon' in cur) {
      const c = cur;
      parts.push(field('When the moon is', h('div', { style: 'display:flex;flex-wrap:wrap;gap:4px 12px' }, ...MOON_PHASES.map((ph) => checkbox(MOON_NAMES[ph], c.moon.includes(ph), (on) => {
        c.moon = on ? MOON_PHASES.filter((x) => x === ph || c.moon.includes(x)) : c.moon.filter((x) => x !== ph); onchange(c);
      }))), `The real moon, from the player’s date (tonight: ${MOON_NAMES[moonPhase()].toLowerCase()}). Full and new moons last about two days.`));
    } else if (cur && 'gold' in cur) {
      const c = cur;
      parts.push(field('At least (gold)', numberInput(c.gold, (v) => { c.gold = Math.max(0, Math.round(v)); onchange(c); }, { step: 1, min: 0 })));
    } else if (cur) {
      const c = cur;
      parts.push(field('Variable', textInput(c.var, (v) => { c.var = v.trim(); onchange(c); }, { list: 'dl-vars', placeholder: 'e.g. gold' })),
        h('div', { class: 'field-row' },
          field('Compare', select([['>=', '≥'], ['>', '>'], ['==', '='], ['<', '<'], ['<=', '≤']], c.op, (v) => { c.op = v as typeof c.op; onchange(c); })),
          field('Value', numberInput(c.value, (v) => { c.value = v; onchange(c); }, { step: 1 }))));
    }
    wrap.replaceChildren(...parts);
  };
  render();
  return wrap;
}

/** Buttons over a message's text: wrap the selected words in a style or colour tag (see ui/richText.ts). */
function formatBar(ta: HTMLTextAreaElement, changed: () => void): HTMLElement {
  const wrap = (open: string, close: string) => {
    const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a, sel = ta.value.slice(a, b) || 'text';
    ta.value = ta.value.slice(0, a) + open + sel + close + ta.value.slice(b);
    ta.focus();
    ta.setSelectionRange(a + open.length, a + open.length + sel.length);
    changed();
  };
  const btn = (label: string, title: string, tag: string, style = '') => h('button', { type: 'button', class: 'fmt-btn', title, style, onmousedown: (e: Event) => e.preventDefault(), onclick: () => wrap(`[${tag}]`, `[/${tag}]`) }, label);
  const custom = h('input', { type: 'color', value: '#5ab8ff', title: 'Any colour: pick it, then click ◼', 'aria-label': 'Custom colour' }) as HTMLInputElement;
  const named = textColors(dbNow?.().textColors).map((c) => h('button', { type: 'button', class: 'fmt-swatch', title: `${c.name}: [${c.id}]…[/${c.id}]`, style: `background:${c.color}`, onmousedown: (e: Event) => e.preventDefault(), onclick: () => wrap(`[${c.id}]`, `[/${c.id}]`) }));
  return h('div', { class: 'fmt-bar', role: 'toolbar', 'aria-label': 'Style the selected words' },
    btn('B', 'Bold', 'b', 'font-weight:900'), btn('I', 'Italic', 'i', 'font-style:italic'), btn('S', 'Strikethrough', 's', 'text-decoration:line-through'), btn('U', 'Underline', 'u', 'text-decoration:underline'),
    btn('Glow', 'Glowing', 'glow'), btn('Outline', 'Outlined', 'outline'),
    h('span', { class: 'fmt-sep' }), ...named,
    h('span', { class: 'fmt-sep' }), custom,
    h('button', { type: 'button', class: 'fmt-btn', title: 'Colour the selected words with the picked colour', onmousedown: (e: Event) => e.preventDefault(), onclick: () => wrap(`[color=${custom.value}]`, '[/color]') }, '◼'));
}

/** A message's own look (the same settings word bubbles have): off by default, so the window's style shows. */
export function lookFields(d: { look?: TextLook }, changed: () => void, label = 'Give this message its own look', seed: () => TextLook = () => ({ color: '#fff6dc', bubble: '#0e1222' })): HTMLElement[] {
  const box = h('div', { class: 'look-fields' });
  const draw = () => {
    const l = d.look;
    box.replaceChildren(checkbox(label, !!l, (v) => { if (v) d.look = seed(); else delete d.look; draw(); changed(); }));
    if (!l) return;
    const color = (value: string, set: (v: string) => void, label: string) => {
      const i = h('input', { type: 'color', value, 'aria-label': label }) as HTMLInputElement;
      i.addEventListener('input', () => { set(i.value); changed(); });
      return i;
    };
    const tick = (label: string, on: boolean, set: (v: boolean) => void) => checkbox(label, on, (v) => { set(v); draw(); changed(); });
    box.append(
      h('div', { class: 'field-row bubble-colors' },
        field('Text', color(l.color ?? '#fff6dc', (v) => (l.color = v), 'Text colour')),
        field('Box', color(l.bubble ?? '#0e1222', (v) => (l.bubble = v), 'Box colour')),
        field('Outline', color(l.outline ?? '#000000', (v) => (l.outline = v), 'Outline colour')),
        field('Text size', numberInput(l.size ?? 21, (v) => { l.size = Math.max(8, Math.min(96, Math.round(v))); changed(); }, { min: 8, max: 96, step: 1 }))),
      h('div', { class: 'checks' },
        tick('See-through box (just the text)', !!l.transparent, (v) => (l.transparent = v || undefined)),
        tick('Bold', !!l.bold, (v) => (l.bold = v || undefined)),
        tick('Italic', !!l.italic, (v) => (l.italic = v || undefined)),
        tick('Strikethrough', !!l.strike, (v) => (l.strike = v || undefined)),
        tick('Outlined', !!l.outline, (v) => { if (v) l.outline ??= '#000000'; else delete l.outline; }),
        tick('Glowing', !!l.glow, (v) => (l.glow = v || undefined))));
  };
  draw();
  return [h('div', { class: 'section-label' }, 'Look'), box];
}
