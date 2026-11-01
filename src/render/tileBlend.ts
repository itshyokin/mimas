/**
 * Soft edges for imported tiles. Each imported tile's overlay also covers the neighbouring cells it
 * may spread into; this shader trims it to an irregular edge there, and pulls it back where a
 * higher-priority built-in tile spreads into it. Same rules as the painted ground (world/blend.ts).
 *
 * A small mask texture (one texel per cell, plus a border) tells the shader about each cell:
 *   R  1 if the cell is this tile
 *   G  for a blending built-in tile with a higher priority: its width / 0.5 (else 0)
 *   B  that tile's roughness
 *   A  the cell's level (height and wetness), so edges never cross a cliff or a shoreline
 */
import * as THREE from 'three';
import type { TileMap } from '../world/TileMap';
import type { TileBlend } from '../world/types';

export function blendMask(map: TileMap, key: string): THREE.DataTexture {
  const W = map.w + 2, H = map.h + 2, cat = map.tiles, me = cat.blendFor(key);
  const data = new Uint8Array(W * H * 4);
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++) {
      const cx = x - 1, cz = z - 1, i = (z * W + x) * 4;
      if (!map.inMap(cx, cz)) continue;
      const k = map.terrain(cx, cz), b = cat.blendFor(k);
      data[i] = k === key ? 255 : 0;
      if (k !== key && !cat.isCustom(k) && b.blend && b.priority > me.priority) {
        data[i + 1] = Math.round(Math.min(1, b.width / 0.5) * 255);
        data[i + 2] = Math.round(b.roughness * 255);
      }
      // Level: height step (−10…10) and wet/dry, packed into one byte.
      data[i + 3] = (map.step(cx, cz) + 10) * 6 + (map.waterAt(cx, cz) ? 3 : 0);
    }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const EDGE = { ragged: 0, dither: 1, smooth: 2 } as const;

export const BLEND_GLSL = `
uniform sampler2D uTbMask;
uniform vec2 uTbSize;
uniform float uTbWidth, uTbRough, uTbEdge, uTbPpt, uTbDetail;
vec4 tbCell(vec2 c) { return texture2D(uTbMask, (c + 1.5) / uTbSize); }
float tbHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tbNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tbHash(i), tbHash(i + vec2(1.0, 0.0)), f.x), mix(tbHash(i + vec2(0.0, 1.0)), tbHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float tbBayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float tbBayer4(vec2 a) { return tbBayer2(0.5 * a) * 0.25 + tbBayer2(a); }
float tbDist(vec2 p, vec2 c) { vec2 d = max(max(c - p, p - (c + 1.0)), vec2(0.0)); return length(d); }
/** How much of this tile shows at world point w (0 – 1), given the texture's brightness there. */
float tbKeep(vec2 w, float lum) {
  vec2 cell = floor(w);
  // Ragged and dithered edges step in the texture's own pixels; smooth ones don't.
  vec2 p = uTbEdge < 1.5 ? (floor(w * uTbPpt) + 0.5) / uTbPpt : w;
  float n = tbNoise(p * 2.3) * 0.75 + tbHash(floor(p * uTbPpt)) * 0.25;
  float dith = uTbEdge > 0.5 && uTbEdge < 1.5 ? (tbBayer4(p * uTbPpt) - 0.5) * 0.18 : 0.0;
  float det = uTbDetail * (lum - 0.5) * 0.35;
  vec4 own = tbCell(cell);
  float keep;
  if (own.r > 0.5) {
    // Our own cell: give way where a higher-priority built-in tile reaches in.
    keep = 1.0;
    for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dz == 0) continue;
      vec2 c = cell + vec2(float(dx), float(dz));
      vec4 t = tbCell(c);
      if (t.g <= 0.0 || abs(t.a - own.a) > 0.002) continue;
      float r = t.g * 0.5 * (1.0 + t.b * (2.0 * n - 1.0)) + dith - det;
      float s = tbDist(p, c) - r;
      keep = min(keep, uTbEdge > 1.5 ? smoothstep(-0.1, 0.1, s) : step(0.0, s));
    }
  } else {
    // A neighbour's cell: reach in from our cells next to it.
    keep = 0.0;
    for (int dz = -1; dz <= 1; dz++) for (int dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dz == 0) continue;
      vec2 c = cell + vec2(float(dx), float(dz));
      vec4 t = tbCell(c);
      if (t.r < 0.5 || abs(t.a - own.a) > 0.002) continue;
      float r = uTbWidth * (1.0 + uTbRough * (2.0 * n - 1.0)) + dith + det;
      float s = r - tbDist(p, c);
      keep = max(keep, uTbEdge > 1.5 ? smoothstep(-0.1, 0.1, s) : step(0.0, s));
    }
  }
  return keep;
}
`;

/**
 * Trim an imported tile's overlay material to its blended edges. `ppt` is the texture's pixels per tile.
 * Call after patchAreaTint (it reuses its world-position varying).
 */
export function patchTileBlend<T extends THREE.MeshStandardMaterial>(mat: T, mask: THREE.DataTexture, b: TileBlend, ppt: number): T {
  if (b.edge === 'smooth') { mat.transparent = true; mat.depthWrite = false; }
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, {
      uTbMask: { value: mask },
      uTbSize: { value: new THREE.Vector2(mask.image.width, mask.image.height) },
      uTbWidth: { value: b.width }, uTbRough: { value: b.roughness }, uTbEdge: { value: EDGE[b.edge] },
      uTbPpt: { value: Math.max(1, ppt) }, uTbDetail: { value: b.detail ? 1 : 0 },
    });
    shader.fragmentShader = BLEND_GLSL + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  {
    float tbK = tbKeep(vHdWorld, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
    if (tbK < 0.01) discard;
    diffuseColor.a *= tbK;
  }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|hdTileBlend';
  return mat;
}
