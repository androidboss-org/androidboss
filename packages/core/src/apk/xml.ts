/**
 * Android manifests inside packages: binary XML (AXML) in APKs, aapt2's
 * protobuf XmlNode in AABs. Both decode to the same small tree.
 */

export interface XAttr {
  /** 'android:name' style. */
  name: string;
  value: string;
}

export interface XNode {
  name: string;
  attrs: XAttr[];
  children: XNode[];
}

export class XmlDecodeError extends Error {}

const ANDROID_NS = 'http://schemas.android.com/apk/res/android';

/** Attribute names by resource id, for manifests whose string pool names were stripped. */
const ATTR_IDS: Record<number, string> = {
  0x01010003: 'name', 0x01010000: 'theme', 0x01010001: 'label', 0x01010002: 'icon', 0x0101000f: 'debuggable', 0x01010010: 'exported',
  0x0101020c: 'minSdkVersion', 0x0101021b: 'versionCode', 0x0101021c: 'versionName', 0x01010270: 'targetSdkVersion', 0x01010271: 'maxSdkVersion',
  0x01010280: 'allowBackup', 0x010104ec: 'usesCleartextTraffic', 0x01010527: 'networkSecurityConfig', 0x010102b7: 'extractNativeLibs',
  0x01010572: 'compileSdkVersion', 0x01010573: 'compileSdkVersionCodename', 0x01010599: 'foregroundServiceType', 0x0101054f: 'autoVerify',
};

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

function stringPool(b: Uint8Array, start: number): string[] {
  const count = u32(b, start + 8);
  const flags = u32(b, start + 16);
  const stringsStart = start + u32(b, start + 20);
  const utf8 = (flags & 0x100) !== 0;
  const out: string[] = [];
  const td8 = new TextDecoder('utf-8');
  const td16 = new TextDecoder('utf-16le');
  for (let i = 0; i < count; i++) {
    let p = stringsStart + u32(b, start + 28 + i * 4);
    if (utf8) {
      // Character count, then byte count; each 1 or 2 bytes.
      p += b[p]! & 0x80 ? 2 : 1;
      let len = b[p]!;
      if (len & 0x80) {
        len = ((len & 0x7f) << 8) | b[p + 1]!;
        p += 2;
      } else p += 1;
      out.push(td8.decode(b.subarray(p, p + len)));
    } else {
      let len = u16(b, p);
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | u16(b, p + 2);
        p += 4;
      } else p += 2;
      out.push(td16.decode(b.subarray(p, p + len * 2)));
    }
  }
  return out;
}

function typedValue(type: number, data: number, strings: string[]): string {
  switch (type) {
    case 0x03:
      return strings[data] ?? '';
    case 0x01:
      return `@0x${data.toString(16).padStart(8, '0')}`;
    case 0x02:
      return `?0x${data.toString(16).padStart(8, '0')}`;
    case 0x10:
      return String(data | 0);
    case 0x11:
      return `0x${data.toString(16)}`;
    case 0x12:
      return data !== 0 ? 'true' : 'false';
    case 0x04:
      return String(new Float32Array(new Uint32Array([data]).buffer)[0]);
    default:
      return type >= 0x1c && type <= 0x1f ? `#${data.toString(16).padStart(8, '0')}` : `0x${data.toString(16)}`;
  }
}

/** Decode binary XML (an APK's AndroidManifest.xml). */
export function decodeAxml(b: Uint8Array): XNode {
  if (u16(b, 0) !== 0x0003) throw new XmlDecodeError('Not binary XML.');
  let strings: string[] = [];
  let resIds: number[] = [];
  const prefixes = new Map<string, string>();
  const root: XNode = { name: '#root', attrs: [], children: [] };
  const stack: XNode[] = [root];
  let p = u16(b, 2);
  while (p + 8 <= b.length) {
    const type = u16(b, p);
    const headerSize = u16(b, p + 2);
    const size = u32(b, p + 4);
    if (size < 8) break;
    if (type === 0x0001) strings = stringPool(b, p);
    else if (type === 0x0180) resIds = Array.from({ length: (size - headerSize) / 4 }, (_, i) => u32(b, p + headerSize + i * 4));
    else if (type === 0x0100) prefixes.set(strings[u32(b, p + 20)] ?? '', strings[u32(b, p + 16)] ?? '');
    else if (type === 0x0102) {
      const name = strings[u32(b, p + 20)] ?? '';
      const attrStart = p + 16 + u16(b, p + 24);
      const attrSize = u16(b, p + 26);
      const attrCount = u16(b, p + 28);
      const node: XNode = { name, attrs: [], children: [] };
      for (let i = 0; i < attrCount; i++) {
        const a = attrStart + i * attrSize;
        const nsIdx = u32(b, a);
        const nameIdx = u32(b, a + 4);
        const raw = u32(b, a + 8);
        const dataType = b[a + 15]!;
        const data = u32(b, a + 16);
        let attrName = strings[nameIdx] ?? '';
        // Some shrinkers blank the names; the resource map still has the attribute id.
        if (!attrName && resIds[nameIdx] !== undefined) attrName = ATTR_IDS[resIds[nameIdx]!] ?? `0x${resIds[nameIdx]!.toString(16)}`;
        const ns = nsIdx === 0xffffffff ? '' : strings[nsIdx] ?? '';
        const prefix = ns ? (prefixes.get(ns) ?? (ns === ANDROID_NS ? 'android' : 'ns')) : '';
        node.attrs.push({ name: prefix ? `${prefix}:${attrName}` : attrName, value: raw !== 0xffffffff && dataType === 0x03 ? strings[raw] ?? '' : typedValue(dataType, data, strings) });
      }
      stack[stack.length - 1]!.children.push(node);
      stack.push(node);
    } else if (type === 0x0103) stack.pop();
    p += size;
  }
  const top = root.children[0];
  if (!top) throw new XmlDecodeError('No root element.');
  return top;
}

// ---------------------------------------------------------------------------
// Protobuf (AAB)

type Field = { wire: number; value: number | Uint8Array };

function readVarint(b: Uint8Array, p: number): [number, number] {
  let result = 0;
  let shift = 0;
  let byte: number;
  do {
    byte = b[p++]!;
    result += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return [result, p];
}

export function protoFields(b: Uint8Array): Map<number, Field[]> {
  const out = new Map<number, Field[]>();
  let p = 0;
  while (p < b.length) {
    const [key, p1] = readVarint(b, p);
    p = p1;
    const num = Math.floor(key / 8);
    const wire = key & 7;
    let value: number | Uint8Array;
    if (wire === 0) [value, p] = readVarint(b, p);
    else if (wire === 2) {
      const [len, p2] = readVarint(b, p);
      value = b.subarray(p2, p2 + len);
      p = p2 + len;
    } else if (wire === 5) {
      value = u32(b, p);
      p += 4;
    } else if (wire === 1) {
      value = u32(b, p);
      p += 8;
    } else throw new XmlDecodeError(`Unsupported protobuf wire type ${wire}.`);
    if (!out.has(num)) out.set(num, []);
    out.get(num)!.push({ wire, value });
  }
  return out;
}

const str = (f?: Field[]) => (f?.[0]?.value instanceof Uint8Array ? new TextDecoder().decode(f[0].value) : '');
const msg = (f?: Field[]) => (f?.[0]?.value instanceof Uint8Array ? protoFields(f[0].value) : undefined);

/** Value of a compiled attribute (aapt2 Item), when the original string is missing. */
function itemValue(item: Map<number, Field[]>): string {
  const ref = msg(item.get(1));
  if (ref) return ref.get(3)?.[0] ? `@${str(ref.get(3))}` : `@0x${Number(ref.get(2)?.[0]?.value ?? 0).toString(16)}`;
  if (item.get(2)) return str(msg(item.get(2))?.get(1));
  const prim = msg(item.get(7));
  if (prim) {
    for (const [num, fields] of prim) {
      const v = Number(fields[0]!.value);
      if (num === 8) return v ? 'true' : 'false';
      if (num === 6) return String(v | 0);
      if (num === 7) return `0x${v.toString(16)}`;
      return String(v);
    }
  }
  return '';
}

function protoNode(node: Map<number, Field[]>, prefixes: Map<string, string>): XNode | undefined {
  const el = msg(node.get(1));
  if (!el) return undefined;
  for (const nsDecl of el.get(1) ?? []) {
    const d = protoFields(nsDecl.value as Uint8Array);
    prefixes.set(str(d.get(2)), str(d.get(1)));
  }
  const attrs: XAttr[] = (el.get(4) ?? []).map((f) => {
    const a = protoFields(f.value as Uint8Array);
    const ns = str(a.get(1));
    const prefix = ns ? (prefixes.get(ns) ?? (ns === ANDROID_NS ? 'android' : 'ns')) : '';
    const item = msg(a.get(6));
    const value = str(a.get(3)) || (item ? itemValue(item) : '');
    return { name: prefix ? `${prefix}:${str(a.get(2))}` : str(a.get(2)), value };
  });
  const children = (el.get(5) ?? []).map((f) => protoNode(protoFields(f.value as Uint8Array), prefixes)).filter((n): n is XNode => !!n);
  return { name: str(el.get(3)), attrs, children };
}

/** Decode aapt2 protobuf XML (an AAB module's manifest). */
export function decodeProtoXml(b: Uint8Array): XNode {
  const node = protoNode(protoFields(b), new Map());
  if (!node) throw new XmlDecodeError('Not a protobuf XML node.');
  return node;
}

// ---------------------------------------------------------------------------

export function attr(n: XNode, name: string): string | undefined {
  return n.attrs.find((a) => a.name === name || a.name.endsWith(`:${name}`))?.value;
}

export function toXml(n: XNode, indent = ''): string {
  const attrs = n.attrs.map((a) => `\n${indent}    ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`).join('');
  if (!n.children.length) return `${indent}<${n.name}${attrs} />`;
  return `${indent}<${n.name}${attrs}>\n${n.children.map((c) => toXml(c, `${indent}    `)).join('\n')}\n${indent}</${n.name}>`;
}
