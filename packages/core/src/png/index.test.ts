import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../zip/index.ts';
import { encodeRgbPng } from './index.ts';

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
}

describe('encodeRgbPng', () => {
  it('writes an RGB PNG with valid chunks and the original pixels', async () => {
    const w = 3;
    const h = 2;
    const rgba = Uint8Array.from({ length: w * h * 4 }, (_, i) => (i % 4 === 3 ? 128 : i * 10));
    const png = await encodeRgbPng(w, h, rgba);
    const v = new DataView(png.buffer);

    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(new TextDecoder().decode(png.subarray(12, 16))).toBe('IHDR');
    expect(v.getUint32(16)).toBe(w);
    expect(v.getUint32(20)).toBe(h);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(2); // RGB, no alpha
    expect(v.getUint32(29)).toBe(crc32(png.subarray(12, 29)));

    const idatLen = v.getUint32(33);
    expect(new TextDecoder().decode(png.subarray(37, 41))).toBe('IDAT');
    const raw = await inflate(png.subarray(41, 41 + idatLen));
    expect(raw.length).toBe((w * 3 + 1) * h);
    expect([...raw.subarray(0, 4)]).toEqual([0, 0, 10, 20]); // filter 0, then R G B of pixel 0
    expect(raw[4]).toBe(40); // R of pixel 1 (alpha byte 30 skipped)
  });

  it('is readable by the system image tools', async () => {
    let sips = true;
    try {
      execFileSync('which', ['sips']);
    } catch {
      sips = false;
    }
    if (!sips) return; // macOS only
    const dir = mkdtempSync(join(tmpdir(), 'png-test-'));
    try {
      const file = join(dir, 'a.png');
      writeFileSync(file, await encodeRgbPng(16, 8, new Uint8Array(16 * 8 * 4).fill(200)));
      const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'hasAlpha', file]).toString();
      expect(out).toMatch(/pixelWidth: 16/);
      expect(out).toMatch(/pixelHeight: 8/);
      expect(out).toMatch(/hasAlpha: no/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects mismatched buffers', async () => {
    await expect(encodeRgbPng(2, 2, new Uint8Array(3))).rejects.toThrow();
  });
});
