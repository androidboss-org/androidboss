/** Small helpers for scanning Kotlin source without a full parser, shared by the code generators. */

/** Same length as the input, with comments and string contents blanked, so structure can be scanned safely. */
export function mask(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === '"') {
      const raw = src.startsWith('"""', i);
      const close = raw ? '"""' : '"';
      let j = i + close.length;
      while (j < src.length && !src.startsWith(close, j)) j += !raw && src[j] === '\\' ? 2 : 1;
      const stop = Math.min(src.length, j + close.length);
      out += close + src.slice(i + close.length, j).replace(/[^\n]/g, ' ') + src.slice(j, stop);
      i = stop;
    } else if (c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== "'") j += src[j] === '\\' ? 2 : 1;
      out += `'${' '.repeat(Math.max(0, j - i - 1))}'`;
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Index of the bracket closing the one at `open`, in masked text. */
export function closing(m: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']', '<': '>' };
  const o = m[open]!;
  const c = pairs[o]!;
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (m[i] === o) depth++;
    else if (m[i] === c && !(o === '<' && m[i - 1] === '-')) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return m.length - 1;
}

/** Splits at top-level commas (outside (), <>, [], {}). */
export function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if ('(<[{'.includes(c)) depth++;
    else if (')]}'.includes(c) || (c === '>' && s[i - 1] !== '-')) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}
