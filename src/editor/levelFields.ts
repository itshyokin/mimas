/** A level range for spawns (random battles, zones, troops, map enemies): "from … to …", 0 for each enemy's own. */
import type { LevelRange } from '../world/types';
import { field, h, numberInput } from './dom';

export function levelRangeField(label: string, get: () => LevelRange | undefined, set: (v: LevelRange | undefined) => void, hint = 'Each enemy rolls a level in this range (0: each enemy’s own level, Database → Enemies).'): HTMLElement {
  const cur = get() ?? [0, 0];
  let lo = cur[0], hi = cur[1];
  const save = () => {
    if (!lo && !hi) { set(undefined); return; }
    const a = Math.max(1, lo || hi), b = Math.max(1, hi || lo);
    set([Math.min(a, b), Math.max(a, b)]);
  };
  const box = (v: number, on: (n: number) => void, aria: string) => numberInput(v, (n) => { on(Math.max(0, Math.min(99, Math.round(n)))); save(); }, { step: 1, min: 0, max: 99, 'aria-label': aria, class: 'level-num' });
  return field(label, h('div', { class: 'level-range' }, h('span', { class: 'note' }, 'Lv'), box(lo, (n) => (lo = n), `${label} from`), h('span', { class: 'note' }, 'to'), box(hi, (n) => (hi = n), `${label} to`)), hint);
}
