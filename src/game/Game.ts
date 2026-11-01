/**
 * The game: loads data, builds the scene, and runs the frame loop.
 * Systems are kept in their own modules; this file wires them together.
 */
import { builtinTileArt } from '../art/placeholderArt';
import { frameLayout, frameRect } from '../world/pixelTiles';
import { Body3D, Camera3D, type Scene3D, type With3D, ground3D, load3D } from './World3D';
import { type WithGround, loadGround } from '../world/groundModel';
import { restoreAmount, restoreBits, restoreParts, restoresAny } from './restore';
import { partyLayout } from '../ui/partyLayout';
import { UI_THEMES, applyUiTheme } from '../ui/themes';
import * as THREE from 'three';
import { tileCursor } from '../art/placeholderArt';
import { clamp } from '../core/math';
import { GameEvent } from '../events/GameEvent';
import { EventContext, Interpreter } from '../events/Interpreter';
import { PostFX } from '../render/PostFX';
import { SpriteLibrary, setSpriteGlow, unregisterGlow, withSpriteShadows } from '../render/sprites';
import { itemWeaponSprite, usedWeaponSprites } from './combat/weaponSprites';
import { fadeBuildings } from '../world/buildings';
import { makeTexture, setMaxAnisotropy, setNormalMapsEnabled, unregisterNormalMap } from '../render/textures';
import { DebugPanel } from '../ui/DebugPanel';
import { MessageWindow, setTextSpeed } from '../ui/MessageWindow';
import { setTextColors } from '../ui/richText';
import { Fireflies } from '../world/Fireflies';
import { Weather } from '../render/Weather';
import { Atmosphere } from '../render/Atmosphere';
import { SSAO, tagAOMeshes } from '../render/ssao';
import { propBase } from '../world/wallAnchor';
import { updateWind, wind } from '../render/wind';
import { setClouds } from '../render/areaTint';
import { Ripples } from '../render/Ripples';
import type { WaterFlow } from '../world/WorldBuilder';
import { isToonWater, waterStyle } from '../world/waterStyles';
import { SEASON_NAMES, type Season, realSeason, seasonOn } from '../world/seasons';
import { setSeason } from '../render/season';
import { biteDelay, biteWindow, catchSize, fishingGrid, pickCatch } from '../world/fishing';
import { Lights, type ShaderLights, maxLights, scheduleFactor } from '../world/Lights';
import { PropCatalog, migrateMap } from '../world/props';
import { TileCatalog } from '../world/tiles';
import { type TileTexture, loadTileTextures, setTileAnisotropy } from '../render/tileTextures';
import type { AssetRegistry, Volume3D } from '../world/types';
import { TileMap } from '../world/TileMap';
import { TimeOfDay, wrapHour } from '../world/TimeOfDay';
import { type BuiltWorld, buildWorld, hideProp, tickPixelTiles } from '../world/WorldBuilder';
import { Rings } from './rings';
import { Bursts } from '../render/Bursts';
import { Combat, type CombatHost } from './combat/Combat';
import { type CombatConfig, MAX_FOES, SINGLE_MAX, Progression, SWING_TIME, combatFromDb, xpToNext } from './combat/config';
import type { Enemy } from './combat/Enemy';
import { BattleStage, type StageFighterSpec } from './battle/BattleStage';
import { FlatSprite } from './FlatSprite';
import type { CarriedWeapon } from './CharacterSprite';
import { enemyWeaponSprites } from './combat/weaponSprites';
import { TRANSITIONS, type TransitionKind, playTransition } from '../ui/BattleTransition';
import { CombatOverlay } from '../ui/CombatOverlay';
import { BattleScreen, type FighterView, type VictoryHero, type VictoryLoot, type VictoryReport } from '../ui/BattleScreen';
import { pickTroop, zoneAt } from '../world/zones';
import { type BattleEntry, type BattleHost, TurnBattle } from './battle/TurnBattle';
import { type BattleAddition, type BattleSpell, type Battler, type Opening, enemyAgility, weighted } from './battle/rules';
import { BATTLE_AILMENT, type BattleAilment, BattleStatus, turnsFromSeconds } from './battle/status';
import { HEAL_MP } from './party';
import {
  additionBonus, additionList, additionRank, additionToNext, changeClass, findAddition, findClass, findSpell, heroTrees, learnAddition,
  learnSpell, masterAddition, mergeStarting, rankName, spellAtRank, spellList, spellMaxRank, teachFromSkills, unlockClass,
} from './abilities';
import type { AbilityData, BattleWeather, Command, EventData } from '../world/types';
import { WEATHER_KINDS, type FieldUseKind, type GlobalTrigger, type GroupChatter, type JournalTabId, type RelationKind } from '../world/types';
import { MONSTERS } from '../art/placeholderArt';
import { enemyElement } from './combat/Combat';
import { AudioManager, type Sfx, setUiSound, uiSound } from '../audio/sfx';
import { impactOf } from './battle/impact';
import { Skills, UNTRAINED_DAMAGE, proficientWith, skillsData } from './skills';
import { playerConfig } from './stats';
import { SkillTreeScreen } from '../ui/SkillTreeScreen';
import { ControlsScreen } from '../ui/ControlsScreen';
import { CreditsScreen } from '../ui/CreditsScreen';
import { AdventureLog, AdventureLogScreen } from '../ui/AdventureLog';
import { Pickups } from './Pickups';
import { QuestBook, type QuestNews } from './quests';
import { QuestLogScreen, QuestTracker, rewardText } from '../ui/QuestLog';
import { creditSections } from './credits';
import { HudArranger } from '../ui/HudArranger';
import type { PropDef, SkillNode } from '../world/types';
import { EQUIP_SLOTS, type Ailment, type Database, type Dir, type EquipSlot, type HeroDef, type ItemDef, type MapData, type PropData, type PauseOption, type TitleOption, type WeatherKind } from '../world/types';
import { loadAssets, loadDatabase, loadMap } from '../shared/dataFiles';
import { applyTheme } from '../world/mapThemes';
import { loadCanvas } from '../shared/images';
import { builtinIcon, builtinIconName, tintCanvas as tintIcon } from '../art/itemIcons';
import { DEFAULT_BAG_SLOTS, Inventory, QUICK_SLOTS, alwaysFits } from './inventory';
import { forgeRules, forgedDef, upgradable, upgradeCost } from './forge';
import { typeChartHtml } from '../ui/typeChart';
import { affinity, affinityText, essenceItem, fuseCount, nextTier, type Affinity } from './essence';
import { ACTIVE_MEMBERS, Ally, MAX_PARTY, PartyState, fightingStyle, memberGainXp, spendMember, type AllyHost, type AllyNumbers, type MemberData } from './party';
import { FIELD_USE_NAMES, POWER_NAMES, carriedUse, itemColor, migrateItems, rarityOf } from '../world/items';
import { ATTRS, ATTR_INFO, ATTR_MAX, type Attr, type Attrs, type HeroTotals, accuracyOf, ailmentResist, enduranceHp, evasionOf, heroTotals, type StatGear, powerMultiplier, setAttrOrder, speedMultiplier } from './attributes';
import { classStatGear, gearKindName, gearSkill } from './classes';
import { type Rank, levelGains, ranksOf } from './statRanks';
import { AILMENTS, AILMENT_INFO, buffLabel, effectColor, effectName, type EffectId } from './status';
import { STATUS_WORD } from './combat/Combat';
import type { CharacterDef, EncounterPick, EnemyDef, HorseDef, LevelRange, OverworldCamera, TroopDef } from '../world/types';
import { atLevel, partyLevel, rollLevel } from './enemyLevels';
import { statusIconUrl } from '../art/statusIcons';
import { elementIconUrl } from '../art/elementIcons';
import { creation, heroBase, mainHero } from '../world/heroes';
import { CreationScreen } from '../ui/CreationScreen';
import { StatusScreen } from '../ui/StatusScreen';
import { SaveScreen } from '../ui/SaveScreen';
import { type EquipChoice, type EquipHost, EquipScreen, type EquipSlotId } from '../ui/EquipScreen';
import { InventoryScreen, type BagFilter, type InventoryActions } from '../ui/InventoryScreen';
import { EvolveScreen } from '../ui/EvolveScreen';
import { leanNow, patchLean, setLean, setView2D, setGroundYield } from '../render/lean';
import { DEFAULT_OVERWORLD_CAMERA } from './cameraDefaults';
import { RecordsScreen, type RecordSection } from '../ui/RecordsScreen';
import { BestiaryScreen, type BestiaryEntry } from '../ui/BestiaryScreen';
import { ELEMENT_COLORS, ELEMENT_LIST, ELEMENT_NAMES, elementResult } from './elements';
import type { Element as Elem } from '../world/types';
import { PartyScreen, type PartyAction, type PartyMemberView } from '../ui/PartyScreen';
import { PauseShell } from '../ui/PauseShell';
import { WorldMapScreen, type WorldMapMarker, type WorldMapPiece } from '../ui/WorldMapScreen';
import { drawMarker, markerKinds } from '../world/landmarks';
import { tintCanvas, tintObject } from '../render/tint';
import { SATURN_DIR, Sky } from '../render/Sky';
import { type ClimateConfig, WEATHER_TEMP, climateConfig, formatTemp, temperatureAt, weatherAt } from '../world/climate';
import { setWeatherLook } from '../render/season';
import { combatClimate } from './battle/rules';
import { MOON_NAMES, moonAge, moonIconSvg, moonPhase } from '../world/moon';
import { BubbleLayer } from '../ui/BubbleLayer';
import { AchievementsScreen, type AchievementView } from '../ui/AchievementsScreen';
import { AchievementToast } from '../ui/AchievementToast';
import { DevConsole, type ConsoleCommand } from '../ui/DevConsole';
import { AchievementBook, platformUnlock, progress as achProgress, type AchievementWorld } from './achievements';
import { Explored, type Neighbour, neighbourAt, neighbours, seamlessSides } from '../world/worldLayout';
import { averageColor, builtinTileColor, drawMapArt, propMark } from '../render/worldMapArt';
import { CharacterScreen } from '../ui/CharacterScreen';
import { tabSwap, type TabGroup } from '../ui/tabs';
import { ShopScreen, shopGoods } from '../ui/ShopScreen';
import { waitForPlaytest } from '../shared/playtest';
import { CharacterSprite, DIR_VECTOR } from './CharacterSprite';
import { eventCovers } from '../world/eventArea';
import { GameState, type RoostState } from './GameState';
import { GALLOP_COST, HORSE_SCALE, JUMP_COST, RECOVER_AT, REST_GAIN, SEAT, findHorse, horseList, stars } from './horses';
import { griffinSheet, horseSheet } from '../art/horseArt';
import type { PickSpot } from '../ui/WorldMapScreen';
import { type Action, BINDINGS_VERSION, DEFAULT_BINDINGS, Input } from './Input';
import { PlayerMotion, setBody2D } from './PlayerMotion';
import { PlayerStats, configFromDb } from './stats';
import { StatusBars, type HudWidget } from '../ui/StatusBars';
import { GameMenu, type MenuItem, slotLabel } from '../ui/GameMenu';
import { PAUSE_ICONS, PAUSE_OPTIONS, SYSTEM_OPTIONS, pauseLabel, titleLabel } from './menus';
import { DEFAULT_SETTINGS, type Settings, SettingsStore, TEXT_SPEEDS, exportSettings, importSettings, loadProjectSettings } from './settings';
import { type SaveData, type SavePoint, SAVE_VERSION, SaveStore, type SlotId, formatPlayTime } from './saves';
import { toonWaterTime } from '../render/waterEdge';
import type { EventBubble } from '../ui/BubbleLayer';
import { type Talker, chatterSeconds, linesFor, pickChatter } from './chatter';
import { campLine, nextGroup } from './campTalk';
import { daysUntil, realDayKey, setGenderLooks, rpFields, rpMatch, rpValue } from './roleplay';
import { datesLabel } from '../world/dates';
import { loadWornParts, recolorPairs, wornPart } from '../world/wornParts';
import { customSrcs } from '../world/wornCustom';
import { relColor, REL_BATTLE_CAP, relAmount, relClamp, relKey, relLabel, relLove, relStart } from './relations';
import { inDates } from '../world/dates';
import { FULL_REST_HOURS, GOOD_INFO, type GoodKind, type GoodState, goodFromPoints, goodHours, hoursLabel, nextGood, restShare } from './rest';
import { RestScreen } from '../ui/RestScreen';
import { LockpickScreen } from '../ui/LockpickScreen';
import { TimePicker } from '../ui/TimePicker';
import { applyIconFx, hasIconFx } from '../world/iconFx';
import { Footprints } from '../render/footprints';
import { Puddles, type PuddleSpot } from '../render/puddles';
import { TutorialPopup } from '../ui/TutorialPopup';
import type { ChatterTrigger } from '../world/types';
import { type RestSpot, isSafeMark, safeAt, shareSpots, zoneSpots } from '../world/safeZones';
import { type BodyPlace, type BodySettings, type BodyState, type WeatherState, WEATHER_STATE_INFO, bodySettings, hurts, slowOf, soothe, stepBody, weatherState } from './body';
import { modelStyle } from '../render/characterModel';
import { alignFootProps, blockedTiles, footTiles, propCovers, stepOf } from '../world/props';
import { propKey } from './GameState';
import { TouchControls } from '../ui/TouchControls';

const CAMERA_OFFSET = new THREE.Vector3(0, 10.5, 11.5);

/** The Inventory's tabs: the bag (all items, then by kind), then Equipment. */
const INVENTORY_TABS: { id: BagFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'consumable', label: 'Consumables' }, { id: 'gear', label: 'Gear' }, { id: 'shard', label: 'Shards' }, { id: 'material', label: 'Materials' },
  { id: 'key', label: 'Key items' },
];
/** The key the shared outdoor weather is kept under (events' changes, in the save). */
const WORLD_WEATHER = '@world';
/** Settings → Window colour, Text colour and Frame colour choices ('': the theme's own). */
const WINDOW_COLORS: [string, string][] = [['', 'The theme’s'], ['#f8f8f0', 'White'], ['#f4ecd0', 'Cream'], ['#dce8f8', 'Pale blue'], ['#e0f0d8', 'Pale green'], ['#f8e0e8', 'Pale pink'], ['#9aa0a8', 'Grey'], ['#1c2440', 'Navy'], ['#1c3424', 'Forest'], ['#3a1820', 'Wine'], ['#101014', 'Black']];
const TEXT_COLORS: [string, string][] = [['', 'The theme’s'], ['#181818', 'Black'], ['#404048', 'Dark grey'], ['#1c2a58', 'Navy'], ['#4a2e18', 'Brown'], ['#f4f4f0', 'White'], ['#f3ead8', 'Cream'], ['#ffd27a', 'Gold']];
const FRAME_COLORS: [string, string][] = [['', 'The theme’s'], ['#d83828', 'Red'], ['#e8862a', 'Orange'], ['#e0b040', 'Gold'], ['#3aa850', 'Green'], ['#2aa8a0', 'Teal'], ['#3a70e0', 'Blue'], ['#8a50d8', 'Purple'], ['#e050a0', 'Pink']];
/** The Journal's tabs. */
const JOURNAL_TABS: [JournalTabId, string][] = [['quests', 'Quests'], ['log', 'Adventure Log'], ['bestiary', 'Bestiary'], ['types', 'Type Chart'], ['tutorials', 'Tutorials'], ['records', 'Records'], ['achievements', 'Achievements']];
/** The Journal tabs' little pictures (Update 130). */
const JOURNAL_ICONS: Record<JournalTabId, string> = {
  quests: '<svg viewBox="0 0 16 16"><path d="M4 2.5h7.5a1.5 1.5 0 0 1 1.5 1.5v9.5H5.5A1.5 1.5 0 0 1 4 12V2.5zM4 12a1.5 1.5 0 0 0-1.5 1.5"/><path d="M6.5 6h4M6.5 8.5h4"/></svg>',
  log: '<svg viewBox="0 0 16 16"><path d="M2.5 3.5c2-1 4-1 5.5.5 1.5-1.5 3.5-1.5 5.5-.5v9c-2-1-4-1-5.5.5-1.5-1.5-3.5-1.5-5.5-.5z"/><path d="M8 4v9"/></svg>',
  bestiary: '<svg viewBox="0 0 16 16"><circle cx="8" cy="10" r="3"/><circle cx="3.5" cy="6.5" r="1.4"/><circle cx="12.5" cy="6.5" r="1.4"/><circle cx="6" cy="3.5" r="1.3"/><circle cx="10" cy="3.5" r="1.3"/></svg>',
  types: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M2.5 6.2h11M2.5 9.8h11M6.2 2.5v11M9.8 2.5v11"/></svg>',
  tutorials: '<svg viewBox="0 0 16 16"><path d="M5.5 10.5a4 4 0 1 1 5 0V12h-5z"/><path d="M6 14h4"/></svg>',
  records: '<svg viewBox="0 0 16 16"><path d="M4.5 2.5h7v3a3.5 3.5 0 0 1-7 0z"/><path d="M4.5 3.5H2.5a2 2 0 0 0 2 2.5M11.5 3.5h2a2 2 0 0 1-2 2.5M8 9v2.5M5.5 13.5h5"/></svg>',
  achievements: '<svg viewBox="0 0 16 16"><circle cx="8" cy="6" r="3.5"/><path d="M5.8 8.8L4.5 14l3.5-1.8 3.5 1.8-1.3-5.2"/></svg>',
};
/** Settings' pictures (Update 141): one per page, beside each setting. */
const SET_ICONS = {
  picture: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/></svg>',
  hud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 8h6M15 8h3M6 16h3"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h4l5-4v12l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  controls: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.4 1.8L14.5 14h-5l-1.1 1.8A3 3 0 0 1 3 14v-2a4 4 0 0 1 4-4z"/><path d="M8 11v3M6.5 12.5h3M16 12h.01M18 13.5h.01"/></svg>',
  gameplay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>',
  restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/></svg>',
  load: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h6l2 2h10v10H3z"/><path d="M12 12v5M9.5 14.5L12 17l2.5-2.5"/></svg>',
  quit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/></svg>',
  backpack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
};
const INTERACT_RANGE = 1.3;
/** Seconds B (or Esc) is held while riding to get off the horse (Update 142). */
const DISMOUNT_HOLD = 0.45;

type Start = { x: number; z: number; y?: number; dir?: Dir };

/** A neighbouring map drawn beside this one (a Seamless side), ready to walk into. */
interface Preview { name: string; n: Neighbour; group: THREE.Group; map: TileMap; built: BuiltWorld; data: MapData; origin: THREE.Vector2 }

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.5, 200);
  private readonly fog = new THREE.Fog(0x000000, 22, 50);
  private readonly post: PostFX;
  private readonly input = new Input();
  private sprites!: SpriteLibrary;
  private tiles!: TileCatalog;
  private tileTextures = new Map<string, TileTexture>();
  private readonly state = new GameState();
  private readonly clock = new THREE.Clock();
  private readonly small: boolean;

  private map!: TileMap;
  private db!: Database;
  private time!: TimeOfDay;
  private lights!: Lights;
  private fireflies!: Fireflies;
  private waterNormals!: THREE.Texture;
  private waterFlows: WaterFlow[] = [];
  private ripples!: Ripples;
  private readonly ripAt = new Map<object, { x: number; z: number }>();
  /** This map's props standing in water (for their ripples). */
  private wetProps: { prop: PropData; y: number; size: number; color: number; ring?: THREE.Mesh }[] = [];
  /** Ripples on lava and goo glow in their colour; on water they're white. */
  private rippleColor(style: number): number {
    const st = waterStyle(this.mapData, style);
    return (st.glow ?? 0) > 0.2 ? new THREE.Color(st.color).lerp(new THREE.Color('#ffffff'), 0.45).getHex() : 0xffffff;
  }
  /** Tiles whose props set the footsteps (bridges, rugs, wooden floors), with that sound, and whether it's a deck. */
  private walkSounds = new Map<number, { sound: string; deck: boolean }>();
  private findWetProps(): void {
    this.wetProps = [];
    this.walkSounds.clear();
    for (const prop of this.mapData.props) {
      const d = this.sprites.def(prop.type);
      const sound = d?.walkSound ?? (d?.deck ? (d.deck.style === 'stone' ? 'stone' : 'wood') : undefined);
      if (!d || !sound) continue;
      const tiles = d.foot ? footTiles(d, prop.x, prop.z, prop.s ?? 1) : [[Math.floor(prop.x), Math.floor(prop.z - 0.01)] as [number, number]];
      for (const [x, z] of tiles) if (this.map.inMap(x, z)) this.walkSounds.set(z * this.map.w + x, { sound, deck: !!d.deck });
    }
    for (const prop of this.mapData.props) {
      const d = this.sprites.def(prop.type);
      // Bridges and platforms stand over the water, not in it.
      if (!d || d.wall || d.deck || d.h < 0.25) continue;
      const w = this.map.waterAt(Math.floor(prop.x), Math.floor(prop.z - 0.01));
      if (!w) continue;
      const size = Math.max(0.7, Math.min(2.4, d.w * (prop.s ?? 1) * 0.9));
      const st = waterStyle(this.mapData, w.style);
      // Toon water: a dark ring hugging the rock, like the handheld games.
      let ring: THREE.Mesh | undefined;
      if (isToonWater(st)) {
        const c = new THREE.Color(st.color || '#3f86b0');
        c.multiplyScalar(0.62);
        ring = new THREE.Mesh(Game.ringGeo, new THREE.MeshLambertMaterial({ map: Game.ringTex(), color: c, transparent: true, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(prop.x, w.surface + 0.015, prop.z - 0.15);
        ring.scale.setScalar(size * 0.95);
        ring.renderOrder = 2;
        this.level?.add(ring);
      }
      this.wetProps.push({ prop, y: w.surface, size, color: this.rippleColor(w.style), ring });
    }
  }
  private static readonly ringGeo = new THREE.PlaneGeometry(1, 1);
  private static ringTexCache: THREE.Texture | null = null;
  /** The ring round a rock in toon water: pixel art, a dark band fading out at its rim (tinted by the material). */
  private static ringTex(): THREE.Texture {
    if (Game.ringTexCache) return Game.ringTexCache;
    const N = 32, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d')!;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - N / 2, (y + 0.5 - N / 2) * 1.15);
      if (r >= 9.5 && r < 13) g.fillStyle = 'rgba(255,255,255,0.9)';
      else if (r >= 13 && r < 14.5) g.fillStyle = 'rgba(255,255,255,0.35)';
      else continue;
      g.fillRect(x, y, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return (Game.ringTexCache = t);
  }
  private readonly waterFlow = new THREE.Vector2();
  private player!: CharacterSprite;
  private motion!: PlayerMotion;
  private stats!: PlayerStats;
  private hud!: StatusBars;
  /** Where the player comes back after losing all health. */
  private dying = 0;
  /** Objects of the current map (removed as a whole on a transfer). */
  private level: THREE.Group | null = null;
  /** The map's built ground, walls, water and props (inside the level): kept as a neighbour when walking off a seamless edge. */
  private world: { group: THREE.Group; built: BuiltWorld; origin: THREE.Vector2 } | null = null;
  private mapName = '';
  /** Maps handed over by the editor in a playtest. */
  private handedMaps: Record<string, MapData> | null = null;
  private transfer: { name: string; to: Start; fade: 'black' | 'white' | 'none'; phase: 'out' | 'load' | 'busy'; before?: () => void; after?: () => void; autosave?: boolean; fresh?: boolean; slow?: boolean } | null = null;
  private menu!: GameMenu;
  private saves!: SaveStore;
  private playTime = 0;
  /** The last respawn point used (a campfire, say); null until one is used. */
  private respawnPoint: SavePoint | null = null;
  private settingsStore!: SettingsStore;
  private settings: Settings = { ...DEFAULT_SETTINGS };
  /** The title screen is showing. */
  private onTitle = false;
  private mapData!: MapData;
  /** Update 154: on a 3D map, its scene, the hero's body, the camera and the way the hero is heading. */
  private w3: { scene: Scene3D; body: Body3D; cam: Camera3D; heading: number; moving?: [number, number] | null } | null = null;
  private inventory!: Inventory;
  private bag!: InventoryScreen;
  private shop!: ShopScreen;
  private readonly items = new Map<string, ItemDef>();
  private readonly icons = new Map<string, string>();
  private readonly iconCanvases = new Map<string, HTMLCanvasElement>();
  /** Water walking has reached water since it was switched on (stepping back onto land then ends it). */
  private tideOnWater = false;
  /** The worn magic ring and its power (light, water walking, cutting). */
  private rings!: Rings;
  /** Where each prop on this map is drawn, for cutting them down. */
  private propSlots: BuiltWorld['props'] = new Map();
  /** Buildings on this map, faded while they hide the hero. */
  private buildings: BuiltWorld['buildings'] = [];
  /** Props cut on this visit that grow back (forgotten when the player leaves the map). */
  private readonly cutThisVisit = new Set<string>();
  private readonly bursts = new Bursts();
  /** Footprints in snow and sand, and puddles after rain (Update 123); made with the scene. */
  private prints!: Footprints;
  private puddles!: Puddles;
  /** Each party member's distance walked since their last print, and which foot is next. */
  private readonly printWalk = new Map<object, { x: number; z: number; d: number; left: boolean }>();
  private readonly combat = new Combat();
  private overlay!: CombatOverlay;
  /** Turn-based battles (Database → Combat → Battle system: Turn-based). */
  private battleScreen!: BattleScreen;
  private battle!: TurnBattle;
  /** Frames since the battle screen opened (the world behind stops being redrawn after a few). */
  private battleFrames = 0;
  /** A battle on a battle map: its 3D stage (its own scene), the map's lights and water, and the field's lighting to go back to. */
  private stage: { stage: BattleStage; lights: Lights; built: BuiltWorld; env: TimeOfDay['environment']; map: TileMap; look: THREE.Vector3; /** The battle map's own music (its battle music, else its music). */ music?: string } | null = null;
  /** Battle maps loaded so far (by file name). */
  private readonly battleMaps = new Map<string, MapData>();
  /** A battle map is loading for a battle about to start. */
  private battlePending = false;
  private hemi!: THREE.HemisphereLight;
  /** Where a project file is (in a playtest, the editor's copy). */
  private resolveFile: (path: string) => string = (p) => p;
  /** Battle sound taking over from the map's: a tune (the victory theme), or silence while fading in or out. */
  private battleSound: { music: string; hush?: boolean; fade: number; next?: { at: number; music: string } } | null = null;
  /** Leaving a battle: once the screen is dark, `done` closes it and the field fades back in. */
  private outro: { done: () => void } | null = null;
  /** Seconds before another battle can start (just won or ran from one). */
  private battleGrace = 0;
  /** Random encounters: tiles walked since the last battle, and how far until the next. */
  private encounterWalked = 0;
  private encounterAt = 0;
  private encounterFrom: { x: number; z: number } | null = null;
  /** Page commands of enemies beaten in a battle, run once its screen closes. */
  private battleCommands: GameEvent[] = [];
  private combatCfg!: CombatConfig;
  /** The hero's level, experience and skill points. */
  private progress!: Progression;
  private skills!: Skills;
  /** The Party skill tree's ranks, shared by everyone (counted in the hero's and every member's skills). */
  private partySkills!: Skills;
  private skillScreen!: SkillTreeScreen;
  private statusScreen!: StatusScreen;
  private saveScreen!: SaveScreen;
  private creation!: CreationScreen;
  private equipScreen!: EquipScreen;
  private restScreen!: RestScreen;
  private lockpick!: LockpickScreen;
  private timePicker!: TimePicker;
  private tutorialPop!: TutorialPopup;
  private partyScreen!: PartyScreen;
  private pauseShell!: PauseShell;
  /** Where the hero stands in the lineup: 0 first; past the first three, on the bench. */
  private heroAt = 0;
  private worldMap!: WorldMapScreen;
  private bubbles!: BubbleLayer;
  private achScreen!: AchievementsScreen;
  private achToast!: AchievementToast;
  private achBook!: AchievementBook;
  private devConsole!: DevConsole;
  /** Started from the editor's ▶ Playtest. */
  private isPlaytest = false;
  /** Maps the hero has been to, and the ground seen in each (the world map's fog; kept in saves). */
  private visited = new Set<string>();
  private explored = new Map<string, Explored>();
  /** The console's cheats (not saved; using one marks the game as cheated). */
  private readonly cheats = { deathless: false, deathlessParty: false, infiniteGold: false, ghost: false, speed: 1 };
  private charScreen!: CharacterScreen;
  private controls!: ControlsScreen;
  private creditsScreen!: CreditsScreen;
  /** The adventure log (feed on screen, history in the pause menu). */
  private log!: AdventureLog;
  private logScreen!: AdventureLogScreen;
  private recordsScreen!: RecordsScreen;
  private evolve!: EvolveScreen;
  private bestiaryScreen!: BestiaryScreen;
  /** How long the player has pushed into a touch event they can't walk onto. */
  private bumpT = 0;
  /** Party members (saved) and their figures on this map, and the hero's trail they follow. */
  private readonly party = new PartyState();
  private allies: Ally[] = [];
  private spotTimer = 0;
  /** Waterfalls on this map: one per run (sound), and every foot (spray). */
  private waterfalls: { x: number; z: number; y: number; top: number }[] = [];
  private fallFeet: { x: number; z: number; y: number; top: number }[] = [];
  /** Party members fighting on the map (not the hero walking behind someone else leading). */
  private get fighters(): Ally[] { return this.allies.filter((a) => !a.passive); }
  private trail: { x: number; z: number }[] = [];
  private jumpMarks: { id: number; x: number; z: number }[] = [];
  private jumpCount = 0;
  private quests!: QuestBook;
  private questScreen!: QuestLogScreen;
  private tracker!: QuestTracker;
  /** A "Quest" command marked quiet: no banner. */
  private questQuiet = false;
  /** EXP orbs, gold and items lying where enemies fell. */
  private pickups: Pickups | null = null;
  /** EXP absorbed in the last moment (one "+N EXP" for a burst of orbs), and time since the last orb. */
  private xpBurst = 0;
  private xpBurstT = 0;
  /** Gold picked up in the same burst, logged as one line. */
  private goldBurst = 0;
  private arranger!: HudArranger;
  private audio!: AudioManager;
  /** Music an event chose, until the next map change (undefined: the map's own). */
  private musicOverride: string | undefined;
  private ambienceOverride: string | undefined;
  /** Seconds since an enemy was last hunting the hero (for battle music). */
  private calmFor = 99;
  private wasSwimming = false;
  private touch!: TouchControls;
  /** Crouch amount for crawling (0 standing … 1 crawling), eased. */
  private crouch = 0;
  private blockedFor = 0;
  /** After respawning: fade in once the new map is ready. */
  private transferFadeIn = false;
  /** A white transfer finished: switch the fade colour back to black once its fade-in is done. */
  private fadeColorReset = false;
  private events: GameEvent[] = [];
  private interpreter!: Interpreter;
  private message!: MessageWindow;
  private debug!: DebugPanel;
  private sun!: THREE.DirectionalLight;
  private cursor!: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  private elapsed = 0;
  private readonly camTarget = new THREE.Vector3();
  private readonly weather = new Weather();
  private readonly atmosphere = new Atmosphere();
  private readonly ssao: SSAO;
  private readonly bufferSize = new THREE.Vector2();
  private readonly sunUp = new THREE.Vector3();
  /** Set on entering a map: the weather starts (in full) once the camera is in place. */
  private weatherPending = false;
  private moveTarget: { x: number; z: number } | null = null;
  private pendingEvent: GameEvent | null = null;
  private lastTile = { x: -1, z: -1 };
  private fade = { from: 0, to: 0, t: 1, duration: 1 };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly ui: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    setTileAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    this.small = Math.min(innerWidth, innerHeight) < 640 || /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.post = new PostFX(this.renderer);
    this.ssao = new SSAO(this.renderer);
    this.scene.fog = this.fog;
    this.scene.background = this.fog.color;
  }

  async start(): Promise<void> {
    // ?playtest  → the map the editor is working on (saved or not)
    // ?map=name  → a specific map file; otherwise the database's start map
    const params = new URLSearchParams(location.search);
    const pt = params.has('playtest') ? await waitForPlaytest(params.get('playtest') || null) : null;
    if (params.has('playtest') && !pt) throw new Error('No playtest data found. Start the playtest from the editor’s ▶ Playtest button.');
    let mapName: string;
    let mapData: MapData;
    let start: Start | null;
    let resolve = (path: string) => path;
    let assets: AssetRegistry;
    if (pt) {
      this.db = pt.db;
      mapName = pt.mapName;
      mapData = pt.map;
      start = pt.start ?? null;
      assets = pt.assets;
      this.handedMaps = { ...(pt.maps ?? {}), [pt.mapName]: pt.map };
      // Images handed over by the editor; anything else loads from the project as usual.
      const urls = new Map(Object.entries(pt.files ?? {}).map(([path, blob]) => [path, URL.createObjectURL(blob)]));
      resolve = (path) => urls.get(path) ?? path;
    } else {
      if (location.protocol === 'file:') throw new Error('Open the game from the editor’s ▶ Playtest button. Opened as a file, it plays the map the editor hands it.');
      this.db = await loadDatabase();
      mapName = params.get('map') ?? this.db.startMap;
      start = mapName === this.db.startMap ? this.db.start : null;
      // A map of its own behind the title.
      const tb = this.db.menus?.titleBackground;
      if (!params.has('map') && tb?.kind === 'map' && tb.map) { mapName = tb.map; start = { x: tb.x ?? 0.5, z: tb.z ?? 0.5 }; }
      mapData = await loadMap(mapName);
      assets = await loadAssets();
    }
    this.resolveFile = resolve;
    setAttrOrder(this.db.statOrder);
    migrateMap(mapData);
    // What the map leaves to its theme (Database → Map themes). A copy, so a map handed over by the editor isn't changed.
    if (mapData.theme) mapData = applyTheme(JSON.parse(JSON.stringify(mapData)) as MapData, this.db.mapThemes);
    migrateItems(this.db);
    setTextColors(this.db.textColors);
    this.sprites = new SpriteLibrary(new PropCatalog(assets));
    alignFootProps(mapData, (t) => this.sprites.def(t));
    this.tiles = new TileCatalog(assets);
    // Update 153: the first map's 3D model ground.
    if (mapData.groundModel?.src) {
      try { (mapData as WithGround).__ground = await loadGround(mapData, resolve(mapData.groundModel.src)); }
      catch (e) { console.warn(`Its 3D model “${mapData.groundModel.src}” couldn’t be read`, e); }
    }
    if (mapData.scene3d?.src) {
      try { (mapData as With3D).__scene3d = await load3D(mapData, resolve(mapData.scene3d.src), (n) => this.terrainPicture(n)); }
      catch (e) { console.warn(`Its 3D scene “${mapData.scene3d.src}” couldn’t be read`, e); }
    }
    await this.sprites.preload(resolve);
    this.sprites.modelStyle = modelStyle(this.db);
    await this.sprites.preloadCharacters(this.db.characters, resolve);
    // Built-in clothing (Update 128): the parts list, and the sheets items use.
    await loadWornParts(async (p) => { const r = await fetch(resolve(p)); if (!r.ok) throw new Error(String(r.status)); return r.text(); });
    const builtin = (this.db.items ?? []).flatMap((d) => (['top', 'bottom', 'accessory'] as const).flatMap((k) => { const p = wornPart(d.worn?.[k]?.part); return p ? [...Object.values(p.sheets), ...Object.values(p.under ?? {})] : []; })) as string[];
    // Custom worn pictures (Update 134): the PNGs (icons are drawn by the engine).
    for (const d of this.db.items ?? []) builtin.push(...customSrcs(d.worn?.customPics).filter((p) => !p.startsWith('icon:')));
    await this.sprites.preloadWorn(this.db.items ?? [], resolve, builtin);
    await this.sprites.preloadFlats((this.db.enemies ?? []).map((e) => e.look.image).filter((p): p is string => !!p), resolve);
    // LPC weapon sprites used by items and enemies (people default to a sword or a bow).
    await this.sprites.preloadWeapons(usedWeaponSprites(this.db), resolve, this.db.weaponSprites ?? [],
      (this.db.items ?? []).filter((d) => d.icon === 'sprite').map((d) => itemWeaponSprite(d)));
    this.tileTextures = await loadTileTextures(this.tiles, resolve, this.sprites.problems);
    for (const p of this.sprites.problems) console.warn(p);
    await this.loadItemIcons(resolve);
    this.audio = new AudioManager(resolve);
    this.audio.overrides = { ...(this.db.audio?.sfx ?? {}) } as Partial<Record<Sfx, string>>;
    this.audio.setStyle(this.db.audio?.style);
    // Testing the chiptune (console: audio_chiptune): which built-in theme stands in for a music file.
    this.audio.chipMusic = (src) => {
      const au = this.db.audio;
      if (this.onTitle || src === au?.titleMusic) return 'builtin:title';
      if (src === au?.victoryMusic) return 'builtin:victory';
      if (this.battle.active || src === au?.battleMusic || src === this.mapData?.battleMusic) return 'builtin:battle';
      if (this.time.environment === 'dark') return 'builtin:cave';
      return this.time.environment === 'outdoor' && this.time.night > 0.5 ? 'builtin:night' : 'builtin:field';
    };
    setUiSound((s) => this.audio.play(s));
    this.isPlaytest = !!pt;
    this.saves = new SaveStore(this.db.title || 'game', !!pt);
    this.settingsStore = new SettingsStore(this.db.title || 'game', !!pt);
    // The game's own default settings (controls, HUD…), for players who haven't changed any yet.
    this.settingsStore.projectDefaults = await loadProjectSettings();
    this.settings = this.settingsStore.load();
    this.setup();
    // A playtest that skips the title starts as a new game would: with the starting party.
    const preview = pt?.battle?.enemies.length ? pt.battle : null;
    if (pt && (this.db.menus?.skipTitleInPlaytest || preview)) this.startParty();
    this.enterMap(mapName, mapData, start);
    this.applySettings();
    // The title screen, with the map behind it (playtests can skip it: Database → Title & menus).
    if (!(pt && (this.db.menus?.skipTitleInPlaytest || preview))) this.openTitle();
    // Combat preview: a full party (the starting one, topped up from the Database's heroes), then straight into battle.
    if (preview) {
      for (const hd of this.db.heroes ?? []) { if (this.members().length >= 2) break; if (hd.id !== mainHero(this.db).id && !this.members().some((m) => m.def.id === hd.id)) this.changeParty('add', hd.id); }
      const defs = new Map((this.db.enemies ?? []).map((e) => [e.id, e]));
      const list = preview.enemies.map((id) => defs.get(id)).filter((d): d is EnemyDef => !!d).slice(0, MAX_FOES).map((def) => ({ def, hp: def.hp, enemy: null }));
      setTimeout(() => this.startBattle(list, 'normal', { canRun: true, stage: preview.map || undefined }), 900);
    }
    this.bindPointer();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Fade in from black on start.
    this.post.fade = 1;
    this.fade = { from: 1, to: 0, t: 0, duration: 1.2 };
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /* ------------------------------------------------------------------ setup */

  /** Everything that lasts the whole game: sun and sky, the player, stats, UI, the event interpreter. */
  private setup(): void {
    const hemi = (this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5));
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.castShadow = true;
    const sm = this.small ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    Object.assign(this.sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 80 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.time = new TimeOfDay(this.db.startHour, this.sun, hemi, this.fog);
    this.time.rate = this.db.time?.rate ?? 20;
    this.time.darkness = this.db.time?.darkness ?? 0.85;

    const hero = this.db.characters[this.db.player];
    this.player = new CharacterSprite(this.sprites, this.sprites.forCharacter(hero), 'down');
    this.scene.add(this.player.mesh);
    this.state.initAbilities(this.db.abilities);
    this.stats = new PlayerStats(configFromDb(this.db));


    this.cursor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: makeTexture(tileCursor()), transparent: true, depthWrite: false, opacity: 0.85 }),
    );
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.prints = new Footprints(this.scene);
    this.puddles = new Puddles(this.scene);

    this.message = new MessageWindow(this.ui, this.input);
    this.message.setStyles(this.db.messageStyles);
    setGenderLooks(this.db.genders);
    this.state.env = { temp: () => this.temperature(), weather: () => this.weather.kind, heroHas: (hero, what) => this.heroHas(hero, what), relation: (a, b) => this.relGet(a, b), rp: (hero, field) => rpValue(this.db, this.heroByIdOrName(hero), field), rpDays: (hero, field) => daysUntil(rpValue(this.db, this.heroByIdOrName(hero), field)) };
    // Skill tree nodes locked until a quest is done, a key item is carried or a switch is on (Update 113).
    Skills.locked = (n) => {
      const nd = n.needs;
      if (!nd) return null;
      if (nd.quest && this.quests?.status(nd.quest) !== 'done') return `Needs the quest “${(this.db.quests ?? []).find((q) => q.id === nd.quest)?.name ?? nd.quest}” done`;
      if (nd.item && !(this.inventory?.count(nd.item) > 0)) return `Needs ${this.items.get(nd.item)?.name ?? nd.item}`;
      if (nd.switch && !this.state.getSwitch(nd.switch)) return 'Locked for now';
      return null;
    };
    this.message.tick = () => { if (this.settings.textTicks !== false) this.audio.play('textTick', undefined, undefined, 0.8); };
    this.touch = new TouchControls(this.ui, this.input);
    this.hud = new StatusBars(this.ui);
    this.rings = new Rings(this.scene);
    this.ripples = new Ripples(this.scene);
    this.overlay = new CombatOverlay(this.ui);
    this.overlay.setProjector(this.projector);
    this.battleScreen = new BattleScreen(this.ui, this.input);
    this.battle = new TurnBattle(this.battleScreen, this.battleHost());
    this.battleScreen.onSound = (n) => this.audio.play(n);
    this.combatCfg = combatFromDb(this.db);
    this.progress = new Progression(this.combatCfg);
    this.progress.growth = () => levelGains(this.heroRanks(0));
    this.syncSkills();
    // The skill tree of whoever is chosen in the Party menu (the hero, or a party member's own).
    const skMember = () => (this.skillHero ? this.members()[this.skillHero - 1] : undefined);
    this.skillScreen = new SkillTreeScreen(this.ui, this.input, {
      otherHero: (d) => { const o = this.lineupWhos(); if (o.length < 2) return false; const k = Math.max(0, o.indexOf(this.skillHero)); this.skillHero = o[(k + d + o.length) % o.length]; return true; },
      skills: () => { const m = skMember(); return m ? this.memberSkills(m.data) : this.skills; },
      points: () => { const m = skMember(); return m ? m.data.skillPoints ?? 0 : this.progress.points; },
      level: () => { const m = skMember(); return m ? m.data.level : this.progress.level; },
      who: () => { const m = skMember(); return m ? m.def.name : mainHero(this.db).name; },
      learn: (n) => {
        const m = skMember();
        if (!m) { this.learnSkill(n); return; }
        const sk = this.memberSkills(m.data);
        m.data.skillPoints = Math.max(0, (m.data.skillPoints ?? 0) - sk.take(n));
        const got = teachFromSkills(this.db, (m.data.abilities ??= {}), sk.ranks, sk.data.nodes);
        this.audio.play('skill');
        this.menu.notice(`${m.def.name} learned ${n.name}${got.length ? `: ${got.join(', ')}` : ''}`);
        for (const g of got) this.log.add(`${m.def.name} learned ${g}`, 'level');
      },
      trees: () => { const m = skMember(); return heroTrees(this.db, m ? m.data.abilities ?? {} : this.progress.abilities); },
      teaches: (n) => {
        const sp = findSpell(this.db, n.teachesSpell), ad = findAddition(this.db, n.teachesAddition), out: string[] = [];
        if (sp) {
          const from = Math.max(1, n.spellRankFrom ?? 1), to = Math.min(spellMaxRank(sp), from + Math.max(1, n.ranks ?? 1) - 1);
          out.push(`Teaches the spell ${rankName(sp.name, from)}${to > from ? ` (up to ${rankName(sp.name, to)} with more ranks)` : ''}`);
        }
        if (ad) out.push(`Teaches the Addition ${ad.name} (${ad.strikes.length} strike${ad.strikes.length === 1 ? '' : 's'})`);
        if (n.trains?.length) out.push(`Trains with ${n.trains.map((k) => gearKindName(k, this.db)).join(', ')}`);
        return out.length ? out.join('. ') : null;
      },
      item: (id) => { const d = this.items.get(id); return d ? { name: d.name, color: itemColor(d) } : undefined; },
      party: () => (this.partySkills.data.trees.some((t) => t.shared) ? { skills: this.partySkills, points: this.progress.sharedPoints, level: this.progress.level, learn: (n) => this.learnPartySkill(n) } : null),
    });
    this.state.fireText = () => this.fireLeftText();
    this.statusScreen = new StatusScreen(this.ui, this.input, {
      count: () => this.members().length + 1,
      name: (h) => (h ? this.members()[h - 1].def.name : mainHero(this.db).name),
      level: (h) => (h ? this.members()[h - 1].data.level : this.progress.level),
      xp: (h) => {
        const m = h ? this.members()[h - 1]?.data : null;
        if (!m) return { have: this.progress.xp, next: this.progress.maxed ? null : this.progress.toNext };
        const next = xpToNext(this.combatCfg, m.level);
        return { have: m.xp, next: next || null };
      },
      gauges: (h) => {
        const m = h ? this.members()[h - 1] : null;
        if (!m) return { hp: [this.stats.hp, this.stats.cfg.max.hp], mp: [this.stats.mp, this.stats.cfg.max.mp], sp: [this.stats.sp, this.stats.cfg.max.sp] };
        const mx = this.allyNumbers(m.data, m.def).max;
        return { hp: [m.data.hp, mx.hp], mp: [m.data.mp, mx.mp], sp: [m.data.sp, mx.sp] };
      },
      own: (h) => (h ? this.members()[h - 1].data.stats : this.progress.stats),
      points: (h) => (h ? this.members()[h - 1].data.statPoints : this.progress.statPoints),
      totals: (h, extra) => {
        const m = h ? this.members()[h - 1] : null;
        const own = { ...(m ? m.data.stats : this.progress.stats) };
        for (const k of ATTRS) own[k] += extra[k];
        return m ? heroTotals(own, this.statGear(m.data.equip, m.data.abilities, this.memberSkills(m.data)), (k) => this.memberSkills(m.data).get(k) + this.goodBonus(m.data.id, k)) : heroTotals(own, this.statGear(), (k) => (this.skills?.get(k) ?? 0) + this.combat.heroStatus.buff(k) + this.goodBonus(mainHero(this.db).id, k));
      },
      spend: (h, add) => (h ? spendMember(this.members()[h - 1].data, add) : this.progress.spend(add)),
    });
    this.creation = new CreationScreen(this.ui, this.input);
    this.equipScreen = new EquipScreen(this.ui, this.input, this.equipHost());
    this.tutorialPop = new TutorialPopup(this.ui, this.input);
    this.ui.appendChild(this.speedLines);
    this.timePicker = new TimePicker(this.ui, this.input);
    this.lockpick = new LockpickScreen(this.ui, this.input, {
      picks: () => { const ids = [...this.items.values()].filter((d) => d.lockpick).map((d) => d.id); return ids.length ? ids.reduce((n, id) => n + this.inventory.count(id), 0) : null; },
      breakPick: () => { const i = this.inventory.slots.findIndex((s) => !!s && !!this.items.get(s.id)?.lockpick); if (i >= 0) this.inventory.removeAt(i, 1); },
      sound: (n) => this.audio.play(n),
      rumble: (s, ms) => this.input.rumble(s, ms),
    });
    this.restScreen = new RestScreen(this.ui, this.input, {
      party: () => this.bodyParty().map((p, who) => {
        const m = who ? this.members()[who - 1] : null, mx = m ? this.allyNumbers(m.data, m.def).max : null;
        return { name: p.name, face: who ? (m!.def.face ? this.resolveFile(m!.def.face) : this.memberPortrait(m!.def)) : this.portraitUrl ?? '', hp: [Math.max(0, p.hp), p.maxHp], mp: m ? [m.data.mp, mx!.mp] : [this.stats.mp, this.stats.cfg.max.mp], down: p.hp <= 0 };
      }),
      supplies: () => {
        const seen = new Map<string, number>();
        for (const st of this.inventory.slots) if (st && !seen.has(st.id)) { const d = this.items.get(st.id); if (d?.camp && d.camp > 0) seen.set(st.id, this.inventory.count(st.id)); }
        return [...seen].map(([id, count]) => { const d = this.items.get(id)!; return { id, name: d.name, icon: this.itemIcon(id), camp: d.camp ?? 0, count, price: d.price ?? 1 }; });
      },
    });
    // A hero's Status page: who they are, ailments, their numbers and what they wear.
    this.charScreen = new CharacterScreen(this.ui, this.input, {
      equip: () => this.equipHost(),
      hero: (h) => {
        const host = this.equipHost(), x = host.heroes()[h], def = h ? this.members()[h - 1]?.def : mainHero(this.db);
        // Update 127: gender, roleplay answers, and how they see the rest of the party (the hero you play rates no one).
        const roleplay = rpFields(this.db).map((f) => { const v = def?.roleplay?.[f.id] ?? ''; return { title: f.title, value: v && f.type === 'date' ? datesLabel(v) : v }; }).filter((r) => r.value);
        const lead = mainHero(this.db), party = [lead, ...this.members().map((m) => m.def)];
        const bonds = !def || def === lead || this.db.relations?.off ? undefined : party.filter((o) => o.id !== def.id).map((o) => { const v = this.relGet(def.id, o.id), l = relLabel(v, relLove(this.db, def.id, o.id)); return { name: o.name, value: v, label: l.name, color: relColor(v) }; });
        return { name: x?.name ?? '', level: x?.level ?? 1, portrait: x?.portrait ?? '', color: this.heroColor(h), about: def?.about, art: this.heroArt(h), elements: this.heroAffinity(h).elements, ailment: this.ailmentPill(h), gender: def?.gender, roleplay, bonds };
      },
      gauges: (h) => {
        const m = h ? this.members()[h - 1] : null;
        if (!m) return { hp: [this.stats.hp, this.stats.cfg.max.hp], mp: [this.stats.mp, this.stats.cfg.max.mp], sp: [this.stats.sp, this.stats.cfg.max.sp], xp: { have: this.progress.xp, next: this.progress.maxed ? null : this.progress.toNext } };
        const mx = this.allyNumbers(m.data, m.def).max, next = xpToNext(this.combatCfg, m.data.level);
        return { hp: [m.data.hp, mx.hp], mp: [m.data.mp, mx.mp], sp: [m.data.sp, mx.sp], xp: { have: m.data.xp, next: next || null } };
      },
      slots: (h) => this.equipHost().slots(h),
      view: (h) => this.equipHost().view(h),
      ailments: (h) => h ? [] : this.combat.heroStatus.list.map((e) => ({ name: effectName(e.id), icon: statusIconUrl(e.id), left: Number.isFinite(e.total) ? `${Math.ceil(e.left)}s` : undefined })),
      ranks: (h) => this.heroRanks(h),
      good: (h) => { const g = this.goodOf(this.heroIdOf(h)); return g ? { name: GOOD_INFO[g.kind].name, stat: GOOD_INFO[g.kind].stat, exp: GOOD_INFO[g.kind].exp, left: hoursLabel(g.until - this.state.clock) } : null; },
      order: () => this.lineupWhos(),
    });
    // Party (the pause menu's first tab): the three fighting as cards; Status, Equipment, Skill Tree… and Swap.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g0 = this;
    this.partyScreen = new PartyScreen(this.ui, this.input, {
      members: () => this.lineupWhos().map((w) => this.partyView(w)),
      get active() { return g0.activeMembers + 1; },
      actions: (who) => this.partyActions(who),
      run: (who, id, back) => this.partyRun(who, id, back),
      swap: (a, b) => this.swapLineup(a, b),
      layout: () => partyLayout(this.db.menus?.partyLayout),
    });
    this.pauseShell = new PauseShell(this.ui, () => {
      const where = this.mapData?.name || this.mapName;
      return [where, `Time ${formatPlayTime(this.playTime)}`, `${this.inventory.gold.toLocaleString()} G`].filter(Boolean).join('   ·   ');
    });
    this.worldMap = new WorldMapScreen(this.ui, this.input, {
      pieces: () => this.worldPieces(),
      labels: () => this.db.world?.labels ?? [],
      unvisited: () => this.db.world?.unvisited ?? 'hidden',
      hero: () => { const p = this.db.world?.maps[this.mapName]; return p && this.motion ? { x: p.x + this.motion.x, z: p.z + this.motion.z, map: this.mapName } : null; },
      heroName: () => mainHero(this.db).name,
      markers: () => this.worldMarkers(),
      artScale: 4,
      pin: () => this.state.pin,
      setPin: (p) => { this.state.pin = p; },
    });
    this.bubbles = new BubbleLayer(this.ui);
    this.achBook = new AchievementBook(`hd2d:${this.db.title || 'game'}${this.isPlaytest ? ':playtest' : ''}:achievements`);
    // Unlocks already earned are passed on to a store's achievements (Steam through a desktop wrapper), if there is one.
    for (const id of this.achBook.all) platformUnlock(id);
    this.achToast = new AchievementToast(this.ui, () => this.audio.play('achievement'));
    this.achScreen = new AchievementsScreen(this.ui, this.input, () => this.achievementViews(),
      () => (this.state.cheated ? 'Console cheats were used in this game, so achievements stay locked in it. · Esc: close' : '↑ ↓ scroll · Esc: close'));
    this.devConsole = new DevConsole(this.ui, () => this.consoleCommands());
    const dc = this.db.devConsole ?? 'playtest';
    this.devConsole.enabled = dc === 'always' || (dc === 'playtest' && this.isPlaytest);
    this.devConsole.onToggle = (open) => { this.input.releaseAll(); if (!open) this.refreshEvents(); };
    this.controls = new ControlsScreen(this.ui, this.input);
    this.creditsScreen = new CreditsScreen(this.ui, this.input);
    this.log = new AdventureLog(this.ui);
    this.log.clock = () => this.time.label(this.settings.clock12);
    this.hud.logEl = this.log.el;
    this.logScreen = new AdventureLogScreen(this.ui, this.input);
    this.recordsScreen = new RecordsScreen(this.ui, this.input);
    this.evolve = new EvolveScreen(this.ui, this.input);
    this.bestiaryScreen = new BestiaryScreen(this.ui, this.input);
    this.tracker = new QuestTracker(this.ui);
    this.hud.questEl = this.tracker.el;
    this.questScreen = new QuestLogScreen(this.ui, this.input);
    this.arranger = new HudArranger(this.ui, this.input, (l) => this.hud.applyLayout(l));
    this.menu = new GameMenu(this.ui, this.input);
    this.saveScreen = new SaveScreen(this.ui, this.input, {
      slots: (mode) => this.saves.list().filter((s) => mode === 'load' || s.slot !== 'auto').map((s) => ({ slot: s.slot, label: slotLabel(s.slot), data: s.data, shot: s.data ? this.saves.shot(s.slot) : null, party: s.data ? this.saveParty(s.data) : undefined })),
      act: (mode, slot) => {
        if (mode === 'load') { const d = this.saves.read(slot); if (d) { this.currentSlot = slot === 'auto' ? null : slot; this.loadSave(d); } return false; }
        const ok = this.saveTo(slot);
        return !(ok && this.saveFromEvent);
      },
      remove: (slot) => { this.saves.remove(slot); this.state.tally('savesDeleted'); },
    });
    // Notices ("Saved", "Not enough MP"…) go in the adventure log too.
    const notice = this.menu.notice.bind(this.menu);
    this.menu.notice = (t: string) => { notice(t); this.log?.add(t, 'info'); };
    this.inventory = Inventory.fresh(this.db);
    // Worn things stay in the bag (in use): who uses each copy, and taking things off when a copy leaves.
    this.inventory.reserved = (id) => this.wearers(id).length;
    this.inventory.onRemoved = () => this.reconcileWorn();
    // The bag sees forged items (upgraded, enchanted).
    this.inventory.items = (id) => this.items.get(id);
    this.state.inventory = this.inventory;
    this.quests = new QuestBook(this.db.quests, {
      count: (id) => this.inventory.count(id),
      take: (id, n) => { this.inventory.remove(id, n); this.refreshRing(); },
      reward: (r) => this.questReward(r),
      news: (n) => this.questNews(n),
    });
    this.state.quests = this.quests;
    this.refreshRing();
    this.bag = new InventoryScreen(this.ui, this.input, () => this.inventory, {
      use: (i, who) => this.useItem(i, who),
      targets: () => {
        const ms = this.members();
        if (!ms.length) return [];
        const hp = (v: number, mx: number) => `${Math.round(v)} / ${Math.round(mx)} HP`;
        return [{ label: `${mainHero(this.db).name} · ${hp(this.stats.hp, this.stats.cfg.max.hp)}` },
          ...ms.map((m) => ({ label: `${m.def.name} · ${m.data.down ? 'knocked out' : hp(m.data.hp, this.allyNumbers(m.data, m.def).max.hp)}` }))];
      },
      useWarning: (i) => {
        const d = this.items.get(this.inventory.slots[i]?.id ?? '');
        return d && restoresAny(d, 'hp') && this.combat.heroStatus.zombie && !d.cures?.includes('zombie') ? 'Use (hurts: you’re a zombie!)' : null;
      },
      equip: (i) => this.equipItem(i),
      toolOn: (i) => { const id = this.inventory.slots[i]?.id; if (id && this.items.get(id)?.exp?.all) return !this.state.expAllOff.has(id); return !!id && this.rings.ring?.id === id && this.rings.active; },
      toggleTool: (i) => { const id = this.inventory.slots[i]?.id; return id ? this.toggleTool(id) : null; },
      // Equipment picked in the bag: who puts it on (only those who can use it; arrows are the hero's).
      equipTargets: (i) => {
        const id = this.inventory.slots[i]?.id, host = this.equipHost();
        if (!id) return [];
        // Every copy counts, worn or not (Update 121: armor Katrina wears used to find nothing here and go to the hero).
        const g = host.gear(true).find((x) => x.id === id), heroes = host.heroes();
        if (!g || heroes.length < 2) return [];
        const had = this.slotWearers().get(i)?.who;
        return heroes.map((x, k) => {
          const wearing = had === `hero:${k}`;
          return { label: `${x.name}${wearing ? ' (wearing it)' : g.users[k] ? '' : ' (can’t use it)'}`, disabled: !g.users[k] || wearing };
        });
      },
      equipOn: (i, who) => {
        const id = this.inventory.slots[i]?.id, host = this.equipHost();
        const g = id ? host.gear(true).find((x) => x.id === id) : undefined;
        if (!g || !id) return this.equipItem(i);
        // Every copy in use: this one moves from whoever had it.
        const had = this.slotWearers().get(i);
        if (this.inventory.free(id) < 1 && had && had.who !== `hero:${who}`) this.takeOffSlot(i);
        const msg = host.equip(who, g.slot, g.id);
        return msg && who ? `${host.heroes()[who].name}: ${msg}` : msg;
      },
      usedBy: (i) => this.slotWearers().get(i)?.label ?? null,
      usedColor: (i) => { const w = this.slotWearers().get(i); return w?.who.startsWith('hero:') ? this.heroColor(Number(w.who.slice(5))) : null; },
      compare: (i) => this.compareGear(i),
      party: () => this.partyCards(),
      takeOff: (i) => this.takeOffSlot(i),
      shardTargets: (i) => this.shardTargets(i),
      placeShard: (i, key) => this.placeShard(i, key),
      fuseOptions: (i) => this.fuseOptions(i),
      fuse: (i, all) => this.fuse(i, all),
      changed: () => this.refreshRing(),
      icon: (id) => this.itemIcon(id),
      drop: (i, n) => this.dropItem(i, n),
      quickLabel: (k) => this.input.label(`quick${k + 1}` as Action),
    }, () => pauseLabel(this.db.menus, 'items'));
    this.hud.onQuick = (k) => { if (this.fieldFree()) this.useQuick(k); };
    this.shop = new ShopScreen(this.ui, this.input, () => this.inventory, (id) => this.itemIcon(id), () => { this.refreshRing(); this.refreshEvents(); });
    const ctx: EventContext = {
      state: this.state,
      message: this.message,
      setTime: (h, instant) => {
        // Time passing (sleeping until morning) counts for fires too: the clock moves on by the hours skipped forward.
        this.state.clock += wrapHour(h - this.time.target);
        this.fireCheck = 0;
        this.time.set(h, instant);
      },
      tendFire: () => { const f = this.nearestFire(); if (f) this.openFire(f); else this.menu.notice('No fire nearby'); },
      fullRest: () => this.fullRest(),
      fadeTo: (to, seconds) => { this.fade = { from: this.post.fade, to, t: 0, duration: Math.max(0.01, seconds) }; },
      isFading: () => this.fade.t < 1,
      refreshEvents: () => this.refreshEvents(),
      changeGauge: (g, op, v) => this.stats.change(g, op, v),
      ailment: (op, a, secs, hero) => this.ailmentCommand(op, a, secs, false, hero),
      rest: (c) => this.startRest(c),
      lock: (c, key, done) => this.openLock(c, key, done),
      relation: (c) => { const set = (a: string, b: string) => this.relChange(a, b, c.op === 'set' ? c.value - this.relGet(a, b) : c.value); set(c.a, c.b); if (c.both) set(c.b, c.a); },
      goodState: (c) => this.goodStateCommand(c),
      heroWeather: (c) => this.heroWeatherCommand(c),
      transfer: (t) => this.requestTransfer(t.map, { x: t.x + 0.5, z: t.z + 0.5, dir: t.dir }, t.fade ?? 'black', { autosave: true }),
      openSave: () => this.openSaveScreen(true),
      items: {
        give: (id, n) => {
          if (!this.items.has(id)) return 'unknown';
          if (this.inventory.room(id) < n) return 'full';
          this.inventory.add(id, n);
          this.audio.play('item');
          this.log.add(`Received ${n > 1 ? `${n} × ` : ''}${this.items.get(id)!.name}`, 'loot');
          return 'ok';
        },
        take: (id, n) => { const k = this.inventory.remove(id, n); this.refreshRing(); return k; },
        gold: (op, v) => { this.inventory.gold = Math.max(0, op === 'set' ? v : this.inventory.gold + v); if (op === 'add' && v > 0) { this.audio.play('coin'); this.log.add(`Received ${v} G`, 'loot'); } },
        name: (id) => this.items.get(id)?.name ?? id,
      },
      stable: (c) => this.stableCommands(c),
      roost: (c) => this.roostCommands(c),
      horse: (c) => this.horseCommand(c),
      openShop: (c) => this.shop.show(c.name || 'Shop', shopGoods(c.goods, (id) => this.items.get(id)?.price ?? 0), c.canSell !== false, () => {}),
      sound: (src) => this.audio.play(src),
      music: (src, fade) => { this.musicOverride = src; this.updateAudio(0, fade ?? 1.5); },
      ambience: (src) => { this.ambienceOverride = src; this.updateAudio(0); },
      party: (op, hero, quiet) => this.changeParty(op, hero, quiet),
      weather: (kind, amount, wind, scope) => {
        // Here: this map's weather (the shared outdoor weather, its zone's or its own); world: the shared outdoor weather.
        const key = scope === 'world' ? WORLD_WEATHER : this.weatherKey();
        const prev = this.state.weather.get(key), dyn = key === WORLD_WEATHER ? this.dynamicWeather() : null;
        this.state.weather.set(key, { kind, ...(amount !== undefined ? { amount } : {}), ...(wind !== undefined ? { wind } : prev?.wind !== undefined ? { wind: prev.wind } : {}), ...(dyn ? { spell: dyn.spell } : {}) });
        const w = this.mapWeather();
        this.weather.set(w.kind, w.amount, this.camTarget);
      },
      quest: (c) => { this.questQuiet = !!c.silent; try { this.quests.run(c.quest, c.op, c.objective, c.add); } finally { this.questQuiet = false; } },
      battle: (c) => {
        const defs = new Map((this.db.enemies ?? []).map((x) => [x.id, x]));
        // Single mode: a wild encounter, a trainer battle or a swarm (the event's choice, else the map's default).
        const pick = this.pickFor(c.pick), cap = this.combatCfg.turnBased.mode === 'single' && pick !== 'full' ? SINGLE_MAX : MAX_FOES;
        const list = c.enemies.map((id) => defs.get(id)).filter((d): d is EnemyDef => !!d).slice(0, cap).map((def) => ({ def, hp: def.hp, enemy: null }));
        if (!list.length) return;
        this.startBattle(list, 'normal', { canRun: !!c.canRun, lose: c.lose ?? 'respawn', resultVar: c.resultVar, music: c.music, scripted: true, stage: c.map || undefined, pick });
      },
      busy: () => this.battle.active || this.battlePending || !!this.sleeping || this.restScreen.isOpen || this.lockpick.isOpen || this.tutorialPop.isOpen || this.flightPick || !!this.flight,
      sleep: (c) => this.startSleep(c),
      statRank: (c) => { const n = this.setStatRank(c.hero, c.stat, c.rank); return n.length ? `${n.join(', ')}: ${ATTR_INFO[c.stat].name} now grows at Rank ${c.rank}.` : null; },
      temperature: (op, value) => { this.tempHere = op === 'reset' ? null : { op, value: value ?? 0 }; },
      achievement: (id) => { this.unlockAchievement(id); },
      tutorial: (id) => this.showTutorial(id),
      console: (line) => { const r = this.devConsole.exec(line, false); if (r && !/^Done/.test(r)) console.info(`[console] ${line}: ${r}`); },
      learn: (c) => this.eventLearn(c),
      heroClass: (c) => this.eventClass(c),
      skillPoints: (n, party) => {
        if (party) this.progress.sharedPoints = Math.max(0, this.progress.sharedPoints + n);
        else this.progress.points = Math.max(0, this.progress.points + n);
        if (n > 0) { this.menu.notice(`+${n} ${party ? 'party' : 'skill'} point${n === 1 ? '' : 's'}`); this.audio.play('skill'); }
      },
    };
    this.interpreter = new Interpreter(ctx);

    this.debug = new DebugPanel(this.ui, '', {
      setHour: (h, instant) => this.time.set(h, instant),
      setSeason: (x) => { this.seasonTest = x; },
      setNormalMaps: (on) => setNormalMapsEnabled(on),
      setSunShadows: (on) => (this.sun.castShadow = on),
      setFireShadows: (on) => this.lights.shadowLights.forEach((l) => (l.castShadow = on)),
      setBloom: (on) => (this.post.settings.bloom = on),
      setTiltShift: (on) => (this.post.settings.tiltShift = on),
      hurt: () => this.stats.change('hp', 'add', -25),
      tire: () => { this.stats.change('sp', 'set', 0); this.stats.exhausted = true; },
      refill: () => this.stats.refill(),
      console: () => this.devConsole.toggle(true),
    });
  }

  /** A map as it is on this visit: props cut down earlier stay gone (leaving their stump, if they have one). */
  private visitData(name: string, data: MapData): MapData {
    // Props for some days only (a prop's Dates: Halloween pumpkins) stay away on the others.
    const today = new Date();
    if (data.props.some((p) => { const d = this.sprites.def(p.type)?.dates; return !!d && !inDates(today, d.from, d.to); })) {
      data = { ...data, props: data.props.filter((p) => { const d = this.sprites.def(p.type)?.dates; return !d || inDates(today, d.from, d.to); }) };
    }
    if (!data.props.some((p) => this.state.isCut(name, propKey(p)))) return data;
    const kept: PropData[] = [], stumps: PropData[] = [];
    for (const p of data.props) {
      if (!this.state.isCut(name, propKey(p))) { kept.push(p); continue; }
      const st = this.sprites.def(p.type)?.stump;
      if (st && this.sprites.def(st)) stumps.push({ type: st, x: p.x, z: p.z, ...(p.s ? { s: p.s } : {}), ...(p.y !== undefined ? { y: p.y } : {}) });
    }
    return { ...data, props: [...kept, ...stumps] };
  }

  /** Build a map and put the player on it (or take over a neighbour already built beside it). The previous map goes. */
  private enterMap(name: string, data: MapData, start: Start | null, pre?: Preview): void {
    if (pre) pre.group.removeFromParent();
    // Riding in: where the horse was (it waits outside an indoor map).
    const fromMap = this.mapName, fromPos = this.motion ? { x: this.motion.x, z: this.motion.z } : null;
    this.leaveMap();
    this.chatFirst = !this.visited.has(name);
    this.mapName = name;
    this.cutThisVisit.clear();
    // An event's change of temperature lasts while the player stays on its map.
    this.tempHere = null;
    this.mineHits.clear();
    data = this.visitData(name, data);
    this.mapData = data;
    this.time.environment = data.environment ?? 'outdoor';
    const level = (this.level = new THREE.Group());
    level.name = `map:${name}`;
    this.scene.add(level);
    // The built world goes in a group of its own (a neighbour's, already built, when coming from a seamless edge).
    const worldGroup = pre?.group ?? new THREE.Group(), origin = pre?.origin ?? new THREE.Vector2();
    worldGroup.position.set(0, 0, 0);
    origin.set(0, 0);
    worldGroup.name = `world:${name}`;
    level.add(worldGroup);
    // Winter freezes still water over (decided as the map is built; a change of season rebuilds it).
    this.season = this.seasonNow();
    setSeason(this.season);
    this.mapWinter = this.season === 'winter';
    // Update 148: maps that don't choose are flat in 2D view mode (height implied by the tiles).
    TileMap.flatByDefault = this.db.viewMode === '2d';
    this.map = pre?.map ?? new TileMap(data, this.tiles, (style) => this.frozen(style));
    // Update 156: everything that walks the map's grid (monsters, the party, events) stands on the scene's floors.
    { const sc = (data as With3D).__scene3d; if (sc) this.map.ground3d = (x, z, fromY) => ground3D(sc, x, z, fromY); }
    const built = pre?.built ?? buildWorld(worldGroup, this.map, data, this.sprites, this.tileTextures, origin);
    this.world = { group: worldGroup, built, origin };
    this.waterNormals = built.waterNormals;
    this.waterFlows = built.waterFlows;
    // Waterfalls: one sound for each run of falling water (cells near each other share one).
    this.waterfalls = [];
    for (const f of built.waterfalls) if (!this.waterfalls.some((o) => Math.hypot(o.x - f.x, o.z - f.z) < 2.5)) this.waterfalls.push(f);
    this.fallFeet = built.waterfalls;
    // Update 154: a 3D map's waterfalls (planes named _waterfall) are heard the same way.
    if (this.w3) for (const f of this.w3.scene.falls) { const spot = { x: f.x, z: f.z, y: f.y, top: f.top }; this.waterfalls.push(spot); this.fallFeet.push(spot); }
    this.findWetProps();
    tagAOMeshes(level);
    this.groundMeshes = built.ground;
    this.propSlots = built.props;
    this.findRustlers();
    this.buildings = built.buildings;
    this.bursts.attach(level);
    this.lights = new Lights(level, data, this.map, this.sprites);
    this.lights.shadowLights.forEach((l) => (l.castShadow = this.settings.lightShadows));
    // Shaders are built for the number of lights in the scene: pad this map to the most any map around it needs, so
    // walking between seamless neighbours never rebuilds them (kept across seamless steps, fresh after a transfer).
    this.lightTarget = pre && this.lightTarget ? maxLights(this.lightTarget, this.lights.counts) : this.lights.counts;
    this.lights.padTo(this.lightTarget);
    this.fireflies = new Fireflies(level, this.map);
    this.weatherPending = true;
    this.events = data.events.map((e) => { const ev = new GameEvent(e, level, this.sprites, this.db, this.map); ev.selfId = `${this.mapName}:${e.id}`; return ev; });
    this.combat.attach(this.combatHost(level));
    this.warmup = true;
    this.initFires();
    if (this.pickups) this.pickups.reset(level, this.map);
    else this.pickups = new Pickups(level, this.map, {
      xp: (n) => this.absorbXp(n),
      gold: (n) => { this.state.tally('goldFound', n); this.inventory.gold += n; this.audio.play('coin'); this.goldBurst += n; this.xpBurstT = 0; },
      item: (id, n) => {
        const left = this.inventory.add(id, n), got = n - left, name = this.items.get(id)?.name ?? id;
        if (got > 0) { this.state.tally('itemsFound', got); this.audio.play('item'); this.log.add(`Picked up ${got > 1 ? `${got} × ` : ''}${name}`, 'loot'); }
        return left;
      },
      icon: (id) => this.iconCanvases.get(id) ?? builtinIcon('bag'),
      // Uncommon and better loot glows in its rarity's colour.
      color: (id) => { const d = this.items.get(id); return (rarityOf(d) ?? 'common') !== 'common' ? itemColor(d) : null; },
    });
    this.pickups.onFull = (id) => this.bagFull(id);
    this.refreshEvents();
    // Reaching a map counts for "visit" objectives.
    if (!this.onTitle) this.quests.mapEntered(name);
    this.preloadBattleMaps(data);
    this.prints.clear();
    this.printWalk.clear();
    this.puddles.setSpots(this.puddleSpots(data));

    // Update 154: a 3D map: the hero's body and the orbiting camera (a start from the scene when nothing else says).
    const s3 = (data as With3D).__scene3d;
    const was3 = !!this.w3;
    this.w3 = s3 ? { scene: s3, body: new Body3D(s3), cam: new Camera3D(s3), heading: 0 } : null;
    // Back from a 3D map: the map camera's own field of view again.
    if (was3 && !this.w3) { this.camera.far = 200; this.resize(); }
    this.inVolumes.clear();
    const s = start ?? (s3?.start ? { x: s3.start.x, z: s3.start.z } : this.findOpenTile(data));
    const game = this;
    this.motion = new PlayerMotion({
      map: this.map,
      solidEvent: (x, z) => this.events.some((e) => e.solid && e.covers(x, z)),
      // Out of stamina: only walking (and crawling, so nobody gets stuck in a tunnel) until it refills.
      // Riding: no climbing or crawling; galloping while the horse has stamina.
      has: (a) => (this.riding ? a === 'jump' || (a === 'run' && !this.horseTired) : (this.state.has(a) || (a === 'run' && this.carries('dash') && this.state.sprint) || (a === 'climb' && this.carries('climb'))) && (a === 'crawl' || !this.stats.exhausted)),
      get speed() { const h = game.riding; return h ? { ...game.stats.cfg.speed, walk: h.speed * 0.5, run: h.speed, wade: h.speed * 0.35 } : game.stats.cfg.speed; },
      // A horse doesn't swim; on foot, swimming takes a key item marked Lets the party swim (Update 109).
      noSwim: () => !!this.riding || !this.canSwim(),
      leap: () => this.riding?.jump ?? null,
      ledges: this.stats.cfg.ledges,
      waterWalk: () => this.rings.waterWalk,
      current: (cx, cz) => {
        const w = this.map.waterAt(cx, cz);
        if (!w) return null;
        const st = waterStyle(this.mapData, w.style), f = st.flow ?? 0;
        if (!f || this.frozen(w.style)) return null;
        const a = ((st.flowDir ?? 0) * Math.PI) / 180;
        return [Math.cos(a) * f, Math.sin(a) * f];
      },
    });
    this.motion.place(s.x, s.z);
    if (this.w3) {
      this.w3.body.place(s.x, s.z, s.y);
      this.motion.x = this.w3.body.pos.x; this.motion.y = this.w3.body.pos.y; this.motion.z = this.w3.body.pos.z;
      this.w3.cam.follow = this.db.camera3d === 'follow';
    }
    if (s.dir) this.player.faceVector(...DIR_VECTOR[s.dir]);
    this.syncPlayer();
    this.camTarget.copy(this.player.position);
    this.lastTile = this.playerTile();
    this.moveTarget = null;
    this.pendingEvent = null;
    this.debug.setMap(data.name || name);
    this.musicOverride = undefined;
    this.ambienceOverride = undefined;
    this.calmFor = 99;
    if (!this.onTitle) this.updateAudio(0);
    this.debug.setLights(this.lights.budget);
    this.horseArrive(name, data, fromMap, fromPos);
    this.spawnAllies();
    this.buildPreviews();
  }

  /* ---------------------------------------------------------------- seamless neighbours */

  /** Seamless neighbours drawn past this map's edges (World layout + Seamless sides), built a moment after arriving. */
  private previews: Preview[] = [];
  /** The lights every map in this seamless region is padded to (see Lights.padTo). */
  private lightTarget: ShaderLights | null = null;
  private previewToken = 0;

  /** Sides of this map with a seamless neighbour (the camera may look past them). */
  private openSides = new Set<string>();

  private buildPreviews(): void {
    const token = ++this.previewToken;
    const sides = seamlessSides(this.mapData.border);
    const list = neighbours(this.db.world, this.mapName).filter((n) => sides.has(n.side));
    this.openSides = new Set(list.map((n) => n.side));
    if (this.onTitle || !list.length) return;
    void (async () => {
      for (const n of list) {
        // One at a time, a little apart, so arriving stays smooth.
        await new Promise((r) => setTimeout(r, 150));
        if (token !== this.previewToken || !this.level) return;
        // The map just left is already here (kept, not rebuilt).
        if (this.previews.some((p) => p.name === n.map)) continue;
        try {
          const raw = await this.loadMapData(n.map);
          if (token !== this.previewToken || !this.level) return;
          const data = this.visitData(n.map, raw);
          const group = new THREE.Group(), origin = new THREE.Vector2(n.dx, n.dz);
          group.name = `next:${n.map}`;
          group.position.set(n.dx, 0, n.dz);
          TileMap.flatByDefault = this.db.viewMode === '2d';
          const map = new TileMap(data, this.tiles, (st) => this.season === 'winter' && !(waterStyle(data, st).flow ?? 0) && !(waterStyle(data, st).glow ?? 0));
          const built = buildWorld(group, map, data, this.sprites, this.tileTextures, origin);
          tagAOMeshes(group);
          this.level.add(group);
          this.previews.push({ name: n.map, n, group, map, built, data, origin });
          // Its lights, counted (not kept): this map takes on stand-ins now, far from the edge, if the next one needs more.
          const tmp = new THREE.Group(), counted = new Lights(tmp, data, map, this.sprites);
          counted.shadowLights.forEach((l) => (l.castShadow = this.settings.lightShadows));
          const want = maxLights(this.lightTarget ?? counted.counts, counted.counts);
          // Kept out of sight until the shaders are made, so its flames' shader is ready too.
          tmp.position.y = -1000;
          for (const o of [...tmp.children]) if ((o as THREE.Light).isLight || (o as THREE.Object3D).type === 'Object3D') o.removeFromParent();
          this.level.add(tmp);
          this.warmupTemp.push(tmp);
          if (JSON.stringify(want) !== JSON.stringify(this.lightTarget)) { this.lightTarget = want; this.lights.padTo(want); }
          // Its shaders are made now (next frame), not as it first comes into view.
          this.warmup = true;
        } catch (e) { console.warn(`Couldn’t draw the map next door (${n.map}):`, e); }
      }
    })();
  }

  /** Walking off a seamless edge into the map next door: no fade, the same spot on the other side. */
  private trySeamless(dx: number, dz: number): boolean {
    if (!this.previews.length || this.transfer || (!dx && !dz)) return false;
    const m = this.motion, W = this.mapData.width, H = this.mapData.height, edge = 0.42;
    const out = dx < 0 && m.x < edge ? [-0.6, 0] : dx > 0 && m.x > W - edge ? [0.6, 0] : dz < 0 && m.z < edge ? [0, -0.6] : dz > 0 && m.z > H - edge ? [0, 0.6] : null;
    if (!out) return false;
    const px = m.x + out[0], pz = m.z + out[1];
    const n = neighbourAt(this.previews.map((p) => p.n), seamlessSides(this.mapData.border), px, pz, W, H);
    const p = n && this.previews.find((q) => q.n === n);
    if (!p) return false;
    const x = px - p.n.dx, z = pz - p.n.dz, cx = Math.floor(x), cz = Math.floor(z);
    if (!p.map.inMap(cx, cz) || p.map.isBlocked(cx, cz) || Math.abs(p.map.standY(x, z) - m.y) > 0.6) return false;
    const view = this.camTarget.clone().add(new THREE.Vector3(-p.n.dx, 0, -p.n.dz)), dir = this.player.dir;
    // The map being left stays built: it becomes the new map's neighbour (no rebuilding, no gap behind the hero).
    const old = this.world ? { name: this.mapName, data: this.mapData, map: this.map, ...this.world } : null;
    old?.group.removeFromParent();
    this.enterMap(p.name, p.data, { x, z, dir }, p);
    if (old && this.level) {
      const back = neighbours(this.db.world, this.mapName).find((q) => q.map === old.name && seamlessSides(this.mapData.border).has(q.side));
      if (back) {
        old.group.position.set(back.dx, 0, back.dz);
        old.origin.set(back.dx, back.dz);
        old.group.name = `next:${old.name}`;
        this.level.add(old.group);
        this.previews.push({ name: old.name, n: back, group: old.group, map: old.map, built: old.built, data: old.data, origin: old.origin });
      } else this.disposeTree(old.group);
    }
    // The camera carries on from where it was (the world moved under it, not the view).
    this.camTarget.copy(view);
    return true;
  }

  /** Remove the current map from the scene and free its GPU memory (shared sprite art stays). */
  private leaveMap(): void {
    this.endFishing();
    this.previews = [];
    this.previewToken++;
    if (!this.level) return;
    this.bankPickups('leave');
    this.disposeTree(this.level);
    this.scene.remove(this.level);
    this.level = null;
    this.world = null;
    this.events = [];
  }

  /** Free the GPU memory of a built map (shared sprite art and tile textures stay). */
  private disposeTree(root: THREE.Object3D): void {
    const keep = this.sprites.shared();
    for (const t of this.tileTextures.values()) { keep.add(t.map); keep.add(t.normal); }
    root.traverse((o) => {
      const m = o as THREE.Mesh & { isLight?: boolean; shadow?: { map?: { dispose(): void } | null } };
      if (m.isLight && m.shadow?.map) m.shadow.map.dispose();
      const geo = m.geometry as THREE.BufferGeometry | undefined;
      if (geo && !keep.has(geo)) geo.dispose();
      const sm = o as THREE.Object3D & { customDepthMaterial?: THREE.Material; customDistanceMaterial?: THREE.Material };
      const mats = [...(Array.isArray(m.material) ? m.material : m.material ? [m.material] : []), sm.customDepthMaterial, sm.customDistanceMaterial]
        .filter((x): x is THREE.Material => !!x);
      for (const mat of mats) {
        if (keep.has(mat)) continue;
        for (const v of [...Object.values(mat), mat.userData?.normalMap]) {
          const tex = v as THREE.Texture | null;
          if (tex?.isTexture && !keep.has(tex)) tex.dispose();
        }
        unregisterNormalMap(mat);
        unregisterGlow(mat);
        mat.dispose();
      }
    });
  }

  /**
   * Start a transfer: fade out, switch maps (or move within this one), fade back in.
   * The map loads while the screen is dark.
   */
  private requestTransfer(name: string, to: Start, fade: 'black' | 'white' | 'none', opts: { before?: () => void; after?: () => void; autosave?: boolean; fresh?: boolean; slow?: boolean } = {}): void {
    if (this.transfer) return;
    this.transfer = { name, to, fade, phase: 'out', ...opts };
    this.moveTarget = null;
    this.pendingEvent = null;
    if (fade === 'none') { this.transfer.phase = 'load'; return; }
    this.audio.play('transfer');
    // Fades back to black afterwards, so event fades keep working.
    this.post.fadeColor = fade === 'white' ? 0xffffff : 0x000000;
    this.fade = { from: this.post.fade, to: 1, t: 0, duration: opts.slow ? 0.9 : 0.35 };
  }

  /** Advance a transfer; returns true while one is under way (the player can't move). */
  private updateTransfer(): boolean {
    const t = this.transfer;
    if (!t) return false;
    if (t.phase === 'out' && this.fade.t >= 1) t.phase = 'load';
    if (t.phase === 'load') {
      t.phase = 'busy';
      const same = t.name === this.mapName && !t.fresh;
      void (same ? Promise.resolve(null) : this.loadMapData(t.name)).then((data) => {
        // Restore saved switches etc. first, so the new map's events pick the right pages.
        // Leaving the title: its picture stayed up through the fade out; now the screen is black, it goes.
        if (this.titleLeaving) { this.titleLeaving = false; this.setTitleLook(false); }
        t.before?.();
        if (same || !data) {
          this.refreshEvents();
          // Same map: just move the player.
          this.motion.place(t.to.x, t.to.z);
          if (t.to.dir) this.player.faceVector(...DIR_VECTOR[t.to.dir]);
          this.syncPlayer();
          this.camTarget.copy(this.player.position);
          this.lastTile = this.playerTile();
          // Loading a save on the map already shown: its party (perhaps a different one) lines up behind the hero.
          this.spawnAllies();
        } else {
          this.enterMap(t.name, data, t.to);
        }
        if (t.fade !== 'none') this.fade = { from: 1, to: 0, t: 0, duration: t.slow ? 1.3 : 0.45 };
        this.transfer = null;
        this.fadeColorReset = t.fade === 'white';
        if (t.autosave && !same && this.db.saving?.autosave !== false) this.saveTo('auto', true);
        t.after?.();
        this.nextSetup();
      }).catch((err: Error) => {
        console.error(err);
        this.interpreter.start([{ cmd: 'text', text: `Can’t go to map “${t.name}”: ${err.message}` }]);
        if (t.fade !== 'none') this.fade = { from: 1, to: 0, t: 0, duration: 0.3 };
        this.transfer = null;
      });
    }
    return true;
  }

  /** A map's data: handed over by the editor in a playtest, otherwise loaded from the project. */
  private async loadMapData(name: string): Promise<MapData> {
    const handed = this.handedMaps?.[name];
    const data = handed ? (JSON.parse(JSON.stringify(handed)) as MapData) : await loadMap(name);
    migrateMap(data);
    applyTheme(data, this.db.mapThemes);
    alignFootProps(data, (t) => this.sprites.def(t));
    // Update 153: a 3D model as the ground, loaded and fitted before the map is built.
    if (data.groundModel?.src) {
      try { (data as WithGround).__ground = await loadGround(data, this.resolveFile(data.groundModel.src)); }
      catch (e) { console.warn(`Map ${name}: its 3D model “${data.groundModel.src}” couldn’t be read`, e); }
    }
    // Update 154: a 3D map's Blender scene.
    if (data.scene3d?.src) {
      try { (data as With3D).__scene3d = await load3D(data, this.resolveFile(data.scene3d.src), (n) => this.terrainPicture(n)); }
      catch (e) { console.warn(`Map ${name}: its 3D scene “${data.scene3d.src}” couldn’t be read`, e); }
    }
    return data;
  }

  /** No start position on this map: use the open tile nearest the centre. */
  private findOpenTile(data: MapData): Start {
    const cx = Math.floor(this.map.w / 2), cz = Math.floor(this.map.h / 2);
    const solidEvent = (x: number, z: number) => data.events.some((e) => eventCovers(e, x, z) && e.pages[0]?.solid);
    for (let r = 0; r < Math.max(this.map.w, this.map.h); r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, z = cz + dz;
          if (!this.map.isBlocked(x, z) && !solidEvent(x, z)) return { x: x + 0.5, z: z + 0.5 };
        }
    return { x: cx + 0.5, z: cz + 0.5 };
  }

  private refreshEvents(): void {
    for (const e of this.events) e.refresh(this.state);
    this.combat.syncEvents(this.events);
  }

  /** What the combat system needs from the game, for the map just entered. */
  private combatHost(level: THREE.Object3D): CombatHost {
    const game = this;
    return {
      get map() { return game.map; },
      level, sprites: this.sprites, db: this.db, cfg: this.combatCfg,
      get player() { return game.player; },
      get motion() { return game.motion; },
      get stats() { return game.stats; },
      get inventory() { return game.inventory; },
      get skills() { return game.skills; },
      hero: () => this.heroTotals(),
      levelled: (def, range) => this.levelled(def, range),
      swingMissed: () => { if (!this.mineAhead()) this.cutAhead(0, true); },
      proficient: (cls) => this.proficient(cls),
      // Their element stones' elements (else the Database's); worn gear that wards an element off halves it.
      heroElements: () => this.heroDefence(0),
      heroAffinity: () => this.heroAffinity(0),
      heroResists: () => [...(mainHero(this.db).resists ?? []), ...this.wornGear().flatMap((g) => g?.protects ?? [])],
      crouchHold: () => this.settings.crouch === 'hold',
      iconCanvas: (id, fallback) => (id && this.iconCanvases.get(id)) || builtinIcon(fallback),
      glow: () => this.rings.glow(this.elapsed),
      sound: (n, x, z) => this.audio.play(n, x, z),
      items: this.items, overlay: this.overlay, bursts: this.bursts,
      lightAt: (x, z) => this.lightLevel(x, z),
      notice: (t) => this.menu.notice(t),
      solidEventAt: (x, z) => this.events.some((e) => e.solid && e.covers(x, z)),
      defeated: (e) => this.enemyDefeated(e),
      ignite: (x, y, z, r) => this.ignite(x, y, z, r),
      heroLit: () => this.heroLit(),
      safeZones: () => this.safeZones(),
      tally: (k, n, best) => this.state.tally(k, n, best),
      fieldSpell: () => this.useRing(),
      broken: (b) => {
        // Its page's commands (set a switch, open a way…), then pages may change (a switch shows the rubble).
        const ev = b.key as unknown as GameEvent;
        if (ev.page?.commands.length && !this.interpreter.running) this.interpreter.start(ev.page.commands, ev.selfId);
        this.refreshEvents();
      },
      log: (t, k) => this.log.add(t, k),
      encounter: (e, how) => this.encounter(e, how),
      canEncounter: () => !(this.battle.active || this.battlePending || this.battleGrace > 0 || this.dying || this.onTitle || this.transfer || this.interpreter.running),
      learnedSpell: () => this.readiedSpell(),
    };
  }

  /** How lit a spot is for stealth: daylight, the map's lamps and fires, and the hero's own light ring. */
  private lightLevel(x: number, z: number): number {
    if (this.rings.active && this.rings.power?.power === 'light') return 1;
    const env = this.time.environment;
    const ambient = env === 'outdoor' ? 1 - this.time.night * 0.82 : env === 'indoor' ? 0.7 - this.time.night * 0.15 : 0.12;
    return Math.max(ambient, this.lights.lightAt(x, z));
  }

  /** Experience, gold and loot for a beaten enemy, then its page's commands (if any). */
  private enemyDefeated(e: Enemy): void {
    const d = e.def;
    this.log.add(`${d.name} defeated`, 'defeat');
    this.state.tally('kills'); this.state.tally(`kill:${d.id}`);
    this.quests.enemyDefeated(d.id);
    // What it leaves: EXP orbs, gold and its drops, spilling onto the ground to be collected.
    const gold = d.gold ? Math.round(d.gold[0] + Math.random() * Math.max(0, d.gold[1] - d.gold[0])) : 0;
    const items: { id: string; count: number }[] = [];
    for (const drop of d.drops ?? []) {
      if (Math.random() >= drop.chance || !this.items.has(drop.item)) continue;
      items.push({ id: drop.item, count: Math.max(1, drop.count ?? 1) });
    }
    this.pickups?.drop(e.x, e.y, e.z, Math.max(0, d.xp), gold, items);
    // Party members standing when it fell get its EXP once the fight is over (the orbs are the hero's to collect).
    for (const a of this.fighters) if (!a.down && d.xp > 0) a.data.pendingXp = (a.data.pendingXp ?? 0) + d.xp;
    this.refreshEvents();
    const ev = e.key as GameEvent;
    if (ev.page?.commands.length && !this.interpreter.running) this.interpreter.start(ev.page.commands, ev.selfId);
  }

  /** Walked over an item with no room for it: say so, and offer the bag to make room (drop something). */
  private bagFull(id: string): void {
    const name = this.items.get(id)?.name ?? id;
    this.log.add(`Bag full: no room for ${name}`, 'info');
    if (this.menu.isOpen || this.bag.isOpen || this.interpreter.running) return;
    this.audio.play('menuBack');
    this.menu.push('BAG FULL', [
      { label: 'Open the bag', detail: 'Drop something to make room', pick: () => { this.menu.close(); this.openInventory(0); } },
      { label: 'Leave it', pick: () => this.menu.close() },
    ], { note: `No room for ${name}. Walk over it again once there's space.` });
  }

  /**
   * Bag → Drop: put `count` down by the hero's feet. It lies there dimmed for a few seconds (and until the hero steps
   * off it), then can be picked up again by walking over it.
   */
  private dropItem(i: number, count: number): string | null {
    const s = this.inventory.slots[i], d = s && this.items.get(s.id);
    if (!s || !d || !this.pickups || this.onTitle) return null;
    const n = Math.max(1, Math.min(count, s.n)), id = s.id;
    const [fx, fz] = DIR_VECTOR[this.player.dir], p = this.player.position;
    this.inventory.removeAt(i, n);
    this.pickups.place(id, n, p.x + fx * 0.6, p.y, p.z + fz * 0.6);
    this.refreshRing();
    this.log.add(`Dropped ${n > 1 ? `${n} × ` : ''}${d.name}`, 'loot');
    return `Dropped ${n > 1 ? `${n} × ` : ''}${d.name}. Walk over it to pick it up again.`;
  }

  /** A completed quest's rewards: gold, EXP, skill points and items (what doesn't fit is put down by the hero's feet). */
  private questReward(r: NonNullable<import('../world/types').QuestDef['rewards']>): void {
    for (const x of r.relations ?? []) { this.relChange(x.a, x.b, x.value); if (x.both) this.relChange(x.b, x.a, x.value); }
    if (r.gold) { this.inventory.gold += r.gold; this.audio.play('coin'); this.log.add(`Received ${r.gold} G`, 'loot'); }
    for (const it of r.items ?? []) {
      if (!this.items.has(it.item)) continue;
      const left = this.inventory.add(it.item, it.count), got = it.count - left, name = this.items.get(it.item)!.name;
      if (got > 0) this.log.add(`Received ${got > 1 ? `${got} × ` : ''}${name}`, 'loot');
      if (left > 0 && this.pickups) {
        const p = this.player.position;
        this.pickups.place(it.item, left, p.x, p.y, p.z);
        this.log.add(`No room in the bag: ${left > 1 ? `${left} × ` : ''}${name} left on the ground`, 'info');
      }
    }
    if (r.skillPoints) { this.progress.points += r.skillPoints; this.log.add(`+${r.skillPoints} skill point${r.skillPoints === 1 ? '' : 's'}`, 'level'); }
    if (r.xp) { this.log.add(`+${r.xp} EXP`, 'xp'); this.gainXp(r.xp, false); for (const m of this.party.members) m.pendingXp = (m.pendingXp ?? 0) + r.xp; }
    this.refreshRing();
  }

  /** Something happened to a quest: a line in the log, and a banner and a sound for the big moments. */
  private questNews(n: QuestNews): void {
    const q = n.quest, quiet = this.questQuiet || this.onTitle;
    switch (n.type) {
      case 'started': {
        this.log.add(`Quest started: ${q.name}`, 'quest');
        const first = this.quests.visible(q).find((o) => !this.quests.objectiveDone(q, o));
        if (!quiet) { this.overlay.quest(q.kind === 'main' ? 'NEW MAIN QUEST' : 'NEW QUEST', q.name, first?.text ?? '', 'start'); this.audio.play('questStart'); }
        break;
      }
      case 'objective':
        this.log.add(`${q.name}: ${n.objective.text} ✓`, 'quest');
        if (!quiet) this.audio.play('questStep');
        break;
      case 'progress':
        this.log.add(`${q.name}: ${n.objective.text} (${n.have}/${n.need})`, 'quest');
        break;
      case 'ready':
        this.log.add(`${q.name}: ${q.turnIn || (q.giver ? `return to ${q.giver}` : 'ready to hand in')}`, 'quest');
        if (!quiet) this.overlay.quest('OBJECTIVES COMPLETE', q.name, q.turnIn || (q.giver ? `Return to ${q.giver}` : ''), 'ready');
        break;
      case 'done': {
        this.log.add(`Quest complete: ${q.name}`, 'quest');
        if (!quiet) { this.overlay.quest('QUEST COMPLETE', q.name, rewardText(q, { item: (id) => this.items.get(id)?.name ?? id }), 'done'); this.audio.play('questDone'); }
        break;
      }
      case 'failed':
        this.log.add(`Quest failed: ${q.name}`, 'quest');
        if (!quiet) { this.overlay.quest('QUEST FAILED', q.name, '', 'failed'); this.audio.play('menuBack'); }
        break;
      case 'reset': break;
    }
  }

  /* ------------------------------------------------------------------ quick items */

  /** Free to act on the field: no menu, event, transfer or title in the way. */
  private fieldFree(): boolean {
    return !this.onTitle && !this.pauseShell.isOpen && !this.menu.isOpen && !this.bag.isOpen && !this.shop.isOpen && !this.interpreter.running && !this.transfer && !this.dying && !this.message.isOpen;
  }

  /** The quick slot whose Bow key item is being drawn. */
  private drawSlot = -1;
  /** Use the item on quick slot k (the D-pad, or 5 / 6 / 7 / 8). Key items (Update 132) do their field use. */
  private useQuick(k: number): void {
    const id = this.inventory.quick[k], dir = ['←', '↑', '→', '↓'][k];
    if (!id) { this.menu.notice(`Quick slot ${dir} is empty: assign an item in the bag (an item → Quick slot)`); return; }
    const d = this.items.get(id);
    if (d && d.kind !== 'consumable') {
      if (this.inventory.count(id) < 1) { this.audio.play('menuBack'); this.menu.notice(`No ${d.name} in the bag`); return; }
      const f = d.field, dmg = Math.max(1, f?.damage ?? 10);
      let msg: string | null;
      if (f?.use === 'cut') msg = this.combat.keySwing(dmg);
      else if (f?.use === 'bow') { this.drawSlot = k; msg = this.combat.keyDraw(dmg, () => this.input.isHeld(`quick${k + 1}` as Action) || this.hud.quickHeld === k); }
      else msg = this.toggleTool(id);
      if (msg) this.menu.notice(msg);
      return;
    }
    const i = this.inventory.slots.findIndex((s) => s?.id === id);
    if (i < 0) { this.audio.play('menuBack'); this.menu.notice(`No ${d?.name ?? id} left`); return; }
    const msg = this.useItem(i);
    if (!msg) return;
    if (msg.startsWith('Used')) {
      this.audio.play('item');
      const p = this.player.position;
      this.bursts.spawn(p.x, p.y + 0.6, p.z, { color: '#9cf07a', n: 8, speed: 0.6, up: 1.4, life: 0.5, size: 0.06, additive: true });
      this.refreshRing();
    } else this.audio.play('menuBack');
    this.menu.notice(msg);
  }

  /* ------------------------------------------------------------------ footsteps */

  private stepT = 0;
  private stepAir = false;
  private stepAt = { x: NaN, z: NaN };

  /** Footsteps in time with the hero's stride, sounding like the ground (or the shallow water) underfoot. */
  private tileAilT = 0;
  /** Standing on a tile that gives an ailment (lava, a poison swamp): rolled every half second. */
  private updateTileAilment(dt: number): void {
    const m = this.motion;
    if (!m || this.onTitle || m.airborne || this.dying) return;
    this.tileAilT -= dt;
    if (this.tileAilT > 0) return;
    this.tileAilT = 0.5;
    const cx = Math.floor(m.x), cz = Math.floor(m.z);
    // Water that hurts (poison goo, lava): its style's ailment, unless the hero is walking on it.
    const w = !m.onWater ? this.map.footWaterAt(cx, cz) : null, ws = w ? waterStyle(this.mapData, w.style) : null;
    if (ws?.ailment && Math.random() * 100 < (ws.chance ?? 100)) { this.ailmentCommand('give', ws.ailment, undefined, true); return; }
    const t = this.map.inMap(cx, cz) ? this.tiles.ailment(this.map.terrain(cx, cz)) : undefined;
    if (t && Math.random() * 100 < (t.chance ?? 100)) this.ailmentCommand('give', t.ailment, t.seconds, true);
  }

  private horseVoice = 6;
  private readonly speedLines = (() => { const el = document.createElement('div'); el.className = 'speed-lines'; el.setAttribute('aria-hidden', 'true'); return el; })();
  private updateFootsteps(dt: number): void {
    const m = this.motion;
    if (!m || this.onTitle) return;
    const dist = Math.hypot(m.x - this.stepAt.x, m.z - this.stepAt.z);
    this.stepAt = { x: m.x, z: m.z };
    const air = m.airborne, landed = this.stepAir && !air;
    this.stepAir = air;
    // For the Journal: steps on the ground (about two to a tile) and distance swum.
    if (dist > 0 && dist < 1.5 && !air && !m.climbing) this.state.tally(m.swimming ? 'swum' : 'steps', m.swimming ? dist : dist / 0.45);
    // Swimming: a stroke's splash every so often while moving.
    if (m.swimming && this.settings.footsteps && !air) {
      if (!(dist > dt * 0.5) || dist > 1.5) { this.stepT = 0.3; return; }
      this.stepT += dt;
      if (this.stepT >= 0.72) { this.stepT -= 0.72; this.audio.play('swim', undefined, undefined, 0.6 * (0.85 + Math.random() * 0.3)); }
      return;
    }
    // On a horse (Update 115): hoof steps (a quicker four-beat gallop), and a snort or a whinny now and then.
    if (this.riding) {
      this.horseVoice -= dt;
      if (this.horseVoice <= 0) { this.horseVoice = 8 + Math.random() * 14; this.audio.play(Math.random() < 0.7 ? 'horseSnort' : 'horseNeigh', m.x, m.z, 0.7); }
      if (!this.settings.footsteps || air || !(dist > dt * 0.5) || dist > 1.5) { this.stepT = 0.1; return; }
      const every = m.running ? 0.11 : 0.26;
      this.stepT += dt;
      if (this.stepT < every) return;
      this.stepT -= every;
      this.audio.play('hoof', undefined, undefined, (m.running ? 0.9 : 0.7) * (0.85 + Math.random() * 0.3));
      return;
    }
    if (!this.settings.footsteps || air || m.swimming || m.climbing || m.dashing) { this.stepT = 0.2; return; }
    if (landed) { this.footstep(1.3); this.stepT = 0; return; }
    // Standing still, or moved by a transfer (a jump in place, not a step).
    if (!(dist > dt * 0.5) || dist > 1.5) { this.stepT = 0.25; return; }
    const sneaking = this.combat.sneaking;
    const every = m.running ? 0.3 : m.crawling ? 0.55 : sneaking ? 0.5 : 0.4;
    this.stepT += dt;
    if (this.stepT < every) return;
    this.stepT -= every;
    const quiet = 1 - Math.min(90, this.skills.get('quietSteps')) / 100;
    this.footstep(m.running ? 1.1 : sneaking || m.crawling ? 0.4 * quiet : 0.8);
  }

  /** White rings on the water around the hero (swimming, or wading on the move) and party members swimming. */
  /**
   * Reflections in water just in front of someone (Updates 112, 116): the hero, the party, the horse (and its rider),
   * event characters and map enemies, each mirrored at the surface. Props get theirs when the map is built.
   */
  private readonly reflections = new Map<object, { mesh: THREE.Mesh; of: THREE.Mesh; used: boolean }>();
  private updateReflection(): void {
    for (const r of this.reflections.values()) r.used = false;
    const m = this.motion;
    if (m && !this.onTitle && !this.battle.active && this.settings.quality !== 'potato') {
      const reflect = (key: object, src: THREE.Object3D | null | undefined, x: number, z: number, baseY: number) => {
        const mesh = src as THREE.Mesh | null | undefined;
        if (!mesh?.isMesh || !mesh.visible || !mesh.parent) return;
        const map = (mesh.material as THREE.MeshStandardMaterial | undefined)?.map;
        if (!map) return;
        // Water on the tile in front (toward the camera), no higher than their feet, and not standing in deep water.
        const w = this.map.waterAt(Math.floor(x), Math.floor(z + 0.75));
        if (!w || baseY < w.surface - 0.01 || this.map.footWaterAt(Math.floor(x), Math.floor(z))?.kind === 'swim') return;
        let r = this.reflections.get(key);
        if (!r || r.of !== mesh) {
          // Shares the sprite's geometry, so its frames (UVs) follow along.
          if (r) { r.mesh.removeFromParent(); (r.mesh.material as THREE.Material).dispose(); }
          const mat = patchLean(new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.38, alphaTest: 0.3, depthWrite: false, side: THREE.DoubleSide, color: 0xb8d4ff }));
          r = { mesh: new THREE.Mesh(mesh.geometry, mat), of: mesh, used: false };
          r.mesh.renderOrder = 1;
          this.reflections.set(key, r);
        }
        if (r.mesh.parent !== mesh.parent) mesh.parent.add(r.mesh);
        r.used = true;
        r.mesh.visible = true;
        r.mesh.position.set(mesh.position.x, 2 * w.surface - mesh.position.y - 0.02, mesh.position.z);
        r.mesh.rotation.copy(mesh.rotation);
        // Upside down, and (with the camera's lean) leaning toward the camera instead of away.
        r.mesh.scale.set(mesh.scale.x, -mesh.scale.y, -mesh.scale.z);
      };
      if (!m.airborne && !m.swimming) reflect(this.player, this.player?.mesh, m.x, m.z, m.y);
      if (this.horseSprite) { const hp = this.horseSprite.mesh.position; reflect(this.horseSprite, this.horseSprite.mesh, hp.x, hp.z, hp.y); }
      for (const a of this.allies) reflect(a, a.sprite.mesh, a.x, a.z, a.y);
      for (const e of this.events) { const v = e.visualObject; if (v && e.onMap) reflect(e, v, v.position.x, v.position.z, v.position.y); }
      for (const en of this.combat.enemies) if (!en.dead) reflect(en, en.spriteMesh, en.x, en.z, en.y);
    }
    for (const [k, r] of this.reflections) if (!r.used) {
      r.mesh.visible = false;
      // Gone for good (a new map, a defeated foe): let it go.
      if (!r.of.parent) { r.mesh.removeFromParent(); (r.mesh.material as THREE.Material).dispose(); this.reflections.delete(k); }
    }
  }

  private updateRipples(dt: number): void {
    const m = this.motion;
    if (!m || this.onTitle) return;
    const moved = (key: object, x: number, z: number) => {
      const was = this.ripAt.get(key);
      this.ripAt.set(key, { x, z });
      return !!was && Math.hypot(x - was.x, z - was.z) > dt * 0.4;
    };
    const heroMoving = moved(this.player, m.x, m.z);
    const w = !m.onWater && !m.airborne ? this.map.footWaterAt(Math.floor(m.x), Math.floor(m.z)) : null;
    if (w) this.ripples.swimmer(this.player, m.x, w.surface, m.z, heroMoving, w.kind !== 'shallow', dt, this.rippleColor(w.style));
    for (const a of this.allies) {
      const am = moved(a, a.x, a.z);
      const aw = this.map.footWaterAt(Math.floor(a.x), Math.floor(a.z));
      if (aw) this.ripples.swimmer(a, a.x, aw.surface, a.z, am, aw.kind !== 'shallow', dt, this.rippleColor(aw.style));
    }
    // Props standing in water (a rock, a fallen trunk): slow rings around them.
    for (const p of this.wetProps) {
      if (p.ring) p.ring.visible = !this.gone(p.prop);
      if (this.gone(p.prop)) continue;
      if (p.ring) p.ring.scale.setScalar(p.size * (0.95 + 0.04 * Math.sin(this.elapsed * 1.6 + p.prop.x * 1.7)));
      this.ripples.still(p.prop, p.prop.x, p.y, p.prop.z - 0.15, p.size, dt, p.color);
    }
  }

  private footstep(loud: number): void {
    const m = this.motion, cx = Math.floor(m.x), cz = Math.floor(m.z);
    // A prop underfoot with its own sound (a bridge, only while up on it, not swimming under it).
    const ws = this.map.inMap(cx, cz) ? this.walkSounds.get(cz * this.map.w + cx) : undefined;
    const onIt = ws && (!ws.deck || this.map.onDeck(cx, cz, m.y));
    if (onIt && !FOOT_MATERIALS.has(ws.sound)) { this.audio.play(ws.sound, undefined, undefined, 0.5 * loud * (0.85 + Math.random() * 0.3)); return; }
    const water = !m.onWater && !onIt ? this.map.footWaterAt(cx, cz) : null;
    const mat = onIt ? ws.sound : water ? 'water' : this.map.inMap(cx, cz) ? this.tiles.footstep(this.map.terrain(cx, cz)) : 'grass';
    if (mat === 'none') return;
    // The sounds differ in loudness; this evens them out (then a little random variety).
    const even: Record<string, number> = { grass: 1.3, dirt: 0.55, stone: 0.95, wood: 0.55, sand: 1.5, snow: 1.15, water: 1.2, metal: 0.8, carpet: 0.45 };
    this.audio.play(`step${mat[0].toUpperCase()}${mat.slice(1)}`, undefined, undefined, 0.5 * loud * (even[mat] ?? 1) * (0.85 + Math.random() * 0.3));
    // Wet through: a soft squelch under the usual step.
    if (this.weatherStates.get(mainHero(this.db).id) === 'wet' && mat !== 'water') this.audio.play('stepWater', undefined, undefined, 0.22 * loud * (0.8 + Math.random() * 0.4));
  }

  /** Does this spot keep footprints (Update 123)? Its tile's setting; in winter, any snowed-over outdoor ground. */
  private keepsPrints(x: number, z: number): boolean {
    const cx = Math.floor(x), cz = Math.floor(z);
    if (!this.map?.inMap(cx, cz) || this.map.footWaterAt(cx, cz)) return false;
    const key = this.map.terrain(cx, cz);
    if (this.tiles.prints(key)) return true;
    const f = this.tiles.footstep(key);
    return this.season === 'winter' && this.time.environment === 'outdoor' && (f === 'grass' || f === 'dirt');
  }

  /** Leave a print at (x, z) facing (dx, dz): a foot to the left or right of the line, or a hoof. */
  private printAt(x: number, z: number, dx: number, dz: number, left: boolean, hoof = false): void {
    if (!this.keepsPrints(x, z) || this.settings.quality === 'potato') return;
    const len = Math.hypot(dx, dz) || 1, nx = dx / len, nz = dz / len, side = (left ? -1 : 1) * (hoof ? 0.16 : 0.09);
    const px = x - nz * side, pz = z + nx * side;
    this.prints.add(px, this.map.standY(px, pz), pz, Math.atan2(nx, nz), hoof, hoof ? 30 : 25);
  }

  /** Footprints for the party (each step), and puddles growing and drying with the ground. */
  private updatePrints(dt: number): void {
    const snowing = this.time.environment === 'outdoor' && (this.weather.kind === 'snow' || this.weather.kind === 'blizzard') && this.weather.amount > 0.2;
    this.prints.update(dt, snowing ? 3 : 1);
    this.puddles.update(this.time.environment === 'outdoor' ? this.wet : 0);
    if (!dt || !this.motion) return;
    const walkers: [object, number, number][] = this.riding ? [] : [[this.player, this.motion.x, this.motion.z]];
    for (const a of this.allies) if (!a.down && a.sprite.mesh.visible && !a.resting) walkers.push([a, a.x, a.z]);
    if (this.horseSprite?.mesh.visible) walkers.push([this.horseSprite, this.horseSprite.mesh.position.x, this.horseSprite.mesh.position.z]);
    for (const [key, x, z] of walkers) {
      let w = this.printWalk.get(key);
      if (!w) { w = { x, z, d: 0, left: false }; this.printWalk.set(key, w); continue; }
      const dx = x - w.x, dz = z - w.z, step = Math.hypot(dx, dz);
      if (step > 1.5) { w.x = x; w.z = z; w.d = 0; continue; }
      w.d += step;
      const hoof = key === this.horseSprite, every = hoof ? 0.55 : 0.42;
      if (w.d >= every && step > 1e-4) {
        w.d = 0;
        w.left = !w.left;
        if (key !== this.player || (!this.motion.airborne && !this.motion.swimming && !this.motion.climbing)) this.printAt(x, z, dx, dz, w.left, hoof);
      }
      w.x = x; w.z = z;
    }
  }

  /** Where this map's puddles go (Update 123): flat, open outdoor ground, picked by a hash of the tile. */
  private puddleSpots(data: MapData): PuddleSpot[] {
    if ((data.environment ?? 'outdoor') !== 'outdoor' || data.kind === 'battle') return [];
    const m = this.map, out: PuddleSpot[] = [];
    const hash = (x: number, z: number, k: number) => { const v = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };
    for (let z = 1; z < m.h - 1 && out.length < 60; z++) for (let x = 1; x < m.w - 1 && out.length < 60; x++) {
      if (hash(x, z, 1) > 0.035) continue;
      if (m.isBlocked(x, z) || m.waterAt(x, z) || m.footWaterAt(x, z)) continue;
      const f = this.tiles.footstep(m.terrain(x, z));
      if (f !== 'grass' && f !== 'dirt' && f !== 'stone') continue;
      const s = m.step(x, z);
      if (m.step(x + 1, z) !== s || m.step(x - 1, z) !== s || m.step(x, z + 1) !== s || m.step(x, z - 1) !== s) continue;
      const px = x + 0.25 + hash(x, z, 2) * 0.5, pz = z + 0.25 + hash(x, z, 3) * 0.5;
      out.push({ x: px, y: m.surfaceY(px, pz), z: pz, size: 0.45 + hash(x, z, 4) * 0.55, angle: hash(x, z, 5) * Math.PI });
    }
    return out;
  }

  /** An EXP orb reached the hero: counted now, shown as one "+N EXP" once the burst of orbs is over. */
  private absorbXp(n: number): void {
    this.xpBurst += n;
    this.xpBurstT = 0;
    this.audio.play('orb');
    const p = this.player.position;
    this.bursts.spawn(p.x, p.y + 0.6, p.z, { color: '#9cf07a', n: 4, speed: 0.8, up: 1.2, life: 0.35, size: 0.06, additive: true });
    this.gainXp(n, false);
  }

  private flushGold(): void {
    if (this.goldBurst > 0) this.log.add(`+${this.goldBurst} G`, 'loot');
    this.goldBurst = 0;
  }

  private flushXp(): void {
    const p = this.player.position;
    this.overlay.float(`+${this.xpBurst} EXP`, p.x, p.y + 1.5, p.z, 'xp');
    this.log.add(`+${this.xpBurst} EXP`, 'xp');
    this.xpBurst = 0;
  }

  /** ", +1 party point" for levels gained (the Party skill tree), or nothing. */
  private partyPointsText(ups: number): string { const n = ups * this.combatCfg.sharedPointsPerLevel; return n ? `, +${n} party point${n === 1 ? '' : 's'}` : ''; }

  /** Add experience; a level-up shows its banner (and is logged). */
  private gainXp(n: number, announce = true, quiet = false): void {
    if (n <= 0) return;
    if (announce) this.log.add(`+${n} EXP`, 'xp');
    const ups = this.progress.add(n);
    if (!ups) return;
    this.applySkillStats();
    if (quiet) {
      // The battle's results screen shows it.
      const pts = ups * this.combatCfg.pointsPerLevel;
      this.log.add(`Level ${this.progress.level}!${pts ? ` +${pts} skill point${pts === 1 ? '' : 's'}` : ''}${this.partyPointsText(ups)}`, 'level');
      return;
    }
    // The EXP that did it is logged before the level-up.
    if (this.xpBurst > 0) this.flushXp();
    const points = ups * this.combatCfg.pointsPerLevel;
    this.overlay.levelUp(this.progress.level, points, `${pauseLabel(this.db.menus, 'skills')} in the menu`);
    this.log.add(`Level ${this.progress.level}!${points ? ` +${points} skill point${points === 1 ? '' : 's'}` : ''}${this.partyPointsText(ups)}`, 'level');
    this.audio.play('levelUp');
    this.bursts.spawn(this.player.position.x, this.player.position.y + 0.6, this.player.position.z, { color: '#ffe48a', n: 26, speed: 1.6, up: 3, life: 0.9, size: 0.09, gravity: 2, additive: true });
  }

  /**
   * What's still on the ground when the hero moves on. Leaving the map: EXP and gold are collected for them, key and
   * quest items too; other items vanish. Saving: everything is collected (items that don't fit stay on the ground).
   * Starting over (new game, load, title): it's all thrown away.
   */
  private bankPickups(why: 'leave' | 'save' | 'discard'): void {
    if (!this.pickups?.count) return;
    if (this.xpBurst > 0) this.flushXp();
    this.flushGold();
    const got = this.pickups.collectAll(why === 'save' ? 'all' : 'keys', (id) => alwaysFits(this.items.get(id)));
    if (why === 'discard') return;
    if (got.xp > 0) { this.log.add(`Gathered ${got.xp} EXP left behind`, 'xp'); this.gainXp(got.xp, false); }
    if (got.gold > 0) { this.inventory.gold += got.gold; this.log.add(`Gathered ${got.gold} G left behind`, 'loot'); }
    for (const it of got.items) if (it.count > 0) this.log.add(`Gathered ${it.count > 1 ? `${it.count} × ` : ''}${this.items.get(it.id)?.name ?? it.id}`, 'loot');
    for (const it of got.lost) this.log.add(`Left behind: ${it.count > 1 ? `${it.count} × ` : ''}${this.items.get(it.id)?.name ?? it.id}`, 'loot');
  }

  /** Most pixels per CSS pixel to draw at: the quality setting (auto: 1.5 on phones and tablets, 2 elsewhere). */
  private get pixelCap(): number {
    const q = this.settings?.quality ?? 'auto';
    // Potato: the map drawn at well under the screen's resolution (battle maps at 1, which they run fine at).
    if (q === 'potato') return this.stage ? 1 : 0.7;
    return q === 'high' ? 2 : q === 'balanced' ? 1.25 : q === 'performance' ? 1 : this.small ? 1.5 : 2;
  }

  private resize(): void {
    // A resize clears the picture: draw the world behind a battle again.
    this.battleFrames = 0;
    const pr = Math.min(window.devicePixelRatio || 1, this.pixelCap);
    this.renderer.setPixelRatio(pr);
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.applyFov();
    this.post.resize(pr);
    this.resizeAO();
  }

  private resizeAO(): void {
    this.renderer.getDrawingBufferSize(this.bufferSize);
    this.ssao.resize(this.bufferSize.x, this.bufferSize.y);
  }

  /* ------------------------------------------------------------------ pointer / touch */

  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private groundMeshes: THREE.Object3D[] = [];
  private readonly hit = new THREE.Vector3();

  private pick(e: PointerEvent): THREE.Vector3 | null {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    // The ground has heights, so hit-test its surface; fall back to the ground plane.
    const hits = this.ray.intersectObjects(this.groundMeshes, false);
    if (hits.length) return this.hit.copy(hits[0].point);
    return this.ray.ray.intersectPlane(this.groundPlane, this.hit);
  }

  private bindPointer(): void {
    // Three fingers at once on a touch screen: the developer console (no ` key on a tablet).
    this.canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 3 && this.devConsole.enabled) { e.preventDefault(); this.devConsole.toggle(); } }, { passive: false });
    this.canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && this.settings.tapToWalk) this.showCursor(this.pick(e)); });
    this.canvas.addEventListener('pointerleave', () => (this.cursor.visible = false));
    // Update 154: on a 3D map, dragging (either button) turns the camera round the hero and the wheel zooms.
    {
      let orbit: { x: number; y: number } | null = null;
      this.canvas.addEventListener('contextmenu', (e) => { if (this.w3) e.preventDefault(); });
      this.canvas.addEventListener('pointerdown', (e) => {
        if (!this.w3 || this.message.isOpen) return;
        orbit = { x: e.clientX, y: e.clientY };
        this.canvas.setPointerCapture(e.pointerId);
      });
      this.canvas.addEventListener('pointermove', (e) => {
        if (!orbit || !this.w3) return;
        this.w3.cam.turn(-(e.clientX - orbit.x) * 0.006, (e.clientY - orbit.y) * 0.005);
        orbit = { x: e.clientX, y: e.clientY };
      });
      const end = () => (orbit = null);
      this.canvas.addEventListener('pointerup', end);
      this.canvas.addEventListener('pointercancel', end);
      this.canvas.addEventListener('wheel', (e) => { if (!this.w3) return; e.preventDefault(); this.w3.cam.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    }
    this.canvas.addEventListener('pointerdown', (e) => {
      // While a message is up, a tap anywhere advances it.
      if (this.message.isOpen) { if (!this.message.isChoosing) this.input.press('ok'); return; }
      if (this.w3) return;
      if (this.interpreter.running || !this.settings.tapToWalk) return;
      const p = this.pick(e);
      if (!p) return;
      this.showCursor(p);
      const tx = Math.floor(p.x), tz = Math.floor(p.z);
      // Tall sprites cover the ground behind them, so a tap may land one tile "above" the event.
      const ev = this.actionEventAt(tx, tz) ?? this.actionEventAt(tx, tz + 1);
      this.pendingEvent = ev;
      const pp = this.player.position;
      this.moveTarget = ev ? (([x, z]) => ({ x, z }))(ev.nearest(pp.x, pp.z)) : { x: p.x, z: p.z };
    });
  }

  private showCursor(p: THREE.Vector3 | null): void {
    if (!p) { this.cursor.visible = false; return; }
    const tx = Math.floor(p.x), tz = Math.floor(p.z);
    if (!this.map.inMap(tx, tz)) { this.cursor.visible = false; return; }
    this.cursor.visible = true;
    this.cursor.position.set(tx + 0.5, this.map.surfaceY(tx + 0.5, tz + 0.5) + 0.02, tz + 0.5);
    const ev = this.actionEventAt(tx, tz) ?? this.actionEventAt(tx, tz + 1);
    this.cursor.material.color.set(ev ? '#ffcf7a' : this.tileBlocked(tx, tz) ? '#ff5a5a' : '#ffffff');
  }

  /* ------------------------------------------------------------------ events */

  private actionEventAt(x: number, z: number): GameEvent | null {
    return this.events.find((e) => e.covers(x, z) && e.trigger === 'action') ?? null;
  }

  /** Update 156: the volumes the hero is inside (by id). */
  private readonly inVolumes = new Set<number>();
  /** Is a point inside a volume (a turned box)? */
  private static inVolume(v: Volume3D, x: number, y: number, z: number): boolean {
    const a = (-(v.ry ?? 0) * Math.PI) / 180, dx = x - v.x, dz = z - v.z;
    const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
    return Math.abs(lx) <= v.sx / 2 && Math.abs(lz) <= v.sz / 2 && y >= v.y - 0.2 && y <= v.y + v.sy;
  }
  /** Update 156: trigger volumes: walking in (or out) runs their event's page; only once ever if set so. */
  private updateVolumes(): boolean {
    const vols = this.mapData.volumes;
    if (!vols?.length) return false;
    const p = this.player.position;
    for (const v of vols) {
      const inside = Game.inVolume(v, p.x, p.y + 0.5, p.z), was = this.inVolumes.has(v.id);
      if (inside) this.inVolumes.add(v.id); else this.inVolumes.delete(v.id);
      if (v.kind !== 'trigger' || inside === was || (v.onExit ? inside : !inside)) continue;
      const key = `@vol:${this.mapName}:${v.id}`;
      if (v.once && this.state.getSwitch(key)) continue;
      const ev = this.events.find((e) => e.data.id === v.event);
      if (!ev?.page?.commands.length) continue;
      if (v.once) this.state.setSwitch(key, true);
      this.runEvent(ev);
      return true;
    }
    return false;
  }
  /** Update 156: the encounter zone of the volume the hero is in, if any. */
  private volumeZone(): string | null {
    const p = this.player.position;
    for (const v of this.mapData.volumes ?? []) if (v.kind === 'encounter' && v.zone && Game.inVolume(v, p.x, p.y + 0.5, p.z)) return v.zone;
    return null;
  }

  /** Update 155: 3D maps: touch events the hero is standing in (fired once until they step out). */
  private readonly touched3d = new Set<GameEvent>();
  /** Update 155: on a 3D map, the talk-to event in front of the hero (placed in 3D, within reach, about level). */
  private event3DAhead(): GameEvent | null {
    const w = this.w3!, p = this.player.position, ax = p.x + Math.sin(w.heading) * 0.6, az = p.z + Math.cos(w.heading) * 0.6;
    let best: GameEvent | null = null, bd = 1.3;
    for (const e of this.events) {
      const p3 = e.data.pos3;
      if (!p3 || e.trigger !== 'action' || !e.page || Math.abs(p3.y - p.y) > 1.6) continue;
      const d = Math.hypot(p3.x - ax, p3.z - az);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Distance from the player to the centre of the event's nearest tile. */
  private eventDistance(ev: GameEvent): number {
    const p = this.player.position, [x, z] = ev.nearest(p.x, p.z);
    return Math.hypot(x - p.x, z - p.z);
  }

  private tileBlocked(x: number, z: number): boolean {
    return this.map.isBlocked(x, z) || this.events.some((e) => e.solid && e.covers(x, z));
  }

  private runEvent(ev: GameEvent): void {
    if (ev.page?.respawn) this.setRespawn();
    if (!ev.page || !ev.page.commands.length) return;
    if (ev.onMap) {
      ev.facePlayer(this.player.position.x, this.player.position.z);
      this.player.faceToward(...ev.nearest(this.player.position.x, this.player.position.z));
    }
    this.moveTarget = null;
    this.pendingEvent = null;
    this.setSpeaker(ev);
    this.interpreter.start(ev.page.commands, ev.selfId);
  }

  /** Messages from this event float over it (or under it), as the player set in Settings. */
  private setSpeaker(ev: GameEvent | null): void {
    const pt = ev?.speakerPoint();
    if (!pt) { this.message.setSpeaker(null); return; }
    const at = (y: number) => { const p = this.projector(pt.x, y, pt.z); return p.on ? { x: p.x, y: p.y } : null; };
    this.message.setSpeaker({ head: () => at(pt.y + pt.height + 0.1), feet: () => at(pt.y - 0.05), character: pt.character });
  }

  private playerTile(): { x: number; z: number } {
    return { x: Math.floor(this.player.position.x), z: Math.floor(this.player.position.z) };
  }

  /* ------------------------------------------------------------------ frame */

  /** Frame timing for the FPS counter: smoothed frame time, and the slowest frame this second. */
  private fps = { el: null as HTMLElement | null, avg: 1 / 60, worst: 0, t: 0, frames: 0 };
  /** Build every shader the map needs before its first frame, so nothing stutters the first time it's seen. */
  private warmup = false;
  /** Things shown only so their shaders get made (a neighbour's lamps and flames), dropped after. */
  private readonly warmupTemp: THREE.Object3D[] = [];
  private shadowTick = 0;

  private updateFps(raw: number): void {
    const f = this.fps;
    if (!this.settings.showFps) { if (f.el) f.el.hidden = true; return; }
    if (!f.el) { f.el = document.createElement('div'); f.el.className = 'fps-meter'; f.el.setAttribute('aria-hidden', 'true'); this.ui.appendChild(f.el); }
    f.el.hidden = false;
    f.avg += (raw - f.avg) * 0.1;
    f.worst = Math.max(f.worst, raw);
    f.t += raw; f.frames++;
    if (f.t >= 0.5) {
      const fps = Math.round(f.frames / f.t);
      f.el.textContent = `${fps} FPS · ${(f.avg * 1000).toFixed(1)} ms · slowest ${(f.worst * 1000).toFixed(0)} ms`;
      f.el.dataset.level = fps >= 55 ? 'good' : fps >= 40 ? 'ok' : 'bad';
      f.t = 0; f.frames = 0; f.worst = 0;
    }
  }

  private frame(): void {
    const raw = this.clock.getDelta();
    this.updateFps(raw);
    const dt = Math.min(raw, 0.05);
    this.elapsed += dt;
    const paused = this.devConsole.isOpen || this.worldMap.isOpen || this.achScreen.isOpen || this.pauseShell.isOpen || this.menu.isOpen || this.saveScreen.isOpen || this.statusScreen.isOpen || this.equipScreen.isOpen || this.restScreen.isOpen || this.lockpick.isOpen || this.timePicker.isOpen || this.tutorialPop.isOpen || this.partyScreen.isOpen || this.charScreen.isOpen || this.creation.isOpen || this.bag.isOpen || this.shop.isOpen || this.skillScreen.isOpen || this.controls.isOpen || this.arranger.isOpen || this.creditsScreen.isOpen || this.logScreen.isOpen || this.questScreen.isOpen || this.recordsScreen.isOpen || this.bestiaryScreen.isOpen || this.evolve.isOpen;
    // The controller's buttons mean different things in menus and on the field.
    // A turn-based battle holds the field still (the world stays on screen behind it).
    const fighting = this.battle.active && !paused;
    this.input.mode = paused || fighting || this.battlePending || this.message.isOpen || this.interpreter.running || this.onTitle || !!this.transfer || this.dying ? 'menu' : 'field';
    this.input.pollGamepad(dt);
    if (!paused && !fighting) { this.time.update(dt); this.playTime += dt; this.updateExplored(dt); }
    if (!this.devConsole.isOpen) { this.applyCheats(); this.checkAchievements(dt); }
    if (!paused && !fighting && this.battleGrace > 0) this.battleGrace = Math.max(0, this.battleGrace - dt);
    document.body.classList.toggle('in-battle', this.battle.active);

    this.message.update(dt);
    // Arrived after respawning: fade back in (the player can already move).
    if (this.transferFadeIn && !this.transfer) { this.transferFadeIn = false; this.fade = { from: 1, to: 0, t: 0, duration: 0.8 }; }
    if (paused) {
      // Update 141: each button closes what it opened (B the Backpack once nothing's picked, X the Party menu, Y the
      // World Map, START Settings).
      const inp = this.input;
      if (this.pauseShell.isOpen && !this.menu.isOpen && inp.consume('party')) { this.closePause(); uiSound('menuBack'); }
      else if (this.bag.isOpen && this.bag.compact && this.bag.atTop && inp.consume('backpack')) { this.bag.close(); uiSound('menuBack'); inp.consume('cancel'); }
      else if (this.worldMap.isOpen && inp.consume('worldmap')) { this.worldMap.dismiss(); inp.consume('cancel'); }
      else if (this.settingsOpen && this.menu.isOpen && !this.controls.isOpen && inp.consume('settings')) { this.menu.close(); this.settingsOpen = false; uiSound('menuBack'); inp.consume('cancel'); }
      // The topmost screen takes the keys: shop, then bag, then the menu under them. The console freezes everything.
      if (this.devConsole.isOpen) { /* typing */ }
      else if (this.evolve.isOpen) this.evolve.update(dt);
      else if (this.creation.isOpen) this.creation.update();
      else if (this.worldMap.isOpen) this.worldMap.update(dt);
      else if (this.achScreen.isOpen) this.achScreen.update();
      else if (this.saveScreen.isOpen) this.saveScreen.update();
      else if (this.tutorialPop.isOpen) this.tutorialPop.update();
      else if (this.restScreen.isOpen) this.restScreen.update();
      else if (this.lockpick.isOpen) this.lockpick.update(dt);
      else if (this.timePicker.isOpen) this.timePicker.update();
      else if (this.equipScreen.isOpen) this.equipScreen.update();
      else if (this.partyScreen.isOpen) this.partyScreen.update();
      else if (this.charScreen.isOpen) this.charScreen.update();
      else if (this.statusScreen.isOpen) this.statusScreen.update();
      else if (this.creditsScreen.isOpen) this.creditsScreen.update(dt);
      else if (this.logScreen.isOpen) this.logScreen.update(dt);
      else if (this.recordsScreen.isOpen) this.recordsScreen.update(dt);
      else if (this.bestiaryScreen.isOpen) this.bestiaryScreen.update();
      else if (this.questScreen.isOpen) this.questScreen.update();
      else if (this.arranger.isOpen) this.arranger.update(dt);
      else if (this.controls.isOpen) this.controls.update();
      else if (this.skillScreen.isOpen) this.skillScreen.update();
      else if (this.shop.isOpen) this.shop.update(); else if (this.bag.isOpen) this.bag.update(); else this.menu.update();
      this.player.animate(dt, false);
    }
    else if (fighting) {
      // LB / RB (Q / E): the next or previous battle camera.
      if (this.stage) { if (this.input.consume('tabNext')) this.cycleCamera(1); if (this.input.consume('tabPrev')) this.cycleCamera(-1); }
      this.battle.update(dt); this.stage?.stage.update(dt); this.player.animate(dt, false);
    }
    else if (this.battlePending) this.player.animate(dt, false);
    else if (this.updateDying(dt) || this.updateTransfer()) this.player.animate(dt, false);
    else if (this.flight) this.updateFlight(dt);
    else if (this.interpreter.running) {
      this.interpreter.update(dt);
      this.player.animate(dt, false);
    } else {
      const auto = this.events.find((e) => e.trigger === 'auto' && !e.autoDone);
      if (auto) { auto.autoDone = true; this.runEvent(auto); }
      else if (this.timeWarp && this.timeWarp.pop < 0) this.player.animate(dt, false);
      else if (this.nextGlobal()) this.player.animate(dt, false);
      else {
        for (let k = 0; k < QUICK_SLOTS; k++) if (this.input.consume(`quick${k + 1}` as Action)) this.useQuick(k);
        this.updatePlayer(dt);
        this.updateParty(dt);
        this.updateEncounters();
      }
      this.updateFootsteps(dt);
      this.updateRipples(dt);
      this.updateReflection();
      this.updatePrints(paused ? 0 : dt);
      this.updateTileAilment(dt);
      this.updateFires(dt);
    }
    this.updateHorse(paused ? 0 : dt);
    if (this.flightPick) this.worldMap.update(dt);
    if (this.flyAway) this.updateFlyAway(paused ? 0 : dt);
    // Quests: carried items count towards collect objectives; the tracker follows along.
    if (!paused && !this.onTitle) this.quests.itemsChanged();
    this.tracker.update(this.quests);
    // Orbs, gold and items on the ground: frozen while paused; picked up only while the hero is free to move.
    if (!paused && !fighting && this.pickups) {
      const p = this.player.position;
      this.pickups.update(dt, p.x, p.y, p.z, !this.onTitle && !this.interpreter.running && !this.dying && !this.transfer && this.player.mesh.visible);
    }
    if ((this.xpBurst > 0 || this.goldBurst > 0) && (this.xpBurstT += dt) > 0.45) { if (this.xpBurst > 0) this.flushXp(); this.flushGold(); }
    for (const e of this.events) e.update(dt);
    this.updateFade(dt);
    if (this.outro && this.fade.t >= 1) {
      const done = this.outro.done;
      this.outro = null;
      done();
      // Back on the field: the picture fades in as its music and sounds return; a hero who reached a new form
      // transforms first, while the screen is still dark.
      this.battleSound = null;
      const fadeIn = () => { this.fade = { from: 1, to: 0, t: 0, duration: 1.4 }; };
      if (!this.nextEvolution(fadeIn)) fadeIn();
    }
    this.updateSleep(dt);
    this.updateTimeWarp(dt);
    // Characters always on top (Update 139): the hero and party drawn over props they overlap.
    // Update 142: off, the ground and props aren't pushed back either, so trees and ledges in front hide characters.
    // 2D mode (Update 145): layers decide, so no on-top copies.
    { const top = !!this.db.charactersOnTop && this.db.viewMode !== '2d'; setGroundYield(top); this.player.setOnTop(top); for (const a of this.allies) a.sprite.setOnTop(top); }
    document.body.classList.toggle('sleeping', this.sleepLook > 0.05);
    this.updateCamera(dt);
    this.updateBubbles();
    this.updateEnvironment(dt);
    if (!this.onTitle && !fighting) this.updateBody(dt);
    if (!this.onTitle && !fighting) this.updateChatter(dt);
    if (!this.onTitle && !fighting) this.updateAilments();
    if (!this.riding || fighting || this.onTitle || paused) this.speedLines.classList.remove('on');
    if (!this.onTitle && !fighting) this.combat.updateBack();
    if (this.buildings.length) { const p = this.player.position; fadeBuildings(this.buildings, p.x, p.y, p.z, dt); }

    // Potato: the drawing resolution follows the field (low) and battle maps (normal); neighbouring maps aren't drawn.
    if (this.settings.quality === 'potato' && this.renderer.getPixelRatio() !== Math.min(window.devicePixelRatio || 1, this.pixelCap)) this.resize();
    for (const pv of this.previews) pv.group.visible = this.settings.quality !== 'potato';
    // Performance quality: shadows are redrawn every other frame (half the shadow work; moving shadows lag a frame).
    const sm = this.renderer.shadowMap;
    if (this.settings.quality === 'performance') { sm.autoUpdate = false; if ((this.shadowTick++ & 1) === 0) sm.needsUpdate = true; }
    else sm.autoUpdate = true;
    if (this.warmup) {
      this.warmup = false;
      try { this.renderer.compile(this.stage?.stage.scene ?? this.scene, this.camera); } catch { /* best effort */ }
      for (const t of this.warmupTemp.splice(0)) { t.removeFromParent(); this.disposeTree(t); }
    }
    // In a turn-based battle the world behind is frozen: draw it a few times as the battle opens, then leave the
    // last picture on screen (the battle screen draws over it), which keeps tablets cool.
    this.battleFrames = this.battle.active ? this.battleFrames + 1 : 0;
    // On a battle map the stage is drawn instead (every frame: its fighters move).
    if (!this.titleCovered && (this.stage || this.battleFrames < 4 || this.fade.t < 1)) {
      const scene = this.stage?.stage.scene ?? this.scene;
      this.sky.attach(scene);
      this.ssao.render(scene, this.camera);
      this.post.render(scene, this.camera);
      if (this.snapWanted) {
        // Read the picture straight after drawing it (before the browser clears it).
        const c = document.createElement('canvas');
        c.width = this.canvas.width; c.height = this.canvas.height;
        c.getContext('2d')!.drawImage(this.canvas, 0, 0);
        const cb = this.snapWanted; this.snapWanted = null;
        cb(c);
      }
    }
    this.message.position();
    if (!this.onTitle) this.updateAudio(dt);
    this.hud.setRingActive(this.rings.active);
    this.hud.setRingKey(this.input.label('ring'));
    if (!this.faceShown) { this.portraitUrl ??= this.sprites.portrait('hero', this.db.characters[this.db.player], 48).toDataURL(); this.hud.setFace(this.portraitUrl); this.faceShown = true; }
    this.updateWeaponHud();
    this.hud.setQuick(this.inventory.quick.map((id) => {
      const d = id ? this.items.get(id) : undefined;
      return d ? { icon: this.itemIcon(d.id), name: d.name, count: this.inventory.count(d.id), key: d.kind === 'key' } : null;
    }), [1, 2, 3, 4].map((n) => this.input.label(`quick${n}` as Action)), this.combat.drawing !== null ? this.drawSlot : -1);
    this.hud.setLevel(this.progress.level, this.progress.xp, this.progress.toNext);
    this.hud.setSeason(this.season ?? '');
    this.hud.setGold(this.inventory.gold);
    this.updateMinimap(dt);
    this.overlay.update(dt);
    this.hud.update(dt, this.stats, {
      time: this.time.label(this.settings.clock12), night: this.time.night, hour: this.time.hour,
      weather: this.time.environment === 'outdoor' ? WEATHER_LABEL[this.weather.kind] : { indoor: 'Indoors', dark: 'Underground' }[this.time.environment],
      // The real-world date under the game time (and the season, outdoors).
      date: `${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${this.season ? ` · ${SEASON_NAMES[this.season]}` : ''}`,
      moon: this.moonInfo(),
      temp: formatTemp(this.temperature(), this.settings.tempUnit ?? 'F'),
      mount: this.riding && this.state.horse ? { sp: this.state.horse.sp, max: this.riding.stamina, tired: this.horseTired } : undefined,
    });
    this.debug.update(dt, this.time.hour, this.time.label(), this.post.lastDrawCalls, this.state.toJSON());
    this.input.endFrame();
  }

  private updatePlayer(dt: number): void {
    const i = this.input;
    // A solid hit freezes the action for a moment.
    if (this.combat.hitStop > 0) { this.combat.hitStop -= dt; return; }
    const fromX = this.player.position.x, fromZ = this.player.position.z;
    // (While fishing, Talk / interact reels in instead: see updateFishing.)
    // Update 155: on a 3D map, talking reaches the nearest event in front (and at about the same height).
    if (this.w3 && !this.fishing && i.peek('ok')) {
      const ev = this.event3DAhead();
      if (ev) { i.consume('ok'); i.consume('jump'); this.runEvent(ev); return; }
    }
    if (!this.fishing && i.consume('ok')) {
      const [fx, fz] = DIR_VECTOR[this.player.dir];
      const tx = Math.floor(this.player.position.x + fx * 0.75), tz = Math.floor(this.player.position.z + fz * 0.75);
      // A party member resting at camp, right in front: they say their camp line (Update 122).
      const pal = this.restingAllyAt(this.player.position.x + fx * 0.8, this.player.position.z + fz * 0.8);
      if (pal) { i.consume('jump'); this.talkAtCamp(pal); return; }
      // A respawn prop counts even when an event sits on it too (a campfire you can also talk at).
      const ev = this.actionEventAt(tx, tz), rest = this.respawnPropAt(tx, tz), fire = ev ? null : this.fireAt(tx, tz);
      const forge = ev || fire ? null : this.forgeAt(tx, tz);
      if (rest) this.setRespawn();
      // A controller's A both talks and jumps: talking wins when there's something to talk to.
      if (ev || rest || fire || forge) i.consume('jump');
      if (ev) { this.runEvent(ev); return; }
      if (fire) { this.openFire(fire); return; }
      if (forge) { this.openForge(); return; }
      // Beside the rented horse: get on.
      if (!rest && this.horseNear()) { i.consume('jump'); this.mount(); return; }
      // Facing a fishing spot: cast (with a rod in the bag).
      if (!rest) {
        const spot = this.fishSpotAhead();
        if (spot) {
          i.consume('jump');
          const rod = this.bestRod();
          if (rod) this.startFishing(spot, rod); else this.menu.notice('A good fishing spot. You need a fishing rod.');
        }
      }
    }
    // Fishing: the hero stands still with the rod out (moving, jumping or attacking reels in).
    if (this.fishing) this.updateFishing(dt);
    // Update 141: START Settings, X Party (and the Journal), B the Backpack, Y the World Map.
    // Update 142: riding, holding B (or Esc) gets off the horse; a quick press still opens the menu on letting go.
    const riding = !!this.state.horse?.mounted;
    const held = this.dismountHold;
    if (held) {
      if (i.isHeld(held.action)) {
        held.t += dt;
        if (held.t >= DISMOUNT_HOLD) { this.dismountHold = null; if (riding && !this.motion.airborne) this.dismount(); }
      } else {
        this.dismountHold = null;
        if (held.action === 'backpack') this.openBackpack(); else this.openSettingsMenu();
        return;
      }
    }
    if (!this.motion.airborne && !this.motion.climbing) {
      const wantSettings = i.consume('settings') || i.consume('cancel'), wantBag = i.consume('backpack');
      if (riding && (wantSettings || wantBag)) this.dismountHold = { action: wantBag ? 'backpack' : 'settings', t: 0 };
      else if (wantSettings) { this.openSettingsMenu(); return; }
      else if (wantBag) { this.openBackpack(); return; }
      if (i.consume('party')) { this.openPauseMenu(); return; }
      if (i.consume('worldmap')) { this.openWorldMap(); return; }
    }
    // Riding: the Spell key (F, if still bound) gets off the horse (the Ride horse key item does too).
    if (this.state.horse?.mounted && !this.motion.airborne && i.consume('ring')) this.dismount();
    // (Update 141: no spells cast on the map; shards are for battles. Light and Water Walk are key items.)
    i.consume('ring'); i.consume('magic');

    let dx = (i.isHeld('right') ? 1 : 0) - (i.isHeld('left') ? 1 : 0);
    let dz = (i.isHeld('down') ? 1 : 0) - (i.isHeld('up') ? 1 : 0);
    // A controller's stick walks at any angle.
    if (i.stick.x || i.stick.y) { dx = i.stick.x; dz = i.stick.y; }
    if (this.fishing) dx = dz = 0;
    if (dx || dz) { this.moveTarget = null; this.pendingEvent = null; }
    else if (this.moveTarget) {
      const p = this.player.position;
      if (this.pendingEvent && this.eventDistance(this.pendingEvent) < INTERACT_RANGE) {
        this.runEvent(this.pendingEvent);
        return;
      }
      const ex = this.moveTarget.x - p.x, ez = this.moveTarget.z - p.z, d = Math.hypot(ex, ez);
      if (d < 0.06) this.moveTarget = null;
      else { dx = ex / d; dz = ez / d; }
    }

    if (dx || dz) { const len = Math.hypot(dx, dz); dx /= len; dz /= len; }
    // Confused: the directions are scrambled. Frozen, paralysed, asleep or staggered: no moving or acting at all.
    [dx, dz] = this.combat.heroStatus.scramble(dx, dz);
    const stunned = this.combat.heroStunned;
    if (stunned) { dx = dz = 0; for (const a of ['jump', 'melee', 'bow', 'magic', 'attack', 'switchWeapon', 'ring'] as Action[]) i.consume(a); }
    const m = this.motion;
    // Space jumps; 1–3 use the sword, bow and spells, Q / Tab lock on, C sneaks.
    // Update 142: A can be a field power instead of Jump (Database → Player → A button).
    const aPower = this.db.aButton && this.db.aButton !== 'jump' ? this.db.aButton : null;
    const space = !aPower && i.consume('jump');
    if (aPower && i.consume('jump') && !stunned) this.aButtonPower(aPower);
    if (!stunned) this.combat.handleInput(i);
    // With "Always run" on, Shift walks instead.
    // On a controller, pushing the stick all the way runs (Settings → Gameplay).
    const stickRun = this.settings.stickRun && i.stickAmount > 0.92;
    i.sprintToggle = this.settings.sprint === 'toggle';
    if (!i.sprintToggle) i.runLatched = false;
    const sprint = (this.state.sprint && this.carries('dash')) || (this.db.aButton === 'dash' && i.isHeld('jump'));
    const run = sprint || (this.settings.alwaysRun ? !i.isHeld('run') : i.isHeld('run') || i.runLatched || i.touchRun || stickRun);
    const scale = this.combat.speedScale * this.cheats.speed * (this.riding ? 1 : 1 - slowOf(this.weatherStates.get(mainHero(this.db).id) ?? null, this.bodyCfg));
    const res = this.w3 ? this.move3D(dt, dx, dz, run, space, scale) : m.update(dt, { dx, dz, run, jump: space, sneak: this.combat.sneaking, speedScale: scale });
    if (!this.w3 && !m.airborne && !m.climbing && this.trySeamless(dx, dz)) return;
    // Locked on, the hero keeps facing the target (strafing); otherwise they face where they walk, unless attacking.
    const lock = this.combat.lock;
    if (lock) this.player.faceToward(lock.x, lock.z);
    else if (res.face && !this.combat.busy) this.player.faceVector(...DIR_VECTOR[res.face]);
    this.applySkillStats();
    const rh = this.riding;
    this.stats.update(dt, { running: m.running && res.moving && !rh, climbing: m.climbing, swimming: m.swimming, jumped: !!res.jumped && !rh, mpDrain: this.rings.mpDrain * this.spellThrift });
    // Riding: the horse's own stamina (galloping and jumping use it; walking and standing bring it back).
    this.horseMoving = res.moving && !m.airborne;
    // Galloping: speed lines streak in from the screen's edges (Update 115).
    this.speedLines.classList.toggle('on', !!rh && m.running && res.moving && !this.horseTired);
    if (rh && this.state.horse) {
      const hs = this.state.horse;
      if (res.jumped) hs.sp -= JUMP_COST;
      hs.sp = m.running && res.moving ? hs.sp - GALLOP_COST * dt : Math.min(rh.stamina, hs.sp + REST_GAIN * dt);
      if (hs.sp <= 0) { hs.sp = 0; if (!this.horseTired) this.menu.notice(`${rh.name} is out of breath`); this.horseTired = true; }
      else if (this.horseTired && hs.sp >= rh.stamina * RECOVER_AT) this.horseTired = false;
    }
    // Out of magic: the ring's power fades.
    if (this.rings.active && this.rings.mpDrain > 0 && this.stats.mp <= 0) { this.rings.off(); this.menu.notice(`${this.rings.ring?.name ?? 'The spell'} fades: out of MP`); }
    // Water Walk switches itself off when the hero walks from water back onto land.
    if (this.rings.waterWalk) {
      const wet = !!this.map.footWaterAt(Math.floor(m.x), Math.floor(m.z));
      if (wet) this.tideOnWater = true;
      else if (this.tideOnWater && !m.airborne) {
        this.rings.off(); this.tideOnWater = false;
        this.audio.play('ringOff');
        this.menu.notice(`${this.rings.ring?.name ?? 'Water Walk'} off: back on land`);
      }
    }
    if (res.jumped) {
      this.audio.play('jump'); this.state.tally('jumps');
      // Where the jump started: party members following hop there too.
      this.jumpMarks.push({ id: ++this.jumpCount, x: m.x, z: m.z });
      if (this.jumpMarks.length > 12) this.jumpMarks.shift();
    }
    if (m.swimming && !this.wasSwimming) this.audio.play('splash', m.x, m.z);
    this.wasSwimming = m.swimming;
    this.combat.setMoving(res.moving);
    this.combat.toolsOff = this.state.weaponsOff;
    this.combat.update(dt);
    if (this.stats.dead) { this.die(); return; }
    if (res.fell) {
      // Missed the jump: a quick blink back to where it started.
      this.post.fade = 1;
      this.fade = { from: 1, to: 0, t: 0, duration: 0.4 };
      this.moveTarget = null;
      this.pendingEvent = null;
    }
    this.blockedFor = res.blocked ? this.blockedFor + dt : 0;
    // Give a blocked walk a moment first: pushing against a climbable wall starts a climb.
    if (this.blockedFor > 0.35 && this.moveTarget) {
      // Blocked: if we were walking to an event and got close, talk to it; otherwise give up.
      const pe = this.pendingEvent;
      if (pe && this.eventDistance(pe) < INTERACT_RANGE + 0.5) { this.syncPlayer(); this.runEvent(pe); return; }
      this.moveTarget = null;
      this.pendingEvent = null;
    }
    // Animated sheets have their own run, jump, climb and combat-stance animations; walk-only sheets speed up instead.
    // Riding: the hero sits still while the horse walks.
    if (rh) this.player.animate(dt, { moving: false, riding: true });
    else if (this.player.animated) this.player.animate(dt * (m.crawling ? 0.7 : 1), { moving: res.moving, running: m.running, airborne: m.airborne, climbing: m.climbing, combat: this.combat.locked, swimming: m.swimming });
    else this.player.animate(dt * (m.running ? 1.6 : m.crawling ? 0.7 : 1), res.moving && !m.airborne);
    this.syncPlayer(dt);
    if (m.airborne || m.climbing) return;

    // Update 156: trigger volumes.
    if (this.w3 && this.updateVolumes()) return;
    // Update 155: 3D maps: touch events placed in 3D fire when the hero walks into them (once each time).
    if (this.w3) {
      const p = this.player.position;
      for (const e of this.events) {
        const p3 = e.data.pos3;
        if (!p3 || e.trigger !== 'touch' || !e.page) continue;
        const near = Math.hypot(p3.x - p.x, p3.z - p.z) < 0.75 && Math.abs(p3.y - p.y) < 1.4;
        if (near && !this.touched3d.has(e)) { this.touched3d.add(e); this.runEvent(e); return; }
        if (!near && Math.hypot(p3.x - p.x, p3.z - p.z) > 1.1) this.touched3d.delete(e);
      }
    }
    // Touch triggers fire when the player steps onto a new tile.
    const t = this.playerTile();
    if (t.x !== this.lastTile.x || t.z !== this.lastTile.z) {
      this.lastTile = t;
      const ev = this.events.find((e) => e.covers(t.x, t.z) && e.trigger === 'touch');
      if (ev) { this.runEvent(ev); return; }
    }
    // ...or when the player walks into one that can't be stepped onto (solid, or up on a wall: a cave mouth, a door),
    // pushing against it for a moment.
    const p = this.player.position, push = Math.hypot(dx, dz);
    const stuck = Math.hypot(p.x - fromX, p.z - fromZ) < dt * 0.6;
    const ax = push ? Math.floor(p.x + (dx / push) * 0.6) : t.x, az = push ? Math.floor(p.z + (dz / push) * 0.6) : t.z;
    const ahead = push && stuck && (ax !== t.x || az !== t.z) ? this.events.find((e) => e.trigger === 'touch' && e.covers(ax, az)) : undefined;
    if (ahead && (ahead.solid || this.map.step(ax, az) !== this.map.step(t.x, t.z) || this.map.isBlocked(ax, az))) {
      if ((this.bumpT += dt) > 0.15) { this.bumpT = 0; this.runEvent(ahead); }
    } else this.bumpT = 0;
  }

  /* ---------------------------------------------------------------- horses */

  /** The horse being ridden (its Database entry), or null. */
  private get riding(): HorseDef | null { const h = this.state.horse; return h?.mounted ? findHorse(this.db, h.id) ?? null : null; }
  /** The ridden horse ran out of stamina: no galloping until it gets some back. */
  private horseTired = false;
  private horseMoving = false;
  private horseSprite: CharacterSprite | null = null;
  private horseLook = '';

  /** A stable: rent a horse (one at a time), or send yours home first. */
  private stableCommands(c: Extract<Command, { cmd: 'stable' }>): Command[] {
    const speaker = c.name || 'Stable keeper', h = this.state.horse;
    if (h) {
      const have = findHorse(this.db, h.id), where = h.mounted ? 'with you' : h.map === this.mapName ? 'just outside' : `at ${h.map.replace(/[_-]+/g, ' ')}`;
      return [{ cmd: 'text', speaker, text: `You already have ${have?.name ?? 'a horse'} (${where}). One at a time! Send it home first: here, or with a Saddle from your bag.` },
        { cmd: 'choice', options: ['Send it home', 'Never mind'], branches: [[{ cmd: 'horse', op: 'home' }], []], cancel: 1 }];
    }
    const list = horseList(this.db).filter((x) => !c.horses?.length || c.horses.includes(x.id));
    if (!list.length) return [{ cmd: 'text', speaker, text: 'No horses today, sorry.' }];
    return [{ cmd: 'text', speaker, text: `Need a horse? Faster on the road, and it jumps gaps. (You have ${this.inventory.gold} G.)` },
      { cmd: 'choice', options: [...list.map((x) => `${x.name} ${stars(x.tier)} · ${x.price} G`), 'Never mind'], branches: [...list.map((x) => [{ cmd: 'horse', op: 'rent', id: x.id }] as Command[]), []], cancel: list.length }];
  }

  /** Rent a horse, send it home, get on or off (stables, the Saddle and events). What to say, if anything. */
  private horseCommand(c: Extract<Command, { cmd: 'horse' }>): string | null {
    const h = this.state.horse;
    switch (c.op) {
      case 'rent': {
        const d = findHorse(this.db, c.id) ?? horseList(this.db)[0];
        if (!d) return null;
        if (h) return 'You already have a horse: send it home first.';
        if (!c.free) {
          if (this.inventory.gold < d.price) return `Not enough gold: ${d.name} costs ${d.price} G.`;
          this.inventory.gold -= d.price;
          this.audio.play('coin');
        }
        const spot = this.horseSpot();
        this.state.horse = { id: d.id, map: this.mapName, x: spot.x, z: spot.z, dir: this.player.dir, sp: d.stamina };
        this.horseTired = false;
        // A Saddle comes with it (to send it home from anywhere), if the game has one.
        const saddle = [...this.items.values()].find((x) => x.saddle);
        if (saddle && this.inventory.count(saddle.id) < 1) this.inventory.add(saddle.id, 1);
        this.log.add(`Rented ${d.name}`, 'loot');
        return `${d.name} is yours to ride! ${this.input.label('ok')} beside it to get on, ${this.input.label('ring')} to get off.`;
      }
      case 'home': {
        if (!h) return 'You don’t have a horse.';
        const d = findHorse(this.db, h.id);
        this.state.horse = null;
        this.horseTired = false;
        this.syncPlayer();
        this.log.add(`${d?.name ?? 'Your horse'} went home`, 'info');
        return `${d?.name ?? 'Your horse'} trots off home to its stable.`;
      }
      case 'mount': if (h && !h.mounted) { if (h.map !== this.mapName) { h.map = this.mapName; h.x = this.motion.x; h.z = this.motion.z; } this.mount(); } return null;
      case 'dismount': this.dismount(); return null;
    }
    return null;
  }

  /** Where a newly rented horse stands: a free spot beside the hero. */
  private horseSpot(): { x: number; z: number } {
    const m = this.motion, [fx, fz] = DIR_VECTOR[this.player.dir];
    for (const [ax, az] of [[fz, -fx], [-fz, fx], [-fx, -fz], [fx, fz]]) {
      const x = m.x + ax * 1.2, z = m.z + az * 1.2;
      if (m.groundFree(x, z, m.y)) return { x, z };
    }
    return { x: m.x, z: m.z };
  }

  /** Close enough to the (unridden) horse to get on. */
  private horseNear(): boolean {
    const h = this.state.horse;
    return !!h && !h.mounted && h.map === this.mapName && !this.motion.swimming && Math.hypot(h.x - this.motion.x, h.z - this.motion.z) < 1.5;
  }

  private mount(): void {
    const h = this.state.horse, m = this.motion;
    if (!h || h.mounted) return;
    if (h.map === this.mapName && m.groundFree(h.x, h.z, m.y)) m.place(h.x, h.z);
    h.mounted = true;
    this.player.faceVector(...DIR_VECTOR[h.dir]);
    this.audio.play('jump');
    this.syncPlayer();
  }

  /** Off the horse: it stays where it is (saved on this map); the hero steps down beside it. */
  private dismount(): void {
    const h = this.state.horse, m = this.motion;
    if (!h?.mounted) return;
    h.mounted = false;
    h.map = this.mapName; h.x = m.x; h.z = m.z; h.dir = this.player.dir;
    const [fx, fz] = DIR_VECTOR[this.player.dir];
    // Step down beside it: either side, behind, in front, then the corners.
    const tries = [[fz, -fx], [-fz, fx], [-fx, -fz], [fx, fz], [fz - fx, -fx - fz], [-fz - fx, fx - fz], [fz + fx, fz - fx], [fx - fz, fx + fz]];
    for (const r of [0.9, 1.3]) {
      const t = tries.find(([ax, az]) => { const l = Math.hypot(ax, az); return m.groundFree(m.x + (ax / l) * r, m.z + (az / l) * r, m.y); });
      if (t) { const l = Math.hypot(t[0], t[1]); m.place(m.x + (t[0] / l) * r, m.z + (t[1] / l) * r); break; }
    }
    this.horseTired = false;
    this.audio.play('jump');
    this.syncPlayer();
  }

  /** Arriving on a map riding: the horse comes along, or waits outside an indoor map (where the hero left from). */
  private horseArrive(name: string, data: MapData, fromMap: string, fromPos: { x: number; z: number } | null): void {
    const h = this.state.horse;
    if (!h?.mounted) return;
    if ((data.environment ?? 'outdoor') !== 'outdoor' && fromMap && fromPos) {
      h.mounted = false; h.map = fromMap; h.x = fromPos.x; h.z = fromPos.z;
      this.horseTired = false;
      this.syncPlayer();
      this.menu.notice(`${findHorse(this.db, h.id)?.name ?? 'Your horse'} waits outside`);
    } else h.map = name;
  }

  /** The horse on the map: under the rider, or standing where it was left (getting its breath back). */
  private updateHorse(dt: number): void {
    const h = this.state.horse, d = h ? findHorse(this.db, h.id) : undefined;
    if (!h || !d) { if (this.horseSprite) { this.horseSprite.mesh.removeFromParent(); this.horseSprite = null; } return; }
    const look = `${d.color}|${d.mane}`;
    if (!this.horseSprite || this.horseLook !== look) {
      this.horseSprite?.mesh.removeFromParent();
      this.horseSprite = new CharacterSprite(this.sprites, this.sprites.sheet(horseSheet(d.color, d.mane)), h.dir);
      this.horseSprite.mesh.scale.setScalar(HORSE_SCALE);
      this.horseLook = look;
      this.scene.add(this.horseSprite.mesh);
    }
    const s = this.horseSprite, m = this.motion;
    s.mesh.visible = !this.onTitle && !this.battle.active && !this.flight && !!m && (h.mounted ? this.player.mesh.visible : h.map === this.mapName);
    if (!h.mounted) h.sp = Math.min(d.stamina, h.sp + REST_GAIN * dt);
    if (!s.mesh.visible) return;
    if (h.mounted) {
      // Under the rider (syncPlayer lifts the rider into the saddle and decides who draws in front).
      s.position.set(m.x, m.y, m.z);
      s.faceVector(...DIR_VECTOR[this.player.dir]);
      s.animate(dt * (m.running ? 1.9 : 1.1), this.horseMoving);
      h.dir = this.player.dir;
    } else {
      s.position.set(h.x, this.map.standY(h.x, h.z), h.z);
      s.faceVector(...DIR_VECTOR[h.dir]);
      s.animate(dt, false);
    }
  }

  /* ---------------------------------------------------------------- griffin flights */

  /** Picking a flight on the world map, the flight itself, and the griffin flying off after landing. */
  private flightPick = false;
  private flight: { group: THREE.Group; griffin: CharacterSprite; to: { x: number; z: number }; t: number; dur: number; dest: RoostState; phase: 'in' | 'fly' | 'out' } | null = null;
  private flyAway: { sprite: CharacterSprite; t: number; dx: number; dz: number } | null = null;

  /** A griffin master: this roost opens (the hero lands here), then the world map to fly to another. */
  private roostCommands(c: Extract<Command, { cmd: 'roost' }>): Command[] {
    if (c.pick) { this.openFlightPick(c.id); return []; }
    const speaker = c.speaker || 'Griffin master', isNew = !this.state.roosts.has(c.id);
    this.state.roosts.set(c.id, { name: c.name || c.id, map: this.mapName, x: this.motion.x, z: this.motion.z });
    const out: Command[] = [];
    if (isNew) { out.push({ cmd: 'text', speaker, text: `The ${c.name || c.id} roost is open to you now: fly back here from any other roost.` }); this.log.add(`Roost unlocked: ${c.name || c.id}`, 'info'); }
    if (c.unlockOnly) return out;
    if (this.state.roosts.size < 2) { out.push({ cmd: 'text', speaker, text: 'No other roost knows you yet. Talk to the griffin masters in other towns, and you can fly between them.' }); return out; }
    out.push({ cmd: 'text', speaker, text: 'Where to? Pick a roost on the map.' }, { cmd: 'roost', id: c.id, name: c.name, pick: true });
    return out;
  }

  /** Where a roost is in the World layout (null: its map isn't laid out). */
  private roostWorld(r: RoostState): { x: number; z: number } | null {
    const at = this.db.world?.maps[r.map];
    return at ? { x: at.x + r.x, z: at.z + r.z } : null;
  }

  /** A flight's price: the base, plus so much a tile of distance (60 tiles when a map isn't laid out). */
  private flightPrice(a: RoostState, b: RoostState): number {
    const t = this.db.travel, pa = this.roostWorld(a), pb = this.roostWorld(b);
    const dist = pa && pb ? Math.hypot(pb.x - pa.x, pb.z - pa.z) : 60;
    return Math.max(0, Math.round((t?.flightBase ?? 20) + (t?.flightPerTile ?? 0.5) * dist));
  }

  private openFlightPick(fromId: string): void {
    const from = this.state.roosts.get(fromId);
    if (!from) return;
    const others = [...this.state.roosts].filter(([id]) => id !== fromId);
    this.drawWorldArt();
    const here = this.roostWorld(from) ?? { x: 0, z: 0 };
    const spots: PickSpot[] = others.map(([, r], k) => {
      const at = this.roostWorld(r) ?? { x: here.x + 8 + k * 4, z: here.z - 6 }, price = this.flightPrice(from, r), poor = this.inventory.gold < price;
      return { x: at.x, z: at.z, label: r.name, detail: `${price} G${poor ? ' (not enough gold)' : ''}`, disabled: poor };
    });
    this.flightPick = true;
    this.worldMap.pickSpot(`Fly from ${from.name} (you have ${this.inventory.gold} G)`, spots, (k) => {
      this.flightPick = false;
      if (k === null) return;
      const dest = others[k][1], price = this.flightPrice(from, dest);
      if (this.inventory.gold < price) return;
      this.inventory.gold -= price;
      this.audio.play('coin');
      this.log.add(`Flight to ${dest.name}: ${price} G`, 'info');
      this.interpreter.stop();
      this.startFlight(from, dest);
    });
  }

  /** Take off: the screen fades, then the griffin flies the route over the World layout's maps. */
  private startFlight(from: RoostState, dest: RoostState): void {
    if (this.state.horse?.mounted) this.dismount();
    const a = this.roostWorld(from) ?? { x: 0, z: 0 }, b0 = this.roostWorld(dest), b = b0 && (b0.x !== a.x || b0.z !== a.z) ? b0 : { x: a.x + 60, z: a.z };
    const speed = Math.max(2, this.db.travel?.flightSpeed ?? 12), dist = Math.hypot(b.x - a.x, b.z - a.z);
    // Local coordinates: the take-off point at the origin.
    const group = new THREE.Group();
    group.name = 'flight';
    group.add(this.flightGround(a, b));
    const griffin = new CharacterSprite(this.sprites, this.sprites.sheet(griffinSheet()), 'right');
    griffin.mesh.scale.setScalar(1.8);
    group.add(griffin.mesh);
    group.visible = false;
    this.scene.add(group);
    this.flight = { group, griffin, to: { x: b.x - a.x, z: b.z - a.z }, t: 0, dur: dist / speed + 2.6, dest, phase: 'in' };
    this.moveTarget = null;
    this.audio.play('transfer');
    this.fade = { from: this.post.fade, to: 1, t: 0, duration: 0.6 };
  }

  /**
   * The ground under a flight: forest (lighter "theme" scenery) with the World layout's maps drawn from above where
   * they are, and pine trees standing in the forest.
   */
  private flightGround(a: { x: number; z: number }, b: { x: number; z: number }): THREE.Group {
    const out = new THREE.Group(), M = 40;
    const minX = Math.min(a.x, b.x) - M, maxX = Math.max(a.x, b.x) + M, minZ = Math.min(a.z, b.z) - M, maxZ = Math.max(a.z, b.z) + M;
    const bw = maxX - minX, bh = maxZ - minZ, ppt = Math.max(1, Math.min(4, Math.floor(4096 / Math.max(bw, bh))));
    const c = document.createElement('canvas');
    c.width = Math.ceil(bw * ppt); c.height = Math.ceil(bh * ppt);
    const g = c.getContext('2d')!;
    g.fillStyle = '#2c5228'; g.fillRect(0, 0, c.width, c.height);
    // Forest: clumps of greens.
    const greens = ['#24461f', '#335f2c', '#3f7034', '#2a5226'];
    for (let i = 0; i < (bw * bh) / 3; i++) {
      g.fillStyle = greens[i % greens.length];
      g.beginPath(); g.arc(Math.random() * c.width, Math.random() * c.height, ppt * (0.6 + Math.random() * 1.2), 0, Math.PI * 2); g.fill();
    }
    // The laid-out maps, as drawn for the world map.
    const pieces: { x: number; z: number; w: number; h: number }[] = [];
    for (const [name, at] of Object.entries(this.db.world?.maps ?? {})) {
      const art = this.worldArt.get(name);
      if (at.x + at.w < minX || at.x > maxX || at.z + at.h < minZ || at.z > maxZ) continue;
      pieces.push(at);
      if (art) { g.imageSmoothingEnabled = false; g.drawImage(art, (at.x - minX) * ppt, (at.z - minZ) * ppt, at.w * ppt, at.h * ppt); }
      else { g.fillStyle = '#6a7a52'; g.fillRect((at.x - minX) * ppt, (at.z - minZ) * ppt, at.w * ppt, at.h * ppt); }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.magFilter = THREE.NearestFilter;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((minX + maxX) / 2 - a.x, 0, (minZ + maxZ) / 2 - a.z);
    plane.receiveShadow = true;
    plane.userData.own = true;
    out.add(plane);
    // Pines in the forest (not on the maps), a few hundred near the route.
    const pine = this.sprites.get('pine');
    for (let i = 0; i < 360; i++) {
      const k = Math.random(), x = a.x + (b.x - a.x) * k + (Math.random() - 0.5) * 50, z = a.z + (b.z - a.z) * k + (Math.random() - 0.5) * 50;
      if (pieces.some((p) => x >= p.x && x < p.x + p.w && z >= p.z && z < p.z + p.h)) continue;
      const m = new THREE.Mesh(pine.geometry, pine.material);
      m.position.set(x - a.x, 0, z - a.z);
      m.scale.setScalar(1.2 + Math.random() * 0.6);
      out.add(m);
    }
    return out;
  }

  private updateFlight(dt: number): void {
    const f = this.flight!;
    if (f.phase === 'in') {
      if (this.fade.t < 1) return;
      // Dark: switch to the flight, then fade back in.
      f.phase = 'fly';
      if (this.level) this.level.visible = false;
      f.group.visible = true;
      this.fade = { from: 1, to: 0, t: 0, duration: 0.8 };
    }
    f.t += dt;
    const ease = (x: number) => x * x * (3 - 2 * x);
    const H = 6, up = Math.min(1, f.t / 1.3), down = Math.min(1, Math.max(0, (f.dur - f.t) / 1.3));
    const k = ease(Math.max(0, Math.min(1, (f.t - 0.6) / Math.max(0.1, f.dur - 1.2))));
    const len = Math.hypot(f.to.x, f.to.z) || 1, px = -f.to.z / len, pz = f.to.x / len, sway = Math.sin(f.t * 0.6) * 1.2 * Math.min(up, down);
    const x = f.to.x * k + px * sway, z = f.to.z * k + pz * sway, y = H * ease(Math.min(up, down)) + 0.1;
    f.griffin.position.set(x, y, z);
    f.griffin.faceVector(f.to.x, f.to.z);
    f.griffin.animate(dt * 1.4, true);
    this.player.position.set(x, y + 1.0, z + 0.04);
    this.player.animate(dt, false);
    if (f.phase === 'fly' && f.t >= f.dur - 0.5) {
      // Landing: the screen fades and the hero is set down at the roost.
      f.phase = 'out';
      const dest = f.dest;
      this.requestTransfer(dest.map, { x: dest.x, z: dest.z, dir: 'down' }, 'black', {
        before: () => { this.endFlight(); },
        after: () => this.startFlyAway(),
      });
    }
  }

  private endFlight(): void {
    const f = this.flight;
    if (!f) return;
    f.group.removeFromParent();
    // The ground was made for this flight: let it go (the trees share the map's pine).
    f.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.userData.own) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose(); mat.dispose(); m.geometry.dispose();
    });
    if (this.level) this.level.visible = true;
    this.flight = null;
  }

  /** Just landed: the griffin flaps up and away from beside the hero. */
  private startFlyAway(): void {
    const s = new CharacterSprite(this.sprites, this.sprites.sheet(griffinSheet()), 'right');
    s.mesh.scale.setScalar(1.8);
    const p = this.player.position;
    s.position.set(p.x - 0.8, p.y, p.z - 0.3);
    this.scene.add(s.mesh);
    this.flyAway = { sprite: s, t: 0, dx: 1, dz: -0.6 };
    this.audio.play('jump');
  }

  private updateFlyAway(dt: number): void {
    const f = this.flyAway!;
    f.t += dt;
    const s = f.sprite;
    s.position.x += f.dx * dt * (2 + f.t * 6);
    s.position.z += f.dz * dt * (2 + f.t * 6);
    s.position.y += dt * (1.5 + f.t * 4);
    s.faceVector(f.dx, f.dz);
    s.animate(dt * 1.6, true);
    if (f.t > 3.2) { s.mesh.removeFromParent(); this.flyAway = null; }
  }

  /** Out of health: fade out, then back to the respawn point with full stats. */
  private die(): void {
    if (this.dying) return;
    // The horse stays where its rider fell.
    this.dismount();
    this.dying = 1;
    // Out of health while swimming: the hero sinks under and drowns.
    this.drowning = this.motion.swimming;
    if (this.drowning) { this.audio.play('splash', this.motion.x, this.motion.z); this.log.add('You sink beneath the water…', 'hurt'); }
    this.state.tally('deaths');
    this.rings.off();
    this.combat.reset();
    // Animated sheets fall down (the hurt animation) and stay down while the screen fades.
    this.player.play('hurt', 0.55, 0, () => this.player.hold('hurt', 5));
    this.moveTarget = null;
    this.pendingEvent = null;
    this.fade = { from: this.post.fade, to: 1, t: 0, duration: this.drowning ? 1.6 : 0.6 };
  }
  private drowning = false;

  /* ------------------------------------------------------------------ respawn points, saving */

  /** Is there a prop marked "Is respawn point" on this tile? */
  private respawnPropAt(x: number, z: number): boolean {
    return this.mapData.props.some((p) => {
      const d = this.sprites.def(p.type);
      if (!d?.respawn) return false;
      return propCovers(d, p, x, z);
    });
  }

  /** Come back here after losing all health: where the player stands now. */
  /** A full rest: health, magic and stamina to full, ailments cured (Zombie needs its own cure). */
  private fullRest(quiet = false): void {
    this.stats.refill();
    for (const a of this.fighters) { const n = this.allyNumbers(a.data, a.def); a.data.hp = n.max.hp; a.data.mp = n.max.mp; if (a.down || !a.resting) { a.sprite.hold(null); a.sprite.mesh.rotation.z = 0; } a.data.down = false; }
    for (const m of this.party.members) if (!this.allies.some((a) => a.data === m)) { m.down = false; m.hp = this.stats.cfg.max.hp; m.mp = this.stats.cfg.max.mp; }
    this.combat.heroStatus.cure(['all']);
    this.clearLingering(['all']);
    const p = this.player.position;
    this.bursts.spawn(p.x, p.y + 0.6, p.z, { color: '#9be8a0', n: 20, speed: 1.2, up: 2.4, life: 0.8, size: 0.08, gravity: -0.5, additive: true });
    this.audio.play('save');
    if (!quiet) { this.menu.notice('Rested: health, magic and stamina restored'); this.state.tally('rests'); }
  }

  private setRespawn(): void {
    const p = this.motion;
    const already = this.respawnPoint && this.respawnPoint.map === this.mapName && Math.hypot(this.respawnPoint.x - p.x, this.respawnPoint.z - p.z) < 1.5;
    this.respawnPoint = { map: this.mapName, x: p.x, z: p.z, dir: this.player.dir };
    if (!already) this.menu.notice('Respawn point set');
  }

  private snapshot(): SaveData {
    return {
      version: SAVE_VERSION, savedAt: Date.now(), playTime: this.playTime,
      map: this.mapName, mapTitle: this.mapData.name || this.mapName,
      x: this.motion.x, z: this.motion.z, dir: this.player.dir, hour: this.time.hour,
      state: this.state.toJSON(),
      gauges: { hp: this.stats.hp, mp: this.stats.mp, sp: this.stats.sp },
      ...(this.combat.heroStatus.list.length ? { status: this.combat.heroStatus.toJSON() } : {}),
      ...(Object.keys(this.heroAilments).length ? { heroAilments: { ...this.heroAilments } } : {}),
      inventory: this.inventory.toJSON(),
      progress: this.progress.toJSON(),
      ...(this.party.members.length ? { party: this.party.toJSON() } : {}),
      ...(this.heroAt ? { heroAt: this.heroAt } : {}),
      ...(this.visited.size ? { visited: [...this.visited] } : {}),
      ...(this.explored.size ? { explored: Object.fromEntries([...this.explored].map(([k, e]) => [k, { w: e.w, h: e.h, bits: e.toString() }])) } : {}),
      quests: this.quests.toJSON(),
      respawn: this.respawnPoint,
    };
  }

  /** The save this game came from or was last saved to (the save screen opens on it). */
  private currentSlot: SlotId | null = null;

  private saveTo(slot: SlotId, quiet = false): boolean {
    // Anything still on the ground is collected first, so it's in the save.
    this.bankPickups('save');
    const ok = this.saves.write(slot, this.snapshot());
    if (ok && slot !== 'auto') this.currentSlot = slot;
    if (ok) this.saves.writeShot(slot, this.captureShot());
    if (ok && !quiet) this.audio.play('save');
    if (!quiet || !ok) this.menu.notice(ok ? `Saved to ${slotLabel(slot)}` : 'Couldn’t save: the browser refused to store it');
    return ok;
  }

  /** Bug notes from the console (kept in this browser until downloaded and cleared). */
  private bugNotes(): Record<string, unknown>[] {
    try { const v = JSON.parse(localStorage.getItem('hd2d.bugNotes') ?? '[]') as unknown; return Array.isArray(v) ? v as Record<string, unknown>[] : []; } catch { return []; }
  }
  private saveBugNotes(list: Record<string, unknown>[]): void {
    // Pictures are dropped from the oldest notes if the browser runs out of room.
    for (let k = 0; k <= list.length; k++) {
      try { localStorage.setItem('hd2d.bugNotes', JSON.stringify(list)); return; } catch { if (list[k]) delete list[k].shot; }
    }
  }

  /** A small picture of the scene right now (no menus or HUD: they're not in the 3D view), for the save screen. */
  private captureShot(): string | null {
    try {
      // Drawn now, then read straight back (the view is only readable until the browser shows it).
      this.ssao.render(this.scene, this.camera);
      this.post.render(this.scene, this.camera);
      const src = this.renderer.domElement, W = 320, H = 180, c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d')!;
      // Cover: crop the middle of the view to 16:9.
      const k = Math.min(src.width / W, src.height / H), sw = W * k, sh = H * k;
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, W, H);
      return c.toDataURL('image/jpeg', 0.72);
    } catch { return null; }
  }

  /** Load a save: fade out, rebuild its map with everything as it was, fade in. */
  private loadSave(d: SaveData): void {
    this.battle.abort();
    this.battleSound = null; this.outro = null;
    // Loading from the pause menu's System tab: the pause menu goes first (it stayed on top while the scene faded).
    if (this.pauseShell.isOpen) this.closePause();
    // Loading from the title (Continue or Load Game) leaves the title: hero, status bars and camera come back,
    // the HUD fading in with the picture.
    const fromTitle = this.onTitle;
    if (fromTitle) { this.onTitle = false; document.body.classList.add('ui-dim'); this.titleLeaving = true; }
    this.menu.close();
    this.interpreter.stop();
    this.requestTransfer(d.map, { x: d.x, z: d.z, dir: d.dir }, 'black', {
      slow: fromTitle,
      after: () => {
        this.uiIn();
        this.fireGlobal('load');
        // Saved on an earlier day (or before Update 131): the New day events too.
        const today = realDayKey();
        if (this.state.realDay && this.state.realDay !== today) this.fireGlobal('newDay');
        this.state.realDay = today;
      },
      before: () => {
        this.bankPickups('discard');
        this.log.clearFeed();
        this.state.load(d.state); this.applyForms();
        this.applyForge();
        this.stats.refill();
        this.stats.change('hp', 'set', d.gauges.hp);
        this.stats.change('mp', 'set', d.gauges.mp);
        this.stats.change('sp', 'set', d.gauges.sp);
        this.time.set(d.hour, true);
        this.respawnPoint = d.respawn;
        this.inventory.load(d.inventory ?? Inventory.fresh(this.db).toJSON(), this.bagSize);
        this.fixEquipSlots();
        this.progress.load(d.progress, this.heroBase());
        this.party.load(d.party);
        this.heroAt = Math.max(0, Math.round(Number(d.heroAt) || 0));
        this.visited = new Set(d.visited ?? []);
        this.explored = new Map(Object.entries(d.explored ?? {}).map(([k, e]) => [k, new Explored(e.w, e.h, e.bits)]));
        this.ensureWornInBag();
        // Saves from before party members had skill trees: the skill points their levels would have given.
        for (const m of this.party.members) if (m.skillPoints === undefined) { m.skillPoints = (m.level - 1) * this.combatCfg.pointsPerLevel; m.skills ??= {}; }
        this.combat.heroStatus.load(d.status);
        this.heroAilments = { ...(d.heroAilments ?? {}) };
        this.quests.load(d.quests);
        this.syncSkills();
        this.rings.off();
        this.refreshRing();
        this.playTime = d.playTime;
      },
    });
  }

  /* ------------------------------------------------------------------ items */

  private get bagSize(): number { return Math.max(1, Math.min(96, this.db.inventory?.slots ?? DEFAULT_BAG_SLOTS)); }

  /** Icons for every item: built-in pixel art, or the imported image (as a data URL for the menus). */
  private async loadItemIcons(resolve: (p: string) => string): Promise<void> {
    this.items.clear();
    this.baseItems.clear();
    for (const d of this.db.items ?? []) { this.items.set(d.id, d); this.baseItems.set(d.id, d); }
    await Promise.all([...this.items.values()].map(async (d) => {
      const name = builtinIconName(d.icon);
      let c: HTMLCanvasElement;
      if (d.icon === 'sprite') c = this.sprites.weaponIcon(itemWeaponSprite(d)) ?? builtinIcon(d.slot === 'ranged' ? 'bow' : d.slot === 'shield' ? 'shield' : 'sword');
      else if (name || !d.icon) c = builtinIcon(name ?? 'bag', d.iconTint);
      else { try { c = await loadCanvas(resolve(d.icon)); if (d.iconTint) c = tintIcon(c, d.iconTint); } catch { c = builtinIcon('?'); console.warn(`${d.name}: icon “${d.icon}” is missing`); } }
      // Icon effects (Update 133): glow, outline, pattern.
      if (hasIconFx(d.iconFx)) c = applyIconFx(c, d.iconFx);
      this.icons.set(d.id, c.toDataURL());
      this.iconCanvases.set(d.id, c);
    }));
    this.applyForge();
  }

  /** Items as the database defines them (`items` holds them as forged: upgraded, enchanted). */
  private readonly baseItems = new Map<string, ItemDef>();

  /** Swap in the forged version of every upgraded or enchanted item (after loading, forging, starting over). */
  private applyForge(): void {
    const rules = forgeRules(this.db.combat);
    for (const [id, base] of this.baseItems) {
      const e = this.state.forge.get(id);
      this.items.set(id, e ? forgedDef(base, e, e.shard ? this.baseItems.get(e.shard) : undefined, rules) : base);
    }
  }

  private itemIcon(id: string): string {
    return this.icons.get(id) ?? builtinIcon('?').toDataURL();
  }

  /**
   * Use a consumable: cure ailments, restore health / magic / stamina, give buffs. Nothing is used up if it would do
   * nothing. A zombie is hurt by healing (cures come first, so curing Zombie and healing in one item heals).
   */
  /** `battle`: used in a turn-based battle, where its buffs go on the fighter for turns (the battle gives them). */
  private useItem(i: number, who = 0, battle = false): string | null {
    const s = this.inventory.slots[i], d = s && this.items.get(s.id);
    if (!s || !d || d.kind !== 'consumable') return null;
    if (who > 0) {
      // On a party member: what it restores (they have no ailments or buffs of their own).
      const m = this.members()[who - 1];
      if (!m) return null;
      const max = this.allyNumbers(m.data, m.def).max, got: string[] = [];
      // Knocked out: only a revive works (and a revive only works on the knocked out).
      const ko = !!m.data.down || m.data.hp <= 0;
      if (ko !== !!d.revive) return ko ? `${m.def.name} is knocked out: only a revive can help.` : `${d.name} only works on someone knocked out.`;
      if (ko) { m.data.down = false; m.data.hp = 0; }
      if (d.statRank && (m.data.statRanks?.[d.statRank.stat] ?? m.def.ranks?.[d.statRank.stat] ?? 'C') !== d.statRank.rank) {
        this.setStatRank(m.def.id, d.statRank.stat, d.statRank.rank);
        got.push(`${ATTR_INFO[d.statRank.stat].name} now grows at Rank ${d.statRank.rank}`);
      }
      // Ailments left from a battle.
      if (!battle && d.cures?.length) { const cured = this.clearLingering(d.cures, who); if (cured.length) got.push(`cured ${cured.map((a) => effectName(a as never)).join(', ')}`); }
      for (const g of ['hp', 'mp', 'sp'] as const) {
        if (!restoresAny(d, g)) continue;
        const before = m.data[g];
        m.data[g] = Math.min(max[g], before + restoreAmount(d, g, max[g]));
        const n = Math.round(m.data[g] - before);
        if (n > 0) got.push(`+${n} ${g.toUpperCase()}`);
      }
      if (battle) for (const b of d.buffs ?? []) got.push(buffLabel(b.buff));
      if (d.levelUp && !ko && !battle) { const n = this.levelUpBy(who, d.levelUp); if (n) got.push(`now level ${m.data.level}`); }
      if (ko) { if (m.data.hp < 1) m.data.hp = 1; got.unshift('back on their feet'); }
      if (d.warms && !battle && this.sootheHero(who, d.warms)) got.push(d.warms > 0 ? 'warmed up' : 'cooled down');
      if (!got.length) return `${d.name} wouldn’t do anything for ${m.def.name} right now.`;
      this.inventory.removeAt(i, 1);
      this.state.tally('itemsUsed');
      // Out of battle, a favourite (or a disliked) item is from the hero you play (Update 127).
      if (!battle) this.itemReaction(d, m.def.id, mainHero(this.db).id);
      const a = this.allies.find((x) => x.data === m.data);
      if (a) this.bursts.spawn(a.x, a.y + 0.6, a.z, { color: '#9dffb0', n: 14, speed: 1, up: 2, life: 0.6, size: 0.08, additive: true });
      return `${m.def.name} used ${d.name}: ${got.join(', ')}.`;
    }
    const st = this.combat.heroStatus;
    const gains: string[] = [];
    // The hero: the same rule (a revive only when they're knocked out).
    const heroKo = this.stats.hp <= 0;
    if (heroKo !== !!d.revive) return heroKo ? `${mainHero(this.db).name} is knocked out: only a revive can help.` : `${d.name} only works on someone knocked out.`;
    if (heroKo) gains.push('back on their feet');
    if (d.statRank && (this.progress.statRanks[d.statRank.stat] ?? mainHero(this.db).ranks?.[d.statRank.stat] ?? 'C') !== d.statRank.rank) {
      this.setStatRank(mainHero(this.db).id, d.statRank.stat, d.statRank.rank);
      gains.push(`${ATTR_INFO[d.statRank.stat].name} now grows at Rank ${d.statRank.rank}`);
    }
    if (d.cures?.length) {
      const cured = [...st.cure(d.cures).map(effectName), ...(battle ? [] : this.clearLingering(d.cures, 0).filter((a) => !st.has(a as never)).map((a) => effectName(a as never)))];
      if (cured.length) gains.push(`cured ${[...new Set(cured)].join(', ')}`);
    }
    for (const g of ['hp', 'mp', 'sp'] as const) {
      if (!restoresAny(d, g)) continue;
      const amount = restoreAmount(d, g, this.stats.cfg.max[g]), before = this.stats[g];
      if (g === 'hp' && st.zombie) {
        this.stats.change('hp', 'add', -amount);
        const lost = Math.round(before - this.stats.hp);
        if (lost > 0) { gains.push(`−${lost} HP (healing hurts a zombie!)`); this.audio.play('hurt'); }
        continue;
      }
      this.stats.change(g, 'add', amount);
      const got = Math.round(this.stats[g] - before);
      if (got > 0) gains.push(`+${got} ${g.toUpperCase()}`);
    }
    for (const b of d.buffs ?? []) { if (!battle) st.boost(b.buff, b.amount, b.seconds); gains.push(buffLabel(b.buff)); }
    if (d.levelUp && !heroKo && !battle) { const n = this.levelUpBy(0, d.levelUp); if (n) gains.push(`now level ${this.progress.level}`); }
    if (heroKo && this.stats.hp < 1) this.stats.change('hp', 'set', 1);
    // A Hot Cocoa or a Chilled Tea (out of battle: the elements don't reach battles).
    if (d.warms && !battle && this.sootheHero(0, d.warms)) gains.push(d.warms > 0 ? 'warmed up' : 'cooled down');
    if (!gains.length) return `${d.name} wouldn’t do anything right now.`;
    this.inventory.removeAt(i, 1);
    this.state.tally('itemsUsed');
    return `Used ${d.name}: ${gains.join(', ')}.`;
  }

  /** Rare Candy: up `levels` levels, each by exactly the EXP still needed (level ups as usual). Returns levels gained. */
  private levelUpBy(who: number, levels: number): number {
    let gained = 0;
    for (let k = 0; k < Math.max(1, Math.round(levels)); k++) {
      if (!who) {
        if (this.progress.maxed) break;
        const was = this.progress.level;
        this.gainXp(Math.max(1, this.progress.toNext - this.progress.xp), false);
        if (this.progress.level > was) gained++;
        continue;
      }
      const m = this.members()[who - 1];
      if (!m) break;
      const need = xpToNext(this.combatCfg, m.data.level), was = m.data.level;
      if (!need) break;
      memberGainXp(m.data, Math.max(1, need - m.data.xp), this.combatCfg, this.memberGrowth(m), this.combatCfg.pointsPerLevel);
      if (m.data.level > was) gained++; else break;
    }
    return gained;
  }

  private equipItem(i: number): string | null {
    const s = this.inventory.slots[i], d = s && this.items.get(s.id);
    if (!d?.slot || d.kind !== 'equipment') return null;
    if (this.inventory.equip[d.slot] === s!.id) return `${d.name} is already on.`;
    if (!this.freeCopy(s!.id)) return `All of those are in use.`;
    this.inventory.equipFrom(i);
    this.refreshRing();
    return `Equipped ${d.name}.`;
  }

  // ---------------------------------------------------------------- seasons
  /** The season shown now (null: none, indoors or with seasons off), and whether this map was built in winter. */
  private season: Season | null = null;
  private mapWinter = false;
  /** A season picked in the playtest panel (overrides the day's). */
  private seasonTest: Season | null = null;

  /** The season here: the map's own, the test pick, or the day's; none indoors or with seasons off. */
  private seasonNow(): Season | null {
    const d = this.mapData;
    if (!d || (d.environment ?? 'outdoor') !== 'outdoor') return null;
    if (d.season) return d.season;
    if (this.seasonTest) return this.seasonTest;
    if (this.state.seasonPick) return this.state.seasonPick as Season;
    const cfg = this.db.time?.seasons;
    if (cfg?.off) return null;
    // By default the seasons are the real world's (from the player's date); or they follow the in-game days.
    if ((cfg?.mode ?? 'real') !== 'days') return realSeason(new Date(), cfg?.mode === 'realSouth');
    return seasonOn(Math.floor(this.state.clock / 24), cfg);
  }

  /** Is water of this style frozen over? Still, non-glowing water in winter. */
  private frozen(style: number): boolean {
    if (this.season !== 'winter') return false;
    const st = waterStyle(this.mapData, style);
    return !(st.flow ?? 0) && !(st.glow ?? 0);
  }

  /** Each frame: a new season recolours everything; into or out of winter rebuilds the map (ice on still water). */
  private updateSeason(): void {
    if (this.transfer || this.dying || !this.level) return;
    const now = this.seasonNow();
    if (now === this.season) return;
    const was = this.season;
    this.season = now;
    setSeason(now);
    if (now === 'winter' || was === 'winter') {
      if (this.mapData.water?.length && (now === 'winter') !== this.mapWinter) {
        const p = this.motion;
        // A quick fade while the map is rebuilt (with its water frozen over, or thawed).
        this.requestTransfer(this.mapName, { x: p.x, z: p.z, dir: this.player.dir }, 'black', { fresh: true });
      }
    }
    if (was && now) this.log.add(`${SEASON_NAMES[now]} has come`, 'info');
    this.updateAudio(0);
  }

  /** A hero's colour (0: the hero you play, then party members): from the database, or one of a few defaults. */
  private heroColor(h: number): string {
    const DEFAULTS = ['#e8b04a', '#5aa8ff', '#7cd66a', '#e87ad0', '#ff8a5a'];
    const def = h ? this.members()[h - 1]?.def : mainHero(this.db);
    const k = h ? Math.max(0, (this.db.heroes ?? []).findIndex((x) => x.id === def?.id)) : 0;
    return def?.color || DEFAULTS[k % DEFAULTS.length];
  }

  /** The party beside the bag: everyone's face, gauges and ailments. */
  private partyCards(): NonNullable<ReturnType<NonNullable<InventoryActions['party']>>> {
    if (!this.members().length) return [];
    const ail = (ids: EffectId[]) => ids.map((id) => ({ name: effectName(id), icon: statusIconUrl(id) }));
    this.portraitUrl ??= this.sprites.portrait('hero', this.db.characters[this.db.player], 48).toDataURL();
    const st = this.combat.heroStatus;
    return [{ name: mainHero(this.db).name, color: this.heroColor(0), portrait: this.portraitUrl, level: this.progress.level,
      hp: [this.stats.hp, this.stats.cfg.max.hp] as [number, number], mp: [this.stats.mp, this.stats.cfg.max.mp] as [number, number],
      ailments: ail(st.list.map((e) => e.id)) },
    ...this.members().map((m, k) => {
      const mx = this.allyNumbers(m.data, m.def).max;
      return { name: m.def.name, color: this.heroColor(k + 1), portrait: this.memberPortrait(m.def), level: m.data.level, down: !!m.data.down,
        hp: [m.data.hp, mx.hp] as [number, number], mp: [m.data.mp, mx.mp] as [number, number], ailments: [] };
    })];
  }

  /** What a piece of gear would change for each hero who can use it (null: they're wearing it). */
  private compareGear(i: number): { name: string; color: string; lines: string[] | null }[] {
    const id = this.inventory.slots[i]?.id, d = id ? this.items.get(id) : undefined;
    if (!id || !d || (d.kind !== 'equipment' && d.kind !== 'ammo') || d.slot === 'magic') return [];
    const host = this.equipHost(), g = host.gear(true).find((x) => x.id === id);
    if (!g) return [];
    const out: { name: string; color: string; lines: string[] | null }[] = [];
    host.heroes().forEach((x, h) => {
      if (!g.users[h]) return;
      const worn = host.slots(h).some((sl) => sl.item?.id === id);
      if (worn) { out.push({ name: x.name, color: this.heroColor(h), lines: null }); return; }
      const now = host.view(h), next = host.view(h, { slot: g.slot, id });
      const lines: string[] = [];
      const add = (label: string, a: number, b: number, unit = '') => { const dv = Math.round(b - a); if (dv) lines.push(`${dv > 0 ? '+' : '−'}${Math.abs(dv)}${unit} ${label}`); };
      for (const k of ATTRS) add(ATTR_INFO[k].short, now.attrs[k], next.attrs[k]);
      add('melee', now.melee, next.melee); add('bow', now.bow, next.bow); add('crit', now.crit, next.crit, '%');
      add('DEF', now.armour, next.armour); add('M.DEF', now.magicArmour, next.magicArmour);
      out.push({ name: x.name, color: this.heroColor(h), lines });
    });
    return out;
  }

  // ---------------------------------------------------------------- worn things stay in the bag
  /**
   * Everyone using a copy of an item: the hero and party members wearing it (or with the shard readied), and gear a
   * shard is set in. Each holds one copy in the bag; `off` lets go of it (takes it off, takes the shard out).
   */
  private wearers(id: string): { label: string; who: string; off: () => void }[] {
    const out: { label: string; who: string; off: () => void }[] = [];
    const heroName = mainHero(this.db).name;
    for (const slot of EQUIP_SLOTS) if (this.inventory.equip[slot] === id) out.push({ label: heroName, who: 'hero:0', off: () => { delete this.inventory.equip[slot]; } });
    this.inventory.elements.forEach((x, k) => { if (x === id) out.push({ label: heroName, who: 'hero:0', off: () => { this.inventory.elements[k] = null; } }); });
    this.members().forEach((m, k) => {
      for (const slot of EQUIP_SLOTS) if (m.data.equip[slot] === id) out.push({ label: m.def.name, who: `hero:${k + 1}`, off: () => { delete m.data.equip[slot]; } });
      (m.data.elements ?? []).forEach((x, j) => { if (x === id) out.push({ label: m.def.name, who: `hero:${k + 1}`, off: () => { m.data.elements![j] = null; } }); });
    });
    for (const [gid, e] of this.state.forge) if (e.shard === id) out.push({ label: `In ${this.items.get(gid)?.name ?? gid}`, who: `gear:${gid}`, off: () => {
      const n = { ...e }; delete n.shard;
      if (n.level) this.state.forge.set(gid, n); else this.state.forge.delete(gid);
    } });
    return out;
  }

  /** Who uses each bag slot's copy (bag slot → their name, or "In <weapon>"), in bag order. */
  private slotWearers(): Map<number, { label: string; who: string }> {
    const out = new Map<number, { label: string; who: string }>(), byId = new Map<string, number[]>();
    this.inventory.slots.forEach((st, i) => { if (st) { const l = byId.get(st.id) ?? []; l.push(i); byId.set(st.id, l); } });
    for (const [id, slots] of byId) {
      const w = this.wearers(id);
      w.forEach((x, k) => { if (slots[k] !== undefined) out.set(slots[k], { label: x.label, who: x.who }); });
    }
    return out;
  }

  /** Is there a copy of `id` free to put on (not counting the one in slot `i` if that's in use by someone else)? */
  private freeCopy(id: string): boolean { return this.inventory.free(id) > 0; }

  /** Copies left the bag (dropped, sold, taken): whoever used one that's gone takes it off. */
  private reconcileWorn(): void {
    let changed = false;
    const ids = new Set<string>([...EQUIP_SLOTS.map((s) => this.inventory.equip[s]), ...this.inventory.elements, ...this.members().flatMap((m) => [...Object.values(m.data.equip), ...(m.data.elements ?? [])]), ...[...this.state.forge.values()].map((e) => e.shard)].filter((x): x is string => !!x));
    for (const id of ids) {
      const w = this.wearers(id);
      for (let k = w.length - 1; k >= this.inventory.count(id); k--) { w[k].off(); changed = true; }
    }
    if (changed) { this.applyForge(); this.refreshRing(); }
  }

  /** Everything worn has its copy in the bag (older saves kept worn things out of it; joining heroes bring their gear). */
  private ensureWornInBag(): void {
    const ids = new Set<string>([...EQUIP_SLOTS.map((s) => this.inventory.equip[s]), ...this.inventory.elements, ...this.members().flatMap((m) => [...Object.values(m.data.equip), ...(m.data.elements ?? [])]), ...[...this.state.forge.values()].map((e) => e.shard)].filter((x): x is string => !!x && this.items.has(x)));
    for (const id of ids) {
      const missing = this.wearers(id).length - this.inventory.count(id);
      if (missing > 0) this.inventory.add(id, missing);
    }
    this.reconcileWorn();
  }

  /** Equipment: the slots; pick one to change what's in it. */
  /** The equipment screen's view of the hero: slots, what fits them, and the numbers with a change tried on. */
  private equipHost(): EquipHost {
    const NAMES: Record<EquipSlotId, string> = { weapon: 'Weapon', shield: 'Shield', ranged: 'Bow', magic: 'Spell shard', armor: 'Armor', accessory: 'Accessory', ammo: 'Arrows', element1: 'Element: Primary', element2: 'Element: Secondary' };
    // The Element slots: element stones (Primary: the element of their basic attacks).
    const elemSlot = (h: number, k: 0 | 1) => {
      const ids = h ? this.members()[h - 1]?.data.elements ?? [] : this.inventory.elements, id = ids[k];
      return { slot: (k ? 'element2' : 'element1') as EquipSlotId, label: NAMES[k ? 'element2' : 'element1'], item: id ? choice(id) : null,
        none: k ? '(none: a second element, or the same one for more)' : '(Normal: their basic attacks hit with this one)' };
    };
    const choice = (id: string, count?: number): EquipChoice => {
      const d = this.items.get(id);
      if (d?.essence) { const r = this.combatCfg.essence[d.essence.tier]; return { id, name: d.name, icon: this.itemIcon(id), color: ELEMENT_COLORS[d.essence.element], detail: `${ELEMENT_NAMES[d.essence.element]} hits +${r.damage}% · its weaknesses ×${r.weak}`, count }; }
      const detail = d?.weapon ? `${d.weapon.damage} damage${d.weapon.class !== 'bow' ? ` · ${d.weapon.class}` : ''}` : d?.spell ? `${d.spell.damage} damage · ${d.spell.mp} MP` : d?.ammo ? `+${d.ammo.damage} damage${d.ammo.infinite ? ' · never run out' : ''}`
        : d?.defense || d?.magicDefense ? `${d.defense ? `+${d.defense} defence` : ''}${d.defense && d.magicDefense ? ' · ' : ''}${d.magicDefense ? `+${d.magicDefense} magic defence` : ''}` : d?.spell?.power ? `${POWER_NAMES[d.spell.power]} · ${d.spell.mp ? `${d.spell.mp} MP to start · ` : ''}${d.spell.mpPerSecond ?? 0} MP/s` : d?.description;
      const sh = this.state.forge.get(id)?.shard;
      const warm = d?.warmth !== undefined && (d.slot === 'armor' || d.slot === 'accessory' || d.slot === 'shield') ? `Warmth ${d.warmth}` : '';
      return { id, name: d?.name ?? id, icon: this.itemIcon(id), color: itemColor(d), detail: warm ? (detail ? `${detail} · ${warm}` : warm) : detail, count, shard: sh ? { icon: this.itemIcon(sh), name: this.baseItems.get(sh)?.name ?? sh } : null };
    };
    const heroIds = () => [mainHero(this.db).id, ...this.members().map((m) => m.def.id)];
    // Can hero h wear it? Items can be kept to some heroes (Database → Items → Who can use it); arrows are the hero's.
    const canUse = (h: number, id: string, slot?: EquipSlotId) => {
      const d = this.items.get(id);
      if (slot === 'ammo' || d?.kind === 'ammo') return h === 0;
      // Their class can't use this kind of weapon or armor.
      if (gearSkill(this.db, this.abilitiesOf(h), d, this.skillsOf(h)) === 'none') return false;
      return !d?.users?.length || d.users.includes(heroIds()[h]);
    };
    const WORN = EQUIP_SLOTS.filter((x) => x !== 'magic');
    return {
      heroes: () => {
        const hero = mainHero(this.db);
        this.portraitUrl ??= this.sprites.portrait('hero', this.db.characters[this.db.player], 48).toDataURL();
        return [{ id: hero.id, name: hero.name, level: this.progress.level, portrait: this.portraitUrl },
          ...this.members().map((m) => ({ id: m.def.id, name: m.def.name, level: m.data.level, portrait: this.memberPortrait(m.def) }))];
      },
      // Spell shards are readied in the bag's Shards tab, not here.
      slots: (h) => h ? [...WORN.map((slot) => { const m = this.members()[h - 1]?.data, id = m?.equip[slot]; return { slot: slot as EquipSlotId, label: NAMES[slot], item: id ? choice(id) : null }; }), elemSlot(h, 0), elemSlot(h, 1)] : [...WORN.map((slot) => ({ slot: slot as EquipSlotId, label: NAMES[slot], item: this.inventory.equip[slot] ? choice(this.inventory.equip[slot]!) : null })),
        { slot: 'ammo' as EquipSlotId, label: NAMES.ammo, item: this.inventory.arrow() ? choice(this.inventory.arrow()!, this.inventory.count(this.inventory.arrow()!)) : null }, elemSlot(0, 0), elemSlot(0, 1)],
      choices: (h, slot) => {
        const seen = new Map<string, number>();
        for (const st of this.inventory.slots) {
          const d = st && this.items.get(st.id);
          if (!d || !st) continue;
          if (slot === 'element1' || slot === 'element2') { if (d.essence) seen.set(st.id, (seen.get(st.id) ?? 0) + st.n); continue; }
          if (!canUse(h, st.id, slot)) continue;
          if (slot === 'ammo' ? d.kind === 'ammo' && st.id !== this.inventory.arrow() : d.kind === 'equipment' && d.slot === slot) seen.set(st.id, (seen.get(st.id) ?? 0) + st.n);
        }
        // Only copies nobody is using (worn things stay in the bag, in use).
        return [...seen].map(([id, n]) => [id, slot === 'ammo' ? n : this.inventory.free(id)] as [string, number]).filter(([, n]) => n > 0).map(([id, n]) => choice(id, n));
      },
      gear: (all = false) => {
        const seen = new Map<string, number>(), n = heroIds().length;
        for (const i of [...this.inventory.pocketSlots('weapon'), ...this.inventory.pocketSlots('armor')]) {
          const st = this.inventory.slots[i], d = st && this.items.get(st.id);
          if (!st || !d || (d.kind !== 'equipment' && d.kind !== 'ammo')) continue;
          if (d.kind === 'ammo' && st.id === this.inventory.arrow()) continue;
          seen.set(st.id, (seen.get(st.id) ?? 0) + st.n);
        }
        if (!all) for (const [id] of seen) { const d = this.items.get(id)!; if (d.kind !== 'ammo') { const f = this.inventory.free(id); if (f > 0) seen.set(id, f); else seen.delete(id); } }
        return [...seen].map(([id, count]) => {
          const d = this.items.get(id)!, slot: EquipSlotId = d.kind === 'ammo' ? 'ammo' : (d.slot as EquipSlotId) ?? 'accessory';
          return { ...choice(id, count), slot, users: Array.from({ length: n }, (_, h) => canUse(h, id, slot)) };
        });
      },
      view: (h, change) => {
        // Element stones don't change the numbers shown here (their effect is on elements: see the slot's line).
        if (change && (change.slot === 'element1' || change.slot === 'element2')) change = undefined;
        const mem = h ? this.members()[h - 1] : null;
        if (mem) {
          const gear = { ...mem.data.equip };
          if (change && change.slot !== 'ammo') { if (change.id) gear[change.slot as EquipSlot] = change.id; else delete gear[change.slot as EquipSlot]; }
          const n = this.allyNumbers({ ...mem.data, equip: gear }, mem.def), t = heroTotals(mem.data.stats, this.statGear(gear, mem.data.abilities, this.memberSkills(mem.data)), (k) => this.memberSkills(mem.data).get(k) + this.goodBonus(mem.data.id, k));
          return { ...t, melee: n.melee, bow: n.bow, spell: n.spell };
        }
        const gear = { ...this.inventory.equip };
        let arrow = this.inventory.arrow();
        if (change?.slot === 'ammo') arrow = change.id;
        else if (change) { if (change.id) gear[change.slot as EquipSlot] = change.id; else delete gear[change.slot as EquipSlot]; }
        const t = this.heroTotals(gear);
        const w = gear.weapon ? this.items.get(gear.weapon) : undefined, cls = w?.weapon && w.weapon.class !== 'bow' ? w.weapon.class : 'unarmed';
        const melee = (cls === 'unarmed' ? this.combatCfg.unarmedDamage : w!.weapon!.damage) * this.combatCfg.classes[cls].damage * powerMultiplier(t.attrs.str);
        const bowDef = gear.ranged ? this.items.get(gear.ranged) : undefined, ammo = arrow ? this.items.get(arrow) : undefined;
        const bow = bowDef?.weapon ? (bowDef.weapon.damage + (ammo?.ammo?.damage ?? 0)) * powerMultiplier(t.attrs.dex) : 0;
        const shard = gear.magic ? this.items.get(gear.magic) : undefined;
        const spell = shard?.spell ? (shard.spell.damage ?? this.combatCfg.fire.damage) * powerMultiplier(t.attrs.mag) : 0;
        return { ...t, melee, bow, spell };
      },
      elements: (h) => affinityText(this.heroAffinity(h)),
      // The Addition row (what Attack performs): the ones learned; stepped through with Space or ← →.
      style: (h) => {
        const def = h ? this.members()[h - 1]?.def : mainHero(this.db), a = this.abilitiesOf(h);
        if (!def || !a || def.noAdditions || this.combatCfg.turnBased.additions !== 'set') return null;
        this.ensureAddition(h);
        const adds = additionList(this.db).filter((d) => a.additions && d.id in a.additions);
        if (!adds.length) return null;
        const cur = adds.find((d) => d.id === a.addition) ?? adds[0];
        const uses = a.additions?.[cur.id] ?? 0, rank = additionRank(cur, uses);
        return { value: cur.id, options: adds.map((d) => [d.id, d.name] as [string, string]), note: `Rank ${rank} · ${cur.strikes.map((x) => (x.button === 'any' ? '★' : x.button ?? 'A')).join(' ')}` };
      },
      setStyle: (h, v) => { const a = this.abilitiesOf(h); if (a) a.addition = v; },
      statuses: (h) => {
        const id = heroIds()[h], st = this.weatherStates.get(id) ?? null, w = st ? WEATHER_STATE_INFO[st] : null;
        const a = this.ailmentOf(h), ai = a ? this.combatCfg.turnBased.statusPills[a] : undefined;
        return [
          { label: 'Weather', name: w?.name ?? null, color: w?.color, text: w ? w.does : 'Nothing from the weather: not cold, hot or wet.' },
          { label: 'Ailment', name: a ? effectName(a) : null, color: ai?.color, text: a ? `${effectName(a)}: ${(AILMENT_INFO[a as keyof typeof AILMENT_INFO]?.does ?? '').replace(/([^.!?])$/, '$1.')}` : 'No ailment. A hero can only have one at a time.' },
          (() => { const g = this.goodOf(id); return g
            ? { label: 'Good state', name: GOOD_INFO[g.kind].name, color: GOOD_INFO[g.kind].color, text: `${GOOD_INFO[g.kind].name}: +${GOOD_INFO[g.kind].stat} to every stat and +${GOOD_INFO[g.kind].exp}% EXP from battles. ${hoursLabel(g.until - this.state.clock)} left (game time).` }
            : { label: 'Good state', name: null, text: 'No good state. Camping with 25 points of supplies makes the party Rested (+1 to every stat, +10% EXP); 50 makes them Well Rested (+3, +25%). Inns give Well Rested.' }; })(),
        ];
      },
      equip: (h, slot, id) => {
        if (slot === 'element1' || slot === 'element2') {
          const key = `elem:${h}:${slot === 'element2' ? 1 : 0}`;
          if (!id) { const was = this.holderShard(key); this.setHolderShard(key, null); this.refreshRing(); return was ? `${this.items.get(was)?.name ?? was} taken off.` : null; }
          if (!this.items.get(id)?.essence) return null;
          if (this.holderShard(key) !== id && this.inventory.free(id) < 1) return 'All of those are in use.';
          this.setHolderShard(key, id); this.refreshRing(); this.audio.play('skill');
          return `${this.items.get(id)?.name ?? id}: ${slot === 'element1' ? 'Primary' : 'Secondary'} element.`;
        }
        if (id && !canUse(h, id, slot)) return `They can’t use ${this.items.get(id)?.name ?? id}.`;
        const mem = h ? this.members()[h - 1] : null;
        if (mem) return this.equipMember(mem.data, slot as EquipSlot, id);
        if (slot === 'ammo') { this.inventory.ammo = id; return id ? `Shooting ${this.items.get(id)?.name ?? id} now.` : 'Back to your plain arrows.'; }
        const s = slot as EquipSlot;
        if (!id) { this.inventory.unequip(s); this.refreshRing(); return 'Taken off.'; }
        const i = this.inventory.slots.findIndex((st) => st?.id === id);
        if (i < 0 || this.inventory.equip[s] !== id && this.inventory.free(id) < 1) return 'All of those are in use.';
        if (!this.inventory.equipFrom(i)) return null;
        this.refreshRing();
        return `Equipped ${this.items.get(id)?.name ?? id}.`;
      },
    };
  }
  /** Whose skill tree the Skill Tree screen shows (0: the hero, then party members). */
  private skillHero = 0;
  private portraitUrl: string | null = null;
  private faceShown = false;
  /** A save's party for its card: each one standing (Legend of Dragoon style), the three fighting first. */
  private standing = new Map<string, string>();
  private saveParty(d: SaveData): { img: string; name: string; active: boolean }[] {
    const main = mainHero(this.db), ids = (d.party ?? []).map((m) => m.id);
    ids.splice(Math.max(0, Math.min(ids.length, d.heroAt ?? 0)), 0, main.id);
    return ids.map((id, k) => {
      const def = id === main.id ? main : this.db.heroes?.find((x) => x.id === id);
      let img = this.standing.get(id);
      if (!img) {
        const look = id === main.id ? this.db.characters[this.db.player] : this.db.characters[def?.look ?? ''] ?? this.db.characters[this.db.player];
        try { img = this.sprites.standingFrame(`save:${id}`, look, 'down', 2).toDataURL(); } catch { img = ''; }
        this.standing.set(id, img);
      }
      return { img, name: def?.name ?? id, active: k < this.activeMembers + 1 };
    }).filter((x) => x.img);
  }

  private memberPortraits = new Map<string, string>();
  private memberPortrait(def: HeroDef): string {
    let u = this.memberPortraits.get(def.id);
    if (!u) { u = this.sprites.portrait(`ally:${def.id}`, this.db.characters[def.look ?? ''] ?? this.db.characters[this.db.player], 48).toDataURL(); this.memberPortraits.set(def.id, u); }
    return u;
  }

  /** The party members with their database entries (any whose hero was deleted from the database are skipped). */
  private members(): { data: MemberData; def: HeroDef }[] {
    const out: { data: MemberData; def: HeroDef }[] = [];
    for (const m of this.party.members) { const def = this.db.heroes?.find((x) => x.id === m.id); if (def) out.push({ data: m, def }); }
    return out;
  }

  /** Put something from the bag on a party member (null takes it off); what they wore goes back in the bag. */
  private equipMember(m: MemberData, slot: EquipSlot, id: string | null): string | null {
    const old = m.equip[slot];
    if (!id) {
      if (!old) return null;
      delete m.equip[slot];
      return 'Taken off.';
    }
    if (old === id) return null;
    if (this.inventory.free(id) < 1) return 'All of those are in use.';
    m.equip[slot] = id;
    return `Equipped ${this.items.get(id)?.name ?? id}.`;
  }

  /**
   * Saves from before field spells were shards: a Light or Water Walk shard worn in the ring slot moves to the magic
   * slot (or the bag, when a shard is already there; the ground, when the bag is full).
   */
  private fixEquipSlots(): void {
    const eq = this.inventory.equip;
    for (const slot of EQUIP_SLOTS) {
      const id = eq[slot], d = id ? this.items.get(id) : undefined;
      if (!id || !d || d.slot === slot) continue;
      delete eq[slot];
      if (d.slot && !eq[d.slot]) { eq[d.slot] = id; continue; }
      if (this.inventory.count(id) > 0) continue;
      const left = this.inventory.add(id, 1);
      if (left) this.pickups?.place(id, left, this.player.position.x, this.player.position.y, this.player.position.z);
    }
  }

  /** What the fourth D-pad direction (↓) does, for the quick items cross: it follows the player's controller bindings. */
  /** Ready the field spell of the shard in the magic slot (Light, Water Walk), if it has one. */
  private refreshRing(): void {
    const id = this.inventory.equip.magic, d = id ? this.items.get(id) : undefined;
    // A key item in use (a lantern switched on from the bag or a quick slot) stays in hand while it's in the bag.
    const worn = this.rings.ring, keep = worn?.tool && this.inventory.count(worn.id) > 0 ? this.items.get(worn.id) ?? null : null;
    this.rings.wear(keep ?? (d?.spell?.power ? d : null), this.settings.lightShadows);
    // The HUD shows what the spell button does: the readied spell (a learned spell, or the shard's bolt or field spell).
    const learned = this.readiedSpell();
    // (Update 141: nothing is cast on the map any more, so the HUD's spell box stays empty.)
    void learned;
    this.hud.setRing(null);
    this.touch.setRing(!!(learned || d));
  }

  /** Switch a key item's field use (a lantern, water-walking boots) on or off; another one in use goes off first. */
  private toggleTool(id: string): string | null {
    const d = this.items.get(id);
    // A Saddle: the rented horse goes home.
    if (d?.saddle) return this.horseCommand({ cmd: 'horse', op: 'home' });
    // EXP All: on or off (those sitting battles out share the EXP while it's on).
    if (d?.exp?.all) {
      const on = this.state.expAllOff.has(id);
      if (on) this.state.expAllOff.delete(id); else this.state.expAllOff.add(id);
      return `${d.name}: ${on ? 'on' : 'off'}`;
    }
    // The other field uses (Update 118): Cut, Fire Bow, Smash Stone, the weather, time, season, fishing, the horse.
    if (d?.field && this.inventory.count(id) > 0) return this.fieldUse(d);
    if (!d?.tool || this.inventory.count(id) < 1) return null;
    if (this.rings.ring?.id !== id) this.rings.wear(d, this.settings.lightShadows);
    this.useRing();
    return `${d.name}: ${this.rings.active ? 'on' : 'off'}`;
  }

  /** A lock (Update 119): open already, a key or Skeleton Key, or the lockpicking screen. */
  private openLock(c: Extract<Command, { cmd: 'lock' }>, key: string, done: (ok: boolean) => void): void {
    const opened = () => { if (key) this.state.setSwitch(key, true); this.refreshEvents(); done(true); };
    if (key && this.state.getSwitch(key)) { done(true); return; }
    const keyItem = c.key && this.inventory.count(c.key) > 0 ? this.items.get(c.key) : this.carried('skeletonKey');
    if (keyItem) { this.audio.play('lockOpen'); this.menu.notice(`Unlocked with the ${keyItem.name}.`); opened(); return; }
    if (c.level === 'never') { this.audio.play('lockTurn'); this.menu.notice(c.key ? `It's locked. It needs the ${this.items.get(c.key)?.name ?? 'right key'}.` : 'It’s locked.'); done(false); return; }
    const picks = [...this.items.values()].some((d) => d.lockpick);
    if (picks && ![...this.items.values()].some((d) => d.lockpick && this.inventory.count(d.id) > 0)) { this.audio.play('lockTurn'); this.menu.notice('It’s locked. You have no lockpicks.'); done(false); return; }
    this.lockpick.show(c.level, (ok) => { if (ok) { this.state.tally('locksPicked'); opened(); } else done(false); });
  }

  /** A key item with this field use in the bag (Update 118), if any. */
  private carried(use: FieldUseKind): ItemDef | undefined {
    for (const s of this.inventory.slots) { const d = s ? this.items.get(s.id) : undefined; if (d?.field?.use === use) return d; }
    return undefined;
  }
  carries(use: FieldUseKind): boolean { return !!this.carried(use); }

  /** Use a key item's field use (Update 118); returns what to tell the player. */
  private fieldUse(d: ItemDef): string | null {
    const f = d.field!, outdoor = this.time.environment === 'outdoor';
    switch (f.use) {
      case 'dash':
        // Sprint (Update 137): switched on and off (bag or quick slot); while on, the hero runs.
        this.state.sprint = !this.state.sprint;
        this.audio.play(this.state.sprint ? 'ringOn' : 'ringOff');
        return `${d.name}: ${this.state.sprint ? 'sprinting' : 'walking'}.`;
      case 'swim': case 'climb': case 'skeletonKey':
        return `${d.name} works just by being carried.`;
      case 'cut':
        return this.combat.keySwing(Math.max(1, f.damage ?? 10));
      case 'bow':
        return `Put the ${d.name} on a quick slot (bag → Quick slot), then hold it to draw and let go to shoot.`;
      case 'smash':
        if (!this.propAhead((x) => !!x.mineable)) return 'No rock to smash here.';
        this.mineAhead(true);
        return null;
      case 'fireBow': {
        const [fx, fz] = DIR_VECTOR[this.player.dir], p = this.player.position;
        const tx = Math.floor(p.x + fx * 0.75), tz = Math.floor(p.z + fz * 0.75);
        const fire = this.fireAt(tx, tz) ?? this.fireAt(Math.floor(p.x), Math.floor(p.z));
        if (fire) {
          if (!this.fireOut(fire)) return 'It’s already burning.';
          const fd = this.sprites.def(fire.type)!;
          this.state.setFire(this.mapName, propKey(fire), this.state.clock + Math.min(fd.burns ?? Infinity, 1));
          this.kindled.delete(propKey(fire));
          this.setFireOut(fire, false);
          this.audio.play('ringOn', fire.x, fire.z);
          this.bursts.spawn(fire.x, this.map.surfaceY(fire.x, fire.z) + 0.3, fire.z, { color: '#ffb347', n: 18, speed: 1.4, up: 2.2, life: 0.7, size: 0.09, additive: true });
          return `${fd.name} is lit: it burns for an hour.`;
        }
        if (this.burnAt(tx + 0.5, tz + 0.5, 0.6)) { this.audio.play('fire', tx + 0.5, tz + 0.5); return null; }
        return 'Nothing to light here.';
      }
      case 'weather': {
        if (!outdoor) return 'The weather can only be changed outdoors.';
        const set = (kind: WeatherKind) => {
          this.interpreter.start([{ cmd: 'weather', kind, amount: 1 }]);
          this.audio.play('ringOn');
          this.menu.notice(`${d.name}: ${WEATHER_LABEL[kind] ?? kind}.`);
        };
        if (f.weather) { set(f.weather); return null; }
        // Update 132: a list to pick from.
        this.leaveMenusForPicker();
        this.menu.push(d.name, WEATHER_KINDS.map((kind) => ({ label: WEATHER_PICK[kind], detail: kind === this.weather.kind ? 'now' : undefined, pick: () => { this.menu.close(); set(kind); } })), { note: 'The weather here changes to…', start: Math.max(0, WEATHER_KINDS.indexOf(this.weather.kind)) });
        return null;
      }
      case 'time': {
        if (f.hour !== undefined) { this.startTimeWarp(f.hour, d.name); return null; }
        // Update 132: set any time (four digits and AM / PM); the world fast-forwards to it.
        this.leaveMenusForPicker();
        this.timePicker.show(this.time.target, this.settings.clock12, d.name, (to) => { if (to !== null) this.startTimeWarp(to, d.name); });
        return null;
      }
      case 'season': {
        if (!outdoor) return 'The season can only be changed outdoors.';
        const set = (to: Season | 'auto') => {
          this.state.seasonPick = to === 'auto' ? null : to;
          this.audio.play('ringOn');
          this.menu.notice(`${d.name}: ${to === 'auto' ? 'the seasons follow the calendar again' : SEASON_NAMES[to]}.`);
        };
        if (f.season) { set(f.season); return null; }
        const now = this.seasonNow() ?? 'spring', order: Season[] = ['spring', 'summer', 'autumn', 'winter'];
        this.leaveMenusForPicker();
        this.menu.push(d.name, [...order.map((x) => ({ label: SEASON_NAMES[x], detail: x === now ? 'now' : undefined, pick: () => { this.menu.close(); set(x); } })),
          ...(this.state.seasonPick ? [{ label: 'Follow the calendar', pick: () => { this.menu.close(); set('auto'); } }] : [])], { note: 'The season here changes to…', start: order.indexOf(now) });
        return null;
      }
      case 'fish': {
        const spot = this.fishSpotAhead();
        if (!spot) return 'No fishing spot here: face the water at a fishing spot.';
        this.startFishing(spot, this.bestRod()!);
        return null;
      }
      case 'horse': {
        const h = this.state.horse;
        if (h?.mounted) { this.dismount(); return null; }
        if (this.time.environment !== 'outdoor') return 'Your horse can’t come here.';
        if (!h) {
          if (!f.horse) return 'You don’t have a horse.';
          const msg = this.horseCommand({ cmd: 'horse', op: 'rent', id: f.horse, free: true });
          if (!this.state.horse) return msg;
        }
        const spot = this.horseSpot(), hs = this.state.horse!;
        hs.map = this.mapName; hs.x = spot.x; hs.z = spot.z;
        this.audio.play('horseNeigh', spot.x, spot.z);
        this.mount();
        return null;
      }
    }
    return null;
  }

  /** Mana Thrift (Magic tree): spells cost this much of their magic. */
  private get spellThrift(): number { return 1 - Math.min(75, this.skills?.get('spellCost') ?? 0) / 100; }

  /** Cast the field spell (key 3 with its shard, or F): switch Light or Water Walk on or off. */
  private useRing(): void {
    const r = this.rings.power;
    if (!r) { this.menu.notice('No field spell: equip the Light or Water Walk shard in Menu → Equipment'); return; }
    if (!this.rings.isTool && this.combat.heroStatus.silenced && !this.rings.active) { this.menu.notice('Silenced: can’t cast spells'); return; }
    this.tideOnWater = false;
    const was = this.rings.active;
    const msg = this.rings.toggle((mp) => this.stats.spendMp(Math.round(mp * this.spellThrift)), this.stats.mp);
    if (msg) this.menu.notice(msg);
    else this.audio.play(this.rings.active ? 'ringOn' : 'ringOff');
    if (was === this.rings.active && !msg) return;
  }

  /** The first prop in front of the hero (the tile ahead, then the one they stand on) that `want` accepts. */
  private propAhead(want: (d: PropDef) => boolean): { prop: PropData; tiles: [number, number][] } | null {
    const [fx, fz] = DIR_VECTOR[this.player.dir], p = this.player.position;
    const cells = [[Math.floor(p.x + fx * 0.75), Math.floor(p.z + fz * 0.75)], [Math.floor(p.x), Math.floor(p.z)]];
    for (const [cx, cz] of cells) {
      for (const prop of this.mapData.props) {
        const d = this.sprites.def(prop.type);
        if (!d || !want(d) || !this.propSlots.has(prop) || this.gone(prop)) continue;
        const tiles = blockedTiles(d, prop.x, prop.z, prop.s ?? 1, stepOf(this.map));
        const at = d.foot ? footTiles(d, prop.x, prop.z, prop.s ?? 1, false, stepOf(this.map)) : tiles.length ? tiles : [[Math.floor(prop.x), Math.floor(prop.z)] as [number, number]];
        if (at.some(([x, z]) => x === cx && z === cz)) return { prop, tiles };
      }
    }
    return null;
  }

  /** Cut, burnt or mined away already (this visit, or for good)? */
  private gone(prop: PropData): boolean {
    const key = propKey(prop);
    return this.cutThisVisit.has(key) || this.state.isCut(this.mapName, key);
  }

  /** Take a cut, burnt or mined prop off the map: hidden, its tiles freed, remembered (for this visit if it grows back). */
  private clearProp(prop: PropData, tiles: [number, number][]): void {
    const key = propKey(prop);
    if (this.sprites.def(prop.type)?.regrows) this.cutThisVisit.add(key); else this.state.setCut(this.mapName, key);
    hideProp(this.propSlots.get(prop)!);
    // Free its tiles unless the ground or another prop still blocks them.
    for (const [x, z] of tiles) this.map.setBlocked(x, z, this.blockedByOthers(x, z, prop));
    this.map.removeBoxes(prop);
  }

  /** Cut down the cuttable prop in front of the hero (vines, a thin tree). Quiet (a sword swing): no notice if there's nothing. */
  private cutAhead(cost: number, quiet = false): boolean {
    const target = this.propAhead((d) => !!d.cuttable);
    if (!target) { if (!quiet) this.menu.notice('Nothing to cut here'); return false; }
    if (!this.stats.spendMp(cost)) { this.menu.notice('Not enough MP.'); return false; }
    const { prop, tiles } = target;
    this.clearProp(prop, tiles);
    this.bursts.spawn(prop.x, this.map.surfaceY(prop.x, prop.z) + 0.4, prop.z, { color: '#6fae4a', n: 18, speed: 1.8, up: 2.5, size: 0.11 });
    this.audio.play('cut', prop.x, prop.z);
    this.afterCut(prop);
    return true;
  }

  /** Blows landed on rock this visit (prop key → hits so far). */
  private readonly mineHits = new Map<string, number>();
  private mineWarnT = 0;

  /**
   * A swing at the rock in front of the hero: with a mining weapon (a pickaxe, a hammer) each blow chips it, and the
   * last breaks it open (stone, ore). Other weapons just bounce off. Returns true when there was rock to hit.
   */
  private mineAhead(smash = false): boolean {
    const target = this.propAhead((d) => !!d.mineable);
    if (!target) return false;
    const { prop, tiles } = target, d = this.sprites.def(prop.type)!, key = propKey(prop);
    const y = this.map.surfaceY(prop.x, prop.z);
    const id = this.inventory.equip.weapon, w = id ? this.items.get(id) : undefined;
    if (!w?.mines && !smash) {
      this.audio.play('block', prop.x, prop.z);
      if (this.elapsed > this.mineWarnT) { this.mineWarnT = this.elapsed + 4; this.menu.notice('Too hard: break rock with a pickaxe or hammer'); }
      return true;
    }
    // Smash Stone (Update 118) breaks it in one blow.
    const n = smash ? Infinity : (this.mineHits.get(key) ?? 0) + 1, need = Math.max(1, d.hits ?? 3);
    this.bursts.spawn(prop.x, y + 0.5, prop.z + 0.1, { color: '#9a9ca6', n: 10, speed: 1.6, up: 2.2, life: 0.5, size: 0.07, gravity: 6 });
    if (n < need) {
      this.mineHits.set(key, n);
      this.audio.play('hit', prop.x, prop.z);
      return true;
    }
    this.mineHits.delete(key);
    this.clearProp(prop, tiles);
    this.bursts.spawn(prop.x, y + 0.4, prop.z, { color: '#7c7f8a', n: 26, speed: 2.4, up: 3, life: 0.8, size: 0.12, gravity: 7 });
    this.audio.play('break', prop.x, prop.z);
    this.state.tally('mined');
    this.afterCut(prop);
    return true;
  }

  /** Fire at (x, z): cuttable props there burn away (vines, saplings), giving nothing. Returns true if one did. */
  private burnAt(x: number, z: number, r: number): boolean {
    let any = false;
    for (const prop of this.mapData.props) {
      const d = this.sprites.def(prop.type);
      if (!d?.cuttable || !this.propSlots.has(prop) || this.gone(prop)) continue;
      if (Math.abs(prop.x - x) > r + d.w * (prop.s ?? 1) * 0.5 || Math.abs(prop.z - 0.3 - z) > r + 0.6) continue;
      this.charProp(prop, d);
      this.clearProp(prop, blockedTiles(d, prop.x, prop.z, prop.s ?? 1, stepOf(this.map)));
      const y = this.map.surfaceY(prop.x, prop.z);
      this.bursts.spawn(prop.x, y + 0.5, prop.z, { color: '#ff9a3a', n: 22, speed: 1.4, up: 2.6, life: 0.7, size: 0.09, additive: true });
      this.bursts.spawn(prop.x, y + 0.6, prop.z, { color: '#3a3a3a', n: 14, speed: 0.8, up: 2, life: 1.1, size: 0.12, gravity: -0.6 });
      this.audio.play('fire', prop.x, prop.z);
      this.state.tally('burnt');
      // Say why nothing dropped: fire leaves only ash (a flame weapon does this to saplings and vines).
      this.overlay.float('Burnt!', prop.x, y + 1.2, prop.z, 'info', '#ff9a4a');
      if (d.drops?.length) this.log.add(`${d.name} burnt to ash: fire leaves nothing to gather`, 'info');
      this.afterCut(prop, true);
      any = true;
    }
    return any;
  }

  /** Props burning away: a charred copy that glows, blackens and crumbles before it's gone. */
  private readonly charring: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; t: number; s: number; x: number; y: number; z: number }[] = [];

  /** Start a prop's burning: a copy of it in its place, catching fire. */
  private charProp(prop: PropData, d: PropDef): void {
    if (!this.level) return;
    const a = this.sprites.get(prop.type), mat = a.material.clone() as THREE.MeshStandardMaterial;
    mat.emissive = new THREE.Color('#ff6a1a');
    mat.emissiveMap = mat.map;
    mat.emissiveIntensity = 1.4;
    const m = new THREE.Mesh(a.geometry, mat), s = prop.s ?? 1, at = propBase(this.map, prop, d);
    m.scale.setScalar(s);
    m.position.set(prop.x, at.y, prop.z + 0.02);
    this.level.add(m);
    this.charring.push({ mesh: m, mat, t: 0, s, x: prop.x, y: at.y, z: prop.z });
  }

  /** Burning props: orange flames, then black char, then they crumble away (about a second and a half). */
  private updateCharring(dt: number): void {
    for (let i = this.charring.length - 1; i >= 0; i--) {
      const c = this.charring[i];
      c.t += dt;
      const k = c.t / 1.5;
      const burn = Math.min(1, k * 2.2), dark = Math.max(0, Math.min(1, (k - 0.15) * 2));
      c.mat.color.setRGB(1 - dark * 0.88, 1 - burn * 0.55 - dark * 0.37, 1 - burn * 0.8 - dark * 0.15);
      c.mat.emissiveIntensity = (1 - dark) * (1.4 + Math.sin(c.t * 30) * 0.4);
      // Crumbling: it sinks and narrows in its last moments.
      const fall = Math.max(0, (k - 0.6) / 0.4);
      c.mesh.scale.set(c.s * (1 - fall * 0.35), c.s * (1 - fall * 0.85), c.s);
      if (Math.random() < dt * 14 && k < 0.8) this.bursts.spawn(c.x + (Math.random() - 0.5) * 0.4, c.y + 0.3 + Math.random() * 0.6, c.z, { color: k < 0.4 ? '#ffb05a' : '#4a4440', n: 2, speed: 0.5, up: 1.6, life: 0.6, size: 0.07, gravity: k < 0.4 ? -0.4 : 2, additive: k < 0.4 });
      if (k >= 1 || !c.mesh.parent) {
        this.bursts.spawn(c.x, c.y + 0.2, c.z, { color: '#2e2a28', n: 12, speed: 1, up: 1.2, life: 0.8, size: 0.09, gravity: 5 });
        c.mesh.parent?.remove(c.mesh);
        c.mat.dispose();
        this.charring.splice(i, 1);
      }
    }
  }

  /** What's left once something is cut, burnt or mined: its stump or rubble, and (unless burnt) what it gives. */
  private afterCut(prop: PropData, burnt = false): void {
    const d = this.sprites.def(prop.type);
    if (!d || !this.level) return;
    if (!burnt && !d.mineable) this.state.tally(d.stump ? 'trees' : 'cut');
    const st = d.stump && this.sprites.def(d.stump) ? d.stump : null;
    if (st) {
      const a = this.sprites.get(st), m = withSpriteShadows(new THREE.Mesh(a.geometry, a.material), a), s = prop.s ?? 1;
      m.scale.setScalar(s);
      const at = propBase(this.map, prop, d);
      m.position.set(prop.x, at.y, prop.z);
      (this.world?.group ?? this.level).add(m);
    }
    if (burnt) return;
    // What it gives tumbles out onto the ground, to be picked up a moment later (not straight into the bag).
    const y = prop.y ?? this.map.surfaceY(prop.x, prop.z);
    for (const it of d.drops ?? []) {
      if (!this.items.get(it.item) || it.count < 1) continue;
      if (it.chance !== undefined && Math.random() * 100 >= it.chance) continue;
      this.pickups?.harvest(it.item, it.count, prop.x, y, prop.z);
    }
  }

  /* ------------------------------------------------------------------ fires that burn out */

  /** This map's fires that burn out (props with a flame or light and a burn time). */
  private fireProps: PropData[] = [];
  private fireCheck = 0;

  /** Fires lit for a moment by a fire attack with no fuel left: seconds (real time) until they go out again. */
  private readonly kindled = new Map<string, number>();

  /** Is this fire out (no fuel time left, and not kindled by a fire attack)? */
  private fireOut(p: PropData): boolean {
    const k = propKey(p);
    return this.state.clock >= (this.state.fireUntil(this.mapName, k) ?? Infinity) && !((this.kindled.get(k) ?? 0) > 0);
  }

  /** How lit up the hero is by firelight (lit fire props' lights) or a light ring: 0 … 1. */
  private heroLit(): number {
    if (this.rings.active && this.rings.ring?.ring?.power === 'light') return 1;
    const p = this.player.position;
    let lit = 0;
    for (const f of this.litFires()) {
      const d = this.sprites.def(f.type)!, r = (d.light?.radius ?? 5) * 0.5 * Math.sqrt(f.s ?? 1);
      lit = Math.max(lit, 1 - Math.hypot(f.x - p.x, f.z - p.z) / r);
    }
    return Math.max(0, lit);
  }

  /** Lit campfires (fires that are respawn points), each with the ground around it no enemy enters. */
  private safeZones(): { x: number; z: number; r: number }[] {
    const r = this.combatCfg.campSafe;
    const camps = r > 0 ? this.litFires().filter((f) => this.sprites.def(f.type)?.respawn).map((f) => ({ x: f.x, z: f.z, r })) : [];
    return camps.length ? [...camps, ...this.safeTiles()] : this.safeTiles();
  }
  /** Painted safe zones (Spawns layer) as little circles, one per tile, for enemies to keep out of. Cached per map. */
  private safeTileCache: { src: unknown; list: { x: number; z: number; r: number }[] } = { src: null, list: [] };
  private safeTiles(): { x: number; z: number; r: number }[] {
    const g = this.mapData?.safeGrid;
    if (this.safeTileCache.src === g) return this.safeTileCache.list;
    const list: { x: number; z: number; r: number }[] = [];
    g?.forEach((row, z) => { for (let x = 0; x < row.length; x++) if (isSafeMark(row[x])) list.push({ x: x + 0.5, z: z + 0.5, r: 0.8 }); });
    this.safeTileCache = { src: g, list };
    return list;
  }

  /** Fire props burning now on this map (ones that never go out, and burning ones that do). Cached for a frame. */
  private litCache: { at: number; list: PropData[] } = { at: -1, list: [] };
  private litFires(): PropData[] {
    if (this.litCache.at === this.elapsed) return this.litCache.list;
    const list = this.mapData.props.filter((p) => {
      const d = this.sprites.def(p.type);
      if (!d || !(d.flame || d.light) || !(d.flame || d.light?.flicker === 'fire' || d.light?.flicker === 'candle')) return false;
      return d.burns ? !this.fireOut(p) : true;
    });
    this.litCache = { at: this.elapsed, list };
    return list;
  }

  /** A fire attack at (x, y, z): light the first gone-out fire it reaches, for a few seconds. */
  private ignite(x: number, y: number, z: number, r: number): boolean {
    const burnt = this.burnAt(x, z, r);
    for (const p of this.fireProps) {
      if (!this.fireOut(p)) continue;
      const d = this.sprites.def(p.type)!, s = p.s ?? 1, at = propBase(this.map, p, d);
      const fx = p.x + (d.flame?.x ?? d.light?.x ?? 0) * s, fy = at.y + (d.flame?.y ?? d.light?.y ?? d.h * 0.7) * s;
      // Near the flame's spot, or anywhere on the prop.
      const nearFlame = Math.hypot(fx - x, at.z - z) < r + 0.35 + d.w * s * 0.2 && y > fy - 1.1 && y < fy + 1.1;
      const onProp = Math.abs(p.x - x) < r + d.w * s * 0.45 && Math.abs(at.z - z) < r + 0.4 && y > at.y - 0.3 && y < at.y + d.h * s + 0.3;
      if (!nearFlame && !onProp) continue;
      const secs = this.combatCfg.fire.kindle;
      this.kindled.set(propKey(p), secs);
      this.setFireOut(p, false);
      this.audio.play('fire', p.x, p.z);
      this.bursts.spawn(fx, fy + 0.1, at.z + 0.05, { color: '#ffb347', n: 16, speed: 1.4, up: 2, life: 0.6, size: 0.08, additive: true });
      this.log.add(`${d.name} catches fire (it needs fuel to keep burning)`, 'info');
      return true;
    }
    return burnt;
  }

  private initFires(): void {
    this.outShown.clear();
    this.kindled.clear();
    this.fireProps = this.mapData.props.filter((p) => { const d = this.sprites.def(p.type); return !!d?.burns && (!!d.light || !!d.flame); });
    for (const p of this.fireProps) {
      const k = propKey(p);
      // First time seen: freshly lit, with its full burn time (or unlit, for ones that start out).
      const d = this.sprites.def(p.type)!;
      if (this.state.fireUntil(this.mapName, k) === undefined) this.state.setFire(this.mapName, k, d.startsOut ? this.state.clock : this.state.clock + d.burns!);
    }
    this.fireCheck = 0;
    this.updateFires(0);
  }

  /** The clock runs; fires past their time go out. */
  private updateFires(dt: number): void {
    this.state.clock += (dt * this.time.rate) / 3600;
    // Kindled fires burn down in real time; in their last moments they sputter.
    for (const [k, t] of this.kindled) {
      const left = t - dt;
      const p = this.fireProps.find((f) => propKey(f) === k);
      if (!p) { this.kindled.delete(k); continue; }
      if (left <= 0) { this.kindled.delete(k); this.setFireOut(p, this.fireOut(p)); continue; }
      this.kindled.set(k, left);
      if (left < 2.5 && this.state.clock >= (this.state.fireUntil(this.mapName, k) ?? Infinity)) this.setFireOut(p, Math.floor(left * 7) % 3 === 0);
    }
    if (!this.fireProps.length || (this.fireCheck -= dt) > 0) return;
    this.fireCheck = 0.5;
    for (const p of this.fireProps) if (!this.kindled.has(propKey(p))) this.setFireOut(p, this.fireOut(p));
  }

  /** Burnt-out fires showing their "out" prop: the placed copy, and the fire's own matrix to bring it back. */
  private readonly outShown = new Map<PropData, { mesh: THREE.Mesh; matrix: THREE.Matrix4 }>();

  /** Put a fire out or light it: its light and flame, and its "out" look when it has one. */
  private setFireOut(p: PropData, out: boolean): void {
    this.lights?.setOut(p, out);
    const d = this.sprites.def(p.type), alt = d?.burntOut && this.sprites.def(d.burntOut) ? d.burntOut : null, slot = this.propSlots.get(p);
    if (!alt || !slot || !this.level) return;
    const shown = this.outShown.get(p);
    if (out && !shown) {
      const matrix = new THREE.Matrix4();
      slot.mesh.getMatrixAt(slot.index, matrix);
      hideProp(slot);
      const a = this.sprites.get(alt), m = withSpriteShadows(new THREE.Mesh(a.geometry, a.material), a);
      m.scale.setScalar(p.s ?? 1);
      const at = propBase(this.map, p, this.sprites.def(alt) ?? d);
      m.position.set(p.x, at.y, at.z + 0.001);
      (this.world?.group ?? this.level).add(m);
      this.outShown.set(p, { mesh: m, matrix });
    } else if (!out && shown) {
      shown.mesh.removeFromParent();
      slot.mesh.setMatrixAt(slot.index, shown.matrix);
      slot.mesh.instanceMatrix.needsUpdate = true;
      this.outShown.delete(p);
    }
  }

  /** The nearest fire that burns out, within a couple of tiles of the hero. */
  private nearestFire(): PropData | null {
    const p = this.player.position;
    let best: PropData | null = null, bd = 2.5;
    for (const f of this.fireProps) { const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  /** "2 h 30 min" left on the nearest fire ("out" when it's gone out), for \fire in messages. */
  private fireLeftText(): string {
    const f = this.nearestFire();
    if (!f) return '';
    const left = Math.max(0, (this.state.fireUntil(this.mapName, propKey(f)) ?? 0) - this.state.clock);
    if (left <= 0) return 'no time at all: it has gone out';
    const m = Math.round(left * 60);
    return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
  }

  /** A fire that burns out on this tile (to feed it). */
  private fireAt(x: number, z: number): PropData | null {
    return this.fireProps.find((p) => {
      const d = this.sprites.def(p.type)!;
      // A wall torch can be reached from its tile or by facing the wall it hangs on.
      if (d.wall) { const az = propBase(this.map, p, d).z; return Math.floor(p.x) === x && (Math.floor(az + 0.01) === z || Math.floor(az - 0.01) === z); }
      return propCovers(d, p, x, z);
    }) ?? null;
  }

  /** A forge (an anvil) on this tile? */
  private forgeAt(x: number, z: number): boolean {
    return this.mapData.props.some((p) => { const d = this.sprites.def(p.type); return !!d?.forge && propCovers(d, p, x, z); });
  }

  /** Trained with this kind of weapon (the hero's skills)? */
  private proficient(cls: 'light' | 'medium' | 'heavy'): boolean { return !this.skills || proficientWith(this.skills, cls); }

  /**
   * The forge: smelt ore into ingots, upgrade weapons and armor with ingots of their material, and set a spell shard
   * in them (or take it out again). Upgrades and shards apply to every copy of that item.
   */
  private openForge(): void {
    const rules = forgeRules(this.db.combat), inv = this.inventory;
    const name = (id: string) => this.baseItems.get(id)?.name ?? id;
    const color = (id: string) => itemColor(this.items.get(id)) ?? undefined;
    const struck = () => { this.audio.play('block'); const p = this.player.position; this.bursts.spawn(p.x, p.y + 0.8, p.z, { color: '#ffd27a', n: 16, speed: 2.2, up: 2.4, life: 0.5, size: 0.06, additive: true }); };
    // Weapons and armor the hero has: worn first, then the bag (each kind once).
    const gear = (ok: (d: ItemDef) => boolean): string[] => {
      const ids: string[] = [];
      for (const id of Object.values(inv.equip)) if (id && !ids.includes(id) && ok(this.baseItems.get(id)!)) ids.push(id);
      for (const s of inv.slots) if (s && !ids.includes(s.id) && this.baseItems.get(s.id) && ok(this.baseItems.get(s.id)!)) ids.push(s.id);
      return ids;
    };
    const after = () => { this.applyForge(); this.refreshRing(); };

    const smelt = () => {
      const items = (): MenuItem[] => {
        const out: MenuItem[] = [];
        const seen = new Set<string>();
        for (const s of inv.slots) {
          const d = s && this.baseItems.get(s.id);
          if (!s || !d?.smelt || seen.has(s.id) || !this.baseItems.has(d.smelt.into)) continue;
          seen.add(s.id);
          const need = Math.max(1, d.smelt.need ?? 2), have = inv.count(s.id);
          out.push({ label: `${d.name} × ${have} → ${name(d.smelt.into)}`, detail: `${need} for one${have >= need * 2 ? ` · Space again for more` : ''}`, disabled: have < need, pick: () => {
            if (inv.count(s.id) < need || inv.room(d.smelt!.into) < 1) { this.menu.notice(inv.room(d.smelt!.into) < 1 ? 'Your bag is full' : `Needs ${need} ${d.name}`); return; }
            inv.remove(s.id, need);
            inv.add(d.smelt!.into, 1);
            struck();
            this.state.tally('smelted');
            this.menu.refresh(items(), note());
            this.menu.notice(`Smelted a ${name(d.smelt!.into)}`);
          } });
        }
        if (!out.length) out.push({ label: 'Nothing to smelt', detail: 'Ore from mining (iron ore, gold ore…)', disabled: true });
        return out;
      };
      const note = () => 'Ore becomes ingots: ingots upgrade weapons and armor of their material.';
      this.menu.push('Smelt', items(), { note: note() });
    };

    const upgrade = () => {
      const items = (): MenuItem[] => {
        const ids = gear((d) => upgradable(d));
        const out: MenuItem[] = ids.map((id) => {
          const b = this.baseItems.get(id)!, lv = this.state.forge.get(id)?.level ?? 0, cost = upgradeCost(lv), mat = b.material!, have = inv.count(mat);
          const max = lv >= rules.maxLevel;
          const what = b.weapon ? 'damage' : 'defence';
          return { label: `${this.items.get(id)!.name}${max ? '' : ` → +${lv + 1}`}`, color: color(id),
            detail: max ? 'Fully upgraded' : `${cost} ${name(mat)} (you have ${have}) · +${rules.percent}% ${what}`, disabled: max || have < cost, pick: () => {
              if (inv.count(mat) < cost) return;
              inv.remove(mat, cost);
              this.state.forge.set(id, { ...this.state.forge.get(id), level: lv + 1 });
              after(); struck();
              this.state.tally('upgrades');
              this.menu.refresh(items());
              this.menu.notice(`${this.items.get(id)!.name}: upgraded`);
            } };
        });
        if (!out.length) out.push({ label: 'Nothing to upgrade', detail: 'Weapons and armor with a material (iron, steel, gold…)', disabled: true });
        return out;
      };
      this.menu.push('Upgrade', items(), { note: `Each upgrade adds ${rules.percent}% damage (weapons) or defence (armor), up to +${rules.maxLevel}. It applies to every copy of that item.` });
    };

    this.menu.push('Forge', [
      { label: 'Smelt ore', detail: 'Ore into ingots', pick: smelt },
      { label: 'Upgrade', detail: 'More damage or defence, for ingots', pick: upgrade },
      { label: 'Leave', pick: () => this.menu.close() },
    ], { note: 'Upgrades apply to every copy of an item.' });
  }

  // ---------------------------------------------------------------- shard holders (the bag's Shards tab)
  /** Where the shard in bag slot i can go: each hero (readied as their spell), then weapons and armor (set in them). */
  private shardTargets(i: number): { label: string; value: string; disabled?: boolean }[] {
    const id = this.inventory.slots[i]?.id;
    if (!id) return [];
    const name = (x: string | null) => (x ? this.baseItems.get(x)?.name ?? x : '');
    // Element stones: a hero's Primary or Secondary Element slot.
    if (this.baseItems.get(id)?.essence) {
      const out: { label: string; value: string; disabled?: boolean }[] = [];
      this.equipHost().heroes().forEach((x, k) => {
        for (const j of [0, 1]) {
          const cur = this.holderShard(`elem:${k}:${j}`);
          out.push({ label: `${x.name}: ${j ? 'Secondary' : 'Primary'}${cur ? ` (now ${name(cur)})` : ''}`, value: `elem:${k}:${j}`, disabled: cur === id });
        }
      });
      return out;
    }
    return this.equipHost().heroes().map((x, k) => {
      const cur = this.holderShard(`hero:${k}`);
      return { label: `Ready for ${x.name}${cur ? ` (now ${name(cur)})` : ''}`, value: `hero:${k}`, disabled: cur === id };
    });
  }

  /** Put the shard in bag slot i on a hero (readied) or in a piece of gear. With every copy in use, this one moves. */
  private placeShard(i: number, key: string): string | null {
    const id = this.inventory.slots[i]?.id;
    if (!id || !this.holderTakes(key, id)) return null;
    if (this.inventory.free(id) < 1) this.takeOffSlot(i, true);
    if (this.inventory.free(id) < 1) return 'All of those are in use.';
    this.setHolderShard(key, id);
    this.applyForge(); this.refreshRing();
    this.audio.play('skill');
    const where = key.startsWith('elem:') ? `now ${this.equipHost().heroes()[Number(key.split(':')[1])]?.name ?? ''}'s ${key.endsWith(':1') ? 'Secondary' : 'Primary'} element` : key.startsWith('hero:') ? `readied by ${this.equipHost().heroes()[Number(key.slice(5))]?.name ?? ''}` : `set in ${this.items.get(key.slice(5))?.name ?? ''}`;
    return `${this.baseItems.get(id)?.name ?? id} ${where}.`;
  }

  /** Element stones in bag slot i: fusing them into the next kind (those worn don't count). */
  private fuseOptions(i: number): { label: string; disabled?: boolean; all: boolean }[] {
    const id = this.inventory.slots[i]?.id, d = id ? this.baseItems.get(id) : undefined, r = this.combatCfg.essence;
    const nt = d?.essence ? nextTier(d.essence.tier) : null;
    if (!id || !d?.essence || !nt) return [];
    const into = essenceItem(this.baseItems.values(), d.essence.element, nt);
    if (!into) return [];
    const { make, need } = fuseCount(d.essence.tier, this.inventory.free(id), r);
    const out: { label: string; disabled?: boolean; all: boolean }[] = [{ label: `Fuse ${need} into a ${into.name}${make ? '' : ` (you have ${this.inventory.free(id)})`}`, disabled: !make, all: false }];
    if (make > 1) out.push({ label: `Fuse all: ${make} × ${into.name}`, all: true });
    return out;
  }

  private fuse(i: number, all: boolean): string | null {
    const id = this.inventory.slots[i]?.id, d = id ? this.baseItems.get(id) : undefined, r = this.combatCfg.essence;
    const nt = d?.essence ? nextTier(d.essence.tier) : null, into = d?.essence && nt ? essenceItem(this.baseItems.values(), d.essence.element, nt) : undefined;
    if (!id || !d?.essence || !into) return null;
    const { make, need } = fuseCount(d.essence.tier, this.inventory.free(id), r), n = all ? make : Math.min(1, make);
    if (!n) return `Needs ${need} ${d.name}s.`;
    if (this.inventory.room(into.id) < n) return 'Your bag is full.';
    this.inventory.remove(id, n * need);
    this.inventory.add(into.id, n);
    this.audio.play('levelUp');
    this.state.tally('fused', n);
    this.log.add(`Fused ${n * need} ${d.name}s into ${n > 1 ? `${n} × ` : 'a '}${into.name}`, 'loot');
    return `${n * need} ${d.name}s fused into ${n > 1 ? `${n} × ` : 'a '}${into.name}!`;
  }

  /** Whoever uses the copy in bag slot i lets go of it (it stays in the bag). */
  private takeOffSlot(i: number, quiet = false): string | null {
    const st = this.inventory.slots[i], w = this.slotWearers().get(i);
    if (!st || !w) return null;
    const all = this.wearers(st.id), x = all.find((y) => y.who === w.who);
    x?.off();
    this.applyForge(); this.refreshRing();
    return quiet ? null : `${this.items.get(st.id)?.name ?? st.id}: ${w.who.startsWith('gear:') ? `taken out of ${w.label.replace(/^In /, '')}` : `taken off ${w.label}`}.`;
  }

  /** The shard a holder has (a hero's readied one, or the one set in a piece of gear). */
  private holderShard(key: string): string | null {
    const [kind, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (kind === 'hero') { const h = Number(rest); return (h ? this.members()[h - 1]?.data.equip.magic : this.inventory.equip.magic) ?? null; }
    if (kind === 'elem') { const [h, j] = rest.split(':').map(Number); return (h ? this.members()[h - 1]?.data.elements?.[j] : this.inventory.elements[j]) ?? null; }
    return this.state.forge.get(rest)?.shard ?? null;
  }

  /** Put a shard in a holder (null empties it), without touching the bag. */
  private setHolderShard(key: string, sid: string | null): void {
    const kind = key.slice(0, key.indexOf(':')), rest = key.slice(key.indexOf(':') + 1);
    if (kind === 'hero') {
      const h = Number(rest), eq = h ? this.members()[h - 1]?.data.equip : this.inventory.equip;
      if (!eq) return;
      if (sid) eq.magic = sid; else delete eq.magic;
      return;
    }
    if (kind === 'elem') {
      const [h, j] = rest.split(':').map(Number);
      const list = h ? (this.members()[h - 1] ? (this.members()[h - 1].data.elements ??= [null, null]) : null) : this.inventory.elements;
      if (list) list[j] = sid;
      return;
    }
    const e = { ...this.state.forge.get(rest) };
    if (sid) e.shard = sid; else delete e.shard;
    if (e.level || e.shard) this.state.forge.set(rest, e); else this.state.forge.delete(rest);
  }

  /** Can this shard go in this holder? (Gear only takes elemental shards; heroes ready any.) */
  private holderTakes(key: string, sid: string | null): boolean {
    const d = sid ? this.baseItems.get(sid) : undefined;
    if (key.startsWith('elem:')) return !sid || !!d?.essence;
    return !sid || (key.startsWith('hero:') && !d?.essence);
  }

  // ---------------------------------------------------------------- fishing
  /** The cast in progress: casting out, waiting for a bite, or a bite to react to. */
  private fishing: {
    phase: 'cast' | 'wait' | 'bite' | 'reel'; t: number; at: number; nibble: number;
    from: THREE.Vector3; x: number; y: number; z: number; zone: number; power: number; hp: number;
    bob: THREE.Sprite; line: THREE.Line; icon: HTMLCanvasElement;
  } | null = null;
  private fishGrid: { data: MapData; grid: (number | null)[] } | null = null;

  /** The fishing spot (painted in the Water tab) one or two tiles ahead of the hero, if any. */
  private fishSpotAhead(): { x: number; y: number; z: number; zone: number } | null {
    const m = this.motion, data = this.mapData;
    if (!data.fishing?.length || m.swimming || m.airborne || m.climbing) return null;
    if (this.fishGrid?.data !== data) this.fishGrid = { data, grid: fishingGrid(data) };
    const [fx, fz] = DIR_VECTOR[this.player.dir], p = this.player.position;
    for (const d of [1, 1.6, 2.3]) {
      const cx = Math.floor(p.x + fx * d), cz = Math.floor(p.z + fz * d);
      if (!this.map.inMap(cx, cz)) break;
      const w = this.map.waterAt(cx, cz), zone = this.fishGrid.grid[cz * this.map.w + cx];
      if (w && zone !== null && zone !== undefined && data.fishZones?.[zone]) return { x: cx + 0.5, y: w.surface, z: cz + 0.5, zone };
    }
    return null;
  }

  /** The best fishing rod in the bag (or worn). */
  private bestRod(): ItemDef | undefined {
    let best: ItemDef | undefined;
    for (const d of this.items.values()) if (d.rod && this.inventory.count(d.id) > 0 && (!best || (d.rod.power ?? 0) > (best.rod!.power ?? 0))) best = d;
    // A key item that starts fishing (Update 118) works as a basic rod.
    if (!best) { const k = this.carried('fish'); if (k) best = { ...k, rod: { power: 0 } }; }
    return best;
  }

  private startFishing(spot: { x: number; y: number; z: number; zone: number }, rod: ItemDef): void {
    if (!this.level || this.combat.busy) return;
    const c = document.createElement('canvas');
    c.width = 6; c.height = 8;
    const g = c.getContext('2d')!;
    // A little float: red cap, white body, a dark tip.
    g.fillStyle = '#1a1420'; g.fillRect(2, 0, 2, 1);
    g.fillStyle = '#e8463a'; g.fillRect(1, 1, 4, 3);
    g.fillStyle = '#f4f0e6'; g.fillRect(1, 4, 4, 3);
    g.fillStyle = '#1a1420'; g.fillRect(2, 7, 2, 1);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const bob = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    bob.scale.set(0.16, 0.21, 1);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(12).fill(0).map(() => new THREE.Vector3())),
      new THREE.LineBasicMaterial({ color: 0xeef2f8, transparent: true, opacity: 0.7 }));
    line.frustumCulled = false;
    this.level.add(bob, line);
    const power = rod.rod?.power ?? 0;
    this.fishing = { phase: 'cast', t: 0, at: 0.55, nibble: 1 + Math.random() * 2, from: this.rodTip(), ...spot, power, hp: this.stats.hp, bob, line, icon: this.iconCanvases.get(rod.id) ?? builtinIcon('fishing_rod') };
    this.audio.play('fishCast');
  }

  /** Where the rod's tip is (the line starts there). */
  private rodTip(): THREE.Vector3 {
    const held = this.combat.holdTip();
    if (held) return held;
    const [fx, fz] = DIR_VECTOR[this.player.dir], p = this.player.position, side = this.player.dir === 'left' ? -1 : 1;
    return new THREE.Vector3(p.x + fx * 0.55 + (fz ? side * 0.3 : 0), p.y + 1.05, p.z + fz * 0.45 + 0.05);
  }

  private updateFishing(dt: number): void {
    const f = this.fishing!, i = this.input;
    f.t += dt;
    // Reel in: walking off, jumping, attacking, opening the menu, or getting hit.
    const moving = i.isHeld('up') || i.isHeld('down') || i.isHeld('left') || i.isHeld('right') || Math.hypot(i.stick.x, i.stick.y) > 0.4;
    const press = i.consume('ok') || i.consume('attack') || i.consume('jump');
    for (const a of ['melee', 'bow', 'magic', 'ring', 'switchWeapon'] as Action[]) i.consume(a);
    if (this.stats.hp < f.hp - 0.5 || this.combat.heroStunned) { this.endFishing('The fish will have to wait.'); return; }
    if (moving || i.isHeld('cancel')) { this.endFishing(); return; }
    const surf = f.y + 0.06;
    if (f.phase === 'cast') {
      // The float arcs out over the water and plops in.
      const k = Math.min(1, f.t / f.at);
      f.bob.position.set(f.from.x + (f.x - f.from.x) * k, f.from.y + (surf - f.from.y) * k + Math.sin(k * Math.PI) * 0.8, f.from.z + (f.z - f.from.z) * k);
      if (k >= 1) { f.phase = 'wait'; f.t = 0; f.at = biteDelay(f.power, Math.random()); this.ripples.spawn(f.x, f.y, f.z, 0.8, 0.6); }
      if (press && k < 1) { /* still flying: ignore */ }
    } else if (f.phase === 'wait') {
      f.bob.position.set(f.x, surf + Math.sin(f.t * 2.4) * 0.012, f.z);
      // Little nibbles: a twitch and a ring, nothing to catch yet.
      f.nibble -= dt;
      if (f.nibble <= 0) { f.nibble = 1.2 + Math.random() * 2.2; this.ripples.spawn(f.x, f.y, f.z, 0.4, 0.3); f.bob.position.y -= 0.02; }
      if (press) { this.endFishing('Too soon: nothing was biting.'); return; }
      if (f.t >= f.at) {
        f.phase = 'bite'; f.t = 0; f.at = biteWindow(f.power);
        this.audio.play('fishBite');
        this.ripples.spawn(f.x, f.y, f.z, 1.1, 0.9);
        const p = this.player.position;
        this.overlay.float('!', p.x, p.y + 1.7, p.z, 'crit');
      }
    } else if (f.phase === 'bite') {
      // Pulled under: press now!
      f.bob.position.set(f.x + Math.sin(f.t * 40) * 0.015, surf - 0.07 - Math.sin(f.t * 18) * 0.02, f.z);
      if (press) { this.landCatch(); return; }
      if (f.t >= f.at) { this.endFishing('It got away…'); return; }
    } else {
      // Reeling in: the float comes back to the hero.
      const k = Math.min(1, f.t / 0.35), tip = this.rodTip();
      f.bob.position.set(f.x + (tip.x - f.x) * k, surf + (tip.y - surf) * k + Math.sin(k * Math.PI) * 0.3, f.z + (tip.z - f.z) * k);
      if (k >= 1) { this.endFishing(); return; }
    }
    // The rod out over the water, and the line from its tip to the float (sagging while it waits).
    this.combat.holding = { icon: f.icon, tilt: f.phase === 'cast' ? Math.min(1, f.t / 0.2) : f.phase === 'bite' ? 0.75 : f.phase === 'reel' ? 0.3 : 0.9 };
    const tip = this.rodTip(), b = f.bob.position, pos = f.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sag = f.phase === 'wait' ? 0.35 : f.phase === 'bite' ? 0.05 : 0.15;
    for (let k = 0; k < 12; k++) {
      const u = k / 11;
      pos.setXYZ(k, tip.x + (b.x - tip.x) * u, tip.y + (b.y + 0.08 - tip.y) * u - Math.sin(u * Math.PI) * sag, tip.z + (b.z - tip.z) * u);
    }
    pos.needsUpdate = true;
  }

  /** Carrying a key item that lets the party swim. */
  private canSwim(): boolean {
    return this.inventory.slots.some((st) => !!st && (!!this.items.get(st.id)?.swim || this.items.get(st.id)?.field?.use === 'swim'));
  }

  /** A bite answered in time: roll what it was, and into the bag it goes. */
  private landCatch(): void {
    const f = this.fishing!, zone = this.mapData.fishZones?.[f.zone];
    // Now and then it's a water enemy (Update 109): it comes out of the water and a battle starts.
    const water = (this.db.enemies ?? []).filter((e) => e.water && (!zone?.monsters?.length || zone.monsters.includes(e.id)));
    const chance = zone?.monsterChance ?? (water.length ? 10 : 0);
    if (water.length && Math.random() * 100 < chance) {
      const def = this.levelled(water[Math.floor(Math.random() * water.length)]);
      this.audio.play('splash', f.x, f.z);
      this.ripples.spawn(f.x, f.y, f.z, 1.6, 1.2);
      const p = this.player.position;
      this.overlay.float('!', p.x, p.y + 1.7, p.z, 'crit');
      this.endFishing();
      this.log.add(`Something big bit… a ${def.name}!`, 'info');
      this.startBattle([{ def, hp: def.hp, enemy: null }], 'normal', { canRun: true, pick: this.pickFor() });
      return;
    }
    const got = pickCatch(zone, this.time.night > 0.5, f.power, Math.random());
    const d = got ? this.items.get(got.item) : undefined;
    this.audio.play('fishCatch');
    this.ripples.spawn(f.x, f.y, f.z, 1.3, 1);
    f.phase = 'reel'; f.t = 0;
    if (!d) { this.menu.notice('Nothing on the hook.'); return; }
    if (this.inventory.room(d.id) < 1) { this.menu.notice(`A ${d.name}! But your bag is full, so you let it go.`); return; }
    this.inventory.add(d.id, 1);
    const size = catchSize(d, Math.random());
    this.state.tally('fish');
    if (size) this.state.tally('bestFish', size, true);
    const p = this.player.position;
    this.overlay.float(d.name, p.x, p.y + 1.6, p.z, 'info', itemColor(d) ?? undefined);
    this.log.add(`Caught ${/^[aeiou]/i.test(d.name) ? 'an' : 'a'} ${d.name}${size ? ` (${size} cm)` : ''}!`, 'loot');
    this.refreshEvents();
  }

  /** Put the rod away (with a word on why, sometimes). */
  private endFishing(msg?: string): void {
    const f = this.fishing;
    if (!f) return;
    this.fishing = null;
    this.combat.holding = null;
    f.bob.parent?.remove(f.bob); f.line.parent?.remove(f.line);
    (f.bob.material as THREE.SpriteMaterial).map?.dispose(); f.bob.material.dispose();
    f.line.geometry.dispose(); (f.line.material as THREE.Material).dispose();
    if (msg) this.menu.notice(msg);
  }

  /** Feeding a fire: how long it has left, and the fuel in the bag to add. */
  private openFire(p: PropData): void {
    const d = this.sprites.def(p.type)!, key = propKey(p);
    const left = () => Math.max(0, (this.state.fireUntil(this.mapName, key) ?? 0) - this.state.clock);
    const hm = (h: number) => { const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };
    const items = (): MenuItem[] => {
      const fuel = new Map<string, number>();
      for (const s of this.inventory.slots) if (s && (this.items.get(s.id)?.fuel ?? 0) > 0) fuel.set(s.id, (fuel.get(s.id) ?? 0) + s.n);
      // The burn time is how much the fire holds: fuel tops it up, never past full.
      const cap = d.burns ?? Infinity, full = left() >= cap - 1e-6;
      const out: MenuItem[] = [...fuel].map(([id, n]) => {
        const it = this.items.get(id)!;
        const adds = Math.min(it.fuel!, Math.max(0, cap - left()));
        return { label: `${it.name} × ${n}`, detail: full ? 'Full' : adds < it.fuel! - 1e-6 ? `+${hm(adds)} (fills it)` : `+${hm(it.fuel!)}`, disabled: full, pick: () => {
          const i = this.inventory.slots.findIndex((s) => s?.id === id);
          if (i < 0) return;
          this.inventory.removeAt(i, 1);
          const was = left();
          this.state.setFire(this.mapName, key, this.state.clock + Math.min(cap, was + it.fuel!));
          this.kindled.delete(key);
          this.state.tally('firesFed');
          this.setFireOut(p, false);
          this.audio.play(was > 0 ? 'fire' : 'ringOn', p.x, p.z);
          this.bursts.spawn(p.x, this.map.surfaceY(p.x, p.z) + 0.3, p.z, { color: '#ffb347', n: 14, speed: 1.2, up: 2, life: 0.6, size: 0.08, additive: true });
          this.menu.refresh(items(), status());
          this.menu.notice(was > 0 ? `${d.name}: burns for ${hm(left())}` : `${d.name} is lit again: burns for ${hm(left())}`);
        } };
      });
      if (!out.length) out.push({ label: 'No fuel in your bag', detail: 'Firewood, coal… (items marked as fire fuel)', disabled: true });
      out.push({ label: 'Leave it', pick: () => this.menu.close() });
      return out;
    };
    const cap = d.burns ?? 0;
    const status = () => (left() > 0 ? `Burns for about ${hm(left())} more (game time)${cap ? `, of ${hm(cap)} when full` : ''}.`
      : this.kindled.has(key) ? 'Only flickering: it’ll go out in a moment. Add fuel to keep it burning.' : 'It has gone out. Add fuel (or use a fire attack, for a moment) to light it again.');
    this.menu.push(d.name, items(), { note: status() });
  }

  private blockedByOthers(x: number, z: number, except: PropData): boolean {
    if (this.tiles.blocks(this.map.terrain(x, z))) return true;
    if (this.mapData.buildings?.some((b) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)) return true;
    return this.mapData.props.some((q) => {
      if (q === except || this.cutThisVisit.has(propKey(q)) || this.state.isCut(this.mapName, propKey(q))) return false;
      const d = this.sprites.def(q.type);
      return !!d && blockedTiles(d, q.x, q.z, q.s ?? 1, stepOf(this.map)).some(([bx, bz]) => bx === x && bz === z);
    });
  }

  /** The weapon picker on the HUD: what the attack button uses, and the other two. */
  private updateWeaponHud(): void {
    const c = this.combat, inv = this.inventory;
    if (!inv) return;
    const st = c.heroStatus;
    this.hud.setStatus([...(st.zombie && !st.has('zombie') ? [{ id: 'zombie', name: 'Zombie', icon: statusIconUrl('zombie'), left: 1, total: Infinity }] : []),
      ...st.list.map((e) => ({ id: e.id, name: effectName(e.id), icon: statusIconUrl(e.id), left: e.left, total: e.total }))]);
    // Update 132: no sword or bow on the map (the Cut and Bow key items took over), so no weapons card.
    this.hud.setWeapons([], c.weapon, c.switches, this.input.label('switchWeapon'));
  }
  private readonly builtinUrls = new Map<string, string>();
  private builtinUrl(name: string): string {
    let u = this.builtinUrls.get(name);
    if (!u) { u = builtinIcon(name).toDataURL(); this.builtinUrls.set(name, u); }
    return u;
  }

  /* ------------------------------------------------------------------ skills, sound */

  /** Rebuild the hero's skills from the progression (after loading or a new game) and apply their stat bonuses. */
  private syncSkills(): void {
    const data = skillsData(this.db.skills);
    this.partySkills = new Skills(data, this.progress.sharedRanks, true);
    this.skills = new Skills(data, this.progress.ranks);
    this.skills.shared = this.partySkills;
    this.memberSkillCache.clear();
    this.applySkillStats();
    // Saves from before spell shards: skills already learned give their shard now.
    this.teachShards(true);
    this.syncAbilities();
  }

  /**
   * Starting spells, Additions and class from Database → Heroes, and what skills already taken teach (for new games,
   * and saves from before learned spells). Never takes anything away.
   */
  private syncAbilities(): void {
    if (!this.progress) return;
    mergeStarting(this.db, this.progress.abilities, mainHero(this.db));
    teachFromSkills(this.db, this.progress.abilities, this.progress.ranks, this.skills.data.nodes);
    for (const m of this.members()) {
      const a = (m.data.abilities ??= {});
      mergeStarting(this.db, a, m.def);
      const sk = this.memberSkills(m.data);
      teachFromSkills(this.db, a, sk.ranks, sk.data.nodes);
    }
  }

  /** Heroes an event names: '' the hero you play, '@party' everyone in the party, else a hero id (if in the party). */
  private eventHeroes(who: string): { name: string; a: AbilityData }[] {
    const out: { name: string; a: AbilityData }[] = [];
    if (!who || who === '@party') out.push({ name: mainHero(this.db).name, a: this.progress.abilities });
    for (const m of this.members()) if (who === '@party' || m.def.id === who) out.push({ name: m.def.name, a: (m.data.abilities ??= {}) });
    if (who && who !== '@party' && mainHero(this.db).id === who) out.push({ name: mainHero(this.db).name, a: this.progress.abilities });
    return out;
  }

  /** Event command: teach a spell (at a rank) or an Addition. The line to show, or null if nothing was new. */
  private eventLearn(c: Extract<Command, { cmd: 'learn' }>): string | null {
    const sp = findSpell(this.db, c.spell), ad = findAddition(this.db, c.addition), lines: string[] = [];
    for (const h of this.eventHeroes(c.who)) {
      if (sp && learnSpell(h.a, sp, c.rank ?? 1)) lines.push(`${h.name} learned ${rankName(sp.name, h.a.spells![sp.id])}!`);
      if (ad && learnAddition(h.a, ad)) lines.push(`${h.name} learned the Addition ${ad.name}!`);
    }
    for (const l of lines) this.log.add(l, 'level');
    if (lines.length) this.audio.play('skill');
    return lines.length ? lines.join('\n') : null;
  }

  /** Event command: change a hero's class (its skill trees open; nothing learned is lost), or unlock it for later. */
  private eventClass(c: Extract<Command, { cmd: 'heroClass' }>): string | null {
    const cl = findClass(this.db, c.cls);
    if (!cl) return null;
    const lines: string[] = [];
    for (const h of this.eventHeroes(c.who)) {
      if (c.op === 'change') { if (h.a.cls !== cl.id) { changeClass(h.a, cl.id); lines.push(`${h.name} is now a ${cl.name}!`); } }
      else if (unlockClass(h.a, cl.id)) lines.push(`${h.name} can now become a ${cl.name}.`);
    }
    for (const l of lines) this.log.add(l, 'level');
    if (lines.length) this.audio.play('skill');
    return lines.length ? lines.join('\n') : null;
  }

  /** A hero's learned abilities: 0 the hero, k the k-th party member. */
  /**
   * Heroes with Additions (all but those set to No Additions) always know Quick Strike (or the first Addition in the
   * Database) and have one equipped: no plain attack unless the Database says so.
   */
  private ensureAddition(who: number): void {
    const def = who ? this.members()[who - 1]?.def : mainHero(this.db), a = this.abilitiesOf(who);
    if (!def || !a || def.noAdditions) return;
    const list = additionList(this.db);
    const first = list.find((d) => d.id === def.defaultAddition) ?? list.find((d) => d.id === 'quick_strike') ?? list[0];
    if (!first) return;
    a.additions ??= {};
    if (!(first.id in a.additions)) a.additions[first.id] = 0;
    if (!a.addition || !(a.addition in a.additions)) a.addition = first.id;
  }

  /** A hero's Additions in battle, or (No Additions) a plain attack, melee or ranged. */
  private attackStyle(who: number, a: AbilityData): { additions: ReturnType<Game['battleAdditions']>; addition?: string; shoots?: boolean } {
    const def = who ? this.members()[who - 1]?.def : mainHero(this.db);
    if (def?.noAdditions) return { additions: [], addition: undefined, shoots: def.plainAttack === 'ranged' };
    this.ensureAddition(who);
    return { additions: this.battleAdditions(a), addition: a.addition };
  }

  /** A hero's skills (0: the hero you play). */
  private skillsOf(who: number): Skills | null {
    if (!who) return this.skills ?? null;
    const m = this.members()[who - 1];
    return m ? this.memberSkills(m.data) : null;
  }

  private abilitiesOf(who: number): AbilityData | null {
    if (!who) return this.progress.abilities;
    const m = this.members()[who - 1];
    return m ? (m.data.abilities ??= {}) : null;
  }

  /**
   * The learned spell readied for the magic button (action mode), as the item a spell shard would be, so the field
   * combat casts it the same way. Undefined: none readied (an equipped shard is used, if any).
   */
  private readiedSpell(a: AbilityData = this.progress.abilities): (ItemDef & { spell: NonNullable<ItemDef['spell']> }) | undefined {
    const s = findSpell(this.db, a.fieldSpell), known = s ? a.spells?.[s.id] ?? 0 : 0;
    if (!s || !known || s.kind !== 'bolt') return undefined;
    const rank = Math.max(1, Math.min(known, a.fieldRank ?? known)), at = spellAtRank(s, rank);
    return {
      id: `spell:${s.id}`, name: rankName(s.name, rank), kind: 'equipment', icon: 'builtin:fire', slot: 'magic', element: s.element, inflicts: s.inflicts,
      spell: { damage: at.power, mp: at.mp, color: s.color ?? '#ffb04a', speed: s.speed, range: s.range },
    } as ItemDef & { spell: NonNullable<ItemDef['spell']> };
  }

  /**
   * Give the spell shard of every learned skill that teaches one and hasn't yet: into the magic slot if it's empty,
   * otherwise the bag. Returns the names of what was given.
   */
  private teachShards(quiet = false): string[] {
    const got: string[] = [];
    if (!this.inventory) return got;
    for (const node of this.skills.data.nodes) {
      const id = node.teaches, d = id ? this.items.get(id) : undefined;
      if (!id || !d || this.skills.rank(node.id) < 1 || this.progress.taught.includes(node.id)) continue;
      this.progress.taught.push(node.id);
      if (this.inventory.count(id) > 0) continue;
      if (d.slot === 'magic' && !this.inventory.equip.magic) this.inventory.equip.magic = id;
      else if (this.inventory.add(id, 1) > 0) { const p = this.player.position; this.pickups?.place(id, 1, p.x, p.y, p.z); }
      got.push(d.name);
      if (!quiet) this.log.add(`Received ${d.name}`, 'loot');
    }
    return got;
  }

  /** The hero's stats with what they wear and their skills (crit chance, defences). */
  heroTotals(gear: Partial<Record<EquipSlot, string>> = this.inventory.equip): HeroTotals {
    return heroTotals(this.progress.stats, this.statGear(gear), (k) => (this.skills?.get(k) ?? 0) + (this.combat?.heroStatus.buff(k) ?? 0) + this.goodBonus(mainHero(this.db).id, k));
  }

  /** A hero's growth ranks now (0: the hero you play): the Database's, changed by potions and events, lifted by worn gear. */
  heroRanks(who: number): Record<Attr, Rank> {
    if (!who) return ranksOf(mainHero(this.db).ranks, this.progress.statRanks, this.wornGear());
    const m = this.members()[who - 1];
    return m ? ranksOf(m.def.ranks, m.data.statRanks, this.wornGear(m.data.equip)) : ranksOf(undefined, undefined);
  }
  private memberGrowth(m: { def: HeroDef; data: MemberData }): Attrs { return levelGains(ranksOf(m.def.ranks, m.data.statRanks, this.wornGear(m.data.equip))); }

  /** Change a stat's growth rank for good (a potion, an event): '' the hero you play, an id, or 'all'. */
  private setStatRank(hero: string, stat: Attr, rank: Rank): string[] {
    const names: string[] = [];
    if (!hero || hero === 'all' || hero === mainHero(this.db).id) { this.progress.statRanks[stat] = rank; names.push(mainHero(this.db).name); }
    for (const m of this.members()) if (hero === 'all' || hero === m.def.id) { (m.data.statRanks ??= {})[stat] = rank; names.push(m.def.name); }
    return names;
  }

  private wornGear(gear: Partial<Record<EquipSlot, string>> = this.inventory.equip): ({ slot: EquipSlot } & ItemDef | undefined)[] {
    return EQUIP_SLOTS.map((slot) => { const id = gear[slot], d = id ? this.items.get(id) : undefined; return d ? { ...d, slot } : undefined; });
  }

  /** What counts towards a hero's stats: what they wear, plus their class's boosts (less untrained armor's cost). */
  private statGear(gear: Partial<Record<EquipSlot, string>> = this.inventory.equip, a: AbilityData | null | undefined = this.progress.abilities, sk: Skills | null | undefined = this.skills): StatGear[] {
    const armor = gear.armor ? this.items.get(gear.armor) : undefined;
    return [...this.wornGear(gear).filter((g): g is { slot: EquipSlot } & ItemDef => !!g), { ...classStatGear(this.db, a, armor, sk), slot: 'class' }];
  }

  /** A weapon's damage share for this hero: untrained with it (their class, or Arms Training for medium / heavy) hits for ¾. */
  private weaponSkill(sk: Skills, a: AbilityData | null | undefined, w: ItemDef | undefined): number {
    const cls = w?.weapon && w.weapon.class !== 'bow' ? w.weapon.class : 'unarmed';
    return proficientWith(sk, cls) && gearSkill(this.db, a, w, sk) !== 'untrained' ? 1 : UNTRAINED_DAMAGE;
  }

  /** Which party member a hero id means ('' or the first hero: 0), or -1 when they aren't in the party. */
  private whoOf(id: string): number {
    if (!id || id === mainHero(this.db).id) return 0;
    const k = this.members().findIndex((m) => m.def.id === id);
    return k < 0 ? -1 : k + 1;
  }
  /** The party members a command means: '' the hero, 'all' everyone, or a hero's id. */
  private whosFor(hero: string | undefined): number[] {
    if (hero === 'all' || hero === 'any') return [0, ...this.members().map((_, k) => k + 1)];
    const w = this.whoOf(hero ?? '');
    return w < 0 ? [] : [w];
  }
  private heroIdOf(who: number): string { return who ? this.members()[who - 1]?.def.id ?? '' : mainHero(this.db).id; }

  /**
   * Give or cure an ailment (events, ailment tiles). Out of battle (Update 105): one per hero; someone who has one
   * gets no other (Zombie included); resistances and warding gear count; Chill and Stagger only happen in battle.
   */
  ailmentCommand(op: 'give' | 'cure', a: Ailment | 'all', seconds?: number, quiet = false, hero?: string): void {
    void seconds;
    const p = this.player.position;
    if (op === 'cure') {
      const out: string[] = [];
      for (const who of this.whosFor(hero)) {
        if (who === 0) out.push(...this.combat.heroStatus.cure([a]).map(String));
        out.push(...this.clearLingering([a], who));
      }
      if (out.length && !quiet) this.overlay.float(`${[...new Set(out)].map((x) => effectName(x as never)).join(', ')} cured`, p.x, p.y + 1.7, p.z, 'info');
      return;
    }
    if (a === 'all' || a === 'chill' || a === 'stagger') return;
    for (const who of this.whosFor(hero)) {
      const m = who ? this.members()[who - 1] : null;
      if (m ? m.data.down : this.stats.hp <= 0) continue;
      if (this.ailmentOf(who)) continue;
      const def = m ? m.def : mainHero(this.db);
      const resists = [...(def.resists ?? []), ...this.wornGear(m ? m.data.equip : undefined).flatMap((g) => g?.protects ?? [])];
      if (resists.includes(a)) continue;
      const turns = BATTLE_AILMENT[a].turns, rec = { [a]: Number.isFinite(turns) ? Math.max(1, turns) : 99 };
      if (m) m.data.ailments = rec; else this.heroAilments = rec;
      const at = m ? this.allies.find((x) => x.data === m.data) : null, pos = at ? { x: at.x, y: at.y, z: at.z } : p;
      this.overlay.float(effectName(a), pos.x, pos.y + 1.7, pos.z, 'info', effectColor(a));
      this.log.add(`${def.name} is ${STATUS_WORD[a].toLowerCase()}`, 'hurt');
    }
  }

  /* ---------------------------------------------------------------- good states and resting (Update 106) */

  /** A hero's good state while it lasts. */
  private goodOf(id: string): GoodState | undefined {
    const g = this.state.good.get(id);
    return g && g.until > this.state.clock ? g : undefined;
  }
  /** What a good state adds to a stat (Rested +1, Well Rested +3 to every stat). */
  private goodBonus(id: string, k: string): number {
    const g = this.goodOf(id);
    return g && (ATTRS as readonly string[]).includes(k) ? GOOD_INFO[g.kind].stat : 0;
  }
  /** Give a good state (for these hours; unset: the Database's), by the replacement rule. */
  private giveGood(hero: string, kind: GoodKind, hours?: number): void {
    const names: string[] = [];
    for (const who of this.whosFor(hero)) {
      const id = this.heroIdOf(who), cur = this.state.good.get(id);
      const next = nextGood(cur, kind, this.state.clock, hours ?? goodHours(this.db.body, kind));
      if (!next) continue;
      this.state.good.set(id, next);
      if (next.kind === kind) names.push(who ? this.members()[who - 1].def.name : mainHero(this.db).name);
    }
    if (names.length) this.log.add(`${names.join(', ')} ${names.length === 1 ? 'is' : 'are'} ${GOOD_INFO[kind].name}: +${GOOD_INFO[kind].stat} to every stat, +${GOOD_INFO[kind].exp}% EXP`, 'level');
    this.applySkillStats();
  }
  private goodStateCommand(c: Extract<Command, { cmd: 'goodState' }>): void {
    if (c.kind === 'none') { for (const who of this.whosFor(c.hero)) this.state.good.delete(this.heroIdOf(who)); this.applySkillStats(); return; }
    const h = (c.hours ?? 0) + (c.minutes ?? 0) / 60;
    this.giveGood(c.hero, c.kind, h > 0 ? h : undefined);
  }
  private heroWeatherCommand(c: Extract<Command, { cmd: 'heroWeather' }>): void {
    for (const who of this.whosFor(c.hero)) {
      const b = this.bodyOf(this.heroIdOf(who));
      switch (c.state) {
        case 'normal': b.meter = 0; b.wet = 0; break;
        case 'wet': b.wet = 1; break;
        case 'cold': b.meter = -65; break;
        case 'freezing': b.meter = -100; break;
        case 'hot': b.meter = 65; break;
        case 'overheating': b.meter = 100; break;
      }
    }
  }
  /** Conditions: does a hero ('' the hero, 'any', an id) have a weather state, an ailment or a good state? */
  private heroHas(hero: string, what: string): boolean {
    return this.whosFor(hero).some((who) => {
      const id = this.heroIdOf(who), a = this.ailmentOf(who), g = this.goodOf(id);
      if (what === 'ailment') return !!a;
      if (what === 'good') return !!g;
      if (what === 'rested' || what === 'wellRested') return g?.kind === what;
      if ((AILMENTS as readonly string[]).includes(what) || what === 'frozen') return a === what;
      return this.weatherStates.get(id) === what;
    });
  }

  /** A rest point: set the respawn point, then the hours and supplies screen; then the party sleeps. */
  private startRest(c: Extract<Command, { cmd: 'rest' }>): void {
    if (!c.noRespawn) this.setRespawn();
    this.restScreen.show({ supplies: !c.noSupplies }, (r) => {
      if (!r) return;
      const pts = Object.entries(r.use).reduce((sum, [id, n]) => sum + (this.items.get(id)?.camp ?? 0) * n, 0);
      const good = goodFromPoints(pts);
      if (good) for (const [id, n] of Object.entries(r.use)) this.inventory.remove(id, n);
      if (good) this.refreshRing();
      this.startSleep({ cmd: 'sleep', until: 'hours', hours: r.hours });
      if (this.sleeping) this.sleeping.done = () => this.finishRest(r.hours, good);
    });
  }

  /** Waking from a rest: 20% back an hour; 1 hour warms and dries; 5+ hours restores and cures everything. */
  private finishRest(hours: number, good: GoodKind | null): void {
    const share = restShare(hours);
    if (hours >= FULL_REST_HOURS) {
      this.fullRest(true);
      this.clearLingering(['all', 'zombie']);
    } else {
      const st = this.stats, mx = st.cfg.max;
      st.change('hp', 'add', mx.hp * share); st.change('mp', 'add', mx.mp * share); st.change('sp', 'add', mx.sp * share);
      for (const m of this.members()) {
        if (m.data.down) continue;
        const n = this.allyNumbers(m.data, m.def).max;
        m.data.hp = Math.min(n.hp, m.data.hp + Math.round(n.hp * share));
        m.data.mp = Math.min(n.mp, m.data.mp + Math.round(n.mp * share));
      }
    }
    if (hours >= 1) for (const p of this.bodyParty()) { const b = this.bodyOf(p.id); b.meter = 0; b.wet = 0; }
    // Camping together (Update 124): everyone travelling warms a little to everyone else.
    const camp = relAmount(this.db, 'camp'), ids = this.members().map((m) => m.def.id);
    if (camp) for (const a of ids) for (const b of [mainHero(this.db).id, ...ids]) if (a !== b) this.relChange(a, b, camp);
    if (good) this.giveGood('all', good);
    this.log.add(hours >= FULL_REST_HOURS ? `Rested ${hours} hours: everyone fully restored` : `Rested ${hours} hour${hours === 1 ? '' : 's'}: health and magic +${Math.round(share * 100)}%`, 'info');
    this.audio.play('save');
    this.state.tally('rests');
  }

  /** The hero's starting stats from the database (character creation replaces them on a new game). */
  private heroBase(): Attrs { return heroBase(mainHero(this.db)); }

  /** Max health, magic and stamina: the database's, plus skills and Endurance (checked every frame on the map). */
  private applySkillStats(): void {
    const base = playerConfig(this.db.stats).max, max = this.stats.cfg.max, sk = this.skills;
    const before = { ...max };
    // Endurance adds a little health (worn gear and skills count, not short buffs).
    const end = heroTotals(this.progress.stats, this.inventory ? this.statGear() : [], (k) => sk.get(k)).attrs.end;
    max.hp = Math.max(1, base.hp + sk.get('maxHp') + enduranceHp(end)); max.mp = base.mp + sk.get('maxMp'); max.sp = base.sp + sk.get('maxSp');
    // Raising a maximum adds the same to the current amount; lowering one caps it.
    for (const g of ['hp', 'mp', 'sp'] as const) this.stats[g] = Math.min(max[g], this.stats[g] + Math.max(0, max[g] - before[g]));
  }

  private learnSkill(node: SkillNode): void {
    this.progress.points -= this.skills.take(node);
    this.applySkillStats();
    const shards = this.teachShards();
    const got = teachFromSkills(this.db, this.progress.abilities, this.skills.ranks, this.skills.data.nodes);
    for (const g of got) this.log.add(`Learned ${g}`, 'level');
    this.audio.play('skill');
    const extra = [...shards.map((x) => `received ${x}`), ...got];
    this.menu.notice(`Learned ${node.name}${this.skills.maxRank(node) > 1 ? ` (rank ${this.skills.rank(node.id)})` : ''}${extra.length ? `: ${extra.join(', ')}` : ''}`);
  }

  /** Learn a rank in the Party tree: it counts for the hero and every party member (and anyone who joins later). */
  private learnPartySkill(node: SkillNode): void {
    this.progress.sharedPoints = Math.max(0, this.progress.sharedPoints - this.partySkills.take(node));
    this.applySkillStats();
    const got = new Set<string>();
    for (const g of teachFromSkills(this.db, this.progress.abilities, this.partySkills.ranks, this.partySkills.data.nodes)) got.add(g);
    for (const m of this.members()) for (const g of teachFromSkills(this.db, (m.data.abilities ??= {}), this.partySkills.ranks, this.partySkills.data.nodes)) got.add(g);
    for (const g of got) this.log.add(`The party learned ${g}`, 'level');
    this.audio.play('skill');
    this.menu.notice(`The party learned ${node.name}${this.partySkills.maxRank(node) > 1 ? ` (rank ${this.partySkills.rank(node.id)})` : ''}${got.size ? `: ${[...got].join(', ')}` : ''}`);
  }

  /** Music and background sound for where the hero is: the map's, an event's choice, night ambience, battle music. */
  private updateAudio(dt: number, fade = 1.5): void {
    const d = this.mapData, a = this.audio;
    const bs = this.battleSound;
    if (bs) {
      // A battle's own sound: the victory fanfare then its tune, or silence while the screen fades.
      if (bs.next && (bs.next.at -= dt) <= 0) { bs.music = bs.next.music; bs.fade = 1.2; bs.next = undefined; }
      a.music(bs.hush ? '' : bs.music, bs.fade);
      if (bs.hush) a.ambience('', bs.fade);
      a.setSpots([]);
      return;
    }
    a.listener.x = this.player.position.x; a.listener.z = this.player.position.z;
    // Events' own sounds (campfires, shores…), a few times a second.
    if ((this.spotTimer -= dt) <= 0) {
      this.spotTimer = 0.15;
      a.setSpots(this.onTitle ? [] : this.events.flatMap((e) => {
        const snd = e.page?.sound;
        if (!snd?.src || !e.onMap || e.broken) return [];
        return [{ key: `${this.mapName}:${e.data.id}`, src: snd.src, x: e.x + e.w / 2, z: e.z + e.h / 2, range: snd.range ?? 8, volume: (snd.volume ?? 80) / 100 }];
      }).concat(this.onTitle ? [] : this.litFires().filter((f) => this.sprites.def(f.type)?.respawn).map((f) => (
        // Lit campfires crackle softly on their own.
        { key: `${this.mapName}:fire:${f.x},${f.z}`, src: 'builtin:fire', x: f.x, z: f.z, range: 6, volume: 0.55 })))
        .concat(this.onTitle ? [] : this.waterfalls.map((f) => ({ key: `${this.mapName}:falls:${f.x.toFixed(1)},${f.z.toFixed(1)}`, src: 'builtin:falls', x: f.x, z: f.z, range: 9 + Math.min(8, (f.top - f.y) * 2), volume: Math.min(0.9, 0.45 + (f.top - f.y) * 0.1) }))));
    }
    // Battle music during a battle (and a moment after).
    // The battle music plays during battles (the built-in theme when the map has none), not while hunted.
    const hunted = this.battle.active;
    this.calmFor = hunted ? 0 : this.calmFor + dt;
    // Battle music: a battle's own (Start battle command, troop, zone), the field map's override, the battle map's, then
    // the game's default (Database → Audio), then the built-in theme.
    const fightMusic = (this.battle.active ? this.battleRules.music : undefined) || d.battleMusic || (this.battle.active ? this.stage?.music : undefined)
      || this.db.audio?.battleMusic || 'builtin:battle';
    const battle = fightMusic && this.battle.active ? fightMusic : undefined;
    // Build the battle music while things are calm, so it doesn't stall the moment a fight starts.
    if (fightMusic && this.calmFor > 1) a.prepare(fightMusic);
    a.music(battle ?? this.musicOverride ?? d.music ?? '', battle ? 0.6 : fade);
    const night = this.time.environment === 'outdoor' && this.time.night > 0.5 && d.ambienceNight;
    // Rain brings its own sound (unless an event chose one).
    const rainy = this.time.environment === 'outdoor' && (this.weather.kind === 'rain' || this.weather.kind === 'storm') && this.weather.amount > 0;
    const blowing = this.time.environment === 'outdoor' && this.weather.kind === 'blizzard' && this.weather.amount > 0;
    // Autumn and winter: the map's cold-season sound, or birdsong gives way to wind in bare branches.
    const cold = this.season === 'autumn' || this.season === 'winter';
    const day = cold && !night ? d.ambienceCold ?? (d.ambience === 'builtin:forest' ? 'builtin:chill' : d.ambience) : d.ambience;
    a.ambience(this.ambienceOverride ?? (rainy ? 'builtin:rain' : blowing ? 'builtin:wind' : night ? d.ambienceNight! : day ?? ''));
  }

  /* ------------------------------------------------------------------ menus */

  /** The pause menu's tabs shown (built and not hidden in Database → Title & menus). */
  private pauseTabs(): PauseOption[] {
    const m = this.db.menus;
    // Update 141: the Party menu (X) has the Party and the Journal; the rest have buttons of their own.
    return PAUSE_OPTIONS.filter(([o, , works]) => works && (o === 'status' || o === 'journal') && !m?.pauseHidden?.[o]).map(([o]) => o);
  }

  /** Open the pause menu: it covers most of the screen, its tabs across the top (LB / RB). */
  private openPauseMenu(tab?: PauseOption): void {
    const tabs = this.pauseTabs(), m = this.db.menus;
    if (!tabs.length) return;
    const k = tab ? Math.max(0, tabs.indexOf(tab)) : 0;
    // Its tabs on the triggers, the Journal's on the bumpers (Update 141).
    tabSwap.on = true;
    this.pauseShell.show(tabs.map((o) => ({ id: o, label: pauseLabel(m, o), icon: PAUSE_ICONS[o] })), k,
      [this.input.label('subPrev'), this.input.label('subNext')], (to) => { uiSound('menuMove'); this.showPauseTab(to); });
    this.showPauseTab(k);
  }

  /** Put away whatever pause tab is showing (another tab is taking over, or the menu is closing). */
  private hidePauseScreens(): void {
    this.partyScreen.hide(); this.bag.hide(); this.questScreen.hide(); this.logScreen.hide(); this.recordsScreen.hide(); this.bestiaryScreen.hide();
    this.worldMap.hide(); this.achScreen.hide();
    // A page opened from a tab (a hero's Status, Equipment, Stats, Skill Tree) goes too when another tab is clicked.
    this.statusScreen.hide(); this.equipScreen.hide(); this.charScreen.hide(); this.skillScreen.hide();
    this.menu.close();
  }

  private closePause(): void {
    this.hidePauseScreens();
    this.pauseShell.close();
    tabSwap.on = false;
  }

  /** B (Update 141): the Backpack, a compact bag at the bottom right; the game waits while it's open. */
  private openBackpack(): void {
    this.bag.compact = true;
    this.openInventory(this.invTab, () => { this.bag.compact = false; });
  }
  /** The Backpack's pocket tabs as pictures (Update 142: their names didn't fit). */
  private static readonly POCKET_ICONS: Record<string, string> = {
    all: '<svg viewBox="0 0 16 16"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/></svg>',
    consumable: '<svg viewBox="0 0 16 16"><path d="M6.5 2h3M7 2v3.5L4 10a2.6 2.6 0 0 0 2.3 4h3.4A2.6 2.6 0 0 0 12 10L9 5.5V2"/><path d="M5 10h6"/></svg>',
    gear: '<svg viewBox="0 0 16 16"><path d="M8 2l5 2v4c0 3-2.3 5-5 6-2.7-1-5-3-5-6V4z"/></svg>',
    shard: '<svg viewBox="0 0 16 16"><path d="M4 3h8l2 3.5L8 14 2 6.5z"/><path d="M2 6.5h12M6 3l2 11M10 3L8 14"/></svg>',
    material: '<svg viewBox="0 0 16 16"><path d="M2.5 11l3-6 3.5 1.5L11.5 4l2 4.5-1.5 4H3.5z"/></svg>',
    key: '<svg viewBox="0 0 16 16"><circle cx="5" cy="8" r="2.6"/><path d="M7.6 8H14M12 8v2.5M10 8v1.8"/></svg>',
  };
  /** Y (Update 141): the World Map, if the game has a World layout. */
  private openWorldMap(): void {
    if (!Object.keys(this.db.world?.maps ?? {}).length) { this.menu.notice('No world map yet'); return; }
    this.worldMap.show(() => {});
    this.drawWorldArt();
  }
  /**
   * A as a field power (Update 142). Sprint is handled while A is held (in the run check); the rest act like the key
   * item with that use, from the bag if one's carried (its name and numbers), otherwise a plain one.
   */
  private aButtonPower(p: NonNullable<Database['aButton']>): void {
    if (p === 'dash' || p === 'jump') return;
    if (p === 'light' || p === 'waterWalk') {
      const it = [...this.items.values()].find((d) => d.tool === p && this.inventory.count(d.id) > 0);
      if (!it) { this.menu.notice(`No ${POWER_NAMES[p]} key item in the bag`); return; }
      const msg = this.toggleTool(it.id);
      if (msg) this.menu.notice(msg);
      return;
    }
    const d: ItemDef = this.carried(p) ?? { id: `a:${p}`, name: FIELD_USE_NAMES[p], kind: 'key', icon: 'builtin:key', field: { use: p } };
    const dmg = Math.max(1, d.field?.damage ?? 10);
    let msg: string | null;
    if (p === 'cut') msg = this.combat.keySwing(dmg);
    else if (p === 'bow') msg = this.combat.keyDraw(dmg, () => this.input.isHeld('jump'));
    else msg = this.fieldUse(d);
    if (msg) this.menu.notice(msg);
  }
  /** Riding: B or Esc being held to get off the horse (Update 142), and for how long. */
  private dismountHold: { action: 'backpack' | 'settings'; t: number } | null = null;
  /** START (Update 141): Settings, with saving, loading and quitting. */
  private settingsOpen = false;
  private openSettingsMenu(): void {
    this.settingsOpen = true;
    this.openSettings({ onBack: () => { this.settingsOpen = false; } });
  }

  /** Inner tabs remembered while the game runs (the bag's pocket, the Journal's page). */
  private invTab = 0;
  private journalTab = 0;

  private showPauseTab(k: number): void {
    this.hidePauseScreens();
    this.pauseShell.select(k);
    const done = () => this.closePause(), group = this.pauseShell.group();
    switch (this.pauseShell.tab as PauseOption) {
      case 'status': this.partyScreen.show(done, group); break;
      case 'items': this.openInventory(this.invTab, done); break;
      case 'journal': this.openJournal(this.journalTab, done); break;
      case 'map': this.worldMap.show(done, group); this.drawWorldArt(); break;
      case 'achievements': this.achScreen.show(done, group); break;
      case 'settings': this.openSettings({ tabs: group, onBack: done }); break;
      case 'system': this.openSystem(group, done); break;
      default: done();
    }
  }

  /** The System tab: saving, loading and quitting. */
  private openSystem(tabs: TabGroup, done: () => void): void {
    const m = this.db.menus, anywhere = this.db.saving?.anywhere !== false;
    const label = (o: PauseOption) => pauseLabel(m, o);
    const items: MenuItem[] = [
      { label: 'Save', icon: PAUSE_ICONS.saveLoad, detail: anywhere ? undefined : 'Only at save points', disabled: !anywhere || !!m?.pauseHidden?.saveLoad, pick: () => this.openSaveScreen(false) },
      { label: 'Load', icon: PAUSE_ICONS.journal, disabled: !this.saves.latest() || !!m?.pauseHidden?.saveLoad, pick: () => this.openLoadScreen() },
      ...(m?.pauseHidden?.quitToTitle ? [] : [{ label: label('quitToTitle'), icon: PAUSE_ICONS.quitToTitle, pick: () => this.confirmQuit() }]),
    ];
    void SYSTEM_OPTIONS;
    this.menu.push(label('system'), items, { tabs, onBack: done });
  }

  /** Word bubbles over events ("!" / "?" for quests): only on the field, not in menus, battles or the title. */
  private updateBubbles(): void {
    const show = !this.onTitle && !this.battle.active && !this.stage && !this.pauseShell.isOpen && !this.transfer && !this.devConsole.isOpen;
    this.bubbles.visible = show;
    if (!show) return;
    const spots = [];
    for (const e of this.events) {
      const b = e.page?.bubble;
      if (!b || !e.onMap) continue;
      const sp = e.speakerPoint();
      const x = sp?.x ?? e.x + e.w / 2, z = sp?.z ?? e.z + e.h / 2;
      spots.push({ key: e, bubble: b, x, y: sp?.y ?? this.map.surfaceY(x, z), z, height: sp?.height ?? 0.8 });
    }
    // Party chatter: over the speaker's head, following them.
    const say = this.chatSay, at = say && this.bodyParty().find((p) => p.id === say.id);
    // Over the head (Update 121: characters stand about 1.5 tall, like events' speakers).
    if (say && at && at.shown) spots.push({ key: this.chatKey, bubble: say.bubble, x: at.x, y: at.y, z: at.z, height: 1.5 });
    this.bubbles.update(spots, this.projector, this.elapsed);
  }

  /* ---------------------------------------------------------------- world map */

  private readonly worldArt = new Map<string, HTMLCanvasElement>();
  private readonly worldTitles = new Map<string, string>();
  private readonly tileColors = new Map<string, string>();
  private worldDrawing = false;

  private tileColor(key: string): string {
    let c = this.tileColors.get(key);
    if (c) return c;
    const t = this.tileTextures.get(key);
    c = builtinTileColor(key) ?? (t?.map.image ? averageColor(t.map.image as CanvasImageSource) : '#5f9a45');
    this.tileColors.set(key, c);
    return c;
  }

  /** Draw the maps of the World layout from above (once each; the current map again, as cut trees change it). */
  private drawWorldArt(): void {
    if (this.worldDrawing) return;
    this.worldDrawing = true;
    const names = Object.keys(this.db.world?.maps ?? {});
    const style = { tile: (k: string) => this.tileColor(k), prop: (t: string) => propMark(this.sprites.def(t)) };
    void (async () => {
      for (const n of names) {
        if (this.worldArt.has(n) && n !== this.mapName) continue;
        try {
          const data = n === this.mapName ? this.mapData : await this.loadMapData(n);
          this.worldArt.set(n, drawMapArt(data, this.tiles, style, 4));
          this.worldEvents.set(n, data.events);
          this.worldTitles.set(n, data.name || n);
          if (this.worldMap.isOpen) this.worldMap.show(() => this.closePause(), this.pauseShell.group());
        } catch { /* a map that can't be read stays blank */ }
      }
      this.worldDrawing = false;
    })();
  }

  /** Each world map's events (for their markers), read as the world map is drawn. */
  private readonly worldEvents = new Map<string, EventData[]>();

  /** Event markers on the world map, where their switches allow. */
  private worldMarkers(): WorldMapMarker[] {
    const kinds = markerKinds(this.db.markers), out: WorldMapMarker[] = [];
    for (const [name, at] of Object.entries(this.db.world?.maps ?? {})) {
      const evs = name === this.mapName ? this.mapData.events : this.worldEvents.get(name) ?? [];
      for (const e of evs) {
        const m = e.marker, k = m && kinds.find((x) => x.id === m.kind);
        if (!m || !k) continue;
        if (m.switch && this.state.getSwitch(m.switch) === !!m.whenOff) continue;
        out.push({ x: at.x + e.x, z: at.z + e.z, w: Math.max(1, e.w ?? 1), h: Math.max(1, e.h ?? 1), symbol: k.symbol, color: k.color, label: m.label || e.name, kind: k.name });
      }
    }
    return out;
  }

  private worldPieces(): WorldMapPiece[] {
    const w = this.db.world, explore = w?.explore !== false;
    return Object.entries(w?.maps ?? {}).map(([name, at]) => ({
      name, at, title: this.worldTitles.get(name) ?? name, art: this.worldArt.get(name) ?? null,
      visited: this.visited.has(name), explored: explore ? this.exploredFor(name, at.w, at.h) : null,
    }));
  }

  private exploredFor(name: string, w: number, h: number): Explored {
    let e = this.explored.get(name);
    if (!e || e.w !== w || e.h !== h) { e = new Explored(w, h); this.explored.set(name, e); }
    return e;
  }

  /** Mark where the hero is as seen (a few times a second). */
  private exploreT = 0;
  private updateExplored(dt: number): void {
    if (this.onTitle || this.transfer || !this.mapData || !this.motion) return;
    this.visited.add(this.mapName);
    this.exploreT -= dt;
    if (this.exploreT > 0) return;
    this.exploreT = 0.3;
    this.exploredFor(this.mapName, this.mapData.width, this.mapData.height).reveal(this.motion.x, this.motion.z, 7);
  }

  /* ---------------------------------------------------------------- mini-map */

  /** The current map drawn from above for the mini-map (redrawn when the map changes). */
  private miniArt: { name: string; art: HTMLCanvasElement } | null = null;
  private miniT = 0;

  /**
   * The HUD's round mini-map: north up, the hero in the middle, the map drawn like the world map (with the same
   * fog where the world map has it), the map's markers and the party as dots.
   */
  private updateMinimap(dt: number): void {
    const el = this.hud.minimap;
    if (this.onTitle || !this.mapData || !this.motion || el.hidden || el.classList.contains('hud-off')) return;
    if ((this.miniT -= dt) > 0) return;
    this.miniT = 0.1;
    const PX = 4;
    if (this.miniArt?.name !== this.mapName) {
      const style = { tile: (k: string) => this.tileColor(k), prop: (t: string) => propMark(this.sprites.def(t)) };
      try { this.miniArt = { name: this.mapName, art: drawMapArt(this.mapData, this.tiles, style, PX) }; } catch { return; }
    }
    const c = this.hud.minimapCanvas, g = c.getContext('2d')!, S = c.width, zoom = 1.5, tile = PX * zoom;
    const px = this.motion.x, pz = this.motion.z;
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#0b0e16';
    g.fillRect(0, 0, S, S);
    g.save();
    g.translate(S / 2 - px * tile, S / 2 - pz * tile);
    g.scale(zoom, zoom);
    g.drawImage(this.miniArt.art, 0, 0);
    g.restore();
    // Fog: unexplored cells in view stay dark, as on the world map.
    const view = Math.ceil(S / tile / 2) + 1, x0 = Math.floor(px) - view, z0 = Math.floor(pz) - view;
    if (this.db.world?.explore !== false) {
      const ex = this.exploredFor(this.mapName, this.mapData.width, this.mapData.height);
      g.fillStyle = 'rgba(11, 14, 22, 0.92)';
      for (let z = z0; z <= z0 + view * 2; z++)
        for (let x = x0; x <= x0 + view * 2; x++)
          if (!ex.has(x, z)) g.fillRect(Math.floor(S / 2 + (x - px) * tile), Math.floor(S / 2 + (z - pz) * tile), Math.ceil(tile), Math.ceil(tile));
    }
    const at = (x: number, z: number): [number, number] => [S / 2 + (x - px) * tile, S / 2 + (z - pz) * tile];
    // The map's markers (where their switches allow).
    const kinds = markerKinds(this.db.markers);
    for (const e of this.mapData.events) {
      const m = e.marker, k = m && kinds.find((x) => x.id === m.kind);
      if (!m || !k || (m.switch && this.state.getSwitch(m.switch) === !!m.whenOff)) continue;
      const [mx, mz] = at(e.x + Math.max(1, e.w ?? 1) / 2, e.z + Math.max(1, e.h ?? 1) / 2);
      const r = S / 2 - 10, d = Math.hypot(mx - S / 2, mz - S / 2);
      // Off the edge: pinned to the rim, pointing the way.
      const k2 = d > r ? r / d : 1;
      drawMarker(g, k.symbol, S / 2 + (mx - S / 2) * k2, S / 2 + (mz - S / 2) * k2, 7, k.color);
    }
    for (const a of this.allies) {
      const [ax, az] = at(a.x, a.z);
      g.fillStyle = a.down ? '#7a7f8f' : '#8fd0ff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(ax, az, 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // The hero: an arrow the way they face.
    const ang = ({ up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 } as Record<string, number>)[this.player.dir] ?? Math.PI / 2;
    g.save(); g.translate(S / 2, S / 2); g.rotate(ang);
    g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(8, 0); g.lineTo(-6, -6); g.lineTo(-3, 0); g.lineTo(-6, 6); g.closePath(); g.stroke(); g.fill();
    g.restore();
  }

  /* ---------------------------------------------------------------- achievements */

  private readonly achWorld: AchievementWorld = {
    record: (k) => this.state.record(k),
    level: () => this.progress.level,
    questDone: (id) => this.quests.status(id) === 'done',
    switchOn: (id) => this.state.getSwitch(id),
    gold: () => this.inventory.gold,
    count: (id) => this.inventory.count(id),
    partySize: () => this.members().length + 1,
  };

  private achIcon(icon: string | undefined): string {
    if (!icon || icon.startsWith('builtin:')) return this.builtinUrl(icon ? builtinIconName(icon) ?? 'trophy' : 'trophy');
    return this.resolveFile(icon);
  }

  private achievementViews(): AchievementView[] {
    return (this.db.achievements ?? []).map((a) => {
      const got = this.achBook.has(a.id), p = got ? null : achProgress(a.rule, this.achWorld);
      return { id: a.id, name: a.name, description: a.description, icon: this.achIcon(a.icon), points: a.points, unlocked: got, hidden: !!a.hidden,
        when: this.achBook.when(a.id), have: p?.have, need: p?.need };
    });
  }

  /** Unlock one (an event, or its rule met): the pop-up, once. Not in a game where console cheats were used. */
  private unlockAchievement(id: string, force = false): boolean {
    const a = this.db.achievements?.find((x) => x.id === id);
    if (!a || this.achBook.has(id) || (this.state.cheated && !force)) return false;
    this.achBook.unlock(id);
    platformUnlock(id);
    this.achToast.show({ name: a.name, points: a.points, icon: this.achIcon(a.icon), description: a.description });
    this.log.add(`Achievement unlocked: ${a.name} (${a.points}G)`, 'level');
    return true;
  }

  /** Check the rules every so often. */
  private achT = 0;
  private checkAchievements(dt: number): void {
    this.achT -= dt;
    if (this.achT > 0 || this.onTitle || this.state.cheated) return;
    this.achT = 0.5;
    for (const a of this.db.achievements ?? []) {
      if (a.rule.kind === 'event' || this.achBook.has(a.id)) continue;
      const p = achProgress(a.rule, this.achWorld);
      if (p.have >= p.need) this.unlockAchievement(a.id);
    }
  }

  /* ---------------------------------------------------------------- developer console */

  /** Using a cheat marks the game (achievements stay locked in it). */
  private cheat(): void { if (!this.state.allowAchievements) this.state.cheated = true; }

  private applyCheats(): void {
    if (this.cheats.deathless && this.stats.hp < 1 && !this.onTitle) this.stats.change('hp', 'set', 1);
    if (this.cheats.deathlessParty) for (const m of this.members()) { if (m.data.down || m.data.hp < 1) { m.data.down = false; m.data.hp = Math.max(1, m.data.hp); } }
    if (this.cheats.infiniteGold && this.inventory.gold < 999999) this.inventory.gold = 999999;
    if (this.motion) this.motion.ghost = this.cheats.ghost;
  }

  private consoleCommands(): ConsoleCommand[] {
    const ids = <T extends { id: string }>(list: T[] | undefined) => (list ?? []).map((x) => x.id);
    const items = () => [...this.items.keys()];
    const heroes = () => ['all', ...ids(this.db.heroes)];
    const onOff = (v: string | undefined, now: boolean) => (v === undefined ? !now : /^(on|true|1|yes)$/i.test(v));
    const num = (v: string | undefined, d: number) => { const n = Number(v); if (v !== undefined && !Number.isFinite(n)) throw new Error(`“${v}” isn’t a number`); return v === undefined ? d : n; };
    const need = (v: string | undefined, what: string) => { if (!v) throw new Error(`Which ${what}?`); return v; };
    const run = (cmds: Command[]) => { this.interpreter.start(cmds); return 'Done (it happens as the console closes).'; };
    const toggle = (key: keyof typeof this.cheats, label: string): ConsoleCommand => ({
      name: label.toLowerCase().replace(/ /g, '_'), args: '[on|off]', help: `${label}: toggle`, complete: () => ['on', 'off'],
      run: (a) => { const on = onOff(a[0], !!this.cheats[key]); (this.cheats as Record<string, unknown>)[key] = on; if (on) this.cheat(); return `${label}: ${on ? 'on' : 'off'}`; },
    });
    const learnable = (i: number, kind: 'spell' | 'addition') => [...(kind === 'spell' ? spellList(this.db).map((x) => x.id) : additionList(this.db).map((x) => x.id)), ...(i > 0 ? ['all', ...this.members().map((m) => m.def.name.toLowerCase()), mainHero(this.db).name.toLowerCase()] : [])];
    /**
     * Who a command is for: a hero's id or name anywhere in it (any case: "level 5 eleanor"), "all" / "party" for
     * everyone, or (none named) the hero you play. Returns them as `who`s (0 the hero) and the other words.
     */
    const target = (a: string[], dflt: 'hero' | 'all' = 'hero'): { whos: number[]; rest: string[] } => {
      const ms = this.members(), hero = mainHero(this.db), low = (x: string) => x.toLowerCase();
      const idx = a.findIndex((w) => /^(all|party|everyone)$/i.test(w) || low(w) === low(hero.id) || low(w) === low(hero.name) || ms.some((m) => low(w) === low(m.def.id) || low(w) === low(m.def.name)));
      if (idx < 0) return { whos: dflt === 'all' ? [0, ...ms.map((_, k) => k + 1)] : [0], rest: a };
      const w = low(a[idx]), rest = a.filter((_, k) => k !== idx);
      if (/^(all|party|everyone)$/.test(w)) return { whos: [0, ...ms.map((_, k) => k + 1)], rest };
      if (w === low(hero.id) || w === low(hero.name)) return { whos: [0], rest };
      return { whos: [ms.findIndex((m) => w === low(m.def.id) || w === low(m.def.name)) + 1], rest };
    };
    const nameOf = (who: number) => (who ? this.members()[who - 1]?.def.name ?? '?' : mainHero(this.db).name);
    const party = () => ['all', mainHero(this.db).name.toLowerCase(), ...this.members().map((m) => m.def.name.toLowerCase())];
    const giveXp = (who: number, n: number) => {
      if (!who) { this.gainXp(n, false); return; }
      const m = this.members()[who - 1];
      if (m) memberGainXp(m.data, n, this.combatCfg, this.memberGrowth(m), this.combatCfg.pointsPerLevel);
    };
    const levelOf = (who: number) => (who ? this.members()[who - 1]?.data.level ?? 1 : this.progress.level);
    const maxOf = (who: number) => (who ? this.allyNumbers(this.members()[who - 1].data, this.members()[who - 1].def).max : this.stats.cfg.max);
    const vitals = (who: number, hp?: number, mp?: number) => {
      if (!who) { if (hp !== undefined) this.stats.change('hp', 'set', hp); if (mp !== undefined) this.stats.change('mp', 'set', mp); return; }
      const m = this.members()[who - 1];
      if (!m) return;
      const mx = maxOf(who);
      if (hp !== undefined) { m.data.hp = Math.max(0, Math.min(mx.hp, hp)); m.data.down = m.data.hp <= 0; }
      if (mp !== undefined) m.data.mp = Math.max(0, Math.min(mx.mp, mp));
    };
    return [
      { name: 'give', args: '<item> [count]', help: 'Put an item in the bag', complete: (i) => (i === 0 ? items() : []),
        run: (a) => { const id = need(a[0], 'item'); if (!this.items.get(id)) throw new Error(`No item “${id}”`); const n = Math.max(1, Math.round(num(a[1], 1))); this.cheat(); const left = this.inventory.add(id, n); this.refreshRing(); return `+${n - left} ${this.items.get(id)!.name}${left ? ` (${left} didn’t fit)` : ''}`; } },
      { name: 'take', args: '<item> [count]', help: 'Take an item out of the bag', complete: (i) => (i === 0 ? items() : []),
        run: (a) => { const id = need(a[0], 'item'); const n = this.inventory.remove(id, Math.max(1, Math.round(num(a[1], 1)))); this.refreshRing(); return `−${n} ${this.items.get(id)?.name ?? id}`; } },
      { name: 'gold', args: '<amount>', help: 'Add gold (negative takes it)', run: (a) => { this.cheat(); this.inventory.gold = Math.max(0, this.inventory.gold + Math.round(num(a[0], 1000))); return `${this.inventory.gold} G`; } },
      { name: 'party_add', args: '<hero>', help: 'A hero joins the party', complete: () => ids(this.db.heroes).filter((h) => h !== mainHero(this.db).id), run: (a) => { this.cheat(); this.changeParty('add', need(a[0], 'hero')); return 'Joined.'; } },
      { name: 'party_remove', args: '<hero>', help: 'A hero leaves the party', complete: () => this.members().map((m) => m.def.id), run: (a) => { this.changeParty('remove', need(a[0], 'hero')); return 'Left.'; } },
      { name: 'learn_spell', args: '<spell> [rank] [hero|all]', help: 'Teach a spell', complete: (i) => learnable(i, 'spell'),
        run: (a) => { const t = target(a, 'all'); this.cheat(); let out = '';
          for (const w of t.whos) out = this.eventLearn({ cmd: 'learn', who: w ? this.members()[w - 1].def.id : mainHero(this.db).id, spell: need(t.rest[0], 'spell'), rank: Math.max(1, Math.round(num(t.rest[1], 1))) }) ?? out;
          return out || 'Already known.'; } },
      { name: 'learn_addition', args: '<addition> [hero|all]', help: 'Teach an Addition', complete: (i) => learnable(i, 'addition'),
        run: (a) => { const t = target(a, 'all'); this.cheat(); let out = '';
          for (const w of t.whos) out = this.eventLearn({ cmd: 'learn', who: w ? this.members()[w - 1].def.id : mainHero(this.db).id, addition: need(t.rest[0], 'Addition') }) ?? out;
          return out || 'Already known.'; } },
      { name: 'forget_spell', args: '<spell> [hero|all]', help: 'Forget a spell', complete: (i) => learnable(i, 'spell'),
        run: (a) => { const t = target(a, 'all'), id = need(t.rest[0], 'spell'); let n = 0; for (const w of t.whos) { const ab = this.abilitiesOf(w); if (ab?.spells?.[id]) { delete ab.spells[id]; n++; } } return `${n} forgot it.`; } },
      { name: 'forget_addition', args: '<addition> [hero|all]', help: 'Forget an Addition', complete: (i) => learnable(i, 'addition'),
        run: (a) => { const t = target(a, 'all'), id = need(t.rest[0], 'Addition'); let n = 0; for (const w of t.whos) { const ab = this.abilitiesOf(w); if (ab?.additions && id in ab.additions) { delete ab.additions[id]; if (ab.addition === id) delete ab.addition; n++; } } return `${n} forgot it.`; } },
      { name: 'exp', args: '<amount> [hero|all]', help: 'Give EXP (you, a hero by name, or all)', complete: (i) => (i === 1 ? party() : []),
        run: (a) => { const t = target(a), n = Math.max(1, Math.round(num(t.rest[0], 100))); this.cheat(); for (const w of t.whos) giveXp(w, n); return t.whos.map((w) => `${nameOf(w)}: level ${levelOf(w)}`).join(' · '); } },
      { name: 'level', args: '<level> [hero|all]', help: 'Level up to this level (you, a hero by name, or all)', complete: (i) => (i === 1 ? party() : []),
        run: (a) => {
          const t = target(a); this.cheat();
          for (const w of t.whos) {
            const want = Math.round(num(t.rest[0], levelOf(w) + 1));
            for (let k = 0; k < 200 && levelOf(w) < want; k++) {
              const before = levelOf(w);
              if (!w) { if (this.progress.maxed) break; this.gainXp(Math.max(1, this.progress.toNext - this.progress.xp), false); }
              else { const m = this.members()[w - 1], need = xpToNext(this.combatCfg, m.data.level); if (!need) break; giveXp(w, Math.max(1, need - m.data.xp)); }
              if (levelOf(w) === before) break;
            }
          }
          return t.whos.map((w) => `${nameOf(w)}: level ${levelOf(w)}`).join(' · ');
        } },
      { name: 'heal', args: '[hero|all]', help: 'Health, magic and stamina back, ailments cured (everyone, or one hero)', complete: () => party(),
        run: (a) => {
          const t = target(a, 'all');
          if (t.whos.length > 1) { this.fullRest(true); for (const m of this.members()) m.data.down = false; return 'Everyone restored.'; }
          const w = t.whos[0], mx = maxOf(w);
          if (!w) { this.stats.refill(); this.combat.heroStatus.clear(); } else vitals(w, mx.hp, mx.mp);
          return `${nameOf(w)} restored.`;
        } },
      { name: 'hp', args: '<amount> [hero|all]', help: 'Set health', complete: (i) => (i === 1 ? party() : []),
        run: (a) => { const t = target(a); this.cheat(); for (const w of t.whos) vitals(w, num(t.rest[0], maxOf(w).hp)); return `${t.whos.map(nameOf).join(', ')}: HP set.`; } },
      { name: 'mp', args: '<amount> [hero|all]', help: 'Set magic', complete: (i) => (i === 1 ? party() : []),
        run: (a) => { const t = target(a); this.cheat(); for (const w of t.whos) vitals(w, undefined, num(t.rest[0], maxOf(w).mp)); return `${t.whos.map(nameOf).join(', ')}: MP set.`; } },
      { name: 'ko', args: '[hero|all]', help: 'Knock someone out (to test revives)', complete: () => party(),
        run: (a) => { const t = target(a); for (const w of t.whos) vitals(w, w ? 0 : 1); return `${t.whos.map(nameOf).join(', ')}${t.whos.includes(0) ? ' (the hero you play keeps 1 HP on the field)' : ' knocked out.'}`; } },
      { name: 'revive', args: '[hero|all]', help: 'Back on their feet at full health', complete: () => party(),
        run: (a) => { const t = target(a, 'all'); for (const w of t.whos) vitals(w, maxOf(w).hp); return `${t.whos.map(nameOf).join(', ')} revived.`; } },
      toggle('deathless', 'Deathless'),
      { ...toggle('deathlessParty', 'Deathless party'), name: 'deathless_party' },
      { name: 'infinite_items', args: '[on|off]', help: 'Using consumables doesn’t use them up', complete: () => ['on', 'off'],
        run: (a) => { const on = onOff(a[0], this.inventory.keepUsed); this.inventory.keepUsed = on; if (on) this.cheat(); return `Infinite items: ${on ? 'on' : 'off'}`; } },
      { ...toggle('infiniteGold', 'Infinite gold'), name: 'infinite_gold' },
      { name: 'god', args: '[on|off]', help: 'Deathless hero and party, infinite items and gold', complete: () => ['on', 'off'],
        run: (a) => { const on = onOff(a[0], this.cheats.deathless); Object.assign(this.cheats, { deathless: on, deathlessParty: on, infiniteGold: on }); this.inventory.keepUsed = on; if (on) this.cheat(); return `God mode: ${on ? 'on' : 'off'}`; } },
      toggle('ghost', 'Ghost'),
      { name: 'speed', args: '<times>', help: 'Walk faster (1 = normal)', run: (a) => { this.cheats.speed = Math.max(0.25, Math.min(6, num(a[0], 1))); return `Speed ×${this.cheats.speed}`; } },
      { name: 'unlock_skills', args: '[hero|all]', help: 'Every skill and perk, at full rank', complete: () => heroes(),
        run: (a) => {
          this.cheat();
          const nodes = skillsData(this.db.skills).nodes, full = Object.fromEntries(nodes.map((n) => [n.id, Math.max(1, n.ranks ?? 1)]));
          const t = target(a, 'all');
          if (t.whos.includes(0)) { Object.assign(this.progress.ranks, full); Object.assign(this.progress.sharedRanks, full); this.syncSkills(); }
          for (const w of t.whos) if (w) this.members()[w - 1].data.skills = { ...full };
          return `${nodes.length} skills unlocked.`;
        } },
      { name: 'teleport', args: '<map> [x z]', help: 'Go to a map (its start, or a tile)', complete: (i) => (i === 0 ? Object.keys(this.db.world?.maps ?? {}).concat(this.handedMaps ? Object.keys(this.handedMaps) : []) : []),
        run: (a) => { const map = need(a[0], 'map'); const x = num(a[1], NaN), z = num(a[2], NaN);
          const to = Number.isFinite(x) && Number.isFinite(z) ? { x: x + 0.5, z: z + 0.5 } : map === this.db.startMap ? this.db.start : { x: -1, z: -1 };
          this.devConsole.toggle(false);
          this.requestTransfer(map, to.x < 0 ? { x: 0.5, z: 0.5 } : to, 'black');
          return `Off to ${map}.`; } },
      { name: 'time', args: '<hour>', help: 'Set the time of day (0–23.75)', run: (a) => { this.time.set(Math.max(0, Math.min(23.75, num(a[0], 12))), true); return this.time.label(this.settings.clock12); } },
      { name: 'achievements_allow', args: '[on|off]', help: 'Let achievements unlock again on this save, even after cheats (off: cheats lock them again)', complete: () => ['on', 'off'],
        run: (a) => { const on = onOff(a[0], false); this.state.allowAchievements = on; if (on) this.state.cheated = false; return on ? 'Achievements unlock on this save, cheats or not.' : 'Achievements follow the usual rule again (the next cheat locks them).'; } },
      { name: 'audio_chiptune', args: '[true|false]', help: 'Hear the built-in chiptune instead of imported sounds and music (nothing in the Database changes)', complete: () => ['true', 'false'],
        run: (a) => { this.audio.chipTest = onOff(a[0], this.audio.chipTest); return this.audio.chipTest ? 'Chiptune test on: every effect and theme plays its built-in chip version. audio_chiptune false puts your sounds back.' : 'Chiptune test off: your own sounds are back.'; } },
      { name: 'weather', args: '<kind> [amount]', help: 'Change this map’s weather', complete: () => [...WEATHER_KINDS],
        run: (a) => {
          // Everyday names for the kinds (clear skies are "none").
          const said = need(a[0], 'weather').toLowerCase();
          const kind = ({ clear: 'none', sun: 'none', sunny: 'none', off: 'none', fog: 'haze', mist: 'haze', thunder: 'storm', thunderstorm: 'storm', sand: 'sandstorm', leaf: 'leaves' } as Record<string, WeatherKind>)[said] ?? said;
          if (!WEATHER_KINDS.includes(kind as WeatherKind)) return `No weather called “${a[0]}”. Try: ${WEATHER_KINDS.join(', ')}.`;
          return run([{ cmd: 'weather', kind: kind as WeatherKind, amount: num(a[1], 1) }]);
        } },
      { name: 'body', args: '[meter -100…100] [wet 0…1]', help: 'The elements on each hero: their cold / heat meter, wetness and state (with numbers: set them for everyone)',
        run: (a) => {
          if (a.length) for (const h of this.bodyParty()) { const b = this.bodyOf(h.id); b.meter = Math.max(-100, Math.min(100, num(a[0], b.meter))); if (a[1] !== undefined) b.wet = Math.max(0, Math.min(1, num(a[1], b.wet))); }
          return this.bodyParty().map((h) => { const b = this.bodyOf(h.id); return `${h.name}: meter ${Math.round(b.meter)}, wet ${Math.round(b.wet * 100)}%, ${this.weatherStateName(h.id) || 'normal'}, Warmth ${this.warmthOf(h.equip)}`; }).join(' · ') + ` · ${Math.round(this.temperature())}°F`;
        } },
      { name: 'season', args: '<spring|summer|autumn|winter|auto>', help: 'Show a season (auto: the real one)', complete: () => ['spring', 'summer', 'autumn', 'winter', 'auto'],
        run: (a) => { const v = need(a[0], 'season'); this.seasonTest = v === 'auto' ? null : v as Season; return `Season: ${v}`; } },
      { name: 'horse', args: '[horse id|home|on|off]', help: 'Get a horse for free (or send it home, get on, get off)', complete: () => [...horseList(this.db).map((x) => x.id), 'home', 'on', 'off'],
        run: (a) => run([a[0] === 'home' ? { cmd: 'horse', op: 'home' } : a[0] === 'on' ? { cmd: 'horse', op: 'mount' } : a[0] === 'off' ? { cmd: 'horse', op: 'dismount' } : { cmd: 'horse', op: 'rent', id: a[0], free: true }]) },
      { name: 'battle', args: '<troop|enemy…>', help: 'Start a battle with a troop or some enemies', complete: () => [...ids(this.db.troops), ...ids(this.db.enemies)],
        run: (a) => {
          const troop = this.db.troops?.find((t) => t.id === a[0]);
          const enemies = troop ? troop.members.flatMap((m) => Array.from({ length: Math.max(1, m.min ?? 1) }, () => m.enemy)) : a;
          if (!enemies.length) throw new Error('Which troop or enemies?');
          return run([{ cmd: 'battle', enemies: enemies.slice(0, MAX_FOES), canRun: true }]);
        } },
      { name: 'win_battle', help: 'Every foe in this battle falls', run: () => { if (!this.battle.active) throw new Error('Not in a battle.'); this.cheat(); this.battle.debugWin(); return 'Victory.'; } },
      { name: 'switch', args: '<switch> <on|off>', help: 'Set a switch', run: (a) => { this.state.setSwitch(need(a[0], 'switch'), onOff(a[1], !this.state.getSwitch(a[0]))); this.refreshEvents(); return `${a[0]}: ${this.state.getSwitch(a[0]) ? 'ON' : 'OFF'}`; } },
      { name: 'var', args: '<variable> <value>', help: 'Set a variable', run: (a) => { this.state.setVar(need(a[0], 'variable'), num(a[1], 0)); this.refreshEvents(); return `${a[0]} = ${this.state.getVar(a[0])}`; } },
      { name: 'debug_menu', args: '<show|hide>', help: 'The playtest panel', complete: () => ['show', 'hide'],
        run: (a) => { const on = a[0] ? /^(show|on)$/i.test(a[0]) : !this.debug.visible; this.debug.setVisible(on); return `Debug menu ${on ? 'shown' : 'hidden'}.`; } },
      { name: 'fps', args: '[on|off]', help: 'Show the frame rate', complete: () => ['on', 'off'], run: (a) => { this.settings.showFps = onOff(a[0], !!this.settings.showFps); this.applySettings(); return `Frame rate ${this.settings.showFps ? 'shown' : 'hidden'}.`; } },
      { name: 'hud', args: '[on|off]', help: 'Show or hide the HUD (screenshots)', complete: () => ['on', 'off'], run: (a) => { const on = onOff(a[0], document.body.classList.contains('hud-hidden')); document.body.classList.toggle('hud-hidden', !on); return `HUD ${on ? 'shown' : 'hidden'}.`; } },
      { name: 'achievement', args: '<id>', help: 'Unlock an achievement (even in a cheated game)', complete: () => ids(this.db.achievements),
        run: (a) => (this.unlockAchievement(need(a[0], 'achievement'), true) ? 'Unlocked.' : 'Already unlocked, or no such achievement.') },
      { name: 'achievements_reset', help: 'Lock every achievement again (in this browser)', run: () => { this.achBook.reset(); return 'All achievements locked again.'; } },
      { name: 'reset_achievements', help: 'Clear every achievement and start them over (same as achievements_reset)', run: () => { this.achBook.reset(); return 'All achievements cleared: they start over.'; } },
      { name: 'explore_all', help: 'Reveal the whole world map', run: () => { for (const [n, p] of Object.entries(this.db.world?.maps ?? {})) { this.visited.add(n); this.exploredFor(n, p.w, p.h).reveal(p.w / 2, p.h / 2, Math.hypot(p.w, p.h)); } return 'The world map is revealed.'; } },
      { name: 'bug', args: '<note…>', help: 'Note a bug here: map, tile, party and a picture (bugs: download the list)', run: (a) => {
          const note = a.join(' ').trim();
          if (!note) throw new Error('Write what went wrong: bug the door won’t open');
          const list = this.bugNotes();
          list.push({ when: new Date().toISOString(), note, map: this.mapName, x: Math.floor(this.motion.x), z: Math.floor(this.motion.z), height: this.map.step(Math.floor(this.motion.x), Math.floor(this.motion.z)),
            hour: Math.round(this.time.hour * 100) / 100, party: [mainHero(this.db).name, ...this.members().map((m) => m.def.name)], level: this.progress.level, battle: this.battle.active || undefined, shot: this.captureShot() ?? undefined });
          this.saveBugNotes(list);
          return `Noted (${list.length} so far). Type bugs to download them, bugs clear to start over.`;
        } },
      { name: 'bugs', args: '[clear]', help: 'Download the bug notes (or clear them)', complete: () => ['clear'], run: (a) => {
          const list = this.bugNotes();
          if (a[0] === 'clear') { this.saveBugNotes([]); return `Cleared ${list.length} note${list.length === 1 ? '' : 's'}.`; }
          if (!list.length) return 'No bug notes yet: bug <what went wrong>';
          const url = URL.createObjectURL(new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' }));
          const link = document.createElement('a');
          link.href = url; link.download = `bug-notes-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          return `Downloaded ${list.length} note${list.length === 1 ? '' : 's'}.`;
        } },
      { name: 'temperature', args: '[set|add|reset] [°F]', help: 'Show or change the temperature on this map', complete: () => ['set', 'add', 'reset'],
        run: (a) => {
          if (a[0] === 'reset') this.tempHere = null;
          else if (a[0] === 'set' || a[0] === 'add') this.tempHere = { op: a[0], value: num(a[1], 0) };
          const dyn = this.dynamicWeather();
          return `${formatTemp(this.temperature(), 'F')} (${formatTemp(this.temperature(), 'C')}) · weather ${this.weather.kind}${dyn ? ` (spell ${dyn.spell})` : ''}`;
        } },
      { name: 'sleep', args: '[morning|night|<hours>]', help: 'Sleep (the sky transition) and rest', complete: () => ['morning', 'night'],
        run: (a) => { const v = a[0] ?? 'morning', h = parseFloat(v); return run([{ cmd: 'sleep', until: Number.isFinite(h) ? 'hours' : v === 'night' ? 'night' : 'morning', hours: Number.isFinite(h) ? h : undefined, rest: true }]); } },
      { name: 'where', help: 'This map and tile', run: () => `${this.mapName} · ${Math.floor(this.motion.x)}, ${Math.floor(this.motion.z)} · height ${this.map.step(Math.floor(this.motion.x), Math.floor(this.motion.z))}` },
    ];
  }

  /* ---------------------------------------------------------------- party lineup */

  /** The party in lineup order as `who`s (0 the hero, k the k-th member): the first three fight. */
  private lineupWhos(): number[] {
    const order = this.members().map((_, k) => k + 1);
    const at = this.combatCfg.turnBased.heroLocked ? Math.min(this.heroAt, this.activeMembers) : this.heroAt;
    order.splice(Math.max(0, Math.min(at, order.length)), 0, 0);
    return order;
  }

  /** Who fights (and walks along on the map). */
  private activeWhos(): number[] { return this.lineupWhos().slice(0, this.activeMembers + 1); }
  /** Party members fighting beside the hero (Database → Player → Party size: 3 or 4 active). */
  private get activeMembers(): number {
    // Single mode: Database → Combat → Heroes who fight (Single) is the lineup that's out; otherwise Party size.
    const tb = this.combatCfg.turnBased;
    if (tb.mode === 'single') return Math.max(0, tb.singleParty - 1);
    return this.db.activeParty === 4 ? ACTIVE_MEMBERS + 1 : ACTIVE_MEMBERS;
  }

  /** Reorder the party (a list of `who`s). */
  private setLineup(order: number[]): void {
    const ms = this.party.members;
    const list = order.filter((w) => w > 0).map((w) => ms[w - 1]).filter((x) => !!x);
    this.party.members = [...list, ...ms.filter((x) => !list.includes(x))];
    this.heroAt = Math.max(0, order.indexOf(0));
    this.spawnAllies();
  }

  private swapLineup(a: number, b: number): void {
    const order = this.lineupWhos(), i = order.indexOf(a), j = order.indexOf(b);
    if (i < 0 || j < 0) return;
    [order[i], order[j]] = [order[j], order[i]];
    // The hero who always fights can't end up on the bench.
    if (this.combatCfg.turnBased.heroLocked && order.indexOf(0) > this.activeMembers) return;
    this.setLineup(order);
  }

  private readonly bigArt = new Map<string, string>();
  /** A hero's card picture: their face art (Database → Heroes), or their sprite drawn large. */
  private heroArt(who: number): string {
    const def = who ? this.members()[who - 1]?.def : mainHero(this.db);
    if (def?.face) return this.resolveFile(def.face);
    const key = who ? `ally:${def?.id}` : 'hero';
    let u = this.bigArt.get(key);
    if (!u) {
      const look = who ? this.db.characters[def?.look ?? ''] ?? this.db.characters[this.db.player] : this.db.characters[this.db.player];
      u = this.sprites.portrait(`${key}:big`, look, 128).toDataURL();
      this.bigArt.set(key, u);
    }
    return u;
  }

  private partyView(who: number): PartyMemberView {
    const locked = !who && this.combatCfg.turnBased.heroLocked;
    if (!who) {
      const hero = mainHero(this.db);
      this.portraitUrl ??= this.sprites.portrait('hero', this.db.characters[this.db.player], 48).toDataURL();
      return {
        who, name: hero.name, level: this.progress.level, portrait: hero.face ? this.resolveFile(hero.face) : this.portraitUrl, art: this.heroArt(0), color: this.heroColor(0),
        hp: [this.stats.hp, this.stats.cfg.max.hp], mp: [this.stats.mp, this.stats.cfg.max.mp],
        xp: { have: this.progress.xp, next: this.progress.maxed ? null : this.progress.toNext },
        skillPoints: this.progress.points, down: this.stats.hp <= 0, locked, elements: this.heroAffinity(0).elements, ailment: this.ailmentPill(0), weather: this.weatherStates.get(mainHero(this.db).id) ?? null, tint: this.hpTint(0), good: this.goodPill(0), drying: this.drying.get(mainHero(this.db).id) ?? null, gender: mainHero(this.db).gender,
      };
    }
    const m = this.members()[who - 1], mx = this.allyNumbers(m.data, m.def).max, next = xpToNext(this.combatCfg, m.data.level);
    return {
      who, name: m.def.name, level: m.data.level, portrait: m.def.face ? this.resolveFile(m.def.face) : this.memberPortrait(m.def), art: this.heroArt(who), color: this.heroColor(who),
      hp: [m.data.down ? 0 : m.data.hp, mx.hp], mp: [m.data.mp, mx.mp],
      xp: { have: m.data.xp, next: next || null }, skillPoints: m.data.skillPoints ?? 0, down: !!m.data.down, elements: this.heroAffinity(who).elements, ailment: this.ailmentPill(who), weather: this.weatherStates.get(m.def.id) ?? null, tint: m.data.down ? null : this.hpTint(who), good: this.goodPill(who), drying: this.drying.get(m.def.id) ?? null, gender: m.def.gender,
    };
  }

  /** Someone's ailment as a pill (the hero's from the map first, else one left from a battle), or none. */
  /** Someone's ailment (the hero's from the map first, else one left from a battle), or undefined. */
  private ailmentOf(who: number): BattleAilment | undefined {
    return (who ? Object.keys(this.members()[who - 1]?.data.ailments ?? {})[0]
      : this.combat.heroStatus.list.find((e) => !e.id.startsWith('buff:'))?.id ?? Object.keys(this.heroAilments)[0]) as BattleAilment | undefined;
  }

  /** Someone's good state as a pill (name, colours, time left), or undefined. */
  private goodPill(who: number): { name: string; color: string; ink: string; left: string } | undefined {
    const g = this.goodOf(this.heroIdOf(who));
    return g ? { name: GOOD_INFO[g.kind].name, color: GOOD_INFO[g.kind].color, ink: GOOD_INFO[g.kind].ink, left: hoursLabel(g.until - this.state.clock) } : undefined;
  }

  /** Database → Climate → tint health bars: their ailment's colour, else null. */
  private hpTint(who: number): string | null {
    if (!this.bodyCfg.hpTint) return null;
    const a = this.ailmentOf(who);
    return a ? this.combatCfg.turnBased.statusPills[a]?.color ?? null : null;
  }

  private ailmentPill(who: number): PartyMemberView['ailment'] {
    const tb = this.combatCfg.turnBased;
    const a = this.ailmentOf(who);
    const p = a ? tb.statusPills[a] : undefined;
    return a && p ? { tag: tb.statusWords === 'full' ? p.word : p.tag, color: p.color, ink: p.ink, name: effectName(a), id: a } : undefined;
  }

  /** What can be done for someone from their card. */
  private partyActions(who: number): PartyAction[] {
    const a = this.abilitiesOf(who) ?? {};
    const spells = spellList(this.db).filter((sp) => (a.spells?.[sp.id] ?? 0) > 0);
    const adds = additionList(this.db).filter((d) => a.additions && d.id in a.additions);
    const cur = adds.find((d) => d.id === a.addition);
    const out: PartyAction[] = [
      { id: 'status', label: 'Status', detail: 'Who they are, what they wear, ailments' },
      { id: 'equip', label: 'Equipment', detail: 'Weapons, armor and accessories' },
      { id: 'skills', label: 'Skill Tree', detail: 'Spend skill points' },
    ];
    // (The Addition is equipped on the Equipment page now.)
    void adds; void cur;
    out.push({ id: 'magic', label: 'Magic', detail: spells.length ? `${spells.length} spell${spells.length === 1 ? '' : 's'}: healing can be cast from here` : 'No spells learned yet', disabled: !spells.length });
    return out;
  }

  private partyRun(who: number, id: string, back: () => void): void {
    const name = who ? this.members()[who - 1]?.def.name ?? '' : mainHero(this.db).name;
    const a = this.abilitiesOf(who);
    switch (id) {
      case 'status': this.charScreen.show(who, back); return;
      case 'equip': this.equipScreen.show(back, undefined, undefined, who); return;
      case 'skills': this.skillHero = who; this.skillScreen.show(back); return;
    }
    if (!a) { back(); return; }
    if (id === 'addition') {
      const adds = additionList(this.db).filter((d) => a.additions && d.id in a.additions);
      const items: MenuItem[] = [{ label: 'A plain attack', detail: a.addition ? undefined : 'Chosen', pick: () => { delete a.addition; this.menu.back(); } },
        ...adds.map((d) => {
          const uses = a.additions![d.id] ?? 0, rank = additionRank(d, uses), next = additionToNext(d, uses);
          return { label: `${d.name} · Rank ${rank}`, color: '#ffd38a', detail: `${a.addition === d.id ? 'Chosen · ' : ''}${d.strikes.map((x) => x.button === 'any' ? '★' : x.button ?? 'A').join(' ')}${next === null ? ' · Mastered' : ` · ${next} more to rank ${rank + 1}`}${d.description ? ` · ${d.description}` : ''}`,
            pick: () => { a.addition = d.id; this.audio.play('skill'); this.menu.back(); } };
        })];
      this.menu.push(`Addition: ${name}`, items, { onBack: back, note: 'The Addition performed with Attack in battle.' });
    } else if (id === 'magic') {
      const spells = spellList(this.db).filter((sp) => (a.spells?.[sp.id] ?? 0) > 0);
      const items: MenuItem[] = spells.map((sp) => {
        const r = Math.min(a.spells![sp.id], spellMaxRank(sp)), at = spellAtRank(sp, r);
        return { label: rankName(sp.name, r), color: sp.color, detail: `${sp.kind === 'heal' ? 'Heal: choose to cast' : 'Battle spell'} · ${at.mp} MP${sp.targets === 'all' ? ' · all' : ''}${sp.description ? ` · ${sp.description}` : ''}`,
          pick: sp.kind === 'heal' ? () => this.castHealMenu(who, sp.id) : undefined };
      });
      this.menu.push(`Magic: ${name}`, items, { onBack: back });
    } else back();
  }

  /** Out of battle: cast a healing spell (its highest rank known) on one of the party, or all of them. */
  private castHealMenu(who: number, spell: string, at = 0): void {
    const caster = this.partyBattler(who)?.battler, sp = caster?.spells.find((x) => x.id === spell);
    if (!caster || !sp) return;
    const rank = sp.ranks[sp.ranks.length - 1];
    const mpNow = () => (who ? this.members()[who - 1]?.data.mp ?? 0 : this.stats.mp);
    const vit = (k: number) => {
      if (!k) return { name: mainHero(this.db).name, hp: this.stats.hp, max: this.stats.cfg.max.hp, down: false };
      const m = this.members()[k - 1];
      return { name: m.def.name, hp: m.data.down ? 0 : m.data.hp, max: this.allyNumbers(m.data, m.def).max.hp, down: !!m.data.down };
    };
    const heal = (k: number, n: number): number => {
      if (!k) { const before = this.stats.hp; this.stats.change('hp', 'add', n); return this.stats.hp - before; }
      const m = this.members()[k - 1];
      if (!m || m.data.down) return 0;
      const max = this.allyNumbers(m.data, m.def).max.hp, before = m.data.hp;
      m.data.hp = Math.min(max, m.data.hp + n);
      return m.data.hp - before;
    };
    const spend = () => { if (who) { const m = this.members()[who - 1]; if (m) m.data.mp = Math.max(0, m.data.mp - rank.mp); } else this.stats.change('mp', 'add', -rank.mp); };
    const cast = (targets: number[]) => {
      if (mpNow() < rank.mp) { this.audio.play('menuBack'); this.menu.notice(`Not enough MP (${rank.mp} needed)`); return; }
      const n = Math.max(1, Math.round(rank.power));
      const got = targets.map((k) => heal(k, n));
      if (!got.some((g) => g > 0)) { this.audio.play('menuBack'); this.menu.notice('Nobody needs healing'); return; }
      spend();
      this.audio.play('ringOn');
      this.menu.notice(targets.length === 1 ? `${vit(targets[0]).name} +${got[0]} HP` : `Everyone healed (${rank.name})`);
      this.menu.back();
      // Stay on whoever was just healed (one cast may not be enough).
      this.castHealMenu(who, spell, targets.length === 1 ? all.indexOf(targets[0]) : 0);
    };
    const all = [0, ...this.members().map((_, k) => k + 1)];
    const items: MenuItem[] = sp.targets === 'all'
      ? [{ label: 'The whole party', detail: all.map((k) => { const v = vit(k); return `${v.name} ${Math.ceil(v.hp)}/${v.max}`; }).join(' · '), pick: () => cast(all) }]
      : all.map((k) => { const v = vit(k); return { label: v.name, detail: v.down ? 'Knocked out (healing can’t wake them)' : `${Math.ceil(v.hp)} / ${v.max} HP`, disabled: v.down, pick: () => cast([k]) }; });
    this.menu.push(`${rank.name}: ${rank.mp} MP (${Math.floor(mpNow())} left)`, items, { start: at });
  }

  /** The Inventory: the bag's tabs (all, by kind), then Equipment and Status. LB / RB move between them. */
  private openInventory(k: number, onClose: () => void = () => {}): void {
    this.bag.hide();
    const n = INVENTORY_TABS.length;
    k = ((k % n) + n) % n;
    this.invTab = k;
    const tabs = { ...this.tabGroup(INVENTORY_TABS.map((t) => t.label), k, (to) => this.openInventory(to, onClose)), ...(this.bag.compact ? { icons: INVENTORY_TABS.map((t) => Game.POCKET_ICONS[t.id] ?? '') } : {}) };
    this.bag.show(onClose, tabs, INVENTORY_TABS[k].id);
  }


  /** Show a tutorial the first time (unless pop-ups are off); either way it goes in the Journal (Update 113). */
  private showTutorial(id: string): void {
    const t = (this.db.tutorials ?? []).find((x) => x.id === id);
    if (!t || this.state.record(`tut:${id}`) > 0) return;
    this.state.tally('tutSeq');
    this.state.tally(`tut:${id}`, this.state.record('tutSeq'));
    this.log.add(`Tutorial: ${t.title} (Journal → Tutorials)`, 'info');
    if (this.settings.tutorials !== false) this.tutorialPop.show(t.title, t.text);
  }
  /** Journal → Tutorials: the ones reached, newest first. */
  /* ---------------------------------------------------------------- relationships (Update 124) */

  /** A hero by id or name ('' or 'hero': the hero you play). */
  private heroByIdOrName(s: string): HeroDef | undefined {
    const k = s.trim().toLowerCase();
    if (!k) return mainHero(this.db);
    return (this.db.heroes ?? []).find((x) => x.id.toLowerCase() === k || x.name.trim().toLowerCase() === k);
  }
  /** Item reactions (Update 127): `target` (a hero id) was given `item` by `giver` (a hero id): matching roleplay answers move their view. */
  itemReaction(item: ItemDef | undefined, target: string, giver: string): void {
    if (!item?.reactions?.length || target === giver) return;
    const hero = this.heroByIdOrName(target);
    for (const r of item.reactions) if (rpMatch(rpValue(this.db, hero, r.field), r.value)) this.relChange(target, giver, r.points);
  }

  /** A hero id ('' the hero you play) as an id. */
  private relId(id: string): string { return id || mainHero(this.db).id; }
  /** How `a` rates `b` (0 … 100). */
  relGet(a: string, b: string): number {
    a = this.relId(a); b = this.relId(b);
    return this.state.rel.get(relKey(a, b)) ?? relStart(this.db, a, b);
  }
  /** Points moved per pair this battle (capped). */
  private readonly relBattle = new Map<string, number>();
  /** Move `a`'s rating of `b` by `delta` (the hero you play has no ratings of their own); a notice when the label changes. */
  relChange(a: string, b: string, delta: number, battle = false): void {
    a = this.relId(a); b = this.relId(b);
    if (!delta || a === b || a === mainHero(this.db).id || this.db.relations?.off) return;
    const k = relKey(a, b);
    if (battle) {
      const used = this.relBattle.get(k) ?? 0, room = REL_BATTLE_CAP - Math.abs(used);
      if (room <= 0) return;
      delta = Math.sign(delta) * Math.min(Math.abs(delta), room);
      this.relBattle.set(k, used + delta);
    }
    const was = this.relGet(a, b), now = relClamp(was + delta);
    if (now === was) return;
    this.state.rel.set(k, now);
    const love = relLove(this.db, a, b), l0 = relLabel(was, love), l1 = relLabel(now, love);
    if (l0.name !== l1.name) {
      const name = (id: string) => (id === mainHero(this.db).id ? mainHero(this.db).name : this.db.heroes?.find((x) => x.id === id)?.name ?? id);
      const line = `${name(a)}’s view of ${name(b)}: ${l1.name}`;
      this.log.add(line, 'info');
      if (!this.battle.active) this.menu.notice(line);
    }
  }
  /** A battle event for relationships: `rater` (party index: 0 the hero, 1… members) warms to `rated`. */
  private bond(kind: RelationKind, rater: number, rated: number): void {
    const id = (w: number) => (w === 0 ? mainHero(this.db).id : this.members()[w - 1]?.def.id);
    const a = id(rater), b = id(rated);
    if (a && b) this.relChange(a, b, relAmount(this.db, kind), true);
  }

  private tutorialsHtml(): string {
    const seen = (this.db.tutorials ?? []).filter((t) => this.state.record(`tut:${t.id}`) > 0).sort((a, b) => this.state.record(`tut:${b.id}`) - this.state.record(`tut:${a.id}`));
    const e = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    return seen.length ? `<div class="tut-list">${seen.map((t) => `<section class="tut-entry"><h3>${e(t.title)}</h3><p>${e(t.text).replace(/\n/g, '<br>')}</p></section>`).join('')}</div>`
      : '<p class="tut-none">No tutorials yet. They appear here as you come across them.</p>';
  }

  /** The Journal's tabs as the player sees them: the Database's order, minus hidden ones (events may change that). */
  private journalList(): [JournalTabId, string][] {
    const cfg = this.db.menus?.journal, order = cfg?.order ?? [];
    const sorted = [...JOURNAL_TABS].sort((a, b) => { const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    // Achievements (Update 141: a Journal tab) only when the game has some.
    const list = sorted.filter(([id]) => (id !== 'achievements' || (this.db.achievements?.length ?? 0) > 0) && (this.state.journalTabs.get(id) ?? !cfg?.hidden?.includes(id)));
    return list.length ? list : [JOURNAL_TABS[0]];
  }

  /** The Journal: quests, the adventure log and records, as tabs. */
  private openJournal(k: number, onClose: () => void = () => {}): void {
    this.questScreen.hide(); this.logScreen.hide(); this.recordsScreen.hide(); this.bestiaryScreen.hide(); this.achScreen.hide();
    // The tabs in the Database's order, without the hidden ones (events can show or hide them: Update 130).
    const list = this.journalList(), m = this.db.menus, n = list.length;
    k = ((k % n) + n) % n;
    this.journalTab = k;
    const tabs = { ...this.tabGroup(list.map((t) => t[1]), k, (to) => this.openJournal(to, onClose)), icons: list.map((t) => JOURNAL_ICONS[t[0]]) };
    const title = pauseLabel(m, 'journal');
    const id = list[k][0];
    if (id === 'quests') this.questScreen.show(title, this.quests, { item: (i) => this.items.get(i)?.name ?? i }, onClose, tabs);
    else if (id === 'log') this.logScreen.show(title, this.log.history, onClose, tabs);
    else if (id === 'bestiary') this.bestiaryScreen.show(title, this.bestiary(), onClose, tabs);
    else if (id === 'types') this.recordsScreen.show(title, { html: typeChartHtml(this.combatCfg.essence) }, onClose, tabs);
    else if (id === 'tutorials') this.recordsScreen.show(title, { html: this.tutorialsHtml() }, onClose, tabs);
    else if (id === 'achievements') this.achScreen.show(onClose, tabs);
    else this.recordsScreen.show(title, this.records(), onClose, tabs);
  }

  private tabGroup(labels: string[], index: number, open: (k: number) => void): TabGroup {
    const go = (step: number, to?: number) => { uiSound('menuMove'); open(to ?? index + step); };
    // Inside the pause menu: these are inner tabs (LT / RT), LB / RB being the menu's own.
    if (this.pauseShell.isOpen) return this.pauseShell.group({ labels, index, keys: tabSwap.on ? [this.input.label('tabPrev'), this.input.label('tabNext')] : [this.input.label('subPrev'), this.input.label('subNext')], go });
    return { labels, index, keys: [this.input.label('tabPrev'), this.input.label('tabNext')], go };
  }

  /** The Journal's Bestiary: every enemy (but those left out), in the Database's order. */
  private bestiary(): BestiaryEntry[] {
    const B = this.combatCfg.bestiary, r = (k: string) => this.state.record(k);
    const mapTitle = (n: string) => (n === this.mapName ? this.mapData?.name : this.worldTitles.get(n)) || n;
    // Each advanced form right after the one it comes from (the rest in the Database's order).
    const all = (this.db.enemies ?? []).filter((d) => !d.noBestiary), order: EnemyDef[] = [];
    const add = (d: EnemyDef, depth = 0) => {
      if (order.includes(d) || depth > 4) return;
      order.push(d);
      const nx = d.advance ? all.find((y) => y.id === d.advance!.into) : undefined;
      if (nx) add(nx, depth + 1);
    };
    for (const d of all) if (!all.some((y) => y !== d && y.advance?.into === d.id)) add(d);
    for (const d of all) add(d);
    return order.map((d) => {
      const won = r(`kill:${d.id}`), seen = won > 0 || r(`seen:${d.id}`) > 0;
      const places = [...this.state.records].filter(([k, v]) => v > 0 && k.startsWith(`seenAt:${d.id}:`)).map(([k]) => mapTitle(k.slice(`seenAt:${d.id}:`.length)));
      const v = Math.max(0, d.hpVariance ?? 0), hp = v ? `${Math.max(1, Math.round(d.hp * (1 - v / 100)))}–${Math.round(d.hp * (1 + v / 100))}` : String(d.hp);
      const chip = (e: Elem) => ({ name: ELEMENT_NAMES[e], icon: elementIconUrl(e) });
      const groups = { weak: [] as Elem[], resist: [] as Elem[], immune: [] as Elem[], absorb: [] as Elem[] };
      for (const e of ELEMENT_LIST) {
        const x = elementResult(e, d);
        if (x.kind === 'absorb') groups.absorb.push(e); else if (x.kind === 'immune') groups.immune.push(e);
        else if (x.mult > 1) groups.weak.push(e); else if (x.mult < 1) groups.resist.push(e);
      }
      const gate = <T,>(n: number, make: () => T): T | { need: number } => (won >= n ? make() : { need: n - won });
      // Its forms: back to the base (whoever advances into it), then on through each advanced form.
      const all = this.db.enemies ?? [], chain: EnemyDef[] = [d];
      for (let k = 0, x = d; k < 4; k++) { const prev = all.find((y) => y.advance?.into === x.id); if (!prev || chain.includes(prev)) break; chain.unshift(prev); x = prev; }
      for (let k = 0, x = d; k < 4 && x.advance; k++) { const nx = all.find((y) => y.id === x.advance!.into); if (!nx || chain.includes(nx)) break; chain.push(nx); x = nx; }
      const met = (y: EnemyDef) => r(`kill:${y.id}`) > 0 || r(`seen:${y.id}`) > 0;
      const forms = chain.length > 1 ? chain.map((y, k) => ({ name: y.name, picture: met(y) ? this.enemyPicture(y).icon : null, level: k ? chain[k - 1].advance?.level : undefined, current: y === d })) : undefined;
      return {
        id: d.id, name: d.name, seen, defeated: won, picture: this.enemyPicture(d).icon, description: d.description, places, forms,
        stats: gate(B.stats, () => ({ hp, attack: d.damage, defence: d.defense ?? 0, magicDefence: d.magicDefense ?? d.defense ?? 0, exp: d.xp, gold: d.gold ? (d.gold[0] === d.gold[1] ? `${d.gold[0]}` : `${d.gold[0]}–${d.gold[1]}`) : '0', boss: d.boss })),
        elements: gate(B.elements, () => ({ weak: groups.weak.map(chip), resist: groups.resist.map(chip), immune: groups.immune.map(chip), absorb: groups.absorb.map(chip), attack: ELEMENT_NAMES[enemyElement(d) ?? 'neutral'] })),
        drops: gate(B.drops, () => (d.drops ?? []).filter((x) => this.items.has(x.item)).map((x) => ({ name: this.items.get(x.item)!.name, icon: this.itemIcon(x.item), chance: x.chance }))),
      };
    });
  }

  /** The Journal's Records: the tallies, in sections. */
  private records(): RecordSection[] {
    const r = (k: string) => this.state.record(k), num = (v: number) => Math.floor(v).toLocaleString();
    const row = (label: string, k: string, unit = ''): [string, string] | null => (r(k) > 0 ? [label, num(r(k)) + unit] : null);
    const keep = (rows: ([string, string] | null)[]) => rows.filter((x): x is [string, string] => !!x);
    const secs = Math.floor(this.playTime), hrs = Math.floor(secs / 3600), mins = Math.floor((secs % 3600) / 60);
    const days = Math.floor(this.state.clock / 24);
    const done = this.quests.all.filter((q) => this.quests.status(q.id) === 'done').length;
    const kinds = [...this.state.records].filter(([k, v]) => k.startsWith('kill:') && v > 0)
      .map(([k, v]) => [this.db.enemies?.find((e) => e.id === k.slice(5))?.name ?? k.slice(5), v] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return [
      { title: 'Journey', rows: keep([
        ['Time played', `${hrs}:${String(mins).padStart(2, '0')}`],
        ['Days passed', num(days)],
        ['Level', String(this.progress.level)],
        row('Steps taken', 'steps'),
        r('swum') > 0 ? ['Distance swum', `${num(r('swum'))} tiles`] : null,
        row('Jumps', 'jumps'),
        ['Quests completed', num(done)],
        row('Times fallen', 'deaths'),
        row('Nights rested', 'rests'),
      ]) },
      { title: 'Battle', rows: keep([
        ['Enemies defeated', num(r('kills'))],
        row('Strongest hit', 'bestHit'),
        row('Critical hits', 'crits'),
        row('Sneak attacks', 'sneakAttacks'),
        row('Damage dealt', 'damageDealt'),
        row('Damage taken', 'damageTaken'),
        row('Spells cast', 'spells'),
        row('Arrows shot', 'arrows'),
      ]) },
      { title: 'Defeated', rows: kinds.map(([name, v]) => [name, num(v)] as [string, string]), empty: 'No enemies defeated yet.' },
      { title: 'Out and about', rows: keep([
        row('Trees chopped', 'trees'),
        row('Fish caught', 'fish'),
        row('Biggest fish', 'bestFish', ' cm'),
        row('Vines and brush cut', 'cut'),
        row('Items picked up', 'itemsFound'),
        row('Gold found', 'goldFound', ' G'),
        row('Items used', 'itemsUsed'),
        row('Fires fed', 'firesFed'),
      ]), empty: 'Nothing yet.' },
    ];
  }

  /* ------------------------------------------------------------------ turn-based battles */

  /**
   * A fight broke out on the map (turn-based mode): a battle with that enemy and its friends nearby. True when it's
   * taken over (so the hit on the map doesn't happen); just after a battle, hits are ignored for a moment.
   */
  private encounter(e: Enemy, _how: Opening): boolean {
    // Update 132: touching a foe on the map (or it touching the hero) is always a normal start, no ambush.
    const opening: Opening = 'normal';
    if (this.battle.active || this.battlePending || this.battleGrace > 0 || this.dying || this.onTitle || this.transfer || this.interpreter.running) return true;
    const tb = this.combatCfg.turnBased;
    const near = this.combat.enemies
      .filter((o) => o !== e && !o.dead && Math.hypot(o.x - e.x, o.z - e.z) <= tb.joinRadius && (o.alert || Math.hypot(o.x - e.x, o.z - e.z) < 3))
      .sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z));
    // Single mode, by the map's default: a wild encounter is just the one bumped into; one at a time, it comes out first
    // and its friends follow; all at once, a group fight.
    const single = tb.mode === 'single', pick = this.pickFor();
    const group = single && pick === 'random' ? [e] : [e, ...near].slice(0, single && pick === 'oneByOne' ? SINGLE_MAX : Math.min(MAX_FOES, tb.maxEnemies));
    this.startBattle(group.map((en) => ({ def: en.def, hp: en.hp, enemy: en })), opening, single ? { pick: pick === 'random' ? 'full' : pick } : {});
    return true;
  }

  /** Random encounters (the map's table, turn-based mode): count the tiles walked, and now and then a battle. */
  private updateEncounters(): void {
    const m = this.mapData, t = m?.encounters, p = this.player.position;
    const hasZones = (!!m?.zoneGrid || !!m?.volumes?.some((v) => v.kind === 'encounter')) && !!m.zones && Object.values(m.zones).some((z) => z.troops.length);
    if ((!t?.enemies.length && !hasZones) || this.onTitle || this.transfer || this.dying || this.battle.active || this.battlePending || this.interpreter.running) { this.encounterFrom = null; return; }
    const from = this.encounterFrom;
    this.encounterFrom = { x: p.x, z: p.z };
    if (!from || this.motion.swimming || this.motion.airborne) return;
    const d = Math.hypot(p.x - from.x, p.z - from.z);
    if (d <= 0 || d > 2) return;
    // A painted encounter zone under the hero, if any; otherwise the map's own random encounters (if it has them).
    // Safe zones: never a random battle.
    if (safeAt(m, p.x, p.z)) return;
    // Update 156: an encounter volume on a 3D map counts as its zone.
    const letter = hasZones ? this.volumeZone() ?? (m.zoneGrid ? zoneAt(m, p.x, p.z) : null) : null, zone = letter ? m.zones?.[letter] : undefined;
    if (!zone?.troops.length) {
      if (!t?.enemies.length) return;
      // Only on the chosen ground (tall grass, say).
      if (t.terrain) {
        const row = m.terrain[Math.floor(p.z)], ch = row?.[Math.floor(p.x)];
        if (!ch || !t.terrain.includes(ch)) return;
      }
    }
    if (this.battleGrace > 0) return;
    const steps = Math.max(4, (zone ? zone.steps : t?.steps) ?? 30);
    if (!this.encounterAt) this.encounterAt = steps * (0.5 + Math.random());
    this.encounterWalked += d;
    if (this.encounterWalked < this.encounterAt) return;
    this.encounterWalked = 0;
    this.encounterAt = steps * (0.5 + Math.random());
    const defs = new Map((this.db.enemies ?? []).map((x) => [x.id, x]));
    const opening: Opening = Math.random() < 0.08 ? 'ambush' : Math.random() < 0.08 ? 'preemptive' : 'normal';
    if (zone?.troops.length) {
      // A troop for this zone, among those allowed now (day / night, the real-world day, a switch).
      const pick = pickTroop(zone, { night: this.time.night > 0.5, weekday: new Date().getDay(), switchOn: (id) => this.state.getSwitch(id) });
      const troop = pick ? (this.db.troops ?? []).find((x) => x.id === pick.troop) : undefined;
      if (!troop) return;
      const list: { def: EnemyDef; hp: number; enemy: null }[] = [];
      // Single mode takes up to eight from a troop (one at a time, or one picked at random).
      const tp = this.pickFor(troop.pick), cap = this.combatCfg.turnBased.mode === 'single' && tp !== 'full' ? SINGLE_MAX : MAX_FOES;
      for (const mem of troop.members) {
        const def = defs.get(mem.enemy);
        if (!def) continue;
        const lo = Math.max(0, Math.round(mem.min ?? 1)), hi = Math.max(lo, Math.round(mem.max ?? mem.min ?? 1));
        const n = lo + Math.floor(Math.random() * (hi - lo + 1));
        for (let k = 0; k < n && list.length < cap; k++) { const at = this.levelled(def, pick?.levels ?? zone.levels); list.push({ def: at, hp: at.hp, enemy: null }); }
      }
      if (list.length) this.startBattle(list, opening, { canRun: !troop.noRun, music: troop.music, stage: zone.battleMap || undefined, pick: tp });
      return;
    }
    const table = t!.enemies.filter((x) => defs.has(x.enemy));
    if (!table.length) return;
    const lo = Math.max(1, Math.min(MAX_FOES, Math.round(t!.min ?? 1))), hi = Math.max(lo, Math.min(MAX_FOES, Math.round(t!.max ?? 3)));
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    const list: { def: EnemyDef; hp: number; enemy: null }[] = [];
    for (let k = 0; k < n; k++) { const pick = weighted(table)!, def = this.levelled(defs.get(pick.enemy)!, t!.levels); list.push({ def, hp: def.hp, enemy: null }); }
    this.startBattle(list, opening, { pick: this.pickFor() });
  }

  /** Single mode: how foes come out: the troop's or event's own choice, else this map's, else Database → Combat's. */
  private pickFor(own?: EncounterPick): EncounterPick {
    return own ?? this.mapData?.encounterPick ?? this.combatCfg.turnBased.singlePick;
  }

  /** A hero's aim: Dexterity's accuracy times their weapon's (Database → Items → Accuracy), or never missing. */
  private aimOf(w: ItemDef | undefined, dex: number): { accuracy: number; sure?: boolean } {
    const acc = accuracyOf(dex) * Math.max(10, w?.weapon?.accuracy ?? 100) / 100;
    return w?.weapon?.sure ? { accuracy: acc, sure: true } : { accuracy: acc };
  }

  /** The enemy as it comes out on the map: a level from the spawn's range, or near the party's (dynamic levels; not bosses). */
  private levelled(def: EnemyDef, range?: LevelRange): EnemyDef {
    const dyn = this.state.enemyLevels;
    const lv = dyn && !def.boss ? partyLevel(this.partyAverageLevel(), dyn.spread) : rollLevel(def, range);
    // High enough for its advanced form (Database → Enemies → Advanced form): that comes out instead, at this level.
    let d = def;
    for (let k = 0; k < 4 && d.advance && lv >= d.advance.level; k++) { const n = this.db.enemies?.find((x) => x.id === d.advance!.into); if (!n || n === d) break; d = n; }
    return atLevel(d, lv, this.combatCfg.enemyGrowth);
  }

  /** The active party's average level. */
  private partyAverageLevel(): number {
    const ls = [this.progress.level, ...this.members().map((m) => m.data.level)];
    return ls.reduce((a, b) => a + b, 0) / ls.length;
  }

  private readonly battlePictures = new Map<string, { picture: HTMLCanvasElement; icon: string; flip: boolean }>();

  /** An enemy's battle picture, facing the party (right), and a small copy for the turn order. */
  private enemyPicture(def: EnemyDef): { picture: HTMLCanvasElement; icon: string; flip: boolean } {
    const key = `${def.id}|${def.look.character ?? ''}|${def.look.monster ?? ''}|${def.look.image ?? ''}|${JSON.stringify(def.tint ?? '')}`;
    const hit = this.battlePictures.get(key);
    if (hit) return hit;
    let picture: HTMLCanvasElement, flip = false;
    const img = def.look.image ? this.sprites.flatImage(def.look.image) : null;
    if (img) {
      const h = Math.max(0.25, def.look.flat?.height ?? 1);
      picture = SpriteLibrary.trimmed(img, 0, 0, img.width, img.height, Math.min(4, (110 * h / 1.5) / img.height));
      flip = def.look.flat?.faces === 'left';
    } else if (def.look.character && this.db.characters[def.look.character]) {
      picture = this.sprites.standingFrame(`enemy:${def.look.character}`, this.db.characters[def.look.character], 'right', 0);
    } else {
      const sheet = (MONSTERS[def.look.monster ?? 'slime'] ?? MONSTERS.slime).draw(), fw = Math.floor(sheet.width / 3), fh = Math.floor(sheet.height / 4);
      picture = SpriteLibrary.trimmed(sheet, fw, fh * 2, fw, fh, Math.max(1, Math.round(64 / fh)));
    }
    if (def.tint) picture = tintCanvas(picture, def.tint);
    const out = { picture, icon: picture.toDataURL(), flip };
    this.battlePictures.set(key, out);
    return out;
  }

  /** A hero's learned spells for a battle, every rank they know, with their Magic (`power` ×) and thrift (magic ×). */
  private battleSpells(a: AbilityData, power: number, thrift: number): BattleSpell[] {
    const out: BattleSpell[] = [];
    for (const s of spellList(this.db)) {
      const known = Math.min(a.spells?.[s.id] ?? 0, spellMaxRank(s));
      if (known < 1) continue;
      const ranks = Array.from({ length: known }, (_, i) => {
        const at = spellAtRank(s, i + 1);
        return { rank: i + 1, name: rankName(s.name, i + 1), power: at.power * power, mp: Math.max(0, Math.round(at.mp * thrift)), charge: at.charge };
      });
      out.push({ id: s.id, name: s.name, icon: s.icon, iconTint: s.iconTint, description: s.description, sound: s.sound, chant: s.chant, kind: s.kind, element: s.element ?? 'neutral', color: s.color, targets: s.targets ?? 'one', inflicts: s.inflicts, ranks, buffs: s.buffs, supportTarget: s.supportTarget, weather: s.weather, weatherTurns: s.weatherTurns, accuracy: s.accuracy, sure: s.sure, sequence: s.sequence, seqTime: s.seqTime, seqBonus: s.seqBonus });
    }
    return out;
  }

  /** A hero's Additions for a battle: strikes, rank and what it adds. */
  private battleAdditions(a: AbilityData): BattleAddition[] {
    const out: BattleAddition[] = [];
    for (const d of additionList(this.db)) {
      if (!a.additions || !(d.id in a.additions)) continue;
      const uses = a.additions[d.id] ?? 0, rank = additionRank(d, uses), bonus = additionBonus(d, rank);
      out.push({
        id: d.id, name: d.name, sound: d.sound, rank, maxRank: d.maxRank ?? 5, toNext: additionToNext(d, uses), damage: bonus.damage,
        strikes: d.strikes.map((x) => ({ power: x.power, button: x.button ?? 'A', time: Math.max(0.25, x.time ?? 0.7), window: Math.max(0.06, (x.window ?? 0.24) * bonus.window) })),
      });
    }
    return out;
  }

  /** The hero's ailments from the last battle, lasting into the next (members keep theirs on their data). */
  private heroAilments: Record<string, number> = {};

  /** A battle's status with ailments left from the last battle on it. */
  private lingering(st: BattleStatus, list?: Record<string, number>): BattleStatus {
    for (const [a, t] of Object.entries(list ?? {})) if (t > 0) st.turns.set(a as BattleAilment, t);
    return st;
  }

  /** Cure lingering battle ailments (an item's list; 'all' everything but Zombie) for one hero (0: the hero) or everyone. */
  private clearLingering(cures: readonly string[], who?: number): string[] {
    const all = cures.includes('all'), out: string[] = [];
    const strip = (rec: Record<string, number> | undefined) => {
      if (!rec) return;
      for (const a of Object.keys(rec)) if (a === 'zombie' ? cures.includes('zombie') : all || cures.includes(a) || (a === 'frozen' && cures.includes('chill'))) { delete rec[a]; out.push(a); }
    };
    if (who === undefined || who === 0) strip(this.heroAilments);
    this.members().forEach(({ data: m }, k) => { if (who === undefined || who === k + 1) { strip(m.ailments); if (m.ailments && !Object.keys(m.ailments).length) delete m.ailments; } });
    return out;
  }

  /** As a battle ends: each hero's ailments that last (Database → Combat → Ailments) are kept for the next one. */
  private keepAilments(list: { who: number; turns: [BattleAilment, number][] }[]): void {
    const pills = this.combatCfg.turnBased.statusPills, onMap = new Set(this.combat.heroStatus.list.map((e) => e.id));
    for (const { who, turns } of list) {
      const rec: Record<string, number> = {};
      // One at a time (Update 105), and none for someone knocked out (falling to 0 cures it).
      const down = who === 0 ? this.stats.hp <= 0 : !!this.members()[who - 1]?.data.down;
      for (const [a, t] of turns) if (!down && !Object.keys(rec).length && pills[a]?.stays && t > 0 && !(who === 0 && onMap.has(a))) rec[a] = Number.isFinite(t) ? t : 99;
      if (who === 0) this.heroAilments = rec;
      else { const m = this.members()[who - 1]?.data; if (m) { if (Object.keys(rec).length) m.ailments = rec; else delete m.ailments; } }
    }
  }

  /** The hero's ailments carried into a battle from the map (seconds become turns; buffs stay on the map). */
  private heroBattleStatus(): BattleStatus {
    const resists = [...(mainHero(this.db).resists ?? []), ...this.wornGear().flatMap((g) => g?.protects ?? [])];
    const st = new BattleStatus(resists);
    for (const e of this.combat.heroStatus.list) {
      if (e.id.startsWith('buff:')) continue;
      const a = e.id as BattleAilment;
      st.turns.set(a, turnsFromSeconds(a, e.left));
      if (a === 'chill') st.chillStacks = e.stacks ?? 1;
    }
    // And those left from the last battle.
    for (const [a, t] of Object.entries(this.heroAilments)) if (!st.has(a as BattleAilment)) st.turns.set(a as BattleAilment, t);
    return st;
  }

  // ---------------------------------------------------------------- forms (Database → Heroes → Forms)
  /** Each hero's own look and face, before any later form (kept the first time forms are put on). */
  private formBase: Map<string, { look?: string; face?: string }> | null = null;

  /** Put every hero in their current form: their look (the player's, for the hero) and face art. */
  private applyForms(): void {
    const main = mainHero(this.db);
    this.formBase ??= new Map((this.db.heroes ?? []).map((h) => [h.id, { look: h === main ? this.db.player : h.look, face: h.face }]));
    let changed = false;
    for (const h of this.db.heroes ?? []) {
      const b = this.formBase.get(h.id);
      if (!b) continue;
      let look = b.look, face = b.face;
      const f = this.state.forms.get(h.id) ?? 0;
      for (let k = 0; k < f; k++) { const fm = h.forms?.[k]; if (fm?.look && this.db.characters[fm.look]) look = fm.look; if (fm?.face) face = fm.face; }
      if (h === main) { if (look && this.db.player !== look) { this.db.player = look; changed = true; } }
      else if (h.look !== look) { h.look = look; changed = true; }
      if (h.face !== face) { if (face) h.face = face; else delete h.face; changed = true; }
    }
    if (changed) this.refreshLooks();
  }

  /** Pictures drawn from the heroes' looks are drawn again (a form changed). */
  private refreshLooks(): void {
    this.portraitUrl = null;
    this.memberPortraits.clear();
    this.bigArt.clear();
    this.sprites.clearPictures();
    this.faceShown = false;
    if (!this.player) return;
    this.leaderKey = 'changed';
    this.spawnAllies();
  }

  /** The form a hero's level has reached (0 base, 1 mid, 2 final). */
  private formDue(def: HeroDef, level: number): number {
    let f = 0;
    (def.forms ?? []).slice(0, 2).forEach((fm, k) => { if (fm && fm.level > 0 && level >= fm.level && (fm.look || fm.face)) f = k + 1; });
    return f;
  }

  /** The next hero due to transform: shown, then the rest one after another. */
  private nextEvolution(after?: () => void): boolean {
    if (this.evolve.isOpen) return true;
    const list = [{ def: mainHero(this.db), level: this.progress.level }, ...this.members().map((m) => ({ def: m.def, level: m.data.level }))];
    for (const { def, level } of list) {
      const now = this.state.forms.get(def.id) ?? 0, due = this.formDue(def, level);
      if (due <= now || !this.db.heroes?.includes(def)) continue;
      const main = def === mainHero(this.db);
      const beforeLook = this.db.characters[(main ? this.db.player : def.look) ?? ''] ?? this.db.characters[this.db.player];
      const before = this.sprites.standingFrame(`evo:${main ? this.db.player : def.look}`, beforeLook, 'down', 0);
      this.state.forms.set(def.id, due);
      this.applyForms();
      const afterLook = this.db.characters[(main ? this.db.player : def.look) ?? ''] ?? beforeLook;
      const shown = this.sprites.standingFrame(`evo:${main ? this.db.player : def.look}`, afterLook, 'down', 0);
      this.log.add(`${def.name} transformed into ${due === 2 ? 'their final form' : 'a new form'}!`, 'level');
      this.state.tally('transformed');
      // One after another (two heroes reaching a form in the same battle), then `after`.
      this.evolve.show(def.name, due === 2 ? 'their final form' : 'a new form', before, shown, () => { if (!this.nextEvolution(after)) after?.(); }, (n) => this.audio.play(n));
      return true;
    }
    return false;
  }

  /** What a hero's Element slots add up to (0: the hero, 1…: party members). */
  heroAffinity(who: number): Affinity {
    const ids = who ? this.members()[who - 1]?.data.elements ?? [] : this.inventory.elements;
    return affinity([0, 1].map((k) => (ids[k] ? this.items.get(ids[k]!) : undefined)), this.combatCfg.essence);
  }

  /** A hero's elements in battle: their element stones' (with their weaknesses), else the Database's; gear's wards. */
  private heroDefence(who: number): import('./elements').ElementalDefence {
    const m = who ? this.members()[who - 1] : undefined, def = m ? m.def : mainHero(this.db), aff = this.heroAffinity(who);
    return { elements: aff.elements.length ? aff.elements : def.elements, immune: def.immune, absorb: def.absorb, weak: aff.weak,
      halve: this.wornGear(m ? m.data.equip : undefined).flatMap((g) => g?.wards ?? []) };
  }

  /** The hero's or a party member's numbers for a battle: attack, spells, defences, agility. */
  private partyBattler(who: number): { battler: Battler; view: FighterView; fig: { look: CharacterDef | undefined; equip: Partial<Record<EquipSlot, string>>; bow: boolean; lift?: number } } | null {
    const pct = (sk: Skills, k: Parameters<Skills['get']>[0]) => 1 + sk.get(k) / 100;
    if (who === 0) {
      const t = this.heroTotals(), sk = this.skills, gear = this.inventory.equip, cfg = this.combatCfg, hero = mainHero(this.db);
      const w = gear.weapon ? this.items.get(gear.weapon) : undefined, cls = w?.weapon && w.weapon.class !== 'bow' ? w.weapon.class : 'unarmed';
      const classPct = cls === 'unarmed' ? 1 : pct(sk, `${cls}Damage` as 'lightDamage');
      // Untrained with medium or heavy weapons (Arms Training, Heavy Arms): weaker blows.
      const melee = (cls === 'unarmed' ? cfg.unarmedDamage : w!.weapon!.damage) * cfg.classes[cls].damage * powerMultiplier(t.attrs.str) * pct(sk, 'meleeDamage') * classPct * this.weaponSkill(sk, this.progress.abilities, w);
      const bowDef = gear.ranged ? this.items.get(gear.ranged) : undefined, ammo = this.inventory.arrow() ? this.items.get(this.inventory.arrow()!) : undefined;
      const bow = bowDef?.weapon ? (bowDef.weapon.damage + (ammo?.ammo?.damage ?? 0)) * powerMultiplier(t.attrs.dex) * pct(sk, 'bowDamage') * (gearSkill(this.db, this.progress.abilities, bowDef, sk) === 'untrained' ? UNTRAINED_DAMAGE : 1) : 0;
      const useBow = !w && bow > melee;
      const a = this.progress.abilities;
      const spells = this.battleSpells(a, powerMultiplier(t.attrs.mag) * pct(sk, 'spellDamage'), this.spellThrift);
      const look = this.lookFor(0), aff0 = this.heroAffinity(0);
      this.portraitUrl ??= this.sprites.portrait('hero', look, 48).toDataURL();
      return {
        battler: {
          key: 'p0', side: 'party', name: hero.name, hp: this.stats.hp, maxHp: this.stats.cfg.max.hp, mp: this.stats.mp, maxMp: this.stats.cfg.max.mp,
          attack: useBow ? bow : melee, attackElement: aff0.primary ?? (useBow ? bowDef?.element : w?.element) ?? 'neutral', attackMagic: false, affinity: aff0,
          armour: t.armour, magicArmour: t.magicArmour, agility: t.attrs.agi, baseAgility: t.attrs.agi, crit: t.crit,
          ...this.aimOf(useBow ? bowDef : w, t.attrs.dex), evasion: evasionOf(t.attrs.agi), spellEvasion: evasionOf(t.attrs.mdf), resist: ailmentResist(t.attrs.end), ranged: useBow, guardBonus: sk.get('guardHeal'),
          defence: this.heroDefence(0), spells, ct: 0, guarding: false,
          status: this.heroBattleStatus(), inflicts: (useBow ? bowDef?.inflicts : w?.inflicts),
          ...this.attackStyle(0, a),
        },
        view: { key: 'p0', side: 'party', name: hero.name, picture: this.sprites.standingFrame('battle:hero', look, 'left', 0), icon: this.portraitUrl, color: this.heroColor(0), face: hero.face ? this.resolveFile(hero.face) : undefined,
          level: this.progress.level, xp: { have: this.progress.xp, next: this.progress.maxed ? 0 : this.progress.toNext }, elements: aff0.elements.length ? aff0.elements : undefined, back: this.combatCfg.turnBased.layout === 'pocket' ? this.sprites.standingFrame('battle:hero', look, 'up', 0) : undefined },
        fig: { look, equip: gear, bow: useBow, lift: mainHero(this.db).battleOffset },
      };
    }
    const m = this.members()[who - 1];
    if (!m) return null;
    const n = this.allyNumbers(m.data, m.def), t = heroTotals(m.data.stats, this.statGear(m.data.equip, m.data.abilities, this.memberSkills(m.data)), (k) => this.memberSkills(m.data).get(k) + this.goodBonus(m.data.id, k));
    const style = fightingStyle(m.def, m.data, n), msk = this.memberSkills(m.data), ab = (m.data.abilities ??= {});
    const spells = this.battleSpells(ab, powerMultiplier(t.attrs.mag) * (1 + msk.get('spellDamage') / 100), 1 - Math.min(75, msk.get('spellCost')) / 100);
    // Healers who know no healing spell keep their own Heal.
    if ((style === 'healer' || m.def.ai === 'healer') && !spells.some((x) => x.kind === 'heal'))
      spells.unshift({ id: 'heal', name: 'Heal', kind: 'heal', element: 'neutral', color: '#9dffb0', targets: 'one', ranks: [{ rank: 1, name: 'Heal', power: n.heal, mp: HEAL_MP, charge: 0 }] });
    const useBow = !m.data.equip.weapon && n.bow > n.melee;
    const look = this.lookFor(who);
    const key = `p${who}`, aff = this.heroAffinity(who);
    return {
      battler: {
        key, side: 'party', name: m.def.name, hp: m.data.down ? 0 : m.data.hp, maxHp: n.max.hp, mp: m.data.mp, maxMp: n.max.mp,
        attack: useBow ? n.bow : n.melee, attackElement: aff.primary ?? (useBow ? n.bowElement : n.meleeElement), attackMagic: false, affinity: aff,
        armour: n.armour, magicArmour: n.magicArmour, agility: t.attrs.agi, baseAgility: t.attrs.agi, crit: n.crit,
        ...this.aimOf(this.items.get((useBow ? m.data.equip.ranged : m.data.equip.weapon) ?? ''), t.attrs.dex), evasion: evasionOf(t.attrs.agi), spellEvasion: evasionOf(t.attrs.mdf), resist: ailmentResist(t.attrs.end), ranged: useBow, guardBonus: msk.get('guardHeal'),
        defence: this.heroDefence(who),
        spells, ct: 0, guarding: false,
        status: this.lingering(new BattleStatus([...(m.def.resists ?? []), ...this.wornGear(m.data.equip).flatMap((g) => g?.protects ?? [])]), m.data.ailments),
        inflicts: useBow ? undefined : n.meleeInflicts,
        ...this.attackStyle(who, ab),
      },
      view: { key, side: 'party', name: m.def.name, picture: this.sprites.standingFrame(`battle:ally:${m.def.id}`, look, 'left', 0), icon: this.memberPortrait(m.def), color: this.heroColor(who), face: m.def.face ? this.resolveFile(m.def.face) : undefined,
        level: m.data.level, xp: { have: m.data.xp, next: xpToNext(this.combatCfg, m.data.level) }, elements: aff.elements.length ? aff.elements : undefined, back: this.combatCfg.turnBased.layout === 'pocket' ? this.sprites.standingFrame(`battle:ally:${m.def.id}`, look, 'up', 0) : undefined },
      fig: { look, equip: m.data.equip, bow: useBow, lift: m.def.battleOffset },
    };
  }

  /** Start a turn-based battle against these enemies (ones from the map carry their `enemy`, random ones don't). */
  /** A scripted battle's rules (the Start battle event command): running away, losing, the result, its music. */
  private battleRules: { canRun?: boolean; lose?: 'respawn' | 'continue'; resultVar?: string; music?: string; scripted?: boolean; stage?: string } = {};

  /**
   * `rules.stage`: the battle map to fight on (unset: this map's Battle map; '' or none: the flat battle screen).
   * A battle map not loaded yet loads first (battles wait for it).
   */
  private startBattle(list: { def: EnemyDef; hp: number; enemy: Enemy | null }[], opening: Opening, rules: TurnBattle['rules'] & { lose?: 'respawn' | 'continue'; resultVar?: string; music?: string; scripted?: boolean; stage?: string; noIntro?: boolean; pick?: TroopDef['pick'] } = {}): void {
    if (!list.length || this.battle.active || (this.battlePending && !rules.noIntro)) return;
    // Single mode: one foe picked at random (a wild encounter), chosen once, before the way in.
    if (this.combatCfg.turnBased.mode === 'single' && rules.pick === 'random' && list.length > 1) { list = [list[Math.floor(Math.random() * list.length)]]; rules = { ...rules, pick: 'full' }; }
    // The way in: a sudden sting, everything stops, the picture breaks up into black; the battle starts there.
    if (!rules.noIntro) {
      this.battlePending = true;
      // Its battle map loads while the transition plays.
      const want = rules.stage ?? this.mapData?.battleMap;
      if (want && !this.battleMaps.has(want)) void this.loadMapData(want).then((d) => this.battleMaps.set(want, d)).catch(() => { /* reported when the battle starts */ });
      this.moveTarget = null;
      this.battleIntro(() => { this.battlePending = false; this.startBattle(list, opening, { ...rules, noIntro: true }); });
      return;
    }
    const stageName = rules.stage ?? this.mapData?.battleMap ?? '';
    if (stageName && !this.battleMaps.has(stageName)) {
      this.battlePending = true;
      void this.loadMapData(stageName)
        .then((d) => { this.battleMaps.set(stageName, d); })
        .catch((err: Error) => console.warn(`Battle map “${stageName}” couldn’t be loaded: ${err.message}`))
        .finally(() => {
          this.battlePending = false;
          this.startBattle(list, opening, { ...rules, stage: this.battleMaps.has(stageName) ? stageName : '' });
        });
      return;
    }
    const stageData = stageName ? this.battleMaps.get(stageName) : undefined;
    const specs: StageFighterSpec[] = [];
    this.battleRules = rules;
    this.combat.reset();
    this.endFishing();
    this.moveTarget = null;
    const entries: BattleEntry[] = [];
    // The hero and the first two of the lineup fight; the rest wait on the bench. Single mode: the first standing.
    this.battleWhos = new Set();
    this.earned.clear();
    this.battleFoes.clear();
    const single = this.combatCfg.turnBased.mode === 'single';
    const fieldWhos = single ? [this.singlePool().find((w) => (w ? !this.members()[w - 1]?.data.down : this.stats.hp > 0)) ?? 0] : this.activeWhos();
    for (const who of fieldWhos) {
      this.battleWhos.add(who);
      const b = this.partyBattler(who);
      if (!b) continue;
      entries.push({ battler: b.battler, view: b.view, who });
      if (stageData) specs.push({ ...this.heroFigure(b.view.key, b.fig.look, b.fig.equip, b.fig.bow, b.fig.lift), color: b.view.color });
    }
    // Several of a kind are told apart: Slime A, Slime B…
    const counts = new Map<string, number>(), seen = new Map<string, number>();
    for (const x of list) counts.set(x.def.id, (counts.get(x.def.id) ?? 0) + 1);
    list.forEach((x, i) => {
      const d = x.def, pic = this.enemyPicture(d), k = seen.get(d.id) ?? 0;
      seen.set(d.id, k + 1);
      const name = (counts.get(d.id) ?? 0) > 1 ? `${d.name} ${String.fromCharCode(65 + k)}` : d.name;
      this.battleFoes.set(`e${i}`, d);
      // Health rolled either side of the database's (Health ± %), so no two slimes are quite the same.
      const v = Math.max(0, Math.min(0.9, (d.hpVariance ?? 0) / 100)), maxHp = Math.max(1, Math.round(d.hp * (1 - v + Math.random() * 2 * v)));
      const hp = x.hp >= d.hp ? maxHp : Math.min(maxHp, x.hp);
      const battler: Battler = {
        key: `e${i}`, side: 'enemy', name, hp: Math.max(1, hp), maxHp, mp: 0, maxMp: 0, spread: (d.damageVariance ?? 10) / 100,
        attack: d.damage, attackElement: enemyElement(d), attackMagic: d.attackType === 'magic',
        armour: d.defense ?? 0, magicArmour: d.magicDefense ?? d.defense ?? 0, agility: enemyAgility(d), baseAgility: enemyAgility(d), crit: d.crit ?? 5,
        accuracy: d.accuracy, evasion: d.evasion, spellEvasion: d.spellEvasion, resist: d.ailmentResist, impact: impactOf(d), overdrive: d.boss && d.overdrive ? 0 : undefined,
        defence: d, spells: [], ct: 0, guarding: false, boss: d.boss,
        status: new BattleStatus(d.resists ?? [], !!d.boss, !!d.undead), inflicts: d.inflicts,
        actions: d.actions, attackWeight: d.attackWeight, counterspell: d.counterspell,
      };
      entries.push({ battler, view: { key: battler.key, side: 'enemy', name, level: d.level, picture: pic.picture, icon: pic.icon, flip: pic.flip, scale: d.scale, elements: d.elements, overdrive: !!(d.boss && d.overdrive) }, ref: { def: d, enemy: x.enemy, battler } });
      if (stageData && (!single || rules.pick !== 'oneByOne' || i === 0)) specs.push(this.enemyFigure(battler.key, d));
    });
    // Single mode, one at a time: the first comes out, the rest wait their turn.
    const waiting: BattleEntry[] = [];
    if (single && rules.pick === 'oneByOne') {
      const foes = entries.filter((e) => e.battler.side === 'enemy');
      for (const e of foes.slice(1)) { waiting.push(e); entries.splice(entries.indexOf(e), 1); }
    } else if (single) {
      // A full troop fights together, as in a group battle (three at most).
      const foes = entries.filter((e) => e.battler.side === 'enemy');
      for (const e of foes.slice(MAX_FOES)) entries.splice(entries.indexOf(e), 1);
    }
    if (stageData) this.openStage(stageData, specs);
    this.audio.play('crit');
    // The Bestiary: each kind met, and where.
    for (const id of new Set(list.map((x) => x.def.id))) { this.state.tally(`seen:${id}`); if (this.mapName) this.state.tally(`seenAt:${id}:${this.mapName}`); }
    this.battle.start(entries, this.combatCfg.turnBased, opening, { canRun: rules.canRun, waiting });
  }

  /** Single battle mode: who can be swapped in (the lineup's first, Database → Combat → Heroes who fight). */
  private singlePool(): number[] { return this.lineupWhos().slice(0, this.combatCfg.turnBased.singleParty); }

  /** Party members (0 the hero) fighting in the battle now. */
  private battleWhos = new Set<number>();
  /** This battle's foes by fighter key (their EXP as they fall). */
  private readonly battleFoes = new Map<string, EnemyDef>();
  /** EXP each party member earned this battle (by who): foes falling while they fought, and bonuses. */
  private readonly earned = new Map<number, { base: number; finish: number; weak: number; addition: number }>();
  private earn(who: number): { base: number; finish: number; weak: number; addition: number } {
    let e = this.earned.get(who);
    if (!e) this.earned.set(who, (e = { base: 0, finish: 0, weak: 0, addition: 0 }));
    return e;
  }

  /** After a battle: whoever finished it fighting moves to the front of the lineup (in their places). */
  private keepLineup(whos: number[]): void {
    if (!whos.length) return;
    this.setLineup([...whos, ...this.lineupWhos().filter((w) => !whos.includes(w))]);
  }

  /** A snapshot of the next frame drawn (for the battle transition). */
  private snapWanted: ((c: HTMLCanvasElement) => void) | null = null;
  private transition: { remove(): void } | null = null;

  /** Into battle: sting, freeze, a transition (the map's choice, or any) to black with a swell; then `start`. */
  private battleIntro(start: () => void): void {
    this.audio.play('encounter');
    this.battleSound = { music: '', hush: true, fade: 0.3 };
    const kinds = (this.mapData?.battleTransitions ?? []).filter((k): k is TransitionKind => (TRANSITIONS as readonly string[]).includes(k));
    const pool = kinds.length ? kinds : [...TRANSITIONS];
    const kind = pool[Math.floor(Math.random() * pool.length)];
    this.snapWanted = (snap) => {
      // A beat of stillness, then the picture goes.
      setTimeout(() => {
        this.audio.play(kind === 'shatter' ? 'shatter' : 'battleSwell');
        if (kind === 'shatter') setTimeout(() => this.audio.play('battleSwell'), 120);
        this.transition = playTransition(kind, snap, document.body, kind === 'shatter' ? 1.5 : 1.3, () => {
          this.post.fade = 1;
          this.fade = { from: 1, to: 1, t: 1, duration: 1 };
          this.battleSound = null;
          start();
          // The battle fades in (its music starting) once its first picture is drawn.
          requestAnimationFrame(() => requestAnimationFrame(() => {
            this.transition?.remove(); this.transition = null;
            this.fade = { from: 1, to: 0, t: 0, duration: 0.7 };
          }));
        });
      }, 280);
    };
  }

  /* ------------------------------------------------------------------ battle maps (the 3D stage) */

  /** A hero on the stage: their sprite (back to the camera), holding their weapon, and how they attack. */
  private heroFigure(key: string, look: CharacterDef | undefined, equip: Partial<Record<EquipSlot, string>>, bow: boolean, lift?: number): StageFighterSpec {
    const sprite = new CharacterSprite(this.sprites, this.sprites.forCharacter(look), 'up');
    const weapons: CarriedWeapon[] = [];
    const add = (slot: EquipSlot) => {
      const item = equip[slot] ? this.items.get(equip[slot]!) : undefined, id = itemWeaponSprite(item), w = this.sprites.weapon(id);
      if (!w) return;
      const fx = item?.glow || item?.trail;
      weapons.push({ ...w, glow: item?.glow, trail: item?.trail, mask: fx ? this.sprites.weaponMask(id) : null });
    };
    if (sprite.animated) { if (bow) add('ranged'); else { add('shield'); add('weapon'); } }
    const held = weapons.length ? weapons[weapons.length - 1].def : null;
    const attackAnim = bow ? 'shoot' : held ? (['slash', 'slash_reverse', 'thrust'].find((a) => held.anims.includes(a)) ?? 'slash') : 'slash';
    return { key, side: 'party', sprite, weapons, attackAnim, lift };
  }

  /** An enemy on the stage, drawn as it is on the field (a picture, a monster sheet or a person), facing the camera. */
  private enemyFigure(key: string, def: EnemyDef): StageFighterSpec {
    const monster = def.look.monster && MONSTERS[def.look.monster];
    const person = def.look.character ? this.db.characters[def.look.character] : undefined;
    const picture = def.look.image ? this.sprites.flat(def.look.image, def.look.flat?.height ?? 1) : null;
    const sprite = picture ? new FlatSprite(picture, def.look.flat ?? {}, def.look.flat?.height ?? 1)
      : monster ? new CharacterSprite(this.sprites, this.sprites.sheet(monster.draw()), 'down')
      : person ? new CharacterSprite(this.sprites, this.sprites.forCharacter(person), 'down')
      : new CharacterSprite(this.sprites, this.sprites.sheet(MONSTERS.slime.draw()), 'down');
    let weapons: CarriedWeapon[] = [], attackAnim = def.behaviour === 'ranged' ? 'shoot' : 'slash';
    if (sprite instanceof CharacterSprite && sprite.animated && def.look.character) {
      const w = def.weapon ?? (def.behaviour === 'ranged' ? 'bow' : 'sword');
      weapons = enemyWeaponSprites(def, w).map((id) => this.sprites.weapon(id)).filter((x): x is NonNullable<typeof x> => !!x);
      const held = weapons.length ? weapons[weapons.length - 1].def : null;
      if (held && def.behaviour !== 'ranged') attackAnim = ['slash', 'slash_reverse', 'thrust'].find((a) => held.anims.includes(a)) ?? 'slash';
    }
    if (def.tint) tintObject(sprite.mesh, def.tint);
    return { key, side: 'enemy', sprite, scale: def.scale ?? 1, weapons, attackAnim, lift: def.battleOffset };
  }

  /** Build a battle map as the stage for the battle about to start, and switch the view to it. */
  private openStage(data: MapData, specs: StageFighterSpec[]): void {
    this.endStage();
    // Battle maps keep their heights unless they choose flat.
    TileMap.flatByDefault = false;
    const map = new TileMap(data, this.tiles);
    TileMap.flatByDefault = this.db.viewMode === '2d';
    const stage = new BattleStage(data, (x, z) => map.standY(x, z));
    // Pocket Handheld: the camera starts behind the hero, the foe up and across from them.
    stage.pocket = this.combatCfg.turnBased.layout === 'pocket';
    const built = buildWorld(stage.group, map, data, this.sprites, this.tileTextures);
    tagAOMeshes(stage.group);
    const lights = new Lights(stage.group, data, map, this.sprites);
    stage.scene.fog = this.fog;
    stage.scene.background = this.fog.color;
    // The sun and sky light the stage while it's shown.
    stage.scene.add(this.hemi, this.sun, this.sun.target);
    this.stage = { stage, lights, built, env: this.time.environment, map, look: new THREE.Vector3(data.width / 2, 0, data.height / 2), music: data.battleMusic || data.music || undefined };
    if (this.settings.quality === 'potato') this.applySettings();
    // The field's weather (rain, snow…) and mist and sun rays carry on over the battle.
    const w = this.mapWeather();
    this.weather.attach(stage.group, w.kind, w.amount, this.stage.look);
    this.atmosphere.attach(stage.group, this.stage.look);
    this.time.environment = data.environment ?? 'outdoor';
    this.time.update(0);
    stage.addFighters(specs);
    tagAOMeshes(stage.group);
    this.applyFov();
    this.battleScreen.setStage(stage);
    this.battleScreen.setBoxes(this.combatCfg.turnBased.layout === 'pocket' ? this.db.menus?.battleLayout : undefined);
    this.battleScreen.onClosed = () => this.endStage();
    this.battleScreen.onCamera = (d) => this.cycleCamera(d);
    this.battleScreen.cameraHint(stage.cameraName, this.cameraKeys());
    this.warmup = true;
  }

  private cameraKeys(): [string, string] { return this.input.lastDevice === 'pad' ? ['LB', 'RB'] : ['Q', 'E']; }

  private cycleCamera(dir: 1 | -1): void {
    if (!this.stage) return;
    this.battleScreen.cameraHint(this.stage.stage.cycleCamera(dir), this.cameraKeys());
    this.audio.play('menuMove');
  }

  /** The battle is over: back to the field's view and lighting. */
  private endStage(): void {
    const s = this.stage;
    if (!s) return;
    this.stage = null;
    if (this.settings.quality === 'potato') this.applySettings();
    this.scene.add(this.hemi, this.sun, this.sun.target);
    // The weather goes back to the field (before the stage is thrown away).
    if (this.level) { const w = this.mapWeather(); this.weather.attach(this.level, w.kind, w.amount, this.camTarget); this.atmosphere.attach(this.level, this.camTarget); }
    s.stage.dispose((root) => this.disposeTree(root));
    this.time.environment = s.env;
    this.time.update(0);
    this.applyFov();
    this.battleFrames = 0;
  }

  /** The camera's field of view: the field's (wider on portrait screens), or the battle map's. */
  private applyFov(): void {
    const narrow = this.camera.aspect < 1;
    const fov = this.overworldCam.fov;
    this.camera.fov = this.stage ? this.stage.stage.fov * (narrow ? 1.4 : 1) : narrow ? fov * 1.45 : fov; // portrait phones need a wider view
    this.camera.updateProjectionMatrix();
  }

  private updateStageCamera(dt: number): void {
    const st = this.stage!.stage;
    const look = st.updateCamera(dt, this.camera);
    this.stage!.look.copy(look);
    this.sun.target.position.copy(look);
    this.sun.position.copy(look).addScaledVector(this.time.sunDir, 30);
    this.post.focus = st.focusHeight(this.camera);
    // Battles keep a wider band sharp, so a tall foe isn't blurred at the top.
    this.post.focusBand = 2.2;
    this.camera.updateMatrixWorld();
    const r = this.canvas.getBoundingClientRect();
    st.project(this.camera, r.width, r.height, (k, x, y, w, h, shown) => this.battleScreen.place(k, x + r.left, y + r.top, w, h, shown));
  }

  /** Load the battle maps this map's battles use, so battles start without waiting. */
  private preloadBattleMaps(data: MapData): void {
    const names = new Set([data.battleMap, ...Object.values(data.zones ?? {}).map((z) => z.battleMap)].filter((n): n is string => !!n));
    for (const n of names) if (!this.battleMaps.has(n)) void this.loadMapData(n).then((d) => this.battleMaps.set(n, d)).catch(() => { /* loaded (or reported) when a battle needs it */ });
  }

  private battleHost(): BattleHost {
    type Ref = { def: EnemyDef; enemy: Enemy | null; battler: Battler };
    return {
      sound: (n) => this.audio.play(n),
      // A battle starts in the map's weather (outdoors, when it's falling).
      startWeather: () => {
        const w = this.mapWeather(), map: Partial<Record<WeatherKind, BattleWeather>> = { rain: 'rain', storm: 'storm', snow: 'snow', blizzard: 'blizzard', sandstorm: 'sandstorm' };
        return w.amount > 0.15 ? map[w.kind] ?? 'none' : 'none';
      },
      weather: (k) => { this.battleSky = k; },
      tally: (k, n, best) => this.state.tally(k, n, best),
      items: () => this.inventory.slots.flatMap((s, i) => {
        const d = s && this.items.get(s.id);
        if (!s || !d || d.kind !== 'consumable' || !(d.restore || d.cures?.length || d.buffs?.length)) return [];
        const bits = restoreBits(d), part = (g: 'hp' | 'mp') => restoreParts(d, g);
        return [{ slot: i, name: d.name, icon: this.itemIcon(d.id), count: s.n, detail: [bits.join(' · '), d.description].filter(Boolean).join(' — '), restore: { hp: part('hp').flat, mp: part('mp').flat }, pct: { hp: part('hp').pct, mp: part('mp').pct }, cures: d.cures as string[] | undefined, buffs: d.buffs }];
      }),
      useItem: (slot, who, ailments, by) => {
        const s0 = this.inventory.slots[slot], id = s0?.id, d = id ? this.items.get(id) : undefined, before = id ? this.inventory.count(id) : 0;
        // What it cures of the battle's ailments on the one it's used on.
        const cures = d?.cures ?? [], all = cures.includes('all');
        const cured = ailments.filter((a) => (a === 'zombie' ? cures.includes('zombie') : all || cures.includes(a as never) || (a === 'frozen' && cures.includes('chill'))));
        let text = this.useItem(slot, who, true);
        let used = !!id && this.inventory.count(id) < before;
        if (!used && cured.length && d) {
          // Only a cure (party members' items on the map don't cure): used up here.
          this.inventory.removeAt(slot, 1);
          this.state.tally('itemsUsed');
          used = true;
          text = `${who ? this.members()[who - 1]?.def.name ?? '' : mainHero(this.db).name} used ${d.name}.`;
        }
        // In battle, a favourite (or a disliked) item is from the hero who used it (Update 127).
        if (used && by !== undefined) { const idOf = (w: number) => (w === 0 ? mainHero(this.db).id : this.members()[w - 1]?.def.id ?? ''); this.itemReaction(d, idOf(who), idOf(by)); }
        return text === null && !used ? null : { text: text ?? '', used, cures: used ? cures : [], buffs: used ? d?.buffs : undefined };
      },
      voice: (src) => this.audio.play(src),
      heroColor: (who) => this.heroColor(who),
      reserves: () => (this.combatCfg.turnBased.mode === 'single' ? this.singlePool() : this.lineupWhos()).flatMap((who) => {
        if (this.battleWhos.has(who)) return [];
        if (!who) {
          // The hero on the bench (unless the hero always fights: group battles).
          if (this.combatCfg.turnBased.heroLocked && this.combatCfg.turnBased.mode !== 'single') return [];
          const h = mainHero(this.db);
          this.portraitUrl ??= this.sprites.portrait('hero', this.db.characters[this.db.player], 48).toDataURL();
          return [{ who, name: h.name, icon: h.face ? this.resolveFile(h.face) : this.portraitUrl, hp: Math.max(0, this.stats.hp), maxHp: this.stats.cfg.max.hp, mp: this.stats.mp, maxMp: this.stats.cfg.max.mp, down: this.stats.hp <= 0 }];
        }
        const m = this.members()[who - 1];
        if (!m) return [];
        const n = this.allyNumbers(m.data, m.def);
        return [{ who, name: m.def.name, icon: m.def.face ? this.resolveFile(m.def.face) : this.memberPortrait(m.def), hp: m.data.down ? 0 : m.data.hp, maxHp: n.max.hp, mp: m.data.mp, maxMp: n.max.mp, down: !!m.data.down }];
      }),
      bond: (kind, rater, rated) => this.bond(kind, rater, rated),
      begun: () => this.relBattle.clear(),
      swapIn: (outKey, outWho, inWho) => {
        const b = this.partyBattler(inWho);
        if (!b) return null;
        this.battleWhos.delete(outWho);
        this.battleWhos.add(inWho);
        this.earn(inWho);
        if (this.stage) this.stage.stage.replaceFighter(outKey, { ...this.heroFigure(b.view.key, b.fig.look, b.fig.equip, b.fig.bow, b.fig.lift), color: b.view.color });
        return { battler: b.battler, view: b.view, who: inWho };
      },
      attackVoice: (who) => {
        const def = who ? this.members()[who - 1]?.def : mainHero(this.db);
        const list = (def?.attackSounds ?? []).filter(Boolean);
        if (list.length) this.audio.play(list[Math.floor(Math.random() * list.length)]);
      },
      spendItem: (slot) => { if (this.inventory.slots[slot]) { this.inventory.removeAt(slot, 1); this.state.tally('itemsUsed'); } },
      readVitals: (who) => {
        if (!who) return { hp: this.stats.hp, mp: this.stats.mp };
        const m = this.members()[who - 1];
        return m ? { hp: m.data.down ? 0 : m.data.hp, mp: m.data.mp } : { hp: 0, mp: 0 };
      },
      writeVitals: (who, hp, mp) => {
        if (!who) { this.stats.change('hp', 'set', hp); this.stats.change('mp', 'set', mp); return; }
        const m = this.members()[who - 1];
        if (!m) return;
        m.data.hp = Math.max(0, hp); m.data.mp = Math.max(0, mp); m.data.down = hp <= 0;
        const a = this.allies.find((x) => x.data === m.data);
        if (a && !m.data.down) { a.sprite.hold(null); a.sprite.mesh.rotation.z = 0; }
      },
      victory: (beaten) => this.battleRewards(beaten as Ref[]),
      foeIn: (outKey, e) => { const d = this.battleFoes.get(e.battler.key); if (this.stage && d) this.stage.stage.replaceFighter(outKey, this.enemyFigure(e.battler.key, d)); },
      // EXP as each foe falls: everyone fighting gets its EXP; the finishing blow (and a weakness) a little more.
      foeDefeated: (key, by, weak, fighting) => {
        const d = this.battleFoes.get(key), xp = Math.max(0, d?.xp ?? 0), b = this.combatCfg.exp;
        if (!xp) return [];
        return fighting.map((who) => {
          const e = this.earn(who), finish = who === by ? Math.round((xp * b.finish) / 100) : 0, w = who === by && weak ? Math.round((xp * b.weak) / 100) : 0;
          e.base += xp; e.finish += finish; e.weak += w;
          return { who, xp: xp + finish + w };
        });
      },
      // Pocket Handheld's EXP bar during the battle: where a hero's bar would be with what they've earned so far.
      xpPreview: (who) => {
        const e = this.earned.get(who), m = who ? this.members()[who - 1]?.data : undefined;
        let level = m ? m.level : this.progress.level, have = m ? m.xp : this.progress.xp, left = e ? e.base + e.finish + e.weak + e.addition : 0;
        for (;;) {
          const need = xpToNext(this.combatCfg, level);
          if (need <= 0) return { level, frac: 1 };
          if (have + left < need) return { level, frac: (have + left) / need };
          left -= need - have; have = 0; level++;
        }
      },
      // Each Addition strike landed earns a little EXP (a perfect one twice that); completing it, more.
      strikeExp: (who, key, result) => {
        const xp = Math.max(0, this.battleFoes.get(key)?.xp ?? 0), b = this.combatCfg.exp;
        const n = result === 'complete' ? Math.round((xp * b.complete) / 100) : Math.max(xp > 0 ? 1 : 0, Math.round((xp * b.strike * (result === 'perfect' ? 2 : 1)) / 100));
        if (n > 0) this.earn(who).addition += n;
        return n;
      },
      fanfare: () => {
        // The battle music stops; the fanfare plays; then the victory tune.
        // Then music: the game's victory music (Database → Audio), or the map's own.
        this.battleSound = { music: '', fade: 0.35, next: { at: 3.0, music: this.db.audio?.victoryMusic ?? this.mapData?.music ?? '' } };
        this.audio.play('victory');
      },
      outro: (done) => {
        // Picture and sound fade out together; the field comes back once it's dark.
        this.battleSound = { music: '', hush: true, fade: 1.6 };
        this.battleScreen.fadeOut(1.4);
        this.fade = { from: this.post.fade, to: 1, t: 0, duration: 1.6 };
        this.outro = { done };
      },
      finished: (outcome, beaten) => {
        if (outcome !== 'defeat') this.keepAilments(this.battle.partyAilments());
        this.keepLineup(this.battle.lineup());
        this.battleGrace = this.combatCfg.turnBased.grace;
        this.encounterWalked = 0;
        const rules = this.battleRules;
        this.battleRules = {};
        if (rules.resultVar) { this.state.setVar(rules.resultVar, outcome === 'victory' ? 1 : outcome === 'fled' ? 2 : 0); this.refreshEvents(); }
        if (outcome === 'defeat') {
          // A story battle the party may lose: everyone back on their feet with a little health; the event goes on.
          if (rules.lose === 'continue') {
            this.stats.change('hp', 'set', 1);
            for (const m of this.members()) { m.data.down = false; m.data.hp = Math.max(1, m.data.hp); }
            return;
          }
          this.interpreter.stop();
          this.die();
          return;
        }
        // Knocked out but the battle was won: back on their feet with a little health.
        if (this.stats.hp <= 0) this.stats.change('hp', 'set', 1);
        if (outcome === 'fled') {
          for (const e of this.combat.enemies) if (!e.dead && e.alert) e.calm();
          return;
        }
        void beaten;
        this.refreshEvents();
        const evs = this.battleCommands;
        this.battleCommands = [];
        const cmds = evs.flatMap((ev) => ev.page?.commands ?? []);
        if (cmds.length && !this.interpreter.running) this.interpreter.start(cmds, evs.length === 1 ? evs[0].selfId : '');
      },
      log: (t) => this.log.add(t, 'hit'),
      mastered: (who, id) => {
        const a = this.abilitiesOf(who), d = findAddition(this.db, id);
        return a && d ? masterAddition(a, d) : null;
      },
    };
  }

  /** Won: EXP for everyone standing, gold and items into the bag, and what each beaten enemy's page does. */
  private battleRewards(beaten: { def: EnemyDef; enemy: Enemy | null; battler: Battler }[]): VictoryReport {
    let xp = 0, gold = 0;
    const got = new Map<string, number>();
    this.battleCommands = [];
    for (const b of beaten) {
      const d = b.def;
      this.state.tally('kills'); this.state.tally(`kill:${d.id}`);
      this.quests.enemyDefeated(d.id);
      xp += Math.max(0, d.xp);
      gold += d.gold ? Math.round(d.gold[0] + Math.random() * Math.max(0, d.gold[1] - d.gold[0])) : 0;
      for (const drop of d.drops ?? []) if (Math.random() < drop.chance && this.items.has(drop.item)) got.set(drop.item, (got.get(drop.item) ?? 0) + Math.max(1, drop.count ?? 1));
      if (b.enemy) {
        this.combat.beatenInBattle(b.enemy);
        const ev = b.enemy.key as GameEvent;
        if (ev.page?.commands.length) this.battleCommands.push(ev);
      }
    }
    // The loot: gold first, then each item (with the sound its kind makes).
    const loot: VictoryLoot[] = [];
    if (gold > 0) {
      this.inventory.gold += gold; this.state.tally('goldFound', gold); this.log.add(`Received ${gold} G`, 'loot');
      loot.push({ name: `${gold} G`, icon: builtinIcon('coin').toDataURL(), count: 0, kind: 'gold' });
    }
    for (const [id, n] of got) {
      const d = this.items.get(id)!, left = this.inventory.add(id, n), kept = n - left;
      const kind: VictoryLoot['kind'] = d.kind === 'consumable' ? 'potion' : d.kind === 'key' ? 'key' : d.kind === 'material' ? 'material' : d.kind === 'equipment' || d.kind === 'ammo' ? 'gear' : 'item';
      if (kept > 0) this.log.add(`Received ${kept > 1 ? `${kept} × ` : ''}${d.name}`, 'loot');
      // No room: it's left on the ground at the hero's feet.
      if (left > 0) { const p = this.player.position; this.pickups?.place(id, left, p.x, p.y, p.z); }
      loot.push({ name: d.name, icon: this.itemIcon(id), count: n, kind, note: left > 0 ? (kept ? `${left} left on the ground: the bag is full` : 'Left on the ground: the bag is full') : undefined });
    }
    // EXP: each hero's bar, filled level by level, and what their new levels brought.
    const heroes: VictoryHero[] = [];
    const segments = (level: number, have: number, n: number): VictoryHero['segments'] => {
      const out: VictoryHero['segments'] = [];
      let left = n;
      while (left > 0) {
        const need = xpToNext(this.combatCfg, level);
        if (need <= 0) break;
        const take = Math.min(left, need - have);
        out.push({ level, from: have / need, to: (have + take) / need, up: have + take >= need, xp: have + take, toNext: need });
        left -= take;
        if (have + take >= need) { level++; have = 0; } else have += take;
      }
      return out;
    };
    const change = (out: string[], label: string, a: number, b: number) => { if (b !== a) out.push(`${label} ${Math.round(a)} → ${Math.round(b)}`); };
    const gain = (out: string[], label: string, n: number) => { if (n > 0) out.push(`+${n} ${label}${n === 1 ? '' : 's'}`); };
    // What the levels added to each stat (by its rank): "STR +4".
    const statChanges = (out: string[], a: Attrs, b: Attrs) => { const bits = ATTRS.filter((k) => b[k] > a[k]).map((k) => `${ATTR_INFO[k].short} +${b[k] - a[k]}`); if (bits.length) out.push(bits.join(' · ')); };
    // What each hero earned: fighters what they won as foes fell (and bonuses); those sitting it out, an EXP Share's
    // or EXP All's percent of the foes' EXP.
    const b = this.combatCfg.exp, noKo = !this.battle.partyFell;
    const benchPct = (who: number): { pct: number; name: string } => {
      const worn = who ? this.members()[who - 1]?.data.equip ?? {} : this.inventory.equip;
      let pct = 0, name = '';
      for (const id of Object.values(worn)) { const d = id ? this.items.get(id) : undefined; if (d?.exp && !d.exp.all && d.exp.share > pct) { pct = d.exp.share; name = d.name; } }
      for (const st of this.inventory.slots) { const d = st ? this.items.get(st.id) : undefined; if (d?.exp?.all && !this.state.expAllOff.has(d.id) && d.exp.share > pct) { pct = d.exp.share; name = d.name; } }
      return { pct, name };
    };
    // Rested / Well Rested: +10% / +25% EXP on top (Update 106).
    const share = (who: number): { gained: number; note: string; via?: string; bonus?: VictoryHero['bonus'] } => {
      const r = share0(who), g = this.goodOf(this.heroIdOf(who));
      if (!g || r.gained <= 0) return r;
      const extra = Math.round((r.gained * GOOD_INFO[g.kind].exp) / 100), bit = `${GOOD_INFO[g.kind].name} +${extra}`;
      return { ...r, gained: r.gained + extra, note: r.note ? `${r.note} · ${bit}` : bit, bonus: r.bonus ? { gained: r.bonus.gained + extra, bits: [...r.bonus.bits, bit] } : r.bonus };
    };
    const share0 = (who: number): { gained: number; note: string; via?: string; bonus?: VictoryHero['bonus'] } => {
      const e = this.earned.get(who);
      if (e) {
        const ko = noKo && e.base > 0 ? Math.round((e.base * b.noKo) / 100) : 0;
        const bits = [`Base ${e.base}`, e.finish ? `Finishing blows +${e.finish}` : '', e.weak ? `Weaknesses +${e.weak}` : '', e.addition ? `Additions +${e.addition}` : '', ko ? `No KOs +${ko}` : ''].filter(Boolean);
        const gained = e.base + e.finish + e.weak + e.addition + ko;
        // Pocket Handheld tells it all at once: the total, and how much of it was bonus (everything beyond the foes' own EXP).
        return { gained, note: gained && bits.length > 1 ? bits.join(' · ') : '', bonus: { gained: e.finish + e.weak + e.addition + ko, bits: bits.slice(1) } };
      }
      const { pct, name } = benchPct(who), gained = Math.round((xp * pct) / 100);
      return { gained, note: gained ? `Sat out: ${pct}% (${name || 'EXP Share'})` : 'Sat out: no EXP', via: gained ? name || 'EXP Share' : undefined };
    };
    {
      const pr = this.progress, before = { level: pr.level, xp: pr.xp, toNext: pr.toNext, hp: this.stats.cfg.max.hp, mp: this.stats.cfg.max.mp, stats: { ...pr.stats }, sk: pr.points };
      const { gained, note, via, bonus } = share(0);
      const segs = gained > 0 ? segments(pr.level, pr.xp, gained) : [];
      if (gained > 0) this.gainXp(gained, true, true);
      const changes: string[] = [];
      if (pr.level > before.level) {
        change(changes, 'Max HP', before.hp, this.stats.cfg.max.hp); change(changes, 'Max MP', before.mp, this.stats.cfg.max.mp);
        statChanges(changes, before.stats, pr.stats); gain(changes, 'skill point', pr.points - before.sk);
      }
      this.portraitUrl ??= this.sprites.portrait('hero', this.db.characters[this.db.player], 48).toDataURL();
      heroes.push({ key: 'p0', name: mainHero(this.db).name, icon: this.portraitUrl, color: this.heroColor(0), level: before.level, xp: before.xp, toNext: before.toNext, gained, note, via, bonus, segments: segs, changes, after: { level: pr.level, xp: pr.xp, toNext: pr.toNext } });
    }
    const sk = this.combatCfg.pointsPerLevel;
    this.members().forEach((m, k) => {
      const d = m.data, n0 = this.allyNumbers(d, m.def), before = { level: d.level, xp: d.xp, toNext: xpToNext(this.combatCfg, d.level), stats: { ...d.stats }, sk: d.skillPoints ?? 0 };
      const { gained, note, via, bonus } = share(k + 1), out = !!d.down && !gained;
      const segs = gained > 0 ? segments(d.level, d.xp, gained) : [];
      const changes: string[] = [];
      if (gained > 0) {
        const ups = memberGainXp(d, gained, this.combatCfg, this.memberGrowth(m), sk);
        if (ups) {
          this.log.add(`${m.def.name} reached level ${d.level}!`, 'level');
          const n1 = this.allyNumbers(d, m.def);
          change(changes, 'Max HP', n0.max.hp, n1.max.hp); change(changes, 'Max MP', n0.max.mp, n1.max.mp);
          statChanges(changes, before.stats, d.stats); gain(changes, 'skill point', (d.skillPoints ?? 0) - before.sk);
        }
      }
      heroes.push({ key: `p${k + 1}`, name: m.def.name, icon: this.memberPortrait(m.def), color: this.heroColor(k + 1), out, level: before.level, xp: before.xp, toNext: before.toNext, gained, note, via, bonus, segments: segs, changes, after: { level: d.level, xp: d.xp, toNext: xpToNext(this.combatCfg, d.level) } });
    });
    return { xp, heroes, loot };
  }

  /* ------------------------------------------------------------------ party */

  /** A hero joining: their starting stats grown by their ranks to their level, their own gear, full health. */
  private newMember(def: HeroDef): MemberData {
    const level = Math.max(1, Math.min(this.combatCfg.maxLevel ?? 99, def.joinLevel || this.progress.level));
    const abilities: AbilityData = {};
    mergeStarting(this.db, abilities, def);
    const stats = heroBase(def), g = levelGains(ranksOf(def.ranks, undefined, this.wornGear(def.gear ?? {})));
    for (const k of ATTRS) stats[k] = Math.min(ATTR_MAX, stats[k] + g[k] * (level - 1));
    return { id: def.id, stats, statPoints: 0, level, xp: 0, equip: { ...def.gear }, skills: {}, skillPoints: (level - 1) * this.combatCfg.pointsPerLevel,
      hp: this.stats.cfg.max.hp, mp: this.stats.cfg.max.mp, sp: this.stats.cfg.max.sp, abilities };
  }

  /** New game: the heroes marked "in the party at the start". */
  private startParty(): void {
    this.party.load(undefined);
    this.setupQueue = [];
    for (const def of (this.db.heroes ?? []).slice(1)) if (def.startsInParty && !this.party.full) {
      this.party.members.push(this.newMember(def));
      if (def.setupStats && creation(this.db).enabled) this.setupQueue.push(def.id);
    }
    if (this.inventory) this.ensureWornInBag();
  }

  /** Event command: a hero joins or leaves. */
  private changeParty(op: 'add' | 'remove', id: string, quiet = false): void {
    const def = (this.db.heroes ?? []).slice(1).find((h) => h.id === id);
    if (!def) return;
    if (op === 'add') {
      if (this.party.has(id)) return;
      if (this.party.full) { this.menu.notice(`The party is full (${MAX_PARTY + 1} at most)`); return; }
      this.party.members.push(this.newMember(def));
      // The gear they join with goes in the bag, worn by them.
      this.ensureWornInBag();
      if (!quiet) { this.log.add(`${def.name} joins the party!`, 'level'); this.audio.play('levelUp'); }
      if (def.setupStats && creation(this.db).enabled) { this.setupQueue.push(def.id); if (!this.transfer) this.nextSetup(); }
    } else {
      const m = this.party.get(id);
      if (!m) return;
      // Their gear was in the bag all along (in use): leaving, they just let go of it.
      this.party.members = this.party.members.filter((x) => x !== m);
      if (!quiet) this.log.add(`${def.name} leaves the party`, 'info');
    }
    const resting = this.restZone && this.restPicks ? this.restPicks : null;
    this.spawnAllies();
    // In a rest zone (Update 131): everyone else stays at their spot; someone joining walks in from off-screen.
    if (resting) {
      for (const a of this.allies) {
        const spot = resting.picks.get(a.def.id);
        if (spot) a.place(spot.x + 0.5, spot.z + 0.5, this.map);
        else if (op === 'add' && a.def.id === id) this.walkIn(a);
      }
    }
  }
  /** Put an ally just off-screen to one side of the hero, walking in (to their rest spot). */
  private walkIn(a: Ally): void {
    const p = this.motion;
    for (const [dx, dz] of [[-12, 0], [12, 0], [0, 10], [-9, 6], [9, 6]]) {
      const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
      if (!this.map.inMap(x, z) || this.map.isBlocked(x, z)) continue;
      a.place(x + 0.5, z + 0.5, this.map);
      a.walkLimit = 14;
      return;
    }
  }

  /** Put the party members on this map, lined up behind the hero. */
  private spawnAllies(): void {
    this.refreshLeader();
    for (const a of this.allies) a.dispose();
    this.allies = [];
    this.jumpMarks = [];
    if (!this.level || this.onTitle) return;
    if (!this.combatCfg.turnBased.partyFollows) return;
    const p = this.motion, [bx, bz] = DIR_VECTOR[this.player.dir];
    this.trail = [];
    for (let k = 12; k >= 0; k--) this.trail.push({ x: p.x - bx * k * 0.3, z: p.z - bz * k * 0.3 });
    // Only the lineup's front follows the hero (the rest of the party isn't shown walking along), in the list's
    // order (the same as the HUD panels and the pause menu); the hero you play walks in front wherever they're listed.
    this.activeWhos().filter((w) => w > 0).forEach((w, i) => {
      let m: MemberData | undefined, def: HeroDef | undefined, look;
      if (w > 0) {
        m = this.party.members[w - 1];
        def = m && this.db.heroes?.find((h) => h.id === m!.id);
        look = this.lookFor(w);
      } else {
        def = mainHero(this.db);
        m = { id: def.id, stats: this.progress.stats, statPoints: 0, level: this.progress.level, xp: this.progress.xp, equip: this.inventory.equip, skills: {}, skillPoints: 0, hp: this.stats.hp, mp: this.stats.mp, sp: this.stats.sp, abilities: {} };
        look = this.db.characters[this.db.player];
      }
      if (!m || !def) return;
      const a = new Ally(m, def, this.sprites, look, this.level!, p.x, p.z, this.map);
      a.passive = w === 0;
      a.slot = i;
      const spot = this.trailPoint(1.1 * (i + 1));
      if (spot && !this.map.isBlocked(Math.floor(spot.x), Math.floor(spot.z))) a.place(spot.x, spot.z, this.map);
      a.face(this.player.dir);
      this.allies.push(a);
    });
  }

  /** Which worn looks someone has on (armor, accessory, shield items with a Look when worn), for redrawing. */
  private wornSig(who: number): string {
    const equip = who ? this.members()[who - 1]?.data.equip : this.inventory?.equip;
    return (['armor', 'accessory', 'shield'] as EquipSlot[]).map((k) => { const id = equip?.[k]; return id && this.items.get(id)?.worn ? id : ''; }).join(',').replace(/^,+$/, '');
  }
  /** Credits for the built-in clothing items use (Update 128). */
  private wornCredits(): import('../world/types').SpriteCredit[][] {
    const used = new Set((this.db.items ?? []).flatMap((d) => (['top', 'bottom', 'accessory'] as const).map((k) => d.worn?.[k]?.part).filter((x): x is string => !!x)));
    return [...used].map((id) => wornPart(id)?.credits ?? []);
  }
  /** Someone's look with what they wear drawn over it (Update 114): the masculine or feminine version for their body. */
  private lookFor(who: number): CharacterDef | undefined {
    const def = who ? this.members()[who - 1]?.def : mainHero(this.db);
    const look = (who ? this.db.characters[def?.look ?? ''] : undefined) ?? this.db.characters[this.db.player];
    const equip = who ? this.members()[who - 1]?.data.equip : this.inventory?.equip;
    if (!look || !equip) return look;
    // The hero's outfit gender (Update 127), else their look's body.
    const fem = (def?.outfit ?? look.body) === 'femme';
    const body: 'masc' | 'femme' = fem ? 'femme' : 'masc';
    const layers = (['armor', 'accessory', 'shield'] as EquipSlot[]).flatMap((k) => {
      const w = equip[k] ? this.items.get(equip[k]!)?.worn : undefined;
      if (!w) return [];
      // Update 134: custom pictures placed over the hero (the other body's when this one has none).
      const pics = w.custom ? w.customPics?.[body] ?? w.customPics?.[body === 'femme' ? 'masc' : 'femme'] : undefined;
      if (pics && look.sheet && look.anim) {
        const key = this.sprites.customWorn(`custom:${equip[k]}:${look.sheet}:${JSON.stringify(pics)}`, look.sheet, look.anim, pics);
        return key ? [{ sheet: key, anim: look.anim, tint: w.tint }] : [];
      }
      // Update 128: the built-in outfit (bottom, top, accessory), unless the item uses its custom sheets.
      const picks = w.custom ? [] : (['bottom', 'top', 'accessory'] as const).map((s) => w[s]).filter((p): p is NonNullable<typeof p> => !!p);
      if (picks.length) return picks.flatMap((pk) => {
        const p = wornPart(pk.part), anim = p?.layout[body] ?? p?.layout.masc, over = p?.sheets[body] ?? p?.sheets.masc, under = p?.under?.[body] ?? p?.under?.masc;
        if (!p || !anim || !over) return [];
        const recolor = recolorPairs(p, pk.swatch);
        return [...(under ? [{ sheet: under, anim, tint: pk.tint, under: true, recolor }] : []), { sheet: over, anim, tint: pk.tint, recolor }];
      });
      const useF = fem ? !!w.femme : !w.masc;
      const sheet = useF ? w.femme : w.masc, anim = useF ? w.femmeAnim : w.mascAnim;
      return sheet && anim ? [{ sheet, anim, tint: w.tint }] : [];
    });
    return layers.length ? { ...look, wornLayers: layers } : look;
  }
  /** The party's worn looks last drawn (a change redraws them). */
  private wornDrawn = '';

  private leaderKey = '';
  /**
   * The hero you play (the first hero) always walks the map with their own sprite, wherever they are in the lineup
   * (Update 104: no one else can be the walking sprite). Redrawn when their look changes (a form).
   */
  private refreshLeader(): void {
    if (!this.player) return;
    const key = `hero:${this.db.player}:${this.wornSig(0)}`;
    if (key === this.leaderKey) return;
    const first = !this.leaderKey;
    this.leaderKey = key;
    if (first && !this.wornSig(0)) return;
    const look = this.lookFor(0);
    const old = this.player, s = new CharacterSprite(this.sprites, this.sprites.forCharacter(look), old.dir);
    s.mesh.position.copy(old.mesh.position);
    s.mesh.scale.copy(old.mesh.scale);
    s.mesh.visible = old.mesh.visible;
    s.mesh.castShadow = old.mesh.castShadow;
    old.mesh.parent?.add(s.mesh);
    old.mesh.removeFromParent();
    this.player = s;
  }

  /** A point on the hero's trail, `dist` tiles back along it. */
  private trailPoint(dist: number): { x: number; z: number } | null {
    const t = this.trail;
    if (!t.length) return null;
    let left = dist, prev = { x: this.motion.x, z: this.motion.z };
    for (let i = t.length - 1; i >= 0; i--) {
      const q = t[i], d = Math.hypot(q.x - prev.x, q.z - prev.z);
      if (d >= left) { const k = left / (d || 1); return { x: prev.x + (q.x - prev.x) * k, z: prev.z + (q.z - prev.z) * k }; }
      left -= d; prev = q;
    }
    return prev;
  }

  private updateParty(dt: number): void {
    // The trail: where the hero has walked on the ground (jumps and climbs are smoothed over).
    const m = this.motion, last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(m.x - last.x, m.z - last.z) > 0.2) { this.trail.push({ x: m.x, z: m.z }); if (this.trail.length > 120) this.trail.shift(); }
    const host = this.allyHost();
    // Put on or took off something with a worn look: redraw the party.
    const worn = [0, ...this.members().map((_, k) => k + 1)].map((w) => this.wornSig(w)).join('/');
    if (worn !== this.wornDrawn) { const had = this.wornDrawn; this.wornDrawn = worn; if (had || worn.replace(/[/,]/g, '')) this.refreshLooks(); }
    this.updateRestZone();
    for (const a of this.allies) a.update(dt, host);
    if (this.calmFor > 2.5) for (const a of this.fighters) if (a.data.pendingXp) this.allyXp(a);
    // A hero who reached a new form's level transforms once things are calm (after the battle that took them there).
    if (this.calmFor > 1.2 && !this.battle.active && this.fieldFree()) this.nextEvolution();
    // Condensed hero bars (Settings → HUD): the hero's card leads the party's.
    const pr = this.progress;
    const heroEls = this.heroAffinity(0).elements;
    this.hud.setHeroElements(heroEls);
    const leadId = mainHero(this.db).id, leadWeather = this.weatherStates.get(leadId) ?? null, leadRumble = this.rumbling(leadId);
    this.hud.setHeroWeather(this.settings.hud?.stats?.compact ? null : leadWeather, !this.settings.hud?.stats?.compact && leadRumble);
    this.hud.setHeroTint(this.hpTint(0));
    this.hud.setHeroDrying(this.settings.hud?.stats?.compact ? null : this.drying.get(leadId) ?? null);
    this.hud.setHeroAilment(this.settings.hud?.stats?.compact || this.stats.hp <= 0 ? null : this.ailmentPill(0) ?? null, this.settings.hud?.stats?.compact ? null : this.goodPill(0));
    const heroCard = this.settings.hud?.stats?.compact ? [{ name: mainHero(this.db).name, level: pr.level, face: this.portraitUrl ?? '', hp: this.stats.hp, maxHp: this.stats.cfg.max.hp, mp: this.stats.mp, maxMp: this.stats.cfg.max.mp, xp: pr.xp, toNext: pr.maxed ? 0 : pr.toNext, down: false, elements: heroEls, weather: leadWeather, rumble: leadRumble, tint: this.hpTint(0), ailment: this.ailmentPill(0), good: this.goodPill(0), drying: this.drying.get(leadId) ?? null, gender: mainHero(this.db).gender }] : [];
    // The party's cards: the others of the three fighting (whoever leads the map).
    const cards = this.activeWhos().filter((w) => w > 0).map((w) => this.members()[w - 1]).filter((x) => !!x);
    this.hud.setParty([...heroCard, ...cards.map(({ data: d, def }) => { const n = this.allyNumbers(d, def); return { name: def.name, level: d.level, face: def.face ? this.resolveFile(def.face) : this.memberPortrait(def), hp: d.hp, maxHp: n.max.hp, mp: d.mp, maxMp: n.max.mp, xp: d.xp, toNext: xpToNext(this.combatCfg, d.level), down: !!d.down, elements: this.heroAffinity(this.members().findIndex((x) => x.data === d) + 1).elements, weather: d.down ? null : this.weatherStates.get(def.id) ?? null, rumble: this.rumbling(def.id), tint: d.down ? null : this.hpTint(this.members().findIndex((x) => x.data === d) + 1), ailment: this.ailmentPill(this.members().findIndex((x) => x.data === d) + 1), good: this.goodPill(this.members().findIndex((x) => x.data === d) + 1), drying: this.drying.get(def.id) ?? null, gender: def.gender }; })]);
  }

  /** The fight is over: a party member's EXP from it (and a level-up, if it came). */
  private allyXp(a: Ally): void {
    const n = a.data.pendingXp ?? 0;
    delete a.data.pendingXp;
    if (n <= 0) return;
    const sk = this.combatCfg.pointsPerLevel;
    const ups = memberGainXp(a.data, n, this.combatCfg, levelGains(ranksOf(a.def.ranks, a.data.statRanks, this.wornGear(a.data.equip))), sk);
    this.overlay.float(`+${n} EXP`, a.x, a.y + 1.5, a.z, 'xp');
    this.log.add(`${a.def.name} +${n} EXP`, 'xp');
    if (!ups) return;
    this.log.add(`${a.def.name} reached level ${a.data.level}!${ups * sk ? ` +${ups * sk} skill point${ups * sk === 1 ? '' : 's'}` : ''}`, 'level');
    this.audio.play('levelUp', a.x, a.z);
    this.bursts.spawn(a.x, a.y + 0.6, a.z, { color: '#ffe48a', n: 22, speed: 1.4, up: 3, life: 0.9, size: 0.08, gravity: 2, additive: true });
  }

  private allyHostCache: AllyHost | null = null;
  private allyHost(): AllyHost {
    const g = this;
    return (this.allyHostCache ??= {
      get map() { return g.map; },
      trailPoint: (d) => this.trailPoint(d),
      get leader() { return g.player.position as unknown as { x: number; y: number; z: number }; },
      get hidden() { return !!g.riding; },
      get calm() { return g.calmFor > 3; },
      get regenHp() { return !g.stats.cfg.noRegen.hp; },
      get regenMp() { return !g.stats.cfg.noRegen.mp; },
      numbers: (m, def) => this.allyNumbers(m, def),
      float: (t, x, y, z, k) => this.overlay.float(t, x, y, z, k),
      sound: (n, x, z) => this.audio.play(n === 'swing' ? 'swing' : n === 'heal' ? 'ringOn' : n, x, z),
      log: (t) => this.log.add(t, 'info'),
      jumps: () => this.jumpMarks,
      sparkle: (x, y, z, color) => this.bursts.spawn(x, y, z, { color, n: 14, speed: 1, up: 2, life: 0.6, size: 0.08, additive: true }),
    });
  }

  /** What a party member fights with: their stats and gear, like the hero's (no skill-tree bonuses). */
  /** A party member's own skill tree (ranks they've learned). */
  memberSkills(m: MemberData): Skills {
    m.skills ??= {};
    let s = this.memberSkillCache.get(m.id);
    if (!s || s.ranks !== m.skills || s.data !== this.skills.data) { s = new Skills(this.skills.data, m.skills); this.memberSkillCache.set(m.id, s); }
    s.shared = this.partySkills;
    return s;
  }
  private readonly memberSkillCache = new Map<string, Skills>();

  private allyNumbers(m: MemberData, def: HeroDef): AllyNumbers {
    const sk = this.memberSkills(m), pct = (k: Parameters<Skills['get']>[0]) => 1 + sk.get(k) / 100;
    const t = heroTotals(m.stats, this.statGear(m.equip, m.abilities, sk), (k) => sk.get(k) + this.goodBonus(m.id, k));
    const g = (slot: EquipSlot) => (m.equip[slot] ? this.items.get(m.equip[slot]!) : undefined);
    const w = g('weapon'), cls = w?.weapon && w.weapon.class !== 'bow' ? w.weapon.class : 'unarmed';
    const ct = this.combatCfg.classes[cls];
    const classPct = cls === 'light' ? pct('lightDamage') : cls === 'medium' ? pct('mediumDamage') : cls === 'heavy' ? pct('heavyDamage') : 1;
    const melee = (cls === 'unarmed' ? this.combatCfg.unarmedDamage : w!.weapon!.damage) * ct.damage * powerMultiplier(t.attrs.str) * pct('meleeDamage') * classPct * this.weaponSkill(sk, m.abilities, w);
    // A learned spell readied for the field takes the place of a spell shard.
    const bowDef = g('ranged'), shard = this.readiedSpell(m.abilities ?? {}) ?? g('magic');
    const base = playerConfig(this.db.stats).max;
    return {
      max: { hp: Math.max(1, base.hp + sk.get('maxHp') + enduranceHp(t.attrs.end)), mp: base.mp + sk.get('maxMp'), sp: base.sp + sk.get('maxSp') },
      melee, meleeElement: w?.element ?? 'neutral', meleeInflicts: w?.inflicts,
      swing: SWING_TIME / (ct.speed * speedMultiplier(t.attrs.dex)),
      bow: bowDef?.weapon ? bowDef.weapon.damage * powerMultiplier(t.attrs.dex) * pct('bowDamage') : 0, bowElement: bowDef?.element ?? 'neutral',
      spell: shard?.spell ? (shard.spell.damage ?? this.combatCfg.fire.damage) * powerMultiplier(t.attrs.mag) * pct('spellDamage') : 0,
      spellMp: Math.round((shard?.spell?.mp ?? this.combatCfg.fire.mp) * (1 - Math.min(75, sk.get('spellCost')) / 100)), spellColor: shard?.spell?.color, spellElement: shard?.element ?? 'neutral',
      heal: Math.round(22 * powerMultiplier(t.attrs.mag)),
      crit: t.crit, armour: t.armour, magicArmour: t.magicArmour,
      elements: def.elements ?? [],
    };
  }

  private confirmQuit(): void {
    this.menu.push('Quit to title?', [
      { label: 'No, keep playing', pick: () => this.menu.back() },
      { label: 'Quit to title', pick: () => this.quitToTitle() },
    ], { note: 'Anything since your last save will be lost.' });
  }

  /** Save slots. From a save point (event command), it closes the whole menu afterwards. */
  private saveFromEvent = false;
  private readonly cloudOff = { x: 0, z: 0 };
  private openSaveScreen(fromEvent: boolean): void {
    this.saveFromEvent = fromEvent;
    this.saveScreen.show('save', () => { if (fromEvent) this.menu.close(); }, 'Saving into a slot replaces what’s there.', this.currentSlot);
  }

  private openLoadScreen(): void {
    // Back on the title with every save deleted: Load Game is greyed out again.
    this.saveScreen.show('load', () => { if (this.onTitle && !this.saves.latest()) this.openTitle(); }, this.onTitle ? '' : 'Progress since your last save will be lost.', this.onTitle ? null : this.currentSlot);
  }

  /** Settings: the same screen from the title's Options and the pause menu. Changes apply at once and are kept. */
  private openSettings(opts: { tabs?: TabGroup; onBack?: () => void } = {}): void {
    const st = this.settings;
    const set = <K extends keyof Settings>(k: K) => (v: Settings[K]) => { st[k] = v; this.applySettings(); this.settingsStore.save(st); };
    const pct = (v: number) => `${v}%`;
    const title = this.onTitle ? titleLabel(this.db.menus, 'options') : pauseLabel(this.db.menus, 'settings');
    const picture = () => this.menu.push('Picture', [
      { label: 'Brightness', slider: { value: Math.round(st.brightness * 100), min: 60, max: 140, step: 5, format: pct, set: (v) => set('brightness')(v / 100) } },
      { label: 'Quality', detail: 'High: sharpest. Balanced and Performance draw fewer pixels and lighter shadows for a steadier frame rate on tablets and older computers. Potato: the lightest the map can be (lower resolution; no shadows, glow, depth of field, swaying plants, drifting clouds, mist or neighbouring maps); battles stay as they are.',
        choice: { value: st.quality ?? 'auto', options: [['auto', 'Automatic'], ['high', 'High'], ['balanced', 'Balanced'], ['performance', 'Performance'], ['potato', 'Potato']], set: (v) => set('quality')(v as Settings['quality']) } },
      { label: 'Moving cloud shadows', detail: 'Cloud shadows drifting over the ground on maps with clouds.', toggle: { value: st.cloudShadows !== false, set: set('cloudShadows') } },
      { label: 'Show frame rate', toggle: { value: !!st.showFps, set: set('showFps') } },
      { label: 'Bloom (glow)', toggle: { value: st.bloom, set: set('bloom') } },
      { label: 'Depth of field', toggle: { value: st.depthOfField, set: set('depthOfField') } },
      { label: 'Shadows', toggle: { value: st.shadows, set: set('shadows') } },
      { label: 'Ambient occlusion', detail: 'Soft shade where the ground meets cliffs, walls and steps (not on characters or props). Off on Performance quality.', toggle: { value: st.ambientOcclusion, set: set('ambientOcclusion') } },
      { label: 'Shadows from lamps and fires', toggle: { value: st.lightShadows, set: set('lightShadows') } },
      { label: 'Detailed lighting', detail: 'Normal maps. Turn off on slower computers.', toggle: { value: st.detailedLighting, set: set('detailedLighting') } },
    ], { note: 'Left / right change a setting.' });
    const sound = () => this.menu.push('Sound', [
      { label: 'Master volume', detail: 'Everything at once.', slider: { value: st.masterVolume, min: 0, max: 100, step: 5, format: pct, set: (v) => { set('masterVolume')(v); this.audio.play('menuOk'); } } },
      { label: 'Music', slider: { value: st.musicVolume, min: 0, max: 100, step: 10, format: pct, set: set('musicVolume') } },
      { label: 'Sound effects', slider: { value: st.soundVolume, min: 0, max: 100, step: 10, format: pct, set: (v) => { set('soundVolume')(v); this.audio.play('item'); } } },
      { label: 'Background sounds', detail: 'Wind, birds, crickets, water…', slider: { value: st.ambienceVolume, min: 0, max: 100, step: 10, format: pct, set: set('ambienceVolume') } },
      { label: 'Menus and text', detail: 'Menu clicks and the letter ticks of messages.', slider: { value: st.uiVolume, min: 0, max: 100, step: 10, format: pct, set: (v) => { set('uiVolume')(v); this.audio.play('menuOk'); } } },
      { label: 'Fanfares and chimes', detail: 'Victory, level up, quests, saving.', slider: { value: st.jingleVolume, min: 0, max: 100, step: 10, format: pct, set: (v) => { set('jingleVolume')(v); this.audio.play('expDing'); } } },
      { label: 'Footsteps', detail: 'The hero’s footsteps, sounding like the ground underfoot.', toggle: { value: st.footsteps, set: set('footsteps') } },
      { label: 'Letter ticks', detail: 'A soft tick as the letters of a message appear.', toggle: { value: st.textTicks !== false, set: (v) => set('textTicks')(v ? undefined : false) } },
    ], { note: 'Left / right change a volume.' });
    const gameplay = () => this.menu.push('Gameplay', [
      { label: 'Window theme', detail: 'How menus, text boxes and the HUD look.', choice: { value: st.uiTheme ?? '', options: [['', `The game’s own (${UI_THEMES.find((t) => t.id === (this.db.menus?.uiTheme ?? 'ember'))?.name ?? 'Ember'})`], ...UI_THEMES.map((t) => [t.id, t.name] as [string, string])], set: (v) => set('uiTheme')(v || undefined) } },
      { label: 'Window opacity', detail: 'How see-through windows are (100%: solid; below, the theme’s texture gives way to its plain colour).', slider: { value: st.windowOpacity ?? 100, min: 30, max: 100, step: 5, format: pct, set: set('windowOpacity') } },
      { label: 'Window colour', detail: 'Tints the windows (a light theme can go dark, a dark one light: pick a text colour to match).', choice: { value: st.windowColor ?? '', options: WINDOW_COLORS, set: (v) => set('windowColor')(v) } },
      { label: 'Text colour', detail: 'The main text in windows (coloured names, items and places keep their colours).', choice: { value: st.windowText ?? '', options: TEXT_COLORS, set: (v) => set('windowText')(v) } },
      { label: 'Frame colour', detail: 'The coloured lines and gems of the window frames (Titan’s red veins turned blue, say).', choice: { value: st.windowAccent ?? '', options: FRAME_COLORS, set: (v) => set('windowAccent')(v) } },
      { label: 'Easy-to-read text', detail: 'Plain, smooth letters instead of the game’s pixel font.', toggle: { value: !!st.easyText, set: (v) => set('easyText')(v || undefined) } },
      { label: 'Text boxes', detail: 'Above or below whoever is talking (as a speech bubble), or fixed on screen.', choice: { value: st.textBox ?? 'above', options: [['above', 'Above speaker'], ['below', 'Below speaker'], ['top', 'Top of screen'], ['bottom', 'Bottom of screen'], ['center', 'Centre of screen']], set: (v) => set('textBox')(v as Settings['textBox']) } },
      { label: 'Text speed', choice: { value: st.textSpeed, options: [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast'], ['instant', 'Instant']], set: (v) => set('textSpeed')(v as Settings['textSpeed']) } },
      { label: 'Adventure log', detail: 'On screen: everything, everything but hits, or nothing. The full log is always in the menu.', choice: { value: st.adventureLog, options: [['all', 'All'], ['noCombat', 'No hits'], ['off', 'Off']], set: (v) => set('adventureLog')(v as Settings['adventureLog']) } },
      { label: 'Always run', detail: 'Hold Run to walk instead.', toggle: { value: st.alwaysRun, set: set('alwaysRun') } },
      { label: 'Tutorial pop-ups', detail: 'Tips the first time something new comes up. Off: they’re still kept in Journal → Tutorials.', toggle: { value: st.tutorials !== false, set: set('tutorials') } },
      { label: 'Sneak / crouch', detail: 'Hold: sneak while the button is held. Toggle: press once to start, again to stop.', choice: { value: st.crouch, options: [['hold', 'Hold'], ['toggle', 'Toggle']], set: (v) => set('crouch')(v as Settings['crouch']) } },
      { label: 'Sprint', detail: 'Hold: run while Shift is held (keyboard). Toggle: press once to start running, again to stop (touch button). On a controller, the Sprint key item (a quick slot) switches running on and off.', choice: { value: st.sprint, options: [['hold', 'Hold'], ['toggle', 'Toggle']], set: (v) => set('sprint')(v as Settings['sprint']) } },
      { label: 'Run with a full stick push', detail: 'Controller: push the stick all the way to run.', toggle: { value: st.stickRun, set: set('stickRun') } },
      { label: 'Tap to walk', detail: 'Tap or click the ground to walk there, or a person to go and talk to them.', toggle: { value: !!st.tapToWalk, set: (v) => { set('tapToWalk')(v || undefined); if (!v) { this.cursor.visible = false; this.moveTarget = null; } } } },
      { label: 'Temperature', choice: { value: st.tempUnit ?? 'F', options: [['F', '°F'], ['C', '°C']], set: (v) => set('tempUnit')(v === 'C' ? 'C' : undefined) } },
      { label: 'Clock', choice: { value: st.clock12 ? '12' : '24', options: [['24', '24-hour'], ['12', '12-hour']], set: (v) => set('clock12')(v === '12') } },
    ], { note: 'Left / right change a setting.' });
    const controls = () => this.controls.show(this.input.current, (b) => { st.bindings = b; st.bindingsVersion = BINDINGS_VERSION; this.applySettings(); this.settingsStore.save(st); }, () => {});
    const hudMenu = () => this.menu.push('HUD', [
      { label: 'Arrange and resize…', detail: 'Move the health bars, clock, weapons and EXP bar; make them bigger or smaller.', pick: () => {
        // On the title the HUD is hidden: show it while arranging.
        if (this.onTitle) { this.hud.setHidden(false); this.log.setHidden(false); this.tracker.setHidden(false); }
        this.arranger.show(this.hud.widgets, st.hud, (l) => { st.hud = Object.keys(l).length ? l : undefined; this.settingsStore.save(st); }, () => { if (this.onTitle) { this.hud.setHidden(true); this.log.setHidden(true); this.tracker.setHidden(true); } });
      } },
      { label: 'Hero bars', detail: 'Long: across the top. Condensed: a card like the party’s (with them).', choice: { value: st.hud?.stats?.compact ? 'compact' : 'long', options: [['long', 'Long'], ['compact', 'Condensed']], set: (v) => piece('stats', { compact: v === 'compact' || undefined }) } },
      { label: 'Show hero bars', toggle: { value: !st.hud?.stats?.hidden, set: (v) => piece('stats', { hidden: v ? undefined : true }) } },
      { label: 'Show party bars', toggle: { value: !st.hud?.party?.hidden, set: (v) => piece('party', { hidden: v ? undefined : true }) } },
      { label: 'Stamina ring', detail: 'A green ring that shows while stamina is used and fades once it’s full.', toggle: { value: !st.hud?.stamina?.hidden, set: (v) => piece('stamina', { hidden: v ? undefined : true }) } },
      { label: 'Mini-map', detail: 'A round map of where you are, under the clock.', toggle: { value: !st.hud?.minimap?.hidden, set: (v) => piece('minimap', { hidden: v ? undefined : true }) } },
      { label: 'Gold', detail: 'Your gold, with a coin, at the bottom left.', toggle: { value: !st.hud?.gold?.hidden, set: (v) => piece('gold', { hidden: v ? undefined : true }) } },
      { label: 'Season picture', detail: 'Blossom, sun, falling leaves or snow behind the clock.', toggle: { value: st.hud?.clock?.art !== false, set: (v) => piece('clock', { art: v ? undefined : false }) } },
      { label: 'Faces', detail: 'Faces beside the hero’s and the party’s bars.', toggle: { value: !!st.hud?.party?.face, set: (v) => { piece('stats', { face: v || undefined }); piece('party', { face: v || undefined }); } } },
      { label: 'Put the HUD back', detail: 'Default places and sizes.', pick: () => { delete st.hud; this.applySettings(); this.settingsStore.save(st); this.menu.notice('HUD reset'); } },
    ]);
    // Change one piece's style (Settings → HUD), keeping where it was put.
    const piece = (w: HudWidget, change: Record<string, unknown>) => {
      const hud = (st.hud ??= {}), p = { ...(hud[w] ?? {}), ...change } as Record<string, unknown>;
      for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
      if (Object.keys(p).length) hud[w] = p; else delete hud[w];
      if (!Object.keys(hud).length) delete st.hud;
      this.applySettings(); this.settingsStore.save(st);
    };
    // Update 141: a picture beside each setting (each page's own), and Save / Load / Quit to Title at the top.
    const page = (icon: string, open: () => void) => () => { this.menu.fillIcon = icon; try { open(); } finally { this.menu.fillIcon = null; } };
    const mm = this.db.menus, anywhere = this.db.saving?.anywhere !== false;
    const system: MenuItem[] = this.onTitle ? [] : [
      { label: 'Save', icon: SET_ICONS.save, detail: anywhere ? undefined : 'Only at save points', disabled: !anywhere || !!mm?.pauseHidden?.saveLoad, pick: () => this.openSaveScreen(false) },
      { label: 'Load', icon: SET_ICONS.load, disabled: !this.saves.latest() || !!mm?.pauseHidden?.saveLoad, pick: () => this.openLoadScreen() },
      ...(mm?.pauseHidden?.quitToTitle ? [] : [{ label: pauseLabel(mm, 'quitToTitle'), icon: SET_ICONS.quit, pick: () => this.confirmQuit() }]),
    ];
    this.menu.push(title, [
      ...system,
      { label: 'Picture', icon: SET_ICONS.picture, pick: page(SET_ICONS.picture, picture) },
      { label: 'HUD', icon: SET_ICONS.hud, detail: 'Arrange and resize', pick: page(SET_ICONS.hud, hudMenu) },
      { label: 'Sound', icon: SET_ICONS.sound, pick: page(SET_ICONS.sound, sound) },
      { label: 'Controls', icon: SET_ICONS.controls, detail: 'Keyboard and controller', pick: controls },
      { label: 'Gameplay', icon: SET_ICONS.gameplay, pick: page(SET_ICONS.gameplay, gameplay) },
      { label: 'Save settings to a file', icon: SET_ICONS.file, detail: 'HUD layout, controls and everything else, to bring to another copy of the game.', pick: () => {
        exportSettings(st, this.db.title || 'game');
        this.menu.notice('Settings file downloaded');
      } },
      { label: 'Load settings from a file…', icon: SET_ICONS.file, detail: 'A file saved with the option above.', pick: () => {
        const r = importSettings();
        if ('needsClick' in r) { this.menu.notice('Click this option, or press Enter on it, to choose a file'); return; }
        r.then((loaded) => {
          if (!loaded) return;
          for (const k of Object.keys(st) as (keyof Settings)[]) delete st[k];
          Object.assign(st, loaded);
          this.applySettings(); this.settingsStore.save(st);
          this.menu.notice('Settings loaded');
        }, (e: Error) => this.menu.notice(e.message));
      } },
      { label: 'Restore defaults', icon: SET_ICONS.restore, detail: 'Everything, controls and HUD too', pick: () => this.menu.push('Are you sure?', [
        { label: 'No, keep my settings', pick: () => this.menu.back() },
        { label: 'Yes, restore the defaults', pick: () => { delete st.bindings; delete st.bindingsVersion; delete st.hud; Object.assign(st, this.settingsStore.defaults()); this.applySettings(); this.settingsStore.save(st); this.menu.back(); this.menu.notice('Settings restored'); } },
      ], { note: 'Every setting goes back to the game’s defaults: graphics, sound, gameplay, your controls and the HUD layout. This can’t be undone.' }) },
    ], { note: 'Settings are yours: they stay the same whichever save is loaded.', ...opts });
  }

  // ---------------------------------------------------------------- tall grass rustling
  /** Props that rustle, by tile; each with its upright matrix and how long it's still shaking. */
  private rustlers = new Map<number, { slot: { mesh: THREE.InstancedMesh; index: number }; pos: THREE.Vector3; scale: THREE.Vector3; t: number; flat?: boolean }[]>();
  private shaking = new Set<{ slot: { mesh: THREE.InstancedMesh; index: number }; pos: THREE.Vector3; scale: THREE.Vector3; t: number; flat?: boolean }>();
  private rustleTiles = new Map<string, number>();
  private rustleCool = 0;

  private findRustlers(): void {
    this.rustlers.clear(); this.shaking.clear(); this.rustleTiles.clear();
    const GRASS = new Set(['crossX', 'crossStar', 'rows', 'thicket']);
    for (const [p, slot] of this.propSlots) {
      const d = this.sprites.def(p.type);
      if (!d) continue;
      const rustles = d.rustle ?? (GRASS.has(d.shape ?? '') && !(d.block?.length) && !d.foot?.solid?.some((r) => r.includes('#')));
      if (!rustles) continue;
      const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3();
      slot.mesh.getMatrixAt(slot.index, m); m.decompose(pos, q, scale);
      const k = Math.floor(p.z) * this.map.w + Math.floor(p.x), list = this.rustlers.get(k) ?? [];
      // Flat-mode props (Update 152) twist where they lie instead of tipping over.
      list.push({ slot, pos, scale, t: 0, flat: !!d.ground }); this.rustlers.set(k, list);
    }
  }

  /** Whoever steps into a tile of tall grass: it shakes and swishes. */
  private updateRustle(dt: number): void {
    this.rustleCool = Math.max(0, this.rustleCool - dt);
    if (this.rustlers.size) {
      const walkers: [string, number, number][] = [['hero', this.motion.x, this.motion.z], ...this.allies.map((a, i) => [`ally${i}`, a.x, a.z] as [string, number, number])];
      for (const [id, x, z] of walkers) {
        const k = Math.floor(z) * this.map.w + Math.floor(x);
        if (this.rustleTiles.get(id) === k) continue;
        this.rustleTiles.set(id, k);
        const list = this.rustlers.get(k);
        if (!list) continue;
        const cur = new THREE.Matrix4();
        // Cut down (shrunk to nothing): it stays gone.
        for (const r of list) { r.slot.mesh.getMatrixAt(r.slot.index, cur); if (Math.abs(cur.elements[5]) < 1e-6) continue; r.t = 0.55; this.shaking.add(r); }
        if (this.rustleCool <= 0) { this.audio.play('rustle', x, z); this.rustleCool = 0.12; }
      }
    }
    if (!this.shaking.size) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
    for (const r of this.shaking) {
      r.t = Math.max(0, r.t - dt);
      const a = Math.sin((0.55 - r.t) * 28) * 0.16 * (r.t / 0.55);
      m.compose(r.pos, q.setFromAxisAngle(r.flat ? Y : Z, r.flat ? a * 0.6 : a), r.scale);
      r.slot.mesh.setMatrixAt(r.slot.index, m);
      r.slot.mesh.instanceMatrix.needsUpdate = true;
      if (r.t <= 0) this.shaking.delete(r);
    }
  }

  /** Push the settings into the renderer, lights and message window. */
  private applySettings(): void {
    const st = this.settings;
    // The window theme, with the game's touches and then the player's.
    const gw = this.db.menus?.window ?? {};
    applyUiTheme(st.uiTheme || this.db.menus?.uiTheme, { opacity: st.windowOpacity < 100 ? st.windowOpacity : gw.opacity, color: st.windowColor || gw.color, text: st.windowText || gw.text, accent: st.windowAccent || gw.accent });
    // Bar colours (Database → Menus → Bars), everywhere.
    const bars = this.db.menus?.bars ?? {}, root = document.documentElement.style;
    for (const k of ['hp', 'mp', 'xp', 'sp'] as const) { if (bars[k]) root.setProperty(`--c-${k}`, bars[k]!); else root.removeProperty(`--c-${k}`); }
    this.hud.staminaSteady = !!this.db.menus?.staminaSteady;
    // Meter and orb styles (Update 126; the older solid / square switches still count).
    const mn = this.db.menus, cl = document.documentElement.classList;
    const fill = mn?.barFill ?? (mn?.barsSolid ? 'flat' : 'gradient'), shape = mn?.barShape ?? (mn?.barsSquare ? 'rect' : 'pill'), orb = mn?.orbStyle ?? 'sphere';
    for (const c of [...cl]) if (/^(bar-fill|bar-shape|orb)-/.test(c)) cl.remove(c);
    cl.add(`bar-fill-${fill}`, `bar-shape-${shape}`, `orb-${orb}`);
    cl.remove('bars-solid', 'bars-square');
    // Potato: everything costly is off, whatever the switches below say.
    const potato = st.quality === 'potato' && !this.stage;
    this.post.settings.bloom = st.bloom && !potato;
    this.post.settings.tiltShift = st.depthOfField && !potato;
    // Ambient occlusion: half-size on High (or Automatic on a computer), quarter-size on Balanced, off on Performance and on Automatic on phones and tablets.
    const q = st.quality ?? 'auto';
    const aoScale = q === 'balanced' ? 4 : 2;
    this.ssao.enabled = st.ambientOcclusion && q !== 'performance' && q !== 'potato' && !(q === 'auto' && this.small);
    if (this.ssao.scale !== aoScale) { this.ssao.scale = aoScale; this.resizeAO(); }
    this.sun.castShadow = st.shadows && !potato;
    // Sharper or lighter picture (quality): the drawing resolution and the sun's shadow detail.
    const sm = st.quality === 'balanced' || st.quality === 'performance' || potato || (st.quality === 'auto' && this.small) ? 1024 : 2048;
    if (this.sun.shadow.mapSize.x !== sm) { this.sun.shadow.mapSize.set(sm, sm); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; }
    if (this.renderer.getPixelRatio() !== Math.min(window.devicePixelRatio || 1, this.pixelCap)) this.resize();
    this.lights?.shadowLights.forEach((l) => (l.castShadow = st.lightShadows && !potato));
    this.rings?.setShadows(st.lightShadows && !potato);
    setNormalMapsEnabled(st.detailedLighting && !potato);
    setTextSpeed(TEXT_SPEEDS[st.textSpeed]);
    if (this.log) { this.log.feed = st.adventureLog; if (st.adventureLog === 'off') this.log.clearFeed(); }
    this.message?.setPlace(st.textBox ?? 'above');
    // The lettering: the game's (Database → Title & menus), or easy-to-read when the player asks for it.
    document.documentElement.dataset.font = st.easyText ? 'smooth' : this.db?.menus?.font ?? 'classic';
    this.input.setBindings(st.bindings ?? DEFAULT_BINDINGS);
    this.audio?.setVolumes({ master: st.masterVolume, music: st.musicVolume, sfx: st.soundVolume, ambience: st.ambienceVolume, ui: st.uiVolume, jingle: st.jingleVolume });
    this.hud?.applyLayout(st.hud);
  }

  /* ------------------------------------------------------------------ title screen */

  private openTitle(): void {
    const m = this.db.menus, hasSave = !!this.saves.latest();
    this.onTitle = true;
    this.audio.music(this.db.audio?.titleMusic ?? 'builtin:title', 1.5);
    this.setTitleLook(true);
    const opt = (o: TitleOption, item: Omit<MenuItem, 'label'>): MenuItem[] => (m?.titleHidden?.[o] ? [] : [{ label: titleLabel(m, o), ...item }]);
    this.menu.close();
    this.menu.push(m?.titleText?.trim() || this.db.title || 'Untitled', [
      ...opt('newGame', { pick: () => this.startNewGame() }),
      ...opt('load', { disabled: !hasSave, pick: () => this.openLoadScreen() }),
      ...opt('options', { pick: () => this.openSettings() }),
      ...opt('credits', { pick: () => this.creditsScreen.show(m?.titleText?.trim() || this.db.title || 'Credits', creditSections(this.db, (id) => this.sprites.weaponDef(id), [...[...this.sprites.catalog.all(), ...this.tiles.all()].map((d) => d.credits ?? []), ...this.wornCredits()]), () => {}) }),
      ...opt('exit', { pick: () => this.exitGame() }),
    ], { canBack: false, style: 'title', subtitle: m?.subtitle ?? '' });
    // Continue is the natural first choice when there's a save; otherwise New Game.
  }

  private leaveTitle(then: () => void): void {
    this.onTitle = false;
    // The HUD stays out of sight while the game loads, and fades in with the picture. The title picture (and no
    // hero) stays until the screen has faded to black.
    document.body.classList.add('ui-dim');
    this.titleLeaving = true;
    this.menu.close();
    then();
  }

  /** A picture or video behind the title (Database → Title & menus), shown on the title and faded away after. */
  private titleBgEl: HTMLImageElement | HTMLVideoElement | null = null;
  /** Leaving the title: its look stays until the transfer's fade to black is complete. */
  private titleLeaving = false;
  private get titleCovered(): boolean {
    const tb = this.db.menus?.titleBackground;
    return this.onTitle && !!tb && ((tb.kind === 'image' && !!tb.image) || (tb.kind === 'video' && !!tb.video));
  }
  private showTitleBackground(on: boolean): void {
    const tb = this.db.menus?.titleBackground;
    const media = tb?.kind === 'image' ? tb.image : tb?.kind === 'video' ? tb.video : undefined;
    if (on && tb && media) {
      if (!this.titleBgEl) {
        const el = tb.kind === 'video' ? Object.assign(document.createElement('video'), { autoplay: true, muted: true, loop: true, playsInline: true }) : document.createElement('img');
        el.className = 'title-bg';
        el.src = this.resolveFile(media);
        if (el instanceof HTMLImageElement) el.alt = '';
        document.body.append(el);
        this.titleBgEl = el;
      }
      this.titleBgEl.classList.remove('gone');
      if (this.titleBgEl instanceof HTMLVideoElement) void this.titleBgEl.play().catch(() => { /* starts after the first click */ });
    } else if (this.titleBgEl) {
      this.titleBgEl.classList.add('gone');
      if (this.titleBgEl instanceof HTMLVideoElement) { const v = this.titleBgEl; setTimeout(() => { if (v.classList.contains('gone')) v.pause(); }, 1300); }
    }
  }

  /** The game is on screen: the HUD fades in. */
  private uiIn(): void { requestAnimationFrame(() => document.body.classList.remove('ui-dim')); }

  /** On the title the hero, status bars and touch buttons are hidden, and the camera drifts slowly. */
  private setTitleLook(on: boolean): void {
    this.showTitleBackground(on);
    this.player.mesh.visible = !on;
    this.hud.setHidden(on);
    this.overlay.setHidden(on);
    this.log.setHidden(on);
    this.tracker.setHidden(on);
    this.touch.setHidden(on);
  }

  /** New Game: character creation first (when it's on), then the game. Backing out returns to the title. */
  private startNewGame(): void {
    const c = creation(this.db);
    if (!c.enabled) { this.leaveTitle(() => this.newGame()); return; }
    this.menu.close();
    const hero = mainHero(this.db);
    this.creation.show({ heroName: hero.name, methods: c.methods, rerolls: c.rerolls, rerollKey: this.input.label('switchWeapon'), defaults: heroBase(hero), ranks: ranksOf(hero.ranks, undefined) },
      (attrs) => this.leaveTitle(() => this.newGame(attrs)),
      () => this.openTitle());
  }

  /** Heroes set to "Set up stats on joining" who've joined and wait to have theirs set up. */
  private setupQueue: string[] = [];

  /** Open stat setup for the next hero waiting (when nothing else is in the way). */
  private nextSetup(): void {
    if (this.creation.isOpen || this.onTitle) return;
    const id = this.setupQueue.shift();
    if (!id) return;
    const m = this.members().find((x) => x.def.id === id);
    if (!m) { this.nextSetup(); return; }
    const c = creation(this.db);
    this.creation.show({ heroName: m.def.name, methods: c.methods, rerolls: c.rerolls, rerollKey: this.input.label('switchWeapon'), defaults: heroBase(m.def), ranks: ranksOf(m.def.ranks, m.data.statRanks, this.wornGear(m.data.equip)), canLeave: false },
      (attrs) => {
        // Their own level 1 stats, grown by their ranks to the level they joined at.
        const g = this.memberGrowth(m);
        for (const k of ATTRS) m.data.stats[k] = Math.min(ATTR_MAX, attrs[k] + g[k] * (m.data.level - 1));
        this.nextSetup();
      });
  }

  /** A fresh game: everything back to the database's starting values (stats from creation), at the player start. */
  private newGame(attrs?: Attrs): void {
    const st = this.db.start;
    this.currentSlot = null;
    this.interpreter.stop();
    this.requestTransfer(this.db.startMap, { x: st.x, z: st.z, dir: st.dir }, 'black', {
      slow: true,
      after: () => { this.uiIn(); this.nextSetup(); this.state.realDay = realDayKey(); this.fireGlobal('newGame'); },
      before: () => {
        this.bankPickups('discard');
        this.log.clearFeed();
        this.state.load({}); this.applyForms();
        this.applyForge();
        this.state.initAbilities(this.db.abilities);
        this.stats.refill();
        this.time.set(this.db.startHour, true);
        this.respawnPoint = null;
        this.playTime = 0;
        this.inventory.load(Inventory.fresh(this.db).toJSON(), this.bagSize);
        // Key items to use (Cut, Bow, a lantern…) start on the free quick slots (Update 132).
        for (const st of this.inventory.slots) {
          const d = st ? this.items.get(st.id) : undefined, k = this.inventory.quick.indexOf(null);
          if (k < 0) break;
          if (d && (d.tool || (d.field && !carriedUse(d.field.use))) && !this.inventory.quick.includes(d.id)) this.inventory.quick[k] = d.id;
        }
        this.progress.load(undefined, attrs ?? this.heroBase());
        this.combat.heroStatus.clear(); this.heroAilments = {};
        this.quests.load(undefined);
        this.startParty();
        this.ensureWornInBag();
        this.syncSkills();
        this.rings.off();
        this.refreshRing();
      },
      fresh: true,
    });
  }

  private quitToTitle(): void {
    this.battle.abort();
    this.battleSound = null; this.outro = null;
    if (this.pauseShell.isOpen) this.closePause();
    this.menu.close();
    this.interpreter.stop();
    // Back to the start map behind the title, everything reset (New Game or Load picks up from here).
    const st = this.db.start;
    // Back to the map behind the title (its own, or the start map).
    const tb = this.db.menus?.titleBackground, titleMap = tb?.kind === 'map' && tb.map ? tb.map : this.db.startMap;
    this.requestTransfer(titleMap, titleMap === this.db.startMap && !(tb?.kind === 'map' && tb.map) ? { x: st.x, z: st.z, dir: st.dir } : { x: tb?.x ?? 0.5, z: tb?.z ?? 0.5 }, 'black', {
      slow: true,
      before: () => { this.bankPickups('discard'); this.log.clearFeed(); this.state.load({}); this.applyForms(); this.applyForge(); this.state.initAbilities(this.db.abilities); this.stats.refill(); this.time.set(this.db.startHour, true); this.respawnPoint = null; this.playTime = 0; this.inventory.load(Inventory.fresh(this.db).toJSON(), this.bagSize); this.progress.load(undefined, this.heroBase()); this.combat.heroStatus.clear(); this.heroAilments = {}; this.quests.load(undefined); this.party.load(undefined); this.heroAt = 0; this.visited.clear(); this.explored.clear(); this.syncSkills(); this.rings.off(); this.refreshRing(); },
      fresh: true,
      after: () => this.openTitle(),
    });
  }

  /** Exit: closes the window when the browser allows it (a desktop build will quit). */
  private exitGame(): void {
    window.close();
    // Browsers only let scripts close tabs they opened; if we're still here, say so.
    window.setTimeout(() => this.menu.notice('You can close this tab now.', 4), 150);
  }

  private updateDying(dt: number): boolean {
    if (!this.dying) return false;
    this.dying += dt;
    if (this.drowning) {
      // Sinking: down below the surface, bubbles rising, the water closing over.
      const m = this.motion, w = this.map.footWaterAt(Math.floor(m.x), Math.floor(m.z));
      if (w && m.y > w.surface - 1.6) m.y -= dt * 0.9;
      this.syncPlayer();
      if (w && Math.random() < dt * 9) this.bursts.spawn(m.x + (Math.random() - 0.5) * 0.3, w.surface + 0.02, m.z, { color: '#dff4ff', n: 2, speed: 0.3, up: 1.2, life: 0.5, size: 0.05, gravity: -1 });
      if (w && Math.random() < dt * 2) this.ripples.spawn(m.x, w.surface, m.z, 0.7, 0.5);
    }
    if (this.fade.t >= 1 && this.dying > 0.7) {
      // Back to the last respawn point used, or the player start, with everything refilled.
      this.dying = 0;
      this.drowning = false;
      this.clearLingering(['all']);
      this.player.clearAction();
      this.stats.refill();
      const r = this.respawnPoint ?? { map: this.db.startMap, x: this.db.start.x, z: this.db.start.z, dir: this.db.start.dir };
      this.requestTransfer(r.map, { x: r.x, z: r.z, dir: r.dir }, 'none');
      this.post.fade = 1;
      this.transferFadeIn = true;
    }
    return true;
  }

  /** Put the sprite where the motion says, squashed down while crawling. */
  private readonly rideTmp = new THREE.Vector3();
  private syncPlayer(dt = 0): void {
    const m = this.motion, p = this.player.position;
    p.set(m.x, m.y, m.z);
    // Riding (Update 115): up in the saddle, up the leaning sprites (so it shows from a high camera too), and a nudge
    // toward the camera so the rider draws over the horse, except facing down, where the horse's head is in front.
    if (this.state.horse?.mounted) {
      const lean = leanNow(), dir = this.player.dir, up = dir === 'left' || dir === 'right' ? 0.8 : dir === 'down' ? 0.72 : 0.62;
      p.y += up * Math.cos(lean); p.z -= up * Math.sin(lean);
      const toCam = this.rideTmp.copy(this.camera.position).sub(p).normalize().multiplyScalar(dir === "down" ? -0.6 : 0.6);
      p.add(toCam);
      void SEAT;
    }
    this.crouch += ((m.crawling ? 1 : this.combat.sneaking ? 0.3 : 0) - this.crouch) * (dt ? 1 - Math.exp(-dt * 14) : 1);
    this.player.mesh.scale.set(1 + this.crouch * 0.12, 1 - this.crouch * 0.42, 1);
    this.touch?.update((a) => this.state.has(a));
  }

  private updateFade(dt: number): void {
    const f = this.fade;
    if (f.t >= 1) {
      if (this.fadeColorReset) { this.fadeColorReset = false; this.post.fadeColor = 0x000000; }
      return;
    }
    f.t = Math.min(1, f.t + dt / f.duration);
    this.post.fade = f.from + (f.to - f.from) * f.t;
  }

  private readonly projected = new THREE.Vector3();
  /** A point in the world to a point on screen (CSS pixels), and whether it's in view. */
  private readonly projector = (x: number, y: number, z: number) => {
    const v = this.projected.set(x, y, z).project(this.camera), r = this.canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * r.width + r.left, y: (1 - v.y) / 2 * r.height + r.top, on: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
  };
  private readonly titleFocus = new THREE.Vector3();
  /** Database → Camera, with the defaults filled in. */
  private get overworldCam(): Required<OverworldCamera> {
    const c = this.db.overworldCamera ?? {}, d = DEFAULT_OVERWORLD_CAMERA;
    return { pitch: clamp(c.pitch ?? d.pitch, 20, 90), distance: clamp(c.distance ?? d.distance, 6, 40), fov: clamp(c.fov ?? d.fov, 15, 70), lean: clamp(c.lean ?? d.lean, 0, 100) };
  }
  private readonly camOffset = new THREE.Vector3();
  /** Where the map camera sits from what it looks at (its angle and distance). */
  private cameraOffset(): THREE.Vector3 {
    // Just short of straight down (Update 143): exactly 90° leaves the camera no way to tell which way is up.
    const c = this.overworldCam, p = THREE.MathUtils.degToRad(Math.min(c.pitch, 89.5));
    return this.camOffset.set(0, Math.sin(p) * c.distance, Math.cos(p) * c.distance);
  }

  /**
   * Update 160: a game tile's picture for a 3D map's ter_… material, by the tile's id or name ("grass", "tall_grass"):
   * your own picture when it has one (the first frame of an animated tile, the middle of an autotile), else the
   * built-in art.
   */
  private terrainPicture(name: string): { image: CanvasImageSource; span: number; point: boolean } | null {
    const norm = (t: string) => t.toLowerCase().replace(/[\s-]+/g, '_');
    const n = norm(name), def = this.tiles.all().find((t) => norm(t.id) === n || norm(t.name) === n);
    if (!def) { console.warn(`3D map: no tile called “${name}” for its ter_${name} material`); return null; }
    const tt = this.tileTextures.get(def.key);
    if (!tt) return { image: builtinTileArt(def.key), span: 1, point: true };
    const img = tt.map.image as HTMLCanvasElement;
    if (!def.kind) return { image: img, span: Math.max(1, def.span || 1), point: def.filter !== 'smooth' };
    // An animated tile's first frame; an autotile's or wall's inside (its middle half-tiles).
    const l = frameLayout(def, img.width, img.height), c = document.createElement('canvas');
    const [sx, sy, sw, sh] = def.kind === 'animated' ? frameRect(img.width, img.height, l, 0)
      : def.layout === 'frame' ? [img.width / (def.frameTiles ?? 2) / 2, img.height / (def.frameTiles ?? 2) / 2, img.width / (def.frameTiles ?? 2), img.height / (def.frameTiles ?? 2)]
      : [img.width / l.frames / 4, def.kind === 'wall' ? img.height / 4 : img.height / 2, img.width / l.frames / 2, def.kind === 'wall' ? img.height / 2 : img.height / 3];
    c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
    c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return { image: c, span: 1, point: true };
  }

  /** 3D maps (Update 154): the hero's body this frame, from screen-relative directions; as a MotionResult. */
  private move3D(dt: number, dx: number, dz: number, run: boolean, jump: boolean, scale: number): { moving: boolean; blocked: boolean; fell: boolean; face: null; jumped?: boolean } {
    const w = this.w3!, sp = this.motion.speeds, [wx, wz] = w.cam.toWorld(dx, dz);
    const r = w.body.update(dt, { dx: wx, dz: wz, speed: (run ? sp.run : sp.walk) * scale, swimSpeed: sp.swim * scale, jump });
    const m = this.motion;
    m.x = w.body.pos.x; m.y = w.body.pos.y; m.z = w.body.pos.z;
    m.running = run && r.moving;
    if (r.moving) w.heading = Math.atan2(wx, wz);
    if (r.splash) this.audio.play('splash', m.x, m.z);
    if (r.respawned) this.fade = { from: 0.7, to: 0, t: 0, duration: 0.6 };
    w.moving = r.moving ? [wx, wz] : null;
    return { moving: r.moving, blocked: false, fell: r.respawned, face: null, jumped: r.jumped };
  }

  private updateCamera(dt: number): void {
    // Update 154: a 3D map: upright sprites turned to the camera, the camera orbiting the hero.
    if (this.w3 && !this.stage) { this.updateCamera3D(dt); return; }
    // Sprites lean back to face the map camera (upright on battle maps, where the camera goes all round).
    setLean(this.stage ? 0 : THREE.MathUtils.degToRad(this.overworldCam.pitch) * this.overworldCam.lean / 100);
    const twoD = !this.stage && this.db.viewMode === '2d';
    setView2D(twoD, this.db.playerLayer ?? 10);
    setBody2D(twoD);
    // Update 152: tile-by-tile steps in 2D mode, like RPG Maker (unless the game walks freely).
    this.motion.grid = twoD && !this.db.freeMove2D;
    // 2D: nothing comes near the camera, so its near plane moves close to the ground for finer depth (layers, sorting).
    const near = twoD ? Math.max(0.5, this.overworldCam.distance * 0.4) : 0.5;
    if (this.camera.near !== near) { this.camera.near = near; this.camera.updateProjectionMatrix(); }
    if (this.stage) { this.updateStageCamera(dt); return; }
    // A griffin flight: further back and higher, following the griffin.
    if (this.flight) {
      const t = this.camTarget;
      t.lerp(this.player.position, 1 - Math.exp(-dt * 4));
      this.camera.position.copy(t).addScaledVector(CAMERA_OFFSET, 1.5);
      this.camera.lookAt(t.x, t.y - 1, t.z);
      this.post.focus = 0.5;
      this.sun.target.position.copy(t);
      this.sun.position.copy(t).addScaledVector(this.time.sunDir, 30);
      return;
    }
    const t = this.camTarget;
    if (this.onTitle || this.titleLeaving) {
      // Drift slowly across the map behind the title.
      const a = this.elapsed * 0.05, tb = this.db.menus?.titleBackground;
      // Its own map: a slow look around the chosen spot; otherwise a drift across the map.
      if (tb?.kind === 'map' && tb.map) this.titleFocus.set((tb.x ?? this.map.w / 2) + Math.sin(a * 2) * 2, this.map.surfaceY(tb.x ?? 0, tb.z ?? 0), (tb.z ?? this.map.h / 2) + Math.cos(a * 1.4) * 1.2);
      else this.titleFocus.set(this.map.w / 2 + Math.sin(a) * this.map.w * 0.3, this.player.position.y, this.map.h / 2 + Math.cos(a * 0.7) * this.map.h * 0.2);
      t.lerp(this.titleFocus, 1 - Math.exp(-dt * 0.8));
    } else t.lerp(this.player.position, 1 - Math.exp(-dt * 5));
    // The view stays inside the map, except toward seamless sides (the next map is there to see).
    const o = this.openSides;
    t.x = clamp(t.x, o.has('w') ? -1e4 : 7, o.has('e') ? 1e4 : this.map.w - 7);
    t.z = clamp(t.z, o.has('n') ? -1e4 : 5, o.has('s') ? 1e4 : this.map.h - 2);
    this.camera.position.copy(t).add(this.cameraOffset());
    this.camera.lookAt(t.x, t.y + 0.6, t.z);
    // Sleeping: the camera lifts and tilts up to the sky (smoothly in, and back down after).
    const k = this.sleepLook;
    if (k > 0) {
      const e = k * k * (3 - 2 * k);
      this.camera.position.y += e * 1.5; this.camera.position.z -= e * 4;
      // Toward Saturn (and the moon and stars around it).
      this.skyAim.copy(this.camera.position).addScaledVector(SATURN_DIR, 40);
      this.skyLook.set(t.x, t.y + 0.6, t.z).lerp(this.skyAim, e);
      this.camera.lookAt(this.skyLook);
    }
    const sh = this.combat.shake + (this.bodyShake > 0 ? 0.09 * Math.min(1, this.bodyShake / 0.35) : 0);
    if (sh > 0) this.camera.position.add(this.projected.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0));
    // Keep the player in the sharp band of the tilt-shift.
    this.projected.copy(this.player.position);
    this.projected.y += 0.7;
    this.projected.project(this.camera);
    this.post.focus = clamp(this.projected.y * 0.5 + 0.5, 0.25, 0.75);
    this.post.focusBand = 1;
    // Looking (nearly) straight down, everything is the same distance away: no tilt-shift blur (Update 143).
    this.post.tiltFade = Math.max(this.sleepLook, clamp((this.overworldCam.pitch - 70) / 15, 0, 1));
    // The sun's shadow camera follows the view so shadows stay sharp.
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).addScaledVector(this.time.sunDir, 30);
  }

  /** The camera on a 3D map (Update 154), and characters drawn as pictures turned to face it. */
  private updateCamera3D(dt: number): void {
    const w = this.w3!, i = this.input;
    setLean(0); setView2D(false, 10); setBody2D(false); this.motion.grid = false;
    // Its own lens: a normal field of view and a near plane close in (the 2D camera's narrow view and far near plane
    // would hide everything near the hero).
    if (this.camera.fov !== 55 || this.camera.near !== 0.1 || this.camera.far !== 400) { this.camera.fov = 55; this.camera.near = 0.1; this.camera.far = 400; this.camera.updateProjectionMatrix(); }
    if (i.rstick.x || i.rstick.y) w.cam.turn(-i.rstick.x * dt * 2.6, i.rstick.y * dt * 1.8);
    w.cam.update(dt, this.camera, this.player.position, w.moving ?? null);
    // A sprite hero shows the side the camera sees; a 3D model turns to the way they're heading.
    const yaw = w.cam.yaw, rel = w.heading - yaw;
    if (this.player.rig) this.player.faceVector(Math.sin(w.heading), Math.cos(w.heading));
    else { this.player.faceVector(Math.sin(rel), Math.cos(rel)); this.player.mesh.rotation.y = yaw; }
    for (const a of this.allies) {
      if (!a.sprite.rig) a.sprite.mesh.rotation.y = yaw;
      // The party stands on the scene's floors (their trail is laid on the tile grid).
      const p = a.sprite.mesh.position, y = w.body.groundBelow(p.x, p.y + 2.5, p.z);
      if (y !== null) p.y = y;
    }
    for (const e of this.events) if (e.visual) e.visual.rotation.y = yaw;
    // Monsters drawn as pictures turn to the camera too.
    for (const e of this.combat.enemies) if (!e.rigged) e.visual.rotation.y = yaw;
    this.camTarget.copy(this.player.position);
    this.post.focus = 0.5; this.post.focusBand = 1; this.post.tiltFade = 1;
    // Waterfalls run down their planes.
    for (const f of w.scene.falls) { const mt = f.mesh.material as THREE.MeshStandardMaterial; if (mt.map) { if (mt.map.wrapT !== THREE.RepeatWrapping) { mt.map.wrapT = THREE.RepeatWrapping; mt.map.needsUpdate = true; } mt.map.offset.y += dt * 0.9; } }
    const t = this.camTarget;
    this.sun.target.position.copy(t);
    this.sun.position.copy(t).addScaledVector(this.time.sunDir, 30);
  }

  /** Whose weather this map shows: the shared outdoor weather, its zone's, or its own. */
  private weatherKey(): string {
    const d = this.mapData;
    if (!(d.uniqueWeather ?? d.weather !== undefined)) return WORLD_WEATHER;
    return d.weatherZone?.trim() ? `zone:${d.weatherZone.trim()}` : `map:${this.mapName}`;
  }

  /**
   * This map's weather and breeze. Outdoor maps share one weather (set in the Database, changed by events) unless
   * they have Unique weather; indoor and dark maps show none unless they do.
   */
  private mapWeather(): { kind: WeatherKind; amount: number; wind: number; dir: number } {
    const d = this.mapData, outdoor = (d.environment ?? 'outdoor') === 'outdoor', key = this.weatherKey(), shared = key === WORLD_WEATHER;
    // An event's change (saves from before sharing kept it under the map's name).
    const o = this.state.weather.get(key) ?? (shared ? undefined : this.state.weather.get(this.mapName));
    const start = shared ? this.db.weather : d.weather;
    const show = !shared || outdoor;
    // The shared outdoor weather changes by itself (Database → Weather); an event's change lasts until it next does.
    const dyn = shared && outdoor ? this.dynamicWeather() : null;
    const ov = dyn && o && o.spell !== dyn.spell ? undefined : o;
    const kind = show ? ov?.kind ?? dyn?.kind ?? start?.kind ?? 'none' : 'none';
    const amount = kind === 'none' ? 0 : ov ? ov.amount ?? 1 : dyn ? dyn.amount : start?.amount ?? 1;
    const wind = (show ? o?.wind : undefined) ?? d.wind?.strength ?? (outdoor ? 0.3 : 0);
    // A battle's own weather (a spell's Rain, say) shows in place of the map's while the battle lasts.
    if (this.battleSky) { const sky: WeatherKind = this.battleSky === 'sun' ? 'none' : this.battleSky; return { kind: sky, amount: sky === 'none' ? 0 : 1, wind: Math.max(wind, sky === 'storm' || sky === 'blizzard' || sky === 'sandstorm' ? 0.7 : 0), dir: d.wind?.dir ?? 15 }; }
    return { kind, amount, wind, dir: d.wind?.dir ?? 15 };
  }

  private updateWeather(dt: number): void {
    const w = this.mapWeather(), potato = this.settings.quality === 'potato' && !this.stage;
    // Potato: plants stand still (the sway is frozen; weather still drifts in the breeze).
    updateWind(potato ? 0 : this.elapsed, potato ? 0 : w.wind, w.dir);
    if (this.weatherPending && this.level) {
      this.weatherPending = false;
      this.weather.attach(this.level, w.kind, w.amount, this.camTarget);
      this.atmosphere.attach(this.level, this.camTarget);
    }
    // Dynamic weather: when the spell changes, the old weather fades out as the new comes in.
    if (!this.weatherPending && (w.kind !== this.weather.kind || Math.abs(w.amount - this.weather.amount) > 0.05)) {
      this.weather.set(w.kind, w.amount, this.stage ? this.stage.look : this.camTarget);
      if (w.kind !== this.lastWeatherKind && !this.onTitle && this.lastWeatherKind && !this.battle.active) this.log.add(weatherLine(w.kind), 'info');
    }
    this.lastWeatherKind = w.kind;
    this.updateClimate(dt);
    // In a battle on a battle map, the weather falls around the battle.
    const center = this.stage ? this.stage.look : this.camTarget, ground = this.stage ? this.stage.map : this.map;
    this.weather.update(dt, center, this.elapsed, (x, z) => ground.surfaceY(x, z));
    // Rain dims the day; a sandstorm closes in the view.
    const rain = this.weather.rain, haze = this.weather.haze, mist = this.weather.mist;
    this.time.gloom = Math.min(1.3, rain + mist * 0.4);
    this.time.haze = haze;
    this.time.mist = mist;
    this.updateLightning(dt);
    const air = this.stage?.stage.data.atmosphere ?? this.mapData.atmosphere, outdoor = this.time.environment === 'outdoor';
    const thick = Math.min(1, Math.max(air?.haze ?? 0, outdoor ? haze * 0.75 + rain * 0.25 + mist * 0.7 : 0));
    // A battle stage is small and seen from close by: the fog starts further out so the sky and the scenery around
    // it show (it read as a grey wall before update 93).
    // Update 159: a 3D map is seen from the hero's shoulder, out to the horizon: the fog starts far further out.
    const reach = this.stage ? 1.8 : this.w3 ? 3.6 : 1;
    // A camera set further back than the default pushes the fog back with it (Update 143: the top-down camera).
    const back = this.stage || this.w3 ? 0 : Math.max(0, this.overworldCam.distance - DEFAULT_OVERWORLD_CAMERA.distance);
    this.fog.near = (22 - 16 * thick) * reach + back;
    this.fog.far = (50 - 30 * thick) * reach + back;
    // Mist (perhaps only around dawn or after dark) and sun rays (only while the sun is out).
    const hour = this.time.hour, night = this.time.night;
    const when = air?.mistWhen ?? 'always';
    const mistTime = when === 'morning' ? clamp(1 - Math.abs(hour - 6.5) / 3, 0, 1) : when === 'night' ? night : 1;
    const sun = outdoor ? clamp(this.sun.intensity / 1.5, 0, 1) * (1 - night) * (1 - 0.9 * rain) * (1 - 0.8 * haze) : this.time.environment === 'indoor' ? (1 - night) * 0.6 : 0;
    // Rays slant no flatter than about 30° (a low dawn sun would otherwise lay them along the ground).
    this.sunUp.copy(this.time.sunDir); this.sunUp.y = Math.max(this.sunUp.y, 0.55); this.sunUp.normalize();
    // Cloud shadows: drifting with the wind (at least a slow crawl on a still day).
    const cl = outdoor && this.settings.cloudShadows !== false && !potato ? air?.clouds ?? 0 : 0;
    if (cl > 0) {
      const speed = 0.35 + wind.strength * 1.6;
      this.cloudOff.x -= wind.dx * speed * dt; this.cloudOff.z -= wind.dz * speed * dt;
    }
    // A canopy sways in place instead of drifting by; beams slide slowly.
    const kind = air?.shadowKind ?? 'clouds';
    const sway = kind === 'canopy' ? { x: Math.sin(this.elapsed * 0.8) * 0.12 * (0.3 + wind.strength), z: Math.cos(this.elapsed * 0.6) * 0.08 * (0.3 + wind.strength) } : this.cloudOff;
    setClouds(sway.x, sway.z, Math.min(0.85, cl * 0.7) * (outdoor ? clamp(this.sun.intensity / 1.5, 0, 1) * (1 - night) * (1 - 0.7 * rain) : 0), kind);
    this.atmosphere.update(dt, center, this.elapsed, (x, z) => ground.surfaceY(x, z), {
      mist: potato ? 0 : (air?.mist ?? 0) * mistTime, rays: potato ? 0 : air?.rays ?? 0, skyColor: this.fog.color, sunColor: this.sun.color, sun, sunDir: this.sunUp,
    }, this.camera);
  }

  private updateEnvironment(dt: number): void {
    this.updateWeather(dt);
    const night = this.time.night;
    this.lights.update(dt, this.elapsed, night, this.state);
    this.updateRustle(dt);
    if (this.stage) {
      this.stage.lights.update(dt, this.elapsed, night, this.state);
      for (const f of this.stage.built.waterFlows) {
        const fd = THREE.MathUtils.degToRad(f.flowDir);
        f.tex.offset.x += (0.03 - Math.cos(fd) * f.flow * 0.45) * dt;
        f.tex.offset.y += (0.018 - Math.sin(fd) * f.flow * 0.45) * dt;
      }
    }
    // Outside, windows light up at night; inside they show daylight and go dark at night.
    const env = this.time.environment;
    setSpriteGlow(env === 'outdoor' ? scheduleFactor('night', this.time.glow) : this.time.glow);
    this.fireflies.update(this.elapsed, env === 'outdoor' ? night : 0);
    this.rings.reach = 1 + (this.skills?.get('lightReach') ?? 0) / 100;
    this.rings.update(dt, this.player.position, this.player.dir, !this.onTitle, this.elapsed);
    this.bursts.update(dt);
    this.updateCharring(dt);
    this.updateSeason();
    this.ripples.update(dt);
    // Spray where waterfalls land (near the hero only).
    const hp = this.player.position;
    for (const f of this.fallFeet) {
      if (Math.abs(f.x - hp.x) > 14 || Math.abs(f.z - hp.z) > 12 || Math.random() > dt * 6) continue;
      this.bursts.spawn(f.x + (Math.random() - 0.5) * 0.7, f.y + 0.05, f.z + (Math.random() - 0.5) * 0.4, { color: '#eef8ff', n: 3, speed: 0.9, up: 1.6, life: 0.7, size: 0.07, gravity: 3 });
    }
    // The water's ripples drift; a flowing river or stream carries them along its current.
    this.waterFlow.x += 0.03 * dt; this.waterFlow.y += 0.018 * dt;
    this.waterNormals.offset.set(this.waterFlow.x, this.waterFlow.y);
    // Each style's ripples: a gentle drift, carried along by its current (a river, a stream).
    tickPixelTiles(this.elapsed);
    for (const f of this.waterFlows) {
      const fd = THREE.MathUtils.degToRad(f.flowDir);
      f.tex.offset.x += (0.03 - Math.cos(fd) * f.flow * 0.45) * dt;
      f.tex.offset.y += (0.018 - Math.sin(fd) * f.flow * 0.45) * dt;
    }
    toonWaterTime.value = this.elapsed;
    this.post.exposure = this.time.exposure * 1.1 * this.settings.brightness * (1 + this.lightFlash * 1.8);
    this.updateSky(dt);
  }

  /* ---------------------------------------------------------------- weather and temperature */

  private climateCache: { src: unknown; cfg: ClimateConfig } | null = null;
  private get climate(): ClimateConfig {
    let c = this.climateCache;
    if (!c || c.src !== this.db.climate) c = this.climateCache = { src: this.db.climate, cfg: climateConfig(this.db.climate) };
    return c.cfg;
  }
  /** An event's change of temperature on this map (cleared on leaving it). */
  private tempHere: { op: 'set' | 'add'; value: number } | null = null;
  private lastWeatherKind: WeatherKind | '' = '';
  /** Weather a spell set in this battle (shown around the battle until it ends), or null. */
  private battleSky: BattleWeather | null = null;
  /** How wet the ground is (rain soaks it; it dries over a couple of game hours), and the frost and heat shown. */
  private wet = 0;
  private frost = 0;
  private heat = 0;

  /** The season the climate follows on a day (a map's own season, the playtest pick, or the calendar's). */
  private climateSeason(day: number, onMap = true): Season {
    if (onMap && this.mapData?.season) return this.mapData.season;
    if (this.seasonTest) return this.seasonTest;
    if (this.state.seasonPick) return this.state.seasonPick as Season;
    const cfg = this.db.time?.seasons;
    if (cfg?.off || (cfg?.mode ?? 'real') !== 'days') return realSeason(new Date(), cfg?.mode === 'realSouth');
    return seasonOn(day, cfg);
  }

  /** The outdoor temperature now from the season and the hour alone (°F). */
  private baseTemp(onMap = true): number {
    const day = Math.floor(this.state.clock / 24);
    return temperatureAt(day, this.time.hour, (d) => this.climate.seasons[this.climateSeason(d, onMap)]);
  }

  /** The shared outdoor weather's current spell (null: dynamic weather is off). */
  private dynamicWeather(): { spell: number; kind: WeatherKind; amount: number } | null {
    const c = this.climate;
    if (!c.dynamic) return null;
    return weatherAt(this.state.clock, c, (d) => this.climateSeason(d, false), () => this.baseTemp(false));
  }

  /** The temperature where the player is (°F): season and hour, weather, the map's climate, an event's change. */
  temperature(): number {
    const env = this.stage?.env ?? this.time.environment;
    // A map's own temperature (a cave, a house): wandering a few degrees, but never into another state's range.
    const fixed = this.stage ? undefined : this.mapData?.fixedTemp;
    if (fixed !== undefined || env !== 'outdoor') {
      const base = fixed ?? (env === 'indoor' ? 68 : 55), c = this.bodyCfg;
      const edges = [-999, c.freezingAt, c.coldAt, c.hotAt, c.overheatAt, 999];
      let lo = -999, hi = 999;
      for (let i = 0; i < edges.length - 1; i++) if (base >= edges[i] && base < edges[i + 1]) { lo = edges[i] + 1; hi = edges[i + 1] - 1; }
      const wander = Math.sin(this.state.clock * 0.7) * 2 + Math.sin(this.state.clock * 0.23 + 1.3) * 1.5;
      let t = Math.max(Math.min(lo, base), Math.min(Math.max(hi, base), base + wander));
      if (this.tempHere) t = this.tempHere.op === 'set' ? this.tempHere.value : t + this.tempHere.value;
      return t;
    }
    let t = this.baseTemp() + (WEATHER_TEMP[this.weather.kind] ?? 0) * Math.min(1, this.weather.amount || 0) + (this.mapData?.tempOffset ?? 0);
    if (this.tempHere) t = this.tempHere.op === 'set' ? this.tempHere.value : t + this.tempHere.value;
    return t;
  }

  /* ---------------------------------------------------------------- the elements on the body */

  private bodyCfgCache: { src: unknown; cfg: BodySettings } | null = null;
  /** Database → Weather & temperature: cold, heat and wet on the body. */
  private get bodyCfg(): BodySettings {
    const c = this.bodyCfgCache;
    if (c && c.src === this.db.body) return c.cfg;
    const cfg = bodySettings(this.db.body);
    this.bodyCfgCache = { src: this.db.body, cfg };
    return cfg;
  }
  /** Each hero's weather state this moment (by hero id), for the HUD, the menus and the walking speed. */
  readonly weatherStates = new Map<string, WeatherState | null>();
  /** Distance walked toward the next chip of damage (Freezing, Overheating). */
  private bodyWalk = 0;
  private bodyLast: { x: number; z: number } | null = null;
  /** Heroes told this time that they're freezing / overheating (told again once they've recovered). */
  private readonly bodyWarned = new Set<string>();

  /** A hero's body (cold / heat meter and wetness), kept in the save. */
  private bodyOf(id: string): BodyState {
    let b = this.state.body.get(id);
    if (!b) { b = { meter: 0, wet: 0 }; this.state.body.set(id, b); }
    return b;
  }
  /** How warm a set of gear keeps its wearer (0–10). */
  private warmthOf(equip: Partial<Record<EquipSlot, string>>): number {
    let w = 0;
    for (const slot of EQUIP_SLOTS) { const id = equip[slot]; if (id) w += Math.max(0, this.items.get(id)?.warmth ?? 0); }
    return Math.min(10, w);
  }

  /** The party out of battle, each where they stand: the hero you play first, then everyone following. */
  private bodyParty(): { id: string; name: string; x: number; z: number; y: number; dir: Dir; shown: boolean; equip: Partial<Record<EquipSlot, string>>; swimming: boolean; hp: number; hurt: (n: number) => void; maxHp: number }[] {
    const m = this.motion, lead = mainHero(this.db);
    const out: ReturnType<Game['bodyParty']> = [{
      id: lead.id, name: lead.name, x: m.x, z: m.z, y: this.player.position.y, dir: this.player.dir, shown: this.player.mesh.visible, equip: this.inventory.equip, swimming: m.swimming, hp: this.stats.hp, maxHp: this.stats.cfg.max.hp,
      hurt: (n) => this.stats.change('hp', 'add', -n),
    }];
    for (const mem of this.members()) {
      const a = this.allies.find((x) => x.data === mem.data), x = a?.x ?? m.x, z = a?.z ?? m.z;
      out.push({
        id: mem.def.id, name: mem.def.name, x, z, y: a?.y ?? this.player.position.y, dir: a?.sprite.dir ?? 'down', shown: !!a && a.sprite.mesh.visible, equip: mem.data.equip, swimming: this.map.footWaterAt(Math.floor(x), Math.floor(z))?.kind === 'swim',
        hp: mem.data.down ? 0 : mem.data.hp, maxHp: this.allyNumbers(mem.data, mem.def).max.hp, hurt: (n) => { mem.data.hp = Math.max(1, mem.data.hp - n); },
      });
    }
    return out;
  }

  /**
   * The elements, each frame out of battle: every hero's cold / heat meter and wetness follow where they stand; the
   * worst state slows the walk; Freezing and Overheating chip health as they walk (never below 1). Paused in events,
   * while sleeping and in the air on a griffin (flying is safe); a map can be set to keep the elements out.
   */
  private updateBody(dt: number): void {
    const cfg = this.bodyCfg, m = this.motion;
    this.bodyShake = Math.max(0, this.bodyShake - dt);
    const off = cfg.off || this.mapData?.noElements || this.mapData?.kind === 'battle';
    if (off) { this.weatherStates.clear(); return; }
    const paused = !!this.flight || !!this.sleeping || this.interpreter.running || !!this.transfer || this.dying;
    const outdoor = (this.time.environment ?? 'outdoor') === 'outdoor' && this.mapData?.fixedTemp === undefined;
    const temp = this.temperature(), hour = this.time.hour, outside = outdoor ? temp : this.baseTemp(false);
    const raining = outdoor && (this.weather.kind === 'rain' || this.weather.kind === 'storm') && this.weather.amount > 0.05;
    const sunny = outdoor && hour > 8 && hour < 18 && this.weather.kind === 'none' && temp > 75;
    // Steps walked (tiles), for the chip of damage.
    if (this.bodyLast && !paused) this.bodyWalk += Math.min(1, Math.hypot(m.x - this.bodyLast.x, m.z - this.bodyLast.z));
    this.bodyLast = { x: m.x, z: m.z };
    const chip = this.bodyWalk >= Math.max(1, cfg.chipSteps);
    if (chip) this.bodyWalk = 0;
    for (const h of this.bodyParty()) {
      const b = this.bodyOf(h.id);
      // A safe zone keeps the elements out: sheltered, and as good as by a fire.
      const safe = !!this.mapData && safeAt(this.mapData, h.x, h.z);
      const place: BodyPlace = {
        temp, warmth: this.warmthOf(h.equip), raining, swimming: h.swimming, sheltered: !outdoor || safe,
        byFire: safe || !!this.lights?.byFire(h.x, h.z), damp: !!this.mapData?.damp, sunny, outside,
      };
      if (!paused && h.hp > 0) stepBody(b, place, dt, cfg);
      // Drying off by a fire (Update 117): a drying bar on their panel while it goes.
      if (place.byFire && !place.swimming && b.wet > 0.02 && !(place.raining && !place.sheltered)) this.drying.set(h.id, b.wet); else this.drying.delete(h.id);
      const st = weatherState(b, place, cfg), was = this.weatherStates.get(h.id);
      this.weatherStates.set(h.id, st);
      // Chatter when it changes (not when first worked out on a map).
      if (st && was !== undefined && st !== was && !paused && h.hp > 0) this.chatter({ trigger: st }, { prefer: h.id });
      if (!paused && h.shown && h.hp > 0) this.bodyEffects(h, st, temp, dt);
      if (!hurts(st)) { this.bodyWarned.delete(h.id); continue; }
      if (!this.bodyWarned.has(h.id)) {
        this.bodyWarned.add(h.id);
        this.log.add(st === 'freezing' ? `${h.name} is freezing! Find a fire or shelter.` : `${h.name} is overheating! Find shade or water.`, 'hurt');
      }
      // A chip of damage as they walk: never below 1, never to someone already down.
      if (chip && h.hp > 1) {
        const n = Math.min(h.hp - 1, Math.max(1, Math.round(h.maxHp * cfg.chipPct / 100)));
        if (n > 0) { h.hurt(n); this.audio.play('hurt'); this.bodyHurt(h.id); }
      }
    }
  }
  /* ---------------------------------------------------------------- party chatter */

  /** The line being said (one at a time), the one about to be, and the pause after one (seconds). */
  private chatSay: { id: string; until: number; bubble: EventBubble } | null = null;
  private chatPending: { wait: number; expire: number; what: { trigger?: ChatterTrigger; map?: string }; opts: { prefer?: string; boost?: number } } | null = null;
  private chatQuiet = 8;
  private readonly chatKey = {};
  /** What the chatter last saw: the weather, the wind, the map. */
  private chatWx: { map: string; kind: string; windy: boolean; t: number } | null = null;
  /** Each hero's last time on each trigger (so a state flickering doesn't repeat the line). */
  private readonly chatLast = new Map<string, number>();

  /** Something happened that a hero might talk about: they will, now and then (after a moment, when it's calm). */
  private chatter(what: { trigger?: ChatterTrigger; map?: string }, opts: { prefer?: string; boost?: number } = {}): void {
    if (this.chatSay || this.chatPending || this.chatQuiet > 0 || this.onTitle) return;
    const key = what.map ? `map:${what.map}` : `t:${what.trigger}`;
    if (this.elapsed - (this.chatLast.get(key) ?? -1e9) < 90) return;
    this.chatPending = { wait: 1 + Math.random() * 1.5, expire: 10, what, opts };
  }

  private chatTalkers(): Talker[] {
    const lead = mainHero(this.db);
    return this.bodyParty().map((p) => {
      const def = p.id === lead.id ? lead : this.db.heroes?.find((d) => d.id === p.id);
      return { id: p.id, name: p.name, chatter: def?.chatter, isPlayer: p.id === lead.id, canSpeak: p.shown && p.hp > 0 };
    });
  }

  /** Each frame out of battle: notice the weather, wind and map changing; say the waiting line when it's calm. */
  private updateChatter(dt: number): void {
    const busy = this.interpreter.running || !!this.transfer || this.pauseShell.isOpen || !!this.sleeping || this.dying || this.battle.active || this.battlePending || !!this.stage;
    if (this.updateGroup(!!busy)) return;
    if (this.chatSay) {
      if (this.elapsed >= this.chatSay.until || busy) { this.chatSay = null; this.chatQuiet = 25 + Math.random() * 20; }
      return;
    }
    if (!busy) this.chatQuiet -= dt;
    // The weather and the wind changing, and coming onto a map (looked at twice a second).
    if (!busy && this.mapData && this.motion && (!this.chatWx || this.elapsed - this.chatWx.t > 0.5)) {
      const w = this.mapWeather(), outdoor = (this.time.environment ?? 'outdoor') === 'outdoor';
      const kind = !outdoor ? 'none' : w.amount > 0.3 ? (w.kind === 'blizzard' ? 'snow' : w.kind) : 'none';
      const windy = outdoor && (this.chatWx?.windy ? w.wind >= 0.35 : w.wind >= 0.55);
      const was = this.chatWx;
      this.chatWx = { map: this.mapName, kind, windy, t: this.elapsed };
      if (!was || was.map !== this.mapName) {
        // A new map: its own lines (likelier the first time here), or the first-visit lines.
        const first = this.chatFirst;
        this.chatFirst = false;
        const talkers = this.chatTalkers();
        if (talkers.some((t) => (t.chatter?.maps ?? []).some((r) => r.map === this.mapName && r.line.trim()))) this.chatter({ map: this.mapName }, { boost: first ? 2 : 0.4 });
        else if (first && was) this.chatter({ trigger: 'newMap' });
      } else {
        const wet = (k: string) => k === 'rain' || k === 'snow' || k === 'storm';
        if (kind !== was.kind && wet(kind)) this.chatter({ trigger: kind as ChatterTrigger });
        else if (kind !== was.kind && wet(was.kind) && kind === 'none') this.chatter({ trigger: 'clear' });
        else if (windy !== was.windy) this.chatter({ trigger: windy ? 'windUp' : 'windDown' });
      }
    }
    const p = this.chatPending;
    if (!p) return;
    p.expire -= dt;
    if (p.expire <= 0) { this.chatPending = null; return; }
    if (busy) return;
    p.wait -= dt;
    if (p.wait > 0) return;
    this.chatPending = null;
    this.chatLast.set(p.what.map ? `map:${p.what.map}` : `t:${p.what.trigger}`, this.elapsed);
    const got = pickChatter(this.chatTalkers(), p.what, p.opts);
    if (got) this.sayChatter(got.id, got.name, got.line);
  }

  /** A group conversation playing (Update 122): its lines, the one up next. */
  private groupPlay: { lines: { hero: string; text: string }[]; i: number } | null = null;
  /** When a group conversation waiting for this camp starts (elapsed seconds; 0: none). */
  private groupDue = 0;

  private pickGroup(): GroupChatter | null {
    return nextGroup(this.db.groupChatter, this.state.groupQueue, (id) => this.state.getSwitch(`gchat:${id}`), (sw) => this.state.getSwitch(sw));
  }

  /** Group chatter, each frame: start it when due, then one line after another. True while it holds the stage. */
  private updateGroup(busy: boolean): boolean {
    if (!this.groupPlay && this.groupDue && this.elapsed >= this.groupDue && !busy) {
      this.groupDue = 0;
      const g = this.restZone ? this.pickGroup() : null;
      if (g) {
        this.state.groupQueue = this.state.groupQueue.filter((x) => x !== g.id);
        this.state.setSwitch(`gchat:${g.id}`, true);
        this.groupPlay = { lines: g.lines.filter((l) => l.hero && l.text.trim()), i: 0 };
        this.chatSay = null;
      }
    }
    const gp = this.groupPlay;
    if (!gp) return false;
    if (busy) return true;
    if (this.chatSay && this.elapsed < this.chatSay.until) return true;
    const party = this.bodyParty();
    while (gp.i < gp.lines.length) {
      const l = gp.lines[gp.i++], who = party.find((p) => p.id === l.hero);
      // Someone not here (out of the party, knocked out): their line is skipped.
      if (!who || !who.shown || who.hp <= 0) continue;
      this.sayChatter(who.id, who.name, l.text.trim());
      this.chatSay!.until += 0.5;
      return true;
    }
    this.groupPlay = null;
    this.chatSay = null;
    this.chatQuiet = 30;
    return false;
  }

  /** A party member resting at camp near (x, z), if any. */
  private restingAllyAt(x: number, z: number): Ally | null {
    if (!this.restZone) return null;
    let best: Ally | null = null, bd = 0.75;
    for (const a of this.allies) { if (!a.resting || a.down) continue; const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  /** Talk to someone resting at camp: their camp line over their head (a default, or one for what's going on). */
  private talkAtCamp(a: Ally): void {
    if (this.groupPlay) return;
    const line = campLine(a.def.chatter, (c) => this.state.test(c)) ?? linesFor(a.def.chatter, { trigger: 'camp' })[0] ?? null;
    a.sprite.faceVector(this.player.position.x - a.x, this.player.position.z - a.z);
    this.sayChatter(a.def.id, a.def.name, line ?? '…');
  }

  /** This is the hero's first time on the map they've just come onto. */
  private chatFirst = false;

  /** A hero says a line: a speech bubble over their head, and the line in the adventure log. */
  private sayChatter(id: string, name: string, line: string): void {
    this.chatSay = { id, until: this.elapsed + chatterSeconds(line), bubble: { text: line, chat: true, color: '#2b2118', bubble: '#fffaf0', size: 15, bold: false, still: true } };
    this.log.add(`${name}: "${line}"`, 'chat');
  }

  /* ---------------------------------------------------------------- ailments out of battle (Update 105) */

  private ailWalk = 0;
  private ailLast: { x: number; z: number } | null = null;
  /**
   * Ailments on the map: Poison and Burn cost health as the party walks (Database → Weather & temperature: % every
   * N steps), down to 1, then wear off; the rest only show (balloon and pill) until cured. Falling to 0 cures.
   */
  private updateAilments(): void {
    if (!this.motion || this.mapData?.kind === 'battle') return;
    const paused = !!this.flight || !!this.sleeping || this.interpreter.running || !!this.transfer || !!this.dying;
    const m = this.motion;
    if (this.ailLast && !paused) this.ailWalk += Math.min(1, Math.hypot(m.x - this.ailLast.x, m.z - this.ailLast.z));
    this.ailLast = { x: m.x, z: m.z };
    const party = this.bodyParty(), cfg = this.bodyCfg;
    party.forEach((h, who) => { if (h.hp <= 0 && this.ailmentOf(who)) this.clearLingering(['all', 'zombie'], who); });
    // Good states running out (game time).
    for (const [id, g] of this.state.good) if (g.until <= this.state.clock) {
      this.state.good.delete(id);
      const name = party.find((p) => p.id === id)?.name;
      if (name) this.log.add(`${name} is no longer ${GOOD_INFO[g.kind].name}`, 'info');
      this.applySkillStats();
    }
    if (this.ailWalk < Math.max(1, cfg.ailmentSteps)) return;
    this.ailWalk = 0;
    party.forEach((h, who) => {
      const a = this.ailmentOf(who);
      if ((a !== 'poison' && a !== 'burn') || h.hp <= 0) return;
      const n = Math.min(h.hp - 1, Math.max(1, Math.round(h.maxHp * cfg.ailmentPct / 100)));
      if (n > 0) { h.hurt(n); this.audio.play('hurt'); this.bodyHurt(h.id); }
      if (h.hp - n <= 1) {
        this.clearLingering([a], who);
        if (who === 0) this.combat.heroStatus.cure([a]);
        this.log.add(`${h.name}’s ${a === 'poison' ? 'poison' : 'burn'} wore off`, 'info');
      }
    });
  }

  /** Heroes drying off by a fire, and how wet they still are (0 … 1). */
  private readonly drying = new Map<string, number>();

  /* ---------------------------------------------------------------- time bubble */

  /** A field-use pop-up opened from the bag: the bag and pause menu step aside for it. */
  private leaveMenusForPicker(): void {
    if (this.bag.isOpen) this.bag.hide();
    if (this.pauseShell.isOpen) this.closePause();
  }

  /**
   * Change time (Update 132): a bubble forms round the hero and the world fast-forwards around them (fires burn down,
   * the sky turns) until the time is reached, then it pops.
   */
  private timeWarp: { left: number; rate: number; name: string; t: number; pop: number; bubble: THREE.Group; mats: THREE.MeshBasicMaterial[] } | null = null;
  private startTimeWarp(to: number, name: string): void {
    if (this.timeWarp) return;
    const left = wrapHour(to - this.time.hour);
    if (left < 1 / 60) { this.menu.notice(`It’s already ${this.time.label(this.settings.clock12)}.`); return; }
    const mats = [
      new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide }),
      new THREE.MeshBasicMaterial({ color: '#7ac8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, wireframe: true }),
    ];
    const bubble = new THREE.Group();
    bubble.add(new THREE.Mesh(new THREE.SphereGeometry(1.15, 32, 20), mats[0]), new THREE.Mesh(new THREE.SphereGeometry(1.18, 18, 12), mats[1]));
    bubble.scale.setScalar(0.01);
    this.scene.add(bubble);
    // Two to four seconds, whatever the wait.
    this.timeWarp = { left, rate: Math.max(3, left / 3.5), name, t: 0, pop: -1, bubble, mats };
    this.audio.play('ringOn');
  }
  private updateTimeWarp(dt: number): void {
    const w = this.timeWarp;
    if (!w) return;
    const p = this.player.position;
    w.bubble.position.set(p.x, p.y + 0.75, p.z);
    w.t += dt;
    if (w.pop >= 0) {
      w.pop += dt;
      const k = Math.min(1, w.pop / 0.28);
      w.bubble.scale.setScalar(1 + k * 0.7);
      w.mats[0].opacity = 0.22 * (1 - k); w.mats[1].opacity = 0.14 * (1 - k);
      if (k >= 1) {
        this.scene.remove(w.bubble);
        w.bubble.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
        for (const m of w.mats) m.dispose();
        this.timeWarp = null;
      }
      return;
    }
    // Grows in, shimmers while the hours race past.
    const grow = Math.min(1, w.t / 0.35), wob = 1 + Math.sin(w.t * 9) * 0.02;
    w.bubble.scale.set(grow * wob, grow / wob, grow * wob);
    w.bubble.rotation.y += dt * 1.5;
    w.mats[0].opacity = 0.16 + Math.sin(w.t * 6) * 0.04; w.mats[1].opacity = 0.14;
    if (w.t < 0.35) return;
    const step = Math.min(w.left, w.rate * dt);
    w.left -= step;
    this.state.clock += step;
    this.fireCheck = 0;
    this.time.set(wrapHour(this.time.hour + step), true);
    this.time.update(0);
    if (w.left <= 1e-6) {
      w.pop = 0;
      this.audio.play('ringOff');
      this.bursts.spawn(p.x, p.y + 0.8, p.z, { color: '#bfe6ff', n: 26, speed: 2.6, up: 1.6, life: 0.6, size: 0.07, additive: true });
      this.menu.notice(`${w.name}: ${this.time.label(this.settings.clock12)}.`);
    }
  }

  /* ----------------------------------------------------------- global events */

  /** Global event scripts waiting to run (Update 131), oldest first. */
  private globalQueue: { id: string; commands: Command[] }[] = [];
  /** Queue the global events for a moment (each once, in the Database's order). */
  private fireGlobal(t: GlobalTrigger): void {
    for (const e of this.db.globalEvents ?? []) {
      if (!e.when.includes(t) || !e.commands.length || this.globalQueue.some((q) => q.id === e.id)) continue;
      this.globalQueue.push({ id: e.id, commands: e.commands });
    }
  }
  private dayCheckAt = 0;
  /** On the map with nothing else going on: the real date rolling over, then the next waiting global event. */
  private nextGlobal(): boolean {
    if (this.onTitle || this.sleeping || this.menu.isOpen || this.pauseShell.isOpen || this.message.isOpen || this.dying) return false;
    if (this.elapsed >= this.dayCheckAt) {
      this.dayCheckAt = this.elapsed + 5;
      const today = realDayKey();
      if (!this.state.realDay) this.state.realDay = today;
      else if (this.state.realDay !== today) { this.state.realDay = today; this.fireGlobal('newDay'); }
    }
    const next = this.globalQueue.shift();
    if (!next) return false;
    this.interpreter.start(next.commands);
    return true;
  }

  /** The safe zone the hero is resting in (its spots, keyed by its first spot), or null. */
  private restZone: string | null = null;
  /**
   * Safe zones: while the hero you play stands in one, the party goes to its rest spots (each the spot they like
   * best, Database → Heroes → Rest preferences); stepping out calls everyone back behind them.
   */
  /** Who rests at which spot in the zone the hero is in (kept while they stay: one spot each for the whole rest). */
  private restPicks: { key: string; picks: Map<string, RestSpot | null> } | null = null;
  private updateRestZone(): void {
    const m = this.motion, d = this.mapData;
    const calm = !this.battle.active && !this.battlePending && !this.flight && !this.transfer && !!d?.safeGrid;
    const spots = calm ? zoneSpots(d!, m.x, m.z) : [];
    const key = spots.length ? `${this.mapName}:${spots[0].x},${spots[0].z}` : null;
    const free = this.allies.filter((a) => !a.down && !a.passive);
    // Same zone and everyone where they should be: nothing to do (allies made again, after a rest or a form change,
    // go back to the spot they had).
    if (key === this.restZone && (!key || free.every((a) => this.restPicks?.picks.has(a.def.id) && (a.resting || !this.restPicks.picks.get(a.def.id))))) return;
    const entering = key !== this.restZone;
    this.restZone = key;
    if (!key) {
      for (const a of this.allies) a.setRest(null);
      // Only walking out forgets the spots (a battle or a flight in the zone keeps them).
      if (calm) this.restPicks = null;
      return;
    }
    if (entering) this.fireGlobal('restZone');
    if (entering && this.restPicks?.key !== key) {
      // Group chatter waiting for a camp plays a moment after everyone sits down; otherwise the usual rest line.
      if (this.pickGroup()) this.groupDue = this.elapsed + 3.5; else this.chatter({ trigger: 'rest' });
    }
    if (this.restPicks?.key !== key) {
      // In party order (the list's order): ties go to whoever is higher.
      free.sort((a, b) => this.members().findIndex((x) => x.data === a.data) - this.members().findIndex((x) => x.data === b.data));
      const got = shareSpots(spots, free.map((a) => a.def.restPrefs ?? {}));
      this.restPicks = { key, picks: new Map(free.map((a, i) => [a.def.id, got[i]])) };
    }
    // Someone who joined while resting (Update 131): one of the spots nobody has.
    const picks = this.restPicks.picks, late = free.filter((a) => !picks.has(a.def.id));
    if (late.length) {
      const taken = new Set([...picks.values()].filter(Boolean).map((s) => `${s!.x},${s!.z}`));
      const left = spots.filter((s) => !taken.has(`${s.x},${s.z}`));
      const got = shareSpots(left, late.map((a) => a.def.restPrefs ?? {}));
      late.forEach((a, i) => picks.set(a.def.id, got[i] ?? null));
    }
    for (const a of free) a.setRest(picks.get(a.def.id) ?? null);
  }

  /** Breath, drips and steam on the map, per hero, every so often. */
  private readonly bodyFxT = new Map<string, number>();
  private bodyEffects(h: { id: string; x: number; y: number; z: number; dir: Dir }, st: WeatherState | null, temp: number, dt: number): void {
    let t = (this.bodyFxT.get(h.id) ?? Math.random()) - dt;
    if (t > 0) { this.bodyFxT.set(h.id, t); return; }
    const [dx, dz] = DIR_VECTOR[h.dir];
    // Sprites lean back toward a high camera (Update 121): a point `u` up the body is up the leaned sprite.
    const lean = leanNow(), cy = Math.cos(lean), sz = Math.sin(lean);
    const at = (u: number, ox = 0, oz = 0): [number, number, number] => [h.x + ox, h.y + u * cy, h.z + oz - u * sz + 0.02];
    if (temp < 45) {
      // Breath in the cold: a puff from the mouth every couple of seconds, thicker and longer the colder it is.
      const cold = Math.min(1, (45 - temp) / 40);
      this.bursts.spawn(...at(1.22, dx * 0.18, dz * 0.18), { color: '#eef4ff', n: 3 + Math.round(cold * 4), speed: 0.18 + cold * 0.12, up: 0.22, life: 0.9 + cold * 0.8, size: 0.1 + cold * 0.06, gravity: -0.12 });
      t = 1.5 + Math.random() * 1.2 - cold * 0.4;
    }
    if (st === 'wet') { this.bursts.spawn(...at(0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3, 0.03), { color: '#8cc8ff', n: 1, speed: 0.05, up: 0, life: 0.5, size: 0.05, gravity: 7 }); t = Math.min(t > 0 ? t : 9, 0.35 + Math.random() * 0.3); }
    if (st === 'hot' || st === 'overheating') {
      this.bursts.spawn(...at(1.4, (Math.random() - 0.5) * 0.25, 0.02), { color: '#e8e2da', n: st === 'overheating' ? 4 : 2, speed: 0.08, up: 0.35, life: 1.1, size: 0.11, gravity: -0.25 });
      t = Math.min(t > 0 ? t : 9, st === 'overheating' ? 0.5 : 1.2);
    }
    this.bodyFxT.set(h.id, t > 0 ? t : 1.5);
  }

  /** A hero just took a chip of damage from the elements: a short screen shake, and their panel rumbles a while. */
  private bodyHurt(id: string): void {
    this.bodyShake = 0.35;
    this.rumbleUntil.set(id, performance.now() + this.bodyCfg.rumble * 1000);
  }
  /** Seconds left of the elements' screen shake. */
  private bodyShake = 0;
  /** When each hero's panel stops rumbling (performance.now() ms), by hero id. */
  private readonly rumbleUntil = new Map<string, number>();
  private rumbling(id: string): boolean { return (this.rumbleUntil.get(id) ?? 0) > performance.now(); }

  /** A consumable's warming or cooling on a hero (0: the one you play, 1…: party members). */
  private sootheHero(who: number, warms: number): boolean {
    const id = who === 0 ? mainHero(this.db).id : this.members()[who - 1]?.def.id;
    if (!id || !warms) return false;
    const b = this.bodyOf(id), was = b.meter;
    soothe(b, warms);
    return b.meter !== was;
  }
  /** The weather state's name for a hero, or ''. */
  weatherStateName(id: string): string { const st = this.weatherStates.get(id); return st ? WEATHER_STATE_INFO[st].name : ''; }

  /** The ground's look follows the weather: damp after rain, frosted below freezing, parched in a heat wave. */
  private updateClimate(dt: number): void {
    const outdoor = (this.stage?.env ?? this.time.environment) === 'outdoor';
    const t = this.temperature(), raining = this.weather.rain, k = Math.min(1, dt * 0.6);
    // Soaks in within a minute or so of rain; dries over about two game hours (sooner when it's hot).
    const gameHours = (dt * Math.max(1, this.time.rate)) / 3600;
    this.wet = raining > 0.05 ? Math.min(1, this.wet + raining * dt * 0.05) : Math.max(0, this.wet - gameHours * (t > 80 ? 1 : 0.5));
    const frost = outdoor ? clamp((34 - t) / 10, 0, 1) : 0, heat = outdoor ? clamp((t - 88) / 16, 0, 1) : 0;
    this.frost += (frost - this.frost) * k * 0.3;
    this.heat += (heat - this.heat) * k * 0.3;
    setWeatherLook(outdoor ? this.wet : 0, this.frost, this.heat);
    if (combatClimate.temp !== t) combatClimate.temp = t;
    combatClimate.strength = this.climate.battle / 100;
  }

  /** Thunderstorms: now and then the sky flashes, and thunder rolls in a moment later. */
  private lightning = { next: 4, flash: 0, thunder: -1 };
  private updateLightning(dt: number): void {
    const s = this.weather.storm, L = this.lightning;
    if (s > 0.3 && (this.stage?.env ?? this.time.environment) === 'outdoor') {
      L.next -= dt;
      if (L.next <= 0) { L.next = 6 + Math.random() * 14; L.flash = 1; L.thunder = 0.4 + Math.random() * 1.6; }
    }
    if (L.thunder > 0 && (L.thunder -= dt) <= 0) { L.thunder = -1; this.audio.play('thunder'); }
    L.flash = Math.max(0, L.flash - dt * 3.5);
    // Two quick flickers.
    this.lightFlash = L.flash > 0 ? (L.flash > 0.7 ? 1 : L.flash > 0.5 ? 0.2 : L.flash > 0.35 ? 0.8 : L.flash * 0.6) : 0;
  }
  /** Lightning brightening the scene (0 … 1). */
  private lightFlash = 0;

  /* ---------------------------------------------------------------- sleeping */

  /** A sleep under way: up (tilting to the sky), pass (the hours rushing by), down (back to the hero). */
  private sleeping: { phase: 'up' | 'pass' | 'down'; t: number; from: number; hours: number; rest: boolean; inn?: boolean; done?: () => void } | null = null;
  /** How far the camera has tilted up to the sky (0 … 1). */
  private sleepLook = 0;
  private readonly skyLook = new THREE.Vector3();
  private readonly skyAim = new THREE.Vector3();

  private startSleep(c: Extract<Command, { cmd: 'sleep' }>): void {
    const now = this.time.hour;
    const target = c.until === 'night' ? 21 : c.until === 'hours' ? wrapHour(now + Math.max(0.25, c.hours ?? 8)) : 7;
    let hours = wrapHour(target - now);
    if (hours < 0.25) hours += 24;
    if (c.until === 'hours') hours = Math.max(0.25, c.hours ?? 8);
    this.sleeping = { phase: 'up', t: 0, from: now, hours, rest: !!c.rest, inn: !!c.inn };
    this.audio.play('menuOk');
  }

  /** Each frame while sleeping. The clock (fires, seasons, day counts) moves on by the hours slept. */
  private updateSleep(dt: number): void {
    const s = this.sleeping;
    if (!s) { this.sleepLook = Math.max(0, this.sleepLook - dt); return; }
    s.t += dt;
    // Database → Time → Sky transition speed (Normal: 5 – 12 s for the hours to pass, slower than before update 93).
    const UP = 2.2, PASS = Math.min(12, 5 + s.hours * 0.55) / Math.max(0.2, this.db.time?.skySpeed ?? 1), DOWN = 2.2;
    if (s.phase === 'up') { this.sleepLook = Math.min(1, s.t / UP); if (s.t >= UP + 0.4) { s.phase = 'pass'; s.t = 0; } return; }
    if (s.phase === 'pass') {
      const k = Math.min(1, s.t / PASS), e = k * k * (3 - 2 * k), h = wrapHour(s.from + s.hours * e);
      this.state.clock += wrapHour(h - this.time.hour);
      this.fireCheck = 0;
      this.time.set(h, true);
      this.time.update(0);
      if (k >= 1) {
        s.phase = 'down'; s.t = 0;
        if (s.rest) this.fullRest();
        // An inn: everyone wakes Well Rested.
        if (s.inn) this.giveGood('all', 'wellRested');
        s.done?.();
        this.chatter({ trigger: 'camp' }, { boost: 1.5 });
        this.fireGlobal('sleep');
      }
      return;
    }
    this.sleepLook = Math.max(0, 1 - s.t / DOWN);
    if (s.t >= DOWN) { this.sleeping = null; this.sleepLook = 0; }
  }

  /* ---------------------------------------------------------------- the sky */

  /** The real moon's phase for the clock card (worked out again every half minute). */
  private moonCache = { t: -1e9, info: undefined as { svg: string; name: string; key: string } | undefined };
  private moonInfo(): { svg: string; name: string; key: string } | undefined {
    if (this.elapsed - this.moonCache.t > 30 || !this.moonCache.info) {
      const age = moonAge(), name = MOON_NAMES[moonPhase()];
      this.moonCache = { t: this.elapsed, info: { svg: moonIconSvg(age), name, key: `${name}|${Math.round(age * 56)}` } };
    }
    return this.moonCache.info;
  }

  private readonly sky = new Sky();
  private readonly skyCol = { zenith: new THREE.Color(), horizon: new THREE.Color(), sun: new THREE.Color(), cloud: new THREE.Color(), shade: new THREE.Color() };
  private static readonly SKY_DAY = new THREE.Color(0.18, 0.36, 0.78);
  private static readonly FLASH = new THREE.Color(0.85, 0.85, 1.0);
  private static readonly SKY_NIGHT = new THREE.Color(0.006, 0.009, 0.03);
  private static readonly CLOUD = {
    clear: [new THREE.Color(0.95, 0.95, 0.97), new THREE.Color(0.62, 0.64, 0.72)],
    rain: [new THREE.Color(0.3, 0.29, 0.36), new THREE.Color(0.12, 0.11, 0.17)],
    snow: [new THREE.Color(0.72, 0.74, 0.78), new THREE.Color(0.5, 0.52, 0.58)],
    sand: [new THREE.Color(0.78, 0.6, 0.38), new THREE.Color(0.5, 0.36, 0.22)],
    night: [new THREE.Color(0.05, 0.06, 0.1), new THREE.Color(0.02, 0.02, 0.04)],
  };

  /** The sky follows the hour, the moon's real phase and the weather; indoors and underground it isn't there. */
  private updateSky(dt: number): void {
    const env = this.stage?.env ?? this.time.environment;
    this.sky.visible = env === 'outdoor';
    if (!this.sky.visible) return;
    const night = this.time.night, dk = night * this.time.darkness, c = this.skyCol, w = this.mapWeather();
    c.horizon.copy(this.fog.color);
    // The zenith: a deeper blue by day (from the sky light's colour), near black at night, greyer under cloud.
    c.zenith.copy(this.hemi.color).lerp(Game.SKY_DAY, 0.45 * (1 - night)).lerp(Game.SKY_NIGHT, Math.min(1, night * 0.7 + dk * 0.3));
    c.sun.copy(this.sun.color).multiplyScalar(1 - night);
    const kind = w.kind, amt = w.amount;
    const look = kind === 'rain' || kind === 'storm' ? 'rain' : kind === 'snow' || kind === 'blizzard' ? 'snow' : kind === 'sandstorm' || kind === 'dust' ? 'sand' : kind === 'haze' ? 'haze' : 'clear';
    // Clear days: a few puffy clouds, more on some days than others (and thin, wispy ones on some).
    const day = Math.floor(this.state.clock / 24), v = (Math.sin(day * 12.9898) * 43758.5453) % 1;
    const base = 0.22 + Math.abs(v) * 0.25, wispy = Math.abs((v * 7.3) % 1) > 0.6 ? 0.8 : 0;
    const heavy = kind === 'storm' || kind === 'blizzard' ? 0.25 : 0;
    const cover = look === 'clear' ? base : look === 'haze' ? 0.3 : look === 'rain' ? 0.65 + 0.3 * amt + heavy : look === 'snow' ? 0.7 + 0.25 * amt + heavy : 0.5 + 0.3 * amt;
    const [cl, sh] = Game.CLOUD[look === 'haze' ? 'snow' : look];
    c.cloud.copy(cl).lerp(Game.CLOUD.night[0], night * 0.9);
    c.shade.copy(sh).lerp(Game.CLOUD.night[1], night * 0.9);
    if (look !== 'clear') c.zenith.lerp(c.cloud, look === 'haze' ? 0.45 : 0.5 * amt + heavy);
    if (kind === 'storm') { c.cloud.multiplyScalar(0.75); c.shade.multiplyScalar(0.7); }
    // Lightning lights the clouds from inside.
    if (this.lightFlash > 0) { c.cloud.lerp(Game.FLASH, this.lightFlash * 0.7); c.zenith.lerp(Game.FLASH, this.lightFlash * 0.4); }
    this.sky.update({
      hour: this.time.hour, night, horizon: c.horizon, zenith: c.zenith, sunColor: c.sun, moonAge: moonAge(),
      cloud: cover, wispy: look === 'clear' ? wispy : 0, cloudColor: c.cloud, cloudShade: c.shade,
      windDir: THREE.MathUtils.degToRad(w.dir), wind: w.wind, time: this.elapsed,
    }, this.camera, dt);
  }
}

/** The weather's name for the clock card. */
/** The weather list of the Change weather key item (Update 132). */
const WEATHER_PICK: Record<WeatherKind, string> = { none: 'Clear skies', rain: 'Rain', storm: 'Thunderstorm', snow: 'Snow', blizzard: 'Blizzard', haze: 'Haze', sandstorm: 'Sandstorm', pollen: 'Pollen', dust: 'Dust', leaves: 'Falling leaves' };
const WEATHER_LABEL: Record<WeatherKind, string> = { none: 'Clear', rain: 'Rain', storm: 'Storm', snow: 'Snow', blizzard: 'Blizzard', haze: 'Hazy', sandstorm: 'Sandstorm', pollen: 'Pollen', dust: 'Dusty', leaves: 'Windy' };

/** The adventure log's line when the weather turns. */
function weatherLine(k: WeatherKind): string {
  return ({ none: 'The sky clears.', rain: 'It starts to rain.', storm: 'A thunderstorm rolls in.', snow: 'Snow begins to fall.', blizzard: 'A blizzard sweeps in.',
    haze: 'A haze settles over everything.', sandstorm: 'A sandstorm whips up.', pollen: 'Pollen drifts on the air.', dust: 'Dust hangs in the air.', leaves: 'Leaves blow past on the wind.' } as Record<WeatherKind, string>)[k];
}

/** The ground sounds a prop's walk sound can name (anything else is a sound file or effect played as it is). */
const FOOT_MATERIALS = new Set(['grass', 'dirt', 'stone', 'wood', 'sand', 'snow', 'water', 'metal', 'carpet']);
