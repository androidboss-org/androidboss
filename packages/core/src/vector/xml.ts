/** Tiny XML parser for SVG and VectorDrawable files: elements, attributes, entities. */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

export class XmlError extends Error {}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });
}

export function parseXml(text: string): XmlElement {
  let i = 0;
  const root: XmlElement = { name: '#root', attrs: {}, children: [] };
  const stack: XmlElement[] = [root];

  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    i = lt;
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      i = end === -1 ? text.length : end + 3;
    } else if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i);
      i = end === -1 ? text.length : end + 3;
    } else if (text.startsWith('<?', i) || text.startsWith('<!', i)) {
      // Processing instruction or DOCTYPE (may contain an internal subset in [...]).
      let depth = 0;
      let j = i + 2;
      for (; j < text.length; j++) {
        if (text[j] === '[') depth++;
        else if (text[j] === ']') depth--;
        else if (text[j] === '>' && depth <= 0) break;
      }
      i = j + 1;
    } else if (text[i + 1] === '/') {
      const end = text.indexOf('>', i);
      const name = text.slice(i + 2, end).trim();
      const top = stack.pop();
      if (!top || top.name !== name) throw new XmlError(`Unexpected </${name}>`);
      i = end + 1;
    } else {
      const m = /^<([\w:.-]+)/.exec(text.slice(i, i + 200));
      if (!m) throw new XmlError(`Malformed tag near "${text.slice(i, i + 30)}"`);
      const el: XmlElement = { name: m[1]!, attrs: {}, children: [] };
      let j = i + m[0].length;
      const attrRe = /\s*([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')|\s*(\/?)>/y;
      let selfClosing = false;
      for (;;) {
        attrRe.lastIndex = j;
        const a = attrRe.exec(text);
        if (!a) throw new XmlError(`Malformed attributes in <${el.name}>`);
        j = attrRe.lastIndex;
        if (a[1]) el.attrs[a[1]] = decodeEntities(a[3] ?? a[4] ?? '');
        else {
          selfClosing = a[5] === '/';
          break;
        }
      }
      stack[stack.length - 1]!.children.push(el);
      if (!selfClosing) stack.push(el);
      i = j;
    }
  }
  if (stack.length !== 1) throw new XmlError(`Unclosed <${stack[stack.length - 1]!.name}>`);
  const first = root.children[0];
  if (!first) throw new XmlError('No XML element found.');
  return first;
}
