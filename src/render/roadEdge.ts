/**
 * Ragged sides for roads that continue past the map edge: grass eats into the road's sides along a noisy,
 * pixel-stepped line, like the blended edges inside the map. Each vertex carries its distance to the road's
 * left and right sides (hdRoadEdge), so the shader knows how close to a side each pixel is.
 * Call after patchAreaTint (it reuses its world-position varying).
 */
import * as THREE from 'three';

export function patchRoadEdge<T extends THREE.Material>(mat: T, width: number, roughness: number): T {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.uniforms.uRoadW = { value: width };
    shader.uniforms.uRoadR = { value: roughness };
    shader.vertexShader = 'attribute vec2 hdRoadEdge;\nvarying vec2 vHdRoadEdge;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vHdRoadEdge = hdRoadEdge;');
    shader.fragmentShader = `
uniform float uRoadW, uRoadR;
varying vec2 vHdRoadEdge;
float rdHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rdNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rdHash(i), rdHash(i + vec2(1.0, 0.0)), f.x), mix(rdHash(i + vec2(0.0, 1.0)), rdHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
` + shader.fragmentShader.replace('void main() {', `void main() {
  if (uRoadW > 0.0) {
    // Snap to 16 pixels per tile, so the edge steps like the pixel art. (Clean-edged roads skip this.)
    vec2 q = (floor(vHdWorld * 16.0) + 0.5) / 16.0;
    float n = rdNoise(q * 2.3) * 0.75 + rdHash(floor(q * 16.0)) * 0.25;
    float reach = uRoadW * (1.0 + uRoadR * (2.0 * n - 1.0));
    float side = min(vHdRoadEdge.x, vHdRoadEdge.y) - (0.5 / 16.0);
    if (side < reach) discard;
  }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|hdRoadEdge';
  return mat;
}
