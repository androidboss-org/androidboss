/**
 * Builds an iOS framework from the samples with Kotlin/Native, then type-checks
 * the Swift this module writes against it with swiftc. Every call, type and
 * protocol conformance in the generated file must match the real header.
 * Opt-in (needs Xcode, and network for the first run):
 *   npm run test:kmp -w @androidboss/core
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findGradle } from '../testing/gradle.ts';
import { SWIFT_INTEROP_CHECKED_WITH, swiftInterop } from './index.ts';
import { EDGE_CASES, SAMPLE } from './samples.ts';

const gradle = process.env.CHECK_KMP && process.platform === 'darwin' ? findGradle() : null;
const env = { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer' };

const BUILD = `plugins {
    id("org.jetbrains.kotlin.multiplatform") version "${SWIFT_INTEROP_CHECKED_WITH.kotlin}"
}

kotlin {
    iosSimulatorArm64 { binaries.framework { baseName = "Shared" } }
    sourceSets {
        commonMain.dependencies { implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2") }
    }
}
`;

const FILES = { 'Shared.kt': SAMPLE, 'Edge.kt': EDGE_CASES };

describe.skipIf(!gradle)('Swift interop against a real framework', () => {
  it('type-checks the generated Swift for every sample', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kmp-swift-interop-'));
    try {
      writeFileSync(join(dir, 'settings.gradle.kts'), 'rootProject.name = "probe"\npluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { google(); mavenCentral() } }\ninclude(":shared")\n');
      writeFileSync(join(dir, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx4g\n');
      const src = join(dir, 'shared/src/commonMain/kotlin');
      mkdirSync(src, { recursive: true });
      writeFileSync(join(dir, 'shared/build.gradle.kts'), BUILD);
      for (const [name, code] of Object.entries(FILES)) writeFileSync(join(src, name), code);

      const build = spawnSync(gradle!, ['--console=plain', ':shared:linkDebugFrameworkIosSimulatorArm64'], { cwd: dir, encoding: 'utf8', timeout: 1_500_000, env });
      expect(build.status, `${build.stdout}\n${build.stderr}`.split('\n').filter((l) => /^e: |FAILED|error:/.test(l)).join('\n') || build.stderr.slice(-3000)).toBe(0);

      const frameworks = join(dir, 'shared/build/bin/iosSimulatorArm64/debugFramework');
      const header = readFileSync(join(frameworks, 'Shared.framework/Headers/Shared.h'), 'utf8');
      expect(header).toContain('swift_name("SharedKt")');

      for (const [name, code] of Object.entries(FILES)) {
        const swift = swiftInterop(code, { fileName: name, module: 'Shared' }).swiftFile;
        const file = join(dir, `${name}.swift`);
        writeFileSync(file, swift);
        const check = spawnSync('xcrun', ['--sdk', 'iphonesimulator', 'swiftc', '-typecheck', '-target', 'arm64-apple-ios16.0-simulator', '-F', frameworks, file], { encoding: 'utf8', env });
        const errors = check.stderr.split('\n').filter((l) => l.includes('error:'));
        expect(errors, `${name}:\n${errors.join('\n')}\n\n${swift}`).toEqual([]);
        expect(check.status).toBe(0);
      }
    } finally {
      if (!process.env.KEEP_KMP_PROBE) rmSync(dir, { recursive: true, force: true });
      else console.log(`kept ${dir}`);
    }
  }, 1_800_000);
});
