/**
 * Mimas: the GBA game's credits roll (Update 16): your own sections (Database → Credits), everyone whose sprite art
 * is in the game (from the characters' credits, with licences), and what the ROM is built with. The playtest and the
 * ROM (gba_game.json `credits`) roll the same lines.
 */
import { creditSections } from '../game/credits';
import type { Database } from '../world/types';

export interface GbaCreditSection { title: string; lines: string[] }

export function gbaCredits(db: Database): GbaCreditSection[] {
  const name = db.menus?.titleText?.trim() || db.title || 'Mimas';
  const own = creditSections(db).filter((s) => s.title !== 'Fonts').map((s) => ({ title: s.title, lines: s.lines }));
  return [
    { title: name, lines: db.menus?.subtitle?.trim() ? [db.menus.subtitle.trim()] : [] },
    ...own,
    { title: 'Made with', lines: ['Butano, a GBA engine by Gustavo Valiente (zlib licence)', 'Mimas: the GBA side of the Saturn Game Engine'] },
    { title: '', lines: ['Thank you for playing!'] },
  ];
}
