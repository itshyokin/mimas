/**
 * Post-processing: HDR scene → bloom → tilt-shift depth of field → ACES tone mapping,
 * saturation, vignette, gamma, and a screen fade used by events.
 */
import * as THREE from 'three';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT_FS = `
uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv + texel*vec2(-1.5,-1.5)).rgb + texture2D(tSrc, vUv + texel*vec2(1.5,-1.5)).rgb
         + texture2D(tSrc, vUv + texel*vec2(-1.5, 1.5)).rgb + texture2D(tSrc, vUv + texel*vec2(1.5, 1.5)).rgb;
  c *= 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= smoothstep(threshold, threshold + 0.8, l);
  gl_FragColor = vec4(min(c, vec3(20.0)), 1.0);
}`;

const BLUR_FS = `
uniform sampler2D tSrc; uniform vec2 dir; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;
  s += (texture2D(tSrc, vUv + dir*1.3846153846).rgb + texture2D(tSrc, vUv - dir*1.3846153846).rgb) * 0.3162162162;
  s += (texture2D(tSrc, vUv + dir*3.2307692308).rgb + texture2D(tSrc, vUv - dir*3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;

const COMPOSITE_FS = `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 res;
uniform float focusBand;
uniform float bloomStrength, tiltOn, focus, exposure, saturation, vignette, blurPx, fade;
uniform vec3 fadeColor;
varying vec2 vUv;
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 col = texture2D(tScene, vUv).rgb;
  float amt = smoothstep(0.10 * focusBand, 0.5 * focusBand, abs(vUv.y - focus)) * tiltOn;
  if (amt > 0.01) {
    vec2 r = amt * blurPx / res; vec3 s = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float fi = float(i); float rr = sqrt((fi + 0.5) / 16.0); float th = fi * 2.39996;
      s += texture2D(tScene, vUv + vec2(cos(th), sin(th)) * rr * r).rgb;
    }
    col = s / 16.0;
  }
  col += texture2D(tBloom, vUv).rgb * bloomStrength;
  col = aces(col * exposure);
  float g = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(g), col, saturation);
  vec2 q = vUv - 0.5; q.x *= res.x / res.y * 0.75;
  col *= 1.0 - vignette * smoothstep(0.25, 0.85, length(q));
  col = pow(col, vec3(1.0 / 2.2));
  col = mix(col, fadeColor, fade);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

export class PostFX {
  readonly settings = { bloom: true, tiltShift: true, bloomStrength: 0.65 };
  private readonly rtScene: THREE.WebGLRenderTarget;
  private readonly rtA: THREE.WebGLRenderTarget;
  private readonly rtB: THREE.WebGLRenderTarget;
  private readonly bright: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly size = new THREE.Vector2();
  /** Draw calls in the last scene pass (shadows included). */
  lastDrawCalls = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    const gl2 = renderer.capabilities.isWebGL2;
    const type = gl2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rtScene = new THREE.WebGLRenderTarget(1, 1, { type, samples: gl2 ? 4 : 0, stencilBuffer: true });
    this.rtA = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false });
    this.rtB = new THREE.WebGLRenderTarget(1, 1, { type, depthBuffer: false });
    const mk = (fs: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.bright = mk(BRIGHT_FS, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0.85 } });
    this.blur = mk(BLUR_FS, { tSrc: { value: null }, dir: { value: new THREE.Vector2() } });
    this.composite = mk(COMPOSITE_FS, {
      tScene: { value: null }, tBloom: { value: null }, res: { value: new THREE.Vector2() },
      focusBand: { value: 1 }, bloomStrength: { value: 0.65 }, tiltOn: { value: 1 }, focus: { value: 0.5 }, exposure: { value: 1.1 },
      saturation: { value: 1.12 }, vignette: { value: 0.35 }, blurPx: { value: 7 }, fade: { value: 0 }, fadeColor: { value: new THREE.Color(0, 0, 0) },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  resize(pixelRatio: number): void {
    this.renderer.getDrawingBufferSize(this.size);
    const { x, y } = this.size;
    this.rtScene.setSize(x, y);
    const qw = Math.max(1, x >> 2), qh = Math.max(1, y >> 2);
    this.rtA.setSize(qw, qh);
    this.rtB.setSize(qw, qh);
    this.composite.uniforms.res.value.copy(this.size);
    this.composite.uniforms.blurPx.value = 7 * pixelRatio;
    this.bright.uniforms.texel.value.set(1 / x, 1 / y);
  }

  /** 0 … 1: the tilt-shift eased away (looking up at the sky while sleeping keeps it all sharp). */
  tiltFade = 0;
  /** Screen-space height (0 bottom … 1 top) that stays sharp under tilt-shift. */
  set focus(v: number) { this.composite.uniforms.focus.value = v; }
  /** How wide the sharp band is (1: the map's; more keeps more of the screen sharp, as in battle). */
  set focusBand(v: number) { this.composite.uniforms.focusBand.value = v; }
  set exposure(v: number) { this.composite.uniforms.exposure.value = v; }
  /** 0 = clear, 1 = black. */
  get fade(): number { return this.composite.uniforms.fade.value; }
  set fade(v: number) { this.composite.uniforms.fade.value = v; }
  /** Colour the screen fades to (black by default, white for a flash-style transfer). */
  set fadeColor(hex: number) { (this.composite.uniforms.fadeColor.value as THREE.Color).set(hex); }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    this.lastDrawCalls = r.info.render.calls;

    const bloomOn = this.settings.bloom;
    if (bloomOn) {
      this.bright.uniforms.tSrc.value = this.rtScene.texture;
      this.pass(this.bright, this.rtA);
      const tx = 1 / this.rtA.width, ty = 1 / this.rtA.height;
      const steps: [number, number, THREE.WebGLRenderTarget, THREE.WebGLRenderTarget][] = [
        [1, 0, this.rtA, this.rtB], [0, 1, this.rtB, this.rtA], [2.2, 0, this.rtA, this.rtB], [0, 2.2, this.rtB, this.rtA],
      ];
      for (const [x, y, src, dst] of steps) {
        this.blur.uniforms.tSrc.value = src.texture;
        this.blur.uniforms.dir.value.set(x * tx, y * ty);
        this.pass(this.blur, dst);
      }
    }
    const u = this.composite.uniforms;
    u.bloomStrength.value = bloomOn ? this.settings.bloomStrength : 0;
    u.tiltOn.value = this.settings.tiltShift ? 1 - this.tiltFade : 0;
    u.tScene.value = this.rtScene.texture;
    u.tBloom.value = this.rtA.texture;
    this.pass(this.composite, null);
  }

  private pass(mat: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }
}
