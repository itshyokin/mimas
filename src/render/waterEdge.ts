/**
 * Soft shorelines: water is drawn a little past its own cells onto the bank around it, and cut to
 * a rounded, pixel-stepped edge there. That rounds off the bank's corners and hides the square
 * cell edges, while water cells themselves always stay fully covered (so a basin's walls never
 * show through a gap).
 *
 * The shape comes from a small mask texture (one texel per cell, 1 = water), sampled with linear
 * filtering: halfway between a water cell and a dry one the mask is 0.5, and in a bank corner with
 * water on three sides it is 0.75, so the threshold rounds those corners over. Water cells themselves
 * are marked with a per-vertex flag (hdWaterForce = 1) and never cut.
 */
import * as THREE from 'three';
import type { TileMap } from '../world/TileMap';

/** Pixels per tile for the stepped edge (matches the ground art). */
const PIXELS = 16;

/** Build the water mask for a map: one texel per cell plus a one-cell border, linear filtered. */
export function waterMask(map: TileMap): THREE.DataTexture {
  const W = map.w + 2, H = map.h + 2;
  const data = new Uint8Array(W * H * 4);
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      // The border repeats the edge cells: water running off the map carries on (no foam line along the map edge).
      const v = map.waterAt(Math.max(0, Math.min(map.w - 1, x - 1)), Math.max(0, Math.min(map.h - 1, z - 1))) ? 255 : 0;
      const i = (z * W + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const FRAG_HEAD = (n: number) => `
varying float vHdWaterForce;
uniform sampler2D uHdWaterMask;
uniform vec2 uHdWaterSize;
float hdWaterHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hdWaterNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hdWaterHash(i), hdWaterHash(i + vec2(1.0, 0.0)), f.x),
             mix(hdWaterHash(i + vec2(0.0, 1.0)), hdWaterHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
/** 1 where this point is water, 0 where it should be cut away. */
float hdWaterKeep(vec2 p) {
  // On the bank: snap to the pixel grid, then compare the smooth mask against a noisy threshold.
  vec2 q = (floor(p * ${n}.0) + 0.5) / ${n}.0;
  float m = texture2D(uHdWaterMask, (q + 1.0) / uHdWaterSize).r;
  float jitter = (hdWaterNoise(q * 3.1) - 0.5) * 0.28;
  return step(0.44 + jitter, m);
}
`;

/**
 * Cut a water material to its rounded shoreline. Call after `patchAreaTint`, whose world-position
 * varying (vHdWorld) it reuses.
 */
export function patchWaterEdge<T extends THREE.Material>(mat: T, mask: THREE.DataTexture): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uHdWaterMask = { value: mask };
    shader.uniforms.uHdWaterSize = { value: new THREE.Vector2(mask.image.width, mask.image.height) };
    shader.vertexShader = 'attribute float hdWaterForce;\nvarying float vHdWaterForce;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHdWaterForce = hdWaterForce;');
    // Water cells (force 1) are always drawn; pieces lapping over a bank are cut to the shoreline.
    shader.fragmentShader = FRAG_HEAD(PIXELS) + shader.fragmentShader.replace(
      'void main() {',
      'void main() {\n  if (vHdWaterForce < 0.5 && hdWaterKeep(vHdWorld) < 0.5) discard;',
    );
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|hdWaterEdge';
  return mat;
}

/** Seconds, for toon water's drifting lines and breathing foam (Game advances it). */
export const toonWaterTime = { value: 0 };

export interface ToonWater {
  /** Wave lines and foam, in linear colour. */
  line: THREE.Color;
  foam: THREE.Color;
  /** How many wave lines, 0 … 1. */
  lines: number;
  foamOn: boolean;
  /** Which way and how fast the lines drift (tiles per second). */
  drift: THREE.Vector2;
}

const TOON_HEAD = `
uniform float uToonTime;
uniform vec3 uToonLine;
uniform vec3 uToonFoam;
uniform float uToonLines;
uniform float uToonFoamOn;
uniform vec2 uToonDrift;
/** 1 on a wave line: short pixel dashes with a step in the middle (a flattened ~), staggered, drifting, breathing. */
float hdToonWave(vec2 w) {
  vec2 p = floor(w * ${PIXELS}.0 - uToonDrift * uToonTime * ${PIXELS}.0);
  float row = floor(p.y / 9.0);
  float x = p.x + row * 13.0;
  vec2 cell = vec2(floor(x / 26.0), row);
  float h = hdWaterHash(cell), h2 = hdWaterHash(cell + 17.3), h3 = hdWaterHash(cell + 41.9);
  if (h > uToonLines) return 0.0;
  float breathe = 0.55 + 0.45 * sin(uToonTime * (1.1 + h2) + h3 * 6.2832);
  float len = floor((5.0 + h2 * 6.0) * breathe);
  if (len < 2.0) return 0.0;
  float start = floor(h3 * (24.0 - len));
  float lx = x - cell.x * 26.0 - start, ly = p.y - row * 9.0;
  if (lx < 0.0 || lx >= len) return 0.0;
  return ly == (lx < floor(len * 0.5) ? 5.0 : 4.0) ? 1.0 : 0.0;
}
/** 1 in the foam band along the shore (the mask falls off near dry cells). */
float hdToonFoam(vec2 w) {
  vec2 q = (floor(w * ${PIXELS}.0) + 0.5) / ${PIXELS}.0;
  float m = texture2D(uHdWaterMask, (q + 1.0) / uHdWaterSize).r;
  float edge = 0.64 + 0.05 * sin(uToonTime * 1.8 + hdWaterNoise(q * 2.3) * 6.2832);
  return m < edge ? 1.0 : 0.0;
}
`;

/**
 * Toon water (like the handheld games): a flat colour with drifting wave lines and a foam outline along the shore.
 * Call after `patchWaterEdge` (it uses the shoreline mask).
 */
export function patchToonWater<T extends THREE.Material>(mat: T, t: ToonWater): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uToonTime = toonWaterTime;
    shader.uniforms.uToonLine = { value: t.line };
    shader.uniforms.uToonFoam = { value: t.foam };
    shader.uniforms.uToonLines = { value: t.lines };
    shader.uniforms.uToonFoamOn = { value: t.foamOn ? 1 : 0 };
    shader.uniforms.uToonDrift = { value: t.drift };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', TOON_HEAD + 'void main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    float hdFoam = uToonFoamOn * hdToonFoam(vHdWorld);
    float hdWave = hdToonWave(vHdWorld) * (1.0 - hdFoam);
    diffuseColor.rgb = mix(diffuseColor.rgb, uToonLine, hdWave);
    diffuseColor.rgb = mix(diffuseColor.rgb, uToonFoam, hdFoam);
    diffuseColor.a = mix(diffuseColor.a, max(diffuseColor.a, 0.92), max(hdFoam, hdWave * 0.6));
  }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|hdToon';
  return mat;
}
