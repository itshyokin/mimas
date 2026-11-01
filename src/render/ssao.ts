/**
 * Ambient occlusion (SSAO): soft shading where surfaces meet, at the foot of cliffs, in the corners of buildings,
 * along ramps and steps. Only the solid world takes part (ground, cliff walls, buildings, water): sprites (the
 * hero, people, trees and other props) neither cast it nor receive it, so the pixel art stays clean.
 *
 * How: the world's meshes are also on layer AO_LAYER. Each frame those alone are drawn into a small depth buffer;
 * a shader looks around each pixel of it for nearby surfaces that hide the sky (the "Alchemy" estimate), and the
 * result is blurred. World materials (patched once) then read it by screen position and darken their ambient light
 * (and, a little, the sunlight) by it, inside the normal lighting, so lights and fog stay right.
 */
import * as THREE from 'three';

export const AO_LAYER = 2;

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const AO_FS = `
uniform sampler2D tDepth; uniform vec2 texel; uniform mat4 projInv; uniform mat4 proj;
uniform float radius, strength;
varying vec2 vUv;
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = texture2D(tDepth, vUv).x;
  if (d >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewPos(vUv);
  vec3 n = normalize(cross(viewPos(vUv + vec2(texel.x, 0.0)) - p, viewPos(vUv + vec2(0.0, texel.y)) - p));
  // How big the radius looks on screen here.
  vec4 e = proj * vec4(p + vec3(radius, 0.0, 0.0), 1.0);
  float rs = abs(e.x / e.w * 0.5 + 0.5 - vUv.x);
  float a = 0.0;
  float rot = hash(gl_FragCoord.xy) * 6.2831;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 12.0) * rs;
    float th = fi * 2.39996 + rot;
    vec3 q = viewPos(vUv + vec2(cos(th), sin(th)) * r);
    vec3 v = q - p;
    float vv = dot(v, v);
    // Surfaces close by and facing over this one hide part of the sky; ones too far away don't count.
    a += max(0.0, dot(v, n) - 0.002 * -p.z) / (vv + 0.01) * step(vv, radius * radius * 4.0);
  }
  float ao = max(0.0, 1.0 - strength * a / 12.0);
  gl_FragColor = vec4(vec3(ao * ao), 1.0);
}`;

const BLUR_FS = `
uniform sampler2D tSrc; uniform vec2 texel; varying vec2 vUv;
void main() {
  float s = 0.0;
  for (int x = -2; x <= 1; x++) for (int y = -2; y <= 1; y++) s += texture2D(tSrc, vUv + (vec2(float(x), float(y)) + 0.5) * texel).r;
  gl_FragColor = vec4(vec3(s / 16.0), 1.0);
}`;

/** Shared by every patched material: the blurred result and the size of the screen it covers. */
const shared = {
  tHdAO: { value: null as THREE.Texture | null },
  uHdAORes: { value: new THREE.Vector2(1, 1) },
  uHdAOOn: { value: 0 },
};

/** Let a world material be shaded by the ambient occlusion. Safe to call more than once. */
export function patchSSAO<T extends THREE.Material>(mat: T): T {
  if (mat.userData.hdAO) return mat;
  mat.userData.hdAO = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, shared);
    if (!shader.fragmentShader.includes('#include <lights_fragment_end>')) return;
    shader.fragmentShader = 'uniform sampler2D tHdAO;\nuniform vec2 uHdAORes;\nuniform float uHdAOOn;\n' + shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
  if (uHdAOOn > 0.5) {
    float hdAo = texture2D(tHdAO, gl_FragCoord.xy / uHdAORes).r;
    reflectedLight.indirectDiffuse *= hdAo;
    reflectedLight.directDiffuse *= mix(1.0, hdAo, 0.5);
  }`);
  };
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|ao';
  return mat;
}

export class SSAO {
  private readonly rtDepth: THREE.WebGLRenderTarget;
  private readonly rtAO: THREE.WebGLRenderTarget;
  private readonly rtBlur: THREE.WebGLRenderTarget;
  private readonly aoMat: THREE.ShaderMaterial;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  /** 2: half the screen's size (sharper), 4: a quarter (lighter). */
  scale = 2;
  enabled = false;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.rtDepth = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
    this.rtDepth.depthTexture = new THREE.DepthTexture(1, 1);
    this.rtAO = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.rtBlur = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    const mk = (fs: string, uniforms: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.aoMat = mk(AO_FS, {
      tDepth: { value: this.rtDepth.depthTexture }, texel: { value: new THREE.Vector2() }, projInv: { value: new THREE.Matrix4() }, proj: { value: new THREE.Matrix4() },
      radius: { value: 0.9 }, strength: { value: 1.6 },
    });
    this.blurMat = mk(BLUR_FS, { tSrc: { value: this.rtAO.texture }, texel: { value: new THREE.Vector2() } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.aoMat);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    shared.tHdAO.value = this.rtBlur.texture;
  }

  /** The size of the screen being drawn (drawing-buffer pixels). */
  resize(w: number, h: number): void {
    const s = this.scale, aw = Math.max(1, Math.round(w / s)), ah = Math.max(1, Math.round(h / s));
    this.rtDepth.setSize(aw, ah);
    this.rtAO.setSize(aw, ah);
    this.rtBlur.setSize(aw, ah);
    this.aoMat.uniforms.texel.value.set(1 / aw, 1 / ah);
    this.blurMat.uniforms.texel.value.set(1 / aw, 1 / ah);
    shared.uHdAORes.value.set(w, h);
  }

  /** Work out this frame's shading (before the scene is drawn). */
  render(scene: THREE.Scene, camera: THREE.Camera): void {
    shared.uHdAOOn.value = this.enabled ? 1 : 0;
    if (!this.enabled) return;
    const r = this.renderer, sm = r.shadowMap;
    // Just the world's depth: no shadows redrawn, no sky, nothing but the world's layer, one plain material.
    const mask = camera.layers.mask, bg = scene.background, over = scene.overrideMaterial, autoShadow = sm.autoUpdate, needShadow = sm.needsUpdate;
    sm.autoUpdate = false; sm.needsUpdate = false;
    camera.layers.set(AO_LAYER);
    scene.background = null;
    scene.overrideMaterial = this.depthOnly;
    r.setRenderTarget(this.rtDepth);
    r.clear();
    r.render(scene, camera);
    camera.layers.mask = mask;
    scene.background = bg;
    scene.overrideMaterial = over;
    sm.autoUpdate = autoShadow; sm.needsUpdate = needShadow;

    const u = this.aoMat.uniforms;
    u.proj.value.copy(camera.projectionMatrix);
    u.projInv.value.copy(camera.projectionMatrixInverse);
    this.quad.material = this.aoMat;
    r.setRenderTarget(this.rtAO);
    r.render(this.quadScene, this.quadCam);
    this.quad.material = this.blurMat;
    r.setRenderTarget(this.rtBlur);
    r.render(this.quadScene, this.quadCam);
    r.setRenderTarget(null);
  }
}

/**
 * Make the solid world under `root` take part: every mesh whose material is a world material (ground, cliffs,
 * buildings, water: the ones with area tint) gets the shading and goes on the AO layer. Sprites are left alone.
 */
export function tagAOMeshes(root: THREE.Object3D): void {
  root.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) return;
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    const mats = Array.isArray(m) ? m : [m];
    // Sprites (cut-out pictures) are tinted like the world but must stay out of the AO: the depth pass draws whole
    // quads, so a sprite would shade a box on the ground around itself (the haze around fighters in battle).
    if (mats.some((x) => x.alphaTest > 0 || x.userData?.noAO)) return;
    if (!mats.some((x) => x.userData?.hdArea)) return;
    for (const x of mats) if (x.userData?.hdArea) patchSSAO(x);
    o.layers.enable(AO_LAYER);
  });
}
