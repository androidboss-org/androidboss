#!/usr/bin/env node
/**
 * Rebuilds src/plist-keys.json from Apple's documentation data for
 * "Protected resources" (bundleresources): every Info.plist privacy key with
 * its summary, value type and platform availability.
 *
 *   node scripts/update-plist-keys.mjs
 */
import { writeFileSync } from 'node:fs';

const BASE = 'https://developer.apple.com/tutorials/data';
const index = await (await fetch(`${BASE}/documentation/bundleresources/protected-resources.json`)).json();

const keys = Object.values(index.references).filter((r) => /^(NS|NFC|OS)\w+$/.test(r.title ?? '') && r.url?.startsWith('/documentation/bundleresources/information-property-list/'));

const text = (parts) => (parts ?? []).map((p) => p.text ?? (p.code ? p.code : '')).join('');

const out = [];
for (const ref of keys) {
  const page = await (await fetch(`${BASE}${ref.url}.json`)).json();
  const platforms = (page.metadata?.platforms ?? []).map((p) => ({
    name: p.name,
    since: p.introducedAt,
    ...(p.deprecated || p.deprecatedAt ? { deprecated: p.deprecatedAt ?? true } : {}),
  }));
  const details = (page.primaryContentSections ?? []).find((sec) => sec.kind === 'details')?.details;
  const type = details?.value?.[0]?.baseType?.trim();
  out.push({
    key: ref.title,
    summary: text(page.abstract ?? ref.abstract),
    ...(type ? { type } : {}),
    platforms,
    // The name Xcode shows in its Info.plist editor.
    ...(details?.ideTitle ? { xcodeName: details.ideTitle } : {}),
    url: `https://developer.apple.com${ref.url}`,
  });
}
out.sort((a, b) => a.key.localeCompare(b.key));
writeFileSync(new URL('../src/plist-keys.json', import.meta.url), `${JSON.stringify({ source: 'developer.apple.com/documentation/bundleresources/protected-resources', checkedOn: new Date().toISOString().slice(0, 10), keys: out }, null, 1)}\n`);
console.log(`${out.length} keys`);
