/**
 * Area lights ("local tint"): up to MAX_AREAS rectangles or ellipses on the ground that tint,
 * brighten or shade everything inside them, fading out over a soft edge.
 *
 * Cloud shadows ride along: soft patches of shade drifting with the wind, taking away sunlight (direct light) only.
 *
 * They are not real lights: every lit material gets a few lines added to its shader that
 * multiply the final colour by the tint of any area the pixel is in. That makes them nearly free.
 */
import * as THREE from 'three';

export const MAX_AREAS = 8;

export interface AreaUniform {
  /** Centre in world units (x, z). */
  x: number; z: number;
  /** Half size in world units. */
  hw: number; hh: number;
  ellipse: boolean;
  feather: number;
  /** Linear colour × brightness. */
  color: THREE.Color;
  /** 0 = off, 1 = full strength (schedule / switch fade). */
  amount: number;
}

const uniforms = {
  uHdAreaCount: { value: 0 },
  uHdAreaRect: { value: Array.from({ length: MAX_AREAS }, () => new THREE.Vector4()) },
  uHdAreaParam: { value: Array.from({ length: MAX_AREAS }, () => new THREE.Vector4()) },
  uHdAreaColor: { value: Array.from({ length: MAX_AREAS }, () => new THREE.Color(1, 1, 1)) },
  /** Cloud shadows: drift offset (x, z), strength (0 = none), scale (1 / cloud size in tiles). */
  uHdCloud: { value: new THREE.Vector4(0, 0, 0, 1 / 9) },
  /** What the moving shadows are: 0 clouds, 1 a tree canopy's dappled shade, 2 beams of light (brightening). */
  uHdCloudKind: { value: 0 },
};

const VERT_HEAD = 'varying vec2 vHdWorld;\nuniform vec2 uHdOrigin;\n';
const VERT_BODY = `#include <project_vertex>
{
  vec4 hdWp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    hdWp = instanceMatrix * hdWp;
  #endif
  vHdWorld = (modelMatrix * hdWp).xz - uHdOrigin;
}`;

/**
 * A map drawn beside the current one (a seamless neighbour) sits away from the world's origin, but its shoreline and
 * tile-blend masks work in its own tile coordinates: materials built for it take its offset (set by buildWorld while
 * it builds), so vHdWorld stays map-local. Shared materials (sprites) always use the world's coordinates.
 */
let buildOrigin: THREE.Vector2 | null = null;
const ZERO = new THREE.Vector2();
export function setBuildOrigin(v: THREE.Vector2 | null): void { buildOrigin = v; }

const FRAG_HEAD = `
uniform int uHdAreaCount;
uniform vec4 uHdAreaRect[${MAX_AREAS}];
uniform vec4 uHdAreaParam[${MAX_AREAS}];
uniform vec3 uHdAreaColor[${MAX_AREAS}];
varying vec2 vHdWorld;
uniform vec4 uHdCloud;
uniform int uHdCloudKind;
float hdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hdNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hdHash(i), hdHash(i + vec2(1.0, 0.0)), f.x), mix(hdHash(i + vec2(0.0, 1.0)), hdHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float hdCloud(vec2 p) {
  if (uHdCloud.z <= 0.0) return 1.0;
  if (uHdCloudKind == 1) {
    // A canopy overhead: dappled shade, small leafy patches with gaps of sun, swaying a little in the breeze.
    vec2 q = p * 0.9 + uHdCloud.xy;
    float n = hdNoise(q) * 0.55 + hdNoise(q * 2.3 + 5.1) * 0.3 + hdNoise(q * 5.1 + 1.7) * 0.15;
    return 1.0 - uHdCloud.z * smoothstep(0.36, 0.5, n);
  }
  if (uHdCloudKind == 2) {
    // Beams of light: soft diagonal bands of extra light, slowly sliding, broken up a little.
    float b = sin((p.x * 0.55 + p.y * 0.35) + uHdCloud.x * 0.6 + hdNoise(p * 0.25) * 1.5);
    return 1.0 + uHdCloud.z * 0.9 * smoothstep(0.55, 0.95, b);
  }
  vec2 q = (p + uHdCloud.xy) * uHdCloud.w;
  float n = hdNoise(q) * 0.6 + hdNoise(q * 2.1 + 7.3) * 0.28 + hdNoise(q * 4.3 + 3.1) * 0.12;
  return 1.0 - uHdCloud.z * smoothstep(0.5, 0.62, n);
}
vec3 hdAreaTint(vec2 p) {
  vec3 m = vec3(1.0);
  for (int i = 0; i < ${MAX_AREAS}; i++) {
    if (i >= uHdAreaCount) break;
    vec4 r = uHdAreaRect[i];
    vec4 q = uHdAreaParam[i];
    vec2 d = abs(p - r.xy);
    float f = max(q.y, 0.001);
    float inside;
    if (q.x < 0.5) {
      // Rectangle: full strength inside the rectangle shrunk by the feather, fading to 0 at the edge.
      vec2 e = d - max(r.zw - f, vec2(0.0));
      inside = 1.0 - smoothstep(0.0, f, length(max(e, vec2(0.0))));
    } else {
      vec2 n = d / max(r.zw, vec2(0.001));
      float fe = clamp(f / max(min(r.z, r.w), 0.001), 0.001, 1.0);
      inside = 1.0 - smoothstep(1.0 - fe, 1.0, length(n));
    }
    m *= mix(vec3(1.0), uHdAreaColor[i], inside * q.w);
  }
  return m;
}
`;

/** Add area-tint support to a lit material. Safe to call more than once. */
export function patchAreaTint<T extends THREE.Material>(mat: T, local = true): T {
  if (mat.userData.hdArea) return mat;
  mat.userData.hdArea = true;
  const origin = (local && buildOrigin) || ZERO;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uHdOrigin = { value: origin };
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', VERT_BODY);
    shader.fragmentShader = FRAG_HEAD + shader.fragmentShader.replace(
      '#include <output_fragment>',
      'outgoingLight *= hdAreaTint(vHdWorld);\n#include <output_fragment>',
    ).replace(
      '#include <lights_fragment_end>',
      '#include <lights_fragment_end>\n  { float hdC = hdCloud(vHdWorld); reflectedLight.directDiffuse *= hdC; reflectedLight.directSpecular *= hdC; reflectedLight.indirectDiffuse *= mix(1.0, hdC, 0.35); }',
    );
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|hdArea';
  return mat;
}

/** Cloud shadows: where the pattern has drifted to, and how dark (0: none). */
export function setClouds(offX: number, offZ: number, strength: number, kind: 'clouds' | 'canopy' | 'beams' = 'clouds'): void {
  uniforms.uHdCloud.value.set(offX, offZ, strength, 1 / 7);
  uniforms.uHdCloudKind.value = kind === 'canopy' ? 1 : kind === 'beams' ? 2 : 0;
}

/** Upload the current areas. Extra areas beyond MAX_AREAS are ignored. */
export function setAreas(areas: AreaUniform[]): void {
  const n = Math.min(areas.length, MAX_AREAS);
  uniforms.uHdAreaCount.value = n;
  for (let i = 0; i < n; i++) {
    const a = areas[i];
    uniforms.uHdAreaRect.value[i].set(a.x, a.z, a.hw, a.hh);
    uniforms.uHdAreaParam.value[i].set(a.ellipse ? 1 : 0, a.feather, 0, a.amount);
    uniforms.uHdAreaColor.value[i].copy(a.color);
  }
}
