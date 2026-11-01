/**
 * Skills & Magic: one tab per tree (Might, Dexterity, Magic, Vitality…, and the Party tree everyone shares), skills drawn as a constellation
 * with lines to the skills they need, and the selected skill's details. Spend skill points to learn ranks.
 * Arrows move between skills, Q / E (LB / RB) switch trees, Enter / A learns (press again to confirm), Esc back.
 */
import type { Input } from '../game/Input';
import { SKILL_STATS, type Skills, effectText } from '../game/skills';
import { uiSound } from '../audio/sfx';
import type { SkillNode } from '../world/types';
import { esc } from './InventoryScreen';

export interface SkillHost {
  skills(): Skills;
  points(): number;
  level(): number;
  /** Whose tree it is (shown in the title). */
  who?(): string;
  /** Learn one rank: spends the points and applies it. */
  learn(node: SkillNode): void;
  /** An item's name (and rarity colour), for skills that give a spell shard. */
  item?(id: string): { name: string; color: string | null } | undefined;
  /** The trees this hero can learn from (their classes'); unset or null: all of them. */
  trees?(): Set<string> | null;
  /** What a skill teaches ("Teaches the spell Fire II"), if anything. */
  teaches?(node: SkillNode): string | null;
  /** The Party tree (shared by everyone): its ranks, points, the party's level, and learning in it. */
  party?(): { skills: Skills; points: number; level: number; learn(node: SkillNode): void } | null;
  /** LT / RT: the previous / next party member's tree (false: nobody else). */
  otherHero?(d: number): boolean;
}

const CELL = 96;

export class SkillTreeScreen {
  private readonly root = document.createElement('div');
  private open = false;
  private tree = 0;
  private sel = '';
  private confirming = false;
  private onClose: () => void = () => {};

  constructor(parent: HTMLElement, private readonly input: Input, private readonly host: SkillHost) {
    this.root.className = 'inv skills-screen';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Skills');
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) { e.preventDefault(); this.close(); } });
    // Clicked buttons keep focus, which would stop the keyboard reaching the game: let go of it.
    this.root.addEventListener('click', () => (document.activeElement as HTMLElement | null)?.blur?.());
    parent.appendChild(this.root);
  }

  get isOpen(): boolean { return this.open; }

  /** Put away without going back (another pause tab was picked). */
  hide(): void { this.open = false; this.root.hidden = true; }

  show(onClose: () => void): void {
    this.open = true;
    this.onClose = onClose;
    this.confirming = false;
    this.root.hidden = false;
    this.pickDefault();
    this.render();
  }

  close(): void {
    this.open = false;
    this.root.hidden = true;
    uiSound('menuBack');
    this.onClose();
  }

  /** The hero's trees (their classes'), then the Party tree, which everyone has. */
  private get trees() {
    const all = this.host.skills().data.trees, only = this.host.trees?.(), party = this.host.party?.();
    return all.filter((t) => (t.shared ? !!party : !only || only.has(t.id))).sort((a, b) => Number(!!a.shared) - Number(!!b.shared));
  }
  private nodes(): SkillNode[] { const t = this.trees[this.tree]; return t ? this.host.skills().data.nodes.filter((n) => n.tree === t.id) : []; }
  /** Whose ranks and points the open tree uses: the Party tree's, or this hero's own. */
  private ctx(): { skills: Skills; points: number; level: number; learn(node: SkillNode): void; party: boolean } {
    const t = this.trees[this.tree], p = t?.shared ? this.host.party?.() : null;
    if (p) return { ...p, party: true };
    return { skills: this.host.skills(), points: this.host.points(), level: this.host.level(), learn: (n) => this.host.learn(n), party: false };
  }

  /** Select something sensible in the current tree: the first skill that can be learned, else the root. */
  private pickDefault(): void {
    const c = this.ctx(), s = c.skills, list = this.nodes();
    const ok = list.find((n) => s.check(n, c.points, c.level).ok);
    this.sel = (ok ?? [...list].sort((a, b) => a.y - b.y || a.x - b.x)[0])?.id ?? '';
  }

  update(): void {
    if (!this.open) return;
    const i = this.input;
    if (i.consume('cancel')) { if (this.confirming) { this.confirming = false; this.render(); } else this.close(); return; }
    { const d = i.consume('subPrev') ? -1 : i.consume('subNext') ? 1 : 0; if (d && this.host.otherHero?.(d)) { this.confirming = false; this.tree = 0; this.pickDefault(); uiSound('menuMove'); this.render(); return; } }
    if (i.consume('tabPrev')) { this.switchTree(-1); return; }
    if (i.consume('tabNext')) { this.switchTree(1); return; }
    for (const [a, dx, dy] of [['left', -1, 0], ['right', 1, 0], ['up', 0, 1], ['down', 0, -1]] as const) {
      if (i.consume(a)) { this.move(dx, dy); return; }
    }
    if (i.confirm()) this.activate();
  }

  private switchTree(dir: 1 | -1): void {
    const n = this.trees.length;
    if (!n) return;
    this.tree = (this.tree + dir + n) % n;
    this.confirming = false;
    this.pickDefault();
    uiSound('menuMove');
    this.render();
  }

  /** Move the selection to the nearest skill in a direction. */
  private move(dx: number, dy: number): void {
    const list = this.nodes(), cur = list.find((n) => n.id === this.sel);
    if (!cur) { this.pickDefault(); this.render(); return; }
    let best: SkillNode | null = null, bestScore = Infinity;
    for (const n of list) {
      if (n === cur) continue;
      const vx = n.x - cur.x, vy = n.y - cur.y, d = Math.hypot(vx, vy);
      const along = (vx * dx + vy * dy) / d;
      if (along < 0.35) continue;
      const score = d * (2 - along);
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best) { this.sel = best.id; this.confirming = false; uiSound('menuMove'); this.render(); }
  }

  private activate(): void {
    const node = this.nodes().find((n) => n.id === this.sel);
    if (!node) return;
    const x = this.ctx(), c = x.skills.check(node, x.points, x.level);
    if (!c.ok) { uiSound('menuBack'); this.flash(c.why ?? ''); return; }
    if (!this.confirming) { this.confirming = true; uiSound('menuOk'); this.render(); return; }
    this.confirming = false;
    x.learn(node);
    this.render();
  }

  private flash(text: string): void {
    const el = this.root.querySelector<HTMLElement>('.sk-why');
    if (el) { el.textContent = text; el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  }

  private render(): void {
    const cx = this.ctx(), s = cx.skills, trees = this.trees, t = trees[this.tree], list = this.nodes();
    const pts = cx.points, lvl = cx.level;
    const maxX = Math.max(4, ...list.map((n) => n.x)), maxY = Math.max(2, ...list.map((n) => n.y));
    const W = (maxX + 1) * CELL, H = (maxY + 1) * CELL;
    const pos = (n: SkillNode) => [n.x * CELL + CELL / 2, (maxY - n.y) * CELL + CELL / 2];
    const color = t?.color ?? '#e9c46a';
    const lines = list.flatMap((n) => (n.parents ?? []).map((pid) => {
      const p = list.find((m) => m.id === pid);
      if (!p) return '';
      const [x1, y1] = pos(p), [x2, y2] = pos(n), lit = s.rank(p.id) > 0 && s.rank(n.id) > 0;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="sk-line${lit ? ' lit' : ''}"/>`;
    })).join('');
    const dots = list.map((n) => {
      const [x, y] = pos(n), r = s.rank(n.id), max = s.maxRank(n), chk = s.check(n, pts, lvl);
      const state = r >= max ? 'full' : r > 0 ? 'some' : chk.ok ? 'open' : (n.parents ?? []).every((p) => s.rank(p) > 0) ? 'ready' : 'locked';
      const pips = max > 1 ? Array.from({ length: max }, (_, k) => `<circle cx="${x - (max - 1) * 5 + k * 10}" cy="${y + 33}" r="3" class="sk-pip${k < r ? ' on' : ''}"/>`).join('') : '';
      return `<g class="sk-node ${state}${n.id === this.sel ? ' sel' : ''}" data-id="${esc(n.id)}" role="button" aria-label="${esc(n.name)}, ${r} of ${max}">
        <circle cx="${x}" cy="${y}" r="26" class="sk-halo"/><circle cx="${x}" cy="${y}" r="17" class="sk-dot"/>
        <text x="${x}" y="${y - 32}" class="sk-name">${esc(n.name)}</text>${pips}</g>`;
    }).join('');
    const node = list.find((n) => n.id === this.sel);
    let detail = '<p class="menu-note">No skills in this tree yet.</p>';
    if (node) {
      const r = s.rank(node.id), max = s.maxRank(node), chk = s.check(node, pts, lvl);
      const needs = (node.parents ?? []).map((p) => s.node(p)?.name ?? p);
      detail = `<div class="sk-title">${esc(node.name)}</div>
        <div class="sk-rank">Rank ${r} / ${max}${node.cost && node.cost > 1 ? ` · ${node.cost} points per rank` : ''}</div>
        ${cx.party ? '<p class="sk-req">Counts for everyone in the party, and anyone who joins later.</p>' : ''}${node.description ? `<p class="sk-desc">${esc(node.description)}</p>` : ''}
        <ul class="sk-effects">${node.effects.map((e) => `<li>${esc(effectText(e))}${max > 1 && !SKILL_STATS[e.stat]?.flag ? ' per rank' : ''}</li>`).join('')}${
          (() => { const it = node.teaches ? this.host.item?.(node.teaches) : undefined; return it ? `<li>Gives the spell shard <b${it.color ? ` style="color:${it.color}"` : ''}>${esc(it.name)}</b></li>` : ''; })()}${
          (() => { const t = this.host.teaches?.(node); return t ? `<li><b>${esc(t)}</b></li>` : ''; })()}</ul>
        ${needs.length ? `<div class="sk-req">Needs: ${esc(needs.join(', '))}</div>` : ''}${node.level ? `<div class="sk-req">Level ${node.level}+</div>` : ''}
        <div class="sk-why" aria-live="polite">${chk.ok ? '' : esc(chk.why ?? '')}</div>
        ${chk.ok ? `<button type="button" class="menu-item sk-learn${this.confirming ? ' confirm' : ''}"><span class="menu-label">${this.confirming ? `Learn ${esc(node.name)}? Press again to confirm` : `Learn (${node.cost ?? 1} point${(node.cost ?? 1) > 1 ? 's' : ''})`}</span></button>` : ''}`;
    }
    this.root.innerHTML = `<div class="inv-box sk-box" style="--tree:${color}">
      <div class="inv-head"><span class="menu-title">${cx.party ? 'Party · ' : this.host.who ? `${esc(this.host.who())} · ` : ""}Skill Tree</span><span class="sk-points">${cx.party ? 'Shared by the whole party · ' : ''}Level ${lvl} · <b>${pts}</b> ${cx.party ? 'party' : 'skill'} point${pts === 1 ? '' : 's'}</span></div>
      <div class="sk-tabs" role="tablist">${trees.map((tr, k) => `<button type="button" role="tab" class="sk-tab" data-tab="${k}" aria-selected="${k === this.tree}" style="--c:${tr.color ?? '#e9c46a'}">${esc(tr.name)}</button>`).join('')}</div>
      <div class="sk-body">
        <svg class="sk-map" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${lines}${dots}</svg>
        <div class="sk-detail">${detail}</div>
      </div>
      <div class="menu-note">Arrows choose · Space learns · ${this.input.label('tabPrev')} / ${this.input.label('tabNext')}: trees · ${this.input.label('subPrev')} / ${this.input.label('subNext')}: another hero · Esc: back</div></div>`;
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.tree = Number(b.dataset.tab); this.confirming = false; this.pickDefault(); uiSound('menuMove'); this.render(); }));
    this.root.querySelectorAll<SVGGElement>('.sk-node').forEach((g) => g.addEventListener('click', () => {
      const id = g.dataset.id!;
      if (id === this.sel) this.activate(); else { this.sel = id; this.confirming = false; uiSound('menuMove'); this.render(); }
    }));
    this.root.querySelector('.sk-learn')?.addEventListener('click', () => this.activate());
  }
}
