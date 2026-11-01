/**
 * The battle screen's layout (Database → Menus → Battle layout, Update 111): where the Pocket Handheld pieces sit
 * (the foes' blocks, the party's blocks, the command box and the text box), in percent of the screen so it scales.
 * Pieces left at their default keep the built-in placement (which also makes room for long lists).
 */

export type BattlePiece = 'foes' | 'heroes' | 'cmds' | 'text';
export const BATTLE_PIECES: [BattlePiece, string][] = [['foes', 'Foes’ blocks'], ['heroes', 'Party’s blocks'], ['cmds', 'Command box'], ['text', 'Text box']];
/** Left, top, width (and for the boxes, height) in percent of the screen. */
export interface PieceBox { x: number; y: number; w: number; h?: number }
export type BattleLayout = Partial<Record<BattlePiece, PieceBox>>;

/** Roughly where the built-in layout puts them (the editor's starting point). */
export const DEFAULT_BATTLE_BOXES: Record<BattlePiece, PieceBox> = {
  foes: { x: 1.2, y: 2, w: 47 },
  heroes: { x: 51.8, y: 52, w: 47 },
  cmds: { x: 51.8, y: 80, w: 47, h: 18 },
  text: { x: 1.2, y: 80, w: 47, h: 18 },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function cleanBattleLayout(l: BattleLayout | undefined): BattleLayout | undefined {
  if (!l) return undefined;
  const out: BattleLayout = {};
  for (const [k] of BATTLE_PIECES) {
    const b = l[k];
    if (!b) continue;
    const w = clamp(Number(b.w) || 30, 10, 100), h = b.h !== undefined ? clamp(Number(b.h) || 10, 6, 100) : undefined;
    out[k] = { x: clamp(Number(b.x) || 0, 0, 100 - w), y: clamp(Number(b.y) || 0, 0, 100 - (h ?? 4)), w, ...(h !== undefined ? { h } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Inline styles for one piece (an empty string: the built-in placement). */
export function pieceStyle(b: PieceBox | undefined, withHeight: boolean): string {
  if (!b) return '';
  return `left:${b.x}%;top:${b.y}%;width:${b.w}%;right:auto;bottom:auto;transform:none;${withHeight && b.h !== undefined ? `height:${b.h}%;` : ''}`;
}
