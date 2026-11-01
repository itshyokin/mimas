/**
 * Turns map data into scene geometry: the ground with its heights, cliff walls and stairs,
 * imported tiles, animated water, and instanced prop sprites.
 */
import type { With3D } from '../game/World3D';
import type { WithGround } from './groundModel';
import { markProp } from '../render/lean';
import { patchSway } from '../render/wind';
import { patchLip } from '../render/lipFade';
import { GROUND_LAYER, clampLayer, layerNudge, layerTie, patchFlat2D, patchGroundYield, patchLean } from '../render/lean';
import { buildDecks, placeDecks } from './decks';
import * as THREE from 'three';
import { propBase } from './wallAnchor';
import { builtinTileArt, glowPattern, iceTile, groundCanvas, grassTile, rippleNormals, rockFace } from '../art/placeholderArt';
import { type BorderGround, type EdgeRoad, type EdgeWater, type Side, borderGround, borderSides, cliffHeight, edgeRoads, edgeWaters, onEdgeRoad, sideOf } from './border';
import { patchRoadEdge } from '../render/roadEdge';
import type { V3 } from './terrainGeometry';
import { normalMapFrom } from '../core/pixel';
import { rng } from '../core/math';
import { patchAreaTint, setBuildOrigin } from '../render/areaTint';
import { patchToonWater, patchWaterEdge, waterMask } from '../render/waterEdge';
import { blendMask, patchTileBlend } from '../render/tileBlend';
import { SpriteLibrary, withSpriteShadows } from '../render/sprites';
import { blockedTiles, footTiles, footZ, propBoxes, stepOf } from './props';
import { type BuiltBuilding, buildBuildings } from './buildings';
import type { TileTexture } from '../render/tileTextures';
import { linearColor, makeTexture, registerNormalMap } from '../render/textures';
import type { TileMap } from './TileMap';
import { QuadList, buildTerrainGeometry, cornerRounding, cornerSliver } from './terrainGeometry';
import { BRICKS } from './tiles';
import type { BorderKind, MapData, PropData, PropDef, TileDef } from './types';
import { isToonWater, waterStyles } from './waterStyles';
import { blockRows, frameAt, frameLayout, framePieceRect, frameQuarters, isPixelTile, quartersFor } from './pixelTiles';
import { patchSeason } from '../render/season';
import { propSeason } from './seasons';

export interface BuiltWorld {
  /** Scroll this texture's offset each frame to animate the water around the map. */
  waterNormals: THREE.Texture;
  /** Each water style's ripples, scrolled by its current. */
  waterFlows: WaterFlow[];
  /** Ground meshes, for picking the tile under the pointer. */
  ground: THREE.Object3D[];
  /** Where each placed prop is drawn (its instanced mesh and index), so one can be removed (cut down). */
  props: Map<PropData, { mesh: THREE.InstancedMesh; index: number }>;
  /** Each building's materials, to fade it while it hides the player. */
  buildings: BuiltBuilding[];
  /** Waterfalls (where water drops more than two steps to water below): the foot of each, for spray and sound. */
  waterfalls: { x: number; z: number; y: number; top: number }[];
}

/** The clock animated RPG Maker-style tiles show (Update 146), in seconds: set by tickPixelTiles each frame. */
let pixelClock = 0;
export function tickPixelTiles(seconds: number): void { pixelClock = seconds; }

/**
 * RPG Maker-style tiles (Update 146): each cell a flat picture on the ground, crisp pixels, no blended edges.
 * Autotiles are four quarters picked from the neighbours; animated ones step through their frames. Update 147: also
 * the upper terrain layer (any imported tile, see-through where its picture is), ☆ tiles drawn over the characters.
 */
function buildPixelTiles(scene: THREE.Object3D, map: TileMap, tileTextures: Map<string, TileTexture>): void {
  const layers: [(x: number, z: number) => string, boolean][] = [[(x, z) => map.terrain(x, z), false], [(x, z) => map.upper(x, z), true]];
  const flatTex = (img: TexImageSource) => {
    const tex = new THREE.CanvasTexture(img as HTMLCanvasElement);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    return tex;
  };
  const addMesh = (q: QuadList, tex: THREE.Texture, def: TileDef, upper: boolean, see: boolean, order: number) => {
    const mat = patchAreaTint(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, alphaTest: see ? 0.5 : 0, polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -4 - 2 * order }));
    const m = mesh(q, mat);
    m.renderOrder = order;
    // ☆: drawn over the characters (and everything else), like RPG Maker's star tiles.
    if (def.above) { mat.depthTest = false; mat.depthWrite = false; mat.transparent = true; m.renderOrder = 20 + order; m.receiveShadow = false; }
    scene.add(m);
    return m;
  };
  for (const [at, upper] of layers) for (const [key, tt] of tileTextures) {
    const def = tt.def;
    const img = tt.map.image as { width: number; height: number };
    // Cells of this tile on this layer.
    const cells: [number, number][] = [];
    for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) if (at(x, z) === key) cells.push([x, z]);
    if (!cells.length) continue;
    const sameAt = (x: number, z: number) => (dx: number, dz: number) => { const nx = x + dx, nz = z + dz; return !map.inMap(nx, nz) || at(nx, nz) === key; };
    const lift = upper ? 0.014 : 0.006;
    const y = (x: number, z: number, extra: number) => map.surfaceY(x, z) + lift + extra;
    const quadder = (q: QuadList, w: number, hh: number, extra: number) => {
      // UVs pulled in half a pixel so crisp sampling never picks up the next piece of the picture at an edge.
      const eu = 0.5 / w, ev = 0.5 / hh;
      return (x0: number, z0: number, x1: number, z1: number, u0: number, v0: number, u1: number, v1: number) => {
        [u0, u1, v0, v1] = [u0 + eu, u1 - eu, v0 - ev, v1 + ev];
        q.add([[x0, y(x0, z0, extra), z0], [x1, y(x1, z0, extra), z0], [x1, y(x1, z1, extra), z1], [x0, y(x0, z1, extra), z1]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], [0, 1, 0]);
      };
    };
    /** Quarters cut from a frame picture (and a corners picture) for every cell, as two meshes. */
    const frameMeshes = (frame: { width: number; height: number }, n: number, corners: { width: number; height: number } | undefined, extra: number, see: boolean, order: number) => {
      const qf = new QuadList(), qc = new QuadList();
      const addF = quadder(qf, frame.width, frame.height, extra), addC = corners ? quadder(qc, corners.width, corners.height, extra) : null;
      for (const [x, z] of cells) frameQuarters(sameAt(x, z), !!corners, def.cornersAt).forEach((p, k) => {
        const qx = x + (k % 2) * 0.5, qz = z + Math.floor(k / 2) * 0.5;
        const pic = p.corner ? corners! : frame, [px, py, pw, ph] = framePieceRect(p, pic.width, pic.height, n);
        (p.corner ? addC! : addF)(qx, qz, qx + 0.5, qz + 0.5, px / pic.width, 1 - py / pic.height, (px + pw) / pic.width, 1 - (py + ph) / pic.height);
      });
      if (qf.quads) addMesh(qf, flatTex(frame as unknown as TexImageSource), def, upper, see, order);
      if (qc.quads && corners) addMesh(qc, flatTex(corners as unknown as TexImageSource), def, upper, see, order);
    };
    // The tile itself (plain lower-layer tiles are drawn by the blended ground instead).
    const n = Math.max(2, Math.round(def.frameTiles ?? 2));
    if (def.kind === 'autotile' && def.layout === 'frame') frameMeshes(img, n, tt.corners, 0, upper, upper ? 2 : 1);
    else if (upper || isPixelTile(def)) {
      const l = isPixelTile(def) ? frameLayout(def, img.width, img.height) : { frames: 1, horiz: true };
      const auto = def.kind === 'autotile' || def.kind === 'wall', rows = blockRows(def), span = isPixelTile(def) ? 1 : Math.max(1, Math.round(def.span || 1));
      const fw = l.horiz ? 1 / l.frames : 1, fh = l.horiz ? 1 : 1 / l.frames;
      const q = new QuadList(), quad = quadder(q, img.width, img.height, 0);
      for (const [x, z] of cells) {
        if (!auto) {
          // A plain tile on the upper layer: its piece of the repeating picture.
          const ix = ((x % span) + span) % span, iz = ((z % span) + span) % span;
          quad(x, z, x + 1, z + 1, (ix / span) * fw, 1 - iz / span, ((ix + 1) / span) * fw, 1 - ((iz + 1) / span) * fh);
          continue;
        }
        quartersFor(def, sameAt(x, z)).forEach(([c, r], k) => {
          const qx = x + (k % 2) * 0.5, qz = z + Math.floor(k / 2) * 0.5;
          const u0 = (c / 4) * fw, v0 = 1 - r / rows;
          quad(qx, qz, qx + 0.5, qz + 0.5, u0, v0, u0 + fw / 4, v0 - 1 / rows);
        });
      }
      const tex = flatTex(tt.map.image as TexImageSource);
      const m = addMesh(q, tex, def, upper, upper, upper ? 2 : 1);
      if (l.frames > 1) m.onBeforeRender = () => {
        const f = frameAt(def, l.frames, pixelClock);
        if (l.horiz) tex.offset.x = f / l.frames; else tex.offset.y = -f / l.frames;
      };
    }
    // Update 151: an edge trim over the tile, along the edges of each patch of it.
    if (tt.edges) frameMeshes(tt.edges, n, tt.corners, 0.003, true, upper ? 3 : 2);
  }
}

/** Falling water: soft streaks running down, foamy white at the edges. */
function fallsTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d')!, img = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const streak = 0.5 + 0.5 * Math.sin(x * 0.9 + Math.sin(y * 0.05 + x) * 2) * Math.sin(x * 0.37 + 1.3);
    const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    const v = Math.min(1, 0.45 + streak * 0.45 + Math.abs(n) * 0.15);
    const i = (y * 64 + x) * 4;
    img.data[i] = 170 + v * 85; img.data[i + 1] = 210 + v * 45; img.data[i + 2] = 240 + v * 15;
    img.data[i + 3] = 120 + v * 120;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * Waterfalls: wherever a water cell's surface is more than two steps above the water next to it, a sheet of falling
 * water runs down the wall between them (scrolling, see the returned flow), with its foot listed for spray and sound.
 */
function buildWaterfalls(scene: THREE.Object3D, map: TileMap): { flow: WaterFlow | null; spots: BuiltWorld['waterfalls'] } {
  const q = new QuadList(), spots: BuiltWorld['waterfalls'] = [];
  const DROP = 1.0 + 1e-3;
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    const up = map.waterAt(x, z);
    if (!up) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, lo = map.waterAt(nx, nz);
      if (!lo || up.surface - lo.surface <= DROP) continue;
      // The sheet stands on the shared edge, a hair out over the lower water.
      const ex = dx === 1 ? x + 1 : dx === -1 ? x : null, ez = dz === 1 ? z + 1 : dz === -1 ? z : null;
      const o = 0.04;
      const a: [number, number] = ex !== null ? [ex + dx * o, z] : [x, ez! + dz * o];
      const b: [number, number] = ex !== null ? [ex + dx * o, z + 1] : [x + 1, ez! + dz * o];
      const top = up.surface, bot = lo.surface - 0.05;
      q.add([[a[0], top, a[1]], [b[0], top, b[1]], [b[0], bot, b[1]], [a[0], bot, a[1]]],
        [[0, top], [1, top], [1, bot], [0, bot]], [dx, 0, dz]);
      spots.push({ x: (a[0] + b[0]) / 2 + dx * 0.3, z: (a[1] + b[1]) / 2 + dz * 0.3, y: lo.surface, top });
    }
  }
  if (!q.quads) return { flow: null, spots };
  const tex = makeTexture(fallsTexture(), { repeat: true, linear: false });
  tex.repeat.set(1, 0.6);
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.35, emissive: new THREE.Color('#9fc8e8'), emissiveIntensity: 0.25, depthWrite: false, side: THREE.DoubleSide });
  const m = mesh(q, mat);
  m.renderOrder = 3;
  scene.add(m);
  return { flow: { tex, flow: 3, flowDir: -90 }, spots };
}

/**
 * Build a map's world into `scene`. `origin`: where it sits when drawn beside another map (a seamless neighbour), so
 * its shader lookups stay in its own tile coordinates.
 */
export function buildWorld(scene: THREE.Object3D, map: TileMap, data: MapData, sprites: SpriteLibrary, tileTextures: Map<string, TileTexture> = new Map(), origin?: THREE.Vector2): BuiltWorld {
  setBuildOrigin(origin ?? null);
  try { return buildWorldAt(scene, map, data, sprites, tileTextures); } finally { setBuildOrigin(null); }
}

function buildWorldAt(scene: THREE.Object3D, map: TileMap, data: MapData, sprites: SpriteLibrary, tileTextures: Map<string, TileTexture>): BuiltWorld {
  const spans = new Map([...tileTextures].map(([k, t]) => [k, Math.max(0.25, t.def.span || 1)] as [string, number]));
  // Cliff walls look the way the tile on top of them says (or the map's default).
  const wallLook = (x: number, z: number) => {
    const look = map.tiles.cliffFor(map.terrain(x, z), data.cliffTile);
    const out = look === BRICKS || tileTextures.has(look) || !map.tiles.isCustom(look) ? look : BRICKS;
    // Cliff-style ground: bare rock unless the map or tile chose a look of its own.
    return out === BRICKS && map.heightStyle(x, z) === 'c' ? '▲' : out;
  };
  const geo = buildTerrainGeometry(map, spans, wallLook);
  const terrainFrom = scene.children.length;

  // Ground: every cell's top surface, textured with one image painted from the terrain layer.
  const gc = groundCanvas(map), gn = normalMapFrom(gc, { strength: 2 });
  // Tiles set to lie flat (no generated normal map): their cells of the painted ground's normal map point straight up.
  {
    const flatKeys = new Set(map.tiles.all().filter((t) => t.flat).map((t) => t.key));
    if (flatKeys.size) {
      const g = gn.getContext('2d')!, cw = gn.width / map.w, ch = gn.height / map.h;
      g.fillStyle = '#8080ff';
      for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) if (flatKeys.has(map.terrain(x, z))) g.fillRect(Math.floor(x * cw), Math.floor(z * ch), Math.ceil(cw), Math.ceil(ch));
    }
  }
  const groundTex = makeTexture(gc, { mip: true }), groundNormal = makeTexture(gn, { linear: true, mip: true });
  const makeGroundMat = () => {
    const m = patchSeason(patchAreaTint(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 })), 'ground');
    registerNormalMap(m, groundNormal);
    m.normalScale.set(0.7, 0.7);
    return m;
  };
  const groundMat = makeGroundMat();
  const ground = mesh(geo.ground, groundMat);
  ground.castShadow = true;
  scene.add(ground);

  // Imported tiles: their own repeating textures, just above the painted ground, with blended edges.
  const tileMat = (key: string, blended: boolean) => {
    const t = tileTextures.get(key)!, b = map.tiles.blendFor(key);
    const mat = patchSeason(patchAreaTint(new THREE.MeshStandardMaterial({ map: t.map, roughness: 1, metalness: 0 })), 'ground');
    registerNormalMap(mat, t.normal);
    mat.normalScale.set(0.8, 0.8);
    if (blended && b.blend) {
      const img = t.map.image as { width?: number } | undefined;
      patchTileBlend(mat, blendMask(map, key), b, (img?.width ?? 16) / Math.max(0.25, t.def.span || 1));
    }
    return mat;
  };
  for (const [key, quads] of geo.overlays) {
    // RPG Maker-style tiles are drawn by buildPixelTiles instead (Update 146).
    if (isPixelTile(tileTextures.get(key)?.def)) continue;
    const m = mesh(quads, tileMat(key, true));
    m.renderOrder = 0;
    scene.add(m);
  }
  for (const [key, quads] of geo.slivers) if (!isPixelTile(tileTextures.get(key)?.def)) scene.add(mesh(quads, tileMat(key, false)));
  buildPixelTiles(scene, map, tileTextures);
  // Soft blocky's grass lip over the cliff tops (the painted ground, then any imported tile over it).
  // Its pixels stay sharp however slanted the wall is (a blurred, far-off copy of the texture showed as a pale line).
  const sharp = (m: THREE.MeshStandardMaterial) => {
    if (m.map) { const t = m.map.clone(); t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; m.map = t; }
    return patchLip(m);
  };
  if (geo.lip.quads) scene.add(mesh(geo.lip, sharp(makeGroundMat())));
  for (const [key, quads] of geo.lipOverlays) if (quads.quads) scene.add(mesh(quads, sharp(tileMat(key, false))));

  // Cliff walls and stair risers, one mesh per look.
  for (const [look, quads] of geo.walls) {
    if (!quads.quads) continue;
    let wallMat: THREE.MeshStandardMaterial;
    if (look === BRICKS || !tileTextures.has(look)) {
      // Built-in looks: the stone bricks, or a built-in tile's art (grass, path, sand, water) on its side.
      const art = look === BRICKS ? rockFace() : builtinTileArt(look);
      wallMat = patchSeason(patchAreaTint(new THREE.MeshStandardMaterial({ map: makeTexture(art, { repeat: true, mip: true }), roughness: 0.95 })), 'ground');
      registerNormalMap(wallMat, makeTexture(normalMapFrom(art, { strength: look === BRICKS ? 4 : 2.5, wrap: true }), { linear: true, repeat: true, mip: true }));
    } else {
      // An imported tile on its side: same texture, repeating every `span` tiles up the wall too.
      const t = tileTextures.get(look)!, span = Math.max(0.25, t.def.span || 1);
      const map2 = t.map.clone(), nm = t.normal.clone();
      for (const tx of [map2, nm]) { tx.repeat.set(1 / span, 1 / span); tx.needsUpdate = true; }
      wallMat = patchAreaTint(new THREE.MeshStandardMaterial({ map: map2, roughness: 0.95 }));
      registerNormalMap(wallMat, nm);
    }
    const walls = mesh(quads, wallMat);
    shadeWall(walls.geometry as THREE.BufferGeometry);
    wallMat.vertexColors = true;
    walls.castShadow = true;
    scene.add(walls);
  }

  // Water reaching the map edge carries on out, like roads (a stream running off into the woods).
  const edgeWater = edgeWaters(map.w, map.h, (x, z) => map.waterAt(x, z), (x, z) => Math.min(...map.cornersAt(x, z)), borderSides(data.border));
  const waterFrom = scene.children.length;
  const { ripple: waterNormals, flows: waterFlows } = buildWater(scene, map, data, edgeWater);
  const borderFrom = scene.children.length;
  buildBorder(scene, map, data, waterNormals, tileTextures, edgeWater);
  // Update 153: a 3D model as the ground: the painted terrain and the scenery round the edge stay hidden (the ground
  // mesh is still there for pointing at tiles), the model is drawn instead; painted water still shows.
  const gm = (data as WithGround).__ground, s3 = (data as With3D).__scene3d;
  // Update 154: a 3D map: the same, with the Blender scene.
  if (s3) {
    for (const o of [...scene.children.slice(terrainFrom, waterFrom), ...scene.children.slice(borderFrom)]) o.visible = false;
    scene.add(s3.object);
  }
  if (gm) {
    for (const o of [...scene.children.slice(terrainFrom, waterFrom), ...scene.children.slice(borderFrom)]) o.visible = false;
    scene.add(gm.object.clone(true));
  }
  // Terrain gives way to characters and props in depth (render/lean.ts).
  for (const obj of scene.children.slice(terrainFrom)) obj.traverse((o: THREE.Object3D) => {
    const mats = (o as THREE.Mesh).material;
    if ((o as THREE.Mesh).isMesh && mats) for (const m of Array.isArray(mats) ? mats : [mats]) patchGroundYield(m);
  });
  const buildings = buildBuildings(scene, map, data.buildings ?? [], tileTextures);
  const props = buildProps(scene, map, data, sprites);
  const falls = buildWaterfalls(scene, map);
  if (falls.flow) waterFlows.push(falls.flow);
  return { waterNormals, waterFlows, ground: [ground], props, buildings, waterfalls: falls.spots };
}

function mesh(q: QuadList, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(q.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(q.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(q.uv, 2));
  if (q.extra.length) g.setAttribute('fade', new THREE.Float32BufferAttribute(q.extra, 1));
  g.setIndex(q.idx);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** A water style's animated surface: its own copy of the ripples, scrolled by its current (Game moves them). */
export interface WaterFlow { tex: THREE.Texture; flow: number; flowDir: number }

/**
 * Water surfaces at their levels: one mesh per kind and style, so shallow, swimmable and deep water look different,
 * and each of the map's water styles (a pond, a river, lava) has its own colour, clarity, surface and current.
 */
function buildWater(scene: THREE.Object3D, map: TileMap, data: MapData, edgeWater: EdgeWater[]): { ripple: THREE.Texture; flows: WaterFlow[] } {
  const ripple = makeTexture(rippleNormals(), { linear: true, repeat: true });
  ripple.magFilter = THREE.LinearFilter;
  ripple.minFilter = THREE.LinearFilter;
  // How deep water darkens and thickens the style's colour, by kind.
  const LOOK = {
    shallow: { shade: 1.35, opacity: 0.5 },
    swim: { shade: 1, opacity: 0.74 },
    deep: { shade: 0.55, opacity: 0.9 },
  } as const;
  const styles = waterStyles(data);
  // Per kind and style: "full" pieces are always drawn (water cells, and the water under a bank's rounded corner);
  // "edge" pieces lap over a bank at the water's level and are cut to a rounded shoreline in the shader.
  const groups = new Map<string, { kind: 'shallow' | 'swim' | 'deep'; style: number; full: QuadList; edge: QuadList }>();
  const group = (kind: 'shallow' | 'swim' | 'deep', style: number) => {
    const st = styles[style] ? style : 0, k = `${kind}:${st}`;
    let g = groups.get(k);
    if (!g) { g = { kind, style: st, full: new QuadList(), edge: new QuadList() }; groups.set(k, g); }
    return g;
  };
  const uv = (p: number[][]) => p.map(([x, , z]) => [x * 0.45, z * 0.45] as [number, number]);
  const square = (list: QuadList, x: number, z: number, y: number) =>
    list.add([[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], uv([[x, 0, z], [x + 1, 0, z], [x + 1, 0, z + 1], [x, 0, z + 1]]), [0, 1, 0]);
  for (let z = 0; z < map.h; z++)
    for (let x = 0; x < map.w; x++) {
      const wtr = map.waterAt(x, z);
      if (wtr) { square(group(wtr.kind, wtr.style).full, x, z, wtr.surface + 0.01); continue; }
      // A bank corner cut round: water fills the gap under it.
      const round = cornerRounding(map, x, z);
      for (let k = 0; k < 4; k++) {
        if (!round.convex[k]) continue;
        const [dx, dz] = [[-1, -1], [1, -1], [1, 1], [-1, 1]][k], nb = map.waterAt(x + dx, z + dz)!;
        for (const t of cornerSliver(x, z, k, nb.surface + 0.01)) group(nb.kind, nb.style).full.add(t, uv(t), [0, 1, 0]);
      }
      // A dry cell next to water, no higher than its surface: the water laps over its edge.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nb = map.waterAt(x + dx, z + dz);
        if (!nb || Math.max(...map.cornersAt(x, z)) > nb.surface + 0.02) continue;
        square(group(nb.kind, nb.style).edge, x, z, nb.surface + 0.01);
        break;
      }
    }
  // Past the map edge: each run of edge water continues straight out (its own style, never cut by the shoreline).
  const E = 70;
  for (const r of edgeWater) {
    const g = group(r.kind, r.style), y = r.surface + 0.01, a = r.from, b = r.to + 1;
    for (let i = 0; i < E; i++) {
      if (r.side === 'n') for (let x = a; x < b; x++) square(g.full, x, -1 - i, y);
      else if (r.side === 's') for (let x = a; x < b; x++) square(g.full, x, map.h + i, y);
      else if (r.side === 'w') for (let z = a; z < b; z++) square(g.full, -1 - i, z, y);
      else for (let z = a; z < b; z++) square(g.full, map.w + i, z, y);
    }
  }
  // Winter: still water frozen over: a pale, glossy sheet at the surface (walked and slid on).
  const ice = new QuadList();
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) { const top = map.iceAt(x, z); if (top !== null) square(ice, x, z, top + 0.012); }
  if (ice.quads) {
    const im = new THREE.MeshStandardMaterial({ map: makeTexture(iceTile(), { repeat: true, mip: true }), roughness: 0.22, metalness: 0, normalMap: ripple, normalScale: new THREE.Vector2(0.05, 0.05) });
    softenSpecular(im);
    const m = mesh(ice, patchAreaTint(im));
    m.renderOrder = 1;
    scene.add(m);
  }
  const mask = waterMask(map);
  // Each style scrolls its own copy of the ripples (by its current); copies share the picture.
  const texOf = new Map<number, THREE.Texture>(), flows: WaterFlow[] = [];
  const tex = (style: number) => {
    let t = texOf.get(style);
    if (!t) {
      t = ripple.clone() as THREE.Texture;
      t.needsUpdate = true;
      texOf.set(style, t);
      flows.push({ tex: t, flow: styles[style].flow ?? 0, flowDir: styles[style].flowDir ?? 0 });
    }
    return t;
  };
  for (const g of groups.values()) {
    const a = g.full, b = g.edge, st = styles[g.style];
    if (!a.quads && !b.quads) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...a.pos, ...b.pos], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([...a.nor, ...b.nor], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([...a.uv, ...b.uv], 2));
    geo.setAttribute('hdWaterForce', new THREE.Float32BufferAttribute([...new Array(a.pos.length / 3).fill(1), ...new Array(b.pos.length / 3).fill(0)], 1));
    const offset = a.pos.length / 3;
    geo.setIndex([...a.idx, ...b.idx.map((i) => i + offset)]);
    // Clearer (more see-through, a touch lighter) or murkier (thicker); deeper water darker.
    const murk = Math.max(0, Math.min(1, st.murk ?? 0.5)), look = LOOK[g.kind], base = look.opacity;
    const glow = Math.max(0, Math.min(1, st.glow ?? 0));
    const opacity = Math.min(1, (murk < 0.5 ? base * (0.4 + 1.2 * murk) : base + (0.97 - base) * (murk - 0.5) * 2) + glow * 0.4);
    const color = new THREE.Color(st.color || '#3f86b0');
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * look.shade)));
    if (murk < 0.5) color.lerp(new THREE.Color('#d6f0f6'), (0.5 - murk) * 0.35);
    // A soft, mostly matte surface: small glints, no glare.
    const bump = 0.32 * Math.max(0, Math.min(2.5, st.bumpy ?? 1));
    // Toon water is flat: no ripples or glints, just its colour (with the lines and foam drawn on in the shader).
    const toon = isToonWater(st);
    const mat = new THREE.MeshStandardMaterial({
      color: linearColor('#' + color.getHexString()), roughness: toon ? 1 : 0.5 + 0.1 * Math.min(1, bump), metalness: 0, transparent: opacity < 0.995, opacity,
      ...(toon ? {} : { normalMap: tex(g.style), normalScale: new THREE.Vector2(bump, bump) }), depthWrite: false,
    });
    if (glow > 0) {
      // Lava and goo: a darker crust, glowing brightest along shifting seams (carried by the current too).
      mat.color.multiplyScalar(1 - glow * 0.7);
      const gm = makeTexture(glowPattern(), { repeat: true });
      gm.magFilter = THREE.LinearFilter;
      flows.push({ tex: gm, flow: (st.flow ?? 0) * 0.6, flowDir: st.flowDir ?? 0 });
      mat.emissiveMap = gm;
      mat.emissive = linearColor(st.color);
      mat.emissiveIntensity = 0.4 + glow * 1.1;
    }
    softenSpecular(mat);
    const edged = patchWaterEdge(patchAreaTint(mat), mask);
    if (toon) {
      // Lines a lighter tint of the water (rougher water: more of them), foam near white; both drift with the current.
      const base = new THREE.Color(st.color || '#3f86b0');
      const fd = THREE.MathUtils.degToRad(st.flowDir ?? 0), fl = st.flow ?? 0;
      patchToonWater(edged, {
        line: linearColor('#' + base.clone().lerp(new THREE.Color('#ffffff'), g.kind === 'deep' ? 0.3 : 0.42).getHexString()),
        foam: linearColor('#' + base.clone().lerp(new THREE.Color('#ffffff'), 0.82).getHexString()),
        lines: Math.max(0, Math.min(1, (st.lines ?? 0.5) * (0.7 + 0.3 * Math.min(2, st.bumpy ?? 1)))),
        foamOn: !st.noFoam,
        drift: new THREE.Vector2(0.18 + Math.cos(fd) * fl, 0.04 + Math.sin(fd) * fl),
      });
    }
    const water = new THREE.Mesh(geo, edged);
    water.receiveShadow = true;
    water.renderOrder = 1;
    scene.add(water);
  }
  return { ripple, flows };
}

/** Water: its highlights kept small and soft (a wet sheen, not the glare of polished jelly). */
function softenSpecular(mat: THREE.MeshStandardMaterial): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n  reflectedLight.directSpecular = min(reflectedLight.directSpecular * 0.35, vec3(0.18));');
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|softSpec';
}

/**
 * The land around the map, per side: open ground (grass, forest, meadow), raised rocky cliffs, water,
 * or nothing at all (darkness, for caves and interiors). It's a frame, so pits inside the map stay open.
 */
/**
 * The ground height beyond the edge at a point along side `side` (tile index along the edge; past the corners it
 * keeps the corner's): the height of the map's edge tile there, so the scenery carries on at the level the map ends.
 */
function edgeHeight(map: TileMap, side: Side, i: number): number {
  const W = map.w, H = map.h, a = Math.floor(i);
  const [x, z] = side === 'n' ? [Math.max(0, Math.min(W - 1, a)), 0] : side === 's' ? [Math.max(0, Math.min(W - 1, a)), H - 1]
    : side === 'w' ? [0, Math.max(0, Math.min(H - 1, a))] : [W - 1, Math.max(0, Math.min(H - 1, a))];
  const c = map.cornersAt(x, z);
  // The edge's outer corners (a ramp at the edge: its height on the outside).
  const outer = side === 'n' ? [c[0], c[1]] : side === 's' ? [c[3], c[2]] : side === 'w' ? [c[0], c[3]] : [c[1], c[2]];
  return Math.min(outer[0], outer[1]);
}

/** The height beyond the edge at an outside cell (x, z): its side's edge tile. */
export function borderHeightAt(map: TileMap, x: number, z: number): number {
  const side = sideOf(x, z, map.w, map.h);
  return edgeHeight(map, side, side === 'n' || side === 's' ? x : z);
}

function buildBorder(scene: THREE.Object3D, map: TileMap, data: MapData, ripple: THREE.Texture, tileTextures: Map<string, TileTexture>, edgeWater: EdgeWater[]): void {
  const sides = borderSides(data.border), E = 70, W = map.w, H = map.h;
  // The four strips: top and bottom run the full width (corners included), left and right fill between.
  const strips: [Side, number, number, number, number][] = [['n', -E, -E, W + E, 0], ['s', -E, H, W + E, H + E], ['w', -E, 0, 0, H], ['e', W, 0, W + E, H]];
  const grounds: Record<BorderGround, QuadList> = { grass: new QuadList(), sand: new QuadList(), snow: new QuadList(), rock: new QuadList() };
  const rockTop = new QuadList(), rockWall = new QuadList(), water = new QuadList(), bed = new QuadList();
  const roads = edgeRoads(W, H, (x, z) => map.terrain(x, z), (k) => map.tiles.isRoad(k), sides);
  // A vertical stone face between two points on the ground plan, from height `top` down to `bottom`, facing `facing`.
  const rect = (q: QuadList, x0: number, z0: number, x1: number, z1: number, y: number) =>
    q.add([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [[x0, -z0], [x1, -z0], [x1, -z1], [x0, -z1]], [0, 1, 0]);
  const wall = (a: [number, number], b: [number, number], top: number, bottom: number, facing: [number, number, number]) => {
    if (top - bottom < 0.005) return;
    rockWall.add([[a[0], top, a[1]], [b[0], top, b[1]], [b[0], bottom, b[1]], [a[0], bottom, a[1]]],
      [[a[0] + a[1], top], [b[0] + b[1], top], [b[0] + b[1], bottom], [a[0] + a[1], bottom]], facing);
  };
  for (const [side, x0, z0, x1, z1] of strips) {
    const kind = sides[side];
    // Seamless: the neighbouring map is drawn there instead (the game adds it).
    if (kind === 'none' || kind === 'seamless') continue;
    const ns = side === 'n' || side === 's';
    const hAt = (i: number) => edgeHeight(map, side, i);
    // Roads leaving on this side, as [start, end] along the edge.
    const gaps = roads.filter((r) => r.side === side).map((r) => [r.from, r.to + 1] as [number, number]).sort((p, q) => p[0] - q[0]);
    // Water leaving on this side: a channel cut into the ground (or through the cliffs).
    const streams = edgeWater.filter((r) => r.side === side);
    const cuts = [...gaps, ...streams.map((r) => [r.from, r.to + 1] as [number, number])].sort((p, q) => p[0] - q[0]);
    // Plan coordinates from (along the edge, out from the map): the far end of the strip is E tiles out.
    const out0 = side === 'n' ? 0 : side === 's' ? H : side === 'w' ? 0 : W;
    const outE = side === 'n' ? -E : side === 's' ? H + E : side === 'w' ? -E : W + E;
    const pt = (along: number, out: number): [number, number] => (ns ? [along, out] : [out, along]);
    const lo = ns ? x0 : z0, hi = ns ? x1 : z1;
    const oLo = Math.min(out0, outE), oHi = Math.max(out0, outE);
    const flat = (q: QuadList, p: number, r: number, y: number) => { if (ns) rect(q, p, oLo, r, oHi, y); else rect(q, oLo, p, oHi, r, y); };
    /** Split [p, r) along the edge into runs of one height: [from, to, height]. */
    const runs = (p: number, r: number): [number, number, number][] => {
      const out: [number, number, number][] = [];
      let a = p;
      while (a < r) {
        const hgt = hAt(a);
        let b = Math.min(r, Math.floor(a) + 1);
        while (b < r && hAt(b) === hgt) b = Math.min(r, b + 1);
        out.push([a, b, hgt]);
        a = b;
      }
      return out;
    };
    /** Faces where the ground steps up or down between runs (across the whole strip). */
    const steps = (list: [number, number, number][], lift = 0) => {
      for (let k = 1; k < list.length; k++) {
        const [, , h0] = list[k - 1], [b, , h1] = list[k];
        if (h0 === h1) continue;
        // Facing the lower side.
        const face: [number, number, number] = h0 > h1 ? (ns ? [1, 0, 0] : [0, 0, 1]) : (ns ? [-1, 0, 0] : [0, 0, -1]);
        wall(pt(b, out0), pt(b, outE), Math.max(h0, h1) + lift, Math.min(h0, h1) - 0.02, face);
      }
    };
    if (kind === 'water') {
      const list = runs(lo, hi);
      for (const [p, r, hgt] of list) { flat(water, p, r, hgt - 0.12); flat(bed, p, r, hgt - 0.9); }
      steps(list.map(([p, r, hgt]) => [p, r, hgt - 0.12]), 0);
      // Roads cross on a stone causeway: its sides drop into the water.
      for (const [a, b] of gaps) {
        const ha = hAt(a), hb = hAt(b - 1);
        wall(pt(a, out0), pt(a, outE), ha - 0.012, ha - 0.9, ns ? [-1, 0, 0] : [0, 0, -1]);
        wall(pt(b, out0), pt(b, outE), hb - 0.012, hb - 0.9, ns ? [1, 0, 0] : [0, 0, 1]);
      }
      continue;
    }
    // The channel: a bed, and banks down to it on both sides (from the ground or the cliff's foot).
    for (const r of streams) {
      const a = r.from, b = r.to + 1, ga = hAt(a), top = Math.max(ga - 0.02, r.surface);
      flat(bed, a, b, r.bed);
      wall(pt(a, out0), pt(a, outE), Math.max(hAt(a - 1) - 0.02, top), r.bed, ns ? [1, 0, 0] : [0, 0, 1]);
      wall(pt(b, out0), pt(b, outE), Math.max(hAt(b) - 0.02, top), r.bed, ns ? [-1, 0, 0] : [0, 0, -1]);
    }
    // Pieces of the strip between the channels (and, for cliffs, the roads).
    const pieces = (list: [number, number][]) => {
      const segs: [number, number][] = [];
      let cur = lo;
      for (const [a, b] of list) { if (a > cur) segs.push([cur, a]); cur = Math.max(cur, b); }
      if (cur < hi) segs.push([cur, hi]);
      return segs;
    };
    if (kind !== 'rocks') {
      const ground = grounds[borderGround(kind)];
      for (const [p, q] of pieces(streams.map((r) => [r.from, r.to + 1] as [number, number]).sort((u, v) => u[0] - v[0]))) {
        const list = runs(p, q);
        for (const [a, b, hgt] of list) flat(ground, a, b, hgt - 0.02);
        steps(list);
      }
      continue;
    }
    const y = cliffHeight(side);
    // The cliff, split wherever a road or a stream passes through, standing on the edge's own height.
    const inward: [number, number, number] = side === 'n' ? [0, 0, 1] : side === 's' ? [0, 0, -1] : side === 'w' ? [1, 0, 0] : [-1, 0, 0];
    for (const [p, q] of pieces(cuts)) {
      const list = runs(p, q);
      for (const [a, b, hgt] of list) {
        flat(rockTop, a, b, hgt + y);
        // The cliff face along the map's edge, facing in.
        wall(pt(a, out0), pt(b, out0), hgt + y, hgt - 0.02, inward);
      }
      steps(list, y);
    }
    // The walls of each cut, facing the road or stream.
    for (const [a, b] of cuts) {
      const ha = hAt(a - 1), hb = hAt(b);
      wall(pt(a, out0), pt(a, outE), ha + y, Math.min(ha, hAt(a)) - 0.02, ns ? [1, 0, 0] : [0, 0, 1]);
      wall(pt(b, out0), pt(b, outE), hb + y, Math.min(hb, hAt(b - 1)) - 0.02, ns ? [-1, 0, 0] : [0, 0, -1]);
    }
  }
  const add = (q: QuadList, mat: THREE.Material) => { if (q.quads) scene.add(mesh(q, patchAreaTint(mat))); };
  // A built-in tile given a picture of your own (Tiles → Picture) shows it out here too.
  const own = (key: string, roughness: number): THREE.MeshStandardMaterial | null => {
    const t = tileTextures.get(key);
    if (!t) return null;
    const span = Math.max(0.25, t.def.span || 1), m2 = t.map.clone(), n2 = t.normal.clone();
    for (const tx of [m2, n2]) { tx.repeat.set(1 / span, 1 / span); tx.needsUpdate = true; }
    const mat = new THREE.MeshStandardMaterial({ map: m2, roughness });
    registerNormalMap(mat, n2);
    return mat;
  };
  if (grounds.grass.quads) scene.add(mesh(grounds.grass, patchSeason(patchAreaTint(own('.', 1) ?? new THREE.MeshStandardMaterial({ map: makeTexture(grassTile(41), { mip: true, repeat: true }), roughness: 1 })), 'ground')));
  add(grounds.sand, own(':', 1) ?? new THREE.MeshStandardMaterial({ map: makeTexture(builtinTileArt(':'), { mip: true, repeat: true }), roughness: 1 }));
  add(grounds.snow, own('❄', 0.9) ?? new THREE.MeshStandardMaterial({ map: makeTexture(builtinTileArt('❄'), { mip: true, repeat: true }), roughness: 0.9 }));
  add(grounds.rock, own('▲', 1) ?? new THREE.MeshStandardMaterial({ map: makeTexture(builtinTileArt('▲'), { mip: true, repeat: true }), roughness: 1 }));
  add(rockTop, own('▲', 1) ?? new THREE.MeshStandardMaterial({ map: makeTexture(builtinTileArt('rock'), { mip: true, repeat: true }), roughness: 1 }));
  if (rockWall.quads) {
    const art = rockFace();
    const wallMat = new THREE.MeshStandardMaterial({ map: makeTexture(art, { repeat: true, mip: true }), roughness: 0.95 });
    registerNormalMap(wallMat, makeTexture(normalMapFrom(art, { strength: 4, wrap: true }), { linear: true, repeat: true, mip: true }));
    const m = mesh(rockWall, patchAreaTint(wallMat));
    m.castShadow = true;
    scene.add(m);
  }
  add(bed, new THREE.MeshStandardMaterial({ color: linearColor('#13283a'), roughness: 1 }));
  buildEdgeRoads(scene, map, sides, roads, tileTextures);
  if (water.quads) {
    const uv = water.uv.map((v) => v * 0.3);
    water.uv.splice(0, water.uv.length, ...uv);
    const sea = new THREE.MeshStandardMaterial({ color: linearColor('#2f6f98'), roughness: 0.55, metalness: 0, normalMap: ripple, normalScale: new THREE.Vector2(0.32, 0.32) });
    softenSpecular(sea);
    add(water, sea);
  }
}

/** Roads that reach the map edge carry on straight out over the scenery, as wide as they were painted. */
function buildEdgeRoads(scene: THREE.Object3D, map: TileMap, sides: Record<Side, BorderKind>, roads: EdgeRoad[], tileTextures: Map<string, TileTexture>): void {
  if (!roads.length) return;
  const E = 70, W = map.w, H = map.h;
  const byKey = new Map<string, { q: QuadList; edge: number[] }>();
  for (const r of roads) {
    // Grass grows over the sides only on open ground; through cliffs and over water the edges are clean.
    const open = sides[r.side] === 'grass' || sides[r.side] === 'forest' || sides[r.side] === 'meadow';
    const gk = `${r.key}|${open ? 'open' : 'clean'}`;
    let g = byKey.get(gk);
    if (!g) byKey.set(gk, (g = { q: new QuadList(), edge: [] }));
    const width = r.to - r.from + 1, a = r.from, b = r.to + 1, y = edgeHeight(map, r.side, r.from) - 0.012;
    // Corners in order, and each corner's distance to the road's two sides.
    let pts: [number, number][];
    if (r.side === 'n') pts = [[a, -E], [b, -E], [b, 0], [a, 0]];
    else if (r.side === 's') pts = [[a, H], [b, H], [b, H + E], [a, H + E]];
    else if (r.side === 'w') pts = [[-E, a], [0, a], [0, b], [-E, b]];
    else pts = [[W, a], [W + E, a], [W + E, b], [W, b]];
    const along = r.side === 'n' || r.side === 's';
    const before = g.q.pos.length;
    g.q.add(pts.map(([x, z]) => [x, y, z] as V3) as [V3, V3, V3, V3], pts.map(([x, z]) => [x, -z] as [number, number]), [0, 1, 0]);
    // QuadList may reverse the corner order to face up; read back the stored positions to pair them with edge distances.
    for (let i = before; i < g.q.pos.length; i += 3) {
      const lateral = along ? g.q.pos[i] - a : g.q.pos[i + 2] - a;
      g.edge.push(lateral, width - lateral);
    }
  }
  const grassBlend = map.tiles.blendFor('.');
  for (const [gk, { q, edge }] of byKey) {
    const [key, mode] = gk.split('|');
    const tt = tileTextures.get(key), rb = map.tiles.blendFor(key);
    let mat: THREE.MeshStandardMaterial;
    if (tt) {
      // Imported road: its own texture, repeating every `span` tiles.
      const span = Math.max(0.25, tt.def.span || 1);
      for (let i = 0; i < q.uv.length; i++) q.uv[i] /= span;
      mat = new THREE.MeshStandardMaterial({ map: tt.map, roughness: 1 });
      registerNormalMap(mat, tt.normal);
    } else {
      const art = builtinTileArt(key);
      mat = new THREE.MeshStandardMaterial({ map: makeTexture(art, { repeat: true, mip: true }), roughness: 1 });
      registerNormalMap(mat, makeTexture(normalMapFrom(art, { strength: 2, wrap: true }), { linear: true, repeat: true, mip: true }));
    }
    // Grass grows over the road's sides as it does inside the map (when both blend).
    const ragged = mode === 'open' && grassBlend.blend && rb.blend && grassBlend.priority > rb.priority;
    patchRoadEdge(patchAreaTint(mat), ragged ? grassBlend.width : 0, ragged ? grassBlend.roughness : 0);
    const m = mesh(q, mat);
    m.geometry.setAttribute('hdRoadEdge', new THREE.Float32BufferAttribute(edge, 2));
    scene.add(m);
  }
}

/** Props are drawn instanced per sprite type: a few draw calls for hundreds of objects. */
/** A stretching wall prop's height scale: from where it stands to the top of the wall behind it. */
function stretchTo(map: TileMap, p: PropData, at: { y: number; z: number }, h: number): number {
  const top = map.surfaceY(p.x, Math.floor(at.z - 0.3) + 0.5), tall = top - at.y;
  return tall > 0.2 ? tall / Math.max(0.1, h) : p.s ?? 1;
}

function buildProps(scene: THREE.Object3D, map: TileMap, data: MapData, sprites: SpriteLibrary): BuiltWorld['props'] {
  const slots: BuiltWorld['props'] = new Map();
  const placed = new Set(data.props);
  const groups = new Map<string, PropData[]>();
  const add = (p: PropData) => { const list = groups.get(p.type) ?? []; list.push(p); groups.set(p.type, list); };
  // Props standing inside a building aren't drawn (they'd poke through its walls).
  const inside = (p: PropData) => (data.buildings ?? []).some((b) => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d);
  for (const p of data.props) {
    if (inside(p)) continue;
    add(p);
    const def = sprites.def(p.type);
    // Bridges and platforms are walked on, never blocking.
    if (def?.deck) continue;
    if (def) for (const [x, z] of blockedTiles(def, p.x, p.z, p.s ?? 1, stepOf(map))) map.setBlocked(x, z, true);
    if (def) for (const b of propBoxes(def, p.x, p.z, p.s ?? 1, stepOf(map))) map.addBox(b, p);
  }
  // Bridges and platforms: walkable at their deck height, built in 3D (not as upright cards).
  buildDecks(scene, map, placeDecks(map, data, (t) => sprites.def(t)));
  for (const t of [...groups.keys()]) { const d = sprites.def(t)?.deck; if (d && !d.art) groups.delete(t); }
  // Scenery beyond the map edge, per side. The bottom side (toward the camera) is kept sparse near the
  // edge so it doesn't hide the map.
  const sides = borderSides(data.border), R = rng(data.border?.seed ?? 1);
  const roads: EdgeRoad[] = [...edgeRoads(map.w, map.h, (x, z) => map.terrain(x, z), (k) => map.tiles.isRoad(k), sides),
    ...edgeWaters(map.w, map.h, (x, z) => map.waterAt(x, z), () => 0, sides).map((r) => ({ side: r.side, key: 'water', from: r.from, to: r.to }))];
  for (let z = -4; z < map.h + 4; z++)
    for (let x = -4; x < map.w + 4; x++) {
      if (map.inMap(x, z)) continue;
      const side = sideOf(x, z, map.w, map.h), kind = sides[side];
      const near = side === 's' && z < map.h + 2;
      // Standing on the scenery's own ground: the height of the map's edge on that side (cliff tops above it).
      const base = borderHeightAt(map, x, z);
      const at = (s: number, y?: number) => ({ x: x + 0.5 + (R() - 0.5) * 0.5, z: z + 0.5 + (R() - 0.5) * 0.4, s, y: base + (y ?? 0) });
      const r = R();
      // Keep roads clear: no trees right beside them, nothing at all on them.
      if (onEdgeRoad(roads, x, z, map.w, map.h, kind === 'forest' ? 1 : 0)) continue;
      if (kind === 'forest') {
        if (r < (side === 's' ? (near ? 0 : 0.2) : 0.6)) add({ type: R() < 0.55 ? 'oak' : 'pine', ...at(0.9 + R() * 0.4) });
      } else if (kind === 'meadow') {
        if (near ? r < 0.12 : r < 0.32) {
          const k = R();
          add({ type: k < 0.08 && !near ? 'oak' : k < 0.35 ? 'bush' : k < 0.6 ? 'tuft' : k < 0.85 ? 'flowers' : 'rock', ...at(0.8 + R() * 0.4) });
        }
      } else if (kind === 'rocks') {
        if (r < 0.14) add({ type: R() < 0.6 ? 'rock' : 'pebble', ...at(0.8 + R() * 0.6, cliffHeight(side)) });
      } else if (kind === 'plains') {
        if (near ? r < 0.05 : r < 0.14) add({ type: R() < 0.7 ? 'tuft' : R() < 0.6 ? 'flowers' : 'pebble', ...at(0.8 + R() * 0.4) });
      } else if (kind === 'rocky') {
        if (near ? r < 0.06 : r < 0.22) { const k = R(); add({ type: k < 0.7 ? 'rock' : 'pebble', ...at(k < 0.3 && !near ? 1.5 + R() * 0.6 : 0.8 + R() * 0.6) }); }
      } else if (kind === 'desert') {
        if (near ? r < 0.05 : r < 0.16) { const k = R(); add({ type: k < 0.3 && !near ? 'cactus' : k < 0.6 ? 'dry_bush' : k < 0.85 ? 'sandstone' : 'pebble', ...at(0.8 + R() * 0.5) }); }
      } else if (kind === 'snow') {
        if (near ? r < 0.04 : r < 0.12) add({ type: R() < 0.3 && !near ? 'snowy_pine' : 'snow_rock', ...at(0.8 + R() * 0.5) });
      } else if (kind === 'snowforest') {
        if (r < (side === 's' ? (near ? 0 : 0.2) : 0.6)) add({ type: R() < 0.85 ? 'snowy_pine' : 'snow_rock', ...at(0.9 + R() * 0.4) });
      }
    }
  const m = new THREE.Matrix4();
  // Props on the same row are flat cards side by side, so where they overlap they'd flicker (z-fighting). Each is
  // nudged a hair toward the camera: the one further left more, so it's drawn in front; props lower down the map
  // are already in front. Two props on the very same spot keep their order too.
  const span = map.w + 8, NUDGE = 0.03 / span;
  const nudge = (p: PropData) => Math.max(0, Math.min(span, span - (p.x + 4))) * NUDGE;
  // Bridges and platforms drawn as their own picture: at the deck's height (the bank they meet), not down on the
  // ground under them; lying flat like a floor unless set to stand up.
  const deckY = (p: PropData, d: PropDef) => {
    const tiles = d.foot ? footTiles(d, p.x, p.z, p.s ?? 1) : [[Math.floor(p.x), Math.floor(p.z - 0.01)] as [number, number]];
    const ys = tiles.map(([x, z]) => map.deckAt(x, z)).filter((y): y is number => y !== null);
    return ys.length ? Math.max(...ys) : null;
  };
  // Flat mode (Update 139): the picture painted flat on the ground like a 2D game, its bottom edge at the prop's
  // front (p.z), reaching back as far as the picture is tall (a bedroll, a rug).
  for (const [type, list] of [...groups]) {
    const d = sprites.def(type);
    if (!d?.ground || sprites.model(type)) continue;
    groups.delete(type);
    const a = sprites.get(type), tex = (a.material as THREE.MeshStandardMaterial).map;
    const mat = patchFlat2D(patchAreaTint(new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.92, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }), false));
    // Update 152: they sway in the wind too, and are copies of one mesh so they can rustle and be cut like the others.
    if (d.sway) patchSway(mat, d.sway);
    const geo = new THREE.PlaneGeometry(d.w, d.h).rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const fm = new THREE.Matrix4();
    list.forEach((p, i) => {
      const s = p.s ?? 1, y = propBase(map, p, d).y;
      // Its layer (Update 144): raised a hair off the ground per layer, so overlapping flat props never flicker.
      fm.makeScale(s, 1, s).setPosition(p.x, y + 0.012 + layerNudge(p.layer ?? d.layer ?? GROUND_LAYER, p.x, p.z) * 0.4, p.z - (d.h * s) / 2);
      mesh.setMatrixAt(i, fm);
      if (placed.has(p)) slots.set(p, { mesh, index: i });
    });
    scene.add(mesh);
  }
  for (const [type, list] of [...groups]) {
    const d = sprites.def(type);
    if (!d?.deck?.art || d.deck.stand) continue;
    groups.delete(type);
    const a = sprites.get(type), tex = (a.material as THREE.MeshStandardMaterial).map;
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.92, side: THREE.DoubleSide });
    const fw = d.foot?.w ?? Math.max(1, Math.round(d.w)), fd = d.foot?.d ?? 1;
    const geo = new THREE.PlaneGeometry(fw, fd).rotateX(-Math.PI / 2);
    for (const p of list) {
      const s = p.s ?? 1, y = deckY(p, d) ?? propBase(map, p, d).y;
      const mesh = new THREE.Mesh(geo, mat);
      // The footprint's front edge is at p.z; it reaches back (north) d tiles. Just above the deck, so it isn't lost in it.
      mesh.position.set(p.x, y + 0.012, p.z - (fd * s) / 2);
      mesh.scale.set(s, 1, s);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
  // 3D props: the model, fitted to the footprint, every copy drawn at once. It stands where the picture would.
  for (const [type, list] of [...groups]) {
    const model = sprites.model(type), pdef = sprites.def(type);
    if (!model || !pdef) continue;
    groups.delete(type);
    for (const mt of model.materials) patchAreaTint(mt);
    markProp(model.materials);
    const mesh = new THREE.InstancedMesh(model.geometry, model.materials, list.length);
    mesh.castShadow = pdef.castShadow !== false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    list.forEach((p, i) => {
      const s = p.s ?? 1, at = propBase(map, p, pdef);
      m.makeScale(s, s, s);
      m.setPosition(p.x, at.y, footZ(pdef, p.x, p.z, stepOf(map)));
      mesh.setMatrixAt(i, m);
      if (placed.has(p)) slots.set(p, { mesh, index: i });
    });
    scene.add(mesh);
  }
  for (const [type, list] of groups) {
    const a = sprites.get(type), pdef = sprites.def(type), onWall = !!pdef?.wall;
    // Leaves follow the seasons (bare or snowy in winter), unless the prop says it doesn't change.
    const ps = pdef ? propSeason(pdef) : 'off';
    if (ps !== 'off') patchSeason(a.material, ps === 'bare' ? 'bare' : 'leaves');
    // Each copy's layer (Update 144): its own geometry carries how far each is pulled forward in depth.
    const geo = a.geometry.clone();
    geo.setAttribute('hdNudge', new THREE.InstancedBufferAttribute(new Float32Array(list.map((p) => layerTie(p.x, p.z))), 1));
    geo.setAttribute('hdLayer', new THREE.InstancedBufferAttribute(new Float32Array(list.map((p) => clampLayer(p.layer ?? pdef?.layer ?? GROUND_LAYER))), 1));
    const mesh = withSpriteShadows(new THREE.InstancedMesh(geo, a.material, list.length), a);
    mesh.frustumCulled = false;
    // Characters set always on top draw over it (Update 139).
    markProp(a.material);
    // Flat against a wall, a shadow would only draw a dark copy beside it.
    if (onWall) mesh.castShadow = false;
    list.forEach((p, i) => {
      const s = p.s ?? 1;
      const at = propBase(map, p, pdef);
      if (pdef?.deck?.art) { const dy = deckY(p, pdef); if (dy !== null) at.y = dy; }
      m.makeScale(s, onWall && pdef?.stretch ? stretchTo(map, p, at, pdef.h) : s, s);
      if (onWall) m.setPosition(p.x, at.y, at.z + nudge(p) * 0.3);
      else m.setPosition(p.x, at.y, p.z + nudge(p));
      mesh.setMatrixAt(i, m);
      if (placed.has(p)) slots.set(p, { mesh, index: i });
    });
    scene.add(mesh);
    // Reflections (Update 116): props standing at the water's edge, mirrored in the water in front of them.
    const mapTex = (a.material as THREE.MeshStandardMaterial).map;
    if (!onWall && !pdef?.deck && mapTex) {
      // Update 125: water up to three tiles in front counts (trees set back from the shore); the reflection starts
      // at the water's near edge, so it's never drawn over the grass between.
      const wet = list.flatMap((p) => {
        const at = propBase(map, p, pdef), cx = Math.floor(p.x), cz = Math.floor(p.z);
        if (map.waterAt(cx, cz)) return [];
        for (let k = 1; k <= 3; k++) {
          const w = map.waterAt(cx, cz + k);
          if (!w) { if (map.isBlocked(cx, cz + k) && k > 1) break; continue; }
          if (at.y < w.surface - 0.01 || at.y > w.surface + 2.5) break;
          return [{ p, y: 2 * w.surface - at.y - 0.02, z: k === 1 ? p.z + nudge(p) : cz + k + 0.02 }];
        }
        return [];
      });
      if (wet.length) {
        const rmat = patchLean(new THREE.MeshBasicMaterial({ map: mapTex, transparent: true, opacity: 0.34, alphaTest: 0.3, depthWrite: false, side: THREE.DoubleSide, color: 0xb8d4ff }));
        // The reflection follows the prop's season colours and sways in the wind with it (Update 129).
        patchAreaTint(rmat);
        if (ps !== 'off') patchSeason(rmat, ps === 'bare' ? 'bare' : 'leaves');
        if (pdef?.sway) patchSway(rmat, pdef.sway);
        const rmesh = new THREE.InstancedMesh(a.geometry, rmat, wet.length);
        rmesh.frustumCulled = false;
        rmesh.renderOrder = 1;
        wet.forEach(({ p, y, z }, i) => { const sc = p.s ?? 1; m.makeScale(sc, -sc, -sc); m.setPosition(p.x, y, z); rmesh.setMatrixAt(i, m); });
        scene.add(rmesh);
      }
    }
  }
  return slots;
}

/** Remove one prop from view (cut down): its instance shrinks to nothing. */
export function hideProp(slot: { mesh: THREE.InstancedMesh; index: number }): void {
  slot.mesh.setMatrixAt(slot.index, new THREE.Matrix4().makeScale(0, 0, 0));
  slot.mesh.instanceMatrix.needsUpdate = true;
}

/**
 * Cliff and side walls (Update 112): lighter at the top, darker at the foot, like light falling on them from above.
 * Each wall quad's corners get a brightness by how high up the wall they are.
 */
function shadeWall(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute, n = pos.count, col = new Float32Array(n * 3);
  // The wall's top and foot near each corner (corners within a little of it), so a jagged rock face made of many
  // small pieces shades as one wall rather than in bands.
  const C = 0.5, buckets = new Map<string, number[]>();
  for (let i = 0; i < n; i++) { const k = `${Math.floor(pos.getX(i) / C)},${Math.floor(pos.getZ(i) / C)}`; let b = buckets.get(k); if (!b) buckets.set(k, (b = [])); b.push(i); }
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), bx = Math.floor(x / C), bz = Math.floor(z / C);
    let lo = y, hi = y;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of buckets.get(`${bx + dx},${bz + dz}`) ?? []) {
      if (Math.abs(pos.getX(j) - x) > 0.45 || Math.abs(pos.getZ(j) - z) > 0.45) continue;
      const yj = pos.getY(j); if (yj < lo) lo = yj; if (yj > hi) hi = yj;
    }
    const span = hi - lo, t = span > 1e-4 ? (y - lo) / span : 1;
    // The foot about a third darker (taller walls a little more), the top a touch brighter.
    const dark = Math.min(0.5, 0.3 + span * 0.08), v = 1.06 - dark * (1 - t);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
