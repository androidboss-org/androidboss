import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { diagnoseAnr, filterEntries, findIssues, isAnrTrace, parseAnrTrace, parseLogcat, textMatcher, type ProcessDump, type ThreadDump } from './index.ts';

// Fixtures: real output from the Android 17 (API 37) emulator running the demo app in
// fixtures/anrdemo (built with javac, d8 and aapt2).
//   crash.threadtime.txt  adb logcat -v threadtime around a crash (--es mode crash)
//   anr.*.txt             the ActivityManager ANR report in threadtime, brief, time and year formats
//   deadlock.trace.txt    the app's section of /data/anr/anr_* after a main-thread deadlock
//   idle.trace.txt        another process from the same ANR dump, main thread idle
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseLogcat', () => {
  it('reads threadtime and joins multi-line messages', () => {
    const log = parseLogcat(fixture('crash.threadtime.txt'));
    expect(log.format).toBe('threadtime');
    expect(log.unparsed).toBe(0);
    const fatal = log.entries.find((e) => e.message.startsWith('FATAL EXCEPTION'))!;
    expect(fatal).toMatchObject({ date: '11-03', time: '04:04:52.264', pid: 19789, tid: 19789, level: 'E', tag: 'AndroidRuntime', pkg: 'dev.androidboss.anrdemo' });
    expect(fatal.message.split('\n')).toHaveLength(22);
    expect(fatal.message).toContain('Caused by: java.lang.NumberFormatException: For input string: "12,50"');
  });

  it('learns packages from Start proc and Process lines', () => {
    const log = parseLogcat(fixture('crash.threadtime.txt'));
    expect(log.packages.get(19789)).toBe('dev.androidboss.anrdemo');
    expect(log.entries.filter((e) => e.pid === 19789).every((e) => e.pkg === 'dev.androidboss.anrdemo')).toBe(true);
  });

  it.each([
    ['anr.threadtime.txt', 'threadtime'],
    ['anr.year.txt', 'year'],
    ['anr.time.txt', 'time'],
    ['anr.brief.txt', 'brief'],
  ])('reads %s as %s', (file, format) => {
    const log = parseLogcat(fixture(file));
    expect(log.format).toBe(format);
    expect(log.unparsed).toBe(0);
    expect(log.entries.some((e) => e.tag === 'ActivityManager' && e.message.startsWith('ANR in dev.androidboss.anrdemo'))).toBe(true);
  });

  it('reads the Android Studio Logcat format with indented continuation lines', () => {
    const text = [
      '2026-11-03 04:04:52.264 19789-19789 AndroidRuntime          dev.androidboss.anrdemo              E  FATAL EXCEPTION: main',
      '                                                                                                    Process: dev.androidboss.anrdemo, PID: 19789',
      '                                                                                                    java.lang.IllegalStateException: Cart total failed',
      '                                                                                                    \tat dev.androidboss.anrdemo.CartRepository.total(CartRepository.java:8)',
      '2026-11-03 04:04:52.283  1234-1234  Zygote                  system_process                       I  Process 19789 exited due to signal 9 (Killed)',
      '2026-11-03 04:04:52.300 19789-19801 OpenGLRenderer          dev.androidboss.anrdemo              D  Davey! duration=712ms',
    ].join('\n');
    const log = parseLogcat(text);
    expect(log.format).toBe('studio');
    expect(log.entries).toHaveLength(3);
    expect(log.entries[0]).toMatchObject({ pkg: 'dev.androidboss.anrdemo', tag: 'AndroidRuntime', level: 'E' });
    expect(log.entries[0]!.message).toBe('FATAL EXCEPTION: main\nProcess: dev.androidboss.anrdemo, PID: 19789\njava.lang.IllegalStateException: Cart total failed\n\tat dev.androidboss.anrdemo.CartRepository.total(CartRepository.java:8)');
    expect(log.entries[1]!.pkg).toBeUndefined();
  });

  it('skips buffer separators and counts lines it cannot place', () => {
    const log = parseLogcat('random preamble\n--------- beginning of main\nE/Tag: hello');
    expect(log.unparsed).toBe(1);
    expect(log.entries).toEqual([expect.objectContaining({ level: 'E', tag: 'Tag', message: 'hello' })]);
  });
});

describe('filterEntries', () => {
  const log = parseLogcat(fixture('crash.threadtime.txt'));

  it('filters by level, package, tags and text', () => {
    const app = filterEntries(log.entries, { pkg: 'dev.androidboss', minLevel: 'E' });
    expect(app.map((e) => e.tag)).toEqual(['AndroidRuntime']);
    expect(filterEntries(log.entries, { pkg: '19789', minLevel: 'W' }).map((e) => e.tag)).toEqual(['libc', 'HWUI', 'HWUI', 'HWUI', 'libc', 'AndroidRuntime']);
    expect(filterEntries(log.entries, { tags: 'activitym' }).every((e) => e.tag === 'ActivityManager')).toBe(true);
    expect(filterEntries(log.entries, { tags: '-windowmanager -activitymanager' }).some((e) => /^(WindowManager|ActivityManager)$/.test(e.tag))).toBe(false);
    expect(filterEntries(log.entries, { text: 'cart TOTAL' })).toHaveLength(1);
    expect(filterEntries(log.entries, { text: '/Caused by: \\w+\\.\\w+\\.NumberFormat/' })).toHaveLength(1);
  });

  it('reports bad regexes', () => {
    expect(() => textMatcher('/(/')).toThrow(/Invalid regex/);
  });
});

describe('findIssues', () => {
  it('finds the crash and the process death', () => {
    const issues = findIssues(parseLogcat(fixture('crash.threadtime.txt')));
    expect(issues.map((i) => [i.kind, i.title, i.pkg, i.pid])).toEqual([
      ['crash', 'java.lang.IllegalStateException: Cart total failed', 'dev.androidboss.anrdemo', 19789],
      ['died', 'dev.androidboss.anrdemo died', 'dev.androidboss.anrdemo', 19789],
    ]);
    expect(issues[0]!.text).toMatch(/^FATAL EXCEPTION: main\nProcess: dev\.androidboss\.anrdemo, PID: 19789\n/);
  });

  it.each(['anr.threadtime.txt', 'anr.time.txt', 'anr.year.txt', 'anr.brief.txt'])('finds the ANR and its reason in %s', (file) => {
    const anr = findIssues(parseLogcat(fixture(file))).find((i) => i.kind === 'anr')!;
    expect(anr).toMatchObject({ title: 'ANR in dev.androidboss.anrdemo', pkg: 'dev.androidboss.anrdemo', pid: 19849 });
    expect(anr.detail).toMatch(/^Input dispatching timed out .* Waited 5001ms for MotionEvent\)\.$/);
  });

  it('finds native crashes, OOMs, StrictMode and dropped frames', () => {
    const log = parseLogcat(
      [
        '11-03 10:00:00.000  4242  4242 F libc    : Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid 4242 (main), pid 4242 (com.example.shop)',
        '11-03 10:00:01.000  4300  4300 I Choreographer: Skipped 42 frames!  The application may be doing too much work on its main thread.',
        '11-03 10:00:02.000  4300  4300 I Choreographer: Skipped 8 frames!  The application may be doing too much work on its main thread.',
        '11-03 10:00:03.000  4300  4300 D StrictMode: StrictMode policy violation; ~duration=12 ms: android.os.strictmode.DiskReadViolation',
        '11-03 10:00:04.000  4300  4310 E art     : Throwing OutOfMemoryError "Failed to allocate a 1048592 byte allocation" java.lang.OutOfMemoryError: Failed to allocate',
      ].join('\n'),
    );
    expect(findIssues(log).map((i) => [i.kind, i.title])).toEqual([
      ['native-crash', 'Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR)'],
      ['jank', '50 frames skipped on main threads'],
      ['strictmode', 'StrictMode policy violation; ~duration=12 ms: android.os.strictmode.DiskReadViolation'],
      ['oom', 'java.lang.OutOfMemoryError: Failed to allocate'],
    ]);
  });
});

describe('ANR traces', () => {
  it('detects trace text', () => {
    expect(isAnrTrace(fixture('deadlock.trace.txt'))).toBe(true);
    expect(isAnrTrace(fixture('crash.threadtime.txt'))).toBe(false);
  });

  it('parses processes, threads, states and locks', () => {
    const [p] = parseAnrTrace(fixture('deadlock.trace.txt')).processes;
    expect(p).toMatchObject({ pid: 19849, cmdLine: 'dev.androidboss.anrdemo', time: '2026-11-03 04:05:10.449862511+0600' });
    expect(p!.threads).toHaveLength(23);
    const main = p!.threads.find((t) => t.name === 'main')!;
    expect(main).toMatchObject({ tid: 1, sysTid: 19849, state: 'Blocked', waitingFor: { lock: '0x0682be19', type: 'java.lang.Object', heldBy: 16 }, locked: ['0x0becbede'] });
    expect(main.frames[0]).toBe('at dev.androidboss.anrdemo.CartRepository.refresh(CartRepository.java:15)');
    expect(p!.threads.find((t) => t.tid === 16)).toMatchObject({ name: 'SyncWorker', state: 'Blocked', waitingFor: { heldBy: 1 }, locked: ['0x0682be19'] });
  });

  it('finds the real deadlock', () => {
    const d = diagnoseAnr(parseAnrTrace(fixture('deadlock.trace.txt')).processes[0]!);
    expect(d.cause).toBe('deadlock');
    expect(d.chain.map((t) => t.name)).toEqual(['main', 'SyncWorker']);
    expect(d.summary).toMatch(/^Deadlock: "main" \(tid 1\) → "SyncWorker" \(tid 16\) → "main" \(tid 1\)\./);
    expect(d.appFrame).toBe('at dev.androidboss.anrdemo.CartRepository.refresh(CartRepository.java:15)');
  });

  it('recognises an idle main thread', () => {
    const [p] = parseAnrTrace(fixture('idle.trace.txt')).processes;
    expect(p!.cmdLine).toBe('com.android.se');
    expect(diagnoseAnr(p!).cause).toBe('idle');
  });

  const proc = (main: Partial<ThreadDump>, others: ThreadDump[] = []): ProcessDump => ({
    pid: 1,
    cmdLine: 'com.example.shop',
    threads: [{ name: 'main', daemon: false, tid: 1, state: 'Runnable', frames: [], locked: [], ...main }, ...others],
  });

  it.each([
    ['binder', ['at android.os.BinderProxy.transactNative(Native method)', 'at android.os.BinderProxy.transact(BinderProxy.java:592)', 'at com.example.shop.Billing.query(Billing.kt:20)']],
    ['io', ['at libcore.io.Linux.read(Native method)', 'at java.io.FileInputStream.read(FileInputStream.java:300)', 'at com.example.shop.Cache.load(Cache.kt:12)']],
    ['io', ['at android.database.sqlite.SQLiteConnection.nativeExecuteForCursorWindow(Native method)', 'at com.example.shop.Dao.all(Dao.kt:9)']],
    ['network', ['at java.net.SocketInputStream.socketRead0(Native method)', 'at okhttp3.internal.connection.RealCall.execute(RealCall.kt:154)']],
    ['wait', ['at jdk.internal.misc.Unsafe.park(Native method)', 'at java.util.concurrent.locks.LockSupport.park(LockSupport.java:341)', 'at kotlinx.coroutines.BlockingCoroutine.joinBlocking(Builders.kt:88)']],
    ['sleep', ['at java.lang.Thread.sleep(Native method)', 'at com.example.shop.Splash.onCreate(Splash.kt:5)']],
  ])('recognises %s on the main thread', (cause, frames) => {
    const d = diagnoseAnr(proc({ state: 'Native', frames }));
    expect(d.cause).toBe(cause);
  });

  it('names the app frame when the main thread is busy', () => {
    const d = diagnoseAnr(proc({ frames: ['at java.util.ArrayList.sort(ArrayList.java:1)', 'at com.example.shop.Feed.rank(Feed.kt:77)'] }));
    expect(d).toMatchObject({ cause: 'busy', appFrame: 'at com.example.shop.Feed.rank(Feed.kt:77)' });
  });

  it('follows a lock held by a worker that is not deadlocked', () => {
    const worker: ThreadDump = { name: 'DefaultDispatcher-worker-3', daemon: true, tid: 22, state: 'Runnable', frames: ['at com.example.shop.Sync.run(Sync.kt:40)'], locked: ['0xaa'] };
    const d = diagnoseAnr(proc({ state: 'Blocked', waitingFor: { lock: '0xaa', type: 'java.lang.Object', heldBy: 22 } }, [worker]));
    expect(d.cause).toBe('lock');
    expect(d.summary).toContain('held by "DefaultDispatcher-worker-3" (tid 22), which is Runnable in com.example.shop.Sync.run(Sync.kt:40)');
  });
});
