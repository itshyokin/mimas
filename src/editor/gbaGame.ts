/**
 * Mimas: the game's numbers for the ROM, worked out with the game's own rules and written to
 * public/data/gba_game.json when a GBA map is saved. tools/export.py turns it into the ROM's tables, so the GBA game
 * fights with the same numbers as the playtest: heroes (stats, growth, moves, spells, gear), Additions, spells, items,
 * enemies, troops and the EXP table.
 */
import { additionList, spellAtRank, spellList, spellMaxRank } from '../game/abilities';
import { attrsFrom } from '../game/attributes';
import { enemyAgility } from '../game/battle/rules';
import { combatConfig, xpToNext } from '../game/combat/config';
import { configFromDb } from '../game/stats';
import { levelGains, ranksOf } from '../game/statRanks';
import { mainHero } from '../world/heroes';
import type { Database } from '../world/types';

export function romGameData(db: Database): unknown {
  const cfg = combatConfig(db.combat), base = configFromDb(db).max, tb = cfg.turnBased;
  const maxLevel = Math.max(2, cfg.maxLevel ?? 50);
  const heroes = db.heroes?.length ? db.heroes : [mainHero(db)];
  return {
    v: 1,
    moveSlots: tb.moveSlots,
    partyDamage: tb.partyDamage, enemyDamage: tb.enemyDamage, flee: tb.flee,
    maxLevel,
    xp: Array.from({ length: maxLevel - 1 }, (_, i) => xpToNext(cfg, i + 1)),
    base: { hp: base.hp, mp: base.mp },
    unarmed: cfg.unarmedDamage * cfg.classes.unarmed.damage,
    heroes: heroes.map((h, i) => ({
      id: h.id, name: h.name, first: i === 0, startsInParty: i === 0 || !!h.startsInParty, joinLevel: h.joinLevel ?? 0,
      stats: attrsFrom(h.stats), gains: levelGains(ranksOf(h.ranks, undefined)),
      noAdditions: !!h.noAdditions,
      moves: h.noAdditions ? [] : [...new Set([...(h.defaultAddition ? [h.defaultAddition] : h.additions?.length ? [] : [additionList(db).find((d) => d.id === 'quick_strike')?.id ?? additionList(db)[0]?.id]), ...(h.additions ?? [])].filter(Boolean))],
      spells: h.spells ?? {}, gear: h.gear ?? {},
    })),
    additions: additionList(db).map((d) => ({ id: d.id, name: d.name, description: d.description ?? '', hits: d.strikes.length, power: d.strikes.reduce((s, x) => s + x.power, 0) })),
    spells: spellList(db).map((s) => ({ id: s.id, name: s.name, kind: s.kind, targets: s.targets ?? 'one', description: s.description ?? '',
      ranks: Array.from({ length: spellMaxRank(s) }, (_, r) => { const at = spellAtRank(s, r + 1); return { power: at.power, mp: at.mp }; }) })),
    items: (db.items ?? []).map((it) => {
      const w = it.weapon;
      const cls = w && w.class !== 'bow' ? w.class : null;
      return {
        id: it.id, name: it.name, kind: it.kind, slot: it.slot ?? null, price: it.price ?? 0, noSell: !!it.noSell, description: it.description ?? '',
        hp: it.restore?.hp ?? 0, mp: it.restore?.mp ?? 0, hpPct: it.restorePct?.hp ?? 0, mpPct: it.restorePct?.mp ?? 0, revive: !!it.revive,
        attack: cls ? w!.damage * cfg.classes[cls].damage : 0, defense: it.defense ?? 0, magicDefense: it.magicDefense ?? 0, bonus: it.bonus ?? {}, crit: it.crit ?? 0,
      };
    }),
    enemies: (db.enemies ?? []).map((e) => ({
      id: e.id, name: e.name, level: e.level ?? 1, hp: e.hp, attack: e.damage, magic: e.attackType === 'magic',
      defense: e.defense ?? 0, magicDefense: e.magicDefense ?? e.defense ?? 0, agility: enemyAgility(e), crit: e.crit ?? 5,
      xp: e.xp ?? 0, gold: Array.isArray(e.gold) ? e.gold : [0, 0], boss: !!e.boss,
    })),
    troops: (db.troops ?? []).map((t) => ({ id: t.id, members: t.members.map((m) => ({ enemy: m.enemy, min: m.min ?? 1, max: m.max ?? m.min ?? 1 })), pick: t.pick ?? 'all', noRun: !!t.noRun })),
  };
}
