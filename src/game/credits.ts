/**
 * What the Credits screen shows: your own sections (Database → Credits) and, gathered from the imported characters,
 * everyone whose sprite art is in the game, with licences and links.
 */
import type { Database, SpriteCredit, WeaponSpriteDef } from '../world/types';
import { usedWeaponSprites } from './combat/weaponSprites';

/** Looks up an LPC weapon sprite (its credits), when the list is loaded. */
export type WeaponLookup = (id: string) => WeaponSpriteDef | undefined;

export interface CreditSection { title: string; lines: string[]; small?: boolean }

/**
 * Everyone credited, each once. LPC's lists spell some names two ways ("bluecarrot16" / "Bluecarrot16",
 * "ElizaWy" / "Eliza Wyatt (ElizaWy)"): matched ignoring case and on the handle in brackets, the fuller spelling kept.
 */
export function uniqueAuthors(credits: SpriteCredit[]): string[] {
  const out: string[] = [];
  const handle = (a: string) => (a.match(/\(([^)]+)\)\s*$/)?.[1] ?? a).trim().toLowerCase();
  for (const c of credits) for (const a of c.authors) {
    const i = out.findIndex((x) => handle(x) === handle(a) || x.toLowerCase() === a.toLowerCase());
    if (i < 0) out.push(a);
    else if (a.length > out[i].length) out[i] = a;
  }
  return out;
}

/** Every sprite part credited across the characters and the weapons in use, merged by part (and its authors). */
export function spriteCredits(db: Database, weapons?: WeaponLookup, assets: SpriteCredit[][] = []): SpriteCredit[] {
  const seen = new Map<string, SpriteCredit>();
  const all = [...Object.values(db.characters).map((c) => c.credits ?? []),
    ...(weapons ? usedWeaponSprites(db).map((id) => weapons(id)?.credits ?? []) : []), ...assets];
  for (const list of all) {
    for (const cr of list) {
      const key = cr.item + '|' + cr.authors.join(',');
      if (!seen.has(key)) seen.set(key, cr);
    }
  }
  return [...seen.values()];
}

export function creditSections(db: Database, weapons?: WeaponLookup, assets: SpriteCredit[][] = []): CreditSection[] {
  const out: CreditSection[] = [];
  for (const e of db.credits ?? []) {
    const lines = e.names.split('\n').map((l) => l.trim()).filter(Boolean);
    if (e.title.trim() || lines.length) out.push({ title: e.title.trim(), lines });
  }
  const sprites = spriteCredits(db, weapons, assets);
  if (sprites.length) {
    const authors = uniqueAuthors(sprites);
    const licences = [...new Set(sprites.flatMap((s) => s.licenses))].sort();
    const revised = sprites.some((s) => s.urls.some((u) => u.includes('ElizaWy/LPC')));
    out.push({ title: 'Sprites and tiles', lines: [...authors, '', 'From the Liberated Pixel Cup (LPC) collection on OpenGameArt.org', 'opengameart.org/content/lpc-collection',
      ...(revised ? ['LPC Revised: github.com/ElizaWy/LPC'] : []), `Licences: ${licences.join(', ')}`] });
    out.push({
      title: 'Sprite details', small: true,
      lines: sprites.map((s) => `${s.item}: ${s.authors.join(', ')} (${s.licenses.join(' / ')})${s.urls.length ? ' ' + s.urls.join(' ') : ''}`),
    });
  }
  // The game's lettering (whichever is chosen), all under the SIL Open Font License 1.1.
  const font = db.menus?.font ?? 'classic';
  out.push({ title: 'Fonts', small: true, lines: [
    font === 'classic' ? 'Press Start 2P: © 2012 The Press Start 2P Project Authors' : font === 'soft' ? 'Pixelify Sans: © 2021 The Pixelify Sans Project Authors' : 'Atkinson Hyperlegible: © 2020 Braille Institute of America, Inc.',
    ...(font !== 'smooth' ? ['Atkinson Hyperlegible (easy-to-read text): © 2020 Braille Institute of America, Inc.'] : []),
    'Silkscreen: © 2001 The Silkscreen Project Authors',
    'SIL Open Font License 1.1 (scripts.sil.org/OFL)',
  ] });
  return out;
}

/** The credits as plain text (for a CREDITS.txt next to a release). */
export function creditsText(db: Database, weapons?: WeaponLookup, assets: SpriteCredit[][] = []): string {
  return creditSections(db, weapons, assets).map((s) => (s.title ? `${s.title}\n${'-'.repeat(s.title.length)}\n` : '') + s.lines.join('\n')).join('\n\n') + '\n';
}
