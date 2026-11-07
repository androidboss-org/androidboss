import type { Cheatsheet } from './types.ts';

const CLI = 'https://docs.gradle.org/current/userguide/command_line_interface.html';
const AGP = 'https://developer.android.com/build/building-cmdline';

export const gradle: Cheatsheet = {
  slug: 'gradle',
  title: 'Gradle for Android cheatsheet',
  tagline: 'Gradle commands for Android projects: build variants, tests, dependency trees, build speed flags and R8 reports.',
  intro:
    'The ./gradlew commands Android developers use every day, grouped by task. Fill in your module and build variant once. Every task and flag was checked in a real AGP 9.5 project on Gradle 9.6.',
  tool: { name: 'Gradle and the Android Gradle plugin', version: 'Gradle 9.6.0, AGP 9.5.0', checkedOn: '2026-11-07', docs: AGP },
  variables: [
    { key: 'module', label: 'Module', example: 'app' },
    { key: 'variant', label: 'Build variant', example: 'debug' },
    { key: 'test', label: 'Test class', example: 'com.example.app.CartViewModelTest' },
    { key: 'dependency', label: 'Dependency', example: 'androidx.core:core-ktx' },
  ],
  related: ['/tools/version-catalog/', '/tools/compatibility-matrix/', '/tools/keep-rules/', '/tools/kmp-libraries/'],
  sections: [
    {
      id: 'build',
      title: 'Build and install',
      entries: [
        { id: 'assemble', title: 'Build an APK for one variant', command: './gradlew :{{module}}:assemble{{variant:cap}}', note: 'Output: {{module}}/build/outputs/apk/.', tags: ['build', 'apk', 'assemble'], verify: 'help', docs: AGP },
        { id: 'bundle', title: 'Build an app bundle for Play', command: './gradlew :{{module}}:bundleRelease', note: 'Output: {{module}}/build/outputs/bundle/release/.', tags: ['aab', 'bundle', 'release', 'play'], verify: 'help', docs: AGP },
        { id: 'install', title: 'Build and install on a connected device', command: './gradlew :{{module}}:install{{variant:cap}}', tags: ['install', 'device'], verify: 'help', docs: AGP },
        { id: 'uninstall', title: 'Uninstall every variant from the device', command: './gradlew :{{module}}:uninstallAll', danger: 'destructive', tags: ['uninstall', 'device'], verify: 'help' },
        { id: 'build-all', title: 'Build and test everything', command: './gradlew build', note: 'Runs assemble and check for every module and variant; slow on large projects.', tags: ['build', 'check', 'ci'], verify: 'help' },
        { id: 'clean', title: 'Delete build outputs', command: './gradlew clean', note: 'Rarely needed with the build cache; try --rerun-tasks first.', tags: ['clean'], verify: 'help' },
      ],
    },
    {
      id: 'test',
      title: 'Tests and checks',
      entries: [
        { id: 'unit', title: 'Run unit tests for one variant', command: './gradlew :{{module}}:test{{variant:cap}}UnitTest', tags: ['test', 'unit', 'junit'], verify: 'help', docs: 'https://developer.android.com/studio/test/command-line' },
        { id: 'one-test', title: 'Run one test class', command: './gradlew :{{module}}:test{{variant:cap}}UnitTest --tests "{{test}}"', note: 'Wildcards work: --tests "*CartViewModelTest".', tags: ['test', 'filter', 'single'], verify: 'help' },
        { id: 'instrumented', title: 'Run instrumented tests on a device', command: './gradlew :{{module}}:connected{{variant:cap}}AndroidTest', tags: ['test', 'instrumented', 'espresso', 'device'], verify: 'help' },
        { id: 'lint', title: 'Run Android lint', command: './gradlew :{{module}}:lint{{variant:cap}}', note: 'Report: {{module}}/build/reports/lint-results-{{variant}}.html.', tags: ['lint', 'check'], verify: 'help' },
        { id: 'check', title: 'Run every check', command: './gradlew check', tags: ['check', 'ci', 'lint', 'test'], verify: 'help' },
        { id: 'keep-going', title: 'Keep going after a failure', command: './gradlew check --continue', tags: ['continue', 'ci', 'failures'], verify: 'help', docs: CLI },
      ],
    },
    {
      id: 'inspect',
      title: 'Dependencies and project structure',
      entries: [
        { id: 'deps', title: 'Show the dependency tree', command: './gradlew :{{module}}:dependencies --configuration {{variant}}RuntimeClasspath', tags: ['dependencies', 'tree', 'versions'], verify: 'help', docs: 'https://docs.gradle.org/current/userguide/viewing_debugging_dependencies.html' },
        { id: 'insight', title: 'Find out why a dependency has its version', command: './gradlew :{{module}}:dependencyInsight --dependency {{dependency}} --configuration {{variant}}RuntimeClasspath', tags: ['dependencies', 'conflict', 'version', 'why'], verify: 'help' },
        { id: 'refresh', title: 'Re-download dependencies', command: './gradlew build --refresh-dependencies', tags: ['dependencies', 'snapshot', 'cache'], verify: 'help', docs: CLI },
        { id: 'tasks', title: 'List every task', command: './gradlew tasks --all', tags: ['tasks', 'list'], verify: 'help' },
        { id: 'task-help', title: 'Show what a task does and its options', command: './gradlew help --task :{{module}}:assemble{{variant:cap}}', tags: ['tasks', 'help', 'options'], verify: 'help' },
        { id: 'projects', title: 'List the modules', command: './gradlew projects', tags: ['modules', 'projects', 'structure'], verify: 'help' },
        { id: 'signing-report', title: 'Show signing certificates and SHA fingerprints', command: './gradlew :{{module}}:signingReport', note: 'Gives the SHA-1 and SHA-256 that Firebase, Google Sign-In and App Links ask for.', tags: ['signing', 'sha1', 'sha256', 'fingerprint'], verify: 'help' },
        { id: 'r8-config', title: 'Score your R8 configuration and keep rules', command: './gradlew :{{module}}:analyzeReleaseR8Config', since: 'AGP 9.3+', isNew: true, note: 'Ranks keep rules by how much they cost; announced at Android Dev Summit 2026. The task exists only when isMinifyEnabled = true for release.', tags: ['r8', 'proguard', 'keep rules', 'size'], verify: 'help', docs: 'https://goo.gle/r8-analyzer' },
      ],
    },
    {
      id: 'speed',
      title: 'Build speed',
      entries: [
        { id: 'config-cache', title: 'Reuse the build configuration between builds', command: './gradlew :{{module}}:assemble{{variant:cap}} --configuration-cache', note: 'Enable it for good with org.gradle.configuration-cache=true in gradle.properties.', tags: ['speed', 'configuration cache'], verify: 'help', docs: 'https://docs.gradle.org/current/userguide/configuration_cache.html' },
        { id: 'build-cache', title: 'Reuse task outputs from earlier builds', command: './gradlew :{{module}}:assemble{{variant:cap}} --build-cache', tags: ['speed', 'build cache'], verify: 'help', docs: CLI },
        { id: 'parallel', title: 'Build modules in parallel', command: './gradlew build --parallel', tags: ['speed', 'parallel'], verify: 'help' },
        { id: 'offline', title: 'Build without network access', command: './gradlew :{{module}}:assemble{{variant:cap}} --offline', tags: ['offline', 'network'], verify: 'help' },
        { id: 'skip-task', title: 'Skip a task', command: './gradlew build -x lint', tags: ['exclude', 'skip'], verify: 'help', docs: CLI },
        { id: 'rerun', title: 'Run every task again, ignoring up-to-date checks', command: './gradlew :{{module}}:assemble{{variant:cap}} --rerun-tasks', tags: ['rerun', 'cache', 'clean'], verify: 'help' },
        { id: 'scan', title: 'Publish a Build Scan to find slow tasks', command: './gradlew :{{module}}:assemble{{variant:cap}} --scan', note: 'Uploads build data to scans.gradle.com after you accept the terms.', tags: ['scan', 'profile', 'slow'], verify: 'help' },
        { id: 'profile', title: 'Write a local build-time report', command: './gradlew :{{module}}:assemble{{variant:cap}} --profile', note: 'Report: build/reports/profile/.', tags: ['profile', 'slow', 'timing'], verify: 'help' },
        { id: 'dry-run', title: 'See which tasks would run', command: './gradlew :{{module}}:assemble{{variant:cap}} --dry-run', tags: ['dry run', 'tasks'], verify: 'help' },
      ],
    },
    {
      id: 'troubleshoot',
      title: 'Troubleshooting',
      entries: [
        { id: 'stacktrace', title: 'Show the full error with a stack trace', command: './gradlew :{{module}}:assemble{{variant:cap}} --stacktrace', tags: ['error', 'stacktrace', 'debug'], verify: 'help' },
        { id: 'info', title: 'Show more detailed logs', command: './gradlew :{{module}}:assemble{{variant:cap}} --info', tags: ['logs', 'info', 'debug'], verify: 'help' },
        { id: 'warnings', title: 'Show every deprecation warning', command: './gradlew build --warning-mode all', note: 'Run before upgrading Gradle or AGP to see what will break.', tags: ['deprecation', 'warnings', 'upgrade'], verify: 'help' },
        { id: 'plain', title: 'Plain output for CI logs', command: './gradlew build --console=plain', tags: ['ci', 'logs', 'console'], verify: 'help' },
        { id: 'property', title: 'Pass a project property', command: './gradlew :{{module}}:assemble{{variant:cap}} -PversionCode=42', tags: ['property', 'ci', 'version'], verify: 'help' },
        { id: 'daemons', title: 'Check or stop Gradle daemons', command: './gradlew --status\n./gradlew --stop', tags: ['daemon', 'memory', 'stuck'], verify: 'help' },
        { id: 'version', title: 'Show Gradle, Kotlin and JVM versions', command: './gradlew --version', tags: ['version', 'jdk', 'kotlin'], verify: 'help' },
        { id: 'wrapper', title: 'Upgrade the Gradle wrapper', command: './gradlew wrapper --gradle-version 9.6.0', note: 'Run it twice: the second run uses the new version to update the wrapper files. Check AGP compatibility first.', tags: ['upgrade', 'wrapper', 'version'], verify: 'help', docs: 'https://docs.gradle.org/current/userguide/gradle_wrapper.html' },
      ],
    },
  ],
};
