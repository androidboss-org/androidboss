/**
 * Moves hard-coded dependency and plugin versions from a build.gradle(.kts) file
 * into a Gradle version catalog (gradle/libs.versions.toml) and rewrites the build
 * file to use `libs.*` accessors.
 *
 * Generated catalogs and accessors are checked with real Gradle (catalog.gradle.test.ts).
 * Gradle rules followed: aliases use '-' to nest accessors; when one alias is a
 * prefix of another (retrofit / retrofit-converter-gson) the shorter one needs
 * `.asProvider()`; 'bundles', 'versions' and 'plugins' can't start an alias.
 */

export interface Library {
  alias: string;
  group: string;
  name: string;
  version?: string;
  versionRef?: string;
}

export interface Plugin {
  alias: string;
  id: string;
  version: string;
  versionRef?: string;
}

export interface CatalogResult {
  toml: string;
  buildFile: string;
  libraries: Library[];
  plugins: Plugin[];
  warnings: string[];
}

export type Dsl = 'kts' | 'groovy';

const RESERVED_FIRST = new Set(['bundles', 'versions', 'plugins']);
const RESERVED_ANY = new Set(['extensions', 'class', 'convention']);

/** Configurations that take dependency notations. */
const CONFIG = String.raw`(?:implementation|api|compileOnly|runtimeOnly|annotationProcessor|kapt|ksp|lintChecks|coreLibraryDesugaring|[a-z][A-Za-z0-9]*(?:Implementation|Api|CompileOnly|RuntimeOnly|AnnotationProcessor)|kapt[A-Z]\w*|ksp[A-Z]\w*)`;

const COORD = String.raw`([\w.\-]+):([\w.\-]+)(?::([^"'\s$:@]+))?`;

function sanitize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-(\d)/g, '$1');
}

function safeAlias(alias: string): string {
  let a = alias || 'lib';
  const first = a.split('-')[0]!;
  if (RESERVED_FIRST.has(first) || /^\d/.test(a)) a = `lib-${a}`;
  return a
    .split('-')
    .map((seg) => (RESERVED_ANY.has(seg) ? `${seg}x` : seg))
    .join('-');
}

/** Last meaningful segment of a group: androidx.lifecycle → lifecycle, com.squareup.retrofit2 → retrofit2. */
function groupKey(group: string, name?: string): string {
  const parts = group.split('.').filter((p) => !['com', 'org', 'io', 'net', 'dev', 'me', 'app'].includes(p));
  // androidx.compose.ui:ui → compose (not ui-ui)
  if (name && parts.length > 1 && sanitize(parts[parts.length - 1]!) === sanitize(name)) parts.pop();
  return sanitize(parts[parts.length - 1] ?? group);
}

const KOTLIN_PLUGINS: Record<string, string> = {
  android: 'org.jetbrains.kotlin.android',
  jvm: 'org.jetbrains.kotlin.jvm',
  multiplatform: 'org.jetbrains.kotlin.multiplatform',
  kapt: 'org.jetbrains.kotlin.kapt',
  'plugin.serialization': 'org.jetbrains.kotlin.plugin.serialization',
  'plugin.compose': 'org.jetbrains.kotlin.plugin.compose',
  'plugin.parcelize': 'org.jetbrains.kotlin.plugin.parcelize',
};

function pluginAlias(id: string): string {
  const known: Record<string, string> = {
    'com.android.application': 'android-application',
    'com.android.library': 'android-library',
    'com.android.test': 'android-test',
    'com.google.devtools.ksp': 'ksp',
    'com.google.dagger.hilt.android': 'hilt',
    'com.google.gms.google-services': 'google-services',
    'com.google.firebase.crashlytics': 'firebase-crashlytics',
    'org.jetbrains.compose': 'compose-multiplatform',
    'androidx.room': 'room',
  };
  if (known[id]) return known[id];
  if (id.startsWith('org.jetbrains.kotlin.')) return sanitize(`kotlin-${id.slice('org.jetbrains.kotlin.'.length).replace(/^plugin\./, '')}`);
  return sanitize(id.split('.').slice(-2).join('-'));
}

interface Found {
  kind: 'lib' | 'plugin';
  start: number;
  end: number;
  group?: string;
  name?: string;
  version?: string;
  pluginId?: string;
  /** Text that replaces [start, end). Filled in after aliases are known. */
  render?: (accessor: string) => string;
}

export function convertToCatalog(buildFile: string, dsl: Dsl = 'kts'): CatalogResult {
  const warnings: string[] = [];
  const found: Found[] = [];
  const q = `["']`;

  // implementation("g:a:v") / implementation 'g:a:v' / platform("g:a:v")
  const depRe = new RegExp(String.raw`\b(${CONFIG})(\s*\(\s*|\s+)((?:platform|enforcedPlatform)\s*\(\s*)?${q}${COORD}${q}(\s*\))?`, 'g');
  for (const m of buildFile.matchAll(depRe)) {
    const [whole, config, open, platform, group, name, version] = m;
    if (whole.includes('$')) continue;
    found.push({
      kind: 'lib',
      start: m.index!,
      end: m.index! + whole.length,
      group,
      name,
      version,
      render: (acc) => {
        const paren = dsl === 'kts' || open!.includes('(');
        // With platform(), the match ends at platform's ')' and the outer ')' stays in the text.
        if (platform) return paren ? `${config}(${platform.replace(/\s+/g, '')}${acc})` : `${config} ${platform.replace(/\s+/g, '')}${acc})`;
        return paren ? `${config}(${acc})` : `${config} ${acc}`;
      },
    });
  }

  // Interpolated versions can't be moved automatically.
  for (const m of buildFile.matchAll(new RegExp(String.raw`\b${CONFIG}\s*\(?\s*["']([\w.\-]+:[\w.\-]+:[^"']*\$[^"']*)["']`, 'g'))) {
    warnings.push(`Skipped "${m[1]}": the version is a variable. Move it to [versions] by hand.`);
  }

  // Map notation: implementation(group = "g", name = "a", version = "v")
  const mapRe = new RegExp(String.raw`\b(${CONFIG})\s*\(\s*group\s*=\s*"([^"]+)"\s*,\s*name\s*=\s*"([^"]+)"(?:\s*,\s*version\s*=\s*"([^"$]+)")?\s*\)`, 'g');
  for (const m of buildFile.matchAll(mapRe)) {
    found.push({ kind: 'lib', start: m.index!, end: m.index! + m[0].length, group: m[2], name: m[3], version: m[4], render: (acc) => `${m[1]}(${acc})` });
  }

  // Plugins: id("x") version "y" / id 'x' version 'y' / kotlin("android") version "y"
  const pluginRe = /\b(id|kotlin)(\s*\(\s*|\s+)["']([\w.\-]+)["']\s*\)?\s+version\s+["']([^"'$]+)["'](\s+apply\s+(?:false|true))?/g;
  for (const m of buildFile.matchAll(pluginRe)) {
    const [whole, kind, , raw, version, apply] = m;
    const pluginId = kind === 'kotlin' ? KOTLIN_PLUGINS[raw!] ?? `org.jetbrains.kotlin.${raw}` : raw!;
    found.push({ kind: 'plugin', start: m.index!, end: m.index! + whole.length, pluginId, version, render: (acc) => `alias(${acc})${apply ?? ''}` });
  }

  // Deduplicate coordinates, keep first-seen order.
  const libs = new Map<string, Library>();
  for (const f of found.filter((f) => f.kind === 'lib')) {
    const key = `${f.group}:${f.name}`;
    const prev = libs.get(key);
    if (prev && prev.version !== f.version) warnings.push(`${key} appears with versions ${prev.version ?? 'none'} and ${f.version ?? 'none'}; kept ${prev.version ?? 'none'}.`);
    if (!prev) libs.set(key, { alias: '', group: f.group!, name: f.name!, version: f.version });
  }
  const plugins = new Map<string, Plugin>();
  for (const f of found.filter((f) => f.kind === 'plugin')) if (!plugins.has(f.pluginId!)) plugins.set(f.pluginId!, { alias: '', id: f.pluginId!, version: f.version! });

  // Library aliases: artifact name, then group key prefix on collision, then full group.
  const taken = new Set<string>();
  const libList = [...libs.values()];
  const byName = new Map<string, number>();
  for (const l of libList) byName.set(sanitize(l.name), (byName.get(sanitize(l.name)) ?? 0) + 1);
  for (const l of libList) {
    const base = sanitize(l.name);
    // junit:junit keeps "junit"; other artifacts sharing a name get a group prefix.
    const ownsName = sanitize(l.group.split('.').pop()!) === base;
    const generic = ['core', 'runtime', 'ui', 'android', 'common', 'compiler', 'ktx', 'bom'].includes(base);
    let alias = safeAlias((byName.get(base)! > 1 && !ownsName) || generic ? `${groupKey(l.group, l.name)}-${base}` : base);
    if (taken.has(alias)) alias = safeAlias(`${sanitize(l.group)}-${base}`);
    for (let i = 2; taken.has(alias); i++) alias = `${alias}${i}`;
    taken.add(alias);
    l.alias = alias;
  }
  const pluginTaken = new Set<string>();
  for (const p of plugins.values()) {
    let alias = safeAlias(pluginAlias(p.id));
    for (let i = 2; pluginTaken.has(alias); i++) alias = `${alias}${i}`;
    pluginTaken.add(alias);
    p.alias = alias;
  }

  // Versions: share a key when 2+ libraries of one group use the same version.
  const versions = new Map<string, string>();
  const groupCounts = new Map<string, number>();
  for (const l of libList) if (l.version) groupCounts.set(`${l.group}@${l.version}`, (groupCounts.get(`${l.group}@${l.version}`) ?? 0) + 1);
  const claim = (key: string, version: string): string => {
    let k = safeAlias(key);
    for (let i = 2; versions.has(k) && versions.get(k) !== version; i++) k = `${safeAlias(key)}${i}`;
    versions.set(k, version);
    return k;
  };
  for (const l of libList) {
    if (!l.version) continue;
    const key = l.group === 'org.jetbrains.kotlin' ? 'kotlin' : groupCounts.get(`${l.group}@${l.version}`)! > 1 ? groupKey(l.group) : l.alias;
    l.versionRef = claim(key, l.version);
  }
  for (const p of plugins.values()) {
    // Kotlin plugins share the Kotlin version with kotlin-stdlib & co. when equal.
    const kotlinLib = p.id.startsWith('org.jetbrains.kotlin.') ? libList.find((l) => l.group === 'org.jetbrains.kotlin' && l.version === p.version) : undefined;
    const key = p.id.startsWith('org.jetbrains.kotlin.') ? 'kotlin' : p.id.startsWith('com.android.') ? 'agp' : p.alias;
    p.versionRef = kotlinLib?.versionRef ?? claim(key, p.version);
  }

  // Accessors: '-' nests; an alias that prefixes another needs asProvider().
  const accessor = (section: 'libs' | 'plugins', alias: string, all: string[]) => {
    const path = alias.replace(/[-_]/g, '.');
    const prefix = all.some((o) => o !== alias && o.replace(/_/g, '-').startsWith(`${alias.replace(/_/g, '-')}-`));
    return `libs.${section === 'plugins' ? 'plugins.' : ''}${path}${prefix ? '.asProvider()' : ''}`;
  };
  const libAliases = libList.map((l) => l.alias);
  const pluginAliases = [...plugins.values()].map((p) => p.alias);

  let out = buildFile;
  for (const f of [...found].sort((a, b) => b.start - a.start)) {
    const acc =
      f.kind === 'lib'
        ? accessor('libs', libs.get(`${f.group}:${f.name}`)!.alias, libAliases)
        : accessor('plugins', plugins.get(f.pluginId!)!.alias, pluginAliases);
    out = out.slice(0, f.start) + f.render!(acc) + out.slice(f.end);
  }

  const str = (s: string) => JSON.stringify(s);
  const toml = [
    '[versions]',
    ...[...versions].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} = ${str(v)}`),
    '',
    '[libraries]',
    ...libList.map((l) => `${l.alias} = { group = ${str(l.group)}, name = ${str(l.name)}${l.versionRef ? `, version.ref = ${str(l.versionRef)}` : ''} }`),
    '',
    '[plugins]',
    ...[...plugins.values()].map((p) => `${p.alias} = { id = ${str(p.id)}, version.ref = ${str(p.versionRef!)} }`),
    '',
  ].join('\n');

  if (!libList.length && !plugins.size) warnings.push('No dependencies or plugins with fixed versions were found.');
  const versionless = buildFile.match(/\bid\s*\(?\s*["'][\w.\-]+["']\s*\)?\s*$/gm);
  if (versionless?.length) warnings.push(`${versionless.length} plugin(s) without a version were left as they are (their version is set elsewhere, usually the root build file).`);

  return { toml, buildFile: out, libraries: libList, plugins: [...plugins.values()], warnings };
}
