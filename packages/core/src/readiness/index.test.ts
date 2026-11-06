import { describe, expect, it } from 'vitest';
import { checkReadiness, detectVersions, filesToRead, isIgnoredPath, reportMarkdown, type ProjectSnapshot } from './index.ts';

const CATALOG = `[versions]
agp = "9.3.0"
kotlin = "2.4.21"
ksp = "2.3.0"

[libraries]
androidx-core = { module = "androidx.core:core-ktx", version = "1.17.0" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
`;

/** A well set up single-module app. */
function good(): ProjectSnapshot {
  const files: Record<string, string> = {
    'AGENTS.md': `# Shop\n\nAndroid app in Kotlin and Compose. MVVM with Hilt.\n\n## Commands\n\n- Build: \`./gradlew :app:assembleDebug\`\n- Test: \`./gradlew test\`\n- Lint: \`./gradlew ktlintCheck detekt\`\n${'More conventions. '.repeat(20)}`,
    'settings.gradle.kts': 'rootProject.name = "Shop"\ninclude(":app")\n',
    'build.gradle.kts': 'plugins {\n    alias(libs.plugins.android.application) apply false\n    id("io.gitlab.arturbosch.detekt") version "1.23.8"\n    id("org.jlleitschuh.gradle.ktlint") version "13.1.0"\n}\n',
    'app/build.gradle.kts': 'android {\n    compileSdk = 37\n}\nkotlin { jvmToolchain(21) }\ndependencies { implementation(libs.androidx.core) }\n',
    'gradle/libs.versions.toml': CATALOG,
    'gradle/wrapper/gradle-wrapper.properties': 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.6.0-bin.zip\n',
    'gradle.properties': 'org.gradle.caching=true\norg.gradle.configuration-cache=true\norg.gradle.parallel=true\n',
    '.gitignore': '/build\n.gradle/\nlocal.properties\n*.jks\n',
    '.github/workflows/ci.yml': 'jobs:\n  build:\n    steps:\n      - run: ./gradlew build test\n',
    '.claude/settings.json': '{"permissions":{"deny":["Read(./local.properties)"]}}',
    '.mcp.json': '{"mcpServers":{}}',
  };
  const paths = [
    ...Object.keys(files),
    'gradlew',
    'gradlew.bat',
    'README.md',
    'local.properties',
    'release.jks',
    '.claude/skills/release/SKILL.md',
    ...['A', 'B', 'C'].map((n) => `app/src/test/kotlin/com/example/${n}Test.kt`),
    'app/src/androidTest/kotlin/com/example/MainTest.kt',
    'app/build/intermediates/x.class',
  ];
  return { paths, files };
}

const byId = (r: ReturnType<typeof checkReadiness>, id: string) => r.checks.find((c) => c.id === id);

describe('filesToRead', () => {
  it('picks instructions, build files, configs and workflows, never build output', () => {
    const paths = ['AGENTS.md', 'app/AGENTS.md', 'app/build.gradle.kts', 'app/build/generated/build.gradle.kts', 'gradle/libs.versions.toml', '.github/workflows/ci.yml', '.cursor/rules/style.mdc', 'app/src/main/Main.kt', 'local.properties', 'release.jks', 'feature/.gitignore'];
    expect(filesToRead(paths)).toEqual(['AGENTS.md', 'app/AGENTS.md', 'app/build.gradle.kts', 'gradle/libs.versions.toml', '.github/workflows/ci.yml', '.cursor/rules/style.mdc', 'feature/.gitignore']);
  });

  it('ignores build, .gradle and VCS folders', () => {
    expect(isIgnoredPath('app/build/x')).toBe(true);
    expect(isIgnoredPath('.git/config')).toBe(true);
    expect(isIgnoredPath('app/src/main/build/Builder.kt')).toBe(true);
    expect(isIgnoredPath('app/src/main/Builder.kt')).toBe(false);
  });
});

describe('detectVersions', () => {
  it('reads versions from the catalog and wrapper', () => {
    expect(detectVersions(good())).toEqual({ gradle: '9.6.0', agp: '9.3.0', kotlin: '2.4.21', ksp: '2.3.0', compileSdk: '37' });
  });

  it('reads plugins block versions and legacy buildscript classpaths', () => {
    expect(detectVersions({ paths: [], files: { 'build.gradle.kts': 'plugins {\n  id("com.android.application") version "8.13.0" apply false\n  kotlin("android") version "2.2.21" apply false\n}' } })).toMatchObject({ agp: '8.13.0', kotlin: '2.2.21' });
    expect(detectVersions({ paths: [], files: { 'build.gradle': "buildscript {\n  ext.kotlin_version = '1.6.10'\n  dependencies {\n    classpath 'com.android.tools.build:gradle:7.2.2'\n    classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version\"\n  }\n}" } })).toMatchObject({ agp: '7.2.2', kotlin: '1.6.10' });
  });
});

describe('checkReadiness', () => {
  it('scores a well set up project 100', () => {
    const r = checkReadiness(good());
    expect(r.checks.filter((c) => c.status !== 'pass').map((c) => c.title)).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.project).toMatchObject({ kind: 'android', modules: ['app'], instructionFiles: ['AGENTS.md'] });
  });

  it('fails a bare project on instructions, tests and the wrapper', () => {
    const r = checkReadiness({ paths: ['app/build.gradle', 'app/src/main/java/com/x/Main.java'], files: { 'app/build.gradle': "android {\n compileSdk 34\n}\ndependencies {\n implementation 'com.squareup.retrofit2:retrofit:2.11.0'\n implementation 'com.google.code.gson:gson:2.11.0'\n implementation 'androidx.core:core-ktx:1.13.1'\n}" } });
    const fails = r.checks.filter((c) => c.status === 'fail').map((c) => c.id);
    expect(fails).toEqual(['instructions-file', 'gradle-wrapper', 'unit-tests', 'gitignore']);
    expect(byId(r, 'version-catalog')).toMatchObject({ status: 'warn', title: 'No version catalog' });
    expect(byId(r, 'readme')?.status).toBe('warn');
    expect(r.score).toBe(29);
  });

  it('flags committed keystores but not ignored ones or debug keys', () => {
    const s = good();
    s.files['.gitignore'] = '/build\n.gradle/\nlocal.properties\n';
    s.paths.push('app/debug.keystore', 'certs/ca.pem', 'certs/private_key.pem');
    const c = byId(checkReadiness(s), 'secrets')!;
    expect(c.status).toBe('fail');
    expect(c.title).toBe('Secrets may be committed: release.jks, certs/private_key.pem');
  });

  it('understands nested .gitignore files and globs', () => {
    const s = good();
    s.files['.gitignore'] = '/build\n.gradle/\nlocal.properties\n';
    s.files['app/.gitignore'] = '**/*.jks\n';
    s.paths = s.paths.filter((p) => p !== 'release.jks').concat('app/signing/release.jks', 'app/.gitignore');
    expect(byId(checkReadiness(s), 'secrets')!.status).toBe('pass');
  });

  it('suggests AGENTS.md when only CLAUDE.md exists, and build commands', () => {
    const s = good();
    s.files['CLAUDE.md'] = 'Use Compose. Keep view models small. '.repeat(20);
    delete s.files['AGENTS.md'];
    s.paths = s.paths.filter((p) => p !== 'AGENTS.md').concat('CLAUDE.md');
    const r = checkReadiness(s);
    expect(byId(r, 'agents-md')?.status).toBe('warn');
    expect(byId(r, 'instructions-commands')?.status).toBe('warn');
  });

  it('reports version mismatches from the compatibility data', () => {
    const s = good();
    s.files['gradle/wrapper/gradle-wrapper.properties'] = 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.9-all.zip\n';
    const c = byId(checkReadiness(s), 'versions')!;
    expect(c.status).toBe('fail');
    expect(c.title).toMatch(/^Version mismatch: AGP 9\.3\.0 needs Gradle/);
    expect(c.link?.href).toBe('/tools/compatibility-matrix/');
  });

  it('detects KMP, Journeys and CI that runs tests through a script', () => {
    const s = good();
    s.files['shared/build.gradle.kts'] = 'plugins { alias(libs.plugins.kotlinMultiplatform) }\n';
    s.files['.github/workflows/ci.yml'] = 'jobs:\n  t:\n    steps:\n      - run: bash scripts/ci/run-tests.sh\n';
    s.paths = s.paths.filter((p) => !p.includes('androidTest')).concat('shared/build.gradle.kts', 'app/src/journeysTest/login.journey.xml');
    const r = checkReadiness(s);
    expect(r.project.kind).toBe('kmp');
    expect(byId(r, 'ui-tests')).toMatchObject({ status: 'pass', detail: '1 Journeys test files.' });
    expect(byId(r, 'ci')?.status).toBe('pass');
  });

  it('gives half credit for warnings', () => {
    const s = good();
    s.files['gradle.properties'] = '';
    const r = checkReadiness(s);
    expect(byId(r, 'gradle-speed')?.status).toBe('warn');
    expect(r.score).toBe(98);
  });
});

describe('reportMarkdown', () => {
  it('lists fails before warnings, then what is in place', () => {
    const s = good();
    s.files['gradle.properties'] = '';
    s.paths = s.paths.filter((p) => p !== 'gradlew');
    const md = reportMarkdown(checkReadiness(s));
    expect(md).toMatch(/^# Agent readiness: \d+\/100\n\nProject: Android, 1 module · gradle 9\.6\.0, agp 9\.3\.0, kotlin 2\.4\.21, ksp 2\.3\.0, compileSdk 37\n\n## To do\n\n- \[ \] ❌ \*\*No Gradle wrapper\.\*\*/);
    expect(md.indexOf('Gradle speed settings missing')).toBeGreaterThan(md.indexOf('No Gradle wrapper'));
    expect(md).toContain('## Already in place\n\n- ✅ Agent instructions: AGENTS.md');
  });
});
