/**
 * A turn-based battle from start to finish: who acts next (FFX-style conditional turns, or rounds), the party's
 * commands (Attack, Magic, Items, Guard, Run), the enemies' turns (their attack or their own actions), ailments
 * running on turns, and winning, losing or getting away.
 * The game supplies the fighters and does what lasts beyond the battle (items, rewards, the hero's health);
 * the screen shows it.
 */
import { elementIconUrl } from '../../art/elementIcons';
import { builtinIcon, builtinIconName } from '../../art/itemIcons';
import type { Sfx } from '../../audio/sfx';
import type { BattleScreen, ChoiceItem, FighterView, PickList, VictoryReport, BuffChip } from '../../ui/BattleScreen';
import type { Ailment, BattleWeather, BuffGrant, BuffKind, Element, EnemyAction, Inflict } from '../../world/types';
import { BUFF_INFO, DEBUFFS, buffChip, buffLabel } from '../status';
import type { TurnBasedConfig } from '../combat/config';
import { ELEMENT_COLORS } from '../elements';
import { TYPE_SPEED } from '../../ui/BattleScreen';
import { statusIconUrl } from '../../art/statusIcons';
import type { QteResult, Sphere } from '../../ui/BattleScreen';
import type { FaceButton } from '../../world/types';
import {
  type BattleAddition, type Battler, type BattleSpell, type Opening, RANK, type SpellRank, advanceTo, enemyChoice, fleeChance, forecast, healAmount, isUp, nextUp,
  BASE_ACCURACY, WEATHER_EFFECT, battleWeather, spellSequence, refreshAgility, regenAmount, roundOrder, spellBoost, spend, startCounters, strike, tickOf,
} from './rules';
import { DRAIN } from '../../ui/BattleScreen';
import { AILMENT_WORD, BLIND_MISS_CHANCE, BUFF_TURNS, type BattleAilment, ailmentName, rollInflicts } from './status';
import { hitChance } from '../attributes';

/** One fighter as the game hands it over. */
export interface BattleEntry { battler: Battler; view: FighterView; /** Party: 0 the hero, 1… members. */ who?: number; /** Enemies: the map's enemy (handed back when it's beaten). */ ref?: unknown }

export interface BattleItem { slot: number; name: string; count: number; detail?: string; icon?: string; restore?: { hp?: number; mp?: number }; pct?: { hp?: number; mp?: number }; cures?: string[]; buffs?: BuffGrant[] }

export type BattleOutcome = 'victory' | 'defeat' | 'fled';

/** A party member waiting on the bench (they can swap in on a turn). */
export interface ReserveView { who: number; name: string; icon: string; hp: number; maxHp: number; mp: number; maxMp: number; down: boolean; /** Buffs they still carry (from earlier in the battle). */ buffs?: BuffChip[] }

export interface BattleHost {
  sound(name: Sfx): void;
  /** Count something for the Journal's records (Additions performed, spells cast, battles won…). */
  tally?(key: string, n?: number, best?: boolean): void;
  /** A party member who can't fall (the console's deathless cheats): their health stops at 1. */
  protect?(who: number): boolean;
  /** Items usable in battle (consumables in the bag) right now. */
  items(): BattleItem[];
  /**
   * Use the item in bag slot `slot` on party member `who` (0 the hero), who has these battle ailments: what
   * happened, whether it was used up, and what it cures.
   */
  useItem(slot: number, who: number, ailments: BattleAilment[], by?: number): { text: string; used: boolean; cures: (Ailment | 'all')[]; buffs?: BuffGrant[] } | null;
  /** Use up one of the item in this bag slot (used on an enemy). */
  spendItem(slot: number): void;
  /** Play a voice clip or other sound file (call-outs, chants). */
  voice?(src: string): void;
  /** Party member `who` landed a weapon or bow attack: one of their attack sounds. */
  attackVoice?(who: number): void;
  /** The party members not fighting now (up to eight in the party, three fight). */
  reserves?(): ReserveView[];
  /** A party member's colour (Database → Heroes), for their sphere on the Pocket Handheld block. */
  heroColor?(who: number): string;
  /** Swap party member `outWho` (fighter `outKey`) for `inWho`: their entry, ready to fight (null: can't). */
  swapIn?(outKey: string, outWho: number, inWho: number): BattleEntry | null;
  /** Health and magic of party member `who` as the game has them now (after an item, say). */
  readVitals(who: number): { hp: number; mp: number };
  /** The weather the battle starts in (the map's: rain, snow…). */
  startWeather?(): BattleWeather;
  /** The battle's weather changed (null: the battle is over): show it (rain falling on a battle map, say). */
  weather?(kind: BattleWeather | null): void;
  /** Write a party member's health and magic back to the game. */
  writeVitals(who: number, hp: number, mp: number): void;
  /** The battle was won: hand out the rewards for these enemies and say what was won (lines for the panel). */
  victory(beaten: unknown[]): VictoryReport;
  /** The results are shown: the victory fanfare and tune. */
  fanfare?(): void;
  /** Leaving the battle: fade out (picture and sound), then `done` closes it (and the field fades back in). */
  outro?(done: () => void): void;
  /** The battle is over and its screen closed. */
  finished(outcome: BattleOutcome, beaten: unknown[]): void;
  /** Party member `who` performed an Addition in full: count it towards its next rank (the new rank if it went up). */
  mastered?(who: number, addition: string): number | null;
  /**
   * A foe fell (`by`: the party member whose hit did it, or null; `weak`: a hit it's weak to). `fighting`: the party
   * members standing in the battle. EXP each earned from it (shown as it falls).
   */
  foeDefeated?(foe: string, by: number | null, weak: boolean, fighting: number[]): { who: number; xp: number }[];
  /** Where a hero's EXP bar would be now, with what they've earned so far this battle (Pocket Handheld). */
  xpPreview?(who: number): { level: number; frac: number };
  /** Single mode, one foe at a time: the next foe (`e`) steps in where `outKey` fell. */
  foeIn?(outKey: string, e: BattleEntry): void;
  /** Party member `who` landed an Addition strike on `foe` (or `complete`d one): bonus EXP for it. */
  strikeExp?(who: number, foe: string, result: 'perfect' | 'good' | 'complete'): number;
  log(text: string): void;
  /** Relationships (Update 124): `rater` warms to `rated` (party indexes: 0 the hero, 1… members). */
  bond?(kind: import('../../world/types').RelationKind, rater: number, rated: number): void;
  /** The battle began (relationship caps reset). */
  begun?(): void;
}

type Phase = 'off' | 'intro' | 'next' | 'command' | 'busy' | 'over';

/** Pocket Handheld's line when an ailment takes hold. */
const GOT_AILMENT: Partial<Record<BattleAilment, string>> = {
  burn: 'was burned!', poison: 'was poisoned!', chill: 'was chilled!', frozen: 'froze solid!', paralyze: 'is paralyzed! It may be unable to move!',
  blind: 'was blinded!', silence: 'was silenced!', sleep: 'fell asleep!', confusion: 'became confused!', zombie: 'turned into a zombie!',
};

/** Pocket Handheld: how long an attacker takes to step back after a hit, before the target flashes. */
const STEP_BACK = 0.3;

export class TurnBattle {
  private all: BattleEntry[] = [];
  private phase: Phase = 'off';
  private wait = 0;
  private then: (() => void) | null = null;
  private cfg!: TurnBasedConfig;
  private opening: Opening = 'normal';
  /** Rounds: who's still to act this round, and the round number. */
  private queue: Battler[] = [];
  /** Single battle mode (Pokémon-style): one hero out, the hero picks first, then the faster goes first. */
  private single = false;
  /** Single mode: the hero choosing this round's action, and what they chose (`first`: a swap, an item, guarding or running goes first). */
  private planning: Battler | null = null;
  private planned: { b: Battler; run: () => void; first: boolean } | null = null;
  /** Single mode, one at a time: foes still to step in, and those already beaten and gone. */
  private waiting: BattleEntry[] = [];
  private gone: BattleEntry[] = [];
  private round = 0;
  private actor: Battler | null = null;
  private lastCommand = 0;

  constructor(private readonly screen: BattleScreen, private readonly host: BattleHost) {}

  get active(): boolean { return this.phase !== 'off'; }

  /** This battle's own rules (a scripted battle): whether the party may run. */
  rules: { canRun?: boolean } = {};

  start(entries: BattleEntry[], cfg: TurnBasedConfig, opening: Opening, rules: { canRun?: boolean; waiting?: BattleEntry[] } = {}): void {
    this.hurt = false;
    this.partyFell = false;
    this.cover = null; this.hitter = null; this.downedBy.clear();
    this.host.begun?.();
    this.announced = false; this.combo = null;
    this.rules = rules;
    for (const e of entries) e.battler.charging = null;
    this.all = entries;
    this.single = cfg.mode === 'single';
    this.planning = null; this.planned = null;
    this.waiting = [...(rules.waiting ?? [])]; this.gone = [];
    for (const e of this.waiting) { e.battler.charging = null; e.battler.guarding = false; refreshAgility(e.battler); }
    // Single mode takes turns in rounds (fastest first), with no turn order bar.
    this.cfg = this.single ? { ...cfg, order: 'rounds' } : cfg;
    this.fought.clear();
    this.opening = opening;
    this.round = 0;
    this.queue = [];
    this.actor = null;
    this.lastCommand = 0;
    for (const e of entries) { e.battler.guarding = false; refreshAgility(e.battler); }
    this.screen.setLayout(cfg.layout);
    this.screen.setBlocks(cfg.statBlocks);
    this.screen.setPills(cfg.statusPills, cfg.statusWords);
    // The weather it starts in (the map's), for the whole battle unless a spell changes it.
    this.weatherLeft = Infinity;
    battleWeather.kind = this.baseWeather = this.host.startWeather?.() ?? 'none';
    // Overdrive gauges only show (and work) with the stat blocks.
    for (const e of entries) if (!cfg.statBlocks || !e.view.overdrive) e.battler.overdrive = undefined;
    this.screen.open(entries.map((e) => e.view));
    this.refreshAll();
    this.updateSpheres();
    startCounters(this.battlers, opening);
    this.screen.flash();
    this.screen.setWeather(this.weatherText());
    const foes = this.foes;
    const names = foes.length === 1 ? foes[0].name : `${foes.length} enemies`;
    const intro = opening === 'preemptive' ? `You caught ${names} off guard!` : opening === 'ambush' ? `Ambushed by ${names}!` : `${names} ${foes.length === 1 ? 'appears' : 'appear'}!`;
    if (this.screen.pocket) this.tell(intro); else this.screen.message(intro, true);
    this.say(opening === 'ambush' ? `Ambushed by ${names}` : `Battle: ${names}`);
    this.phase = 'intro';
    this.showOrder();
    this.later(1.1, () => { this.screen.message(''); this.phase = 'next'; });
  }

  /** A line for the adventure log and the battle log beside the battle. */
  private say(text: string): void { this.screen.logLine(text); this.host.log(text); }

  /** Pocket Handheld: a line in the text box that waits for OK (and the battle with it). Other layouts: nothing. */
  private tell(text: string, extra?: { sound?: string; stats?: string[]; bars?: () => void }): void { this.screen.narrate(text, true, extra); }

  /** Pocket Handheld: say what's happening and wait for OK before it happens. Other layouts: straight on. */
  private announce(line: string, go: () => void): void {
    if (!this.screen.pocket) { go(); return; }
    // The line types out, a short pause, then it happens (no button needed).
    this.screen.narrate(line, false);
    this.later(line.length / TYPE_SPEED + 0.55, go);
  }

  /** Pocket Handheld: the move has been announced (the second call carries it out). */
  private announced = false;

  /** An Addition's strikes, added up for one line at the end ("It does 34 damage!"). */
  private combo: { total: number; element: Element; crit: boolean; weak: boolean; resist: boolean; t: Battler } | null = null;

  /** Pocket Handheld's lines after a hit: a critical, and how effective it was (the numbers show on the fighters). */
  private tellHit(crit: boolean, weak: boolean, resist: boolean): void {
    if (!this.screen.pocket) return;
    if (crit) this.tell('A critical hit!');
    if (weak) this.tell('It’s super effective!');
    else if (resist) this.tell('It’s not very effective…');
  }

  private flushCombo(): void {
    const c = this.combo;
    this.combo = null;
    if (c && c.total > 0) this.tellHit(c.crit, c.weak, c.resist);
  }

  private get battlers(): Battler[] { return this.all.map((e) => e.battler); }
  private get party(): Battler[] { return this.all.filter((e) => e.battler.side === 'party').map((e) => e.battler); }
  private get foes(): Battler[] { return this.all.filter((e) => e.battler.side === 'enemy').map((e) => e.battler); }
  private entry(b: Battler): BattleEntry { return this.all.find((e) => e.battler === b)!; }
  private sideOf(b: Battler): Battler[] { return b.side === 'party' ? this.party : this.foes; }
  private otherSide(b: Battler): Battler[] { return b.side === 'party' ? this.foes : this.party; }

  update(dt: number): void {
    if (this.phase === 'off') return;
    this.screen.update(dt);
    this.lowHpAlarm(dt);
    // Pauses (for an animation to play out) run on while the text box is read, so OK goes straight on to what's next
    // instead of sitting out the rest of the pause after the chime.
    if (this.wait > 0) this.wait -= dt;
    // Pocket Handheld: the battle waits while the text box has lines to read.
    if (this.screen.narrating) return;
    if (this.wait > 0) return;
    if (this.then) { const t = this.then; this.then = null; t(); return; }
    if (this.phase === 'next') this.nextTurn();
  }

  private later(seconds: number, fn: () => void): void { this.wait = seconds; this.then = fn; }

  private alarmT = 0;
  /**
   * A soft two-note alert, looping while a hero out fighting has health in the red (a fifth or less with the handheld
   * blocks, a quarter otherwise). It stops when the foes are down, the hero is healed out of the red, or the one out
   * is swapped for someone who isn't in the red.
   */
  private lowHpAlarm(dt: number): void {
    const red = this.screen.pocket ? 0.2 : 0.25;
    const on = this.phase !== 'over' && this.foes.some(isUp) && this.party.some((b) => isUp(b) && b.hp <= b.maxHp * red);
    if (!on) { this.alarmT = 0; return; }
    this.alarmT -= dt;
    if (this.alarmT <= 0) { this.host.sound('lowHp'); this.alarmT = 0.9; }
  }

  /* ------------------------------------------------------------------ turns */

  /** For each foe, the heroes who have been out fighting it (they share its EXP). */
  private fought = new Map<string, Set<number>>();
  private noteFighting(): void {
    const out = this.party.filter(isUp).map((p) => this.entry(p).who ?? 0);
    for (const f of this.foes) { if (!isUp(f) && this.fought.has(f.key)) continue; let set = this.fought.get(f.key); if (!set) this.fought.set(f.key, (set = new Set())); for (const w of out) set.add(w); }
  }

  private nextTurn(): void {
    if (this.checkOver()) return;
    this.noteFighting();
    let who: Battler | null;
    if (this.cfg.order === 'rounds') {
      this.queue = this.queue.filter(isUp);
      if (!this.queue.length) {
        // The round is over: burn and poison bite everyone they're on, a line each.
        if (this.round > 0 && this.bitRound !== this.round) { this.bitRound = this.round; if (this.roundEnd()) return; }
        // Single mode: the hero picks first; then everyone goes, fastest first (a swap, an item, guarding or running before anything).
        if (this.single && !this.planned) { const h = this.party.find(isUp); if (h && !h.charging) { this.planRound(h); return; } }
        this.round++; this.queue = roundOrder(this.battlers, this.round === 1 ? this.opening : 'normal'); if (!this.queue.length) this.queue = roundOrder(this.battlers);
        const p = this.planned;
        if (p) {
          if (!this.queue.includes(p.b) && isUp(p.b)) this.queue.push(p.b);
          if (p.first) this.queue = [p.b, ...this.queue.filter((x) => x !== p.b)];
          this.say(this.queue[0] === p.b ? `${p.b.name} moves first` : `${this.queue[0].name} moves first`);
        }
      }
      who = this.queue.shift() ?? null;
    } else {
      who = nextUp(this.battlers);
      if (who) advanceTo(this.battlers, who);
    }
    if (!who) return;
    this.actor = who;
    // Single mode: what the hero chose for this round (lost if an ailment takes the turn).
    const plan = this.planned?.b === who ? this.planned : null;
    if (plan) this.planned = null;
    // Guarding (and its ward against ailments) lasts until their own next turn.
    who.guarding = false;
    const start = who.status.startTurn(who.maxHp, this.cfg.order !== 'rounds');
    this.refresh(who);
    this.showOrder();
    this.phase = 'busy';
    // Burn and poison bite first; then an ailment may take the turn.
    let pause = 0;
    for (const d of start.damage) {
      who.hp = Math.max(this.floor(who), who.hp - d.amount);
      this.screen.popup(who.key, String(d.amount), 'dmg', d.ailment === 'burn' ? '#ff9a5a' : '#8ee05a');
      this.screen.animate(who.key, 'hit');
      this.say(`${who.name} takes ${d.amount} from ${d.ailment === 'burn' ? 'the burn' : 'poison'}`);
      this.tell(`${who.name} is hurt by ${d.ailment === 'burn' ? 'its burn' : 'poison'}!`);
      pause = 0.6;
    }
    if (start.damage.length) {
      this.refresh(who);
      if (!isUp(who)) { this.fall(who); this.later(0.7, () => this.endTurn(who!, RANK.attack, 0.2)); return; }
    }
    const go = () => {
      if (start.skip) {
        const words: Partial<Record<BattleAilment, string>> = { frozen: 'is frozen solid', paralyze: 'is paralyzed', sleep: 'is asleep' };
        this.screen.message(`${who!.name} ${words[start.skip] ?? 'can’t move'}…`);
        this.tell(({ frozen: `${who!.name} is frozen solid!`, paralyze: `${who!.name} is paralyzed! It can’t move!`, sleep: `${who!.name} is fast asleep!` } as Partial<Record<BattleAilment, string>>)[start.skip] ?? `${who!.name} can’t move!`);
        this.screen.popup(who!.key, ailmentName(start.skip), 'info');
        this.endTurn(who!, RANK.attack, 0.9);
        return;
      }
      if (who!.charging) { this.chargeTurn(who!); return; }
      if (start.confused) { this.confusedTurn(who!); return; }
      // Each hero's turn starts on Attack (going back from Magic or Items keeps the place within the turn).
      if (who!.side === 'party') { if (plan) { plan.run(); return; } this.lastCommand = 0; this.commandMenu(who!); }
      else this.later(0.45, () => this.enemyTurn(who!));
    };
    if (pause) this.later(pause, go); else go();
  }

  /**
   * Pocket Handheld: the spheres. Foes: those beaten (knocked out), those fighting and those still to come; the party:
   * everyone who can fight (the reserves too), up to four.
   */
  private updateSpheres(): void {
    if (!this.screen.pocket) return;
    const foes = [...this.gone.map((e) => e.battler), ...this.foes, ...this.waiting.map((e) => e.battler)];
    this.screen.setSpheres('enemy', foes.map((b) => (isUp(b) ? 'up' : 'ko')));
    const res = this.host.reserves?.() ?? [];
    const party: Sphere[] = [...this.party.map((b): Sphere => (isUp(b) ? 'up' : 'ko')), ...res.map((r): Sphere => (r.down ? 'ko' : 'up'))];
    // Each hero's sphere in their own colour (foes keep the orange).
    const colors = this.host.heroColor ? [...this.party.map((b) => this.host.heroColor!(this.entry(b).who ?? 0)), ...res.map((r) => this.host.heroColor!(r.who))] : undefined;
    this.screen.setSpheres('party', party, colors);
  }

  /** Single mode: the hero on the field chooses this round's action (it happens in its place in the round). */
  private planRound(h: Battler): void {
    this.planning = h;
    this.actor = h;
    this.lastCommand = 0;
    this.commandMenu(h);
  }

  /** Single mode, while the hero is choosing: keep the action for its place in the round. True: kept (do nothing now). */
  private defer(b: Battler, run: () => void, first = false): boolean {
    if (!this.single || this.planning !== b) return false;
    this.planning = null;
    this.planned = { b, run, first };
    this.screen.idle();
    this.screen.message('');
    this.phase = 'next';
    return true;
  }

  /** A foe chosen before the round may have fallen (or been replaced): the one standing now. */
  private retarget(b: Battler, t: Battler): Battler {
    if (isUp(t) || t.side === b.side) return t;
    return this.otherSide(b).find(isUp) ?? t;
  }

  /** Single mode, one at a time: the next foe steps in where the last one fell. */
  private nextFoe(): boolean {
    const old = this.all.find((e) => e.battler.side === 'enemy' && !isUp(e.battler));
    if (!old || !this.waiting.length) return false;
    const e = this.waiting.shift()!;
    this.gone.push(old);
    this.all[this.all.indexOf(old)] = e;
    this.screen.replaceFighter(old.battler.key, e.view);
    this.host.foeIn?.(old.battler.key, e);
    this.refresh(e.battler);
    this.updateSpheres();
    this.queue = [];
    this.phase = 'busy';
    this.screen.message(`${e.battler.name} steps in!`, true);
    this.say(`${e.battler.name} steps in`);
    this.host.sound('menuOk');
    this.later(1.2, () => { this.screen.message(''); this.phase = 'next'; });
    return true;
  }

  /** Single mode: the hero is down, but others can fight: choose who comes in (no turn used). */
  private forceSwap(): boolean {
    const res = (this.host.reserves?.() ?? []).filter((r) => !r.down), b = this.party[0];
    if (!res.length || !b) return false;
    this.phase = 'command';
    this.planning = null; this.planned = null;
    this.screen.message(`${b.name} is down! Who’s next?`, true);
    this.screen.choose('Send in', res.map((r) => ({ label: r.name, iconUrl: r.icon, inlineIcon: true, bars: { hp: r.hp, maxHp: r.maxHp, mp: r.mp, maxMp: r.maxMp, xp: this.host.xpPreview?.(r.who)?.frac }, buffs: r.buffs })),
      (i) => this.doSwap(b, res[i].who, true));
    return true;
  }

  /** The turn order bar: CTB's forecast (with what the chosen command would change), or this round and the next. */
  private showOrder(rank?: number): void {
    // Single mode has none: the faster simply goes first.
    if (this.single) { this.screen.setOrder([], null); return; }
    const active = this.actor && this.phase !== 'intro' ? this.actor : null;
    let list: Battler[];
    if (this.cfg.order === 'rounds') {
      const rest = this.queue.filter(isUp);
      list = [...(active ? [active] : []), ...rest, ...roundOrder(this.battlers, 'normal', () => 0.5)].slice(0, 8);
    } else list = forecast(this.battlers, 8, active ?? undefined, rank ?? RANK.attack);
    this.screen.setOrder(list.map((b) => b.key), active?.key ?? null);
  }

  private commandMenu(b: Battler): void {
    this.phase = 'command';
    const items = this.host.items();
    const canFlee = this.rules.canRun !== false && !this.foes.some((f) => isUp(f) && f.boss);
    const silenced = b.status.silenced;
    // Legend of Dragoon style: a row of pictures.
    let cmds: (ChoiceItem & { run: () => void })[] = [
      { label: 'Attack', icon: 'attack', rank: RANK.attack, right: this.attackLabel(b), detail: 'Strike a foe (or anyone)', run: () => this.attackMenu(b) },
      { label: 'Guard', icon: 'guard', rank: RANK.guard, detail: this.cfg.guardHeal > 0 ? `Half damage, +${this.cfg.guardHeal}% HP, no ailments` : 'Half damage, no ailments', run: () => this.doGuard(b) },
      { label: 'Magic', icon: 'magic', rank: RANK.magic, disabled: !b.spells.length || silenced, detail: silenced ? 'Silenced' : b.spells.length ? 'Cast a spell' : 'No spells learned', run: () => this.magicMenu(b) },
      { label: 'Items', icon: 'items', rank: RANK.item, disabled: !items.length, detail: items.length ? 'Use an item' : 'Nothing to use', run: () => this.itemMenu(b) },
      ...(this.host.reserves?.().length ? [{ label: 'Swap', icon: 'swap', disabled: !this.host.reserves!().some((r) => !r.down), detail: this.single ? 'Bring in someone else (goes first; they take this round’s hits)' : 'Bring in someone from the party (no turn used: they take this one)', run: () => this.swapMenu(b) }] : []),
      { label: 'Escape', icon: 'escape', rank: RANK.flee, disabled: !canFlee, detail: canFlee ? 'Try to run away' : 'Can’t run from this fight', run: () => this.doFlee(b) },
    ];
    // Pocket Handheld: a 3 × 2 grid, the actions on top (Attack, Magic, Items), the rest under them.
    if (this.screen.pocket) { const order = ['Attack', 'Magic', 'Items', 'Guard', 'Swap', 'Escape']; cmds = [...cmds].sort((x, y) => order.indexOf(x.label) - order.indexOf(y.label)); }
    this.screen.message(this.screen.pocket ? `What will ${b.name} do?` : `${b.name}’s turn`, true);
    this.screen.choose(b.name, cmds, (i) => { this.lastCommand = i; this.screen.message(''); cmds[i].run(); }, undefined, (i) => this.showOrder(cmds[i].rank), this.lastCommand, true);
  }

  /** Swap: choose who comes in from the bench. */
  private swapMenu(b: Battler): void {
    const res = this.host.reserves?.() ?? [];
    // A face on the left, the name, then health, magic and EXP bars under it (no numbers repeated on the right).
    this.screen.choose('Swap in', res.map((r) => ({ label: r.name, iconUrl: r.icon, inlineIcon: true, right: r.down ? 'KO' : undefined, disabled: r.down,
      bars: { hp: r.hp, maxHp: r.maxHp, mp: r.mp, maxMp: r.maxMp, xp: this.host.xpPreview?.(r.who)?.frac }, buffs: r.buffs })),
    (i) => this.doSwap(b, res[i].who), () => this.commandMenu(b));
  }

  /** Pass the baton: `b` leaves the battle, the newcomer stands where they stood and takes this turn. */
  private doSwap(b: Battler, who: number, forced = false): void {
    if (!forced && this.defer(b, () => this.doSwap(b, who), true)) return;
    const out = this.entry(b), e = this.host.swapIn?.(b.key, out.who ?? 0, who);
    if (!e) { this.commandMenu(b); return; }
    this.host.writeVitals(out.who ?? 0, b.hp, b.mp);
    // Stepping in for someone hurt (Update 124): if the newcomer takes the next blow, the one saved warms to them.
    this.cover = !forced && b.hp > 0 && b.hp < b.maxHp * 0.5 ? { saved: out.who ?? 0, by: e.who ?? 0, savedHp: b.hp } : null;
    this.all[this.all.indexOf(out)] = e;
    const n = e.battler;
    n.ct = b.ct; n.charging = null; n.guarding = false;
    refreshAgility(n);
    this.screen.replaceFighter(b.key, e.view);
    this.refresh(n);
    this.host.sound('menuOk');
    this.say(`${b.name} swaps out for ${n.name}`);
    this.updateSpheres();
    this.screen.message(`${n.name} steps in!`);
    this.actor = n;
    this.showOrder();
    this.phase = 'busy';
    // Single mode: the swap was the turn (a knocked-out hero's replacement just steps in).
    if (this.single) { if (forced) this.later(0.9, () => { this.screen.message(''); this.phase = 'next'; }); else this.endTurn(n, RANK.item, 0.8); return; }
    this.later(0.8, () => { this.lastCommand = 0; this.commandMenu(n); });
  }

  /** The party members fighting now (0 the hero), in their places: the lineup to keep after the battle. */
  /** Each hero's ailments as the battle ends (turns left), fighting or on the bench: they last into the next battle. */
  partyAilments(): { who: number; turns: [BattleAilment, number][] }[] {
    return [...this.all, ...this.waiting].filter((e) => e.battler.side === 'party' && e.battler.hp > 0)
      .map((e) => ({ who: e.who ?? 0, turns: e.battler.status.list.filter((a) => a !== 'stagger').map((a) => [a, e.battler.status.turns.get(a)!] as [BattleAilment, number]) }));
  }

  lineup(): number[] { return this.all.filter((e) => e.battler.side === 'party').map((e) => e.who ?? 0); }

  /** What Attack does: the set Addition's name (when Additions are set per hero). */
  private attackLabel(b: Battler): string {
    if (this.cfg.additions !== 'set' || !b.addition) return '';
    return b.additions?.find((a) => a.id === b.addition)?.name ?? '';
  }

  private attackMenu(b: Battler): void {
    // Anyone can be targeted (foes first): a confused friend, a zombie ally…
    const foes = this.anyone(this.otherSide(b), b);
    const adds = b.additions ?? [];
    // Set per hero: Attack performs it (or a plain attack without one).
    if (this.cfg.additions === 'set' || !adds.length) {
      const a = adds.find((x) => x.id === b.addition);
      this.pickTarget(foes, (t) => (a ? this.doAddition(b, a, t) : this.doAttack(b, t)), () => this.commandMenu(b));
      return;
    }
    // Chosen each time: any Addition they know (Update 125: no plain attack in the list; a hero with no Additions
    // just attacks, above).
    const list: ChoiceItem[] = [
      ...adds.map((a) => ({ label: a.name, icon: 'attack', iconColor: '#ffc46e', right: `${a.strikes.length} hit${a.strikes.length === 1 ? '' : 's'} · Rank ${a.rank}`, detail: a.toNext === null ? 'Mastered' : `${a.toNext} more to rank ${a.rank + 1}`, rank: RANK.attack }))];
    this.screen.choose('Attack', list, (i) => {
      const a = adds[i];
      this.pickTarget(foes, (t) => (a ? this.doAddition(b, a, t) : this.doAttack(b, t)), () => this.attackMenu(b));
    }, () => this.commandMenu(b), () => this.showOrder(RANK.attack));
  }

  private magicMenu(b: Battler): void {
    const list = b.spells.map((s) => {
      const top = s.ranks[s.ranks.length - 1], low = s.ranks[0];
      return { label: s.ranks.length > 1 ? `${s.name} (rank ${top.rank})` : s.name, icon: 'magic', iconColor: s.color ?? ELEMENT_COLORS[s.element], iconUrl: s.icon ? builtinIcon(builtinIconName(s.icon) ?? 'spell_fire', s.iconTint).toDataURL() : s.element && s.element !== 'neutral' ? elementIconUrl(s.element) : undefined, inlineIcon: true, right: `${low.mp} MP`, disabled: low.mp > b.mp, rank: RANK.magic,
        detail: [s.description, s.kind === 'heal' ? (s.targets === 'all' ? 'Heals the whole party' : 'Heals one') : s.kind === 'support' ? [s.buffs?.length ? `${s.buffs.map((g) => buffLabel(g.buff)).join(', ')} for ${s.supportTarget === 'foes' ? (s.targets === 'all' ? 'every foe' : 'one foe') : s.supportTarget === 'any' ? (s.targets === 'all' ? 'either side' : 'anyone') : s.targets === 'all' ? 'the whole party' : 'one'}` : '', s.weather ? `${WEATHER_EFFECT[s.weather].name}: ${WEATHER_EFFECT[s.weather].text.toLowerCase()}` : ''].filter(Boolean).join('; ') || 'Support' : `${s.element === 'neutral' ? 'Magic' : s.element[0].toUpperCase() + s.element.slice(1)} damage to ${s.targets === 'all' ? 'every foe' : 'one foe'}`, low.charge ? `charges ${low.charge} turn${low.charge === 1 ? '' : 's'}` : 'goes off at once'].filter(Boolean).join(' · ') };
    });
    this.screen.choose('Magic', list, (i) => this.rankMenu(b, b.spells[i]), () => this.commandMenu(b), () => this.showOrder(RANK.magic));
  }

  /** Spells known at more than one rank: choose the rank (higher hits harder, costs more and charges longer). */
  private rankMenu(b: Battler, s: BattleSpell): void {
    const go = (r: SpellRank) => {
      const back = () => (s.ranks.length > 1 ? this.rankMenu(b, s) : this.magicMenu(b));
      const friendly = s.kind === 'heal' || (s.kind === 'support' && s.supportTarget !== 'foes');
      const mine = friendly ? this.sideOf(b) : this.otherSide(b), theirs = friendly ? this.otherSide(b) : this.sideOf(b);
      // A weather spell with nothing else to give: it covers the whole battle, no target to choose.
      if (s.kind === 'support' && s.weather && !s.buffs?.length) { this.phase = 'busy'; this.doSpell(b, s, r, [b]); return; }
      // Support spells keep to their side unless they can go on either.
      const oneSide = s.kind === 'support' && s.supportTarget !== 'any';
      if (s.targets === 'all') {
        // The whole group: the usual one, or (left / right) the other side.
        const a = mine.filter(isUp), o = oneSide ? [] : theirs.filter(isUp);
        this.screen.target(a.map((t) => t.key), (k) => { this.phase = 'busy'; this.doSpell(b, s, r, (a.some((t) => t.key === k) ? a : o)); }, () => { this.showOrder(); back(); }, undefined, true, o.map((t) => t.key));
        return;
      }
      this.pickTarget(oneSide ? mine.filter(isUp) : this.anyone(mine, b), (t) => this.doSpell(b, s, r, [t]), back, friendly ? b : undefined);
    };
    if (s.ranks.length === 1) { go(s.ranks[0]); return; }
    this.screen.choose(s.name, s.ranks.map((r) => ({ label: r.name, icon: 'magic', iconColor: s.color ?? ELEMENT_COLORS[s.element], right: `${r.mp} MP`, disabled: r.mp > b.mp, rank: RANK.magic,
      detail: r.charge ? `Charges ${r.charge} turn${r.charge === 1 ? '' : 's'} before it goes off` : 'Goes off at once' })),
    (i) => go(s.ranks[i]), () => this.magicMenu(b), () => this.showOrder(RANK.magic), s.ranks.length - 1);
  }

  private itemMenu(b: Battler): void {
    const items = this.host.items();
    if (!items.length) { this.commandMenu(b); return; }
    this.screen.choose('Items', items.map((it) => ({ label: it.name, iconUrl: it.icon, icon: 'items', inlineIcon: true, right: `×${it.count}`, detail: it.detail, rank: RANK.item })), (i) => {
      const it = items[i];
      if (this.screen.pocket) { this.itemLists(b, it); return; }
      this.pickTarget(this.anyone(this.sideOf(b), b), (t) => this.doItem(b, it, t), () => this.itemMenu(b), b);
    }, () => this.commandMenu(b), () => this.showOrder(RANK.item));
  }

  /**
   * Pocket Handheld: whom an item is for, from two lists: the party (the one out first, in gold, then the bench) and
   * the foes. Items that harm (debuffs) put the foes first and start there; the rest start on the party.
   */
  private itemLists(b: Battler, it: BattleItem): void {
    const harms = !!it.buffs?.some((g) => DEBUFFS.has(g.buff));
    const party: PickList = { title: 'Party', rows: [
      ...this.party.map((p) => ({ key: p.key, name: p.name, hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp, down: !isUp(p), gold: p === b, buffs: chipsOf(p) })),
      ...(this.host.reserves?.() ?? []).map((r) => ({ key: `res:${r.who}`, name: r.name, hp: r.hp, maxHp: r.maxHp, mp: r.mp, maxMp: r.maxMp, down: r.down })),
    ] };
    const foes: PickList = { title: 'Foes', rows: this.foes.filter(isUp).map((f) => ({ key: f.key, name: f.name, hp: f.hp, maxHp: f.maxHp, buffs: chipsOf(f) })) };
    const lists = harms ? [foes, party] : [party, foes];
    this.screen.message(`Use ${it.name} on whom?`, true);
    this.screen.pickFromLists(lists, 0, (key) => {
      this.phase = 'busy';
      if (key.startsWith('res:')) { this.itemOnBench(b, it, Number(key.slice(4))); return; }
      const t = this.all.find((e) => e.battler.key === key)?.battler;
      if (t) this.doItem(b, it, t);
    }, () => this.itemMenu(b));
  }

  /** An item on a party member waiting on the bench (Single mode): it works on them, and it's the turn. */
  private itemOnBench(b: Battler, it: BattleItem, who: number): void {
    if (this.defer(b, () => this.itemOnBench(b, it, who), true)) return;
    const res = this.host.reserves?.().find((r) => r.who === who), name = res?.name ?? 'them';
    this.screen.animate(b.key, 'toss');
    this.later(0.45, () => {
      const r = this.host.useItem(it.slot, who, [], this.entry(b).who ?? 0);
      // Healing someone hurt on the bench, or bringing them back (Update 124): they warm to whoever did it.
      if (r?.used && res && who !== (this.entry(b).who ?? 0)) {
        if (res.down) this.host.bond?.('revive', who, this.entry(b).who ?? 0);
        else if (res.hp < res.maxHp * 0.6) this.host.bond?.('benchHeal', who, this.entry(b).who ?? 0);
      }
      if (!r?.used) { this.screen.message(r?.text || 'It wouldn’t do anything.'); this.phase = 'command'; this.later(1.1, () => this.itemMenu(b)); return; }
      this.host.sound('item');
      const msg = r.text || `${b.name} uses ${it.name} on ${name}.`;
      this.say(msg);
      this.tell(msg);
      this.updateSpheres();
      this.endTurn(b, RANK.item, 0.6);
    });
  }

  /** Everyone standing, the usual side first (its weakest first), then the other side. */
  private anyone(first: Battler[], b: Battler): Battler[] {
    const a = first.filter(isUp), rest = this.battlers.filter((x) => isUp(x) && !a.includes(x));
    void b;
    return [...a, ...rest];
  }

  private pickTarget(list: Battler[], pick: (t: Battler) => void, back: () => void, start?: Battler): void {
    if (!list.length) { back(); return; }
    // Pocket Handheld: with just one on the usual side (one foe out), no choosing: it's them.
    const usual = list.filter((x) => x.side === list[0].side && isUp(x));
    if (this.screen.pocket && !start && usual.length === 1) { this.phase = 'busy'; this.screen.idle(); pick(usual[0]); return; }
    // Start on the usual side's weakest (the first group in the list), or the actor themselves (items, healing).
    const side = list[0].side;
    const first = start ?? [...list].filter((x) => x.side === side).sort((x, y) => x.hp - y.hp)[0];
    this.screen.target(list.map((t) => t.key), (k) => { const t = list.find((x) => x.key === k); if (t) { this.phase = 'busy'; pick(t); } }, () => { this.showOrder(); back(); }, first.key);
  }

  /* ------------------------------------------------------------------ actions */

  private doAttack(b: Battler, t: Battler): void {
    if (this.defer(b, () => this.doAttack(b, this.retarget(b, t)))) return;
    if (this.screen.pocket && !this.announced) { this.announced = true; this.announce(`${b.name} attacks!`, () => this.doAttack(b, t)); return; }
    this.announced = false;
    // A ranged plain attack fires from where they stand; otherwise run in and swing.
    this.screen.animate(b.key, b.shoots ? 'shot' : 'lunge', undefined, t.key);
    this.host.sound(b.shoots ? 'shoot' : 'swing');
    this.later(0.28, () => {
      if (b.side === 'party') this.host.attackVoice?.(this.entry(b).who ?? 0);
      this.hit(b, t, b.attack, b.attackElement, b.attackMagic, b.inflicts);
      this.endTurn(b, RANK.attack, 0.75);
    });
  }

  /** Cast a spell: the magic is spent now; it goes off at once, or charges for its turns first. */
  private doSpell(b: Battler, s: BattleSpell, r: SpellRank, targets: Battler[]): void {
    if (this.defer(b, () => this.doSpell(b, s, r, targets.map((t) => this.retarget(b, t))))) return;
    b.mp = Math.max(0, b.mp - r.mp);
    this.refresh(b);
    const color = s.color ?? ELEMENT_COLORS[s.element];
    if (r.charge > 0) {
      b.charging = { spell: s, rank: r, targets, left: r.charge };
      this.screen.setCharging(b.key, `${r.name} · ${r.charge}`, color);
      this.screen.message(`${b.name} begins casting ${r.name}…`);
      this.host.sound('ringOn');
      this.say(`${b.name} begins casting ${r.name}`);
      // The camera comes round in front of them as they begin their chant, then goes back.
      this.castPose(b, color, s.chant, false, () => this.endTurn(b, RANK.magic, 0.5));
      return;
    }
    this.release(b, s, r, targets);
  }

  /** How long a close-up holds (short on the flat battle screen, which has no camera). */
  private hold(secs: number): number { return this.screen.staged ? secs : Math.min(secs, 0.35); }

  /**
   * A party member casting: the camera in front of them as they raise their arms (with the chant or the call-out),
   * held a moment, then back (`snap`: at once); then `then`. Enemies just glow.
   */
  private castPose(b: Battler, color: string, sound: string | undefined, snap: boolean, then: () => void): void {
    if (b.side !== 'party') { this.screen.animate(b.key, 'cast', color); this.later(0.3, then); return; }
    this.screen.shot('cast', b.key);
    this.screen.animate(b.key, 'pose', color);
    if (sound) this.host.voice?.(sound);
    this.later(this.hold(snap ? 1.4 : 1.8), () => {
      this.screen.animate(b.key, 'unpose');
      this.screen.shot(null, undefined, undefined, snap);
      then();
    });
  }

  /** A charging spell's turn: one turn closer, or it goes off now (at whoever is still standing). */
  private chargeTurn(b: Battler): void {
    const c = b.charging!;
    if (b.status.silenced) { this.interrupt(b, 'Silenced'); this.endTurn(b, RANK.magic, 0.8); return; }
    c.left--;
    if (c.left > 0) {
      this.screen.setCharging(b.key, `${c.rank.name} · ${c.left}`);
      this.screen.message(`${b.name} keeps casting ${c.rank.name}…`);
      this.endTurn(b, RANK.magic, 0.7);
      return;
    }
    b.charging = null;
    this.screen.setCharging(b.key, null);
    const side = (c.spell.kind === 'heal' ? this.sideOf(b) : this.otherSide(b)).filter(isUp);
    let targets = c.targets.filter(isUp);
    if (!targets.length && side.length) targets = c.spell.targets === 'all' ? side : [side[0]];
    if (!targets.length) { this.endTurn(b, RANK.magic, 0.3); return; }
    this.release(b, c.spell, c.rank, targets);
  }

  /** A charging spell broken (a Counterspell, Silence): the magic spent is lost. */
  private interrupt(b: Battler, why: string): void {
    const c = b.charging;
    if (!c) return;
    b.charging = null;
    this.screen.setCharging(b.key, null);
    this.screen.popup(b.key, why === 'Silenced' ? 'Spell lost' : 'Interrupted!', 'info');
    this.screen.message(`${b.name}’s ${c.rank.name} is ${why === 'Silenced' ? 'silenced' : 'broken'}!`);
    this.host.sound('block');
    this.say(`${b.name}’s ${c.rank.name} was interrupted`);
  }

  private release(b: Battler, s: BattleSpell, r: SpellRank, targets: Battler[]): void {
    if (this.screen.pocket && !this.announced) { this.announced = true; this.announce(`${b.name} casts ${r.name}!`, () => this.release(b, s, r, targets)); return; }
    this.announced = false;
    const color = s.color ?? ELEMENT_COLORS[s.element];
    if (!this.screen.pocket) this.screen.message(r.name);
    // A spell addition: the party caster presses its buttons in order first.
    const seq = b.side === 'party' ? spellSequence(s, r.rank) : [];
    if (seq.length) { this.castSequence(b, s, r, targets, color, seq); return; }
    // In front of the caster for the call-out, back to the battle, and only then does the spell go off.
    this.castPose(b, color, s.sound, true, () => this.unleash(b, s, r, targets, color));
  }

  /**
   * A spell addition: the camera on the caster, their buttons in order against the clock (each right one earns a
   * little EXP), then the spell goes off: weaker for a mistake or running out of time, stronger for a fast clean cast.
   */
  private castSequence(b: Battler, s: BattleSpell, r: SpellRank, targets: Battler[], color: string, seq: FaceButton[]): void {
    this.screen.shot('cast', b.key);
    this.screen.animate(b.key, 'pose', color);
    if (s.sound) this.host.voice?.(s.sound);
    const who = this.entry(b).who ?? 0, foe = (targets.find((t) => t.side === 'enemy') ?? this.foes.find(isUp))?.key ?? '';
    this.later(this.hold(0.5), () => this.screen.startSequence(seq, s.seqTime ?? 0.8 * seq.length + 1.2, this.cfg.additionTiming === 'auto',
      (_i, ok) => {
        if (!ok) { this.host.sound('block'); return; }
        this.host.sound('menuMove');
        this.expPop(b, this.host.strikeExp?.(who, foe, 'good') ?? 0);
      },
      (res) => {
        const clean = res.total > 0 && res.correct >= res.total;
        const mult = clean ? 1 + 0.15 * res.left : 0.5 + (0.5 * res.correct) / Math.max(1, res.total);
        if (clean) {
          this.screen.popup(b.key, res.left >= 0.5 ? 'Perfect cast!' : 'Cast!', 'info');
          this.expPop(b, this.host.strikeExp?.(who, foe, 'complete') ?? 0);
          if (res.left >= 0.5) this.expPop(b, this.host.strikeExp?.(who, foe, 'perfect') ?? 0);
        } else this.screen.popup(b.key, 'Weak cast', 'info');
        this.say(`${b.name}’s ${r.name}: ${clean ? 'a clean cast' : `${res.correct} of ${res.total} right`}`);
        this.later(0.25, () => {
          this.screen.animate(b.key, 'unpose');
          this.screen.shot(null, undefined, undefined, true);
          this.unleash(b, s, r, targets, color, { mult, clean });
        });
      }));
  }

  private unleash(b: Battler, s: BattleSpell, r: SpellRank, targets: Battler[], color: string, cast?: { mult: number; clean: boolean }): void {
    if (b.side === 'party') { this.host.tally?.('spells'); this.host.tally?.(`spell:${s.id}`); }
    this.screen.animate(b.key, 'cast', color);
    this.host.sound(s.kind === 'bolt' ? 'fire' : 'ringOn');
    // A spell addition's result: stronger or weaker; support spells set to "last longer" gain a turn (or two rounds of weather) when clean.
    const mult = cast?.mult ?? 1, longer = !!cast?.clean && s.seqBonus === 'longer';
    const buffs = !cast || !s.buffs ? s.buffs : s.buffs.map((g) => (longer ? (g.whole ? g : { ...g, turns: (g.turns ?? BUFF_TURNS) + 1 }) : s.seqBonus === 'longer' ? g : { ...g, amount: Math.max(1, Math.round((g.amount ?? BUFF_INFO[g.buff].amount) * mult)) }));
    this.later(0.4, () => {
      // A Magic buff (or debuff) on the caster makes the spell stronger (or weaker).
      const power = r.power * spellBoost(b) * mult;
      for (const t of targets) {
        if (!isUp(t)) continue;
        if (s.kind === 'heal') this.heal(b, t, healAmount(power, t));
        else if (s.kind === 'bolt') { this.aim = { spellAccuracy: s.accuracy, spellSure: s.sure }; this.hit(b, t, power, s.element, true, s.inflicts, color); this.aim = {}; }
        else this.screen.animate(t.key, 'heal', color);
        if (isUp(t) && buffs?.length) this.giveBuffs(b, t, buffs);
      }
      if (s.weather) { const w = s.weatherTurns ?? 5; this.setWeather(s.weather, w > 0 && longer ? w + 2 : w); }
      this.endTurn(b, RANK.magic, 0.8);
    });
  }

  /**
   * An Addition: the hero closes in, and each strike lands if its button is pressed as the ring meets the marker.
   * A miss ends the string (a first strike missed still lands, weakly). Performed in full, it counts towards the
   * next rank.
   */
  private doAddition(b: Battler, a: BattleAddition, t: Battler): void {
    if (this.defer(b, () => this.doAddition(b, a, this.retarget(b, t)))) return;
    if (this.screen.pocket && !this.announced) { this.announced = true; this.announce(`${b.name} attacks with ${a.name}!`, () => this.doAddition(b, a, t)); return; }
    this.announced = false;
    if (this.screen.pocket) this.combo = { total: 0, element: b.attackElement, crit: false, weak: false, resist: false, t };
    if (!this.screen.pocket) this.screen.message(a.name);
    // The camera closes in from a little to the side as the hero rushes in, and follows them.
    this.screen.shot('addition', b.key, t.key);
    this.screen.animate(b.key, 'approach', undefined, t.key);
    this.later(0.45, () => {
      // The opening strike can miss (accuracy against their evasion, or blindness): no buttons, a MISS, and back.
      const blind = b.status.blind && Math.random() < BLIND_MISS_CHANCE;
      if (blind || (!b.sure && !b.attackMagic && Math.random() * 100 >= hitChance(b.accuracy ?? BASE_ACCURACY, t.evasion ?? 0))) {
        this.screen.popup(t.key, 'MISS', 'big');
        this.screen.animate(t.key, 'dodge');
        this.host.sound('dodge');
        this.say(`${t.name} dodges ${b.name}’s ${a.name}`);
        this.host.tally?.('additions');
        this.later(this.hold(1.5), () => {
          this.screen.animate(b.key, 'back');
          this.later(0.5, () => { this.screen.shot(null); this.endTurn(b, RANK.attack, 0.3); });
        });
        return;
      }
      let landed = 0, power = 0;
      this.screen.startQte(t.key, a.strikes.map((x) => ({ button: x.button, time: x.time, window: x.window })), this.cfg.additionTiming === 'auto',
        (i: number, r: QteResult) => {
          const st = a.strikes[i];
          if (r === 'miss') {
            this.screen.popup(t.key, i === 0 ? 'Weak' : 'Missed', 'info');
            // A first strike missed still lands, weakly.
            if (i === 0) power += b.attack * st.power * a.damage * 0.5;
            return;
          }
          landed++;
          if (r === 'perfect') this.screen.popup(t.key, 'Perfect!', 'info');
          // EXP for each strike (more for a perfect one), like Legend of Dragoon's SP.
          this.expPop(b, this.host.strikeExp?.(this.entry(b).who ?? 0, t.key, r) ?? 0);
          this.screen.animate(b.key, 'strike');
          this.screen.animate(t.key, 'hit');
          this.host.sound('swing');
          power += b.attack * st.power * a.damage * (r === 'perfect' ? 1.1 : 1);
        },
        () => {
          const complete = landed === a.strikes.length;
          this.host.tally?.('additions'); this.host.tally?.(`addition:${a.id}`);
          // The damage, all at once, as the string ends.
          // (It already got past their guard: no second roll to miss.)
          if (power > 0 && isUp(t)) { this.aim = { sure: true, spellSure: true }; this.hit(b, t, power, b.attackElement, b.attackMagic, complete ? b.inflicts : undefined); this.aim = {}; }
          if (complete) {
            this.expPop(b, this.host.strikeExp?.(this.entry(b).who ?? 0, t.key, 'complete') ?? 0);
            if (a.sound) this.host.voice?.(a.sound); else this.host.attackVoice?.(this.entry(b).who ?? 0);
            this.screen.popup(b.key, a.strikes.length > 1 ? `${a.name}!` : 'Complete!', 'info');
            const up = this.host.mastered?.(this.entry(b).who ?? 0, a.id) ?? null;
            if (up) { this.screen.popup(b.key, `${a.name} rank ${up}!`, 'info'); this.say(`${b.name}’s ${a.name} reached rank ${up}`); this.host.sound('levelUp'); a.rank = up; }
          } else if (power > 0) this.host.attackVoice?.(this.entry(b).who ?? 0);
          // A moment to take it in, then back to their place (the camera with them).
          this.later(this.hold(1.6), () => {
            this.screen.animate(b.key, 'back');
            this.later(0.5, () => { this.screen.shot(null); this.endTurn(b, RANK.attack, 0.3); });
          });
        });
    });
  }

  /** An item: the user turns to whoever it's for and tosses it, then it takes effect. */
  private doItem(b: Battler, it: BattleItem, t: Battler): void {
    if (this.defer(b, () => this.doItem(b, it, t), true)) return;
    // Pocket Handheld: "Jordan used Potion!" first; it stays up while the bars fill.
    this.announce(`${b.name} used ${it.name}!`, () => {
      this.screen.animate(b.key, 'toss', undefined, t.key);
      this.later(0.45, () => this.applyItem(b, it, t));
    });
  }

  private applyItem(b: Battler, it: BattleItem, t: Battler): void {
    if (t.side === 'enemy') { this.itemOnFoe(b, it, t); return; }
    const who = this.entry(t).who ?? 0;
    const r = this.host.useItem(it.slot, who, t.status.list, this.entry(b).who ?? 0);
    // It did nothing (full health, say): say so and choose again; the turn isn't lost.
    if (!r?.used) { this.screen.message(r?.text || 'It wouldn’t do anything.'); this.phase = 'command'; this.later(1.1, () => this.itemMenu(b)); return; }
    // The item worked on the game's numbers: read them back.
    let gained = { hp: 0, mp: 0, up: false };
    for (const p of this.party) {
      const e = this.entry(p), before = p.hp, mpBefore = p.mp, v = this.host.readVitals(e.who ?? 0);
      p.hp = v.hp; p.mp = v.mp;
      if (p.hp > before) this.screen.popup(p.key, `+${Math.round(p.hp - before)}`, 'heal');
      if (p.mp > mpBefore) this.screen.popup(p.key, `+${Math.round(p.mp - mpBefore)} MP`, 'mp');
      if (p === t) gained = { hp: Math.round(p.hp - before), mp: Math.round(p.mp - mpBefore), up: before <= 0 && p.hp > 0 };
      if (p === t && t !== b && before <= 0 && p.hp > 0) this.host.bond?.('revive', e.who ?? 0, this.entry(b).who ?? 0);
      this.refresh(p);
    }
    // Pocket Handheld: the bars fill first (the text box holds), then the line saying what it did waits for OK.
    if (this.screen.pocket && (gained.hp > 0 || gained.mp > 0)) {
      this.screen.pauseText(DRAIN + 0.25);
      r.text = gained.up ? `${t.name} is back on their feet with ${Math.round(t.hp)} HP!`
        : `${t.name} recovered ${[gained.hp > 0 ? `${gained.hp} HP` : '', gained.mp > 0 ? `${gained.mp} MP` : ''].filter(Boolean).join(' and ')}!`;
    }
    const cured = r.cures.length ? t.status.cure(r.cures) : [];
    if (cured.length) { refreshAgility(t); this.screen.popup(t.key, `Cured ${cured.map(ailmentName).join(', ')}`, 'info'); this.refresh(t); }
    if (r.buffs?.length) this.giveBuffs(b, t, r.buffs);
    this.host.sound('item');
    this.screen.animate(t.key, 'heal', '#9dffb0');
    const msg = cured.length && !/cured/i.test(r.text) ? `${r.text.replace(/\.$/, '')}: cured ${cured.map(ailmentName).join(', ')}.` : r.text;
    if (this.screen.pocket) this.tell(msg); else this.screen.message(msg);
    this.say(msg);
    this.endTurn(b, RANK.item, 0.9);
  }

  /** An item used on an enemy: its healing heals them (or hurts the undead), its cures cure them. */
  private itemOnFoe(b: Battler, it: BattleItem, t: Battler): void {
    const hp = Math.round((it.restore?.hp ?? 0) + t.maxHp * (it.pct?.hp ?? 0) / 100), cures = it.cures ?? [], buffs = it.buffs ?? [];
    const mp = Math.min(t.maxMp - t.mp, Math.round((it.restore?.mp ?? 0) + t.maxMp * (it.pct?.mp ?? 0) / 100));
    const cured = cures.length ? t.status.cure(cures as (Ailment | 'all')[]) : [];
    if (!hp && mp <= 0 && !cured.length && !buffs.length) { this.screen.message('It wouldn’t do anything.'); this.phase = 'command'; this.later(1.1, () => this.itemMenu(b)); return; }
    this.host.spendItem(it.slot);
    this.screen.message(`${b.name} uses ${it.name} on ${t.name}`);
    this.host.sound('item');
    this.later(0.3, () => {
      if (hp) this.heal(b, t, healAmount(hp, t));
      if (mp > 0) { t.mp += mp; this.screen.popup(t.key, `+${mp} MP`, 'mp'); this.refresh(t); }
      if (cured.length) { refreshAgility(t); this.screen.popup(t.key, `Cured ${cured.map(ailmentName).join(', ')}`, 'info'); this.refresh(t); }
      if (buffs.length && isUp(t)) this.giveBuffs(b, t, buffs);
      this.endTurn(b, RANK.item, 0.9);
    });
  }

  /** Guard: half damage, some health back and no new ailments until their next turn (Legend of Dragoon). */
  private doGuard(b: Battler): void {
    if (this.defer(b, () => this.doGuard(b), true)) return;
    b.guarding = true;
    b.status.ward = true;
    const n = Math.round(b.maxHp * (this.cfg.guardHeal + (b.guardBonus ?? 0)) / 100);
    if (n > 0 && b.hp < b.maxHp) {
      const got = Math.min(n, b.maxHp - b.hp);
      if (b.status.zombie) this.damage(b, got, false);
      else { b.hp += got; this.screen.popup(b.key, `+${got}`, 'heal'); }
    }
    this.refresh(b);
    this.host.sound('guard');
    this.screen.animate(b.key, 'heal', '#8cc8ff');
    this.screen.message(`${b.name} guards`);
    this.endTurn(b, RANK.guard, 0.6);
  }

  private doFlee(b: Battler): void {
    if (this.defer(b, () => this.doFlee(b), true)) return;
    const chance = fleeChance(this.party, this.foes, this.cfg.flee);
    if (Math.random() < chance) {
      this.host.sound('dodge');
      this.screen.message('Got away safely!', true);
      this.say('You got away');
      this.phase = 'over';
      this.later(1, () => (this.host.outro ? this.host.outro(() => this.close('fled')) : this.close('fled')));
      return;
    }
    this.host.sound('menuBack');
    this.screen.message('Couldn’t get away!');
    this.endTurn(b, RANK.flee, 0.8);
  }

  /** Confused: attacks someone at random, friend or foe. */
  private confusedTurn(b: Battler): void {
    const all = this.battlers.filter((x) => isUp(x) && x !== b);
    const t = all[Math.floor(Math.random() * all.length)];
    this.screen.message(`${b.name} is confused!`);
    if (!t) { this.endTurn(b, RANK.attack, 0.8); return; }
    this.later(0.5, () => {
      this.screen.animate(b.key, 'lunge', undefined, t.key);
      this.host.sound('swing');
      this.later(0.28, () => { this.hit(b, t, b.attack, b.attackElement, b.attackMagic, b.inflicts); this.endTurn(b, RANK.attack, 0.75); });
    });
  }

  private enemyTurn(e: Battler): void {
    const move = enemyChoice(e, this.party, this.foes);
    if (!move) { this.endTurn(e, RANK.attack, 0.2); return; }
    // A full overdrive: this move hits half again as hard, and the gauge empties.
    if (e.overdrive !== undefined && e.overdrive >= 100) {
      e.surging = true;
      e.overdrive = 0;
      this.screen.setOverdrive(e.key, 0);
      this.screen.flash('rgba(255,120,60,0.45)');
      this.screen.shake();
      this.say(`${e.name} unleashes its overdrive!`);
    }
    const a = move.action;
    if (this.screen.pocket && !this.announced) { this.announced = true; this.announce(a ? `${e.name} used ${a.name || this.actionWord(a)}!` : `${e.name} attacks!`, () => this.foeMove(e, move)); return; }
    this.foeMove(e, move);
  }

  /** An enemy's chosen move, carried out. */
  private foeMove(e: Battler, move: NonNullable<ReturnType<typeof enemyChoice>>): void {
    this.announced = false;
    const a = move.action;
    if (!a) {
      const t = move.targets[0];
      if (!this.screen.pocket) this.screen.message(`${e.name} attacks!`);
      this.screen.animate(e.key, 'lunge', undefined, t.key);
      this.host.sound('swing');
      this.later(0.3, () => { this.hit(e, t, e.attack, e.attackElement, e.attackMagic, e.inflicts, undefined, !!e.counterspell); this.endTurn(e, RANK.attack, 0.8); });
      return;
    }
    if (!this.screen.pocket) this.screen.message(`${e.name}: ${a.name || this.actionWord(a)}`);
    if (a.kind === 'guard') { this.doGuard(e); return; }
    if (a.kind === 'buff') {
      const color = BUFF_INFO[a.buffs?.[0]?.buff ?? 'str'].color;
      this.screen.animate(e.key, 'cast', color);
      this.host.sound('ringOn');
      this.later(0.45, () => {
        for (const t of move.targets) if (isUp(t) && a.buffs?.length) this.giveBuffs(e, t, a.buffs);
        if (a.weather) this.setWeather(a.weather, a.weatherTurns ?? 5);
        this.endTurn(e, RANK.magic, 0.8);
      });
      return;
    }
    if (a.kind === 'heal') {
      const t = move.targets[0];
      this.screen.animate(e.key, 'cast', '#9dffb0');
      this.host.sound('ringOn');
      this.later(0.4, () => { this.heal(e, t, healAmount(t.maxHp * (a.power ?? 30) / 100, t)); this.endTurn(e, RANK.magic, 0.8); });
      return;
    }
    const magic = a.kind === 'spell';
    const element: Element = a.element ?? e.attackElement;
    this.screen.animate(e.key, magic ? 'cast' : 'lunge', magic ? ELEMENT_COLORS[element] : undefined, move.targets.length === 1 ? move.targets[0].key : undefined);
    this.host.sound(magic ? 'fire' : 'swing');
    this.later(magic ? 0.45 : 0.3, () => {
      for (const t of move.targets) if (isUp(t)) this.hit(e, t, e.attack * (a.power ?? 1), element, magic, a.inflicts ?? (magic ? undefined : e.inflicts), undefined, !!a.counterspell);
      this.endTurn(e, magic ? RANK.magic : RANK.attack, 0.85);
    });
  }

  private clearWeather(): void { battleWeather.kind = 'none'; this.weatherLeft = Infinity; this.host.weather?.(null); }

  /** Rounds of weather left, counted in fighters' turns (one round: everyone standing has had a turn). */
  private weatherLeft = Infinity;
  /** The weather the battle started in: a spell's weather gives way to it again when it wears off. */
  private baseWeather: BattleWeather = 'none';

  /** Change the battle's weather for `rounds` (0: the whole battle). */
  private setWeather(kind: BattleWeather, rounds: number): void {
    const up = Math.max(1, this.battlers.filter(isUp).length);
    this.weatherLeft = rounds > 0 && kind !== 'none' ? rounds * up : Infinity;
    if (battleWeather.kind === kind) { this.screen.setWeather(this.weatherText()); return; }
    battleWeather.kind = kind;
    const w = WEATHER_EFFECT[kind];
    const line = kind === 'none' ? 'The weather cleared.' : `${w.name}! ${w.text}.`;
    this.screen.message(line);
    this.say(line);
    this.screen.setWeather(this.weatherText());
    this.host.weather?.(kind);
  }

  /** The weather badge: "☔ Rain · 4 turns" (nothing when clear). */
  private weatherText(): string | null {
    const k = battleWeather.kind;
    if (k === 'none') return null;
    const w = WEATHER_EFFECT[k], up = Math.max(1, this.battlers.filter(isUp).length);
    const left = Number.isFinite(this.weatherLeft) ? Math.max(1, Math.ceil(this.weatherLeft / up)) : null;
    return `${w.icon} ${w.name}${left ? ` · ${left} round${left === 1 ? '' : 's'} left` : ''}`;
  }

  private actionWord(a: EnemyAction): string { return { attack: 'Strike', spell: 'Spell', heal: 'Heal', guard: 'Guard', buff: 'Spell' }[a.kind]; }

  /**
   * Buffs and debuffs from a spell, an item or an enemy. A debuff (Slow) on the other side can be shrugged off
   * (Endurance) or warded (guarding); Haste and Slow cancel each other out.
   */
  private giveBuffs(by: Battler, t: Battler, list: readonly BuffGrant[]): void {
    for (const g of list) {
      if (!BUFF_INFO[g.buff]) continue;
      const hostile = DEBUFFS.has(g.buff) && by.side !== t.side;
      // Stat guard (Guard Spec, Mist): nothing lowers their stats while it lasts; boosts still land.
      if ((DEBUFFS.has(g.buff) || (g.amount ?? 0) < 0) && t.status.buffs.has('statGuard')) {
        this.screen.popup(t.key, 'Protected', 'info');
        this.say(`${t.name}’s stats can’t be lowered`);
        this.tell(`${t.name}’s stats won’t go down!`);
        continue;
      }
      if (hostile && t.status.ward) { this.screen.popup(t.key, 'Warded', 'info'); continue; }
      if (hostile && Math.random() * 100 < (t.resist ?? 0)) { this.screen.popup(t.key, 'Resisted', 'info'); this.say(`${t.name} shrugs off ${BUFF_INFO[g.buff].name}`); continue; }
      const res = t.status.boost(g.buff, g.amount ?? BUFF_INFO[g.buff].amount, g.whole ? Infinity : g.turns ?? BUFF_TURNS);
      const other: BuffKind = g.buff === 'haste' ? 'slow' : 'haste';
      const word = res === 'cancelled' ? `${BUFF_INFO[other].name} ended` : `${buffLabel(g.buff)}!`;
      this.screen.popup(t.key, word, 'info');
      this.say(`${t.name}: ${res === 'cancelled' ? `${BUFF_INFO[other].name} ended` : buffLabel(g.buff)}`);
    }
    refreshAgility(t);
    this.refresh(t);
  }

  /** One fighter hits another: blindness, elements, criticals, guarding and the side's damage scale, then ailments. */
  private hit(by: Battler, t: Battler, power: number, element: Element, magic: boolean, inflicts?: Inflict[], color?: string, counter = false): void {
    this.hitter = by;
    // Blind: half of their weapon attacks miss (spells still land).
    if (!magic && !this.aim.sure && by.status.blind && Math.random() < BLIND_MISS_CHANCE) {
      this.screen.popup(t.key, 'Miss', 'info');
      this.host.sound('dodge');
      this.say(`${by.name} misses`);
      this.tell(`${by.name}’s attack missed!`);
      return;
    }
    const scale = (by.side === 'party' ? this.cfg.partyDamage : this.cfg.enemyDamage) * (by.surging ? 1.5 : 1);
    const r = strike(power, element, magic, { ...by, ...this.aim }, t, scale);
    if (r.kind === 'miss') {
      // A dodge: the one hit sidesteps.
      this.screen.popup(t.key, t.side === 'party' ? 'Dodged' : 'Miss', 'info');
      this.screen.animate(t.key, 'dodge');
      this.host.sound('dodge');
      this.say(`${t.name} dodges ${by.name}’s ${magic ? 'spell' : 'attack'}`);
      this.tell(`${t.name} dodged the ${magic ? 'spell' : 'attack'}!`);
      return;
    }
    const tint = color ?? (element !== 'neutral' ? ELEMENT_COLORS[element] : undefined);
    if (r.kind === 'immune') { this.screen.popup(t.key, 'IMMUNE', 'big'); this.host.sound('thump'); this.say(`${t.name} is immune`); this.tell(`It doesn’t affect ${t.name}…`); return; }
    if (r.kind === 'absorb') {
      t.hp = Math.min(t.maxHp, t.hp + r.amount);
      this.screen.popup(t.key, `+${r.amount}`, 'heal');
      this.screen.popup(t.key, 'Absorbed', 'info');
      this.host.sound('ringOn');
      this.refresh(t);
      this.tell(`${t.name} absorbed it and healed ${r.amount}!`);
      return;
    }
    // A CRITICAL: a flash, the screen shakes, a big word with a crack and a rumble.
    if (r.crit) { this.screen.flash('rgba(255,250,230,0.7)'); this.screen.shake(); this.screen.popup(t.key, 'CRITICAL!', 'critBig'); this.host.sound('critBig'); }
    // A weakness: a big WEAK and a soft thump.
    if (r.label === 'Weak!') { this.screen.popup(t.key, 'WEAK!', 'big', tint); this.host.sound('thump'); }
    else if (r.label) this.screen.popup(t.key, 'Resist', 'info');
    // A weapon hit on a foe: its material's sound and what flies off it (blood, sparks, chips…).
    const mat = !magic && t.impact ? t.impact : null;
    if (mat) this.screen.impact(t.key, mat.fx, r.crit);
    this.striker = by.side === 'party' ? { by, weak: r.label === 'Weak!' } : null;
    // Pocket Handheld: the damage is told before anything it leads to (a foe falling); an Addition's add up.
    if (this.combo) { const c = this.combo; c.total += r.amount; c.crit ||= r.crit; c.weak ||= r.label === 'Weak!'; c.resist ||= r.label === 'Resist'; c.element = element; c.t = t; }
    else {
      // Pocket Handheld: the attacker steps back, the target flashes and its health drains; then the lines.
      this.screen.pauseText(STEP_BACK + DRAIN + 0.15);
      this.tellHit(r.crit, r.label === 'Weak!', r.label === 'Resist');
    }
    this.damage(t, r.amount, r.crit, tint, mat?.sound);
    this.striker = null;
    if (by.side === 'party') { this.host.tally?.('damageDealt', r.amount); this.host.tally?.('bestHit', r.amount, true); if (r.crit) this.host.tally?.('crits'); }
    else if (t.side === 'party') this.host.tally?.('damageTaken', r.amount);
    this.say(`${by.name} hits ${t.name} for ${r.amount}${r.crit ? ' (critical)' : ''}${r.label === 'Weak!' ? ' (super effective)' : r.label === 'Resist' ? ' (resisted)' : ''}`);
    // A Counterspell breaks a spell being charged.
    if (counter && isUp(t) && t.charging) this.interrupt(t, 'Counterspell');
    if (isUp(t)) this.inflict(t, inflicts);
  }

  /** Roll a hit's ailments on someone still standing. */
  private inflict(t: Battler, inflicts?: Inflict[]): void {
    for (const f of rollInflicts(inflicts)) {
      // Endurance: a chance to shrug it off (not while guarding: the ward says so instead).
      if (!t.status.ward && f.ailment !== 'stagger' && Math.random() * 100 < (t.resist ?? 0)) {
        this.screen.popup(t.key, 'Resisted', 'info');
        this.say(`${t.name} shrugs off ${ailmentName(f.ailment)}`);
        continue;
      }
      const res = t.status.give(f.ailment, f.turns);
      if (res === 'resisted' && t.status.ward) { this.screen.popup(t.key, 'Warded', 'info'); continue; }
      if (res === 'resisted' || res === 'none') continue;
      if (f.ailment === 'stagger') t.ct += tickOf(t.agility) * 1.5;
      const a: BattleAilment = res === 'frozen' ? 'frozen' : f.ailment;
      this.screen.popup(t.key, AILMENT_WORD[a], 'info');
      this.say(`${t.name}: ${ailmentName(a)}`);
      // Pocket Handheld: a line of its own, waiting for OK ("Jordan was poisoned!").
      if (res === 'given' || res === 'frozen') { const w = GOT_AILMENT[a]; if (w) this.tell(`${t.name} ${w}`); }
      refreshAgility(t);
    }
    // Pocket Handheld (one hit): its pill shows as the bar drains, once the attacker is back.
    if (this.screen.pocket && !this.combo) this.screen.after(STEP_BACK, () => this.refresh(t));
    else this.refresh(t);
  }

  private heal(by: Battler, t: Battler, n: number): void {
    // The undead (and zombies) are hurt by healing.
    if (n < 0) { this.damage(t, -n, false); return; }
    t.hp = Math.min(t.maxHp, t.hp + n);
    this.screen.popup(t.key, `+${n}`, 'heal');
    this.screen.animate(t.key, 'heal', '#9dffb0');
    this.say(`${by.name} heals ${t.name} for ${n}`);
    this.refresh(t);
  }

  /** The lowest health a fighter can drop to: 1 for a protected party member, otherwise 0. */
  private floor(t: Battler): number { return t.side === 'party' && this.host.protect?.(this.entry(t).who ?? 0) ? 1 : 0; }
  /** The party took damage this battle (for "won without a scratch"). */
  private hurt = false;

  /** The console's win_battle: every foe falls. */
  debugWin(): void {
    if (this.phase === 'off' || this.phase === 'over') return;
    for (const f of this.foes) if (isUp(f)) { f.hp = 0; this.refresh(f); this.fall(f); }
    this.checkOver();
  }

  private damage(t: Battler, n: number, crit: boolean, color?: string, sound?: Sfx): void {
    if (t.side === 'party' && n > 0) this.hurt = true;
    // A foe's blow on the party: the one who stepped in took it for someone (Update 124).
    if (t.side === 'party' && n > 0 && this.hitter?.side === 'enemy' && this.cover) {
      const c = this.cover;
      this.cover = null;
      if ((this.entry(t).who ?? 0) === c.by) { this.host.bond?.('cover', c.saved, c.by); if (n >= c.savedHp) this.host.bond?.('coverSave', c.saved, c.by); }
    }
    // Who knocked a hero out, for avenging them.
    if (t.side === 'party' && t.hp - n <= this.floor(t) && t.hp > 0 && this.hitter?.side === 'enemy') this.downedBy.set(this.entry(t).who ?? 0, this.hitter.key);
    t.hp = Math.max(this.floor(t), t.hp - n);
    this.screen.popup(t.key, String(n), crit ? 'crit' : 'dmg', color);
    this.host.sound(t.side === 'party' ? 'hurt' : sound ?? (crit ? 'crit' : 'hit'));
    // Pocket Handheld (one hit, not an Addition's string): the flash and the drain once the attacker is back.
    const later = this.screen.pocket && !this.combo;
    if (later) this.screen.after(STEP_BACK, () => { this.screen.animate(t.key, 'hit', color); this.refresh(t); });
    else this.screen.animate(t.key, 'hit', color);
    // A boss's overdrive fills as it's hurt (full after losing two fifths of its health).
    if (t.overdrive !== undefined && t.hp > 0) this.fillOverdrive(t, (n / Math.max(1, t.maxHp * 0.4)) * 100);
    // A hit wakes the sleeping.
    if (t.hp > 0 && t.status.hurt()) this.screen.popup(t.key, 'Woke up', 'info');
    if (t.hp <= 0) this.fall(t);
    if (!later) this.refresh(t);
  }

  private fillOverdrive(b: Battler, by: number): void {
    if (b.overdrive === undefined) return;
    const was = b.overdrive;
    b.overdrive = Math.min(100, b.overdrive + by);
    this.screen.setOverdrive(b.key, b.overdrive);
    if (was < 100 && b.overdrive >= 100) { this.screen.popup(b.key, 'OVERDRIVE', 'big', '#ff7a4a'); this.say(`${b.name}'s overdrive is full!`); }
  }

  /** Knocked out: ailments go with it. */
  /** The spell being cast's aim (its accuracy, or never misses). */
  private aim: { spellAccuracy?: number; spellSure?: boolean; sure?: boolean } = {};
  /** Whose hit is landing right now (a foe falling to it earns them the finishing blow). */
  private striker: { by: Battler; weak: boolean } | null = null;
  /** Relationships (Update 124): someone hurt swapped out for `by`; the last to strike; who knocked each hero out. */
  private cover: { saved: number; by: number; savedHp: number } | null = null;
  private hitter: Battler | null = null;
  private readonly downedBy = new Map<number, string>();
  /** Someone in the party was knocked out this battle (no "no KOs" EXP bonus). */
  partyFell = false;

  /** "+12 EXP" at the bottom left, for one of the party. */
  private expPop(b: Battler, n: number): void {
    if (n <= 0) return;
    // Pocket Handheld: nothing until the battle is won (the bar fills once, after "Victory!").
    if (this.screen.pocket) return;
    this.screen.expPop(`${b.name} +${n} EXP`);
  }

  /** A foe fell: everyone fighting earns its EXP now (the finishing blow and a weakness a little more). */
  private foeEarned(t: Battler): void {
    // Everyone who fought this foe shares its EXP (like the handheld games): those out now, and those swapped out
    // since who are still on their feet.
    this.noteFighting();
    // (Someone swapped out is no longer in the battle's lists: their health is read back from the party.)
    const here = new Map([...this.all, ...this.waiting].filter((e) => e.battler.side === 'party').map((e) => [e.who ?? 0, e.battler.hp] as [number, number]));
    const up = (w: number) => (here.has(w) ? here.get(w)! > 0 : (this.host.readVitals?.(w)?.hp ?? 0) > 0);
    const k = this.striker, fighting = [...(this.fought.get(t.key) ?? [])].filter(up);
    // Avenged (Update 124): whoever this foe knocked out warms to the one who beat it.
    if (k) { const by = this.entry(k.by).who ?? 0; for (const [down, foe] of this.downedBy) if (foe === t.key && down !== by) this.host.bond?.('avenge', down, by); }
    const gains = this.host.foeDefeated?.(t.key, k ? this.entry(k.by).who ?? 0 : null, !!k?.weak, fighting) ?? [];
    for (const g of gains) {
      const p = this.party.find((x) => (this.entry(x).who ?? 0) === g.who);
      if (!p) continue;
      // Pocket Handheld tells (and fills) all the EXP at once, after "Victory!".
      if (!this.screen.pocket) this.expPop(p, g.xp);
    }
  }

  private fall(t: Battler): void {
    t.guarding = false;
    if (t.charging) { t.charging = null; this.screen.setCharging(t.key, null); }
    for (const a of t.status.list) if (a !== 'zombie') t.status.turns.delete(a);
    t.status.chillStacks = 0;
    t.status.buffs.clear();
    refreshAgility(t);
    if (this.screen.pocket) this.screen.after(STEP_BACK + DRAIN, () => this.screen.animate(t.key, 'faint'));
    else setTimeout(() => this.screen.animate(t.key, 'faint'), 260);
    this.flushCombo();
    if (t.side === 'enemy') { this.host.sound('defeat'); this.say(`${t.name} defeated`); this.tell(`${t.name} was defeated!`); this.foeEarned(t); }
    else { this.partyFell = true; this.say(`${t.name} is knocked out`); this.tell(`${t.name} was knocked out!`); }
    this.updateSpheres();
  }

  /** The last round whose end burn and poison have bitten. */
  private bitRound = 0;

  /** Rounds: the end of a round. Burn and poison bite (a line each, the bar draining as it's read). Whether any did. */
  private roundEnd(): boolean {
    let any = false;
    for (const b of this.battlers.filter(isUp)) {
      for (const d of b.status.bite(b.maxHp)) {
        if (!isUp(b)) break;
        any = true;
        b.hp = Math.max(this.floor(b), b.hp - d.amount);
        const color = d.ailment === 'burn' ? '#ff9a5a' : '#8ee05a';
        const show = () => { this.screen.popup(b.key, String(d.amount), 'dmg', color); this.screen.animate(b.key, 'hit'); this.refresh(b); };
        this.say(`${b.name} takes ${d.amount} from ${d.ailment === 'burn' ? 'the burn' : 'poison'}`);
        if (this.screen.pocket) { this.screen.narrate(`${b.name} is hurt by ${d.ailment === 'burn' ? 'its burn' : 'poison'}!`, true, { bars: show }); this.screen.pauseText(DRAIN); }
        else show();
        if (!isUp(b)) this.fall(b);
      }
    }
    if (!any) return false;
    this.phase = 'busy';
    this.later(this.screen.pocket ? 0.05 : 0.8, () => { if (!this.checkOver()) this.phase = 'next'; });
    return true;
  }

  private endTurn(b: Battler, rank: number, pause: number): void {
    b.surging = false;
    this.flushCombo();
    // Weather from a spell wears off after its rounds.
    if (Number.isFinite(this.weatherLeft) && --this.weatherLeft <= 0) {
      this.setWeather(this.baseWeather, 0);
    } else if (Number.isFinite(this.weatherLeft)) this.screen.setWeather(this.weatherText());
    // A boss's gauge creeps up each of its turns too.
    if (b.overdrive !== undefined && isUp(b)) this.fillOverdrive(b, 8);
    // Ailments tick down at the end of the afflicted fighter's own turn.
    const gone = isUp(b) ? b.status.endTurn() : [];
    if (gone.length) {
      refreshAgility(b);
      this.screen.popup(b.key, gone.length === 1 ? `${ailmentName(gone[0])} wore off` : 'Recovered', 'info');
      const WORE: Partial<Record<BattleAilment, string>> = { sleep: 'woke up!', frozen: 'thawed out!', paralyze: 'can move again!', burn: 'is no longer burned!', poison: 'is no longer poisoned!', confusion: 'snapped out of its confusion!', chill: 'warmed up!', blind: 'can see again!', silence: 'can cast again!' };
      for (const a of gone) if (WORE[a]) this.tell(`${b.name} ${WORE[a]}`);
    }
    // Regeneration gives health back (the undead are hurt by it); then buffs tick down too.
    const regen = isUp(b) ? regenAmount(b) : 0;
    if (regen) { if (b.status.zombie) this.damage(b, regen, false); else if (b.hp < b.maxHp) { b.hp = Math.min(b.maxHp, b.hp + regen); this.screen.popup(b.key, `+${regen}`, 'heal'); } }
    const faded = isUp(b) ? b.status.endBuffs() : [];
    if (faded.length) {
      refreshAgility(b);
      this.screen.popup(b.key, faded.length === 1 ? `${BUFF_INFO[faded[0]].name} wore off` : 'Buffs wore off', 'info');
    }
    this.refresh(b);
    if (this.cfg.order === 'ctb') spend(b, rank);
    this.phase = 'busy';
    this.later(pause, () => { if (!this.checkOver()) this.phase = 'next'; });
  }

  /* ------------------------------------------------------------------ the end */

  private checkOver(): boolean {
    if (this.phase === 'over') return true;
    if (!this.foes.some(isUp)) { if (this.single && this.nextFoe()) return true; this.win(); return true; }
    if (!this.party.some(isUp)) { if (this.single && this.forceSwap()) return true; this.lose(); return true; }
    return false;
  }

  private win(): void {
    this.phase = 'over';
    this.screen.idle();
    this.screen.setOrder([], null);
    const beaten = [...this.gone, ...this.all.filter((e) => e.battler.side === 'enemy')].map((e) => e.ref);
    this.writeParty();
    // Pocket Handheld: "Victory!" with the fanfare (the victory tune follows it), then the EXP, loot and level ups.
    if (this.screen.pocket) {
      this.host.fanfare?.();
      this.tell('Victory!');
      this.later(0.05, () => this.pocketResults(this.host.victory(beaten)));
      return;
    }
    this.screen.message('Victory!', true);
    this.later(0.9, () => {
      const report = this.host.victory(beaten);
      this.host.fanfare?.();
      if (this.screen.pocket) { this.pocketResults(report); return; }
      this.screen.victory(report, () => {
        if (this.host.outro) this.host.outro(() => this.close('victory'));
        else this.close('victory');
      });
    });
  }

  /** Pocket Handheld's results, in the log: EXP still to tell (bonuses, shared EXP), level ups and what they brought, the loot. */
  private pocketResults(report: VictoryReport): void {
    // Each hero's EXP, then (straight after it) their level up; the loot after everyone's.
    const exp: { text: string; sound?: string; bars?: () => void; stats?: string[]; icon?: string }[] = [];
    for (const h of report.heroes) {
      const who = Number(h.key.slice(1)) || 0, b = this.all.find((e) => e.battler.side === 'party' && (e.who ?? 0) === who)?.battler;
      // The bar fills once, through every level it passes (the level ticks up at each), to where it ends up.
      const bars = () => { if (b) this.screen.fillXp(b.key, h.segments, h.after); };
      // All their EXP in one window: the total, and under it how much of that was bonus.
      if (h.via && h.gained > 0) exp.push({ text: `${h.name} gained ${h.gained} EXP from sharing experience!`, sound: 'expFill', bars });
      else if (h.gained > 0) {
        const bonus = h.bonus?.gained ?? 0;
        exp.push({ text: `${h.name} gained ${h.gained} EXP!${bonus > 0 ? `\nIncludes bonus EXP +${bonus}${h.bonus!.bits.length ? ` (${h.bonus!.bits.map((x) => x.replace(/ \+\d+$/, '')).join(', ')})` : ''}` : ''}`, sound: 'expFill', bars });
      }
      // A level up: a ding, the new level and (in a box beside it) what it brought.
      if (h.after.level > h.level) exp.push({ text: `${h.name} reached Level ${h.after.level}!`, sound: 'levelUp', stats: h.changes.flatMap((c) => c.split(' · ')) });
    }
    const loot = report.loot.map((l) => ({ icon: l.icon, text: l.kind === 'gold' ? `+${l.name}!` : `Got ${l.count > 1 ? `${l.count} × ` : ''}${l.name}!${l.note ? ` (${l.note})` : ''}`, sound: ({ gold: 'lootGold', potion: 'lootPotion', key: 'lootKey', material: 'lootMaterial', gear: 'lootGear', item: 'lootItem' } as const)[l.kind] as string }));
    this.screen.pocketVictory([...exp, ...loot], () => {
      if (this.host.outro) this.host.outro(() => this.close('victory'));
      else this.close('victory');
    });
  }

  private lose(): void {
    this.phase = 'over';
    this.planning = null; this.planned = null;
    this.screen.idle();
    this.screen.message('The party has fallen…', true);
    this.writeParty();
    this.later(1.8, () => this.close('defeat'));
  }

  private close(outcome: BattleOutcome): void {
    this.clearWeather();
    if (outcome === 'victory') { this.host.tally?.('battlesWon'); if (!this.hurt) this.host.tally?.('flawless'); }
    if (outcome === 'fled') this.host.tally?.('fled');
    this.writeParty();
    const beaten = outcome === 'victory' ? [...this.gone, ...this.all.filter((e) => e.battler.side === 'enemy')].map((e) => e.ref) : [];
    this.phase = 'off';
    this.wait = 0; this.then = null;
    this.screen.close();
    this.host.finished(outcome, beaten);
  }

  /* ------------------------------------------------------------------ keeping the screen and the game in step */

  private writeParty(): void {
    for (const e of this.all) if (e.battler.side === 'party') this.host.writeVitals(e.who ?? 0, e.battler.hp, e.battler.mp);
  }

  private refresh(b: Battler): void {
    const st = b.status;
    this.screen.setVitals(b.key, {
      hp: b.hp, maxHp: b.maxHp, mp: b.mp, maxMp: b.maxMp, guarding: b.guarding,
      weak: b.hp > 0 && (b.hp <= b.maxHp * 0.25 || st.list.some((a) => a !== 'zombie')),
      status: [
        ...st.list.map((a) => ({ ailment: a, icon: statusIconUrl(a), name: `${ailmentName(a)}${Number.isFinite(st.turns.get(a)!) ? ` (${st.turns.get(a)} turn${st.turns.get(a) === 1 ? '' : 's'})` : ''}` })),
        ...[...st.buffs].map(([k, v]) => ({ icon: statusIconUrl(`buff:${k}`), name: `${buffLabel(k)} (${Number.isFinite(v.turns) ? `${v.turns} turn${v.turns === 1 ? '' : 's'}` : 'all battle'})` })),
      ],
      buffs: chipsOf(b),
    });
    // The party's numbers are the game's too (a save, the HUD).
    if (b.side === 'party') this.host.writeVitals(this.entry(b).who ?? 0, b.hp, b.mp);
  }

  private refreshAll(): void { for (const b of this.battlers) this.refresh(b); }

  /** Abandon the battle at once (quitting to the title, loading a save): nothing is handed out. */
  abort(): void {
    if (this.phase === 'off') return;
    this.clearWeather();
    this.phase = 'off';
    this.wait = 0; this.then = null;
    this.screen.close();
  }
}


/** A fighter's buffs and debuffs as arrow chips. */
function chipsOf(b: Battler): BuffChip[] { return [...b.status.buffs].map(([k, v]) => buffChip(k, v.amount)); }
