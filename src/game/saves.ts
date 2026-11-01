/**
 * Save games: what's in a save, and where saves are kept.
 *
 * Saves live in the browser's local storage, under a key per game (its title), with playtests kept
 * apart from the real game so testing never overwrites a player's progress. A save is plain JSON,
 * so a desktop build can later write the same data to files instead.
 */
import type { Dir } from '../world/types';
import type { InventoryData } from './inventory';
import type { QuestBookData } from './quests';

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;
export type SlotId = 'auto' | 1 | 2 | 3;

export interface SavePoint { map: string; x: number; z: number; dir?: Dir }

export interface SaveData {
  version: number;
  /** When it was saved (ms since 1970) and how long the game had been played (seconds). */
  savedAt: number;
  playTime: number;
  /** Where the player is. */
  map: string;
  mapTitle: string;
  x: number; z: number; dir: Dir;
  hour: number;
  state: { switches: Record<string, boolean>; variables: Record<string, number>; abilities: Record<string, boolean>; cut?: Record<string, string[]> };
  gauges: { hp: number; mp: number; sp: number };
  /** The hero's ailments and buffs. */
  status?: { id: import('./status').EffectId; left: number | null; total: number | null; stacks?: number; amount?: number }[];
  /** The hero's ailments from a battle that last into the next one (turns left). */
  heroAilments?: Record<string, number>;
  /** The last respawn point used, if any. */
  respawn: SavePoint | null;
  /** Bag, gold and equipment (older saves have none). */
  inventory?: InventoryData;
  /** Level, experience and unspent skill points. */
  progress?: { level: number; xp: number; points: number; ranks?: Record<string, number>; taught?: string[]; stats?: Partial<Record<'str' | 'dex' | 'agi' | 'end' | 'def' | 'mag' | 'mdf', number>>; statPoints?: number };
  /** Party members besides the hero (their stats, gear and gauges). */
  party?: import('./party').MemberData[];
  /** Where the hero stands in the lineup (0: first; 3 or more: on the bench). */
  heroAt?: number;
  /** Maps visited and the ground seen in each (the world map). */
  visited?: string[];
  explored?: Record<string, { w: number; h: number; bits: string }>;
  /** Quests started, their objectives and the followed one (older saves have none). */
  quests?: QuestBookData;
}

export class SaveStore {
  private readonly prefix: string;

  constructor(gameTitle: string, playtest: boolean) {
    const id = gameTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'game';
    this.prefix = `hd2d:${playtest ? 'playtest:' : ''}${id}:save:`;
  }

  read(slot: SlotId): SaveData | null {
    try {
      const raw = localStorage.getItem(this.prefix + slot);
      if (!raw) return null;
      const d = JSON.parse(raw) as SaveData;
      return d && typeof d.map === 'string' && typeof d.x === 'number' ? d : null;
    } catch { return null; }
  }

  /** Returns false when the browser won't store it (private mode, storage full). */
  write(slot: SlotId, d: SaveData): boolean {
    try { localStorage.setItem(this.prefix + slot, JSON.stringify(d)); return true; } catch { return false; }
  }

  remove(slot: SlotId): void {
    try { localStorage.removeItem(this.prefix + slot); localStorage.removeItem(`${this.prefix}${slot}:shot`); } catch { /* nothing to do */ }
  }

  /** The picture of the moment a slot was saved (a small JPEG data URL), kept beside the save. */
  shot(slot: SlotId): string | null {
    try { return localStorage.getItem(`${this.prefix}${slot}:shot`); } catch { return null; }
  }
  writeShot(slot: SlotId, url: string | null): void {
    try { if (url) localStorage.setItem(`${this.prefix}${slot}:shot`, url); else localStorage.removeItem(`${this.prefix}${slot}:shot`); } catch { /* no room: the save matters more */ }
  }

  /** Every slot, autosave first, with its save (or null when empty). */
  list(): { slot: SlotId; data: SaveData | null }[] {
    const slots: SlotId[] = ['auto', ...Array.from({ length: SLOT_COUNT }, (_, i) => (i + 1) as SlotId)];
    return slots.map((slot) => ({ slot, data: this.read(slot) }));
  }

  /** The most recent save, for Continue. */
  latest(): { slot: SlotId; data: SaveData } | null {
    let best: { slot: SlotId; data: SaveData } | null = null;
    for (const s of this.list()) if (s.data && (!best || s.data.savedAt > best.data.savedAt)) best = { slot: s.slot, data: s.data };
    return best;
  }
}

export function formatPlayTime(seconds: number): string {
  const s = Math.floor(seconds), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}
