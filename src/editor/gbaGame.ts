/**
 * Mimas: the game's numbers for the ROM, worked out with the game's own rules and written to
 * public/data/gba_game.json when a GBA map is saved. tools/export.py turns it into the ROM's tables, so the GBA game
 * fights with the same numbers as the playtest: heroes (stats, growth, moves, spells, gear), Additions, spells, items,
 * enemies, troops and the EXP table.
 */
import { additionList, spellAtRank, spellList, spellMaxRank } from '../game/abilities';
import { enemyAgility } from '../game/battle/rules';
import { combatConfig, xpToNext } from '../game/combat/config';
import { configFromDb } from '../game/stats';
import { mainHero } from '../world/heroes';
import type { Database, Element, Inflict, MoveRef } from '../world/types';
import { ELEMENT_LIST, elementResult } from '../game/elements';
import { effectSprites, moveEffects } from '../gba/effects';
import type { GbaData } from '../gba/types';
import { TEXT_LINES, lineVersions } from '../gba/text';
import { ATTRS } from '../game/attributes';
import { armorTypes, gearKindOf, gearKinds } from '../game/classes';
import { isSharedTree, skillsData } from '../game/skills';
import { classGrowth } from '../gbaplay/party';

/** The ailments the ROM knows (its order: their numbers there). */
export const ROM_AILMENTS = ['poison', 'burn', 'paralyze', 'sleep', 'chill', 'confusion', 'blind', 'silence'] as const;
/** Sounds the ROM plays besides each effect's (menus, battles, the field). */
export const ROM_SOUNDS = ['menuMove', 'menuOk', 'menuBack', 'encounter', 'hit', 'weak', 'thump', 'crit', 'defeat', 'levelUp', 'item', 'coin', 'save', 'target', 'dodge', 'jump', 'expDing', 'swing', 'rustle'];

const inflicts = (l: Inflict[] | undefined) => (l ?? []).filter((x) => (ROM_AILMENTS as readonly string[]).includes(x.ailment)).map((x) => ({ ailment: x.ailment, chance: x.chance }));
const refs = (l: MoveRef[] | undefined) => (l ?? []).slice(0, 4).map((r) => (r.addition ? { addition: r.addition } : { spell: r.spell }));

/** Where a sound's GBA version is written (8-bit mono WAV, baked by the editor on save). */
export function romSoundFile(name: string): string {
  const base = name.split('/').pop()!.replace(/\.[a-z0-9]+$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
  return `gba/sounds/${name.includes('/') ? `f_${base}` : base}.wav`;
}

/** Every sound the ROM needs: the fixed ones and each effect's. */
export function romSounds(gba: GbaData): string[] {
  return [...new Set([...ROM_SOUNDS, ...effectSprites(gba).map((s) => s.sound).filter((x): x is string => !!x)])];
}

export function romGameData(db: Database, gba: GbaData): unknown {
  const cfg = combatConfig(db.combat), base = configFromDb(db).max, tb = cfg.turnBased;
  const maxLevel = Math.max(2, cfg.maxLevel ?? 50);
  const heroes = db.heroes?.length ? db.heroes : [mainHero(db)];
  return {
    v: 1,
    // Database → Menus → Bars: the ROM's health / EXP colours and whether the meters have round ends.
    bars: { shape: db.menus?.barShape ?? (db.menus?.barsSquare ? 'rect' : 'pill'), hp: db.menus?.bars?.hp ?? null, xp: db.menus?.bars?.xp ?? null },
    partyDamage: tb.partyDamage, enemyDamage: tb.enemyDamage, flee: tb.flee,
    timing: tb.additionTiming, timingWindow: tb.timingWindow,
    maxLevel,
    xp: Array.from({ length: maxLevel - 1 }, (_, i) => xpToNext(cfg, i + 1)),
    base: { hp: base.hp, mp: base.mp },
    unarmed: cfg.unarmedDamage * cfg.classes.unarmed.damage,
    heroes: heroes.map((h, i) => ({
      id: h.id, name: h.name, first: i === 0, startsInParty: i === 0 || !!h.startsInParty, joinLevel: h.joinLevel ?? 0,
      cls: h.cls && (db.classes ?? []).some((c) => c.id === h.cls) ? h.cls : null,
      noAdditions: !!h.noAdditions, elements: (h.elements ?? []).slice(0, 2) as Element[], gender: h.gender ?? null, battleLook: h.battleLook?.mode ?? 'default',
      moves: h.noAdditions ? [] : [...new Set([...(h.defaultAddition ? [h.defaultAddition] : h.additions?.length ? [] : [additionList(db).find((d) => d.id === 'quick_strike')?.id ?? additionList(db)[0]?.id]), ...(h.additions ?? [])].filter(Boolean))],
      spells: h.spells ?? {}, gear: h.gear ?? {},
    })),
    // Update 14: classes grow the stats (tenths a level), roll health and magic, open skill trees and limit gear.
    pointsPerLevel: Math.max(0, cfg.pointsPerLevel ?? 1), startPoints: Math.max(0, cfg.startPoints ?? 0),
    classes: (db.classes ?? []).map((c) => ({ id: c.id, name: c.name, description: c.description ?? '',
      bonus: ATTRS.map((k) => Math.round(c.bonus?.[k] ?? 0)), perLevel: ATTRS.map((k) => Math.round((c.perLevel?.[k] ?? 0) * 10)),
      hpDie: classGrowth(c).hp, mpDie: classGrowth(c).mp, trees: c.trees, gear: c.gear ?? {} })),
    gearKinds: gearKinds(db).map(([k]) => ({ id: k, untrained: ATTRS.map((a) => (k.startsWith('armor:') ? armorTypes(db).find((t) => `armor:${t.id}` === k)?.untrained?.[a] ?? 0 : 0)), weapon: !k.startsWith('armor:') && k !== 'shield' })),
    skills: (() => {
      const sk = skillsData(db.skills), trees = sk.trees.filter((t) => !isSharedTree(sk, t.id));
      // In each tree bottom row first, left to right (the order the Skills page lists them).
      const nodes = sk.nodes.filter((n) => trees.some((t) => t.id === n.tree)).sort((a, b) => a.y - b.y || a.x - b.x);
      return { trees: trees.map((t) => ({ id: t.id, name: t.name })), nodes: nodes.map((n) => ({
        id: n.id, name: n.name, description: n.description ?? '', tree: n.tree, parents: n.parents ?? [], ranks: Math.max(1, n.ranks ?? 1), cost: Math.max(0, n.cost ?? 1), level: n.level ?? 0,
        stats: ATTRS.map((k) => n.effects.filter((e) => e.stat === k).reduce((a, e) => a + e.value, 0)), addition: n.teachesAddition ?? null, spell: n.teachesSpell ?? null, spellFrom: n.spellRankFrom ?? 1 })) };
    })(),
    // Types: how much each element does to each (one element on the defender), from the game's own chart.
    elements: ELEMENT_LIST,
    chart: ELEMENT_LIST.map((a) => ELEMENT_LIST.map((d) => { const r = elementResult(a, { elements: d === 'neutral' ? [] : [d] }); return r.kind === 'hit' ? r.mult : 1; })),
    ailments: ROM_AILMENTS,
    effects: effectSprites(gba).map((s) => ({ id: s.id, role: s.role ?? 'hit', sound: s.sound ?? '', frames: s.frames ?? 6, image: s.image })),
    sounds: romSounds(gba).map((n) => ({ name: n, file: romSoundFile(n) })),
    enemyGrowth: cfg.enemyGrowth,
    additions: additionList(db).map((d) => {
      const fx = moveEffects({ effect: d.effect, burst: d.burst, element: d.element, inflicts: d.inflicts }, 'addition');
      return { id: d.id, name: d.name, description: d.description ?? '', hits: d.strikes.length, power: d.strikes.reduce((s, x) => s + x.power, 0),
        element: d.element ?? 'neutral', inflicts: inflicts(d.inflicts), hit: fx.hit, burst: fx.burst,
        mp: d.mp ?? 0, guard: d.guard ? d.guardHeal ?? 10 : null,
        // Update 15: each strike's power, ring time and window (seconds), and the MP it gives back.
        strikes: d.strikes.slice(0, 8).map((x) => ({ power: x.power, time: Math.max(0.25, x.time ?? 0.7), window: Math.max(0.06, x.window ?? 0.24) })), mpPerHit: d.mpPerHit ?? 0, mpComplete: d.mpComplete ?? 0 };
    }),
    spells: spellList(db).map((s) => ({ id: s.id, name: s.name, kind: s.kind, targets: s.targets ?? 'one', description: s.description ?? '',
      element: s.element ?? 'neutral', inflicts: inflicts(s.inflicts), ...moveEffects({ effect: s.effect, burst: s.burst, element: s.element, inflicts: s.inflicts }, s.kind === 'bolt' ? 'spell' : 'heal'),
      ranks: Array.from({ length: spellMaxRank(s) }, (_, r) => { const at = spellAtRank(s, r + 1); return { power: at.power, mp: at.mp }; }) })),
    items: (db.items ?? []).map((it) => {
      const w = it.weapon;
      const cls = w && w.class !== 'bow' ? w.class : null;
      return {
        id: it.id, name: it.name, kind: it.kind, slot: it.slot ?? null, gearKind: gearKindOf(it, db), price: it.price ?? 0, noSell: !!it.noSell, description: it.description ?? '',
        hp: it.restore?.hp ?? 0, mp: it.restore?.mp ?? 0, hpPct: it.restorePct?.hp ?? 0, mpPct: it.restorePct?.mp ?? 0, revive: !!it.revive,
        attack: cls ? w!.damage * cfg.classes[cls].damage : 0, defense: it.defense ?? 0, magicDefense: it.magicDefense ?? 0, bonus: it.bonus ?? {}, crit: it.crit ?? 0,
      };
    }),
    enemies: (db.enemies ?? []).map((e) => ({
      id: e.id, name: e.name, level: e.level ?? 1, hp: e.hp, attack: e.damage, magic: e.attackType === 'magic',
      defense: e.defense ?? 0, magicDefense: e.magicDefense ?? e.defense ?? 0, agility: enemyAgility(e), crit: e.crit ?? 5,
      xp: e.xp ?? 0, gold: Array.isArray(e.gold) ? e.gold : [0, 0], boss: !!e.boss,
      elements: (e.elements ?? []).slice(0, 2), immune: e.immune ?? [], absorb: e.absorb ?? [], resists: e.resists ?? [], mp: e.mp ?? 0,
      element: e.attackElement ?? e.elements?.[0] ?? 'neutral', inflicts: inflicts(e.inflicts),
      moves: refs(e.moves), movesets: (e.movesets ?? []).map((m) => ({ level: m.level, moves: refs(m.moves) })).sort((a, b) => a.level - b.level),
    })),
    troops: (db.troops ?? []).map((t) => ({ id: t.id, members: t.members.map((m) => ({ enemy: m.enemy, min: m.min ?? 1, max: m.max ?? m.min ?? 1 })), pick: t.pick ?? 'all', noRun: !!t.noRun })),
    // The game's lines and command words (Database → Text & dialog): every version, by key.
    text: Object.fromEntries(TEXT_LINES.map((l) => [l.key, lineVersions(db, l.key)])),
  };
}
