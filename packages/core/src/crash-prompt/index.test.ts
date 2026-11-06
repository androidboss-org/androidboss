import { describe, expect, it } from 'vitest';
import { crashToPrompt, defaultCrashPromptOptions, parseCrash, redact, stripLogcat } from './index.ts';

// `adb logcat -v threadtime` of a Compose app crashing in a click handler.
const THREADTIME = `11-03 10:15:22.101  4242  4242 D OkHttp  : --> GET https://api.example.com/v1/cart?user=42&sig=abc123 Authorization: Bearer abcdefghijklmnop.qrstuvwx
11-03 10:15:22.123  4242  4242 E AndroidRuntime: FATAL EXCEPTION: main
11-03 10:15:22.123  4242  4242 E AndroidRuntime: Process: com.example.shop, PID: 4242
11-03 10:15:22.123  4242  4242 E AndroidRuntime: java.lang.IllegalStateException: Cart total failed for jane.doe@example.com
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat com.example.shop.cart.CartViewModel.checkout(CartViewModel.kt:58)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat com.example.shop.cart.CartScreenKt$CartScreen$1$1.invoke(CartScreen.kt:41)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat com.example.shop.cart.CartScreenKt$CartScreen$1$1.invoke(CartScreen.kt:40)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat androidx.compose.foundation.ClickableNode$clickPointerInput$3.invoke-k-4lQ0M(Clickable.kt:639)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat androidx.compose.foundation.ClickableNode$clickPointerInput$3.invoke(Clickable.kt:633)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat androidx.compose.foundation.gestures.TapGestureDetectorKt$detectTapAndPress$2$1.invokeSuspend(TapGestureDetector.kt:255)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat kotlin.coroutines.jvm.internal.BaseContinuationImpl.resumeWith(ContinuationImpl.kt:33)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat kotlinx.coroutines.DispatchedTask.run(DispatchedTask.kt:108)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat android.os.Handler.handleCallback(Handler.java:959)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat android.os.Handler.dispatchMessage(Handler.java:100)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat android.os.Looper.loopOnce(Looper.java:232)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat android.os.Looper.loop(Looper.java:317)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat android.app.ActivityThread.main(ActivityThread.java:8705)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat java.lang.reflect.Method.invoke(Native Method)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat com.android.internal.os.RuntimeInit$MethodAndArgsCaller.run(RuntimeInit.java:580)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat com.android.internal.os.ZygoteInit.main(ZygoteInit.java:886)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: Caused by: java.lang.NumberFormatException: For input string: "12,50"
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat java.lang.FloatingDecimal.readJavaFormatString(FloatingDecimal.java:2054)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat java.lang.FloatingDecimal.parseDouble(FloatingDecimal.java:110)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat java.lang.Double.parseDouble(Double.java:792)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat com.example.shop.cart.PriceParser.parse(PriceParser.kt:12)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat com.example.shop.cart.CartViewModel.checkout(CartViewModel.kt:55)
11-03 10:15:22.123  4242  4242 E AndroidRuntime: \t... 16 more
11-03 10:15:22.130  4242  4242 I Process : Sending signal. PID: 4242 SIG: 9`;

// Android Studio Logcat panel format.
const STUDIO = `2026-11-03 10:15:22.123  4242-4242  AndroidRuntime          com.example.shop                     E  FATAL EXCEPTION: main
2026-11-03 10:15:22.123  4242-4242  AndroidRuntime          com.example.shop                     E  Process: com.example.shop, PID: 4242
2026-11-03 10:15:22.123  4242-4242  AndroidRuntime          com.example.shop                     E  kotlin.UninitializedPropertyAccessException: lateinit property repo has not been initialized
2026-11-03 10:15:22.123  4242-4242  AndroidRuntime          com.example.shop                     E  \tat com.example.shop.MainActivity.onCreate(MainActivity.kt:24)
2026-11-03 10:15:22.123  4242-4242  AndroidRuntime          com.example.shop                     E  \tat android.app.Activity.performCreate(Activity.java:9002)`;

describe('stripLogcat', () => {
  it('removes threadtime, Studio, brief and tag prefixes', () => {
    expect(stripLogcat('11-03 10:15:22.123  4242  4242 E AndroidRuntime: \tat a.B.c(B.kt:1)')).toBe('\tat a.B.c(B.kt:1)');
    expect(stripLogcat('2026-11-03 10:15:22.123  4242-4242  AndroidRuntime          com.example.shop                     E  FATAL EXCEPTION: main')).toBe('FATAL EXCEPTION: main');
    expect(stripLogcat('E/AndroidRuntime( 4242): Process: com.x, PID: 4242')).toBe('Process: com.x, PID: 4242');
    expect(stripLogcat('E/AndroidRuntime: FATAL EXCEPTION: main')).toBe('FATAL EXCEPTION: main');
    expect(stripLogcat('\tat a.B.c(B.kt:1)')).toBe('\tat a.B.c(B.kt:1)');
  });
});

describe('parseCrash', () => {
  it('reads thread, process, the cause chain and "more" counts from logcat', () => {
    const c = parseCrash(THREADTIME);
    expect(c.thread).toBe('main');
    expect(c.process).toBe('com.example.shop');
    expect(c.throwables.map((t) => [t.kind, t.type, t.frames.length, t.more])).toEqual([
      ['root', 'java.lang.IllegalStateException', 16, 0],
      ['caused', 'java.lang.NumberFormatException', 5, 16],
    ]);
    expect(c.throwables[1]!.message).toBe('For input string: "12,50"');
    expect(c.throwables[0]!.frames[1]).toMatchObject({ className: 'com.example.shop.cart.CartScreenKt$CartScreen$1$1', method: 'invoke', location: 'CartScreen.kt:41' });
  });

  it('keeps multi-line exception messages', () => {
    const c = parseCrash('java.lang.IllegalArgumentException: Bad state\nline two of the message\n\tat com.x.A.b(A.kt:3)');
    expect(c.throwables[0]!.message).toBe('Bad state\nline two of the message');
    expect(c.throwables[0]!.frames).toHaveLength(1);
  });

  it('reads Suppressed exceptions and plain traces without a header', () => {
    const c = parseCrash('kotlinx.coroutines.JobCancellationException: Job was cancelled\n\tat com.x.A.b(A.kt:3)\n\tSuppressed: java.io.IOException: closed\n\t\tat com.x.C.d(C.kt:9)');
    expect(c.throwables.map((t) => t.kind)).toEqual(['root', 'suppressed']);
    expect(c.throwables[1]!.frames[0]!.location).toBe('C.kt:9');
  });

  it('flags native crashes', () => {
    expect(parseCrash('Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid 4242').native).toBe(true);
  });
});

describe('redact', () => {
  const all = defaultCrashPromptOptions.redact;
  const r = (s: string) => redact(s, all);

  it('replaces emails, tokens, keys, JWTs and URL queries', () => {
    expect(r('user jane.doe+test@example.co.uk failed')).toBe('user <email> failed');
    expect(r('Authorization: Bearer abcdefghijklmnop.qrstuvwx')).toBe('Authorization: Bearer <redacted>');
    expect(r('{"access_token": "s3cr3tvalue"}')).toBe('{"access_token": "<redacted>"}');
    expect(r('password=hunter22 next')).toBe('password=<redacted> next');
    expect(r(`key AIza${'B'.repeat(35)} end`)).toBe('key <api-key> end');
    expect(r('ghp_' + 'a1'.repeat(18))).toBe('<api-key>');
    expect(r('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe('<api-key>');
    expect(r('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')).toBe('<jwt>');
    expect(r('GET https://u:p@api.example.com/v1/cart?user=42&sig=abc')).toBe('GET https://<user>@api.example.com/v1/cart?<query>');
  });

  it('replaces IPs, user names in paths, phone numbers and IDs', () => {
    expect(r('connect to 192.168.1.20 failed, 127.0.0.1 ok')).toBe('connect to <ip> failed, 127.0.0.1 ok');
    expect(r('/Users/jane/AndroidStudioProjects/shop and C:\\Users\\bob\\x')).toBe('/Users/<user>/AndroidStudioProjects/shop and C:\\Users\\<user>\\x');
    expect(r('call +1 415-555-0132 now')).toBe('call <phone> now');
    expect(r('id 123e4567-e89b-12d3-a456-426614174000 android_id=9774d56d682e549c')).toBe('id <uuid> android_id=<id>');
  });

  it('leaves stack frames, versions and line numbers alone', () => {
    const frames = '\tat com.example.shop.cart.CartScreenKt$CartScreen$1$1.invoke-k-4lQ0M(Clickable.kt:639)\nVersion 2.4.21 build 10234 PID: 4242';
    expect(r(frames)).toBe(frames);
  });

  it('respects disabled kinds and counts replacements', () => {
    const counts = {};
    expect(redact('a@b.co 10.0.0.1', { ...all, ip: false }, counts)).toBe('<email> 10.0.0.1');
    expect(counts).toEqual({ email: 1 });
  });
});

describe('crashToPrompt', () => {
  it('builds a trimmed, redacted prompt from logcat', () => {
    const r = crashToPrompt(THREADTIME);
    expect(r.appPackage).toBe('com.example.shop');
    expect(r.rootCause).toEqual({ type: 'java.lang.NumberFormatException', message: 'For input string: "12,50"' });
    expect(r.files).toEqual(['com/example/shop/cart/CartViewModel.kt:58', 'com/example/shop/cart/CartScreen.kt:41', 'com/example/shop/cart/CartScreen.kt:40', 'com/example/shop/cart/PriceParser.kt:12', 'com/example/shop/cart/CartViewModel.kt:55']);
    expect(r.redactions).toEqual({ email: 1 });
    expect(r.obfuscated).toBe(false);
    expect(r.framesTotal).toBe(21);
    expect(r.trace).toBe(`FATAL EXCEPTION: main
Process: com.example.shop
java.lang.IllegalStateException: Cart total failed for <email>
\tat com.example.shop.cart.CartViewModel.checkout(CartViewModel.kt:58)
\tat com.example.shop.cart.CartScreenKt$CartScreen$1$1.invoke(CartScreen.kt:41)
\tat com.example.shop.cart.CartScreenKt$CartScreen$1$1.invoke(CartScreen.kt:40)
\t... 13 framework frames (androidx.compose, kotlin.coroutines, kotlinx.coroutines)
Caused by: java.lang.NumberFormatException: For input string: "12,50"
\tat java.lang.FloatingDecimal.readJavaFormatString(FloatingDecimal.java:2054)
\tat java.lang.FloatingDecimal.parseDouble(FloatingDecimal.java:110)
\tat java.lang.Double.parseDouble(Double.java:792)
\tat com.example.shop.cart.PriceParser.parse(PriceParser.kt:12)
\tat com.example.shop.cart.CartViewModel.checkout(CartViewModel.kt:55)
\t... 16 more`);
    expect(r.prompt).toContain('My Android app (`com.example.shop`) crashes on the `main` thread.');
    expect(r.prompt).toContain('- Root cause: `java.lang.NumberFormatException: For input string: "12,50"`');
    expect(r.prompt).toContain('Framework frames are folded (8 of 21 frames shown).');
    expect(r.prompt).toContain('Find the root cause of this crash and fix it.');
    // Lines outside the crash (the OkHttp log with a token) are not included.
    expect(r.prompt).not.toContain('OkHttp');
    expect(r.prompt).not.toContain('jane.doe');
  });

  it('reads the Android Studio format and adds context notes', () => {
    const r = crashToPrompt(STUDIO, { goal: 'test', notes: 'Happens after rotating. Reported by ann@corp.com on a Pixel 9, app 3.2.0' });
    expect(r.rootCause?.type).toBe('kotlin.UninitializedPropertyAccessException');
    expect(r.files).toEqual(['com/example/shop/MainActivity.kt:24']);
    expect(r.prompt).toContain('## Context\n\nHappens after rotating. Reported by <email> on a Pixel 9, app 3.2.0');
    expect(r.prompt).toContain('Reproduce this crash with a failing test, then fix it.');
    expect(r.prompt).not.toContain('- Root cause:');
  });

  it('detects the app package from frames when there is no Process line', () => {
    const r = crashToPrompt('java.lang.NullPointerException\n\tat android.view.View.performClick(View.java:7659)\n\tat dev.acme.notes.ui.EditorFragment.save(EditorFragment.kt:88)\n\tat dev.acme.notes.ui.EditorFragment.onClick(EditorFragment.kt:40)');
    expect(r.appPackage).toBe('dev.acme.notes');
    expect(r.files).toEqual(['dev/acme/notes/ui/EditorFragment.kt:88', 'dev/acme/notes/ui/EditorFragment.kt:40']);
  });

  it('warns about obfuscated traces', () => {
    const r = crashToPrompt('java.lang.ArithmeticException: divide by zero\n\tat com.example.shop.a.b(Unknown Source:4)\n\tat com.example.shop.c.a(Unknown Source:12)\n\tat android.app.Activity.performCreate(Activity.java:9002)', { appPackage: 'com.example.shop' });
    expect(r.obfuscated).toBe(true);
    expect(r.warnings[0]).toMatch(/obfuscated by R8/);
    expect(r.prompt).toContain('treat class and method names as unreliable');
  });

  it('keeps the top of the stack when no app frame is present', () => {
    const frames = Array.from({ length: 12 }, (_, i) => `\tat android.os.Foo.m${i}(Foo.java:${i})`).join('\n');
    const r = crashToPrompt(`android.os.DeadObjectException\n${frames}`, { appPackage: 'com.example.shop' });
    expect(r.framesKept).toBe(8);
    expect(r.trace).toContain('\t... 4 framework frames (android.os)');
    expect(r.warnings).toContain('No frames from com.example.shop were found. Check the app package.');
  });

  it('passes native crashes through as a log with a warning', () => {
    const r = crashToPrompt('Fatal signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0 in tid 4242 (main), pid 4242 (com.example.shop)\nbacktrace:\n  #00 pc 000000000004f2a0  /data/app/~~x==/com.example.shop/lib/arm64/libshop.so (Engine::tick()+48)');
    expect(r.trace).toContain('#00 pc 000000000004f2a0');
    expect(r.warnings.some((w) => w.includes('ndk-stack'))).toBe(true);
  });
});
