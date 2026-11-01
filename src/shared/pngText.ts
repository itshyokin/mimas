/**
 * Text stored inside a PNG (tEXt and uncompressed iTXt chunks). The Character Builder writes the sheet's
 * animations and credits into an iTXt chunk named "hd2d-character".
 */
export async function readPngText(blob: Blob, keyword: string): Promise<string | null> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buf.length < 8 || sig.some((b, i) => buf[i] !== b)) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const latin1 = new TextDecoder('latin1'), utf8 = new TextDecoder();
  let p = 8;
  while (p + 12 <= buf.length) {
    const len = dv.getUint32(p), type = latin1.decode(buf.subarray(p + 4, p + 8));
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'tEXt' || type === 'iTXt') {
      const z = data.indexOf(0);
      if (z > 0 && latin1.decode(data.subarray(0, z)) === keyword) {
        if (type === 'tEXt') return latin1.decode(data.subarray(z + 1));
        // iTXt: keyword \0 compression-flag compression-method language \0 translated-keyword \0 text
        if (data[z + 1] !== 0) return null; // compressed: not written by the builder
        let q = z + 3;
        q = data.indexOf(0, q) + 1; // language tag
        q = data.indexOf(0, q) + 1; // translated keyword
        return utf8.decode(data.subarray(q));
      }
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return null;
}

/** The Character Builder's metadata in an exported sheet, or null for a plain sheet. */
export interface BuilderSheetMeta {
  format: 'lpc';
  name?: string;
  frame: number;
  dirs: ('up' | 'left' | 'down' | 'right')[];
  anims: Record<string, { row: number; frames: number; dirs: 1 | 4; cycle: number[]; ms: number }>;
  credits?: { item: string; authors: string[]; licenses: string[]; urls: string[] }[];
  steamSafe?: boolean;
  /** The builder's body (male, female, teen…), and whether it's a clothes-only sheet (an item's look when worn). */
  body?: string;
  worn?: boolean;
}

export async function readBuilderMeta(blob: Blob): Promise<BuilderSheetMeta | null> {
  try {
    const text = await readPngText(blob, 'hd2d-character');
    if (!text) return null;
    const m = JSON.parse(text) as BuilderSheetMeta;
    return m && m.format === 'lpc' && m.frame > 0 && m.anims && Array.isArray(m.dirs) ? m : null;
  } catch { return null; }
}

/** A weapon made in the weapon builder: its sprite layout, icon and credits (an "hd2d-weapon" chunk). */
export interface BuilderWeaponMeta {
  format: 'hd2d-weapon';
  version: number;
  name: string;
  kind: 'sword' | 'blunt' | 'staff' | 'bow' | 'shield';
  width: number;
  height: number;
  layers: { back: Record<string, { y: number; frame: number; frames: number; dirs: 1 | 4 }>; front: Record<string, { y: number; frame: number; frames: number; dirs: 1 | 4 }> };
  anims: string[];
  icon: { x: number; y: number; w: number; h: number };
  credits: { item: string; authors: string[]; licenses: string[]; urls: string[] }[];
  /** The built-in weapon it started from. */
  base?: string;
  /** How it was made (to open it again in the builder). */
  recipe?: unknown;
  /** The glow and swing trail chosen in the builder. */
  effects?: { glow?: { color: string; strength?: number; pulse?: boolean }; trail?: { color: string; length?: number } };
}

export async function readWeaponMeta(blob: Blob): Promise<BuilderWeaponMeta | null> {
  try {
    const text = await readPngText(blob, 'hd2d-weapon');
    if (!text) return null;
    const m = JSON.parse(text) as BuilderWeaponMeta;
    return m && m.format === 'hd2d-weapon' && m.layers && m.icon && m.width > 0 ? m : null;
  } catch { return null; }
}
