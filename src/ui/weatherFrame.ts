/**
 * The elements on a hero's panel: a frame per weather state (Comfortable gold, Wet with drops running down, Cold
 * with frost in the corners, Freezing frosted all round with icicles and a cold pulse, Hot with a heat shimmer,
 * Overheating with rising embers and a hot pulse) and the state's pill. Used by the HUD's party cards, the hero's
 * own gauges and the pause menu's party panels. Styles: `.wf-*` in styles.css.
 */
import type { WeatherState } from '../game/body';
import { WEATHER_STATE_INFO } from '../game/body';

const SNOW = '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v14M2 4.5l12 7M2 11.5l12-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
const ICON: Record<WeatherState, string> = {
  comfortable: '<svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14S2 10 2 6a3 3 0 0 1 6-1 3 3 0 0 1 6 1c0 4-6 8-6 8z" fill="currentColor"/></svg>',
  wet: '<svg width="10" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5C5.5 5 4 7.2 4 9.5a4 4 0 0 0 8 0C12 7.2 10.5 5 8 1.5z" fill="currentColor"/></svg>',
  cold: SNOW,
  freezing: SNOW,
  hot: '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.2" fill="currentColor"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M3 13l1.4-1.4M11.6 4.4L13 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  overheating: '<svg width="10" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0C4 7 6 6 6 3.5 7 4.5 7.5 5.5 8 1z" fill="currentColor"/></svg>',
};

/** The class(es) for a panel showing this state ('' for none). */
export const weatherFrameClass = (st: WeatherState | null | undefined): string => (st ? ` wf wf-${st}` : '');

/** The state's pill (icon and name), or ''. */
export function weatherPill(st: WeatherState | null | undefined): string {
  if (!st) return '';
  const info = WEATHER_STATE_INFO[st];
  return `<span class="wf-pill wf-pill-${st}" title="${info.name}: ${info.does}">${ICON[st]}<span>${info.name}</span></span>`;
}

const frostCorner = (side: 'tl' | 'tr' | 'br' | 'bl', strong: boolean) =>
  `<svg class="wf-frost wf-${side}" viewBox="0 0 46 34" aria-hidden="true"><path d="M2 2h20M2 2v16M2 2l14 12M9 2l3 5M2 9l5 2M16 2l2 6M2 14l7 1" stroke="${strong ? '#ffffff' : '#dff2ff'}" stroke-width="2" stroke-linecap="round" fill="none" opacity="${strong ? 1 : 0.85}"/></svg>`;

/** The moving bits drawn over a panel for a state (drops, frost, icicles, embers, shimmer), or ''. */
export function weatherDecor(st: WeatherState | null | undefined): string {
  switch (st) {
    case 'wet': return '<span class="wf-fx" aria-hidden="true"><i class="wf-drip" style="left:14%"></i><i class="wf-drip" style="left:52%;animation-delay:.9s"></i><i class="wf-drip" style="left:84%;animation-delay:1.6s"></i></span>';
    case 'cold': return `<span class="wf-fx" aria-hidden="true">${frostCorner('tl', false)}${frostCorner('br', false)}</span>`;
    case 'freezing': return `<span class="wf-fx" aria-hidden="true">${frostCorner('tl', true)}${frostCorner('tr', true)}<svg class="wf-icicles" viewBox="0 0 276 12" preserveAspectRatio="none" aria-hidden="true"><path d="M8 0l4 9 4-9M34 0l3 12 3-12M62 0l4 8 4-8M96 0l3 11 3-11M128 0l4 9 4-9M160 0l3 12 3-12M192 0l4 8 4-8M222 0l3 11 3-11M252 0l4 9 4-9" fill="#e6f6ff"/></svg></span>`;
    case 'hot': return '<span class="wf-fx" aria-hidden="true"><i class="wf-shimmer"></i></span>';
    case 'overheating': return '<span class="wf-fx" aria-hidden="true"><i class="wf-ember" style="left:10%"></i><i class="wf-ember" style="left:36%;animation-delay:.6s"></i><i class="wf-ember" style="left:62%;animation-delay:1.1s"></i><i class="wf-ember" style="left:88%;animation-delay:.3s"></i></span>';
    default: return '';
  }
}
