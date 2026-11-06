import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bcp47, decodeValue, encodeValue, formatArgs, fromCsv, localeOfFolder, parseCsv, parseStringsXml, pluralQuantities, toCsv, validate, writeStringsXml, type ResourceFile } from './index.ts';

const fixture = (locale: string) => {
  const folder = locale ? `values-${locale}` : 'values';
  return parseStringsXml(readFileSync(new URL(`./fixtures/${folder}/strings.xml`, import.meta.url), 'utf8'), locale, `${folder}/strings.xml`);
};
const files = (): ResourceFile[] => [fixture(''), fixture('de'), fixture('ru')];

describe('locales', () => {
  it('reads folder qualifiers', () => {
    expect(['values', 'values-de', 'values-pt-rBR', 'values-b+sr+Latn', 'values-es-r419', 'values-night', 'values-v21', 'values-sw600dp'].map(localeOfFolder)).toEqual(['', 'de', 'pt-rBR', 'b+sr+Latn', 'es-r419', undefined, undefined, undefined]);
  });

  it('maps to BCP 47, including legacy codes', () => {
    expect(['', 'pt-rBR', 'b+sr+Latn', 'in', 'iw-rIL'].map(bcp47)).toEqual(['en', 'pt-BR', 'sr-Latn', 'id', 'he-IL']);
  });

  it('knows each language’s plural quantities', () => {
    expect(pluralQuantities('ru')).toEqual(['one', 'few', 'many', 'other']);
    expect(pluralQuantities('ja')).toEqual(['other']);
    expect(pluralQuantities('b+ar')).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
  });
});

describe('decodeValue / encodeValue', () => {
  it('decodes like aapt2', () => {
    expect(decodeValue("You\\'re back")).toBe("You're back");
    expect(decodeValue('"It\'s   spaced"')).toBe("It's   spaced");
    expect(decodeValue('a\\nb\\tc \\"q\\" \\\\')).toBe('a\nb\tc "q" \\');
    expect(decodeValue('Tom &amp; Jerry &lt;3')).toBe('Tom & Jerry <3');
    expect(decodeValue('  lots\n     of    space  ')).toBe('lots of space');
    expect(decodeValue('\\@handle')).toBe('@handle');
    expect(decodeValue('Caf\\u00e9')).toBe('Café');
    expect(decodeValue('Tap <b>Save</b> now')).toBe('Tap <b>Save</b> now');
    expect(decodeValue('<![CDATA[<b>raw</b>]]>')).toBe('<![CDATA[<b>raw</b>]]>');
  });

  it('round-trips plain text', () => {
    for (const t of ["It's", 'say "hi"', 'a & b < c', 'line\nbreak', '@mention', '?attr', 'back\\slash', '  padded  ', 'two  spaces', 'Tap <b>Save</b>', 'Order <xliff:g id="n">%1$d</xliff:g>', 'Café ✓'])
      expect(decodeValue(encodeValue(t))).toBe(t);
  });

  it('escapes what aapt2 needs', () => {
    expect(encodeValue("You're")).toBe("You\\'re");
    expect(encodeValue('@home')).toBe('\\@home');
    expect(encodeValue(' x ')).toBe('" x "');
  });
});

describe('parseStringsXml', () => {
  it('reads strings, plurals, arrays, comments and flags', () => {
    const f = fixture('');
    expect(f.entries.map((e) => `${e.kind}:${e.name}`)).toEqual(['string:app_name', 'string:greeting', 'string:quoted', 'string:escapes', 'string:entities', 'string:markup', 'string:xliff', 'string:at_sign', 'string:collapse', 'string:unicode', 'plurals:items', 'string-array:planets']);
    const greeting = f.entries[1]!;
    expect(greeting).toMatchObject({ translatable: true, description: "Greeting on the home screen. %1$s is the user's first name.", values: { '': "Hello, %1$s! You're back." } });
    expect(f.entries[0]!.translatable).toBe(false);
    expect(f.entries[2]!.description).toBeUndefined();
    expect(f.entries.find((e) => e.name === 'items')!.values).toEqual({ one: '%d item', other: '%d items' });
    expect(f.entries.find((e) => e.name === 'planets')!.values).toEqual({ 0: 'Mercury', 1: 'Venus' });
    expect(f.issues).toEqual([]);
  });

  it('flags unescaped apostrophes and duplicates', () => {
    const f = parseStringsXml(`<resources><string name="a">It's</string><string name="b">"It's fine"</string><string name="a">x</string></resources>`);
    expect(f.issues.map((i) => i.message)).toEqual(["Unescaped apostrophe: write \\' (aapt2 fails the build).", 'Duplicate string "a".']);
  });

  it('rejects files without resources', () => {
    expect(() => parseStringsXml('<manifest/>')).toThrow(/no <resources>/);
  });
});

describe('formatArgs', () => {
  it('normalises positions and types', () => {
    expect(formatArgs('%1$s has %2$d of %3$.2f, 100%%')).toEqual(['1:s', '2:d', '3:f']);
    expect(formatArgs('%s and %d')).toEqual(['1:s', '2:d']);
    expect(formatArgs('%2$s before %1$s')).toEqual(['1:s', '2:s']);
  });
});

describe('validate', () => {
  it('reports the problems in the fixture', () => {
    const issues = validate(files()).map((i) => `${i.severity} ${i.locale || 'default'} ${i.name ?? '-'}: ${i.message}`);
    expect(issues).toEqual([
      'error de greeting: Format arguments differ: default has 1:s, translation has 1:d. This can crash at runtime.',
      'error de old_key: Not in the default strings.xml: aapt2 drops it and lint fails release builds (ExtraTranslation). Remove it or add a default.',
      'warning de app_name: Translated, but marked translatable="false" in the default file.',
      'warning de markup: Markup differs: b, i vs b.',
      'warning de planets: 1 items, default has 2.',
      'warning de -: 7 untranslated: quoted, escapes, entities, xliff, at_sign, collapse, unicode. Users see the default text.',
      'warning ru items: Missing plural quantities for ru: few, many.',
      'warning ru -: 9 untranslated: quoted, escapes, entities, markup, xliff, at_sign, collapse, unicode…. Users see the default text.',
    ]);
  });

  it('fails unnumbered arguments unless formatted="false"', () => {
    const f = parseStringsXml('<resources><string name="a">%s paid %s</string><string name="b" formatted="false">%s %s</string><string name="c">%1$s paid %2$s</string></resources>');
    expect(validate([f]).map((i) => `${i.name}: ${i.severity}`)).toEqual(['a: error']);
    expect(f.entries[1]!.formatted).toBe(false);
  });

  it('allows the "one" plural to drop the number', () => {
    const base = parseStringsXml('<resources><plurals name="p"><item quantity="one">%d file</item><item quantity="other">%d files</item></plurals></resources>');
    const de = parseStringsXml('<resources><plurals name="p"><item quantity="one">Eine Datei</item><item quantity="other">%d Dateien</item></plurals></resources>', 'de');
    expect(validate([base, de])).toEqual([]);
  });

  it('needs a default file', () => {
    expect(validate([fixture('de')])[0]!.message).toMatch(/No default values\/strings.xml/);
  });
});

describe('CSV', () => {
  it('exports one row per string, quantity and array item', () => {
    const csv = toCsv(files());
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['key', 'description', 'default', 'de', 'ru']);
    expect(rows.map((r) => r[0])).toEqual(['key', 'greeting', 'quoted', 'escapes', 'entities', 'markup', 'xliff', 'at_sign', 'collapse', 'unicode', 'items#one', 'items#few', 'items#many', 'items#other', 'planets[0]', 'planets[1]']);
    expect(rows[1]).toEqual(['greeting', "Greeting on the home screen. %1$s is the user's first name.", "Hello, %1$s! You're back.", 'Hallo, %1$d!', 'Привет, %1$s!']);
    expect(rows.find((r) => r[0] === 'escapes')![2]).toBe('Line one\nTab\there "quoted" and a back\\slash');
    expect(toCsv(files(), { includeUntranslatable: true, bom: true })).toMatch(/^﻿key,description,default,de,ru\napp_name,/);
  });

  it('round-trips through CSV to the same strings', () => {
    const before = files();
    const after = fromCsv(toCsv(before, { includeUntranslatable: true }), before[0]);
    expect(after.map((f) => f.locale)).toEqual(['', 'de', 'ru']);
    for (const f of after) {
      const reparsed = parseStringsXml(writeStringsXml(f.entries), f.locale);
      const orig = before.find((b) => b.locale === f.locale)!;
      for (const e of reparsed.entries) {
        const o = orig.entries.find((x) => x.name === e.name && x.kind === e.kind)!;
        expect(e.values, `${f.locale}:${e.name}`).toEqual(o.values);
      }
    }
    // Untranslatable strings and keys missing from the default don't come back as translations.
    expect(after[1]!.entries.map((e) => e.name)).not.toContain('app_name');
  });

  it('parses quoted cells, CRLF and doubled quotes', () => {
    expect(parseCsv('key,de\r\n"a,b","say ""hi""\nnow"\r\n')).toEqual([['key', 'de'], ['a,b', 'say "hi"\nnow']]);
  });

  it('rejects headers that are not locales', () => {
    expect(() => fromCsv('key,default,German\nx,a,b')).toThrow(/"German" isn't a locale folder qualifier/);
    expect(() => fromCsv('name,de\nx,y')).toThrow(/first column must be "key"/);
  });
});
