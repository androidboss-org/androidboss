import { describe, expect, it } from 'vitest';
import { facadeName, parseKotlin, swiftEnumEntry, swiftInterop, swiftMethodName, typeTable } from './index.ts';
import { parseType } from './parse.ts';
import { EDGE_CASES, SAMPLE } from './samples.ts';


describe('names', () => {
  it('renames methods that clash with Objective-C method families', () => {
    expect(swiftMethodName('copy').name).toBe('doCopy');
    expect(swiftMethodName('copyAll').name).toBe('doCopyAll');
    expect(swiftMethodName('newItem').name).toBe('doNewItem');
    expect(swiftMethodName('newsFeed').name).toBe('newsFeed');
    expect(swiftMethodName('init').name).toBe('doInit');
    expect(swiftMethodName('initialize').name).toBe('initialize');
    expect(swiftMethodName('allocate').name).toBe('allocate');
    expect(swiftMethodName('mutableCopy').name).toBe('doMutableCopy');
    expect(swiftMethodName('hash').name).toBe('hash_');
  });

  it('turns enum entries into lower camel case', () => {
    expect(swiftEnumEntry('RED')).toBe('red');
    expect(swiftEnumEntry('DARK_GREEN')).toBe('darkGreen');
    expect(swiftEnumEntry('Blue')).toBe('blue');
    expect(swiftEnumEntry('SOME_value')).toBe('someValue');
  });

  it('names the file facade class', () => {
    expect(facadeName('Platform.kt')).toBe('PlatformKt');
    expect(facadeName('string_utils.kt')).toBe('String_utilsKt');
  });
});

describe('parser', () => {
  it('parses nullable and function types', () => {
    expect(parseType('Int?')).toMatchObject({ name: 'Int', nullable: true });
    expect(parseType('List<Int?>').args[0]).toMatchObject({ name: 'Int', nullable: true });
    const fn = parseType('((String) -> Unit)?');
    expect(fn.nullable).toBe(true);
    expect(fn.fn?.params[0]?.name).toBe('String');
    expect(parseType('suspend () -> Unit').fn?.suspend).toBe(true);
  });

  it('reads one-line class bodies and same-line accessors', () => {
    const [cls] = parseKotlin('interface Repo { fun get(id: String): String?; val size: Int }\nclass A { val ok: Boolean get() = true }').decls;
    expect(cls?.kind === 'class' && cls.members.map((m) => m.name)).toEqual(['get', 'size']);
    const a = parseKotlin('class A { val ok: Boolean get() = true }').decls[0];
    expect(a?.kind === 'class' && a.members[0]?.kind === 'prop' && a.members[0].type.name).toBe('Boolean');
  });

  it('keeps private constructor parameters out of the API', () => {
    const [cls] = parseKotlin('class VM(private val repo: Repo, val id: Int)').decls;
    expect(cls?.kind === 'class' && cls.ctor?.map((p) => p.prop)).toEqual([undefined, 'val']);
  });
});

describe('swiftInterop', () => {
  const r = swiftInterop(SAMPLE, { fileName: 'Shared.kt', module: 'Shared' });

  it('writes the calls Swift makes', () => {
    expect(r.swiftFile).toContain('let _ = User(id: 0, name: "", avatarUrl: nil)');
    expect(r.swiftFile).toContain('let _: Theme = Theme.light');
    expect(r.swiftFile).toContain('let _: LoadState = try await userViewModel.refresh(force: false)');
    expect(r.swiftFile).toContain('let _: String = SharedKt.formatCount(count: nil)');
    expect(r.swiftFile).toContain('let _: String = SharedKt.slugify("")');
    expect(r.swiftFile).toContain('Analytics.shared.track(event: "", props: [:])');
    expect(r.swiftFile).toContain('let _: Int32 = UserViewModel.companion.MAX_USERS');
    expect(r.swiftFile).toContain('final class SwiftUserRepository: NSObject, UserRepository {');
    expect(r.swiftFile).not.toContain('userViewModel.repo');
  });

  it('explains the gotchas', () => {
    const kinds = new Set(r.rows.flatMap((row) => row.notes.map((n) => n.kind)));
    for (const k of ['default-args', 'suspend', 'sealed-switch', 'enum-switch', 'object', 'static-extension', 'data-copy', 'interface'] as const) expect(kinds, k).toContain(k);
    expect(r.notes.map((n) => n.kind)).toContain('boxed');
    const refresh = r.rows.find((row) => row.kotlin.startsWith('suspend fun refresh'))!;
    expect(refresh.notes.find((n) => n.kind === 'default-args')?.text).toContain('`force`');
  });

  it('maps edge cases the way the compiler does', () => {
    const e = swiftInterop(EDGE_CASES, { fileName: 'Edge.kt', module: 'Shared' }).swiftFile;
    expect(e).toContain('let _: Int64 = EdgeKt.version()');
    expect(e).toContain('let _: KotlinDouble? = EdgeKt.maybe(n: nil, c: nil, l: nil, b: nil)');
    expect(e).toContain('let _: [Any] = EdgeKt.lists(');
    expect(e).toContain('EdgeKt.doInit()');
    expect(e).toContain('EdgeKt.allocate()');
    expect(e).toContain('EdgeKt.newsFeed()');
    expect(e).toContain('let _: Point = point.doCopy(scale: 0)');
    expect(e).toContain('let _: Int32 = point.sum');
    expect(e).toContain('let _: Mode = Mode.red');
    expect(e).toContain('Mode.darkGreen');
    expect(e).toContain('Mode.someValue');
    expect(e).toContain('EventClick(x: 0)');
    expect(e).toContain('let _: Int32 = weird.hash_()');
    expect(e).toContain('let _: String = weird.description_');
    expect(e).toContain('let _: Any = EdgeKt.useToken(t: "")');
    expect(e).toContain('let _ = Holder.Inner(holder)');
    expect(e).not.toContain('hiddenInternal');
    expect(e).not.toContain('HiddenClass');
  });
});

describe('typeTable', () => {
  it('matches the compiler for common types', () => {
    const t = Object.fromEntries(typeTable().map((r) => [r.kotlin, r]));
    expect(t.Int).toMatchObject({ swift: 'Int32', nullable: 'KotlinInt?' });
    expect(t.Char).toMatchObject({ swift: 'unichar', nullable: 'Any?' });
    expect(t['List<Int>']?.swift).toBe('[KotlinInt]');
    expect(t['(Int) -> Unit']?.swift).toBe('(KotlinInt) -> Void');
    expect(t['MutableMap<String, Int>']?.swift).toBe('KotlinMutableDictionary<NSString, KotlinInt>');
  });
});
