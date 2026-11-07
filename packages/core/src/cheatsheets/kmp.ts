import type { Cheatsheet, Entry } from './types.ts';

const DSL = 'https://kotlinlang.org/docs/multiplatform/multiplatform-dsl-reference.html';
const ANDROID_KMP = 'https://developer.android.com/kotlin/multiplatform/plugin';
const DEPS = 'https://kotlinlang.org/docs/multiplatform/multiplatform-add-dependencies.html';
const NATIVE = 'https://kotlinlang.org/docs/multiplatform/multiplatform-build-native-binaries.html';

const kts = (e: Omit<Entry, 'lang' | 'verify'>): Entry => ({ lang: 'kts', verify: 'compile', ...e });
const task = (e: Omit<Entry, 'verify'>): Entry => ({ verify: 'help', ...e });

/**
 * Gradle Kotlin DSL for a shared KMP module. cheatsheets.tools.test.ts (CHECK_KMP=1)
 * assembles the snippets into real projects by `context` (the block they belong in;
 * "#b" puts an entry in a second project when two entries can't coexist) and lets
 * Gradle configure them, then checks the task names against `tasks --all`.
 */
export const kmp: Cheatsheet = {
  slug: 'kmp-gradle',
  title: 'Kotlin Multiplatform Gradle cheatsheet',
  tagline: 'Gradle setup for a shared KMP module: targets, the AGP 9 Android plugin, iOS frameworks, dependencies and tasks.',
  intro:
    'The build.gradle.kts blocks a Kotlin Multiplatform shared module needs, using the Android-KMP library plugin that AGP 9 requires. Every snippet was configured together in a real project with Kotlin 2.4.21 and AGP 9.5.1.',
  tool: { name: 'Kotlin Gradle plugin and AGP', version: 'Kotlin 2.4.21, AGP 9.5.1, Gradle 9.9', checkedOn: '2026-11-07', docs: DSL },
  variables: [
    { key: 'module', label: 'Shared module', example: 'shared' },
    { key: 'namespace', label: 'Android namespace', example: 'com.example.shared' },
    { key: 'framework', label: 'iOS framework name', example: 'Shared' },
  ],
  related: ['/tools/expect-actual/', '/tools/swift-interop/', '/tools/kmp-libraries/', '/tools/compatibility-matrix/'],
  sections: [
    {
      id: 'setup',
      title: 'Plugins and versions',
      entries: [
        { id: 'catalog', title: 'Declare the plugins in the version catalog', lang: 'toml', verify: 'compile', context: 'file:gradle/libs.versions.toml', command: '[versions]\nkotlin = "2.4.21"\nagp = "9.5.1"\n\n[plugins]\nkotlinMultiplatform = { id = "org.jetbrains.kotlin.multiplatform", version.ref = "kotlin" }\nandroidKotlinMultiplatformLibrary = { id = "com.android.kotlin.multiplatform.library", version.ref = "agp" }', note: 'gradle/libs.versions.toml. Check that the Kotlin and AGP versions work together with the compatibility tool.', tags: ['version catalog', 'plugins', 'versions'], docs: 'https://docs.gradle.org/current/userguide/version_catalogs.html' },
        kts({ id: 'plugins', title: 'Apply the plugins to the shared module', context: 'plugins', command: 'plugins {\n    alias(libs.plugins.kotlinMultiplatform)\n    alias(libs.plugins.androidKotlinMultiplatformLibrary)\n}', note: 'With AGP 9, a KMP module uses com.android.kotlin.multiplatform.library instead of com.android.library.', since: 'AGP 9+', tags: ['plugins', 'agp 9', 'android library'], docs: ANDROID_KMP }),
      ],
    },
    {
      id: 'targets',
      title: 'Targets',
      entries: [
        kts({ id: 'android', title: 'Add the Android target', context: 'kotlin', command: 'android {\n    namespace = "{{namespace}}"\n    compileSdk = 36\n    minSdk = 24\n    withHostTest { }\n}', note: 'Inside kotlin { }. This replaces the old androidTarget() plus a separate android { } block.', since: 'AGP 9+', tags: ['android', 'target', 'namespace', 'minSdk'], docs: ANDROID_KMP }),
        kts({ id: 'ios', title: 'Add iOS targets with a framework for Xcode', context: 'kotlin', command: 'listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->\n    target.binaries.framework {\n        baseName = "{{framework}}"\n        isStatic = true\n    }\n}', note: 'Swift imports it as import {{framework}}. iosX64 is only needed for Intel Macs.', tags: ['ios', 'framework', 'xcode', 'static'], docs: NATIVE }),
        kts({ id: 'jvm', title: 'Add a desktop (JVM) target', context: 'kotlin', command: 'jvm()', tags: ['jvm', 'desktop', 'server'], docs: DSL }),
        kts({ id: 'wasm', title: 'Add a web target with Kotlin/Wasm', context: 'kotlin', command: '@OptIn(org.jetbrains.kotlin.gradle.ExperimentalWasmDsl::class)\nwasmJs {\n    browser()\n}', tags: ['wasm', 'web', 'browser'], docs: DSL }),
        kts({ id: 'xcframework', title: 'Build an XCFramework for distribution', context: 'kotlin#b', command: 'import org.jetbrains.kotlin.gradle.plugin.mpp.apple.XCFramework\n\nval xcf = XCFramework("{{framework}}")\nlistOf(iosArm64(), iosSimulatorArm64()).forEach { target ->\n    target.binaries.framework {\n        baseName = "{{framework}}"\n        xcf.add(this)\n    }\n}', note: 'The import goes at the top of build.gradle.kts, the rest inside kotlin { }. Use this instead of the plain framework block when you ship the framework as a Swift package or binary, then run assemble{{framework}}XCFramework.', tags: ['xcframework', 'ios', 'spm', 'distribution'], docs: `${NATIVE}#build-xcframeworks` }),
      ],
    },
    {
      id: 'dependencies',
      title: 'Dependencies',
      entries: [
        kts({ id: 'common-deps', title: 'Add a dependency for all platforms', context: 'sourceSets', command: 'commonMain.dependencies {\n    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.11.0")\n}', note: 'Find multiplatform libraries and their current versions with the KMP Library Finder.', tags: ['dependencies', 'commonMain', 'coroutines'], docs: DEPS }),
        kts({ id: 'platform-deps', title: 'Add platform-specific dependencies', context: 'sourceSets', command: 'androidMain.dependencies {\n    implementation("io.ktor:ktor-client-okhttp:3.6.1")\n}\niosMain.dependencies {\n    implementation("io.ktor:ktor-client-darwin:3.6.1")\n}', note: 'iosMain is shared by every iOS target through the default hierarchy template.', tags: ['dependencies', 'androidMain', 'iosMain', 'ktor'], docs: DEPS }),
        kts({ id: 'test-deps', title: 'Add test dependencies', context: 'sourceSets', command: 'commonTest.dependencies {\n    implementation(kotlin("test"))\n    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.11.0")\n}', tags: ['test', 'commonTest', 'kotlin-test'], docs: 'https://kotlinlang.org/docs/multiplatform/multiplatform-run-tests.html' }),
      ],
    },
    {
      id: 'compiler',
      title: 'Compiler options',
      entries: [
        kts({ id: 'expect-classes', title: 'Allow expect and actual classes', context: 'kotlin', command: 'compilerOptions {\n    freeCompilerArgs.add("-Xexpect-actual-classes")\n}', note: 'Silences the Beta warning for expect class. Functions and properties don’t need it.', tags: ['expect', 'actual', 'compiler', 'warning'], docs: 'https://kotlinlang.org/docs/multiplatform/multiplatform-expect-actual.html#expected-and-actual-classes' }),
        kts({ id: 'explicit-api', title: 'Require explicit visibility for a library API', context: 'kotlin', command: 'explicitApi()', note: 'Every public declaration must say public and declare its type, so nothing leaks by accident.', tags: ['explicit api', 'library', 'visibility'], docs: 'https://kotlinlang.org/docs/api-guidelines-simplicity.html#use-explicit-api-mode' }),
        kts({ id: 'warnings-errors', title: 'Treat warnings as errors', context: 'kotlin', command: 'compilerOptions {\n    allWarningsAsErrors.set(true)\n}', tags: ['warnings', 'compiler', 'ci'], docs: DSL }),
      ],
    },
    {
      id: 'tasks',
      title: 'Gradle tasks',
      entries: [
        task({ id: 'all-tests', title: 'Run the shared tests on every target', command: './gradlew :{{module}}:allTests', tags: ['test', 'all targets'], docs: 'https://kotlinlang.org/docs/multiplatform/multiplatform-run-tests.html' }),
        task({ id: 'jvm-tests', title: 'Run the shared tests on the JVM only (fastest)', command: './gradlew :{{module}}:jvmTest', tags: ['test', 'jvm', 'fast'], docs: 'https://kotlinlang.org/docs/multiplatform/multiplatform-run-tests.html' }),
        task({ id: 'android-tests', title: 'Run the Android host tests', command: './gradlew :{{module}}:testAndroidHostTest', note: 'Needs withHostTest { } in the android { } target block, as in the snippet above.', tags: ['test', 'android', 'unit'], docs: ANDROID_KMP }),
        task({ id: 'link-framework', title: 'Build the debug framework for the iOS simulator', command: './gradlew :{{module}}:linkDebugFrameworkIosSimulatorArm64', tags: ['ios', 'framework', 'simulator'], docs: NATIVE }),
        task({ id: 'assemble-xcf', title: 'Build the XCFramework', command: './gradlew :{{module}}:assemble{{framework}}XCFramework', note: 'The task is named after the XCFramework, and only exists once the XCFramework block above is declared.', tags: ['xcframework', 'release'], docs: `${NATIVE}#build-xcframeworks`, context: '#b' }),
        task({ id: 'wasm-tests', title: 'Run the shared tests in a browser (Wasm)', command: './gradlew :{{module}}:wasmJsBrowserTest', note: 'Uses a headless browser through Karma; install Chrome or set CHROME_BIN.', tags: ['wasm', 'web', 'test', 'browser'], docs: 'https://kotlinlang.org/docs/multiplatform/multiplatform-run-tests.html' }),
      ],
    },
  ],
};
