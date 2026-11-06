import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, createZip } from './index.ts';

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('createZip', () => {
  it('produces an archive that unzip can extract byte for byte', () => {
    const png = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) % 256);
    const zip = createZip([
      { path: 'res/values/colors.xml', data: '<resources/>\n' },
      { path: 'res/mipmap-mdpi/ic_launcher.png', data: png },
    ]);

    const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
    try {
      writeFileSync(join(dir, 'a.zip'), zip);
      execFileSync('unzip', ['-q', 'a.zip'], { cwd: dir });
      expect(readFileSync(join(dir, 'res/values/colors.xml'), 'utf8')).toBe('<resources/>\n');
      expect(new Uint8Array(readFileSync(join(dir, 'res/mipmap-mdpi/ic_launcher.png')))).toEqual(png);
      expect(execFileSync('unzip', ['-tq', 'a.zip'], { cwd: dir }).toString()).toMatch(/No errors/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is deterministic', () => {
    const e = [{ path: 'a.txt', data: 'x' }];
    expect(createZip(e)).toEqual(createZip(e));
  });
});
