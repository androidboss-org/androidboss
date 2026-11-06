import { describe, expect, it } from 'vitest';
import { generateRules, lintRules, ruleKinds, shipsOwnRules } from './index.ts';

describe('generateRules', () => {
  it('scopes JSON model rules to the package', () => {
    expect(generateRules([{ kind: 'json-models', target: 'com.example.api.model' }])).toBe(`# JSON models read by reflection (Gson, Jackson, reflective Moshi)
# These libraries map JSON keys to field names at runtime. R8 renames or removes fields it sees no code reading.
-keepattributes Signature, RuntimeVisibleAnnotations, AnnotationDefault
-keepclassmembers class com.example.api.model.** {
    <fields>;
    <init>(...);
}
`);
  });

  it('keeps a class by name, or a package when given one', () => {
    expect(generateRules([{ kind: 'class-for-name', target: 'com.example.plugins.Hello' }])).toContain('-keep class com.example.plugins.Hello {');
    expect(generateRules([{ kind: 'class-for-name', target: 'com.example.plugins' }])).toContain('-keep class com.example.plugins.** {');
    expect(generateRules([{ kind: 'class-for-name', target: 'com.example.plugins.*' }])).toContain('-keep class com.example.plugins.* {');
  });

  it('writes annotation, WebView, JNI and Kotlin reflection rules', () => {
    const out = generateRules([
      { kind: 'annotated-members', target: 'com.example.events.Subscribe' },
      { kind: 'js-interface', target: 'com.example.web.Bridge' },
      { kind: 'jni-callbacks', target: 'com.example.jni.Callbacks' },
      { kind: 'kotlin-reflect', target: 'com.example.forms' },
    ]);
    expect(out).toContain('    @com.example.events.Subscribe <methods>;');
    expect(out).toContain('-keepclassmembers class com.example.web.Bridge {\n    @android.webkit.JavascriptInterface <methods>;');
    expect(out).toContain('-keep class com.example.jni.Callbacks {\n    *;');
    expect(out).toContain('-keep class kotlin.Metadata { *; }');
    expect(out).toContain('-keep class com.example.forms.** {');
    expect(out).not.toMatch(/keepattributes JavascriptInterface/);
  });

  it('rejects bad names and packages where a class is needed', () => {
    expect(() => generateRules([{ kind: 'json-models', target: 'not a package' }])).toThrow(/isn't a Java\/Kotlin class or package name/);
    expect(() => generateRules([{ kind: 'annotated-members', target: 'com.example.events' }])).toThrow(/annotation class/);
  });

  it('documents every kind and the libraries that need nothing', () => {
    for (const k of Object.values(ruleKinds)) expect(k.why.length).toBeGreaterThan(30);
    expect(shipsOwnRules.join()).toMatch(/Line numbers/);
    expect(generateRules([])).toMatch(/^# Choose/);
  });
});

describe('lintRules', () => {
  it('flags rules that undo R8 or hide problems', () => {
    const findings = lintRules(`# app rules
-dontobfuscate
-keep class com.example.** { *; }
-keep class * { *; }
-dontwarn **
-ignorewarnings
-keepattributes *
-dontshrink
-keepclasmembers class x.Y { *; }
-keepclassmembers class com.example.model.** {
    <fields>;
}
-keepclassmembers class com.example.model.** { <fields>; }
keep class oops
`);
    expect(findings.map((f) => `${f.line} ${f.level}: ${f.message.slice(0, 30)}`)).toEqual([
      '2 warning: -dontobfuscate makes the app b',
      '3 warning: Keeps everything in a whole pa',
      '4 error: Keeps every class, so R8 can’t',
      '5 warning: A blanket -dontwarn hides ever',
      '6 warning: -ignorewarnings hides missing ',
      '7 warning: -keepattributes * keeps every ',
      '8 error: -dontshrink keeps every class ',
      '9 error: Unknown option -keepclasmember',
      '13 info: Same rule as line 10.',
      '14 error: Not a rule: \"keep class oops\".',
    ]);
  });

  it('accepts generated rules', () => {
    expect(lintRules(generateRules([{ kind: 'json-models', target: 'com.example.model' }, { kind: 'annotated-members', target: 'com.example.Subscribe' }]))).toEqual([]);
  });
});
