import type { Cheatsheet } from './types.ts';

const DOCS = 'https://developer.apple.com/documentation/xcode/running-your-app-in-simulator-or-on-a-device';
const KMP = 'https://kotlinlang.org/docs/multiplatform/multiplatform-run-tests.html';

export const simctl: Cheatsheet = {
  slug: 'simctl',
  title: 'iOS Simulator (simctl) cheatsheet for KMP developers',
  tagline: 'Drive the iOS Simulator from the terminal for KMP work: boot, install, deep links, permissions, push, screenshots.',
  intro:
    'xcrun simctl commands for Android and Kotlin Multiplatform developers testing the iOS side of a shared app, with the Gradle tasks that build the shared framework. Use “booted” as the device when one simulator is running. Checked with Xcode 27 (iOS 27 simulators).',
  tool: { name: 'xcrun simctl (Xcode)', version: 'Xcode 27, iOS 27 runtime', checkedOn: '2026-11-07', docs: DOCS },
  variables: [
    { key: 'simulator', label: 'Simulator', example: 'iPhone 18 Pro' },
    { key: 'bundle', label: 'Bundle ID', example: 'com.example.app' },
    { key: 'app', label: '.app path', example: 'build/Build/Products/Debug-iphonesimulator/App.app' },
    { key: 'url', label: 'Deep link', example: 'myapp://products/42' },
    { key: 'module', label: 'Shared module', example: 'shared' },
  ],
  related: ['/tools/swift-interop/', '/tools/expect-actual/', '/tools/info-plist/', '/tools/kmp-libraries/'],
  sections: [
    {
      id: 'devices',
      title: 'Simulators',
      entries: [
        { id: 'list', title: 'List available simulators', command: 'xcrun simctl list devices available', tags: ['list', 'devices', 'udid'], verify: 'run', docs: DOCS },
        { id: 'list-json', title: 'List simulators as JSON for scripts', command: 'xcrun simctl list devices available --json', tags: ['json', 'ci', 'scripts'], verify: 'run' },
        { id: 'boot', title: 'Boot a simulator and show its window', command: 'xcrun simctl boot "{{simulator}}"\nopen -a Simulator', tags: ['boot', 'start'], verify: 'help' },
        { id: 'shutdown', title: 'Shut down every simulator', command: 'xcrun simctl shutdown all', tags: ['shutdown', 'stop'], verify: 'help' },
        { id: 'erase', title: 'Factory-reset a simulator', command: 'xcrun simctl erase "{{simulator}}"', note: 'The simulator must be shut down first.', danger: 'destructive', tags: ['erase', 'reset', 'clean'], verify: 'help' },
        { id: 'create', title: 'Create a simulator', command: 'xcrun simctl create "Test iPhone" "{{simulator}}"', note: 'The second name is a device type from xcrun simctl list devicetypes.', tags: ['create', 'new'], verify: 'help' },
        { id: 'delete-unavailable', title: 'Delete simulators for old iOS versions', command: 'xcrun simctl delete unavailable', danger: 'destructive', note: 'Frees a lot of disk space after Xcode updates.', tags: ['delete', 'disk space', 'cleanup'], verify: 'help' },
      ],
    },
    {
      id: 'kmp',
      title: 'Build the shared Kotlin code',
      entries: [
        { id: 'link-framework', title: 'Build the shared framework for the simulator', command: './gradlew :{{module}}:linkDebugFrameworkIosSimulatorArm64', note: 'Output: {{module}}/build/bin/iosSimulatorArm64/debugFramework/. Task names follow your target and framework names.', tags: ['kmp', 'framework', 'gradle', 'link'], verify: 'none', docs: KMP },
        { id: 'ios-tests', title: 'Run shared tests on the iOS simulator', command: './gradlew :{{module}}:iosSimulatorArm64Test', note: 'Task names follow your KMP targets; list them with ./gradlew :{{module}}:tasks --all.', tags: ['kmp', 'tests', 'ios'], verify: 'none', docs: KMP },
        { id: 'xcframework', title: 'Build an XCFramework for every Apple target', command: './gradlew :{{module}}:assembleXCFramework', note: 'Only available when the build declares an XCFramework.', tags: ['kmp', 'xcframework', 'release'], verify: 'none', docs: 'https://kotlinlang.org/docs/multiplatform/multiplatform-build-native-binaries.html#build-xcframeworks' },
      ],
    },
    {
      id: 'apps',
      title: 'Install and run apps',
      entries: [
        { id: 'install', title: 'Install an app', command: 'xcrun simctl install booted {{app}}', tags: ['install', 'app'], verify: 'help' },
        { id: 'launch', title: 'Launch an app and stream its console output', command: 'xcrun simctl launch --console-pty booted {{bundle}}', note: 'Shows print() and NSLog output, and Kotlin println from shared code.', tags: ['launch', 'logs', 'console'], verify: 'help' },
        { id: 'relaunch', title: 'Restart a running app', command: 'xcrun simctl launch --terminate-running-process booted {{bundle}}', tags: ['restart', 'launch'], verify: 'help' },
        { id: 'terminate', title: 'Stop an app', command: 'xcrun simctl terminate booted {{bundle}}', tags: ['stop', 'kill'], verify: 'help' },
        { id: 'uninstall', title: 'Uninstall an app', command: 'xcrun simctl uninstall booted {{bundle}}', danger: 'destructive', tags: ['uninstall', 'remove'], verify: 'help' },
        { id: 'list-apps', title: 'List installed apps', command: 'xcrun simctl listapps booted', tags: ['apps', 'installed'], verify: 'help' },
        { id: 'data-container', title: 'Find an app’s data folder', command: 'xcrun simctl get_app_container booted {{bundle}} data', note: 'Open it in Finder with open "$(xcrun simctl get_app_container booted {{bundle}} data)".', tags: ['files', 'data', 'container', 'database'], verify: 'help' },
        { id: 'logs', title: 'Stream an app’s system logs', command: "xcrun simctl spawn booted log stream --level debug --predicate 'subsystem == \"{{bundle}}\"'", tags: ['logs', 'oslog', 'debug'], verify: 'help' },
      ],
    },
    {
      id: 'test',
      title: 'Test scenarios',
      entries: [
        { id: 'deep-link', title: 'Open a deep link or universal link', command: 'xcrun simctl openurl booted "{{url}}"', tags: ['deep link', 'url', 'universal link'], verify: 'help' },
        { id: 'grant', title: 'Grant a permission without the prompt', command: 'xcrun simctl privacy booted grant photos {{bundle}}', note: 'Services include camera, location, microphone, photos, contacts and calendar. Some changes restart the app.', tags: ['permission', 'privacy', 'grant'], verify: 'help' },
        { id: 'reset-privacy', title: 'Reset permissions so prompts show again', command: 'xcrun simctl privacy booted reset all {{bundle}}', danger: 'device-state', tags: ['permission', 'reset', 'prompt'], verify: 'help' },
        { id: 'push', title: 'Send a push notification', command: 'xcrun simctl push booted {{bundle}} payload.json', note: 'payload.json needs an "aps" object, e.g. {"aps":{"alert":"Hello"}}, and must be 4 KB or less.', tags: ['push', 'notification', 'apns'], verify: 'help' },
        { id: 'location', title: 'Set the simulated location', command: 'xcrun simctl location booted set 23.8103,90.4125', note: 'Latitude first, then longitude. Clear it with xcrun simctl location booted clear.', tags: ['location', 'gps'], verify: 'help' },
        { id: 'dark', title: 'Switch to dark appearance', command: 'xcrun simctl ui booted appearance dark', danger: 'device-state', tags: ['dark mode', 'appearance', 'theme'], verify: 'help' },
        { id: 'clipboard', title: 'Copy text to the simulator’s clipboard', command: 'echo "123456" | xcrun simctl pbcopy booted', tags: ['clipboard', 'paste', 'otp'], verify: 'help' },
        { id: 'add-media', title: 'Add photos to the library', command: 'xcrun simctl addmedia booted photo.jpg', tags: ['photos', 'media', 'library'], verify: 'help' },
      ],
    },
    {
      id: 'capture',
      title: 'Screenshots and store assets',
      entries: [
        { id: 'screenshot', title: 'Take a screenshot', command: 'xcrun simctl io booted screenshot screen.png', tags: ['screenshot', 'png', 'store'], verify: 'help' },
        { id: 'record', title: 'Record a video', command: 'xcrun simctl io booted recordVideo --codec=h264 demo.mp4', note: 'Press Ctrl+C to stop recording.', tags: ['video', 'record', 'preview'], verify: 'help' },
        { id: 'status-bar', title: 'Clean up the status bar for screenshots', command: 'xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3 --cellularBars 4', note: 'Undo with xcrun simctl status_bar booted clear.', danger: 'device-state', tags: ['status bar', 'screenshots', 'store', '9:41'], verify: 'help' },
      ],
    },
  ],
};
