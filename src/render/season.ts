/**
 * Seasons in the shaders: grass and leaves recoloured (verdant spring, green-gold summer, orange and red autumn),
 * and winter's snow (grass under it, snow on evergreen leaves, broadleaf trees bare). Greens are found by colour
 * (green stronger than red and blue), so drawn tiles and props need no seasonal versions.
 */
import * as THREE from 'three';
import type { Season } from '../world/seasons';

const uniforms = { uHdSeason: { value: new THREE.Vector4(0, 0, 0, 0) }, uHdWeather: { value: new THREE.Vector4(0, 0, 0, 0) } };

/** How a material changes: ground (grass turns to snow), leaves (snow on them), bare (leaves gone in winter). */
export type SeasonMode = 'ground' | 'leaves' | 'bare';

const VERT = `#include <project_vertex>
{
  vec4 hdO = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    hdO = instanceMatrix * hdO;
  #endif
  vHdOrigin = (modelMatrix * hdO).xz;
}`;

const HEAD = `
uniform vec4 uHdSeason;
uniform vec4 uHdWeather;
/** The weather's mark on the ground: damp (darker, richer), frost (white-blue on grass and leaves), heat (grass parched). */
vec3 hdWeatherLook(vec3 c, float ground) {
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float leaf = smoothstep(0.004, 0.05, c.g - max(c.r, c.b));
  float wet = uHdWeather.x;
  c = mix(vec3(lum), c, 1.0 + 0.3 * wet) * (1.0 - 0.22 * wet);
  float frost = uHdWeather.y * (ground > 0.5 ? 0.55 + 0.35 * leaf : 0.25 + 0.45 * leaf);
  // Frost: white-blue on the ground, icy blue on plants (white would vanish against the snow).
  vec3 rime = ground > 0.5 ? vec3(0.84, 0.9, 1.0) * (0.55 + lum * 0.6) : vec3(0.3, 0.56, 0.92) * (0.45 + lum * 0.9);
  c = mix(c, rime, frost);
  float heat = uHdWeather.z * leaf * (ground > 0.5 ? 0.6 : 0.25);
  c = mix(c, vec3(lum * 1.35, lum * 1.12, lum * 0.5), heat);
  return c;
}
float hdSeasonHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
varying vec2 vHdOrigin;
vec3 hdSeasonColor(vec3 c, vec2 world, vec2 origin, float ground, float bare, out float gone) {
  gone = 0.0;
  float g = c.g - max(c.r, c.b);
  float leaf = smoothstep(0.006, 0.05, g);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 spring = mix(c, c * vec3(0.9, 1.14, 0.82), leaf);
  vec3 summer = mix(c, vec3(lum * 1.3, lum * 1.08, lum * 0.42), leaf * 0.4);
  // Autumn: every green turns, evenly (no half-turned patches): any green-leaning colour, dark shades included.
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float fallMask = smoothstep(-0.05, -0.005, c.g - c.r) * smoothstep(0.0, 0.035, c.g - c.b) * smoothstep(0.08, 0.22, (mx - mn) / max(mx, 0.04));
  // Ground: one even straw-gold. Trees and bushes: the whole plant one colour (red, orange or gold), picked by where it stands.
  float h = hdSeasonHash(floor(origin * 1.7) + 0.5);
  vec3 fall = h < 0.36 ? vec3(0.96, 0.42, 0.07) : h < 0.68 ? vec3(0.84, 0.15, 0.05) : vec3(1.0, 0.72, 0.12);
  vec3 turned = ground > 0.5 ? vec3(1.0, 0.8, 0.34) * min(lum * 1.95, 1.1) : fall * min(0.18 + lum * 2.1, 1.25);
  vec3 autumn = mix(c, turned, fallMask);
  vec3 snow = vec3(0.84, 0.89, 0.98) * (0.6 + lum * 0.5);
  // Update 121: tree and bush leaves are snow-laden in winter: solid white with their shading kept (a little blue in
  // the shade so they still stand out against snowy ground). Nothing is cut away, so nothing shows through the canopy.
  vec3 laden = mix(vec3(0.42, 0.5, 0.68), vec3(0.97, 0.98, 1.0), clamp(0.15 + lum * 2.2, 0.0, 1.0));
  vec3 winter = ground > 0.5 ? mix(c, snow, leaf) : mix(c, laden, leaf);
  if (ground > 0.5) winter = mix(winter, vec3(0.8, 0.85, 0.95), 0.12);
  return spring * uHdSeason.x + summer * uHdSeason.y + autumn * uHdSeason.z + winter * uHdSeason.w + c * (1.0 - dot(uHdSeason, vec4(1.0)));
}
`;

/** Recolour a lit, textured material with the seasons (call after patchAreaTint: it uses its world position). */
export function patchSeason<T extends THREE.Material>(mat: T, mode: SeasonMode): T {
  if (mat.userData.hdSeason) return mat;
  mat.userData.hdSeason = mode;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    // Where each prop stands (instanced props share one mesh), so a whole tree turns one colour in autumn.
    shader.vertexShader = 'varying vec2 vHdOrigin;\n' + shader.vertexShader.replace('#include <project_vertex>', VERT);
    shader.fragmentShader = HEAD + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  { float hdGone; diffuseColor.rgb = hdSeasonColor(diffuseColor.rgb, vHdWorld, vHdOrigin, ${mode === 'ground' ? '1.0' : '0.0'}, ${mode === 'bare' ? '1.0' : '0.0'}, hdGone); if (hdGone > 0.5) discard; diffuseColor.rgb = hdWeatherLook(diffuseColor.rgb, ${mode === 'ground' ? '1.0' : '0.0'}); }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `|season5:${mode}`;
  return mat;
}

/** Show this season everywhere (null: as drawn, no seasons). */
export function setSeason(s: Season | null): void {
  uniforms.uHdSeason.value.set(s === 'spring' ? 1 : 0, s === 'summer' ? 1 : 0, s === 'autumn' ? 1 : 0, s === 'winter' ? 1 : 0);
}

/** The weather's mark on grass and leaves: how damp (0 … 1), frosted and parched. */
export function setWeatherLook(wet: number, frost: number, heat: number): void {
  uniforms.uHdWeather.value.set(wet, frost, heat, 0);
}
