/** Image loading helpers shared by the game and the editor. */

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Couldn't load image ${url}`));
    img.src = url;
  });
}

export function canvasFromImage(img: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

export async function loadCanvas(url: string): Promise<HTMLCanvasElement> {
  return canvasFromImage(await loadImage(url));
}

export async function canvasFromBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try { return await loadCanvas(url); } finally { URL.revokeObjectURL(url); }
}

/** Turn a glow mask into pure brightness: white where it glows, black elsewhere (transparency counts as black). */
export function maskToGlow(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(((d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * d[i + 3]) / 255);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Chequered stand-in for an image that failed to load, so a missing file is obvious but harmless. */
export function missingImage(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(w));
  c.height = Math.max(8, Math.round(h));
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < c.height; y += 4) for (let x = 0; x < c.width; x += 4) {
    ctx.fillStyle = ((x + y) / 4) % 2 ? '#ff3fd2' : '#2a0f26';
    ctx.fillRect(x, y, 4, 4);
  }
  return c;
}
