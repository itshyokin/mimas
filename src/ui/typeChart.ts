/**
 * The Journal's Type Chart: every element attacking (down the side) against every element defending (across the
 * top): green ×2 where it's strong, red ½ where it's resisted, blank where it's even. Then what element stones do.
 */
import { ELEMENT_LIST, TYPED_ELEMENTS, matchups, versus } from '../game/elements';
import { TIER_NAMES, type EssenceRules } from '../game/essence';
import { elementDot, elementPill } from './elementPill';

export function typeChartHtml(r: EssenceRules): string {
  const cols = TYPED_ELEMENTS;
  const head = `<tr><th class="tc-corner"><small>Attack ↓ · Defend →</small></th>${cols.map((d) => `<th>${elementDot(d)}</th>`).join('')}</tr>`;
  const rows = ELEMENT_LIST.map((a) => `<tr><th>${elementPill(a)}</th>${cols.map((d) => {
    const v = versus(a, d);
    return v > 1 ? '<td class="tc-strong">×2</td>' : v < 1 ? '<td class="tc-weak">½</td>' : '<td class="tc-even"></td>';
  }).join('')}</tr>`).join('');
  const lines = TYPED_ELEMENTS.map((e) => {
    const m = matchups(e), weakTo = TYPED_ELEMENTS.filter((x) => versus(x, e) > 1);
    return `<div class="tc-line">${elementPill(e)}<span>strong against ${m.strong.map((x) => elementPill(x)).join(' ') || '—'} · weak to ${weakTo.map((x) => elementPill(x)).join(' ') || '—'}</span></div>`;
  }).join('');
  const tiers = (['fragment', 'shard', 'heart'] as const).map((t) => `<div><dt>${TIER_NAMES[t]}</dt><dd>+${r[t].damage}% damage · weaknesses ×${r[t].weak}</dd></div>`).join('');
  return `<section class="rec-section tc-full"><h3>Matchups</h3><div class="tc-wrap"><table class="type-chart">${head}${rows}</table></div>
    <p class="rec-empty">Green ×2: super effective. Red ½: not very effective. Two elements multiply (a hit can be ×4 or ¼, kept between ×3 and ¼).</p></section>
    <section class="rec-section tc-full"><h3>Each element</h3>${lines}</section>
    <section class="rec-section tc-full"><h3>Element stones</h3><dl class="rec-rows">${tiers}
      <div><dt>Two Shards of one element</dt><dd>weaknesses ×${r.doubleWeak}</dd></div>
      <div><dt>Both slots one element</dt><dd>the second adds ${r.stack}% of its bonus, +${r.pair}% more</dd></div>
      <div><dt>A spell of your own element</dt><dd>+${r.sameType}%</dd></div>
      <div><dt>Fusing</dt><dd>${r.fuseFragments} Fragments → a Shard · ${r.fuseShards} Shards → a Heart Stone</dd></div></dl>
    <p class="rec-empty">Wear stones in the Element slots (Equipment, or Bag → Shards). The Primary slot's element is what basic attacks hit with. With none, a hero is Normal.</p></section>`;
}
