/**
 * The suggested newest versions resolve from the real repositories (CHECK_GRADLE=1):
 * an old build file is converted to a catalog, every applicable update is applied,
 * and Gradle resolves the release runtime classpath and applies the plugins.
 *
 *   CHECK_GRADLE=1 npx vitest run src/latest-versions.gradle.test.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyVersionUpdates, convertToCatalog } from '../../core/src/catalog/index.ts';
import { findGradle } from '../../core/src/testing/gradle.ts';
import { catalogUpdates } from './latest-versions.ts';

const SDK = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const gradle = process.env.CHECK_GRADLE && SDK ? findGradle() : undefined;

const OLD = `plugins {
    id("com.android.application") version "9.1.0"
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.0"
    id("com.google.devtools.ksp") version "2.2.0-2.0.2"
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.0")
    implementation(platform("androidx.compose:compose-bom:2024.09.00"))
    implementation("com.google.android.material:material:1.11.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.1")
}
`;

describe.skipIf(!gradle)('newest versions resolve with Gradle', () => {
  it('applies every update and resolves the result', { timeout: 900_000 }, () => {
    const r = convertToCatalog(OLD, 'kts');
    const updates = catalogUpdates([
      ...r.libraries.map((l) => ({ coordinates: `${l.group}:${l.name}`, kind: 'library' as const, ...(l.version ? { version: l.version } : {}), ...(l.versionRef ? { versionRef: l.versionRef } : {}) })),
      ...r.plugins.map((p) => ({ coordinates: p.id, kind: 'plugin' as const, version: p.version, ...(p.versionRef ? { versionRef: p.versionRef } : {}) })),
    ]);
    // Everything here is out of date, so every key should get an update.
    expect(updates.length).toBeGreaterThanOrEqual(10);
    const toml = applyVersionUpdates(r.toml, Object.fromEntries(updates.filter((u) => u.applicable).map((u) => [u.ref, u.latest])));

    const dir = mkdtempSync(join(tmpdir(), 'latest-versions-'));
    mkdirSync(join(dir, 'gradle'));
    mkdirSync(join(dir, 'app/src/main'), { recursive: true });
    writeFileSync(join(dir, 'gradle/libs.versions.toml'), toml);
    writeFileSync(join(dir, 'local.properties'), `sdk.dir=${SDK}\n`);
    writeFileSync(join(dir, 'settings.gradle.kts'), 'pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { google(); mavenCentral() } }\nrootProject.name = "latest"\ninclude(":app")\n');
    writeFileSync(join(dir, 'app/src/main/AndroidManifest.xml'), '<manifest />\n');
    const app = r.buildFile.replace(/plugins \{/, 'plugins {').concat('\nandroid {\n    namespace = "com.example.latest"\n    compileSdk = 36\n    defaultConfig { minSdk = 24 }\n}\n');
    writeFileSync(join(dir, 'app/build.gradle.kts'), app);

    const res = spawnSync(gradle!, ['-p', dir, '--console=plain', ':app:dependencies', '--configuration', 'releaseRuntimeClasspath'], { encoding: 'utf8', timeout: 900_000 });
    const out = `${res.stdout}\n${res.stderr}`;
    expect(res.status, out.slice(-3000)).toBe(0);
    expect(out, 'unresolved dependencies').not.toMatch(/FAILED/);
    for (const u of updates.filter((x) => x.applicable && !x.uses.every((c) => !c.includes(':')))) {
      expect(toml).toContain(`${u.ref} = "${u.latest}"`);
    }
  });
});
