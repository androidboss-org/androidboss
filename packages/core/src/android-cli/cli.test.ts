/**
 * Checks every generated command against a real Android CLI install.
 *
 * Inserting `-h` right after the subcommand makes the CLI parse and validate all
 * options, then print help instead of running, so nothing is built, installed or
 * launched. Unknown options exit with status 2.
 *
 * Opt-in because each call starts a JVM: `npm run test:cli -w @androidboss/core`.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildCommand, CHECKED_VERSION, defaults, tasks, type Values } from './index.ts';

function cliVersion(): string | null {
  try {
    return execFileSync('android', ['-V'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const version = process.env.CHECK_ANDROID_CLI ? cliVersion() : null;

/** Defaults, plus every checkbox on, plus one variant per select option. */
function variants(taskId: string): Values[] {
  const task = tasks.find((t) => t.id === taskId)!;
  const base = defaults(task);
  const out: Values[] = [base, { ...base, ...Object.fromEntries(task.fields.filter((f) => f.type === 'checkbox').map((f) => [f.id, true])) }];
  for (const f of task.fields) {
    if (f.type === 'select') for (const o of f.options ?? []) out.push({ ...base, [f.id]: o.value });
    if (f.type === 'text' && !f.default && f.placeholder && f.id !== 'apks' && f.id !== 'buildArgs') out.push({ ...base, [f.id]: f.placeholder });
  }
  return out;
}

/** Splits a generated POSIX command line into argv (handles the quoting shellQuote emits). */
function argv(line: string): string[] {
  const args: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"') cur += line[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      has = true;
    } else if (c === '\\') {
      cur += line[++i];
    } else if (c === ' ') {
      if (cur || has) args.push(cur);
      cur = '';
      has = false;
    } else cur += c;
  }
  if (cur || has) args.push(cur);
  return args;
}

describe.skipIf(!version)(`against installed Android CLI ${version ?? ''}`, () => {
  it('is the version the builder was checked against', () => {
    expect(version).toBe(CHECKED_VERSION);
  });

  for (const task of tasks) {
    it(`${task.id}: every option is accepted`, () => {
      for (const values of variants(task.id)) {
        for (const line of buildCommand(task.id, values).commands) {
          if (!line.startsWith('android ') || line.includes('<')) continue;
          const args = argv(line).slice(1);
          // Insert -h after the leading subcommand words so options are validated but nothing runs.
          let i = 0;
          while (i < args.length && /^[a-z]+$/.test(args[i]!)) i++;
          args.splice(i, 0, '-h');
          const r = spawnSync('android', args, { encoding: 'utf8', timeout: 30_000 });
          expect(r.status, `${line}\n${r.stderr}`).toBe(0);
        }
      }
    }, 180_000);
  }
});
