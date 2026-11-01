/** On-screen Menu, Run, Jump and Ring buttons for touch screens (tap the map to walk). */
import type { Input } from '../game/Input';
import type { Ability } from '../world/types';

export class TouchControls {
  private readonly root = document.createElement('div');
  private readonly run: HTMLButtonElement;
  private readonly jump: HTMLButtonElement;
  private readonly ring: HTMLButtonElement;

  constructor(parent: HTMLElement, input: Input) {
    this.root.className = 'touch-controls';
    // Update 142: Party, Bag, Map and Settings buttons (a controller's X, B, Y and START).
    this.root.innerHTML = `<button type="button" class="touch-btn menu-btn" data-act="settings" aria-label="Settings">⚙</button><button type="button" class="touch-btn menu-btn" data-act="worldmap">Map</button><button type="button" class="touch-btn menu-btn" data-act="backpack">Bag</button><button type="button" class="touch-btn menu-btn" data-act="party">Party</button><button type="button" class="touch-btn run" aria-pressed="false">Run</button><button type="button" class="touch-btn jump">Jump</button><button type="button" class="touch-btn ring" hidden>Spell</button>`;
    parent.appendChild(this.root);
    this.run = this.root.querySelector('.run')!;
    this.jump = this.root.querySelector('.jump')!;
    this.ring = this.root.querySelector('.ring')!;
    // Stop taps here reaching the map underneath (which would walk there).
    const menus = [...this.root.querySelectorAll<HTMLButtonElement>('.menu-btn')];
    for (const b of [this.run, this.jump, this.ring, ...menus]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    for (const b of menus) b.addEventListener('click', () => input.press(b.dataset.act as 'party' | 'backpack' | 'worldmap' | 'settings'));
    // Sprint: Hold runs while the button is pressed; Toggle switches running on and off.
    this.run.addEventListener('pointerdown', () => {
      if (input.sprintToggle) { input.runLatched = !input.runLatched; this.run.setAttribute('aria-pressed', String(input.runLatched)); }
      else { input.touchRun = true; this.run.setAttribute('aria-pressed', 'true'); }
    });
    const release = () => { if (!input.sprintToggle) { input.touchRun = false; this.run.setAttribute('aria-pressed', 'false'); } };
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture']) this.run.addEventListener(ev, release);
    // Like a controller's A: talks / interacts (a sign, a fishing spot) when there's something there, otherwise jumps.
    this.jump.addEventListener('pointerdown', () => { input.press('ok'); input.press('jump'); });
    this.ring.addEventListener('pointerdown', () => input.press('ring'));
    const coarse = matchMedia('(pointer: coarse)');
    const show = () => (this.root.hidden = !coarse.matches || this.hiddenByGame);
    this.show = show;
    coarse.addEventListener?.('change', show);
    show();
  }

  private hiddenByGame = false;
  private show: () => void = () => {};
  /** Hide all the buttons (title screen). */
  setHidden(hidden: boolean): void { this.hiddenByGame = hidden; this.show(); }

  /** Show the Spell button while a field spell (Light, Water Walk) is equipped. */
  /** (Update 141: no spells cast on the map, so the Spell button stays hidden.) */
  setRing(_worn: boolean): void { this.ring.hidden = true; }

  /** Hide the buttons for abilities the player doesn't have (yet). */
  update(has: (a: Ability) => boolean): void {
    this.run.hidden = !has('run');
    this.jump.hidden = !has('jump');
  }
}
