import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMapping, retrace } from './index.ts';

// Fixtures from a real R8 9.4.14 build (Android SDK cmdline-tools): shop.mapping.txt is the
// `r8 --release --classfile` mapping of a small Java app with inlining and a lambda,
// shop.trace.txt the obfuscated traces it printed, and shop.expected.txt the output of
// Google's retrace 9.4.14 for them, which this implementation must reproduce exactly.
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('retrace against Google retrace output', () => {
  it('reproduces R8 9.4.14 retrace exactly for the shop sample', () => {
    const r = retrace(fixture('shop.mapping.txt'), fixture('shop.trace.txt'));
    expect(r.text.trimEnd()).toBe(fixture('shop.expected.txt').trimEnd());
    expect(r.ambiguous).toBe(0);
  });
});

describe('parseMapping', () => {
  it('reads classes, source files, members and rewrite rules', () => {
    const m = parseMapping(fixture('shop.mapping.txt'));
    expect(m.compilerVersion).toBe('9.4.14');
    expect(m.byObfuscated.get('a.b')?.original).toBe('com.example.shop.Checkout');
    expect(m.byOriginal.get('com.example.shop.Cart')?.sourceFile).toBe('Cart.java');
    const main = m.byObfuscated.get('com.example.shop.Main')!;
    expect(main.members.some((e) => e.ownerClass === 'com.example.shop.Item' && e.methodName === 'unitPrice')).toBe(true);
    expect(main.members.find((e) => e.rewrite)?.rewrite).toEqual({ exception: 'java.lang.NullPointerException', removeInner: 1 });
  });
});

describe('retrace', () => {
  const mapping = `com.example.Foo -> a.a:
# {"id":"sourceFile","fileName":"Foo.kt"}
    1:3:void bar(int):10:12 -> a
    4:4:void baz():20:20 -> a
    void qux() -> b
    void quux(java.lang.String) -> b
com.example.FooException -> a.b:
`;

  it('maps line ranges and Kotlin source files', () => {
    expect(retrace(mapping, '\tat a.a.a(SourceFile:2)').text).toBe('\tat com.example.Foo.bar(Foo.kt:11)');
    expect(retrace(mapping, '\tat a.a.a(SourceFile:4)').text).toBe('\tat com.example.Foo.baz(Foo.kt:20)');
  });

  it('lists alternatives when a name is ambiguous', () => {
    const r = retrace(mapping, '\tat a.a.b(Unknown Source)');
    // Alphabetical, like Google's retrace.
    expect(r.text).toBe('\tat com.example.Foo.quux(Foo.kt)\n\t<OR> at com.example.Foo.qux(Foo.kt)');
    expect(r.ambiguous).toBe(1);
  });

  it('maps exception class names in headers and keeps unknown frames', () => {
    const r = retrace(mapping, 'Caused by: a.b: boom\n\tat android.os.Handler.dispatchMessage(Handler.java:106)');
    expect(r.text).toBe('Caused by: com.example.FooException: boom\n\tat android.os.Handler.dispatchMessage(Handler.java:106)');
    expect(r.framesRetraced).toBe(0);
  });

  it('maps only the exception class, not dotted words in the message', () => {
    expect(retrace(mapping, 'a.b: value a.a is invalid').text).toBe('com.example.FooException: value a.a is invalid');
    expect(retrace(mapping, 'Exception in thread "main" a.b').text).toBe('Exception in thread "main" com.example.FooException');
  });

  it('handles logcat prefixes', () => {
    expect(retrace(mapping, '11-02 10:00:00.000  1234  1234 E AndroidRuntime: \tat a.a.a(SourceFile:1)').text).toBe(
      '11-02 10:00:00.000  1234  1234 E AndroidRuntime: \tat com.example.Foo.bar(Foo.kt:10)',
    );
  });
});
