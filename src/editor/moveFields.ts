/**
 * Mimas: Database fields for Pokémon-style moves: a move's animation (hit and burst, with a live preview and its
 * sounds), and an enemy's moves (four at most: Additions or spells), its MP and the moves it learns by level.
 */
import { additionList, spellList } from '../game/abilities';
import { effectFrames, effectSprites, moveEffects, type MoveLook } from '../gba/effects';
import type { Database, EnemyDef, MoveRef, TeamMember } from '../world/types';
import { MAX_MOVES, movesAt } from '../gba/moves';
import { field, h, numberInput, select } from './dom';
import { gba } from './gbaShared';


let previewTimer = 0;

/** "Hit" and "Burst" pickers with a looping preview over a stand-in foe. */
export function effectFields(m: MoveLook, kind: 'addition' | 'spell' | 'heal', rerender: () => void): HTMLElement {
  const fx = effectSprites(gba.data);
  const hits = fx.filter((s) => s.role !== 'burst'), bursts = fx.filter((s) => s.role === 'burst');
  const canvas = h('canvas', { class: 'fx-preview', width: '128', height: '128', 'aria-label': 'Animation preview' }) as HTMLCanvasElement;
  const draw = () => {
    const { hit, burst } = moveEffects(m, kind);
    const seq: HTMLCanvasElement[] = [];
    for (const id of [hit, burst]) {
      const s = id ? fx.find((x) => x.id === id) : undefined, img = s ? gba.images.get(s.image) : undefined;
      if (s && img) seq.push(...effectFrames(img, s, gba.data, id === hit ? m.element ?? 'neutral' : 'neutral'));
    }
    let f = 0;
    clearInterval(previewTimer);
    previewTimer = window.setInterval(() => {
      if (!canvas.isConnected) { clearInterval(previewTimer); return; }
      const g = canvas.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#f8f8f8'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#d8d8e0'; g.beginPath(); g.ellipse(64, 104, 36, 10, 0, 0, Math.PI * 2); g.fill();
      const k = f % (seq.length + 4);
      if (k < seq.length) g.drawImage(seq[k], 0, 0, 128, 128);
      f++;
    }, 100);
  };
  const opts = (list: typeof fx, none: string, auto?: string): [string, string][] => [...(auto ? [['auto', auto] as [string, string]] : []), ['none', none], ...list.map((s) => [s.id, s.name] as [string, string])];
  const hitDefault = kind === 'addition' ? 'fx_slash' : kind === 'heal' ? 'fx_sparkle' : '';
  const box = h('div', { class: 'field-row fx-row' },
    field('Hit animation', select(opts(hits, 'None', hitDefault ? `Default (${hits.find((s) => s.id === hitDefault)?.name ?? hitDefault})` : undefined), m.effect ?? (hitDefault ? 'auto' : 'none'), (v) => { if (v === 'auto' || (!hitDefault && v === 'none')) delete m.effect; else m.effect = v; draw(); }),
      'Takes the move’s element colours. GBA Studio → Sprites → Battle effects has them (repaint them, or add your own).'),
    field('Burst', select(opts(bursts, 'None', 'Its element’s (or its ailment’s)'), m.burst ?? 'auto', (v) => { if (v === 'auto') delete m.burst; else m.burst = v; draw(); }), 'Plays after the hit: fire, ice, poison…'),
    canvas);
  if (!fx.length) box.append(h('p', { class: 'note' }, 'No battle effects in GBA Studio yet.'));
  draw();
  void rerender;
  return box;
}

/** A move's name and what it is, for lists. */
export function moveLabel(db: Database, r: MoveRef): string {
  if (r.addition) return additionList(db).find((a) => a.id === r.addition)?.name ?? r.addition;
  if (r.spell) { const s = spellList(db).find((x) => x.id === r.spell); return s ? `${s.name} (${s.mp} MP)` : r.spell; }
  return '—';
}

const refKey = (r: MoveRef) => (r.addition ? `a:${r.addition}` : r.spell ? `s:${r.spell}` : '');
const fromKey = (k: string): MoveRef | null => (k.startsWith('a:') ? { addition: k.slice(2) } : k.startsWith('s:') ? { spell: k.slice(2) } : null);

/** Four move slots (Additions or spells). Warns when every move is a spell (it needs one for when MP runs out). */
export function movesField(db: Database, get: () => MoveRef[] | undefined, set: (v: MoveRef[] | undefined) => void, rerender: () => void, label = 'Moves'): HTMLElement {
  const list = [...(get() ?? [])];
  const choices: [string, string][] = [['', '(empty)'],
    ...additionList(db).map((a) => [`a:${a.id}`, `Addition: ${a.name} (${a.strikes.length} hit${a.strikes.length === 1 ? '' : 's'})`] as [string, string]),
    ...spellList(db).map((s) => [`s:${s.id}`, `Spell: ${s.name} (${s.mp} MP)`] as [string, string])];
  const slots = Array.from({ length: MAX_MOVES }, (_, k) => select(choices, list[k] ? refKey(list[k]) : '', (v) => {
    const r = fromKey(v);
    const next = [...list];
    if (r) next[k] = r; else next.splice(k, 1);
    const clean = next.filter(Boolean);
    set(clean.length ? clean : undefined);
    rerender();
  }, { 'aria-label': `${label} ${k + 1}` }));
  const allSpells = list.length > 0 && list.every((r) => r.spell);
  return h('div', { class: 'field' }, h('label', {}, label),
    h('div', { class: 'moves-grid' }, ...slots),
    allSpells ? h('p', { class: 'note warn' }, 'Every move is a spell: give it at least one Addition for when its MP runs out (until then it falls back on a plain hit).') : h('span'));
}

/** Database → Enemies → Moves (GBA): its four moves, its MP, and new moves from a level on. */
export function enemyMovesSection(db: Database, d: EnemyDef, rerender: () => void): HTMLElement {
  const sets = d.movesets ?? [];
  const setRows = sets.map((ms, k) => h('div', { class: 'db-section moveset' },
    h('div', { class: 'field-row' },
      field('From level', numberInput(ms.level, (v) => { ms.level = Math.max(1, Math.min(99, Math.round(v))); }, { min: 1, max: 99, step: 1, 'aria-label': `Moveset ${k + 1} level` })),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove moveset ${k + 1}`, onclick: () => { sets.splice(k, 1); if (!sets.length) delete d.movesets; rerender(); } }, '✕')),
    movesField(db, () => ms.moves, (v) => { ms.moves = v ?? []; }, rerender, `Moves from level ${ms.level}`)));
  return h('section', { class: 'db-section' }, h('h3', {}, 'Moves (GBA)'),
    movesField(db, () => d.moves, (v) => { if (v) d.moves = v; else delete d.moves; }, rerender, 'Its moves'),
    h('div', { class: 'field-row' },
      field('Magic (MP)', numberInput(d.mp ?? 0, (v) => { const x = Math.max(0, Math.round(v)); if (x) d.mp = x; else delete d.mp; }, { min: 0, step: 1, 'aria-label': 'Enemy MP' }), 'Its spells cost this. Additions cost nothing.')),
    ...setRows,
    h('button', { type: 'button', class: 'btn', onclick: () => { (d.movesets ??= []).push({ level: Math.max(2, (sets[sets.length - 1]?.level ?? (d.level ?? 1)) + 5), moves: [...(sets[sets.length - 1]?.moves ?? d.moves ?? [])] }); rerender(); } }, '+ New moves from a level'),
    h('p', { class: 'note' }, 'On the GBA (and the GBA playtest) it fights with these moves, picking one each turn. Its moves at a level are the last set at or below that level (it "learns" new ones as it levels); a trainer or a Start battle can give one fight its own moves. With no moves set it uses its plain attack and actions (Turn-based battles, above). An Addition hits with its strikes added up × its damage; a spell with its power, costing MP.'));
}

/**
 * A trainer's (or a Start battle's) foes: each enemy, its level (blank: its own) and, if wanted, moves just for this
 * fight. `changed` is called after every edit with the list (empty entries removed).
 */
export function teamEditor(db: Database, team: TeamMember[], changed: (t: TeamMember[]) => void, max = 6): HTMLElement {
  const enemies = (db.enemies ?? []).map((e) => [e.id, e.name] as [string, string]);
  const wrap = h('div', { class: 'team-edit' });
  const render = () => {
    wrap.replaceChildren(
      ...team.map((m, k) => {
        const def = (db.enemies ?? []).find((e) => e.id === m.enemy);
        const custom = !!m.moves;
        const row = h('div', { class: 'team-row' },
          h('div', { class: 'field-row' },
            select(enemies.length ? enemies : [['', '(add enemies in Database → Enemies)']], m.enemy, (v) => { m.enemy = v; changed(team); render(); }, { 'aria-label': `Foe ${k + 1}` }),
            field('Level', numberInput(m.level ?? def?.level ?? 1, (v) => { const l = Math.max(1, Math.min(99, Math.round(v))); if (l === (def?.level ?? 1) && m.level === undefined) return; m.level = l; changed(team); }, { min: 1, max: 99, step: 1, 'aria-label': `Foe ${k + 1} level` })),
            h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Remove foe ${k + 1}`, onclick: () => { team.splice(k, 1); changed(team); render(); } }, '✕')),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: custom, onchange: (e: Event) => {
            if ((e.target as HTMLInputElement).checked) m.moves = def ? [...movesAt(def, m.level ?? def.level ?? 1)] : []; else delete m.moves;
            changed(team); render();
          } }), ' Its own moves for this fight'),
          custom ? movesField(db, () => m.moves, (v) => { m.moves = v ?? []; changed(team); }, render, 'Moves') : h('p', { class: 'hint' }, def ? `Moves: ${movesAt(def, m.level ?? def.level ?? 1).map((r) => moveLabel(db, r)).join(', ') || 'its plain attack'}` : ''));
        return row;
      }),
      team.length < max && enemies.length ? h('button', { type: 'button', class: 'btn', onclick: () => { team.push({ enemy: team[team.length - 1]?.enemy ?? enemies[0][0] }); changed(team); render(); } }, '+ Add foe') : h('span'));
  };
  render();
  return wrap;
}
