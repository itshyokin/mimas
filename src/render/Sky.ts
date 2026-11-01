/**
 * The sky over Titan: a dome around the camera, drawn behind everything, in three layers.
 *
 *  1. Far away: stars (fading in at dusk, each twinkling on its own), Saturn with its rings (pale behind the daylight,
 *     vivid at night), the sun, and the moon: artificial, barren-looking, with teal circuit lines across it, in the
 *     real moon's phase (world/moon.ts), lit from the side the phase says.
 *  2. The sky's colour: from the horizon (the fog's colour, so distant ground melts into it) up to the zenith,
 *     following the time of day and the weather.
 *  3. Clouds drifting with the wind: white and puffy, or thin and wispy; dark grey-purple and thick in rain, pale grey
 *     in snow (the sun and Saturn hard to see), sand-coloured in a sandstorm.
 *
 * All drawn in one shader on a sphere that follows the camera, so it costs one draw. Indoors and underground it hides.
 */
import * as THREE from 'three';

const VS = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // on the far plane: behind everything
}`;

const FS = `
uniform vec3 uZenith, uHorizon, uSunDir, uSunColor, uMoonDir, uSaturnDir, uCloudColor, uCloudShade;
uniform float uNight, uMoonAge, uTime, uCloud, uWispy, uStars, uSaturnDay;
uniform vec2 uWind;
varying vec3 vDir;

float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }

/** Coordinates on the sky around a direction (x right, y up), in units of 'size' radians; z: facing it. */
vec3 local(vec3 d, vec3 at, float size) {
  vec3 r = normalize(cross(at, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0)), u = cross(r, at);
  return vec3(dot(d, r) / size, dot(d, u) / size, dot(d, at));
}

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  // 2. The sky's colour, horizon to zenith (below the horizon: the horizon's, to meet the fog).
  float t = clamp(up, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.55));
  float above = smoothstep(-0.02, 0.06, up);

  // Clouds first worked out (they hide the far layer).
  float cloud = 0.0, shade = 0.0;
  if (up > 0.0) {
    vec2 uv = d.xz / (up + 0.18) * 1.6 + uWind;
    vec2 wuv = uv * vec2(0.35, 1.6);
    float n = mix(fbm(uv), fbm(wuv * 1.3) * 0.9 + 0.08, uWispy);
    float cov = clamp(uCloud, 0.0, 1.0);
    cloud = smoothstep(1.0 - cov - 0.08, 1.0 - cov + mix(0.22, 0.12, uWispy), n);
    cloud *= mix(1.0, 0.55, uWispy);
    // A darker underside where the cloud is thick (sampled a little toward the sun).
    shade = smoothstep(0.35, 1.0, fbm(uv + uSunDir.xz * 0.06) * cov * 1.4);
    cloud *= smoothstep(0.0, 0.12, up);
  }
  float clear = (1.0 - cloud) * above;

  // 1. The far layer.
  // Stars: one in a few hundred cells of the dome, each twinkling at its own pace.
  if (uStars > 0.01) {
    vec3 p = d * 220.0, cell = floor(p);
    float h = hash(cell);
    if (h > 0.986) {
      vec3 c = cell + 0.5 + (vec3(hash(cell + 3.1), hash(cell + 7.7), hash(cell + 1.3)) - 0.5) * 0.6;
      float dist = length(p - c);
      float tw = 0.55 + 0.45 * sin(uTime * (1.2 + h * 40.0) + h * 300.0);
      float s = smoothstep(0.38, 0.0, dist) * tw * (0.5 + 0.5 * fract(h * 97.0));
      vec3 sc = mix(vec3(1.0, 0.9, 0.8), vec3(0.75, 0.85, 1.0), fract(h * 53.0));
      col += sc * s * uStars * clear * 1.6;
    }
  }
  // Saturn and its rings.
  vec3 sq = local(d, uSaturnDir, 0.075);
  if (sq.z > 0.0) {
    vec2 q = sq.xy;
    float tilt = 0.32;
    vec2 rq = vec2(q.x * 0.97 + q.y * 0.24, (q.y * 0.97 - q.x * 0.24) / tilt);
    float rr = length(rq);
    float ring = smoothstep(1.32, 1.36, rr) * smoothstep(2.32, 2.26, rr) * (0.55 + 0.45 * sin(rr * 38.0)) * (1.0 - 0.75 * smoothstep(1.88, 1.9, rr) * smoothstep(1.98, 1.96, rr));
    float r = length(q), planet = smoothstep(1.0, 0.97, r);
    vec3 ringC = vec3(0.86, 0.78, 0.62);
    vec3 n = vec3(q, sqrt(max(0.0, 1.0 - r * r)));
    float band = sin(q.y * 13.0 + sin(q.x * 3.0) * 0.6) * 0.5 + 0.5;
    vec3 pc = mix(vec3(0.82, 0.68, 0.45), vec3(0.95, 0.87, 0.68), band) * (0.35 + 0.65 * clamp(n.z + 0.25, 0.0, 1.0));
    bool front = rq.y < 0.0;
    // The far half of the rings behind the planet, the planet, then the near half in front of it.
    vec3 sat = ringC; float a = front ? 0.0 : ring;
    sat = mix(sat, pc, planet); a = max(a, planet);
    if (front) { sat = mix(sat, ringC, ring); a = max(a, ring); }
    float vis = mix(uSaturnDay, 1.0, uNight) * clear;
    col = mix(col, sat * mix(1.6, 1.0, uNight), clamp(a, 0.0, 1.0) * vis);
  }
  // The sun: a bright disc and a glow (hidden by cloud, gone below the horizon).
  float sd = max(dot(d, uSunDir), 0.0);
  float sunUp = smoothstep(-0.08, 0.05, uSunDir.y);
  col += uSunColor * (smoothstep(0.9993, 0.9997, sd) * 6.0 * clear + pow(sd, 48.0) * 0.45 * (1.0 - cloud * 0.6)) * sunUp * above;
  // The moon, lit from the side its phase says, with teal circuit lines.
  vec3 mq = local(d, uMoonDir, 0.05);
  if (mq.z > 0.0) {
    float r = length(mq.xy), disc = smoothstep(1.0, 0.94, r);
    if (disc > 0.0) {
      vec3 n = vec3(mq.xy, sqrt(max(0.0, 1.0 - r * r)));
      float th = uMoonAge * 6.2831853;
      vec3 L = vec3(sin(th), 0.0, -cos(th));
      float lit = smoothstep(-0.06, 0.08, dot(n, L));
      float crater = fbm(mq.xy * 3.0 + 4.0) * 0.6 + fbm(mq.xy * 9.0) * 0.4;
      vec3 rock = vec3(0.72, 0.74, 0.78) * (0.65 + 0.5 * crater);
      vec2 g = mq.xy * 5.0, gc = floor(g), gf = abs(fract(g) - 0.5);
      float on = step(0.55, hash2(gc));
      float lines = on * (smoothstep(0.06, 0.0, gf.x) * step(0.5, hash2(gc + 2.0)) + smoothstep(0.06, 0.0, gf.y) * step(0.5, hash2(gc + 5.0)));
      lines *= 0.6 + 0.4 * sin(uTime * 1.5 + gc.x * 2.0 + gc.y);
      vec3 mc = rock * (lit + 0.05) + vec3(0.25, 0.85, 0.8) * lines * (0.35 + 0.65 * (1.0 - lit)) * 0.9;
      float vis = disc * mix(0.35, 1.0, uNight) * clear * smoothstep(-0.05, 0.05, uMoonDir.y);
      col = mix(col, mc * mix(1.3, 1.0, uNight), vis);
    }
  }
  // 3. The clouds over it all.
  vec3 cc = mix(uCloudColor, uCloudShade, shade);
  cc += uSunColor * pow(sd, 6.0) * 0.25 * (1.0 - uNight) * sunUp;
  col = mix(col, cc, cloud * above);
  gl_FragColor = vec4(col, 1.0);
}`;

export interface SkyState {
  /** Hour of the day (sun position) and how night it is (0 … 1). */
  hour: number; night: number;
  horizon: THREE.Color; zenith: THREE.Color; sunColor: THREE.Color;
  /** The moon's age (0 new … 0.5 full … 1). */
  moonAge: number;
  /** Cloud cover 0 … 1, wispy 0 … 1, their colour and their dark underside. */
  cloud: number; wispy: number; cloudColor: THREE.Color; cloudShade: THREE.Color;
  /** Wind: which way clouds drift (radians, on the map) and how fast. */
  windDir: number; wind: number;
  time: number;
}

/** Where Saturn hangs in Titan's sky (it doesn't move: Titan always shows Saturn the same face). */
export const SATURN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
const SATURN = SATURN_DIR;

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly drift = new THREE.Vector2();

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uSunColor: { value: new THREE.Color() }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uSaturnDir: { value: SATURN.clone() },
        uCloudColor: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
        uNight: { value: 0 }, uMoonAge: { value: 0.5 }, uTime: { value: 0 }, uCloud: { value: 0.3 }, uWispy: { value: 0 }, uStars: { value: 0 }, uSaturnDay: { value: 0.18 },
        uWind: { value: new THREE.Vector2() },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
  }

  /** Put the dome into the scene about to be drawn (the field's, or a battle stage's). */
  attach(scene: THREE.Scene): void { if (this.mesh.parent !== scene) scene.add(this.mesh); }

  set visible(v: boolean) { this.mesh.visible = v; }
  get visible(): boolean { return this.mesh.visible; }

  /** Where the sun is at an hour: rising in the east at 6, high in the south at noon, setting in the west at 18. */
  static sunAt(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
    const a = ((hour - 6) / 12) * Math.PI;
    return out.set(Math.cos(a), Math.sin(a) * 0.85, -0.35 - Math.sin(a) * 0.25).normalize();
  }

  update(s: SkyState, camera: THREE.Camera, dt: number): void {
    const u = this.mat.uniforms;
    this.mesh.position.copy(camera.position);
    (u.uZenith.value as THREE.Color).copy(s.zenith);
    (u.uHorizon.value as THREE.Color).copy(s.horizon);
    (u.uSunColor.value as THREE.Color).copy(s.sunColor);
    Sky.sunAt(s.hour, u.uSunDir.value as THREE.Vector3);
    // The moon keeps the real moon's timing: a full moon rises at sunset, a new one travels with the sun.
    Sky.sunAt(s.hour - s.moonAge * 24, u.uMoonDir.value as THREE.Vector3);
    u.uNight.value = s.night;
    u.uMoonAge.value = s.moonAge;
    u.uTime.value = s.time;
    u.uCloud.value = s.cloud;
    u.uWispy.value = s.wispy;
    u.uStars.value = Math.max(0, (s.night - 0.25) / 0.75) * (1 - s.cloud * 0.9);
    u.uSaturnDay.value = 0.18 * (1 - s.cloud);
    (u.uCloudColor.value as THREE.Color).copy(s.cloudColor);
    (u.uCloudShade.value as THREE.Color).copy(s.cloudShade);
    this.drift.x += Math.cos(s.windDir) * (0.004 + s.wind * 0.02) * dt;
    this.drift.y += Math.sin(s.windDir) * (0.004 + s.wind * 0.02) * dt;
    (u.uWind.value as THREE.Vector2).copy(this.drift);
  }
}
