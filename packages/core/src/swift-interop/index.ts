/**
 * How Kotlin declarations read from Swift through a Kotlin/Native framework
 * (Objective-C export, the default). Every rule here was read off a real
 * framework header built with Kotlin 2.4.21, and the Swift this module writes
 * is type-checked with swiftc against that framework (swift-interop.kmp.test.ts).
 */
import { parseKotlin, parseType, type ClassDecl, type FunDecl, type KType, type Param, type PropDecl, type TypeParam } from './parse.ts';

export { parseKotlin } from './parse.ts';
export type { ClassDecl, Decl, FunDecl, KType, PropDecl } from './parse.ts';

export const SWIFT_INTEROP_CHECKED_WITH = { kotlin: '2.4.21', swift: '6.4.2', xcode: '27' } as const;

export type NoteKind =
  | 'int32' | 'boxed' | 'default-args' | 'suspend' | 'throws' | 'flow' | 'enum-switch' | 'sealed-switch' | 'erased-generic'
  | 'vararg' | 'value-class' | 'renamed' | 'static-extension' | 'closure-boxing' | 'suspend-lambda' | 'char' | 'unknown-type'
  | 'mutable-collection' | 'nullable-element' | 'object' | 'companion' | 'interface' | 'nothing' | 'data-copy' | 'nsobject-clash';

export interface Note {
  kind: NoteKind;
  level: 'warning' | 'info';
  text: string;
}

export interface Row {
  /** The Kotlin declaration's first line. */
  kotlin: string;
  line: number;
  /** How Swift calls or uses it. */
  swift: string;
  notes: Note[];
}

export interface InteropResult {
  rows: Row[];
  /** A Swift file that uses every exported declaration; it type-checks against the framework. */
  swiftFile: string;
  /** Notes that apply to the whole file, once each. */
  notes: Note[];
  /** Declarations that weren't exported (private, internal, @HiddenFromObjC). */
  hidden: string[];
}

export interface InteropOptions {
  /** Kotlin file name; top-level declarations live on `<FileName>Kt`. */
  fileName: string;
  /** Framework module name, used in `import`. */
  module: string;
}

const PRIMITIVES: Record<string, { value: string; box: string; zero: string; ctor: string }> = {
  Int: { value: 'Int32', box: 'KotlinInt', zero: '0', ctor: 'KotlinInt(int: 0)' },
  Long: { value: 'Int64', box: 'KotlinLong', zero: '0', ctor: 'KotlinLong(longLong: 0)' },
  Short: { value: 'Int16', box: 'KotlinShort', zero: '0', ctor: 'KotlinShort(short: 0)' },
  Byte: { value: 'Int8', box: 'KotlinByte', zero: '0', ctor: 'KotlinByte(char: 0)' },
  UInt: { value: 'UInt32', box: 'KotlinUInt', zero: '0', ctor: 'KotlinUInt(unsignedInt: 0)' },
  ULong: { value: 'UInt64', box: 'KotlinULong', zero: '0', ctor: 'KotlinULong(unsignedLongLong: 0)' },
  UShort: { value: 'UInt16', box: 'KotlinUShort', zero: '0', ctor: 'KotlinUShort(unsignedShort: 0)' },
  UByte: { value: 'UInt8', box: 'KotlinUByte', zero: '0', ctor: 'KotlinUByte(unsignedChar: 0)' },
  Float: { value: 'Float', box: 'KotlinFloat', zero: '0', ctor: 'KotlinFloat(float: 0)' },
  Double: { value: 'Double', box: 'KotlinDouble', zero: '0', ctor: 'KotlinDouble(double: 0)' },
  Boolean: { value: 'Bool', box: 'KotlinBoolean', zero: 'false', ctor: 'KotlinBoolean(bool: false)' },
};

/** NSObject class methods that a top-level property can collide with. */
const NSOBJECT_CLASS_METHODS = new Set(['version']);

const PRIMITIVE_ARRAYS = new Set(['ByteArray', 'IntArray', 'LongArray', 'ShortArray', 'FloatArray', 'DoubleArray', 'BooleanArray', 'CharArray', 'UByteArray', 'UIntArray', 'ULongArray', 'UShortArray']);
const FLOWS: Record<string, string> = { Flow: 'Kotlinx_coroutines_coreFlow', StateFlow: 'Kotlinx_coroutines_coreStateFlow', SharedFlow: 'Kotlinx_coroutines_coreSharedFlow', MutableStateFlow: 'Kotlinx_coroutines_coreMutableStateFlow', MutableSharedFlow: 'Kotlinx_coroutines_coreMutableSharedFlow' };
const LISTS = new Set(['List', 'Collection', 'Iterable']);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** `copy`, `newItem`, `init`, `alloc` and `mutableCopy` clash with Objective-C method families and get a `do` prefix. */
export function swiftMethodName(name: string): { name: string; renamed: boolean } {
  if (/^(?:init|alloc|copy|mutableCopy|new)(?![a-z0-9])/.test(name)) return { name: `do${cap(name)}`, renamed: true };
  if (name === 'hash' || name === 'description') return { name: `${name}_`, renamed: true };
  return { name, renamed: false };
}

/** `DARK_GREEN` → `darkGreen`, `Blue` → `blue`, `SOME_value` → `someValue`. */
export function swiftEnumEntry(name: string): string {
  if (name.includes('_') || name === name.toUpperCase()) {
    const parts = name.toLowerCase().split('_').filter(Boolean);
    return parts[0]! + parts.slice(1).map(cap).join('');
  }
  return lowerFirst(name);
}

/** Top-level declarations in `string_utils.kt` live on `String_utilsKt`. */
export function facadeName(fileName: string): string {
  const stem = fileName.replace(/\.kts?$/, '').replace(/^.*\//, '').replace(/[^A-Za-z0-9_]/g, '_');
  return `${cap(stem)}Kt`;
}

interface Scope {
  classes: Map<string, ClassDecl>;
  aliases: Map<string, KType>;
  /** Type parameters of the enclosing class: name → non-null bound. */
  classTypeParams: Map<string, boolean>;
  /** Type parameters of the function: erased. */
  funTypeParams: Set<string>;
  /** Type parameters of the enclosing interface: also erased. */
  interfaceTypeParams: Set<string>;
  notes: Set<NoteKind>;
  unknown: Set<string>;
}

type Pos = 'value' | 'element' | 'generic';

/** Swift spelling of a Kotlin type in a given position. */
function swiftType(t: KType, pos: Pos, sc: Scope): string {
  const alias = sc.aliases.get(t.name);
  if (alias && !t.args.length) return swiftType({ ...alias, nullable: alias.nullable || t.nullable }, pos, sc);
  // Only existentials need parentheses before `?`: (any Repo)?.
  const opt = (s: string) => (t.nullable ? `${s.startsWith('any ') ? `(${s})` : s}?` : s);

  if (t.fn) {
    if (t.fn.suspend) {
      sc.notes.add('suspend-lambda');
      return opt(`any KotlinSuspendFunction${t.fn.params.length}`);
    }
    if (t.fn.params.some((p) => PRIMITIVES[p.name]) || PRIMITIVES[t.fn.ret.name]) sc.notes.add('closure-boxing');
    const params = t.fn.params.map((p) => swiftType(p, 'element', sc)).join(', ');
    const ret = t.fn.ret.name === 'Unit' && !t.fn.ret.nullable ? 'Void' : swiftType(t.fn.ret, 'element', sc);
    return t.nullable ? `((${params}) -> ${ret})?` : `(${params}) -> ${ret}`;
  }

  const prim = PRIMITIVES[t.name];
  if (prim) {
    if (pos === 'value' && !t.nullable) {
      if (t.name === 'Int' || t.name === 'Long') sc.notes.add('int32');
      return prim.value;
    }
    sc.notes.add('boxed');
    return opt(prim.box);
  }
  switch (t.name) {
    case 'Char':
      sc.notes.add('char');
      return pos === 'value' && !t.nullable ? 'unichar' : t.nullable ? 'Any?' : 'Any';
    case 'String':
      return opt(pos === 'generic' ? 'NSString' : 'String');
    case 'Unit':
      return t.nullable ? 'KotlinUnit?' : 'Void';
    case 'Nothing':
      sc.notes.add('nothing');
      return 'Void';
    case 'Any':
      return opt(pos === 'generic' ? 'AnyObject' : 'Any');
  }
  if (LISTS.has(t.name)) {
    if (pos === 'generic') return opt('NSArray');
    const e = t.args[0];
    if (!e || e.nullable) {
      if (e?.nullable) sc.notes.add('nullable-element');
      return opt('[Any]');
    }
    return opt(`[${swiftType(e, 'element', sc)}]`);
  }
  if (t.name === 'Set') {
    if (pos === 'generic') return opt('NSSet');
    const e = t.args[0];
    if (!e || e.nullable) {
      if (e?.nullable) sc.notes.add('nullable-element');
      return opt('Set<AnyHashable>');
    }
    return opt(`Set<${swiftType(e, 'element', sc)}>`);
  }
  if (t.name === 'Map') {
    if (pos === 'generic') return opt('NSDictionary');
    const [k, v] = t.args;
    if (k?.nullable || v?.nullable) sc.notes.add('nullable-element');
    const key = !k || k.nullable ? 'AnyHashable' : swiftType(k, 'element', sc);
    const val = !v || v.nullable ? 'Any' : swiftType(v, 'element', sc);
    return opt(`[${key}: ${val}]`);
  }
  if (t.name === 'MutableList') {
    sc.notes.add('mutable-collection');
    return opt('NSMutableArray');
  }
  if (t.name === 'MutableSet') {
    sc.notes.add('mutable-collection');
    return opt(`KotlinMutableSet<${generic(t.args[0], sc)}>`);
  }
  if (t.name === 'MutableMap') {
    sc.notes.add('mutable-collection');
    return opt(`KotlinMutableDictionary<${generic(t.args[0], sc)}, ${generic(t.args[1], sc)}>`);
  }
  if (t.name === 'Array') return opt(`KotlinArray<${generic(t.args[0], sc)}>`);
  if (PRIMITIVE_ARRAYS.has(t.name)) return opt(`Kotlin${t.name}`);
  if (FLOWS[t.name]) {
    sc.notes.add('flow');
    return opt(`any ${FLOWS[t.name]}`);
  }

  // Type parameters.
  if (sc.funTypeParams.has(t.name) || sc.interfaceTypeParams.has(t.name)) {
    sc.notes.add('erased-generic');
    return pos === 'generic' ? 'AnyObject' : 'Any?';
  }
  if (sc.classTypeParams.has(t.name)) {
    // The examples instantiate generic classes with NSString, so T reads as NSString.
    // Without a non-null bound (`T : Any`), T is optional in Swift.
    const concrete = 'NSString';
    if (pos === 'generic') return concrete;
    return sc.classTypeParams.get(t.name)! && !t.nullable ? concrete : `${concrete}?`;
  }

  // Declarations from the same input.
  const cls = sc.classes.get(t.name);
  if (cls) {
    if (cls.flavor === 'value') {
      sc.notes.add('value-class');
      return t.nullable ? 'Any?' : 'Any';
    }
    if (cls.flavor === 'interface') {
      if (cls.typeParams.length) sc.notes.add('erased-generic');
      return t.nullable ? `(any ${t.name})?` : `any ${t.name}`;
    }
    const args = cls.typeParams.length ? `<${cls.typeParams.map((_, i) => generic(t.args[i], sc)).join(', ')}>` : '';
    return opt(`${t.name}${args}`);
  }

  sc.unknown.add(t.name);
  sc.notes.add('unknown-type');
  return opt(t.name);
}

/** A type argument of an Objective-C generic class: must be a class type. */
function generic(t: KType | undefined, sc: Scope): string {
  if (!t) return 'AnyObject';
  const s = swiftType({ ...t, nullable: false }, 'generic', sc);
  return s.startsWith('any ') || s === 'Any' ? 'AnyObject' : s;
}

/** A value of a Swift type, for the usage file. Returns null when it needs an instance from outside. */
function placeholder(swift: string, t: KType | undefined, sc: Scope): string | null {
  if (swift.endsWith('?')) return 'nil';
  if (/^(U?Int(8|16|32|64)|Float|Double|unichar)$/.test(swift)) return '0';
  if (swift === 'Bool') return 'false';
  if (swift === 'String' || swift === 'Any') return '""';
  if (swift === 'AnyObject') return 'NSObject()';
  if (swift.startsWith('[') && swift.includes(':')) return '[:]';
  if (swift.startsWith('[') || swift.startsWith('Set<')) return '[]';
  if (swift === 'NSMutableArray') return 'NSMutableArray()';
  if (/^KotlinMutable(Set|Dictionary)</.test(swift)) return `${swift}()`;
  if (/^Kotlin\w+Array$/.test(swift)) return `${swift}(size: 0)`;
  if (swift.startsWith('KotlinArray<')) return `${swift}(size: 0) { _ in nil }`;
  const box = Object.values(PRIMITIVES).find((p) => p.box === swift);
  if (box) return box.ctor;
  if (t?.fn?.suspend) return null;
  if (t?.fn) {
    const args = t.fn.params.length ? `${t.fn.params.map(() => '_').join(', ')} in ` : '';
    const retSwift = t.fn.ret.name === 'Unit' && !t.fn.ret.nullable ? 'Void' : swiftType(t.fn.ret, 'element', sc);
    const ret = retSwift === 'Void' ? '' : (placeholder(retSwift, t.fn.ret, sc) ?? 'nil');
    return `{ ${args}${ret} }`.replace('{  }', '{ }');
  }
  if (t) {
    const cls = sc.classes.get(t.name);
    if (cls?.flavor === 'enum' && cls.entries[0]) return `${t.name}.${swiftEnumEntry(cls.entries[0])}`;
    if (cls?.isObject) return `${swiftPath(cls, sc)}.shared`;
  }
  return null;
}

function swiftPath(cls: ClassDecl, sc: Scope): string {
  for (const [name, c] of sc.classes) if (c === cls) return name;
  return cls.name;
}

const NOTE_TEXT: Record<NoteKind, (x?: string) => Omit<Note, 'kind'>> = {
  int32: () => ({ level: 'info', text: 'Kotlin Int is Int32 and Long is Int64 in Swift. Swift’s own Int is 64-bit, so convert with Int(value) or Int32(value).' }),
  boxed: () => ({ level: 'info', text: 'Nullable numbers and Booleans, and numbers inside collections or closures, are boxed: Int? is KotlinInt?, a subclass of NSNumber. Read them with .int32Value, .boolValue and so on, and create them with KotlinInt(int: 1).' }),
  'default-args': (x) => ({ level: 'warning', text: `Default values aren’t exported: Swift must pass ${x}. Add a Kotlin overload without those parameters, or a Swift extension that fills them in.` }),
  suspend: () => ({ level: 'info', text: 'Suspend functions are called with try await (Swift 5.5+), or with a completionHandler. Without @Throws only CancellationException reaches Swift as an error; any other exception crashes the app.' }),
  throws: () => ({ level: 'info', text: '@Throws turns the listed exceptions (and subclasses) into Swift errors, so the call needs try. Other exceptions still crash.' }),
  flow: () => ({ level: 'warning', text: 'Swift can’t iterate a Flow: it arrives as a Kotlinx_coroutines_coreFlow protocol with a collect method that takes a FlowCollector. Use SKIE or KMP-NativeCoroutines to get an AsyncSequence, or Swift export (Alpha), which maps Flow to AsyncSequence.' }),
  'enum-switch': () => ({ level: 'warning', text: 'A Kotlin enum is a class in Swift, not a Swift enum: entries are static properties, and a switch over it needs a default case. SKIE or Swift export (Alpha) give a real Swift enum.' }),
  'sealed-switch': () => ({ level: 'warning', text: 'Swift can’t switch exhaustively over a sealed class: check subclasses with as? or is and keep a fallback. SKIE’s onEnum(of:) or Swift export (Alpha) give exhaustive switches.' }),
  'erased-generic': () => ({ level: 'warning', text: 'Generics on functions and interfaces are erased: the type parameter becomes Any? in Swift. Only classes keep their type parameters.' }),
  vararg: () => ({ level: 'info', text: 'vararg parameters take a KotlinArray in Swift, not a variadic list.' }),
  'value-class': () => ({ level: 'warning', text: 'Value (inline) classes are exported as their underlying value typed Any, so Swift loses the type. Use a regular class at the API boundary.' }),
  renamed: () => ({ level: 'info', text: 'Names that collide with Objective-C conventions are renamed: copy() is doCopy(), names starting with new, init, alloc or mutableCopy get a do prefix, and hash() and description become hash_() and description_. Use @ObjCName to choose your own.' }),
  'static-extension': () => ({ level: 'info', text: 'Extensions on String, collections, primitives, Any and interfaces become static functions on the file’s Kt class, with the receiver as the first, unlabeled argument. Extensions on your own classes stay instance members.' }),
  'closure-boxing': () => ({ level: 'info', text: 'Inside closures, numbers and Booleans are boxed: (Int) -> Unit is (KotlinInt) -> Void and (String) -> Boolean is (String) -> KotlinBoolean.' }),
  'suspend-lambda': () => ({ level: 'warning', text: 'A suspend lambda parameter becomes a KotlinSuspendFunction protocol that Swift can’t easily implement. Take a regular callback or return a value from a suspend function instead.' }),
  char: () => ({ level: 'info', text: 'Char is unichar (a UInt16 UTF-16 unit) in Swift, and Char? or a Char inside a collection is Any.' }),
  'unknown-type': (x) => ({ level: 'info', text: `${x} isn’t declared in this code. Classes from libraries get a prefix in Swift (kotlinx-datetime’s Instant is Kotlinx_datetimeInstant), unless you export the library. Check the framework header.` }),
  'mutable-collection': () => ({ level: 'info', text: 'Read-only List, Set and Map bridge to Swift arrays, sets and dictionaries. MutableList is NSMutableArray, and MutableSet and MutableMap are KotlinMutableSet and KotlinMutableDictionary.' }),
  'nullable-element': () => ({ level: 'info', text: 'Collections with nullable elements lose their element type: List<String?> is [Any] in Swift, and nulls arrive as NSNull.' }),
  object: () => ({ level: 'info', text: 'An object is a singleton: use .shared.' }),
  companion: () => ({ level: 'info', text: 'Companion members are on .companion, for example User.companion.guest().' }),
  interface: () => ({ level: 'info', text: 'Interfaces become Swift protocols, so Swift classes can implement them (subclass NSObject).' }),
  nothing: () => ({ level: 'info', text: 'Nothing as a return type is Void in Swift: Swift doesn’t know the call never returns.' }),
  'nsobject-clash': () => ({ level: 'warning', text: 'A top-level property named version clashes with NSObject’s version() class method, so Swift reads it as a method call on the file’s Kt class, like PlatformKt.version(). Rename it, or give it another Swift name with @ObjCName.' }),
  'data-copy': () => ({ level: 'info', text: 'Data classes keep equality (== uses isEqual), hash and description, and copy() becomes doCopy(…) with every parameter required.' }),
};

/** Shown once above the rows instead of on the first row that triggers them. */
const FILE_LEVEL = new Set<NoteKind>(['int32', 'boxed']);

function note(kind: NoteKind, x?: string): Note {
  return { kind, ...NOTE_TEXT[kind](x) };
}

function paramList(params: Param[], sc: Scope): { labels: string; args: string[]; needs: [string, string][] } {
  const args: string[] = [];
  const needs: [string, string][] = [];
  for (const p of params) {
    const swift = p.vararg ? `KotlinArray<${generic(p.type, sc)}>` : swiftType(p.type, 'value', sc);
    if (p.vararg) sc.notes.add('vararg');
    let value = placeholder(swift, p.vararg ? undefined : p.type, sc);
    if (value === null) {
      value = lowerFirst(swift.replace(/^any /, '').replace(/[<>.,\s?()]/g, ''));
      needs.push([value, swift]);
    }
    args.push(`${p.name}: ${value}`);
  }
  return { labels: params.map((p) => `${p.name}:`).join(''), args, needs };
}

function defaultsNote(params: Param[]): Note | null {
  const d = params.filter((p) => p.hasDefault).map((p) => p.name);
  return d.length ? note('default-args', d.map((x) => `\`${x}\``).join(', ')) : null;
}

/** Walks declarations, writing Swift statements and rows. */
class Writer {
  rows: Row[] = [];
  body: string[] = [];
  conformances: string[] = [];
  params = new Map<string, string>();
  hidden: string[] = [];

  private sc: Scope;
  private facade: string;

  constructor(sc: Scope, facade: string) {
    this.sc = sc;
    this.facade = facade;
  }

  private need(name: string, type: string) {
    if (!this.params.has(name)) this.params.set(name, type);
  }

  private instanceOf(cls: ClassDecl, path: string): string {
    if (cls.isObject) return `${path}.shared`;
    const name = lowerFirst(path.replace(/\./g, ''));
    const type = cls.flavor === 'interface' ? `any ${path}` : cls.typeParams.length ? `${path}<${cls.typeParams.map(() => 'NSString').join(', ')}>` : path;
    this.need(name, type);
    return name;
  }

  private emit(kotlin: { text: string; line: number }, swiftLines: string[], notes: Note[], statements = swiftLines) {
    this.rows.push({ kotlin: kotlin.text, line: kotlin.line, swift: swiftLines.join('\n'), notes });
    this.body.push(`    // ${kotlin.text}`, ...statements.map((s) => `    ${s}`));
  }

  private withNotes<T>(fn: () => T): { value: T; notes: Note[] } {
    const before = new Set(this.sc.notes);
    const value = fn();
    const notes = [...this.sc.notes].filter((k) => !before.has(k) && !FILE_LEVEL.has(k)).map((k) => note(k));
    return { value, notes };
  }

  fun(f: FunDecl, target: string | null, isStaticExt: boolean) {
    if (f.hidden) return void this.hidden.push(f.text);
    this.sc.funTypeParams = new Set(f.typeParams.map((t) => t.name));
    const notes: Note[] = [];
    const { value, notes: added } = this.withNotes(() => {
      const named = f.objcName ? { name: f.objcName, renamed: false } : swiftMethodName(f.name);
      const p = paramList(f.params, this.sc);
      for (const [n, t] of p.needs) this.need(n, t);
      let args = p.args;
      let recvNote = false;
      if (f.receiver && isStaticExt) {
        const recvSwift = swiftType(f.receiver, 'value', this.sc);
        const recv = placeholder(recvSwift, f.receiver, this.sc) ?? (() => {
          const n = lowerFirst(recvSwift.replace(/^any /, '').replace(/[<>.,\s?()]/g, ''));
          this.need(n, recvSwift);
          return n;
        })();
        args = [recv, ...args];
        recvNote = true;
      }
      const call = `${target ?? this.facade}.${named.name}(${args.join(', ')})`;
      const ret = f.ret.name === 'Unit' && !f.ret.nullable ? 'Void' : swiftType(f.ret, 'value', this.sc);
      const tryKw = f.suspend ? 'try await ' : f.throws ? 'try ' : '';
      const stmt = ret === 'Void' ? `${tryKw}${call}` : `let _: ${ret} = ${tryKw}${call}`;
      return { stmt, named, recvNote };
    });
    notes.push(...added);
    if (value.named.renamed) notes.push(note('renamed'));
    if (value.recvNote) notes.push(note('static-extension'));
    if (f.suspend) notes.push(note('suspend'));
    else if (f.throws) notes.push(note('throws'));
    const d = defaultsNote(f.params);
    if (d) notes.push(d);
    this.sc.funTypeParams = new Set();
    this.emit(f, [value.stmt], dedupe(notes));
  }

  /** With a sink, the statements join the caller's row (constructor properties) instead of getting their own. */
  prop(p: PropDecl, target: string | null, isStaticExt: boolean, sink?: string[]) {
    if (p.hidden) return void this.hidden.push(p.text);
    const { value, notes } = this.withNotes(() => {
      const name = p.objcName ?? (p.name === 'description' ? 'description_' : p.name);
      const type = swiftType(p.type, 'value', this.sc);
      const lines: string[] = [];
      if (p.receiver && isStaticExt) {
        // Extension properties on non-class receivers are exported as static functions.
        const recvSwift = swiftType(p.receiver, 'value', this.sc);
        const recv = placeholder(recvSwift, p.receiver, this.sc) ?? 'nil';
        lines.push(`let _: ${type} = ${this.facade}.${name}(${recv})`);
      } else {
        const owner = target ?? this.facade;
        // A top-level property is a class property on the Kt class. Named like an NSObject class
        // method (version), Swift imports it as that method instead.
        const clash = !target && NSOBJECT_CLASS_METHODS.has(name);
        lines.push(`let _: ${type} = ${owner}.${name}${clash ? '()' : ''}`);
        if (clash) this.sc.notes.add('nsobject-clash');
        if (p.mutable) {
          const v = placeholder(type, p.type, this.sc);
          if (v !== null) lines.push(`${owner}.${name} = ${v}`);
        }
      }
      return { lines, renamed: name !== p.name && !p.objcName };
    });
    const extra = [...notes];
    if (value.renamed) extra.push(note('renamed'));
    if (p.receiver && isStaticExt) extra.push(note('static-extension'));
    if (sink) sink.push(...value.lines);
    else this.emit(p, value.lines, dedupe(extra));
  }

  cls(c: ClassDecl, path: string) {
    if (c.hidden) return void this.hidden.push(c.text);
    if (c.flavor === 'value') {
      this.rows.push({ kotlin: c.text, line: c.line, swift: 'Any', notes: [note('value-class')] });
      return;
    }
    const sc = this.sc;
    const prevTypeParams = sc.classTypeParams;
    const prevErased = sc.interfaceTypeParams;
    if (c.flavor === 'interface') sc.interfaceTypeParams = new Set([...prevErased, ...c.typeParams.map((t) => t.name)]);
    else sc.classTypeParams = new Map(c.typeParams.map((t: TypeParam) => [t.name, !!t.bound && !t.bound.nullable]));
    const notes: Note[] = [];
    const lines: string[] = [];
    const before = new Set(sc.notes);

    if (c.flavor === 'enum') {
      const entries = c.entries.map((e) => `${path}.${swiftEnumEntry(e)}`);
      if (entries[0]) lines.push(`let _: ${path} = ${entries[0]}`);
      lines.push(`let _: [${path}] = ${path}.entries`);
      if (entries.length) {
        lines.push(`switch ${entries[0]} {`, ...entries.map((e) => `case ${e}: break`), 'default: break', '}');
      }
      notes.push(note('enum-switch'));
    } else if (c.flavor === 'interface') {
      if (c.isSealed) notes.push(note('sealed-switch'));
      else {
        notes.push(note('interface'));
        this.conformances.push(this.conformance(c, path));
      }
      if (c.typeParams.length) notes.push(note('erased-generic'));
    } else if (c.isObject && !c.isCompanion) {
      lines.push(`let _: ${path} = ${path}.shared`);
      notes.push(note('object'));
    } else if (c.flavor !== 'annotation' && !c.isCompanion) {
      if (c.flavor === 'sealed') notes.push(note('sealed-switch'));
      const ctors = c.isAbstract ? [] : [c.ctor ?? [], ...c.secondary];
      const typeArgs = c.typeParams.length ? `<${c.typeParams.map(() => 'NSString').join(', ')}>` : '';
      for (const params of ctors) {
        if (c.isInner) {
          lines.push(`let _ = ${path}(${this.instanceOf(sc.classes.get(path.split('.').slice(0, -1).join('.'))!, path.split('.').slice(0, -1).join('.'))})`);
          continue;
        }
        const p = paramList(params, sc);
        for (const [n, t] of p.needs) this.need(n, t);
        lines.push(`let _ = ${path}${typeArgs}(${p.args.join(', ')})`);
        const d = defaultsNote(params);
        if (d) notes.push(d);
      }
      if (c.flavor === 'data' && c.ctor?.length) {
        const self = this.instanceOf(c, path);
        const p = paramList(c.ctor, sc);
        lines.push(`let _: ${path}${typeArgs} = ${self}.doCopy(${p.args.join(', ')})`);
        notes.push(note('data-copy'));
      }
    }
    // Sealed subclasses: show the as? check from the parent.
    if (c.supers.length) {
      const parent = [...sc.classes.entries()].find(([n, p]) => p.isSealed && (c.supers.includes(n) || c.supers.includes(p.name)) && p !== c);
      if (parent) lines.push(`if let _ = ${this.instanceOf(parent[1], parent[0])} as? ${path} {}`);
    }
    for (const k of sc.notes) if (!before.has(k) && !FILE_LEVEL.has(k)) notes.push(note(k));
    // Properties declared in the constructor read like the class, so they join its row.
    if (c.flavor !== 'interface' && !c.isCompanion) {
      const self = c.isObject ? `${path}.shared` : this.instanceOf(c, path);
      for (const p of c.ctor ?? []) {
        if (!p.prop) continue;
        this.prop({ kind: 'prop', name: p.name, type: p.type, mutable: p.prop === 'var', isConst: false, line: c.line, text: '', hidden: false }, self, false, lines);
      }
    }
    for (const k of sc.notes) if (!before.has(k) && !FILE_LEVEL.has(k) && !notes.some((n) => n.kind === k)) notes.push(note(k));
    if (lines.length) this.emit(c, lines, dedupe(notes));
    else if (notes.length) this.rows.push({ kotlin: c.text, line: c.line, swift: c.flavor === 'interface' ? `protocol ${path}` : path, notes: dedupe(notes) });

    // Constructor properties and members.
    const self = c.isObject ? `${path}.shared` : null;
    const target = () => self ?? this.instanceOf(c, path);
    for (const m of c.members) {
      if (c.flavor === 'interface') {
        // Members are listed in the conformance; call them on an instance too.
        if (m.kind === 'fun') this.fun(m, target(), false);
        else this.prop(m, target(), false);
        continue;
      }
      if (m.kind === 'fun') this.fun(m, c.isCompanion ? path : target(), false);
      else this.prop(m, c.isCompanion ? path : target(), false);
    }
    for (const n of c.nested) {
      if (n.isCompanion) {
        const companion = `${path}.companion`;
        this.rows.push({ kotlin: n.text, line: n.line, swift: companion, notes: [note('companion')] });
        for (const m of n.members) {
          if (m.kind === 'fun') this.fun(m, companion, false);
          else this.prop(m, companion, false);
        }
      } else this.cls(n, nestedPath(c, path, n));
    }
    sc.classTypeParams = prevTypeParams;
    sc.interfaceTypeParams = prevErased;
  }

  /** A Swift class implementing a Kotlin interface: checks the protocol's requirements. */
  private conformance(c: ClassDecl, path: string): string {
    const sc = this.sc;
    const out = [`final class Swift${path.replace(/\./g, '')}: NSObject, ${path} {`];
    for (const m of c.members) {
      if (m.hidden) continue;
      if (m.kind === 'prop') {
        const type = swiftType(m.type, 'value', sc);
        const value = placeholder(type, m.type, sc);
        if (value === null) continue;
        out.push(m.mutable ? `    var ${m.name}: ${type} = ${value}` : `    var ${m.name}: ${type} { ${value} }`);
      } else if (!m.receiver) {
        sc.funTypeParams = new Set(m.typeParams.map((t) => t.name));
        const named = m.objcName ? { name: m.objcName } : swiftMethodName(m.name);
        const params = m.params.map((p) => `${p.name}: ${p.vararg ? `KotlinArray<${generic(p.type, sc)}>` : swiftType(p.type, 'value', sc)}`).join(', ');
        const ret = m.ret.name === 'Unit' && !m.ret.nullable ? 'Void' : swiftType(m.ret, 'value', sc);
        sc.funTypeParams = new Set();
        if (m.suspend) {
          const handlerArg = ret === 'Void' ? 'Error?' : `${ret.endsWith('?') ? ret : `${ret}?`}, Error?`;
          out.push(`    func ${named.name}(${params}${params ? ', ' : ''}completionHandler: @escaping (${handlerArg}) -> Void) { completionHandler(${ret === 'Void' ? 'nil' : 'nil, nil'}) }`);
          continue;
        }
        const value = ret === 'Void' ? null : placeholder(ret, m.ret, sc);
        if (ret !== 'Void' && value === null) continue;
        out.push(`    func ${named.name}(${params})${ret === 'Void' ? '' : ` -> ${ret}`} {${value === null ? '' : ` ${value} `}}`);
      }
    }
    out.push('}');
    return out.join('\n');
  }
}

function nestedPath(outer: ClassDecl, path: string, inner: ClassDecl): string {
  return outer.flavor === 'interface' ? `${path.replace(/\./g, '')}${inner.name}` : `${path}.${inner.name}`;
}

function dedupe(notes: Note[]): Note[] {
  const seen = new Set<string>();
  return notes.filter((n) => (seen.has(n.text) ? false : (seen.add(n.text), true)));
}

const BUILTIN_RECEIVERS = new Set([...Object.keys(PRIMITIVES), ...PRIMITIVE_ARRAYS, ...LISTS, 'Char', 'String', 'CharSequence', 'Any', 'Set', 'Map', 'MutableList', 'MutableSet', 'MutableMap', 'Array', 'Function', 'Unit', 'Nothing', 'Throwable', 'Exception', ...Object.keys(FLOWS)]);

/**
 * Extensions on a class become instance members in Swift; on built-in types, interfaces and value
 * classes they become static functions. A receiver that isn't declared in the input is assumed to
 * be a class.
 */
function isInstanceExtension(t: KType, classes: Map<string, ClassDecl>): boolean {
  if (t.fn || t.nullable || BUILTIN_RECEIVERS.has(t.name)) return false;
  const c = classes.get(t.name);
  return c ? c.flavor !== 'interface' && c.flavor !== 'value' : /^[A-Z]/.test(t.name);
}

export function swiftInterop(src: string, o: InteropOptions): InteropResult {
  const parsed = parseKotlin(src);
  const classes = new Map<string, ClassDecl>();
  const index = (c: ClassDecl, path: string) => {
    classes.set(path, c);
    if (!classes.has(c.name)) classes.set(c.name, c);
    // Classes nested in a class are Outer.Inner in Swift; nested in an interface they're flattened to OuterInner.
    for (const n of c.nested) if (!n.isCompanion) index(n, nestedPath(c, path, n));
  };
  for (const d of parsed.decls) if (d.kind === 'class') index(d, d.name);
  // Keep only qualified paths for iteration order; short names are lookup aliases.
  const sc: Scope = { classes, aliases: parsed.typeAliases, classTypeParams: new Map(), funTypeParams: new Set(), interfaceTypeParams: new Set(), notes: new Set(), unknown: new Set() };
  const facade = facadeName(o.fileName);
  const w = new Writer(sc, facade);

  for (const d of parsed.decls) {
    if (d.kind === 'class') w.cls(d, d.name);
    else if (d.kind === 'fun' || d.kind === 'prop') {
      if (d.receiver && isInstanceExtension(d.receiver, classes)) {
        const own = classes.get(d.receiver.name);
        const self = own?.isObject ? `${d.receiver.name}.shared` : lowerFirst(d.receiver.name.replace(/\./g, ''));
        if (!own?.isObject) w.params.set(self, d.receiver.name);
        if (d.kind === 'fun') w.fun(d, self, false);
        else w.prop(d, self, false);
      } else if (d.kind === 'fun') w.fun(d, null, !!d.receiver);
      else w.prop(d, null, !!d.receiver);
    }
  }

  const params = [...w.params].map(([n, t]) => `${n}: ${t}`).join(', ');
  const lines = [
    `import ${o.module}`,
    '',
    `// How the Kotlin API in ${o.fileName} reads from Swift, generated by androidboss.info.`,
    `// Every line type-checks against a framework built from the same Kotlin code.`,
    '',
    `func examples(${params}) async throws {`,
    ...w.body,
    '}',
    ...w.conformances.flatMap((c) => ['', c]),
    '',
  ];

  const fileNotes = (['int32', 'boxed'] as NoteKind[]).filter((k) => sc.notes.has(k)).map((k) => note(k));
  for (const u of sc.unknown) fileNotes.push(note('unknown-type', u));
  return { rows: w.rows, swiftFile: lines.join('\n'), notes: fileNotes, hidden: w.hidden };
}

/** The reference table on the page: Kotlin types and how Swift sees them, generated by the same rules. */
export function typeTable(): { kotlin: string; swift: string; nullable: string }[] {
  const sc: Scope = { classes: new Map(), aliases: new Map(), classTypeParams: new Map(), funTypeParams: new Set(), interfaceTypeParams: new Set(), notes: new Set(), unknown: new Set() };
  const rows = ['Int', 'Long', 'Short', 'Byte', 'UInt', 'ULong', 'Float', 'Double', 'Boolean', 'Char', 'String', 'Any', 'Unit', 'List<String>', 'List<Int>', 'Set<String>', 'Map<String, Int>', 'MutableList<String>', 'MutableMap<String, Int>', 'Array<String>', 'ByteArray', '(Int) -> Unit', '(String) -> Boolean', 'Flow<Int>'];
  return rows.map((k) => {
    const t = parseType(k);
    return { kotlin: k, swift: swiftType(t, 'value', sc), nullable: k === 'Unit' ? 'KotlinUnit?' : swiftType({ ...t, nullable: true }, 'value', sc) };
  });
}

