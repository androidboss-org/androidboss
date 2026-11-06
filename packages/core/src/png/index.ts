import { crc32 } from '../zip/index.ts';

/**
 * Encodes RGBA pixels as an 8-bit RGB PNG (colour type 2, no alpha channel).
 * The App Store rejects app icons that contain an alpha channel, and canvas
 * `toBlob` always writes RGBA, so iOS icons go through this instead.
 * Uses CompressionStream('deflate'), available in modern browsers and Node 18+.
 */
export async function encodeRgbPng(width: number, height: number, rgba: ArrayLike<number>): Promise<Uint8Array> {
  if (rgba.length !== width * height * 4) throw new Error('Pixel buffer does not match dimensions');

  // Each scanline: filter byte 0 (None) + RGB triples.
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    let o = y * stride + 1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = rgba[i]!;
      raw[o++] = rgba[i + 1]!;
      raw[o++] = rgba[i + 2]!;
    }
  }

  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());

  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // bit depth 8, colour type RGB, deflate, adaptive filter, no interlace

  const chunks = [chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())];
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const out = new Uint8Array(signature.length + chunks.reduce((n, c) => n + c.length, 0));
  out.set(signature, 0);
  let p = signature.length;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/**
 * Encodes RGBA pixels as an 8-bit RGBA PNG (colour type 6), the same in the
 * browser and Node, for images where transparency matters (notification icons).
 */
export async function encodeRgbaPng(width: number, height: number, rgba: ArrayLike<number>): Promise<Uint8Array> {
  if (rgba.length !== width * height * 4) throw new Error('Pixel buffer does not match dimensions');
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) for (let i = 0; i < width * 4; i++) raw[y * stride + 1 + i] = rgba[y * width * 4 + i]!;
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, width);
  iv.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // bit depth 8, colour type RGBA
  const chunks = [chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', new Uint8Array())];
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const out = new Uint8Array(signature.length + chunks.reduce((n, c) => n + c.length, 0));
  out.set(signature, 0);
  let p = signature.length;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
