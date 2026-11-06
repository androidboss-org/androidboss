/**
 * Turns command-line options into a tool's arguments, using the JSON Schema the
 * MCP server publishes for that tool, so the CLI never needs its own copy of the
 * tool definitions.
 *
 *   --stack-trace @trace.txt   kebab-case or camelCase; @path reads a file, - reads stdin
 *   --targets android,ios      arrays: comma-separated or repeated
 *   --values.device pixel_9    one key of an object; or the whole object as JSON
 *   --json                     (not a tool option) print the structured result
 */

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  description?: string;
  minimum?: number;
  maximum?: number;
}

export interface Io {
  readFile(path: string): string;
  /** Standard input when something is piped in; undefined at a terminal. */
  readStdin(): string | undefined;
}

export class UsageError extends Error {}

export interface Parsed {
  args: Record<string, unknown>;
  json: boolean;
}

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const types = (s: JsonSchema | undefined): string[] => {
  if (!s) return [];
  if (s.anyOf) return s.anyOf.flatMap(types);
  if (Array.isArray(s.type)) return s.type;
  return s.type ? [s.type] : s.enum ? ['string'] : [];
};

function scalar(raw: string, schema: JsonSchema | undefined, flag: string): unknown {
  const t = types(schema);
  if (t.includes('integer') || t.includes('number')) {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(n)) throw new UsageError(`${flag} needs a number, not "${raw}".`);
    return n;
  }
  if (t.includes('boolean') && (raw === 'true' || raw === 'false')) return raw === 'true';
  if (t.includes('object') && /^\s*\{/.test(raw)) return parseJson(raw, flag);
  if (schema?.enum && !schema.enum.includes(raw)) throw new UsageError(`${flag} must be one of: ${schema.enum.join(', ')}.`);
  return raw;
}

function parseJson(raw: string, flag: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new UsageError(`${flag} isn't valid JSON.`);
  }
}

export function parseToolArgs(schema: JsonSchema, argv: string[], io: Io): Parsed {
  const props = schema.properties ?? {};
  const args: Record<string, unknown> = {};
  let json = false;
  let stdinUsed = false;
  const stdin = (flag: string) => {
    if (stdinUsed) throw new UsageError(`Only one option can read standard input (${flag}).`);
    stdinUsed = true;
    const text = io.readStdin();
    if (text === undefined) throw new UsageError(`${flag} is "-", but nothing was piped in.`);
    return text;
  };
  const resolve = (raw: string, flag: string) => {
    if (raw === '-') return stdin(flag);
    if (raw.startsWith('@@')) return raw.slice(1);
    if (raw.startsWith('@') && raw.length > 1) {
      try {
        return io.readFile(raw.slice(1));
      } catch (e) {
        throw new UsageError(`Can't read ${raw.slice(1)}: ${(e as Error).message}`);
      }
    }
    return raw;
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === '--json') {
      json = true;
      continue;
    }
    if (!token.startsWith('--')) throw new UsageError(`Unexpected "${token}". Options start with --; run "androidboss help <tool>".`);
    const [name, inline] = token.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    const [head, ...path] = name.split('.');
    const key = camel(head!);
    const prop = props[key];
    if (!prop) throw new UsageError(`Unknown option --${head}. Options: ${Object.keys(props).map((k) => `--${kebab(k)}`).join(', ') || 'none'}.`);
    const flag = `--${kebab(key)}`;
    const t = types(prop);

    // A boolean flag may stand alone.
    let raw = inline;
    if (raw === undefined) {
      const next = argv[i + 1];
      if (next === undefined || (next.startsWith('--') && next !== '--')) {
        if (t.includes('boolean') && !path.length) {
          args[key] = true;
          continue;
        }
        throw new UsageError(`${flag} needs a value.`);
      }
      raw = next;
      i++;
    }
    const value = resolve(raw, flag);

    if (path.length) {
      if (!t.includes('object')) throw new UsageError(`${flag} isn't an object, so --${head}.${path.join('.')} doesn't apply.`);
      const obj = (args[key] ??= {}) as Record<string, unknown>;
      const v = value === 'true' ? true : value === 'false' ? false : value;
      obj[path.join('.')] = v;
    } else if (t.includes('array')) {
      const list = (args[key] ??= []) as unknown[];
      if (/^\s*\[/.test(value)) {
        const parsed = parseJson(value, flag);
        if (!Array.isArray(parsed)) throw new UsageError(`${flag} needs a JSON array.`);
        list.push(...parsed);
      } else if (types(prop.items).includes('object')) {
        list.push(parseJson(value, flag));
      } else {
        list.push(...value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => scalar(s, prop.items, flag)));
      }
    } else if (t.includes('object')) {
      args[key] = parseJson(value, flag);
    } else {
      args[key] = scalar(value, prop, flag);
    }
  }

  // `cat trace.txt | androidboss retrace --mapping @mapping.txt`: piped input fills the one missing text option.
  const missing = (schema.required ?? []).filter((k) => args[k] === undefined);
  if (missing.length === 1 && !stdinUsed && types(props[missing[0]!]).includes('string') && !props[missing[0]!]!.enum) {
    const text = io.readStdin();
    if (text !== undefined) args[missing[0]!] = text;
  }
  const still = (schema.required ?? []).filter((k) => args[k] === undefined);
  if (still.length) throw new UsageError(`Missing ${still.map((k) => `--${kebab(k)}`).join(', ')}.`);
  return { args, json };
}

/** One line per option, for `androidboss help <tool>`. */
export function describeOptions(schema: JsonSchema): string[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([k, p]) => {
    const t = p.enum ? p.enum.join('|') : types(p).filter((x) => x !== 'null').join('|') || 'value';
    const item = p.items ? (p.items.enum ? p.items.enum.join('|') : types(p.items).join('|')) : '';
    const objectItems = types(p.items).includes('object');
    const kind = types(p).includes('array') ? (objectItems ? 'json' : `${item || 'value'},…`) : types(p).includes('object') ? 'json' : t;
    const shape = objectItems && p.items?.properties ? `\n      Each: {${Object.entries(p.items.properties).map(([f, s]) => `"${f}": ${s.enum ? s.enum.join('|') : types(s).join('|')}`).join(', ')}}. Repeat the option or pass a JSON array.` : types(p).includes('object') && !types(p).includes('array') ? `\n      As JSON, or one key at a time: --${kebab(k)}.<key> <value>.` : '';
    return `  --${kebab(k)} <${kind}>${required.has(k) ? '  (required)' : ''}${p.description ? `\n      ${p.description}` : ''}${shape}`;
  });
}
