/**
 * Checks string handling against aapt2 (CHECK_ANDROID=1): our decoding must
 * match the values aapt2 compiles, and files we write must compile to the
 * same values as the originals.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aapt2, androidJar, enabled } from '../testing/android.ts';
import { fromCsv, parseStringsXml, toCsv, writeStringsXml } from './index.ts';

const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
const LOCALES = ['', 'de', 'ru'];

/** Compile a res/ folder and return { 'locale/name': value } from `aapt2 dump resources`. */
function compiled(res: string): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'strings-'));
  writeFileSync(join(dir, 'AndroidManifest.xml'), '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="dev.androidboss.strings"/>');
  execFileSync(aapt2!, ['compile', '--dir', res, '-o', join(dir, 'res.zip')]);
  execFileSync(aapt2!, ['link', '-I', androidJar!, '--manifest', join(dir, 'AndroidManifest.xml'), '-o', join(dir, 'app.apk'), join(dir, 'res.zip')], { stdio: 'pipe' });
  const dump = execFileSync(aapt2!, ['dump', 'resources', join(dir, 'app.apk')], { encoding: 'utf8' });
  const out: Record<string, string> = {};
  let name = '';
  // Values can span lines ("Line one\nTab…"); collect until the closing quote.
  const lines = dump.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const r = lines[i]!.match(/^\s+resource 0x[0-9a-f]+ string\/(\S+)/);
    if (r) {
      name = r[1]!;
      continue;
    }
    const v = lines[i]!.match(/^\s+\(([\w-]*)\) (?:\(styled string\) )?"(.*)$/);
    if (!v || !name) continue;
    let text = v[2]!;
    while (!/"(?: [a-z]+:\d+,\d+)*$/.test(text) && i + 1 < lines.length) text += `\n${lines[++i]!.replace(/^\s{6}/, '')}`;
    out[`${v[1]}/${name}`] = text.replace(/"(?: [a-z]+:\d+,\d+)*$/, '');
  }
  return out;
}

const stripTags = (s: string) => s.replace(/<\/?[a-z:]+\b[^>]*>/g, '');

describe.skipIf(!enabled || !aapt2 || !androidJar)('strings against aapt2', () => {
  let cache: Record<string, string> | undefined;
  const originalValues = () => (cache ??= compiled(FIXTURES));

  it('decodes every string the way aapt2 compiles it', () => {
    const original = originalValues();
    for (const locale of LOCALES) {
      const folder = locale ? `values-${locale}` : 'values';
      const f = parseStringsXml(readFileSync(join(FIXTURES, folder, 'strings.xml'), 'utf8'), locale);
      for (const e of f.entries.filter((x) => x.kind === 'string')) {
        const key = `${locale}/${e.name}`;
        if (!(key in original)) continue; // dropped by aapt2, like old_key
        expect(stripTags(e.values['']!), key).toBe(original[key]);
      }
    }
    expect(Object.keys(original).length).toBeGreaterThan(10);
  });

  it('writes files that compile to the same values, through CSV and back', () => {
    const files = LOCALES.map((l) => parseStringsXml(readFileSync(join(FIXTURES, l ? `values-${l}` : 'values', 'strings.xml'), 'utf8'), l));
    const back = fromCsv(toCsv(files, { includeUntranslatable: true }), files[0]);
    const res = mkdtempSync(join(tmpdir(), 'strings-res-'));
    for (const f of back) {
      mkdirSync(join(res, f.locale ? `values-${f.locale}` : 'values'), { recursive: true });
      writeFileSync(join(res, f.locale ? `values-${f.locale}` : 'values', 'strings.xml'), writeStringsXml(f.entries));
    }
    const original = originalValues();
    const rewritten = compiled(res);
    // Same values, minus what the CSV deliberately drops (translations of untranslatable or unknown keys).
    const expected = Object.fromEntries(Object.entries(original).filter(([k]) => !/^de\/(app_name|old_key)$/.test(k)));
    expect(rewritten).toEqual(expected);
  });

});
