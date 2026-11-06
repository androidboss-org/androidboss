import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readElf } from './binary.ts';
import { analyzePackage } from './index.ts';

// Fixtures: small packages built from the demo app in ../logcat/fixtures/anrdemo with
// aapt2, d8, zipalign and apksigner, signed with a throwaway test key (CN=AndroidBoss Test).
//   good.apk  arm64 libshop.so with 16 KB LOAD alignment, stored and 16 KB aligned
//             (zipalign -P 16), signed v1 + v2 + v3.
//   bad.apk   the same with a 4 KB aligned library, signed with apksigner
//             --alignment-preserved so it stays misaligned.
//   shop.aab  a bundle module from aapt2 link --proto-format, with the 4 KB library.
// The values below are what aapt2, apkanalyzer, apksigner and zipalign report for them.
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const CERT = '0B:31:92:29:61:29:AC:1F:DE:3B:62:BA:29:CA:15:A3:07:B6:B1:92:BE:BE:2C:09:BC:B0:5D:6A:74:05:B5:9C';

describe('analyzePackage', () => {
  it('reads an APK like aapt2, apkanalyzer and apksigner do', async () => {
    const r = await analyzePackage(fixture('good.apk'));
    expect(r.kind).toBe('apk');
    expect(r.manifest).toMatchObject({ package: 'dev.androidboss.anrdemo', minSdk: 26, targetSdk: 36, compileSdk: 37, debuggable: true });
    expect(r.manifest!.permissions).toHaveLength(8);
    expect(r.manifest!.permissions).toContain('android.permission.POST_NOTIFICATIONS');
    expect(r.manifest!.components).toEqual([{ kind: 'activity', name: '.MainActivity', exported: true, hasIntentFilter: true }]);
    expect(r.dex).toEqual([{ file: 'classes.dex', version: '038', strings: 118, types: 41, fields: 4, methods: 51, classes: 8 }]);
    expect(r.topPackages).toEqual([{ name: 'dev.androidboss.anrdemo', classes: 8 }]);
    expect(r.signing).toEqual({ schemes: ['v1', 'v2', 'v3'], sha256: CERT });
    expect(r.manifest!.xml).toContain('android:name=".MainActivity"');
  });

  it('passes a 16 KB ready library and fails a 4 KB one', async () => {
    const good = await analyzePackage(fixture('good.apk'));
    expect(good.native).toEqual([{ path: 'lib/arm64-v8a/libshop.so', abi: 'arm64-v8a', size: 120, compressed: false, loadAlign: 16384, zipAligned16: true, ready16k: true }]);
    const bad = await analyzePackage(fixture('bad.apk'));
    expect(bad.native[0]).toMatchObject({ loadAlign: 4096, zipAligned16: false, ready16k: false });
    expect(bad.findings.filter((f) => f.level === 'error').map((f) => f.message.slice(0, 40))).toEqual([
      '1 64-bit native library has LOAD segment',
      '1 uncompressed native library isn’t 16 K',
      'android:debuggable="true": a debug build',
    ]);
  });

  it('reads an AAB with a protobuf manifest', async () => {
    const r = await analyzePackage(fixture('shop.aab'));
    expect(r.kind).toBe('aab');
    expect(r.modules).toEqual(['base']);
    expect(r.manifest).toMatchObject({ package: 'dev.androidboss.anrdemo', minSdk: 26, targetSdk: 36, compileSdk: 37 });
    expect(r.manifest!.permissions).toHaveLength(8);
    expect(r.dex[0]).toMatchObject({ file: 'base/dex/classes.dex', methods: 51, classes: 8 });
    expect(r.native[0]).toMatchObject({ abi: 'arm64-v8a', loadAlign: 4096, ready16k: false });
    expect(r.native[0]!.zipAligned16).toBeUndefined();
    expect(r.signing.schemes).toEqual([]);
    expect(r.categories.map((c) => c.category)).toContain('Bundle metadata');
  });

  it('groups sizes by category', async () => {
    const r = await analyzePackage(fixture('good.apk'));
    const by = Object.fromEntries(r.categories.map((c) => [c.category, c.files]));
    expect(by).toMatchObject({ 'Code (DEX)': 1, 'Resource table': 1, 'Native libraries': 1, Signature: 3 });
    expect(r.largest[0]!.compressed).toBeGreaterThanOrEqual(r.largest[1]!.compressed);
  });

  it('rejects things that are not packages', async () => {
    await expect(analyzePackage(new TextEncoder().encode('hello'))).rejects.toThrow(/Not a ZIP file/);
  });
});

describe('readElf', () => {
  it('ignores non-ELF data', () => {
    expect(readElf(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
