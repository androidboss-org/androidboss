/**
 * Runs each reflection scenario in fixtures/ through real R8 (CHECK_ANDROID=1):
 * without the generated rule the shrunk program misbehaves, with it the output
 * is the same as the unshrunk program's.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enabled, sdk } from '../testing/android.ts';
import { generateRules, type RuleRequest } from './index.ts';

const r8 = sdk ? join(sdk, 'cmdline-tools', 'latest', 'bin', 'r8') : undefined;
const FIXTURES = new URL('./fixtures/', import.meta.url).pathname;
const BASE = '-keep class shop.Main { public static void main(java.lang.String[]); }\n';

const javaFiles = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? javaFiles(join(dir, f)) : f.endsWith('.java') ? [join(dir, f)] : []));

describe.skipIf(!enabled || !r8 || !existsSync(r8 ?? ''))('keep rules with real R8', () => {
  let dir: string;
  const input = () => {
    if (dir) return join(dir, 'in.jar');
    dir = mkdtempSync(join(tmpdir(), 'keep-rules-'));
    execFileSync('javac', ['--release', '17', '-d', join(dir, 'classes'), ...javaFiles(FIXTURES)]);
    execFileSync('jar', ['cf', join(dir, 'in.jar'), '-C', join(dir, 'classes'), '.']);
    return join(dir, 'in.jar');
  };
  const javaHome = () => execFileSync('/usr/libexec/java_home', { encoding: 'utf8' }).trim();
  const shrink = (rules: string, name: string) => {
    const jar = input();
    const pro = join(dir, `${name}.pro`);
    writeFileSync(pro, BASE + rules);
    const out = join(dir, `${name}.jar`);
    execFileSync(r8!, ['--classfile', '--release', '--lib', javaHome(), '--pg-conf', pro, '--output', out, jar], { stdio: 'pipe' });
    return out;
  };
  const run = (jar: string, args: string[]) => {
    try {
      return execFileSync('java', ['-cp', jar, 'shop.Main', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
    } catch (e) {
      return `failed: ${String((e as { stderr?: string }).stderr ?? e).split('\n')[0]}`;
    }
  };

  const cases: [string, RuleRequest, string[], string][] = [
    ['json-models', { kind: 'json-models', target: 'shop.model' }, ['json-models'], 'id,title'],
    ['class-for-name', { kind: 'class-for-name', target: 'shop.plugins.Hello' }, ['class-for-name', 'Hello'], 'hello'],
    ['class-for-name (package)', { kind: 'class-for-name', target: 'shop.plugins' }, ['class-for-name', 'Hello'], 'hello'],
    ['annotated-members', { kind: 'annotated-members', target: 'shop.events.Subscribe' }, ['annotated-members'], 'onOrderShipped'],
  ];

  it.each(cases)('%s', { timeout: 120_000 }, (name, request, args, expected) => {
    expect(run(input(), args)).toBe(expected);
    expect(run(shrink('', `${name}-none`.replace(/\W/g, '_')), args)).not.toBe(expected);
    expect(run(shrink(generateRules([request]), name.replace(/\W/g, '_')), args)).toBe(expected);
  });
});
