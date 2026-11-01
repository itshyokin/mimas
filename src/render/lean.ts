/**
 * Sprites lean back toward the overworld camera (Database → Camera → Lean), so seen from a high camera they keep their
 * height and stand over their tile like the handheld games' sprites. Done in the vertex shader for every sprite (and
 * its shadow materials), turning about the sprite's base; battle maps set it back to upright.
 */
import * as THREE from 'three';

/** How far the ground gives way with Characters always on top off (Update 142): low ledges only. */
const GROUND_YIELD_OFF = 1.0;
const uniforms = { uHdLean: { value: 0 }, uHdYield: { value: GROUND_YIELD_OFF }, uHdBack: { value: 0 }, uHd2D: { value: 0 }, uHdPlayer: { value: 10 } };

/**
 * Characters always on top (Update 142): how far the ground (and props not drawn in front of tiles) are pushed back
 * in depth, so characters show over them. 0 (off): everything sorts as it really stands (a tree or a ledge in front
 * of a character hides them); the upright depth still keeps leaned sprites from tucking into a wall behind them.
 */
export function setGroundYield(on: boolean): void {
  // The ground always gives way a little (a leaned sprite's lower half over a low ledge behind it would sort behind
  // it otherwise); all the way only with the option on. Props not drawn in front of tiles only with it on.
  uniforms.uHdYield.value = on ? GROUND_YIELD : GROUND_YIELD_OFF;
  uniforms.uHdBack.value = on ? GROUND_YIELD : 0;
}


/** The lean now, in radians (0: upright). */
export function setLean(radians: number): void { uniforms.uHdLean.value = radians; }
/** 2D mode (Update 145): draw order by layer (characters on `playerLayer`), then by position on the same layer. */
export function setView2D(on: boolean, playerLayer: number): void { uniforms.uHd2D.value = on ? 1 : 0; uniforms.uHdPlayer.value = playerLayer; }
/** The lean now (radians). */
export const leanNow = (): number => uniforms.uHdLean.value;

/**
 * Lean a separate object that belongs with a sprite standing at `base` (a weapon on its back, a fire in its hand):
 * up the leaned sprite instead of straight up, and tilted back the same. Call after placing it upright.
 */
export function leanWith(o: THREE.Object3D, base: THREE.Vector3): void {
  const a = uniforms.uHdLean.value;
  o.rotation.x = -a;
  if (!a) return;
  const dy = o.position.y - base.y;
  o.position.y = base.y + dy * Math.cos(a);
  o.position.z -= dy * Math.sin(a);
}

/** Make a sprite material lean with the camera. */
export function patchLean<T extends THREE.Material>(mat: T): T {
  if (mat.userData.hdLean) return mat;
  mat.userData.hdLean = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    // Flat on a wall (ladders, wall torches, windows): stays upright against it.
    if (mat.userData.noLean) {
      // Not drawn in front of tiles: pushed back like the ground, so it sorts with it as it really stands.
      if (mat.userData.hdBack) { Object.assign(shader.uniforms, uniforms); shader.vertexShader = 'uniform float uHdLean;\nuniform float uHdYield;\nuniform float uHdBack;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  if (uHdLean > 0.0) {
    vec4 hdBack = projectionMatrix * vec4(mvPosition.xyz * (1.0 + uHdBack / max(0.001, length(mvPosition.xyz))), 1.0);
    gl_Position.z = hdBack.z / hdBack.w * gl_Position.w;
  }`); }
      return;
    }
    Object.assign(shader.uniforms, uniforms);
    // A prop set not to be drawn in front of tiles (PropDef.frontOfTiles false) is pushed back as far as the ground is.
    const back = mat.userData.hdBack ? `hdUp.xyz *= 1.0 + uHdBack / max(0.001, length(hdUp.xyz));` : '';
    // Drawn leaning, but at the depth it would have standing up: terrain behind a sprite (a cliff wall, a bevel)
    // never cuts through its leaned-back top, while anything really in front of it still hides it.
    // Update 144: props' layers, per copy (hdNudge, world units pulled toward the camera in depth only).
    // Update 145: hdLayer, the copy's layer; hdNudge, a tiny difference between overlapping neighbours.
    shader.vertexShader = 'uniform float uHdLean;\nuniform float uHdYield;\nuniform float uHdBack;\nuniform float uHd2D;\nuniform float uHdPlayer;\n#ifdef USE_INSTANCING\nattribute float hdNudge;\nattribute float hdLayer;\n#endif\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vec3 hdUpright = transformed;
  { float hdLy = transformed.y; transformed.y = hdLy * cos(uHdLean); transformed.z -= hdLy * sin(uHdLean); }`).replace('#include <project_vertex>', `#include <project_vertex>
  // Update 151: 2D, feet on the bottom edge of their cell like RPG Maker (drawn half a tile further south).
  if (uHd2D > 0.5) { mvPosition.xyz += (viewMatrix * vec4(0.0, 0.0, 0.5, 0.0)).xyz; gl_Position = projectionMatrix * mvPosition; }
  // Pulled toward the camera in depth only: 3D, props by layer (characters not); 2D (Update 145), everything by
  // layer (characters on the player's), then further south in front, all at the depth of the ground they stand on.
  float hdN = 0.0, hdF = 0.0, hdL = uHdPlayer;
  #ifdef USE_INSTANCING
  hdN = hdNudge; hdL = hdLayer;
  #endif
  vec3 hdStand = hdUpright;
  // Not in the shadow pass: shadows keep the sprites' real depth.
  #if defined(DEPTH_PACKING) || defined(DISTANCE)
  float hd2D = 0.0;
  #else
  float hd2D = uHd2D;
  #endif
  if (hd2D > 0.5) {
    vec4 hdBase = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
    hdBase = instanceMatrix * hdBase;
    #endif
    hdBase = modelMatrix * hdBase;
    // A share of the distance to the camera (the 2D camera keeps its near plane close to the ground for precision).
    hdF = (25.0 - hdL) * 0.012 + clamp(hdBase.z, 0.0, 400.0) * 0.00002 + hdN * 0.0001;
    hdN = 0.0;
    hdStand.y = 0.0;
  }
  #ifdef USE_INSTANCING
  else hdN += (25.0 - hdL) * 0.01;
  #endif
  if (uHdLean > 0.0 || hdN > 0.0 || hdF > 0.0) {
    vec4 hdUp = vec4(hdStand, 1.0);
    #ifdef USE_INSTANCING
    hdUp = instanceMatrix * hdUp;
    #endif
    hdUp = modelViewMatrix * hdUp;
    ${back}
    hdUp.xyz *= (1.0 - hdN / max(0.001, length(hdUp.xyz))) * (1.0 - hdF);
    hdUp = projectionMatrix * hdUp;
    gl_Position.z = hdUp.z / hdUp.w * gl_Position.w;
  }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + (mat.userData.noLean ? '|nolean' : '|lean') + (mat.userData.hdBack ? '|back' : '');
  return mat;
}

/** How far terrain is pushed back in depth on the map (world units): characters and props a ledge would hide show. */
export const GROUND_YIELD = 3.5;

/**
 * Terrain on the map (ground, cliff walls, water, the scenery round the edge) gives way to characters and props:
 * it's drawn where it is, but GROUND_YIELD further from the camera in depth, so a sprite just behind a ledge or
 * against a tall cliff stays in view like the handheld games (nothing hides behind the ground). Off on battle maps
 * (no lean there). Ground still hides ground, in order, and buildings aren't pushed (walking behind a house hides you).
 */
export function patchGroundYield<T extends THREE.Material>(mat: T): T {
  if (mat.userData.hdYield) return mat;
  mat.userData.hdYield = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    if (!shader.vertexShader.includes('#include <project_vertex>')) return;
    shader.vertexShader = (shader.vertexShader.includes('uniform float uHdLean;') ? '' : 'uniform float uHdLean;\nuniform float uHdYield;\n') + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  if (uHdLean > 0.0) {
    vec4 hdBack = projectionMatrix * vec4(mvPosition.xyz * (1.0 + uHdYield / max(0.001, length(mvPosition.xyz))), 1.0);
    gl_Position.z = hdBack.z / hdBack.w * gl_Position.w;
  }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|yield';
  return mat;
}

/** The ground layer: props placed without one (Update 144). */
export const GROUND_LAYER = 25;
/**
 * How far a prop is pulled toward the camera in depth for its layer (Update 144), plus a tiny difference between
 * neighbours on the same layer so overlapping copies never flicker (z-fighting).
 */
export function layerNudge(layer: number, x: number, z: number): number {
  return (GROUND_LAYER - clampLayer(layer)) * 0.01 + layerTie(x, z);
}
export const clampLayer = (layer: number): number => Math.max(0, Math.min(GROUND_LAYER, Math.round(layer)));
/** The tiny difference between neighbours on the same layer (the shader adds the layer's own step). */
export function layerTie(x: number, z: number): number {
  return ((((Math.floor(x * 2) * 7 + Math.floor(z * 2) * 3) % 5) + 5) % 5) * 0.0018;
}

/** The stencil value props write (Update 139). */
export const PROP_STENCIL = 1;
/** Mark a prop material so characters set always on top draw over it. */
export function markProp(m: THREE.Material | THREE.Material[]): void {
  for (const x of Array.isArray(m) ? m : [m]) { x.stencilWrite = true; x.stencilRef = PROP_STENCIL; x.stencilFunc = THREE.AlwaysStencilFunc; x.stencilZPass = THREE.ReplaceStencilOp; }
}

/**
 * Flat-mode props (Update 152): in 2D mode drawn half a tile further south like the standing ones, so their bottom
 * edge sits on the bottom edge of their cell.
 */
export function patchFlat2D<T extends THREE.Material>(mat: T): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uHd2D = uniforms.uHd2D;
    shader.vertexShader = 'uniform float uHd2D;\n' + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  if (uHd2D > 0.5) { mvPosition.xyz += (viewMatrix * vec4(0.0, 0.0, 0.5, 0.0)).xyz; gl_Position = projectionMatrix * mvPosition; }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|flat2d';
  return mat;
}
