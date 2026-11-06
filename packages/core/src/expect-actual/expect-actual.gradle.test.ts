/**
 * Compiles every template and the generated stubs in a real Kotlin
 * Multiplatform project for Android, JVM, iOS simulator, JS and Wasm, then
 * runs tests on the JVM and the iOS simulator. Opt-in (needs network for the
 * first run, ANDROID_HOME, and Xcode for iOS):
 *   npm run test:kmp -w @androidboss/core
 * Uses $GRADLE or the newest Gradle in ~/.gradle/wrapper/dists.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXPECT_ACTUAL_CHECKED_WITH, generateActuals, type Target } from './index.ts';
import { SAMPLE_EXPECTS } from './index.test.ts';
import { KOTLINX_BROWSER, TEMPLATES, templateFiles } from './templates.ts';
import { findGradle } from '../testing/gradle.ts';

const gradle = process.env.CHECK_KMP ? findGradle() : null;
const ALL: Target[] = ['android', 'ios', 'jvm', 'js', 'wasmJs'];
const ios = process.platform === 'darwin';

const BUILD = `import org.jetbrains.kotlin.gradle.ExperimentalWasmDsl

plugins {
    id("org.jetbrains.kotlin.multiplatform") version "${EXPECT_ACTUAL_CHECKED_WITH.kotlin}"
    id("com.android.kotlin.multiplatform.library") version "${EXPECT_ACTUAL_CHECKED_WITH.agp}"
}

kotlin {
    compilerOptions {
        freeCompilerArgs.add("-Xexpect-actual-classes")
        allWarningsAsErrors.set(true)
    }
    android {
        namespace = "dev.probe"
        compileSdk = 36
        minSdk = 24
    }
    jvm()
    ${ios ? 'iosSimulatorArm64()' : ''}
    js { browser() }
    @OptIn(ExperimentalWasmDsl::class)
    wasmJs { browser() }
    sourceSets {
        commonTest.dependencies { implementation(kotlin("test")) }
        wasmJsMain.dependencies { implementation("${KOTLINX_BROWSER}") }
    }
}
`;

/** Runtime checks: the generated code is called, not only compiled. */
const TESTS: Record<string, string> = {
  'commonTest/kotlin/dev/probe/CommonTest.kt': `package dev.probe

import dev.probe.platformname.platformName
import dev.probe.logger.logDebug
import dev.probe.language.preferredLanguageTag
import kotlin.test.Test
import kotlin.test.assertTrue

class CommonTest {
    @Test fun platformNameIsSet() = assertTrue(platformName().isNotBlank())
    @Test fun languageTagLooksLikeBcp47() = assertTrue(Regex("^[a-z]{2,3}(-[A-Za-z0-9]+)*$").matches(preferredLanguageTag()), preferredLanguageTag())
    @Test fun logs() = logDebug("probe", "hello from a test, 100% sure %@ %d")
}
`,
  'jvmTest/kotlin/dev/probe/StoreJvmTest.kt': `package dev.probe

import dev.probe.keyvalue.KeyValueStore
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class StoreJvmTest {
    @Test fun roundTrip() {
        val s = KeyValueStore("dev.probe.test")
        s.putString("k", "v")
        assertEquals("v", s.getString("k"))
        s.remove("k")
        assertNull(s.getString("k"))
    }
}
`,
  'iosTest/kotlin/dev/probe/StoreIosTest.kt': `package dev.probe

import dev.probe.keyvalue.KeyValueStore
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class StoreIosTest {
    @Test fun roundTrip() {
        val s = KeyValueStore()
        s.putString("k", "v")
        assertEquals("v", s.getString("k"))
        s.remove("k")
        assertNull(s.getString("k"))
    }
}
`,
};

function run(dir: string, args: string[]) {
  const r = spawnSync(gradle!, ['--console=plain', '--continue', ...args], { cwd: dir, encoding: 'utf8', timeout: 1_500_000, env: { ...process.env, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer' } });
  return { ok: r.status === 0, log: `${r.stdout}\n${r.stderr}` };
}

describe.skipIf(!gradle || !process.env.ANDROID_HOME)('expect/actual in a real KMP project', () => {
  it('compiles every template and the generated stubs for all targets, and runs them on JVM and iOS', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kmp-expect-actual-'));
    try {
      writeFileSync(join(dir, 'settings.gradle.kts'), 'rootProject.name = "probe"\npluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { google(); mavenCentral() } }\ninclude(":shared")\n');
      writeFileSync(join(dir, 'gradle.properties'), 'org.gradle.jvmargs=-Xmx4g\nandroid.useAndroidX=true\n');
      writeFileSync(join(dir, 'local.properties'), `sdk.dir=${process.env.ANDROID_HOME}\n`);
      mkdirSync(join(dir, 'shared'));
      writeFileSync(join(dir, 'shared/build.gradle.kts'), BUILD);

      const files = [
        ...TEMPLATES.flatMap((t) => templateFiles(t, `dev.probe.${t.id.replace(/-/g, '')}`, 'shared', ALL)),
        ...generateActuals(SAMPLE_EXPECTS, { fileName: 'Sample', module: 'shared', targets: ALL }).files,
      ];
      for (const f of files) {
        mkdirSync(join(dir, dirname(f.path)), { recursive: true });
        writeFileSync(join(dir, f.path), f.content);
      }
      for (const [path, content] of Object.entries(TESTS)) {
        if (!ios && path.startsWith('ios')) continue;
        mkdirSync(join(dir, 'shared/src', dirname(path)), { recursive: true });
        writeFileSync(join(dir, 'shared/src', path), content);
      }

      const compile = run(dir, [':shared:compileAndroidMain', ':shared:compileKotlinJvm', ':shared:compileKotlinJs', ':shared:compileKotlinWasmJs', ...(ios ? [':shared:compileKotlinIosSimulatorArm64'] : [])]);
      expect(compile.ok, compile.log.split('\n').filter((l) => /^(e|w): |FAILED/.test(l)).join('\n') || compile.log.slice(-3000)).toBe(true);

      const tests = run(dir, [':shared:jvmTest', ...(ios ? [':shared:iosSimulatorArm64Test'] : [])]);
      expect(tests.ok, tests.log.slice(-4000)).toBe(true);
    } finally {
      if (!process.env.KEEP_KMP_PROBE) rmSync(dir, { recursive: true, force: true });
      else console.log(`kept ${dir}`);
    }
  }, 1_800_000);
});
