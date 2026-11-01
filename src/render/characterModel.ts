/**
 * 3D characters: a rigged model (GLB or FBX) with its animations, drawn in place of a character sheet.
 *
 * One file holds the model and any number of actions (Blender actions, Mixamo takes…); more files can add actions
 * for the same skeleton. Each animation slot (Idle, Walk, Run, Jump, Swim, Climb, Sit, Injured, KO, Attack,
 * Spellcast) is given one of them by name, or matched by its name when left to guess ("Walk_Cycle" → Walk,
 * "Death" → KO). A slot with nothing falls back to Idle.
 *
 * The model is scaled to stand `height` tiles tall on y = 0, centred on its feet, and turned to face where the
 * character faces. Walking forward is the game's job: actions that move the whole body along (root motion) are
 * kept in place. Two looks (Database → Characters → 3D look): Legend of Dragoon (low-res, crisp textures, flat
 * shading, a dark outline) or Final Fantasy X (smooth).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { patchAreaTint } from './areaTint';
import { modelExt } from './models';
import type { CharacterModel, ClipTrim, Database, Dir, ModelLook, ModelSlot } from '../world/types';

/** How 3D characters are drawn: the look, and whether they have a dark outline. */
export interface ModelStyle { look: ModelLook; outline: boolean }
/** The game's 3D character style (Database → Characters → 3D characters). The outline comes with Legend of Dragoon unless turned off. */
export function modelStyle(db: Pick<Database, 'modelLook' | 'modelOutline'>): ModelStyle {
  const look = db.modelLook ?? 'lod';
  return { look, outline: db.modelOutline ?? look === 'lod' };
}

/** The slots, in the order the editor shows them. `enemy`: the ones enemies use. */
export const MODEL_SLOTS: { id: ModelSlot; name: string; hint: string; enemy?: boolean }[] = [
  { id: 'idle', name: 'Idle', hint: 'Standing still (everything else falls back to it)', enemy: true },
  { id: 'walk', name: 'Walk', hint: 'Walking' },
  { id: 'run', name: 'Run', hint: 'Running (Walk when empty)' },
  { id: 'jump', name: 'Jump', hint: 'In the air' },
  { id: 'swim', name: 'Swim', hint: 'Swimming (Walk when empty)' },
  { id: 'climb', name: 'Climb', hint: 'On a ladder or vines' },
  { id: 'sit', name: 'Sit', hint: 'Sitting' },
  { id: 'injured', name: 'Injured', hint: 'Taking a hit; weak in battle' },
  { id: 'ko', name: 'KO', hint: 'Knocked out, or an enemy’s death (held on its last frame)', enemy: true },
  { id: 'attack', name: 'Attack', hint: 'A basic attack (Additions use it too)', enemy: true },
  { id: 'spellcast', name: 'Spellcast', hint: 'Casting a spell', enemy: true },
];

/** Names that pick a slot when it's left to guess. */
const GUESS: Record<ModelSlot, RegExp> = {
  idle: /idle|stand|breath|rest/i,
  walk: /walk/i,
  run: /run|sprint|jog/i,
  jump: /jump|leap|fall/i,
  swim: /swim/i,
  climb: /climb|ladder/i,
  sit: /sit|seat/i,
  injured: /injur|hurt|hit|damage|wound|flinch|limp/i,
  ko: /\bko\b|death|die|dead|dying|knock|defeat|faint/i,
  attack: /attack|slash|swing|strike|punch|stab|sword|combo/i,
  spellcast: /spell|cast|magic|channel/i,
};
/** Slots played on a loop; the rest play once. */
const LOOPS = new Set<ModelSlot>(['idle', 'walk', 'run', 'swim', 'climb', 'sit']);

/** A model as read from its files: the scene and every action in them. */
export interface LoadedCharModel { scene: THREE.Object3D; clips: THREE.AnimationClip[] }

/** An action's name as shown: without the "Armature|" prefix Blender adds. */
export const clipName = (c: THREE.AnimationClip): string => c.name.replace(/^.*\|/, '');

/** A blank pixel, for textures an FBX names on the computer it was made on (C:/…): there's nothing to fetch. */
const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

async function readFile(buf: ArrayBuffer, name: string, actionsOnly = false): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  const ext = modelExt(name);
  if (ext === 'fbx') {
    // Files of actions don't need their textures; others can't reach textures saved as paths on another computer.
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (actionsOnly && !url.startsWith('data:')) || /^[a-z]:[\\/]|^\\\\/i.test(url) ? BLANK_PNG : url);
    const g = new FBXLoader(manager).parse(buf, '');
    return { scene: g, clips: g.animations ?? [] };
  }
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  return { scene: gltf.scene, clips: gltf.animations ?? [] };
}

/** Read a character's model and the actions in it (and in its extra files). `read` fetches a file's bytes. */
/** Action names that say nothing (Mixamo's "mixamo.com", "Take 001", "Action.002"): named after their file instead. */
const GENERIC = /^(?:mixamo\.com|take\s*\d*|action|animation|anim|default|clip|armatureaction)?(?:[._ -]?\d+)?$/i;
/** Actions' names as they were in their files (slots saved before renaming still find them). */
const originalName = new WeakMap<THREE.AnimationClip, string>();
/** A file's name without its folder and extension ("assets/…/Jumping.fbx" → "Jumping"). */
const fileBase = (path: string): string => path.split('/').pop()!.replace(/\.[^.]+$/, '');

/** Each bone's local offset from its parent, by name: comparing skeletons tells their units apart (cm vs m). */
function boneOffsets(scene: THREE.Object3D): Map<string, number> {
  const out = new Map<string, number>();
  scene.traverse((n) => { if ((n as THREE.Bone).isBone && (n.parent as THREE.Bone | null)?.isBone) out.set(n.name, n.position.length()); });
  return out;
}

/** Read a character's model and the actions in it (and in its extra files). `read` fetches a file's bytes. */
export async function loadCharacterModel(def: CharacterModel, read: (path: string) => Promise<ArrayBuffer>): Promise<LoadedCharModel> {
  const main = await readFile(await read(def.file), def.file);
  const mainBones = boneOffsets(main.scene);
  const clips: THREE.AnimationClip[] = [];
  // Actions already taken, by their name in their file and length: a file exported with every action in the
  // project (Blender does that) adds only the ones that are new.
  const seen = new Set<string>();
  const sig = (name: string, c: THREE.AnimationClip) => `${name}|${c.duration.toFixed(3)}`;
  const add = (list: THREE.AnimationClip[], file: string) => {
    const fresh = list.filter((c) => !seen.has(sig(c.name, c)));
    for (const c of list) seen.add(sig(c.name, c));
    const blanks = fresh.filter((c) => GENERIC.test(clipName(c).trim())).length;
    let generic = 0;
    for (const c of fresh) {
      originalName.set(c, c.name);
      // Generic names ("mixamo.com") take the file's: "Jumping" ("Jumping 2" when a file has several).
      if (GENERIC.test(clipName(c).trim())) { generic++; c.name = blanks > 1 && generic > 1 ? `${fileBase(file)} ${generic}` : fileBase(file); }
      else c.name = clipName(c);
      // A name already in the list is a copy of that action (from another file): kept once.
      if (clips.some((o) => o.name === c.name)) continue;
      clips.push(c);
    }
  };
  add(main.clips, def.file);
  for (const f of def.extra ?? []) {
    try {
      const x = await readFile(await read(f), f, true);
      // Another file's skeleton may be in other units (Mixamo FBX: centimetres): its movements are scaled to match.
      const theirs = boneOffsets(x.scene);
      const ratios: number[] = [];
      for (const [name, len] of theirs) { const mine = mainBones.get(name); if (mine && len > 1e-6) ratios.push(mine / len); }
      ratios.sort((p, q) => p - q);
      const k = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
      if (Math.abs(k - 1) > 0.02) for (const c of x.clips) for (const t of c.tracks) if (t.name.endsWith('.position')) for (let i = 0; i < t.values.length; i++) t.values[i] *= k;
      add(x.clips, f);
    } catch { /* a missing extra file: its actions are missing */ }
  }
  // Keep each action in place: the root bone's sideways and forward travel is dropped (its height kept).
  const roots = new Set<string>();
  main.scene.traverse((n) => { if ((n as THREE.Bone).isBone && !(n.parent as THREE.Bone | null)?.isBone) roots.add(n.name); });
  for (const c of clips) for (const t of c.tracks) {
    const [node, prop] = [t.name.slice(0, t.name.lastIndexOf('.')), t.name.slice(t.name.lastIndexOf('.') + 1)];
    if (prop !== 'position' || !roots.has(node.replace(/^.*[/]/, ''))) continue;
    const v = t.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return { scene: main.scene, clips };
}

/** Frames per second for trimming (Mixamo and Blender's usual rate). */
export const MODEL_FPS = 30;
/** How many frames an action has. */
export const clipFrames = (c: THREE.AnimationClip): number => Math.max(1, Math.round(c.duration * MODEL_FPS));

const trimmed = new WeakMap<THREE.AnimationClip, Map<string, THREE.AnimationClip>>();
/** An action cut to frames from … to (either missing: its start or end). */
export function trimClip(c: THREE.AnimationClip, range: ClipTrim | undefined): THREE.AnimationClip {
  if (!range) return c;
  const n = clipFrames(c), a = Math.max(0, Math.min(n - 1, range.from ?? 0)), b = Math.max(a + 1, Math.min(n, range.to ?? n));
  if (a === 0 && b >= n) return c;
  const key = `${a}-${b}`;
  let m = trimmed.get(c);
  if (!m) { m = new Map(); trimmed.set(c, m); }
  let out = m.get(key);
  if (!out) { out = THREE.AnimationUtils.subclip(c, `${c.name} [${a}–${b}]`, a, b, MODEL_FPS); m.set(key, out); }
  return out;
}

/** The action a slot plays: the one named for it, or (left to guess) the first whose name fits. Null: none. */
export function clipFor(m: LoadedCharModel, def: CharacterModel, slot: ModelSlot): THREE.AnimationClip | null {
  const want = def.anims?.[slot];
  if (want === '') return null;
  if (want) return m.clips.find((c) => c.name === want || originalName.get(c) === want || clipName(c) === want) ?? null;
  // Guessing: an action used by an earlier slot that fits better isn't taken twice (Walk doesn't steal "Run").
  return m.clips.find((c) => GUESS[slot].test(clipName(c)) && !(slot === 'walk' && GUESS.run.test(clipName(c)))) ?? null;
}

const DIR_YAW: Record<Dir, number> = { down: 0, right: Math.PI / 2, up: Math.PI, left: -Math.PI / 2 };

const OUTLINE_KEY = '|hdOutline2';
/**
 * The outline shell: the model's own shape pushed out along smoothed normals (so hard edges don't split it open),
 * drawn back faces only, nearly black.
 */
function outlineMaterial(width: number): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: 0x14121c, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uHdOutline = { value: width };
    shader.vertexShader = 'uniform float uHdOutline;\nattribute vec3 hdOutlineNormal;\n' + shader.vertexShader.replace('#include <skinning_vertex>',
      '#include <skinning_vertex>\n#ifdef USE_SKINNING\n  vec3 hdN = normalize((skinMatrix * vec4(hdOutlineNormal, 0.0)).xyz);\n#else\n  vec3 hdN = normalize(hdOutlineNormal);\n#endif\n  transformed += hdN * uHdOutline;');
  };
  m.customProgramCacheKey = () => OUTLINE_KEY + width.toFixed(4);
  return m;
}

/** The geometry with one normal per corner position (the average of the faces meeting there), for the outline. */
const outlineGeos = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function smoothedForOutline(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = outlineGeos.get(g);
  if (hit) return hit;
  const out = g.clone();
  outlineGeos.set(g, out);
  const pos = out.attributes.position as THREE.BufferAttribute;
  if (!out.attributes.normal) out.computeVertexNormals();
  const nor = out.attributes.normal as THREE.BufferAttribute;
  const sums = new Map<string, THREE.Vector3>(), key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i), v = sums.get(k) ?? new THREE.Vector3();
    v.x += nor.getX(i); v.y += nor.getY(i); v.z += nor.getZ(i);
    sums.set(k, v);
  }
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = sums.get(key(i))!.clone().normalize();
    arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
  }
  out.setAttribute('hdOutlineNormal', new THREE.BufferAttribute(arr, 3));
  return out;
}

/** A material in the chosen look (FBX gives Phong / Lambert; glTF standard), sharing nothing with the source. */
function lookMaterial(src: THREE.Material, look: ModelLook): THREE.MeshStandardMaterial {
  const s = src as THREE.MeshStandardMaterial;
  const map = s.map ? s.map.clone() : null;
  if (map) {
    if (look === 'lod') { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter; }
    map.needsUpdate = true;
  }
  const m = new THREE.MeshStandardMaterial({
    color: s.color ? s.color.clone() : new THREE.Color(0xffffff), map,
    roughness: look === 'lod' ? 1 : src instanceof THREE.MeshStandardMaterial ? Math.max(0.5, s.roughness) : 0.75,
    metalness: src instanceof THREE.MeshStandardMaterial ? Math.min(0.25, s.metalness) : 0,
    transparent: src.transparent && src.opacity < 0.99, opacity: src.opacity,
    alphaTest: src.alphaTest || (map && src.transparent ? 0.5 : 0), side: src.side,
    flatShading: look === 'lod',
    vertexColors: !!(src as THREE.MeshStandardMaterial).vertexColors,
  });
  if (s.emissive && (s.emissive.r || s.emissive.g || s.emissive.b)) { m.emissive = s.emissive.clone(); m.emissiveMap = s.emissiveMap ?? null; }
  return patchAreaTint(m);
}

interface OneShot { action: THREE.AnimationAction; slot: ModelSlot; t: number; dur: number; done?: () => void; hold: boolean }

/**
 * One character's model on the map or the battle stage: its own copy of the model and skeleton, playing the slots.
 * `root` goes where the character stands; it turns to face the way they face.
 */
export class ModelRig {
  readonly root = new THREE.Group();
  private readonly turn = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ModelSlot, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private loopSlot: ModelSlot | null = null;
  private shot: OneShot | null = null;
  private held: ModelSlot | null = null;
  private yaw = 0;
  private targetYaw = 0;

  /** How tall it stands (tiles). */
  readonly height: number;
  /** Its size on the battle stage (a share of its height). */
  readonly battleScale: number;

  constructor(m: LoadedCharModel, def: CharacterModel, style: ModelStyle, castShadow = true) {
    const look = style.look;
    this.height = def.height ?? 1.6;
    this.battleScale = def.battleScale ?? 0.5;
    const obj = cloneSkinned(m.scene);
    obj.updateMatrixWorld(true);
    // Stand `height` tiles tall, feet on the ground, centred.
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    const k = (def.height ?? 1.6) / Math.max(1e-6, size.y);
    obj.scale.multiplyScalar(k);
    obj.position.set(-(box.min.x + box.max.x) / 2 * k, -box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
    const facing = new THREE.Group();
    facing.rotation.y = THREE.MathUtils.degToRad(-(def.rot ?? 0));
    facing.add(obj);
    this.turn.add(facing);
    this.root.add(this.turn);
    this.root.updateMatrixWorld(true);
    // Materials in the chosen look, an outline for Legend of Dragoon, shadows.
    const meshes: THREE.Mesh[] = [];
    obj.traverse((n) => { if ((n as THREE.Mesh).isMesh) meshes.push(n as THREE.Mesh); });
    const conv = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    const mat = (x: THREE.Material) => { let c = conv.get(x); if (!c) { c = lookMaterial(x, look); conv.set(x, c); } return c; };
    for (const mesh of meshes) {
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(mat) : mat(mesh.material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      // Skinned bounds are the rest pose's: never culled while an action moves it out of them.
      mesh.frustumCulled = false;
      if (style.outline && mesh.parent) {
        const ws = mesh.getWorldScale(new THREE.Vector3()).x || 1;
        const om = outlineMaterial(0.022 / ws);
        const sk = mesh as THREE.SkinnedMesh;
        let shell: THREE.Mesh;
        const og = smoothedForOutline(mesh.geometry);
        if (sk.isSkinnedMesh) { const s2 = new THREE.SkinnedMesh(og, om); s2.bind(sk.skeleton, sk.bindMatrix); shell = s2; }
        else shell = new THREE.Mesh(og, om);
        shell.position.copy(mesh.position); shell.quaternion.copy(mesh.quaternion); shell.scale.copy(mesh.scale);
        shell.frustumCulled = false;
        shell.castShadow = false;
        shell.userData.outline = true;
        mesh.parent.add(shell);
      }
    }
    this.mixer = new THREE.AnimationMixer(obj);
    for (const s of MODEL_SLOTS) {
      const c0 = clipFor(m, def, s.id);
      if (!c0) continue;
      const c = trimClip(c0, def.trim?.[s.id]);
      const a = this.mixer.clipAction(c);
      if (!LOOPS.has(s.id)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(s.id, a);
    }
    this.loop('idle');
  }

  /** Does the model have an action for this slot? */
  has(slot: ModelSlot): boolean { return this.actions.has(slot); }

  private fadeTo(a: THREE.AnimationAction, fade = 0.18): void {
    if (this.current === a) return;
    a.enabled = true;
    a.paused = false;
    a.setEffectiveTimeScale(1);
    a.setEffectiveWeight(1);
    a.play();
    if (this.current) this.current.crossFadeTo(a, fade, false);
    this.current = a;
  }

  /** The looping action for how the character moves (falls back: Run → Walk, Swim → Walk, anything → Idle). */
  loop(slot: ModelSlot): void {
    const s = this.actions.has(slot) ? slot : (slot === 'run' || slot === 'swim') && this.actions.has('walk') ? 'walk' : 'idle';
    this.loopSlot = s;
    if (this.shot || this.held) return;
    const a = this.actions.get(s);
    if (a) { if (this.current !== a) a.reset(); this.fadeTo(a); }
  }

  /** Play a slot once over the movement, taking `dur` seconds (its own length when omitted). False: no action for it. */
  once(slot: ModelSlot, dur?: number, done?: () => void, hold = false): boolean {
    const a = this.actions.get(slot);
    if (!a) return false;
    this.held = null;
    a.reset();
    const len = a.getClip().duration || 0.5, d = Math.max(0.05, dur ?? len);
    a.timeScale = len / d;
    this.current = null;
    if (this.shot && this.shot.action !== a) this.shot.action.fadeOut(0.08);
    for (const other of this.actions.values()) if (other !== a && other.isRunning()) other.fadeOut(0.1);
    a.setEffectiveWeight(1).fadeIn(0.06).play();
    this.current = a;
    this.shot = { action: a, slot, t: 0, dur: d, done, hold };
    return true;
  }

  /** Hold a slot at a point through it (0 its start … 1 its end) until released with `release()`. */
  pose(slot: ModelSlot, at: number): boolean {
    const a = this.actions.get(slot);
    if (!a) return false;
    this.shot = null;
    this.held = slot;
    for (const other of this.actions.values()) if (other !== a) other.stop();
    a.reset(); a.play(); a.paused = true;
    a.time = Math.max(0, Math.min(1, at)) * (a.getClip().duration || 0);
    a.setEffectiveWeight(1);
    this.current = a;
    return true;
  }

  /** Let go of a held pose or action: back to moving. */
  release(): void {
    this.shot = null; this.held = null;
    const s = this.loopSlot ?? 'idle';
    this.loopSlot = null;
    for (const a of this.actions.values()) a.stop();
    this.current = null;
    this.loop(s);
  }

  get acting(): boolean { return !!this.shot && !this.shot.hold; }

  /** Face a way (smoothly), or an exact angle (radians, 0 = toward the camera). */
  face(dir: Dir, yaw?: number): void { this.targetYaw = yaw ?? DIR_YAW[dir]; }

  /** Advance the animation by `dt` seconds; `climbStill` pauses a climb (hanging on the ladder). */
  update(dt: number, climbStill = false): void {
    if (this.shot) {
      this.shot.t += dt;
      if (this.shot.t >= this.shot.dur && !this.shot.hold) {
        const done = this.shot.done;
        this.shot = null;
        const s = this.loopSlot ?? 'idle';
        this.current?.fadeOut(0.15);
        this.current = null;
        this.loopSlot = null;
        this.loop(s);
        done?.();
      } else if (this.shot && this.shot.t >= this.shot.dur && this.shot.hold) {
        const done = this.shot.done;
        this.shot.done = undefined;
        done?.();
      }
    }
    if (this.current && this.loopSlot === 'climb' && !this.shot && !this.held) this.current.paused = climbStill;
    this.mixer.update(dt);
    // Turn toward the way they face, the short way round.
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 14);
    this.turn.rotation.y = this.yaw;
  }

  /** Snap to facing (no turning), e.g. when placed. */
  snapFacing(): void { this.yaw = this.targetYaw; this.turn.rotation.y = this.yaw; }

  dispose(): void { this.mixer.stopAllAction(); this.root.removeFromParent(); }
}

let picRenderer: THREE.WebGLRenderer | null = null;

/**
 * A picture of a character model, standing in its Idle pose and facing `dir`: the whole body (`part` 'full', for
 * battle pictures and save slots) or the head and shoulders ('head', for faces in menus). `px` tall.
 */
export function renderCharacterPicture(m: LoadedCharModel, def: CharacterModel, style: ModelStyle, dir: Dir, part: 'full' | 'head', px: number): HTMLCanvasElement {
  const look = style.look;
  const rig = new ModelRig(m, def, style, false);
  rig.face(dir); rig.snapFacing();
  rig.update(0.4);
  rig.root.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(-2, 4, 5);
  scene.add(sun, rig.root);
  const box = new THREE.Box3().setFromObject(rig.root), size = box.getSize(new THREE.Vector3());
  const tall = def.height ?? 1.6;
  let top = Math.max(box.max.y, tall), bottom = 0, half = Math.max(size.x, size.z, tall * 0.35) / 2 * 1.08;
  if (part === 'head') { bottom = top - tall * 0.32; half = (top - bottom) / 2; }
  const h = top - bottom, w = part === 'head' ? h : half * 2;
  const W = Math.max(8, Math.round(px * w / h)), H = Math.max(8, Math.round(px));
  picRenderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: look !== 'lod', preserveDrawingBuffer: true });
  picRenderer.setPixelRatio(1);
  picRenderer.setSize(W, H, false);
  picRenderer.setClearColor(0x000000, 0);
  const cx = (box.min.x + box.max.x) / 2;
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.01, 100);
  cam.position.set(cx, (top + bottom) / 2, 30);
  cam.lookAt(cx, (top + bottom) / 2, 0);
  picRenderer.render(scene, cam);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  out.getContext('2d')!.drawImage(picRenderer.domElement, 0, 0);
  rig.dispose();
  return out;
}
