/**
 * Wind: one breeze for the whole map (a direction and a strength that gusts), shared by everything that sways
 * (trees, bushes, grass tufts, flowers — props marked "sways in the wind") and by weather drifting in it.
 *
 * Swaying is done in the vertex shader, so it costs nothing per prop on the CPU: the top of the sprite moves, the
 * base stays put (the trunk, where it blocks), each prop a little out of step with its neighbours.
 */
import * as THREE from 'three';

const uniforms = {
  uSwayTime: { value: 0 },
  /** x, z: direction (unit); y: strength now (0 – 1.5, gusts included). */
  uWind: { value: new THREE.Vector3(1, 0.3, 0) },
};

/** The breeze right now (for weather). */
export const wind = { dx: 1, dz: 0, strength: 0.3 };

/** Move time on and set the breeze: `base` is the map's strength (0 calm … 1 stormy), `deg` where it blows to. */
export function updateWind(time: number, base: number, deg: number): void {
  const a = (deg * Math.PI) / 180;
  // Gusts: slow swells with a quicker flutter on top.
  const gust = 0.75 + 0.18 * Math.sin(time * 0.37) + 0.07 * Math.sin(time * 1.9 + 1.3);
  const s = Math.max(0, base) * gust;
  wind.dx = Math.cos(a); wind.dz = Math.sin(a); wind.strength = s;
  uniforms.uSwayTime.value = time;
  uniforms.uWind.value.set(wind.dx, s, wind.dz);
}

const VERT_HEAD = `uniform float uSwayTime;\nuniform vec3 uWind;\n`;

/** The sway, applied to the vertex in the sprite's own space (y up from its base, x across). */
const swayBody = (amount: number) => `
  {
    #ifdef USE_INSTANCING
      vec4 swBase = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    #else
      vec4 swBase = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    #endif
    float swW = clamp(uv.y, 0.0, 1.0);
    swW = swW * swW;
    float swPhase = swBase.x * 0.9 + swBase.z * 0.6;
    float swS = uWind.y * ${amount.toFixed(3)};
    // A lean with the wind, and a sway that grows with it (faster in strong wind).
    float swSway = sin(uSwayTime * (1.3 + swS * 1.4) + swPhase) * (0.04 + 0.1 * swS) + sin(uSwayTime * 3.1 + swPhase * 1.7) * 0.015 * swS;
    float swLean = swS * 0.08;
    transformed.x += (swSway + swLean * uWind.x) * swW;
  }
`;

/** Make a sprite material (and its shadow materials) sway in the wind. `amount`: 1 for trees, less for stiff things. */
export function patchSway<T extends THREE.Material>(mat: T, amount = 1): T {
  if (mat.userData.hdSway) return mat;
  mat.userData.hdSway = amount;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n${swayBody(amount)}`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `|sway${amount}`;
  return mat;
}

/**
 * Foliage on 3D models (Update 154, materials named "…_foliage"): sways in the wind in world space. How much each
 * part moves follows the model's vertex colour red when it has vertex colours (paint the trunk black, leaf tips red),
 * otherwise everything sways a little.
 */
export function patchSwayModel<T extends THREE.Material>(mat: T, amount = 1): T {
  if (mat.userData.hdSwayModel) return mat;
  mat.userData.hdSwayModel = amount;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', `
  {
    #ifdef USE_COLOR
      float swW = vColor.r;
    #else
      float swW = 0.6;
    #endif
    vec4 swWorld = modelMatrix * vec4(transformed, 1.0);
    float swPhase = swWorld.x * 0.7 + swWorld.z * 0.5;
    float swS = uWind.y * ${amount.toFixed(3)};
    float swSway = sin(uSwayTime * (1.3 + swS * 1.4) + swPhase) * (0.03 + 0.07 * swS) + sin(uSwayTime * 3.4 + swPhase * 2.1) * 0.015 * swS;
    vec3 swOff = vec3(uWind.x, 0.0, uWind.z) * (swSway + swS * 0.05) * swW;
    transformed += (inverse(mat3(modelMatrix)) * swOff);
  }
#include <project_vertex>`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `|swaym${amount}`;
  return mat;
}
