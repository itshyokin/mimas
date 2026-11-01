/** Default wording of the title screen and pause menu, and which pause entries work yet. */
import type { MenuConfig, PauseOption, TitleOption } from '../world/types';

export const TITLE_OPTIONS: [TitleOption, string][] = [
  ['newGame', 'New Game'], ['load', 'Load Game'], ['options', 'Options'], ['credits', 'Credits'], ['exit', 'Exit'],
];

/** The pause menu's tabs, left to right. */
export const PAUSE_OPTIONS: [PauseOption, string, boolean][] = [
  // [id, default name, works yet]
  ['status', 'Party', true],
  ['items', 'Items', true],
  ['map', 'Map', true],
  ['journal', 'Journal', true],
  ['achievements', 'Achievements', true],
  ['settings', 'Settings', true],
  ['system', 'System', true],
];
/** The System tab's entries (their wording can be changed too). */
export const SYSTEM_OPTIONS: [PauseOption, string][] = [['saveLoad', 'Save / Load'], ['quitToTitle', 'Quit to Title']];

/** Pictures for the pause menu's entries (simple line drawings in the text colour). */
const svg = (d: string) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const PAUSE_ICONS: Partial<Record<PauseOption, string>> = {
  items: svg('<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'),
  status: svg('<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14.5 14.3c2.9.2 5.5 2.4 5.5 5.7"/>'),
  abilities: svg('<path d="M12 3l2.3 5.6L20 9.3l-4.4 3.9 1.3 5.8L12 16l-4.9 3 1.3-5.8L4 9.3l5.7-.7z"/>'),
  journal: svg('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  saveLoad: svg('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'),
  quitToTitle: svg('<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>'),
  skills: svg('<circle cx="6" cy="18" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M7.5 16.5l3.5-8.5M12.9 8l3.6 8.4"/>'),
  log: svg('<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>'),
  quests: svg('<path d="M6 21V4M6 4h11l-2 4 2 4H6"/>'),
  equipment: svg('<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/>'),
  map: svg('<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  achievements: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'),
  system: svg('<rect x="4" y="4" width="16" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>'),
};

/** Older entries, now tabs (the Inventory's Status; the Journal's quests and log): names kept for old databases. */
const OLD_PAUSE: Partial<Record<PauseOption, string>> = { log: 'Adventure Log', quests: 'Quest Log', equipment: 'Equipment', skills: 'Skill Tree', abilities: 'Abilities', saveLoad: 'Save / Load', quitToTitle: 'Quit to Title' };

export const titleLabel = (m: MenuConfig | undefined, o: TitleOption): string =>
  m?.titleLabels?.[o]?.trim() || TITLE_OPTIONS.find(([k]) => k === o)![1];
export const pauseLabel = (m: MenuConfig | undefined, o: PauseOption): string =>
  m?.pauseLabels?.[o]?.trim() || PAUSE_OPTIONS.find(([k]) => k === o)?.[1] || OLD_PAUSE[o] || o;
