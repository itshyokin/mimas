/**
 * Database → Text & dialog (Mimas): every built-in line the GBA game says and its command words (src/gba/text.ts).
 * Each shows its default greyed; typing replaces it, Reset brings the default back. A line can have several
 * versions (one is picked at random each time). Fill-ins: {name}, {foe}, {target}, {move}, {item}, {n}, {level}.
 */
import { h } from './dom';
import { TEXT_GROUPS, TEXT_LINES, fillLine, type TextLine } from '../gba/text';

/** The longest line the ROM's text box takes (it wraps and pages it). */
const MAX_LEN = 150;

/** Sample fill-ins for the preview under a line. */
const SAMPLE = { name: 'Jordan', foe: 'Green Slime', target: 'Green Slime', move: 'Quick Strike', item: 'Potion', class: 'Titan', n: 12, level: 5 };

export function gbaTextTab(text: Record<string, string[]>, state: { q: string }, render: () => void): HTMLElement[] {
  const search = h('input', { type: 'text', class: 'gtext-search', placeholder: 'Find a line…', value: state.q, 'aria-label': 'Find a line',
    oninput: () => { state.q = search.value; filter(); } });
  const intro = h('p', { class: 'note' },
    'Everything the GBA game says, in the playtest and the ROM. Greyed words are the built-in line: type over it to change it, ',
    'and Reset puts it back. Add versions and one is picked at random each time. Fill-ins: ',
    h('code', {}, '{name}'), ' the hero, ', h('code', {}, '{foe}'), ' the enemy, ', h('code', {}, '{target}'), ' who it happens to, ',
    h('code', {}, '{move}'), ', ', h('code', {}, '{item}'), ', ', h('code', {}, '{class}'), ', ', h('code', {}, '{n}'), ' a number, ', h('code', {}, '{level}'), '. ',
    '“A {foe}” turns into “An” before a vowel.');

  const rowOf = (l: TextLine): HTMLElement => {
    const own = text[l.key];
    const versions = h('div', { class: 'gtext-versions' });
    const preview = h('div', { class: 'gtext-preview note' });
    const showPreview = () => {
      const list = (text[l.key] ?? []).filter((s) => s.trim());
      preview.textContent = l.word ? '' : `→ ${fillLine((list.length ? list : l.def)[0], SAMPLE)}${list.length > 1 ? `  (+${list.length - 1} more)` : ''}`;
    };
    const input = (value: string, i: number) => {
      const inp = h('input', { type: 'text', class: `gtext-input${l.word ? ' word' : ''}`, value, maxlength: String(l.word ? 12 : MAX_LEN),
        placeholder: l.def[Math.min(i, l.def.length - 1)], 'aria-label': `${l.label}${i ? ` (version ${i + 1})` : ''}`,
        oninput: () => {
          const list = [...(text[l.key] ?? [])];
          list[i] = l.word ? inp.value.toUpperCase() : inp.value;
          if (l.word && inp.value !== list[i]) { const at = inp.selectionStart; inp.value = list[i]; inp.setSelectionRange(at, at); }
          if (list.every((s) => !s.trim())) delete text[l.key]; else text[l.key] = list;
          row.classList.toggle('changed', !!text[l.key]);
          reset.disabled = !text[l.key];
          showPreview();
        } });
      if (i === 0 || l.word) return inp;
      return h('span', { class: 'gtext-more' }, inp, h('button', { type: 'button', class: 'btn ghost small', title: 'Remove this version', 'aria-label': 'Remove this version',
        onclick: () => { const list = [...(text[l.key] ?? [])]; list.splice(i, 1); if (list.every((s) => !s.trim())) delete text[l.key]; else text[l.key] = list; render(); } }, '×'));
    };
    const list = own?.length ? own : [''];
    versions.append(...list.map((v, i) => input(v, i)));
    const reset = h('button', { type: 'button', class: 'btn ghost small', title: `Back to “${l.def[0]}”`, disabled: !own,
      onclick: () => { delete text[l.key]; render(); } }, 'Reset');
    const tools = h('div', { class: 'gtext-tools' },
      l.word ? null : h('button', { type: 'button', class: 'btn ghost small', title: 'Another version (picked at random)',
        onclick: () => { text[l.key] = [...(text[l.key]?.length ? text[l.key] : [...l.def]), '']; render(); } }, '+ Version'), reset);
    const row = h('div', { class: `gtext-row${own ? ' changed' : ''}`, 'data-find': `${l.label} ${l.def.join(' ')} ${(own ?? []).join(' ')}`.toLowerCase() },
      h('div', { class: 'gtext-label' }, l.label, l.playtestOnly ? h('span', { class: 'note' }, ' (playtest only)') : null),
      h('div', { class: 'gtext-body' }, versions, preview), tools);
    showPreview();
    return row;
  };

  const sections = TEXT_GROUPS.map((g) => h('section', { class: 'db-section gtext-group' }, h('h3', {}, g), ...TEXT_LINES.filter((l) => l.group === g).map(rowOf)));
  const filter = () => {
    const q = state.q.trim().toLowerCase();
    for (const s of sections) {
      let any = false;
      for (const r of s.querySelectorAll<HTMLElement>('.gtext-row')) { const on = !q || r.dataset.find!.includes(q); r.hidden = !on; any ||= on; }
      s.hidden = !any;
    }
  };
  filter();
  return [h('section', { class: 'db-section gtext-intro' }, intro, search), ...sections];
}
