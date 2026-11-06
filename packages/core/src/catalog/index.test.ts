import { describe, expect, it } from 'vitest';
import { convertToCatalog } from './index.ts';

export const SAMPLE_KTS = `plugins {
    id("com.android.application") version "8.7.3" apply false
    kotlin("android") version "2.1.0"
    id("com.google.devtools.ksp") version "2.1.0-1.0.29"
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    testImplementation("com.squareup.retrofit2:retrofit-mock:2.11.0")
    implementation("org.jetbrains.kotlin:kotlin-reflect:2.1.0")
    ksp("androidx.room:room-compiler:2.6.1")
    implementation("androidx.room:room-runtime:2.6.1")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("io.coil-kt:coil-compose:$coilVersion")
}
`;

describe('convertToCatalog (Kotlin DSL)', () => {
  const r = convertToCatalog(SAMPLE_KTS, 'kts');
  const lib = (name: string) => r.libraries.find((l) => l.name === name)!;

  it('extracts libraries with versions and BOM-managed ones without', () => {
    expect(lib('core-ktx')).toMatchObject({ group: 'androidx.core', version: '1.15.0' });
    expect(lib('ui').group).toBe('androidx.compose.ui');
    expect(lib('ui').version).toBeUndefined();
    expect(lib('ui').versionRef).toBeUndefined();
    expect(lib('compose-bom').version).toBe('2024.12.01');
  });

  it('shares a version key across a group', () => {
    expect(lib('lifecycle-runtime-ktx').versionRef).toBe('lifecycle');
    expect(lib('lifecycle-viewmodel-compose').versionRef).toBe('lifecycle');
    expect(lib('retrofit').versionRef).toBe('retrofit2');
    expect(lib('room-compiler').versionRef).toBe('room');
  });

  it('disambiguates artifacts with the same name', () => {
    expect(lib('junit').alias).not.toBe(r.libraries.filter((l) => l.name === 'junit')[1]?.alias);
    expect(new Set(r.libraries.map((l) => l.alias)).size).toBe(r.libraries.length);
  });

  it('maps plugins, reusing the Kotlin version', () => {
    expect(r.plugins.map((p) => [p.alias, p.id, p.versionRef])).toEqual([
      ['android-application', 'com.android.application', 'agp'],
      ['kotlin-android', 'org.jetbrains.kotlin.android', 'kotlin'],
      ['ksp', 'com.google.devtools.ksp', 'ksp'],
    ]);
  });

  it('rewrites the build file', () => {
    expect(r.buildFile).toContain('alias(libs.plugins.android.application) apply false');
    expect(r.buildFile).toContain('alias(libs.plugins.kotlin.android)');
    expect(r.buildFile).toContain('implementation(platform(libs.compose.bom))\n');
    expect(r.buildFile).toContain('testImplementation(libs.junit)\n');
    expect(r.buildFile).toContain('implementation(libs.retrofit.asProvider())');
    expect(r.buildFile).toContain('testImplementation(libs.retrofit.mock)');
    expect(r.buildFile).toContain('implementation(libs.converter.gson)');
    expect(r.buildFile).toContain('ksp(libs.room.compiler)');
    expect(r.buildFile).toContain('implementation("io.coil-kt:coil-compose:$coilVersion")');
    expect(r.buildFile).not.toMatch(/"androidx\.core:core-ktx/);
  });

  it('writes valid-looking TOML', () => {
    expect(r.toml).toContain('[versions]\nagp = "8.7.3"');
    expect(r.toml).toContain('core-ktx = { group = "androidx.core", name = "core-ktx", version.ref = "core-ktx" }');
    expect(r.toml).toContain('compose-ui = { group = "androidx.compose.ui", name = "ui" }');
    expect(r.toml).toContain('[plugins]\nandroid-application = { id = "com.android.application", version.ref = "agp" }');
  });

  it('warns about variable versions', () => {
    expect(r.warnings.some((w) => w.includes('coil-compose') && w.includes('variable'))).toBe(true);
  });
});

describe('convertToCatalog (Groovy DSL)', () => {
  it('rewrites Groovy notation', () => {
    const r = convertToCatalog(`plugins {\n    id 'com.android.library' version '8.7.3'\n}\ndependencies {\n    implementation 'androidx.appcompat:appcompat:1.7.0'\n    api "com.google.code.gson:gson:2.11.0"\n}\n`, 'groovy');
    expect(r.buildFile).toContain("alias(libs.plugins.android.library)");
    expect(r.buildFile).toContain('implementation libs.appcompat');
    expect(r.buildFile).toContain('api libs.gson');
  });
});

describe('aliases', () => {
  it('avoids reserved first segments', () => {
    const r = convertToCatalog('dependencies { implementation("com.example:versions:1.0") }');
    expect(r.libraries[0]!.alias).toBe('lib-versions');
  });

  it('handles map notation', () => {
    const r = convertToCatalog('dependencies { implementation(group = "com.example", name = "thing", version = "1.2") }');
    expect(r.buildFile).toContain('implementation(libs.thing)');
  });
});
