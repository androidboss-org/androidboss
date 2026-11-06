#!/usr/bin/env node
/**
 * Rebuilds src/permissions.json from a running emulator or device and the SDK:
 *
 *   node scripts/update-permissions.mjs <android.jar platform dir> [pm-output.txt]
 *
 * - `adb shell pm list permissions -f -g` gives every permission the platform
 *   ("package:android") defines, with its group, label, description and
 *   protection level, as the system sees it.
 * - <platform>/data/api-versions.xml gives the API level each
 *   Manifest.permission constant was added and deprecated in.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [platformDir, pmFile] = process.argv.slice(2);
if (!platformDir) {
  console.error('Usage: update-permissions.mjs <sdk>/platforms/android-NN [pm-output.txt]');
  process.exit(1);
}

const pm = pmFile ? readFileSync(pmFile, 'utf8') : execFileSync('adb', ['shell', 'pm', 'list', 'permissions', '-f', '-g'], { encoding: 'utf8' });
const sdk = pmFile && process.env.SDK_INT ? Number(process.env.SDK_INT) : Number(execFileSync('adb', ['shell', 'getprop', 'ro.build.version.sdk'], { encoding: 'utf8' }).trim());
const release = pmFile && process.env.RELEASE ? process.env.RELEASE : execFileSync('adb', ['shell', 'getprop', 'ro.build.version.release'], { encoding: 'utf8' }).trim();

// --- pm output -------------------------------------------------------------
const permissions = [];
let group = null;
let current = null;
for (const raw of pm.split('\n')) {
  const line = raw.trimEnd();
  const g = line.match(/^\+ group:(.+)$/);
  if (g) {
    group = g[1];
    // The group's own label and description follow; they aren't a permission's.
    current = null;
    continue;
  }
  if (/^\+ ungrouped:$/.test(line.trim())) {
    group = null;
    current = null;
    continue;
  }
  const p = line.match(/^\s*\+ permission:(.+)$/);
  if (p) {
    current = { name: p[1], group };
    permissions.push(current);
    continue;
  }
  const kv = line.match(/^\s+(package|label|description|protectionLevel):(.*)$/);
  if (kv && current) current[kv[1]] = kv[2].trim();
}

// --- api-versions.xml ------------------------------------------------------
const xml = readFileSync(join(platformDir, 'data', 'api-versions.xml'), 'utf8');
const cls = xml.match(/<class name="android\/Manifest\$permission"[^>]*>([\s\S]*?)<\/class>/)[1];
const api = new Map(
  [...cls.matchAll(/<field name="(\w+)"([^>]*)\/>/g)].map((m) => [
    m[1],
    { since: Number(m[2].match(/since="([\d.]+)"/)?.[1] ?? 1), deprecated: m[2].match(/deprecated="([\d.]+)"/)?.[1] ? Number(m[2].match(/deprecated="([\d.]+)"/)[1]) : undefined },
  ]),
);

// Constants whose value isn't android.permission.<CONSTANT>.
const VALUE_TO_CONSTANT = {
  'com.android.voicemail.permission.ADD_VOICEMAIL': 'ADD_VOICEMAIL',
  'com.android.voicemail.permission.READ_VOICEMAIL': 'READ_VOICEMAIL',
  'com.android.voicemail.permission.WRITE_VOICEMAIL': 'WRITE_VOICEMAIL',
  'com.android.alarm.permission.SET_ALARM': 'SET_ALARM',
  'com.android.launcher.permission.INSTALL_SHORTCUT': 'INSTALL_SHORTCUT',
  'com.android.launcher.permission.UNINSTALL_SHORTCUT': 'UNINSTALL_SHORTCUT',
};

const out = permissions
  .filter((p) => p.package === 'android')
  .map((p) => {
    const constant = VALUE_TO_CONSTANT[p.name] ?? (p.name.startsWith('android.permission.') ? p.name.slice('android.permission.'.length) : undefined);
    const a = constant ? api.get(constant) : undefined;
    const [base, ...flags] = (p.protectionLevel ?? 'normal').split('|');
    return {
      name: p.name,
      // Only public SDK constants have one; the rest are hidden or system-only.
      ...(a ? { constant, since: a.since, ...(a.deprecated ? { deprecated: a.deprecated } : {}) } : {}),
      level: base,
      ...(flags.length ? { flags } : {}),
      ...(p.group && p.group !== 'android.permission-group.UNDEFINED' ? { group: p.group.replace('android.permission-group.', '') } : {}),
      // Text only for public permissions: the rest exist so manifests can be checked against them.
      ...(a && p.label && p.label !== 'null' ? { label: p.label } : {}),
      ...(a && p.description && p.description !== 'null' ? { description: p.description } : {}),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const data = { source: `pm list permissions on Android ${release} (API ${sdk}); api-versions.xml from ${platformDir.split('/').pop()}`, checkedOn: new Date().toISOString().slice(0, 10), permissions: out };
writeFileSync(new URL('../src/permissions.json', import.meta.url), `${JSON.stringify(data)}\n`);
console.log(`${out.length} platform permissions, ${out.filter((p) => p.constant).length} public`);
