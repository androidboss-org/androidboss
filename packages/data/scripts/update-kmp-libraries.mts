#!/usr/bin/env node
/**
 * Rebuilds src/kmp-libraries.json: for each library in src/kmp-libraries.ts,
 * the newest stable version on Maven Central or Google's Maven repository, the
 * date its Gradle module file was published, and the targets that module
 * publishes (from the org.jetbrains.kotlin.* variant attributes Gradle itself
 * uses to pick a variant). Fails if a library is missing or isn't multiplatform.
 *
 *   node --experimental-strip-types scripts/update-kmp-libraries.mts
 */
import { writeFileSync } from 'node:fs';
import { LIBRARY_SOURCES, TARGET_GROUPS, targetGroupOf, type LibraryRelease, type LibrarySource, type TargetGroup } from '../src/kmp-libraries.ts';

const REPOS = { central: 'https://repo1.maven.org/maven2', google: 'https://dl.google.com/android/maven2' } as const;
const PRERELEASE = /[-.](alpha|beta|rc|dev|eap|m\d|snapshot|pre|preview)/i;

function compare(a: string, b: string): number {
  const pa = a.split(/[.-]/);
  const pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== '') {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) return x === '' ? 1 : y === '' ? -1 : x.localeCompare(y);
  }
  return 0;
}

async function release(s: LibrarySource): Promise<LibraryRelease> {
  const [group, artifact] = s.coordinates.split(':') as [string, string];
  const base = `${REPOS[s.repository]}/${group.replace(/\./g, '/')}/${artifact}`;
  const meta = await fetch(`${base}/maven-metadata.xml`);
  if (!meta.ok) throw new Error(`${s.coordinates}: maven-metadata.xml ${meta.status}`);
  const versions = [...(await meta.text()).matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]!).sort(compare);
  const stable = versions.filter((v) => !PRERELEASE.test(v));
  const version = (stable.length ? stable : versions).at(-1)!;
  const res = await fetch(`${base}/${version}/${artifact}-${version}.module`);
  if (!res.ok) throw new Error(`${s.coordinates}:${version}: no Gradle module file (${res.status})`);
  const module = (await res.json()) as { variants: { attributes?: Record<string, string> }[] };
  const groups = new Set<TargetGroup>();
  const native = new Set<string>();
  for (const v of module.variants) {
    const g = targetGroupOf(v.attributes ?? {});
    if (g) groups.add(g);
    const t = v.attributes?.['org.jetbrains.kotlin.native.target'];
    if (t) native.add(t);
  }
  if (!module.variants.some((v) => v.attributes?.['org.jetbrains.kotlin.platform.type'] === 'common')) throw new Error(`${s.coordinates}:${version}: not a multiplatform module`);
  const order = TARGET_GROUPS.map((t) => t.id);
  const androidViaJvm = !groups.has('android') && groups.has('jvm');
  if (androidViaJvm) groups.add('android');
  return {
    version,
    prerelease: !stable.length,
    androidViaJvm,
    released: new Date(res.headers.get('last-modified') ?? Date.now()).toISOString().slice(0, 10),
    targets: [...groups].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    nativeTargets: [...native].sort(),
  };
}

const libraries: Record<string, LibraryRelease> = {};
const errors: string[] = [];
const queue = [...LIBRARY_SOURCES];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        libraries[s.coordinates] = await release(s);
      } catch (e) {
        errors.push(String((e as Error).message));
      }
    }
  }),
);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const sorted = Object.fromEntries(Object.entries(libraries).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(new URL('../src/kmp-libraries.json', import.meta.url), `${JSON.stringify({ checkedOn: new Date().toISOString().slice(0, 10), libraries: sorted }, null, 2)}\n`);
console.log(`${Object.keys(sorted).length} libraries written`);
