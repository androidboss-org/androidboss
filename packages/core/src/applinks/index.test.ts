import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adbCommands, checkAssetLinks, checkIntentFilters, compareStatements, findFingerprints, generateAssetLinks, generateIntentFilters, normalizeFingerprint, statementsUrl } from './index.ts';

// Real responses from digitalassetlinks.googleapis.com (statements:list), saved 2026-11-03.
const json = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const CALENDAR_FP = 'F0:FD:6C:5B:41:0F:25:CB:25:C3:B5:33:46:C8:97:2F:AE:30:F8:EE:74:11:DF:91:04:80:AD:6B:2D:60:DB:83';
const FP = '14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5';

describe('fingerprints', () => {
  it('normalises any SHA-256 form', () => {
    expect(normalizeFingerprint(FP.toLowerCase())).toBe(FP);
    expect(normalizeFingerprint(FP.replace(/:/g, ''))).toBe(FP);
    expect(normalizeFingerprint(`SHA-256: ${FP}`)).toBe(FP);
    expect(normalizeFingerprint(`SHA256:${FP}`)).toBe(FP);
  });

  it('rejects SHA-1 and junk', () => {
    expect(() => normalizeFingerprint('5B:22:9F:1D:84:57:62:40:19:0C:42:2C:7D:4A:0A:1D:E7:DE:31:B4')).toThrow(/SHA-1/);
    expect(() => normalizeFingerprint('nope')).toThrow(/isn't a SHA-256/);
  });

  it('finds fingerprints in keytool and signingReport output, ignoring SHA-1', () => {
    const keytool = `Certificate fingerprints:\n\t SHA1: 5B:22:9F:1D:84:57:62:40:19:0C:42:2C:7D:4A:0A:1D:E7:DE:31:B4\n\t SHA256: ${FP}\nSignature algorithm name: SHA256withRSA`;
    const report = `Variant: debug\nSHA1: 5B:22:9F:1D:84:57:62:40:19:0C:42:2C:7D:4A:0A:1D:E7:DE:31:B4\nSHA-256: ${FP}\nVariant: release\nSHA-256: ${CALENDAR_FP}`;
    expect(findFingerprints(keytool)).toEqual([FP]);
    expect(findFingerprints(report)).toEqual([FP, CALENDAR_FP]);
  });

  it('reads the Signatures line of adb shell pm get-app-links', () => {
    expect(findFingerprints(`  dev.example:\n    Signatures: [${FP}]\n    Domain verification state:\n      example.com: 1024`)).toEqual([FP]);
  });
});

describe('generateAssetLinks', () => {
  it('writes the statement list', () => {
    const out = generateAssetLinks({ apps: [{ packageName: 'com.example.shop', fingerprints: [FP.toLowerCase()] }] });
    expect(JSON.parse(out)).toEqual([
      { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.example.shop', sha256_cert_fingerprints: [FP] } },
    ]);
    expect(checkAssetLinks(out).findings).toEqual([{ level: 'ok', message: 'Valid: 1 app statement.' }]);
  });

  it('adds credential sharing and several apps', () => {
    const out = JSON.parse(generateAssetLinks({ apps: [{ packageName: 'com.example.shop', fingerprints: [FP] }, { packageName: 'com.example.shop.debug', fingerprints: [CALENDAR_FP] }], shareCredentials: true }));
    expect(out).toHaveLength(2);
    expect(out[0].relation).toEqual(['delegate_permission/common.handle_all_urls', 'delegate_permission/common.get_login_creds']);
  });

  it('rejects bad input', () => {
    expect(() => generateAssetLinks({ apps: [{ packageName: 'shop', fingerprints: [FP] }] })).toThrow(/valid package name/);
    expect(() => generateAssetLinks({ apps: [{ packageName: 'com.x.y', fingerprints: [] }] })).toThrow(/SHA-256 signing fingerprint/);
  });
});

describe('generateIntentFilters', () => {
  it('writes one verified filter per host', () => {
    const out = generateIntentFilters({ hosts: ['https://Example.com/shop', 'www.example.com'], paths: [{ kind: 'prefix', value: 'products' }, { kind: 'exact', value: '/cart' }] });
    expect(out.match(/<intent-filter android:autoVerify="true">/g)).toHaveLength(2);
    expect(out).toContain('<data android:host="example.com" />');
    expect(out).toContain('<data android:pathPrefix="/products" />');
    expect(out).toContain('<data android:path="/cart" />');
    expect(checkIntentFilters(out)).toEqual({
      findings: [{ level: 'ok', message: '2 App Link filters look right.' }],
      verify: [
        { host: 'example.com', url: 'https://example.com/.well-known/assetlinks.json' },
        { host: 'www.example.com', url: 'https://www.example.com/.well-known/assetlinks.json' },
      ],
    });
  });

  it('rejects things that are not hosts', () => {
    expect(() => generateIntentFilters({ hosts: ['not a host'], paths: [] })).toThrow(/isn't a host name/);
  });
});

describe('checkAssetLinks', () => {
  it('explains broken files', () => {
    expect(checkAssetLinks('{"relation": []}').findings[0]!.message).toMatch(/top level must be a JSON array/);
    expect(checkAssetLinks('[{"a":1},]').findings[0]!.message).toMatch(/^Not valid JSON/);
    const f = checkAssetLinks(JSON.stringify([{ relation: ['delegate_permission/common.handle_all_url'], target: { namespace: 'android_app', package_name: 'com.example.shop', sha256_cert_fingerprints: [FP.toLowerCase(), '5B:22:9F:1D:84:57:62:40:19:0C:42:2C:7D:4A:0A:1D:E7:DE:31:B4'] } }])).findings;
    expect(f.map((x) => x.message)).toEqual([
      'Statement 1: unknown relation "delegate_permission/common.handle_all_url". App Links need "delegate_permission/common.handle_all_urls".',
      `Statement 1: write fingerprints as uppercase hex pairs separated by colons: ${FP}`,
      'Statement 1: That is a SHA-1 fingerprint. App Links need the SHA-256 one.',
    ]);
  });
});

describe('checkIntentFilters', () => {
  it('flags deep links that will not verify', () => {
    const xml = `<activity android:name=".Main">
      <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <data android:scheme="http" android:host="example.com" />
      </intent-filter>
      <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="https" />
        <data android:scheme="shop" />
        <data android:host="*.example.org" />
        <data android:host="example.net" />
        <data android:pathPrefix="/p" />
      </intent-filter>
    </activity>`;
    const r = checkIntentFilters(xml);
    expect(r.findings.map((f) => `${f.level}: ${f.message}`)).toEqual([
      'warning: Filter 1: no android:autoVerify="true". These links are plain deep links: Android shows a chooser or opens the browser instead of your app.',
      "error: Filter 1: missing category BROWSABLE, so links from browsers and other apps can't open it.",
      'error: Filter 1: only http is declared. App Links need https.',
      'warning: Filter 2: custom scheme shop in a verified filter. Put custom schemes in their own intent filter.',
      'info: Filter 2: 2 hosts and path rules in one filter: every path applies to every host. Use one filter per host if paths differ.',
      'info: Filter 2: *.example.org is verified with the file on example.org.',
    ]);
    expect(r.verify.map((v) => v.host)).toEqual(['example.org', 'example.net']);
  });

  it('needs a link filter', () => {
    expect(checkIntentFilters('<manifest/>').findings[0]!.level).toBe('error');
  });
});

describe('compareStatements (real API responses)', () => {
  it('confirms a real link', () => {
    expect(compareStatements(json('google.statements.json'), 'com.google.android.calendar', [CALENDAR_FP])).toMatchObject({ status: 'linked' });
  });

  it('spots a certificate that is not listed', () => {
    const r = compareStatements(json('google.statements.json'), 'com.google.android.calendar', [FP]);
    expect(r.status).toBe('wrong-cert');
    expect(r.found).toContain(CALENDAR_FP);
  });

  it('spots a package the site does not list', () => {
    expect(compareStatements(json('google.statements.json'), 'com.example.shop', [FP])).toMatchObject({ status: 'no-package' });
  });

  it('reports a missing file', () => {
    const r = compareStatements(json('missing.statements.json'), 'com.example.shop', [FP]);
    expect(r.status).toBe('no-file');
    expect(r.message).toMatch(/404 Not Found/);
  });

  it('builds the API URL and adb commands', () => {
    expect(statementsUrl('example.com')).toBe('https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https%3A%2F%2Fexample.com&relation=delegate_permission%2Fcommon.handle_all_urls');
    expect(adbCommands('com.example.shop', 'example.com')[0]).toBe('adb shell pm verify-app-links --re-verify com.example.shop');
  });
});
