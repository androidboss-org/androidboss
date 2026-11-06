import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPLE_LABEL_GROUPS,
  APPLE_PRIVACY,
  appleLabels,
  applePurpose,
  mergeCollected,
  PLAY_DATA_TYPES,
  PLAY_PURPOSES,
  playAnswers,
  privacyManifest,
  privacyPolicy,
  SDK_PRESETS,
  type AppDetails,
} from './privacy.ts';

const app: AppDetails = { appName: 'Ledgerly', developer: 'Ledgerly Labs', email: 'privacy@example.com', website: 'https://example.com', encrypted: true, deletion: true, deletionUrl: 'https://example.com/delete' };
const appleTypes = new Set(APPLE_PRIVACY.dataTypes.map((t) => t.id));
const applePurposes = new Set(APPLE_PRIVACY.purposes.map((p) => p.id));

describe('Apple privacy data', () => {
  it('has Apple’s current lists', () => {
    expect(APPLE_PRIVACY.dataTypes.length).toBeGreaterThanOrEqual(35);
    expect(APPLE_PRIVACY.purposes.map((p) => p.id)).toContain('NSPrivacyCollectedDataTypePurposeAppFunctionality');
    expect(APPLE_PRIVACY.reasons.find((r) => r.id === 'CA92.1')?.category).toBe('NSPrivacyAccessedAPICategoryUserDefaults');
    expect(APPLE_PRIVACY.reasons.find((r) => r.id === '35F9.1')?.category).toBe('NSPrivacyAccessedAPICategorySystemBootTime');
    expect(APPLE_PRIVACY.reasons.find((r) => r.id === 'C617.1')?.category).toBe('NSPrivacyAccessedAPICategoryFileTimestamp');
  });

  it('maps every Play type to a real Apple type, and every Apple type to a label group', () => {
    for (const t of PLAY_DATA_TYPES) expect(appleTypes, t.name).toContain(t.apple);
    const grouped = new Set(APPLE_LABEL_GROUPS.flatMap(([, ids]) => ids.map((id) => `NSPrivacyCollectedDataType${id}`)));
    for (const t of appleTypes) expect(grouped, t).toContain(t);
  });

  it('maps every Play purpose to a real Apple purpose', () => {
    for (const p of PLAY_PURPOSES) for (const shared of [true, false]) expect(applePurposes).toContain(applePurpose(p.id, shared));
  });
});

describe('SDK presets', () => {
  it('only use known data types and link to the vendor', () => {
    for (const s of SDK_PRESETS) {
      expect(s.source, s.id).toMatch(/^https:\/\//);
      for (const c of s.collects) expect(PLAY_DATA_TYPES.map((t) => t.id), `${s.id}: ${c.type}`).toContain(c.type);
    }
  });
});

describe('outputs', () => {
  const sdks = SDK_PRESETS.filter((s) => ['crashlytics', 'admob', 'revenuecat'].includes(s.id));
  const merged = mergeCollected([{ type: 'email', purposes: ['account'], shared: false, optional: true, linked: true, tracking: false }], sdks);

  it('merges sources per data type', () => {
    const ids = merged.find((t) => t.type === 'device-ids')!;
    expect(ids.sources).toEqual(['Firebase Crashlytics', 'Google Mobile Ads (AdMob)']);
    expect(ids.shared).toBe(true);
    expect(ids.purposes).toEqual(expect.arrayContaining(['analytics', 'advertising', 'fraud']));
    expect(merged.map((t) => t.type)).toEqual(['approximate-location', 'email', 'purchases', 'interactions', 'crash-logs', 'diagnostics', 'device-ids']);
  });

  it('writes Play answers in the form’s terms', () => {
    const md = playAnswers(merged, app);
    expect(md).toContain('Is all of the user data collected by your app encrypted in transit? **Yes**');
    expect(md).toContain('### Email address');
    expect(md).toContain('Users can choose whether this data is collected');
  });

  it('builds the App Store label sections', () => {
    const labels = appleLabels(merged);
    expect(labels.linked).toEqual(expect.arrayContaining(['Contact Info', 'Purchases']));
    expect(labels.notLinked).toContain('Diagnostics');
    expect(labels.tracking).toEqual([]);
  });

  it('writes a privacy manifest with only Apple’s identifiers', () => {
    const xml = privacyManifest(merged, [{ category: 'NSPrivacyAccessedAPICategoryUserDefaults', reasons: ['CA92.1'] }], []);
    for (const [, id] of xml.matchAll(/<string>(NSPrivacyCollectedDataType\w+)<\/string>/g)) expect(appleTypes.has(id!) || applePurposes.has(id!), id).toBe(true);
    expect(xml).toContain('<string>NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising</string>');
    expect(xml).toContain('<string>CA92.1</string>');
    expect((xml.match(/<string>NSPrivacyCollectedDataTypeDeviceID<\/string>/g) ?? []).length).toBe(1);
  });

  it.skipIf(process.platform !== 'darwin')('writes a manifest that plutil accepts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xcprivacy-'));
    try {
      for (const [name, xml] of [
        ['full', privacyManifest(merged, [{ category: 'NSPrivacyAccessedAPICategoryUserDefaults', reasons: ['CA92.1'] }], ['ads.example.com'])],
        ['empty', privacyManifest([], [], [])],
      ] as const) {
        const file = join(dir, `${name}.xcprivacy`);
        writeFileSync(file, xml);
        expect(execFileSync('plutil', ['-lint', file], { encoding: 'utf8' })).toContain('OK');
        const json = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
        expect(typeof json.NSPrivacyTracking).toBe('boolean');
        expect(Array.isArray(json.NSPrivacyCollectedDataTypes)).toBe(true);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drafts a privacy policy from the same answers', () => {
    const md = privacyPolicy(merged, sdks, app, '5 November 2026');
    expect(md).toContain('# Privacy policy for Ledgerly');
    expect(md).toContain('- Firebase Crashlytics');
    expect(md).toContain('https://example.com/delete');
    expect(privacyPolicy([], [], app, '5 November 2026')).toContain('doesn’t collect personal data');
  });
});
