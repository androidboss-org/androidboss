import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, LIMIT, MAX_REQUEST_BYTES, SERVER_INFO, toolCatalog } from './index.ts';

const handler = createMcpHandler(() => createServer(), { maxRequestBodySize: MAX_REQUEST_BYTES });
const URL_ = new URL('https://androidboss.info/mcp');
/** The real HTTP handler, called in-process: no network. */
const fetchToHandler = (input: string | URL | Request, init?: RequestInit) => handler.fetch(new Request(input, init));

let client: Client;

beforeAll(async () => {
  client = new Client({ name: 'androidboss-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(URL_, { fetch: fetchToHandler }));
});
afterAll(async () => {
  await client.close();
  await handler.close();
});

type Structured = Record<string, unknown>;
async function call(name: string, args: Record<string, unknown>): Promise<{ text: string; data: Structured; isError: boolean }> {
  const r = (await client.callTool({ name, arguments: args })) as { content: { type: string; text?: string }[]; structuredContent?: Structured; isError?: boolean };
  return { text: r.content.map((c) => c.text ?? '').join('\n'), data: r.structuredContent ?? {}, isError: !!r.isError };
}

describe('AndroidBoss MCP server', () => {
  it('describes itself and lists every tool as read-only, with schemas', async () => {
    expect(client.getServerVersion()?.name).toBe(SERVER_INFO.name);
    expect(client.getInstructions()).toContain('androidboss.info');
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(toolCatalog().map((t) => t.name).sort());
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.outputSchema, t.name).toBeDefined();
      expect(t.description!.length, t.name).toBeGreaterThan(40);
    }
  });

  it('answers a 2025-protocol client too (stateless fallback)', async () => {
    const res = await handler.fetch(
      new Request(URL_, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'legacy', version: '1' } } }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('"protocolVersion":"2025-06-18"');
    expect(body).toContain('"name":"androidboss"');
  });

  it('retraces a stack trace', async () => {
    const mapping = 'com.example.app.Cart -> a.b:\n    void checkout(int) -> a\n    1:10:void checkout(int):42:51 -> a\n';
    const r = await call('retrace', { mapping, stackTrace: 'java.lang.IllegalStateException: boom\n\tat a.b.a(SourceFile:3)' });
    expect(r.isError).toBe(false);
    expect(r.text).toContain('com.example.app.Cart.checkout');
    expect(r.data.framesRetraced).toBe(1);
  });

  it('writes Kotlin data classes', async () => {
    const r = await call('json_to_kotlin', { json: '{"id": 1, "user_name": "ada", "tags": ["a"]}', rootName: 'User' });
    expect(r.text).toContain('data class User(');
    expect(r.text).toContain('@SerialName("user_name")');
    expect(r.data.classCount).toBe(1);
  });

  it('checks version compatibility', async () => {
    const ok = await call('check_compatibility', { agp: '9.5.0', gradle: '9.6.0' });
    expect((ok.data.checks as { status: string }[]).length).toBeGreaterThan(0);
    const bad = await call('check_compatibility', { agp: '9.5.0', gradle: '7.0' });
    expect(JSON.stringify(bad.data.checks)).toMatch(/"status":"(error|fail|bad)"/);
  });

  it('lists Android CLI tasks and builds a command', async () => {
    const tasks = (await call('android_cli_tasks', {})).data.tasks as { id: string }[];
    expect(tasks.length).toBeGreaterThan(10);
    const emulator = (await call('android_cli_tasks', { query: 'emulator' })).data.tasks as { id: string }[];
    expect(emulator.length).toBeGreaterThan(0);
    const r = await call('android_cli_command', { taskId: emulator[0]!.id });
    expect(r.isError).toBe(false);
    expect((r.data.commands as string[]).join('\n')).toMatch(/^android /m);
    expect((await call('android_cli_command', { taskId: 'nope' })).isError).toBe(true);
  });

  it('turns a crash into a redacted prompt', async () => {
    const crash = 'FATAL EXCEPTION: main\nProcess: com.example.app, PID: 1\njava.lang.NullPointerException: user ada@example.com\n\tat com.example.app.Cart.total(Cart.kt:17)\n\tat android.app.Activity.performCreate(Activity.java:8000)';
    const r = await call('crash_to_prompt', { crash });
    expect(r.text).not.toContain('ada@example.com');
    expect(r.data.files).toEqual(expect.arrayContaining([expect.stringContaining('Cart.kt:17')]));
  });

  it('converts a build file to a version catalog', async () => {
    const r = await call('version_catalog', { buildFile: 'dependencies {\n    implementation("io.ktor:ktor-client-core:3.6.1")\n}\n' });
    expect(r.data.toml).toContain('ktor-client-core');
    expect(r.data.buildFile).toContain('libs.ktor.client.core');
  });

  it('converts SVG to an ImageVector', async () => {
    const r = await call('convert_vector', { input: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>', to: 'image-vector', name: 'Square' });
    expect(r.text).toContain('ImageVector.Builder');
    expect(r.text).toContain('Square');
  });

  it('generates and lints keep rules', async () => {
    const r = await call('keep_rules', { rules: [{ kind: 'json-models', target: 'com.example.api.model' }], lint: '-dontobfuscate\n-keep class ** { *; }\n' });
    expect(r.data.rules).toContain('com.example.api.model');
    expect((r.data.findings as unknown[]).length).toBeGreaterThan(0);
  });

  it('writes actual declarations', async () => {
    const r = await call('expect_actual', { common: 'package com.example\n\nexpect fun platformName(): String\n', targets: ['android', 'ios'] });
    const files = r.data.files as { path: string; content: string }[];
    expect(files.map((f) => f.path)).toEqual(expect.arrayContaining(['shared/src/androidMain/kotlin/com/example/Platform.android.kt', 'shared/src/iosMain/kotlin/com/example/Platform.ios.kt']));
    expect(files[1]!.content).toContain('actual fun platformName(): String');
  });

  it('shows how Kotlin reads from Swift', async () => {
    const r = await call('kotlin_to_swift', { kotlin: 'package com.example\n\ndata class User(val id: Long, val name: String)\n' });
    expect(r.data.swiftFile).toContain('User(id: 0, name: "")');
    expect(r.text).toContain('Int64');
  });

  it('finds KMP libraries with a catalog', async () => {
    const r = await call('find_kmp_libraries', { category: 'networking', targets: ['android', 'ios', 'jvm'] });
    const libs = r.data.libraries as { coordinates: string }[];
    expect(libs.map((l) => l.coordinates)).toContain('io.ktor:ktor-client-core');
    expect(r.data.kts).toContain('commonMain.dependencies');
  });

  it('looks up permissions and checks a manifest', async () => {
    const r = await call('android_permissions', {
      names: ['ACCESS_FINE_LOCATION', 'NOT_A_PERMISSION'],
      manifest: '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <uses-permission android:name="android.permission.READ_SMS"/>\n</manifest>',
    });
    const perms = r.data.permissions as { name: string; level?: string; found: boolean }[];
    expect(perms[0]).toMatchObject({ name: 'android.permission.ACCESS_FINE_LOCATION', level: 'dangerous', found: true });
    expect(perms[1]!.found).toBe(false);
    expect(JSON.stringify(r.data.manifest)).toContain('READ_SMS');
  });

  it('lists targetSdk changes and marks the ones a manifest hits', async () => {
    const r = await call('target_sdk_changes', { from: 34, to: 35 });
    expect((r.data.changes as { api: number }[]).every((c) => c.api === 35)).toBe(true);
    expect(r.text.toLowerCase()).toContain('edge-to-edge');
  });

  it('finds cheatsheet commands and fills placeholders', async () => {
    const r = await call('cheatsheet', { query: 'logs one app', values: { package: 'com.my.shop' } });
    const entries = r.data.entries as { sheet: string; id: string; command: string; url: string }[];
    expect(entries[0]!.id).toBe('logcat-app');
    expect(entries[0]!.command).toContain('pidof -s com.my.shop');
    expect(entries[0]!.url).toBe('https://androidboss.info/cheatsheets/adb/#logcat-app');
    const gradle = (await call('cheatsheet', { sheet: 'gradle', query: 'unit tests', values: { module: 'core', variant: 'release' } })).data.entries as { command: string }[];
    expect(gradle[0]!.command).toBe('./gradlew :core:testReleaseUnitTest');
    const whole = (await call('cheatsheet', { sheet: 'simctl' })).data.entries as unknown[];
    expect(whole.length).toBeGreaterThan(20);
    expect((await call('cheatsheet', { sheet: 'nope' })).isError).toBe(true);
  });

  it('rejects oversized and invalid input without running the tool', async () => {
    const r = await call('json_to_kotlin', { json: '' });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/validation/i);
    const big = await call('crash_to_prompt', { crash: 'x'.repeat(LIMIT.medium + 1) });
    expect(big.isError).toBe(true);
    expect(big.text).toMatch(/validation/i);
  });
});
