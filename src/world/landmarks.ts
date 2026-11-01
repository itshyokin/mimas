/**
 * Map markers (Database → Map markers): the kinds of marker an event can put on the world map — Quest location,
 * Landmark, Town, Danger… — each with its symbol and colour. Events choose one (Event → Map marker), optionally shown
 * only while a switch is on; an area event's marker also outlines its area. No three.js here.
 */

export type MarkerSymbol = 'star' | 'circle' | 'diamond' | 'square' | 'triangle' | 'exclaim' | 'question' | 'flag' | 'skull' | 'house' | 'cross' | 'heart';
export const MARKER_SYMBOLS: [MarkerSymbol, string][] = [
  ['star', 'Star'], ['circle', 'Circle'], ['diamond', 'Diamond'], ['square', 'Square'], ['triangle', 'Triangle'], ['exclaim', '! mark'],
  ['question', '? mark'], ['flag', 'Flag'], ['skull', 'Skull'], ['house', 'House'], ['cross', 'Cross'], ['heart', 'Heart'],
];

export interface MarkerKind { id: string; name: string; symbol: MarkerSymbol; color: string }

export const DEFAULT_MARKERS: MarkerKind[] = [
  { id: 'quest', name: 'Quest location', symbol: 'star', color: '#ffd23f' },
  { id: 'landmark', name: 'Landmark', symbol: 'circle', color: '#6ab8ff' },
  { id: 'town', name: 'Town', symbol: 'house', color: '#f3ead8' },
  { id: 'danger', name: 'Danger', symbol: 'skull', color: '#ff5a4a' },
];

export const markerKinds = (list: MarkerKind[] | undefined): MarkerKind[] => (list?.length ? list : DEFAULT_MARKERS);

/** An event's marker on the world map. */
export interface EventMarker {
  /** Which kind (Database → Map markers). */
  kind: string;
  /** The tooltip (default: the event's name). */
  label?: string;
  /** Shown only while this switch is on (or, with `whenOff`, off). */
  switch?: string;
  whenOff?: boolean;
}

/** Draw a marker symbol centred on (x, y), `r` pixels across its half. */
export function drawMarker(g: CanvasRenderingContext2D, symbol: MarkerSymbol, x: number, y: number, r: number, color: string): void {
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  g.lineWidth = Math.max(1.5, r * 0.28);
  g.strokeStyle = 'rgba(10, 12, 20, 0.95)';
  g.fillStyle = color;
  const path = new Path2D();
  switch (symbol) {
    case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; i ? path.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : path.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } path.closePath(); break;
    case 'circle': path.arc(0, 0, r * 0.8, 0, Math.PI * 2); break;
    case 'diamond': path.moveTo(0, -r); path.lineTo(r * 0.75, 0); path.lineTo(0, r); path.lineTo(-r * 0.75, 0); path.closePath(); break;
    case 'square': path.rect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44); break;
    case 'triangle': path.moveTo(0, -r); path.lineTo(r * 0.9, r * 0.75); path.lineTo(-r * 0.9, r * 0.75); path.closePath(); break;
    case 'flag': path.rect(-r * 0.6, -r, r * 0.22, r * 2); path.moveTo(-r * 0.38, -r); path.lineTo(r * 0.8, -r * 0.6); path.lineTo(-r * 0.38, -r * 0.15); path.closePath(); break;
    case 'house': path.moveTo(0, -r); path.lineTo(r, -r * 0.1); path.lineTo(r * 0.7, -r * 0.1); path.lineTo(r * 0.7, r * 0.85); path.lineTo(-r * 0.7, r * 0.85); path.lineTo(-r * 0.7, -r * 0.1); path.lineTo(-r, -r * 0.1); path.closePath(); break;
    case 'cross': { const w = r * 0.32; path.rect(-w, -r, w * 2, r * 2); path.rect(-r, -w, r * 2, w * 2); break; }
    case 'heart': path.moveTo(0, r * 0.85); path.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.4); path.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.3, -r * 0.1, 0, r * 0.85); break;
    case 'skull': path.arc(0, -r * 0.15, r * 0.78, 0, Math.PI * 2); path.rect(-r * 0.45, r * 0.4, r * 0.9, r * 0.5); break;
    case 'exclaim': case 'question': path.arc(0, 0, r * 0.9, 0, Math.PI * 2); break;
  }
  g.stroke(path);
  g.fill(path);
  // Glyphs on the round ones; eyes on the skull.
  if (symbol === 'exclaim' || symbol === 'question') {
    g.fillStyle = '#14161f';
    g.font = `900 ${Math.round(r * 1.35)}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(symbol === 'exclaim' ? '!' : '?', 0, r * 0.08);
  }
  if (symbol === 'skull') { g.fillStyle = '#14161f'; g.beginPath(); g.arc(-r * 0.3, -r * 0.15, r * 0.18, 0, Math.PI * 2); g.arc(r * 0.3, -r * 0.15, r * 0.18, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

/** A marker as a picture (for the editor and menus). */
export function markerIcon(symbol: MarkerSymbol, color: string, size = 24): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  drawMarker(c.getContext('2d')!, symbol, size / 2, size / 2, size * 0.38, color);
  return c.toDataURL();
}
