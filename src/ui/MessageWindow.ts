/**
 * RPG-style message window: speaker name, typewriter text, and a choice list. It can float as a bubble
 * above (or below) whoever is talking, with a tail pointing at them, or sit at the top, bottom or centre
 * of the screen (Settings → Gameplay → Text boxes). Bubbles size themselves to the text.
 * Works with keyboard (Enter/Space, arrows, Esc/X) and with taps/clicks. Words can be styled with tags ([b], [i],
 * [color=#…], the Database's named colours: see richText.ts), and a message can have a look of its own (box and
 * text colours, size, bold, outline, glow, a see-through box), like the word bubbles over events.
 */
import type { Input } from '../game/Input';
import type { TextBoxPlace } from '../game/settings';
import { applyLook, messageStyles, parseRich, richHTML, type MessageStyle, type RichSeg, type TextLook } from './richText';

/** Who is talking: where their head and feet are on screen (null when off screen), and whether they're a character (tail). */
export interface Speaker { head(): { x: number; y: number } | null; feet(): { x: number; y: number } | null; character: boolean }

/** Typing speed in characters per second (Settings → Text speed; Infinity shows text at once). */
let charsPerSecond = 45;
export function setTextSpeed(cps: number): void { charsPerSecond = cps; }

export class MessageWindow {
  private readonly root: HTMLDivElement;
  private readonly nameEl: HTMLDivElement;
  private readonly textEl: HTMLDivElement;
  private readonly nextEl: HTMLDivElement;
  private readonly choicesEl: HTMLDivElement;
  private fullText = '';
  private segs: RichSeg[] = [];
  private drawn = -1;
  /** A soft tick as letters appear (Settings → Sound → Letter ticks); set by the game. */
  tick: (() => void) | null = null;
  private ticked = 0;
  private lastTick = 0;
  private shown = 0;
  private typing = false;
  private awaitingConfirm = false;
  private holdForChoice = false;
  private choosing = false;
  private choiceIndex = 0;
  private choiceCount = 0;
  private cancelIndex: number | undefined;
  private picked: number | null = null;
  private place: TextBoxPlace = 'above';
  private speaker: Speaker | null = null;
  private style: 'speech' | 'plain' | undefined;

  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'msg';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-live', 'polite');
    this.root.innerHTML = '<div class="msg-name"></div><div class="msg-box"><div class="msg-text"></div><div class="msg-next" aria-hidden="true"></div></div><div class="msg-choices" role="listbox"></div>';
    this.nameEl = this.root.querySelector('.msg-name')!;
    this.textEl = this.root.querySelector('.msg-text')!;
    this.nextEl = this.root.querySelector('.msg-next')!;
    this.choicesEl = this.root.querySelector('.msg-choices')!;
    // Tapping the text box advances, like pressing OK.
    this.root.querySelector('.msg-box')!.addEventListener('pointerdown', (e) => { e.preventDefault(); this.input.press('ok'); });
    parent.appendChild(this.root);
  }

  /** True while the player still has to read or answer something. */
  get busy(): boolean {
    return this.typing || this.awaitingConfirm || this.choosing;
  }
  get isOpen(): boolean {
    return !this.root.hidden;
  }
  get isChoosing(): boolean {
    return this.choosing;
  }

  private styles = new Map<string, MessageStyle>(messageStyles().map((x) => [x.id, x]));
  /** The project's text box styles (Database → Text boxes). */
  setStyles(list?: MessageStyle[]): void { this.styles = new Map(messageStyles(list).map((x) => [x.id, x])); }

  /** Where text boxes go (a player setting). */
  setPlace(p: TextBoxPlace): void { this.place = p; }
  /** Who the next messages come from (an event), or null. */
  setSpeaker(s: Speaker | null): void { this.speaker = s; }

  /**
   * Show a message. `styleId`: a text box style (unset: Speech for a character, Sign for an object, Narration with
   * nobody); `style` and `look` override the style's box and look.
   */
  showText(text: string, speaker?: string, holdForChoice = false, style?: 'speech' | 'plain', look?: TextLook, styleId?: string): void {
    this.root.hidden = false;
    const id = styleId && this.styles.has(styleId) ? styleId : this.speaker ? (this.speaker.character ? 'speech' : 'sign') : speaker ? 'speech' : 'narration';
    const st = this.styles.get(id);
    this.style = style ?? (st?.box === 'speech' || st?.box === 'plain' ? st.box : undefined);
    look = look ?? st?.look;
    this.root.dataset.style = id;
    this.clearChoices();
    this.nameEl.textContent = speaker ?? '';
    this.nameEl.hidden = !speaker;
    this.segs = parseRich(text);
    this.fullText = this.segs.map((x) => x.text).join('');
    this.drawn = -1;
    applyLook(this.root, look, this.textEl);
    this.shown = 0;
    this.textEl.textContent = '';
    this.typing = true;
    this.awaitingConfirm = false;
    this.holdForChoice = holdForChoice;
    this.nextEl.hidden = true;
  }

  showChoices(options: string[], cancelIndex?: number): void {
    this.root.hidden = false;
    this.clearChoices();
    this.choicesEl.hidden = false;
    this.choosing = true;
    this.picked = null;
    this.choiceIndex = 0;
    this.choiceCount = options.length;
    this.cancelIndex = cancelIndex;
    options.forEach((label, i) => {
      const b = document.createElement('button');
      b.className = 'msg-choice';
      b.type = 'button';
      b.innerHTML = richHTML(parseRich(label));
      b.setAttribute('role', 'option');
      b.addEventListener('pointerenter', () => this.highlight(i));
      b.addEventListener('click', () => this.pick(i));
      this.choicesEl.appendChild(b);
    });
    this.highlight(0);
  }

  /** Returns the picked option once, then null. */
  takeChoice(): number | null {
    const p = this.picked;
    this.picked = null;
    return p;
  }

  /**
   * Put the box where it belongs this frame: over the speaker's head (or under their feet) as a bubble,
   * or at a fixed spot. Falls back to the bottom when there's no speaker on screen.
   */
  position(): void {
    if (this.root.hidden) return;
    const r = this.root, sp = this.speaker;
    const anchor = sp && (this.place === 'above' ? sp.head() : this.place === 'below' ? sp.feet() : null);
    const fixed = anchor ? null : this.place === 'top' || this.place === 'center' ? this.place : 'bottom';
    const tail = !!anchor && (this.style === 'speech' || (this.style !== 'plain' && sp!.character));
    r.classList.toggle('bubble', !!anchor);
    r.classList.toggle('tail', tail);
    r.classList.toggle('below', !!anchor && this.place === 'below');
    for (const p of ['top', 'center', 'bottom'] as const) r.classList.toggle(`at-${p}`, fixed === p);
    if (!anchor) { r.style.left = ''; r.style.top = ''; r.style.removeProperty('--tail-x'); return; }
    // Centre over the speaker, kept on screen; the tail still points at them.
    const w = r.offsetWidth, h = r.offsetHeight, margin = 12;
    const left = Math.min(innerWidth - w - margin, Math.max(margin, anchor.x - w / 2));
    const top = this.place === 'above' ? Math.max(margin, anchor.y - h - 18) : Math.min(innerHeight - h - margin, anchor.y + 18);
    r.style.left = `${left}px`;
    r.style.top = `${top}px`;
    r.style.setProperty('--tail-x', `${Math.min(w - 24, Math.max(24, anchor.x - left))}px`);
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.typing = this.awaitingConfirm = this.choosing = false;
    this.clearChoices();
  }

  update(dt: number): void {
    if (this.root.hidden) return;
    if (this.typing) {
      if (this.input.confirm()) this.shown = this.fullText.length;
      else {
        const before = Math.floor(this.shown);
        this.shown = Math.min(this.fullText.length, this.shown + dt * charsPerSecond);
        // One tick per couple of letters (not for spaces), and never faster than ~22 a second, so fast text doesn't buzz.
        const now = Math.floor(this.shown);
        if (this.tick && now > before) {
          for (let k = before; k < now; k++) if (/\S/.test(this.fullText[k])) this.ticked++;
          const gap = performance.now() - this.lastTick;
          if (this.ticked >= 2 && gap > 45) { this.ticked = 0; this.lastTick = performance.now(); this.tick(); }
        }
      }
      const n = Math.floor(this.shown);
      if (n !== this.drawn) { this.drawn = n; this.textEl.innerHTML = richHTML(this.segs, n); }
      if (this.shown >= this.fullText.length) {
        this.typing = false;
        this.awaitingConfirm = !this.holdForChoice;
        this.nextEl.hidden = !this.awaitingConfirm;
      }
      return;
    }
    if (this.awaitingConfirm) {
      if (this.input.confirm()) { this.awaitingConfirm = false; this.nextEl.hidden = true; }
      return;
    }
    if (this.choosing) {
      if (this.input.consume('up')) this.highlight((this.choiceIndex + this.choiceCount - 1) % this.choiceCount);
      if (this.input.consume('down')) this.highlight((this.choiceIndex + 1) % this.choiceCount);
      if (this.input.confirm()) this.pick(this.choiceIndex);
      else if (this.cancelIndex !== undefined && this.input.consume('cancel')) this.pick(this.cancelIndex);
    }
  }

  private highlight(i: number): void {
    this.choiceIndex = i;
    this.choicesEl.querySelectorAll('.msg-choice').forEach((el, j) => el.setAttribute('aria-selected', String(j === i)));
  }

  private pick(i: number): void {
    if (!this.choosing) return;
    this.choosing = false;
    this.picked = i;
    this.clearChoices();
  }

  private clearChoices(): void {
    this.choicesEl.replaceChildren();
    this.choicesEl.hidden = true;
    this.choosing = false;
  }
}
