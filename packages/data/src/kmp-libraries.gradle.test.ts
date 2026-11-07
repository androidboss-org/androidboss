/**
 * Builds one bundle of every library with bundleSnippets, the function behind
 * the page's "selected libraries" output, writes its libs.versions.toml and
 * source sets into a real Kotlin Multiplatform project, and compiles it for
 * Android, iOS and JVM. Proves the snippets are valid, every version resolves,
 * libraries without a JVM target land in the right source sets, and each
 * library loads with our Kotlin version.
 * Opt-in (downloads every library on the first run; needs ANDROID_HOME and Xcode):
 *   npm run test:gradle -w @androidboss/data
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The Gradle lookup lives with the other toolchain helpers in core.
import { findGradle } from '../../core/src/testing/gradle.ts';
import { bundleSnippets, kmpLibraries } from './kmp-libraries.ts';

const KOTLIN = '2.4.21';
const AGP = '9.5.1';
const gradle = process.env.CHECK_GRADLE && process.platform === 'darwin' && process.env.ANDROID_HOME ? findGradle() : null;

describe.skipIf(!gradle)('KMP libraries in a real project', () => {
  it('resolves and compiles every library for Android, iOS and JVM', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kmp-libraries-'));
    try {
      const bundle = bundleSnippets(kmpLibraries, ['android', 'ios', 'jvm']);
      mkdirSync(join(dir, 'gradle'));
      writeFileSync(join(dir, 'gradle/libs.versions.toml'), bundle.toml);
      writeFileSync(join(dir, 'settings.gradle.kts'), 'rootProject.name = "probe"\npluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { google(); mavenCentral() } }\ninclude(":shared")\n');
      writeFileSync(join(dir, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx6g\nandroid.useAndroidX=true\n');
      writeFileSync(join(dir, 'local.properties'), `sdk.dir=${process.env.ANDROID_HOME}\n`);
      mkdirSync(join(dir, 'shared/src/commonMain/kotlin'), { recursive: true });
      writeFileSync(join(dir, 'shared/src/commonMain/kotlin/Probe.kt'), 'fun probe(): String = "ok"\n');
      writeFileSync(
        join(dir, 'shared/build.gradle.kts'),
        `plugins {
    id("org.jetbrains.kotlin.multiplatform") version "${KOTLIN}"
    id("com.android.kotlin.multiplatform.library") version "${AGP}"
}

kotlin {
    android {
        namespace = "dev.probe"
        compileSdk = 36
        minSdk = 24
    }
    jvm()
    iosSimulatorArm64()
    sourceSets {
${bundle.sourceSets}
    }
}
`,
      );
      const r = spawnSync(gradle!, ['--console=plain', '--continue', ':shared:compileAndroidMain', ':shared:compileKotlinJvm', ':shared:compileKotlinIosSimulatorArm64'], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 2_400_000,
        env: { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer' },
      });
      const log = `${r.stdout}\n${r.stderr}`;
      expect(r.status, log.split('\n').filter((l) => /^e: |Could not (find|resolve)|FAILED|incompatible|Incompatible/.test(l)).join('\n') || log.slice(-4000)).toBe(0);
    } finally {
      if (!process.env.KEEP_GRADLE_PROBE) rmSync(dir, { recursive: true, force: true });
      else console.log(`kept ${dir}`);
    }
  }, 2_700_000);
});
