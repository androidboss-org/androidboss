/**
 * Google Play Data safety and Apple App Privacy, from one description of what an
 * app collects. Play's categories and purposes are copied from Play Console Help
 * (answer 10787469); Apple's identifiers come from Apple's documentation data via
 * scripts/update-apple-privacy.mjs. Mapping one to the other, and the SDK presets,
 * are our judgement, and the page shows it.
 */
import apple from './apple-privacy.json' with { type: 'json' };

export const PLAY_SOURCE = 'https://support.google.com/googleplay/android-developer/answer/10787469';

export type PlayPurpose = 'functionality' | 'analytics' | 'communications' | 'advertising' | 'fraud' | 'personalization' | 'account';

export const PLAY_PURPOSES: { id: PlayPurpose; name: string }[] = [
  { id: 'functionality', name: 'App functionality' },
  { id: 'analytics', name: 'Analytics' },
  { id: 'communications', name: 'Developer communications' },
  { id: 'advertising', name: 'Advertising or marketing' },
  { id: 'fraud', name: 'Fraud prevention, security, and compliance' },
  { id: 'personalization', name: 'Personalization' },
  { id: 'account', name: 'Account management' },
];

export interface PlayDataType {
  id: string;
  name: string;
  category: string;
  /** The NSPrivacyCollectedDataType it corresponds to. */
  apple: string;
}

const T = (category: string, list: [string, string, string][]): PlayDataType[] => list.map(([id, name, a]) => ({ id, name, category, apple: `NSPrivacyCollectedDataType${a}` }));

/** Play's data types in Play Console order, each with the closest Apple type. */
export const PLAY_DATA_TYPES: PlayDataType[] = [
  ...T('Location', [
    ['approximate-location', 'Approximate location', 'CoarseLocation'],
    ['precise-location', 'Precise location', 'PreciseLocation'],
  ]),
  ...T('Personal info', [
    ['name', 'Name', 'Name'],
    ['email', 'Email address', 'EmailAddress'],
    ['user-ids', 'User IDs', 'UserID'],
    ['address', 'Address', 'PhysicalAddress'],
    ['phone', 'Phone number', 'PhoneNumber'],
    ['race', 'Race and ethnicity', 'SensitiveInfo'],
    ['beliefs', 'Political or religious beliefs', 'SensitiveInfo'],
    ['orientation', 'Sexual orientation', 'SensitiveInfo'],
    ['other-personal', 'Other info', 'OtherDataTypes'],
  ]),
  ...T('Financial info', [
    ['payment', 'User payment info', 'PaymentInfo'],
    ['purchases', 'Purchase history', 'PurchaseHistory'],
    ['credit', 'Credit score', 'CreditInfo'],
    ['other-financial', 'Other financial info', 'OtherFinancialInfo'],
  ]),
  ...T('Health and fitness', [
    ['health', 'Health info', 'Health'],
    ['fitness', 'Fitness info', 'Fitness'],
  ]),
  ...T('Messages', [
    ['emails', 'Emails', 'EmailsOrTextMessages'],
    ['sms', 'SMS or MMS', 'EmailsOrTextMessages'],
    ['in-app-messages', 'Other in-app messages', 'EmailsOrTextMessages'],
  ]),
  ...T('Photos and videos', [
    ['photos', 'Photos', 'PhotosorVideos'],
    ['videos', 'Videos', 'PhotosorVideos'],
  ]),
  ...T('Audio files', [
    ['voice', 'Voice or sound recordings', 'AudioData'],
    ['music', 'Music files', 'OtherUserContent'],
    ['other-audio', 'Other audio files', 'OtherUserContent'],
  ]),
  ...T('Files and docs', [['files', 'Files and docs', 'OtherUserContent']]),
  ...T('Calendar', [['calendar', 'Calendar events', 'OtherUserContent']]),
  ...T('Contacts', [['contacts', 'Contacts', 'Contacts']]),
  ...T('App activity', [
    ['interactions', 'App interactions', 'ProductInteraction'],
    ['search', 'In-app search history', 'SearchHistory'],
    ['installed-apps', 'Installed apps', 'OtherUsageData'],
    ['user-content', 'Other user-generated content', 'OtherUserContent'],
    ['other-actions', 'Other actions', 'OtherUsageData'],
  ]),
  ...T('Web browsing', [['browsing', 'Web browsing history', 'BrowsingHistory']]),
  ...T('App info and performance', [
    ['crash-logs', 'Crash logs', 'CrashData'],
    ['diagnostics', 'Diagnostics', 'PerformanceData'],
    ['other-performance', 'Other app performance data', 'OtherDiagnosticData'],
  ]),
  ...T('Device or other IDs', [['device-ids', 'Device or other IDs', 'DeviceID']]),
];

export const PLAY_CATEGORIES = [...new Set(PLAY_DATA_TYPES.map((t) => t.category))];

/** Play purpose → Apple purpose. Advertising depends on who shows the ads. */
export function applePurpose(p: PlayPurpose, shared: boolean): string {
  const id: Record<PlayPurpose, string> = {
    functionality: 'AppFunctionality',
    analytics: 'Analytics',
    communications: 'DeveloperAdvertising',
    advertising: shared ? 'ThirdPartyAdvertising' : 'DeveloperAdvertising',
    fraud: 'AppFunctionality',
    personalization: 'ProductPersonalization',
    account: 'AppFunctionality',
  };
  return `NSPrivacyCollectedDataTypePurpose${id[p]}`;
}

export interface AppleDataType {
  id: string;
  description: string;
}

export const APPLE_PRIVACY = apple as {
  checkedOn: string;
  dataTypes: AppleDataType[];
  purposes: AppleDataType[];
  categories: AppleDataType[];
  reasons: (AppleDataType & { category: string })[];
};

/** App Store Connect groups data types under these headings on the product page. */
export const APPLE_LABEL_GROUPS: [string, string[]][] = [
  ['Contact Info', ['Name', 'EmailAddress', 'PhoneNumber', 'PhysicalAddress', 'OtherUserContactInfo']],
  ['Health & Fitness', ['Health', 'Fitness']],
  ['Financial Info', ['PaymentInfo', 'CreditInfo', 'OtherFinancialInfo']],
  ['Location', ['PreciseLocation', 'CoarseLocation']],
  ['Sensitive Info', ['SensitiveInfo']],
  ['Contacts', ['Contacts']],
  ['User Content', ['EmailsOrTextMessages', 'PhotosorVideos', 'AudioData', 'GameplayContent', 'CustomerSupport', 'OtherUserContent']],
  ['Browsing History', ['BrowsingHistory']],
  ['Search History', ['SearchHistory']],
  ['Identifiers', ['UserID', 'DeviceID']],
  ['Purchases', ['PurchaseHistory']],
  ['Usage Data', ['ProductInteraction', 'AdvertisingData', 'OtherUsageData']],
  ['Diagnostics', ['CrashData', 'PerformanceData', 'OtherDiagnosticData']],
  ['Surroundings', ['EnvironmentScanning']],
  ['Body', ['Hands', 'Head']],
  ['Other Data', ['OtherDataTypes']],
];

/** One data type an app (or one of its SDKs) collects. */
export interface Collected {
  type: string;
  purposes: PlayPurpose[];
  /** Transferred to a third party (Play's definition, after its exemptions). */
  shared: boolean;
  /** Users can choose whether to provide it. */
  optional: boolean;
  /** Apple: linked to the user's identity. */
  linked: boolean;
  /** Apple: used to track the user across other companies' apps or websites. */
  tracking: boolean;
}

export interface SdkPreset {
  id: string;
  name: string;
  /** The vendor's page this preset is based on. */
  source: string;
  /** What the vendor says, in its words, so the mapping can be checked. */
  vendorSays: string;
  collects: (Collected & { from: string })[];
  /** What to check or add, when the default doesn't cover every setup. */
  note?: string;
}

const c = (type: string, purposes: PlayPurpose[], from: string, o: Partial<Omit<Collected, 'type' | 'purposes'>> = {}): Collected & { from: string } => ({
  type,
  purposes,
  shared: false,
  optional: false,
  linked: false,
  tracking: false,
  ...o,
  from,
});

export const SDK_PRESETS: SdkPreset[] = [
  {
    id: 'firebase-analytics',
    name: 'Google Analytics for Firebase',
    source: 'https://support.google.com/analytics/answer/11582702',
    vendorSays: 'App-instance ID and Android Advertising ID; masked IP address used for coarse location; in-app purchase events; screen views and sessions. Encrypted in transit.',
    collects: [
      c('interactions', ['analytics'], 'Screen views and sessions'),
      c('device-ids', ['analytics'], 'App-instance ID and Advertising ID'),
      c('approximate-location', ['analytics'], 'Masked IP address'),
      c('purchases', ['analytics'], 'In-app purchase and subscription events'),
    ],
    note: 'Turning on Google Signals or Google Ads linking can make this sharing; check your Analytics settings.',
  },
  {
    id: 'crashlytics',
    name: 'Firebase Crashlytics',
    source: 'https://firebase.google.com/docs/android/play-data-disclosure',
    vendorSays: 'Stack traces, relevant application state and device metadata, and a Crashlytics installation UUID, for crash reporting and crash management.',
    collects: [
      c('crash-logs', ['analytics', 'functionality'], 'Stack traces'),
      c('diagnostics', ['analytics', 'functionality'], 'Application state and device metadata'),
      c('device-ids', ['analytics'], 'Crashlytics installation UUID'),
    ],
  },
  {
    id: 'fcm',
    name: 'Firebase Cloud Messaging',
    source: 'https://firebase.google.com/docs/android/play-data-disclosure',
    vendorSays: 'Application version and the Firebase installation ID (through Firebase Installations), to send messages to the app.',
    collects: [c('device-ids', ['functionality'], 'Firebase installation ID')],
  },
  {
    id: 'firebase-auth',
    name: 'Firebase Authentication',
    source: 'https://firebase.google.com/docs/android/play-data-disclosure',
    vendorSays: 'IP address and user agents always; display name, email address, phone number and user ID depending on the sign-in methods you use, for sign-in and account management.',
    collects: [
      c('user-ids', ['account', 'functionality'], 'User ID', { linked: true }),
      c('email', ['account', 'functionality'], 'Email address (email or Google sign-in)', { linked: true }),
    ],
    note: 'Add Name or Phone number if your sign-in methods collect them.',
  },
  {
    id: 'firebase-performance',
    name: 'Firebase Performance Monitoring',
    source: 'https://firebase.google.com/docs/android/play-data-disclosure',
    vendorSays: 'App start time, network latency, CPU and memory usage, device metadata and IP address, for performance reporting.',
    collects: [
      c('diagnostics', ['analytics'], 'Start time, network latency, CPU and memory'),
      c('device-ids', ['analytics'], 'Firebase installation ID'),
    ],
  },
  {
    id: 'admob',
    name: 'Google Mobile Ads (AdMob)',
    source: 'https://developers.google.com/admob/android/privacy/play-data-disclosure',
    vendorSays: 'IP address (to estimate general location), product interactions, diagnostic information, and device and account identifiers including the advertising ID, for advertising, analytics and fraud prevention. Encrypted in transit.',
    collects: [
      c('approximate-location', ['advertising', 'analytics', 'fraud'], 'IP address', { shared: true }),
      c('interactions', ['advertising', 'analytics', 'fraud'], 'App launches, taps and video views', { shared: true }),
      c('diagnostics', ['advertising', 'analytics', 'fraud'], 'Launch time, hang rate and energy use', { shared: true }),
      c('device-ids', ['advertising', 'analytics', 'fraud'], 'Advertising ID and app set ID', { shared: true }),
    ],
    note: 'Personalised ads on iOS that use the IDFA count as tracking: turn on Tracking for Device ID.',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    source: 'https://docs.sentry.io/platforms/android/data-management/data-collected/',
    vendorSays: 'Error and crash events with stack traces and device context. No user email, user ID, username or IP address by default; more personal data only with sendDefaultPii.',
    collects: [
      c('crash-logs', ['functionality', 'analytics'], 'Stack traces'),
      c('diagnostics', ['functionality', 'analytics'], 'Device context and performance data'),
    ],
    note: 'With sendDefaultPii or setUser, also declare the user data you send.',
  },
  {
    id: 'revenuecat',
    name: 'RevenueCat',
    source: 'https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety',
    vendorSays: 'Purchase history; required, not ephemeral, for app functionality and analytics. Encrypted in transit.',
    collects: [c('purchases', ['functionality', 'analytics'], 'Purchase history', { linked: true })],
  },
];

export interface AppDetails {
  appName: string;
  developer: string;
  email: string;
  website: string;
  /** Data in transit uses TLS. */
  encrypted: boolean;
  /** Users can ask for their data to be deleted. */
  deletion: boolean;
  /** Where users ask for deletion (required by Play for apps with accounts). */
  deletionUrl: string;
}

export interface MergedType extends Collected {
  def: PlayDataType;
  /** Where it comes from: "Your app", or SDK names. */
  sources: string[];
}

/** Your own answers plus every selected SDK's, merged per data type. */
export function mergeCollected(own: Collected[], sdks: SdkPreset[]): MergedType[] {
  const byType = new Map<string, MergedType>();
  const add = (x: Collected, source: string) => {
    const def = PLAY_DATA_TYPES.find((t) => t.id === x.type);
    if (!def) return;
    const prev = byType.get(x.type);
    if (!prev) {
      byType.set(x.type, { ...x, purposes: [...x.purposes], def, sources: [source] });
      return;
    }
    prev.purposes = [...new Set([...prev.purposes, ...x.purposes])];
    prev.shared ||= x.shared;
    prev.optional &&= x.optional;
    prev.linked ||= x.linked;
    prev.tracking ||= x.tracking;
    if (!prev.sources.includes(source)) prev.sources.push(source);
  };
  for (const x of own) add(x, 'Your app');
  for (const s of sdks) for (const x of s.collects) add(x, s.name);
  const order = PLAY_DATA_TYPES.map((t) => t.id);
  return [...byType.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

const purposeName = (p: PlayPurpose) => PLAY_PURPOSES.find((x) => x.id === p)!.name;
const appleName = (id: string) => id.replace('NSPrivacyCollectedDataType', '');

/** The answers to type into Play Console's Data safety form, as Markdown. */
export function playAnswers(types: MergedType[], app: AppDetails): string {
  const lines = [`# Data safety answers for ${app.appName || 'your app'}`, '', `Following Play Console’s form (${PLAY_SOURCE}).`, '', '## Data collection and security', ''];
  lines.push(`- Does your app collect or share any of the required user data types? **${types.length ? 'Yes' : 'No'}**`);
  if (types.length) {
    lines.push(`- Is all of the user data collected by your app encrypted in transit? **${app.encrypted ? 'Yes' : 'No'}**`);
    lines.push(`- Do you provide a way for users to request that their data is deleted? **${app.deletion ? 'Yes' : 'No'}**${app.deletionUrl ? ` (${app.deletionUrl})` : ''}`);
  }
  for (const cat of PLAY_CATEGORIES) {
    const inCat = types.filter((t) => t.def.category === cat);
    if (!inCat.length) continue;
    lines.push('', `## ${cat}`, '');
    for (const t of inCat) {
      lines.push(`### ${t.def.name}`, '');
      lines.push(`- Collected: **Yes**. Shared: **${t.shared ? 'Yes' : 'No'}**`);
      lines.push(`- Processed ephemerally: **No**`);
      lines.push(`- Required or optional: **${t.optional ? 'Users can choose whether this data is collected' : 'Data collection is required'}**`);
      lines.push(`- Purposes: ${t.purposes.map(purposeName).join(', ')}`);
      lines.push(`- From: ${t.sources.join(', ')}`, '');
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export interface AppleLabels {
  tracking: string[];
  linked: string[];
  notLinked: string[];
}

/** The three sections of the App Store product page's App Privacy card. */
export function appleLabels(types: MergedType[]): AppleLabels {
  const group = (ids: Set<string>) => APPLE_LABEL_GROUPS.filter(([, members]) => members.some((m) => ids.has(m))).map(([name]) => name);
  const ids = (pred: (t: MergedType) => boolean) => new Set(types.filter(pred).map((t) => appleName(t.def.apple)));
  return {
    tracking: group(ids((t) => t.tracking)),
    linked: group(ids((t) => t.linked)),
    notLinked: group(ids((t) => !t.linked)),
  };
}

export interface AccessedApi {
  category: string;
  reasons: string[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** PrivacyInfo.xcprivacy for the iOS app target. Several Play types can share one Apple type; they're merged. */
export function privacyManifest(types: MergedType[], apis: AccessedApi[], trackingDomains: string[]): string {
  const byApple = new Map<string, { linked: boolean; tracking: boolean; purposes: Set<string> }>();
  for (const t of types) {
    const e = byApple.get(t.def.apple) ?? { linked: false, tracking: false, purposes: new Set<string>() };
    e.linked ||= t.linked;
    e.tracking ||= t.tracking;
    for (const p of t.purposes) e.purposes.add(applePurpose(p, t.shared));
    byApple.set(t.def.apple, e);
  }
  const bool = (b: boolean) => (b ? '<true/>' : '<false/>');
  const tracking = [...byApple.values()].some((e) => e.tracking);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '\t<key>NSPrivacyTracking</key>',
    `\t${bool(tracking)}`,
    '\t<key>NSPrivacyTrackingDomains</key>',
    trackingDomains.length ? ['\t<array>', ...trackingDomains.map((d) => `\t\t<string>${esc(d)}</string>`), '\t</array>'].join('\n') : '\t<array/>',
    '\t<key>NSPrivacyCollectedDataTypes</key>',
  ];
  if (!byApple.size) out.push('\t<array/>');
  else {
    out.push('\t<array>');
    for (const [type, e] of byApple) {
      out.push(
        '\t\t<dict>',
        '\t\t\t<key>NSPrivacyCollectedDataType</key>',
        `\t\t\t<string>${type}</string>`,
        '\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>',
        `\t\t\t${bool(e.linked)}`,
        '\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>',
        `\t\t\t${bool(e.tracking)}`,
        '\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>',
        '\t\t\t<array>',
        ...[...e.purposes].map((p) => `\t\t\t\t<string>${p}</string>`),
        '\t\t\t</array>',
        '\t\t</dict>',
      );
    }
    out.push('\t</array>');
  }
  out.push('\t<key>NSPrivacyAccessedAPITypes</key>');
  const used = apis.filter((a) => a.reasons.length);
  if (!used.length) out.push('\t<array/>');
  else {
    out.push('\t<array>');
    for (const a of used) {
      out.push('\t\t<dict>', '\t\t\t<key>NSPrivacyAccessedAPIType</key>', `\t\t\t<string>${a.category}</string>`, '\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>', '\t\t\t<array>', ...a.reasons.map((r) => `\t\t\t\t<string>${r}</string>`), '\t\t\t</array>', '\t\t</dict>');
    }
    out.push('\t</array>');
  }
  out.push('</dict>', '</plist>', '');
  return out.join('\n');
}

/** A plain-language privacy policy draft. Not legal advice; the page says so. */
export function privacyPolicy(types: MergedType[], sdks: SdkPreset[], app: AppDetails, date: string): string {
  const name = app.appName || 'This app';
  const who = app.developer || 'We';
  const lines = [`# Privacy policy for ${name}`, '', `Last updated: ${date}`, '', `${who} ${app.developer ? 'makes' : 'make'} ${name}. This policy explains what data the app collects, why, who it’s shared with, and the choices you have.`, ''];
  if (!types.length) {
    lines.push('## Data we collect', '', `${name} doesn’t collect personal data. Everything you do in the app stays on your device.`, '');
  } else {
    lines.push('## Data we collect', '');
    for (const cat of PLAY_CATEGORIES) {
      const inCat = types.filter((t) => t.def.category === cat);
      if (!inCat.length) continue;
      lines.push(`**${cat}**`, '');
      for (const t of inCat) lines.push(`- ${t.def.name}: used for ${t.purposes.map((p) => purposeName(p).toLowerCase()).join(', ')}${t.optional ? '. Providing it is optional' : ''}.`);
      lines.push('');
    }
    const shared = types.filter((t) => t.shared);
    lines.push('## Sharing', '');
    lines.push(shared.length ? `We share ${shared.map((t) => t.def.name.toLowerCase()).join(', ')} with third parties for the purposes above.` : 'We don’t sell your data or share it with third parties. Service providers that process data on our behalf are bound to use it only for us.', '');
    if (sdks.length) {
      lines.push('## Services we use', '', 'These services process data for the app, under their own privacy policies:', '');
      for (const s of sdks) lines.push(`- ${s.name}`);
      lines.push('');
    }
    lines.push('## Security', '', app.encrypted ? 'Data sent from the app is encrypted in transit.' : 'Some data sent from the app isn’t encrypted in transit.', '');
    lines.push('## Your choices and deletion', '', app.deletion ? `You can ask us to delete your data${app.deletionUrl ? ` at ${app.deletionUrl}` : app.email ? ` by emailing ${app.email}` : ''}.` : 'Contact us with questions about your data.', '');
  }
  lines.push('## Children', '', `${name} isn’t directed at children under 13, and we don’t knowingly collect their data.`, '');
  lines.push('## Changes', '', 'We’ll update this page when the app’s data practices change, and change the date above.', '');
  lines.push('## Contact', '', app.email ? `Questions: ${app.email}${app.website ? `, or ${app.website}` : ''}.` : 'Add a contact email here.', '');
  return lines.join('\n');
}
