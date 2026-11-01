/**
 * Word bubbles over events (Event page → Bubble): a "!" or "?" over a quest giver (World of Warcraft style), or any
 * short text, above the event, on it, or at its feet. Colours, bold / italic / strikethrough, an outline, a glow, the
 * text and bubble size are set per page; the bubble can be see-through so only the text shows. Drawn as page elements
 * that follow the events on screen.
 */

import { parseRich, richHTML } from './richText';
import { leanNow } from '../render/lean';

export interface EventBubble {
  text: string;
  at?: 'above' | 'on' | 'below';
  /** Text colour (default gold) and bubble colour (default white). */
  color?: string;
  bubble?: string;
  /** No bubble: only the text. */
  transparent?: boolean;
  /** Text size in pixels (default 22) and the bubble's size × (default 1). */
  size?: number;
  scale?: number;
  bold?: boolean; italic?: boolean; strike?: boolean;
  /** An outline round the text, in this colour. */
  outline?: string;
  /** A soft glow in the text colour. */
  glow?: boolean;
  /** A speech bubble (party chatter): wraps long lines, with a tail. */
  chat?: boolean;
  /** Bob gently up and down (default on). */
  still?: boolean;
}

/** Where the event stands, and how tall its picture is (the bubble goes above it, on it, or at its feet). */
export interface BubbleSpot { key: object; bubble: EventBubble; x: number; y: number; z: number; height: number }
const lift = (at: EventBubble['at'], height: number): number => (at === 'on' ? height * 0.55 : at === 'below' ? 0.05 : height + 0.3);

export class BubbleLayer {
  private readonly root = document.createElement('div');
  private readonly els = new Map<object, { el: HTMLElement; look: string }>();

  constructor(parent: HTMLElement) {
    this.root.className = 'bubble-layer';
    parent.appendChild(this.root);
  }

  set visible(v: boolean) { this.root.hidden = !v; }

  /** Place this frame's bubbles (any not listed are removed). */
  update(list: BubbleSpot[], project: (x: number, y: number, z: number) => { x: number; y: number; on: boolean }, time: number): void {
    const seen = new Set<object>();
    // Sprites lean back toward a high camera: their heads are up the leaned sprite, not straight up.
    const lean = leanNow(), cy = Math.cos(lean), sz = Math.sin(lean);
    for (const s of list) {
      seen.add(s.key);
      const b = s.bubble, look = JSON.stringify(b);
      let e = this.els.get(s.key);
      if (!e || e.look !== look) {
        e?.el.remove();
        e = { el: this.make(b), look };
        this.els.set(s.key, e);
        this.root.appendChild(e.el);
      }
      const bob = b.still ? 0 : Math.sin(time * 3 + s.x) * 0.06;
      const up = lift(b.at, s.height) + bob;
      const p = project(s.x, s.y + up * cy, s.z - up * sz);
      e.el.hidden = !p.on;
      if (p.on) e.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, ${b.at === 'below' ? '0' : '-100%'})`;
    }
    for (const [k, e] of this.els) if (!seen.has(k)) { e.el.remove(); this.els.delete(k); }
  }

  clear(): void { for (const e of this.els.values()) e.el.remove(); this.els.clear(); }

  private make(b: EventBubble): HTMLElement {
    const el = document.createElement('div');
    el.className = `ev-bubble${b.transparent ? ' clear' : ''}${b.at === 'below' ? ' below' : ''}${b.chat ? ' chat' : ''}`;
    const color = b.color ?? '#ffd23f', size = Math.max(8, Math.min(96, b.size ?? 22)), k = Math.max(0.4, Math.min(4, b.scale ?? 1));
    el.style.setProperty('--bb-bg', b.bubble ?? '#ffffff');
    el.style.setProperty('--bb-pad', `${Math.round(3 * k)}px ${Math.round(9 * k)}px`);
    el.style.setProperty('--bb-radius', `${Math.round(12 * k)}px`);
    const t = document.createElement('span');
    t.innerHTML = richHTML(parseRich(b.text));
    t.style.color = color;
    t.style.fontSize = `${size}px`;
    t.style.fontWeight = b.bold === false ? '400' : '900';
    if (b.italic) t.style.fontStyle = 'italic';
    if (b.strike) t.style.textDecoration = 'line-through';
    const shadows: string[] = [];
    if (b.outline) { const o = b.outline; shadows.push(`-1.5px -1.5px 0 ${o}`, `1.5px -1.5px 0 ${o}`, `-1.5px 1.5px 0 ${o}`, `1.5px 1.5px 0 ${o}`, `0 2px 0 ${o}`); }
    if (b.glow) shadows.push(`0 0 6px ${color}`, `0 0 14px ${color}`);
    if (shadows.length) t.style.textShadow = shadows.join(', ');
    el.appendChild(t);
    return el;
  }
}
