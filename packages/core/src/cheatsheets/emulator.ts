import type { Cheatsheet } from './types.ts';

const EMU = 'https://developer.android.com/studio/run/emulator-commandline';
const AVD = 'https://developer.android.com/tools/avdmanager';
const CONSOLE = 'https://developer.android.com/studio/run/emulator-console';

export const emulator: Cheatsheet = {
  slug: 'emulator',
  title: 'Android Emulator cheatsheet',
  tagline: 'Create, start and control Android emulators from the terminal: headless CI boots, snapshots, location and battery.',
  intro:
    'Command-line control of the Android Emulator: sdkmanager and avdmanager to set it up, emulator flags to start it, and console commands through adb emu to fake location, battery and rotation. Checked with emulator 37 on an Android 17 image.',
  tool: { name: 'Android Emulator, avdmanager and sdkmanager', version: 'Emulator 37, cmdline-tools latest', checkedOn: '2026-11-07', docs: EMU },
  variables: [
    { key: 'avd', label: 'AVD name', example: 'Pixel_9_API_37' },
    { key: 'image', label: 'System image', example: 'system-images;android-37.0;google_apis_playstore;arm64-v8a' },
    { key: 'device', label: 'Device profile', example: 'pixel_9' },
    { key: 'snapshot', label: 'Snapshot', example: 'logged-in' },
  ],
  related: ['/cli/command-builder/', '/cheatsheets/adb/', '/cli/ci-cd/'],
  sections: [
    {
      id: 'setup',
      title: 'Install and create',
      entries: [
        { id: 'list-images', title: 'List system images you can install', command: 'sdkmanager --list | grep system-images', tags: ['system image', 'list', 'sdk'], verify: 'help', docs: 'https://developer.android.com/tools/sdkmanager' },
        { id: 'install-image', title: 'Install a system image and the emulator', command: 'sdkmanager "emulator" "{{image}}"', tags: ['install', 'system image', 'sdk'], verify: 'help', docs: 'https://developer.android.com/tools/sdkmanager' },
        { id: 'device-profiles', title: 'List device profiles (Pixel, tablet, foldable…)', command: 'avdmanager list device -c', tags: ['devices', 'profiles', 'list'], verify: 'run', docs: AVD },
        { id: 'create', title: 'Create an emulator', command: 'avdmanager create avd -n {{avd}} -k "{{image}}" -d {{device}}', tags: ['create', 'avd', 'new'], verify: 'help', docs: AVD },
        { id: 'list-avds', title: 'List your emulators', command: 'emulator -list-avds', tags: ['list', 'avd'], verify: 'run', docs: EMU },
        { id: 'delete', title: 'Delete an emulator', command: 'avdmanager delete avd -n {{avd}}', danger: 'destructive', tags: ['delete', 'avd', 'remove'], verify: 'help', docs: AVD },
      ],
    },
    {
      id: 'boot',
      title: 'Start',
      entries: [
        { id: 'start', title: 'Start an emulator', command: 'emulator -avd {{avd}}', tags: ['start', 'launch', 'boot'], verify: 'help', docs: EMU },
        { id: 'headless', title: 'Start headless for CI', command: 'emulator -avd {{avd}} -no-window -no-audio -no-boot-anim -no-snapshot-save', note: 'Wait for boot with adb wait-for-device shell getprop sys.boot_completed.', tags: ['ci', 'headless', 'no window'], verify: 'help', docs: EMU },
        { id: 'cold-boot', title: 'Cold boot, ignoring the saved snapshot', command: 'emulator -avd {{avd}} -no-snapshot-load', tags: ['cold boot', 'snapshot'], verify: 'help' },
        { id: 'wipe', title: 'Start with a factory-reset device', command: 'emulator -avd {{avd}} -wipe-data', danger: 'destructive', tags: ['wipe', 'reset', 'factory'], verify: 'help' },
        { id: 'read-only', title: 'Run several copies of one emulator', command: 'emulator -avd {{avd}} -read-only', note: 'Read-only instances can’t save snapshots; useful for parallel tests.', tags: ['parallel', 'multiple', 'ci'], verify: 'help' },
        { id: 'resources', title: 'Give the emulator more memory and CPU cores', command: 'emulator -avd {{avd}} -memory 4096 -cores 4', tags: ['memory', 'cpu', 'performance'], verify: 'help' },
        { id: 'gpu', title: 'Use software rendering (no GPU on the CI machine)', command: 'emulator -avd {{avd}} -gpu swiftshader_indirect', tags: ['gpu', 'ci', 'rendering'], verify: 'help', docs: 'https://developer.android.com/studio/run/emulator-acceleration#accel-graphics' },
        { id: 'network-speed', title: 'Start with a slow network', command: 'emulator -avd {{avd}} -netspeed edge -netdelay gprs', tags: ['network', 'slow', 'latency'], verify: 'help', docs: EMU },
        { id: 'logcat-file', title: 'Write the device log to a file from boot', command: 'emulator -avd {{avd}} -logcat "*:W" -logcat-output emulator.log', tags: ['logcat', 'boot', 'ci'], verify: 'help' },
        { id: 'writable', title: 'Start with a writable system partition', command: 'emulator -avd {{avd}} -writable-system', note: 'Needed before adb root and adb remount on Google APIs images; not available on Play Store images.', tags: ['root', 'system', 'remount'], verify: 'help' },
        { id: 'timezone', title: 'Start in another time zone', command: 'emulator -avd {{avd}} -timezone Asia/Dhaka', tags: ['timezone', 'locale', 'time'], verify: 'help' },
      ],
    },
    {
      id: 'console',
      title: 'Control a running emulator',
      entries: [
        { id: 'location', title: 'Set the GPS location', command: 'adb emu geo fix 90.4125 23.8103', note: 'Longitude comes first, then latitude.', tags: ['location', 'gps', 'geo'], verify: 'help', docs: CONSOLE },
        { id: 'battery', title: 'Fake a low, discharging battery', command: 'adb emu power capacity 15\nadb emu power status discharging', danger: 'device-state', tags: ['battery', 'power'], verify: 'help', docs: CONSOLE },
        { id: 'rotate', title: 'Rotate the device', command: 'adb emu rotate', tags: ['rotate', 'orientation', 'configuration change'], verify: 'help', docs: CONSOLE },
        { id: 'fold', title: 'Fold or unfold a foldable emulator', command: 'adb emu fold\nadb emu unfold', tags: ['foldable', 'fold', 'posture'], verify: 'help', docs: CONSOLE },
        { id: 'fingerprint', title: 'Touch the fingerprint sensor', command: 'adb emu finger touch 1', note: 'Enroll a fingerprint in Settings first; 1 is the finger ID.', tags: ['fingerprint', 'biometric', 'auth'], verify: 'help', docs: CONSOLE },
        { id: 'sms', title: 'Receive a text message', command: 'adb emu sms send 5551234 "Your code is 123456"', tags: ['sms', 'otp', 'message'], verify: 'help', docs: CONSOLE },
        { id: 'network-live', title: 'Slow the network while running', command: 'adb emu network speed edge\nadb emu network delay gprs', danger: 'device-state', tags: ['network', 'slow', 'throttle'], verify: 'help', docs: CONSOLE },
        { id: 'snapshot-save', title: 'Save a snapshot', command: 'adb emu avd snapshot save {{snapshot}}', tags: ['snapshot', 'save', 'state'], verify: 'help', docs: CONSOLE },
        { id: 'snapshot-load', title: 'Restore a snapshot', command: 'adb emu avd snapshot load {{snapshot}}', danger: 'device-state', tags: ['snapshot', 'load', 'restore'], verify: 'help', docs: CONSOLE },
        { id: 'kill', title: 'Shut down the emulator', command: 'adb emu kill', danger: 'device-state', tags: ['stop', 'kill', 'shutdown'], verify: 'help', docs: CONSOLE },
      ],
    },
  ],
};
