/**
 * Android CLI command builder.
 *
 * Every command and flag here was checked against the official reference at
 * https://developer.android.com/tools/agents/android-cli/commands on CHECKED_ON,
 * for Android CLI CHECKED_VERSION. Update both when re-verifying.
 */

export const CHECKED_VERSION = '1.1.16717390';
export const CHECKED_ON = '2026-11-02';
const DOCS = 'https://developer.android.com/tools/agents/android-cli/commands';

export type FieldType = 'text' | 'select' | 'checkbox' | 'lines';

export interface Field {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
  default?: string | boolean;
  /** Only shown (and used) when another field has one of these values. */
  showWhen?: { field: string; values: string[] };
}

/** Whether a field applies given the current values. */
export function isVisible(field: Field, values: Values): boolean {
  if (!field.showWhen) return true;
  return field.showWhen.values.includes(String(values[field.showWhen.field] ?? ''));
}

export type Values = Record<string, string | boolean | undefined>;

export interface CliTask {
  id: string;
  group: TaskGroup;
  title: string;
  summary: string;
  docs: string;
  fields: Field[];
  /** Returns one command per line of output. */
  build(v: Values): string[];
  /** Extra guidance shown under the command. */
  note?: string;
}

export type TaskGroup = 'Setup' | 'Build and run' | 'Emulators' | 'Inspect and interact' | 'Compose previews' | 'Analyze and profile' | 'Field data' | 'Agents and docs';

export const groups: readonly TaskGroup[] = ['Setup', 'Build and run', 'Emulators', 'Inspect and interact', 'Compose previews', 'Analyze and profile', 'Field data', 'Agents and docs'];

// ---------------------------------------------------------------------------
// Helpers

/**
 * POSIX shell quoting: bare when safe, single quotes otherwise. Values that use
 * `$VAR` get double quotes so the shell still expands them (e.g. $HOME/my-app?:app).
 */
export function shellQuote(value: string): string {
  if (value === '') return "''";
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value;
  if (/\$[A-Za-z_{]/.test(value)) return `"${value.replace(/["\\`]/g, '\\$&')}"`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Selectors are always single-quoted, as the docs recommend. */
const selector = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const str = (v: Values, id: string) => (typeof v[id] === 'string' ? (v[id] as string).trim() : '');
const on = (v: Values, id: string) => v[id] === true;
const opt = (flag: string, value: string) => (value ? `${flag}=${shellQuote(value)}` : '');
const lines = (v: Values, id: string) =>
  str(v, id)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const join = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

const deviceField: Field = { id: 'device', label: 'Device serial', type: 'text', placeholder: 'emulator-5554', hint: 'Only needed when more than one device is connected (see adb devices).' };
const referenceField = (def = ':app'): Field => ({
  id: 'reference',
  label: 'Build reference',
  type: 'text',
  default: def,
  placeholder: ':app',
  hint: 'Gradle path, optionally with a variant (:app@release) or workspace (./app?:app). Empty = default target.',
});
const buildArgsField: Field = { id: 'buildArgs', label: 'Extra Gradle arguments', type: 'text', placeholder: '--offline', hint: 'Passed after -- to the build system.' };
const buildArgs = (v: Values) => (str(v, 'buildArgs') ? `-- ${str(v, 'buildArgs')}` : '');

// ---------------------------------------------------------------------------
// Tasks

export const tasks: readonly CliTask[] = [
  {
    id: 'install-cli',
    group: 'Setup',
    title: 'Install Android CLI',
    summary: 'Install the CLI, update it, and set it up for your agents.',
    docs: 'https://developer.android.com/tools/agents/android-cli/download',
    fields: [
      {
        id: 'method',
        label: 'Platform and method',
        type: 'select',
        default: 'mac-brew',
        options: [
          { value: 'mac-brew', label: 'macOS: Homebrew' },
          { value: 'mac-arm', label: 'macOS (Apple chip): install script' },
          { value: 'mac-intel', label: 'macOS (Intel): install script' },
          { value: 'linux', label: 'Linux: install script' },
          { value: 'linux-apt', label: 'Linux: apt-get' },
          { value: 'windows', label: 'Windows: winget' },
        ],
      },
    ],
    build(v) {
      const install: Record<string, string[]> = {
        'mac-brew': ['brew tap android/tap', 'brew install android-cli'],
        'mac-arm': ['curl -fsSL https://dl.google.com/android/cli/latest/darwin_arm64/install.sh | bash'],
        'mac-intel': ['curl -fsSL https://dl.google.com/android/cli/latest/darwin_x86_64/install.sh | bash'],
        linux: ['curl -fsSL https://dl.google.com/android/cli/latest/linux_x86_64/install.sh | bash'],
        'linux-apt': [
          'curl -fsSL https://dl.google.com/linux/linux_signing_key.pub | sudo tee /etc/apt/keyrings/google.asc >/dev/null',
          `sudo sh -c 'echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google.asc] http://dl.google.com/android/cli/latest/debian/ stable main" > /etc/apt/sources.list.d/android-cli.list'`,
          'sudo apt-get update',
          'sudo apt-get install android-cli',
        ],
        windows: ['winget install --id Google.AndroidCLI'],
      };
      return [...(install[str(v, 'method')] ?? install['mac-brew']!), 'android update', 'android init'];
    },
    note: '`android init` installs the android-cli skill into every agent it detects, so your agent knows how to use the CLI.',
  },
  {
    id: 'sdk-install',
    group: 'Setup',
    title: 'Install SDK packages',
    summary: 'Install platforms, build tools or the emulator into your SDK.',
    docs: `${DOCS}/sdk_install`,
    fields: [
      { id: 'packages', label: 'Packages', type: 'text', required: true, default: 'platform-tools platforms/android-36 emulator', placeholder: 'platforms/android-36', hint: 'Space-separated package paths; add @version to pin. Browse with android sdk list --all.' },
      { id: 'channel', label: 'Channel', type: 'select', default: '', options: [{ value: '', label: 'Stable' }, { value: '--beta', label: 'Beta' }, { value: '--canary', label: 'Canary' }] },
      { id: 'force', label: 'Allow downgrading (--force)', type: 'checkbox' },
    ],
    build: (v) => [join('android sdk install', str(v, 'channel'), on(v, 'force') && '--force', ...str(v, 'packages').split(/\s+/).map(shellQuote))],
  },
  {
    id: 'create',
    group: 'Setup',
    title: 'Create a project',
    summary: 'Scaffold a new app from an official template.',
    docs: `${DOCS}/create`,
    fields: [
      { id: 'name', label: 'App name', type: 'text', required: true, default: 'My Application' },
      { id: 'applicationId', label: 'Application ID', type: 'text', placeholder: 'com.example.myapp' },
      { id: 'namespace', label: 'Namespace', type: 'text', placeholder: 'com.example.myapp' },
      { id: 'minSdk', label: 'minSdk', type: 'text', placeholder: 'template default' },
      { id: 'output', label: 'Output directory', type: 'text', default: './my-app' },
      { id: 'template', label: 'Template', type: 'text', placeholder: 'empty-activity-compose', hint: 'Empty = the default Compose template. List them with android create --list.' },
      { id: 'force', label: 'Allow a non-empty directory (--force)', type: 'checkbox' },
    ],
    build: (v) => [
      join(
        'android create',
        opt('--name', str(v, 'name')),
        opt('--application-id', str(v, 'applicationId')),
        opt('--namespace', str(v, 'namespace')),
        opt('--min-sdk', str(v, 'minSdk')),
        opt('--output', str(v, 'output')),
        on(v, 'force') && '--force',
        str(v, 'template') && shellQuote(str(v, 'template')),
      ),
    ],
  },
  {
    id: 'build',
    group: 'Build and run',
    title: 'Build',
    summary: 'Build a target with Gradle (or Bazel), detected automatically.',
    docs: `${DOCS}/build`,
    fields: [referenceField(), buildArgsField],
    build: (v) => [join('android build', str(v, 'reference') && shellQuote(str(v, 'reference')), buildArgs(v))],
  },
  {
    id: 'run',
    group: 'Build and run',
    title: 'Build, install and launch',
    summary: 'Build from source or take APKs, deploy with delta install, and launch.',
    docs: `${DOCS}/run`,
    fields: [
      referenceField(),
      { id: 'apks', label: 'Or prebuilt APKs', type: 'text', placeholder: 'app/build/outputs/apk/debug/app-debug.apk', hint: 'Comma-separated. Used instead of the build reference when set.' },
      { id: 'activity', label: 'Activity', type: 'text', placeholder: '.ui.MainActivity', hint: 'Only needed with several launcher activities.' },
      deviceField,
      { id: 'debug', label: 'Wait for debugger (--debug)', type: 'checkbox' },
      { id: 'noDelta', label: 'Full install, no delta (--use-delta-install=false)', type: 'checkbox' },
      buildArgsField,
    ],
    build(v) {
      const apks = str(v, 'apks');
      return [
        join(
          'android run',
          opt('--device', str(v, 'device')),
          on(v, 'debug') && '--debug',
          opt('--activity', str(v, 'activity')),
          on(v, 'noDelta') && '--use-delta-install=false',
          apks ? opt('--apks', apks) : str(v, 'reference') && shellQuote(str(v, 'reference')),
          !apks && buildArgs(v),
        ),
      ];
    },
  },
  {
    id: 'install',
    group: 'Build and run',
    title: 'Install without launching',
    summary: 'Deploy an app with fast incremental install, without starting it.',
    docs: `${DOCS}/install`,
    fields: [
      referenceField(),
      { id: 'apks', label: 'Or prebuilt APKs', type: 'text', placeholder: 'base.apk,config.hdpi.apk', hint: 'Comma-separated. Used instead of the build reference when set.' },
      deviceField,
      { id: 'noDelta', label: 'Full install, no delta (--use-delta-install=false)', type: 'checkbox' },
      buildArgsField,
    ],
    build(v) {
      const apks = str(v, 'apks');
      return [
        join(
          'android install',
          on(v, 'noDelta') && '--use-delta-install=false',
          opt('--device', str(v, 'device')),
          apks ? opt('--apks', apks) : str(v, 'reference') && shellQuote(str(v, 'reference')),
          !apks && buildArgs(v),
        ),
      ];
    },
  },
  {
    id: 'emulator-create',
    group: 'Emulators',
    title: 'Create an emulator',
    summary: 'Create a virtual device from a hardware profile.',
    docs: `${DOCS}/emulator_create`,
    fields: [
      {
        id: 'profile',
        label: 'Profile',
        type: 'select',
        default: 'medium_phone',
        // Output of `android emulator create --list-profiles` on CHECKED_VERSION.
        options: ['small_phone', 'medium_phone', 'medium_tablet', 'small_desktop', 'medium_desktop', 'large_desktop'].map((p) => ({ value: p, label: p })),
        hint: 'Check for new ones with android emulator create --list-profiles.',
      },
    ],
    build: (v) => [join('android emulator create', str(v, 'profile') && shellQuote(str(v, 'profile')))],
  },
  {
    id: 'emulator-start',
    group: 'Emulators',
    title: 'Start an emulator',
    summary: 'Boot a virtual device and wait until it is ready.',
    docs: `${DOCS}/emulator_start`,
    fields: [
      { id: 'device', label: 'Virtual device', type: 'text', required: true, default: 'medium_phone', hint: 'Names come from android emulator list.' },
      { id: 'headless', label: 'No window (--headless), good for agents and CI', type: 'checkbox' },
      { id: 'cold', label: 'Cold boot, skip snapshot (--cold)', type: 'checkbox' },
    ],
    build: (v) => [join('android emulator start', on(v, 'cold') && '--cold', on(v, 'headless') && '--headless', shellQuote(str(v, 'device')))],
  },
  {
    id: 'emulator-stop',
    group: 'Emulators',
    title: 'Stop an emulator',
    summary: 'Shut down a running virtual device.',
    docs: `${DOCS}/emulator_stop`,
    fields: [{ id: 'device', label: 'Emulator name or serial', type: 'text', placeholder: 'emulator-5554', hint: 'Optional when only one emulator is running.' }],
    build: (v) => [join('android emulator stop', str(v, 'device') && shellQuote(str(v, 'device')))],
  },
  {
    id: 'screen-capture',
    group: 'Inspect and interact',
    title: 'Take a screenshot',
    summary: 'Save the device screen as PNG, optionally with numbered UI boxes.',
    docs: `${DOCS}/screen_capture`,
    fields: [
      { id: 'output', label: 'Output file', type: 'text', default: 'ui.png' },
      { id: 'annotate', label: 'Label UI elements #1, #2… (--annotate)', type: 'checkbox' },
      deviceField,
    ],
    build: (v) => [join('android screen capture', on(v, 'annotate') && '--annotate', opt('--device', str(v, 'device')), opt('--output', str(v, 'output')))],
    note: 'With --annotate, turn a label into coordinates: android screen resolve --screenshot=ui.png --string="input tap #3".',
  },
  {
    id: 'layout',
    group: 'Inspect and interact',
    title: 'Dump the UI tree',
    summary: 'Get the live view hierarchy as JSON: text, IDs, bounds, states.',
    docs: `${DOCS}/layout`,
    fields: [
      { id: 'pretty', label: 'Pretty-print (--pretty)', type: 'checkbox', default: true },
      { id: 'full', label: 'Include non-interactive elements (--full)', type: 'checkbox' },
      { id: 'flat', label: 'Flat list instead of tree (--flat)', type: 'checkbox' },
      { id: 'noIdle', label: "Don't wait for idle (--no-idle)", type: 'checkbox' },
      { id: 'output', label: 'Output file', type: 'text', placeholder: 'stdout' },
      deviceField,
    ],
    build: (v) => [
      join(
        'android layout',
        on(v, 'pretty') && '--pretty',
        on(v, 'full') && '--full',
        on(v, 'flat') && '--flat',
        on(v, 'noIdle') && '--no-idle',
        opt('--device', str(v, 'device')),
        opt('--output', str(v, 'output')),
      ),
    ],
  },
  {
    id: 'input',
    group: 'Inspect and interact',
    title: 'Tap, type, scroll or press keys',
    summary: 'Drive the UI by selector instead of pixel coordinates.',
    docs: `${DOCS}/input`,
    fields: [
      {
        id: 'action',
        label: 'Action',
        type: 'select',
        default: 'tap',
        options: [
          { value: 'tap', label: 'Tap' },
          { value: 'text', label: 'Type text' },
          { value: 'scroll', label: 'Scroll' },
          { value: 'swipe', label: 'Swipe' },
          { value: 'key', label: 'Press key' },
        ],
      },
      { id: 'selector', label: 'Selector', type: 'text', default: 'text=Submit', hint: 'Comma-separated key=value: text, id, class, desc, clickable…', showWhen: { field: 'action', values: ['tap', 'text', 'scroll', 'swipe'] } },
      { id: 'text', label: 'Text to type', type: 'text', placeholder: 'user@example.com', showWhen: { field: 'action', values: ['text'] } },
      { id: 'submit', label: 'Press Enter after typing (--submit)', type: 'checkbox', showWhen: { field: 'action', values: ['text'] } },
      { id: 'dir', label: 'Direction', type: 'select', default: 'down', options: ['up', 'down', 'left', 'right'].map((d) => ({ value: d, label: d })), showWhen: { field: 'action', values: ['scroll', 'swipe'] } },
      { id: 'until', label: 'Scroll until visible', type: 'text', placeholder: 'text=Settings', showWhen: { field: 'action', values: ['scroll'] } },
      { id: 'key', label: 'Key', type: 'select', default: 'back', options: ['back', 'home', 'recents', 'power', 'volume-up', 'volume-down', 'enter', 'tab', 'esc'].map((k) => ({ value: k, label: k })), showWhen: { field: 'action', values: ['key'] } },
      { id: 'first', label: 'Use first match if several (--match=first)', type: 'checkbox', showWhen: { field: 'action', values: ['tap', 'text', 'scroll', 'swipe'] } },
      deviceField,
    ],
    build(v) {
      const action = str(v, 'action') || 'tap';
      const base = join('android input', opt('--device', str(v, 'device')), action);
      const match = on(v, 'first') ? '--match=first' : '';
      const sel = selector(str(v, 'selector'));
      switch (action) {
        case 'text':
          return [join(base, match, shellQuote(str(v, 'text')), sel, on(v, 'submit') && '--submit')];
        case 'scroll':
          return [join(base, match, sel, `--dir=${str(v, 'dir') || 'down'}`, str(v, 'until') && `--until=${selector(str(v, 'until'))}`)];
        case 'swipe':
          return [join(base, match, sel, `--dir=${str(v, 'dir') || 'down'}`)];
        case 'key':
          return [join(base, str(v, 'key') || 'back')];
        default:
          return [join(base, match, sel)];
      }
    },
    note: 'Find selectors with android layout --pretty. Selector strings match case-insensitively; wrap in /…/ for a regex.',
  },
  {
    id: 'preview-list',
    group: 'Compose previews',
    title: 'List @Preview functions',
    summary: 'Find every Compose preview in a module, with no IDE.',
    docs: `${DOCS}/preview_list`,
    fields: [referenceField(), { id: 'all', label: 'Include dependent modules (--all)', type: 'checkbox' }, { id: 'json', label: 'JSON output', type: 'checkbox' }],
    build: (v) => [join('android preview list', str(v, 'reference') && shellQuote(str(v, 'reference')), on(v, 'all') && '--all', on(v, 'json') && '--format=json')],
  },
  {
    id: 'preview-render',
    group: 'Compose previews',
    title: 'Render previews to PNG',
    summary: 'Render Compose previews headlessly, optionally with the component tree.',
    docs: `${DOCS}/preview_render`,
    fields: [
      referenceField(),
      { id: 'fqn', label: 'Preview functions', type: 'lines', required: true, default: 'com.example.app.HomeScreenKt.HomeScreenPreview', hint: 'Fully qualified names, one per line. Get them from List @Preview functions.' },
      { id: 'output', label: 'Output directory', type: 'text', placeholder: 'temporary directory' },
      { id: 'tree', label: 'Also write component tree JSON (--component-tree)', type: 'checkbox' },
      { id: 'daemon', label: 'Keep renderer warm (--daemon)', type: 'checkbox', default: true },
    ],
    build: (v) => [
      join(
        'android preview render',
        str(v, 'reference') && shellQuote(str(v, 'reference')),
        on(v, 'daemon') && '--daemon',
        on(v, 'tree') && '--component-tree',
        opt('--output', str(v, 'output')),
        ...lines(v, 'fqn').map((f) => opt('--fqn', f)),
      ),
    ],
  },
  {
    id: 'analyze',
    group: 'Analyze and profile',
    title: 'Analyze an APK, AAB or library',
    summary: 'DEX size, R8 shrinking and optimization ratios, keep rule warnings.',
    docs: `${DOCS}/analyze`,
    fields: [
      { id: 'paths', label: 'Files', type: 'text', required: true, default: 'app/build/outputs/bundle/release/app-release.aab', hint: 'Space-separated .apk, .aab, .aar or .jar paths.' },
      { id: 'analysis', label: 'Analysis', type: 'select', default: '', options: [{ value: '', label: 'All' }, { value: 'basic', label: 'Basic (package, version)' }, { value: 'optimization', label: 'Optimization (R8, DEX)' }] },
      { id: 'format', label: 'Format', type: 'select', default: '', options: [{ value: '', label: 'Human readable' }, { value: 'json', label: 'JSON' }, { value: 'textproto', label: 'textproto' }] },
    ],
    build: (v) => [join('android analyze', opt('--analysis', str(v, 'analysis')), opt('--format', str(v, 'format')), ...str(v, 'paths').split(/\s+/).filter(Boolean).map(shellQuote))],
  },
  {
    id: 'systemtrace',
    group: 'Analyze and profile',
    title: 'Record a system trace',
    summary: 'Capture a Perfetto trace of startup or an interaction.',
    docs: `${DOCS}/profiler_systemtrace`,
    fields: [
      { id: 'package', label: 'Package', type: 'text', placeholder: 'com.example.app', hint: 'Empty = trace the whole system.' },
      { id: 'launch', label: 'Launch the app when recording starts (--launch)', type: 'checkbox', default: true },
      { id: 'output', label: 'Trace file', type: 'text', default: 'startup.perfetto-trace' },
    ],
    build: (v) => [
      join('android profiler systemtrace start', opt('--package', str(v, 'package')), str(v, 'package') && on(v, 'launch') && '--launch', opt('--output', str(v, 'output'))),
      '# reproduce what you want to trace, then:',
      'android profiler systemtrace stop',
    ],
    note: 'Open the trace at ui.perfetto.dev. If a session gets stuck: android profiler session terminate.',
  },
  {
    id: 'heapdump',
    group: 'Analyze and profile',
    title: 'Capture a heap dump',
    summary: 'Save an .hprof of a debuggable app (API 29+).',
    docs: `${DOCS}/profiler_heapdump`,
    fields: [
      { id: 'process', label: 'Process', type: 'text', required: true, default: 'com.example.app' },
      { id: 'gc', label: 'Run garbage collection first (--gc)', type: 'checkbox' },
      { id: 'output', label: 'Output file', type: 'text', default: 'dump.hprof' },
    ],
    build: (v) => [join('android profiler heapdump capture', opt('--process', str(v, 'process')), on(v, 'gc') && '--gc', opt('--output', str(v, 'output')))],
  },
  {
    id: 'crashes',
    group: 'Field data',
    title: 'Top Crashlytics issues',
    summary: 'List crashes, ANRs and non-fatals from the field, then inspect one.',
    docs: `${DOCS}/signals_crashes_list`,
    fields: [
      { id: 'app', label: 'Firebase app ID', type: 'text', required: true, placeholder: '1:123456789012:android:0123456789abcdef' },
      { id: 'type', label: 'Type', type: 'select', default: '', options: [{ value: '', label: 'All' }, { value: 'crash', label: 'Crashes' }, { value: 'anr', label: 'ANRs' }, { value: 'non-fatal', label: 'Non-fatals' }] },
      { id: 'timeframe', label: 'Timeframe', type: 'select', default: '7d', options: ['24h', '7d', '30d', '60d', '90d'].map((t) => ({ value: t, label: t })) },
      { id: 'sortBy', label: 'Sort by', type: 'select', default: 'users', options: [{ value: 'users', label: 'Users' }, { value: 'events', label: 'Events' }] },
      { id: 'limit', label: 'Limit', type: 'text', default: '10' },
      { id: 'appVersion', label: 'App version', type: 'text', placeholder: '1.2.3' },
      { id: 'json', label: 'JSON output', type: 'checkbox' },
    ],
    build(v) {
      const app = opt('--firebase-app', str(v, 'app'));
      return [
        'android auth login',
        join(
          'android signals crashes list',
          app,
          opt('--type', str(v, 'type')),
          str(v, 'timeframe') !== '7d' && opt('--timeframe', str(v, 'timeframe')),
          opt('--sort-by', str(v, 'sortBy')),
          opt('--limit', str(v, 'limit')),
          opt('--app-version', str(v, 'appVersion')),
          on(v, 'json') && '--format=json',
        ),
        join('android signals crashes describe firebase/<issue-id>', app, '--include=stack'),
      ];
    },
    note: 'Find your app ID with android signals context. Sign-in is only needed once.',
  },
  {
    id: 'skills',
    group: 'Agents and docs',
    title: 'Install Android skills',
    summary: 'Teach your agent official Android practices with skill packages.',
    docs: `${DOCS}/skills_add`,
    fields: [
      { id: 'skill', label: 'Skill', type: 'text', placeholder: 'edge-to-edge', hint: 'Empty = install all. Search with android skills find compose.' },
      { id: 'agents', label: 'Agents', type: 'text', placeholder: 'claude,codex,gemini', hint: 'Comma-separated. Empty = every agent detected on this machine.' },
      { id: 'project', label: 'Project root', type: 'text', placeholder: '.', hint: 'Install into this project instead of your user profile.' },
    ],
    build: (v) => [join('android skills add', opt('--agent', str(v, 'agents').replace(/\s+/g, '')), opt('--project', str(v, 'project')), str(v, 'skill') ? shellQuote(str(v, 'skill')) : '--all')],
  },
  {
    id: 'docs',
    group: 'Agents and docs',
    title: 'Search Android docs',
    summary: 'Query the official Android Knowledge Base from the terminal.',
    docs: `${DOCS}/docs`,
    fields: [{ id: 'query', label: 'Question or keywords', type: 'text', required: true, default: 'How do I improve my app performance?' }],
    build: (v) => [`android docs search ${shellQuote(str(v, 'query'))}`, 'android docs fetch kb://<url-from-results>'],
  },
];

export interface BuildResult {
  commands: string[];
  /** Labels of required fields left empty. */
  missing: string[];
}

export interface GlobalOptions {
  sdk?: string;
  verbose?: boolean;
}

/** Default values for a task's fields. */
export function defaults(task: CliTask): Values {
  return Object.fromEntries(task.fields.map((f) => [f.id, f.default ?? (f.type === 'checkbox' ? false : '')]));
}

export function buildCommand(taskId: string, values: Values, global: GlobalOptions = {}): BuildResult {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  const v = { ...defaults(task), ...values };
  const missing = task.fields.filter((f) => f.required && isVisible(f, v) && !str(v, f.id)).map((f) => f.label);
  const prefix = join(global.sdk?.trim() && opt('--sdk', global.sdk.trim()), global.verbose && '-v');
  const commands = task.build(v).map((c) => (prefix && c.startsWith('android ') ? `android ${prefix} ${c.slice(8)}` : c));
  return { commands, missing };
}
