import { describe, expect, it } from 'vitest';
import { AGP_GRADLE, checkVersions, CMP_COMPOSE, compareVersions, COMPOSE_COMPILER, KGP } from './index.ts';

const statuses = (v: Parameters<typeof checkVersions>[0]) => checkVersions(v).map((c) => `${c.status}: ${c.title}`);

describe('compareVersions', () => {
  it('compares numerically', () => {
    expect(compareVersions('8.10', '8.9')).toBe(1);
    expect(compareVersions('2.1.0', '2.1')).toBe(0);
    expect(compareVersions('9.3.1', '9.3.0')).toBe(1);
  });
});

describe('data', () => {
  it('is sorted newest first and well formed', () => {
    for (const table of [AGP_GRADLE, COMPOSE_COMPILER, CMP_COMPOSE]) {
      for (let i = 1; i < table.length; i++) expect(compareVersions(table[i - 1]![0], table[i]![0])).toBe(1);
    }
    for (let i = 1; i < KGP.length; i++) expect(compareVersions(KGP[i - 1]!.from, KGP[i]!.to)).toBe(1);
  });
});

describe('checkVersions', () => {
  it('passes a modern consistent set', () => {
    const r = checkVersions({ kotlin: '2.4.21', agp: '9.3.0', gradle: '9.6.0', compileSdk: '37' });
    expect(r.every((c) => c.status === 'ok')).toBe(true);
  });

  it('flags Gradle too old for AGP', () => {
    expect(statuses({ agp: '8.7.3', gradle: '8.6' })).toEqual(['error: AGP 8.7.3 needs Gradle 8.9 or newer']);
  });

  it('warns when AGP is newer than Kotlin was tested with', () => {
    expect(statuses({ kotlin: '2.4.21', agp: '9.5.0' })).toContain('warn: AGP 9.5.0 is newer than Kotlin 2.4.21 was tested with');
  });

  it('flags a Compose Compiler / Kotlin mismatch before Kotlin 2.0', () => {
    const r = checkVersions({ kotlin: '1.9.22', composeCompiler: '1.5.3' });
    expect(r.find((c) => c.title.startsWith('Compose Compiler'))).toMatchObject({ status: 'error', detail: 'For Kotlin 1.9.22, use Compose Compiler 1.5.10.' });
  });

  it('points Kotlin 2.0+ to the compose compiler plugin', () => {
    expect(statuses({ kotlin: '2.1.0', composeCompiler: '1.5.15' })).toContain('warn: Use the Compose Compiler Gradle plugin');
  });

  it('checks KSP in both version schemes', () => {
    expect(statuses({ kotlin: '2.1.0', ksp: '2.0.21-1.0.28' })[1]).toBe('error: KSP 2.0.21-1.0.28 is built for Kotlin 2.0.21');
    expect(statuses({ kotlin: '2.1.0', ksp: '2.1.0-1.0.29' })[1]).toBe('ok: KSP 2.1.0-1.0.29 matches Kotlin 2.1.0');
    expect(statuses({ ksp: '2.3.4' })).toEqual(['ok: KSP 2.3.4 isn’t tied to a Kotlin version']);
  });

  it('requires Kotlin 2.1 for Compose Multiplatform 1.8+', () => {
    expect(statuses({ kotlin: '2.0.21', cmp: '1.8.2' })).toContain('error: Compose Multiplatform 1.8.2 needs Kotlin 2.1.0+');
    expect(statuses({ kotlin: '2.2.20', cmp: '1.12.2' })).toContain('ok: Compose Multiplatform 1.12.2 is based on Jetpack Compose 1.12.1');
  });

  it('checks compileSdk against AGP', () => {
    expect(statuses({ agp: '8.13.0', compileSdk: '37' })).toEqual(['error: API 37 needs AGP 9.1.1 or newer']);
  });

  it('rejects non-versions', () => {
    expect(statuses({ kotlin: 'latest' })[0]).toMatch(/^error: Kotlin "latest"/);
  });

  it('accepts pre-release versions', () => {
    expect(statuses({ agp: '8.12.0-alpha02', gradle: '8.13' })).toEqual(['ok: AGP 8.12.0-alpha02 works with Gradle 8.13']);
    expect(statuses({ kotlin: '2.2.0-RC2' }).every((s) => !s.startsWith('error'))).toBe(true);
  });
});
