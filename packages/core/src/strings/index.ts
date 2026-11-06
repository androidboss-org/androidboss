/**
 * Android string resources: read the strings.xml files in values folders, export a translation
 * CSV, import it back to strings.xml per locale, and check translations.
 *
 * Values are shown to translators as plain text: Android escapes (\' \" \n \@)
 * and XML entities are decoded, inline markup (<b>, <xliff:g>, …) is kept as
 * written. Writing reverses that. Output is checked with aapt2 in
 * strings.android.test.ts.
 */

export type EntryKind = 'string' | 'plurals' | 'string-array';

export interface StringEntry {
  name: string;
  kind: EntryKind;
  translatable: boolean;
  /** formatted="false": % is literal, so aapt2 doesn't check format arguments. */
  formatted?: false;
  /** Comment right above the entry: context for translators. */
  description?: string;
  /** string: one value; plurals: by quantity; arrays: by index. Plain text. */
  values: Record<string, string>;
}

export interface ResourceFile {
  /** Folder qualifier: '' for values/, 'de', 'pt-rBR', 'b+sr+Latn'. */
  locale: string;
  path: string;
  entries: StringEntry[];
  /** Problems found while reading: duplicates, unescaped quotes. */
  issues: Issue[];
}

export type Severity = 'error' | 'warning' | 'info';

export interface Issue {
  severity: Severity;
  locale: string;
  name?: string;
  message: string;
}

export class StringsError extends Error {}

// ---------------------------------------------------------------------------
// Locales

/** values-de-rCH → 'de-rCH'; values-night → undefined (not a locale folder). */
export function localeOfFolder(folder: string): string | undefined {
  if (folder === 'values') return '';
  const q = folder.replace(/^values-/, '');
  if (/^[a-z]{2,3}(-r[A-Z]{2}|-r\d{3})?$/.test(q) || /^b\+[a-zA-Z]{2,8}(\+[a-zA-Z0-9]+)*$/.test(q)) return q;
  return undefined;
}

/** Android qualifier → BCP 47: 'pt-rBR' → 'pt-BR', 'b+sr+Latn' → 'sr-Latn', 'in' → 'id'. */
export function bcp47(locale: string): string {
  if (!locale) return 'en';
  if (locale.startsWith('b+')) return locale.slice(2).replace(/\+/g, '-');
  const legacy: Record<string, string> = { in: 'id', iw: 'he', ji: 'yi' };
  const [lang, region] = locale.split('-r');
  return [legacy[lang!] ?? lang, region].filter(Boolean).join('-');
}

const PLURAL_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** Quantities a language uses, from CLDR via Intl (the same data Android's ICU uses). */
export function pluralQuantities(locale: string): string[] {
  try {
    const cats = new Intl.PluralRules(bcp47(locale)).resolvedOptions().pluralCategories as string[];
    return PLURAL_ORDER.filter((q) => cats.includes(q));
  } catch {
    return ['one', 'other'];
  }
}

// ---------------------------------------------------------------------------
// Text ↔ Android XML

const TAG = /<\/?(?:b|i|u|a|br|font|big|small|strike|sup|sub|tt|span|annotation|xliff:g|li|ul|ol|p)\b[^>]*\/?>/g;
const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENTITY[e] ?? m),
  );

const COLLAPSED = '\u0002';

/** Decode one run of text (no tags) the way aapt2 does. */
function decodeRun(s: string, quoted: { on: boolean }): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === '\\' && i + 1 < s.length) {
      const n = s[++i]!;
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'u' ? String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16)) : n;
      if (n === 'u') i += 4;
    } else if (c === '"') quoted.on = !quoted.on;
    else if (!quoted.on && /\s/.test(c)) {
      // Unquoted whitespace collapses to one space (marked, so only it is trimmed at the ends).
      if (!out.endsWith(COLLAPSED)) out += COLLAPSED;
      while (i + 1 < s.length && /\s/.test(s[i + 1]!)) i++;
    } else out += c;
  }
  return out;
}

/** Raw XML content of an element → plain text for translators. */
export function decodeValue(raw: string): string {
  const cdata: string[] = [];
  const src = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, c: string) => `\u0000${cdata.push(c) - 1}\u0000`);
  const quoted = { on: false };
  let out = '';
  let last = 0;
  for (const m of src.matchAll(TAG)) {
    out += decodeRun(decodeEntities(src.slice(last, m.index)), quoted) + m[0];
    last = m.index! + m[0].length;
  }
  out += decodeRun(decodeEntities(src.slice(last)), quoted);
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<![CDATA[${cdata[+i]}]]>`);
  return out.replace(/^\u0002+|\u0002+$/g, '').replace(/\u0002+/g, ' ');
}

/** Plain text → Android XML content that decodes back to the same text. */
export function encodeValue(text: string): string {
  const parts: string[] = [];
  let last = 0;
  const escapeRun = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
  const src = text.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, (m) => `\u0001${encodeURIComponent(m)}\u0001`);
  for (const m of src.matchAll(TAG)) {
    parts.push(escapeRun(src.slice(last, m.index)), m[0]);
    last = m.index! + m[0].length;
  }
  parts.push(escapeRun(src.slice(last)));
  let out = parts.join('').replace(/\u0001([^\u0001]*)\u0001/g, (_m, c: string) => decodeURIComponent(c));
  if (/^[@?]/.test(out)) out = `\\${out}`;
  // Keep leading, trailing and repeated spaces, which Android would otherwise collapse.
  if (/^ | $| {2}/.test(out)) out = `"${out}"`;
  return out;
}

// ---------------------------------------------------------------------------
// Parsing

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`))?.[1];

/** Raw content has an apostrophe aapt2 rejects: not escaped, not inside "…". */
function unescapedApostrophe(raw: string): boolean {
  const text = raw.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(TAG, '');
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '\\') i++;
    else if (c === '"') quoted = !quoted;
    else if (c === "'" && !quoted) return true;
  }
  return false;
}

export function parseStringsXml(xml: string, locale = '', path = ''): ResourceFile {
  if (!/<resources[\s>]/.test(xml)) throw new StringsError(`${path || 'File'} has no <resources> element.`);
  const body = xml.slice(xml.search(/<resources[\s>]/));
  const file: ResourceFile = { locale, path, entries: [], issues: [] };
  const seen = new Set<string>();
  // string-array before string: `string\b` would also match the start of `string-array`.
  const re = /<!--([\s\S]*?)-->|<(string-array|plurals|string)(?![\w-])([^>]*?)(\/>|>([\s\S]*?)<\/\2\s*>)/g;
  let comment: string | undefined;
  let lastEnd = 0;

  for (const m of body.matchAll(re)) {
    // A comment only describes the entry right after it.
    if (comment && /\S/.test(body.slice(lastEnd, m.index).replace(/<\/?resources[^>]*>/g, ''))) comment = undefined;
    lastEnd = m.index! + m[0].length;
    if (m[1] !== undefined) {
      comment = m[1].trim();
      continue;
    }
    const kind = m[2] as EntryKind;
    const attrs = m[3]!;
    const inner = m[5] ?? '';
    const name = attr(attrs, 'name');
    if (!name) continue;
    if (seen.has(`${kind}:${name}`)) file.issues.push({ severity: 'error', locale, name, message: `Duplicate ${kind} "${name}".` });
    seen.add(`${kind}:${name}`);
    const entry: StringEntry = {
      name,
      kind,
      translatable: attr(attrs, 'translatable') !== 'false',
      ...(attr(attrs, 'formatted') === 'false' ? { formatted: false as const } : {}),
      values: {},
      ...(comment ? { description: comment } : {}),
    };
    comment = undefined;

    const take = (key: string, raw: string) => {
      if (unescapedApostrophe(raw)) file.issues.push({ severity: 'error', locale, name, message: `Unescaped apostrophe${kind === 'string' ? '' : ` in ${key}`}: write \\' (aapt2 fails the build).` });
      entry.values[key] = decodeValue(raw);
    };
    if (kind === 'string') take('', inner);
    else if (kind === 'plurals') for (const it of inner.matchAll(/<item\b([^>]*)>([\s\S]*?)<\/item\s*>/g)) take(attr(it[1]!, 'quantity') ?? '?', it[2]!);
    else [...inner.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/g)].forEach((it, i) => take(String(i), it[1]!));
    file.entries.push(entry);
  }
  return file;
}

// ---------------------------------------------------------------------------
// Writing

export function writeStringsXml(entries: readonly StringEntry[]): string {
  const needsXliff = entries.some((e) => Object.values(e.values).some((v) => v.includes('<xliff:')));
  const lines = [`<?xml version="1.0" encoding="utf-8"?>`, `<resources${needsXliff ? ' xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2"' : ''}>`];
  for (const e of entries) {
    if (e.description) lines.push(`    <!-- ${e.description.replace(/--/g, '- -')} -->`);
    const tr = (e.translatable ? '' : ' translatable="false"') + (e.formatted === false ? ' formatted="false"' : '');
    if (e.kind === 'string') lines.push(`    <string name="${e.name}"${tr}>${encodeValue(e.values[''] ?? '')}</string>`);
    else if (e.kind === 'plurals') {
      lines.push(`    <plurals name="${e.name}"${tr}>`);
      for (const q of PLURAL_ORDER) if (e.values[q] !== undefined) lines.push(`        <item quantity="${q}">${encodeValue(e.values[q])}</item>`);
      lines.push('    </plurals>');
    } else {
      lines.push(`    <string-array name="${e.name}"${tr}>`);
      for (const k of Object.keys(e.values).sort((a, b) => +a - +b)) lines.push(`        <item>${encodeValue(e.values[k]!)}</item>`);
      lines.push('    </string-array>');
    }
  }
  lines.push('</resources>', '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CSV

/** 'name', 'name#one' for plurals, 'name[2]' for arrays. */
export function rowKey(e: Pick<StringEntry, 'name' | 'kind'>, sub: string): string {
  return e.kind === 'string' ? e.name : e.kind === 'plurals' ? `${e.name}#${sub}` : `${e.name}[${sub}]`;
}

function parseRowKey(key: string): { name: string; kind: EntryKind; sub: string } {
  const p = key.match(/^(.+)#(zero|one|two|few|many|other)$/);
  if (p) return { name: p[1]!, kind: 'plurals', sub: p[2]! };
  const a = key.match(/^(.+)\[(\d+)\]$/);
  if (a) return { name: a[1]!, kind: 'string-array', sub: a[2]! };
  return { name: key, kind: 'string', sub: '' };
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ''));
}

const DEFAULT_COLUMN = 'default';

export interface CsvOptions {
  /** Add rows for translatable="false" strings. */
  includeUntranslatable?: boolean;
  /** Start with a byte-order mark so Excel opens UTF-8 correctly. */
  bom?: boolean;
}

/** One row per string, plural quantity or array item; one column per locale. */
export function toCsv(files: readonly ResourceFile[], o: CsvOptions = {}): string {
  const def = files.find((f) => f.locale === '');
  if (!def) throw new StringsError('No default values/strings.xml.');
  const locales = [...new Set(files.map((f) => f.locale).filter(Boolean))].sort();
  const lookup = new Map(locales.map((l) => [l, new Map(files.filter((f) => f.locale === l).flatMap((f) => f.entries.map((e) => [`${e.kind}:${e.name}`, e] as const)))]));
  const rows = [['key', 'description', DEFAULT_COLUMN, ...locales]];
  for (const e of def.entries) {
    if (!e.translatable && !o.includeUntranslatable) continue;
    // Plural rows cover every quantity any of the locales needs.
    const subs = e.kind === 'plurals' ? PLURAL_ORDER.filter((q) => e.values[q] !== undefined || locales.some((l) => pluralQuantities(l).includes(q))) : Object.keys(e.values);
    for (const sub of subs) rows.push([rowKey(e, sub), e.description ?? '', e.values[sub] ?? '', ...locales.map((l) => lookup.get(l)!.get(`${e.kind}:${e.name}`)?.values[sub] ?? '')]);
  }
  return (o.bom ? '﻿' : '') + rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/**
 * CSV back to resource files, one per locale column. Entry order, kinds and
 * translatable flags come from `base` (the default strings) when given.
 */
export function fromCsv(csv: string, base?: ResourceFile): ResourceFile[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header || header[0]?.trim().toLowerCase() !== 'key') throw new StringsError('The first column must be "key".');
  const cols = header.map((h) => h.trim());
  const descCol = cols.indexOf('description');
  const localeCols = cols.map((c, i) => [c, i] as const).filter(([c, i]) => i > 0 && i !== descCol);
  for (const [c] of localeCols) if (c !== DEFAULT_COLUMN && localeOfFolder(`values-${c}`) === undefined) throw new StringsError(`"${c}" isn't a locale folder qualifier. Use names like de, pt-rBR or b+sr+Latn.`);

  return localeCols.map(([col, idx]) => {
    const locale = col === DEFAULT_COLUMN ? '' : col;
    const byName = new Map<string, StringEntry>();
    for (const r of rows) {
      const value = r[idx] ?? '';
      const k = parseRowKey(r[0]!.trim());
      // Empty cells are untranslated; empty plural quantities are ones this language doesn't use.
      if (!value && (locale || k.kind === 'plurals')) continue;
      const baseEntry = base?.entries.find((e) => e.name === k.name && e.kind === k.kind);
      if (locale && baseEntry && !baseEntry.translatable) continue;
      const id = `${k.kind}:${k.name}`;
      if (!byName.has(id)) byName.set(id, { name: k.name, kind: k.kind, translatable: baseEntry?.translatable ?? true, values: {}, ...(!locale && descCol > 0 && r[descCol] ? { description: r[descCol] } : {}) });
      byName.get(id)!.values[k.sub] = value;
    }
    const order = base ? base.entries.map((e) => `${e.kind}:${e.name}`) : [];
    const entries = [...byName.entries()].sort(([a], [b]) => (order.indexOf(a) >>> 0) - (order.indexOf(b) >>> 0)).map(([, e]) => e);
    return { locale, path: `values${locale ? `-${locale}` : ''}/strings.xml`, entries, issues: [] };
  });
}

// ---------------------------------------------------------------------------
// Validation

const FORMAT = /%(?:(\d+)\$)?[-#+ 0,(]*\d*(?:\.\d+)?([sSdoxXeEfgGaAcbBhHn%])/g;

/** Format arguments by position: ['1:s', '2:d']. */
export function formatArgs(text: string): string[] {
  const out: string[] = [];
  let next = 1;
  for (const m of text.replace(/<!\[CDATA\[|\]\]>/g, '').matchAll(FORMAT)) {
    if (m[2] === '%' || m[2] === 'n') continue;
    const pos = m[1] ? +m[1] : next++;
    const type = /[dox]/i.test(m[2]!) ? 'd' : /[eEfgGaA]/.test(m[2]!) ? 'f' : m[2]!.toLowerCase() === 'c' ? 'c' : 's';
    out.push(`${pos}:${type}`);
  }
  return [...new Set(out)].sort();
}

function unnumberedArgs(text: string): number {
  return [...text.matchAll(FORMAT)].filter((m) => !m[1] && m[2] !== '%' && m[2] !== 'n').length;
}

/** Opening tag names, sorted: 'b, i, xliff:g'. */
const tags = (s: string) => (s.match(TAG) ?? []).filter((t) => !t.startsWith('</')).map((t) => t.match(/^<([\w:]+)/)![1]!.toLowerCase()).sort().join(', ');

export function validate(files: readonly ResourceFile[]): Issue[] {
  const issues: Issue[] = files.flatMap((f) => f.issues);
  const def = files.filter((f) => f.locale === '');
  if (!def.length) return [...issues, { severity: 'error', locale: '', message: 'No default values/strings.xml: the app crashes in locales without a translation.' }];
  const base = new Map(def.flatMap((f) => f.entries).map((e) => [`${e.kind}:${e.name}`, e]));

  // aapt2: "multiple substitutions specified in non-positional format" fails the build.
  for (const f of files)
    for (const e of f.entries)
      if (e.formatted !== false && Object.values(e.values).some((v) => unnumberedArgs(v) > 1))
        issues.push({ severity: 'error', locale: f.locale, name: e.name, message: 'Several unnumbered arguments (%s %s) fail the build. Number them (%1$s, %2$s) or add formatted="false".' });
  for (const e of base.values()) if (e.kind === 'plurals' && e.values.other === undefined) issues.push({ severity: 'error', locale: '', name: e.name, message: 'Plurals need an "other" quantity.' });

  const locales = [...new Set(files.map((f) => f.locale).filter(Boolean))].sort();
  for (const locale of locales) {
    const entries = new Map(files.filter((f) => f.locale === locale).flatMap((f) => f.entries).map((e) => [`${e.kind}:${e.name}`, e]));
    const missing: string[] = [];
    for (const [id, b] of base) {
      const t = entries.get(id);
      if (!b.translatable) {
        if (t) issues.push({ severity: 'warning', locale, name: b.name, message: 'Translated, but marked translatable="false" in the default file.' });
        continue;
      }
      if (!t) {
        missing.push(b.name);
        continue;
      }
      if (b.kind === 'plurals') {
        const need = pluralQuantities(locale);
        const lack = need.filter((q) => t.values[q] === undefined);
        if (lack.length) issues.push({ severity: 'warning', locale, name: b.name, message: `Missing plural quantities for ${bcp47(locale)}: ${lack.join(', ')}.` });
        const extra = Object.keys(t.values).filter((q) => !need.includes(q) && q !== 'zero' && q !== 'two');
        if (extra.length) issues.push({ severity: 'info', locale, name: b.name, message: `${bcp47(locale)} never uses ${extra.join(', ')}; those items are ignored.` });
      }
      if (b.kind === 'string-array' && Object.keys(t.values).length !== Object.keys(b.values).length)
        issues.push({ severity: 'warning', locale, name: b.name, message: `${Object.keys(t.values).length} items, default has ${Object.keys(b.values).length}.` });

      const baseText = Object.values(b.values).join('\n');
      const subs = Object.keys(t.values);
      for (const sub of subs) {
        const v = t.values[sub]!;
        const ref = b.values[sub] ?? b.values.other ?? baseText;
        const label = sub && b.kind !== 'string' ? ` (${sub})` : '';
        if (!v.trim()) {
          issues.push({ severity: 'warning', locale, name: b.name, message: `Empty translation${label}.` });
          continue;
        }
        const want = formatArgs(ref);
        const got = formatArgs(v);
        // Plural "one" may legitimately drop the number ("One item").
        const loose = b.kind === 'plurals' && got.every((g) => want.includes(g));
        if (want.join() !== got.join() && !loose) issues.push({ severity: 'error', locale, name: b.name, message: `Format arguments differ${label}: default has ${want.join(', ') || 'none'}, translation has ${got.join(', ') || 'none'}. This can crash at runtime.` });
        if (tags(ref) !== tags(v)) issues.push({ severity: 'warning', locale, name: b.name, message: `Markup differs${label}: ${tags(ref) || 'none'} vs ${tags(v) || 'none'}.` });
      }
    }
    if (missing.length) issues.push({ severity: 'warning', locale, message: `${missing.length} untranslated: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}. Users see the default text.` });
    for (const [id, t] of entries) if (!base.has(id)) issues.push({ severity: 'error', locale, name: t.name, message: 'Not in the default strings.xml: aapt2 drops it and lint fails release builds (ExtraTranslation). Remove it or add a default.' });
  }
  const order: Severity[] = ['error', 'warning', 'info'];
  return issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}
