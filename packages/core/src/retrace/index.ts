/**
 * Retrace: turn an R8/ProGuard-obfuscated stack trace back into original class,
 * method, file and line names using mapping.txt.
 *
 * Supports the R8 mapping format (version 2.x): line ranges, inlined frames
 * (consecutive entries with the same obfuscated range, innermost first), methods
 * inlined from other classes, sourceFile metadata and rewriteFrame rules for the
 * thrown exception. Checked against Google's `retrace` on real R8 output (see
 * fixtures/). Not supported: outlines (com.android.tools.r8.outline), partition
 * maps. Frames that can't be resolved are left as they were.
 */

interface MemberEntry {
  obfName: string;
  obfStart?: number;
  obfEnd?: number;
  /** Fully qualified class when the method was inlined from another class. */
  ownerClass?: string;
  methodName: string;
  signature: string;
  origStart?: number;
  origEnd?: number;
  rewrite?: { exception: string; removeInner: number };
}

interface ClassMapping {
  original: string;
  obfuscated: string;
  sourceFile?: string;
  members: MemberEntry[];
}

export interface Mapping {
  byObfuscated: Map<string, ClassMapping>;
  byOriginal: Map<string, ClassMapping>;
  compilerVersion?: string;
}

const CLASS_LINE = /^(\S+)\s+->\s+(\S+):\s*$/;
// [obfStart:obfEnd:]type [owner.]name(args)[:origStart[:origEnd]] -> obfName
const MEMBER_LINE = /^\s+(?:(\d+):(\d+):)?(\S+)\s+([^\s(]+)\(([^)]*)\)(?::(\d+)(?::(\d+))?)?\s+->\s+(\S+)\s*$/;
const FIELD_LINE = /^\s+(\S+)\s+([^\s(]+)\s+->\s+(\S+)\s*$/;

export function parseMapping(text: string): Mapping {
  const byObfuscated = new Map<string, ClassMapping>();
  const byOriginal = new Map<string, ClassMapping>();
  let compilerVersion: string | undefined;
  let current: ClassMapping | undefined;
  let lastMember: MemberEntry | undefined;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const trimmed = raw.trim();

    if (trimmed.startsWith('#')) {
      const version = trimmed.match(/^#\s*compiler_version:\s*(\S+)/);
      if (version) compilerVersion = version[1];
      const json = trimmed.slice(1).trim();
      if (!json.startsWith('{')) continue;
      let meta: { id?: string; fileName?: string; conditions?: string[]; actions?: string[] };
      try {
        meta = JSON.parse(json);
      } catch {
        continue;
      }
      if (meta.id === 'sourceFile' && current && !raw.startsWith(' ')) current.sourceFile = meta.fileName;
      if (meta.id === 'com.android.tools.r8.rewriteFrame' && lastMember && raw.startsWith(' ')) {
        const exception = meta.conditions?.map((c) => c.match(/^throws\(L(.+);\)$/)?.[1]).find(Boolean);
        const remove = meta.actions?.map((a) => a.match(/^removeInnerFrames\((\d+)\)$/)?.[1]).find(Boolean);
        if (exception && remove) lastMember.rewrite = { exception: exception.replace(/\//g, '.'), removeInner: Number(remove) };
      }
      continue;
    }

    const cls = raw.match(CLASS_LINE);
    if (cls && !raw.startsWith(' ')) {
      current = { original: cls[1]!, obfuscated: cls[2]!, members: [] };
      byObfuscated.set(current.obfuscated, current);
      byOriginal.set(current.original, current);
      lastMember = undefined;
      continue;
    }
    if (!current) continue;

    const m = raw.match(MEMBER_LINE);
    if (m) {
      const [, os, oe, type, qualified, args, ls, le, obf] = m;
      const dot = qualified!.lastIndexOf('.');
      lastMember = {
        obfName: obf!,
        obfStart: os === undefined ? undefined : Number(os),
        obfEnd: oe === undefined ? undefined : Number(oe),
        ownerClass: dot > 0 ? qualified!.slice(0, dot) : undefined,
        methodName: dot > 0 ? qualified!.slice(dot + 1) : qualified!,
        signature: `${type} ${dot > 0 ? qualified!.slice(dot + 1) : qualified}(${args})`,
        origStart: ls === undefined ? undefined : Number(ls),
        origEnd: le === undefined ? undefined : Number(le),
      };
      current.members.push(lastMember);
      continue;
    }
    if (FIELD_LINE.test(raw)) lastMember = undefined;
  }
  return { byObfuscated, byOriginal, compilerVersion };
}

export interface RetracedFrame {
  className: string;
  methodName: string;
  signature: string;
  fileName: string;
  line?: number;
}

/** Splits consecutive entries that share an obfuscated range into inline chains. */
function chains(members: MemberEntry[], name: string): MemberEntry[][] {
  const out: MemberEntry[][] = [];
  let chain: MemberEntry[] = [];
  let prev: MemberEntry | undefined;
  for (const e of members) {
    if (e.obfName !== name) {
      if (chain.length) out.push(chain);
      chain = [];
      prev = undefined;
      continue;
    }
    const sameRange = prev && prev.obfStart !== undefined && prev.obfStart === e.obfStart && prev.obfEnd === e.obfEnd;
    if (!sameRange && chain.length) {
      out.push(chain);
      chain = [];
    }
    chain.push(e);
    prev = e;
  }
  if (chain.length) out.push(chain);
  return out;
}

function originalLine(e: MemberEntry, obfLine: number | undefined, innermost: boolean): number | undefined {
  if (e.origStart === undefined) return undefined;
  if (obfLine === undefined || e.obfStart === undefined) return e.origStart;
  if (!innermost || e.origEnd === undefined) return e.origStart;
  const obfSpan = (e.obfEnd ?? e.obfStart) - e.obfStart;
  const origSpan = e.origEnd - e.origStart;
  return obfSpan === origSpan ? e.origStart + (obfLine - e.obfStart) : e.origStart;
}

function fileFor(mapping: Mapping, className: string, fallback?: string): string {
  const cls = mapping.byOriginal.get(className);
  if (cls?.sourceFile) return cls.sourceFile;
  if (fallback && !/^r8-map-id-|^SourceFile$|^Unknown Source$/.test(fallback)) return fallback;
  const simple = className.slice(className.lastIndexOf('.') + 1).split('$')[0];
  return `${simple}.java`;
}

/**
 * Retraces one frame. Returns alternatives when the obfuscated name is ambiguous;
 * each alternative is an inline chain (innermost first). Returns null when the
 * class isn't in the mapping.
 */
export function retraceFrame(
  mapping: Mapping,
  obfClass: string,
  obfMethod: string,
  line: number | undefined,
  sourceFile?: string,
  thrown?: string,
): RetracedFrame[][] | null {
  const cls = mapping.byObfuscated.get(obfClass);
  if (!cls) return null;
  let candidates = chains(cls.members, obfMethod);
  if (line !== undefined) {
    const inRange = candidates.filter((c) => c[0]!.obfStart !== undefined && line >= c[0]!.obfStart && line <= (c[0]!.obfEnd ?? c[0]!.obfStart));
    if (inRange.length) candidates = inRange;
    else {
      const noRange = candidates.filter((c) => c[0]!.obfStart === undefined);
      if (noRange.length) candidates = noRange;
    }
  }
  if (!candidates.length) {
    // Class mapped, method not renamed (or unknown): keep the method name.
    return [[{ className: cls.original, methodName: obfMethod, signature: obfMethod, fileName: fileFor(mapping, cls.original, sourceFile), line }]];
  }

  // Distinct alternatives only (same outermost method → same answer without a line).
  const seen = new Set<string>();
  const result: RetracedFrame[][] = [];
  for (const chain of candidates) {
    let entries = chain;
    const rewrite = chain[0]!.rewrite;
    if (thrown && rewrite && rewrite.exception === thrown) entries = chain.slice(rewrite.removeInner);
    const frames = entries.map((e, i) => {
      const className = e.ownerClass ?? cls.original;
      return { className, methodName: e.methodName, signature: e.signature, fileName: fileFor(mapping, className, sourceFile), line: originalLine(e, line, i === 0) };
    });
    const key = frames.map((f) => `${f.className}.${f.methodName}:${f.line ?? ''}`).join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(frames);
    }
  }
  // Same order as Google's retrace: alphabetical by class, then method.
  return result.sort((a, b) => {
    const ka = `${a[a.length - 1]!.className}.${a[0]!.methodName}`;
    const kb = `${b[b.length - 1]!.className}.${b[0]!.methodName}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

// at [module/]class.method(Source[:line])
const FRAME = /^(.*?\bat\s+)((?:[\w.$-]+\/)?)([\w$.]+)\.([\w$<>-]+)\(([^:)]*)(?::(\d+))?\)(.*)$/;
// Exception headers: "a.b.c: message", "Caused by: a.b.c", "Exception in thread "x" a.b.c: …", with optional logcat prefix.
const HEADER = /^(.*?(?:Caused by:\s*|Suppressed:\s*|Exception in thread "[^"]*"\s*|^\s*|AndroidRuntime:\s*))([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+)(:.*|\s*)$/;

export interface RetraceResult {
  text: string;
  framesTotal: number;
  framesRetraced: number;
  ambiguous: number;
}

export function retrace(mappingText: string | Mapping, trace: string): RetraceResult {
  const mapping = typeof mappingText === 'string' ? parseMapping(mappingText) : mappingText;
  const out: string[] = [];
  let framesTotal = 0;
  let framesRetraced = 0;
  let ambiguous = 0;
  let thrown: string | undefined;
  let firstFrameAfterHeader = false;

  for (const line of trace.split(/\r?\n/)) {
    const f = line.match(FRAME);
    if (f) {
      framesTotal++;
      const [, prefix, module, obfClass, obfMethod, source, lineNo, suffix] = f;
      const alternatives = retraceFrame(mapping, obfClass!, obfMethod!, lineNo === undefined ? undefined : Number(lineNo), source, firstFrameAfterHeader ? thrown : undefined);
      firstFrameAfterHeader = false;
      if (!alternatives) {
        out.push(line);
        continue;
      }
      framesRetraced++;
      if (alternatives.length > 1) ambiguous++;
      const indent = prefix!.replace(/\bat\s+$/, '');
      alternatives.forEach((frames, i) => {
        frames.forEach((fr, j) => {
          const loc = `${fr.fileName}${fr.line === undefined || fr.line === 0 ? '' : `:${fr.line}`}`;
          const lead = i > 0 && j === 0 ? `${indent}<OR> at ` : prefix;
          out.push(`${lead}${module}${fr.className}.${fr.methodName}(${loc})${j === frames.length - 1 ? suffix : ''}`);
        });
      });
      continue;
    }

    // Exception header: map only the exception class, never words inside the message.
    const header = line.match(HEADER);
    if (header) {
      const [, lead, name, rest] = header;
      const original = mapping.byObfuscated.get(name!)?.original ?? name!;
      thrown = original;
      firstFrameAfterHeader = true;
      out.push(`${lead}${original}${rest}`);
      continue;
    }
    out.push(line);
  }
  return { text: out.join('\n'), framesTotal, framesRetraced, ambiguous };
}
