/** A tutorial pop-up (Update 113): a titled card over the game; OK (or Esc) closes it. */
import type { Input } from '../game/Input';
import { uiSound } from '../audio/sfx';
import { esc } from './InventoryScreen';

export class TutorialPopup {
  private readonly root = document.createElement('div');
  private open = false;
  private done: () => void = () => {};
  constructor(parent: HTMLElement, private readonly input: Input) {
    this.root.className = 'tut-pop';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    parent.appendChild(this.root);
  }
  get isOpen(): boolean { return this.open; }
  show(title: string, text: string, done: () => void = () => {}): void {
    this.open = true; this.done = done;
    this.root.innerHTML = `<div class="tut-card"><div class="tut-kicker">Tutorial</div><h2>${esc(title)}</h2><p>${esc(text).replace(/\n/g, '<br>')}</p>
      <div class="tut-foot"><span>Kept in Journal → Tutorials</span><button type="button" class="tut-ok">OK</button></div></div>`;
    this.root.querySelector('.tut-ok')!.addEventListener('click', () => this.close());
    this.root.hidden = false;
    uiSound('menuOk');
  }
  private close(): void { this.open = false; this.root.hidden = true; uiSound('menuOk'); this.done(); }
  update(): void {
    if (!this.open) return;
    if (this.input.confirm() || this.input.consume('cancel')) this.close();
  }
}
