/**
 * The tile catalog: built-in ground tiles (painted in code) plus tiles imported from textures.
 * Each tile has a one-character key used in the map's terrain rows, so maps stay compact and readable.
 */
import type { Ailment, AssetRegistry, TileBlend, TileDef } from './types';
import { resolveBlend } from './blend';
import { type FootMaterial, guessFootstep } from './footsteps';

export const BUILTIN_TILES: TileDef[] = [
  { key: '.', id: 'grass', name: 'Grass', span: 1, builtin: true },
  { key: '=', id: 'path', name: 'Path', span: 1, builtin: true },
  { key: ':', id: 'sand', name: 'Sand', span: 1, builtin: true },
  // Was the old blocking water tile; water is its own layer now, so this is the ground under it.
  { key: '~', id: 'water', name: 'Lake bed', span: 1, builtin: true },
  // Added later (keys outside the imported tiles' pool, so older maps are untouched).
  { key: '▒', id: 'dirt', name: 'Dirt', span: 1, builtin: true },
  { key: '▦', id: 'stone', name: 'Stone paving', span: 1, builtin: true },
  { key: '▲', id: 'rock', name: 'Rock (cliffs, mountains)', span: 1, builtin: true },
  { key: '❄', id: 'snow', name: 'Snow', span: 1, builtin: true },
];

// '#' was the old raised-cliff tile; maps using it are converted to the height layer, so it stays reserved.
const BUILTIN_KEYS = new Set([...BUILTIN_TILES.map((t) => t.key), '#']);
export const isBuiltinTileKey = (k: string): boolean => BUILTIN_KEYS.has(k);

/** Characters available for imported tiles (none that need escaping in JSON). */
const KEY_POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!$%&*+-/;<>?@^_|,\'`(){}[]';
export const MAX_CUSTOM_TILES = KEY_POOL.length;

/** The next free key, or null when all are used. */
export function freeTileKey(used: (k: string) => boolean): string | null {
  for (const k of KEY_POOL) if (!BUILTIN_KEYS.has(k) && !used(k)) return k;
  return null;
}

/** The built-in cliff wall look. */
export const BRICKS = 'bricks';

export class TileCatalog {
  private readonly byKey = new Map<string, TileDef>();
  private readonly cliffs: Record<string, string>;
  private readonly blends = new Map<string, TileBlend>();
  private readonly blendOverrides: Record<string, Partial<TileBlend>>;
  private readonly roads: Record<string, boolean>;
  private readonly steps: Record<string, string>;
  private readonly printsSet: Record<string, boolean>;
  private readonly ailments: NonNullable<AssetRegistry['tileAilments']>;

  constructor(assets?: Partial<AssetRegistry>) {
    this.cliffs = { ...(assets?.tileCliffs ?? {}) };
    this.blendOverrides = { ...(assets?.tileBlend ?? {}) };
    this.roads = { ...(assets?.tileRoads ?? {}) };
    this.steps = { ...(assets?.tileSteps ?? {}) };
    this.printsSet = { ...(assets?.tilePrints ?? {}) };
    this.ailments = { ...(assets?.tileAilments ?? {}) };
    for (const t of BUILTIN_TILES) this.byKey.set(t.key, t);
    for (const t of assets?.tiles ?? []) {
      if (!t.key) continue;
      if (!BUILTIN_KEYS.has(t.key)) { this.byKey.set(t.key, t); continue; }
      // A built-in tile with a picture of your own: the picture, everything else as built in.
      const b = this.byKey.get(t.key);
      // Update 150: with its kind (animated, autotile, wall) and passage too.
      if (b && t.skin && t.image) this.byKey.set(t.key, { ...b, image: t.image, normal: t.normal, flat: t.flat, span: t.span || 1, filter: t.filter, skin: true,
        ...(t.kind ? { kind: t.kind, frames: t.frames, fps: t.fps } : {}), ...(t.blocks ? { blocks: true } : {}), ...(t.above ? { above: true } : {}) });
    }
  }

  /** The ailment standing on this tile gives (lava, a poison swamp), if any. */
  ailment(key: string): { ailment: Ailment; chance?: number; seconds?: number } | undefined { return this.ailments[key]; }

  get(key: string): TileDef | undefined {
    return this.byKey.get(key);
  }

  all(): TileDef[] {
    return [...this.byKey.values()];
  }

  custom(): TileDef[] {
    return this.all().filter((t) => !t.builtin);
  }

  /** Every tile drawn from a picture: imported ones, and built-in ones given a picture of your own. */
  textured(): TileDef[] {
    return this.all().filter((t) => !!t.image);
  }

  /** How this tile's edges blend (unknown keys behave like grass). */
  blendFor(key: string): TileBlend {
    let b = this.blends.get(key);
    if (!b) {
      const def = this.byKey.get(key) ?? this.byKey.get('.');
      b = resolveBlend(def, this.blendOverrides[key]);
      // Imported tiles of the same priority still blend: the one imported later (its key further along) spreads.
      if (def && !def.builtin) b = { ...b, priority: b.priority + (KEY_POOL.indexOf(key) + 1) * 0.001 };
      this.blends.set(key, b);
    }
    return b;
  }

  /** Is this tile a road (continues straight on past the map edge)? The built-in path is, unless switched off. */
  /** What this tile sounds like underfoot: its own setting, else guessed from its name. */
  footstep(key: string): FootMaterial { return (this.steps[key] as FootMaterial | undefined) ?? guessFootstep(this.get(key)); }
  /** Footprints on it (Update 123): its setting, else on for snow and sand. */
  prints(key: string): boolean { return this.printsSet[key] ?? this.printsDefault(key); }
  printsDefault(key: string): boolean { const f = this.footstep(key); return f === 'snow' || f === 'sand'; }
  /** The footstep setting for this tile, if it has one (undefined: guessed). */
  footstepChoice(key: string): string | undefined { return this.steps[key]; }

  isRoad(key: string): boolean {
    return this.roads[key] ?? key === '=';
  }
  /** The road setting only when it differs from the default (for saving). */
  roadOverride(key: string): boolean | undefined {
    return this.roads[key];
  }

  blocks(key: string): boolean {
    return !!this.byKey.get(key)?.blocks;
  }

  /** A tile's own cliff choice ("bricks", an imported tile key), or undefined to follow the map. */
  cliffChoice(key: string): string | undefined {
    const c = this.cliffs[key];
    return c && this.isCliffLook(c) ? c : undefined;
  }

  /** Can this be used for cliff walls? The built-in bricks, or any tile, built-in or imported. */
  isCliffLook(look: string): boolean {
    return look === BRICKS || this.byKey.has(look);
  }

  /** What the walls under a tile look like on a map whose default is `mapCliff`. */
  cliffFor(key: string, mapCliff: string | undefined): string {
    const c = this.cliffChoice(key) ?? mapCliff;
    return c && this.isCliffLook(c) ? c : BRICKS;
  }

  /** Drawn from a picture (an imported tile, or a built-in one with a picture of your own)? Unknown keys are grass. */
  isCustom(key: string): boolean {
    return !!this.byKey.get(key)?.image;
  }
}
