/**
 * iOS Info.plist privacy keys (purpose strings), from Apple's documentation
 * data (plist-keys.json; rebuild with scripts/update-plist-keys.mjs), plus a
 * mapping from Android permissions so Kotlin Multiplatform apps can see which
 * iOS keys the same features need.
 */
import table from './plist-keys.json' with { type: 'json' };

export interface PlistKey {
  key: string;
  summary: string;
  type?: string;
  platforms: { name: string; since: string; deprecated?: string | boolean }[];
  xcodeName?: string;
  url: string;
}

export const PLIST_KEYS_CHECKED_ON: string = table.checkedOn;
export const plistKeys = table.keys as PlistKey[];
const byKey = new Map(plistKeys.map((k) => [k.key, k]));
export const findPlistKey = (k: string) => byKey.get(k);

/** Availability on iOS, or undefined if the key isn't for iOS. */
export function onIos(k: PlistKey): { since: string; deprecated?: string | boolean } | undefined {
  return k.platforms.find((p) => p.name === 'iOS');
}

const major = (v: string) => Number(v.split('.')[0]);

/** iOS string keys that are current: usage descriptions an iOS app can still need. */
export const iosUsageKeys = plistKeys.filter((k) => k.type === 'string' && onIos(k) && !onIos(k)!.deprecated && /UsageDescription$/.test(k.key));

/**
 * Android permission → iOS keys for the same capability. `older` lists keys
 * still needed when the iOS deployment target is below the version given.
 */
export const ANDROID_TO_IOS: Record<string, { keys: string[]; note?: string; older?: { key: string; below: number }[] }> = {
  CAMERA: { keys: ['NSCameraUsageDescription'] },
  RECORD_AUDIO: { keys: ['NSMicrophoneUsageDescription'], note: 'Add NSSpeechRecognitionUsageDescription too if audio goes to Apple’s speech recognizer.' },
  ACCESS_FINE_LOCATION: { keys: ['NSLocationWhenInUseUsageDescription'] },
  ACCESS_COARSE_LOCATION: { keys: ['NSLocationWhenInUseUsageDescription'], note: 'For approximate location by default, also set NSLocationDefaultAccuracyReduced to true.' },
  ACCESS_BACKGROUND_LOCATION: { keys: ['NSLocationAlwaysAndWhenInUseUsageDescription', 'NSLocationWhenInUseUsageDescription'], note: 'iOS asks for when-in-use first; request always access afterwards.' },
  READ_CONTACTS: { keys: ['NSContactsUsageDescription'] },
  WRITE_CONTACTS: { keys: ['NSContactsUsageDescription'] },
  READ_CALENDAR: { keys: ['NSCalendarsFullAccessUsageDescription'], older: [{ key: 'NSCalendarsUsageDescription', below: 17 }] },
  WRITE_CALENDAR: { keys: ['NSCalendarsWriteOnlyAccessUsageDescription'], note: 'Write-only access is enough to add events; use full access only if you also read them.', older: [{ key: 'NSCalendarsUsageDescription', below: 17 }] },
  READ_MEDIA_IMAGES: { keys: ['NSPhotoLibraryUsageDescription'], note: 'Picking photos with PHPickerViewController needs no permission at all.' },
  READ_MEDIA_VIDEO: { keys: ['NSPhotoLibraryUsageDescription'], note: 'Picking videos with PHPickerViewController needs no permission at all.' },
  READ_MEDIA_VISUAL_USER_SELECTED: { keys: ['NSPhotoLibraryUsageDescription'] },
  READ_EXTERNAL_STORAGE: { keys: ['NSPhotoLibraryUsageDescription'], note: 'Only if you read photos or videos. Files the user picks need no key.' },
  WRITE_EXTERNAL_STORAGE: { keys: ['NSPhotoLibraryAddUsageDescription'], note: 'Only if you save images or videos to the photo library.' },
  READ_MEDIA_AUDIO: { keys: ['NSAppleMusicUsageDescription'], note: 'Only for the Apple Music / media library. Audio files the user picks need no key.' },
  BLUETOOTH_SCAN: { keys: ['NSBluetoothAlwaysUsageDescription'] },
  BLUETOOTH_CONNECT: { keys: ['NSBluetoothAlwaysUsageDescription'] },
  BLUETOOTH_ADVERTISE: { keys: ['NSBluetoothAlwaysUsageDescription'] },
  BLUETOOTH: { keys: ['NSBluetoothAlwaysUsageDescription'] },
  NEARBY_WIFI_DEVICES: { keys: ['NSLocalNetworkUsageDescription'] },
  ACCESS_LOCAL_NETWORK: { keys: ['NSLocalNetworkUsageDescription'], note: 'Bonjour discovery also needs the NSBonjourServices array listing the service types.' },
  ACTIVITY_RECOGNITION: { keys: ['NSMotionUsageDescription'] },
  BODY_SENSORS: { keys: ['NSHealthShareUsageDescription'], note: 'HealthKit also needs the HealthKit capability and entitlement.' },
  USE_BIOMETRIC: { keys: ['NSFaceIDUsageDescription'] },
  USE_FINGERPRINT: { keys: ['NSFaceIDUsageDescription'] },
  NFC: { keys: ['NFCReaderUsageDescription'], note: 'NFC reading also needs the Near Field Communication Tag Reading capability.' },
  POST_NOTIFICATIONS: { keys: [], note: 'iOS asks for notification permission at runtime without an Info.plist key.' },
  INTERNET: { keys: [], note: 'No key needed. App Transport Security blocks plain HTTP unless you add NSAppTransportSecurity exceptions.' },
};

export interface PlistEntry {
  key: string;
  message: string;
}

export interface PlistFinding {
  key?: string;
  level: 'error' | 'warning' | 'info';
  text: string;
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** <key>/<string> pairs to paste inside the Info.plist <dict>. */
export function plistFragment(entries: PlistEntry[]): string {
  return entries.map((e) => `<key>${e.key}</key>\n<string>${xmlEscape(e.message.trim())}</string>`).join('\n');
}

/** A complete Info.plist with only these keys, for checking with plutil. */
export function plistDocument(entries: PlistEntry[]): string {
  const body = plistFragment(entries).split('\n').map((l) => `\t${l}`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

const VAGUE = /^(we need (access|permission)|(this )?app (needs|requires|uses)( access)?( to)?|needed|required|for (the )?app|access (to|is) (required|needed))\.?$/i;

/** Problems App Review commonly rejects (guideline 5.1.1: explain why, specifically). */
export function checkEntries(entries: PlistEntry[], deploymentTarget: number): PlistFinding[] {
  const out: PlistFinding[] = [];
  const keys = new Set(entries.map((e) => e.key));
  for (const e of entries) {
    const k = byKey.get(e.key);
    const msg = e.message.trim();
    if (!k) out.push({ key: e.key, level: 'error', text: 'Not a key Apple documents.' });
    else {
      const ios = onIos(k);
      if (!ios) out.push({ key: e.key, level: 'warning', text: `Not used on iOS (${k.platforms.map((p) => p.name).join(', ')}).` });
      else if (ios.deprecated) out.push({ key: e.key, level: 'info', text: `Deprecated in iOS ${ios.deprecated}; only older iOS versions read it.` });
      else if (major(ios.since) > deploymentTarget) out.push({ key: e.key, level: 'info', text: `Read from iOS ${ios.since}; earlier versions ignore it.` });
    }
    if (!msg) out.push({ key: e.key, level: 'error', text: 'Empty purpose string. App Review rejects apps that request access without explaining why.' });
    else if (VAGUE.test(msg) || msg.length < 25) out.push({ key: e.key, level: 'warning', text: 'Too vague. Say what the app does with the data, e.g. “Used to scan receipts so you can attach them to expenses.”' });
  }
  if (keys.has('NSLocationAlwaysAndWhenInUseUsageDescription') && !keys.has('NSLocationWhenInUseUsageDescription')) out.push({ key: 'NSLocationAlwaysAndWhenInUseUsageDescription', level: 'error', text: 'Always-on location also needs NSLocationWhenInUseUsageDescription.' });
  if (deploymentTarget < 17 && (keys.has('NSCalendarsFullAccessUsageDescription') || keys.has('NSCalendarsWriteOnlyAccessUsageDescription')) && !keys.has('NSCalendarsUsageDescription'))
    out.push({ key: 'NSCalendarsUsageDescription', level: 'error', text: `Deployment target iOS ${deploymentTarget} also needs NSCalendarsUsageDescription for iOS 16 and lower.` });
  if (deploymentTarget < 17 && keys.has('NSRemindersFullAccessUsageDescription') && !keys.has('NSRemindersUsageDescription'))
    out.push({ key: 'NSRemindersUsageDescription', level: 'error', text: `Deployment target iOS ${deploymentTarget} also needs NSRemindersUsageDescription for iOS 16 and lower.` });
  return out;
}

/** iOS keys suggested by the permissions in an AndroidManifest.xml. */
export function suggestFromManifest(xml: string, deploymentTarget: number): { key: string; from: string[]; note?: string }[] {
  const perms = [...xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*android:name\s*=\s*"android\.permission\.(\w+)"/g)].map((m) => m[1]!);
  const out = new Map<string, { key: string; from: string[]; note?: string }>();
  for (const p of perms) {
    const map = ANDROID_TO_IOS[p];
    if (!map) continue;
    const keys = [...map.keys, ...(map.older ?? []).filter((o) => deploymentTarget < o.below).map((o) => o.key)];
    for (const key of keys) {
      const cur = out.get(key) ?? { key, from: [] };
      cur.from.push(p);
      if (map.note && !cur.note) cur.note = map.note;
      out.set(key, cur);
    }
  }
  return [...out.values()];
}
