/**
 * Mimas: enemies with Pokémon-style moves. Their four moves (Additions or spells, from Database → Enemies, a level's
 * moveset, or a trainer's override) become the battle actions Saturn's TurnBattle already plays: an Addition is an
 * attack with its strikes' power added up; a damage spell is a magic attack (power over its own damage, so its
 * level growth counts) costing MP; a healing spell heals; a support spell gives its buffs.
 */
import { additionList, spellList } from '../game/abilities';
import { MAX_MOVES, movesAt } from '../gba/moves';
import type { Database, EnemyAction, EnemyDef, MoveRef } from '../world/types';

export function foeActions(db: Database, def: EnemyDef, level: number, override?: MoveRef[]): EnemyAction[] {
  const out: EnemyAction[] = [];
  for (const r of movesAt(def, level, override).slice(0, MAX_MOVES)) {
    if (r.addition) {
      const a = additionList(db).find((x) => x.id === r.addition);
      if (!a) continue;
      out.push({ name: a.name, kind: 'attack', power: a.strikes.reduce((s, x) => s + x.power, 0), element: a.element, inflicts: a.inflicts, look: { effect: a.effect, burst: a.burst, element: a.element, inflicts: a.inflicts } });
    } else if (r.spell) {
      const s = spellList(db).find((x) => x.id === r.spell);
      if (!s) continue;
      const look = { effect: s.effect, burst: s.burst, element: s.element, inflicts: s.inflicts };
      if (s.kind === 'heal') out.push({ name: s.name, kind: 'heal', power: 35, mp: s.mp, look });
      else if (s.kind === 'support') out.push({ name: s.name, kind: 'buff', buffs: s.buffs, buffTarget: s.supportTarget === 'foes' ? 'foes' : 'self', targets: s.targets, weather: s.weather, weatherTurns: s.weatherTurns, mp: s.mp, look });
      else out.push({ name: s.name, kind: 'spell', power: s.power / Math.max(1, def.damage), element: s.element, inflicts: s.inflicts, targets: s.targets, mp: s.mp, look });
    }
  }
  return out;
}
