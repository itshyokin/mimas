/**
 * Mimas: every built-in line the GBA game says (battles, menus, saving, shops, learning) and its command words.
 *
 * Each line has a default (shown greyed in Database → Text & dialog); typing replaces it, Reset brings it back.
 * A line can have several versions: one is picked at random each time (in the playtest and the ROM).
 * Fill-ins: {name} the hero, {foe} the enemy, {target} who it's done to, {move} a move or spell, {item} an item,
 * {n} a number, {level} a level. "A {foe}" becomes "An …" before a vowel ("An Owlbear leaps out!").
 *
 * Stored in the database as `gbaText` (only lines that differ from the default). The ROM gets them through
 * tools/gba_game.py (gba_game.json `text`, keyed by name: the ROM gets a T_<key> number for each), so keep the keys stable.
 */
import type { Database } from '../world/types';

export interface TextLine {
  key: string;
  group: string;
  /** What the line is for, in the editor. */
  label: string;
  /** The built-in versions (one is picked at random). */
  def: string[];
  /** A word (a command or menu label): one version, short. */
  word?: boolean;
  /** Only the playtest uses it (the ROM doesn't have this moment). */
  playtestOnly?: boolean;
}

const L = (group: string, key: string, label: string, ...def: string[]): TextLine => ({ key, group, label, def });
const W = (group: string, key: string, label: string, word: string): TextLine => ({ key, group, label, def: [word], word: true });

export const TEXT_GROUPS = ['Command words', 'Battle: start', 'Battle: moves', 'Battle: hits', 'Battle: ailments', 'Battle: end', 'Battle: running and swapping', 'Learning', 'Items', 'Party', 'Saving', 'Shops'] as const;

/** Every line, by group. */
export const TEXT_LINES: TextLine[] = [
  W('Command words', 'cmd.attack', 'Battle: attack', 'ATTACK'),
  W('Command words', 'cmd.items', 'Battle: items', 'ITEMS'),
  W('Command words', 'cmd.swap', 'Battle: swap heroes', 'SWAP'),
  W('Command words', 'cmd.flee', 'Battle: run away', 'FLEE'),
  W('Command words', 'menu.party', 'START menu: party', 'PARTY'),
  W('Command words', 'menu.bag', 'START menu: bag', 'BAG'),
  W('Command words', 'menu.save', 'START menu: save', 'SAVE'),
  W('Command words', 'menu.exit', 'START menu: close', 'EXIT'),

  L('Battle: start', 'battle.appear', 'A random battle starts', 'A {foe} leaps out!'),
  L('Battle: start', 'battle.appear_event', 'A battle from an event or a trainer starts', '{foe} appears!'),
  L('Battle: start', 'battle.ask', 'Choosing what to do', '{name} stands ready.'),

  L('Battle: moves', 'battle.attack', 'The hero attacks (no move)', '{name} attacks!'),
  L('Battle: moves', 'battle.addition', 'The hero uses an Addition', '{name} attacks with {move}!'),
  L('Battle: moves', 'battle.spell', 'The hero casts a spell', '{name} casts {move}!'),
  L('Battle: moves', 'battle.guard_move', 'The hero uses a guard move', '{name} uses {move}!'),
  L('Battle: moves', 'battle.guarding', 'Guarding', '{name} is guarding!'),
  L('Battle: moves', 'battle.guard_heal', 'Guarding, with health back', '{name} is guarding and got back {n} HP!'),
  L('Battle: moves', 'battle.heal', 'A healing spell', '{name} recovered health!'),
  L('Battle: moves', 'battle.foe_attack', 'A foe attacks (no move)', '{foe} attacks!'),
  L('Battle: moves', 'battle.foe_addition', 'A foe uses an Addition', '{foe} attacks with {move}!'),
  L('Battle: moves', 'battle.foe_spell', 'A foe casts a spell', '{foe} casts {move}!'),
  L('Battle: moves', 'battle.foe_heal', 'A foe heals itself', '{foe} recovered health!'),
  L('Battle: moves', 'battle.no_mp', 'Not enough MP', 'Not enough MP!'),
  L('Battle: moves', 'battle.silenced', 'Silenced (no spells)', 'Silenced: no spells!'),

  L('Battle: hits', 'battle.crit', 'A critical hit', 'A critical hit!'),
  L('Battle: hits', 'battle.weak', 'A weakness', 'Struck a weakness!'),
  L('Battle: hits', 'battle.resist', 'Resisted', 'It was resisted…'),
  L('Battle: hits', 'battle.immune', 'Immune', '{target} is immune!'),
  L('Battle: hits', 'battle.absorb', 'Absorbed (it heals them)', '{target} absorbed it!'),
  L('Battle: hits', 'battle.miss', 'A blind attacker misses', '{name}’s attack missed!'),
  L('Battle: hits', 'battle.dodge', 'Dodged', '{target} dodged it!'),
  L('Battle: hits', 'battle.hits', 'A move hit several times', 'Hit {n} times!'),

  L('Battle: ailments', 'ail.poison', 'Poisoned', '{target} is poisoned!'),
  L('Battle: ailments', 'ail.burn', 'Burned', '{target} is burned!'),
  L('Battle: ailments', 'ail.paralyze', 'Paralyzed', '{target} is paralyzed!'),
  L('Battle: ailments', 'ail.sleep', 'Asleep', '{target} falls asleep!'),
  L('Battle: ailments', 'ail.frozen', 'Frozen', '{target} is frozen solid!'),
  L('Battle: ailments', 'ail.confusion', 'Confused', '{target} is confused!'),
  L('Battle: ailments', 'ail.blind', 'Blinded', '{target} is blinded!'),
  L('Battle: ailments', 'ail.silence', 'Silenced', '{target} is silenced!'),
  L('Battle: ailments', 'ail.still_asleep', 'Still asleep (turn lost)', '{name} is fast asleep.'),
  L('Battle: ailments', 'ail.woke', 'Woke up', '{name} wakes up!'),
  L('Battle: ailments', 'ail.still_frozen', 'Still frozen (turn lost)', '{name} is frozen solid!'),
  L('Battle: ailments', 'ail.thawed', 'Thawed', '{name} thaws out!'),
  L('Battle: ailments', 'ail.cant_move', 'Paralyzed (turn lost)', '{name} can’t move!'),
  L('Battle: ailments', 'ail.still_confused', 'Still confused', '{name} is confused!'),
  L('Battle: ailments', 'ail.snapped', 'No longer confused', '{name} snaps out of it!'),
  L('Battle: ailments', 'ail.hurt_self', 'Hurt in confusion', '{name} stumbles and gets hurt!'),
  L('Battle: ailments', 'ail.poison_hurt', 'Hurt by poison', '{name} is hurt by poison!'),
  L('Battle: ailments', 'ail.burn_hurt', 'Hurt by a burn', '{name} is hurt by the burn!'),
  L('Battle: ailments', 'ail.sight', 'Blindness wore off', '{name} can see again!'),
  L('Battle: ailments', 'ail.voice', 'Silence wore off', '{name} can cast again!'),

  L('Battle: end', 'battle.defeated', 'A foe is beaten', '{foe} is defeated!'),
  L('Battle: end', 'battle.down', 'A hero falls', '{name} collapses!'),
  L('Battle: end', 'battle.all_down', 'Every hero has fallen', 'There’s no one left to fight!'),
  L('Battle: end', 'battle.exp', 'EXP', '{name} gained {n} EXP!'),
  L('Battle: end', 'battle.level', 'A level up', '{name} reached level {level}!'),
  L('Battle: end', 'battle.gold', 'Money for winning', 'You earned ${n}!'),

  L('Battle: running and swapping', 'battle.fled', 'Got away', 'You got away!'),
  L('Battle: running and swapping', 'battle.no_escape', 'Couldn’t get away', 'No way out!'),
  L('Battle: running and swapping', 'battle.cant_run', 'Running isn’t allowed (bosses, trainers)', 'There’s no running from this fight!'),
  L('Battle: running and swapping', 'battle.swap_out', 'A hero is swapped out', '{name} steps back.'),
  L('Battle: running and swapping', 'battle.step_in', 'A hero (or the next foe) steps in', '{name} steps in!'),
  L('Battle: running and swapping', 'battle.send_who', 'Choosing who goes in', 'Send in whom?'),
  L('Battle: running and swapping', 'battle.no_items', 'Nothing in the bag to use', 'There’s nothing to use.'),
  L('Battle: running and swapping', 'battle.no_one', 'No one else to swap in', 'There’s no one else to send in.'),
  L('Battle: running and swapping', 'battle.cant_fight', 'That hero is down', 'They’re in no shape to fight!'),
  L('Battle: running and swapping', 'battle.already', 'That hero is already out', 'They’re already fighting!'),

  L('Learning', 'learn.learned', 'A move learned', '{name} learned {move}!'),
  L('Learning', 'learn.knows', 'Already known', '{name} already knows {move}.'),

  L('Items', 'item.no_effect', 'An item that wouldn’t do anything', 'It won’t have any effect.'),
  L('Items', 'item.revived', 'A hero revived', '{name} was revived!'),
  L('Items', 'item.equipped', 'Gear put on', '{name} equipped {item}.'),

  L('Party', 'party.joined', 'A hero joins', '{name} joined the party!'),
  L('Party', 'party.left', 'A hero leaves', '{name} left the party.'),

  L('Saving', 'save.ask', 'Asking to save', 'Would you like to save the game?'),
  L('Saving', 'save.done', 'Saved', '{name} saved the game!'),

  L('Shops', 'shop.hello', 'Walking in', 'Welcome! What can I get you?'),
  L('Shops', 'shop.again', 'After buying or selling', 'Anything else?'),
  L('Shops', 'shop.thanks', 'A sale', 'Thank you kindly!'),
  L('Shops', 'shop.bye', 'Leaving', 'Come back anytime!'),
  L('Shops', 'shop.no_money', 'Not enough money', 'You don’t have enough money.'),
  L('Shops', 'shop.no_room', 'No room in the bag', 'You have no room for it.'),
];

export const TEXT_BY_KEY: ReadonlyMap<string, TextLine> = new Map(TEXT_LINES.map((l) => [l.key, l]));

export type TextVars = Partial<Record<'name' | 'foe' | 'target' | 'move' | 'item' | 'n' | 'level', string | number>>;

/** The versions of a line: yours, else the default. */
export function lineVersions(db: Pick<Database, 'gbaText'> | undefined, key: string): string[] {
  const own = (db?.gbaText?.[key] ?? []).filter((s) => s.trim());
  return own.length ? own : TEXT_BY_KEY.get(key)?.def ?? [key];
}

/** Put the fill-ins into a line ("A {foe}" → "An" before a vowel). */
export function fillLine(text: string, vars: TextVars): string {
  const val = (k: string) => (k in vars ? String(vars[k as keyof TextVars]) : `{${k}}`);
  return text
    .replace(/\b([Aa]) \{(\w+)\}/g, (_m, a: string, k: string) => { const v = val(k); return `${/^[AEIOUaeiou]/.test(v) ? `${a}n` : a} ${v}`; })
    .replace(/\{(\w+)\}/g, (_m, k: string) => val(k));
}

/** A line, ready to show: one of its versions at random, filled in. */
export function gbaLine(db: Pick<Database, 'gbaText'> | undefined, key: string, vars: TextVars = {}): string {
  const v = lineVersions(db, key);
  return fillLine(v[Math.floor(Math.random() * v.length)] ?? '', vars);
}

/** A command word. */
export const gbaWord = (db: Pick<Database, 'gbaText'> | undefined, key: string): string => lineVersions(db, key)[0];

/** Only what differs from the defaults (and no empty versions). */
export function cleanText(text: Record<string, string[]> | undefined): Record<string, string[]> | undefined {
  const out: Record<string, string[]> = {};
  for (const [k, list] of Object.entries(text ?? {})) {
    const def = TEXT_BY_KEY.get(k)?.def;
    const own = list.map((s) => s.trim()).filter(Boolean);
    if (!def || !own.length || JSON.stringify(own) === JSON.stringify(def)) continue;
    out[k] = own;
  }
  return Object.keys(out).length ? out : undefined;
}
