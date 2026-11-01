/**
 * Small zip reading and writing, with no library: writing stores files as they are (images and sounds are already
 * compressed); reading understands stored and deflated entries (the usual kind, from a PC's "Send to → zip" or
 * 7-Zip), unpacked with the browser's own DecompressionStream.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date and time for the zip headers. */
function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A zip of these files (path → contents), stored without compression. */
export async function makeZip(files: { path: string; data: Blob | Uint8Array | string }[]): Promise<Blob> {
  const enc = new TextEncoder(), parts: BlobPart[] = [], central: Uint8Array[] = [];
  const { time, date } = dosTime(new Date());
  let offset = 0;
  for (const f of files) {
    const bytes = typeof f.data === 'string' ? enc.encode(f.data) : f.data instanceof Uint8Array ? f.data : new Uint8Array(await f.data.arrayBuffer());
    const name = enc.encode(f.path), crc = crc32(bytes);
    const head = new Uint8Array(30 + name.length), h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, crc, true);
    h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    head.set(name, 30);
    const cen = new Uint8Array(46 + name.length), c = new DataView(cen.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
    c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    cen.set(name, 46);
    parts.push(head, bytes);
    central.push(cen);
    offset += head.length + bytes.length;
  }
  const cenSize = central.reduce((s, x) => s + x.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cenSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

export interface ZipEntry { path: string; data: Uint8Array }

async function inflate(raw: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Blob([raw]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** The files in a zip (folders left out). Throws on something that isn't a zip it can read. */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer()), v = new DataView(buf.buffer);
  // The end-of-central-directory record is in the last 64 KB.
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('That isn’t a zip file');
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const dec = new TextDecoder(), out: ZipEntry[] = [];
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('The zip looks damaged');
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const path = dec.decode(buf.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith('/')) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.push({ path, data: raw.slice() });
    else if (method === 8) out.push({ path, data: await inflate(raw) });
    else throw new Error(`“${path}” is packed in a way this can’t open (method ${method})`);
  }
  return out;
}
