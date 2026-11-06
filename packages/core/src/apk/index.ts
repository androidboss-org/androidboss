/**
 * APK and AAB analysis in the browser or Node: size by category, the decoded
 * manifest, DEX counts, native libraries' 16 KB page size readiness and
 * signing. Checked against aapt2, apkanalyzer, apksigner and zipalign in
 * apk.android.test.ts.
 */
import { readDex, readElf, readSigningBlock, sha256Fingerprint, type DexInfo } from './binary.ts';
import { openZip, readEntry, ZipError, type ZipEntryInfo } from './zip.ts';
import { attr, decodeAxml, decodeProtoXml, toXml, type XNode } from './xml.ts';

export { toXml, type XNode } from './xml.ts';
export { ZipError } from './zip.ts';

export const PAGE_16K = 16384;

export type Category = 'Code (DEX)' | 'Resources' | 'Resource table' | 'Native libraries' | 'Assets' | 'Signature' | 'Kotlin & Java metadata' | 'Bundle metadata' | 'Other';

export interface CategorySize {
  category: Category;
  files: number;
  compressed: number;
  size: number;
}

export interface Component {
  kind: string;
  name: string;
  exported?: boolean;
  hasIntentFilter: boolean;
}

export interface ManifestSummary {
  xml: string;
  node: XNode;
  package?: string;
  versionCode?: string;
  versionName?: string;
  minSdk?: number;
  targetSdk?: number;
  compileSdk?: number;
  debuggable: boolean;
  testOnly: boolean;
  allowBackup?: boolean;
  usesCleartextTraffic?: boolean;
  extractNativeLibs?: boolean;
  networkSecurityConfig: boolean;
  permissions: string[];
  components: Component[];
}

export interface DexSummary extends Omit<DexInfo, 'classNames'> {
  file: string;
}

export interface NativeLib {
  path: string;
  abi: string;
  size: number;
  compressed: boolean;
  /** Smallest PT_LOAD alignment; 0 if not an ELF file. */
  loadAlign: number;
  /** Uncompressed in an APK and its data starts on a 16 KB boundary. */
  zipAligned16?: boolean;
  ready16k: boolean;
}

export interface Finding {
  level: 'error' | 'warning' | 'info';
  message: string;
}

export interface PackageReport {
  kind: 'apk' | 'aab';
  fileSize: number;
  modules: string[];
  categories: CategorySize[];
  largest: { name: string; size: number; compressed: number }[];
  manifest?: ManifestSummary;
  dex: DexSummary[];
  topPackages: { name: string; classes: number }[];
  native: NativeLib[];
  signing: { schemes: string[]; sha256?: string };
  findings: Finding[];
}

function categoryOf(path: string, kind: 'apk' | 'aab'): Category {
  const p = kind === 'aab' ? path.replace(/^[^/]+\//, '') : path;
  if (kind === 'aab' && (path.startsWith('BUNDLE-METADATA/') || path === 'BundleConfig.pb')) return 'Bundle metadata';
  if (/^(dex\/)?classes\d*\.dex$/.test(p)) return 'Code (DEX)';
  if (p.startsWith('lib/')) return 'Native libraries';
  if (p.startsWith('res/')) return 'Resources';
  if (p === 'resources.arsc' || p === 'resources.pb') return 'Resource table';
  if (p.startsWith('assets/')) return 'Assets';
  if (/^META-INF\/[^/]+\.(SF|RSA|DSA|EC|MF)$/i.test(path) || path === 'META-INF/MANIFEST.MF') return 'Signature';
  if (p.startsWith('kotlin/') || p.startsWith('META-INF/') || p.startsWith('root/META-INF/') || p.startsWith('root/kotlin/')) return 'Kotlin & Java metadata';
  return 'Other';
}

const num = (v?: string) => (v && /^-?\d+$/.test(v) ? Number(v) : undefined);
const bool = (v?: string) => (v === undefined ? undefined : v === 'true');

function summarizeManifest(node: XNode): ManifestSummary {
  const sdk = node.children.find((c) => c.name === 'uses-sdk');
  const app = node.children.find((c) => c.name === 'application');
  const components: Component[] = (app?.children ?? [])
    .filter((c) => ['activity', 'activity-alias', 'service', 'receiver', 'provider'].includes(c.name))
    .map((c) => ({ kind: c.name, name: attr(c, 'name') ?? '?', exported: bool(attr(c, 'exported')), hasIntentFilter: c.children.some((x) => x.name === 'intent-filter') }));
  return {
    xml: toXml(node),
    node,
    package: attr(node, 'package'),
    versionCode: attr(node, 'versionCode'),
    versionName: attr(node, 'versionName'),
    minSdk: num(sdk && attr(sdk, 'minSdkVersion')),
    targetSdk: num(sdk && attr(sdk, 'targetSdkVersion')),
    compileSdk: num(attr(node, 'compileSdkVersion')),
    debuggable: app ? attr(app, 'debuggable') === 'true' : false,
    testOnly: app ? attr(app, 'testOnly') === 'true' : false,
    allowBackup: app ? bool(attr(app, 'allowBackup')) : undefined,
    usesCleartextTraffic: app ? bool(attr(app, 'usesCleartextTraffic')) : undefined,
    extractNativeLibs: app ? bool(attr(app, 'extractNativeLibs')) : undefined,
    networkSecurityConfig: !!(app && attr(app, 'networkSecurityConfig')),
    permissions: node.children.filter((c) => c.name === 'uses-permission' || c.name === 'uses-permission-sdk-23').map((c) => attr(c, 'name') ?? '?'),
    components,
  };
}

export interface AnalyzeOptions {
  /** Google Play's current minimum targetSdk for updates. */
  playTargetSdk?: number;
}

export async function analyzePackage(bytes: Uint8Array, o: AnalyzeOptions = {}): Promise<PackageReport> {
  const zip = openZip(bytes);
  const names = new Set(zip.entries.map((e) => e.name));
  const kind: 'apk' | 'aab' = names.has('AndroidManifest.xml') ? 'apk' : [...names].some((n) => /^[^/]+\/manifest\/AndroidManifest\.xml$/.test(n)) ? 'aab' : 'apk';
  if (kind === 'apk' && !names.has('AndroidManifest.xml')) throw new ZipError('No AndroidManifest.xml: this ZIP isn’t an APK or AAB.');
  const modules = kind === 'aab' ? [...new Set(zip.entries.map((e) => e.name.split('/')[0]!).filter((m) => names.has(`${m}/manifest/AndroidManifest.xml`)))] : [];
  const findings: Finding[] = [];

  // Sizes
  const cats = new Map<Category, CategorySize>();
  for (const e of zip.entries) {
    if (e.name.endsWith('/')) continue;
    const c = categoryOf(e.name, kind);
    const cur = cats.get(c) ?? { category: c, files: 0, compressed: 0, size: 0 };
    cur.files++;
    cur.compressed += e.compressedSize;
    cur.size += e.size;
    cats.set(c, cur);
  }
  const categories = [...cats.values()].sort((a, b) => b.compressed - a.compressed);
  const largest = [...zip.entries].sort((a, b) => b.compressedSize - a.compressedSize).slice(0, 25).map((e) => ({ name: e.name, size: e.size, compressed: e.compressedSize }));

  // Manifest
  const manifestEntry = zip.entries.find((e) => e.name === (kind === 'apk' ? 'AndroidManifest.xml' : 'base/manifest/AndroidManifest.xml')) ?? zip.entries.find((e) => /\/manifest\/AndroidManifest\.xml$/.test(e.name));
  let manifest: ManifestSummary | undefined;
  if (manifestEntry) {
    try {
      const raw = await readEntry(zip, manifestEntry);
      manifest = summarizeManifest(kind === 'apk' ? decodeAxml(raw) : decodeProtoXml(raw));
    } catch (e) {
      findings.push({ level: 'warning', message: `Couldn’t decode the manifest: ${(e as Error).message}` });
    }
  }

  // DEX
  const dex: DexSummary[] = [];
  const packages = new Map<string, number>();
  for (const e of zip.entries.filter((x) => /(^|\/)classes\d*\.dex$/.test(x.name))) {
    try {
      const info = readDex(await readEntry(zip, e));
      const { classNames, ...counts } = info;
      dex.push({ file: e.name, ...counts });
      for (const c of classNames) {
        const parts = c.split('.');
        const pkg = parts.slice(0, Math.min(parts.length - 1, 3)).join('.') || '(default package)';
        packages.set(pkg, (packages.get(pkg) ?? 0) + 1);
      }
      if (info.methods > 65536 || info.fields > 65536) findings.push({ level: 'error', message: `${e.name} references more than 65,536 methods or fields.` });
    } catch {
      findings.push({ level: 'warning', message: `${e.name} isn’t a readable DEX file.` });
    }
  }
  const topPackages = [...packages].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, classes]) => ({ name, classes }));

  // Native libraries
  const native: NativeLib[] = [];
  for (const e of zip.entries.filter((x) => /(^|\/)lib\/[^/]+\/[^/]+\.so$/.test(x.name))) {
    const abi = e.name.match(/lib\/([^/]+)\//)![1]!;
    const elf = readElf(await readEntry(zip, e));
    const loadAlign = elf?.loadAlign ?? 0;
    const zipAligned16 = kind === 'apk' && e.method === 0 ? e.dataOffset % PAGE_16K === 0 : undefined;
    const elfOk = loadAlign >= PAGE_16K;
    // 64-bit ABIs matter for 16 KB devices; 32-bit libraries run only on 4 KB devices.
    const needs16k = abi === 'arm64-v8a' || abi === 'x86_64';
    native.push({ path: e.name, abi, size: e.size, compressed: e.method !== 0, loadAlign, zipAligned16, ready16k: !needs16k || (elfOk && zipAligned16 !== false) });
  }
  const notReady = native.filter((n) => !n.ready16k);
  if (notReady.length) {
    const elfBad = notReady.filter((n) => n.loadAlign < PAGE_16K);
    const zipBad = notReady.filter((n) => n.zipAligned16 === false);
    if (elfBad.length) findings.push({ level: 'error', message: `${elfBad.length} 64-bit native librar${elfBad.length === 1 ? 'y has' : 'ies have'} LOAD segments aligned to less than 16 KB (${[...new Set(elfBad.map((n) => n.loadAlign))].join(', ')} bytes). Rebuild with NDK r28+ or link with -Wl,-z,max-page-size=16384, and update third-party SDKs that ship them.` });
    if (zipBad.length) findings.push({ level: 'error', message: `${zipBad.length} uncompressed native librar${zipBad.length === 1 ? 'y isn’t' : 'ies aren’t'} 16 KB aligned in the APK. Build with AGP 8.5.1 or newer, or run zipalign -P 16.` });
  } else if (native.some((n) => n.abi === 'arm64-v8a' || n.abi === 'x86_64')) findings.push({ level: 'info', message: 'All 64-bit native libraries support 16 KB page sizes.' });

  // Signing
  const v1 = zip.entries.some((e) => /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(e.name));
  const block = readSigningBlock(bytes, zip.centralDirectoryOffset);
  const schemes = [...(v1 ? ['v1'] : []), ...block.schemes];
  const sha256 = block.certificate ? await sha256Fingerprint(block.certificate) : undefined;
  if (kind === 'apk' && !schemes.length) findings.push({ level: 'error', message: 'The APK isn’t signed, so it can’t be installed.' });

  // Manifest findings
  if (manifest) {
    if (manifest.debuggable) findings.push({ level: 'error', message: 'android:debuggable="true": a debug build. Google Play rejects it, and anyone can attach a debugger.' });
    if (manifest.testOnly) findings.push({ level: 'error', message: 'android:testOnly="true": only installable with adb install -t, and Play rejects it.' });
    if (manifest.usesCleartextTraffic) findings.push({ level: 'warning', message: 'usesCleartextTraffic="true" allows plain HTTP everywhere. Limit it to specific domains with a network security config.' });
    const play = o.playTargetSdk ?? 36;
    if (manifest.targetSdk !== undefined && manifest.targetSdk < play) findings.push({ level: 'warning', message: `targetSdkVersion ${manifest.targetSdk} is below the API ${play} Google Play requires for new apps and updates.` });
    const exportedNoFilter = manifest.components.filter((c) => c.exported && !c.hasIntentFilter && c.kind !== 'provider');
    if (exportedNoFilter.length) findings.push({ level: 'info', message: `Exported without an intent filter, so other apps can start them directly: ${exportedNoFilter.map((c) => c.name).join(', ')}.` });
  }

  return { kind, fileSize: bytes.length, modules, categories, largest, manifest, dex, topPackages, native, signing: { schemes, sha256 }, findings };
}

export type { ZipEntryInfo };
