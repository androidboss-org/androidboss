#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { run } from './cli.ts';

const io = {
  readFile: (path: string) => readFileSync(path, 'utf8'),
  // Read lazily, only when a value is "-" or a required text option is missing.
  readStdin: () => {
    if (process.stdin.isTTY) return undefined;
    const text = readFileSync(0, 'utf8');
    return text === '' ? undefined : text;
  },
};

const code = await run(process.argv.slice(2), io, {
  stdout: (t) => process.stdout.write(t.endsWith('\n') ? t : `${t}\n`),
  stderr: (t) => process.stderr.write(t.endsWith('\n') ? t : `${t}\n`),
});
if (code >= 0) process.exitCode = code;
