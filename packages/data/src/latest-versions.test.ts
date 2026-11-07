import { describe, expect, it } from 'vitest';
import { catalogUpdates, CENTRAL_LIBRARIES, compareVersions, isPrerelease, LATEST, newestStable, PLUGINS, updateFor } from './latest-versions.ts';

describe('version comparison', () => {
  it('orders versions like Maven', () => {
    expect(compareVersions('1.10.0', '1.9.2')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '2.0.0-rc01')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0-beta02', '2.0.0-beta10')).toBeLessThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('2024.09.00', '2026.09.00')).toBeLessThan(0);
  });
  it('spots pre-releases', () => {
    for (const v of ['1.0.0-alpha01', '2.0.0-beta1', '1.2-rc01', '2.4.0-Beta2', '1.0.0-dev-123', '3.0.0-M1', '1.0-SNAPSHOT']) expect(isPrerelease(v), v).toBe(true);
    for (const v of ['1.0.0', '2026.09.00', '1.13.1']) expect(isPrerelease(v), v).toBe(false);
  });
  it('picks the newest stable', () => {
    expect(newestStable(['1.0.0', '1.1.0-alpha01', '1.0.1'])).toBe('1.0.1');
    expect(newestStable(['1.0.0-alpha01', '1.0.0-alpha02'])).toBe('1.0.0-alpha02');
  });
  it('suggests only newer stable versions', () => {
    expect(updateFor('1.13.0', '1.19.1')).toEqual({ current: '1.13.0', latest: '1.19.1', major: false });
    expect(updateFor('2.11.0', '3.0.0')!.major).toBe(true);
    expect(updateFor('1.19.1', '1.19.1')).toBeUndefined();
    expect(updateFor('1.20.0-alpha01', '1.19.1')).toBeUndefined();
    expect(updateFor('$kotlinVersion', '2.4.21')).toBeUndefined();
    expect(updateFor('2024.12.01', '2026.09.00')!.major).toBe(false);
  });
});

describe('latest versions data', () => {
  it('is dated and covers AndroidX, Google and the curated lists', () => {
    expect(LATEST.checkedOn).toMatch(/^20\d\d-\d\d-\d\d$/);
    expect(Object.keys(LATEST.libraries).filter((k) => k.startsWith('androidx.')).length).toBeGreaterThan(1500);
    for (const c of CENTRAL_LIBRARIES) expect(LATEST.libraries[c], c).toBeDefined();
    for (const p of PLUGINS) expect(LATEST.plugins[p.id], p.id).toBeDefined();
    for (const v of [...Object.values(LATEST.plugins)]) expect(isPrerelease(v), v).toBe(false);
  });
});

describe('catalogUpdates', () => {
  const latest = { checkedOn: '2026-11-08', libraries: { 'a:x': '2.0.0', 'a:y': '2.0.0', 'b:z': '1.5.0', 'c:w': '1.0.0' }, plugins: { 'p.id': '9.5.1' } };
  it('groups by version key and checks that shared keys agree', () => {
    const u = catalogUpdates(
      [
        { coordinates: 'a:x', kind: 'library', version: '1.0.0', versionRef: 'a' },
        { coordinates: 'a:y', kind: 'library', version: '1.0.0', versionRef: 'a' },
        { coordinates: 'b:z', kind: 'library', version: '1.0.0', versionRef: 'bz' },
        { coordinates: 'c:w', kind: 'library', version: '1.0.0', versionRef: 'cw' },
        { coordinates: 'p.id', kind: 'plugin', version: '9.1.0', versionRef: 'agp' },
      ],
      latest,
    );
    expect(u.map((x) => [x.ref, x.latest, x.applicable, x.major])).toEqual([
      ['a', '2.0.0', true, true],
      ['agp', '9.5.1', true, false],
      ['bz', '1.5.0', true, false],
    ]);
  });
  it('marks a shared key with disagreeing artifacts as not applicable', () => {
    const u = catalogUpdates([{ coordinates: 'a:x', kind: 'library', version: '1.0.0', versionRef: 'mix' }, { coordinates: 'b:z', kind: 'library', version: '1.0.0', versionRef: 'mix' }], latest);
    expect(u[0]).toMatchObject({ ref: 'mix', latest: '2.0.0', applicable: false });
  });
});
