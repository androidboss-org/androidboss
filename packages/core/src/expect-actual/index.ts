/**
 * Generates `actual` declarations and file layout for Kotlin Multiplatform
 * `expect` declarations, plus ready-made templates with real platform code.
 *
 * Everything here was compiled with Kotlin 2.4.21 and AGP 9.5.0 for Android,
 * JVM, iosSimulatorArm64, JS and Wasm (see expect-actual.gradle.test.ts).
 */

import { closing, mask, splitTopLevel } from '../kotlin-source/index.ts';

export const EXPECT_ACTUAL_CHECKED_WITH = { kotlin: '2.4.21', agp: '9.5.0' } as const;

export type Target = 'android' | 'ios' | 'jvm' | 'js' | 'wasmJs';

export const TARGETS: { id: Target; label: string; sourceSet: string; suffix: string }[] = [
  { id: 'android', label: 'Android', sourceSet: 'androidMain', suffix: 'android' },
  { id: 'ios', label: 'iOS', sourceSet: 'iosMain', suffix: 'ios' },
  { id: 'jvm', label: 'Desktop (JVM)', sourceSet: 'jvmMain', suffix: 'jvm' },
  // webMain is shared by JS and Wasm, but kotlinx.browser doesn't resolve there for Wasm, so each gets its own file.
  { id: 'js', label: 'Web (JS)', sourceSet: 'jsMain', suffix: 'js' },
  { id: 'wasmJs', label: 'Web (Wasm)', sourceSet: 'wasmJsMain', suffix: 'wasmJs' },
];

export interface GeneratedFile {
  path: string;
  sourceSet: string;
  content: string;
}

export interface Notice {
  level: 'error' | 'warning' | 'info';
  text: string;
}

export interface Generated {
  files: GeneratedFile[];
  notices: Notice[];
  /** Whether the code declares expect classes, objects, interfaces or enums (Beta; needs the compiler flag to silence the warning). */
  usesExpectClasses: boolean;
}

/** Removes `= default` from each parameter: actual declarations may not repeat default values. */
export function stripDefaults(params: string): { params: string; stripped: boolean } {
  let stripped = false;
  const out = splitTopLevel(params).map((p) => {
    const m = mask(p);
    let depth = 0;
    for (let i = 0; i < m.length; i++) {
      const c = m[i]!;
      if ('(<[{'.includes(c)) depth++;
      else if (')]}'.includes(c) || (c === '>' && m[i - 1] !== '-')) depth--;
      else if (c === '=' && depth === 0 && m[i + 1] !== '>' && m[i - 1] !== '!' && m[i - 1] !== '=') {
        stripped = true;
        return p.slice(0, i).trimEnd();
      }
    }
    return p;
  });
  return { params: out.join(','), stripped };
}

interface Decl {
  /** Text from the first modifier/annotation to the end of the declaration. */
  text: string;
  kind: 'fun' | 'val' | 'var' | 'class' | 'interface' | 'object' | 'enum' | 'annotation' | 'typealias' | 'unknown';
}

const KIND = /\b(fun|val|var|enum\s+class|annotation\s+class|class|interface|object|typealias)\b/;

/** Finds declarations at depth 0 of `m` (masked) that carry the `expect` modifier. */
function findExpects(src: string, m: string): Decl[] {
  const decls: Decl[] = [];
  const re = /(^|[\s;}])expect\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(m))) {
    const at = match.index + match[1]!.length;
    // Only top level: count braces before.
    let depth = 0;
    for (let i = 0; i < at; i++) depth += m[i] === '{' ? 1 : m[i] === '}' ? -1 : 0;
    if (depth !== 0) continue;
    // Pull in annotations and modifiers on the same or previous lines.
    let start = at;
    const before = m.slice(0, at);
    const lead = before.match(/((?:@[\w.]+(?:\([^()]*\))?\s*|\b(?:public|internal|private|protected|inline|infix|operator|suspend|tailrec|external|data|sealed|abstract|open|value|fun|inner)\s+)*)$/);
    if (lead) start = at - lead[1]!.length;
    const kindMatch = KIND.exec(m.slice(at));
    const kindWord = kindMatch?.[1]?.replace(/\s+/g, ' ');
    const kind: Decl['kind'] =
      kindWord === 'enum class' ? 'enum' : kindWord === 'annotation class' ? 'annotation' : ((kindWord as Decl['kind']) ?? 'unknown');
    const end = declEnd(m, at + (kindMatch?.index ?? 0), kind);
    decls.push({ text: src.slice(start, end).trim(), kind });
    re.lastIndex = end;
  }
  return decls;
}

/** End of a declaration starting at `from` (the kind keyword) in masked text. */
function declEnd(m: string, from: number, kind: Decl['kind']): number {
  let i = from;
  // Walk to the end of the header: a newline at depth 0 that isn't followed by a continuation, or a body brace.
  let depth = 0;
  for (; i < m.length; i++) {
    const c = m[i]!;
    if (c === '(' || c === '[' || (c === '<' && kind !== 'unknown')) depth++;
    else if (c === ')' || c === ']' || (c === '>' && m[i - 1] !== '-' && depth > 0)) depth--;
    else if (depth === 0 && c === '{') return closing(m, i) + 1;
    else if (depth === 0 && (c === '\n' || c === ';')) {
      const rest = m.slice(i + 1);
      // Continues on the next line with ':' (return type), '=' or 'where'.
      if (/^\s*(:|where\b|\{|,)/.test(rest) && kind !== 'val' && kind !== 'var') continue;
      if (/^\s*(:|\{)/.test(rest) && (kind === 'val' || kind === 'var')) continue;
      return i;
    }
  }
  return m.length;
}

const todo = (what: string, target: string) => `TODO("${what} on ${target}")`;

/** Turns one expect declaration into its actual stub. */
export function actualFor(declText: string, targetLabel: string, notices: Notice[] = [], abstractMember = false): string {
  const m = mask(declText);
  const kindMatch = KIND.exec(m);
  if (!kindMatch) return `// Couldn't read this declaration:\n// ${declText.split('\n').join('\n// ')}`;
  const kind = kindMatch[1]!.replace(/\s+/g, ' ');
  const head = declText.slice(0, kindMatch.index).replace(/\bexpect\b/, 'actual');

  if (kind === 'fun') {
    const open = m.indexOf('(', kindMatch.index);
    const close = closing(m, open);
    // Anything after the return type that starts with = or { is a body, which expect functions can't have.
    const rt = /^\s*:[^{=]*/.exec(m.slice(close + 1))?.[0].length ?? 0;
    const bodyAt = /^\s*[={]/.test(m.slice(close + 1 + rt)) ? close + 1 + rt : declText.length;
    if (bodyAt < declText.length) notices.push({ level: 'error', text: `An expect function can't have a body: ${firstLine(declText)}` });
    const { params, stripped } = stripDefaults(declText.slice(open + 1, close));
    if (stripped) notices.push({ level: 'info', text: `Default values stay on the expect side only; Kotlin rejects them on actual functions (${name(declText)}).` });
    const sig = declText.slice(kindMatch.index, open + 1) + params + ')' + declText.slice(close + 1, bodyAt).replace(/\s*$/, '');
    // Interface and abstract members stay abstract: a body would change their modality and break the match.
    if (abstractMember || /\babstract\b/.test(head)) return `${head}${sig}`;
    // Without a declared return type, `= TODO()` would infer Nothing and no longer match the expect.
    return rt ? `${head}${sig} = ${todo(`${name(declText)}()`, targetLabel)}` : `${head}${sig} {\n    ${todo(`${name(declText)}()`, targetLabel)}\n}`;
  }
  if (kind === 'val' || kind === 'var') {
    const sig = declText.slice(kindMatch.index).trim();
    if (!/:/.test(mask(sig))) notices.push({ level: 'error', text: `An expect property needs an explicit type: ${firstLine(declText)}` });
    if (abstractMember || /\babstract\b/.test(head)) return `${head}${sig}`;
    const getter = `get() = ${todo(name(declText), targetLabel)}`;
    return kind === 'val' ? `${head}${sig}\n    ${getter}` : `${head}${sig}\n    ${getter}\n    set(value) = ${todo(`${name(declText)} setter`, targetLabel)}`;
  }
  if (kind === 'typealias' || kind === 'annotation') {
    return `${head}${declText.slice(kindMatch.index)}`;
  }
  // class, interface, object, enum class
  const brace = m.indexOf('{', kindMatch.index);
  const header = (brace < 0 ? declText.slice(kindMatch.index) : declText.slice(kindMatch.index, brace)).trimEnd();
  let outHeader = header;
  // Primary constructor → `actual constructor(...)` without defaults. If the class also has secondary
  // constructors, the primary becomes a secondary one too: a stub can't delegate to it with this(...).
  const hasSecondary = brace >= 0 && /(^|\n)\s*(?:(?:public|internal|private|protected)\s+)?constructor\s*\(/.test(m.slice(brace + 1, closing(m, brace)));
  let primaryAsSecondary = '';
  const hm = mask(header);
  const nameMatch = /^(?:enum\s+class|class|interface|object)\s+([\w]+)\s*(<)?/.exec(hm);
  if (nameMatch && (kind === 'class' || kind === 'enum class')) {
    let after = nameMatch[0].length;
    if (nameMatch[2]) after = closing(hm, nameMatch[0].length - 1) + 1;
    const ctorAt = hm.slice(after).search(/\S/);
    const ctorIdx = ctorAt < 0 ? -1 : after + ctorAt;
    if (ctorIdx >= 0 && (hm[ctorIdx] === '(' || hm.slice(ctorIdx).startsWith('constructor'))) {
      const open = hm.indexOf('(', ctorIdx);
      const close = closing(hm, open);
      const { params, stripped } = stripDefaults(header.slice(open + 1, close));
      if (stripped) notices.push({ level: 'info', text: `Constructor default values stay on the expect side only (${nameMatch[1]}).` });
      if (hasSecondary) {
        outHeader = `${header.slice(0, after).trimEnd()}${header.slice(close + 1)}`;
        primaryAsSecondary = `    actual constructor(${params})`;
      } else outHeader = `${header.slice(0, after).trimEnd()} actual constructor(${params})${header.slice(close + 1)}`;
    }
  }
  if (brace < 0) return `${head}${outHeader}`;
  const body = declText.slice(brace + 1, closing(m, brace));
  const members = actualBody(body, kind, targetLabel, notices);
  return `${head}${outHeader} {\n${[primaryAsSecondary, members].filter(Boolean).join('\n\n')}\n}`;
}

function actualBody(body: string, kind: string, target: string, notices: Notice[]): string {
  const m = mask(body);
  if (kind === 'enum class') {
    // Entries must match exactly; members after ';' become actual too.
    const semi = topLevelIndex(m, ';');
    const entries = (semi < 0 ? body : body.slice(0, semi)).trim();
    const rest = semi < 0 ? '' : membersOf(body.slice(semi + 1), target, notices);
    return `    ${entries}${rest ? `;\n\n${rest}` : ''}`;
  }
  return membersOf(body, target, notices, kind === 'interface');
}

function topLevelIndex(m: string, ch: string): number {
  let depth = 0;
  for (let i = 0; i < m.length; i++) {
    if ('({['.includes(m[i]!)) depth++;
    else if (')}]'.includes(m[i]!)) depth--;
    else if (m[i] === ch && depth === 0) return i;
  }
  return -1;
}

/** Splits a class body into member declarations and makes each actual. */
function membersOf(body: string, target: string, notices: Notice[], inInterface = false): string {
  const m = mask(body);
  const out: string[] = [];
  let i = 0;
  while (i < m.length) {
    const rel = m.slice(i).search(/\S/);
    if (rel < 0) break;
    const start = i + rel;
    const k = KIND.exec(m.slice(start));
    const ctor = /^(?:(?:@[\w.]+(?:\([^()]*\))?\s*|\b(?:public|internal|private|protected)\s+)*)constructor\s*\(/.exec(m.slice(start));
    if (ctor) {
      const open = start + ctor[0].length - 1;
      const close = closing(m, open);
      const { params } = stripDefaults(body.slice(open + 1, close));
      out.push(`    actual ${body.slice(start, open).replace(/constructor\s*$/, 'constructor').trim()}(${params})`);
      i = close + 1;
      continue;
    }
    if (!k) break;
    const kind = k[1]!.replace(/\s+/g, ' ') as Decl['kind'] | 'enum class' | 'annotation class';
    const kindAt = start + k.index;
    const end = declEnd(m, kindAt, kind === 'enum class' ? 'enum' : (kind as Decl['kind']));
    const text = body.slice(start, end).trim();
    // Members of an expect class are implicitly expect; give actualFor the keyword to replace.
    const withExpect = `expect ${text}`;
    out.push(
      actualFor(withExpect, target, notices, inInterface && !/\b(class|object|interface)\b/.test(KIND.exec(mask(text))?.[1] ?? ''))
        .split('\n')
        .map((l) => `    ${l}`)
        .join('\n'),
    );
    i = end;
  }
  return out.join('\n\n');
}

const firstLine = (s: string) => s.split('\n')[0]!.trim();
function name(decl: string): string {
  const m = /\b(?:fun|val|var)\s+(?:<[^>]*>\s*)?(?:[\w.<>?, ]+\.)?(\w+)/.exec(mask(decl));
  return m?.[1] ?? 'it';
}

export interface ParsedSource {
  packageName: string;
  imports: string[];
  expects: Decl[];
}

export function parseCommon(src: string): ParsedSource {
  const m = mask(src);
  const pkg = /^\s*package\s+([\w.]+)/m.exec(m);
  const imports = [...m.matchAll(/^\s*import\s+[\w.*]+(?:\s+as\s+\w+)?/gm)].map((x) => src.slice(x.index!, x.index! + x[0].length).trim());
  return { packageName: pkg?.[1] ?? '', imports, expects: findExpects(src, m) };
}

export interface GenerateOptions {
  /** File name in commonMain without .kt, e.g. "Platform". */
  fileName: string;
  /** Gradle module directory, e.g. "shared". */
  module: string;
  targets: Target[];
}

const dir = (module: string, sourceSet: string, pkg: string) => `${module}/src/${sourceSet}/kotlin/${pkg ? `${pkg.replace(/\./g, '/')}/` : ''}`;

/** Actual stubs for every expect declaration in `common`, one file per target. */
export function generateActuals(common: string, o: GenerateOptions): Generated {
  const parsed = parseCommon(common);
  const notices: Notice[] = [];
  if (!parsed.expects.length) notices.push({ level: 'error', text: 'No expect declarations found. Mark them with the expect keyword, e.g. expect fun platformName(): String' });
  if (!parsed.packageName) notices.push({ level: 'warning', text: 'No package line. Files in a module usually declare one, and actuals must be in the same package.' });
  const usesExpectClasses = parsed.expects.some((d) => !['fun', 'val', 'var'].includes(d.kind));
  const files: GeneratedFile[] = [{ path: `${dir(o.module, 'commonMain', parsed.packageName)}${o.fileName}.kt`, sourceSet: 'commonMain', content: common.trim() + '\n' }];
  for (const t of TARGETS.filter((x) => o.targets.includes(x.id))) {
    const targetNotices: Notice[] = [];
    const body = parsed.expects.map((d) => actualFor(d.text, t.label, targetNotices)).join('\n\n');
    if (t === TARGETS.find((x) => o.targets.includes(x.id))) notices.push(...targetNotices);
    const header = [parsed.packageName && `package ${parsed.packageName}`, parsed.imports.join('\n')].filter(Boolean).join('\n\n');
    files.push({ path: `${dir(o.module, t.sourceSet, parsed.packageName)}${o.fileName}.${t.suffix}.kt`, sourceSet: t.sourceSet, content: `${header ? `${header}\n\n` : ''}${body}\n` });
  }
  return { files, notices: dedupe(notices), usesExpectClasses };
}

function dedupe(n: Notice[]): Notice[] {
  const seen = new Set<string>();
  return n.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
}

/** Gradle snippet that silences the Beta warning for expect/actual classes. */
export const EXPECT_ACTUAL_CLASSES_FLAG = `kotlin {
    compilerOptions {
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }
}`;
