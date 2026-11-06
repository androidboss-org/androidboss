/**
 * Validates vector converter output with Android's own tools (opt-in, needs a local SDK):
 *   npm run test:android -w @androidboss/core
 * - VectorDrawable XML must compile and link with aapt2 against android.jar.
 * - ImageVector Kotlin must compile against the Compose ui classes.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aapt2, androidJar, hasKotlinc, kotlinc } from '../testing/android.ts';
import { convertVector } from './index.ts';
import { SAMPLE_SVG } from './fixtures.ts';

describe.skipIf(!aapt2 || !androidJar || !existsSync(aapt2 ?? ''))('VectorDrawable output with aapt2', () => {
  it('compiles and links', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vd-aapt2-'));
    try {
      mkdirSync(join(dir, 'res/drawable'), { recursive: true });
      writeFileSync(join(dir, 'res/drawable/sample.xml'), convertVector(SAMPLE_SVG, 'vector-drawable').output);
      writeFileSync(join(dir, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.vd"/>');
      execFileSync(aapt2!, ['compile', 'res/drawable/sample.xml', '-o', 'compiled.zip'], { cwd: dir });
      const link = spawnSync(aapt2!, ['link', '-I', androidJar!, '--manifest', 'AndroidManifest.xml', '-o', 'out.apk', 'compiled.zip'], { cwd: dir, encoding: 'utf8' });
      expect(link.status, link.stderr).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const COMPOSE_UI: [string, string][] = [
  ['androidx.compose.ui', 'ui-android'],
  ['androidx.compose.ui', 'ui-graphics-android'],
  ['androidx.compose.ui', 'ui-unit-android'],
  ['androidx.compose.ui', 'ui-geometry-android'],
  ['androidx.compose.runtime', 'runtime-android'],
];

describe.skipIf(!hasKotlinc(COMPOSE_UI))('ImageVector output with kotlinc + Compose', () => {
  it('compiles in both styles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'iv-kotlinc-'));
    try {
      const run = kotlinc(
        dir,
        {
          'Cached.kt': convertVector(SAMPLE_SVG, 'image-vector', { name: 'Check', packageName: 'com.example.icons' }).output,
          'Plain.kt': convertVector(SAMPLE_SVG, 'image-vector', { name: 'CheckPlain', style: 'val', packageName: 'com.example.icons' }).output,
        },
        COMPOSE_UI,
      );
      expect(run.status, run.stderr).toBe(0);
      expect(existsSync(join(dir, 'out/com/example/icons/CachedKt.class'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});
