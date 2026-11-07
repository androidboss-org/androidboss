/**
 * Checks every cheatsheet command against the real tools. Opt-in, like the other
 * toolchain tests:
 *
 *   CHECK_ANDROID=1      adb, emulator, avdmanager, sdkmanager, apksigner, zipalign,
 *                        keytool and apkanalyzer from $ANDROID_HOME. Device-side
 *                        commands (pm, am, cmd, input…) and adb emu need a running
 *                        emulator; they are skipped without one.
 *   CHECK_GRADLE=1       Gradle tasks and flags, in a generated AGP project.
 *   CHECK_ANDROID_CLI=1  Android CLI subcommands.
 *   macOS with Xcode     xcrun simctl subcommands (DEVELOPER_DIR defaults to Xcode).
 *
 * "help" entries: every subcommand and flag must appear in the tool's own help.
 * "run" entries: the command is run and must exit 0 (read-only commands only).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { findGradle } from '../testing/gradle.ts';
import { hasKotlinc, kotlinc } from '../testing/android.ts';
import { cheatsheets, entriesOf, fill } from './index.ts';

const SDK = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const ANDROID = Boolean(process.env.CHECK_ANDROID && SDK);
const DEVELOPER_DIR = process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer';
const SIMCTL = process.platform === 'darwin' && existsSync(DEVELOPER_DIR);
const ANDROID_CLI = Boolean(process.env.CHECK_ANDROID_CLI);
const GRADLE = process.env.CHECK_GRADLE ? findGradle() : undefined;

const newest = (dir: string) => (existsSync(dir) ? execFileSync('ls', [dir], { encoding: 'utf8' }).trim().split('\n').sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1) : undefined);
const sdkTool = (...p: string[]) => (SDK ? join(SDK, ...p) : '');
const buildTools = SDK ? sdkTool('build-tools', newest(sdkTool('build-tools')) ?? '') : '';
const TOOLS: Record<string, string> = {
  adb: sdkTool('platform-tools', 'adb'),
  emulator: sdkTool('emulator', 'emulator'),
  avdmanager: sdkTool('cmdline-tools', 'latest', 'bin', 'avdmanager'),
  sdkmanager: sdkTool('cmdline-tools', 'latest', 'bin', 'sdkmanager'),
  apkanalyzer: sdkTool('cmdline-tools', 'latest', 'bin', 'apkanalyzer'),
  android: sdkTool('cmdline-tools', 'latest', 'bin', 'android'),
  apksigner: join(buildTools, 'apksigner'),
  zipalign: join(buildTools, 'zipalign'),
  keytool: 'keytool',
};

/** Output (stdout + stderr) of a command, cached; help commands often exit non-zero. */
const cache = new Map<string, string>();
function out(cmd: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  const key = [cmd, ...args].join('\u0000');
  if (!cache.has(key)) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120_000, env: { ...process.env, DEVELOPER_DIR, ...env } });
    cache.set(key, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  }
  return cache.get(key)!;
}

const adb = (...args: string[]) => out(TOOLS.adb!, args);
const deviceReady = ANDROID && existsSync(TOOLS.adb!) && adb('get-state').trim().split('\n')[0] === 'device';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether `word` appears as a whole token in a help text. */
const mentions = (help: string, word: string) => new RegExp(`(^|[^\\w-])${esc(word)}(?![\\w-])`, 'm').test(help);
const flagName = (t: string) => t.split('=')[0]!;
const isFlag = (t: string) => /^--?[A-Za-z]/.test(t);

/** Splits a shell line into simple commands: pipes, &&, and $( ) subshells. */
function segments(line: string): string[][] {
  const subshells: string[] = [];
  const flat = line.replace(/\$\(([^()]*)\)/g, (_, inner: string) => (subshells.push(inner), 'SUBSHELL'));
  const parts = [...flat.split(/\s*(?:\|\||&&|\|)\s*/), ...subshells.flatMap((s) => s.split(/\s*\|\s*/))];
  return parts.map((p) => {
    const tokens = [...p.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]!);
    const redirect = tokens.findIndex((t) => /^\d?>{1,2}$/.test(t));
    return redirect >= 0 ? tokens.slice(0, redirect) : tokens;
  });
}

/** Problems with one simple command; an empty list means it checks out. */
type Checker = (tokens: string[]) => string[];
const problems = (help: string, words: string[]) => words.filter((w) => !mentions(help, w)).map((w) => `"${w}" not in help`);

function adbDevice(rest: string[]): string[] {
  if (!deviceReady) return [];
  const [prog, ...args] = rest;
  const sub = args.find((a) => !isFlag(a));
  const flags = args.filter(isFlag).map(flagName);
  switch (prog) {
    case 'pm':
    case 'am':
    case 'settings':
    case 'wm':
      return problems(adb('shell', prog!, 'help'), [sub!, ...flags]);
    case 'cmd': {
      const [service, ...more] = args;
      const help = adb('shell', 'cmd', service!, 'help');
      return problems(help, [more.find((a) => !isFlag(a))!, ...more.filter(isFlag).map(flagName)]);
    }
    case 'input':
      return problems(adb('shell', 'input'), [sub!, ...flags]);
    case 'screencap':
      return problems(adb('shell', 'screencap', '-h'), flags);
    case 'screenrecord':
      return problems(adb('shell', 'screenrecord', '--help'), flags);
    case 'monkey':
      return problems(adb('shell', 'monkey'), flags);
    case 'dumpsys':
      return mentions(adb('shell', 'dumpsys', '-l'), sub!) ? [] : [`no dumpsys service ${sub}`];
    default:
      return adb('shell', 'which', prog!).includes(`/${prog}`) ? [] : [`no ${prog} on the device`];
  }
}

const checkers: Record<string, Checker> = {
  adb(t) {
    let i = 1;
    while (t[i] === '-s' || t[i] === '-d' || t[i] === '-e') i += t[i] === '-s' ? 2 : 1;
    const sub = t[i]!;
    const rest = t.slice(i + 1);
    if (sub === 'shell' || sub === 'exec-out') return adbDevice(rest);
    if (sub === 'emu') {
      if (!deviceReady) return [];
      const [cmd, ...args] = rest;
      const top = problems(adb('emu', 'help'), [cmd!]);
      const word = args.find((a) => /^[a-z]+$/.test(a));
      return [...top, ...(word ? problems(adb('emu', 'help', cmd!), [word]) : [])];
    }
    const help = adb('help');
    const name = sub.startsWith('wait-for') ? 'wait-for[-TRANSPORT]-STATE...' : sub;
    const found = sub.startsWith('wait-for') ? help.includes(name) : mentions(help, sub);
    // logcat --help needs a device; without one, only the subcommand is checked.
    if (sub === 'logcat' && !deviceReady) return mentions(help, sub) ? [] : ['adb logcat not in help'];
    const flagHelp = sub === 'logcat' ? adb('logcat', '--help') : help;
    return [...(found ? [] : [`adb ${sub} not in help`]), ...problems(flagHelp, rest.filter(isFlag).map(flagName))];
  },
  emulator: (t) => problems(out(TOOLS.emulator!, ['-help']), t.filter(isFlag).map(flagName)),
  avdmanager(t) {
    const [verb, object] = t.slice(1).filter((x) => !isFlag(x));
    const top = out(TOOLS.avdmanager!, ['--help']);
    const ok = new RegExp(`${verb}\\s+${object}\\s*:`).test(top);
    return [...(ok ? [] : [`avdmanager ${verb} ${object} not in help`]), ...problems(out(TOOLS.avdmanager!, [verb!, object!, '--help']), t.filter(isFlag).map(flagName))];
  },
  sdkmanager: (t) => problems(out(TOOLS.sdkmanager!, ['--help']), t.filter(isFlag).map(flagName)),
  apkanalyzer(t) {
    const words = t.slice(1).filter((x) => !isFlag(x));
    const help = out(TOOLS.apkanalyzer!, []);
    return [...(new RegExp(`^${words[0]} ${words[1]}\\b`, 'm').test(help) ? [] : [`apkanalyzer ${words[0]} ${words[1]} not in help`]), ...problems(help, t.filter(isFlag).map(flagName))];
  },
  apksigner: (t) => problems(out(TOOLS.apksigner!, [t[1]!, '-h']), t.slice(2).filter(isFlag).map(flagName)),
  zipalign: (t) => problems(out(TOOLS.zipalign!, []), t.filter(isFlag).map(flagName)),
  keytool: (t) => problems(out('keytool', [t[1]!, '-help']), t.slice(2).filter(isFlag)),
};

const simctl: Checker = (t) => {
  const [, , sub, ...rest] = t;
  if (sub === 'spawn') {
    // simctl spawn <device> <program> <args>: the args belong to the program (here macOS log).
    const [, program, verb, ...args] = rest;
    const ownHelp = program === 'log' ? out('log', ['help', verb!]) : '';
    return [...problems(out('xcrun', ['simctl', 'help']), [sub]), ...(program === 'log' ? problems(ownHelp, args.filter(isFlag).map(flagName)) : [])];
  }
  const help = out('xcrun', ['simctl', 'help', sub!]);
  const action = { io: 1, privacy: 1, location: 1, ui: 1, status_bar: 1 }[sub as string] ? rest.filter((x) => !isFlag(x))[1] : undefined;
  return [...problems(out('xcrun', ['simctl', 'help']), [sub!]), ...problems(help, [...rest.filter(isFlag).map(flagName), ...(action ? [action] : [])])];
};

const androidCli: Checker = (t) => {
  const path = t.slice(1).filter((x) => !isFlag(x));
  const r = spawnSync(TOOLS.android!, [...path, '--help'], { encoding: 'utf8', timeout: 120_000 });
  return r.status === 0 ? problems(r.stdout, t.filter(isFlag).map(flagName)) : [`android ${path.join(' ')} --help failed`];
};

/** Runs `check` on every simple command of an entry that `owns` claims. */
function checkEntry(command: string, owns: (t: string[]) => boolean, check: Checker): string[] {
  return command.split('\n').flatMap((line) => segments(line).filter((t) => t.length && owns(t)).flatMap(check));
}

const filled = (slug: string) => {
  const s = cheatsheets.find((x) => x.slug === slug)!;
  return entriesOf(s).map(({ entry }) => ({ entry, command: fill(entry.command, s.variables) }));
};

describe.skipIf(!ANDROID)('Android SDK tool commands', () => {
  for (const slug of ['adb', 'emulator', 'signing']) {
    describe(slug, () => {
      for (const { entry, command } of filled(slug).filter((e) => e.entry.verify !== 'none')) {
        it(entry.id, () => {
          const owns = (t: string[]) => t[0]! in checkers;
          expect(checkEntry(command, owns, (t) => checkers[t[0]!]!(t)), command).toEqual([]);
          if (entry.verify === 'run' && (deviceReady || !command.includes('adb '))) {
            const r = spawnSync('sh', ['-c', command.replace(/\badb\b/g, TOOLS.adb!).replace(/^(emulator|avdmanager)\b/gm, (m) => TOOLS[m]!)], { encoding: 'utf8', timeout: 120_000 });
            expect(r.status, `${command}\n${r.stderr}`).toBe(0);
          }
        });
      }
    });
  }
  it('has a device for the device-side checks', () => {
    if (!deviceReady) console.warn('No running emulator: device-side commands were only partly checked.');
  });
});

describe.skipIf(!SIMCTL)('xcrun simctl commands', () => {
  for (const { entry, command } of filled('simctl').filter((e) => e.entry.verify !== 'none')) {
    it(entry.id, () => {
      expect(checkEntry(command, (t) => t[0] === 'xcrun' && t[1] === 'simctl', simctl), command).toEqual([]);
      if (entry.verify === 'run') expect(spawnSync('sh', ['-c', command], { env: { ...process.env, DEVELOPER_DIR } }).status).toBe(0);
    });
  }
});

describe.skipIf(!ANDROID_CLI || !SDK)('Android CLI commands not in the command builder', () => {
  for (const { entry, command } of filled('android-cli').filter((e) => e.entry.verify !== 'none')) {
    it(entry.id, () => expect(checkEntry(command, (t) => t[0] === 'android', androidCli), command).toEqual([]));
  }
});

/** Flags that take the next token as their value, so it isn't read as a task name. */
const GRADLE_VALUE_FLAGS = new Set(['--tests', '--configuration', '--dependency', '--task', '--gradle-version', '-x', '--warning-mode']);

describe.skipIf(!GRADLE || !SDK)('Gradle commands in a real AGP project', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cheatsheet-gradle-'));
  mkdirSync(join(dir, 'app/src/main'), { recursive: true });
  writeFileSync(join(dir, 'local.properties'), `sdk.dir=${SDK}\n`);
  writeFileSync(
    join(dir, 'settings.gradle.kts'),
    `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "cheatsheet"
include(":app", ":lib")
`,
  );
  writeFileSync(join(dir, 'build.gradle.kts'), 'plugins {\n  id("com.android.application") version "9.5.0" apply false\n  id("com.android.library") version "9.5.0" apply false\n}\n');
  // The R8 sheet's Gradle snippets go into the app and a library module, as a reader would paste them.
  const r8Snippets = (context: string) => filled('r8').filter((e) => e.entry.lang === 'kts' && e.entry.context === context).map((e) => e.command).join('\n');
  mkdirSync(join(dir, 'lib/src/main'), { recursive: true });
  writeFileSync(join(dir, 'lib/src/main/AndroidManifest.xml'), '<manifest />\n');
  writeFileSync(join(dir, 'lib/build.gradle.kts'), `plugins { id("com.android.library") }\nandroid {\n  namespace = "com.example.lib"\n  compileSdk = 36\n  defaultConfig { minSdk = 24 }\n}\n${r8Snippets('android-library')}\n`);
  writeFileSync(
    join(dir, 'app/build.gradle.kts'),
    `plugins { id("com.android.application") }
android {
  namespace = "com.example.app"
  compileSdk = 36
  defaultConfig { applicationId = "com.example.app"; minSdk = 24 }
  buildTypes { release { isMinifyEnabled = true } }
}
dependencies { implementation("androidx.core:core-ktx:1.9.0") }
${r8Snippets('android')}
`,
  );
  writeFileSync(join(dir, 'app/src/main/AndroidManifest.xml'), '<manifest />\n');
  const gradle = (...args: string[]) => spawnSync(GRADLE!, ['-p', dir, '--console=plain', ...args], { encoding: 'utf8', timeout: 600_000 });
  const tasks = () => {
    const r = gradle('tasks', '--all');
    return `${r.stdout}\n${r.stderr}`;
  };
  const gradleHelp = () => out(GRADLE!, ['--help']);
  /** `help --task` lists a task's own options, such as --tests or --configuration. */
  const taskHelp = (task: string) => {
    const key = `task:${task}`;
    if (!cache.has(key)) {
      const r = gradle('help', '--task', task);
      cache.set(key, `${r.stdout}\n${r.stderr}`);
    }
    return cache.get(key)!;
  };

  beforeAll(() => {
    cache.set('tasks', tasks());
  }, 600_000);

  for (const { entry, command } of filled('gradle').filter((e) => e.entry.verify !== 'none')) {
    it(
      entry.id,
      () => {
        const list = cache.get('tasks')!;
        const issues = command.split('\n').flatMap((line) => {
          const t = segments(line)[0]!;
          const found: string[] = [];
          let task = '';
          for (let i = 1; i < t.length; i++) {
            const token = t[i]!;
            if (!isFlag(token)) {
              task = token.replace(/^:/, '');
              // Root names like build or check run in every module (task selectors).
              if (!new RegExp(`^(app:)?${esc(task.replace(/^app:/, ''))}( |$)`, 'm').test(list)) found.push(`task ${task} not found`);
              continue;
            }
            const f = /^-P/.test(token) ? '-P' : flagName(token);
            if (!mentions(gradleHelp(), f) && !(task && mentions(taskHelp(task), f))) found.push(`"${f}" not in help`);
            if (GRADLE_VALUE_FLAGS.has(f)) i++;
          }
          return found;
        });
        expect(issues, command).toEqual([]);
      },
      600_000,
    );
  }

  it('configures the R8 sheet’s Gradle snippets', () => {
    const r = gradle('help');
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  }, 600_000);

  it('resolves the dependency configuration the sheet uses', () => {
    const r = gradle(':app:dependencyInsight', '--dependency', 'androidx.core:core-ktx', '--configuration', 'debugRuntimeClasspath');
    expect(r.status, r.stderr).toBe(0);
  }, 600_000);
});

// ---------------------------------------------------------------------------
// Code snippets: Kotlin (kotlinc), keep rules (R8), KMP Gradle DSL (a real build).

const KOTLIN_DEPS: [string, string][] = [
  ['org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm'],
  ['org.jetbrains.kotlinx', 'kotlinx-coroutines-test-jvm'],
  ['org.jetbrains.kotlinx', 'kotlinx-coroutines-android'],
  ['androidx.lifecycle', 'lifecycle-viewmodel-android'],
  ['androidx.lifecycle', 'lifecycle-runtime-android'],
  ['androidx.lifecycle', 'lifecycle-common-jvm'],
  ['junit', 'junit'],
  // The test compiler applies the Compose plugin when it can, which needs the runtime present.
  ['androidx.compose.runtime', 'runtime-android'],
  ['androidx.compose.runtime', 'runtime-annotation-jvm'],
];
const KOTLIN_IMPORTS = `package snippets

import androidx.lifecycle.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.*
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
`;
const KOTLIN_STUBS = `${KOTLIN_IMPORTS}
data class Product(val id: Int, val name: String)
interface Api {
    suspend fun products(): List<Product>
    suspend fun product(id: Int): Product
    suspend fun search(query: String): List<Product>
}
interface Location
interface LocationClient {
    fun addListener(listener: (Location) -> Unit)
    fun removeListener(listener: (Location) -> Unit)
}
val api: Api get() = TODO()
fun log(message: Any?) = println(message)
`;

describe.skipIf(!ANDROID || !hasKotlinc(KOTLIN_DEPS))('Kotlin snippets compile', () => {
  const kotlinEntries = cheatsheets.flatMap((s) => entriesOf(s).filter(({ entry }) => entry.lang === 'kotlin' && entry.verify === 'compile').map(({ entry }) => ({ entry, code: fill(entry.command, s.variables) })));
  let output = '';
  let status: number | null = null;
  /** kotlinc prints errors as "e: file:///…/Name.kt:3:5 message" (or "Name.kt:3:5: error:" in older versions). */
  const errorsIn = (file: string) => output.split('\n').filter((l) => l.includes(file) && (/^e: /.test(l) || /\berror:/.test(l)));
  beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'cheatsheet-kotlin-'));
    const sources: Record<string, string> = { 'Stubs.kt': KOTLIN_STUBS };
    for (const { entry, code } of kotlinEntries) {
      const name = `snippet_${entry.id.replace(/-/g, '_')}`;
      sources[`${name}.kt`] = entry.context === 'top-level' ? `${KOTLIN_IMPORTS}\n${code}\n` : `${KOTLIN_IMPORTS}\nsuspend fun ${name}(): Unit = coroutineScope {\n${code}\n}\n`;
    }
    const r = kotlinc(dir, sources, KOTLIN_DEPS);
    output = `${r.stdout}\n${r.stderr}`;
    status = r.status;
  }, 600_000);
  for (const { entry } of kotlinEntries) {
    it(entry.id, () => {
      const file = `snippet_${entry.id.replace(/-/g, '_')}.kt`;
      expect(errorsIn(file)).toEqual([]);
    });
  }
  it('compiles the shared stubs', () => expect(errorsIn('Stubs.kt')).toEqual([]));
  it('the compiler succeeds', () => expect(status, output.slice(0, 4000)).toBe(0));
});

describe.skipIf(!ANDROID || !existsSync(sdkTool('cmdline-tools', 'latest', 'bin', 'r8')))('Keep rules run through R8', () => {
  const r8 = sdkTool('cmdline-tools', 'latest', 'bin', 'r8');
  const dir = mkdtempSync(join(tmpdir(), 'cheatsheet-r8-'));
  const javaHome = () => execFileSync('/usr/libexec/java_home', { encoding: 'utf8' }).trim();
  beforeAll(() => {
    mkdirSync(join(dir, 'src/shop'), { recursive: true });
    mkdirSync(join(dir, 'build/outputs'), { recursive: true });
    writeFileSync(join(dir, 'src/shop/Main.java'), 'package shop;\npublic class Main { public static void main(String[] a) { System.out.println("hi"); } }\n');
    execFileSync('javac', ['--release', '17', '-d', join(dir, 'classes'), join(dir, 'src/shop/Main.java')]);
    execFileSync('jar', ['cf', join(dir, 'in.jar'), '-C', join(dir, 'classes'), '.']);
  }, 120_000);
  for (const { entry, command } of filled('r8').filter((e) => e.entry.lang === 'proguard' && e.entry.verify === 'compile')) {
    it(entry.id, () => {
      const pro = join(dir, `${entry.id}.pro`);
      writeFileSync(pro, `-keep class shop.Main { public static void main(java.lang.String[]); }\n${command}\n`);
      const r = spawnSync(r8, ['--classfile', '--release', '--lib', javaHome(), '--pg-conf', pro, '--output', join(dir, `${entry.id}.jar`), join(dir, 'in.jar')], { cwd: dir, encoding: 'utf8', timeout: 120_000 });
      expect(r.status, `${command}\n${r.stderr}`).toBe(0);
      expect(r.stderr, command).not.toMatch(/Error:/);
    }, 120_000);
  }
});

describe.skipIf(!process.env.CHECK_KMP || !findGradle() || !SDK)('KMP Gradle snippets in real projects', () => {
  const sheet = cheatsheets.find((s) => s.slug === 'kmp-gradle')!;
  const all = filled('kmp-gradle');
  const module = fill('{{module}}', sheet.variables);
  const inGroup = (context: string | undefined, group: 'a' | 'b') => ((context ?? '').includes('#b') ? 'b' : 'a') === group;
  const block = (name: string, group: 'a' | 'b') => all.filter((e) => e.entry.lang === 'kts' && (e.entry.context ?? '').split('#')[0] === name && (inGroup(e.entry.context, group) || e.entry.id === 'android')).map((e) => e.command).join('\n');
  const project = (group: 'a' | 'b') => {
    const dir = mkdtempSync(join(tmpdir(), `cheatsheet-kmp-${group}-`));
    mkdirSync(join(dir, 'gradle'), { recursive: true });
    mkdirSync(join(dir, module), { recursive: true });
    writeFileSync(join(dir, 'local.properties'), `sdk.dir=${SDK}\n`);
    writeFileSync(join(dir, 'gradle/libs.versions.toml'), all.find((e) => e.entry.id === 'catalog')!.command + '\n');
    writeFileSync(join(dir, 'settings.gradle.kts'), `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositories { google(); mavenCentral() } }\nrootProject.name = "kmp"\ninclude(":${module}")\n`);
    writeFileSync(join(dir, 'build.gradle.kts'), 'plugins {\n    alias(libs.plugins.kotlinMultiplatform) apply false\n    alias(libs.plugins.androidKotlinMultiplatformLibrary) apply false\n}\n');
    const plugins = all.find((e) => e.entry.id === 'plugins')!.command;
    const kotlin = block('kotlin', group); // block() always includes the android target
    const sourceSets = group === 'a' ? block('sourceSets', 'a') : '';
    // Imports in a snippet belong at the top of the build file, as the notes say.
    const body = `kotlin {\n${kotlin}\n    sourceSets {\n${sourceSets}\n    }\n}\n`;
    const imports = body.split('\n').filter((l) => l.startsWith('import '));
    writeFileSync(join(dir, module, 'build.gradle.kts'), `${imports.join('\n')}\n\n${plugins}\n\n${body.split('\n').filter((l) => !l.startsWith('import ')).join('\n')}`);
    return dir;
  };
  const results = new Map<string, { status: number | null; text: string }>();
  beforeAll(() => {
    for (const group of ['a', 'b'] as const) {
      const r = spawnSync(findGradle()!, ['-p', project(group), '--console=plain', 'tasks', '--all'], { encoding: 'utf8', timeout: 900_000, env: { ...process.env, DEVELOPER_DIR } });
      results.set(group, { status: r.status, text: `${r.stdout}\n${r.stderr}` });
    }
  }, 1_800_000);

  it('configures every build snippet', () => {
    for (const [group, r] of results) expect(r.status, `project ${group}:\n${r.text.slice(-3000)}`).toBe(0);
  });
  for (const { entry, command } of all.filter((e) => e.entry.verify === 'help')) {
    it(entry.id, () => {
      const list = results.get(inGroup(entry.context, 'b') ? 'b' : 'a')!.text;
      const name = command.split(/\s+/)[1]!.replace(/^:/, '');
      expect(list, `${name} not in tasks --all`).toMatch(new RegExp(`^${esc(name)}( |$)`, 'm'));
    });
  }
});
