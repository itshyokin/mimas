/** Tiny DOM helpers for building the editor UI without a framework. */

export type Child = Node | string | number | null | undefined | false;

/**
 * h('button', { class: 'btn', onclick: fn, title: 'Save' }, 'Save')
 * Keys starting with "on" become event listeners; value/checked/disabled/hidden are set as properties.
 */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

let uid = 0;
/** A labelled form row. The control gets an id so the label is clickable. */
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  if (!control.id) control.id = `f${++uid}`;
  return h('div', { class: 'field' },
    h('label', { for: control.id }, label),
    control,
    hint ? h('div', { class: 'hint' }, hint) : null);
}

export function select(options: [string, string][], value: string, onchange: (v: string) => void, attrs: Record<string, unknown> = {}): HTMLSelectElement {
  const s = h('select', { ...attrs, onchange: () => onchange(s.value) },
    ...options.map(([v, label]) => h('option', { value: v }, label)));
  s.value = value;
  return s;
}

export function numberInput(value: number, onchange: (v: number) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const i = h('input', { type: 'number', value: String(value), inputmode: 'decimal', ...attrs, onchange: () => { const v = parseFloat(i.value); if (Number.isFinite(v)) onchange(v); } });
  return i;
}

export function textInput(value: string, onchange: (v: string) => void, attrs: Record<string, unknown> = {}): HTMLInputElement {
  const i = h('input', { type: 'text', value, ...attrs, onchange: () => onchange(i.value) });
  return i;
}

export function checkbox(label: string, checked: boolean, onchange: (v: boolean) => void): HTMLLabelElement {
  const i = h('input', { type: 'checkbox', checked, onchange: () => onchange(i.checked) });
  return h('label', { class: 'check' }, i, h('span', {}, label));
}

/** Copy a canvas (thumbnails are shared images; the DOM needs its own element). */
export function canvasCopy(src: HTMLCanvasElement, cls = 'thumb'): HTMLCanvasElement {
  const c = h('canvas', { class: cls, width: src.width, height: src.height });
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

/* ------------------------------------------------------------ modal */

export interface ModalAction { label: string; primary?: boolean; danger?: boolean; onClick?: () => boolean | void }

/** Opens a modal. An action returning false keeps the modal open. Returns a close function. */
export function openModal(title: string, body: Node, actions: ModalAction[], onDismiss?: () => void, opts: { wide?: boolean; footStart?: Node; cls?: string; /** Esc, ✕ or a click outside: return false to keep it open. */ beforeDismiss?: () => boolean } = {}): () => void {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const dismiss = () => { if (opts.beforeDismiss?.() === false) return; close(); onDismiss?.(); };
  const onKey = (e: KeyboardEvent) => {
    // Only the topmost dialog answers (Esc in a command's settings mustn't close the event window under it too).
    const all = document.querySelectorAll('.overlay');
    if (all[all.length - 1] !== overlay) return;
    if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(actions.find((a) => a.primary)); }
  };
  const run = (a?: ModalAction) => { if (!a) return; if (a.onClick?.() === false) return; close(); };
  const dialog = h('div', { class: `modal${opts.wide ? ' wide' : ''}${opts.cls ? ` ${opts.cls}` : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('header', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: dismiss }, '✕')),
    h('div', { class: 'modal-body' }, body),
    h('footer', { class: 'modal-foot' }, opts.footStart ?? null, ...actions.map((a) =>
      h('button', { type: 'button', class: `btn${a.primary ? ' primary' : ''}${a.danger ? ' danger' : ''}`, onclick: () => run(a) }, a.label))));
  const overlay = h('div', { class: 'overlay', onpointerdown: (e: Event) => { if (e.target === overlay) dismiss(); } }, dialog);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey, true);
  const first = dialog.querySelector<HTMLElement>('.modal-body input, .modal-body textarea, .modal-body select');
  (first ?? dialog.querySelector<HTMLElement>('.btn.primary'))?.focus();
  return close;
}

export function confirmModal(title: string, message: string, confirmLabel: string, onConfirm: () => void, danger = false): void {
  openModal(title, h('p', { class: 'modal-text' }, message), [
    { label: 'Cancel' },
    { label: confirmLabel, primary: !danger, danger, onClick: onConfirm },
  ]);
}

/** Short message at the bottom of the screen. */
export function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, message);
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

/** Inputs where Backspace deletes text (it stays Backspace there). */
const TYPING = /^(text|search|email|url|tel|password|number|date|time|datetime-local|month|week)$/;
const isTyping = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
  return t instanceof HTMLInputElement && TYPING.test(t.type || 'text');
};

/**
 * Backspace works as Esc everywhere except while typing (tablet keyboards often have no Esc): it closes windows and
 * menus, cancels and deselects, just as Esc does.
 */
export function backspaceAsEscape(): void {
  addEventListener('keydown', (e) => {
    if (e.key !== 'Backspace' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const t = e.target instanceof HTMLElement ? e.target : document.body;
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true, composed: true }));
  }, true);
}

/**
 * A tidier Database page: the form is a narrow column, rows of fields wrap into a grid, and each field's long hint
 * folds away behind a small ⓘ beside its label (tap or click it to read).
 */
export function compactForm(root: HTMLElement): HTMLElement {
  root.classList.add('db-compact');
  for (const hint of root.querySelectorAll<HTMLElement>('.field > .hint')) {
    const f = hint.parentElement!, label = f.querySelector(':scope > label');
    if (!label || f.querySelector(':scope > label > .info')) continue;
    const b = h('button', { type: 'button', class: 'info', title: hint.textContent ?? '', 'aria-label': 'About this setting' }, 'i');
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); f.classList.toggle('open'); });
    label.append(b);
  }
  return root;
}

/** On / off settings in a framed list, one under another. */
export function checkList(...boxes: (HTMLElement | null | false | undefined)[]): HTMLElement {
  return h('div', { class: 'db-checks' }, ...boxes.filter((x): x is HTMLElement => !!x));
}
