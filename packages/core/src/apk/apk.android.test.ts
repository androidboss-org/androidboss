/**
 * Re-checks the analyzer against Google's tools on the fixtures (CHECK_ANDROID=1):
 * aapt2 dump badging, apkanalyzer, apksigner and zipalign.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aapt2, enabled, sdk } from '../testing/android.ts';
import { analyzePackage } from './index.ts';

const dir = new URL('./fixtures/', import.meta.url).pathname;
const tool = (name: string) => (aapt2 ? join(aapt2, '..', name) : '');
const apkanalyzer = sdk ? join(sdk, 'cmdline-tools', 'latest', 'bin', 'apkanalyzer') : '';
const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

describe.skipIf(!enabled || !aapt2 || !existsSync(apkanalyzer))('APK analysis against Google’s tools', () => {
  it.each(['good.apk', 'bad.apk'])('%s matches', { timeout: 120_000 }, async (name) => {
    const file = join(dir, name);
    const r = await analyzePackage(new Uint8Array(readFileSync(file)));
    const badging = run(aapt2!, ['dump', 'badging', file]);
    expect(badging).toContain(`package: name='${r.manifest!.package}'`);
    expect(badging).toContain(`targetSdkVersion:'${r.manifest!.targetSdk}'`);
    expect(badging).toContain(`compileSdkVersion='${r.manifest!.compileSdk}'`);
    expect([...badging.matchAll(/^uses-permission: name='([^']+)'/gm)].map((m) => m[1]).sort()).toEqual([...r.manifest!.permissions].sort());

    const refs = run(apkanalyzer, ['dex', 'references', file]).trim().split('\n').map((l) => l.split('\t'));
    expect(refs.map(([f, n]) => `${f}:${n}`)).toEqual(r.dex.map((d) => `${d.file}:${d.methods}`));

    const certs = run(tool('apksigner'), ['verify', '--print-certs', '-v', file]);
    expect(certs).toContain(`certificate SHA-256 digest: ${r.signing.sha256!.replace(/:/g, '').toLowerCase()}`);
    for (const v of ['v2', 'v3']) expect(certs).toContain(`Verified using ${v} scheme (APK Signature Scheme ${v}): ${r.signing.schemes.includes(v)}`);

    let aligned = true;
    try {
      run(tool('zipalign'), ['-c', '-P', '16', '4', file]);
    } catch {
      aligned = false;
    }
    expect(aligned).toBe(r.native.every((n) => n.zipAligned16 !== false));
  });
});
