export type CategoryId = 'android' | 'kotlin' | 'agents' | 'cli' | 'publishing';

export interface Category {
  id: CategoryId;
  name: string;
  blurb: string;
  /** URL prefix every tool in this category lives under. */
  basePath: '/tools/' | '/agents/' | '/cli/';
}

export type ToolStatus = 'live' | 'soon';
export type Milestone = 'v1.0' | 'v1.1' | 'v1.2' | 'v1.3' | 'v1.4';

export interface Tool {
  slug: string;
  name: string;
  tagline: string;
  category: CategoryId;
  status: ToolStatus;
  milestone: Milestone;
  keywords: string[];
}

export const categories: readonly Category[] = [
  {
    id: 'agents',
    name: 'AI Agents',
    blurb: 'Set up Claude Code, Codex, Gemini CLI and friends for Android and KMP projects.',
    basePath: '/agents/',
  },
  {
    id: 'cli',
    name: 'Android CLI',
    blurb: 'Build the right Android CLI command, wire it into CI, and fix what breaks.',
    basePath: '/cli/',
  },
  {
    id: 'android',
    name: 'Android',
    blurb: 'Icons, vectors, themes, Gradle and R8, without leaving the browser.',
    basePath: '/tools/',
  },
  {
    id: 'kotlin',
    name: 'Kotlin & KMP',
    blurb: 'Kotlin code generators and Multiplatform helpers.',
    basePath: '/tools/',
  },
  {
    id: 'publishing',
    name: 'Publishing',
    blurb: 'Store assets, listings and policy forms for Google Play and the App Store.',
    basePath: '/tools/',
  },
];

export const tools: readonly Tool[] = [
  // v1.0 launch set
  {
    slug: 'agents-md-generator',
    name: 'AGENTS.md Generator',
    tagline: 'Generate AGENTS.md, CLAUDE.md or GEMINI.md tuned to your Android or KMP stack.',
    category: 'agents',
    status: 'live',
    milestone: 'v1.0',
    keywords: ['agents.md', 'claude.md', 'gemini.md', 'ai', 'agent', 'instructions'],
  },
  {
    slug: 'mcp-config',
    name: 'MCP Config Generator',
    tagline: 'Pick your agent and services, get a ready-to-paste MCP config and where it goes.',
    category: 'agents',
    status: 'live',
    milestone: 'v1.0',
    keywords: ['mcp', 'model context protocol', 'claude code', 'codex', 'cursor', 'config'],
  },
  {
    slug: 'command-builder',
    name: 'Android CLI Command Builder',
    tagline: 'Choose a task and get the Android CLI command with every flag explained.',
    category: 'cli',
    status: 'live',
    milestone: 'v1.0',
    keywords: ['android cli', 'adb', 'sdkmanager', 'emulator', 'command'],
  },
  {
    slug: 'json-to-kotlin',
    name: 'JSON to Kotlin',
    tagline: 'Turn JSON into Kotlin data classes for kotlinx.serialization, Moshi or Gson.',
    category: 'kotlin',
    status: 'live',
    milestone: 'v1.0',
    keywords: ['json', 'data class', 'kotlinx.serialization', 'moshi', 'gson', 'kmp'],
  },
  {
    slug: 'app-icon-generator',
    name: 'App Icon Generator',
    tagline: 'Every mipmap, adaptive and themed icon, Play Store and iOS AppIcon sizes in one ZIP.',
    category: 'android',
    status: 'live',
    milestone: 'v1.0',
    keywords: ['icon', 'adaptive icon', 'mipmap', 'launcher', 'themed icon', 'ios'],
  },
  // v1.1
  {
    slug: 'svg-to-compose',
    name: 'SVG to Compose ImageVector',
    tagline: 'Convert SVG to Compose ImageVector or VectorDrawable, and back, with a preview.',
    category: 'android',
    status: 'live',
    milestone: 'v1.1',
    keywords: ['svg', 'imagevector', 'vectordrawable', 'compose', 'icon'],
  },
  {
    slug: 'compose-theme',
    name: 'Material 3 Theme Generator',
    tagline: 'From one seed color to light and dark Compose ColorScheme code.',
    category: 'android',
    status: 'live',
    milestone: 'v1.1',
    keywords: ['material 3', 'theme', 'colorscheme', 'compose', 'dynamic color'],
  },
  {
    slug: 'version-catalog',
    name: 'Version Catalog Converter',
    tagline: 'Move build.gradle dependencies and plugins into libs.versions.toml and rewrite the build file.',
    category: 'android',
    status: 'live',
    milestone: 'v1.1',
    keywords: ['gradle', 'version catalog', 'libs.versions.toml', 'dependencies'],
  },
  {
    slug: 'compatibility-matrix',
    name: 'Kotlin / AGP Compatibility Matrix',
    tagline: 'Which Kotlin, AGP, Gradle, Compose and KSP versions work together.',
    category: 'kotlin',
    status: 'live',
    milestone: 'v1.1',
    keywords: ['kotlin', 'agp', 'gradle', 'ksp', 'compose compiler', 'compatibility'],
  },
  {
    slug: 'r8-retrace',
    name: 'R8 Retrace',
    tagline: 'Deobfuscate a stack trace with your mapping.txt, entirely in the browser.',
    category: 'android',
    status: 'live',
    milestone: 'v1.1',
    keywords: ['r8', 'proguard', 'retrace', 'mapping.txt', 'stack trace', 'crash'],
  },
  {
    slug: 'unit-converter',
    name: 'dp / sp / px & Color Converter',
    tagline: 'Density units and colors in every Android and Compose format.',
    category: 'android',
    status: 'live',
    milestone: 'v1.1',
    keywords: ['dp', 'sp', 'px', 'density', 'color', 'argb', 'hex'],
  },
  // v1.2
  {
    slug: 'crash-to-prompt',
    name: 'Crash to Agent Prompt',
    tagline: 'Strip secrets from a stack trace and turn it into a compact prompt for your agent.',
    category: 'agents',
    status: 'live',
    milestone: 'v1.2',
    keywords: ['crash', 'stack trace', 'logcat', 'prompt', 'redact'],
  },
  {
    slug: 'prompt-recipes',
    name: 'Prompt Recipes',
    tagline: 'Fill-in prompts for common Android jobs: crashes, ANRs, tests, upgrades, Compose and reviews.',
    category: 'agents',
    status: 'live',
    milestone: 'v1.2',
    keywords: ['prompts', 'claude code', 'codex', 'gemini', 'agents', 'recipes'],
  },
  {
    slug: 'skills',
    name: 'Android Skills Library',
    tagline: 'Tested agent skills for Android builds, crashes and upgrades, plus Google’s official skills, ready to install.',
    category: 'agents',
    status: 'live',
    milestone: 'v1.2',
    keywords: ['skills', 'SKILL.md', 'claude code', 'codex', 'gemini', 'agents'],
  },
  {
    slug: 'info-plist',
    name: 'Info.plist Permission Keys',
    tagline: 'iOS privacy purpose strings for your app, suggested from your Android permissions, checked before App Review.',
    category: 'kotlin',
    status: 'live',
    milestone: 'v1.4',
    keywords: ['info.plist', 'NSCameraUsageDescription', 'usage description', 'ios permissions', 'kmp', 'compose multiplatform'],
  },
  {
    slug: 'apk-analyzer',
    name: 'APK & AAB Analyzer',
    tagline: 'Size, manifest, DEX counts, signing and 16 KB page size readiness of an APK or AAB, in your browser.',
    category: 'android',
    status: 'live',
    milestone: 'v1.3',
    keywords: ['apk analyzer', 'aab', '16 kb page size', 'dex count', 'apk size', 'signing certificate'],
  },
  {
    slug: 'target-sdk',
    name: 'targetSdk Migration Checklist',
    tagline: 'What changes from Android 12 to 17 when you raise targetSdk, checked against your manifest.',
    category: 'android',
    status: 'live',
    milestone: 'v1.3',
    keywords: ['targetSdk', 'target api level', 'behavior changes', 'android 16', 'android 17', 'play requirement'],
  },
  {
    slug: 'permissions',
    name: 'Android Permission Explorer',
    tagline: 'Every Android permission with its level and API, and a manifest check for runtime and Play-restricted ones.',
    category: 'android',
    status: 'live',
    milestone: 'v1.3',
    keywords: ['permissions', 'uses-permission', 'runtime permissions', 'dangerous', 'play policy', 'AndroidManifest'],
  },
  {
    slug: 'keep-rules',
    name: 'R8 Keep Rule Generator',
    tagline: 'Narrow keep rules for Gson models, runtime class names, annotations, WebView and JNI, plus a proguard-rules.pro check.',
    category: 'android',
    status: 'live',
    milestone: 'v1.3',
    keywords: ['r8', 'proguard', 'keep rules', 'proguard-rules.pro', 'minify', 'reflection'],
  },
  {
    slug: 'notification-icon',
    name: 'Notification Icon Generator',
    tagline: 'Turn a logo, letter or emoji into a white status bar icon for every density, plus a vector from SVG.',
    category: 'android',
    status: 'live',
    milestone: 'v1.3',
    keywords: ['notification icon', 'small icon', 'ic_stat', 'status bar', 'fcm'],
  },
  {
    slug: 'app-links',
    name: 'App Links & assetlinks.json',
    tagline: 'Generate assetlinks.json and intent filters, check them, and see what Google sees on your live domain.',
    category: 'android',
    status: 'live',
    milestone: 'v1.3',
    keywords: ['app links', 'assetlinks.json', 'deep links', 'autoVerify', 'digital asset links'],
  },
  {
    slug: 'strings-csv',
    name: 'strings.xml ↔ CSV & Translation Checker',
    tagline: 'Export strings.xml to CSV for translators, import it back, and catch broken placeholders and missing plurals.',
    category: 'android',
    status: 'live',
    milestone: 'v1.3',
    keywords: ['strings.xml', 'csv', 'translation', 'localization', 'plurals', 'i18n'],
  },
  {
    slug: 'logcat-viewer',
    name: 'Logcat & ANR Viewer',
    tagline: 'Filter and colour Logcat, find crashes and ANRs, and see why the main thread was stuck.',
    category: 'android',
    status: 'live',
    milestone: 'v1.2',
    keywords: ['logcat', 'anr', 'traces.txt', 'deadlock', 'crash', 'adb'],
  },
  {
    slug: 'agent-readiness',
    name: 'Agent Readiness Checker',
    tagline: 'Score how ready your Android or KMP project is for coding agents, and get a fix list.',
    category: 'agents',
    status: 'live',
    milestone: 'v1.2',
    keywords: ['agents', 'agents.md', 'audit', 'readiness', 'claude code', 'codex'],
  },
  {
    slug: 'journeys-writer',
    name: 'Journeys Writer',
    tagline: 'Describe a user flow in plain words and get a .journey.xml test for Android Studio and the Android CLI.',
    category: 'cli',
    status: 'live',
    milestone: 'v1.2',
    keywords: ['journeys', 'ui test', 'android cli', 'e2e'],
  },
  // v1.4
  {
    slug: 'expect-actual',
    name: 'expect/actual Generator',
    tagline: 'Actual declarations for every KMP target from your expect code, plus ready-made platform templates that compile.',
    category: 'kotlin',
    status: 'live',
    milestone: 'v1.4',
    keywords: ['expect actual', 'kotlin multiplatform', 'kmp', 'androidMain', 'iosMain', 'source sets'],
  },
  {
    slug: 'kmp-libraries',
    name: 'KMP Library Finder',
    tagline: 'Kotlin Multiplatform libraries by task, with the targets each one publishes and a ready libs.versions.toml.',
    category: 'kotlin',
    status: 'live',
    milestone: 'v1.4',
    keywords: ['kmp libraries', 'kotlin multiplatform', 'compose multiplatform', 'ktor', 'koin', 'sqldelight', 'room', 'version catalog', 'klibs'],
  },
  {
    slug: 'swift-interop',
    name: 'Kotlin to Swift Interop',
    tagline: 'How your shared Kotlin API reads from Swift, with the gotchas: Int32, boxed numbers, suspend, sealed classes and Flow.',
    category: 'kotlin',
    status: 'live',
    milestone: 'v1.4',
    keywords: ['swift', 'ios', 'objective-c', 'interop', 'kotlin native', 'framework', 'xcode', 'swiftui', 'kmp'],
  },
  {
    slug: 'data-safety',
    name: 'Data Safety & Privacy Helper',
    tagline: 'Play Data safety answers, App Store privacy labels, PrivacyInfo.xcprivacy and a privacy policy from one checklist.',
    category: 'publishing',
    status: 'live',
    milestone: 'v1.4',
    keywords: ['data safety', 'privacy policy', 'privacy manifest', 'xcprivacy', 'app privacy', 'nutrition label', 'required reason api', 'gdpr', 'play console'],
  },
  {
    slug: 'store-listing',
    name: 'Store Listing Preview',
    tagline: 'See your Play Store and App Store text as the stores show it, with limits and Metadata policy checks.',
    category: 'publishing',
    status: 'live',
    milestone: 'v1.4',
    keywords: ['play store listing', 'short description', 'app store keywords', 'aso', 'metadata policy', 'subtitle'],
  },
  {
    slug: 'store-screenshots',
    name: 'Store Screenshot Generator',
    tagline: 'Captioned, framed screenshots for Google Play and the App Store, plus a feature graphic, checked against store rules.',
    category: 'publishing',
    status: 'live',
    milestone: 'v1.4',
    keywords: ['play store', 'app store', 'screenshot', 'feature graphic', 'aso'],
  },
];

export function categoryById(id: CategoryId): Category {
  const category = categories.find((c) => c.id === id);
  if (!category) throw new Error(`Unknown category: ${id}`);
  return category;
}

export function toolPath(tool: Tool): string {
  return `${categoryById(tool.category).basePath}${tool.slug}/`;
}

export function toolsIn(id: CategoryId): Tool[] {
  return tools.filter((t) => t.category === id);
}
