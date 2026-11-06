/**
 * A small parser for the Kotlin declarations an iOS framework exports: classes,
 * interfaces, objects, enums, functions and properties with their signatures.
 * Bodies are skipped. It isn't a Kotlin compiler; it reads well-formatted code.
 */
import { closing, mask, splitTopLevel } from '../kotlin-source/index.ts';

export interface KType {
  /** As written, without package qualifiers or `?`, e.g. `List`, `Result.Ok`, `T`. */
  name: string;
  args: KType[];
  nullable: boolean;
  /** Set for function types such as `(Int) -> Unit`. */
  fn?: { params: KType[]; ret: KType; suspend: boolean };
}

export interface TypeParam {
  name: string;
  bound?: KType;
}

export interface Param {
  name: string;
  type: KType;
  vararg: boolean;
  hasDefault: boolean;
  /** Constructor parameters declared with `val` or `var` are also properties. */
  prop?: 'val' | 'var';
}

interface Common {
  name: string;
  /** 1-based line of the declaration in the input. */
  line: number;
  /** The declaration's first line, for display. */
  text: string;
  /** `@ObjCName(swiftName = …)` or `@ObjCName("…")`. */
  objcName?: string;
  /** `@HiddenFromObjC`, or not public. */
  hidden: boolean;
}

export interface FunDecl extends Common {
  kind: 'fun';
  typeParams: TypeParam[];
  receiver?: KType;
  params: Param[];
  ret: KType;
  suspend: boolean;
  throws: boolean;
}

export interface PropDecl extends Common {
  kind: 'prop';
  type: KType;
  mutable: boolean;
  receiver?: KType;
  isConst: boolean;
}

export type ClassFlavor = 'class' | 'data' | 'enum' | 'sealed' | 'interface' | 'object' | 'value' | 'annotation';

export interface ClassDecl extends Common {
  kind: 'class';
  flavor: ClassFlavor;
  isAbstract: boolean;
  isInner: boolean;
  isCompanion: boolean;
  /** `sealed class` and `sealed interface`. */
  isSealed: boolean;
  /** `data object` and `object`. */
  isObject: boolean;
  typeParams: TypeParam[];
  /** Primary constructor, or null when the class has none written. */
  ctor: Param[] | null;
  secondary: Param[][];
  members: (FunDecl | PropDecl)[];
  nested: ClassDecl[];
  entries: string[];
  supers: string[];
}

export type Decl = FunDecl | PropDecl | ClassDecl;

export interface ParsedFile {
  packageName: string;
  decls: Decl[];
  typeAliases: Map<string, KType>;
}

const MODIFIERS = new Set([
  'public', 'internal', 'private', 'protected', 'open', 'final', 'abstract', 'override', 'data', 'sealed', 'enum', 'value',
  'inline', 'inner', 'suspend', 'const', 'lateinit', 'operator', 'infix', 'tailrec', 'external', 'annotation', 'companion',
  'expect', 'actual', 'noinline', 'crossinline', 'reified',
]);

const lastSegment = (name: string) => name.replace(/^(?:[a-z_][\w]*\.)+(?=[A-Z])/, '');

/** Parses a type such as `Map<String, List<Int?>>?` or `suspend (Int) -> Unit`. */
export function parseType(raw: string): KType {
  let s = raw.trim().replace(/^@\w+\s+/, '');
  let nullable = false;
  // `((Int) -> Unit)?`: strip the trailing ? and the wrapping parentheses.
  if (s.endsWith('?')) {
    const inner = s.slice(0, -1).trim();
    if (inner.startsWith('(') && closing(inner, 0) === inner.length - 1) {
      nullable = true;
      s = inner.slice(1, -1).trim();
    } else if (topLevelArrow(inner) < 0) {
      nullable = true;
      s = inner;
    }
  }
  const suspend = /^suspend\s/.test(s);
  if (suspend) s = s.replace(/^suspend\s+/, '');
  const arrow = topLevelArrow(s);
  if (arrow >= 0) {
    const left = s.slice(0, arrow).trim();
    const params = left.startsWith('(') ? left.slice(1, closing(left, 0)) : left;
    const list = params.trim() ? splitTopLevel(params).map((p) => parseType(p.includes(':') && !p.includes('->') ? p.slice(p.indexOf(':') + 1) : p)) : [];
    return { name: 'Function', args: [], nullable, fn: { params: list, ret: parseType(s.slice(arrow + 2)), suspend } };
  }
  const lt = s.indexOf('<');
  if (lt > 0) {
    const close = closing(s, lt);
    const args = splitTopLevel(s.slice(lt + 1, close)).map((a) => parseType(a.replace(/^\s*(?:out|in)\s+/, '').replace(/^\s*\*\s*$/, 'Any?')));
    return { name: lastSegment(s.slice(0, lt).trim()), args, nullable };
  }
  return { name: lastSegment(s), args: [], nullable };
}

function topLevelArrow(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length - 1; i++) {
    const c = s[i]!;
    if ('(<['.includes(c)) depth++;
    else if (')]'.includes(c) || (c === '>' && s[i - 1] !== '-')) depth--;
    else if (c === '-' && s[i + 1] === '>' && depth === 0) return i;
  }
  return -1;
}

function parseTypeParams(src: string): TypeParam[] {
  return splitTopLevel(src)
    .map((p) => p.trim().replace(/^(?:reified|out|in)\s+/, ''))
    .filter(Boolean)
    .map((p) => {
      const colon = p.indexOf(':');
      return colon < 0 ? { name: p } : { name: p.slice(0, colon).trim(), bound: parseType(p.slice(colon + 1)) };
    });
}

function parseParams(src: string, m: string): Param[] {
  if (!m.trim()) return [];
  const out: Param[] = [];
  let offset = 0;
  for (const piece of splitTopLevel(m)) {
    const text = src.slice(offset, offset + piece.length);
    offset += piece.length + 1;
    let t = text.trim();
    let mt = piece.trim();
    if (!t) continue;
    // Drop annotations and modifiers, remembering vararg and val/var.
    let vararg = false;
    let prop: 'val' | 'var' | undefined;
    let privateProp = false;
    for (;;) {
      const ann = /^@[\w.:]+/.exec(mt);
      if (ann) {
        let cut = ann[0].length;
        const paren = /^\s*\(/.exec(mt.slice(cut));
        if (paren) cut = closing(mt, cut + paren[0].length - 1) + 1;
        t = t.slice(cut).trim();
        mt = mt.slice(cut).trim();
        continue;
      }
      const word = /^(\w+)\s+/.exec(mt);
      if (word && (MODIFIERS.has(word[1]!) || word[1] === 'vararg' || word[1] === 'val' || word[1] === 'var')) {
        if (word[1] === 'vararg') vararg = true;
        if (word[1] === 'private' || word[1] === 'internal' || word[1] === 'protected') privateProp = true;
        if (word[1] === 'val' || word[1] === 'var') prop = word[1];
        t = t.slice(word[0].length).trim();
        mt = mt.slice(word[0].length).trim();
        continue;
      }
      break;
    }
    const colon = mt.indexOf(':');
    if (colon < 0) continue;
    const eq = topLevelIndex(mt, '=', colon);
    const typeEnd = eq < 0 ? t.length : eq;
    out.push({ name: t.slice(0, colon).trim().replace(/`/g, ''), type: parseType(t.slice(colon + 1, typeEnd)), vararg, hasDefault: eq >= 0, prop: privateProp ? undefined : prop });
  }
  return out;
}

function topLevelIndex(s: string, ch: string, from = 0): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i]!;
    if ('(<[{'.includes(c)) depth++;
    else if (')]}'.includes(c) || (c === '>' && s[i - 1] !== '-')) depth--;
    else if (c === ch && depth === 0 && !(ch === '=' && (s[i + 1] === '=' || s[i - 1] === '!' || s[i - 1] === '<' || s[i - 1] === '>'))) return i;
  }
  return -1;
}

interface Header {
  annotations: { name: string; args: string }[];
  mods: Set<string>;
  keyword: string;
  at: number;
}

const KEYWORDS = new Set(['fun', 'val', 'var', 'class', 'interface', 'object', 'typealias', 'constructor', 'init', 'import', 'package']);

class Parser {
  private src: string;
  private m: string;

  constructor(src: string, m: string) {
    this.src = src;
    this.m = m;
  }

  private lineOf(i: number) {
    let n = 1;
    for (let k = 0; k < i; k++) if (this.src[k] === '\n') n++;
    return n;
  }

  private firstLine(i: number) {
    const end = this.src.indexOf('\n', i);
    return this.src.slice(i, end < 0 ? undefined : end).trim();
  }

  private skipSpace(i: number, newlines = true): number {
    while (i < this.m.length && (this.m[i] === ' ' || this.m[i] === '\t' || this.m[i] === '\r' || (newlines && (this.m[i] === '\n' || this.m[i] === ';')))) i++;
    return i;
  }

  private word(i: number): { w: string; end: number } {
    const r = /^[A-Za-z_][\w]*/.exec(this.m.slice(i, i + 64));
    return r ? { w: r[0], end: i + r[0].length } : { w: '', end: i };
  }

  private header(i: number, end: number): Header | null {
    const annotations: { name: string; args: string }[] = [];
    const mods = new Set<string>();
    for (;;) {
      i = this.skipSpace(i);
      if (i >= end) return null;
      if (this.m[i] === '@') {
        const r = /^@[\w.:]+/.exec(this.m.slice(i, i + 80))!;
        let j = i + r[0].length;
        let args = '';
        const k = this.skipSpace(j, false);
        if (this.m[k] === '(') {
          const close = closing(this.m, k);
          args = this.src.slice(k + 1, close);
          j = close + 1;
        }
        annotations.push({ name: r[0].slice(1).replace(/^file:/, ''), args });
        i = j;
        continue;
      }
      const { w, end: we } = this.word(i);
      if (!w) return null;
      if (w === 'fun' && this.word(this.skipSpace(we)).w === 'interface') {
        mods.add('fun');
        i = this.skipSpace(we);
        continue;
      }
      if (KEYWORDS.has(w)) return { annotations, mods, keyword: w, at: we };
      if (MODIFIERS.has(w)) {
        mods.add(w);
        i = we;
        continue;
      }
      return null;
    }
  }

  /** End of an expression body or initializer: the newline that isn't followed by a continuation. */
  private skipExpression(i: number, end: number): number {
    while (i < end) {
      const c = this.m[i]!;
      if ('({['.includes(c)) {
        i = closing(this.m, i) + 1;
        continue;
      }
      if (c === '\n') {
        const next = this.skipSpace(i + 1, false);
        if (/^(\.|\?\.|\?:|&&|\|\||[+\-*/%]\s|->|else\b)/.test(this.m.slice(next, next + 5))) {
          i = next;
          continue;
        }
        return i;
      }
      if (c === '}' || c === ';') return i;
      i++;
    }
    return i;
  }

  private skipBody(i: number, end: number): number {
    i = this.skipSpace(i, false);
    if (this.m[i] === '{') return closing(this.m, i) + 1;
    if (this.m[i] === '=' || this.m.startsWith('by ', i)) return this.skipExpression(i + 1, end);
    return i;
  }

  /** Reads up to a stop character at depth 0, without crossing a newline at depth 0. */
  private until(i: number, end: number, stops: string): number {
    while (i < end) {
      const c = this.m[i]!;
      if (stops.includes(c)) return i;
      if (c === '\n' || c === ';') return i;
      if ('(<['.includes(c)) {
        i = closing(this.m, i) + 1;
        continue;
      }
      i++;
    }
    return i;
  }

  private objcName(h: Header): string | undefined {
    const a = h.annotations.find((x) => x.name === 'ObjCName' || x.name.endsWith('.ObjCName'));
    if (!a) return undefined;
    const swift = /swiftName\s*=\s*"([^"]+)"/.exec(a.args);
    if (swift) return swift[1];
    const first = /^\s*(?:name\s*=\s*)?"([^"]+)"/.exec(a.args);
    return first?.[1];
  }

  private hidden(h: Header) {
    return h.mods.has('private') || h.mods.has('internal') || h.mods.has('protected') || h.annotations.some((a) => a.name === 'HiddenFromObjC' || a.name.endsWith('.HiddenFromObjC'));
  }

  parse(start: number, end: number, aliases: Map<string, KType>, owner?: ClassDecl): Decl[] {
    const out: Decl[] = [];
    let i = start;
    while (i < end) {
      const declStart = this.skipSpace(i);
      if (declStart >= end) break;
      const h = this.header(declStart, end);
      if (!h) {
        // Not a declaration we model (statement, enum entry list, stray token): skip the line.
        const nl = this.until(declStart, end, '{');
        i = this.m[nl] === '{' ? closing(this.m, nl) + 1 : nl + 1;
        continue;
      }
      const common = { line: this.lineOf(declStart), text: this.firstLine(declStart), objcName: this.objcName(h), hidden: this.hidden(h) };
      let j = this.skipSpace(h.at, false);
      switch (h.keyword) {
        case 'package':
        case 'import':
          i = this.until(j, end, '') + 1;
          break;
        case 'typealias': {
          const eq = this.m.indexOf('=', j);
          const name = this.src.slice(j, eq).trim().replace(/<.*$/, '');
          const stop = this.until(eq + 1, end, '');
          aliases.set(name, parseType(this.src.slice(eq + 1, stop)));
          i = stop + 1;
          break;
        }
        case 'init':
          i = this.skipBody(j, end);
          break;
        case 'constructor': {
          const close = closing(this.m, j);
          const params = parseParams(this.src.slice(j + 1, close), this.m.slice(j + 1, close));
          if (owner && !common.hidden) owner.secondary.push(params);
          let k = this.skipSpace(close + 1, false);
          if (this.m[k] === ':') k = this.until(k + 1, end, '{');
          i = this.skipBody(k, end);
          break;
        }
        case 'fun': {
          let typeParams: TypeParam[] = [];
          if (this.m[j] === '<') {
            const close = closing(this.m, j);
            typeParams = parseTypeParams(this.src.slice(j + 1, close));
            j = this.skipSpace(close + 1, false);
          }
          const paren = this.until(j, end, '(');
          const head = this.src.slice(j, paren).trim();
          const dot = lastTopLevelDot(head);
          const receiver = dot >= 0 ? parseType(head.slice(0, dot)) : undefined;
          const name = (dot >= 0 ? head.slice(dot + 1) : head).replace(/`/g, '').trim();
          const close = closing(this.m, paren);
          const params = parseParams(this.src.slice(paren + 1, close), this.m.slice(paren + 1, close));
          let k = this.skipSpace(close + 1, false);
          let ret: KType = { name: 'Unit', args: [], nullable: false };
          if (this.m[k] === ':') {
            const stop = this.until(k + 1, end, '{=');
            ret = parseType(this.src.slice(k + 1, stop).replace(/\bwhere\b.*$/, ''));
            k = stop;
          }
          i = this.skipBody(k, end);
          const throws = h.annotations.some((a) => a.name === 'Throws' || a.name.endsWith('.Throws'));
          out.push({ kind: 'fun', name, typeParams, receiver, params, ret, suspend: h.mods.has('suspend'), throws, ...common, hidden: common.hidden || (h.mods.has('override') && ['toString', 'equals', 'hashCode'].includes(name)) });
          break;
        }
        case 'val':
        case 'var': {
          if (this.m[j] === '<') j = this.skipSpace(closing(this.m, j) + 1, false);
          const colon = this.until(j, end, ':=');
          const head = this.src.slice(j, colon).trim();
          const dot = lastTopLevelDot(head);
          const receiver = dot >= 0 ? parseType(head.slice(0, dot)) : undefined;
          const name = (dot >= 0 ? head.slice(dot + 1) : head).replace(/`/g, '').trim();
          let type: KType = { name: 'Any', args: [], nullable: true };
          let k = colon;
          if (this.m[colon] === '=') type = inferLiteral(this.src.slice(colon + 1, this.skipExpression(colon + 1, end))) ?? type;
          if (this.m[colon] === ':') {
            let stop = this.until(colon + 1, end, '=');
            // `val x: Int get() = …` on one line: the type ends before the accessor.
            const acc = /\s(?:get|set)\s*\(/.exec(this.m.slice(colon + 1, stop));
            if (acc) stop = colon + 1 + acc.index;
            type = parseType(this.src.slice(colon + 1, stop).replace(/\bby\b.*$/, ''));
            k = stop;
          }
          k = this.skipBody(k, end);
          // Accessors on the following lines: `get() = …`, `set(value) { … }`, `private set`.
          for (;;) {
            const n = this.skipSpace(k);
            const acc = /^(?:(?:private|internal|protected)\s+)?(?:get|set)\b/.exec(this.m.slice(n, n + 40));
            if (!acc) break;
            let p = this.skipSpace(n + acc[0].length, false);
            if (this.m[p] === '(') p = this.skipSpace(closing(this.m, p) + 1, false);
            if (this.m[p] === ':') p = this.until(p + 1, end, '={');
            const after = this.skipBody(p, end);
            k = after > p ? after : this.until(p, end, '');
          }
          i = k;
          out.push({ kind: 'prop', name, type, mutable: h.keyword === 'var', receiver, isConst: h.mods.has('const'), ...common });
          break;
        }
        case 'class':
        case 'interface':
        case 'object': {
          const { w: rawName, end: ne } = this.word(j);
          const isCompanion = h.mods.has('companion');
          const name = h.keyword === 'object' && (!rawName || rawName === 'Companion') && isCompanion ? 'Companion' : rawName;
          let k = rawName ? ne : j;
          let typeParams: TypeParam[] = [];
          k = this.skipSpace(k, false);
          if (this.m[k] === '<') {
            const close = closing(this.m, k);
            typeParams = parseTypeParams(this.src.slice(k + 1, close));
            k = this.skipSpace(close + 1, false);
          }
          let ctor: Param[] | null = null;
          let ctorHidden = false;
          const ctorHead = /^((?:@[\w.]+(?:\([^)]*\))?\s*|(?:private|internal|protected|public)\s+)*)constructor\s*/.exec(this.m.slice(k, k + 200));
          if (ctorHead) {
            ctorHidden = /\b(private|internal|protected)\b/.test(ctorHead[1] ?? '');
            k += ctorHead[0].length;
          }
          if (this.m[k] === '(') {
            const close = closing(this.m, k);
            ctor = parseParams(this.src.slice(k + 1, close), this.m.slice(k + 1, close));
            k = this.skipSpace(close + 1, false);
          }
          let supers: string[] = [];
          if (this.m[k] === ':') {
            const stop = this.until(k + 1, end, '{');
            supers = splitTopLevel(this.src.slice(k + 1, stop)).map((s) => s.trim().replace(/\(.*$/s, '').replace(/<.*$/s, '').trim()).filter(Boolean);
            k = stop;
          }
          const flavor: ClassFlavor =
            h.keyword === 'interface' ? 'interface'
            : h.mods.has('enum') ? 'enum'
            : h.mods.has('annotation') ? 'annotation'
            : h.mods.has('sealed') ? 'sealed'
            : h.mods.has('value') || h.mods.has('inline') ? 'value'
            : h.mods.has('data') ? 'data'
            : h.keyword === 'object' ? 'object'
            : 'class';
          const decl: ClassDecl = {
            kind: 'class', name, flavor, isAbstract: h.mods.has('abstract') || flavor === 'sealed', isInner: h.mods.has('inner'), isCompanion, isSealed: h.mods.has('sealed'),
            isObject: h.keyword === 'object', typeParams, ctor: ctorHidden ? [] : ctor, secondary: [], members: [], nested: [], entries: [], supers, ...common,
          };
          k = this.skipSpace(k, false);
          if (this.m[k] === '{') {
            const close = closing(this.m, k);
            let bodyStart = k + 1;
            if (flavor === 'enum') {
              const semi = topLevelIndex(this.m.slice(bodyStart, close), ';');
              const entriesEnd = semi < 0 ? close : bodyStart + semi;
              decl.entries = splitTopLevel(this.m.slice(bodyStart, entriesEnd))
                .map((e) => /^\s*(?:@\w+(?:\([^)]*\))?\s*)*([A-Za-z_]\w*)/.exec(e)?.[1])
                .filter((e): e is string => !!e);
              bodyStart = semi < 0 ? close : entriesEnd + 1;
            }
            for (const d of this.parse(bodyStart, close, aliases, decl)) {
              if (d.kind === 'class') {
                if (d.isCompanion) decl.nested.unshift(d);
                else decl.nested.push(d);
              } else decl.members.push(d);
            }
            i = close + 1;
          } else i = k;
          out.push(decl);
          break;
        }
        default:
          i = this.until(j, end, '') + 1;
      }
    }
    return out;
  }
}

/** The type of a simple initializer when none is written: `500`, `"x"`, `true`, `1L`, `2.5`, `1f`. */
function inferLiteral(expr: string): KType | null {
  const e = expr.trim();
  const t = (name: string): KType => ({ name, args: [], nullable: false });
  if (/^-?\d[\d_]*$/.test(e)) return t('Int');
  if (/^-?\d[\d_]*L$/.test(e)) return t('Long');
  if (/^-?\d[\d_]*u$/i.test(e)) return t('UInt');
  if (/^-?(\d[\d_]*)?\.\d+(e-?\d+)?$/i.test(e)) return t('Double');
  if (/^-?[\d.]+f$/i.test(e)) return t('Float');
  if (/^(true|false)$/.test(e)) return t('Boolean');
  if (/^"/.test(e)) return t('String');
  if (/^'.'$/.test(e)) return t('Char');
  return null;
}

function lastTopLevelDot(s: string): number {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if ('(<['.includes(c)) depth++;
    else if (')]'.includes(c) || (c === '>' && s[i - 1] !== '-')) depth--;
    else if (c === '.' && depth === 0) last = i;
  }
  return last;
}

export function parseKotlin(src: string): ParsedFile {
  const m = mask(src);
  const pkg = /^\s*package\s+([\w.]+)/m.exec(m);
  const aliases = new Map<string, KType>();
  const decls = new Parser(src, m).parse(0, m.length, aliases);
  return { packageName: pkg ? src.slice(pkg.index, pkg.index + pkg[0].length).replace(/^\s*package\s+/, '') : '', decls, typeAliases: aliases };
}
