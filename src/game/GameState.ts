/** Switches and variables, the persistent memory events read and write (as in RPG Maker). */
import { inDates } from '../world/dates';
import { moonPhase } from '../world/moon';
import type { ForgeEntry } from './forge';
import { ABILITIES, type Ability, type Condition, type Dir, type WeatherKind } from '../world/types';
import type { Inventory } from './inventory';
import type { QuestBook } from './quests';

/** Weather an event set for a map. */
/** `spell`: set by an event during this spell of dynamic weather (it lasts until the weather next changes by itself). */
export interface MapWeather { kind: WeatherKind; amount?: number; wind?: number; spell?: number }

/** The rented horse: which, where it was left, facing, its stamina, and whether the hero is riding it. */
export interface HorseState { id: string; map: string; x: number; z: number; dir: Dir; sp: number; mounted?: boolean }

/** An unlocked griffin roost: its name, its map and where the hero stands to fly from (and lands). */
export interface RoostState { name: string; map: string; x: number; z: number }

export class GameState {
  readonly switches = new Map<string, boolean>();
  readonly variables = new Map<string, number>();
  /** The player's bag (for "has item" and "has gold" conditions). */
  inventory: Inventory | null = null;
  /** Quests (for quest conditions). */
  quests: QuestBook | null = null;
  /** The temperature (°F) and weather where the player is (for those conditions). */
  env: { temp(): number; weather(): WeatherKind; heroHas?(hero: string, what: string): boolean; relation?(a: string, b: string): number; rp?(hero: string, field: string): string; rpDays?(hero: string, field: string): number | null } | null = null;
  /** Relationship ratings (Update 124), by "rater>rated" hero ids; missing: the Database's start. */
  readonly rel = new Map<string, number>();
  /** Movement abilities the player has right now. */
  readonly abilities = new Map<Ability, boolean>(ABILITIES.map((a) => [a, true]));
  /** "Overworld weapons: off" (an event, for indoors or restricted areas): the field sword and bow can't be used. */
  weaponsOff = false;
  /** "Dynamic" enemy levels (an event): spawns come out near the party's average level, `spread` either side. Null: as set. */
  enemyLevels: { spread: number } | null = null;
  /** The rented horse (one at a time): where it was left (its map and spot), whether the hero is riding, its stamina. */
  horse: HorseState | null = null;
  /** Each hero's cold / heat meter and wetness (by hero id; out of battle, lasting through battles). */
  readonly body = new Map<string, { meter: number; wet: number }>();
  /** Each hero's good state from resting (Rested / Well Rested) and when it ends (on `clock`). */
  readonly good = new Map<string, { kind: 'rested' | 'wellRested'; until: number }>();
  /** Griffin roosts unlocked (by talking to their master): their name, map, and where the hero lands. */
  readonly roosts = new Map<string, RoostState>();
  /** EXP All key items switched off (by item id); on while held, otherwise. */
  readonly expAllOff = new Set<string>();
  /** Console cheats were used in this game: achievements stay locked for it. */
  cheated = false;
  /** The console's achievements_allow: cheats don't lock achievements on this save. */
  allowAchievements = false;
  /** A season brought by a key item (Change season, Update 118; null: the calendar's). */
  seasonPick: string | null = null;
  /** Group chatter queued for the next camp (Update 122). */
  groupQueue: string[] = [];
  /** Journal tabs shown or hidden by events (Update 130). */
  readonly journalTabs = new Map<string, boolean>();
  /** The real date the game last saw ("YYYY-MM-DD"), for the New day global events (Update 131). */
  realDay = '';
  /** Sprint switched on (the Sprint key item, Update 137). */
  sprint = false;
  /** The player's own marker on the World Map (Update 141), in world tiles. */
  pin: { x: number; z: number } | null = null;
  /** Props cut down with a cutting ring, per map (keys from propKey). */
  readonly cut = new Map<string, Set<string>>();
  /** Game hours passed since the game began (the clock running; fires burn by it). */
  clock = 0;
  /** Fires that burn out, per map: prop key → the game hour (on `clock`) they go out. Missing: never lit yet. */
  /** The Journal's records: counts of things done (steps, enemies defeated by kind, trees chopped…). */
  readonly records = new Map<string, number>();
  /** Weapons and armor upgraded or enchanted at a forge (by item id). */
  readonly forge = new Map<string, ForgeEntry>();
  /** Heroes in a later form (hero id → 1 mid, 2 final). */
  readonly forms = new Map<string, number>();

  /** Count something for the Journal's records (`best`: keep the highest instead of adding). */
  tally(key: string, n = 1, best = false): void {
    if (!(n > 0) || !Number.isFinite(n)) return;
    const was = this.records.get(key) ?? 0;
    this.records.set(key, best ? Math.max(was, n) : was + n);
  }

  record(key: string): number { return this.records.get(key) ?? 0; }

  /** Weather changed by events, per map (overrides the map's own). */
  readonly weather = new Map<string, MapWeather>();
  readonly fires = new Map<string, Map<string, number>>();

  fireUntil(map: string, key: string): number | undefined { return this.fires.get(map)?.get(key); }
  setFire(map: string, key: string, until: number): void {
    let m = this.fires.get(map);
    if (!m) this.fires.set(map, (m = new Map()));
    m.set(key, until);
  }

  isCut(map: string, key: string): boolean { return this.cut.get(map)?.has(key) ?? false; }
  setCut(map: string, key: string): void {
    let s = this.cut.get(map);
    if (!s) this.cut.set(map, (s = new Set()));
    s.add(key);
  }

  /** Start with the database's abilities (any not listed are on). */
  initAbilities(from?: Partial<Record<Ability, boolean>>): void {
    for (const a of ABILITIES) this.abilities.set(a, from?.[a] ?? true);
  }
  has(a: Ability): boolean {
    return this.abilities.get(a) ?? true;
  }
  setAbility(a: Ability, on: boolean): void {
    this.abilities.set(a, on);
  }

  getSwitch(id: string): boolean {
    return this.switches.get(id) ?? false;
  }
  setSwitch(id: string, on: boolean): void {
    this.switches.set(id, on);
  }
  getVar(id: string): number {
    return this.variables.get(id) ?? 0;
  }
  setVar(id: string, v: number): void {
    this.variables.set(id, v);
  }

  /** A self-switch's key: `self` is "map:eventId". */
  static selfKey(self: string, letter: string): string { return `@self:${self}:${letter}`; }

  /** Is a condition met? `self` ("map:eventId") answers self-switch conditions. */
  test(c: Condition, self?: string): boolean {
    if ('self' in c) return !!self && this.getSwitch(GameState.selfKey(self, c.self)) === (c.is ?? true);
    if ('quest' in c) {
      const q = this.quests;
      if ('objective' in c) {
        const d = q?.def(c.quest), o = d?.objectives.find((x) => x.id === c.objective);
        return (!!q && !!d && !!o && q.objectiveDone(d, o)) === (c.done ?? true);
      }
      const s = q?.status(c.quest) ?? 'inactive';
      return c.is === 'started' ? s === 'active' || s === 'ready' : s === c.is;
    }
    if ('switch' in c) return this.getSwitch(c.switch) === (c.is ?? true);
    if ('item' in c) return (this.inventory?.count(c.item) ?? 0) >= (c.count ?? 1);
    if ('gold' in c) return (this.inventory?.gold ?? 0) >= c.gold;
    if ('weekday' in c) return c.weekday.includes(new Date().getDay());
    if ('moon' in c) return c.moon.includes(moonPhase());
    if ('temp' in c) { const t = this.env?.temp() ?? 70; return c.op === '<=' ? t <= c.temp : t >= c.temp; }
    if ('weather' in c) return c.weather.includes(this.env?.weather() ?? 'none');
    if ('date' in c) return inDates(new Date(), c.date, c.until);
    if ('rpDate' in c) { const n = this.env?.rpDays?.(c.hero, c.rpDate); return n !== null && n !== undefined && n <= Math.max(0, c.within ?? 0); }
    if ('rp' in c) { const v = (this.env?.rp?.(c.hero, c.rp) ?? '').trim().toLowerCase().replace(/\s+/g, ' '); return !!v && v === c.is.trim().toLowerCase().replace(/\s+/g, ' '); }
    if ('relation' in c) { const v = this.env?.relation?.(c.relation, c.of) ?? 50; return c.op === '<=' ? v <= c.value : v >= c.value; }
    if ('heroHas' in c) return (this.env?.heroHas?.(c.hero ?? '', c.heroHas) ?? false) === (c.is ?? true);
    const v = this.getVar(c.var);
    switch (c.op) {
      case '>=': return v >= c.value;
      case '<=': return v <= c.value;
      case '==': return v === c.value;
      case '>': return v > c.value;
      case '<': return v < c.value;
    }
  }

  /** Replace \v[name] with a variable's value and \s[name] with ON/OFF. */
  /** "2 h 30 min" for the fire nearest the hero, for \fire in messages (the game fills this in). */
  fireText: () => string = () => '';

  format(text: string): string {
    return text
      .replace(/\\fire/g, () => this.fireText())
      // Roleplay (Update 127): \rp[Eleanor, Favourite food] → her answer.
      .replace(/\\rp\[([^\],]+),\s*([^\]]+)\]/g, (_, who: string, title: string) => this.env?.rp?.(who.trim(), title.trim()) ?? '')
      .replace(/\\v\[([^\]]+)\]/g, (_, id: string) => String(this.getVar(id)))
      .replace(/\\s\[([^\]]+)\]/g, (_, id: string) => (this.getSwitch(id) ? 'ON' : 'OFF'));
  }

  /** Restore from a save (replaces everything). */
  load(d: { roosts?: Record<string, RoostState>; horse?: HorseState | null; expAllOff?: string[]; enemyLevels?: { spread: number } | null; switches?: Record<string, boolean>; variables?: Record<string, number>; abilities?: Record<string, boolean>; cut?: Record<string, string[]>; clock?: number; fires?: Record<string, Record<string, number>>; weather?: Record<string, MapWeather>; records?: Record<string, number>; forge?: Record<string, ForgeEntry>; weaponsOff?: boolean; cheated?: boolean; allowAchievements?: boolean; forms?: Record<string, number>; body?: Record<string, { meter: number; wet: number }>; good?: Record<string, { kind: 'rested' | 'wellRested'; until: number }>; seasonPick?: string; groupQueue?: string[]; rel?: Record<string, number>; journalTabs?: Record<string, boolean>; realDay?: string; sprint?: boolean; pin?: { x: number; z: number } | null }): void {
    this.weaponsOff = !!d.weaponsOff;
    this.body.clear();
    this.good.clear();
    for (const [k, v] of Object.entries(d.good ?? {})) if (v && (v.kind === 'rested' || v.kind === 'wellRested') && Number.isFinite(v.until)) this.good.set(k, { kind: v.kind, until: v.until });
    for (const [k, v] of Object.entries(d.body ?? {})) if (v && typeof v === 'object') this.body.set(k, { meter: Math.max(-100, Math.min(100, Number(v.meter) || 0)), wet: Math.max(0, Math.min(1, Number(v.wet) || 0)) });
    this.forms.clear();
    for (const [k, v] of Object.entries(d.forms ?? {})) { const n = Math.round(Number(v) || 0); if (n > 0) this.forms.set(k, Math.min(2, n)); }
    this.roosts.clear();
    for (const [k, r] of Object.entries(d.roosts ?? {})) if (r && typeof r.map === 'string') this.roosts.set(k, { name: String(r.name ?? k), map: r.map, x: Number(r.x) || 0, z: Number(r.z) || 0 });
    const h = d.horse;
    this.horse = h && typeof h.id === 'string' && typeof h.map === 'string' ? { id: h.id, map: h.map, x: Number(h.x) || 0, z: Number(h.z) || 0, dir: h.dir ?? 'down', sp: Number(h.sp) || 0, ...(h.mounted ? { mounted: true } : {}) } : null;
    this.expAllOff.clear();
    for (const id of Array.isArray(d.expAllOff) ? d.expAllOff : []) if (typeof id === 'string') this.expAllOff.add(id);
    this.enemyLevels = d.enemyLevels && typeof d.enemyLevels === 'object' ? { spread: Math.max(0, Math.round(Number(d.enemyLevels.spread) || 0)) } : null;
    this.cheated = !!d.cheated;
    this.allowAchievements = !!d.allowAchievements;
    this.seasonPick = d.seasonPick ?? null;
    this.groupQueue = [...(d.groupQueue ?? [])];
    this.realDay = d.realDay ?? '';
    this.sprint = !!d.sprint;
    this.pin = d.pin && Number.isFinite(d.pin.x) && Number.isFinite(d.pin.z) ? { x: d.pin.x, z: d.pin.z } : null;
    this.journalTabs.clear();
    for (const [k, v] of Object.entries(d.journalTabs ?? {})) this.journalTabs.set(k, v);
    this.rel.clear();
    for (const [k, v] of Object.entries(d.rel ?? {})) this.rel.set(k, v);
    this.switches.clear();
    this.variables.clear();
    this.cut.clear();
    this.fires.clear();
    this.weather.clear();
    this.records.clear();
    this.forge.clear();
    // Shards aren't set in gear any more (heroes wear element stones instead): only upgrades are kept; a shard that was
    // set in something is simply free in the bag again.
    for (const [k, v] of Object.entries(d.forge ?? {})) if (v && typeof v === 'object' && v.level) this.forge.set(k, { level: Math.max(0, Math.round(Number(v.level) || 0)) });
    for (const [k, v] of Object.entries(d.records ?? {})) if (Number.isFinite(Number(v))) this.records.set(k, Number(v));
    for (const [m, w] of Object.entries(d.weather ?? {})) if (w && typeof w.kind === 'string') this.weather.set(m, { kind: w.kind, amount: w.amount, wind: w.wind, ...(w.spell !== undefined ? { spell: w.spell } : {}) });
    this.clock = Math.max(0, d.clock ?? 0);
    for (const [m, f] of Object.entries(d.fires ?? {})) this.fires.set(m, new Map(Object.entries(f).map(([k, v]) => [k, Number(v) || 0])));
    for (const [m, keys] of Object.entries(d.cut ?? {})) this.cut.set(m, new Set(keys));
    for (const [k, v] of Object.entries(d.switches ?? {})) this.switches.set(k, !!v);
    for (const [k, v] of Object.entries(d.variables ?? {})) this.variables.set(k, Number(v) || 0);
    for (const [k, v] of Object.entries(d.abilities ?? {})) this.abilities.set(k as Ability, !!v);
  }

  /** Plain-object snapshot, the starting point for save files. */
  toJSON(): { roosts?: Record<string, RoostState>; horse?: HorseState; expAllOff?: string[]; enemyLevels?: { spread: number }; switches: Record<string, boolean>; variables: Record<string, number>; abilities: Record<string, boolean>; cut?: Record<string, string[]>; clock?: number; fires?: Record<string, Record<string, number>>; weather?: Record<string, MapWeather>; records?: Record<string, number>; forge?: Record<string, ForgeEntry>; weaponsOff?: boolean; cheated?: boolean; allowAchievements?: boolean; forms?: Record<string, number>; body?: Record<string, { meter: number; wet: number }>; good?: Record<string, { kind: 'rested' | 'wellRested'; until: number }>; seasonPick?: string; groupQueue?: string[]; rel?: Record<string, number>; journalTabs?: Record<string, boolean>; realDay?: string; sprint?: boolean; pin?: { x: number; z: number } | null } {
    const out: ReturnType<GameState['toJSON']> = { switches: Object.fromEntries(this.switches), variables: Object.fromEntries(this.variables), abilities: Object.fromEntries(this.abilities) };
    if (this.weaponsOff) out.weaponsOff = true;
    const body = [...this.body].filter(([, b]) => Math.abs(b.meter) > 0.5 || b.wet > 0.01);
    const good = [...this.good].filter(([, g]) => g.until > this.clock);
    if (good.length) out.good = Object.fromEntries(good.map(([k, g]) => [k, { kind: g.kind, until: Math.round(g.until * 1000) / 1000 }]));
    if (body.length) out.body = Object.fromEntries(body.map(([k, b]) => [k, { meter: Math.round(b.meter * 10) / 10, wet: Math.round(b.wet * 100) / 100 }]));
    if (this.forms.size) out.forms = Object.fromEntries(this.forms);
    if (this.enemyLevels) out.enemyLevels = { ...this.enemyLevels };
    if (this.expAllOff.size) out.expAllOff = [...this.expAllOff];
    if (this.horse) out.horse = { ...this.horse };
    if (this.roosts.size) out.roosts = Object.fromEntries([...this.roosts].map(([k, v]) => [k, { ...v }]));
    if (this.cheated) out.cheated = true;
    if (this.allowAchievements) out.allowAchievements = true;
    if (this.seasonPick) out.seasonPick = this.seasonPick;
    if (this.groupQueue.length) out.groupQueue = [...this.groupQueue];
    if (this.rel.size) out.rel = Object.fromEntries(this.rel);
    if (this.realDay) out.realDay = this.realDay;
    if (this.sprint) out.sprint = true;
    if (this.pin) out.pin = { ...this.pin };
    if (this.journalTabs.size) out.journalTabs = Object.fromEntries(this.journalTabs);
    if (this.cut.size) out.cut = Object.fromEntries([...this.cut].map(([m, s]) => [m, [...s]]));
    if (this.clock) out.clock = this.clock;
    if (this.fires.size) out.fires = Object.fromEntries([...this.fires].map(([m, f]) => [m, Object.fromEntries(f)]));
    if (this.weather.size) out.weather = Object.fromEntries(this.weather);
    if (this.forge.size) out.forge = Object.fromEntries([...this.forge].map(([k, v]) => [k, { ...v }]));
    if (this.records.size) out.records = Object.fromEntries([...this.records].map(([k, v]) => [k, Math.round(v * 100) / 100]));
    return out;
  }
}

/** Identifies a placed prop across visits and saves: its type and position. */
export function propKey(p: { type: string; x: number; z: number }): string {
  return `${p.type}@${Math.round(p.x * 100) / 100},${Math.round(p.z * 100) / 100}`;
}
