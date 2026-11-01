/**
 * Database → Credits: your own sections of the game's Credits screen (a heading and names, one per line), in order.
 * Sprite credits are added automatically from the characters imported from the Character Builder.
 */
import { spriteCredits, uniqueAuthors } from '../game/credits';
import type { CharacterDef, CreditEntry, SpriteCredit } from '../world/types';
import { h } from './dom';

export function creditsTab(entries: CreditEntry[], chars: Record<string, CharacterDef>, rerender: () => void, assets: SpriteCredit[][] = []): HTMLElement[] {
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= entries.length) return;
    [entries[i], entries[j]] = [entries[j], entries[i]];
    rerender();
  };
  const row = (e: CreditEntry, i: number) => h('div', { class: 'credit-row' },
    h('div', { class: 'credit-fields' },
      h('input', { type: 'text', value: e.title, placeholder: 'Heading (e.g. Music, Story, Special thanks)', 'aria-label': 'Heading', oninput: (ev: Event) => { e.title = (ev.target as HTMLInputElement).value; } }),
      h('textarea', { rows: '3', placeholder: 'Names, one per line', 'aria-label': 'Names', oninput: (ev: Event) => { e.names = (ev.target as HTMLTextAreaElement).value; } }, e.names)),
    h('div', { class: 'credit-btns' },
      h('button', { type: 'button', class: 'btn small', disabled: i === 0, title: 'Move up', 'aria-label': 'Move up', onclick: () => move(i, -1) }, '↑'),
      h('button', { type: 'button', class: 'btn small', disabled: i === entries.length - 1, title: 'Move down', 'aria-label': 'Move down', onclick: () => move(i, 1) }, '↓'),
      h('button', { type: 'button', class: 'btn small danger', onclick: () => { entries.splice(i, 1); rerender(); } }, 'Remove')));

  const sprites = spriteCredits({ characters: chars } as never, undefined, assets);
  const authors = new Set(uniqueAuthors(sprites));
  const from = Object.values(chars).filter((c) => c.credits?.length).length, art = assets.filter((a) => a.length).length;
  return [
    h('section', { class: 'db-section db-wide' },
      h('h3', {}, 'Credits'),
      h('p', { class: 'note' }, 'Your sections of the Credits screen (title screen → Credits), in this order. Everyone whose sprite art you use is added after them automatically.'),
      ...entries.map(row),
      h('div', { class: 'char-btns' }, h('button', { type: 'button', class: 'btn', onclick: () => { entries.push({ title: '', names: '' }); rerender(); } }, '+ Add a section'))),
    h('section', { class: 'db-section db-wide' },
      h('h3', {}, 'Sprite credits (automatic)'),
      sprites.length
        ? h('p', { class: 'note' }, `${authors.size} artist${authors.size === 1 ? '' : 's'} from ${from} imported character${from === 1 ? '' : 's'}${art ? ` and ${art} LPC librar${art === 1 ? 'y item' : 'y items'}` : ''}: ${[...authors].slice(0, 12).join(', ')}${authors.size > 12 ? ', …' : ''}. The Credits screen lists each part with its licence and link, plus the LPC weapons your items and enemies use.`)
        : h('p', { class: 'note' }, 'None yet. Characters exported from the Character Builder carry their credits; import them under Characters.')),
  ];
}

/** Drop empty sections (database.json keeps only what has content). */
export function cleanCredits(entries: CreditEntry[]): CreditEntry[] | undefined {
  const out = entries.map((e) => ({ title: e.title.trim(), names: e.names.trim() })).filter((e) => e.title || e.names);
  return out.length ? out : undefined;
}
