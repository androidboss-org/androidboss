/** SVG / VectorDrawable path data: parsing, shape-to-path conversion, formatting. */

export interface PathCommand {
  cmd: string; // one of MmLlHhVvCcSsQqTtAaZz
  args: number[];
}

const ARITY: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

export class PathError extends Error {}

/** Tokenizes numbers the way SVG allows: "1.5.5" → 1.5 .5, "1e-3", "-2-3", arc flags "01". */
function* tokens(d: string): Generator<string> {
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  for (const m of d.matchAll(re)) yield m[0];
}

export function parsePath(d: string): PathCommand[] {
  const out: PathCommand[] = [];
  const list = [...tokens(d)];
  let i = 0;
  let cmd = '';
  while (i < list.length) {
    const t = list[i]!;
    if (/[A-Za-z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd.toLowerCase() === 'z') {
        out.push({ cmd, args: [] });
        continue;
      }
    } else if (!cmd) throw new PathError('Path data must start with a command (M).');
    const n = ARITY[cmd.toLowerCase()]!;
    const args: number[] = [];
    while (args.length < n) {
      const tok = list[i];
      if (tok === undefined || /[A-Za-z]/.test(tok)) throw new PathError(`"${cmd}" needs ${n} numbers.`);
      // Arc flags may be packed: "a5 5 0 0110 10" → 0 1 10.
      if (cmd.toLowerCase() === 'a' && (args.length === 3 || args.length === 4) && /^[01]\d/.test(tok)) {
        args.push(Number(tok[0]));
        list[i] = tok.slice(1);
        continue;
      }
      args.push(Number(tok));
      i++;
    }
    out.push({ cmd, args });
    // Extra pairs after M/m are implicit L/l.
    if (cmd === 'M') cmd = 'L';
    else if (cmd === 'm') cmd = 'l';
  }
  return out;
}

/** Compact number for path data: max 3 decimals, no trailing zeros. */
export function num(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

export function formatPath(cmds: PathCommand[]): string {
  return cmds.map((c) => c.cmd + c.args.map(num).join(',')).join('');
}

const n = (v: string | undefined, fallback = 0) => {
  const x = parseFloat(v ?? '');
  return Number.isFinite(x) ? x : fallback;
};

/** Converts SVG basic shapes to path data. Returns null for unknown elements. */
export function shapeToPath(name: string, a: Record<string, string>): string | null {
  switch (name) {
    case 'path':
      return a.d ?? '';
    case 'rect': {
      const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height);
      if (w <= 0 || h <= 0) return '';
      let rx = a.rx !== undefined ? n(a.rx) : a.ry !== undefined ? n(a.ry) : 0;
      let ry = a.ry !== undefined ? n(a.ry) : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (!rx || !ry) return `M${num(x)},${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`;
      return `M${num(x + rx)},${num(y)}h${num(w - 2 * rx)}a${num(rx)},${num(ry)} 0 0,1 ${num(rx)},${num(ry)}v${num(h - 2 * ry)}a${num(rx)},${num(ry)} 0 0,1 ${num(-rx)},${num(ry)}h${num(-(w - 2 * rx))}a${num(rx)},${num(ry)} 0 0,1 ${num(-rx)},${num(-ry)}v${num(-(h - 2 * ry))}a${num(rx)},${num(ry)} 0 0,1 ${num(rx)},${num(-ry)}z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = n(a.cx), cy = n(a.cy);
      const rx = name === 'circle' ? n(a.r) : n(a.rx);
      const ry = name === 'circle' ? n(a.r) : n(a.ry);
      if (rx <= 0 || ry <= 0) return '';
      return `M${num(cx - rx)},${num(cy)}a${num(rx)},${num(ry)} 0 1,0 ${num(rx * 2)},0a${num(rx)},${num(ry)} 0 1,0 ${num(-rx * 2)},0z`;
    }
    case 'line':
      return `M${num(n(a.x1))},${num(n(a.y1))}L${num(n(a.x2))},${num(n(a.y2))}`;
    case 'polyline':
    case 'polygon': {
      const pts = (a.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (pts.length < 4) return '';
      let d = `M${num(pts[0]!)},${num(pts[1]!)}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${num(pts[i]!)},${num(pts[i + 1]!)}`;
      return name === 'polygon' ? `${d}z` : d;
    }
    default:
      return null;
  }
}
