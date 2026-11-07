#!/usr/bin/env node
/**
 * Rebuilds src/latest-versions.json from the repositories themselves:
 * - Google Maven: master-index.xml lists every group; each group-index.xml lists
 *   every artifact with all its versions;
 * - Maven Central: maven-metadata.xml of CENTRAL_LIBRARIES and of every library in
 *   the KMP Library Finder;
 * - Gradle plugins: the plugin marker's maven-metadata.xml on Google Maven or the
 *   Gradle Plugin Portal.
 * Fails if any curated library or plugin can't be read.
 *
 *   node --experimental-strip-types scripts/update-latest-versions.mts
 */
import { writeFileSync } from 'node:fs';
import { CENTRAL_LIBRARIES, GOOGLE_GROUPS, newestStable, PLUGINS, type LatestVersions } from '../src/latest-versions.ts';
import { LIBRARY_SOURCES } from '../src/kmp-libraries.ts';

const GOOGLE = 'https://dl.google.com/android/maven2';
const CENTRAL = 'https://repo1.maven.org/maven2';
const PORTAL = 'https://plugins.gradle.org/m2';

async function text(url: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': 'androidboss-latest-versions' } });
    if (res.ok) return res.text();
    if (attempt >= 3 || res.status === 404) throw new Error(`${url}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

const versionsIn = (xml: string) => [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]!);
const path = (coordinates: string) => {
  const [group, artifact] = coordinates.split(':') as [string, string];
  return `${group.replace(/\./g, '/')}/${artifact}`;
};

/** Runs `fn` over `items` with a few requests in flight at a time. */
async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>, size = 12): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const libraries: Record<string, string> = {};

// Google Maven, every artifact of the chosen groups.
const groups = [...(await text(`${GOOGLE}/master-index.xml`)).matchAll(/<([a-z0-9._-]+)\/>/g)].map((m) => m[1]!).filter((g) => GOOGLE_GROUPS.some((p) => g === p || g.startsWith(p.endsWith('.') ? p : `${p}.`) || g === p));
await pool(groups, async (group) => {
  const xml = await text(`${GOOGLE}/${group.replace(/\./g, '/')}/group-index.xml`);
  for (const m of xml.matchAll(/<([A-Za-z0-9._-]+) versions="([^"]+)"\/>/g)) {
    const v = newestStable(m[2]!.split(','));
    if (v) libraries[`${group}:${m[1]}`] = v;
  }
});
const fromGoogle = Object.keys(libraries).length;

// Maven Central, curated plus the KMP Library Finder.
const central = [...new Set([...CENTRAL_LIBRARIES, ...LIBRARY_SOURCES.filter((s) => s.repository === 'central').map((s) => s.coordinates)])];
await pool(central, async (c) => {
  const v = newestStable(versionsIn(await text(`${CENTRAL}/${path(c)}/maven-metadata.xml`)));
  if (!v) throw new Error(`${c}: no versions`);
  libraries[c] = v;
});

// Plugins, by marker artifact: <id>:<id>.gradle.plugin.
const plugins: Record<string, string> = {};
await pool(PLUGINS, async (p) => {
  const base = p.repo === 'google' ? GOOGLE : PORTAL;
  const v = newestStable(versionsIn(await text(`${base}/${path(`${p.id}:${p.id}.gradle.plugin`)}/maven-metadata.xml`)));
  if (!v) throw new Error(`${p.id}: no versions`);
  plugins[p.id] = v;
});

const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const result: LatestVersions = { checkedOn: new Date().toISOString().slice(0, 10), libraries: sorted(libraries), plugins: sorted(plugins) };
writeFileSync(new URL('../src/latest-versions.json', import.meta.url), `${JSON.stringify(result, null, 1)}\n`);
console.log(`${fromGoogle} Google Maven artifacts from ${groups.length} groups, ${central.length} Maven Central libraries, ${Object.keys(plugins).length} plugins.`);
