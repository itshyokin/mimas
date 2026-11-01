/**
 * Database → Combat (battles, weapon damage, the sword, bow and spells on the map, forges, levels)
 * and Database → Enemies (the list of enemy types with a form for the selected one).
 */
import { itemSections } from './itemSections';
import { ailmentChips, buffsField, inflictsField, weatherField } from './statusFields';
import type { Ailment } from '../world/types';
import { DEFAULT_STATUS_PILLS, type StatusPill } from '../game/battle/statusPills';
import type { BattleAilment } from '../game/battle/status';
import { AILMENT_INFO } from '../game/status';
import { defenceSection, elementSelect } from './elementFields';
import { ELEMENT_NAMES } from '../game/elements';
import { MONSTERS } from '../art/placeholderArt';
import { ITEM_ICONS } from '../art/itemIcons';
import { enemyWeaponSprites } from '../game/combat/weaponSprites';
import { weaponSpriteField } from './weaponPicker';
import { DEFAULT_COMBAT, combatConfig } from '../game/combat/config';
import { atLevel } from '../game/enemyLevels';
import { enemyAgility } from '../game/battle/rules';
import type { CombatData, EncounterPick, EnemyAction, EnemyBehaviour, EnemyDef, FlatLook, ImpactFx, Material, WeaponClass } from '../world/types';
import { FX_INFO, IMPACT_FX, MATERIALS, MATERIAL_INFO, materialOf } from '../game/battle/impact';
import { playSound } from './CommandEditor';
import { checkbox, field, h, numberInput, select, textInput } from './dom';
import { enemyImage, setFlatImage } from './editorArt';
import { canvasFromBlob } from '../shared/images';
import { toast } from './dom';
import { tintCanvas } from '../render/tint';
import { combatPreviewRow } from './combatPreview';
import type { EditorStore } from './store';
import { TIER_NAMES, type EssenceRules } from '../game/essence';
import type { EssenceTier } from '../world/types';

const num = (v: number, set: (n: number) => void, step = 1, min = 0, label = '') =>
  numberInput(v, (n) => set(Math.max(min, n)), { step, min, 'aria-label': label, class: 'db-num' });

/** Status pills: short tags or full words, and each ailment's colours and text. */
function statusPillsSection(tb: NonNullable<CombatData['turnBased']>, T: ReturnType<typeof combatConfig>['turnBased']): HTMLElement {
  const redraws: (() => void)[] = [];
  const rows = (Object.keys(DEFAULT_STATUS_PILLS) as BattleAilment[]).flatMap((a) => {
    const d = DEFAULT_STATUS_PILLS[a], cur = { ...T.statusPills[a] };
    const pill = h('span', { class: 'st-pill' });
    const draw = () => { pill.textContent = (tb.statusWords === 'full' ? cur.word : cur.tag) || '—'; pill.style.background = cur.color; pill.style.color = cur.ink; };
    const set = (k: Exclude<keyof StatusPill, 'stays'>, v: string) => {
      cur[k] = v || d[k];
      const o = ((tb.statusPills ??= {})[a] ??= {});
      if (!v || v === d[k]) delete o[k]; else o[k] = v;
      if (!Object.keys(o).length) delete tb.statusPills![a];
      if (!Object.keys(tb.statusPills!).length) delete tb.statusPills;
      draw();
    };
    draw(); redraws.push(draw);
    const color = (k: 'color' | 'ink', label: string) => h('input', { type: 'color', value: cur[k], 'aria-label': `${AILMENT_INFO[a].name} ${label}`, oninput: (e: Event) => set(k, (e.target as HTMLInputElement).value) });
    return [h('span', { class: 'db-name' }, AILMENT_INFO[a].name), pill,
      textInput(cur.tag, (v) => set('tag', v.trim().toUpperCase().slice(0, 6)), { 'aria-label': `${AILMENT_INFO[a].name} tag`, maxlength: 6 }),
      textInput(cur.word, (v) => set('word', v.trim().toUpperCase().slice(0, 14)), { 'aria-label': `${AILMENT_INFO[a].name} word`, maxlength: 14 }),
      color('color', 'pill colour'), color('ink', 'text colour'),
      h('input', { type: 'checkbox', checked: cur.stays, title: 'Lasts after the battle, into the next one', 'aria-label': `${AILMENT_INFO[a].name} lasts after battle`, onchange: (e: Event) => {
        const v = (e.target as HTMLInputElement).checked, o = ((tb.statusPills ??= {})[a] ??= {});
        if (v === d.stays) delete o.stays; else o.stays = v;
        if (!Object.keys(o).length) delete tb.statusPills![a];
        if (!Object.keys(tb.statusPills!).length) delete tb.statusPills;
      } })];
  });
  return h('section', { class: 'db-section' }, h('h3', {}, 'Ailments'),
    field('Pills show', select([['short', 'Short tags (PSN)'], ['full', 'Full words (POISONED)']], T.statusWords, (v) => { if (v === 'full') tb.statusWords = 'full'; else delete tb.statusWords; redraws.forEach((r) => r()); }),
      'In the Pocket Handheld layout an ailment shows as a pill beside the fighter’s name and level.'),
    h('div', { class: 'db-table status-pills' }, ...['Ailment', 'Pill', 'Tag', 'Word', 'Pill', 'Text', 'Lasts'].map((t) => h('span', { class: 'db-head' }, t)), ...rows),
    h('p', { class: 'note' }, 'A fighter has one ailment at a time: one that’s poisoned can’t be burned until it’s cured or wears off (Chill and the Frozen it leads to count as one; Zombie replaces the rest). Lasts: still there after the battle, into the next one, until it wears off there, an item cures it or the party rests. Clear a box to go back to its default.'));
}

/** The Combat tab. Edits `data` (only differences from the defaults are kept when saving). */
export function combatTab(data: CombatData): HTMLElement[] {
  const c = combatConfig(data);
  const setClass = (k: WeaponClass, f: 'speed' | 'reach' | 'damage', v: number) => { ((data.classes ??= {})[k] ??= {})[f] = v; };
  const tb = (data.turnBased ??= {}), T = c.turnBased;
  // Settings of the real-time battle system (removed in update 65) aren't kept.
  for (const k of ['mode', 'dodge', 'block', 'sneakMultiplier', 'hurtGrace']) delete (data as Record<string, unknown>)[k];
  return [
    h('section', { class: 'db-section' }, h('h3', {}, 'Battles'),
      h('p', { class: 'note' }, 'Battles are turn-based. An enemy on the map that reaches the hero starts a battle with it and its friends nearby (from behind: an ambush). Hitting it first with the sword, an arrow or a spell gives the party the first turns: lock on with the bow (Q / Tab) to snipe one from afar. Maps can also have random encounters (map settings → Random encounters).'),
      h('div', { class: 'field-row' },
        field('Battle mode', select([['group', 'Group: up to three a side, with the turn order bar'], ['single', 'Single: one hero out at a time (Pokémon-style)']], T.mode, (v) => { if (v === 'single') tb.mode = 'single'; else delete tb.mode; }),
          'Single: one hero fights at a time; Swap brings in another (it goes first, and they take that round’s hits); a knocked-out hero’s place is filled at once. The hero picks, then the faster side goes first (Agility, Haste and Slow decide). Items can be used on anyone in the party. Each troop chooses how its foes come out (Database → Troops). The party falls when everyone who can fight is down.'),
        field('Single mode: battles are', select([['random', 'Wild encounter: one at random'], ['oneByOne', 'Trainer battle: one at a time'], ['full', 'Swarm: all at once']], T.singlePick, (v) => { if (v === 'random') delete tb.singlePick; else tb.singlePick = v as EncounterPick; }),
          'How foes come out unless a map (Map Properties → Battles), a troop or a Start battle event says otherwise.'),
        field('Heroes who fight (Single)', num(T.singleParty, (v) => (tb.singleParty = Math.max(1, Math.min(4, Math.round(v)))), 1, 1, 'Single mode party'), 'Single mode: how many of the lineup can be swapped in (1 – 4). Group battles keep three.')),
      h('div', { class: 'field-row' },
        field('Turn order', select([['ctb', 'Conditional turns (FFX)'], ['rounds', 'Rounds (classic)']],
          T.order, (v) => { tb.order = v === 'rounds' ? 'rounds' : undefined; }),
          'Conditional turns: fast fighters act more often, and Guard or an item brings the next turn sooner. Rounds: everyone acts once a round, fastest first.'),
        field('Run away chance %', num(T.flee, (v) => (tb.flee = Math.min(100, Math.round(v))), 5, 0, 'Run away chance'), 'When both sides are as fast. Each point of Agility the party has over the enemies adds 2%. Never from a boss.')),
      h('div', { class: 'field-row' },
        field('Enemies who join (tiles)', num(T.joinRadius, (v) => (tb.joinRadius = v), 0.5, 0, 'Join radius'), 'Enemies this close to the one that started it join the battle.'),
        field('Most enemies in a battle', num(T.maxEnemies, (v) => (tb.maxEnemies = Math.max(1, Math.min(3, Math.round(v)))), 1, 1, 'Max enemies')),
        field('Safe after a battle (s)', num(T.grace, (v) => (tb.grace = v), 0.5, 0, 'Grace after battle'), 'No new battle starts for this long after one is won or run from.'),
        field('Guard heals %', num(T.guardHeal, (v) => (tb.guardHeal = Math.min(100, Math.round(v))), 1, 0, 'Guard heal'), 'Guarding gives back this much of the guard’s health, halves damage and keeps ailments away until their next turn (Legend of Dragoon).')),
      h('div', { class: 'field-row' },
        field('Additions', select([['set', 'Set per hero in Menu → Abilities (Legend of Dragoon)'], ['choose', 'Chosen from a list with each Attack']], T.additions, (v) => { tb.additions = v === 'choose' ? 'choose' : undefined; }),
          'Additions: strings of timed strikes (Database → Additions), learned from the skill tree, events and trainers.'),
        field('Addition timing', select([['press', 'Pressed by the player'], ['auto', 'Automatic (every strike lands; for accessibility)']], T.additionTiming, (v) => { tb.additionTiming = v === 'auto' ? 'auto' : undefined; }))),
      field('Battle screen layout', select([['dragon', 'Dragon Legend: faces and numbers in a row, lists in the middle'], ['fantasy', 'Forbidden Fantasy: health bars in a box, lists at the side'], ['pocket', 'Pocket Handheld: Pokémon-style blocks, the foe across from the hero (best with Single mode)']], T.layout, (v) => { if (v === 'fantasy' || v === 'pocket') tb.layout = v; else delete tb.layout; }),
        'Dragon Legend shows each hero’s face (their Face art in Database → Heroes), name and HP / MP as numbers that turn yellow at half and red at a quarter.'),
      checkbox('Monster stat blocks: a block per foe across the top (picture, name, element, health and magic) instead of names and bars over them', !!tb.statBlocks, (v) => { if (v) tb.statBlocks = true; else delete tb.statBlocks; }),
      checkbox('The hero always fights (can’t be swapped onto the bench)', !!tb.heroLocked, (v) => { if (v) tb.heroLocked = true; else delete tb.heroLocked; }),
      checkbox('The party follows the hero on the map (they walk behind and copy jumps; they never start fights)', tb.partyFollows !== false, (v) => { if (v) delete tb.partyFollows; else tb.partyFollows = false; }),
      h('p', { class: 'note' }, 'Three fight at a time; the rest of the party (up to eight) wait on the bench. Swap them in Menu → Party → Swap, or with Swap in battle. Off: anyone can be swapped out, the hero too (they still lead on the map).'),
      h('div', { class: 'field-row' },
        field('Party damage ×', num(T.partyDamage, (v) => (tb.partyDamage = Math.max(0.1, v)), 0.05, 0.1, 'Party damage')),
        field('Enemy damage ×', num(T.enemyDamage, (v) => (tb.enemyDamage = Math.max(0.1, v)), 0.05, 0.1, 'Enemy damage'), 'Scale either side to make battles quicker or harder. Both start at 1 (the same numbers as on the map).')),
      h('p', { class: 'note' }, 'Enemies on the map chase the hero when they see or hear them, and start a battle when they reach them.')),
    statusPillsSection(tb, T),
    h('section', { class: 'db-section' }, h('h3', {}, 'EXP bonuses'),
      h('div', { class: 'field-row' }, ...([['finish', 'Finishing blow'], ['weak', 'Finished with a weakness'], ['strike', 'Each Addition strike'], ['complete', 'Addition completed'], ['noKo', 'No one knocked out']] as const).map(([k, name]) => field(`${name} %`,
        num(c.exp[k], (v) => ((data.exp ??= {})[k] = Math.max(0, Math.min(200, Math.round(v)))), 1, 0, `${name} EXP bonus`)))),
      h('p', { class: 'note' }, 'Only those fighting earn EXP, as each foe falls. These add a percent of that foe’s EXP: to whoever landed the finishing blow (more with a weakness), for each Addition strike landed (a perfect one twice that, shown at the bottom left as it lands) and for completing one. No one knocked out: each hero gets that percent more of what they earned. The bench gets EXP only with an EXP Share accessory or an EXP All key item (Database → Items).')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Enemy levels'),
      h('div', { class: 'field-row' }, ...(['hp', 'attack', 'defense', 'xp', 'gold'] as const).map((k) => field(`${{ hp: 'Health', attack: 'Damage', defense: 'Defence', xp: 'EXP', gold: 'Gold' }[k]} +% a level`,
        num(c.enemyGrowth[k], (v) => ((data.enemyGrowth ??= {})[k] = Math.max(0, Math.min(100, Math.round(v)))), 1, 0, `Enemy ${k} per level`)))),
      h('p', { class: 'note' }, 'Each enemy’s numbers are for its own level (Database → Enemies → Level). One that comes out higher (a spawn’s level range, or dynamic levels from the event command Enemy levels) gains these percentages each level above; lower takes them away. 12% health a level: a level 1 slime with 20 health has 44 at level 11.')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Bestiary'),
      h('div', { class: 'field-row' },
        field('Numbers show after', num(c.bestiary.stats, (v) => ((data.bestiary ??= {}).stats = Math.max(0, Math.round(v))), 1, 0), 'Defeats of that kind before its health, attack and defence show in the Journal.'),
        field('Elements show after', num(c.bestiary.elements, (v) => ((data.bestiary ??= {}).elements = Math.max(0, Math.round(v))), 1, 0), 'Its weaknesses and resistances.'),
        field('Drops show after', num(c.bestiary.drops, (v) => ((data.bestiary ??= {}).drops = Math.max(0, Math.round(v))), 1, 0), 'What it can drop.')),
      h('p', { class: 'note' }, 'Pause → Journal → Bestiary lists every enemy the party has met: its picture, description, where it was seen and how many were defeated. Ones not met yet show as “???”. Write each enemy’s description in Enemies.')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Weapon damage'),
      h('div', { class: 'db-table classes' },
        h('span', { class: 'db-head' }, 'Class'), h('span', { class: 'db-head' }, 'Damage ×'), h('span', { class: 'db-head' }, 'Sword swing on the map'), h('span', { class: 'db-head' }, 'Reach (tiles)'),
        ...(['light', 'medium', 'heavy'] as WeaponClass[]).flatMap((k) => [
          h('span', { class: 'db-name' }, k[0].toUpperCase() + k.slice(1)),
          num(c.classes[k].damage, (v) => setClass(k, 'damage', v), 0.05, 0.1, `${k} damage`),
          num(c.classes[k].speed, (v) => setClass(k, 'speed', v), 0.05, 0.2, `${k} speed`),
          num(c.classes[k].reach, (v) => setClass(k, 'reach', v), 0.05, 0.5, `${k} reach`),
        ])),
      field('Unarmed damage', num(c.unarmedDamage, (v) => (data.unarmedDamage = v), 1, 0, 'Unarmed damage')),
      h('p', { class: 'note' }, 'A hero’s Attack in battle: the weapon’s damage × its class, with Strength and skills. Swing speed and reach only change how the sword swings on the map (cutting vines and grass, hitting switches, striking a foe first).')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Sword, bow and spells on the map'),
      h('div', { class: 'field-row' },
        field('Full draw (s)', num(c.bow.drawTime, (v) => ((data.bow ??= {}).drawTime = Math.max(0.1, v)), 0.05, 0.1, 'Draw time')),
        field('Arrow speed', num(c.bow.arrowSpeed, (v) => ((data.bow ??= {}).arrowSpeed = v), 1, 2, 'Arrow speed'))),
      h('div', { class: 'field-row' },
        field('Lock-on range with a bow', num(c.bow.lockRange, (v) => ((data.bow ??= {}).lockRange = v), 1, 2, 'Bow lock range'), 'A bow locks on much further away (Q / Tab), so a distant foe can be sniped to start a battle with the first turns.'),
        field('Lock-on range otherwise', num(c.lockRange, (v) => (data.lockRange = v), 1, 2, 'Lock range'))),
      h('div', { class: 'field-row' },
        field('Spell bolt speed', num(c.fire.speed, (v) => ((data.fire ??= {}).speed = v), 0.5, 1, 'Spell speed')),
        field('Spell bolt range', num(c.fire.range, (v) => ((data.fire ??= {}).range = v), 0.5, 1, 'Spell range'))),
      field('A fire attack lights a fire for (s)', num(c.fire.kindle, (v) => ((data.fire ??= {}).kindle = Math.max(1, v)), 1, 1, 'Kindle time'),
        'Fire spells, fire arrows and fire weapons light a torch, brazier or campfire that has run out of fuel, but only for this many seconds (real time). Fuel keeps it going.'),
      h('p', { class: 'note' }, 'The hero always has a sword and a bow on the map (no arrows needed): they cut vines, hit switches and break things, and striking a foe first starts the battle with the party’s turns first. An equipped weapon or bow shows in their place; an equipped arrow lends its element.')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Forges (anvils)'),
      h('div', { class: 'field-row' },
        field('Upgrades per item', num(data.forge?.maxLevel ?? 5, (v) => ((data.forge ??= {}).maxLevel = Math.max(1, Math.round(v))), 1, 1, 'Forge max level')),
        field('Each upgrade adds %', num(data.forge?.percent ?? 8, (v) => ((data.forge ??= {}).percent = Math.max(0, v)), 1, 0, 'Forge upgrade percent'))),
      h('p', { class: 'note' }, 'At an anvil (the Anvil prop, or any prop marked as a forge) the player smelts ore into ingots and upgrades weapons and armor with ingots of their material (+1 takes 1 ingot, +2 takes 2…: damage or defence goes up by the percent above each time). Elements come from element stones now (below), not shards set in gear.')),
    elementStones(c, data),
    h('section', { class: 'db-section' }, h('h3', {}, 'Stealth and levels'),
      field('Campfire safe ground (tiles)', num(c.campSafe, (v) => (data.campSafe = Math.max(0, v)), 0.5, 0, 'Campfire safe radius'),
        'No enemy comes within this many tiles of a lit campfire (a fire that’s also a respawn point), or attacks a hero inside it. 0: off.'),
      h('div', { class: 'field-row' },
        field('Skill points per level', num(c.pointsPerLevel, (v) => (data.pointsPerLevel = Math.round(v)), 1, 0, 'Points per level')),
        field('Party skill points per level', num(c.sharedPointsPerLevel, (v) => (data.sharedPointsPerLevel = Math.round(v)), 1, 0, 'Party tree points each time the hero levels up')),
        field('Skill points at the start', num(c.startPoints, (v) => (data.startPoints = Math.round(v)), 1, 0, 'Start points'))),
      h('p', { class: 'note' }, 'Sneaking past foes (or striking one that hasn’t noticed the hero, no ? or !) gives the first turns. How much EXP each level takes is under Player → EXP progression.')),
  ];
}

/** Only the combat settings that differ from the defaults (or undefined). */
export function cleanCombat(data: CombatData): CombatData | undefined {
  const D = DEFAULT_COMBAT as unknown as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) { if (v.length) out[k] = v; continue; }
    if (k === 'classes') {
      const cls: Record<string, Record<string, number>> = {};
      for (const [ck, cv] of Object.entries(v as Record<string, Record<string, number>>)) {
        const base = DEFAULT_COMBAT.classes[ck as WeaponClass] as unknown as Record<string, number>;
        const part = Object.fromEntries(Object.entries(cv ?? {}).filter(([f, n]) => n !== undefined && n !== base[f]));
        if (Object.keys(part).length) cls[ck] = part;
      }
      if (Object.keys(cls).length) out.classes = cls;
    } else if (typeof v === 'object') {
      const base = D[k] as Record<string, unknown>;
      const part = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([f, n]) => n !== undefined && n !== base[f]));
      if (Object.keys(part).length) out[k] = part;
    } else if (v !== D[k]) out[k] = v;
  }
  return Object.keys(out).length ? (out as CombatData) : undefined;
}

const BEHAVIOURS: [EnemyBehaviour, string][] = [
  ['melee', 'Melee: walks up and strikes'],
  ['ranged', 'Ranged: keeps its distance and shoots arrows'],
  ['charger', 'Charger: winds up, then rushes in a straight line'],
];

export function defaultEnemy(id: string): EnemyDef {
  return { id, name: 'New enemy', look: { monster: 'slime' }, hp: 20, damage: 6, speed: 1.6, behaviour: 'melee', attackRange: 0.9, cooldown: 1.5, windup: 0.5, sight: 6, fov: 140, hearing: 5, xp: 10, gold: [0, 4] };
}

/** The Enemies tab: list on the left, the selected enemy's form on the right. */
export function enemiesTab(store: EditorStore, list: EnemyDef[], state: { sel: number }, rerender: () => void): HTMLElement[] {
  state.sel = Math.min(state.sel, list.length - 1);
  const add = () => {
    let id = 'enemy', n = 2;
    while (list.some((d) => d.id === id)) id = `enemy_${n++}`;
    list.push(defaultEnemy(id));
    state.sel = list.length - 1;
    rerender();
  };
  const thumb = (d: EnemyDef) => { const c0 = enemyImage(store.db, d.look), c = c0 && d.tint ? tintCanvas(c0, d.tint) : c0; return c ? h('img', { src: c.toDataURL(), alt: '', class: 'item-icon' }) : h('span'); };
  const side = h('div', { class: 'item-list', role: 'listbox', 'aria-label': 'Enemies' },
    ...list.map((d, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } }, thumb(d), h('span', {}, d.name))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, '+ New enemy'));
  const d = list[state.sel];
  const form = h('div', { class: 'item-form' });
  if (!d) form.append(h('p', { class: 'note' }, 'No enemies yet. Add a type here, then place it on a map: Events layer → click a tile → Create enemy here.'));
  else form.append(...enemyForm(store, list, d, rerender, () => { list.splice(state.sel, 1); state.sel = Math.max(0, state.sel - 1); rerender(); }, (i) => { state.sel = i; }));
  return [h('div', { class: 'items-layout' }, side, form)];
}

/** Load the flat enemy pictures the database uses (for the editor's previews and playtests). */
export async function loadEnemyImages(store: EditorStore): Promise<void> {
  await Promise.all((store.db.enemies ?? []).map(async (d) => {
    const p = d.look.image;
    if (!p || store.files.has(p)) return;
    try { const b = await store.project.readFile(p); store.files.set(p, b); setFlatImage(p, await canvasFromBlob(b)); }
    catch { console.warn(`${d.name}: picture ${p} is missing`); }
  }));
}

/** Choose a picture for a flat enemy: saved to assets/enemies/ (or kept for the session when the editor can't save). */
function pickFlatImage(store: EditorStore, d: EnemyDef, done: () => void): void {
  const input = h('input', { type: 'file', accept: 'image/png,image/webp,image/gif' });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    let canvas: HTMLCanvasElement;
    try { canvas = await canvasFromBlob(f); } catch { toast('That file isn’t an image the browser can read', 'error'); return; }
    // A new name each time, so the game never shows an old copy.
    const path = `assets/enemies/${d.id}_${Date.now().toString(36)}.png`;
    const p = store.project, persistent = p.canSave && p.canStoreImages;
    try { if (persistent) await p.writeFile(path, f); }
    catch (err) { toast(`Couldn’t save the picture: ${err instanceof Error ? err.message : String(err)}`, 'error'); return; }
    store.files.set(path, f);
    setFlatImage(path, canvas);
    d.look = { image: path, flat: d.look.flat ?? {} };
    if (!persistent) toast('Picture kept for this session only: open the project folder itself to save imported images.');
    done();
  });
  input.click();
}

function enemyForm(store: EditorStore, list: EnemyDef[], d: EnemyDef, rerender: () => void, remove: () => void, pick: (i: number) => void = () => {}): HTMLElement[] {
  const n = (v: number, set: (x: number) => void, step = 1, min = 0) => numberInput(v, (x) => set(Math.max(min, x)), { step, min });
  const chars = Object.entries(store.db.characters).map(([k, c]) => [`c:${k}`, `Character: ${c.name}`] as [string, string]);
  const monsters = Object.entries(MONSTERS).map(([k, m]) => [`m:${k}`, `Monster: ${m.name}`] as [string, string]);
  const look = d.look.character ? `c:${d.look.character}` : `m:${d.look.monster ?? 'slime'}`;
  const kind = d.look.image ? 'flat' : d.look.character ? 'sheet' : 'monster';
  const flat: FlatLook = d.look.flat ?? {};
  const setFlat = (k: keyof FlatLook, v: FlatLook[keyof FlatLook] | undefined) => {
    const f: FlatLook = { ...flat, [k]: v };
    if (v === undefined) delete f[k];
    d.look = { ...d.look, flat: f };
    rerender();
  };
  const firstChar = Object.keys(store.db.characters)[0];
  const kindField = field('Sprite', select([['sheet', 'Matches the player’s sprite sheet (a character)'], ['flat', 'Flat sprite (one picture, moved for you)'], ['monster', 'Built-in monster']], kind, (v) => {
    if (v === kind) return;
    if (v === 'sheet') d.look = firstChar ? { character: firstChar } : { monster: 'slime' };
    else if (v === 'monster') d.look = { monster: 'slime' };
    else { pickFlatImage(store, d, rerender); return; }
    rerender();
  }), kind === 'flat' ? 'One picture (a wolf, a giant bee…), no frames needed: it breathes while standing and slides, hops or flies when it moves, mirrored to face where it’s going.' : kind === 'sheet' ? 'Characters from Database → Characters, like the ones you make in the Character Builder.' : 'Drawn by the engine.');
  const lookFields: HTMLElement[] = kind === 'flat' ? [
    h('div', { class: 'field-row' },
      field('Picture', h('button', { type: 'button', class: 'btn', onclick: () => pickFlatImage(store, d, rerender) }, 'Choose another picture…'), d.look.image ? d.look.image.split('/').pop() : ''),
      field('Moves by', select([['slide', 'Sliding (a little sway)'], ['hop', 'Hopping'], ['fly', 'Flying (hovers and bobs)']], flat.move ?? 'slide', (v) => setFlat('move', v === 'slide' ? undefined : v as FlatLook['move']))),
      field('The picture faces', select([['right', 'Right'], ['left', 'Left'], ['none', 'Doesn’t matter (never mirror it)']], flat.faces ?? 'right', (v) => setFlat('faces', v === 'right' ? undefined : v as FlatLook['faces'])), 'It’s mirrored to face the other way.')),
    h('div', { class: 'field-row' },
      field('Height (tiles)', n(flat.height ?? 1, (v) => setFlat('height', Math.abs(v - 1) < 1e-6 ? undefined : Math.max(0.25, Math.round(v * 20) / 20)), 0.25, 0.25), 'Its width follows the picture. Size (above) scales it further.'),
      checkbox('Breathes while standing still', flat.breathe !== false, (v) => setFlat('breathe', v ? undefined : false))),
  ] : [];
  const items = (store.db.items ?? []).map((i) => [i.id, i.name] as [string, string]);
  const drops = (d.drops ??= []);
  const raw = enemyImage(store.db, d.look), img = raw && d.tint ? tintCanvas(raw, d.tint) : raw;
  const tint = d.tint ?? {};
  const setTint = (k: keyof NonNullable<EnemyDef['tint']>, v: number | string | undefined) => {
    const t: NonNullable<EnemyDef['tint']> = { ...tint, [k]: v };
    if (!t.hue) delete t.hue;
    if (t.sat === undefined || Math.abs(t.sat - 1) < 0.001) delete t.sat;
    if (!t.amount) { delete t.amount; delete t.color; }
    d.tint = Object.keys(t).length ? t : undefined;
    rerender();
  };
  const slider = (value: number, min: number, max: number, step: number, label: string, fmt: (v: number) => string, set: (v: number) => void) => {
    const out = h('output', { class: 'blend-out' }, fmt(value));
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label,
      oninput: () => { out.textContent = fmt(parseFloat(input.value)); }, onchange: () => set(parseFloat(input.value)) }) as HTMLInputElement;
    return h('div', { class: 'blend-slider' }, input, out);
  };
  const tintColor = h('input', { type: 'color', value: tint.color ?? '#ff4040', 'aria-label': 'Tint colour' }) as HTMLInputElement;
  tintColor.addEventListener('change', () => { tint.color = tintColor.value; if (!tint.amount) tint.amount = 0.5; setTint('color', tintColor.value); });
  return [
    h('div', { class: 'item-head' }, img ? h('img', { src: img.toDataURL(), alt: '', class: 'item-icon big' }) : h('span'),
      field('Name', textInput(d.name, (v) => { d.name = v.trim() || d.name; rerender(); }, { 'aria-label': 'Enemy name' })),
      field('Id', textInput(d.id, (v) => {
        const id = v.trim().replace(/[^A-Za-z0-9_-]+/g, '_');
        if (id && !list.some((o) => o !== d && o.id === id)) d.id = id;
        rerender();
      }, { 'aria-label': 'Enemy id', title: 'Event pages refer to the enemy by this id' }))),
    // (Gathered into the Switches box at the top with the rest.)
    checkbox('Boss: no running away, and Assassinate can’t end it', !!d.boss, (v) => { d.boss = v || undefined; if (!v) delete d.overdrive; rerender(); }),
    checkbox('Water enemy: can be hooked while fishing (a fishing spot’s Water enemies chance)', !!d.water, (v) => { if (v) d.water = true; else delete d.water; }),
    ...(d.boss ? [checkbox('Overdrive gauge (with stat blocks on): fills as it’s hurt; full, its next move hits half again as hard', !!d.overdrive, (v) => (d.overdrive = v || undefined))] : []),
    checkbox('Undead: always a zombie (healing hurts it; no ailments; can’t be killed outright)', !!d.undead, (v) => { d.undead = v || undefined; rerender(); }),
    checkbox('Leave it out of the Bestiary', !!d.noBestiary, (v) => (d.noBestiary = v || undefined)),
    kindField,
    ...lookFields,
    h('div', { class: 'field-row' },
      kind === 'flat' ? h('span') : field('Looks like', select(kind === 'sheet' ? chars : monsters, look, (v) => { d.look = v.startsWith('c:') ? { character: v.slice(2) } : { monster: v.slice(2) }; rerender(); }), kind === 'sheet' ? 'From Database → Characters.' : ''),
      field('Size', n(d.scale ?? 1, (v) => (d.scale = v === 1 ? undefined : Math.max(0.4, v)), 0.1, 0.4)),
      field('Holds', select([['@auto', d.look.character ? `Automatic (${d.behaviour === 'ranged' ? 'bow' : 'sword'})` : 'Automatic (nothing)'], ['', 'Nothing'],
        ...['sword', 'dagger', 'greatsword', 'axe', 'bow'].map((k) => [k, ITEM_ICONS[k]?.name ?? k] as [string, string])],
        d.weapon === undefined ? '@auto' : d.weapon, (v) => { if (v === '@auto') delete d.weapon; else d.weapon = v; rerender(); }), 'Shown in its hand while it attacks.')),
    h('section', { class: 'db-section' }, h('h3', {}, 'Tint'),
      h('div', { class: 'field-row' },
        field('Hue', slider(tint.hue ?? 0, -180, 180, 5, 'Hue', (v) => `${v > 0 ? '+' : ''}${v}°`, (v) => setTint('hue', v)), 'Turns its colours round the colour wheel: a green slime becomes a blue or red one.'),
        field('Colourfulness', slider(Math.round((tint.sat ?? 1) * 100), 0, 200, 5, 'Saturation', (v) => `${v}%`, (v) => setTint('sat', v / 100)), '0%: grey; 200%: vivid.')),
      h('div', { class: 'field-row' },
        field('Mix in a colour', tintColor),
        field('How much', slider(Math.round((tint.amount ?? 0) * 100), 0, 100, 5, 'Tint amount', (v) => `${v}%`, (v) => { tint.color ??= tintColor.value; setTint('amount', v / 100); }))),
      h('div', { class: 'stack row' },
        h('button', { type: 'button', class: 'btn ghost', disabled: !d.tint, onclick: () => { d.tint = undefined; rerender(); } }, 'No tint'),
        h('span', { class: 'hint' }, 'Make new monsters from old art: the picture above shows the result, on the map and in battle too.'))),
    h('section', { class: 'db-section' }, h('h3', {}, 'Battle'),
      h('div', { class: 'field-row' },
        field('Height offset (tiles)', n(d.battleOffset ?? 0, (v) => { const r = Math.round(v * 100) / 100; d.battleOffset = r ? r : undefined; }, 0.05, -5), 'Raise (+) or lower (−) it on battle maps, for art with space under its feet (floating) or cut off at the bottom (sinking).')),
      combatPreviewRow(store.battleMapNames(), () => [d.id, d.id, d.id])),
    ...(d.look.character && store.db.characters[d.look.character]?.anim ? [h('div', { class: 'field-row' },
      field('Weapon sprite', weaponSpriteField(store, {
        value: d.weaponSprite, auto: enemyWeaponSprites({ ...d, weaponSprite: undefined, shieldSprite: '' }, d.weapon ?? (d.behaviour === 'ranged' ? 'bow' : 'sword'))[0] ?? '',
        kinds: d.behaviour === 'ranged' ? ['bow'] : ['sword', 'blunt', 'staff'], autoLabel: 'Matches “Holds”',
        onChange: (v) => { if (v === undefined) delete d.weaponSprite; else d.weaponSprite = v; rerender(); },
      }), 'Its character is animated: it carries this LPC weapon and swings it.'),
      d.behaviour === 'ranged' ? h('span') : field('Shield', weaponSpriteField(store, {
        value: d.shieldSprite, auto: '', kinds: ['shield'], autoLabel: 'None',
        onChange: (v) => { if (v === undefined || v === '') delete d.shieldSprite; else d.shieldSprite = v; rerender(); },
      })))] : []),
    advancedForm(store, list, d, rerender, pick),
    h('section', { class: 'db-section' }, h('h3', {}, 'Fighting'),
      field('Behaviour', select(BEHAVIOURS, d.behaviour, (v) => { d.behaviour = v as EnemyBehaviour; if (v === 'ranged' && d.attackRange < 4) d.attackRange = 7; if (v === 'charger' && d.attackRange < 2) d.attackRange = 3.5; if (v === 'melee' && d.attackRange > 2) d.attackRange = 1; rerender(); })),
      h('div', { class: 'field-row' },
        field('Level', n(d.level ?? 1, (v) => { const l = Math.max(1, Math.min(99, Math.round(v))); if (l === 1) delete d.level; else d.level = l; }, 1, 1), 'The level these numbers are for. Spawns can roll it higher or lower (map → Spawns → Levels), growing its numbers (Combat → Enemy levels).'),
        field('Health', n(d.hp, (v) => (d.hp = Math.max(1, Math.round(v))), 1, 1)),
        field('Health ± %', n(d.hpVariance ?? 0, (v) => (d.hpVariance = Math.max(0, Math.min(90, Math.round(v))) || undefined), 0, 5), 'Each one rolls its health this much either side (10: a 20-health slime has 18 to 22).'),
        field('Damage', n(d.damage, (v) => (d.damage = Math.round(v)))),
        field('Damage ± %', n(d.damageVariance ?? 10, (v) => (d.damageVariance = Math.max(0, Math.min(90, Math.round(v))) === 10 ? undefined : Math.max(0, Math.min(90, Math.round(v)))), 0, 5), 'How much each hit varies either side (10 by default). The hero’s Defence (or Magic Defence) and guarding then cut it down.'),
        field('Defence', n(d.defense ?? 0, (v) => (d.defense = Math.round(v) || undefined)), 'Against swords and arrows. 50 halves the damage.'),
        field('Magic defence', n(d.magicDefense ?? d.defense ?? 0, (v) => (d.magicDefense = Math.round(v) === (d.defense ?? 0) ? undefined : Math.round(v))), 'Against spells (the same as Defence unless changed).'),
        field('Speed', n(d.speed, (v) => (d.speed = v), 0.1, 0.2), 'Tiles per second (the hero walks 3.4).'),
        field('Agility', n(enemyAgility(d), (v) => (d.agility = Math.max(1, Math.round(v)) === enemyAgility({ speed: d.speed }) ? undefined : Math.max(1, Math.round(v))), 1, 1),
          'Turn-based battles: how often its turns come round, like a hero’s Agility (10 is normal). Unset, it follows its speed.')),
      h('div', { class: 'field-row' },
        field('Accuracy %', n(d.accuracy ?? 95, (v) => { const x = Math.round(v); if (x === 95) delete d.accuracy; else d.accuracy = x; }, 1, 0), 'Turn-based: the chance its weapon hits land, before the hero’s dodging (Agility).'),
        field('Evasion %', n(d.evasion ?? 0, (v) => { const x = Math.round(v); if (x) d.evasion = Math.min(90, x); else delete d.evasion; }, 1, 0), 'Turn-based: the chance it dodges a weapon hit or arrow (an Addition that misses: no buttons, a MISS).'),
        field('Spell evasion %', n(d.spellEvasion ?? 0, (v) => { const x = Math.round(v); if (x) d.spellEvasion = Math.min(90, x); else delete d.spellEvasion; }, 1, 0), 'Turn-based: the chance it dodges an attack spell (heroes dodge spells with Magic Defence).'),
        field('Ailment resist %', n(d.ailmentResist ?? 0, (v) => { const x = Math.round(v); if (x) d.ailmentResist = Math.min(100, x); else delete d.ailmentResist; }, 1, 0), 'Turn-based: the chance it shrugs off an ailment or Slow (like a hero’s Endurance).'),
        field('Critical hit %', n(d.crit ?? 5, (v) => { const x = Math.round(v); if (x === 5) delete d.crit; else d.crit = Math.min(100, x); }, 1, 0))),
      field('Its attacks are', select([['physical', 'Physical: the hero’s Defence and armour count'], ['magic', d.behaviour === 'ranged' ? 'Magic: it casts firebolts; the hero’s Magic Defence counts' : 'Magic: the hero’s Magic Defence counts']], d.attackType ?? 'physical',
        (v) => { d.attackType = v === 'magic' ? 'magic' : undefined; })),
      field('Light', select([['', 'Makes no difference (only easier to see)'], ['avoid', 'Avoids light: won’t come near a hero by a fire or using a light ring'], ['drawn', 'Drawn to light: spots a lit-up hero much sooner (bandits)']],
        d.light ?? '', (v) => { if (v) d.light = v as 'avoid' | 'drawn'; else delete d.light; }),
        'Every enemy stays out of a lit campfire’s safe ground (Database → Combat), so resting there is safe.'),
      h('div', { class: 'field-row' },
        field(d.behaviour === 'ranged' ? 'Shoots from (tiles)' : d.behaviour === 'charger' ? 'Charges from (tiles)' : 'Reach (tiles)', n(d.attackRange, (v) => (d.attackRange = v), 0.1, 0.3)),
        field('Wind-up (s)', n(d.windup, (v) => (d.windup = v), 0.05, 0.1), 'The tell before each attack: it glows. Longer is easier to dodge.'),
        field('Between attacks (s)', n(d.cooldown, (v) => (d.cooldown = v), 0.1, 0.2))),
    ),
    impactSection(d, rerender),
    defenceSection(d, rerender),
    h('section', { class: 'db-section' }, h('h3', {}, 'Ailments'),
      inflictsField(() => d.inflicts, (v) => { if (v) d.inflicts = v; else delete d.inflicts; }, rerender),
      field('Can’t get', ailmentChips(() => d.resists, (v) => { if (v) d.resists = v as Ailment[]; else delete d.resists; }, rerender, 'Can’t get'))),
    h('div', { class: 'field-row' }, field('Its attacks hit with', elementSelect(d.attackElement, (e) => { if (e) d.attackElement = e; else delete d.attackElement; }, 'Attack element', { auto: d.elements?.[0] ? `Its element (${ELEMENT_NAMES[d.elements[0]]})` : 'Its element (non-elemental)' }))),
    battleActions(d, rerender),
    h('section', { class: 'db-section' }, h('h3', {}, 'Senses'),
      h('div', { class: 'field-row' },
        field('Sight (tiles)', n(d.sight, (v) => (d.sight = v), 0.5, 1), 'In full light. Darkness and sneaking shorten it a lot.'),
        field('Field of view (°)', n(d.fov, (v) => (d.fov = Math.min(360, Math.round(v))), 5, 10)),
        field('Hearing', n(d.hearing, (v) => (d.hearing = v), 0.5, 0), '5 = normal. Running is loud, sneaking quiet.'))),
    h('section', { class: 'db-section' }, h('h3', {}, 'Bestiary'),
      field('Description', (() => { const ta = h('textarea', { rows: 3, placeholder: 'What the Journal says about it.' }) as HTMLTextAreaElement; ta.value = d.description ?? ''; ta.addEventListener('input', () => { d.description = ta.value.trim() ? ta.value : undefined; }); return ta; })())),
    h('section', { class: 'db-section' }, h('h3', {}, 'Rewards'),
      h('div', { class: 'field-row' },
        field('EXP', n(d.xp, (v) => (d.xp = Math.round(v)))),
        field('Gold from', n(d.gold?.[0] ?? 0, (v) => (d.gold = [Math.round(v), Math.max(Math.round(v), d.gold?.[1] ?? 0)]))),
        field('Gold to', n(d.gold?.[1] ?? 0, (v) => (d.gold = [Math.min(d.gold?.[0] ?? 0, Math.round(v)), Math.round(v)])))),
      h('h4', { class: 'drops-title' }, 'Loot'),
      // Update 138: a section per kind of item, each listing only that kind.
      items.length ? itemSections(store.db.items ?? [], drops, {
        noun: 'Drop', rerender, make: (id): (typeof drops)[number] => ({ item: id, chance: 0.25 }),
        extras: (dr) => [
          field('Chance %', n(Math.round(dr.chance * 100), (v) => (dr.chance = Math.min(100, v) / 100), 5, 0)),
          field('How many', n(dr.count ?? 1, (v) => (dr.count = Math.max(1, Math.round(v)) === 1 ? undefined : Math.max(1, Math.round(v))), 1, 1))],
      }) : h('p', { class: 'note' }, 'No items yet: add some in Database → Items.'),
      h('p', { class: 'note' }, 'Loot goes straight into the bag (shown bottom left). Beaten enemies come back when the player returns to the map.')),
    h('div', { class: 'item-foot' }, h('button', { type: 'button', class: 'btn danger', onclick: remove }, 'Delete enemy')),
  ];
}

const ACTION_KINDS: [EnemyAction['kind'], string][] = [
  ['attack', 'Attack: a hit (its damage × power)'],
  ['spell', 'Spell: a magic hit (its damage × power; Magic Defence counts)'],
  ['heal', 'Heal: itself or a hurt friend (power: % of their health)'],
  ['guard', 'Guard: half damage, some health back, no ailments until its next turn'],
  ['buff', 'Buff: raises its stats (or casts a debuff like Slow on the party)'],
];

/** Database → Enemies → Turn-based battles: its plain attack's weight, Counterspell, and its other actions. */
function battleActions(d: EnemyDef, rerender: () => void): HTMLElement {
  const n = (v: number, set: (x: number) => void, step = 1, min = 0, label = '') => numberInput(v, (x) => set(Math.max(min, x)), { step, min, 'aria-label': label, class: 'db-num' });
  const list = d.actions ?? [];
  const save = () => { if (list.length) d.actions = list; else delete d.actions; };
  const rows = list.map((a, k) => {
    const powerLabel = a.kind === 'heal' ? 'Heals % of health' : a.kind === 'guard' || a.kind === 'buff' ? '' : 'Power × its damage';
    return h('div', { class: 'db-section enemy-action' },
      h('div', { class: 'field-row' },
        field('Name', textInput(a.name, (v) => { a.name = v.trim(); }, { 'aria-label': `Action ${k + 1} name`, placeholder: 'Shown when it’s used' })),
        field('Does', select(ACTION_KINDS, a.kind, (v) => { a.kind = v as EnemyAction['kind']; rerender(); }, { 'aria-label': `Action ${k + 1} kind` })),
        h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove action ${k + 1}`, onclick: () => { list.splice(k, 1); save(); rerender(); } }, '✕')),
      h('div', { class: 'field-row' },
        powerLabel ? field(powerLabel, n(a.power ?? (a.kind === 'heal' ? 30 : 1), (v) => (a.power = v), a.kind === 'heal' ? 5 : 0.1, 0, `Action ${k + 1} power`)) : h('span'),
        field('How often', n(a.weight ?? 1, (v) => { const w = Math.round(v); if (w === 1) delete a.weight; else a.weight = w; }, 1, 0, `Action ${k + 1} weight`), 'Against its plain attack and its other actions.'),
        field('Only below health %', n(a.hpBelow ?? 0, (v) => { if (v > 0) a.hpBelow = Math.min(100, Math.round(v)); else delete a.hpBelow; }, 5, 0, `Action ${k + 1} health condition`), '0: any time.')),
      a.kind === 'attack' || a.kind === 'spell' ? h('div', { class: 'field-row' },
        field('Hits', select([['one', 'One of the party'], ['all', 'The whole party']], a.targets ?? 'one', (v) => { if (v === 'all') a.targets = 'all'; else delete a.targets; }, { 'aria-label': `Action ${k + 1} targets` })),
        field('Element', elementSelect(a.element, (e) => { if (e) a.element = e; else delete a.element; }, `Action ${k + 1} element`, { auto: 'Its attack’s element' })),
        checkbox('Counterspell (breaks a spell being charged)', !!a.counterspell, (v) => { if (v) a.counterspell = true; else delete a.counterspell; })) : h('span'),
      a.kind === 'attack' || a.kind === 'spell' ? inflictsField(() => a.inflicts, (v) => { if (v) a.inflicts = v; else delete a.inflicts; }, rerender, 'Ailments it can give (empty: its usual ones, for attacks)') : h('span'),
      a.kind === 'buff' ? h('div', { class: 'field-row' },
        field('On', select([['self', 'Itself'], ['allies', 'Every enemy in the battle (its side)'], ['foes', 'The party (debuffs: Slow)']], a.buffTarget ?? 'self', (v) => { if (v === 'self') delete a.buffTarget; else a.buffTarget = v as 'allies' | 'foes'; rerender(); }, { 'aria-label': `Action ${k + 1} buff target` })),
        a.buffTarget === 'foes' ? field('Who', select([['one', 'One of the party'], ['all', 'The whole party']], a.targets ?? 'one', (v) => { if (v === 'all') a.targets = 'all'; else delete a.targets; }, { 'aria-label': `Action ${k + 1} buff targets` })) : h('span')) : h('span'),
      a.kind === 'buff' ? buffsField(() => a.buffs, (v) => { if (v) a.buffs = v; else delete a.buffs; }, rerender, { label: 'Buffs it gives', seconds: false }) : h('span'),
      a.kind === 'buff' ? weatherField(() => a, (wk, t) => { if (wk) a.weather = wk; else delete a.weather; if (t !== undefined) a.weatherTurns = t; else delete a.weatherTurns; }, rerender, 'Battle weather it brings (instead of, or with, buffs)') : h('span'));
  });
  return h('section', { class: 'db-section' }, h('h3', {}, 'Turn-based battles'),
    h('div', { class: 'field-row' },
      field('Plain attack: how often', n(d.attackWeight ?? 1, (v) => { const w = Math.round(v); if (w === 1) delete d.attackWeight; else d.attackWeight = w; }, 1, 0, 'Attack weight'), '0: it never just attacks (only its actions below).'),
      checkbox('Its plain attack is a Counterspell (breaks a spell being charged)', !!d.counterspell, (v) => { if (v) d.counterspell = true; else delete d.counterspell; })),
    ...rows,
    h('button', { type: 'button', class: 'btn', onclick: () => { list.push({ name: '', kind: 'attack' }); save(); rerender(); } }, '+ Add action'),
    h('p', { class: 'note' }, 'On its turn it picks its plain attack or one of these by how often each is set. Enemies only guard if given a Guard action. Counterspell takes effect once spells can be charged (learned spells, coming next).'));
}

/** Database → Enemies → Impact: what it's made of (the sound of a hit) and up to two effects that fly off it. */
function impactSection(d: EnemyDef, rerender: () => void): HTMLElement {
  const mat = materialOf(d), info = MATERIAL_INFO[mat];
  const fx: { kind: ImpactFx; color?: string }[] = d.impactFx ?? info.fx.map((kind) => ({ kind }));
  const own = (): { kind: ImpactFx; color?: string }[] => (d.impactFx ??= info.fx.map((kind) => ({ kind })));
  const rows = [0, 1].map((k) => {
    const f = fx[k];
    return h('div', { class: 'field-row' },
      field(`Effect ${k + 1}`, select([['', '(none)'], ...IMPACT_FX.map((x) => [x, FX_INFO[x].name] as [string, string])], f?.kind ?? '', (v) => {
        const list = own();
        if (!v) list.splice(k, 1); else if (list[k]) list[k] = { kind: v as ImpactFx }; else list.push({ kind: v as ImpactFx });
        rerender();
      }, { 'aria-label': `Impact effect ${k + 1}` })),
      f && FX_INFO[f.kind].recolour ? field('Colour', h('input', { type: 'color', value: f.color ?? (k === 0 && !d.impactFx ? info.color : undefined) ?? FX_INFO[f.kind].color, 'aria-label': `Impact effect ${k + 1} colour`,
        onchange: (e: Event) => { const list = own(); if (list[k]) list[k].color = (e.target as HTMLInputElement).value; } })) : h('span'));
  });
  return h('section', { class: 'db-section' }, h('h3', {}, 'Impact'),
    field('Material', select(MATERIALS.map((m) => [m, MATERIAL_INFO[m].name] as [string, string]), mat, (v) => { d.material = v as Material; delete d.impactFx; rerender(); }, { 'aria-label': 'Material' }),
      'The sound a sword or an arrow makes hitting it in battle, and what flies off by default.'),
    ...rows,
    h('div', { class: 'stack row' },
      h('button', { type: 'button', class: 'btn small', onclick: () => playSound(info.sound) }, '▶ Hear it'),
      d.impactFx ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { delete d.impactFx; rerender(); } }, 'Use the material’s effects') : h('span')),
    h('p', { class: 'note' }, 'Blood can be recoloured for ooze, sap or ichor. Critical hits shake the screen with a big CRITICAL; weak or immune hits land with a soft thump and a big WEAK.'));
}

/** Database → Combat → Element stones: what Fragments, Shards and Heart Stones give, fusing and drops. */
function elementStones(c: ReturnType<typeof combatConfig>, data: CombatData): HTMLElement {
  const e = c.essence, put = <K extends keyof EssenceRules>(k: K, v: EssenceRules[K]) => { (data.essence ??= {})[k] = v; };
  const tier = (t: EssenceTier) => [
    field(`${TIER_NAMES[t]}: damage +%`, num(e[t].damage, (v) => put(t, { ...(data.essence?.[t] ?? e[t]), damage: Math.max(0, Math.round(v)) }), 1, 0, `${t} damage`)),
    field(`${TIER_NAMES[t]}: weaknesses ×`, num(e[t].weak, (v) => put(t, { ...(data.essence?.[t] ?? e[t]), weak: Math.max(1, v) }), 0.05, 1, `${t} weakness`)),
  ];
  return h('section', { class: 'db-section' }, h('h3', {}, 'Element stones'),
    h('div', { class: 'field-row' }, ...tier('fragment'), ...tier('shard'), ...tier('heart')),
    h('div', { class: 'field-row' },
      field('Two Shards: weaknesses ×', num(e.doubleWeak, (v) => put('doubleWeak', Math.max(1, v)), 0.05, 1, 'Double shard weakness')),
      field('Second stone adds % of its bonus', num(e.stack, (v) => put('stack', Math.max(0, Math.min(100, Math.round(v)))), 5, 0, 'Stack percent')),
      field('Both slots one element: +%', num(e.pair, (v) => put('pair', Math.max(0, Math.round(v))), 1, 0, 'Pair bonus')),
      field('Spell of your own element: +%', num(e.sameType, (v) => put('sameType', Math.max(0, Math.round(v))), 1, 0, 'Same type bonus'))),
    h('div', { class: 'field-row' },
      field('Fragments to a Shard', num(e.fuseFragments, (v) => put('fuseFragments', Math.max(2, Math.round(v))), 1, 2, 'Fuse fragments')),
      field('Shards to a Heart Stone', num(e.fuseShards, (v) => put('fuseShards', Math.max(2, Math.round(v))), 1, 2, 'Fuse shards'))),
    h('p', { class: 'note' }, 'Each hero has two Element slots (Equipment, or Bag → Shards): Primary and Secondary. A Fragment, Shard or Heart Stone there gives them its element, so its weaknesses too, and makes their hits of it stronger. The Primary slot’s element is what their basic attacks hit with; with none, they’re Normal. Enemies drop only the loot set on them (Database → Enemies → Loot: add Fragments there); the bag fuses Fragments into a Shard and Shards of one element into a Heart Stone. The stones are items (Database → Items, “ess_…”): rename them or change their icons and prices there.'));
}

/**
 * Enemies → Advanced form: at a level, another enemy (its own entry, with its own art, numbers and loot) comes out in
 * its place. "Make one" adds a copy right after this one with its numbers grown to that level.
 */
function advancedForm(store: EditorStore, list: EnemyDef[], d: EnemyDef, rerender: () => void, pick: (i: number) => void): HTMLElement {
  const others = list.filter((x) => x !== d).map((x) => [x.id, x.name] as [string, string]);
  const from = list.find((x) => x.advance?.into === d.id);
  const make = () => {
    const lv = d.advance?.level ?? Math.max(2, (d.level ?? 1) + 9);
    let id = `${d.id}_adv`, n = 2;
    while (list.some((x) => x.id === id)) id = `${d.id}_adv${n++}`;
    const grown = atLevel(d, lv, combatConfig(store.db.combat).enemyGrowth);
    const copy: EnemyDef = JSON.parse(JSON.stringify({ ...grown, id, name: `${d.name} (advanced)`, level: lv }));
    delete copy.advance;
    const at = list.indexOf(d) + 1;
    list.splice(at, 0, copy);
    d.advance = { into: id, level: lv };
    pick(at);
    rerender();
  };
  return h('section', { class: 'db-section' }, h('h3', {}, 'Advanced form'),
    h('div', { class: 'field-row' },
      field('Becomes', select([['', 'Nothing (no advanced form)'], ...others], d.advance?.into ?? '', (v) => { if (v) d.advance = { into: v, level: d.advance?.level ?? Math.max(2, (d.level ?? 1) + 9) }; else delete d.advance; rerender(); }),
        'When it comes out at this level or higher, this enemy appears instead.'),
      d.advance ? field('At level', numberInput(d.advance.level, (v) => { d.advance!.level = Math.max(2, Math.min(99, Math.round(v))); }, { step: 1, min: 2, max: 99 })) : h('span'),
      d.advance ? h('span') : h('button', { type: 'button', class: 'btn', onclick: make }, 'Make an advanced form')),
    h('p', { class: 'note' }, `${from ? `This is ${from.name}’s advanced form (from level ${from.advance!.level}). ` : ''}A spawn's level range, or dynamic levels catching up with the party, can roll a level high enough: then its advanced form comes out in its place (in old areas too). “Make an advanced form” adds a copy right after this one, its numbers grown to that level (change its art, name and loot there). The Bestiary shows them linked.`));
}
