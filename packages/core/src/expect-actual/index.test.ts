import { describe, expect, it } from 'vitest';
import { actualFor, generateActuals, parseCommon, stripDefaults } from './index.ts';
import { dependencyBlock, NO_EXPECT_NEEDED, TEMPLATES, templateFiles } from './templates.ts';

/** Every shape of expect declaration; expect-actual.gradle.test.ts compiles the generated actuals. */
export const SAMPLE_EXPECTS = `package dev.probe.sample

import kotlin.time.Duration

/** A comment that mentions "expect fun notReal()" must be ignored. */
expect fun formatDuration(d: Duration, short: Boolean = false): String

@Suppress("unused")
expect suspend fun fetchBytes(
    url: String,
    timeoutMs: Long = 10_000,
    headers: Map<String, String> = emptyMap(),
): ByteArray

expect fun <T : Comparable<T>> maxOf3(a: T, b: T, c: T): T

expect val appVersion: String

expect var debugMode: Boolean

expect fun String.slugify(): String

expect fun onEvent(handler: (name: String, value: Int) -> Unit = { _, _ -> })

internal expect fun isDebugBuild(): Boolean

expect class Counter(start: Int = 0) {
    constructor()

    val value: Int
    fun increment(by: Int = 1)

    class Snapshot {
        val at: Long
    }
}

expect class Session {
    val id: String
}

expect object Ids {
    fun next(): Long
}

expect enum class Theme { LIGHT, DARK, SYSTEM }

expect interface Tracker {
    fun track(event: String)
}
`;

describe('parseCommon', () => {
  it('finds top-level expect declarations, not ones in comments or members', () => {
    const p = parseCommon(SAMPLE_EXPECTS);
    expect(p.packageName).toBe('dev.probe.sample');
    expect(p.imports).toEqual(['import kotlin.time.Duration']);
    expect(p.expects.map((d) => d.kind)).toEqual(['fun', 'fun', 'fun', 'val', 'var', 'fun', 'fun', 'fun', 'class', 'class', 'object', 'enum', 'interface']);
    expect(p.expects[1]!.text.startsWith('@Suppress("unused")\nexpect suspend fun fetchBytes(')).toBe(true);
  });
});

describe('stripDefaults', () => {
  it('removes defaults at the top level only', () => {
    expect(stripDefaults('a: Int = 1, b: Map<String, Int> = mapOf("x" to 1), f: (Int) -> Unit = { it -> println(it) }, c: Boolean').params).toBe('a: Int, b: Map<String, Int>, f: (Int) -> Unit, c: Boolean');
    expect(stripDefaults('a: Int').stripped).toBe(false);
  });
});

describe('actualFor', () => {
  it('stubs functions and properties', () => {
    expect(actualFor('expect fun formatDuration(d: Duration, short: Boolean = false): String', 'iOS')).toBe('actual fun formatDuration(d: Duration, short: Boolean): String = TODO("formatDuration() on iOS")');
    expect(actualFor('internal expect fun isDebugBuild(): Boolean', 'JVM')).toBe('internal actual fun isDebugBuild(): Boolean = TODO("isDebugBuild() on JVM")');
    expect(actualFor('expect fun String.slugify(): String', 'JVM')).toBe('actual fun String.slugify(): String = TODO("slugify() on JVM")');
    expect(actualFor('expect var debugMode: Boolean', 'JVM')).toBe('actual var debugMode: Boolean\n    get() = TODO("debugMode on JVM")\n    set(value) = TODO("debugMode setter on JVM")');
  });

  it('makes class members actual, with every constructor secondary when there are several', () => {
    const p = parseCommon(SAMPLE_EXPECTS);
    expect(actualFor(p.expects[8]!.text, 'Android')).toBe(`actual class Counter {
    actual constructor(start: Int)

    actual constructor()

    actual val value: Int
        get() = TODO("value on Android")

    actual fun increment(by: Int) {
        TODO("increment() on Android")
    }

    actual class Snapshot {
        actual val at: Long
            get() = TODO("at on Android")
    }
}`);
    expect(actualFor('expect class Store(name: String = "x") {\n    fun get(): String?\n}', 'JVM')).toBe('actual class Store actual constructor(name: String) {\n    actual fun get(): String? = TODO("get() on JVM")\n}');
    expect(actualFor('expect enum class Theme { LIGHT, DARK, SYSTEM }', 'JVM')).toBe('actual enum class Theme {\n    LIGHT, DARK, SYSTEM\n}');
    // Interface members stay abstract (Kotlin: "the modalities are different").
    expect(actualFor('expect interface Tracker {\n    val name: String\n    fun track(event: String)\n}', 'JVM')).toBe('actual interface Tracker {\n    actual val name: String\n\n    actual fun track(event: String)\n}');
  });

  it('reports bodies in expect functions', () => {
    const n: { level: string; text: string }[] = [];
    actualFor('expect fun x(): Int = 1', 'JVM', n as never);
    expect(n[0]!.text).toMatch(/can't have a body/);
  });
});

describe('generateActuals', () => {
  it('lays out one file per target with the wizard’s naming', () => {
    const g = generateActuals(SAMPLE_EXPECTS, { fileName: 'Sample', module: 'shared', targets: ['android', 'ios', 'wasmJs'] });
    expect(g.files.map((f) => f.path)).toEqual([
      'shared/src/commonMain/kotlin/dev/probe/sample/Sample.kt',
      'shared/src/androidMain/kotlin/dev/probe/sample/Sample.android.kt',
      'shared/src/iosMain/kotlin/dev/probe/sample/Sample.ios.kt',
      'shared/src/wasmJsMain/kotlin/dev/probe/sample/Sample.wasmJs.kt',
    ]);
    expect(g.files[1]!.content.startsWith('package dev.probe.sample\n\nimport kotlin.time.Duration\n\n')).toBe(true);
    expect(g.usesExpectClasses).toBe(true);
    expect(g.notices.map((n) => n.text)).toContain('Default values stay on the expect side only; Kotlin rejects them on actual functions (formatDuration).');
  });

  it('explains when nothing is found', () => {
    expect(generateActuals('fun x() = 1', { fileName: 'X', module: 'shared', targets: ['jvm'] }).notices[0]!.level).toBe('error');
  });
});

describe('templates', () => {
  it('cover every target and keep names in step with the common declaration', () => {
    for (const t of TEMPLATES) {
      const names = [...t.common.matchAll(/\b(?:fun|class|val)\s+(\w+)/g)].map((m) => m[1]);
      for (const [target, a] of Object.entries(t.actual)) for (const n of names) expect(a.code, `${t.id} ${target} ${n}`).toContain(n!);
      expect(templateFiles(t, 'app', 'shared', ['android', 'ios', 'jvm', 'js', 'wasmJs'])).toHaveLength(6);
    }
    expect(NO_EXPECT_NEEDED.map((x) => x.use)).toEqual(['kotlin.uuid.Uuid', 'kotlin.time.Clock']);
    expect(dependencyBlock(TEMPLATES, ['android', 'wasmJs'])).toBe('kotlin {\n    sourceSets {\n        wasmJsMain.dependencies {\n            implementation("org.jetbrains.kotlinx:kotlinx-browser:0.5.0")\n        }\n    }\n}');
    expect(dependencyBlock(TEMPLATES, ['android', 'js'])).toBe('');
  });
});
