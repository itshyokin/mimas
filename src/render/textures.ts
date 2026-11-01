import * as THREE from 'three';

export interface TexOpts {
  /** Data textures (normal maps) stay linear; colour art is sRGB. */
  linear?: boolean;
  /** Mipmaps reduce shimmer on large ground textures seen at an angle. */
  mip?: boolean;
  repeat?: boolean;
}

let maxAnisotropy = 1;
export function setMaxAnisotropy(n: number): void {
  maxAnisotropy = n;
}

/** Pixel-art friendly texture: nearest-neighbour magnification. */
export function makeTexture(canvas: HTMLCanvasElement, o: TexOpts = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.encoding = o.linear ? THREE.LinearEncoding : THREE.sRGBEncoding;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = o.mip ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = !!o.mip;
  if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (o.mip) t.anisotropy = maxAnisotropy;
  return t;
}

/** Colour in sRGB hex → linear (lighting maths happens in linear space). */
export const linearColor = (hex: string): THREE.Color => new THREE.Color(hex).convertSRGBToLinear();

/* Materials with normal maps register here so they can all be toggled at once. */
const normalMapped: THREE.MeshStandardMaterial[] = [];
export function registerNormalMap(mat: THREE.MeshStandardMaterial, nm: THREE.Texture): void {
  mat.normalMap = nm;
  mat.userData.normalMap = nm;
  normalMapped.push(mat);
}
/** Forget a material that's being thrown away (map change). */
export function unregisterNormalMap(mat: THREE.Material): void {
  const i = normalMapped.indexOf(mat as THREE.MeshStandardMaterial);
  if (i >= 0) normalMapped.splice(i, 1);
}
export function setNormalMapsEnabled(on: boolean): void {
  for (const m of normalMapped) {
    m.normalMap = on ? (m.userData.normalMap as THREE.Texture) : null;
    m.needsUpdate = true;
  }
}
