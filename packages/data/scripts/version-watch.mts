#!/usr/bin/env node
/**
 * Compares the toolchain versions this project states or was checked with against
 * the newest stable releases, and prints a Markdown report of what to update.
 * Exits 0 either way; with --json it prints { outdated, markdown }.
 *
 *   node --experimental-strip-types scripts/version-watch.mts
 */
import { AGP_GRADLE, CMP_COMPOSE, KGP } from '../../core/src/compat/data.ts';
import { CHECKED_VERSION as ANDROID_CLI_VERSION, CHECKED_ON as ANDROID_CLI_CHECKED_ON } from '../../core/src/android-cli/index.ts';
import { EXPECT_ACTUAL_CHECKED_WITH } from '../../core/src/expect-actual/index.ts';
import { cheatsheets } from '../../core/src/cheatsheets/index.ts';
import { VERSION_NAMES } from '../src/target-sdk.ts';
import { compareVersions, newestStable } from '../src/versions.ts';

const GOOGLE = 'https://dl.google.com/android/maven2';
const CENTRAL = 'https://repo1.maven.org/maven2';

async function text(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...init, headers: { 'user-agent': 'androidboss-version-watch' } });
    if (res.ok) return res;
    if (attempt >= 3 || res.status === 404) throw new Error(`${url}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const mavenNewest = async (repo: string, coordinates: string) => {
  const [group, artifact] = coordinates.split(':') as [string, string];
  const xml = await (await text(`${repo}/${group.replace(/\./g, '/')}/${artifact}/maven-metadata.xml`)).text();
  const v = newestStable([...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]!));
  if (!v) throw new Error(`${coordinates}: no stable version`);
  return v;
};

/** Stable packages in Google's SDK repository, by path. */
async function sdkPackages() {
  const xml = await (await text('https://dl.google.com/android/repository/repository2-3.xml')).text();
  const out: { path: string; revision: string }[] = [];
  for (const m of xml.matchAll(/<remotePackage path="([^"]+)">([\s\S]*?)<\/remotePackage>/g)) {
    if (!m[2]!.includes('channelRef ref="channel-0"') || m[2]!.includes('<preview>')) continue;
    const rev = /<revision>([\s\S]*?)<\/revision>/.exec(m[2]!)?.[1] ?? '';
    const part = (n: string) => new RegExp(`<${n}>(\\d+)</${n}>`).exec(rev)?.[1];
    out.push({ path: m[1]!, revision: ['major', 'minor', 'micro'].map(part).filter((x) => x !== undefined).join('.') });
  }
  return out;
}

const sheetVersion = (slug: string) => cheatsheets.find((s) => s.slug === slug)?.tool.version ?? '';
const versionAfter = (label: string, s: string) => new RegExp(`${label}\\s+([\\d.]+)`).exec(s)?.[1] ?? '';
const minor = (v: string) => v.split('.').slice(0, 2).join('.');

interface Check {
  name: string;
  ours: string;
  latest: string;
  /** True when `latest` needs work here. */
  outdated: boolean;
  todo: string[];
}

const checks: Check[] = [];
const add = (name: string, ours: string, latest: string, todo: string[], outdated = compareVersions(latest, ours) > 0) => checks.push({ name, ours, latest, outdated, todo });

const [kotlin, agp, cmp, coroutines, gradle, sdk, cli] = await Promise.all([
  mavenNewest(CENTRAL, 'org.jetbrains.kotlin:kotlin-gradle-plugin'),
  mavenNewest(GOOGLE, 'com.android.tools.build:gradle'),
  mavenNewest(CENTRAL, 'org.jetbrains.compose:compose-gradle-plugin'),
  mavenNewest(CENTRAL, 'org.jetbrains.kotlinx:kotlinx-coroutines-core'),
  text('https://services.gradle.org/versions/current').then((r) => r.json() as Promise<{ version: string }>),
  sdkPackages(),
  text('https://dl.google.com/android/cli/latest/linux_x86_64/android', { method: 'HEAD' }),
]);

const newestKgpRow = KGP[0]!.to;
add('Kotlin', EXPECT_ACTUAL_CHECKED_WITH.kotlin, kotlin, [
  `Run \`npm run test:kmp -w @androidboss/core\` with Kotlin ${kotlin}, then set \`kotlin\` in EXPECT_ACTUAL_CHECKED_WITH and SWIFT_INTEROP_CHECKED_WITH`,
  'Update the `kotlin = "…"` catalog line in the KMP Gradle cheatsheet and run `npm run test:cheatsheets -w @androidboss/core`',
  compareVersions(kotlin, newestKgpRow) > 0 ? `When kotlinlang.org lists ${kotlin}, add its row to KGP in core/compat/data.ts and update CHECKED_ON` : '',
].filter(Boolean));

add('Android Gradle plugin', EXPECT_ACTUAL_CHECKED_WITH.agp, agp, [
  `Set \`agp\` in EXPECT_ACTUAL_CHECKED_WITH and the AGP version in cheatsheets.tools.test.ts, kmp-libraries.gradle.test.ts and the Gradle and KMP cheatsheets`,
  'Run `npm run test:kmp -w @androidboss/core`, `npm run test:cheatsheets -w @androidboss/core` and `npm run test:gradle -w @androidboss/data`',
  compareVersions(minor(agp), AGP_GRADLE[0]![0]) > 0 ? `Add the AGP ${minor(agp)} → Gradle row to AGP_GRADLE in core/compat/data.ts from the AGP release notes` : '',
].filter(Boolean));

const ourGradle = versionAfter('Gradle', sheetVersion('gradle'));
add('Gradle', ourGradle, gradle.version, [
  `Download it once (\`./gradlew wrapper --gradle-version ${gradle.version}\` in any project) so the toolchain tests pick it up`,
  'Run `npm run test:cheatsheets -w @androidboss/core`, then update the Gradle and KMP cheatsheet versions',
]);

add('Compose Multiplatform', CMP_COMPOSE[0]![0], cmp, [`When the Compose Multiplatform compatibility page lists ${cmp}, add its row to CMP_COMPOSE in core/compat/data.ts`]);

add('kotlinx.coroutines', sheetVersion('coroutines').split(',')[0]!, coroutines, ['Check the coroutines cheatsheet against the changelog, run `npm run test:cheatsheets -w @androidboss/core`, and update its version']);

const platformTools = sdk.find((p) => p.path === 'platform-tools')?.revision ?? '';
add('Platform-Tools (adb)', sheetVersion('adb'), platformTools, ['`sdkmanager "platform-tools"`, start an emulator, run `npm run test:cheatsheets -w @androidboss/core`, then update the adb cheatsheet version']);

const buildTools = sdk.filter((p) => p.path.startsWith('build-tools;')).map((p) => p.path.slice('build-tools;'.length)).sort(compareVersions).at(-1) ?? '';
add('Build-tools (apksigner, zipalign)', versionAfter('build-tools', sheetVersion('signing')), buildTools, [`\`sdkmanager "build-tools;${buildTools}"\`, run \`npm run test:cheatsheets -w @androidboss/core\`, then update the signing cheatsheet version`]);

const apis = sdk.map((p) => /^platforms;android-(\d+)(?:\.\d+)?$/.exec(p.path)?.[1]).filter(Boolean).map(Number);
const newestApi = Math.max(...apis);
const ourApi = Math.max(...Object.keys(VERSION_NAMES).map(Number));
add('Android API level', String(ourApi), String(newestApi), [
  `Add API ${newestApi} to VERSION_NAMES and its behaviour changes in data/src/target-sdk.ts`,
  'Run `scripts/update-permissions.mjs` against an emulator image of the new version',
  'Add the API → minimum AGP row to API_AGP in core/compat/data.ts',
], newestApi > ourApi);

// The Android CLI has no version endpoint: a binary newer than the checked date means a new release.
const cliDate = new Date(cli.headers.get('last-modified') ?? 0).toISOString().slice(0, 10);
add('Android CLI', `${ANDROID_CLI_VERSION} (${ANDROID_CLI_CHECKED_ON})`, `published ${cliDate}`, [
  '`android update`, run `npm run test:cli -w @androidboss/core`, then set CHECKED_VERSION and CHECKED_ON in core/android-cli/index.ts',
  'Add any new commands to cliTasks; the Android CLI cheatsheet is generated from them',
], cliDate > ANDROID_CLI_CHECKED_ON);

const outdated = checks.filter((c) => c.outdated);
const lines = [
  outdated.length ? `${outdated.length} of ${checks.length} tracked tools have a newer stable release.` : `All ${checks.length} tracked tools are current.`,
  '',
  '| Tool | This project | Newest stable | |',
  '|---|---|---|---|',
  ...checks.map((c) => `| ${c.name} | ${c.ours || '?'} | ${c.latest} | ${c.outdated ? 'update' : 'current'} |`),
  ...outdated.flatMap((c) => ['', `### ${c.name} ${c.latest}`, ...c.todo.map((t) => `- [ ] ${t}`)]),
  '',
  'Then release: bump packages/cli and SERVER_INFO, tag `vX.Y.Z`, and bump the oss submodule in the site repo.',
];
const markdown = lines.join('\n');

if (process.argv.includes('--json')) console.log(JSON.stringify({ outdated: outdated.map((c) => `${c.name} ${c.latest}`), markdown }));
else console.log(markdown);
