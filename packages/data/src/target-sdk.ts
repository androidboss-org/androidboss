/**
 * What changes when an app raises targetSdkVersion, from the official
 * "Behavior changes: apps targeting Android N" pages (Android 12 to 17) and
 * Google Play's target API requirements. Summaries are ours; every item links
 * to its source section. Checked 2026-11-03.
 *
 * Items with a `detect` function can be checked against a pasted
 * AndroidManifest.xml; the rest need a look at the code.
 */

export const TARGET_SDK_CHECKED_ON = '2026-11-03';

export const PLAY_REQUIREMENT = {
  date: '2026-08-31',
  newAndUpdates: 36,
  existing: 35,
  wearAutomotive: 35,
  tvXr: 34,
  extensionUntil: '2026-11-01',
  source: 'https://developer.android.com/google/play/requirements/target-sdk',
};

export const VERSION_NAMES: Record<number, string> = { 31: 'Android 12', 32: 'Android 12L', 33: 'Android 13', 34: 'Android 14', 35: 'Android 15', 36: 'Android 16', 37: 'Android 17' };

const PAGE: Record<number, string> = {
  31: 'https://developer.android.com/about/versions/12/behavior-changes-12',
  33: 'https://developer.android.com/about/versions/13/behavior-changes-13',
  34: 'https://developer.android.com/about/versions/14/behavior-changes-14',
  35: 'https://developer.android.com/about/versions/15/behavior-changes-15',
  36: 'https://developer.android.com/about/versions/16/behavior-changes-16',
  37: 'https://developer.android.com/about/versions/17/behavior-changes-17',
};
export const behaviorPage = (api: number) => PAGE[api];

export type Area = 'UI' | 'Background work' | 'Permissions & privacy' | 'Security' | 'Intents & components' | 'Media' | 'Connectivity' | 'Runtime';

/** A manifest, parsed just enough for the detectors. */
export interface ManifestFacts {
  text: string;
  permissions: Set<string>;
  /** Components with an intent filter but no android:exported. */
  unexported: string[];
  services: { name: string; types: string[]; tag: string }[];
  receivers: { name: string; actions: string[] }[];
  activities: { name: string; tag: string }[];
}

export interface Hit {
  /** Why this item applies to the pasted manifest. */
  reason: string;
  severity: 'must' | 'check';
}

export interface ChangeItem {
  id: string;
  api: number;
  area: Area;
  title: string;
  summary: string;
  action: string;
  /** Section anchor on the behavior changes page, or a full URL. */
  link: string;
  /** Returns why the change applies, or null if the manifest shows no sign of it. */
  detect?: (m: ManifestFacts) => Hit | null;
}

const has = (m: ManifestFacts, p: string) => m.permissions.has(p.includes('.') ? p : `android.permission.${p}`);
const servicesOfType = (m: ManifestFacts, type: string) => m.services.filter((s) => s.types.includes(type));
const receiversFor = (m: ManifestFacts, action: string) => m.receivers.filter((r) => r.actions.includes(action));
const names = (list: { name: string }[]) => list.map((x) => x.name).join(', ');

export const changes: readonly ChangeItem[] = [
  // ---------------------------------------------------------------- Android 12
  {
    id: 'exported', api: 31, area: 'Intents & components', title: 'Declare android:exported on components with intent filters',
    summary: 'Activities, services and receivers that have an intent filter must say explicitly whether other apps can start them. Without it the app fails to build or install.',
    action: 'Set android:exported="true" on the launcher activity and anything other apps start; "false" everywhere else.',
    link: '#exported',
    detect: (m) => (m.unexported.length ? { severity: 'must', reason: `No android:exported on ${m.unexported.join(', ')}.` } : null),
  },
  {
    id: 'pending-intent-mutability', api: 31, area: 'Intents & components', title: 'Specify PendingIntent mutability',
    summary: 'Every PendingIntent needs FLAG_IMMUTABLE or FLAG_MUTABLE, or creating it throws.',
    action: 'Use FLAG_IMMUTABLE unless something must fill in the intent (inline replies, bubbles). Lint reports UnspecifiedImmutableFlag.',
    link: '#pending-intent-mutability',
  },
  {
    id: 'fgs-background-start', api: 31, area: 'Background work', title: 'No starting foreground services from the background',
    summary: 'Starting a foreground service while the app is in the background throws, apart from a few exemptions.',
    action: 'Use WorkManager expedited work, or start the service while the app is visible.',
    link: '#foreground-service-launch-restrictions',
    detect: (m) => (m.services.some((s) => s.types.length) || has(m, 'FOREGROUND_SERVICE') ? { severity: 'check', reason: 'The app declares foreground services.' } : null),
  },
  {
    id: 'exact-alarm', api: 31, area: 'Background work', title: 'Exact alarms need the "Alarms & reminders" access',
    summary: 'setExact and similar calls need SCHEDULE_EXACT_ALARM, which the user can turn off in Settings.',
    action: 'Declare SCHEDULE_EXACT_ALARM, check AlarmManager.canScheduleExactAlarms() and fall back to inexact alarms.',
    link: '#exact-alarm-permission',
    detect: (m) => (has(m, 'SCHEDULE_EXACT_ALARM') || has(m, 'USE_EXACT_ALARM') ? { severity: 'check', reason: 'The app uses exact alarms.' } : null),
  },
  {
    id: 'notification-trampolines', api: 31, area: 'Background work', title: 'No activity starts from notification trampolines',
    summary: 'A service or broadcast receiver started from a notification tap can no longer start an activity.',
    action: 'Point the notification’s content intent straight at the activity with a PendingIntent.',
    link: '#notification-trampolines',
  },
  {
    id: 'bluetooth-permissions', api: 31, area: 'Permissions & privacy', title: 'New Bluetooth permissions',
    summary: 'BLUETOOTH_SCAN, BLUETOOTH_CONNECT and BLUETOOTH_ADVERTISE replace BLUETOOTH, BLUETOOTH_ADMIN and the location requirement for scans.',
    action: 'Declare the new permissions, request them at runtime, and limit the old ones with android:maxSdkVersion="30".',
    link: '#bluetooth-permissions',
    detect: (m) => (has(m, 'BLUETOOTH') || has(m, 'BLUETOOTH_ADMIN') ? { severity: has(m, 'BLUETOOTH_CONNECT') || has(m, 'BLUETOOTH_SCAN') ? 'check' : 'must', reason: 'The app declares the legacy BLUETOOTH or BLUETOOTH_ADMIN permission.' } : null),
  },
  {
    id: 'approximate-location', api: 31, area: 'Permissions & privacy', title: 'Users can grant approximate location only',
    summary: 'The location dialog lets users pick approximate instead of precise.',
    action: 'Request ACCESS_COARSE_LOCATION together with ACCESS_FINE_LOCATION and handle getting only coarse.',
    link: '#approximate-location',
    detect: (m) => (has(m, 'ACCESS_FINE_LOCATION') ? { severity: has(m, 'ACCESS_COARSE_LOCATION') ? 'check' : 'must', reason: has(m, 'ACCESS_COARSE_LOCATION') ? 'The app requests precise location.' : 'ACCESS_FINE_LOCATION is declared without ACCESS_COARSE_LOCATION.' } : null),
  },
  {
    id: 'app-links-12', api: 31, area: 'Intents & components', title: 'App Links verification changes',
    summary: 'Verified link filters must include the BROWSABLE category and the https scheme.',
    action: 'Check every android:autoVerify filter, then re-verify with adb shell pm verify-app-links --re-verify.',
    link: '#android-app-links-verification-changes',
    detect: (m) => (/android:autoVerify\s*=\s*"true"/.test(m.text) ? { severity: 'check', reason: 'The app has verified App Link filters.' } : null),
  },
  {
    id: 'custom-notifications', api: 31, area: 'UI', title: 'Custom notifications get the standard template',
    summary: 'Notifications with custom content views no longer use the whole area; the collapsed height drops to 48dp.',
    action: 'Test every notification built with setCustomContentView and provide an expanded layout.',
    link: '#custom-notifications',
  },
  {
    id: 'backup-rules', api: 31, area: 'Permissions & privacy', title: 'New backup and device-transfer rules format',
    summary: 'fullBackupContent rules don’t apply to device-to-device transfers on Android 12+; a new data extraction rules file separates cloud backup and transfer.',
    action: 'Add android:dataExtractionRules pointing to a <data-extraction-rules> file, and keep the old file for Android 11 and lower.',
    link: '#backup-restore',
    detect: (m) => (/android:fullBackupContent\s*=/.test(m.text) && !/android:dataExtractionRules\s*=/.test(m.text) ? { severity: 'must', reason: 'android:fullBackupContent is set without android:dataExtractionRules.' } : null),
  },
  {
    id: 'hibernation', api: 31, area: 'Background work', title: 'App hibernation',
    summary: 'After a few months without use, the app’s permissions are reset and it stops running jobs and alarms.',
    action: 'If the app works mostly in the background, ask users to exempt it from hibernation.',
    link: '#app-hibernation',
  },
  {
    id: 'samesite-cookies', api: 31, area: 'Security', title: 'Modern SameSite cookies in WebView',
    summary: 'Cookies without SameSite are treated as Lax, and SameSite=None needs Secure.',
    action: 'Test sign-in and payment flows that run in a WebView.',
    link: '#samesite',
    detect: (m) => (/WebView|webkit/.test(m.text) ? { severity: 'check', reason: 'The manifest mentions WebView.' } : null),
  },
  {
    id: 'native-vendor-libs', api: 31, area: 'Runtime', title: 'Vendor native libraries need <uses-native-library>',
    summary: 'Non-NDK native libraries from the device vendor aren’t accessible unless the manifest asks for them.',
    action: 'Declare each vendor library with <uses-native-library>.',
    link: '#vendor-libraries',
  },
  // ---------------------------------------------------------------- Android 13
  {
    id: 'notification-permission', api: 33, area: 'Permissions & privacy', title: 'Notification runtime permission',
    summary: 'Apps targeting Android 13 must request POST_NOTIFICATIONS before posting; denied notifications are silently dropped.',
    action: 'Declare POST_NOTIFICATIONS and ask at a moment the user understands why.',
    link: 'https://developer.android.com/develop/ui/views/notifications/notification-permission',
    detect: (m) => (has(m, 'POST_NOTIFICATIONS') ? { severity: 'check', reason: 'POST_NOTIFICATIONS is declared: make sure it’s requested at runtime.' } : null),
  },
  {
    id: 'granular-media', api: 33, area: 'Permissions & privacy', title: 'Granular media permissions',
    summary: 'READ_EXTERNAL_STORAGE no longer gives access to other apps’ media; use READ_MEDIA_IMAGES, READ_MEDIA_VIDEO or READ_MEDIA_AUDIO.',
    action: 'Switch to the READ_MEDIA_* permissions or the photo picker, and add android:maxSdkVersion="32" to READ_EXTERNAL_STORAGE.',
    link: '#granular-media-permissions',
    detect: (m) => (has(m, 'READ_EXTERNAL_STORAGE') && !/READ_EXTERNAL_STORAGE"[^>]*maxSdkVersion/.test(m.text) ? { severity: 'must', reason: 'READ_EXTERNAL_STORAGE is declared without maxSdkVersion.' } : null),
  },
  {
    id: 'nearby-wifi', api: 33, area: 'Permissions & privacy', title: 'NEARBY_WIFI_DEVICES for Wi-Fi APIs',
    summary: 'Wi-Fi features such as Wi-Fi Direct, local-only hotspots and connecting to a known SSID use NEARBY_WIFI_DEVICES instead of fine location.',
    action: 'Declare NEARBY_WIFI_DEVICES with android:usesPermissionFlags="neverForLocation" if you don’t derive location.',
    link: '#nearby-wifi-devices-permission',
    detect: (m) => (has(m, 'CHANGE_WIFI_STATE') || has(m, 'ACCESS_WIFI_STATE') ? { severity: 'check', reason: 'The app uses Wi-Fi state permissions.' } : null),
  },
  {
    id: 'body-sensors-background', api: 33, area: 'Permissions & privacy', title: 'Background body sensor access needs a new permission',
    summary: 'Reading body sensors in the background needs BODY_SENSORS_BACKGROUND in addition to BODY_SENSORS.',
    action: 'Declare and request BODY_SENSORS_BACKGROUND if you read sensors in the background.',
    link: '#body-sensors-background-permission',
    detect: (m) => (has(m, 'BODY_SENSORS') ? { severity: 'check', reason: 'The app uses body sensors.' } : null),
  },
  {
    id: 'battery-restricted-boot', api: 33, area: 'Background work', title: 'No BOOT_COMPLETED for battery-restricted apps',
    summary: 'If the user restricts the app’s battery use, it no longer receives BOOT_COMPLETED until it is opened.',
    action: 'Don’t rely on boot broadcasts for important work; reschedule when the app starts.',
    link: '#battery-resource-utilization',
    detect: (m) => (receiversFor(m, 'android.intent.action.BOOT_COMPLETED').length ? { severity: 'check', reason: `Boot receiver: ${names(receiversFor(m, 'android.intent.action.BOOT_COMPLETED'))}.` } : null),
  },
  {
    id: 'ad-id', api: 33, area: 'Permissions & privacy', title: 'AD_ID permission for the advertising ID',
    summary: 'Without com.google.android.gms.permission.AD_ID the advertising ID becomes zeros.',
    action: 'Declare the permission if you or an SDK use the advertising ID (SDKs often merge it in already).',
    link: '#ad-id',
  },
  {
    id: 'media-controls', api: 33, area: 'Media', title: 'Media controls come from PlaybackState',
    summary: 'System media controls are built from the session’s PlaybackState actions, not the notification’s action list.',
    action: 'Set the right PlaybackState actions and custom actions on your MediaSession.',
    link: '#playback-controls',
    detect: (m) => (servicesOfType(m, 'mediaPlayback').length ? { severity: 'check', reason: 'The app has a media playback service.' } : null),
  },
  {
    id: 'webview-force-dark', api: 33, area: 'UI', title: 'WebView follows the app theme',
    summary: 'setForceDark does nothing; WebView sets prefers-color-scheme from the app’s isLightTheme.',
    action: 'Use setAlgorithmicDarkeningAllowed instead and test web content in dark theme.',
    link: '#webview-color-theme',
  },
  {
    id: 'bluetooth-enable', api: 33, area: 'Connectivity', title: 'BluetoothAdapter enable() and disable() return false',
    summary: 'Ordinary apps can no longer switch Bluetooth on or off.',
    action: 'Ask the user with ACTION_REQUEST_ENABLE instead.',
    link: '#bluetooth-adapter',
  },
  // ---------------------------------------------------------------- Android 14
  {
    id: 'fgs-types', api: 34, area: 'Background work', title: 'Foreground service types are required',
    summary: 'Every foreground service must declare a foregroundServiceType and the matching FOREGROUND_SERVICE_<TYPE> permission.',
    action: 'Add android:foregroundServiceType to each service and declare its permission; describe the types in Play Console.',
    link: '#fgs-types',
    detect: (m) => {
      const missing = m.services.filter((s) => !s.types.length && /foreground/i.test(s.name));
      if (missing.length) return { severity: 'must', reason: `No foregroundServiceType on ${names(missing)}.` };
      const typed = m.services.filter((s) => s.types.length);
      return typed.length ? { severity: 'check', reason: `Typed services: ${typed.map((s) => `${s.name} (${s.types.join(', ')})`).join('; ')}. Check each type’s FOREGROUND_SERVICE_ permission.` } : has(m, 'FOREGROUND_SERVICE') ? { severity: 'must', reason: 'FOREGROUND_SERVICE is declared but no service has a foregroundServiceType.' } : null;
    },
  },
  {
    id: 'runtime-receivers', api: 34, area: 'Intents & components', title: 'Runtime-registered receivers must say whether they’re exported',
    summary: 'registerReceiver for non-system broadcasts needs RECEIVER_EXPORTED or RECEIVER_NOT_EXPORTED.',
    action: 'Use ContextCompat.registerReceiver with the right flag.',
    link: '#runtime-receivers-exported',
  },
  {
    id: 'implicit-intents', api: 34, area: 'Intents & components', title: 'Implicit intents only reach exported components',
    summary: 'An implicit intent no longer reaches your own non-exported components, and mutable PendingIntents need an explicit target.',
    action: 'Set the package or component on intents meant for your own app.',
    link: '#safer-intents',
    detect: (m) => (/android:exported\s*=\s*"false"[^>]*>\s*<intent-filter/.test(m.text.replace(/\n/g, ' ')) ? { severity: 'check', reason: 'Some non-exported components have intent filters: start them with explicit intents.' } : null),
  },
  {
    id: 'full-screen-intent', api: 34, area: 'Permissions & privacy', title: 'Full-screen intents limited to calls and alarms',
    summary: 'USE_FULL_SCREEN_INTENT is only granted by default to calling and alarm apps.',
    action: 'Check NotificationManager.canUseFullScreenIntent() and send other users to the settings page.',
    link: '#secure-fsi',
    detect: (m) => (has(m, 'USE_FULL_SCREEN_INTENT') ? { severity: 'must', reason: 'USE_FULL_SCREEN_INTENT is declared.' } : null),
  },
  {
    id: 'partial-photo-access', api: 34, area: 'Permissions & privacy', title: 'Partial photo and video access',
    summary: 'Users can grant access to selected photos and videos only.',
    action: 'Use the photo picker, or handle READ_MEDIA_VISUAL_USER_SELECTED in your own gallery.',
    link: '#partial-photo-library-access',
    detect: (m) => (has(m, 'READ_MEDIA_IMAGES') || has(m, 'READ_MEDIA_VIDEO') ? { severity: 'check', reason: 'The app reads photos or videos.' } : null),
  },
  {
    id: 'background-activity-14', api: 34, area: 'Security', title: 'More restrictions on starting activities from the background',
    summary: 'Sending a PendingIntent or binding a service no longer passes on your background-start privilege unless you opt in.',
    action: 'Opt in with ActivityOptions or BIND_ALLOW_ACTIVITY_STARTS only where needed.',
    link: '#background-activity-restrictions',
  },
  {
    id: 'dynamic-code-14', api: 34, area: 'Security', title: 'Dynamically loaded code must be read-only',
    summary: 'DEX, JAR and APK files loaded at runtime must be marked read-only, or loading throws.',
    action: 'Call setReadOnly() before writing the file, or stop loading code dynamically.',
    link: '#safer-dynamic-code-loading',
  },
  {
    id: 'zip-traversal', api: 34, area: 'Security', title: 'Zip path traversal blocked',
    summary: 'ZipFile and ZipInputStream throw for entries containing ".." or starting with "/".',
    action: 'Make sure archives you read don’t use such paths.',
    link: '#zip-path-traversal',
  },
  {
    id: 'media-projection-consent', api: 34, area: 'Media', title: 'User consent for each screen capture session',
    summary: 'Each MediaProjection can be used for one capture session, with consent each time.',
    action: 'Don’t cache the capture intent; register a MediaProjection.Callback.',
    link: '#media-projection-consent',
    detect: (m) => (servicesOfType(m, 'mediaProjection').length ? { severity: 'must', reason: 'The app has a mediaProjection service.' } : null),
  },
  {
    id: 'jobscheduler-14', api: 34, area: 'Background work', title: 'JobScheduler callbacks and network permission',
    summary: 'Slow onStartJob/onStopJob now cause ANRs, and network constraints need ACCESS_NETWORK_STATE.',
    action: 'Keep job callbacks fast (WorkManager does this) and declare ACCESS_NETWORK_STATE.',
    link: '#jobscheduler-reinforces-behavior',
    detect: (m) => (!has(m, 'ACCESS_NETWORK_STATE') && has(m, 'INTERNET') ? { severity: 'check', reason: 'INTERNET is declared without ACCESS_NETWORK_STATE: needed if jobs use network constraints.' } : null),
  },
  {
    id: 'tiles-launch', api: 34, area: 'UI', title: 'Quick Settings tiles launch with a PendingIntent',
    summary: 'TileService.startActivityAndCollapse(Intent) throws; use the PendingIntent overload.',
    action: 'Switch to startActivityAndCollapse(PendingIntent).',
    link: '#tiles-launch-api',
    detect: (m) => (/BIND_QUICK_SETTINGS_TILE/.test(m.text) ? { severity: 'must', reason: 'The app has a Quick Settings tile.' } : null),
  },
  {
    id: 'bluetooth-connect-enforced', api: 34, area: 'Connectivity', title: 'BLUETOOTH_CONNECT enforced for getProfileConnectionState',
    summary: 'BluetoothAdapter.getProfileConnectionState needs BLUETOOTH_CONNECT.',
    action: 'Declare and check BLUETOOTH_CONNECT before calling it.',
    link: '#enforce-bluetooth_connect',
  },
  // ---------------------------------------------------------------- Android 15
  {
    id: 'edge-to-edge-15', api: 35, area: 'UI', title: 'Edge-to-edge is enforced',
    summary: 'Content draws behind the status and navigation bars; status bar colour APIs have no effect.',
    action: 'Apply window insets (Material 3 components and Scaffold do most of it) and check every screen, including rarely visited ones.',
    link: '#edge-to-edge',
    detect: (m) => (m.activities.length ? { severity: 'must', reason: `${m.activities.length} activit${m.activities.length === 1 ? 'y' : 'ies'} will draw edge to edge.` } : null),
  },
  {
    id: 'datasync-timeout', api: 35, area: 'Background work', title: 'dataSync and mediaProcessing services time out after 6 hours',
    summary: 'These foreground service types get 6 hours per 24 hours, then onTimeout is called.',
    action: 'Implement Service.onTimeout and stop the service there, or move the work to WorkManager or user-initiated data transfer jobs.',
    link: '#datasync-timeout',
    detect: (m) => {
      const s = [...servicesOfType(m, 'dataSync'), ...servicesOfType(m, 'mediaProcessing')];
      return s.length ? { severity: 'must', reason: `Affected services: ${names(s)}.` } : null;
    },
  },
  {
    id: 'boot-completed-fgs', api: 35, area: 'Background work', title: 'BOOT_COMPLETED can’t start some foreground service types',
    summary: 'Boot receivers can’t start dataSync, camera, mediaPlayback, phoneCall, mediaProjection or microphone services.',
    action: 'Defer that work until the user opens the app, or use WorkManager.',
    link: '#fgs-boot-completed',
    detect: (m) => {
      const banned = ['dataSync', 'camera', 'mediaPlayback', 'phoneCall', 'mediaProjection', 'microphone'];
      const s = m.services.filter((x) => x.types.some((t) => banned.includes(t)));
      return receiversFor(m, 'android.intent.action.BOOT_COMPLETED').length && s.length ? { severity: 'check', reason: `A boot receiver and services of restricted types (${names(s)}).` } : null;
    },
  },
  {
    id: 'saw-fgs', api: 35, area: 'Background work', title: 'SYSTEM_ALERT_WINDOW needs a visible overlay to start services',
    summary: 'The overlay permission alone no longer lets the app start foreground services from the background.',
    action: 'Show the overlay window before starting the service.',
    link: '#fgs-sysalert',
    detect: (m) => (has(m, 'SYSTEM_ALERT_WINDOW') && m.services.some((s) => s.types.length) ? { severity: 'check', reason: 'The app has the overlay permission and foreground services.' } : null),
  },
  {
    id: 'dnd-global', api: 35, area: 'Permissions & privacy', title: 'Apps can’t change global Do Not Disturb',
    summary: 'setInterruptionFilter and setNotificationPolicy create an AutomaticZenRule instead of changing the global state.',
    action: 'Contribute an AutomaticZenRule.',
    link: '#dnd-changes',
    detect: (m) => (has(m, 'ACCESS_NOTIFICATION_POLICY') ? { severity: 'must', reason: 'ACCESS_NOTIFICATION_POLICY is declared.' } : null),
  },
  {
    id: 'openjdk-15', api: 35, area: 'Runtime', title: 'Stricter String.format and other OpenJDK changes',
    summary: 'Format strings are validated more strictly (%0 throws), Arrays.asList().toArray() returns Object[], and iw/ji/in locale codes are no longer converted.',
    action: 'Run the app’s formatting and locale code; with compileSdk 35, replace removeFirst()/removeLast() on lists when minSdk is below 35.',
    link: '#openjdk-api-changes',
  },
  {
    id: 'tls-10-11', api: 35, area: 'Security', title: 'TLS 1.0 and 1.1 disallowed',
    summary: 'Connections that need TLS 1.0 or 1.1 fail.',
    action: 'Make sure every server you talk to supports TLS 1.2 or newer.',
    link: '#restricted-tls-versions',
  },
  {
    id: 'audio-focus-15', api: 35, area: 'Media', title: 'Audio focus only for the top app or a foreground service',
    summary: 'requestAudioFocus fails from the background unless a foreground service is running.',
    action: 'Request focus while visible or from your playback service.',
    link: '#audio-focus',
    detect: (m) => (servicesOfType(m, 'mediaPlayback').length ? { severity: 'check', reason: 'The app plays media.' } : null),
  },
  {
    id: 'stable-configuration', api: 35, area: 'UI', title: 'Configuration sizes include the system bars',
    summary: 'Configuration.screenWidthDp and screenHeightDp no longer exclude the system bars.',
    action: 'Use WindowInsets or WindowMetrics for layout, not Configuration sizes.',
    link: '#stable-configuration',
  },
  {
    id: 'elegant-text-15', api: 35, area: 'UI', title: 'elegantTextHeight defaults to true',
    summary: 'Scripts such as Arabic, Thai and Tamil use the taller, more readable font.',
    action: 'Check layouts in those languages.',
    link: '#elegant-text-height',
  },
  // ---------------------------------------------------------------- Android 16
  {
    id: 'edge-to-edge-16', api: 36, area: 'UI', title: 'The edge-to-edge opt-out is gone',
    summary: 'windowOptOutEdgeToEdgeEnforcement is ignored on Android 16.',
    action: 'Remove the opt-out from your themes and handle insets everywhere.',
    link: '#edge-to-edge',
  },
  {
    id: 'predictive-back', api: 36, area: 'UI', title: 'Predictive back is on: onBackPressed isn’t called',
    summary: 'Back-to-home, cross-task and cross-activity animations are enabled, onBackPressed isn’t called and KEYCODE_BACK isn’t dispatched.',
    action: 'Move back handling to OnBackPressedCallback or BackHandler; android:enableOnBackInvokedCallback="false" opts out temporarily.',
    link: '#predictive-back',
    detect: (m) => (/enableOnBackInvokedCallback\s*=\s*"false"/.test(m.text) ? { severity: 'must', reason: 'Predictive back is switched off with enableOnBackInvokedCallback="false": a temporary opt-out.' } : m.activities.length ? { severity: 'check', reason: 'Check any custom back handling.' } : null),
  },
  {
    id: 'large-screen-restrictions', api: 36, area: 'UI', title: 'Orientation and resizability locks ignored on large screens',
    summary: 'On screens at least 600dp wide, screenOrientation, resizeableActivity="false" and min/max aspect ratio are ignored (games excepted).',
    action: 'Make layouts adapt to any size and orientation, and save UI state across recreation.',
    link: '#ignore-orientation',
    detect: (m) => {
      const locked = m.activities.filter((a) => /screenOrientation\s*=\s*"(portrait|landscape|sensorPortrait|sensorLandscape|userPortrait|userLandscape|reversePortrait|reverseLandscape)"|resizeableActivity\s*=\s*"false"|(min|max)AspectRatio/.test(a.tag));
      return locked.length ? { severity: 'must', reason: `Locked orientation or size on ${names(locked)}.` } : null;
    },
  },
  {
    id: 'health-permissions', api: 36, area: 'Permissions & privacy', title: 'Body sensor permissions become health permissions',
    summary: 'Heart rate and similar APIs need android.permission.health.* permissions instead of BODY_SENSORS.',
    action: 'Request READ_HEART_RATE and READ_HEALTH_DATA_IN_BACKGROUND, and declare a privacy policy activity.',
    link: '#health-fitness-permissions',
    detect: (m) => (has(m, 'BODY_SENSORS') || has(m, 'BODY_SENSORS_BACKGROUND') ? { severity: 'must', reason: 'BODY_SENSORS is declared.' } : null),
  },
  {
    id: 'fixed-rate', api: 36, area: 'Runtime', title: 'scheduleAtFixedRate runs at most one missed execution',
    summary: 'When the app comes back, only one missed periodic task runs immediately instead of all of them.',
    action: 'Check code that counts on catching up missed runs.',
    link: '#schedule-at-fixed-rate',
  },
  {
    id: 'elegant-text-16', api: 36, area: 'UI', title: 'elegantTextHeight is ignored',
    summary: 'The compact UI fonts are discontinued; the attribute no longer has an effect.',
    action: 'Check text in Arabic, Thai, Tamil and other affected scripts.',
    link: '#elegant-text-height',
  },
  {
    id: 'mediastore-version', api: 36, area: 'Security', title: 'MediaStore.getVersion() is unique per app',
    summary: 'The version string no longer carries identifying details.',
    action: 'Don’t parse the version; only compare it for changes.',
    link: '#mediastore-lockdown',
  },
  // ---------------------------------------------------------------- Android 17
  {
    id: 'local-network', api: 37, area: 'Permissions & privacy', title: 'Local network access needs ACCESS_LOCAL_NETWORK',
    summary: 'Reaching devices on the local network needs the new runtime permission (Nearby devices group), unless you use a system device picker.',
    action: 'Declare and request ACCESS_LOCAL_NETWORK if you talk to LAN devices (casting, smart home, local servers).',
    link: '#local-network-protection-permission',
    detect: (m) => (has(m, 'INTERNET') ? { severity: 'check', reason: 'The app has INTERNET: check whether it talks to devices on the local network.' } : null),
  },
  {
    id: 'large-screen-opt-out-removed', api: 37, area: 'UI', title: 'No more opt-out from large-screen resizability',
    summary: 'PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY no longer works.',
    action: 'Finish making the app adaptive before targeting API 37.',
    link: '#large-screen-ignore-constraints',
    detect: (m) => (/PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY/.test(m.text) ? { severity: 'must', reason: 'The manifest uses the temporary opt-out property.' } : null),
  },
  {
    id: 'messagequeue', api: 37, area: 'Runtime', title: 'Lock-free MessageQueue',
    summary: 'A new MessageQueue implementation breaks code that reflects on its private fields.',
    action: 'Remove reflection on MessageQueue (some test and profiling libraries do this).',
    link: '#lock-free-messagequeue',
  },
  {
    id: 'static-final', api: 37, area: 'Runtime', title: 'static final fields can’t be changed',
    summary: 'Changing a static final field with reflection throws, and through JNI crashes.',
    action: 'Find reflection that writes final fields, often in tests or mocking setups.',
    link: '#static-final-fields',
  },
  {
    id: 'widget-memory', api: 37, area: 'UI', title: 'Strict bitmap memory limit for widgets',
    summary: 'updateAppWidget throws when the RemoteViews images exceed the memory budget.',
    action: 'Downsample widget bitmaps and decode them once per update (see the glance-appwidget-updates-and-memory skill).',
    link: '#memory-limit-widget',
    detect: (m) => (receiversFor(m, 'android.appwidget.action.APPWIDGET_UPDATE').length ? { severity: 'must', reason: `Widget provider: ${names(receiversFor(m, 'android.appwidget.action.APPWIDGET_UPDATE'))}.` } : null),
  },
  {
    id: 'sms-otp-delay', api: 37, area: 'Permissions & privacy', title: 'Standard SMS with OTPs are delayed three hours',
    summary: 'For most apps, SMS containing a one-time code aren’t delivered or queryable for three hours.',
    action: 'Use the SMS Retriever or SMS User Consent API for verification codes.',
    link: '#sms-otp-protection',
    detect: (m) => (has(m, 'RECEIVE_SMS') || has(m, 'READ_SMS') ? { severity: 'must', reason: 'The app reads SMS.' } : null),
  },
  {
    id: 'background-audio', api: 37, area: 'Media', title: 'Background audio needs a while-in-use foreground service',
    summary: 'Playing audio, requesting focus or changing volume from the background needs a foreground service with while-in-use capabilities, or exact alarm access for alarm streams.',
    action: 'Play background audio from a mediaPlayback foreground service.',
    link: '#bg-audio',
    detect: (m) => (servicesOfType(m, 'mediaPlayback').length ? { severity: 'check', reason: 'The app plays media.' } : null),
  },
  {
    id: 'bal-17', api: 37, area: 'Security', title: 'Background activity launch hardening',
    summary: 'Restrictions extend to IntentSender, and MODE_BACKGROUND_ACTIVITY_START_ALLOWED is replaced by narrower modes.',
    action: 'Use MODE_BACKGROUND_ACTIVITY_START_ALLOW_IF_VISIBLE and check lint and StrictMode.',
    link: '#activity-security',
  },
  {
    id: 'ct-default', api: 37, area: 'Security', title: 'Certificate transparency on by default',
    summary: 'TLS connections require certificate transparency.',
    action: 'Check connections to servers with private or self-issued certificates.',
    link: '#ct-default',
  },
  {
    id: 'native-dcl', api: 37, area: 'Security', title: 'Native libraries loaded at runtime must be read-only',
    summary: 'System.load() throws UnsatisfiedLinkError for writable files.',
    action: 'Mark downloaded .so files read-only, or ship them in the APK.',
    link: '#safer-dcl',
  },
  {
    id: 'contacts-pii', api: 37, area: 'Permissions & privacy', title: 'Contacts data view hides account columns',
    summary: 'ACCOUNT_NAME, ACCOUNT_TYPE and ACCOUNT_TYPE_AND_DATA_SET are removed from ContactsContract.Data, and queries without READ_CONTACTS are validated strictly.',
    action: 'Read account columns from RawContacts, joined on RAW_CONTACT_ID.',
    link: '#restrict-pii-fields-cp2-data-view',
    detect: (m) => (has(m, 'READ_CONTACTS') ? { severity: 'check', reason: 'The app reads contacts.' } : null),
  },
  {
    id: 'content-capture', api: 37, area: 'Permissions & privacy', title: 'setContentCaptureEnabled(false) no longer works',
    summary: 'Content Capture can’t be turned off with the old API.',
    action: 'Use FLAG_SECURE on windows whose content must not be captured.',
    link: '#deprecate-setcontentcaptureenabled',
  },
  {
    id: 'passwords-keyboard', api: 37, area: 'UI', title: 'Passwords hidden while typing on physical keyboards',
    summary: 'With an external keyboard, password fields hide every character by default.',
    action: 'Nothing to change; test sign-in with a keyboard.',
    link: '#hide-pwd-kbd',
  },
  {
    id: 'rfcomm-read', api: 37, area: 'Connectivity', title: 'Bluetooth RFCOMM read() returns -1 when closed',
    summary: 'read() on an RFCOMM BluetoothSocket returns -1 instead of only throwing when the connection drops.',
    action: 'Stop read loops on a -1 return value.',
    link: '#bluetooth-rfcomm-socket-change',
    detect: (m) => (has(m, 'BLUETOOTH_CONNECT') || has(m, 'BLUETOOTH') ? { severity: 'check', reason: 'The app uses Bluetooth.' } : null),
  },
];

export function changeUrl(c: ChangeItem): string {
  return c.link.startsWith('http') ? c.link : `${PAGE[c.api]}${c.link}`;
}

/** Changes that apply when moving from one targetSdk to another. */
export function changesBetween(from: number, to: number): ChangeItem[] {
  return changes.filter((c) => c.api > from && c.api <= to);
}

// ---------------------------------------------------------------------------
// Manifest

export function readManifest(text: string): ManifestFacts {
  const permissions = new Set([...text.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*android:name\s*=\s*"([^"]+)"/g)].map((m) => m[1]!));
  const nameOf = (tag: string) => tag.match(/android:name\s*=\s*"([^"]+)"/)?.[1] ?? '(unnamed)';
  const unexported: string[] = [];
  const services: ManifestFacts['services'] = [];
  const receivers: ManifestFacts['receivers'] = [];
  const activities: ManifestFacts['activities'] = [];
  for (const m of text.matchAll(/<(activity|activity-alias|service|receiver)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g)) {
    const [, kind, attrs, , body = ''] = m;
    const name = nameOf(attrs!);
    if (/<intent-filter/.test(body) && !/android:exported\s*=/.test(attrs!)) unexported.push(name);
    if (kind === 'service') services.push({ name, types: (attrs!.match(/android:foregroundServiceType\s*=\s*"([^"]+)"/)?.[1] ?? '').split('|').filter(Boolean), tag: attrs! });
    if (kind === 'receiver') receivers.push({ name, actions: [...body.matchAll(/<action\b[^>]*android:name\s*=\s*"([^"]+)"/g)].map((a) => a[1]!) });
    if (kind === 'activity') activities.push({ name, tag: attrs! });
  }
  return { text, permissions, unexported, services, receivers, activities };
}

/** targetSdkVersion from a manifest or build file, if present. */
export function findTargetSdk(text: string): number | undefined {
  const v = text.match(/android:targetSdkVersion\s*=\s*"(\d+)"/)?.[1] ?? text.match(/targetSdk(?:Version)?\s*(?:=|\()?\s*(\d{2})/)?.[1];
  return v ? Number(v) : undefined;
}
