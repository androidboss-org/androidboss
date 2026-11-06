/**
 * Google's official Android skills, as listed by `android skills list`
 * (Android CLI 1.1.16717390). Summaries are ours; install with
 * `android skills add <id>`.
 */
export const OFFICIAL_SKILLS_CHECKED_ON = '2026-11-03';

export interface OfficialSkill {
  id: string;
  summary: string;
  topic: 'Build & tooling' | 'UI' | 'Performance & quality' | 'Security & privacy' | 'Platforms & devices' | 'AI & ML' | 'Media & integrations';
}

export const officialSkills: readonly OfficialSkill[] = [
  { id: 'android-cli', topic: 'Build & tooling', summary: 'Use the Android CLI: create projects, run apps, manage emulators, inspect UI, search docs.' },
  { id: 'agp-9-upgrade', topic: 'Build & tooling', summary: 'Migrate an Android project to Android Gradle plugin 9 (not KMP).' },
  { id: 'testing-setup', topic: 'Build & tooling', summary: 'Plan and set up unit, UI, screenshot and end-to-end testing.' },
  { id: 'r8-analyzer', topic: 'Build & tooling', summary: 'Find redundant or overly broad R8 keep rules to shrink the app.' },
  { id: 'play-billing-library-version-upgrade', topic: 'Build & tooling', summary: 'Upgrade the Play Billing Library to a newer major version.' },
  { id: 'migrate-xml-views-to-jetpack-compose', topic: 'UI', summary: 'Move screens from XML Views to Jetpack Compose.' },
  { id: 'adaptive', topic: 'UI', summary: 'Adapt UI to phones, tablets, foldables, desktop, TV, Auto and XR.' },
  { id: 'edge-to-edge', topic: 'UI', summary: 'Draw edge to edge and handle system bar and cutout insets.' },
  { id: 'navigation-3', topic: 'UI', summary: 'Build or migrate navigation with Navigation 3.' },
  { id: 'navigation-event', topic: 'UI', summary: 'Handle back gestures and predictive back animations with NavigationEvent.' },
  { id: 'glance-appwidget-updates-and-memory', topic: 'UI', summary: 'Update Glance widgets efficiently and keep their memory use low.' },
  { id: 'glance-canonical-layouts', topic: 'UI', summary: 'Build home screen widgets from Glance canonical layouts.' },
  { id: 'wear-compose-m3', topic: 'UI', summary: 'Build Wear OS UIs with Compose for Wear OS Material 3.' },
  { id: 'wear-widgets', topic: 'UI', summary: 'Build Wear OS widgets with Glance Wear and Remote Compose.' },
  { id: 'leanback-to-compose-tv-migration', topic: 'UI', summary: 'Migrate Android TV apps from Leanback to Compose for TV.' },
  { id: 'jetpack-compose-performance', topic: 'Performance & quality', summary: 'Find and fix recomposition and jank problems in Compose.' },
  { id: 'anr-audit-and-fix', topic: 'Performance & quality', summary: 'Scan code for ANR risks and diagnose ANR stack dumps.' },
  { id: 'android-profiler', topic: 'Performance & quality', summary: 'Record and analyse Perfetto traces, heap dumps, startup, battery and jank.' },
  { id: 'android-intent-security', topic: 'Security & privacy', summary: 'Audit exported components and Intent handling for redirection bugs.' },
  { id: 'android-permissions-security', topic: 'Security & privacy', summary: 'Audit permissions and IPC components, and fix runtime permission flows.' },
  { id: 'play-policy-insights', topic: 'Security & privacy', summary: 'Check code and Play Console declarations against Google Play policies.' },
  { id: 'restore-credentials', topic: 'Security & privacy', summary: 'Sign users in silently after restoring to a new device.' },
  { id: 'verified-email', topic: 'Security & privacy', summary: 'Verify a user’s email without OTPs through Credential Manager.' },
  { id: 'android-for-cars-parked-apps', topic: 'Platforms & devices', summary: 'Run video, game and browser apps as parked apps on Android Auto and Automotive.' },
  { id: 'display-glasses-with-jetpack-compose-glimmer', topic: 'Platforms & devices', summary: 'Build apps for Android XR display glasses with Jetpack Compose Glimmer.' },
  { id: 'projected-hardware', topic: 'Platforms & devices', summary: 'Use the camera, microphone and other hardware of Android XR glasses from an app.' },
  { id: 'camerax', topic: 'Media & integrations', summary: 'Add camera features with CameraX.' },
  { id: 'media3-cast-integration', topic: 'Media & integrations', summary: 'Cast Media3 playback to Cast devices.' },
  { id: 'engage-sdk-integration', topic: 'Media & integrations', summary: 'Integrate and debug the Play Engage SDK.' },
  { id: 'ink-app-builder', topic: 'Media & integrations', summary: 'Build drawing and handwriting features with the Ink API.' },
  { id: 'ink-custom-brush-builder', topic: 'Media & integrations', summary: 'Create custom brushes for the Ink API.' },
  { id: 'appfunctions', topic: 'AI & ML', summary: 'Expose app actions to agents and assistants with AppFunctions.' },
  { id: 'litert-lm', topic: 'AI & ML', summary: 'Run language models on device with LiteRT-LM.' },
  { id: 'litert-runtime', topic: 'AI & ML', summary: 'Run .tflite models on device with LiteRT on CPU and GPU.' },
  { id: 'ml-kit-genai-prompt-api', topic: 'AI & ML', summary: 'Prompt Gemini Nano on device with the ML Kit GenAI Prompt API.' },
  { id: 'mlkit-agent-api', topic: 'AI & ML', summary: 'Build on-device agents with the ML Kit GenAI Agent API and Gemini Nano.' },
];
