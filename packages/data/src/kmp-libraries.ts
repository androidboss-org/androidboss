/**
 * Kotlin Multiplatform libraries, curated by hand. Versions, release dates and
 * supported targets are not written here: scripts/update-kmp-libraries.mts reads
 * them from each library's Gradle module metadata on Maven Central or Google's
 * Maven repository and writes kmp-libraries.json.
 */
import data from './kmp-libraries.json' with { type: 'json' };

export type LibraryCategory = 'networking' | 'serialization' | 'storage' | 'di' | 'async' | 'logging' | 'images' | 'ui' | 'navigation' | 'testing' | 'io' | 'services' | 'ai' | 'utilities';

export const LIBRARY_CATEGORIES: { id: LibraryCategory; name: string }[] = [
  { id: 'networking', name: 'Networking' },
  { id: 'serialization', name: 'Serialization' },
  { id: 'storage', name: 'Database & storage' },
  { id: 'di', name: 'Dependency injection' },
  { id: 'async', name: 'Coroutines & lifecycle' },
  { id: 'navigation', name: 'Navigation & architecture' },
  { id: 'ui', name: 'Compose UI' },
  { id: 'images', name: 'Images & media' },
  { id: 'logging', name: 'Logging & crashes' },
  { id: 'io', name: 'Files, IO & crypto' },
  { id: 'services', name: 'Firebase & services' },
  { id: 'ai', name: 'AI & LLMs' },
  { id: 'testing', name: 'Testing' },
  { id: 'utilities', name: 'Utilities' },
];

export interface LibrarySource {
  /** `group:artifact` of the module you add to commonMain. */
  coordinates: string;
  name: string;
  category: LibraryCategory;
  description: string;
  url: string;
  repository: 'central' | 'google';
  /** Set when the library is official (JetBrains, Google, Kotlin team). */
  official?: true;
}

export const LIBRARY_SOURCES: LibrarySource[] = [
  // Networking
  { coordinates: 'io.ktor:ktor-client-core', name: 'Ktor Client', category: 'networking', description: 'HTTP client with pluggable engines per platform: OkHttp, Darwin, CIO, JS fetch.', url: 'https://github.com/ktorio/ktor', repository: 'central', official: true },
  { coordinates: 'de.jensklingenberg.ktorfit:ktorfit-lib', name: 'Ktorfit', category: 'networking', description: 'Retrofit-style annotated interfaces, generated with KSP on top of Ktor.', url: 'https://github.com/Foso/Ktorfit', repository: 'central' },
  { coordinates: 'com.apollographql.apollo:apollo-runtime', name: 'Apollo Kotlin', category: 'networking', description: 'GraphQL client that generates typed models from your schema and queries.', url: 'https://github.com/apollographql/apollo-kotlin', repository: 'central' },
  { coordinates: 'org.mobilenativefoundation.store:store5', name: 'Store', category: 'networking', description: 'Loads data from network and cache with one Flow, handling refresh and offline reads.', url: 'https://github.com/MobileNativeFoundation/Store', repository: 'central' },

  // Serialization
  { coordinates: 'org.jetbrains.kotlinx:kotlinx-serialization-json', name: 'kotlinx.serialization JSON', category: 'serialization', description: 'The Kotlin team’s compiler-plugin serialization, with JSON support.', url: 'https://github.com/Kotlin/kotlinx.serialization', repository: 'central', official: true },
  { coordinates: 'org.jetbrains.kotlinx:kotlinx-serialization-protobuf', name: 'kotlinx.serialization Protobuf', category: 'serialization', description: 'Protocol Buffers format for kotlinx.serialization classes.', url: 'https://github.com/Kotlin/kotlinx.serialization', repository: 'central', official: true },
  { coordinates: 'com.charleskorn.kaml:kaml', name: 'kaml', category: 'serialization', description: 'YAML format for kotlinx.serialization.', url: 'https://github.com/charleskorn/kaml', repository: 'central' },
  { coordinates: 'com.squareup.wire:wire-runtime', name: 'Wire', category: 'serialization', description: 'Square’s Protocol Buffers and gRPC code generator and runtime.', url: 'https://github.com/square/wire', repository: 'central' },

  // Storage
  { coordinates: 'androidx.room:room-runtime', name: 'Room', category: 'storage', description: 'Android’s SQLite object mapper, now multiplatform for Android, iOS, JVM and more.', url: 'https://developer.android.com/kotlin/multiplatform/room', repository: 'google', official: true },
  { coordinates: 'androidx.sqlite:sqlite-bundled', name: 'SQLite Bundled', category: 'storage', description: 'A bundled SQLite build so every platform runs the same version; used with Room.', url: 'https://developer.android.com/kotlin/multiplatform/sqlite', repository: 'google', official: true },
  { coordinates: 'app.cash.sqldelight:runtime', name: 'SQLDelight', category: 'storage', description: 'Write SQL, get type-safe Kotlin APIs generated from it.', url: 'https://github.com/sqldelight/sqldelight', repository: 'central' },
  { coordinates: 'androidx.datastore:datastore-preferences-core', name: 'DataStore Preferences', category: 'storage', description: 'Key-value and typed storage with coroutines and Flow, from Jetpack.', url: 'https://developer.android.com/kotlin/multiplatform/datastore', repository: 'google', official: true },
  { coordinates: 'com.russhwolf:multiplatform-settings', name: 'Multiplatform Settings', category: 'storage', description: 'Key-value settings over SharedPreferences, NSUserDefaults, java.util.prefs and localStorage.', url: 'https://github.com/russhwolf/multiplatform-settings', repository: 'central' },
  { coordinates: 'io.github.xxfast:kstore', name: 'KStore', category: 'storage', description: 'Stores a serializable object in a file and exposes it as a Flow.', url: 'https://github.com/xxfast/KStore', repository: 'central' },
  { coordinates: 'com.liftric:kvault', name: 'KVault', category: 'storage', description: 'Secure storage on top of Android’s encrypted preferences and the iOS Keychain.', url: 'https://github.com/Liftric/KVault', repository: 'central' },

  // DI
  { coordinates: 'io.insert-koin:koin-core', name: 'Koin', category: 'di', description: 'Lightweight dependency injection with a Kotlin DSL and no code generation.', url: 'https://github.com/InsertKoinIO/koin', repository: 'central' },
  { coordinates: 'me.tatarka.inject:kotlin-inject-runtime', name: 'kotlin-inject', category: 'di', description: 'Compile-time dependency injection generated with KSP.', url: 'https://github.com/evant/kotlin-inject', repository: 'central' },
  { coordinates: 'dev.zacsweers.metro:runtime', name: 'Metro', category: 'di', description: 'Compile-time dependency injection as a Kotlin compiler plugin, in the style of Dagger.', url: 'https://github.com/ZacSweers/metro', repository: 'central' },
  { coordinates: 'org.kodein.di:kodein-di', name: 'Kodein DI', category: 'di', description: 'Runtime dependency injection with a Kotlin DSL.', url: 'https://github.com/kosi-libs/Kodein', repository: 'central' },

  // Async and lifecycle
  { coordinates: 'org.jetbrains.kotlinx:kotlinx-coroutines-core', name: 'kotlinx.coroutines', category: 'async', description: 'Coroutines, Flow, channels and dispatchers.', url: 'https://github.com/Kotlin/kotlinx.coroutines', repository: 'central', official: true },
  { coordinates: 'com.rickclephas.kmp:kmp-nativecoroutines-core', name: 'KMP-NativeCoroutines', category: 'async', description: 'Lets Swift consume suspend functions and Flow as async/await, Combine or RxSwift.', url: 'https://github.com/rickclephas/KMP-NativeCoroutines', repository: 'central' },
  { coordinates: 'com.arkivanov.essenty:lifecycle', name: 'Essenty', category: 'async', description: 'Lifecycle, state keeping and back handling for shared code.', url: 'https://github.com/arkivanov/Essenty', repository: 'central' },

  // Navigation and architecture
  { coordinates: 'org.jetbrains.androidx.lifecycle:lifecycle-viewmodel', name: 'Lifecycle ViewModel', category: 'navigation', description: 'Jetpack ViewModel for Compose Multiplatform, published by JetBrains.', url: 'https://kotlinlang.org/docs/multiplatform/compose-viewmodel.html', repository: 'central', official: true },
  { coordinates: 'org.jetbrains.androidx.navigation:navigation-compose', name: 'Navigation Compose', category: 'navigation', description: 'Jetpack Navigation for Compose Multiplatform, published by JetBrains.', url: 'https://kotlinlang.org/docs/multiplatform/compose-navigation.html', repository: 'central', official: true },
  { coordinates: 'com.arkivanov.decompose:decompose', name: 'Decompose', category: 'navigation', description: 'Lifecycle-aware components and navigation that work with any UI framework.', url: 'https://github.com/arkivanov/Decompose', repository: 'central' },
  { coordinates: 'cafe.adriel.voyager:voyager-navigator', name: 'Voyager', category: 'navigation', description: 'Screen-based navigation for Compose Multiplatform.', url: 'https://github.com/adrielcafe/voyager', repository: 'central' },
  { coordinates: 'com.slack.circuit:circuit-foundation', name: 'Circuit', category: 'navigation', description: 'Slack’s Compose-driven architecture: presenters, UI and navigation.', url: 'https://github.com/slackhq/circuit', repository: 'central' },
  { coordinates: 'com.arkivanov.mvikotlin:mvikotlin', name: 'MVIKotlin', category: 'navigation', description: 'MVI framework with stores, time travel and logging.', url: 'https://github.com/arkivanov/MVIKotlin', repository: 'central' },

  // Compose UI
  { coordinates: 'org.jetbrains.compose.material3:material3', name: 'Compose Material 3', category: 'ui', description: 'Material 3 components for Compose Multiplatform.', url: 'https://github.com/JetBrains/compose-multiplatform', repository: 'central', official: true },
  { coordinates: 'org.jetbrains.compose.components:components-resources', name: 'Compose Resources', category: 'ui', description: 'Strings, images, fonts and other resources shared across platforms.', url: 'https://kotlinlang.org/docs/multiplatform/compose-multiplatform-resources.html', repository: 'central', official: true },
  { coordinates: 'dev.chrisbanes.haze:haze', name: 'Haze', category: 'ui', description: 'Glassmorphism-style background blur for Compose.', url: 'https://github.com/chrisbanes/haze', repository: 'central' },
  { coordinates: 'io.github.alexzhirkevich:compottie', name: 'Compottie', category: 'ui', description: 'Lottie and dotLottie animations rendered in Compose Multiplatform.', url: 'https://github.com/alexzhirkevich/compottie', repository: 'central' },
  { coordinates: 'com.mikepenz:multiplatform-markdown-renderer', name: 'Markdown Renderer', category: 'ui', description: 'Renders Markdown as Compose UI.', url: 'https://github.com/mikepenz/multiplatform-markdown-renderer', repository: 'central' },
  { coordinates: 'com.mohamedrejeb.richeditor:richeditor-compose', name: 'Compose Rich Editor', category: 'ui', description: 'Rich text editing with styles, lists and links.', url: 'https://github.com/MohamedRejeb/compose-rich-editor', repository: 'central' },
  { coordinates: 'sh.calvin.reorderable:reorderable', name: 'Reorderable', category: 'ui', description: 'Drag-to-reorder for lazy lists and grids.', url: 'https://github.com/Calvin-LL/Reorderable', repository: 'central' },
  { coordinates: 'io.github.kevinnzou:compose-webview-multiplatform', name: 'Compose WebView', category: 'ui', description: 'A WebView composable for Android, iOS and desktop.', url: 'https://github.com/KevinnZou/compose-webview-multiplatform', repository: 'central' },
  { coordinates: 'dev.icerock.moko:resources', name: 'moko-resources', category: 'ui', description: 'Shared strings, plurals, images and fonts, also usable from SwiftUI.', url: 'https://github.com/icerockdev/moko-resources', repository: 'central' },
  { coordinates: 'dev.icerock.moko:permissions', name: 'moko-permissions', category: 'ui', description: 'Requests runtime permissions from shared code.', url: 'https://github.com/icerockdev/moko-permissions', repository: 'central' },

  // Images and media
  { coordinates: 'io.coil-kt.coil3:coil-compose', name: 'Coil', category: 'images', description: 'Image loading for Compose, backed by Kotlin coroutines.', url: 'https://github.com/coil-kt/coil', repository: 'central' },
  { coordinates: 'media.kamel:kamel-image', name: 'Kamel', category: 'images', description: 'Asynchronous image loading for Compose Multiplatform, built on Ktor.', url: 'https://github.com/Kamel-Media/Kamel', repository: 'central' },
  { coordinates: 'io.github.vinceglb:filekit-core', name: 'FileKit', category: 'images', description: 'File and image pickers, and file access, across platforms.', url: 'https://github.com/vinceglb/FileKit', repository: 'central' },

  // Logging
  { coordinates: 'co.touchlab:kermit', name: 'Kermit', category: 'logging', description: 'Logging that writes to Logcat, OSLog and the console, with crash reporter hooks.', url: 'https://github.com/touchlab/Kermit', repository: 'central' },
  { coordinates: 'io.github.aakira:napier', name: 'Napier', category: 'logging', description: 'A simple logger with platform-specific output.', url: 'https://github.com/AAkira/Napier', repository: 'central' },
  { coordinates: 'io.github.oshai:kotlin-logging', name: 'kotlin-logging', category: 'logging', description: 'A lazy, idiomatic logging API (SLF4J on the JVM).', url: 'https://github.com/oshai/kotlin-logging', repository: 'central' },
  { coordinates: 'io.sentry:sentry-kotlin-multiplatform', name: 'Sentry', category: 'logging', description: 'Crash and error reporting with native iOS and Android symbolication.', url: 'https://github.com/getsentry/sentry-kotlin-multiplatform', repository: 'central' },

  // IO and crypto
  { coordinates: 'com.squareup.okio:okio', name: 'Okio', category: 'io', description: 'Files, buffers and streams, the IO layer under OkHttp.', url: 'https://github.com/square/okio', repository: 'central' },
  { coordinates: 'org.jetbrains.kotlinx:kotlinx-io-core', name: 'kotlinx-io', category: 'io', description: 'The Kotlin team’s IO library: buffers, sources, sinks and files.', url: 'https://github.com/Kotlin/kotlinx-io', repository: 'central', official: true },
  { coordinates: 'dev.whyoleg.cryptography:cryptography-core', name: 'cryptography-kotlin', category: 'io', description: 'Hashing, encryption and signatures over each platform’s native crypto.', url: 'https://github.com/whyoleg/cryptography-kotlin', repository: 'central' },
  { coordinates: 'org.kotlincrypto.hash:sha2', name: 'KotlinCrypto SHA-2', category: 'io', description: 'Pure Kotlin SHA-224, SHA-256, SHA-384 and SHA-512.', url: 'https://github.com/KotlinCrypto/hash', repository: 'central' },
  { coordinates: 'com.fleeksoft.ksoup:ksoup', name: 'Ksoup', category: 'io', description: 'HTML parsing and cleaning, a port of jsoup.', url: 'https://github.com/fleeksoft/ksoup', repository: 'central' },

  // Services
  { coordinates: 'dev.gitlive:firebase-auth', name: 'Firebase Auth (GitLive)', category: 'services', description: 'Firebase Authentication from shared code, wrapping the native SDKs.', url: 'https://github.com/GitLiveApp/firebase-kotlin-sdk', repository: 'central' },
  { coordinates: 'dev.gitlive:firebase-firestore', name: 'Firestore (GitLive)', category: 'services', description: 'Cloud Firestore from shared code, wrapping the native SDKs.', url: 'https://github.com/GitLiveApp/firebase-kotlin-sdk', repository: 'central' },
  { coordinates: 'io.github.jan-tennert.supabase:postgrest-kt', name: 'Supabase Postgrest', category: 'services', description: 'Supabase database client; auth, storage and realtime are separate modules.', url: 'https://github.com/supabase-community/supabase-kt', repository: 'central' },
  { coordinates: 'io.github.mirzemehdi:kmpnotifier', name: 'KMPNotifier', category: 'services', description: 'Push notifications through Firebase Cloud Messaging and APNs, plus local notifications.', url: 'https://github.com/mirzemehdi/KMPNotifier', repository: 'central' },
  { coordinates: 'com.revenuecat.purchases:purchases-kmp-core', name: 'RevenueCat', category: 'services', description: 'In-app purchases and subscriptions over Google Play Billing and StoreKit.', url: 'https://github.com/RevenueCat/purchases-kmp', repository: 'central' },

  // AI
  { coordinates: 'ai.koog:koog-agents', name: 'Koog', category: 'ai', description: 'JetBrains’ framework for building AI agents in Kotlin, with tools and multiple LLM providers.', url: 'https://github.com/JetBrains/koog', repository: 'central', official: true },
  { coordinates: 'com.aallam.openai:openai-client', name: 'OpenAI Kotlin', category: 'ai', description: 'A Kotlin client for the OpenAI API.', url: 'https://github.com/aallam/openai-kotlin', repository: 'central' },

  // Testing
  { coordinates: 'org.jetbrains.kotlinx:kotlinx-coroutines-test', name: 'kotlinx-coroutines-test', category: 'testing', description: 'runTest, virtual time and test dispatchers for coroutine code.', url: 'https://github.com/Kotlin/kotlinx.coroutines', repository: 'central', official: true },
  { coordinates: 'app.cash.turbine:turbine', name: 'Turbine', category: 'testing', description: 'A small testing library for Flow.', url: 'https://github.com/cashapp/turbine', repository: 'central' },
  { coordinates: 'io.kotest:kotest-assertions-core', name: 'Kotest Assertions', category: 'testing', description: 'Readable assertions such as shouldBe and shouldContain.', url: 'https://github.com/kotest/kotest', repository: 'central' },
  { coordinates: 'dev.mokkery:mokkery-runtime', name: 'Mokkery', category: 'testing', description: 'Mocking as a compiler plugin, so it works on every target.', url: 'https://github.com/lupuuss/Mokkery', repository: 'central' },
  { coordinates: 'io.mockative:mockative', name: 'Mockative', category: 'testing', description: 'Mocks for interfaces, generated with KSP.', url: 'https://github.com/mockative/mockative', repository: 'central' },

  // Utilities
  { coordinates: 'org.jetbrains.kotlinx:kotlinx-datetime', name: 'kotlinx-datetime', category: 'utilities', description: 'Dates, time zones and formatting.', url: 'https://github.com/Kotlin/kotlinx-datetime', repository: 'central', official: true },
  { coordinates: 'org.jetbrains.kotlinx:kotlinx-collections-immutable', name: 'kotlinx.collections.immutable', category: 'utilities', description: 'Persistent and immutable lists, sets and maps; stable types for Compose.', url: 'https://github.com/Kotlin/kotlinx.collections.immutable', repository: 'central', official: true },
  { coordinates: 'org.jetbrains.kotlinx:atomicfu', name: 'atomicfu', category: 'utilities', description: 'Atomic operations and locks for every target.', url: 'https://github.com/Kotlin/kotlinx-atomicfu', repository: 'central', official: true },
  { coordinates: 'io.arrow-kt:arrow-core', name: 'Arrow', category: 'utilities', description: 'Typed errors with Either and Raise, plus functional data types.', url: 'https://github.com/arrow-kt/arrow', repository: 'central' },
  { coordinates: 'com.ionspin.kotlin:bignum', name: 'BigNum', category: 'utilities', description: 'Arbitrary-precision integers and decimals.', url: 'https://github.com/ionspin/kotlin-multiplatform-bignum', repository: 'central' },
  { coordinates: 'io.github.z4kn4fein:semver', name: 'semver', category: 'utilities', description: 'Semantic version parsing and comparison.', url: 'https://github.com/z4kn4fein/kotlin-semver', repository: 'central' },
];

/** Target groups shown in the finder, in display order. */
export type TargetGroup = 'android' | 'ios' | 'jvm' | 'macos' | 'js' | 'wasmJs' | 'linux' | 'windows' | 'watchos' | 'tvos' | 'wasmWasi' | 'androidNative';

export const TARGET_GROUPS: { id: TargetGroup; name: string }[] = [
  { id: 'android', name: 'Android' },
  { id: 'ios', name: 'iOS' },
  { id: 'jvm', name: 'JVM' },
  { id: 'macos', name: 'macOS' },
  { id: 'js', name: 'JS' },
  { id: 'wasmJs', name: 'Wasm' },
  { id: 'linux', name: 'Linux' },
  { id: 'windows', name: 'Windows' },
  { id: 'watchos', name: 'watchOS' },
  { id: 'tvos', name: 'tvOS' },
  { id: 'wasmWasi', name: 'WASI' },
  { id: 'androidNative', name: 'Android Native' },
];

export interface LibraryRelease {
  version: string;
  /** No stable release yet, so `version` is a pre-release. */
  prerelease: boolean;
  /** ISO date the version's module file was published. */
  released: string;
  targets: TargetGroup[];
  /**
   * No Android variant, but a JVM one: Gradle lets Android targets consume it, so
   * the library works on Android (and `targets` includes android).
   */
  androidViaJvm: boolean;
  /** Kotlin/Native targets as published, e.g. ios_arm64. */
  nativeTargets: string[];
}

export interface KmpLibrary extends LibrarySource, LibraryRelease {
  group: string;
  artifact: string;
}

const table = data as { checkedOn: string; libraries: Record<string, LibraryRelease> };

export const KMP_LIBRARIES_CHECKED_ON: string = table.checkedOn;

export const kmpLibraries: KmpLibrary[] = LIBRARY_SOURCES.filter((s) => table.libraries[s.coordinates]).map((s) => {
  const [group, artifact] = s.coordinates.split(':') as [string, string];
  return { ...s, ...table.libraries[s.coordinates]!, group, artifact };
});

/** Maps Gradle module metadata attributes to a target group. */
export function targetGroupOf(attributes: Record<string, string>): TargetGroup | null {
  const platform = attributes['org.jetbrains.kotlin.platform.type'];
  // The KMP Android library plugin publishes Android as platform jvm with an android environment.
  if (platform === 'androidJvm' || (platform === 'jvm' && attributes['org.gradle.jvm.environment'] === 'android')) return 'android';
  if (platform === 'jvm') return 'jvm';
  if (platform === 'js') return 'js';
  if (platform === 'wasm') return attributes['org.jetbrains.kotlin.wasm.target'] === 'wasi' ? 'wasmWasi' : 'wasmJs';
  if (platform !== 'native') return null;
  const t = attributes['org.jetbrains.kotlin.native.target'] ?? '';
  if (t.startsWith('ios_')) return 'ios';
  if (t.startsWith('macos_')) return 'macos';
  if (t.startsWith('watchos_')) return 'watchos';
  if (t.startsWith('tvos_')) return 'tvos';
  if (t.startsWith('linux_')) return 'linux';
  if (t.startsWith('mingw_')) return 'windows';
  if (t.startsWith('android_')) return 'androidNative';
  return null;
}

const GENERIC_ARTIFACTS = new Set(['runtime', 'core', 'api', 'common', 'library', 'lib', 'resources', 'permissions']);

/** The version catalog entry and the commonMain line for a library. */
export function gradleSnippets(lib: Pick<KmpLibrary, 'group' | 'artifact' | 'version'>): { toml: string; kts: string; direct: string } {
  // A bare `runtime` or `resources` alias says nothing and collides (SQLDelight and Metro both
  // publish `runtime`), so generic artifact names take the last part of their group.
  const base = GENERIC_ARTIFACTS.has(lib.artifact) ? `${lib.group.split('.').at(-1)}-${lib.artifact}` : lib.artifact;
  const alias = base.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const accessor = alias.replace(/-/g, '.');
  return {
    toml: `[versions]\n${alias} = "${lib.version}"\n\n[libraries]\n${alias} = { module = "${lib.group}:${lib.artifact}", version.ref = "${alias}" }`,
    kts: `kotlin {\n    sourceSets {\n        commonMain.dependencies {\n            implementation(libs.${accessor})\n        }\n    }\n}`,
    direct: `implementation("${lib.group}:${lib.artifact}:${lib.version}")`,
  };
}

/** The default hierarchy template's source set for each target group. */
export const SOURCE_SETS: Record<TargetGroup, string> = {
  android: 'androidMain',
  ios: 'iosMain',
  jvm: 'jvmMain',
  macos: 'macosMain',
  js: 'jsMain',
  wasmJs: 'wasmJsMain',
  linux: 'linuxMain',
  windows: 'mingwMain',
  watchos: 'watchosMain',
  tvos: 'tvosMain',
  wasmWasi: 'wasmWasiMain',
  androidNative: 'androidNativeMain',
};

export interface Bundle {
  /** A complete libs.versions.toml for the selection. */
  toml: string;
  /** The `sourceSets { … }` content, one block per source set. */
  sourceSets: string;
  /** The kotlin { } block for build.gradle.kts. */
  kts: string;
  /** Libraries that can't go in commonMain, with the project targets they lack. */
  partial: { lib: KmpLibrary; missing: TargetGroup[] }[];
}

/**
 * One catalog and dependency block for several libraries. A library that supports
 * every project target goes in commonMain; one that doesn't goes in the source sets
 * of the targets it does support, so the project still builds.
 */
export function bundleSnippets(libs: KmpLibrary[], projectTargets: TargetGroup[]): Bundle {
  const versions: string[] = [];
  const entries: string[] = [];
  const bySet = new Map<string, string[]>();
  const partial: Bundle['partial'] = [];
  const order = TARGET_GROUPS.map((t) => t.id).filter((t) => projectTargets.includes(t));
  for (const lib of [...libs].sort((a, b) => a.name.localeCompare(b.name))) {
    const s = gradleSnippets(lib);
    const [, v, l] = /\[versions\]\n(.+)\n\n\[libraries\]\n(.+)/.exec(s.toml)!;
    versions.push(v!);
    entries.push(l!);
    const line = /implementation\(.+\)/.exec(s.kts)![0];
    const missing = order.filter((t) => !lib.targets.includes(t));
    const sets = missing.length ? order.filter((t) => lib.targets.includes(t)).map((t) => SOURCE_SETS[t]) : ['commonMain'];
    if (missing.length) partial.push({ lib, missing });
    for (const set of sets) bySet.set(set, [...(bySet.get(set) ?? []), line]);
  }
  const setOrder = ['commonMain', ...order.map((t) => SOURCE_SETS[t])];
  const sourceSets = setOrder
    .filter((set) => bySet.has(set))
    .map((set) => `        ${set}.dependencies {\n${bySet.get(set)!.map((l) => `            ${l}`).join('\n')}\n        }`)
    .join('\n');
  return {
    toml: `[versions]\n${versions.join('\n')}\n\n[libraries]\n${entries.join('\n')}\n`,
    sourceSets,
    kts: `kotlin {\n    sourceSets {\n${sourceSets}\n    }\n}\n`,
    partial,
  };
}
