import { describe, expect, it } from 'vitest';
import { checkManifest, findPermission, NOTES, permissions, PLAY_RESTRICTED, RUNTIME_GROUPS, runtimeGroup } from './permissions.ts';

describe('permission data', () => {
  it('comes from the platform', () => {
    expect(permissions.length).toBeGreaterThan(1000);
    expect(findPermission('CAMERA')).toMatchObject({ name: 'android.permission.CAMERA', level: 'dangerous', since: 1 });
    expect(findPermission('Manifest.permission.POST_NOTIFICATIONS')).toMatchObject({ since: 33, level: 'dangerous' });
    expect(findPermission('ADD_VOICEMAIL')!.name).toBe('com.android.voicemail.permission.ADD_VOICEMAIL');
    expect(findPermission('android.permission.INTERNET')).toMatchObject({ level: 'normal' });
  });

  it('only curates permissions that exist', () => {
    const names = [...Object.values(RUNTIME_GROUPS).flat(), ...Object.keys(PLAY_RESTRICTED), ...Object.keys(NOTES)];
    expect(names.filter((n) => !findPermission(n))).toEqual([]);
  });

  it('puts every public dangerous permission in a dialog group, except the newest unconfirmed one', () => {
    const ungrouped = permissions.filter((p) => p.constant && p.level === 'dangerous' && !runtimeGroup(p)).map((p) => p.constant);
    expect(ungrouped.sort()).toEqual(['RANGING']);
    for (const list of Object.values(RUNTIME_GROUPS)) for (const c of list) expect(findPermission(c)!.level, c).toBe('dangerous');
  });
});

describe('checkManifest', () => {
  const manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.WRITE_SECURE_SETTINGS" />
    <uses-permission android:name="android.permission.ACCES_FINE_LOCATION" />
    <uses-permission android:name="com.google.android.c2dm.permission.RECEIVE" />
    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
    <uses-permission android:name="android.permission.CAMERA" />
</manifest>`;
  const r = checkManifest(manifest);
  const byName = (n: string, i = 0) => r.filter((u) => u.name.endsWith(n))[i]!;
  const texts = (n: string) => byName(n).findings.map((f) => `${f.level}: ${f.text}`);

  it('reads every uses-permission with its line', () => {
    expect(r).toHaveLength(11);
    expect(byName('CAMERA')).toMatchObject({ line: 3, group: 'Camera' });
  });

  it('explains runtime, special and signature permissions', () => {
    expect(texts('INTERNET')).toEqual([expect.stringMatching(/^info: On Android 17, an app targeting API 36 that requests INTERNET was also given ACCESS_LOCAL_NETWORK/)]);
    expect(texts('CAMERA')).toEqual(['info: Runtime permission (Camera dialog): request it in code before use.']);
    expect(texts('SCHEDULE_EXACT_ALARM')[0]).toBe('info: Special app access: the user grants it in Settings, not in a dialog.');
    expect(texts('WRITE_SECURE_SETTINGS')[0]).toMatch(/^warning: Signature permission/);
  });

  it('suggests maxSdkVersion and flags only when missing', () => {
    expect(texts('READ_EXTERNAL_STORAGE').join()).toContain('Add android:maxSdkVersion="32".');
    expect(texts('WRITE_EXTERNAL_STORAGE').join()).not.toContain('Add android:maxSdkVersion');
    expect(texts('BLUETOOTH_SCAN').join()).not.toContain('Add android:usesPermissionFlags');
  });

  it('catches typos, library permissions, Play restrictions and duplicates', () => {
    expect(texts('ACCES_FINE_LOCATION')[0]).toBe('error: Not a platform permission. Did you mean android.permission.ACCESS_FINE_LOCATION?');
    expect(texts('c2dm.permission.RECEIVE')[0]).toMatch(/library or another app/);
    expect(texts('QUERY_ALL_PACKAGES').join()).toMatch(/Google Play: Play allows it only when/);
    expect(byName('CAMERA', 1).findings[0]).toEqual({ level: 'info', text: 'Also declared on line 3.' });
  });
});
