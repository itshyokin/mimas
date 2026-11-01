/**
 * The passage layer: per-cell movement rules on top of what the tiles, props and heights say.
 * One character per cell, stored as rows like the terrain.
 */
export type PassageFlag = '.' | 'c' | 'l' | 'x' | 'o';

export const PASSAGE_FLAGS: { key: Exclude<PassageFlag, '.'>; id: string; name: string; note: string }[] = [
  { key: 'c', id: 'climb', name: 'Climbable', note: 'Cliff walls here can be climbed up and down (ladders, vines, rock faces).' },
  { key: 'l', id: 'crawl', name: 'Low clearance', note: 'Only passable by crawling: gaps under fences, tunnels, vents.' },
  { key: 'x', id: 'wall', name: 'Wall', note: 'Always blocked, whatever is on the tile (invisible walls, map edges).' },
  { key: 'o', id: 'open', name: 'Open', note: 'Always passable, even under a blocking tile or prop (archways, doorways in big props).' },
];

const VALID = new Set(['.', 'c', 'l', 'x', 'o']);

/** Parse passage rows into one flag per cell (missing or unknown cells are "."). */
export function parsePassage(rows: string[] | undefined, w: number, h: number): PassageFlag[] {
  const out: PassageFlag[] = new Array(w * h).fill('.');
  if (!rows) return out;
  for (let z = 0; z < h; z++) {
    const row = rows[z] ?? '';
    for (let x = 0; x < w; x++) {
      const c = row[x];
      if (c && VALID.has(c)) out[z * w + x] = c as PassageFlag;
    }
  }
  return out;
}

/** Rows for saving, or null when every cell is ".". */
export function formatPassage(grid: PassageFlag[], w: number, h: number): string[] | null {
  if (grid.every((c) => c === '.')) return null;
  const rows: string[] = [];
  for (let z = 0; z < h; z++) rows.push(grid.slice(z * w, z * w + w).join(''));
  return rows;
}
