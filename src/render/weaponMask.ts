/**
 * A soft white silhouette of a weapon sheet, frame for frame: the weapon's shape widened by a couple of pixels and
 * blurred. Tinted and added over the weapon it makes the glow; earlier frames of it make the swing trail.
 * Pure canvas work (computed once per sheet).
 */
export function weaponMaskCanvas(sheet: HTMLCanvasElement, radius = 2): HTMLCanvasElement {
  const w = sheet.width, h = sheet.height;
  const src = sheet.getContext('2d')!.getImageData(0, 0, w, h).data;
  let a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = src[i * 4 + 3] > 24 ? 1 : 0;
  // Two box blurs (each way) ≈ a soft Gaussian around the outline.
  const tmp = new Float32Array(w * h);
  const blur = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    const n = horizontal ? w : h, lines = horizontal ? h : w, k = 1 / (radius * 2 + 1);
    for (let l = 0; l < lines; l++) {
      const at = (i: number) => (horizontal ? l * w + i : i * w + l);
      let sum = 0;
      for (let i = -radius; i <= radius; i++) sum += i >= 0 && i < n ? from[at(i)] : 0;
      for (let i = 0; i < n; i++) {
        to[at(i)] = sum * k;
        const out = i - radius, inn = i + radius + 1;
        if (out >= 0) sum -= from[at(out)];
        if (inn < n) sum += from[at(inn)];
      }
    }
  };
  for (let pass = 0; pass < 2; pass++) { blur(a, tmp, true); blur(tmp, a, false); }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h), d = img.data;
  for (let i = 0; i < w * h; i++) {
    const v = Math.min(1, a[i] * 2.2);
    if (v <= 0.01) continue;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
    d[i * 4 + 3] = Math.round(v * 255);
  }
  g.putImageData(img, 0, 0);
  a = new Float32Array(0);
  return c;
}
