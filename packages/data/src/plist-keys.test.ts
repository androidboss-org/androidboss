import { describe, expect, it } from 'vitest';
import { findPermission } from './permissions.ts';
import { ANDROID_TO_IOS, checkEntries, findPlistKey, iosUsageKeys, onIos, plistDocument, plistFragment, plistKeys, suggestFromManifest } from './plist-keys.ts';

describe('Apple data', () => {
  it('has Apple’s protected-resource keys', () => {
    expect(plistKeys.length).toBeGreaterThan(60);
    expect(findPlistKey('NSCameraUsageDescription')).toMatchObject({ type: 'string', xcodeName: 'Privacy - Camera Usage Description' });
    expect(onIos(findPlistKey('NSLocationAlwaysUsageDescription')!)?.deprecated).toBe('10.0');
    expect(iosUsageKeys.map((k) => k.key)).toContain('NSUserTrackingUsageDescription');
    expect(iosUsageKeys.map((k) => k.key)).not.toContain('NSCalendarsUsageDescription');
  });

  it('maps only real Android permissions to real iOS keys', () => {
    for (const [perm, m] of Object.entries(ANDROID_TO_IOS)) {
      expect(findPermission(perm), perm).toBeDefined();
      for (const k of [...m.keys, ...(m.older ?? []).map((o) => o.key)]) expect(findPlistKey(k), `${perm} → ${k}`).toBeDefined();
    }
  });
});

describe('suggestFromManifest', () => {
  const manifest = `<uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    <uses-permission android:name="android.permission.READ_CALENDAR" />
    <uses-permission android:name="android.permission.INTERNET" />`;

  it('suggests iOS keys, with older-iOS keys for low deployment targets', () => {
    expect(suggestFromManifest(manifest, 15).map((s) => `${s.key}<-${s.from.join('+')}`)).toEqual([
      'NSCameraUsageDescription<-CAMERA',
      'NSLocationWhenInUseUsageDescription<-ACCESS_FINE_LOCATION+ACCESS_BACKGROUND_LOCATION',
      'NSLocationAlwaysAndWhenInUseUsageDescription<-ACCESS_BACKGROUND_LOCATION',
      'NSCalendarsFullAccessUsageDescription<-READ_CALENDAR',
      'NSCalendarsUsageDescription<-READ_CALENDAR',
    ]);
    expect(suggestFromManifest(manifest, 17).map((s) => s.key)).not.toContain('NSCalendarsUsageDescription');
  });
});

describe('checkEntries', () => {
  it('flags empty and vague strings, missing companions and non-iOS keys', () => {
    const f = checkEntries(
      [
        { key: 'NSCameraUsageDescription', message: '' },
        { key: 'NSMicrophoneUsageDescription', message: 'We need access' },
        { key: 'NSLocationAlwaysAndWhenInUseUsageDescription', message: 'Shows nearby stores while you plan a route, even when the app is closed.' },
        { key: 'NSCalendarsFullAccessUsageDescription', message: 'Adds your bookings to your calendar and shows conflicts.' },
        { key: 'NSDesktopFolderUsageDescription', message: 'Saves exported reports to your Desktop folder.' },
        { key: 'NSMadeUpUsageDescription', message: 'Something long enough to not be vague at all.' },
      ],
      15,
    );
    expect(f.map((x) => `${x.level} ${x.key}: ${x.text.slice(0, 30)}`)).toEqual([
      'error NSCameraUsageDescription: Empty purpose string. App Revi',
      'warning NSMicrophoneUsageDescription: Too vague. Say what the app do',
      'info NSCalendarsFullAccessUsageDescription: Read from iOS 17.0; earlier ve',
      'warning NSDesktopFolderUsageDescription: Not used on iOS (macOS).',
      'error NSMadeUpUsageDescription: Not a key Apple documents.',
      'error NSLocationAlwaysAndWhenInUseUsageDescription: Always-on location also needs ',
      'error NSCalendarsUsageDescription: Deployment target iOS 15 also ',
    ]);
  });
});

describe('output', () => {
  it('escapes XML and builds a full plist', () => {
    expect(plistFragment([{ key: 'NSCameraUsageDescription', message: ' Scan <QR> codes & receipts ' }])).toBe('<key>NSCameraUsageDescription</key>\n<string>Scan &lt;QR&gt; codes &amp; receipts</string>');
    expect(plistDocument([{ key: 'NSCameraUsageDescription', message: 'x' }])).toMatch(/^<\?xml[\s\S]*<plist version="1.0">\n<dict>\n\t<key>NSCameraUsageDescription<\/key>\n\t<string>x<\/string>\n<\/dict>\n<\/plist>\n$/);
  });
});
