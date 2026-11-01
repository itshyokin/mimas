/**
 * The heroes (Database → Heroes): the one you play is the first. Helpers shared by the game and the editor.
 */
import type { CreationSettings, Database, HeroDef } from './types';
import { attrsFrom, type Attrs, type CreationMethod } from '../game/attributes';

/** The hero you play: the database's first, or one made from the player's look. */
export function mainHero(db: Database): HeroDef {
  return db.heroes?.[0] ?? { id: 'hero', name: 'Hero', look: db.player };
}

/** A hero's starting stats (10 each where unset). */
export const heroBase = (h: HeroDef | undefined): Attrs => attrsFrom(h?.stats);

/** Character creation settings with defaults: on, with rolling, point buy and the standard array. */
export function creation(db: Database): Required<Pick<CreationSettings, 'enabled' | 'rerolls'>> & { methods: CreationMethod[] } {
  const c = mainHero(db).creation ?? {};
  const methods = (c.methods?.length ? c.methods : ['roll', 'pointBuy', 'array']) as CreationMethod[];
  return { enabled: c.enabled !== false, methods, rerolls: Math.max(0, Math.round(c.rerolls ?? 0)) };
}
