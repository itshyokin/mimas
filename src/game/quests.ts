/**
 * The quest book: which quests the player has, how far along each objective is, and the rules that move them on.
 * Events start, advance, complete and fail quests (the "Quest" command); defeating enemies, carrying items and
 * reaching maps count towards objectives by themselves. Saved with the game.
 */
import type { QuestDef, QuestObjective, QuestReward, QuestStatus } from '../world/types';

export interface QuestEntry {
  status: QuestStatus;
  /** Progress per objective id (defeat and task counts; collect is counted from the bag while the quest is open). */
  progress: Record<string, number>;
  /** Objectives finished for good (collect objectives once the quest is over, tasks ticked off by events). */
  done: Record<string, boolean>;
  /** Order the quest was started and finished in (newest first in the log). */
  started: number;
  ended?: number;
}

export interface QuestBookData { quests: Record<string, QuestEntry>; tracked: string | null; n: number }

/** What changed, for banners, the adventure log and sounds. */
export type QuestNews =
  | { type: 'started' | 'ready' | 'done' | 'failed' | 'reset'; quest: QuestDef }
  | { type: 'objective'; quest: QuestDef; objective: QuestObjective }
  | { type: 'progress'; quest: QuestDef; objective: QuestObjective; have: number; need: number };

export interface QuestHost {
  /** How many of an item the player carries (equipped counts). */
  count(item: string): number;
  /** Take items (completing a quest that collects them). */
  take(item: string, n: number): void;
  /** Hand out a completed quest's rewards. */
  reward(r: QuestReward, quest: QuestDef): void;
  news(n: QuestNews): void;
}

export const need = (o: QuestObjective): number => Math.max(1, Math.floor(o.count ?? 1));

export class QuestBook {
  private defs = new Map<string, QuestDef>();
  private entries = new Map<string, QuestEntry>();
  tracked: string | null = null;
  private n = 0;

  constructor(defs: QuestDef[] | undefined, private readonly host: QuestHost) { this.setDefs(defs); }

  setDefs(defs: QuestDef[] | undefined): void { this.defs = new Map((defs ?? []).map((d) => [d.id, d])); }
  def(id: string): QuestDef | undefined { return this.defs.get(id); }
  get all(): QuestDef[] { return [...this.defs.values()]; }

  status(id: string): QuestStatus { return this.entries.get(id)?.status ?? 'inactive'; }
  entry(id: string): QuestEntry | undefined { return this.entries.get(id); }
  isOpen(id: string): boolean { const s = this.status(id); return s === 'active' || s === 'ready'; }

  /** How far along an objective is (0 … need). */
  have(q: QuestDef, o: QuestObjective): number {
    const e = this.entries.get(q.id);
    if (!e) return 0;
    if (e.done[o.id]) return need(o);
    if (o.kind === 'collect' && o.item && (e.status === 'active' || e.status === 'ready')) return Math.min(need(o), this.host.count(o.item));
    return Math.min(need(o), e.progress[o.id] ?? 0);
  }
  objectiveDone(q: QuestDef, o: QuestObjective): boolean { return this.have(q, o) >= need(o); }

  /** The objectives to show: all of them, or (in order) those done so far and the current one. */
  visible(q: QuestDef): QuestObjective[] {
    if (!q.inOrder) return q.objectives;
    const out: QuestObjective[] = [];
    for (const o of q.objectives) { out.push(o); if (!this.objectiveDone(q, o) && !o.optional) break; }
    return out;
  }

  /** Objectives that count right now (in order: only the current one, plus optional ones shown alongside it). */
  private live(q: QuestDef): QuestObjective[] {
    return this.visible(q).filter((o) => !this.objectiveDone(q, o));
  }

  /* ------------------------------------------------------------ commands */

  start(id: string): boolean {
    const q = this.defs.get(id);
    if (!q) return false;
    const e = this.entries.get(id);
    if (e && e.status !== 'inactive') return false;
    this.entries.set(id, { status: 'active', progress: {}, done: {}, started: ++this.n });
    this.host.news({ type: 'started', quest: q });
    if (!this.tracked || !this.isOpen(this.tracked)) this.tracked = id;
    this.check(q);
    return true;
  }

  /** Tick off an objective, or count it up by `add`. Starts the quest if it wasn't. */
  objective(id: string, objective: string, add?: number): void {
    const q = this.defs.get(id), o = q?.objectives.find((x) => x.id === objective);
    if (!q || !o) return;
    if (this.status(id) === 'inactive') this.start(id);
    const e = this.entries.get(id)!;
    if (e.status === 'done' || e.status === 'failed') return;
    if (add === undefined) {
      if (e.done[o.id]) return;
      e.done[o.id] = true;
      e.progress[o.id] = need(o);
      this.host.news({ type: 'objective', quest: q, objective: o });
    } else this.count(q, o, add);
    this.check(q);
  }

  private count(q: QuestDef, o: QuestObjective, add: number): void {
    const e = this.entries.get(q.id)!;
    const before = Math.min(need(o), e.progress[o.id] ?? 0);
    const now = Math.max(0, Math.min(need(o), before + add));
    if (now === before) return;
    e.progress[o.id] = now;
    if (now >= need(o)) { e.done[o.id] = true; this.host.news({ type: 'objective', quest: q, objective: o }); }
    else this.host.news({ type: 'progress', quest: q, objective: o, have: now, need: need(o) });
  }

  /** Finish it and hand out the rewards (whatever objectives are left). */
  complete(id: string): boolean {
    const q = this.defs.get(id);
    if (!q) return false;
    const e = this.entries.get(id) ?? { status: 'inactive' as QuestStatus, progress: {}, done: {}, started: ++this.n };
    if (e.status === 'done' || e.status === 'failed') return false;
    this.entries.set(id, e);
    if (q.takeItems) for (const o of q.objectives) if (o.kind === 'collect' && o.item) this.host.take(o.item, need(o));
    for (const o of q.objectives) e.done[o.id] = true;
    e.status = 'done';
    e.ended = ++this.n;
    this.host.news({ type: 'done', quest: q });
    if (q.rewards) this.host.reward(q.rewards, q);
    this.retrack(id);
    return true;
  }

  fail(id: string): void {
    const q = this.defs.get(id), e = this.entries.get(id);
    if (!q || !e || e.status === 'done' || e.status === 'failed') return;
    e.status = 'failed';
    e.ended = ++this.n;
    this.host.news({ type: 'failed', quest: q });
    this.retrack(id);
  }

  /** Back to not started (so it can be given again). */
  reset(id: string): void {
    const q = this.defs.get(id);
    if (!q || !this.entries.delete(id)) return;
    this.host.news({ type: 'reset', quest: q });
    this.retrack(id);
  }

  private retrack(id: string): void {
    if (this.tracked !== id && this.tracked && this.isOpen(this.tracked)) return;
    const open = [...this.entries].filter(([, e]) => e.status === 'active' || e.status === 'ready').sort((a, b) => b[1].started - a[1].started);
    this.tracked = open[0]?.[0] ?? null;
  }

  run(id: string, op: 'start' | 'objective' | 'complete' | 'fail' | 'reset', objective?: string, add?: number): void {
    if (op === 'start') this.start(id);
    else if (op === 'objective' && objective) this.objective(id, objective, add);
    else if (op === 'complete') this.complete(id);
    else if (op === 'fail') this.fail(id);
    else if (op === 'reset') this.reset(id);
  }

  /* ------------------------------------------------------------ things that happen in the world */

  enemyDefeated(enemy: string): void {
    for (const q of this.openQuests()) {
      let hit = false;
      for (const o of this.live(q)) if (o.kind === 'defeat' && o.enemy === enemy) { this.count(q, o, 1); hit = true; }
      if (hit) this.check(q);
    }
  }

  mapEntered(map: string): void {
    for (const q of this.openQuests()) {
      let hit = false;
      for (const o of this.live(q)) if (o.kind === 'visit' && o.map === map) { this.count(q, o, 1); hit = true; }
      if (hit) this.check(q);
    }
  }

  /** The bag changed: collect objectives may be done (or undone). */
  private carried = new Map<string, number>();
  itemsChanged(): void {
    for (const q of this.openQuests()) {
      let hit = false;
      for (const o of q.objectives) {
        if (o.kind !== 'collect' || !o.item) continue;
        const key = `${q.id}/${o.id}`, now = Math.min(need(o), this.host.count(o.item)), before = this.carried.get(key);
        if (before === now) continue;
        this.carried.set(key, now);
        if (before === undefined) continue; // first look: just remember it
        hit = true;
        if (!this.visible(q).includes(o)) continue;
        if (now >= need(o)) this.host.news({ type: 'objective', quest: q, objective: o });
        else if (now > before) this.host.news({ type: 'progress', quest: q, objective: o, have: now, need: need(o) });
      }
      if (hit) this.check(q);
    }
  }

  private openQuests(): QuestDef[] {
    return [...this.entries].filter(([, e]) => e.status === 'active' || e.status === 'ready').map(([id]) => this.defs.get(id)).filter((q): q is QuestDef => !!q);
  }

  /** Every needed objective done → ready to hand in (or completed, if it completes itself); undone → active again. */
  private check(q: QuestDef, quiet = false): void {
    const e = this.entries.get(q.id);
    if (!e || (e.status !== 'active' && e.status !== 'ready')) return;
    for (const o of q.objectives) if (o.kind === 'collect' && o.item) this.carried.set(`${q.id}/${o.id}`, Math.min(need(o), this.host.count(o.item)));
    const all = q.objectives.every((o) => o.optional || this.objectiveDone(q, o));
    if (all && e.status === 'active') {
      if (q.autoComplete) { this.complete(q.id); return; }
      e.status = 'ready';
      if (!quiet) this.host.news({ type: 'ready', quest: q });
    } else if (!all && e.status === 'ready') e.status = 'active';
  }

  /* ------------------------------------------------------------ saving */

  toJSON(): QuestBookData { return { quests: Object.fromEntries(this.entries), tracked: this.tracked, n: this.n }; }

  load(d: QuestBookData | undefined): void {
    this.entries = new Map(Object.entries(d?.quests ?? {}).map(([k, e]) => [k, { status: e.status, progress: { ...e.progress }, done: { ...e.done }, started: e.started, ended: e.ended }]));
    this.tracked = d?.tracked ?? null;
    this.n = d?.n ?? 0;
    this.carried.clear();
    for (const q of this.openQuests()) this.check(q, true);
  }
}

/** One line for an objective: "Defeat slimes (2/3)". */
export function objectiveLine(book: QuestBook, q: QuestDef, o: QuestObjective): string {
  const n = need(o);
  return n > 1 ? `${o.text} (${book.have(q, o)}/${n})` : o.text;
}
