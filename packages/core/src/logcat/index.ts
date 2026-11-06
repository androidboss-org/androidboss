/**
 * Logcat and ANR trace reading: parse `adb logcat` output in its common
 * formats, filter it, and pick out crashes and ANRs; parse ART thread dumps
 * (`/data/anr/anr_*`, `traces.txt`, Play Console ANR clusters) and explain why
 * the main thread was stuck.
 *
 * Checked against real output from an Android 17 emulator (see fixtures/).
 */

export type Level = 'V' | 'D' | 'I' | 'W' | 'E' | 'F';

export const levels: Record<Level, string> = { V: 'Verbose', D: 'Debug', I: 'Info', W: 'Warn', E: 'Error', F: 'Fatal' };
const LEVEL_ORDER: Level[] = ['V', 'D', 'I', 'W', 'E', 'F'];

export interface LogEntry {
  /** 0-based index in the parsed list. */
  index: number;
  /** 1-based line in the input where the entry starts. */
  line: number;
  date?: string;
  time?: string;
  pid?: number;
  tid?: number;
  level: Level;
  tag: string;
  /** From the line (Android Studio format) or learnt from the log. */
  pkg?: string;
  message: string;
}

export type LogFormat = 'threadtime' | 'year' | 'studio' | 'time' | 'brief' | 'tag' | 'unknown';

export interface ParsedLog {
  entries: LogEntry[];
  format: LogFormat;
  /** Lines that didn't parse and couldn't be attached to an entry. */
  unparsed: number;
  /** pid → package, from Start proc / Process: / Studio lines. */
  packages: Map<number, string>;
}

// ---------------------------------------------------------------------------
// Line formats

interface Head {
  date?: string;
  time?: string;
  pid?: number;
  tid?: number;
  level: Level;
  tag: string;
  pkg?: string;
  message: string;
}

const lvl = (l: string): Level => (l === 'A' ? 'F' : (l as Level));

const FORMATS: [LogFormat, RegExp, (m: RegExpMatchArray) => Head][] = [
  // 11-03 04:04:52.264 19789 19789 E AndroidRuntime: FATAL EXCEPTION: main
  ['threadtime', /^(\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+(\d+) ([VDIWEFA]) (.*?)\s*: (.*)$/, (m) => ({ date: m[1], time: m[2], pid: +m[3]!, tid: +m[4]!, level: lvl(m[5]!), tag: m[6]!, message: m[7]! })],
  // 2026-11-03 04:05:11.209 25668 19889 E ActivityManager: ANR in …
  ['year', /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+(\d+) ([VDIWEFA]) (.*?)\s*: (.*)$/, (m) => ({ date: m[1], time: m[2], pid: +m[3]!, tid: +m[4]!, level: lvl(m[5]!), tag: m[6]!, message: m[7]! })],
  // Android Studio: 2026-11-03 04:04:52.264 19789-19789 AndroidRuntime  dev.androidboss.anrdemo  E  FATAL EXCEPTION: main
  ['studio', /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+)\s+(\d+)-(\d+)\s+(\S+)\s+(\S+)\s+([VDIWEFA])\s{1,2}(.*)$/, (m) => ({ date: m[1], time: m[2], pid: +m[3]!, tid: +m[4]!, tag: m[5]!, pkg: m[6] === 'system_process' || /^pid-\d+$/.test(m[6]!) ? undefined : m[6], level: lvl(m[7]!), message: m[8]! })],
  // 11-03 04:05:11.209 E/ActivityManager(25668): ANR in …
  ['time', /^(\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+) ([VDIWEFA])\/(.*?)\(\s*(\d+)\): (.*)$/, (m) => ({ date: m[1], time: m[2], level: lvl(m[3]!), tag: m[4]!.trim(), pid: +m[5]!, message: m[6]! })],
  // E/ActivityManager(25668): ANR in …
  ['brief', /^([VDIWEFA])\/(.*?)\(\s*(\d+)\): (.*)$/, (m) => ({ level: lvl(m[1]!), tag: m[2]!.trim(), pid: +m[3]!, message: m[4]! })],
  // E/ActivityManager: ANR in …
  ['tag', /^([VDIWEFA])\/([^:]+?)\s*: (.*)$/, (m) => ({ level: lvl(m[1]!), tag: m[2]!, message: m[3]! })],
];

function parseHead(line: string, prefer?: LogFormat): [LogFormat, Head] | undefined {
  const order = prefer ? [FORMATS.find((f) => f[0] === prefer)!, ...FORMATS.filter((f) => f[0] !== prefer)] : FORMATS;
  for (const [format, re, map] of order) {
    const m = line.match(re);
    if (m) return [format, map(m)];
  }
  return undefined;
}

const PKG = '[a-zA-Z][\\w]*(?:\\.[\\w]+)+';
const PKG_PATTERNS = [
  new RegExp(`Start proc (\\d+):(${PKG})`),
  new RegExp(`^Process: (${PKG})(?::\\w+)?, PID: (\\d+)`),
  new RegExp(`Process (${PKG}) \\(pid (\\d+)\\)`),
  new RegExp(`Process (\\d+) created for (${PKG})`),
  new RegExp(`Killing (\\d+):(${PKG})`),
  new RegExp(`ANR in (${PKG})[\\s\\S]*?PID: (\\d+)`),
];

function learnPackage(message: string, map: Map<number, string>) {
  for (const re of PKG_PATTERNS) {
    const m = message.match(re);
    if (!m) continue;
    const [a, b] = [m[1]!, m[2]!];
    const pid = /^\d+$/.test(a) ? +a : +b;
    const pkg = /^\d+$/.test(a) ? b : a;
    if (!map.has(pid)) map.set(pid, pkg);
  }
}

export function parseLogcat(text: string): ParsedLog {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const entries: LogEntry[] = [];
  const packages = new Map<number, string>();
  const counts = new Map<LogFormat, number>();
  let format: LogFormat | undefined;
  let unparsed = 0;
  let last: LogEntry | undefined;

  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (!line || /^-{9} (beginning of|switch to) /.test(line)) return;
    const parsed = parseHead(line, format);
    if (!parsed) {
      // Android Studio indents continuation lines; other tools paste raw lines.
      if (last) last.message += `\n${line.replace(/^ {20,}/, '')}`;
      else unparsed++;
      return;
    }
    const [f, h] = parsed;
    counts.set(f, (counts.get(f) ?? 0) + 1);
    if (!format && (counts.get(f) ?? 0) >= 3) format = f;
    if (h.pkg && h.pid) packages.set(h.pid, h.pkg);
    // Logcat splits multi-line messages into lines with the same header: join them.
    if (last && last.pid === h.pid && last.tid === h.tid && last.level === h.level && last.tag === h.tag && last.time === h.time && h.time) {
      last.message += `\n${h.message}`;
      return;
    }
    last = { index: entries.length, line: i + 1, ...h };
    entries.push(last);
  });

  for (const e of entries) learnPackage(e.message, packages);
  for (const e of entries) if (!e.pkg && e.pid !== undefined && packages.has(e.pid)) e.pkg = packages.get(e.pid);
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return { entries, format: best ?? 'unknown', unparsed, packages };
}

// ---------------------------------------------------------------------------
// Filtering

export interface LogFilter {
  minLevel: Level;
  /** Space-separated; `-tag` excludes. Case-insensitive, matches the start of the tag. */
  tags: string;
  /** Package name or pid; empty for all. */
  pkg: string;
  /** Plain text, or /regex/flags. */
  text: string;
}

export const defaultLogFilter: LogFilter = { minLevel: 'V', tags: '', pkg: '', text: '' };

export class FilterError extends Error {}

export function textMatcher(text: string): (s: string) => boolean {
  const t = text.trim();
  if (!t) return () => true;
  const re = t.match(/^\/(.+)\/([a-z]*)$/);
  if (re) {
    try {
      const r = new RegExp(re[1]!, re[2]!.replace(/g/g, ''));
      return (s) => r.test(s);
    } catch (e) {
      throw new FilterError(`Invalid regex: ${(e as Error).message}`);
    }
  }
  const lower = t.toLowerCase();
  return (s) => s.toLowerCase().includes(lower);
}

export function filterEntries(entries: LogEntry[], f: Partial<LogFilter>): LogEntry[] {
  const o = { ...defaultLogFilter, ...f };
  const min = LEVEL_ORDER.indexOf(o.minLevel);
  const words = o.tags.split(/[\s,]+/).filter(Boolean).map((w) => w.toLowerCase());
  const include = words.filter((w) => !w.startsWith('-'));
  const exclude = words.filter((w) => w.startsWith('-')).map((w) => w.slice(1));
  const pkg = o.pkg.trim().toLowerCase();
  const text = textMatcher(o.text);
  return entries.filter((e) => {
    if (LEVEL_ORDER.indexOf(e.level) < min) return false;
    const tag = e.tag.toLowerCase();
    if (include.length && !include.some((w) => tag.startsWith(w))) return false;
    if (exclude.some((w) => tag.startsWith(w))) return false;
    if (pkg && !(/^\d+$/.test(pkg) ? String(e.pid) === pkg : (e.pkg ?? '').toLowerCase().startsWith(pkg))) return false;
    return text(`${e.tag} ${e.message}`);
  });
}

// ---------------------------------------------------------------------------
// Issues

export type IssueKind = 'crash' | 'native-crash' | 'anr' | 'oom' | 'strictmode' | 'jank' | 'died';

export interface Issue {
  kind: IssueKind;
  /** Entry index where it starts. */
  index: number;
  title: string;
  detail?: string;
  pkg?: string;
  pid?: number;
  /** The crash text, ready for Crash to Agent Prompt. */
  text?: string;
}

export const issueLabels: Record<IssueKind, string> = {
  crash: 'Crash',
  'native-crash': 'Native crash',
  anr: 'ANR',
  oom: 'Out of memory',
  strictmode: 'StrictMode',
  jank: 'Dropped frames',
  died: 'Process died',
};

/** The message plus following lines with the same header (formats without timestamps don't join them). */
function block(entries: LogEntry[], e: LogEntry): string {
  if (e.time) return e.message;
  const parts = [e.message];
  for (let i = e.index + 1; i < entries.length; i++) {
    const n = entries[i]!;
    if (n.tag !== e.tag || n.pid !== e.pid || n.level !== e.level) break;
    parts.push(n.message);
  }
  return parts.join('\n');
}

export function findIssues(log: ParsedLog): Issue[] {
  const out: Issue[] = [];
  let skipped = 0;
  let jankAt = -1;
  for (const e of log.entries) {
    const m = /FATAL EXCEPTION|^ANR in /.test(e.message) ? block(log.entries, e) : e.message;
    if (e.tag === 'AndroidRuntime' && /FATAL EXCEPTION/.test(m)) {
      const proc = m.match(/Process: ([\w.:]+), PID: (\d+)/);
      const ex = m.split('\n').find((l) => /^[\w$.]+(Exception|Error|Throwable)\b/.test(l.trim()))?.trim() ?? 'Uncaught exception';
      out.push({ kind: 'crash', index: e.index, title: ex, pkg: proc?.[1] ?? e.pkg, pid: proc ? +proc[2]! : e.pid, text: m });
    } else if (/Fatal signal \d+ \(SIG\w+\)/.test(m)) {
      const sig = m.match(/Fatal signal \d+ \((SIG\w+)\)[^,]*(?:, code[^,]*)?/)?.[0] ?? 'Fatal signal';
      const proc = m.match(/pid \d+ \(([\w.:]+)\)/)?.[1];
      out.push({ kind: 'native-crash', index: e.index, title: sig, pkg: proc ?? e.pkg, pid: e.pid, text: m });
    } else if (e.tag === 'ActivityManager' && /^ANR in /.test(m)) {
      const pkg = m.match(/^ANR in ([\w.:]+)/)?.[1];
      const reason = m.match(/Reason: (.*)/)?.[1]?.trim();
      const pid = m.match(/PID: (\d+)/)?.[1];
      out.push({ kind: 'anr', index: e.index, title: `ANR in ${pkg}`, detail: reason, pkg, pid: pid ? +pid : undefined, text: m });
    } else if (/java\.lang\.OutOfMemoryError/.test(m) && !out.some((i) => i.kind === 'crash' && i.index === e.index)) {
      out.push({ kind: 'oom', index: e.index, title: m.match(/java\.lang\.OutOfMemoryError[^\n]*/)![0], pkg: e.pkg, pid: e.pid });
    } else if (e.tag === 'StrictMode' && /policy violation/i.test(m)) {
      out.push({ kind: 'strictmode', index: e.index, title: m.split('\n')[0]!.slice(0, 160), pkg: e.pkg, pid: e.pid });
    } else if (e.tag === 'Choreographer' && /Skipped (\d+) frames/.test(m)) {
      skipped += +m.match(/Skipped (\d+) frames/)![1]!;
      if (jankAt < 0) jankAt = e.index;
    } else if (e.tag === 'ActivityManager' && /^Process ([\w.:]+) \(pid (\d+)\) has died/.test(m)) {
      const [, pkg, pid] = m.match(/^Process ([\w.:]+) \(pid (\d+)\) has died/)!;
      out.push({ kind: 'died', index: e.index, title: `${pkg} died`, pkg, pid: +pid! });
    }
  }
  if (skipped) out.push({ kind: 'jank', index: jankAt, title: `${skipped} frames skipped on main threads`, detail: 'Choreographer reports work on the main thread that took longer than a frame.' });
  return out.sort((a, b) => a.index - b.index);
}

// ---------------------------------------------------------------------------
// ANR traces

export interface ThreadDump {
  name: string;
  daemon: boolean;
  tid?: number;
  sysTid?: number;
  /** Runnable, Blocked, Waiting, TimedWaiting, Sleeping, Native, Suspended, … */
  state: string;
  frames: string[];
  /** Lock this thread is waiting for, and the tid holding it. */
  waitingFor?: { lock: string; type: string; heldBy?: number };
  locked: string[];
}

export interface ProcessDump {
  pid: number;
  cmdLine: string;
  time?: string;
  threads: ThreadDump[];
}

export interface AnrTrace {
  subject?: string;
  processes: ProcessDump[];
}

const PROCESS_START = /^----- pid (\d+) at (.+?) -----$/;
const THREAD = /^"(.+)"( daemon)? prio=\d+ (?:tid=(\d+) )?(\w+)/;
const NOT_ATTACHED = /^"(.+)"( daemon)? prio=\d+ \(not attached\)/;

export function isAnrTrace(text: string): boolean {
  return /^----- pid \d+ at /m.test(text) || /^"main" (daemon )?prio=\d+ tid=1 \w+/m.test(text);
}

export function parseAnrTrace(text: string): AnrTrace {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const trace: AnrTrace = { processes: [], subject: text.match(/^Subject: (.+)$/m)?.[1] };
  let proc: ProcessDump | undefined;
  let thread: ThreadDump | undefined;

  const ensureProc = () => (proc ??= (trace.processes.push({ pid: 0, cmdLine: '', threads: [] }), trace.processes[trace.processes.length - 1]!));

  for (const line of lines) {
    const p = line.match(PROCESS_START);
    if (p) {
      proc = { pid: +p[1]!, cmdLine: '', time: p[2], threads: [] };
      trace.processes.push(proc);
      thread = undefined;
      continue;
    }
    if (/^----- end \d+ -----$/.test(line)) {
      proc = undefined;
      thread = undefined;
      continue;
    }
    const cmd = line.match(/^Cmd line: (.+)$/);
    if (cmd) {
      ensureProc().cmdLine = cmd[1]!.trim();
      continue;
    }
    const t = line.match(THREAD) ?? line.match(NOT_ATTACHED);
    if (t && /^"/.test(line)) {
      thread = { name: t[1]!, daemon: !!t[2], tid: t[3] ? +t[3] : undefined, state: t[4] ?? 'Native', frames: [], locked: [] };
      if (NOT_ATTACHED.test(line)) thread.state = 'Native';
      ensureProc().threads.push(thread);
      continue;
    }
    if (!thread) continue;
    const trimmed = line.trim();
    if (!trimmed) {
      thread = undefined;
      continue;
    }
    const sys = trimmed.match(/sysTid=(\d+)/);
    if (sys && trimmed.startsWith('|')) {
      thread.sysTid = +sys[1]!;
      continue;
    }
    if (trimmed.startsWith('|')) continue;
    const wait = trimmed.match(/^- waiting to lock <(0x[0-9a-f]+)> \(a ([\w.$]+)\)(?: held by thread (\d+))?/);
    if (wait) {
      thread.waitingFor = { lock: wait[1]!, type: wait[2]!, heldBy: wait[3] ? +wait[3] : undefined };
      continue;
    }
    const waitOn = trimmed.match(/^- waiting on <(0x[0-9a-f]+)> \(a ([\w.$]+)\)/);
    if (waitOn) {
      thread.waitingFor ??= { lock: waitOn[1]!, type: waitOn[2]! };
      continue;
    }
    const locked = trimmed.match(/^- locked <(0x[0-9a-f]+)>/);
    if (locked) {
      thread.locked.push(locked[1]!);
      continue;
    }
    if (/^(at |native: )/.test(trimmed)) thread.frames.push(trimmed);
  }
  return trace;
}

export type Cause = 'deadlock' | 'lock' | 'binder' | 'io' | 'network' | 'wait' | 'sleep' | 'idle' | 'busy' | 'native' | 'unknown';

export interface AnrDiagnosis {
  process: ProcessDump;
  main?: ThreadDump;
  cause: Cause;
  summary: string;
  /** Threads involved, main first. */
  chain: ThreadDump[];
  /** First frame from the app (not android., java., kotlin. …). */
  appFrame?: string;
}

const SYSTEM_FRAME = /^at (android\.|androidx\.|java\.|javax\.|jdk\.|sun\.|dalvik\.|libcore\.|kotlin\.|kotlinx\.|com\.android\.|com\.google\.android\.|org\.apache\.)/;

const PATTERNS: [Cause, RegExp, string][] = [
  ['binder', /BinderProxy\.transact|android\.os\.BinderProxy|IPCThreadState::(talkWithDriver|transact)/, 'waiting for a binder call to another process'],
  ['io', /java\.io\.(File|RandomAccessFile)|libcore\.io\.(Linux|IoBridge|BlockGuardOs)\.(read|write|open|fsync)|SharedPreferencesImpl|android\.database\.sqlite|androidx\.sqlite|FileDescriptor\.sync|ContentResolver\.query/, 'doing disk or database I/O'],
  ['network', /java\.net\.|okhttp3\.|SocketInputStream|InetAddress\.|SSLSocket|NativeCrypto\.SSL_/, 'doing network I/O'],
  ['wait', /Object\.wait|LockSupport\.park|CountDownLatch\.await|FutureTask\.(get|awaitDone)|BlockingCoroutine\.joinBlocking|runBlocking|Thread\.join|Semaphore\.acquire/, 'waiting for another thread (await, get, join or runBlocking)'],
  ['sleep', /Thread\.sleep/, 'sleeping (Thread.sleep)'],
];

function threadLabel(t: ThreadDump): string {
  return `"${t.name}"${t.tid !== undefined ? ` (tid ${t.tid})` : ''}`;
}

export function diagnoseAnr(proc: ProcessDump): AnrDiagnosis {
  const main = proc.threads.find((t) => t.tid === 1) ?? proc.threads.find((t) => t.name === 'main');
  const base = { process: proc, main };
  if (!main) return { ...base, cause: 'unknown', summary: 'No main thread in this dump.', chain: [] };
  const appFrame = main.frames.find((f) => f.startsWith('at ') && !SYSTEM_FRAME.test(f));
  const top = main.frames.slice(0, 12).join('\n');
  const byTid = new Map(proc.threads.filter((t) => t.tid !== undefined).map((t) => [t.tid!, t]));

  if (main.waitingFor?.heldBy !== undefined) {
    const chain: ThreadDump[] = [main];
    let cur: ThreadDump | undefined = main;
    while (cur?.waitingFor?.heldBy !== undefined) {
      const next = byTid.get(cur.waitingFor.heldBy);
      if (!next) break;
      if (chain.includes(next)) {
        const loop = chain.slice(chain.indexOf(next)).map(threadLabel).join(' → ');
        return { ...base, cause: 'deadlock', chain, appFrame, summary: `Deadlock: ${loop} → ${threadLabel(next)}. Each thread holds a lock the next one needs. Acquire the locks in the same order everywhere, or don’t hold one while taking another.` };
      }
      chain.push(next);
      cur = next;
    }
    const holder = chain[1];
    return {
      ...base,
      cause: 'lock',
      chain,
      appFrame,
      summary: holder
        ? `The main thread is blocked on a lock (<${main.waitingFor.lock}>, a ${main.waitingFor.type}) held by ${threadLabel(holder)}, which is ${holder.state}${holder.frames[0] ? ` in ${holder.frames[0].replace(/^at /, '')}` : ''}. Move the work that needs this lock off the main thread, or shorten how long it’s held.`
        : `The main thread is blocked on a lock held by thread ${main.waitingFor.heldBy}, which isn’t in the dump.`,
    };
  }
  for (const [cause, re, what] of PATTERNS)
    if (re.test(top)) return { ...base, cause, chain: [main], appFrame, summary: `The main thread is ${what}${appFrame ? `, called from ${appFrame.replace(/^at /, '')}` : ''}. Move it to a background thread or coroutine.` };
  if (/MessageQueue\.nativePollOnce/.test(top))
    return { ...base, cause: 'idle', chain: [main], appFrame, summary: 'The main thread is idle, waiting for messages. The dump was taken after the block ended, or the ANR came from a broadcast receiver or service timeout. Check the ANR reason in Logcat and look at the other threads.' };
  if (main.state === 'Native') return { ...base, cause: 'native', chain: [main], appFrame, summary: `The main thread is in native code${appFrame ? `, called from ${appFrame.replace(/^at /, '')}` : ''}.` };
  if (main.state === 'Runnable' && appFrame) return { ...base, cause: 'busy', chain: [main], appFrame, summary: `The main thread is busy running ${appFrame.replace(/^at /, '')}. Long work on the main thread blocks input; move it to a background thread.` };
  return { ...base, cause: 'unknown', chain: [main], appFrame, summary: `The main thread is ${main.state}.` };
}
