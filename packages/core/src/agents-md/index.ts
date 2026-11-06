/**
 * Generates an agent instructions file (AGENTS.md / CLAUDE.md / GEMINI.md)
 * for an Android or Kotlin Multiplatform project.
 */

export type ProjectType = 'android' | 'kmp';
export type KmpTarget = 'android' | 'ios' | 'desktop' | 'web' | 'server';
export type UiToolkit = 'compose' | 'views' | 'mixed' | 'compose-multiplatform' | 'native-ui';
export type Architecture = 'mvvm' | 'mvi' | 'none';
export type DependencyInjection = 'hilt' | 'koin' | 'manual';
export type Persistence = 'room' | 'sqldelight' | 'datastore';
export type Networking = 'retrofit' | 'ktor' | 'none';
export type Linter = 'android-lint' | 'ktlint' | 'detekt' | 'spotless';
export type AgentFile = 'AGENTS.md' | 'CLAUDE.md' | 'GEMINI.md';

export interface AgentsMdConfig {
  file: AgentFile;
  projectName: string;
  description: string;
  projectType: ProjectType;
  /** KMP only. */
  targets: KmpTarget[];
  ui: UiToolkit;
  architecture: Architecture;
  di: DependencyInjection;
  persistence: Persistence[];
  networking: Networking;
  linters: Linter[];
  /** Gradle module paths, one per entry, e.g. ":app", ":core:data". */
  modules: string[];
  /** Android app module used for build/install commands. */
  appModule: string;
  versionCatalog: boolean;
  conventionPlugins: boolean;
  screenshotTests: boolean;
  androidCli: boolean;
  notes: string;
}

export const defaultAgentsMdConfig: AgentsMdConfig = {
  file: 'AGENTS.md',
  projectName: 'MyApp',
  description: '',
  projectType: 'android',
  targets: ['android', 'ios'],
  ui: 'compose',
  architecture: 'mvvm',
  di: 'hilt',
  persistence: ['room', 'datastore'],
  networking: 'retrofit',
  linters: ['android-lint'],
  modules: [':app'],
  appModule: ':app',
  versionCatalog: true,
  conventionPlugins: false,
  screenshotTests: false,
  androidCli: true,
  notes: '',
};

const TARGET_LABEL: Record<KmpTarget, string> = {
  android: 'Android',
  ios: 'iOS',
  desktop: 'Desktop (JVM)',
  web: 'Web (Wasm/JS)',
  server: 'Server (JVM)',
};

const UI_LABEL: Record<UiToolkit, string> = {
  compose: 'Jetpack Compose',
  views: 'Android Views (XML layouts)',
  mixed: 'Jetpack Compose for new screens, Android Views for existing ones',
  'compose-multiplatform': 'Compose Multiplatform (shared UI)',
  'native-ui': 'Native UI per platform (Jetpack Compose on Android, SwiftUI on iOS) over shared logic',
};

const DI_LABEL: Record<DependencyInjection, string> = { hilt: 'Hilt', koin: 'Koin', manual: 'manual constructor injection' };
const PERSIST_LABEL: Record<Persistence, string> = { room: 'Room', sqldelight: 'SQLDelight', datastore: 'DataStore' };
const NET_LABEL: Record<Networking, string> = { retrofit: 'Retrofit + OkHttp', ktor: 'Ktor client', none: '' };
const ARCH_LABEL: Record<Architecture, string> = {
  mvvm: 'MVVM (screens observe state from ViewModels)',
  mvi: 'MVI (screens render one immutable state and send intents)',
  none: '',
};

const gradle = (task: string) => `./gradlew ${task}`;
const moduleTask = (module: string, task: string) => gradle(`${module === ':' ? '' : module}:${task}`.replace(/^:+/, ':'));

function bullets(items: (string | false | undefined | null)[]): string {
  return items.filter(Boolean).map((i) => `- ${i}`).join('\n');
}

/** Normalizes user-entered module paths: trims, adds a leading colon, drops blanks and duplicates. */
export function normalizeModules(modules: string[]): string[] {
  const out = modules
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => (m.startsWith(':') ? m : `:${m}`));
  return [...new Set(out)];
}

export function generateAgentsMd(input: Partial<AgentsMdConfig> = {}): string {
  const c: AgentsMdConfig = { ...defaultAgentsMdConfig, ...input };
  const kmp = c.projectType === 'kmp';
  const targets = kmp ? c.targets : (['android'] as KmpTarget[]);
  const hasAndroid = targets.includes('android');
  const hasIos = kmp && targets.includes('ios');
  const app = normalizeModules([c.appModule])[0] ?? ':app';
  const modules = normalizeModules(c.modules);
  const composeUi = ['compose', 'mixed', 'compose-multiplatform', 'native-ui'].includes(c.ui);
  const name = c.projectName.trim() || 'this project';

  const sections: string[] = [];

  // Title + overview
  sections.push(`# ${c.file === 'AGENTS.md' ? 'AGENTS.md' : c.file} — ${name}`);
  const overview = bullets([
    c.description.trim() || false,
    kmp
      ? `Kotlin Multiplatform project targeting ${targets.map((t) => TARGET_LABEL[t]).join(', ')}.`
      : 'Android app written in Kotlin.',
    `UI: ${UI_LABEL[c.ui]}.`,
    ARCH_LABEL[c.architecture] && `Architecture: ${ARCH_LABEL[c.architecture]}.`,
    `Dependency injection: ${DI_LABEL[c.di]}.`,
    c.persistence.length > 0 && `Persistence: ${c.persistence.map((p) => PERSIST_LABEL[p]).join(', ')}.`,
    c.networking !== 'none' && `Networking: ${NET_LABEL[c.networking]}.`,
    'Async: Kotlin coroutines and Flow.',
  ]);
  sections.push(`## Project overview\n\n${overview}`);

  // Layout
  if (modules.length) {
    const layout = [
      bullets(modules.map((m) => `\`${m}\``)),
      kmp &&
        'Shared code lives in `commonMain`. Platform code lives in `androidMain`, `iosMain`, `jvmMain` and so on. Tests mirror this in `commonTest` and the platform test source sets.',
      c.versionCatalog && 'Dependency versions are declared in `gradle/libs.versions.toml`. Reference them as `libs.*`; never hard-code versions in build files.',
      c.conventionPlugins && 'Shared Gradle configuration lives in convention plugins under `build-logic/`. Change build behaviour there, not by copying blocks between modules.',
    ]
      .filter(Boolean)
      .join('\n\n');
    sections.push(`## Repository layout\n\n${layout}`);
  }

  // Commands
  const commands: [string, string][] = [];
  if (hasAndroid) commands.push(['Build debug APK', moduleTask(app, 'assembleDebug')]);
  if (hasAndroid) commands.push(['Install on a connected device or emulator', moduleTask(app, 'installDebug')]);
  // KMP task names for single targets depend on how each target is declared, so
  // only the aggregate task is listed; iosSimulatorArm64Test is stable across templates.
  if (kmp) commands.push(['Run all tests for every target', gradle('allTests')]);
  if (!kmp) commands.push(['Run unit tests', gradle('testDebugUnitTest')]);
  if (hasIos) commands.push(['Run iOS simulator tests', gradle('iosSimulatorArm64Test')]);
  if (hasAndroid && composeUi) commands.push(['Run instrumented UI tests (needs a device)', moduleTask(app, 'connectedDebugAndroidTest')]);
  if (c.linters.includes('android-lint') && hasAndroid) commands.push(['Android Lint', moduleTask(app, 'lintDebug')]);
  if (c.linters.includes('ktlint')) commands.push(['ktlint', gradle('ktlintCheck')]);
  if (c.linters.includes('detekt')) commands.push(['detekt', gradle('detekt')]);
  if (c.linters.includes('spotless')) commands.push(['Format check (fix with spotlessApply)', gradle('spotlessCheck')]);
  const commandText = commands.map(([label, cmd]) => `- ${label}: \`${cmd}\``).join('\n');
  const verify = [
    kmp ? gradle('allTests') : gradle('testDebugUnitTest'),
    ...c.linters.filter((l) => l !== 'android-lint' || hasAndroid).map((l) =>
      l === 'android-lint' ? moduleTask(app, 'lintDebug') : l === 'ktlint' ? gradle('ktlintCheck') : l === 'detekt' ? gradle('detekt') : gradle('spotlessCheck'),
    ),
  ];
  sections.push(
    `## Build and test\n\n${commandText}\n\nBefore saying a task is done, run \`${verify.join(' && ')}\` and fix what it reports. Run single test classes with \`--tests "com.example.FooTest"\` while iterating.`,
  );

  // Android CLI
  if (c.androidCli && hasAndroid) {
    sections.push(
      `## Android CLI\n\n${bullets([
        'Prefer the Android CLI (`android`) for device, emulator, Compose preview and UI test work instead of driving `adb`, `emulator` and Android Studio by hand.',
        'Run `android --help` to discover commands and `android skills list` to see the skills it provides.',
        composeUi && 'Use it to render Compose previews and check UI changes before reporting them as done.',
      ])}`,
    );
  }

  // Conventions
  const conventions: (string | false)[] = [
    'Kotlin only for new code. Follow the official Kotlin coding conventions.',
    'Prefer immutable data: `val`, `data class`, read-only collections. Expose `StateFlow`/`Flow`, never `MutableStateFlow`, from public APIs.',
    'Do not block the main thread. Use `Dispatchers.IO` for disk and network work, injected rather than hard-coded where possible.',
    c.architecture === 'mvvm' && 'ViewModels expose one `StateFlow<UiState>` per screen and handle user events through plain functions.',
    c.architecture === 'mvi' && 'Each screen has one immutable `UiState`, a sealed `Intent`/`Event` type and a reducer. Side effects go through a separate one-off events channel.',
    composeUi && 'Composables are stateless where possible: hoist state, pass lambdas for events, keep business logic out of composables.',
    composeUi && 'Add a `@Preview` for every new screen-level composable, with realistic sample data.',
    c.ui === 'views' && 'Use ViewBinding. Do not add new `findViewById` calls or Kotlin synthetics.',
    c.ui === 'mixed' && 'Write new screens in Compose. Only touch XML layouts when changing an existing View-based screen.',
    c.di === 'hilt' && 'Use constructor injection with `@Inject`. ViewModels are `@HiltViewModel`. Bind interfaces in `@Module`s rather than constructing implementations in callers.',
    c.di === 'koin' && 'Declare dependencies in Koin modules and inject through constructors. Do not call `get()` inside business logic.',
    c.di === 'manual' && 'Pass dependencies through constructors. Do not introduce a DI framework or service locator.',
    c.persistence.includes('room') && 'Room schema changes need a version bump and a `Migration`, with a migration test. Never use `fallbackToDestructiveMigration` for release builds.',
    c.persistence.includes('sqldelight') && 'SQLDelight schema changes need a new `.sqm` migration file. Do not edit existing migrations.',
    c.persistence.includes('datastore') && 'Use DataStore for key-value settings. Do not add new `SharedPreferences` usage.',
    c.networking === 'retrofit' && 'Network calls go through Retrofit service interfaces in the data layer and return domain models, not DTOs, to callers.',
    c.networking === 'ktor' && 'Network calls go through a shared Ktor `HttpClient` in the data layer and return domain models, not DTOs, to callers.',
    kmp && 'Keep `commonMain` free of `java.*`, `android.*` and `platform.*` imports. Use `expect`/`actual` or an interface implemented per platform instead.',
    hasIos && 'Code exposed to Swift should use simple types. Avoid exposing `Flow` or `suspend` APIs without a Swift-friendly wrapper.',
    c.screenshotTests && 'UI changes must update screenshot tests. Review the image diffs before recording new goldens.',
    'Write a unit test for every bug fix and for new logic in ViewModels, use cases and repositories. Use fakes over mocks where practical.',
  ];
  sections.push(`## Conventions\n\n${bullets(conventions)}`);

  // Boundaries
  sections.push(
    `## Do not\n\n${bullets([
      'Commit secrets, keystores, `local.properties` or `google-services.json` changes.',
      'Change `minSdk`, `targetSdk`, `compileSdk`, the Kotlin version or the Android Gradle Plugin version unless asked.',
      'Add, remove or upgrade dependencies unless the task needs it. Say so when you do.',
      'Edit generated code under `build/` or files marked as generated.',
      'Disable, skip or delete failing tests to make a build pass.',
      'Reformat files you are not otherwise changing.',
    ])}`,
  );

  if (c.notes.trim()) sections.push(`## Project notes\n\n${c.notes.trim()}`);

  return `${sections.join('\n\n')}\n`;
}
