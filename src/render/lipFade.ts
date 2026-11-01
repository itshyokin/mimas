/**
 * Soft blocky's grass lip: the top's ground folded over the cliff edge, breaking up in square pixels the further down
 * it goes (each vertex's `fade`: 0 at the edge, 1 at the lip's foot), like the dithered blend between tiles.
 */
import * as THREE from 'three';

/** Pixels per tile in the dither (chunky, about the size of the tile art's pixels). */
const DITHER = 8;

export function patchLip<T extends THREE.Material>(mat: T): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.vertexShader = 'attribute float fade;\nvarying float vLipFade;\nvarying vec3 vLipW;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vLipFade = fade;
  vLipW = (modelMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = 'varying float vLipFade;\nvarying vec3 vLipW;\n' + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  {
    // A pixel grid running along the wall (x + z) and down it (y); each pixel gives up at its own depth.
    vec2 cell = floor(vec2(vLipW.x + vLipW.z, vLipW.y) * ${DITHER.toFixed(1)});
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    if (vLipFade > 0.2 + 0.8 * h) discard;
  }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|lip';
  return mat;
}
