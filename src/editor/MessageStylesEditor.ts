/**
 * Database → Text boxes: ready-made looks for messages. The built-in six (Speech, Sign, Narration, Item received,
 * Gold received, System) are used automatically; add your own (a villain's red box, a ghost's see-through text…)
 * and pick them in Show text → Style. Change a style here and every message using it follows.
 */
import { field, h, select, textInput } from './dom';
import { lookFields } from './CommandEditor';
import { BUILTIN_STYLE_IDS, DEFAULT_MESSAGE_STYLES, applyLook, parseRich, richHTML, setTextColors, type MessageStyle, type TextColor } from '../ui/richText';

const isBuiltin = (id: string) => (BUILTIN_STYLE_IDS as readonly string[]).includes(id);

export function messageStylesTab(list: MessageStyle[], colors: TextColor[], state: { sel: number }, rerender: () => void): HTMLElement[] {
  state.sel = Math.max(0, Math.min(state.sel, list.length - 1));
  const add = () => {
    let id = 'style', k = 2;
    while (list.some((x) => x.id === id)) id = `style_${k++}`;
    list.push({ id, name: 'New style', box: 'auto', look: { color: '#fff6dc', bubble: '#2a1530' } });
    state.sel = list.length - 1;
    rerender();
  };
  const side = h('div', { class: 'item-list', role: 'listbox', 'aria-label': 'Text box styles' },
    ...list.map((x, i) => h('button', { type: 'button', class: 'item-row', role: 'option', 'aria-selected': String(i === state.sel), onclick: () => { state.sel = i; rerender(); } },
      h('span', { class: 'style-swatch', style: `background:${x.look?.transparent ? 'transparent' : x.look?.bubble ?? '#0e1222'};color:${x.look?.color ?? '#f3ead8'}` }, 'Aa'),
      h('span', {}, x.name, h('small', { class: 'item-sub' }, isBuiltin(x.id) ? 'built in' : x.id)))),
    h('button', { type: 'button', class: 'btn item-add', onclick: add }, '+ New style'));
  const d = list[state.sel];
  const form = h('div', { class: 'item-form' });
  if (d) {
    const sample = h('textarea', { rows: 2 }) as HTMLTextAreaElement;
    sample.value = d.id === 'item' ? 'Received [item]Potion[/item]!' : d.id === 'gold' ? 'Received 120 gold!' : d.id === 'sign' ? 'North: [place]Ashford[/place]\nEast: the Monolith' : 'Hello there! I am [name]Mira[/name].';
    const preview = h('div', { class: 'msg cmd-msg-preview' }, h('div', { class: 'msg-box' }, h('div', { class: 'msg-text' })));
    const draw = () => {
      setTextColors(colors);
      const t = preview.querySelector('.msg-text') as HTMLElement;
      t.innerHTML = richHTML(parseRich(sample.value || '…'));
      applyLook(preview, d.look, t);
    };
    sample.addEventListener('input', draw);
    form.append(
      h('div', { class: 'field-row' },
        field('Name', textInput(d.name, (v) => { d.name = v.trim() || d.name; rerender(); })),
        isBuiltin(d.id) ? field('Id', h('code', {}, d.id)) : field('Id', textInput(d.id, (v) => { const id = v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_'); if (id && !list.some((o) => o !== d && o.id === id)) d.id = id; rerender(); }))),
      field('Box', select([['auto', 'Automatic (a tail for characters)'], ['speech', 'Speech bubble (with a tail)'], ['plain', 'Plain box (no tail)']], d.box ?? 'auto', (v) => (d.box = v as MessageStyle['box']))),
      preview, field('Preview text', sample),
      ...lookFields(d, draw, 'Its own look (off: the game window’s usual look)'),
      h('p', { class: 'note' }, isBuiltin(d.id) ? ({
        speech: 'Used for people talking, when a Show text command is on Automatic.',
        sign: 'Used for signs, chests and other objects, when a Show text command is on Automatic.',
        narration: 'Used when nobody is speaking (no event, no speaker), when a Show text command is on Automatic.',
        item: '“Received Potion!” after the Give item command.',
        gold: '“Received 120 gold!” after the Gold command.',
        system: 'Learned a spell, changed class, no room in the bag…',
      } as Record<string, string>)[d.id] : 'Pick it in Show text → Style.'),
      isBuiltin(d.id)
        ? h('button', { type: 'button', class: 'btn ghost', onclick: () => { const def = DEFAULT_MESSAGE_STYLES.find((x) => x.id === d.id)!; list[state.sel] = structuredClone(def); rerender(); } }, 'Back to the built-in look')
        : h('div', { class: 'item-foot' }, h('button', { type: 'button', class: 'btn danger', onclick: () => { list.splice(state.sel, 1); state.sel = Math.max(0, state.sel - 1); rerender(); } }, 'Delete style')));
    queueMicrotask(draw);
  }
  return [h('div', { class: 'items-layout' }, side, form)];
}
