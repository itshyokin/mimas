import { partyLayoutSection } from './PartyLayoutEditor';
import { FIELD_USE_NAMES, POWER_NAMES } from '../world/items';
import { FIELD_POWERS, FIELD_USES } from '../world/types';
import { organizeForm } from './formLayout';
import { compactForm } from './dom';

/** Database tabs drawn compact (compactForm). */
const COMPACT_TABS = new Set<string>(['player', 'heroes', 'combat', 'enemies', 'spells', 'climate', 'camera']);
import { horsesTab } from './HorsesEditor';
import { DEFAULT_HORSES, horseList } from '../game/horses';
import type { HorseDef } from '../world/types';
import { UI_THEMES } from '../ui/themes';
import type { HeroDef } from '../world/types';
import { toast } from './dom';
/**
 * Database window: game-wide settings — the player (abilities, health / magic / stamina,
 * regeneration, speeds, stamina costs, EXP progression), items and the starting inventory, time, saving and menus.
 * Saved in database.json; only values that differ from the defaults are written.
 */
import { SEASONS, SEASON_NAMES, type Season, type SeasonSettings } from '../world/seasons';
import { DEFAULT_PLAYER, type PlayerConfig, playerConfig } from '../game/stats';
import { ABILITIES, type Gauge, type MenuConfig, type PlayerConfigData } from '../world/types';
import { PAUSE_OPTIONS, TITLE_OPTIONS } from '../game/menus';
import { CLASSIC_OVERWORLD_CAMERA, TOPDOWN_OVERWORLD_CAMERA, DEFAULT_OVERWORLD_CAMERA } from '../game/cameraDefaults';
import type { OverworldCamera } from '../world/types';
import { ABILITY_NAMES, GAUGE_NAMES } from './CommandEditor';
import { battleLayoutSection } from './BattleLayoutEditor';
import { tutorialsTab } from './TutorialsEditor';
import type { GlobalEvent, GroupChatter, JournalTabId, RelationSettings, RoleplayField, TutorialDef } from '../world/types';
import { JOURNAL_TAB_NAMES } from './CommandEditor';
import { roleplayTab } from './RoleplayEditor';
import { relationsTab } from './RelationsEditor';
import { globalEventsTab, cleanGlobals } from './GlobalEventsEditor';
import { gendersTab, cleanGenders } from './GendersEditor';
import { setGenderLooks } from '../game/roleplay';
import { checkbox, confirmModal, field, h, numberInput, openModal, select, textInput } from './dom';
import type { EditorStore } from './store';
import { ITEM_CATS, type ItemCat, cleanInventory, inventoryTab, itemCategory, itemsTab, type ItemsWork } from './ItemsEditor';
import type { CombatData, EnemyDef, ItemDef } from '../world/types';
import { cleanCombat, combatTab, enemiesTab } from './CombatEditor';
import { type AudioWork, audioFiles, audioTab, cleanAudio } from './audioEditor';
import { cleanSkills, skillsTab } from './SkillsEditor';
import { additionsTab, classesTab, spellsTab } from './AbilitiesEditor';
import { DEFAULT_ADDITIONS, DEFAULT_SPELLS, additionList, spellList } from '../game/abilities';
import type { AdditionDef, ClassDef, SpellEntry, TroopDef } from '../world/types';
import { troopsTab } from './TroopsEditor';
import { achievementsTab } from './AchievementsEditor';
import { markersTab } from './MarkersEditor';
import { mapThemesTab } from './MapThemesEditor';
import { DEFAULT_THEMES, mapThemes, type MapTheme } from '../world/mapThemes';
import { cliffChoices } from './assets';
import { textColorsTab } from './TextColorsEditor';
import { messageStyles, textColors, type MessageStyle, type TextColor } from '../ui/richText';
import { messageStylesTab } from './MessageStylesEditor';
import { cleanClimate, climateTab , bodySection, cleanBody } from './ClimateEditor';
import { type BodySettings, bodySettings } from '../game/body';
import { climateConfig, type ClimateConfig } from '../world/climate';
import { saveDatabase } from './io';
import { beforeCombatPreview } from './combatPreview';
import { markerKinds, type MarkerKind } from '../world/landmarks';
import type { AchievementDef } from '../game/achievements';
import { expSection, trimExpTable } from './ExpEditor';
import { type CharactersWork, charactersTab } from './CharactersEditor';
import { chatterTab } from './ChatterEditor';
import { cleanCredits, creditsTab } from './CreditsEditor';
import { cleanQuests, questsTab } from './QuestsEditor';
import { cleanHeroes, heroesTab, heroesWork } from './HeroesEditor';
import type { QuestDef } from '../world/types';
import type { CreditEntry } from '../world/types';
import { skillsData } from '../game/skills';
import { DEFAULT_ARMOR_TYPES, DEFAULT_WEAPON_TYPES, armorTypes, gearKinds, weaponTypes } from '../game/classes';
import { ATTRS, ATTR_INFO, type Attr, DEFAULT_ATTR_ORDER, setAttrOrder } from '../game/attributes';
import type { SkillsData } from '../world/types';

const GAUGES: Gauge[] = ['hp', 'mp', 'sp'];
const SPEEDS: [keyof PlayerConfig['speed'], string][] = [
  ['walk', 'Walk'], ['run', 'Run'], ['wade', 'Wade (shallow water)'], ['swim', 'Swim'], ['crawl', 'Crawl'], ['climb', 'Climb'],
];
const COSTS: [keyof PlayerConfig['cost'], string, string][] = [
  ['run', 'Run', 'per second'], ['jump', 'Jump', 'per jump'], ['climb', 'Climb', 'per second'], ['swim', 'Swim', 'per second'],
];

export type DbTab = 'player' | 'heroes' | 'characters' | 'items' | 'materials' | 'weapons' | 'gear' | 'shards' | 'keyItems' | 'inventory' | 'quests' | 'combat' | 'enemies' | 'troops' | 'skills' | 'spells' | 'additions' | 'classes' | 'audio' | 'time' | 'saving' | 'menus' | 'credits' | 'achievements' | 'markers' | 'textColors' | 'messageStyles' | 'climate' | 'mapThemes' | 'horses' | 'camera' | 'stats' | 'tutorials' | 'relations' | 'roleplay' | 'globals' | 'genders';

/** The tabs, in groups, each with an icon (its name shows as a tooltip and beside the icons). */
const DB_GROUPS: [string, [DbTab, string, string][]][] = [
  ['Party', [['player', 'Player', 'person'], ['heroes', 'Heroes', 'shield'], ['classes', 'Classes', 'badge'], ['characters', 'Characters', 'sprite'], ['relations', 'Relationships', 'heart'], ['roleplay', 'Roleplay', 'scroll'], ['genders', 'Genders', 'gender']]],
  ['Battle', [['combat', 'Combat', 'swords'], ['enemies', 'Enemies', 'skull'], ['troops', 'Troops', 'group']]],
  ['Abilities', [['skills', 'Skill trees', 'tree'], ['spells', 'Spells', 'spark'], ['additions', 'Additions', 'combo']]],
  ['Items', [['items', 'Items', 'potion'], ['materials', 'Materials', 'ore'], ['weapons', 'Weapons', 'sword'], ['gear', 'Gear: armor, shields, accessories', 'armor'], ['shards', 'Shards: spells and element stones', 'gem'], ['keyItems', 'Key items', 'key'], ['inventory', 'Starting inventory', 'bag']]],
  ['Story', [['quests', 'Quests', 'scroll'], ['achievements', 'Achievements', 'trophy'], ['tutorials', 'Tutorials', 'bubble'], ['globals', 'Global events', 'globe']]],
  ['World', [['camera', 'View & camera', 'eye'], ['time', 'Time & seasons', 'clock'], ['climate', 'Weather & temperature', 'cloud'], ['mapThemes', 'Map themes', 'mountain'], ['markers', 'Map markers', 'pin'], ['horses', 'Travel: horses and griffins', 'horse']]],
  ['Game', [['stats', 'Stat order', 'bars'], ['menus', 'Title & menus', 'menu'], ['messageStyles', 'Text boxes', 'bubble'], ['textColors', 'Text colours', 'palette'], ['audio', 'Audio', 'note'], ['saving', 'Saving', 'disk'], ['credits', 'Credits', 'heart']]],
];
const ICON_PATHS: Record<string, string> = {
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  horse: '<path d="M5 20v-6l2-4h7l3-5 2 1-1 3 2 2-1 2-2-1-1 2v6M7 20v-4M14 20v-4"/><path d="M15 5l1-2"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  sprite: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="9" r="2.5"/><path d="M8 17c1-2.5 7-2.5 8 0"/>',
  badge: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7 21l5-2.5 5 2.5-2-7.5"/>',
  potion: '<path d="M10 3h4M10.5 3v5L6 15.5A4 4 0 0 0 9.5 21h5a4 4 0 0 0 3.5-5.5L13.5 8V3"/><path d="M7.5 14h9"/>',
  bag: '<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  sword: '<path d="M19 3l-9.5 9.5M19 3v4l-8 8M19 3h-4l-8 8"/><path d="M6 13l5 5M8.5 15.5L4 20"/>',
  armor: '<path d="M8 3l4 2 4-2 4 3-2 4v10H6V10L4 6z"/><path d="M12 5v15"/>',
  gem: '<path d="M6 4h12l3 5-9 12L3 9z"/><path d="M3 9h18M9 4l3 17M15 4l-3 17"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="M11 11l9 9M17 17l2-2M15 15l2-2"/>',
  swords: '<path d="M4 4l10 10M14 14l2 2M17 13l-4 4M20 4L10 14M10 14l-2 2M7 13l4 4"/>',
  skull: '<path d="M5 11a7 7 0 0 1 14 0c0 2.5-1.2 3.8-2 4.5V19H7v-3.5C6.2 14.8 5 13.5 5 11z"/><circle cx="9.5" cy="11" r="1.5"/><circle cx="14.5" cy="11" r="1.5"/>',
  group: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 19c0-3 2.7-5 6-5s6 2 6 5M12 15c1-.7 2.4-1 4-1 3.3 0 6 2 6 5"/>',
  tree: '<circle cx="12" cy="4.5" r="2"/><circle cx="6" cy="13" r="2"/><circle cx="18" cy="13" r="2"/><circle cx="12" cy="20" r="2"/><path d="M11 6.5L7 11M13 6.5l4 4.5M7 15l4 3.5M17 15l-4 3.5"/>',
  spark: '<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z"/>',
  combo: '<path d="M4 17l5-5-5-5M11 17l5-5-5-5M18 7v10"/>',
  scroll: '<path d="M7 3h11v15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-1h11"/><path d="M7 3a2 2 0 0 0-2 2v12M10 8h5M10 12h5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  pin: '<path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.3-1-1.7-1-2.7 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  disk: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  bars: '<path d="M5 6h14M5 12h10M5 18h6"/><path d="M19 15v6M16.5 18.5L19 21l2.5-2.5"/>',
  menu: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  bubble: '<path d="M4 5h16v11H10l-4 4v-4H4z"/><path d="M8 9h8M8 12h5"/>',
  mountain: '<path d="M2 20l7-12 4 6 3-4 6 10z"/><path d="M7.5 10.5l1.5 1.5 1.5-1.5"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.4A3.4 3.4 0 0 1 17 18z"/><path d="M12 2v2M5 5l1.4 1.4M19 5l-1.4 1.4"/>',
  gender: '<circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/>',
  ore: '<path d="M4 17l4-9 5 2 4-4 3 6-2 7H6z"/><path d="M8 8l2 6 3-4M17 6l-1 7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  heart: '<path d="M12 20s-8-4.7-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.3-8 11-8 11z"/>',
};
const dbIcon = (k: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[k] ?? ''}</svg>`;

export function openDatabase(store: EditorStore, startTab: DbTab = 'player'): void {
  const cfg: PlayerConfig = playerConfig(store.db.stats);
  let tab: DbTab = startTab;
  const work: ItemsWork = { items: JSON.parse(JSON.stringify(store.db.items ?? [])) as ItemDef[], inventory: JSON.parse(JSON.stringify(store.db.inventory ?? {})), armorTypes: structuredClone(armorTypes(store.db)), weaponTypes: structuredClone(weaponTypes(store.db)) };
  // The stats' order (every list follows it straight away; Close without applying puts the old one back).
  const statOrder: Attr[] = [...ATTRS];
  const itemState = { sel: 0 }, enemyState = { sel: 0 };
  // One selection per item tab (all five list the same items, by kind).
  const catState: Record<ItemCat, { sel: number; cur?: ItemDef }> = { items: itemState, materials: { sel: 0 }, weapons: { sel: 0 }, gear: { sel: 0 }, shards: { sel: 0 }, keyItems: { sel: 0 } };
  const isCat = (t: DbTab): t is ItemCat => ITEM_CATS.some(([c]) => c === t);
  const combat: CombatData = JSON.parse(JSON.stringify(store.db.combat ?? {}));
  const enemies: EnemyDef[] = JSON.parse(JSON.stringify(store.db.enemies ?? []));
  const audio: AudioWork = { files: [...(store.db.audio?.files ?? [])], sfx: { ...(store.db.audio?.sfx ?? {}) }, titleMusic: store.db.audio?.titleMusic, victoryMusic: store.db.audio?.victoryMusic, battleMusic: store.db.audio?.battleMusic, style: store.db.audio?.style };
  const skills: SkillsData = JSON.parse(JSON.stringify(skillsData(store.db.skills)));
  const skillState = { tree: 0, sel: '' };
  const time = { rate: store.db.time?.rate ?? 20, darkness: store.db.time?.darkness ?? 0.85, skySpeed: store.db.time?.skySpeed ?? 1, seasons: { ...store.db.time?.seasons } as SeasonSettings };
  let gameTitle = store.db.title;
  const menus: MenuConfig = JSON.parse(JSON.stringify(store.db.menus ?? {})) as MenuConfig;
  const cam: OverworldCamera = JSON.parse(JSON.stringify(store.db.overworldCamera ?? {})) as OverworldCamera;
  let onTop = !!store.db.charactersOnTop;
  let view2d = store.db.viewMode === '2d', playerLayer = store.db.playerLayer ?? 10, gridMove = !store.db.freeMove2D, cam3d: 'orbit' | 'follow' = store.db.camera3d ?? 'orbit';
  const saving = { anywhere: store.db.saving?.anywhere !== false, autosave: store.db.saving?.autosave !== false };
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, store.db.abilities?.[a] ?? true])) as Record<string, boolean>;
  const body = h('div', { class: 'db-editor' });
  const people: CharactersWork = { chars: JSON.parse(JSON.stringify(store.db.characters)), player: store.db.player, look: store.db.modelLook, outline: store.db.modelOutline };
  const credits: CreditEntry[] = JSON.parse(JSON.stringify(store.db.credits ?? []));
  const quests: QuestDef[] = JSON.parse(JSON.stringify(store.db.quests ?? []));
  const questState = { sel: 0 };
  const heroes = heroesWork(store.db.heroes, store.db.player), heroState = { sel: 0 };
  let charView: 'looks' | 'chatter' = 'looks';
  const tutorials: TutorialDef[] = JSON.parse(JSON.stringify(store.db.tutorials ?? []));
  const groupChatter: GroupChatter[] = JSON.parse(JSON.stringify(store.db.groupChatter ?? []));
  const relations: RelationSettings = JSON.parse(JSON.stringify(store.db.relations ?? {}));
  const roleplay: RoleplayField[] = JSON.parse(JSON.stringify(store.db.roleplay ?? []));
  const genders: NonNullable<typeof store.db.genders> = JSON.parse(JSON.stringify(store.db.genders ?? {}));
  setGenderLooks(store.db.genders);
  const globals: GlobalEvent[] = JSON.parse(JSON.stringify(store.db.globalEvents ?? [])), globalState = { sel: 0 };
  heroes.rp = roleplay;
  let activeParty: 3 | 4 = store.db.activeParty === 4 ? 4 : 3;
  let aButton = store.db.aButton ?? 'jump';
  const chatState = { sel: 0 };
  const spells: SpellEntry[] = JSON.parse(JSON.stringify(spellList(store.db)));
  const additions: AdditionDef[] = JSON.parse(JSON.stringify(additionList(store.db)));
  const classes: ClassDef[] = JSON.parse(JSON.stringify(store.db.classes ?? []));
  const spellState = { sel: 0 }, additionState = { sel: 0 }, classState = { sel: 0 };
  const troops: TroopDef[] = JSON.parse(JSON.stringify(store.db.troops ?? []));
  const troopState = { sel: 0 };
  const horses: HorseDef[] = structuredClone(horseList(store.db)), horseState = { sel: 0 };
  const travel: NonNullable<typeof store.db.travel> = structuredClone(store.db.travel ?? {});
  const achievements: AchievementDef[] = JSON.parse(JSON.stringify(store.db.achievements ?? []));
  const achState = { sel: 0 };
  const markers: MarkerKind[] = structuredClone(markerKinds(store.db.markers));
  const themes: MapTheme[] = structuredClone(mapThemes(store.db.mapThemes)), themeState = { sel: 0 };
  const textCols: TextColor[] = structuredClone(textColors(store.db.textColors));
  const climate: ClimateConfig = structuredClone(climateConfig(store.db.climate));
  const bodyWork: BodySettings = structuredClone(bodySettings(store.db.body));
  const msgStyles: MessageStyle[] = structuredClone(messageStyles(store.db.messageStyles)), msgState = { sel: 0 };
  let devConsole = store.db.devConsole ?? 'playtest';

  const num = (value: number, set: (v: number) => void, min = 0, step = 1, label = '') =>
    numberInput(value, (v) => set(Math.max(min, v)), { min: String(min), step: String(step), 'aria-label': label, class: 'db-num' });

  const tabs = h('div', { class: 'db-tabs db-icon-tabs', role: 'tablist' });
  const tabName = h('div', { class: 'db-tab-name' });
  const content = h('div', { class: 'db-editor' });
  body.className = 'db-wrap';
  body.append(h('div', { class: 'db-tabbar' }, tabs, tabName), content);
  let shownTab: DbTab | null = null;
  const render = () => {
    tabs.replaceChildren(...DB_GROUPS.map(([group, list]) => h('div', { class: 'db-tab-group', role: 'group', 'aria-label': group },
      h('span', { class: 'db-group-label' }, group),
      h('div', { class: 'db-group-icons' }, ...list.map(([id, label, icon]) => {
        const b = h('button', { type: 'button', role: 'tab', class: 'db-tab', title: label, 'aria-label': label, 'aria-selected': String(tab === id), onclick: () => { (document.activeElement as HTMLElement | null)?.blur?.(); tab = id; render(); } });
        b.innerHTML = dbIcon(icon);
        return b;
      })))));
    const cur = DB_GROUPS.flatMap(([, l]) => l).find(([id]) => id === tab);
    tabName.textContent = cur ? cur[1] : '';
    // Re-drawing the same tab keeps its scroll; another tab starts at the top.
    const top = shownTab === tab ? content.scrollTop : 0;
    shownTab = tab;
    renderTab();
    // Switches together at the top, then the sections with a jump bar (every tab the same).
    organizeForm(content);
    // The busiest pages: a narrow column, field grids, hints behind ⓘ.
    if (COMPACT_TABS.has(tab)) { const f = content.querySelector<HTMLElement>('.items-layout .item-form'); if (f) compactForm(f); else compactForm(content).classList.add('db-page'); }
    else content.classList.remove('db-compact', 'db-page');
    content.scrollTop = top;
    addTopDelete();
  };
  /**
   * Every list (items, enemies, heroes, quests…): a red Delete under its “+ New”, for the selected entry, asking
   * first. It runs the tab's own delete (which also warns when the entry is used elsewhere).
   */
  const addTopDelete = () => {
    const add = content.querySelector<HTMLElement>('.item-list > .item-add');
    const own = content.querySelector<HTMLButtonElement>('.item-foot .btn.danger');
    if (!add || !own) return;
    own.closest('.item-foot')?.classList.add('moved');
    const sel = content.querySelector<HTMLElement>('.item-list .item-row[aria-selected="true"]');
    const name = (sel?.querySelector('span:not(.item-sub):not(.quest-mark):not(.hero-tag)')?.childNodes[0]?.textContent ?? sel?.textContent ?? 'this').trim() || 'this';
    const del = h('button', { type: 'button', class: 'btn item-del', disabled: own.disabled, title: own.title || `Delete ${name}`, onclick: () => {
      confirmModal('Delete', `Are you sure you wish to delete ${name}?`, 'Delete', () => own.click(), true);
    } }, `Delete ${name}`);
    const tools = h('div', { class: 'item-tools' }, del);
    if (listOf(tab)) del.textContent = 'Delete';
    if (listOf(tab)) tools.prepend(h('button', { type: 'button', class: 'btn item-dup', title: `Duplicate ${name} (Ctrl+D; right-click a row for Copy / Paste)`, onclick: () => duplicate() }, 'Duplicate'));
    add.after(tools);
  };

  /* Duplicate, copy and paste in the lists: the copy gets a fresh id and “(copy)” on its name, under the original. */
  type Entry = { id: string; name: string } & Record<string, unknown>;
  type ListInfo = { list: Entry[]; state: { sel: number }; kind: string; tidy?: (e: Entry, from: number) => void; insert?: (e: Entry, at: number) => void };
  const listOf = (t: DbTab): ListInfo | null => {
    const L = (list: unknown[], state: { sel: number }, tidy?: (e: Entry, from: number) => void): ListInfo => ({ list: list as Entry[], state, kind: t, tidy });
    if (isCat(t)) {
      // The tab shows some of the items: a copy goes into the full list just after the one it sits under.
      const shown = work.items.filter((d) => itemCategory(d) === t);
      return { list: shown as unknown as Entry[], state: catState[t], kind: 'items', insert: (e, at) => {
        const before = shown[at - 1], i = before ? work.items.indexOf(before) + 1 : work.items.length;
        work.items.splice(i, 0, e as unknown as ItemDef);
      } };
    }
    switch (t) {
      case 'enemies': return L(enemies, enemyState);
      case 'heroes': return L(heroes.heroes, heroState, (e) => { delete e.creation; delete e.startsInParty; });
      case 'quests': return L(quests, questState);
      case 'troops': return L(troops, troopState);
      case 'spells': return L(spells, spellState);
      case 'additions': return L(additions, additionState);
      case 'classes': return L(classes, classState);
      case 'horses': return L(horses, horseState);
      case 'achievements': return L(achievements, achState);
      case 'messageStyles': return L(msgStyles, msgState);
      case 'mapThemes': return L(themes, themeState);
      default: return null;
    }
  };
  const freshId = (list: Entry[], base: string): string => {
    const stem = base.replace(/_copy\d*$/, '') + '_copy';
    let id = stem, n = 2;
    while (list.some((x) => x.id === id)) id = `${stem}${n++}`;
    return id;
  };
  const insertCopy = (src: Entry, at: number) => {
    const L = listOf(tab);
    if (!L) return;
    const e = structuredClone(src);
    e.id = freshId(L.list, String(src.id || 'entry'));
    const stem = String(src.name || 'Entry').replace(/ \(copy(?: \d+)?\)$/, '');
    let nm = `${stem} (copy)`, n = 2;
    while (L.list.some((x) => x.name === nm)) nm = `${stem} (copy ${n++})`;
    e.name = nm;
    L.tidy?.(e, at);
    if (L.insert) L.insert(e, at); else L.list.splice(at, 0, e);
    L.state.sel = at;
    render();
    flash(`Added ${e.name}. Remember to Apply.`);
  };
  const duplicate = () => {
    const L = listOf(tab), src = L?.list[L.state.sel];
    if (L && src) insertCopy(src, L.state.sel + 1);
  };
  let clip: { kind: string; entry: Entry } | null = null;
  const copy = () => {
    const L = listOf(tab), src = L?.list[L.state.sel];
    if (!L || !src) return;
    clip = { kind: L.kind, entry: structuredClone(src) };
    void navigator.clipboard?.writeText(JSON.stringify({ hd2d: L.kind, entry: src }, null, 2)).catch(() => {});
    flash(`Copied ${src.name}.`);
  };
  const paste = async () => {
    const L = listOf(tab);
    if (!L) return;
    let got = clip && clip.kind === L.kind ? clip.entry : null;
    // Also from the system clipboard (copied in another window or project).
    if (!got) try {
      const j = JSON.parse(await navigator.clipboard.readText()) as { hd2d?: string; entry?: Entry };
      if (j.hd2d === L.kind && j.entry) got = j.entry;
    } catch { /* nothing usable */ }
    if (!got) { flash(clip ? `What’s copied is from ${clip.kind}, not this list.` : 'Nothing copied yet.', 'warn'); return; }
    insertCopy(got, Math.min(L.list.length, L.state.sel + 1));
  };
  const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const onKey = (e: KeyboardEvent) => {
    if (!body.isConnected) { removeEventListener('keydown', onKey, true); return; }
    // Only when the Database is the window on top (not a confirm box over it).
    const modals = document.querySelectorAll('.modal');
    if (modals.length && !modals[modals.length - 1].contains(body)) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || typing(e.target) || !listOf(tab)) return;
    if (window.getSelection()?.toString()) return;
    const k = e.key.toLowerCase();
    if (k === 'c') { e.preventDefault(); copy(); }
    else if (k === 'v') { e.preventDefault(); void paste(); }
    else if (k === 'd') { e.preventDefault(); duplicate(); }
  };
  addEventListener('keydown', onKey, true);
  let menuEl: HTMLElement | null = null;
  const closeMenu = () => { menuEl?.remove(); menuEl = null; };
  body.addEventListener('contextmenu', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('.item-list .item-row');
    const L = listOf(tab);
    if (!row || !L) return;
    e.preventDefault();
    const rows = [...content.querySelectorAll<HTMLElement>('.item-list .item-row')];
    const i = rows.indexOf(row);
    if (i >= 0 && i !== L.state.sel) { L.state.sel = i; render(); }
    closeMenu();
    const item = (label: string, keys: string, run: () => void, disabled = false) => h('button', { type: 'button', role: 'menuitem', disabled, onclick: () => { closeMenu(); run(); } }, h('span', {}, label), h('kbd', {}, keys));
    menuEl = h('div', { class: 'ctx-menu', role: 'menu' },
      item('Duplicate', 'Ctrl+D', duplicate), item('Copy', 'Ctrl+C', copy), item('Paste', 'Ctrl+V', () => void paste()));
    document.body.append(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = `${Math.min(e.clientX, innerWidth - r.width - 6)}px`;
    menuEl.style.top = `${Math.min(e.clientY, innerHeight - r.height - 6)}px`;
    (menuEl.querySelector('button') as HTMLElement | null)?.focus();
    menuEl.addEventListener('keydown', (k) => { if (k.key === 'Escape') { k.stopPropagation(); closeMenu(); } });
  });
  addEventListener('pointerdown', (e) => { if (menuEl && !menuEl.contains(e.target as Node)) closeMenu(); }, true);
  /** Database → Heroes: the order stats are listed in, everywhere (the game's menus, the editor's forms). */
  const statOrderSection = () => {
    const move = (i: number, by: number) => {
      const j = i + by;
      if (j < 0 || j >= statOrder.length) return;
      [statOrder[i], statOrder[j]] = [statOrder[j], statOrder[i]];
      setAttrOrder(statOrder);
      render();
    };
    return h('section', { class: 'db-section stat-order' }, h('h3', {}, 'Stat order'),
      h('ol', { class: 'stat-order-list' }, ...statOrder.map((k, i) => h('li', {},
        h('b', {}, ATTR_INFO[k].short), h('span', {}, ATTR_INFO[k].name),
        h('button', { type: 'button', class: 'mini-btn', disabled: i === 0, title: 'Move up', 'aria-label': `Move ${ATTR_INFO[k].name} up`, onclick: () => move(i, -1) }, '▲'),
        h('button', { type: 'button', class: 'mini-btn', disabled: i === statOrder.length - 1, title: 'Move down', 'aria-label': `Move ${ATTR_INFO[k].name} down`, onclick: () => move(i, 1) }, '▼')))),
      h('button', { type: 'button', class: 'btn small ghost', disabled: statOrder.join() === DEFAULT_ATTR_ORDER.join(), onclick: () => { statOrder.splice(0, statOrder.length, ...DEFAULT_ATTR_ORDER); setAttrOrder(statOrder); render(); } }, 'Back to the usual order'),
      h('p', { class: 'note' }, 'Every list of stats follows this order: Status and Equipment in the game, level-up and dice screens, and the Database (heroes, classes, gear bonuses, buffs).'));
  };
  const renderTab = () => {
    if (tab === 'stats') { content.replaceChildren(statOrderSection()); return; }
    if (tab === 'heroes') { content.replaceChildren(...heroesTab(heroes, people, combat, heroState, render, work.items, { spells, additions, classes }, { pick: (x, done) => pickFace(store, x, done), url: (p) => { const b = store.files.get(p); return b ? URL.createObjectURL(b) : p; } })); return; }
    if (tab === 'characters') {
      // Looks (the sprites and models) or Chatter (what each hero says out of battle).
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Characters view' },
        ...(([['looks', 'Looks'], ['chatter', 'Chatter']] as const).map(([v, label]) => h('button', { type: 'button', 'aria-pressed': String(charView === v), onclick: () => { charView = v; render(); } }, label))));
      const bar = h('div', { class: 'char-view-bar' }, seg);
      content.replaceChildren(bar, ...(charView === 'chatter' ? [h('div', { class: 'chat-tab' }, ...chatterTab(heroes.heroes, store.maps, chatState, render, groupChatter))] : charactersTab(store, people, render)));
      return;
    }
    if (tab === 'credits') { content.replaceChildren(...creditsTab(credits, people.chars, render, [...store.assets.props, ...store.assets.tiles].map((d) => d.credits ?? []))); return; }
    if (tab === 'quests') { content.replaceChildren(...questsTab(store, quests, { items: work.items, enemies }, questState, render)); return; }
    if (isCat(tab)) {
      const cat = tab;
      content.replaceChildren(...itemsTab(store, work, catState[cat], render, cat, (to, d) => {
        // An item whose kind or slot changed: open its new tab with it selected.
        catState[to].sel = Math.max(0, work.items.filter((x) => itemCategory(x) === to).indexOf(d));
        tab = to;
        flash(`${d.name} is now in ${ITEM_CATS.find(([c]) => c === to)![1]}.`);
        queueMicrotask(render);
      }));
      return;
    }
    if (tab === 'skills') { content.replaceChildren(...skillsTab(skills, skillState, render, work.items, { spells, additions, gear: gearKinds({ armorTypes: work.armorTypes, weaponTypes: work.weaponTypes }) })); return; }
    if (tab === 'troops') { content.replaceChildren(...troopsTab(troops, enemies, audioFiles(store), troopState, render, store.battleMapNames())); return; }
    if (tab === 'markers') { content.replaceChildren(...markersTab(markers, render)); return; }
    if (tab === 'mapThemes') { content.replaceChildren(...mapThemesTab(themes, themeState, render, audioFiles(store), cliffChoices(store))); return; }
    if (tab === 'textColors') { content.replaceChildren(...textColorsTab(textCols, render)); return; }
    if (tab === 'climate') { content.replaceChildren(...climateTab(climate, render), bodySection(bodyWork, render)); return; }
    if (tab === 'messageStyles') { content.replaceChildren(...messageStylesTab(msgStyles, textCols, msgState, render)); return; }
    if (tab === 'tutorials') { content.replaceChildren(...tutorialsTab(tutorials, render)); return; }
    if (tab === 'genders') { content.replaceChildren(...gendersTab(genders, render)); return; }
    if (tab === 'globals') { content.replaceChildren(...globalEventsTab(store, globals, globalState, render)); return; }
    if (tab === 'roleplay') { content.replaceChildren(...roleplayTab(roleplay, heroes.heroes, render)); return; }
    if (tab === 'relations') { content.replaceChildren(...relationsTab(relations, heroes.heroes, render)); return; }
    if (tab === 'achievements') { content.replaceChildren(...achievementsTab(store, store.db, achievements, achState, render)); return; }
    if (tab === 'spells') { content.replaceChildren(...spellsTab(spells, spellState, render)); return; }
    if (tab === 'additions') { content.replaceChildren(...additionsTab(additions, additionState, render)); return; }
    if (tab === 'classes') { content.replaceChildren(...classesTab(classes, skills, classState, render, (id) => {
      const k = skills.trees.findIndex((t) => t.id === id);
      if (k < 0) return;
      skillState.tree = k; skillState.sel = ''; tab = 'skills'; render();
    }, work.armorTypes, work.weaponTypes)); return; }
    if (tab === 'horses') { content.replaceChildren(...horsesTab(horses, horseState, render, travel)); return; }
    if (tab === 'audio') { content.replaceChildren(...audioTab(store, audio, render)); return; }
    if (tab === 'combat') { content.replaceChildren(...combatTab(combat)); return; }
    if (tab === 'enemies') { content.replaceChildren(...enemiesTab(store, enemies, enemyState, render)); return; }
    if (tab === 'inventory') { content.replaceChildren(...inventoryTab(store, work, render)); return; }
    if (tab === 'menus') { content.replaceChildren(...menusTab()); return; }
    if (tab === 'saving') { content.replaceChildren(...savingTab()); return; }
    if (tab === 'time') { content.replaceChildren(...timeTab()); return; }
    if (tab === 'camera') { content.replaceChildren(...cameraTab()); return; }
    content.replaceChildren(
      // Update 142: the A button on the map.
      h('section', { class: 'db-section' },
        h('h3', {}, 'A button (on the map)'),
        field('A does', select([['jump', 'Jump'], ...FIELD_USES.filter((u) => !['swim', 'climb', 'skeletonKey'].includes(u)).map((u) => [u, u === 'dash' ? 'Sprint (hold A to run)' : FIELD_USE_NAMES[u]] as [string, string]), ...FIELD_POWERS.map((p) => [p, `${POWER_NAMES[p]} (switch on / off)`] as [string, string])], aButton, (v) => { aButton = v as typeof aButton; }),
          'Talking to someone in front still comes first. Any field power can go on A instead of Jump (Sprint: run while A is held; Cut swings; Bow: hold to draw). Without Jump on A there is no jumping (Space on a keyboard does the same as A).')),
      h('section', { class: 'db-section' },
        h('h3', {}, 'Party size'),
        field('Active characters', select([['3', '3 active (the hero + 2)'], ['4', '4 active (the hero + 3)']], String(activeParty), (v) => { activeParty = v === '4' ? 4 : 3; }),
          'How many fight in battle and walk on the map at once; the rest wait on the bench. In Single battle mode, Database → Combat → Heroes who fight (Single) decides it instead (up to 4).')),
      h('section', { class: 'db-section' },
        h('h3', {}, 'Health, magic and stamina'),
        h('div', { class: 'db-table gauges', role: 'table' },
          h('span', { class: 'db-head' }, ''), h('span', { class: 'db-head' }, 'Maximum'), h('span', { class: 'db-head' }, 'Regains per second'), h('span', { class: 'db-head' }, ''),
          ...GAUGES.flatMap((g) => {
            const regen = num(cfg.regen[g], (v) => (cfg.regen[g] = v), 0, 0.5, `${GAUGE_NAMES[g]} per second`);
            regen.disabled = cfg.noRegen[g];
            return [
              h('span', { class: `db-name gauge-${g}` }, GAUGE_NAMES[g]),
              num(cfg.max[g], (v) => (cfg.max[g] = Math.max(1, Math.round(v))), 1, 1, `Maximum ${GAUGE_NAMES[g]}`),
              regen,
              checkbox('Does not regenerate automatically', cfg.noRegen[g], (v) => { cfg.noRegen[g] = v; regen.disabled = v; }),
            ];
          })),
        h('p', { class: 'note' }, 'Everything starts full. By default only magic and stamina refill on their own; health comes back from items and events. Health at 0 sends the player back to their last rest point.')),

      h('section', { class: 'db-section' },
        h('h3', {}, 'Stamina'),
        h('div', { class: 'db-table costs' },
          ...COSTS.flatMap(([k, name, unit]) => [
            h('span', { class: 'db-name' }, name),
            num(cfg.cost[k], (v) => (cfg.cost[k] = v), 0, 1, `${name} stamina cost`),
            h('span', { class: 'db-unit' }, unit),
          ])),
        h('div', { class: 'db-table costs' },
          h('span', { class: 'db-name' }, 'Abilities return at'), num(cfg.recoverPercent, (v) => (cfg.recoverPercent = Math.min(100, v)), 0, 5, 'Recover percent'), h('span', { class: 'db-unit' }, '% stamina'),
          h('span', { class: 'db-name' }, 'Refills after'), num(cfg.regenDelay, (v) => (cfg.regenDelay = v), 0, 0.1, 'Regen delay'), h('span', { class: 'db-unit' }, 'seconds of rest'),
          h('span', { class: 'db-name' }, 'Drowning'), num(cfg.drownDamage, (v) => (cfg.drownDamage = v), 0, 1, 'Drowning damage'), h('span', { class: 'db-unit' }, 'health per second')),
        h('p', { class: 'note' }, 'At 0 stamina the player can only walk (and crawl): no running, jumping or climbing until stamina refills to the percentage above. Swimming with no stamina left drowns the player slowly.')),

      h('section', { class: 'db-section' },
        h('h3', {}, 'Movement speed'),
        h('div', { class: 'db-table speeds' },
          ...SPEEDS.flatMap(([k, name]) => [
            h('span', { class: 'db-name' }, name),
            num(cfg.speed[k], (v) => (cfg.speed[k] = Math.max(0.2, v)), 0.2, 0.1, `${name} speed`),
            h('span', { class: 'db-unit' }, 'tiles / s'),
          ])),
        h('p', { class: 'note' }, `Defaults: walk ${DEFAULT_PLAYER.speed.walk}, run ${DEFAULT_PLAYER.speed.run}. Jump height is fixed so a jump always clears one step.`)),

      h('section', { class: 'db-section' },
        h('h3', {}, 'Ledges'),
        h('div', { class: 'db-table costs' },
          h('span', { class: 'db-name' }, 'Ledge behaviour'),
          select([['limited', 'Walk off, except into pits'], ['walk', 'Walk off any ledge'], ['collision', 'Collision (jump down)']], cfg.ledges.mode, (v) => { cfg.ledges.mode = v as typeof cfg.ledges.mode; }, { 'aria-label': 'Ledge behaviour' }),
          h('span', { class: 'db-unit' }, ''),
          h('span', { class: 'db-name' }, 'Pits: heights from'),
          numberInput(cfg.ledges.min, (v) => (cfg.ledges.min = Math.round(v)), { step: '1', class: 'db-num', 'aria-label': 'Lowest pit height' }),
          h('span', { class: 'db-unit' }, 'steps'),
          h('span', { class: 'db-name' }, 'to'),
          numberInput(cfg.ledges.max, (v) => (cfg.ledges.max = Math.round(v)), { step: '1', class: 'db-num', 'aria-label': 'Highest pit height' }),
          h('span', { class: 'db-unit' }, 'steps')),
        h('p', { class: 'note' }, 'Walk off: the hero walks straight off an edge and drops to the ground below, any height. “Except into pits” also walks off, but cells whose height is in the range above act as a wall at their edge (chasms, the void). Collision: drops are walls; a jump still comes down up to two steps. Climbable walls are always climbed, not walked off.')),

      h('section', { class: 'db-section' },
        h('h3', {}, 'Starting abilities'),
        h('div', { class: 'db-abilities' }, ...ABILITIES.map((a) => checkbox(ABILITY_NAMES[a], abilities[a], (v) => (abilities[a] = v)))),
        h('p', { class: 'note' }, 'Unticked abilities can be given later with the “Change ability” event command.')),

      expSection(combat),
    );
  };

  const dayLength = (rate: number) => {
    if (rate <= 0) return 'The clock stands still (events can still change the time).';
    const min = (24 * 60) / rate, hrs = Math.floor(min / 60), mins = Math.round(min % 60);
    return `A full day takes ${hrs ? `${hrs} h ` : ''}${mins ? `${mins} min` : ''} of play. ${rate === 1 ? '1 game minute per real minute.' : `${rate} game minutes per real minute.`}`;
  };
  const range = (value: number, min: number, max: number, step: number, label: string, fmt: (v: number) => string, set: (v: number) => void, note?: HTMLElement, noteText?: (v: number) => string) => {
    const out = h('output', { class: 'blend-out' }, fmt(value));
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label,
      oninput: () => { const v = parseFloat(input.value); set(v); out.textContent = fmt(v); if (note && noteText) note.textContent = noteText(v); } });
    return h('div', { class: 'blend-slider' }, input, out);
  };
  /** World → Camera: the camera over the maps (battles have their own). */
  const cameraTab = () => {
    const D = DEFAULT_OVERWORLD_CAMERA, val = <K extends keyof OverworldCamera>(k: K) => cam[k] ?? D[k];
    const set = <K extends keyof OverworldCamera>(k: K, v: number) => { if (v === D[k]) delete cam[k]; else cam[k] = v; };
    const preset = (p: Required<OverworldCamera>) => { for (const k of Object.keys(p) as (keyof OverworldCamera)[]) set(k, p[k]); render(); };
    // Update 145: 2D mode (RPG Maker style: flat, drawn in order of layers) or 3D mode (HD-2D).
    const mode = (two: boolean) => { view2d = two; preset(two ? TOPDOWN_OVERWORLD_CAMERA : DEFAULT_OVERWORLD_CAMERA); };
    return [h('section', { class: 'db-section db-narrow' }, h('h3', {}, 'View'),
      h('div', { class: 'stack row' },
        h('button', { type: 'button', class: view2d ? 'btn ghost' : 'btn', 'aria-pressed': String(!view2d), onclick: () => mode(false) }, '3D mode (HD-2D)'),
        h('button', { type: 'button', class: view2d ? 'btn' : 'btn ghost', 'aria-pressed': String(view2d), onclick: () => mode(true) }, '2D mode (like RPG Maker)')),
      h('p', { class: 'note' }, view2d
        ? '2D: looking straight down, everything flat, drawn in order of layers: props on a lower layer than the characters always cover them, higher ones are always under them, and on the same layer whoever is further down the screen is in front (put trees on the player’s layer, flowers and rugs on 25, overhangs on a low number). Picking a mode also sets the camera below.'
        : '3D: the HD-2D look, sprites standing in a real 3D world; layers only settle which prop is on top where they overlap. Picking a mode also sets the camera below.'),
      view2d ? field('Player layer (0 on top … 25 the ground)', numberInput(playerLayer, (v) => (playerLayer = Math.max(0, Math.min(25, Math.round(v)))), { step: 1, min: 0, max: 25 }), 'The layer the hero, party and other characters are on.') : null,
      view2d ? checkbox('Grid movement: the hero steps tile by tile, like RPG Maker (off: walks freely)', gridMove, (v) => (gridMove = v)) : null,
      // Update 154: the camera on 3D maps (Blender scenes).
      field('Camera on 3D maps', select([['orbit', 'Orbit: drag or the right stick turns it round the hero (like World of Warcraft)'], ['follow', 'Follow: settles behind the hero as they walk (drag to look round)']], cam3d, (v) => (cam3d = v as 'orbit' | 'follow')),
        'Either way it never looks up from under the ground or straight down; the wheel zooms.')),
      h('section', { class: 'db-section db-narrow' }, h('h3', {}, 'Camera over the maps'),
      h('p', { class: 'note' }, 'How the camera looks at the maps while exploring (battle maps have their own cameras). Standing sprites (trees, people, signs) lean back to face it, so a steep camera still shows their full height and they fill out their tile.'),
      h('div', { class: 'stack row' },
        h('button', { type: 'button', class: 'btn', onclick: () => preset(DEFAULT_OVERWORLD_CAMERA) }, 'Handheld 3D (default)'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => preset(CLASSIC_OVERWORLD_CAMERA) }, 'Classic (low, upright sprites)'),
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { preset(TOPDOWN_OVERWORLD_CAMERA); } }, 'Top-down 2D (straight down, flat sprites)')),
      h('div', { class: 'db-grid' },
        field('Angle (°)', numberInput(val('pitch'), (v) => set('pitch', Math.max(20, Math.min(90, Math.round(v * 10) / 10))), { step: 1, min: 20, max: 90 }), 'How steeply it looks down: 56 handheld, 42 classic, 90 straight down.'),
        field('Distance (tiles)', numberInput(val('distance'), (v) => set('distance', Math.max(6, Math.min(40, Math.round(v * 10) / 10))), { step: 0.5, min: 6, max: 40 }), 'Further back shows more of the map.'),
        field('Field of view (°)', numberInput(val('fov'), (v) => set('fov', Math.max(15, Math.min(70, Math.round(v)))), { step: 1, min: 15, max: 70 }), 'Wider: more perspective.'),
        field('Sprite lean (%)', numberInput(val('lean'), (v) => set('lean', Math.max(0, Math.min(100, Math.round(v)))), { step: 5, min: 0, max: 100 }), 'Of the camera’s angle: 0 upright, 100 facing it fully (at 90° that lays them flat, like a 2D game).')),
      h('p', { class: 'note' }, 'Playtest to see it. Tall sprites right in front of walls may tuck into them when they lean a lot; lower the lean if so.'),
      view2d ? null : checkbox('Characters always on top: the hero and party are drawn over props they overlap and over ledges and cliff tops in front of them (nothing hides them)', onTop, (v) => (onTop = v)),
      view2d ? null : h('p', { class: 'note' }, 'Off: trees, props, ledges and cliffs in front of a character hide them, as they really stand. Either way, a sprite standing in front of a wall never tucks into it.'))];
  };

  const timeTab = () => {
    const rateNote = h('div', { class: 'hint' }, dayLength(time.rate));
    const darkNote = h('div', { class: 'hint' });
    const darkText = (v: number) => v >= 0.95 ? 'Pitch black away from lights.' : v >= 0.7 ? 'Very dark: lights and moonlit outlines.' : v >= 0.35 ? 'Dark blue moonlit night.' : 'A bright, storybook night.';
    darkNote.textContent = darkText(time.darkness);
    return [
      h('section', { class: 'db-section' },
        h('h3', {}, 'Clock'),
        field('Clock speed', range(time.rate, 0, 60, 1, 'Clock speed', (v) => (v ? `${v}×` : 'Stopped'), (v) => (time.rate = v), rateNote, dayLength)),
        rateNote,
        h('p', { class: 'note' }, 'The clock pauses in menus and on the title screen. The starting hour is in the map settings under “Game start”.'),
        field('Sky transition speed', select([['0.5', 'Slow'], ['1', 'Normal'], ['1.6', 'Fast'], ['2.5', 'Very fast']], String(time.skySpeed), (v) => (time.skySpeed = Number(v))),
          'Sleeping (and the Sleep event command): how quickly the sky turns through the hours. Normal takes 5 – 12 seconds, longer for a long sleep.')),
      h('section', { class: 'db-section' },
        h('h3', {}, 'Night'),
        field('Night darkness', range(Math.round(time.darkness * 100), 0, 100, 5, 'Night darkness', (v) => `${v}%`, (v) => (time.darkness = v / 100), darkNote, (v) => darkText(v / 100))),
        darkNote,
        h('p', { class: 'note' }, 'Also how dark “Dark” maps (caves, dungeons) are. Each map chooses Outdoor, Indoor or Dark under Lighting in its settings.')),
      h('section', { class: 'db-section' },
        h('h3', {}, 'Seasons'),
        checkbox('Seasons change with the days', !time.seasons.off, (v) => { if (v) delete time.seasons.off; else time.seasons.off = true; }),
        field('Seasons follow', select([['real', 'The real world (the player’s date, northern hemisphere)'], ['realSouth', 'The real world (southern hemisphere)'], ['days', 'In-game days']], time.seasons.mode ?? 'real', (v) => { if (v === 'real') delete time.seasons.mode; else time.seasons.mode = v as SeasonSettings['mode']; }), 'Real world: March–May spring, June–August summer, September–November autumn, December–February winter.'),
        field('Days per season (in-game days)', numberInput(time.seasons.length ?? 7, (v) => { const n = Math.max(1, Math.round(v)); if (n === 7) delete time.seasons.length; else time.seasons.length = n; }, { min: 1, step: 1 })),
        field('A new game starts in', select(SEASONS.map((x) => [x, SEASON_NAMES[x]] as [string, string]), time.seasons.start ?? 'spring', (v) => { if (v === 'spring') delete time.seasons.start; else time.seasons.start = v as Season; })),
        h('p', { class: 'note' }, 'Outdoors, grass and leaves follow the season: fresh green in spring, green-gold in summer, orange and red in autumn. Winter brings snow, bare trees (each prop chooses: Props → Seasons) and ice on still water, which the hero slides on. A map can keep one season (map settings → Season).')),
    ];
  };

  const savingTab = () => [
    h('section', { class: 'db-section' },
      h('h3', {}, 'Saving'),
      checkbox('Save from the menu anywhere', saving.anywhere, (v) => (saving.anywhere = v)),
      checkbox('Autosave on every map change', saving.autosave, (v) => (saving.autosave = v)),
      h('p', { class: 'note' }, 'With saving anywhere off, players save at save points: events with the “Open save screen” command. Esc (or Menu on touch screens) opens the menu; there are 3 slots plus the autosave.')),
  ];

  const text = (value: string | undefined, placeholder: string, set: (v: string | undefined) => void, label: string) =>
    textInput(value ?? '', (v) => set(v.trim() || undefined), { placeholder, 'aria-label': label });
  const barColours = () => {
    const DEF = { hp: '#3cb05a', mp: '#8a4fd0', xp: '#3a9ad8', sp: '#6aa83c' } as const;
    const one = (k: keyof typeof DEF, label: string) => {
      const inp = h('input', { type: 'color', value: menus.bars?.[k] || DEF[k], 'aria-label': `${label} colour` }) as HTMLInputElement;
      inp.addEventListener('input', () => { if (inp.value.toLowerCase() === DEF[k]) { if (menus.bars) delete menus.bars[k]; } else (menus.bars ??= {})[k] = inp.value; if (menus.bars && !Object.keys(menus.bars).length) delete menus.bars; });
      const reset = h('button', { type: 'button', class: 'btn ghost small', onclick: () => { inp.value = DEF[k]; if (menus.bars) delete menus.bars[k]; if (menus.bars && !Object.keys(menus.bars).length) delete menus.bars; } }, 'Default');
      return field(label, h('span', { class: 'stack row' }, inp, reset));
    };
    return h('section', { class: 'db-section' }, h('h3', {}, 'Bars'),
      h('div', { class: 'field-row' }, one('hp', 'Health'), one('mp', 'Magic'), one('xp', 'EXP'), one('sp', 'Stamina wheel')),
      checkbox('The stamina wheel stays on screen when full (off: it fades away once stamina is full)', !!menus.staminaSteady, (v) => { if (v) menus.staminaSteady = true; else delete menus.staminaSteady; }),
      h('div', { class: 'field-row' },
        field('Meter fill', select([['gradient', 'Gradient (shaded)'], ['flat', 'Flat colour'], ['glossy', 'Glossy (a shine along the top)'], ['striped', 'Striped'], ['segmented', 'Segmented (blocks of colour)']], menus.barFill ?? (menus.barsSolid ? 'flat' : 'gradient'), (v) => { delete menus.barsSolid; if (v === 'gradient') delete menus.barFill; else menus.barFill = v as NonNullable<typeof menus.barFill>; })),
        field('Meter shape', select([['pill', 'Pill (round ends)'], ['rect', 'Rectangle'], ['bevel', 'Bevelled (cut corners)'], ['thin', 'Thin line'], ['blocks', 'Blocks (gaps between)']], menus.barShape ?? (menus.barsSquare ? 'rect' : 'pill'), (v) => { delete menus.barsSquare; if (v === 'pill') delete menus.barShape; else menus.barShape = v as NonNullable<typeof menus.barShape>; })),
        field('Party orbs (battle)', select([['sphere', 'Shaded sphere'], ['flat', 'Flat circle'], ['square', 'Pixel square'], ['diamond', 'Diamond']], menus.orbStyle ?? 'sphere', (v) => { if (v === 'sphere') delete menus.orbStyle; else menus.orbStyle = v as NonNullable<typeof menus.orbStyle>; }))),
      h('p', { class: 'note' }, 'The same colours everywhere: the HUD, the menus and battles. Health still turns yellow at half and red when low where its bar shows that.'));
  };
  const menusTab = () => [
    barColours(),
    partyLayoutSection(menus),
    battleLayoutSection(menus),
    h('section', { class: 'db-section' },
      h('h3', {}, 'Window theme'),
      field('Menus, text boxes and the HUD', select(UI_THEMES.map((t) => [t.id, `${t.name}: ${t.note}`] as [string, string]), menus.uiTheme ?? 'ember', (v) => { if (v === 'ember') delete menus.uiTheme; else menus.uiTheme = v; }),
        'The game’s look. Players can choose another in Settings → Gameplay → Window theme. Playtest to see it.'),
      (() => {
        const w = () => (menus.window ??= {}), tidy = () => { if (menus.window && !Object.values(menus.window).some((v) => v !== undefined && v !== '')) delete menus.window; };
        const color = (label: string, k: 'color' | 'text' | 'accent', hint: string) => {
          const inp = h('input', { type: 'color', value: menus.window?.[k] || '#ffffff' }) as HTMLInputElement;
          const on = h('input', { type: 'checkbox', checked: !!menus.window?.[k] }) as HTMLInputElement;
          const apply = () => { if (on.checked) w()[k] = inp.value; else if (menus.window) delete menus.window[k]; tidy(); };
          inp.addEventListener('input', () => { on.checked = true; apply(); });
          on.addEventListener('change', apply);
          return field(label, h('span', { class: 'stack row' }, on, inp), hint);
        };
        return h('div', { class: 'field-row' },
          field('Window opacity %', numberInput(menus.window?.opacity ?? 100, (v) => { const n = Math.max(30, Math.min(100, Math.round(v))); if (n === 100) { if (menus.window) delete menus.window.opacity; } else w().opacity = n; tidy(); }, { step: 5, min: 30, max: 100 }), '100: solid.'),
          color('Window colour', 'color', 'Tick to tint the windows.'),
          color('Text colour', 'text', 'The main text (coloured names keep theirs).'),
          color('Frame colour', 'accent', 'The frame’s coloured lines and gems.'));
      })()),
    h('section', { class: 'db-section' },
      h('h3', {}, 'Title screen'),
      field('Game title', textInput(gameTitle, (v) => (gameTitle = v.trim() || gameTitle)), 'Also names the save files: changing it starts a fresh set of saves.'),
      field('Title shown on screen', text(menus.titleText, gameTitle, (v) => (menus.titleText = v), 'Title shown on screen'), 'Leave empty to show the game title.'),
      field('Subtitle', text(menus.subtitle, 'e.g. Chapter One: The Forest', (v) => (menus.subtitle = v), 'Subtitle')),
      h('div', { class: 'db-table menu-rows' },
        h('span', { class: 'db-head' }, 'Option'), h('span', { class: 'db-head' }, 'Shown as'), h('span', { class: 'db-head' }, 'Show'),
        ...TITLE_OPTIONS.flatMap(([o, name]) => [
          h('span', { class: 'db-name' }, name),
          text(menus.titleLabels?.[o], name, (v) => ((menus.titleLabels ??= {})[o] = v), `${name} label`),
          o === 'newGame' ? h('span', { class: 'db-unit' }, 'always') : checkboxOnly(!menus.titleHidden?.[o], (v) => ((menus.titleHidden ??= {})[o] = v ? undefined : true), `Show ${name}`),
        ])),
      h('p', { class: 'note' }, 'Continue and Load are greyed out until there’s a save. Exit closes the game (in a browser tab it can only ask the player to close the tab).'),
      titleBackgroundField(store, menus),
      checkbox('Skip the title screen in playtests', !!menus.skipTitleInPlaytest, (v) => (menus.skipTitleInPlaytest = v || undefined)),
      field('Game lettering', select([['classic', 'Classic pixel (Game Boy style: Press Start 2P)'], ['soft', 'Soft pixel (Pixelify Sans)'], ['smooth', 'Smooth (Atkinson Hyperlegible, not pixel)']], menus.font ?? 'classic',
        (v) => { if (v === 'classic') delete menus.font; else menus.font = v as 'soft' | 'smooth'; }),
        'The font for all of the game’s text: messages, menus, the HUD. All are free for commercial games (SIL Open Font License) and built into the game, so they work offline. Players can switch to an easy-to-read font in Settings.')),
    h('section', { class: 'db-section' },
      h('h3', {}, 'Pause menu'),
      h('div', { class: 'db-table menu-rows pause' },
        h('span', { class: 'db-head' }, 'Entry'), h('span', { class: 'db-head' }, 'Shown as'), h('span', { class: 'db-head' }, 'Show'), h('span', { class: 'db-head' }, ''),
        ...PAUSE_OPTIONS.flatMap(([o, name, works]) => [
          h('span', { class: 'db-name' }, name),
          text(menus.pauseLabels?.[o], name, (v) => ((menus.pauseLabels ??= {})[o] = v), `${name} label`),
          checkboxOnly(!menus.pauseHidden?.[o], (v) => ((menus.pauseHidden ??= {})[o] = v ? undefined : true), `Show ${name}`),
          h('span', { class: works ? 'db-unit works' : 'db-unit' }, works ? 'works' : 'coming soon'),
        ])),
      h('p', { class: 'note' }, 'The pause menu’s tabs, left to right (LB / RB move between them). Map shows once there’s a World layout (toolbar → World); Achievements once there are achievements. System holds Save, Load and Quit to Title. Settings are the player’s own and stay the same whichever save is loaded.')),
    h('section', { class: 'db-section' },
      h('h3', {}, 'Developer console'),
      field('The \u0060 key opens it', select([['playtest', 'In playtests only'], ['always', 'Always (the released game too)'], ['off', 'Never']], devConsole, (v) => { devConsole = v as typeof devConsole; })),
      h('p', { class: 'note' }, 'Type commands to test quickly: give items, teleport, god mode, ghost through walls… (help lists them). On a tablet: three fingers on the screen, or Console in the playtest panel. Using a cheat turns achievements off for that game.')),
    journalSection(),
    defaultSettingsSection(),
  ];
  /**
   * New players' settings (Update 117): the HUD layout, controls, picture and sound a new player starts with. Set it
   * up in a playtest, Settings → Export settings, then choose that file here (it's kept as data/settings.json).
   */
  /** The Journal's tabs (Update 130): their order and which are hidden at the start (events show / hide them later). */
  function journalSection(): HTMLElement {
    const box = h('div', { class: 'db-table journal-rows' });
    const draw = () => {
      const j = (menus.journal ??= {});
      const all = Object.keys(JOURNAL_TAB_NAMES) as JournalTabId[];
      const order = [...(j.order ?? []), ...all.filter((t) => !(j.order ?? []).includes(t))];
      const save = (o: JournalTabId[]) => { j.order = o; if (JSON.stringify(o) === JSON.stringify(all)) delete j.order; if (!j.order && !j.hidden?.length) delete menus.journal; draw(); };
      box.replaceChildren(h('span', { class: 'db-head' }, 'Tab'), h('span', { class: 'db-head' }, 'Shown at the start'), h('span', { class: 'db-head' }, 'Order'),
        ...order.flatMap((t, i) => [
          h('span', { class: 'db-name' }, JOURNAL_TAB_NAMES[t]),
          checkboxOnly(!j.hidden?.includes(t), (v) => { const hd = new Set(j.hidden ?? []); if (v) hd.delete(t); else hd.add(t); j.hidden = [...hd]; if (!j.hidden.length) delete j.hidden; }, `Show ${JOURNAL_TAB_NAMES[t]}`),
          h('span', { class: 'stack row' },
            h('button', { type: 'button', class: 'mini-btn', disabled: i === 0, 'aria-label': 'Move up', onclick: () => { const o = [...order]; o.splice(i - 1, 0, o.splice(i, 1)[0]); save(o); } }, '↑'),
            h('button', { type: 'button', class: 'mini-btn', disabled: i === order.length - 1, 'aria-label': 'Move down', onclick: () => { const o = [...order]; o.splice(i + 1, 0, o.splice(i, 1)[0]); save(o); } }, '↓')),
        ]));
    };
    draw();
    return h('section', { class: 'db-section' }, h('h3', {}, 'Journal'), box,
      h('p', { class: 'note' }, 'The Journal’s tabs, left to right. A tab not shown at the start can be shown later with the event command “Show / hide a Journal tab” (unlock the Bestiary with the story).'));
  }

  function defaultSettingsSection(): HTMLElement {
    const status = h('p', { class: 'note' }, 'Checking…');
    const p = store.project;
    void p.readFile('data/settings.json').then(async (b) => {
      try { const d = JSON.parse(await b.text()) as { saved?: string }; status.textContent = `In use: data/settings.json${d.saved ? ` (exported ${new Date(d.saved).toLocaleString()})` : ''}.`; }
      catch { status.textContent = 'data/settings.json is there but isn’t a settings file.'; }
    }).catch(() => { status.textContent = 'None yet: new players start with the built-in settings.'; });
    const choose = () => {
      const input = h('input', { type: 'file', accept: '.json,application/json' });
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (!f) return;
        const text = await f.text();
        try { const d = JSON.parse(text) as { kind?: string }; if (d.kind !== 'hd2d-settings') throw new Error(); }
        catch { toast('That isn’t a settings file (export one from the game’s Settings).', 'error'); return; }
        if (!p.canSave) { toast('Open the project folder to keep it.', 'error'); return; }
        try { await p.write('settings.json', text); status.textContent = 'In use: data/settings.json (just chosen).'; toast('New players will start with these settings.'); }
        catch (err) { toast(`Couldn’t save it: ${err instanceof Error ? err.message : String(err)}`, 'error'); }
      });
      input.click();
    };
    return h('section', { class: 'db-section' }, h('h3', {}, 'Default settings for new players'),
      h('p', { class: 'note' }, 'The HUD layout and the rest of Settings (controls, picture, sound, gameplay) a new player starts with. Arrange the HUD and settings in a playtest, then Settings → Save settings to a file, and choose that file here. Replace it any time; players who already changed their own settings keep theirs.'),
      status,
      h('button', { type: 'button', class: 'btn', onclick: choose }, 'Choose settings file…'));
  }

  render();

  const reset = h('button', { type: 'button', class: 'btn ghost', onclick: () => {
    Object.assign(cfg, playerConfig());
    for (const a of ABILITIES) abilities[a] = true;
    saving.anywhere = true; saving.autosave = true;
    time.rate = 20; time.darkness = 0.85; time.skySpeed = 1; time.seasons = {};
    for (const k of Object.keys(menus)) delete (menus as Record<string, unknown>)[k];
    render();
  } }, 'Reset to defaults');

  /** Put the window's changes into the database. 'same': nothing had changed. */
  const commit = (): 'same' | 'applied' => {
      // Commit any number field still being typed in.
      (document.activeElement as HTMLElement | null)?.blur?.();
      const stats = diffFromDefaults(cfg);
      const ab = Object.fromEntries(ABILITIES.filter((a) => !abilities[a]).map((a) => [a, false]));
      const db = store.db;
      const sv: { anywhere?: boolean; autosave?: boolean } = {};
      if (!saving.anywhere) sv.anywhere = false;
      if (!saving.autosave) sv.autosave = false;
      const svOut = Object.keys(sv).length ? sv : null;
      const mOut = cleanMenus(menus);
      const tOut: { rate?: number; darkness?: number; skySpeed?: number; seasons?: SeasonSettings } = {};
      if (Object.keys(time.seasons).length) tOut.seasons = { ...time.seasons };
      if (time.rate !== 20) tOut.rate = time.rate;
      if (Math.abs(time.darkness - 0.85) > 0.001) tOut.darkness = time.darkness;
      if (time.skySpeed !== 1) tOut.skySpeed = time.skySpeed;
      const tFinal = Object.keys(tOut).length ? tOut : null;
      const itemsOut = work.items.length ? work.items : null;
      const invOut = cleanInventory(work.inventory);
      trimExpTable(combat);
      const combatOut = cleanCombat(combat) ?? null;
      const enemiesOut = enemies.length ? enemies : null;
      const audioOut = cleanAudio(audio) ?? null;
      const skillsOut = cleanSkills(skills) ?? null;
      const questsOut = cleanQuests(quests) ?? null;
      const heroesOut = cleanHeroes(heroes) ?? null;
      const spellsOut = JSON.stringify(spells) === JSON.stringify(DEFAULT_SPELLS) && !db.spells ? null : spells;
      const additionsOut = JSON.stringify(additions) === JSON.stringify(DEFAULT_ADDITIONS) && !db.additions ? null : additions;
      const classesOut = classes.length ? classes : null;
      const troopsOut = troops.length ? troops : null;
      const travelOut = Object.keys(travel).length ? travel : null;
      const horsesOut = JSON.stringify(horses) === JSON.stringify(DEFAULT_HORSES) && !db.horses ? null : horses.length ? horses : null;
      const achOut = achievements.length ? achievements : null;
      const dcOut = devConsole === 'playtest' ? null : devConsole;
      const markersOut = JSON.stringify(markers) === JSON.stringify(markerKinds(undefined)) ? null : markers;
      const themesOut = JSON.stringify(themes) === JSON.stringify(DEFAULT_THEMES) ? null : themes;
      const textColorsOut = JSON.stringify(textCols) === JSON.stringify(textColors(undefined)) ? null : textCols;
      const stylesOut = JSON.stringify(msgStyles) === JSON.stringify(messageStyles(undefined)) ? null : msgStyles;
      const climateOut = cleanClimate(climate) ?? null;
      const bodyOut = cleanBody(bodyWork) ?? null;
      const camOut = Object.keys(cam).length ? cam : null;
      const statOut = statOrder.join() === DEFAULT_ATTR_ORDER.join() ? null : [...statOrder];
      const armorOut = JSON.stringify(work.armorTypes) === JSON.stringify(DEFAULT_ARMOR_TYPES) && !db.armorTypes ? null : work.armorTypes ?? null;
      const weaponOut = JSON.stringify(work.weaponTypes) === JSON.stringify(DEFAULT_WEAPON_TYPES) && !db.weaponTypes ? null : work.weaponTypes ?? null;
      if (JSON.stringify(statOut) === JSON.stringify(db.statOrder ?? null) && JSON.stringify(armorOut) === JSON.stringify(db.armorTypes ?? null) && JSON.stringify(weaponOut) === JSON.stringify(db.weaponTypes ?? null) &&
        JSON.stringify(stats ?? null) === JSON.stringify(db.stats ?? null) && JSON.stringify(svOut) === JSON.stringify(db.saving ?? null) &&
        JSON.stringify(mOut ?? null) === JSON.stringify(db.menus ?? null) && gameTitle === db.title && JSON.stringify(tFinal) === JSON.stringify(db.time ?? null) &&
        JSON.stringify(Object.keys(ab).length ? ab : null) === JSON.stringify(db.abilities && Object.keys(db.abilities).length ? db.abilities : null) &&
        JSON.stringify(itemsOut) === JSON.stringify(db.items?.length ? db.items : null) && JSON.stringify(invOut ?? null) === JSON.stringify(db.inventory ?? null) &&
        JSON.stringify(combatOut) === JSON.stringify(db.combat ?? null) && JSON.stringify(enemiesOut) === JSON.stringify(db.enemies?.length ? db.enemies : null) &&
        JSON.stringify(audioOut) === JSON.stringify(db.audio ?? null) && JSON.stringify(skillsOut) === JSON.stringify(db.skills ?? null) &&
        JSON.stringify(people.chars) === JSON.stringify(db.characters) && people.player === db.player && people.look === db.modelLook && people.outline === db.modelOutline &&
        JSON.stringify(cleanCredits(credits) ?? null) === JSON.stringify(db.credits ?? null) && JSON.stringify(questsOut) === JSON.stringify(db.quests?.length ? db.quests : null) &&
        JSON.stringify(heroesOut) === JSON.stringify(db.heroes?.length ? db.heroes : null) &&
        JSON.stringify(spellsOut) === JSON.stringify(db.spells ?? null) && JSON.stringify(additionsOut) === JSON.stringify(db.additions ?? null) &&
        JSON.stringify(classesOut) === JSON.stringify(db.classes?.length ? db.classes : null) &&
        JSON.stringify(troopsOut) === JSON.stringify(db.troops?.length ? db.troops : null) && JSON.stringify(horsesOut) === JSON.stringify(db.horses?.length ? db.horses : null) && JSON.stringify(travelOut) === JSON.stringify(db.travel ?? null) &&
        JSON.stringify(achOut) === JSON.stringify(db.achievements?.length ? db.achievements : null) && dcOut === (db.devConsole ?? null) &&
        JSON.stringify(markersOut) === JSON.stringify(db.markers ?? null) && JSON.stringify(themesOut) === JSON.stringify(db.mapThemes ?? null) && JSON.stringify(textColorsOut) === JSON.stringify(db.textColors ?? null) && JSON.stringify(stylesOut) === JSON.stringify(db.messageStyles ?? null) && JSON.stringify(climateOut) === JSON.stringify(db.climate ?? null) && JSON.stringify(bodyOut) === JSON.stringify(db.body ?? null) && JSON.stringify(camOut) === JSON.stringify(db.overworldCamera ?? null) && onTop === !!db.charactersOnTop && view2d === (db.viewMode === '2d') && playerLayer === (db.playerLayer ?? 10) && gridMove === !db.freeMove2D && cam3d === (db.camera3d ?? 'orbit') &&
        (activeParty === 4) === (db.activeParty === 4) && aButton === (db.aButton ?? 'jump') && JSON.stringify(tutorials.filter((t) => t.id && t.title)) === JSON.stringify(db.tutorials ?? []) && JSON.stringify(cleanGroups(groupChatter)) === JSON.stringify(db.groupChatter ?? []) && JSON.stringify(relations) === JSON.stringify(db.relations ?? {}) && JSON.stringify(cleanRoleplay(roleplay)) === JSON.stringify(db.roleplay ?? []) && JSON.stringify(cleanGlobals(globals)) === JSON.stringify(db.globalEvents ?? []) && JSON.stringify(cleanGenders(genders) ?? null) === JSON.stringify(db.genders ?? null)) return 'same';
      store.checkpoint();
      // Copies: the window keeps editing its own, so later changes are compared (and saved) properly.
      const C = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
      if (stats) db.stats = C(stats); else delete db.stats;
      if (Object.keys(ab).length) db.abilities = C(ab); else delete db.abilities;
      if (svOut) db.saving = C(svOut); else delete db.saving;
      if (mOut) db.menus = C(mOut); else delete db.menus;
      db.title = gameTitle;
      if (tFinal) db.time = C(tFinal); else delete db.time;
      if (camOut) db.overworldCamera = C(camOut); else delete db.overworldCamera;
      if (onTop) db.charactersOnTop = true; else delete db.charactersOnTop;
      if (view2d) db.viewMode = '2d'; else delete db.viewMode;
      if (playerLayer !== 10) db.playerLayer = playerLayer; else delete db.playerLayer;
      if (!gridMove) db.freeMove2D = true; else delete db.freeMove2D;
      if (cam3d === 'follow') db.camera3d = 'follow'; else delete db.camera3d;
      if (statOut) db.statOrder = statOut; else delete db.statOrder;
      if (activeParty === 4) db.activeParty = 4; else delete db.activeParty;
      if (aButton !== 'jump') db.aButton = aButton; else delete db.aButton;
      if (armorOut) db.armorTypes = C(armorOut); else delete db.armorTypes;
      if (weaponOut) db.weaponTypes = C(weaponOut); else delete db.weaponTypes;
      if (itemsOut) db.items = C(itemsOut); else delete db.items;
      if (invOut) db.inventory = C(invOut); else delete db.inventory;
      if (combatOut) db.combat = C(combatOut); else delete db.combat;
      if (enemiesOut) db.enemies = C(enemiesOut); else delete db.enemies;
      if (audioOut) db.audio = C(audioOut); else delete db.audio;
      if (skillsOut) db.skills = C(skillsOut); else delete db.skills;
      if (questsOut) db.quests = C(questsOut); else delete db.quests;
      if (heroesOut) db.heroes = C(heroesOut); else delete db.heroes;
      if (spellsOut) db.spells = C(spellsOut); else delete db.spells;
      if (additionsOut) db.additions = C(additionsOut); else delete db.additions;
      if (classesOut) db.classes = C(classesOut); else delete db.classes;
      if (troopsOut) db.troops = C(troopsOut); else delete db.troops;
      if (horsesOut) db.horses = C(horsesOut); else delete db.horses;
      if (travelOut) db.travel = C(travelOut); else delete db.travel;
      if (achOut) db.achievements = C(achOut); else delete db.achievements;
      const tutOut = tutorials.filter((t) => t.id && t.title);
      if (tutOut.length) db.tutorials = C(tutOut); else delete db.tutorials;
      const gOut = cleanGroups(groupChatter);
      if (gOut.length) db.groupChatter = C(gOut); else delete db.groupChatter;
      if (Object.keys(relations).length) db.relations = C(relations); else delete db.relations;
      const rpOut = cleanRoleplay(roleplay);
      if (rpOut.length) db.roleplay = C(rpOut); else delete db.roleplay;
      const glOut = cleanGlobals(globals);
      if (glOut.length) db.globalEvents = C(glOut); else delete db.globalEvents;
      const gnOut = cleanGenders(genders);
      if (gnOut) db.genders = C(gnOut); else delete db.genders;
      setGenderLooks(db.genders);
      if (dcOut) db.devConsole = dcOut; else delete db.devConsole;
      if (markersOut) db.markers = C(markersOut); else delete db.markers;
      if (themesOut) db.mapThemes = C(themesOut); else delete db.mapThemes;
      if (textColorsOut) db.textColors = C(textColorsOut); else delete db.textColors;
      if (stylesOut) db.messageStyles = C(stylesOut); else delete db.messageStyles;
      if (climateOut) db.climate = C(climateOut) as typeof db.climate; else delete db.climate;
      if (bodyOut) db.body = C(bodyOut); else delete db.body;
      db.characters = C(people.chars);
      if (people.look) db.modelLook = people.look; else delete db.modelLook;
      if (people.outline !== undefined) db.modelOutline = people.outline; else delete db.modelOutline;
      const cr = cleanCredits(credits);
      if (cr) db.credits = C(cr); else delete db.credits;
      if (people.chars[people.player]) db.player = people.player;
      store.changedDb('ui');
      return 'applied';
  };

  // Combat preview plays what's in this window: its changes go into the project first.
  beforeCombatPreview(() => { commit(); });
  /** A note at the bottom left of the window, fading after a few seconds. */
  const note = h('div', { class: 'db-saved-note', role: 'status', 'aria-live': 'polite' });
  let noteTimer = 0;
  const flash = (text: string, kind: 'ok' | 'warn' = 'ok') => {
    note.textContent = text; note.className = `db-saved-note on ${kind}`;
    clearTimeout(noteTimer);
    noteTimer = window.setTimeout(() => note.classList.remove('on'), 2800);
  };
  /** Apply also saves database.json, so nothing is lost when the window (or the editor) closes. */
  const applyAndSave = async (): Promise<void> => {
    const r = commit();
    if (r === 'same' && !store.dbDirty) { flash('No changes to save.'); return; }
    const saved = await saveDatabase(store);
    if (saved === 'saved') flash('Changes saved. It’s safe to close the Database.');
    else if (saved === 'export') flash('Applied. This copy can’t write files: press Save to export them.', 'warn');
    else flash('Applied, but saving failed: press Save to try again.', 'warn');
  };
  const foot = h('div', { class: 'db-foot-start' }, reset, note);
  const close = openModal('Database', body, [
    { label: 'Close', onClick: () => { confirmClose(); return false; } },
    { label: 'Apply', primary: true, onClick: () => { void applyAndSave(); return false; } },
  ], () => {}, { wide: true, footStart: foot, cls: 'db-modal', beforeDismiss: () => { confirmClose(); return false; } });
  /** Does the window hold changes the database doesn't have? (A trial commit, undone straight away.) */
  function dirtyCheck(): boolean {
    const snap = JSON.stringify(store.db), st = store as unknown as Record<string, unknown>;
    st.checkpoint = () => {}; st.changedDb = () => {};
    let r: 'same' | 'applied';
    try { r = commit(); } finally { delete st.checkpoint; delete st.changedDb; }
    if (r === 'same') return false;
    const db = store.db as unknown as Record<string, unknown>, back = JSON.parse(snap) as Record<string, unknown>;
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, back);
    return true;
  }
  /** Closing with changes not applied yet: apply and save them, or let them go. */
  function confirmClose(): void {
    if (!dirtyCheck()) { close(); return; }
    openModal('Unsaved changes', h('p', { class: 'modal-text' }, 'You have changes in the Database that aren’t applied yet.'), [
      { label: 'Discard them', danger: true, onClick: () => { setAttrOrder(store.db.statOrder); close(); } },
      { label: 'Keep editing' },
      { label: 'Apply and save', primary: true, onClick: () => { void applyAndSave().then(() => close()); } },
    ]);
  }
}

/** A checkbox with no text (its label is for screen readers). */
function checkboxOnly(checked: boolean, onchange: (v: boolean) => void, label: string): HTMLElement {
  const i = h('input', { type: 'checkbox', checked, 'aria-label': label, class: 'db-check', onchange: () => onchange(i.checked) });
  return i;
}

/** Drop empty entries, so database.json only lists what was changed. */
function cleanMenus(m: MenuConfig): MenuConfig | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v === undefined || v === '' || v === false) continue;
    if (typeof v === 'object') {
      const inner = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== undefined && x !== '' && x !== false));
      if (Object.keys(inner).length) out[k] = inner;
    } else out[k] = v;
  }
  return Object.keys(out).length ? (out as MenuConfig) : undefined;
}

/** Only the settings that differ from the defaults (or undefined when nothing does). */
function diffFromDefaults(cfg: PlayerConfig): PlayerConfigData | undefined {
  const out: PlayerConfigData = {};
  const d = DEFAULT_PLAYER as unknown as Record<string, unknown>, c = cfg as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PLAYER)) {
    const dv = d[key], cv = c[key];
    if (typeof dv === 'object' && dv) {
      const part: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(cv as Record<string, unknown>)) if (v !== (dv as Record<string, unknown>)[k]) part[k] = v;
      if (Object.keys(part).length) (out as Record<string, unknown>)[key] = part;
    } else if (cv !== dv) (out as Record<string, unknown>)[key] = cv;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Database → Heroes → Face art: import a picture into assets/faces/. */
function pickFace(store: EditorStore, x: HeroDef, done: () => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/webp,image/gif,image/jpeg';
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    const path = `assets/faces/${x.id}_${Date.now().toString(36)}.${f.type === 'image/jpeg' ? 'jpg' : f.type === 'image/webp' ? 'webp' : f.type === 'image/gif' ? 'gif' : 'png'}`;
    const p = store.project, persistent = p.canSave && p.canStoreImages;
    try { if (persistent) await p.writeFile(path, f); }
    catch (err) { toast(`Couldn’t save the picture: ${err instanceof Error ? err.message : String(err)}`, 'error'); return; }
    store.files.set(path, f);
    x.face = path;
    if (!persistent) toast('Picture kept for this session only: open the project folder itself to save imported images.');
    done();
  });
  input.click();
}

/** Title & menus → Behind the title: the start map, a map of its own (and where to look), a picture or a video. */
function titleBackgroundField(store: EditorStore, menus: MenuConfig): HTMLElement {
  const box = h('div', { class: 'title-bg-field' });
  const draw = () => {
    const tb = menus.titleBackground;
    const kind = tb?.kind ?? '';
    const set = (v: MenuConfig['titleBackground']) => { if (v) menus.titleBackground = v; else delete menus.titleBackground; draw(); };
    const parts: HTMLElement[] = [field('Behind the title', select([['', 'The start map'], ['map', 'A map of its own'], ['image', 'A picture (no map)'], ['video', 'A video (no map)']], kind,
      (v) => set(v ? { kind: v as 'map' | 'image' | 'video' } : undefined)), 'A map behind the title is seen from above, the camera looking slowly around the spot you choose.')];
    if (tb?.kind === 'map') {
      parts.push(h('div', { class: 'field-row' },
        field('Map', select(store.maps.map((n) => [n, n] as [string, string]), tb.map ?? store.db.startMap, (v) => { tb.map = v; })),
        field('Look around tile X', numberInput(tb.x ?? 10, (v) => { tb.x = Math.max(0, v); }, { step: 0.5, min: 0 })),
        field('Z', numberInput(tb.z ?? 10, (v) => { tb.z = Math.max(0, v); }, { step: 0.5, min: 0 }))));
      tb.map ??= store.db.startMap;
    } else if (tb?.kind === 'image' || tb?.kind === 'video') {
      const path = tb.kind === 'image' ? tb.image : tb.video;
      parts.push(field(tb.kind === 'image' ? 'Picture' : 'Video', h('div', { class: 'face-pick' },
        h('span', { class: 'note' }, path ? path.split('/').pop()! : 'None chosen'),
        h('button', { type: 'button', class: 'btn small', onclick: () => pickTitleFile(store, tb.kind === 'image' ? 'image/png,image/jpeg,image/webp,image/gif' : 'video/mp4,video/webm', (p) => { if (tb.kind === 'image') tb.image = p; else tb.video = p; draw(); }) }, 'Choose a file…')),
        tb.kind === 'video' ? 'Plays silently, looping (the title music plays over it). MP4 or WebM.' : 'Fills the screen (cropped to fit).'));
    }
    box.replaceChildren(...parts);
  };
  draw();
  return box;
}

function pickTitleFile(store: EditorStore, accept: string, done: (path: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    const ext = (f.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `assets/title/title_${Date.now().toString(36)}.${ext}`;
    const p = store.project, persistent = p.canSave && p.canStoreImages;
    try { if (persistent) await p.writeFile(path, f); }
    catch (err) { toast(`Couldn’t save the file: ${err instanceof Error ? err.message : String(err)}`, 'error'); return; }
    store.files.set(path, f);
    if (!persistent) toast('Kept for this session only: open the project folder itself to save imported files.');
    done(path);
  });
  input.click();
}

/** Group chatter for saving (Update 122): empty lines dropped, conversations with no lines left out. */
function cleanGroups(list: GroupChatter[]): GroupChatter[] {
  return list.map((g) => ({ ...g, name: g.name.trim() || g.id, lines: g.lines.map((l) => ({ hero: l.hero, text: l.text.trim() })).filter((l) => l.hero && l.text) })).filter((g) => g.lines.length);
}

/** Roleplay titles for saving (Update 127): blank titles dropped. */
function cleanRoleplay(list: RoleplayField[]): RoleplayField[] { return list.filter((f) => f.title.trim()).map((f) => ({ id: f.id, title: f.title.trim(), ...(f.type === 'date' ? { type: 'date' as const } : {}) })); }
