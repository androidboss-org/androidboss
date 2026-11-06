import { describe, expect, it } from 'vitest';
import { buildCommand, defaults, groups, isVisible, shellQuote, tasks } from './index.ts';

const cmd = (id: string, values = {}, global = {}) => buildCommand(id, values, global).commands;

describe('shellQuote', () => {
  it('leaves safe values bare and quotes the rest', () => {
    expect(shellQuote(':app@debug')).toBe(':app@debug');
    expect(shellQuote('com.example.app')).toBe('com.example.app');
    expect(shellQuote('My Application')).toBe("'My Application'");
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote('')).toBe("''");
    expect(shellQuote('$HOME/a b')).toBe('"$HOME/a b"');
  });
});

// Each expectation reproduces an example from the official command reference.
describe('matches the documented examples', () => {
  it('create', () => {
    expect(cmd('create', { name: 'My Application', applicationId: 'com.example.myapp', output: './my-app' })).toEqual([
      "android create --name='My Application' --application-id=com.example.myapp --output=./my-app",
    ]);
    expect(cmd('create', { name: 'Wear App', minSdk: '30', output: './wear-app', template: 'empty-activity-compose' })).toEqual([
      "android create --name='Wear App' --min-sdk=30 --output=./wear-app empty-activity-compose",
    ]);
  });

  it('build, run and install', () => {
    expect(cmd('build')).toEqual(['android build :app']);
    expect(cmd('build', { reference: '' })).toEqual(['android build']);
    expect(cmd('build', { reference: '$HOME/my-app?:app@debug', buildArgs: '--offline' })).toEqual(['android build "$HOME/my-app?:app@debug" -- --offline']);
    expect(cmd('run')).toEqual(['android run :app']);
    expect(cmd('run', { apks: 'app/build/outputs/apk/debug/app-debug.apk' })).toEqual(['android run --apks=app/build/outputs/apk/debug/app-debug.apk']);
    expect(cmd('run', { debug: true, activity: '.ui.MainActivity', apks: 'app-debug.apk' })).toEqual(['android run --debug --activity=.ui.MainActivity --apks=app-debug.apk']);
    expect(cmd('install', { noDelta: true, device: 'emulator-5554', apks: 'base.apk,config.hdpi.apk' })).toEqual([
      'android install --use-delta-install=false --device=emulator-5554 --apks=base.apk,config.hdpi.apk',
    ]);
  });

  it('sdk install', () => {
    expect(cmd('sdk-install', { packages: 'emulator platforms/android-34' })).toEqual(['android sdk install emulator platforms/android-34']);
    expect(cmd('sdk-install', { packages: 'platforms/android-33@1', force: true })).toEqual(['android sdk install --force platforms/android-33@1']);
  });

  it('emulators', () => {
    expect(cmd('emulator-create', { profile: 'large_desktop' })).toEqual(['android emulator create large_desktop']);
    expect(cmd('emulator-start', { cold: true, headless: true })).toEqual(['android emulator start --cold --headless medium_phone']);
    expect(cmd('emulator-stop')).toEqual(['android emulator stop']);
  });

  it('screen and layout', () => {
    expect(cmd('screen-capture', { annotate: true, output: 'ui_annotated.png' })).toEqual(['android screen capture --annotate --output=ui_annotated.png']);
    expect(cmd('layout', { full: true, output: './hierarchy.json' })).toEqual(['android layout --pretty --full --output=./hierarchy.json']);
  });

  it('input', () => {
    expect(cmd('input')).toEqual(["android input tap 'text=Submit'"]);
    expect(cmd('input', { selector: 'class=android.widget.TextView', first: true })).toEqual(["android input tap --match=first 'class=android.widget.TextView'"]);
    expect(cmd('input', { action: 'text', text: 'user@example.com', selector: 'id=email_input', submit: true })).toEqual([
      "android input text user@example.com 'id=email_input' --submit",
    ]);
    expect(cmd('input', { action: 'scroll', selector: 'id=recycler_view', until: 'text=Settings' })).toEqual([
      "android input scroll 'id=recycler_view' --dir=down --until='text=Settings'",
    ]);
    expect(cmd('input', { action: 'swipe', selector: 'id=card_view', dir: 'left' })).toEqual(["android input swipe 'id=card_view' --dir=left"]);
    expect(cmd('input', { action: 'key', key: 'back' })).toEqual(['android input key back']);
  });

  it('previews', () => {
    expect(cmd('preview-list', { all: true, json: true })).toEqual(['android preview list :app --all --format=json']);
    expect(cmd('preview-render', { daemon: false })).toEqual(['android preview render :app --fqn=com.example.app.HomeScreenKt.HomeScreenPreview']);
    expect(cmd('preview-render', { tree: true, fqn: 'a.BKt.P1\n\n a.CKt.P2 ' })).toEqual(['android preview render :app --daemon --component-tree --fqn=a.BKt.P1 --fqn=a.CKt.P2']);
  });

  it('analyze and profile', () => {
    expect(cmd('analyze', { paths: 'app-release.aab', format: 'json' })).toEqual(['android analyze --format=json app-release.aab']);
    expect(cmd('analyze', { paths: 'library.aar', analysis: 'optimization' })).toEqual(['android analyze --analysis=optimization library.aar']);
    expect(cmd('systemtrace', { package: 'com.example.app' })[0]).toBe('android profiler systemtrace start --package=com.example.app --launch --output=startup.perfetto-trace');
    expect(cmd('systemtrace', { package: '' })[0]).toBe('android profiler systemtrace start --output=startup.perfetto-trace');
    expect(cmd('heapdump', { gc: true })).toEqual(['android profiler heapdump capture --process=com.example.app --gc --output=dump.hprof']);
  });

  it('crashes', () => {
    const app = '1:123456789012:android:0123456789abcdef';
    const [login, list, describe] = cmd('crashes', { app, type: 'anr' });
    expect(login).toBe('android auth login');
    expect(list).toBe(`android signals crashes list --firebase-app=${app} --type=anr --sort-by=users --limit=10`);
    expect(describe).toBe(`android signals crashes describe firebase/<issue-id> --firebase-app=${app} --include=stack`);
    expect(cmd('crashes', { app, timeframe: '24h', json: true })[1]).toContain('--timeframe=24h');
  });

  it('skills and docs', () => {
    expect(cmd('skills', { agents: 'gemini', skill: 'edge-to-edge' })).toEqual(['android skills add --agent=gemini edge-to-edge']);
    expect(cmd('skills')).toEqual(['android skills add --all']);
    expect(cmd('docs')[0]).toBe("android docs search 'How do I improve my app performance?'");
  });

  it('install-cli', () => {
    expect(cmd('install-cli')).toEqual(['brew tap android/tap', 'brew install android-cli', 'android update', 'android init']);
    expect(cmd('install-cli', { method: 'windows' })[0]).toBe('winget install --id Google.AndroidCLI');
  });
});

describe('buildCommand', () => {
  it('adds global options after android', () => {
    expect(cmd('build', {}, { sdk: '/opt/sdk', verbose: true })).toEqual(['android --sdk=/opt/sdk -v build :app']);
    expect(cmd('install-cli', {}, { sdk: '/opt/sdk' })[0]).toBe('brew tap android/tap');
  });

  it('reports missing required fields', () => {
    expect(buildCommand('crashes', {}).missing).toEqual(['Firebase app ID']);
    expect(buildCommand('create', {}).missing).toEqual([]);
  });

  it('has a valid definition for every task', () => {
    const ids = new Set<string>();
    for (const t of tasks) {
      expect(ids.has(t.id), t.id).toBe(false);
      ids.add(t.id);
      expect(groups).toContain(t.group);
      expect(t.docs).toMatch(/^https:\/\/developer\.android\.com\//);
      const out = buildCommand(t.id, defaults(t)).commands;
      expect(out.length, t.id).toBeGreaterThan(0);
      for (const c of out) expect(c).not.toMatch(/\s{2,}|undefined|\bfalse\b(?!\s*$)/);
    }
  });

  it('shows input fields that match the chosen action', () => {
    const input = tasks.find((t) => t.id === 'input')!;
    const visible = (action: string) => input.fields.filter((f) => isVisible(f, { action })).map((f) => f.id);
    expect(visible('key')).toEqual(['action', 'key', 'device']);
    expect(visible('text')).toEqual(['action', 'selector', 'text', 'submit', 'first', 'device']);
    for (const t of tasks) for (const f of t.fields) if (f.showWhen) expect(t.fields.some((o) => o.id === f.showWhen!.field), `${t.id}.${f.id}`).toBe(true);
  });

  it('throws for unknown tasks', () => {
    expect(() => buildCommand('nope', {})).toThrow();
  });
});
