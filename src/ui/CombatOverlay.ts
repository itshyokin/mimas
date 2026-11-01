/**
 * Combat text and markers drawn over the game: floating damage numbers, enemy health bars and
 * awareness icons (? suspicious, ! alert), the lock-on marker, the bow's draw meter, the stealth eye
 * and a short loot feed. Everything is placed from 3D positions each frame.
 */

export type FloatKind = 'dmg' | 'crit' | 'hurt' | 'xp' | 'info' | 'heal';
export type Project = (x: number, y: number, z: number) => { x: number; y: number; on: boolean };

interface Float { el: HTMLElement; x: number; y: number; z: number; t: number; life: number }
export interface TagInfo { hp: number; max: number; awareness: number; alert: boolean; alertAge: number; locked: boolean; name: string; dead: boolean; /** Its element icons (image URLs), shown while locked on. */ elements?: string[]; /** Its ailments' icons. */ status?: string[] }

export class CombatOverlay {
  private readonly root = document.createElement('div');
  private readonly floats: Float[] = [];
  private readonly tags = new Map<object, HTMLElement>();
  private readonly seen = new Set<object>();
  private readonly meterEl = document.createElement('div');
  private readonly eye = document.createElement('div');
  /** Sneaking: dark edges, deeper the better hidden. */
  private readonly shade = document.createElement('div');
  private shadeWant = 0;
  private shadeNow = 0;
  private readonly feed = document.createElement('div');
  private readonly banner = document.createElement('div');
  private bannerTimer = 0;
  private project: Project = () => ({ x: 0, y: 0, on: false });

  constructor(parent: HTMLElement) {
    this.root.className = 'combat-overlay';
    this.root.setAttribute('aria-hidden', 'true');
    this.meterEl.className = 'draw-meter';
    this.meterEl.innerHTML = '<span></span>';
    this.meterEl.hidden = true;
    this.shade.className = 'stealth-shade';
    this.shade.hidden = true;
    this.shade.setAttribute('aria-hidden', 'true');
    this.eye.className = 'stealth-eye';
    this.eye.hidden = true;
    this.feed.className = 'loot-feed';
    this.feed.setAttribute('aria-live', 'polite');
    this.banner.className = 'levelup';
    this.banner.hidden = true;
    this.banner.setAttribute('role', 'status');
    this.root.append(this.meterEl, this.eye);
    parent.append(this.shade, this.root, this.feed, this.banner);
  }

  setProjector(p: Project): void { this.project = p; }

  setHidden(hidden: boolean): void { this.root.hidden = hidden; this.feed.hidden = hidden; if (hidden) { this.banner.hidden = true; this.shadeWant = this.shadeNow = 0; this.shade.hidden = true; } }

  /** A number or word that rises and fades from a point in the world. */
  float(text: string, x: number, y: number, z: number, kind: FloatKind = 'dmg', color?: string): void {
    const el = document.createElement('div');
    el.className = `float ${kind}`;
    el.textContent = text;
    // Elemental hits: the number in the element's colour.
    if (color) el.style.color = color;
    this.root.appendChild(el);
    // Spread numbers a little so several hits don't stack on one spot.
    this.floats.push({ el, x: x + (Math.random() - 0.5) * 0.3, y, z, t: 0, life: kind === 'xp' || kind === 'info' ? 1.4 : 0.9 });
  }

  /** The big LEVEL UP banner at the top of the screen. */
  levelUp(level: number, points: number, hint: string): void {
    this.showBanner(`<div class="lu-title">LEVEL UP</div><div class="lu-level">Level ${level}</div>${
      points > 0 ? `<div class="lu-points">+${points} skill point${points === 1 ? '' : 's'} · ${hint}</div>` : ''}`, '');
  }

  /** "QUEST STARTED / Slime Trouble", "QUEST COMPLETE"… (`detail`: the rewards, or what to do next). */
  quest(head: string, name: string, detail: string, kind: 'start' | 'done' | 'failed' | 'ready'): void {
    const e = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    this.showBanner(`<div class="lu-title qb-title">${e(head)}</div><div class="lu-level">${e(name)}</div>${detail ? `<div class="lu-points">${e(detail)}</div>` : ''}`, `quest-banner qb-${kind}`);
  }

  /** Banners wait their turn (a quest's EXP reward can level the hero up right as the quest completes). */
  private bannerQueue: [string, string][] = [];
  private bannerBusy = false;
  private showBanner(html: string, cls: string): void {
    if (this.bannerBusy) { if (this.bannerQueue.length < 4) this.bannerQueue.push([html, cls]); return; }
    this.bannerBusy = true;
    this.banner.innerHTML = html;
    this.banner.className = `levelup ${cls}`.trim();
    this.banner.hidden = false;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    clearTimeout(this.bannerTimer);
    const hold = this.bannerQueue.length ? 2600 : 3600;
    this.bannerTimer = window.setTimeout(() => {
      this.banner.classList.remove('show');
      window.setTimeout(() => {
        this.banner.hidden = true;
        this.bannerBusy = false;
        const next = this.bannerQueue.shift();
        if (next) this.showBanner(next[0], next[1]);
      }, 600);
    }, hold);
  }

  /** A line in the loot feed (bottom left), gone after a few seconds. */
  loot(text: string): void {
    const el = document.createElement('div');
    el.className = 'loot';
    el.textContent = text;
    this.feed.appendChild(el);
    while (this.feed.children.length > 5) this.feed.firstElementChild!.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  /** Call before tagging this frame's enemies. */
  beginTags(): void { this.seen.clear(); }

  /** Whether an enemy on the map has noticed the hero (? then !), above it. */
  tag(key: object, x: number, y: number, z: number, info: TagInfo): void {
    this.seen.add(key);
    let el = this.tags.get(key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'enemy-tag';
      el.innerHTML = '<span class="aware"></span><span class="lock">▼</span><span class="sts"></span><span class="elems"></span><span class="ehp"><span></span></span>';
      this.root.appendChild(el);
      this.tags.set(key, el);
    }
    const p = this.project(x, y, z);
    el.hidden = !p.on || info.dead;
    if (el.hidden) return;
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
    const aware = el.querySelector<HTMLElement>('.aware')!;
    const icon = info.alert ? (info.alertAge < 1.6 ? '!' : '') : info.awareness >= 0.35 ? '?' : '';
    if (aware.textContent !== icon) aware.textContent = icon;
    aware.className = `aware${info.alert ? ' alert' : ''}`;
    // Battles are turn-based now: no health bar, lock marker, elements or ailments over enemies on the map (left
    // from the action battles); only whether they've noticed the hero.
    for (const c of ['.lock', '.elems', '.sts', '.ehp']) el.querySelector<HTMLElement>(c)!.hidden = true;
  }

  /** Remove markers of enemies that weren't tagged this frame. */
  endTags(): void {
    for (const [k, el] of this.tags) if (!this.seen.has(k)) { el.remove(); this.tags.delete(k); }
  }

  /** The bow's draw meter under the hero (null hides it). */
  meter(x: number, y: number, z: number, value: number | null): void {
    if (value === null) { this.meterEl.hidden = true; return; }
    const p = this.project(x, y, z);
    this.meterEl.hidden = !p.on;
    this.meterEl.style.transform = `translate(${p.x}px, ${p.y}px)`;
    (this.meterEl.firstElementChild as HTMLElement).style.width = `${Math.min(1, value) * 100}%`;
    this.meterEl.classList.toggle('full', value >= 1);
  }

  /** The stealth eye while sneaking: hidden, noticed (someone is suspicious) or detected (someone is alert). */
  /** How hidden the hero is (0 – 1): the dark vignette eases towards it. */
  hidden(amount: number): void { this.shadeWant = amount; }

  stealth(state: 'hidden' | 'noticed' | 'detected' | null): void {
    this.eye.hidden = !state;
    if (!state) return;
    if (this.eye.dataset.state === state) return;
    this.eye.dataset.state = state;
    const lid = state === 'hidden' ? 'M2 9 Q10 13 18 9' : state === 'noticed' ? 'M2 9 Q10 4 18 9 Q10 13 2 9' : 'M2 9 Q10 1 18 9 Q10 17 2 9';
    this.eye.innerHTML = `<svg viewBox="0 0 20 18" aria-hidden="true"><path d="${lid}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>${
      state === 'hidden' ? '' : '<circle cx="10" cy="9" r="2.4" fill="currentColor"/>'}</svg><span>${{ hidden: 'Hidden', noticed: 'Noticed', detected: 'Detected' }[state]}</span>`;
  }

  update(dt: number): void {
    // Into hiding slowly, out of it quickly (being seen shouldn't lag).
    const rate = this.shadeWant > this.shadeNow ? 2.2 : 6;
    this.shadeNow += (this.shadeWant - this.shadeNow) * Math.min(1, dt * rate);
    if (Math.abs(this.shadeNow - this.shadeWant) < 0.002) this.shadeNow = this.shadeWant;
    this.shade.hidden = this.shadeNow < 0.01;
    if (!this.shade.hidden) this.shade.style.setProperty('--hide', this.shadeNow.toFixed(3));
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.el.remove(); this.floats.splice(i, 1); continue; }
      const p = this.project(f.x, f.y + k * 0.7, f.z);
      f.el.hidden = !p.on;
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${k < 0.12 ? 0.7 + k * 3 : 1})`;
      f.el.style.opacity = String(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }
  }

  /** Remove everything (leaving a map). */
  clear(): void {
    for (const f of this.floats) f.el.remove();
    this.floats.length = 0;
    for (const el of this.tags.values()) el.remove();
    this.tags.clear();
    this.meterEl.hidden = true;
  }
}
