/**
 * Database → Party → Genders (Update 137): rename each gender, pick its symbol (or type your own, or use a small
 * picture), and recolour it. Heroes' badges everywhere follow (HUD cards, party panels, the Status page).
 */
import type { Gender, GenderLook } from '../world/types';
import { GENDERS, GENDER_INFO, GENDER_SYMBOLS, genderBadge, setGenderLooks } from '../game/roleplay';
import { checkbox, h, select, textInput, toast } from './dom';

/** A picture file as a small (32 px) PNG data URL, kept in the database. */
async function smallPicture(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 32 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = k < 1;
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export function gendersTab(looks: Partial<Record<Gender, GenderLook>>, rerender: () => void): HTMLElement[] {
  setGenderLooks(looks);
  const tidy = (g: Gender) => { const o = looks[g]; if (o && !o.name && !o.symbol && !o.image && !o.color) delete looks[g]; setGenderLooks(looks); };
  const rows = GENDERS.map((g) => {
    const base = GENDER_INFO[g], o = (looks[g] ??= {});
    const preview = h('span', { class: 'gender-preview' });
    preview.innerHTML = genderBadge(g);
    const redraw = () => { tidy(g); preview.innerHTML = genderBadge(g); };
    const custom = !!o.symbol && !GENDER_SYMBOLS.includes(o.symbol);
    const color = h('input', { type: 'color', value: o.color ?? (base.css.startsWith('#') ? base.css : '#ffffff'), disabled: !o.color, 'aria-label': `${base.name} colour` }) as HTMLInputElement;
    color.addEventListener('input', () => { o.color = color.value; redraw(); });
    const file = h('input', { type: 'file', accept: 'image/png,image/gif,image/webp,image/jpeg', hidden: true }) as HTMLInputElement;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try { o.image = await smallPicture(f); rerender(); } catch { toast('That picture couldn’t be read.', 'error'); }
    });
    return h('div', { class: 'gender-row' },
      preview,
      textInput(o.name ?? '', (v) => { o.name = v.trim() || undefined; redraw(); }, { placeholder: base.name, 'aria-label': `${base.name} name` }),
      select([['', `${base.symbol} (built-in)`], ...GENDER_SYMBOLS.filter((x) => x !== base.symbol).map((x) => [x, x] as [string, string]), ['custom', 'Type your own…']], custom ? 'custom' : o.symbol ?? '', (v) => {
        if (v === 'custom') o.symbol = o.symbol && custom ? o.symbol : '?'; else o.symbol = v || undefined;
        rerender();
      }, { 'aria-label': `${base.name} symbol` }),
      custom ? textInput(o.symbol ?? '', (v) => { o.symbol = [...v.trim()].slice(0, 2).join('') || undefined; redraw(); }, { 'aria-label': 'Your own symbol', class: 'gender-own', maxlength: '4' }) : h('span'),
      h('span', { class: 'gender-color' }, checkbox('Colour', !!o.color, (v) => { if (v) o.color = color.value; else delete o.color; color.disabled = !v; redraw(); }), color),
      h('span', { class: 'gender-pic' },
        h('button', { type: 'button', class: 'btn small', onclick: () => file.click() }, o.image ? 'Change picture…' : 'Use a picture…'),
        o.image ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { delete o.image; rerender(); } }, 'Remove') : h('span'), file));
  });
  return [h('section', { class: 'db-section db-wide' }, h('h3', {}, 'Genders'),
    h('p', { class: 'note' }, 'How each gender reads and looks on heroes’ badges (HUD cards, party panels, the Status page). Leave a box empty for the built-in name, symbol or colour. A picture (any small image, kept at 32 px) replaces the symbol.'),
    ...rows)];
}

/** What's worth saving: genders with something changed. */
export function cleanGenders(looks: Partial<Record<Gender, GenderLook>>): Partial<Record<Gender, GenderLook>> | undefined {
  const out: Partial<Record<Gender, GenderLook>> = {};
  for (const g of GENDERS) {
    const o = looks[g];
    if (!o) continue;
    const c: GenderLook = { ...(o.name?.trim() ? { name: o.name.trim() } : {}), ...(o.symbol?.trim() ? { symbol: o.symbol.trim() } : {}), ...(o.image ? { image: o.image } : {}), ...(o.color ? { color: o.color } : {}) };
    if (Object.keys(c).length) out[g] = c;
  }
  return Object.keys(out).length ? out : undefined;
}
