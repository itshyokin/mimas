/**
 * A map event at runtime. Like RPG Maker, an event has pages; the active page is the
 * last one whose condition is met, and it decides the event's look, trigger and commands.
 */
import * as THREE from 'three';
import { wallAnchor } from '../world/wallAnchor';
import { CharacterSprite } from '../game/CharacterSprite';
import type { GameState } from '../game/GameState';
import { SpriteLibrary, withSpriteShadows } from '../render/sprites';
import type { TileMap } from '../world/TileMap';
import type { Database, EventData, EventPage } from '../world/types';
import { eventCovers, eventH, eventW, nearestTileCentre } from '../world/eventArea';

export class GameEvent {
  page: EventPage | null = null;
  private pageIndex = -2;
  visual: THREE.Object3D | null = null;
  character: CharacterSprite | null = null;
  /** For 'auto' pages: has this page already run since it became active? */
  autoDone = false;
  /** "map:eventId": whose self-switches its pages and commands use (set by the game). */
  selfId = '';
  /** A breakable page that's been broken (until its page changes): gone from view, not solid. */
  broken = false;

  constructor(
    readonly data: EventData,
    private readonly scene: THREE.Object3D,
    private readonly sprites: SpriteLibrary,
    private readonly db: Database,
    private readonly map: TileMap,
  ) {}

  get x(): number { return this.data.x; }
  get z(): number { return this.data.z; }
  get w(): number { return eventW(this.data); }
  get h(): number { return eventH(this.data); }
  /** Does this event cover tile (x, z)? */
  covers(x: number, z: number): boolean { return eventCovers(this.data, x, z); }
  /** Centre of the event's tile nearest to a point. */
  nearest(px: number, pz: number): [number, number] { return this.data.pos3 ? [this.data.pos3.x, this.data.pos3.z] : nearestTileCentre(this.data, px, pz); }
  get onMap(): boolean { return this.map.inMap(this.data.x, this.data.z); }
  get solid(): boolean { return !!this.page?.solid && !this.page.enemy && !this.broken && this.onMap; }
  /** The active page is something to break. */
  get isBreakable(): boolean { return !!this.page?.breakable && !this.page.enemy; }
  /** The event's picture in the world (to shake when hit, hide when broken). */
  get visualObject(): THREE.Object3D | null { return this.visual; }
  /** The active page is an enemy (it fights instead of being talked to). */
  get isEnemy(): boolean { return !!this.page?.enemy; }
  /** The active page's trigger (enemies have none). */
  get trigger(): EventPage['trigger'] | null { return this.page && !this.page.enemy && !this.page.breakable ? this.page.trigger : null; }

  /** Re-evaluate page conditions; rebuild visuals when the active page changes. */
  refresh(state: GameState): void {
    let idx = -1;
    this.data.pages.forEach((p, i) => { if (!p.condition || state.test(p.condition, this.selfId)) idx = i; });
    if (idx === this.pageIndex) return;
    this.pageIndex = idx;
    this.page = idx >= 0 ? this.data.pages[idx] : null;
    this.autoDone = false;
    this.broken = false;
    this.rebuildVisual();
  }

  /** Where the event's picture stands and how tall it is (for speech bubbles); null when it has none. */
  speakerPoint(): { x: number; y: number; z: number; height: number; character: boolean } | null {
    const v = this.visual;
    if (!v || !this.page) return null;
    const height = this.page.character ? 1.5 : this.page.sprite ? (this.sprites.def(this.page.sprite)?.h ?? 1) : 1;
    return { x: v.position.x, y: v.position.y, z: v.position.z, height, character: !!this.page.character };
  }

  facePlayer(px: number, pz: number): void {
    if (this.page?.facePlayer && this.character) this.character.faceToward(px, pz);
  }

  update(dt: number): void {
    this.character?.animate(dt, false);
  }

  private rebuildVisual(): void {
    if (this.visual) this.scene.remove(this.visual);
    this.visual = null;
    this.character = null;
    const p = this.page;
    // Enemies are drawn by the combat system.
    if (!p || !this.onMap || p.enemy) return;
    // A bigger event shows its sprite in the middle of its bottom row.
    // Props set up on the tile grid stand on the front edge of the event's tiles, filling them (as in the editor).
    const onGrid = !!(p.sprite && this.sprites.def(p.sprite)?.foot);
    const vx = this.x + this.w / 2, vz = this.z + this.h - (onGrid ? 0 : 0.5);
    const y = this.map.surfaceY(vx, onGrid ? vz - 0.05 : vz);
    if (p.character) {
      const def = this.db.characters[p.character];
      if (!def) throw new Error(`Event "${this.data.name}" uses unknown character "${p.character}"`);
      this.character = new CharacterSprite(this.sprites, this.sprites.forCharacter(def), p.dir ?? 'down');
      this.visual = this.character.mesh;
    } else if (p.sprite) {
      const a = this.sprites.get(p.sprite);
      this.visual = withSpriteShadows(new THREE.Mesh(a.geometry, a.material), a);
    }
    if (this.visual) {
      // Against the wall: flat on the cliff face behind (a cave mouth, a door), not standing in the tile.
      if (p.wall ?? (p.sprite ? !!this.sprites.def(p.sprite)?.wall : false)) {
        const w = wallAnchor(this.map, vx, vz);
        this.visual.position.set(vx, w.y, w.z);
        this.visual.castShadow = false;
      } else this.visual.position.set(vx, y, vz);
      // Update 155: placed in 3D (a 3D map): exactly there, turned its way.
      const p3 = this.data.pos3;
      if (p3) { this.visual.position.set(p3.x, p3.y, p3.z); if (p3.ry !== undefined && this.character?.rig) this.character.faceVector(Math.sin((p3.ry * Math.PI) / 180), Math.cos((p3.ry * Math.PI) / 180)); }
      this.scene.add(this.visual);
    }
  }
}
