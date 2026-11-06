/**
 * Prompt recipes: prompts for common Android jobs, for Claude Code, Codex,
 * Gemini CLI and other coding agents. Each one states the goal, the context,
 * the limits, how to check the result and what to report. Commands come from
 * the verified skills in ../skills; `{{key}}` placeholders map to `inputs`.
 */

export type RecipeTopic = 'Fix' | 'Test' | 'Upgrade' | 'Build UI' | 'Code' | 'Review' | 'Set up';

export interface RecipeInput {
  key: string;
  label: string;
  placeholder: string;
  /** Used when the field is left empty. */
  fallback: string;
}

export interface PromptRecipe {
  id: string;
  title: string;
  topic: RecipeTopic;
  /** When to reach for it, one sentence. */
  summary: string;
  inputs: RecipeInput[];
  prompt: string;
  /** Skills that make the agent better at it: ours or Google's official ids. */
  skills: string[];
  /** Related androidboss pages. */
  tools: { href: string; label: string }[];
  tips: string[];
}

const module: RecipeInput = { key: 'module', label: 'Module', placeholder: ':app', fallback: ':app' };

export const promptRecipes: readonly PromptRecipe[] = [
  {
    id: 'fix-crash',
    title: 'Fix a crash from a stack trace',
    topic: 'Fix',
    summary: 'You have a crash from Logcat, Play Console or Crashlytics and want the root cause fixed, not hidden.',
    inputs: [
      { key: 'crash', label: 'Crash (paste, or leave empty to read it from the device)', placeholder: 'FATAL EXCEPTION: main …', fallback: '(read the latest crash from the connected device with `adb logcat -d -b crash -v threadtime`)' },
      module,
    ],
    prompt: `Fix this crash in {{module}}:

{{crash}}

1. Find the root cause: the last "Caused by" and its first frame in our code. If the trace is obfuscated, ask me for the matching mapping.txt instead of guessing.
2. Before changing code, write the smallest test that fails with this exception and run it to confirm it fails for that reason.
3. Fix the cause. Don't catch and ignore the exception, and don't add !! or ?. without explaining why the value can be missing.
4. Run the new test and the module's other unit tests: ./gradlew {{module}}:testDebugUnitTest

Report the cause in two or three sentences, the files you changed, and the test results.`,
    skills: ['android-crash-triage', 'android-gradle-build-test'],
    tools: [
      { href: '/agents/crash-to-prompt/', label: 'Crash to Agent Prompt (redacts the crash first)' },
      { href: '/tools/r8-retrace/', label: 'R8 Retrace' },
    ],
    tips: ['Crashes can contain user data. Redact emails, tokens and IDs before pasting.', 'For an obfuscated release crash, retrace it first so the agent sees real names.'],
  },
  {
    id: 'diagnose-anr',
    title: 'Diagnose an ANR',
    topic: 'Fix',
    summary: 'Users report "app isn’t responding" and you have an ANR trace or the screen where it happens.',
    inputs: [
      { key: 'trace', label: 'Where the ANR trace is', placeholder: 'anr_2026-11-03.txt from adb bugreport', fallback: 'not available yet' },
      { key: 'where', label: 'When it happens', placeholder: 'tapping Checkout on the cart screen', fallback: 'unknown' },
    ],
    prompt: `The app shows "isn't responding" when: {{where}}.
ANR trace: {{trace}}.

1. If there's a trace, read the "main" thread (tid=1) first. Say what it's doing: waiting for a lock (and which thread holds it), a binder call, disk or database I/O, network, waiting on another thread, or idle.
2. If there's no trace, find work on the main thread in the code path for that action: disk or database access, network, runBlocking, synchronized blocks shared with background threads, or heavy loops.
3. Move the blocking work off the main thread with coroutines (Dispatchers.IO or Default) or fix the lock ordering. Keep UI updates on the main thread.
4. Build and run the unit tests for the modules you touched.

Report what blocked the main thread, the evidence (frames or code), and the change.`,
    skills: ['anr-audit-and-fix', 'android-gradle-build-test'],
    tools: [{ href: '/tools/logcat-viewer/', label: 'Logcat & ANR Viewer (explains the main thread)' }],
    tips: ['Get a trace with `adb bugreport bugreport.zip` and open FS/data/anr/ from the zip.', 'An idle main thread in the trace usually means the block ended before the dump, or it was a broadcast or service timeout.'],
  },
  {
    id: 'fix-ci-build',
    title: 'Fix a failing Gradle build or test',
    topic: 'Fix',
    summary: 'CI or a local build is red and you want the smallest correct fix.',
    inputs: [
      { key: 'command', label: 'Command that fails', placeholder: './gradlew :app:testDebugUnitTest', fallback: './gradlew build' },
      { key: 'error', label: 'First error (optional)', placeholder: 'e: …/CartViewModel.kt:42:5 Unresolved reference …', fallback: '(run the command to see it)' },
    ],
    prompt: `This fails: {{command}}
First error: {{error}}

1. Run the failing task alone with --console=plain, then --stacktrace if the cause isn't clear. Fix the first error first; later ones are often caused by it.
2. For test failures, read build/test-results/<task>/TEST-*.xml, not the HTML report.
3. Fix the cause in the code or build script. Don't skip, @Ignore or delete tests, don't lower lint severity, and don't disable the configuration cache to get past it. If a test is wrong, say why before changing it.
4. Rerun the same command until it passes.

Report the cause, the fix, and the command output summary.`,
    skills: ['android-gradle-build-test'],
    tools: [{ href: '/cli/troubleshooting/', label: 'Android CLI troubleshooting' }],
    tips: ['Paste only the first error. Thousands of log lines waste the agent’s context.'],
  },
  {
    id: 'viewmodel-tests',
    title: 'Add unit tests for a ViewModel',
    topic: 'Test',
    summary: 'A ViewModel or repository has no tests and you want useful ones, not snapshots of the implementation.',
    inputs: [
      { key: 'class', label: 'Class to test', placeholder: 'CartViewModel', fallback: 'the class I have open' },
      module,
    ],
    prompt: `Write unit tests for {{class}} in {{module}}.

1. Read the class and list the behaviours worth testing: initial state, each user action, loading, empty and error states, and edge cases like empty input or failed requests.
2. Use the test libraries the module already has. If it has none, ask before adding any. Replace dependencies with fakes, not mocks, where the project already does that. Use runTest and a test dispatcher for coroutines.
3. Test behaviour through public functions and the exposed state, not private fields.
4. Run them: ./gradlew {{module}}:testDebugUnitTest --tests "*{{class}}Test"

Report the cases covered, anything you couldn't test and why, and the result.`,
    skills: ['android-gradle-build-test', 'testing-setup'],
    tools: [],
    tips: ['If the class is hard to test, ask the agent to explain why before letting it refactor.'],
  },
  {
    id: 'journey-test',
    title: 'Write and run a Journey UI test',
    topic: 'Test',
    summary: 'You want an end-to-end check of a critical flow in plain words, run by the agent on a device.',
    inputs: [
      { key: 'flow', label: 'The flow', placeholder: 'search for soda, add the first result to the cart, check the badge shows 1', fallback: 'the main flow of the app' },
      module,
    ],
    prompt: `Write a Journey test for this flow: {{flow}}.

1. Save it as {{module}}/src/journeysTest/<name>.journey.xml with a <journey name>, a <description> and <actions xml:space="preserve">, one <action> per step.
2. Start after the app has launched; don't add a step that opens the app. Name things a user can see, not resource IDs. Start every check with "Verify".
3. Avoid long-press, double tap, rotation and conditional steps: Journeys don't fully support them yet.
4. Install the debug build, then run the Journey on the connected emulator with the Android CLI and write the report.

Report the file path, the result of each action, and any step that failed or was ambiguous.`,
    skills: ['android-cli', 'android-gradle-build-test'],
    tools: [{ href: '/cli/journeys-writer/', label: 'Journeys Writer' }, { href: '/cli/journeys/', label: 'Journeys guide' }],
    tips: ['Run `android init` once so the agent has the Android CLI skill.', 'Keep one flow per Journey.'],
  },
  {
    id: 'upgrade-dependencies',
    title: 'Upgrade Kotlin, AGP and Gradle safely',
    topic: 'Upgrade',
    summary: 'The build tools are behind and you want them current without a day of broken builds.',
    inputs: [{ key: 'scope', label: 'What to upgrade', placeholder: 'Gradle, AGP and Kotlin', fallback: 'Gradle, AGP, Kotlin, KSP and the Compose BOM' }],
    prompt: `Upgrade {{scope}} to the latest stable versions that work together.

1. List the current versions and confirm the project builds and its unit tests pass before changing anything.
2. Get target versions from the published Maven metadata, ignoring alpha, beta and RC releases, and check them against the official AGP, Kotlin and Compose compatibility tables.
3. Upgrade one step at a time: Gradle wrapper, then AGP, then Kotlin with all Kotlin plugins and the Compose compiler plugin, then KSP, then libraries. Build and run unit tests after each step with --warning-mode all.
4. If gradle-wrapper.properties pins distributionSha256Sum, pass the new checksum to the wrapper task.
5. Stop and tell me if a step needs code changes beyond small API renames, or if it's a major AGP version.

Report each change as old → new, the result after each step, and anything you left behind with the reason.`,
    skills: ['android-dependency-upgrade', 'agp-9-upgrade'],
    tools: [{ href: '/tools/compatibility-matrix/', label: 'Compatibility Matrix' }],
    tips: ['For the jump to AGP 9, use Google’s agp-9-upgrade skill (or JetBrains’ kotlin-tooling-agp9-migration for KMP).'],
  },
  {
    id: 'version-catalog',
    title: 'Move dependencies to a version catalog',
    topic: 'Upgrade',
    summary: 'Versions are repeated across build files and you want them in gradle/libs.versions.toml.',
    inputs: [module],
    prompt: `Move the dependency and plugin versions in {{module}} into gradle/libs.versions.toml and use libs.* accessors in its build file.

1. If the catalog exists, follow its naming. Give artifacts that release together a shared version (all androidx.lifecycle → lifecycle).
2. Keep BOM-managed libraries without a version. Use alias(libs.plugins.…) for plugins.
3. Leave versions that come from variables in place and list them for me.
4. Check before and after that the resolved versions are the same: ./gradlew {{module}}:dependencies --configuration debugRuntimeClasspath
5. Build: ./gradlew {{module}}:assembleDebug

Report the aliases you added and any version you couldn't move.`,
    skills: ['android-version-catalog'],
    tools: [{ href: '/tools/version-catalog/', label: 'Version Catalog Converter' }],
    tips: ['Do one module per run in large projects.'],
  },
  {
    id: 'xml-to-compose',
    title: 'Migrate an XML screen to Compose',
    topic: 'Build UI',
    summary: 'One screen or fragment is still XML and you want it in Compose without changing how it behaves.',
    inputs: [
      { key: 'screen', label: 'Screen', placeholder: 'ProfileFragment with fragment_profile.xml', fallback: 'the screen I have open' },
      { key: 'theme', label: 'Compose theme function', placeholder: 'AppTheme', fallback: 'the project’s existing Compose theme' },
    ],
    prompt: `Migrate {{screen}} from XML Views to Jetpack Compose.

1. Keep behaviour the same: the same data, states, click handling, navigation and accessibility labels. Keep the ViewModel; collect its state with collectAsStateWithLifecycle.
2. Use {{theme}} and existing colours, typography and dimensions instead of hard-coding values.
3. Make the composable stateless where you can (state in, events out) and add previews for the main states.
4. Remove the XML layout and view binding code only once nothing else uses them.
5. Build and run the module's unit tests, and run any existing UI tests for this screen.

Report what changed, anything that looks or behaves differently, and the results.`,
    skills: ['migrate-xml-views-to-jetpack-compose', 'android-gradle-build-test'],
    tools: [{ href: '/tools/compose-theme/', label: 'Material 3 Theme Generator' }],
    tips: ['Ask for a screenshot of the old and new screen on the emulator to compare them.'],
  },
  {
    id: 'compose-performance',
    title: 'Fix janky Compose scrolling',
    topic: 'Build UI',
    summary: 'A list or screen drops frames and you suspect too much recomposition.',
    inputs: [{ key: 'screen', label: 'Screen', placeholder: 'the feed LazyColumn in FeedScreen.kt', fallback: 'the screen I have open' }],
    prompt: `Scrolling {{screen}} is janky. Find and fix the cause.

1. Look for: lazy items without stable keys, unstable parameters (List, var properties, lambdas capturing changing values), state read too high in the tree, heavy work or allocations in composition, and image loading without a fixed size.
2. Explain each problem you find with the line, and why it causes recomposition or slow frames.
3. Fix them one at a time: add keys, use stable or immutable types, defer state reads (lambda modifiers, derivedStateOf), and move work into remember or the ViewModel.
4. Build and run the unit tests for the module.

Report the problems, the fixes, and how to check the result on a release build (Compose is much slower in debug).`,
    skills: ['jetpack-compose-performance', 'android-profiler'],
    tools: [],
    tips: ['Judge jank on a release build with a baseline profile, never on debug.'],
  },
  {
    id: 'edge-to-edge',
    title: 'Make the app edge to edge',
    topic: 'Build UI',
    summary: 'Targeting Android 15+ forces edge to edge and content now sits under the system bars.',
    inputs: [],
    prompt: `Make the app display correctly edge to edge.

1. Call enableEdgeToEdge() in each activity before setContent or setContentView.
2. Find content hidden under the status bar, navigation bar or display cutout, and apply insets: Scaffold's innerPadding, windowInsetsPadding or safeDrawingPadding in Compose, and ViewCompat.setOnApplyWindowInsetsListener for Views.
3. Keep backgrounds drawing behind the bars and keep text and buttons inside the safe area. Handle the keyboard with imePadding where there are text fields.
4. Build, install, and take screenshots on the emulator of the main screens in portrait and landscape.

Report the screens you changed and the screenshots.`,
    skills: ['edge-to-edge', 'android-cli'],
    tools: [],
    tips: ['Check landscape: the navigation bar and cutouts move to the sides.'],
  },
  {
    id: 'review-diff',
    title: 'Review a change for Android pitfalls',
    topic: 'Review',
    summary: 'Before merging, you want a second pair of eyes on lifecycle, threading and security problems.',
    inputs: [{ key: 'range', label: 'What to review', placeholder: 'git diff main...HEAD', fallback: 'git diff main...HEAD' }],
    prompt: `Review the changes in \`{{range}}\` for problems specific to Android. Don't change code; list findings.

Check for:
- Work on the main thread: disk, database, network, runBlocking, large JSON parsing.
- Lifecycle bugs: collecting flows without repeatOnLifecycle, holding Views, Activities or Contexts in long-lived objects, work continuing after onDestroyView.
- State that is lost on rotation or process death.
- Coroutines started in GlobalScope or without cancellation.
- Exported components, PendingIntent flags, permissions, and secrets or user data written to logs.
- Missing tests for new logic.

Report each finding with the file and line, why it's a problem, and a suggested fix, ordered by severity. Then say what you checked that looked fine.`,
    skills: ['android-intent-security', 'android-permissions-security', 'anr-audit-and-fix'],
    tools: [],
    tips: ['Ask for findings only; fixing comes in a separate prompt so you can choose what to fix.'],
  },
  {
    id: 'release-crash-r8',
    title: 'Fix a release-only crash after enabling R8',
    topic: 'Fix',
    summary: 'Debug works, the minified release build crashes, often with ClassNotFound or a serialization error.',
    inputs: [{ key: 'crash', label: 'Retraced crash', placeholder: 'kotlinx.serialization.SerializationException …', fallback: '(read it from the release build on the device)' }],
    prompt: `The release build crashes but debug doesn't. R8 is on.

{{crash}}

1. Make sure the trace is retraced with the mapping.txt of this build.
2. Find what R8 removed or renamed that's used by reflection: serialization models, Gson or Moshi classes, enums looked up by name, classes named in XML or the manifest, JNI.
3. Add the narrowest keep rule that fixes it to proguard-rules.pro, with a comment saying why. Prefer library-provided consumer rules or annotations (like @Keep or @Serializable with the plugin) over broad -keep class com.example.** rules.
4. Build the release variant, install it and repeat the steps that crashed.

Report the cause, the rule, and the result.`,
    skills: ['r8-analyzer', 'android-crash-triage'],
    tools: [{ href: '/tools/r8-retrace/', label: 'R8 Retrace' }],
    tips: ['Never fix this by turning off minification for release.'],
  },
  {
    id: 'agents-md',
    title: 'Write AGENTS.md for this project',
    topic: 'Set up',
    summary: 'The project has no agent instructions, so every session starts by rediscovering it.',
    inputs: [],
    prompt: `Write an AGENTS.md at the project root for coding agents.

1. Look at settings.gradle(.kts), the build files, the version catalog, the source folders and any CI workflow. Don't guess what you can read.
2. Include: what the app is in one line; modules and what each is for; architecture and libraries (UI, DI, networking, persistence); the exact commands to build, run unit tests, run lint and format code, which you ran to confirm they work; code conventions you can see in the code; and things not to do (files not to edit, secrets).
3. Keep it short: under 150 lines. Link to docs in the repo instead of copying them.
4. If CLAUDE.md exists, leave it and add a line to it that imports AGENTS.md (@AGENTS.md).

Report the commands you tested and anything you couldn't determine.`,
    skills: ['android-gradle-build-test'],
    tools: [
      { href: '/agents/agents-md-generator/', label: 'AGENTS.md Generator' },
      { href: '/agents/agent-readiness/', label: 'Agent Readiness Checker' },
    ],
    tips: ['Run the Agent Readiness Checker afterwards to see what else would help.'],
  },
  {
    id: 'kmp-expect-actual',
    title: 'Add a platform API to shared KMP code',
    topic: 'Code',
    summary: 'Shared Kotlin Multiplatform code needs something only the platform has, like a file path or device info.',
    inputs: [
      { key: 'feature', label: 'What the shared code needs', placeholder: 'the app version name', fallback: 'the platform API' },
      { key: 'shared', label: 'Shared module', placeholder: ':shared', fallback: ':shared' },
    ],
    prompt: `Shared code in {{shared}} needs {{feature}}.

1. Prefer an interface in commonMain with implementations passed in (through the existing DI) over expect/actual. Use expect/actual only for small, stateless functions or when the project already does.
2. Implement it for every target in the module (check the kotlin { } block), not only Android.
3. Add a commonTest test for code that uses it, with a fake.
4. Run the tests: ./gradlew {{shared}}:allTests (iOS tests only run on macOS; say if you couldn't run them).

Report the API you added, where each implementation lives, and the test results per target.`,
    skills: ['android-gradle-build-test'],
    tools: [],
    tips: ['List the targets in the prompt if the module has many, so none is forgotten.'],
  },
];

/** Replace {{key}} with the user's values or each input's fallback. */
export function fillRecipe(recipe: PromptRecipe, values: Record<string, string> = {}): string {
  return recipe.prompt.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const input = recipe.inputs.find((i) => i.key === key);
    const v = values[key]?.trim();
    return v || input?.fallback || `{{${key}}}`;
  });
}
