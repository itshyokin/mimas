import './fonts.css';
import './styles.css';
import { Game } from './game/Game';
import { installErrorBar } from './shared/errorBar';

installErrorBar('Game');

function showError(message: string): void {
  const el = document.createElement('div');
  el.className = 'boot-error';
  el.textContent = message;
  document.body.appendChild(el);
}

const canvas = document.getElementById('view') as HTMLCanvasElement | null;
if (new URLSearchParams(location.search).has('gbaplay')) {
  // Mimas: the GBA playtest (the editor's ▶ Playtest on a GBA map).
  canvas?.remove();
  void import('./gbaplay/GbaGame').then((m) => m.startGbaGame()).catch((err: unknown) => showError(`The GBA playtest couldn't start: ${err instanceof Error ? err.message : String(err)}`));
} else if (!canvas) {
  showError('Missing <canvas id="view"> in index.html.');
} else {
  try {
    const game = new Game(canvas, document.body);
    game.start().catch((err: unknown) => showError(`The game couldn't start: ${err instanceof Error ? err.message : String(err)}`));
  } catch {
    showError("This game needs WebGL, which isn't available in this browser. Try a recent Chrome, Edge or Firefox.");
  }
}
