import { REST_ACTIVITIES } from '../world/safeZones';
import { cleanChatter } from './ChatterEditor';
import { DEFAULT_RANK, RANKS, RANK_COLORS, RANK_GAIN, type Rank } from '../game/statRanks';
import { soundField } from './CommandEditor';
/**
 * Database → Heroes: the hero you play (first) and heroes who'll join the party later: name, look, starting stats,
 * and for the first hero, how a new game makes their stats (character creation). Also the stat points per level.
 */
import { ailmentChips } from './statusFields';
import type { Ailment } from '../world/types';
import { defenceSection } from './elementFields';
import { ATTRS, ATTR_BASE, ATTR_INFO, ATTR_MAX, ATTR_MIN, CREATION_METHODS, CREATION_NAMES, attrEffect, attrsFrom } from '../game/attributes';
import { GENDERS, genderInfo } from '../game/roleplay';
import { monthDayInput } from './dateFields';
import type { Gender, RoleplayField } from '../world/types';
import type { AdditionDef, AllyStyle, ClassDef, CombatData, CreationSettings, HeroDef, HeroForm, ItemDef, SpellEntry } from '../world/types';
import type { CharactersWork } from './CharactersEditor';
import { checkbox, field, h, numberInput, select, textInput } from './dom';

export interface HeroesWork { heroes: HeroDef[]; /** Roleplay titles (Update 127), shared with the Roleplay tab. */ rp?: RoleplayField[] }

/** The work copy: the database's heroes, or one made from the player's look. */
export function heroesWork(heroes: HeroDef[] | undefined, player: string): HeroesWork {
  const list: HeroDef[] = JSON.parse(JSON.stringify(heroes?.length ? heroes : [{ id: 'hero', name: 'Hero' }]));
  list[0].look = player;
  return { heroes: list };
}

/** What to save: nothing when it's still just the default hero. The first hero's look is the player's (saved there). */
export function cleanHeroes(w: HeroesWork): HeroDef[] | undefined {
  const out = w.heroes.map((x, i) => {
    const c: HeroDef = { id: x.id, name: x.name.trim() || 'Hero' };
    if (i > 0 && x.look) c.look = x.look;
    if (x.face) c.face = x.face;
    if (x.attackSounds?.length) c.attackSounds = x.attackSounds.filter(Boolean);
    if (x.color) c.color = x.color;
    if (x.about) c.about = x.about;
    if (x.gender) c.gender = x.gender;
    if (x.outfit) c.outfit = x.outfit;
    const rp = Object.fromEntries(Object.entries(x.roleplay ?? {}).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => v && (w.rp ?? []).some((f) => f.id === k)));
    if (Object.keys(rp).length) c.roleplay = rp;
    const st = Object.fromEntries(ATTRS.filter((k) => (x.stats?.[k] ?? ATTR_BASE) !== ATTR_BASE).map((k) => [k, x.stats![k]]));
    if (Object.keys(st).length) c.stats = st;
    const rk = Object.fromEntries(ATTRS.filter((k) => x.ranks?.[k] && x.ranks[k] !== DEFAULT_RANK).map((k) => [k, x.ranks![k]]));
    if (Object.keys(rk).length) c.ranks = rk;
    if (i > 0 && x.setupStats) c.setupStats = true;
    if (x.elements?.length) c.elements = x.elements;
    if (x.immune?.length) c.immune = x.immune;
    if (x.absorb?.length) c.absorb = x.absorb;
    if (x.resists?.length) c.resists = x.resists;
    if (i > 0 && x.ai && x.ai !== 'fighter') c.ai = x.ai;
    if (i > 0 && x.startsInParty) c.startsInParty = true;
    if (i > 0 && x.joinLevel && x.joinLevel > 0) c.joinLevel = Math.round(x.joinLevel);
    if (x.cls) c.cls = x.cls;
    if (x.spells && Object.keys(x.spells).length) c.spells = { ...x.spells };
    if (x.additions?.length) c.additions = [...x.additions];
    if (x.defaultAddition) c.defaultAddition = x.defaultAddition;
    if (x.noAdditions) c.noAdditions = true;
    if (x.noAdditions && x.plainAttack === 'ranged') c.plainAttack = 'ranged';
    if (x.battleOffset) c.battleOffset = x.battleOffset;
    const chat = cleanChatter(x.chatter);
    if (chat) c.chatter = chat;
    if (x.restPrefs && Object.values(x.restPrefs).some((v) => v !== undefined && v !== 5)) c.restPrefs = Object.fromEntries(Object.entries(x.restPrefs).filter(([, v]) => v !== undefined && v !== 5));
    if (i > 0 && x.gear && Object.values(x.gear).some(Boolean)) c.gear = Object.fromEntries(Object.entries(x.gear).filter(([, v]) => v));
    if (i === 0 && x.creation) {
      const cr: CreationSettings = {};
      if (x.creation.enabled === false) cr.enabled = false;
      const m = x.creation.methods;
      if (m?.length && JSON.stringify(m) !== JSON.stringify(['roll', 'pointBuy', 'array'])) cr.methods = m;
      if (x.creation.rerolls) cr.rerolls = x.creation.rerolls;
      if (Object.keys(cr).length) c.creation = cr;
    }
    return c;
  });
  if (out.length === 1 && out[0].id === 'hero' && out[0].name === 'Hero' && !out[0].stats && !out[0].creation && !out[0].face && !out[0].color && !out[0].about && !out[0].elements && !out[0].immune && !out[0].absorb && !out[0].resists && !out[0].cls && !out[0].spells && !out[0].additions) return undefined;
  return out;
}

export function heroesTab(w: HeroesWork, people: CharactersWork, combat: CombatData, state: { sel: number }, rerender: () => void, items: ItemDef[] = [],
  learnable: { spells: SpellEntry[]; additions: AdditionDef[]; classes: ClassDef[] } = { spells: [], additions: [], classes: [] },
  face?: { pick: (hero: HeroDef, done: () => void) => void; url: (path: string) => string }): HTMLElement[] {
  state.sel = Math.min(state.sel, w.heroes.length - 1);
  const looks = Object.keys(people.chars).map((k) => [k, k] as [string, string]);
  const add = () => {
    let n = w.heroes.length + 1, id = `hero_${n}`;
    while (w.heroes.some((x) => x.id === id)) id = `hero_${++n}`;
    w.heroes.push({ id, name: 'New hero', look: Object.keys(people.chars)[0] });
    state.sel = w.heroes.length - 1;
    rerender();
  };
  const list = h('div', { class: 'item-list', role: 'listbox', 'aria-label': 'Heroes' },
    ...w.heroes.map((x, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } },
      h('span', {}, x.name || '(no name)'), i === 0 ? h('small', { class: 'hero-tag' }, 'you play') : h('span'))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, '+ New hero'));
  const x = w.heroes[state.sel];
  const form = h('div', { class: 'item-form' });
  if (x) {
    const main = state.sel === 0;
    const stats = (x.stats ??= {}), base = attrsFrom(stats);
    const ranks = (x.ranks ??= {});
    const statRows = ATTRS.map((k) => {
      const eff = h('span', { class: 'note' }, attrEffect(k, base[k]));
      const r = ranks[k] ?? DEFAULT_RANK;
      const rankSel = select(RANKS.map((x2) => [x2, `${x2} (+${RANK_GAIN[x2]} a level)`] as [string, string]), r, (v) => { if (v === DEFAULT_RANK) delete ranks[k]; else ranks[k] = v as Rank; rankSel.style.setProperty('--rank', RANK_COLORS[v as Rank]); }, { 'aria-label': `${ATTR_INFO[k].name} progression`, class: 'rank-select' });
      rankSel.style.setProperty('--rank', RANK_COLORS[r]);
      return h('div', { class: 'hero-stat ranked' },
        h('span', { class: 'db-name' }, `${ATTR_INFO[k].name} (${ATTR_INFO[k].short})`),
        numberInput(base[k], (v) => { const n = Math.max(ATTR_MIN, Math.min(ATTR_MAX, Math.round(v))); stats[k] = n; eff.textContent = attrEffect(k, n); }, { step: 1, min: ATTR_MIN, max: ATTR_MAX, 'aria-label': `${ATTR_INFO[k].name} at level 1` }),
        rankSel,
        h('span', { class: 'note' }, ATTR_INFO[k].does), eff);
    });
    const cr = main ? (x.creation ??= {}) : undefined;
    const methods = cr ? (cr.methods ??= ['roll', 'pointBuy', 'array']) : [];
    form.append(
      field('Name', textInput(x.name, (v) => { x.name = v.trim() || x.name; rerender(); }, { 'aria-label': 'Hero name' })),
      field('Look', select(looks.length ? looks : [['', '(no characters)']], main ? people.player : x.look ?? '', (v) => { if (main) people.player = v; else x.look = v; }),
        main ? 'The player character (the same as Characters → Player).' : 'From Characters.'),
      ...(face ? [field('Face art', h('div', { class: 'face-pick' },
        x.face ? h('img', { class: 'face-thumb', src: face.url(x.face), alt: '' }) : h('span', { class: 'note' }, 'From their look'),
        h('button', { type: 'button', class: 'btn small', onclick: () => face.pick(x, rerender) }, x.face ? 'Change…' : 'Choose a picture…'),
        x.face ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { delete x.face; rerender(); } }, 'Use their look') : h('span')),
        'Their face on the battle screen (Dragon Legend layout). Square pictures look best; without one, a face is cut from their look.')] : []),
      heroForms(x, looks, face, rerender),
      h('div', { class: 'field' }, h('label', {}, 'Attack sounds'),
        ...(x.attackSounds ?? []).map((src, k) => h('div', { class: 'field-row' }, soundField(`Sound ${k + 1}`, src, (v) => { if (v) x.attackSounds![k] = v; }),
          h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove sound ${k + 1}`, onclick: () => { x.attackSounds!.splice(k, 1); if (!x.attackSounds!.length) delete x.attackSounds; rerender(); } }, '✕'))),
        h('button', { type: 'button', class: 'btn small', onclick: () => { (x.attackSounds ??= []).push('hit'); rerender(); } }, '+ Add attack sound'),
        h('div', { class: 'hint' }, 'Turn-based: one of these, at random, when they land a weapon or bow attack (voice clips like “Hah!”).')),
      field('Colour', (() => { const c = h('input', { type: 'color', value: x.color ?? ['#e8b04a', '#5aa8ff', '#7cd66a', '#e87ad0', '#ff8a5a'][Math.max(0, state.sel) % 5] }); c.addEventListener('change', () => { x.color = c.value; }); return c; })(),
        'Shown behind "equipped" on what they wear, and on their card in the menus.'),
      h('div', { class: 'field-row' },
        field('Gender', select([['', '(not set)'], ...GENDERS.map((g) => [g, `${genderInfo(g).image ? '' : genderInfo(g).symbol + ' '}${genderInfo(g).name}`] as [string, string])], x.gender ?? '', (v) => { if (v) x.gender = v as Gender; else delete x.gender; }),
          'Shown as a coloured symbol on their stat blocks and on their Status page.'),
        field('Outfit gender', select([['', 'From their look (Characters → Body)'], ['masc', 'Masc'], ['femme', 'Femme']], x.outfit ?? '', (v) => { if (v) x.outfit = v as 'masc' | 'femme'; else delete x.outfit; }),
          'Which version of worn armor and clothes they wear.')),
      field('About', (() => { const t = h('textarea', { rows: '3', placeholder: 'A few lines of story about them (shown on their Status page).' }); t.value = x.about ?? ''; t.addEventListener('change', () => { const v = t.value.trim(); if (v) x.about = v; else delete x.about; }); return t; })()),
      h('section', { class: 'db-section' }, h('h3', {}, 'Roleplay'),
        ...((w.rp ?? []).length ? (w.rp ?? []).map((f) => f.type === 'date' ? rpDateField(x, f) : field(f.title || f.id, textInput(x.roleplay?.[f.id] ?? '', (v) => { const t = v.trim(); if (t) (x.roleplay ??= {})[f.id] = t; else if (x.roleplay) { delete x.roleplay[f.id]; if (!Object.keys(x.roleplay).length) delete x.roleplay; } }, { placeholder: '(not set)' })))
          : [h('p', { class: 'note' }, 'Add titles (Eye colour, Favourite food…) in Database → Party → Roleplay; every hero gets their own answer here.')])),
      h('section', { class: 'db-section' }, h('h3', {}, 'Progression curve'),
        h('div', { class: 'hero-stat ranked head' }, h('span'), h('span', { class: 'note' }, 'Level 1'), h('span', { class: 'note' }, 'Progression'), h('span'), h('span')),
        ...statRows,
        h('p', { class: 'note' }, 'Each level adds to a stat by its rank: A +4, B +3, C +2, D +1, F +0. A potion (Database → Items → Stat growth), worn gear or the “Change stat growth rank” command can change a rank. Level 1 values are used as they are, or as the starting point when the player sets up stats (below).'),
        h('p', { class: 'note' }, `10 is normal. Strength and Magic: each point over 10 is +2% damage. Dexterity: +1% swing and draw speed (up to +50%). Defence and Magic Defence add to armour (50 halves a hit). Stats go up to ${ATTR_MAX}.`)),
      ...(main ? [] : [h('section', { class: 'db-section' }, h('h3', {}, 'In the party'),
        field('Fights as', select([['fighter', 'Fighter: closes in with their weapon'], ['archer', 'Archer: keeps back and shoots (needs a bow)'], ['caster', 'Caster: throws their spell shard (needs a shard)'], ['healer', 'Healer: heals whoever drops below half health, otherwise casts']],
          x.ai ?? 'fighter', (v) => { x.ai = v as AllyStyle; })),
        checkbox('In the party from the start of a new game', !!x.startsInParty, (v) => (x.startsInParty = v || undefined)),
        field('Joins at level', numberInput(x.joinLevel ?? 0, (v) => { const n = Math.max(0, Math.round(v)); x.joinLevel = n || undefined; }, { step: 1, min: 0, 'aria-label': 'Joins at level' }), '0: the same level as the hero you play when they join. Their stats grow by their ranks to that level.'),
        field('Stats when they join', select([['default', 'Default stats (from the progression curve)'], ['setup', 'Set up stats on joining (dice, point buy or standard array)']], x.setupStats ? 'setup' : 'default', (v) => { if (v === 'setup') x.setupStats = true; else delete x.setupStats; })),
        h('div', { class: 'field-row' }, ...(['weapon', 'ranged', 'magic', 'armor'] as const).map((slot) => field({ weapon: 'Joins with weapon', ranged: 'Bow', magic: 'Spell shard', armor: 'Armor' }[slot],
          select([['', 'Nothing'], ...items.filter((it) => it.kind === 'equipment' && it.slot === slot).map((it) => [it.id, it.name] as [string, string])], x.gear?.[slot] ?? '', (v) => { x.gear ??= {}; if (v) x.gear[slot] = v; else delete x.gear[slot]; })))),
        h('p', { class: 'note' }, 'Use the event command “Change party” to have them join or leave. Up to three travel with the hero you play: they follow, fight on their own and share the bag and gold. Each has their own level: they get EXP for the enemies beaten while they were standing, once the fight is over (only the hero you play picks up what enemies drop). Their gear can be changed in the game (Inventory → Equipment, ← → for each hero).'))]),
      h('section', { class: 'db-section' }, h('h3', {}, 'Class, spells and Additions at the start'),
        learnable.classes.length ? field('Class', select([['', 'None'], ...learnable.classes.map((c) => [c.id, c.name] as [string, string])], x.cls ?? '', (v) => { if (v) x.cls = v; else delete x.cls; }), 'Opens that class’s skill trees (Database → Classes).') : h('span'),
        h('div', { class: 'db-table start-spells' }, ...learnable.spells.flatMap((sp) => [
          h('span', { class: 'db-name' }, sp.name),
          select([['0', 'Not known'], ...Array.from({ length: Math.max(1, sp.maxRank ?? 1) }, (_, k) => [String(k + 1), `Rank ${k + 1}`] as [string, string])], String(x.spells?.[sp.id] ?? 0), (v) => {
            const r = Number(v);
            if (r > 0) (x.spells ??= {})[sp.id] = r; else if (x.spells) { delete x.spells[sp.id]; if (!Object.keys(x.spells).length) delete x.spells; }
          }, { 'aria-label': `${sp.name} at the start` }),
        ])),
        h('div', { class: 'db-abilities' }, ...learnable.additions.map((ad) => checkbox(ad.name, !!x.additions?.includes(ad.id), (on) => {
          const set = new Set(x.additions ?? []);
          if (on) set.add(ad.id); else set.delete(ad.id);
          x.additions = learnable.additions.map((a) => a.id).filter((id) => set.has(id));
          if (!x.additions.length) delete x.additions;
          rerender();
        }))),
        checkbox('No Additions: Attack is a plain attack (archers, mages)', !!x.noAdditions, (v) => { if (v) x.noAdditions = true; else { delete x.noAdditions; delete x.plainAttack; } rerender(); }),
        x.noAdditions
          ? field('Plain attack', select([['melee', 'Melee: runs in and swings'], ['ranged', 'Ranged: fires the bow from where they stand']], x.plainAttack ?? 'melee', (v) => { if (v === 'ranged') x.plainAttack = 'ranged'; else delete x.plainAttack; }))
          : field('Default Addition', select([['', 'Quick Strike (or the first Addition)'], ...learnable.additions.map((ad) => [ad.id, ad.name] as [string, string])], x.defaultAddition ?? '', (v) => { if (v) x.defaultAddition = v; else delete x.defaultAddition; }),
            'What Attack performs in battle until the player equips another (Party → Equipment → Addition). Always learned.'),
        field('Battle height offset (tiles)', numberInput(x.battleOffset ?? 0, (v) => { const r = Math.round(v * 100) / 100; if (r) x.battleOffset = r; else delete x.battleOffset; }, { step: 0.05, class: 'db-num' }),
          'Raise (+) or lower (−) them on battle maps, if their art floats or sinks.'),
        h('p', { class: 'note' }, 'More are learned in the game from skill-tree skills, events and trainers.')),
      defenceSection(x, rerender, 'They'),
      h('section', { class: 'db-section' }, h('h3', {}, 'Rest preferences'),
        h('div', { class: 'field-row' }, ...REST_ACTIVITIES.map(([act, name]) => field(name, numberInput(x.restPrefs?.[act] ?? 5, (v) => {
          const n = Math.max(1, Math.min(10, Math.round(v)));
          if (n === 5) { if (x.restPrefs) { delete x.restPrefs[act]; if (!Object.keys(x.restPrefs).length) delete x.restPrefs; } } else (x.restPrefs ??= {})[act] = n;
        }, { step: 1, min: 1, max: 10, class: 'db-num', 'aria-label': `${name} preference` })))),
        h('p', { class: 'note' }, 'In a safe zone (painted on the Spawns layer), each party member goes to a spot while the player is there: 10 goes for that kind of spot most often, 1 rarely; ties go to whoever is higher in the party order.')),
      field('Can’t get', ailmentChips(() => x.resists, (v) => { if (v) x.resists = v as Ailment[]; else delete x.resists; }, rerender, 'Can’t get'), 'Ailments this hero never gets (equipment can ward off more).'),
      ...(cr ? [h('section', { class: 'db-section' }, h('h3', {}, 'Setting up stats'),
        checkbox('The player sets up the hero’s stats after New Game (Default or Custom)', cr.enabled !== false, (v) => { cr.enabled = v ? undefined : false; rerender(); }),
        ...(cr.enabled !== false ? [
          h('div', { class: 'db-abilities' }, ...CREATION_METHODS.map((m) => checkbox(CREATION_NAMES[m], methods.includes(m), (on) => {
            const set = new Set(cr.methods ?? []);
            if (on) set.add(m); else set.delete(m);
            cr.methods = CREATION_METHODS.filter((k) => set.has(k));
            if (!cr.methods.length) cr.methods = ['roll'];
            rerender();
          }))),
          field('Rerolls', numberInput(cr.rerolls ?? 0, (v) => (cr.rerolls = Math.max(0, Math.round(v)) || undefined), { step: 1, min: 0 }), '0: as many as they like.'),
          h('p', { class: 'note' }, 'New Game asks: Default stats (the progression curve’s level 1) or Custom. Custom offers the ways ticked: Roll Dice (four dice tumble onto a table, the lowest is dropped, and the player puts each roll on a stat), Point buy (every stat starts at 8, 30 points to raise them up to 15) and Standard array (16, 14, 13, 12, 10, 10, 8 to place). Hard is 3d6 straight down the stats. These settings also go for other heroes set to “Set up stats on joining”.'),
        ] : [h('p', { class: 'note' }, 'The hero starts with the stats above.')]))] : []),
      main ? h('span') : h('div', { class: 'item-foot' }, h('button', { type: 'button', class: 'btn danger', onclick: () => { w.heroes.splice(state.sel, 1); state.sel = 0; rerender(); } }, 'Delete hero')),
    );
  }
  return [
    h('p', { class: 'note' }, 'Heroes after the first can join the party (event command “Change party”, or “In the party from the start”). Stats grow each level by their ranks (Progression curve); skill points per level are in Combat.'),
    h('div', { class: 'items-layout' }, list, form),
  ];
}

/**
 * Heroes → Forms: a mid and a final form, each at a level, with its own look (Characters) and face art. The hero
 * transforms after the battle that takes them to that level.
 */
function heroForms(x: HeroDef, looks: [string, string][], face: { pick: (x: HeroDef, done: () => void) => void; url: (p: string) => string } | undefined, rerender: () => void): HTMLElement {
  const forms = x.forms ?? [];
  const tidy = () => { const f = (x.forms ?? []).filter(Boolean); while (f.length && !f[f.length - 1].level && !f[f.length - 1].look && !f[f.length - 1].face) f.pop(); if (f.length) x.forms = f; else delete x.forms; };
  const row = (k: 0 | 1) => {
    const fm: HeroForm = forms[k] ?? { level: 0 };
    const put = () => { const f = (x.forms ??= []); while (f.length < k) f.push({ level: 0 }); f[k] = fm; tidy(); };
    // The face picker writes `face` on what it's given: here, the form.
    const proxy = { get face() { return fm.face; }, set face(v: string | undefined) { if (v) fm.face = v; else delete fm.face; put(); } } as unknown as HeroDef;
    const name = k ? 'Final form' : 'Mid form';
    return h('div', { class: 'field-row' },
      field(`${name} level`, numberInput(fm.level || 0, (v) => { fm.level = Math.max(0, Math.min(99, Math.round(v))); put(); }, { step: 1, min: 0, max: 99 }), k ? 'Higher than the mid form’s. 0: none.' : '0: none.'),
      field(`${name} look`, select([['', 'Same look'], ...looks], fm.look ?? '', (v) => { if (v) fm.look = v; else delete fm.look; put(); }), 'Their sprite (from Characters) in that form.'),
      ...(face ? [field(`${name} face`, h('div', { class: 'face-pick' },
        fm.face ? h('img', { class: 'face-thumb', src: face.url(fm.face), alt: '' }) : h('span', { class: 'note' }, 'Same face'),
        h('button', { type: 'button', class: 'btn small', onclick: () => face.pick(proxy, rerender) }, fm.face ? 'Change…' : 'Choose a picture…'),
        fm.face ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { delete fm.face; put(); rerender(); } }, 'Same face') : h('span')))] : []));
  };
  return h('section', { class: 'db-section' }, h('h3', {}, 'Forms'), row(0), row(1),
    h('p', { class: 'note' }, 'As they grow, heroes can transform: at the mid form’s level, then the final form’s, they take on a new look and face (unset ones stay as before). It happens after the battle that took them to that level, with a transformation scene.'));
}

/** A roleplay date answer (Update 130): a month and day (a birthday), or none. */
function rpDateField(x: HeroDef, f: RoleplayField): HTMLElement {
  const v = x.roleplay?.[f.id];
  const set = (val: string | undefined) => { if (val) (x.roleplay ??= {})[f.id] = val; else if (x.roleplay) { delete x.roleplay[f.id]; if (!Object.keys(x.roleplay).length) delete x.roleplay; } };
  const wrap = h('span', {}, monthDayInput(v ?? '01-01', (val) => set(val), f.title));
  wrap.hidden = !v;
  return field(f.title || f.id, h('div', { class: 'field-row' }, checkbox('Set', !!v, (on) => { set(on ? '01-01' : undefined); wrap.hidden = !on; }), wrap));
}
