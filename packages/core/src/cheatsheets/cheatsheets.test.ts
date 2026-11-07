import { describe, expect, it } from 'vitest';
import { CHEATSHEET_SLUGS, cheatsheets, entriesOf, fill, findEntries, placeholders } from './index.ts';

/** Words that mark a command as deleting data or changing device state. */
const RISKY = /\b(uninstall|pm clear|reset-permissions|wipe|erase|delete|rm -|force-idle|set-standby-bucket|settings put|wm size|wm density|uimode night|airplane-mode|tcpip|set-debug-app|revoke|status_bar .* override|snapshot load|emu kill|power capacity|network speed)\b/;

describe('cheatsheets', () => {
  it('have unique, URL-safe slugs and the expected set', () => {
    expect(CHEATSHEET_SLUGS).toEqual(['adb', 'gradle', 'emulator', 'android-cli', 'signing', 'simctl']);
    for (const s of CHEATSHEET_SLUGS) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  describe.each(cheatsheets.map((s) => [s.slug, s] as const))('%s', (_slug, s) => {
    const all = entriesOf(s);

    it('has a dated tool version, a short tagline and related tools', () => {
      expect(s.tool.checkedOn).toMatch(/^2026-\d\d-\d\d$/);
      expect(s.tool.version.length).toBeGreaterThan(0);
      expect(s.tagline.length).toBeLessThanOrEqual(120);
      expect(s.related.length).toBeGreaterThan(0);
      expect(all.length).toBeGreaterThanOrEqual(15);
    });

    it('has unique, URL-safe entry and section ids', () => {
      const ids = all.map((e) => e.entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
      const sections = s.sections.map((x) => x.id);
      expect(new Set(sections).size).toBe(sections.length);
      for (const id of sections) expect(ids).not.toContain(id);
    });

    it('writes titles as short tasks', () => {
      for (const { entry } of all) {
        expect(entry.title.length, entry.id).toBeLessThanOrEqual(70);
        expect(entry.title, entry.id).toMatch(/^[A-Z]/);
        expect(entry.title, entry.id).not.toMatch(/\.$/);
        expect(entry.tags.length, entry.id).toBeGreaterThan(0);
      }
    });

    it('declares every placeholder it uses, and uses every one it declares', () => {
      const declared = new Set(s.variables.map((v) => v.key));
      const used = new Set(all.flatMap(({ entry }) => [...placeholders(entry.command), ...placeholders(entry.note ?? '')]));
      for (const key of used) expect(declared, `{{${key}}} in ${s.slug}`).toContain(key);
      for (const key of declared) expect(used, `${key} declared but unused in ${s.slug}`).toContain(key);
      for (const { entry } of all) expect(fill(entry.command, s.variables), entry.id).not.toMatch(/\{\{/);
    });

    it('flags commands that delete data or change device state', () => {
      for (const { entry } of all) {
        if (RISKY.test(entry.command)) expect(entry.danger, `${entry.id}: ${entry.command}`).toBeDefined();
      }
    });

    it('explains entries that can’t be checked automatically', () => {
      for (const { entry } of all) if (entry.verify === 'none') expect(entry.note, entry.id).toBeTruthy();
    });
  });
});

describe('fill', () => {
  const vars = [
    { key: 'variant', label: 'Variant', example: 'debug' },
    { key: 'package', label: 'Package', example: 'com.example.app' },
  ];
  it('uses values, falls back to examples and applies modifiers', () => {
    expect(fill('./gradlew assemble{{variant:cap}} {{variant}}RuntimeClasspath', vars)).toBe('./gradlew assembleDebug debugRuntimeClasspath');
    expect(fill('adb uninstall {{package}}', vars, { package: 'com.my.shop' })).toBe('adb uninstall com.my.shop');
    expect(fill('adb uninstall {{package}}', vars, { package: '  ' })).toBe('adb uninstall com.example.app');
    expect(fill('{{unknown}} stays', vars)).toBe('{{unknown}} stays');
    expect(fill('{{variant:lower}}', vars, { variant: 'Release' })).toBe('release');
  });
});

describe('findEntries', () => {
  it('ranks title matches first and needs every word', () => {
    const r = findEntries(cheatsheets, 'logs one app');
    expect(r[0]!.entry.id).toBe('logcat-app');
    expect(findEntries(cheatsheets, 'logcat zzzz')).toEqual([]);
  });
  it('filters by sheet', () => {
    const r = findEntries(cheatsheets, 'install', 'simctl');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.sheet.slug === 'simctl')).toBe(true);
  });
  it('finds entries by tag', () => {
    expect(findEntries(cheatsheets, 'sha256').map((x) => x.entry.id)).toContain('signing-report');
  });
});
