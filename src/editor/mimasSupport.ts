/**
 * Mimas: Database settings the GBA game doesn't use (yet). They stay editable and keep their values (nothing is
 * erased), but show greyed with a note, so we can work through them and switch them on one by one. To switch one
 * on, take it out of the lists below once the playtest and the ROM both use it.
 */

/** Whole tabs the GBA game leaves out. */
export const MIMAS_OFF_TABS: ReadonlySet<string> = new Set([
  'classes', 'relations', 'roleplay', 'skills', 'materials', 'shards', 'quests', 'achievements', 'tutorials', 'globals',
  'camera', 'time', 'climate', 'mapThemes', 'markers', 'horses', 'messageStyles', 'textColors', 'credits',
]);

interface Off { sections?: string[]; labels?: string[] }

/** Per tab: sections (by heading) and fields / switches (by label) the GBA game leaves out. */
const OFF: Record<string, Off> = {
  combat: {
    sections: ['Sword, bow and spells on the map', 'Forges (anvils)', 'Stealth and levels', 'Bestiary', 'Element stones', 'Senses', 'Impact', 'Tint'],
    labels: [
      // Mimas battles are always one hero against one foe, on the Pocket Handheld screen, with no timing game.
      'Battle mode', 'Battle screen layout', 'Addition timing', 'Heroes who fight (Single)', 'Most enemies in a battle', 'Turn order', 'Single mode: battles are',
      'Enemies who join (tiles)', 'Campfire safe ground (tiles)', 'Safe after a battle (s)', 'Field of view (°)',
      'Skill points per level', 'Party skill points per level', 'Skill points at the start',
      'Drops show after', 'Elements show after', 'Numbers show after', 'Pills show',
      // Enemies: the field (action) side and the extras the ROM's battles don't roll.
      'Behaviour', 'Hearing', 'Sight (tiles)', 'Moves by', 'Speed', 'Height (tiles)', 'Height offset (tiles)', 'Weapon sprite', 'Shield',
      'Accuracy %', 'Evasion %', 'Spell evasion %', 'Plain attack: how often', 'Only below health %',
      'Lock-on range otherwise', 'Lock-on range with a bow', 'Arrow speed', 'Full draw (s)', 'Wind-up (s)', 'Between attacks (s)',
      'Spell bolt range', 'Spell bolt speed', 'A fire attack lights a fire for (s)',
    ],
  },
  enemies: {
    sections: ['Senses', 'Impact', 'Tint', 'Bestiary', 'Advanced form'],
    labels: ['Behaviour', 'Hearing', 'Sight (tiles)', 'Moves by', 'Speed', 'Height (tiles)', 'Height offset (tiles)', 'Weapon sprite', 'Shield',
      'Accuracy %', 'Evasion %', 'Spell evasion %', 'Plain attack: how often', 'Only below health %',
      'Water enemy*', 'Undead*', 'Leave it out of the Bestiary', 'Breathes while standing still'],
  },
  additions: {
    sections: ['Action mode', 'Mastery', 'Stat boost', 'Weapons and armor'],
    labels: ['Button', 'Window (s)', 'Time to press them (s)', 'Highest rank', 'Completions per rank', 'Each rank: power +%', 'Each rank: window +%', 'Each rank: damage +%'],
  },
  spells: {
    sections: ['Action mode', 'Spell addition', 'Skill trees'],
    labels: ['Bolt speed', 'Range (tiles)', 'Charges (turns)', 'A clean cast', 'Ring closes (s)', 'Accuracy %', 'Each rank: magic +%'],
  },
  heroes: {
    sections: ['Forms', 'Rest preferences', 'Roleplay'],
    labels: ['Battle height offset (tiles)', 'Class', 'Face art', 'Outfit gender', 'Rerolls', 'Fights as'],
  },
  menus: {
    sections: ['Window theme', 'Title screen', 'Pause menu', 'Developer console', 'Journal'],
  },
};

const NOTE = 'Not in the GBA game yet (Saturn only). It keeps its value, so it can be switched on later.';

/** A label's own words (not its ⓘ button's). */
const words = (el: Element | null): string => [...(el?.childNodes ?? [])].filter((n) => n.nodeType === Node.TEXT_NODE || (n instanceof HTMLElement && n.tagName === 'SPAN')).map((n) => n.textContent).join('').trim();

function dim(el: Element): void {
  el.classList.add('mimas-off');
  (el as HTMLElement).title = NOTE;
}

/** Grey out what the GBA game doesn't use on this tab (after it has been drawn and organized). */
export function markMimas(content: HTMLElement, tab: string): void {
  if (MIMAS_OFF_TABS.has(tab)) {
    content.prepend(Object.assign(document.createElement('p'), { className: 'note mimas-off-note', textContent: `This whole tab is ${NOTE[0].toLowerCase()}${NOTE.slice(1)}` }));
    for (const el of content.querySelectorAll('.db-section, .items-layout')) dim(el);
    return;
  }
  const off = OFF[tab];
  if (!off) return;
  const sections = new Set(off.sections ?? []);
  // A label ending in * matches any label starting with the words before it.
  const exact = new Set((off.labels ?? []).filter((l) => !l.endsWith('*'))), starts = (off.labels ?? []).filter((l) => l.endsWith('*')).map((l) => l.slice(0, -1));
  const labels = { has: (l: string) => exact.has(l) || starts.some((p) => l.startsWith(p)) };
  for (const h3 of content.querySelectorAll('h3')) {
    if (!sections.has(words(h3))) continue;
    const sec = h3.closest('.db-section');
    if (sec && sec.querySelector(':scope > h3') === h3) dim(sec);
    else { dim(h3); for (let n = h3.nextElementSibling; n && n.tagName !== 'H3'; n = n.nextElementSibling) dim(n); }
  }
  for (const f of content.querySelectorAll('.field')) {
    const l = words(f.querySelector(':scope > label'));
    if (labels.has(l)) dim(f);
  }
  for (const c of content.querySelectorAll('label.check')) {
    const l = words(c);
    if (labels.has(l)) dim(c);
  }
}
