/**
 * Gender and roleplay info (Update 127). No three.js.
 *  - Gender: a hero's gender, shown as a coloured symbol on their stat blocks and a line on the Status page; their
 *    outfit gender (masc / femme) picks which version of worn armor they wear.
 *  - Roleplay info: titles shared by every hero (Database → Party → Roleplay: Eye colour, Favourite food…), each
 *    hero with their own answer. Conditions check an answer ("Eleanor's Favourite food is Ramen"), \rp[hero, title]
 *    shows one in text, and items can be a favourite of (or disliked by) heroes with a given answer.
 */
import type { Database, Gender, GenderLook, HeroDef, RoleplayField } from '../world/types';

export const GENDERS: Gender[] = ['male', 'female', 'transman', 'transwoman', 'transgender', 'nonbinary', 'other'];
export const GENDER_INFO: Record<Gender, { name: string; symbol: string; color: string; css: string }> = {
  male: { name: 'Male (Cis)', symbol: '♂', color: '#4a9aff', css: '#4a9aff' },
  female: { name: 'Female (Cis)', symbol: '♀', color: '#ff7ab8', css: '#ff7ab8' },
  transman: { name: 'Male (Trans)', symbol: '⚧', color: '#2a5ac8', css: '#2a5ac8' },
  transwoman: { name: 'Female (Trans)', symbol: '⚧', color: '#c8407e', css: '#c8407e' },
  transgender: { name: 'Transgender', symbol: '⚧', color: '#f5a9b8', css: 'linear-gradient(180deg, #5bcefa 0%, #5bcefa 30%, #ffffff 42%, #ffffff 58%, #f5a9b8 70%, #f5a9b8 100%)' },
  nonbinary: { name: 'Nonbinary', symbol: '⚲', color: '#a868e8', css: '#a868e8' },
  other: { name: 'Other', symbol: '✱', color: '#ffffff', css: '#ffffff' },
};

/** Symbols offered in Database → Party → Genders (or type your own). */
export const GENDER_SYMBOLS = ['♂', '♀', '⚧', '⚲', '⚥', '☿', '⚪', '✱', '★', '✦', '◆', '●'];

/** The project's gender settings (Database → Party → Genders, Update 137), set when the database loads. */
let looks: Partial<Record<Gender, GenderLook>> = {};
export function setGenderLooks(g: Partial<Record<Gender, GenderLook>> | undefined): void { looks = g ?? {}; }
/** A gender's name, symbol, colour and CSS with the project's changes. */
export function genderInfo(g: Gender): { name: string; symbol: string; color: string; css: string; image?: string } {
  const base = GENDER_INFO[g], o = looks[g] ?? {};
  return { name: o.name?.trim() || base.name, symbol: o.symbol?.trim() || base.symbol, color: o.color || base.color, css: o.color || base.css, ...(o.image ? { image: o.image } : {}) };
}
export const genderName = (g: Gender): string => genderInfo(g).name;

/** The gender symbol as HTML (the trans flag's gradient through the glyph, or a picture of its own), or ''. */
export function genderBadge(g: Gender | undefined, cls = 'g-badge'): string {
  if (!g) return '';
  const i = genderInfo(g), name = i.name.replace(/[<&"]/g, '');
  if (i.image) return `<img class="${cls} g-img" src="${i.image}" alt="${name}" title="${name}">`;
  const style = i.css.startsWith('linear') ? `background:${i.css};-webkit-background-clip:text;background-clip:text;color:transparent` : `color:${i.css}`;
  return `<span class="${cls}" title="${name}" style="${style}">${i.symbol.replace(/[<&]/g, '')}</span>`;
}

/** The roleplay titles (Database → Party → Roleplay). */
export const rpFields = (db: Database): RoleplayField[] => db.roleplay ?? [];
/** A title's id by its id or its title (case doesn't matter), or undefined. */
export function rpFieldId(db: Database, idOrTitle: string): string | undefined {
  const k = idOrTitle.trim().toLowerCase();
  return rpFields(db).find((f) => f.id.toLowerCase() === k || f.title.trim().toLowerCase() === k)?.id;
}
/** A hero's answer for a title ('' when none). */
export function rpValue(db: Database, hero: HeroDef | undefined, idOrTitle: string): string {
  const id = rpFieldId(db, idOrTitle);
  return id && hero ? hero.roleplay?.[id]?.trim() ?? '' : '';
}
/** Days from today (the real date) to the next time this "MM-DD" comes round (0: today), or null. */
export function daysUntil(md: string, now = new Date()): number | null {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(md.trim());
  if (!m) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), +m[1] - 1, +m[2]);
  if (next < today) next = new Date(now.getFullYear() + 1, +m[1] - 1, +m[2]);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

/** Today's real date as "YYYY-MM-DD" (the device's calendar), for the New day global events (Update 131). */
export function realDayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Answers match: the same words, case and spacing aside. */
export const rpMatch = (a: string, b: string): boolean => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ') && !!a.trim();
