/** DEX headers and class names, ELF load segment alignment, and the APK Signing Block. */

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
const u64 = (b: Uint8Array, o: number) => u32(b, o) + u32(b, o + 4) * 2 ** 32;

// ---------------------------------------------------------------------------
// DEX

export interface DexInfo {
  version: string;
  strings: number;
  types: number;
  fields: number;
  methods: number;
  classes: number;
  /** Defined classes as dotted names. */
  classNames: string[];
}

function uleb(b: Uint8Array, p: number): [number, number] {
  let result = 0;
  let shift = 0;
  let byte: number;
  do {
    byte = b[p++]!;
    result |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80 && shift < 35);
  return [result >>> 0, p];
}

/** MUTF-8 is UTF-8 for everything that appears in class names. */
function dexString(b: Uint8Array, stringIdsOff: number, idx: number): string {
  const dataOff = u32(b, stringIdsOff + idx * 4);
  const [, p] = uleb(b, dataOff);
  let end = p;
  while (b[end] !== 0) end++;
  return new TextDecoder().decode(b.subarray(p, end));
}

export function readDex(b: Uint8Array): DexInfo {
  const magic = new TextDecoder().decode(b.subarray(0, 8));
  if (!magic.startsWith('dex\n')) throw new Error('Not a DEX file.');
  const strings = u32(b, 56);
  const stringIdsOff = u32(b, 60);
  const types = u32(b, 64);
  const typeIdsOff = u32(b, 68);
  const fields = u32(b, 80);
  const methods = u32(b, 88);
  const classes = u32(b, 96);
  const classDefsOff = u32(b, 100);
  const classNames: string[] = [];
  for (let i = 0; i < classes; i++) {
    const typeIdx = u32(b, classDefsOff + i * 32);
    const descriptor = dexString(b, stringIdsOff, u32(b, typeIdsOff + typeIdx * 4));
    classNames.push(descriptor.replace(/^L|;$/g, '').replace(/\//g, '.'));
  }
  return { version: magic.slice(4, 7), strings, types, fields, methods, classes, classNames };
}

// ---------------------------------------------------------------------------
// ELF

export interface ElfInfo {
  bits: 32 | 64;
  machine: string;
  /** Smallest p_align of the PT_LOAD segments. */
  loadAlign: number;
}

const MACHINES: Record<number, string> = { 0x28: 'arm', 0xb7: 'arm64', 0x03: 'x86', 0x3e: 'x86_64', 0xf3: 'riscv' };

export function readElf(b: Uint8Array): ElfInfo | null {
  if (b[0] !== 0x7f || b[1] !== 0x45 || b[2] !== 0x4c || b[3] !== 0x46) return null;
  const bits = b[4] === 2 ? 64 : 32;
  const machine = MACHINES[u16(b, 18)] ?? `0x${u16(b, 18).toString(16)}`;
  const phoff = bits === 64 ? u64(b, 32) : u32(b, 28);
  const phentsize = u16(b, bits === 64 ? 54 : 42);
  const phnum = u16(b, bits === 64 ? 56 : 44);
  let loadAlign = Infinity;
  for (let i = 0; i < phnum; i++) {
    const h = phoff + i * phentsize;
    if (u32(b, h) !== 1) continue; // PT_LOAD
    const align = bits === 64 ? u64(b, h + 48) : u32(b, h + 28);
    loadAlign = Math.min(loadAlign, align);
  }
  return { bits, machine, loadAlign: Number.isFinite(loadAlign) ? loadAlign : 0 };
}

// ---------------------------------------------------------------------------
// APK Signing Block (v2, v3)

export const SIGNATURE_SCHEMES: Record<number, string> = { 0x7109871a: 'v2', 0xf05368c0: 'v3', 0x1b93ad61: 'v3.1' };

export interface SigningBlock {
  schemes: string[];
  /** DER of the first signer's first certificate, from v3 if present, else v2. */
  certificate?: Uint8Array;
}

/** Length-prefixed (uint32) sequence items. */
function lp(b: Uint8Array, p: number): Uint8Array {
  return b.subarray(p + 4, p + 4 + u32(b, p));
}

function firstCertificate(value: Uint8Array): Uint8Array | undefined {
  const signers = lp(value, 0);
  const signer = lp(signers, 0);
  const signedData = lp(signer, 0);
  const digests = lp(signedData, 0);
  const certificates = lp(signedData, 4 + digests.length);
  return certificates.length ? lp(certificates, 0) : undefined;
}

export function readSigningBlock(bytes: Uint8Array, centralDirectoryOffset: number): SigningBlock {
  const magicAt = centralDirectoryOffset - 16;
  if (magicAt < 8 || new TextDecoder().decode(bytes.subarray(magicAt, magicAt + 16)) !== 'APK Sig Block 42') return { schemes: [] };
  const size = u64(bytes, magicAt - 8);
  const start = centralDirectoryOffset - size - 8;
  const schemes: string[] = [];
  const values = new Map<number, Uint8Array>();
  let p = start + 8;
  while (p < magicAt - 8) {
    const len = u64(bytes, p);
    const id = u32(bytes, p + 8);
    values.set(id, bytes.subarray(p + 12, p + 8 + len));
    if (SIGNATURE_SCHEMES[id]) schemes.push(SIGNATURE_SCHEMES[id]);
    p += 8 + len;
  }
  const v = values.get(0xf05368c0) ?? values.get(0x7109871a);
  let certificate: Uint8Array | undefined;
  try {
    certificate = v ? firstCertificate(v) : undefined;
  } catch {
    certificate = undefined;
  }
  return { schemes, certificate };
}

export async function sha256Fingerprint(der: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', der as Uint8Array<ArrayBuffer>));
  return [...digest].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(':');
}
