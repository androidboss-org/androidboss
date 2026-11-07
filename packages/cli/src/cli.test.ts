/**
 * Runs the bundled dist/androidboss.mjs as a real process, the way `npx androidboss`
 * runs it (`npm test` builds it first), and talks to `androidboss mcp` with the
 * official MCP client over stdio.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { LIMIT, toolCatalog } from '@androidboss/mcp';
import { describe, expect, it } from 'vitest';

const BIN = fileURLToPath(new URL('../dist/androidboss.mjs', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'androidboss-cli-'));

function cli(args: string[], input?: string) {
  const r = spawnSync(process.execPath, [BIN, ...args], { input: input ?? '', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const MAPPING = 'com.example.app.Cart -> a.b:\n    void checkout(int) -> a\n    1:10:void checkout(int):42:51 -> a\n';
const TRACE = 'java.lang.IllegalStateException: boom\n\tat a.b.a(SourceFile:3)\n';

describe('androidboss CLI', () => {
  it('lists every MCP tool under a kebab-case name', () => {
    const r = cli(['tools']);
    expect(r.code).toBe(0);
    for (const t of toolCatalog()) expect(r.out).toContain(t.name.replace(/_/g, '-'));
  });

  it('retraces with a mapping file and the trace piped in', () => {
    const mapping = join(tmp, 'mapping.txt');
    writeFileSync(mapping, MAPPING);
    const r = cli(['retrace', '--mapping', `@${mapping}`], TRACE);
    expect(r.err).toBe('');
    expect(r.code).toBe(0);
    expect(r.out).toContain('at com.example.app.Cart.checkout(Cart.java:44)');
  });

  it('takes a mapping larger than the hosted server accepts', () => {
    const classes = Array.from({ length: 80_000 }, (_, i) => `com.example.gen.Model${i} -> m${i}:\n    int value -> a\n    1:1:int getValue():10:10 -> b\n`).join('');
    const mapping = join(tmp, 'big-mapping.txt');
    writeFileSync(mapping, classes + MAPPING);
    expect(classes.length).toBeGreaterThan(LIMIT.mapping);
    const r = cli(['retrace', '--mapping', `@${mapping}`, '--stack-trace', TRACE, '--json']);
    expect(r.err).toBe('');
    const data = JSON.parse(r.out) as { framesRetraced: number; text: string };
    expect(data.framesRetraced).toBe(1);
    expect(data.text).toContain('com.example.app.Cart.checkout');
  });

  it('coerces numbers, comma lists, object keys and JSON from the schema', () => {
    const perms = cli(['android-permissions', '--names', 'CAMERA,ACCESS_FINE_LOCATION', '--target-sdk', '35', '--json']);
    expect(perms.code).toBe(0);
    expect((JSON.parse(perms.out) as { permissions: { found: boolean }[] }).permissions.map((p) => p.found)).toEqual([true, true]);

    const tasks = JSON.parse(cli(['android-cli-tasks', '--query', 'emulator', '--json']).out) as { tasks: { id: string; fields: { id: string }[] }[] };
    const task = tasks.tasks.find((t) => t.fields.length)!;
    const cmd = cli(['android-cli-command', '--task-id', task.id, `--values.${task.fields[0]!.id}`, 'pixel_9', '--json']);
    expect(cmd.code).toBe(0);
    expect((JSON.parse(cmd.out) as { commands: string[] }).commands.length).toBeGreaterThan(0);

    const rules = cli(['keep-rules', '--rules', '{"kind":"jni-callbacks","target":"com.example.Native"}', '--rules', '[{"kind":"json-models","target":"com.example.api"}]']);
    expect(rules.code).toBe(0);
    expect(rules.out).toContain('com.example.Native');
    expect(rules.out).toContain('com.example.api');

    const actuals = cli(['expect-actual', '--targets', 'android,ios', '--json'], 'package demo\n\nexpect fun platformName(): String\n');
    const files = (JSON.parse(actuals.out) as { files: { path: string }[] }).files.map((f) => f.path);
    expect(files.some((p) => p.includes('androidMain'))).toBe(true);
    expect(files.some((p) => p.includes('iosMain'))).toBe(true);
    expect(files.some((p) => p.includes('jvmMain'))).toBe(false);
  });

  it('explains usage errors with exit code 2', () => {
    expect(cli(['retrace', '--bogus', 'x']).err).toContain('Unknown option --bogus');
    expect(cli(['retrace', '--mapping', 'x']).err).toContain('Missing --stack-trace');
    expect(cli(['android-permissions', '--target-sdk', 'high']).err).toContain('--target-sdk needs a number');
    expect(cli(['convert-vector', '--to', 'png', '--input', '<svg/>']).err).toContain('must be one of');
    expect(cli(['retrace', '--mapping', '@/no/such/file', '--stack-trace', 'x']).code).toBe(2);
    expect(cli(['retarce']).code).toBe(2);
  });

  it('looks up cheatsheet commands', () => {
    const r = cli(['cheatsheet', '--sheet', 'adb', '--query', 'deep link', '--values.package', 'com.my.shop', '--values.url', 'https://shop.example/p/1']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('adb shell am start -a android.intent.action.VIEW -d "https://shop.example/p/1"');
  });

  it('prints help and version', () => {
    expect(cli([]).out).toContain('androidboss mcp');
    expect(cli(['help', 'kotlin-to-swift']).out).toContain('--kotlin <string>  (required)');
    expect(cli(['help', 'keep-rules']).out).toContain('--rules <json>');
    expect(cli(['--version']).out.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('serves MCP over stdio to the official client', async () => {
    const client = new Client({ name: 'cli-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN, 'mcp'], stderr: 'pipe' }));
    try {
      expect(client.getServerVersion()?.name).toBe('androidboss');
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(toolCatalog().map((t) => t.name).sort());
      const r = (await client.callTool({ name: 'retrace', arguments: { mapping: MAPPING, stackTrace: TRACE } })) as { content: { text?: string }[] };
      expect(r.content[0]!.text).toContain('com.example.app.Cart.checkout');
    } finally {
      await client.close();
    }
  });

  it('answers a 2025-protocol client over stdio', () => {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'legacy', version: '1' } } };
    const r = spawnSync(process.execPath, [BIN, 'mcp'], { input: `${JSON.stringify(init)}\n`, encoding: 'utf8', timeout: 10_000 });
    expect(r.stdout).toContain('"protocolVersion":"2025-06-18"');
    expect(r.stdout).toContain('"name":"androidboss"');
  });
});
