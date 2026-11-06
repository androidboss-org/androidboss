import { describe, expect, it } from 'vitest';
import { bundleSnippets, gradleSnippets, kmpLibraries, LIBRARY_CATEGORIES, LIBRARY_SOURCES, targetGroupOf } from './kmp-libraries.ts';

describe('KMP libraries', () => {
  it('has published data for every curated library', () => {
    const missing = LIBRARY_SOURCES.filter((s) => !kmpLibraries.some((l) => l.coordinates === s.coordinates)).map((s) => s.coordinates);
    expect(missing, 'run scripts/update-kmp-libraries.mts').toEqual([]);
  });

  it('lists each library once, in a known category, with an https link', () => {
    const coords = LIBRARY_SOURCES.map((s) => s.coordinates);
    expect(new Set(coords).size).toBe(coords.length);
    for (const s of LIBRARY_SOURCES) {
      expect(LIBRARY_CATEGORIES.map((c) => c.id), s.coordinates).toContain(s.category);
      expect(s.url, s.coordinates).toMatch(/^https:\/\//);
      expect(s.coordinates, s.coordinates).toMatch(/^[\w.-]+:[\w.-]+$/);
      expect(s.description.length, s.coordinates).toBeLessThanOrEqual(110);
    }
  });

  it('every library supports Android and iOS, the reason this list exists', () => {
    for (const l of kmpLibraries) {
      expect(l.targets, l.coordinates).toContain('android');
      expect(l.targets, l.coordinates).toContain('ios');
    }
  });

  it('reads targets from Gradle module metadata attributes', () => {
    expect(targetGroupOf({ 'org.jetbrains.kotlin.platform.type': 'androidJvm' })).toBe('android');
    expect(targetGroupOf({ 'org.jetbrains.kotlin.platform.type': 'jvm', 'org.gradle.jvm.environment': 'android' })).toBe('android');
    expect(targetGroupOf({ 'org.jetbrains.kotlin.platform.type': 'jvm', 'org.gradle.jvm.environment': 'standard-jvm' })).toBe('jvm');
    expect(targetGroupOf({ 'org.jetbrains.kotlin.platform.type': 'native', 'org.jetbrains.kotlin.native.target': 'ios_simulator_arm64' })).toBe('ios');
    expect(targetGroupOf({ 'org.jetbrains.kotlin.platform.type': 'native', 'org.jetbrains.kotlin.native.target': 'mingw_x64' })).toBe('windows');
    expect(targetGroupOf({ 'org.jetbrains.kotlin.platform.type': 'wasm', 'org.jetbrains.kotlin.wasm.target': 'wasi' })).toBe('wasmWasi');
    expect(targetGroupOf({ 'org.jetbrains.kotlin.platform.type': 'wasm', 'org.jetbrains.kotlin.wasm.target': 'js' })).toBe('wasmJs');
    expect(targetGroupOf({ 'org.jetbrains.kotlin.platform.type': 'common' })).toBeNull();
  });

  it('writes version catalog entries Gradle accepts', () => {
    // Gradle alias rule: starts with a lowercase letter; letters, digits, - _ . after that.
    for (const l of kmpLibraries) {
      const s = gradleSnippets(l);
      const alias = /\[libraries\]\n([^ ]+) =/.exec(s.toml)![1]!;
      expect(alias, l.coordinates).toMatch(/^[a-z][a-zA-Z0-9_.-]+$/);
      expect(s.kts).toContain(`libs.${alias.replace(/[-_]/g, '.')}`);
      expect(s.toml).toContain(`module = "${l.coordinates}"`);
    }
    expect(gradleSnippets({ group: 'io.ktor', artifact: 'ktor-client-core', version: '3.6.1' }).kts).toContain('implementation(libs.ktor.client.core)');
    expect(gradleSnippets({ group: 'app.cash.sqldelight', artifact: 'runtime', version: '2.4.1' }).kts).toContain('implementation(libs.sqldelight.runtime)');
  });

  it('gives every library its own alias, so snippets can share one catalog', () => {
    const aliases = kmpLibraries.map((l) => /\[libraries\]\n([^ ]+) =/.exec(gradleSnippets(l).toml)![1]);
    expect(aliases.filter((a, i) => aliases.indexOf(a) !== i)).toEqual([]);
  });

  it('bundles a selection, moving libraries without a target out of commonMain', () => {
    const pick = (c: string) => kmpLibraries.find((l) => l.coordinates === c)!;
    const b = bundleSnippets([pick('io.ktor:ktor-client-core'), pick('com.liftric:kvault')], ['android', 'ios', 'jvm']);
    expect(b.sourceSets).toContain('commonMain.dependencies {\n            implementation(libs.ktor.client.core)');
    expect(b.sourceSets).toContain('androidMain.dependencies {\n            implementation(libs.kvault)');
    expect(b.sourceSets).toContain('iosMain.dependencies {\n            implementation(libs.kvault)');
    expect(b.sourceSets).not.toContain('jvmMain');
    expect(b.partial.map((p) => [p.lib.name, p.missing])).toEqual([['KVault', ['jvm']]]);
    expect(b.toml).toMatch(/^\[versions\]\nktor-client-core = ".+"\nkvault = /);
  });
});
