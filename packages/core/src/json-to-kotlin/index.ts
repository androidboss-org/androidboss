import { className, propertyName, singular } from './naming.ts';

export type SerializationLibrary = 'kotlinx' | 'moshi' | 'gson' | 'none';

export interface JsonToKotlinOptions {
  /** Name of the top-level class. */
  rootName: string;
  library: SerializationLibrary;
  /** 'auto': nullable only when a value was null or missing in some samples. 'all': every property nullable. */
  nullability: 'auto' | 'all';
  /** Give nullable properties a `= null` default. */
  nullDefaults: boolean;
  /** Emit name annotations on every property, not just renamed ones. */
  annotateAll: boolean;
  /** Use `var` instead of `val`. */
  mutable: boolean;
  /** Optional package line. */
  packageName: string;
}

export const defaultJsonToKotlinOptions: JsonToKotlinOptions = {
  rootName: 'Root',
  library: 'kotlinx',
  nullability: 'auto',
  nullDefaults: true,
  annotateAll: false,
  mutable: false,
  packageName: '',
};

export interface JsonToKotlinResult {
  code: string;
  classCount: number;
  warnings: string[];
}

export class JsonToKotlinError extends Error {}

// ---------------------------------------------------------------------------
// Type inference

type Prim = 'String' | 'Int' | 'Long' | 'Double' | 'Boolean';

type Shape =
  | { kind: 'prim'; name: Prim }
  | { kind: 'null' } // only null seen
  | { kind: 'unknown' } // empty array items
  | { kind: 'mixed' } // incompatible types
  | { kind: 'nullable'; of: Shape }
  | { kind: 'list'; of: Shape }
  | { kind: 'obj'; fields: Map<string, Field> };

interface Field {
  shape: Shape;
  /** Missing from at least one merged sample. */
  optional: boolean;
}

const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;

function infer(value: unknown): Shape {
  if (value === null) return { kind: 'null' };
  if (typeof value === 'string') return { kind: 'prim', name: 'String' };
  if (typeof value === 'boolean') return { kind: 'prim', name: 'Boolean' };
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return { kind: 'prim', name: 'Double' };
    return { kind: 'prim', name: value >= INT_MIN && value <= INT_MAX ? 'Int' : 'Long' };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'list', of: { kind: 'unknown' } };
    return { kind: 'list', of: value.map(infer).reduce(merge) };
  }
  const fields = new Map<string, Field>();
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    fields.set(k, { shape: infer(v), optional: false });
  }
  return { kind: 'obj', fields };
}

function unwrap(s: Shape): { inner: Shape; nullable: boolean } {
  return s.kind === 'nullable' ? { inner: s.of, nullable: true } : { inner: s, nullable: false };
}

function nullable(s: Shape): Shape {
  return s.kind === 'nullable' || s.kind === 'null' ? s : { kind: 'nullable', of: s };
}

const NUMERIC_RANK: Partial<Record<Prim, number>> = { Int: 0, Long: 1, Double: 2 };
const RANKED: Prim[] = ['Int', 'Long', 'Double'];

function merge(a: Shape, b: Shape): Shape {
  if (a.kind === 'null') return nullable(b);
  if (b.kind === 'null') return nullable(a);
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;

  const ua = unwrap(a);
  const ub = unwrap(b);
  if (ua.nullable || ub.nullable) return nullable(merge(ua.inner, ub.inner));

  if (a.kind === 'prim' && b.kind === 'prim') {
    if (a.name === b.name) return a;
    const ra = NUMERIC_RANK[a.name];
    const rb = NUMERIC_RANK[b.name];
    if (ra !== undefined && rb !== undefined) return { kind: 'prim', name: RANKED[Math.max(ra, rb)]! };
    return { kind: 'mixed' };
  }
  if (a.kind === 'list' && b.kind === 'list') return { kind: 'list', of: merge(a.of, b.of) };
  if (a.kind === 'obj' && b.kind === 'obj') {
    const fields = new Map<string, Field>();
    for (const [k, fa] of a.fields) {
      const fb = b.fields.get(k);
      fields.set(k, fb ? { shape: merge(fa.shape, fb.shape), optional: fa.optional || fb.optional } : { ...fa, optional: true });
    }
    for (const [k, fb] of b.fields) if (!a.fields.has(k)) fields.set(k, { ...fb, optional: true });
    return { kind: 'obj', fields };
  }
  return { kind: 'mixed' };
}

// ---------------------------------------------------------------------------
// Rendering

interface RenderedClass {
  name: string;
  signature: string;
  body: string;
}

class Renderer {
  private readonly classes: (RenderedClass | null)[] = [];
  private readonly imports = new Set<string>();
  readonly warnings: string[] = [];
  private readonly o: JsonToKotlinOptions;

  constructor(options: JsonToKotlinOptions) {
    this.o = options;
  }

  private get dynamicType(): string {
    if (this.o.library === 'kotlinx') {
      this.imports.add('kotlinx.serialization.json.JsonElement');
      return 'JsonElement';
    }
    return 'Any';
  }

  /** Kotlin type for a shape; `hint` names nested classes. */
  type(shape: Shape, hint: string, path: string): string {
    switch (shape.kind) {
      case 'prim':
        return shape.name;
      case 'null':
        return `${this.dynamicType}?`;
      case 'unknown':
        return this.dynamicType;
      case 'mixed':
        this.warnings.push(`\`${path}\` holds values of different types; typed as ${this.dynamicType}.`);
        return this.dynamicType;
      case 'nullable':
        return `${this.type(shape.of, hint, path)}?`.replace(/\?\?$/, '?');
      case 'list':
        return `List<${this.type(shape.of, singular(hint), `${path}[]`)}>`;
      case 'obj':
        return this.renderClass(className(hint), shape, path);
    }
  }

  renderClass(baseName: string, shape: Extract<Shape, { kind: 'obj' }>, path: string): string {
    const slot = this.classes.length;
    this.classes.push(null);

    const { library, nullability, nullDefaults, annotateAll, mutable } = this.o;
    const keyword = mutable ? 'var' : 'val';
    const props: string[] = [];

    for (const [key, field] of shape.fields) {
      let type = this.type(field.shape, key, path ? `${path}.${key}` : key);
      if ((field.optional || nullability === 'all') && !type.endsWith('?')) type += '?';
      const name = propertyName(key);
      const renamed = name.replace(/`/g, '') !== key;
      const lines: string[] = [];
      if (renamed || annotateAll) {
        const ann = this.nameAnnotation(key);
        if (ann) lines.push(ann);
      }
      const def = nullDefaults && type.endsWith('?') ? ' = null' : '';
      lines.push(`${keyword} ${name}: ${type}${def},`);
      props.push(lines.map((l) => `    ${l}`).join('\n'));
    }

    const signature = props.join('\n');
    const existing = this.classes.find((c) => c && c.signature === signature && c.name.replace(/\d+$/, '') === baseName);
    if (existing) {
      this.classes[slot] = null;
      return existing.name;
    }

    let name = baseName;
    for (let i = 2; this.classes.some((c) => c?.name === name); i++) name = `${baseName}${i}`;

    const header: string[] = [];
    if (library === 'kotlinx') {
      this.imports.add('kotlinx.serialization.Serializable');
      header.push('@Serializable');
    } else if (library === 'moshi') {
      this.imports.add('com.squareup.moshi.JsonClass');
      header.push('@JsonClass(generateAdapter = true)');
    }
    const body = props.length
      ? `${header.join('\n')}${header.length ? '\n' : ''}data class ${name}(\n${signature}\n)`
      : `${header.join('\n')}${header.length ? '\n' : ''}class ${name}`;

    this.classes[slot] = { name, signature, body };
    return name;
  }

  private nameAnnotation(key: string): string | null {
    const quoted = JSON.stringify(key);
    switch (this.o.library) {
      case 'kotlinx':
        this.imports.add('kotlinx.serialization.SerialName');
        return `@SerialName(${quoted})`;
      case 'moshi':
        this.imports.add('com.squareup.moshi.Json');
        return `@Json(name = ${quoted})`;
      case 'gson':
        this.imports.add('com.google.gson.annotations.SerializedName');
        return `@SerializedName(${quoted})`;
      case 'none':
        return null;
    }
  }

  output(extra: string[]): { code: string; classCount: number } {
    const blocks: string[] = [];
    const pkg = this.o.packageName.trim();
    if (pkg) blocks.push(`package ${pkg}`);
    if (this.imports.size) blocks.push([...this.imports].sort().map((i) => `import ${i}`).join('\n'));
    blocks.push(...extra);
    const classes = this.classes.filter((c): c is RenderedClass => c !== null);
    blocks.push(...classes.map((c) => c.body));
    return { code: `${blocks.join('\n\n')}\n`, classCount: classes.length };
  }
}

/** Parses JSON text and returns Kotlin data classes for it. Throws JsonToKotlinError on bad input. */
export function jsonToKotlin(json: string, options: Partial<JsonToKotlinOptions> = {}): JsonToKotlinResult {
  const o = { ...defaultJsonToKotlinOptions, ...options };
  const rootName = className(o.rootName || 'Root');
  if (o.packageName.trim() && !/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*$/.test(o.packageName.trim())) {
    throw new JsonToKotlinError(`"${o.packageName}" is not a valid Kotlin package name.`);
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    throw new JsonToKotlinError(`Invalid JSON: ${(e as Error).message}`);
  }

  const shape = infer(value);
  const r = new Renderer(o);
  const extra: string[] = [];

  if (shape.kind === 'obj') {
    r.renderClass(rootName, shape, '');
  } else if (shape.kind === 'list') {
    const item = r.type(shape.of, `${rootName}Item`, '[]');
    extra.push(`typealias ${rootName} = List<${item}>`);
  } else {
    throw new JsonToKotlinError('The top level must be a JSON object or array.');
  }

  const { code, classCount } = r.output(extra);
  return { code, classCount, warnings: [...new Set(r.warnings)] };
}
