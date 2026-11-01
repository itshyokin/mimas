/**
 * The developer console (` key, or a three-finger tap on touch screens): the game freezes and commands can be typed,
 * Halo-Sapien style. Tab completes (commands, then names), ↑ ↓ go through earlier commands, Esc or ` closes.
 * `help` lists everything. The game supplies the commands.
 */
import { esc } from './InventoryScreen';

export interface ConsoleCommand {
  name: string;
  /** What the arguments are, e.g. "<item> [count]". */
  args?: string;
  help: string;
  /** Names to complete argument `index` with (items, enemies, maps…). */
  complete?(index: number): string[];
  /** Run it; the answer is printed (an Error's message in red). */
  run(args: string[]): string | void;
}

const HISTORY_KEY = 'hd2d.console.history';

export class DevConsole {
  private readonly root = document.createElement('div');
  private readonly out = document.createElement('div');
  private readonly field = document.createElement('input');
  private readonly hint = document.createElement('div');
  private open = false;
  private history: string[] = [];
  private hpos = -1;
  /** Turned off (a release build without the console): ` does nothing. */
  enabled = true;
  onToggle: (open: boolean) => void = () => {};

  constructor(parent: HTMLElement, private readonly commands: () => ConsoleCommand[]) {
    this.root.className = 'dev-console';
    this.root.hidden = true;
    this.out.className = 'dc-out';
    this.field.className = 'dc-in';
    this.field.type = 'text';
    this.field.spellcheck = false;
    this.field.autocomplete = 'off';
    this.field.setAttribute('autocapitalize', 'off');
    this.field.setAttribute('aria-label', 'Console command');
    this.field.placeholder = 'Type a command (help lists them; Tab completes)';
    this.hint.className = 'dc-hint';
    const line = document.createElement('div');
    line.className = 'dc-line';
    line.append(Object.assign(document.createElement('span'), { className: 'dc-prompt', textContent: '>' }), this.field);
    this.root.append(this.out, this.hint, line);
    parent.appendChild(this.root);
    try { this.history = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as string[]; } catch { this.history = []; }
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Backquote' || !this.enabled) return;
      const t = e.target as HTMLElement | null;
      if (!this.open && t && t !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault(); e.stopPropagation();
      this.toggle();
    }, true);
    this.field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Backquote' || e.key === 'Escape') { e.preventDefault(); this.toggle(false); return; }
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); return; }
      if (e.key === 'Tab') { e.preventDefault(); this.complete(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (!this.history.length) return;
        this.hpos = e.key === 'ArrowUp' ? Math.min(this.history.length - 1, this.hpos + 1) : Math.max(-1, this.hpos - 1);
        this.field.value = this.hpos < 0 ? '' : this.history[this.history.length - 1 - this.hpos];
        this.suggest();
      }
    });
    this.field.addEventListener('keyup', (e) => e.stopPropagation());
    this.field.addEventListener('input', () => this.suggest());
  }

  get isOpen(): boolean { return this.open; }

  toggle(on = !this.open): void {
    if (on === this.open) return;
    this.open = on;
    this.root.hidden = !on;
    if (on) { this.hpos = -1; this.field.value = ''; this.suggest(); window.setTimeout(() => this.field.focus(), 0); if (!this.out.childElementCount) this.print('Developer console. Type help for the commands; ` or Esc closes.', 'info'); }
    else this.field.blur();
    this.onToggle(on);
  }

  print(text: string, kind: 'info' | 'ok' | 'err' | 'cmd' = 'ok'): void {
    for (const line of text.split('\n')) {
      const p = document.createElement('div');
      p.className = `dc-${kind}`;
      p.textContent = line;
      this.out.appendChild(p);
    }
    while (this.out.childElementCount > 300) this.out.firstElementChild?.remove();
    this.out.scrollTop = this.out.scrollHeight;
  }

  /** Run a command line (also used by the "Run console command" event command). */
  exec(line: string, echo = true): string {
    const parts = split(line);
    if (!parts.length) return '';
    if (echo) this.print(`> ${line}`, 'cmd');
    const name = parts[0].toLowerCase(), cmd = this.commands().find((c) => c.name === name);
    if (name === 'help') {
      const list = this.commands().sort((a, b) => a.name.localeCompare(b.name));
      const want = parts[1]?.toLowerCase();
      const shown = want ? list.filter((c) => c.name.includes(want)) : list;
      const text = shown.map((c) => `${c.name}${c.args ? ` ${c.args}` : ''} — ${c.help}`).join('\n') || 'No such command.';
      if (echo) this.print(text, 'info');
      return text;
    }
    if (name === 'clear') { this.out.replaceChildren(); return ''; }
    if (!cmd) { const msg = `Unknown command “${parts[0]}”. Type help.`; if (echo) this.print(msg, 'err'); return msg; }
    try {
      const r = cmd.run(parts.slice(1)) ?? 'Done.';
      if (echo) this.print(r, 'ok');
      return r;
    } catch (e) {
      const msg = (e as Error).message;
      if (echo) this.print(msg, 'err');
      return msg;
    }
  }

  private submit(): void {
    const line = this.field.value.trim();
    this.field.value = '';
    this.hpos = -1;
    if (!line) return;
    if (this.history[this.history.length - 1] !== line) { this.history.push(line); if (this.history.length > 60) this.history.shift(); try { localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history)); } catch { /* ignore */ } }
    this.exec(line);
    this.suggest();
  }

  /** Candidates for the word being typed. */
  private candidates(): { parts: string[]; list: string[] } {
    const v = this.field.value, parts = split(v);
    if (/\s$/.test(v) || !parts.length) parts.push('');
    const word = parts[parts.length - 1].toLowerCase();
    let pool: string[];
    if (parts.length === 1) pool = ['help', 'clear', ...this.commands().map((c) => c.name)];
    else pool = this.commands().find((c) => c.name === parts[0].toLowerCase())?.complete?.(parts.length - 2) ?? [];
    return { parts, list: pool.filter((p) => p.toLowerCase().startsWith(word)).sort() };
  }

  private complete(): void {
    const { parts, list } = this.candidates();
    if (!list.length) return;
    const word = parts[parts.length - 1];
    // Fill in as much as all the candidates share; one left: the whole of it and a space.
    let common = list[0];
    for (const c of list) while (!c.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
    const done = list.length === 1;
    parts[parts.length - 1] = done ? list[0] : common.length > word.length ? common : word;
    this.field.value = parts.map(quote).join(' ') + (done ? ' ' : '');
    this.suggest();
  }

  private suggest(): void {
    const { parts, list } = this.candidates();
    const cmd = this.commands().find((c) => c.name === parts[0]?.toLowerCase());
    const usage = cmd && parts.length > 1 ? `${cmd.name}${cmd.args ? ` ${cmd.args}` : ''} — ${cmd.help}` : '';
    const opts = list.slice(0, 14).map((s) => `<span>${esc(s)}</span>`).join('') + (list.length > 14 ? `<span>…${list.length - 14} more</span>` : '');
    this.hint.innerHTML = `${usage ? `<div class="dc-usage">${esc(usage)}</div>` : ''}${this.field.value || parts.length > 1 ? `<div class="dc-opts">${opts}</div>` : ''}`;
  }
}

/** Split a command line into words ("quoted words" stay together). */
function split(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(/"([^"]*)"|(\S+)/g)) out.push(m[1] ?? m[2]);
  return out;
}
const quote = (w: string) => (/\s/.test(w) ? `"${w}"` : w);
