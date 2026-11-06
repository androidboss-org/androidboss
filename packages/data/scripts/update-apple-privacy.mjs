#!/usr/bin/env node
/**
 * Rebuilds src/apple-privacy.json from Apple's documentation data for privacy
 * manifests (PrivacyInfo.xcprivacy): every collected data type and purpose
 * identifier, and every required-reason API category with its approved reasons.
 *
 *   node scripts/update-apple-privacy.mjs
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://developer.apple.com/tutorials/data/documentation/bundleresources/app-privacy-configuration';

const text = (o) => {
  if (Array.isArray(o)) return o.map(text).join(' ');
  if (o && typeof o === 'object') return (o.text ?? o.code ?? '') + ['inlineContent', 'content', 'items'].map((k) => (o[k] ? text(o[k]) : '')).join(' ');
  return '';
};
const clean = (s) => s.replace(/\s+/g, ' ').trim();

async function values(path) {
  const page = await (await fetch(`${BASE}/${path}.json`)).json();
  const section = page.primaryContentSections.find((s) => s.kind === 'possibleValues');
  if (!section) throw new Error(`${path}: no possible values`);
  return section.values.map((v) => ({ id: v.name, description: clean(text(v.content)) }));
}

const dataTypes = await values('nsprivacycollecteddatatypes/nsprivacycollecteddatatype');
const purposes = await values('nsprivacycollecteddatatypes/nsprivacycollecteddatatypepurposes');
const categories = await values('nsprivacyaccessedapitypes/nsprivacyaccessedapitype');
const reasons = await values('nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons');

// The reasons page lists every reason in one table; each one names its API in its text.
// Boot time first: one boot time reason talks about calculating timestamps.
const CATEGORY_WORDS = [
  ['NSPrivacyAccessedAPICategorySystemBootTime', /boot time/i],
  ['NSPrivacyAccessedAPICategoryFileTimestamp', /timestamp/i],
  ['NSPrivacyAccessedAPICategoryDiskSpace', /disk space/i],
  ['NSPrivacyAccessedAPICategoryActiveKeyboards', /keyboard/i],
  ['NSPrivacyAccessedAPICategoryUserDefaults', /user defaults/i],
];
for (const r of reasons) {
  const match = CATEGORY_WORDS.find(([, re]) => re.test(r.description));
  if (!match) throw new Error(`reason ${r.id}: can't tell its API category`);
  r.category = match[0];
}

writeFileSync(
  new URL('../src/apple-privacy.json', import.meta.url),
  `${JSON.stringify({ source: 'developer.apple.com/documentation/bundleresources/app-privacy-configuration', checkedOn: new Date().toISOString().slice(0, 10), dataTypes, purposes, categories, reasons }, null, 2)}\n`,
);
console.log(`${dataTypes.length} data types, ${purposes.length} purposes, ${categories.length} API categories, ${reasons.length} reasons`);
