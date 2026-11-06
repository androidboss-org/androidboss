/**
 * Crash to agent prompt: take a crash as pasted from Logcat, Android Studio,
 * Play Console or Crashlytics, remove secrets and personal data, cut framework
 * noise out of the stack trace, and wrap it in a prompt a coding agent can act on.
 *
 * Everything runs locally. Redaction is pattern based, so the UI shows what was
 * replaced and the user still reviews the prompt before sending it anywhere.
 */

export type RedactionKind =
  | 'email'
  | 'token'
  | 'apiKey'
  | 'jwt'
  | 'ip'
  | 'url'
  | 'path'
  | 'phone'
  | 'uuid'
  | 'hex';

export const redactionLabels: Record<RedactionKind, string> = {
  email: 'Email addresses',
  token: 'Bearer / auth tokens',
  apiKey: 'API keys (Google, AWS, GitHub, OpenAI, Stripe, Slack)',
  jwt: 'JWTs',
  ip: 'IP addresses',
  url: 'URL query strings and credentials',
  path: 'User names in file paths',
  phone: 'Phone numbers',
  uuid: 'UUIDs and Android IDs',
  hex: 'Long hex and base64 strings',
};

export type Goal = 'fix' | 'explain' | 'test';

export const goals: Record<Goal, string> = {
  fix: 'Find the root cause and fix it',
  explain: 'Explain the cause, no code changes',
  test: 'Write a failing test first, then fix',
};

export interface CrashPromptOptions {
  /** App package; frames under it are kept. Detected from the crash when empty. */
  appPackage: string;
  goal: Goal;
  redact: Record<RedactionKind, boolean>;
  /** Framework frames kept right above the first app frame of each exception. */
  contextFrames: number;
  /** What the user was doing, app version, device. Free text, redacted too. */
  notes: string;
}

export const defaultCrashPromptOptions: CrashPromptOptions = {
  appPackage: '',
  goal: 'fix',
  redact: { email: true, token: true, apiKey: true, jwt: true, ip: true, url: true, path: true, phone: true, uuid: true, hex: true },
  contextFrames: 2,
  notes: '',
};

export interface Frame {
  /** Original text after "at ". */
  text: string;
  className: string;
  method: string;
  /** "Cart.kt:17", "Unknown Source:4", "Native Method". */
  location: string;
}

export interface Throwable {
  kind: 'root' | 'caused' | 'suppressed';
  type: string;
  message: string;
  frames: Frame[];
  /** From "... 12 more". */
  more: number;
}

export interface ParsedCrash {
  thread?: string;
  process?: string;
  throwables: Throwable[];
  /** Lines that aren't part of the Java trace (native crash, plain log). */
  other: string[];
  native: boolean;
}

export interface CrashPromptResult {
  prompt: string;
  /** Trimmed, redacted trace on its own. */
  trace: string;
  appPackage: string;
  /** Exception at the bottom of the "Caused by" chain. */
  rootCause?: { type: string; message: string };
  /** App frames worth opening first, "com/example/Cart.kt:17" style. */
  files: string[];
  redactions: Partial<Record<RedactionKind, number>>;
  obfuscated: boolean;
  framesKept: number;
  framesTotal: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Logcat prefixes

const LOGCAT_PREFIXES = [
  // threadtime: 11-03 10:15:22.123  4242  4242 E AndroidRuntime: ...
  /^\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+\d+\s+[VDIWEFA]\s+[^:]*?:\s?/,
  // Android Studio: 2026-11-03 10:15:22.123  4242-4242  AndroidRuntime  com.example.shop  E  ...
  /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+\s+\d+-\d+\s+\S+\s+\S+\s+[VDIWEFA]\s{1,2}/,
  // brief / process: E/AndroidRuntime( 4242): ...
  /^[VDIWEFA]\/[^(:]+\(\s*\d+\):\s?/,
  // tag: E/AndroidRuntime: ...
  /^[VDIWEFA]\/[^:]+:\s?/,
];

export function stripLogcat(line: string): string {
  for (const re of LOGCAT_PREFIXES) if (re.test(line)) return line.replace(re, '');
  return line;
}

// ---------------------------------------------------------------------------
// Parsing

const FRAME = /^\s*at\s+(.+?)\((.*)\)\s*$/;
const MORE = /^\s*\.\.\.\s*(\d+)\s+more\s*$/;
const HEADER = /^\s*(Caused by|Suppressed):\s*(.*)$/;
const THROWABLE = /^\s*((?:[a-zA-Z_$][\w$]*\.)+[A-Z_$][\w$]*(?:Exception|Error|Throwable|Failure|Exit|Death|Violation)?[\w$]*)(?::\s?(.*))?$/;
const NATIVE = /\b(?:signal \d+ \(SIG[A-Z]+\)|Fatal signal \d+|backtrace:|tombstone|#\d{2} pc [0-9a-f]+)/;

function splitThrowable(text: string): { type: string; message: string } | undefined {
  const m = text.match(THROWABLE);
  if (!m || !/[A-Z]/.test(m[1]!)) return undefined;
  return { type: m[1]!, message: (m[2] ?? '').trim() };
}

export function parseCrash(input: string): ParsedCrash {
  const lines = input.replace(/\r\n?/g, '\n').split('\n').map(stripLogcat);
  const out: ParsedCrash = { throwables: [], other: [], native: false };
  let current: Throwable | undefined;
  // Message lines that continue after the exception header (multi-line messages).
  let inMessage = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      inMessage = false;
      continue;
    }
    if (NATIVE.test(line)) out.native = true;

    const thread = line.match(/^FATAL EXCEPTION:\s*(.+)$/);
    if (thread) {
      out.thread = thread[1]!.trim();
      continue;
    }
    const proc = line.match(/^Process:\s*([\w.:]+)/);
    if (proc) {
      out.process = proc[1]!.replace(/:.*/, '');
      continue;
    }

    const frame = line.match(FRAME);
    if (frame && current) {
      const [, member, location] = frame;
      const dot = member!.lastIndexOf('.');
      current.frames.push({ text: `${member}(${location})`, className: member!.slice(0, dot), method: member!.slice(dot + 1), location: location! });
      inMessage = false;
      continue;
    }
    const more = line.match(MORE);
    if (more && current) {
      current.more = Number(more[1]);
      continue;
    }
    const header = line.match(HEADER);
    if (header) {
      const t = splitThrowable(header[2]!) ?? { type: header[2]!.trim(), message: '' };
      current = { kind: header[1] === 'Caused by' ? 'caused' : 'suppressed', ...t, frames: [], more: 0 };
      out.throwables.push(current);
      inMessage = true;
      continue;
    }
    if (!current || current.frames.length) {
      const t = splitThrowable(line.trim());
      // A new top-level exception (second crash in the same paste, or the first one).
      if (t && /(Exception|Error|Throwable)\b/.test(t.type)) {
        current = { kind: 'root', ...t, frames: [], more: 0 };
        out.throwables.push(current);
        inMessage = true;
        continue;
      }
    }
    if (current && inMessage && !current.frames.length) {
      current.message = current.message ? `${current.message}\n${line.trim()}` : line.trim();
      continue;
    }
    out.other.push(line);
  }
  return out;
}

// ---------------------------------------------------------------------------
// App package and frame classification

const FRAMEWORK = [
  'android.', 'androidx.', 'com.android.', 'com.google.android.', 'com.google.common.', 'com.google.firebase.',
  'java.', 'javax.', 'jdk.', 'sun.', 'dalvik.', 'libcore.', 'kotlin.', 'kotlinx.', 'org.jetbrains.',
  'okhttp3.', 'okio.', 'retrofit2.', 'io.reactivex.', 'rx.', 'dagger.', 'com.squareup.', 'io.ktor.',
  'org.json.', 'org.chromium.', 'com.facebook.', 'coil.', 'coil3.', 'com.bumptech.', 'io.sentry.',
];

const isFramework = (cls: string) => FRAMEWORK.some((p) => cls.startsWith(p));

/** Heuristic for R8 output: a.b.c, a.a, or no line numbers anywhere. */
function looksObfuscated(frames: Frame[]): boolean {
  const app = frames.filter((f) => !isFramework(f.className));
  if (!app.length) return false;
  const short = app.filter((f) => f.className.split('.').some((s) => s.length <= 2 && /^[a-z]+$/.test(s)) && f.method.length <= 2);
  return short.length >= Math.max(1, app.length / 2);
}

export function detectAppPackage(crash: ParsedCrash): string {
  if (crash.process) return crash.process;
  const counts = new Map<string, number>();
  for (const t of crash.throwables)
    for (const f of t.frames) {
      if (isFramework(f.className)) continue;
      const parts = f.className.split('.');
      const pkg = parts.slice(0, Math.min(3, parts.length - 1)).join('.');
      if (pkg) counts.set(pkg, (counts.get(pkg) ?? 0) + 1);
    }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function isApp(f: Frame, pkg: string): boolean {
  if (pkg) return f.className === pkg || f.className.startsWith(`${pkg}.`) || f.className.startsWith(`${pkg}$`);
  return !isFramework(f.className);
}

function groupName(cls: string): string {
  const parts = cls.split('.');
  return parts.slice(0, Math.min(parts[0] === 'com' || parts[0] === 'org' ? 3 : 2, parts.length - 1)).join('.');
}

/** Keep app frames, the frame that threw, and a little context; fold the rest. */
function trimFrames(frames: Frame[], pkg: string, context: number): { lines: string[]; kept: number } {
  const keep = new Set<number>();
  if (frames.length) keep.add(0);
  frames.forEach((f, i) => {
    if (!isApp(f, pkg)) return;
    keep.add(i);
    // Framework frames that called into the app (above) give the agent its bearings.
    for (let j = 1; j <= context && i - j >= 0; j++) keep.add(i - j);
  });
  // If nothing from the app is on the stack, keep the top of it.
  if (keep.size <= 1) for (let i = 0; i < Math.min(frames.length, 8); i++) keep.add(i);

  const lines: string[] = [];
  let skipped: Frame[] = [];
  const flush = () => {
    if (!skipped.length) return;
    const groups = [...new Set(skipped.map((f) => groupName(f.className)))].slice(0, 3);
    lines.push(`\t... ${skipped.length} framework frame${skipped.length === 1 ? '' : 's'} (${groups.join(', ')})`);
    skipped = [];
  };
  frames.forEach((f, i) => {
    if (keep.has(i)) {
      flush();
      lines.push(`\tat ${f.text}`);
    } else skipped.push(f);
  });
  flush();
  return { lines, kept: keep.size };
}

// ---------------------------------------------------------------------------
// Redaction

interface Rule {
  kind: RedactionKind;
  re: RegExp;
  replace: (m: string, ...groups: string[]) => string;
}

const RULES: Rule[] = [
  { kind: 'jwt', re: /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/g, replace: () => '<jwt>' },
  {
    kind: 'apiKey',
    re: /\b(?:AIza[\w-]{35}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{40,}|sk-(?:proj-|ant-)?[\w-]{20,}|[rs]k_(?:live|test)_[A-Za-z0-9]{16,}|xox[abpors]-[\w-]{10,})/g,
    replace: () => '<api-key>',
  },
  {
    kind: 'token',
    re: /\b(Bearer|Basic)\s+[\w\-.~+/]{8,}=*/g,
    replace: (_m, scheme) => `${scheme} <redacted>`,
  },
  {
    kind: 'token',
    // key=value, "key": "value", key: value for secret-looking keys.
    re: /\b([\w-]*(?:token|api[_-]?key|apikey|password|passwd|secret|session[_-]?id|authorization)"?\s*[:=]\s*"?)(?!Bearer\b|Basic\b|<)([^\s",;&]{4,})/gi,
    replace: (_m, key) => `${key}<redacted>`,
  },
  {
    kind: 'url',
    re: /\b(https?|wss?|ftp):\/\/([^\s/@]+@)?([^\s/?#"'<>]+)([^\s?#"'<>]*)(\?[^\s#"'<>]*)?/g,
    replace: (_m, scheme, _cred, host, path, query) => `${scheme}://${_cred ? '<user>@' : ''}${host}${path ?? ''}${query ? '?<query>' : ''}`,
  },
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/gi, replace: () => '<email>' },
  {
    kind: 'path',
    re: /(\/Users\/|\/home\/|[A-Z]:\\Users\\|\/data\/user\/\d+\/|\/storage\/emulated\/\d+\/)([^/\\\s]+)/g,
    replace: (_m, base, name) => (base.startsWith('/data/user') || base.startsWith('/storage') ? `${base}${name}` : `${base}<user>`),
  },
  {
    kind: 'uuid',
    re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b(?:android_?id|device_?id|ssaid|gaid|adid|idfa)\s*[:=]\s*[\w-]{8,}/gi,
    replace: (m) => (/^[0-9a-f]{8}-/i.test(m) ? '<uuid>' : m.replace(/([:=]\s*)[\w-]+$/, '$1<id>')),
  },
  {
    kind: 'ip',
    re: /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b|\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi,
    replace: (m) => (/^(?:127\.0\.0\.1|0\.0\.0\.0)$/.test(m) ? m : '<ip>'),
  },
  { kind: 'phone', re: /(?<![\w.:#-])\+?\d{1,3}[ -]?\(?\d{2,4}\)?[ -]\d{3,4}[ -]?\d{3,4}(?![\w.-])/g, replace: () => '<phone>' },
  {
    kind: 'hex',
    // Long opaque strings: hashes, keys, signatures. Skip things that look like class names.
    re: /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[a-zA-Z])[A-Za-z0-9+/_-]{32,}={0,2}/g,
    replace: () => '<redacted>',
  },
];

export function redact(text: string, enabled: Record<RedactionKind, boolean>, counts: Partial<Record<RedactionKind, number>> = {}): string {
  let out = text;
  for (const rule of RULES) {
    if (!enabled[rule.kind]) continue;
    out = out.replace(rule.re, (...args) => {
      const m = args[0] as string;
      const groups = args.slice(1, -2) as string[];
      const next = rule.replace(m, ...groups);
      if (next !== m) counts[rule.kind] = (counts[rule.kind] ?? 0) + 1;
      return next;
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prompt

function fileOf(f: Frame): string | undefined {
  const m = f.location.match(/^([\w$-]+\.(?:kt|java|kts)):(\d+)$/);
  if (!m) return undefined;
  const outer = f.className.replace(/\$.*/, '');
  const dir = outer.split('.').slice(0, -1).join('/');
  return `${dir ? `${dir}/` : ''}${m[1]}:${m[2]}`;
}

const GOAL_TEXT: Record<Goal, string[]> = {
  fix: [
    'Find the root cause of this crash and fix it.',
    '- Start from the first app frame in the root cause, then follow the trace up.',
    '- Explain the cause in two or three sentences before changing code.',
    '- Keep the fix small and focused. Don\'t refactor unrelated code.',
    '- If the fix changes behaviour, say how to verify it.',
  ],
  explain: [
    'Explain why this crash happens. Don\'t change any code yet.',
    '- Start from the first app frame in the root cause, then follow the trace up.',
    '- Name the line that throws, what state leads there, and how a user can trigger it.',
    '- List the fixes you would consider, with trade-offs.',
  ],
  test: [
    'Reproduce this crash with a failing test, then fix it.',
    '- Start from the first app frame in the root cause, then follow the trace up.',
    '- Write the smallest unit or instrumented test that fails with this exception, and run it.',
    '- Then make the smallest change that makes it pass, and run the test again.',
    '- Don\'t refactor unrelated code.',
  ],
};

export function crashToPrompt(input: string, partial: Partial<CrashPromptOptions> = {}): CrashPromptResult {
  const o: CrashPromptOptions = { ...defaultCrashPromptOptions, ...partial, redact: { ...defaultCrashPromptOptions.redact, ...partial.redact } };
  const crash = parseCrash(input);
  const counts: Partial<Record<RedactionKind, number>> = {};
  const warnings: string[] = [];
  const pkg = o.appPackage.trim() || detectAppPackage(crash);
  const allFrames = crash.throwables.flatMap((t) => t.frames);
  const obfuscated = looksObfuscated(allFrames);

  let trace: string;
  let framesKept = 0;
  if (crash.throwables.length) {
    const parts: string[] = [];
    if (crash.thread) parts.push(`FATAL EXCEPTION: ${crash.thread}`);
    if (crash.process) parts.push(`Process: ${crash.process}`);
    for (const t of crash.throwables) {
      const prefix = t.kind === 'caused' ? 'Caused by: ' : t.kind === 'suppressed' ? 'Suppressed: ' : '';
      parts.push(`${prefix}${t.type}${t.message ? `: ${t.message}` : ''}`);
      const { lines, kept } = trimFrames(t.frames, pkg, Math.max(0, o.contextFrames));
      framesKept += kept;
      parts.push(...lines);
      if (t.more) parts.push(`\t... ${t.more} more`);
    }
    trace = parts.join('\n');
  } else {
    // Native crash or plain log: keep the last 80 non-empty lines.
    const lines = crash.other.filter((l) => l.trim());
    trace = lines.slice(-80).join('\n');
    if (lines.length > 80) warnings.push(`Kept the last 80 of ${lines.length} lines.`);
    if (!crash.native && lines.length) warnings.push('No Java or Kotlin exception found. The text is included as a log.');
  }
  trace = redact(trace, o.redact, counts);
  const notes = redact(o.notes.trim(), o.redact, counts);

  const root = [...crash.throwables].reverse().find((t) => t.kind !== 'suppressed');
  const rootCause = root ? { type: root.type, message: redact(root.message, o.redact) } : undefined;
  const files = [...new Set(crash.throwables.flatMap((t) => t.frames.filter((f) => isApp(f, pkg)).map(fileOf)).filter((f): f is string => !!f))].slice(0, 6);

  if (obfuscated) warnings.push('This trace looks obfuscated by R8. Retrace it with your mapping.txt first, or the agent will be guessing.');
  if (crash.native) warnings.push('This looks like a native (NDK) crash. Symbolicate it with ndk-stack first for useful frames.');
  if (crash.throwables.length && !files.length && !obfuscated) warnings.push(pkg ? `No frames from ${pkg} were found. Check the app package.` : 'Set your app package so app frames are kept.');

  const head = crash.throwables[0];
  const summary = head ? `${head.type}${head.message ? `: ${head.message.split('\n')[0]}` : ''}` : crash.native ? 'Native crash' : 'Crash';
  const sections = [
    `My Android app${pkg ? ` (\`${pkg}\`)` : ''} crashes${crash.thread ? ` on the \`${crash.thread}\` thread` : ''}.`,
    '',
    '## Crash',
    '',
    `- Exception: \`${redact(summary, o.redact)}\``,
    ...(rootCause && root !== head ? [`- Root cause: \`${rootCause.type}${rootCause.message ? `: ${rootCause.message.split('\n')[0]}` : ''}\``] : []),
    ...(files.length ? [`- App frames, top first: ${files.map((f) => `\`${f}\``).join(', ')}`] : []),
    '',
    '```text',
    trace,
    '```',
    ...(framesKept && framesKept < allFrames.length ? ['', `Framework frames are folded (${framesKept} of ${allFrames.length} frames shown).`] : []),
    ...(notes ? ['', '## Context', '', notes] : []),
    '',
    '## Task',
    '',
    ...GOAL_TEXT[o.goal],
  ];
  if (obfuscated) sections.push('- The trace is obfuscated, so treat class and method names as unreliable.');

  return {
    prompt: `${sections.join('\n')}\n`,
    trace,
    appPackage: pkg,
    rootCause,
    files,
    redactions: counts,
    obfuscated,
    framesKept,
    framesTotal: allFrames.length,
    warnings,
  };
}
