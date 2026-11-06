/**
 * Android App Links: generate and check `/.well-known/assetlinks.json` and the
 * manifest intent filters that point at it, and read what Google's Digital
 * Asset Links API sees for a site.
 *
 * Rules follow developer.android.com/training/app-links and the Digital Asset
 * Links statement format.
 */

export const HANDLE_ALL_URLS = 'delegate_permission/common.handle_all_urls';
export const GET_LOGIN_CREDS = 'delegate_permission/common.get_login_creds';
const KNOWN_RELATIONS = [HANDLE_ALL_URLS, GET_LOGIN_CREDS];

export class AppLinksError extends Error {}

export type Level = 'error' | 'warning' | 'info' | 'ok';

export interface Finding {
  level: Level;
  message: string;
}

// ---------------------------------------------------------------------------
// Fingerprints

/** Any SHA-256 form → 'AB:CD:…' (32 uppercase pairs). */
export function normalizeFingerprint(input: string): string {
  const hex = input.replace(/^\s*SHA-?256\s*[:=]?\s*/i, '').replace(/[\s:]/g, '');
  if (/^[0-9a-f]{40}$/i.test(hex)) throw new AppLinksError('That is a SHA-1 fingerprint. App Links need the SHA-256 one.');
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new AppLinksError(`"${input.trim().slice(0, 40)}" isn't a SHA-256 fingerprint (64 hex digits).`);
  return hex.toUpperCase().match(/../g)!.join(':');
}

/** Every SHA-256 fingerprint in pasted text: keytool, signingReport, Play Console. */
export function findFingerprints(text: string): string[] {
  const found = text.match(/\b(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}\b|\b[0-9A-Fa-f]{64}\b/g) ?? [];
  return [...new Set(found.map(normalizeFingerprint))];
}

const PACKAGE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;

// ---------------------------------------------------------------------------
// Generating

export interface AppTarget {
  packageName: string;
  fingerprints: string[];
}

export interface AssetLinksOptions {
  apps: AppTarget[];
  /** Also let the app use saved passwords for this site (Credential Manager / Smart Lock). */
  shareCredentials?: boolean;
}

export function generateAssetLinks(o: AssetLinksOptions): string {
  if (!o.apps.length) throw new AppLinksError('Add at least one app.');
  const statements = o.apps.map((a) => {
    if (!PACKAGE.test(a.packageName.trim())) throw new AppLinksError(`"${a.packageName}" isn't a valid package name.`);
    if (!a.fingerprints.length) throw new AppLinksError(`Add the SHA-256 signing fingerprint for ${a.packageName}.`);
    return {
      relation: [HANDLE_ALL_URLS, ...(o.shareCredentials ? [GET_LOGIN_CREDS] : [])],
      target: { namespace: 'android_app', package_name: a.packageName.trim(), sha256_cert_fingerprints: a.fingerprints.map(normalizeFingerprint) },
    };
  });
  return `${JSON.stringify(statements, null, 2)}\n`;
}

export type PathKind = 'all' | 'prefix' | 'exact' | 'pattern';

export interface IntentFilterOptions {
  hosts: string[];
  paths: { kind: PathKind; value: string }[];
  /** Also accept http:// links (still verified over https). */
  http?: boolean;
}

const HOST = /^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/i;

export function generateIntentFilters(o: IntentFilterOptions): string {
  const hosts = o.hosts.map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase()).filter(Boolean);
  if (!hosts.length) throw new AppLinksError('Add a domain.');
  for (const h of hosts) if (!HOST.test(h)) throw new AppLinksError(`"${h}" isn't a host name.`);
  const paths = o.paths.filter((p) => p.kind === 'all' || p.value.trim());
  const pathAttr = (p: { kind: PathKind; value: string }) => {
    const v = p.value.trim().startsWith('/') || p.kind === 'pattern' ? p.value.trim() : `/${p.value.trim()}`;
    return p.kind === 'prefix' ? `android:pathPrefix="${v}"` : p.kind === 'exact' ? `android:path="${v}"` : p.kind === 'pattern' ? `android:pathPattern="${v}"` : '';
  };
  // One filter per host: <data> attributes in one filter combine with each other.
  return hosts
    .map((host) =>
      [
        '<intent-filter android:autoVerify="true">',
        '    <action android:name="android.intent.action.VIEW" />',
        '    <category android:name="android.intent.category.DEFAULT" />',
        '    <category android:name="android.intent.category.BROWSABLE" />',
        '    <data android:scheme="https" />',
        ...(o.http ? ['    <data android:scheme="http" />'] : []),
        `    <data android:host="${host}" />`,
        ...(paths.length && !paths.some((p) => p.kind === 'all') ? paths.map((p) => `    <data ${pathAttr(p)} />`) : []),
        '</intent-filter>',
      ].join('\n'),
    )
    .join('\n');
}

// ---------------------------------------------------------------------------
// Checking assetlinks.json

export interface Statement {
  relation: string[];
  packageName?: string;
  fingerprints: string[];
}

export function checkAssetLinks(text: string): { findings: Finding[]; statements: Statement[] } {
  const findings: Finding[] = [];
  const statements: Statement[] = [];
  if (text.charCodeAt(0) === 0xfeff) findings.push({ level: 'warning', message: 'The file starts with a byte-order mark. Save it as UTF-8 without BOM.' });
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { findings: [...findings, { level: 'error', message: `Not valid JSON: ${(e as Error).message}. Trailing commas and comments aren't allowed.` }], statements };
  }
  if (!Array.isArray(data)) return { findings: [...findings, { level: 'error', message: 'The top level must be a JSON array of statements, [ … ].' }], statements };
  if (!data.length) findings.push({ level: 'error', message: 'The array is empty.' });

  data.forEach((s: Record<string, unknown>, i) => {
    const at = `Statement ${i + 1}`;
    const rel = s?.relation;
    const target = s?.target as Record<string, unknown> | undefined;
    if (!Array.isArray(rel) || !rel.length) findings.push({ level: 'error', message: `${at}: "relation" must be a non-empty array.` });
    else for (const r of rel) if (!KNOWN_RELATIONS.includes(r as string)) findings.push({ level: 'warning', message: `${at}: unknown relation "${r}". App Links need "${HANDLE_ALL_URLS}".` });
    if (!target || typeof target !== 'object') {
      findings.push({ level: 'error', message: `${at}: missing "target".` });
      return;
    }
    if (target.namespace === 'web') {
      statements.push({ relation: (rel as string[]) ?? [], fingerprints: [] });
      return;
    }
    if (target.namespace !== 'android_app') findings.push({ level: 'error', message: `${at}: target.namespace must be "android_app".` });
    const pkg = target.package_name;
    if (typeof pkg !== 'string' || !PACKAGE.test(pkg)) findings.push({ level: 'error', message: `${at}: "package_name" is missing or not a package name.` });
    const fps = target.sha256_cert_fingerprints;
    const good: string[] = [];
    if (!Array.isArray(fps) || !fps.length) findings.push({ level: 'error', message: `${at}: "sha256_cert_fingerprints" must be a non-empty array.` });
    else
      for (const fp of fps) {
        if (typeof fp !== 'string') continue;
        try {
          const n = normalizeFingerprint(fp);
          if (n !== fp) findings.push({ level: 'warning', message: `${at}: write fingerprints as uppercase hex pairs separated by colons: ${n}` });
          good.push(n);
        } catch (e) {
          findings.push({ level: 'error', message: `${at}: ${(e as Error).message}` });
        }
      }
    for (const k of Object.keys(target)) if (!['namespace', 'package_name', 'sha256_cert_fingerprints'].includes(k)) findings.push({ level: 'warning', message: `${at}: unknown target field "${k}".` });
    statements.push({ relation: Array.isArray(rel) ? (rel as string[]) : [], packageName: typeof pkg === 'string' ? pkg : undefined, fingerprints: good });
  });
  if (!findings.some((f) => f.level === 'error')) findings.push({ level: 'ok', message: `Valid: ${statements.filter((s) => s.packageName).length} app statement${statements.length === 1 ? '' : 's'}.` });
  return { findings, statements };
}

// ---------------------------------------------------------------------------
// Checking manifest intent filters

export interface ManifestCheck {
  findings: Finding[];
  /** Hosts Android will try to verify, and where it fetches the file from. */
  verify: { host: string; url: string }[];
}

const attrOf = (tag: string, name: string) => tag.match(new RegExp(`android:${name}\\s*=\\s*"([^"]*)"`))?.[1];

export function checkIntentFilters(xml: string): ManifestCheck {
  const findings: Finding[] = [];
  const verify = new Map<string, string>();
  const filters = [...xml.matchAll(/<intent-filter\b([^>]*)>([\s\S]*?)<\/intent-filter>/g)];
  const linkFilters = filters.filter((f) => /android\.intent\.action\.VIEW/.test(f[2]!) && /android:scheme\s*=\s*"https?"/.test(f[2]!));
  if (!filters.length) return { findings: [{ level: 'error', message: 'No <intent-filter> found. Paste the <activity> or the whole AndroidManifest.xml.' }], verify: [] };
  if (!linkFilters.length) return { findings: [{ level: 'error', message: 'No intent filter handles http or https links (a VIEW action with a <data android:scheme="https">).' }], verify: [] };

  linkFilters.forEach((f, i) => {
    const at = linkFilters.length > 1 ? `Filter ${i + 1}: ` : '';
    const body = f[2]!;
    const data = [...body.matchAll(/<data\b[^>]*>/g)].map((m) => m[0]);
    const schemes = data.map((d) => attrOf(d, 'scheme')).filter((s): s is string => !!s);
    const hosts = data.map((d) => attrOf(d, 'host')).filter((h): h is string => !!h);
    const hasPaths = data.some((d) => /android:path/.test(d));
    const auto = attrOf(`<x ${f[1]}>`, 'autoVerify') === 'true';

    if (!auto) findings.push({ level: 'warning', message: `${at}no android:autoVerify="true". These links are plain deep links: Android shows a chooser or opens the browser instead of your app.` });
    if (!/android\.intent\.category\.BROWSABLE/.test(body)) findings.push({ level: 'error', message: `${at}missing category BROWSABLE, so links from browsers and other apps can't open it.` });
    if (!/android\.intent\.category\.DEFAULT/.test(body)) findings.push({ level: 'error', message: `${at}missing category DEFAULT, so implicit intents won't match.` });
    if (!schemes.includes('https')) findings.push({ level: 'error', message: `${at}only http is declared. App Links need https.` });
    const custom = schemes.filter((s) => s !== 'http' && s !== 'https');
    if (custom.length && auto) findings.push({ level: 'warning', message: `${at}custom scheme ${custom.join(', ')} in a verified filter. Put custom schemes in their own intent filter.` });
    if (!hosts.length) findings.push({ level: 'error', message: `${at}no android:host, so it matches every website and can't be verified.` });
    if (hosts.length > 1 && hasPaths) findings.push({ level: 'info', message: `${at}${hosts.length} hosts and path rules in one filter: every path applies to every host. Use one filter per host if paths differ.` });
    if (auto)
      for (const h of hosts) {
        // Wildcards are verified against the parent domain.
        const root = h.replace(/^\*\./, '');
        verify.set(root, `https://${root}/.well-known/assetlinks.json`);
        if (h.startsWith('*.')) findings.push({ level: 'info', message: `${at}${h} is verified with the file on ${root}.` });
      }
  });
  if (!findings.some((f) => f.level === 'error' || f.level === 'warning')) findings.push({ level: 'ok', message: `${linkFilters.length} App Link filter${linkFilters.length === 1 ? '' : 's'} look right.` });
  // Without a "Filter n:" prefix, messages start mid-sentence.
  for (const f of findings) f.message = f.message.charAt(0).toUpperCase() + f.message.slice(1);
  return { findings, verify: [...verify].map(([host, url]) => ({ host, url })) };
}

// ---------------------------------------------------------------------------
// Google Digital Asset Links API

export const DAL_API = 'https://digitalassetlinks.googleapis.com/v1/statements:list';

export function statementsUrl(host: string): string {
  return `${DAL_API}?source.web.site=${encodeURIComponent(`https://${host}`)}&relation=${encodeURIComponent(HANDLE_ALL_URLS)}`;
}

interface DalResponse {
  statements?: { target?: { androidApp?: { packageName?: string; certificate?: { sha256Fingerprint?: string } } } }[];
  debugString?: string;
  errorCode?: string[];
}

export interface HostResult {
  status: 'linked' | 'wrong-cert' | 'no-package' | 'no-file' | 'error';
  message: string;
  /** Fingerprints the site lists for this package. */
  found: string[];
}

/** Compare the API's answer for one host with the app you expect. */
export function compareStatements(res: DalResponse, packageName: string, fingerprints: string[]): HostResult {
  if (res.errorCode?.length) {
    const first = res.debugString?.split('\n').find((l) => l.startsWith('* Error'))?.replace(/^\* Error: /, '') ?? res.errorCode.join(', ');
    const missing = /404|FETCH_ERROR/.test(first + res.errorCode.join());
    return { status: missing ? 'no-file' : 'error', message: first, found: [] };
  }
  const forApp = (res.statements ?? []).filter((s) => s.target?.androidApp?.packageName === packageName);
  if (!forApp.length) {
    const others = [...new Set((res.statements ?? []).map((s) => s.target?.androidApp?.packageName).filter(Boolean))];
    return { status: 'no-package', message: others.length ? `The file lists ${others.join(', ')}, but not ${packageName}.` : `The file has no statement for ${packageName}.`, found: [] };
  }
  const found = forApp.map((s) => s.target!.androidApp!.certificate?.sha256Fingerprint ?? '').filter(Boolean);
  const want = fingerprints.map(normalizeFingerprint);
  const hit = want.filter((w) => found.includes(w));
  if (!want.length) return { status: 'linked', message: `${packageName} is listed with ${found.length} certificate${found.length === 1 ? '' : 's'}.`, found };
  if (hit.length === want.length) return { status: 'linked', message: `${packageName} is linked with this certificate.`, found };
  return { status: 'wrong-cert', message: `${packageName} is listed, but not with ${want.length === 1 ? 'this certificate' : 'all these certificates'}. Use the app signing key from Play Console, not your upload key.`, found };
}

/** adb commands to check verification on a device (Android 12+). */
export function adbCommands(packageName: string, host: string): string[] {
  return [`adb shell pm verify-app-links --re-verify ${packageName}`, `adb shell pm get-app-links ${packageName}`, `adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://${host}/"`];
}
