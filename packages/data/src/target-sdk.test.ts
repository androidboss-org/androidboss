import { describe, expect, it } from 'vitest';
import snapshot from './fixtures/behavior-change-ids.json' with { type: 'json' };
import { changes, changesBetween, changeUrl, findTargetSdk, readManifest } from './target-sdk.ts';

const PAGE_VERSION: Record<number, string> = { 31: '12', 33: '13', 34: '14', 35: '15', 36: '16', 37: '17' };

describe('change list', () => {
  it('has unique ids and links to real sections', () => {
    expect(new Set(changes.map((c) => c.id)).size).toBe(changes.length);
    for (const c of changes) {
      if (c.link.startsWith('http')) continue;
      const ids = (snapshot.ids as Record<string, string[]>)[PAGE_VERSION[c.api]!]!;
      expect(ids, `${c.id} ${c.link}`).toContain(c.link.slice(1));
    }
    expect(changeUrl(changes.find((c) => c.id === 'exported')!)).toBe('https://developer.android.com/about/versions/12/behavior-changes-12#exported');
  });

  it('covers every version from 12 to 17', () => {
    expect([...new Set(changes.map((c) => c.api))]).toEqual([31, 33, 34, 35, 36, 37]);
    for (const c of changes) {
      expect(c.summary.length, c.id).toBeGreaterThan(30);
      expect(c.action.length, c.id).toBeGreaterThan(15);
    }
  });

  it('selects the changes between two targets', () => {
    expect(changesBetween(35, 36).every((c) => c.api === 36)).toBe(true);
    expect(changesBetween(30, 37)).toHaveLength(changes.length);
    expect(changesBetween(36, 36)).toEqual([]);
  });
});

describe('manifest detection', () => {
  const manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-sdk android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
    <application android:fullBackupContent="@xml/backup" android:enableOnBackInvokedCallback="false">
        <activity android:name=".MainActivity" android:exported="true" android:screenOrientation="portrait">
            <intent-filter><action android:name="android.intent.action.MAIN" /></intent-filter>
        </activity>
        <activity android:name=".ShareActivity">
            <intent-filter><action android:name="android.intent.action.SEND" /></intent-filter>
        </activity>
        <service android:name=".SyncService" android:foregroundServiceType="dataSync" android:exported="false" />
        <service android:name=".PlayerService" android:foregroundServiceType="mediaPlayback" android:exported="false" />
        <receiver android:name=".BootReceiver" android:exported="false">
            <intent-filter><action android:name="android.intent.action.BOOT_COMPLETED" /></intent-filter>
        </receiver>
        <receiver android:name=".ShopWidget" android:exported="false">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
        </receiver>
    </application>
</manifest>`;
  const facts = readManifest(manifest);
  const hit = (id: string) => changes.find((c) => c.id === id)!.detect!(facts);

  it('reads components', () => {
    expect(facts.unexported).toEqual(['.ShareActivity']);
    expect(facts.services.map((s) => `${s.name}:${s.types}`)).toEqual(['.SyncService:dataSync', '.PlayerService:mediaPlayback']);
    expect(facts.receivers.map((r) => r.actions[0])).toEqual(['android.intent.action.BOOT_COMPLETED', 'android.appwidget.action.APPWIDGET_UPDATE']);
    expect(findTargetSdk(manifest)).toBe(34);
    expect(findTargetSdk('android {\n  defaultConfig { targetSdk = 35 }\n}')).toBe(35);
  });

  it('flags what the manifest shows', () => {
    expect(hit('exported')).toEqual({ severity: 'must', reason: 'No android:exported on .ShareActivity.' });
    expect(hit('granular-media')?.severity).toBe('must');
    expect(hit('approximate-location')).toMatchObject({ severity: 'must', reason: 'ACCESS_FINE_LOCATION is declared without ACCESS_COARSE_LOCATION.' });
    expect(hit('bluetooth-permissions')?.severity).toBe('must');
    expect(hit('backup-rules')?.severity).toBe('must');
    expect(hit('full-screen-intent')?.severity).toBe('must');
    expect(hit('datasync-timeout')).toEqual({ severity: 'must', reason: 'Affected services: .SyncService.' });
    expect(hit('boot-completed-fgs')?.reason).toContain('.SyncService, .PlayerService');
    expect(hit('large-screen-restrictions')).toEqual({ severity: 'must', reason: 'Locked orientation or size on .MainActivity.' });
    expect(hit('predictive-back')?.severity).toBe('must');
    expect(hit('widget-memory')).toEqual({ severity: 'must', reason: 'Widget provider: .ShopWidget.' });
    expect(hit('background-audio')?.severity).toBe('check');
  });

  it('stays quiet when the manifest shows no sign of a change', () => {
    const clean = readManifest(`<manifest><uses-permission android:name="android.permission.CAMERA" /><application><activity android:name=".Main" android:exported="true" /></application></manifest>`);
    const fired = changes.filter((c) => c.detect?.(clean)).map((c) => c.id);
    expect(fired).toEqual(['edge-to-edge-15', 'predictive-back']);
    expect(changes.filter((c) => c.detect?.(clean)?.severity === 'must').map((c) => c.id)).toEqual(['edge-to-edge-15']);
  });
});
