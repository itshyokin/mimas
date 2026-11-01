import { soundField } from './CommandEditor';
/**
 * Database → Spells, Additions and Classes: learned spells (with ranks and charge turns), Legend of Dragoon-style
 * Additions (strings of timed strikes with button prompts), and classes (the skill trees each one opens).
 * Each tab is a list on the left and a form for the selected entry.
 */
import type { AdditionDef, AdditionStrike, ArmorTypeDef, WeaponTypeDef, ClassDef, FaceButton, GearSkill, SkillsData, SpellEntry } from '../world/types';
import { gearKinds } from '../game/classes';
import { openArmorTypes, openWeaponTypes } from './armorTypesEditor';
import { ATTRS, ATTR_INFO } from '../game/attributes';
import { checkbox, field, h, numberInput, select, textInput } from './dom';
import { elementSelect } from './elementFields';
import { buffsField, inflictsField, weatherField } from './statusFields';
import { rankName, spellAtRank, spellMaxRank } from '../game/abilities';
import { treePreview } from './SkillsEditor';
import { iconGrid, tintRow } from './ItemsEditor';
import { builtinIcon, builtinIconName } from '../art/itemIcons';
import { elementIconUrl } from '../art/elementIcons';

const n = (v: number, set: (x: number) => void, step = 1, min = 0, label = '') => numberInput(v, (x) => set(Math.max(min, x)), { step, min, 'aria-label': label, class: 'db-num' });

/** A list on the left (with a "+ New" button) and the selected entry's form on the right. */
export function listLayout<T extends { id: string; name: string }>(list: T[], state: { sel: number }, label: string, make: (id: string) => T, form: (d: T) => HTMLElement[], rerender: () => void, empty: string): HTMLElement[] {
  state.sel = Math.max(0, Math.min(state.sel, list.length - 1));
  const add = () => {
    let id = label.toLowerCase().replace(/\W+/g, '_'), k = 2;
    while (list.some((d) => d.id === id)) id = `${label.toLowerCase().replace(/\W+/g, '_')}_${k++}`;
    list.push(make(id));
    state.sel = list.length - 1;
    rerender();
  };
  const side = h('div', { class: 'item-list', role: 'listbox', 'aria-label': label },
    ...list.map((d, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } }, h('span', {}, d.name))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, `+ New ${label.toLowerCase()}`));
  const d = list[state.sel];
  const body = h('div', { class: 'item-form' });
  if (!d) body.append(h('p', { class: 'note' }, empty));
  else body.append(...form(d), h('div', { class: 'item-foot' }, h('button', { type: 'button', class: 'btn danger', onclick: () => { list.splice(state.sel, 1); state.sel = Math.max(0, state.sel - 1); rerender(); } }, `Delete ${label.toLowerCase()}`)));
  return [h('div', { class: 'items-layout' }, side, body)];
}

/** Name and id fields (the id is what skills, events and saves refer to). */
export function nameId<T extends { id: string; name: string }>(list: T[], d: T, rerender: () => void, what: string): HTMLElement {
  return h('div', { class: 'field-row' },
    field('Name', textInput(d.name, (v) => { d.name = v.trim() || d.name; rerender(); }, { 'aria-label': `${what} name` })),
    field('Id', textInput(d.id, (v) => {
      const id = v.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
      if (id && !list.some((o) => o !== d && o.id === id)) d.id = id;
      rerender();
    }, { 'aria-label': `${what} id`, title: 'Skills, events and saves refer to it by this id' })));
}

/* ------------------------------------------------------------------ spells */

export function spellsTab(list: SpellEntry[], state: { sel: number }, rerender: () => void): HTMLElement[] {
  return listLayout<SpellEntry>(list, state, 'Spell', (id) => ({ id, name: 'New spell', kind: 'bolt', power: 12, mp: 6, maxRank: 3 }), (d) => {
    const table = h('div', { class: 'db-table spell-ranks' },
      h('span', { class: 'db-head' }, 'Rank'), h('span', { class: 'db-head' }, 'Power'), h('span', { class: 'db-head' }, 'Magic'), h('span', { class: 'db-head' }, 'Charges'),
      ...Array.from({ length: spellMaxRank(d) }, (_, i) => { const at = spellAtRank(d, i + 1); return [h('span', { class: 'db-name' }, rankName(d.name, i + 1)), h('span', {}, String(Math.round(at.power))), h('span', {}, `${at.mp} MP`), h('span', {}, at.charge ? `${at.charge} turn${at.charge === 1 ? '' : 's'}` : 'at once')]; }).flat());
    return [
      nameId(list, d, rerender, 'Spell'),
      field('Description', textInput(d.description ?? '', (v) => { d.description = v.trim() || undefined; }, { 'aria-label': 'Spell description' })),
      spellIconField(d, rerender),
      soundField('Call-out', d.sound, (v) => { d.sound = v; }, 'Turn-based: what the caster says as it goes off (“Fire!”). Import voice clips in Database → Audio.'),
      soundField('Chant', d.chant, (v) => { d.chant = v; }, 'Played as they begin a spell that charges (Charges above 0).'),
      h('div', { class: 'field-row' },
        field('Kind', select([['bolt', 'Attack spell (a magic hit; in action mode, the bolt the spell button throws)'], ['heal', 'Healing (health back for the party)'], ['support', 'Support (turn-based): buffs, debuffs or weather (Haste, Slow, Rain…)']], d.kind, (v) => { d.kind = v as SpellEntry['kind']; rerender(); })),
        d.kind === 'support' ? field('Cast on', select([['allies', 'The caster’s side'], ['foes', 'The other side (debuffs)'], ['any', 'Either side (the caster picks: Haste a friend or a foe)']], d.supportTarget ?? 'allies', (v) => { if (v === 'foes' || v === 'any') d.supportTarget = v; else delete d.supportTarget; })) : h('span'),
        field('Targets', select([['one', 'One'], ['all', 'All of them (every foe, or the whole party)']], d.targets ?? 'one', (v) => { if (v === 'all') d.targets = 'all'; else delete d.targets; }), 'Turn-based battles.')),
      h('section', { class: 'db-section' }, h('h3', {}, 'Rank 1'),
        h('div', { class: 'field-row' },
          d.kind === 'support' ? h('span') : field(d.kind === 'heal' ? 'Health back' : 'Damage', n(d.power, (v) => { d.power = v; rerender(); }, 1, 0, 'Power'), 'Before the caster’s Magic (and Magic Defence, for attack spells).'),
          field('Magic cost', n(d.mp, (v) => { d.mp = Math.round(v); rerender(); }, 1, 0, 'MP cost')),
          field('Charges (turns)', n(d.charge ?? 0, (v) => { const c = Math.round(v); if (c) d.charge = c; else delete d.charge; rerender(); }, 1, 0, 'Charge turns'), 'Turn-based: turns before rank 1 goes off (0: at once).')),
        d.kind === 'bolt' ? h('div', { class: 'field-row' },
          field('Element', elementSelect(d.element, (e) => { if (e && e !== 'neutral') d.element = e; else delete d.element; }, 'Spell element')),
          field('Colour', h('input', { type: 'color', value: d.color ?? '#ffb04a', 'aria-label': 'Spell colour', onchange: (e: Event) => { d.color = (e.target as HTMLInputElement).value; } }))) : h('span'),
        d.kind === 'bolt' ? h('div', { class: 'field-row' },
          field('Accuracy %', n(d.accuracy ?? 100, (v) => { const x = Math.max(10, Math.min(200, Math.round(v))); if (x === 100) delete d.accuracy; else d.accuracy = x; }, 5, 10, 'Spell accuracy'), 'Turn-based: its chance to land, less the target’s spell evasion (heroes: Magic Defence). 100 always lands on a target that can’t dodge spells.'),
          checkbox('Never misses', !!d.sure, (v) => { if (v) d.sure = true; else delete d.sure; })) : h('span'),
        d.kind === 'bolt' ? inflictsField(() => d.inflicts, (v) => { if (v) d.inflicts = v; else delete d.inflicts; }, rerender, 'Ailments it can give') : h('span'),
        d.kind === 'support' ? field('Colour', h('input', { type: 'color', value: d.color ?? '#5ae0ff', 'aria-label': 'Spell colour', onchange: (e: Event) => { d.color = (e.target as HTMLInputElement).value; } })) : h('span'),
        buffsField(() => d.buffs, (v) => { if (v) d.buffs = v; else delete d.buffs; }, rerender, { label: 'Buffs (or debuffs) it gives in battle', seconds: false }),
        weatherField(() => d, (k, t) => { if (k) d.weather = k; else delete d.weather; if (t !== undefined) d.weatherTurns = t; else delete d.weatherTurns; }, rerender)),
      h('section', { class: 'db-section' }, h('h3', {}, 'Spell addition'),
        h('div', { class: 'seq-edit' }, ...(d.sequence ?? []).map((b, i) => h('span', { class: 'seq-slot' },
          select((['A', 'B', 'X', 'Y'] as FaceButton[]).map((x) => [x, x] as [string, string]), b, (v) => { d.sequence![i] = v as FaceButton; }, { 'aria-label': `Spell button ${i + 1}` }),
          h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove button ${i + 1}`, onclick: () => { d.sequence!.splice(i, 1); if (!d.sequence!.length) delete d.sequence; rerender(); } }, '✕'))),
          h('button', { type: 'button', class: 'btn small', onclick: () => { (d.sequence ??= []).push((['A', 'B', 'X', 'Y'] as FaceButton[])[(d.sequence?.length ?? 0) % 4]); rerender(); } }, '+ Button')),
        d.sequence?.length ? h('div', { class: 'field-row' },
          field('Time to press them (s)', n(d.seqTime ?? 0, (v) => { const x = Math.round(v * 10) / 10; if (x > 0) d.seqTime = Math.max(0.5, x); else delete d.seqTime; }, 0.1, 0, 'Spell addition time'), `0: ${(0.8 * d.sequence.length + 1.2).toFixed(1)} s for rank 1 (0.8 a button, plus 1.2); each rank adds a button.`),
          d.kind === 'support' ? field('A clean cast', select([['stronger', 'Makes its buffs stronger'], ['longer', 'Makes them last longer (a turn more; weather two rounds more)']], d.seqBonus ?? 'stronger', (v) => { if (v === 'longer') d.seqBonus = 'longer'; else delete d.seqBonus; })) : h('span')) : h('span'),
        h('p', { class: 'note' }, 'Turn-based: as the spell goes off, the camera holds on the caster and these buttons show in a row with a timer; the player presses them in order (A, B, X, Y: keys A B X Y, a controller’s face buttons, or the on-screen pads). Each rank above the first adds one more (round the sequence again). A wrong button or running out of time ends it: the spell goes off weaker (half, plus half for the share right). A clean cast is full strength, up to 15% stronger for a fast one. Each right button earns a little EXP, a clean cast more. With Addition timing set to Automatic it plays itself. No buttons: the spell just goes off.')),
      h('section', { class: 'db-section' }, h('h3', {}, 'Ranks'),
        h('div', { class: 'field-row' },
          field('Highest rank', n(spellMaxRank(d), (v) => { d.maxRank = Math.max(1, Math.min(9, Math.round(v))); rerender(); }, 1, 1, 'Max rank')),
          field('Each rank: power +%', n(d.rankPower ?? 60, (v) => { const x = Math.round(v); if (x === 60) delete d.rankPower; else d.rankPower = x; rerender(); }, 5, 0, 'Rank power')),
          field('Each rank: magic +%', n(d.rankMp ?? 50, (v) => { const x = Math.round(v); if (x === 50) delete d.rankMp; else d.rankMp = x; rerender(); }, 5, 0, 'Rank magic'))),
        table,
        h('p', { class: 'note' }, 'Each rank above the first also takes one more turn to charge in a turn-based battle: a bigger spell is a bigger commitment. A foe’s Counterspell (Database → Enemies) breaks a spell being charged. In battle the caster picks which rank to cast.')),
      d.kind === 'bolt' ? h('section', { class: 'db-section' }, h('h3', {}, 'Action mode'),
        h('div', { class: 'field-row' },
          field('Bolt speed', n(d.speed ?? 0, (v) => { if (v > 0) d.speed = v; else delete d.speed; }, 0.5, 0, 'Bolt speed'), '0: Database → Combat’s spell speed.'),
          field('Range (tiles)', n(d.range ?? 0, (v) => { if (v > 0) d.range = v; else delete d.range; }, 0.5, 0, 'Bolt range'), '0: Database → Combat’s spell range.')),
        h('p', { class: 'note' }, 'In action mode the player readies a learned attack spell for the spell button in Menu → Abilities (it takes the place of a spell shard; shards still enchant gear at the forge).')) : h('span'),
      h('p', { class: 'note' }, 'Heroes learn spells from skill-tree skills (Database → Skills: “Teaches spell”), from events and trainers (event command “Teach spell / Addition”), or from the start (Database → Heroes).'),
    ];
  }, rerender, 'No spells yet.');
}

/* ------------------------------------------------------------------ Additions */

const BUTTONS: [string, string][] = [['A', 'A'], ['B', 'B'], ['X', 'X'], ['Y', 'Y'], ['any', 'Any button']];

export function additionsTab(list: AdditionDef[], state: { sel: number }, rerender: () => void): HTMLElement[] {
  return listLayout<AdditionDef>(list, state, 'Addition', (id) => ({ id, name: 'New Addition', strikes: [{ power: 1 }] }), (d) => {
    const strikes = d.strikes;
    const row = (s: AdditionStrike, k: number) => h('div', { class: 'db-table add-strike' },
      h('span', { class: 'db-name' }, `Strike ${k + 1}`),
      field('Power ×', n(s.power, (v) => (s.power = v), 0.05, 0, `Strike ${k + 1} power`)),
      field('Button', select(BUTTONS, s.button ?? 'A', (v) => { if (v === 'A') delete s.button; else s.button = v as FaceButton | 'any'; }, { 'aria-label': `Strike ${k + 1} button` })),
      field('Ring closes (s)', n(s.time ?? 0.7, (v) => { const t = Math.max(0.25, v); if (Math.abs(t - 0.7) < 1e-6) delete s.time; else s.time = t; }, 0.05, 0.25, `Strike ${k + 1} time`)),
      field('Window (s)', n(s.window ?? 0.24, (v) => { const w = Math.max(0.06, v); if (Math.abs(w - 0.24) < 1e-6) delete s.window; else s.window = w; }, 0.02, 0.06, `Strike ${k + 1} window`)),
      strikes.length > 1 ? h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove strike ${k + 1}`, onclick: () => { strikes.splice(k, 1); rerender(); } }, '✕') : h('span'));
    const total = strikes.reduce((s, x) => s + x.power, 0);
    return [
      nameId(list, d, rerender, 'Addition'),
      field('Description', textInput(d.description ?? '', (v) => { d.description = v.trim() || undefined; }, { 'aria-label': 'Addition description' })),
      soundField('Call-out', d.sound, (v) => { d.sound = v; }, 'What the hero shouts when the whole string lands (“Quick slash!”).'),
      h('section', { class: 'db-section' }, h('h3', {}, `Strikes (${strikes.length})`),
        ...strikes.map(row),
        strikes.length < 7 ? h('button', { type: 'button', class: 'btn', onclick: () => { strikes.push({ ...strikes[strikes.length - 1] }); rerender(); } }, '+ Add strike') : h('span'),
        h('p', { class: 'note' }, `All strikes landed: ${Math.round(total * 100)}% of the hero’s attack (perfect timing adds 10% a strike). Each strike: a ring closes on the target and the button must be pressed as it meets the marker, inside the window. A miss or the wrong button ends the string (a missed first strike still lands, at half). Shorter ring times and windows, and mixed buttons, make an Addition harder.`)),
      h('section', { class: 'db-section' }, h('h3', {}, 'Mastery'),
        h('div', { class: 'field-row' },
          field('Highest rank', n(d.maxRank ?? 5, (v) => { const r = Math.max(1, Math.min(9, Math.round(v))); if (r === 5) delete d.maxRank; else d.maxRank = r; }, 1, 1, 'Max rank')),
          field('Completions per rank', n(d.usesPerRank ?? 6, (v) => { const u = Math.max(1, Math.round(v)); if (u === 6) delete d.usesPerRank; else d.usesPerRank = u; }, 1, 1, 'Uses per rank'), 'Rank 2 takes this many; rank 3 twice as many more, and so on.'),
          field('Each rank: damage +%', n(d.rankDamage ?? 12, (v) => { const x = Math.round(v); if (x === 12) delete d.rankDamage; else d.rankDamage = x; }, 1, 0, 'Rank damage')),
          field('Each rank: window +%', n(d.rankWindow ?? 6, (v) => { const x = Math.round(v); if (x === 6) delete d.rankWindow; else d.rankWindow = x; }, 1, 0, 'Rank window'))),
        h('p', { class: 'note' }, 'An Addition ranks up by being performed in full, like Legend of Dragoon. Heroes learn Additions from skill-tree skills (“Teaches Addition”), from events and trainers, or from the start (Database → Heroes).')),
    ];
  }, rerender, 'No Additions yet.');
}

/* ------------------------------------------------------------------ classes */

export function classesTab(list: ClassDef[], skills: SkillsData, state: { sel: number }, rerender: () => void, openTree: (id: string) => void = () => {}, armor?: ArmorTypeDef[], weapons?: WeaponTypeDef[]): HTMLElement[] {
  return listLayout<ClassDef>(list, state, 'Class', (id) => ({ id, name: 'New class', trees: skills.trees.slice(0, 1).map((t) => t.id) }), (d) => [
    nameId(list, d, rerender, 'Class'),
    field('Description', textInput(d.description ?? '', (v) => { d.description = v.trim() || undefined; }, { 'aria-label': 'Class description' })),
    h('section', { class: 'db-section' }, h('h3', {}, 'Stat boost'),
      h('div', { class: 'field-row class-stats' }, ...ATTRS.map((k) => field(ATTR_INFO[k].name, numberInput(d.bonus?.[k] ?? 0, (v) => {
        const n = Math.max(-50, Math.min(50, Math.round(v)));
        if (n) (d.bonus ??= {})[k] = n; else if (d.bonus) { delete d.bonus[k]; if (!Object.keys(d.bonus).length) delete d.bonus; }
      }, { step: 1, min: -50, max: 50, 'aria-label': `${d.name} ${ATTR_INFO[k].name} boost` })))),
      h('p', { class: 'note' }, 'Given once, for good, when a hero joins the class (their starting class counts). A Fighter might get Strength and Endurance, a Mage Magic and Magic Defence.')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Weapons and armor'),
      h('div', { class: 'db-table class-gear' }, h('span', { class: 'db-head' }, 'Kind'), h('span', { class: 'db-head' }, 'This class'),
        ...gearKinds({ armorTypes: armor, weaponTypes: weapons }).flatMap(([k, name]) => [h('span', { class: 'db-name' }, name), select([['trained', 'Trained (full effect)'], ['untrained', 'Untrained (weaker)'], ['none', 'Can’t use']], d.gear?.[k] ?? 'trained', (v) => {
          if (v === 'trained') { if (d.gear) { delete d.gear[k]; if (!Object.keys(d.gear).length) delete d.gear; } } else (d.gear ??= {})[k] = v as GearSkill;
        }, { 'aria-label': `${d.name}: ${name}` })])),
      h('div', { class: 'field-row' },
        weapons ? h('button', { type: 'button', class: 'btn small', onclick: () => openWeaponTypes(weapons, rerender) }, 'Edit weapon types…') : h('span'),
        armor ? h('button', { type: 'button', class: 'btn small', onclick: () => openArmorTypes(armor, rerender) }, 'Edit armor types…') : h('span')),
      h('p', { class: 'note' }, 'Untrained weapons hit for three quarters. Untrained armor costs the stats set for its type (Edit armor types…). “Can’t use” greys it out in Equipment for heroes of this class. A weapon’s type is set in Database → Weapons and an armor’s type in Database → Gear (or guessed from the name). Arms Training in the skill trees still decides medium and heavy weapon training too.')),
    classTrees(d, skills, rerender, openTree),
  ], rerender, 'No classes yet. Without classes, every hero learns from every skill tree. Add classes to give each its own trees; set a hero’s starting class in Database → Heroes, and change or unlock classes with the event command “Change class”.');
}

/** A class's skill trees: one dropdown per tree (add or remove more), and a preview of each that opens it for editing. */
function classTrees(d: ClassDef, skills: SkillsData, rerender: () => void, openTree: (id: string) => void): HTMLElement {
  // The Party tree is everyone's already, whatever their class.
  const choices = skills.trees.filter((t) => !t.shared);
  const opts: [string, string][] = choices.map((t) => [t.id, t.name]);
  d.trees = d.trees.filter((id, i, a) => a.indexOf(id) === i);
  const rows = d.trees.map((id, k) => h('div', { class: 'class-tree-row' },
    field(k ? `Skill tree ${k + 1}` : 'Skill tree', select(opts.some(([v]) => v === id) ? opts : [[id, `${id} (missing)`], ...opts], id, (v) => { d.trees[k] = v; rerender(); }, { 'aria-label': `${d.name} skill tree ${k + 1}` })),
    h('button', { type: 'button', class: 'mini-btn', title: 'Remove this tree from the class', 'aria-label': `Remove ${id}`, onclick: () => { d.trees.splice(k, 1); rerender(); } }, '×'),
    treePreview(skills, id, () => openTree(id))));
  const unused = choices.filter((t) => !d.trees.includes(t.id));
  return h('section', { class: 'db-section' }, h('h3', {}, 'Skill trees'),
    ...(rows.length ? rows : [h('p', { class: 'note warn' }, 'No tree yet: heroes of this class have nothing to learn (besides the Party tree).')]),
    choices.length
      ? h('button', { type: 'button', class: 'btn small', disabled: !unused.length, title: unused.length ? 'Give this class another tree' : 'Every tree is already given', onclick: () => { d.trees.push(unused[0].id); rerender(); } }, d.trees.length ? '+ Another tree' : '+ Pick a tree')
      : h('p', { class: 'note' }, 'Make skill trees in Database → Skill trees first.'),
    h('p', { class: 'note' }, 'A hero learns from the trees of their class, and of every class they’ve had before (only the event command Change class changes it; players can’t). Heroes without a class (or a game with no classes) see every tree. Click a tree’s picture to edit it.'));
}

/** A spell's icon in the battle menus: its element's (default), or a built-in icon, tinted if wanted. */
function spellIconField(d: SpellEntry, rerender: () => void): HTMLElement {
  const own = !!d.icon;
  const el = d.element && d.element !== 'neutral' ? d.element : null;
  const preview = own ? builtinIcon(builtinIconName(d.icon) ?? 'spell_fire', d.iconTint).toDataURL() : el ? elementIconUrl(el) : builtinIcon('spell_fire', d.iconTint ?? d.color).toDataURL();
  return field('Icon', h('div', { class: 'icon-picker' },
    h('div', { class: 'spell-icon-row' }, h('img', { src: preview, alt: '' }),
      select([['element', el ? 'Use its element’s icon' : 'Use its element (none: the magic icon in its colour)'], ['own', 'Pick an icon']], own ? 'own' : 'element', (v) => {
        if (v === 'own') d.icon = 'builtin:spell_fire'; else { delete d.icon; delete d.iconTint; }
        rerender();
      }, { 'aria-label': `${d.name} icon` })),
    ...(own ? [tintRow(d.iconTint, (t) => { if (t) d.iconTint = t; else delete d.iconTint; rerender(); }), iconGrid(d.icon, d.iconTint, (icon) => { d.icon = icon; rerender(); })] : [])),
    'Shown beside its name in the battle Magic list.');
}
