/**
 * Styled text inside messages and word bubbles: tags around words colour or style just those words.
 *
 *   [b]bold[/b]  [i]italic[/i]  [s]struck through[/s]  [u]underlined[/u]  [glow]glowing[/glow]  [outline]outlined[/outline]
 *   [color=#5ab8ff]any colour[/color]  and the Database's named colours: [name]Lord Varn[/name], [place]Ashford[/place] …
 *
 * Tags can be nested and are closed with [/tag] (an unclosed tag runs to the end). Anything in square brackets that
 * isn't a tag stays as written. The typewriter effect counts only the letters shown, so tags never appear half-typed.
 *
 * A message's whole look (its box colour, text colour and size, bold …) is a TextLook, the same settings word bubbles
 * have.
 */

/** A named text colour (Database → Text colours), used as [id]words[/id]. */
export interface TextColor { id: string; name: string; color: string }

export const DEFAULT_TEXT_COLORS: TextColor[] = [
  { id: 'name', name: 'Names', color: '#6ab8ff' },
  { id: 'place', name: 'Places', color: '#7fd67a' },
  { id: 'item', name: 'Items', color: '#ffd23f' },
  { id: 'danger', name: 'Danger', color: '#ff6a5a' },
];

let named: TextColor[] = DEFAULT_TEXT_COLORS;
/** The project's named colours (the defaults when it has none). */
export function setTextColors(list: TextColor[] | undefined): void { named = list?.length ? list : DEFAULT_TEXT_COLORS; }
export function textColors(list?: TextColor[]): TextColor[] { return list?.length ? list : DEFAULT_TEXT_COLORS; }

/** How a whole message or bubble looks (every field optional: the window's own style otherwise). */
export interface TextLook {
  /** Text colour. */
  color?: string;
  /** Box colour. */
  bubble?: string;
  /** No box: only the text. */
  transparent?: boolean;
  /** Text size in pixels. */
  size?: number;
  bold?: boolean; italic?: boolean; strike?: boolean;
  /** An outline round the letters, in this colour. */
  outline?: string;
  glow?: boolean;
}

interface Style { b?: boolean; i?: boolean; s?: boolean; u?: boolean; glow?: boolean; outline?: boolean; color?: string }
export interface RichSeg extends Style { text: string }

const SIMPLE: Record<string, keyof Style> = { b: 'b', i: 'i', s: 's', u: 'u', glow: 'glow', outline: 'outline' };
const TAG = /\[(\/?)([a-z][a-z0-9_-]*)(?:=([^\]\s]+))?\]/gi;
const HEX = /^#?[0-9a-f]{3,8}$/i;

/** Split text into runs of one style each. */
export function parseRich(src: string): RichSeg[] {
  const out: RichSeg[] = [];
  const stack: { tag: string; style: Style }[] = [];
  let style: Style = {}, last = 0;
  const push = (text: string) => { if (text) out.push({ ...style, text }); };
  for (const m of src.matchAll(TAG)) {
    const [whole, close, rawTag, arg] = m, tag = rawTag.toLowerCase(), at = m.index ?? 0;
    const nameColor = named.find((c) => c.id.toLowerCase() === tag);
    const known = tag in SIMPLE || tag === 'color' || tag === 'colour' || !!nameColor;
    if (!known) continue;
    push(src.slice(last, at));
    last = at + whole.length;
    if (close) {
      const k = stack.map((s) => s.tag).lastIndexOf(tag === 'colour' ? 'color' : tag);
      if (k >= 0) { stack.length = k; style = k ? stack[k - 1].style : {}; }
      continue;
    }
    const next: Style = { ...style };
    if (tag in SIMPLE) next[SIMPLE[tag]] = true as never;
    else if (nameColor) next.color = nameColor.color;
    else if (arg) {
      const c = named.find((x) => x.id.toLowerCase() === arg.toLowerCase());
      next.color = c ? c.color : HEX.test(arg) ? (arg.startsWith('#') ? arg : `#${arg}`) : arg.replace(/[^a-z]/gi, '');
    }
    stack.push({ tag: tag === 'colour' ? 'color' : tag, style: next });
    style = next;
  }
  push(src.slice(last));
  return out;
}

/** The text without its tags. */
export function plainText(src: string): string { return parseRich(src).map((s) => s.text).join(''); }

/** How many letters are shown (tags don't count). */
export function richLength(segs: RichSeg[]): number { return segs.reduce((n, s) => n + s.text.length, 0); }

const escHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The runs as HTML, up to `upto` letters (for typing them out). */
export function richHTML(segs: RichSeg[], upto = Infinity): string {
  let left = upto, html = '';
  for (const s of segs) {
    if (left <= 0) break;
    const text = s.text.slice(0, left);
    left -= text.length;
    const css: string[] = [], deco: string[] = [];
    if (s.b) css.push('font-weight:900');
    if (s.i) css.push('font-style:italic');
    if (s.s) deco.push('line-through');
    if (s.u) deco.push('underline');
    if (deco.length) css.push(`text-decoration:${deco.join(' ')}`);
    if (s.color) css.push(`color:${s.color}`);
    const sh: string[] = [];
    // Pixel fonts have no bold: a copy of the letters a hair to the right thickens them.
    if (s.b) sh.push('0.07em 0 0 currentColor');
    if (s.outline) sh.push('-1.5px -1.5px 0 #000', '1.5px -1.5px 0 #000', '-1.5px 1.5px 0 #000', '1.5px 1.5px 0 #000');
    if (s.glow) sh.push('0 0 6px currentColor', '0 0 14px currentColor');
    if (sh.length) css.push(`text-shadow:${sh.join(',')}`);
    html += css.length ? `<span style="${css.join(';')}">${escHtml(text)}</span>` : escHtml(text);
  }
  return html;
}

/** A whole look as CSS on an element (text colour, size, weight …); the box colour goes in --look-bg. */
export function applyLook(el: HTMLElement, look: TextLook | undefined, text: HTMLElement): void {
  const l = look ?? {};
  el.classList.toggle('looked', !!look);
  el.classList.toggle('look-clear', !!l.transparent);
  if (l.bubble) el.style.setProperty('--look-bg', l.bubble); else el.style.removeProperty('--look-bg');
  el.classList.toggle('look-bg', !!look && !!l.bubble);
  // !important: window themes colour every text in their frames (Update 129).
  if (l.color) text.style.setProperty('color', l.color, 'important'); else text.style.removeProperty('color');
  text.style.fontSize = l.size ? `${Math.max(8, Math.min(96, l.size))}px` : '';
  text.style.fontWeight = l.bold ? '900' : '';
  text.style.fontStyle = l.italic ? 'italic' : '';
  text.style.textDecoration = l.strike ? 'line-through' : '';
  const sh: string[] = [];
  if (l.bold) sh.push('0.07em 0 0 currentColor');
  if (l.outline) { const o = l.outline; sh.push(`-1.5px -1.5px 0 ${o}`, `1.5px -1.5px 0 ${o}`, `-1.5px 1.5px 0 ${o}`, `1.5px 1.5px 0 ${o}`); }
  if (l.glow) sh.push(`0 0 6px ${l.color ?? 'currentColor'}`, `0 0 14px ${l.color ?? 'currentColor'}`);
  text.style.textShadow = sh.join(', ');
}

/**
 * Text box styles (Database → Text boxes): ready-made looks for messages. A Show text command picks one (or
 * Automatic: Speech for people, Sign for signs and objects, Narration with nobody speaking); the game's own messages
 * use Item received, Gold received and System. A command can still change the look just for itself.
 */
export interface MessageStyle {
  id: string;
  name: string;
  /** Speech bubble with a tail, a plain box, or automatic (a tail for characters). */
  box?: 'auto' | 'speech' | 'plain';
  /** The look (unset: the game window's own). */
  look?: TextLook;
}

/** The built-in styles every project has (they can be changed, not removed). */
export const BUILTIN_STYLE_IDS = ['speech', 'sign', 'narration', 'item', 'gold', 'system'] as const;

export const DEFAULT_MESSAGE_STYLES: MessageStyle[] = [
  { id: 'speech', name: 'Speech (people talking)', box: 'auto' },
  { id: 'sign', name: 'Sign (signs and objects)', box: 'plain', look: { bubble: '#3b2a1a', color: '#f6e7c8' } },
  { id: 'narration', name: 'Narration (nobody speaking)', box: 'plain', look: { bubble: '#0b0d16', color: '#e6e1d6', italic: true } },
  { id: 'item', name: 'Item received', box: 'plain', look: { bubble: '#14241c', color: '#e9f7e4' } },
  { id: 'gold', name: 'Gold received', box: 'plain', look: { bubble: '#2a2210', color: '#ffe7a3' } },
  { id: 'system', name: 'System (learned, class…)', box: 'plain', look: { bubble: '#121a2c', color: '#dfe8ff' } },
];

/** The project's styles: its own, with any built-in one it lacks added. */
export function messageStyles(list?: MessageStyle[]): MessageStyle[] {
  const out = list?.length ? [...list] : [];
  for (const d of DEFAULT_MESSAGE_STYLES) if (!out.some((s) => s.id === d.id)) out.splice(DEFAULT_MESSAGE_STYLES.indexOf(d), 0, d);
  return out;
}
