/**
 * Helpers for the opt-in tests that check generated code with real Android tooling:
 * the SDK ($ANDROID_HOME), Gradle's bundled Kotlin compiler, and AARs from the Gradle
 * cache. Everything returns undefined when something isn't installed, so tests skip.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const enabled = Boolean(process.env.CHECK_ANDROID);
export const sdk = enabled ? (process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT) : undefined;

export const newest = (dir: string) =>
  existsSync(dir) ? readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1) : undefined;

export const aapt2 = sdk && newest(join(sdk, 'build-tools')) ? join(sdk, 'build-tools', newest(join(sdk, 'build-tools'))!, 'aapt2') : undefined;
export const androidJar = sdk && newest(join(sdk, 'platforms')) ? join(sdk, 'platforms', newest(join(sdk, 'platforms'))!, 'android.jar') : undefined;

/** Newest .aar/.jar for group:name in the Gradle cache. */
export function cached(group: string, name: string): string | undefined {
  const dir = join(homedir(), '.gradle/caches/modules-2/files-2.1', group, name);
  const version = newest(dir);
  if (!version) return undefined;
  for (const hash of readdirSync(join(dir, version))) {
    for (const f of readdirSync(join(dir, version, hash))) if (/\.(aar|jar)$/.test(f) && !/sources|javadoc/.test(f)) return join(dir, version, hash, f);
  }
  return undefined;
}

export function gradleLib(): string | undefined {
  const dists = join(homedir(), '.gradle/wrapper/dists');
  if (!existsSync(dists)) return undefined;
  return readdirSync(dists)
    .filter((d) => /^gradle-\d/.test(d))
    .flatMap((d) => readdirSync(join(dists, d)).map((h) => join(dists, d, h, d.replace(/-(bin|all)$/, ''), 'lib')))
    .filter(existsSync)
    .sort()
    .at(-1);
}

/**
 * The newest Kotlin compiler in the Gradle cache that has a matching Compose compiler
 * plugin, so @Composable code compiles like it does in a real project.
 */
function composeToolchain(): { compiler: string; plugin: string } | undefined {
  const base = join(homedir(), '.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin');
  const pluginDir = join(base, 'kotlin-compose-compiler-plugin-embeddable');
  const compilerDir = join(base, 'kotlin-compiler-embeddable');
  if (!existsSync(pluginDir) || !existsSync(compilerDir)) return undefined;
  const versions = readdirSync(pluginDir).filter((v) => existsSync(join(compilerDir, v))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const v = versions.at(-1);
  if (!v) return undefined;
  const plugin = cached('org.jetbrains.kotlin', 'kotlin-compose-compiler-plugin-embeddable');
  const compiler = readdirSync(join(compilerDir, v)).map((h) => join(compilerDir, v, h, `kotlin-compiler-embeddable-${v}.jar`)).find(existsSync);
  const pluginJar = readdirSync(join(pluginDir, v)).map((h) => join(pluginDir, v, h, `kotlin-compose-compiler-plugin-embeddable-${v}.jar`)).find(existsSync);
  return compiler && pluginJar && plugin ? { compiler, plugin: pluginJar } : undefined;
}

/**
 * Compiles Kotlin sources against the given AAR/JAR coordinates plus android.jar,
 * with the Compose compiler plugin when one matching a cached compiler exists
 * (otherwise Gradle's bundled compiler). Returns the compiler result.
 */
export function kotlinc(dir: string, sources: Record<string, string>, coordinates: [string, string][]) {
  const lib = gradleLib();
  if (!lib || !androidJar) throw new Error('Gradle or the Android SDK is missing');
  const cp = coordinates.map(([g, n], i) => {
    const jar = cached(g, n);
    if (!jar) throw new Error(`${g}:${n} isn't in the Gradle cache`);
    if (jar.endsWith('.jar')) return jar;
    execFileSync('unzip', ['-o', '-q', jar, 'classes.jar', '-d', join(dir, `aar${i}`)]);
    return join(dir, `aar${i}`, 'classes.jar');
  });
  const stdlib = readdirSync(lib).find((f) => /^kotlin-stdlib-\d.*\.jar$/.test(f))!;
  for (const [file, code] of Object.entries(sources)) writeFileSync(join(dir, file), code);
  const compose = composeToolchain();
  // The cached compiler goes first so its classes win over Gradle's bundled copy.
  const javaCp = compose ? `${compose.compiler}:${lib}/*` : `${lib}/*`;
  return spawnSync(
    'java',
    [
      '-cp', javaCp, 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      ...(compose ? [`-Xplugin=${compose.plugin}`] : []),
      '-no-stdlib', '-no-reflect', '-jvm-target', '17',
      '-classpath', [...cp, join(lib, stdlib), androidJar].join(':'),
      '-d', join(dir, 'out'),
      ...Object.keys(sources),
    ],
    { cwd: dir, encoding: 'utf8', timeout: 240_000 },
  );
}

export const hasKotlinc = (coordinates: [string, string][]) => Boolean(sdk && androidJar && gradleLib() && coordinates.every(([g, n]) => cached(g, n)));
