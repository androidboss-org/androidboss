/**
 * Compiles generated Color.kt + Theme.kt against material3 from the Gradle cache
 * (opt-in: npm run test:android -w @androidboss/core). Checks every ColorScheme
 * parameter name and the dynamic-colour APIs exist with the expected signatures.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasKotlinc, kotlinc } from '../testing/android.ts';
import { generateTheme } from './index.ts';

const MATERIAL3: [string, string][] = [
  ['androidx.compose.material3', 'material3-android'],
  ['androidx.compose.foundation', 'foundation-android'],
  ['androidx.compose.foundation', 'foundation-layout-android'],
  ['androidx.compose.ui', 'ui-android'],
  ['androidx.compose.ui', 'ui-graphics-android'],
  ['androidx.compose.ui', 'ui-unit-android'],
  ['androidx.compose.ui', 'ui-text-android'],
  ['androidx.compose.ui', 'ui-geometry-android'],
  ['androidx.compose.runtime', 'runtime-android'],
];

describe.skipIf(!hasKotlinc(MATERIAL3))('generated theme compiles against material3', () => {
  const cases = [
    ['android', { dynamicColor: true, fixedColors: true }],
    ['android-basic', { dynamicColor: false, fixedColors: false }],
    ['multiplatform', { platform: 'multiplatform' as const }],
  ] as const;
  for (const [label, opts] of cases) {
    it(label, () => {
      const dir = mkdtempSync(join(tmpdir(), `theme-${label}-`));
      try {
        const t = generateTheme({ seed: '#0F8A4A', packageName: 'com.example.ui.theme', ...opts });
        const run = kotlinc(dir, { 'Color.kt': t.colorKt, 'Theme.kt': t.themeKt }, MATERIAL3);
        expect(run.status, run.stderr).toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }, 300_000);
  }
});
