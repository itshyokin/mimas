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

export function pieceCell(p: Piece): [number, number] {
  return [PIECES[p][0], PIECES[p][1]];
}

/**
 * A sample shape for previews (1 = inside), chosen to use every piece:
 * outer corners, all four edges, and all four inner corners.
 */
export const SAMPLE_SHAPE = [
  '..........',
  '.######...',
  '.#######..',
  '.########.',
  '...######.',
  '..#######.',
  '..###..##.',
  '..###..##.',
  '..........',
];
