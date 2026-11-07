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
const deviceReady = ANDROID && existsSync(TOOLS.adb!) && adb('get-state').includes('device');

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
include(":app")
`,
  );
  writeFileSync(join(dir, 'build.gradle.kts'), 'plugins { id("com.android.application") version "9.5.0" apply false }\n');
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

  it('resolves the dependency configuration the sheet uses', () => {
    const r = gradle(':app:dependencyInsight', '--dependency', 'androidx.core:core-ktx', '--configuration', 'debugRuntimeClasspath');
    expect(r.status, r.stderr).toBe(0);
  }, 600_000);
});
