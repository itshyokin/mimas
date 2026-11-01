/**
 * Recolouring an enemy (Database → Enemies → Tint, like RPG Maker's hue): turn its hue round the colour wheel, make it
 * more or less colourful, and mix a colour into it. On the 3D sprites it's done in the shader (one material each);
 * pictures (the battle screen, the Bestiary, the editor) are redrawn the same way.
 */
import * as THREE from 'three';

export interface Tint { hue?: number; sat?: number; color?: string; amount?: number }

export const hasTint = (t?: Tint): t is Tint => !!t && (!!t.hue || (t.sat ?? 1) !== 1 || (!!t.color && (t.amount ?? 0) > 0));

const GLSL = `
vec3 hdTint(vec3 c) {
  // Hue: rotate about the grey axis.
  float a = uTintHue, ca = cos(a), sa = sin(a);
  vec3 k = vec3(0.57735);
  c = c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uTintSat);
  return mix(c, c * uTintColor * 1.6, uTintAmt);
}
`;

/** Recolour every sprite material under `root` (each gets its own copy, so others using the art are untouched). */
export function tintObject(root: THREE.Object3D, t: Tint): void {
  if (!hasTint(t)) return;
  const uniforms = {
    uTintHue: { value: THREE.MathUtils.degToRad(t.hue ?? 0) }, uTintSat: { value: t.sat ?? 1 },
    uTintColor: { value: new THREE.Color(t.color ?? '#ffffff') }, uTintAmt: { value: t.color ? t.amount ?? 0 : 0 },
  };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material) || !(m.material as THREE.MeshStandardMaterial).map) return;
    const mat = (m.material as THREE.Material).clone();
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev?.call(mat, shader, r);
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = 'uniform float uTintHue; uniform float uTintSat; uniform vec3 uTintColor; uniform float uTintAmt;\n' + GLSL
        + shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb = hdTint(diffuseColor.rgb);');
    };
    const key = mat.customProgramCacheKey?.bind(mat);
    mat.customProgramCacheKey = () => (key ? key() : '') + '|tint';
    m.material = mat;
  });
}

/** The same recolouring on a picture (a new canvas). */
const tinted = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

export function tintCanvas(src: HTMLCanvasElement, t: Tint): HTMLCanvasElement {
  if (!hasTint(t)) return src;
  const key = JSON.stringify(t), cache = tinted.get(src) ?? new Map<string, HTMLCanvasElement>();
  tinted.set(src, cache);
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  cache.set(key, c);
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.filter = `hue-rotate(${t.hue ?? 0}deg) saturate(${t.sat ?? 1})`;
  g.drawImage(src, 0, 0);
  g.filter = 'none';
  if (t.color && (t.amount ?? 0) > 0) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = Math.min(1, t.amount!);
    g.fillStyle = t.color;
    g.fillRect(0, 0, c.width, c.height);
    // Keep the picture's own outline (multiply filled the see-through parts too).
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0);
  }
  return c;
}
