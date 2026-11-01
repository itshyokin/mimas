/**
 * Into battle: the picture on screen (a snapshot) breaks up into black — it shatters like glass, swirls down a
 * drain, smears away, closes like blinds, rushes into the middle, or flashes out. Drawn on a canvas over the game.
 */
export const TRANSITIONS = ['shatter', 'swirl', 'smudge', 'blinds', 'zoom', 'flash'] as const;
export type TransitionKind = typeof TRANSITIONS[number];
export const TRANSITION_NAMES: Record<TransitionKind, string> = {
  shatter: 'Shatter', swirl: 'Swirl', smudge: 'Smudge', blinds: 'Blinds', zoom: 'Rush in', flash: 'Flash',
};

interface Shard { pts: [number, number][]; cx: number; cy: number; vx: number; vy: number; spin: number; delay: number }

/**
 * Play a transition over `parent` from `snap` to black over `secs`, then call `black` (the overlay stays black until
 * `remove()` is called on the returned handle).
 */
export function playTransition(kind: TransitionKind, snap: HTMLCanvasElement, parent: HTMLElement, secs: number, black: () => void): { remove(): void } {
  const c = document.createElement('canvas');
  c.className = 'battle-transition';
  const W = (c.width = Math.max(1, Math.round(innerWidth))), H = (c.height = Math.max(1, Math.round(innerHeight)));
  parent.append(c);
  const g = c.getContext('2d')!;
  const start = performance.now();
  let raf = 0, finished = false;
  const shards = kind === 'shatter' ? makeShards(W, H) : [];
  const draw = (t: number) => {
    g.save();
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    switch (kind) {
      case 'shatter': shatter(g, snap, W, H, t, shards); break;
      case 'swirl': swirl(g, snap, W, H, t); break;
      case 'smudge': smudge(g, snap, W, H, t); break;
      case 'blinds': blinds(g, snap, W, H, t); break;
      case 'zoom': zoom(g, snap, W, H, t); break;
      case 'flash': flash(g, snap, W, H, t); break;
    }
    g.restore();
  };
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / (secs * 1000));
    draw(t);
    if (t >= 1) { if (!finished) { finished = true; g.fillStyle = '#000'; g.fillRect(0, 0, W, H); black(); } return; }
    raf = requestAnimationFrame(step);
  };
  draw(0);
  raf = requestAnimationFrame(step);
  return { remove: () => { cancelAnimationFrame(raf); c.remove(); } };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** The whole snapshot, darkened by `dark` (0 … 1). */
function picture(g: CanvasRenderingContext2D, snap: HTMLCanvasElement, W: number, H: number, dark = 0): void {
  g.drawImage(snap, 0, 0, W, H);
  if (dark > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, dark)})`; g.fillRect(0, 0, W, H); }
}

function makeShards(W: number, H: number): Shard[] {
  // Points jittered on a grid, each cell split into two triangles; the ones near the impact fly first.
  const cols = 9, rows = 6, pts: [number, number][][] = [];
  for (let j = 0; j <= rows; j++) {
    pts.push([]);
    for (let i = 0; i <= cols; i++) {
      const edge = i === 0 || j === 0 || i === cols || j === rows;
      pts[j].push([(i / cols) * W + (edge ? 0 : (Math.random() - 0.5) * (W / cols) * 0.7), (j / rows) * H + (edge ? 0 : (Math.random() - 0.5) * (H / rows) * 0.7)]);
    }
  }
  const out: Shard[] = [];
  const ix = W * (0.4 + Math.random() * 0.2), iy = H * (0.4 + Math.random() * 0.2);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = pts[j][i], b = pts[j][i + 1], cc = pts[j + 1][i + 1], d = pts[j + 1][i];
    for (const tri of (Math.random() < 0.5 ? [[a, b, cc], [a, cc, d]] : [[a, b, d], [b, cc, d]]) as [number, number][][]) {
      const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const dx = cx - ix, dy = cy - iy, dist = Math.hypot(dx, dy) / Math.hypot(W, H);
      out.push({ pts: tri, cx, cy, vx: (dx / (dist * Math.hypot(W, H) + 1)) * W * (0.25 + Math.random() * 0.3), vy: -H * (0.1 + Math.random() * 0.25), spin: (Math.random() - 0.5) * 6, delay: 0.12 + dist * 0.45 + Math.random() * 0.05 });
    }
  }
  return out;
}

/** Cracks spread from the middle, then the pieces fall away into black. */
function shatter(g: CanvasRenderingContext2D, snap: HTMLCanvasElement, W: number, H: number, t: number, shards: Shard[]): void {
  for (const s of shards) {
    const k = Math.max(0, (t - s.delay) / (1 - s.delay));
    if (k >= 1) continue;
    const fall = k * k;
    g.save();
    g.translate(s.cx + s.vx * k, s.cy + s.vy * k + H * 1.4 * fall);
    g.rotate(s.spin * k);
    g.scale(1 - k * 0.3, 1 - k * 0.3);
    g.translate(-s.cx, -s.cy);
    g.beginPath();
    g.moveTo(s.pts[0][0], s.pts[0][1]); g.lineTo(s.pts[1][0], s.pts[1][1]); g.lineTo(s.pts[2][0], s.pts[2][1]); g.closePath();
    g.clip();
    picture(g, snap, W, H, k * 0.6);
    // A bright edge on each piece.
    g.strokeStyle = `rgba(255,255,255,${0.55 * (1 - k)})`;
    g.lineWidth = 2;
    g.stroke();
    g.restore();
  }
}

/** The picture twists round and down into the middle. */
function swirl(g: CanvasRenderingContext2D, snap: HTMLCanvasElement, W: number, H: number, t: number): void {
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy), rings = 26, e = ease(t);
  const shrink = 1 - e * 0.95;
  for (let i = rings; i >= 1; i--) {
    const r0 = (R * (i - 1)) / rings, r1 = (R * i) / rings;
    // Inner rings turn further, and everything turns faster as it goes.
    const angle = e * e * 9 * (1.15 - i / rings);
    g.save();
    g.beginPath();
    g.arc(cx, cy, r1 * shrink + 0.5, 0, Math.PI * 2);
    g.arc(cx, cy, Math.max(0, r0 * shrink - 0.5), 0, Math.PI * 2, true);
    g.clip();
    g.translate(cx, cy); g.rotate(angle); g.scale(shrink, shrink); g.translate(-cx, -cy);
    picture(g, snap, W, H, e * 0.85);
    g.restore();
  }
}

/** The picture smears sideways and blurs as it darkens. */
function smudge(g: CanvasRenderingContext2D, snap: HTMLCanvasElement, W: number, H: number, t: number): void {
  const e = ease(t);
  const blur = 'filter' in g;
  if (blur) g.filter = `blur(${Math.round(e * 14)}px)`;
  const copies = 7;
  for (let k = 0; k < copies; k++) {
    const off = (k - (copies - 1) / 2) * e * W * 0.09, wob = Math.sin(k * 1.7 + t * 6) * e * H * 0.02;
    g.globalAlpha = k === (copies - 1) / 2 ? 1 : 0.35 * (1 - e * 0.5);
    g.drawImage(snap, off, wob, W * (1 + e * 0.15), H);
  }
  g.globalAlpha = 1;
  if (blur) g.filter = 'none';
  g.fillStyle = `rgba(0,0,0,${Math.min(1, e * 1.15)})`;
  g.fillRect(0, 0, W, H);
}

/** Black bars slide in from either side until they meet. */
function blinds(g: CanvasRenderingContext2D, snap: HTMLCanvasElement, W: number, H: number, t: number): void {
  picture(g, snap, W, H, t * 0.3);
  const bars = 10, bh = H / bars;
  g.fillStyle = '#000';
  for (let i = 0; i < bars; i++) {
    const k = Math.min(1, Math.max(0, (t - i * 0.035) / 0.65)), w = ease(k) * W;
    if (i % 2) g.fillRect(W - w, i * bh, w + 1, bh + 1); else g.fillRect(0, i * bh, w + 1, bh + 1);
  }
}

/** Everything rushes into the middle in streaks. */
function zoom(g: CanvasRenderingContext2D, snap: HTMLCanvasElement, W: number, H: number, t: number): void {
  const e = ease(t), cx = W / 2, cy = H / 2;
  picture(g, snap, W, H);
  for (let k = 1; k <= 6; k++) {
    const s = 1 + e * 0.35 * k;
    g.globalAlpha = 0.22;
    g.drawImage(snap, cx - (W * s) / 2, cy - (H * s) / 2, W * s, H * s);
  }
  g.globalAlpha = 1;
  const grad = g.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, cy));
  grad.addColorStop(0, `rgba(0,0,0,${Math.min(1, e * 1.2)})`);
  grad.addColorStop(Math.max(0.01, 1 - e), `rgba(0,0,0,${Math.min(1, e * 1.4)})`);
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
}

/** A bright flash or two, then black. */
function flash(g: CanvasRenderingContext2D, snap: HTMLCanvasElement, W: number, H: number, t: number): void {
  picture(g, snap, W, H, t > 0.55 ? (t - 0.55) / 0.45 : 0);
  const pulse = Math.max(0, Math.sin(t * Math.PI * 3)) * (1 - t);
  g.fillStyle = `rgba(255,255,255,${pulse * 0.9})`;
  g.fillRect(0, 0, W, H);
}
