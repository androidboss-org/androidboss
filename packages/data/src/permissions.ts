/**
 * Android platform permissions: the system's own table (permissions.json, from
 * `pm list permissions` on an emulator plus the SDK's api-versions.xml; rebuild
 * with scripts/update-permissions.mjs) and a small curated layer: runtime
 * dialog groups, common traps and Play Console declarations.
 */
import table from './permissions.json' with { type: 'json' };

export type Level = 'normal' | 'dangerous' | 'signature' | 'internal';

export interface Permission {
  name: string;
  /** Manifest.permission constant; absent for hidden and system-only permissions. */
  constant?: string;
  since?: number;
  deprecated?: number;
  level: Level;
  /** appop, privileged, instant, preinstalled, role, … */
  flags?: string[];
  label?: string;
  description?: string;
}

export const PERMISSIONS_SOURCE: string = table.source;
export const PERMISSIONS_CHECKED_ON: string = table.checkedOn;
export const permissions = table.permissions as Permission[];

const byName = new Map(permissions.map((p) => [p.name, p]));
const byConstant = new Map(permissions.filter((p) => p.constant).map((p) => [p.constant!, p]));

/** 'CAMERA', 'Manifest.permission.CAMERA' or the full name. */
export function findPermission(input: string): Permission | undefined {
  const s = input.trim().replace(/^(android\.)?Manifest\.permission\./, '');
  return byName.get(s) ?? byConstant.get(s) ?? byName.get(`android.permission.${s}`);
}

/**
 * The runtime permission dialog groups (PermissionController). Since Android
 * 10 platform permissions are declared without groups, so this comes from the
 * documentation rather than the device.
 */
export const RUNTIME_GROUPS: Record<string, string[]> = {
  Location: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION'],
  Camera: ['CAMERA'],
  Microphone: ['RECORD_AUDIO'],
  Contacts: ['READ_CONTACTS', 'WRITE_CONTACTS', 'GET_ACCOUNTS'],
  Calendar: ['READ_CALENDAR', 'WRITE_CALENDAR'],
  Phone: ['READ_PHONE_STATE', 'READ_PHONE_NUMBERS', 'CALL_PHONE', 'ANSWER_PHONE_CALLS', 'ADD_VOICEMAIL', 'USE_SIP', 'ACCEPT_HANDOVER'],
  'Call logs': ['READ_CALL_LOG', 'WRITE_CALL_LOG', 'PROCESS_OUTGOING_CALLS'],
  SMS: ['SEND_SMS', 'RECEIVE_SMS', 'READ_SMS', 'RECEIVE_WAP_PUSH', 'RECEIVE_MMS'],
  'Files (Android 12 and lower)': ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'],
  'Photos and videos': ['READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO', 'READ_MEDIA_VISUAL_USER_SELECTED', 'ACCESS_MEDIA_LOCATION'],
  'Music and audio': ['READ_MEDIA_AUDIO'],
  'Body sensors': ['BODY_SENSORS', 'BODY_SENSORS_BACKGROUND'],
  'Physical activity': ['ACTIVITY_RECOGNITION'],
  // ACCESS_LOCAL_NETWORK: "falls under the existing NEARBY_DEVICES permission group" (Android 17 behavior changes).
  'Nearby devices': ['BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'BLUETOOTH_ADVERTISE', 'NEARBY_WIFI_DEVICES', 'UWB_RANGING', 'ACCESS_LOCAL_NETWORK'],
  Notifications: ['POST_NOTIFICATIONS'],
};

const groupOf = new Map(Object.entries(RUNTIME_GROUPS).flatMap(([g, list]) => list.map((c) => [c, g] as const)));
export const runtimeGroup = (p: Permission) => (p.constant ? groupOf.get(p.constant) : undefined);

/** Play Console asks for a declaration or limits these to specific use cases. */
export const PLAY_RESTRICTED: Record<string, string> = {
  ACCESS_BACKGROUND_LOCATION: 'Play requires a declaration and a video showing the feature that needs background location.',
  MANAGE_EXTERNAL_STORAGE: 'All files access: Play allows it only for file managers, backup and similar apps, with a declaration.',
  QUERY_ALL_PACKAGES: 'Play allows it only when seeing all installed apps is core to the app. Declare <queries> for the specific apps you talk to instead.',
  REQUEST_INSTALL_PACKAGES: 'Play allows it only for apps whose core purpose is installing packages, with a declaration.',
  USE_FULL_SCREEN_INTENT: 'From Android 14 it is granted by default only to calling and alarm apps; others need the user to allow it, and Play asks for a declaration.',
  USE_EXACT_ALARM: 'Play allows it only for alarm clock and calendar apps. Use SCHEDULE_EXACT_ALARM, or inexact alarms, otherwise.',
  READ_MEDIA_IMAGES: 'Photo and video permissions policy: only apps that need broad access to photos may use it. Use the photo picker otherwise.',
  READ_MEDIA_VIDEO: 'Photo and video permissions policy: only apps that need broad access to videos may use it. Use the photo picker otherwise.',
  READ_SMS: 'SMS permissions are limited to the default SMS app and a few exceptions, with a declaration.',
  SEND_SMS: 'SMS permissions are limited to the default SMS app and a few exceptions, with a declaration.',
  RECEIVE_SMS: 'SMS permissions are limited to the default SMS app and a few exceptions, with a declaration.',
  RECEIVE_MMS: 'SMS permissions are limited to the default SMS app and a few exceptions, with a declaration.',
  RECEIVE_WAP_PUSH: 'SMS permissions are limited to the default SMS app and a few exceptions, with a declaration.',
  READ_CALL_LOG: 'Call log permissions are limited to the default phone app and a few exceptions, with a declaration.',
  WRITE_CALL_LOG: 'Call log permissions are limited to the default phone app and a few exceptions, with a declaration.',
  PROCESS_OUTGOING_CALLS: 'Call log permissions are limited to the default phone app and a few exceptions, with a declaration.',
};

export interface Note {
  text: string;
  /** Suggested manifest attribute, such as android:maxSdkVersion="32". */
  fix?: string;
}

/** Traps worth knowing, keyed by constant. */
export const NOTES: Record<string, Note[]> = {
  POST_NOTIFICATIONS: [{ text: 'Runtime permission on Android 13+ for apps targeting API 33 or higher. Ask at a moment the user understands why, not at first launch.' }],
  ACCESS_FINE_LOCATION: [{ text: 'On Android 12+, request it together with ACCESS_COARSE_LOCATION: the user can choose approximate location only.' }],
  ACCESS_COARSE_LOCATION: [{ text: 'Enough for city-level features. On Android 12+ users can downgrade a fine location request to this.' }],
  ACCESS_BACKGROUND_LOCATION: [{ text: 'Request it separately, after foreground location is granted. On Android 11+ the user has to choose "Allow all the time" in Settings.' }],
  READ_EXTERNAL_STORAGE: [{ text: 'Has no effect for apps targeting Android 13+. Use READ_MEDIA_IMAGES/VIDEO/AUDIO or the photo picker, and limit this one to older versions.', fix: 'android:maxSdkVersion="32"' }],
  WRITE_EXTERNAL_STORAGE: [{ text: 'Has no effect on Android 11+ (scoped storage). Save to app-specific folders or through MediaStore instead.', fix: 'android:maxSdkVersion="28"' }],
  READ_MEDIA_VISUAL_USER_SELECTED: [{ text: 'Android 14+ partial access: the user picks which photos and videos the app sees. Declare it with READ_MEDIA_IMAGES/VIDEO to support "Select photos".' }],
  BLUETOOTH_SCAN: [{ text: 'Android 12+. If you don’t derive location from scan results, say so to drop the location requirement.', fix: 'android:usesPermissionFlags="neverForLocation"' }],
  NEARBY_WIFI_DEVICES: [{ text: 'Android 13+. If you don’t derive location from Wi-Fi results, say so.', fix: 'android:usesPermissionFlags="neverForLocation"' }],
  BLUETOOTH: [{ text: 'Replaced by BLUETOOTH_SCAN, BLUETOOTH_CONNECT and BLUETOOTH_ADVERTISE on Android 12+.', fix: 'android:maxSdkVersion="30"' }],
  BLUETOOTH_ADMIN: [{ text: 'Replaced by BLUETOOTH_SCAN, BLUETOOTH_CONNECT and BLUETOOTH_ADVERTISE on Android 12+.', fix: 'android:maxSdkVersion="30"' }],
  SCHEDULE_EXACT_ALARM: [{ text: 'From Android 14 it is denied by default for most new installs: check AlarmManager.canScheduleExactAlarms() and fall back to inexact alarms.' }],
  SYSTEM_ALERT_WINDOW: [{ text: 'Send the user to Settings.ACTION_MANAGE_OVERLAY_PERMISSION and check Settings.canDrawOverlays().' }],
  FOREGROUND_SERVICE: [{ text: 'Apps targeting Android 14+ also need the FOREGROUND_SERVICE_<TYPE> permission for each foregroundServiceType they use, and Play asks you to describe each type.' }],
  READ_PHONE_STATE: [{ text: 'Rarely needed. Device identifiers such as the IMEI aren’t available to normal apps on Android 10+ anyway.' }],
  INTERNET: [{ text: 'On Android 17, an app targeting API 36 that requests INTERNET was also given ACCESS_LOCAL_NETWORK automatically (granted, marked revoke-when-requested). Check the Android 17 behaviour changes before targeting API 37 if you talk to devices on the local network.' }],
  ACCESS_LOCAL_NETWORK: [{ text: 'New in Android 17 (API 37): apps targeting API 37 need it at runtime to reach devices on the local network, unless they use a system device picker. Users who already granted another Nearby devices permission aren’t asked again. Apps targeting API 36 that request INTERNET were granted it automatically on the Android 17 emulator.' }],
  GET_ACCOUNTS: [{ text: 'Since Android 8 it doesn’t give access to other apps’ accounts. Use the account picker (AccountManager.newChooseAccountIntent) instead.' }],
};

// ---------------------------------------------------------------------------
// Manifest check

export type CheckLevel = 'error' | 'warning' | 'info';

export interface UsesPermission {
  name: string;
  maxSdk?: number;
  flags?: string;
  line: number;
  permission?: Permission;
  group?: string;
  findings: { level: CheckLevel; text: string }[];
}

export function checkManifest(xml: string, targetSdk = 36): UsesPermission[] {
  const out: UsesPermission[] = [];
  const seen = new Map<string, number>();
  const lineOf = (index: number) => xml.slice(0, index).split('\n').length;
  for (const m of xml.matchAll(/<uses-permission(?:-sdk-23)?\b([^>]*)\/?>/g)) {
    const attrs = m[1]!;
    const name = attrs.match(/android:name\s*=\s*"([^"]+)"/)?.[1];
    if (!name) continue;
    const maxSdk = attrs.match(/android:maxSdkVersion\s*=\s*"(\d+)"/)?.[1];
    const flags = attrs.match(/android:usesPermissionFlags\s*=\s*"([^"]+)"/)?.[1];
    const p = findPermission(name);
    const u: UsesPermission = { name, line: lineOf(m.index!), ...(maxSdk ? { maxSdk: Number(maxSdk) } : {}), ...(flags ? { flags } : {}), permission: p, group: p ? runtimeGroup(p) : undefined, findings: [] };
    const f = u.findings;
    if (seen.has(name)) f.push({ level: 'info', text: `Also declared on line ${seen.get(name)}.` });
    seen.set(name, u.line);

    if (!p) {
      if (name.startsWith('android.permission.')) {
        const close = permissions.filter((x) => x.constant && levenshtein(x.name, name) <= 2).map((x) => x.name);
        f.push({ level: 'error', text: `Not a platform permission${close.length ? `. Did you mean ${close.join(' or ')}?` : '. Check the spelling.'}` });
      } else f.push({ level: 'info', text: 'Defined by a library or another app, not the platform.' });
      out.push(u);
      continue;
    }
    if (!p.constant) f.push({ level: 'warning', text: `A ${p.level} permission for system apps only; ordinary apps aren’t granted it.` });
    else if (p.level === 'signature' && !p.flags?.includes('appop')) f.push({ level: 'warning', text: 'Signature permission: only granted to apps signed with the platform key. Ordinary apps won’t get it.' });
    if (p.deprecated && p.deprecated <= targetSdk) f.push({ level: 'warning', text: `Deprecated in API ${p.deprecated}.` });
    if (p.level === 'dangerous') f.push({ level: 'info', text: `Runtime permission${u.group ? ` (${u.group} dialog)` : ''}: request it in code before use${p.since && p.since > 23 ? `, on API ${p.since}+` : ''}.` });
    if (p.flags?.includes('appop') && p.level !== 'dangerous') f.push({ level: 'info', text: 'Special app access: the user grants it in Settings, not in a dialog.' });
    for (const n of NOTES[p.constant ?? ''] ?? []) {
      const fixed = n.fix && attrs.includes(n.fix.split('=')[0]!);
      f.push({ level: n.fix && !fixed ? 'warning' : 'info', text: n.fix && !fixed ? `${n.text} Add ${n.fix}.` : n.text });
    }
    if (p.constant && PLAY_RESTRICTED[p.constant]) f.push({ level: 'warning', text: `Google Play: ${PLAY_RESTRICTED[p.constant]}` });
    out.push(u);
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}
