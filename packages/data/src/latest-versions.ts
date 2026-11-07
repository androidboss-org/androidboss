/**
 * Newest stable versions of common Android and Kotlin dependencies and Gradle
 * plugins, so tools can say "a newer version exists". Rebuilt from the repositories
 * by scripts/update-latest-versions.mts:
 * - Google's Maven repository: every artifact in the AndroidX, Material, Firebase,
 *   Play services and Android Gradle plugin groups (from Google's group indexes);
 * - Maven Central: CENTRAL_LIBRARIES below plus every KMP Library Finder library;
 * - Gradle Plugin Portal / Google Maven: PLUGINS below, by plugin marker.
 */
import data from './latest-versions.json' with { type: 'json' };
import { catalogUpdates as updatesWith, type CatalogEntry, type CatalogUpdate, type LatestVersions } from './versions.ts';

export * from './versions.ts';

export const LATEST: LatestVersions = data as LatestVersions;
export const LATEST_CHECKED_ON = LATEST.checkedOn;

/** Google Maven groups included in full, by prefix. */
export const GOOGLE_GROUPS = ['androidx.', 'com.google.android.material', 'com.google.firebase', 'com.google.android.gms', 'com.android.tools.build'];

/** Maven Central libraries Android and KMP projects commonly hard-code. */
export const CENTRAL_LIBRARIES = [
  'org.jetbrains.kotlin:kotlin-stdlib',
  'org.jetbrains.kotlin:kotlin-reflect',
  'org.jetbrains.kotlin:kotlin-test',
  'org.jetbrains.kotlinx:kotlinx-coroutines-core',
  'org.jetbrains.kotlinx:kotlinx-coroutines-android',
  'org.jetbrains.kotlinx:kotlinx-coroutines-test',
  'org.jetbrains.kotlinx:kotlinx-coroutines-play-services',
  'org.jetbrains.kotlinx:kotlinx-serialization-json',
  'org.jetbrains.kotlinx:kotlinx-datetime',
  'org.jetbrains.kotlinx:kotlinx-collections-immutable',
  'com.squareup.okhttp3:okhttp',
  'com.squareup.okhttp3:logging-interceptor',
  'com.squareup.okhttp3:mockwebserver',
  'com.squareup.retrofit2:retrofit',
  'com.squareup.retrofit2:converter-gson',
  'com.squareup.retrofit2:converter-moshi',
  'com.squareup.retrofit2:converter-kotlinx-serialization',
  'com.squareup.moshi:moshi',
  'com.squareup.moshi:moshi-kotlin',
  'com.squareup.moshi:moshi-kotlin-codegen',
  'com.squareup.leakcanary:leakcanary-android',
  'com.google.code.gson:gson',
  'com.google.dagger:hilt-android',
  'com.google.dagger:hilt-compiler',
  'com.google.dagger:hilt-android-testing',
  'com.google.dagger:dagger',
  'com.google.dagger:dagger-compiler',
  'com.google.truth:truth',
  'com.jakewharton.timber:timber',
  'io.coil-kt.coil3:coil-compose',
  'io.coil-kt.coil3:coil-network-okhttp',
  'io.coil-kt:coil-compose',
  'com.github.bumptech.glide:glide',
  'io.insert-koin:koin-android',
  'io.insert-koin:koin-androidx-compose',
  'io.insert-koin:koin-core',
  'io.mockk:mockk',
  'io.mockk:mockk-android',
  'app.cash.turbine:turbine',
  'junit:junit',
  'org.junit.jupiter:junit-jupiter',
  'org.robolectric:robolectric',
  'org.mockito:mockito-core',
  'org.mockito.kotlin:mockito-kotlin',
  'com.airbnb.android:lottie',
  'com.airbnb.android:lottie-compose',
  'io.ktor:ktor-client-core',
  'io.ktor:ktor-client-okhttp',
  'io.ktor:ktor-client-content-negotiation',
  'io.ktor:ktor-serialization-kotlinx-json',
  'app.cash.sqldelight:android-driver',
  'com.google.devtools.ksp:symbol-processing-api',
];

/** Gradle plugin ids, resolved through their plugin marker artifact. */
export const PLUGINS: { id: string; repo: 'google' | 'portal' }[] = [
  { id: 'com.android.application', repo: 'google' },
  { id: 'com.android.library', repo: 'google' },
  { id: 'com.android.test', repo: 'google' },
  { id: 'com.android.dynamic-feature', repo: 'google' },
  { id: 'com.android.kotlin.multiplatform.library', repo: 'google' },
  { id: 'androidx.room', repo: 'google' },
  { id: 'androidx.navigation.safeargs.kotlin', repo: 'google' },
  { id: 'androidx.baselineprofile', repo: 'google' },
  { id: 'com.google.gms.google-services', repo: 'google' },
  { id: 'com.google.firebase.crashlytics', repo: 'google' },
  { id: 'com.google.firebase.firebase-perf', repo: 'google' },
  { id: 'org.jetbrains.kotlin.android', repo: 'portal' },
  { id: 'org.jetbrains.kotlin.jvm', repo: 'portal' },
  { id: 'org.jetbrains.kotlin.multiplatform', repo: 'portal' },
  { id: 'org.jetbrains.kotlin.plugin.compose', repo: 'portal' },
  { id: 'org.jetbrains.kotlin.plugin.serialization', repo: 'portal' },
  { id: 'org.jetbrains.kotlin.plugin.parcelize', repo: 'portal' },
  { id: 'org.jetbrains.kotlin.kapt', repo: 'portal' },
  { id: 'org.jetbrains.compose', repo: 'portal' },
  { id: 'com.google.devtools.ksp', repo: 'portal' },
  { id: 'com.google.dagger.hilt.android', repo: 'portal' },
  { id: 'app.cash.sqldelight', repo: 'portal' },
  { id: 'com.diffplug.spotless', repo: 'portal' },
  { id: 'io.gitlab.arturbosch.detekt', repo: 'portal' },
  { id: 'org.jlleitschuh.gradle.ktlint', repo: 'portal' },
  { id: 'com.github.ben-manes.versions', repo: 'portal' },
];

/** catalogUpdates against the bundled data. */
export const catalogUpdates = (entries: CatalogEntry[], latest: LatestVersions = LATEST): CatalogUpdate[] => updatesWith(entries, latest);

export const latestLibrary = (group: string, name: string) => LATEST.libraries[`${group}:${name}`];
export const latestPlugin = (id: string) => LATEST.plugins[id];
