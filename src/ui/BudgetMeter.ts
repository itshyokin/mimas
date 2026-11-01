/** Green-to-red light budget bar with an optional FPS readout. Used by the editor and the game. */
import { LIGHT_CAPACITY, type LightCounts, budgetLevel, describeCounts, lightCost } from '../shared/lightBudget';

export class BudgetMeter {
  readonly el: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLSpanElement;
  private readonly fps: HTMLSpanElement | null;

  constructor(showFps: boolean) {
    this.el = document.createElement('div');
    this.el.className = 'budget';
    this.el.innerHTML = '<span class="budget-label">Lights</span><div class="budget-bar" role="meter" aria-label="Light budget" aria-valuemin="0" aria-valuemax="100"><div class="budget-fill"></div></div>'
      + (showFps ? '<span class="budget-fps">— fps</span>' : '');
    this.fill = this.el.querySelector('.budget-fill')!;
    this.label = this.el.querySelector('.budget-label')!;
    this.fps = this.el.querySelector('.budget-fps');
  }

  setCounts(c: LightCounts): void {
    const load = lightCost(c) / LIGHT_CAPACITY;
    const pct = Math.round(load * 100);
    const level = budgetLevel(load);
    this.fill.style.width = `${Math.min(100, pct)}%`;
    this.el.dataset.level = level;
    this.el.querySelector('.budget-bar')!.setAttribute('aria-valuenow', String(Math.min(100, pct)));
    const advice = level === 'ok' ? 'Comfortable on most devices.' : level === 'busy' ? 'Getting busy: phones may slow down.' : 'Over the suggested budget: expect slowdowns on phones.';
    this.el.title = `Light budget ${pct}% · ${describeCounts(c)}\n${advice}\nShadow-casting point lights cost the most; area lights are almost free.`;
    this.label.textContent = `Lights ${pct}%`;
  }

  setFps(fps: number): void {
    if (this.fps) this.fps.textContent = `${Math.round(fps)} fps`;
  }
}
