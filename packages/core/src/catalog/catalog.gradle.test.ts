/**
 * Validates generated catalogs with real Gradle: writes the TOML into a throwaway
 * project and compiles a build script that resolves every accessor the converter
 * emitted (no network needed). Opt-in because it starts a Gradle daemon:
 *   npm run test:gradle -w @androidboss/core
 * Uses $GRADLE or the newest Gradle in ~/.gradle/wrapper/dists.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { convertToCatalog } from './index.ts';
import { SAMPLE_KTS } from './index.test.ts';

function findGradle(): string | null {
  if (process.env.GRADLE && existsSync(process.env.GRADLE)) return process.env.GRADLE;
  const dists = join(homedir(), '.gradle/wrapper/dists');
  if (!existsSync(dists)) return null;
  const candidates = readdirSync(dists)
    .filter((d) => /^gradle-\d/.test(d))
    .flatMap((d) => readdirSync(join(dists, d)).map((h) => join(dists, d, h, d.replace(/-(bin|all)$/, ''), 'bin', 'gradle')))
    .filter(existsSync)
    .sort();
  return candidates.at(-1) ?? null;
}

const gradle = process.env.CHECK_GRADLE ? findGradle() : null;

describe.skipIf(!gradle)('generated catalog with real Gradle', () => {
  it('compiles every accessor the rewritten build file uses', () => {
    const r = convertToCatalog(SAMPLE_KTS, 'kts');
    const accessors = [...new Set(r.buildFile.match(/libs\.[\w.]+?(?:\.asProvider\(\)|(?=[^\w.]))/g) ?? [])];
    expect(accessors.length).toBeGreaterThan(10);

    const dir = mkdtempSync(join(tmpdir(), 'catalog-gradle-'));
    try {
      mkdirSync(join(dir, 'gradle'));
      writeFileSync(join(dir, 'gradle/libs.versions.toml'), r.toml);
      writeFileSync(join(dir, 'settings.gradle.kts'), 'rootProject.name = "catalog-check"\n');
      writeFileSync(
        join(dir, 'build.gradle.kts'),
        accessors.map((a) => (a.startsWith('libs.plugins.') ? `println("PLUGIN " + ${a}.get().pluginId)` : `println("LIB " + ${a}.get())`)).join('\n') + '\n',
      );
      const run = spawnSync(gradle!, ['help', '--offline', '-q', '--no-daemon'], { cwd: dir, encoding: 'utf8', timeout: 240_000 });
      expect(run.status, run.stderr + run.stdout).toBe(0);
      expect(run.stdout).toContain('LIB com.squareup.retrofit2:retrofit:2.11.0');
      expect(run.stdout).toContain('LIB androidx.compose.ui:ui');
      expect(run.stdout).toContain('PLUGIN org.jetbrains.kotlin.android');
      expect(run.stdout.match(/^(LIB|PLUGIN) /gm)).toHaveLength(accessors.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300_000);
});

