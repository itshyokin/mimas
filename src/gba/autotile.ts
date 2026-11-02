/** Picking the right piece of a 13-piece set for each cell of a shape. */
import { PIECES, type Piece } from './types';

/** `inside(x, y)` says whether a cell is part of the shape (path, water, plateau). */
export function pieceAt(inside: (x: number, y: number) => boolean, x: number, y: number): Piece | null {
  if (!inside(x, y)) return null;
  const n = inside(x, y - 1), s = inside(x, y + 1), w = inside(x - 1, y), e = inside(x + 1, y);
  if (!n && !w) return 'tl';
  if (!n && !e) return 'tr';
  if (!s && !w) return 'bl';
  if (!s && !e) return 'br';
  if (!n) return 't';
  if (!s) return 'b';
  if (!w) return 'l';
  if (!e) return 'r';
  // Surrounded on all four sides: an inner corner where only a diagonal is missing.
  if (!inside(x - 1, y - 1)) return 'itl';
  if (!inside(x + 1, y - 1)) return 'itr';
  if (!inside(x - 1, y + 1)) return 'ibl';
  if (!inside(x + 1, y + 1)) return 'ibr';
  return 'c';
}

/**
 * What each 8×8 quarter (TL, TR, BL, BR) of a piece normally shows, named by the piece
 * that shows it. A cell whose real neighbours don't match borrows that quarter from
 * the right piece instead, so one-tile-wide strips, ends, T's and crossings work
 * with just the 13 pieces (the RPG Maker trick).
 */
const CANON: Record<Piece, [Piece, Piece, Piece, Piece]> = {
  tl: ['tl', 't', 'l', 'c'], t: ['t', 't', 'c', 'c'], tr: ['t', 'tr', 'c', 'r'],
  l: ['l', 'c', 'l', 'c'], c: ['c', 'c', 'c', 'c'], r: ['c', 'r', 'c', 'r'],
  bl: ['l', 'c', 'bl', 'b'], b: ['c', 'c', 'b', 'b'], br: ['c', 'r', 'b', 'br'],
  itl: ['itl', 'c', 'c', 'c'], itr: ['c', 'itr', 'c', 'c'], ibl: ['c', 'c', 'ibl', 'c'], ibr: ['c', 'c', 'c', 'ibr'],
};

/** For each quarter TL, TR, BL, BR: the piece whose same quarter is drawn there. */
export function quarters(inside: (x: number, y: number) => boolean, x: number, y: number): [Piece, Piece, Piece, Piece] | null {
  const full = pieceAt(inside, x, y);
  if (!full) return null;
  const n = inside(x, y - 1), s = inside(x, y + 1), w = inside(x - 1, y), e = inside(x + 1, y);
  const q = (v: boolean, h: boolean, d: boolean, corner: Piece, vEdge: Piece, hEdge: Piece, inner: Piece): Piece =>
    !v && !h ? corner : !v ? vEdge : !h ? hEdge : !d ? inner : 'c';
  const want: [Piece, Piece, Piece, Piece] = [
    q(n, w, inside(x - 1, y - 1), 'tl', 't', 'l', 'itl'),
    q(n, e, inside(x + 1, y - 1), 'tr', 't', 'r', 'itr'),
    q(s, w, inside(x - 1, y + 1), 'bl', 'b', 'l', 'ibl'),
    q(s, e, inside(x + 1, y + 1), 'br', 'b', 'r', 'ibr'),
  ];
  const canon = CANON[full];
  return want.map((p, i) => (p === canon[i] ? full : p)) as [Piece, Piece, Piece, Piece];
}

export function pieceCell(p: Piece): [number, number] {
  return [PIECES[p][0], PIECES[p][1]];
}

/**
 * A sample shape for previews (1 = inside), chosen to use every piece:
 * outer corners, all four edges, and all four inner corners.
 */
export const SAMPLE_SHAPE = [
  '............',
  '.######.....',
  '.#######..#.',
  '.########.#.',
  '...######.#.',
  '..##########',
  '..###..##...',
  '..###..##.#.',
  '............',
];

/** Draw one cell of an autotile from its four quarters. `put(cx, cy, qx, qy)` copies an 8×8 quarter. */
export function drawQuarters(qs: [Piece, Piece, Piece, Piece], put: (cx: number, cy: number, qx: number, qy: number) => void): void {
  qs.forEach((p, i) => { const [cx, cy] = pieceCell(p); put(cx, cy, i & 1, i >> 1); });
}
