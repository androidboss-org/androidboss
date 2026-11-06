/** Read-only ZIP access for APKs and AABs: the central directory, entry data and offsets. */

export interface ZipEntryInfo {
  name: string;
  /** 0 = stored, 8 = deflated. */
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
  /** Where the entry's bytes start in the file (needed for alignment checks). */
  dataOffset: number;
}

export interface ZipFile {
  bytes: Uint8Array;
  entries: ZipEntryInfo[];
  /** Offset of the central directory; the APK Signing Block sits right before it. */
  centralDirectoryOffset: number;
}

export class ZipError extends Error {}

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

export function openZip(bytes: Uint8Array): ZipFile {
  // End of central directory: scan back over a possible comment (max 64 KB).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Not a ZIP file. APKs and AABs are ZIP archives.');
  const count = u16(bytes, eocd + 10);
  const cdOffset = u32(bytes, eocd + 16);
  const entries: ZipEntryInfo[] = [];
  const decoder = new TextDecoder();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== 0x02014b50) throw new ZipError('Broken central directory.');
    const method = u16(bytes, p + 10);
    const compressedSize = u32(bytes, p + 20);
    const size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const localHeaderOffset = u32(bytes, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // The local header has its own name and extra lengths (zipalign pads the extra field).
    const lNameLen = u16(bytes, localHeaderOffset + 26);
    const lExtraLen = u16(bytes, localHeaderOffset + 28);
    entries.push({ name, method, compressedSize, size, localHeaderOffset, dataOffset: localHeaderOffset + 30 + lNameLen + lExtraLen });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { bytes, entries, centralDirectoryOffset: cdOffset };
}

/** Uncompressed bytes of an entry. */
export async function readEntry(zip: ZipFile, entry: ZipEntryInfo): Promise<Uint8Array> {
  const raw = zip.bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new ZipError(`${entry.name} uses unsupported compression method ${entry.method}.`);
  const stream = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
